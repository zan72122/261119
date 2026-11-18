// core.js — 共有の土台: 描画ループ / 入力 / 保存 / 場面切り替え / ヒント / 効果 / 音 / テクスチャ補助
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const SAVE_KEY = 'gf-261119-2-v1';
const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

const ease = {
  linear: k => k,
  in: k => k * k,
  out: k => 1 - (1 - k) * (1 - k),
  inout: k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  back: k => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  bounce: k => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
  elastic: k => (k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};

function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function defaultState() {
  return {
    v: 1, scene: 'pack', done: false,
    parcel: { items: [], closed: false, tapes: [], label: null, stickers: [], leaf: false },
    pack: {}, trip: {}, home: {},
  };
}
const isNum = v => typeof v === 'number' && isFinite(v);
function sanitize(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object' || s.v !== 1) return d;
  const p = s.parcel && typeof s.parcel === 'object' ? s.parcel : {};
  d.scene = typeof s.scene === 'string' ? s.scene : 'pack';
  d.done = !!s.done;
  d.parcel.items = Array.isArray(p.items) ? p.items.filter(k => typeof k === 'string').slice(0, 8) : [];
  d.parcel.closed = !!p.closed;
  d.parcel.tapes = Array.isArray(p.tapes) ? p.tapes.filter(t => t && isNum(t.x0) && isNum(t.z0) && isNum(t.x1) && isNum(t.z1)).slice(0, 12) : [];
  d.parcel.label = p.label && isNum(p.label.x) && isNum(p.label.z) ? { x: p.label.x, z: p.label.z, r: isNum(p.label.r) ? p.label.r : 0 } : null;
  d.parcel.stickers = Array.isArray(p.stickers) ? p.stickers.filter(t => t && typeof t.k === 'string' && isNum(t.x) && isNum(t.z)).map(t => ({ k: t.k, x: t.x, z: t.z, r: isNum(t.r) ? t.r : 0 })).slice(0, 24) : [];
  d.parcel.leaf = !!p.leaf;
  for (const k of ['pack', 'trip', 'home']) if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) d[k] = s[k];
  return d;
}

