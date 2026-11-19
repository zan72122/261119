// シェル本体：描画・カメラ・入力・音・hero の受け渡し・コンテキスト喪失・デバッグ。
// http(s) では ES モジュールのまま、file:// ではビルド済みの app/dist/app.js（同じコード）で動く。
import * as THREE from '../vendor/three/three.module.min.js';
import { createHero } from '../hero/hero.js';
import { WORLD, BUDGET } from './config.js';
import { detectTier } from './tier.js';
import { TextureManager } from './textures.js';
import { AudioBank, SOUND_NAMES } from './audio.js';
import { Input } from './input.js';
import { buildEnvironment, BlobShadows } from './scene.js';
import { Field } from './field.js';
import { HintHand } from './hint.js';
import { DebugOverlay, captureErrors, errors, estimateGpu } from './debug.js';
import { countTriangles, smoothstep } from './util.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const pushError = captureErrors();

// ---------------------------------------------------------------- カメラの定位置
// 固定カメラ。発射機（hero）を左下手前に大きく、飛ぶ先を右奥に見る。
// 横長は基本の位置、縦長は同じ向きのまま少し引いて画角を広げる（急な動きはしない）。
const CAM = {
  pos: new THREE.Vector3(-5.5, 3.4, 10.0),
  look: new THREE.Vector3(6.5, 3.1, -2.4),
  vfov: 50,
  minAspect: 1.3, // これより縦長なら画角を広げる
};
// 縦長（aspect < 1）の定位置：発射機の斜め後ろから、飛ぶ先を奥に見る。
// 操作部どうしが画面で離れるよう hero に寄せてある（iPad 縦 1024×1366 でボタン–ダイヤル 125px、飛ぶ先と風船も画面内）
const CAM_PORTRAIT = {
  pos: new THREE.Vector3(-6.6, 4.3, 6.6),
  look: new THREE.Vector3(8.0, 2.6, -2.9),
  vfov: 66,
};
if (DEBUG && params.get('cam')) {
  const c = params.get('cam').split(',').map(Number);
  if (c.length >= 6 && c.every(Number.isFinite)) { CAM.pos.set(c[0], c[1], c[2]); CAM.look.set(c[3], c[4], c[5]); if (c[6]) CAM.vfov = c[6]; }
}
if (DEBUG && params.get('pcam')) {
  const c = params.get('pcam').split(',').map(Number);
  if (c.length >= 6 && c.every(Number.isFinite)) { CAM_PORTRAIT.pos.set(c[0], c[1], c[2]); CAM_PORTRAIT.look.set(c[3], c[4], c[5]); if (c[6]) CAM_PORTRAIT.vfov = c[6]; }
}

