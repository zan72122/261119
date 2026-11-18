// scene_pack.js — 場面1「pack」: 家のテーブルで小包をつつみ、窓の外の軽トラの荷台へ送り出す
// 段階は core.state.parcel から導出する: A いれる → B しめる → C テープ → D ぺたっ → E おくりだす
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createParcel, PARCEL, STICKER_KINDS, STICKER_SIZE, LABEL_W, LABEL_D, labelTexture, stickerTexture } from './parcel.js';
import { createItem, packPose, ITEM_KINDS } from './items.js';
import { createTruck } from './truck.js';

const V3 = THREE.Vector3, PI = Math.PI;
let core = null;

// ---------------------------------------------------------------- 寸法・配置
const TABLE_Y = 0.72, TABLE_W = 1.1, TABLE_D = 0.75;
const BOX_X = 0, BOX_Z = -0.09;
const ROW_Z = 0.22;
const { W: PW, D: PD, H: PH, T: PT } = PARCEL;
const HW = PW / 2, HD = PD / 2;
const ROW_X = { scarf: -0.31, mikan: 0.0, drawing: 0.31 };
const REST_RY = { scarf: 0.06, mikan: 0.3, drawing: -0.08 };
const HIT_R = { scarf: 0.11, mikan: 0.08, drawing: 0.11 };
const WIN_Z = -1.6, GROUND_Y = -0.35, TRUCK_Z = -2.85, TRUCK_X = 0.69;
const MAX_TAPES = 6;
const ROLL_R0 = 0.038, ROLL_R1 = 0.05, ROLL_W = 0.05;
const ROLL_HOME = new V3(0, 0, ROW_Z), ROLL_PARK = new V3(0.43, 0, -0.2);
const SHEET_W = 0.38, SHEET_D = 0.15, SHEET_T = 0.0016;
const LABEL_SLOT = { x: -0.115, z: 0 };
const STK_SCALE = 0.05 / STICKER_SIZE;
const stkSlot = k => { const i = Math.max(0, STICKER_KINDS.indexOf(k)); return { x: (i % 4) * 0.054, z: i < 4 ? -0.033 : 0.033 }; };
const FLAP_ORDER = ['L', 'R', 'F', 'B'];
const BED_LOCAL = new V3(0.12, 0, 0.12);

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _s0 = {}, _s1 = {};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

function sealed(P) {
  return (P.tapes || []).some(t => Math.abs(t.z0) < 0.03 && Math.abs(t.z1) < 0.03 && Math.abs(t.x1 - t.x0) >= PW * 0.8);
}
function mergeList(list) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(geos, false);
  list.forEach(g => g.dispose()); geos.forEach(g => g.dispose());
  return m;
}
const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// ---------------------------------------------------------------- 音（場面専用の小さな合成音）
const S = {
  pof() { const a = core.au; a.noise({ dur: 0.18, g: 0.32, f: 380, type: 'lowpass', q: 0.6 }); a.tone({ f: 140, f2: 70, dur: 0.16, g: 0.28 }); },
  squish() { const a = core.au; a.noise({ dur: 0.14, g: 0.22, f: 650, f2: 300, type: 'lowpass', q: 0.8 }); a.tone({ f: 260, f2: 180, dur: 0.12, g: 0.08 }); },
  rolls(n = 3, at = 0) { const a = core.au; for (let i = 0; i < n; i++) { a.knock(1.55 - i * 0.12); a.tone({ f: 380 - i * 30, f2: 260, dur: 0.07, g: 0.12, type: 'triangle', at: at + i * 0.09 }); a.noise({ dur: 0.05, g: 0.12, f: 1300, q: 1.4, at: at + i * 0.09 }); } },
  lift() { core.au.noise({ dur: 0.18, g: 0.06, f: 900, f2: 1800, q: 0.7, a: 0.05 }); },
  rollRumble(dur = 1.0, g = 0.12) { const a = core.au; a.noise({ dur, g, f: 260, f2: 180, type: 'lowpass', q: 0.8, a: 0.1 }); for (let i = 0; i < Math.round(dur * 6); i++) a.noise({ dur: 0.03, g: 0.05, f: 900, q: 2, at: i * 0.16 + 0.05 }); },
  pi() { const a = core.au; a.tone({ f: 2500, f2: 1900, dur: 0.05, g: 0.1, type: 'triangle' }); a.noise({ dur: 0.05, g: 0.22, f: 4200, q: 2 }); },
  petaVar(k = 1) { const a = core.au; a.noise({ dur: 0.07, g: 0.45, f: 2600 * k, f2: 900 * k, q: 0.7 }); a.tone({ f: 190 * k, f2: 85 * k, dur: 0.13, g: 0.45, type: 'sine' }); a.tone({ f: 620 * k, f2: 380 * k, dur: 0.06, g: 0.12, type: 'triangle', at: 0.012 }); },
  peel() { core.au.noise({ dur: 0.09, g: 0.16, f: 3200, f2: 5200, q: 1.1, type: 'bandpass' }); },
  long() { const a = core.au; a.noise({ dur: 0.42, g: 0.2, f: 1500, f2: 3200, q: 1.2, a: 0.02 }); a.peta(0.8); },
  horn(g = 1) {
    const a = core.au;
    for (const [at, dur] of [[0, 0.12], [0.2, 0.45]]) { a.tone({ f: 392, type: 'square', g: 0.05 * g, dur, at, a: 0.01 }); a.tone({ f: 494, type: 'square', g: 0.04 * g, dur, at, a: 0.01 }); }
  },
  gate() { const a = core.au; a.thud(0.7); a.knock(0.55); a.noise({ dur: 0.12, g: 0.2, f: 2400, q: 3, at: 0.02 }); },
  latch() { const a = core.au; a.knock(0.8); a.noise({ dur: 0.06, g: 0.25, f: 3600, q: 4 }); a.knock(1.1); a.noise({ dur: 0.05, g: 0.2, f: 4200, q: 4, at: 0.08 }); },
};

