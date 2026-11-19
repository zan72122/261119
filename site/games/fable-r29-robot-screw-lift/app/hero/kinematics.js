// 連動の式（three に依存しない純粋な計算）。
//  - 歯車列：位置と位相を噛み合い条件から解き、各軸の角度を θ = a·φ + c（φ = ハンドル角）で表す
//  - ねじの送り：台の高さ = y0 + (条数·リード / 2π)·|ねじ角|
//  - ラチェット：歯の斜面を爪が登って落ちる。爪の角は「爪の先が歯の面に乗る」条件から解く
//  - レバー → 偏心カム → 爪：カムが爪の背中を押さえ、爪が上がれる限界を決める
//  - ロボットの腕：2リンク IK
import { TAU } from './params.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const frac = (x) => x - Math.floor(x);
export const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const finite = (x, fallback) => (Number.isFinite(x) ? x : fallback);

// 歯車 1 枚：中心 c、軸 a（単位ベクトル）、基準方向 e0（θ = 0 のとき歯 0 が向く向き）、歯数 z
function gear(name, c, a, e0, z, r) {
  return { name, c, a, e0, e1: cross(a, e0), z, r, k: 0, c0: 0 }; // 角度 θ = k·φ + c0
}

// 噛み合い：A の歯が噛み合い点 M に来たとき、B の歯みぞが M に来る。速度の向きは接点の速度が一致する条件から。
function couple(A, B, M) {
  const ra = sub(M, A.c), rb = sub(M, B.c);
  const sigma = dot(cross(A.a, ra), cross(B.a, rb)) >= 0 ? 1 : -1;
  const rho = (sigma * A.z) / B.z;
  const gA = Math.atan2(dot(ra, A.e1), dot(ra, A.e0));
  const gB = Math.atan2(dot(rb, B.e1), dot(rb, B.e0));
  B.k = rho * A.k;
  B.c0 = rho * A.c0 + gB - Math.PI / B.z - rho * gA;
}

// 2円の交点のうち y が小さい方
function circleCircleLow(p0, r0, p1, r1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const d = Math.max(Math.hypot(dx, dy), 1e-9);
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r0 * r0 - a * a, 0));
  const mx = p0[0] + (a * dx) / d, my = p0[1] + (a * dy) / d;
  const s1 = [mx - (h * dy) / d, my + (h * dx) / d], s2 = [mx + (h * dy) / d, my - (h * dx) / d];
  return s1[1] < s2[1] ? s1 : s2;
}

