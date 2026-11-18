// models_tools.js — realistic procedural kitchen tools (three.js r170)
// Every factory returns a THREE.Group; origin = centre of base on the counter (y=0)
// unless stated otherwise; +Y up; front toward +Z. All textures are drawn on canvas
// lazily (once) and shared.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);

// ---------------------------------------------------------------- helpers
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function mkTex(c, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const _cache = {};
function once(key, fn) { return _cache[key] || (_cache[key] = fn()); }

function M(geo, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
// smooth normals for Extrude/Polyhedron (non-indexed) geometry
function smooth(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo, 1e-6);
  g.computeVertexNormals();
  return g;
}
// polygon with rounded corners -> THREE.Shape (pts: [x,y], radii: number|array)
function roundedPoly(pts, radii, shape = new THREE.Shape(), hole = false) {
  const n = pts.length;
  const P = pts.map(p => V2(p[0], p[1]));
  const rad = i => (Array.isArray(radii) ? radii[i] : radii);
  const path = hole ? new THREE.Path() : shape;
  for (let i = 0; i < n; i++) {
    const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const r = Math.min(rad(i), da.length() * 0.49, db.length() * 0.49);
    const p1 = p.clone().add(da.normalize().multiplyScalar(r));
    const p2 = p.clone().add(db.normalize().multiplyScalar(r));
    if (i === 0) path.moveTo(p1.x, p1.y); else path.lineTo(p1.x, p1.y);
    path.quadraticCurveTo(p.x, p.y, p2.x, p2.y);
  }
  path.closePath();
  if (hole) shape.holes.push(path);
  return shape;
}
// extrude a side-profile shape (shape x = world z, shape y = world y) symmetrically along world X
function extrudeX(shape, width, bevel, bevelT, segs = 6, curveSegs = 16) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0002, width - 2 * bevelT), bevelEnabled: true,
    bevelThickness: bevelT, bevelSize: bevel, bevelSegments: segs, curveSegments: curveSegs, steps: 1,
  });
  g.rotateY(-PI / 2);
  g.computeBoundingBox();
  g.translate(-(g.boundingBox.min.x + g.boundingBox.max.x) / 2, 0, 0);
  return smooth(g);
}
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// lathe with arclength-based v coordinate (for brushing textures)
function lathe(points, segs) {
  const g = new THREE.LatheGeometry(points, segs);
  const n = points.length, s = [0];
  for (let j = 1; j < n; j++) s[j] = s[j - 1] + points[j].distanceTo(points[j - 1]);
  const uv = g.getAttribute('uv');
  for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) uv.setY(i * n + j, s[j]);
  return g;
}

