// scene_trip.js — 場面2「trip」: 小包をのせた白い軽トラで、町から田舎のおばあちゃんの家まで
// 道は +X へまっすぐ（0〜300m）。押している間だけ進む。到着後は箱を敷石へ運び、呼び鈴を押す。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { core } from './core.js';
import { createTruck, TRUCK } from './truck.js';
import { createParcel, PARCEL } from './parcel.js';

// ---------------------------------------------------------------- 定数
const END = 300, VMAX = 7, ACC_END = 2.4;
const BUMP0 = 55, BUMP1 = 95, AV0 = 95, AV1 = 135, TUN0 = 135, TUN1 = 175, BR0 = 175, BR1 = 235;
const RHW = 2.8;                 // 道の半幅
const LANE = -1.3, PARKZ = 0.95; // 走る車線 z / 止まる位置 z
const WALLZ = 3.9;               // おばあちゃんの家の生け垣の線
const STONE = new THREE.Vector3(299.3, 0.085, 3.42); // 置き場所の敷石（上面）
const PILES = [{ x: 102, z: -1.1 }, { x: 116.5, z: -1.6 }, { x: 127.5, z: -1.0 }];
const SEAMS = [60.5, 72, 86.5];
const JOINTS = [175.6, 205, 234.4];
const PUDDLE = { x: 239.2, z: -1.25 };
const MAPLE_X = 107;
const clamp = core.clamp, lerp = core.lerp;
const sm = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const laneZ = x => lerp(LANE, PARKZ, sm(281, 297, x));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const COL = h => new THREE.Color(h);

// ---------------------------------------------------------------- ノイズ
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

// ---------------------------------------------------------------- ジオメトリ補助
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _vp = new THREE.Vector3(), _vs = new THREE.Vector3();
function xf(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  if (typeof s === 'number') _vs.set(s, s, s); else _vs.copy(s);
  g.applyMatrix4(_m4.compose(_vp.set(x, y, z), _q, _vs)); return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, seg = 10, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
function prep(g) {
  let n = g;
  if (g.index) { n = g.toNonIndexed(); g.dispose(); }
  for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) n.deleteAttribute(a);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
function paint(g, c, jit = 0, seed = 1) {
  const n = g.attributes.position.count, arr = new Float32Array(n * 3), col = c && c.isColor ? c : COL(c ?? 0xffffff);
  const r = core.rng(seed * 977 + 13);
  for (let i = 0; i < n; i += 3) {
    const f = jit ? 1 + (r() - 0.5) * jit : 1;
    for (let k = 0; k < 3 && i + k < n; k++) { arr[(i + k) * 3] = col.r * f; arr[(i + k) * 3 + 1] = col.g * f; arr[(i + k) * 3 + 2] = col.b * f; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
// 法線の向きで投影する UV（テクスチャを m 単位で貼る）
function worldUV(g, su = 1, sv = su) {
  const p = g.attributes.position; g.computeVertexNormals && !g.attributes.normal && g.computeVertexNormals();
  const nrm = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / su; uv[i * 2 + 1] = v / sv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// アトラスの区画（px: x0,y0,x1,y1 / 1024x512）
const AW = 1024, AH = 512;
const REG = { win: [0, 0, 256, 256], shoji: [256, 0, 512, 256], genkan: [512, 0, 768, 256], door: [768, 0, 1024, 256],
  vend: [0, 256, 256, 512], shutter: [256, 256, 512, 512], mirror: [512, 256, 640, 384], frost: [640, 256, 768, 384],
  genkanL: [512, 0, 640, 256], genkanR: [640, 0, 768, 256] };
function regUV(g, r) {
  const u0 = r[0] / AW, u1 = r[2] / AW, v0 = 1 - r[3] / AH, v1 = 1 - r[1] / AH, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}
const quad = (w, h, reg) => regUV(new THREE.PlaneGeometry(w, h), REG[reg]);

// 材質ごと・50m ごとにまとめてドローコールを減らす
class Bucket {
  constructor() { this.m = new Map(); }
  add(key, g, color, jit = 0, seed = 1) {
    g = prep(g);
    if (color !== undefined && color !== null) paint(g, color, jit, seed); else if (!g.attributes.color) paint(g, 0xffffff);
    g.computeBoundingBox();
    const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
    const k = key + '|' + Math.floor((cx + 100) / 50);
    if (!this.m.has(k)) this.m.set(k, []);
    this.m.get(k).push(g); return g;
  }
  build(parent) {
    for (const [k, list] of this.m) {
      const key = k.split('|')[0];
      const geo = mergeGeometries(list, false); list.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geo, M[key]);
      mesh.castShadow = !!M[key].userData.cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      parent.add(mesh);
    }
    this.m.clear();
  }
}

// ---------------------------------------------------------------- テクスチャ
let TX = null;
function makeTextures() {
  const T = {}, C = core.tex;
  T.asphalt = C.mottled({ w: 256, h: 256, base: '#666561', spots: 900, alpha: 0.035, grain: 0.1, seed: 11, repeat: [1, 1] });
  T.wall = C.mottled({ w: 256, h: 256, base: '#ececea', spots: 300, alpha: 0.028, grain: 0.05, seed: 21, repeat: [1, 1] });
  T.ground = C.canvas(256, 256, (g, w, h) => {
    const r = core.rng(5);
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { const x = r() * w, y = r() * h, s = 6 + r() * 26; g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 * r()})` : `rgba(0,0,0,${0.06 * r()})`; g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, 6.3); g.fill(); }
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, l = 2 + r() * 6, a = -1.57 + (r() - 0.5) * 1.2, v = 120 + r() * 135 | 0;
      g.strokeStyle = `rgba(${v},${v},${v},0.45)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    C.grain(g, w, h, 0.07, 9);
  }, { repeat: [1, 1] });
  T.roof = C.canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, w, h);
    const rows = 4, cols = 8, rh = h / rows, cw = w / cols;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * cw, y = j * rh;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, '#6a6a6a'); gr.addColorStop(0.35, '#c4c4c4'); gr.addColorStop(0.6, '#a8a8a8'); gr.addColorStop(1, '#5c5c5c');
      g.fillStyle = gr; g.fillRect(x, y, cw, rh);
      const gv = g.createLinearGradient(0, y, 0, y + rh);
      gv.addColorStop(0, 'rgba(0,0,0,0.25)'); gv.addColorStop(0.8, 'rgba(255,255,255,0.08)'); gv.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = gv; g.fillRect(x, y, cw, rh);
    }
    for (let j = 0; j < rows; j++) { g.fillStyle = 'rgba(20,20,20,0.6)'; g.fillRect(0, j * rh + rh - 3, w, 3); }
    C.grain(g, w, h, 0.05, 31);
  }, { repeat: [1, 1] });
  T.block = C.canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#c4c1ba'; g.fillRect(0, 0, w, h);
    const r = core.rng(8);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const v = 180 + r() * 30 | 0; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(i * 128 + 2, j * 64 + 2, 124, 60); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
    C.grain(g, w, h, 0.08, 4);
  }, { repeat: [1, 1] });
  T.cobble = C.canvas(256, 256, (g, w, h) => {
    const r = core.rng(17);
    g.fillStyle = '#3c3a36'; g.fillRect(0, 0, w, h);
    const n = 6, s = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n + 1; i++) {
      const x = (i - (j % 2) * 0.5) * s + (r() - 0.5) * 5, y = j * s + (r() - 0.5) * 5, v = 110 + r() * 60 | 0, t = (r() - 0.5) * 18;
      g.fillStyle = `rgb(${v + t | 0},${v | 0},${v - t - 6 | 0})`;
      g.beginPath(); g.roundRect ? g.roundRect(x + 3, y + 3, s - 6, s - 6, 9) : g.rect(x + 3, y + 3, s - 6, s - 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 6, y + 5, s - 14, 4);
    }
    C.grain(g, w, h, 0.09, 3);
  }, { repeat: [1, 1] });
  T.leafy = C.canvas(256, 256, (g, w, h) => {
    const r = core.rng(12);
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 4, v = 130 + r() * 125 | 0;
      g.fillStyle = `rgba(${v},${v},${v},0.85)`; g.beginPath(); g.ellipse(x, y, s, s * 0.55, r() * 3.14, 0, 6.3); g.fill();
    }
    C.grain(g, w, h, 0.06, 2);
  }, { repeat: [1, 1] });
  T.bark = C.canvas(128, 256, (g, w, h) => {
    const r = core.rng(41); g.fillStyle = '#b4b2ae'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const x = r() * w, v = 70 + r() * 120 | 0; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(x, 0, 1 + r() * 4, h); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 3 + r() * 8, 2); }
  }, { repeat: [1, 1] });
  T.woodDark = C.wood({ w: 256, h: 256, base: '#5a4532', dark: '#2e2218', light: '#7a6048', planks: 8, seed: 21, repeat: [1, 1] });
  T.woodLight = C.wood({ w: 256, h: 256, base: '#a07e58', dark: '#6e5234', light: '#c09a70', planks: 4, seed: 23, repeat: [1, 1] });
  T.atlas = C.canvas(AW, AH, drawAtlas);
  T.glow = C.radial('rgba(255,236,170,1)', 'rgba(255,236,170,0)', 128);
  T.maple = C.canvas(128, 128, (g) => { drawMaple(g, 64, 70, 54, '#ffffff'); });
  T.leafScatter = C.canvas(512, 128, (g, w, h) => {
    const r = core.rng(66), cols = ['#b8321c', '#c9561f', '#d9a12a', '#e3b52c', '#8a4a22', '#a5281a'];
    for (let i = 0; i < 170; i++) {
      const x = r() * w, y = 8 + r() * (h - 16), c = cols[i % cols.length];
      g.save(); g.translate(x, y); g.rotate(r() * 6.28);
      if (r() < 0.5) drawMaple(g, 0, 0, 7 + r() * 4, c); else { g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, 6 + r() * 3, 4, 0, 0, 6.3); g.fill(); }
      g.restore();
    }
  }, { repeat: [1, 1] });
  T.sky = C.canvas(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2f6fbf'); gr.addColorStop(0.22, '#4f8fd6'); gr.addColorStop(0.4, '#8fbbe6'); gr.addColorStop(0.49, '#d3e2ec'); gr.addColorStop(0.52, '#dfe6ea'); gr.addColorStop(1, '#dfe6ea');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = core.rng(91);
    for (let i = 0; i < 26; i++) {
      const cx = r() * w, cy = h * (0.2 + r() * 0.26), sc = 0.5 + r() * 1.1;
      for (let k = 0; k < 9; k++) {
        const x = cx + (r() - 0.5) * 120 * sc, y = cy + (r() - 0.5) * 16 * sc, rr = (14 + r() * 26) * sc;
        for (const ox of [-w, 0, w]) {
          const rg = g.createRadialGradient(x + ox, y, 0, x + ox, y, rr * 2);
          rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg; g.save(); g.translate(x + ox, y); g.scale(2.4, 0.8); g.translate(-(x + ox), -y); g.fillRect(x + ox - rr * 2, y - rr * 2, rr * 4, rr * 4); g.restore();
        }
      }
    }
  });
  T.spark = C.canvas(128, 128, (g, w, h) => {
    const r = core.rng(7);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, s = 1 + r() * 2.5; const rg = g.createRadialGradient(x, y, 0, x, y, s * 2); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - s * 2, y - s * 2, s * 4, s * 4); }
  }, { repeat: [1, 1] });
  T.water = C.canvas(256, 256, (g, w, h) => {
    const r = core.rng(3); g.fillStyle = '#7e959a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { const x = r() * w, y = r() * h; g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,30,40,0.18)'; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 3, x + 22 + r() * 20, y); g.stroke(); }
  }, { repeat: [1, 1] });
  return T;
}

function drawMaple(g, cx, cy, R, color) {
  const lobes = [[0, 1], [0.8, 0.9], [-0.8, 0.9], [1.6, 0.68], [-1.6, 0.68], [2.4, 0.38], [-2.4, 0.38]];
  const rad = t => { let v = 0.22; for (const [a, l] of lobes) { const d = Math.atan2(Math.sin(t - a), Math.cos(t - a)); v = Math.max(v, 0.2 + l * Math.exp(-(d * d) / 0.05)); } return v; };
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i <= 180; i++) { const t = i / 180 * 6.283, rr = rad(t) * R; const x = cx + Math.sin(t) * rr, y = cy - Math.cos(t) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill();
  g.strokeStyle = color; g.lineWidth = Math.max(1, R * 0.06); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + R * 0.5); g.stroke();
}