// ---------------------------------------------------------------- 部屋と外
function buildRoom(T) {
  const g = new THREE.Group();
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  // 床（フローリング）
  const floorTex = T.wood({ w: 1024, h: 1024, planks: 8, base: '#a37445', dark: '#62401f', light: '#c99c68', seed: 21, repeat: [2.4, 2.8] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 5.4).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, envMapIntensity: 0.55 }));
  floor.position.set(0, 0, WIN_Z + 2.7); floor.receiveShadow = true; g.add(floor);
  // 壁（掃き出し窓の開口つき）
  const wallTex = T.mottled({ w: 256, h: 256, base: '#ebe4d6', spots: 500, alpha: 0.022, grain: 0.03, seed: 9, repeat: [5, 5] });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, envMapIntensity: 0.6 });
  const wz = WIN_Z - 0.06;
  const wall = new THREE.Mesh(mergeList([
    bx(1.85, 4.2, 0.12, -2.325, 2.1, wz), bx(1.85, 4.2, 0.12, 2.325, 2.1, wz), bx(2.8, 2.1, 0.12, 0, 3.15, wz),
    bx(0.12, 2.75, 5.4, -3.2, 1.375, WIN_Z + 2.7), bx(0.12, 2.75, 5.4, 3.2, 1.375, WIN_Z + 2.7),
  ]), wallMat);
  g.add(shadowy(wall));
  // 巾木
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.6 });
  g.add(new THREE.Mesh(mergeList([bx(1.85, 0.07, 0.015, -2.325, 0.035, WIN_Z + 0.008), bx(1.85, 0.07, 0.015, 2.325, 0.035, WIN_Z + 0.008),
    bx(0.015, 0.07, 5.4, -3.135, 0.035, WIN_Z + 2.7), bx(0.015, 0.07, 5.4, 3.135, 0.035, WIN_Z + 2.7)]), baseMat));
  // アルミサッシ（枠・レール・左に寄せた2枚の引き戸）・カーテンレール
  const alu = new THREE.MeshStandardMaterial({ color: 0xb4b7b9, metalness: 0.7, roughness: 0.32 });
  const sash = [
    bx(0.05, 2.1, 0.16, -1.375, 1.05, WIN_Z - 0.06), bx(0.05, 2.1, 0.16, 1.375, 1.05, WIN_Z - 0.06), bx(2.8, 0.05, 0.16, 0, 2.075, WIN_Z - 0.06),
    bx(2.7, 0.025, 0.17, 0, 0.0125, WIN_Z - 0.06), bx(2.7, 0.014, 0.006, 0, 0.032, WIN_Z - 0.03), bx(2.7, 0.014, 0.006, 0, 0.032, WIN_Z - 0.09),
    bx(3.9, 0.03, 0.035, 0, 2.32, WIN_Z + 0.09),
  ];
  for (const [zz, x0] of [[WIN_Z - 0.03, -1.35], [WIN_Z - 0.09, -1.33]]) {
    const x1 = x0 + 0.72, cx = (x0 + x1) / 2;
    sash.push(bx(0.04, 2.02, 0.03, x0 + 0.02, 1.04, zz), bx(0.04, 2.02, 0.03, x1 - 0.02, 1.04, zz), bx(0.72, 0.045, 0.03, cx, 0.06, zz), bx(0.72, 0.04, 0.03, cx, 2.03, zz));
  }
  g.add(shadowy(new THREE.Mesh(mergeList(sash), alu)));
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f0f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.2 });
  const glass = new THREE.Mesh(mergeList([new THREE.PlaneGeometry(0.64, 1.93).translate(-0.99, 1.045, WIN_Z - 0.03), new THREE.PlaneGeometry(0.64, 1.93).translate(-0.97, 1.045, WIN_Z - 0.09)]), glassMat);
  g.add(glass);
  // 寄せたカーテン（ゆるいひだ）
  const cg = (x, s) => {
    const p = new THREE.PlaneGeometry(0.5, 2.26, 40, 1), a = p.attributes.position;
    for (let i = 0; i < a.count; i++) { const u = a.getX(i) / 0.5 + 0.5; a.setZ(i, 0.045 * Math.sin(u * PI * 9 + s) + 0.012 * Math.sin(u * PI * 23)); }
    p.computeVertexNormals(); return p.translate(x, 1.17, WIN_Z + 0.07);
  };
  const curtain = new THREE.Mesh(mergeList([cg(-1.6, 0.4), cg(1.6, 1.3)]), new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.7 }));
  g.add(shadowy(curtain));

  // ---- 外 ----
  const out = new THREE.Group(); g.add(out);
  const conc = T.canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#a19d95'; c.fillRect(0, 0, w, h);
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.025})` : `rgba(40,30,20,${r() * 0.03})`; c.beginPath(); c.ellipse(r() * w, r() * h, 2 + r() * 14, 2 + r() * 8, r() * 3, 0, 6.3); c.fill(); }
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(60,55,50,${r() * 0.25})`; c.fillRect(r() * w, r() * h, 1.2, 1.2); }
    c.fillStyle = 'rgba(70,65,60,0.5)'; c.fillRect(0, 0, 3, h); c.fillRect(0, 0, w, 2);
  }, { repeat: [5, 1.2] });
  const park = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9 }));
  park.position.set(0, GROUND_Y, WIN_Z - 0.12 - 1.1); park.receiveShadow = true; out.add(park);
  // 家の基礎（窓の下）と側溝
  const grey = new THREE.MeshStandardMaterial({ color: 0x9d9a94, roughness: 0.9 });
  out.add(new THREE.Mesh(mergeList([bx(16, 0.36, 0.1, 0, GROUND_Y + 0.17, WIN_Z - 0.13), bx(16, 0.06, 0.3, 0, GROUND_Y + 0.01, WIN_Z - 2.42)]), grey));
  const asph = T.canvas(512, 256, (c, w, h) => {
    c.fillStyle = '#4f5154'; c.fillRect(0, 0, w, h);
    let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) { const v = 40 + r() * 70; c.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
    c.fillStyle = 'rgba(235,235,228,0.9)'; c.fillRect(0, h * 0.08, w, h * 0.035); c.fillRect(0, h * 0.89, w, h * 0.035);
  }, { repeat: [8, 1] });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 3.6).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: asph, roughness: 0.85 }));
  road.position.set(0, GROUND_Y - 0.005, WIN_Z - 2.55 - 1.8); road.receiveShadow = true; out.add(road);
  // 生け垣
  const hedgeTex = T.canvas(256, 128, (c, w, h) => {
    c.fillStyle = '#3f5a2c'; c.fillRect(0, 0, w, h);
    let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1600; i++) { const v = r(); c.fillStyle = v < 0.4 ? `rgba(20,40,15,0.5)` : v < 0.8 ? `rgba(95,130,60,0.45)` : `rgba(150,175,90,0.4)`; c.beginPath(); c.ellipse(r() * w, r() * h, 2 + r() * 4, 1.5 + r() * 3, r() * 3, 0, 6.3); c.fill(); }
  }, { repeat: [16, 1] });
  const hedge = new THREE.Mesh(new RoundedBoxGeometry(40, 1.3, 0.7, 2, 0.22), new THREE.MeshStandardMaterial({ map: hedgeTex, bumpMap: hedgeTex, bumpScale: 2, roughness: 0.95 }));
  hedge.position.set(0, GROUND_Y + 0.64, WIN_Z - 6.6); out.add(hedge);
  // 向かいの家（壁・屋根・窓）
  const walls = [], roofs = [], wins = [];
  const house = (x, z, w, d, h, ry) => {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, GROUND_Y, z);
    const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(d / 2, h); sh.lineTo(0, h + d * 0.3); sh.lineTo(-d / 2, h); sh.closePath();
    const body = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2).rotateY(PI / 2);
    walls.push(body.applyMatrix4(m));
    const rl = Math.hypot(d / 2, d * 0.3) + 0.35, ang = Math.atan2(d * 0.3, d / 2);
    for (const s of [1, -1]) roofs.push(new THREE.BoxGeometry(w + 0.5, 0.08, rl).rotateX(s * ang).translate(0, h + d * 0.15 + 0.05, s * d / 4 + s * 0.05).applyMatrix4(m));
    for (let i = 0; i < Math.floor(w / 1.8); i++) for (const yy of [1.0, 3.6]) if (yy < h - 0.6) wins.push(new THREE.BoxGeometry(0.9, 1.0, 0.05).translate(-w / 2 + 0.9 + i * 1.8, yy + 0.4, d / 2 + 0.01).applyMatrix4(m));
  };
  house(-5.5, WIN_Z - 11, 7, 6, 5.4, 0); house(3.6, WIN_Z - 11.8, 8, 6.5, 5.6, 0); house(12.5, WIN_Z - 10.8, 6, 6, 5.2, 0); house(-14, WIN_Z - 11.2, 7, 6, 5.0, 0);
  out.add(new THREE.Mesh(mergeList(walls), new THREE.MeshStandardMaterial({ color: 0xe2dbcc, roughness: 0.9 })));
  out.add(new THREE.Mesh(mergeList(roofs), new THREE.MeshStandardMaterial({ color: 0x55606b, roughness: 0.6, metalness: 0.1 })));
  out.add(new THREE.Mesh(mergeList(wins), new THREE.MeshStandardMaterial({ color: 0x5a6a74, roughness: 0.15, metalness: 0.3 })));
  // 遠くの地面・電柱・空
  const far = new THREE.Mesh(new THREE.PlaneGeometry(80, 30).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: 0x8d8f80, roughness: 1 }));
  far.position.set(0, GROUND_Y - 0.02, WIN_Z - 24); out.add(far);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 9, 12).translate(2.6, GROUND_Y + 4.5, WIN_Z - 6.0), new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.85 }));
  pole.castShadow = true; out.add(pole);
  const sky = T.canvas(16, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fb5dc'); gr.addColorStop(0.55, '#cfe0ee'); gr.addColorStop(1, '#f6f2e8');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const skyM = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshBasicMaterial({ map: sky, fog: false }));
  skyM.position.set(0, 24, WIN_Z - 45); out.add(skyM);
  g.userData.out = out; g.userData.deco = [hedge, pole, curtain];
  return g;
}

// テーブル（と横の椅子）
function buildTable(T) {
  const tex = T.wood({ w: 1024, h: 512, base: '#a87644', dark: '#6a4422', light: '#c99a64', seed: 14 });
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.7 });
  const legTex = T.wood({ w: 256, h: 512, base: '#a77a48', dark: '#6c4826', light: '#c69a68', seed: 33 });
  const mat2 = new THREE.MeshStandardMaterial({ map: legTex, roughness: 0.55, envMapIntensity: 0.7 });
  const top = new THREE.Mesh(new RoundedBoxGeometry(TABLE_W, 0.036, TABLE_D, 3, 0.012).translate(0, TABLE_Y - 0.018, 0), mat);
  top.castShadow = true; top.receiveShadow = true;
  const lx = TABLE_W / 2 - 0.07, lz = TABLE_D / 2 - 0.07, ly = TABLE_Y - 0.036;
  const parts = [bx(TABLE_W - 0.16, 0.075, 0.022, 0, ly - 0.04, lz), bx(TABLE_W - 0.16, 0.075, 0.022, 0, ly - 0.04, -lz), bx(0.022, 0.075, TABLE_D - 0.16, lx, ly - 0.04, 0), bx(0.022, 0.075, TABLE_D - 0.16, -lx, ly - 0.04, 0)];
  for (const sx of [1, -1]) for (const sz of [1, -1]) parts.push(new THREE.CylinderGeometry(0.026, 0.019, ly, 12).translate(sx * lx, ly / 2, sz * lz));
  // 椅子（左横、テーブルの方を向く）
  const cx = -0.86, cz = -0.02, sy = 0.44;
  parts.push(new RoundedBoxGeometry(0.42, 0.03, 0.42, 2, 0.01).translate(cx, sy, cz));
  for (const ax of [1, -1]) for (const az of [1, -1]) parts.push(bx(0.034, sy, 0.034, cx + ax * 0.18, sy / 2, cz + az * 0.18));
  for (const az of [1, -1]) parts.push(bx(0.034, 0.46, 0.034, cx - 0.18, sy + 0.23, cz + az * 0.18));
  for (const yy of [0.62, 0.8]) parts.push(bx(0.022, 0.08, 0.36, cx - 0.185, sy + yy - 0.44 + 0.24, cz));
  const base = new THREE.Mesh(mergeList(parts), mat2); base.castShadow = true; base.receiveShadow = true;
  const g = new THREE.Group(); g.add(top, base); return g;
}

