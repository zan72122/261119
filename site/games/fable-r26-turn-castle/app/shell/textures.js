// Shared texture store. Textures are returned immediately (placeholder colour) and
// filled asynchronously. http(s): plain JPEG. file://: data-URI script (Chrome refuses
// to upload file:// images to WebGL). See docs/PLAN.md §4.
(function (C) {
  'use strict';
  const AVG = { // approximate average colour, used until the image arrives
    sky_clouds: '#86b7ec', cobblestone: '#8b877e', stone_wall: '#d6c7a3',
    roof_tiles: '#5d6f80', wood_floor: '#ae7337', grass: '#79b552',
  };
  const NAMES = ['sky_clouds_512', 'cobblestone_512', 'stone_wall_512', 'roof_tiles_512', 'wood_floor_512',
    'stone_wall_1024', 'roof_tiles_1024', 'wood_floor_1024'];

  C.createTextureStore = function (THREE, renderer, settings) {
    const entries = new Map(); // name -> { tex, promise, loaded }
    const isFile = location.protocol === 'file:';
    const maxAniso = Math.min(settings.anisotropy, renderer.capabilities.getMaxAnisotropy());

    function placeholderCanvas(name) {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const g = c.getContext('2d');
      g.fillStyle = AVG[name.replace(/_\d+$/, '')] || '#999';
      g.fillRect(0, 0, 2, 2);
      return c;
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => { s.remove(); resolve(); };
        s.onerror = () => { s.remove(); reject(new Error('texture script failed: ' + src)); };
        document.head.appendChild(s);
      });
    }

    async function fetchImage(name) {
      let url = 'assets/tex/' + name + '.jpg';
      if (isFile) {
        const store = (window.CASTLE_TEX_DATA = window.CASTLE_TEX_DATA || {});
        if (!store[name]) await loadScript('assets/tex/' + name + '.js');
        url = store[name];
        delete store[name]; // free the base64 string once decoded
      }
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      if (img.decode) await img.decode();
      else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      return img;
    }

    function get(name) {
      let e = entries.get(name);
      if (e) return e.tex;
      if (NAMES.indexOf(name) < 0) throw new Error('unknown shared texture: ' + name);
      const tex = new THREE.Texture(placeholderCanvas(name));
      tex.name = name;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
      e = { tex, loaded: false, promise: null };
      e.promise = fetchImage(name).then((img) => {
        // size changes from the 2x2 placeholder: dispose so three reallocates storage
        tex.dispose();
        tex.image = img;
        tex.needsUpdate = true;
        e.loaded = true;
        return tex;
      }).catch((err) => { C.reportError && C.reportError(err); return tex; });
      entries.set(name, e);
      return tex;
    }

    // Canvas textures made by the shell itself (grass, blob shadow, ...)
    function addCanvas(name, canvas, opts) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.name = name;
      tex.colorSpace = (opts && opts.linear) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      if (!opts || opts.repeat !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAniso;
      entries.set(name, { tex, loaded: true, promise: Promise.resolve(tex) });
      return tex;
    }

    function whenLoaded(names, timeoutMs) {
      const ps = names.map((n) => { get(n); return entries.get(n).promise; });
      const all = Promise.all(ps);
      return timeoutMs ? Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]) : all;
    }

    // after webglcontextrestored: make three re-upload every texture
    function reuploadAll() { entries.forEach((e) => { e.tex.needsUpdate = true; }); }

    function dispose() { entries.forEach((e) => e.tex.dispose()); entries.clear(); }

    const requested = () => Array.from(entries.keys()).filter((n) => NAMES.indexOf(n) >= 0);
    return { get, addCanvas, whenLoaded, reuploadAll, dispose, requested, names: NAMES.slice(),
      allLoaded: () => Array.from(entries.values()).every((e) => e.loaded) };
  };
})(window.Castle = window.Castle || {});
