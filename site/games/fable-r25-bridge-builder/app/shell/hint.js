// The "finger" hint: a translucent hand drawn over the active control, showing the gesture
// (circle or swipe). Pure DOM/SVG, no text. Appears after the child has been idle for a while.
import { clamp, smooth } from './geo.js';

// seconds idle before the hand appears. A 5-year-old should not wait long: the very first time
// (nothing touched yet) the hand shows almost at once, afterwards after a short pause.
const SHOW_FIRST = 0.6;
const SHOW_AFTER = 2.5;

const HAND_SVG = `
<svg viewBox="0 0 64 80" width="64" height="80" aria-hidden="true">
  <g fill="#ffffff" stroke="#5a4a7a" stroke-width="3" stroke-linejoin="round">
    <path d="M24 8 a6 6 0 0 1 12 0 v26 l4-1 a5 5 0 0 1 6 4 l1 1 a5 5 0 0 1 7 4 v2 a5 5 0 0 1 6 5 v12
             c0 10 -8 17 -18 17 h-6 c-7 0 -12 -4 -15 -9 l-11 -18 a5 5 0 0 1 8 -6 l6 7 z"/>
  </g>
</svg>`;

export class Hint {
  constructor(THREE, root) {
    this.THREE = THREE;
    this.el = document.createElement('div');
    this.el.className = 'r25-hint';
    this.el.innerHTML = `<div class="r25-ring"></div><div class="r25-hand">${HAND_SVG}</div>`;
    root.appendChild(this.el);
    this.ring = this.el.querySelector('.r25-ring');
    this.t = 0;
    this.alpha = 0;
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.p = {}; this.p2 = {};
    this.visible = false;
    this.everTouched = false;
  }

  /**
   * control: Control from the hero (or null). input: the frame Input (for idle & project).
   */
  update(dt, control, input, cameraMoving) {
    if (input.down) this.everTouched = true;
    const wait = this.everTouched ? SHOW_AFTER : SHOW_FIRST;
    const want = !!control && !input.down && input.idle > wait && !cameraMoving;
    this.alpha = clamp(this.alpha + (want ? dt * 2.5 : -dt * 6), 0, 1);
    this.visible = this.alpha > 0.01;
    if (!this.visible || !control) { this.el.style.opacity = '0'; this.t = 0; return; }
    this.t += dt;
    const anchor = control.anchor || control.hit;
    anchor.getWorldPosition(this.v);
    const c = input.project(this.v, this.p);
    let x = c.x, y = c.y, press = 0;
    if (control.gesture === 'circle') {
      // projected radius
      this.v2.copy(this.v).add(this.THREE.Object3D.DEFAULT_UP.clone().multiplyScalar(control.radius || 0.4));
      const e = input.project(this.v2, this.p2);
      const rpx = clamp(Math.hypot(e.x - c.x, e.y - c.y), 40, 150);
      const a = this.t * 2.6;
      x += Math.cos(a) * rpx; y += Math.sin(a) * rpx;
      press = 1;
    } else {
      const dir = control.swipeDir || new this.THREE.Vector3(0, 1, 0);
      // hero root is identity (HERO-SPEC §2), so root-local == world
      this.v2.copy(dir).multiplyScalar(0.6).add(this.v);
      const e = input.project(this.v2, this.p2);
      let sx = e.x - c.x, sy = e.y - c.y;
      const l = Math.hypot(sx, sy) || 1;
      sx /= l; sy /= l;
      const span = clamp(input.height * 0.22, 80, 220);
      const cyc = (this.t % 1.6) / 1.6;
      const k = smooth(cyc / 0.75);
      x += sx * span * (k - 0.35); y += sy * span * (k - 0.35);
      press = cyc < 0.8 ? 1 : 0;
    }
    this.el.style.opacity = String(this.alpha * 0.85);
    this.el.style.transform = `translate(${x | 0}px, ${y | 0}px)`;
    this.ring.style.opacity = String(press * 0.7);
  }
}