function drawAtlas(g) {
  const r = core.rng(55);
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // --- アルミサッシの窓（2 枚引き違い、レースのカーテン）
  {
    const [x0, y0] = REG.win;
    rect(x0, y0, 256, 256, '#bfc3c5');
    for (let i = 0; i < 2; i++) {
      const px = x0 + 12 + i * 116, py = y0 + 12, pw = 116, ph = 232;
      const gr = g.createLinearGradient(px, py, px + pw * 0.4, py + ph);
      gr.addColorStop(0, '#a9c3d6'); gr.addColorStop(0.45, '#6d8496'); gr.addColorStop(1, '#3f4f5c');
      rect(px, py, pw, ph, '#9da2a5'); g.fillStyle = gr; g.fillRect(px + 7, py + 7, pw - 14, ph - 14);
      // レースのカーテン
      g.fillStyle = 'rgba(240,236,226,0.55)'; g.fillRect(px + 7 + (i ? 40 : 0), py + 7, pw - 54, ph - 14);
      for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px + 9 + (i ? 40 : 0) + k * 6, py + 7, 2, ph - 14); }
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(px + 20, py + 7); g.lineTo(px + 50, py + 7); g.lineTo(px + 10, py + 120); g.lineTo(px + 7, py + 70); g.fill();
    }
    rect(x0 + 124, y0 + 12, 8, 232, '#a7abad');
  }
  // --- 障子（下に雪見ガラス）
  {
    const [x0, y0] = REG.shoji;
    rect(x0, y0, 256, 256, '#7a5a3a');
    rect(x0 + 10, y0 + 10, 236, 236, '#efe9d8');
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(160,140,100,${r() * 0.05})`; g.fillRect(x0 + 10 + r() * 230, y0 + 10 + r() * 230, 6, 4); }
    g.fillStyle = '#8a6a48';
    for (let i = 1; i < 4; i++) g.fillRect(x0 + 10 + i * 59 - 1.5, y0 + 10, 3, 236);
    for (let j = 1; j < 7; j++) g.fillRect(x0 + 10, y0 + 10 + j * 26 - 1.5, 236, 3);
    const gy = y0 + 10 + 182; rect(x0 + 10, gy, 236, 54, '#4c4a44');
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x0 + 20, gy + 6, 60, 40);
    rect(x0 + 10, gy - 4, 236, 6, '#7a5a3a'); rect(x0 + 126, gy, 4, 54, '#7a5a3a');
  }
  // --- 玄関の引き戸（格子＋型ガラス）2 枚
  {
    const [x0, y0] = REG.genkan;
    for (let i = 0; i < 2; i++) {
      const px = x0 + i * 128;
      rect(px, y0, 128, 256, '#4e3522');
      const gr = g.createLinearGradient(px, y0, px, y0 + 256); gr.addColorStop(0, '#d9d6cb'); gr.addColorStop(1, '#bdb9ac');
      g.fillStyle = gr; g.fillRect(px + 10, y0 + 10, 108, 236);
      g.fillStyle = '#5a3e28';
      for (let k = 1; k < 6; k++) g.fillRect(px + 10 + k * 18 - 1.5, y0 + 10, 3, 236);
      for (let k = 1; k < 4; k++) g.fillRect(px + 10, y0 + 10 + k * 59 - 2, 108, 4);
      rect(px + (i ? 12 : 104), y0 + 120, 8, 22, '#2a2018');
    }
  }
  // --- 洋風の玄関ドア
  {
    const [x0, y0] = REG.door;
    rect(x0, y0, 256, 256, '#6d4a2f');
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(40,20,5,${0.1 + r() * 0.15})`; g.lineWidth = 1 + r() * 2; const x = x0 + r() * 256; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (r() - 0.5) * 8, y0 + 256); g.stroke(); }
    g.strokeStyle = 'rgba(30,15,5,0.5)'; g.lineWidth = 4; g.strokeRect(x0 + 40, y0 + 30, 120, 90); g.strokeRect(x0 + 40, y0 + 140, 120, 90);
    rect(x0 + 186, y0 + 26, 26, 204, '#8fa6b4'); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x0 + 190, y0 + 30, 6, 196);
    rect(x0 + 168, y0 + 124, 12, 26, '#c9c9c6');
  }
  // --- 自動販売機（前面。文字なし）
  {
    const [x0, y0] = REG.vend;
    rect(x0, y0, 256, 256, '#f2f2f0');
    rect(x0 + 14, y0 + 12, 228, 140, '#24313d');
    const pal = ['#d23a2a', '#2a6ac9', '#e8b520', '#3aa05a', '#f0f0f0', '#7a3a1a', '#e07020', '#5a5ad0'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
      const cx = x0 + 22 + i * 31, cy = y0 + 20 + row * 44;
      g.fillStyle = pal[(row * 3 + i * 5) % pal.length]; g.fillRect(cx, cy, 22, 30);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(cx + 3, cy + 2, 4, 26);
      g.fillStyle = '#7fd0ff'; g.fillRect(cx + 7, cy + 33, 8, 4);
    }
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x0 + 14, y0 + 12, 228, 10);
    rect(x0 + 190, y0 + 160, 40, 46, '#b9bcbf'); rect(x0 + 200, y0 + 170, 20, 6, '#333');
    rect(x0 + 30, y0 + 214, 140, 30, '#2a2a2a'); rect(x0 + 34, y0 + 218, 132, 22, '#4a4a4a');
  }
  // --- シャッター
  {
    const [x0, y0] = REG.shutter; rect(x0, y0, 256, 256, '#a9abab');
    for (let j = 0; j < 32; j++) { rect(x0, y0 + j * 8, 256, 2, '#8d8f90'); rect(x0, y0 + j * 8 + 2, 256, 1, '#c3c5c5'); }
  }
  // --- カーブミラーの鏡面
  {
    const [x0, y0] = REG.mirror;
    const gr = g.createRadialGradient(x0 + 64, y0 + 50, 4, x0 + 64, y0 + 64, 64);
    gr.addColorStop(0, '#e6eef4'); gr.addColorStop(0.6, '#a9bccb'); gr.addColorStop(1, '#5f6e78');
    g.fillStyle = gr; g.fillRect(x0, y0, 128, 128);
    g.fillStyle = '#6a6b6b'; g.beginPath(); g.moveTo(x0 + 30, y0 + 128); g.quadraticCurveTo(x0 + 64, y0 + 70, x0 + 98, y0 + 128); g.fill();
    g.fillStyle = '#9a8f7a'; g.fillRect(x0 + 8, y0 + 70, 28, 26); g.fillStyle = '#7a8a58'; g.fillRect(x0 + 92, y0 + 72, 30, 24);
  }
  // --- すりガラスの小窓
  {
    const [x0, y0] = REG.frost; rect(x0, y0, 128, 128, '#bfc3c5');
    g.fillStyle = '#d7dbd9'; g.fillRect(x0 + 8, y0 + 8, 112, 112); rect(x0 + 62, y0 + 8, 4, 112, '#a9adaf');
  }
}

