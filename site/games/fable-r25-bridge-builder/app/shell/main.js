// Shell entry: renderer, tiers, scene, hero, input, audio, camera, flow, debug, context loss.
// Loaded as an ES module over http(s); bundled to dist/game.js (classic script) for file://.
import * as THREE from '../vendor/three/three.module.js';
import { createHero } from '../hero/hero.js';
import { TARGETS, SOUND_NAMES, landingPoint } from './config.js';
import { detectTier, pixelRatioFor, PerfGovernor, TIERS } from './tier.js';
import { loadTextures, markTexturesDirty } from './textures.js';
import { buildWorld, HORIZON } from './world.js';
import { buildDecor } from './decor.js';
import { buildTrains } from './train.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Hint } from './hint.js';
import { DebugOverlay, installErrorCapture, errors } from './debug.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const VIEW_OF = { extend: 'work', lift: 'work', turn: 'work', lock: 'work', busy: 'work', cross: 'cross', finale: 'finale' };

function replayButton(onReplay) {
  const b = document.createElement('div');
  b.className = 'r25-replay';
  b.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <path d="M50 18 a32 32 0 1 1 -29 18" fill="none" stroke="#ff7eb6" stroke-width="12" stroke-linecap="round"/>
      <path d="M8 30 L22 50 L36 28 Z" fill="#ff7eb6" stroke="#ff7eb6" stroke-width="6" stroke-linejoin="round"/>
    </svg>`;
  b.addEventListener('pointerup', (e) => { e.preventDefault(); if (b.classList.contains('show')) onReplay(); });
  document.body.appendChild(b);
  return { show() { b.classList.add('show'); }, hide() { b.classList.remove('show'); }, get shown() { return b.classList.contains('show'); } };
}

async function boot() {
  installErrorCapture();
  const T = { start: Math.round(performance.now()) };   // boot timings (ms from navigation start)
  let tier = detectTier();
  const canvas = document.getElementById('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.antialias, alpha: false, stencil: false, powerPreference: 'high-performance' });
  } catch (e) {
    document.body.classList.add('nogl');
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1200);
  const rig = new CameraRig(THREE, camera);

  // --- the first (and only) scene
  const tex = await loadTextures(THREE, tier);
  T.textures = Math.round(performance.now());
  const world = buildWorld(THREE, tex);
  scene.add(world.group);
  scene.fog = world.fog;
  const decor = buildDecor(THREE, tex, world.islands);
  scene.add(decor.group);
  const sfx = new Sfx();
  const trains = buildTrains(THREE, tex, TARGETS.length, sfx);
  scene.add(trains.group);
  T.world = Math.round(performance.now());

  // --- flow state (shell side)
  const flow = { stage: null, round: 0, stageStart: 0, phase: 'play', trainsArrived: 0, locks: 0, contextLosses: 0, contextRestores: 0, heroErrors: 0 };
  let clock = 0;
  const timers = [];
  const later = (sec, fn) => timers.push({ at: clock + sec, fn });

  let hero = null;
  const v = new THREE.Vector3();
  function onEvent(e) {
    if (!e || !e.type) return;
    if (e.type === 'sound') {
      if (SOUND_NAMES.includes(e.name)) sfx.play(e.name, e);
    } else if (e.type === 'stage') {
      flow.stage = e.stage; flow.round = e.round | 0; flow.stageStart = clock;
      rig.setView(VIEW_OF[e.stage] || 'work', flow.round);
      if (e.stage === 'cross') {
        const r = flow.round;
        later(1.0, () => {
          const pts = hero.getDeckPath(r).map((p) => hero.root.localToWorld(p.clone()));
          const is = world.islands[r];
          if (pts.length < 2) { pts.length = 0; pts.push(new THREE.Vector3(0, 1, 0), landingPoint(is.target, v).clone()); }
          trains.start(r, pts, is.landing, is.dir, is.target.height, () => {
            flow.trainsArrived++;
            decor.bloom(r);
            sfx.play('chime');
            later(1.3, () => { try { hero.advance(); } catch (err) { console.error(err); } });
          });
        });
      }
    } else if (e.type === 'locked') {
      flow.locks++;
      decor.raiseFlag(e.round | 0);
    } else if (e.type === 'complete') {
      flow.phase = 'finale';
      decor.finale();
      sfx.play('fanfare');
      later(1.6, () => sfx.play('toot'));
      later(2.4, () => sfx.play('toot', { pitch: 1.2 }));
      later(4.5, () => { replay.show(); flow.phase = 'replay'; sfx.play('pop'); });
    }
  }

  hero = createHero(THREE, {
    targets: TARGETS.map((t) => ({ id: t.id, yaw: t.yaw, distance: t.distance, height: t.height, launchYaw: t.launchYaw, color: t.color })),
    textures: { wood: tex.heroWood, blob: tex.blob },
    quality: { tier: tier.name, anisotropy: tier.anisotropy },
    onEvent,
  });
  scene.add(hero.root);
  T.hero = Math.round(performance.now());

  // Keep shader programs stable for the whole game: an InstancedMesh that first gets
  // per-instance colours later (e.g. the lock flash) would otherwise need a new shader at that
  // moment, which is a visible hitch on iPad. White instance colours look the same.
  scene.traverse((o) => {
    if (o.isInstancedMesh && !o.instanceColor) {
      o.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.instanceMatrix.count * 3).fill(1), 3);
    }
  });

  const replay = replayButton(() => {
    replay.hide();
    timers.length = 0;
    trains.reset();
    decor.reset();
    hero.reset();
    flow.phase = 'play';
    sfx.play('whoosh');
  });

  // --- input, hint, debug
  const input = new Input(THREE, canvas, camera, () => hero && hero.controls, () => sfx.unlock());
  const hint = new Hint(THREE, document.body);
  const debug = new DebugOverlay(DEBUG);
  const governor = new PerfGovernor();
  let timeScale = 1;

  // --- size
  let cssW = 1, cssH = 1;
  function resize() {
    cssW = Math.max(1, window.innerWidth); cssH = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(pixelRatioFor(tier, cssW, cssH));
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    rig.resize(camera.aspect);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  rig.setView('work', 0, true);

  // --- WebGL context loss: stop drawing, keep game state, re-upload on restore
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; flow.contextLosses++; }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    markTexturesDirty(tex);
    try { hero.onContextRestored && hero.onContextRestored(); } catch (err) { console.error(err); }
    resize();
    lost = false;
    flow.contextRestores++;
    last = performance.now();
  }, false);

  // --- pause when hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sfx.suspend(); else { sfx.resume(); last = performance.now(); }
  });

  function step(dt) {
    clock += dt;
    const st = input.frame(clock, cssW, cssH, flow.stageStart);
    try {
      hero.update(dt, st);
    } catch (err) {
      flow.heroErrors++;
      if (flow.heroErrors < 5) console.error(err);
    }
    input.endFrame();
    const hs = hero.getState();
    sfx.setMotor(hs.motor);
    world.update(dt);
    decor.update(dt);
    trains.update(dt);
    rig.update(dt);
    const ctl = hs.control && hero.controls ? hero.controls[hs.control] : null;
    hint.update(dt, ctl, st, rig.moving);
    for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { const t = timers.splice(i, 1)[0]; t.fn(); }
  }

  let last = performance.now();
  const ctx = { THREE, renderer, scene, camera, heroRoot: hero.root, tier, state: hero.getState(), extraLine: '', bootMs: 0, firstFrameMs: 0, losses: 0, restores: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (lost || document.hidden) return;
    debug.frame(realDt * 1000);
    if (governor.sample(realDt) && !tier.forced && tier.name !== 'low') {
      tier = { ...tier, ...TIERS.low, name: 'low' };
      ctx.tier = tier;
      resize();
    }
    let remaining = realDt * timeScale, n = 0;
    do { const dt = Math.min(0.05, remaining); remaining -= dt; step(dt); n++; } while (remaining > 1e-4 && n < 16);
    renderer.render(scene, camera);
    if (!api.firstFrameMs) { api.firstFrameMs = ctx.firstFrameMs = Math.round(performance.now()); }
    ctx.state = hero.getState();
    ctx.losses = flow.contextLosses; ctx.restores = flow.contextRestores;
    ctx.extraLine = `flow ${flow.phase} x${timeScale}`;
    debug.update(realDt, ctx);
  }

  // --- debug / smoke-test hooks
  const api = {
    ready: true,
    bootMs: Math.round(performance.now()),   // ms from navigation start: scene built, input live
    firstFrameMs: 0,                         // ms from navigation start: first frame drawn
    timings: T,
    tier: tier.name,
    errors,
    state: () => ({ ...hero.getState(), phase: flow.phase, flow: { ...flow }, replayShown: replay.shown, tier: tier.name, sounds: sfx.count }),
  };
  let loseExt = null;
  if (DEBUG) {
    Object.assign(api, {
      hero,
      finishStage: () => hero.debugFinishStage(),
      setTimeScale: (k) => { timeScale = Math.max(0.1, Math.min(8, k)); },
      // keep the extension object: getExtension() returns null while the context is lost
      loseContext: () => { loseExt = renderer.getContext().getExtension('WEBGL_lose_context'); loseExt && loseExt.loseContext(); return !!loseExt; },
      restoreContext: () => { loseExt && loseExt.restoreContext(); },
      isContextLost: () => lost,
      controlScreen: (id) => { const c = hero.controls[id]; if (!c) return null; c.anchor.getWorldPosition(v); return input.project(v, {}); },
      report: () => debug.measure(ctx),
      replay: () => replay.shown && (replay.hide(), timers.length = 0, trains.reset(), decor.reset(), hero.reset(), flow.phase = 'play'),
      cameraPose: () => ({ pos: camera.position.toArray(), moving: rig.moving }),
      programs: () => renderer.info.programs.map((p) => p.cacheKey),
    });
    debug.addButton('skip', () => hero.debugFinishStage());
    debug.addButton('x4', () => { timeScale = timeScale === 1 ? 4 : 1; });
    debug.addButton('lose ctx', () => { api.loseContext(); setTimeout(api.restoreContext, 1500); });
  }
  ctx.bootMs = api.bootMs;
  window.__r25 = api;
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  window.__r25 = { ready: false, error: String(e && e.message || e), errors };
});