export const core = {
  THREE, clamp, lerp, ease, rng,
  renderer: null, canvas: null, env: null,
  W: 1, H: 1, aspect: 1, low: false, time: 0,
  state: defaultState(), scenes: {}, cur: null, busy: false,
  safe: { t: 0, b: 0, l: 0, r: 0 },
  _tweens: [], _timers: [], _raf: 0, _last: 0, _scale: 1, _ema: 16, _emaT: 0, _saveT: 0,

  // ---------- 保存 ----------
  load() {
    try { const raw = localStorage.getItem(SAVE_KEY); this.state = raw ? sanitize(JSON.parse(raw)) : defaultState(); }
    catch (e) { this.state = defaultState(); }
    if (this.state.done || !this.scenes[this.state.scene]) this.state = defaultState();
  },
  save() { this._saveT = 0.3; },
  _flush() { this._saveT = 0; try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* 保存できなくても遊べる */ } },
  resetState() { this.state = defaultState(); this._flush(); },
  restart() { this.go('pack', { reset: true, color: '#fff', dur: 0.9 }); },

  // ---------- 場面 ----------
  register(sc) { this.scenes[sc.id] = sc; },
  go(id, o = {}) {
    if (this.busy || !this.scenes[id]) return;
    this.busy = true;
    const fade = this._fade, dur = o.dur ?? 0.6;
    const swap = () => {
      this._endPointer(true);
      if (this.cur) { try { this.cur.exit && this.cur.exit(); } catch (e) { /* noop */ } }
      this._clearAll();
      if (o.reset) this.state = defaultState();
      const sc = this.scenes[id];
      if (!sc._inited) { sc.init(this); sc._inited = true; }
      this.cur = sc; this.state.scene = id; this._flush();
      sc.enter(this);
      this._resize(true);
      if (this.low) this._applyLow();
      this.busy = false;
      fade.style.opacity = '0';
    };
    if (o.instant) { fade.style.transition = 'none'; swap(); return; }
    fade.style.background = o.color || '#000';
    fade.style.transition = `opacity ${dur}s ease`;
    fade.style.opacity = '1';
    let done = false; const once = () => { if (!done) { done = true; swap(); } };
    setTimeout(once, dur * 1000 + 60);
  },
  _clearAll() {
    this._tweens.length = 0; this._timers.length = 0;
    this.hint.clear(); this.fx._clear(); this.au._stopLoops();
  },

  // ---------- 時間 ----------
  tween(dur, fn, o = {}) {
    const tw = { t: -(o.delay || 0), dur: Math.max(0.0001, dur), fn, ease: ease[o.ease || 'inout'] || ease.inout, done: o.done, dead: false, kill() { this.dead = true; } };
    this._tweens.push(tw); return tw;
  },
  after(sec, fn) { const tm = { t: sec, fn, dead: false, kill() { this.dead = true; } }; this._timers.push(tm); return tm; },

  // ---------- カメラ・座標 ----------
  // center を、dir（center→カメラの向き）方向から見て、幅 w・高さ h の領域が画面に収まる距離に置く
  fitCamera(cam, { center, w, h, dir, fov = 40, pad = 1.08, apply = true }) {
    const a = this.aspect, sx = 1 - (this.safe.l + this.safe.r) / this.W, sy = 1 - (this.safe.t + this.safe.b) / this.H;
    const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const dist = Math.max((h / 2) / (tv * sy), (w / 2) / (tv * a * sx)) * pad;
    const pos = new V3().copy(dir).normalize().multiplyScalar(dist).add(center);
    if (apply) { cam.fov = fov; cam.aspect = a; cam.position.copy(pos); cam.lookAt(center); cam.updateProjectionMatrix(); }
    return { pos, dist };
  },
  toScreen(v, out = {}) {
    const p = _v1.copy(v).project(this.cur.camera);
    out.x = (p.x * 0.5 + 0.5) * this.W; out.y = (-p.y * 0.5 + 0.5) * this.H; out.behind = p.z > 1; return out;
  },
  onPlane(p, y, out = new V3()) { _pl.set(_up, -y); return p.ray.intersectPlane(_pl, out); },
  onPlaneN(p, point, normal, out = new V3()) { _pl.setFromNormalAndCoplanarPoint(_v2.copy(normal).normalize(), point); return p.ray.intersectPlane(_pl, out); },
  // 画面上の大きな当たり判定で一番近い物を返す。obj.userData.hitR（ワールド半径）, hitOffset(Vector3) を使える
  pick(p, objs, pad = 26) {
    const cam = this.cur.camera; let best = null, bs = Infinity;
    const k = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (const o of objs) {
      if (!o || !o.visible) continue;
      o.getWorldPosition(_v1); if (o.userData.hitOffset) _v1.add(o.userData.hitOffset);
      const dist = _v1.distanceTo(cam.position);
      let r = o.userData.hitR;
      if (!r) { _box.setFromObject(o); _box.getBoundingSphere(_sph); r = o.userData.hitR = Math.max(0.03, _sph.radius); }
      const s = this.toScreen(_v1, _s1); if (s.behind) continue;
      const rpx = r / dist * k, d = Math.hypot(s.x - p.x, s.y - p.y), sc = d - rpx;
      if (d <= rpx + pad && sc < bs) { bs = sc; best = o; }
    }
    return best;
  },

  // ---------- 起動 ----------
  start() {
    const canvas = this.canvas = document.getElementById('c');
    this._fade = document.getElementById('fade');
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
      if (!r.getContext()) throw new Error('no gl');
    } catch (e) { this._fallback(); return; }
    this.renderer = r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this._dprMax = Math.min(window.devicePixelRatio || 1, 2);
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.fx._init(); this.hint._init();
    this.load();
    const h = (location.hash || '').slice(1);
    if (this.scenes[h]) this.state.scene = h; // 開発用の場面ジャンプ
    this._bind();
    this._measure();
    this.go(this.state.scene, { instant: true });
    this._fade.style.transition = 'opacity 0.8s ease';
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  },
  _fallback() {
    const f = document.getElementById('fb'); if (f) f.style.display = 'block';
    const c = document.getElementById('c'); if (c) c.style.display = 'none';
    const fd = document.getElementById('fade'); if (fd) fd.style.display = 'none';
  },
  _measure() {
    const pr = document.getElementById('probe');
    if (pr) { const cs = getComputedStyle(pr); this.safe = { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 }; }
    this.W = Math.max(1, window.innerWidth); this.H = Math.max(1, window.innerHeight); this.aspect = this.W / this.H;
  },
  _resize(force) {
    const ow = this.W, oh = this.H; this._measure();
    if (!force && ow === this.W && oh === this.H) return;
    this.renderer.setPixelRatio(this._dprMax * this._scale);
    this.renderer.setSize(this.W, this.H, false);
    const sc = this.cur;
    if (sc) {
      if (sc.camera) { sc.camera.aspect = this.aspect; sc.camera.updateProjectionMatrix(); }
      try { sc.resize && sc.resize(this.W, this.H, this.aspect); } catch (e) { /* noop */ }
    }
  },
  _applyLow() {
    this.cur && this.cur.scene && this.cur.scene.traverse(o => { if (o.isLight && o.castShadow) o.castShadow = false; });
  },
  _bind() {
    const c = this.canvas, self = this;
    const mk = e => {
      const p = self._p; p.x = e.clientX; p.y = e.clientY;
      p.nx = (p.x / self.W) * 2 - 1; p.ny = -(p.y / self.H) * 2 + 1;
      _rc.setFromCamera(_v2d.set(p.nx, p.ny), self.cur.camera); p.ray = _rc.ray;
      return p;
    };
    c.addEventListener('pointerdown', e => {
      e.preventDefault();
      self.au._unlock();
      if (self.busy || !self.cur || self._pid !== null) return;
      self._pid = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch (er) { /* noop */ }
      const p = self._p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: self.time, dx: 0, dy: 0, moved: 0, cancel: false };
      mk(e); self.hint.poke();
      try { self.cur.onDown && self.cur.onDown(p); } catch (er) { console.error(er); }
    });
    c.addEventListener('pointermove', e => {
      if (e.pointerId !== self._pid || !self._p) return;
      e.preventDefault();
      const p = self._p, ox = p.x, oy = p.y; mk(e);
      p.dx = p.x - ox; p.dy = p.y - oy; p.moved += Math.hypot(p.dx, p.dy);
      self.hint.poke();
      try { self.cur.onMove && self.cur.onMove(p); } catch (er) { console.error(er); }
    });
    const up = cancel => e => { if (e.pointerId !== self._pid) return; if (!cancel) mk(e); self._endPointer(cancel); };
    c.addEventListener('pointerup', up(false));
    c.addEventListener('pointercancel', up(true));
    c.addEventListener('lostpointercapture', e => { if (e.pointerId === self._pid) self._endPointer(true); });
    const stop = e => e.preventDefault();
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart', 'dragstart'])
      document.addEventListener(ev, stop, { passive: false });
    window.addEventListener('resize', () => self._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => self._resize(), 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => self._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { self._endPointer(true); self._flush(); cancelAnimationFrame(self._raf); self._raf = 0; self.au._suspend(true); }
      else { self.au._suspend(false); self._last = performance.now(); if (!self._raf) self._raf = requestAnimationFrame(self._tick); self._resize(); }
    });
    window.addEventListener('pagehide', () => self._flush());
    c.addEventListener('webglcontextlost', e => e.preventDefault());
  },
  _pid: null, _p: null,
  _endPointer(cancel) {
    if (this._pid === null) return;
    const p = this._p; this._pid = null; this._p = null;
    if (p && this.cur) { p.cancel = !!cancel; this.hint.poke(); try { this.cur.onUp && this.cur.onUp(p); } catch (er) { console.error(er); } }
  },
  get pointerDown() { return this._pid !== null; },

  _tick: null,
  _frame(now) {
    this._raf = requestAnimationFrame(this._tick);
    const raw = (now - this._last) / 1000; this._last = now;
    const dt = clamp(raw, 0, 0.05); this.time += dt;
    // 動的解像度
    this._ema = lerp(this._ema, raw * 1000, 0.08); this._emaT += raw;
    if (this._emaT > 1.2 && this.time > 3) {
      this._emaT = 0;
      if (this._ema > 40 && this._scale > 0.55) { this._scale = Math.max(0.55, this._scale - 0.12); this._resize(true); if (this._scale <= 0.7 && !this.low) { this.low = true; this._applyLow(); } }
      else if (this._ema < 19 && this._scale < 1 && !this.low) { this._scale = Math.min(1, this._scale + 0.06); this._resize(true); }
    }
    if (this._saveT > 0) { this._saveT -= dt; if (this._saveT <= 0) this._flush(); }
    const tm = this._timers;
    for (let i = 0; i < tm.length; i++) { const t = tm[i]; if (t.dead) continue; t.t -= dt; if (t.t <= 0) { t.dead = true; try { t.fn(); } catch (e) { console.error(e); } } }
    for (let i = tm.length - 1; i >= 0; i--) if (tm[i].dead) tm.splice(i, 1);
    const tw = this._tweens;
    for (let i = 0; i < tw.length; i++) {
      const t = tw[i]; if (t.dead) continue; t.t += dt; if (t.t < 0) continue;
      const k = clamp(t.t / t.dur, 0, 1);
      try { t.fn(t.ease(k), k); if (k >= 1) { t.dead = true; t.done && t.done(); } } catch (e) { t.dead = true; console.error(e); }
    }
    for (let i = tw.length - 1; i >= 0; i--) if (tw[i].dead) tw.splice(i, 1);
    const sc = this.cur;
    if (sc) {
      if (!this.busy) { try { sc.update && sc.update(dt, this.time); } catch (e) { console.error(e); } }
      this.fx._update(dt, this.time); this.hint._update(dt, this.time);
      this.renderer.render(sc.scene, sc.camera);
    }
  },
};
core._tick = now => core._frame(now);

