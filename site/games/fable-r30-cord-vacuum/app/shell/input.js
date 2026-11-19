// 指1本の入力。最初の指だけを見て、つかむ操作部の判定（やさしい当たり判定）、タップ、ドラッグ量を作る。
// hero に渡す input の形は docs/HERO-SPEC.md §3。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});
  const THREE = window.THREE;

  const TAP_MAX_MS = 350;
  const TAP_MAX_PX = 16;
  const SNAP_PX = 72; // 外れても、この距離以内の一番近い操作部をつかむ

  function createInput(opts) {
    const getCamera = opts.getCamera;
    const getTargets = opts.getTargets; // () => Object3D[]
    const onFirstTouch = opts.onFirstTouch;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const tmpV = new THREE.Vector3();
    const tmpSphere = new THREE.Sphere();
    const startTime = performance.now();

    let canvas = null;
    let pointerId = null;
    let px = 0, py = 0, hasPos = false;
    let downX = 0, downY = 0, downT = 0;
    let lastFrameX = 0, lastFrameY = 0;
    let lastActivity = performance.now();
    let isDown = false;
    let grabbed = null;
    // フレームの間に起きた出来事（次のフレームで1回だけ伝える）
    let evGrab = false, evRelease = false, evTap = null, releaseGrabbed = null;

    const state = {
      time: 0,
      pointer: { x: 0, y: 0, ndcX: 0, ndcY: 0, isDown: false },
      ray: new THREE.Ray(),
      floorPoint: null,
      grabbed: null,
      justGrabbed: false,
      justReleased: false,
      tap: null,
      drag: { dx: 0, dy: 0, ddx: 0, ddy: 0 },
      idle: 0,
      showHint: false,
      camera: null,
    };
    const floorPointV = new THREE.Vector3();

    function rect() { return canvas.getBoundingClientRect(); }

    function toNdc(x, y, r) {
      ndc.set((x / Math.max(1, r.width)) * 2 - 1, -(y / Math.max(1, r.height)) * 2 + 1);
      return ndc;
    }

    // 操作部を選ぶ：1) レイが当たった有効な当たり物体 2) 画面上 SNAP_PX 以内で一番近い有効な物体
    function pick(x, y) {
      const targets = (getTargets() || []).filter((o) => o && o.userData && o.userData.enabled !== false && o.userData.control);
      if (!targets.length) return null;
      const r = rect();
      const cam = getCamera();
      raycaster.setFromCamera(toNdc(x, y, r), cam);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length) return hits[0].object.userData.control;
      let best = null, bestD = SNAP_PX;
      for (const o of targets) {
        o.updateWorldMatrix(true, false);
        if (o.geometry) {
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          tmpSphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
          tmpV.copy(tmpSphere.center);
        } else {
          o.getWorldPosition(tmpV);
        }
        tmpV.project(cam);
        if (tmpV.z > 1) continue;
        const sx = (tmpV.x * 0.5 + 0.5) * r.width;
        const sy = (-tmpV.y * 0.5 + 0.5) * r.height;
        const d = Math.hypot(sx - x, sy - y);
        if (d < bestD) { bestD = d; best = o.userData.control; }
      }
      return best;
    }

    function local(e) {
      const r = rect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    function onDown(e) {
      if (pointerId !== null) return; // 2本目の指は無視
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      pointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 古い Safari */ }
      [px, py] = local(e);
      hasPos = true;
      downX = lastFrameX = px;
      downY = lastFrameY = py;
      downT = performance.now();
      lastActivity = downT;
      isDown = true;
      grabbed = pick(px, py);
      evGrab = true;
      onFirstTouch && onFirstTouch();
    }

    function onMove(e) {
      if (pointerId === null) {
        // マウスのホバーは位置だけ（idle は進めたまま）
        if (e.pointerType === 'mouse') { [px, py] = local(e); hasPos = true; }
        return;
      }
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      [px, py] = local(e);
      lastActivity = performance.now();
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      [px, py] = local(e);
      const now = performance.now();
      if (now - downT <= TAP_MAX_MS && Math.hypot(px - downX, py - downY) < TAP_MAX_PX && grabbed) evTap = grabbed;
      evRelease = true;
      releaseGrabbed = grabbed;
      isDown = false;
      pointerId = null;
      lastActivity = now;
      onFirstTouch && onFirstTouch(); // iOS は touchend の中でも unlock を試す
    }

    function block(e) { e.preventDefault(); }

    function attach(c) {
      detach();
      canvas = c;
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', onDown, { passive: false });
      canvas.addEventListener('pointermove', onMove, { passive: false });
      canvas.addEventListener('pointerup', onUp, { passive: false });
      canvas.addEventListener('pointercancel', onUp, { passive: false });
      canvas.addEventListener('lostpointercapture', onUp, { passive: false });
      canvas.addEventListener('contextmenu', block);
      canvas.addEventListener('touchstart', block, { passive: false });
      canvas.addEventListener('touchmove', block, { passive: false });
      canvas.addEventListener('dblclick', block);
    }

    function detach() {
      if (!canvas) return;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('contextmenu', block);
      canvas.removeEventListener('touchstart', block);
      canvas.removeEventListener('touchmove', block);
      canvas.removeEventListener('dblclick', block);
      canvas = null;
      pointerId = null;
      isDown = false;
    }

    // 毎フレーム、hero.update の前に呼ぶ。
    function frame(camera, showHint) {
      const now = performance.now();
      const s = state;
      s.time = (now - startTime) / 1000;
      s.camera = camera;
      s.showHint = !!showHint;
      s.justGrabbed = evGrab;
      s.justReleased = evRelease;
      s.tap = evTap;
      s.grabbed = isDown ? grabbed : evRelease ? releaseGrabbed : null;
      s.pointer.isDown = isDown;
      if (canvas && hasPos) {
        const r = rect();
        s.pointer.x = px;
        s.pointer.y = py;
        toNdc(px, py, r);
        s.pointer.ndcX = ndc.x;
        s.pointer.ndcY = ndc.y;
        raycaster.setFromCamera(ndc, camera);
        s.ray.copy(raycaster.ray);
        s.floorPoint = s.ray.intersectPlane(floorPlane, floorPointV) ? floorPointV : null;
      } else {
        s.floorPoint = null;
      }
      const active = isDown || evRelease;
      s.drag.dx = active ? px - downX : 0;
      s.drag.dy = active ? py - downY : 0;
      s.drag.ddx = active ? px - lastFrameX : 0;
      s.drag.ddy = active ? py - lastFrameY : 0;
      lastFrameX = px;
      lastFrameY = py;
      s.idle = isDown ? 0 : (now - lastActivity) / 1000;
      evGrab = false;
      evRelease = false;
      evTap = null;
      if (!isDown) grabbed = null;
      return s;
    }

    return {
      attach, detach, frame, pick, state,
      get isDown() { return isDown; },
      get lastActivity() { return lastActivity; },
    };
  }

  S.createInput = createInput;
})();