// ---- 歯車列を解く
export function solveTrain(P) {
  const G = P.gears;
  const m = G.module;
  const rBig = (m * G.zBig) / 2, rPin = (m * G.zPinion) / 2;
  const z = G.planeZ;
  const Z = [0, 0, 1], X = [1, 0, 0], Y = [0, 1, 0];
  const cc = P.crank.child.center, rc = P.crank.robot.center;
  const D = [0, G.driveY];

  // 位置：ハンドル歯車 → 遊び歯車1（x のずれを指定、y は中心距離から）→ 遊び歯車2（歯車1と小歯車の両方に噛む位置）
  function side(center, sign) {
    const C = [center[0], center[1]];
    const dx = sign * G.idler1.dx;
    const I1 = [C[0] + dx, C[1] - Math.sqrt(Math.max(4 * rBig * rBig - dx * dx, 0))];
    const I2 = circleCircleLow(D, rBig + rPin, I1, 2 * rBig);
    return { C, I1, I2 };
  }
  const R = side(cc, 1), L = side(rc, -1);
  const g = (name, p, zz, r) => gear(name, [p[0], p[1], z], Z, X, zz, r);
  const gears = {
    crankR: g('crankR', R.C, G.zBig, rBig), idlerR1: g('idlerR1', R.I1, G.zBig, rBig), idlerR2: g('idlerR2', R.I2, G.zBig, rBig),
    pinion: g('pinion', D, G.zPinion, rPin),
    idlerL2: g('idlerL2', L.I2, G.zBig, rBig), idlerL1: g('idlerL1', L.I1, G.zBig, rBig), crankL: g('crankL', L.C, G.zBig, rBig),
  };
  const mid = (A, B) => { // ピッチ円どうしの接点
    const t = A.r / (A.r + B.r);
    return [A.c[0] + (B.c[0] - A.c[0]) * t, A.c[1] + (B.c[1] - A.c[1]) * t, z];
  };
  // 子どものハンドルは φ が増えると正面から見て時計回り（シェルの指のお手本と同じ向き）
  gears.crankR.k = -1; gears.crankR.c0 = 0;
  const chain = ['crankR', 'idlerR1', 'idlerR2', 'pinion', 'idlerL2', 'idlerL1', 'crankL'];
  for (let i = 0; i + 1 < chain.length; i++) couple(gears[chain[i]], gears[chain[i + 1]], mid(gears[chain[i]], gears[chain[i + 1]]));

  // かさ歯車（マイタ）：駆動軸（Z 向き）→ ねじ（Y 向き）。ピッチ円すいの頂点は2軸の交点 (0, driveY, 0)
  const rb = G.bevelR;
  const bevelDrive = gear('bevelDrive', [0, G.driveY, rb], Z, X, G.bevelZ, rb);
  bevelDrive.k = gears.pinion.k; bevelDrive.c0 = gears.pinion.c0; // 小歯車と同じ軸（剛体）
  const bevelScrew = gear('bevelScrew', [0, G.driveY - rb, 0], Y, X, G.bevelZ, rb);
  couple(bevelDrive, bevelScrew, [0, G.driveY - rb, rb]);
  gears.bevelDrive = bevelDrive; gears.bevelScrew = bevelScrew;

  const S = P.screw;
  const ratio = Math.abs(bevelScrew.k);              // ねじ角 / ハンドル角（= zBig / zPinion）
  const hand = bevelScrew.k > 0 ? -1 : 1;            // ねじ山の向き（+1 右ねじ）。台が上がる向きに決める
  const risePerRad = (S.lead * S.starts * ratio) / TAU; // ハンドル 1 rad あたりの台の上昇

  // 進行：ラチェットの歯の数で区切る（どの区間の終わりも、爪が同じ位置 hold に居る）
  const N = P.ratchet.teeth;
  const shaftRate = Math.abs(gears.pinion.k);        // 駆動軸角 / ハンドル角
  const pitch = TAU / N;                             // 歯 1 枚ぶんの駆動軸角
  const screwPerShaft = Math.abs(bevelScrew.k / gears.pinion.k);
  const teethTotal = Math.max(1, Math.round((P.carriage.travel / (S.lead * S.starts)) * (N / screwPerShaft)));
  const phiPerTooth = pitch / shaftRate;
  const phiTotal = teethTotal * phiPerTooth;
  const marks = P.flow.marks.map((p) => Math.round(clamp(p, 0, 1) * teethTotal) * phiPerTooth);

  return {
    gears, rBig, rPin, module: m, ratio, hand, risePerRad,
    shaftRate, pitch, teethTotal, phiPerTooth, phiTotal, marks,
    layout: { R, L, D },
    angle: (gr, phi) => gr.k * phi + gr.c0,
  };
}

