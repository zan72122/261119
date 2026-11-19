// 昇降機：枠・案内柱・巨大ねじ・昇降台・歯車列・ハンドル ×2・ラチェット（車・爪・レバー）・ランプ。
// 動く剛体ごとに 1 メッシュ（材質ごと）へ結合。同じ歯車 6 枚とランプは InstancedMesh。
// 姿勢は apply(vis) で、ハンドル角 φ（見た目）・レバー角・爪の位置から式で決める。
import { TAU } from './params.js';

export function createMachine(THREE, kit, ctx) {
  const { P, COLORS, train, rat, mats, shadows, own } = ctx;
  const { M, Builder } = kit;
  const G = P.gears, F = P.frame, S = P.screw, C = P.carriage;
  const group = new THREE.Group();
  group.name = 'machine';
  let casters = 0;
  const mesh = (geom, mat, parent, { cast = false, receive = false } = {}) => {
    const o = new THREE.Mesh(own(geom), mat);
    if (shadows) { o.castShadow = cast; o.receiveShadow = receive; if (cast) casters++; }
    parent.add(o);
    return o;
  };
  const HX = Math.PI / 2; // Y 軸の円柱を Z 軸に倒す
  const mw = { uv: { world: 1.0 } }; // 塗装金属：1 m に 1 回
  const bw = { uv: { world: 1.6 } }; // 真鍮

  // ================= 静止：枠（塗装金属）
  {
    const b = new Builder({ colors: false });
    b.box(F.baseW, F.baseH, F.baseD, M(0, F.baseH / 2, F.baseZ), mw);                         // 土台
    b.box(F.beamW, F.beamH, F.beamD, M(0, F.beamY, 0), mw);                                    // 上の梁
    for (const sx of [-1, 1]) {
      b.cyl(0.125, 0.14, 0.06, 20, M(sx * F.colX, F.baseH + 0.03, 0), mw);                     // 案内柱の座
      b.cyl(0.125, 0.125, 0.05, 20, M(sx * F.colX, F.beamY - F.beamH / 2 - 0.025, 0), mw);
      b.box(0.05, F.colTop - F.baseH, 0.03, M(sx * F.mastX, (F.colTop + F.baseH) / 2, F.mastZ), mw); // ランプの柱
      b.box(0.16, 0.05, 0.12, M(sx * F.mastX, F.baseH + 0.025, F.mastZ), mw);
    }
    b.box(0.32, 0.05, 0.32, M(0, F.baseH + 0.025, 0), mw);                                     // ねじの下の受け
    b.cyl(0.14, 0.14, 0.10, 20, M(0, F.beamY - F.beamH / 2 - 0.05, 0), mw);                    // ねじの上の軸受け
    // 駆動軸の軸受け台
    b.box(0.2, G.driveY - F.baseH, 0.1, M(0, (G.driveY + F.baseH) / 2, 0.38), mw);
    b.cyl(0.075, 0.075, 0.11, 16, M(0, G.driveY, 0.38, HX), mw);
    // 前面の板（棒組み）：歯車の中心どうしを結ぶ。位置は歯車列の解から
    const { R, L, D } = train.layout;
    const zc = F.plateZ, th = F.plateT;
    for (const s of [R, L]) {
      kit.bar(b, s.C, s.I1, 0.15, th, zc, mw);
      kit.bar(b, s.I1, s.I2, 0.15, th, zc, mw);
      kit.bar(b, s.I2, D, 0.15, th, zc, mw);
      kit.bar(b, s.C, [s.C[0], 0.03], 0.13, th, zc, mw, false);
      kit.bar(b, s.I1, [s.I1[0], 0.03], 0.11, th, zc, mw, false);
      b.cyl(0.08, 0.08, 0.1, 16, M(s.C[0], s.C[1], zc - 0.05, HX), mw);                        // ハンドル軸の軸受け
    }
    kit.bar(b, [-(Math.abs(R.C[0]) + 0.16), 0.06], [Math.abs(R.C[0]) + 0.16, 0.06], 0.12, th, zc, mw, false); // 下の横木
    kit.bar(b, D, rat.leverPivot, 0.12, th, zc, mw);
    kit.bar(b, rat.leverPivot, rat.pivot, 0.09, th, zc, mw);
    mesh(b.build(), mats.metal, group, { cast: true, receive: true });
  }

  // ================= 静止：鋼（案内柱・ピン・ボルト）
  const lampY = [];
  for (let k = 0; k < P.flow.lamps; k++) lampY.push(C.yTopLow + (C.travel * (k + 1)) / P.flow.lamps);
  {
    const b = new Builder();
    b.color(COLORS.steel);
    for (const sx of [-1, 1]) b.cyl(F.colR, F.colR, F.colTop - F.baseH, 20, M(sx * F.colX, (F.colTop + F.baseH) / 2, 0), { open: true });
    // 遊び歯車の軸とナット
    const zp = F.plateZ + F.plateT / 2;
    for (const n of ['idlerR1', 'idlerR2', 'idlerL1', 'idlerL2']) {
      const c = train.gears[n].c;
      b.color(COLORS.steel).cyl(0.022, 0.022, 0.11, 10, M(c[0], c[1], zp + 0.055, HX));
      b.color(COLORS.bolt).cyl(0.042, 0.042, 0.026, 6, M(c[0], c[1], G.planeZ + G.face / 2 + 0.018, HX));
    }
    // 爪の支点ピン、レバーの支点ピン
    b.color(COLORS.steel).cyl(0.016, 0.016, 0.22, 10, M(rat.pivot[0], rat.pivot[1], zp + 0.11, HX));
    b.color(COLORS.bolt).cyl(0.03, 0.03, 0.016, 6, M(rat.pivot[0], rat.pivot[1], P.ratchet.z + P.ratchet.thick / 2 + 0.012, HX));
    b.color(COLORS.steel).cyl(0.02, 0.02, 0.33, 10, M(rat.leverPivot[0], rat.leverPivot[1], zp + 0.165, HX));
    b.color(COLORS.bolt).cyl(0.034, 0.034, 0.018, 6, M(rat.leverPivot[0], rat.leverPivot[1], P.lever.z + 0.045, HX));
    // ボルト：土台の上、梁の前面
    b.color(COLORS.bolt);
    for (const sx of [-1, 1]) {
      for (const z of [-0.5, 0.52]) for (const x of [1.3, 0.75]) b.cyl(0.034, 0.034, 0.03, 6, M(sx * x, F.baseH + 0.012, z));
      for (const x of [0.25, 0.7, 1.15]) b.cyl(0.03, 0.03, 0.03, 6, M(sx * x, F.beamY + 0.06, F.beamD / 2 + 0.008, HX));
    }
    mesh(b.build(), mats.steel, group, { cast: true, receive: true });
  }

  // ================= 静止：塗装（しま模様・ランプの台）
  {
    const b = new Builder();
    const st = ctx.atlas.rect('stripes');
    const half = [st[0], st[1], st[2], (st[1] + st[3]) / 2];
    const n = 12, w = (F.beamW - 0.06) / n;
    for (let i = 0; i < n; i++) b.add(new THREE.PlaneGeometry(w, w * 0.5), M(-F.beamW / 2 + 0.03 + w * (i + 0.5), F.beamY - F.beamH / 2 + w * 0.25 + 0.012, F.beamD / 2 + 0.003), { uv: { rect: half } });
    b.color(COLORS.darkSteel);
    for (const sx of [-1, 1]) for (const y of lampY) b.cyl(0.07, 0.07, 0.024, 14, M(sx * F.mastX, y, F.mastZ + 0.022, HX));
    mesh(b.build(), mats.paint, group);
  }

  // ================= ランプ（台が通り過ぎると点く。InstancedMesh）
  const lampGeom = own(new THREE.SphereGeometry(0.056, 12, 6, 0, TAU, 0, Math.PI / 2));
  lampGeom.rotateX(HX);
  lampGeom.scale(1, 1, 0.7);
  const lamps = new THREE.InstancedMesh(lampGeom, mats.lamp, lampY.length * 2);
  {
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (const sx of [-1, 1]) for (const y of lampY) lamps.setMatrixAt(i++, m4.makeTranslation(sx * F.mastX, y, F.mastZ + 0.034));
    lamps.instanceMatrix.needsUpdate = true;
    lamps.computeBoundingSphere();
  }
  group.add(lamps);
  const lampOff = new THREE.Color(COLORS.lampOff), lampOn = new THREE.Color(COLORS.lampOn), lampTmp = new THREE.Color();
  const lampState = new Float32Array(lampY.length * 2).fill(-1);
  function setLamp(i, v, hue) { // v: 0 消灯〜1 点灯。hue を渡すとその色（お祝い）
    const key = hue === undefined ? v : 2 + hue + v;
    if (lampState[i] === key) return;
    lampState[i] = key;
    if (hue === undefined) lampTmp.copy(lampOff).lerp(lampOn, v); else lampTmp.setHSL(hue, 0.95, 0.45 + 0.2 * v);
    lamps.setColorAt(i, lampTmp);
    lamps.instanceColor.needsUpdate = true;
  }
  for (let i = 0; i < lampY.length * 2; i++) setLamp(i, 0);

  // ================= 巨大ねじ（Y 軸で回る）＋ かさ歯車
  const screw = new THREE.Group();
  group.add(screw);
  {
    const b = new Builder();
    kit.thread(b, { rOuter: S.rOuter, rRoot: S.rRoot, lead: S.lead * S.starts, y0: S.yBottom, y1: S.yTop, seg: S.segments, crest: S.crest, root: S.root, hand: train.hand });
    b.cyl(S.rOuter + 0.014, S.rOuter + 0.014, 0.07, 24, M(0, S.yBottom + 0.01, 0), bw);         // ねじ山の端を隠すつば
    b.cyl(S.rOuter + 0.014, S.rOuter + 0.014, 0.07, 24, M(0, S.yTop - 0.01, 0), bw);
    b.cyl(0.065, 0.065, 0.2, 16, M(0, S.yBottom - 0.09, 0), bw);                               // 下の軸
    b.cyl(0.065, 0.065, 0.2, 16, M(0, S.yTop + 0.09, 0), bw);                                  // 上の軸
    // かさ歯車：局所 Z → +Y、局所 Y → −Z（歯 0 は +X）。頂点は 2 軸の交点
    const bm = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)).setPosition(0, G.driveY, 0);
    const sub = new Builder();
    kit.bevelGear(sub, { z: G.bevelZ, r: G.bevelR, face: G.bevelFace, backThick: 0.028, hubR: 0.09, hubLen: 0.02, boreR: 0.06 });
    b.add(sub.build(), bm, { uv: 'keep' });
    mesh(b.build(), mats.brass, screw);
  }
  // ねじの影は、同じ太さのただの円柱に落とさせる（影パスでねじ山 9 千三角形を描き直さない。色も深度も書かない）
  if (shadows) {
    const o = mesh(new THREE.CylinderGeometry(S.rOuter * 0.95, S.rOuter * 0.95, S.yTop - S.yBottom, 10, 1, true), mats.shadowOnly, group, { cast: true });
    o.position.set(0, (S.yTop + S.yBottom) / 2, 0);
  }

  // ================= 駆動軸（Z 軸で回る）：かさ歯車・小歯車・ラチェット車
  const drive = new THREE.Group();
  drive.position.set(0, G.driveY, 0);
  group.add(drive);
  {
    const b = new Builder();
    const zEnd = P.ratchet.z + P.ratchet.thick / 2 + 0.03;
    b.color(0xffffff).cyl(0.028, 0.028, zEnd - 0.17, 12, M(0, 0, (zEnd + 0.17) / 2, HX), bw);
    // かさ歯車：局所 Z → −Z（X まわりに π）。体は +Z 側、歯は頂点（原点）を向く
    const sub = new Builder();
    kit.bevelGear(sub, { z: G.bevelZ, r: G.bevelR, face: G.bevelFace, backThick: 0.028, hubR: 0.06, hubLen: 0.05, boreR: 0.02 });
    b.add(sub.build(), M(0, 0, 0, Math.PI, 0, 0), { uv: 'keep' });
    // 小歯車
    const pg = new Builder();
    kit.spurGear(pg, { z: G.zPinion, m: G.module, face: G.face * 1.15, boreR: 0.02 });
    b.add(pg.build(), M(0, 0, G.planeZ), { uv: 'keep' });
    b.cyl(0.07, 0.07, 0.03, 16, M(0, 0, G.planeZ + G.face * 0.6 + 0.012, HX), bw);
    // ラチェット車（銅色）：形は爪の計算と同じ関数 wheelRadius から
    b.color(COLORS.copper);
    const Rt = P.ratchet;
    const outline = kit.ratchetOutline(Rt.teeth, rat.alphaRef, rat.s, rat.wheelRadius, Rt.rRoot, Rt.rTip, 3);
    kit.polarPrism(b, outline, 0.03, Rt.z - Rt.thick / 2, Rt.z + Rt.thick / 2, 1.6);
    b.color(0xffffff).cyl(0.075, 0.075, Rt.thick + 0.03, 16, M(0, 0, Rt.z, HX), bw);
    b.cyl(0.04, 0.04, 0.02, 6, M(0, 0, zEnd, HX), bw);
    mesh(b.build(), mats.brass, drive);
  }

  // ================= 歯車 6 枚（ハンドル歯車 ×2、遊び歯車 ×4）：同じ形なので InstancedMesh
  const bigNames = ['crankR', 'idlerR1', 'idlerR2', 'idlerL2', 'idlerL1', 'crankL'];
  let bigGears;
  {
    const b = new Builder();
    kit.spurGear(b, { z: G.zBig, m: G.module, face: G.face, spokes: G.spokes, hubR: 0.062 });
    bigGears = new THREE.InstancedMesh(own(b.build()), mats.brass, bigNames.length);
    group.add(bigGears);
  }
  const gm = new THREE.Matrix4();
  function placeGears(phi) {
    for (let i = 0; i < bigNames.length; i++) {
      const g = train.gears[bigNames[i]];
      gm.makeRotationZ(g.k * phi + g.c0).setPosition(g.c[0], g.c[1], g.c[2]);
      bigGears.setMatrixAt(i, gm);
    }
    bigGears.instanceMatrix.needsUpdate = true;
  }
  placeGears(0);
  bigGears.computeBoundingSphere();

  // ================= 子どものハンドル（大きな輪。光る操作部）
  const cc = P.crank.child;
  const crank = new THREE.Group();
  crank.position.set(cc.center[0], cc.center[1], 0);
  group.add(crank);
  {
    const b = new Builder();
    const z = cc.wheelZ;
    b.color(COLORS.steel).cyl(0.03, 0.03, z - 0.6, 10, M(0, 0, (z + 0.6) / 2, HX));
    b.color(COLORS.crank).torus(cc.radius, cc.tube, 10, 44, M(0, 0, z));
    b.color(COLORS.crankSpoke);
    for (let i = 0; i < cc.spokes; i++) {
      const a = cc.gripAngle + (i * TAU) / cc.spokes;
      const len = cc.radius - 0.07;
      b.cyl(0.021, 0.026, len, 8, M(Math.cos(a) * (0.08 + len / 2), Math.sin(a) * (0.08 + len / 2), z, 0, 0, a - HX), { open: true });
    }
    b.cyl(0.105, 0.115, 0.07, 24, M(0, 0, z + 0.005, HX));
    b.decal(ctx.atlas.rect('arrow'), 0.17, 0.17, M(0, 0, z + 0.0405));                          // くるっと矢印（回す向き）
    // 握り
    const gx = Math.cos(cc.gripAngle) * cc.radius, gy = Math.sin(cc.gripAngle) * cc.radius;
    b.color(COLORS.crank).cyl(0.062, 0.062, 0.03, 16, M(gx, gy, z + cc.tube + 0.005, HX));
    b.color(COLORS.crankGrip).capsule(cc.gripR, cc.gripLen - cc.gripR, 4, 14, M(gx, gy, z + cc.tube + cc.gripLen / 2, HX));
    mesh(b.build(), mats.crank, crank, { cast: true });
  }
  const crankProxy = new THREE.Mesh(own(new THREE.CylinderGeometry(cc.radius + 0.2, cc.radius + 0.2, 0.5, 14)), mats.proxy);
  crankProxy.rotation.x = HX;
  crankProxy.position.set(cc.center[0], cc.center[1], cc.wheelZ);
  crankProxy.visible = false;
  group.add(crankProxy);

  // ================= ロボットのハンドル（腕と握り）
  const rc = P.crank.robot;
  const robotCrank = new THREE.Group();
  robotCrank.position.set(rc.center[0], rc.center[1], 0);
  group.add(robotCrank);
  const rgx = Math.cos(rc.gripAngle) * rc.radius, rgy = Math.sin(rc.gripAngle) * rc.radius;
  const rgz = rc.armZ + 0.02 + rc.gripLen / 2;
  {
    const b = new Builder();
    b.color(COLORS.steel).cyl(0.03, 0.03, rc.armZ + 0.03 - 0.6, 10, M(0, 0, (rc.armZ + 0.03 + 0.6) / 2, HX));
    b.color(COLORS.robotCrank);
    kit.bar(b, [0, 0], [rgx, rgy], 0.08, 0.036, rc.armZ);
    b.cyl(0.085, 0.085, 0.036, 16, M(-rgx * 0.38, -rgy * 0.38, rc.armZ, HX));                   // つり合いおもり
    b.box(rc.radius * 0.4, 0.07, 0.036, M(-rgx * 0.19, -rgy * 0.19, rc.armZ, 0, 0, rc.gripAngle));
    b.color(COLORS.robotDark).cyl(rc.gripR, rc.gripR, rc.gripLen, 12, M(rgx, rgy, rgz, HX));
    b.color(COLORS.robotYellow).cyl(rc.gripR + 0.012, rc.gripR + 0.012, 0.02, 12, M(rgx, rgy, rgz + rc.gripLen / 2, HX));
    mesh(b.build(), mats.paint, robotCrank);
  }

  // ================= 昇降台（上面が y = platform.position.y）
  const platform = new THREE.Group();
  group.add(platform);
  {
    const b = new Builder({ colors: false });
    b.box(C.width, C.thick, C.depth, M(0, -C.thick / 2, 0), { uv: { world: 1 / C.width } });
    mesh(b.build(), mats.wood, platform, { cast: true, receive: true });
    const s = new Builder();
    s.color(COLORS.plate);
    for (const sz of [-1, 1]) s.box(C.width + 0.06, C.thick + 0.03, 0.03, M(0, -C.thick / 2 - 0.005, sz * (C.depth / 2 + 0.015)));
    for (const sx of [-1, 1]) s.box(0.03, C.thick + 0.03, C.depth, M(sx * (C.width / 2 + 0.015), -C.thick / 2 - 0.005, 0));
    s.color(COLORS.darkSteel);
    for (const sz of [-1, 1]) s.box(C.width, 0.06, 0.08, M(0, -C.thick - 0.03, sz * 0.45));        // 下の梁
    for (const sx of [-1, 1]) {
      s.color(COLORS.plate).box(F.colX + 0.14 - C.width / 2, C.thick, 0.28, M(sx * (C.width / 2 + (F.colX + 0.14 - C.width / 2) / 2), -C.thick / 2, 0)); // 柱を抱く耳
      s.color(0xf0c04a).cyl(C.bushR, C.bushR, C.bushH, 18, M(sx * F.colX, -C.thick / 2, 0));       // 案内ブッシュ
      s.color(COLORS.crankGrip).box(F.mastX - F.colX - 0.14, 0.03, 0.05, M(sx * (F.colX + 0.1 + (F.mastX - F.colX - 0.14) / 2), -0.02, F.mastZ)); // ランプを指す針
    }
    s.color(0xf0c04a).cyl(C.nutR + 0.05, C.nutR + 0.05, 0.03, 24, M(0, 0.015, 0));                // ナットのつば
    s.cyl(C.nutR, C.nutR, C.nutH, 6, M(0, C.nutH / 2 + 0.02, 0));                                  // 六角ナット
    s.cyl(S.rOuter + 0.03, S.rOuter + 0.03, 0.03, 20, M(0, C.nutH + 0.03, 0));
    mesh(s.build(), mats.steel, platform, { cast: true, receive: true });
  }

  // ================= 爪（支点で回る）
  const Rt = P.ratchet;
  const pawl = new THREE.Group();
  pawl.position.set(rat.pivot[0], rat.pivot[1], 0);
  group.add(pawl);
  {
    const b = new Builder();
    const o = rat.outSide, L = Rt.pawlLen, h = rat.halfT;
    // 局所：支点が原点、先が (L, 0)。背中は o·y 側
    const shape = [[-0.035, 0.03 * o], [L * 0.45, (h + 0.004) * o], [L - 0.03, h * o], [L, 0], [L - 0.07, -0.016 * o], [0.02, -0.032 * o], [-0.035, -0.03 * o]];
    b.color(COLORS.steel).add(kit.extrude(shape, Rt.thick * 0.9, 0), M(0, 0, Rt.z));
    b.cyl(0.04, 0.04, Rt.thick * 1.05, 14, M(0, 0, Rt.z, HX));
    b.color(COLORS.robotYellow).cyl(Rt.followerR, Rt.followerR, Rt.thick * 1.0, 12, M(rat.fl, rat.fw * o, Rt.z, HX)); // カムが当たる突起
    mesh(b.build(), mats.steel, pawl);
  }

  // ================= レバー（握り玉・腕・偏心カム。光る操作部）
  const Lv = P.lever;
  const lever = new THREE.Group();
  lever.position.set(rat.leverPivot[0], rat.leverPivot[1], 0);
  group.add(lever);
  {
    const b = new Builder();
    const ca = Math.cos(rat.lam0), sa = Math.sin(rat.lam0);
    b.color(COLORS.leverArm).cyl(0.042, 0.042, Lv.z + 0.03 - (Rt.z - Rt.thick / 2), 14, M(0, 0, (Lv.z + 0.03 + Rt.z - Rt.thick / 2) / 2, HX));
    // 偏心カム（上げた状態の位置で作る）
    const k0 = rat.camAngle(0), e = rat.ecc();
    b.color(COLORS.robotYellow).cyl(rat.camR(), rat.camR(), Rt.thick * 0.9, 28, M(e * Math.cos(k0), e * Math.sin(k0), Rt.z, HX));
    // 腕と握り玉
    b.color(COLORS.leverArm);
    kit.bar(b, [0, 0], [rat.armLen * ca, rat.armLen * sa], 0.052, 0.034, Lv.z, undefined, false);
    b.color(COLORS.lever).sphere(Lv.knobR, 18, 12, M(rat.armLen * ca, rat.armLen * sa, Lv.z));
    b.cyl(0.04, 0.04, 0.05, 12, M((rat.armLen - Lv.knobR - 0.01) * ca, (rat.armLen - Lv.knobR - 0.01) * sa, Lv.z, 0, 0, rat.lam0 - HX));
    mesh(b.build(), mats.lever, lever);
  }
  // レバーの当たり：握り玉の動く範囲を覆う箱
  const knobUp = [rat.leverPivot[0] + rat.armLen * Math.cos(rat.leverAngle(0)), rat.leverPivot[1] + rat.armLen * Math.sin(rat.leverAngle(0))];
  const knobDn = [rat.leverPivot[0] + rat.armLen * Math.cos(rat.leverAngle(Lv.throw)), rat.leverPivot[1] + rat.armLen * Math.sin(rat.leverAngle(Lv.throw))];
  const leverProxy = new THREE.Mesh(own(new THREE.BoxGeometry(0.55, Math.abs(knobUp[1] - knobDn[1]) + 0.45, 0.4)), mats.proxy);
  leverProxy.position.set((knobUp[0] + knobDn[0]) / 2 - 0.03, (knobUp[1] + knobDn[1]) / 2, Lv.z);
  leverProxy.visible = false;
  group.add(leverProxy);

  // ================= 姿勢
  const gPin = train.gears.pinion, gScrew = train.gears.bevelScrew, gCR = train.gears.crankR, gCL = train.gears.crankL;
  const state = { phi: 0, height: C.yTopLow, lit: 0 };
  // vis: { phi 見た目のハンドル角, lever レバー角, u 爪が歯の斜面のどこに居るか }
  function apply(vis) {
    const phi = vis.phi;
    state.phi = phi;
    placeGears(phi);
    crank.rotation.z = gCR.k * phi + gCR.c0;
    robotCrank.rotation.z = gCL.k * phi + gCL.c0;
    drive.rotation.z = gPin.k * phi + gPin.c0;
    screw.rotation.y = gScrew.k * phi + gScrew.c0;
    state.height = C.yTopLow + train.risePerRad * phi;               // 送り：台の高さ = y0 + (リード/2π)·ねじ角
    platform.position.y = state.height;
    pawl.rotation.z = rat.pawlAngle(vis.u);
    lever.rotation.z = rat.sgnL * vis.lever;
  }
  // ランプ：台の上面が通り過ぎたら点く。party > 0 のときは虹色で流れる
  function updateLamps(time, party) {
    const n = lampY.length;
    let lit = 0;
    for (let k = 0; k < n; k++) {
      const on = state.height >= lampY[k] - 0.012;
      if (on) lit++;
      for (let sgn = 0; sgn < 2; sgn++) {
        if (party > 0) setLamp(sgn * n + k, 1, (((k / n + time * 0.9 + sgn * 0.5) % 1) * 12 | 0) / 12);
        else setLamp(sgn * n + k, on ? 1 : 0);
      }
    }
    const changed = lit - state.lit;
    state.lit = lit;
    return changed; // 新しく点いた数（音を鳴らすのに使う）
  }
  const gripOut = { x: 0, y: 0, z: rgz };
  function robotGrip(out) { // ロボットのハンドルの握りの位置（root 座標）
    const a = robotCrank.rotation.z + rc.gripAngle;
    out.set(rc.center[0] + rc.radius * Math.cos(a), rc.center[1] + rc.radius * Math.sin(a), rgz);
    return out;
  }
  function leverKnob(out, th) {
    const a = rat.leverAngle(th);
    out.set(rat.leverPivot[0] + rat.armLen * Math.cos(a), rat.leverPivot[1] + rat.armLen * Math.sin(a), Lv.z);
    return out;
  }
  apply({ phi: 0, lever: 0, u: 0 });

  return {
    group, platform, crankProxy, leverProxy, apply, updateLamps, robotGrip, leverKnob, state, lampY,
    crankCenter: new THREE.Vector3(cc.center[0], cc.center[1], cc.wheelZ),
    gripOut,
    get casters() { return casters; },
  };
}
