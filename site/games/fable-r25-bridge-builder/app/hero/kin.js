// 架橋機の寸法（パラメータ）と運動学（数式）。three を使わない純粋な計算だけを置く。
// 単位は m / rad。座標は HERO-SPEC §2（+Y 上、前 = −Z、yaw は +Y まわり）。
//
// 連動の全体図：
//   クランク歯車 G1 ─ 中間歯車 Gi ─ ねじ歯車 G2 ＝ 送りねじ → ナット＋押し棒 → クロスヘッドの横棒
//     → 発射セル（機械側の X リンク）→ 橋の全セル（パンタグラフ）→ 蛇腹の床板 ／ マストのスライダ（ラチェット）
//   押し棒は横棒を後ろから押すだけ（つながっていない）。横棒は起伏軸より下にあるので、
//   ブームを持ち上げると前上へ離れる。離れたら押し棒はばねで戻る（歯車列も歯数比のまま逆回転）。
//   レバー ─ 腕 ─ リフトリング（上下）─ ブームの従動ローラ → 起伏角 α
//   舵輪 ─ 小歯車 ─ 冠歯車（旋回台の下のペグ）→ yaw

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const safeAcos = (x) => Math.acos(clamp(x, -1, 1));
const safeAsin = (x) => Math.asin(clamp(x, -1, 1));
const safeSqrt = (x) => Math.sqrt(Math.max(0, x));

/** すべての寸法。ここを変えると形も動きも追従する。 */
export const P = {
  // --- 固定の本体
  chassisW: 2.64, chassisT: 0.10, chassisZ0: -0.2, chassisZ1: 1.05, chassisDiscR: 0.95,
  pedestalR: 0.45, pedestalTop: 0.50,
  panelZ: 0.95, panelT: 0.07, panelH: 0.72, panelTabH: 1.16,
  // --- 旋回台
  discR: 0.78, discT: 0.10,
  towerX: 0.56, towerW: 0.10, towerD: 0.16,
  pivotY: 1.0,                  // 起伏の軸の高さ（旋回軸の上）
  // --- クランク歯車列（パネルの前面、軸は Z）
  gearM: 0.035,                 // モジュール
  Z1: 24, Zi: 12, Z2: 10,       // クランク／中間／ねじ歯車の歯数
  gearT: 0.07,
  crankX: -0.85, crankY: 0.60,
  knobR: 0.30,                  // 取っ手の位置（半径）
  screwLead: 0.09,              // 送りねじのリード（1回転で進む量）
  screwR: 0.028, screwRidge: 0.05,
  screwDY: 0.03,                // 送りねじの高さ（起伏軸から）
  screwZ0: 0.30,                // 送りねじの前の端（旋回台の後ろ）
  nutZ0: 0.80, nutLen: 0.12, nutW: 0.16, nutH: 0.11,
  barV: -0.09, barR: 0.02,      // クロスヘッドの横棒（押し棒が押す所。起伏軸より下＝持ち上げると前へ離れる）
  rodR: 0.025,
  // --- パンタグラフ橋
  link: 0.90,                   // リンク長 ℓ
  linkW: 0.07, linkT: 0.03,
  w0: 0.12,                     // 畳んだときの1セルの長さ
  phiLo: 0.454,                 // 伸ばし切ったときの角度の下限（26°）→ セル数を決める
  trussX: 0.375,                // トラス（左右）の中心面
  uA: 0.25,                     // 発射セルの固定ピン（ブーム座標、軸から前へ）
  vR: 0.14,                     // 下ピンの列の高さ（ブーム座標）
  pinR: 0.03, pinLen: 0.09,
  deckW: 0.62, deckT: 0.035,
  railEnd: 0.93, railT: 0.07, railW: 0.05, beamV: -0.015,
  mastX: 0.43,
  ratchetPitch: 0.045,
  // --- 起伏（レバー → リフトリング → 従動ローラ）
  liftMax: 0.21,                // 持ち上げ角（12°）
  ringRi: 0.80, ringRo: 0.92, ringT: 0.05,
  followU: 0.73, followD: 0.30, followX: 0.42, followR: 0.04,
  leverX: 1.15, leverBetaMax: 0.49, leverHandle: 0.55, leverBallR: 0.10, armRollR: 0.03,
  releaseDrop: 0.03,            // 橋を置いたあと、ブームをさらに下げる角度
  // --- 旋回（舵輪 → 小歯車 → 冠歯車）
  Zw: 6, Zr: 48, crownR: 0.70, pegR: 0.016, pegLen: 0.05,
  wheelR: 0.30, wheelPeg: 0.07,
  // --- 受け口と橋台
  recvH: 0.07,                  // 島の受け口：下ピンの中心の高さ（地面から）
  padW: 1.0, padD: 0.6,
  pierPostX: 0.2,
  // --- 操作量
  leverSpan: 0.42,              // lift：画面の高さのこの割合で終わる
  lockTime: 1.5, busyTime: 1.7, releaseTime: 1.0,
};

/** 外歯車どうしのかみ合い。歯車1（歯数 Za、角度 thA）に対する歯車2（歯数 Zb）の角度。
 *  gamma = 歯車1の中心から歯車2の中心への向き。歯と谷が中心線上で合う位相にする。 */
export function meshAngle(thA, Za, Zb, gamma) {
  return -(thA - gamma) * Za / Zb + gamma + Math.PI - Math.PI / Zb;
}

