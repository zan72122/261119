// 白い軽トラック（キャブオーバー・荷台つき）の写実モデル。外部素材なし。
// 単位 m / Y 上 / +X が前 / +Z が車体右側面。原点は車体中心の真下の路面。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TRUCK = { L: 3.4, W: 1.48, Hh: 1.78, wheelR: 0.27, bedY: 0.66, bedL: 1.95, bedW: 1.36, gateH: 0.29 };

// ---- 寸法（内部用） ----
const FRONT_AXLE_X = 1.12;
const REAR_AXLE_X = -0.785;
const TRACK_Z = 0.6;
const HALF_W = 0.735; // キャブ半幅
const CAB_REAR = 0.45;
const BED_FRONT = 0.285;
const BED_REAR = BED_FRONT - TRUCK.bedL; // -1.665
const BED_CX = (BED_FRONT + BED_REAR) / 2;
const BED_HALF = TRUCK.bedW / 2; // 0.68
const GATE_T = 0.035;
const GATE_Y = 0.62; // あおり蝶番の高さ（床板の下面付近）
const GATE_TOP = TRUCK.bedY + TRUCK.gateH; // 0.95
const GATE_OPEN = THREE.MathUtils.degToRad(175);

// キャブ側面形状のキーポイント
const F_PT = [1.645, 1.03]; // カウル（フロントガラス下端）
const G_PT = [1.41, 1.725]; // フロントガラス上端
const xA = (y) => F_PT[0] + (y - F_PT[1]) * (G_PT[0] - F_PT[0]) / (G_PT[1] - F_PT[1]);
// ベルトラインより上は内側へ少し絞る（タンブルホーム）
const tumble = (y) => (y <= 1.0 ? 1 : 1 - 0.065 * Math.min(1, (y - 1.0) / 0.78));

// ---- ジオメトリ補助 ----
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function at(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  g.applyMatrix4(new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s));
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function rbox(w, h, d, r, seg = 1) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, seg, r);
}
// 円柱（軸 X / Z）
const cylX = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const cylZ = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

function roundedShape(pts) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r0] = pts[i];
    const p = pts[(i + n - 1) % n], q = pts[(i + 1) % n];
    const ax = p[0] - x, ay = p[1] - y, bx = q[0] - x, by = q[1] - y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const r = Math.min(r0 || 0, la * 0.5, lb * 0.5);
    if (r <= 1e-5) { if (i === 0) s.moveTo(x, y); else s.lineTo(x, y); continue; }
    const x1 = x + (ax / la) * r, y1 = y + (ay / la) * r, x2 = x + (bx / lb) * r, y2 = y + (by / lb) * r;
    if (i === 0) s.moveTo(x1, y1); else s.lineTo(x1, y1);
    s.quadraticCurveTo(x, y, x2, y2);
  }
  s.closePath();
  return s;
}
const flat = (shape, depth, seg = 6) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: seg });

