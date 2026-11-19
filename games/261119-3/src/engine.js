// Engine: renderer, lighting rig, depth-of-field background, camera controller,
// single-pointer input, resize / dynamic resolution, persistence.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const SAVE_PREFIX = 'gf261119-3:';
const DEG = Math.PI / 180;
const FOV = 40;

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 dir;      // one texel in the blur direction
uniform float sigma;   // in texels
varying vec2 vUv;
void main() {
  float s = max(sigma, 0.0001);
  float stepPx = s * 0.25;           // 12 taps each side -> +-3 sigma
  float k = -0.5 / (s * s);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i) * stepPx;
    float w = exp(x * x * k);
    sum += texture2D(tDiffuse, vUv + dir * x) * w;
    wsum += w;
  }
  gl_FragColor = sum / wsum;
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float gain;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * gain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const OVERLAY_FRAG = /* glsl */`
uniform vec3 color;
uniform float opacity;
void main() {
  gl_FragColor = vec4(color, opacity);
  #include <colorspace_fragment>
}`;

function easeInOut(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Change tracking: a flat list of numbers compared with last frame's list.
// Used to skip GPU passes (shadow map, blurred background) whose inputs did not change.
function makeSig() { return { a: [], i: 0, ch: true }; }
function sigBegin(s) { s.i = 0; s.ch = false; }
function sigPush(s, v) {
  const a = s.a;
  if (s.i < a.length) { if (a[s.i] !== v) { a[s.i] = v; s.ch = true; } }
  else { a.push(v); s.ch = true; }
  s.i++;
}
function sigMat4(s, m) { const e = m.elements; for (let k = 0; k < 16; k++) sigPush(s, e[k]); }
function sigEnd(s) { if (s.a.length !== s.i) { s.a.length = s.i; s.ch = true; } return s.ch; }
function sigGeo(s, o) {
  const g = o.geometry;
  if (!g) { sigPush(s, -1); return; }
  sigPush(s, g.id);
  const pa = g.attributes && g.attributes.position;
  sigPush(s, pa ? pa.version : -1);
  sigPush(s, g.index ? g.index.version : -1);
  sigPush(s, g.drawRange.start); sigPush(s, g.drawRange.count);
  if (g.isInstancedBufferGeometry) sigPush(s, g.instanceCount);
  if (o.isInstancedMesh) { sigPush(s, o.count); sigPush(s, o.instanceMatrix.version); }
}

function createSave() {
  const mem = new Map();
  let storage = null;
  try {
    storage = window.localStorage;
    const probe = SAVE_PREFIX + '__probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
  } catch (e) { storage = null; }
  return {
    get(key, fallback) {
      if (mem.has(key)) return mem.get(key);
      if (!storage) return fallback;
      try {
        const raw = storage.getItem(SAVE_PREFIX + key);
        if (raw == null) return fallback;
        const v = JSON.parse(raw);
        mem.set(key, v);
        return v;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      mem.set(key, value);
      if (!storage) return;
      try { storage.setItem(SAVE_PREFIX + key, JSON.stringify(value)); } catch (e) { /* quota / denied: keep in memory */ }
    },
  };
}

export function createEngine(container) {
  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  if (!gl) throw new Error('no webgl');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 30);
  camera.position.set(0, 0.8, 1.2);
  camera.lookAt(0, 0, 0);

  // ---------------------------------------------------------------- quality
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const weak = (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) ||
    (nav.deviceMemory && nav.deviceMemory <= 2);
  const quality = { low: !!weak, particles: weak ? 0.5 : 1 };

  // ---------------------------------------------------------------- environment
  let pmrem = null;
  let envRT = null;
  function buildEnv() {
    try {
      if (envRT) envRT.dispose();
      if (pmrem) pmrem.dispose();
      pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envRT = pmrem.fromScene(room, 0.04);
      scene.environment = envRT.texture;
      room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) { scene.environment = null; }
  }
  buildEnv();

  // ---------------------------------------------------------------- lights
  const key = new THREE.DirectionalLight(0xfff1df, 1.5);
  key.position.set(-1.3, 2.4, 1.5);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.layers.enableAll();
  scene.add(key, key.target);
  {
    // tight ortho shadow frustum around the counter work area
    const sc = key.shadow.camera;
    key.updateMatrixWorld();
    sc.position.copy(key.position);
    sc.lookAt(key.target.position);
    sc.updateMatrixWorld();
    const inv = sc.matrixWorldInverse.copy(sc.matrixWorld).invert();
    const v = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const x of [-0.8, 0.8]) for (const y of [-0.01, 0.4]) for (const z of [-0.7, 0.7]) {
      v.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }
    sc.left = minX; sc.right = maxX; sc.bottom = minY; sc.top = maxY;
    sc.near = Math.max(0.05, -maxZ - 0.3); sc.far = -minZ + 0.3;
    sc.updateProjectionMatrix();
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.0025;
    key.shadow.mapSize.set(quality.low ? 1024 : 2048, quality.low ? 1024 : 2048);
  }
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x8a6f55, 0.7);
  hemi.layers.enableAll();
  scene.add(hemi);
  const HEMI_SKY_ON = new THREE.Color(0xfff4e6), HEMI_GND_ON = new THREE.Color(0x8a6f55);
  const HEMI_SKY_OFF = new THREE.Color(0x5d6f9a), HEMI_GND_OFF = new THREE.Color(0x2a2a38);

  let roomLevel = 1;
  const roomListeners = [];
  const roomTween = { active: false, from: 1, to: 1, t: 0, dur: 0 };
  function applyRoomLight(L) {
    key.intensity = 1.5 * L;
    key.visible = L > 0.002;
    hemi.intensity = lerp(0.10, 0.2, L);
    hemi.color.copy(HEMI_SKY_OFF).lerp(HEMI_SKY_ON, L);
    hemi.groundColor.copy(HEMI_GND_OFF).lerp(HEMI_GND_ON, L);
    scene.environmentIntensity = lerp(0.03, 0.9, L);
    renderer.toneMappingExposure = lerp(1.15, 1.0, L);
  }
  applyRoomLight(1);
  function setRoomLight(level, seconds = 0) {
    level = Math.max(0, Math.min(1, level));
    if (!(seconds > 0)) {
      roomTween.active = false;
      if (level !== roomLevel) { roomLevel = level; applyRoomLight(level); emitRoom(); }
      return;
    }
    roomTween.active = true; roomTween.from = roomLevel; roomTween.to = level; roomTween.t = 0; roomTween.dur = seconds;
  }
  function emitRoom() {
    engine.roomLight = roomLevel;
    for (let i = 0; i < roomListeners.length; i++) {
      try { roomListeners[i](roomLevel); } catch (e) { console.warn(e); }
    }
  }
  function updateRoom(dt) {
    if (!roomTween.active) return;
    roomTween.t += dt;
    const k = Math.min(1, roomTween.t / roomTween.dur);
    roomLevel = lerp(roomTween.from, roomTween.to, easeInOut(k));
    if (k >= 1) { roomLevel = roomTween.to; roomTween.active = false; }
    applyRoomLight(roomLevel);
    emitRoom();
  }

  // ---------------------------------------------------------------- DOF background pipeline
  const halfOK = renderer.capabilities.isWebGL2 &&
    (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const rtOpts = {
    type: halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false, colorSpace: THREE.LinearSRGBColorSpace,
  };
  const rtA = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });
  const rtB = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false });
  const BG_CLEAR = new THREE.Color(0.022, 0.018, 0.015);

  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = new THREE.PlaneGeometry(2, 2);
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, sigma: { value: 1 } },
    vertexShader: FS_VERT, fragmentShader: BLUR_FRAG,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, gain: { value: 1 } },
    vertexShader: FS_VERT, fragmentShader: COMPOSITE_FRAG,
    depthTest: false, depthWrite: false, toneMapped: true,
  });
  const fsQuad = new THREE.Mesh(fsGeo, blurMat);
  fsQuad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(fsQuad);

  // overlays (flash / fade)
  const overlayScene = new THREE.Scene();
  const makeOverlayMat = (hex) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(hex) }, opacity: { value: 0 } },
      vertexShader: FS_VERT, fragmentShader: OVERLAY_FRAG,
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    Object.defineProperty(m, 'opacity', { get() { return m.uniforms.opacity.value; }, set(v) { if (m.uniforms) m.uniforms.opacity.value = v; } });
    return m;
  };
  const fadeMat = makeOverlayMat(0xfff3e2);
  const flashMat = makeOverlayMat(0xffffff);
  const fadeQuad = new THREE.Mesh(fsGeo, fadeMat); fadeQuad.frustumCulled = false; fadeQuad.renderOrder = 1;
  const flashQuad = new THREE.Mesh(fsGeo, flashMat); flashQuad.frustumCulled = false; flashQuad.renderOrder = 2;
  overlayScene.add(fadeQuad, flashQuad);

  let flashLevel = 0, flashDecay = 1;
  const fadeState = { from: 0, to: 0, t: 0, dur: 0, active: false, resolve: null };

  // ---------------------------------------------------------------- sizing / dynamic resolution
  let cssW = 1, cssH = 1;
  // device-pixel budget: phones keep their full (<=2x) density; big tablets get a slightly
  // lower ratio so the per-pixel lighting cost stays close to a large phone's
  const MAX_PIXELS = 2.6e6;
  const dpr = (w = cssW, h = cssH) => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const cap = Math.sqrt(MAX_PIXELS / Math.max(1, w * h));
    return Math.max(Math.min(d, 1), Math.min(d, Math.round(cap * 100) / 100));
  };
  let resScale = 1;
  let lastDpr = 0;
  function measure() {
    let w = window.innerWidth, h = window.innerHeight;
    const vv = window.visualViewport;
    if (vv && vv.width > 0 && vv.height > 0 && Math.abs((vv.scale || 1) - 1) < 0.01) { w = vv.width; h = vv.height; }
    return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
  }
  function applySize(force) {
    const [w, h] = measure();
    const d = dpr(w, h);
    if (!force && w === cssW && h === cssH && d === lastDpr) return;
    cssW = w; cssH = h; lastDpr = d;
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    renderer.setPixelRatio(d * resScale);
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    resizeTargets();
    cam._refit();
  }
  function resizeTargets() {
    const bw = canvas.width, bh = canvas.height;
    const tw = Math.max(16, Math.round(bw / 3)), th = Math.max(16, Math.round(bh / 3));
    rtA.setSize(tw, th);
    rtB.setSize(tw, th);
  }
  function setResScale(s) {
    if (s === resScale) return;
    resScale = s;
    renderer.setPixelRatio(dpr() * resScale);
    renderer.setSize(cssW, cssH, true);
    resizeTargets();
  }
  function setLow() {
    quality.low = true;
    quality.particles = 0.5;
    if (key.shadow.mapSize.x !== 1024) {
      key.shadow.mapSize.set(1024, 1024);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
      shadowForce = true;
    }
  }
  let ftEma = 1 / 60, slowTime = 0, fastTime = 0, perfWarmup = 1.0;
  // every resolution change reallocates the drawing buffer (a hitch): after a step up that had
  // to be undone soon, wait longer before trying again so the scale does not oscillate
  let upDelay = 5, perfClock = 0, lastUpAt = -100;
  // a step down that does not speed frames up means the frame rate is capped, not GPU-bound
  // (iOS Low Power Mode runs rAF at 30 Hz): undo it and stop lowering at that frame time
  let trial = null, cappedFt = 0, holdUntil = 0, holdDur = 8;
  function updatePerf(rawDt) {
    perfClock += rawDt;
    if (perfWarmup > 0) { perfWarmup -= rawDt; return; }
    const ft = Math.min(rawDt, 0.2);
    ftEma += (ft - ftEma) * 0.08;
    if (trial && perfClock - trial.t > 2.5) {
      if (ftEma > trial.ft * 0.92) {
        cappedFt = trial.ft;
        holdUntil = perfClock + holdDur; holdDur = Math.min(60, holdDur * 2);
        const back = trial.scale; trial = null;
        setResScale(back);
        slowTime = 0; fastTime = 0; perfWarmup = 0.5;
        return;
      }
      trial = null;
      if (resScale < 0.8 && !quality.low) setLow(); // the lower resolution helped: keep it lean
    }
    if (cappedFt && perfClock > holdUntil && ftEma > cappedFt * 1.3) cappedFt = 0; // genuinely slower than the cap
    if (ftEma > 0.030) { slowTime += rawDt; fastTime = 0; }
    else if (ftEma < 0.020) { fastTime += rawDt; slowTime = 0; cappedFt = 0; }
    else { slowTime = Math.max(0, slowTime - rawDt); fastTime = 0; }
    if (slowTime > 1.5 && resScale > 0.6 && !trial && !cappedFt) {
      if (perfClock - lastUpAt < 6) upDelay = Math.min(40, upDelay * 2);
      trial = { scale: resScale, ft: ftEma, t: perfClock };
      // a big step: shortens the slow stretch, and a small one could hide its gain behind
      // vsync quantisation (a 20 ms frame and an 18 ms frame both show at 30 fps)
      setResScale(Math.max(0.6, Math.round((resScale - 0.2) * 10) / 10));
      slowTime = 0; perfWarmup = 0.5;
    } else if (fastTime > upDelay && resScale < 1) {
      setResScale(Math.min(1, Math.round((resScale + 0.1) * 10) / 10));
      fastTime = 0; perfWarmup = 0.5; lastUpAt = perfClock;
    }
  }

  // ---------------------------------------------------------------- camera controller
  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _tgt = new THREE.Vector3();
  const cam = {
    // current pose params
    cur: { target: new THREE.Vector3(0, 0.05, 0), pitch: 38, yaw: 0, dist: 1.4 },
    from: { target: new THREE.Vector3(), pitch: 0, yaw: 0, dist: 1 },
    req: null,            // latest framing request
    t: 0, dur: 0, moving: false, resolve: null,
    nudgeT: new THREE.Vector2(), nudgeC: new THREE.Vector2(),
    get busy() { return this.moving; },
    _fitDist(r) {
      const tanV = Math.tan(FOV * DEG / 2);
      const dh = (r.fitHeight || 0) / 2 / tanV;
      const dw = (r.fitWidth || 0) / 2 / (tanV * camera.aspect);
      return Math.max(dh, dw, r.minDist || 0, 0.05);
    },
    goTo(opts, seconds = 1) {
      const r = {
        target: new THREE.Vector3().fromArray(opts.target || [0, 0, 0]),
        pitch: opts.pitch != null ? opts.pitch : 35,
        yaw: opts.yaw || 0,
        fitWidth: opts.fitWidth || 0, fitHeight: opts.fitHeight || 0, minDist: opts.minDist || 0,
      };
      if (this.resolve) { const res = this.resolve; this.resolve = null; res(); }
      this.req = r;
      this.from.target.copy(this.cur.target);
      this.from.pitch = this.cur.pitch; this.from.yaw = this.cur.yaw; this.from.dist = this.cur.dist;
      // shortest yaw path
      while (r.yaw - this.from.yaw > 180) this.from.yaw += 360;
      while (r.yaw - this.from.yaw < -180) this.from.yaw -= 360;
      this.t = 0; this.dur = Math.max(0, seconds || 0);
      return new Promise((resolve) => {
        this.resolve = resolve;
        if (this.dur === 0) { this.moving = false; this._apply(1); this._finish(); }
        else this.moving = true;
      });
    },
    nudge(dx, dy) { this.nudgeT.set(dx || 0, dy || 0); },
    _finish() { this.moving = false; if (this.resolve) { const r = this.resolve; this.resolve = null; r(); } },
    _apply(k) {
      const r = this.req; if (!r) return;
      const e = easeInOut(k);
      const toDist = this._fitDist(r);
      this.cur.target.lerpVectors(this.from.target, r.target, e);
      this.cur.pitch = lerp(this.from.pitch, r.pitch, e);
      this.cur.yaw = lerp(this.from.yaw, r.yaw, e);
      this.cur.dist = lerp(this.from.dist, toDist, e);
    },
    _refit() { if (this.req && !this.moving) this._apply(1); this._pose(); },
    _update(dt) {
      if (this.moving) {
        this.t += dt;
        const k = Math.min(1, this.t / this.dur);
        this._apply(k);
        if (k >= 1) this._finish();
      }
      this.nudgeC.lerp(this.nudgeT, 1 - Math.exp(-dt * 6));
      this._pose();
    },
    _pose() {
      const c = this.cur;
      const p = c.pitch * DEG, y = c.yaw * DEG;
      _dir.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
      camera.position.copy(c.target).addScaledVector(_dir, c.dist);
      if (this.nudgeC.x !== 0 || this.nudgeC.y !== 0) {
        _right.set(Math.cos(y), 0, -Math.sin(y));
        _up.crossVectors(_dir, _right).negate();
        camera.position.addScaledVector(_right, this.nudgeC.x).addScaledVector(_up, this.nudgeC.y);
      }
      _tgt.copy(c.target);
      camera.lookAt(_tgt);
      camera.updateMatrixWorld();
    },
  };

  // ---------------------------------------------------------------- input
  const listeners = { down: [], move: [], up: [] };
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enableAll();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ndc = new THREE.Vector2();
  const evRay = new THREE.Ray();
  const ev = {
    x: 0, y: 0, ndc: { x: 0, y: 0 }, ray: evRay, t: 0, id: -1,
    onPlaneY(y) {
      _plane.constant = -y;
      const out = new THREE.Vector3();
      return evRay.intersectPlane(_plane, out);
    },
  };
  let activeId = null;
  function fill(e) {
    const rect = canvas.getBoundingClientRect();
    ev.x = e.clientX - rect.left;
    ev.y = e.clientY - rect.top;
    ev.ndc.x = (ev.x / Math.max(1, rect.width)) * 2 - 1;
    ev.ndc.y = -(ev.y / Math.max(1, rect.height)) * 2 + 1;
    ev.t = performance.now() / 1000;
    _ndc.set(ev.ndc.x, ev.ndc.y);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(_ndc, camera);
    evRay.copy(raycaster.ray);
  }
  function emit(type) {
    const arr = listeners[type];
    for (let i = 0; i < arr.length; i++) {
      try { arr[i](ev); } catch (err) { console.warn(err); }
    }
  }
  function endPointer(e) {
    if (activeId === null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== activeId) return;
    const id = activeId;
    activeId = null;
    if (e && e.clientX !== undefined) fill(e);
    try { if (container.hasPointerCapture && container.hasPointerCapture(id)) container.releasePointerCapture(id); } catch (err) { /* ignore */ }
    emit('up');
  }
  container.addEventListener('pointerdown', (e) => {
    if (activeId !== null) return;
    if (e.button !== undefined && e.button > 0) return;
    activeId = e.pointerId;
    ev.id = e.pointerId;
    try { container.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.cancelable) e.preventDefault();
    fill(e);
    emit('down');
  });
  container.addEventListener('pointermove', (e) => {
    if (activeId === null || e.pointerId !== activeId) return;
    fill(e);
    emit('move');
  });
  container.addEventListener('pointerup', endPointer);
  container.addEventListener('pointercancel', endPointer);
  container.addEventListener('lostpointercapture', endPointer);
  window.addEventListener('blur', () => endPointer(null));

  const input = {
    on(type, fn) { if (listeners[type]) listeners[type].push(fn); },
    off(type, fn) { const a = listeners[type]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    get active() { return activeId !== null; },
  };

  // ---------------------------------------------------------------- rendering
  // ---------------------------------------------------------------- change tracking
  // The shadow map (2048², every caster) and the blurred background are re-rendered only when
  // something they depend on changed; otherwise last frame's result is reused as is.
  const shSig = makeSig(), bgSig = makeSig();
  let shadowForce = true, bgForce = true, shadowUpdatedPrev = true;
  function sigMaterial(s, m) {
    if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) sigMaterial(s, m[i]); return; }
    if (!m) { sigPush(s, -1); return; }
    sigPush(s, m.id); sigPush(s, m.version); sigPush(s, m.visible ? 1 : 0);
    sigPush(s, m.opacity); sigPush(s, m.transparent ? 1 : 0); sigPush(s, m.alphaTest);
    if (m.color) { sigPush(s, m.color.r); sigPush(s, m.color.g); sigPush(s, m.color.b); }
    if (m.emissive) { sigPush(s, m.emissive.r); sigPush(s, m.emissive.g); sigPush(s, m.emissive.b); sigPush(s, m.emissiveIntensity); }
    if (m.map) sigPush(s, m.map.version);
  }
  let shLayers = null;
  function visitTracked(o) {
    if (o.isLight) {
      // lights reach the background (candles flicker, room dims)
      sigPush(bgSig, o.id); sigPush(bgSig, o.intensity);
      if (o.intensity === 0) return; // an unlit light may wander (flicker noise) without effect
      sigPush(bgSig, o.color.r); sigPush(bgSig, o.color.g); sigPush(bgSig, o.color.b);
      if (o.groundColor) { sigPush(bgSig, o.groundColor.r); sigPush(bgSig, o.groundColor.g); sigPush(bgSig, o.groundColor.b); }
      const e = o.matrixWorld.elements; sigPush(bgSig, e[12]); sigPush(bgSig, e[13]); sigPush(bgSig, e[14]);
      return;
    }
    if (!(o.isMesh || o.isLine || o.isPoints)) return;
    if (o.castShadow && o.layers.test(shLayers)) {
      sigPush(shSig, o.id); sigMat4(shSig, o.matrixWorld); sigGeo(shSig, o);
      const m = o.material;
      if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) { sigPush(shSig, m[i].visible ? 1 : 0); sigPush(shSig, m[i].version); sigPush(shSig, m[i].alphaTest); } }
      else if (m) { sigPush(shSig, m.visible ? 1 : 0); sigPush(shSig, m.version); sigPush(shSig, m.alphaTest); sigPush(shSig, m.side); }
    }
    if (o.layers.mask & 2) {
      sigPush(bgSig, o.id); sigMat4(bgSig, o.matrixWorld); sigGeo(bgSig, o); sigMaterial(bgSig, o.material);
    }
  }
  // returns [shadowDirty, bgDirty]; matrices must be current
  const _dirty = [true, true];
  function trackChanges() {
    sigBegin(shSig); sigBegin(bgSig);
    shLayers = key.shadow.camera.layers;
    scene.traverseVisible(visitTracked);
    sigMat4(bgSig, camera.matrixWorld); sigMat4(bgSig, camera.projectionMatrix);
    sigPush(bgSig, engine.bgBlur); sigPush(bgSig, rtA.width); sigPush(bgSig, rtA.height);
    sigPush(bgSig, scene.environmentIntensity); sigPush(bgSig, roomLevel);
    sigPush(bgSig, scene.environment ? scene.environment.id : -1);
    const sh = sigEnd(shSig) || shadowForce || !key.shadow.map;
    let bg = sigEnd(bgSig) || bgForce;
    // background props (the chair) sit inside the key light's shadow box and read the shadow map
    // one frame late, as before: redraw them the frame after the map changed
    if (shadowUpdatedPrev) bg = true;
    shadowForce = false; bgForce = false;
    _dirty[0] = sh; _dirty[1] = bg;
    return _dirty;
  }

  function render(withOverlays) {
    scene.updateMatrixWorld();
    scene.matrixWorldAutoUpdate = false;
    const dirty = trackChanges();
    const tw = rtA.width, th = rtA.height;
    if (dirty[1]) { // 1-2) only when the background changed; rtA keeps last result otherwise
      // 1) background layer into low-res target
      renderer.setRenderTarget(rtA);
      renderer.setClearColor(BG_CLEAR, 1);
      renderer.clear(true, true, false);
      camera.layers.set(1);
      renderer.render(scene, camera);
      // 2) separable gaussian blur (ping-pong)
      const sigma = Math.max(0, engine.bgBlur) / 0.7 * 0.016 * th;
      if (sigma > 0.05) {
        fsQuad.material = blurMat;
        blurMat.uniforms.sigma.value = sigma;
        blurMat.uniforms.tDiffuse.value = rtA.texture;
        blurMat.uniforms.dir.value.set(1 / tw, 0);
        renderer.setRenderTarget(rtB);
        renderer.render(fsScene, fsCam);
        blurMat.uniforms.tDiffuse.value = rtB.texture;
        blurMat.uniforms.dir.value.set(0, 1 / th);
        renderer.setRenderTarget(rtA);
        renderer.render(fsScene, fsCam);
      }
    }
    // 3) composite to screen with tone mapping + sRGB
    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    fsQuad.material = compMat;
    compMat.uniforms.tDiffuse.value = rtA.texture;
    renderer.render(fsScene, fsCam);
    // 4) sharp foreground
    renderer.clearDepth();
    camera.layers.set(0);
    renderer.shadowMap.needsUpdate = dirty[0];
    shadowUpdatedPrev = dirty[0];
    renderer.render(scene, camera);
    scene.matrixWorldAutoUpdate = true;
    // 5) overlays
    if (withOverlays && (fadeMat.opacity > 0.001 || flashMat.opacity > 0.001)) {
      fadeQuad.visible = fadeMat.opacity > 0.001;
      flashQuad.visible = flashMat.opacity > 0.001;
      renderer.render(overlayScene, fsCam);
    }
  }

  // one shadow pass with the given hidden objects shown, so their shadow shaders get compiled.
  // Runs inside a frame just before the real render, drawing to the screen through an empty
  // scissor box (nothing lands on screen, and the shaders are the same ones the real frames use);
  // the real frame right after redraws the shadow map and the whole picture.
  let warmList = null;
  const _warmPos = [];
  function warmShadowPass() {
    const objs = warmList; warmList = null;
    if (!objs || !key.visible) return;
    const vis = [];
    _warmPos.length = 0;
    for (const obj of objs) {
      obj.traverse((o) => { vis.push(o, o.visible); o.visible = true; });
      // parked props may sit outside the shadow box (and be culled): bring them to the middle
      _warmPos.push(obj.position.clone()); obj.position.set(0, 0.05, 0);
    }
    const mask = camera.layers.mask;
    try {
      camera.layers.set(0); // the shadow pass picks casters by the main camera's layers
      renderer.setRenderTarget(null);
      renderer.setScissor(0, 0, 0, 0);
      renderer.setScissorTest(true);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    } catch (e) { /* compiled on first use instead */ } finally {
      renderer.setScissorTest(false);
      renderer.setScissor(0, 0, cssW, cssH);
      camera.layers.mask = mask;
      for (let i = 0; i < vis.length; i += 2) vis[i].visible = vis[i + 1];
      for (let i = 0; i < objs.length; i++) objs[i].position.copy(_warmPos[i]);
      shadowForce = true; bgForce = true;
    }
  }

  // ---------------------------------------------------------------- loop
  const updaters = [];
  const visListeners = [];
  let running = false, started = false, rafId = 0, last = 0, gameT = 0, contextLost = false;
  function frame(now) {
    rafId = 0;
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    // high-refresh displays (120 Hz): draw every other vsync; 60/90 Hz draw every one
    if (last && now - last < 10.5) return;
    const rawDt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    gameT += dt;
    applySize(false);
    updatePerf(rawDt);
    updateRoom(dt);
    for (let i = 0; i < updaters.length; i++) {
      try { updaters[i](dt, gameT); } catch (e) { console.warn(e); }
    }
    cam._update(dt);
    // flash & fade
    if (flashLevel > 0) { flashLevel = Math.max(0, flashLevel - dt * flashDecay); }
    flashMat.opacity = flashLevel * flashLevel;
    if (fadeState.active) {
      fadeState.t += dt;
      const k = Math.min(1, fadeState.t / fadeState.dur);
      fadeMat.opacity = lerp(fadeState.from, fadeState.to, easeInOut(k));
      if (k >= 1) { fadeState.active = false; const r = fadeState.resolve; fadeState.resolve = null; if (r) r(); }
    }
    if (!contextLost) {
      if (warmList) warmShadowPass();
      render(true);
    }
  }
  function startLoop() {
    if (running || !started || contextLost) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    running = true; last = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  let visible = !document.hidden;
  function setVisible(v) {
    if (v) startLoop(); else { endPointer(null); stopLoop(); }
    if (v === visible) return;
    visible = v;
    for (let i = 0; i < visListeners.length; i++) {
      try { visListeners[i](v); } catch (e) { console.warn(e); }
    }
  }
  document.addEventListener('visibilitychange', () => setVisible(!document.hidden));
  window.addEventListener('pagehide', () => setVisible(false));
  window.addEventListener('pageshow', () => { if (!document.hidden) setVisible(true); });

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; stopLoop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    buildEnv();
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    shadowForce = true; bgForce = true;
    applySize(true);
    startLoop();
  }, false);

  const onResize = () => applySize(false);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 250); setTimeout(onResize, 700); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  // ---------------------------------------------------------------- helpers
  function toBg(obj) { obj.traverse((o) => { o.layers.set(1); }); return obj; }
  const _proj = new THREE.Vector3();
  const snapCanvas = document.createElement('canvas');

  const engine = {
    renderer, scene, camera,
    LAYER_FG: 0, LAYER_BG: 1,
    quality,
    bgBlur: 0.7,
    roomLight: roomLevel,
    cam,
    input,
    save: createSave(),
    keyLight: key,
    hemiLight: hemi,
    add(obj) { scene.add(obj); return obj; },
    addBg(obj) { toBg(obj); scene.add(obj); return obj; },
    toBg,
    setRoomLight,
    onRoomLight(fn) { roomListeners.push(fn); },
    onUpdate(fn) { updaters.push(fn); },
    offUpdate(fn) { const i = updaters.indexOf(fn); if (i >= 0) updaters.splice(i, 1); },
    onVisibility(fn) { visListeners.push(fn); },
    start() { started = true; applySize(true); startLoop(); },
    raycast(p, objects, recursive = true) {
      if (!objects || !objects.length) return null;
      raycaster.ray.copy(p.ray);
      const hits = raycaster.intersectObjects(objects, recursive);
      return hits.length ? hits[0] : null;
    },
    project(vec3) {
      _proj.copy(vec3).project(camera);
      return { x: (_proj.x * 0.5 + 0.5) * cssW, y: (-_proj.y * 0.5 + 0.5) * cssH };
    },
    flash(seconds = 0.6) { flashLevel = 1; flashDecay = 1 / Math.max(0.05, seconds); },
    fade(alpha, seconds = 1) {
      if (fadeState.resolve) { const r = fadeState.resolve; fadeState.resolve = null; r(); }
      alpha = Math.max(0, Math.min(1, alpha));
      return new Promise((resolve) => {
        if (!(seconds > 0)) { fadeState.active = false; fadeMat.opacity = alpha; resolve(); return; }
        fadeState.from = fadeMat.opacity; fadeState.to = alpha; fadeState.t = 0; fadeState.dur = seconds;
        fadeState.active = true; fadeState.resolve = resolve;
      });
    },
    // compile the shadow-map shaders of hidden objects ahead of time (done at the start of the next frame)
    warmShadows(objs) { warmList = objs; },
    snapshot(size = 320) {
      try {
        if (contextLost) return null;
        cam._pose();
        render(false);
        const w = canvas.width, h = canvas.height;
        const s = Math.min(w, h);
        snapCanvas.width = size; snapCanvas.height = size;
        const ctx = snapCanvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(canvas, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
        const url = snapCanvas.toDataURL('image/jpeg', 0.8);
        return typeof url === 'string' && url.startsWith('data:image') ? url : null;
      } catch (e) { return null; }
    },
  };

  cam.goTo({ target: [0, 0.04, 0.05], pitch: 36, yaw: 0, fitWidth: 1.3, fitHeight: 0.8 }, 0);
  applySize(true);
  return engine;
}