// ---- ラチェット・爪・レバー（すべて駆動軸に垂直な面内の 2D）
export function solveRatchet(P, train) {
  const Rt = P.ratchet, Lv = P.lever;
  const O = [0, P.gears.driveY];
  const pin = train.gears.pinion;
  const s = pin.k >= 0 ? 1 : -1;                 // 駆動軸の前進の向き（+1 反時計回り）
  const pitch = train.pitch;
  const depth = Rt.rTip - Rt.rRoot;
  const b0 = Rt.contactAngle;
  // 車の形：車に固定した極座標 α で、半径 R(α) = rRoot + depth·frac(s·(αRef − α)/pitch)
  const alphaRef = b0 - pin.c0 + s * Rt.hold * pitch;
  const wheelRadius = (alpha) => Rt.rRoot + depth * frac((s * (alphaRef - alpha)) / pitch);

  // 爪：先が谷底に座った位置から、逆転方向の接線（少し外へ傾ける）に沿って支点を置く
  const n = [Math.cos(b0), Math.sin(b0)];
  const tRev = [s * Math.sin(b0), -s * Math.cos(b0)];
  const ct = Math.cos(Rt.pawlTilt), st = Math.sin(Rt.pawlTilt);
  const dir0 = [ct * tRev[0] + st * n[0], ct * tRev[1] + st * n[1]];
  const T0 = [O[0] + Rt.rRoot * n[0], O[1] + Rt.rRoot * n[1]];
  const pivot = [T0[0] + Rt.pawlLen * dir0[0], T0[1] + Rt.pawlLen * dir0[1]];
  const dP = Math.hypot(pivot[0] - O[0], pivot[1] - O[1]);
  const angPO = Math.atan2(O[1] - pivot[1], O[0] - pivot[0]);
  const psiSeat = Math.atan2(-dir0[1], -dir0[0]);
  const gammaOf = (rho) => Math.acos(clamp((dP * dP + Rt.pawlLen * Rt.pawlLen - rho * rho) / (2 * dP * Rt.pawlLen), -1, 1));
  const sideSign = Math.abs(wrapPi(angPO + gammaOf(Rt.rRoot) - psiSeat)) < Math.abs(wrapPi(angPO - gammaOf(Rt.rRoot) - psiSeat)) ? 1 : -1;
  // 爪の角 ψ（支点から先への向き）を、歯の斜面上の位置 u（0 谷底〜1 歯先。1 を超えると歯から浮く）から求める
  function pawlAngle(u) {
    let psi = psiSeat;
    let ue = u;
    for (let i = 0; i < 2; i++) {
      const rho = Rt.rRoot + depth * Math.max(ue, 0);
      psi = angPO + sideSign * gammaOf(rho);
      // 爪の先は少し横にも動くので、その分だけ斜面上の位置を直す
      const tx = pivot[0] + Rt.pawlLen * Math.cos(psi) - O[0], ty = pivot[1] + Rt.pawlLen * Math.sin(psi) - O[1];
      const beta = Math.atan2(ty, tx);
      ue = u <= 1 ? clamp(u + (s * wrapPi(b0 - beta)) / pitch, 0, 1) : u;
    }
    return finite(psi, psiSeat);
  }
  const tipRadius = (psi) => Math.hypot(pivot[0] + Rt.pawlLen * Math.cos(psi) - O[0], pivot[1] + Rt.pawlLen * Math.sin(psi) - O[1]);
  // 外向き（車から離れる向き）に ψ がどちらへ回るか
  const liftSign = wrapPi(pawlAngle(1) - psiSeat) >= 0 ? 1 : -1;

  // 爪の背中の突起（カムの相手）。爪に固定：支点から fl 先、背中側へ fw
  const halfT = 0.02;
  const fl = Rt.followerAt * Rt.pawlLen, fw = halfT;
  const RF = Math.hypot(fl, fw);
  const outSide = liftSign;                       // 背中 = ψ が増える/減る側
  const delta = outSide * Math.atan2(fw, fl);     // 支点から見た突起の向きのずれ
  const follower = (psi) => [pivot[0] + RF * Math.cos(psi + delta), pivot[1] + RF * Math.sin(psi + delta)];

  // レバー：握り玉が下がる向きに回る。カムはレバーと一体の偏心円板
  const Lp = Lv.pivot;
  const lam0 = Math.atan2(Lv.knob[1] - Lp[1], Lv.knob[0] - Lp[0]);
  const armLen = Math.hypot(Lv.knob[0] - Lp[0], Lv.knob[1] - Lp[1]);
  const sgnL = Math.cos(lam0) >= 0 ? -1 : 1;
  const Fseat = follower(psiSeat);
  const kF = Math.atan2(Fseat[1] - Lp[1], Fseat[0] - Lp[0]);
  let ecc = Lv.camEcc, camR = 0.05;
  const camAngle = (th) => kF - sgnL * (Lv.camLead + Lv.throw - th);
  const camCenter = (th, out) => { const k = camAngle(th); out[0] = Lp[0] + ecc * Math.cos(k); out[1] = Lp[1] + ecc * Math.sin(k); return out; };
  const tmpC = [0, 0];
  let etaSign = 1;
  // レバー角 th のとき、爪が上がれる限界（歯の斜面上の位置 u の上限。カムに触れないなら大きな値）
  function uLimit(th) {
    camCenter(th, tmpC);
    const dx = tmpC[0] - pivot[0], dy = tmpC[1] - pivot[1];
    const Dc = Math.max(Math.hypot(dx, dy), 1e-9);
    const rr = camR + Rt.followerR;
    if (Dc >= RF + rr) return 9;
    const eta = Math.acos(clamp((RF * RF + Dc * Dc - rr * rr) / (2 * RF * Dc), -1, 1));
    const psiLim = Math.atan2(dy, dx) + etaSign * eta - delta;
    if (liftSign * wrapPi(psiLim - psiSeat) <= 0) return 0;
    return Math.max(0, (tipRadius(psiLim) - Rt.rRoot) / depth);
  }
  // カムの半径：下げ切ったとき、座った爪の突起にちょうど触れる。上げたときに歯先を越える余裕が無ければ偏心を増やす
  for (let i = 0; i < 24; i++) {
    camCenter(Lv.throw, tmpC);
    camR = Math.max(Math.hypot(Fseat[0] - tmpC[0], Fseat[1] - tmpC[1]) - Rt.followerR, 0.01);
    // 交点の選び方：下げ切りで ψ = psiSeat になる方
    const dx = tmpC[0] - pivot[0], dy = tmpC[1] - pivot[1];
    const Dc = Math.hypot(dx, dy), rr = camR + Rt.followerR;
    const eta = Math.acos(clamp((RF * RF + Dc * Dc - rr * rr) / (2 * RF * Dc), -1, 1));
    const base = Math.atan2(dy, dx) - delta;
    etaSign = Math.abs(wrapPi(base + eta - psiSeat)) <= Math.abs(wrapPi(base - eta - psiSeat)) ? 1 : -1;
    if (uLimit(0) >= Lv.freeMargin) break;
    ecc *= 1.12;
  }
  // 逆：斜面上の位置 u まで爪が上がったとき、レバーが押し戻される角（u を許す最大のレバー角）
  function leverForU(u) {
    let lo = 0, hi = Lv.throw;
    if (uLimit(hi) >= u) return hi;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (uLimit(mid) >= u) lo = mid; else hi = mid; }
    return lo;
  }

  return {
    O, s, pitch, depth, alphaRef, wheelRadius, pivot, psiSeat, pawlAngle, liftSign, follower, halfT, fl, fw, outSide,
    leverPivot: Lp, lam0, armLen, sgnL, ecc: () => ecc, camR: () => camR, camAngle, camCenter, uLimit, leverForU,
    leverAngle: (th) => lam0 + sgnL * th,
  };
}