function warp(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * tumble(p.getY(i)));
  return g;
}
function mirrorZ(g) {
  const m = g.index ? g.toNonIndexed() : g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  for (const name in m.attributes) {
    const a = m.attributes[name], arr = a.array, s = a.itemSize;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) {
      const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, tmp = arr[i1];
      arr[i1] = arr[i2]; arr[i2] = tmp;
    }
  }
  return m;
}
function norm(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') n.deleteAttribute(a);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}

class Bucket {
  constructor() { this.map = new Map(); }
  add(key, g) { if (!this.map.has(key)) this.map.set(key, []); this.map.get(key).push(g); return g; }
  both(key, g) { this.add(key, g); this.add(key, mirrorZ(g)); }
  build(parent, M) {
    for (const [key, list] of this.map) {
      const geo = mergeGeometries(list.map(norm), false);
      list.forEach((g) => g.dispose());
      const mat = M[key];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = key;
      mesh.castShadow = !mat.userData.noShadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
}

// ---- 手続きテクスチャ ----
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function tireTextures() {
  const W = 512, H = 128;
  const [cc, c] = canvas(W, H), [bc, b] = canvas(W, H);
  // v の範囲: トレッドは 0.318..0.682（lathe の点番号 7..15 / 22）
  const t0 = Math.round(H * 0.31), t1 = Math.round(H * 0.69);
  c.fillStyle = '#242424'; c.fillRect(0, 0, W, H);
  b.fillStyle = '#7a7a7a'; b.fillRect(0, 0, W, H);
  // サイドウォールのかすかなリング
  for (const yy of [H * 0.12, H * 0.88]) { b.fillStyle = '#868686'; b.fillRect(0, yy - 2, W, 4); }
  c.fillStyle = '#1e1e1e'; c.fillRect(0, t0, W, t1 - t0);
  b.fillStyle = '#ffffff'; b.fillRect(0, t0, W, t1 - t0);
  // 縦溝 3 本
  const grooves = [0.36, 0.5, 0.64];
  for (const g of grooves) {
    const y = H * g;
    c.fillStyle = '#0c0c0c'; c.fillRect(0, y - 3, W, 6);
    b.fillStyle = '#000000'; b.fillRect(0, y - 3, W, 6);
  }
  // 横方向のラグ溝（ブロックパターン）
  const N = 44;
  for (let i = 0; i < N; i++) {
    const x = (i / N) * W;
    for (let k = 0; k < 4; k++) {
      const ya = [t0, H * 0.36, H * 0.5, H * 0.64][k], yb = [H * 0.36, H * 0.5, H * 0.64, t1][k];
      const off = (k % 2) * (W / N) * 0.5;
      c.fillStyle = '#0e0e0e'; b.fillStyle = '#101010';
      c.fillRect(x + off, ya, 3, yb - ya); b.fillRect(x + off, ya, 3, yb - ya);
    }
  }
  // 薄い使用感
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    c.fillStyle = `rgba(${90 + Math.random() * 40},${85 + Math.random() * 30},80,0.05)`;
    c.fillRect(x, y, 2, 1);
  }
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bc);
  for (const t of [map, bump]) { t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; }
  return [map, bump];
}

function wheelFaceTextures() {
  const S = 256;
  const [cc, c] = canvas(S, S), [bc, b] = canvas(S, S);
  const cx = S / 2, R = S / 2;
  const g = c.createRadialGradient(cx, cx, 0, cx, cx, R);
  g.addColorStop(0, '#c9ccce'); g.addColorStop(0.45, '#b4b8bb'); g.addColorStop(0.62, '#9ea2a5');
  g.addColorStop(0.8, '#c3c6c8'); g.addColorStop(1, '#8e9295');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  const gb = b.createRadialGradient(cx, cx, 0, cx, cx, R);
  gb.addColorStop(0, '#c0c0c0'); gb.addColorStop(0.45, '#b0b0b0'); gb.addColorStop(0.55, '#707070');
  gb.addColorStop(0.62, '#606060'); gb.addColorStop(0.85, '#909090'); gb.addColorStop(1, '#505050');
  b.fillStyle = gb; b.fillRect(0, 0, S, S);
  // 飾り穴（8 個の丸穴）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * R * 0.66, y = cx + Math.sin(a) * R * 0.66;
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = '#0d0e0f'; c.beginPath(); c.ellipse(0, 0, R * 0.075, R * 0.11, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    b.save(); b.translate(x, y); b.rotate(a);
    b.fillStyle = '#000'; b.beginPath(); b.ellipse(0, 0, R * 0.075, R * 0.11, 0, 0, Math.PI * 2); b.fill();
    b.restore();
  }
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bc);
  return [map, bump];
}

