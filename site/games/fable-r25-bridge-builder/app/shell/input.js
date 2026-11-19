// Single-finger input. Produces the per-frame Input object described in docs/HERO-SPEC.md §4.3.
// Extra fingers, pinch, double-tap zoom and context menus are ignored/blocked.

export class Input {
  constructor(THREE, canvas, camera, getControls, onFirstTouch) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.camera = camera;
    this.getControls = getControls;
    this.raycaster = new THREE.Raycaster();
    this.pointerId = null;
    this.downAt = 0; this.startX = 0; this.startY = 0; this.maxMove = 0;
    this.px = 0; this.py = 0; this.accDx = 0; this.accDy = 0;
    this.evPressed = false; this.evReleased = false; this.evTap = false;
    this.lastActivity = 0;
    this.taps = 0; // debug counter
    const ndc = new THREE.Vector2();
    this._ndc = ndc;
    this._tmp = new THREE.Vector3();
    this.state = {
      down: false, pressed: false, released: false, tap: false,
      controlId: null, x: 0, y: 0, dx: 0, dy: 0,
      ray: new THREE.Ray(), prevRay: new THREE.Ray(),
      camera, width: 1, height: 1, idle: 0, time: 0,
      project: (v, out) => this.project(v, out),
    };

    const opt = { passive: false };
    canvas.addEventListener('pointerdown', (e) => {
      onFirstTouch && onFirstTouch();
      if (this.pointerId !== null) return; // one finger only
      e.preventDefault();
      this.pointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this._setXY(e);
      this.startX = this.px; this.startY = this.py; this.maxMove = 0;
      this.downAt = performance.now();
      this.evPressed = true;
      this.state.down = true;
      this.state.controlId = this.pick(this.px, this.py);
      this.lastActivity = this.state.time;
    }, opt);
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const ox = this.px, oy = this.py;
      this._setXY(e);
      this.accDx += this.px - ox; this.accDy += this.py - oy;
      this.maxMove = Math.max(this.maxMove, Math.hypot(this.px - this.startX, this.py - this.startY));
      this.lastActivity = this.state.time;
    }, opt);
    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.evReleased = true;
      if (this.maxMove < 12 && performance.now() - this.downAt < 350) { this.evTap = true; this.taps++; }
      this.state.down = false;
      this.lastActivity = this.state.time;
    };
    canvas.addEventListener('pointerup', end, opt);
    canvas.addEventListener('pointercancel', end, opt);
    canvas.addEventListener('lostpointercapture', end, opt);
    // block browser gestures (iOS Safari)
    for (const ev of ['touchstart', 'touchmove', 'touchend']) canvas.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, opt);
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault(), opt);
  }

  _setXY(e) {
    const r = this.canvas.getBoundingClientRect();
    this.px = e.clientX - r.left; this.py = e.clientY - r.top;
  }

  _ray(x, y, ray) {
    const w = this.state.width, h = this.state.height;
    this._ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    ray.copy(this.raycaster.ray);
    return ray;
  }

  /** Control id under the CSS pixel (x, y), or null. */
  pick(x, y) {
    const controls = this.getControls();
    if (!controls) return null;
    this._ray(x, y, this.state.prevRay);
    let best = null, bestD = Infinity;
    for (const id of Object.keys(controls)) {
      const c = controls[id];
      if (!c || !c.hit) continue;
      const hits = this.raycaster.intersectObject(c.hit, true);
      if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = c.id || id; }
    }
    return best;
  }

  project(v, out) {
    const p = this._tmp.copy(v).project(this.camera);
    out = out || {};
    out.x = (p.x + 1) / 2 * this.state.width;
    out.y = (1 - p.y) / 2 * this.state.height;
    out.z = p.z;
    return out;
  }

  /** Builds the Input for this frame. `idleBase` = time the current stage began. */
  frame(time, width, height, idleBase) {
    const s = this.state;
    s.time = time; s.width = width; s.height = height;
    s.prevRay.copy(s.ray);
    s.x = this.px; s.y = this.py;
    s.dx = this.accDx; s.dy = this.accDy;
    this.accDx = this.accDy = 0;
    s.pressed = this.evPressed; s.released = this.evReleased; s.tap = this.evTap;
    this.evPressed = this.evReleased = this.evTap = false;
    this._ray(s.x, s.y, s.ray);
    if (s.pressed) s.prevRay.copy(s.ray);
    if (!s.down && !s.released) s.controlId = null;
    s.idle = s.down ? 0 : Math.max(0, time - Math.max(this.lastActivity, idleBase));
    return s;
  }

  /** Clear the frame-edge flags after hero.update consumed them. */
  endFrame() {
    if (!this.state.down) this.state.controlId = null;
  }
}
