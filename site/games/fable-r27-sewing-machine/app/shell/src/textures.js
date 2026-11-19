// テクスチャ：window.__TEXTURES__（data URI、tools/build-textures.sh が作る）から読む。
// file:// の <img> は WebGL に渡せない（Chrome）が、data URI なら渡せる。

export function loadTextures(THREE, renderer, { timeoutMs = 2500, defer = [] } = {}) {
  const src = window.__TEXTURES__ || {};
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const out = {};
  const waits = [];
  const later = [];
  for (const [key, url] of Object.entries(src)) {
    const tex = new THREE.Texture();
    tex.name = key;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = aniso;
    out[key] = tex;
    const start = () => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { tex.image = img; tex.needsUpdate = true; resolve(); };
      img.onerror = () => { console.error('texture failed: ' + key); resolve(); };
      img.src = url;
    });
    // 最初の場面で使わないもの（4 回目の小花の布など）は、最初の描画の後に展開する
    if (defer.includes(key)) later.push(start); else waits.push(start());
  }
  const all = Promise.all(waits);
  const timeout = new Promise((r) => setTimeout(r, timeoutMs));
  return Promise.race([all, timeout]).then(() => {
    Object.defineProperty(out, 'loadDeferred', { enumerable: false, value: () => Promise.all(later.splice(0).map((f) => f())) });
    return out;
  });
}

/** 手続き Canvas テクスチャ（写真が無い物の代わり）。 */
export function canvasTexture(THREE, w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** ぼかし円（疑似影）。 */
export function blobShadowTexture(THREE) {
  return canvasTexture(THREE, 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(60,35,25,0.55)');
    grd.addColorStop(0.55, 'rgba(60,35,25,0.28)');
    grd.addColorStop(1, 'rgba(60,35,25,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { srgb: false });
}

/** 窓の外：空のグラデーション・雲・丘。 */
export function skyTexture(THREE) {
  return canvasTexture(THREE, 256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#a9d8f2'); grd.addColorStop(0.7, '#e4f3f8'); grd.addColorStop(1, '#fff6e6');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    const cloud = (x, y, s) => { for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.85, 0.2, 0.7], [0.3, -0.45, 0.7]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); } };
    cloud(70, 70, 18); cloud(185, 105, 14); cloud(130, 40, 10);
    g.fillStyle = '#b9dfa0'; g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(70, 165, 140, 200); g.quadraticCurveTo(200, 170, 256, 185); g.lineTo(256, 256); g.fill();
    g.fillStyle = '#9fd18a'; g.beginPath(); g.moveTo(0, 215); g.quadraticCurveTo(110, 190, 256, 230); g.lineTo(256, 256); g.lineTo(0, 256); g.fill();
  });
}