function wearTexture() {
  // 荷台の塗装の細かな使用感（ラフネス用）
  const S = 256;
  const [cc, c] = canvas(S, S);
  c.fillStyle = '#7f7f7f'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i++) {
    const v = 100 + Math.random() * 80;
    c.fillStyle = `rgba(${v},${v},${v},0.25)`;
    c.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 6, 1);
  }
  const t = new THREE.CanvasTexture(cc);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeMaterials(tex) {
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const M = {
    paint: P({ color: 0xeeeeea, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.16 }),
    bedPaint: P({ color: 0xe6e6e1, roughness: 0.55, roughnessMap: tex.wear, clearcoat: 0.12, clearcoatRoughness: 0.5 }),
    blackPaint: S({ color: 0x17181a, roughness: 0.45, metalness: 0.25 }),
    plastic: S({ color: 0x1c1d1e, roughness: 0.62 }),
    resin: S({ color: 0x3b3d3f, roughness: 0.7 }),
    liner: S({ color: 0x131313, roughness: 0.92, side: THREE.DoubleSide }),
    chassis: S({ color: 0x222324, roughness: 0.75, metalness: 0.35 }),
    glass: P({ color: 0x1a2228, roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 }),
    chrome: S({ color: 0xdcdee0, metalness: 1, roughness: 0.12 }),
    metal: S({ color: 0x86898c, metalness: 0.8, roughness: 0.42 }),
    lens: P({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.2, clearcoat: 1, depthWrite: false }),
    headGlow: S({ color: 0xd8dde2, roughness: 0.25, metalness: 0.4, emissive: 0xfff2dc, emissiveIntensity: 0 }),
    amber: P({ color: 0xc7680c, roughness: 0.15, clearcoat: 1, emissive: 0xff6a00, emissiveIntensity: 0 }),
    red: P({ color: 0x7e0c0c, roughness: 0.15, clearcoat: 1, emissive: 0xff1008, emissiveIntensity: 0 }),
    clearLamp: P({ color: 0xd6dadd, roughness: 0.08, metalness: 0.4, clearcoat: 1 }),
    plate: S({ color: 0xe8c43a, roughness: 0.42, metalness: 0.1 }),
    tire: S({ color: 0xffffff, map: tex.tire[0], bumpMap: tex.tire[1], bumpScale: 2.5, roughness: 0.88 }),
    wheel: S({ color: 0xc0c3c5, metalness: 0.55, roughness: 0.36 }),
    wheelFace: S({ color: 0xffffff, map: tex.face[0], bumpMap: tex.face[1], bumpScale: 2, metalness: 0.55, roughness: 0.38 }),
  };
  M.lens.userData.noShadow = true;
  return M;
}

