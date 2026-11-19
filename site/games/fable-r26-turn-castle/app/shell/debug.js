// Error capture, frame stats, resource measurement and the ?debug=1 overlay.
(function (C) {
  'use strict';
  const errors = [];
  C.errors = errors;
  C.reportError = function (err) {
    const msg = (err && (err.stack || err.message)) || String(err);
    errors.push({ t: +(performance.now() / 1000).toFixed(2), msg: String(msg).slice(0, 400) });
    if (errors.length > 50) errors.shift();
  };
  window.addEventListener('error', (e) => C.reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => C.reportError(e.reason));
  const origErr = console.error.bind(console);
  console.error = function () { C.reportError(Array.prototype.map.call(arguments, String).join(' ')); origErr.apply(null, arguments); };

  // --- frame time statistics (last ~2 s)
  C.createFrameStats = function () {
    const N = 240; const buf = new Float32Array(N); let n = 0, i = 0;
    return {
      push(ms) { buf[i] = ms; i = (i + 1) % N; n = Math.min(N, n + 1); },
      reset() { n = 0; i = 0; },
      summary() {
        if (!n) return { avgMs: 0, p95Ms: 0, fpsAvg: 0, fpsP95: 0, frames: 0 };
        const a = Array.prototype.slice.call(buf, 0, n).sort((x, y) => x - y);
        const avg = a.reduce((s, x) => s + x, 0) / n; const p95 = a[Math.min(n - 1, Math.floor(n * 0.95))];
        return { avgMs: avg, p95Ms: p95, fpsAvg: 1000 / Math.max(avg, 1e-3), fpsP95: 1000 / Math.max(p95, 1e-3), frames: n };
      },
    };
  };

  // --- resource measurement (static: what is in the scene graph and visible)
  function texBytes(t) {
    const img = t.image; if (!img) return 0;
    const w = img.videoWidth || img.naturalWidth || img.width || 0, h = img.videoHeight || img.naturalHeight || img.height || 0;
    const mip = (t.generateMipmaps && t.minFilter !== 1006 && t.minFilter !== 1003) ? 4 / 3 : 1; // not Linear/Nearest
    return w * h * 4 * mip;
  }
  function geoBytes(g) {
    let b = 0;
    for (const k in g.attributes) b += g.attributes[k].array.byteLength;
    if (g.index) b += g.index.array.byteLength;
    return b;
  }
  function trisOf(o) {
    const g = o.geometry; if (!g) return 0;
    let n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    if (g.drawRange && g.drawRange.count !== Infinity) n = Math.min(n, g.drawRange.count);
    const tris = Math.floor(n / 3);
    return o.isInstancedMesh ? tris * o.count : tris;
  }
  // tris / meshes: what is drawn now (visible). Memory: everything drawable that stays resident on the GPU
  // once drawn (also hidden meshes such as the folded flag), so the estimate does not shrink when parts hide.
  // nonFinite: NaN/Infinity in any world matrix or instance matrix/colour (a NaN here blacks out the screen).
  const finite = (a) => { for (let i = 0; i < a.length; i++) if (a[i] !== a[i] || a[i] === Infinity || a[i] === -Infinity) return false; return true; };
  C.measureGroup = function (root, skip) {
    const geos = new Set(), texs = new Set(); let tris = 0, meshes = 0, instBytes = 0, nonFinite = 0;
    (function walk(o, shown) {
      if (o === skip) return;
      shown = shown && o.visible;
      if (!finite(o.matrixWorld.elements)) nonFinite++;
      if (o.isMesh || o.isLine || o.isPoints) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some((m) => m && m.visible)) {
          if (shown) { meshes++; tris += o.isMesh ? trisOf(o) : 0; }
          if (!geos.has(o.geometry)) geos.add(o.geometry);
          if (o.isInstancedMesh) {
            instBytes += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
            if (!finite(o.instanceMatrix.array) || (o.instanceColor && !finite(o.instanceColor.array))) nonFinite++;
          }
          for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
          if (o.material && o.material.uniforms) for (const k in o.material.uniforms) { const v = o.material.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
        }
      }
      for (const c of o.children) walk(c, shown);
    })(root, true);
    let gBytes = instBytes; geos.forEach((g) => { gBytes += geoBytes(g); });
    let tBytes = 0; const texList = [];
    texs.forEach((t) => { tBytes += texBytes(t); const im = t.image || {}; texList.push((t.name || '?') + ':' + (im.naturalWidth || im.width || 0) + '²'); });
    return { tris, meshes, textures: texs.size, texList, texBytes: tBytes, geoBytes: gBytes, texSet: texs, nonFinite };
  };

  C.measureAll = function (renderer, scene, heroRoot) {
    const hero = C.measureGroup(heroRoot);
    const env = C.measureGroup(scene, heroRoot);
    if (scene.background && scene.background.isTexture) env.texSet.add(scene.background);
    // shared textures used by both count once
    let sharedBytes = 0, shared = 0; hero.texSet.forEach((t) => { if (env.texSet.has(t)) { sharedBytes += texBytes(t); shared++; } });
    const size = renderer.getDrawingBufferSize(new (window.THREE.Vector2)());
    const fbBytes = size.x * size.y * (4 + 4) * 2; // colour + depth/stencil, front + back (no MSAA)
    const total = hero.texBytes + hero.geoBytes + env.texBytes + env.geoBytes - sharedBytes + fbBytes;
    const MiB = (b) => +(b / 1048576).toFixed(2);
    return {
      hero: { tris: hero.tris, meshes: hero.meshes, textures: hero.textures, texList: hero.texList, texMiB: MiB(hero.texBytes), geoMiB: MiB(hero.geoBytes) },
      env: { tris: env.tris, meshes: env.meshes, textures: env.textures, texList: env.texList, texMiB: MiB(env.texBytes), geoMiB: MiB(env.geoBytes) },
      textures: hero.textures + env.textures - shared,
      framebuffer: { w: size.x, h: size.y, MiB: MiB(fbBytes) },
      gpuMiB: MiB(total),
      nonFinite: hero.nonFinite + env.nonFinite,
      gl: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: (renderer.info.programs || []).length },
    };
  };

  C.createDebugOverlay = function (root) {
    const el = document.createElement('pre');
    el.className = 'dbg';
    root.appendChild(el);
    return {
      render(s) {
        const f = s.frame, m = s.measure;
        const lines = [
          `tier ${s.tier}${s.mobile ? ' (mobile)' : ''}  scale ${s.renderScale}  dpr ${s.dpr}`,
          `canvas ${s.cssW}x${s.cssH} css  ${m ? m.framebuffer.w + 'x' + m.framebuffer.h : ''} px`,
          `fps ${f.fpsAvg.toFixed(1)} avg / ${f.fpsP95.toFixed(1)} p95  (${f.avgMs.toFixed(1)} / ${f.p95Ms.toFixed(1)} ms)  cpu ${s.cpu.update.toFixed(2)}+${s.cpu.render.toFixed(2)} ms`,
          m ? `draw ${m.gl.calls}  tris ${m.gl.triangles} / 100k  (hero ${m.hero.tris} / env ${m.env.tris})` : '',
          m ? `tex ${m.textures} (gl ${m.gl.textures})  hero ${m.hero.textures} ${m.hero.texMiB}MiB  env ${m.env.textures} ${m.env.texMiB}MiB` : '',
          m ? `GPU est ${m.gpuMiB} MiB / 128 (fb ${m.framebuffer.MiB})  geo h${m.hero.geoMiB}/e${m.env.geoMiB}  prog ${m.gl.programs}` : '',
          `stage ${s.stage}/${s.stageCount - 1} ${s.stageName}${s.busy ? ' busy' : ''}${s.finished ? ' done' : ''}  view ${s.view}  idle ${s.idle.toFixed(1)}`,
          `ready ${s.readyNavMs}ms (shell ${s.readyMs}ms)  tex ${s.texLoaded ? 'ok' : '...'}  audio ${s.audio}  ctx ${s.contextLost ? 'LOST' : 'ok'} (lost ${s.lostCount})`,
          `errors ${C.errors.length}  NaN ${m ? m.nonFinite : '-'}`,
        ];
        C.errors.slice(-4).forEach((e) => lines.push('  ! ' + e.msg.split('\n')[0].slice(0, 90)));
        el.textContent = lines.filter(Boolean).join('\n');
      },
    };
  };
})(window.Castle = window.Castle || {});
