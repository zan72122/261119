// 起動・毎フレームの流れ・hero の受け入れ・WebGL コンテキスト喪失の処理。
(function () {
  'use strict';
  const S = window.Shell;
  const THREE = window.THREE;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.get('debug') === '1';
  const ADAPTIVE = params.get('adaptive') !== '0';
  const STAGES = S.layout.STAGES;

  // ---- エラーの記録 ----
  const errors = [];
  function reportError(err) {
    const msg = err && err.stack ? String(err.stack).split('\n').slice(0, 2).join(' | ') : String(err && err.message ? err.message : err);
    errors.push({ t: +(performance.now() / 1000).toFixed(2), msg });
    if (errors.length > 50) errors.shift();
    console.error('[shell]', err);
  }
  S.reportError = reportError;
  window.addEventListener('error', (e) => reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

  if (!THREE || !window.THREE_ADDONS) { reportError(new Error('three が読めない')); return; }

  // ---- ティア ----
  const tierInfo = S.tier.detect();
  let tierName = tierInfo.tier;
  let settings = S.tier.TIERS[tierName];

  // ---- 場面とカメラ ----
  const container = document.getElementById('stage');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#efe4dc');
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.05, 30);
  const rig = S.createCameraRig(camera, S.layout.DEFAULT_VIEWS);
  let core = null;
  let far = null;

  // ---- hero ----
  let hero = null;
  let heroDisabled = false;
  let heroErrorStreak = 0;
  let stage = 'pull';
  let stageStartedAt = performance.now();

  const input = S.createInput({
    getCamera: () => camera,
    getTargets: () => (hero && !heroDisabled && Array.isArray(hero.hitTargets) ? hero.hitTargets : []),
    onFirstTouch: () => S.audio.unlock(),
  });
  const hint = S.createHint(document.getElementById('hint'));
  const fps = S.debug.createFps();
  // CPU 時間（ms）：hero.update と renderer.render（debug と煙テスト用）
  const cpu = { update: new Float32Array(240), render: new Float32Array(240), i: 0, n: 0 };
  function cpuStats(arr) {
    if (!cpu.n) return { avg: 0, p95: 0 };
    const a = Array.from(arr.subarray(0, cpu.n)).sort((x, y) => x - y);
    return { avg: a.reduce((s, v) => s + v, 0) / cpu.n, p95: a[Math.min(cpu.n - 1, Math.floor(cpu.n * 0.95))] };
  }
  let nanCheck = { nan: 0, zeroNormals: 0, where: [], at: 0 };
  function runNaNCheck(full) {
    try { nanCheck = Object.assign(S.debug.scanNaN(scene, full), { at: performance.now(), full: !!full }); } catch (e) { reportError(e); }
    return nanCheck;
  }

  // ---- レンダラー ----
  let renderer = null;
  let canvas = null;
  let loseExt = null;
  let contextLost = false;
  let lostAt = 0;
  const lastInfo = { calls: 0, triangles: 0 };

  function createRenderer() {
    canvas = document.createElement('canvas');
    canvas.className = 'gl';
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !!settings.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    container.appendChild(canvas);
    input.attach(canvas);
    loseExt = renderer.getContext().getExtension('WEBGL_lose_context');
    resize();
  }

  function resize() {
    if (!renderer) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(S.tier.pixelRatio(settings, w, h));
    renderer.setSize(w, h, false);
    rig.setAspect(w / h);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // ---- コンテキスト喪失：preventDefault し、復帰したら GPU 資源を作り直す（ゲームの状態は JS 側にあるのでそのまま） ----
  function onContextLost(e) {
    e.preventDefault();
    contextLost = true;
    lostAt = performance.now();
    game.contextLost++;
  }
  function onContextRestored() {
    contextLost = false;
    afterRestore();
  }
  function afterRestore() {
    // three は復帰時に内部の GL 状態を作り直し、geometry・texture は次の描画で上げ直す。
    scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => { m.needsUpdate = true; });
      if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    });
    S.textures.shared.forEach((t) => { t.needsUpdate = true; });
    S.textures.owned.forEach((t) => { t.needsUpdate = true; });
    try { if (hero && typeof hero.onContextRestored === 'function') hero.onContextRestored(); } catch (e) { reportError(e); }
    resize();
    game.contextRestored++;
    setTimeout(warmUpShaders, 100); // 作り直したコンテキストでも、隠れた物のシェーダーを先に作る
  }
  // 復帰イベントが来ない端末向け：3秒待って、新しい canvas でレンダラーを作り直す
  function rebuildRenderer() {
    const old = renderer;
    const oldCanvas = canvas;
    input.detach();
    try { old.dispose(); } catch (_) { /* 失われたコンテキストでは失敗してよい */ }
    oldCanvas.removeEventListener('webglcontextlost', onContextLost);
    oldCanvas.removeEventListener('webglcontextrestored', onContextRestored);
    oldCanvas.remove();
    contextLost = false;
    createRenderer();
    afterRestore();
    game.rendererRebuilt++;
  }

  // ---- hero の受け入れ ----
  const HERO_TEXTURES = new Set(['plastic_pastel_1024', 'paper_scraps_1024', 'plastic_pastel_512', 'paper_scraps_512']);

  function onStage(s, prev) {
    if (!STAGES.includes(s)) { reportError(new Error('unknown stage: ' + s)); return; }
    stage = s;
    stageStartedAt = performance.now();
    rig.go(s);
    if (s === 'finale') S.audio.play('fanfare');
    game.stageLog.push({ stage: s, prev: prev || null, t: +(performance.now() / 1000).toFixed(2) });
    if (game.stageLog.length > 100) game.stageLog.shift();
  }

  function makeHero() {
    const M = window.HeroModule;
    if (!M || typeof M.createHero !== 'function') {
      reportError(new Error('hero/hero.bundle.js が無い（npm run build:hero）'));
      return null;
    }
    const opts = Object.freeze({
      layout: S.layout.LAYOUT,
      quality: Object.freeze({
        tier: tierName, shadows: !!settings.shadows, textureSize: settings.heroTextureSize,
        maxTriangles: 50000, maxTextures: 4, maxDrawCalls: 40,
      }),
      textures: Object.freeze({
        get(name) {
          if (!HERO_TEXTURES.has(name)) throw new Error('hero が使えないテクスチャ: ' + name);
          return S.textures.get(name);
        },
      }),
      addons: window.THREE_ADDONS,
      onStage: (s, prev) => onStage(s, prev),
      onSound: (id, p) => S.audio.play(id, p),
      onLoop: (id, level, rate) => S.audio.loop(id, level, rate),
      debug: DEBUG,
    });
    try {
      const h = M.createHero(THREE, opts);
      const missing = ['update', 'getHint', 'getProgress', 'reset', 'debugCompleteStage', 'dispose'].filter((k) => typeof h[k] !== 'function');
      if (!h || !h.root || !h.root.isObject3D) throw new Error('hero.root が Object3D でない');
      if (!Array.isArray(h.hitTargets)) missing.push('hitTargets');
      if (missing.length) reportError(new Error('hero API 不足: ' + missing.join(',')));
      scene.add(h.root);
      return h;
    } catch (e) {
      reportError(e);
      return null;
    }
  }

  // ---- ヒント ----
  const _v = new THREE.Vector3();
  function toScreen(p, out) {
    _v.copy(p).project(camera);
    const w = container.clientWidth, h = container.clientHeight;
    out[0] = (_v.x * 0.5 + 0.5) * w;
    out[1] = (-_v.y * 0.5 + 0.5) * h;
    return _v.z < 1;
  }
  const _a = [0, 0], _b = [0, 0];
  function hintOnScreen(h) {
    if (!h || !h.position) return null;
    if (!toScreen(h.position, _a)) return null;
    const r = { control: h.control, gesture: h.gesture === 'drag' ? 'drag' : 'tap', x: _a[0], y: _a[1], toX: NaN, toY: NaN };
    if (r.gesture === 'drag' && h.to && toScreen(h.to, _b)) { r.toX = _b[0]; r.toY = _b[1]; }
    return r;
  }
  function currentHint() {
    if (!hero || heroDisabled) return null;
    try { return hero.getHint(); } catch (e) { reportError(e); return null; }
  }

  // ---- ティアの自動の引き下げ（遅い端末） ----
  let perfWindow = 0, perfFrames = 0;
  function adapt(rawDt) {
    if (!ADAPTIVE || tierInfo.forced || tierName === 'low' || performance.now() < 6000) return;
    perfWindow += rawDt;
    perfFrames++;
    if (perfWindow < 4) return;
    const avg = perfFrames / perfWindow;
    perfWindow = 0;
    perfFrames = 0;
    if (avg >= 40) return;
    tierName = tierName === 'desktop' ? 'mobile' : 'low';
    settings = S.tier.TIERS[tierName];
    renderer.shadowMap.enabled = !!settings.shadows;
    if (core && core.sun) {
      core.sun.castShadow = !!settings.shadows;
      // 使わなくなった影マップ（512²）を GPU から捨てる
      if (!settings.shadows && core.sun.shadow.map) { core.sun.shadow.map.dispose(); core.sun.shadow.map = null; }
    }
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    resize();
    game.tier = tierName;
    fps.reset();
  }

  // ---- debug ----
  let overlay = null;
  function debugText() {
    const m = game.metrics();
    const f = m.fps;
    const e = m.gpu;
    const lines = [
      `tier ${tierName}${tierInfo.forced ? ' (forced)' : ''}  dpr ${renderer.getPixelRatio().toFixed(2)}  canvas ${e.drawingBuffer[0]}x${e.drawingBuffer[1]}`,
      `fps ${f.avg.toFixed(1)} avg / ${f.p95.toFixed(1)} p95   first frame ${(game.firstFrameMs / 1000).toFixed(2)}s`,
      `draw ${m.info.calls} (hero ${m.hero.drawCalls} / room ${m.shell.drawCalls})`,
      `tris ${m.info.triangles} incl.shadow | view hero ${m.hero.triangles} / room ${m.shell.triangles}`,
      `tex hero ${e.textureCount.hero} (${e.textureMiB.hero.toFixed(1)}MiB) / room ${e.textureCount.shell} (${e.textureMiB.shell.toFixed(1)}MiB)  gl ${m.glTextures}`,
      `gpu ≈ ${e.totalMiB.toFixed(1)} MiB (fb ${e.framebufferMiB.toFixed(1)}, shadow ${e.shadowMiB.toFixed(1)}, geo ${(e.geometryMiB.hero + e.geometryMiB.shell).toFixed(1)})`,
      `cpu update ${m.cpu.update.avg.toFixed(2)} / render ${m.cpu.render.avg.toFixed(2)} ms (p95 ${m.cpu.update.p95.toFixed(2)} / ${m.cpu.render.p95.toFixed(2)})  shaders ${m.programs}`,
      `NaN ${nanCheck.nan}  zero normals ${nanCheck.zeroNormals}  errors ${errors.length}`,
      `stage ${stage}  prog ${m.progress.toFixed(2)}  audio ${S.audio.state}  ctx lost ${game.contextLost}/restored ${game.contextRestored}`,
    ];
    errors.slice(-4).forEach((x) => lines.push('ERR ' + x.t + 's ' + x.msg.slice(0, 120)));
    return lines.join('\n');
  }

  // ---- シェーダーの先作り（隠れている物を一瞬だけ見える扱いにして compile） ----
  function warmUpShaders() {
    if (!renderer || contextLost) return;
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const t0 = performance.now();
    try { renderer.compile(scene, camera); } catch (e) { reportError(e); }
    finally { hidden.forEach((o) => { o.visible = false; }); }
    game.boot.warmUpMs = Math.round(performance.now() - t0);
    game.boot.programsAfterWarmUp = renderer.info.programs ? renderer.info.programs.length : 0;
  }

  // ---- 毎フレーム ----
  let last = 0;
  let hintVisible = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const dt = Math.min(0.05, Math.max(1e-4, rawDt));
    if (contextLost) {
      if (now - lostAt > 3000) rebuildRenderer();
      return;
    }
    fps.push(rawDt * 1000);

    const tA = performance.now();
    const inp = input.frame(camera, hintVisible);
    if (hero && !heroDisabled) {
      try {
        hero.update(dt, inp);
        heroErrorStreak = 0;
      } catch (e) {
        reportError(e);
        if (++heroErrorStreak >= 10) heroDisabled = true;
      }
    }

    const h = currentHint();
    const interacted = input.lastActivity > stageStartedAt;
    const since = (now - stageStartedAt) / 1000;
    hintVisible = !!h && !input.isDown && !rig.moving && (interacted ? inp.idle >= 2.5 : since >= 1.0);
    hint.update(dt, hintOnScreen(h), hintVisible);

    const tB = performance.now();
    rig.update(dt);
    S.audio.update();
    renderer.render(scene, camera);
    const tC = performance.now();
    cpu.update[cpu.i] = tB - tA;
    cpu.render[cpu.i] = tC - tB;
    cpu.i = (cpu.i + 1) % 240;
    cpu.n = Math.min(240, cpu.n + 1);
    lastInfo.calls = renderer.info.render.calls;
    lastInfo.triangles = renderer.info.render.triangles;
    game.frames++;

    if (!game.ready) {
      game.ready = true;
      game.firstFrameMs = Math.round(performance.now());
      game.boot.firstRenderMs = +(tC - tB).toFixed(1);
      // 遠景は最初の描画の後に作る
      setTimeout(() => {
        try { far = S.scene.buildExtras(scene, core, { textures: S.textures, settings }); } catch (e) { reportError(e); }
        // 後で初めて見える物（finale の星など）のシェーダーも今のうちに作る。
        // Safari はシェーダーを作る間ゆっくり止まるので、見せ場の最中に引っかからないようにする。
        setTimeout(warmUpShaders, 60);
      }, 30);
    }
    if (overlay) {
      if (now - nanCheck.at > 2000) runNaNCheck(!nanCheck.full);
      overlay.update(rawDt, debugText);
    }
    adapt(rawDt);
  }

  // ---- テスト・debug 用の窓口 ----
  const game = (window.__game = {
    ready: false,
    firstFrameMs: 0,
    boot: { scriptsMs: Math.round(performance.now()) }, // 起動の内訳（ms）
    tier: tierName,
    stageLog: [],
    errors,
    contextLost: 0,
    contextRestored: 0,
    rendererRebuilt: 0,
    frames: 0,
    get stage() { return stage; },
    get heroOk() { return !!hero && !heroDisabled; },
    get farReady() { return !!far; },
    get cameraMoving() { return rig.moving; },
    nanCheck(full) { return runNaNCheck(full !== false); },
    hint() { const h = hintOnScreen(currentHint()); if (h) h.stage = stage; return h; },
    get hintVisible() { return hintVisible; },
    skip() { if (hero) hero.debugCompleteStage(); },
    loseContext() { if (loseExt) loseExt.loseContext(); },
    restoreContext() { if (loseExt) loseExt.restoreContext(); },
    metrics() {
      const heroRoot = hero ? hero.root : null;
      const he = S.debug.countGroup(heroRoot, camera);
      let sh = { triangles: 0, trianglesAll: 0, drawCalls: 0, meshes: 0 };
      scene.children.forEach((c) => {
        if (c === heroRoot) return;
        const r = S.debug.countGroup(c, camera);
        sh = { triangles: sh.triangles + r.triangles, trianglesAll: sh.trianglesAll + r.trianglesAll, drawCalls: sh.drawCalls + r.drawCalls, meshes: sh.meshes + r.meshes };
      });
      let progress = 0;
      try { progress = hero ? +hero.getProgress() || 0 : 0; } catch (_) { /* 無視 */ }
      return {
        tier: tierName,
        dpr: renderer.getPixelRatio(),
        info: { calls: lastInfo.calls, triangles: lastInfo.triangles },
        glTextures: renderer.info.memory.textures,
        glGeometries: renderer.info.memory.geometries,
        hero: he,
        shell: sh,
        gpu: S.debug.estimate(renderer, scene, { hero: heroRoot }),
        fps: fps.stats(),
        cpu: { update: cpuStats(cpu.update), render: cpuStats(cpu.render) },
        programs: renderer.info.programs ? renderer.info.programs.length : 0,
        progress,
        stage,
      };
    },
  });

  // debug のときだけ、計測用に three の物体を出す
  if (DEBUG) Object.defineProperty(game, 'three', { get: () => ({ THREE, scene, camera, renderer, hero, rig }) });

  // ---- 起動 ----
  function boot() {
    try {
      createRenderer();
    } catch (e) {
      reportError(e);
      document.body.classList.add('no-webgl');
      return;
    }
    core = S.scene.buildCore(scene, { textures: S.textures, settings });
    const tHero = performance.now();
    hero = makeHero();
    game.boot.heroBuildMs = Math.round(performance.now() - tHero);
    if (hero) {
      rig.setHeroViews(hero.views);
      if (STAGES.includes(hero.stage)) stage = hero.stage;
    }
    rig.go(stage, true);
    if (DEBUG) overlay = S.debug.createOverlay(document.getElementById('debug'), () => game.skip());
    const heroTex = settings.heroTextureSize === 512 ? ['plastic_pastel_512', 'paper_scraps_512'] : ['plastic_pastel_1024', 'paper_scraps_1024'];
    // 写真テクスチャを少しだけ待つ（届かなくても平均色で始める）
    S.textures.whenLoaded(['wood_floor_512', 'rug_wool_512', 'wallpaper_pastel_512', ...heroTex], 900).then(() => {
      stageStartedAt = performance.now();
      game.boot.texturesReadyMs = Math.round(stageStartedAt);
      requestAnimationFrame(frame);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) S.audio.suspend();
    else { S.audio.resume(); last = 0; }
  });
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    try { if (hero) hero.dispose(); } catch (_) { /* 終了時 */ }
    S.textures.disposeAll();
    if (renderer) renderer.dispose();
  });

  boot();
})();