// ---------------------------------------------------------------- shared textures
function brushedTex() {
  return once('brushed', () => {
    const S = 512, c = mkCanvas(S, S), x = c.getContext('2d'), R = rng(11);
    x.fillStyle = 'rgb(200,200,200)'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2200; i++) {
      const y = R() * S, len = 40 + R() * 400, x0 = R() * S, g = 200 + (R() - 0.5) * 70;
      x.strokeStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.25 + R() * 0.5})`;
      x.lineWidth = 0.5 + R() * 1.2;
      x.beginPath(); x.moveTo(x0 - S, y); x.lineTo(x0 - S + len, y); x.moveTo(x0, y); x.lineTo(x0 + len, y); x.stroke();
    }
    return mkTex(c, false, true);
  });
}
function creamMat() {
  return once('creamMat', () => new THREE.MeshStandardMaterial({ color: 0xfbf8f1, roughness: 0.48, metalness: 0 }));
}
function steelMat(rough = 0.18) {
  return once('steel' + rough, () => new THREE.MeshStandardMaterial({ color: 0xe6e7ea, metalness: 1, roughness: rough }));
}
// soft, lumpy blob (unit-ish radius) for cream masses
function blobGeo(seed, bumps = 7, amp = 0.22) {
  const R = rng(seed);
  let g = new THREE.IcosahedronGeometry(1, 4);
  g = smooth(g);
  const dirs = [];
  for (let i = 0; i < bumps; i++) dirs.push(V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().toArray().concat([amp * (0.4 + R()), 3 + R() * 5]));
  const p = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let r = 1;
    for (const d of dirs) {
      const dt = Math.max(0, v.x * d[0] + v.y * d[1] + v.z * d[2]);
      r += d[3] * Math.pow(dt, d[4]);
    }
    r += 0.03 * Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7) * Math.sin(v.z * 8);
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  g.computeVertexNormals();
  return g;
}

// ======================================================================== 1. COUNTER
function counterTextures() {
  return once('counterTex', () => {
    const S = 1024, R = rng(7);
    const cc = mkCanvas(S, S), rc = mkCanvas(S, S), bc = mkCanvas(S, S);
    const c = cc.getContext('2d'), r = rc.getContext('2d'), b = bc.getContext('2d');
    r.fillStyle = 'rgb(165,165,165)'; r.fillRect(0, 0, S, S);
    b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, 0, S, S);
    const pxX = S / 2.6, pxZ = S / 1.35;
    const board = (x, y, w, h) => {
      const hue = 30 + R() * 6, sat = 40 + R() * 16, lit = 57 + R() * 11;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.fillStyle = `hsl(${hue},${sat}%,${lit}%)`; c.fillRect(x, y, w, h);
      // soft tone drift along the board
      const gr = c.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, `rgba(120,80,40,${R() * 0.08})`);
      gr.addColorStop(0.5, `rgba(255,235,200,${R() * 0.08})`);
      gr.addColorStop(1, `rgba(120,80,40,${R() * 0.08})`);
      c.fillStyle = gr; c.fillRect(x, y, w, h);
      // grain lines
      const nl = Math.round(h * 1.6);
      for (let i = 0; i < nl; i++) {
        const yy = y + R() * h, a = 0.03 + R() * 0.11, ph = R() * 10, am = 0.3 + R() * 0.9;
        c.strokeStyle = `rgba(${95 + R() * 30 | 0},${60 + R() * 20 | 0},${30 + R() * 10 | 0},${a})`;
        c.lineWidth = 0.5 + R() * 1.1;
        c.beginPath();
        for (let xx = x; xx <= x + w + 20; xx += 20) {
          const yv = yy + Math.sin(xx * 0.004 + ph) * am * 2 + Math.sin(xx * 0.017 + ph * 2) * am * 0.4;
          if (xx === x) c.moveTo(xx, yv); else c.lineTo(xx, yv);
        }
        c.stroke();
      }
      // oak pores (short dashes along grain)
      const np = (w * h) / 45;
      for (let i = 0; i < np; i++) {
        const px = x + R() * w, py = y + R() * h;
        c.fillStyle = `rgba(90,55,25,${0.08 + R() * 0.16})`;
        c.fillRect(px, py, 2 + R() * 6, 0.7 + R() * 0.6);
      }
      // occasional darker streak
      if (R() < 0.3) {
        const sy = y + R() * h, sh = 1.5 + R() * 4, sx = x + R() * w * 0.5;
        const sg = c.createLinearGradient(sx, 0, sx + w * 0.6, 0);
        sg.addColorStop(0, 'rgba(110,70,35,0)'); sg.addColorStop(0.3, 'rgba(110,70,35,0.13)');
        sg.addColorStop(0.7, 'rgba(110,70,35,0.10)'); sg.addColorStop(1, 'rgba(110,70,35,0)');
        c.fillStyle = sg; c.fillRect(sx, sy, w * 0.6, sh);
      }
      // occasional light ray flecks (quarter-sawn oak)
      if (R() < 0.4) {
        for (let i = 0; i < 25; i++) {
          c.fillStyle = `rgba(255,240,215,${0.08 + R() * 0.1})`;
          c.fillRect(x + R() * w, y + R() * h, 3 + R() * 10, 1 + R() * 1.5);
        }
      }
      c.restore();
      // roughness per board
      const rv = 150 + R() * 35 | 0;
      r.fillStyle = `rgb(${rv},${rv},${rv})`; r.fillRect(x, y, w, h);
      for (let i = 0; i < h; i++) {
        const g = rv + (R() - 0.5) * 30 | 0;
        r.fillStyle = `rgba(${g},${g},${g},0.5)`; r.fillRect(x, y + R() * h, w, 1);
      }
      for (let i = 0; i < h * 0.8; i++) {
        const g = 110 + R() * 25 | 0;
        b.fillStyle = `rgba(${g},${g},${g},0.5)`; b.fillRect(x, y + R() * h, w, 0.8);
      }
      // seams: long edge + end joint
      c.fillStyle = 'rgba(85,52,26,0.30)'; c.fillRect(x, y, w, 1);
      c.fillStyle = 'rgba(80,48,24,0.45)'; c.fillRect(x, y, 1.2, h);
      r.fillStyle = 'rgb(200,200,200)'; r.fillRect(x, y, w, 1); r.fillRect(x, y, 1, h);
      b.fillStyle = 'rgb(70,70,70)'; b.fillRect(x, y, w, 1); b.fillRect(x, y, 1.2, h);
    };
    let y = 0;
    while (y < S) {
      const h = Math.round(pxZ * (0.037 + R() * 0.008));
      let x = -Math.floor(R() * 300);
      while (x < S) {
        const len = Math.round(pxX * (0.30 + R() * 0.85));
        board(x, y, len, h);
        x += len;
      }
      y += h;
    }
    return { map: mkTex(cc), rough: mkTex(rc, false), bump: mkTex(bc, false) };
  });
}

export function makeCounter() {
  const group = new THREE.Group();
  group.name = 'counter';
  const T = counterTextures();
  const topGeo = new RoundedBoxGeometry(2.6, 0.045, 1.35, 4, 0.009);
  const pos = topGeo.getAttribute('position'), uv = topGeo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + 1.3) / 2.6, (pos.getZ(i) + 0.675) / 1.35);
  }
  topGeo.translate(0, -0.0225, 0.075);
  const topMat = new THREE.MeshStandardMaterial({
    map: T.map, roughnessMap: T.rough, roughness: 1, bumpMap: T.bump, bumpScale: 0.6, metalness: 0,
  });
  const top = M(topGeo, topMat, false, true);
  top.name = 'worktop';
  group.add(top);

  // cabinet body (only glimpsed)
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.82 });
  const gapMat = new THREE.MeshStandardMaterial({ color: 0x8e8578, roughness: 0.9 });
  const body = M(new THREE.BoxGeometry(2.5, 0.78, 0.5), cabMat, false, true);
  body.position.set(0, -0.045 - 0.39, 0.70 - 0.25 - 0.02);
  group.add(body);
  const kick = M(new THREE.BoxGeometry(2.46, 0.09, 0.45), new THREE.MeshStandardMaterial({ color: 0x6f675d, roughness: 0.9 }), false, true);
  kick.position.set(0, -0.045 - 0.78 - 0.045, 0.40);
  group.add(kick);
  for (const gx of [-0.625, 0, 0.625]) {
    const g = M(new THREE.BoxGeometry(0.004, 0.76, 0.004), gapMat, false, false);
    g.position.set(gx, body.position.y, 0.68 + 0.001);
    group.add(g);
  }
  const dl = M(new THREE.BoxGeometry(2.48, 0.004, 0.004), gapMat, false, false);
  dl.position.set(0, -0.045 - 0.17, 0.681);
  group.add(dl);
  group.userData.topY = 0;
  return group;
}

// ======================================================================== 2. BOWL
const BOWL_IN = (y) => {
  if (y <= 0.008) return 0;
  if (y <= 0.098) { const t = (0.098 - y) / 0.090; return 0.128 * Math.sqrt(Math.max(0, 1 - t * t)); }
  return 0.128 + (Math.min(y, 0.104) - 0.098) / 0.006 * 0.016;
};
export function makeBowl() {
  const group = new THREE.Group();
  group.name = 'bowl';
  const pts = [];
  // outer: flat base -> fillet -> outer ellipse
  pts.push(V2(0, 0), V2(0.02, 0), V2(0.036, 0));
  const q = new THREE.QuadraticBezierCurve(V2(0.036, 0), V2(0.0475, 0), V2(0.0499, 0.012));
  q.getPoints(8).slice(1).forEach(p => pts.push(p));
  const a0 = Math.acos((0.098 - 0.012) / 0.093), a1 = Math.acos((0.098 - 0.0955) / 0.093);
  for (let i = 1; i <= 30; i++) {
    const th = a0 + (a1 - a0) * i / 30;
    pts.push(V2(0.131 * Math.sin(th), 0.098 - 0.093 * Math.cos(th)));
  }
  // outer lip underside
  const last = pts[pts.length - 1].clone();
  const rc = V2(0.1465, 0.1015), rr = 0.0035;
  const rimStart = V2(rc.x + rr * Math.cos(-2.1), rc.y + rr * Math.sin(-2.1));
  new THREE.QuadraticBezierCurve(last, V2(0.135, 0.0985), rimStart).getPoints(8).slice(1).forEach(p => pts.push(p));
  // rolled rim
  const rimEnd = 2.36;
  const outerCount = pts.length;
  for (let i = 1; i <= 24; i++) {
    const t = -2.1 + (rimEnd + 2.1) * i / 24;
    pts.push(V2(rc.x + rr * Math.cos(t), rc.y + rr * Math.sin(t)));
  }
  // split index at rim apex (angle PI/2)
  let apex = outerCount;
  for (let i = outerCount; i < pts.length; i++) if (pts[i].y > pts[apex].y) apex = i;
  // inner lip + inner ellipse
  const ip = pts[pts.length - 1].clone();
  new THREE.QuadraticBezierCurve(ip, V2(0.131, 0.1022), V2(0.128, 0.098)).getPoints(10).slice(1).forEach(p => pts.push(p));
  for (let i = 1; i <= 40; i++) {
    const th = PI / 2 * (1 - i / 40);
    pts.push(V2(0.128 * Math.sin(th), 0.098 - 0.090 * Math.cos(th)));
  }
  pts[pts.length - 1].x = 0;

  const outerPts = pts.slice(0, apex + 1), innerPts = pts.slice(apex);
  const brush = brushedTex();
  const mk = (rough, mapR) => new THREE.MeshStandardMaterial({
    color: 0xdcdde0, metalness: 1, roughness: rough, roughnessMap: brush, bumpMap: brush, bumpScale: 0.02,
  });
  const og = lathe(outerPts, 128), ig = lathe(innerPts, 128);
  const outer = M(og, mk(0.36), true, true);
  const inner = M(ig, mk(0.42), true, true);
  outer.name = 'bowlOuter'; inner.name = 'bowlInner';
  group.add(outer, inner);
  group.userData.innerRadiusAt = BOWL_IN;
  group.userData.rimRadius = 0.150;
  group.userData.height = 0.105;
  group.userData.outer = outer;
  group.userData.inner = inner;
  return group;
}

// ======================================================================== 3. CARTON
function cartonTextures() {
  return once('cartonTex', () => {
    const W = 1024, H = 320, c = mkCanvas(W, H), x = c.getContext('2d'), R = rng(23);
    x.fillStyle = '#f8f7f3'; x.fillRect(0, 0, W, H);
    // soft blue band with gentle wave on top
    const bandTop = H * 0.40, bandBot = H * 0.86;
    x.fillStyle = '#9cc0e4';
    x.beginPath(); x.moveTo(0, bandBot);
    for (let u = 0; u <= W; u += 8) x.lineTo(u, bandTop + Math.sin(u / W * PI * 8) * 7);
    x.lineTo(W, bandBot); x.closePath(); x.fill();
    x.strokeStyle = '#6f9ccc'; x.lineWidth = 3;
    x.beginPath();
    for (let u = 0; u <= W; u += 8) { const yy = bandTop - 9 + Math.sin(u / W * PI * 8) * 7; if (u === 0) x.moveTo(u, yy); else x.lineTo(u, yy); }
    x.stroke();
    // bottom thin stripe & top shoulder stripe
    x.fillStyle = '#5f8fc4'; x.fillRect(0, H * 0.93, W, H * 0.025);
    x.fillStyle = '#9cc0e4'; x.fillRect(0, H * 0.035, W, H * 0.03);
    // cream drop / swirl motif on each face (larger on front/back)
    const drop = (cx, cy, s) => {
      x.save(); x.translate(cx, cy); x.scale(s, s);
      // a single plump cream drop with a soft highlight, and a small splash ring below
      const dropPath = () => {
        x.beginPath(); x.moveTo(0, -46);
        x.bezierCurveTo(6, -30, 30, -6, 30, 14);
        x.bezierCurveTo(30, 32, 16, 44, 0, 44);
        x.bezierCurveTo(-16, 44, -30, 32, -30, 14);
        x.bezierCurveTo(-30, -6, -6, -30, 0, -46); x.closePath();
      };
      x.fillStyle = 'rgba(60,100,150,0.22)'; x.save(); x.translate(3, 3); dropPath(); x.fill(); x.restore();
      x.fillStyle = '#ffffff'; dropPath(); x.fill();
      x.strokeStyle = 'rgba(120,160,205,0.6)'; x.lineWidth = 2; dropPath(); x.stroke();
      x.fillStyle = 'rgba(160,195,230,0.55)';
      x.beginPath(); x.ellipse(8, 18, 13, 18, 0.3, 0, PI * 2); x.fill();
      x.fillStyle = '#ffffff';
      x.beginPath(); x.ellipse(10, 16, 10, 15, 0.3, 0, PI * 2); x.fill();
      x.fillStyle = 'rgba(200,225,245,0.9)';
      x.beginPath(); x.ellipse(-12, 6, 4, 9, 0.35, 0, PI * 2); x.fill();
      x.restore();
    };
    drop(W * 0.625, H * 0.60, 1.0);  // front
    drop(W * 0.125, H * 0.60, 1.0);  // back
    drop(W * 0.375, H * 0.64, 0.7);  // left
    drop(W * 0.875, H * 0.64, 0.7);  // right
    // small droplets
    x.fillStyle = '#ffffff';
    for (const f of [0, 0.25, 0.5, 0.75]) {
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(W * (f + 0.05 + R() * 0.15), H * (0.5 + R() * 0.25), 3 + R() * 3, 0, PI * 2); x.fill(); }
    }
    // fine paper grain
    const id = x.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(id, 0, 0);
    const body = mkTex(c, true, true);

    // gable (roof) texture: plain colour with scored fold lines
    const g = mkCanvas(256, 256), gx = g.getContext('2d');
    gx.fillStyle = '#5d8cc2'; gx.fillRect(0, 0, 256, 256);
    const id2 = gx.getImageData(0, 0, 256, 256), d2 = id2.data;
    for (let i = 0; i < d2.length; i += 4) { const n = (R() - 0.5) * 8; d2[i] += n; d2[i + 1] += n; d2[i + 2] += n; }
    gx.putImageData(id2, 0, 0);
    gx.strokeStyle = 'rgba(255,255,255,0.35)'; gx.lineWidth = 2;
    gx.beginPath(); gx.moveTo(0, 14); gx.lineTo(256, 14); gx.moveTo(0, 244); gx.lineTo(256, 244); gx.stroke();
    gx.strokeStyle = 'rgba(20,40,80,0.25)'; gx.lineWidth = 1.5;
    gx.beginPath(); gx.moveTo(0, 17); gx.lineTo(256, 17); gx.moveTo(0, 241); gx.lineTo(256, 241); gx.stroke();
    const gable = mkTex(g);
    // gusset (end) texture: same colour with diagonal folds
    const e = mkCanvas(256, 256), ex = e.getContext('2d');
    ex.drawImage(g, 0, 0);
    ex.strokeStyle = 'rgba(255,255,255,0.32)'; ex.lineWidth = 2;
    ex.beginPath(); ex.moveTo(128, 0); ex.lineTo(0, 256); ex.moveTo(128, 0); ex.lineTo(256, 256); ex.stroke();
    const gusset = mkTex(e);
    return { body, gable, gusset };
  });
}
export function makeCarton() {
  const group = new THREE.Group();
  group.name = 'carton';
  const T = cartonTextures();
  const a = 0.035, hb = 0.088, hr = 0.118, ht = 0.130;
  const paper = (map, side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0, side });

  // body: extruded rounded square, with perimeter UVs
  const shape = roundedPoly([[-a, -a], [a, -a], [a, a], [-a, a]], 0.0028);
  let bg = new THREE.ExtrudeGeometry(shape, { depth: hb, bevelEnabled: false, curveSegments: 6 });
  bg.rotateX(-PI / 2);
  bg = bg.toNonIndexed ? bg : bg;
  const p = bg.getAttribute('position'), uv = bg.getAttribute('uv');
  const perim = (x, z) => {
    if (Math.abs(z) >= Math.abs(x)) return z < 0 ? 0.125 - x / (2 * a) * 0.25 : 0.625 + x / (2 * a) * 0.25;
    return x < 0 ? 0.375 + z / (2 * a) * 0.25 : 0.875 - z / (2 * a) * 0.25;
  };
  for (let i = 0; i < p.count; i++) uv.setXY(i, perim(p.getX(i), p.getZ(i)), p.getY(i) / hb);
  for (let i = 0; i < p.count; i += 3) { // fix wrap seam
    const us = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)];
    if (Math.max(...us) - Math.min(...us) > 0.5) for (let k = 0; k < 3; k++) if (us[k] < 0.5) uv.setX(i + k, us[k] + 1);
  }
  bg.deleteAttribute('normal');
  bg.computeVertexNormals();
  const body = M(bg, paper(T.body));
  group.add(body);

  // roof panels
  const slant = Math.hypot(a, hr - hb), th = Math.atan2(a, hr - hb);
  const pg = new THREE.PlaneGeometry(2 * a + 0.0004, slant);
  pg.rotateX(-th); pg.translate(0, (hb + hr) / 2, a / 2);
  const pg2 = pg.clone(); pg2.rotateY(PI);
  const roofMat = paper(T.gable, THREE.DoubleSide);
  group.add(M(pg, roofMat), M(pg2, roofMat));
  // fin (sealed ridge)
  const fin = M(new RoundedBoxGeometry(2 * a, ht - hr + 0.002, 0.0034, 2, 0.0008), paper(T.gable));
  fin.position.set(0, (ht + hr) / 2 - 0.001, 0);
  group.add(fin);

  // gussets (end triangles) — dynamic for the opening spout at −X
  const gussetMat = paper(T.gusset, THREE.DoubleSide);
  const mkGusset = (s) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0.5, 0.06], 2));
    g.setIndex(s > 0 ? [0, 3, 2, 3, 1, 2] : [0, 2, 3, 3, 2, 1]);
    const m = M(g, gussetMat);
    m.userData.s = s;
    return m;
  };
  const gL = mkGusset(-1), gR = mkGusset(1);
  group.add(gL, gR);
  const setG = (m, open) => {
    const s = m.userData.s, P = m.geometry.getAttribute('position');
    P.setXYZ(0, s * a, hb, -a * s);
    P.setXYZ(1, s * a, hb, a * s);
    if (open) { P.setXYZ(2, s * (a + 0.013), hr - 0.004, 0); P.setXYZ(3, s * (a + 0.003), hb + 0.004, 0); }
    else { P.setXYZ(2, s * a, hr, 0); P.setXYZ(3, s * (a - 0.007), hb + 0.003, 0); }
    P.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingSphere();
  };
  // spout opening (dark inner throat) — visible when open
  const holeGeo = new THREE.BufferGeometry();
  holeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -(a + 0.013), hr - 0.004, 0, -a, hr, -0.006, -a, hr, 0.006, -(a - 0.002), hr - 0.012, 0], 3));
  holeGeo.setIndex([0, 1, 2, 1, 3, 2]);
  holeGeo.computeVertexNormals();
  const hole = M(holeGeo, new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6, side: THREE.DoubleSide }), false, false);
  group.add(hole);
  // side flaps of opened spout
  const flapGeo = new THREE.BufferGeometry();
  flapGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -(a + 0.013), hr - 0.004, 0, -a, hr, 0.0017, -a, hr - 0.016, a * 0.55,
    -(a + 0.013), hr - 0.004, 0, -a, hr - 0.016, -a * 0.55, -a, hr, -0.0017], 3));
  flapGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0.6, 0.45, 0.62, 0.7, 0.2, 0.5, 0.6, 0.3, 0.2, 0.55, 0.62], 2));
  flapGeo.computeVertexNormals();
  const flaps = M(flapGeo, gussetMat);
  group.add(flaps);

  const spout = new THREE.Object3D();
  spout.name = 'spout';
  group.add(spout);
  const setOpen = (open) => {
    setG(gL, open); setG(gR, false);
    hole.visible = open; flaps.visible = open;
    spout.position.set(open ? -(a + 0.013) : -a, open ? hr - 0.004 : hr, 0);
    group.userData.open = open;
  };
  setOpen(false);
  group.userData.spout = spout;       // pouring lip at the −X end of the ridge; pours toward local −X
  group.userData.setOpen = setOpen;
  group.userData.height = ht;
  return group;
}

// ======================================================================== 4. MIXER
function mixerBeaterGeo() {
  return once('beaterGeo', () => {
    const R = 0.0175, parts = [];
    for (let k = 0; k < 4; k++) {
      const phi = k * PI / 4, cx = Math.cos(phi), cz = Math.sin(phi), pts = [];
      const N = 30;
      const prof = (s) => R * Math.pow(Math.sin(PI * Math.pow(s, 0.62)), 0.72);
      for (let i = N; i >= 0; i--) { const s = i / N; const r = prof(s); pts.push(V3(cx * r, 0.0016 + s * 0.054, cz * r)); }
      for (let i = 1; i <= N; i++) { const s = i / N; const r = -prof(s); pts.push(V3(cx * r, 0.0016 + s * 0.054, cz * r)); }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      parts.push(new THREE.TubeGeometry(curve, 90, 0.00095, 6, false));
    }
    const shaft = new THREE.CylinderGeometry(0.0021, 0.0021, 0.054, 12); shaft.translate(0, 0.081, 0);
    const hub = new THREE.CylinderGeometry(0.0030, 0.0036, 0.009, 16); hub.translate(0, 0.058, 0);
    const stop = new THREE.CylinderGeometry(0.0034, 0.0034, 0.003, 16); stop.translate(0, 0.096, 0);
    const tip = new THREE.SphereGeometry(0.0016, 10, 8); tip.translate(0, 0.0016, 0);
    for (const g of [shaft, hub, stop, tip]) { g.deleteAttribute('uv'); parts.push(g); }
    for (const g of parts) if (g.getAttribute('uv')) g.deleteAttribute('uv');
    return mergeGeometries(parts.map(g => g.index ? g : g), false);
  });
}
export function makeMixer() {
  const group = new THREE.Group();
  group.name = 'mixer';
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf3f2ee, roughness: 0.3, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xcfcec9, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3c3e, roughness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x93b4c6, roughness: 0.4 });

  // housing (side profile in (z,y), inset by bevel 0.014)
  const hs = roundedPoly(
    [[0.111, 0.118], [0.111, 0.152], [-0.040, 0.140], [-0.056, 0.121], [-0.030, 0.112]],
    [0.006, 0.006, 0.02, 0.012, 0.03]);
  const housing = M(extrudeX(hs, 0.075, 0.014, 0.016, 8, 24), white);
  group.add(housing);
  // handle arch (inset by 0.011)
  const hd = roundedPoly(
    [[-0.018, 0.150], [-0.018, 0.207], [0.114, 0.207], [0.114, 0.150], [0.104, 0.150], [0.104, 0.199], [-0.008, 0.199], [-0.008, 0.150]],
    [0.002, 0.03, 0.026, 0.002, 0.002, 0.012, 0.012, 0.002]);
  const handle = M(extrudeX(hd, 0.034, 0.011, 0.012, 8, 24), white);
  group.add(handle);
  // speed slider on top of handle
  const slot = M(new RoundedBoxGeometry(0.0105, 0.004, 0.032, 2, 0.0015), dark, false, true);
  slot.position.set(0, 0.2172, 0.030);
  const knob = M(new RoundedBoxGeometry(0.0135, 0.0065, 0.012, 3, 0.0028), accent);
  knob.position.set(0, 0.2195, 0.022);
  const eject = M(new THREE.CylinderGeometry(0.0048, 0.005, 0.004, 24), accent);
  eject.position.set(0, 0.2175, 0.080);
  group.add(slot, knob, eject);
  // vents at the rear sides
  const ventGeo = new RoundedBoxGeometry(0.003, 0.022, 0.0032, 2, 0.001);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    const v = M(ventGeo, dark, false, false);
    v.position.set(s * 0.0372, 0.135, 0.072 + i * 0.008);
    group.add(v);
  }
  // heel pad (flat, slightly darker) at the rear
  const heel = M(new RoundedBoxGeometry(0.044, 0.050, 0.006, 3, 0.0022), grey);
  heel.position.set(0, 0.134, 0.126);
  group.add(heel);
  // sockets
  for (const s of [-1, 1]) {
    const so = M(new THREE.CylinderGeometry(0.0062, 0.0066, 0.004, 24), grey, false, true);
    so.position.set(s * 0.018, 0.0995, 0);
    group.add(so);
  }

  // beaters
  const bGeo = mixerBeaterGeo();
  const bMat = steelMat(0.16);
  const cMat = creamMat();
  const blob = once('beaterBlob', () => blobGeo(5, 9, 0.28));
  const blobS = once('beaterBlobS', () => blobGeo(9, 6, 0.3));
  const beaters = [], creams = [];
  for (const s of [-1, 1]) {
    const b = new THREE.Object3D();
    b.position.set(s * 0.018, 0, 0);
    const inner = M(bGeo, bMat, true, false);
    inner.rotation.y = s > 0 ? PI / 8 : 0;
    b.add(inner);
    const cr = new THREE.Group();
    const m1 = M(blob, cMat); m1.position.set(0, 0.016, 0); m1.scale.set(0.0165, 0.017, 0.0165);
    const m2 = M(blobS, cMat); m2.position.set(0.009, 0.012, 0.005); m2.scale.set(0.011, 0.010, 0.011);
    const m3 = M(blobS, cMat); m3.position.set(-0.008, 0.022, -0.006); m3.scale.set(0.010, 0.011, 0.010); m3.rotation.y = 2;
    cr.add(m1, m2, m3);
    cr.userData.base = [m1, m2, m3].map(m => m.scale.clone());
    cr.visible = false;
    b.add(cr);
    creams.push(cr);
    group.add(b);
    beaters.push(b);
  }
  const setCream = (a) => {
    a = Math.max(0, Math.min(1, a));
    for (const cr of creams) {
      cr.visible = a > 0.01;
      cr.children.forEach((m, i) => {
        const k = i === 0 ? 0.35 + 0.65 * a : Math.max(0.001, (a - 0.3) / 0.7);
        m.scale.copy(cr.userData.base[i]).multiplyScalar(k);
      });
    }
  };
  const grip = new THREE.Object3D(); grip.name = 'grip';
  grip.position.set(0, 0.203, 0.048);
  group.add(grip);

  group.userData.beaters = beaters;
  group.userData.beaterLength = 0.105;
  group.userData.setCream = setCream;
  group.userData.grip = grip;
  // standing on the heel: rotate +90° about X (nose up, beaters horizontal toward −Z, handle toward +Z)
  group.userData.restPose = {
    position: V3(0, 0.129, -0.134),
    quaternion: new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), PI / 2),
  };
  return group;
}

// ======================================================================== 5. SPATULA
function woodTex(key, base, lineCol, seed, lightness = 0) {
  return once(key, () => {
    const W = 256, H = 256, c = mkCanvas(W, H), x = c.getContext('2d'), R = rng(seed);
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      const u = R() * W, a = 0.05 + R() * 0.2;
      x.strokeStyle = lineCol.replace('A', a.toFixed(3));
      x.lineWidth = 0.6 + R() * 2.2;
      x.beginPath();
      for (let v = 0; v <= H; v += 16) { const uu = u + Math.sin(v * 0.03 + i) * 2; if (v === 0) x.moveTo(uu, v); else x.lineTo(uu, v); }
      x.stroke();
    }
    if (lightness) for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,240,210,${0.05 + R() * 0.08})`; x.fillRect(R() * W, R() * H, 1.5, 6 + R() * 18); }
    return mkTex(c, true, true);
  });
}
function spatulaBladeGeo() {
  return once('spatBlade', () => {
    const zTip = -0.040, Rt = 0.014, T = 0.0008, NZ = 110, NX = 8;
    const wHalf = (z) => {
      if (z < zTip + Rt) { const d = zTip + Rt - z; return Math.sqrt(Math.max(0, Rt * Rt - d * d)); }
      if (z < 0.080) return Rt;
      if (z < 0.100) return Rt - (Rt - 0.0028) * smoothstep(0.080, 0.100, z);
      return 0.0028;
    };
    const yOf = (z) => 0.012 * smoothstep(0.100, 0.124, z);
    const zs = [];
    for (let i = 0; i <= NZ; i++) {
      const t = i / NZ;
      // denser near the tip
      zs.push(zTip + 0.0004 + (0.140 - zTip - 0.0004) * (t < 0.2 ? (1 - Math.cos(t / 0.2 * PI / 2)) * 0.2 : t));
    }
    const pos = [], uv = [], idx = [];
    const add = (x, y, z) => { pos.push(x, y, z); uv.push(z * 4, x * 4 + 0.5); return pos.length / 3 - 1; };
    const grid = (top) => {
      const base = pos.length / 3;
      for (const z of zs) for (let j = 0; j <= NX; j++) {
        const x = (j / NX * 2 - 1) * wHalf(z);
        add(x, yOf(z) + (top ? T / 2 : -T / 2), z);
      }
      for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
        const a = base + i * (NX + 1) + j, b = a + 1, c = a + NX + 1, d = c + 1;
        if (top) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    };
    grid(true); grid(false);
    // edges (left, right, tip)
    const edge = (sgn) => {
      const base = pos.length / 3;
      for (const z of zs) { const x = sgn * wHalf(z); add(x, yOf(z) + T / 2, z); add(x, yOf(z) - T / 2, z); }
      for (let i = 0; i < NZ; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (sgn > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    };
    edge(1); edge(-1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}
export function makeSpatula() {
  const group = new THREE.Group();
  group.name = 'spatula';
  const brush = brushedTex();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe2e3e6, metalness: 1, roughness: 0.32, roughnessMap: brush, bumpMap: brush, bumpScale: 0.01 });
  const blade = M(spatulaBladeGeo(), bladeMat);
  group.add(blade);
  // handle: lathe around Y, turned to +Z, flattened oval
  const L = 0.110, prof = [];
  prof.push(V2(0, 0), V2(0.0052, 0), V2(0.0064, 0.0008), V2(0.0068, 0.0025));
  for (let i = 1; i <= 24; i++) { const t = i / 24, y = 0.0025 + t * (L - 0.012); prof.push(V2(0.0068 + 0.0026 * Math.sin(PI * Math.pow(t, 1.3) * 0.9), y)); }
  const rEnd = prof[prof.length - 1].x, yEnd = prof[prof.length - 1].y;
  for (let i = 1; i <= 10; i++) { const a = i / 10 * PI / 2; prof.push(V2(rEnd * Math.cos(a), yEnd + (L - yEnd) * Math.sin(a))); }
  prof[prof.length - 1].x = 0;
  const hg = new THREE.LatheGeometry(prof, 40);
  hg.rotateX(PI / 2);
  hg.scale(1.18, 0.86, 1);
  const wood = woodTex('darkWood', '#4a2e1f', 'rgba(20,10,5,A)', 31);
  const hMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0 });
  const handle = M(hg, hMat);
  handle.position.set(0, 0.012, 0.128);
  group.add(handle);
  const rivetGeo = new THREE.SphereGeometry(0.0024, 16, 8, 0, PI * 2, 0, PI / 2);
  rivetGeo.scale(1, 0.35, 1);
  const rivetMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, metalness: 1, roughness: 0.25 });
  for (const t of [0.22, 0.62]) {
    const z = 0.128 + 0.0025 + t * (L - 0.012);
    const r = 0.0068 + 0.0026 * Math.sin(PI * Math.pow(t, 1.3) * 0.9);
    const rv = M(rivetGeo, rivetMat, false, true);
    rv.position.set(0, 0.012 + r * 0.86 - 0.0003, z);
    group.add(rv);
  }
  // cream smear on the blade
  const smear = M(once('smearGeo', () => blobGeo(17, 8, 0.25)), creamMat(), false, true);
  smear.position.set(0, 0.0006, -0.002);
  smear.visible = false;
  group.add(smear);
  group.userData.setCream = (a) => {
    a = Math.max(0, Math.min(1, a));
    smear.visible = a > 0.01;
    smear.scale.set(0.0115 * (0.5 + 0.5 * a), 0.0035 * (0.4 + 0.6 * a), 0.026 * (0.4 + 0.6 * a));
  };
  group.userData.blade = blade;
  return group;
}

