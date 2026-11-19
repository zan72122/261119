// hero が自分で描く 1 枚だけの Canvas テクスチャ（1024×512）。文字・数字は描かない。
//   左半分：模様ダイヤル（波・星・ハートの絵）　右半分：カバーの塗りと縫い目の飾り
import { TAU } from './kinematics.js';

export const ATLAS = { W: 1024, H: 512, coverScale: 512 / 0.444, coverX0: -0.227, coverY1: 0.297, stripRow: 300, flatUV: [0.75, 0.08] };
export const INK = { pink: '#f6b8c8', deep: '#ee7fa0', cream: '#fff6e4', white: '#fffaf2', mint: '#9edfcf' };

/** カバー上の世界座標 (x, y) → アトラスの UV */
export const coverUV = (x, y) => [(512 + (x - ATLAS.coverX0) * ATLAS.coverScale) / ATLAS.W, 1 - ((ATLAS.coverY1 - y) * ATLAS.coverScale) / ATLAS.H];
/** 台の前板の世界座標 (x, y) → 飾り帯の UV */
export const stripUV = (x, y) => [(512 + 20 + (x + 0.049) * ATLAS.coverScale) / ATLAS.W, 1 - (ATLAS.stripRow + (0.044 - y) * ATLAS.coverScale) / ATLAS.H];

const heartPts = (s) => { const p = []; for (let j = 0; j <= 28; j++) { const t = (TAU * j) / 28; p.push([s * 16 * Math.sin(t) ** 3, -s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); } return p; };
const starPts = (ro, ri) => { const p = []; for (let j = 0; j <= 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5, r = j % 2 ? ri : ro; p.push([r * Math.cos(a), r * Math.sin(a)]); } return p; };
const wavePts = (w, h) => { const p = []; for (let j = 0; j <= 32; j++) p.push([-w + (2 * w * j) / 32, -h * Math.sin((TAU * 1.5 * j) / 32)]); return p; };

function stroke(ctx, pts, color, width, dash) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
}
function flower(ctx, x, y, r, petal, center) {
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, 0, TAU); ctx.fillStyle = petal; ctx.fill(); }
  ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, TAU); ctx.fillStyle = center; ctx.fill();
}

/**
 * @param coverOutline カバーの外形（世界座標の [x,y] の列）。飾りの縫い目をこの形の内側に描く。
 * @param threadColors 模様ごとの糸の色（CSS 文字列 ×3）
 */
export function makeAtlas(THREE, coverOutline, threadColors, maxSize = 1024) {
  const canvas = document.createElement('canvas');
  const k = Math.min(1, maxSize / ATLAS.W);
  canvas.width = Math.round(ATLAS.W * k); canvas.height = Math.round(ATLAS.H * k);
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);

  // ---- 左：模様ダイヤル ----
  ctx.fillStyle = INK.cream; ctx.fillRect(0, 0, 512, 512);
  ctx.beginPath(); ctx.arc(256, 256, 246, 0, TAU); ctx.strokeStyle = INK.deep; ctx.lineWidth = 12; ctx.stroke();
  ctx.beginPath(); ctx.arc(256, 256, 226, 0, TAU); ctx.strokeStyle = INK.pink; ctx.lineWidth = 5; ctx.setLineDash([12, 10]); ctx.stroke(); ctx.setLineDash([]);
  const icons = [wavePts(58, 20), starPts(58, 25), heartPts(3.3)];
  const pads = ['#d6eefc', '#fff1bd', '#ffdbe6'];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 - (i * TAU) / 3, cx = 256 + 132 * Math.cos(a), cy = 256 - 132 * Math.sin(a);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 2 - a);
    ctx.beginPath(); ctx.arc(0, 0, 90, 0, TAU); ctx.fillStyle = pads[i]; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK.white; ctx.stroke();
    stroke(ctx, icons[i], threadColors[i], 13);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(256, 256, 30, 0, TAU); ctx.fillStyle = INK.pink; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK.white; ctx.stroke();

  // ---- 右：カバー ----
  ctx.fillStyle = INK.pink; ctx.fillRect(512, 0, 512, 512);
  const S = ATLAS.coverScale, X = (x) => 512 + (x - ATLAS.coverX0) * S, Y = (y) => (ATLAS.coverY1 - y) * S;
  // 外形の内側をなぞる縫い目（外形を中心へ少し縮めて描く）
  let cx = 0, cy = 0; coverOutline.forEach(([x, y]) => { cx += x; cy += y; }); cx /= coverOutline.length; cy /= coverOutline.length;
  const inset = coverOutline.map(([x, y]) => [X(x + Math.sign(cx - x) * 0.009), Y(y + Math.sign(cy - y) * 0.009)]);
  stroke(ctx, inset.concat([inset[0]]), INK.white, 3.2, [9, 7]);
  // 腕の真ん中：縫い目のハートと小花
  const hx = X(0.035), hy = Y(0.238);
  stroke(ctx, heartPts(1.7).map(([x, y]) => [hx + x, hy + y + 4]), INK.white, 3.4, [8, 6]);
  flower(ctx, X(-0.045), Y(0.236), 17, INK.white, '#ffd98a');
  flower(ctx, X(0.115), Y(0.236), 17, INK.white, '#ffd98a');
  flower(ctx, X(0.17), Y(0.115), 20, INK.white, '#ffd98a');
  for (const [x, y] of [[-0.005, 0.262], [0.075, 0.262], [-0.005, 0.208], [0.075, 0.208], [0.17, 0.165], [0.17, 0.068]]) { ctx.beginPath(); ctx.arc(X(x), Y(y), 4.5, 0, TAU); ctx.fillStyle = INK.white; ctx.fill(); }
  // 台の前板の飾り帯
  const r0 = ATLAS.stripRow;
  stroke(ctx, [[512 + 30, r0 + 25], [512 + 20 + 0.288 * S - 10, r0 + 25]], INK.white, 3.2, [9, 7]);
  for (let i = 0; i < 4; i++) flower(ctx, 512 + 20 + (0.045 + i * 0.066) * S, r0 + 25, 11, INK.white, '#ffd98a');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.name = 'hero-atlas';
  return tex;
}
