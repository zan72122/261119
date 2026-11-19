// Texture loading. Images come from window.R25_TEXPACK (data URIs, built by tools/build.mjs) so
// they are usable by WebGL even from file://. Falls back to plain URLs under assets/.

const FILES = {
  sky: 'sky_512.jpg',
  mountains: 'mountains_512.jpg',
  cliff: 'cliff_512.jpg',
  grass: 'grass_512.jpg',
  wood: 'wood_512.jpg',
  heroWood: 'wood_1024.jpg',
};

function loadImage(name) {
  const w = typeof window !== 'undefined' ? window : {};
  const pre = w.R25_PRELOAD && w.R25_PRELOAD[name];          // http(s): started by index.html
  const pack = w.R25_TEXPACK || {};                         // file://: data URIs
  const img = pre || new Image();
  const ready = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => img);
  return new Promise((resolve, reject) => {
    if (pre && pre.complete) { if (pre.naturalWidth) resolve(ready()); else reject(new Error('texture load failed: ' + name)); return; }
    img.onload = () => resolve(ready());
    img.onerror = () => reject(new Error('texture load failed: ' + name));
    if (!pre) img.src = pack[name] || ('assets/' + name);
  });
}

function canvasTex(THREE, size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Tileable water ripples (256²). */
function makeWater(THREE) {
  return canvasTex(THREE, 256, (g, s) => {
    g.fillStyle = '#3f8fc4';
    g.fillRect(0, 0, s, s);
    const r = (n) => { let x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 70; i++) {
      const x = r(i) * s, y = r(i + 99) * s, w = 18 + r(i + 7) * 50;
      g.strokeStyle = `rgba(${200 + r(i + 3) * 55 | 0},240,255,${0.18 + r(i + 5) * 0.25})`;
      g.lineWidth = 1.5 + r(i + 11) * 2;
      for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, w, w * 0.18, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    }
  });
}

/** Soft round contact shadow (64²): white edge, dark centre — used with multiply-like alpha. */
function makeBlob(THREE) {
  return canvasTex(THREE, 64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.clearRect(0, 0, s, s);
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

/**
 * Loads every texture of the first (and only) scene.
 * @returns {Promise<Record<string, THREE.Texture>>}
 */
export async function loadTextures(THREE, tier) {
  const names = Object.keys(FILES);
  const imgs = await Promise.all(names.map((k) => loadImage(FILES[k])));
  const tex = {};
  names.forEach((k, i) => {
    const t = new THREE.Texture(imgs[i]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = tier.anisotropy;
    t.name = k;
    t.needsUpdate = true;
    tex[k] = t;
  });
  tex.mountains.wrapS = THREE.MirroredRepeatWrapping;
  tex.mountains.wrapT = THREE.ClampToEdgeWrapping;
  tex.water = makeWater(THREE);
  tex.water.colorSpace = THREE.SRGBColorSpace;
  tex.water.wrapS = tex.water.wrapT = THREE.RepeatWrapping;
  tex.water.name = 'water';
  tex.blob = makeBlob(THREE);
  tex.blob.name = 'blob';
  return tex;
}

/** Re-upload every texture after a WebGL context restore. */
export function markTexturesDirty(textures) {
  for (const t of Object.values(textures)) if (t && t.isTexture) t.needsUpdate = true;
}