// ======================================================================== 6. LIGHTER
export function makeLighter() {
  const group = new THREE.Group();
  group.name = 'lighter';
  const body = new THREE.Group();          // straight frame: axis along +Z from the tip, up = +Y
  body.rotation.x = -20 * PI / 180;        // tube rises toward +Z
  group.add(body);
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0xd8502c, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.5 });
  // handle
  const hs = roundedPoly(
    [[0.150, 0.004], [0.170, 0.0075], [0.258, 0.0075], [0.258, -0.014], [0.178, -0.014], [0.150, -0.005]],
    [0.002, 0.008, 0.007, 0.008, 0.010, 0.002]);
  const hole = new THREE.Path(); hole.absarc(0.249, -0.0035, 0.0028, 0, PI * 2, true);
  hs.holes.push(hole);
  const handle = M(extrudeX(hs, 0.017, 0.003, 0.003, 4, 16), plastic);
  body.add(handle);
  // trigger under the front of the handle
  const ts = roundedPoly([[0.168, -0.010], [0.196, -0.010], [0.193, -0.022], [0.172, -0.026], [0.164, -0.020]], [0.002, 0.003, 0.004, 0.005, 0.003]);
  const trigger = M(extrudeX(ts, 0.008, 0.0012, 0.0015, 3, 10), black);
  body.add(trigger);
  // child-safety slide on top
  const safety = M(new RoundedBoxGeometry(0.007, 0.004, 0.012, 2, 0.0015), black);
  safety.position.set(0, 0.0103, 0.185);
  body.add(safety);
  // fuel windows
  const winMat = new THREE.MeshStandardMaterial({ color: 0xbfdcea, roughness: 0.08, transparent: true, opacity: 0.6 });
  const fuelMat = new THREE.MeshStandardMaterial({ color: 0x8fb7c9, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const w = M(new RoundedBoxGeometry(0.0012, 0.0095, 0.030, 2, 0.0005), winMat, false, false);
    w.position.set(s * 0.0087, -0.0042, 0.228);
    const f = M(new THREE.BoxGeometry(0.0004, 0.0045, 0.028), fuelMat, false, false);
    f.position.set(s * 0.0086, -0.0068, 0.228);
    body.add(f, w);
  }
  // collar & tube
  const collar = M(new THREE.CylinderGeometry(0.0058, 0.0064, 0.014, 28), black);
  collar.rotation.x = PI / 2; collar.position.z = 0.146;
  body.add(collar);
  const brush = brushedTex();
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xd9dadd, metalness: 1, roughness: 0.3, roughnessMap: brush });
  const tube = M(new THREE.CylinderGeometry(0.0042, 0.0042, 0.144, 28, 1, true), tubeMat);
  tube.rotation.x = PI / 2; tube.position.z = 0.0055 + 0.072;
  body.add(tube);
  const nz = lathe([V2(0.0001, 0.0002), V2(0.0019, 0.0002), V2(0.0028, 0.0), V2(0.0035, 0.0006), V2(0.0039, 0.0025), V2(0.0042, 0.0060)], 28);
  nz.rotateX(PI / 2);
  const nozzle = M(nz, new THREE.MeshStandardMaterial({ color: 0xb9bbbe, metalness: 1, roughness: 0.22 }));
  body.add(nozzle);
  const hl = M(new THREE.CircleGeometry(0.0018, 20), black, false, false);
  hl.position.z = -0.0001; hl.rotation.y = PI;
  body.add(hl);
  // two tiny air holes near the tip
  for (const s of [-1, 1]) {
    const ah = M(new THREE.CircleGeometry(0.0009, 12), black, false, false);
    ah.position.set(s * 0.00425, 0, 0.016); ah.rotation.y = s * PI / 2;
    body.add(ah);
  }

  const tip = new THREE.Object3D(); tip.name = 'tip';
  group.add(tip);
  group.userData.tip = tip;
  group.userData.setTrigger = (pressed) => {
    trigger.position.set(0, pressed ? 0.0012 : 0, pressed ? 0.004 : 0);
  };
  // lying on its left side, axis horizontal along Z
  const qx = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 20 * PI / 180);
  const qz = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), PI / 2);
  group.userData.restPose = { position: V3(0, 0.0094, -0.13), quaternion: qz.multiply(qx) };
  return group;
}