// ---------------------------------------------------------------- 材質
const M = {};
function makeMaterials() {
  const std = o => new THREE.MeshStandardMaterial(o);
  M.road = std({ map: TX.asphalt, roughness: 0.93 });
  M.cobble = std({ map: TX.cobble, bumpMap: TX.cobble, bumpScale: 2, roughness: 0.85 });
  M.vc = std({ vertexColors: true, roughness: 0.82 }); M.vc.userData.cast = true;
  M.metal = std({ vertexColors: true, roughness: 0.4, metalness: 0.55 }); M.metal.userData.cast = true;
  M.gloss = std({ vertexColors: true, roughness: 0.32 }); M.gloss.userData.cast = true;
  M.ground = std({ map: TX.ground, vertexColors: true, roughness: 0.96 });
  M.wall = std({ map: TX.wall, vertexColors: true, roughness: 0.9 }); 
  M.tunnel = std({ map: TX.wall, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  M.block = std({ map: TX.block, vertexColors: true, roughness: 0.92 }); 
  M.roof = std({ map: TX.roof, vertexColors: true, roughness: 0.5, metalness: 0.1 }); 
  M.atlas = std({ map: TX.atlas, roughness: 0.3 });
  M.gwin = std({ map: TX.atlas, roughness: 0.45, emissive: 0xffb860, emissiveMap: TX.atlas, emissiveIntensity: 0 });
  M.leaf = std({ map: TX.leafy, vertexColors: true, roughness: 0.88 });
  M.bark = std({ map: TX.bark, vertexColors: true, roughness: 0.95 });
  M.woodDark = std({ map: TX.woodDark, vertexColors: true, roughness: 0.85 }); 
  M.woodLight = std({ map: TX.woodLight, vertexColors: true, roughness: 0.75 }); M.woodLight.userData.cast = true;
  M.grass = std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  M.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.7, 0.45), fog: false });
  M.water = std({ color: 0x5d7f86, map: TX.water, roughness: 0.12, metalness: 0.3, envMapIntensity: 1.3 });
  M.puddle = std({ color: 0x55636a, roughness: 0.05, metalness: 0.5, envMapIntensity: 1.6 });
  M.vinyl = std({ color: 0xeef3f0, roughness: 0.3, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  M.decal = std({ map: TX.leafScatter, alphaTest: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

// ---------------------------------------------------------------- 木（形の種類ごとに InstancedMesh）
function blob(r, seed, amp = 0.22, squashY = 0.85, det = 2) {
  let g = new THREE.IcosahedronGeometry(r, det); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = 1.6 / r;
    const k = 1 + amp * (vnoise(x * s + seed, y * s, z * s) * 2 - 1) + amp * 0.35 * (vnoise(x * s * 2.3 + seed, y * s * 2.3 + 3, z * s * 2.3) * 2 - 1);
    p.setXYZ(i, x * k, (y < 0 ? y * 0.7 : y) * k * squashY, z * k);
  }
  g.computeVertexNormals(); return g;
}
function crownGeo(spec, seed) {
  const r = core.rng(seed), parts = [];
  const pal = spec.pal.map(COL);
  spec.blobs = spec.blobs || crownBlobs(spec, r);
  spec.blobs.forEach(([x, y, z, rad], bi) => {
    const g = blob(rad, r() * 50, spec.amp ?? 0.2, 0.85, bi === 0 || spec.h === 0 ? 2 : 1); g.translate(x, y, z);
    parts.push(paint(prep(g), 0x000000));
  });
  if (spec.fruit) for (let i = 0; i < spec.fruit; i++) {
    const b = spec.blobs[i % spec.blobs.length], a = r() * 6.28, e = (r() - 0.3) * 1.2;
    const fr = new THREE.SphereGeometry(0.085, 8, 6);
    fr.translate(b[0] + Math.cos(a) * Math.cos(e) * b[3] * 0.98, b[1] + Math.sin(e) * b[3] * 0.85, b[2] + Math.sin(a) * Math.cos(e) * b[3] * 0.98);
    parts.push(paint(prep(fr), '#e8701a'));
  }
  const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  // 色: まだらに色を選び、上と外側を明るく
  const p = g.attributes.position, n = g.attributes.normal;
  const col = g.attributes.color;
  const arr = new Float32Array(p.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    if (col.getX(i) + col.getY(i) + col.getZ(i) > 0) { arr[i * 3] = col.getX(i); arr[i * 3 + 1] = col.getY(i); arr[i * 3 + 2] = col.getZ(i); continue; }
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const q = vnoise(x * 1.3 + seed, y * 1.3, z * 1.3), q2 = vnoise(x * 3.1, y * 3.1 + seed, z * 3.1);
    const idx = Math.min(pal.length - 1, Math.floor(clamp(q * 1.15 - 0.07 + (q2 - 0.5) * 0.4, 0, 0.999) * pal.length));
    tmp.copy(pal[idx]);
    const lit = 0.62 + 0.38 * clamp(n.getY(i) * 0.5 + 0.5, 0, 1) + (y - spec.blobs[0][1]) * 0.04;
    tmp.multiplyScalar(clamp(lit, 0.55, 1.15));
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  worldUV(g, 0.55);
  return g;
}
function trunkGeo(h, r0, branches, seed) {
  const r = core.rng(seed), parts = [];
  parts.push(prep(cyl(r0 * 0.7, r0, h, 8).translate(0, h / 2, 0)));
  for (let i = 0; i < branches; i++) {
    const a = r() * 6.28, len = h * (0.45 + r() * 0.25), g = cyl(r0 * 0.25, r0 * 0.5, len, 6);
    g.translate(0, len / 2, 0); xf(g, 0, h * (0.88 + r() * 0.12), 0, a, 0, 0.45 + r() * 0.3);
    parts.push(prep(g));
  }
  const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  paint(g, '#8a8070'); worldUV(g, 0.5, 1.2); return g;
}
const TREE = {
  maple: { h: 2.3, r: 0.17, br: 4, cy: 3.7, rx: 2.3, ry: 1.45, n: 11, rb: 0.95, pal: ['#9e1f16', '#b8291a', '#c9401f', '#d8632a', '#e08a2c'] },
  ginkgo: { h: 2.4, r: 0.2, br: 3, cy: 4.4, rx: 1.65, ry: 2.6, n: 12, rb: 0.85, pal: ['#c9901a', '#dcaa22', '#e8bf30', '#efcd44', '#b9a83a'] },
  zelkova: { h: 2.8, r: 0.2, br: 4, cy: 4.6, rx: 2.5, ry: 1.7, n: 12, rb: 1.0, pal: ['#8a6a2a', '#a8742a', '#bf8f38', '#76763a', '#9a5a26'] },
  ever: { h: 1.5, r: 0.18, br: 3, cy: 2.9, rx: 1.8, ry: 1.6, n: 10, rb: 0.85, pal: ['#2c4622', '#36542a', '#40602e', '#28401f', '#4c6e33'] },
  kaki: { h: 1.8, r: 0.16, br: 4, cy: 3.1, rx: 1.9, ry: 1.3, n: 10, rb: 0.75, fruit: 34, amp: 0.26, pal: ['#8a7a2a', '#a8882c', '#6f7232', '#b9772a', '#95622a'] },
  hedge: { h: 0, r: 0, br: 0, amp: 0.16, blobs: [[-0.6, 0.55, 0, 0.62], [0.05, 0.6, 0.05, 0.66], [0.65, 0.55, -0.05, 0.62]],
    pal: ['#35522a', '#3f5f2e', '#4a6a32', '#2e4824'] },
};
function crownBlobs(spec, r) {
  const list = [[0, spec.cy, 0, Math.min(spec.rx, spec.ry) * 0.85]];
  for (let i = 0; i < spec.n; i++) {
    const a = r() * 6.283, e = (r() * 1.6 - 0.55), k = 0.55 + r() * 0.35;
    list.push([Math.cos(a) * Math.cos(e) * spec.rx * k, spec.cy + Math.sin(e) * spec.ry * k, Math.sin(a) * Math.cos(e) * spec.rx * k, spec.rb * (0.75 + r() * 0.5)]);
  }
  return list;
}
const treeList = []; // {k, x, z, s, ry}
function tree(k, x, z, s = 1, ry = null, y = 0) { treeList.push({ k, x, z, s, y, ry: ry ?? hash3(x, z, 3) * 6.28 }); }
function buildTrees(parent) {
  const by = {};
  for (const t of treeList) (by[t.k] = by[t.k] || []).push(t);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let seed = 3;
  for (const k in by) {
    const spec = TREE[k], list = by[k];
    const crown = new THREE.InstancedMesh(crownGeo(spec, seed++), M.leaf, list.length);
    const trunk = spec.h ? new THREE.InstancedMesh(trunkGeo(spec.h, spec.r, spec.br, seed++), M.bark, list.length) : null;
    list.forEach((t, i) => {
      const sy = t.s * (0.9 + hash3(t.x, 1, t.z) * 0.2);
      m4.compose(p.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.ry, 0)), sc.set(t.s, sy, t.s));
      crown.setMatrixAt(i, m4); if (trunk) trunk.setMatrixAt(i, m4);
    });
    for (const im of [crown, trunk]) { if (!im) continue; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; parent.add(im); }
  }
}

// ---------------------------------------------------------------- 世界づくり
function groundY(x, z) {
  const az = Math.abs(z);
  let y = 0;
  const rv = sm(176, 187, x) * (1 - sm(223, 234, x));
  y -= rv * 4.6;
  y += sm(30, 80, az) * (vnoise(x * 0.025, 0, z * 0.025) * 4 - 1.2);
  if (az < 3.05) y = Math.min(y, -0.03);
  if (x > 240 && x < 330 && az > 5 && az < 45) y -= 0.16;
  return y;
}
function groundCol(x, z, y, out) {
  const az = Math.abs(z), n = vnoise(x * 0.12, 1.7, z * 0.12), n2 = vnoise(x * 0.5, 4.2, z * 0.5);
  let c;
  const mix = (a, b, k) => out.set(a).lerp(_c2.set(b), clamp(k, 0, 1));
  if (az < 3.0) c = mix('#55534f', '#55534f', 0);
  else if (x > 285 && x < 315 && z > 3.0 && z < 20) c = mix('#a8a294', '#6f7a46', n > 0.55 ? 0.8 : 0.15);
  else if (x < BUMP1 && az < 3.85) c = mix('#a29e94', '#8d8a82', n2);
  else if (x < BUMP0 && az < 22) c = mix('#7c8650', '#8f8a74', n);
  else if (x < AV1 + 4) c = mix('#6f7a40', '#94603a', n * 1.1 - 0.1);
  else if (x < BR0) c = az < 4 ? mix('#8d8a83', '#7a7770', n) : mix('#5f5e34', '#6a5a30', n);
  else if (x < BR1 + 1) c = y < -3.0 ? mix('#8a857a', '#6f6c62', n2) : mix('#7e8a4a', '#8f8a52', n);
  else if (az < 5.2) c = mix('#86864e', '#9a8f58', n);
  else if (az < 45) {
    const plot = (Math.floor(x / 17) + Math.floor(az / 13)) % 3;
    c = plot === 0 ? mix('#a99358', '#b8a468', n2) : plot === 1 ? mix('#8c7448', '#9b8452', n2) : mix('#b09a5c', '#9c8a50', n2);
  } else c = mix('#6f7444', '#7a6a40', n);
  return c.multiplyScalar(0.92 + n2 * 0.16);
}
const _c2 = new THREE.Color();

function buildGround(parent) {
  const xs = []; for (let x = -90; x <= 410; x += 2.5) xs.push(x);
  const zs = [-170, -110, -70, -45, -30, -20, -13, -8, -5.2, -3.9, -3.05, 3.05, 3.9, 5.2, 8, 13, 20, 30, 45, 70, 110, 170];
  const pos = [], col = [], idx = [], c = new THREE.Color();
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length; j++) {
    const x = xs[i], z = zs[j], y = groundY(x, z);
    pos.push(x, y, z); groundCol(x, z, y, c); col.push(c.r, c.g, c.b);
  }
  const nz = zs.length;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < nz - 1; j++) {
    const a = i * nz + j, b = (i + 1) * nz + j, cc = (i + 1) * nz + j + 1, d = i * nz + j + 1;
    idx.push(a, d, b, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const uv = new Float32Array(pos.length / 3 * 2); for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 3; uv[i * 2 + 1] = pos[i * 3 + 2] / 3; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, M.ground); m.receiveShadow = true; m.matrixAutoUpdate = false; parent.add(m);
}

function buildRoad(B) {
  // アスファルト（でこぼこ区間は石だたみ）
  for (let x = -60; x < 360; x += 25) {
    const x1 = x + 25;
    const segs = [];
    if (x1 <= BUMP0 || x >= BUMP1) segs.push([x, x1]);
    else { if (x < BUMP0) segs.push([x, BUMP0]); if (x1 > BUMP1) segs.push([BUMP1, x1]); }
    for (const [a, b] of segs) B.add('road', worldUV(new THREE.PlaneGeometry(b - a, RHW * 2).rotateX(-Math.PI / 2).translate((a + b) / 2, 0.02, 0), 4));
  }
  for (let x = BUMP0; x < BUMP1; x += 10) B.add('cobble', worldUV(new THREE.PlaneGeometry(10, RHW * 2).rotateX(-Math.PI / 2).translate(x + 5, 0.02, 0), 1.5));
  // 継ぎ目の鉄板・目地
  for (const sx of SEAMS) B.add('metal', box(1.4, 0.025, 2.4).translate(sx, 0.03, LANE + 0.1), '#4a4b4c');
  for (let x = BUMP0 + 4; x < BUMP1; x += 7.5) B.add('vc', box(0.12, 0.012, RHW * 2).translate(x, 0.026, 0), '#2e2d2b');
  // 白線
  const white = '#e9e8e2';
  for (let x = -60; x < 360; x += 20) {
    if (x + 20 > BUMP0 && x < BUMP1) continue;
    for (const s of [1, -1]) B.add('vc', box(20, 0.01, 0.13).translate(x + 10, 0.026, s * (RHW - 0.18)), white);
  }
  for (let x = -60; x < BR1; x += 6) {
    if (x + 3 > BUMP0 && x < BUMP1) continue;
    B.add('vc', box(3, 0.01, 0.13).translate(x + 1.5, 0.026, 0), white);
  }
  // 縁石（町・並木・トンネル）
  for (let x = -60; x < BR0; x += 10) for (const s of [1, -1]) B.add('vc', box(10, 0.14, 0.18).translate(x + 5, 0.07, s * (RHW + 0.09)), '#b3afa6', 0.06, x);
  // 道の両側の落ち葉（並木道）
  for (const s of [1, -1]) for (let x = AV0; x < AV1; x += 10) B.add('decal', new THREE.PlaneGeometry(10, 1.0).rotateX(-Math.PI / 2).translate(x + 5, 0.03, s * 2.1));
  for (let x = AV0 + 2; x < AV1 - 2; x += 10) B.add('decal', new THREE.PlaneGeometry(10, 0.7).rotateX(-Math.PI / 2).rotateY(0.04).translate(x + 5, 0.031, 0.6));
  // 工事のコーン
  for (const [x, z] of [[57, 2.35], [59.5, 2.35], [84, -2.35], [88, 2.4]]) {
    B.add('gloss', cyl(0.03, 0.17, 0.62, 12).translate(x, 0.34, z), '#e2581e');
    B.add('gloss', cyl(0.09, 0.12, 0.12, 12).translate(x, 0.36, z), '#f2f2ee');
    B.add('vc', box(0.38, 0.04, 0.38).translate(x, 0.02, z), '#2a2a2a');
  }
}

function blockWall(B, x0, x1, z, h = 1.1) {
  if (x1 - x0 < 0.2) return;
  B.add('block', worldUV(box(x1 - x0, h, 0.15).translate((x0 + x1) / 2, h / 2, z), 0.8, 0.4), '#c9c4ba', 0.05, x0);
  B.add('vc', box(x1 - x0 + 0.02, 0.05, 0.19).translate((x0 + x1) / 2, h + 0.025, z), '#a7a399');
}

// 家（ローカル: 正面 +Z、原点は地面の中心）
function house(B, cx, cz, ry, o) {
  const { w, d, h, floors = 2, wall, roof, rh = 1.5, ov = 0.55, door = true, bal = false, side = true } = o;
  const base = 0.45, parts = [];
  const add = (key, g, col, uv) => { if (uv) worldUV(g, uv, uv); parts.push([key, g, col]); };
  add('vc', box(w + 0.1, base, d + 0.1).translate(0, base / 2, 0), '#9d998f');
  add('wall', box(w, h, d).translate(0, base + h / 2, 0), wall, 1.4);
  // 妻壁（三角）
  for (const s of [1, -1]) {
    const g = new THREE.BufferGeometry(), y0 = base + h, x = s * w / 2;
    const A = [x, y0, -d / 2], Bv = [x, y0, d / 2], Cv = [x, y0 + rh, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [...A, ...Cv, ...Bv] : [...A, ...Bv, ...Cv], 3));
    g.computeVertexNormals(); add('wall', g, wall, 1.4);
  }
  // 屋根
  const run = d / 2 + ov, drop = rh * run / (d / 2), L = Math.hypot(run, drop), a = Math.atan2(rh, d / 2);
  for (const s of [1, -1]) {
    const g = worldUV(box(w + ov * 2, 0.13, L + 0.04), 0.85, 0.85);
    g.rotateX(s * a).translate(0, base + h + rh - drop / 2 + 0.08, s * run / 2);
    parts.push(['roof', g, roof]);
  }
  parts.push(['roof', worldUV(box(w + ov * 2 + 0.04, 0.16, 0.34), 0.85).translate(0, base + h + rh + 0.12, 0), COL(roof).multiplyScalar(0.8)]);
  if (floors === 2) add('vc', box(w + 0.05, 0.1, d + 0.05).translate(0, base + h / 2, 0), COL(wall).multiplyScalar(0.8));
  // 窓・戸
  const fz = d / 2 + 0.012, fh = h / floors;
  for (let f = 0; f < floors; f++) {
    const y = base + f * fh + fh * 0.56;
    if (f === 0) {
      if (door) {
        add('atlas', quad(0.95, 2.05, 'door').translate(-w / 2 + 1.2, base + 1.03, fz));
        add('vc', box(1.5, 0.08, 0.8).translate(-w / 2 + 1.2, base + 2.35, d / 2 + 0.4), '#d8d6d0');
        add('vc', box(1.4, 0.18, 0.9).translate(-w / 2 + 1.2, base - 0.09 + 0.02, d / 2 + 0.45), '#a8a49b');
      }
      add('atlas', quad(1.8, 1.25, 'win').translate(w * 0.12, y, fz));
      add('vc', box(1.9, 0.05, 0.12).translate(w * 0.12, y - 0.66, fz + 0.04), '#c9c9c4');
      if (w > 7.5) add('atlas', quad(1.1, 1.1, 'win').translate(w / 2 - 0.9, y + 0.05, fz));
    } else {
      for (const xx of [-w / 4, w / 4]) {
        add('atlas', quad(1.5, 1.1, 'win').translate(xx, y, fz));
        add('vc', box(1.6, 0.05, 0.1).translate(xx, y - 0.58, fz + 0.04), '#c9c9c4');
      }
      if (bal) {
        add('vc', box(w * 0.55, 0.12, 0.9).translate(w / 4 - 0.3, base + fh, d / 2 + 0.45), '#d6d3cb');
        add('wall', box(w * 0.55, 0.95, 0.06).translate(w / 4 - 0.3, base + fh + 0.5, d / 2 + 0.88), COL(wall).multiplyScalar(0.95), 1.4);
      }
    }
  }
  if (side) for (const s of [1, -1]) {
    add('atlas', quad(0.8, 0.7, 'frost').rotateY(s * Math.PI / 2).translate(s * (w / 2 + 0.012), base + fh * 0.62, -d * 0.15));
    if (floors === 2) add('atlas', quad(0.9, 0.9, 'win').rotateY(s * Math.PI / 2).translate(s * (w / 2 + 0.012), base + fh * 1.56, d * 0.1));
  }
  add('vc', box(0.8, 0.55, 0.3).translate(w / 2 + 0.25 + 0.15, 0.28, d * 0.2), '#ededea'); // 室外機
  for (const [key, g, col] of parts) { xf(g, cx, 0, cz, ry); B.add(key, g, col, key === 'wall' ? 0.03 : 0, cx + cz); }
}

function pole(B, x, z) {
  B.add('vc', cyl(0.12, 0.165, 10, 10).translate(x, 5, z), '#aaa79f');
  B.add('metal', box(0.12, 0.12, 1.9).translate(x, 9.25, z), '#76746f');
  B.add('metal', box(0.1, 0.1, 1.0).translate(x, 7.4, z), '#76746f');
  for (const dz of [-0.8, 0, 0.8]) B.add('gloss', cyl(0.05, 0.06, 0.16, 8).translate(x, 9.4, z + dz), '#e3e0d8');
  if (hash3(x, z, 1) > 0.5) B.add('gloss', cyl(0.3, 0.3, 0.9, 12).translate(x, 8.2, z + 0.45), '#9ea4a6');
  return [V3(x, 9.48, z - 0.8), V3(x, 9.48, z), V3(x, 9.48, z + 0.8), V3(x, 7.48, z)];
}
function wire(B, a, b, sag) {
  const n = 6, X = V3(1, 0, 0), q = new THREE.Quaternion(), d = V3(), mid = V3();
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n, p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t);
    d.subVectors(p, prev); const len = d.length(); d.normalize(); q.setFromUnitVectors(X, d); mid.addVectors(p, prev).multiplyScalar(0.5);
    const g = box(len + 0.02, 0.025, 0.025); g.applyMatrix4(_m4.compose(mid, q, _vs.set(1, 1, 1)));
    B.add('vc', g, '#2a2a2a'); prev = p;
  }
}

