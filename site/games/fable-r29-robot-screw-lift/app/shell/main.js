// シェルの入口：renderer・場面・入力・音・カメラ・hero の読み込み・ループ・コンテキスト喪失・デバッグ。
import * as THREE from '../vendor/three/three.module.min.js';
import { detectTier } from './tier.js';
import { loadTextures, makeBlobTexture, makePlasterTexture, makeEnvEquirect } from './textures.js';
import { createEnvironment } from './env.js';
import { createCameraRig } from './camera.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { createErrorLog, createFrameStats, createDebugOverlay } from './debug.js';
import { mergeGeometries, measureScene, sanityScan } from './util.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const log = createErrorLog();
const notes = [];
const note = (s) => { notes.push(s); if (notes.length > 10) notes.shift(); if (DEBUG) console.info('[r29]', s); };

boot().catch((e) => { log.push('boot: ' + (e && (e.stack || e.message) || e)); console.error(e); });

async function loadHeroModule() {
  if (window.R29Hero && window.R29Hero.createHero) return { mod: window.R29Hero, how: 'hero.bundle.js' };
  if (location.protocol !== 'file:' && params.get('herobundle') !== '1') {
    try {
      const url = new URL('hero/hero.js', document.baseURI).href;
      const mod = await import(/* @vite-ignore */ url);
      return { mod, how: 'hero.js (module)' };
    } catch (e) {
      note('hero.js import failed, falling back to bundle: ' + (e && e.message));
    }
  }
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'hero/hero.bundle.js';
    s.onload = res; s.onerror = () => rej(new Error('hero.bundle.js load failed'));
    document.head.appendChild(s);
  });
  return { mod: window.R29Hero, how: 'hero.bundle.js' };
}

// 起動の時刻（ページの読み込み開始からの ms）。?debug=1 と docs/perf.md の計測用
const timeline = { shellStart: Math.round(performance.now()) };