const _v1 = new V3(), _v2 = new V3(), _up = new V3(0, 1, 0), _pl = new THREE.Plane(), _rc = new THREE.Raycaster(), _v2d = new THREE.Vector2();
const _white = new THREE.Color(0xffffff);
const _box = new THREE.Box3(), _sph = new THREE.Sphere(), _s1 = {}, _s2 = {};

// ======================================================================
// テクスチャ補助
// ======================================================================
core.tex = {
  canvas(w, h, draw, o = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    t.anisotropy = o.aniso || 4;
    return t;
  },
  // 画素ノイズを重ねる（質感のざらつき）
  grain(ctx, w, h, amt = 0.06, seed = 7) {
    const im = ctx.getImageData(0, 0, w, h), d = im.data, r = rng(seed);
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 255 * amt * 2; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(im, 0, 0);
  },
  // 木目（板の向きは X）。planks>0 でフローリング風の継ぎ目
  wood(o = {}) {
    const { w = 512, h = 512, base = '#b8895a', dark = '#7d5632', light = '#d2a878', planks = 0, seed = 3, repeat } = o;
    return this.canvas(w, h, (g) => {
      const r = rng(seed);
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const rows = planks || 1, ph = h / rows;
      for (let j = 0; j < rows; j++) {
        const y0 = j * ph, tint = (r() - 0.5) * 0.12;
        g.fillStyle = tint > 0 ? `rgba(255,240,210,${tint})` : `rgba(40,20,0,${-tint})`; g.fillRect(0, y0, w, ph);
        for (let i = 0; i < 46 / rows + 6; i++) {
          const y = y0 + r() * ph, amp = 2 + r() * 5, ph0 = r() * 6.28, f = 0.004 + r() * 0.01;
          g.strokeStyle = r() < 0.6 ? dark : light; g.globalAlpha = 0.07 + r() * 0.2; g.lineWidth = 0.6 + r() * 2.2;
          g.beginPath();
          for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * f + ph0) * amp + Math.sin(x * f * 3.1 + ph0) * amp * 0.3; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
          g.stroke();
        }
        g.globalAlpha = 1;
        if (planks) { g.fillStyle = 'rgba(30,15,5,0.55)'; g.fillRect(0, y0, w, 1.5); const sx = r() * w; g.fillRect(sx, y0, 1.5, ph); }
      }
      this.grain(g, w, h, 0.035, seed + 11);
    }, { repeat });
  },
  // 塗り壁・紙・アスファルトなどの細かいムラ
  mottled(o = {}) {
    const { w = 256, h = 256, base = '#d9cbb0', spots = 260, alpha = 0.06, grain = 0.05, seed = 5, repeat } = o;
    return this.canvas(w, h, (g) => {
      const r = rng(seed);
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < spots; i++) {
        const x = r() * w, y = r() * h, s = 4 + r() * 26;
        g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
        g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.8), r() * 3, 0, 6.3); g.fill();
      }
      this.grain(g, w, h, grain, seed + 3);
    }, { repeat });
  },
  radial(inner = 'rgba(255,244,190,1)', outer = 'rgba(255,244,190,0)', size = 128) {
    return this.canvas(size, size, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
  },
};

