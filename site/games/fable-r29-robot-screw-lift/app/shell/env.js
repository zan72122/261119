// 周辺の場面：工房の床・壁・窓・棚・木箱、窓の外の空と遠い丘（低ポリ＋写真風テクスチャ/頂点カラー）、紙吹雪。
// hero は原点（床の上、ねじの軸の真下）。+Z が手前（カメラ側）。
import { mergeGeometries, placed } from './util.js';
import { cloneTexture } from './textures.js';

const ROOM = { backZ: -3.6, sideX: 7.5, frontZ: 13, height: 5.4 };
const WIN = { x0: -2.8, x1: 2.8, y0: 1.0, y1: 3.7 };

export function createEnvironment(THREE, { textures, tier }) {
  const root = new THREE.Group();
  root.name = 'env';
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const merge = (list) => mergeGeometries(THREE, list.map((g) => (g.index ? g.toNonIndexed() : g)));

  // テクスチャの繰り返し違いは clone（同じ画像なので GPU メモリは共有）
  const rep = (tex, rx, ry) => { const t = keep(cloneTexture(tex)); t.repeat.set(rx, ry); return t; };

  // ---- マテリアル
  const matFloor = keep(new THREE.MeshStandardMaterial({ map: rep(textures.envFloor, 8, 8), roughness: 0.9, metalness: 0 }));
  const matPlaster = keep(new THREE.MeshStandardMaterial({ map: rep(textures.plaster, 4, 2), roughness: 0.95 }));
  const matWood = keep(new THREE.MeshStandardMaterial({ map: textures.envWood, roughness: 0.8 }));
  const matWoodWall = keep(new THREE.MeshStandardMaterial({ map: rep(textures.envWood, 6, 0.8), roughness: 0.8, color: 0xe8d2b0 }));
  const matMetal = keep(new THREE.MeshStandardMaterial({ map: textures.envMetal, roughness: 0.55, metalness: 0.2 }));
  const matCeiling = keep(new THREE.MeshStandardMaterial({ map: rep(textures.envWood, 6, 4), roughness: 0.9, color: 0x9a7b5c }));
  const matSky = keep(new THREE.MeshBasicMaterial({ map: textures.envSky, fog: false }));
  const matVC = keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const matProps = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));

  const add = (geom, mat, opts = {}) => {
    const m = new THREE.Mesh(keep(geom), mat);
    m.receiveShadow = !!opts.receive;
    m.castShadow = !!opts.cast && tier.shadows;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    root.add(m);
    return m;
  };

  // ---- 床（手前まで広く）
  const floorW = ROOM.sideX * 2, floorD = ROOM.frontZ - ROOM.backZ;
  const floorG = new THREE.PlaneGeometry(floorW, floorD);
  floorG.rotateX(-Math.PI / 2);
  floorG.translate(0, 0, (ROOM.frontZ + ROOM.backZ) / 2);
  add(floorG, matFloor, { receive: true });

  // ---- 奥の壁（窓の穴あき）：上部は漆喰、下部は木の腰板
  const T = 0.3, z = ROOM.backZ - T / 2, H = ROOM.height;
  const box = (w, h, d, x, y, zz) => placed(THREE, new THREE.BoxGeometry(w, h, d), x, y, zz);
  // 窓の左右・上・下
  const wallParts = [
    box(WIN.x0 + ROOM.sideX, H, T, (-ROOM.sideX + WIN.x0) / 2, H / 2, z),
    box(ROOM.sideX - WIN.x1, H, T, (ROOM.sideX + WIN.x1) / 2, H / 2, z),
    box(WIN.x1 - WIN.x0, H - WIN.y1, T, 0, (H + WIN.y1) / 2, z),
    box(WIN.x1 - WIN.x0, WIN.y0, T, 0, WIN.y0 / 2, z),
  ];
  // 横の壁
  wallParts.push(box(T, H, ROOM.frontZ - ROOM.backZ, -ROOM.sideX - T / 2, H / 2, (ROOM.frontZ + ROOM.backZ) / 2));
  wallParts.push(box(T, H, ROOM.frontZ - ROOM.backZ, ROOM.sideX + T / 2, H / 2, (ROOM.frontZ + ROOM.backZ) / 2));
  add(merge(wallParts), matPlaster, { receive: true });

  // 腰板（窓の下と左右の壁の下部）
  const wain = [
    box(ROOM.sideX * 2, 0.95, 0.05, 0, 0.475, ROOM.backZ + 0.025),
    box(0.05, 0.95, ROOM.frontZ - ROOM.backZ, -ROOM.sideX + 0.025, 0.475, (ROOM.frontZ + ROOM.backZ) / 2),
    box(0.05, 0.95, ROOM.frontZ - ROOM.backZ, ROOM.sideX - 0.025, 0.475, (ROOM.frontZ + ROOM.backZ) / 2),
  ];
  add(merge(wain), matWoodWall, { receive: true });

  // 天井と梁
  const ceil = new THREE.PlaneGeometry(floorW, floorD);
  ceil.rotateX(Math.PI / 2);
  ceil.translate(0, H, (ROOM.frontZ + ROOM.backZ) / 2);
  const beams = [ceil];
  for (let i = 0; i < 6; i++) beams.push(box(ROOM.sideX * 2, 0.28, 0.24, 0, H - 0.14, ROOM.backZ + 0.6 + i * 2.6));
  add(merge(beams), matCeiling);

  // 窓枠・窓台・配管（塗装金属）
  const frame = [];
  const fw = 0.12;
  for (const x of [WIN.x0, -0.93, 0.93, WIN.x1]) frame.push(box(fw, WIN.y1 - WIN.y0 + fw, 0.14, x, (WIN.y0 + WIN.y1) / 2, ROOM.backZ - 0.1));
  for (const y of [WIN.y0, 2.45, WIN.y1]) frame.push(box(WIN.x1 - WIN.x0 + fw, fw, 0.14, 0, y, ROOM.backZ - 0.1));
  frame.push(box(WIN.x1 - WIN.x0 + 0.4, 0.08, 0.36, 0, WIN.y0 - 0.02, ROOM.backZ + 0.08)); // 窓台
  // 壁の上を走る配管
  for (const yy of [4.55, 4.8]) {
    const p = new THREE.CylinderGeometry(0.07, 0.07, ROOM.sideX * 2, 8, 1);
    p.rotateZ(Math.PI / 2); p.translate(0, yy, ROOM.backZ + 0.18);
    frame.push(p);
  }
  // ドラム缶 2本（左手前）
  for (const [x, zz] of [[-5.2, 0.6], [-4.5, 1.4]]) frame.push(placed(THREE, new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16, 1), x, 0.55, zz));
  add(merge(frame.map((g) => fixUV(g))), matMetal, { cast: false, receive: true });

  // ---- 作業台（左奥）と棚（右奥）と木箱（右）：木
  const woodParts = [
    box(2.6, 0.1, 1.0, -4.6, 0.92, -2.9),
    box(0.1, 0.87, 0.1, -5.8, 0.435, -3.3), box(0.1, 0.87, 0.1, -3.4, 0.435, -3.3),
    box(0.1, 0.87, 0.1, -5.8, 0.435, -2.5), box(0.1, 0.87, 0.1, -3.4, 0.435, -2.5),
    box(2.4, 0.06, 0.8, -4.6, 0.25, -2.9),
  ];
  // 棚
  for (const y of [0.3, 1.2, 2.1, 3.0]) woodParts.push(box(2.6, 0.06, 0.5, 4.6, y, ROOM.backZ + 0.25));
  woodParts.push(box(0.06, 3.1, 0.5, 3.3, 1.55, ROOM.backZ + 0.25), box(0.06, 3.1, 0.5, 5.9, 1.55, ROOM.backZ + 0.25));
  // 木箱（積み）
  const crates = [[4.3, 0.35, 0.0, 0.7, 0.2], [5.1, 0.35, 0.3, 0.7, -0.15], [4.7, 1.05, 0.15, 0.7, 0.1], [5.6, 0.3, -1.2, 0.6, 0.3], [-5.6, 0.3, -1.4, 0.6, 0.4]];
  for (const [x, y, zz, s, ry] of crates) woodParts.push(placed(THREE, new THREE.BoxGeometry(s, s, s), x, y, zz, 0, ry, 0));
  add(merge(woodParts.map((g) => fixUV(g))), matWood, { receive: true, cast: true });

  // 棚の上の小物（頂点カラーの箱と缶）
  const props = [];
  const colors = [0xf28b82, 0xfbbc04, 0x81c995, 0x8ab4f8, 0xc58af9, 0xffffff];
  let ci = 0;
  for (const y of [1.23, 2.13, 3.03]) {
    for (let i = 0; i < 5; i++) {
      const x = 3.6 + i * 0.5 + ((ci * 37) % 7) * 0.02;
      const g = i % 2 === 0
        ? placed(THREE, new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10, 1), x, y + 0.15, ROOM.backZ + 0.25)
        : placed(THREE, new THREE.BoxGeometry(0.3, 0.24, 0.3), x, y + 0.12, ROOM.backZ + 0.25, 0, 0.2 * i, 0);
      paint(THREE, g, colors[ci++ % colors.length]);
      props.push(g);
    }
  }
  // 作業台の上の工具箱
  props.push(paint(THREE, box(0.7, 0.35, 0.4, -4.9, 1.15, -2.9), 0xe0453a));
  props.push(paint(THREE, box(0.3, 0.5, 0.3, -3.9, 1.22, -2.95), 0x4f7fd6));
  add(merge(props.map((g) => fixUV(g))), matProps, { receive: true });

  // ---- 窓の外：空（遠い大きな板）、牧草地、丘3層、木
  const sky = new THREE.PlaneGeometry(90, 48);
  sky.translate(0, 14, -60);
  const skyMesh = add(sky, matSky);
  skyMesh.renderOrder = -1;

  const outside = [];
  // 牧草地（窓の下に見える地面）
  const meadow = new THREE.PlaneGeometry(120, 60, 1, 1);
  meadow.rotateX(-Math.PI / 2); meadow.translate(0, -0.05, -34);
  vcolorGradientZ(THREE, meadow, 0x88c06a, 0xa8d39a);
  outside.push(meadow);
  const ridge = (zz, base, amp, seed, cTop, cBot) => {
    const seg = 36, w = 130;
    const pos = [], col = [];
    const top = new THREE.Color(cTop), bot = new THREE.Color(cBot);
    for (let i = 0; i < seg; i++) {
      const xa = -w / 2 + (w * i) / seg, xb = -w / 2 + (w * (i + 1)) / seg;
      const ha = base + amp * hill(xa, seed), hb = base + amp * hill(xb, seed);
      // 2つの三角形（上辺の折れ線〜下端）
      pos.push(xa, -0.1, zz, xb, -0.1, zz, xb, hb, zz, xa, -0.1, zz, xb, hb, zz, xa, ha, zz);
      for (const c of [bot, bot, top, bot, top, top]) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  // 窓から見える高さ：遠いほど低く・空色に寄せる（空が窓の上半分に見えるように）
  outside.push(ridge(-50, 2.6, 3.2, 3.1, 0xb4d2ea, 0xc6dfee));
  outside.push(ridge(-36, 1.2, 2.4, 1.7, 0x93c7a8, 0xa8d2b4));
  outside.push(ridge(-24, 0.3, 1.5, 0.4, 0x74b65c, 0x88c46c));
  // 木（円錐＋幹）を近い丘の手前に
  const treeParts = [];
  for (let i = 0; i < 14; i++) {
    const x = -30 + i * 4.6 + Math.sin(i * 2.3) * 1.2;
    const zz = -21 - (i % 3) * 1.5;
    const s = 0.6 + 0.2 * Math.sin(i * 1.7);
    const trunk = placed(THREE, new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.0 * s, 5, 1), x, 0.5 * s, zz);
    const crown = placed(THREE, new THREE.ConeGeometry(0.9 * s, 2.4 * s, 7, 1), x, 2.1 * s, zz);
    paint(THREE, trunk, 0x8a5a3b);
    paint(THREE, crown, i % 2 ? 0x4f9a48 : 0x5aa852);
    treeParts.push(trunk, crown);
  }
  const outsideG = merge([...outside.map((g) => stripTo(g, ['position', 'color'])), ...treeParts.map((g) => stripTo(g, ['position', 'color']))]);
  add(outsideG, matVC);

  // ---- 紙吹雪（InstancedMesh、celebrate のときだけ表示）
  const confetti = createConfetti(THREE, tier.confetti, keep);
  root.add(confetti.mesh);

  // ---- 光
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a6f55, 1.25);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  sun.position.set(-3.5, 7.5, 5.5);
  sun.target.position.set(0, 1.2, 0);
  root.add(sun, sun.target);
  if (tier.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
    const c = sun.shadow.camera;
    c.left = -3.2; c.right = 3.2; c.top = 3.6; c.bottom = -2.4; c.near = 2; c.far = 18;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
  }

  let skyDrift = 0;
  return {
    root,
    sun,
    confetti,
    update(dt) {
      skyDrift += dt * 0.004;
      textures.envSky.offset.x = skyDrift % 1; // 雲がゆっくり流れる
      confetti.update(dt);
    },
    disableShadows() {
      sun.castShadow = false;
      root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    },
    dispose() {
      for (const d of disposables) d.dispose && d.dispose();
      root.clear();
    },
  };
}

