// シェル本体：起動・描画ループ・hero の呼び出し・段階→カメラ・音・ヒント・debug・コンテキスト喪失。
// 読み込み順（index.html）：three.iife.js → textures.js → hero.bundle.js → このファイル。
import { detectTier, effectivePixelRatio, PerfGovernor } from './tiers.js';
import { loadTextures } from './textures.js';
import { buildBackground } from './scene.js';
import { createEnvironment } from './env.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createCameraRig } from './camera.js';
import { createHintLayer } from './hint.js';
import { createStats } from './debug.js';

const THREE = window.THREE;
const ADDONS = window.THREE_ADDONS || {};
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';

// 段階 → カメラの定位置（docs/HERO-SPEC.md 2.4）
const VIEW_OF = { fabric: 'front', foot: 'front', sew1: 'front', cover: 'front', sew2: 'inside', finish: 'display' };

const errors = [];
function recordError(e) {
  const msg = e && e.message ? e.message : String(e);
  errors.push(msg);
  if (errors.length > 50) errors.shift();
}
window.addEventListener('error', (e) => recordError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => recordError(e.reason));
const origConsoleError = console.error.bind(console);
console.error = (...a) => { recordError(a.map(String).join(' ')); origConsoleError(...a); };

const clock = { t0: performance.now() };
const now = () => (performance.now() - clock.t0) / 1000;

