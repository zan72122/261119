// 動く部品。どれも「剛体1つ = メッシュ1つ」に結合し、Group の位置・回転だけを式で動かす。
import { COLORS as C, ATLAS } from './parts-static.js';

/** 押し板・座席・ラック（ゆりかご座標、圧縮 0 の位置で作る。group.position.x = -圧縮量）。 */
export function buildPlunger(K) {
  const { THREE, G, P, M, keep } = K;
  const { mat, prep, merge, box, cylX } = G;
  const parts = [], tape = [];
  const seg = (n) => Math.max(6, Math.round(n * P.seg));
  const uc = P.uPlateMid0, vA = P.vAxis;
  // 座席（球の後ろ半分を受けるおわん）
  parts.push(prep(new THREE.SphereGeometry(P.R + 0.02, seg(18), seg(6), 0, Math.PI * 2, Math.PI - 1.0, 1.0), { m: mat(P.sMuzzle, vA, 0, 0, 0, -Math.PI / 2), color: C.pink }));
  // 押し板
  parts.push(prep(cylX(P.troughIn - 0.012, P.plateT, P.uPlateFront0 - P.plateT, seg(24)).translate(0, vA, 0), { color: C.steel }));
  parts.push(prep(cylX(P.springMeanR - P.springWire, 0.05, P.uPlateFront0 - P.plateT - 0.05, seg(16)).translate(0, vA, 0), { color: C.steelDark }));
  // 横に出る腕と、ラックへ下りる柱（セクターと同じ z の層を通る）
  parts.push(prep(box(0.08, 0.08, P.zRack0 - 0.26), { m: mat(uc, vA + 0.04, (P.zRack0 + 0.26) / 2), color: C.steelDark }));
  const vLow = P.rackBodyTop - 0.06;
  parts.push(prep(box(0.08, vA + 0.08 - vLow, P.zRack0 - P.zSector0), { m: mat(uc, (vA + 0.08 + vLow) / 2, (P.zRack0 + P.zSector0) / 2), color: C.steelDark }));
  // ラック：下の歯がレバー軸のピニオン（u = 0 の真上）と噛む。圧縮 0 で u = 0 に歯の谷
  const p = P.rackPitch;
  parts.push(prep(G.rack(P.module, P.pressureDeg, -P.rackBack, P.rackFront, P.rP, P.rackBodyTop, P.zRack0, P.zRack1, p / 2 - uc).translate(uc, 0, 0), { color: C.steel }));
  // 力の目盛り：ラックの前面の色の帯。1区画 = 1歯ぶんの移動（rP·dψ）。圧縮 0 で帯の端が矢印（u = 0）に来る
  const v0 = P.rP + 1.2 * P.module + 0.012, v1 = P.rackBodyTop - 0.012;
  for (let i = 0; i < P.nDetent; i++) {
    const c = P.scaleColors[i % P.scaleColors.length];
    tape.push(prep(new THREE.PlaneGeometry(P.scaleStep - 0.008, v1 - v0), { m: mat((i + 0.5) * P.scaleStep, (v0 + v1) / 2, P.zRack1 + 0.004), flat: true, color: c }));
    tape.push(prep(new THREE.CircleGeometry(0.014, 8), { m: mat((i + 0.5) * P.scaleStep, (v0 + v1) / 2, P.zRack1 + 0.006), flat: true, color: 0xffffff }));
  }
  const g = new THREE.Group();
  g.name = 'plunger';
  g.add(new THREE.Mesh(keep(merge(parts)), M.steel), new THREE.Mesh(keep(merge(tape)), M.paint));
  return g;
}

