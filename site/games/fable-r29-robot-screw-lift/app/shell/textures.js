// テクスチャの読み込み（同梱 JPEG）と手続き Canvas テクスチャ。
// file:// では画像を WebGL に渡せないので、assets/textures-data.js の data URI を使う。

export const TEXTURE_FILES = {
  envSky: 'env/sky_clouds_512.jpg',
  envFloor: 'env/workshop_floor_512.jpg',
  envWood: 'env/wood_planks_512.jpg',
  envMetal: 'env/painted_metal_512.jpg',
  heroBrass: 'hero/brass_threaded_1024.jpg',
  heroMetal: 'hero/painted_metal_1024.jpg',
  heroWood: 'hero/wood_planks_1024.jpg',
};

// 画像が届く前に clone したテクスチャ：clone は version 1・画像なしになり、three が毎フレーム
// 「Texture marked for update but no image data found」と警告する。届くまでは version 0 で待たせ、届いたら更新を指示する。
const pendingClones = new WeakMap();
export function cloneTexture(tex) {
  const t = tex.clone();
  if (!tex.image) {
    t.version = 0;
    let list = pendingClones.get(tex);
    if (!list) pendingClones.set(tex, (list = []));
    list.push(t);
  }
  return t;
}
function flushClones(tex) {
  const list = pendingClones.get(tex);
  if (!list) return;
  for (const c of list) c.needsUpdate = true;
  pendingClones.delete(tex);
}

export function loadTextures(THREE, tier, onError) {
  const embedded = window.__R29_TEX || null;
  const out = {};
  let pending = 0;
  const ready = [];
  for (const [key, file] of Object.entries(TEXTURE_FILES)) {
    const tex = new THREE.Texture();
    tex.name = file;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = tier.anisotropy;
    tex.userData.size = file.includes('1024') ? 1024 : 512; // 読み込み前の見積もり用
    const img = new Image();
    img.decoding = 'async';
    pending++;
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
      flushClones(tex);
      pending--;
      if (pending === 0) ready.forEach((f) => f());
    };
    img.onerror = () => {
      pending--;
      onError && onError(new Error('texture load failed: ' + file));
      if (pending === 0) ready.forEach((f) => f());
    };
    img.src = embedded && embedded[file] ? embedded[file] : 'assets/' + file;
    out[key] = tex;
  }
  out.whenReady = (f) => { if (pending === 0) f(); else ready.push(f); };
  return out;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 疑似影：黒→透明の放射グラデーション 64²
export function makeBlobTexture(THREE) {
  const c = canvas(64, 64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.name = 'blob64';
  return t;
}

// 漆喰の壁 256²（クリーム色、細かなむら）
export function makePlasterTexture(THREE) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#efe3cf'; g.fillRect(0, 0, 256, 256);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 1 + rnd() * 5;
    const v = rnd() < 0.5 ? 255 : 200;
    g.fillStyle = `rgba(${v},${v - 12},${v - 30},${0.04 + rnd() * 0.05})`;
    // 継ぎ目なしにするため、端をまたぐ点は反対側にも描く
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      const px = x + dx, py = y + dy;
      if (px < -r || px > 256 + r || py < -r || py > 256 + r) continue;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.name = 'plaster256';
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 環境光（PMREM の元）256×128：上は明るい空色、窓の明るい四角、下は木の床色
export function makeEnvEquirect(THREE) {
  const c = canvas(256, 128), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#f4f1ea');
  grd.addColorStop(0.45, '#d9cdb8');
  grd.addColorStop(0.55, '#a88d6c');
  grd.addColorStop(1, '#5d4a38');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  // 窓（-Z 方向 = 経度の中央付近）
  g.fillStyle = '#ffffff';
  g.fillRect(104, 34, 48, 26);
  g.fillStyle = '#cfe6ff';
  g.fillRect(108, 38, 40, 18);
  // 天井の明かり
  g.fillStyle = 'rgba(255,248,230,0.9)';
  g.fillRect(0, 0, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.name = 'envEquirect';
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