function buildTown(B) {
  // 町の家（左 = -Z 側は正面 +Z、右 = +Z 側は回して正面 -Z）
  const L = [
    [-9, 8.5, 7.5, 5.6, 2, '#f1ece0', '#55606c', true], [3, 8, 7.5, 5.6, 2, '#efe7d6', '#3b3f46', false], [14.5, 8.5, 7, 5.6, 2, '#e4e0d6', '#5a4a3e', true],
    [37.5, 9, 7, 5.6, 2, '#f2efe8', '#2f3338', true], [49.5, 8, 7, 2.9, 1, '#e8dcc4', '#8a4a32', false],
    [80, 8, 7, 2.9, 1, '#e3dccd', '#3c4046', false],
  ];
  const R = [
    [-12, 8, 7, 5.6, 2, '#ece6da', '#43474d', false], [0, 9, 7.5, 5.6, 2, '#d8d8d4', '#2e4a5e', true], [12, 8, 7, 2.9, 1, '#efe6d3', '#3a3d42', false],
    [24, 9, 7, 5.6, 2, '#f3efe6', '#4a3c34', true], [36.5, 8, 7, 5.6, 2, '#e6dccb', '#383c43', false], [48.5, 7, 7, 2.9, 1, '#ece5d8', '#7a3a2a', false],
    [64, 8, 7, 2.9, 1, '#e9e2d2', '#34383e', false],
  ];
  const SET = 6.6, gapsL = [[25.3, 30.6], [64.5, 77]], gapsR = [[55, 59], [70, 999]];
  for (const [cx, w, d, h, f, wall, roof, bal] of L) {
    house(B, cx, -(SET + d / 2), 0, { w, d, h, floors: f, wall, roof, bal });
    gapsL.push([cx - w / 2 + 0.6, cx - w / 2 + 1.8], [cx + w / 2 - 2.8, cx + w / 2 + 0.2]);
    tree(hash3(cx, 2, 2) > 0.5 ? 'maple' : 'ever', cx + w / 2 - 0.6, -(SET + d + 1.6), 0.8);
    tree('hedge', cx + w / 2 - 1.2, -4.6, 0.9, 0);
  }
  for (const [cx, w, d, h, f, wall, roof, bal] of R) {
    house(B, cx, SET + d / 2, Math.PI, { w, d, h, floors: f, wall, roof, bal });
    gapsR.push([cx + w / 2 - 1.8, cx + w / 2 - 0.6], [cx - w / 2 - 0.2, cx - w / 2 + 2.8]);
    tree(hash3(cx, 5, 2) > 0.4 ? 'zelkova' : 'ever', cx - w / 2 + 0.8, SET + d + 1.8, 0.85);
    tree('hedge', cx - w / 2 + 1.3, 4.6, 0.9, 0);
  }
  const walls = (gaps, z, x0, x1) => {
    gaps.sort((a, b) => a[0] - b[0]); let x = x0;
    for (const [a, b] of gaps) { if (a > x) blockWall(B, x, Math.min(a, x1), z, 0.95); x = Math.max(x, b); if (x >= x1) break; }
    if (x < x1) blockWall(B, x, x1, z, 0.95);
  };
  walls(gapsL, -3.85, -22, 86); walls(gapsR, 3.85, -22, 70);
  // 自販機（左側, 正面 +Z）
  for (const [x, c] of [[27.4, '#f0f0ee'], [28.5, '#c43a2a']]) {
    B.add('gloss', box(1.0, 1.83, 0.75).translate(x, 0.915, -3.55), c);
    B.add('atlas', quad(0.96, 1.62, 'vend').translate(x, 0.95, -3.17));
    B.add('vc', box(1.04, 0.06, 0.8).translate(x, 1.86, -3.55), '#cfcfcc');
  }
  B.add('gloss', cyl(0.2, 0.2, 0.75, 12).translate(29.4, 0.375, -3.45), '#2f5fa0');
  B.add('vc', box(4.5, 0.06, 2.2).translate(28.0, 0.03, -4.3), '#a9a59c');
  // 郵便ポスト（赤い丸型）
  {
    const x = 21.5, z = -3.35;
    B.add('vc', box(0.34, 0.3, 0.34).translate(x, 0.15, z), '#3a3a3a');
    B.add('gloss', cyl(0.24, 0.24, 1.0, 20).translate(x, 0.8, z), '#c4261c');
    B.add('gloss', new THREE.SphereGeometry(0.25, 20, 8, 0, 6.29, 0, Math.PI / 2).scale(1, 0.45, 1).translate(x, 1.3, z), '#b8231a');
    B.add('vc', box(0.24, 0.045, 0.04).translate(x, 1.08, z + 0.23), '#2a1414');
    B.add('vc', box(0.17, 0.12, 0.03).translate(x, 0.62, z + 0.235), '#e9e5dc');
  }
  // カーブミラー（右側）
  {
    const x = 42.5, z = 3.55;
    B.add('gloss', cyl(0.045, 0.045, 2.75, 10).translate(x, 1.375, z), '#e0661e');
    const dir = V3(-1, 0, -0.65).normalize(), ry = Math.atan2(dir.x, dir.z);
    for (const [ox, oz] of [[0.35, 0], [-0.35, 0]]) {
      const back = cyl(0.42, 0.42, 0.08, 24).rotateX(Math.PI / 2); xf(back, x + ox * 0.6, 2.85, z + oz, ry + (ox > 0 ? 0.35 : -0.35), 0.12); B.add('gloss', back, '#e0661e');
      const face = regUV(new THREE.CircleGeometry(0.38, 24), REG.mirror); face.translate(0, 0, 0.045); xf(face, x + ox * 0.6, 2.85, z + oz, ry + (ox > 0 ? 0.35 : -0.35), 0.12); B.add('atlas', face);
    }
  }
  // 電柱と電線（右側）
  const poles = [-20, 8, 36, 64, 92, 120];
  let prev = null;
  for (const x of poles) {
    const tips = pole(B, x, 3.35);
    if (prev) for (let i = 0; i < 4; i++) wire(B, prev[i], tips[i], 0.45);
    prev = tips;
  }
  const poles2 = [246, 272];
  prev = null;
  for (const x of poles2) {
    const tips = pole(B, x, -3.6);
    if (prev) for (let i = 0; i < 4; i++) wire(B, prev[i], tips[i], 0.5);
    prev = tips;
  }
  // 町の奥の木
  for (let x = -40; x < 95; x += 7) for (const s of [1, -1]) tree(['ever', 'zelkova', 'maple', 'ginkgo'][(Math.abs(x) / 7 | 0) % 4], x + hash3(x, s, 4) * 4, s * (20 + hash3(x, s, 5) * 10), 1.1);
  // でこぼこ区間: 古い板塀
  for (let x = 66; x < 76; x += 2) {
    B.add('woodDark', worldUV(box(2, 1.6, 0.06).translate(x + 1, 0.8, -3.9), 1), '#ffffff');
    B.add('vc', box(0.08, 1.7, 0.08).translate(x, 0.85, -3.86), '#3a2c20');
  }
}

function buildAvenue(B) {
  let i = 0;
  for (let x = AV0 + 1; x < AV1; x += 4.6, i++) {
    tree(i % 2 ? 'ginkgo' : 'maple', x, -4.7 + hash3(x, 1, 1) * 0.4, 1.05);
    tree(i % 2 ? 'maple' : 'ginkgo', x + 2.3, 4.7 + hash3(x, 2, 1) * 0.4, 1.05);
    tree(i % 3 ? 'maple' : 'zelkova', x + 1.2, -9 - hash3(x, 3, 1) * 3, 1.2);
    tree(i % 3 ? 'ginkgo' : 'zelkova', x + 3.0, 9 + hash3(x, 4, 1) * 3, 1.2);
  }
  // ベンチ・柵
  for (const s of [1, -1]) for (let x = AV0; x < AV1; x += 3) {
    B.add('vc', box(0.07, 0.75, 0.07).translate(x, 0.375, s * 3.4), '#55524c');
    B.add('metal', box(3, 0.05, 0.05).translate(x + 1.5, 0.7, s * 3.4), '#55524c');
  }
}

function buildTunnel(B, parent) {
  // 山（トンネルの上）
  const g = new THREE.PlaneGeometry(56, 100, 56, 60).rotateX(-Math.PI / 2).translate(155, 0, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const pal = ['#33502a', '#3e5a2c', '#4a6230', '#8e3a20', '#b8682c', '#c49a34'].map(COL);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const H = 21 * Math.exp(-(z / 12) * (z / 12)) * (0.85 + 0.3 * vnoise(x * 0.08, 0, z * 0.08));
    const bump = (vnoise(x * 0.5, 2, z * 0.5) - 0.5) * 1.4;
    const ramp = Math.min((x - TUN0) * 9, (TUN1 - x) * 9);
    const h = Math.max(-6, Math.min(H + bump, ramp) - 0.35);
    p.setY(i, h);
    const q = vnoise(x * 0.35, 5, z * 0.35);
    c.copy(pal[Math.min(5, Math.floor(q * 6.3))]).multiplyScalar(0.8 + 0.3 * vnoise(x, 1, z));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); worldUV(g, 2.2);
  for (let i = 0; i < 70; i++) {
    const x = TUN0 + 2 + hash3(i, 7, 1) * (TUN1 - TUN0 - 4), z = (hash3(i, 8, 1) - 0.5) * 44;
    const H = 21 * Math.exp(-(z / 12) * (z / 12)) * (0.85 + 0.3 * vnoise(x * 0.08, 0, z * 0.08));
    const h = Math.min(H, Math.min((x - TUN0) * 9, (TUN1 - x) * 9)) - 0.6;
    if (h < 1) continue;
    tree(['ever', 'maple', 'zelkova', 'ever', 'ginkgo'][i % 5], x, z, 1.3 + hash3(i, 9, 1) * 0.5, null, h);
  }
  const hill = new THREE.Mesh(g, M.leaf); hill.receiveShadow = true; hill.matrixAutoUpdate = false; parent.add(hill);
  // 坑門（アーチの穴のあいた壁）
  const R = 3.6, WY = 2.2;
  for (const [x0, dirx] of [[TUN0, -1], [TUN1, 1]]) {
    const sh = new THREE.Shape(); sh.moveTo(-20, -1); sh.lineTo(20, -1); sh.lineTo(20, 9.5); sh.lineTo(-20, 9.5); sh.closePath();
    const hole = new THREE.Path(); hole.moveTo(-R, -0.9); hole.lineTo(-R, WY); hole.absarc(0, WY, R, Math.PI, 0, true); hole.lineTo(R, -0.9); hole.closePath();
    sh.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false, curveSegments: 20 });
    fg.rotateY(-Math.PI / 2); // 形の x→世界 z、押し出し→ -x
    fg.translate(dirx < 0 ? x0 + 0.8 : x0, 0, 0);
    B.add('wall', worldUV(fg, 1.2), '#aaa69c', 0.02, x0);
    B.add('vc', box(1.1, 0.3, 40.4).translate(dirx < 0 ? x0 + 0.4 : x0 - 0.4, 9.6, 0), '#8e8a80');
    // アーチの縁
    const ring = new THREE.TorusGeometry(R + 0.12, 0.16, 6, 24, Math.PI).translate(0, WY, 0).rotateY(-Math.PI / 2).translate(dirx < 0 ? x0 - 0.02 : x0 + 0.02, 0, 0);
    B.add('vc', ring, '#9a968c');
  }
  // 内壁（側壁＋アーチ）
  const prof = [[-R, 0], [-R, WY]];
  for (let i = 1; i < 18; i++) { const a = Math.PI - i / 18 * Math.PI; prof.push([Math.cos(a) * R, WY + Math.sin(a) * R]); }
  prof.push([R, WY], [R, 0]);
  for (let x = TUN0; x < TUN1; x += 10) {
    const pos = [], cols = [], cc = new THREE.Color();
    for (let i = 0; i < prof.length - 1; i++) {
      const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
      const v = [[x, y0, z0], [x + 10, y0, z0], [x + 10, y1, z1], [x, y0, z0], [x + 10, y1, z1], [x, y1, z1]];
      for (const q of v) { pos.push(...q); cc.set(q[1] < 1.9 ? '#cfccc2' : '#6f6c66'); if (q[1] < 0.5) cc.set('#8d8a83'); cols.push(cc.r, cc.g, cc.b); }
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tg.computeVertexNormals(); worldUV(tg, 1.5);
    B.add('tunnel', tg);
  }
  // 天井のオレンジの照明
  for (let x = TUN0 + 2; x < TUN1; x += 4) for (const zz of [-1.1, 1.1]) {
    const y = WY + Math.sqrt(R * R - zz * zz) - 0.12;
    B.add('lamp', box(0.9, 0.07, 0.22).translate(x, y, zz));
  }
}

function buildBridge(B) {
  const L = BR1 - BR0, cx = (BR0 + BR1) / 2;
  B.add('vc', box(L, 0.6, 6.8).translate(cx, -0.3, 0), '#b2aea5');
  for (const s of [1, -1]) {
    B.add('vc', box(L, 0.3, 0.45).translate(cx, 0.15, s * 3.15), '#c2beb5');
    for (let x = BR0 + 1; x <= BR1 - 1; x += 3) B.add('vc', box(0.16, 0.85, 0.16).translate(x, 0.72, s * 3.2), '#cdc9c0');
    B.add('metal', box(L, 0.09, 0.14).translate(cx, 1.15, s * 3.2), '#9aa3a8');
    B.add('metal', box(L, 0.05, 0.06).translate(cx, 0.75, s * 3.2), '#9aa3a8');
    B.add('vc', box(L, 0.9, 0.3).translate(cx, -0.85, s * 2.6), '#a6a299');
  }
  for (const x of [191, 205, 219]) {
    B.add('vc', box(1.6, 4.3, 5.2).translate(x, -2.45, 0), '#a8a49b', 0.04, x);
    B.add('vc', box(2.4, 0.5, 6.4).translate(x, -0.75, 0), '#b2aea5');
  }
  for (const x of [BR0 + 0.6, BR1 - 0.6]) B.add('vc', box(1.6, 4.8, 7.4).translate(x, -2.4, 0), '#a39f96');
  for (const x of JOINTS) B.add('metal', box(0.25, 0.02, RHW * 2 - 0.2).translate(x, 0.028, 0), '#5d5e5e');
  // 川原の石
  for (let i = 0; i < 70; i++) {
    const x = 181 + hash3(i, 1, 2) * 48, z = (hash3(i, 2, 2) - 0.5) * 60;
    if (Math.abs(z) < 4) continue;
    const y = groundY(x, z); if (y > -2.9) continue;
    B.add('vc', new THREE.DodecahedronGeometry(0.3 + hash3(i, 3, 2) * 0.5, 0).scale(1, 0.55, 1).translate(x, y + 0.1, z), '#9a968c', 0.15, i);
  }
}

function buildCountry(B) {
  // はざ掛け
  for (const [x0, z0] of [[246, -9], [262, 10], [276, -11]]) {
    const len = 9;
    for (let x = 0; x <= len; x += 3) {
      for (const dz of [-0.35, 0.35]) B.add('woodLight', cyl(0.04, 0.05, 2.1, 6).rotateX(dz > 0 ? -0.2 : 0.2).translate(x0 + x, 0.9, z0 + dz * 0.6), '#ffffff');
    }
    B.add('woodLight', cyl(0.035, 0.035, len + 0.3, 6).rotateZ(Math.PI / 2).translate(x0 + len / 2, 1.55, z0), '#ffffff');
    for (let x = 0.15; x < len; x += 0.22) for (const s of [1, -1]) {
      const g = box(0.17, 0.6, 0.12); g.translate(0, -0.3, 0); xf(g, x0 + x, 1.6, z0 + s * 0.08, 0, s * 0.16);
      B.add('vc', g, hash3(x, s, 9) > 0.5 ? '#c4a356' : '#b8954a', 0.12, x * 10 + s);
    }
  }
  // ビニールハウス
  for (const [x0, z0] of [[254, -16], [272, -16]]) {
    const g = new THREE.CylinderGeometry(2.6, 2.6, 13, 18, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).translate(x0 + 6.5, 0, z0);
    B.add('vinyl', g);
    for (const ex of [0, 13]) B.add('vinyl', new THREE.CircleGeometry(2.6, 18, 0, Math.PI).rotateY(Math.PI / 2).translate(x0 + ex, 0, z0));
    for (let x = 0; x <= 13; x += 1.6) B.add('metal', new THREE.TorusGeometry(2.62, 0.025, 4, 18, Math.PI).rotateY(Math.PI / 2).translate(x0 + x, 0, z0), '#c9cccc');
  }
  // ガードレール
  for (let x = 240; x < 286; x += 2) {
    B.add('gloss', box(0.08, 0.75, 0.08).translate(x, 0.375, -3.3), '#e8e8e3');
  }
  B.add('gloss', box(46, 0.32, 0.05).translate(263, 0.62, -3.24), '#eeeeea');
  // 柿の木・雑木・遠くの林
  tree('kaki', 251, -7.2, 1.05); tree('kaki', 268, 7.5, 1.0); tree('kaki', 289, -7.5, 1.1); tree('kaki', 312, 9.5, 1.0);
  for (let x = 236; x < 360; x += 6.5) for (const s of [1, -1]) {
    const z = s * (36 + hash3(x, s, 7) * 14);
    tree(hash3(x, s, 8) > 0.55 ? 'ever' : (hash3(x, s, 9) > 0.5 ? 'zelkova' : 'maple'), x + hash3(x, s, 2) * 4, z, 1.4);
  }
  // 遠くの農家
  house(B, 258, -30, 0, { w: 10, d: 7, h: 2.9, floors: 1, wall: '#e7e1d2', roof: '#2e3135', door: false });
  house(B, 300, -34, 0, { w: 8, d: 6.5, h: 2.9, floors: 1, wall: '#ddd5c4', roof: '#3a3e44', door: false });
  house(B, 236, 28, Math.PI, { w: 9, d: 7, h: 2.9, floors: 1, wall: '#e9e3d4', roof: '#33363b', door: false });
}

