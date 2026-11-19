/* props.js — every hand-held / interactive prop of the dresser scene:
   hair dryer (+ ring stand + power cord), paddle brush (+ ceramic cup), tissue box (+ flying tissues),
   music-box jewellery box (+ twirling flower), three hair clips, pochette (hanging + worn),
   bath towel (draped on the head + hung on the chair), translucent demo finger.
   GF.createProps({low}) — see CONTRACT.md. three.js r160 global THREE. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var PI = Math.PI, TAU = PI * 2;

  // ------------------------------------------------------------------ small utils
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  function h2(x, y, s) {
    var n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s | 0, 1442695041) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  // periodic value noise (period px, py integer cells) for tileable textures
  function pnoise(x, y, px, py, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
    var a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function pfbm(x, y, px, py, oct, s) {
    var t = 0, a = 0.5, n = 0;
    for (var i = 0; i < oct; i++) { t += a * pnoise(x, y, px, py, s + i * 17); n += a; x *= 2; y *= 2; px *= 2; py *= 2; a *= 0.5; }
    return t / n;
  }
  function pixTex(w, h, fn, opts) {
    return GF.canvasTex(w, h, function (ctx) {
      var img = ctx.createImageData(w, h), d = img.data, o = [0, 0, 0, 255];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        o[3] = 255; fn(x, y, o);
        var k = (y * w + x) * 4;
        d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3];
      }
      ctx.putImageData(img, 0, 0);
    }, opts);
  }

  // ------------------------------------------------------------------ geometry helpers
  function paint(geo, r, g, b) {
    var n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  }
  function xf(geo, p, r, s) {
    var m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(p[0], p[1], p[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)),
      new THREE.Vector3(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
    geo.applyMatrix4(m);
    return geo;
  }
  function merge(list) {
    var nv = 0, ni = 0, i, k;
    for (i = 0; i < list.length; i++) {
      var g0 = list[i];
      if (!g0.attributes.normal) g0.computeVertexNormals();
      nv += g0.attributes.position.count;
      ni += g0.index ? g0.index.count : g0.attributes.position.count;
    }
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i], n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (g.attributes.color && g.attributes.color.itemSize === 3) col.set(g.attributes.color.array, vo * 3);
      else col.fill(1, vo * 3, (vo + n) * 3);
      if (g.index) { for (k = 0; k < g.index.count; k++) idx[io + k] = g.index.array[k] + vo; io += g.index.count; }
      else { for (k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
      vo += n;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  // superellipse point
  function sePt(th, a, b, n, out) {
    var c = Math.cos(th), s = Math.sin(th), e = 2 / n;
    out[0] = a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e);
    out[1] = b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), e);
    return out;
  }
  // average normals of coincident vertex groups (seam column / collapsed rows) of a W x H grid
  function fixGrid(geo, W, H, wrap) {
    var N = geo.attributes.normal.array, P = geo.attributes.position.array, i, j, k, x, y, z, l;
    if (wrap) for (j = 0; j < H; j++) {
      var a = j * W, b = j * W + W - 1;
      x = N[a * 3] + N[b * 3]; y = N[a * 3 + 1] + N[b * 3 + 1]; z = N[a * 3 + 2] + N[b * 3 + 2];
      l = Math.sqrt(x * x + y * y + z * z) || 1;
      N[a * 3] = N[b * 3] = x / l; N[a * 3 + 1] = N[b * 3 + 1] = y / l; N[a * 3 + 2] = N[b * 3 + 2] = z / l;
    }
    for (j = 0; j < H; j++) {
      var r0 = j * W, same = true;
      for (i = 1; i < W && same; i++) {
        k = r0 + i;
        if (Math.abs(P[k * 3] - P[r0 * 3]) + Math.abs(P[k * 3 + 1] - P[r0 * 3 + 1]) + Math.abs(P[k * 3 + 2] - P[r0 * 3 + 2]) > 1e-6) same = false;
      }
      if (!same) continue;
      x = y = z = 0;
      for (i = 0; i < W; i++) { k = r0 + i; x += N[k * 3]; y += N[k * 3 + 1]; z += N[k * 3 + 2]; }
      l = Math.sqrt(x * x + y * y + z * z) || 1;
      for (i = 0; i < W; i++) { k = r0 + i; N[k * 3] = x / l; N[k * 3 + 1] = y / l; N[k * 3 + 2] = z / l; }
    }
  }
  // generic parametric grid: fn(u, v, out[3]); normal = dP/du x dP/dv
  function gridGeo(nu, nv, fn, colFn, wrapU) {
    var W = nu + 1, H = nv + 1, n = W * H;
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = colFn ? new Float32Array(n * 3) : null;
    var o = [0, 0, 0], c = [1, 1, 1], i, j, k;
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      var u = i / nu, v = j / nv; k = j * W + i;
      fn(u, v, o);
      pos[k * 3] = o[0]; pos[k * 3 + 1] = o[1]; pos[k * 3 + 2] = o[2];
      uv[k * 2] = u; uv[k * 2 + 1] = v;
      if (colFn) { colFn(u, v, c); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
    }
    var idx = [];
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    fixGrid(g, W, H, wrapU);
    return g;
  }
  // loft through superellipse rings: {c:[x,y,z], u:[..], v:[..], a, b, n, s (shade)}; outward normal when rings progress along v x u
  function loft(rings, seg, flip) {
    var R = rings.length, W = seg + 1, n = R * W;
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), p = [0, 0], i, j;
    for (i = 0; i < R; i++) {
      var r = rings[i], c = r.c, u = r.u || [1, 0, 0], v = r.v || [0, 0, 1], sh = r.s === undefined ? 1 : r.s;
      var cr = r.col || [sh, sh, sh];
      for (j = 0; j < W; j++) {
        sePt(j / seg * TAU, r.a, r.b, r.n || 2, p);
        var k = i * W + j;
        pos[k * 3] = c[0] + u[0] * p[0] + v[0] * p[1];
        pos[k * 3 + 1] = c[1] + u[1] * p[0] + v[1] * p[1];
        pos[k * 3 + 2] = c[2] + u[2] * p[0] + v[2] * p[1];
        uv[k * 2] = j / seg; uv[k * 2 + 1] = i / (R - 1);
        col[k * 3] = cr[0]; col[k * 3 + 1] = cr[1]; col[k * 3 + 2] = cr[2];
      }
    }
    var idx = [];
    for (i = 0; i < R - 1; i++) for (j = 0; j < seg; j++) {
      var a = i * W + j, b = (i + 1) * W + j, c2 = i * W + j + 1, d = (i + 1) * W + j + 1;
      if (flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    fixGrid(g, W, R, true);
    return g;
  }
  // rounded box with exact rounded normals (m = segments per rounded edge)
  function rbox(w, h, d, r, m) {
    m = m || 3;
    r = Math.min(r, Math.min(w, h, d) * 0.4999);
    var s = 2 * m + 1, g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
    var P = g.attributes.position.array, N = g.attributes.normal.array, H = [w / 2, h / 2, d / 2], q = [0, 0, 0];
    function remap(t, half) {
      var k = Math.round((t + 0.5) * s);
      if (k <= m) return -half + r - r * Math.tan((m - k) / m * PI / 4);
      return half - r + r * Math.tan((k - m - 1) / m * PI / 4);
    }
    for (var i = 0; i < P.length; i += 3) {
      var ox = 0, oy = 0, oz = 0;
      for (var c = 0; c < 3; c++) q[c] = remap(P[i + c], H[c]);
      var ix = clamp(q[0], -H[0] + r, H[0] - r), iy = clamp(q[1], -H[1] + r, H[1] - r), iz = clamp(q[2], -H[2] + r, H[2] - r);
      ox = q[0] - ix; oy = q[1] - iy; oz = q[2] - iz;
      var l = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (l < 1e-9) { ox = N[i]; oy = N[i + 1]; oz = N[i + 2]; l = 1; }
      ox /= l; oy /= l; oz /= l;
      P[i] = ix + ox * r; P[i + 1] = iy + oy * r; P[i + 2] = iz + oz * r;
      N[i] = ox; N[i + 1] = oy; N[i + 2] = oz;
    }
    return g;
  }
  function lathe(pts, seg, phi0, phiL) {
    var v = [];
    for (var i = 0; i < pts.length; i++) v.push(new THREE.Vector2(pts[i][0], pts[i][1]));
    return new THREE.LatheGeometry(v, seg, phi0 || 0, phiL || TAU);
  }
  // flat band (strap) along points with given surface normals: rectangular section w x th
  function bandGeo(pts, nrm, w, th) {
    var n = pts.length, pos = new Float32Array(n * 8 * 3), nor = new Float32Array(n * 8 * 3), uv = new Float32Array(n * 8 * 2);
    var T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), i, f;
    // faces: [normal sign along N, along B] corners A,B (offset in (B,N) units)
    var faces = [
      { nb: 0, nn: 1, A: [-1, 1], Bc: [1, 1] },
      { nb: 0, nn: -1, A: [1, -1], Bc: [-1, -1] },
      { nb: 1, nn: 0, A: [1, 1], Bc: [1, -1] },
      { nb: -1, nn: 0, A: [-1, -1], Bc: [-1, 1] }
    ];
    var len = 0;
    for (i = 0; i < n; i++) {
      var p = pts[i], pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(n - 1, i + 1)];
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      T.subVectors(pb, pa).normalize();
      N.copy(nrm[i]); N.addScaledVector(T, -T.dot(N)).normalize();
      B.crossVectors(N, T).normalize();
      for (f = 0; f < 4; f++) {
        var F = faces[f];
        for (var c = 0; c < 2; c++) {
          var cc = c === 0 ? F.A : F.Bc, k = (i * 8 + f * 2 + c);
          pos[k * 3] = p.x + B.x * cc[0] * w / 2 + N.x * cc[1] * th / 2;
          pos[k * 3 + 1] = p.y + B.y * cc[0] * w / 2 + N.y * cc[1] * th / 2;
          pos[k * 3 + 2] = p.z + B.z * cc[0] * w / 2 + N.z * cc[1] * th / 2;
          nor[k * 3] = B.x * F.nb + N.x * F.nn; nor[k * 3 + 1] = B.y * F.nb + N.y * F.nn; nor[k * 3 + 2] = B.z * F.nb + N.z * F.nn;
          uv[k * 2] = c; uv[k * 2 + 1] = len / w;
        }
      }
    }
    var idx = [];
    for (i = 0; i < n - 1; i++) for (f = 0; f < 4; f++) {
      var a = i * 8 + f * 2, b = a + 1, a1 = a + 8, b1 = b + 8;
      idx.push(a, a1, b, b, a1, b1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  function mesh(geo, mat, cast, recv) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = cast !== false; m.receiveShadow = !!recv;
    return m;
  }
  function pose(obj) {
    obj.updateMatrixWorld(true);
    var p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    obj.matrixWorld.decompose(p, q, s);
    return { position: p, quaternion: q };
  }

  // ================================================================== factory
  GF.createProps = function (opts) {
    opts = opts || {};
    var low = !!opts.low;
    var POS = GF.POS;
    var root = new THREE.Group(); root.name = 'props';

    // ---------------------------------------------------------------- textures (6)
    var woodTex = pixTex(256, 256, function (x, y, o) {
      var u = x / 256, v = y / 256;
      var warp = pfbm(u * 2, v * 3, 2, 3, 3, 11);
      var ring = Math.sin((v * 14 + warp * 2.4) * TAU) * 0.5 + 0.5;
      ring = ring * ring * ring;
      var streak = pnoise(u * 6, v * 96, 6, 96, 5);
      var pore = pnoise(u * 32, v * 192, 32, 192, 9);
      var l = 0.90 - ring * 0.17 - streak * 0.07 - (pore > 0.78 ? (pore - 0.78) * 0.5 : 0);
      o[0] = 255 * l; o[1] = 255 * l * 0.84; o[2] = 255 * l * 0.66;
    }, { repeat: [1, 1] });
    var terryTex = pixTex(256, 256, function (x, y, o) {
      var u = x / 256, v = y / 256;
      var n = pnoise(u * 64, v * 64, 64, 64, 3) * 0.55 + pnoise(u * 128, v * 128, 128, 128, 4) * 0.25 + pnoise(u * 16, v * 16, 16, 16, 5) * 0.2;
      var c = 255 * clamp((n - 0.5) * 1.6 + 0.5, 0, 1); o[0] = o[1] = o[2] = c;
    }, { srgb: false, repeat: [1, 1] });
    var borderTex = GF.canvasTex(256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#f8ece6'; ctx.fillRect(0, 0, w, h);
      function band(x0) {
        ctx.fillStyle = '#f1dcd6'; ctx.fillRect(x0, 0, 15, h);
        ctx.fillStyle = '#e0b9b5'; ctx.fillRect(x0 + 1, 0, 2, h); ctx.fillRect(x0 + 12, 0, 2, h);
        ctx.fillStyle = '#ebcfca'; for (var y = 0; y < h; y += 4) { ctx.fillRect(x0 + 5, y, 2, 2); ctx.fillRect(x0 + 8, y + 2, 2, 2); }
      }
      band(10); band(w - 25);
      ctx.fillStyle = '#efdfd8'; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3); ctx.fillRect(0, 0, 3, h); ctx.fillRect(w - 3, 0, 3, h);
    });
    var leatherTex = pixTex(256, 256, function (x, y, o) {
      var u = x / 256, v = y / 256;
      var n = pfbm(u * 28, v * 28, 28, 28, 2, 21);
      var cr = Math.abs(pnoise(u * 9, v * 9, 9, 9, 23) - 0.5);
      var c = clamp(0.5 + (n - 0.5) * 1.5 - (cr < 0.03 ? (0.03 - cr) * 8 : 0), 0, 1) * 255;
      o[0] = o[1] = o[2] = c;
    }, { srgb: false, repeat: [1, 1] });
    var tissueTex = pixTex(128, 128, function (x, y, o) {
      var u = x / 128, v = y / 128;
      var c = 0.55 + 0.16 * Math.sin(u * TAU * 8) * Math.sin(v * TAU * 8) + 0.25 * (pnoise(u * 32, v * 32, 32, 32, 7) - 0.5);
      o[0] = o[1] = o[2] = clamp(c, 0, 1) * 255;
    }, { srgb: false, repeat: [1, 1] });
    var glitterTex = pixTex(128, 128, function (x, y, o) {
      var cx = x >> 2, cy = y >> 2, r = h2(cx, cy, 31);
      var nx = 0, ny = 0;
      if (r < 0.45) { nx = (h2(cx, cy, 32) - 0.5) * 1.1; ny = (h2(cx, cy, 33) - 0.5) * 1.1; }
      o[0] = (nx * 0.5 + 0.5) * 255; o[1] = (ny * 0.5 + 0.5) * 255; o[2] = 255;
    }, { srgb: false, repeat: [7, 7] });

    var heatTex = GF.canvasTex(64, 64, function (ctx, w, h) {
      ctx.fillStyle = '#100c0b'; ctx.fillRect(0, 0, w, h);
      for (var y = 3; y < h - 8; y += 6) { ctx.fillStyle = '#ffb070'; ctx.fillRect(0, y, w, 2); ctx.fillStyle = '#a04a20'; ctx.fillRect(0, y + 2, w, 1); }
      ctx.fillStyle = '#100c0b'; for (var x = 0; x < w; x += 16) ctx.fillRect(x, 0, 3, h);
    });
    // ---------------------------------------------------------------- materials
    var M = {
      dryer: new THREE.MeshPhysicalMaterial({ color: 0xebc6b8, metalness: 0.28, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, vertexColors: true }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xf4f1ee, metalness: 1, roughness: 0.1, vertexColors: true }),
      heat: new THREE.MeshStandardMaterial({ color: 0x2a2220, map: heatTex, roughness: 0.7, emissive: 0xff7a30, emissiveMap: heatTex, emissiveIntensity: 0 }),
      cord: new THREE.MeshStandardMaterial({ color: 0xd8c3bb, roughness: 0.5 }),
      stand: new THREE.MeshPhysicalMaterial({ color: 0xf2eee9, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
      oak: new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xffffff, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
      lacquer: new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0x9a4c34, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 }),
      beech: new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xfff4e6, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x2c2627, roughness: 0.6 }),
      pins: new THREE.MeshPhysicalMaterial({ color: 0x1c191a, roughness: 0.3, clearcoat: 0.6 }),
      ceramic: new THREE.MeshPhysicalMaterial({ color: 0xc9d5c6, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.04 }),
      tissueFly: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.92, side: THREE.DoubleSide, bumpMap: tissueTex, bumpScale: 0.5, vertexColors: true, alphaHash: true }),
      tissue: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.92, side: THREE.DoubleSide, bumpMap: tissueTex, bumpScale: 0.5 }),
      velvet: new THREE.MeshPhysicalMaterial({ color: 0xb06a76, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0.75, 0.42, 0.48), sheenRoughness: 0.45 }),
      mirror: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 1, roughness: 0.03 }),
      brass: new THREE.MeshPhysicalMaterial({ color: 0xdcb065, metalness: 1, roughness: 0.24, clearcoat: 0.4 }),
      enamel: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe2b860, metalness: 1, roughness: 0.22 }),
      nickel: new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.2 }),
      satin: new THREE.MeshPhysicalMaterial({ color: 0xb5142e, roughness: 0.3, sheen: 1, sheenColor: new THREE.Color(1.0, 0.5, 0.56), sheenRoughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
      daisy: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(1, 1, 1), side: THREE.DoubleSide }),
      star: new THREE.MeshPhysicalMaterial({ color: 0xebbd4e, metalness: 1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: glitterTex, normalScale: new THREE.Vector2(0.4, 0.4) }),
      leather: new THREE.MeshPhysicalMaterial({ color: 0xb48ccd, roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4, bumpMap: leatherTex, bumpScale: 0.35, sheen: 0.25, sheenColor: new THREE.Color(1, 1, 1) }),
      terry: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: borderTex, bumpMap: terryTex, bumpScale: 1.4, roughness: 1, sheen: 1, sheenColor: new THREE.Color(1, 0.97, 0.95), sheenRoughness: 0.5, side: THREE.DoubleSide }),
      skin: new THREE.MeshPhysicalMaterial({ color: 0xeab394, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(1, 0.84, 0.77), transparent: true, opacity: 0, depthWrite: false, vertexColors: true, emissive: 0x4a2014, emissiveIntensity: 0.3 })
    };
    borderTex.channel = 1;
    var terryRep = 1 / 0.07; // terry tile 7 cm (uv0 in metres * this)

    // ================================================================ DRYER
    var dryer = (function () {
      var seg = low ? 22 : 34;
      var g = new THREE.Group(); g.name = 'dryer';
      var BY = 0.09, HA = 0.26;
      var U = [0, 1, 0], V = [1, 0, 0];   // barrel rings: a vertical, b horizontal; progress +Z
      var body = [
        [-0.0790, 0.0268, 0.0268, 2, 1], [-0.0832, 0.0300, 0.0300, 2, 1], [-0.0840, 0.0324, 0.0324, 2, 1],
        [-0.0822, 0.0352, 0.0352, 2, 1], [-0.0772, 0.0370, 0.0370, 2, 1], [-0.0650, 0.0379, 0.0379, 2, 1],
        [-0.0300, 0.0383, 0.0383, 2, 1], [0.0200, 0.0379, 0.0379, 2, 1], [0.0480, 0.0363, 0.0363, 2, 1],
        [0.0640, 0.0338, 0.0338, 2, 1], [0.0720, 0.0312, 0.0312, 2, 1], [0.0745, 0.0296, 0.0296, 2, 1],
        [0.0770, 0.0287, 0.0290, 2.1, 0.84], [0.0900, 0.0240, 0.0312, 2.5, 0.84], [0.1060, 0.0160, 0.0342, 3.2, 0.84],
        [0.1200, 0.0102, 0.0362, 4.0, 0.84], [0.1262, 0.0088, 0.0360, 4.0, 0.84], [0.1274, 0.0072, 0.0346, 4.0, 0.8],
        [0.1262, 0.0059, 0.0333, 4.0, 0.45], [0.1180, 0.0063, 0.0325, 4.0, 0.2], [0.1050, 0.0110, 0.0300, 3.2, 0.1],
        [0.0955, 0.0150, 0.0276, 2.6, 0.08]
      ];
      var rings = body.map(function (r) { return { c: [0, BY, r[0]], u: U, v: V, a: r[1], b: r[2], n: r[3], s: r[4] }; });
      var gBarrel = loft(rings, seg);
      // handle
      var cH = Math.cos(HA), sH = Math.sin(HA);
      var dA = [0, cH, sH], hv = [0, -sH, cH], hu = [1, 0, 0];
      function hp(t) { return [0, cH * t, sH * t]; }
      var htab = [[-0.0690, 0.0030, 0.0025, 2, 1], [-0.0676, 0.0095, 0.0080, 2.4, 1], [-0.0642, 0.0128, 0.0108, 2.6, 1],
        [-0.0580, 0.0142, 0.0120, 2.8, 1], [-0.0200, 0.0150, 0.0126, 2.8, 1], [0.0200, 0.0160, 0.0133, 2.8, 1],
        [0.0450, 0.0170, 0.0142, 2.7, 1], [0.0580, 0.0190, 0.0166, 2.4, 1], [0.0680, 0.0216, 0.0200, 2.2, 1], [0.0820, 0.0216, 0.0200, 2.2, 1]];
      var gHandle = loft(htab.map(function (r) { return { c: hp(r[0]), u: hu, v: hv, a: r[1], b: r[2], n: r[3], s: r[4] }; }), seg);
      var stab = [[-0.0600, 0.0066], [-0.0700, 0.0062], [-0.0790, 0.0054], [-0.0870, 0.0047], [-0.0890, 0.0040], [-0.0896, 0.0025]];
      var gRelief = loft(stab.map(function (r) { return { c: hp(r[0]), u: hu, v: hv, a: r[1], b: r[1], n: 2, s: 0.78 }; }), 14);
      // switch track (dark recess) on the front of the handle
      var basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dA[0], dA[1], dA[2]), new THREE.Vector3(hv[0], hv[1], hv[2]));
      var track = paint(rbox(0.0085, 0.028, 0.002, 0.0009, 2), 0.18, 0.15, 0.15);
      var tp = hp(0.012);
      track.applyMatrix4(new THREE.Matrix4().copy(basis).setPosition(tp[0] + hv[0] * 0.0129, tp[1] + hv[1] * 0.0129, tp[2] + hv[2] * 0.0129));
      var bodyMesh = mesh(merge([gBarrel, gHandle, gRelief, track]), M.dryer, true, true);
      g.add(bodyMesh);
      // chrome: rear grille + front ring
      var gp = [[0.0272, 0.0006]], kR;
      for (kR = 0; kR < 7; kR++) {
        var r0 = 0.0265 - kR * 0.0036;
        gp.push([r0 - 0.0004, 0.0016], [r0 - 0.0014, 0.0016], [r0 - 0.0018, -0.0008], [r0 - 0.0032, -0.0008]);
      }
      gp.push([0.0012, 0.0024], [0, 0.0026]);
      var grille = lathe(gp, seg);
      (function () {
        var P = grille.attributes.position.array, n = P.length / 3, col = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) { var c = P[i * 3 + 1] < 0 ? 0.16 : 1; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
        grille.setAttribute('color', new THREE.BufferAttribute(col, 3));
      })();
      xf(grille, [0, BY, -0.0795], [-PI / 2, 0, 0]);
      var ring = paint(new THREE.TorusGeometry(0.0301, 0.0026, 10, seg + 8), 1, 1, 1);
      xf(ring, [0, BY, 0.0738]);
      var chromeMesh = mesh(merge([grille, ring]), M.chrome, true, false);
      g.add(chromeMesh);
      // slide switch
      var knob = mesh(paint(rbox(0.0090, 0.011, 0.0042, 0.0016, 2), 1, 1, 1), M.chrome, false, false);
      knob.matrixAutoUpdate = true;
      knob.quaternion.setFromRotationMatrix(basis);
      g.add(knob);
      function placeKnob(v) {
        var t = lerp(0.004, 0.020, v), p = hp(t), off = 0.0133 + 0.0016;
        knob.position.set(p[0] + hv[0] * off, p[1] + hv[1] * off, p[2] + hv[2] * off);
      }
      placeKnob(0);
      // heater glow disc inside the nozzle
      var heat = mesh(loft([{ c: [0, BY, 0.0960], u: U, v: V, a: 0.0152, b: 0.0278, n: 2.6 }, { c: [0, BY, 0.0960], u: U, v: V, a: 0.0002, b: 0.0002, n: 2 }], seg), M.heat, false, false);
      g.add(heat);
      var nozzle = new THREE.Object3D(); nozzle.name = 'dryerNozzle'; nozzle.position.set(0, BY, 0.1275); g.add(nozzle);

      // ---- stand (weighted base + post + ring round the handle)
      var stand = new THREE.Group(); stand.name = 'dryerStand';
      stand.position.set(POS.dryerStand[0], POS.dryerStand[1], POS.dryerStand[2]);
      var beta = Math.atan2(-0.82, -0.57);
      var gripY = 0.0125 + 0.006 + 0.0896;              // strain relief end hovers 6 mm above the base
      var ringH = gripY + 0.040;
      var side = new THREE.Vector3(0.57, 0, -0.82).normalize();   // post on the far side of the barrel
      var base = lathe([[0, 0], [0.046, 0], [0.0490, 0.0016], [0.0502, 0.0055], [0.0494, 0.0098], [0.0468, 0.0122], [0.040, 0.0127], [0, 0.0127]], seg + 6);
      var postH = ringH - 0.0127;
      var post = new THREE.CylinderGeometry(0.0052, 0.0060, postH, 14, 1, true);
      xf(post, [side.x * 0.0215, 0.0127 + postH / 2, side.z * 0.0215]);
      var cap = new THREE.SphereGeometry(0.0062, 12, 8); xf(cap, [side.x * 0.0215, ringH, side.z * 0.0215]);
      var tor = new THREE.TorusGeometry(0.0215, 0.0034, 10, 36); xf(tor, [0, ringH, 0], [PI / 2, 0, 0]);
      var standMesh = mesh(merge([base, post, cap, tor]), M.stand, true, true);
      stand.add(standMesh);
      root.add(stand);
      var qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -HA);
      var qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), beta);
      var home = { position: new THREE.Vector3(POS.dryerStand[0], POS.dryerStand[1] + gripY, POS.dryerStand[2]), quaternion: qb.multiply(qa) };
      g.position.copy(home.position); g.quaternion.copy(home.quaternion);
      root.add(g);

      // ---- power cord
      var ND = low ? 34 : 46, TAIL = [[0.543, 0.7029, -0.688], [0.547, 0.6995, -0.716], [0.550, 0.672, -0.729], [0.551, 0.38, -0.731]];
      var CN = ND + TAIL.length, CRS = 6, CR = 0.0029;
      var cP = new Float32Array(CN * 3);
      for (var ti = 0; ti < TAIL.length; ti++) { cP[(ND + ti) * 3] = TAIL[ti][0]; cP[(ND + ti) * 3 + 1] = TAIL[ti][1]; cP[(ND + ti) * 3 + 2] = TAIL[ti][2]; }
      var cpos = new Float32Array(CN * CRS * 3), cnor = new Float32Array(CN * CRS * 3), cidx = [];
      for (var ci = 0; ci < CN - 1; ci++) for (var cr = 0; cr < CRS; cr++) {
        var a = ci * CRS + cr, b = ci * CRS + (cr + 1) % CRS, c = (ci + 1) * CRS + cr, d = (ci + 1) * CRS + (cr + 1) % CRS;
        cidx.push(a, b, c, b, d, c);
      }
      var cgeo = new THREE.BufferGeometry();
      cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
      cgeo.setAttribute('normal', new THREE.BufferAttribute(cnor, 3));
      cgeo.setIndex(cidx);
      var cordMesh = mesh(cgeo, M.cord, true, false); cordMesh.frustumCulled = false; cordMesh.name = 'dryerCord';
      root.add(cordMesh);
      var CS = hp(-0.0860), CD = [-dA[0], -dA[1], -dA[2]];
      var vS = new THREE.Vector3(), vT = new THREE.Vector3(), vB = new THREE.Vector3(TAIL[0][0], 0, 0), mA = new THREE.Matrix4(), mI = new THREE.Matrix4();
      var vN = new THREE.Vector3(), vBn = new THREE.Vector3(), vTi = new THREE.Vector3(), vW = new THREE.Vector3();
      var SC = POS.dryerStand;
      function cordFloor(x, z) {
        if (x > -0.56 && x < 0.56 && z > -0.72 && z < -0.22) {
          var dx = x - SC[0], dz = z - SC[2];
          return dx * dx + dz * dz < 0.0025 ? 0.7127 : 0.70;
        }
        // just outside the top: the cord drapes over the edge instead of cutting through the dresser
        var ox = x < -0.56 ? -0.56 - x : (x > 0.56 ? x - 0.56 : 0), oz = z < -0.72 ? -0.72 - z : (z > -0.22 ? z + 0.22 : 0);
        var dO = Math.sqrt(ox * ox + oz * oz);
        return Math.max(0, 0.70 - dO * 4.5);
      }
      function updateCord() {
        root.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false);
        mI.copy(root.matrixWorld).invert();
        mA.multiplyMatrices(mI, g.matrixWorld);
        vS.set(CS[0], CS[1], CS[2]).applyMatrix4(mA);
        vT.set(CD[0], CD[1], CD[2]).transformDirection(mA);
        var Ax = vS.x, Ay = vS.y, Az = vS.z, Bx = 0.540, By = 0.70 + CR, Bz = -0.62;
        var dx = Bx - Ax, dy = By - Ay, dz = Bz - Az, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var k1 = 0.30 * d + 0.03, k2 = 0.35 * d + 0.03;
        var sag = 0.05 + 0.22 * d;
        vW.set(dz, 0, -dx); var wl = vW.length(); if (wl > 1e-5) vW.multiplyScalar(1 / wl); else vW.set(1, 0, 0);
        var i, s;
        for (i = 0; i < ND; i++) {
          s = i / (ND - 1);
          var s2 = s * s, s3 = s2 * s;
          var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
          var x = h00 * Ax + h10 * vT.x * k1 + h01 * Bx + h11 * 0;
          var y = h00 * Ay + h10 * vT.y * k1 + h01 * By + h11 * 0;
          var z = h00 * Az + h10 * vT.z * k1 + h01 * Bz + h11 * (-k2);
          var bell = Math.sin(PI * s);
          y -= sag * Math.pow(bell, 0.8) * sstep(0, 0.15, s);
          var wig = 0.022 * Math.sin(TAU * s * 1.3 + 0.7) * bell * Math.min(1, d * 2);
          x += vW.x * wig; z += vW.z * wig;
          cP[i * 3] = x; cP[i * 3 + 1] = y; cP[i * 3 + 2] = z;
        }
        for (var pass = 0; pass < 5; pass++) {
          for (i = 0; i < ND; i++) {
            if (pass > 0 && i > 2 && i < ND - 1) {
              cP[i * 3] = 0.5 * cP[i * 3] + 0.25 * (cP[i * 3 - 3] + cP[i * 3 + 3]);
              cP[i * 3 + 1] = 0.5 * cP[i * 3 + 1] + 0.25 * (cP[i * 3 - 2] + cP[i * 3 + 4]);
              cP[i * 3 + 2] = 0.5 * cP[i * 3 + 2] + 0.25 * (cP[i * 3 - 1] + cP[i * 3 + 5]);
            }
            if (i > 1) { var fl = cordFloor(cP[i * 3], cP[i * 3 + 2]) + CR; if (cP[i * 3 + 1] < fl) cP[i * 3 + 1] = fl; }
          }
        }
        // parallel-transport frames + ring vertices
        for (i = 0; i < CN; i++) {
          var ia = Math.max(0, i - 1), ib = Math.min(CN - 1, i + 1);
          vTi.set(cP[ib * 3] - cP[ia * 3], cP[ib * 3 + 1] - cP[ia * 3 + 1], cP[ib * 3 + 2] - cP[ia * 3 + 2]);
          var tl = vTi.length(); if (tl < 1e-7) vTi.set(0, -1, 0); else vTi.multiplyScalar(1 / tl);
          if (i === 0) { vN.set(1, 0, 0); if (Math.abs(vTi.x) > 0.9) vN.set(0, 1, 0); }
          vN.addScaledVector(vTi, -vTi.dot(vN));
          var nl = vN.length(); if (nl < 1e-6) { vN.set(0, 0, 1).addScaledVector(vTi, -vTi.z); nl = vN.length() || 1; }
          vN.multiplyScalar(1 / nl);
          vBn.crossVectors(vTi, vN);
          for (var r = 0; r < CRS; r++) {
            var an = r / CRS * TAU, co = Math.cos(an), si = Math.sin(an), k = (i * CRS + r) * 3;
            var nx = co * vN.x + si * vBn.x, ny = co * vN.y + si * vBn.y, nz = co * vN.z + si * vBn.z;
            cnor[k] = nx; cnor[k + 1] = ny; cnor[k + 2] = nz;
            cpos[k] = cP[i * 3] + nx * CR; cpos[k + 1] = cP[i * 3 + 1] + ny * CR; cpos[k + 2] = cP[i * 3 + 2] + nz * CR;
          }
        }
        cgeo.attributes.position.needsUpdate = true; cgeo.attributes.normal.needsUpdate = true;
      }
      updateCord();

      var setGlow = GF.makeGlow([bodyMesh]);
      var on = false, onCur = 0;
      return {
        group: g, nozzle: nozzle, home: home, stand: stand, cord: cordMesh,
        setOn: function (v) { on = !!v; },
        setGlow: setGlow,
        updateCord: updateCord,
        _update: function (dt) {
          var tgt = on ? 1 : 0;
          if (Math.abs(onCur - tgt) < 0.0005) { if (onCur === tgt) return; onCur = tgt; }
          else onCur = GF.damp(onCur, tgt, 9, dt);
          placeKnob(clamp(onCur * 1.6, 0, 1));
          M.heat.emissiveIntensity = 1.6 * onCur * onCur;
        }
      };
    })();

    // ================================================================ BRUSH (+ cup)
    var brush = (function () {
      var seg = low ? 20 : 30;
      var g = new THREE.Group(); g.name = 'brush';
      var HC = 0.105, HHy = 0.052, HW = 0.037, TOP = HC + HHy, BH = 0.0095;
      var tabH = [[-0.0690, 0.0030, 0.0022], [-0.0678, 0.0075, 0.0052], [-0.0655, 0.0105, 0.0072], [-0.0620, 0.0119, 0.0082],
        [-0.0560, 0.0125, 0.0087], [-0.020, 0.0122, 0.0089], [0.020, 0.0108, 0.0086], [0.042, 0.0097, 0.0082], [0.30, 0.0097, 0.0082]];
      function hab(y, out) {
        for (var i = 0; i < tabH.length - 1; i++) if (y <= tabH[i + 1][0]) {
          var t = (y - tabH[i][0]) / (tabH[i + 1][0] - tabH[i][0]);
          out[0] = lerp(tabH[i][1], tabH[i + 1][1], t); out[1] = lerp(tabH[i][2], tabH[i + 1][2], t); return out;
        }
        out[0] = tabH[tabH.length - 1][1]; out[1] = tabH[tabH.length - 1][2]; return out;
      }
      function headA(y) { var t = Math.abs((y - HC) / HHy); if (t >= 1) return 0; return HW * Math.pow(1 - Math.pow(t, 2.6), 1 / 2.6); }
      var ys = [-0.0690, -0.0678, -0.0655, -0.0620, -0.0560, -0.040, -0.020, 0, 0.020, 0.034, 0.042];
      for (var y = 0.047; y < TOP - 0.004; y += 0.0042) ys.push(y);
      ys.push(TOP - 0.0030, TOP - 0.0016, TOP - 0.0006, TOP - 0.00005);
      var rows = [], hb = [0, 0];
      ys.forEach(function (yy) {
        hab(yy, hb);
        var w = sstep(0.046, 0.066, yy);
        var aH = hb[0] * (1 - sstep(0.06, 0.085, yy));
        var a = Math.max(aH, headA(yy));
        var b = lerp(hb[1], BH, w);
        var dtp = TOP - yy; if (dtp < BH) b = BH * Math.sqrt(Math.max(0.02, 1 - Math.pow((BH - dtp) / BH, 2)));
        rows.push({ y: yy, a: a, b: b, n: lerp(2.3, 4.2, w) });
      });
      for (var pass = 0; pass < 2; pass++) for (var ri = 1; ri < rows.length - 1; ri++) if (rows[ri].y > 0.03 && rows[ri].y < 0.075) rows[ri].a = (rows[ri - 1].a + 2 * rows[ri].a + rows[ri + 1].a) / 4;
      var gBody = loft(rows.map(function (r) { return { c: [0, r.y, 0], u: [1, 0, 0], v: [0, 0, 1], a: Math.max(r.a, 0.0002), b: Math.max(r.b, 0.0002), n: r.n }; }), seg);
      (function () { // wood uv: grain along the length
        var P = gBody.attributes.position.array, UV = gBody.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 3 + P[i * 3 + 2] * 3 + 0.3; UV[i * 2 + 1] = P[i * 3 + 1] * 1.6; }
      })();
      var bodyMesh = mesh(gBody, M.beech, true, true); g.add(bodyMesh);
      // cushion pad (faces -Z)
      var PA = 0.0285, PB = 0.0445, PN = 2.6;
      function padZ(r) { return -(BH + 0.0005 + 0.0034 * (1 - Math.pow(Math.min(1, r), 4))); }
      var prow = [];
      var rr = [0.0, 0.25, 0.5, 0.7, 0.85, 0.95, 1.0, 1.04];
      rr.forEach(function (r) { var z = r >= 1.0 ? (r > 1.01 ? -BH + 0.0015 : -BH - 0.0007) : padZ(r); prow.push({ c: [0, HC, z], u: [1, 0, 0], v: [0, 1, 0], a: Math.max(r, 0.002) * PA, b: Math.max(r, 0.002) * PB, n: PN }); });
      var padMesh = mesh(loft(prow, seg + 6, true), M.rubber, true, false); g.add(padMesh);
      // pins with ball tips (instanced)
      var L = 0.0125;
      var pinG = new THREE.CylinderGeometry(0.00062, 0.00078, L, 6, 1, true); xf(pinG, [0, 0, -L / 2], [PI / 2, 0, 0]);
      var ballG = new THREE.SphereGeometry(0.00155, 8, 6); xf(ballG, [0, 0, -L]);
      var pinGeo = merge([pinG, ballG]);
      var pinsList = [], sp = low ? 0.0085 : 0.0068, row = 0;
      for (var py = -PB + 0.006; py <= PB - 0.006; py += sp, row++) {
        for (var px = -PA + (row % 2 ? sp / 2 : 0); px <= PA; px += sp) {
          var rn = Math.pow(Math.pow(Math.abs(px / PA), PN) + Math.pow(Math.abs(py / PB), PN), 1 / PN);
          if (rn > 0.84) continue;
          pinsList.push([px, py, rn]);
        }
      }
      var pins = new THREE.InstancedMesh(pinGeo, M.pins, pinsList.length);
      var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), mz = new THREE.Vector3(0, 0, -1), pv = new THREE.Vector3();
      pinsList.forEach(function (p, i) {
        dir.set(p[0] / PA * 0.16, p[1] / PB * 0.16, -1).normalize();
        q4.setFromUnitVectors(mz, dir);
        pv.set(p[0], HC + p[1], padZ(p[2]) + 0.0004);
        m4.compose(pv, q4, one); pins.setMatrixAt(i, m4);
      });
      pins.castShadow = true; g.add(pins);
      // cup
      var cup = lathe([[0, 0], [0.030, 0], [0.0322, 0.0014], [0.0328, 0.004], [0.0342, 0.030], [0.0356, 0.070], [0.0359, 0.0788], [0.0352, 0.0814],
        [0.0338, 0.0812], [0.0328, 0.0790], [0.0320, 0.070], [0.0304, 0.013], [0.0284, 0.0085], [0, 0.0082]], low ? 24 : 36);
      var cupMesh = mesh(cup, M.ceramic, true, true);
      cupMesh.position.set(POS.brushCup[0], POS.brushCup[1], POS.brushCup[2]);
      root.add(cupMesh);
      // home: handle-down in the cup, bristles toward the camera, leaning back
      var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.30))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI));
      var end = new THREE.Vector3(POS.brushCup[0] - 0.002, POS.brushCup[1] + 0.0112, POS.brushCup[2] + 0.010);
      var up = new THREE.Vector3(0, 0.0690, 0).applyQuaternion(q);
      var home = { position: end.clone().add(up), quaternion: q };
      g.position.copy(home.position); g.quaternion.copy(home.quaternion);
      root.add(g);
      return { group: g, home: home, cup: cupMesh, setGlow: GF.makeGlow([bodyMesh]) };
    })();

    // ================================================================ surfaces (for tissues)
    var TB = POS.tissueBox, MB = POS.musicBox, DS = POS.dryerStand, BC = POS.brushCup;
    function surfaceY(x, z) {
      if (x > -0.56 && x < 0.56 && z > -0.72 && z < -0.22) {
        if (Math.abs(x - TB[0]) < 0.111 && Math.abs(z - TB[2]) < 0.058) return 0.7755;
        if (Math.abs(x - MB[0]) < 0.074 && Math.abs(z - MB[2]) < 0.050) return 0.7858;
        var dx = x - DS[0], dz = z - DS[2]; if (dx * dx + dz * dz < 0.0025) return 0.7128;
        dx = x - BC[0]; dz = z - BC[2]; if (dx * dx + dz * dz < 0.0013) return 0.7815;
        return 0.70;
      }
      return 0;
    }

    // ================================================================ TISSUE BOX + flying tissues
    var tissue = (function () {
      var seg = low ? 28 : 44;
      var g = new THREE.Group(); g.name = 'tissueBox';
      g.position.set(TB[0], TB[1], TB[2]); g.rotation.y = 0.10;
      var A0 = 0.110, B0 = 0.0575, NO = 9;
      var R = [[0, 0.001, 0.001, NO], [0, A0 - 0.004, B0 - 0.004, NO], [0.0014, A0 - 0.0012, B0 - 0.0012, NO], [0.0045, A0, B0, NO],
        [0.0700, A0, B0, NO], [0.0736, A0 - 0.0012, B0 - 0.0012, NO], [0.0750, A0 - 0.0050, B0 - 0.0050, NO],
        [0.0750, 0.090, 0.044, 6], [0.0750, 0.068, 0.026, 3.2], [0.0750, 0.0545, 0.0150, 2.4], [0.0743, 0.0512, 0.0122, 2.2],
        [0.0715, 0.0503, 0.0113, 2.2], [0.0660, 0.0498, 0.0108, 2.2], [0.0650, 0.0010, 0.0010, 2]];
      var gBox = loft(R.map(function (r) { return { c: [0, r[0], 0], u: [1, 0, 0], v: [0, 0, 1], a: r[1], b: r[2], n: r[3], s: r[0] < 0.07 && r[1] < 0.06 ? 0.55 : 1 }; }), seg);
      (function () {
        var P = gBox.attributes.position.array, UV = gBox.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 4.0 + 0.1; UV[i * 2 + 1] = (P[i * 3 + 2] + P[i * 3 + 1]) * 6.0; }
      })();
      M.oak.vertexColors = true;
      var cover = mesh(gBox, M.oak, true, true); g.add(cover);
      // the tuft sticking out of the slot
      var tuftG = gridGeo(12, 9, function (u, v, o) {
        var s = u * 2 - 1, h = v;
        o[0] = s * (0.034 + 0.026 * h) + 0.004 * Math.sin(h * 3 + s);
        o[1] = 0.062 + h * 0.066 * (1 - 0.32 * s * s) + 0.006 * Math.sin(h * PI) * s;
        o[2] = 0.0035 * Math.sin(s * PI * 2.2 + h * 2.5) * (0.4 + h) + 0.014 * h * h * (0.6 - s * 0.5) - 0.002 * (1 - h);
      });
      var tuft = mesh(tuftG, M.tissue, true, false); g.add(tuft);
      root.add(g);

      // ---- flying tissues (one dynamic mesh)
      var NG = low ? 7 : 9, MAXT = 14, CAP = 12, S = 0.16, NVt = NG * NG;
      var pos = new Float32Array(NVt * MAXT * 3), nor = new Float32Array(NVt * MAXT * 3), col = new Float32Array(NVt * MAXT * 4), uvs = new Float32Array(NVt * MAXT * 2);
      var idx = [], i, j, k;
      for (k = 0; k < MAXT; k++) for (j = 0; j < NG - 1; j++) for (i = 0; i < NG - 1; i++) {
        var a = k * NVt + j * NG + i; idx.push(a, a + 1, a + NG, a + 1, a + NG + 1, a + NG);
      }
      for (k = 0; k < MAXT * NVt; k++) { col[k * 4] = col[k * 4 + 1] = col[k * 4 + 2] = 1; col[k * 4 + 3] = 1; var gi = k % NVt; uvs[k * 2] = (gi % NG) / (NG - 1) * 1.25; uvs[k * 2 + 1] = Math.floor(gi / NG) / (NG - 1) * 1.25; }
      var tgeo = new THREE.BufferGeometry();
      tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      tgeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      tgeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      tgeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      tgeo.setIndex(idx);
      var fly = mesh(tgeo, M.tissueFly, true, true); fly.frustumCulled = false; fly.name = 'tissues';
      root.add(fly);
      var rnd = GF.rng(4242);
      var wr = new Float32Array(MAXT * NVt);
      for (k = 0; k < wr.length; k++) wr[k] = rnd() - 0.5;
      var slots = [];
      for (k = 0; k < MAXT; k++) slots.push({
        id: k, active: false, phase: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, pz: 0,
        q: new THREE.Quaternion(), w: new THREE.Vector3(), landQ: new THREE.Quaternion(), flatQ: new THREE.Quaternion(),
        age: 0, unf: 1, sb: 0, flip: 1, surf: 0, alpha: 1, fading: false, born: 0, flut: 0, ph1: 0, ph2: 0, dirty: true, seed: 0
      });
      var clock = 0, lastLaunch = -10, gap = 0.4, tuftUp = 1, count = 0, born = 0;
      var tv = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tm = new THREE.Matrix4();
      var ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(), slotPos = new THREE.Vector3();
      var QX_DOWN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PI / 2);
      var QX_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), PI / 2);
      var YAX = new THREE.Vector3(0, 1, 0);

      function hideSlot(s) {
        var o = s.id * NVt * 3;
        for (var v = 0; v < NVt; v++) { pos[o + v * 3] = TB[0]; pos[o + v * 3 + 1] = TB[1] + 0.03; pos[o + v * 3 + 2] = TB[2]; }
        s.dirty = true;
      }
      function flatTarget(s, out) {
        ax.set(1, 0, 0).applyQuaternion(s.q); az.set(0, 0, 1).applyQuaternion(s.q);
        var yaw = Math.atan2(-ax.z, ax.x);
        out.setFromAxisAngle(YAX, yaw);
        if (az.y >= 0) { out.multiply(QX_DOWN); return 1; }
        out.multiply(QX_UP); return -1;
      }
      // dresser-top fold: distance outside the top rectangle
      function writeSlot(s) {
        var o = s.id * NVt, sc = 0.22 + 0.78 * s.unf, sb = s.sb, fl = s.flut, t = s.age;
        var settledish = s.phase === 2;
        for (var jj = 0; jj < NG; jj++) for (var ii = 0; ii < NG; ii++) {
          var vi = jj * NG + ii, lx = (ii / (NG - 1) - 0.5) * S, ly = (jj / (NG - 1) - 0.5) * S;
          var r2 = (lx * lx + ly * ly) / (S * S * 0.25);
          var w0 = wr[o + vi];
          var fz = fl * (0.6 * Math.sin(lx * 38 + s.ph1 + t * 9.0) + 0.4 * Math.sin(ly * 31 - t * 7.3 + s.ph2)) * (0.35 + r2)
            + (1 - s.unf) * 0.028 * w0 + 0.022 * (lx * lx / (S * S * 0.25)) * (1 - sb) * Math.sin(s.ph1 + t * 2.3) + 0.012 * (ly * ly / (S * S * 0.25)) * Math.cos(s.ph2 + t * 1.7);
          var sz = s.flip * (0.0042 * w0 + 0.010 * Math.pow(Math.max(0, r2 - 0.45), 1.5) * (0.6 + 0.4 * Math.sin(s.ph2 + lx * 30)) + 0.0060 * (1 + Math.sin(lx * 22 + s.ph1) * Math.sin(ly * 16 + s.ph2 + lx * 9)) + 0.010 * Math.max(0, (lx + ly) / S * 1.4 + Math.sin(s.ph1 * 3) * 0.3 - 0.45));
          var lz = lerp(fz, sz, sb);
          tv.set(lx * sc, ly * sc, lz).applyQuaternion(s.q);
          var x = s.x + tv.x, y = s.y + tv.y, z = s.z + tv.z;
          var su = surfaceY(x, z);
          if (settledish && s.surf > 0.69) {
            // fold over the dresser edge
            var cx = clamp(x, -0.56, 0.56), cz = clamp(z, -0.72, -0.22), ddx = x - cx, ddz = z - cz, dOut = Math.sqrt(ddx * ddx + ddz * ddz);
            if (dOut > 1e-5) {
              var ox = ddx / dOut, oz = ddz / dOut;
              var RB = 0.008, qa = RB * PI / 2, hx2, hy2;
              if (dOut < qa) { var th = dOut / RB; hx2 = RB * Math.sin(th); hy2 = RB * (1 - Math.cos(th)); }
              else { hx2 = RB; hy2 = RB + (dOut - qa); }
              hx2 = lerp(dOut, hx2, sb); hy2 *= sb;
              x = cx + ox * (hx2 - RB * 0.75 * sb); z = cz + oz * (hx2 - RB * 0.75 * sb);
              y = 0.7012 - hy2 + (1 - sb) * Math.max(0, y - 0.70);
              su = 0;
            } else if (su < s.surf - 0.01) {
              y = Math.max(su + 0.0012, y - 0.9 * sb * 0.0);
            }
          }
          if (su - y > 0.09) {
            // below the dresser top: lean against the dresser's side instead of being lifted
            var ex0 = x + 0.5605, ex1 = 0.5605 - x, ez0 = z + 0.7205, ez1 = -0.2195 - z, em = Math.min(ex0, ex1, ez1);
            if (em === ex0) x = -0.5605; else if (em === ex1) x = 0.5605; else z = -0.2195;
            if (ez0 < em) z = -0.7205;
            su = 0;
          }
          if (y < su + 0.0012) y = su + 0.0012;
          var k3 = (o + vi) * 3;
          pos[k3] = x; pos[k3 + 1] = y; pos[k3 + 2] = z;
        }
        // normals
        for (jj = 0; jj < NG; jj++) for (ii = 0; ii < NG; ii++) {
          var i0 = (o + jj * NG + Math.max(0, ii - 1)) * 3, i1 = (o + jj * NG + Math.min(NG - 1, ii + 1)) * 3;
          var j0 = (o + Math.max(0, jj - 1) * NG + ii) * 3, j1 = (o + Math.min(NG - 1, jj + 1) * NG + ii) * 3;
          var ux = pos[i1] - pos[i0], uy = pos[i1 + 1] - pos[i0 + 1], uz = pos[i1 + 2] - pos[i0 + 2];
          var vx = pos[j1] - pos[j0], vy = pos[j1 + 1] - pos[j0 + 1], vz = pos[j1 + 2] - pos[j0 + 2];
          var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          var kk = (o + jj * NG + ii) * 3;
          nor[kk] = nx / nl; nor[kk + 1] = ny / nl; nor[kk + 2] = nz / nl;
          col[(o + jj * NG + ii) * 4 + 3] = s.alpha;
        }
        s.dirty = true;
      }
      for (k = 0; k < MAXT; k++) hideSlot(slots[k]);

      function aliveCount() { var n = 0; for (var q = 0; q < MAXT; q++) if (slots[q].active && !slots[q].fading) n++; return n; }
      function launch(dir, strength) {
        var s = null, q, oldest = null;
        for (q = 0; q < MAXT; q++) if (!slots[q].active) { s = slots[q]; break; }
        if (!s) { for (q = 0; q < MAXT; q++) if (!oldest || slots[q].born < oldest.born) oldest = slots[q]; s = oldest; }
        if (aliveCount() >= CAP) {
          oldest = null;
          for (q = 0; q < MAXT; q++) { var o2 = slots[q]; if (o2 !== s && o2.active && !o2.fading && (!oldest || (o2.phase === 2) > (oldest.phase === 2) || ((o2.phase === 2) === (oldest.phase === 2) && o2.born < oldest.born))) oldest = o2; }
          if (oldest) oldest.fading = true;
        }
        g.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
        slotPos.set(0, 0.10, 0).applyMatrix4(g.matrixWorld); tm.copy(root.matrixWorld).invert(); slotPos.applyMatrix4(tm);
        var hx = num(dir.x, 0), hz = num(dir.z, 0), hl = Math.sqrt(hx * hx + hz * hz);
        if (hl < 0.2) { var an = rnd() * TAU; hx = Math.cos(an); hz = Math.sin(an); hl = 1; }
        hx /= hl; hz /= hl;
        var sp = 0.55 + 0.65 * strength;
        s.active = true; s.phase = 1; s.fading = false; s.alpha = 1; s.age = 0; s.unf = 0; s.sb = 0; s.flip = 1; s.surf = 0;
        s.x = slotPos.x; s.y = slotPos.y; s.z = slotPos.z;
        s.vx = hx * sp + (rnd() - 0.5) * 0.3; s.vz = hz * sp + (rnd() - 0.5) * 0.3; s.vy = 0.75 + 0.35 * strength + rnd() * 0.2;
        s.px = -hz; s.pz = hx; s.seed = rnd() * TAU; s.ph1 = rnd() * TAU; s.ph2 = rnd() * TAU; s.flut = 0.012;
        s.born = ++born;
        // sheet faces the wind, upright
        az.set(hx, 0, hz); ay.set(0, 1, 0); ax.crossVectors(ay, az);
        tm.makeBasis(ax, ay, az); s.q.setFromRotationMatrix(tm);
        s.w.set((rnd() - 0.5) * 9, (rnd() - 0.5) * 5, (rnd() - 0.5) * 9);
        tuftUp = 0; count++;
        writeSlot(s);
      }
      function stepSlot(s, dt) {
        s.age += dt;
        if (s.phase === 1) {
          s.unf = Math.min(1, s.unf + dt / 0.28);
          var drag = 2.6, geff = 1.45;
          var sway = s.vy < 0 ? 0.42 * Math.sin(s.age * 4.6 + s.seed) : 0;
          s.vx += (-drag * s.vx + sway * s.px) * dt;
          s.vz += (-drag * s.vz + sway * s.pz) * dt;
          s.vy += (-geff - drag * s.vy) * dt;
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          // walls / mirror / room
          var zmin = s.y > 0.70 ? -0.655 : -0.715;
          if (s.z < zmin) { s.z = zmin; s.vz = Math.abs(s.vz) * 0.2; }
          if (s.x < -1.6) { s.x = -1.6; s.vx = Math.abs(s.vx) * 0.2; } if (s.x > 1.6) { s.x = 1.6; s.vx = -Math.abs(s.vx) * 0.2; }
          if (s.z > 1.6) { s.z = 1.6; s.vz = -Math.abs(s.vz) * 0.2; }
          // cannot enter the dresser block
          if (s.y < 0.695 && s.x > -0.575 && s.x < 0.575 && s.z > -0.73 && s.z < -0.205) {
            var dl = s.x + 0.575, dr = 0.575 - s.x, df = -0.205 - s.z, dm = Math.min(dl, dr, df);
            if (dm === dl) { s.x = -0.575; s.vx = -Math.abs(s.vx) * 0.3; } else if (dm === dr) { s.x = 0.575; s.vx = Math.abs(s.vx) * 0.3; } else { s.z = -0.205; s.vz = Math.abs(s.vz) * 0.3; }
          }
          // the girl (rough ellipsoid) pushes tissues aside
          var ex = s.x / 0.20, ey = (s.y - 0.72) / 0.33, ez = (s.z - 0.02) / 0.16, e = ex * ex + ey * ey + ez * ez;
          if (e < 1 && e > 1e-6) { var f = 1 / Math.sqrt(e); s.x *= f; s.y = 0.72 + (s.y - 0.72) * f; s.z = 0.02 + (s.z - 0.02) * f; s.vx *= 0.5; s.vz *= 0.5; }
          // tumbling
          var damp = Math.exp(-1.3 * dt); s.w.multiplyScalar(damp);
          var wl = s.w.length();
          if (wl > 1e-5) { ax.copy(s.w).multiplyScalar(1 / wl); tq.setFromAxisAngle(ax, wl * dt); s.q.premultiply(tq).normalize(); }
          var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
          s.flut = 0.004 + 0.010 * Math.min(1, sp / 0.6);
          var su = surfaceY(s.x, s.z), hgt = s.y - su;
          if (hgt < 0.12) { s.flip = flatTarget(s, tq2); s.q.slerp(tq2, Math.min(1, dt * 5 * (1 - hgt / 0.12))); s.w.multiplyScalar(Math.exp(-4 * dt)); }
          if (hgt <= 0.004 && s.vy <= 0) {
            s.y = su + 0.0015; s.surf = su; s.phase = 2; s.sb = 0;
            s.flip = flatTarget(s, s.flatQ); s.landQ.copy(s.q); s.vx = s.vy = s.vz = 0; s.w.set(0, 0, 0);
          }
          writeSlot(s);
        } else if (s.phase === 2) {
          if (s.sb < 1 || s.flut > 0.0002) {
            s.sb = Math.min(1, s.sb + dt / 0.45);
            s.q.slerpQuaternions(s.landQ, s.flatQ, GF.ease.out(s.sb));
            s.flut *= Math.exp(-6 * dt);
            if (s.flut <= 0.0002) s.flut = 0;
            writeSlot(s);
          }
        }
        if (s.fading) {
          s.alpha -= dt / 0.8;
          if (s.alpha <= 0) { s.active = false; s.fading = false; s.alpha = 1; hideSlot(s); }
          else writeSlot(s);
        }
      }
      function update(dt) {
        clock += dt;
        var any = false;
        for (var q = 0; q < MAXT; q++) {
          var s = slots[q];
          if (s.active) stepSlot(s, dt);
          if (s.dirty) { any = true; s.dirty = false; }
        }
        if (any) { tgeo.attributes.position.needsUpdate = true; tgeo.attributes.normal.needsUpdate = true; tgeo.attributes.color.needsUpdate = true; }
        if (tuftUp < 1) {
          tuftUp = Math.min(1, tuftUp + dt / 0.30);
          var e = tuftUp < 0.25 ? 0 : GF.ease.outBack((tuftUp - 0.25) / 0.75);
          tuft.position.y = lerp(-0.068, 0, e); tuft.scale.y = lerp(0.4, 1, clamp(e, 0, 1.2));
          tuft.visible = e > 0.001;
        }
      }
      function reset() {
        for (var q = 0; q < MAXT; q++) { slots[q].active = false; slots[q].fading = false; hideSlot(slots[q]); }
        count = 0; tuftUp = 1; tuft.position.y = 0; tuft.scale.y = 1; tuft.visible = true;
        tgeo.attributes.position.needsUpdate = true; tgeo.attributes.normal.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;
      }
      var SPOTS = [[-0.12, -0.50, 0.5], [-0.12, -0.31, 2.2], [-0.66, -0.02, 1.1], [-0.40, 0.20, 2.9], [-0.20, 0.44, 0.3], [0.13, -0.56, 1.9], [-0.80, 0.34, 0.8], [0.05, -0.36, 2.6]];
      function restore(n) {
        reset();
        n = Math.max(0, Math.floor(num(n, 0)));
        var m = Math.min(n, 8);
        for (var q = 0; q < m; q++) {
          var s = slots[q], sp = SPOTS[q];
          s.active = true; s.phase = 2; s.fading = false; s.alpha = 1; s.unf = 1; s.sb = 1; s.flut = 0; s.age = 3 + q;
          s.x = sp[0]; s.z = sp[1]; s.surf = surfaceY(sp[0], sp[1]); s.y = s.surf + 0.0015;
          s.flatQ.setFromAxisAngle(YAX, sp[2]).multiply(QX_DOWN); s.q.copy(s.flatQ); s.landQ.copy(s.flatQ); s.flip = 1;
          s.ph1 = q * 1.7; s.ph2 = q * 2.3; s.born = ++born;
          writeSlot(s);
        }
        count = n;
        tgeo.attributes.position.needsUpdate = true; tgeo.attributes.normal.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;
      }
      var api = {
        group: g, cover: cover, tuft: tuft, flying: fly,
        setGlow: GF.makeGlow([cover, tuft]),
        blow: function (dir, strength) {
          if (!dir) return false;
          strength = clamp(num(strength, 0), 0, 1);
          if (strength < 0.12) return false;
          if (clock - lastLaunch < gap || tuftUp < 0.85) return false;
          lastLaunch = clock; gap = 0.35 + rnd() * 0.10;
          launch(dir, strength);
          return true;
        },
        reset: reset, restore: restore, _update: update
      };
      Object.defineProperty(api, 'count', { get: function () { return count; }, enumerable: true });
      return api;
    })();

    // ================================================================ MUSIC BOX
    var musicBox = (function () {
      var seg = low ? 28 : 44;
      var g = new THREE.Group(); g.name = 'musicBox';
      g.position.set(MB[0], MB[1], MB[2]); g.rotation.y = -0.25;
      var A0 = 0.075, B0 = 0.050, T = 0.0065, NN = 7, TRAY = 0.052, HB = 0.063;
      function ring(y, a, b, n, s) { return { c: [0, y, 0], u: [1, 0, 0], v: [0, 0, 1], a: a, b: b, n: n || NN, s: s }; }
      var gBase = loft([ring(0, 0.001, 0.001), ring(0, A0 - 0.004, B0 - 0.004), ring(0.0012, A0 - 0.0012, B0 - 0.0012), ring(0.004, A0, B0),
        ring(0.0590, A0, B0), ring(0.0618, A0 - 0.0010, B0 - 0.0010), ring(HB, A0 - 0.0035, B0 - 0.0035), ring(HB, A0 - T + 0.0012, B0 - T + 0.0012),
        ring(HB - 0.0010, A0 - T, B0 - T), ring(TRAY - 0.002, A0 - T, B0 - T)], seg);
      function woodUV(geo) {
        var P = geo.attributes.position.array, UV = geo.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 6.0 + 0.4; UV[i * 2 + 1] = (P[i * 3 + 2] + P[i * 3 + 1]) * 9.0 + 0.2; }
      }
      woodUV(gBase);
      M.lacquer.vertexColors = true;
      var baseMesh = mesh(gBase, M.lacquer, true, true); g.add(baseMesh);
      // velvet tray with three shallow places + liner
      var CLIPX = [-0.043, 0, 0.043], CLIPZ = 0.012;
      var trayW = 2 * (A0 - T) + 0.002, trayD = 2 * (B0 - T) + 0.002;
      var tray = gridGeo(low ? 24 : 40, low ? 16 : 26, function (u, v, o) {
        var x = (u - 0.5) * trayW, z = (v - 0.5) * trayD, y = TRAY;
        for (var c = 0; c < 3; c++) { var e = Math.pow((x - CLIPX[c]) / 0.021, 2) + Math.pow((z - CLIPZ) / 0.025, 2); if (e < 1) y -= 0.0024 * (1 - e) * (1 - e); }
        var rn = Math.pow(Math.pow(Math.abs(x) / (A0 - T + 0.0008), NN) + Math.pow(Math.abs(z) / (B0 - T + 0.0008), NN), 1 / NN);
        if (rn > 1) { x /= rn; z /= rn; }
        y += 0.0018 * sstep(0.88, 1.0, rn);
        o[0] = x; o[1] = y; o[2] = -z;
      });
      var liner = loft([ring(TRAY - 0.001, A0 - T - 0.0006, B0 - T - 0.0006), ring(HB - 0.0045, A0 - T - 0.0006, B0 - T - 0.0006), ring(HB - 0.0030, A0 - T + 0.0002, B0 - T + 0.0002)], seg, true);
      var velvetMesh = mesh(merge([tray, liner]), M.velvet, false, true); g.add(velvetMesh);
      // brass on the base: hinges, catch, flower collar
      var hingeA = new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 12); xf(hingeA, [-0.045, HB, -B0 - 0.0005], [0, 0, PI / 2]);
      var hingeB = new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 12); xf(hingeB, [0.045, HB, -B0 - 0.0005], [0, 0, PI / 2]);
      var catchP = rbox(0.012, 0.007, 0.0014, 0.0006, 2); xf(catchP, [0, 0.0535, B0 + 0.0006]);
      var catchK = new THREE.SphereGeometry(0.0017, 10, 8); xf(catchK, [0, 0.0535, B0 + 0.0016]);
      var FX = -0.048, FZ = -0.029;
      var collar = new THREE.CylinderGeometry(0.0040, 0.0044, 0.0024, 16); xf(collar, [FX, TRAY + 0.0008, FZ]);
      var baseBrass = mesh(merge([hingeA, hingeB, catchP, catchK, collar]), M.brass, true, false); g.add(baseBrass);
      // lid
      var pivot = new THREE.Group(); pivot.name = 'musicBoxLidPivot'; pivot.position.set(0, HB, -B0); g.add(pivot);
      function lr(y, a, b) { return { c: [0, y, B0], u: [1, 0, 0], v: [0, 0, 1], a: a, b: b, n: NN }; }
      var gLid = loft([lr(0.0080, 0.010, 0.006), lr(0.0080, A0 - 0.0105, B0 - 0.0105), lr(0.0070, A0 - T - 0.0004, B0 - T - 0.0004), lr(0.0006, A0 - T, B0 - T),
        lr(0, A0 - T + 0.0015, B0 - T + 0.0015), lr(0, A0 - 0.003, B0 - 0.003), lr(0.0012, A0 - 0.0006, B0 - 0.0006), lr(0.0040, A0, B0), lr(0.0150, A0, B0),
        lr(0.0186, A0 - 0.0015, B0 - 0.0015), lr(0.0212, A0 - 0.0062, B0 - 0.0062), lr(0.0223, A0 - 0.0140, B0 - 0.0140), lr(0.0227, A0 - 0.030, B0 - 0.030), lr(0.0229, 0.001, 0.001)], seg);
      woodUV(gLid);
      var lidMesh = mesh(gLid, M.lacquer, true, true); pivot.add(lidMesh);
      var mirrorMesh = mesh(loft([lr(0.0076, A0 - 0.0115, B0 - 0.0115), lr(0.0076, 0.001, 0.001)], seg, true), M.mirror, false, false); pivot.add(mirrorMesh);
      var hasp = rbox(0.0130, 0.0150, 0.0016, 0.0007, 2); xf(hasp, [0, 0.0045, 2 * B0 + 0.0009]);
      var haspRivet = new THREE.SphereGeometry(0.0013, 8, 6); xf(haspRivet, [0, 0.0095, 2 * B0 + 0.0016]);
      var lidBrass = mesh(merge([hasp, haspRivet]), M.brass, true, false); pivot.add(lidBrass);
      var knob = new THREE.Object3D(); knob.name = 'musicBoxLidKnob'; knob.position.set(0, 0.0112, 2 * B0 + 0.002); pivot.add(knob);
      // flower on a telescoping post
      var postMesh = mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 1, 8, 1).translate(0, 0.5, 0), M.gold, true, false);
      postMesh.position.set(FX, TRAY, FZ); g.add(postMesh);
      var spinner = new THREE.Group(); spinner.position.set(FX, TRAY + 0.012, FZ); g.add(spinner);
      var fl = [];
      for (var pk = 0; pk < 6; pk++) {
        var pg = new THREE.SphereGeometry(1, 10, 6);
        (function (geo) {
          var P = geo.attributes.position.array, c = new Float32Array(P.length);
          for (var i = 0; i < P.length / 3; i++) { var t = clamp((P[i * 3] + 1) / 2, 0, 1); c[i * 3] = lerp(0.80, 0.95, t); c[i * 3 + 1] = lerp(0.16, 0.42, t); c[i * 3 + 2] = lerp(0.30, 0.52, t); }
          geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        })(pg);
        pg.scale(0.0072, 0.0017, 0.0046); pg.translate(0.0066, 0, 0); pg.rotateZ(0.38); pg.rotateY(pk * PI / 3);
        fl.push(pg);
      }
      for (pk = 0; pk < 2; pk++) {
        var lg = paint(new THREE.SphereGeometry(1, 8, 5), 0.30, 0.56, 0.34);
        lg.scale(0.0062, 0.0010, 0.0026); lg.translate(0.0088, -0.0018, 0); lg.rotateZ(-0.1); lg.rotateY(pk * PI + 0.5); fl.push(lg);
      }
      var gem = paint(new THREE.IcosahedronGeometry(0.0034, 1), 1, 0.97, 0.9); gem.scale(1, 0.7, 1); gem.translate(0, 0.0016, 0); fl.push(gem);
      var flowerMesh = mesh(merge(fl), M.enamel, true, false); spinner.add(flowerMesh);
      var lidV = 0, spinT = 0, spinC = 0, spinA = 0;
      function setLid(v) {
        lidV = clamp(num(v, 0), 0, 1);
        pivot.rotation.x = -lidV * 100 * PI / 180;
        var rise = sstep(0.12, 0.75, lidV), h = lerp(0.0095, 0.031, rise);
        postMesh.scale.y = h; spinner.position.y = TRAY + h;
      }
      setLid(0);
      root.add(g);
      var api = {
        group: g, lid: { pivot: pivot, knob: knob }, flower: spinner,
        setLid: setLid,
        setSpin: function (r) { spinT = num(r, 0); },
        setGlow: GF.makeGlow([lidMesh, lidBrass, baseBrass]),
        clipPlaces: CLIPX.map(function (x) { return [x, TRAY - 0.0016, CLIPZ]; }),
        _update: function (dt) {
          spinC = GF.damp(spinC, spinT, 3.5, dt);
          if (Math.abs(spinC) > 1e-4) { spinA = (spinA + spinC * dt) % TAU; spinner.rotation.y = spinA; }
        }
      };
      Object.defineProperty(api, 'lidOpen', { get: function () { return lidV > 0.5; }, enumerable: true });
      Object.defineProperty(api, 'lidValue', { get: function () { return lidV; }, enumerable: true });
      return api;
    })();

    // ================================================================ HAIR CLIPS
    var clips = (function () {
      var Z0 = 0.0017;
      function snapBase() {
        var L = 0.046, rings = [], n = 22;
        for (var i = 0; i <= n; i++) {
          var t = i / n, x = (t - 0.5) * L, e = Math.abs(2 * x / L);
          var w = 0.0042 * (1 - 0.25 * e * e) * Math.sqrt(Math.max(0.0, 1 - Math.pow(e, 8)));
          var th = 0.0007 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 10)));
          rings.push({ c: [x, 0, 0.0007 - 0.0026 * e * e], u: [0, 0, 1], v: [0, 1, 0], a: Math.max(th, 0.00005), b: Math.max(w, 0.00005), n: 3 });
        }
        var top = loft(rings, 12);
        var r2 = [];
        for (i = 0; i <= n; i++) {
          var t2 = i / n, x2 = (t2 - 0.5) * L * 0.86, e2 = Math.abs(2 * x2 / (L * 0.86));
          var w2 = 0.0026 * Math.sqrt(Math.max(0, 1 - Math.pow(e2, 6)));
          r2.push({ c: [x2, 0, -0.0006 - 0.0020 * e2 * e2], u: [0, 0, 1], v: [0, 1, 0], a: 0.00045 * Math.sqrt(Math.max(0, 1 - Math.pow(e2, 10))) + 0.00003, b: w2 + 0.00003, n: 3 });
        }
        var tongue = loft(r2, 10);
        return merge([top, tongue]);
      }
      function ribbon() {
        var parts = [], side;
        for (side = -1; side <= 1; side += 2) (function (sd) {
          parts.push(gridGeo(low ? 22 : 30, 6, function (u, v, o) {
            var ph = u * TAU, q = v * 2 - 1;
            var cx = sd * 0.0108 * (1 - Math.cos(ph)), cz = Z0 + 0.0046 + 0.0043 * Math.sin(ph);
            var bx = -sd * Math.cos(ph) * 0.0043, bz = Math.sin(ph) * 0.0108, bl = Math.sqrt(bx * bx + bz * bz) || 1;
            var w = 0.0055 + 0.0135 * Math.pow(Math.sin(ph / 2), 1.4);
            var bul = 0.0016 * (1 - q * q) * Math.sin(ph / 2);
            var yc = 0.0032 * (1 - Math.cos(ph)) / 2;
            o[0] = cx + bx / bl * bul; o[1] = yc + q * w / 2 * (1 - 0.08 * Math.sin(ph / 2) * q * q); o[2] = cz + bz / bl * bul;
          }));
          parts.push(gridGeo(10, 4, function (u, v, o) {
            var t = u, q = v * 2 - 1;
            var cx = sd * (0.002 + 0.0105 * t + 0.0025 * t * t), cy = -0.002 - 0.0185 * t, cz = Z0 + 0.0040 - 0.0018 * t + 0.0012 * Math.sin(t * PI);
            var wx = 0.86, wy = sd * 0.5, wz = 0.25 * Math.sin(t * 2.4 + sd);
            var wl = Math.sqrt(wx * wx + wy * wy + wz * wz), hw = 0.0042 * q;
            var notch = t > 0.999 ? 0.0028 * (1 - Math.abs(q)) : 0;
            o[0] = cx + wx / wl * hw; o[1] = cy + wy / wl * hw + notch; o[2] = cz + wz / wl * hw;
          }));
        })(side);
        var knot = new THREE.SphereGeometry(1, 14, 10);
        (function () {
          var P = knot.attributes.position.array;
          for (var i = 0; i < P.length; i += 3) {
            var x = P[i], y = P[i + 1], z = P[i + 2];
            var sx = Math.sign(x) * Math.pow(Math.abs(x), 0.6), sy = Math.sign(y) * Math.pow(Math.abs(y), 0.7);
            var f = 1 + 0.10 * Math.sin(y * 7.5) * (1 - Math.abs(y));
            P[i] = sx * 0.0044 * f; P[i + 1] = sy * 0.0064; P[i + 2] = z * 0.0024 * f;
          }
          knot.translate(0, 0.0006, Z0 + 0.0058); knot.computeVertexNormals();
        })();
        parts.push(knot);
        return merge(parts);
      }
      function daisy() {
        var parts = [], N = 13, layer, k;
        for (layer = 0; layer < 2; layer++) for (k = 0; k < N; k++) (function (ly, kk) {
          var ang = (kk + ly * 0.5) / N * TAU + Math.sin(kk * 7.1) * 0.06, sc = ly ? 0.9 : 1, zb = Z0 + 0.0011 + ly * 0.0008;
          var tilt = 0.10 + 0.05 * Math.sin(kk * 3.3 + ly);
          var ca = Math.cos(ang), sa = Math.sin(ang);
          parts.push(gridGeo(6, 4, function (u, v, o) {
            var q = v * 2 - 1, r = (0.0042 + 0.0168 * u) * sc;
            var wv = u < 0.82 ? (0.58 + 0.42 * u / 0.82) : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.82) / 0.18, 2)));
            var w = 0.0029 * sc * wv;
            var lx = r, ly2 = q * w, lz = zb + r * tilt * 0.35 + 0.0016 * u - 0.0013 * u * u + 0.00035 * q * q;
            o[0] = lx * ca - ly2 * sa; o[1] = lx * sa + ly2 * ca; o[2] = lz;
          }, function (u, v, c) { var t = sstep(0, 0.35, u); c[0] = lerp(0.93, 0.97, t); c[1] = lerp(0.91, 0.965, t); c[2] = lerp(0.80, 0.94, t); }));
        })(layer, k);
        parts.push(gridGeo(24, 6, function (u, v, o) {
          var a = u * TAU, r = 0.0068 * v, bump = 0.00028 * Math.sin(a * 11) * Math.sin(v * 13);
          o[0] = r * Math.cos(a); o[1] = r * Math.sin(a); o[2] = Z0 + 0.0024 + 0.0036 * Math.sqrt(Math.max(0, 1 - v * v)) + bump;
        }, function (u, v, c) { c[0] = lerp(0.88, 0.98, v); c[1] = lerp(0.58, 0.76, v); c[2] = lerp(0.06, 0.14, v); }, true));
        var g = merge(parts);
        // polar grid above has its normal pointing -Z; it is double-sided material so shading is fine
        return g;
      }
      function star() {
        var Ro = 0.0215, Ri = 0.0094, zt = Z0 + 0.0075, zo = Z0 + 0.0013, zi = Z0 + 0.0027, pts = [], k;
        for (k = 0; k < 10; k++) { var a = PI / 2 + k * PI / 5, r = k % 2 ? Ri : Ro; pts.push([r * Math.cos(a), r * Math.sin(a), k % 2 ? zi : zo]); }
        var P = [];
        function tri(a, b, c) { P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
        var top = [0, 0, zt], bot = [0, 0, Z0];
        for (k = 0; k < 10; k++) {
          var p0 = pts[k], p1 = pts[(k + 1) % 10];
          tri(top, p0, p1);
          var b0 = [p0[0], p0[1], Z0], b1 = [p1[0], p1[1], Z0];
          tri(bot, b1, b0);
          tri(p0, b0, b1); tri(p0, b1, p1);
        }
        var g = new THREE.BufferGeometry();
        var pa = new Float32Array(P), uv = new Float32Array(P.length / 3 * 2);
        for (k = 0; k < P.length / 3; k++) { uv[k * 2] = P[k * 3] / 0.05 + 0.5; uv[k * 2 + 1] = P[k * 3 + 1] / 0.05 + 0.5; }
        g.setAttribute('position', new THREE.BufferAttribute(pa, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.computeVertexNormals();
        return g;
      }
      var baseGeo = snapBase();
      var defs = [['ribbon', ribbon(), M.satin], ['flower', daisy(), M.daisy], ['star', star(), M.star]];
      var mbM = musicBox.group;
      mbM.updateMatrixWorld(true);
      var qLay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PI / 2);
      return defs.map(function (d, i) {
        var g = new THREE.Group(); g.name = 'clip_' + d[0];
        var bm = mesh(baseGeo, M.nickel, true, false), om = mesh(d[1], d[2], true, false);
        g.add(bm); g.add(om);
        var pl = musicBox.clipPlaces[i];
        var lp = new THREE.Vector3(pl[0], pl[1] + 0.0026, pl[2]).applyMatrix4(mbM.matrixWorld);
        var lq = mbM.getWorldQuaternion(new THREE.Quaternion()).multiply(qLay);
        var home = { position: lp, quaternion: lq };
        g.position.copy(lp); g.quaternion.copy(lq);
        root.add(g);
        return { id: d[0], group: g, home: home, setGlow: GF.makeGlow([om, bm]) };
      });
    })();

    // ================================================================ POCHETTE
    var pochette = (function () {
      var A = 0.065, B = 0.055, D = 0.020;
      function nOf(s) { return s >= 0 ? 5 : 2.7; }
      function outline(th, out) { var s = Math.sin(th); return sePt(th, A, B, nOf(s), out); }
      function bulgeR(r) { return D * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, r), 4)), 0.42); }
      function rOf(x, y) { var n = nOf(y); return Math.pow(Math.pow(Math.abs(x / A), n) + Math.pow(Math.abs(y / B), n), 1 / n); }
      var op = [0, 0];
      var nu = low ? 30 : 44, nr = low ? 7 : 10;
      var front = gridGeo(nu, nr, function (u, v, o) { outline(-u * TAU, op); o[0] = op[0] * v; o[1] = op[1] * v; o[2] = bulgeR(v); }, null, true);
      var back = gridGeo(nu, nr, function (u, v, o) { outline(u * TAU, op); o[0] = op[0] * v; o[1] = op[1] * v; o[2] = -bulgeR(v); }, null, true);
      var opts3 = [];
      for (var k = 0; k < 64; k++) { outline(k / 64 * TAU, op); opts3.push(new THREE.Vector3(op[0] * 1.004, op[1] * 1.004, 0)); }
      var piping = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(opts3, true), low ? 64 : 96, 0.0021, 6, true);
      function yTop(x) { return B * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x / A), 5)), 1 / 5) - 0.0016; }
      function yBot(s) { return -0.004 - 0.021 * Math.sqrt(Math.max(0, 1 - s * s)); }
      var flap = gridGeo(low ? 16 : 22, low ? 8 : 11, function (u, v, o) {
        var s = u * 2 - 1, t = Math.min(v / 0.86, 1), skirt = v > 0.86 ? (v - 0.86) / 0.14 : 0;
        var x = s * 0.0612, y = lerp(yTop(x), yBot(s), t);
        var edge = 1 - 0.35 * Math.pow(t, 6);
        o[0] = x; o[1] = y - 0.0012 * skirt; o[2] = bulgeR(rOf(x, y)) + (0.0042 + 0.0012 * (1 - t)) * edge * (1 - skirt) + 0.0002 * skirt;
      });
      var fe = [];
      for (k = 0; k <= 24; k++) {
        var fs = -1 + 2 * k / 24, fx = fs * 0.0612, fy = yBot(fs);
        fe.push(new THREE.Vector3(fx, fy - 0.0008, bulgeR(rOf(fx, fy)) + 0.0028));
      }
      fe.unshift(new THREE.Vector3(-0.0612, yTop(-0.0612) - 0.004, bulgeR(rOf(-0.0612, yTop(-0.0612) - 0.004)) + 0.0028));
      fe.push(new THREE.Vector3(0.0612, yTop(0.0612) - 0.004, bulgeR(rOf(0.0612, yTop(0.0612) - 0.004)) + 0.0028));
      var flapPipe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fe, false, 'centripetal'), 48, 0.0019, 6, false);
      var bagGeo = merge([front, back, piping, flap, flapPipe]);
      (function () {
        var P = bagGeo.attributes.position.array, UV = bagGeo.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 9 + P[i * 3 + 2] * 4; UV[i * 2 + 1] = P[i * 3 + 1] * 9 + P[i * 3 + 2] * 4; }
      })();
      var snapY = yBot(0) + 0.0075, snapZ = bulgeR(rOf(0, snapY)) + 0.0042;
      function metalGeo() {
        var sn = new THREE.SphereGeometry(0.0042, 16, 8); sn.scale(1, 1, 0.38); sn.translate(0, snapY, snapZ);
        var r1 = new THREE.TorusGeometry(0.0046, 0.0011, 8, 18); r1.rotateY(PI / 2); r1.translate(-0.052, 0.051, 0);
        var r2 = new THREE.TorusGeometry(0.0046, 0.0011, 8, 18); r2.rotateY(PI / 2); r2.translate(0.052, 0.051, 0);
        return merge([sn, r1, r2]);
      }
      var metal = metalGeo();
      var SW = 0.011, ST = 0.0019;
      // ---- hanging form (origin = top of the strap loop on the finial)
      var g = new THREE.Group(); g.name = 'pochette';
      g.position.set(POS.pochetteHook[0], POS.pochetteHook[1], POS.pochetteHook[2]);
      var BAGZ = 0.046, BAGY = -0.258;
      var bag = mesh(bagGeo, M.leather, true, true); bag.position.set(0, BAGY, BAGZ); g.add(bag);
      var met = mesh(metal, M.gold, true, false); met.position.copy(bag.position); g.add(met);
      var ctrl = [[-0.052, BAGY + 0.056, BAGZ], [-0.043, -0.15, BAGZ - 0.002], [-0.025, -0.08, 0.034], [-0.011, -0.034, 0.024]];
      var RL = 0.019;
      for (k = 0; k <= 12; k++) { var ph = -0.55 - k / 12 * (TAU - 1.1); ctrl.push([RL * Math.sin(ph), -0.0105 - 0.0085 * Math.cos(ph), RL * Math.cos(ph)]); }
      ctrl.push([0.011, -0.034, 0.024], [0.025, -0.08, 0.034], [0.043, -0.15, BAGZ - 0.002], [0.052, BAGY + 0.056, BAGZ]);
      var curve = new THREE.CatmullRomCurve3(ctrl.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), false, 'centripetal');
      var hp = curve.getSpacedPoints(low ? 50 : 80), hn = [];
      hp.forEach(function (p) {
        var w = sstep(-0.034, -0.016, p.y), rl = Math.sqrt(p.x * p.x + p.z * p.z) || 1;
        hn.push(new THREE.Vector3(lerp(0, p.x / rl, w), 0, lerp(1, p.z / rl, w)).normalize());
      });
      var strap = mesh(bandGeo(hp, hn, SW, ST), M.leather, true, false); g.add(strap);
      root.add(g);
      var home = pose(g);
      // ---- worn form (torso-local: origin chest centre between the shoulder blades, +Z = her back)
      var worn = new THREE.Group(); worn.name = 'pochetteWorn'; worn.visible = false;
      var bagW = mesh(bagGeo, M.leather, true, true), metW = mesh(metal, M.gold, true, false);
      var bx = new THREE.Vector3(0.8, 0, 0.6), by = new THREE.Vector3(0, 1, 0), bz = new THREE.Vector3(-0.6, 0, 0.8);
      var bq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
      var bc = new THREE.Vector3(-0.15, -0.24, 0.05);
      bagW.position.copy(bc); bagW.quaternion.copy(bq); metW.position.copy(bc); metW.quaternion.copy(bq);
      worn.add(bagW); worn.add(metW);
      function ringPt(sx) { return bc.clone().addScaledVector(bx, sx * 0.052).addScaledVector(by, 0.056); }
      var EC = new THREE.Vector3(0, -0.02, 0), ER = new THREE.Vector3(0.135 + 0.0062, 0.20 + 0.0062, 0.075 + 0.0062);
      var wc = [ringPt(1), new THREE.Vector3(-0.09, -0.15, 0.07), new THREE.Vector3(-0.035, -0.07, 0.08), new THREE.Vector3(0.025, 0.01, 0.07),
        new THREE.Vector3(0.072, 0.080, 0.045), new THREE.Vector3(0.100, 0.122, 0.0), new THREE.Vector3(0.072, 0.080, -0.045),
        new THREE.Vector3(0.020, 0.0, -0.075), new THREE.Vector3(-0.050, -0.10, -0.075), new THREE.Vector3(-0.115, -0.165, -0.055),
        new THREE.Vector3(-0.165, -0.19, -0.02), ringPt(-1)];
      var wcur = new THREE.CatmullRomCurve3(wc, false, 'centripetal');
      var wp = wcur.getSpacedPoints(low ? 70 : 110), wn = [];
      var tv = new THREE.Vector3();
      wp.forEach(function (p, i) {
        tv.set((p.x - EC.x) / ER.x, (p.y - EC.y) / ER.y, (p.z - EC.z) / ER.z);
        var e = tv.length(), endW = Math.min(i, wp.length - 1 - i) / (wp.length * 0.12);
        var hug = clamp(endW, 0, 1) * sstep(-0.19, -0.13, p.y);
        if (e > 1e-6) {
          var f = e < 1 ? 1 / e : lerp(1, 1 / e, hug);
          p.set(EC.x + (p.x - EC.x) * f, EC.y + (p.y - EC.y) * f, EC.z + (p.z - EC.z) * f);
        }
        var n = new THREE.Vector3((p.x - EC.x) / (ER.x * ER.x), (p.y - EC.y) / (ER.y * ER.y), (p.z - EC.z) / (ER.z * ER.z)).normalize();
        wn.push(n);
      });
      for (var pass = 0; pass < 2; pass++) for (k = 2; k < wp.length - 2; k++) wp[k].lerp(tv.copy(wp[k - 1]).add(wp[k + 1]).multiplyScalar(0.5), 0.5);
      var strapW = mesh(bandGeo(wp, wn, SW, ST), M.leather, true, false); worn.add(strapW);
      // pendulum
      var thz = 0, vz = 0, thx = 0, vx = 0, swinging = false;
      var api = {
        group: g, home: home, worn: worn,
        setWorn: function (b) { b = !!b; worn.visible = b; g.visible = !b; },
        swing: function (imp) {
          var ix, iz;
          if (imp && typeof imp === 'object') { ix = num(imp.x, 0); iz = num(imp.z, 0); }
          else { ix = num(imp, 0); iz = ix * 0.35; }
          vz += clamp(ix, -3, 3) * 2.2; vx -= Math.abs(clamp(iz, -3, 3)) * 1.2; swinging = true;
        },
        setGlow: GF.makeGlow([bag, strap]),
        _update: function (dt) {
          if (!swinging) return;
          var w2 = 30, c = 0.55;
          vz += (-w2 * thz - c * vz) * dt; thz += vz * dt;
          vx += (-w2 * thx - c * vx) * dt; thx += vx * dt;
          if (thx > 0) { thx = 0; vx = -vx * 0.3; }   // the chair back stops it
          thz = clamp(thz, -0.6, 0.6); thx = clamp(thx, -0.5, 0);
          g.rotation.set(thx, 0, thz);
          if (Math.abs(thz) + Math.abs(vz) * 0.2 + Math.abs(thx) + Math.abs(vx) * 0.2 < 0.0005) { thz = vz = thx = vx = 0; g.rotation.set(0, 0, 0); swinging = false; }
        }
      };
      return api;
    })();

    // ================================================================ TOWEL
    var towel = (function () {
      var NU = low ? 24 : 34, NV = low ? 18 : 26, NG = NU * NV;
      var XMIN = -0.31, XMAX = 0.31, ZMIN = -0.106, ZMAX = 0.35, TH = 0.0045;
      // ---- hanging hull of head + neck + shoulders (head-local), per horizontal direction
      var H = GF.HEAD, IA = H.skull[0] + 0.022, IB = H.skull[1] + 0.019, IC = H.skull[2] + 0.020;
      var SC = H.torsoC, SR = [H.torsoR[0] + 0.013, H.torsoR[1] + 0.013, H.torsoR[2] + 0.013];
      var NPSI = 64, ND = 34, NB = 70, NK = ND + NB;
      var tY = new Float32Array(NPSI * NK), tR = new Float32Array(NPSI * NK), tS = new Float32Array(NPSI * NK);
      function bodyR(y, hx, hz) {
        var r = 0, k, t;
        if (y > -IB && y < IB) { k = Math.sqrt(1 - (y / IB) * (y / IB)); r = 1 / Math.sqrt(Math.pow(hx / (IA * k), 2) + Math.pow(hz / (IC * k), 2)); }
        if (y < -0.055 && y > -0.18) r = Math.max(r, H.neckR + 0.014);
        var dy = (y - SC[1]) / SR[1];
        if (dy > -1 && dy < 1) {
          k = Math.sqrt(1 - dy * dy);
          var ax = SR[0] * k, az = SR[2] * k, zc = SC[2];
          var a2 = hx * hx / (ax * ax) + hz * hz / (az * az), b1 = -2 * hz * zc / (az * az), c0 = zc * zc / (az * az) - 1;
          var disc = b1 * b1 - 4 * a2 * c0;
          if (disc > 0) { t = (-b1 + Math.sqrt(disc)) / (2 * a2); r = Math.max(r, t); }
        }
        return r;
      }
      for (var pi = 0; pi < NPSI; pi++) {
        var psi = -PI + pi / NPSI * TAU, hx = Math.sin(psi), hz = Math.cos(psi);
        var rEq = 1 / Math.sqrt(Math.pow(hx / IA, 2) + Math.pow(hz / IC, 2));
        var o = pi * NK, R = 0, s = 0, py = IB, pr = 0;
        for (var kk = 0; kk < NK; kk++) {
          var y, r;
          if (kk < ND) { var ph = kk / (ND - 1) * PI / 2; y = IB * Math.cos(ph); r = rEq * Math.sin(ph); }
          else { y = -(kk - ND + 1) / NB * 0.66; r = bodyR(y, hx, hz); }
          R = Math.max(R, r);
          if (kk > 0) s += Math.sqrt((R - pr) * (R - pr) + (y - py) * (y - py));
          tY[o + kk] = y; tR[o + kk] = R; tS[o + kk] = s; py = y; pr = R;
        }
      }
      var look = [0, 0];
      function lookup(pi, sg, out) {
        var o = pi * NK;
        if (sg >= tS[o + NK - 1]) { out[0] = tY[o + NK - 1] - (sg - tS[o + NK - 1]); out[1] = tR[o + NK - 1]; return; }
        var lo = 0, hi = NK - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (tS[o + mid] <= sg) lo = mid; else hi = mid; }
        var f = (sg - tS[o + lo]) / Math.max(1e-9, tS[o + hi] - tS[o + lo]);
        out[0] = lerp(tY[o + lo], tY[o + hi], f); out[1] = lerp(tR[o + lo], tR[o + hi], f);
      }
      function hoodMap(x, z, foldK, out, oi) {
        var sg = Math.sqrt(x * x + z * z), psi = Math.atan2(x, z);
        var fi = (psi + PI) / TAU * NPSI, i0 = Math.floor(fi), f = fi - i0;
        i0 = ((i0 % NPSI) + NPSI) % NPSI; var i1 = (i0 + 1) % NPSI;
        lookup(i0, sg, look); var y0 = look[0], r0 = look[1];
        lookup(i1, sg, look); var y = lerp(y0, look[0], f), R = lerp(r0, look[1], f);
        var excess = Math.max(0, sg - R);
        var fp = 0.5 + 0.5 * Math.cos(psi * 12 + 2.6 * Math.sin(psi * 3 + 0.6) + sg * 9 + 1.4 * Math.sin(sg * 13 + psi * 4));
        fp = fp * fp * (3 - 2 * fp);
        var amp = 0.5 + 0.9 * GF.noise2(psi * 2.3 + 3.1, sg * 4);
        var depth = foldK * sstep(0.07, 0.22, sg) * Math.min(0.022, excess * 0.11 + 0.002) * amp;
        var room = Math.max(0, R - bodyR(y, Math.sin(psi), Math.cos(psi)) - 0.005);
        var A = depth * fp - Math.min(room, depth, 0.003) * (1 - fp);
        // a thick terry towel never hugs the skull perfectly: soft low puffs everywhere
        A += 0.0045 * GF.noise2(x * 9 + 7.3, z * 9 + 1.1) + 0.003 * sstep(0.0, 0.08, sg) * (1 - sstep(0.12, 0.2, sg));
        R += A;
        out[oi] = R * Math.sin(psi); out[oi + 1] = y - A * 0.3; out[oi + 2] = R * Math.cos(psi);
      }
      // ---- hung over the chair rail (world)
      var RAIL = POS.towelRail, HX = RAIL[0] + 0.005, RY = RAIL[1] - 0.015, RZ = RAIL[2], ZTOP = 0.108;
      function hungMap(x, z, fa, t, out, oi) {
        var q = (x - XMIN) / (XMAX - XMIN) * 4, k = Math.min(3, Math.floor(q)), f = q - k, xs = (k % 2 === 0) ? f : 1 - f;
        var r = 0.0175 + k * 0.0046, a = z - ZTOP, qa = PI * r / 2;
        var px = HX + (xs - 0.5) * 0.16, py, pz;
        if (Math.abs(a) <= qa) { var th = a / r; py = RY + r * Math.cos(th); pz = RZ + r * Math.sin(th); }
        else {
          var hang = Math.abs(a) - qa, sgn = a > 0 ? 1 : -1, hn = hang / 0.25;
          var fold = 0.004 * Math.sin(px * 70 + k * 1.3) * hn + 0.006 * hn * hn;
          py = RY - hang; pz = RZ + sgn * (r + fold);
          if (sgn > 0 && fa > 0) {
            pz += fa * (0.045 * Math.pow(hn, 1.5) * (0.75 + 0.25 * Math.sin(t * 9 + px * 25)) + 0.007 * Math.sin(t * 17 + hang * 34 + px * 40) * hn);
            py += fa * 0.025 * hn * hn;
            px += fa * 0.004 * Math.sin(t * 13 + hang * 20) * hn;
          }
        }
        out[oi] = px; out[oi + 1] = py; out[oi + 2] = pz;
      }
      // ---- two-layer cloth mesh
      var PER = 2 * (NU - 1) + 2 * (NV - 1), perim = [], inward = [], i, j;
      for (i = 0; i < NU; i++) perim.push(i);
      for (j = 1; j < NV; j++) perim.push(j * NU + NU - 1);
      for (i = NU - 2; i >= 0; i--) perim.push((NV - 1) * NU + i);
      for (j = NV - 2; j >= 1; j--) perim.push(j * NU);
      perim.forEach(function (gi) {
        var ii = gi % NU, jj = Math.floor(gi / NU);
        var ni = ii === 0 ? 1 : (ii === NU - 1 ? NU - 2 : ii), nj = jj === 0 ? 1 : (jj === NV - 1 ? NV - 2 : jj);
        inward.push(nj * NU + ni);
      });
      var FX = new Float32Array(NG), FZ = new Float32Array(NG);
      for (j = 0; j < NV; j++) for (i = 0; i < NU; i++) { FX[j * NU + i] = lerp(XMIN, XMAX, i / (NU - 1)); FZ[j * NU + i] = lerp(ZMIN, ZMAX, j / (NV - 1)); }
      function makeCloth() {
        var nV = NG * 2 + PER * 2;
        var pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv0 = new Float32Array(nV * 2), uv1 = new Float32Array(nV * 2);
        var idx = [], a, b, c, d, k;
        for (k = 0; k < NG; k++) {
          uv0[k * 2] = uv0[(k + NG) * 2] = FX[k] * terryRep; uv0[k * 2 + 1] = uv0[(k + NG) * 2 + 1] = FZ[k] * terryRep;
          uv1[k * 2] = uv1[(k + NG) * 2] = (FX[k] - XMIN) / (XMAX - XMIN); uv1[k * 2 + 1] = uv1[(k + NG) * 2 + 1] = (FZ[k] - ZMIN) / (ZMAX - ZMIN);
        }
        for (k = 0; k < PER; k++) for (var e = 0; e < 2; e++) {
          var vi = NG * 2 + k * 2 + e, src = perim[k];
          uv0[vi * 2] = uv0[src * 2]; uv0[vi * 2 + 1] = uv0[src * 2 + 1]; uv1[vi * 2] = uv1[src * 2]; uv1[vi * 2 + 1] = uv1[src * 2 + 1];
        }
        for (j = 0; j < NV - 1; j++) for (i = 0; i < NU - 1; i++) {
          a = j * NU + i; b = a + 1; c = a + NU; d = c + 1;
          idx.push(a, c, b, b, c, d);
          idx.push(a + NG, b + NG, c + NG, b + NG, d + NG, c + NG);
        }
        for (k = 0; k < PER; k++) {
          var k1 = (k + 1) % PER, ok = NG * 2 + k * 2, ok1 = NG * 2 + k1 * 2;
          idx.push(ok, ok + 1, ok1, ok1, ok + 1, ok1 + 1);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv0, 2));
        geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
        geo.setIndex(idx);
        var P = new Float32Array(NG * 3);
        return {
          geo: geo, P: P,
          commit: function () {
            var jj, ii, k3;
            for (jj = 0; jj < NV; jj++) for (ii = 0; ii < NU; ii++) {
              var i0 = (jj * NU + Math.max(0, ii - 1)) * 3, i1 = (jj * NU + Math.min(NU - 1, ii + 1)) * 3;
              var j0 = (Math.max(0, jj - 1) * NU + ii) * 3, j1 = (Math.min(NV - 1, jj + 1) * NU + ii) * 3;
              var ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2];
              var vx = P[j1] - P[j0], vy = P[j1 + 1] - P[j0 + 1], vz = P[j1 + 2] - P[j0 + 2];
              var nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
              nx /= nl; ny /= nl; nz /= nl;
              k3 = (jj * NU + ii) * 3;
              pos[k3] = P[k3]; pos[k3 + 1] = P[k3 + 1]; pos[k3 + 2] = P[k3 + 2];
              nor[k3] = nx; nor[k3 + 1] = ny; nor[k3 + 2] = nz;
              var q3 = k3 + NG * 3;
              pos[q3] = P[k3] - nx * TH; pos[q3 + 1] = P[k3 + 1] - ny * TH; pos[q3 + 2] = P[k3 + 2] - nz * TH;
              nor[q3] = -nx; nor[q3 + 1] = -ny; nor[q3 + 2] = -nz;
            }
            for (var k = 0; k < PER; k++) {
              var s3 = perim[k] * 3, w3 = inward[k] * 3, o3 = (NG * 2 + k * 2) * 3;
              var ex = P[s3] - P[w3], ey = P[s3 + 1] - P[w3 + 1], ez = P[s3 + 2] - P[w3 + 2], el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
              ex /= el; ey /= el; ez /= el;
              pos[o3] = pos[s3]; pos[o3 + 1] = pos[s3 + 1]; pos[o3 + 2] = pos[s3 + 2];
              pos[o3 + 3] = pos[s3 + NG * 3]; pos[o3 + 4] = pos[s3 + NG * 3 + 1]; pos[o3 + 5] = pos[s3 + NG * 3 + 2];
              nor[o3] = nor[o3 + 3] = ex; nor[o3 + 1] = nor[o3 + 4] = ey; nor[o3 + 2] = nor[o3 + 5] = ez;
            }
            geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
          }
        };
      }
      var headC = makeCloth(), hungC = makeCloth();
      var headMesh = mesh(headC.geo, M.terry, true, true); headMesh.frustumCulled = false; headMesh.name = 'towelHead';
      var hungMesh = mesh(hungC.geo, M.terry, true, true); hungMesh.frustumCulled = false; hungMesh.name = 'towelHung';
      var head = new THREE.Group(); head.name = 'towelHead'; head.add(headMesh);
      var hung = new THREE.Group(); hung.name = 'towelHung'; hung.add(hungMesh); root.add(hung);
      // the hung shape seen from the head frame (for the end of the slide)
      var HS = POS.headSit, hungLocal = new Float32Array(NG * 3);
      for (k = 0; k < NG; k++) { hungMap(FX[k], FZ[k], 0, 0, hungLocal, k * 3); hungLocal[k * 3] -= HS[0]; hungLocal[k * 3 + 1] -= HS[1]; hungLocal[k * 3 + 2] -= HS[2]; }
      var k;
      var slideP = -1, slideDx = 0;
      function setSlide(p, dx) {
        p = clamp(num(p, 0), 0, 1); dx = clamp(num(dx, 0), -1, 1);
        if (Math.abs(p - slideP) < 1e-4 && Math.abs(dx - slideDx) < 1e-4) return;
        slideP = p; slideDx = dx;
        var pe = GF.ease.inOut(clamp(p / 0.62, 0, 1)), bl = GF.ease.inOut(sstep(0.52, 1.0, p)), P = headC.P;
        for (var q = 0; q < NG; q++) {
          var zn = (FZ[q] - ZMIN) / (ZMAX - ZMIN);
          var sh = 0.40 * pe * (0.78 + 0.22 * zn);
          var xs = FX[q] * (1 - 0.12 * pe * (1 - zn)) + dx * 0.075 * pe * (0.4 + 0.6 * zn);
          hoodMap(xs, FZ[q] + sh, 1 + 1.6 * pe, P, q * 3);
          if (bl > 0) {
            var sag = 0.06 * Math.sin(bl * PI);
            P[q * 3] = lerp(P[q * 3], hungLocal[q * 3], bl);
            P[q * 3 + 1] = lerp(P[q * 3 + 1], hungLocal[q * 3 + 1], bl) - sag * (0.5 + 0.5 * zn);
            P[q * 3 + 2] = lerp(P[q * 3 + 2], hungLocal[q * 3 + 2], bl) + sag * 0.4;
          }
        }
        headC.commit();
      }
      var flapT = 0, flapC = 0, flapDirty = true;
      function writeHung(t) {
        var P = hungC.P;
        for (var q = 0; q < NG; q++) hungMap(FX[q], FZ[q], flapC, t, P, q * 3);
        hungC.commit();
      }
      setSlide(0, 0); writeHung(0);
      var state = 'head';
      function setState(s) {
        if (s !== 'head' && s !== 'hung' && s !== 'hidden') return;
        state = s; head.visible = s === 'head'; hung.visible = s === 'hung';
      }
      setState('hidden'); state = 'head'; head.visible = true;
      return {
        head: head, hung: hung,
        setState: setState,
        setSlide: setSlide,
        flap: function (v) { flapT = Math.max(flapT, clamp(num(v, 0), 0, 1)); },
        setGlow: GF.makeGlow([headMesh]),
        _update: function (dt, t) {
          flapC = GF.damp(flapC, flapT, 5, dt);
          flapT *= Math.exp(-5 * dt);
          if (flapC < 0.0015) { if (flapC > 0 || flapDirty) { flapC = 0; flapDirty = false; if (hung.visible) writeHung(t); else flapDirty = true; } return; }
          if (hung.visible) writeHung(t);
          flapDirty = true;
        }
      };
    })();

    // ================================================================ DEMO FINGER
    var finger = (function () {
      var g = new THREE.Group(); g.name = 'demoFinger'; g.visible = false;
      var tab = [[0.0000, 0.0010, 0.0009, 0], [0.0008, 0.0042, 0.0036, -0.0004], [0.0025, 0.0062, 0.0055, -0.0006], [0.0055, 0.0074, 0.0066, -0.0006],
        [0.0110, 0.0080, 0.0070, -0.0004], [0.0200, 0.0080, 0.0069, -0.0002], [0.0270, 0.0086, 0.0073, 0], [0.0340, 0.0083, 0.0071, 0],
        [0.0450, 0.0087, 0.0074, 0], [0.0520, 0.0093, 0.0079, 0.0002], [0.0600, 0.0091, 0.0078, 0], [0.0700, 0.0096, 0.0081, 0],
        [0.0780, 0.0128, 0.0094, 0.0005], [0.0850, 0.0192, 0.0110, 0.0010], [0.0920, 0.0262, 0.0124, 0.0015], [0.1000, 0.0305, 0.0130, 0.0020]];
      var fg = loft(tab.map(function (r) { return { c: [0, r[0], r[3]], u: [1, 0, 0], v: [0, 0, 1], a: r[1], b: r[2], n: 2.1 }; }), 24);
      function abAt(y) {
        for (var i = 0; i < tab.length - 1; i++) if (y <= tab[i + 1][0]) { var t = (y - tab[i][0]) / (tab[i + 1][0] - tab[i][0]); return [lerp(tab[i][1], tab[i + 1][1], t), lerp(tab[i][2], tab[i + 1][2], t), lerp(tab[i][3], tab[i + 1][3], t)]; }
        return [tab[tab.length - 1][1], tab[tab.length - 1][2], 0];
      }
      var nail = gridGeo(6, 8, function (u, v, o) {
        var y = 0.0028 + v * 0.0112, ab = abAt(y), xw = (u * 2 - 1) * ab[0] * 0.66 * (v < 0.15 ? 0.75 + v / 0.15 * 0.25 : 1);
        o[0] = xw; o[1] = y; o[2] = ab[2] + ab[1] * Math.sqrt(Math.max(0, 1 - Math.pow(xw / ab[0], 2))) + 0.00035;
      }, function (u, v, c) { c[0] = 1.0; c[1] = 0.86; c[2] = 0.84; });
      var geo = merge([fg, nail]);
      var P = geo.attributes.position.array, C3 = geo.attributes.color.array, n = P.length / 3, C4 = new Float32Array(n * 4);
      for (var i = 0; i < n; i++) {
        var y = P[i * 3 + 1], back = P[i * 3 + 2] > 0 ? 1 : 0;
        var crease = back * (Math.exp(-Math.pow((y - 0.027) / 0.0016, 2)) + Math.exp(-Math.pow((y - 0.052) / 0.002, 2))) * 0.12;
        C4[i * 4] = C3[i * 3] * (1 - crease); C4[i * 4 + 1] = C3[i * 3 + 1] * (1 - crease * 1.2); C4[i * 4 + 2] = C3[i * 3 + 2] * (1 - crease * 1.2);
        C4[i * 4 + 3] = 1 - sstep(0.064, 0.098, y);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(C4, 4));
      var fm = mesh(geo, M.skin, false, false); fm.renderOrder = 10; g.add(fm);
      var rimMat = new THREE.MeshBasicMaterial({ color: 0x8a5038, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, vertexColors: true });
      var rim = mesh(geo, rimMat, false, false); rim.renderOrder = 9; rim.scale.set(1.16, 1.012, 1.2); g.add(rim);
      root.add(g);
      return {
        group: g,
        setOpacity: function (v) { v = clamp(num(v, 0), 0, 1); M.skin.opacity = 0.94 * v; rimMat.opacity = 0.5 * v; g.visible = v > 0.003; }
      };
    })();

    // ================================================================ public object
    return {
      group: root,
      dryer: { group: dryer.group, nozzle: dryer.nozzle, home: dryer.home, setOn: dryer.setOn, setGlow: dryer.setGlow, updateCord: dryer.updateCord },
      brush: { group: brush.group, home: brush.home, setGlow: brush.setGlow },
      tissue: tissue,
      musicBox: musicBox,
      clips: clips,
      pochette: pochette,
      towel: { head: towel.head, hung: towel.hung, setState: towel.setState, setSlide: towel.setSlide, flap: towel.flap, setGlow: towel.setGlow },
      finger: finger,
      update: function (dt, t) {
        dt = clamp(num(dt, 0), 0, 0.05); t = num(t, 0);
        dryer._update(dt);
        tissue._update(dt);
        musicBox._update(dt);
        pochette._update(dt);
        towel._update(dt, t);
      }
    };
  };
})();