// ---- 車体 ----
function buildCab(B) {
  // 側面プロファイル（X,Y,角の丸み）
  const arc = [];
  const acx = FRONT_AXLE_X, acy = 0.30, aR = 0.335;
  const th = Math.asin((0.40 - acy) / aR);
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - th - (i / 16) * (Math.PI - 2 * th);
    arc.push([acx + Math.cos(a) * aR, acy + Math.sin(a) * aR, 0]);
  }
  const prof = [
    [CAB_REAR, 0.40, 0.03],
    ...arc,
    [1.66, 0.40, 0.04],
    [1.675, 0.76, 0.25],
    [F_PT[0], F_PT[1], 0.05],
    [G_PT[0], G_PT[1], 0.07],
    [1.23, 1.78, 0.12],
    [0.51, 1.78, 0.05],
    [CAB_REAR, 1.70, 0.03],
  ];
  const bt = 0.07;
  const depth = HALF_W * 2 - bt * 2;
  let shell = new THREE.ExtrudeGeometry(roundedShape(prof), {
    depth, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.06, bevelOffset: -0.06, bevelSegments: 4, curveSegments: 8,
  });
  shell.translate(0, 0, -depth / 2);
  warp(shell);
  shell = toCreasedNormals(shell, Math.PI / 5);
  B.add('paint', shell);

  // ---- フロントガラス（傾いた面の局所座標 u=横, v=斜め上） ----
  const d = new THREE.Vector3(G_PT[0] - F_PT[0], G_PT[1] - F_PT[1], 0);
  const L = d.length(); d.normalize();
  const n = new THREE.Vector3(d.y, -d.x, 0);
  const wsMat = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), d, n).setPosition(F_PT[0], F_PT[1], 0);
  const onWS = (g, off) => { g.translate(0, 0, off); g.applyMatrix4(wsMat); return warp(g); };
  const wsPts = (e) => [[-0.6 - e, 0.06 - e, 0.05 + e], [0.6 + e, 0.06 - e, 0.05 + e], [0.57 + e, L - 0.05 + e, 0.06 + e], [-0.57 - e, L - 0.05 + e, 0.06 + e]];
  B.add('plastic', onWS(flat(roundedShape(wsPts(0.022)), 0.004), -0.001));
  B.add('glass', onWS(flat(roundedShape(wsPts(0)), 0.006), 0.0));
  // カウル（ワイパー根元の黒い帯）
  B.add('plastic', warp(box(1.24, 0.05, 0.012).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.03, 0.004)).applyMatrix4(wsMat)));
  // ワイパー（アーム＋ブレード）
  for (const [u, len, ang] of [[0.25, 0.5, 0.07], [-0.3, 0.46, 0.05]]) {
    const arm = box(len, 0.012, 0.014).rotateZ(ang).translate(u, 0.1, 0.012);
    const blade = box(len * 0.92, 0.02, 0.008).rotateZ(ang).translate(u, 0.115, 0.008);
    B.add('plastic', warp(arm.applyMatrix4(wsMat)));
    B.add('plastic', warp(blade.applyMatrix4(wsMat)));
  }

  // ---- サイドウインドウ（右側を作って左右反転） ----
  const swPts = (e) => [
    [0.63 - e, 1.07 - e, 0.03], [xA(1.07) - 0.11 + e, 1.07 - e, 0.03],
    [xA(1.63) - 0.11 + e, 1.63 + e, 0.05], [0.63 - e, 1.63 + e, 0.04],
  ];
  const seal = flat(roundedShape(swPts(0.02)), 0.004).translate(0, 0, HALF_W - 0.001);
  const sglass = flat(roundedShape(swPts(0)), 0.006).translate(0, 0, HALF_W);
  B.both('plastic', warp(seal));
  B.both('glass', warp(sglass));

  // ---- リアウインドウ（キャブ背面, -X 向き） ----
  const rwPts = (e) => [[-0.5 - e, 1.16 - e, 0.05], [0.5 + e, 1.16 - e, 0.05], [0.47 + e, 1.6 + e, 0.05], [-0.47 - e, 1.6 + e, 0.05]];
  const toBack = (g, x) => warp(g.rotateY(-Math.PI / 2).translate(x, 0, 0));
  B.add('plastic', toBack(flat(roundedShape(rwPts(0.02)), 0.004), CAB_REAR + 0.001));
  B.add('glass', toBack(flat(roundedShape(rwPts(0)), 0.006), CAB_REAR));

  // ---- ドアの継ぎ目・取っ手 ----
  const seam = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return warp(box(len + 0.006, 0.007, 0.004).rotateZ(Math.atan2(y2 - y1, x2 - x1)).translate((x1 + x2) / 2, (y1 + y2) / 2, HALF_W + 0.0005));
  };
  const doorFrontX = 1.5;
  const lines = [
    [0.575, 0.41, 0.575, 1.725],
    [doorFrontX, 0.41, doorFrontX, 1.0],
    [doorFrontX, 1.0, xA(1.12) - 0.045, 1.12],
    [xA(1.12) - 0.045, 1.12, xA(1.725) - 0.045, 1.725],
    [0.575, 1.725, xA(1.725) - 0.045, 1.725],
  ];
  for (const l of lines) B.both('plastic', seam(...l));
  B.both('plastic', box(0.13, 0.032, 0.014).translate(0.74, 0.97, HALF_W + 0.004)); // 取っ手
  B.both('resin', box(0.17, 0.05, 0.004).translate(0.74, 0.97, HALF_W + 0.001)); // 取っ手まわりのくぼみ
  B.both('plastic', box(0.012, 0.03, 0.008).translate(0.62, 0.92, HALF_W + 0.002)); // 鍵穴
  // ドアミラー
  B.both('plastic', box(0.05, 0.035, 0.13).translate(1.56, 1.08, HALF_W + 0.05));
  B.both('plastic', rbox(0.075, 0.17, 0.13, 0.025).translate(1.555, 1.15, HALF_W + 0.155));
  B.both('chrome', box(0.004, 0.145, 0.105).translate(1.516, 1.15, HALF_W + 0.155));
  // サイドウインカー
  B.both('amber', rbox(0.06, 0.028, 0.01, 0.004).translate(1.56, 0.80, HALF_W + 0.002));
  // ルーフのドリップモール（雨どい）
  B.both('plastic', box(0.74, 0.012, 0.01).translate(0.97, 1.70, HALF_W * tumble(1.70) + 0.002));

  // ---- フロントまわり ----
  B.add('resin', rbox(0.13, 0.17, 1.47, 0.045, 2).translate(1.635, 0.385, 0)); // バンパー
  B.add('plastic', box(0.02, 0.025, 1.2).translate(1.69, 0.335, 0)); // バンパー下の黒いモール
  B.add('plate', rbox(0.01, 0.165, 0.33, 0.004).translate(1.705, 0.395, 0)); // ナンバー（無地）
  B.both('metal', cylX(0.007, 0.012, 8).translate(1.711, 0.45, 0.13)); // ナンバー留めボルト
  B.add('plastic', rbox(0.03, 0.12, 0.86, 0.01).translate(1.665, 0.805, 0)); // グリルの黒帯
  for (let i = 0; i < 3; i++) B.add('resin', box(0.004, 0.012, 0.8).translate(1.681, 0.775 + i * 0.03, 0)); // グリルの横桟
  // ヘッドライト（反射板・プロジェクター・レンズ）
  for (const s of [1, -1]) {
    B.add('plastic', rbox(0.05, 0.17, 0.235, 0.02).translate(1.648, 0.81, s * 0.555));
    B.add('chrome', rbox(0.04, 0.15, 0.21, 0.015).translate(1.655, 0.81, s * 0.555));
    B.add('headGlow', cylX(0.045, 0.006, 20).translate(1.677, 0.812, s * 0.585));
    B.add('headGlow', cylX(0.028, 0.006, 16).translate(1.677, 0.812, s * 0.49));
    B.add('plastic', cylX(0.05, 0.003, 20).translate(1.675, 0.812, s * 0.585));
    B.add('lens', rbox(0.014, 0.156, 0.218, 0.006).translate(1.684, 0.81, s * 0.555));
    B.add('amber', rbox(0.024, 0.045, 0.17, 0.01).translate(1.668, 0.695, s * 0.56)); // フロントウインカー
  }

  // ---- 足まわり（キャブ下） ----
  B.add('chassis', box(1.1, 0.14, 1.0).translate(1.03, 0.34, 0)); // フロア下
  B.add('chassis', box(0.68, 0.26, 1.02).translate(1.12, 0.52, 0)); // タイヤハウス間のふさぎ
  for (const s of [1, -1]) {
    B.add('liner', new THREE.CylinderGeometry(0.325, 0.325, 0.2, 20, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(FRONT_AXLE_X, 0.30, s * TRACK_Z));
    B.add('plastic', box(0.012, 0.22, 0.2).translate(0.80, 0.29, s * 0.62)); // 前輪後ろの泥よけ
  }
}

