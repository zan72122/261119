// scene_home.js — 場面3: おばあちゃんの家の和室。小包をひらいて、中身をおばあちゃんに手わたす
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { core } from './core.js';
import { createParcel, PARCEL, STICKER_SIZE, TAPE_W, stickerTexture } from './parcel.js';
import { createItem, packPose, drawingTexture } from './items.js';
import { createTruck } from './truck.js';
import { createGrandma } from './grandma.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = core.clamp, lerp = core.lerp;
const au = core.au, fx = core.fx;

// ---------------------------------------------------------------- 配置
const WZ = -0.62;                                   // 奥の壁の面
const TB = { x: 0, z: 0.62, y: 0.33, r: 0.45 };     // ちゃぶ台
const BOX = V(-0.03, TB.y, 0.80);                  // 小包（底面中心）
const BOWL = V(0.25, TB.y, 0.40);                  // 菓子鉢
const CUP = V(-0.27, TB.y, 0.42);                  // 湯のみ
const CLOCK = V(-0.02, 1.37, WZ);                  // 掛け時計（中心）
const WALL_SPOT = V(0.38, 1.13, WZ + 0.006);       // 絵を貼る場所
const WALL_RECT = { x0: 0.26, x1: 0.56, y0: 1.0, y1: 1.42 };
const WIN = { x0: -1.62, x1: -0.84, y1: 1.78 };     // 掃き出し窓（開いている）
const SHOJI = { x0: -0.72, x1: -0.27, y0: 0.42, y1: 1.7 };
const TRUCK_POS = V(-1.5, -0.32, -5.2);
const PACK_UP = 0.09;                               // 箱の中の詰め紙の厚み（中身を少し持ち上げて見せる）
const FLAP_OPEN = 1.22;
const { W: PW, D: PD, H: PH } = PARCEL;
const FLAP_ORDER = ['F', 'B', 'L', 'R'];
const SPOT_MAIN = 'cheekL';
const DIR = V(0, 0.7, 1).normalize();               // 注視点→カメラ
const ELEV = Math.atan2(0.7, 1);
const EVE = { shoji: new THREE.Color(0xffb067), sun: new THREE.Color(0xffb27e), sky: new THREE.Color(0xffb88a) };

// 段階ごとの構図（縦長は幅 w、横長は高さ h が効く）
const FR = {
  A: { c: V(0, 0.8, 0.36), w: 0.84, h: 1.4 },
  C: { c: V(0, 0.84, 0.3), w: 0.94, h: 1.55 },
  W: { c: V(0.1, 0.9, 0.12), w: 1.0, h: 1.6, d: V(0, 0.85, 1).normalize() },
  S: { c: V(0, 0.66, 0.42), w: 0.64, h: 1.05 },
  T: { c: V(-0.52, 0.86, -0.3), w: 1.56, h: 1.75, d: V(0, 0.3, 1).normalize(), cp: V(-0.74, 0.86, -0.3), wp: 1.8, dp: V(0, 0.17, 1).normalize() },
};

// テープの玉の置き場所（ちゃぶ台の上）
const BALL_SLOTS = (() => {
  const s = [], ring = [[0.36, [0.72, 1.0, 1.28, 1.56]], [0.37, [-0.82, -1.1, -1.38]], [0.25, [1.0, 1.35, -1.25]], [0.3, [1.85, -1.65]]];
  for (const [r, as] of ring) for (const a of as) s.push([TB.x + Math.sin(a) * r, TB.z + Math.cos(a) * r]);
  return s;
})();

// ---------------------------------------------------------------- 音
const snd = {
  koron(p = 1) { au.tone({ f: 760 * p, f2: 520 * p, dur: 0.09, type: 'triangle', g: 0.16 }); au.tone({ f: 600 * p, f2: 430 * p, dur: 0.1, type: 'triangle', g: 0.11, at: 0.11 }); },
  biri() { au.noise({ dur: 0.18, g: 0.38, f: 3400, f2: 1300, q: 0.9 }); au.noise({ dur: 0.06, g: 0.25, f: 5200, q: 1.5, at: 0.05 }); },
  crackle(g = 0.14) { au.noise({ dur: 0.022, g, f: 2600 + Math.random() * 1800, q: 2.2 }); },
  paka() { au.tone({ f: 330, f2: 190, dur: 0.12, type: 'triangle', g: 0.32 }); au.noise({ dur: 0.08, g: 0.2, f: 900, q: 0.8 }); au.whoosh(0.5); },
  peri() { au.noise({ dur: 0.12, g: 0.22, f: 4600, f2: 2400, q: 1.2, a: 0.01 }); },
  giggle() { au.bell(86, { g: 0.13, dur: 0.35 }); au.bell(83, { at: 0.11, g: 0.12, dur: 0.35 }); au.bell(79, { at: 0.22, g: 0.12, dur: 0.5 }); },
  fufu() { au.bell(76, { g: 0.1, dur: 0.4 }); au.bell(79, { at: 0.14, g: 0.1, dur: 0.5 }); },
  bong() { au.tone({ f: 196, dur: 2.4, g: 0.26, a: 0.004 }); au.tone({ f: 393.5, dur: 1.6, g: 0.1, a: 0.004 }); au.tone({ f: 588, dur: 1.0, g: 0.05, a: 0.004 }); au.knock(0.7); },
  horn() { for (const [at, d] of [[0, 0.13], [0.2, 0.38]]) { au.tone({ f: 415, dur: d, type: 'square', g: 0.07, a: 0.01, at }); au.tone({ f: 523, dur: d, type: 'square', g: 0.06, a: 0.01, at }); } },
  sniff() { au.noise({ dur: 0.14, g: 0.12, f: 1500, q: 0.7, type: 'lowpass', a: 0.05 }); au.noise({ dur: 0.16, g: 0.12, f: 1500, q: 0.7, type: 'lowpass', a: 0.05, at: 0.22 }); },
};

