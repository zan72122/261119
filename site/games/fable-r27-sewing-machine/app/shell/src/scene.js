// 周辺の場面（遠景扱い）：作業台・壁・窓・カーテン・糸巻き・ピンクッション・飾りのひも。
// 低ポリの形＋写真風テクスチャ（512²）か板ポリゴン。同じ部品は InstancedMesh。
import { blobShadowTexture, skyTexture } from './textures.js';

export function buildBackground(THREE, scene, tex, tier) {
  const group = new THREE.Group();
  group.name = 'background';
  scene.add(group);
  const owned = { geos: [], mats: [], texs: [] };
  const G = (g) => (owned.geos.push(g), g);
  const M = (m) => (owned.mats.push(m), m);
  const T = (t) => (owned.texs.push(t), t);
  const seg = (n) => Math.max(6, Math.round(n * tier.detail));

  // 写真風テクスチャは repeat を変えるので clone（同じ画像、GPU では別テクスチャ）。
  const rep = (t, x, y) => { if (!t) return null; const c = T(t.clone()); c.repeat.set(x, y); c.needsUpdate = true; return c; };

  // --- 作業台 ---
  const tableMat = M(new THREE.MeshLambertMaterial({ color: 0xffffff, map: rep(tex.wood_table_512, 2, 1.3) }));
  const table = new THREE.Mesh(G(new THREE.BoxGeometry(1.6, 0.04, 1.03)), tableMat);
  table.position.set(0, -0.02, 0.035);
  group.add(table);

  // --- 床（ほぼ見えない保険） ---
  const floor = new THREE.Mesh(G(new THREE.PlaneGeometry(6, 6)), M(new THREE.MeshLambertMaterial({ color: 0xe8d2c4 })));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.75;
  group.add(floor);

  // --- 奥の壁 ---
  const wallMat = M(new THREE.MeshLambertMaterial({ color: 0xffffff, map: rep(tex.wallpaper_pastel_512, 6, 4.5) }));
  const wall = new THREE.Mesh(G(new THREE.PlaneGeometry(3.2, 2.4)), wallMat);
  wall.position.set(0, 0.6, -0.5);
  group.add(wall);
  // 壁の幅木
  const skirt = new THREE.Mesh(G(new THREE.BoxGeometry(3.2, 0.06, 0.02)), M(new THREE.MeshLambertMaterial({ color: 0xfff7ef })));
  skirt.position.set(0, 0.03, -0.49);
  group.add(skirt);

  // --- 窓（左上）：空の絵・木枠・窓台・カーテン ---
  const win = new THREE.Group();
  win.position.set(-0.5, 0.66, -0.495);
  group.add(win);
  const sky = new THREE.Mesh(G(new THREE.PlaneGeometry(0.46, 0.40)), M(new THREE.MeshBasicMaterial({ map: T(skyTexture(THREE)) })));
  win.add(sky);
  const frameMat = M(new THREE.MeshLambertMaterial({ color: 0xfffaf3 }));
  const bars = [
    [0.52, 0.035, 0, 0.2175], [0.52, 0.035, 0, -0.2175], [0.035, 0.47, -0.2425, 0], [0.035, 0.47, 0.2425, 0],
    [0.02, 0.40, 0, 0], [0.46, 0.02, 0, 0],
  ];
  const barGeo = G(new THREE.BoxGeometry(1, 1, 0.025));
  const frame = new THREE.InstancedMesh(barGeo, frameMat, bars.length);
  const m4 = new THREE.Matrix4();
  bars.forEach(([w, h, x, y], i) => { m4.compose(new THREE.Vector3(x, y, 0.012), new THREE.Quaternion(), new THREE.Vector3(w, h, 1)); frame.setMatrixAt(i, m4); });
  win.add(frame);
  const sill = new THREE.Mesh(G(new THREE.BoxGeometry(0.58, 0.022, 0.07)), frameMat);
  sill.position.set(0, -0.235, 0.035);
  win.add(sill);
  // カーテン：少し波打つ板（形は一度だけ作る）
  const curtainGeo = G(new THREE.PlaneGeometry(0.17, 0.54, seg(14), 1));
  {
    const p = curtainGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.012 * Math.sin(p.getX(i) / 0.17 * Math.PI * 6));
    curtainGeo.computeVertexNormals();
  }
  const floralTex = rep(tex.floral_cotton_512, 1, 2.5); // カーテンとピンクッションで共用（GPU 1枚）
  const curtainMat = M(new THREE.MeshLambertMaterial({ color: 0xffffff, map: floralTex, side: THREE.DoubleSide }));
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(curtainGeo, curtainMat);
    c.position.set(sx * 0.31, 0.0, 0.05);
    win.add(c);
  }
  // カーテンレール
  const rail = new THREE.Mesh(G(new THREE.CylinderGeometry(0.008, 0.008, 0.8, seg(10))), M(new THREE.MeshLambertMaterial({ color: 0xd9b48a })));
  rail.rotation.z = Math.PI / 2; rail.position.set(0, 0.29, 0.06);
  win.add(rail);

  // --- 飾りのひも（右上）：完成した布をここに飾る ---
  const lineY = 0.745, lineZ = -0.468;
  const rope = new THREE.Mesh(G(new THREE.CylinderGeometry(0.0025, 0.0025, 0.68, 6)), M(new THREE.MeshLambertMaterial({ color: 0xf4a6b8 })));
  rope.rotation.z = Math.PI / 2; rope.position.set(0.465, lineY, lineZ);
  group.add(rope);
  const hookGeo = G(new THREE.SphereGeometry(0.012, 10, 8));
  const hookMat = M(new THREE.MeshLambertMaterial({ color: 0xfff1d6 }));
  for (const x of [0.125, 0.805]) { const h = new THREE.Mesh(hookGeo, hookMat); h.position.set(x, lineY, lineZ - 0.01); group.add(h); }
  const slotXs = [0.27, 0.465, 0.66];
  // 洗濯ばさみ：布の上の左右の角に 1 つずつ（真ん中に置くと縫い始めの模様を隠すため）
  const pinGeo = G(new THREE.BoxGeometry(0.009, 0.036, 0.010));
  const pins = new THREE.InstancedMesh(pinGeo, M(new THREE.MeshLambertMaterial({ color: 0xffffff })), slotXs.length * 2);
  const pinColors = [0x9ad9c6, 0xf7b7c8, 0xffd98a];
  slotXs.forEach((x, i) => {
    for (const side of [0, 1]) {
      m4.makeTranslation(x + (side ? 0.058 : -0.058), lineY - 0.006, lineZ + 0.012); pins.setMatrixAt(i * 2 + side, m4);
      pins.setColorAt(i * 2 + side, new THREE.Color(pinColors[i]));
    }
  });
  group.add(pins);
  const displaySlots = slotXs.map((x) => ({
    position: new THREE.Vector3(x, lineY - 0.012, lineZ + 0.006),
    quaternion: new THREE.Quaternion(),
    width: 0.15, height: 0.22,
  }));

  // --- 糸巻き 3つ（右奥）：糸の筒＋木のつば ---
  const spools = [[0.44, -0.31, 0xf7a8b8], [0.535, -0.22, 0x8fd3c1], [0.63, -0.33, 0xffd27f]];
  const threadGeo = G(new THREE.CylinderGeometry(0.021, 0.021, 0.046, seg(16)));
  const thread = new THREE.InstancedMesh(threadGeo, M(new THREE.MeshLambertMaterial({ color: 0xffffff })), spools.length);
  const flangeGeo = G(new THREE.CylinderGeometry(0.028, 0.028, 0.007, seg(18)));
  const flange = new THREE.InstancedMesh(flangeGeo, M(new THREE.MeshLambertMaterial({ color: 0xe9bf8a })), spools.length * 2);
  spools.forEach(([x, z, col], i) => {
    m4.makeTranslation(x, 0.0305, z); thread.setMatrixAt(i, m4); thread.setColorAt(i, new THREE.Color(col));
    m4.makeTranslation(x, 0.0035, z); flange.setMatrixAt(i * 2, m4);
    m4.makeTranslation(x, 0.0575, z); flange.setMatrixAt(i * 2 + 1, m4);
  });
  group.add(thread, flange);

  // --- ピンクッション（左奥）：トマト形＋まち針の頭。front から見て押さえレバーのつまみと重ならない位置 ---
  const PC = [-0.62, -0.30];
  const cushion = new THREE.Mesh(G(new THREE.SphereGeometry(0.05, seg(18), seg(12))), M(new THREE.MeshLambertMaterial({ color: 0xffe3ea, map: floralTex })));
  cushion.scale.set(1, 0.72, 1); cushion.position.set(PC[0], 0.034, PC[1]);
  group.add(cushion);
  const headGeo = G(new THREE.SphereGeometry(0.0065, 8, 6));
  const heads = new THREE.InstancedMesh(headGeo, M(new THREE.MeshLambertMaterial({ color: 0xffffff })), 6);
  const headCols = [0xff8fa8, 0x7fcfe0, 0xffd166, 0xb59cf0, 0x8fd694, 0xff9f7a];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3, r = 0.03 + (i % 2) * 0.008;
    m4.makeTranslation(PC[0] + Math.cos(a) * r, 0.072 + (i % 2) * 0.006, PC[1] + Math.sin(a) * r);
    heads.setMatrixAt(i, m4); heads.setColorAt(i, new THREE.Color(headCols[i]));
  }
  group.add(heads);

  // --- 疑似影（ぼかし円の板） ---
  const blob = T(blobShadowTexture(THREE));
  const shadowMat = M(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false }));
  const shadowGeo = G(new THREE.PlaneGeometry(1, 1));
  const shadows = [
    [0.0, 0.0, 0.70, 0.40], // ミシン本体の下
    [0.535, -0.29, 0.30, 0.22], [PC[0], PC[1], 0.16, 0.16],
  ];
  const shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, shadows.length);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  shadows.forEach(([x, z, w, d], i) => { m4.compose(new THREE.Vector3(x, 0.0012, z), q, new THREE.Vector3(w, d, 1)); shadowMesh.setMatrixAt(i, m4); });
  shadowMesh.renderOrder = -1;
  group.add(shadowMesh);

  // --- 光：半球光＋部屋の主光＋窓からの光（影なし） ---
  const hemi = new THREE.HemisphereLight(0xfff8f0, 0xd8b896, 1.25);
  const key = new THREE.DirectionalLight(0xfff1e0, 1.7);
  key.position.set(-0.6, 1.4, 1.2);
  const rim = new THREE.DirectionalLight(0xdff0ff, 0.7);
  rim.position.set(-0.8, 0.9, -0.6);
  group.add(hemi, key, key.target, rim, rim.target);

  return {
    group,
    displaySlots,
    dispose() {
      scene.remove(group);
      owned.geos.forEach((g) => g.dispose());
      owned.mats.forEach((m) => m.dispose());
      owned.texs.forEach((t) => t.dispose());
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    },
  };
}