/** レバー＋ピニオン＋ラチェット歯車（同じ軸の1つの剛体。レバーは +x 向きに作り、rotation.z = α）。 */
export function buildLever(K) {
  const { THREE, G, P, M, keep } = K;
  const { mat, prep, merge, box, cylZ, cylX } = G;
  const parts = [];
  const T = G.toothAngles(P.module, P.zPinion, P.pressureDeg);
  // ピニオン：α = α_rest のとき、ラックとの噛み合い点（ゆりかごの 90°）に歯の中心
  parts.push(prep(G.gear(P.module, P.zPinion, P.pressureDeg, P.zRack0, P.zRack1, {
    phase: Math.PI / 2 - P.alphaRest, bore: 0.06, windows: 5, winR0: 0.17, winR1: T.rf - 0.055, winGap: 0.34,
  }), { color: C.steel }));
  // ラチェット：α = α_rest で爪の位置に歯の段
  parts.push(prep(G.ratchet(P.zRatchet, P.ratchetOut, P.ratchetRoot, P.zRatchet0, P.zRatchet1, P.pawlContactDeg * Math.PI / 180 - P.alphaRest, {
    bore: 0.06, windows: 6, winR0: 0.155, winR1: P.ratchetRoot - 0.06, winGap: 0.3,
  }), { color: C.orange }));
  parts.push(prep(cylZ(0.12, P.zLever1 - P.zRack0, P.zRack0, 16), { color: C.steelDark }));
  const zc = (P.zLever0 + P.zLever1) / 2;
  parts.push(prep(box(P.leverLen - 0.05, 0.1, P.zLever1 - P.zLever0), { m: mat((P.leverLen - 0.05) / 2, 0, zc), uvMul: [3, 0.3], color: C.cream }));
  parts.push(prep(cylX(0.075, 0.16, P.leverLen - P.gripR - 0.14, 12).translate(0, 0, zc), { color: C.yellow }));
  const g = new THREE.Group();
  g.name = 'lever';
  g.add(new THREE.Mesh(keep(merge(parts)), M.steel));
  const seg = Math.max(10, Math.round(22 * P.seg));
  const grip = new THREE.Mesh(keep(new THREE.SphereGeometry(P.gripR, seg, Math.round(seg * 0.7))), M.grip);
  grip.position.set(P.leverLen, 0, zc);
  g.add(grip);
  // 当たり判定（握り＋腕の先のほう）と、指さし先
  const hit = new THREE.Group();
  const h1 = new THREE.Mesh(keep(new THREE.SphereGeometry(0.5, 10, 8)), M.hit);
  h1.position.copy(grip.position);
  const h2 = new THREE.Mesh(keep(new THREE.BoxGeometry(0.8, 0.5, 0.5)), M.hit);
  h2.position.set(P.leverLen - 0.6, 0, zc);
  hit.add(h1, h2);
  g.add(hit);
  const anchor = new THREE.Object3D();
  anchor.position.copy(grip.position);
  g.add(anchor);
  return { group: g, grip, hit, anchor, zc };
}

/** 爪（支点を原点、+x が爪先。爪先のピンはヨークの溝に入る）。 */
export function buildPawl(K) {
  const { THREE, G, P, M, keep } = K;
  const { prep, merge, cylZ } = G;
  const l = P.pawlLen;
  const s = new THREE.Shape([
    new THREE.Vector2(-0.05, -0.05), new THREE.Vector2(l - 0.05, -0.032), new THREE.Vector2(l, 0),
    new THREE.Vector2(l - 0.06, 0.036), new THREE.Vector2(-0.05, 0.05),
  ]);
  const parts = [
    prep(G.extrude(s, P.zRatchet0 + 0.005, P.zRatchet1 - 0.005)),
    prep(cylZ(0.06, P.zRatchet1 - P.zRatchet0, P.zRatchet0, 12)),
    prep(cylZ(P.pawlPinR, P.zYoke1 + 0.01 - P.zRatchet0, P.zRatchet0, 8).translate(l - 0.012, 0, 0)),
  ];
  const g = new THREE.Group();
  g.name = 'pawl';
  g.add(new THREE.Mesh(keep(merge(parts)), M.pawl));
  return g;
}

