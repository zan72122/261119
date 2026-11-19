// parcel.js — 段ボールの小包（写実）。テクスチャはすべて Canvas2D で手続き生成。
// 単位はメートル、Y 上。原点は箱の底面中心。
import * as THREE from 'three';

export const PARCEL = { W: 0.36, D: 0.26, H: 0.22, T: 0.004 }; // 幅X, 奥行Z, 高さY, 板厚
export const STICKER_KINDS = ['star', 'heart', 'flower', 'sun', 'rainbow', 'strawberry', 'car', 'balloon'];
export const STICKER_SIZE = 0.056, LABEL_W = 0.11, LABEL_D = 0.075, TAPE_W = 0.048;

const { W, D, H, T } = PARCEL;
const HW = W / 2, HD = D / 2;
const KRAFT_TILE = 0.3;      // 段ボールテクスチャ 1 枚が覆う長さ(m)
const EDGE_TILE = 0.02;      // 切り口テクスチャ 1 枚が覆う長さ(m)
const TAPE_TILE = 0.16;
const STEP = 0.0006;         // 飾りの重なり 1 段ぶんの高さ
const FOLD_NEAR = 0.012, FOLD_DOWN = 0.05;
const LEAF_POSE = { x: 0.112, z: 0.068, r: 0.55 };