// おばあちゃんの家
const G = {}; // 動く部品
function buildGrandma(B, parent) {
  const x0 = 295.6, x1 = 309.6, zf = 8.4, zb = 16.0, base = 0.55, hw = 2.55;
  const cx = (x0 + x1) / 2, cz = (zf + zb) / 2, w = x1 - x0, d = zb - zf;
  B.add('vc', box(w, base, d).translate(cx, base / 2, cz), '#8f8a80');
  // 壁: 下は焼杉の板、上は白い漆喰。正面は縁側ぶん奥へ下げる
  const wallBox = (ax, bx, az, bz) => {
    B.add('woodDark', worldUV(box(bx - ax, 1.05, bz - az).translate((ax + bx) / 2, base + 0.525, (az + bz) / 2), 2), '#ffffff');
    B.add('wall', worldUV(box(bx - ax, hw - 1.05, bz - az).translate((ax + bx) / 2, base + 1.05 + (hw - 1.05) / 2, (az + bz) / 2), 1.4), '#f3f0e6');
  };
  wallBox(x0, 301.8, zf, zb);
  wallBox(301.8, x1, zf + 1.0, zb);
  // 縁側
  B.add('woodLight', worldUV(box(x1 - 301.8, 0.08, 1.05).translate((301.8 + x1) / 2, base - 0.02, zf + 0.5), 1.2), '#ffffff');
  B.add('vc', box(x1 - 301.8, base - 0.08, 0.9).translate((301.8 + x1) / 2, (base - 0.08) / 2, zf + 0.5), '#6a6056');
  for (let x = 301.9; x <= x1; x += 1.925) B.add('woodLight', box(0.12, hw, 0.12).translate(x, base + hw / 2, zf + 0.06), '#d9c8ae');
  B.add('woodLight', box(x1 - 301.8, 0.18, 0.14).translate((301.8 + x1) / 2, base + hw - 0.09, zf + 0.06), '#d9c8ae');
  // 障子（明かりがつく）
  for (let i = 0; i < 4; i++) B.add('gwin', quad(1.9, 1.85, 'shoji').rotateY(Math.PI).translate(302.8 + i * 1.92, base + 0.95, zf + 1.0 - 0.012));
  // 左の部屋の窓
  B.add('gwin', quad(1.7, 1.0, 'shoji').rotateY(Math.PI).translate(296.9, base + 1.55, zf - 0.012));
  // 玄関（引き戸 2 枚: 左は動く）
  const gx = 299.45, gw = 1.9, gy = base + 1.02;
  B.add('vc', box(gw + 0.3, 0.12, 0.1).translate(gx, base + 2.06, zf - 0.05), '#4e3522');
  for (const s2 of [1, -1]) B.add('vc', box(0.1, 2.1, 0.1).translate(gx + s2 * (gw / 2 + 0.08), base + 1.02, zf - 0.05), '#4e3522');
  B.add('gwin', quad(gw / 2, 2.0, 'genkanR').rotateY(Math.PI).translate(gx + gw / 4, gy, zf - 0.02));
  const doorL = new THREE.Mesh(prep(quad(gw / 2, 2.0, 'genkanL').rotateY(Math.PI)), M.gwin);
  doorL.position.set(gx - gw / 4, gy, zf - 0.035); parent.add(doorL); G.doorL = doorL; G.doorX0 = doorL.position.x;
  const warmM = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(gw / 2 - 0.05, 1.95).rotateY(Math.PI), warmM); warm.position.set(gx - gw / 4, gy, zf - 0.008); parent.add(warm); G.warmM = warmM;
  B.add('vc', box(2.6, 0.2, 1.3).translate(gx, 0.1, zf - 0.6), '#9e9a92'); // 玄関前の石段
  B.add('vc', box(2.0, 0.18, 0.6).translate(gx, base - 0.09, zf - 0.2), '#a8a49b');
  // 庇
  B.add('roof', worldUV(box(3.0, 0.1, 1.3), 0.85).rotateX(0.32).translate(gx, base + 2.45, zf - 0.45), '#34373c');
  // 大屋根（黒い瓦の切妻）
  const rh = 2.1, ov = 0.95, run = d / 2 + ov, drop = rh * run / (d / 2), L = Math.hypot(run, drop), a = Math.atan2(rh, d / 2);
  for (const s of [1, -1]) {
    const g = worldUV(box(w + ov * 2, 0.16, L + 0.06), 0.8, 0.8);
    g.rotateX(s * a).translate(cx, base + hw + rh - drop / 2 + 0.1, cz + s * run / 2);
    B.add('roof', g, '#3a3d42');
  }
  B.add('roof', cyl(0.17, 0.17, w + ov * 2 + 0.1, 10).rotateZ(Math.PI / 2).translate(cx, base + hw + rh + 0.12, cz), '#2c2e32');
  for (const s of [1, -1]) {
    const g = new THREE.BufferGeometry(), y0 = base + hw, xx = s > 0 ? x1 : x0;
    const A = [xx, y0, zf], Bv = [xx, y0, zb], Cv = [xx, y0 + rh, cz];
    g.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [...A, ...Bv, ...Cv] : [...A, ...Cv, ...Bv], 3));
    g.computeVertexNormals(); B.add('wall', worldUV(g, 1.4), '#f1eee4');
  }
  // 生け垣と門柱
  for (let x = 284; x < 314; x += 1.9) {
    if (x > 297.3 && x < 300.7) continue;
    tree('hedge', x + 0.95, WALLZ + 0.45, 0.95, 0);
  }
  B.add('vc', box(13.2, 0.3, 0.3).translate(290.9, 0.15, WALLZ + 0.1), '#8d8980');
  B.add('vc', box(13.2, 0.3, 0.3).translate(307.5, 0.15, WALLZ + 0.1), '#8d8980');
  const pillar = (x) => {
    B.add('wall', worldUV(box(0.34, 1.45, 0.34).translate(x, 0.725, WALLZ), 0.7), '#8e8b84', 0.03, x);
    B.add('vc', box(0.42, 0.09, 0.42).translate(x, 1.49, WALLZ), '#77746d');
  };
  pillar(297.7); pillar(300.85);
  // 呼び鈴（荷台の後ろ側の門柱の、道側の面 = -Z 向き）
  const btnBase = new THREE.Group(); btnBase.position.set(297.7, 1.02, WALLZ - 0.172); parent.add(btnBase);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8e3d6, roughness: 0.4 }));
  plate.position.z = -0.01; plate.castShadow = true; btnBase.add(plate);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 }));
  lens.position.set(0, 0.075, -0.0205); lens.rotation.y = Math.PI; btnBase.add(lens);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.03, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.3 }));
  btn.position.set(0, -0.035, -0.03); btnBase.add(btn);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 24), new THREE.MeshStandardMaterial({ color: 0xa8a8a2, roughness: 0.3, metalness: 0.6 }));
  ring.position.set(0, -0.035, -0.022); btnBase.add(ring);
  const lampM = new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffa030, emissiveIntensity: 0.3, roughness: 0.3 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), lampM); lamp.position.set(0.05, 0.075, -0.02); btnBase.add(lamp);
  const hit = new THREE.Object3D(); hit.position.set(0, -0.035, -0.05); hit.userData.hitR = 0.3; btnBase.add(hit);
  G.btn = btn; G.lampM = lampM; G.btnHit = hit; G.btnBase = btnBase;
  // 敷石（置き場所）と飛び石
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.085, 9).scale(1.15, 1, 0.75), new THREE.MeshStandardMaterial({ color: 0x9c978d, roughness: 0.85, map: TX.wall }));
  stone.position.set(STONE.x, 0.0425, STONE.z); stone.receiveShadow = true; stone.castShadow = true; parent.add(stone);
  const sm2 = new THREE.Object3D(); sm2.position.copy(STONE); parent.add(sm2); G.stoneMark = sm2;
  for (const [x, z] of [[299.2, 4.6], [299.7, 5.5], [299.25, 6.4], [299.6, 7.2]]) B.add('vc', cyl(0.3, 0.32, 0.08, 8).scale(1.2, 1, 0.9).translate(x, 0.04, z), '#a29d93', 0.1, x * z);
  // 灯籠
  {
    const x = 303.5, z = 5.6;
    B.add('vc', cyl(0.12, 0.16, 0.7, 8).translate(x, 0.35, z), '#8f8b83');
    B.add('vc', box(0.42, 0.32, 0.42).translate(x, 0.86, z), '#99958c');
    B.add('vc', cyl(0.05, 0.42, 0.22, 6).translate(x, 1.13, z), '#88847b');
  }
  // 庭木
  tree('ever', 293.5, 7.5, 0.75); tree('maple', 307.8, 5.8, 0.65); tree('ever', 311.5, 12, 0.9); tree('kaki', 290.5, 12, 0.95);
  // 家の明かり
  G.warmLight = new THREE.PointLight(0xffb86a, 0, 9, 1.6); G.warmLight.position.set(gx, base + 1.6, zf - 0.6); parent.add(G.warmLight);
}