/** 仰角ダイヤル＋軸＋ピニオン（root 座標、rotation.z = φ_d）。 */
export function buildDial(K) {
  const { THREE, G, P, M, keep } = K;
  const { mat, prep, merge, cylZ, rod } = G;
  const dm = P.dialMeshDeg * Math.PI / 180;
  const seg = (n) => Math.max(6, Math.round(n * P.seg));
  const z = P.dialZ;
  const parts = [
    // φ_d = 0（既定の仰角）で、噛み合い点（軸から見て 180°+dm）に歯の谷
    prep(G.gear(P.module, P.zDial, P.pressureDeg, P.zSector0, P.zSector1, { phase: Math.PI + dm + Math.PI / P.zDial }), { color: C.steel }),
    prep(cylZ(0.035, z - P.zSector0 + 0.04, P.zSector0 - 0.02, 10), { color: C.steelDark }),
    prep(new THREE.TorusGeometry(P.dialR, 0.05, seg(10), seg(30)).translate(0, 0, z), { color: C.purple }),
    prep(cylZ(0.1, 0.13, z - 0.065, 14), { color: C.yellow }),
  ];
  for (let i = 0; i < P.dialSpokes; i++) {
    const a = P.dialKnobDeg * Math.PI / 180 + i * 2 * Math.PI / P.dialSpokes;
    parts.push(prep(rod([0.06 * Math.cos(a), 0.06 * Math.sin(a), z], [P.dialR * Math.cos(a), P.dialR * Math.sin(a), z], 0.028, 8), { color: C.white }));
  }
  const ak = P.dialKnobDeg * Math.PI / 180;
  parts.push(prep(new THREE.SphereGeometry(0.1, seg(14), seg(10)), { m: mat(P.dialR * Math.cos(ak), P.dialR * Math.sin(ak), z + 0.08), color: C.yellow }));
  const g = new THREE.Group();
  g.name = 'dial';
  g.position.set(P.dialCenter[0], P.dialCenter[1], 0);
  g.add(new THREE.Mesh(keep(merge(parts)), M.steel));
  return g;
}

