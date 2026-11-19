// 「次はここ」を指す手（文字なし）。止まって少したつと、次の操作部の上に出て
// タップなら押す動き、ドラッグならその向きに動く。DOM の SVG なので GPU 予算に入らない。

const HAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
<path d="M26 6c3 0 5 2 5 5v17l2-1c2-1 5 0 6 2l1 1c2-1 5 0 6 2l1 1c2-1 5 0 6 3v12c0 9-6 15-15 15h-4c-6 0-10-3-13-8l-8-13c-1-2 0-5 3-6 2-1 4 0 5 1l3 4V11c0-3 2-5 5-5z"
 fill="#fff" stroke="#5a3a4a" stroke-width="3" stroke-linejoin="round"/>
<path d="M31 28v10M40 30v8M49 33v6" stroke="#e0b8c4" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export class HintHand {
  constructor(THREE, camera, canvas, getRect) {
    this.THREE = THREE;
    this.getRect = getRect || (() => canvas.getBoundingClientRect());
    this.hidden = false;
    this.camera = camera;
    this.canvas = canvas;
    this.el = document.createElement('div');
    this.el.className = 'hint-hand';
    this.el.innerHTML = HAND_SVG;
    document.body.appendChild(this.el);
    this.ring = document.createElement('div');
    this.ring.className = 'hint-ring';
    document.body.appendChild(this.ring);
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
    this.t = 0;
    this.alpha = 0;
  }

  _screen(v, r) {
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, ok: v.z < 1 };
  }

  update(dt, target, level) {
    this.t += dt;
    const want = target && target.anchor ? level : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 5);
    if (this.alpha < 0.02 || !target || !target.anchor) { this._hide(); return; }
    const r = this.getRect();
    target.anchor.getWorldPosition(this.a);
    const p = this._screen(this.b.copy(this.a), r);
    if (!p.ok) { this._hide(); return; }
    this.hidden = false;
    const size = Math.max(64, Math.min(r.width, r.height) * 0.11);
    let x = p.x, y = p.y, press = 0;
    const g = target.gesture || 'tap';
    if (g === 'tap') {
      const c = (this.t * 1.4) % 1;
      press = c < 0.25 ? Math.sin((c / 0.25) * Math.PI) : 0;
    } else {
      // ドラッグ：アンカーから dragTo（またはアンカー＋dragAxis）へ動いて戻る
      if (target.dragTo) target.dragTo.getWorldPosition(this.b);
      else this.b.copy(this.a).addScaledVector(target.dragAxis || new this.THREE.Vector3(0, -1, 0), 0.9);
      const q = this._screen(this.b, r);
      const c = (this.t * 0.7) % 1;
      const k = c < 0.15 ? 0 : c < 0.75 ? (c - 0.15) / 0.6 : 1;
      const e = k * k * (3 - 2 * k);
      x = p.x + (q.x - p.x) * e;
      y = p.y + (q.y - p.y) * e;
      press = c < 0.8 ? 1 : 0;
    }
    const s = 1 - press * 0.12;
    this.el.style.opacity = String(this.alpha);
    this.el.style.width = this.el.style.height = size + 'px';
    // 指先（SVG の左上寄り 26,6）が目標に来るように
    this.el.style.transform = `translate(${x - size * 0.4}px, ${y - size * 0.06}px) scale(${s})`;
    const rs = size * (0.7 + ((this.t * 1.4) % 1) * 0.5);
    this.ring.style.opacity = String(this.alpha * (1 - ((this.t * 1.4) % 1)) * 0.9);
    this.ring.style.width = this.ring.style.height = rs + 'px';
    this.ring.style.transform = `translate(${p.x - rs / 2}px, ${p.y - rs / 2}px)`;
  }

  /** 隠す（毎フレーム同じ style を書かない） */
  _hide() {
    if (this.hidden) return;
    this.hidden = true;
    this.el.style.opacity = '0'; this.ring.style.opacity = '0';
  }

  dispose() { this.el.remove(); this.ring.remove(); }
}
