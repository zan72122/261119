// 宝箱：箱・蝶番で開くふた・ばねで飛び出すおもちゃ 3 つ（星・くま・ハート）・きらきら。
// ふた角とばねの長さは減衰振動の式（springStep）で決める。昇降台の子として置く。
import { TAU } from './params.js';
import { springStep, clamp } from './kinematics.js';

export function createTreasure(THREE, kit, ctx) {
  const { P, COLORS, mats, shadows, own, atlas } = ctx;
  const { M, Builder } = kit;
  const T = P.treasure;
  const [w, h, d] = T.size;
  const HX = Math.PI / 2;
  const group = new THREE.Group();
  group.position.set(T.pos[0], 0, T.pos[1]);
  const tilt = new THREE.Group(); // がたがた揺れる
  group.add(tilt);

  // ---- 箱
  {
    const b = new Builder();
    const t = 0.02;
    b.color(COLORS.chest);
    for (const sz of [-1, 1]) b.box(w, h, t, M(0, h / 2, sz * (d / 2 - t / 2)));
    for (const sx of [-1, 1]) b.box(t, h, d - 2 * t, M(sx * (w / 2 - t / 2), h / 2, 0));
    b.color(COLORS.chestInside).box(w - 2 * t, t, d - 2 * t, M(0, t / 2 + 0.004, 0));
    b.color(COLORS.chestTrim);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box(0.034, h + 0.006, 0.034, M(sx * (w / 2 - 0.012), h / 2, sz * (d / 2 - 0.012)));         // 角の金具
        b.sphere(0.028, 8, 6, M(sx * (w / 2 - 0.04), 0.012, sz * (d / 2 - 0.04)));                    // 足
      }
      b.box(0.045, h + 0.004, d + 0.012, M(sx * 0.13, h / 2 - 0.002, 0));                             // 帯
    }
    for (const sz of [-1, 1]) b.box(w + 0.008, 0.026, 0.02, M(0, h - 0.013, sz * (d / 2 - 0.006)));   // ふち
    b.box(0.1, 0.11, 0.014, M(0, h - 0.06, d / 2 + 0.006));                                           // 錠の板
    b.color(0xffffff).decal(atlas.rect('heart'), 0.085, 0.085, M(0, h - 0.062, d / 2 + 0.0135));
    const m = new THREE.Mesh(own(b.build()), mats.chest);
    if (shadows) { m.castShadow = true; m.receiveShadow = true; }
    tilt.add(m);
  }

  // ---- ふた（後ろの上の辺が蝶番。半円柱）
  const lid = new THREE.Group();
  lid.position.set(0, h, -d / 2);
  tilt.add(lid);
  {
    const b = new Builder();
    const r = d / 2;
    const toX = new THREE.Matrix4().makeRotationZ(-HX).setPosition(0, 0, r); // 円柱の Y 軸 → X 軸、中心を蝶番の前へ
    b.color(COLORS.chest).add(new THREE.CylinderGeometry(r, r, w, 16, 1, false, Math.PI, Math.PI), toX);
    b.color(COLORS.chestInside).add(new THREE.PlaneGeometry(w - 0.01, d - 0.01), M(0, 0.004, r, HX, 0, 0)); // 内側（下向き）
    b.color(COLORS.chestTrim);
    for (const sx of [-1, 1]) {
      const band = new THREE.Matrix4().makeRotationZ(-HX).setPosition(sx * 0.13, 0, r);
      b.add(new THREE.CylinderGeometry(r + 0.007, r + 0.007, 0.045, 16, 1, false, Math.PI, Math.PI), band);
      const end = new THREE.Matrix4().makeRotationZ(-HX).setPosition(sx * (w / 2 - 0.008), 0, r);
      b.add(new THREE.CylinderGeometry(r + 0.006, r + 0.006, 0.02, 16, 1, false, Math.PI, Math.PI), end);
    }
    b.box(0.09, 0.05, 0.02, M(0, 0.012, d + 0.004));                                                   // 掛け金
    lid.add(new THREE.Mesh(own(b.build()), mats.chest));
  }

  // ---- おもちゃ（ばねの先）
  const toys = [];
  function addToy(build, x, lean, len, delay) {
    const b = new Builder();
    build(b);
    const m = new THREE.Mesh(own(b.build()), mats.paint);
    m.visible = false;
    tilt.add(m);
    toys.push({ mesh: m, x, lean, len, delay, cur: 0 });
  }
  // 星
  addToy((b) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = HX + (i * Math.PI) / 5, r = i % 2 ? 0.055 : 0.12; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
    b.color(0xffd23c).add(kit.extrude(pts, 0.03, 0.014, 2));
    b.color(0x3a2a1a).sphere(0.012, 6, 5, M(-0.03, 0.01, 0.03)).sphere(0.012, 6, 5, M(0.03, 0.01, 0.03));
  }, -0.13, -0.42, 0.50, 0.38);
  // くま
  addToy((b) => {
    b.color(0xc98b52).sphere(0.1, 16, 12);
    for (const sx of [-1, 1]) {
      b.color(0xc98b52).sphere(0.042, 10, 8, M(sx * 0.078, 0.078, 0));
      b.color(0xffb3c7).sphere(0.026, 8, 6, M(sx * 0.078, 0.078, 0.022));
      b.color(0x2b1d14).sphere(0.013, 6, 5, M(sx * 0.036, 0.022, 0.091));
    }
    b.color(0xf6dfc0).sphere(0.045, 10, 8, M(0, -0.022, 0.078, 0, 0, 0, 1, 0.8, 0.7));
    b.color(0x2b1d14).sphere(0.015, 6, 5, M(0, -0.008, 0.108));
    b.color(0xff5f8f);
    b.add(kit.extrude([[0, 0], [-0.07, 0.035], [-0.07, -0.035]], 0.03, 0.006, 1), M(0, -0.105, 0.05));
    b.add(kit.extrude([[0, 0], [0.07, -0.035], [0.07, 0.035]], 0.03, 0.006, 1), M(0, -0.105, 0.05));  // ちょうネクタイ
  }, 0, 0, 0.66, 0.16);
  // ハート
  addToy((b) => {
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * TAU; // ハート曲線
      pts.push([0.0072 * 16 * Math.pow(Math.sin(t), 3), 0.0072 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 0.01]);
    }
    b.color(0xff5f8f).add(kit.extrude(pts, 0.03, 0.016, 2));
  }, 0.13, 0.42, 0.50, 0.6);

  // ばね 3 本（同じ形。InstancedMesh）
  let springs;
  {
    const b = new Builder();
    b.color(COLORS.steel);
    kit.spring(b, { R: 0.034, r: 0.0085, turns: 6, seg: 10, radial: 5 });
    springs = new THREE.InstancedMesh(own(b.build()), mats.steel, toys.length);
    springs.frustumCulled = false;
    springs.visible = false;
    tilt.add(springs);
  }

  // きらきら（4 つの角の星。不透明、InstancedMesh）
  const NS = 10;
  let sparkles;
  {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = i % 2 ? 0.02 : 0.085; pts.push(r * Math.cos(a), r * Math.sin(a), 0); }
    const g = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; pos.push(0, 0, 0, pts[i * 3], pts[i * 3 + 1], 0, pts[j * 3], pts[j * 3 + 1], 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sparkles = new THREE.InstancedMesh(own(g), mats.sparkle, NS);
    sparkles.frustumCulled = false;
    sparkles.visible = false;
    group.add(sparkles);
  }

  // 当たり（大きめの箱）
  const proxy = new THREE.Mesh(own(new THREE.BoxGeometry(0.95, 0.85, 0.75)), mats.proxy);
  proxy.position.set(0, 0.3, 0);
  proxy.visible = false;
  group.add(proxy);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const st = { lid: 0, pops: 0 };

  // openT：ふたが開き始めてからの秒（閉じているときは負）。rattle：0〜1（頂上で「あけて」とがたがたする強さ）
  function update(dt, time, openT, rattle, sparkle) {
    // ふた
    let lidA;
    if (openT >= 0) lidA = T.lidOpen * springStep(openT, 2.4, 0.5);
    else {
      const burst = Math.pow(Math.max(0, Math.sin(time * 2.6)), 6);
      lidA = rattle * (0.05 + 0.1 * burst * (0.6 + 0.4 * Math.sin(time * 31)));
    }
    st.lid += (lidA - st.lid) * (openT >= 0 ? 1 : 1 - Math.exp(-14 * dt));
    lid.rotation.x = -st.lid;
    const shake = rattle * Math.pow(Math.max(0, Math.sin(time * 2.6)), 4);
    tilt.rotation.z = 0.035 * shake * Math.sin(time * 27);
    tilt.position.y = 0.012 * shake * Math.abs(Math.sin(time * 19));

    // おもちゃとばね
    let any = false, pops = 0;
    for (let i = 0; i < toys.length; i++) {
      const ty = toys[i];
      const t = openT - ty.delay;
      if (!(t > 0)) { ty.mesh.visible = false; springs.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
      any = true; pops++;
      const k = springStep(t, 2.1, 0.22);                        // ばねの伸び（行き過ぎて揺れる）
      const len = Math.max(0.04, ty.len * k);
      const sway = 0.16 * Math.exp(-0.9 * t) * Math.sin(8.5 * t + i * 2.1) + 0.03 * Math.sin(time * 2.1 + i);
      const a = ty.lean * clamp(t * 2.5, 0, 1) + sway;           // 扇のように開く
      const fwd = 0.16;                                          // 少し手前へ傾ける（ふたを避ける）
      q.setFromEuler(e.set(fwd, 0, -a));
      v.set(0, 1, 0).applyQuaternion(q);
      const bx = ty.x, by = 0.03;
      springs.setMatrixAt(i, m4.compose(sc.set(bx, by, 0), q, v.set(1, len, 1)));
      v.set(0, 1, 0).applyQuaternion(q).multiplyScalar(len + 0.07);
      ty.mesh.visible = true;
      ty.mesh.position.set(bx + v.x, by + v.y, v.z);
      const grow = clamp(0.35 + t * 3.2, 0.35, 1);
      const beat = i === 2 ? 1 + 0.08 * Math.max(0, Math.sin(time * 7)) : 1;
      ty.mesh.scale.setScalar(grow * beat);
      ty.mesh.rotation.set(fwd + (i === 1 ? 0.12 * Math.sin(time * 3.1) : 0), i === 0 ? 0.55 * Math.sin(time * 2.3) : 0.2 * Math.sin(time * 1.7 + i), -a);
    }
    springs.visible = any;
    if (any) springs.instanceMatrix.needsUpdate = true;
    const newPops = pops - st.pops;
    st.pops = pops;

    // きらきら
    if (sparkle > 0.01) {
      sparkles.visible = true;
      for (let i = 0; i < NS; i++) {
        const ph = time * (0.5 + 0.07 * i) + i * 0.618;
        const life = ph - Math.floor(ph);
        const seed = Math.floor(ph) * 7.13 + i * 3.7;
        const ang = seed * 2.4, rad = 0.26 + 0.2 * (Math.sin(seed * 1.3) * 0.5 + 0.5) + (openT >= 0 ? 0.25 : 0);
        const s = sparkle * Math.sin(life * Math.PI) * (0.7 + 0.5 * Math.sin(seed));
        v.set(Math.cos(ang) * rad * 1.25, 0.25 + Math.sin(ang) * rad * 0.8 + (openT >= 0 ? 0.3 : 0.05) + life * 0.12, 0.2 + 0.1 * Math.sin(seed * 2.2));
        q.setFromEuler(e.set(0, 0, life * 1.5 + seed));
        sparkles.setMatrixAt(i, m4.compose(v, q, sc.set(s, s, s)));
      }
      sparkles.instanceMatrix.needsUpdate = true;
    } else sparkles.visible = false;
    return newPops; // このフレームで飛び出したおもちゃの数（音用）
  }

  function anchor(out) { // 宝箱の中心（root 座標）
    group.updateWorldMatrix(true, false);
    return out.set(0, h * 0.6, 0).applyMatrix4(group.matrixWorld);
  }

  return { group, proxy, update, anchor, glowMaterial: mats.chest, toys };
}
