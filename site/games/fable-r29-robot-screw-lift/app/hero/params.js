// hero のパラメータ（すべての部品はここから生成する）。単位：m / rad / s。
// 座標：+Y 上、+Z 手前、+X 右。原点は床の上、巨大ねじの軸の真下。
// 値を変えると、歯車の位置・位相・カムの大きさ・腕の長さなどは build 時に解き直される（kinematics.js）。

export const TAU = Math.PI * 2;

export const P = {
  // ---- 巨大ねじ（LeadScrew）
  screw: {
    rOuter: 0.18,       // 外径（半径）
    rRoot: 0.138,       // 谷径（半径）
    lead: 0.08,         // リード [m/回転]
    starts: 1,          // 条数
    yBottom: 0.30,      // ねじ山の下端
    yTop: 3.24,         // ねじ山の上端
    segments: 30,       // 1周の分割
    crest: 0.34,        // 山の頂の幅（ピッチ比）
    root: 0.30,         // 谷底の幅（ピッチ比）。残りが左右の斜面
  },

  // ---- 昇降台（Carriage）
  carriage: {
    width: 1.6, depth: 1.2, thick: 0.08,
    yTopLow: 0.6,       // 上面の最下位置
    travel: 2.0,        // 行程
    nutR: 0.25, nutH: 0.2,      // ナット（台の上のつば）
    bushR: 0.095, bushH: 0.2,   // 案内ブッシュ
    planks: 6,
  },

  // ---- 枠（Frame）と案内柱（GuideColumn）
  frame: {
    baseW: 2.9, baseD: 1.24, baseH: 0.10, baseZ: 0.02, // 土台（中心 z）
    colX: 0.96, colR: 0.055, colTop: 3.36,             // 案内柱 ×2（x = ±colX, z = 0）
    beamW: 2.76, beamH: 0.2, beamD: 0.36, beamY: 3.46, // 上の梁（中心 y）
    mastX: 1.30, mastZ: 0.06,                          // ランプの柱（x = ±mastX）
    plateZ: 0.655, plateT: 0.04,                       // 歯車を支える前面の板（棒組み）
  },

  // ---- 歯車列（GearTrain）：ハンドル → 遊び歯車 ×2 → 小歯車（駆動軸）→ かさ歯車 → ねじ
  gears: {
    module: 0.022,      // 平歯車のモジュール
    zBig: 24,           // ハンドル歯車・遊び歯車の歯数
    zPinion: 12,        // 駆動軸の小歯車の歯数  → 歯車比 i = zBig / zPinion = 2
    face: 0.06,         // 歯幅
    planeZ: 0.73,       // 歯車の面の中心 z
    idler1: { dx: -0.30 },  // ハンドルから見た遊び歯車1の x のずれ（y は中心距離から解く）
    driveY: 0.34,       // 駆動軸の高さ（x = 0、Z 向き）
    bevelZ: 12,         // かさ歯車（マイタ、1:1）の歯数
    bevelR: 0.12,       // かさ歯車のピッチ半径（大端）
    bevelFace: 0.055,   // かさ歯車の歯幅（円すい母線方向）
    spokes: 6,
  },

  // ---- ハンドル（Crank）
  crank: {
    child: { center: [1.15, 1.0, 0.75], radius: 0.42, tube: 0.036, spokes: 5, wheelZ: 0.87, gripLen: 0.17, gripR: 0.05, gripAngle: 1.1 },
    robot: { center: [-1.15, 1.0, 0.75], radius: 0.21, armZ: 0.83, gripLen: 0.15, gripR: 0.034, gripAngle: 0.6 },
  },

  // ---- ラチェット（RatchetWheel / Pawl / Lever）
  ratchet: {
    teeth: 12,          // 歯数 N_r
    rTip: 0.215, rRoot: 0.172,
    z: 0.845, thick: 0.05,
    contactAngle: 1.75,     // 爪の先が歯に当たる位置（車の中心から見た角度、rad。+X から反時計回り）
    pawlLen: 0.27,          // 爪の支点〜先
    pawlTilt: 0.10,         // 爪を接線から外へ傾ける角
    hold: 0.35,             // 手で支えているとき、爪が歯の斜面のどこに居るか（0 = 谷底、1 = 歯先）
    followerAt: 0.5,        // カムが当たる爪の背中の位置（爪の長さ比）
    followerR: 0.022,       // 爪の背中の丸い突起の半径
  },
  lever: {
    pivot: [0.05, 0.71],    // 支点（x, y）
    z: 0.955,               // レバーの腕の面
    knob: [0.45, 0.86],     // 握り玉の位置（上げた状態）
    knobR: 0.078,
    throw: 0.70,            // 可動角（rad、約 40°）
    camEcc: 0.05,           // カムの偏心量
    camLead: 0.38,          // 下げ切ったとき、カム中心が「爪の突起の向き」より手前に残る角（rad）
    freeMargin: 1.25,       // 上げた状態で爪が歯先を越えるための余裕（倍率）
  },

  // ---- ロボット（Robot）
  robot: {
    foot: [-1.66, 0, 1.04],
    yaw: 1.0,               // 体の向き（+Z から +X へ）
    scale: 1.0,
    shoulderY: 0.80, shoulderX: 0.285,
    upperArm: 0.335, foreArm: 0.335,    // a, b（不足するときは build 時に伸ばす）
    armR: 0.05,
    torso: [0.44, 0.40, 0.32], torsoY: 0.64,
    head: [0.50, 0.36, 0.38], headY: 1.07,
  },

  // ---- 宝箱（Treasure）
  treasure: {
    pos: [0, 0.45],         // 台の上の位置（x, z）
    size: [0.5, 0.22, 0.28],// 幅・高さ（箱の部分）・奥行
    lidOpen: 1.25,          // ふたの開き角（後ろのねじに当たらない角）
    toys: 3,
  },

  // ---- 進行
  flow: {
    // 台の高さの割合（child1, robot1, child2, robot2, child3 の終わり）
    marks: [0.25, 0.42, 0.67, 0.84, 1.0],
    robotTime: 3.4,         // ロボットが1区間を回す時間（構えを除く）
    robotPrep: 0.5,         // 回し始める前の構え
    celebrate: 5.0,
    maxStep: 0.6,           // 1フレームの前進の上限 [rad]
    tapTurn: Math.PI / 2,   // タップで自動的に回す量
    lamps: 6,               // 片側のランプの数
  },
};

// 見せ方の色
export const COLORS = {
  glow: 0xffc23a,
  crank: 0xffa51f, crankSpoke: 0xfff4dc, crankGrip: 0xff5a4e,
  lever: 0xf0443c, leverArm: 0xd9dee6,
  chest: 0x9c5bd6, chestTrim: 0xffd24a, chestInside: 0x5b2f86,
  steel: 0xc9d2dc, darkSteel: 0x5a6675, bolt: 0xe9edf2,
  robotWhite: 0xfbf7ef, robotMint: 0x54c8c0, robotDark: 0x2b3a55, robotPink: 0xff8fb0, robotYellow: 0xffd640,
  robotCrank: 0x7fd6cf,
  plate: 0x2f6f9f, copper: 0xff9d6b,
  lampOff: 0x5b5346, lampOn: 0xffe27a,
};
