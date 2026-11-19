// 掃除まわりの部品：プラグ、ノズル（ブラシローラー・歯車列・車輪）、ホース、集じん容器、ごみ箱、紙片、きらきら。
import { TAU, gearPhase, rnd } from './mech.js';

function meshIn(THREE, own, parent, geo, mat, cast) {
  const m = new THREE.Mesh(own(geo), mat);
  m.castShadow = !!cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function hitBox(THREE, own, hitMat, control, size) {
  const m = new THREE.Mesh(own(new THREE.BoxGeometry(size[0], size[1], size[2])), hitMat);
  m.userData.control = control;
  m.userData.enabled = false;
  m.name = 'hit-' + control;
  return m;
}

// ---- プラグ（ローカル +Z が刃の向き。コードは −Z 側に付く） ----
export function buildPlug(ctx) {
  const { THREE, G, P, M, own, hitMat } = ctx;
  const p = P.plug, C = P.colors;
  const group = new THREE.Group();
  const parts = [];
  parts.push(G.paint(G.rbox(p.w, p.h, p.len, 0.008, 3), C.yellow));
  parts.push(G.paint(G.at(G.axisZ(G.cyl(0.006, 0.016, 10, 0.0095)), 0, 0, -p.len / 2 - 0.006), C.orange)); // コードの根元
  for (const s of [-1, 1]) parts.push(G.paint(G.at(G.rbox(p.prongW, 0.013, p.prongLen, 0.002, 1), (s * p.prongGap) / 2, 0, p.len / 2 + p.prongLen / 2 - 0.002), C.white));
  const m = meshIn(THREE, own, group, G.merge(parts), M.plug, true);
  m.name = 'plug';
  const hit = hitBox(THREE, own, hitMat, 'plug', [p.hit, 0.12, p.hit]);
  hit.position.y = 0.03;
  group.add(hit);
  return { group, hit, tail: -p.len / 2 - 0.012 };
}

// ---- ノズル ----
export function buildNozzle(ctx) {
  const { THREE, G, P, M, own, hitMat } = ctx;
  const N = P.nozzle, BR = P.brush, C = P.colors;
  const group = new THREE.Group();
  group.name = 'nozzle';
  const hw = N.width / 2;
  const ay = BR.axisY, az = BR.axisZ, coverR = BR.tipR + 0.006;
  // 横から見た輪郭（z, y）。前はローラーを包む円弧、後ろはダクト
  const prof = [];
  prof.push([az + coverR * 0.92, 0.004]);
  for (let i = 0; i <= 8; i++) { const a = -0.45 + (i / 8) * (Math.PI / 2 + 0.75); prof.push([az + coverR * Math.cos(a), ay + coverR * Math.sin(a)]); }
  prof.push([-0.03, N.height], [-0.052, N.height - 0.012], [-N.depth / 2, 0.03], [-N.depth / 2, 0.012], [-0.05, 0.004]);
  const cz = prof.reduce((s, q) => s + q[0], 0) / prof.length, cy = prof.reduce((s, q) => s + q[1], 0) / prof.length;
  const inset = (d) => prof.map((q) => { const l = Math.hypot(q[0] - cz, q[1] - cy) || 1; return [q[0] + ((cz - q[0]) / l) * d, q[1] + ((cy - q[1]) / l) * d]; });

  const st = [];
  const boxX0 = hw - N.gearBox; // 歯車の部屋の内側の端
  // 左の端板
  st.push(G.paint(G.at(G.sideExtrude(prof, N.plateT, 0.003), -hw, 0, 0), C.mint));
  // 歯車の部屋：下が開いたアーチ形の枠（外は透明な窓）
  const inner = inset(0.007);
  const arch = [];
  for (let i = 0; i < prof.length; i++) arch.push(prof[i]);
  for (let i = inner.length - 1; i >= 0; i--) arch.push([inner[i][0], Math.max(inner[i][1], 0.004)]);
  st.push(G.paint(G.at(G.sideExtrude(arch, N.gearBox, 0.002), boxX0, 0, 0), C.mint));
  // 仕切り（歯車の部屋とローラーの間）：ローラー軸の上だけ
  // 後ろの胴（ダクトとモーターが入る）
  const back = [[-0.016, 0.006], [-0.016, N.height - 0.01], [-0.03, N.height], [-0.052, N.height - 0.012], [-N.depth / 2, 0.03], [-N.depth / 2, 0.012], [-0.05, 0.006]];
  st.push(G.paint(G.at(G.sideExtrude(back, boxX0 + hw - N.plateT + 0.002, 0), -hw + N.plateT - 0.001, 0, 0), C.mint));
  // 前のバンパー
  st.push(G.paint(G.at(G.rbox(boxX0 + hw - 0.004, 0.012, 0.008, 0.003, 2), (boxX0 - hw) / 2, 0.016, az + coverR * 0.93), C.mintDeep));
  // 首（ワンド）と輪
  const wb = new THREE.Vector3().fromArray(N.wandBase), wt = new THREE.Vector3().fromArray(N.wandTop);
  const wdir = wt.clone().sub(wb).normalize(), wlen = wt.distanceTo(wb);
  st.push(G.paint(G.aim(G.at(G.cyl(N.wandR, wlen, 14), 0, wlen / 2, 0), wdir, wb), C.white));
  st.push(G.paint(G.aim(G.ring(N.wandR - 0.001, N.wandR + 0.007, 0.022, 16), wdir, wb.clone().addScaledVector(wdir, -0.004)), C.mintDeep));
  st.push(G.paint(G.aim(G.ring(N.wandR - 0.001, N.wandR + 0.006, 0.05, 16), wdir, wb.clone().addScaledVector(wdir, wlen * 0.42)), C.yellow)); // 持つ所
  st.push(G.paint(G.aim(G.ring(N.wandR - 0.001, N.wandR + 0.006, 0.016, 16), wdir, wt.clone().addScaledVector(wdir, -0.016)), C.lilac));
  // モーター歯車の軸
  const ph = gearPhase(BR);
  const my = ay + BR.centerDist * Math.cos(BR.motorDir), mz = az + BR.centerDist * Math.sin(BR.motorDir);
  st.push(G.paint(G.at(G.axisX(G.cyl(0.003, N.gearBox - 0.004, 8)), boxX0 + N.gearBox / 2, my, mz), C.white));
  const housing = meshIn(THREE, own, group, G.merge(st), M.nozzle, true);
  housing.name = 'nozzle-housing';

  // 透明：ローラーの上のカバーと、歯車の部屋の窓
  const a0 = -0.45, a1 = Math.PI - Math.acos(Math.min(1, (az + 0.016) / coverR));
  const cover = G.surface(12, 1, (u, v, o) => { const a = a0 + (a1 - a0) * u; o[0] = -hw + N.plateT + (boxX0 + hw - N.plateT) * (1 - v); o[1] = ay + coverR * Math.sin(a); o[2] = az + coverR * Math.cos(a); });
  const pane = G.at(G.sideExtrude(inset(0.003), 0.002, 0), hw - 0.004, 0, 0);
  const clear = meshIn(THREE, own, group, G.merge([G.plain(cover), G.plain(pane)]), M.clear, false);
  clear.renderOrder = 3;
  clear.name = 'nozzle-clear';

  // ブラシローラー（芯＋毛束＋ローラー歯車）。X 軸まわりに回る
  const rotor = new THREE.Group();
  rotor.position.set(0, ay, az);
  group.add(rotor);
  const rp = [];
  const rollX0 = -hw + N.plateT + 0.004, rollX1 = boxX0 - 0.004;
  const rollLen = rollX1 - rollX0, rollC = (rollX0 + rollX1) / 2;
  rp.push(G.paint(G.at(G.axisX(G.cyl(BR.coreR, rollLen, 14)), rollC, 0, 0), C.white));
  rp.push(G.paint(G.at(G.axisX(G.cyl(0.004, N.width - 0.012, 8)), 0, 0, 0), C.white));
  const tuftColors = [C.red, C.yellow, C.blue, C.mintDeep];
  const th = BR.tipR - BR.coreR + 0.002;
  for (let k = 0; k < BR.rows; k++) for (let i = 0; i < BR.perRow; i++) {
    const t = (i + 0.5) / BR.perRow;
    const g = G.cyl(BR.tuftR, th, 6, BR.tuftR * 0.45); // 根元が太い毛束
    g.translate(0, BR.coreR - 0.002 + th / 2, 0);
    g.rotateX(TAU * (k / BR.rows + t * BR.turns)); // らせん
    g.translate(rollX0 + t * rollLen, 0, 0);
    rp.push(G.paint(g, tuftColors[k % tuftColors.length]));
  }
  const gearX = hw - 0.006 - BR.gearW; // 窓のすぐ内側（上の枠に隠れにくい）
  const g2 = G.axisXfromZ(G.extrude(G.gearShape(BR.z2, BR.module, 0.004, { count: 5, at: BR.module * BR.z2 * 0.3, r: BR.module * BR.z2 * 0.1 }), BR.gearW, 0, 6));
  rp.push(G.paint(G.at(g2, gearX, 0, 0), C.yellow));
  const rotorMesh = meshIn(THREE, own, rotor, G.merge(rp), M.plastic, false);
  rotorMesh.name = 'brush-roller';

  // モーター歯車
  const motor = new THREE.Group();
  motor.position.set(gearX, my, mz);
  group.add(motor);
  const g1 = G.axisXfromZ(G.extrude(G.gearShape(BR.z1, BR.module, 0.003, { count: 3, at: BR.module * BR.z1 * 0.27, r: BR.module * BR.z1 * 0.11 }), BR.gearW, 0, 6));
  meshIn(THREE, own, motor, G.paint(g1, C.red), M.plastic, false).name = 'motor-gear';

  // 車輪（左右を1つに。X 軸まわりに回る）
  const wheels = new THREE.Group();
  wheels.position.set(0, N.wheelR, N.wheelZ);
  group.add(wheels);
  const wp = [];
  for (const s of [-1, 1]) {
    wp.push(G.paint(G.at(G.axisX(G.cyl(N.wheelR, N.wheelW, 18)), s * N.wheelX, 0, 0), C.mintDeep));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      wp.push(G.paint(G.at(G.axisX(G.cyl(0.0045, 0.003, 8)), s * (N.wheelX + N.wheelW / 2 + 0.001), Math.cos(a) * N.wheelR * 0.55, Math.sin(a) * N.wheelR * 0.55), C.white));
    }
  }
  meshIn(THREE, own, wheels, G.merge(wp), M.plastic, false).name = 'nozzle-wheels';

  const hit = hitBox(THREE, own, hitMat, 'nozzle', N.hit);
  hit.position.set(0, N.hit[1] / 2 - 0.01, -0.035);
  group.add(hit);

  // 紙片の通り道（ローカル）：ブラシの下 → 後ろ → ダクト → 首の上端
  const neck = [[0, ay - BR.tipR * 0.2, az - BR.tipR], [0, 0.03, -0.02], [0, N.wandBase[1], N.wandBase[2]], [0, N.wandTop[1], N.wandTop[2]]];
  return { group, rotor, motor, wheels, hit, phase: ph, wandDir: wdir, wandTop: wt, neck };
}