// ======================================================================
// 効果: 光の輪・明滅・ゆれ・つぶれ・粒
// ======================================================================
core.fx = {
  _h: [], _parts: [], _pool: [], _texGlow: null, _texStar: null, _texDot: null,
  _init() {
    this._texGlow = core.tex.radial();
    this._texDot = core.tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    this._texStar = core.tex.canvas(64, 64, (g) => {
      g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 11 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
    });
  },
  _clear() {
    for (const h of this._h) { try { h._end && h._end(); } catch (e) { /* noop */ } }
    this._h.length = 0;
    for (const p of this._parts) { p.s.removeFromParent(); this._pool.push(p.s); }
    this._parts.length = 0;
  },
  _add(h) { this._h.push(h); return h; },
  // やわらかい光の輪（parent の子として追加）。on(false) で消える
  halo(parent, o = {}) {
    const { r = 0.2, color = 0xfff0a8, y = 0, opacity = 0.75, speed = 2.6 } = o;
    const m = new THREE.SpriteMaterial({ map: this._texGlow, color, transparent: true, opacity: 0, depthWrite: false, depthTest: o.depthTest === true, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m); s.position.y = y; s.scale.setScalar(r * 2); s.renderOrder = 5; parent.add(s);
    const h = { sprite: s, _on: true, _k: 0, dead: false,
      on(v) { this._on = !!v; return this; },
      kill() { this.dead = true; s.removeFromParent(); m.dispose(); },
      _end() { s.removeFromParent(); m.dispose(); },
      _up(dt, t) { this._k = lerp(this._k, this._on ? 1 : 0, Math.min(1, dt * 6)); const pu = 0.5 + 0.5 * Math.sin(t * speed); m.opacity = opacity * this._k * (0.55 + 0.45 * pu); s.scale.setScalar(r * 2 * (0.92 + 0.14 * pu)); s.visible = m.opacity > 0.01; } };
    return this._add(h);
  },
  // 物そのものをほんのり明滅させる（材質を複製して emissive を動かす）
  pulse(obj, o = {}) {
    const { color = 0xffd98a, amp = 0.4, speed = 3.2 } = o; const col = new THREE.Color(color), mats = [];
    obj.traverse(m => {
      if (!m.isMesh || !m.material || !m.material.emissive) return;
      if (!m.userData._pm) { m.material = m.material.clone(); m.userData._pm = true; }
      const mt = m.material, x = { m: mt, e: mt.emissive.clone(), i: mt.emissiveIntensity, em: mt.emissiveMap, c: col.clone() };
      // 光らせても元の色が白っぽく飛ばないよう、絵柄つきは自分の絵柄で、無地は自分の色寄りで光らせる
      if (mt.map && !mt.emissiveMap) { mt.emissiveMap = mt.map; mt.needsUpdate = true; x.c.lerp(_white, 0.5); }
      else if (!mt.map && mt.color) x.c.copy(mt.color).lerp(col, 0.45);
      mats.push(x);
    });
    const h = { dead: false,
      stop() { if (this.dead) return; this.dead = true; this._end(); },
      _end() { for (const x of mats) { x.m.emissive.copy(x.e); x.m.emissiveIntensity = x.i; if (x.m.emissiveMap !== x.em) { x.m.emissiveMap = x.em; x.m.needsUpdate = true; } } },
      _up(dt, t) { const k = amp * (0.5 + 0.5 * Math.sin(t * speed)); for (const x of mats) { x.m.emissive.copy(x.c); x.m.emissiveIntensity = k; } } };
    return this._add(h);
  },
  // こきざみに揺らす（「ここだよ」の合図）。dur 省略で止めるまで
  wobble(obj, o = {}) {
    const { amp = 0.07, speed = 11, axis = 'z', dur = 0 } = o; const base = obj.rotation[axis]; let el = 0;
    const h = { dead: false,
      stop() { if (this.dead) return; this.dead = true; obj.rotation[axis] = base; },
      _end() { obj.rotation[axis] = base; },
      _up(dt) { el += dt; const env = dur ? Math.max(0, 1 - el / dur) : 1; obj.rotation[axis] = base + Math.sin(el * speed) * amp * env; if (dur && el >= dur) this.stop(); } };
    return this._add(h);
  },
  // ぺたっ・ぽすっ のつぶれ
  squash(obj, o = {}) {
    const { amt = 0.22, dur = 0.32 } = o;
    if (!obj.userData._bs) obj.userData._bs = obj.scale.clone();
    const b = obj.userData._bs;
    if (obj.userData._sq) obj.userData._sq.kill();
    obj.userData._sq = core.tween(dur, (k, raw) => {
      const s = Math.sin(raw * Math.PI * 2.2) * (1 - raw) * amt + (raw < 0.12 ? -amt * (1 - raw / 0.12) : 0);
      obj.scale.set(b.x * (1 - s * 0.6), b.y * (1 + s), b.z * (1 - s * 0.6));
    }, { ease: 'linear', done: () => obj.scale.copy(b) });
  },
  // 粒（上限つき）。kind: 'star' | 'dot'
  burst(pos, o = {}) {
    const { n = 10, colors = [0xfff3a0, 0xffffff, 0xffc0d0], size = 0.022, speed = 0.55, life = 0.7, gravity = -1.1, kind = 'star', up = 0.5 } = o;
    const cap = core.low ? 40 : 90, sc = core.cur && core.cur.scene; if (!sc) return;
    for (let i = 0; i < n && this._parts.length < cap; i++) {
      let s = this._pool.pop();
      if (!s) s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.material.map = kind === 'star' ? this._texStar : this._texDot; s.material.color.setHex(colors[i % colors.length]); s.material.opacity = 1; s.material.needsUpdate = true;
      s.position.copy(pos); s.renderOrder = 6; sc.add(s);
      const a = Math.random() * 6.283, e = Math.random() * 0.9 + 0.2, v = speed * (0.5 + Math.random() * 0.7);
      this._parts.push({ s, vx: Math.cos(a) * v * e, vy: v * up + Math.random() * v * 0.8, vz: Math.sin(a) * v * e, t: 0, life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.7), g: gravity, rot: (Math.random() - 0.5) * 8 });
    }
  },
  _update(dt, t) {
    const hs = this._h;
    for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (h.dead) { hs.splice(i, 1); continue; } h._up && h._up(dt, t); }
    const ps = this._parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { p.s.removeFromParent(); this._pool.push(p.s); ps.splice(i, 1); continue; }
      p.vy += p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.material.opacity = 1 - k * k; p.s.material.rotation += p.rot * dt; p.s.scale.setScalar(p.size * (0.6 + 0.4 * Math.sin(Math.min(1, k * 4) * 1.57)));
    }
  },
};

