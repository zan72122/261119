// models_party.js — cake things, Papa and the room (procedural, no external assets)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- utils
const _cache = {};
function once(key, fn) { if (!(key in _cache)) _cache[key] = fn(); return _cache[key]; }

function rng(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, srgb = true, wrapS = false, wrapT = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrapS) t.wrapS = THREE.RepeatWrapping;
  if (wrapT) t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
function shadows(obj, cast = true, recv = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = recv; } });
  return obj;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// tileable value noise
function makeNoise(seed) {
  const r = rng(seed), P = 256, g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const n = (x, y, px = P, py = P) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = g[(y0 & 255) * P + (x0 & 255)], b = g[(y0 & 255) * P + (x1 & 255)];
    const c = g[(y1 & 255) * P + (x0 & 255)], d = g[(y1 & 255) * P + (x1 & 255)];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
  n.fbm = (x, y, oct = 4, px = P, py = P) => {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f, px * f, py * f); t += a; a *= 0.5; f *= 2; }
    return s / t;
  };
  return n;
}

function splinePts(pts, perSeg = 4) {
  const c = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1])));
  return c.getPoints((pts.length - 1) * perSeg).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
}
function spacedPts(pts, n) {
  const c = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1])));
  return c.getSpacedPoints(n).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
}
// average normals across the lathe seam and at the poles
function latheFix(geo, np, segs) {
  const n = geo.attributes.normal, p = geo.attributes.position;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let j = 0; j < np; j++) {
    const a = j, b = segs * np + j;
    v.fromBufferAttribute(n, a).add(w.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  for (const j of [0, np - 1]) {
    if (Math.hypot(p.getX(j), p.getZ(j)) > 1e-6) continue;
    v.set(0, 0, 0);
    for (let i = 0; i <= segs; i++) v.add(w.fromBufferAttribute(n, i * np + j));
    v.normalize();
    for (let i = 0; i <= segs; i++) n.setXYZ(i * np + j, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}
// a rounded tapered limb along -Y: top cap centred at origin (radius r0), bottom cap at -len (radius r1)
function limbGeo(r0, r1, len, seg = 20) {
  const pts = [];
  const N = 6;
  for (let k = 0; k <= N; k++) { const a = -Math.PI / 2 + (k / N) * Math.PI / 2; pts.push(new THREE.Vector2(r1 * Math.cos(a), -len + r1 * Math.sin(a))); }
  for (let k = 0; k <= N; k++) { const a = (k / N) * Math.PI / 2; pts.push(new THREE.Vector2(r0 * Math.cos(a), r0 * Math.sin(a))); }
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, seg);
}
function glowTexture() {
  return once('glowTex', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return canvasTex(c);
  });
}

// ---------------------------------------------------------------- 1. cake stand
export function makeCakeStand() {
  const geo = once('standGeo', () => {
    const P = [[0, 0.0035], [0.030, 0.0036], [0.052, 0.0032], [0.059, 0.0016], [0.0625, 0.0002], [0.066, 0.0], [0.0690, 0.0012], [0.0700, 0.0032],
      [0.0680, 0.0062], [0.0600, 0.0105], [0.0470, 0.0170], [0.0360, 0.0245], [0.0300, 0.0315], [0.0310, 0.0380], [0.0400, 0.0430],
      [0.0650, 0.0470], [0.1000, 0.0500], [0.1330, 0.0525], [0.1470, 0.0548], [0.1520, 0.0585], [0.1530, 0.0622], [0.1510, 0.0641],
      [0.1475, 0.0632], [0.1420, 0.0612], [0.1320, 0.0602], [0.1100, 0.0600], [0.0600, 0.0600], [0.0, 0.0600]];
    const g = new THREE.LatheGeometry(splinePts(P, 3), 80);
    latheFix(g, (P.length - 1) * 3 + 1, 80);
    return g;
  });
  const mat = once('standMat', () => new THREE.MeshPhysicalMaterial({
    color: 0xf7f4ee, roughness: 0.18, clearcoat: 0.35, clearcoatRoughness: 0.1,
  }));
  const g = new THREE.Group();
  g.name = 'cakeStand';
  g.add(new THREE.Mesh(geo, mat));
  g.userData.topY = 0.060;
  g.userData.radius = 0.150;
  return shadows(g);
}

// ---------------------------------------------------------------- 2. sponge
const SP_R = 0.105, SP_H = 0.075;
function spongeWobble(theta) {
  return 1 + 0.006 * Math.sin(3 * theta + 1.1) + 0.004 * Math.sin(7 * theta + 2.3) + 0.0025 * Math.sin(13 * theta + 0.4);
}
function wobbleLathe(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const f = spongeWobble(Math.atan2(x, z));
    p.setX(i, x * f); p.setZ(i, z * f);
  }
}
function spongeTextures() {
  return once('spongeTex', () => {
    const N = makeNoise(7);
    // --- side: 1024 x 192, u around, v = y/H (canvas top = cake top)
    const W = 1024, H = 192;
    const c = makeCanvas(W, H), x = c.getContext('2d');
    const img = x.createImageData(W, H), d = img.data;
    for (let py = 0; py < H; py++) {
      const v = 1 - (py + 0.5) / H;
      for (let px = 0; px < W; px++) {
        const n = N.fbm(px / 24, py / 24, 4, W / 24, 1000);
        const fine = N(px / 2.2 + 300, py / 2.2, W / 2.2, 1000);
        let r = 236, g = 194, b = 118; // pale golden crumb
        const k = (n - 0.5) * 26 + (fine - 0.5) * 30;
        r += k; g += k * 0.95; b += k * 0.7;
        // crust band toward the rounded top edge
        const crust = smooth(0.80, 0.985, v);
        r = lerp(r, 176 + k * 0.6, crust); g = lerp(g, 112 + k * 0.5, crust); b = lerp(b, 52 + k * 0.3, crust);
        // thin baked skin at bottom
        const bot = 1 - smooth(0.0, 0.05, v);
        r = lerp(r, 200, bot * 0.7); g = lerp(g, 150, bot * 0.7); b = lerp(b, 85, bot * 0.7);
        const i = (py * W + px) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const R = rng(11);
    // remnants of the peeled baking paper skin (slightly tan, smooth patches)
    for (let k = 0; k < 70; k++) {
      const px = R() * W, py = 20 + R() * (H - 30), w = 10 + R() * 50, h = 3 + R() * 10;
      for (const ox of [-W, 0, W]) {
        x.fillStyle = `rgba(198,142,72,${0.10 + R() * 0.12})`;
        x.beginPath(); x.ellipse(px + ox, py, w, h, (R() - 0.5) * 0.2, 0, Math.PI * 2); x.fill();
      }
    }
    // pores
    for (let k = 0; k < 5000; k++) {
      const px = R() * W, py = R() * H * 0.92 + H * 0.06;
      const rr = 0.5 + R() * R() * 2.0;
      x.fillStyle = `rgba(160,112,50,${0.12 + R() * 0.25})`;
      x.beginPath(); x.ellipse(px, py, rr * (1 + R()), rr, 0, 0, Math.PI * 2); x.fill();
      if (R() < 0.5) { x.fillStyle = 'rgba(255,240,200,0.35)'; x.fillRect(px + rr, py - rr, 1, 1); }
    }
    const side = canvasTex(c, true, true, false);

    // --- top crust 512 x 512 (planar)
    const T = 512, c2 = makeCanvas(T, T), x2 = c2.getContext('2d');
    const img2 = x2.createImageData(T, T), d2 = img2.data;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const u = (px + 0.5) / T - 0.5, w = (py + 0.5) / T - 0.5;
      const rr = Math.hypot(u, w) * 2;
      const m = N.fbm(px / 40 + 50, py / 40, 5);
      const f = N(px / 3 + 90, py / 3);
      let r = 184, g = 116, b = 50;
      const k = (m - 0.5) * 60 + (f - 0.5) * 16;
      r += k; g += k * 0.8; b += k * 0.5;
      const edge = smooth(0.80, 1.0, rr); // darker toward the edge
      r -= 22 * edge; g -= 18 * edge; b -= 10 * edge;
      const i = (py * T + px) * 4;
      d2[i] = r; d2[i + 1] = g; d2[i + 2] = b; d2[i + 3] = 255;
    }
    x2.putImageData(img2, 0, 0);
    for (let k = 0; k < 900; k++) {
      const px = R() * T, py = R() * T, rr = 0.6 + R() * 1.6;
      x2.fillStyle = R() < 0.5 ? 'rgba(110,60,22,0.35)' : 'rgba(225,165,90,0.35)';
      x2.beginPath(); x2.arc(px, py, rr, 0, Math.PI * 2); x2.fill();
    }
    const top = canvasTex(c2);
    return { side, top };
  });
}
function spongeGeos() {
  return once('spongeGeo', () => {
    const segs = 96;
    const sideP = [[0, 0], [0.05, 0], [0.1005, 0], [0.1038, 0.0012], [0.1050, 0.0040], [0.1050, 0.020], [0.1051, 0.040],
      [0.1050, 0.056], [0.1045, 0.0640], [0.1032, 0.0690], [0.1010, 0.0722], [0.0975, 0.0742], [0.0930, 0.0750]];
    const topP = [[0.0930, 0.0750], [0.0850, 0.07515], [0.0600, 0.0754], [0.0300, 0.0756], [0.0, 0.0757]];
    const sp = splinePts(sideP, 3), tp = splinePts(topP, 3);
    const side = new THREE.LatheGeometry(sp, segs);
    const top = new THREE.LatheGeometry(tp, segs);
    wobbleLathe(side); wobbleLathe(top);
    side.computeVertexNormals(); top.computeVertexNormals();
    latheFix(side, sp.length, segs); latheFix(top, tp.length, segs);
    // make the seam between side and top share normals (top ring of side = outer ring of top)
    const sn = side.attributes.normal, tn = top.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const a = i * sp.length + sp.length - 1, b = i * tp.length;
      v.fromBufferAttribute(sn, a).add(w.fromBufferAttribute(tn, b)).normalize();
      sn.setXYZ(a, v.x, v.y, v.z); tn.setXYZ(b, v.x, v.y, v.z);
    }
    // uvs
    const suv = side.attributes.uv, spos = side.attributes.position;
    for (let k = 0; k < suv.count; k++) suv.setY(k, spos.getY(k) / SP_H);
    const tuv = top.attributes.uv, tpos = top.attributes.position;
    for (let k = 0; k < tuv.count; k++) { tuv.setXY(k, 0.5 + tpos.getX(k) / (2 * SP_R), 0.5 - tpos.getZ(k) / (2 * SP_R)); }
    return { side, top };
  });
}
export function makeSponge() {
  const tx = spongeTextures(), geo = spongeGeos();
  const mats = once('spongeMats', () => ({
    side: new THREE.MeshStandardMaterial({ map: tx.side, bumpMap: tx.side, bumpScale: 0.6, roughness: 0.92 }),
    top: new THREE.MeshStandardMaterial({ map: tx.top, bumpMap: tx.top, bumpScale: 1.0, roughness: 0.88 }),
  }));
  const g = new THREE.Group();
  g.name = 'sponge';
  const inner = new THREE.Group();
  inner.add(new THREE.Mesh(geo.side, mats.side), new THREE.Mesh(geo.top, mats.top));
  g.add(inner);
  g.userData.radius = SP_R;
  g.userData.height = SP_H;
  g.userData.squish = (a) => {
    a = clamp(a, 0, 1);
    inner.scale.set(1 + 0.035 * a, 1 - 0.12 * a, 1 + 0.035 * a);
  };
  return shadows(g);
}