// ---- ホース：節（InstancedMesh）と透明な管 ----
export function buildHose(ctx) {
  const { THREE, G, P, M, own } = ctx;
  const H = P.hose, C = P.colors;
  const l = H.ringLen / 2, R = H.ringR, ri = H.tubeR - 0.0005;
  const bead = G.paint(G.revolve([[ri, -l], [R * 0.9, -l], [R, -l * 0.45], [R, l * 0.45], [R * 0.9, l], [ri, l]], 16, 1.0), null);
  const rings = new THREE.InstancedMesh(own(bead), M.plastic, H.rings);
  rings.castShadow = true;
  rings.receiveShadow = true;
  rings.frustumCulled = false;
  rings.name = 'hose-rings';
  const col = new THREE.Color();
  for (let i = 0; i < H.rings; i++) rings.setColorAt(i, G.tint(i % 2 ? C.white : C.lilac, col));
  const t = G.tube(H.tubeSeg, H.tubeSides, H.tubeR, true);
  const tubeMesh = new THREE.Mesh(own(t.geometry), M.clear);
  tubeMesh.frustumCulled = false;
  tubeMesh.renderOrder = 3;
  tubeMesh.name = 'hose-tube';
  return { rings, tube: t, tubeMesh };
}

// ---- 集じん容器（原点は底の中心） ----
export function buildBin(ctx) {
  const { THREE, G, P, M, own, hitMat } = ctx;
  const B = P.bin, C = P.colors, LT = P.latch, RS = P.riser;
  const group = new THREE.Group();
  group.name = 'dust-bin';
  const shell = meshIn(THREE, own, group, G.plain(G.revolve([[B.radius, B.collarH - 0.002], [B.radius, B.height]], 32, 1.2)), M.bin, true);
  shell.renderOrder = 4;
  shell.name = 'bin-shell';
  const sp = [];
  sp.push(G.paint(G.ring(B.radius - 0.003, B.collarR, B.collarH, 30), C.blue)); // 下のつば
  const lugY = LT.shaftY - B.dock[1];
  sp.push(G.paint(G.at(G.axisZ(G.ring(0.006, 0.011, 0.007, 12)), 0, lugY, B.collarR - 0.003), C.yellow)); // ロックピンが入る穴
  sp.push(G.paint(G.revolve([[B.radius - 0.004, B.height - 0.004], [B.radius + 0.003, B.height - 0.004], [B.radius + 0.003, B.height + 0.007], [B.radius - 0.012, B.height + B.capH], [0, B.height + B.capH]], 30, 0.8), C.blue)); // ふた
  const handle = new THREE.TorusGeometry(B.handleR, 0.0075, 8, 14, Math.PI);
  sp.push(G.paint(G.at(handle, 0, B.height + B.capH - 0.004, 0), C.yellow)); // 取っ手
  sp.push(G.paint(G.at(G.axisX(G.ring(RS.radius - 0.002, RS.radius + 0.005, 0.01, 16)), -B.radius - 0.006, B.inletY, 0), C.lilac)); // 吸込み口
  sp.push(G.paint(G.at(G.axisZ(G.cyl(0.0055, 0.05, 8)), B.radius - 0.001, 0.003, 0), C.yellow)); // 底ぶたの蝶番
  const solid = meshIn(THREE, own, group, G.merge(sp), M.binSolid, true);
  solid.name = 'bin-solid';
  // 底ぶた（蝶番は +X 側の底。+Z まわりに開く）
  const flap = new THREE.Group();
  flap.position.set(B.radius - 0.001, 0.003, 0);
  group.add(flap);
  const fr = B.radius - 0.004;
  const fp = [G.paint(G.at(G.cyl(fr, 0.005, 26), -(B.radius - 0.001), 0, 0), C.orange), G.paint(G.at(G.box(0.014, 0.004, 0.02), -2 * B.radius + 0.008, -0.0035, 0), C.yellow)];
  meshIn(THREE, own, flap, G.merge(fp), M.binSolid, false).name = 'bin-flap';
  const hit = hitBox(THREE, own, hitMat, 'bin', B.hit);
  hit.position.y = B.height / 2 + 0.01;
  group.add(hit);
  return { group, flap, hit, shell };
}