/** ヨーク（爪のピンが入る弧の溝。root 座標、position.y = −δ で下がる）と、解放レバー、ボタン。 */
export function buildRelease(K) {
  const { THREE, G, P, M, keep } = K;
  const { mat, prep, merge, box, cylZ } = G;
  const rad = Math.PI / 180;
  const px = P.pivot[0], py = P.pivot[1];
  const [ex, ey] = P.releaseFulcrum;
  const [bx, by, bz] = P.buttonPos;

  // --- ヨーク ---
  const a0 = P.yokeSpanDeg[0] * rad, a1 = P.yokeSpanDeg[1] * rad;
  const yp = [];
  const z0 = P.zYoke0, z1 = P.zYoke1;
  yp.push(prep(G.extrude(G.arcWindow(P.yokeSlotIn - P.yokeBar, P.yokeSlotIn, a0, a1, 10, THREE.Shape), z0, z1).translate(px, py, 0), { color: C.teal }));
  yp.push(prep(G.extrude(G.arcWindow(P.yokeSlotOut, P.yokeSlotOut + P.yokeBar, a0, a1, 10, THREE.Shape), z0, z1).translate(px, py, 0), { color: C.teal }));
  const rMid = (P.yokeSlotIn - P.yokeBar + P.yokeSlotOut + P.yokeBar) / 2, rLen = P.yokeSlotOut + 2 * P.yokeBar - P.yokeSlotIn;
  for (const [a, s] of [[a0, -1], [a1, 1]]) {
    yp.push(prep(box(rLen, 0.04, z1 - z0), { m: mat(px + rMid * Math.cos(a), py + rMid * Math.sin(a), (z0 + z1) / 2, 0, 0, a), color: C.teal }));
    // 案内棒をつかむ耳
    const xe = px + P.yokeSlotIn * Math.cos(a), ye = py + P.yokeSlotIn * Math.sin(a) - 0.02;
    const xg = P.relRodX + s * P.yokeGuideOff;
    yp.push(prep(box(Math.abs(xg - xe) + 0.05, 0.05, z1 - z0), { m: mat((xg + xe) / 2 + s * 0.012, ye, (z0 + z1) / 2), color: C.teal }));
  }
  const yBot = py - P.yokeSlotOut - P.yokeBar;
  yp.push(prep(box(0.045, yBot - ey + 0.03, z1 - z0), { m: mat(P.relRodX, (yBot + ey - 0.03) / 2 + 0.015, (z0 + z1) / 2), color: C.steelDark }));
  yp.push(prep(cylZ(0.022, 0.80 - z0, z0, 8).translate(P.relRodX, ey, 0), { color: C.steelDark }));
  const yoke = new THREE.Group();
  yoke.name = 'yoke';
  yoke.add(new THREE.Mesh(keep(merge(yp)), M.steel));

  // --- 解放レバー（支点を原点。ボタン側の腕 a、ヨーク側の腕 2a）---
  const lp = [];
  lp.push(prep(cylZ(0.035, bz + 0.12 - 0.59, 0.59, 10), { color: C.steelDark }));
  lp.push(prep(box(P.relArmRod + 0.05, 0.05, 0.06), { m: mat(-P.relArmRod / 2, 0, 0.76), color: C.yellow }));
  lp.push(prep(box(P.relArmBtn + 0.05, 0.05, 0.06), { m: mat(-P.relArmBtn / 2, 0, bz), color: C.yellow }));
  const rel = new THREE.Group();
  rel.name = 'releaseLever';
  rel.position.set(ex, ey, 0);
  rel.add(new THREE.Mesh(keep(merge(lp)), M.steel));

  // --- ボタン（かさの下面中心が原点。position.y = by − 押し込み）---
  const seg = Math.max(10, Math.round(22 * P.seg));
  const bp = [];
  const r = P.buttonR;
  bp.push(prep(new THREE.CylinderGeometry(r, r, 0.06, seg), { m: mat(0, 0.03, 0), flat: true, color: C.red }));
  const dome = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg / 3)), 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(0, 0.06, 0);
  {
    // 上から見た平面投影で星の絵を貼る
    const pos = dome.attributes.position, uv = dome.attributes.uv, R = ATLAS.star;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, R[0] + (R[2] - R[0]) * (0.5 + 0.47 * pos.getX(i) / r), R[1] + (R[3] - R[1]) * (0.5 - 0.47 * pos.getZ(i) / r));
    }
    dome.computeVertexNormals();
  }
  bp.push(prep(dome, {}));
  const stemLen = by - (ey + 0.028);
  bp.push(prep(new THREE.CylinderGeometry(0.045, 0.045, stemLen, 10), { m: mat(0, -stemLen / 2, 0), flat: true, color: C.cream }));
  const button = new THREE.Group();
  button.name = 'button';
  button.position.set(bx, by, bz);
  const cap = new THREE.Mesh(keep(merge(bp)), M.button);
  button.add(cap);
  const hit = new THREE.Mesh(keep(new THREE.SphereGeometry(0.46, 10, 8)), M.hit);
  hit.position.set(bx, by + 0.08, bz);
  const anchor = new THREE.Object3D();
  anchor.position.set(bx, by + 0.15, bz);
  return { yoke, rel, button, cap, hit, anchor };
}

/** 送り出しカム（偏心円板。軸が原点、軸の向きは u。rotation.x = 傾き + 2π s）。 */
export function buildCam(K) {
  const { THREE, G, P, M, keep } = K;
  const { prep, merge, cylX, box, mat } = G;
  const parts = [
    prep(cylX(P.camR, 0.07, -0.035, Math.max(10, Math.round(20 * P.seg))).translate(0, P.camE, 0), { flat: true, color: C.orange }),
    prep(cylX(0.024, 0.56, -0.28, 8), { flat: true, color: C.steelDark }),
    prep(cylX(0.075, 0.035, -0.31, 5), { flat: true, color: C.yellow }),     // 五角のつまみ（回るのが見える）
    prep(box(0.035, 0.05, 0.05), { m: mat(-0.325, 0.045, 0), flat: true, color: C.red }),
  ];
  const g = new THREE.Group();
  g.name = 'feedCam';
  g.add(new THREE.Mesh(keep(merge(parts)), M.paint));
  return g;
}
