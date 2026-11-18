/* sets.js — the two environments: Mum's bedroom corner with the three-panel dresser (+ real planar mirror)
   and the genkan (front entrance) with the garden outside. GF.createSets({renderer, low}). See CONTRACT.md. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var T = THREE;
  var TAU = Math.PI * 2;

  // =====================================================================================
  // small geometry kit
  // =====================================================================================
  var _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function xf(g, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    _v.set(x || 0, y || 0, z || 0);
    if (sx === undefined) sx = 1;
    if (sy === undefined) sy = sx;
    if (sz === undefined) sz = sx;
    _s.set(sx, sy, sz);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    return g;
  }
  function hash(ix, iy) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  // random table (256 x 256 tile) for per-pixel speckle
  var RAND = (function () { var r = GF.rng(1234), a = new Float32Array(65536); for (var i = 0; i < 65536; i++) a[i] = r(); return a; })();
  // smooth periodic value-noise field w x h (cell size cx x cy px) -> Float32Array in [0,1]
  function field(w, h, cx, cy, seed) {
    var P = Math.max(1, Math.round(w / cx)), Q = Math.max(1, Math.round(h / cy)), i, x, y;
    var L = new Float32Array(P * Q), r = GF.rng(seed * 7919 + 1);
    for (i = 0; i < P * Q; i++) L[i] = r();
    var out = new Float32Array(w * h), X0 = new Int32Array(w), X1 = new Int32Array(w), WX = new Float32Array(w);
    for (x = 0; x < w; x++) { var fx = x * P / w, ix = fx | 0, t = fx - ix; X0[x] = ix % P; X1[x] = (ix + 1) % P; WX[x] = t * t * (3 - 2 * t); }
    for (y = 0; y < h; y++) {
      var fy = y * Q / h, iy = fy | 0, ty = fy - iy, wy = ty * ty * (3 - 2 * ty), r0 = (iy % Q) * P, r1 = ((iy + 1) % Q) * P, o = y * w;
      for (x = 0; x < w; x++) {
        var a = L[r0 + X0[x]], b = L[r0 + X1[x]], c = L[r1 + X0[x]], dd = L[r1 + X1[x]], wx = WX[x];
        var top = a + (b - a) * wx; out[o + x] = top + (c + (dd - c) * wx - top) * wy;
      }
    }
    return out;
  }
  // 1-D wood grain profile (periodic, length len): fine fibres + thin dark latewood lines. Returns offsets ~ -0.2..0.05
  function grain(len, seed, spacing, sc) {
    var G = new Float32Array(len), r = GF.rng(seed), i, k;
    for (i = 0; i < len; i++) G[i] = 0.05 * (GF.noise2(i * 0.45 / sc, seed) - 0.5) + 0.07 * (GF.noise2(i * 0.02 / sc, seed + 3.3) - 0.5);
    for (var p = r() * spacing; p < len; p += spacing * (0.45 + r() * 1.1)) {
      var wd = (0.7 + r() * 1.6) * sc, dk = 0.05 + 0.11 * r() * r() + 0.04;
      for (k = -6; k <= 6; k++) { var q = Math.floor(p) + k, dq = (q - p) / wd; G[((q % len) + len) % len] -= dk * Math.exp(-dq * dq); }
    }
    return G;
  }
  function n3(x, y, z) { return (GF.noise2(x, y) + GF.noise2(y + 5.2, z + 1.3) + GF.noise2(z + 9.1, x + 3.7)) / 3; }

  // rounded box (centred), s = segments per rounded edge
  function rbox(w, h, d, r, s) {
    s = Math.max(1, s | 0);
    r = Math.max(0.0004, Math.min(r, w * 0.499, h * 0.499, d * 0.499));
    var N = 2 * s + 1, g = new T.BoxGeometry(1, 1, 1, N, N, N);
    var P = g.attributes.position, Nn = g.attributes.normal, hs = [w / 2, h / 2, d / 2];
    var c = [0, 0, 0], inn = [0, 0, 0];
    for (var i = 0; i < P.count; i++) {
      c[0] = P.getX(i); c[1] = P.getY(i); c[2] = P.getZ(i);
      for (var a = 0; a < 3; a++) {
        var k = Math.round((c[a] + 0.5) * N), hh = hs[a];
        var t = k <= s ? -hh + r * k / s : hh - r * (N - k) / s;
        c[a] = t; inn[a] = Math.max(-hh + r, Math.min(hh - r, t));
      }
      var dx = c[0] - inn[0], dy = c[1] - inn[1], dz = c[2] - inn[2];
      var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      P.setXYZ(i, inn[0] + dx / L * r, inn[1] + dy / L * r, inn[2] + dz / L * r);
      Nn.setXYZ(i, dx / L, dy / L, dz / L);
    }
    return g;
  }
  function boxAt(x0, x1, y0, y1, z0, z1, r, s) {
    var g = rbox(x1 - x0, y1 - y0, z1 - z0, r, s);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  }
  function lathe(pts, seg) {
    var v = []; for (var i = 0; i < pts.length; i++) v.push(new T.Vector2(pts[i][0], pts[i][1]));
    return new T.LatheGeometry(v, seg || 16);
  }
  // box-projected UVs in object/world units: sc = texture repeats per metre. Grain of wood textures runs along u.
  function boxUV(g, sc, vert, ou, ov) {
    var P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    if (!U) { U = new T.BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv', U); }
    ou = ou || 0; ov = ov || 0;
    for (var i = 0; i < P.count; i++) {
      var nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      var x = P.getX(i), y = P.getY(i), z = P.getZ(i), u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
      if (vert && ny < Math.max(nx, nz)) { var t = u; u = v; v = t; }
      U.setXY(i, u * sc + ou, v * sc + ov);
    }
    return g;
  }
  function planarUV(g, ua, va, su, sv, ou, ov) {
    var P = g.attributes.position, U = g.attributes.uv;
    if (!U) { U = new T.BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv', U); }
    for (var i = 0; i < P.count; i++) U.setXY(i, P.getComponent(i, ua) * su + (ou || 0), P.getComponent(i, va) * sv + (ov || 0));
    return g;
  }
  function tint(g, hex, jit, rnd) {
    var c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    var k = jit ? 1 + (rnd() - 0.5) * jit : 1;
    for (var i = 0; i < n; i++) { a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
  }
  // weld-by-position smooth normals (works for non-indexed and seamed geometry)
  function smoothNormals(g) {
    var P = g.attributes.position, n = P.count, idx = g.index ? g.index.array : null;
    var map = new Map(), id = new Int32Array(n), cnt = 0;
    for (var i = 0; i < n; i++) {
      var key = (Math.round(P.getX(i) * 1000) + 65536) + 131072 * ((Math.round(P.getY(i) * 1000) + 65536) + 131072 * (Math.round(P.getZ(i) * 1000) + 65536));
      var k = map.get(key); if (k === undefined) { k = cnt++; map.set(key, k); } id[i] = k;
    }
    var acc = new Float32Array(cnt * 3), tri = idx ? idx.length / 3 : n / 3;
    var a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3();
    for (var t = 0; t < tri; t++) {
      var i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      var ids = [id[i0], id[i1], id[i2]];
      for (var j = 0; j < 3; j++) { acc[ids[j] * 3] += e1.x; acc[ids[j] * 3 + 1] += e1.y; acc[ids[j] * 3 + 2] += e1.z; }
    }
    var N = g.attributes.normal || new T.BufferAttribute(new Float32Array(n * 3), 3);
    for (var v = 0; v < n; v++) {
      var q = id[v] * 3; a.set(acc[q], acc[q + 1], acc[q + 2]).normalize();
      N.setXYZ(v, a.x, a.y, a.z);
    }
    g.setAttribute('normal', N);
    return g;
  }
  function merge(list) {
    var nv = 0, ni = 0, hasC = false, i, j;
    for (i = 0; i < list.length; i++) {
      var g = list[i]; nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
      if (g.attributes.color) hasC = true;
    }
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    var col = hasC ? new Float32Array(nv * 3) : null;
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var G = list[i], cnt = G.attributes.position.count;
      if (!G.attributes.normal) G.computeVertexNormals();
      pos.set(G.attributes.position.array.subarray(0, cnt * 3), vo * 3);
      nor.set(G.attributes.normal.array.subarray(0, cnt * 3), vo * 3);
      if (G.attributes.uv) uv.set(G.attributes.uv.array.subarray(0, cnt * 2), vo * 2);
      if (col) {
        if (G.attributes.color && G.attributes.color.itemSize === 3) col.set(G.attributes.color.array.subarray(0, cnt * 3), vo * 3);
        else for (j = 0; j < cnt * 3; j++) col[vo * 3 + j] = 1;
      }
      if (G.index) { var ia = G.index.array; for (j = 0; j < ia.length; j++) idx[io++] = ia[j] + vo; }
      else for (j = 0; j < cnt; j++) idx[io++] = vo + j;
      vo += cnt;
      G.dispose();
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.setIndex(new T.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  function mesh(geo, mat, cast, recv, name) {
    var m = new T.Mesh(geo, mat);
    m.castShadow = !!cast; m.receiveShadow = !!recv;
    if (name) m.name = name;
    return m;
  }
  // a quad from 4 corners (a,b,c,d counter-clockwise seen from the front), UV 0..1
  function quad(a, b, c, d) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]]), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }
  // organic blob (bush / tree canopy): displaced icosphere with vertex-colour AO
  function blob(r, detail, amp, freq, seed, col, rnd, flat) {
    var g = new T.IcosahedronGeometry(r, detail), P = g.attributes.position;
    var base = new T.Color(col), cc = new T.Color(), ca = new Float32Array(P.count * 3);
    for (var i = 0; i < P.count; i++) {
      var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      var n = n3(x * freq + seed, y * freq, z * freq - seed) - 0.5;
      var n2 = n3(x * freq * 3.1 - seed, y * freq * 3.1, z * freq * 3.1) - 0.5;
      var k = 1 + amp * n + amp * 0.45 * n2;
      if (flat && y < -r * 0.25) y = -r * 0.25 + (y + r * 0.25) * 0.35;
      P.setXYZ(i, x * k, y * k, z * k);
      var ao = GF.clamp(0.55 + 0.45 * (y / r + 1) * 0.6 + n * 0.8, 0.35, 1.15);
      cc.copy(base).multiplyScalar(ao * (0.9 + 0.2 * hash(i * 7 + seed * 13 | 0, 3)));
      ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new T.BufferAttribute(ca, 3));
    smoothNormals(g);
    return g;
  }

  // =====================================================================================
  // procedural textures (12 canvases)
  // =====================================================================================
  function makeTextures(low, aniso) {
    var X = {};
    function rep(t) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; return t; }

    // 1) oak plank floor (planks run along v). Texture spans 1.2 m x 1.2 m, 8 planks.
    var FS = low ? 512 : 1024;
    X.floor = rep(GF.canvasTex(FS, FS, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, r = GF.rng(7);
      var NP = 8, pw = w / NP, sc = w / 1024, GL = 4096, G = grain(GL, 11, 9 * sc, sc);
      var TF = field(w, h, w / 8, h / 2, 5);
      var pl = [], p, x, y;
      for (p = 0; p < NP; p++) {
        var j0 = r() * h, j1 = (j0 + h * (0.38 + r() * 0.26)) % h;
        pl.push({ a: Math.min(j0, j1), b: Math.max(j0, j1), ph: r() * TAU,
          s: [{ o: (r() * GL) | 0, t: 0.9 + r() * 0.16, hu: r() - 0.5 }, { o: (r() * GL) | 0, t: 0.9 + r() * 0.16, hu: r() - 0.5 }] });
      }
      var warp = new Float32Array(NP);
      for (y = 0; y < h; y++) {
        var yy = y / h * TAU;
        for (p = 0; p < NP; p++) warp[p] = (3 * Math.sin(yy * 2 + pl[p].ph) + 1.5 * Math.sin(yy * 5 + pl[p].ph * 2)) * sc;
        for (x = 0; x < w; x++) {
          var pi = (x / pw) | 0, P = pl[pi], lx = x - pi * pw;
          var S = (y >= P.a && y < P.b) ? P.s[0] : P.s[1];
          var gi = (S.o + ((lx + warp[pi]) | 0)) & (GL - 1);
          var sh = S.t * (1 + G[gi]) * (0.96 + 0.08 * TF[y * w + x]);
          var e = Math.min(lx, pw - 1 - lx) / sc, dj = Math.min(Math.abs(y - P.a), Math.abs(y - P.b)) / sc;
          if (e < 1.1 || dj < 1.0) sh *= 0.5; else if (e < 2.3 || dj < 2.0) sh *= 0.88;
          sh *= 0.97 + 0.06 * RAND[((y & 255) << 8) | (x & 255)];
          var k = (y * w + x) * 4;
          d[k] = 168 * sh * (1 + 0.05 * S.hu); d[k + 1] = 124 * sh; d[k + 2] = 86 * sh * (1 - 0.08 * S.hu); d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }, { aniso: aniso }));

    // 2) off-white wallpaper (fine woven vinyl look). 512 px = 0.5 m
    X.wall = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F1 = field(w, h, 4, 4, 2), F2 = field(w, h, 32, 32, 3);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var v = 0.95 + 0.032 * (F1[i] - 0.5) + 0.022 * (F2[i] - 0.5) + 0.02 * (RAND[((y & 255) << 8) | (x & 255)] - 0.5);
        v += 0.008 * ((x & 3) < 2 ? 1 : -1) * ((y & 3) < 2 ? 1 : -1);
        var k = i * 4;
        d[k] = 238 * v; d[k + 1] = 230 * v; d[k + 2] = 216 * v; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 3) light natural oak for furniture (grain along u). 512 px = 0.6 m
    X.wood = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, GL = 2048, G = grain(GL, 23, 7, 1);
      var TF = field(w, h, 128, 64, 8), wx = new Float32Array(w), x, y;
      for (x = 0; x < w; x++) { var xx = x / w * TAU; wx[x] = 3 * Math.sin(xx + 1.3) + 1.6 * Math.sin(xx * 2 + 0.4) + 0.8 * Math.sin(xx * 5 + 2.0); }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var i = y * w + x, gi = ((y + wx[x] + 512) | 0) & (GL - 1);
        var sh = (1 + G[gi]) * (0.95 + 0.1 * TF[i]);
        if (RAND[((y & 255) << 8) | ((x >> 1) & 255)] < 0.01) sh *= 0.9;
        var k = i * 4;
        d[k] = 206 * sh; d[k + 1] = 164 * sh; d[k + 2] = 116 * sh; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 4) woven fabric (neutral, tinted by material colour). 256 px = 0.12 m
    X.fabric = rep(GF.canvasTex(256, 256, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F = field(w, h, 2, 24, 4);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var a = 0.5 + 0.5 * Math.sin(x * 1.5708), b = 0.5 + 0.5 * Math.sin(y * 1.5708);
        var chk = ((x >> 2) + (y >> 2)) & 1, i = y * w + x;
        var v = 0.84 + 0.1 * (chk ? a : b) + 0.07 * (F[i] - 0.5) + 0.05 * (RAND[((y & 255) << 8) | (x & 255)] - 0.5);
        var k = i * 4; d[k] = d[k + 1] = d[k + 2] = 255 * v; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 5) rug (cream wool with a soft taupe border), covers the whole rug
    X.rug = GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F1 = field(w, h, 2, 2, 6), F2 = field(w, h, 20, 20, 7);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = x / w, v = y / h, i = y * w + x;
        var e = Math.min(Math.min(u, 1 - u) * 1.3, Math.min(v, 1 - v) * 1.0);
        var f = 0.9 + 0.12 * F1[i] + 0.06 * RAND[((y & 255) << 8) | (x & 255)] + 0.04 * F2[i];
        var cr = 236, cg = 228, cb = 214;
        if ((e > 0.07 && e < 0.085) || (e > 0.105 && e < 0.112)) { cr = 190; cg = 172; cb = 152; }
        if (e < 0.02) f *= 0.93;
        var k = i * 4;
        d[k] = GF.clamp(cr * f, 0, 255); d[k + 1] = GF.clamp(cg * f, 0, 255); d[k + 2] = GF.clamp(cb * f, 0, 255); d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });

    // 6) view out of the bedroom window (soft, out of focus: sky, a neighbour's wall, garden trees)
    X.window = GF.canvasTex(512, 512, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#8fbbe8'); g.addColorStop(0.42, '#c9def0'); g.addColorStop(0.62, '#eef2f0'); g.addColorStop(1, '#e6eadf');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = GF.rng(3), i;
      function soft(x, y, rad, col, a) {
        var gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(0.55, 'rgba(' + col + ',' + (a * 0.7) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // a few soft clouds
      for (i = 0; i < 7; i++) soft(r() * w, h * (0.08 + r() * 0.2), 30 + r() * 40, '255,255,255', 0.55);
      // neighbour's house (pale wall + grey roof), far right
      ctx.fillStyle = 'rgba(232,226,214,0.9)'; ctx.fillRect(w * 0.6, h * 0.40, w * 0.4, h * 0.3);
      ctx.fillStyle = 'rgba(132,138,146,0.85)'; ctx.beginPath(); ctx.moveTo(w * 0.56, h * 0.42); ctx.lineTo(w * 0.8, h * 0.31); ctx.lineTo(w * 1.04, h * 0.42); ctx.fill();
      ctx.fillStyle = 'rgba(150,165,175,0.5)'; ctx.fillRect(w * 0.7, h * 0.48, w * 0.08, h * 0.09);
      // garden trees / hedge
      var greens = ['92,128,70', '120,155,88', '70,104,58', '146,176,104', '104,140,76'];
      for (i = 0; i < 70; i++) {
        var x = r() * w, y = h * (0.45 + r() * 0.55), rad = 24 + r() * 50 * (y / h);
        if (x > w * 0.6 && y < h * 0.6) x -= w * 0.45;
        soft(x, y, rad, greens[(r() * greens.length) | 0], 0.55);
      }
      for (i = 0; i < 40; i++) soft(r() * w, h * (0.5 + r() * 0.45), 8 + r() * 14, '205,225,160', 0.35);
      ctx.fillStyle = 'rgba(80,110,62,0.35)'; ctx.fillRect(0, h * 0.86, w, h * 0.14);
    });

    // 7) soft-edged light patch (white on black, for additive decals: sun patches, light leaks)
    X.soft = GF.canvasTex(128, 128, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = (x + 0.5) / w, v = (y + 0.5) / h;
        var a = GF.smooth(0, 0.16, u) * GF.smooth(0, 0.16, 1 - u) * GF.smooth(0, 0.16, v) * GF.smooth(0, 0.16, 1 - v);
        var k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255 * a; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }, { srgb: false });

    // 8) sheer voile
    X.voile = rep(GF.canvasTex(128, 128, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F = field(w, h, 1, 16, 9);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var v = 0.9 + 0.06 * Math.sin(x * 3.14159 / 2) + 0.03 * Math.sin(y * 3.14159 / 2) + 0.05 * (F[y * w + x] - 0.5);
        var k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255 * GF.clamp(v, 0, 1); d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 9) framed picture: soft watercolour landscape on a white mat (no figures)
    X.picture = GF.canvasTex(256, 192, function (ctx, w, h) {
      ctx.fillStyle = '#f4f0e8'; ctx.fillRect(0, 0, w, h);
      var mx = w * 0.13, my = h * 0.15, iw = w - mx * 2, ih = h - my * 2;
      ctx.save(); ctx.beginPath(); ctx.rect(mx, my, iw, ih); ctx.clip();
      var g = ctx.createLinearGradient(0, my, 0, my + ih);
      g.addColorStop(0, '#b9d2e6'); g.addColorStop(0.6, '#eae6d8'); g.addColorStop(1, '#e6dcc4');
      ctx.fillStyle = g; ctx.fillRect(mx, my, iw, ih);
      var sg = ctx.createRadialGradient(mx + iw * 0.72, my + ih * 0.3, 0, mx + iw * 0.72, my + ih * 0.3, ih * 0.25);
      sg.addColorStop(0, 'rgba(255,236,190,0.95)'); sg.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = sg; ctx.fillRect(mx, my, iw, ih);
      var hills = [['rgba(150,170,180,0.55)', 0.52], ['rgba(140,170,130,0.6)', 0.64], ['rgba(110,150,100,0.7)', 0.76], ['rgba(170,160,110,0.55)', 0.88]];
      var r = GF.rng(9);
      for (var i = 0; i < hills.length; i++) {
        ctx.fillStyle = hills[i][0]; ctx.beginPath(); ctx.moveTo(mx, my + ih);
        var base = my + ih * hills[i][1], ph = r() * 6;
        for (var x = 0; x <= iw; x += 8) ctx.lineTo(mx + x, base - Math.sin(x / iw * 3 + ph) * ih * 0.06 - Math.sin(x / iw * 9 + ph * 2) * ih * 0.015);
        ctx.lineTo(mx + iw, my + ih); ctx.fill();
      }
      for (i = 0; i < 26; i++) {
        ctx.fillStyle = ['rgba(236,150,160,0.8)', 'rgba(250,240,200,0.85)', 'rgba(200,170,220,0.8)'][i % 3];
        ctx.beginPath(); ctx.arc(mx + r() * iw, my + ih * (0.86 + r() * 0.12), 1.2 + r() * 1.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(160,150,135,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(mx - 0.5, my - 0.5, iw + 1, ih + 1);
    });

    // 10) entrance tiles (300 mm warm-grey stone porcelain), 512 px = 0.6 m (2 x 2 tiles)
    X.tile = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, ts = w / 2, F1 = field(w, h, 16, 16, 10), F2 = field(w, h, 4, 4, 11);
      var tones = [0.97, 1.03, 1.0, 0.95];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var tx = (x / ts) | 0, ty = (y / ts) | 0, lx = x - tx * ts, ly = y - ty * ts, i = y * w + x;
        var v = tones[tx + ty * 2] * (0.9 + 0.08 * F1[i] + 0.05 * F2[i]);
        var sp = RAND[((y & 255) << 8) | (x & 255)];
        if (sp < 0.04) v *= 0.82; else if (sp > 0.985) v *= 1.12;
        var cr = 150, cg = 145, cb = 137;
        var eg = Math.min(lx, ts - 1 - lx, ly, ts - 1 - ly);
        if (eg < 2.2) { cr = 122; cg = 118; cb = 112; v = 0.95 + 0.08 * RAND[(((y + 7) & 255) << 8) | ((x + 3) & 255)]; } else if (eg < 3.5) v *= 0.92;
        var k = (y * w + x) * 4;
        d[k] = GF.clamp(cr * v, 0, 255); d[k + 1] = GF.clamp(cg * v, 0, 255); d[k + 2] = GF.clamp(cb * v, 0, 255); d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 11) grass / foliage
    X.grass = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F1 = field(w, h, 32, 32, 12), F2 = field(w, h, 6, 6, 13);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var n = 0.55 * F1[y * w + x] + 0.45 * F2[y * w + x];
        var k = (y * w + x) * 4, f = 0.72 + 0.5 * n;
        d[k] = 98 * f; d[k + 1] = 122 * f; d[k + 2] = 66 * f; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      var r = GF.rng(21), cols = ['#465f2c', '#536f35', '#6c8a45', '#7f9a52', '#93ab62', '#3c5427', '#a9ba78', '#5e7a3a'];
      ctx.lineCap = 'round';
      for (var c = 0; c < cols.length; c++) {
        ctx.strokeStyle = cols[c]; ctx.lineWidth = 1 + (c % 3) * 0.5; ctx.beginPath();
        for (var s = 0; s < 650; s++) {
          var x0 = r() * w, y0 = r() * h, a = r() * TAU, L = 3 + r() * 8, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
            var X0 = x0 + ox * w, Y0 = y0 + oy * h;
            if (X0 + dx < -2 && X0 < -2 || X0 > w + 2 && X0 + dx > w + 2 || Y0 + dy < -2 && Y0 < -2 || Y0 > h + 2 && Y0 + dy > h + 2) continue;
            ctx.moveTo(X0, Y0); ctx.lineTo(X0 + dx, Y0 + dy);
          }
        }
        ctx.stroke();
      }
    }));

    // 12) sky (partial dome facing -Z): zenith at the top, horizon at ~91 % height
    var SW = low ? 512 : 1024, SH = SW / 2;
    X.sky = GF.canvasTex(SW, SH, function (ctx, w, h) {
      var hz = 0.913;
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#4f8bd2'); g.addColorStop(0.45, '#79abe2'); g.addColorStop(0.78, '#b4d1ee');
      g.addColorStop(hz - 0.02, '#dbe8f3'); g.addColorStop(hz, '#e8eff2'); g.addColorStop(1, '#d6ddd8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = GF.rng(5), sc = w / 1024;
      for (var c = 0; c < 16; c++) {
        var cy = h * (0.35 + r() * 0.5), cx = r() * w, persp = 0.35 + 0.65 * (1 - (cy / h - 0.35) / 0.6);
        var size = (40 + r() * 70) * sc * persp;
        for (var b = 0; b < 10; b++) {
          var bx = cx + (r() - 0.5) * size * 3, by = cy + (r() - 0.7) * size * 0.5, br = size * (0.35 + r() * 0.5);
          ctx.save(); ctx.translate(bx, by); ctx.scale(1, 0.55 * (0.6 + persp * 0.5));
          var gr = ctx.createRadialGradient(0, -br * 0.15, 0, 0, 0, br);
          gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(250,252,255,0.45)'); gr.addColorStop(1, 'rgba(240,246,252,0)');
          ctx.fillStyle = gr; ctx.fillRect(-br, -br, br * 2, br * 2); ctx.restore();
        }
      }
    });
    X.sky.anisotropy = aniso;
    return X;
  }

  // =====================================================================================
  // GF.createSets
  // =====================================================================================
  GF.createSets = function (opts) {
    opts = opts || {};
    var low = !!opts.low, rend = opts.renderer || null;
    var SEG = low ? 2 : 3;
    var aniso = 4;
    try { if (rend && rend.capabilities) aniso = Math.max(1, Math.min(8, rend.capabilities.getMaxAnisotropy())); } catch (e) { aniso = 4; }
    var TX = makeTextures(low, aniso);
    function std(o) { return new T.MeshStandardMaterial(o); }

    // shared materials
    var M = {
      floor: std({ map: TX.floor, bumpMap: TX.floor, bumpScale: 0.6, roughness: 0.34, envMapIntensity: 0.8 }),
      wall: std({ map: TX.wall, bumpMap: TX.wall, bumpScale: 0.8, roughness: 0.93, envMapIntensity: 0.6 }),
      ceil: std({ color: 0xf6f3ee, roughness: 0.96, envMapIntensity: 0.5, emissive: 0x7a746a, emissiveIntensity: 1 }),
      white: std({ color: 0xf3f0ea, roughness: 0.5, envMapIntensity: 0.7 }),
      alu: std({ color: 0xcdc6b8, metalness: 0.6, roughness: 0.36 }),
      wood: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.45, roughness: 0.46, envMapIntensity: 0.85 }),
      brass: std({ color: 0xd2a75a, metalness: 1, roughness: 0.28 }),
      cushion: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.2, color: 0xd9ccb8, roughness: 0.92, envMapIntensity: 0.6 }),
      linen: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.0, color: 0xf4f1ec, roughness: 0.95, envMapIntensity: 0.6 }),
      duvet: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.0, color: 0xc2ccb6, roughness: 0.95, envMapIntensity: 0.6 }),
      drape: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.0, color: 0xdccfb9, roughness: 0.96, side: T.DoubleSide, envMapIntensity: 0.6 }),
      rug: std({ map: TX.rug, bumpMap: TX.rug, bumpScale: 2.0, roughness: 1.0, envMapIntensity: 0.5 }),
      wingGlass: std({ color: 0xdfe7e4, metalness: 1, roughness: 0.035, envMapIntensity: 1.0 }),
      picture: std({ map: TX.picture, roughness: 0.8 })
    };

    var root = new T.Group(); root.name = 'GF.sets';
    var D = buildDresser(TX, M, low, SEG);
    var G = buildGenkan(TX, M, low, SEG);
    root.add(D.group, G.group);
    var current = '';
    function activate(name) {
      if (name !== 'dresser' && name !== 'genkan') return;
      current = name;
      D.group.visible = name === 'dresser';
      G.group.visible = name === 'genkan';
    }
    activate('dresser');
    var api = { root: root, activate: activate, dresser: D.api, genkan: G.api };
    Object.defineProperty(api, 'active', { get: function () { return current; } });
    return api;
  };

  // =====================================================================================
  // DRESSER ROOM
  // =====================================================================================
  function buildDresser(TX, M, low, SEG) {
    var grp = new T.Group(); grp.name = 'set.dresser';
    var lights = GF.addLights(grp, { shadows: !low });
    var X0 = -1.7, X1 = 1.9, Z0 = -0.74, Z1 = 3.4, H = 2.4;
    function std(o) { return new T.MeshStandardMaterial(o); }

    // ---------- shell
    var fl = new T.PlaneGeometry(X1 - X0, Z1 - Z0); fl.rotateX(-Math.PI / 2); fl.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    planarUV(fl, 0, 2, 1 / 1.2, -1 / 1.2, 0.07, 0.31);
    grp.add(mesh(fl, M.floor, false, true, 'floor'));

    var wl = [];
    function wallZ(x0, x1, y0, y1, z, face) {
      var p = new T.PlaneGeometry(x1 - x0, y1 - y0); if (face < 0) p.rotateY(Math.PI);
      p.translate((x0 + x1) / 2, (y0 + y1) / 2, z); planarUV(p, 0, 1, 2, 2); wl.push(p);
    }
    function wallX(z0, z1, y0, y1, x, face) {
      var p = new T.PlaneGeometry(z1 - z0, y1 - y0); p.rotateY(face > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.translate(x, (y0 + y1) / 2, (z0 + z1) / 2); planarUV(p, 2, 1, 2, 2); wl.push(p);
    }
    wallZ(X0, X1, 0, H, Z0, 1);          // back wall (behind the dresser)
    wallZ(X0, X1, 0, H, Z1, -1);         // far wall (behind the camera)
    wallX(Z0, Z1, 0, H, X1, -1);         // right wall
    // left wall with the window opening z [0,1.3], y [0.9,2.1]
    wallX(Z0, 0, 0, H, X0, 1); wallX(1.3, Z1, 0, H, X0, 1);
    wallX(0, 1.3, 0, 0.9, X0, 1); wallX(0, 1.3, 2.1, H, X0, 1);
    grp.add(mesh(merge(wl), M.wall, false, true, 'walls'));

    var ce = new T.PlaneGeometry(X1 - X0, Z1 - Z0); ce.rotateX(Math.PI / 2); ce.translate((X0 + X1) / 2, H, (Z0 + Z1) / 2);
    grp.add(mesh(ce, M.ceil, false, false, 'ceiling'));

    // ---------- white painted joinery: baseboards, cornice, window casing, door (right wall), wardrobe
    var wh = [];
    var bb = 0.065, bt = 0.012;
    wh.push(boxAt(X0, X1, 0, bb, Z0, Z0 + bt, 0.003, 1));
    wh.push(boxAt(X0, X1, 0, bb, Z1 - bt, Z1, 0.003, 1));
    wh.push(boxAt(X1 - bt, X1, 0, bb, Z0, Z1, 0.003, 1));
    wh.push(boxAt(X0, X0 + bt, 0, bb, Z0, Z1, 0.003, 1));
    var cn = 0.03;
    wh.push(boxAt(X0, X1, H - cn, H, Z0, Z0 + cn * 0.7, 0.004, 1));
    wh.push(boxAt(X0, X1, H - cn, H, Z1 - cn * 0.7, Z1, 0.004, 1));
    wh.push(boxAt(X1 - cn * 0.7, X1, H - cn, H, Z0, Z1, 0.004, 1));
    wh.push(boxAt(X0, X0 + cn * 0.7, H - cn, H, Z0, Z1, 0.004, 1));
    // window reveals (wall thickness 0.13) and casing
    var WX = X0 - 0.13;
    wh.push(boxAt(WX, X0, 0.9, 2.1, -0.012, 0, 0.002, 1));
    wh.push(boxAt(WX, X0, 0.9, 2.1, 1.3, 1.312, 0.002, 1));
    wh.push(boxAt(WX, X0, 2.1, 2.112, 0, 1.3, 0.002, 1));
    wh.push(boxAt(X0, X0 + 0.014, 0.86, 2.17, -0.075, 0.0, 0.004, SEG));
    wh.push(boxAt(X0, X0 + 0.014, 0.86, 2.17, 1.3, 1.375, 0.004, SEG));
    wh.push(boxAt(X0, X0 + 0.014, 2.1, 2.17, -0.075, 1.375, 0.004, SEG));
    wh.push(boxAt(WX, X0 + 0.055, 0.88, 0.905, -0.095, 1.395, 0.005, SEG));     // stool / sill board
    wh.push(boxAt(X0, X0 + 0.012, 0.83, 0.88, -0.06, 1.36, 0.003, 1));
    // interior door on the right wall (closed), z [1.45, 2.25]
    var DZ0 = 1.45, DZ1 = 2.25;
    wh.push(boxAt(X1 - 0.036, X1 - 0.002, 0.004, 2.0, DZ0 + 0.01, DZ1 - 0.01, 0.006, SEG));
    wh.push(boxAt(X1 - 0.018, X1, 0, 2.06, DZ0 - 0.06, DZ0 + 0.01, 0.004, 1));
    wh.push(boxAt(X1 - 0.018, X1, 0, 2.06, DZ1 - 0.01, DZ1 + 0.06, 0.004, 1));
    wh.push(boxAt(X1 - 0.018, X1, 2.0, 2.06, DZ0 - 0.06, DZ1 + 0.06, 0.004, 1));
    // wardrobe in the far-left corner (behind the camera; seen in the mirror)
    var WZ0 = 2.82, WZ1 = Z1;
    wh.push(boxAt(-1.69, -0.82, 0.05, 1.98, WZ0 + 0.02, WZ1 - 0.002, 0.008, SEG));
    wh.push(boxAt(-1.68, -1.258, 0.06, 1.965, WZ0, WZ0 + 0.022, 0.006, SEG));
    wh.push(boxAt(-1.252, -0.83, 0.06, 1.965, WZ0, WZ0 + 0.022, 0.006, SEG));
    // ceiling light (round flush mount)
    var cl = lathe([[0, -0.07], [0.2, -0.065], [0.24, -0.05], [0.26, -0.025], [0.26, 0]], low ? 24 : 40);
    cl.translate(0.1, H, 1.3);
    grp.add(mesh(cl, std({ color: 0xffffff, roughness: 0.6, emissive: 0xfff8ee, emissiveIntensity: 0.25 }), false, false, 'ceilingLight'));
    grp.add(mesh(merge(wh), M.white, false, true, 'joinery'));

    // ---------- aluminium: window sashes, curtain rod, door lever, wardrobe handles
    var al = [];
    var sx = X0 - 0.075;
    al.push(boxAt(sx - 0.02, sx + 0.02, 0.9, 0.93, 0, 1.3, 0.003, 1));
    al.push(boxAt(sx - 0.02, sx + 0.02, 2.07, 2.1, 0, 1.3, 0.003, 1));
    al.push(boxAt(sx - 0.02, sx + 0.02, 0.9, 2.1, 0, 0.025, 0.003, 1));
    al.push(boxAt(sx - 0.02, sx + 0.02, 0.9, 2.1, 1.275, 1.3, 0.003, 1));
    function sash(xc, z0, z1) {
      var b = 0.032, t = 0.018;
      al.push(boxAt(xc - t / 2, xc + t / 2, 0.93, 0.93 + b, z0, z1, 0.003, 1));
      al.push(boxAt(xc - t / 2, xc + t / 2, 2.07 - b, 2.07, z0, z1, 0.003, 1));
      al.push(boxAt(xc - t / 2, xc + t / 2, 0.93, 2.07, z0, z0 + b, 0.003, 1));
      al.push(boxAt(xc - t / 2, xc + t / 2, 0.93, 2.07, z1 - b, z1, 0.003, 1));
    }
    sash(sx - 0.011, 0.025, 0.675); sash(sx + 0.011, 0.625, 1.275);
    al.push(xf(new T.CylinderGeometry(0.011, 0.011, 2.2, 12), X0 + 0.11, 2.2, 0.65, Math.PI / 2, 0, 0));
    al.push(xf(new T.CylinderGeometry(0.008, 0.008, 0.11, 8), X0 + 0.055, 2.2, -0.42, 0, 0, Math.PI / 2));
    al.push(xf(new T.CylinderGeometry(0.008, 0.008, 0.11, 8), X0 + 0.055, 2.2, 1.72, 0, 0, Math.PI / 2));
    al.push(xf(new T.SphereGeometry(0.016, 12, 8), X0 + 0.11, 2.2, -0.45));
    al.push(xf(new T.SphereGeometry(0.016, 12, 8), X0 + 0.11, 2.2, 1.75));
    // interior door lever
    al.push(xf(new T.CylinderGeometry(0.024, 0.024, 0.01, 16), X1 - 0.04, 1.0, DZ0 + 0.07, 0, 0, Math.PI / 2));
    al.push(xf(new T.CapsuleGeometry(0.008, 0.1, 4, 10), X1 - 0.075, 1.0, DZ0 + 0.12, Math.PI / 2, 0, 0));
    al.push(xf(new T.CylinderGeometry(0.009, 0.009, 0.04, 10), X1 - 0.055, 1.0, DZ0 + 0.07, 0, 0, Math.PI / 2));
    // wardrobe handles
    al.push(boxAt(-1.275, -1.265, 0.9, 1.25, WZ0 - 0.025, WZ0 - 0.012, 0.004, 1));
    al.push(boxAt(-1.245, -1.235, 0.9, 1.25, WZ0 - 0.025, WZ0 - 0.012, 0.004, 1));
    grp.add(mesh(merge(al), M.alu, false, true, 'aluminium'));

    // ---------- the view out of the window (soft emissive backdrop, beyond the wall)
    var vw = new T.PlaneGeometry(2.6, 2.3); vw.rotateY(Math.PI / 2); vw.translate(X0 - 0.75, 1.45, 0.65);
    var viewMat = new T.MeshBasicMaterial({ map: TX.window }); viewMat.color.setRGB(1.55, 1.5, 1.42);
    grp.add(mesh(vw, viewMat, false, false, 'windowView'));

    // ---------- sheer curtain (vertex-animated) + linen side drapes
    var cU = { uTime: { value: 0 }, uWind: { value: 0 } };
    var cg = new T.PlaneGeometry(1.62, 1.33, low ? 40 : 72, low ? 8 : 14);
    cg.rotateY(Math.PI / 2);
    (function () {
      var P = cg.attributes.position;
      for (var i = 0; i < P.count; i++) {
        var z = P.getZ(i), y = P.getY(i);
        P.setX(i, 0.022 * Math.sin(z * TAU / 0.115) + 0.006 * Math.sin(z * 31 + y * 2));
      }
      cg.computeVertexNormals();
    })();
    cg.translate(X0 + 0.085, 1.515, 0.65);
    planarUV(cg, 2, 1, 4, 3);
    var voile = std({ color: 0xfbf9f4, map: TX.voile, roughness: 0.9, transparent: true, opacity: 0.62, side: T.DoubleSide,
      emissive: 0xfff5e6, emissiveIntensity: 0.32, depthWrite: false, envMapIntensity: 0.4 });
    voile.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = cU.uTime; sh.uniforms.uWind = cU.uWind;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float hang = clamp((2.18 - position.y) / 1.33, 0.0, 1.0);',
        'float sway = sin(uTime * 0.9 + position.z * 2.6) * 0.6 + sin(uTime * 1.7 + position.z * 6.3 + position.y * 2.1) * 0.4;',
        'float amp = (0.016 + 0.085 * uWind) * hang * hang;',
        'transformed.x += amp * (sway + 0.9 * uWind) + 0.004 * hang;',
        'transformed.z += amp * 0.35 * sin(uTime * 1.3 + position.y * 3.0 + position.z);'
      ].join('\n'));
    };
    voile.customProgramCacheKey = function () { return 'gf-voile'; };
    var curtain = mesh(cg, voile, false, false, 'curtain'); curtain.renderOrder = 2;
    grp.add(curtain);
    var dr = [];
    [[-0.44, -0.12], [1.42, 1.74]].forEach(function (zz) {
      var p = new T.PlaneGeometry(zz[1] - zz[0], 1.48, 24, 4); p.rotateY(Math.PI / 2);
      var P = p.attributes.position;
      for (var i = 0; i < P.count; i++) { var z = P.getZ(i); P.setX(i, 0.035 * Math.sin(z * TAU / 0.105) + 0.012); }
      p.computeVertexNormals();
      p.translate(X0 + 0.13, 2.18 - 0.74, (zz[0] + zz[1]) / 2);
      planarUV(p, 2, 1, 6, 6); dr.push(p);
    });
    grp.add(mesh(merge(dr), M.drape, false, true, 'drapes'));

    // ---------- warm sunlight patches where the key light (sun) lands through the window panes
    var kd = new T.Vector3(-GF.LIGHT.keyPos[0], 0.8 - GF.LIGHT.keyPos[1], -0.2 - GF.LIGHT.keyPos[2]).normalize();
    function proj(y, z, plane) { // window point (X0,y,z) along kd onto plane
      var t;
      if (plane === 'floor') t = (0.0025 - y) / kd.y; else t = (Z0 + 0.0025 - z) / kd.z;
      return [X0 + kd.x * t, y + kd.y * t, z + kd.z * t];
    }
    var sp = [];
    [[0.05, 0.64], [0.66, 1.25]].forEach(function (pz) {
      var ya = 0.95, yb = 2.05;
      ['floor', 'wall'].forEach(function (pl) {
        var a = proj(ya, pz[0], pl), b = proj(ya, pz[1], pl), c = proj(yb, pz[1], pl), d = proj(yb, pz[0], pl);
        var q = quad(a, b, c, d);
        // make sure it faces the room
        var N = q.attributes.normal, want = pl === 'floor' ? 1 : 1, comp = pl === 'floor' ? N.getY(0) : N.getZ(0);
        if (comp * want < 0) q.setIndex([0, 2, 1, 0, 3, 2]);
        sp.push(q);
      });
    });
    var sunMat = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    sunMat.color.setRGB(0.26, 0.18, 0.105);
    var sunPatch = mesh(merge(sp), sunMat, false, false, 'sunPatch'); sunPatch.renderOrder = 1;
    grp.add(sunPatch);

    // ---------- rug under the chair
    var rs = new T.Shape(), rw = 1.3, rd = 1.0, rr = 0.07;
    rs.moveTo(-rw / 2 + rr, -rd / 2); rs.lineTo(rw / 2 - rr, -rd / 2); rs.quadraticCurveTo(rw / 2, -rd / 2, rw / 2, -rd / 2 + rr);
    rs.lineTo(rw / 2, rd / 2 - rr); rs.quadraticCurveTo(rw / 2, rd / 2, rw / 2 - rr, rd / 2); rs.lineTo(-rw / 2 + rr, rd / 2);
    rs.quadraticCurveTo(-rw / 2, rd / 2, -rw / 2, rd / 2 - rr); rs.lineTo(-rw / 2, -rd / 2 + rr); rs.quadraticCurveTo(-rw / 2, -rd / 2, -rw / 2 + rr, -rd / 2);
    var rg = new T.ExtrudeGeometry(rs, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.008, bevelSegments: 2, curveSegments: 6 });
    rg.rotateX(-Math.PI / 2); rg.translate(0, 0.005, 0.28);
    planarUV(rg, 0, 2, 1 / (rw + 0.02), -1 / (rd + 0.02), 0.5, 0.5 + 0.28 / (rd + 0.02));
    grp.add(mesh(rg, M.rug, false, true, 'rug'));

    // ---------- light oak furniture (dresser body, mirror frame, chair, bed frame, picture frame) -> one mesh
    var W = [];
    function wpush(g, vert, o) { boxUV(g, 1 / 0.6, vert, o || 0, (o || 0) * 0.7); W.push(g); }
    // dresser top (softly rounded edge)
    wpush(boxAt(-0.56, 0.56, 0.672, 0.70, -0.72, -0.22, 0.011, SEG + 1), false, 0.1);
    // pedestals (carcasses)
    [-1, 1].forEach(function (s) {
      var xa = s < 0 ? -0.548 : 0.248, xb = s < 0 ? -0.248 : 0.548;
      wpush(boxAt(xa, xb, 0.075, 0.674, -0.715, -0.236, 0.005, SEG), true, s * 0.3);
      // drawer fronts (overlay), 3 per stack
      var ys = [0.083, 0.293, 0.483, 0.664];
      for (var i = 0; i < 3; i++) {
        wpush(boxAt(xa + 0.004, xb - 0.004, ys[i] + 0.0025, ys[i + 1] - 0.0025, -0.238, -0.219, 0.0055, SEG), false, i * 0.37 + s * 0.2);
      }
      // short tapered legs
      [[xa + 0.03, -0.69], [xb - 0.03, -0.69], [xa + 0.03, -0.265], [xb - 0.03, -0.265]].forEach(function (p) {
        wpush(xf(new T.CylinderGeometry(0.017, 0.012, 0.078, 14), p[0], 0.039, p[1]), true);
      });
    });
    // knee-hole apron and modesty panel
    wpush(boxAt(-0.25, 0.25, 0.612, 0.674, -0.248, -0.228, 0.005, SEG), false, 0.5);
    wpush(boxAt(-0.25, 0.25, 0.28, 0.674, -0.712, -0.696, 0.004, 1), false);
    // centre mirror frame standing on the top: glass x[-0.22,0.22] y[0.76,1.52] z=-0.685
    wpush(boxAt(-0.237, -0.214, 0.70, 1.548, -0.712, -0.672, 0.006, SEG), true, 0.2);
    wpush(boxAt(0.214, 0.237, 0.70, 1.548, -0.712, -0.672, 0.006, SEG), true, 0.4);
    wpush(boxAt(-0.237, 0.237, 0.70, 0.764, -0.712, -0.672, 0.006, SEG), false, 0.6);
    wpush(boxAt(-0.237, 0.237, 1.516, 1.548, -0.712, -0.672, 0.006, SEG), false, 0.8);
    var crown = boxAt(-0.17, 0.17, 1.54, 1.565, -0.708, -0.676, 0.009, SEG); wpush(crown, false, 0.3);
    wpush(boxAt(-0.22, 0.22, 0.76, 1.52, -0.712, -0.70, 0.002, 1), false);
    // ---- chair (seat top 0.42, seat 0.36 x 0.34 centred at z 0.02, back posts at x=+-0.17 z=0.20)
    wpush(boxAt(-0.178, 0.178, 0.335, 0.366, -0.148, 0.188, 0.007, SEG), false, 0.15);
    [-1, 1].forEach(function (s) {
      wpush(xf(new T.CylinderGeometry(0.0165, 0.0125, 0.336, 16), s * 0.152, 0.168, -0.122), true);
      wpush(boxAt(s * 0.17 - 0.0155, s * 0.17 + 0.0155, 0, 0.664, 0.185, 0.215, 0.0075, SEG), true, s * 0.25);
      var fin = lathe([[0, 0], [0.0125, 0], [0.0125, 0.003], [0.0085, 0.007], [0.0075, 0.009],
        [0.0105, 0.012], [0.0145, 0.0155], [0.0165, 0.0195], [0.0155, 0.025], [0.0125, 0.0297], [0.0075, 0.0336], [0, 0.036]], low ? 12 : 20);
      wpush(fin.translate(s * 0.17, 0.664, 0.20), true);
      wpush(boxAt(s * 0.152 - 0.008, s * 0.152 + 0.008, 0.105, 0.125, -0.12, 0.19, 0.004, 1), false);
    });
    wpush(boxAt(-0.16, 0.16, 0.632, 0.664, 0.188, 0.212, 0.008, SEG), false, 0.45);   // top rail (towel hangs here)
    wpush(boxAt(-0.16, 0.16, 0.49, 0.512, 0.19, 0.21, 0.006, SEG), false, 0.65);       // lower rail
    wpush(boxAt(-0.145, 0.145, 0.105, 0.123, -0.13, -0.114, 0.004, 1), false);        // front stretcher
    // ---- bed frame (behind the camera, against the far wall), picture frame
    wpush(boxAt(-0.12, 1.86, 0.06, 0.30, 2.40, 3.385, 0.012, SEG), false, 0.2);
    wpush(boxAt(1.835, 1.895, 0, 0.92, 2.40, 3.39, 0.014, SEG), true, 0.5);
    wpush(boxAt(-0.12, 1.86, 0.0, 0.06, 2.46, 3.33, 0.004, 1), false);
    var PCX = 0.86, PCY = 1.5, PW = 0.56, PH = 0.42;
    wpush(boxAt(PCX - PW / 2, PCX + PW / 2, PCY - PH / 2, PCY + PH / 2, Z1 - 0.022, Z1 - 0.002, 0.004, SEG), false);
    var woodMesh = mesh(merge(W), M.wood, true, true, 'oakFurniture');
    grp.add(woodMesh);
    var pic = new T.PlaneGeometry(PW - 0.05, PH - 0.05); pic.rotateY(Math.PI); pic.translate(PCX, PCY, Z1 - 0.0235);
    grp.add(mesh(pic, M.picture, false, false, 'picture'));

    // chair cushion (padded)
    var cu = rbox(0.37, 0.05, 0.334, 0.022, SEG + 1);
    (function () {
      var P = cu.attributes.position;
      for (var i = 0; i < P.count; i++) {
        var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        var f = Math.max(0, 1 - Math.pow(x / 0.185, 2)) * Math.max(0, 1 - Math.pow(z / 0.167, 2));
        if (y > 0) P.setY(i, y + 0.007 * f); else P.setY(i, y - 0.002 * f);
      }
      smoothNormals(cu);
    })();
    cu.translate(0, 0.364 + 0.025, 0.02);
    boxUV(cu, 1 / 0.12);
    grp.add(mesh(cu, M.cushion, true, true, 'cushion'));

    // bedding: mattress + pillow (white linen), duvet (sage)
    var bw = [];
    bw.push(boxUV(boxAt(-0.08, 1.83, 0.30, 0.49, 2.43, 3.37, 0.05, SEG), 1 / 0.12));
    var pil = rbox(0.4, 0.13, 0.66, 0.06, SEG + 1);
    (function () { var P = pil.attributes.position; for (var i = 0; i < P.count; i++) { var x = P.getX(i), z = P.getZ(i); P.setY(i, P.getY(i) * (1 - 0.5 * Math.pow(Math.abs(z) / 0.33, 3)) * (1 - 0.3 * Math.pow(Math.abs(x) / 0.2, 3))); } smoothNormals(pil); })();
    pil.rotateZ(0.25); pil.translate(1.62, 0.58, 2.9); bw.push(boxUV(pil, 1 / 0.12));
    grp.add(mesh(merge(bw), M.linen, false, true, 'bedding'));
    var dv = rbox(1.52, 0.34, 1.05, 0.08, SEG + 1);
    (function () {
      var P = dv.attributes.position;
      for (var i = 0; i < P.count; i++) {
        var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        var n = n3(x * 3.1, y * 3.1, z * 3.1) - 0.5, n2 = n3(x * 9, y * 9, z * 9) - 0.5;
        var top = y > 0.1 ? 1 : 0.5, side = Math.abs(z) > 0.45 || x < -0.7 ? 1 : 0.3;
        var sag = y < 0 ? (Math.abs(z) > 0.45 ? 0.03 * Math.sin(x * 9 + z * 3) : 0) : 0;
        P.setXYZ(i, x + n * 0.03, y + (n * 0.05 + n2 * 0.014) * top, z + (n2 * 0.02 + sag) * side);
      }
      smoothNormals(dv);
    })();
    dv.translate(0.66, 0.40, 2.9);
    boxUV(dv, 1 / 0.12);
    var fold = rbox(0.16, 0.05, 1.07, 0.024, SEG); fold.translate(1.36, 0.575, 2.9); boxUV(fold, 1 / 0.12);
    grp.add(mesh(merge([dv, fold]), M.duvet, false, true, 'duvet'));

    // ---------- brass: drawer knobs + hinges of the mirror wings
    var BR = [];
    var knobProf = [[0, 0], [0.0105, 0], [0.0105, 0.0018], [0.0045, 0.006], [0.004, 0.011], [0.0085, 0.0155], [0.0105, 0.0205], [0.0095, 0.025], [0.006, 0.0278], [0, 0.0285]];
    [-1, 1].forEach(function (s) {
      var xc = s * 0.398, ys = [0.083, 0.293, 0.483, 0.664];
      for (var i = 0; i < 3; i++) {
        var k = lathe(knobProf, low ? 12 : 18); k.rotateX(Math.PI / 2); k.translate(xc, (ys[i] + ys[i + 1]) / 2 + (i === 2 ? 0 : 0.0), -0.219);
        BR.push(k);
      }
      [0.81, 1.46].forEach(function (y) { BR.push(xf(new T.CylinderGeometry(0.0045, 0.0045, 0.06, 10), s * 0.235, y, -0.67)); });
    });
    grp.add(mesh(merge(BR), M.brass, true, true, 'brass'));

    // ---------- centre mirror: real planar reflection
    var mirror = makeMirror(grp, low);

    // ---------- the two mirror wings
    var wings = {};
    var glows = {};
    ['L', 'R'].forEach(function (side) {
      var s = side === 'R' ? 1 : -1;               // R: hinge at +x, wing extends toward -x (local)
      var pivot = new T.Group(); pivot.name = 'wing' + side;
      pivot.position.set(s * 0.235, 0.745, -0.67);
      grp.add(pivot);
      var WWID = 0.232, HT = 0.79, TH = 0.02, EW = 0.013;
      // wood panel (hinge side) + free-edge strip (glows)
      var pan = boxAt(-s * (WWID - EW) < 0 ? -(WWID - EW) : 0, -s * (WWID - EW) < 0 ? 0 : (WWID - EW), 0, HT, 0, TH, 0.0045, SEG);
      boxUV(pan, 1 / 0.6, true, s * 0.37, 0.2);
      var panel = mesh(pan, M.wood, true, true, 'wingWood' + side);
      var eg = boxAt(-s * WWID < 0 ? -WWID : WWID - EW, -s * WWID < 0 ? -(WWID - EW) : WWID, 0, HT, 0, TH, 0.0045, SEG);
      boxUV(eg, 1 / 0.6, true, s * 0.37, 0.2);
      var edge = mesh(eg, M.wood, true, true, 'wingEdge' + side);
      // mirror on the inner face (local -z)
      var mg = new T.PlaneGeometry(0.203, 0.758); mg.rotateY(Math.PI); mg.translate(-s * 0.1135, HT / 2, -0.0008);
      var glass = mesh(mg, M.wingGlass, false, false, 'wingGlass' + side);
      // knobs: one on the wooden back (seen when closed), one low dome on the mirror-side border (seen when open)
      var KX = -s * 0.2235, KY = 1.12 - 0.745;
      var kb = lathe(knobProf, low ? 12 : 18); kb.rotateX(Math.PI / 2); kb.translate(KX, KY, TH);
      var kf = lathe([[0, 0], [0.0068, 0], [0.0066, 0.0015], [0.0055, 0.0042], [0.003, 0.0058], [0, 0.0062]], low ? 10 : 16);
      kf.rotateX(-Math.PI / 2); kf.translate(KX, KY, 0);
      var knobs = mesh(merge([kb, kf]), M.brass, true, true, 'wingKnob' + side);
      var knob = new T.Object3D(); knob.name = 'wingKnobAnchor' + side; knob.position.set(-s * 0.226, KY, TH / 2);
      pivot.add(panel, edge, glass, knobs, knob);
      // glow: emissive on knob + edge (GF.makeGlow) plus soft additive halos so it reads in bright light
      var setG = GF.makeGlow([knobs, edge]);
      var hm = new T.SpriteMaterial({ map: TX.soft, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
      hm.color.setRGB(0.95, 0.62, 0.3);
      var halo = new T.Sprite(hm); halo.scale.set(0.05, 0.05, 1); halo.position.set(-s * 0.226, KY, TH + 0.02);
      var hm2 = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      hm2.color.setRGB(0.95, 0.62, 0.3);
      var haloE = new T.Mesh(new T.PlaneGeometry(0.04, HT + 0.04), hm2); haloE.position.set(-s * 0.229, HT / 2, TH + 0.006);
      halo.visible = haloE.visible = false; halo.renderOrder = haloE.renderOrder = 3;
      pivot.add(halo, haloE);
      var halos = { k: halo, e: haloE };
      glows[side] = function (v) {
        v = GF.clamp(v, 0, 1); setG(v);
        hm.opacity = 0.4 * v; hm2.opacity = 0.36 * v;
        halo.visible = haloE.visible = v > 0.004;
      };
      var state = { v: -1 };
      var w = {
        pivot: pivot, knob: knob,
        setOpen: function (v) {
          v = GF.clamp(+v || 0, 0, 1);
          if (v === state.v) return;
          state.v = v;
          pivot.rotation.y = s * v * (155 * Math.PI / 180);
          halos.k.position.z = v < 0.5 ? TH + 0.02 : -0.02;
          halos.e.position.z = v < 0.5 ? TH + 0.006 : -0.006;
          pivot.updateMatrixWorld(true);
        }
      };
      Object.defineProperty(w, 'open', { get: function () { return Math.max(0, state.v); }, enumerable: true });
      w.setOpen(0);
      wings[side] = w;
    });
    // wing mirrors: a one-off cube capture of the room (taken on the first mirror.update) instead of the generic env
    var wingGlasses = [];
    grp.traverse(function (o) { if (o.name === 'wingGlassL' || o.name === 'wingGlassR') wingGlasses.push(o); });
    mirror.onFirst = function (renderer, scene) {
      var crt = new T.WebGLCubeRenderTarget(low ? 128 : 256, { type: T.HalfFloatType });
      var ccam = new T.CubeCamera(0.05, 20, crt);
      ccam.position.set(0, 1.14, -0.25);
      var top = grp; while (top.parent && top.parent !== scene) top = top.parent;
      var hidden = [];
      for (var i = 0; i < scene.children.length; i++) {
        var c = scene.children[i];
        if (c !== top && c.visible && !c.isLight) { c.visible = false; hidden.push(c); }
      }
      var mm = mirror.api.mesh, mv = mm.visible; mm.visible = false;
      wingGlasses.forEach(function (o) { o.visible = false; });
      scene.add(ccam);
      ccam.update(renderer, scene);
      scene.remove(ccam);
      wingGlasses.forEach(function (o) { o.visible = true; });
      mm.visible = mv;
      hidden.forEach(function (c) { c.visible = true; });
      M.wingGlass.envMap = crt.texture; M.wingGlass.needsUpdate = true;
    };
    mirror.wingsClosed = function () { return wings.L.open < 0.015 && wings.R.open < 0.015; };

    // ---------- runtime
    var windT = 0, windC = 0, phase = 0;
    var api = {
      group: grp, lights: lights, wings: wings,
      setWingGlow: function (side, v) { if (glows[side]) glows[side](+v || 0); },
      mirror: mirror.api,
      setCurtainWind: function (v) { windT = GF.clamp(+v || 0, 0, 1); },
      update: function (dt, t) {
        dt = GF.clamp(+dt || 0, 0, 0.1);
        windC = GF.damp(windC, windT, windT > windC ? 4 : 1.5, dt);
        phase += dt * (1 + 2.6 * windC);
        cU.uTime.value = phase; cU.uWind.value = windC;
      }
    };
    return { group: grp, api: api };
  }

  // ---------- planar mirror (Reflector-style: mirrored camera + oblique near plane + projective texture)
  function makeMirror(grp, low) {
    var size = low ? 256 : 512;
    var rt = new T.WebGLRenderTarget(size, Math.round(size * 1.5), { type: T.HalfFloatType, samples: low ? 0 : 4 });
    rt.texture.generateMipmaps = false; rt.texture.minFilter = T.LinearFilter; rt.texture.magFilter = T.LinearFilter;
    var texM = new T.Matrix4();
    var reflMat = new T.ShaderMaterial({
      name: 'GFMirror',
      uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: texM }, tint: { value: new T.Color(0.9, 0.93, 0.92) } },
      vertexShader: 'uniform mat4 textureMatrix;\nvarying vec4 vUv;\nvoid main() {\n  vUv = textureMatrix * vec4(position, 1.0);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragmentShader: 'uniform sampler2D tDiffuse;\nuniform vec3 tint;\nvarying vec4 vUv;\nvoid main() {\n  vec3 c = texture2D(tDiffuse, vUv.xy / vUv.w).rgb * tint;\n  gl_FragColor = vec4(c, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}'
    });
    var fallMat = new T.MeshStandardMaterial({ color: 0xd9e1de, metalness: 1, roughness: 0.06, envMapIntensity: 1.0 });
    var glass = new T.Mesh(new T.PlaneGeometry(0.44, 0.76), fallMat);
    glass.name = 'centreMirror';
    glass.position.set(0, 1.14, GF.POS.mirrorZ);
    grp.add(glass);

    var enabled = true;
    var vcam = new T.PerspectiveCamera();
    var plane = new T.Plane(), nrm = new T.Vector3(), mPos = new T.Vector3(), cPos = new T.Vector3(), rot = new T.Matrix4();
    var look = new T.Vector3(), view = new T.Vector3(), tgt = new T.Vector3(), clip = new T.Vector4(), q = new T.Vector4();
    var crop = new T.Matrix4(), cp = new T.Vector3();
    var CORN = [-0.22, -0.38, 0.22, -0.38, 0.22, 0.38, -0.22, 0.38];
    var self = {};
    self.api = {
      update: function (renderer, scene, camera) {
        if (!renderer || !scene || !camera || !grp.visible) return;
        if (self.onFirst) { var f = self.onFirst; self.onFirst = null; try { f(renderer, scene); } catch (e) { /* keep the plain env */ } }
        if (!enabled) return;
        if (self.wingsClosed && self.wingsClosed()) return;      // glass fully covered
        glass.updateWorldMatrix(true, false);
        camera.updateMatrixWorld();
        mPos.setFromMatrixPosition(glass.matrixWorld);
        cPos.setFromMatrixPosition(camera.matrixWorld);
        rot.extractRotation(glass.matrixWorld);
        nrm.set(0, 0, 1).applyMatrix4(rot);
        view.subVectors(mPos, cPos);
        if (view.dot(nrm) > 0) return;                           // camera behind the mirror
        view.reflect(nrm).negate().add(mPos);
        rot.extractRotation(camera.matrixWorld);
        look.set(0, 0, -1).applyMatrix4(rot).add(cPos);
        tgt.subVectors(mPos, look).reflect(nrm).negate().add(mPos);
        vcam.position.copy(view);
        vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(nrm);
        vcam.lookAt(tgt);
        vcam.near = camera.near; vcam.far = camera.far;
        vcam.layers.mask = camera.layers.mask;
        vcam.updateMatrixWorld();
        vcam.projectionMatrix.copy(camera.projectionMatrix);
        // concentrate the render target's pixels on the glass: crop the projection to the mirror's footprint
        var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, ok = true;
        for (var i = 0; i < 4; i++) {
          cp.set(CORN[i * 2], CORN[i * 2 + 1], 0).applyMatrix4(glass.matrixWorld).applyMatrix4(vcam.matrixWorldInverse);
          if (cp.z > -1e-3) { ok = false; break; }
          cp.applyMatrix4(vcam.projectionMatrix);
          if (cp.x < x0) x0 = cp.x; if (cp.x > x1) x1 = cp.x; if (cp.y < y0) y0 = cp.y; if (cp.y > y1) y1 = cp.y;
        }
        if (ok) {
          x0 = Math.max(-1, x0 - 0.01); x1 = Math.min(1, x1 + 0.01); y0 = Math.max(-1, y0 - 0.01); y1 = Math.min(1, y1 + 0.01);
          if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;          // off screen
          crop.set(2 / (x1 - x0), 0, 0, -(x1 + x0) / (x1 - x0), 0, 2 / (y1 - y0), 0, -(y1 + y0) / (y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
          vcam.projectionMatrix.premultiply(crop);
        }
        texM.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        texM.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(glass.matrixWorld);
        // oblique near plane = mirror plane (Lengyel)
        plane.setFromNormalAndCoplanarPoint(nrm, mPos).applyMatrix4(vcam.matrixWorldInverse);
        clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        var pe = vcam.projectionMatrix.elements;
        q.x = (Math.sign(clip.x) + pe[8]) / pe[0];
        q.y = (Math.sign(clip.y) + pe[9]) / pe[5];
        q.z = -1.0;
        q.w = (1.0 + pe[10]) / pe[14];
        clip.multiplyScalar(2.0 / clip.dot(q));
        pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1.0; pe[14] = clip.w;
        vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();

        glass.visible = false;
        var cur = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
        var xr = renderer.xr.enabled, sau = renderer.shadowMap.autoUpdate;
        renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(rt);
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, vcam);
        renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sau;
        renderer.setRenderTarget(cur, face, mip);
        if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
        glass.visible = true;
        if (glass.material !== reflMat) glass.material = reflMat;
      },
      setSize: function (px) {
        px = Math.round(GF.clamp(+px || 512, 64, 2048));
        if (px === size) return;
        size = px; rt.setSize(px, Math.round(px * 1.5));
      },
      setEnabled: function (on) {
        enabled = !!on;
        if (!enabled) glass.material = fallMat;
      }
    };
    Object.defineProperty(self.api, 'enabled', { get: function () { return enabled; } });
    self.api.mesh = glass;
    return self;
  }

  // =====================================================================================
  // GENKAN
  // =====================================================================================
  function buildGenkan(TX, M, low, SEG) {
    var grp = new T.Group(); grp.name = 'set.genkan';
    grp.visible = false;
    var rnd = GF.rng(77);
    function std(o) { return new T.MeshStandardMaterial(o); }
    var XL = -0.95, XR = 0.95, ZD = GF.POS.doorZ, ZS = 0.75, ZB = 3.15, H = 2.4, HY = 0.12;

    var mat = {
      tile: std({ map: TX.tile, bumpMap: TX.tile, bumpScale: 0.8, roughness: 0.62, envMapIntensity: 0.7 }),
      darkWood: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.4, color: 0x7a6656, roughness: 0.42 }),
      door: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.4, color: 0x8c7666, roughness: 0.45, vertexColors: true }),
      paleWood: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.35, color: 0xf2e8da, roughness: 0.5 }),
      metal: std({ color: 0xbdbab4, metalness: 1, roughness: 0.3 }),
      lever: std({ color: 0xc9c6c0, metalness: 1, roughness: 0.25 }),
      lawn: std({ map: TX.grass, bumpMap: TX.grass, bumpScale: 1.5, roughness: 0.95, color: 0xd2d6be, envMapIntensity: 0.5 }),
      foliage: std({ map: TX.grass, roughness: 0.88, vertexColors: true, envMapIntensity: 0.6, emissive: 0x1c2a12, emissiveIntensity: 1 }),
      misc: std({ map: TX.wall, roughness: 0.86, vertexColors: true, envMapIntensity: 0.6 }),
      flower: std({ roughness: 0.65, vertexColors: true }),
      down: std({ color: 0xffffff, emissive: 0xfff1dc, emissiveIntensity: 1.6, roughness: 0.5 })
    };

    // ---------- interior shell (thick boxes so the sun's shadow map seals the interior)
    var tl = [];
    var tf = new T.PlaneGeometry(XR - XL, ZS - ZD); tf.rotateX(-Math.PI / 2); tf.translate(0, 0, (ZD + ZS) / 2); planarUV(tf, 0, 2, 1 / 0.6, -1 / 0.6, 0.5, 0); tl.push(tf);
    // porch slab outside, level with the entrance floor
    var po = new T.PlaneGeometry(2.4, 1.1); po.rotateX(-Math.PI / 2); po.translate(0, 0, -2.07); planarUV(po, 0, 2, 1 / 0.6, -1 / 0.6, 0.5, 0); tl.push(po);
    tl.push(boxUV(boxAt(-1.22, 1.22, -0.06, -0.0005, -2.64, -1.6, 0.01, 2), 1 / 0.6, false, 0.5));
    tl.push(boxUV(boxAt(-0.44, 0.44, 0, 0.012, -1.63, -1.5, 0.004, 1), 1 / 0.6, false, 0.5));        // threshold
    tl.push(boxUV(boxAt(XL, XL + 0.012, 0, 0.08, ZD, ZS, 0.003, 1), 1 / 0.6));                         // tiled skirting
    tl.push(boxUV(boxAt(XR - 0.012, XR, 0, 0.08, ZD, ZS, 0.003, 1), 1 / 0.6));
    grp.add(mesh(merge(tl), mat.tile, false, true, 'tiles'));

    var hf = new T.PlaneGeometry(XR - XL, ZB - 0.87); hf.rotateX(-Math.PI / 2); hf.translate(0, HY, (0.87 + ZB) / 2);
    planarUV(hf, 0, 2, 1 / 1.2, -1 / 1.2, 0.3, 0.1);
    grp.add(mesh(hf, M.floor, false, true, 'hallFloor'));

    var wl = [];
    var WT = 0.1;
    wl.push(boxAt(XL - WT, XL, 0, H + 0.1, ZD - 0.12, ZB + 0.1, 0.002, 1));
    wl.push(boxAt(XR, XR + WT, 0, H + 0.1, ZD - 0.12, ZB + 0.1, 0.002, 1));
    wl.push(boxAt(XL - WT, XR + WT, 0, H + 0.1, ZB, ZB + WT, 0.002, 1));
    wl.push(boxAt(XL - WT, -0.44, 0, H + 0.1, ZD - 0.12, ZD, 0.002, 1));
    wl.push(boxAt(0.44, XR + WT, 0, H + 0.1, ZD - 0.12, ZD, 0.002, 1));
    wl.push(boxAt(-0.44, 0.44, 2.025, H + 0.1, ZD - 0.12, ZD, 0.002, 1));
    wl.forEach(function (g) { boxUV(g, 2); });
    var walls = mesh(merge(wl), M.wall, true, true, 'walls');
    grp.add(walls);
    var cb = boxAt(XL - WT, XR + WT, H, H + 0.1, ZD - 0.12, ZB + 0.1, 0.002, 1);
    grp.add(mesh(cb, M.ceil, true, true, 'ceiling'));

    // white trim: hallway baseboards
    var wt = [];
    wt.push(boxAt(XL, XL + 0.012, HY, HY + 0.06, 0.87, ZB, 0.003, 1));
    wt.push(boxAt(XR - 0.012, XR, HY, HY + 0.06, 0.87, ZB, 0.003, 1));
    wt.push(boxAt(XL, XR, HY, HY + 0.06, ZB - 0.012, ZB, 0.003, 1));
    grp.add(mesh(merge(wt), M.white, false, true, 'trim'));

    // dark wood: step nosing (上がり框), door frame, cabinet plinth, picture frame
    var dw = [];
    function dpush(g, vert) { boxUV(g, 1 / 0.6, vert); dw.push(g); }
    dpush(boxAt(XL, XR, 0, HY, ZS, 0.87, 0.006, SEG));
    dpush(boxAt(-0.49, -0.44, 0, 2.07, ZD - 0.125, ZD + 0.018, 0.004, SEG), true);
    dpush(boxAt(0.44, 0.49, 0, 2.07, ZD - 0.125, ZD + 0.018, 0.004, SEG), true);
    dpush(boxAt(-0.49, 0.49, 2.02, 2.07, ZD - 0.125, ZD + 0.018, 0.004, SEG));
    dpush(boxAt(0.62, XR, 0, 0.09, -1.22, 0.42, 0.003, 1));
    var gp = { x: XL + 0.002, y: 1.5, z: -0.35 };
    dpush(boxAt(XL, XL + 0.022, gp.y - 0.19, gp.y + 0.19, gp.z - 0.25, gp.z + 0.25, 0.004, SEG));
    grp.add(mesh(merge(dw), mat.darkWood, true, true, 'darkWood'));
    var gpic = new T.PlaneGeometry(0.45, 0.33); gpic.rotateY(Math.PI / 2); gpic.translate(XL + 0.0235, gp.y, gp.z);
    grp.add(mesh(gpic, M.picture, false, false, 'picture'));

    // shoe cabinet (下駄箱) along the right wall, pale wood, doors face -x
    var sc = [];
    function spush(g, vert, o) { boxUV(g, 1 / 0.6, vert, o || 0, 0); sc.push(g); }
    spush(boxAt(0.63, XR, 0.09, 0.985, -1.22, 0.42, 0.004, SEG));
    spush(boxAt(0.6, XR, 0.985, 1.015, -1.25, 0.45, 0.008, SEG), false, 0.3);
    var dz = [-1.215, -0.805, -0.395, 0.015, 0.415];
    for (var i = 0; i < 4; i++) spush(boxAt(0.612, 0.632, 0.095, 0.978, dz[i] + 0.002, dz[i + 1] - 0.002, 0.004, SEG), true, i * 0.27);
    grp.add(mesh(merge(sc), mat.paleWood, true, true, 'shoeCabinet'));
    var sh = [];
    for (i = 0; i < 4; i++) {
      var hz = (i % 2 === 0) ? dz[i + 1] - 0.03 : dz[i] + 0.03;
      sh.push(boxAt(0.6, 0.612, 0.72, 0.9, hz - 0.006, hz + 0.006, 0.004, 1));
    }
    // ceiling downlights
    var dl = [];
    [[0, -0.55], [0, 1.7]].forEach(function (p) { dl.push(xf(new T.CylinderGeometry(0.06, 0.06, 0.01, 20), p[0], H - 0.004, p[1])); });
    grp.add(mesh(merge(dl), mat.down, false, false, 'downlights'));
    sh.push(xf(new T.TorusGeometry(0.064, 0.005, 6, 24), 0, H - 0.006, -0.55, Math.PI / 2, 0, 0));
    sh.push(xf(new T.TorusGeometry(0.064, 0.005, 6, 24), 0, H - 0.006, 1.7, Math.PI / 2, 0, 0));
    grp.add(mesh(merge(sh), mat.metal, false, true, 'fixtures'));

    // ---------- the front door (hinge x=-0.43, opens outward toward -Z)
    var pivot = new T.Group(); pivot.name = 'doorPivot';
    pivot.position.set(GF.POS.doorHingeX, 0, ZD - 0.04);
    grp.add(pivot);
    var DW = GF.POS.doorW, DH = GF.POS.doorH, DT = 0.04;
    var lf = [];
    var leaf = boxAt(0.003, DW - 0.003, 0.008, DH, 0, DT, 0.004, SEG); boxUV(leaf, 1 / 0.6, true, 0.2); tint(leaf, 0xffffff); lf.push(leaf);
    // shallow horizontal grooves on the inside face (and outside), darker
    [0.52, 1.02, 1.52].forEach(function (y) {
      [DT + 0.0004, -0.0004].forEach(function (z) {
        var gq = boxAt(0.27, DW - 0.06, y - 0.003, y + 0.003, z - 0.0006, z + 0.0006, 0.0005, 1);
        boxUV(gq, 1 / 0.6, true); tint(gq, 0x5e4a3a); lf.push(gq);
      });
    });
    var leafMesh = mesh(merge(lf), mat.door, true, true, 'doorLeaf');
    pivot.add(leafMesh);
    // frosted glass slit
    var SX0 = 0.13, SX1 = 0.2, SY0 = 0.3, SY1 = 1.78;
    var slitMat = new T.MeshBasicMaterial({ color: 0xffffff }); slitMat.color.setRGB(1.7, 1.66, 1.56);
    var slit = mesh(boxAt(SX0, SX1, SY0, SY1, -0.0012, DT + 0.0012, 0.001, 1), slitMat, false, false, 'doorGlass');
    pivot.add(slit);
    // static hardware on the leaf: slit beads, escutcheon + thumb turn inside, pull bar outside, hinges
    var hw = [];
    [DT + 0.002, -0.002].forEach(function (z) {
      hw.push(boxAt(SX0 - 0.008, SX0, SY0 - 0.008, SY1 + 0.008, z - 0.003, z + 0.003, 0.001, 1));
      hw.push(boxAt(SX1, SX1 + 0.008, SY0 - 0.008, SY1 + 0.008, z - 0.003, z + 0.003, 0.001, 1));
      hw.push(boxAt(SX0, SX1, SY0 - 0.008, SY0, z - 0.003, z + 0.003, 0.001, 1));
      hw.push(boxAt(SX0, SX1, SY1, SY1 + 0.008, z - 0.003, z + 0.003, 0.001, 1));
    });
    var HX = GF.POS.doorHandle[0] - GF.POS.doorHingeX, HYh = GF.POS.doorHandle[1];
    hw.push(boxAt(HX - 0.022, HX + 0.022, HYh - 0.07, HYh + 0.2, DT, DT + 0.008, 0.006, SEG));
    hw.push(xf(new T.CylinderGeometry(0.016, 0.016, 0.012, 16), HX, HYh + 0.13, DT + 0.014, Math.PI / 2, 0, 0));
    hw.push(boxAt(HX - 0.004, HX + 0.004, HYh + 0.11, HYh + 0.15, DT + 0.018, DT + 0.03, 0.003, 1));
    hw.push(boxAt(HX - 0.012, HX + 0.012, HYh - 0.45, HYh + 0.45, -0.065, -0.05, 0.006, SEG));   // outside pull bar
    hw.push(boxAt(HX - 0.01, HX + 0.01, HYh - 0.42, HYh - 0.38, -0.05, 0, 0.004, 1));
    hw.push(boxAt(HX - 0.01, HX + 0.01, HYh + 0.38, HYh + 0.42, -0.05, 0, 0.004, 1));
    [0.25, 1.0, 1.75].forEach(function (y) { hw.push(xf(new T.CylinderGeometry(0.007, 0.007, 0.1, 10), 0, y, 0)); });
    pivot.add(mesh(merge(hw), mat.metal, true, true, 'doorHardware'));
    // lever handle (inside): handle = anchor at (0.33, 0.98, -1.50) in world when closed
    var handle = new T.Object3D(); handle.name = 'doorHandle';
    handle.position.set(HX, HYh, DT);
    pivot.add(handle);
    var leverG = new T.Group(); handle.add(leverG);
    var lv = [];
    lv.push(xf(new T.CylinderGeometry(0.0105, 0.0105, 0.05, 14), 0, 0, 0.033, Math.PI / 2, 0, 0));
    lv.push(xf(new T.CylinderGeometry(0.021, 0.021, 0.01, 18), 0, 0, 0.012, Math.PI / 2, 0, 0));
    var lb = new T.CapsuleGeometry(0.0095, 0.11, 4, 12); lb.rotateZ(Math.PI / 2); lb.scale(1, 0.85, 1.15); lb.translate(-0.062, 0, 0.058); lv.push(lb);
    var leverMesh = mesh(merge(lv), mat.lever, true, true, 'doorLever');
    leverG.add(leverMesh);
    var doorGlow = GF.makeGlow([leverMesh]);

    // light leaking round the closed door and under it
    var lk = [];
    var LZ = ZD + 0.0035;
    lk.push(quad([0.415, 0.0, LZ], [0.445, 0.0, LZ], [0.445, 2.02, LZ], [0.415, 2.02, LZ]));
    lk.push(quad([-0.445, 0.0, LZ], [-0.425, 0.0, LZ], [-0.425, 2.02, LZ], [-0.445, 2.02, LZ]));
    lk.push(quad([-0.44, 1.99, LZ], [0.44, 1.99, LZ], [0.44, 2.025, LZ], [-0.44, 2.025, LZ]));
    lk.push(quad([-0.5, 0.003, ZD + 0.28], [0.5, 0.003, ZD + 0.28], [0.5, 0.003, ZD - 0.03], [-0.5, 0.003, ZD - 0.03]));
    var leakMat = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    leakMat.color.setRGB(1.0, 0.9, 0.75);
    var leak = mesh(merge(lk), leakMat, false, false, 'doorLeak'); leak.renderOrder = 1;
    grp.add(leak);

    // ---------- outside
    var lawnG = new T.PlaneGeometry(18, 9.2, 4, 4); lawnG.rotateX(-Math.PI / 2); lawnG.translate(0, -0.004, -6.24);
    planarUV(lawnG, 0, 2, 1 / 1.6, 1 / 1.6);
    grp.add(mesh(lawnG, mat.lawn, false, true, 'lawn'));

    var ms = [];   // misc vertex-coloured exterior pieces
    function mpush(g, col, jit) { boxUV(g, 1.4); tint(g, col, jit || 0.12, rnd); ms.push(g); }
    // garden path: two columns of stone slabs, flush (top at +1 cm)
    for (var z = -2.66; z > -9.25; z -= 0.42) {
      var j1 = (rnd() - 0.5) * 0.02, j2 = (rnd() - 0.5) * 0.02;
      var s1 = boxAt(-0.43 + j1, 0.165 + j1, -0.02, 0.01, z - 0.385, z, 0.008, 1); xf(s1, 0, 0, 0, 0, (rnd() - 0.5) * 0.03, 0); mpush(s1, 0xb9b2a6, 0.18);
      var s2 = boxAt(0.195 + j2, 0.80 + j2, -0.02, 0.01, z - 0.385, z, 0.008, 1); mpush(s2, 0xb3ada2, 0.18);
    }
    // gate pillars + mailbox + low walls at the end of the garden
    var GZ = -9.45;
    mpush(boxAt(-0.82, -0.52, 0, 1.15, GZ - 0.15, GZ + 0.15, 0.015, 2), 0xd9d2c4);
    mpush(boxAt(0.95, 1.25, 0, 1.15, GZ - 0.15, GZ + 0.15, 0.015, 2), 0xd9d2c4);
    mpush(boxAt(-0.84, -0.5, 1.15, 1.19, GZ - 0.17, GZ + 0.17, 0.01, 1), 0x8f8a82);
    mpush(boxAt(0.93, 1.27, 1.15, 1.19, GZ - 0.17, GZ + 0.17, 0.01, 1), 0x8f8a82);
    mpush(boxAt(0.97, 1.23, 0.72, 1.02, GZ + 0.15, GZ + 0.27, 0.012, 2), 0x46505c);
    mpush(boxAt(-6, -0.82, 0, 0.62, GZ - 0.1, GZ + 0.1, 0.01, 1), 0xd3ccbe);
    mpush(boxAt(1.25, 6, 0, 0.62, GZ - 0.1, GZ + 0.1, 0.01, 1), 0xd3ccbe);
    // street, curbs, opposite block wall
    mpush(boxAt(-30, 30, -0.03, -0.002, -14.2, GZ - 0.1, 0.002, 1), 0x6d6c6a, 0.04);
    mpush(boxAt(-30, 30, -0.02, 0.0, GZ - 0.42, GZ - 0.32, 0.002, 1), 0xe9e7e0, 0.02);
    mpush(boxAt(-30, 30, -0.02, 0.0, -13.95, -13.85, 0.002, 1), 0xe9e7e0, 0.02);
    mpush(boxAt(-30, 30, 0, 1.2, -14.5, -14.3, 0.01, 1), 0xc7c0b2);
    mpush(boxAt(-40, 40, -0.05, -0.006, -42, -14.5, 0.002, 1), 0x8d9670, 0.05);
    // utility pole (+ wires)
    mpush(xf(new T.CylinderGeometry(0.13, 0.17, 9, 12), -2.6, 4.5, GZ - 0.6), 0xa8a59e, 0.05);
    mpush(boxAt(-3.35, -1.85, 7.6, 7.7, GZ - 0.66, GZ - 0.54, 0.01, 1), 0x8e8b85, 0.05);
    [7.2, 7.65].forEach(function (y) {
      var wg = new T.CylinderGeometry(0.008, 0.008, 60, 4); wg.rotateZ(Math.PI / 2); wg.translate(0, y, GZ - 0.6); mpush(wg, 0x333333, 0.01);
    });
    // neighbourhood: two-storey houses across the street (with a gap showing distant trees and sky)
    function house(cx, cz, w, d, hgt, wallCol, roofCol) {
      mpush(boxAt(cx - w / 2, cx + w / 2, 0, hgt, cz - d / 2, cz + d / 2, 0.02, 1), wallCol, 0.06);
      var x0 = cx - w / 2 - 0.3, x1 = cx + w / 2 + 0.3, ey = hgt - 0.05, ry = hgt + 1.7, zf = cz + d / 2 + 0.45, zb = cz - d / 2 - 0.45;
      function face(a, b, c, dd, want, col) {
        var q = quad(a, b, c, dd), N = q.attributes.normal;
        if (N.getX(0) * want[0] + N.getY(0) * want[1] + N.getZ(0) * want[2] < 0) { q.setIndex([0, 2, 1, 0, 3, 2]); q.computeVertexNormals(); }
        mpush(q, col, 0.04);
      }
      face([x0, ey, zf], [x1, ey, zf], [x1, ry, cz], [x0, ry, cz], [0, 1, 1], roofCol);
      face([x0, ey, zb], [x1, ey, zb], [x1, ry, cz], [x0, ry, cz], [0, 1, -1], roofCol);
      face([x0, ey, zf], [x1, ey, zf], [x1, ey, zb], [x0, ey, zb], [0, -1, 0], 0xd8d4cc);
      face([x0 + 0.3, hgt, zf - 0.45], [x0 + 0.3, hgt, zb + 0.45], [x0 + 0.3, ry - 0.2, cz], [x0 + 0.3, ry - 0.2, cz], [-1, 0, 0], wallCol);
      face([x1 - 0.3, hgt, zf - 0.45], [x1 - 0.3, hgt, zb + 0.45], [x1 - 0.3, ry - 0.2, cz], [x1 - 0.3, ry - 0.2, cz], [1, 0, 0], wallCol);
      for (var fl = 0; fl < 2; fl++) for (var k = 0; k < 3; k++) {
        var wx = cx - w / 2 + w * (0.2 + 0.3 * k);
        mpush(boxAt(wx - 0.45, wx + 0.45, 1.0 + fl * 2.6, 2.1 + fl * 2.6, cz + d / 2, cz + d / 2 + 0.05, 0.01, 1), 0x5b6670, 0.1);
        mpush(boxAt(wx - 0.5, wx + 0.5, 0.95 + fl * 2.6, 1.0 + fl * 2.6, cz + d / 2, cz + d / 2 + 0.08, 0.01, 1), 0xe6e2da, 0.02);
      }
    }
    house(-4.6, -20, 7, 6, 5.4, 0xe7e0d2, 0x5f6670);
    house(5.2, -21.5, 7.5, 6, 5.6, 0xd9d5cc, 0x7a5d4d);
    house(0.4, -34, 8, 6, 5.0, 0xe2ddd3, 0x6b7280);
    // tree trunk
    mpush(xf(new T.CylinderGeometry(0.07, 0.11, 2.1, 10), 1.45, 1.05, -5.7), 0x6e5845, 0.1);
    mpush(xf(new T.CylinderGeometry(0.035, 0.05, 0.9, 8), 1.3, 1.85, -5.7, 0, 0, 0.6), 0x6e5845, 0.1);
    var misc = mesh(merge(ms), mat.misc, true, true, 'exterior');
    grp.add(misc);

    // foliage: hedges, shrubs, tree canopy, distant trees
    var fo = [];
    var det = low ? 2 : 3;
    function fpush(g) { boxUV(g, 2.6); fo.push(g); }
    [-1, 1].forEach(function (s) {
      var hb = new T.BoxGeometry(0.5, 0.75, 6.3, 3, 5, low ? 24 : 42);
      var P = hb.attributes.position, N = hb.attributes.normal, ca = new Float32Array(P.count * 3), c0 = new T.Color(0x5f8045);
      for (var i = 0; i < P.count; i++) {
        var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        var n = n3(x * 4 + s * 7, y * 4, z * 4) - 0.5;
        var k = 0.05 * n + 0.02 * (n3(x * 13, y * 13, z * 13) - 0.5);
        var rx = Math.sign(x) * Math.max(0, Math.abs(x) - 0.17), ry = Math.max(0, y - 0.25);
        x -= rx * 0.4 * (ry / 0.13); y -= ry * 0.25 * (Math.abs(rx) / 0.08);
        P.setXYZ(i, x + N.getX(i) * k, y + N.getY(i) * k, z + N.getZ(i) * k);
        var ao = GF.clamp(0.6 + 0.5 * (y + 0.375) / 0.75 + n, 0.4, 1.2);
        ca[i * 3] = c0.r * ao; ca[i * 3 + 1] = c0.g * ao; ca[i * 3 + 2] = c0.b * ao;
      }
      hb.setAttribute('color', new T.BufferAttribute(ca, 3));
      smoothNormals(hb);
      hb.translate(s * 1.75, 0.375, -6.15);
      fpush(hb);
    });
    var shrubs = [[-0.95, -3.4, 0.32, 0x6a8e4c], [1.3, -3.2, 0.36, 0x5f8a48], [-1.08, -5.0, 0.4, 0x6f9650], [1.12, -7.6, 0.34, 0x648f4b], [-1.0, -7.9, 0.38, 0x5d8445], [1.35, -4.5, 0.3, 0x76994f]];
    shrubs.forEach(function (b, i) {
      var g = blob(b[2], det, 0.42, 4.5, i * 3.7, b[3], rnd, true); g.scale(1.2, 0.85, 1.1);
      g.translate(b[0], b[2] * 0.6, b[1]); fpush(g);
    });
    // low flower-bed mounds along the path
    [[-0.68, -4.2, 0.9], [-0.68, -6.4, 1.2], [1.05, -5.6, 1.0], [1.0, -8.5, 0.7]].forEach(function (b, i) {
      var g = blob(0.25, det - 1, 0.3, 4, 11 + i, 0x6f9650, rnd, true); g.scale(1.0, 0.6, b[2] / 0.5);
      g.translate(b[0], 0.08, b[1]); fpush(g);
    });
    // tree canopy (right side)
    [[1.45, 2.6, -5.7, 0.62], [1.0, 2.3, -5.45, 0.45], [1.9, 2.35, -5.95, 0.48], [1.4, 3.1, -5.8, 0.45], [1.15, 2.85, -6.1, 0.4], [1.75, 2.9, -5.5, 0.4], [1.5, 2.2, -5.3, 0.38]].forEach(function (b, i) {
      var g = blob(b[3], det, 0.45, 4.0, 20 + i * 2.3, 0x6b9a4c, rnd, false); g.translate(b[0], b[1], b[2]); fpush(g);
    });
    // distant trees beyond the houses
    for (i = 0; i < 7; i++) {
      var tx = -9 + i * 3 + rnd() * 1.5, r = 2 + rnd() * 1.4;
      var g = blob(r, 1, 0.35, 0.8, 40 + i, 0x9aad8e, rnd, false); g.scale(1, 0.9, 1); g.translate(tx, r * 0.75, -29 - rnd() * 3); fpush(g);
    }
    var foliage = mesh(merge(fo), mat.foliage, true, true, 'foliage');
    grp.add(foliage);

    // flowers (tiny blossoms on the beds and shrubs)
    var flw = [];
    var fcols = [0xf2a7b8, 0xfaf6ee, 0xf5d36a, 0xc7a6e0, 0xf08a8a];
    function flowers(cx, cz, rx, rz, y0, n, seed) {
      var rr = GF.rng(seed);
      for (var k = 0; k < n; k++) {
        var a = rr() * TAU, d = Math.sqrt(rr());
        var g = new T.IcosahedronGeometry(0.018 + rr() * 0.012, 0);
        g.scale(1, 0.6, 1);
        g.translate(cx + Math.cos(a) * rx * d, y0 + (1 - d) * 0.1 + rr() * 0.04, cz + Math.sin(a) * rz * d);
        tint(g, fcols[(rr() * fcols.length) | 0], 0.15, rr);
        flw.push(g);
      }
    }
    flowers(-0.68, -4.2, 0.22, 0.45, 0.12, low ? 30 : 60, 1);
    flowers(-0.68, -6.4, 0.22, 0.6, 0.12, low ? 30 : 70, 2);
    flowers(1.05, -5.6, 0.22, 0.5, 0.12, low ? 30 : 60, 3);
    flowers(1.0, -8.5, 0.22, 0.35, 0.12, low ? 20 : 40, 4);
    flowers(1.12, -3.15, 0.3, 0.3, 0.32, low ? 12 : 25, 5);
    flowers(-0.92, -3.4, 0.28, 0.28, 0.3, low ? 12 : 25, 6);
    grp.add(mesh(merge(flw), mat.flower, false, false, 'flowers'));

    // sky (partial dome facing -Z)
    var skyG = new T.SphereGeometry(44, low ? 24 : 40, low ? 10 : 16, 3.4034, 2.618, 0, Math.PI / 2 + 0.15);
    skyG.translate(0, -1.5, -6);
    var skyMat = new T.MeshBasicMaterial({ map: TX.sky, side: T.BackSide, depthWrite: false, fog: false });
    skyMat.color.setRGB(1.08, 1.08, 1.08);
    var sky = mesh(skyG, skyMat, false, false, 'sky'); sky.renderOrder = -1;
    grp.add(sky);

    // ---------- lights
    var hemi = new T.HemisphereLight(0xe2ebf7, 0x9a8a70, 0.5);
    var ceilL = new T.PointLight(0xffe2c2, 1.6, 0, 2); ceilL.position.set(0, 2.2, -0.45);
    var bounce = new T.PointLight(0xfff0dc, 0, 0, 2); bounce.position.set(0, 0.45, -0.75);
    // The sun stands high on the right, slightly behind the house: porch, path, Mum's back and the garden are
    // front-lit. With shadow maps the sealed shell keeps the interior out of the sun; in low mode a spotlight
    // whose cone stops short of the doorway does the same job.
    var sun;
    if (!low) {
      sun = new T.DirectionalLight(0xfff1de, 3.7);
      sun.target.position.set(0, 0, -3.4);
      sun.position.copy(sun.target.position).addScaledVector(new T.Vector3(0.42, 0.8, 0.43).normalize(), 16);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      var c = sun.shadow.camera; c.left = -3.9; c.right = 3.9; c.top = 7.2; c.bottom = -7.2; c.near = 4; c.far = 32;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    } else {
      sun = new T.SpotLight(0xfff1de, 3.7, 0, 0.56, 0.3, 0);
      sun.position.set(2.6, 8.5, -1.2);
      sun.target.position.set(0, 0, -7.5);
    }
    // sunlight pouring in through the doorway: soft-edged patch on the tiles (length and strength follow daylight)
    var patchMat = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      opacity: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    patchMat.color.setRGB(0.62, 0.52, 0.38);
    var patch = mesh(quad([-0.5, 0.003, 0], [0.5, 0.003, 0], [0.5, 0.003, -1], [-0.5, 0.003, -1]), patchMat, false, false, 'sunPatch');
    if (patch.geometry.attributes.normal.getY(0) < 0) patch.geometry.setIndex([0, 2, 1, 0, 3, 2]);
    patch.renderOrder = 1; patch.visible = false;
    grp.add(patch);
    function placePatch(len) {   // trapezoid from the threshold into the room, skewed a little to the right
      var P = patch.geometry.attributes.position, z1 = ZD + 0.02 + len;
      var sk = len * 0.16, wd = 0.47 + len * 0.12;
      P.setXYZ(0, -0.47 + 0.0, 0.003, ZD + 0.02); P.setXYZ(1, 0.47, 0.003, ZD + 0.02);
      P.setXYZ(2, wd + sk, 0.003, z1); P.setXYZ(3, -wd + sk, 0.003, z1);
      P.needsUpdate = true; patch.geometry.computeBoundingSphere();
    }
    grp.add(hemi, ceilL, bounce, sun, sun.target);
    var lights = { sun: sun, hemi: hemi, ceiling: ceilL, bounce: bounce };

    // ---------- state
    var st = { open: -1, handle: -1, day: -1 };
    function applyLeak() {
      var o = Math.max(0, st.open), d = Math.max(0, st.day);
      var k = (1 - GF.smooth(0, 0.25, o));
      leakMat.opacity = k; leak.visible = k > 0.003;
      var pv = GF.clamp(d, 0, 1) * GF.smooth(0.03, 0.55, o);
      patch.visible = pv > 0.003;
      if (patch.visible) { patchMat.opacity = Math.min(1, pv * 1.15); placePatch(0.45 + 1.15 * pv); }
    }
    var door = {
      pivot: pivot, handle: handle,
      setOpen: function (v) {
        v = GF.clamp(+v || 0, 0, 1);
        if (v === st.open) return;
        st.open = v;
        pivot.rotation.y = v * (80 * Math.PI / 180);
        pivot.updateMatrixWorld(true);
        applyLeak();
      },
      setHandle: function (p) {
        p = GF.clamp(+p || 0, 0, 1);
        if (p === st.handle) return;
        st.handle = p;
        leverG.rotation.z = p * (35 * Math.PI / 180);
      }
    };
    Object.defineProperty(door, 'open', { get: function () { return Math.max(0, st.open); }, enumerable: true });
    function setDaylight(v) {
      v = GF.clamp(+v || 0, 0, 1);
      if (v === st.day) return;
      st.day = v;
      hemi.intensity = GF.lerp(0.5, 1.35, v);
      bounce.intensity = GF.lerp(0, 2.2, v);
      ceilL.intensity = GF.lerp(1.6, 1.1, v);
      applyLeak();
    }
    door.setOpen(0); door.setHandle(0); setDaylight(0);

    var api = {
      group: grp, lights: lights, door: door,
      setDoorGlow: function (v) { doorGlow(+v || 0); },
      setDaylight: setDaylight,
      update: function (dt, t) {
        dt = GF.clamp(+dt || 0, 0, 0.1);
        sky.rotation.y = Math.sin((+t || 0) * 0.01) * 0.01;
      }
    };
    return { group: grp, api: api };
  }
})();
