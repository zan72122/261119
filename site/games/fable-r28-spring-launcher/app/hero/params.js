// ばね発射機のパラメータ（すべての部品はここから生成する）。
// 上の P が「決める値」、derive() が「式で決まる値」。寸法 m、角度は名前に Deg が付くものは度。
// 座標：hero ローカル（= ワールド）は +X が発射方向、+Y が上、+Z がカメラ側。
//       ゆりかご座標 (u, v, z) は仰角の回転軸を原点に、u = 筒の軸（発射方向）、v = 筒に直角で上、z = 同じ。

export function makeParams(opts) {
  const R = opts.ball.radius;
  const L = opts.world.launch;
  const low = opts.tier === 'low';

  const P = {
    R,
    // ---- 仰角の回転軸と発射位置 ----
    pivot: [0.36, 1.13, 0],    // 仰角の回転軸（トラニオン）。レバー・ピニオン・ラチェットも同じ軸
    sMuzzle: 1.12,             // 回転軸から筒に沿って、ばねが伸びきったときの球の中心まで
    vAxis: 0.6,                // 筒の軸は回転軸より上（歯車の上に筒が載る。ばねが歯車に隠れない）
    thetaMinDeg: L.angleMinDeg, thetaMaxDeg: L.angleMaxDeg, thetaDefaultDeg: L.angleDefaultDeg,
    speedMin: L.speedMin, speedMax: L.speedMax,
    tapAngleStepDeg: 7.5,

    // ---- 歯車の共通モジュール ----
    module: 0.06,
    pressureDeg: 20,

    // ---- 引きレバー → ピニオン → ラック → ばね ----
    zPinion: 14,               // レバー軸のピニオン歯数（半径 rP = m z / 2）
    leverLen: 1.5,
    gripR: 0.22,
    leverRestDeg: 25,          // ゆりかご座標でのレバーの向き（休み）。引くと増える
    // ---- ラチェット（歯止め） ----
    zRatchet: 30,              // 全周の歯数。1歯 = 360/30 = 12°
    nDetent: 8,                // 使う段数 N_r（= 力の段階）
    ratchetOut: 0.34, ratchetRoot: 0.28,
    pawlLen: 0.32,
    pawlContactDeg: 230,       // 爪が当たる位置（ゆりかご座標の角度。既定の仰角で真下）
    pawlPivotOut: 0.09,        // 爪の支点が歯先円からどれだけ外か
    pawlPinR: 0.02,
    // ---- 発射ボタン → 解放レバー（てこ比 2）→ ヨーク → 爪 ----
    buttonPos: [0.71, 0.80, 1.0],    // ボタンのかさの下面中心（休み）
    buttonR: 0.30,
    buttonTravel: 0.07,
    releaseFulcrum: [1.06, 0.60],    // 解放レバーの支点 (x, y)
    releaseRatio: 2,                 // ヨーク側の腕 / ボタン側の腕
    yokeSlotIn: 0.255, yokeSlotOut: 0.38, yokeBar: 0.03,
    yokeSpanDeg: [238, 302], yokeGuideOff: 0.30,
    // ---- 主ばね ----
    springWire: 0.065, springMeanR: 0.255, springTurns: 8, springEndTurns: 1,
    uBreech: -0.56,            // ばねの後ろの座（尾栓）の位置
    plateT: 0.08, seatGap: 0.03,
    // ---- ゆりかご（発射筒） ----
    troughIn: R + 0.03, troughWall: 0.035, troughArcDeg: [215, 325], uMuzzleEnd: 1.52,
    // ---- 力の目盛り：ラックの色の帯（1歯 = 1色）と、ゆりかごに固定した矢印 ----
    rackBodyTop: 0.61,         // ラックの上面（ゆりかごの v）
    rackBack: 0.9, rackFront: 0.05,   // ラックの長さ（押し板の腕から後ろ・前）。最大圧縮＋仰角 55° でも台に当たらない
    scaleColors: [0x6fdc8c, 0xa6e86a, 0xdff06a, 0xffe066, 0xffc45a, 0xffa25e, 0xff8a84, 0xff6fa8],
    // ---- 仰角：セクター歯車とダイヤル ----
    zSector: 24, zDial: 9,
    dialMeshDeg: 5,            // 噛み合い点の向き（回転軸から見たワールド角）
    dialR: 0.42, dialZ: 1.38, dialSpokes: 5,
    dialKnobDeg: 35,           // ダイヤルのつまみ（= 指さしの出発点）の向き
    dialHintTurnDeg: 75,       // 指さしの手が回して見せる角度
    sectorMarginDeg: 8,
    // ---- 球の供給（レール＋塔＋送り出しカム） ----
    chuteDeg: 30,              // 横レールの傾き（ゆりかごの u-z 面から）
    ballGap: 0.62,             // 待っている球の間隔（道のり）
    camR: 0.12, camStopMax: 0.10, camFreeAt: 0.28,   // 止めの最大の出、球が自由になる位相（0..1）
    railOff: 0.17, railR: 0.025, funnelR: 0.44,
    // ---- z 方向の層（+Z 側の機構の並び） ----
    zSector0: 0.40, zSector1: 0.46,
    zRack0: 0.47, zRack1: 0.57,
    zRatchet0: 0.59, zRatchet1: 0.66,
    zYoke0: 0.67, zYoke1: 0.71,
    zLever0: 0.74, zLever1: 0.84,
    zPost0: 0.86, zPost1: 0.98,
    // ---- 台座 ----
    deck: { x0: -1.55, x1: 1.65, z0: -1.25, z1: 1.5, top: 0.42, planks: 6, plankT: 0.10 },
    // ---- 時間 ----
    fireTimeMin: 0.10, fireTimeMax: 0.18, reloadTime: 1.12,
    // ---- 細かさ ----
    seg: low ? 0.6 : 1,
  };
  return derive(P);
}