// ======================================================================== 7. CRACKER
function foilTex() {
  return once('foil', () => {
    const S = 512, c = mkCanvas(S, S), x = c.getContext('2d');
    const img = x.createImageData(S, S), d = img.data;
    const cols = [[226, 184, 80], [222, 88, 128], [70, 175, 190], [232, 232, 236]];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const s = (i + j * 0.9) / 64;
      const k = ((Math.floor(s) % 4) + 4) % 4;
      const col = cols[k], o = (j * S + i) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // dots on the silver stripes
    x.fillStyle = '#d24a76';
    for (let n = -8; n < 16; n++) for (let j = 0; j < S; j += 24) {
      const cx = (n * 4 + 3.5) * 64 - j * 0.9;
      for (const off of [-S, 0, S]) { const xx = cx + off; if (xx > -10 && xx < S + 10) { x.beginPath(); x.arc(xx, j + 8, 6, 0, PI * 2); x.fill(); } }
    }
    const t = mkTex(c, true, true);
    // crinkle bump
    const b = mkCanvas(256, 256), bx = b.getContext('2d'), R = rng(41);
    bx.fillStyle = 'rgb(128,128,128)'; bx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const g = 90 + R() * 80 | 0;
      bx.strokeStyle = `rgba(${g},${g},${g},0.5)`; bx.lineWidth = 1 + R() * 3;
      bx.beginPath(); const x0 = R() * 256, y0 = R() * 256; bx.moveTo(x0, y0); bx.lineTo(x0 + (R() - 0.5) * 60, y0 + (R() - 0.5) * 60); bx.stroke();
    }
    return { map: t, bump: mkTex(b, false, true) };
  });
}
export function makeCracker() {
  const group = new THREE.Group();
  group.name = 'cracker';
  const Lh = 0.0525, Rm = 0.023, F = foilTex();
  const outer = [V2(0, -Lh), V2(0.0012, -Lh + 0.0004), V2(0.0022, -Lh + 0.002)];
  for (let i = 1; i <= 20; i++) { const t = i / 20; outer.push(V2(0.0022 + (Rm - 0.0022) * t, -Lh + 0.002 + (2 * Lh - 0.0035) * t)); }
  // rolled lip
  const lc = V2(Rm - 0.0002, Lh - 0.0012);
  for (let i = 1; i <= 8; i++) { const a = -PI / 2 + i / 8 * PI; outer.push(V2(lc.x + 0.0012 * Math.cos(a), lc.y + 0.0012 * Math.sin(a))); }
  const inner = [outer[outer.length - 1].clone()];
  for (let i = 0; i <= 16; i++) { const t = i / 16; inner.push(V2((Rm - 0.0012) * (1 - t) + 0.001 * t, Lh - 0.0012 - (2 * Lh - 0.004) * t)); }
  inner.push(V2(0, -Lh + 0.002));
  const foil = new THREE.MeshStandardMaterial({ map: F.map, metalness: 0.65, roughness: 0.3, bumpMap: F.bump, bumpScale: 0.4 });
  F.map.repeat.set(1, 1);
  const og = new THREE.LatheGeometry(outer, 64);
  const cone = M(og, foil);
  const cin = M(new THREE.LatheGeometry(inner, 64), new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.85 }), false, true);
  group.add(cone, cin);
  // mouth disc
  const discMat = new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.8, side: THREE.DoubleSide });
  const disc = M(new THREE.CircleGeometry(Rm - 0.0006, 48), discMat, false, true);
  disc.rotation.x = -PI / 2; disc.position.y = Lh - 0.0008;
  group.add(disc);
  // torn fringe (fired)
  const rg = new THREE.RingGeometry(0.012, Rm - 0.0006, 48, 2);
  { const R = rng(3), P = rg.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), r = Math.hypot(x, y);
      if (r < 0.0125) { const nr = 0.0135 + R() * 0.0075; P.setXYZ(i, x / r * nr, y / r * nr, -R() * 0.004); }
    }
    rg.computeVertexNormals(); }
  const torn = M(rg, discMat, false, true);
  torn.rotation.x = -PI / 2; torn.position.y = Lh - 0.0008; torn.visible = false;
  group.add(torn);
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; mouth.position.y = Lh;
  group.add(mouth);
  // string + tab
  const string = new THREE.Group(); string.name = 'string'; string.position.y = -Lh + 0.0005;
  const sg = new THREE.CylinderGeometry(0.00055, 0.00055, 1, 5, 40, true);
  sg.translate(0, -0.5, 0);
  const base = Float32Array.from(sg.getAttribute('position').array);
  const strMesh = M(sg, new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.9 }), true, false);
  strMesh.frustumCulled = false;
  const tabGeo = new RoundedBoxGeometry(0.013, 0.019, 0.0008, 2, 0.0003);
  tabGeo.translate(0, -0.0095 + 0.0004, 0);
  const tab = M(tabGeo, new THREE.MeshStandardMaterial({ color: 0xe8b23c, roughness: 0.55, metalness: 0.3 }));
  tab.name = 'tab';
  string.add(strMesh, tab);
  group.add(string);
  const setPull = (a) => {
    a = Math.max(0, Math.min(1, a));
    const L = 0.07 + 0.03 * a, amp = 0.007 * (1 - a), P = sg.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      const t = -base[i * 3 + 1];
      P.setXYZ(i, base[i * 3] + amp * Math.sin(t * PI * 1.3), -t * L, base[i * 3 + 2] + amp * 0.6 * Math.sin(t * PI * 2.2));
    }
    P.needsUpdate = true;
    tab.position.set(amp * Math.sin(PI * 1.3), -L, amp * 0.6 * Math.sin(PI * 2.2));
    tab.rotation.z = amp * 12;
  };
  setPull(0);
  group.userData.mouth = mouth;
  group.userData.string = string;
  group.userData.tab = tab;
  group.userData.setPull = setPull;
  group.userData.setFired = (f) => { disc.visible = !f; torn.visible = !!f; };
  return group;
}