async function boot() {
  const T_START = now();
  if (!THREE) throw new Error('three が読み込めませんでした');
  const tier = detectTier(params);
  const stageEl = document.getElementById('stage');
  const fxEl = document.getElementById('fx');

  // --- レンダラー ---
  const renderer = new THREE.WebGLRenderer({ antialias: tier.antialias, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false; // 影は疑似影
  stageEl.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6e9e4);
  const rig = createCameraRig(THREE);
  const camera = rig.camera;

  // --- テクスチャ（data URI）・周辺・環境マップ ---
  // 小花の布（1024²）は 4 回目まで使わないので、最初の描画の後に展開する（起動時に作るのは最初の場面だけ）
  const tex = await loadTextures(THREE, renderer, { defer: ['floral_cotton_1024'] });
  const bg = buildBackground(THREE, scene, tex, tier);
  const env = createEnvironment(THREE, renderer, scene, tier.envSize);

  // --- 音・入力・ヒント ---
  const audio = createAudio();
  const inp = createInput(THREE, canvas, () => camera, now);
  const hintLayer = createHintLayer(fxEl);

  // --- hero ---
  const state = { stage: 'fabric', stageLog: [], contextLost: false, lostCount: 0, restoredCount: 0, heroFailed: 0, frames: 0, firstFrameAt: 0 };
  let hero = null;
  const heroOpts = {
    addons: ADDONS,
    textures: { metal: tex.brushed_metal_1024, linen: tex.linen_fabric_1024, floral: tex.floral_cotton_1024 },
    tier: { name: tier.name, detail: tier.detail, maxTextureSize: tier.maxTextureSize },
    displaySlots: bg.displaySlots,
    debug: DEBUG,
    onStage(stage, info) {
      state.stageLog.push({ stage, t: +now().toFixed(2), round: info && info.round });
      state.stage = stage;
      rig.go(VIEW_OF[stage] || 'front');
    },
    onCue(name, p) {
      if (name === 'nudge') hintLayer.force(2.5);
      audio.cue(name, p);
    },
  };
  try {
    const mod = window.__HERO_MODULE__;
    if (!mod || typeof mod.createHero !== 'function') throw new Error('hero.bundle.js に createHero がありません');
    hero = mod.createHero(THREE, heroOpts);
    if (!hero || !hero.root) throw new Error('createHero の戻り値に root がありません');
    scene.add(hero.root);
    state.stage = (hero.status && hero.status.stage) || 'fabric';
    state.stageLog.push({ stage: state.stage, t: +now().toFixed(2), round: 0 });
  } catch (e) {
    console.error('hero: ' + (e && e.message ? e.message : e));
    hero = null;
  }
  rig.go(VIEW_OF[state.stage] || 'front');

  // --- 大きさ ---
  function resize() {
    const w = Math.max(1, stageEl.clientWidth), h = Math.max(1, stageEl.clientHeight);
    renderer.setPixelRatio(effectivePixelRatio(tier, w, h));
    renderer.setSize(w, h, false);
    rig.setAspect(w / h, state.frames === 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  const governor = new PerfGovernor(tier, resize);

  // --- 最初のタッチで音を有効化（iOS） ---
  inp.onDown((x, y, part) => {
    audio.unlock();
    hintLayer.ripple(x, y);
    if (!part) audio.cue('ripple');
  });

  // --- コンテキスト喪失／復帰（three の内部処理の後に走る） ---
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    state.contextLost = true; state.lostCount++;
    try { hero && hero.onContextLost && hero.onContextLost(); } catch (err) { recordError(err); }
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    state.contextLost = false; state.restoredCount++;
    try {
      env.rebuild(); // PMREM は中身が消えるので作り直す
      scene.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          m.needsUpdate = true;
          for (const v of Object.values(m)) if (v && v.isTexture && !v.isRenderTargetTexture && v.image) v.needsUpdate = true;
        }
        if (o.isInstancedMesh) { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
      });
      hero && hero.onContextRestored && hero.onContextRestored();
    } catch (err) { recordError(err); }
  }, false);

  // --- タブが隠れたら止める ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend(); else { audio.resume(); lastT = now(); }
  });

  // --- debug ---
  const stats = createStats(THREE, renderer, scene, () => hero && hero.root, tier, env);
  let dbgEl = null, dbgAge = 1;
  if (DEBUG) { dbgEl = document.createElement('div'); dbgEl.id = 'debug'; document.body.appendChild(dbgEl); }

  // --- 最初の描画の後にやること：後回しのテクスチャの展開と、あとで出てくる材質のシェーダーの下準備 ---
  function afterFirstFrame() {
    tex.loadDeferred().catch(recordError);
    // まだ一度も描いていない材質（完成のきらきら等）のシェーダーを先に作る。完成の飛行中に作ると引っかかるため。
    // compileAsync は見えない物の材質も含めて scene 全体を下準備する（KHR_parallel_shader_compile があれば裏で）。
    if (renderer.compileAsync && !state.contextLost) renderer.compileAsync(scene, camera).catch(recordError);
  }

  // --- ループ ---
  let lastT = now();
  let hint = null;
  function frame() {
    const t = now();
    let dt = t - lastT; lastT = t;
    if (document.hidden) return;
    const rawDt = dt;
    dt = Math.min(0.05, Math.max(0, dt));
    const vp = { width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 };

    rig.update(dt);
    const input = inp.frame(hero, hint, vp);
    if (hero && state.heroFailed < 30) {
      try { hero.update(dt, input); } catch (e) { state.heroFailed++; recordError(e); }
      try { hint = hero.getHint ? hero.getHint() : null; } catch (e) { hint = null; recordError(e); }
    } else hint = null;
    inp.endFrame();
    audio.setSpin(hero && hero.status ? hero.status.crankSpeed || 0 : 0);
    hintLayer.update(dt, hint && !(hero.status && hero.status.busy) ? hint : null, input.idle, input.down, input.project, hint ? inp.hintRadiusPx(hint) : 0);

    if (!state.contextLost) {
      renderer.render(scene, camera);
      stats.afterRender();
      if (state.frames === 0) {
        state.firstFrameAt = now() - T_START;
        const bootEl = document.getElementById('boot');
        if (bootEl) { bootEl.classList.add('gone'); setTimeout(() => bootEl.remove(), 600); }
        setTimeout(afterFirstFrame, 300);
      }
      state.frames++;
      stats.frame(rawDt);
      governor.sample(rawDt);
    }
    if (dbgEl && (dbgAge += dt) > 0.25) {
      dbgAge = 0;
      const s = stats.snapshot();
      const hs = hero && hero.status ? hero.status : {};
      dbgEl.textContent = stats.format(s, errors, `stage ${hs.stage || state.stage} r${hs.round ?? '-'} ${hs.pattern || ''} st ${hs.stitches ?? '-'}  view ${rig.view}  audio ${audio.state}  boot ${(state.firstFrameAt * 1000).toFixed(0)}ms  lost ${state.lostCount}/${state.restoredCount}`);
    }
  }
  renderer.setAnimationLoop(frame);

  // --- 煙テスト・確認用のフック（子どもには見えない） ---
  window.__game = {
    get ready() { return state.frames > 2; },
    get stage() { return hero && hero.status ? hero.status.stage : state.stage; },
    get status() { return hero && hero.status ? { ...hero.status } : null; },
    get view() { return rig.view; },
    get cameraMoving() { return rig.moving; },
    get stageLog() { return state.stageLog.slice(); },
    get errors() { return errors.slice(); },
    get firstFrameAt() { return state.firstFrameAt; },
    get contextState() { return { lost: state.contextLost, lostCount: state.lostCount, restoredCount: state.restoredCount, frames: state.frames }; },
    hint() { return hintLayer.screen; },
    stats() { return stats.snapshot(); },
    audioLog() { return audio.log.slice(); },
    _ext: null,
    loseContext() { this._ext = renderer.getContext().getExtension('WEBGL_lose_context'); if (this._ext) this._ext.loseContext(); return !!this._ext; },
    restoreContext() { if (this._ext) this._ext.restoreContext(); },
    /** 測定用：自動で下げた解像度を戻す（1 = tier の DPR どおり） */
    setRenderScale(k) { tier.renderScale = k; tier.downgraded = true; resize(); },
  };
}

boot().catch((e) => {
  recordError(e);
  console.error(e);
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.classList.add('gone');
});