// --- 補助

function hill(x, seed) {
  return 0.55 + 0.25 * Math.sin(x * 0.11 + seed) + 0.15 * Math.sin(x * 0.27 + seed * 2.1) + 0.05 * Math.sin(x * 0.63 + seed * 3.7);
}

function paint(THREE, g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function vcolorGradientZ(THREE, g, nearHex, farHex) {
  const a = new THREE.Color(nearHex), b = new THREE.Color(farHex);
  const p = g.attributes.position;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < p.count; i++) { zmin = Math.min(zmin, p.getZ(i)); zmax = Math.max(zmax, p.getZ(i)); }
  const arr = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = (zmax - p.getZ(i)) / Math.max(zmax - zmin, 1e-6);
    c.copy(a).lerp(b, t);
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

// 結合のため属性をそろえる（uv/normal を必ず持たせる・不要な属性は落とす）
function fixUV(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.color) {
    const arr = new Float32Array(out.attributes.position.count * 3).fill(1);
    out.setAttribute('color', new out.attributes.position.constructor(arr, 3));
  }
  return out;
}

function stripTo(g, keepNames) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!keepNames.includes(k)) out.deleteAttribute(k);
  return out;
}

function createConfetti(THREE, count, keep) {
  const geom = keep(new THREE.PlaneGeometry(0.07, 0.11));
  const mat = keep(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false }));
  const mesh = new THREE.InstancedMesh(geom, mat, count);
  mesh.name = 'confetti';
  mesh.visible = false;
  mesh.frustumCulled = false;
  const palette = [0xff5a5f, 0xffc93c, 0x4cd4b0, 0x5fa8ff, 0xc77dff, 0xffffff, 0xff8fab];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(palette[i % palette.length]));
  const P = new Float32Array(count * 3), V = new Float32Array(count * 3), R = new Float32Array(count * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let life = 0;
  return {
    mesh,
    burst(origin) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
        P[i * 3] = origin.x + Math.cos(a) * r; P[i * 3 + 1] = origin.y + Math.random() * 0.3; P[i * 3 + 2] = origin.z + Math.sin(a) * r;
        V[i * 3] = Math.cos(a) * (0.8 + Math.random() * 1.8); V[i * 3 + 1] = 1.2 + Math.random() * 1.6; V[i * 3 + 2] = Math.sin(a) * (0.8 + Math.random() * 1.8) + 0.6;
        R[i * 3] = Math.random() * 6; R[i * 3 + 1] = Math.random() * 6; R[i * 3 + 2] = Math.random() * 6;
      }
      life = 8;
      mesh.visible = true;
    },
    update(dt) {
      if (life <= 0) return;
      life -= dt;
      if (life <= 0) { mesh.visible = false; return; }
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        V[k + 1] -= 3.0 * dt;
        const drag = Math.exp(-1.6 * dt);
        V[k] *= drag; V[k + 2] *= drag; if (V[k + 1] < -0.8) V[k + 1] = -0.8; // ひらひら落ちる
        P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
        if (P[k + 1] < 0.02) { P[k + 1] = 0.02; V[k] = V[k + 2] = 0; }
        R[k] += dt * 3; R[k + 1] += dt * 2;
        p.set(P[k], P[k + 1], P[k + 2]);
        q.setFromEuler(e.set(R[k], R[k + 1], R[k + 2]));
        mesh.setMatrixAt(i, m4.compose(p, q, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