/** 2円の交点（歯車の中心間距離から中間歯車の位置を決める）。上側の解を返す。 */
export function circleCross(ax, ay, ra, bx, by, rb) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.max(1e-6, Math.hypot(dx, dy));
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = safeSqrt(ra * ra - a * a);
  const mx = ax + (a * dx) / d, my = ay + (a * dy) / d;
  const p = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  const q = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
  return p.y >= q.y ? p : q;
}

/** 歯車列の配置（パネル面の座標）。 */
export function gearLayout() {
  const r1 = P.gearM * P.Z1 / 2, ri = P.gearM * P.Zi / 2, r2 = P.gearM * P.Z2 / 2;
  const c1 = { x: P.crankX, y: P.crankY }, c2 = { x: 0, y: P.pivotY + P.screwDY };
  const ci = circleCross(c1.x, c1.y, r1 + ri, c2.x, c2.y, ri + r2);
  return {
    r1, ri, r2, c1, ci, c2,
    g1i: Math.atan2(ci.y - c1.y, ci.x - c1.x),   // G1 → Gi の向き
    gi2: Math.atan2(c2.y - ci.y, c2.x - ci.x),   // Gi → G2 の向き
  };
}

/** ナットの送り s から歯車の角度（見た目の rotation.z）。ねじは Z 軸、s が増えると前（−Z）へ。 */
export function gearAngles(s, lay, out) {
  const thS = -TAU * s / P.screwLead;                        // 送りねじ＝G2
  // G2 から逆にたどる：Gi は G2 とかみ合い、G1 は Gi とかみ合う
  const thI = meshAngle(thS, P.Z2, P.Zi, lay.gi2 + Math.PI);
  const th1 = meshAngle(thI, P.Zi, P.Z1, lay.g1i + Math.PI);
  out.screw = thS; out.idler = thI; out.crank = th1;
  return out;
}
/** クランク歯車の回転角（指の角度）→ ナットの送り量。 */
export const crankToTravel = (dTheta) => dTheta * (P.Z1 / P.Z2) * P.screwLead / TAU;

/** パンタグラフ：1セルの長さ w から、角度・高さ。 */
export function scissor(w, out) {
  const phi = safeAcos(w / P.link);
  out.w = w; out.phi = phi; out.h = P.link * Math.sin(phi);
  return out;
}

/** 起伏：リフトリングに乗る従動ローラ。レバー角 beta → 起伏角 alpha（とリングの高さ）。 */
export function makeLift(alphaLo) {
  const rho = Math.hypot(P.followU, P.followD), delta = Math.atan2(P.followD, P.followU);
  const stack = P.followR + P.ringT + P.armRollR;      // 腕のローラ中心 → 従動ローラ中心
  const sHi = rho * Math.sin(P.liftMax - delta), sLo = rho * Math.sin(alphaLo - delta);
  const arm = (sHi - sLo) / (2 * Math.sin(P.leverBetaMax));   // 腕の長さ
  const leverY = P.pivotY - stack + (sHi + sLo) / 2;          // レバー軸の高さ
  return {
    arm, leverY, alphaLo,
    /** 腕の先（ローラ中心）の高さ */
    armTipY: (beta) => leverY + arm * Math.sin(beta),
    ringBottomY: (beta) => leverY + arm * Math.sin(beta) + P.armRollR,
    alphaOf: (beta) => safeAsin((leverY + arm * Math.sin(beta) + stack - P.pivotY) / rho) + delta,
    betaOf: (alpha) => safeAsin((P.pivotY + rho * Math.sin(alpha - delta) - stack - leverY) / arm),
  };
}

/** 旋回：yaw の変化 → 舵輪（小歯車）の角度。冠歯車は旋回台の後ろ側（+Z）でかみ合う。 */
export const wheelAngle = (yaw) => -yaw * P.Zr / P.Zw + Math.PI / 2 + Math.PI / P.Zw;
export const wheelToYaw = (dTheta) => dTheta * P.Zw / P.Zr;

/**
 * ラウンド（岸）ごとの橋の解。ブーム座標 (u 前, v 上) は起伏軸が原点。
 * 先端の下ピンが受け口 (distance, height + recvH) に乗るように、最終の起伏角 a1 と全長 U を解く。
 */
export function solveRound(t) {
  const dy = t.height + P.recvH - P.pivotY;
  const U = safeSqrt(t.distance * t.distance + dy * dy - P.vR * P.vR);
  const a1 = Math.atan2(dy, t.distance) - Math.atan2(P.vR, Math.max(1e-6, U));
  const span = Math.max(0.5, U - P.uA);
  const cells = Math.max(2, Math.ceil(span / (P.link * Math.cos(P.phiLo))));   // 発射セルを含む
  const w1 = span / cells;
  const phi1 = safeAcos(w1 / P.link);
  const travel = (w1 - P.w0) / 2;                       // ナットの送り（クロスヘッドは w/2 の位置）
  const crankTotal = travel * TAU / P.screwLead * (P.Z2 / P.Z1);
  const dyaw = wrapPi(t.yaw - t.launchYaw);
  return {
    target: t, U, a1, cells, n: cells - 1, w1, phi1, h1: P.link * Math.sin(phi1),
    panel: w1 / 2,                                       // 床板（蛇腹）1枚の長さ
    travel, crankTotal, crankTurns: crankTotal / TAU,
    dyaw, needTurn: Math.abs(dyaw) >= 0.05,
    wheelTotal: Math.abs(dyaw) * P.Zr / P.Zw,
    rootU: P.uA + w1, tipU: U,
  };
}
