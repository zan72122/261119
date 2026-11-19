// 本体（キャニスター）と、その上の機構：コードリール・ラチェットと爪・ぜんまい・巻取りボタン・
// 留め金（偏心カム＋ヨーク＋ロックピン）・受け台・立ち上がり管。すべて params から生成する。
import { TAU, ratchetProfile, pawlRestAngle, pawlTip, springTotalAngle } from './mech.js';

export function buildBody(ctx) {
  const { THREE, G, P, M, own, hitMat } = ctx;
  const { body: B, bay, reel: R, ratchet: RT, spring: SP, button: BT, bin: BN, latch: LT, riser: RS, cord: CD, colors: C } = P;
  const zl = R.z;
  const group = new THREE.Group();
  group.name = 'vacuum-body';
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function mesh(geo, mat, parent, cast) {
    const m = new THREE.Mesh(own(geo), mat);
    m.castShadow = !!cast;
    m.receiveShadow = true;
    (parent || group).add(m);
    return m;
  }

  // ================= 動かない部品（1つに結合） =================
  const st = [];
  // 輪郭（XY）
  const outline = () => G.roundRect(new THREE.Shape(), B.x0, B.y0, B.x1, B.y1, [B.rBottom, B.rBottom, B.rTop, B.rTop]);
  const bayPath = (grow) => G.roundRect(new THREE.Path(), bay.x0 - grow, bay.y0 - grow, bay.x1 + grow, bay.y1 + grow, bay.r + grow);
  // 奥の本体（リール室の奥の壁まで）
  st.push(G.paint(G.at(G.extrude(outline(), B.zBay - B.zBack, B.bevel, 8), 0, 0, B.zBack), C.pink));
  // 前の本体（リール室の窓が開いている）。奥の角は奥の本体の中に埋める
  const front = outline();
  front.holes.push(bayPath(0));
  // （窓のまわりの壁が薄いので、前の角の丸みは壁の厚みより小さくする）
  st.push(G.paint(G.at(G.extrude(front, B.bayDepth + B.bevel + B.frontBevel, B.frontBevel, 8), 0, 0, B.zBay - B.bevel - B.frontBevel), C.pink));
  // リール室の奥の板（明るい色で機構を見やすく）
  st.push(G.paint(G.at(G.extrude(G.roundRect(new THREE.Shape(), bay.x0, bay.y0, bay.x1, bay.y1, bay.r), 0.0015, 0, 6), 0, 0, zl.panel - 0.0015), C.cream));
  // リールの軸（動かない。ぜんまいの内端を留める）と先のふた
  const axleLen = zl.spring0 + SP.width + 0.003 - B.zBay;
  st.push(G.paint(G.at(G.axisZ(G.cyl(R.axleR, axleLen, 14)), R.cx, R.cy, B.zBay + axleLen / 2), C.white));
  st.push(G.paint(G.at(G.axisZ(G.cyl(SP.ri + 0.003, 0.003, 16)), R.cx, R.cy, B.zBay + axleLen), C.yellow));
  // 爪の支点の軸
  st.push(G.paint(G.at(G.axisZ(G.cyl(0.004, zl.ratchet0 + RT.thick + 0.003 - B.zBay, 10)), RT.pivot[0], RT.pivot[1], (B.zBay + zl.ratchet0 + RT.thick + 0.003) / 2), C.white));
  // コードの出口の輪
  st.push(G.paint(G.at(G.axisX(G.torus(CD.radius + 0.005, 0.0045, 14)), CD.exit[0] + 0.001, CD.exit[1], CD.exit[2]), C.purple));
  // 車輪（前に1つ、後ろに2つ）と、後ろ寄りの自在車
  function wheel(x, z, side) {
    const w = B.wheelW;
    st.push(G.paint(G.at(G.axisZ(G.cyl(B.wheelR, w, 22)), x, B.wheelR, z), C.pinkDeep));
    st.push(G.paint(G.at(G.axisZ(G.cyl(B.wheelR * 0.62, 0.004, 18)), x, B.wheelR, z + side * (w / 2 + 0.001)), C.white));
    st.push(G.paint(G.at(G.axisZ(G.cyl(B.wheelR * 0.24, 0.004, 12)), x, B.wheelR, z + side * (w / 2 + 0.004)), C.yellow));
  }
  wheel(B.wheelX, B.zFront + B.wheelW / 2, 1);
  wheel(B.wheelX, B.zBack - B.wheelW / 2, -1);
  wheel(B.x1 - 0.08, B.zBack - B.wheelW / 2, -1);
  st.push(G.paint(G.at(G.sphere(B.casterR, 12, 8), B.x1 - 0.07, B.casterR, B.zFront - 0.05), C.pinkDeep));
  st.push(G.paint(G.at(G.cyl(0.008, B.y0 - B.casterR + 0.006, 8), B.x1 - 0.07, (B.y0 + B.casterR) / 2 + 0.003, B.zFront - 0.05), C.white));
  // 受け台（容器が乗る）
  st.push(G.paint(G.at(G.cyl(BN.collarR + 0.004, BN.dock[1] - B.y1 + 0.004, 28), BN.dock[0], (BN.dock[1] + B.y1 - 0.004) / 2, BN.dock[2]), C.lilac));
  // 留め金の軸受け
  for (const s of [-1, 1]) {
    const h = LT.shaftY + 0.007 - B.y1;
    st.push(G.paint(G.at(G.rbox(0.012, h + 0.004, 0.02, 0.004, 2), LT.x + s * (LT.armX + 0.014), B.y1 + h / 2 - 0.002, LT.shaftZ), C.white));
  }
  // ピンの受け（ピンが乗って滑る）
  const pinR = 0.0045;
  const guideZ = LT.pinTip + 0.016;
  st.push(G.paint(G.at(G.box(0.02, LT.shaftY - pinR - B.y1 + 0.002, 0.008), LT.x, (LT.shaftY - pinR + B.y1) / 2 - 0.001, guideZ), C.white));
  // ボタンの座
  st.push(G.paint(G.at(G.ring(BT.radius + 0.0015, BT.radius + 0.008, 0.009, 26), BT.x, B.y1 - 0.003, BT.z), C.white));
  // ホース口・立ち上がり管の輪と留め具
  st.push(G.paint(G.at(G.axisX(G.ring(RS.radius - 0.001, RS.radius + 0.006, 0.016, 18)), RS.hoseEnd[0] + 0.016, RS.y, RS.z), C.lilac));
  st.push(G.paint(G.at(G.ring(RS.radius - 0.001, RS.radius + 0.005, 0.012, 18), RS.x, RS.y + RS.bend + 0.006, RS.z), C.lilac));
  st.push(G.paint(G.at(G.axisX(G.ring(RS.radius - 0.001, RS.radius + 0.005, 0.008, 18)), RS.endX, RS.topY, RS.z), C.lilac));
  for (const y of [RS.y + 0.055, B.y1 - 0.03]) st.push(G.paint(G.at(G.box(B.x0 - RS.x + 0.004, 0.012, 0.02), (B.x0 + RS.x) / 2 + 0.006, y, RS.z), C.white));
  // 顔（前面。目・ほお・口）
  const fx = bay.x0 - 0.062, fy = 0.172, fz = B.zFront + 0.0005;
  for (const s of [-1, 1]) {
    const eye = G.sphere(0.0155, 14, 10); eye.scale(1, 1.15, 0.3);
    st.push(G.paint(G.at(eye, fx + s * 0.026, fy, fz), C.eye));
    const hl = G.sphere(0.005, 8, 6); hl.scale(1, 1, 0.4);
    st.push(G.paint(G.at(hl, fx + s * 0.026 + 0.005, fy + 0.007, fz + 0.005), C.white));
    const ck = G.axisZ(G.cyl(0.0095, 0.002, 12));
    st.push(G.paint(G.at(ck, fx + s * 0.047, fy - 0.026, fz + 0.0005), C.pinkDeep));
  }
  const smile = new THREE.TorusGeometry(0.014, 0.0032, 6, 12, Math.PI);
  smile.rotateZ(Math.PI);
  st.push(G.paint(G.at(smile, fx, fy - 0.022, fz + 0.001), C.eye));

  const bodyMesh = mesh(G.merge(st), M.plastic, group, true);
  bodyMesh.name = 'body-static';

  // ================= 透明な部品（窓と立ち上がり管を1つに） =================
  const pane = G.plain(G.at(G.extrude(G.roundRect(new THREE.Shape(), bay.x0 - 0.005, bay.y0 - 0.005, bay.x1 + 0.005, bay.y1 + 0.005, bay.r + 0.005), 0.002, 0, 6), 0, 0, zl.pane));
  const riserPts = G.roundedPath([
    RS.hoseEnd, [RS.x, RS.y, RS.z], [RS.x, RS.topY, RS.z], [RS.endX, RS.topY, RS.z],
  ], RS.bend, 5);
  const riserTube = G.plain(G.tubeAlong(riserPts, 12, RS.radius));
  const clearMesh = mesh(G.merge([pane, riserTube]), M.clear, group, false);
  clearMesh.name = 'body-clear';
  clearMesh.renderOrder = 3;

  // ================= コードリール（回る） =================
  const rotor = new THREE.Group();
  rotor.position.set(R.cx, R.cy, 0);
  group.add(rotor);
  const rt = [];
  rt.push(G.paint(G.at(G.axisZ(G.cyl(R.flangeR, R.flangeT, 30)), 0, 0, zl.rear0 + R.flangeT / 2), C.sky));
  rt.push(G.paint(G.at(G.axisZ(G.cyl(R.r0 * 0.96, R.w, 20)), 0, 0, zl.windC), C.white));
  // 手前のつば＝ラチェット車。歯面は爪先の軌跡（mech.ratchetProfile）
  const wheelShape = G.polyShape(ratchetProfile(R, RT, 4));
  wheelShape.holes.push(G.circlePath(0, 0, R.axleR + 0.0015));
  const gap = R.spokeW / ((R.spokeIn + R.spokeOut) / 2);
  for (let i = 0; i < R.spokes; i++) {
    const a0 = (i / R.spokes) * TAU + gap / 2, a1 = ((i + 1) / R.spokes) * TAU - gap / 2;
    wheelShape.holes.push(G.sectorPath(R.spokeIn, R.spokeOut, a0, a1));
  }
  rt.push(G.paint(G.at(G.extrude(wheelShape, zl.ratchetT, 0, 8), 0, 0, zl.ratchet0), C.blue));
  // ぜんまいの座と、外端を留めるピン
  rt.push(G.paint(G.at(G.axisZ(G.ring(R.axleR + 0.002, R.spokeIn - 0.002, 0.0012, 24)), 0, 0, zl.ratchet0 + zl.ratchetT + 0.0012), C.yellow));
  const pegLen = SP.width + 0.004;
  rt.push(G.paint(G.at(G.axisZ(G.cyl(0.0032, pegLen, 8)), SP.ro * Math.cos(SP.phase), SP.ro * Math.sin(SP.phase), zl.spring0 + SP.width / 2), C.orange));
  const rotorMesh = mesh(G.merge(rt), M.plastic, rotor, false);
  rotorMesh.name = 'reel';

  // 巻かれたコード（半径 r(Lw) に合わせて XY を拡大）
  const turns = Math.max(1, Math.round(R.w / R.d));
  const prof = [];
  for (let j = 0; j <= turns * 6; j++) {
    const u = j / (turns * 6);
    prof.push([0.9 + 0.1 * Math.abs(Math.sin(Math.PI * u * turns)), (u - 0.5) * R.w]);
  }
  const winding = mesh(G.paint(G.axisZ(G.revolve(prof, 24, 1.2)), C.purple), M.plastic, rotor, false);
  winding.position.z = zl.windC;
  winding.name = 'cord-winding';

  // ぜんまい（描き直す）
  const ribbon = G.springRibbon(SP);
  const springMesh = mesh(ribbon.geometry, M.spring, group, false);
  springMesh.position.set(R.cx, R.cy, zl.spring0 + SP.width / 2);
  springMesh.frustumCulled = false;
  springMesh.name = 'spring';
  let lastPsi = NaN;
  function setSpring(psi) {
    if (Math.abs(psi - lastPsi) < 1e-4) return;
    lastPsi = psi;
    ribbon.update(springTotalAngle(SP, psi), SP.phase);
  }

  // ================= 爪（支点まわりに回る。先は歯、尾は突き棒に押される） =================
  const g0 = pawlRestAngle(R, RT);
  const tip = pawlTip(R, RT, g0, 0, [0, 0]);
  const tx = tip[0] + R.cx - RT.pivot[0], ty = tip[1] + R.cy - RT.pivot[1]; // 支点からの相対
  const tl = Math.hypot(tx, ty), ux = tx / tl, uy = ty / tl, nx = -uy, ny = ux;
  const pw = [];
  const armShape = G.polyShape([[nx * 0.0065, ny * 0.0065], [-nx * 0.0065, -ny * 0.0065], [tx - nx * 0.001 - ux * 0.004, ty - ny * 0.001 - uy * 0.004], [tx, ty], [tx + nx * 0.0045 - ux * 0.006, ty + ny * 0.0045 - uy * 0.006]]);
  pw.push(G.paint(G.extrude(armShape, RT.thick, 0, 4), C.orange));
  pw.push(G.paint(G.at(G.box(RT.tailArm + 0.003, 0.008, RT.thick), (RT.tailArm + 0.003) / 2, 0, RT.thick / 2), C.orange));
  pw.push(G.paint(G.at(G.axisZ(G.cyl(0.009, RT.thick + 0.002, 14)), 0, 0, RT.thick / 2), C.yellow));
  const pawl = mesh(G.merge(pw), M.plastic, group, false);
  pawl.position.set(RT.pivot[0], RT.pivot[1], zl.ratchet0);
  pawl.name = 'pawl';

  // ================= 巻取りボタン（沈む）と突き棒 =================
  const button = new THREE.Group();
  button.position.set(BT.x, B.y1, BT.z);
  group.add(button);
  const bt = [];
  const h = BT.height;
  bt.push(G.paint(G.revolve([[0, -0.004], [BT.radius, -0.004], [BT.radius, h - 0.007], [BT.radius - 0.007, h], [0, h]], 28, 0.9), C.yellow));
  const rodX = RT.pivot[0] + RT.tailArm * 0.86 - BT.x, rodZ = zl.ratchet0 + RT.thick / 2 - BT.z;
  const rodBottom = RT.pivot[1] + 0.004 - B.y1;
  bt.push(G.paint(G.at(G.cyl(BT.rodR, -rodBottom - 0.01, 8), rodX, (rodBottom - 0.01) / 2, rodZ), C.orange));
  const buttonMesh = mesh(G.merge(bt), M.button, button, false);
  buttonMesh.name = 'rewind-button';
  const buttonHit = new THREE.Mesh(own(G.box(0.13, 0.1, 0.13)), hitMat);
  buttonHit.position.y = 0.02;
  buttonHit.userData.control = 'rewindButton';
  buttonHit.userData.enabled = false;
  button.add(buttonHit);

  // ================= 留め金：レバー＋軸＋偏心カム（X 軸まわりに回る） =================
  const lever = new THREE.Group();
  lever.position.set(LT.x, LT.shaftY, LT.shaftZ);
  group.add(lever);
  const lv = [];
  lv.push(G.paint(G.axisX(G.cyl(LT.shaftR, 2 * (LT.armX + 0.022), 10)), C.white));
  lv.push(G.paint(G.at(G.axisX(G.cyl(LT.camR, LT.camLen, 22)), 0, 0, -LT.e), C.red)); // 偏心カム（φ=0 で中心が容器側）
  for (const s of [-1, 1]) lv.push(G.paint(G.at(G.rbox(0.008, 0.012, LT.armZ + 0.012, 0.003, 2), s * LT.armX, 0, LT.armZ / 2), C.orange));
  // 取っ手：左右の棒＋下のにぎり（枠なので、はね上げても下のカムとピンが見える）
  const gripY = 0.006 - LT.paddleH;
  for (const s of [-1, 1]) lv.push(G.paint(G.at(G.rbox(0.012, -gripY + 0.008, LT.paddleT, 0.004, 2), s * LT.armX, gripY / 2 + 0.004, LT.armZ + LT.paddleT / 2), C.yellow));
  lv.push(G.paint(G.at(G.rbox(LT.paddleW, 0.024, LT.paddleT + 0.006, 0.007, 3), 0, gripY + 0.008, LT.armZ + LT.paddleT / 2), C.yellow));
  lv.push(G.paint(G.at(G.rbox(LT.paddleW * 0.5, 0.008, 0.006, 0.003, 2), 0, gripY + 0.008, LT.armZ + LT.paddleT + 0.004), C.orange));
  const leverMesh = mesh(G.merge(lv), M.latch, lever, false);
  leverMesh.name = 'latch-lever';
  const latchHit = new THREE.Mesh(own(G.box(LT.hit[0], LT.hit[1], LT.hit[2])), hitMat);
  latchHit.position.set(0, 0.006 - LT.paddleH / 2, LT.armZ);
  latchHit.userData.control = 'latch';
  latchHit.userData.enabled = false;
  lever.add(latchHit);

  // ヨーク（カムをはさむコの字）とロックピン：Z に e(1−cos φ) だけ動く
  const yk = [];
  const yc = LT.shaftZ - LT.e; // かかっている時のカム中心
  const slotBottom = LT.shaftY - LT.e - LT.camR - 0.001;
  const yokeH = LT.shaftY + LT.camR * 0.6 - slotBottom;
  for (const s of [-1, 1]) yk.push(G.paint(G.at(G.box(LT.camLen + 0.004, yokeH, LT.yokeT), LT.x, slotBottom + yokeH / 2, yc + s * (LT.camR + LT.yokeT / 2)), C.blue));
  yk.push(G.paint(G.at(G.box(LT.camLen + 0.004, LT.yokeT, 2 * LT.camR + 2 * LT.yokeT), LT.x, slotBottom - LT.yokeT / 2 + 0.0005, yc), C.blue));
  const pinFrom = yc - LT.camR - LT.yokeT;
  yk.push(G.paint(G.at(G.axisZ(G.cyl(pinR, pinFrom - LT.pinTip, 10)), LT.x, LT.shaftY, (pinFrom + LT.pinTip) / 2), C.red));
  const pin = mesh(G.merge(yk), M.plastic, group, false);
  pin.name = 'lock-pin';

  // 押し上げ板（ロックが外れると、ばねで容器を持ち上げる）
  const ejector = mesh(G.paint(G.cyl(0.024, 0.03, 16), C.orange), M.plastic, group, false);
  ejector.position.set(BN.dock[0], BN.dock[1] - 0.0155, BN.dock[2]);
  ejector.name = 'ejector';

  return {
    group, rotor, winding, pawl, button, lever, pin, ejector, setSpring,
    hits: { button: buttonHit, latch: latchHit },
    riserPts, // ホース口→容器の吸込み口（紙片の通り道）
    pawlRest: g0,
    buttonTop: V3(BT.x, B.y1 + BT.height, BT.z),
    ejectorY: BN.dock[1] - 0.0155,
  };
}