// 梱包テープの巻き
function buildRoll(T) {
  const tapeTex = T.canvas(256, 64, (c, w, h) => {
    c.fillStyle = '#a5733f'; c.fillRect(0, 0, w, h);
    let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 120; i++) { c.strokeStyle = r() < 0.5 ? `rgba(100,60,25,${0.04 + r() * 0.05})` : `rgba(210,160,100,${0.04 + r() * 0.06})`; c.lineWidth = 0.6 + r(); const y = r() * h; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (r() - 0.5) * 3); c.stroke(); }
  }, { repeat: [3, 1] });
  const ringTex = T.canvas(128, 128, (c, w) => {
    c.fillStyle = '#8f5f2f'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 40; i++) { c.strokeStyle = i % 2 ? 'rgba(60,35,12,0.18)' : 'rgba(200,150,90,0.15)'; c.lineWidth = 1; c.beginPath(); c.arc(w / 2, w / 2, 20 + i * 1.1, 0, 6.3); c.stroke(); }
  });
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.92, side: THREE.DoubleSide });
  const coreGeo = mergeList([
    new THREE.CylinderGeometry(ROLL_R0, ROLL_R0, ROLL_W + 0.003, 40, 1, true).rotateX(PI / 2),
    new THREE.CylinderGeometry(ROLL_R0 - 0.004, ROLL_R0 - 0.004, ROLL_W + 0.003, 40, 1, true).rotateX(PI / 2),
    new THREE.RingGeometry(ROLL_R0 - 0.004, ROLL_R0, 40).translate(0, 0, ROLL_W / 2 + 0.0015),
    new THREE.RingGeometry(ROLL_R0 - 0.004, ROLL_R0, 40).rotateY(PI).translate(0, 0, -ROLL_W / 2 - 0.0015),
  ]);
  const coreM = new THREE.Mesh(coreGeo, coreMat); coreM.castShadow = true; coreM.receiveShadow = true; spin.add(coreM);
  const tapeM = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({ map: tapeTex, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  const sideM = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({ map: ringTex, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  tapeM.castShadow = sideM.castShadow = true; tapeM.receiveShadow = sideM.receiveShadow = true;
  spin.add(tapeM, sideM);
  const roll = { group: g, spin, r: ROLL_R1, left: MAX_TAPES, tapeM, sideM };
  roll.setLeft = n => {
    n = clamp(n, 0, MAX_TAPES); roll.left = n;
    const r = n > 0 ? ROLL_R0 + 0.0015 + (ROLL_R1 - ROLL_R0 - 0.0015) * (n / MAX_TAPES) : ROLL_R0;
    roll.r = r;
    tapeM.geometry.dispose(); sideM.geometry.dispose();
    if (n > 0) {
      tapeM.geometry = new THREE.CylinderGeometry(r, r, ROLL_W, 48, 1, true).rotateX(PI / 2);
      sideM.geometry = mergeList([new THREE.RingGeometry(ROLL_R0, r, 48).translate(0, 0, ROLL_W / 2), new THREE.RingGeometry(ROLL_R0, r, 48).rotateY(PI).translate(0, 0, -ROLL_W / 2)]);
      tapeM.visible = sideM.visible = true;
    } else { tapeM.geometry = new THREE.BufferGeometry(); sideM.geometry = new THREE.BufferGeometry(); tapeM.visible = sideM.visible = false; }
    g.userData.hitR = r + 0.03;
  };
  roll.setLeft(MAX_TAPES);
  return roll;
}

// シール台紙
function buildSheet(T) {
  const g = new THREE.Group();
  const CW = 1024, CH = Math.round(CW * SHEET_D / SHEET_W);
  const tex = T.canvas(CW, CH, (c, w, h) => {
    c.fillStyle = '#efefea'; c.fillRect(0, 0, w, h);
    const px = x => (x + SHEET_W / 2) / SHEET_W * w, pz = z => (z + SHEET_D / 2) / SHEET_D * h, sc = w / SHEET_W;
    // 宛名ラベルの抜け跡
    c.fillStyle = 'rgba(150,145,135,0.16)'; c.strokeStyle = 'rgba(120,115,105,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(px(LABEL_SLOT.x) - LABEL_W / 2 * sc, pz(LABEL_SLOT.z) - LABEL_D / 2 * sc, LABEL_W * sc, LABEL_D * sc, 8); c.fill(); c.stroke();
    // シールの抜け跡（形のシルエット）
    const sz = STICKER_SIZE * STK_SCALE * sc;
    for (const k of STICKER_KINDS) {
      const img = stickerTexture(k).image, tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
      const t = tmp.getContext('2d'); t.drawImage(img, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = 'rgb(160,156,146)'; t.fillRect(0, 0, tmp.width, tmp.height);
      const s = stkSlot(k); c.globalAlpha = 0.28; c.drawImage(tmp, px(s.x) - sz / 2, pz(s.z) - sz / 2, sz, sz); c.globalAlpha = 1;
    }
    // ほんのりつやの帯
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.5, 'rgba(230,232,236,0.25)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const topMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(SHEET_W, SHEET_T, SHEET_D).translate(0, SHEET_T / 2, 0), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
  base.receiveShadow = true; g.add(base);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_D).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.62 }));
  label.userData = { kind: 'label', hitR: 0.065, slot: new V3(LABEL_SLOT.x, SHEET_T + 0.0005, LABEL_SLOT.z), slotScale: 1 };
  label.position.copy(label.userData.slot); label.receiveShadow = true; g.add(label);
  const stickers = {};
  const sgeo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE).rotateX(-PI / 2);
  for (const k of STICKER_KINDS) {
    const m = new THREE.Mesh(sgeo, new THREE.MeshStandardMaterial({ map: stickerTexture(k), alphaTest: 0.5, roughness: 0.28 }));
    const s = stkSlot(k);
    m.userData = { kind: 'sticker', k, hitR: 0.026, slot: new V3(s.x, SHEET_T + 0.0007, s.z), slotScale: STK_SCALE };
    m.position.copy(m.userData.slot); m.scale.setScalar(STK_SCALE); m.receiveShadow = true;
    g.add(m); stickers[k] = m;
  }
  return { group: g, label, stickers };
}

// ======================================================================
const scene = {
  id: 'pack',

  init(c) {
    core = c;
    const T = core.tex;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe6ebec);
    this.scene.environment = core.env;
    this.scene.fog = new THREE.Fog(0xe8ebe8, 9, 42);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);

    // 光: 朝の低い日差し（窓の外・左奥から）＋やわらかい空の光
    const sun = this.sun = new THREE.DirectionalLight(0xffe6c8, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -3.2; sc.right = 3.2; sc.top = 3.2; sc.bottom = -3.2; sc.near = 0.5; sc.far = 16;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    const tgt = new THREE.Object3D(); tgt.position.set(0, 0.3, -1.1);
    sun.target = tgt; sun.position.copy(tgt.position).add(new V3(-1.5, 2.0, -3.5).normalize().multiplyScalar(8));
    this.scene.add(sun, tgt);
    this.scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x8a7360, 0.2));

    this.room = buildRoom(T); this.scene.add(this.room);
    this.table = buildTable(T); this.scene.add(this.table);

    this.items = {};
    for (const k of ITEM_KINDS) { const it = createItem(k); it.userData.hitR = HIT_R[k]; it.userData.hitOffset = new V3(0, 0.02, 0); this.items[k] = it; }
    this.roll = buildRoll(T); this.roll.group.userData.hitOffset = new V3(0, 0, 0);
    this.sheet = buildSheet(T);
    this.truck = createTruck();
    this.truck.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.truckHit = new THREE.Object3D(); this.truckHit.position.set(0.9, 1.0, 0); this.truckHit.userData.hitR = 0.85; this.truck.group.add(this.truckHit);

    // 合わせ目を流れる光の筋（C）
    const glowTex = core.tex.radial('rgba(255,236,170,1)', 'rgba(255,236,170,0)', 64);
    this.glowTex = glowTex;
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    this.streak = new THREE.Group();
    this.streakLine = new THREE.Mesh(new THREE.PlaneGeometry(PW, 0.012).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd47a, opacity: 0.25, ...add }));
    this.streakDot = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffe6a0, opacity: 0.9, ...add }));
    this.streak.add(this.streakLine, this.streakDot); this.streak.position.y = 2 * PT + 0.003;
    // 天面のほんのりした光（D）
    this.topGlow = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.25, PD * 1.4).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff0c0, opacity: 0.0, ...add }));
    this.topGlow.position.y = 2 * PT + 0.004;
    // 光の点の道筋（E）
    this.dots = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.07); s.visible = false; this.scene.add(s); this.dots.push(s);
    }
    this.camA = { pos: new V3(), tgt: new V3() }; this.camE = { pos: new V3(), tgt: new V3() };
    this.camK = 0; this.own = [];
  },

  // ------------------------------------------------------------ 組み立て直し
  enter() {
    const P = core.state.parcel;
    if (!core.state.pack || typeof core.state.pack !== 'object') core.state.pack = {};
    const ps = core.state.pack;
    if (!ps.fl || typeof ps.fl !== 'object') ps.fl = {};
    this.drag = null; this.lock = false; this.own = []; this.truckSt = 'none'; this.camK = 0; this.leaving = false;
    this.engine = null; this.tapeSnd = null; this.camTw = null;

    // 前回の箱を片付ける（中身は取り出してから）
    for (const k of ITEM_KINDS) this.items[k].removeFromParent();
    if (this.parcel) { this.parcel.dispose(); this.parcel = null; }
    const parcel = this.parcel = createParcel(P);
    parcel.group.position.set(BOX_X, TABLE_Y, BOX_Z); parcel.group.rotation.set(0, 0, 0); parcel.group.scale.set(1, 1, 1);
    parcel.group.userData._bs = null;
    this.scene.add(parcel.group);
    this.boxHit = new THREE.Object3D(); this.boxHit.position.set(0, PH * 0.55, 0); this.boxHit.userData.hitR = 0.2; parcel.group.add(this.boxHit);
    parcel.top.add(this.streak); parcel.top.add(this.topGlow);
    this.streak.visible = false; this.topGlow.visible = false;
    // フラップ: 合図用の光の板と、掴む目印
    this.flapFx = {};
    for (const n of FLAP_ORDER) {
      const f = parcel.flaps[n];
      const long = n === 'F' || n === 'B';
      const sz = long ? [PW, PT + 0.003, HD] : [HD, PT + 0.003, PD];
      const cen = n === 'F' ? [0, 1.5 * PT, -HD / 2] : n === 'B' ? [0, 1.5 * PT, HD / 2] : n === 'L' ? [HD / 2, PT / 2, 0] : [-HD / 2, PT / 2, 0];
      const ov = new THREE.Mesh(new THREE.BoxGeometry(sz[0] + 0.004, sz[1], sz[2] + 0.004), new THREE.MeshBasicMaterial({ color: 0xffcf70, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ov.position.set(...cen); ov.visible = false; f.pivot.add(ov);
      const an = new THREE.Object3D(); an.position.set(...cen); an.userData.hitR = 0.1; an.userData.flap = n; f.pivot.add(an);
      const tip = new THREE.Object3D(); f.pivot.add(tip);
      tip.position.set(n === 'L' ? HD * 0.9 : n === 'R' ? -HD * 0.9 : 0, PT, n === 'F' ? -HD * 0.9 : n === 'B' ? HD * 0.9 : 0);
      this.flapFx[n] = { ov, an, tip };
      if (!P.closed) parcel.setFlap(n, ps.fl[n] ? 0 : 1);
    }
    // 中身
    for (const k of ITEM_KINDS) {
      const it = this.items[k]; it.scale.set(1, 1, 1); it.userData._bs = null; it.visible = true;
      if (it.userData.fruits) for (const fr of it.userData.fruits) { fr.position.copy(fr.userData.basePos); fr.rotation.copy(fr.userData.baseRot); }
      if (P.items.includes(k)) {
        const pp = this.poseFor(k); parcel.group.add(it); it.position.copy(pp.pos); it.rotation.set(pp.tiltX, pp.rotY, pp.tiltZ || 0);
        it.userData.st = 'packed'; it.visible = !P.closed;
      } else {
        this.scene.add(it); it.position.set(ROW_X[k], TABLE_Y, ROW_Z); it.rotation.set(0, REST_RY[k], 0);
        it.userData.st = 'rest'; it.userData.rest = it.position.clone();
      }
    }
    // テープの巻き
    const st = this.stageOf();
    const roll = this.roll; roll.setLeft(MAX_TAPES - P.tapes.length);
    roll.group.removeFromParent(); roll.spin.rotation.set(0, 0, 0); roll.group.rotation.set(0, 0, 0);
    if (st === 'C' || st === 'D' || st === 'E') {
      const h = st === 'C' ? ROLL_HOME : ROLL_PARK;
      roll.group.position.set(h.x, TABLE_Y + roll.r, h.z); this.scene.add(roll.group);
    }
    // シール台紙
    const sh = this.sheet; sh.group.removeFromParent();
    sh.group.position.set(0, TABLE_Y, ROW_Z); sh.group.rotation.set(0, 0, 0);
    for (const m of [sh.label, ...Object.values(sh.stickers)]) { sh.group.add(m); m.position.copy(m.userData.slot); m.rotation.set(0, 0, 0); m.scale.setScalar(m.userData.slotScale); m.userData._bs = null; }
    sh.label.visible = !P.label;
    for (const k of STICKER_KINDS) sh.stickers[k].visible = !P.stickers.some(s => s.k === k);
    if (st === 'D' || st === 'E') this.scene.add(sh.group);
    this.tagPlaced();
    // 軽トラ
    const tr = this.truck; tr.group.removeFromParent();
    tr.group.position.set(-12, GROUND_Y, TRUCK_Z); tr.body.position.set(0, 0, 0); tr.body.rotation.set(0, 0, 0);
    for (const n of ['near', 'far', 'rear']) tr.setGate(n, 0);
    tr.setBlink(0); tr.setBrake(0); tr.setHeadlights(0); tr.setSteer(0);
    for (const d of this.dots) d.visible = false;
    this.room.userData.deco[1].visible = !core.low;

    this.computeCams(); this.applyCam();
    if (st === 'E') { this.lock = true; core.after(1.0, () => this.arrive()); this.stage = 'E'; core.hint.clear(); }
    else this.applyStage();
  },

  exit() {
    this.drag = null;
    if (this.truck) this.truck.setBlink(0);
  },

  stageOf() {
    const P = core.state.parcel;
    if (ITEM_KINDS.some(k => !P.items.includes(k))) return 'A';
    if (!P.closed) return 'B';
    if (!sealed(P)) return 'C';
    if (!P.label) return 'D';
    return 'E';
  },

  poseFor(kind) {
    const P = core.state.parcel, pp = packPose(kind);
    if (kind === 'drawing') {
      const sc = P.items.includes('scarf'), mk = P.items.includes('mikan');
      if (!sc && !mk) { pp.pos.y = 0.006; pp.tiltX = 0; }
      else if (!(sc && mk)) { pp.pos.y = sc ? 0.052 : 0.06; pp.tiltZ = sc ? -0.16 : 0.16; pp.pos.x += sc ? -0.01 : 0.01; }
    }
    return pp;
  },

  // ------------------------------------------------------------ カメラ
  // 縦長で余る高さは、内容を画面の下へ寄せて窓の外を見せるのに使う
  fitShift(out, center, w, h, dir, pad, bias) {
    const r = core.fitCamera(this.camera, { center, w, h, dir, fov: 40, pad, apply: false });
    const visHalf = r.dist * Math.tan(THREE.MathUtils.degToRad(20)) * (1 - (core.safe.t + core.safe.b) / core.H);
    const extra = Math.max(0, visHalf - (h / 2) * pad) * bias;
    const dn = _d.copy(dir).normalize(), up = new V3(0, 1, 0).sub(dn.clone().multiplyScalar(dn.y)).normalize();
    out.tgt.copy(center).addScaledVector(up, extra);
    out.pos.copy(r.pos).addScaledVector(up, extra);
  },
  computeCams() {
    this.fitShift(this.camA, new V3(0, 0.8, 0.0), 0.9, 0.86, new V3(0, 0.74, 1), 1.04, 0.85);
    this.fitShift(this.camE, new V3(0.1, 0.62, -1.4), 1.3, 1.8, new V3(0, 0.45, 1), 1.04, 0);
  },
  applyCam() {
    const k = core.ease.inout(clamp(this.camK, 0, 1)), cam = this.camera;
    cam.position.lerpVectors(this.camA.pos, this.camE.pos, k);
    _c.lerpVectors(this.camA.tgt, this.camE.tgt, k);
    cam.fov = 40; cam.aspect = core.aspect; cam.lookAt(_c); cam.updateProjectionMatrix();
  },
  resize() { this.computeCams(); this.applyCam(); },

  // ------------------------------------------------------------ 合図（光・ヒント）
  clearOwn() {
    for (const h of this.own) { try { h.stop ? h.stop() : h.kill && h.kill(); } catch (e) { /* noop */ } }
    this.own.length = 0;
    for (const n of FLAP_ORDER) if (this.flapFx && this.flapFx[n]) this.flapFx[n].ov.visible = false;
    this.heroFlap = null; this.hero = null;
  },
  topWorld(out) { return this.parcel.top.getWorldPosition(out); },
  topY() { return this.parcel.group.position.y + PH + (core.state.parcel.closed ? 2 * PT : 0); },

  applyStage() {
    this.clearOwn();
    const st = this.stage = this.stageOf(), P = core.state.parcel, fx = core.fx;
    this.lock = false;
    this.streak.visible = st === 'C';
    this.topGlow.visible = st === 'D';
    if (st === 'A') {
      const hero = this.hero = ITEM_KINDS.map(k => this.items[k]).find(it => it.userData.st === 'rest');
      this.own.push(fx.halo(this.parcel.group, { r: 0.2, y: 0.13, opacity: 0.55 }));
      if (hero) this.own.push(fx.pulse(hero, { amp: 0.28 }));
      const vf = new V3(), vt = new V3();
      core.hint.set({ kind: 'drag', arc: 0.06,
        from: () => (this.hero ? this.hero.getWorldPosition(vf).add(_d.set(0, 0.03, 0)) : null),
        to: () => this.topWorld(vt).add(_d.set(0, 0.04, 0.0)),
        cue: s => { if (s === 1 && this.hero) { this.hop(this.hero, 0.04); core.au.pop(1.15); } } });
    } else if (st === 'B') {
      const fl = core.state.pack.fl, name = this.heroFlap = FLAP_ORDER.find(n => !fl[n]) || 'L';
      this.flapFx[name].ov.visible = true;
      const vf = new V3(), vt = new V3();
      core.hint.set({ kind: 'drag', arc: 0.04,
        from: () => (this.heroFlap ? this.flapFx[this.heroFlap].tip.getWorldPosition(vf) : null),
        to: () => this.topWorld(vt).add(_d.set(0, 0.02, 0)),
        cue: s => { if (s === 1) this.flutter(this.heroFlap); } });
    } else if (st === 'C') {
      if (this.roll.left > 0) this.own.push(fx.pulse(this.roll.group, { amp: 0.3 }));
      const vf = new V3(), vt = new V3();
      core.hint.set({ kind: 'drag',
        from: () => this.topWorld(vf).add(_d.set(-HW + 0.03, 0.01, 0)),
        to: () => this.topWorld(vt).add(_d.set(HW - 0.02, 0.01, 0)),
        cue: s => { if (s === 1) { this.hop(this.roll.group, 0.03); core.au.tick(); this.streakBoost = 1; } } });
    } else if (st === 'D') {
      const lab = this.sheet.label;
      if (lab.visible) {
        this.own.push(fx.pulse(lab, { amp: 0.22 }));
        this.own.push(fx.halo(lab, { r: 0.075, y: -0.004, opacity: 0.18 }));
      }
      const vf = new V3(), vt = new V3();
      core.hint.set({ kind: 'drag', arc: 0.08,
        from: () => lab.getWorldPosition(vf),
        to: () => this.topWorld(vt).add(_d.set(0, 0.01, 0)),
        cue: s => { if (s === 1) { this.hop(lab, 0.025); core.au.pop(1.3); } } });
    } else if (st === 'E') {
      if (this.truckSt !== 'parked') { core.hint.clear(); return; }
      this.own.push(fx.halo(this.truck.bed, { r: 0.36, y: 0.2, opacity: 0.2 }));
      this.own.push(fx.halo(this.parcel.group, { r: 0.3, y: PH * 0.6, opacity: 0.22 }));
      this.dotsOn = true;
      const vf = new V3(), vt = new V3();
      core.hint.set({ kind: 'drag', arc: 0.5, d1: 4, d2: 7,
        from: () => this.parcel.group.getWorldPosition(vf).add(_d.set(0, PH + 0.02, 0)),
        to: () => this.truck.bed.localToWorld(vt.copy(BED_LOCAL)).add(_d.set(0, 0.25, 0)),
        cue: s => { if (s === 1) { S.horn(0.8); this.blinkBoost = 1.6; this.hop(this.parcel.group, 0.025); } } });
    }
  },

  // ちいさく跳ねる（合図・タップの反応）
  hop(obj, h = 0.03) {
    if (obj.userData._hop) return;
    const y0 = obj.position.y;
    obj.userData._hop = core.tween(0.38, (k, raw) => { obj.position.y = y0 + Math.sin(raw * PI) * h; }, { ease: 'linear', done: () => { obj.position.y = y0; obj.userData._hop = null; } });
  },
  flutter(name) {
    const f = this.parcel.flaps[name]; if (!f || f.t < 0.9) return;
    core.au.knock(1.6);
    core.tween(0.5, (k, raw) => { if (!this.drag) this.parcel.setFlap(name, 1 - 0.14 * Math.sin(raw * PI * 2) * (1 - raw)); }, { ease: 'linear' });
  },

  // ------------------------------------------------------------ 入力
  onDown(p) {
    if (this.lock || this.leaving || this.drag) return;
    const st = this.stage;
    if (st === 'A') {
      const cands = ITEM_KINDS.map(k => this.items[k]).filter(it => it.userData.st === 'rest');
      const it = core.pick(p, cands, 24);
      if (it) return this.startItem(it, p);
      if (core.pick(p, [this.boxHit], 10)) return this.tapBox();
    } else if (st === 'B') {
      const fl = core.state.pack.fl;
      const an = core.pick(p, FLAP_ORDER.filter(n => !fl[n]).map(n => this.flapFx[n].an), 30);
      if (an) return this.startFlap(an.userData.flap, p);
      if (core.pick(p, [this.boxHit], 10)) return this.tapBox();
    } else if (st === 'C') {
      if (this.roll.left > 0 && core.pick(p, [this.roll.group], 26)) return this.startTape(p, false);
      if (this.roll.left > 0 && this.topLocal(p, 0.01)) return this.startTape(p, true);
      if (this.roll.left <= 0 && core.pick(p, [this.roll.group], 26)) return this.tapCore();
      if (core.pick(p, [this.boxHit], 10)) return this.tapBox();
    } else if (st === 'D' || st === 'E') {
      const sheetC = [this.sheet.label, ...Object.values(this.sheet.stickers)].filter(m => m.visible && m.parent === this.sheet.group);
      const sm = core.pick(p, sheetC, st === 'E' ? 12 : 22);
      if (sm) return this.startDecor(sm, p);
      const placed = core.pick(p, this.parcel.stickerMeshes.filter(m => m.parent === this.parcel.top), 6);
      if (placed) { this.drag = { type: 'placed', m: placed, p0x: p.x, p0y: p.y }; core.fx.squash(placed, { amt: 0.3, dur: 0.3 }); core.au.pop(1.6); return; }
      if (this.roll.group.parent && this.roll.left > 0 && !this.roll.group.userData._tw && core.pick(p, [this.roll.group], 14)) return this.startTape(p, false);
      if (st === 'E' && this.truckSt === 'parked' && core.pick(p, [this.boxHit], 40)) return this.startBox(p);
      if (st === 'E' && this.truckSt === 'parked' && core.pick(p, [this.truckHit], 10)) { S.horn(1); this.blinkBoost = 1.2; return; }
      if (this.roll.group.parent && core.pick(p, [this.roll.group], 16)) return this.tapCore();
      if (core.pick(p, [this.boxHit], 10)) return this.tapBox();
    }
  },
  onMove(p) {
    const d = this.drag; if (!d) return;
    if (d.type === 'item') {
      // 箱の近くでは箱の口より上に持ち上げる
      if (core.onPlane(p, d.pt.y, _a)) {
        const x = _a.x + d.off.x, z = _a.z + d.off.z, ud = d.it.userData;
        const near = Math.abs(x - BOX_X) < HW + ud.w / 2 + 0.06 && Math.abs(z - BOX_Z) < HD + ud.d / 2 + 0.06;
        d.pt.set(x, near ? TABLE_Y + PH + 0.07 : TABLE_Y + 0.12, z);
      }
    }
    else if (d.type === 'flap') this.moveFlap(p);
    else if (d.type === 'tape') this.moveTape(p);
    else if (d.type === 'decor') { if (core.onPlane(p, this.topY() + 0.035, _a)) d.pt.copy(_a); }
    else if (d.type === 'placed') {
      if (Math.hypot(p.x - d.p0x, p.y - d.p0y) > 10) {
        // 貼ったシールを掴み直す
        const m = d.m, i = this.parcel.stickerMeshes.indexOf(m), k = m.userData.k;
        if (i < 0) { this.drag = null; return; }
        m.getWorldPosition(_b); const r = m.rotation.y;
        this.parcel.removeSticker(i); core.save(); this.tagPlaced();
        const sm = this.sheet.stickers[k]; sm.visible = true;
        this.scene.attach(sm); sm.position.copy(_b); sm.rotation.set(0, r, 0); sm.scale.setScalar(1);
        this.drag = null; this.startDecor(sm, p, true);
      }
    } else if (d.type === 'box') this.moveBox(p);
  },
  onUp(p) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.type === 'item') this.upItem(d, p);
    else if (d.type === 'flap') this.upFlap(d, p);
    else if (d.type === 'tape') this.upTape(d, p);
    else if (d.type === 'decor') this.upDecor(d, p);
    else if (d.type === 'box') this.upBox(d, p);
  },

  tapBox() {
    const n = core.state.parcel.items.length + (core.state.parcel.closed ? 1 : 0);
    core.au.knock(1.15 - 0.13 * n); if (n) core.au.thud(0.12 + 0.12 * n);
    core.fx.wobble(this.parcel.group, { amp: 0.02, speed: 22, axis: 'z', dur: 0.3 });
  },
  tapCore() {
    const g = this.roll.group, x0 = g.position.x, sp = this.roll.spin, r0 = sp.rotation.z;
    core.au.knock(2.2); S.rollRumble(0.4, 0.06);
    core.tween(0.6, (k, raw) => { const dx = Math.sin(raw * PI) * 0.03; g.position.x = x0 - dx; sp.rotation.z = r0 + dx / this.roll.r; }, { ease: 'linear', done: () => { g.position.x = x0; } });
  },

  // ------------------------------------------------------------ A いれる
  startItem(it, p) {
    it.userData.st = 'drag';
    if (it.userData._hop) { it.userData._hop.kill(); it.userData._hop = null; it.position.y = it.userData.rest.y; }
    const pt = new V3(it.position.x, TABLE_Y + 0.12, it.position.z), off = new V3();
    if (core.onPlane(p, TABLE_Y + 0.12, _a)) { off.set(it.position.x - _a.x, 0, it.position.z - _a.z); off.multiplyScalar(0.5); pt.set(_a.x + off.x, TABLE_Y + 0.12, _a.z + off.z); }
    this.drag = { type: 'item', it, pt, off, t0: core.time };
    S.lift();
  },
  upItem(d, p) {
    const it = d.it, k = it.userData.kind, ud = it.userData;
    const tap = p.moved < 10 && core.time - d.t0 < 0.5;
    const x = d.pt.x, z = d.pt.z;
    const dx = x - BOX_X, dz = z - BOX_Z, hw = ud.w / 2, hd = ud.d / 2;
    if (!tap && !p.cancel && (Math.hypot(dx, dz) < 0.3 || (Math.abs(dx) < HW + hw * 0.7 && Math.abs(dz) < HD + hd * 0.7))) return this.packItem(it);
    // テーブルの上にそっと置く（縁の内側）
    let tx = x, tz = z;
    if (tap) { tx = ud.rest.x; tz = ud.rest.z; }
    tx = clamp(tx, -TABLE_W / 2 + hw + 0.02, TABLE_W / 2 - hw - 0.02); tz = clamp(tz, -TABLE_D / 2 + hd + 0.02, TABLE_D / 2 - hd - 0.02);
    if (Math.abs(tx - BOX_X) < HW + hw + 0.02 && Math.abs(tz - BOX_Z) < HD + hd + 0.02) { tx = ud.rest.x; tz = ud.rest.z; }
    const s = it.position.clone(), rz = it.rotation.z, rx = it.rotation.x;
    ud.st = 'anim';
    core.tween(tap ? 0.16 : 0.3, kk => {
      it.position.set(lerp(s.x, tx, kk), lerp(s.y, TABLE_Y, kk), lerp(s.z, tz, kk));
      it.rotation.z = lerp(rz, 0, kk); it.rotation.x = lerp(rx, 0, kk);
    }, { ease: 'out', done: () => {
      ud.st = 'rest'; ud.rest = it.position.clone();
      if (tap) this.tapItem(it); else { core.au.thud(0.18); core.au.noise({ dur: 0.05, g: 0.08, f: 800, type: 'lowpass' }); }
    } });
  },
  tapItem(it) {
    const k = it.userData.kind;
    if (k === 'scarf') { core.fx.squash(it, { amt: 0.28, dur: 0.38 }); S.squish(); }
    else if (k === 'mikan') {
      S.rolls(3);
      it.userData.fruits.forEach((f, i) => {
        const b = f.userData.basePos, r = f.userData.baseRot;
        core.tween(0.42, (kk, raw) => { const e = Math.sin(raw * PI); f.position.y = b.y + e * 0.012; f.rotation.z = r.z + Math.sin(raw * PI * 2) * 0.25 * (1 - raw); }, { ease: 'linear', delay: i * 0.08, done: () => { f.position.copy(b); f.rotation.copy(r); } });
      });
    } else {
      core.au.rustle();
      const y0 = it.position.y;
      core.tween(0.5, (kk, raw) => { const e = Math.sin(raw * PI); it.rotation.z = e * 0.22; it.position.y = y0 + e * 0.012; }, { ease: 'linear', done: () => { it.rotation.z = 0; it.position.y = y0; } });
    }
  },
  packItem(it) {
    const P = core.state.parcel, k = it.userData.kind;
    if (!P.items.includes(k)) P.items.push(k);
    core.save();
    it.userData.st = 'anim'; this.lock = true; core.hint.clear(); this.clearOwn();
    // 絵が先に入っていたら、下に入るぶん持ち上げる
    const dr = this.items.drawing;
    if (k !== 'drawing' && dr.userData.st === 'packed') {
      const pp = this.poseFor('drawing'), s = dr.position.clone(), r = dr.rotation.clone();
      core.tween(0.3, kk => { dr.position.lerpVectors(s, pp.pos, kk); dr.rotation.set(lerp(r.x, pp.tiltX, kk), lerp(r.y, pp.rotY, kk), lerp(r.z, pp.tiltZ || 0, kk)); }, { ease: 'out' });
    }
    this.parcel.group.attach(it);
    const pp = this.poseFor(k), s = it.position.clone(), r = it.rotation.clone();
    const m = new V3(pp.pos.x, PH + 0.1, pp.pos.z), e = pp.pos;
    core.tween(0.42, kk => {
      const a = (1 - kk) * (1 - kk), b = 2 * kk * (1 - kk), c = kk * kk;
      it.position.set(a * s.x + b * m.x + c * e.x, a * s.y + b * m.y + c * e.y, a * s.z + b * m.z + c * e.z);
      it.rotation.set(lerp(r.x, pp.tiltX, kk), lerp(r.y, pp.rotY, kk), lerp(r.z, pp.tiltZ || 0, kk));
    }, { ease: 'in', done: () => {
      it.userData.st = 'packed';
      if (k === 'scarf') { S.pof(); core.fx.squash(it, { amt: 0.18, dur: 0.3 }); }
      else if (k === 'mikan') { S.rolls(3); core.au.thud(0.25); }
      else { core.au.rustle(); core.au.noise({ dur: 0.1, g: 0.08, f: 2600, at: 0.08 }); }
      core.fx.wobble(this.parcel.group, { amp: 0.025, speed: 20, axis: 'z', dur: 0.4 });
      this.parcel.top.getWorldPosition(_a);
      core.fx.burst(_a, { n: 6, kind: 'dot', colors: [0xfff2c8, 0xffffff], size: 0.016, speed: 0.3, life: 0.55, gravity: -0.4, up: 0.6 });
      const done = ITEM_KINDS.every(kk => P.items.includes(kk));
      if (done) { core.au.sparkle(74); core.after(0.6, () => this.applyStage()); }
      else core.after(0.12, () => this.applyStage());
    } });
  },

  // ------------------------------------------------------------ B しめる
  startFlap(name, p) {
    const fl = core.state.pack.fl;
    if ((name === 'F' || name === 'B') && (!fl.L || !fl.R)) { for (const n of ['L', 'R']) if (!fl[n]) this.closeFlap(n, true); }
    const f = this.parcel.flaps[name];
    f.pivot.getWorldPosition(_a); this.topWorld(_b);
    core.toScreen(_a, _s0); core.toScreen(_b, _s1);
    let ux = _s1.x - _s0.x, uy = _s1.y - _s0.y; const len = Math.max(30, Math.hypot(ux, uy)); ux /= len; uy /= len;
    this.drag = { type: 'flap', name, t0: f.t, sx: p.x, sy: p.y, ux, uy, L: Math.max(70, len * 1.5) };
    this.flapFx[name].ov.visible = false;
    core.au.tick();
  },
  moveFlap(p) {
    const d = this.drag, s = (p.x - d.sx) * d.ux + (p.y - d.sy) * d.uy;
    this.parcel.setFlap(d.name, clamp(d.t0 - s / d.L, 0, 1.15));
  },
  upFlap(d, p) {
    const f = this.parcel.flaps[d.name];
    if (p.moved < 12 || f.t < 0.55) this.closeFlap(d.name);
    else {
      const t0 = f.t; core.au.whoosh(0.4);
      core.tween(0.3, k => this.parcel.setFlap(d.name, lerp(t0, 1, k)), { ease: 'back', done: () => { if (this.stage === 'B' && this.heroFlap) this.flapFx[this.heroFlap].ov.visible = true; } });
    }
  },
  closeFlap(name, quick) {
    const ps = core.state.pack, P = core.state.parcel;
    if (ps.fl[name]) return;
    if ((name === 'F' || name === 'B') && (!ps.fl.L || !ps.fl.R)) { for (const n of ['L', 'R']) this.closeFlap(n, true); }
    ps.fl[name] = 1; core.save();
    const f = this.parcel.flaps[name], t0 = f.t;
    this.flapFx[name].ov.visible = false;
    const allDone = FLAP_ORDER.every(n => ps.fl[n]);
    if (allDone) { this.lock = true; core.hint.clear(); }
    core.tween(quick ? 0.14 : 0.18 * Math.max(0.4, t0), k => this.parcel.setFlap(name, lerp(t0, 0, k)), { ease: 'in', delay: (name === 'F' || name === 'B') && quick === undefined ? 0.05 : 0, done: () => {
      core.au.thud(quick ? 0.22 : 0.4); core.au.knock(0.75);
      this.flapFx[name].tip.getWorldPosition(_a);
      core.fx.burst(_a, { n: core.low ? 4 : 8, kind: 'dot', colors: [0xf3e7d2, 0xffffff, 0xe8d9bd], size: 0.012, speed: 0.22, life: 0.7, gravity: -0.12, up: 0.4 });
      core.fx.wobble(this.parcel.group, { amp: 0.012, speed: 24, axis: 'x', dur: 0.25 });
      if (allDone && !P.closed) {
        P.closed = true; core.save();
        for (const k of ITEM_KINDS) this.items[k].visible = false;
        core.au.sparkle(72);
        core.after(0.5, () => this.rollIn());
      } else if (!allDone && this.stage === 'B') {
        this.applyStage();
      }
    } });
  },

  // ------------------------------------------------------------ C テープ
  rollIn() {
    const g = this.roll.group, sp = this.roll.spin;
    this.roll.setLeft(MAX_TAPES - core.state.parcel.tapes.length);
    g.rotation.set(0, 0, 0); g.position.set(0.85, TABLE_Y + this.roll.r, ROLL_HOME.z); this.scene.add(g);
    S.rollRumble(1.1, 0.12);
    const x0 = 0.85;
    core.tween(1.15, k => { const x = lerp(x0, ROLL_HOME.x, k); sp.rotation.z = (x0 - x) / this.roll.r; g.position.x = x; }, { ease: 'out', done: () => { core.au.knock(1.4); this.applyStage(); } });
  },
  topLocal(p, margin, out = _c) {
    const y = this.topY(); if (!core.onPlane(p, y, out)) return null;
    this.topWorld(_d);
    const lx = out.x - _d.x, lz = out.z - _d.z;
    if (Math.abs(lx) > HW + margin || Math.abs(lz) > HD + margin) return null;
    return { x: lx, z: lz };
  },
  startTape(p, fromTop) {
    this.clearOwn();
    const g = this.roll.group;
    if (g.userData._tw) { g.userData._tw.kill(); g.userData._tw = null; }
    const d = this.drag = { type: 'tape', idx: -1, seam: false, x0: 0, z0: 0, x1: 0, z1: 0, pt: g.position.clone(), last: core.time, len: 0, force: !sealed(core.state.parcel) && core.state.parcel.tapes.length >= MAX_TAPES - 1 };
    this.streak.visible = false;
    core.au.tick(); S.lift();
    const self = this;
    core.au.ready(() => { if (self.drag === d && !self.tapeSnd) self.tapeSnd = core.au.loop({ kind: 'noise', type: 'bandpass', f: 1400, q: 1.6 }); });
    if (fromTop) { core.au.whoosh(0.5); }
    this.moveTape(p);
  },
  moveTape(p) {
    const d = this.drag, parcel = this.parcel;
    const loc = this.topLocal(p, 0.012, _a);
    const ty = this.topY();
    // 巻きの追う位置
    if (loc) d.pt.set(_a.x, ty + this.roll.r + 0.006, _a.z);
    else if (core.onPlane(p, TABLE_Y + 0.12, _b)) d.pt.set(_b.x, TABLE_Y + 0.12 + this.roll.r, _b.z);
    if (d.idx < 0) {
      if (loc && !d.cut) {
        d.x0 = d.x1 = clamp(loc.x, -HW, HW); d.z0 = d.z1 = clamp(loc.z, -HD, HD);
        if (d.force) { d.z0 = d.z1 = 0; }
        d.idx = parcel.addTape({ x0: d.x0, z0: d.z0, x1: d.x0 + 0.001, z1: d.z0 });
        core.save(); this.roll.setLeft(MAX_TAPES - core.state.parcel.tapes.length);
        core.au.peta(0.35);
      }
      return;
    }
    if (!loc) { this.finishTape(d, true); return; }
    let x1 = clamp(loc.x, -HW, HW), z1 = clamp(loc.z, -HD, HD);
    const dx = x1 - d.x0, dz = z1 - d.z0;
    d.seam = d.force || (Math.abs(d.z0) < 0.06 && (Math.hypot(dx, dz) < 0.03 || Math.abs(dz) < 0.45 * Math.abs(dx)));
    let z0 = d.z0;
    if (d.seam) { z0 = 0; z1 = 0; }
    const len = Math.hypot(x1 - d.x0, z1 - z0);
    if (Math.abs(x1 - d.x1) + Math.abs(z1 - d.z1) > 0.002 || d.seam !== d.wasSeam) {
      const grow = len - d.len;
      d.x1 = x1; d.z1 = z1; d.len = len; d.wasSeam = d.seam;
      parcel.updateTape(d.idx, { x0: d.x0, z0, x1, z1 });
      this.roll.spin.rotation.z -= grow / this.roll.r;
      d.speed = Math.abs(grow) / Math.max(0.016, core.time - d.last); d.last = core.time;
      if (Math.hypot(x1 - d.x0, z1 - z0) > 0.01) this.roll.group.rotation.y = Math.atan2(-(z1 - z0), x1 - d.x0);
    }
  },
  upTape(d) { this.finishTape(d, false); },
  finishTape(d, cutOut) {
    if (d.done) return; d.done = true;
    if (this.drag === d) this.drag = null;
    if (this.tapeSnd) { this.tapeSnd.stop(0.08); this.tapeSnd = null; }
    const P = core.state.parcel, parcel = this.parcel;
    const back = () => this.rollHome(this.stageOf() === 'C' ? ROLL_HOME : ROLL_PARK);
    const re = () => core.after(0.4, () => { if (!this.drag && !this.lock && !this.leaving) this.applyStage(); });
    if (d.idx < 0) { back(); re(); return; }
    const z0 = d.seam ? 0 : d.z0, z1 = d.seam ? 0 : d.z1;
    const len = Math.hypot(d.x1 - d.x0, z1 - z0);
    if (len < 0.08) {
      parcel.removeTape(d.idx); core.save(); this.roll.setLeft(MAX_TAPES - P.tapes.length);
      core.au.tick(); back(); re(); return;
    }
    const wasSealed = this.stage !== 'C';
    if (d.seam && Math.abs(d.x1 - d.x0) >= PW / 2) {
      // ぺたーっ: 左右の縁まで自動で伸びて回り込む
      const dir = Math.sign(d.x1 - d.x0) || 1, ax = d.x0, bx1 = d.x1, ex0 = -dir * HW, ex1 = dir * HW, idx = d.idx;
      this.lock = true; S.long();
      core.tween(0.38, k => parcel.updateTape(idx, { x0: lerp(ax, ex0, k), z0: 0, x1: lerp(bx1, ex1, k), z1: 0 }), { ease: 'out', done: () => {
        core.save(); core.au.peta(0.6);
        parcel.top.getWorldPosition(_a);
        core.fx.burst(_a, { n: 10, kind: 'star', size: 0.02, speed: 0.4, life: 0.7 });
        this.lock = false; back();
        if (!wasSealed && sealed(P)) { core.au.sparkle(76); this.lock = true; core.hint.clear(); core.after(0.7, () => this.toD()); }
        else if (!this.drag && !this.leaving) this.applyStage();
      } });
      return;
    }
    S.pi(); core.save(); back();
    if (!wasSealed && sealed(P)) { core.au.sparkle(76); this.lock = true; core.hint.clear(); core.after(0.6, () => this.toD()); }
    else core.after(0.3, () => { if (!this.drag && !this.lock && !this.leaving) this.applyStage(); });
  },
  rollHome(h) {
    const g = this.roll.group, s = g.position.clone(), sp = this.roll.spin, r0 = sp.rotation.z, ry = g.rotation.y;
    const e = new V3(h.x, TABLE_Y + this.roll.r, h.z);
    if (g.userData._tw) g.userData._tw.kill();
    g.userData._tw = core.tween(0.5, k => {
      g.position.lerpVectors(s, e, k); g.position.y += Math.sin(k * PI) * 0.03;
      g.rotation.y = lerp(ry, 0, k); sp.rotation.z = r0 + (s.x - g.position.x) / this.roll.r;
    }, { ease: 'out', done: () => { g.userData._tw = null; core.au.knock(1.5); } });
  },

  // ------------------------------------------------------------ D ぺたっ
  toD() {
    const P = core.state.parcel;
    this.clearOwn(); this.streak.visible = false;
    this.rollHome(ROLL_PARK); S.rollRumble(0.6, 0.08);
    const g = this.sheet.group; g.position.set(-1.1, TABLE_Y + 0.25, ROW_Z); g.rotation.set(0, 0, 0.3); this.scene.add(g);
    for (const k of STICKER_KINDS) this.sheet.stickers[k].visible = !P.stickers.some(s => s.k === k);
    this.sheet.label.visible = !P.label;
    core.au.whoosh(0.6);
    core.tween(0.9, (k) => {
      const a = Math.min(1, k * 1.6);
      g.position.x = lerp(-1.1, 0, k); g.position.y = TABLE_Y + 0.25 * (1 - a) * (1 - a); g.rotation.z = 0.3 * (1 - a);
    }, { ease: 'out', done: () => { g.position.set(0, TABLE_Y, ROW_Z); g.rotation.set(0, 0, 0); core.au.noise({ dur: 0.08, g: 0.15, f: 1800, q: 0.8 }); this.applyStage(); } });
  },
  startDecor(m, p, regrab) {
    const isLabel = m.userData.kind === 'label';
    if (this.stage === 'D' && isLabel) this.clearOwn();
    if (!regrab) {
      this.scene.attach(m); S.peel();
      const s = m.scale.x;
      core.tween(0.12, k => m.scale.setScalar(lerp(s, 1, k)), { ease: 'out' });
    } else S.peel();
    const pt = m.position.clone(); pt.y = this.topY() + 0.035;
    if (core.onPlane(p, this.topY() + 0.035, _a)) pt.copy(_a);
    this.drag = { type: 'decor', m, pt, isLabel, wob: Math.random() * 6 };
  },
  upDecor(d, p) {
    const m = d.m, P = core.state.parcel, parcel = this.parcel;
    const loc = p.cancel ? null : this.topLocal(p, 0.035, _a);
    if (loc && !(d.isLabel && P.label)) {
      const hw = d.isLabel ? LABEL_W / 2 : STICKER_SIZE / 2, hd = d.isLabel ? LABEL_D / 2 : STICKER_SIZE / 2;
      const x = clamp(loc.x, -HW + hw + 0.006, HW - hw - 0.006), z = clamp(loc.z, -HD + hd + 0.006, HD - hd - 0.006);
      const r = (Math.random() - 0.5) * (d.isLabel ? 0.16 : 0.5);
      this.topWorld(_b); const tgt = new V3(_b.x + x, this.topY() + 0.003, _b.z + z);
      const s = m.position.clone(), r0 = m.rotation.y;
      this.lock = true;
      core.tween(0.1, k => { m.position.lerpVectors(s, tgt, k); m.rotation.y = lerp(r0, r, k); }, { ease: 'in', done: () => {
        this.returnToSheet(m, true);
        let mesh;
        if (d.isLabel) { parcel.setLabel({ x, z, r }); mesh = parcel.labelMesh; core.au.peta(1); }
        else { const i = parcel.addSticker({ k: m.userData.k, x, z, r }); mesh = parcel.stickerMeshes[i]; S.petaVar(0.85 + Math.random() * 0.4); }
        core.save(); this.tagPlaced();
        if (mesh) core.fx.squash(mesh, { amt: 0.35, dur: 0.32 });
        const g = parcel.group, y0 = g.position.y;
        core.tween(0.3, (k, raw) => { g.position.y = y0 - Math.sin(raw * PI) * 0.008; }, { ease: 'linear', done: () => { g.position.y = y0; } });
        core.fx.burst(tgt, { n: d.isLabel ? 12 : 7, kind: 'star', size: 0.018, speed: 0.4, life: 0.6, gravity: -0.6 });
        this.lock = false;
        if (d.isLabel && this.stage === 'D') {
          this.lock = true; core.hint.clear(); this.clearOwn(); this.topGlow.visible = false;
          core.au.sparkle(77);
          core.after(1.0, () => this.arrive());
        } else if (this.stage === 'D') this.applyStage();
      } });
      return;
    }
    // 台紙へ戻す
    const slot = m.userData.slot, wpos = this.sheet.group.localToWorld(slot.clone()), s = m.position.clone(), sc = m.scale.x, r0 = m.rotation.y;
    m.userData.st = 'back';
    core.tween(0.3, k => { m.position.lerpVectors(s, wpos, k); m.position.y += Math.sin(k * PI) * 0.03; m.scale.setScalar(lerp(sc, m.userData.slotScale, k)); m.rotation.y = lerp(r0, 0, k); }, { ease: 'inout', done: () => {
      this.returnToSheet(m, false); core.au.tick();
      if (this.stage === 'D' && d.isLabel) this.applyStage();
    } });
  },
  returnToSheet(m, used) {
    this.sheet.group.add(m); m.position.copy(m.userData.slot); m.rotation.set(0, 0, 0); m.scale.setScalar(m.userData.slotScale);
    m.visible = !used;
  },
  tagPlaced() { for (const m of this.parcel.stickerMeshes) m.userData.hitR = 0.03; },

  // ------------------------------------------------------------ E おくりだす
  arrive() {
    if (this.truckSt !== 'none') return;
    this.stage = 'E'; this.truckSt = 'arriving'; this.lock = false;
    core.hint.clear(); this.clearOwn(); this.topGlow.visible = false;
    const tr = this.truck, g = tr.group, x0 = -12;
    g.position.set(x0, GROUND_Y, TRUCK_Z); this.scene.add(g);
    tr.setHeadlights(0.6);
    core.au.ready(() => { if (this.truckSt === 'none') return; this.engine = core.au.loop({ kind: 'osc', osc: 'sawtooth', type: 'lowpass', f: 240, q: 1.2, pitch: 46 }); this.engine.set({ g: 0.02 }, 0.01); this.engine.set({ g: 0.09, pitch: 58, f: 320 }, 0.6); });
    // カメラをゆっくり引く
    const ck = this.camK;
    core.tween(3.2, k => { this.camK = lerp(ck, 1, k); }, { ease: 'inout' });
    let lastX = x0;
    core.tween(3.4, k => {
      const x = lerp(x0, TRUCK_X, k); g.position.x = x; tr.roll(x - lastX); lastX = x;
      if (k > 0.75) tr.setBrake(1);
      if (this.engine) this.engine.set({ pitch: 40 + 22 * (1 - k), g: 0.05 + 0.05 * (1 - k) });
    }, { ease: 'out', done: () => {
      // ブレーキで前のめり → 戻る
      core.au.noise({ dur: 0.25, g: 0.07, f: 3000, q: 6 });
      core.tween(0.9, (k, raw) => { tr.body.rotation.z = -0.028 * Math.sin(raw * PI * 2.2) * Math.exp(-raw * 3.2); }, { ease: 'linear', done: () => { tr.body.rotation.z = 0; } });
      core.after(0.5, () => { tr.setBrake(0); if (this.engine) this.engine.set({ g: 0.035, pitch: 34 }, 0.3); S.horn(1); });
      core.after(1.2, () => {
        core.tween(0.55, k => tr.setGate('near', k), { ease: 'bounce', done: () => {} });
        core.after(0.32, () => S.gate());
      });
      core.after(1.9, () => { this.truckSt = 'parked'; this.applyStage(); });
    } });
  },
  bedTarget(out) { return this.truck.bed.localToWorld(out.copy(BED_LOCAL)); },
  pathPoint(s, out) {
    const a = this.flyFrom, b = this.flyTo;
    const cx = (a.x + b.x) / 2, cy = Math.max(a.y, b.y) + 0.85, cz = (a.z + b.z) / 2;
    const u = 1 - s;
    return out.set(u * u * a.x + 2 * u * s * cx + s * s * b.x, u * u * a.y + 2 * u * s * cy + s * s * b.y, u * u * a.z + 2 * u * s * cz + s * s * b.z);
  },
  startBox(p) {
    this.clearOwn(); this.dotsOn = false;
    const hg = this.parcel.group.userData._hop; if (hg) { hg.kill(); this.parcel.group.userData._hop = null; this.parcel.group.position.y = TABLE_Y; }
    this.flyFrom = new V3(BOX_X, TABLE_Y + 0.06, BOX_Z); this.flyTo = this.bedTarget(new V3());
    core.toScreen(_a.set(BOX_X, TABLE_Y + PH / 2, BOX_Z), _s0); this.pathPoint(0.6, _b); core.toScreen(this.bedTarget(_c).add(_d.set(0, PH / 2, 0)), _s1);
    const d = this.drag = { type: 'box', s: 0, lat: 0, ax: _s0.x, ay: _s0.y, bx: _s1.x, by: _s1.y, pt: new V3() };
    S.lift(); core.au.pop(0.9);
    this.pathPoint(0, d.pt);
  },
  moveBox(p) {
    const d = this.drag;
    const vx = d.bx - d.ax, vy = d.by - d.ay, l2 = Math.max(1, vx * vx + vy * vy), l = Math.sqrt(l2);
    const rx = p.x - d.ax, ry = p.y - d.ay;
    d.s = clamp((rx * vx + ry * vy) / l2, 0, 1);
    const lat = (rx * vy - ry * vx) / l; // 画面上の横ずれ(px)
    d.lat = clamp(-lat * 0.0015, -0.16, 0.16) * (1 - d.s * 0.7);
  },
  upBox(d) {
    const g = this.parcel.group;
    if (d.s > 0.55) {
      this.leaving = true; core.hint.clear();
      const s0 = d.s, l0 = d.lat;
      core.au.whoosh(0.8);
      core.tween(0.55 * (1 - s0) + 0.25, k => { this.pathPoint(lerp(s0, 1, k), g.position); g.position.x += l0 * (1 - k); g.rotation.z = Math.sin(k * PI) * 0.08; }, { ease: 'inout', done: () => this.landBox() });
    } else {
      const p0 = g.position.clone(), r0 = g.rotation.z, e = new V3(BOX_X, TABLE_Y, BOX_Z);
      core.tween(0.45 + d.s * 0.4, k => { g.position.lerpVectors(p0, e, k); g.position.y += Math.sin(k * PI) * 0.06; g.rotation.z = lerp(r0, 0, k); }, { ease: 'inout', done: () => {
        g.position.set(BOX_X, TABLE_Y, BOX_Z); g.rotation.set(0, 0, 0); core.au.thud(0.35); this.applyStage();
      } });
    }
  },
  landBox() {
    const tr = this.truck, g = this.parcel.group;
    tr.bed.attach(g); g.position.copy(BED_LOCAL); g.rotation.set(0, 0, 0);
    core.au.thud(1.0); core.au.knock(0.6);
    g.getWorldPosition(_a); core.fx.burst(_a, { n: 10, kind: 'dot', colors: [0xf3e7d2, 0xffffff], size: 0.03, speed: 0.6, life: 0.7, gravity: -0.4, up: 0.3 });
    core.tween(0.9, (k, raw) => { tr.body.position.y = -0.04 * Math.sin(raw * PI * 3) * Math.exp(-raw * 3.5); }, { ease: 'linear', done: () => { tr.body.position.y = 0; } });
    core.au.sparkle(79);
    core.after(0.8, () => { core.tween(0.45, k => tr.setGate('near', 1 - k), { ease: 'in', done: () => S.latch() }); });
    core.after(1.6, () => { S.horn(1); this.blinkBoost = 0; this.hazardOff = true; tr.setBlink(0); });
    core.after(2.2, () => {
      if (this.engine) this.engine.set({ g: 0.11, pitch: 70, f: 420 }, 0.4);
      const x0 = tr.group.position.x; let lastX = x0;
      core.tween(3.0, k => { const x = x0 + k * k * 10; tr.group.position.x = x; tr.roll(x - lastX); lastX = x; tr.body.rotation.z = 0.012 * Math.sin(Math.min(1, k * 3) * PI); }, { ease: 'linear' });
      core.after(1.5, () => core.go('trip', { color: '#fff', dur: 0.8 }));
    });
  },

  // ------------------------------------------------------------ 毎フレーム
  update(dt, t) {
    if (this.camK > 0) this.applyCam();
    // 影が切られた（低負荷モード）ときは日差しを弱めて白飛びを防ぐ
    const li = this.sun.castShadow ? 2.5 : 1.5; if (this.sun.intensity !== li) this.sun.intensity = li;
    const d = this.drag, kf = 1 - Math.exp(-dt * 22);
    if (d && d.type === 'item') {
      const it = d.it, px = it.position.x, pz = it.position.z;
      it.position.lerp(d.pt, kf);
      const vx = (it.position.x - px) / Math.max(dt, 1e-3), vz = (it.position.z - pz) / Math.max(dt, 1e-3);
      it.rotation.z = lerp(it.rotation.z, clamp(-vx * 0.35, -0.3, 0.3), kf);
      it.rotation.x = lerp(it.rotation.x, clamp(0.12 + vz * 0.3, -0.3, 0.4), kf);
    } else if (d && d.type === 'tape') {
      this.roll.group.position.lerp(d.pt, 1 - Math.exp(-dt * 30));
      if (this.tapeSnd) { const sp = clamp((d.speed || 0) / 0.6, 0, 1); this.tapeSnd.set({ g: 0.05 + 0.22 * sp, f: 900 + 1600 * sp }, 0.05); d.speed = (d.speed || 0) * Math.exp(-dt * 8); }
    } else if (d && d.type === 'decor') {
      d.m.position.lerp(d.pt, kf); d.wob += dt * 5; d.m.rotation.y = Math.sin(d.wob) * 0.08;
    } else if (d && d.type === 'box') {
      this.pathPoint(d.s, _a); _a.x += d.lat;
      const g = this.parcel.group; const px = g.position.x;
      g.position.lerp(_a, kf);
      g.rotation.z = lerp(g.rotation.z, clamp(-(g.position.x - px) / Math.max(dt, 1e-3) * 0.2, -0.15, 0.15) + Math.sin(d.s * PI) * 0.06, kf);
    }
    // A: 主役がときどき小さく跳ねる
    if (this.stage === 'A' && this.hero && this.hero.userData.st === 'rest' && !this.hero.userData._hop) {
      const ph = (t % 2.7);
      this.hero.position.y = this.hero.userData.rest.y + (ph < 0.32 ? Math.sin(ph / 0.32 * PI) * 0.016 : 0);
    }
    // B: 光るフラップ
    if (this.stage === 'B' && this.heroFlap) { const ov = this.flapFx[this.heroFlap].ov; ov.material.opacity = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3.4)); }
    // C: 合わせ目の光の筋
    if (this.streak.visible) {
      const ph = (t % 1.5) / 1.5; this.streakBoost = Math.max(0, (this.streakBoost || 0) - dt * 0.6);
      this.streakDot.position.x = lerp(-HW, HW, core.ease.inout(ph));
      this.streakDot.material.opacity = (0.7 + 0.3 * this.streakBoost) * Math.sin(ph * PI);
      this.streakLine.material.opacity = 0.14 + 0.1 * Math.sin(t * 3) + 0.2 * this.streakBoost;
    }
    if (this.topGlow.visible) this.topGlow.material.opacity = 0.12 + 0.08 * Math.sin(t * 2.6);
    // E: ハザード・光の道筋
    if (this.stage === 'E' && (this.truckSt === 'parked' || this.truckSt === 'arriving') && !this.hazardOff) {
      this.blinkBoost = Math.max(0, (this.blinkBoost || 0) - dt * 0.5);
      const on = this.truckSt === 'parked' && (t % 0.8) < 0.4;
      this.truck.setBlink(on ? Math.min(1, 0.7 + this.blinkBoost) : 0);
    }
    const showDots = this.dotsOn && this.stage === 'E' && this.truckSt === 'parked' && !this.drag && !this.leaving;
    if (showDots) {
      if (!this.flyFrom) { this.flyFrom = new V3(); this.flyTo = new V3(); }
      this.flyFrom.set(BOX_X, TABLE_Y + 0.06, BOX_Z); this.bedTarget(this.flyTo);
      const n = this.dots.length;
      for (let i = 0; i < n; i++) {
        const s = (i + 1) / (n + 1), dt0 = this.dots[i];
        this.pathPoint(s, dt0.position); dt0.position.y += PH * 0.5; dt0.visible = true;
        const w = (t * 0.9 - s) % 1, e = w < 0 ? w + 1 : w;
        dt0.material.opacity = 0.18 + 0.55 * Math.max(0, 1 - e * 4);
        dt0.scale.setScalar(0.05 + 0.03 * Math.max(0, 1 - e * 4));
      }
    } else if (this.dots[0].visible) for (const s of this.dots) s.visible = false;
  },
};

export default scene;