// ---------------------------------------------------------------- 3. strawberry
const SB_PROFILE = [[0, 0], [0.0060, 0], [0.0098, 0.0003], [0.0128, 0.0016], [0.0145, 0.0042], [0.0151, 0.0075], [0.0148, 0.0108],
  [0.0136, 0.0148], [0.0118, 0.0193], [0.0096, 0.0238], [0.0072, 0.0280], [0.0047, 0.0314], [0.0024, 0.0335], [0.0008, 0.0344], [0, 0.0346]];
const SB_NP = 56, SB_SEG = 40;
function strawberryBase() {
  return once('sbBase', () => {
    const pts = spacedPts(SB_PROFILE, SB_NP - 1);
    let L = 0; const s = [0];
    for (let i = 1; i < pts.length; i++) { L += pts[i].distanceTo(pts[i - 1]); s.push(L); }
    return { pts, L, s };
  });
}
function strawberryTextures() {
  return once('sbTex', () => {
    const { pts, L } = strawberryBase();
    const S = 512;
    const rAt = (v) => { const f = v * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return lerp(pts[i].x, pts[i + 1].x, f - i); };
    const yAt = (v) => { const f = v * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return lerp(pts[i].y, pts[i + 1].y, f - i); };
    let vCut = 0; for (let k = 0; k <= 200; k++) { if (yAt(k / 200) > 0.0013) { vCut = k / 200; break; } }
    const N = makeNoise(21);
    const c = makeCanvas(S, S), x = c.getContext('2d');
    const img = x.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) {
      const v = 1 - (py + 0.5) / S;
      for (let px = 0; px < S; px++) {
        const u = (px + 0.5) / S;
        let r, g, b;
        if (v < vCut) {
          const t = v / vCut; // 0 centre .. 1 edge of the cut face
          const streak = N(u * 60, t * 4, 60, 1000);
          r = lerp(244, 214, t * t) - streak * 10; g = lerp(214, 70, t * t) - streak * 20; b = lerp(206, 72, t * t) - streak * 15;
        } else {
          const t = (v - vCut) / (1 - vCut);
          const n = N.fbm(u * 24, v * 18, 3, 24, 1000);
          // pale shoulder near the hull, deep red up to the tip
          const pale = 1 - smooth(0.0, 0.22, t);
          r = lerp(178, 238, pale) + (n - 0.5) * 30;
          g = lerp(18, 128, pale * pale) + (n - 0.5) * 14;
          b = lerp(30, 112, pale * pale) + (n - 0.5) * 10;
          const tip = smooth(0.85, 1.0, t); r = lerp(r, 196, tip * 0.4); g = lerp(g, 40, tip * 0.4);
        }
        const i = (py * S + px) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const cb = makeCanvas(S, S), xb = cb.getContext('2d');
    xb.fillStyle = 'rgb(150,150,150)'; xb.fillRect(0, 0, S, S);
    const R = rng(5);
    const sh = S * 0.0014 / L;
    let row = 0;
    for (let s = vCut * L + 0.0026; s < L - 0.0024; s += 0.0032, row++) {
      const v = s / L, r = Math.max(rAt(v), 0.0022);
      const n = Math.max(3, Math.round(2 * Math.PI * r / 0.0037));
      const sw = Math.min(S * 0.00095 / (2 * Math.PI * r), 40);
      const py = (1 - v) * S;
      for (let k = 0; k < n; k++) {
        const u = (k + (row % 2) * 0.5 + (R() - 0.5) * 0.25) / n;
        const pyj = py + (R() - 0.5) * sh * 0.4;
        for (const ox of [-S, 0, S]) {
          const px = u * S + ox;
          if (px < -60 || px > S + 60) continue;
          // dimple
          x.fillStyle = 'rgba(90,0,8,0.45)';
          x.beginPath(); x.ellipse(px, pyj, sw * 1.15, sh * 0.85, 0, 0, Math.PI * 2); x.fill();
          // achene
          x.fillStyle = R() < 0.2 ? '#b89a3e' : '#d8b44a';
          x.beginPath(); x.ellipse(px, pyj - sh * 0.08, sw * 0.5, sh * 0.42, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = 'rgba(255,245,200,0.45)';
          x.beginPath(); x.ellipse(px - sw * 0.15, pyj - sh * 0.22, sw * 0.18, sh * 0.13, 0, 0, Math.PI * 2); x.fill();
          // bump
          const gr = xb.createRadialGradient(px, pyj, 0, px, pyj, Math.max(sw, sh) * 1.3);
          gr.addColorStop(0, 'rgba(40,40,40,1)'); gr.addColorStop(0.6, 'rgba(90,90,90,0.8)'); gr.addColorStop(1, 'rgba(150,150,150,0)');
          xb.save(); xb.translate(px, pyj); xb.scale(sw / Math.max(sw, sh), sh / Math.max(sw, sh)); xb.translate(-px, -pyj);
          xb.fillStyle = gr; xb.beginPath(); xb.arc(px, pyj, Math.max(sw, sh) * 1.3, 0, Math.PI * 2); xb.fill(); xb.restore();
          xb.fillStyle = 'rgb(205,205,205)';
          xb.beginPath(); xb.ellipse(px, pyj - sh * 0.08, sw * 0.45, sh * 0.38, 0, 0, Math.PI * 2); xb.fill();
        }
      }
    }
    return { map: canvasTex(c, true, true, false), bump: canvasTex(cb, false, true, false) };
  });
}
function strawberryGeo(variant) {
  return once('sbGeo' + variant, () => {
    const { pts } = strawberryBase();
    const g = new THREE.LatheGeometry(pts, SB_SEG);
    const R = rng(100 + variant * 17);
    const a1 = 0.03 + R() * 0.03, a2 = 0.025 + R() * 0.03, a3 = 0.015 + R() * 0.02;
    const p1 = R() * 6.28, p2 = R() * 6.28, p3 = R() * 6.28;
    const tilt = (R() - 0.5) * 0.004, tiltZ = (R() - 0.5) * 0.003, flat = 1 + (R() - 0.5) * 0.12;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = y / 0.0346, th = Math.atan2(x, z);
      const f = 1 + a1 * Math.sin(th + p1) * (0.4 + t) + a2 * Math.sin(2 * th + p2) * t + a3 * Math.sin(3 * th + p3) * (0.3 + t);
      x *= f * flat; z *= f / flat;
      x += tilt * t * t; z += tiltZ * t * t;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    latheFix(g, SB_NP, SB_SEG);
    return g;
  });
}
export function makeStrawberry(seed = 0) {
  const tx = strawberryTextures();
  const mat = once('sbMat', () => new THREE.MeshPhysicalMaterial({
    map: tx.map, bumpMap: tx.bump, bumpScale: 2.0, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.18,
  }));
  const R = rng(seed * 31 + 7);
  const variant = ((seed % 3) + 3) % 3;
  const mesh = new THREE.Mesh(strawberryGeo(variant), mat);
  const s = 0.9 + R() * 0.2, sy = s * (0.94 + R() * 0.12);
  mesh.scale.set(s, sy, s);
  mesh.rotation.y = R() * Math.PI * 2;
  const g = new THREE.Group();
  g.name = 'strawberry';
  g.add(mesh);
  g.userData.radius = 0.015 * s;
  g.userData.height = 0.0346 * sy;
  return shadows(g);
}

// ---------------------------------------------------------------- 4. candle
const CANDLE_R = 0.0042, CANDLE_L = 0.075, CANDLE_PITCH = 0.025;
const CANDLE_COLORS = [0xf4a3bf, 0x9ccdf0, 0xf6dc80, 0xa3e0c3, 0xc7b0ea];
function candleGeo() {
  return once('candleGeo', () => {
    const R = CANDLE_R, L = CANDLE_L;
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R * 0.85, 0), new THREE.Vector2(R * 0.97, 0.0002), new THREE.Vector2(R, 0.0008)];
    const M = 44;
    for (let k = 1; k < M; k++) pts.push(new THREE.Vector2(R, 0.0008 + (L - 0.0022) * k / M));
    pts.push(new THREE.Vector2(R, L - 0.0012), new THREE.Vector2(R * 0.96, L - 0.0004), new THREE.Vector2(R * 0.82, L), new THREE.Vector2(R * 0.4, L - 0.0002), new THREE.Vector2(0, L - 0.0004));
    const segs = 28;
    const g = new THREE.LatheGeometry(pts, segs);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      uv.setY(i, y / L);
      if (r > R * 0.9) {
        const th = Math.atan2(x, z);
        const k = smooth(0.0, 0.004, y) * (1 - smooth(L - 0.004, L, y));
        const f = 1 + 0.075 * k * Math.cos(4 * (th - 2 * Math.PI * y / CANDLE_PITCH));
        p.setX(i, x * f); p.setZ(i, z * f);
      }
    }
    g.computeVertexNormals();
    latheFix(g, pts.length, segs);
    return g;
  });
}
function candleTex(i) {
  return once('candleTex' + i, () => {
    const W = 64, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
    const img = x.createImageData(W, H), d = img.data;
    const base = new THREE.Color(CANDLE_COLORS[i]);
    const br = Math.round(Math.pow(base.r, 1 / 2.2) * 255), bg = Math.round(Math.pow(base.g, 1 / 2.2) * 255), bb = Math.round(Math.pow(base.b, 1 / 2.2) * 255);
    for (let py = 0; py < H; py++) {
      const v = 1 - (py + 0.5) / H, y = v * CANDLE_L;
      for (let px = 0; px < W; px++) {
        const u = (px + 0.5) / W;
        let ph = 2 * (u - y / CANDLE_PITCH); ph -= Math.floor(ph);
        const dd = Math.min(ph, 1 - ph);
        const s = 1 - smooth(0.09, 0.13, dd);
        const n = (Math.sin(px * 1.7 + py * 0.31) + Math.sin(py * 0.07)) * 2;
        const k = (py * W + px) * 4;
        d[k] = lerp(br, 252, s) + n; d[k + 1] = lerp(bg, 250, s) + n; d[k + 2] = lerp(bb, 246, s) + n; d[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return canvasTex(c, true, true, false);
  });
}
export function makeCandle(i = 0) {
  i = ((i % 5) + 5) % 5;
  const mat = once('candleMat' + i, () => new THREE.MeshPhysicalMaterial({ map: candleTex(i), roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.35 }));
  const wickMat = once('wickMat', () => new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.9 }));
  const wickGeo = once('wickGeo', () => { const g = new THREE.CylinderGeometry(0.00055, 0.0007, 0.0072, 6, 1); g.translate(0, 0.0036, 0); return g; });
  const g = new THREE.Group();
  g.name = 'candle';
  g.add(new THREE.Mesh(candleGeo(), mat));
  const wick = new THREE.Mesh(wickGeo, wickMat);
  wick.position.y = CANDLE_L - 0.0012;
  wick.rotation.z = 0.12; wick.rotation.x = 0.05;
  g.add(wick);
  const tip = new THREE.Object3D();
  tip.position.y = 0.0072 - 0.0005;
  wick.add(tip);
  g.userData.wickTop = tip;
  g.userData.length = CANDLE_L;
  g.userData.color = CANDLE_COLORS[i];
  g.userData.radius = CANDLE_R;
  return shadows(g);
}

// ---------------------------------------------------------------- 5. crayon drawing
export function makeCrayonDrawingTexture() {
  return once('crayon', () => {
    const W = 384, H = 512, R = rng(261119);
    const c = makeCanvas(W, H), x = c.getContext('2d');
    // paper
    const N = makeNoise(77);
    const img = x.createImageData(W, H), d = img.data;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const n = N.fbm(px / 6, py / 6, 3) - 0.5, f = N(px * 0.9 + 400, py * 0.25) - 0.5;
      const light = 1 - 0.06 * Math.hypot((px - W * 0.35) / W, (py - H * 0.3) / H);
      const k = (py * W + px) * 4;
      d[k] = (246 + n * 10 + f * 6) * light; d[k + 1] = (241 + n * 10 + f * 6) * light; d[k + 2] = (229 + n * 12 + f * 6) * light; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);

    // crayon layer + waxy grain mask
    const Lc = makeCanvas(W, H), l = Lc.getContext('2d');
    l.lineCap = 'round'; l.lineJoin = 'round';
    const J = (a) => (R() - 0.5) * 2 * a;
    const stroke = (pts, color, width, passes = 3, alpha = 0.55) => {
      for (let p = 0; p < passes; p++) {
        l.strokeStyle = color; l.globalAlpha = alpha * (0.8 + R() * 0.4); l.lineWidth = width * (0.75 + R() * 0.5);
        l.beginPath();
        pts.forEach((q, k) => { const X = q[0] + J(1.6), Y = q[1] + J(1.6); k ? l.lineTo(X, Y) : l.moveTo(X, Y); });
        l.stroke();
      }
      l.globalAlpha = 1;
    };
    const wobblyCircle = (cx, cy, rx, ry, over = 0.35, ph = R() * 6) => {
      const pts = [];
      const n = 70, a0 = R() * 6.28;
      for (let k = 0; k <= n; k++) {
        const a = a0 + (k / n) * (Math.PI * 2 + over);
        const w = 1 + 0.035 * Math.sin(3 * a + ph) + 0.02 * Math.sin(5 * a + ph * 2) + (k / n) * 0.03;
        pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
      }
      return pts;
    };
    const scribble = (pathFn, bbox, color, alpha = 0.35, spacing = 6, angle = -0.5, width = 7) => {
      l.save();
      l.beginPath(); pathFn(); l.clip();
      l.strokeStyle = color; l.lineWidth = width; l.globalAlpha = alpha;
      const [x0, y0, x1, y1] = bbox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rr = Math.hypot(x1 - x0, y1 - y0) / 2 + 10;
      l.translate(cx, cy); l.rotate(angle);
      l.beginPath();
      let y = -rr, dir = 1;
      l.moveTo(-rr, y);
      while (y < rr) { y += spacing * (0.6 + R() * 0.9); l.lineTo(dir * rr + J(6), y); dir = -dir; }
      l.stroke();
      l.restore();
      l.globalAlpha = 1;
    };
    const ellipsePath = (cx, cy, rx, ry) => () => l.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const heartPts = (cx, cy, s) => {
      const pts = [];
      for (let k = 0; k <= 60; k++) {
        const t = (k / 60) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([cx + hx * s / 16 + J(1), cy - hy * s / 16 + J(1)]);
      }
      return pts;
    };
    const polyPath = (pts) => () => { pts.forEach((q, k) => k ? l.lineTo(q[0], q[1]) : l.moveTo(q[0], q[1])); l.closePath(); };

    // Papa's face
    const fx = 180, fy = 196, fr = 116;
    scribble(ellipsePath(fx + 4, fy + 3, fr * 1.04, fr * 0.99), [fx - fr, fy - fr, fx + fr, fy + fr], '#f2a77a', 0.42, 7, -0.6, 9);
    // ears
    for (const s of [-1, 1]) {
      const ex = fx + s * (fr + 6), ey = fy + 8;
      scribble(ellipsePath(ex, ey, 16, 24), [ex - 16, ey - 24, ex + 16, ey + 24], '#f2a77a', 0.45, 5, 0.4, 7);
      const pts = []; for (let k = 0; k <= 20; k++) { const a = -Math.PI / 2 + s * (k / 20) * Math.PI; pts.push([ex + Math.cos(a) * 16 * s * s, ey + Math.sin(a) * 23]); }
      stroke(pts.map(p => [fx + (p[0] - fx), p[1]]), '#3a2a24', 5, 2, 0.6);
    }
    stroke(wobblyCircle(fx, fy, fr, fr * 0.97), '#3a2a24', 6, 3, 0.62);
    // hair: spiky strokes on top
    for (let k = 0; k < 13; k++) {
      const a = -Math.PI * 0.86 + (k / 12) * Math.PI * 0.72;
      const bx = fx + Math.cos(a) * fr * 0.97, by = fy + Math.sin(a) * fr * 0.95;
      const len = 26 + R() * 18, aa = a + J(0.25);
      stroke([[bx, by], [bx + Math.cos(aa) * len * 0.5 + J(3), by + Math.sin(aa) * len * 0.5], [bx + Math.cos(aa) * len, by + Math.sin(aa) * len]], '#2a2220', 6, 2, 0.7);
    }
    // a few hair zigzags across the top
    const zz = []; for (let k = 0; k <= 14; k++) { const a = -Math.PI * 0.82 + (k / 14) * Math.PI * 0.64; const rr = fr * (k % 2 ? 0.78 : 0.95); zz.push([fx + Math.cos(a) * rr, fy + Math.sin(a) * rr]); }
    stroke(zz, '#2a2220', 5, 2, 0.6);
    // eyebrows
    stroke([[fx - 58, fy - 34], [fx - 44, fy - 42], [fx - 26, fy - 38]], '#2a2220', 5, 2, 0.6);
    stroke([[fx + 24, fy - 38], [fx + 44, fy - 44], [fx + 60, fy - 35]], '#2a2220', 5, 2, 0.6);
    // eyes (dots)
    for (const ex of [fx - 42, fx + 42]) {
      scribble(ellipsePath(ex, fy - 12, 10, 12), [ex - 10, fy - 24, ex + 10, fy], '#231c1a', 0.85, 3, 0.9, 5);
      stroke(wobblyCircle(ex, fy - 12, 9, 11, 0.2), '#231c1a', 4, 2, 0.7);
    }
    // nose
    stroke([[fx + 2, fy + 2], [fx - 6, fy + 22], [fx + 6, fy + 26]], '#8a4a30', 5, 2, 0.55);
    // cheeks
    for (const s of [-1, 1]) {
      const cx = fx + s * 70, cy = fy + 34;
      scribble(ellipsePath(cx, cy, 21, 17), [cx - 22, cy - 18, cx + 22, cy + 18], '#f0729a', 0.55, 4, 0.3 * s, 7);
    }
    // big smile
    const sm = []; for (let k = 0; k <= 30; k++) { const a = Math.PI * (0.12 + 0.76 * k / 30); sm.push([fx + Math.cos(a) * 66 + J(1.5), fy + 26 + Math.sin(a) * 50]); }
    stroke(sm, '#d6303c', 7, 3, 0.62);
    stroke([[fx - 62, fy + 36], [fx - 66, fy + 30]], '#d6303c', 6, 2, 0.6);
    stroke([[fx + 60, fy + 36], [fx + 66, fy + 29]], '#d6303c', 6, 2, 0.6);
    // shoulders / shirt (blue) under the face
    const sh = [[fx - 110, H - 12], [fx - 96, fy + 150], [fx - 40, fy + 128], [fx + 40, fy + 128], [fx + 70, fy + 140]];
    stroke(sh, '#2f5fc4', 7, 3, 0.55);
    scribble(polyPath([[fx - 108, H - 10], [fx - 94, fy + 152], [fx - 40, fy + 130], [fx + 40, fy + 130], [fx + 70, fy + 142], [fx + 74, H - 10]]),
      [fx - 110, fy + 128, fx + 74, H], '#3a6bd0', 0.35, 9, -0.3, 9);

    // cake (bottom right)
    const kx = 280, ky = 410, kw = 88, kh = 56;
    const cakeBody = [[kx - kw / 2, ky], [kx - kw / 2 + 2, ky + kh], [kx + kw / 2 - 1, ky + kh + 2], [kx + kw / 2, ky - 2]];
    scribble(polyPath(cakeBody), [kx - kw / 2, ky, kx + kw / 2, ky + kh], '#f5c94a', 0.55, 6, 0.2, 8);
    stroke([...cakeBody, cakeBody[0]], '#8a5a2a', 5, 3, 0.6);
    // pink cream wave
    const wave = []; for (let k = 0; k <= 24; k++) { const t = k / 24; wave.push([kx - kw / 2 + t * kw, ky + 10 + Math.sin(t * Math.PI * 4) * 5]); }
    stroke(wave, '#f07aa8', 8, 3, 0.6);
    // strawberries on top
    for (const sx of [-26, 0, 26]) {
      scribble(ellipsePath(kx + sx, ky - 9, 9, 8), [kx + sx - 9, ky - 17, kx + sx + 9, ky - 1], '#e0283a', 0.75, 3, 0.6, 5);
    }
    // plate
    stroke([[kx - kw / 2 - 16, ky + kh + 8], [kx, ky + kh + 11], [kx + kw / 2 + 18, ky + kh + 7]], '#7a7a86', 5, 2, 0.5);
    // candles + flames
    const cc = ['#3d8fe0', '#43b649', '#e84a8c', '#8a55d0', '#f08a24'];
    for (let k = 0; k < 5; k++) {
      const cx = kx - 34 + k * 17 + J(2), top = ky - 46 + J(4);
      stroke([[cx, ky - 3], [cx + J(2), top]], cc[k], 6, 3, 0.65);
      const fl = [[cx, top - 4], [cx - 6, top - 12], [cx, top - 26 + J(3)], [cx + 6, top - 12], [cx, top - 4]];
      scribble(polyPath(fl), [cx - 7, top - 27, cx + 7, top - 3], '#ffcc1a', 0.75, 3, 0.2, 5);
      stroke(fl, '#f0731e', 4, 2, 0.55);
    }
    // hearts
    for (const [hx, hy, hs] of [[62, 420, 30], [336, 70, 24], [52, 64, 17], [330, 290, 16]]) {
      const hp = heartPts(hx, hy, hs);
      scribble(polyPath(hp), [hx - hs, hy - hs, hx + hs, hy + hs], '#e12c3a', 0.6, 4, -0.7, 7);
      stroke(hp, '#c81e30', 5, 3, 0.6);
    }

    // waxy grain: crayon skips on the paper's tooth
    const G = makeCanvas(W, H), gx = G.getContext('2d');
    const gi = gx.createImageData(W, H), gd = gi.data;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const n = N(px * 0.8 + 900, py * 0.8) * 0.6 + N(px * 0.33 + 50, py * 0.33 + 50) * 0.4;
      const a = clamp((n - 0.22) * 2.2, 0, 1);
      const k = (py * W + px) * 4; gd[k] = gd[k + 1] = gd[k + 2] = 255; gd[k + 3] = a * 255;
    }
    gx.putImageData(gi, 0, 0);
    l.globalCompositeOperation = 'destination-in';
    l.drawImage(G, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.drawImage(Lc, 0, 0);
    x.globalCompositeOperation = 'source-over';
    // soft photo light falloff
    const vg = x.createRadialGradient(W * 0.42, H * 0.38, H * 0.2, W * 0.5, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(255,240,215,0)'); vg.addColorStop(1, 'rgba(80,60,40,0.16)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    return canvasTex(c);
  });
}

// ---------------------------------------------------------------- 6. room
function woodFloorTex() {
  return once('floorTex', () => {
    const W = 256, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
    const R = rng(3);
    const pw = W / 4;
    for (let k = 0; k < 4; k++) {
      let y = -R() * H;
      while (y < H) {
        const len = 150 + R() * 200;
        const l = 150 + R() * 30;
        x.fillStyle = `rgb(${l + 10},${l * 0.68},${l * 0.42})`;
        x.fillRect(k * pw, y, pw, len);
        for (let s = 0; s < 14; s++) { x.fillStyle = `rgba(90,50,25,${0.05 + R() * 0.08})`; x.fillRect(k * pw + R() * pw, y, 1 + R() * 2, len); }
        x.fillStyle = 'rgba(60,35,20,0.5)'; x.fillRect(k * pw, y, pw, 1.5);
        y += len;
      }
      x.fillStyle = 'rgba(60,35,20,0.45)'; x.fillRect(k * pw, 0, 1.5, H);
    }
    const t = canvasTex(c, true, true, true);
    t.repeat.set(3, 2.5);
    return t;
  });
}
function duskTex() {
  return once('duskTex', () => {
    const W = 256, H = 256, c = makeCanvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2b55'); g.addColorStop(0.45, '#3d5487'); g.addColorStop(0.72, '#8a7f9c'); g.addColorStop(0.82, '#d49a7c'); g.addColorStop(1, '#2a2c40');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const R = rng(9);
    // distant rooftops
    x.fillStyle = '#1e2236';
    let px = 0;
    while (px < W) { const w = 20 + R() * 40, h = 30 + R() * 50; x.fillRect(px, H - h, w, h); px += w; }
    for (let k = 0; k < 22; k++) {
      x.fillStyle = R() < 0.7 ? 'rgba(255,200,120,0.9)' : 'rgba(220,235,255,0.8)';
      x.fillRect(R() * W, H - 10 - R() * 55, 3, 3);
    }
    return canvasTex(c);
  });
}
function pictureTex() {
  return once('pictureTex', () => {
    const W = 256, H = 192, c = makeCanvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#bcd3de'); g.addColorStop(1, '#f0e2c8');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#9db58e'; x.beginPath(); x.moveTo(0, 140); x.quadraticCurveTo(80, 90, 160, 130); x.quadraticCurveTo(210, 150, 256, 120); x.lineTo(256, 192); x.lineTo(0, 192); x.fill();
    x.fillStyle = '#7a9a76'; x.beginPath(); x.moveTo(0, 170); x.quadraticCurveTo(120, 135, 256, 165); x.lineTo(256, 192); x.lineTo(0, 192); x.fill();
    x.fillStyle = '#f3d9a0'; x.beginPath(); x.arc(190, 60, 18, 0, 6.3); x.fill();
    return canvasTex(c);
  });
}
export function makeRoom() {
  const room = new THREE.Group();
  room.name = 'room';
  const dimmable = []; // {mat, base:Color}
  const std = (color, roughness = 0.85, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    dimmable.push({ mat: m, base: m.color.clone() });
    return m;
  };
  const add = (geo, mat, x, y, z, parent = room) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const FLOOR = -0.90, WALL_Z = -3.3, SIDE_X = 2.6, CEIL = 1.5;

  // shell
  const floorMat = std(0xffffff, 0.55, { map: woodFloorTex() });
  const floor = add(new THREE.PlaneGeometry(2 * SIDE_X, 4.9), floorMat, 0, FLOOR, WALL_Z + 2.45);
  floor.rotation.x = -Math.PI / 2;
  const wallMat = std(0xebe2d3, 0.92);
  const back = add(new THREE.PlaneGeometry(2 * SIDE_X, CEIL - FLOOR), wallMat, 0, (CEIL + FLOOR) / 2, WALL_Z);
  for (const s of [-1, 1]) {
    const w = add(new THREE.PlaneGeometry(4.9, CEIL - FLOOR), wallMat, s * SIDE_X, (CEIL + FLOOR) / 2, WALL_Z + 2.45);
    w.rotation.y = -s * Math.PI / 2;
  }
  const ceil = add(new THREE.PlaneGeometry(2 * SIDE_X, 4.9), std(0xf1ece3, 0.95), 0, CEIL, WALL_Z + 2.45);
  ceil.rotation.x = Math.PI / 2;
  const trimMat = std(0xf3efe7, 0.6);
  add(new THREE.BoxGeometry(2 * SIDE_X, 0.08, 0.015), trimMat, 0, FLOOR + 0.04, WALL_Z + 0.008);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.015, 0.08, 4.9), trimMat, s * (SIDE_X - 0.008), FLOOR + 0.04, WALL_Z + 2.45);
  back.receiveShadow = true;

  // window (left of centre) with curtains
  const WX = -1.2, WY = 0.55, WW = 1.0, WH = 1.05;
  const glassMat = new THREE.MeshBasicMaterial({ map: duskTex() });
  add(new THREE.PlaneGeometry(WW, WH), glassMat, WX, WY, WALL_Z + 0.004);
  const frameMat = std(0xf4f1ea, 0.5);
  const fb = (w, h, x, y) => add(new THREE.BoxGeometry(w, h, 0.05), frameMat, x, y, WALL_Z + 0.02);
  fb(WW + 0.08, 0.05, WX, WY + WH / 2 + 0.02); fb(WW + 0.08, 0.05, WX, WY - WH / 2 - 0.02);
  fb(0.05, WH + 0.08, WX - WW / 2 - 0.02, WY); fb(0.05, WH + 0.08, WX + WW / 2 + 0.02, WY);
  fb(0.035, WH, WX, WY);
  add(new THREE.BoxGeometry(WW + 0.2, 0.025, 0.12), frameMat, WX, WY - WH / 2 - 0.055, WALL_Z + 0.06);
  // curtains
  const curtainMat = std(0xf0e6d4, 0.95, { side: THREE.DoubleSide });
  const curtainGeo = (() => {
    const g = new THREE.PlaneGeometry(0.42, 1.42, 28, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.028 * Math.sin((x / 0.42) * Math.PI * 9) * (0.8 + 0.2 * (0.71 - y))); }
    g.computeVertexNormals();
    return g;
  })();
  for (const s of [-1, 1]) add(curtainGeo, curtainMat, WX + s * (WW / 2 + 0.05), WY - 0.08, WALL_Z + 0.09);
  const rod = add(new THREE.CylinderGeometry(0.01, 0.01, WW + 0.6, 8), std(0x8a6a4a, 0.5), WX, WY + WH / 2 + 0.12, WALL_Z + 0.09);
  rod.rotation.z = Math.PI / 2;

  // sofa under the window
  const sofaMat = std(0x8592a0, 0.95), sofa = new THREE.Group();
  sofa.position.set(-1.3, FLOOR, WALL_Z + 0.48);
  room.add(sofa);
  const rb = (w, h, d, r, mat, x, y, z, rx = 0, rz = 0) => { const m = add(new RoundedBoxGeometry(w, h, d, 2, r), mat, x, y, z, sofa); m.rotation.set(rx, 0, rz); return m; };
  rb(1.7, 0.26, 0.82, 0.04, sofaMat, 0, 0.19, 0);
  for (const s of [-1, 1]) {
    rb(0.76, 0.13, 0.62, 0.05, sofaMat, s * 0.39, 0.38, 0.08);
    rb(0.76, 0.42, 0.18, 0.07, sofaMat, s * 0.39, 0.6, -0.28, -0.12);
    rb(0.17, 0.56, 0.82, 0.07, sofaMat, s * 0.84, 0.3, 0);
  }
  rb(0.36, 0.34, 0.11, 0.06, std(0xd2a24c, 0.95), -0.58, 0.6, -0.12, -0.15, 0.12);
  rb(0.33, 0.32, 0.11, 0.06, std(0xc06a50, 0.95), 0.6, 0.6, -0.12, -0.15, -0.1);
  // rug
  const rug = add(new THREE.CircleGeometry(1, 40), std(0xcdbfa8, 1.0), -1.1, FLOOR + 0.004, -2.1);
  rug.rotation.x = -Math.PI / 2; rug.scale.set(1.0, 0.65, 1);

  // sideboard (right) with books, vase, plant
  const woodMat = std(0x8b5d3c, 0.6);
  const SBX = 1.15, SBW = 1.5, SBD = 0.42, SBTOP = FLOOR + 0.62;
  add(new RoundedBoxGeometry(SBW, 0.5, SBD, 2, 0.012), woodMat, SBX, SBTOP - 0.25, WALL_Z + SBD / 2 + 0.01);
  const doorMat = std(0x9a6a46, 0.55);
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(SBW / 3 - 0.02, 0.44, 0.01), doorMat, SBX - SBW / 3 + k * SBW / 3, SBTOP - 0.25, WALL_Z + SBD + 0.016);
  for (const sx of [-1, 1]) for (const sz of [0, 1]) add(new THREE.CylinderGeometry(0.015, 0.01, 0.12, 8), woodMat, SBX + sx * (SBW / 2 - 0.07), FLOOR + 0.06, WALL_Z + 0.07 + sz * (SBD - 0.12));
  const books = [[0x6f8fa8, 0.035, 0.24], [0xc96f5a, 0.045, 0.22], [0xe3c77c, 0.03, 0.25], [0x7d9b78, 0.05, 0.21], [0xd8cfc0, 0.035, 0.23]];
  let bx = SBX - 0.62;
  for (const [col, t, h] of books) { add(new THREE.BoxGeometry(t, h, 0.17), std(col, 0.8), bx + t / 2, SBTOP + h / 2, WALL_Z + 0.16); bx += t + 0.004; }
  const vase = add(new THREE.LatheGeometry(splinePts([[0, 0], [0.05, 0], [0.065, 0.06], [0.06, 0.13], [0.035, 0.2], [0.03, 0.24], [0.036, 0.255]], 3), 20),
    std(0xa9c4cc, 0.25, { side: THREE.DoubleSide }), SBX - 0.05, SBTOP, WALL_Z + 0.2);
  const stemMat = std(0x6f7f4a, 0.8), flowerMat = std(0xe9a3b4, 0.8);
  for (let k = 0; k < 4; k++) {
    const a = -0.35 + k * 0.23, len = 0.28 + (k % 2) * 0.06;
    const st = add(new THREE.CylinderGeometry(0.003, 0.003, len, 4), stemMat, 0, 0, 0, vase);
    st.position.set(Math.sin(a) * len / 2, 0.24 + Math.cos(a) * len / 2, 0); st.rotation.z = -a;
    add(new THREE.SphereGeometry(0.03, 10, 8), k % 2 ? flowerMat : std(0xf3e4c8, 0.8), Math.sin(a) * len, 0.24 + Math.cos(a) * len, 0, vase);
  }
  // potted plant
  const pot = add(new THREE.CylinderGeometry(0.085, 0.065, 0.16, 20), std(0xc07a52, 0.85), SBX + 0.5, SBTOP + 0.08, WALL_Z + 0.2);
  const leafMat = std(0x4c7a44, 0.75), leafGeo = new THREE.SphereGeometry(1, 10, 8);
  const PR = rng(44);
  for (let k = 0; k < 11; k++) {
    const a = PR() * Math.PI * 2, tilt = 0.25 + PR() * 0.7, len = 0.16 + PR() * 0.1;
    const leaf = add(leafGeo, leafMat, 0, 0, 0, pot);
    leaf.scale.set(0.035, len / 2, 0.012);
    leaf.rotation.set(0, a, tilt, 'YXZ');
    leaf.rotation.order = 'YZX';
    leaf.position.set(Math.cos(a) * Math.sin(tilt) * len * 0.45, 0.08 + Math.cos(tilt) * len * 0.45, -Math.sin(a) * Math.sin(tilt) * len * 0.45);
    leaf.rotation.set(0, a, -tilt);
  }
  // framed picture above the sideboard
  const pic = new THREE.Group(); pic.position.set(SBX, 0.42, WALL_Z + 0.015); room.add(pic);
  add(new THREE.BoxGeometry(0.62, 0.48, 0.03), std(0xd9c3a0, 0.6), 0, 0, 0, pic);
  add(new THREE.PlaneGeometry(0.52, 0.38), std(0xffffff, 0.85, { map: pictureTex() }), 0, 0, 0.0155, pic);

  // Papa's dining chair
  const chairMat = std(0x9a6b45, 0.55);
  const chair = new THREE.Group(); chair.position.set(0, 0, -1.02); room.add(chair);
  const SEAT = -0.49;
  add(new RoundedBoxGeometry(0.44, 0.035, 0.42, 2, 0.012), chairMat, 0, SEAT, 0, chair);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.016, 0.014, SEAT - FLOOR, 8), chairMat, sx * 0.19, (SEAT + FLOOR) / 2, sz * 0.18, chair);
  for (const sx of [-1, 1]) {
    const post = add(new THREE.CylinderGeometry(0.017, 0.017, 0.7, 10), chairMat, sx * 0.19, SEAT + 0.34, -0.2, chair);
    post.rotation.x = -0.1;
  }
  const rail = add(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 24, 1, true, Math.PI - 0.42, 0.84), chairMat, 0, 0.17, 0.25, chair);
  rail.material = chairMat;
  const rail2 = add(new THREE.CylinderGeometry(0.48, 0.48, 0.03, 24, 1, true, Math.PI - 0.42, 0.84), chairMat, 0, -0.06, 0.23, chair);
  void rail2;

  // lamps
  const glowMats = [];
  const glowPlane = (w, h, color, x, y, z, rx = 0, ry = 0, maxOp = 0.3) => {
    const m = new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: maxOp, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });
    const p = add(new THREE.PlaneGeometry(w, h), m, x, y, z); p.rotation.set(rx, ry, 0);
    p.renderOrder = 2;
    glowMats.push({ m, maxOp });
    return p;
  };
  const shadeMats = [];
  const shadeMat = (color) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: 0xffb262, emissiveIntensity: 1.5, side: THREE.DoubleSide }); shadeMats.push(m); return m; };
  // pendant
  const PX = 0.9, PY = 0.98, PZ = -2.0;
  add(new THREE.CylinderGeometry(0.004, 0.004, CEIL - PY - 0.1, 5), std(0x333333, 0.6), PX, (CEIL + PY + 0.1) / 2, PZ);
  const shade = add(new THREE.LatheGeometry(splinePts([[0.03, 0.15], [0.06, 0.145], [0.115, 0.1], [0.155, 0.04], [0.175, 0.0]], 4), 32), shadeMat(0xf5e6c8), PX, PY - 0.08, PZ);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  add(new THREE.SphereGeometry(0.04, 12, 8), bulbMat, PX, PY - 0.03, PZ);
  void shade;
  glowPlane(0.55, 0.55, 0xffc27a, PX, PY - 0.02, PZ + 0.1, 0, 0, 0.55);
  glowPlane(2.6, 2.2, 0xffb468, PX * 0.85, 0.6, WALL_Z + 0.02, 0, 0, 0.32);
  glowPlane(2.0, 2.0, 0xffb468, PX, CEIL - 0.01, PZ, Math.PI / 2, 0, 0.35);
  glowPlane(1.8, 1.8, 0xffb468, PX, FLOOR + 0.006, PZ, -Math.PI / 2, 0, 0.22);
  // floor lamp (left, by the sofa)
  const LX = -2.32, LZ = -3.0;
  const lampMetal = std(0x3a3632, 0.45, { metalness: 0.6 });
  add(new THREE.CylinderGeometry(0.13, 0.14, 0.02, 24), lampMetal, LX, FLOOR + 0.01, LZ);
  add(new THREE.CylinderGeometry(0.009, 0.009, 1.25, 8), lampMetal, LX, FLOOR + 0.63, LZ);
  add(new THREE.CylinderGeometry(0.13, 0.19, 0.27, 28, 1, true), shadeMat(0xf3e2c2), LX, FLOOR + 1.33, LZ);
  add(new THREE.SphereGeometry(0.035, 10, 8), bulbMat, LX, FLOOR + 1.3, LZ);
  glowPlane(0.7, 0.7, 0xffc27a, LX, FLOOR + 1.33, LZ + 0.2, 0, 0, 0.5);
  glowPlane(2.4, 2.4, 0xffb468, LX + 0.3, FLOOR + 1.25, WALL_Z + 0.02, 0, 0, 0.35);
  glowPlane(2.4, 2.4, 0xffb468, -SIDE_X + 0.01, FLOOR + 1.2, LZ + 0.5, 0, Math.PI / 2, 0.3);

  // fairy lights (draped swags across the back wall)
  const fairy = new THREE.Group(); fairy.name = 'fairyLights'; room.add(fairy);
  const hooks = [[-2.45, 0.74], [-0.85, 0.79], [0.85, 0.79], [2.45, 0.74]];
  const fpts = [];
  for (let k = 0; k < hooks.length - 1; k++) {
    const [x0, y0] = hooks[k], [x1, y1] = hooks[k + 1];
    for (let s = 0; s < 12; s++) { const t = s / 12; fpts.push(new THREE.Vector3(lerp(x0, x1, t), lerp(y0, y1, t) - 0.26 * Math.sin(Math.PI * t), WALL_Z + 0.03)); }
  }
  fpts.push(new THREE.Vector3(hooks[3][0], hooks[3][1], WALL_Z + 0.03));
  const fcurve = new THREE.CatmullRomCurve3(fpts);
  add(new THREE.TubeGeometry(fcurve, 160, 0.0025, 4, false), std(0x4a4a3a, 0.7), 0, 0, 0, fairy);
  const bulbOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.56, 0.22).multiplyScalar(1.7) });
  const bulbGeo = new THREE.SphereGeometry(0.014, 10, 8);
  const haloMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff9a3c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const NB = 14;
  for (let k = 0; k < NB; k++) {
    const p = fcurve.getPointAt((k + 0.5) / NB);
    add(bulbGeo, bulbOn, p.x, p.y - 0.012, p.z + 0.012, fairy);
    const h = add(haloGeo, haloMat, p.x, p.y - 0.012, p.z + 0.03, fairy); h.renderOrder = 3;
  }

  // birthday garland (triangle flags)
  const garland = new THREE.Group(); garland.name = 'garland'; room.add(garland);
  const gcurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.9, 0.96, WALL_Z + 0.06), new THREE.Vector3(0, 0.62, WALL_Z + 0.14), new THREE.Vector3(1.9, 0.96, WALL_Z + 0.06));
  add(new THREE.TubeGeometry(gcurve, 60, 0.002, 4, false), std(0xeae4d8, 0.8), 0, 0, 0, garland);
  const flagShape = new THREE.Shape(); flagShape.moveTo(-0.065, 0); flagShape.lineTo(0.065, 0); flagShape.lineTo(0, -0.15); flagShape.closePath();
  const flagGeo = new THREE.ShapeGeometry(flagShape);
  const flagCols = [0xe8484f, 0xf6c844, 0x4aa3df, 0x63bf6c, 0xf28cb3, 0xf5893a, 0x9a7ad8, 0x3cc1b8, 0xe8484f];
  const GR = rng(12), flagMats = [];
  for (let k = 0; k < 9; k++) {
    const t = 0.08 + k * 0.84 / 8, p = gcurve.getPointAt(t), tan = gcurve.getTangentAt(t);
    const fm = std(flagCols[k], 0.8, { side: THREE.DoubleSide, emissive: flagCols[k], emissiveIntensity: 0.12 }); flagMats.push(fm);
    const f = add(flagGeo, fm, p.x, p.y, p.z, garland);
    f.rotation.set(-0.12 + (GR() - 0.5) * 0.1, (GR() - 0.5) * 0.3, Math.atan2(tan.y, tan.x) * 0.6 + (GR() - 0.5) * 0.08);
  }

  shadows(room, false, true);
  sofa.traverse(o => { if (o.isMesh) o.castShadow = true; });
  chair.traverse(o => { if (o.isMesh) o.castShadow = true; });
  fairy.traverse(o => { if (o.isMesh) o.receiveShadow = false; });

  let level = 1;
  room.userData.fairyLights = fairy;
  room.userData.garland = garland;
  room.userData.chair = chair;
  room.userData.setLight = (lv) => {
    level = clamp(lv, 0, 1);
    const dim = lerp(0.22, 1, level);
    for (const d of dimmable) d.mat.color.copy(d.base).multiplyScalar(dim);
    for (const m of shadeMats) { m.emissiveIntensity = 1.6 * level; }
    bulbMat.color.setRGB(1.0, 0.85, 0.63).multiplyScalar(0.05 + 3.0 * level);
    for (const g of glowMats) { g.m.opacity = g.maxOp * level; g.m.visible = level > 0.01; }
    glassMat.color.setScalar(lerp(0.22, 0.95, level));
    haloMat.opacity = lerp(0.85, 0.55, level);
    for (const m of flagMats) m.emissiveIntensity = lerp(0.02, 0.12, level);
  };
  Object.defineProperty(room.userData, 'level', { get: () => level, enumerable: true });
  room.userData.setLight(1);
  return room;
}