// ---------------------------------------------------------------- 遠景（空・山並み）
function buildSky(parent) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 16), new THREE.MeshBasicMaterial({ map: TX.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -2; parent.add(sky);
  const layers = [
    { R: 190, base: 14, amp: 24, top: ['#56553a', '#6e4a2e', '#4a5632', '#7a5a2e'], haze: 0.3, seed: 1 },
    { R: 270, base: 28, amp: 34, top: ['#66706e', '#74706a', '#646e70'], haze: 0.45, seed: 2 },
    { R: 380, base: 46, amp: 52, top: ['#9aabbb', '#a2b2c0'], haze: 0.7, seed: 3 },
  ];
  const haze = COL('#dfe6ea');
  const pos = [], col = [], c = new THREE.Color(), N = 160;
  for (const L of layers) {
    const ph = [1, 2, 3, 4, 5, 6].map(k => hash3(k, L.seed, 4) * 6.28);
    const hh = t => L.base + L.amp * (0.55 * Math.max(0, Math.sin(2 * t + ph[0])) + 0.3 * Math.sin(3 * t + ph[1]) * 0.5 + 0.25 * Math.sin(5 * t + ph[2]) + 0.12 * Math.sin(9 * t + ph[3]) + 0.07 * Math.sin(17 * t + ph[4]) + 0.04 * Math.sin(31 * t + ph[5]));
    for (let i = 0; i < N; i++) {
      const t0 = i / N * 6.283, t1 = (i + 1) / N * 6.283;
      const pts = [[t0, -40, 0], [t1, -40, 0], [t1, hh(t1), 1], [t0, -40, 0], [t1, hh(t1), 1], [t0, hh(t0), 1]];
      for (const [t, y, top] of pts) {
        pos.push(Math.cos(t) * L.R, y, Math.sin(t) * L.R);
        if (top) { const q = vnoise(t * 7, L.seed, 0) * (L.top.length - 1), i0 = Math.floor(q); c.set(L.top[i0]).lerp(_c2.set(L.top[Math.min(L.top.length - 1, i0 + 1)]), q - i0).lerp(haze, L.haze * 0.5); }
        else c.copy(haze);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mtn = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  mtn.renderOrder = -1; mtn.frustumCulled = false; parent.add(mtn);
  return { sky, mtn };
}

// ---------------------------------------------------------------- 場面
let S = null; // 場面の作業領域
if (typeof window !== "undefined") window.__dbg = () => S; // DEBUG-REMOVE
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _s1 = {}, _s2 = {};

const trip = {
  id: 'trip',

  init(c) {
    TX = makeTextures(); makeMaterials();
    const scene = this.scene = new THREE.Scene();
    scene.environment = core.env;
    scene.background = COL('#dfe6ea');
    scene.fog = new THREE.Fog(0xdfe6ea, 45, 175);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
    const world = new THREE.Group(); scene.add(world);
    const B = new Bucket();
    treeList.length = 0;
    buildGround(world); buildRoad(B); buildTown(B); buildAvenue(B); buildTunnel(B, world); buildBridge(B); buildCountry(B); buildGrandma(B, world);
    B.build(world); buildTrees(world);
    const far = buildSky(scene);
    // 川面
    const water = new THREE.Mesh(new THREE.PlaneGeometry(52, 600).rotateX(-Math.PI / 2), M.water);
    water.position.set(205, -3.75, 0); water.receiveShadow = true; scene.add(water);
    TX.water.repeat.set(8, 90);
    const sparkM = new THREE.MeshBasicMaterial({ map: TX.spark, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
    TX.spark.repeat.set(10, 110);
    const spark = new THREE.Mesh(new THREE.PlaneGeometry(52, 600).rotateX(-Math.PI / 2), sparkM); spark.position.set(205, -3.72, 0); scene.add(spark);
    // 水たまり
    const pud = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2).scale(1.4, 1, 0.8), M.puddle);
    pud.position.set(PUDDLE.x, 0.026, PUDDLE.z); pud.receiveShadow = true; scene.add(pud);
    // 落ち葉の山（InstancedMesh: 通ると平らに）
    const pg = blob(0.7, 4, 0.25, 0.35); const pgg = prep(pg);
    const pc = new Float32Array(pgg.attributes.position.count * 3), lc = ['#b8321c', '#d1611f', '#e0a72a', '#93401c', '#c9881e'].map(COL);
    const pp = pgg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const q = vnoise(pp.getX(i) * 6, pp.getY(i) * 6, pp.getZ(i) * 6); const cc = lc[Math.min(4, q * 5 | 0)]; pc[i * 3] = cc.r; pc[i * 3 + 1] = cc.g; pc[i * 3 + 2] = cc.b; }
    pgg.setAttribute('color', new THREE.BufferAttribute(pc, 3)); worldUV(pgg, 0.25);
    const piles = new THREE.InstancedMesh(pgg, M.leaf, PILES.length); piles.frustumCulled = false; piles.receiveShadow = true; scene.add(piles);
    // ライト
    const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x8a7a5a, 1.0); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.7); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);
    const tunL = new THREE.PointLight(0xffa040, 0, 10, 1.5); scene.add(tunL);
    // 軽トラ
    const truck = createTruck(); scene.add(truck.group);
    const castNames = ['paint', 'bedPaint', 'blackPaint', 'chassis', 'liner'];
    truck.group.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = castNames.includes(o.name) || (!o.name && o.material.roughness > 0.85); } });
    const head = new THREE.SpotLight(0xfff3dc, 0, 30, 0.55, 0.6, 1.2); head.position.set(1.7, 0.8, 0); truck.group.add(head);
    const headT = new THREE.Object3D(); headT.position.set(12, -1.5, 0); truck.group.add(headT); head.target = headT;
    const truckHit = new THREE.Object3D(); truckHit.position.set(0.1, 1.0, 0); truckHit.userData.hitR = 1.5; truck.group.add(truckHit);
    const boxHolder = new THREE.Group(); truck.bed.add(boxHolder);
    // 舞う落ち葉
    const LEAF_N = 64;
    const leafM = new THREE.MeshStandardMaterial({ map: TX.maple, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
    const leafIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.11), leafM, LEAF_N); leafIM.frustumCulled = false;
    const leaves = []; const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < LEAF_N; i++) { leaves.push({ on: false, p: V3(), v: V3(), r: V3(), w: V3(), life: 0, gnd: false, ph: Math.random() * 6 }); leafIM.setMatrixAt(i, zero); leafIM.setColorAt(i, COL('#c43a1c')); }
    scene.add(leafIM);
    // もみじ（箱にくっつく 1 枚）
    const mapleM = new THREE.MeshStandardMaterial({ map: TX.maple, color: 0xd23a1e, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    const maple = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), mapleM); maple.visible = false; maple.castShadow = true;
    // 進む方向の光の点
    const dotM = new THREE.MeshBasicMaterial({ map: TX.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xfff0b8 });
    const DOT_N = 9;
    const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.55).rotateX(-Math.PI / 2), dotM, DOT_N); dots.frustumCulled = false; dots.renderOrder = 4;
    for (let i = 0; i < DOT_N; i++) { dots.setMatrixAt(i, zero); dots.setColorAt(i, COL(0x000000)); }
    scene.add(dots);
    // トンネル出口の光
    const exitM = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.2), fog: false, transparent: true, opacity: 0, depthWrite: false });
    const sh = new THREE.Shape(); sh.moveTo(-3.6, 0); sh.lineTo(-3.6, 2.2); sh.absarc(0, 2.2, 3.6, Math.PI, 0, true); sh.lineTo(3.6, 0); sh.closePath();
    const exitG = new THREE.ShapeGeometry(sh, 16).rotateY(-Math.PI / 2);
    const exitP = new THREE.Mesh(exitG, exitM); exitP.position.set(TUN1 - 0.2, 0, 0); scene.add(exitP);
    // すすき
    const sus = buildSusuki(scene);
    S = { truck, head, headT, truckHit, boxHolder, hemi, sun, tunL, leafIM, leaves, zero, maple, dots, DOT_N, exitM, pilesIM: piles, sparkM, far, sus, parcel: null };
  },

  enter(c) {
    const st = core.state, tr = st.trip;
    core.renderer.toneMappingExposure = 1;
    const { truck } = S;
    // 箱を作り直す
    if (S.parcel) { S.parcel.dispose(); S.parcel = null; }
    const parcel = S.parcel = createParcel(st.parcel);
    for (const n of ['F', 'B', 'L', 'R']) parcel.setFlap(n, 0);
    parcel.group.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = o.parent === parcel.group || o.userData.kind === 'flap'; } });
    parcel.group.userData.hitR = 0.42; parcel.group.userData.hitOffset = V3(0, 0.11, 0);
    S.boxHolder.add(parcel.group); parcel.group.position.set(0, 0, 0); parcel.group.rotation.set(0, 0, 0);
    S.maple.removeFromParent(); S.maple.visible = false;
    Object.assign(S, {
      x: clamp(+tr.x || 0, 0, END), v: 0, holding: false, prevX: 0, savedX: 0, stopT: 2, acc: 0, vPrev: 0,
      pitch: 0, pitchV: 0, heave: 0, heaveV: 0, roll: 0, rollV: 0, nudge: 0, hop: 0,
      by: 0, bvy: 0, brx: 0, brz: 0, bumpAcc: 0, dk: 0, dotPh: 0, dotA: 0,
      stage: 'drive', downTruck: false, mapleT: -1, grab: false, k: 0, kT: 0, lift: 0, pulseH: null, haloH: null,
      camPos: V3(), camLook: V3(), fx: 0, fz: 0, camTw: null, camFrom: null, camTo: null, rearAt: [], leafSpawn: 0, bellT: 0,
      piles: PILES.map(p => ({ ...p, flat: 0 })), blink: 0, engOff: !!tr.arrived, A: V3(),
    });
    if (tr.arrived) S.x = END;
    S.prevX = S.savedX = S.x;
    for (const p of S.piles) if (S.x > p.x) p.flat = 1;
    this._pilesUpd();
    // 軽トラ
    for (const n of ['near', 'far', 'rear']) truck.setGate(n, 0);
    truck.setBrake(0); truck.setBlink(0); truck.setHeadlights(0); truck.setSteer(0);
    truck.body.position.set(0, 0, 0); truck.body.rotation.set(0, 0, 0);
    this._placeTruck();
    S.fx = S.x; S.fz = laneZ(S.x);
    // 葉・粒をリセット
    for (let i = 0; i < S.leaves.length; i++) { S.leaves[i].on = false; S.leafIM.setMatrixAt(i, S.zero); }
    S.leafIM.instanceMatrix.needsUpdate = true;
    // 家の状態
    G.doorL.position.x = G.doorX0; M.gwin.emissiveIntensity = 0; G.warmLight.intensity = 0; G.warmM.color.set(0x2a2018);
    G.btn.position.z = -0.03; G.lampM.emissiveIntensity = 0.3;
    S.exitM.opacity = 0; S._envMats = null; S._envK = -1;
    // 音
    S.eng = S.eng2 = S.wind = S.road = null;
    core.au.ready(() => {
      S.eng = core.au.loop({ kind: 'osc', osc: 'sawtooth', type: 'lowpass', f: 380, q: 2, pitch: 40 });
      S.eng2 = core.au.loop({ kind: 'osc', osc: 'sawtooth', type: 'lowpass', f: 260, q: 1, pitch: 40 });
      S.wind = core.au.loop({ kind: 'noise', type: 'bandpass', f: 900, q: 0.6 });
      S.road = core.au.loop({ kind: 'noise', type: 'lowpass', f: 260, q: 0.7 });
    });
    if (tr.unloaded) {
      S.stage = 'bell'; truck.setGate('near', 1);
      this.scene.attach(parcel.group); parcel.group.position.set(STONE.x, STONE.y, STONE.z); parcel.group.rotation.set(0, 0, 0);
      this._arrivalCam(true); this._setupBell();
    } else if (tr.arrived) {
      S.stage = 'unload'; truck.setGate('near', 1);
      this._arrivalCam(true); this._setupUnload();
    } else {
      this._driveCam(1, true);
      this._setDriveHint();
    }
  },

  exit() { core.renderer.toneMappingExposure = 1; },

  resize() {
    if (S && S.stage !== 'drive' && S.stage !== 'park') this._arrivalCam(true);
    else if (S) this._driveCam(1, true);
  },

  // ------------------------------------------------ 位置・カメラ
  _placeTruck() {
    const { truck } = S, x = S.x, z = laneZ(x);
    truck.group.position.set(x, 0, z);
    const yaw = -Math.atan2(laneZ(x + 1.2) - laneZ(x - 1.2), 2.4);
    truck.group.rotation.y = yaw;
    truck.setSteer(yaw * 2.5);
  },
  _camParams() {
    const a = core.aspect, port = a < 0.9;
    const off = port ? V3(-4.7, 3.7, 0.6) : V3(-5.0, 3.5, 2.3);
    const sc = clamp(1 + (0.62 - a) * 0.55, 0.95, 1.15);
    return { port, off: off.multiplyScalar(sc), ahead: port ? 5.5 : 5.0 };
  },
  _driveCam(dt, snap) {
    const cp = this._camParams(), cam = this.camera;
    const tz = laneZ(S.x);
    const kf = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    S.fx = lerp(S.fx, S.x, kf); S.fz = lerp(S.fz, tz, kf);
    if (S.x - S.fx > 3) S.fx = S.x - 3;
    // トンネル近くは低く・まっすぐ後ろへ
    const tf = sm(TUN0 - 9, TUN0 - 1, S.fx) * (1 - sm(TUN1 + 1, TUN1 + 8, S.fx));
    const off = cp.off; off.z *= (1 - tf * 0.8); off.y = lerp(off.y, 2.9, tf);
    S.camPos.set(S.fx + off.x, off.y, S.fz + off.z);
    S.camLook.set(S.fx + cp.ahead, 0, S.fz - off.z * (cp.ahead / -off.x) * 0.7);
    cam.fov = cp.port ? 46 : 40; cam.aspect = core.aspect; cam.updateProjectionMatrix();
    cam.position.copy(S.camPos); cam.lookAt(S.camLook);
  },
  _arrivalPose() {
    const port = core.aspect < 0.9;
    const center = port ? V3(299.2, 1.3, 4.9) : V3(299.4, 1.3, 4.9);
    const dir = port ? V3(0.05, 0.7, -1).normalize() : V3(0.25, 0.62, -1).normalize();
    const r = core.fitCamera(this.camera, { center, w: port ? 3.7 : 9.5, h: port ? 7.6 : 7.0, dir, fov: 42, pad: 1.0, apply: false });
    return { pos: r.pos, look: center };
  },
  _arrivalCam(snap) {
    const p = this._arrivalPose();
    if (snap || !S.camFrom) { S.camTw && S.camTw.kill(); S.camTw = null; S.camPos.copy(p.pos); S.camLook.copy(p.look); const cam = this.camera; cam.fov = 42; cam.aspect = core.aspect; cam.updateProjectionMatrix(); cam.position.copy(p.pos); cam.lookAt(p.look); }
    return p;
  },

  // ------------------------------------------------ ヒント
  _setDriveHint() {
    core.hint.set({
      kind: 'hold', d1: 3, d2: 6.5,
      from: () => S.truck.group.localToWorld(_v3.set(0.95, 1.95, 0)),
      cue: n => { if (n === 1) { this._horn(0.7); this._nudge(); } },
    });
  },
  _setupUnload() {
    S.stage = 'unload';
    S.pulseH = core.fx.pulse(S.parcel.group, { color: 0xffe29a, amp: 0.38 });
    S.haloH = core.fx.halo(G.stoneMark, { r: 0.6, y: 0.05, color: 0xfff0a8, opacity: 0.85 });
    core.hint.set({
      kind: 'drag', arc: 0.5, d1: 3.5, d2: 7,
      from: () => S.parcel.group.localToWorld(_v3.set(0, 0.15, 0)).clone(),
      to: () => STONE.clone().add(_v2.set(0, 0.15, 0)),
      cue: n => { if (n === 1) { core.fx.wobble(S.parcel.group, { amp: 0.06, axis: 'z', dur: 0.6 }); core.au.knock(0.8); } },
    });
  },
  _setupBell() {
    S.stage = 'bell';
    S.haloH && S.haloH.kill(); S.haloH = core.fx.halo(G.btnBase, { r: 0.22, y: -0.035, color: 0xfff0a8, opacity: 0.9 });
    S.haloH.sprite.position.z = -0.06;
    S.pulseH && S.pulseH.stop(); S.pulseH = core.fx.pulse(G.btn, { color: 0xffe08a, amp: 0.5 });
    core.hint.set({
      kind: 'tap', d1: 3, d2: 6.5,
      from: () => G.btnHit.getWorldPosition(_v3).clone(),
      cue: n => { if (n === 1) { S.blink = 1.2; core.au.bell(84, { g: 0.05, dur: 0.4 }); } },
    });
  },

  // ------------------------------------------------ 音・動き
  _horn(s = 1) {
    const au = core.au, tun = S.dk > 0.4;
    const one = (g, at) => { au.tone({ f: 415, dur: 0.2, type: 'square', g: 0.055 * g, at }); au.tone({ f: 523, dur: 0.2, type: 'square', g: 0.045 * g, at }); au.tone({ f: 262, dur: 0.18, type: 'sawtooth', g: 0.05 * g, at }); };
    one(s, 0);
    if (tun) { one(s * 0.35, 0.34); one(s * 0.15, 0.68); }
    S.heaveV += 0.55; S.pitchV += 0.25;
  },
  _nudge() {
    const b = S.truck.body;
    core.tween(0.45, (k, raw) => { S.nudge = Math.sin(raw * Math.PI) * 0.09 * (1 - raw * 0.3); }, { ease: 'linear', done: () => { S.nudge = 0; } });
    core.au.tone({ f: 70, f2: 95, dur: 0.3, type: 'sawtooth', g: 0.06 });
    void b;
  },
  _thunk(s = 0.4) { core.au.knock(0.55); core.au.thud(s); S.heaveV -= 0.35 * s * 2; S.bvy += 0.6 * s * 2; },

  // ------------------------------------------------ 入力
  onDown(p) {
    if (S.stage === 'drive') {
      S.holding = true; S.downTruck = !!core.pick(p, [S.truckHit], 10);
      // 押した瞬間: エンジンを上げる・沈む
      S.pitchV += 0.22;
      if (S.eng) S.eng.set({ g: 0.11, pitch: 58, f: 900 }, 0.02);
      core.au.tone({ f: 55, f2: 90, dur: 0.25, type: 'sawtooth', g: 0.05 });
    } else if (S.stage === 'unload') {
      if (core.pick(p, [S.parcel.group], 40)) {
        S.grab = true; core.au.pop(0.9);
        if (S.parcel.group.parent !== this.scene) this.scene.attach(S.parcel.group);
        S.A = S.parcel.group.position.clone(); S.kT = S.k = 0;
        S.liftTw && S.liftTw.kill(); S.liftTw = core.tween(0.16, k => { S.lift = k; }, { ease: 'out' });
      } else { core.fx.wobble(S.parcel.group, { amp: 0.05, dur: 0.4 }); }
    } else if (S.stage === 'bell') {
      if (core.pick(p, [G.btnHit], 40)) this._ring();
    }
  },
  onMove(p) {
    if (S.stage === 'unload' && S.grab) {
      const a = core.toScreen(_v.copy(S.A).add(_v2.set(0, 0.1, 0)), _s1), b = core.toScreen(_v.copy(STONE).add(_v2.set(0, 0.1, 0)), _s2);
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      S.kT = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    }
  },
  onUp(p) {
    if (S.stage === 'drive') {
      S.holding = false;
      if (!p.cancel && S.downTruck && core.time - p.t0 < 0.25 && p.moved < 24) this._horn(1);
    } else if (S.stage === 'unload' && S.grab) {
      S.grab = false;
      if (S.k > 0.55 && !p.cancel) this._placeBox();
      else {
        const k0 = S.k;
        S.stage = 'unload-back';
        core.tween(0.4, (k) => { S.k = lerp(k0, 0, k); S.lift = 1 - k; }, { ease: 'out', done: () => {
          S.k = 0; S.lift = 0; S.boxHolderAttach = true; S.truck.bed.updateMatrixWorld(true); S.boxHolder.attach(S.parcel.group);
          S.parcel.group.position.set(0, 0, 0); S.parcel.group.rotation.set(0, 0, 0); core.au.thud(0.3); S.stage = 'unload';
        } });
      }
    }
  },
  _placeBox() {
    S.stage = 'placing';
    core.hint.clear();
    const k0 = S.k;
    core.tween(0.35, (k) => { S.k = lerp(k0, 1, k); S.lift = 1 - k; }, { ease: 'in', done: () => {
      S.k = 1; S.lift = 0;
      core.au.thud(0.5); core.au.knock(0.7);
      core.fx.squash(S.parcel.group, { amt: 0.12, dur: 0.3 });
      core.fx.burst(STONE.clone().add(_v.set(0, 0.03, 0)), { n: 8, kind: 'dot', colors: [0xe8e2d0, 0xd8d0bc], size: 0.05, speed: 0.6, up: 0.3, gravity: -2 });
      S.pulseH && S.pulseH.stop(); S.pulseH = null; S.haloH && S.haloH.kill(); S.haloH = null;
      core.state.trip.unloaded = true; core.save();
      core.after(0.7, () => this._setupBell());
    } });
  },
  _ring() {
    S.stage = 'end'; core.hint.clear();
    S.pulseH && S.pulseH.stop(); S.pulseH = null; S.haloH && S.haloH.kill(); S.haloH = null;
    const au = core.au;
    core.tween(0.12, k => { G.btn.position.z = -0.03 + 0.016 * k; }, { ease: 'out' });
    core.tween(0.2, k => { G.btn.position.z = -0.014 - 0.016 * k; }, { delay: 0.3 });
    au.tick();
    au.bell(79, { g: 0.24, dur: 1.0 }); au.bell(75, { g: 0.24, dur: 1.8, at: 0.45 });
    G.lampM.emissiveIntensity = 2.2;
    core.after(1.3, () => {
      core.tween(0.35, k => { M.gwin.emissiveIntensity = k * 1.1; }, { ease: 'out' });
      au.tick(); au.tone({ f: 1200, f2: 900, dur: 0.05, g: 0.05 });
    });
    for (let i = 0; i < 7; i++) core.after(1.8 + i * 0.17, () => { au.noise({ dur: 0.05, g: 0.05 + i * 0.022, f: 650, q: 1.4, type: 'bandpass' }); au.tone({ f: 110, f2: 70, dur: 0.06, g: 0.06 + i * 0.02 }); });
    core.after(3.2, () => {
      for (let i = 0; i < 10; i++) au.noise({ dur: 0.06, g: 0.09, f: 1100 + (i % 3) * 300, q: 2.2, at: i * 0.07 });
      au.noise({ dur: 0.8, g: 0.08, f: 380, q: 0.7, type: 'lowpass' });
      core.tween(0.8, k => { G.doorL.position.x = G.doorX0 + k * 0.62; G.warmLight.intensity = k * 7; G.warmM.color.setRGB(lerp(0.16, 1.0, k), lerp(0.12, 0.72, k), lerp(0.09, 0.4, k)); }, { ease: 'out' });
    });
    core.after(4.4, () => { core.state.trip.rang = true; core.save(); core.go('home', { color: '#fff', dur: 0.9 }); });
  },

  // ------------------------------------------------ 到着
  _arrive() {
    S.stage = 'park'; S.v = 0; S.x = END; S.holding = false;
    core.hint.clear();
    const tr = core.state.trip; tr.x = END; tr.arrived = true; core.save();
    S.truck.setBrake(1);
    core.au.tone({ f: 2100, f2: 1600, dur: 0.16, type: 'sine', g: 0.06 }); core.au.noise({ dur: 0.18, g: 0.08, f: 3200, q: 3 });
    S.pitchV -= 0.35;
    if (S.eng) core.after(1.0, () => { S.engOff = true; core.au.tone({ f: 60, f2: 30, dur: 0.4, type: 'sawtooth', g: 0.05 }); });
    const from = { pos: this.camera.position.clone(), look: S.camLook.clone() };
    core.after(0.5, () => {
      S.camTw = core.tween(1.8, (k) => {
        const to = this._arrivalPose();
        S.camPos.lerpVectors(from.pos, to.pos, k); S.camLook.lerpVectors(from.look, to.look, k);
      }, { ease: 'inout', done: () => {
        S.camTw = null; S.truck.setBrake(0);
        core.au.knock(0.6); core.au.noise({ dur: 0.3, g: 0.06, f: 900, q: 1 });
        core.tween(0.7, k => S.truck.setGate('near', k), { ease: 'bounce', done: () => { core.au.thud(0.35); this._setupUnload(); } });
      } });
    });
  },

  // ------------------------------------------------ 毎フレーム
  update(dt, t) {
    const { truck } = S;
    if (S.stage === 'drive') this._drive(dt, t);
    else { S.v = 0; }
    this._body(dt, t);
    this._sounds(dt);
    // カメラ
    const cam = this.camera;
    if (S.stage === 'drive') this._driveCam(dt, false);
    else if (S.stage === 'park') { cam.position.copy(S.camPos); cam.lookAt(S.camLook); }
    else { cam.position.copy(S.camPos); cam.lookAt(S.camLook); }
    // 運び中の箱
    if (S.stage === 'unload' && S.grab) S.k = lerp(S.k, S.kT, 1 - Math.exp(-dt * 14));
    if ((S.stage === 'unload' && S.grab) || S.stage === 'unload-back' || S.stage === 'placing') {
      const g = S.parcel.group;
      g.position.lerpVectors(S.A, STONE, S.k);
      g.position.y += Math.sin(S.k * Math.PI) * 0.55 + S.lift * 0.1;
      g.rotation.set(0, 0, Math.sin(S.k * Math.PI) * 0.08);
    }
    // 呼び鈴のランプ
    if (S.stage === 'bell') { S.blink = Math.max(0, S.blink - dt); G.lampM.emissiveIntensity = S.blink > 0 ? (Math.sin(t * 30) > 0 ? 2.5 : 0.2) : 0.5 + 1.3 * (0.5 + 0.5 * Math.sin(t * 4.5)); }
    // 光源・遠景
    const fx = S.stage === 'drive' ? truck.group.position.x : 300;
    const fz = S.stage === 'drive' ? truck.group.position.z : 2.6;
    S.sun.target.position.set(fx, 0, fz); S.sun.position.set(fx - 7, 14, fz - 8);
    const shr = S.stage === 'drive' ? 6 : 8; const sc = S.sun.shadow.camera;
    if (sc.right !== shr) { sc.left = -shr; sc.right = shr; sc.top = shr; sc.bottom = -shr; sc.updateProjectionMatrix(); }
    S.far.sky.position.set(cam.position.x, 0, cam.position.z); S.far.mtn.position.set(cam.position.x, -2, cam.position.z);
    this._tunnel(dt, t);
    this._leaves(dt, t);
    this._dots(dt, t);
    this._susuki(dt, t);
    S.sparkM.map.offset.set((t * 0.013) % 1, (t * 0.021) % 1); S.sparkM.opacity = 0.55 + 0.35 * Math.sin(t * 2.3);
    TX.water.offset.y = (t * 0.03) % 1;
    this._maple(dt);
  },

  _drive(dt, t) {
    const x0 = S.x;
    let target = S.holding ? VMAX : 0;
    const vEnd = Math.sqrt(Math.max(0, 2 * ACC_END * (END - S.x)));
    if (S.x > END - 10.5) target = Math.min(target, vEnd);
    let a;
    if (S.v < target) a = Math.min(2.6, (target - S.v) * 1.3 + 0.5);
    else a = -Math.min(S.holding ? 3.5 : 2.3, (S.v - target) * 1.4 + 0.6);
    S.v = clamp(S.v + a * dt, 0, VMAX);
    if (S.x > END - 10.5) S.v = Math.min(S.v, vEnd + 0.05);
    if (target === 0 && S.v < 0.03) S.v = 0;
    S.x = Math.min(END, S.x + S.v * dt);
    const ac = (S.v - S.vPrev) / Math.max(dt, 1e-3); S.vPrev = S.v;
    S.acc = lerp(S.acc, ac, 1 - Math.exp(-dt * 10));
    this._placeTruck();
    S.truck.roll(S.x - x0);
    S.truck.setBrake(S.x > END - 10.5 && S.v > 0.1 ? 1 : (!S.holding && S.v > 0.4 ? 0.6 : 0));
    // 止まっている時間
    if (S.v < 0.05 && !S.holding) S.stopT += dt; else S.stopT = 0;
    this._events(x0, S.x, t);
    if (Math.abs(S.x - S.savedX) > 3 || (S.v === 0 && S.x !== S.savedX)) { S.savedX = S.x; core.state.trip.x = Math.round(S.x * 100) / 100; core.save(); }
    if (S.x >= END - 0.03) { S.x = END; this._placeTruck(); this._arrive(); }
  },

  _events(a, b, t) {
    if (b <= a) return;
    const cross = x => a < x && b >= x;
    const v = S.v, rough = v / VMAX;
    // でこぼこ
    if (b > BUMP0 && b < BUMP1) {
      S.bumpAcc += b - a;
      while (S.bumpAcc > 0.42) {
        S.bumpAcc -= 0.42;
        S.heaveV += (Math.random() - 0.5) * 0.9 * rough;
        S.rollV += (Math.random() - 0.5) * 0.5 * rough;
        S.pitchV += (Math.random() - 0.5) * 0.25 * rough;
        if (S.by < 0.004 && Math.random() < 0.5 + rough * 0.5) { S.bvy += (0.35 + Math.random() * 0.75) * rough * 1.5; S.brz += (Math.random() - 0.5) * 0.4 * rough; S.brx += (Math.random() - 0.5) * 0.3 * rough; }
      }
    }
    for (const sx of SEAMS) if (cross(sx)) { this._thunk(0.25 + rough * 0.3); S.rearAt.push({ t: Math.min(0.8, 1.9 / Math.max(v, 0.5)), s: 0.2 + rough * 0.25 }); }
    // 落ち葉の山
    for (const p of S.piles) if (!p.flat && cross(p.x - 1.2)) {
      p.flat = 0.001;
      core.tween(0.5, k => { p.flat = Math.max(0.001, k); this._pilesUpd(); }, { ease: 'out' });
      core.au.rustle(); core.au.noise({ dur: 0.5, g: 0.14, f: 3000, f2: 1500, q: 0.6, a: 0.02 }); core.au.rustle();
      const pos = V3(p.x, 0.3, p.z);
      core.fx.burst(pos, { n: 14, kind: 'dot', colors: [0xc8401c, 0xe0a72a, 0xd3611f], size: 0.06, speed: 1.6, up: 1.1, gravity: -1.5, life: 1.0 });
      for (let i = 0; i < 18; i++) this._spawnLeaf(_v.set(p.x + (Math.random() - 0.5) * 1.2, 0.2, p.z + (Math.random() - 0.5) * 1.2), _v2.set(v * 0.4 + (Math.random() - 0.3) * 1.5, 2.2 + Math.random() * 2.2, (Math.random() - 0.5) * 2.2));
    }
    // 橋の継ぎ目・欄干
    for (const jx of JOINTS) if (cross(jx)) { this._thunk(0.22 + rough * 0.2); S.rearAt.push({ t: Math.min(0.8, 1.9 / Math.max(v, 0.5)), s: 0.18 + rough * 0.2 }); }
    for (let px = BR0 + 1; px <= BR1 - 1; px += 3) if (cross(px + 1.2) && v > 2) core.au.noise({ dur: 0.1, g: 0.06 * rough + 0.01, f: 1600, f2: 2600, q: 1.4, a: 0.02 });
    // 水たまり
    if (cross(PUDDLE.x - 0.8)) {
      const s = 0.4 + rough;
      core.au.noise({ dur: 0.45, g: 0.25 * s, f: 1800, f2: 700, q: 0.6, a: 0.01 }); core.au.noise({ dur: 0.3, g: 0.12 * s, f: 4200, q: 0.8, at: 0.05 });
      for (const zz of [-0.6, 0.6]) core.fx.burst(V3(PUDDLE.x + 0.4, 0.15, laneZ(PUDDLE.x) + zz), { n: 16, kind: 'dot', colors: [0xbfe6ff, 0x8fd0f5, 0xffffff], size: 0.05, speed: 1.2 + rough * 1.5, up: 1.4, gravity: -5, life: 0.75 });
    }
    // トンネルに入る
    if (cross(TUN0 - 1)) core.au.whoosh(0.8);
    if (cross(TUN1)) core.au.whoosh(0.6);
  },

  _body(dt, t) {
    const { truck } = S;
    // 後輪の段差
    for (let i = S.rearAt.length - 1; i >= 0; i--) { const r = S.rearAt[i]; r.t -= dt; if (r.t <= 0) { this._thunk(r.s); S.rearAt.splice(i, 1); } }
    // 前後: 加速でお尻が沈む（鼻先が上がる）
    const target = clamp(S.acc * 0.011, -0.03, 0.03);
    S.pitchV += ((target - S.pitch) * 70 - S.pitchV * 9) * dt; S.pitch += S.pitchV * dt;
    S.heaveV += (-S.heave * 140 - S.heaveV * 10) * dt; S.heave += S.heaveV * dt;
    S.rollV += (-S.roll * 110 - S.rollV * 9) * dt; S.roll += S.rollV * dt;
    S.pitch = clamp(S.pitch, -0.06, 0.06); S.heave = clamp(S.heave, -0.06, 0.08); S.roll = clamp(S.roll, -0.05, 0.05);
    const idle = S.stage === 'drive' || S.stage === 'park' ? (S.engOff ? 0 : 1) : 0;
    const shake = idle * (S.v < 0.3 ? 0.0028 : 0.0012) * Math.sin(t * 47) + idle * 0.0015 * Math.sin(t * 31.7);
    truck.body.position.set(S.nudge, S.heave + shake, 0);
    truck.body.rotation.set(S.roll + shake * 0.4, 0, S.pitch);
    // 荷台の箱（バネで跳ねる）
    if (S.parcel.group.parent === S.boxHolder) {
      S.bvy -= 9.8 * dt; S.by += S.bvy * dt;
      if (S.by < 0) {
        if (S.bvy < -0.45) { core.au.thud(clamp(-S.bvy * 0.12, 0.05, 0.3)); if (Math.random() < 0.6) this._rolling(); }
        S.by = 0; S.bvy = S.bvy < -0.45 ? -S.bvy * 0.25 : 0;
      }
      S.brx *= Math.exp(-dt * 5); S.brz *= Math.exp(-dt * 5);
      S.boxHolder.position.y = S.by; S.boxHolder.rotation.set(S.brx * Math.min(1, S.by * 20), 0, S.brz * Math.min(1, S.by * 20));
    } else { S.boxHolder.position.y = 0; S.boxHolder.rotation.set(0, 0, 0); }
  },
  _rolling() {
    const has = (core.state.parcel.items || []).includes('mikan');
    if (has) for (let i = 0; i < 4; i++) core.au.tone({ f: 300 + Math.random() * 120, dur: 0.05, type: 'triangle', g: 0.05, at: 0.03 + i * 0.06 });
    else core.au.noise({ dur: 0.12, g: 0.05, f: 2400, q: 1 });
  },

  _sounds(dt) {
    if (!S.eng) return;
    const v = S.v, k = v / VMAX, dk = S.dk, on = !S.engOff;
    const hold = S.stage === 'drive' && S.holding;
    const g = on ? (0.05 + (hold ? 0.04 : 0) + k * 0.035) : 0;
    const f = (320 + v * 120 + (hold ? 260 : 0)) * (1 - 0.5 * dk);
    S.eng.set({ g, f, pitch: 38 + v * 10 + (hold ? 10 : 0) }, hold ? 0.04 : 0.15);
    S.eng2.set({ g: on ? dk * (0.035 + k * 0.03) : 0, f: f * 0.7, pitch: (38 + v * 10 + (hold ? 10 : 0)) * 1.013 }, 0.25);
    const bump = S.x > BUMP0 && S.x < BUMP1 ? 2.2 : 1, bridge = S.x > BR0 && S.x < BR1 ? 1.4 : 1;
    S.wind.set({ g: k * k * 0.06 * (1 - dk * 0.6), f: 700 + v * 90 }, 0.2);
    S.road.set({ g: k * 0.05 * bump * bridge * (1 + dk * 0.6), f: 220 + v * 25 + (bump > 1 ? 200 : 0) }, 0.15);
  },

  _tunnel(dt, t) {
    const cx = this.camera.position.x;
    const dk = sm(TUN0 - 0.5, TUN0 + 6, cx) * (1 - sm(TUN1 - 6, TUN1 + 1, cx));
    S.dk = dk;
    core.renderer.toneMappingExposure = 1 - 0.35 * dk;
    if (Math.abs(dk - (S._envK ?? -1)) > 0.01) {
      S._envK = dk;
      if (!S._envMats) { S._envMats = new Map(); this.scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !S._envMats.has(o.material)) S._envMats.set(o.material, o.material.envMapIntensity); }); }
      for (const [m, b] of S._envMats) m.envMapIntensity = b * (1 - 0.88 * dk);
    }
    S.sun.intensity = 2.7 * (1 - dk * 0.97); S.hemi.intensity = 1.0 * (1 - dk * 0.85);
    const fog = this.scene.fog; fog.color.set(0xdfe6ea).lerp(_c2.set(0x17130f), dk); fog.near = lerp(45, 6, dk); fog.far = lerp(175, 48, dk);
    this.scene.background.copy(fog.color);
    const tx = S.truck.group.position.x;
    const inT = S.stage === 'drive' && tx > TUN0 - 2 && tx < TUN1 + 1;
    const stopped = S.stage === 'drive' && S.stopT > 0.6;
    S.truck.setHeadlights(Math.max(inT ? 1 : 0, stopped ? 0.55 : 0, dk));
    S.head.intensity = lerp(S.head.intensity, inT ? 60 : 0, 1 - Math.exp(-dt * 6));
    // 天井の照明が流れる
    if (dk > 0.01) {
      const bx = tx - 0.7, lx = Math.round((bx - TUN0 - 2) / 4) * 4 + TUN0 + 2;
      S.tunL.position.set(lx, 5.0, laneZ(tx));
      S.tunL.intensity = dk * 14 * (0.35 + 0.65 * Math.max(0, 1 - Math.abs(bx - lx) / 2.2));
    } else S.tunL.intensity = 0;
    S.exitM.opacity = clamp((tx - TUN0 + 2) / 6, 0, 1) * (1 - sm(TUN1 - 4, TUN1 + 1, cx));
  },

  _spawnLeaf(p, v, col) {
    const L = S.leaves; let i = L.findIndex(l => !l.on); if (i < 0) i = (Math.random() * L.length) | 0;
    const l = L[i]; l.on = true; l.gnd = false; l.p.copy(p); l.v.copy(v); l.life = 6 + Math.random() * 3;
    l.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); l.w.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    const cs = ['#c4321a', '#d4551e', '#e0a628', '#eac232', '#a8281a'];
    S.leafIM.setColorAt(i, _c2.set(col || cs[(Math.random() * cs.length) | 0]));
    S.leafIM.instanceColor.needsUpdate = true;
  },
  _leaves(dt, t) {
    const tx = S.truck.group.position.x;
    if (S.stage === 'drive' && tx > AV0 - 12 && tx < AV1 + 2) {
      S.leafSpawn += dt * (core.low ? 3 : 6);
      while (S.leafSpawn > 1) { S.leafSpawn -= 1; this._spawnLeaf(_v.set(tx - 2 + Math.random() * 22, 4.5 + Math.random() * 3, (Math.random() - 0.5) * 11), _v2.set(0.3, -0.5, 0.2)); }
    } else if (S.stage !== 'drive' && Math.random() < dt * 0.6) {
      this._spawnLeaf(_v.set(305 + Math.random() * 6, 4 + Math.random() * 2, 4.5 + Math.random() * 3), _v2.set(-0.2, -0.4, -0.1));
    }
    const m4 = _lm, q = _lq, e = _le;
    const L = S.leaves; let any = false;
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; if (!l.on) continue; any = true;
      l.life -= dt;
      if (l.life <= 0 || Math.abs(l.p.x - tx) > 40) { l.on = false; S.leafIM.setMatrixAt(i, S.zero); continue; }
      if (!l.gnd) {
        l.v.y = Math.max(l.v.y - 4 * dt, -0.75 + Math.sin(t * 3 + l.ph) * 0.25);
        l.v.x += (Math.sin(t * 1.3 + l.ph) * 0.8 - l.v.x * 0.6) * dt; l.v.z += (Math.cos(t * 1.7 + l.ph) * 0.6 - l.v.z * 0.6) * dt;
        l.p.addScaledVector(l.v, dt); l.r.addScaledVector(l.w, dt);
        const gy = groundY(l.p.x, l.p.z) + 0.03; const floorY = Math.abs(l.p.z) < 3.0 && !(l.p.x > BR0 && l.p.x < BR1) ? 0.035 : gy;
        if (l.p.y < floorY) { l.p.y = floorY; l.gnd = true; l.life = Math.min(l.life, 2.5); l.r.set(-Math.PI / 2, l.r.y, 0); }
      }
      const s = l.gnd ? Math.min(1, l.life / 0.6) : 1;
      m4.compose(l.p, q.setFromEuler(e.set(l.r.x, l.r.y, l.r.z)), _vs.set(s, s, s));
      S.leafIM.setMatrixAt(i, m4);
    }
    if (any || S._leafAny) S.leafIM.instanceMatrix.needsUpdate = true;
    S._leafAny = any;
  },

  _maple(dt) {
    const pst = core.state.parcel;
    if (S.stage === 'drive' && !pst.leaf && S.mapleT < 0 && S.x >= MAPLE_X) {
      S.mapleT = 0; S.boxHolder.add(S.maple); S.maple.visible = true;
      core.au.rustle();
    }
    if (S.mapleT < 0) return;
    S.mapleT += dt;
    const D = 2.6, k = Math.min(1, S.mapleT / D), e = 1 - Math.pow(1 - k, 1.6);
    const tx = 0.112, tz = 0.068, ty = PARCEL.H + 0.008;
    const sx = 1.6, sy = 3.0, sz = 0.9;
    const m = S.maple;
    m.position.set(lerp(sx, tx, e) + Math.sin(k * 11) * 0.25 * (1 - k), lerp(sy, ty, k * k * 0.25 + e * 0.75), lerp(sz, tz, e) + Math.cos(k * 9) * 0.2 * (1 - k));
    m.rotation.set(lerp(0.6 + Math.sin(k * 13) * 1.1, -Math.PI / 2, e), lerp(0, 0.55, e) + (1 - k) * k * 6, Math.sin(k * 8) * 0.6 * (1 - k));
    if (k >= 1) {
      S.mapleT = -1; S.maple.removeFromParent(); S.maple.visible = false;
      S.parcel.setLeaf(true); core.state.parcel.leaf = true; core.save();
      if (S.parcel.leafMesh) { S.parcel.leafMesh.castShadow = true; core.fx.squash(S.parcel.leafMesh, { amt: 0.3, dur: 0.3 }); }
      core.au.peta(0.5);
      core.fx.burst(S.parcel.top.localToWorld(_v.set(tx, 0.02, tz)), { n: 6, kind: 'star', colors: [0xffe9a0, 0xffffff], size: 0.03, speed: 0.4, life: 0.6 });
    }
  },

  _dots(dt, t) {
    const show = S.stage === 'drive' && S.stopT > 0.5 && !S.holding && S.x < END - 3;
    S.dotA = lerp(S.dotA, show ? 1 : 0, 1 - Math.exp(-dt * (show ? 2.5 : 8)));
    if (S.dotA < 0.01) { if (S._dotVis) { for (let i = 0; i < S.DOT_N; i++) S.dots.setMatrixAt(i, S.zero); S.dots.instanceMatrix.needsUpdate = true; S._dotVis = false; } return; }
    S._dotVis = true;
    S.dotPh = (S.dotPh + dt * 0.9) % 1;
    const N = S.DOT_N, gap = 1.45, x0 = S.x + 2.3;
    for (let i = 0; i < N; i++) {
      const f = (i + S.dotPh) / N, x = x0 + (i + S.dotPh) * gap;
      if (x > END + 1) { S.dots.setMatrixAt(i, S.zero); continue; }
      const fade = Math.min(1, f * 5) * Math.min(1, (1 - f) * 3);
      const b = S.dotA * fade * (0.55 + 0.45 * Math.sin(t * 4 - i * 0.8)) * 0.9;
      const s = 0.8 + 0.3 * fade;
      _lm.compose(_v.set(x, 0.05 + (x > BR0 && x < BR1 ? 0 : 0), laneZ(x)), _lq.identity(), _vs.set(s, 1, s));
      S.dots.setMatrixAt(i, _lm); S.dots.setColorAt(i, _c2.setRGB(b, b * 0.94, b * 0.72));
    }
    S.dots.instanceMatrix.needsUpdate = true; S.dots.instanceColor.needsUpdate = true;
  },

  _pilesUpd() {
    const p = S.piles; if (!p) return;
    p.forEach((q, i) => {
      const f = q.flat;
      _lm.compose(_v.set(q.x, 0.02, q.z), _lq.setFromEuler(_le.set(0, i * 1.7, 0)), _vs.set(1 + f * 0.5, 1 - f * 0.7, 1 + f * 0.45));
      S.pilesIM.setMatrixAt(i, _lm);
    });
    S.pilesIM.instanceMatrix.needsUpdate = true;
  },

  _susuki(dt, t) {
    const sus = S.sus; if (!sus) return;
    const tx = S.truck.group.position.x, near = tx > 234 && tx < 302;
    if (!near && !sus.dirty) return;
    sus.dirty = near;
    for (let i = 0; i < sus.list.length; i++) {
      const s = sus.list[i];
      const d = s.x - tx, prox = Math.exp(-(d * d) / 6) * (S.v / VMAX);
      s.sw = lerp(s.sw, prox, 1 - Math.exp(-dt * 4));
      const ang = 0.05 * Math.sin(t * 1.3 + s.ph) + s.sw * 0.35 * (0.6 + 0.4 * Math.sin(t * 9 + s.ph));
      _lm.compose(_v.set(s.x, s.y, s.z), _lq.setFromEuler(_le.set(0, s.ry, 0)), _vs.set(s.s, s.s, s.s));
      _lm2.makeRotationZ(-ang); _lm.multiply(_lm3.makeRotationY(-s.ry)).multiply(_lm2).multiply(_lm3.makeRotationY(s.ry));
      sus.im.setMatrixAt(i, _lm);
    }
    sus.im.instanceMatrix.needsUpdate = true;
  },
};
const _lm = new THREE.Matrix4(), _lm2 = new THREE.Matrix4(), _lm3 = new THREE.Matrix4(), _lq = new THREE.Quaternion(), _le = new THREE.Euler();