// ---------------------------------------------------------------- utilities
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// タイル可能な値ノイズ (0..1)
function tileNoise(N, cells, rand) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * cells, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
    const y0 = iy % cells, y1 = (iy + 1) % cells;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cells, x1 = (ix + 1) % cells;
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      out[y * N + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

// ---------------------------------------------------------------- cached textures
const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

function kraftTexture() {
  return cached('kraft', () => {
    const N = 512, c = makeCanvas(N, N), ctx = c.getContext('2d');
    const r = rng(11);
    const n1 = tileNoise(N, 5, r), n2 = tileNoise(N, 22, r), n3 = tileNoise(N, 90, r);
    const img = ctx.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) {
      const stripe = 0.014 * Math.sin((y / N) * Math.PI * 2 * 64) + 0.008 * Math.sin((y / N) * Math.PI * 2 * 128 + 1.3);
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const m = n1[i] * 0.5 + n2[i] * 0.3 + n3[i] * 0.2 - 0.5;
        const k = 1 + m * 0.2 + (r() - 0.5) * 0.07 + stripe;
        d[i * 4] = Math.min(255, 182 * k); d[i * 4 + 1] = Math.min(255, 138 * k); d[i * 4 + 2] = Math.min(255, 92 * k); d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 紙の繊維
    ctx.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r() * N, y = r() * N, a = r() * Math.PI, l = 2 + r() * 9;
      ctx.strokeStyle = r() < 0.55 ? `rgba(95,62,30,${0.06 + r() * 0.08})` : `rgba(235,205,160,${0.07 + r() * 0.1})`;
      ctx.lineWidth = 0.5 + r() * 0.7;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 2, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 2, x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    // 小さな濃い粒（リサイクル紙の混入物）
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(60,40,20,${0.15 + r() * 0.25})`;
      ctx.fillRect(r() * N, r() * N, 0.8 + r() * 1.2, 0.8 + r() * 1.2);
    }
    return toTex(c, true);
  });
}

function edgeTexture() {
  return cached('edge', () => {
    const w = 128, h = 32, c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#5e4124'; ctx.fillRect(0, 0, w, h);          // 中しんのすき間（影）
    const lg = ctx.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, '#6d4c2b'); lg.addColorStop(0.5, '#7a5631'); lg.addColorStop(1, '#6d4c2b');
    ctx.fillStyle = lg; ctx.fillRect(0, 5, w, h - 10);
    // 波形の中しん
    ctx.strokeStyle = '#c9a272'; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y = h / 2 + Math.sin((x / w) * Math.PI * 2 * 4) * (h / 2 - 6.5);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // ライナー（表裏の紙）
    ctx.fillStyle = '#d2aa78'; ctx.fillRect(0, 0, w, 5); ctx.fillRect(0, h - 5, w, 5);
    ctx.fillStyle = 'rgba(80,50,20,0.35)'; ctx.fillRect(0, 5, w, 1); ctx.fillRect(0, h - 6, w, 1);
    return toTex(c, true);
  });
}

function tapeTexture() {
  return cached('tape', () => {
    const w = 256, h = 64, c = makeCanvas(w, h), ctx = c.getContext('2d');
    const r = rng(5);
    ctx.fillStyle = '#a2703f'; ctx.fillRect(0, 0, w, h);
    // 長手方向の繊維スジ
    for (let i = 0; i < 90; i++) {
      const y = r() * h;
      ctx.strokeStyle = r() < 0.5 ? `rgba(100,62,25,${0.03 + r() * 0.04})` : `rgba(200,150,95,${0.03 + r() * 0.04})`;
      ctx.lineWidth = 0.5 + r();
      ctx.beginPath(); const x = r() * w; ctx.moveTo(x - 40, y); ctx.lineTo(x + 40 + r() * 120, y + (r() - 0.5) * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 40 - w, y); ctx.lineTo(x + 40 + r() * 120 - w, y); ctx.stroke();
    }
    // ふちは少し濃い
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(90,55,20,0.35)'); g.addColorStop(0.08, 'rgba(90,55,20,0)');
    g.addColorStop(0.92, 'rgba(90,55,20,0)'); g.addColorStop(1, 'rgba(90,55,20,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const t = toTex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}

// ---------------------------------------------------------------- stickers
function dieCut(art, size, border) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const sil = makeCanvas(size, size), sctx = sil.getContext('2d');
  sctx.drawImage(art, 0, 0); sctx.globalCompositeOperation = 'source-in';
  const ring = (rad, color) => {
    sctx.globalCompositeOperation = 'source-over'; sctx.clearRect(0, 0, size, size); sctx.drawImage(art, 0, 0);
    sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = color; sctx.fillRect(0, 0, size, size);
    for (let rr = rad; rr > 0; rr -= 3) for (let a = 0; a < 28; a++) {
      const t = (a / 28) * Math.PI * 2; ctx.drawImage(sil, Math.cos(t) * rr, Math.sin(t) * rr);
    }
  };
  ring(border + 1.5, 'rgba(150,150,150,0.9)');
  ring(border, '#fbfbf8');
  ctx.drawImage(art, 0, 0);
  // つやのハイライト（印刷面の上だけ）
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.38, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}
function radial(ctx, x, y, r, c0, c1) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
  g.addColorStop(0, c0); g.addColorStop(1, c1); return g;
}
function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.95);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.1, cx - s * 1.05, cy - s * 0.95, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 1.05, cy - s * 0.95, cx + s * 1.25, cy + s * 0.1, cx, cy + s * 0.95);
  ctx.closePath();
}
function starPath(ctx, cx, cy, R, ri, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? ri : R, a = rot + (i * Math.PI) / n;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}
const STICKER_ART = {
  star(ctx) {
    starPath(ctx, 128, 136, 104, 46);
    ctx.lineJoin = 'round'; ctx.lineWidth = 18; ctx.strokeStyle = '#f2a20c'; ctx.stroke();
    ctx.fillStyle = radial(ctx, 128, 130, 100, '#fff27a', '#f7b500'); ctx.fill();
    starPath(ctx, 128, 136, 70, 31); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
  },
  heart(ctx) {
    heartPath(ctx, 128, 122, 100);
    ctx.fillStyle = radial(ctx, 128, 120, 110, '#ff7c95', '#cf1237'); ctx.fill();
    heartPath(ctx, 128, 122, 80); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  },
  flower(ctx) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      ctx.save(); ctx.translate(128 + Math.cos(a) * 54, 128 + Math.sin(a) * 54); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, 0, 40, 52, 0, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(0, 30, 5, 0, 0, 60); g.addColorStop(0, '#f45c98'); g.addColorStop(1, '#ffc0d9');
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(200,40,110,0.45)'; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(128, 128, 34, 0, Math.PI * 2); ctx.fillStyle = radial(ctx, 128, 128, 34, '#ffe680', '#f2a516'); ctx.fill();
    const r = rng(3); ctx.fillStyle = 'rgba(180,100,10,0.6)';
    for (let i = 0; i < 18; i++) { const a = r() * 6.28, d = r() * 24; ctx.beginPath(); ctx.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2.2, 0, 6.28); ctx.fill(); }
  },
  sun(ctx) {
    ctx.fillStyle = '#ff8f1f';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a - 0.17) * 62, 128 + Math.sin(a - 0.17) * 62);
      ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
      ctx.lineTo(128 + Math.cos(a + 0.17) * 62, 128 + Math.sin(a + 0.17) * 62);
      ctx.closePath(); ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = '#ff8f1f'; ctx.stroke(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(128, 128, 70, 0, Math.PI * 2); ctx.fillStyle = radial(ctx, 128, 128, 70, '#fff07a', '#ffa21a'); ctx.fill();
  },
  rainbow(ctx) {
    const cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#7e57c2'];
    ctx.lineCap = 'butt';
    cols.forEach((col, i) => { ctx.beginPath(); ctx.arc(128, 178, 100 - i * 13, Math.PI, 0); ctx.lineWidth = 13.5; ctx.strokeStyle = col; ctx.stroke(); });
    for (const sx of [-1, 1]) {
      const cx = 128 + sx * 82, cy = 182;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#b9c6d8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx - 22, cy + 4, 20, 0, 6.28); ctx.arc(cx, cy - 10, 26, 0, 6.28); ctx.arc(cx + 22, cy + 4, 20, 0, 6.28);
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy + 14, 40, 12, 0, 0, Math.PI); ctx.fillStyle = 'rgba(170,190,215,0.5)'; ctx.fill();
    }
  },
  strawberry(ctx) {
    ctx.beginPath();
    ctx.moveTo(128, 236);
    ctx.bezierCurveTo(60, 200, 30, 120, 62, 82);
    ctx.bezierCurveTo(90, 56, 166, 56, 194, 82);
    ctx.bezierCurveTo(226, 120, 196, 200, 128, 236);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, 128, 140, 110, '#ff6b6b', '#c3122c'); ctx.fill();
    const body = new Path2D();
    body.moveTo(128, 236); body.bezierCurveTo(60, 200, 30, 120, 62, 82); body.bezierCurveTo(90, 56, 166, 56, 194, 82); body.bezierCurveTo(226, 120, 196, 200, 128, 236);
    const r = rng(9);
    for (let y = 98; y < 220; y += 22) for (let x = 60 + ((y / 22) % 2) * 11; x < 200; x += 24) {
      const xx = x + (r() - 0.5) * 6, yy = y + (r() - 0.5) * 6;
      if (!ctx.isPointInPath(body, xx, yy)) continue;
      ctx.save(); ctx.beginPath(); ctx.ellipse(xx, yy, 3, 5, 0, 0, 6.28); ctx.fillStyle = '#ffe28a'; ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#2f8f3a';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i * Math.PI) / 5;
      ctx.beginPath(); ctx.moveTo(128, 72);
      ctx.quadraticCurveTo(128 + Math.cos(a - 0.3) * 40, 72 + Math.sin(a - 0.3) * 20 + 12, 128 + Math.cos(a) * 58, 72 + Math.abs(Math.sin(a)) * 6 + 16);
      ctx.quadraticCurveTo(128 + Math.cos(a + 0.3) * 40, 72 + 14, 128, 72); ctx.fill();
    }
    ctx.fillStyle = '#3c7a2a'; ctx.fillRect(123, 30, 10, 44);
  },
  car(ctx) {
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    ctx.beginPath(); ctx.moveTo(66, 118); ctx.quadraticCurveTo(84, 68, 120, 66); ctx.lineTo(160, 66); ctx.quadraticCurveTo(182, 68, 196, 118); ctx.closePath();
    ctx.fillStyle = '#d6262d'; ctx.fill();
    rr(18, 112, 222, 64, 26); ctx.fillStyle = radial(ctx, 128, 130, 130, '#ff5a52', '#c1181f'); ctx.fill();
    ctx.fillStyle = '#cfe8ff';
    ctx.beginPath(); ctx.moveTo(84, 116); ctx.quadraticCurveTo(96, 82, 122, 80); ctx.lineTo(124, 116); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(136, 116); ctx.lineTo(136, 80); ctx.lineTo(158, 80); ctx.quadraticCurveTo(172, 84, 180, 116); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe27a'; rr(222, 128, 16, 14, 5); ctx.fill();
    ctx.fillStyle = '#ff9a7a'; rr(18, 128, 12, 12, 4); ctx.fill();
    for (const x of [70, 186]) {
      ctx.beginPath(); ctx.arc(x, 178, 30, 0, 6.28); ctx.fillStyle = '#2b2b2b'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, 178, 13, 0, 6.28); ctx.fillStyle = '#c9c9c9'; ctx.fill();
    }
  },
  balloon(ctx) {
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(126, 176); ctx.bezierCurveTo(100, 200, 156, 214, 124, 244); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(116, 182); ctx.lineTo(140, 182); ctx.lineTo(128, 168); ctx.closePath(); ctx.fillStyle = '#1554b0'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(128, 100, 70, 80, 0, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, 128, 100, 82, '#7cc0ff', '#1557b8'); ctx.fill();
    ctx.beginPath(); ctx.ellipse(100, 66, 12, 22, -0.5, 0, 6.28); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  },
};
export function stickerTexture(kind) {
  return cached('sticker:' + kind, () => {
    const S = 256, art = makeCanvas(S, S), ctx = art.getContext('2d');
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.scale(0.86, 0.86); ctx.translate(-S / 2, -S / 2);
    (STICKER_ART[kind] || STICKER_ART.star)(ctx);
    ctx.restore();
    const t = toTex(dieCut(art, S, 11));
    t.premultiplyAlpha = false;
    return t;
  });
}

// ---------------------------------------------------------------- label
export function labelTexture() {
  return cached('label', () => {
    const w = 384, h = 256, c = makeCanvas(w, h), ctx = c.getContext('2d');
    const r = rng(21);
    ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(120,110,90,${r() * 0.05})`; ctx.fillRect(r() * w, r() * h, 1.5, 1.5); }
    // 赤青の斜めストライプの縁
    const B = 20;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.rect(B, B, w - 2 * B, h - 2 * B); ctx.clip('evenodd');
    const cols = ['#c62828', '#fbfaf5', '#1f4fa0', '#fbfaf5'];
    for (let i = -20, k = 0; i < 60; i++, k++) {
      ctx.fillStyle = cols[((k % 4) + 4) % 4];
      ctx.beginPath(); const x = i * 13;
      ctx.moveTo(x, 0); ctx.lineTo(x + 13, 0); ctx.lineTo(x + 13 - h, h); ctx.lineTo(x - h, h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(B + 0.5, B + 0.5, w - 2 * B - 1, h - 2 * B - 1);
    // 小さな家
    const hx = 58, hy = 92;
    ctx.fillStyle = '#efe0c0'; ctx.fillRect(hx, hy + 30, 100, 76);
    ctx.strokeStyle = '#7b5a3a'; ctx.lineWidth = 3; ctx.strokeRect(hx, hy + 30, 100, 76);
    ctx.fillStyle = '#8d5a33'; ctx.fillRect(hx + 64, hy - 2, 14, 26);
    ctx.beginPath(); ctx.moveTo(hx - 14, hy + 34); ctx.lineTo(hx + 50, hy - 18); ctx.lineTo(hx + 114, hy + 34); ctx.closePath();
    ctx.fillStyle = '#c62828'; ctx.fill(); ctx.strokeStyle = '#8e1b1b'; ctx.stroke();
    ctx.fillStyle = '#8b5e3c'; ctx.fillRect(hx + 14, hy + 62, 24, 44);
    ctx.fillStyle = '#e5c07a'; ctx.beginPath(); ctx.arc(hx + 33, hy + 86, 2.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#bfe2ff'; ctx.fillRect(hx + 56, hy + 50, 30, 26);
    ctx.strokeStyle = '#7b5a3a'; ctx.lineWidth = 3; ctx.strokeRect(hx + 56, hy + 50, 30, 26);
    ctx.beginPath(); ctx.moveTo(hx + 71, hy + 50); ctx.lineTo(hx + 71, hy + 76); ctx.moveTo(hx + 56, hy + 63); ctx.lineTo(hx + 86, hy + 63); ctx.stroke();
    ctx.fillStyle = '#5f9e3c'; ctx.fillRect(hx - 18, hy + 104, 136, 6);
    // ハート
    heartPath(ctx, 196, 92, 22); ctx.fillStyle = '#e53950'; ctx.fill();
    // 宛名欄の罫線（文字なし）
    ctx.strokeStyle = '#cfcac0'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(234, 126 + i * 34); ctx.lineTo(w - 44, 126 + i * 34); ctx.stroke(); }
    return toTex(c);
  });
}

// ---------------------------------------------------------------- maple leaf
function leafTexture() {
  return cached('leaf', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const cx = 128, cy = 142;
    const lobes = [[0, 1], [0.78, 0.92], [-0.78, 0.92], [1.55, 0.72], [-1.55, 0.72], [2.35, 0.42], [-2.35, 0.42]];
    const R = 98;
    const rad = (t) => {
      let v = 0.22;
      for (const [a, l] of lobes) { let d = Math.atan2(Math.sin(t - a), Math.cos(t - a)); v = Math.max(v, 0.2 + l * Math.exp(-(d * d) / (2 * 0.16 * 0.16))); }
      return v + 0.035 * Math.abs(Math.sin(t * 34));
    };
    ctx.beginPath();
    for (let i = 0; i <= 720; i++) {
      const t = (i / 720) * Math.PI * 2, rr = rad(t) * R;
      const x = cx + Math.sin(t) * rr, y = cy - Math.cos(t) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, R);
    g.addColorStop(0, '#9e1a12'); g.addColorStop(0.5, '#cf2a18'); g.addColorStop(1, '#e5591f');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    const r = rng(4);
    for (let i = 0; i < 500; i++) { ctx.fillStyle = r() < 0.5 ? `rgba(90,10,5,${r() * 0.12})` : `rgba(255,150,60,${r() * 0.12})`; ctx.beginPath(); ctx.arc(r() * S, r() * S, 1 + r() * 4, 0, 6.28); ctx.fill(); }
    ctx.strokeStyle = 'rgba(110,15,8,0.65)'; ctx.lineCap = 'round';
    for (const [a, l] of lobes) {
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * R * (l + 0.1), cy - Math.cos(a) * R * (l + 0.1)); ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const f = k / 4 * l * R, px = cx + Math.sin(a) * f, py = cy - Math.cos(a) * f;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.sin(a + s * 0.7) * 16, py - Math.cos(a + s * 0.7) * 16); ctx.stroke(); }
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#7a2a12'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + 4, cy + 50, cx + 14, cy + 96); ctx.stroke();
    return toTex(c);
  });
}