// ======================================================================
// ヒント: 放置で段階的に強まる。最後は半透明の指のお手本
//   core.hint.set({ kind:'tap'|'drag'|'hold', from:()=>Vector3, to:()=>Vector3, cue:(stage)=>{}, d1:4, d2:8 })
//   cue(1) は放置 d1 秒で呼ばれ、その後も約 4 秒ごとに呼ばれる（音やゆれで「ここだよ」）。cue(2) は指が出るとき。cue(0) は触ったとき
// ======================================================================
core.hint = {
  cfg: null, idle: 0, stage: 0, _cueT: 0, _ph: 0, _sp: null, _ring: null,
  _init() {
    const tex = core.tex.canvas(256, 256, (g) => {
      const skin = g.createLinearGradient(60, 0, 200, 256); skin.addColorStop(0, '#ffdcc2'); skin.addColorStop(1, '#eeb28c');
      const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
      g.shadowColor = 'rgba(40,20,5,0.55)'; g.shadowBlur = 16; g.shadowOffsetY = 5;
      g.fillStyle = skin; g.strokeStyle = 'rgba(120,70,40,0.85)'; g.lineWidth = 4;
      rr(62, 128, 142, 112, 44); g.fill();                 // 手の甲
      g.save(); g.translate(70, 170); g.rotate(-0.55); rr(-22, -52, 44, 86, 22); g.fill(); g.restore(); // 親指
      rr(100, 14, 50, 170, 25); g.fill();                  // 人さし指
      g.shadowColor = 'transparent';
      rr(62, 128, 142, 112, 44); g.stroke(); rr(100, 14, 50, 170, 25); g.stroke();
      g.fillStyle = skin; g.fillRect(104, 120, 42, 40);
      g.strokeStyle = 'rgba(150,95,60,0.4)'; g.lineWidth = 2.5;
      for (const x of [152, 176]) { g.beginPath(); g.moveTo(x, 136); g.lineTo(x, 176); g.stroke(); }
      g.fillStyle = 'rgba(255,248,244,0.9)'; rr(109, 22, 32, 30, 13); g.fill(); // 爪
    });
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const s = this._sp = new THREE.Sprite(m); s.center.set(0.49, 0.93); s.renderOrder = 999; s.visible = false;
    const rm = new THREE.SpriteMaterial({ map: core.tex.canvas(128, 128, (g) => { g.strokeStyle = 'rgba(90,50,20,0.5)'; g.lineWidth = 15; g.beginPath(); g.arc(64, 64, 50, 0, 6.3); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 50, 0, 6.3); g.stroke(); }), transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const r = this._ring = new THREE.Sprite(rm); r.renderOrder = 998; r.visible = false;
  },
  set(cfg) { this.cfg = cfg; this.idle = 0; this.stage = 0; this._cueT = 0; this._ph = 0; this._hide(); },
  clear() { this.cfg = null; this.stage = 0; this.idle = 0; this._hide(); if (this._sp) { this._sp.removeFromParent(); this._ring.removeFromParent(); } },
  poke() { const was = this.stage; this.idle = 0; this.stage = 0; this._cueT = 0; this._ph = 0; this._hide(); if (was && this.cfg && this.cfg.cue) { try { this.cfg.cue(0); } catch (e) { /* noop */ } } },
  _hide() { if (this._sp) { this._sp.visible = false; this._sp.material.opacity = 0; this._ring.visible = false; } },
  _update(dt, t) {
    const c = this.cfg; if (!c || core.busy || !core.cur) return;
    if (core.pointerDown) return;
    this.idle += dt;
    const d1 = c.d1 ?? 4, d2 = c.d2 ?? 8;
    const cue = n => { if (c.cue) { try { c.cue(n); } catch (e) { console.error(e); } } };
    if (this.stage === 0 && this.idle >= d1) { this.stage = 1; this._cueT = 0; cue(1); }
    if (this.stage >= 1) { this._cueT += dt; if (this._cueT >= 4.2) { this._cueT = 0; cue(1); } }
    if (this.stage === 1 && this.idle >= d2) { this.stage = 2; this._ph = 0; cue(2); }
    if (this.stage !== 2) return;
    const sp = this._sp, ring = this._ring, sc = core.cur.scene, cam = core.cur.camera;
    if (sp.parent !== sc) { sc.add(sp); sc.add(ring); }
    const a = c.from && c.from(); if (!a) { this._hide(); return; }
    const b = c.kind === 'drag' && c.to ? c.to() : null;
    const total = c.kind === 'drag' ? 3.2 : c.kind === 'hold' ? 3.4 : 2.2;
    this._ph = (this._ph + dt) % total; const ph = this._ph;
    let press = 0, op = 0, k = 0;
    if (c.kind === 'drag') {
      op = ph < 0.3 ? ph / 0.3 : ph > 2.6 ? Math.max(0, 1 - (ph - 2.6) / 0.4) : 1;
      press = clamp((ph - 0.35) / 0.2, 0, 1) * (ph < 2.4 ? 1 : Math.max(0, 1 - (ph - 2.4) / 0.2));
      k = ease.inout(clamp((ph - 0.75) / 1.5, 0, 1));
    } else if (c.kind === 'hold') {
      op = ph < 0.3 ? ph / 0.3 : ph > 2.9 ? Math.max(0, 1 - (ph - 2.9) / 0.4) : 1;
      press = clamp((ph - 0.4) / 0.2, 0, 1) * (ph < 2.7 ? 1 : Math.max(0, 1 - (ph - 2.7) / 0.2));
    } else {
      op = ph < 0.25 ? ph / 0.25 : ph > 1.7 ? Math.max(0, 1 - (ph - 1.7) / 0.4) : 1;
      const q = (ph - 0.4) % 0.65; press = ph > 0.4 && ph < 1.7 ? (q < 0.14 ? q / 0.14 : q < 0.3 ? 1 : Math.max(0, 1 - (q - 0.3) / 0.15)) : 0;
    }
    _v1.copy(a); if (b) _v1.lerp(b, k);
    if (b && c.arc) _v1.y += Math.sin(k * Math.PI) * c.arc;
    const dist = _v1.distanceTo(cam.position), wpp = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / core.H; // 1px あたりのワールド長
    const px = clamp(Math.min(core.W, core.H) * 0.24, 80, 132);
    sp.position.copy(_v1); sp.position.addScaledVector(_v2.set(0, 1, 0).applyQuaternion(cam.quaternion), (1 - press) * 16 * wpp);
    sp.scale.setScalar(px * wpp * (1 - press * 0.08)); sp.material.opacity = 0.86 * op; sp.visible = op > 0.01;
    ring.position.copy(_v1); const rk = c.kind === 'tap' ? press : (press * (0.6 + 0.4 * Math.sin(t * 7)));
    ring.scale.setScalar(px * wpp * (0.35 + 0.35 * rk)); ring.material.opacity = 0.8 * op * press; ring.visible = ring.material.opacity > 0.01;
  },
};

// ======================================================================
// 音: Web Audio の合成音だけ。最初のタッチで開始。失敗しても無音で続く
// ======================================================================
core.au = {
  ctx: null, out: null, _loops: [], _nb: null,
  _unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
      const g = this.out = c.createGain(); g.gain.value = 0.85; g.connect(comp); comp.connect(c.destination);
      const nb = this._nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (c.state === 'suspended') c.resume().catch(() => {});
      for (const f of this._onReady.splice(0)) { try { f(); } catch (e) { /* noop */ } }
    } catch (e) { this.ctx = null; }
  },
  _onReady: [],
  // 音が使えるようになったら呼ぶ（エンジン音などのループ開始用）。すでに使えるなら即時
  ready(fn) { if (this.ctx) fn(); else this._onReady.push(fn); },
  _suspend(v) { if (!this.ctx) return; try { v ? this.ctx.suspend() : this.ctx.resume(); } catch (e) { /* noop */ } },
  _stopLoops() { for (const l of this._loops.splice(0)) { try { l.stop(0.1); } catch (e) { /* noop */ } } this._onReady.length = 0; },
  get now() { return this.ctx ? this.ctx.currentTime : 0; },
  // 単音。f→f2 へ滑る。at は今からの遅れ秒
  tone(o = {}) {
    const c = this.ctx; if (!c) return;
    const { f = 440, f2, dur = 0.2, type = 'sine', g = 0.2, a = 0.006, at = 0, det = 0 } = o;
    try {
      const t = c.currentTime + at, os = c.createOscillator(), gn = c.createGain();
      os.type = type; os.frequency.setValueAtTime(f, t); if (f2) os.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      os.detune.value = det;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      os.connect(gn); gn.connect(this.out); os.start(t); os.stop(t + dur + 0.03);
    } catch (e) { /* noop */ }
  },
  // フィルタをかけたノイズ
  noise(o = {}) {
    const c = this.ctx; if (!c) return;
    const { dur = 0.2, g = 0.2, f = 1200, f2, q = 1, type = 'bandpass', a = 0.003, at = 0 } = o;
    try {
      const t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), gn = c.createGain();
      s.buffer = this._nb; s.loop = true; fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl); fl.connect(gn); gn.connect(this.out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
    } catch (e) { /* noop */ }
  },
  // 鳴りっぱなしの音（エンジン、テープを引く音など）。場面を出ると自動で止まる。音が使えないときは何もしないハンドルを返す
  loop(o = {}) {
    const c = this.ctx, nop = { set() {}, stop() {}, dead: true }; if (!c) return nop;
    const { kind = 'noise', type = 'bandpass', f = 400, q = 1, osc = 'sawtooth' } = o;
    try {
      const gn = c.createGain(); gn.gain.value = 0; gn.connect(this.out);
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; fl.connect(gn);
      let src;
      if (kind === 'noise') { src = c.createBufferSource(); src.buffer = this._nb; src.loop = true; }
      else { src = c.createOscillator(); src.type = osc; src.frequency.value = o.pitch || 80; }
      src.connect(fl); src.start();
      const h = { dead: false,
        // set({g, f, pitch}, 時定数)
        set(v, tc = 0.08) { if (this.dead) return; const t = c.currentTime; if (v.g !== undefined) gn.gain.setTargetAtTime(v.g, t, tc); if (v.f !== undefined) fl.frequency.setTargetAtTime(v.f, t, tc); if (v.pitch !== undefined && src.frequency) src.frequency.setTargetAtTime(v.pitch, t, tc); },
        stop(fade = 0.15) { if (this.dead) return; this.dead = true; const t = c.currentTime; gn.gain.setTargetAtTime(0, t, fade / 3); try { src.stop(t + fade + 0.1); } catch (e) { /* noop */ } } };
      this._loops.push(h); return h;
    } catch (e) { return nop; }
  },
  // ---- よく使う音 ----
  peta(s = 1) { this.noise({ dur: 0.07, g: 0.5 * s, f: 2600, f2: 900, q: 0.7 }); this.tone({ f: 190, f2: 85, dur: 0.13, g: 0.5 * s, type: 'sine' }); this.tone({ f: 620, f2: 380, dur: 0.06, g: 0.12 * s, type: 'triangle', at: 0.012 }); },
  pop(p = 1) { this.tone({ f: 420 * p, f2: 880 * p, dur: 0.09, g: 0.3, type: 'sine' }); },
  thud(s = 1) { this.tone({ f: 120, f2: 55, dur: 0.18, g: 0.55 * s }); this.noise({ dur: 0.09, g: 0.22 * s, f: 500, q: 0.6, type: 'lowpass' }); },
  knock(p = 1) { this.tone({ f: 240 * p, f2: 150 * p, dur: 0.09, g: 0.4, type: 'triangle' }); this.noise({ dur: 0.04, g: 0.2, f: 1500 * p, q: 1.2 }); },
  tick() { this.noise({ dur: 0.03, g: 0.25, f: 3200, q: 2 }); },
  whoosh(s = 1) { this.noise({ dur: 0.32, g: 0.16 * s, f: 500, f2: 2400, q: 0.9, a: 0.1 }); },
  rustle() { this.noise({ dur: 0.16, g: 0.14, f: 3800, f2: 2200, q: 0.8, a: 0.03 }); },
  clap() { this.noise({ dur: 0.07, g: 0.4, f: 1700, q: 0.9 }); this.noise({ dur: 0.05, g: 0.2, f: 3600, q: 1, at: 0.008 }); },
  // オルゴール風の1音（midi 番号）
  bell(midi = 72, o = {}) {
    const f = 440 * Math.pow(2, (midi - 69) / 12), g = o.g ?? 0.2, at = o.at || 0, dur = o.dur || 1.1;
    this.tone({ f, dur, g, at, a: 0.004 }); this.tone({ f: f * 2.01, dur: dur * 0.5, g: g * 0.35, at, a: 0.004 }); this.tone({ f: f * 5.4, dur: 0.08, g: g * 0.12, at, a: 0.002 });
  },
  // きらきら（上がる3音）
  sparkle(base = 76) { [0, 4, 7, 12].forEach((d, i) => this.bell(base + d, { at: i * 0.07, g: 0.13, dur: 0.6 })); },
  // 旋律: [[midi, 拍], ...]（midi が null なら休み）
  melody(notes, o = {}) { const beat = 60 / (o.tempo || 100); let t = o.at || 0; for (const [m, b] of notes) { if (m != null) this.bell(m, { at: t, g: o.g ?? 0.17, dur: Math.max(0.5, b * beat * 1.6) }); t += b * beat; } return t; },
};