// ---- ごみ箱とふた ----
export function buildCan(ctx) {
  const { THREE, G, P, M, own } = ctx;
  const K = P.can, C = P.colors;
  const rt = K.radius, rb = K.radius * K.taper, H = K.height, w = K.wall;
  const group = new THREE.Group();
  group.position.set(K.pos[0], 0, K.pos[2]);
  group.name = 'trash-can';
  const parts = [];
  parts.push(G.paint(G.revolve([[0, 0], [rb, 0], [rt, H], [rt - w, H], [rb - w, w], [0, w]], 32, 0.8), C.sky));
  parts.push(G.paint(G.at(G.ring(rt - 0.002, rt + 0.006, 0.016, 32), 0, H - 0.016, 0), C.white)); // 口の帯
  parts.push(G.paint(G.at(G.ring(rb + (rt - rb) * 0.3, rb + (rt - rb) * 0.3 + 0.004, 0.03, 32), 0, H * 0.3, 0), C.blue));
  parts.push(G.paint(G.at(G.rbox(0.07, 0.03, 0.02, 0.006, 2), 0, H - 0.005, -rt - 0.006), C.blue)); // 蝶番の台
  meshIn(THREE, own, group, G.merge(parts), M.plastic, true).name = 'can';
  const lid = new THREE.Group();
  lid.position.set(0, H + 0.002, -rt - 0.004);
  group.add(lid);
  const lr = rt + 0.008;
  const lp = [];
  lp.push(G.paint(G.at(G.revolve([[0, 0], [lr, 0], [lr, 0.012], [lr * 0.72, 0.03], [0, 0.038]], 30, 0.8), 0, 0, lr - 0.004), C.blue));
  lp.push(G.paint(G.at(G.sphere(0.02, 12, 8), 0, 0.048, lr - 0.004), C.yellow));
  lp.push(G.paint(G.axisX(G.cyl(0.007, 0.08, 8)), C.white));
  meshIn(THREE, own, lid, G.merge(lp), M.plastic, true).name = 'can-lid';
  return { group, lid };
}