// ---------------------------------------------------------------- geometry builder
class Builder {
  constructor(groups) { this.g = Array.from({ length: groups }, () => ({ p: [], n: [], u: [] })); }
  _v(g, p, n, uv) { const G = this.g[g]; G.p.push(p[0], p[1], p[2]); G.n.push(n[0], n[1], n[2]); G.u.push(uv[0], uv[1]); }
  // p: 4 corners, n: 1 or 4 normals, uv: 4 uvs. Winding is fixed automatically.
  quad(g, p, n, uv) {
    const ns = n.length === 4 && Array.isArray(n[0]) ? n : [n, n, n, n];
    const avg = [0, 1, 2].map((k) => ns[0][k] + ns[1][k] + ns[2][k] + ns[3][k]);
    const e1 = [0, 1, 2].map((k) => p[1][k] - p[0][k]), e2 = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ord = cr[0] * avg[0] + cr[1] * avg[1] + cr[2] * avg[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of ord) this._v(g, p[i], ns[i], uv[i]);
  }
  build() {
    const geo = new THREE.BufferGeometry(), P = [], N = [], U = [];
    let start = 0;
    this.g.forEach((G, i) => {
      P.push(...G.p); N.push(...G.n); U.push(...G.u);
      const cnt = G.p.length / 3; if (cnt) geo.addGroup(start, cnt, i); start += cnt;
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
}
const KU = (a, b) => [a / KRAFT_TILE, b / KRAFT_TILE];

function bodyGeometry() {
  const b = new Builder(3), c = 0.003;
  // 外面（角は 3mm の面取り＋なめらかな法線で丸く）
  for (const s of [1, -1]) {
    const z = s * HD;
    b.quad(0, [[-HW + c, 0, z], [HW - c, 0, z], [HW - c, H, z], [-HW + c, H, z]], [0, 0, s],
      [KU(-HW + c, 0), KU(HW - c, 0), KU(HW - c, H), KU(-HW + c, H)]);
    const x = s * HW;
    b.quad(0, [[x, 0, -HD + c], [x, 0, HD - c], [x, H, HD - c], [x, H, -HD + c]], [s, 0, 0],
      [KU(-HD + c + 0.5, 0), KU(HD - c + 0.5, 0), KU(HD - c + 0.5, H), KU(-HD + c + 0.5, H)]);
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const pA = [sx * (HW - c), 0, sz * HD], pB = [sx * HW, 0, sz * (HD - c)];
    const nA = [0, 0, sz], nB = [sx, 0, 0];
    b.quad(0, [pA, pB, [pB[0], H, pB[2]], [pA[0], H, pA[2]]], [nA, nB, nB, nA], [KU(0, 0), KU(c, 0), KU(c, H), KU(0, H)]);
  }
  b.quad(0, [[-HW, 0, -HD], [HW, 0, -HD], [HW, 0, HD], [-HW, 0, HD]], [0, -1, 0], [KU(-HW, -HD), KU(HW, -HD), KU(HW, HD), KU(-HW, HD)]);
  // 内面
  const iw = HW - T, id = HD - T;
  for (const s of [1, -1]) {
    b.quad(1, [[-iw, T, s * id], [iw, T, s * id], [iw, H, s * id], [-iw, H, s * id]], [0, 0, -s], [KU(-iw, T), KU(iw, T), KU(iw, H), KU(-iw, H)]);
    b.quad(1, [[s * iw, T, -id], [s * iw, T, id], [s * iw, H, id], [s * iw, H, -id]], [-s, 0, 0], [KU(-id, T), KU(id, T), KU(id, H), KU(-id, H)]);
  }
  b.quad(1, [[-iw, T, -id], [iw, T, -id], [iw, T, id], [-iw, T, id]], [0, 1, 0], [KU(-iw, -id), KU(iw, -id), KU(iw, id), KU(-iw, id)]);
  // 上端の切り口（波形断面）
  const E = (u, v) => [u / EDGE_TILE, v];
  for (const s of [1, -1]) {
    b.quad(2, [[-HW + c, H, s * HD], [HW - c, H, s * HD], [iw, H, s * id], [-iw, H, s * id]], [0, 1, 0], [E(-HW, 1), E(HW, 1), E(HW, 0), E(-HW, 0)]);
    b.quad(2, [[s * HW, H, -HD + c], [s * HW, H, HD - c], [s * iw, H, id], [s * iw, H, -id]], [0, 1, 0], [E(-HD, 1), E(HD, 1), E(HD, 0), E(-HD, 0)]);
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const ic = [sx * iw, H, sz * id];
    b.quad(2, [[sx * (HW - c), H, sz * HD], [sx * HW, H, sz * (HD - c)], ic, ic], [0, 1, 0], [E(0, 1), E(0.003, 1), E(0.002, 0), E(0.002, 0)]);
  }
  return b.build();
}

// slab: box from min to max; top face (+y) = mat 0, bottom (−y) = mat 1, sides = mat 2 (corrugated cut)
function slabGeometry(x0, x1, y0, y1, z0, z1, uoff) {
  const b = new Builder(3);
  const k = (x, z) => KU(x + uoff, z);
  b.quad(0, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], [k(x0, z0), k(x1, z0), k(x1, z1), k(x0, z1)]);
  b.quad(1, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [k(x0, z0), k(x1, z0), k(x1, z1), k(x0, z1)]);
  const E = (u, v) => [u / EDGE_TILE, v];
  for (const z of [z0, z1]) b.quad(2, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, z === z0 ? -1 : 1], [E(x0, 0), E(x1, 0), E(x1, 1), E(x0, 1)]);
  for (const x of [x0, x1]) b.quad(2, [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], [x === x0 ? -1 : 1, 0, 0], [E(z0, 0), E(z1, 0), E(z1, 1), E(z0, 1)]);
  return b.build();
}

// ---------------------------------------------------------------- tape geometry
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const EDGES = [
  { n: [1, 0], d: HW, other: HD }, { n: [-1, 0], d: HW, other: HD },
  { n: [0, 1], d: HD, other: HW }, { n: [0, -1], d: HD, other: HW },
];
// 端点 p(2D) から outward 方向に見て、近くの縁があれば折り返し情報を返す
function findFold(p, out) {
  let best = null;
  for (const e of EDGES) {
    const dn = out[0] * e.n[0] + out[1] * e.n[1];
    if (dn < 0.3) continue;
    const pn = p[0] * e.n[0] + p[1] * e.n[1];
    const gap = e.d - pn;
    if (gap > FOLD_NEAR) continue;
    if (!best || gap < best.gap) best = { e, gap, dn };
  }
  return best;
}
function tapeGeometry(seg, lift, rand) {
  const top = 2 * T + lift;
  let p0 = [seg.x0, seg.z0], p1 = [seg.x1, seg.z1];
  let dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz);
  if (len < 1e-5) { dx = 1; dz = 0; len = 1; }
  const dir = [dx / len, dz / len], perp = [-dir[1], dir[0]];
  const hwid = TAPE_W / 2, R = 0.0022;
  const clampP = (p) => [THREE.MathUtils.clamp(p[0], -HW, HW), THREE.MathUtils.clamp(p[1], -HD, HD)];
  // 各端の断面列（外→内の順）を作る
  const endSections = (p, out) => {
    const f = findFold(p, out);
    if (!f) { const q = clampP(p); return [{ c: V3(q[0], top, q[1]), s: V3(perp[0] * hwid, 0, perp[1] * hwid), n: V3(0, 1, 0) }]; }
    const { e, dn } = f;
    // 縁の線との交点（縁の R 手前）
    const pn = p[0] * e.n[0] + p[1] * e.n[1];
    const tHit = (e.d - R - pn) / dn;
    let q = [p[0] + out[0] * tHit, p[1] + out[1] * tHit];
    const along = [-e.n[1], e.n[0]];
    const pa = perp[0] * along[0] + perp[1] * along[1];
    const k = (hwid / Math.max(Math.abs(pa), 0.3)) * Math.sign(pa || 1);
    const sv = V3(along[0] * k, 0, along[1] * k);
    // 縁に沿った位置を箱の範囲に収める
    let a = q[0] * along[0] + q[1] * along[1];
    a = THREE.MathUtils.clamp(a, -e.other + 0.004, e.other - 0.004);
    const nn = (e.d - R);
    q = [e.n[0] * nn + along[0] * a, e.n[1] * nn + along[1] * a];
    const N = V3(e.n[0], 0, e.n[1]);
    const cTop = V3(q[0], top, q[1]);
    const cBev = cTop.clone().addScaledVector(N, R + lift * 0.7).add(V3(0, -R - lift * 0.3, 0));
    const cBev2 = cTop.clone().addScaledVector(N, R + lift).add(V3(0, -R * 2.2, 0));
    const cDown = cTop.clone().addScaledVector(N, R + lift).add(V3(0, -FOLD_DOWN, 0));
    const n45 = V3(e.n[0], 1, e.n[1]).normalize();
    return [
      { c: cDown, s: sv, n: N.clone() },
      { c: cBev2, s: sv, n: N.clone() },
      { c: cBev, s: sv, n: n45 },
      { c: cTop, s: sv, n: V3(0, 1, 0) },
    ];
  };
  const a = endSections(p0, [-dir[0], -dir[1]]);
  const bsec = endSections(p1, dir).reverse();
  const secs = a.concat(bsec);
  // 全体の順序: start外端 → ... → end外端
  const P = [], Nn = [], U = [];
  let ulen = 0;
  const pushV = (p, n, u, v) => { P.push(p.x, p.y, p.z); Nn.push(n.x, n.y, n.z); U.push(u, v); };
  const L = (s) => s.c.clone().add(s.s), Rr = (s) => s.c.clone().sub(s.s);
  // 帯の表向き確認用: 上向き断面での cross
  for (let i = 0; i < secs.length - 1; i++) {
    const s0 = secs[i], s1 = secs[i + 1];
    const u0 = ulen / TAPE_TILE; ulen += s0.c.distanceTo(s1.c); const u1 = ulen / TAPE_TILE;
    const quad = [[L(s0), s0.n, u0, 1], [Rr(s0), s0.n, u0, 0], [Rr(s1), s1.n, u1, 0], [L(s1), s1.n, u1, 1]];
    const e1 = quad[1][0].clone().sub(quad[0][0]), e2 = quad[2][0].clone().sub(quad[0][0]);
    const nAvg = s0.n.clone().add(s1.n);
    const ok = e1.clone().cross(e2).dot(nAvg) >= 0;
    const ord = ok ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const j of ord) pushV(quad[j][0], quad[j][1], quad[j][2], quad[j][3]);
  }
  // ギザギザの端
  const teeth = (s, inner, uAt) => {
    const t = s.c.clone().sub(inner.c).normalize();
    const n = 9, amp = 0.0022;
    for (let i = 0; i < n; i++) {
      const fa = i / n, fb = (i + 1) / n;
      const pa = L(s).lerp(Rr(s), fa), pb = L(s).lerp(Rr(s), fb);
      const tip = pa.clone().lerp(pb, 0.5).addScaledVector(t, amp * (0.6 + rand() * 0.8));
      const tri = [[pa, 1 - fa], [pb, 1 - fb], [tip, 1 - (fa + fb) / 2]];
      const e1 = pb.clone().sub(pa), e2 = tip.clone().sub(pa);
      const ord = e1.cross(e2).dot(s.n) >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const j of ord) pushV(tri[j][0], s.n, uAt, tri[j][1]);
    }
  };
  teeth(secs[0], secs[1], 0);
  teeth(secs[secs.length - 1], secs[secs.length - 2], ulen / TAPE_TILE);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