// ---------------------------------------------------------------- テクスチャ
function tatamiTex() {
  return core.tex.canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#bdb27a'; g.fillRect(0, 0, w, h);
    const r = core.rng(9);
    for (let y = 0; y < h; y += 3) { g.fillStyle = (y / 3) % 2 ? 'rgba(95,82,30,0.11)' : 'rgba(255,248,200,0.10)'; g.fillRect(0, y, w, 1.6); }
    for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? `rgba(80,68,25,${r() * 0.1})` : `rgba(245,235,175,${r() * 0.1})`; g.fillRect(r() * w, r() * h, 2 + r() * 30, 1); }
    for (let x = 14; x < w - 14; x += (w - 28) / 10) { g.fillStyle = 'rgba(80,70,30,0.14)'; g.fillRect(x, 0, 1, h); }
    g.fillStyle = 'rgba(70,90,40,0.12)'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2c3427'; g.fillRect(0, 0, 13, h); g.fillRect(w - 13, 0, 13, h);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(3, 0, 2, h); g.fillRect(w - 10, 0, 2, h);
    g.fillStyle = 'rgba(60,50,20,0.4)'; g.fillRect(0, 0, w, 2);
    core.tex.grain(g, w, h, 0.03, 4);
  }, { repeat: [1, 1] });
}
function shojiTex() {
  return core.tex.canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#f6f1e4'; g.fillRect(0, 0, w, h);
    const r = core.rng(12);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(150,130,100,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1); }
    g.fillStyle = '#9c7e58';
    const cols = 3, rows = 6, b = 14;
    for (let i = 1; i < cols; i++) g.fillRect(b + i * (w - 2 * b) / cols - 2.5, 0, 5, h);
    for (let j = 1; j < rows; j++) g.fillRect(0, b + j * (h - 2 * b) / rows - 2.5, w, 5);
    g.fillStyle = '#7d6142'; g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
  });
}
function clockFaceTex() {
  return core.tex.canvas(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#efe6d0'; g.beginPath(); g.arc(c, c, c, 0, 6.3); g.fill();
    g.strokeStyle = '#b39c6d'; g.lineWidth = 5; g.beginPath(); g.arc(c, c, c - 8, 0, 6.3); g.stroke();
    g.fillStyle = '#3a2d20';
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, R = c - 22, s = i % 5 ? 2.2 : 5.5; g.beginPath(); g.arc(c + Math.sin(a) * R, c - Math.cos(a) * R, s, 0, 6.3); g.fill(); }
    g.lineCap = 'round'; g.strokeStyle = '#2a2018';
    const hand = (a, L, wd) => { g.lineWidth = wd; g.beginPath(); g.moveTo(c - Math.sin(a) * 12, c + Math.cos(a) * 12); g.lineTo(c + Math.sin(a) * L, c - Math.cos(a) * L); g.stroke(); };
    hand((3 + 10 / 60) / 12 * Math.PI * 2, 58, 8); hand(10 / 60 * Math.PI * 2, 88, 5);
    g.fillStyle = '#2a2018'; g.beginPath(); g.arc(c, c, 8, 0, 6.3); g.fill();
  });
}
function skyTex() {
  return core.tex.canvas(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9cc3e6'); gr.addColorStop(0.6, '#d6e4ec'); gr.addColorStop(1, '#f2e2c4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function washiTex() {
  return core.tex.canvas(64, 32, (g, w, h) => {
    g.fillStyle = '#f3dfa0'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(230,140,120,0.55)';
    for (let x = -h; x < w; x += 12) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 5, h); g.lineTo(x + 5 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    core.tex.grain(g, w, h, 0.05, 3);
  });
}

// UV をワールド寸法に合わせる
function uvScale(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function plane(w, h, x, y, z, tile = 0.7) { const g = new THREE.PlaneGeometry(w, h); uvScale(g, w / tile, h / tile); g.translate(x, y, z); return g; }
const std = (o) => { const { env, ...rest } = o; const m = new THREE.MeshStandardMaterial(rest); if (env !== undefined) m.envMapIntensity = env; return m; };
function mesh(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }

// くしゃっと丸めたテープの玉
function crumpleGeo(seed) {
  const g = new THREE.IcosahedronGeometry(0.017, 2), p = g.attributes.position, r = core.rng(seed), v = V();
  const bumps = []; for (let i = 0; i < 9; i++) bumps.push([V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), (r() - 0.4) * 0.45]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const n = v.clone().normalize(); let k = 1;
    for (const [d, a] of bumps) k += a * Math.max(0, n.dot(d)) ** 3;
    v.multiplyScalar(k * (0.92 + r() * 0.1)); v.y *= 0.85; p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}

// 箱の中の詰め紙（くしゃっとした薄紙）
function paperGeo() {
  const g = new THREE.PlaneGeometry(PW - 0.012, PD - 0.012, 18, 13); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, r = core.rng(23);
  const folds = []; for (let i = 0; i < 7; i++) folds.push([r() * 6.28, (r() - 0.5) * 0.3, (r() - 0.5) * 0.008]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); let y = 0;
    for (const [a, o, h] of folds) y += h * Math.cos((x * Math.cos(a) + z * Math.sin(a) + o) * 60);
    const ex = Math.abs(x) / (PW / 2), ez = Math.abs(z) / (PD / 2);
    y += 0.012 * Math.pow(Math.max(ex, ez), 6) + (r() - 0.5) * 0.003;
    p.setY(i, y);
  }
  g.computeVertexNormals(); return g;
}

// ======================================================================
const R = {};          // 場面の参照と状態
let gm = null, cam = null, scene = null;
const _v = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _s = {}, _s2 = {};

function S() { return core.state.parcel; }
function Hs() {
  const h = core.state.home;
  if (!h.given || typeof h.given !== 'object') h.given = {};
  if (!h.face || typeof h.face !== 'object') h.face = {};
  if (typeof h.tapeBalls !== 'number') h.tapeBalls = 0;
  return h;
}
const say = {
  expr(e) { try { gm.setExpression(e); } catch (er) { /* noop */ } },
  arms(a) { try { gm.setArms(a); } catch (er) { /* noop */ } },
};

export default {
  id: 'home',

  // ================================================================ init
  init() {
    scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x30261c);
    scene.environment = core.env;
    cam = this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);

    // ---- 光 ----
    const sun = R.sun = new THREE.DirectionalLight(0xffe2c0, 2.3);
    sun.position.set(-1.7, 2.7, 1.2); sun.target.position.set(0, 0.4, 0.4);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -1.1; sc.right = 1.1; sc.top = 1.2; sc.bottom = -1.0; sc.near = 0.5; sc.far = 7;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    R.fill = new THREE.HemisphereLight(0xfff1dc, 0x6b5238, 0.35); scene.add(R.fill);
    R.boxLight = new THREE.PointLight(0xffc27a, 0, 0.9, 2); scene.add(R.boxLight);

    // ---- 材質 ----
    const tat = tatamiTex(); tat.repeat.set(8 / 0.9, 8 / 1.8);
    const M = R.M = {
      tatami: std({ map: tat, roughness: 0.85, env: 0.5 }),
      wall: std({ map: core.tex.mottled({ w: 512, h: 512, base: '#c6b086', spots: 1400, alpha: 0.035, grain: 0.09, seed: 8, repeat: [1, 1] }), roughness: 0.95, env: 0.45 }),
      wood: std({ map: core.tex.wood({ base: '#6a4628', dark: '#38220f', light: '#8d6640', seed: 5 }), roughness: 0.55, env: 0.5 }),
      lacq: std({ map: core.tex.wood({ base: '#5a3418', dark: '#2c1608', light: '#7a4a26', seed: 9 }), roughness: 0.32, env: 0.6 }),
      shoji: std({ map: shojiTex(), roughness: 0.9, emissive: 0xfff0d6, emissiveIntensity: 0.62, env: 0.3 }),
      ceil: std({ color: 0xa88560, emissive: 0x3a2a1a, roughness: 0.8, env: 0.5 }),
    };
    M.shoji.emissiveMap = M.shoji.map;
    const woodGeos = [];

    // 床
    tat.repeat.set(6 / 0.9, 4 / 1.8);
    const floor = mesh(new THREE.PlaneGeometry(6, 4), M.tatami, false, true);
    floor.rotation.x = -Math.PI / 2; floor.position.set(-0.3, 0, WZ + 2); scene.add(floor);
    // 奥の壁（窓の穴あき）
    const wallGeos = [
      plane(2.6, 2.6, WIN.x0 - 1.3, 1.3, WZ),
      plane(WIN.x1 - WIN.x0, 2.6 - WIN.y1, (WIN.x0 + WIN.x1) / 2, (WIN.y1 + 2.6) / 2, WZ),
      plane(4.0, 2.6, WIN.x1 + 2.0, 1.3, WZ),
    ];
    const sideL = plane(4, 2.6, 0, 1.3, 0); sideL.rotateY(Math.PI / 2); sideL.translate(-3.2, 0, 1.4);
    const sideR = plane(4, 2.6, 0, 1.3, 0); sideR.rotateY(-Math.PI / 2); sideR.translate(2.6, 0, 1.4);
    wallGeos.push(sideL, sideR);
    scene.add(mesh(mergeGeometries(wallGeos), M.wall, false, true));
    const ceil = mesh(new THREE.PlaneGeometry(8, 8), M.ceil, false, false); ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.45; scene.add(ceil);
    // 柱・長押・畳寄せ・窓枠・障子枠
    for (const x of [WIN.x0 - 0.05, WIN.x1 + 0.03, 1.32]) woodGeos.push(box(0.1, 2.45, 0.1, x, 1.225, WZ + 0.03));
    woodGeos.push(box(5.6, 0.085, 0.05, 0, 1.86, WZ + 0.03));             // 長押
    woodGeos.push(box(5.6, 0.035, 0.02, 0, 0.0175, WZ + 0.01));           // 畳寄せ
    woodGeos.push(box(WIN.x1 - WIN.x0, 0.06, 0.12, (WIN.x0 + WIN.x1) / 2, WIN.y1 + 0.03, WZ));  // 鴨居
    woodGeos.push(box(WIN.x1 - WIN.x0, 0.03, 0.14, (WIN.x0 + WIN.x1) / 2, 0.015, WZ));         // 敷居
    const sx = (SHOJI.x0 + SHOJI.x1) / 2, sw = SHOJI.x1 - SHOJI.x0, shh = SHOJI.y1 - SHOJI.y0;
    woodGeos.push(box(sw + 0.08, 0.05, 0.06, sx, SHOJI.y1 + 0.025, WZ + 0.02), box(sw + 0.08, 0.05, 0.08, sx, SHOJI.y0 - 0.025, WZ + 0.03));
    woodGeos.push(box(0.04, shh, 0.05, SHOJI.x0 - 0.02, (SHOJI.y0 + SHOJI.y1) / 2, WZ + 0.02), box(0.04, shh, 0.05, SHOJI.x1 + 0.02, (SHOJI.y0 + SHOJI.y1) / 2, WZ + 0.02));
    // 開いたガラス戸（窓の脇に寄せてある）
    woodGeos.push(box(0.035, WIN.y1, 0.03, WIN.x0 + 0.02, WIN.y1 / 2, WZ - 0.04), box(0.035, WIN.y1, 0.03, WIN.x0 + 0.3, WIN.y1 / 2, WZ - 0.04));
    const shoji = R.shoji = mesh(new THREE.PlaneGeometry(sw, shh), M.shoji, false, false);
    shoji.position.set(sx, (SHOJI.y0 + SHOJI.y1) / 2, WZ + 0.012); scene.add(shoji);

    // ---- ちゃぶ台 ----
    {
      const top = new THREE.CylinderGeometry(TB.r, TB.r, 0.028, 64); top.translate(TB.x, TB.y - 0.014, TB.z);
      const apron = new THREE.CylinderGeometry(TB.r - 0.06, TB.r - 0.06, 0.04, 40, 1, true); apron.translate(TB.x, TB.y - 0.048, TB.z);
      const legs = [];
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; legs.push(box(0.045, TB.y - 0.03, 0.045, TB.x + Math.sin(a) * 0.28, (TB.y - 0.03) / 2, TB.z + Math.cos(a) * 0.28)); }
      for (const g of [apron, ...legs]) { if (g.index) continue; }
      const t = mesh(top, M.lacq); scene.add(t);
      const lg = mesh(mergeGeometries([apron.toNonIndexed(), ...legs.map(g => g.toNonIndexed())]), M.lacq); scene.add(lg);
    }
    // ---- 湯のみ（茶托・湯気） ----
    {
      const prof = [[0, 0], [0.026, 0], [0.028, 0.004], [0.03, 0.01], [0.034, 0.05], [0.036, 0.082], [0.033, 0.083], [0.031, 0.05], [0.027, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
      const cupG = new THREE.LatheGeometry(prof, 40);
      const cup = R.cup = new THREE.Group(); cup.position.copy(CUP).add(V(0, 0.008, 0));
      cup.add(mesh(cupG, std({ color: 0x5f7d6a, roughness: 0.22, env: 0.8 })));
      const tea = mesh(new THREE.CircleGeometry(0.031, 32), std({ color: 0x8f8a33, roughness: 0.1 }), false, false); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.068; cup.add(tea);
      const saucer = mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.008, 40), M.lacq); saucer.position.copy(CUP).add(V(0, 0.004, 0));
      scene.add(cup, saucer);
      cup.userData.hitR = 0.07; cup.userData.hitOffset = V(0, 0.04, 0);
      const stTex = core.tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
      R.steam = [];
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: stTex, transparent: true, opacity: 0, depthWrite: false }));
        s.renderOrder = 3; scene.add(s); R.steam.push({ s, ph: i / 3 });
      }
      R.steamBoost = 0;
    }
    // ---- 菓子鉢 ----
    {
      const prof = [[0, 0], [0.045, 0], [0.05, 0.006], [0.085, 0.03], [0.112, 0.058], [0.116, 0.062], [0.11, 0.062], [0.08, 0.036], [0.045, 0.014], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
      const bowl = mesh(new THREE.LatheGeometry(prof, 48), std({ map: core.tex.wood({ base: '#8a4f24', dark: '#4a2410', light: '#b07040', seed: 13 }), roughness: 0.35, env: 0.6 }));
      bowl.position.copy(BOWL); scene.add(bowl); R.bowl = bowl;
    }
    // ---- 掛け時計 ----
    {
      const c = R.clock = new THREE.Group(); c.position.copy(CLOCK); scene.add(c);
      const caseG = [box(0.27, 0.52, 0.07, 0, -0.05, 0.035), box(0.3, 0.035, 0.08, 0, 0.225, 0.04), box(0.3, 0.035, 0.08, 0, -0.325, 0.04)];
      c.add(mesh(mergeGeometries(caseG), M.lacq));
      const face = mesh(new THREE.CircleGeometry(0.1, 48), std({ map: clockFaceTex(), roughness: 0.4, env: 0.6 }), false, true);
      face.position.set(0, 0.07, 0.0715); c.add(face);
      const ring = mesh(new THREE.TorusGeometry(0.103, 0.007, 8, 48), std({ color: 0xb8913f, metalness: 1, roughness: 0.3 })); ring.position.set(0, 0.07, 0.072); c.add(ring);
      const win = mesh(new THREE.PlaneGeometry(0.19, 0.22), std({ color: 0x241810, roughness: 0.6 }), false, true); win.position.set(0, -0.17, 0.0712); c.add(win);
      const pend = R.pend = new THREE.Group(); pend.position.set(0, -0.07, 0.078); c.add(pend);
      pend.add(mesh(box(0.008, 0.17, 0.004, 0, -0.085, 0), std({ color: 0xb8913f, metalness: 1, roughness: 0.35 }), false, false));
      const bob = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 32), std({ color: 0xd4ab52, metalness: 1, roughness: 0.25 }), false, false);
      bob.rotation.x = Math.PI / 2; bob.position.y = -0.18; pend.add(bob);
      c.userData.hitR = 0.16; c.userData.hitOffset = V(0, -0.03, 0.05);
      R.pendAmp = 0.12;
    }
    // ---- 茶だんすと花びん ----
    {
      const g = new THREE.Group(); g.position.set(0.92, 0, WZ + 0.2); scene.add(g);
      g.add(mesh(mergeGeometries([box(0.56, 0.7, 0.32, 0, 0.35, 0), box(0.6, 0.025, 0.35, 0, 0.71, 0)].map(x => x.toNonIndexed())), M.wood));
      const dark = std({ color: 0x3a2414, roughness: 0.6 });
      g.add(mesh(mergeGeometries([box(0.24, 0.005, 0.005, -0.13, 0.42, 0.162), box(0.24, 0.005, 0.005, 0.13, 0.42, 0.162), box(0.005, 0.38, 0.005, 0, 0.21, 0.162), box(0.5, 0.005, 0.005, 0, 0.58, 0.162)]), dark, false, false));
      const knobs = []; for (const [x, y] of [[-0.06, 0.5], [0.06, 0.5], [-0.05, 0.21], [0.05, 0.21]]) { const k = new THREE.SphereGeometry(0.012, 10, 8); k.translate(x, y, 0.168); knobs.push(k); }
      g.add(mesh(mergeGeometries(knobs), std({ color: 0xb0894a, metalness: 0.9, roughness: 0.35 }), false, false));
      const vp = [[0, 0], [0.045, 0], [0.06, 0.05], [0.055, 0.12], [0.03, 0.2], [0.028, 0.24], [0.038, 0.26], [0.034, 0.262], [0.024, 0.245], [0, 0.24]].map(([x, y]) => new THREE.Vector2(x, y));
      const vase = mesh(new THREE.LatheGeometry(vp, 32), std({ color: 0x2f4c63, roughness: 0.2, env: 0.9 })); vase.position.set(-0.08, 0.72, 0); g.add(vase);
      const stems = [], heads = [], leaves = [], r = core.rng(31);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r(), tilt = 0.18 + r() * 0.25, L = 0.26 + r() * 0.16;
        const tip = V(Math.sin(a) * Math.sin(tilt) * L, Math.cos(tilt) * L + 0.24, Math.cos(a) * Math.sin(tilt) * L * 0.6);
        const curve = new THREE.QuadraticBezierCurve3(V(0, 0.2, 0), V(tip.x * 0.3, 0.32, tip.z * 0.3), tip);
        stems.push(new THREE.TubeGeometry(curve, 6, 0.0025, 4, false).toNonIndexed());
        const hd = new THREE.SphereGeometry(0.022 + r() * 0.008, 10, 7); hd.scale(1, 0.6, 1); hd.translate(tip.x, tip.y, tip.z); heads.push(hd);
        const lf = new THREE.SphereGeometry(0.02, 6, 4); lf.scale(1.4, 0.2, 0.6); lf.rotateY(a); lf.translate(tip.x * 0.55, 0.3 + r() * 0.06, tip.z * 0.55); leaves.push(lf.toNonIndexed());
      }
      const fl = R.flowers = new THREE.Group(); fl.position.copy(vase.position); g.add(fl);
      fl.add(mesh(mergeGeometries([...stems, ...leaves]), std({ color: 0x4f6b2c, roughness: 0.7 })));
      fl.add(mesh(mergeGeometries(heads), std({ color: 0xe7a12a, roughness: 0.75 })));
    }
    // ---- 窓の外（縁側・庭・空） ----
    {
      const out = R.outside = new THREE.Group(); scene.add(out);
      const plank = core.tex.wood({ base: '#9b7650', dark: '#5d4126', light: '#bf9b70', planks: 6, seed: 21, repeat: [1, 1] });
      const eng = mesh(new THREE.PlaneGeometry(3.4, 1.1), std({ map: plank, roughness: 0.7, env: 0.5 }), false, true);
      eng.rotation.x = -Math.PI / 2; eng.position.set(-1.6, -0.02, WZ - 0.55); out.add(eng);
      out.add(mesh(box(3.4, 0.3, 0.06, -1.6, -0.17, WZ - 1.1), M.wood, false, true));
      R.groundMat = std({ map: core.tex.mottled({ base: '#8c8a5c', spots: 600, alpha: 0.12, grain: 0.08, seed: 17, repeat: [6, 6] }), roughness: 0.95, env: 0.4 });
      const ground = mesh(new THREE.PlaneGeometry(30, 20), R.groundMat, false, true); ground.rotation.x = -Math.PI / 2; ground.position.set(-2, -0.32, -9); out.add(ground);
      const hedge = [], tree = [], r = core.rng(5);
      for (let i = 0; i < 14; i++) { const s = new THREE.SphereGeometry(0.45 + r() * 0.3, 12, 8); s.scale(1, 0.75, 0.8); s.translate(-6 + i * 0.75, 0.2 + r() * 0.2, -7.2 - r() * 0.4); hedge.push(s); }
      out.add(mesh(mergeGeometries(hedge), std({ color: 0x3f5a2c, roughness: 0.9, env: 0.5 }), false, true));
      for (let i = 0; i < 9; i++) { const s = new THREE.SphereGeometry(0.5 + r() * 0.35, 12, 8); s.translate(-0.4 + (r() - 0.5) * 1.6, 2.4 + r() * 1.0, -7.8 + (r() - 0.5) * 1.0); tree.push(s); }
      out.add(mesh(mergeGeometries(tree), std({ color: 0xc8501e, roughness: 0.85, env: 0.5 }), false, false));
      out.add(mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.6, 8).translate(-0.4, 1.0, -7.8), std({ color: 0x4a3626, roughness: 0.9 }), false, false));
      R.skyMat = new THREE.MeshBasicMaterial({ map: skyTex() });
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), R.skyMat); sky.position.set(-2, 6, -14); out.add(sky);
    }
    scene.add(mesh(mergeGeometries(woodGeos.map(g => g.toNonIndexed())), M.wood, true, true));

    // ---- おばあちゃん ----
    gm = R.gm = createGrandma();
    scene.add(gm.group);
    gm.onClap = () => au.clap();
    gm.group.userData.hitR = 0.26; gm.group.userData.hitOffset = V(0, 0.6, 0.05);
    gm.group.traverse(o => { if (o.isMesh && o.material && o.material.envMapIntensity !== undefined) o.material.envMapIntensity = 0.75; });

    // ---- 軽トラ ----
    const tr = R.truck = createTruck();
    tr.group.position.copy(TRUCK_POS); tr.group.rotation.y = -Math.PI / 2;
    tr.group.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    tr.group.userData.hitR = 0.9; tr.group.userData.hitOffset = V(0, 0.8, 1.0);
    scene.add(tr.group); tr.group.visible = false;
    R.truckFront = new THREE.Object3D(); R.truckFront.position.set(1.45, 0.85, 0); tr.group.add(R.truckFront);

    // ---- 小物の共有ジオメトリ・材質 ----
    R.ballGeos = [crumpleGeo(3), crumpleGeo(7), crumpleGeo(11)];
    R.ballMat = std({ color: 0xa8743f, roughness: 0.42, env: 0.6 });
    R.ribbonMat = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.4, side: THREE.DoubleSide });
    {
      const N = 16, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
      const idx = []; for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      R.ribbon = new THREE.Mesh(g, R.ribbonMat); R.ribbon.frustumCulled = false; R.ribbon.visible = false; R.ribbon.castShadow = true; R.ribbonN = N;
      scene.add(R.ribbon);
    }
    // 壁に貼った絵（板）＋四隅のマスキングテープ
    {
      const wp = R.wallPic = new THREE.Group(); wp.visible = false; scene.add(wp);
      const pg = new THREE.PlaneGeometry(0.21, 0.15, 6, 4); const pp = pg.attributes.position;
      for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) / 0.105, y = pp.getY(i) / 0.075; pp.setZ(i, 0.002 * (1 - x * x) * (1 - y * y) + 0.003 * Math.max(0, -y) * x * x); }
      pg.computeVertexNormals();
      const pic = mesh(pg, std({ map: drawingTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), false, true);
      wp.add(pic);
      const wt = std({ map: washiTex(), roughness: 0.8, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      R.wallTapes = [];
      for (const [x, y, a] of [[-1, 1, 0.75], [1, 1, -0.75], [-1, -1, -0.75], [1, -1, 0.75]]) {
        const t = mesh(new THREE.PlaneGeometry(0.05, 0.017), wt, false, true); t.position.set(x * 0.098, y * 0.068, 0.004); t.rotation.z = a; wp.add(t); R.wallTapes.push(t);
      }
      wp.userData.hitR = 0.12;
    }
    // 壁の貼り場所の光（やわらかい四角）
    {
      const tex = core.tex.canvas(128, 128, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,240,190,0.9)'); gr.addColorStop(0.55, 'rgba(255,236,170,0.55)'); gr.addColorStop(1, 'rgba(255,230,160,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
      R.spotMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      R.spot = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), R.spotMat); R.spot.position.copy(WALL_SPOT).add(V(0, 0, 0.004)); R.spot.renderOrder = 4; scene.add(R.spot);
      R.spotOn = 0;
    }
    // シールを運ぶときの板
    R.flyGeo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
    R.flyMats = {};
    // ほっぺの光の置き場
    R.cheekHolder = new THREE.Object3D(); scene.add(R.cheekHolder);
    R.holdHolder = new THREE.Object3D(); scene.add(R.holdHolder);
    R.fr = { c: FR.A.c.clone(), w: FR.A.w, h: FR.A.h, d: DIR.clone() };
  },

  // ================================================================ enter
  enter() {
    const P = S(), H = Hs();
    // 片付け
    if (R.parcel) { R.parcel.dispose(); R.parcel = null; }
    for (const it of Object.values(R.items || {})) it.obj.removeFromParent();
    for (const b of R.balls || []) b.removeFromParent();
    if (R.tableLeaf) { R.tableLeaf.removeFromParent(); R.tableLeaf = null; }
    if (R.fly) { R.fly.removeFromParent(); R.fly = null; }
    R.items = {}; R.balls = []; R.fxh = []; R.drag = null; R.lock = false; R.stage = null; R.hintKey = null;
    R.flapOpen = { F: false, B: false, L: false, R: false }; R.bound = false; R.gaze = null; R.gazeT = 0; R.tapLoop = null;
    R.ribbon.visible = false; R.spotOn = 0; R.spotMat.opacity = 0; R.wallPic.visible = false;
    R.lean = 0; R.tilt = 0; R.nod = 0; R.grandmaTap = 0; R.boxLight.intensity = 0; R.truckIn = false; R.blink = false;
    R.truck.group.visible = false; R.truck.setBlink(0);
    this._evening(H.celebrated ? 1 : 0);

    // 小包
    if (P.tapes.length > 0 && !P.closed) P.closed = true;   // テープが残っているのに開いている保存は閉じて扱う
    const parcel = R.parcel = createParcel(P);
    parcel.group.position.copy(BOX); scene.add(parcel.group);
    if (P.closed) { if (P.tapes.length === 0) this._bind(); }
    else { this._bind(); for (const n of FLAP_ORDER) { parcel.setFlap(n, FLAP_OPEN); R.flapOpen[n] = true; } if (H.celebrated) parcel.setFlap('F', 1.0); }
    if (!R.paper) R.paper = mesh(paperGeo(), std({ map: core.tex.mottled({ base: '#ece5d4', spots: 300, alpha: 0.05, seed: 4 }), roughness: 0.9, side: THREE.DoubleSide }), false, true);
    R.paper.position.set(0, PACK_UP - 0.004, 0); parcel.group.add(R.paper);
    parcel.group.userData.hitR = 0.2; parcel.group.userData.hitOffset = V(0, 0.12, 0);
    // フラップの当たり位置
    R.flapAnchors = {};
    const an = { F: V(0, PH, PD / 4), B: V(0, PH, -PD / 4), L: V(-PW / 2 + 0.065, PH, 0), R: V(PW / 2 - 0.065, PH, 0) };
    for (const n of FLAP_ORDER) { const o = new THREE.Object3D(); o.position.copy(an[n]); parcel.group.add(o); o.userData.hitR = n === 'F' || n === 'B' ? 0.08 : 0.06; R.flapAnchors[n] = o; }
    if (H.tape0 === undefined || P.tapes.length > H.tape0) H.tape0 = P.tapes.length;

    // 中身（箱の中）
    for (const k of P.items) {
      if (R.items[k]) continue;
      let obj; try { obj = createItem(k); } catch (e) { continue; }
      const pp = packPose(k); obj.position.copy(pp.pos); obj.position.y += PACK_UP; obj.rotation.set(pp.tiltX || 0, pp.rotY || 0, 0);
      parcel.group.add(obj);
      obj.userData.hitR = k === 'drawing' ? 0.1 : 0.085; obj.userData.hitOffset = V(0, 0.02, 0);
      R.items[k] = { kind: k, obj, where: 'box' };
    }
    // テープの玉
    for (let i = 0; i < Math.min(H.tapeBalls, BALL_SLOTS.length); i++) this._addBall(i, null);
    // ちゃぶ台の葉
    if (H.leaf) this._tableLeaf(H.leaf, false);

    // おばあちゃんの状態
    gm.group.position.set(0, 0, 0); gm.group.rotation.set(0, 0, 0); gm.head.rotation.set(0, 0, 0);
    gm.wearScarf(!!H.given.scarf);
    for (const sp of ['cheekL', 'cheekR', 'forehead']) gm.setFaceSticker(sp, H.face[sp] ? stickerTexture(H.face[sp]) : null);
    say.expr('calm'); say.arms('table');
    // 受け取り済みのもの
    if (H.given.mikan) this._mikanInBowl(null);
    if (H.given.drawing) {
      if (H.wall) this._showWallPic(H.wall.x, H.wall.y, false);
      else {
        const obj = createItem('drawing'); obj.userData.hitR = 0.12;
        R.items.drawing = { kind: 'drawing', obj, where: 'hand' };
        gm.holdPoint.add(obj); this._holdPose('drawing', obj, true);
        say.arms('hold');
      }
    }
    // シールのつかみ
    R.gaze = () => cam.position;

    const st = this._stage();
    const fr = st === 'A' || st === 'B' ? FR.A : st === 'W' ? FR.W : st === 'T' ? FR.T : st === 'D1' ? FR.S : FR.C;
    this._frame(fr, 0);
    if (st === 'T') this._truckShow(false);

    // 導入: 箱を見て、こちらを見て、首をかしげる
    if (st === 'A' || st === 'B') {
      R.gaze = () => _v3.copy(BOX).add(V(0, 0.24, 0));
      R.lock = true;
      core.after(1.3, () => { R.gaze = () => cam.position; });
      core.after(1.9, () => { core.tween(1.4, (k, raw) => { R.tilt = Math.sin(raw * Math.PI) * 0.16; }, { ease: 'linear' }); au.bell(79, { g: 0.08, dur: 0.5 }); });
      core.after(1.1, () => { R.lock = false; this._refresh(); });
    } else this._refresh();
  },

  exit() { R.drag = null; },

  resize() { this._applyFrame(); },

  // ================================================================ 段階
  _stage() {
    const P = S(), H = Hs();
    if (P.tapes.length > 0) return 'A';
    if (P.closed) return 'B';
    if (P.items.length > 0) return 'C';
    if (H.given.drawing && !H.wall) return 'W';
    if (!H.celebrated) return 'D0';
    const hasSt = R.parcel && R.parcel.stickerMeshes.some(m => m.parent === R.parcel.flaps.F.pivot);
    const faced = Object.keys(H.face).length > 0;
    if (hasSt && !faced) return 'D1';
    return 'T';
  },
  _clearCue() {
    for (const h of R.fxh) { try { h.stop ? h.stop() : h.kill(); } catch (e) { /* noop */ } }
    R.fxh = []; R.mainTape = -1; R.mainFlap = null; R.mainItem = null; R.mainSticker = null; R.spotOn = 0; R.cheekHalo = false;
    core.hint.clear();
  },
  // 次にやることの手がかり（光・ヒント）を組み立て直す
  _refresh() {
    if (R.lock) return;
    this._clearCue();
    const st = R.stage = this._stage(), P = S(), parcel = R.parcel;
    if (st === 'A') {
      const i = P.tapes.length - 1; R.mainTape = i;
      R.fxh.push(fx.pulse(parcel.tapeMeshes[i], { color: 0xffe2a0, amp: 0.45 }));
      const ends = () => this._tapeEnds(i);
      core.hint.set({ kind: 'drag', from: () => ends()[0], to: () => ends()[1], arc: 0.02, cue: n => { if (n === 1) this._cueTape(); } });
      R.gaze = () => cam.position;
    } else if (st === 'B') {
      const n = FLAP_ORDER.find(k => !R.flapOpen[k]); R.mainFlap = n;
      R.fxh.push(fx.halo(R.flapAnchors[n], { r: n === 'F' || n === 'B' ? 0.13 : 0.1, y: 0.01, opacity: 0.6 }));
      const out = { F: V(0, 0.05, 0.16), B: V(0, 0.08, -0.16), L: V(-0.15, 0.06, 0), R: V(0.15, 0.06, 0) }[n];
      core.hint.set({ kind: 'drag', from: () => R.flapAnchors[n].getWorldPosition(_v), to: () => R.flapAnchors[n].getWorldPosition(_v2).add(out), cue: c => { if (c === 1) this._cueFlap(); } });
      this._frame(FR.A);
    } else if (st === 'C') {
      const k = ['drawing', 'scarf', 'mikan'].find(x => R.items[x] && R.items[x].where !== 'hand') || Object.keys(R.items).find(x => R.items[x].where !== 'hand');
      if (!k) { this._frame(FR.C); return; }
      R.mainItem = k; const obj = R.items[k].obj;
      R.fxh.push(fx.pulse(obj, { color: 0xffe0a0, amp: k === 'drawing' ? 0.14 : 0.22 }));
      R.fxh.push(fx.halo(gm.holdPoint, { r: 0.11, opacity: 0.35, depthTest: true }));
      core.hint.set({ kind: 'drag', arc: 0.08, from: () => obj.getWorldPosition(_v).add(V(0, 0.03, 0)), to: () => gm.holdPoint.getWorldPosition(_v2), cue: c => { if (c === 1) this._cueGive(); } });
      R.gaze = () => obj.getWorldPosition(_v3);
      this._frame(FR.C);
    } else if (st === 'W') {
      const it = R.items.drawing; if (!it) return;
      R.fxh.push(fx.pulse(it.obj, { color: 0xffe0a0, amp: 0.14 }));
      R.spotOn = 1;
      core.hint.set({ kind: 'drag', arc: 0.05, from: () => it.obj.getWorldPosition(_v), to: () => _v2.copy(WALL_SPOT), cue: c => { if (c === 1) { fx.wobble(it.obj, { amp: 0.08, dur: 0.6, axis: 'z' }); au.pop(1.3); R.gaze = () => WALL_SPOT; core.after(1.2, () => { if (R.stage === 'W' && !R.drag) R.gaze = () => cam.position; }); } } });
      R.gaze = () => cam.position;
      this._frame(FR.W);
    } else if (st === 'D0') {
      this._celebrate();
    } else if (st === 'D1') {
      const ms = this._pickMainSticker(); R.mainSticker = ms;
      this._flapTo('F', 1.0);
      R.fxh.push(fx.pulse(ms, { color: 0xfff0b0, amp: 0.4 }));
      R.fxh.push(fx.halo(R.cheekHolder, { r: 0.05, opacity: 0.55, color: 0xffd0d8 })); R.cheekHalo = true;
      core.hint.set({ kind: 'drag', arc: 0.06, from: () => ms.getWorldPosition(_v), to: () => gm.faceSpotWorld(SPOT_MAIN, _v2), cue: c => { if (c === 1) { fx.wobble(ms, { amp: 0.15, dur: 0.6, axis: 'y' }); snd.fufu(); gm.bounce(); core.tween(1.0, (k, raw) => { R.tilt = -Math.sin(raw * Math.PI) * 0.15; }, { ease: 'linear' }); } } });
      R.gaze = () => cam.position; say.arms('table');
      this._frame(FR.S);
    } else if (st === 'T') {
      this._flapTo('F', 1.0);
      if (!R.truckIn) this._truckShow(true);
      else this._truckCue();
      this._frame(FR.T);
    }
  },
  _truckCue() {
    const tr = R.truck;
    R.fxh.push(fx.halo(R.truckFront, { r: 0.55, opacity: 0.45 }));
    R.blink = true;
    core.hint.set({ kind: 'tap', d1: 9, d2: 18, from: () => R.truckFront.getWorldPosition(_v), cue: c => { if (c === 1) { snd.horn(); } } });
    R.gaze = () => cam.position;
  },
  _truckShow(drive) {
    const tr = R.truck; tr.group.visible = true; R.truckIn = true;
    if (!drive) { tr.group.position.copy(TRUCK_POS); return; }
    R.lock = true; core.hint.clear();
    tr.group.position.copy(TRUCK_POS).add(V(0, 0, -6));
    au.ready(() => { R.eng = au.loop({ kind: 'osc', osc: 'sawtooth', type: 'lowpass', f: 300, pitch: 46 }); R.eng.set({ g: 0.06 }, 0.3); });
    let last = 0;
    core.tween(2.6, (k) => { const z = TRUCK_POS.z - 6 * (1 - k); tr.roll(z - last); last = z; tr.group.position.z = z; }, { ease: 'out', done: () => {
      if (R.eng) { R.eng.set({ g: 0.02, pitch: 38 }, 0.3); const e = R.eng; core.after(2.5, () => e.stop(1.2)); }
      snd.horn(); R.blink = true;
      core.after(0.6, () => { gm.bounce(); R.gaze = () => tr.group.getWorldPosition(_v3).add(V(0, 1, 0)); });
      core.after(1.6, () => { R.gaze = () => cam.position; R.lock = false; this._refresh(); });
    } });
    last = TRUCK_POS.z - 6;
  },

  // ================================================================ 構図
  _frame(f, dur = 1.2) {
    if (R.frTw) { R.frTw.kill(); R.frTw = null; }
    if (!dur) { R.frTarget = f; R.fr.c.copy(f.c); R.fr.w = f.w; R.fr.h = f.h; R.fr.d.copy(f.d || DIR); this._applyFrame(); return; }
    if (R.frTarget === f) return;
    R.frTarget = f;
    const c0 = R.fr.c.clone(), w0 = R.fr.w, h0 = R.fr.h, d0 = R.fr.d.clone(), d1 = (f.d || DIR).clone().normalize();
    R.frTw = core.tween(dur, k => { R.frK = k; R.fr.c.lerpVectors(c0, f.c, k); R.fr.w = lerp(w0, f.w, k); R.fr.h = lerp(h0, f.h, k); R.fr.d.lerpVectors(d0, d1, k).normalize(); this._applyFrame(); }, { ease: 'inout' });
  },
  _applyFrame() {
    if (!cam) return;
    // 縦長で別の中心が指定されている構図（軽トラ）は寄せ先を変える
    const f = R.frTarget, port = core.aspect < 0.8;
    let c = R.fr.c, w = R.fr.w;
    let d = R.fr.d;
    if (port && f && f.cp) { const k = R.frTw ? R.frK || 0 : 1; c = _v.copy(R.fr.c).lerp(f.cp, k); w = lerp(R.fr.w, f.wp, k); d = _v2.copy(R.fr.d).lerp(f.dp, k).normalize(); }
    core.fitCamera(cam, { center: c, w, h: R.fr.h, dir: d, fov: 40, pad: 1.06 });
  },

  // ================================================================ 夕方の光
  _evening(k) {
    R.eve = k;
    R.M.shoji.emissive.setHex(0xfff0d6).lerp(EVE.shoji, k);
    R.sun.color.setHex(0xffe2c0).lerp(EVE.sun, k);
    R.sun.intensity = lerp(2.3, 2.0, k);
    R.skyMat.color.setHex(0xffffff).lerp(EVE.sky, k * 0.8);
  },

  // ================================================================ 小包の補助
  _bind() { if (R.bound || !R.parcel) return; for (const n of FLAP_ORDER) R.parcel.setFlap(n, 0); R.parcel.bindDecorToFlaps(); R.bound = true; },
  _topW(x, z, out = V()) { return out.set(BOX.x + x, BOX.y + PH + 0.006, BOX.z + z); },
  _tapeEnds(i) {
    const s = S().tapes[i] || S().tapes[S().tapes.length - 1]; if (!s) return [_v.copy(BOX), _v2.copy(BOX)];
    // ヒントは手前側の端から
    const a = this._topW(s.x0, s.z0, _v), b = this._topW(s.x1, s.z1, _v2);
    const sa = core.toScreen(a, _s), sb = core.toScreen(b, _s2);
    if (sa.y < sb.y || (Math.abs(sa.y - sb.y) < 4 && sa.x > sb.x)) { _v3.copy(a); a.copy(b); b.copy(_v3); }
    return [a, b];
  },
  _cueTape() {
    const i = R.mainTape, s0 = S().tapes[i]; if (!s0 || R.drag) return;
    const s = { ...s0 }; const ends = this._tapeEnds(i);
    // 手前の端がちょっとめくれる
    const e0 = ends[0].clone();
    const fromA = Math.abs(e0.x - (BOX.x + s.x0)) < 1e-4 && Math.abs(e0.z - (BOX.z + s.z0)) < 1e-4;
    au.rustle(); R.gaze = () => e0;
    core.tween(0.9, (k, raw) => {
      if (R.drag || !S().tapes[i]) return;
      const pr = Math.sin(raw * Math.PI) * 0.1; this._peelShow(s, fromA, pr, null);
    }, { ease: 'linear', done: () => { if (!R.drag && S().tapes[i]) { R.parcel.updateTape(i, s); R.ribbon.visible = false; } R.gaze = () => cam.position; } });
  },
  _cueFlap() {
    const n = R.mainFlap; if (!n || R.drag) return;
    au.knock(1.1);
    core.tween(0.8, (k, raw) => { if (!R.drag && R.mainFlap === n && !R.flapOpen[n]) R.parcel.setFlap(n, Math.sin(raw * Math.PI * 2) ** 2 * 0.12); }, { ease: 'linear' });
  },
  _cueGive() {
    if (R.drag || R.lock) return;
    say.arms('reach'); au.pop(1.1);
    const it = R.items[R.mainItem]; if (it) fx.squash(it.obj, { amt: 0.12, dur: 0.35 });
    core.after(0.5, () => au.pop(1.25));
    core.after(1.4, () => { if (!R.drag && !R.lock && R.stage === 'C') say.arms('table'); });
  },

  // テープをはがした見た目（残りの帯＋めくれた帯）
  _peelShow(s, fromA, pr, finger) {
    const i = S().tapes.length - 1;
    const ax = fromA ? s.x0 : s.x1, az = fromA ? s.z0 : s.z1, bx = fromA ? s.x1 : s.x0, bz = fromA ? s.z1 : s.z0;
    const px = lerp(ax, bx, pr), pz = lerp(az, bz, pr);
    if (pr > 0.002) {
      const seg = fromA ? { x0: px, z0: pz, x1: s.x1, z1: s.z1 } : { x0: s.x0, z0: s.z0, x1: px, z1: pz };
      R.parcel.updateTape(i, seg);
    } else R.parcel.updateTape(i, s);
    // めくれた帯
    const len = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / len, dz = (bz - az) / len;
    const peeled = len * pr + (pr > 0.002 ? 0.03 : 0);
    if (peeled < 0.006) { R.ribbon.visible = false; return; }
    const P0 = this._topW(px, pz, V()); P0.y += 0.002;
    let end;
    if (finger) { end = finger.clone(); const d = end.distanceTo(P0); if (d > peeled) end.sub(P0).multiplyScalar(peeled / d).add(P0); }
    else end = P0.clone().add(V(-dx * peeled * 0.4, peeled * 0.8, -dz * peeled * 0.4));
    const C1 = P0.clone().add(V(-dx * 0.008, 0.03, -dz * 0.008));
    const pos = R.ribbon.geometry.attributes.position, N = R.ribbonN, hw = TAPE_W / 2;
    const perp = V(-dz, 0, dx).multiplyScalar(hw);
    for (let k = 0; k <= N; k++) {
      const t = k / N, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      const x = a * P0.x + b * C1.x + c * end.x, y = a * P0.y + b * C1.y + c * end.y, z = a * P0.z + b * C1.z + c * end.z;
      pos.setXYZ(k * 2, x + perp.x, y, z + perp.z); pos.setXYZ(k * 2 + 1, x - perp.x, y, z - perp.z);
    }
    pos.needsUpdate = true; R.ribbon.geometry.computeVertexNormals(); R.ribbon.visible = true;
    R.ribbonEnd = end;
  },

  // ================================================================ 入力
  onDown(p) {
    if (R.drag) return;
    const st = R.stage;
    if (!R.lock) {
      if (st === 'A' && this._tapeDown(p)) return;
      if (st === 'B' && this._flapDown(p)) return;
      if (st === 'C' && this._itemDown(p)) return;
      if (st === 'W' && this._wallDown(p)) return;
      if ((st === 'D1' || st === 'T') && this._stickerDown(p)) return;
      if (st === 'T' && R.truckIn && core.pick(p, [R.truck.group], 30)) { this._truckTap(); return; }
    }
    this._discover(p);
  },
  onMove(p) {
    const d = R.drag; if (!d) return;
    if (d.type === 'tape') this._tapeMove(p);
    else if (d.type === 'flap') this._flapMove(p);
    else if (d.type === 'item' || d.type === 'wall' || d.type === 'sticker') this._carryMove(p);
  },
  onUp(p) {
    const d = R.drag; if (!d) return;
    R.drag = null;
    if (d.type === 'tape') this._tapeUp(p, d);
    else if (d.type === 'flap') this._flapUp(p, d);
    else if (d.type === 'item') this._itemUp(p, d);
    else if (d.type === 'wall') this._wallUp(p, d);
    else if (d.type === 'sticker') this._stickerUp(p, d);
  },

  // ---------------------------------------------------------------- A: テープ
  _tapeLocal(p) { const h = core.onPlane(p, BOX.y + PH); if (!h) return null; return { x: h.x - BOX.x, z: h.z - BOX.z }; },
  _tapeDown(p) {
    const P = S(), i = P.tapes.length - 1; if (i < 0) return false;
    const s = { ...P.tapes[i] };
    const a = core.toScreen(this._topW(s.x0, s.z0, _v), _s), b = core.toScreen(this._topW(s.x1, s.z1, _v2), _s2);
    const abx = b.x - a.x, aby = b.y - a.y, L2 = abx * abx + aby * aby || 1;
    const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / L2, 0, 1);
    const d = Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y);
    if (d > Math.max(44, Math.min(core.W, core.H) * 0.1)) return false;
    const loc = this._tapeLocal(p);
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0, Lw = dx * dx + dz * dz || 1;
    const tl = loc ? clamp(((loc.x - s.x0) * dx + (loc.z - s.z0) * dz) / Lw, 0, 1) : t;
    const fromA = t < 0.5;
    R.drag = { type: 'tape', i, s, fromA, t0: fromA ? tl : 1 - tl, pr: 0.05, last: 0.05 };
    if (!R.tapLoop || R.tapLoop.dead) R.tapLoop = au.loop({ kind: 'noise', type: 'bandpass', f: 2200, q: 0.9 });
    snd.peri();
    this._peelShow(s, fromA, 0.05, null);
    R.gaze = () => R.ribbonEnd || cam.position;
    return true;
  },
  _tapeMove(p) {
    const d = R.drag, s = d.s, loc = this._tapeLocal(p);
    if (!loc) return;
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0, Lw = dx * dx + dz * dz || 1;
    let tl = clamp(((loc.x - s.x0) * dx + (loc.z - s.z0) * dz) / Lw, -0.2, 1.2); if (!d.fromA) tl = 1 - tl;
    const pr = clamp(tl - d.t0 + 0.06, 0.03, 0.97);
    const finger = core.onPlane(p, BOX.y + PH + 0.07) || null;
    const dpr = Math.abs(pr - d.pr);
    if (dpr > 0.003 || finger) { this._peelShow(s, d.fromA, pr, finger); }
    // びりびり
    const sp = dpr / Math.max(0.016, core.time - (d.tm || core.time - 0.016)); d.tm = core.time;
    if (R.tapLoop) R.tapLoop.set({ g: clamp(sp * 0.12, 0, 0.3), f: 1500 + clamp(sp, 0, 4) * 700 }, 0.04);
    if (pr > d.last + 0.035) { snd.crackle(0.12 + Math.random() * 0.08); d.last = pr; }
    else if (pr < d.last - 0.035) d.last = pr;
    d.pr = pr;
  },
  _tapeUp(p, d) {
    if (R.tapLoop) R.tapLoop.set({ g: 0 }, 0.05);
    const i = d.i;
    if (d.pr >= 0.5) {
      R.lock = true; core.hint.clear();
      const from = d.pr;
      snd.biri();
      core.tween(0.16, k => this._peelShow(d.s, d.fromA, lerp(from, 1, k) * 0.98, R.ribbonEnd), { ease: 'in', done: () => {
        const startPos = (R.ribbonEnd || this._topW(0, 0)).clone();
        R.ribbon.visible = false;
        R.parcel.removeTape(i);
        const H = Hs(); const n = H.tapeBalls; H.tapeBalls = n + 1; core.save();
        this._addBall(n % BALL_SLOTS.length, startPos);
        const removed = (H.tape0 || 0) - S().tapes.length;
        R.gaze = () => cam.position;
        if (H.tape0 >= 3 && removed === 2 && !H.laughTape) {
          H.laughTape = true; core.save();
          core.after(0.5, () => { say.expr('wow'); R.gaze = () => _v3.copy(BOX).add(V(0, 0.25, 0)); au.bell(81, { g: 0.1 }); });
          core.after(1.3, () => { say.expr('laugh'); gm.bounce(); snd.giggle(); R.gaze = () => cam.position; });
          core.after(2.6, () => { say.expr('calm'); R.lock = false; this._afterTape(); });
        } else core.after(0.55, () => { R.lock = false; this._afterTape(); });
      } });
    } else {
      const from = d.pr;
      core.tween(0.22, k => this._peelShow(d.s, d.fromA, lerp(from, 0, k), null), { ease: 'out', done: () => { R.parcel.updateTape(i, d.s); R.ribbon.visible = false; au.peta(0.35); } });
      R.gaze = () => cam.position;
    }
  },
  _afterTape() {
    if (S().tapes.length === 0) { this._bind(); say.expr('wow'); au.bell(84, { g: 0.1 }); core.after(0.8, () => say.expr('calm')); }
    this._refresh();
  },
  _addBall(slot, from) {
    const s = BALL_SLOTS[slot % BALL_SLOTS.length];
    const b = mesh(R.ballGeos[slot % 3], R.ballMat); b.userData.hitR = 0.045; b.userData.slot = slot;
    const rest = V(s[0], TB.y + 0.019, s[1]);
    b.rotation.set(slot * 1.3, slot * 2.1, slot * 0.7); b.scale.setScalar(1.3);
    scene.add(b); R.balls.push(b);
    if (!from) { b.position.copy(rest); return; }
    const a = from.clone(); b.position.copy(a);
    // くしゃっと縮んで、ころころ転がる
    b.scale.setScalar(2.6);
    core.tween(0.18, k => b.scale.setScalar(lerp(2.6, 1.3, k)), { ease: 'out' });
    au.rustle();
    core.tween(0.75, (k, raw) => {
      b.position.lerpVectors(a, rest, k); b.position.y = lerp(a.y, rest.y, k) + Math.sin(raw * Math.PI) * 0.06 * (1 - raw) + Math.abs(Math.sin(raw * Math.PI * 3)) * 0.02 * (1 - raw);
      b.rotation.x += 0.25; b.rotation.z += 0.12;
    }, { ease: 'out', delay: 0.1, done: () => { b.position.copy(rest); snd.koron(1.1); } });
  },
  _rollBall(b) {
    if (b.userData.rolling) return; b.userData.rolling = true;
    const base = b.position.clone(), a = Math.random() * 6.28, dx = Math.cos(a) * 0.03, dz = Math.sin(a) * 0.03;
    snd.koron(1 + Math.random() * 0.2);
    core.tween(0.7, (k, raw) => { const s = Math.sin(raw * Math.PI * 2) * (1 - raw); b.position.set(base.x + dx * s, base.y, base.z + dz * s); b.rotation.x += dz * 3 * Math.cos(raw * 6.28); b.rotation.z -= dx * 3 * Math.cos(raw * 6.28); }, { ease: 'linear', done: () => { b.position.copy(base); b.userData.rolling = false; } });
  },

  // ---------------------------------------------------------------- B: フラップ
  _flapDown(p) {
    const closed = FLAP_ORDER.filter(n => !R.flapOpen[n]);
    if (!closed.length) return false;
    const main = R.mainFlap;
    let hit = core.pick(p, [R.flapAnchors[main]], 34) ? main : null;
    if (!hit) { const o = core.pick(p, closed.map(n => R.flapAnchors[n]), 24); if (o) hit = closed.find(n => R.flapAnchors[n] === o); }
    if (!hit) {
      // 箱の上ならどこでも主役のフラップ
      const h = core.onPlane(p, BOX.y + PH);
      if (h && Math.abs(h.x - BOX.x) < PW / 2 + 0.03 && Math.abs(h.z - BOX.z) < PD / 2 + 0.03) hit = main; else return false;
    }
    if ((hit === 'L' || hit === 'R') && (!R.flapOpen.F || !R.flapOpen.B)) {
      // 長いフラップから先に（自動で開く）
      R.lock = true; core.hint.clear();
      let d = 0;
      for (const n of ['F', 'B']) if (!R.flapOpen[n]) { core.after(d, () => this._openFlap(n, R.parcel.flaps[n].t, true)); d += 0.35; }
      core.after(d + 0.2, () => { R.lock = false; this._refresh(); });
      return true;
    }
    const f = R.parcel.flaps[hit];
    const hingeL = { F: V(0, PH, PD / 2), B: V(0, PH, -PD / 2), L: V(-PW / 2, PH, 0), R: V(PW / 2, PH, 0) }[hit];
    const hw = core.toScreen(R.parcel.group.localToWorld(hingeL.clone()), {});
    const cw = core.toScreen(R.flapAnchors[hit].getWorldPosition(_v), {});
    let ux = hw.x - cw.x, uy = hw.y - cw.y; const Lpx = Math.max(36, Math.hypot(ux, uy) * 2.2); const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    R.drag = { type: 'flap', n: hit, t0: f.t, ux, uy, Lpx, x0: p.x, y0: p.y, t: f.t };
    au.tick(); R.parcel.setFlap(hit, Math.max(f.t, 0.05));
    R.gaze = () => R.flapAnchors[hit].getWorldPosition(_v3);
    return true;
  },
  _flapMove(p) {
    const d = R.drag; const dd = ((p.x - d.x0) * d.ux + (p.y - d.y0) * d.uy) / d.Lpx;
    d.t = clamp(d.t0 + Math.max(0.05, dd), 0, 1.15); R.parcel.setFlap(d.n, d.t);
  },
  _flapUp(p, d) {
    if (p.moved < 12 || d.t > 0.45) this._openFlap(d.n, d.t);
    else { const from = d.t; core.tween(0.25, k => R.parcel.setFlap(d.n, lerp(from, 0, k)), { ease: 'out', done: () => au.knock(0.7) }); }
    R.gaze = () => cam.position;
  },
  _openFlap(n, from, quiet) {
    R.flapOpen[n] = true;
    snd.paka();
    core.tween(0.35, k => R.parcel.setFlap(n, lerp(from, FLAP_OPEN, k)), { ease: 'out' });
    if (FLAP_ORDER.every(k => R.flapOpen[k])) { this._opened(); return; }
    if (!quiet) core.after(0.15, () => this._refresh());
  },
  _opened() {
    const P = S(); P.closed = false; core.save();
    R.lock = true; core.hint.clear(); this._clearCue();
    // 箱の中から暖かい光
    R.boxLight.position.copy(BOX).add(V(0, 0.16, 0));
    core.tween(2.6, (k, raw) => { R.boxLight.intensity = Math.sin(Math.min(1, raw * 2.2) * Math.PI / 2) * 0.6 * (1 - raw * 0.75); }, { ease: 'linear', done: () => { R.boxLight.intensity = 0; } });
    const h = fx.halo(R.parcel.group, { r: 0.32, y: 0.2, color: 0xffd890, opacity: 0.9 });
    core.after(2.2, () => h.on(false)); core.after(3.0, () => h.kill());
    core.after(0.3, () => { au.sparkle(76); fx.burst(_v.copy(BOX).add(V(0, 0.26, 0)), { n: 16, speed: 0.5, up: 0.9, colors: [0xfff3a0, 0xffffff, 0xffd080] }); });
    // おばあちゃん: 身をのりだして「まあ」
    core.after(0.35, () => {
      say.expr('wow'); say.arms('cheeks'); R.gaze = () => _v3.copy(BOX).add(V(0, 0.15, 0));
      core.tween(0.6, k => { R.lean = k * 0.14; }, { ease: 'out' });
    });
    core.after(2.1, () => { say.expr('laugh'); gm.bounce(); snd.fufu(); });
    core.after(2.9, () => { core.tween(0.6, k => { R.lean = (1 - k) * 0.14; }); say.arms('table'); say.expr('calm'); });
    core.after(3.3, () => { R.lock = false; this._refresh(); });
  },

  // ---------------------------------------------------------------- C: 中身を渡す
  _itemDown(p) {
    const list = Object.values(R.items).filter(i => i.where !== 'hand' && !i.busy);
    if (!list.length) return false;
    const objs = list.map(i => i.obj);
    let o = core.pick(p, objs, 22);
    if (!o) {
      // 箱の中を触ったら主役の物
      const h = core.onPlane(p, BOX.y + PH * 0.6);
      if (h && Math.abs(h.x - BOX.x) < PW / 2 + 0.02 && Math.abs(h.z - BOX.z) < PD / 2 + 0.02 && R.mainItem && R.items[R.mainItem]) o = R.items[R.mainItem].obj;
    }
    if (!o) return false;
    const it = list.find(i => i.obj === o);
    for (const h of R.fxh) if (h.stop) h.stop();   // 運んでいる間は明滅を止める（手の光は残す）
    scene.attach(o);
    const q0 = o.quaternion.clone();
    R.drag = { type: 'item', it, obj: o, target: o.position.clone().add(V(0, 0.07, 0)), q0, plane: o.position.clone().add(V(0, 0.07, 0)), mode: 'give' };
    it.where = 'air';
    au.pop(1.15); if (it.kind === 'drawing') au.rustle();
    say.arms('reach');
    R.gaze = () => o.getWorldPosition(_v3);
    R.holdHalo = fx.halo(gm.holdPoint, { r: 0.17, opacity: 0.7, depthTest: true });
    return true;
  },
  _carryMove(p) {
    const d = R.drag;
    const h = core.onPlaneN(p, d.plane, DIR, _v);
    if (h) d.target.copy(h).add(d.off || V(0, -0.02, 0));
    if (d.type === 'sticker' || d.type === 'wall') return;
  },
  _carryQuat(kind, mode, out) {
    if (kind === 'drawing') return out.setFromEuler(new THREE.Euler(mode === 'hold' ? Math.PI / 2 - ELEV + 0.1 : 1.05, 0, 0));
    return out.setFromEuler(new THREE.Euler(mode === 'carry' ? 0.25 : 0, 0, 0));
  },
  _itemUp(p, d) {
    const it = d.it, o = d.obj;
    if (R.holdHalo) { R.holdHalo.kill(); R.holdHalo = null; }
    const hs = core.toScreen(gm.holdPoint.getWorldPosition(_v), _s);
    const hd = core.toScreen(gm.headWorld(_v2), _s2);
    const rad = Math.max(80, Math.min(core.W, core.H) * 0.24);
    const bs = core.toScreen(_v3.copy(BOX).add(V(0, PH, 0)), {});
    const dHold = Math.hypot(p.x - hs.x, p.y - hs.y), dHead = Math.hypot(p.x - hd.x, p.y - hd.y), dBox = Math.hypot(p.x - bs.x, p.y - bs.y);
    // おばあちゃんの手（か顔）に近く、箱よりおばあちゃん寄りで離したら受け取る
    if (!p.cancel && (dHold < rad || dHead < rad * 0.8) && Math.min(dHold, dHead) < dBox * 0.85) { this._give(it); return; }
    // ちゃぶ台の上？
    const t = p.cancel ? null : core.onPlane(p, TB.y);
    if (t && Math.hypot(t.x - TB.x, t.z - TB.z) < TB.r - 0.08 && !(Math.abs(t.x - BOX.x) < PW / 2 + 0.09 && Math.abs(t.z - BOX.z) < PD / 2 + 0.08) && t.z > TB.z - 0.3) {
      it.where = 'table'; it.busy = true;
      const a = o.position.clone(), b = V(t.x, TB.y + (it.kind === 'drawing' ? 0.002 : 0), t.z);
      const qa = o.quaternion.clone(), qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (Math.random() - 0.5) * 0.6, 0));
      core.tween(0.3, (k, raw) => { o.position.lerpVectors(a, b, k); o.position.y += Math.sin(raw * Math.PI) * 0.02; o.quaternion.slerpQuaternions(qa, qb, k); }, { ease: 'inout', done: () => { it.busy = false; au.thud(0.4); if (it.kind === 'drawing') au.rustle(); } });
    } else this._backToBox(it);
    say.arms('table'); R.gaze = () => cam.position;
    core.after(0.35, () => this._refresh());
  },
  _backToBox(it) {
    const o = it.obj; it.busy = true;
    const pp = packPose(it.kind); pp.pos.y += PACK_UP;
    R.parcel.group.attach(o);
    const a = o.position.clone(), qa = o.quaternion.clone(), qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(pp.tiltX || 0, pp.rotY || 0, 0));
    core.tween(0.42, (k, raw) => { o.position.lerpVectors(a, pp.pos, k); o.position.y += Math.sin(raw * Math.PI) * 0.06; o.quaternion.slerpQuaternions(qa, qb, k); }, { ease: 'inout', done: () => { it.where = 'box'; it.busy = false; au.thud(0.35); } });
  },
  _holdPose(kind, o, instant, done) {
    const pos = kind === 'drawing' ? V(0, 0.095, 0.0) : kind === 'mikan' ? V(0, -0.03, 0) : V(0, -0.022, 0.0);
    const qb = this._carryQuat(kind, 'hold', new THREE.Quaternion());
    if (kind === 'scarf') qb.setFromEuler(new THREE.Euler(0, 0, 0));
    if (instant) { o.position.copy(pos); o.quaternion.copy(qb); return; }
    const a = o.position.clone(), qa = o.quaternion.clone();
    core.tween(0.35, k => { o.position.lerpVectors(a, pos, k); o.quaternion.slerpQuaternions(qa, qb, k); }, { ease: 'out', done });
  },
  _give(it) {
    const o = it.obj, k = it.kind, H = Hs(), P = S();
    R.lock = true; this._clearCue();
    it.where = 'hand';
    gm.holdPoint.attach(o); this._holdPose(k, o, false);
    say.arms('hold'); au.pop(1.0);
    const idx = P.items.indexOf(k); if (idx >= 0) P.items.splice(idx, 1);
    H.given[k] = true; core.save();
    R.gaze = () => o.getWorldPosition(_v3);
    fx.burst(gm.holdPoint.getWorldPosition(_v), { n: 8, kind: 'dot', speed: 0.3, size: 0.016, colors: [0xffffff, 0xfff0b0] });
    core.after(0.15, () => say.expr('wow'));
    if (k === 'scarf') {
      core.after(0.3, () => au.bell(81, { g: 0.1 }));
      core.after(1.0, () => {
        au.whoosh(0.8);
        scene.attach(o); const a = o.position.clone(), b = gm.headWorld(V()).add(V(0, -0.14, 0.04)), s0 = o.scale.clone();
        say.arms('table');
        core.tween(0.4, (kk) => { o.position.lerpVectors(a, b, kk); o.scale.copy(s0).multiplyScalar(1 - kk * 0.6); o.rotation.y += 0.25; }, { ease: 'inout', done: () => {
          o.removeFromParent(); delete R.items.scarf; gm.wearScarf(true);
          fx.burst(b, { n: 10, kind: 'dot', size: 0.02, speed: 0.35, colors: [0xffffff, 0xffd0d0, 0xfff0b0] });
          au.sparkle(79);
        } });
      });
      core.after(1.55, () => { say.expr('laugh'); gm.bounce(); say.arms('cheeks'); snd.fufu(); R.gaze = () => cam.position; });
      core.after(3.1, () => { say.arms('table'); say.expr('calm'); });
      core.after(3.4, () => this._afterGive());
    } else if (k === 'mikan') {
      core.after(0.4, () => { core.tween(0.5, kk => { R.lean = kk * 0.1; R.nod = kk * 0.12; }); snd.sniff(); });
      core.after(1.4, () => { core.tween(0.4, kk => { R.lean = (1 - kk) * 0.1; R.nod = (1 - kk) * 0.12; }); say.expr('laugh'); snd.fufu(); });
      core.after(1.9, () => {
        say.arms('table'); this._mikanInBowl(o);
      });
      core.after(3.1, () => { say.expr('calm'); R.gaze = () => cam.position; });
      core.after(3.4, () => this._afterGive());
    } else if (k === 'drawing') {
      core.after(1.2, () => { say.expr('laugh'); gm.bounce(); snd.fufu(); au.sparkle(81); });
      core.after(2.3, () => { gm.bounce(); });
      core.after(2.9, () => { say.expr('calm'); R.gaze = () => WALL_SPOT; });
      core.after(3.6, () => { R.gaze = () => cam.position; this._afterGive(); });
    }
  },
  _afterGive() { R.lock = false; this._refresh(); },
  _mikanInBowl(o) {
    const dst = V(BOWL.x, BOWL.y + 0.016, BOWL.z), qb = new THREE.Quaternion();
    delete R.items.mikan;
    if (R.bowlMikan && R.bowlMikan !== o) R.bowlMikan.removeFromParent();
    if (!o) { o = createItem('mikan'); scene.add(o); o.position.copy(dst); o.quaternion.copy(qb); }
    R.bowlMikan = o; o.userData.hitR = 0.09;
    if (o.parent !== scene) scene.attach(o);
    const a = o.position.clone(), qa = o.quaternion.clone();
    if (a.distanceTo(dst) < 1e-3) return;
    core.tween(0.7, (k, raw) => { o.position.lerpVectors(a, dst, k); o.position.y += Math.sin(raw * Math.PI) * 0.05; o.quaternion.slerpQuaternions(qa, qb, k); }, { ease: 'inout', done: () => { snd.koron(0.95); fx.squash(o, { amt: 0.1 }); } });
  },

  // ---------------------------------------------------------------- 絵を壁へ
  _wallDown(p) {
    const it = R.items.drawing; if (!it || it.where !== 'hand') return false;
    if (!core.pick(p, [it.obj], 34)) return false;
    const o = it.obj; scene.attach(o);
    R.drag = { type: 'wall', it, obj: o, target: o.position.clone().add(V(0, 0.04, 0.02)), plane: o.position.clone(), off: V(0, 0, 0) };
    au.rustle(); say.arms('table'); R.gaze = () => o.getWorldPosition(_v3);
    return true;
  },
  _wallUp(p, d) {
    const o = d.obj, it = d.it;
    let ok = false, wp = null;
    if (!p.cancel) {
      wp = core.onPlaneN(p, WALL_SPOT, V(0, 0, 1), V());
      const ss = core.toScreen(WALL_SPOT, _s);
      const dS = Math.hypot(p.x - ss.x, p.y - ss.y);
      const near = wp && wp.x > WALL_RECT.x0 - 0.3 && wp.x < WALL_RECT.x1 + 0.25 && wp.y > WALL_RECT.y0 - 0.25 && wp.y < WALL_RECT.y1 + 0.3;
      ok = (near || dS < Math.max(90, Math.min(core.W, core.H) * 0.25)) && !!wp;
    }
    if (!ok) {
      // おばあちゃんの手に戻る
      gm.holdPoint.attach(o); this._holdPose('drawing', o, false); say.arms('hold'); au.pop(0.9);
      it.where = 'hand'; R.gaze = () => cam.position; return;
    }
    const x = clamp(wp.x, WALL_RECT.x0, WALL_RECT.x1), y = clamp(wp.y, WALL_RECT.y0, WALL_RECT.y1);
    R.lock = true; this._clearCue();
    const a = o.position.clone(), b = V(x, y, WZ + 0.02), qa = o.quaternion.clone(), qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    core.tween(0.16, k => { o.position.lerpVectors(a, b, k); o.quaternion.slerpQuaternions(qa, qb, k); }, { ease: 'in', done: () => {
      o.removeFromParent(); delete R.items.drawing;
      const H = Hs(); H.wall = { x, y }; core.save();
      this._showWallPic(x, y, true);
    } });
  },
  _showWallPic(x, y, anim) {
    const wp = R.wallPic; wp.visible = true; wp.position.set(x, y, WZ + 0.004);
    if (!anim) { for (const t of R.wallTapes) t.visible = true; return; }
    for (const t of R.wallTapes) t.visible = false;
    au.peta(1); fx.squash(wp, { amt: 0.25, dur: 0.35 });
    fx.burst(_v.set(x, y, WZ + 0.05), { n: 14, speed: 0.5, up: 0.4, gravity: -0.6 });
    R.wallTapes.forEach((t, i) => core.after(0.18 + i * 0.12, () => { t.visible = true; au.tick(); }));
    // おばあちゃんが見上げて拍手
    R.gaze = () => wp.position;
    core.after(0.4, () => { say.expr('wow'); });
    core.after(1.0, () => { say.arms('clap'); say.expr('laugh'); au.sparkle(79); });
    core.after(2.8, () => { say.arms('table'); gm.bounce(); R.gaze = () => cam.position; });
    core.after(3.3, () => { say.expr('calm'); R.lock = false; this._refresh(); });
  },

  // ---------------------------------------------------------------- D: おしまい
  _celebrate() {
    const H = Hs();
    R.lock = true; core.hint.clear();
    this._frame(FR.C, 1.6);
    const e0 = R.eve;
    core.tween(5, k => this._evening(lerp(e0, 1, k)), { ease: 'inout' });
    R.gaze = () => R.wallPic.visible ? R.wallPic.position : cam.position;
    say.arms('clap'); say.expr('laugh');
    // オルゴール（オリジナル）
    const mel = [[72, 1], [76, 1], [79, 1.5], [77, 0.5], [76, 1], [74, 1], [76, 0.5], [79, 0.5], [84, 1], [81, 1], [79, 2]];
    core.after(0.5, () => au.melody(mel, { tempo: 112, g: 0.15 }));
    const spark = [V(0, 0.95, 0.15), _v2.copy(BOX).add(V(0, 0.3, 0)).clone(), R.wallPic.visible ? R.wallPic.position.clone().add(V(0, 0, 0.06)) : V(0.3, 1.2, -0.5), V(-0.3, 0.7, 0.3)];
    spark.forEach((v, i) => core.after(0.6 + i * 0.9, () => fx.burst(v, { n: 12, speed: 0.4, gravity: -0.4, up: 0.6 })));
    core.after(2.6, () => { say.arms('table'); R.gaze = () => cam.position; gm.bounce(); });
    core.after(4.6, () => { say.expr('calm'); });
    core.after(5.2, () => {
      H.celebrated = true; core.state.done = true; core.save();
      R.lock = false; this._refresh();
    });
  },
  _flapTo(n, t) {
    const f = R.parcel.flaps[n], a = f.t; if (Math.abs(a - t) < 0.01) return;
    core.tween(0.6, k => R.parcel.setFlap(n, lerp(a, t, k)), { ease: 'inout' });
  },
  _pickMainSticker() {
    const ms = R.parcel.stickerMeshes;
    const f = ms.find(m => m.parent === R.parcel.flaps.F.pivot);
    return f || ms[0];
  },
  _stickerDown(p) {
    const ms = R.parcel.stickerMeshes.filter(m => m.visible); if (!ms.length) return false;
    for (const m of ms) m.userData.hitR = STICKER_SIZE * 0.8;
    let m = core.pick(p, ms, 18);
    if (!m && R.mainSticker && core.pick(p, [R.mainSticker], 30)) m = R.mainSticker;
    if (!m) return false;
    const k = m.userData.k;
    const mat = R.flyMats[k] || (R.flyMats[k] = new THREE.MeshStandardMaterial({ map: stickerTexture(k), alphaTest: 0.5, roughness: 0.35, side: THREE.DoubleSide }));
    const f = R.fly = new THREE.Mesh(R.flyGeo, mat); f.renderOrder = 6;
    m.getWorldPosition(f.position); f.quaternion.copy(cam.quaternion); scene.add(f);
    m.visible = false;
    const fp = gm.faceSpotWorld(SPOT_MAIN, V()).addScaledVector(DIR, 0.09);
    R.drag = { type: 'sticker', mesh: m, k, obj: f, target: f.position.clone().add(V(0, 0.03, 0.02)), plane: fp, off: V(0, 0, 0) };
    snd.peri(); say.expr('calm'); say.arms('table'); R.gaze = () => f.position.y > BOX.y + 0.3 ? cam.position : f.position;
    return true;
  },
  _stickerUp(p, d) {
    const f = d.obj, H = Hs();
    // 顔のあたりで離したら: 目より上ならおでこ、下なら左右のほっぺ
    let best = null;
    if (!p.cancel) {
      const hd = core.toScreen(gm.headWorld(_v), _s), fh = core.toScreen(gm.faceSpotWorld('forehead', _v2), _s2);
      const hr = Math.max(Math.abs(fh.y - hd.y) * 2.6, 40), lim = Math.max(hr * 1.5, Math.min(core.W, core.H) * 0.15);
      if (Math.hypot(p.x - hd.x, p.y - hd.y) < lim) best = p.y < (hd.y + fh.y) / 2 ? 'forehead' : (p.x > hd.x ? 'cheekL' : 'cheekR');
    }
    if (!best) {
      const a = f.position.clone(), b = d.mesh.getWorldPosition(V());
      core.tween(0.3, k => f.position.lerpVectors(a, b, k), { ease: 'inout', done: () => { f.removeFromParent(); if (R.fly === f) R.fly = null; d.mesh.visible = true; au.peta(0.3); } });
      R.gaze = () => cam.position; return;
    }
    R.lock = true; core.hint.clear();
    const a = f.position.clone(), b = gm.faceSpotWorld(best, V());
    core.tween(0.14, k => f.position.lerpVectors(a, b, k), { ease: 'in', done: () => {
      f.removeFromParent(); if (R.fly === f) R.fly = null;
      gm.setFaceSticker(best, stickerTexture(d.k));
      const idx = R.parcel.stickerMeshes.indexOf(d.mesh); if (idx >= 0) R.parcel.removeSticker(idx);
      H.face[best] = d.k; core.save();
      au.peta(0.8); fx.burst(b, { n: 8, speed: 0.3, size: 0.016, gravity: -0.4 });
      say.expr('wow'); gm.bounce();
      core.after(0.55, () => { say.expr('laugh'); gm.bounce(); snd.giggle(); R.gaze = () => cam.position; });
      core.after(1.3, () => { snd.giggle(); });
      core.after(2.2, () => { say.expr('calm'); R.lock = false; this._refresh(); });
    } });
  },
  _truckTap() {
    if (R.leaving) return; R.leaving = true;
    snd.horn(); R.truck.setBlink(1); gm.bounce(); say.expr('laugh');
    core.after(0.5, () => { R.leaving = false; core.restart(); });
  },

  // ---------------------------------------------------------------- 発見
  _discover(p) {
    const P = S(), list = [R.clock, R.cup, ...R.balls];
    if (R.bowlMikan) list.push(R.bowlMikan);
    if (R.parcel.leafMesh && P.closed) { R.parcel.leafMesh.userData.hitR = 0.05; list.push(R.parcel.leafMesh); }
    if (R.tableLeaf) list.push(R.tableLeaf);
    let o = core.pick(p, list, 16);
    if (!o) { const g = core.pick(p, [gm.group], 10); if (g) o = g; }
    if (!o && !P.closed && P.items.length === 0 && Object.values(R.items).length === 0) { if (core.pick(p, [R.parcel.group], 6)) o = R.parcel.group; }
    if (!o) return;
    if (o === R.clock) { snd.bong(); R.pendAmp = 0.42; R.gaze = () => R.clock.position; core.after(1.6, () => { if (!R.drag && !R.lock) R.gaze = () => cam.position; }); }
    else if (o === R.cup) { R.steamBoost = 1; au.noise({ dur: 0.5, g: 0.06, f: 900, q: 0.5, a: 0.1 }); au.tone({ f: 520, f2: 640, dur: 0.12, g: 0.08 }); fx.burst(_v.copy(CUP).add(V(0, 0.1, 0)), { n: 6, kind: 'dot', colors: [0xffffff], gravity: 0.25, speed: 0.12, up: 1.5, life: 1.2, size: 0.03 }); }
    else if (R.balls.includes(o)) this._rollBall(o);
    else if (o === R.bowlMikan) { const fr = o.userData.fruits || []; fr.forEach((f, i) => fx.wobble(f, { amp: 0.18, speed: 14, dur: 0.6, axis: i % 2 ? 'x' : 'z' })); snd.koron(1.05); }
    else if (o === R.parcel.leafMesh) this._leafFall();
    else if (o === R.tableLeaf) { au.rustle(); fx.wobble(R.tableLeaf, { amp: 0.25, dur: 0.5, axis: 'y' }); }
    else if (o === R.parcel.group) { au.knock(1.7); au.knock(1.9); fx.squash(R.parcel.group, { amt: 0.05, dur: 0.25 }); }
    else if (o === gm.group) this._grandmaTap();
  },
  _grandmaTap() {
    gm.bounce();
    if (R.lock || R.drag) return;
    const n = R.grandmaTap = (R.grandmaTap + 1) % 3;
    if (n === 1) { core.tween(0.8, (k, raw) => { R.nod = Math.sin(raw * Math.PI * 2) * 0.12 * (1 - raw * 0.3); }, { ease: 'linear' }); au.bell(76, { g: 0.08 }); }
    else if (n === 2) { core.tween(1.2, (k, raw) => { R.tilt = Math.sin(raw * Math.PI) * 0.2; }, { ease: 'linear' }); au.bell(79, { g: 0.08 }); au.bell(83, { at: 0.18, g: 0.07 }); }
    else { say.expr('laugh'); snd.fufu(); core.after(1.3, () => { if (!R.lock) say.expr('calm'); }); }
  },
  _leafFall() {
    const lm = R.parcel.leafMesh; if (!lm) return;
    const a = lm.getWorldPosition(V());
    R.parcel.setLeaf(false); core.save();
    au.rustle();
    const spot = { x: BOX.x - 0.3, z: BOX.z + 0.0, r: 0.8 };
    Hs().leaf = spot; core.save();
    const l = this._tableLeaf(spot, true);
    const b = l.position.clone();
    core.tween(1.4, (k, raw) => {
      l.position.lerpVectors(a, b, k); l.position.x += Math.sin(raw * 9) * 0.03 * (1 - raw);
      l.rotation.z = Math.sin(raw * 8) * 0.5 * (1 - raw); l.rotation.x = Math.cos(raw * 7) * 0.3 * (1 - raw);
    }, { ease: 'out', done: () => { l.rotation.set(0, spot.r, 0); au.rustle(); } });
  },
  _tableLeaf(spot, anim) {
    const src = R.parcel; // 葉の見た目は parcel の葉と同じ材質を借りる
    if (!R.leafGeo) {
      const tmp = createParcel({ items: [], closed: false, tapes: [], label: null, stickers: [], leaf: true });
      R.leafGeo = tmp.leafMesh.geometry; R.leafMat = tmp.leafMesh.material;
    }
    void src;
    const l = R.tableLeaf = mesh(R.leafGeo, R.leafMat); l.position.set(spot.x, TB.y + 0.001, spot.z); l.rotation.y = spot.r; l.userData.hitR = 0.05;
    scene.add(l); return l;
  },

  // ================================================================ 毎フレーム
  update(dt, t) {
    const d = R.drag;
    // 運んでいる物
    if (d && (d.type === 'item' || d.type === 'wall' || d.type === 'sticker')) {
      const k = 1 - Math.exp(-dt * 16);
      d.obj.position.lerp(d.target, k);
      if (d.type === 'item') d.obj.quaternion.slerp(this._carryQuat(d.it.kind, 'carry', _q), 1 - Math.exp(-dt * 8));
      if (d.type === 'wall') d.obj.quaternion.slerp(_q.setFromEuler(new THREE.Euler(Math.PI / 2 - 0.1, 0, 0)), 1 - Math.exp(-dt * 8));
      if (d.type === 'sticker') { d.obj.quaternion.copy(cam.quaternion); d.obj.scale.setScalar(lerp(d.obj.scale.x, 1.25, k)); }
    }
    // おばあちゃん
    R.gazeT -= dt;
    if (R.gazeT <= 0) { R.gazeT = 0.08; const g = R.gaze ? R.gaze() : null; gm.lookAt(g); }
    gm.group.rotation.x = R.lean;
    gm.group.position.z = R.lean * 0.25;
    gm.head.rotation.x = R.nod; gm.head.rotation.z = R.tilt;
    gm.update(dt, t);
    if (R.cheekHalo) gm.faceSpotWorld(SPOT_MAIN, R.cheekHolder.position);
    // 主役のフラップは少し息をする
    if (R.stage === 'B' && R.mainFlap && !R.flapOpen[R.mainFlap] && !(d && d.type === 'flap') && !R.lock) {
      const f = R.parcel.flaps[R.mainFlap]; if (f.t < 0.2) R.parcel.setFlap(R.mainFlap, Math.max(0, Math.sin(t * 3.2)) * 0.035);
    }
    // 壁の光
    const so = R.spotOn ? 0.45 + 0.25 * Math.sin(t * 2.8) : 0;
    R.spotMat.opacity = lerp(R.spotMat.opacity, so, Math.min(1, dt * 5)); R.spot.visible = R.spotMat.opacity > 0.01;
    // 振り子
    R.pendAmp = lerp(R.pendAmp, 0.1, dt * 0.25);
    R.pend.rotation.z = Math.sin(t * Math.PI * 2 / 1.25) * R.pendAmp;
    // 性能が足りないときは飾りを減らす
    if (core.low && !R.lowApplied) { R.lowApplied = true; R.steam[2].s.visible = false; R.steam.length = 2; if (R.flowers) R.flowers.visible = false; }
    // 湯気
    R.steamBoost = Math.max(0, R.steamBoost - dt * 0.5);
    for (const s of R.steam) {
      const ph = (t * 0.22 + s.ph) % 1;
      s.s.position.set(CUP.x + Math.sin(t * 1.3 + s.ph * 6) * 0.012 * (1 + ph * 2), CUP.y + 0.09 + ph * (0.16 + R.steamBoost * 0.08), CUP.z);
      s.s.scale.setScalar(0.035 + ph * 0.07 + R.steamBoost * 0.04);
      s.s.material.opacity = Math.sin(ph * Math.PI) * (0.16 + R.steamBoost * 0.3);
    }
    // ハザード
    if (R.truckIn) R.truck.setBlink(R.blink ? (Math.sin(t * Math.PI * 2 * 1.3) > 0 ? 1 : 0) : 0);
  },
};
