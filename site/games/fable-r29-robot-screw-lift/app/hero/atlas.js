// hero の自作テクスチャ（Canvas 512² 1枚）。ロボットの顔（表情 4 つ）と、小さな絵（ハート・星・矢印・しま模様など）。
// 文字・数字は描かない。塗装の材質はこの 1 枚を map に持ち、絵の無い面は白のマスを指す（色は頂点カラー）。

const SIZE = 512;
const CELLS = {
  // 顔：256×128
  faceNeutral: [0, 0, 256, 128], faceBlink: [256, 0, 256, 128], faceHappy: [0, 128, 256, 128], faceAsk: [256, 128, 256, 128],
  // 絵：128×128
  white: [0, 256, 128, 128], heart: [128, 256, 128, 128], star: [256, 256, 128, 128], arrow: [384, 256, 128, 128],
  stripes: [0, 384, 128, 128], buttons: [128, 384, 128, 128], down: [256, 384, 128, 128], paw: [384, 384, 128, 128],
};

function drawFace(g, x, y, kind) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#17233f';
  g.fillRect(0, 0, 256, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(90,140,220,0.35)');
  grd.addColorStop(1, 'rgba(10,20,50,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  const eye = '#7df3ff', line = '#7df3ff';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // ほっぺ
  g.fillStyle = 'rgba(255,130,170,0.85)';
  for (const cx of [44, 212]) { g.beginPath(); g.ellipse(cx, 88, 17, 10, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = eye; g.strokeStyle = line;
  const ex = [84, 172];
  if (kind === 'neutral' || kind === 'ask') {
    for (const cx of ex) {
      g.beginPath(); g.ellipse(cx, 52, kind === 'ask' ? 19 : 17, kind === 'ask' ? 25 : 23, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx - 6, 43, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = eye;
    }
  } else if (kind === 'blink') {
    g.lineWidth = 8;
    for (const cx of ex) { g.beginPath(); g.moveTo(cx - 17, 54); g.lineTo(cx + 17, 54); g.stroke(); }
  } else { // happy：にっこり目（山形）
    g.lineWidth = 9;
    for (const cx of ex) { g.beginPath(); g.arc(cx, 62, 18, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); }
  }
  // 口
  g.lineWidth = 7;
  if (kind === 'ask') { g.beginPath(); g.ellipse(128, 96, 9, 11, 0, 0, Math.PI * 2); g.stroke(); }
  else if (kind === 'happy') {
    g.beginPath(); g.moveTo(104, 86); g.quadraticCurveTo(128, 122, 152, 86); g.closePath();
    g.fillStyle = '#ff9db8'; g.fill(); g.stroke();
  } else { g.beginPath(); g.arc(128, 82, 20, Math.PI * 0.18, Math.PI * 0.82); g.stroke(); }
  g.restore();
}

function heartPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + 0.9 * s);
  g.bezierCurveTo(cx - 1.5 * s, cy - 0.1 * s, cx - 0.8 * s, cy - 1.1 * s, cx, cy - 0.35 * s);
  g.bezierCurveTo(cx + 0.8 * s, cy - 1.1 * s, cx + 1.5 * s, cy - 0.1 * s, cx, cy + 0.9 * s);
  g.closePath();
}

function starPath(g, cx, cy, ro, ri, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    if (i) g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); else g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  g.closePath();
}

export function createAtlas(THREE, tier) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, SIZE, SIZE);

  drawFace(g, 0, 0, 'neutral');
  drawFace(g, 256, 0, 'blink');
  drawFace(g, 0, 128, 'happy');
  drawFace(g, 256, 128, 'ask');

  const cell = (name) => { const [x, y, w, h] = CELLS[name]; return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }; };
  // ハート
  let k = cell('heart');
  g.fillStyle = '#ff5f8f'; heartPath(g, k.cx, k.cy - 2, 40); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(k.cx - 20, k.cy - 22, 9, 6, -0.6, 0, Math.PI * 2); g.fill();
  // 星
  k = cell('star');
  g.fillStyle = '#ffc928'; starPath(g, k.cx, k.cy + 3, 52, 23); g.fill();
  // くるっと矢印（時計回り）
  k = cell('arrow');
  g.strokeStyle = '#6b3d12'; g.fillStyle = '#6b3d12'; g.lineWidth = 15; g.lineCap = 'round';
  g.beginPath(); g.arc(k.cx, k.cy, 36, Math.PI * 0.75, Math.PI * 2.2); g.stroke();
  { const a = Math.PI * 2.2, px = k.cx + 36 * Math.cos(a), py = k.cy + 36 * Math.sin(a);
    g.save(); g.translate(px, py); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(22, 0); g.lineTo(-8, -22); g.lineTo(-8, 22); g.closePath(); g.fill(); g.restore(); }
  // しま模様
  k = cell('stripes');
  g.save(); g.beginPath(); g.rect(k.x, k.y, k.w, k.h); g.clip();
  g.fillStyle = '#ffd23c'; g.fillRect(k.x, k.y, k.w, k.h);
  g.fillStyle = '#3a4250';
  for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(k.x + i * 32, k.y + 128); g.lineTo(k.x + i * 32 + 16, k.y + 128); g.lineTo(k.x + i * 32 + 144, k.y); g.lineTo(k.x + i * 32 + 128, k.y); g.closePath(); g.fill(); }
  g.restore();
  // ロボットのおなかのボタン
  k = cell('buttons');
  g.fillStyle = '#e7edf5'; g.fillRect(k.x, k.y, k.w, k.h);
  [['#ff7fa6', 30], ['#ffd640', 64], ['#54c8c0', 98]].forEach(([col, px]) => {
    g.fillStyle = '#b9c4d2'; g.beginPath(); g.arc(k.x + px, k.y + 46, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(k.x + px, k.y + 44, 12, 0, Math.PI * 2); g.fill();
  });
  g.strokeStyle = '#9aa7b8'; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(k.x + 28, k.y + 82 + i * 14); g.lineTo(k.x + 100, k.y + 82 + i * 14); g.stroke(); }
  // 下向き矢印
  k = cell('down');
  g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff';
  g.fillStyle = '#7a1f1a';
  g.beginPath(); g.moveTo(k.cx - 16, k.y + 16); g.lineTo(k.cx + 16, k.y + 16); g.lineTo(k.cx + 16, k.cy + 6); g.lineTo(k.cx + 42, k.cy + 6);
  g.lineTo(k.cx, k.y + 114); g.lineTo(k.cx - 42, k.cy + 6); g.lineTo(k.cx - 16, k.cy + 6); g.closePath(); g.fill();
  // 肉球（くまの足うら）
  k = cell('paw');
  g.fillStyle = '#ffb3c7';
  g.beginPath(); g.ellipse(k.cx, k.cy + 16, 30, 24, 0, 0, Math.PI * 2); g.fill();
  for (const [dx, dy] of [[-32, -18], [-11, -36], [11, -36], [32, -18]]) { g.beginPath(); g.arc(k.cx + dx, k.cy + dy, 10, 0, Math.PI * 2); g.fill(); }

  const texture = new THREE.CanvasTexture(c);
  texture.name = 'hero-atlas512';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = (tier && tier.anisotropy) || 1;

  const rect = (name, inset = 3) => {
    const [x, y, w, h] = CELLS[name];
    return [(x + inset) / SIZE, 1 - (y + h - inset) / SIZE, (x + w - inset) / SIZE, 1 - (y + inset) / SIZE];
  };
  const w = CELLS.white;
  return {
    texture,
    white: [(w[0] + w[2] / 2) / SIZE, 1 - (w[1] + w[3] / 2) / SIZE],
    rect,
    faceRepeat: [256 / SIZE, 128 / SIZE],
    faceOffset: (name) => { const [x, y, , h] = CELLS[name]; return [x / SIZE, 1 - (y + h) / SIZE]; },
  };
}