function buildBedAndChassis(B) {
  const len = TRUCK.bedL;
  // 床（波板＝縦方向のリブ。リブの上面が y=bedY）
  B.add('bedPaint', box(len, 0.05, BED_HALF * 2).translate(BED_CX, 0.625, 0));
  for (let i = 0; i < 8; i++) {
    const z = -0.595 + i * 0.17;
    B.add('bedPaint', rbox(len - 0.02, 0.016, 0.055, 0.006).translate(BED_CX, TRUCK.bedY - 0.008, z));
  }
  // 前壁（鳥居の下）
  B.add('bedPaint', box(0.035, GATE_TOP - 0.53, 1.44).translate(BED_FRONT + 0.0175, (GATE_TOP + 0.53) / 2, 0));
  B.add('bedPaint', rbox(0.06, 0.04, 1.44, 0.012).translate(BED_FRONT + 0.02, GATE_TOP - 0.01, 0));
  // 鳥居（キャブ後ろの保護枠）
  const tx = BED_FRONT + 0.035 + 0.025;
  for (const s of [1, -1]) B.add('blackPaint', rbox(0.05, 1.72 - GATE_TOP, 0.05, 0.008).translate(tx, (1.72 + GATE_TOP) / 2, s * 0.665));
  B.add('blackPaint', rbox(0.06, 0.05, 1.39, 0.012).translate(tx, 1.70, 0));
  B.add('blackPaint', rbox(0.04, 0.035, 1.3, 0.008).translate(tx, 1.30, 0));
  for (let i = 0; i < 5; i++) B.add('blackPaint', new THREE.CylinderGeometry(0.011, 0.011, 1.72 - GATE_TOP - 0.03, 8).translate(tx, (1.72 + GATE_TOP) / 2, -0.44 + i * 0.22));
  // あおり下の側板（エプロン）と荷掛けフック
  for (const s of [1, -1]) {
    B.add('bedPaint', box(2.02, 0.09, 0.025).translate(BED_CX - 0.0175, 0.575, s * 0.7075));
    for (const x of [-1.5, -1.0, -0.35, 0.15]) B.add('plastic', box(0.035, 0.035, 0.02).translate(x, 0.55, s * 0.728));
    // 後輪のタイヤハウス・泥よけ
    B.add('liner', new THREE.CylinderGeometry(0.325, 0.325, 0.2, 20, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(REAR_AXLE_X, 0.27, s * TRACK_Z));
    B.add('plastic', box(0.012, 0.36, 0.22).translate(REAR_AXLE_X - 0.34, 0.36, s * 0.61));
  }
  // 床下の横根太
  for (const x of [-1.55, -1.1, -0.45, 0.0]) B.add('bedPaint', box(0.05, 0.06, 1.4).translate(x, 0.57, 0));
  // フレーム・後ろの横材
  for (const s of [1, -1]) B.add('chassis', box(3.0, 0.1, 0.05).translate(-0.12, 0.47, s * 0.4));
  B.add('chassis', box(0.05, 0.12, 1.42).translate(-1.64, 0.50, 0));
  // 後軸・リーフスプリング
  B.add('chassis', cylZ(0.04, 1.08, 10).translate(REAR_AXLE_X, 0.27, 0));
  B.add('chassis', new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.9, 1).translate(REAR_AXLE_X, 0.27, -0.08));
  for (const s of [1, -1]) B.add('chassis', box(0.9, 0.05, 0.05).translate(REAR_AXLE_X, 0.36, s * 0.42));
  // エンジン・燃料タンク・マフラー
  B.add('chassis', box(0.7, 0.28, 0.66).translate(0.18, 0.37, 0));
  B.add('chassis', box(0.42, 0.18, 0.5).translate(-0.3, 0.36, 0.05));
  B.add('chassis', cylX(0.07, 0.42, 12).translate(-1.15, 0.33, -0.25));
  B.add('chassis', cylX(0.024, 0.5, 8).translate(-1.55, 0.31, -0.3));
  // テールランプ（外側から 赤・橙・白）と後ろのナンバー
  for (const s of [1, -1]) {
    B.add('plastic', rbox(0.04, 0.13, 0.29, 0.012).translate(-1.675, 0.50, s * 0.55));
    B.add('red', rbox(0.026, 0.11, 0.11, 0.008).translate(-1.688, 0.50, s * 0.635));
    B.add('amber', rbox(0.026, 0.11, 0.085, 0.008).translate(-1.688, 0.50, s * 0.535));
    B.add('clearLamp', rbox(0.026, 0.11, 0.065, 0.008).translate(-1.688, 0.50, s * 0.455));
  }
  B.add('plate', rbox(0.01, 0.165, 0.33, 0.004).translate(-1.672, 0.50, 0));
  B.add('chassis', box(0.03, 0.03, 0.12).translate(-1.675, 0.6, 0)); // 番号灯
}