// ---- 紙片（InstancedMesh。写真の中の色紙をインスタンスごとの UV で切り出す） ----
// 写真 paper_scraps の中で、一色で塗られた小窓の中心（u, v）。下調べして決めた値
const SCRAP_UV = [
  0.3213, 0.0889, 0.5166, 0.5732, 0.2354, 0.2568, 0.9111, 0.7529, 0.3877, 0.3662, 0.583, 0.0928, 0.8213, 0.9717, 0.7471, 0.6748,
  0.29, 0.3545, 0.5049, 0.7529, 0.7314, 0.7764, 0.7002, 0.2568, 0.9424, 0.0732, 0.0205, 0.46, 0.4424, 0.9639, 0.0244, 0.792,
  0.0752, 0.2725, 0.1729, 0.9326, 0.5596, 0.7451, 0.2354, 0.7178, 0.9775, 0.4014, 0.915, 0.2021, 0.4775, 0.292, 0.5518, 0.1982,
  0.9463, 0.9131, 0.1963, 0.417, 0.958, 0.5889, 0.2354, 0.4756, 0.751, 0.1045, 0.3174, 0.9287, 0.583, 0.3076, 0.0439, 0.085,
  0.7236, 0.3232, 0.4619, 0.5342, 0.1377, 0.792, 0.3877, 0.3076, 0.8018, 0.0811, 0.6494, 0.4443, 0.9268, 0.6904, 0.6494, 0.9756,
  0.1299, 0.6006, 0.3916, 0.9092, 0.6494, 0.8936, 0.2275, 0.8037, 0.7041, 0.4131, 0.4697, 0.8896,
];

