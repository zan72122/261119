// 手続きで作る部品の形（すべて数値パラメータから）。three は引数でもらう。
import { TAU } from './kin.js';

/**
 * 部品を1つの BufferGeometry にまとめる（position / normal / uv / color、インデックスなし）。
 * parts: [{ g: BufferGeometry, m?: Matrix4, c?: 色 (hex) }]。渡した g はここで dispose する。
 */
export function merge(THREE, parts) {
  const col = new THREE.Color();
  let total = 0;
  const list = parts.map((p) => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (g !== p.g) p.g.dispose();
    if (p.m) g.applyMatrix4(p.m);
    if (!g.attributes.normal) g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, c: p.c === undefined ? 0xffffff : p.c };
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2), color = new Float32Array(total * 3);
  let o = 0;
  for (const { g, c } of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    col.set(c);   // sRGB の hex → 作業色空間（リニア）
    for (let i = 0; i < n; i++) { color[(o + i) * 3] = col.r; color[(o + i) * 3 + 1] = col.g; color[(o + i) * 3 + 2] = col.b; }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.computeBoundingSphere();
  return out;
}

/** 部品リストを作る小道具。b.box(...) などで追加し、b.build() でまとめる。 */
export function builder(THREE) {
  const parts = [];
  const M = () => new THREE.Matrix4();
  const api = {
    parts,
    add(g, m, c) { parts.push({ g, m, c }); return api; },
    /** 箱：中心 (x,y,z)、大きさ (w,h,d)。rot = [rx, ry, rz]（任意） */
    box(w, h, d, x, y, z, c, rot) {
      const m = M();
      if (rot) m.makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      m.setPosition(x, y, z);
      return api.add(new THREE.BoxGeometry(w, h, d), m, c);
    },
    /** 円柱：軸 axis（'x' | 'y' | 'z'）、中心 (x,y,z) */
    cyl(r, len, x, y, z, c, axis, seg, r2) {
      const m = M();
      if (axis === 'z') m.makeRotationX(Math.PI / 2); else if (axis === 'x') m.makeRotationZ(Math.PI / 2);
      m.setPosition(x, y, z);
      return api.add(new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, len, seg || 12), m, c);
    },
    ball(r, x, y, z, c, seg) {
      return api.add(new THREE.SphereGeometry(r, seg || 12, Math.max(6, (seg || 12) - 4)), M().makeTranslation(x, y, z), c);
    },
    build() { return merge(THREE, parts); },
  };
  return api;
}

/**
 * 平歯車（XY 平面、軸 Z、厚み t、中心が原点）。歯は台形。
 * Z 歯数、m モジュール → ピッチ半径 mZ/2、歯先 +m、歯底 −1.25m。
 * 歯 0 の中心が角度 0（+X）。holes = 肉抜き穴の数、holeR / holeAt = 穴の半径と位置。
 */
export function gearGeometry(THREE, o) {
  const { Z, m, t } = o;
  const rp = (m * Z) / 2, ra = rp + m, rf = rp - 1.25 * m;
  const tau = TAU / Z;
  const shape = new THREE.Shape();
  const pt = (r, a, first) => (first ? shape.moveTo(r * Math.cos(a), r * Math.sin(a)) : shape.lineTo(r * Math.cos(a), r * Math.sin(a)));
  for (let k = 0; k < Z; k++) {
    const c = k * tau;
    pt(rf, c - 0.30 * tau, k === 0);
    pt(ra, c - 0.15 * tau);
    pt(ra, c + 0.15 * tau);
    pt(rf, c + 0.30 * tau);
    pt(rf, c + 0.50 * tau);
  }
  shape.closePath();
  const nH = o.holes || 0;
  for (let i = 0; i < nH; i++) {
    const a = ((i + 0.5) / nH) * TAU;
    const h = new THREE.Path();
    h.absarc(o.holeAt * Math.cos(a), o.holeAt * Math.sin(a), o.holeR, 0, TAU, true);
    shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: o.curve || 8 });
  g.translate(0, 0, -t / 2);
  return g;
}

/**
 * 送りねじ（軸 Z、原点から −Z へ長さ len）。芯の円柱＋らせんの山。
 * リード lead。メッシュを rotation.z で回すと山が軸方向へ動いて見える。
 */
export function screwGeometry(THREE, o) {
  const { len, lead, r0, r1 } = o;
  const seg = o.seg || 12;
  const turns = len / lead;
  const N = Math.max(1, Math.round(turns * seg));
  const pos = [];
  const half = lead * 0.22;
  const P3 = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  for (let i = 0; i < N; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const z0 = -(i / seg) * lead, z1 = -((i + 1) / seg) * lead;
    const A0 = P3(r0, a0, z0 + half), A1 = P3(r0, a1, z1 + half);   // 後ろの谷
    const B0 = P3(r1, a0, z0), B1 = P3(r1, a1, z1);                 // 山
    const C0 = P3(r0, a0, z0 - half), C1 = P3(r0, a1, z1 - half);   // 前の谷
    pos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0);
    pos.push(...B0, ...B1, ...C1, ...B0, ...C1, ...C0);
  }
  const ridge = new THREE.BufferGeometry();
  ridge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ridge.computeVertexNormals();
  ridge.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return ridge;
}

/** パネル（板）の形：下の長方形＋歯車の軸受けを持つ出っ張り。XY 平面、厚み t で +Z へ押し出す。 */
export function panelGeometry(THREE, o) {
  const s = new THREE.Shape();
  const hw = o.w / 2, r = 0.08;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, o.h - r);
  s.quadraticCurveTo(hw, o.h, hw - r, o.h);
  s.lineTo(o.tabX1 + 0.12, o.h);
  s.lineTo(o.tabX1, o.tabH - r);
  s.quadraticCurveTo(o.tabX1 - 0.02, o.tabH, o.tabX1 - 0.1, o.tabH);
  s.lineTo(o.tabX0 + 0.1, o.tabH);
  s.quadraticCurveTo(o.tabX0 + 0.02, o.tabH, o.tabX0, o.tabH - r);
  s.lineTo(o.tabX0 - 0.12, o.h);
  s.lineTo(-hw + r, o.h);
  s.quadraticCurveTo(-hw, o.h, -hw, o.h - r);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: o.t, bevelEnabled: false, curveSegments: 4 });
}

/** リング（穴あきの円板、軸 Y、厚み t、下面が y=0）。 */
export function ringGeometry(THREE, ri, ro, t, seg) {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, 0, TAU, false);
  const h = new THREE.Path();
  h.absarc(0, 0, ri, 0, TAU, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: seg || 20 });
  g.rotateX(-Math.PI / 2);   // 押し出しの +Z → +Y
  return g;
}

/** ラチェット（のこぎり歯の帯）：XY 平面で +X 側に歯、y=0 から上へ n 歯、厚み t（Z 方向、中心）。 */
export function ratchetGeometry(THREE, n, pitch, depth, t) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (let i = 0; i < n; i++) { s.lineTo(depth, i * pitch); s.lineTo(0, (i + 1) * pitch); }
  s.lineTo(-0.012, n * pitch);
  s.lineTo(-0.012, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}