// あおり 1 枚（局所座標: 長さ X, 外面 z=0, 内側 -z, 蝶番 y=0）
function gateGeos(len, withLatch) {
  const G = new Bucket();
  const h = GATE_TOP - GATE_Y;
  G.add('bedPaint', box(len, h - 0.03, 0.026).translate(0, (h - 0.03) / 2, -0.016));
  G.add('bedPaint', rbox(len, 0.042, 0.05, 0.014).translate(0, h - 0.021, -0.022)); // 上縁の補強
  G.add('bedPaint', rbox(len, 0.03, 0.036, 0.008).translate(0, 0.018, -0.017)); // 下縁
  for (const y of [0.115, 0.205]) G.add('bedPaint', rbox(len - 0.14, 0.032, 0.012, 0.005).translate(0, y, 0.0)); // プレスの段
  for (const s of [1, -1]) G.add('bedPaint', rbox(0.045, h, 0.042, 0.01).translate(s * (len / 2 - 0.0225), h / 2, -0.019));
  // 蝶番
  const nh = Math.max(2, Math.round(len / 0.65));
  for (let i = 0; i < nh; i++) {
    const x = -len / 2 + (len / nh) * (i + 0.5);
    G.add('metal', cylX(0.014, 0.09, 10).translate(x, 0.0, 0.004));
    G.add('metal', box(0.07, 0.06, 0.006).translate(x, 0.035, 0.004));
  }
  // 留め金（あおりの両端上部）
  if (withLatch) for (const s of [1, -1]) {
    const x = s * (len / 2 - 0.075);
    G.add('metal', box(0.07, 0.08, 0.008).translate(x, h - 0.07, 0.004));
    G.add('plastic', rbox(0.025, 0.1, 0.018, 0.007).rotateZ(s * 0.25).translate(x - s * 0.01, h - 0.075, 0.014));
  }
  return G;
}

