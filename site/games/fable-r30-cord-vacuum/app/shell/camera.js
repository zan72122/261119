// カメラの定位置と、ゆっくりした移動（揺れ・急な回転・ズーム演出なし）。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});
  const THREE = window.THREE;

  const MOVE_SECONDS = 1.6;
  const REF_ASPECT = 4 / 3;
  const DEG = Math.PI / 180;

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function createCameraRig(camera, defaults) {
    const from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 45 };
    const to = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 45 };
    const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 45 };
    let t = 1;
    let heroViews = null;
    let aspect = REF_ASPECT;

    function resolve(stage) {
      const d = defaults[stage] || defaults.pull;
      const h = heroViews && heroViews[stage];
      if (!h) return d;
      // hero の上書きは安全な範囲に切る
      const v = {
        position: (h.position || d.position).slice(0, 3),
        target: (h.target || d.target).slice(0, 3),
        fov: Math.min(60, Math.max(35, +h.fov || d.fov)),
      };
      const p = new THREE.Vector3().fromArray(v.position);
      const q = new THREE.Vector3().fromArray(v.target);
      if (!(p.distanceTo(q) >= 0.6) || !isFinite(p.x + p.y + p.z + q.x + q.y + q.z)) return d;
      return v;
    }

    function setHeroViews(v) { heroViews = v && typeof v === 'object' ? v : null; }

    function go(stage, instant) {
      const v = resolve(stage);
      from.pos.copy(cur.pos); from.tgt.copy(cur.tgt); from.fov = cur.fov;
      to.pos.fromArray(v.position); to.tgt.fromArray(v.target); to.fov = v.fov;
      t = instant ? 1 : 0;
      if (instant) { cur.pos.copy(to.pos); cur.tgt.copy(to.tgt); cur.fov = to.fov; apply(); }
    }

    // 縦長の画面でも横画角を保つ
    function effectiveFov(fov) {
      if (aspect >= REF_ASPECT) return fov;
      const h = 2 * Math.atan(Math.tan((fov * DEG) / 2) * REF_ASPECT);
      return Math.min(78, (2 * Math.atan(Math.tan(h / 2) / Math.max(0.3, aspect))) / DEG);
    }

    function apply() {
      camera.position.copy(cur.pos);
      camera.lookAt(cur.tgt);
      const f = effectiveFov(cur.fov);
      if (Math.abs(camera.fov - f) > 1e-4) { camera.fov = f; camera.updateProjectionMatrix(); }
    }

    function setAspect(a) {
      aspect = a;
      camera.aspect = a;
      camera.fov = effectiveFov(cur.fov);
      camera.updateProjectionMatrix();
    }

    function update(dt) {
      if (t < 1) {
        t = Math.min(1, t + dt / MOVE_SECONDS);
        const k = ease(t);
        cur.pos.lerpVectors(from.pos, to.pos, k);
        cur.tgt.lerpVectors(from.tgt, to.tgt, k);
        cur.fov = from.fov + (to.fov - from.fov) * k;
      }
      apply();
    }

    return { go, update, setAspect, setHeroViews, get moving() { return t < 1; } };
  }

  S.createCameraRig = createCameraRig;
})();