/** 式で決まる値。歯数や半径を変えても全部の連動が保たれる。 */
export function derive(P) {
  const rad = Math.PI / 180;
  const m = P.module;
  P.rP = m * P.zPinion / 2;                       // ピニオンのピッチ円半径
  P.dPsi = 2 * Math.PI / P.zRatchet;              // ラチェット1歯の角度
  P.psiMax = P.nDetent * P.dPsi;                  // レバーの振り幅
  P.xMax = P.rP * P.psiMax;                       // ばねの最大圧縮 = ラックの移動
  P.rackPitch = Math.PI * m;
  P.alphaRest = P.leverRestDeg * rad;
  // 主ばね
  P.uPlateFront0 = P.sMuzzle - P.R - P.seatGap;   // 押し板の前面（圧縮 0）
  P.uPlateMid0 = P.uPlateFront0 - P.plateT / 2;
  P.springL0 = P.uPlateFront0 - P.plateT - P.uBreech;
  P.springLmin = P.springL0 - P.xMax;
  // 目盛り：色の帯の1区画 = 1歯ぶんのラックの移動
  P.scaleStep = P.rP * P.dPsi;
  // 仰角の歯車
  P.rSector = m * P.zSector / 2;
  P.rDial = m * P.zDial / 2;
  P.dialCenterDist = P.rSector + P.rDial;         // 軸間距離 a = m (z1 + z2) / 2
  P.dialRatio = P.zSector / P.zDial;              // ダイヤルの回転 / 仰角の変化
  const dm = P.dialMeshDeg * rad;
  P.dialCenter = [P.pivot[0] + P.dialCenterDist * Math.cos(dm), P.pivot[1] + P.dialCenterDist * Math.sin(dm)];
  // 爪の支点（ゆりかご座標）
  const b = P.pawlContactDeg * rad;
  const eT = [Math.cos(b), Math.sin(b)];
  const tCW = [Math.sin(b), -Math.cos(b)];        // 戻り回転（時計回り）で歯面が進む向き
  const off = Math.sqrt(Math.max(1e-6, P.pawlLen * P.pawlLen - Math.pow(P.pawlPivotOut + (P.ratchetOut - P.ratchetRoot), 2)));
  P.pawlQ = [eT[0] * (P.ratchetOut + P.pawlPivotOut) + tCW[0] * off, eT[1] * (P.ratchetOut + P.pawlPivotOut) + tCW[1] * off];
  P.pawlTipDir = eT;
  // 解放レバー
  P.relArmBtn = P.releaseFulcrum[0] - P.buttonPos[0];
  P.relArmRod = P.relArmBtn * P.releaseRatio;
  P.relRodX = P.releaseFulcrum[0] - P.relArmRod;  // ヨークの棒の x（回転軸の真下になるように決めてある）
  P.yokeMax = P.buttonTravel * P.releaseRatio;
  // 球の供給
  const c = P.chuteDeg * rad;
  P.chuteDir = [Math.sin(c), -Math.cos(c)];       // (v, z)：座席から遠ざかる向き
  P.chuteNrm = [Math.cos(c), Math.sin(c)];        // (v, z)：レールから球の中心への向き
  // 止め（偏心カム）の出 p(s) = camC + camE cos(2πs)。s = camFreeAt で 0、s = 0 で camStopMax
  const cf = Math.cos(2 * Math.PI * P.camFreeAt);
  P.camE = P.camStopMax / (1 - cf);
  P.camC = -P.camE * cf;
  const contactMax = Math.sqrt(Math.max(0, P.R * P.R - Math.pow(P.R - P.camStopMax, 2)));
  P.qA = P.R + 0.38;                              // 止めに当たって待つ球の位置（道のり）
  P.qGate = P.qA - contactMax;                    // 止めの位置
  P.qB = P.qA + P.ballGap;                        // 横レールと塔の角
  P.qC = P.qB + P.ballGap;
  P.qD = P.qC + P.ballGap;
  return P;
}
