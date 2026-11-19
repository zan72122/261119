// 指1本の入力。hero の操作部（targets）を掴んだときだけドラッグを渡す。
// 2本目以降の指・ピンチ・カメラ操作はすべて無視する。

const TAP_MS = 300;
const TAP_PX = 14;

export class Input {
  constructor(THREE, canvas, camera) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.startNdc = new THREE.Vector2();
    this.ray = new THREE.Ray();
    this.targets = [];
    this.pointerId = null;
    this.targetId = null;
    this.down = false;
    this.startPx = { x: 0, y: 0 };
    this.px = { x: 0, y: 0 };
    this.startTime = 0;
    this.events = [];
    this.idleTime = 2.5;        // 起動直後から次の操作部を光らせる
    this.onAnyDown = null;      // (info) => void  音の解除や空タップの反応に使う
    this.onEmptyTap = null;
    this.enabled = true;
    this._rect = null;          // canvas の位置と大きさ（毎フレーム測り直さない。大きさが変わったら捨てる）
    const dropRect = () => { this._rect = null; };
    window.addEventListener('resize', dropRect);
    window.addEventListener('orientationchange', dropRect);
    window.addEventListener('scroll', dropRect, { passive: true });

    const opt = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this._down(e), opt);
    canvas.addEventListener('pointermove', (e) => this._move(e), opt);
    canvas.addEventListener('pointerup', (e) => this._up(e, false), opt);
    canvas.addEventListener('pointercancel', (e) => this._up(e, true), opt);
    canvas.addEventListener('lostpointercapture', (e) => { if (e.pointerId === this.pointerId) this._up(e, true); });
    // iOS のピンチ・ダブルタップ拡大・長押しメニューを止める
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick']) {
      document.addEventListener(ev, (e) => e.preventDefault(), opt);
    }
    canvas.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, opt);
    canvas.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, opt);
  }

  setTargets(targets) { this.targets = targets || []; }

  /** canvas の getBoundingClientRect（キャッシュ）。毎フレームのレイアウト計算を避ける */
  rect() { return this._rect || (this._rect = this.canvas.getBoundingClientRect()); }

  _setNdc(e, out) {
    const r = this.rect();
    out.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _pick(e) {
    // 1) 当たり判定オブジェクトへのレイキャスト
    this.raycaster.setFromCamera(this.ndc, this.camera);
    let best = null;
    for (const t of this.targets) {
      if (t.enabled === false || !t.object) continue;
      const hit = this.raycaster.intersectObject(t.object, true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { t, d: hit.distance };
    }
    if (best) return best.t;
    // 2) 外れても近ければ拾う（5歳児の指は大きい）
    const r = this.rect();
    const minDim = Math.min(r.width, r.height);
    const reach = Math.max(70, 0.09 * minDim);
    const v = new this.THREE.Vector3();
    let near = null;
    for (const t of this.targets) {
      if (t.enabled === false || !t.anchor) continue;
      t.anchor.getWorldPosition(v).project(this.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * r.width + r.left;
      const sy = (-v.y * 0.5 + 0.5) * r.height + r.top;
      const d = Math.hypot(sx - e.clientX, sy - e.clientY);
      const lim = reach * (t.reachScale || 1);
      if (d < lim && (!near || d < near.d)) near = { t, d };
    }
    return near ? near.t : null;
  }

  _down(e) {
    e.preventDefault();
    if (this.onAnyDown) this.onAnyDown(e);
    if (!this.enabled || this.pointerId !== null) return; // 2本目の指は無視
    this._rect = null;          // 触った瞬間だけ測り直す（念のため）
    this._setNdc(e, this.ndc);
    this.idleTime = 0;
    const t = this._pick(e);
    this.pointerId = e.pointerId;
    this.down = true;
    this.targetId = t ? t.id : null;
    this.startNdc.copy(this.ndc);
    this.startPx = { x: e.clientX, y: e.clientY };
    this.px = { x: e.clientX, y: e.clientY };
    this.startTime = performance.now();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (t) this.events.push({ type: 'down', targetId: t.id });
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this._setNdc(e, this.ndc);
    this.px = { x: e.clientX, y: e.clientY };
    this.idleTime = 0;
  }

  _up(e, cancel) {
    if (e.pointerId !== this.pointerId) return;
    this._setNdc(e, this.ndc);
    this.px = { x: e.clientX, y: e.clientY };
    const dt = performance.now() - this.startTime;
    const moved = Math.hypot(this.px.x - this.startPx.x, this.px.y - this.startPx.y);
    const tap = !cancel && dt < TAP_MS && moved < TAP_PX;
    if (this.targetId) {
      this.events.push({ type: cancel ? 'cancel' : 'up', targetId: this.targetId });
      if (tap) this.events.push({ type: 'tap', targetId: this.targetId });
    } else if (tap && this.onEmptyTap) {
      this.onEmptyTap(e);
    }
    this.pointerId = null;
    this.down = false;
    this.targetId = null;
    this.idleTime = 0;
  }

  /** hero.update に渡す入力（毎フレーム作り直さず、同じオブジェクトを更新） */
  frame(dt, time, hintLevel) {
    if (!this.down) this.idleTime += dt;
    const r = this.rect();
    const minDim = Math.max(1, Math.min(r.width, r.height));
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.ray.copy(this.raycaster.ray);
    const dx = this.px.x - this.startPx.x;
    const dy = this.px.y - this.startPx.y;
    const s = this._state || (this._state = { pointer: {} });
    s.time = time;
    s.dt = dt;
    s.idleTime = this.idleTime;
    s.hintLevel = hintLevel;
    s.events = this.events;
    s.camera = this.camera;
    const p = s.pointer;
    p.down = this.down && !!this.targetId;
    p.targetId = this.down ? this.targetId : null;
    p.ndc = this.ndc;
    p.startNdc = this.startNdc;
    p.ray = this.ray;
    p.dragPx = { x: this.down ? dx : 0, y: this.down ? dy : 0 };
    p.dragNorm = { x: p.dragPx.x / minDim, y: p.dragPx.y / minDim };
    return s;
  }

  endFrame() { this.events = []; }

  /** 合成入力（煙テスト・デバッグ用） */
  inject(type, targetId) { this.events.push({ type, targetId }); }
}
