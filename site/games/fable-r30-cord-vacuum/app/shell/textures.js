// 写真風テクスチャの読み込み（共有）と、手続きの Canvas テクスチャ。
// http(s): app/assets/<name>.jpg をそのまま読む。
// file:// : Chrome は file:// の画像を WebGL に渡せないので、app/assets/tex/<name>.js（data URI）を <script> で読む。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});
  const THREE = window.THREE;
  const isFile = location.protocol === 'file:';

  const shared = new Map(); // name -> THREE.Texture
  const pending = new Map(); // name -> Promise
  const owned = new Set(); // シェルが作った Canvas テクスチャ

  function solidCanvas(hex) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const g = c.getContext('2d');
    g.fillStyle = hex || '#cccccc';
    g.fillRect(0, 0, 4, 4);
    return c;
  }

  function loadDataScript(name) {
    return new Promise((resolve, reject) => {
      const store = window.__TEXDATA || {};
      if (store[name]) return resolve(store[name]);
      const s = document.createElement('script');
      s.src = 'assets/tex/' + name + '.js';
      s.async = true;
      s.onload = () => {
        const d = (window.__TEXDATA || {})[name];
        s.remove();
        if (d) resolve(d);
        else reject(new Error('texture data missing: ' + name));
      };
      s.onerror = () => reject(new Error('texture script failed: ' + name));
      document.head.appendChild(s);
    });
  }

  function decodeImage(src) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    const p = img.decode
      ? img.decode()
      : new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    return p.then(() => img, () => { throw new Error('image decode failed: ' + String(src).slice(0, 40)); });
  }

  // 共有テクスチャ。すぐ返す（最初は平均色の 4×4）。画像が届いたら Source を差し替える。
  function get(name) {
    let tex = shared.get(name);
    if (tex) return tex;
    const meta = window.TEX_MANIFEST && window.TEX_MANIFEST[name];
    if (!meta) throw new Error('unknown texture: ' + name);
    tex = new THREE.Texture(solidCanvas(meta.avg));
    tex.name = name;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.userData.shared = true;
    tex.userData.nominalSize = meta.size;
    tex.needsUpdate = true;
    shared.set(name, tex);
    const src = isFile ? loadDataScript(name) : Promise.resolve('assets/' + name + '.jpg');
    const p = src
      .then(decodeImage)
      .then((img) => {
        // 大きさが変わるので、GPU 側を一度捨ててから Source ごと替える
        // （three は同じパラメータの texture を不変ストレージで使い回すため、dispose しないと作り直さない）
        tex.dispose();
        tex.source = new (THREE.TextureSource || THREE.Source)(img);
        tex.needsUpdate = true;
        tex.userData.loaded = true;
        if (window.__TEXDATA) delete window.__TEXDATA[name];
      })
      .catch((err) => S.reportError && S.reportError(err));
    pending.set(name, p);
    return tex;
  }

  function whenLoaded(names, timeoutMs) {
    const all = Promise.all(names.map((n) => { get(n); return pending.get(n); }));
    return Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  // 手続きの Canvas テクスチャ（文字は描かない）。
  function canvas(name, w, h, draw, opts) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.name = name;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (opts && opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    owned.add(tex);
    return tex;
  }

  function disposeAll() {
    shared.forEach((t) => t.dispose());
    owned.forEach((t) => t.dispose());
    shared.clear();
    owned.clear();
  }

  S.textures = { get, whenLoaded, canvas, disposeAll, shared, owned };
})();
