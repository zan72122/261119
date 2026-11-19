// 機構の式（three を使わない純粋な計算）。docs/HERO-SPEC.md §6 の連動はすべてここにある。
// 角度は積分せず、できるだけ「元の量（長さ・移動距離）→ 式 → 角度」で求める（ずれない）。

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const frac = (x) => x - Math.floor(x);
// a>b でも使える smoothstep（a→0、b→1）
export function smoothstep(a, b, x) {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// 指数の追従（フレーム時間によらない）
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const finite = (x, fallback) => (Number.isFinite(x) ? x : fallback);

// 決まった乱数（i 番目の k 個目）。0..1
export function rnd(i, k) {
  const x = Math.sin(i * 127.1 + k * 311.7 + 0.37) * 43758.5453;
  return x - Math.floor(x);
}

// ---- コードリール ----
// 巻かれた長さ Lw のときの巻き半径：断面積の保存 π(r²−r0²)·w = Lw·d·d·(π/…) を簡単にした式
export function reelRadius(reel, Lw) {
  return Math.sqrt(reel.r0 * reel.r0 + (Math.max(0, Lw) * reel.d * reel.d) / reel.w);
}
// 引き出した長さ L のときのリール角 θ(L) = (2w/d²)·(r(Lmax) − r(Lmax−L))。dθ = dL / r を積分した閉じた式
export function reelAngle(reel, L) {
  const l = clamp(L, 0, reel.Lmax);
  return ((2 * reel.w) / (reel.d * reel.d)) * (reelRadius(reel, reel.Lmax) - reelRadius(reel, reel.Lmax - l));
}
// 穴 E（リール中心からの相対 XY）から、半径 r の巻き面への接点の角（下側から +X へ出ていく側）
export function reelTangentAngle(ex, ey, r) {
  const dist = Math.hypot(ex, ey);
  const a = Math.atan2(ey, ex);
  return a - Math.acos(clamp(r / Math.max(dist, 1e-6), -1, 1));
}

// ---- ラチェットと爪 ----
// 爪の静止角 γ0：支点から爪先への向き（爪先が歯底円に乗る）
export function pawlRestAngle(reel, ratchet) {
  const px = ratchet.pivot[0] - reel.cx, py = ratchet.pivot[1] - reel.cy;
  const D = Math.hypot(px, py), a = ratchet.tipArm, r = ratchet.rRoot;
  const cosA = clamp((a * a + D * D - r * r) / (2 * a * D), -1, 1);
  // 支点→中心の向きから、進み側（リールの上で左へ）に開く
  return Math.atan2(-py, -px) - Math.acos(cosA);
}
// 爪を δ だけ持ち上げたときの爪先（リール中心からの相対 XY）
export function pawlTip(reel, ratchet, gamma0, delta, out) {
  const g = gamma0 - delta;
  out[0] = ratchet.pivot[0] - reel.cx + ratchet.tipArm * Math.cos(g);
  out[1] = ratchet.pivot[1] - reel.cy + ratchet.tipArm * Math.sin(g);
  return out;
}
// 歯面：爪の角 = swing·frac(θ·Z/2π) がいつも成り立つように、爪先の軌跡を車の座標に写して歯形にする（カム曲線）
// 返り値：車の座標の [x, y] の並び（車が +θ に回るとき、爪は坂をのぼって歯の端で落ちる）
export function ratchetProfile(reel, ratchet, perTooth) {
  const g0 = pawlRestAngle(reel, ratchet);
  const pitch = TAU / ratchet.Z;
  const pts = [];
  const tip = [0, 0];
  for (let k = 0; k < ratchet.Z; k++) {
    for (let j = 0; j <= perTooth; j++) {
      const f = j / perTooth;
      pawlTip(reel, ratchet, g0, ratchet.swing * f, tip);
      const th = -(k + f) * pitch; // 車の座標へ：−θ 回す
      const c = Math.cos(th), s = Math.sin(th);
      pts.push([tip[0] * c - tip[1] * s, tip[0] * s + tip[1] * c]);
    }
  }
  return pts;
}
export function ratchetTipRadius(reel, ratchet) {
  const t = pawlTip(reel, ratchet, pawlRestAngle(reel, ratchet), ratchet.swing, [0, 0]);
  return Math.hypot(t[0], t[1]);
}
// 歯の番号と爪の角
export const ratchetIndex = (theta, Z) => Math.floor((theta * Z) / TAU + 1e-9);
export const pawlAngleFromRatchet = (theta, ratchet) => ratchet.swing * frac((theta * ratchet.Z) / TAU + 1e-9);
// ボタンの押し込み b → 爪の角（尾は水平、突き棒が真下に b 押す：sin δ = b / tailArm）。爪先の持ち上げ ≈ (tipArm/tailArm)·b
export const pawlAngleFromButton = (b, ratchet) => Math.asin(clamp(b / ratchet.tailArm, 0, 1));
// 爪が歯を越えて自由になる押し込み量
export const buttonFreeStroke = (ratchet) => ratchet.tailArm * Math.sin(ratchet.swing);

// ---- ぜんまい ----
// アルキメデス螺旋 r(φ) = ri + (ro−ri)·φ/Φ、Φ = 2π·n0 + ψ（ψ は締め角＝リール角）
export const springTotalAngle = (spring, psi) => TAU * spring.n0 + Math.max(0, psi);
export const springRadius = (spring, phi, total) => spring.ri + ((spring.ro - spring.ri) * phi) / Math.max(total, 1e-6);

// ---- 巻き戻し ----
// dL/dt = −vmax·(0.35+0.65·L/Lmax)·smoothstep(0, slow, L)（最後に止まらないよう下限つき）
export function rewindSpeed(rw, L, Lmax) {
  return rw.vmax * (0.35 + (0.65 * L) / Lmax) * Math.max(smoothstep(0, rw.slow, L), rw.floor);
}

// ---- 留め金（偏心カム＋スコッチヨーク） ----
export const camPin = (e, phi) => e * (1 - Math.cos(phi)); // ピン変位
export const camDrop = (e, phi) => e * Math.sin(phi); // 偏心円の中心が下がる量（ヨークの縦溝が逃がす）

// ---- 歯車列 ----
// モーター歯車の角 a1 = o1 − φ、ローラー歯車の角 a2 = o2 + (z1/z2)·φ。
// かみ合い：中心線の向き dir（ローラー→モーター）で、モーターの歯とローラーの歯溝が向き合う
export function gearPhase(brush) {
  const o1 = brush.motorDir + Math.PI;
  const o2 = brush.motorDir - Math.PI / brush.z2;
  return { o1, o2, ratio: brush.z1 / brush.z2 };
}

// ---- 容器・ごみ箱 ----
export const flapAngle = (bin, alpha) => clamp((alpha - bin.flapStart) * bin.flapGain, 0, bin.flapMax);
export const lidAngle = (can, dist) => can.lidMax * smoothstep(can.lidFar, can.lidNear, dist);

// ---- ホース（3次ベジェ）。長さが一定になるよう持ち上げ量を解く ----
// p: Float32Array(12) = P0,P1,P2,P3。out へ n+1 点、返り値は長さ
export function bezierSample(p, n, out, lens) {
  let len = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const x = a * p[0] + b * p[3] + c * p[6] + d * p[9];
    const y = a * p[1] + b * p[4] + c * p[7] + d * p[10];
    const z = a * p[2] + b * p[5] + c * p[8] + d * p[11];
    if (i > 0) len += Math.hypot(x - out[i * 3 - 3], y - out[i * 3 - 2], z - out[i * 3 - 1]);
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    if (lens) lens[i] = len;
  }
  return len;
}
// 折れ線（pts: n+1 点、lens: 累積長）の、長さ s の位置を out[0..2] に入れる。返り値は区間番号
export function polyAt(pts, lens, n, s, out) {
  const total = lens[n];
  const q = clamp(s, 0, total);
  let i = 0;
  // 少数点なので線形探索で十分
  while (i < n - 1 && lens[i + 1] < q) i++;
  const seg = Math.max(lens[i + 1] - lens[i], 1e-9);
  const t = clamp((q - lens[i]) / seg, 0, 1);
  out[0] = lerp(pts[i * 3], pts[i * 3 + 3], t);
  out[1] = lerp(pts[i * 3 + 1], pts[i * 3 + 4], t);
  out[2] = lerp(pts[i * 3 + 2], pts[i * 3 + 5], t);
  return i;
}
// 折れ線の累積長を作る
export function polyLengths(pts, n, lens) {
  lens[0] = 0;
  for (let i = 1; i <= n; i++) lens[i] = lens[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
  return lens[n];
}

// 弾道：位置 = p0 + v0·t − ½·g·t²。時間 T で p1 に着く v0 を求める
export function ballisticV0(p0, p1, T, g, out) {
  const t = Math.max(T, 1e-3);
  out[0] = (p1[0] - p0[0]) / t;
  out[1] = (p1[1] - p0[1]) / t + 0.5 * g * t;
  out[2] = (p1[2] - p0[2]) / t;
  return out;
}
