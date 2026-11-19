// テクスチャ管理：写真風 JPEG（app/assets/tex/）と手続き Canvas テクスチャ。
// file:// では Chrome が画像を WebGL に渡せないため、ビルドが埋め込んだ data URI
// (window.__TEX_EMBED, app/dist/tex-embed.js) を使う。http(s) ではファイルを読む。
// 画像は起動時に preload() で全部デコードしてからシーンを作る（黒い一瞬を出さない）。

export const TEX_FILES = {
  sky_clouds: { 512: 'sky_clouds_512.jpg' },
  far_hills: { 512: 'far_hills_512x256.jpg' },
  meadow_grass: { 512: 'meadow_grass_512.jpg' },
  wood_planks: { 512: 'wood_planks_512.jpg', 1024: 'wood_planks_1024.jpg' },
  brushed_steel: { 512: 'brushed_steel_512.jpg', 1024: 'brushed_steel_1024.jpg' },
};
// 読めなかったときの代わりの色
const FALLBACK = {
  sky_clouds: '#9cc8f0', far_hills: '#86a294', meadow_grass: '#5d8c3c',
  wood_planks: '#dcb488', brushed_steel: '#c0c2c6',
};

export class TextureManager {
  constructor(THREE, renderer, tier) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.tier = tier;
    this.images = new Map();  // file -> HTMLImageElement | HTMLCanvasElement
    this.cache = new Map();   // key -> Texture
    this.owned = new Set();
    this.errors = [];
  }

  url(file) {
    const embed = (typeof window !== 'undefined' && window.__TEX_EMBED) || null;
    if (embed && embed[file]) return embed[file];
    return 'assets/tex/' + file;
  }

  resolve(name, size) {
    const sizes = TEX_FILES[name];
    if (!sizes) throw new Error('unknown texture ' + name);
    let s = Math.min(size, this.tier.texMax);
    if (!sizes[s]) s = 512;
    return sizes[s];
  }

  /** [[name, size], ...] を並列に読み込む */
  preload(list) {
    const jobs = [];
    for (const [name, size] of list) {
      const file = this.resolve(name, size);
      if (this.images.has(file)) continue;
      this.images.set(file, null);
      jobs.push(new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const done = () => { this.images.set(file, img); res(); };
          if (img.decode) img.decode().then(done, done); else done();
        };
        img.onerror = () => {
          this.errors.push('texture load failed: ' + file);
          const c = document.createElement('canvas'); c.width = c.height = 4;
          const g = c.getContext('2d'); g.fillStyle = FALLBACK[name] || '#888'; g.fillRect(0, 0, 4, 4);
          this.images.set(file, c); res();
        };
        img.src = this.url(file);
      }));
    }
    return Promise.all(jobs);
  }

  /** 写真風テクスチャ（共有。呼び出し側は dispose しない）。size は 512 か 1024。 */
  get(name, size = 512, { repeat = [1, 1], mirror = false } = {}) {
    const THREE = this.THREE;
    const file = this.resolve(name, size);
    const key = `${file}@${repeat.join('x')}@${mirror ? 'm' : 'r'}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let img = this.images.get(file);
    if (!img) {
      // preload されていない：代わりの色で作る（後で差し替えない）
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d'); g.fillStyle = FALLBACK[name] || '#888'; g.fillRect(0, 0, 4, 4);
      img = c;
      this.errors.push('texture used before preload: ' + file);
    }
    // 同じ画像の Texture は Source を共有する（同じラップ設定なら GPU 上も1枚）
    let tex;
    const first = [...this.cache.values()].find((t) => t.userData.file === file);
    if (first) { tex = first.clone(); } else { tex = new THREE.Texture(img); }
    tex.colorSpace = THREE.SRGBColorSpace;
    const wrap = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    tex.wrapS = tex.wrapT = wrap;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    tex.userData = { file, w: img.width, h: img.height };
    tex.needsUpdate = true;
    this.cache.set(key, tex);
    this.owned.add(tex);
    return tex;
  }

  /** 手続き Canvas テクスチャ（shell 所有）。draw(ctx, w, h) で描く。 */
  canvas(key, w, h, draw, { srgb = true, mipmaps = true } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (!mipmaps) { tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }
    tex.userData = { file: 'canvas:' + key, w, h };
    this.cache.set(key, tex);
    this.owned.add(tex);
    return tex;
  }

  /** コンテキスト復帰時：全テクスチャを再アップロードさせる */
  markAllDirty() {
    for (const t of this.owned) if (t.image) t.needsUpdate = true;
  }

  dispose() {
    for (const t of this.owned) t.dispose();
    this.owned.clear();
    this.cache.clear();
    this.images.clear();
  }
}
