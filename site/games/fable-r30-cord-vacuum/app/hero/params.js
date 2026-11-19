// すべての寸法・歯数・角度・速さのパラメータ。部品はここから生成し、連動は mech.js の式で保つ。
// 単位は m・秒・ラジアン。座標はワールド（Y 上、床 y=0、カメラは +Z 側）。
// 変えてよい：値を変えると形と動きの両方が追従する（歯形・てこ・カム・ギヤの位相は式から求め直す）。

export const STAGES = ['pull', 'rewind', 'suck', 'unlock', 'dump', 'finale'];

export function makeParams(layout) {
  const A = layout;
  const bx = A.bodyCenter[0], bz = A.bodyCenter[2];

  // ---- 本体（キャニスター）：XY の輪郭を Z に押し出す ----
  const body = {
    x0: bx - 0.21, x1: bx + 0.21, // 長手 0.42
    y0: 0.035, y1: 0.255, // 床からの高さ
    zBack: bz - 0.135, zFront: bz + 0.135, // 奥行 0.27
    rTop: 0.04, rBottom: 0.045, // 輪郭の角の丸み
    bevel: 0.012, frontBevel: 0.005,
    bayDepth: 0.062, // リール室（前面の窓の奥行。浅いほど上の壁に隠れにくい）
    wheelR: 0.042, wheelW: 0.022, wheelX: bx - 0.15,
    casterR: 0.0175,
  };
  body.zBay = body.zFront - body.bayDepth;
  // リール室の窓（XY の角丸長方形）
  const bay = { x0: body.x1 - 0.188, x1: body.x1 - 0.012, y0: 0.05, y1: 0.243, r: 0.028 };

  // ---- コードリール（軸は Z）。HERO-SPEC §6 の式：r(Lw)=√(r0²+Lw·d²/w)、θ(L)=(2w/d²)(r(Lmax)−r(Lmax−L)) ----
  const reel = {
    cx: body.x1 - 0.102, cy: 0.135, // 軸の位置
    r0: 0.02, // 芯の半径
    w: 0.016, // 巻き幅
    d: 0.008, // コードの太さ（子どもに見えるよう太め）
    flangeR: 0.064, // 奥のつば
    flangeT: 0.004,
    spokes: 4, spokeIn: 0.034, spokeOut: 0.058, spokeW: 0.014, // 手前のつばの窓（巻いたコードが見える）
    axleR: 0.007,
  };
  // リール室の中の Z の並び（奥→手前）
  const zl = {};
  zl.panel = body.zBay + 0.002;
  zl.rear0 = body.zBay + 0.007; // 奥のつば
  zl.wind0 = zl.rear0 + reel.flangeT; // 巻き始め
  zl.wind1 = zl.wind0 + reel.w;
  zl.windC = (zl.wind0 + zl.wind1) / 2; // コードの面
  zl.ratchet0 = zl.wind1; // 手前のつば＝ラチェット車
  zl.ratchetT = 0.007;
  zl.spring0 = zl.ratchet0 + zl.ratchetT + 0.002; // ぜんまい
  zl.pane = body.zFront - 0.008; // 透明な窓
  reel.z = zl;

  // ---- ラチェットと爪（爪の角 = swing·frac(θ·Z/2π)。歯面は爪先の軌跡から生成する） ----
  const ratchet = {
    Z: 12, // 歯数
    swing: 0.25, // 爪の振れ（rad）
    rRoot: 0.067, // 歯底の半径
    pivot: [reel.cx + 0.034, reel.cy + 0.091], // 爪の支点（XY）
    tipArm: 0.046, // 支点→爪先
    tailArm: 0.023, // 支点→押される側（てこ比 tipArm/tailArm = 2.0）
    thick: 0.007,
  };

  // ---- ぜんまい（アルキメデス螺旋 r(φ)=ri+(ro−ri)·φ/(2π(n0+ψ/2π))、締め角 ψ=θ） ----
  const spring = { n0: 4, ri: 0.008, ro: 0.03, width: 0.01, thick: 0.0013, segments: 168, phase: 0.6 };

  // ---- コードとプラグ ----
  const plugRest = [A.plugRest[0], 0.024, A.plugRest[2]];
  const cord = {
    exit: [body.x1 + 0.004, 0.08, zl.windC], // 本体から出る穴（リールの面と同じ Z）
    radius: reel.d / 2,
    segments: 48, sides: 6, inside: 3, // 節数・断面・本体内の節
    reach: 0.72, // 穴からプラグまでの最大距離（引ける範囲のどの辺でも伸びきる長さ）
    areaMin: [A.plugPullArea.min[0], A.plugPullArea.min[2]],
    areaMax: [A.plugPullArea.max[0] + 0.05, A.plugPullArea.max[2]],
    follow: 20, // 指への追従（1/s）
    hintDir: [0.68, 0.733], // ヒントの引く向き（XZ）
  };
  const plug = { len: 0.066, h: 0.038, w: 0.046, prongLen: 0.022, prongW: 0.007, prongGap: 0.019, // おもちゃらしく大きめ
    y: plugRest[1], rest: plugRest, hit: 0.14 };
  // 収納時の長さと、リールから出せる長さ Lmax
  cord.rest = Math.hypot(plugRest[0] - cord.exit[0], plugRest[1] - cord.exit[1], plugRest[2] - cord.exit[2]);
  reel.Lmax = cord.reach - cord.rest;

  // ---- 巻取りボタン（押し込み b → 突き棒 → 爪の尾。爪先の持ち上げ ≈ 2.0·b） ----
  const button = {
    x: ratchet.pivot[0] - 0.002, z: zl.ratchet0 + ratchet.thick / 2 - 0.0225, // 上面の中心
    radius: 0.045, height: 0.02, stroke: 0.012,
    rodR: 0.004,
    press: 26, // 押し込みの速さ（1/s）
  };
  const rewind = { vmax: 0.9, slow: 0.08, floor: 0.22, done: 0.003 }; // dL/dt = −vmax·(0.35+0.65·L/Lmax)·max(smoothstep(0,slow,L), floor)

  // ---- 集じん容器と受け台 ----
  const bin = {
    dock: [A.binDock[0], body.y1 + 0.015, A.binDock[2]], // 容器の底の中心（受け台の上）
    radius: 0.06, height: 0.14,
    collarR: 0.064, collarH: 0.03,
    capH: 0.022, handleR: 0.03,
    inletY: 0.095, // 吸込み口の高さ（容器の底から）
    lift: 0.02, // ロック解除で浮く量
    flapMaxTilt: 1.25, // 空けるときの傾き α の最大
    flapStart: 0.6, flapGain: 1.6, flapMax: 1.6, // 底ぶた角 = clamp((α−0.6)·1.6, 0, 1.6)
    hit: [0.17, 0.2, 0.17],
    follow: 14,
  };

  // ---- 留め金：レバー → 偏心カム → スコッチヨーク → ロックピン。ピン変位 x = e(1−cos φ) ----
  const latch = {
    x: bin.dock[0],
    shaftY: bin.dock[1] + 0.019, shaftZ: body.zFront - 0.019,
    e: 0.012, // 偏心量
    phiMax: Math.PI / 2, // レバーの振れ
    releaseAt: 0.8, // x ≥ 0.8·e で解除
    camR: 0.017, shaftR: 0.004, yokeT: 0.004,
    camLen: 0.03, armX: 0.036, armZ: 0.034, paddleW: 0.094, paddleH: 0.072, paddleT: 0.014, // 取っ手は枠（開いても下の機構が見える）
    turnTime: 0.5,
    hit: [0.13, 0.12, 0.11],
  };
  latch.pinTip = bin.dock[2] + bin.collarR + 0.005 - 0.01; // かかっている時のピン先（つばの穴の中）

  // ---- ホース口と立ち上がり管（透明）：ホース → 口 → 立ち上がり → 容器の吸込み口 ----
  const riser = {
    radius: 0.021,
    x: body.x0 - 0.028, y: A.hosePort[1], z: A.hosePort[2],
    topY: bin.dock[1] + bin.inletY,
    endX: bin.dock[0] - bin.radius - 0.002,
    bend: 0.02,
  };
  riser.hoseEnd = [riser.x - 0.027, riser.y, riser.z]; // ホースの付け根

  // ---- ノズル（床の吸い口）。ローカル：+Z 前（本体から離れる向き）、+X ブラシ軸、Y 上 ----
  const nozzle = {
    rest: [A.nozzleRest[0], 0, A.nozzleRest[2]],
    width: 0.26, depth: 0.115, height: 0.078,
    plateT: 0.012,
    areaMin: [A.scrapArea.min[0] - 0.02, A.scrapArea.min[2] + 0.02],
    areaMax: [A.scrapArea.max[0] - 0.05, A.scrapArea.max[2] + 0.03],
    minPortDist: 0.34, // ホース口に近づきすぎない
    follow: 14, drift: 4.5, yawFollow: 9,
    wandBase: [0, 0.058, -0.036], wandTop: [0, 0.2, -0.165], wandR: 0.02,
    wheelR: 0.02, wheelW: 0.012, wheelX: 0.137, wheelZ: -0.046, // 車輪：回転角 = 移動距離 / 半径
    gearBox: 0.042, // 歯車の部屋（+X 端、透明な窓つき）の長さ
    hit: [0.32, 0.24, 0.27],
  };
  // ブラシローラーと歯車列（モーター z1 → ローラー z2、ω_brush = (z1/z2)·ω_motor）
  const brush = {
    axisY: 0.034, axisZ: 0.02,
    coreR: 0.013, tipR: 0.032, length: 0.19,
    rows: 4, perRow: 16, turns: 1, // 毛束 4列×16、らせん 1 周
    tuftR: 0.0055,
    z1: 10, z2: 25, module: 0.002, gearW: 0.008,
    motorDir: -1.4, // ローラー軸から見たモーター軸の向き（+Y から +Z へ測る角。後ろ上）
    idle: 6, perSpeed: 60, maxOmega: 60, spin: 5, // ω_motor = idle + perSpeed·|v|（上限つき）、追従 1/s
  };
  brush.centerDist = (brush.module * (brush.z1 + brush.z2)) / 2;
  // 吸い込み
  const suction = {
    radius: 0.085, halfWidth: 0.1, // 吸い口（線分）からの捕獲半径
    pull: 0.2, // 捕獲してから吸い口に届くまでの時間
    vAir: 1.5, // 管の中の速さ（m/s）
    binTime: 0.55, // 容器の中で渦を巻いて積もるまで
  };

  // ---- ホース（長さ一定。節は等間隔、接線に向ける） ----
  const hose = { length: 1.2, rings: 14, ringR: 0.027, ringLen: 0.034, tubeR: 0.0195, tubeSeg: 30, tubeSides: 8, k0: 0.2, k1: 0.16, samples: 32 };

  // ---- 紙片 ----
  const scraps = {
    count: 36, clusters: 6, clusterR: 0.085,
    size: [0.03, 0.046],
    areaMin: [A.scrapArea.min[0] + 0.12, A.scrapArea.min[2] + 0.08],
    areaMax: [A.scrapArea.max[0] - 0.17, A.scrapArea.max[2] - 0.06],
    uvHalf: 0.011,
    floorY: 0.007,
  };

  // ---- ごみ箱（ふた角 = 1.4·smoothstep(0.45, 0.15, 容器との水平距離)） ----
  const can = {
    pos: [A.trashCan[0], 0, A.trashCan[2]], radius: A.trashCanRadius, height: A.trashCanHeight,
    taper: 0.84, wall: 0.008,
    lidMax: 1.4, lidFar: 0.45, lidNear: 0.15,
  };
  // 空ける：容器の中心がここに来るとこぼれ口がごみ箱の真上
  const dump = {
    center: [can.pos[0] - 0.045, A.dumpPoint[1] + 0.01, can.pos[2]],
    tiltFar: 0.28, tiltNear: 0.1, // 中心までの距離 → 傾き α
    flow: 34, // 底ぶた全開での流量（枚/秒）
    gravity: 3, // 落下 p = p0 + v0·t − ½·g·t²
    viewDir: [0.03, 0.397, 0.917], // 容器を動かす面を決めるための見る向き
    xMin: 0.15, xMax: 1.12, yMax: 0.8,
    homeX: body.x1 + 0.05, // これより本体側で離すと受け台へ戻る
  };

  // ---- フィナーレ ----
  const finale = { duration: 4.6, burstStart: 0.25, burstSpread: 0.7, flight: [1.05, 1.5], stars: 44, hop: 0.035, binBack: 1.3, lidClose: 3.3 };

  // ---- 色（おもちゃのパステル）。pink は写真テクスチャそのまま ----
  const colors = {
    pink: null, pinkDeep: '#f58ab8', white: '#fff7f2', cream: '#fff1dc',
    yellow: '#ffd24a', orange: '#ffa23e', sky: '#8fd3ff', blue: '#5aa9f0', mint: '#86dcc0', mintDeep: '#4fc3a1',
    lilac: '#c3a8f0', purple: '#8a63d2', red: '#ff6b7d', dark: '#4b4460', eye: '#3a3050',
    clear: '#d8f1ff', glow: '#ffd36b',
  };

  const hint = { hz: 1.5, glow: 0.35, scale: 0.035, tilt: 0.05 };

  // カメラの定位置（既定より少し寄せて機構を見せる。無い段階はシェルの既定）
  const views = {
    pull: { position: [0.84, 0.84, 1.3], target: [0.78, 0.08, 0.13], fov: 45 },
    rewind: { position: [0.74, 0.98, 1.36], target: [0.7, 0.12, 0.12], fov: 45 }, // 組み込みで少し引いた：伸びきったプラグも画面に入る
    unlock: { position: [0.3, 0.74, 0.72], target: [0.27, 0.25, -0.08], fov: 45 },
    dump: { position: [0.64, 0.96, 1.28], target: [0.6, 0.33, -0.25], fov: 45 },
  };

  return { body, bay, reel, ratchet, spring, cord, plug, button, rewind, bin, latch, riser, nozzle, brush, suction, hose, scraps, can, dump, finale, colors, hint, views, texAvg: '#fdaccc' };
}
