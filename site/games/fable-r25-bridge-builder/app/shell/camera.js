// Fixed camera positions ("work", "cross", "finale") with slow eased transitions.
// No free camera, no shake, no zoom (constant FOV).
// Each view is a fixed viewing direction plus a set of points that must be on screen; the camera
// is moved as close as it can while every point stays inside a safe frame. This keeps the
// machine's controls large and low on the screen in landscape and in portrait alike.
import { TARGETS, landingPoint } from './config.js';
import { smooth } from './geo.js';

const MOVE_TIME = 1.8;
const FOV = 50;

// safe frame in NDC: [left, right, bottom, top]. The bottom leaves room for the finger hint
// circle under the wheel; the top leaves sky above the far bank.
const FRAME = { work: [-0.9, 0.9, -0.84, 0.78], cross: [-0.88, 0.88, -0.86, 0.72], finale: [-0.9, 0.9, -0.62, 0.7] };

// the machine's control panel faces +Z (hero-notes §5): corners and top of the moving parts
const PANEL = [[-1.35, 0.12, 1.1], [1.35, 0.12, 1.1], [-1.35, 1.2, 1.0], [1.35, 1.2, 1.0], [0, 1.9, 0.0]];

export class CameraRig {
  constructor(THREE, camera) {
    this.THREE = THREE;
    this.camera = camera;
    this.fromPos = new THREE.Vector3(); this.fromLook = new THREE.Vector3();
    this.toPos = new THREE.Vector3(); this.toLook = new THREE.Vector3();
    this.curPos = new THREE.Vector3(); this.curLook = new THREE.Vector3();
    this.u = 1;
    this.view = null; this.round = 0;
    this.aspect = 4 / 3;
    this._l = new THREE.Vector3();
    this._cam = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.1, 1000);
    this._p = new THREE.Vector3();
  }

  /** Points that must be visible and the viewing direction (pitch down, yaw) for a view. */
  spec(view, round) {
    const V = this.THREE.Vector3;
    const t = TARGETS[Math.min(round, TARGETS.length - 1)];
    const L = landingPoint(t, this._l).clone();
    const dir = new V(-Math.sin(t.yaw), 0, -Math.cos(t.yaw));
    const side = new V(-dir.z, 0, dir.x);
    const pts = [];
    const add = (x, y, z) => pts.push(new V(x, y, z));
    let pitch, yaw;
    if (view === 'cross') {
      // the machine, the whole bridge, the bank and where the train parks
      for (const p of PANEL) add(p[0], p[1], p[2]);
      for (const s of [-1, 1]) add(L.x + side.x * s, L.y + 1.4, L.z + side.z * s);
      const park = L.clone().addScaledVector(dir, 3.4);
      add(park.x, park.y + 0.9, park.z);
      pitch = 0.5; yaw = t.yaw * 0.15;
    } else if (view === 'finale') {
      // every bank, its flag and balloons, plus the machine
      add(0, 0, 1.4); add(-1.5, 0, 1.0); add(1.5, 0, 1.0);
      for (const tt of TARGETS) {
        const l = landingPoint(tt, new V());
        const d = new V(-Math.sin(tt.yaw), 0, -Math.cos(tt.yaw));
        add(l.x + d.x * 2.6, l.y + 2.6, l.z + d.z * 2.6);
        add(l.x, l.y, l.z);
      }
      pitch = 0.5; yaw = 0;
    } else { // work: the control panel near the bottom, the bridge going straight out, the bank
      for (const p of PANEL) add(p[0], p[1], p[2]);
      add(0, 1.4, -Math.min(t.distance, 7.5));             // tip of the extended bridge (launch)
      add(0, 2.4, -Math.min(t.distance, 7.0));             // ... and lifted
      for (const s of [-1, 1]) add(L.x + side.x * 0.8 * s, L.y + 0.5, L.z + side.z * 0.8 * s);
      pitch = 0.42; yaw = t.yaw * 0.12;
    }
    return { pts, pitch, yaw, frame: FRAME[view] || FRAME.work };
  }

  /** Pose for a view name; returns {pos, look} (new vectors). */
  pose(view, round) {
    const V = this.THREE.Vector3;
    const { pts, pitch, yaw, frame } = this.spec(view, round);
    const cam = this._cam;
    cam.aspect = this.aspect; cam.updateProjectionMatrix();
    // forward direction from pitch / yaw (yaw > 0 turns left, like the hero)
    const fwd = new V(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const center = new V();
    for (const p of pts) center.add(p);
    center.multiplyScalar(1 / pts.length);
    const right = new V().crossVectors(fwd, new V(0, 1, 0)).normalize();
    const up = new V().crossVectors(right, fwd).normalize();
    const look = center.clone();
    const fx = (frame[0] + frame[1]) / 2;
    const hx = (frame[1] - frame[0]) / 2, hy = (frame[3] - frame[2]) / 2;
    const p = this._p;
    const place = (D) => {
      cam.position.copy(look).addScaledVector(fwd, -D);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const q of pts) {
        p.copy(q).project(cam);
        if (p.z >= 1 || p.z <= -1) behind = true;
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      return { x0, x1, y0, y1, behind };
    };
    let D = 12;
    for (let it = 0; it < 4; it++) {
      // 1) distance so that the projected box fits the frame (binary search)
      let lo = 2, hi = 80;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2, b = place(mid);
        const fits = !b.behind && b.x1 - b.x0 <= 2 * hx && b.y1 - b.y0 <= 2 * hy;
        if (fits) hi = mid; else lo = mid;
      }
      D = hi;
      // 2) slide the look point: centred left-right; the bottom of the box on the bottom of the
      //    frame (spare height goes to the sky, so the controls stay low and large in portrait)
      const b = place(D);
      const th = Math.tan((FOV * Math.PI) / 360) * D;
      look.addScaledVector(right, (((b.x0 + b.x1) / 2 - fx) * th * this.aspect))
          .addScaledVector(up, ((b.y0 - frame[2]) * th));
    }
    const pos = look.clone().addScaledVector(fwd, -D);
    return { pos, look };
  }

  setView(view, round, immediate) {
    if (view === this.view && round === this.round && !immediate) return;
    this.view = view; this.round = round;
    const { pos, look } = this.pose(view, round);
    if (immediate) {
      this.curPos.copy(pos); this.curLook.copy(look); this.toPos.copy(pos); this.toLook.copy(look); this.u = 1;
    } else {
      this.fromPos.copy(this.curPos); this.fromLook.copy(this.curLook);
      this.toPos.copy(pos); this.toLook.copy(look); this.u = 0;
    }
    this._apply();
  }

  resize(aspect) {
    this.aspect = aspect;
    if (this.view) { const v = this.view; this.view = null; this.setView(v, this.round, this.u >= 1); }
  }

  update(dt) {
    if (this.u < 1) {
      this.u = Math.min(1, this.u + dt / MOVE_TIME);
      const k = smooth(this.u);
      this.curPos.lerpVectors(this.fromPos, this.toPos, k);
      this.curLook.lerpVectors(this.fromLook, this.toLook, k);
      this._apply();
    }
  }

  get moving() { return this.u < 1; }

  _apply() {
    this.camera.position.copy(this.curPos);
    this.camera.lookAt(this.curLook);
    this.camera.updateMatrixWorld();
  }
}