// ======================================================================== 8. PHOTO FRAME
export function makePhotoFrame() {
  const group = new THREE.Group();
  group.name = 'photoFrame';
  const tilt = new THREE.Group();
  tilt.rotation.x = -12 * PI / 180;
  group.add(tilt);
  const W = 0.130, H = 0.170, b = 0.014, D = 0.012, bev = 0.0012;
  const wood = woodTex('lightWood', '#d6b98f', 'rgba(140,95,55,A)', 57, 1);
  const wMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 });
  const bar = (pts, vertical) => {
    const s = new THREE.Shape(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) s.lineTo(...pts[i]); s.closePath();
    let g = new THREE.ExtrudeGeometry(s, { depth: D - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2 });
    g.translate(0, 0, bev);
    const P = g.getAttribute('position'), U = g.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (vertical) U.setXY(i, y * 6, x * 6 + z * 3 + 0.3); else U.setXY(i, x * 6, y * 6 + z * 3);
    }
    g.computeVertexNormals();
    return M(g, wMat);
  };
  const xl = -W / 2, xr = W / 2;
  tilt.add(
    bar([[xl, 0], [xr, 0], [xr - b, b], [xl + b, b]], false),
    bar([[xl + b, H - b], [xr - b, H - b], [xr, H], [xl, H]], false),
    bar([[xl, 0], [xl + b, b], [xl + b, H - b], [xl, H]], true),
    bar([[xr, 0], [xr, H], [xr - b, H - b], [xr - b, b]], true),
  );
  // back board
  const back = M(new THREE.BoxGeometry(W - 0.012, H - 0.012, 0.002), new THREE.MeshStandardMaterial({ color: 0x6e5c49, roughness: 0.85 }));
  back.position.set(0, H / 2, 0.005);
  tilt.add(back);
  // photo
  const photoMat = new THREE.MeshStandardMaterial({ color: 0xebe2cd, roughness: 0.9, metalness: 0, emissive: 0x000000 });
  const photo = M(new THREE.PlaneGeometry(0.094, 0.126), photoMat, false, true);
  photo.position.set(0, H / 2, 0.0064);
  tilt.add(photo);
  // mat board with window
  const ms = new THREE.Shape(); ms.moveTo(-0.0515, b - 0.001); ms.lineTo(0.0515, b - 0.001); ms.lineTo(0.0515, H - b + 0.001); ms.lineTo(-0.0515, H - b + 0.001); ms.closePath();
  const wh = new THREE.Path(); wh.moveTo(-0.047, H / 2 - 0.063); wh.lineTo(-0.047, H / 2 + 0.063); wh.lineTo(0.047, H / 2 + 0.063); wh.lineTo(0.047, H / 2 - 0.063); wh.closePath();
  ms.holes.push(wh);
  const mg = new THREE.ExtrudeGeometry(ms, { depth: 0.0015, bevelEnabled: false });
  const mat = M(mg, new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.92 }), false, true);
  mat.position.z = 0.0065;
  tilt.add(mat);
  // glass: additive faint reflection only
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x000000, metalness: 0, roughness: 0.06, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, envMapIntensity: 0.55,
  });
  const glass = M(new THREE.PlaneGeometry(W - 2 * b + 0.002, H - 2 * b + 0.002), glassMat, false, false);
  glass.position.set(0, H / 2, 0.0086);
  glass.renderOrder = 2;
  tilt.add(glass);
  // easel strut
  const hinge = V3(0, 0.112, 0.004).applyAxisAngle(V3(1, 0, 0), -12 * PI / 180);
  const foot = V3(0, 0.0, hinge.z - 0.052);
  const dir = foot.clone().sub(hinge), len = dir.length();
  const strut = M(new THREE.BoxGeometry(0.026, len, 0.0028), new THREE.MeshStandardMaterial({ color: 0x5f4f3f, roughness: 0.85 }));
  strut.position.copy(hinge).add(foot).multiplyScalar(0.5);
  strut.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize().negate());
  strut.position.y += 0.0014;
  group.add(strut);

  const setPhoto = (texture) => {
    if (!texture) { photoMat.map = null; photoMat.emissiveMap = null; photoMat.color.set(0xebe2cd); photoMat.emissive.set(0); photoMat.needsUpdate = true; return; }
    const t = texture.clone();
    if (!t.colorSpace || t.colorSpace === THREE.NoColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    const img = t.image || {};
    const iw = img.videoWidth || img.naturalWidth || img.width || 3, ih = img.videoHeight || img.naturalHeight || img.height || 4;
    const target = 0.094 / 0.126, ia = iw / ih;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    if (ia > target) { t.repeat.set(target / ia, 1); t.offset.set((1 - target / ia) / 2, 0); }
    else { t.repeat.set(1, ia / target); t.offset.set(0, (1 - ia / target) / 2); }
    t.needsUpdate = true;
    photoMat.map = t; photoMat.emissiveMap = t;
    photoMat.color.set(0xffffff); photoMat.emissive.setScalar(0.28);
    photoMat.needsUpdate = true;
  };
  group.userData.photo = photo;
  group.userData.setPhoto = setPhoto;
  group.userData.glass = glass;
  group.userData.frontNormal = V3(0, 0, 1).applyAxisAngle(V3(1, 0, 0), -12 * PI / 180);
  return group;
}