async function boot() {
  const t0 = performance.now();
  const tier = detectTier(params);
  const container = document.getElementById('app') || document.body;
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  container.appendChild(canvas);

  const heroLoad = loadHeroModule(); // 並行して読む

  // ---- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.msaa, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0xd9cbb4, 1);
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  let dprScale = 1;

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    let dpr = tier.dpr * dprScale;
    if (w * h * dpr * dpr > tier.maxPixels) dpr = Math.sqrt(tier.maxPixels / (w * h));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rig && rig.resize();
  }

  // ---- 場面
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 120);
  let rig = null;
  resize();

  const tex = loadTextures(THREE, tier, (e) => log.push(e.message));
  tex.whenReady(() => { timeline.texturesReady = Math.round(performance.now()); });
  tex.plaster = makePlasterTexture(THREE);
  tex.blob = makeBlobTexture(THREE);
  const env = createEnvironment(THREE, { textures: { envSky: tex.envSky, envFloor: tex.envFloor, envWood: tex.envWood, envMetal: tex.envMetal, plaster: tex.plaster }, tier });
  scene.add(env.root);

  // 環境マップ（PMREM）。コンテキスト復帰時にも作り直す
  let envRT = null, pmremBytes = 0;
  const envSrc = makeEnvEquirect(THREE);
  function buildEnvMap() {
    const pm = new THREE.PMREMGenerator(renderer);
    if (envRT) envRT.dispose();
    envRT = pm.fromEquirectangular(envSrc);
    pm.dispose();
    envSrc.dispose(); // 元の 256×128 は PMREM を作ったら GPU から外す（復帰時は canvas から再送される）
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
    pmremBytes = envRT.width * envRT.height * 8; // HalfFloat RGBA
  }
  buildEnvMap();

  // ---- 入力・音・UI
  const audio = createAudio();
  const ui = createUI(container);
  const stats = createFrameStats();
  const overlay = DEBUG ? createDebugOverlay() : null;
  let hero = null;
  let stage = { id: 'loading', round: 0, progress: 0, view: 'overview', targets: [] };
  const input = createInput(THREE, canvas, camera, () => (hero ? hero.getTargets() : []));
  const unlock = () => audio.unlock();
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });

  // ---- hero
  const { mod, how } = await heroLoad;
  if (!mod || typeof mod.createHero !== 'function') throw new Error('createHero not found');
  let replayTimer = 0;
  const stageLog = [];
  const heroOpts = {
    tier,
    textures: { brass: tex.heroBrass, metal: tex.heroMetal, wood: tex.heroWood, blob: tex.blob },
    util: { mergeGeometries: (g) => mergeGeometries(THREE, g) },
    debug: DEBUG,
    onStage(s) {
      stage = { id: s.id, round: s.round | 0, progress: +s.progress || 0, view: s.view || 'overview', targets: (s.targets || []).slice() };
      stageLog.push(stage.id + (stage.round ? stage.round : ''));
      if (stageLog.length > 100) stageLog.shift();
      if (rig) rig.goTo(stage.view);
      if (stage.id === 'celebrate') {
        audio.play('fanfare');
        env.confetti.burst(new THREE.Vector3(0, 2.9, 0.4));
      }
      if (stage.id === 'done') replayTimer = 1.5;
      else { replayTimer = 0; ui.showReplay(false); }
      if (DEBUG) note('stage ' + stage.id + ' r' + stage.round);
    },
    onSound(name, p) { audio.play(name, p || {}); },
  };
  timeline.heroLoaded = Math.round(performance.now());
  hero = mod.createHero(THREE, heroOpts);
  scene.add(hero.root);
  timeline.heroCreated = Math.round(performance.now());
  rig = createCameraRig(THREE, camera, hero.views);
  rig.goTo('overview', true);
  note(`hero: ${how}${mod.__hash ? ' ' + mod.__hash : ''}`);

  ui.replayButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.unlock();
    if (!ui.replayVisible) return;
    ui.showReplay(false);
    audio.play('pop');
    hero.reset();
  });

  // ---- コンテキスト喪失
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    ui.showVeil(true);
    note('webglcontextlost');
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    // three は自前のリスナーで GL 状態を作り直し、geometry/texture を次の描画で再送する。
    // シェルは PMREM（描画で作った資源）を作り直し、画像テクスチャも念のため再送指示。
    try {
      buildEnvMap();
      for (const k of ['envSky', 'envFloor', 'envWood', 'envMetal', 'heroBrass', 'heroMetal', 'heroWood']) if (tex[k].image) tex[k].needsUpdate = true;
      tex.plaster.needsUpdate = true; tex.blob.needsUpdate = true;
      hero.onContextRestored && hero.onContextRestored();
    } catch (err) { log.push('restore: ' + err.message); }
    lost = false;
    ui.showVeil(false);
    note('webglcontextrestored');
  }, false);

  // ---- 表示・非表示
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) audio.suspend(); else audio.resume();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---- 実行時の降格（性能の上限を守る）
  let govT = 0, govLow = 0, govStep = 0, uptime = 0;
  const noGov = params.get('nogov') === '1';
  function governor(dt) {
    if (noGov) return;
    uptime += dt;
    govT += dt;
    if (uptime < 5 || govT < 1) return;
    govT = 0;
    const fps = stats.recentFps(60);
    govLow = fps < 40 ? govLow + 1 : 0;
    if (govLow < 4 || govStep >= 2) return;
    govLow = 0;
    govStep++;
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
      env.disableShadows();
      tier.shadows = false;
      // hero にも知らせる（影の代わりに疑似影へ。docs/hero-notes.md §8.1）
      try { hero.onTierChange && hero.onTierChange(tier); } catch (err) { log.push('onTierChange: ' + err.message); }
      note('governor: shadows off');
    } else if (!tier.isMobile && dprScale > 0.6) {
      dprScale *= 0.75;
      resize();
      note('governor: dpr x' + dprScale.toFixed(2));
    }
  }

  // ---- 指のお手本の補助
  const HINT_FIRST = 1.0, HINT_IDLE = 3.0;
  let touchedOnce = false, replayShownT = 0;
  input.on('down', () => { touchedOnce = true; if (!timeline.firstTouch) timeline.firstTouch = Math.round(performance.now()); });
  const camRight = new THREE.Vector3(), rimW = new THREE.Vector3(), rimXY = {};
  // 操作部の半径（ワールド、target.radius）を画面 px に直す。ぐるぐるの指を輪に沿わせる（docs/hero-notes.md §8.5）
  function radiusPx(t) {
    if (!(t.radius > 0) || !t.anchor) return 0;
    camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    rimW.copy(t.anchor).addScaledVector(camRight, t.radius);
    input.projectAnchor({ anchor: rimW }, rimXY);
    return Math.hypot(rimXY.x - anchorXY.x, rimXY.y - anchorXY.y);
  }

  // ---- 隠れている部品（おもちゃ・ばね・きらきら・紙吹雪）のシェーダーを、最初の数フレームのあとで先に作る。
  // 頂上の見せ場で初めてシェーダーを作ると、iPad で一瞬止まるため。1 フレームに 1 部品ずつ（止まりを分ける）。
  let precompileQueue = null;
  function precompileStep() {
    if (!precompileQueue) {
      precompileQueue = [];
      scene.traverse((o) => { if (!o.visible) precompileQueue.push(o); });
    }
    const o = precompileQueue.shift();
    if (!o) { timeline.precompiled = Math.round(performance.now()); return; }
    renderer.compile(o, camera, scene); // three の compile は非表示の子も含めて material を集める。光は scene のものを使う
  }

  // ---- ループ
  let last = performance.now();
  let measure = null, sanity = null, measureT = 0, overlayT = 0, frames = 0;
  const anchorXY = {};
  let lastIdle = 0, lastTime = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const rawDt = (nowMs - last) / 1000;
    last = nowMs;
    if (hidden || lost) return;
    if (frames === 1 && !timeline.firstShown) timeline.firstShown = Math.round(nowMs); // 最初の絵が画面に出たあとの次の呼び出し
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    stats.add(rawDt * 1000);
    try {
      const inp = input.frame(dt);
      lastIdle = inp.idle;
      lastTime = inp.time;
      hero.update(dt, inp);
      env.update(dt);
      rig.update(dt);

      // 止まったら指のお手本。最初の intro（まだ一度も触っていない）は 1 秒、ほかは 3 秒。
      // 操作中・カメラ移動中は出さない。done では「もう一回」の矢印の上で「ちょん」を見せる
      let hinted = false;
      const hintDelay = stage.id === 'intro' && !touchedOnce ? HINT_FIRST : HINT_IDLE;
      if (!input.grabbing && inp.idle > hintDelay && !rig.moving) {
        const ts = hero.getTargets();
        for (let i = 0; i < ts.length; i++) {
          if (!ts[i].enabled) continue;
          input.projectAnchor(ts[i], anchorXY);
          if (!anchorXY.behind) { ui.hint(true, anchorXY.x, anchorXY.y, ts[i].gesture, dt, radiusPx(ts[i])); hinted = true; }
          break;
        }
      }
      if (replayTimer > 0) { replayTimer -= dt; if (replayTimer <= 0) { ui.showReplay(true); replayShownT = 0; } }
      if (ui.replayVisible) {
        replayShownT += dt;
        if (!hinted && replayShownT > 1.5 && inp.idle > 1.5) {
          const r = ui.replayButton.getBoundingClientRect();
          ui.hint(true, r.left + r.width / 2, r.top + r.height * 0.45, 'tap', dt, 0);
          hinted = true;
        }
      }
      if (!hinted) ui.hint(false, 0, 0, null, dt);

      renderer.render(scene, camera);
      frames++;
      if (frames === 1) {
        timeline.firstFrame = Math.round(performance.now());
        const bootEl = document.getElementById('boot');
        if (bootEl) { bootEl.style.opacity = '0'; setTimeout(() => bootEl.remove(), 400); }
      }
      if (frames >= 4 && !timeline.precompiled) precompileStep();
      governor(rawDt);
    } catch (err) {
      log.push('frame: ' + (err && (err.stack || err.message) || err));
    }

    if (DEBUG) {
      measureT -= dt; overlayT -= dt;
      if (measureT <= 0) { measure = measureScene(scene, hero.root, renderer, { pmremBytes, shadowMapSize: tier.shadowMapSize }); sanity = sanityScan(scene); measureT = 1; }
      if (overlayT <= 0) {
        overlayT = 0.25;
        const c = renderer.domElement;
        overlay.render({
          tier, shadows: renderer.shadowMap.enabled, mode: 'shell ' + (window.__R29_SHELL_MODE || 'src') + ' / ' + how,
          canvasW: c.width, canvasH: c.height, dpr: renderer.getPixelRatio(),
          fps: stats.avgFps(), p95: stats.p95Ms(),
          calls: renderer.info.render.calls, trisFrame: renderer.info.render.triangles,
          measure, sanity, timeline, programs: renderer.info.programs ? renderer.info.programs.length : 0,
          stage, view: rig.view, idle: lastIdle, notes, errors: log.errors,
        });
      }
    }
  }
  requestAnimationFrame((n) => { last = n; frame(n); });

  // ---- 煙テスト・デバッグ用の窓口
  let loseExt = null;
  window.__r29 = {
    ready: true,
    bootMs: Math.round(performance.now() - t0),
    timeline,
    hero, // デバッグ用：hero を直接触る（段階を飛ばして見た目を確かめる等。docs/hero-notes.md §8.6）
    time: () => lastTime, // ゲーム内の時刻（秒）。煙テストはこれで待つ
    sanity: () => sanityScan(scene),
    heroHow: how,
    tier,
    errors: log.errors,
    notes,
    get frames() { return frames; },
    stage: () => Object.assign({}, stage),
    stageLog,
    idle: () => lastIdle,
    hintVisible: () => ui.hintVisible,
    view: () => rig.view,
    cameraMoving: () => rig.moving,
    targets: () => hero.getTargets().map((t) => {
      const xy = input.projectAnchor(t, {});
      return { id: t.id, enabled: !!t.enabled, gesture: t.gesture, x: xy.x, y: xy.y };
    }),
    replay: () => {
      const r = ui.replayButton.getBoundingClientRect();
      return { visible: ui.replayVisible, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    texturesReady: () => new Promise((res) => tex.whenReady(res)),
    measure: () => measureScene(scene, hero.root, renderer, { pmremBytes, shadowMapSize: tier.shadowMapSize }),
    renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    loseContext() { loseExt = loseExt || renderer.getContext().getExtension('WEBGL_lose_context'); loseExt && loseExt.loseContext(); },
    restoreContext() { loseExt && loseExt.restoreContext(); },
    isContextLost: () => lost,
  };
  note(`boot ${window.__r29.bootMs} ms`);
}