// ---------------------------------------------------------------- 7. Papa
function headShape(ux, uy, uz, out) {
  let x = ux * 0.0775, y = uy * 0.105, z = uz * 0.095;
  if (uy < 0) {
    const k = Math.pow(-uy, 1.6);
    x *= 1 - 0.26 * k;
    z *= uz < 0 ? 1 - 0.3 * k : 1 - 0.05 * k;
  }
  if (uz < 0 && uy > -0.45) z *= 1.05;
  if (uy > 0.25) x *= 1 - 0.07 * (uy - 0.25);
  // flatter face plane
  if (uz > 0.5) z -= 0.006 * (uz - 0.5) * 2 * (1 - Math.abs(ux));
  return out.set(x, y, z);
}
function papaGeos() {
  return once('papaGeo', () => {
    const v = new THREE.Vector3();
    const head = new THREE.SphereGeometry(1, 40, 30);
    const hair = new THREE.SphereGeometry(1, 40, 30);
    {
      const p = head.attributes.position;
      for (let i = 0; i < p.count; i++) { headShape(p.getX(i), p.getY(i), p.getZ(i), v); p.setXYZ(i, v.x, v.y, v.z); }
      head.computeVertexNormals();
    }
    {
      const p = hair.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
        const az = Math.abs(Math.atan2(ux, uz)); // 0 front .. PI back
        const azs = Math.atan2(ux, uz);
        let hy;
        if (az < 1.0) hy = 0.60 + 0.05 * Math.sin(azs * 11 + 1) + 0.03 * Math.sin(azs * 23 + 2) - 0.08 * az * az;
        else if (az < 1.75) hy = lerp(0.52, 0.12, (az - 1.0) / 0.75);
        else hy = lerp(0.12, -0.5, smooth(1.75, 2.6, az));
        const t = smooth(hy - 0.07, hy + 0.05, uy);
        const thick = 1.05 + 0.06 * Math.max(uy, 0);
        const s = lerp(0.96, thick, t);
        headShape(ux, uy, uz, v); v.multiplyScalar(s);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      hair.computeVertexNormals();
    }
    // torso
    const tp = splinePts([[0, -0.47], [0.13, -0.47], [0.163, -0.44], [0.170, -0.38], [0.163, -0.25], [0.160, -0.12], [0.168, 0.0], [0.176, 0.10],
      [0.178, 0.165], [0.168, 0.21], [0.146, 0.238], [0.115, 0.262], [0.088, 0.284], [0.068, 0.298], [0, 0.304]], 4);
    const torso = new THREE.LatheGeometry(tp, 40);
    {
      const p = torso.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-6) continue;
        const c = x / r, s = z / r, e = 0.78;
        const cx = Math.sign(c) * Math.pow(Math.abs(c), e), sz = Math.sign(s) * Math.pow(Math.abs(s), e);
        // depth: chest deeper at front, belly slightly
        const front = s > 0 ? 1 + 0.06 * Math.exp(-((y - 0.08) ** 2) / 0.01) : 1;
        p.setXYZ(i, r * cx * 1.2, y, r * sz * 0.70 * front);
      }
      torso.computeVertexNormals();
      latheFix(torso, tp.length, 40);
    }
    const unit = new THREE.SphereGeometry(1, 20, 14);
    const unitHi = new THREE.SphereGeometry(1, 24, 18);
    const upper = limbGeo(0.047, 0.040, 0.27);
    const fore = limbGeo(0.042, 0.032, 0.235);
    const neck = limbGeo(0.056, 0.052, 0.11, 18);
    const thigh = limbGeo(0.08, 0.062, 0.40, 16);
    const shin = limbGeo(0.058, 0.045, 0.42, 14);
    const thumb = new THREE.CapsuleGeometry(0.0085, 0.026, 4, 8);
    const collar = new THREE.LatheGeometry(splinePts([[0.084, -0.004], [0.074, 0.010], [0.067, 0.021], [0.062, 0.0265], [0.0575, 0.0245]], 3), 32);
    const smile = new THREE.TorusGeometry(0.021, 0.0026, 6, 20, Math.PI * 0.62);
    const arc = new THREE.TorusGeometry(0.0085, 0.0021, 6, 14, Math.PI * 0.78);
    const ring = new THREE.TorusGeometry(0.0078, 0.0036, 8, 20);
    const disc = new THREE.CircleGeometry(0.0062, 16);
    // open laughing mouth (D shape with corners up)
    const ms = new THREE.Shape();
    const MW = 0.024, MD = 0.024;
    ms.moveTo(-MW, 0.004);
    ms.quadraticCurveTo(0, -0.004, MW, 0.004);
    ms.bezierCurveTo(MW * 0.9, -MD * 0.8, -MW * 0.9, -MD * 0.8, -MW, 0.004);
    const mouthOpen = new THREE.ShapeGeometry(ms, 16);
    const ts = new THREE.Shape();
    ts.moveTo(-MW * 0.82, 0.0005); ts.quadraticCurveTo(0, -0.0065, MW * 0.82, 0.0005);
    ts.lineTo(MW * 0.74, -0.0045); ts.quadraticCurveTo(0, -0.0115, -MW * 0.74, -0.0045); ts.closePath();
    const teeth = new THREE.ShapeGeometry(ts, 12);
    const tg = new THREE.Shape(); tg.absellipse(0, 0, 0.013, 0.006, 0, Math.PI * 2);
    const tongue = new THREE.ShapeGeometry(tg, 16);
    for (const g of [mouthOpen, teeth, tongue]) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const X = p.getX(i); p.setZ(i, -X * X / (2 * 0.07)); } }
    const dollop = new THREE.LatheGeometry(splinePts([[0, 0], [0.0105, 0.0], [0.0118, 0.003], [0.0105, 0.0068], [0.0075, 0.0095], [0.0048, 0.0118],
      [0.0024, 0.0145], [0.0006, 0.0168], [0, 0.017]], 4), 28);
    {
      const p = dollop.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(x, z);
        const f = 1 + 0.10 * Math.sin(3 * th + y * 500) * smooth(0.001, 0.006, y);
        p.setX(i, x * f + 0.002 * (y / 0.017) ** 2); p.setZ(i, z * f);
      }
      dollop.computeVertexNormals();
      latheFix(dollop, 33, 28);
    }
    return { head, hair, torso, unit, unitHi, upper, fore, neck, thigh, shin, thumb, collar, smile, arc, ring, disc, mouthOpen, teeth, tongue, dollop };
  });
}
function ribbonGeo(points, width, twist = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const N = 48, pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), T = new THREE.Vector3(), S = new THREE.Vector3(), P = new THREE.Vector3(), q = new THREE.Quaternion();
  let prevS = null;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    S.crossVectors(T, Math.abs(T.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    if (prevS && S.dot(prevS) < 0) S.negate();
    q.setFromAxisAngle(T, twist * t); S.applyQuaternion(q);
    prevS = S.clone();
    pos.push(P.x + S.x * width / 2, P.y + S.y * width / 2, P.z + S.z * width / 2, P.x - S.x * width / 2, P.y - S.y * width / 2, P.z - S.z * width / 2);
    if (k < N) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function makePapa() {
  const G = papaGeos();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a681, roughness: 0.6, emissive: 0x1c0c06 });
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xd9a080, roughness: 0.6, emissive: 0x1c0b06 });
  const sweater = new THREE.MeshStandardMaterial({ color: 0x27324e, roughness: 0.96 });
  const rib = new THREE.MeshStandardMaterial({ color: 0x2c3856, roughness: 0.96 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x4d4a44, roughness: 0.9 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x221a15, roughness: 0.55 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.35 });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x2e2219, roughness: 0.85 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xa4564b, roughness: 0.55 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5a2224, roughness: 0.7, side: THREE.DoubleSide });
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.4, side: THREE.DoubleSide });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xc0625c, roughness: 0.6, side: THREE.DoubleSide });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.45, emissive: 0x2a2824 });

  const papa = new THREE.Group();
  papa.name = 'papa';
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // pivot helper: a Group at pivot (in parent rest coords) with a child offset back so children use rest coords
  const pivot = (parentOff, px, py, pz) => {
    const pv = new THREE.Group(); pv.position.set(px, py, pz); parentOff.add(pv);
    const off = new THREE.Group(); off.position.set(-px, -py, -pz); pv.add(off);
    pv.userData.rest = new THREE.Vector3(px, py, pz);
    return [pv, off];
  };

  // legs (hidden under the counter)
  for (const s of [-1, 1]) {
    const th = mesh(G.thigh, trousers, papa, s * 0.10, -0.42, -0.02); th.rotation.x = -Math.PI / 2 + 0.05;
    const sh = mesh(G.shin, trousers, papa, s * 0.10, -0.44, 0.38); sh.rotation.x = 0.05;
  }
  const [spine, spineOff] = pivot(papa, 0, -0.40, -0.03);
  mesh(G.torso, sweater, spineOff, 0, 0, -0.02);
  const [chest, chestOff] = pivot(spineOff, 0, -0.02, -0.03);
  { const c = mesh(G.collar, rib, chestOff, 0, 0.298, -0.014); c.scale.set(1.04, 1, 0.97); c.rotation.x = -0.06; }
  const [neck, neckOff] = pivot(chestOff, 0, 0.31, -0.012);
  mesh(G.neck, skin, neckOff, 0, 0.385, -0.012).scale.set(1, 1, 0.92);
  const head = new THREE.Group(); head.name = 'papaHead';
  head.position.set(0, 0.42, 0.006); neckOff.add(head);
  spine.scale.x = 0.86; head.scale.set(1.17 / 0.86, 1.17, 1.17);
  const headMesh = mesh(G.head, skin, head);
  mesh(G.hair, hairMat, head);

  // face features placed on the head surface
  const ray = new THREE.Raycaster(), tmpMesh = new THREE.Mesh(G.head, skin);
  tmpMesh.updateMatrixWorld(true);
  const surf = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 0.3), new THREE.Vector3(0, 0, -1));
    const h = ray.intersectObject(tmpMesh)[0];
    return h ? { p: h.point.clone(), n: h.face.normal.clone() } : { p: new THREE.Vector3(x, y, 0.08), n: new THREE.Vector3(0, 0, 1) };
  };
  const Z = new THREE.Vector3(0, 0, 1);
  const onFace = (x, y, sink = 0) => {
    const s = surf(x, y), g = new THREE.Group();
    g.position.copy(s.p).addScaledVector(s.n, -sink);
    g.quaternion.setFromUnitVectors(Z, s.n.clone().lerp(Z, 0.35).normalize());
    head.add(g);
    return g;
  };
  // ears
  for (const s of [-1, 1]) { const e = mesh(G.unit, skin, head, s * 0.074, -0.004, -0.006); e.scale.set(0.012, 0.03, 0.019); e.rotation.y = s * 0.3; }
  // nose
  const noseS = surf(0, -0.014);
  const nose = mesh(G.unit, skin, head); nose.position.copy(noseS.p).add(new THREE.Vector3(0, -0.002, -0.006)); nose.scale.set(0.0105, 0.021, 0.0155);
  const noseTip = new THREE.Object3D(); noseTip.position.copy(nose.position).add(new THREE.Vector3(0, -0.008, 0.0155)); head.add(noseTip);
  for (const s of [-1, 1]) { const w = mesh(G.unit, skin, head); w.position.copy(nose.position).add(new THREE.Vector3(s * 0.0075, -0.0125, 0.001)); w.scale.set(0.0055, 0.005, 0.0065); }
  // eyes
  const eyes = [], arcs = [];
  for (const s of [-1, 1]) {
    const g = onFace(s * 0.030, 0.006, 0.0012);
    const e = mesh(G.unitHi, eyeMat, g); e.scale.set(0.0118, 0.0102, 0.0034); eyes.push(e);
    const a = mesh(G.arc, eyeMat, g, 0, -0.005, 0.0005); a.rotation.z = Math.PI / 2 - Math.PI * 0.39; a.visible = false; arcs.push(a);
    const bg = onFace(s * 0.032, 0.033, 0.0008);
    const b = mesh(G.unit, browMat, bg); b.scale.set(0.019, 0.0046, 0.0028); b.rotation.z = -s * 0.14;
  }
  // cheeks
  const cheeks = [];
  for (const s of [-1, 1]) {
    const cs = surf(s * 0.043, -0.026);
    const c = mesh(G.unit, cheekMat, head); c.userData.base = cs.p.clone().addScaledVector(cs.n, -0.0145); c.userData.n = cs.n.clone();
    c.scale.set(0.022, 0.018, 0.016); c.position.copy(c.userData.base); cheeks.push(c);
  }
  // mouths
  const mouth = onFace(0, -0.047, 0.0006); mouth.scale.setScalar(1.3);
  const smileM = mesh(G.smile, lipMat, mouth, 0, 0.019, 0); smileM.rotation.z = Math.PI * 1.5 - Math.PI * 0.31;
  const openG = new THREE.Group(); mouth.add(openG); openG.position.set(0, 0.006, 0.0008);
  mesh(G.mouthOpen, mouthMat, openG, 0, 0, 0.0002);
  mesh(G.tongue, tongueMat, openG, 0, -0.015, 0.0006);
  mesh(G.teeth, teethMat, openG, 0, 0, 0.001);
  const blowG = new THREE.Group(); mouth.add(blowG); blowG.position.set(0, -0.002, 0.003);
  mesh(G.ring, lipMat, blowG).scale.set(1, 1.1, 1.3);
  mesh(G.disc, mouthMat, blowG, 0, 0, 0.0005);
  // cream on the nose
  const cream = mesh(G.dollop, creamMat, head);
  cream.position.copy(noseTip.position).add(new THREE.Vector3(0, 0.001, -0.004));
  cream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.35, 1).normalize());
  cream.visible = false;

  // arms (IK in chest rest coords)
  const arms = [];
  for (const s of [-1, 1]) {
    const up = mesh(G.upper, sweater, chestOff);
    const fo = mesh(G.fore, sweater, chestOff);
    const hand = new THREE.Group(); chestOff.add(hand);
    mesh(G.unit, skin, hand, 0, 0.004, 0).scale.set(0.019, 0.022, 0.024); // wrist
    mesh(G.unit, skin, hand, 0, 0.042, 0).scale.set(0.0145, 0.044, 0.041); // palm
    const fing = mesh(G.unit, skin, hand, 0.003, 0.086, -s * 0.002); fing.scale.set(0.0125, 0.034, 0.037); fing.rotation.z = 0.08;
    const th = mesh(G.thumb, skin, hand, 0.012, 0.038, s * 0.034); th.rotation.set(-s * 0.5, 0, 0.35);
    arms.push({ s, up, fo, hand, S: new THREE.Vector3(s * 0.163, 0.196, -0.02) });
  }

  // streamers + confetti
  const streamG = new THREE.Group(); streamG.visible = false; head.add(streamG);
  const shoulderG = new THREE.Group(); shoulderG.visible = false; chestOff.add(shoulderG);
  const scol = [0xff4f7b, 0xffd23f, 0x36b9f0, 0x5fcf62, 0xff8a3d, 0xa77bff];
  const smats = scol.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.18 }));
  const hs = (ux, uy, uz, out = 1.13) => { const v = headShape(ux, uy, uz, new THREE.Vector3()); const l = Math.hypot(ux, uy, uz); return v.multiplyScalar(out / l); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  mesh(ribbonGeo([hs(-0.85, 0.45, 0.25), hs(-0.4, 0.9, 0.15), hs(0.1, 1, 0.05), hs(0.6, 0.75, -0.05), hs(0.92, 0.3, -0.1, 1.2), V(0.098, -0.05, -0.01), V(0.094, -0.1, 0.01), V(0.1, -0.15, 0.0)], 0.012, 2.5), smats[0], streamG);
  mesh(ribbonGeo([hs(0.35, 0.85, 0.45), hs(0.0, 1, 0.2), hs(-0.35, 0.85, -0.3), hs(-0.75, 0.4, -0.55, 1.2), V(-0.075, -0.06, -0.075), V(-0.07, -0.12, -0.06)], 0.011, -3), smats[1], streamG);
  mesh(ribbonGeo([hs(-0.1, 0.95, 0.4), hs(0.25, 0.9, 0.1), hs(0.55, 0.7, -0.4), hs(0.5, 0.2, -0.85, 1.2), V(0.045, -0.06, -0.10)], 0.010, 2), smats[2], streamG);
  const CR = rng(8), cgeo = new THREE.PlaneGeometry(0.009, 0.009);
  for (let k = 0; k < 10; k++) {
    const a = CR() * Math.PI * 2, uy = 0.45 + CR() * 0.5, r = Math.sqrt(1 - uy * uy);
    const ux = Math.cos(a) * r, uz = Math.sin(a) * r;
    const c = mesh(cgeo, smats[k % 6], streamG); c.position.copy(hs(ux, uy, uz, 1.14));
    c.lookAt(c.position.clone().multiplyScalar(2)); c.rotation.z += CR() * 3;
  }
  mesh(ribbonGeo([V(-0.12, 0.13, 0.125), V(-0.15, 0.215, 0.09), V(-0.165, 0.258, 0.0), V(-0.17, 0.22, -0.10), V(-0.16, 0.12, -0.14)], 0.014, 3), smats[3], shoulderG);
  mesh(ribbonGeo([V(-0.19, 0.252, 0.02), V(-0.215, 0.2, 0.09), V(-0.2, 0.14, 0.13), V(-0.185, 0.08, 0.12), V(-0.205, 0.02, 0.13)], 0.012, 4), smats[4], shoulderG);
  mesh(ribbonGeo([V(0.05, 0.268, 0.06), V(0.09, 0.25, 0.1), V(0.11, 0.2, 0.13), V(0.1, 0.15, 0.135)], 0.011, -2), smats[5], shoulderG);

  shadows(papa);
  for (const m of [streamG, shoulderG]) m.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // ---- pose
  const st = { lean: 0, armsUp: 0, clap: 0, blow: 0, laugh: 0, headTilt: 0, nod: 0, bounce: 0, creamNose: 0, streamers: 0 };
  const tH = new THREE.Vector3(), tE = new THREE.Vector3(), tW = new THREE.Vector3(), tD = new THREE.Vector3(), tP = new THREE.Vector3();
  const tX = new THREE.Vector3(), tY = new THREE.Vector3(), tZ = new THREE.Vector3(), tM = new THREE.Matrix4(), DOWN = new THREE.Vector3(0, -1, 0);
  const L1 = 0.27, L2 = 0.235;
  const apply = () => {
    const lean = st.lean;
    spine.rotation.x = lean * 0.40;
    spine.position.y = spine.userData.rest.y + st.bounce * 0.012;
    chest.rotation.x = lean * 0.20 + st.bounce * 0.01;
    neck.rotation.x = -lean * 0.36 + st.nod * 0.21;
    neck.rotation.z = -st.headTilt * 0.21;
    // arms
    const a = st.armsUp, cl = st.clap;
    for (const A of arms) {
      const s = A.s;
      const hx = lerp(0.185, lerp(0.075, 0.017, cl), a);
      const hy = lerp(-0.19, 0.14, a);
      const hz = lerp(0.14, 0.15, a) + Math.sin(Math.PI * a) * 0.07;
      tH.set(s * hx, hy, hz);
      tD.subVectors(tH, A.S);
      let dist = clamp(tD.length(), 0.08, L1 + L2 - 0.002); tD.normalize();
      const ah = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), hh = Math.sqrt(Math.max(0, L1 * L1 - ah * ah));
      tP.set(s * lerp(0.25, 0.18, a), -0.85, lerp(-0.5, 0.05, a)); tP.addScaledVector(tD, -tP.dot(tD)).normalize();
      tE.copy(A.S).addScaledVector(tD, ah).addScaledVector(tP, hh);
      tW.copy(A.S).addScaledVector(tD, dist);
      A.up.position.copy(A.S); tX.subVectors(tE, A.S).normalize(); A.up.quaternion.setFromUnitVectors(DOWN, tX);
      A.fo.position.copy(tE); tY.subVectors(tW, tE).normalize(); A.fo.quaternion.setFromUnitVectors(DOWN, tY);
      // hand basis: Y = fingers (continue forearm, bent up a little when raised), X = palm normal (medial)
      tX.set(-s, 0, 0).addScaledVector(tY, -(-s * tY.x)).normalize();
      tZ.crossVectors(tX, tY).normalize();
      tM.makeBasis(tX, tY, tZ);
      A.hand.quaternion.setFromRotationMatrix(tM);
      A.hand.position.copy(tW);
    }
    // face
    const b = st.blow, l = st.laugh * (1 - b * 0.7);
    const smileK = (1 - l) * (1 - b);
    smileM.visible = smileK > 0.02; smileM.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * smileK)); smileM.scale.y = Math.max(0.001, smileK);
    openG.visible = l > 0.02; openG.scale.set(lerp(0.55, 1, l), Math.max(0.001, l), 1);
    blowG.visible = b > 0.02; blowG.scale.setScalar(Math.max(0.001, b));
    for (const e of eyes) e.scale.y = 0.0102 * lerp(1, 0.16, l);
    for (const ar of arcs) { ar.visible = l > 0.25; ar.scale.setScalar(Math.max(0.001, smooth(0.25, 0.8, l))); }
    for (const c of cheeks) {
      c.position.copy(c.userData.base).addScaledVector(c.userData.n, 0.004 * b + 0.002 * l);
      c.position.y += 0.004 * l;
      c.scale.set(0.022 * (1 + 0.15 * b), 0.018 * (1 + 0.1 * b), 0.016);
    }
    cream.visible = st.creamNose > 0.01; cream.scale.setScalar(Math.max(0.001, st.creamNose * 1.15));
    const sv = st.streamers;
    streamG.visible = shoulderG.visible = sv > 0.01;
    streamG.scale.setScalar(Math.max(0.001, lerp(0.85, 1, sv))); shoulderG.scale.setScalar(1);
    for (const m of smats) { m.opacity = sv; m.transparent = sv < 0.99; }
  };
  papa.userData.setPose = (p = {}) => { for (const k in p) if (k in st && typeof p[k] === 'number') st[k] = p[k]; apply(); };
  papa.userData.pose = st;
  papa.userData.head = head;
  papa.userData.headMesh = headMesh;
  papa.userData.noseTip = noseTip;
  papa.userData.nosePos = (target = new THREE.Vector3()) => { noseTip.updateWorldMatrix(true, false); return noseTip.getWorldPosition(target); };
  apply();
  return papa;
}