// ======================================================================== 9. CANDLE BOX
export function makeCandleBox() {
  const group = new THREE.Group();
  group.name = 'candleBox';
  const X = 0.105, Z = 0.086, Hh = 0.012, t = 0.0012;
  const outMat = new THREE.MeshStandardMaterial({ color: 0xf0c6cc, roughness: 0.78 });
  const inMat = new THREE.MeshStandardMaterial({ color: 0xfaf4ee, roughness: 0.85 });
  const floor = M(new RoundedBoxGeometry(X, t, Z, 1, 0.0005), inMat, true, true);
  floor.position.y = t / 2;
  group.add(floor);
  const wallX = new RoundedBoxGeometry(X, Hh, t, 2, 0.0005), wallZ = new RoundedBoxGeometry(t, Hh, Z - 2 * t, 2, 0.0005);
  for (const s of [-1, 1]) {
    const a = M(wallX, outMat); a.position.set(0, Hh / 2, s * (Z / 2 - t / 2)); group.add(a);
    const c = M(wallZ, outMat); c.position.set(s * (X / 2 - t / 2), Hh / 2, 0); group.add(c);
  }
  // thin inner liner with shallow grooves (corrugated look)
  const liner = M(new THREE.PlaneGeometry(X - 2 * t, Z - 2 * t, 40, 1), inMat, false, true);
  { const P = liner.geometry.getAttribute('position');
    for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setZ(i, 0.0006 * (1 - Math.cos((x + 0.034) / 0.017 * 2 * PI)) / 2); }
    liner.geometry.computeVertexNormals(); }
  liner.rotation.x = -PI / 2; liner.position.y = t + 0.0002;
  group.add(liner);
  const slotY = t + 0.0042;
  group.userData.slots = [-2, -1, 0, 1, 2].map(i => V3(i * 0.017, slotY, 0));
  group.userData.slotY = slotY;
  return group;
}

// ======================================================================== 10. BERRY PLATE
export function makeBerryPlate() {
  const group = new THREE.Group();
  group.name = 'berryPlate';
  const ctrl = [
    V2(0.000, 0.0035), V2(0.040, 0.0035), V2(0.046, 0.0012), V2(0.050, 0.0000), V2(0.054, 0.0004),
    V2(0.058, 0.0030), V2(0.072, 0.0080), V2(0.082, 0.0140), V2(0.0862, 0.0195), V2(0.0855, 0.0215),
    V2(0.0832, 0.0208), V2(0.0790, 0.0172), V2(0.0680, 0.0110), V2(0.0560, 0.0083), V2(0.0300, 0.0080), V2(0.000, 0.0080),
  ];
  const pts = new THREE.SplineCurve(ctrl).getSpacedPoints(110);
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, 96);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xf7f5f0, roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.06 });
  group.add(M(g, mat));
  const y = 0.008;
  const slots = [V3(0, y, 0)];
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + PI / 2; slots.push(V3(Math.cos(a) * 0.036, y, Math.sin(a) * 0.036)); }
  group.userData.slots = slots;
  group.userData.surfaceY = y;
  return group;
}