export function buildScraps(ctx, paperTex) {
  const { THREE, G, P, own } = ctx;
  const S = P.scraps;
  // 少し反った四角（1×1、Y 上）
  const geo = G.surface(2, 2, (u, v, o) => { o[0] = 0.5 - u; o[2] = v - 0.5; o[1] = 0.1 * ((u - 0.5) * (u - 0.5) * 2 - (v - 0.5) * (v - 0.5)); });
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * 2 * S.uvHalf, (uv.getY(i) - 0.5) * 2 * S.uvHalf);
  const off = new Float32Array(S.count * 2);
  const nUv = SCRAP_UV.length / 2;
  for (let i = 0; i < S.count; i++) {
    const k = (i * 7 + 3) % nUv;
    off[i * 2] = SCRAP_UV[k * 2]; off[i * 2 + 1] = SCRAP_UV[k * 2 + 1];
  }
  geo.setAttribute('aUvOff', new THREE.InstancedBufferAttribute(off, 2));
  const mat = own(new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  // インスタンスごとに UV をずらす（足し算だけ。pow・normalize は使わない）
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUvOff;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv += aUvOff;\n#endif');
  };
  mat.customProgramCacheKey = () => 'hero-scrap-uv';
  const mesh = new THREE.InstancedMesh(own(geo), mat, S.count);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'scraps';
  // 大きさ（幅・奥行）は1枚ずつ違う
  const size = [];
  for (let i = 0; i < S.count; i++) size.push([S.size[0] + rnd(i, 21) * (S.size[1] - S.size[0]), S.size[0] * 0.75 + rnd(i, 22) * (S.size[1] - S.size[0]) * 0.8]);
  return { mesh, size };
}

// ---- きらきら（フィナーレ用の小さな星。InstancedMesh） ----
export function buildStars(ctx) {
  const { THREE, G, P, own } = ctx;
  const n = P.finale.stars;
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = i % 2 ? 0.38 : 1; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  const geo = new THREE.ShapeGeometry(G.polyShape(pts));
  const mat = own(new THREE.MeshBasicMaterial({ color: '#fff2a8', side: THREE.DoubleSide, toneMapped: false }));
  const mesh = new THREE.InstancedMesh(own(geo), mat, n);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = 'stars';
  return { mesh };
}

// ---- 丸い疑似影（影なしのティア用。頂点の透明度で縁をぼかす） ----
export function buildBlob(ctx, radius) {
  const { THREE, own } = ctx;
  const seg = 24, mid = 0.62;
  const pos = [0, 0, 0], col = [0.2, 0.13, 0.1, 0.5];
  for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pos.push(Math.cos(a) * radius * mid, 0, Math.sin(a) * radius * mid); col.push(0.2, 0.13, 0.1, 0.36); }
  for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius); col.push(0.2, 0.13, 0.1, 0); }
  const idx = [];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg, a = 1 + i, b = 1 + j, c = 1 + seg + i, d = 1 + seg + j;
    idx.push(0, b, a, a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const mat = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  const m = new THREE.Mesh(own(g), mat);
  m.renderOrder = 1;
  return m;
}