// ---------------------------------------------------------------- createParcel
export function createParcel(pstate) {
  if (!pstate.tapes) pstate.tapes = [];
  if (!pstate.stickers) pstate.stickers = [];
  if (pstate.label === undefined) pstate.label = null;

  const own = { geos: [], mats: [] };
  const G = (g) => (own.geos.push(g), g), M = (m) => (own.mats.push(m), m);

  const kraft = kraftTexture();
  const matOuter = M(new THREE.MeshStandardMaterial({ map: kraft, bumpMap: kraft, bumpScale: 0.6, roughness: 0.88, metalness: 0 }));
  const matInner = M(new THREE.MeshStandardMaterial({ map: kraft, bumpMap: kraft, bumpScale: 0.6, color: 0xb59c80, roughness: 0.92 }));
  const matEdge = M(new THREE.MeshStandardMaterial({ map: edgeTexture(), roughness: 0.95 }));
  const boxMats = [matOuter, matInner, matEdge];
  const decorCommon = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
  const matTape = M(new THREE.MeshStandardMaterial({ map: tapeTexture(), roughness: 0.38, ...decorCommon }));
  const matLabel = M(new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.75, ...decorCommon }));
  const stickerMats = {};
  const stickerMat = (k) => stickerMats[k] || (stickerMats[k] = M(new THREE.MeshPhysicalMaterial({
    map: stickerTexture(k), alphaTest: 0.5, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12, ...decorCommon,
  })));
  const matLeaf = M(new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide, ...decorCommon }));

  const flatPlane = (w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return G(g); };
  const geoLabel = flatPlane(LABEL_W, LABEL_D);
  const geoSticker = flatPlane(STICKER_SIZE, STICKER_SIZE);
  const geoLeaf = (() => {
    const g = new THREE.PlaneGeometry(0.072, 0.072, 6, 6); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 0.0015 + (x * x) * 1.6 + Math.max(0, -z) * 0.04 + z * z * 0.6); }
    g.computeVertexNormals(); return G(g);
  })();

  const group = new THREE.Group(); group.name = 'parcel';
  const body = new THREE.Mesh(G(bodyGeometry()), boxMats);
  body.castShadow = true; body.receiveShadow = true; group.add(body);

  const flaps = {};
  const mkFlap = (name, pos, geo) => {
    const pivot = new THREE.Group(); pivot.name = 'flap' + name; pivot.position.copy(pos);
    const m = new THREE.Mesh(G(geo), boxMats); m.castShadow = true; m.receiveShadow = true; m.userData.kind = 'flap'; m.userData.flap = name;
    pivot.add(m); group.add(pivot);
    flaps[name] = { pivot, t: 1, mesh: m };
  };
  const g1 = 0.0012;
  mkFlap('F', V3(0, H, HD), slabGeometry(-HW + g1, HW - g1, T, 2 * T, -(HD - g1), 0, 0.1));
  mkFlap('B', V3(0, H, -HD), slabGeometry(-HW + g1, HW - g1, T, 2 * T, 0, HD - g1, 0.37));
  mkFlap('L', V3(-HW, H, 0), slabGeometry(0, HD - g1 * 2, 0, T, -HD + 0.002, HD - 0.002, 0.21));
  mkFlap('R', V3(HW, H, 0), slabGeometry(-(HD - g1 * 2), 0, 0, T, -HD + 0.002, HD - 0.002, 0.53));

  function setFlap(name, t) {
    const f = flaps[name]; if (!f) return;
    t = THREE.MathUtils.clamp(t, 0, 1.25); f.t = t;
    const a = 2.0 * t;
    const r = f.pivot.rotation; r.set(0, 0, 0);
    if (name === 'F') r.x = a; else if (name === 'B') r.x = -a; else if (name === 'L') r.z = a; else r.z = -a;
  }

  const top = new THREE.Group(); top.name = 'parcelTop'; top.position.set(0, H, 0); group.add(top);

  const parcel = {
    group, flaps, top, setFlap,
    tapeMeshes: [], stickerMeshes: [], labelMesh: null, leafMesh: null,
    innerY: T, innerW: W - 2 * T, innerD: D - 2 * T,
    pstate,
  };
  const trand = rng(77);

  // 層の高さ: テープ < ラベル < シール < 葉
  function relayer() {
    const nt = parcel.tapeMeshes.length;
    const base = 2 * T + 0.0004;
    const ly = base + nt * STEP + STEP;
    if (parcel.labelMesh && parcel.labelMesh.parent === top) parcel.labelMesh.position.y = ly;
    parcel.stickerMeshes.forEach((m, j) => { if (m.parent === top) m.position.y = ly + STEP * (j + 1); });
    if (parcel.leafMesh && parcel.leafMesh.parent === top) parcel.leafMesh.position.y = ly + STEP * (parcel.stickerMeshes.length + 1);
  }
  function tapeLift(i) { return 0.0004 + i * STEP; }
  function makeTapeMesh(seg, i) {
    const m = new THREE.Mesh(tapeGeometry(seg, tapeLift(i), trand), matTape);
    m.receiveShadow = true; m.userData = { kind: 'tape', index: i };
    return m;
  }
  function reindex() {
    parcel.tapeMeshes.forEach((m, i) => { m.userData.index = i; });
    parcel.stickerMeshes.forEach((m, i) => { m.userData.index = i; });
  }

  parcel.addTape = (seg) => {
    const s = { x0: seg.x0, z0: seg.z0, x1: seg.x1, z1: seg.z1 };
    pstate.tapes.push(s);
    const i = pstate.tapes.length - 1;
    const m = makeTapeMesh(s, i); top.add(m); parcel.tapeMeshes.push(m);
    relayer(); return i;
  };
  parcel.updateTape = (i, seg) => {
    const m = parcel.tapeMeshes[i]; if (!m) return;
    const s = { x0: seg.x0, z0: seg.z0, x1: seg.x1, z1: seg.z1 };
    pstate.tapes[i] = s;
    m.geometry.dispose(); m.geometry = tapeGeometry(s, tapeLift(i), trand);
  };
  parcel.removeTape = (i) => {
    const m = parcel.tapeMeshes[i]; if (!m) return;
    pstate.tapes.splice(i, 1); parcel.tapeMeshes.splice(i, 1);
    m.removeFromParent(); m.geometry.dispose();
    // 重なり高さを詰める
    parcel.tapeMeshes.forEach((mm, j) => { if (j >= i) { mm.geometry.dispose(); mm.geometry = tapeGeometry(pstate.tapes[j], tapeLift(j), trand); } });
    reindex(); relayer();
  };

  parcel.setLabel = (lab) => {
    if (parcel.labelMesh) { parcel.labelMesh.removeFromParent(); parcel.labelMesh = null; }
    pstate.label = lab ? { x: lab.x, z: lab.z, r: lab.r || 0 } : null;
    if (lab) {
      const m = new THREE.Mesh(geoLabel, matLabel);
      m.position.set(lab.x, 0, lab.z); m.rotation.y = lab.r || 0;
      m.receiveShadow = true; m.userData = { kind: 'label' };
      top.add(m); parcel.labelMesh = m;
    }
    relayer();
  };

  parcel.addSticker = (st) => {
    const s = { k: STICKER_KINDS.includes(st.k) ? st.k : STICKER_KINDS[0], x: st.x, z: st.z, r: st.r || 0 };
    pstate.stickers.push(s);
    const i = pstate.stickers.length - 1;
    const m = new THREE.Mesh(geoSticker, stickerMat(s.k));
    m.position.set(s.x, 0, s.z); m.rotation.y = s.r;
    m.receiveShadow = true; m.userData = { kind: 'sticker', index: i, k: s.k };
    top.add(m); parcel.stickerMeshes.push(m);
    relayer(); return i;
  };
  parcel.removeSticker = (i) => {
    const m = parcel.stickerMeshes[i]; if (!m) return;
    pstate.stickers.splice(i, 1); parcel.stickerMeshes.splice(i, 1);
    m.removeFromParent(); reindex(); relayer();
  };

  parcel.setLeaf = (on) => {
    pstate.leaf = !!on;
    if (parcel.leafMesh) { parcel.leafMesh.removeFromParent(); parcel.leafMesh = null; }
    if (on) {
      const m = new THREE.Mesh(geoLeaf, matLeaf);
      m.position.set(LEAF_POSE.x, 0, LEAF_POSE.z); m.rotation.y = LEAF_POSE.r;
      m.castShadow = true; m.receiveShadow = true; m.userData = { kind: 'leaf' };
      top.add(m); parcel.leafMesh = m;
    }
    relayer();
  };

  parcel.rebuild = () => {
    for (const m of parcel.tapeMeshes) { m.removeFromParent(); m.geometry.dispose(); }
    for (const m of parcel.stickerMeshes) m.removeFromParent();
    if (parcel.labelMesh) parcel.labelMesh.removeFromParent();
    if (parcel.leafMesh) parcel.leafMesh.removeFromParent();
    parcel.tapeMeshes = []; parcel.stickerMeshes = []; parcel.labelMesh = null; parcel.leafMesh = null;
    const tapes = pstate.tapes.slice(), stickers = pstate.stickers.slice();
    pstate.tapes.length = 0; pstate.stickers.length = 0;
    for (const s of tapes) parcel.addTape(s);
    parcel.setLabel(pstate.label);
    for (const s of stickers) parcel.addSticker(s);
    parcel.setLeaf(!!pstate.leaf);
    const t = pstate.closed ? 0 : 1;
    for (const n of ['F', 'B', 'L', 'R']) setFlap(n, t);
  };

  parcel.bindDecorToFlaps = () => {
    group.updateMatrixWorld(true);
    const list = [...parcel.stickerMeshes];
    if (parcel.labelMesh) list.push(parcel.labelMesh);
    if (parcel.leafMesh) list.push(parcel.leafMesh);
    for (const m of list) {
      if (m.parent !== top) continue;
      const f = m.position.z >= 0 ? flaps.F : flaps.B;
      f.pivot.attach(m);
    }
  };

  parcel.dispose = () => {
    for (const m of parcel.tapeMeshes) m.geometry.dispose();
    for (const g of own.geos) g.dispose();
    for (const m of own.mats) m.dispose();
    group.removeFromParent();
  };

  parcel.rebuild();
  return parcel;
}
