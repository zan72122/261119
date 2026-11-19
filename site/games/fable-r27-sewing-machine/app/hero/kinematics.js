// 機構の数式（THREE なし・状態なし）。すべて手回し車の角度 θ（= 上軸の角 φ）の関数。
import { P } from './params.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const sqrt0 = (v) => Math.sqrt(Math.max(v, 0));          // 負の根で NaN にしない
export const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ---------- 針棒：スライダークランク ----------
/** 針が最上点から下がった量。φ=0 で 0、φ=π で 2r。 */
export function needleDrop(phi) {
  const { r, L } = P.crank, s = r * Math.sin(phi);
  return r * (1 - Math.cos(phi)) + L - sqrt0(L * L - s * s);
}
export const needleTipY = (phi) => P.crank.yTop - needleDrop(phi);
/** 針先から連桿の下の目（リストピン）までの長さ。上軸の高さ・r・L・yTop から決まる。 */
export const WRIST = P.SHAFT_Y + P.crank.r - P.crank.L - P.crank.yTop;
/** 針が針板の高さに届く位相 φ（刺さる側）。数値で解く（初期値なら 2.169）。 */
export const PIERCE = (() => {
  let a = Math.PI / 2, b = Math.PI;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (needleTipY(m) > P.PLATE_Y) a = m; else b = m; }
  return (a + b) / 2;
})();
/** 縫い始めからの位相 φ' = θ − θ_R（θ_R ≡ π/2）で数えた、針が刺さる位相・釜が糸をとらえる位相。 */
export const PEN = PIERCE - Math.PI / 2;
export const HOOK_CATCH = P.hook.phiC - Math.PI / 2;

// ---------- 天びん：四節リンク ----------
// 上軸の天びんクランク（半径 r、針のクランクより phase だけ進む）→ 連結棒 c → てこ（支点 O、後ろの腕 ρ、前の腕 tip）。
// (y, z) 平面で 2 つの円の交点を解く。届かない寸法でも NaN にならないよう距離を丸める。
export function takeUp(phi, out = {}) {
  const t = P.takeup, a = phi + t.phase;
  const py = P.SHAFT_Y + t.r * Math.cos(a), pz = t.r * Math.sin(a);
  let dy = t.oy - py, dz = t.oz - pz;
  const d0 = Math.hypot(dy, dz) || 1e-9;
  const d = clamp(d0, Math.abs(t.rho - t.c) + 1e-6, t.rho + t.c - 1e-6);
  dy /= d0; dz /= d0;
  const k = (d * d + t.c * t.c - t.rho * t.rho) / (2 * d);
  const h = sqrt0(t.c * t.c - k * k);
  // 交点は 2 つ。上・後ろ側（てこの後ろの腕が上軸の真上に来る方）を使う。
  const qy = py + k * dy + h * dz, qz = pz + k * dz - h * dy;
  const ly = t.oy - qy, lz = t.oz - qz, ll = Math.hypot(ly, lz) || 1e-9;
  out.py = py; out.pz = pz; out.qy = qy; out.qz = qz;
  out.ty = t.oy + (ly / ll) * t.tip; out.tz = t.oz + (lz / ll) * t.tip;   // 糸の穴（前の腕の先）
  out.lever = Math.atan2(qz - t.oz, qy - t.oy) + Math.PI / 2;               // てこの回転（後ろの腕が −Z のとき 0）
  out.coupler = Math.atan2(qz - pz, qy - py);                               // 連結棒の回転（+Y のとき 0）
  out.couplerLen = Math.hypot(qz - pz, qy - py);
  return out;
}