function buildWheel(geos, M, side) {
  const spin = new THREE.Group();
  const holder = new THREE.Group();
  if (side < 0) holder.rotation.y = Math.PI;
  spin.add(holder);
  for (const [g, key] of geos) {
    const m = new THREE.Mesh(g, M[key]);
    m.castShadow = true; m.receiveShadow = true;
    holder.add(m);
  }
  return spin;
}

function wheelGeometries() {
  const R = TRUCK.wheelR;
  const side = [[0.152, -0.064], [0.17, -0.07], [0.2, -0.0735], [0.23, -0.072], [0.25, -0.067], [0.262, -0.059], [0.268, -0.05]];
  const pts = [];
  for (const [r, y] of side) pts.push(new THREE.Vector2(r * (R / 0.27), y));
  for (let i = 0; i <= 8; i++) {
    const y = -0.044 + (i / 8) * 0.088;
    pts.push(new THREE.Vector2(R + 0.0008 * Math.cos((y / 0.044) * Math.PI / 2), y));
  }
  for (let i = side.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(side[i][0] * (R / 0.27), -side[i][1]));
  const tire = new THREE.LatheGeometry(pts, 36).rotateX(Math.PI / 2);
  // 鉄ホイール：リム（筒＋縁）とハブ・ナット
  const rimPts = [[0.146, -0.064], [0.15, 0.05], [0.16, 0.056], [0.164, 0.066], [0.154, 0.068], [0.146, 0.06], [0.137, 0.045]].map(([r, y]) => new THREE.Vector2(r, y));
  const rimParts = [new THREE.LatheGeometry(rimPts, 36).rotateX(Math.PI / 2)];
  rimParts.push(new THREE.CylinderGeometry(0.032, 0.036, 0.022, 20).rotateX(Math.PI / 2).translate(0, 0, 0.054));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    rimParts.push(new THREE.CylinderGeometry(0.0105, 0.0105, 0.018, 6).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.05));
  }
  const rim = mergeGeometries(rimParts.map(norm));
  rimParts.forEach((g) => g.dispose());
  const face = new THREE.CircleGeometry(0.139, 40).translate(0, 0, 0.042);
  return [[tire, 'tire'], [rim, 'wheel'], [face, 'wheelFace']];
}