async function main() {
  const t0 = 0; // ナビゲーション開始から測る（performance.now() の原点）
  const tier = detectTier(params);
  const canvas = document.getElementById('c');

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: tier.antialias, alpha: false, powerPreference: 'high-performance',
    preserveDrawingBuffer: false, stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = tier.shadow > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 影を落とすのは hero だけ。hero が止まっているフレームは影マップを描き直さない（下の shadowDirty）
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0x9fd0f5, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd0f5); // 毎フレーム適用される（コンテキスト復帰後も黒くならない）
  scene.fog = new THREE.Fog(0xb9cfc4, 40, 135);
  const camera = new THREE.PerspectiveCamera(CAM.vfov, 1, 0.3, 400);

  function fitCamera() {
    const w = window.innerWidth, h = window.innerHeight;
    // 画素比：ティアの DPR × 縮小率、ただし画素数の上限を超えない
    let pr = tier.dpr * (tier.downgraded ? 0.8 : tier.renderScale);
    if (w * h * pr * pr > tier.maxPixels) pr = Math.sqrt(tier.maxPixels / Math.max(1, w * h));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    if (aspect < 1.0) {
      // 縦長：別の定位置。横に入る範囲が足りなければ画角を広げる（最大 80°）
      const P = CAM_PORTRAIT;
      const hNeed = Math.atan(Math.tan(THREE.MathUtils.degToRad(P.vfov / 2)) * 0.75);
      camera.fov = Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hNeed) / aspect)));
      camera.position.copy(P.pos);
      camera.lookAt(P.look);
    } else {
      let vfov = CAM.vfov;
      if (aspect < CAM.minAspect) {
        // 横方向に同じ範囲が入るように画角を広げる
        const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(CAM.vfov / 2)) * CAM.minAspect);
        vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / aspect));
      }
      camera.fov = vfov;
      camera.position.copy(CAM.pos);
      camera.lookAt(CAM.look);
    }
    camera.updateProjectionMatrix();
  }
  fitCamera();
  window.addEventListener('resize', fitCamera);
  window.addEventListener('orientationchange', () => setTimeout(fitCamera, 200));

  // ---------------------------------------------------------------- 光
  const hemi = new THREE.HemisphereLight(0xe6f4ff, 0x8aa86a, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(-3, 12, 9);
  sun.target.position.set(0.5, 1.2, 0);
  scene.add(sun, sun.target);
  if (tier.shadow > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(tier.shadow, tier.shadow);
    const sc = sun.shadow.camera;
    sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -3.5; sc.near = 2; sc.far = 30;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.02;
  }

  // ---------------------------------------------------------------- 資源
  const tm = new TextureManager(THREE, renderer, tier);
  await tm.preload([
    ['sky_clouds', 512], ['far_hills', 512], ['meadow_grass', 512], ['wood_planks', 512], ['brushed_steel', 512],
    ['wood_planks', 1024], ['brushed_steel', 1024],
  ]);
  for (const e of tm.errors) pushError(e);

  const audio = new AudioBank();
  const env = buildEnvironment(THREE, tm, tier);
  scene.add(env.root);
  const blobs = new BlobShadows(THREE, tm, 28);
  scene.add(blobs.mesh);
  const field = new Field(THREE, tm, audio, tier, blobs);
  scene.add(field.root);

  // ---------------------------------------------------------------- hero
  let stage = 'none';
  let lastLaunch = -99;
  let simTime = 0;
  const heroEvents = { launch: 0, stage: 0, sound: 0, warn: 0 };
  function onHeroEvent(type, p = {}) {
    try {
      if (type === 'stage') { stage = p.stage; heroEvents.stage++; }
      else if (type === 'sound') {
        heroEvents.sound++;
        if (!SOUND_NAMES.includes(p.name)) { pushError('hero: unknown sound ' + p.name); return; }
        audio.play(p.name, p);
      } else if (type === 'launch') {
        heroEvents.launch++;
        if (simTime - lastLaunch < WORLD.launch.minIntervalSec - 0.05) { heroEvents.warn++; }
        lastLaunch = simTime;
        if (!field.launch(p.origin, p.velocity, p.colorIndex | 0)) pushError('hero: launch with non-finite values');
      } else if (type === 'sparkle') {
        field.sparkle(p.position, p.color ?? 0xffffff, Math.min(40, p.count ?? 12), p.speed ?? 2.5);
      }
    } catch (e) { pushError('hero event ' + type + ': ' + e.message); }
  }

  const heroOpts = {
    tier: tier.name,
    isMobile: tier.isMobile,
    budget: { ...BUDGET.hero, textureMaxSize: Math.min(BUDGET.hero.textureMaxSize, tier.texMax) },
    world: {
      gravity: WORLD.gravity, ballRadius: WORLD.ballRadius, launch: { ...WORLD.launch },
      heroBox: WORLD.heroBox, catcherRim: WORLD.catcher.rim,
    },
    textures: {
      names: ['brushed_steel', 'wood_planks'],
      get: (name, size = 1024, o) => tm.get(name, size, o),
    },
    ball: {
      radius: WORLD.ballRadius,
      colors: WORLD.ballColors.slice(),
      createMesh: (ci) => field.createBallMesh(ci),
      setColor: (mesh, ci) => field.setBallMeshColor(mesh, ci),
    },
    sounds: SOUND_NAMES.slice(),
    emit: onHeroEvent,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    debug: DEBUG,
  };
  const hero = createHero(THREE, heroOpts);
  for (const k of ['root', 'targets', 'update', 'getStage', 'getNextTarget', 'getAim', 'reset', 'dispose']) {
    if (!(k in hero)) pushError('hero API missing: ' + k);
  }
  scene.add(hero.root);
  if (tier.shadow > 0) {
    hero.root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
  }
  stage = hero.getStage();
  const shadowCasters = [];
  hero.root.traverse((o) => { if (o.isMesh && o.castShadow) shadowCasters.push(o); });
  let shadowSig = NaN;
  const shadowStats = { updates: 0, frames: 0 };
  /**
   * hero の投影メッシュの位置・向き・表示が、最後に影を描いたときから変わったか。変わらなければ影パスを省く。
   * 大きさ（行列の列の長さ）は見ない：待っている間のヒントの脈動（握り・ボタンが自分の中心で 7〜8% 膨らむ）
   * では影を描き直さない。ばねの頂点は押し板の移動と必ず一緒に変わるので、押し板の行列で拾える。
   */
  function shadowDirty() {
    hero.root.updateMatrixWorld();
    let sig = 0;
    for (let i = 0; i < shadowCasters.length; i++) {
      const o = shadowCasters[i];
      const e = o.matrixWorld.elements;
      const w = i + 1;
      const l0 = 1 / Math.max(1e-9, Math.hypot(e[0], e[1], e[2]));
      const l1 = 1 / Math.max(1e-9, Math.hypot(e[4], e[5], e[6]));
      const l2 = 1 / Math.max(1e-9, Math.hypot(e[8], e[9], e[10]));
      sig += w * (o.visible ? 1 : -1) * ((e[0] + 3 * e[1] + 5 * e[2]) * l0 + (7 * e[4] + 11 * e[5] + 13 * e[6]) * l1
        + (17 * e[8] + 19 * e[9] + 23 * e[10]) * l2 + 29 * e[12] + 31 * e[13] + 37 * e[14] + 41);
    }
    // 最後に影を描いたときの姿勢と比べる（指数的に目標へ近づく途中の、目に見えない 1µm 単位の変化では描き直さない。
    // ゆっくりした動きも積もれば必ず超える）。表示の切り替えは符号が変わるので必ず拾う。
    const dirty = !(Math.abs(sig - shadowSig) < 2e-3);
    if (dirty) shadowSig = sig;
    return dirty;
  }

  const input = new Input(THREE, canvas, camera);
  input.setTargets(hero.targets);
  input.onAnyDown = () => audio.unlock();
  window.addEventListener('touchend', () => audio.unlock(), { passive: true });
  const tapPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const tapPoint = new THREE.Vector3();
  input.onEmptyTap = () => {
    // 何もないところを触った：小さなきらきら＋次の操作部をすぐ光らせる
    if (input.ray.intersectPlane(tapPlane, tapPoint)) field.sparkle(tapPoint, 0xffffff, 8, 1.5);
    audio.play('sparkle', { gain: 0.3 });
    input.idleTime = 3.3;
  };
  const hand = new HintHand(THREE, camera, canvas, () => input.rect());
  // 止まってから「次」を見せるまでの秒：[光り始め, 光りきる, 手が出る]。
  // ボタン（charged）は引いた直後で迷いやすいので早めに出す。
  const HINT_TIMES = { lever: [1.2, 2.2, 3.5], release: [0.4, 1.1, 2.5], angle: [1.2, 2.2, 3.5] };
  const hintTimes = (next) => HINT_TIMES[next] || HINT_TIMES.lever;
  /** 「次」をすぐ見せる（間違った操作部や何もない所を触ったとき）：手が 0.2 秒後に出る */
  const nudgeHint = () => {
    const next = hero.getNextTarget();
    if (next) input.idleTime = Math.max(input.idleTime, hintTimes(next)[2] - 0.2);
  };

  // ---------------------------------------------------------------- コンテキスト喪失
  let ctxLost = false;
  let ctxState = 'ok';
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();           // 復帰を許す
    ctxLost = true; ctxState = 'lost';
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    // three.js が GL 状態を作り直す。テクスチャ・材質・幾何を再アップロードさせる。
    tm.markAllDirty();
    scene.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
      if (o.isInstancedMesh) { o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
    });
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
    try { hero.onContextRestored && hero.onContextRestored(); } catch (e) { pushError('hero.onContextRestored: ' + e.message); }
    ctxLost = false; ctxState = 'restored';
  }, false);

  // ---------------------------------------------------------------- デバッグ
  const dbg = new DebugOverlay(DEBUG);
  let loseExt = null;
  const loseContext = () => {
    loseExt = renderer.getContext().getExtension('WEBGL_lose_context');
    if (loseExt) { loseExt.loseContext(); setTimeout(() => loseExt.restoreContext(), 800); }
  };
  dbg.addButton('ctx lost', loseContext);
  dbg.addButton('reset', () => { hero.reset(); field.reset(); });
  let boxLines = null;
  dbg.addButton('heroBox', () => {
    // hero が置いてよい箱（HERO-SPEC §1）を線で出す／消す
    if (boxLines) { scene.remove(boxLines); boxLines.geometry.dispose(); boxLines.material.dispose(); boxLines = null; return; }
    const b = new THREE.Box3(new THREE.Vector3(...WORLD.heroBox.min), new THREE.Vector3(...WORLD.heroBox.max));
    const size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
    const box = new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z);
    boxLines = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xff00aa, depthTest: false }));
    box.dispose();
    boxLines.renderOrder = 10;
    scene.add(boxLines);
  });
  const heroTris = () => countTriangles(hero.root);
  const heroDraws = () => { let n = 0; hero.root.traverseVisible((o) => { if ((o.isMesh || o.isPoints || o.isLine) && !(o.material && o.material.visible === false)) n++; }); return n; };
  const sceneTris = () => countTriangles(scene) - heroTris();
  const info = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    return {
      tier: tier.name, downgraded: tier.downgraded, mobile: tier.isMobile, dpr: renderer.getPixelRatio().toFixed(2),
      canvas: `${size.x}x${size.y} (css ${window.innerWidth}x${window.innerHeight})`,
      fps: dbg.fps(), calls: lastCalls, tris: lastTris, heroTris: heroTris(), sceneTris: sceneTris(), heroDraws: heroDraws(),
      gpu: estimateGpu(THREE, renderer, scene, tier), stage, next: hero.getNextTarget(),
      field: field.snapshot(), errors, ctx: ctxState, heroEvents, startupMs: Math.round(tReady - t0),
      shadow: renderer.shadowMap.enabled ? { updates: shadowStats.updates, frames: shadowStats.frames } : null,
    };
  };

  // ---------------------------------------------------------------- ループ
  let last = performance.now();
  let lastCalls = 0, lastTris = 0;
  let slowFor = 0;
  let tReady = 0;
  const forcedTier = params.has('tier');
  renderer.info.autoReset = true;

  function downgrade() {
    if (tier.downgraded || forcedTier) return;
    tier.downgraded = true;
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false; sun.castShadow = false;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // 使わない影マップを解放
      scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    fitCamera();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);
    if (ctxLost || document.hidden) return; // 状態はそのまま止める
    simTime += dt;
    try {
      const idle = input.idleTime;
      const next = hero.getNextTarget();
      const ht = hintTimes(next);
      const glow = next ? smoothstep(ht[0], ht[1], idle) : 0;
      const inp = input.frame(dt, simTime, glow);
      // 押しても何も進まない操作部を触った（ready でボタン／いっぱいでレバー）→ 正しい次をすぐ見せる
      let wrong = false;
      for (const ev of inp.events) {
        if (ev.type !== 'tap') continue;
        if (ev.targetId === 'release' && stage === 'ready') wrong = true;
        if (ev.targetId === 'lever' && stage === 'charged' && hero.getAim().power >= 0.999) wrong = true;
      }
      hero.update(dt, inp);
      input.endFrame();
      if (wrong) nudgeHint();
      const aim = hero.getAim();
      field.setAim(aim);
      const draggingAngle = input.down && input.targetId && /angle|dial|elev/i.test(input.targetId);
      field.update(dt, stage === 'charging' || stage === 'charged' || draggingAngle);
      blobs.begin(); field._shadows();
      if (!renderer.shadowMap.enabled) blobs.add(0.05, 0.12, 2.3, 0.5); // 影なしティア：hero（台の中心 x≈0.05, z≈0.12）の下に丸い影
      blobs.end();
      const next2 = hero.getNextTarget();
      const target = next2 ? hero.targets.find((t) => t.id === next2) : null;
      const hs = hintTimes(next2)[2];
      hand.update(dt, target, next2 && !input.down ? smoothstep(hs, hs + 0.6, input.idleTime) : 0);
      if (renderer.shadowMap.enabled) {
        shadowStats.frames++;
        if (shadowDirty()) { renderer.shadowMap.needsUpdate = true; shadowStats.updates++; }
      }
    } catch (e) {
      pushError('update: ' + (e && e.message));
    }
    renderer.render(scene, camera);
    lastCalls = renderer.info.render.calls;
    lastTris = renderer.info.render.triangles;
    dbg.frame(dt);
    dbg.update(now, info);
    // 自動で下げる（モバイルで遅いとき：影を切って解像度を少し下げる）
    if (simTime > 5 && dbg.frames.length > 60) {
      slowFor = dbg.avgFps() < 40 ? slowFor + dt : 0;
      if (slowFor > 3) downgrade();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend(); else { audio.resume(); last = performance.now(); }
  });

  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  tReady = performance.now();
  requestAnimationFrame(frame);
  document.body.classList.add('ready');

  // 煙テスト・デバッグ用の窓口
  window.__game = {
    ready: true,
    THREE, renderer, scene, camera, hero, field, input, audio, tier,
    info, errors, loseContext,
    stage: () => stage,
    targetScreen(id) {
      const t = hero.targets.find((x) => x.id === id);
      if (!t || !t.anchor) return null;
      const v = t.anchor.getWorldPosition(new THREE.Vector3()).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
    },
    dragToScreen(id) {
      const t = hero.targets.find((x) => x.id === id);
      if (!t) return null;
      const v = new THREE.Vector3();
      if (t.dragTo) t.dragTo.getWorldPosition(v); else t.anchor.getWorldPosition(v).addScaledVector(t.dragAxis || new THREE.Vector3(0, -1, 0), 0.9);
      v.project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
    },
    startupMs: () => Math.round(tReady - t0),
  };
}

main().catch((e) => { pushError('boot: ' + (e && (e.stack || e.message))); console.error(e); });