// すすき（道ばた。通ると揺れる）
function buildSusuki(scene) {
  const parts = [], r = core.rng(31);
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.28, len = 0.8 + r() * 0.6, lean = 0.25 + r() * 0.5, segs = 4, pos = [];
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs, w0 = 0.022 * (1 - t0), w1 = 0.022 * (1 - t1);
      const p = t => [Math.cos(a) * lean * t * t * len, len * t * (1 - 0.15 * t), Math.sin(a) * lean * t * t * len];
      const P0 = p(t0), P1 = p(t1), ox = -Math.sin(a), oz = Math.cos(a);
      const A = [P0[0] - ox * w0, P0[1], P0[2] - oz * w0], Bq = [P0[0] + ox * w0, P0[1], P0[2] + oz * w0], C = [P1[0] + ox * w1, P1[1], P1[2] + oz * w1], D = [P1[0] - ox * w1, P1[1], P1[2] - oz * w1];
      pos.push(...A, ...Bq, ...C, ...A, ...C, ...D);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    parts.push(paint(prep(g), r() < 0.5 ? '#9a965a' : '#b2a46a'));
  }
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28, h = 1.25 + r() * 0.35, lx = Math.cos(a) * 0.12, lz = Math.sin(a) * 0.12;
    const stem = cyl(0.006, 0.008, h, 4).translate(0, h / 2, 0).rotateZ(-lx).rotateX(lz);
    parts.push(paint(prep(stem), '#a99a62'));
    const plume = new THREE.SphereGeometry(0.05, 6, 6).scale(0.8, 4.2, 0.8).rotateZ(-0.5 - r() * 0.3).translate(lx * h + 0.08, h + 0.1, lz * h);
    parts.push(paint(prep(plume), '#eadfcb'));
  }
  const geo = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  const list = [];
  for (let x = 237; x < 299; x += 1.7 + hash3(x, 1, 1) * 1.5) {
    const s = hash3(x, 2, 2) > 0.5 ? 1 : -1;
    if (s > 0 && x > 283) continue;
    list.push({ x, z: s * (3.25 + hash3(x, 3, 3) * 0.9), y: 0, s: 0.85 + hash3(x, 4, 4) * 0.35, ry: hash3(x, 5, 5) * 6.28, ph: hash3(x, 6, 6) * 6.28, sw: 0 });
  }
  const im = new THREE.InstancedMesh(geo, M.grass, list.length); im.frustumCulled = false; im.receiveShadow = true;
  list.forEach((s, i) => { _lm.compose(_v.set(s.x, s.y, s.z), _lq.setFromEuler(_le.set(0, s.ry, 0)), _vs.set(s.s, s.s, s.s)); im.setMatrixAt(i, _lm); });
  scene.add(im);
  return { im, list, dirty: true };
}

export default trip;
