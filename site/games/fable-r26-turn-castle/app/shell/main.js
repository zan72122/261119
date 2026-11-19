// Shell entry: renderer, camera, loop, hero wiring, hint/replay flow, context loss.
(function (C) {
  'use strict';
  const THREE = window.THREE;
  const cfg = C.config;
  const settings = cfg.settings;
  const stageEl = document.getElementById('stage');
  const t0 = performance.now();

  // ---------- renderer (re-creatable after an unrecoverable context loss)
  let canvas = null, renderer = null, contextLost = false, lostCount = 0, lostTimer = 0;
  let renderScaleIdx = 0;
  function makeRenderer() {
    canvas = document.createElement('canvas');
    canvas.className = 'gl';
    stageEl.insertBefore(canvas, stageEl.firstChild);
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false; // pseudo shadows only (docs/PLAN.md §3)
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);
  }
  makeRenderer();

  // ---------- scene & camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const store = C.createTextureStore(THREE, renderer, settings);
  const env = C.buildEnvironment(THREE, scene, store, settings);
  const audio = C.createAudio({ muted: cfg.muted });
  const frameStats = C.createFrameStats();
  const stageLog = [], soundLog = [];
  let heroState = { stage: 0, stageName: '', busy: false, finished: false };

  // ---------- hero
  let currentView = 'main';
  const heroOpts = {
    tier: cfg.tier,
    textures: { get: (n) => store.get(n), names: store.names.slice() },
    utils: window.THREE_ADDONS || {},
    onStage(stage, info) {
      stageLog.push({ stage, name: info && info.name, t: +((performance.now() - t0) / 1000).toFixed(2) });
      if (cfg.debug) console.log('[hero] stage', stage, info && info.name);
    },
    playSound(name, params) {
      soundLog.push(name); if (soundLog.length > 80) soundLog.shift();
      audio.play(name, params);
    },
    setView(name) { if (name === 'main' || name === 'tower') goView(name, false); },
    reducedMotion: cfg.reducedMotion,
    debug: cfg.debug,
  };
  function stubHero() {
    return {
      root: new THREE.Group(), bounds: new THREE.Box3(new THREE.Vector3(-3.4, 0, -3.4), new THREE.Vector3(3.4, 9.5, 3.4)),
      towerFocus: new THREE.Vector3(0, 7, 0), hitTargets: [], stageCount: 1,
      update() {}, getState() { return { stage: 0, stageName: 'error', busy: false, finished: false }; },
      getHint() { return null; }, reset() {}, dispose() {},
    };
  }
  let hero;
  try {
    const mod = window.CastleHeroModule;
    if (!mod || typeof mod.createHero !== 'function') throw new Error('hero bundle missing: run `npm run build:hero`');
    hero = mod.createHero(THREE, heroOpts);
    if (!hero || !hero.root || !hero.root.isObject3D) throw new Error('createHero returned no root');
  } catch (e) {
    C.reportError(e);
    hero = stubHero();
  }
  scene.add(hero.root);
  const heroBounds = (hero.bounds && hero.bounds.isBox3 && !hero.bounds.isEmpty() &&
    [hero.bounds.min.x, hero.bounds.max.y].every(Number.isFinite)) ? hero.bounds.clone()
    : new THREE.Box3(new THREE.Vector3(-3.4, 0, -3.4), new THREE.Vector3(3.4, 9.5, 3.4));
  const towerFocus = (hero.towerFocus && hero.towerFocus.isVector3) ? hero.towerFocus.clone() : new THREE.Vector3(0, heroBounds.max.y - 2.5, 0);

  // ---------- camera views (fixed positions only; slow 2.5 s transitions)
  const views = { main: { pos: new THREE.Vector3(), target: new THREE.Vector3() }, tower: { pos: new THREE.Vector3(), target: new THREE.Vector3() } };
  const cam = { fromPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), pos: new THREE.Vector3(), target: new THREE.Vector3(), t: 1, dur: 2.5 };
  let cssW = 1, cssH = 1;
  // The hero is round: fit a cylinder (radius = half the larger bounds side, centred on the bounds centre)
  // by projecting sample points, so the near rim of the lowest ring keeps a margin at the bottom of the
  // screen (the ghost finger and the replay button live there). Elevation 17° (was 12°): the ring tops
  // read as turntables and the stairs are less hidden by the floor above (docs/hero-notes.md §9-3).
  const fitPts = [];
  const fitCam = new THREE.PerspectiveCamera();
  const fv = new THREE.Vector3();
  function fitView(pos, target, elev) {
    const c = heroBounds.getCenter(new THREE.Vector3()), size = heroBounds.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) / 2;
    fitPts.length = 0;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      fitPts.push(new THREE.Vector3(c.x + r * Math.sin(a), heroBounds.min.y, c.z + r * Math.cos(a)));
      fitPts.push(new THREE.Vector3(c.x + r * Math.sin(a), heroBounds.max.y, c.z + r * Math.cos(a)));
    }
    fitCam.fov = camera.fov; fitCam.aspect = camera.aspect; fitCam.near = 0.1; fitCam.far = 1000; fitCam.updateProjectionMatrix();
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const MX = 0.92, TOP = 0.92, BOT = -0.80; // NDC limits: sides, top, bottom (bottom keeps ~10 % for the hint finger)
    target.set(c.x, THREE.MathUtils.lerp(heroBounds.min.y, heroBounds.max.y, 0.47), c.z);
    let d = 20;
    for (let iter = 0; iter < 4; iter++) {
      let lo = 2, hi = 200;
      for (let k = 0; k < 30; k++) { // smallest distance at which every point fits
        d = (lo + hi) / 2;
        fitCam.position.copy(dir).multiplyScalar(d).add(target); fitCam.lookAt(target); fitCam.updateMatrixWorld();
        let ok = true;
        for (const p of fitPts) {
          fv.copy(p).project(fitCam);
          if (fv.z > 1 || Math.abs(fv.x) > MX || fv.y > TOP || fv.y < BOT) { ok = false; break; }
        }
        if (ok) hi = d; else lo = d;
      }
      d = hi;
      // re-centre vertically so the top and bottom margins balance, then fit again
      fitCam.position.copy(dir).multiplyScalar(d).add(target); fitCam.lookAt(target); fitCam.updateMatrixWorld();
      let yMin = 1, yMax = -1;
      for (const p of fitPts) { fv.copy(p).project(fitCam); yMin = Math.min(yMin, fv.y); yMax = Math.max(yMax, fv.y); }
      const shift = ((yMax - TOP) + (yMin - BOT)) / 2; // NDC; >0 = content too high
      target.y += shift * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 0.9;
    }
    pos.copy(dir).multiplyScalar(d).add(target);
    return d;
  }
  function computeViews() {
    const d = fitView(views.main.pos, views.main.target, THREE.MathUtils.degToRad(17));
    const e2 = THREE.MathUtils.degToRad(15), d2 = d * 0.72;
    views.tower.target.copy(towerFocus);
    views.tower.pos.set(0, Math.sin(e2), Math.cos(e2)).multiplyScalar(d2).add(towerFocus);
  }
  function goView(name, immediate) {
    if (!views[name]) return;
    if (name === currentView && !immediate) return;
    currentView = name;
    cam.fromPos.copy(cam.pos); cam.fromTarget.copy(cam.target);
    cam.t = immediate ? 1 : 0;
    if (immediate) { cam.pos.copy(views[name].pos); cam.target.copy(views[name].target); }
  }
  function updateCamera(dt) {
    const v = views[currentView];
    if (cam.t < 1) {
      cam.t = Math.min(1, cam.t + dt / cam.dur);
      const k = cam.t * cam.t * (3 - 2 * cam.t);
      cam.pos.lerpVectors(cam.fromPos, v.pos, k); cam.target.lerpVectors(cam.fromTarget, v.target, k);
    } else { cam.pos.copy(v.pos); cam.target.copy(v.target); }
    camera.position.copy(cam.pos); camera.lookAt(cam.target);
  }

  // ---------- size & pixel ratio (mobile: dpr 1.0 fixed; governor may lower the render scale)
  function applySize() {
    cssW = Math.max(1, stageEl.clientWidth); cssH = Math.max(1, stageEl.clientHeight);
    let pr = settings.pixelRatio(window.devicePixelRatio || 1) * cfg.governor.scales[renderScaleIdx];
    const maxPr = Math.sqrt(settings.maxPixels / (cssW * cssH));
    pr = Math.max(0.5, Math.min(pr, maxPr));
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
    computeViews();
    if (cam.t >= 1) goView(currentView, true);
  }
  window.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => setTimeout(applySize, 200));
  applySize();
  goView('main', true);

  // ---------- input, overlay, hint
  const overlay = C.createOverlay(stageEl, { onReplay: replay });
  const inp = C.createInput(THREE, stageEl, {
    getCamera: () => camera,
    getHitTargets: () => hero.hitTargets,
    fallbackDepth: () => camera.position.distanceTo(cam.target),
    onTouch(px, py, partId) { overlay.ripple(px, py, !!partId); },
  });
  // first touch unlocks WebAudio (iOS needs a gesture)
  // (iOS versions differ in which event counts as the gesture, so try down and up)
  ['pointerdown', 'pointerup', 'touchend'].forEach((t) => document.addEventListener(t, () => audio.unlock(), { capture: true }));
  ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  const pv = new THREE.Vector3(), pv2 = new THREE.Vector3();
  function hintScreen() {
    let h = null;
    try { h = hero.getHint(); } catch (e) { C.reportError(e); }
    if (!h || !h.point) return null;
    pv.copy(h.point).project(camera);
    const x = (pv.x + 1) / 2 * cssW, y = (1 - pv.y) / 2 * cssH;
    let dx = 0, dy = 0;
    if (h.dir) {
      pv2.copy(h.dir).multiplyScalar(0.6).add(h.point).project(camera);
      dx = (pv2.x + 1) / 2 * cssW - x; dy = (1 - pv2.y) / 2 * cssH - y;
      const len = Math.hypot(dx, dy) || 1, L = Math.min(160, 0.2 * Math.min(cssW, cssH));
      dx = dx / len * L; dy = dy / len * L;
    }
    return { partId: h.partId, x, y, dx, dy, onScreen: pv.z < 1 && x >= 0 && x <= cssW && y >= 0 && y <= cssH };
  }
  let hintSounded = false, finishedAt = -1, touchedOnce = false;
  function updateHint(input) {
    // first visit: show the finger after ~1 s so the very first second already says "turn this";
    // afterwards the usual 3 s of stillness (docs/PLAN.md §1)
    if (input.down !== null || input.pointer.active) touchedOnce = true;
    const wait = touchedOnce ? cfg.idleHintSec : cfg.firstHintSec;
    const want = !heroState.busy && !heroState.finished && !input.pointer.active && input.idle >= wait;
    const hs = want ? hintScreen() : null;
    if (hs) {
      overlay.showHint(hs.x, hs.y, hs.dx, hs.dy);
      if (!hintSounded) { hintSounded = true; audio.play('hint', { gain: 0.6 }); }
    } else overlay.hideHint();
    if (!want) hintSounded = false;
  }
  function replay() {
    overlay.setReplay(false); finishedAt = -1;
    inp.reset();
    try { hero.reset(); } catch (e) { C.reportError(e); }
    audio.play('reset');
    goView('main', false);
  }

  // ---------- context loss: keep game state, rebuild GPU resources
  function onContextLost(e) {
    e.preventDefault();
    contextLost = true; lostCount++;
    overlay.setVeil(true);
    scheduleRecovery();
  }
  // no restore event: ask for one, then rebuild the renderer on a new canvas (game state stays in JS).
  // Short waits: a child should not stare at the veil for long. A hidden tab waits until it is shown again.
  function scheduleRecovery() {
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => {
      if (!contextLost || document.hidden) return;
      try { renderer.forceContextRestore(); } catch (_) { /* ignore */ }
      lostTimer = setTimeout(() => { if (contextLost && !document.hidden) rebuildRenderer(); }, 2500);
    }, 1500);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && contextLost) scheduleRecovery(); });
  function afterRestore() {
    contextLost = false;
    clearTimeout(lostTimer);
    store.reuploadAll();
    try { hero.onContextRestored && hero.onContextRestored(); } catch (err) { C.reportError(err); }
    frameStats.reset();
    overlay.setVeil(false);
  }
  function onContextRestored() { afterRestore(); }
  function rebuildRenderer() {
    const old = canvas;
    old.removeEventListener('webglcontextlost', onContextLost); old.removeEventListener('webglcontextrestored', onContextRestored);
    try { renderer.dispose(); } catch (_) { /* ignore */ }
    old.remove();
    makeRenderer();
    applySize();
    afterRestore();
  }

  // ---------- main loop
  let last = performance.now(), time = 0, firstFrame = true, readyMs = 0, readyNavMs = 0, startOk = false;
  let lastMeasure = 0, lastDbg = 0, measure = null, govAt = 0, heroErrAt = -10;
  const cpu = { update: 0, render: 0 };
  const dbg = cfg.debug ? C.createDebugOverlay(stageEl) : null;

  function governor(now) {
    if (now - govAt < cfg.governor.windowMs || now - t0 < 4000) return;
    govAt = now;
    const f = frameStats.summary();
    if (f.frames > 30 && f.p95Ms > cfg.governor.p95LimitMs && renderScaleIdx < cfg.governor.scales.length - 1) {
      renderScaleIdx++; applySize(); frameStats.reset();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const rawMs = now - last; last = now;
    const dt = Math.min(0.05, Math.max(0, rawMs / 1000));
    if (!startOk) return;
    if (!firstFrame) frameStats.push(rawMs);
    const c0 = performance.now();
    time += dt;
    const input = inp.beginFrame(time);
    try { hero.update(dt, input); } catch (e) { if (time - heroErrAt > 1) { heroErrAt = time; C.reportError(e); } }
    try { heroState = hero.getState() || heroState; } catch (e) { C.reportError(e); }
    // replay button 3 s after the finale in real time (the clamped game time crawls below 20 fps; docs/hero-notes.md §9-1)
    if (heroState.finished) { if (finishedAt < 0) finishedAt = now; if (now - finishedAt > 3000) overlay.setReplay(true); }
    else if (finishedAt >= 0) { finishedAt = -1; overlay.setReplay(false); }
    env.update(dt);
    updateCamera(dt);
    updateHint(input);
    overlay.update(dt);
    if (contextLost) return;
    const c1 = performance.now();
    renderer.render(scene, camera);
    const c2 = performance.now(); // CPU per frame (moving averages): game update / issuing the draw calls
    cpu.update += ((c1 - c0) - cpu.update) * 0.05; cpu.render += ((c2 - c1) - cpu.render) * 0.05;
    if (firstFrame) { firstFrame = false; readyNavMs = Math.round(performance.now()); readyMs = Math.round(readyNavMs - t0); api.ready = true; document.body.classList.add('ready'); }
    governor(now);
    if (dbg && now - lastMeasure > 1000) { lastMeasure = now; measure = C.measureAll(renderer, scene, hero.root); } // debug only
    if (dbg && now - lastDbg > 250) {
      lastDbg = now;
      dbg.render({
        tier: cfg.tier, mobile: cfg.device.mobile, renderScale: cfg.governor.scales[renderScaleIdx], dpr: renderer.getPixelRatio().toFixed(2),
        cssW, cssH, frame: frameStats.summary(), cpu, measure, stage: heroState.stage, stageCount: hero.stageCount || 1,
        stageName: heroState.stageName || '', busy: heroState.busy, finished: heroState.finished, view: currentView, idle: input.idle,
        readyMs, readyNavMs, texLoaded: store.allLoaded(), audio: audio.state, contextLost, lostCount,
      });
    }
  }

  // ---------- test/debug handle (harmless in production)
  const api = {
    ready: false,
    config: cfg,
    get readyMs() { return readyMs; },
    get readyNavMs() { return readyNavMs; }, // first frame (= first touch possible) since navigation start
    state: () => Object.assign({ stageCount: hero.stageCount }, heroState),
    hintScreen,
    stats: () => Object.assign({ frame: frameStats.summary(), cpuMs: { update: +cpu.update.toFixed(3), render: +cpu.render.toFixed(3) }, readyMs, readyNavMs, renderScale: cfg.governor.scales[renderScaleIdx] }, C.measureAll(renderer, scene, hero.root)),
    errors: C.errors, stages: stageLog, sounds: soundLog,
    contextLost: () => contextLost,
    loseContext() { const ext = renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) return false; ext.loseContext(); window.__castleLoseExt = ext; return true; },
    restoreContext() { const ext = window.__castleLoseExt; if (!ext) return false; ext.restoreContext(); return true; },
    replayVisible: () => document.querySelector('.ov-replay').classList.contains('show'),
    texturesLoaded: () => store.allLoaded(),
    view: () => currentView,
  };
  window.__castle = api;

  requestAnimationFrame(frame);
  // wait briefly for textures so the first frame is not flat-coloured (never longer than 600 ms)
  store.whenLoaded(store.requested(), 600).then(() => { startOk = true; last = performance.now(); });
})(window.Castle = window.Castle || {});