// ---- 2リンク IK。S 肩、T 手先の目標、pole ひじを向けたい向き。結果を out.elbow / out.hand（配列）に書く。NaN を出さない。
export function ik2(S, T, pole, a, b, out) {
  let ux = T[0] - S[0], uy = T[1] - S[1], uz = T[2] - S[2];
  let len = Math.hypot(ux, uy, uz);
  if (!(len > 1e-6)) { ux = 0; uy = -1; uz = 0; len = 1e-6; }
  ux /= len; uy /= len; uz /= len;
  const eps = 1e-3;
  const d = clamp(len, Math.abs(a - b) + eps, a + b - eps);
  // pole から u 成分を除いた向き（ひじが出る向き）
  const pu = pole[0] * ux + pole[1] * uy + pole[2] * uz;
  let wx = pole[0] - pu * ux, wy = pole[1] - pu * uy, wz = pole[2] - pu * uz;
  let wl = Math.hypot(wx, wy, wz);
  if (!(wl > 1e-5)) { // pole が腕と平行：適当な垂直方向
    if (Math.abs(uy) < 0.9) { wx = -ux * uy; wy = 1 - uy * uy; wz = -uz * uy; } else { wx = 1 - ux * ux; wy = -uy * ux; wz = -uz * ux; }
    wl = Math.max(Math.hypot(wx, wy, wz), 1e-6);
  }
  wx /= wl; wy /= wl; wz /= wl;
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(Math.max(1 - cosA * cosA, 0));
  out.elbow[0] = S[0] + a * (cosA * ux + sinA * wx);
  out.elbow[1] = S[1] + a * (cosA * uy + sinA * wy);
  out.elbow[2] = S[2] + a * (cosA * uz + sinA * wz);
  out.hand[0] = S[0] + d * ux; out.hand[1] = S[1] + d * uy; out.hand[2] = S[2] + d * uz;
  out.reach = d / (a + b);
  return out;
}

// 減衰つきばね（宝箱のふた・おもちゃのばね）：0 から 1 へ、行き過ぎて揺れながら落ち着く
export function springStep(t, freq = 3.2, damp = 0.28) {
  if (t <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damp * w * t) * Math.cos(w * Math.sqrt(Math.max(1 - damp * damp, 1e-4)) * t);
}

export const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
// 指数減衰の追従（フレーム時間に依らない）
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