// ---------- 模様カム：k 針目の (x, ζ) ----------
// ζ は布の先端からの距離。表は n 点（縫うのは n−1 針、最後の 1 点は「次に行く所」）。
// 機械として無理のない範囲：|x| ≤ swing.max、|ζ の差| ≤ feed.maxS。
export function patternPoints(name, n = P.K_TOTAL + 1, z0 = P.cloth.zeta0) {
  const pts = [[0, z0]];
  const run = (toZ, step) => { // 中心線をまっすぐ進む（つなぎ）。最後の点が toZ にちょうど乗る。
    const from = pts[pts.length - 1][1], cnt = Math.max(1, Math.ceil(Math.abs(toZ - from) / step - 1e-6));
    for (let i = 1; i <= cnt; i++) pts.push([0, from + ((toZ - from) * i) / cnt]);
  };
  if (name === 'star') {
    // とがりを布の先端側に向けた星。外 Ro／内 Ri。上のとがりから一周して閉じ、右半分をもう一度なぞって
    // 下の谷（中心線上）から出る → 星の中を横切る糸がない。
    const Ro = 0.0148, Ri = 0.0065;
    const v = (c, j) => { const a = -Math.PI / 2 + (j * Math.PI) / 5, r = j % 2 ? Ri : Ro; return [r * Math.cos(a), c + r * Math.sin(a)]; };
    let top = z0 + 0.012;
    for (let s = 0; s < 2 && pts.length < n; s++) {
      run(top, 0.008);
      const c = top + Ro;
      for (let j = 1; j <= 10; j++) pts.push(v(c, j));
      if (s === 0) { for (let j = 1; j <= 5; j++) pts.push(v(c, j)); top = c + Ro * Math.sin(0.3 * Math.PI) + 0.008; }
    }
  } else if (name === 'heart') {
    // 上のくぼみから一周して閉じ、右半分をもう一度なぞって下のとがりから出る。
    const hs = 0.001;
    const v = (c, j) => { const t = (TAU * j) / 14; return [hs * 16 * Math.sin(t) ** 3, c - hs * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; };
    const notch = z0 + 0.032;
    run(notch, 0.008);
    const c = notch + 5 * hs;
    for (let j = 1; j <= 14; j++) pts.push(v(c, j));
    for (let j = 1; j <= 7; j++) pts.push(v(c, j));
  } else {
    for (let k = 1; k < n; k++) pts.push([0.012 * Math.sin((TAU * k) / 12), z0 + 0.006 * k]);
  }
  // 残りは中心線をまっすぐ（0.008 ずつ）。最後の点は x=0 に戻る。
  while (pts.length < n) pts.push([0, pts[pts.length - 1][1] + (pts.length === n - 1 && name !== 'wave' ? 0.004 : 0.008)]);
  pts.length = n;
  pts[n - 1][0] = 0;
  const { max } = P.swing, { maxS } = P.feed;
  for (let k = 0; k < n; k++) {   // 機械の限界に丸める（NaN も消す）
    pts[k][0] = clamp(finite(pts[k][0]), -max, max);
    if (k) pts[k][1] = pts[k - 1][1] + clamp(finite(pts[k][1] - pts[k - 1][1]), -maxS, maxS);
  }
  return pts;
}

// ---------- 縫いの位相（docs/HERO-SPEC.md「位相の約束」）----------
/** psi = θ − θ_R（≥0）。1 回転 = 1 針。 */
export function sewState(psi, pts, out = {}) {
  const N = pts.length - 1;
  psi = Math.max(0, finite(psi));
  const c = Math.floor(psi / TAU + 1e-9), fp = Math.max(0, psi - c * TAU);
  const i0 = Math.min(c, N), i1 = Math.min(c + 1, N), im = Math.max(0, Math.min(c - 1, N));
  const s = pts[i1][1] - pts[i0][1];
  out.c = c; out.fp = fp;
  out.stitches = Math.min(N, c + (fp >= PEN ? 1 : 0));
  // 針振り：針が布の上にいる間だけ x_c → x_{c+1}
  out.x = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * smooth((fp - P.swing.a0) / (P.swing.a1 - P.swing.a0));
  // 送り：φ' ∈ [π, 2π] で布が s だけ進む
  out.zeta = pts[i0][1] + s * (fp >= Math.PI ? (1 + Math.cos(fp)) / 2 : 0);
  // 送り歯の前後の振れ幅（歯が下で真ん中にいる φ'=π/2 で次の針の送り量に切り替わる）
  out.feedS = fp < Math.PI / 2 ? pts[i0][1] - pts[im][1] : s;
  return out;
}

/** 送り歯の楕円運動（歯の上端の高さと前後）。 */
export function feedDog(phi, s, out = {}) {
  out.y = P.PLATE_Y + P.feed.rest + P.feed.lift * Math.cos(phi);
  out.z = -(clamp(finite(s), -P.feed.maxS, P.feed.maxS) / 2) * Math.sin(phi);
  return out;
}

/** 釜の角（剣先が真上のとき 0）。針が最下点を 20° 過ぎた φ=phiC で剣先が針に来る。歯車比 2:1。 */
export const hookAngle = (phi) => 2 * (phi - P.hook.phiC);
