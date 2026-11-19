// カメラの定位置。見せたい箱（target ± fitW/fitH）を縦横比に合わせて収める。移動はゆっくり ease-in-out。
// crank / ratchet / summit は本物の hero に合わせた値（docs/hero-notes.md §8.2。hero.views が無くてもロボットと操作部が入る）
export const DEFAULT_VIEWS = {
  overview: { target: [0, 1.55, 0], dir: [0, 0.18, 1], fitW: 2.6, fitH: 1.9 },
  crank: { target: [-0.25, 1.45, 0.3], dir: [0.1, 0.16, 1], fitW: 2.05, fitH: 1.55 },
  ratchet: { target: [-0.3, 0.98, 0.6], dir: [0.07, 0.2, 1], fitW: 1.72, fitH: 1.02 },
  summit: { target: [-0.32, 2.0, 0.2], dir: [0, 0.3, 1], fitW: 1.8, fitH: 1.6 },
};

export function createCameraRig(THREE, camera, heroViews) {
  const views = Object.assign({}, DEFAULT_VIEWS, heroViews || {});
  const fromPos = new THREE.Vector3(), fromTgt = new THREE.Vector3();
  const toPos = new THREE.Vector3(), toTgt = new THREE.Vector3();
  const curTgt = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let name = 'overview', t = 1;
  const DUR = 1.6;

  function compute(viewName, outPos, outTgt) {
    const v = views[viewName] || views.overview;
    outTgt.fromArray(v.target);
    dir.fromArray(v.dir);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const aspect = Math.max(camera.aspect, 0.1);
    const dist = Math.min(Math.max(v.fitH / tanV, v.fitW / (tanV * aspect)) + 0.6, 12);
    outPos.copy(outTgt).addScaledVector(dir, dist);
  }

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  return {
    get view() { return name; },
    get moving() { return t < 1; },
    goTo(viewName, instant = false) {
      if (!views[viewName]) viewName = 'overview';
      if (viewName === name && !instant) return;
      name = viewName;
      fromPos.copy(camera.position);
      fromTgt.copy(curTgt);
      compute(name, toPos, toTgt);
      t = instant ? 1 : 0;
      if (instant) { camera.position.copy(toPos); curTgt.copy(toTgt); camera.lookAt(curTgt); }
    },
    resize() {
      // 縦横比が変わったら今の定位置を計算し直して即座に合わせる
      compute(name, toPos, toTgt);
      if (t >= 1) { camera.position.copy(toPos); curTgt.copy(toTgt); camera.lookAt(curTgt); }
    },
    update(dt) {
      if (t >= 1) return;
      t = Math.min(1, t + dt / DUR);
      const k = ease(t);
      camera.position.lerpVectors(fromPos, toPos, k);
      curTgt.lerpVectors(fromTgt, toTgt, k);
      camera.lookAt(curTgt);
    },
  };
}