export function createTruck() {
  const tex = { tire: tireTextures(), face: wheelFaceTextures(), wear: wearTexture() };
  const M = makeMaterials(tex);

  const group = new THREE.Group();
  group.name = 'kei-truck';
  const body = new THREE.Group();
  body.name = 'truck-body';
  group.add(body);

  const B = new Bucket();
  buildCab(B);
  buildBedAndChassis(B);
  B.build(body, M);

  const bed = new THREE.Group();
  bed.name = 'truck-bed';
  bed.position.set(BED_CX, TRUCK.bedY, 0);
  body.add(bed);

  // ---- あおり ----
  const gates = {};
  const sideLen = BED_FRONT + 0.035 - (BED_REAR - GATE_T); // 前壁から後端まで
  const sideCx = (BED_FRONT + 0.035 + BED_REAR - GATE_T) / 2;
  const mk = (name, pos, bucket) => {
    const pivot = new THREE.Group();
    pivot.name = 'gate-' + name;
    pivot.position.copy(pos);
    bucket.build(pivot, M);
    body.add(pivot);
    gates[name] = { pivot, t: 0 };
  };
  mk('near', new THREE.Vector3(sideCx, GATE_Y, BED_HALF + GATE_T + 0.005), gateGeos(sideLen, true));
  const far = gateGeos(sideLen, true);
  for (const [k, list] of far.map) far.map.set(k, list.map((g) => { const m = mirrorZ(g); g.dispose(); return m; }));
  mk('far', new THREE.Vector3(sideCx, GATE_Y, -(BED_HALF + GATE_T + 0.005)), far);
  const rear = gateGeos(BED_HALF * 2 + 0.01, true);
  for (const list of rear.map.values()) list.forEach((g) => g.rotateY(-Math.PI / 2));
  mk('rear', new THREE.Vector3(BED_REAR - GATE_T, GATE_Y, 0), rear);

  // ---- 車輪 ----
  const wgeos = wheelGeometries();
  const wheels = [];
  const steers = [];
  for (const [x, s, front] of [[FRONT_AXLE_X, 1, true], [FRONT_AXLE_X, -1, true], [REAR_AXLE_X, 1, false], [REAR_AXLE_X, -1, false]]) {
    const mount = new THREE.Group();
    mount.position.set(x, TRUCK.wheelR, s * TRACK_Z);
    const spin = buildWheel(wgeos, M, s);
    mount.add(spin);
    group.add(mount);
    wheels.push(spin);
    if (front) steers.push(mount);
  }

  let wheelAngle = 0;
  let head = 0, brake = 0;
  const updateTail = () => { M.red.emissiveIntensity = Math.max(head * 0.6, brake * 3.0); };

  const truck = {
    group, body, bed, wheels, gates,
    roll(dx) {
      wheelAngle -= dx / TRUCK.wheelR;
      wheelAngle %= Math.PI * 2;
      for (const w of wheels) w.rotation.z = wheelAngle;
    },
    setSteer(rad) { for (const m of steers) m.rotation.y = rad; },
    setGate(name, t) {
      const g = gates[name];
      if (!g) return;
      g.t = THREE.MathUtils.clamp(t, 0, 1);
      const a = g.t * GATE_OPEN;
      if (name === 'near') g.pivot.rotation.x = a;
      else if (name === 'far') g.pivot.rotation.x = -a;
      else g.pivot.rotation.z = a;
    },
    setHeadlights(v) {
      head = THREE.MathUtils.clamp(v, 0, 1);
      M.headGlow.emissiveIntensity = head * 4;
      M.lens.opacity = 0.2 + head * 0.15;
      updateTail();
    },
    setBlink(v) { M.amber.emissiveIntensity = THREE.MathUtils.clamp(v, 0, 1) * 2.2; },
    setBrake(v) { brake = THREE.MathUtils.clamp(v, 0, 1); updateTail(); },
    dispose() {
      group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      for (const m of Object.values(M)) m.dispose();
      tex.tire.forEach((t) => t.dispose());
      tex.face.forEach((t) => t.dispose());
      tex.wear.dispose();
      group.removeFromParent();
    },
  };
  return truck;
}
