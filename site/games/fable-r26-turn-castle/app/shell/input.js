// One-finger input -> HeroInput (docs/HERO-SPEC.md §3). Pointer events are queued and
// applied once per frame in beginFrame(), so the hero sees a consistent snapshot.
(function (C) {
  'use strict';
  const TAP_MS = 350, TAP_PX = 12;

  C.createInput = function (THREE, el, opts) {
    // opts: { getCamera(), getHitTargets(), fallbackDepth(), onTouch(px, py, partId) }
    const input = {
      time: 0, idle: 0,
      pointer: { active: false, ndcX: 0, ndcY: 0, px: 0, py: 0 },
      ray: new THREE.Ray(),
      down: null, grabbed: null, hitPoint: null,
      drag: { dx: 0, dy: 0, dxWorld: 0, dyWorld: 0, totalDx: 0, totalDy: 0 },
      released: null, tapped: null,
    };
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
    const hitPoint = new THREE.Vector3();
    let primaryId = null;
    let queue = []; // {type, x, y, t}
    let moveDx = 0, moveDy = 0;
    let lastX = 0, lastY = 0, downX = 0, downY = 0, downT = 0;
    let grabDepth = 10;
    let lastActivity = 0;
    let enabled = true;

    function local(e) {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    function onDown(e) {
      if (!enabled) return;
      if (primaryId !== null) return; // ignore extra fingers / palms
      primaryId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const [x, y] = local(e);
      lastX = x; lastY = y;
      queue.push({ type: 'down', x, y, t: performance.now() });
      e.preventDefault();
    }
    function onMove(e) {
      if (e.pointerId !== primaryId) return;
      const [x, y] = local(e);
      moveDx += x - lastX; moveDy += y - lastY; lastX = x; lastY = y;
      e.preventDefault();
    }
    function onUp(e) {
      if (e.pointerId !== primaryId) return;
      const [x, y] = local(e);
      moveDx += x - lastX; moveDy += y - lastY; lastX = x; lastY = y;
      queue.push({ type: e.type === 'pointercancel' ? 'cancel' : 'up', x, y, t: performance.now() });
      primaryId = null;
      try { el.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    function setRay(x, y) {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      input.pointer.px = x; input.pointer.py = y;
      input.pointer.ndcX = (x / w) * 2 - 1; input.pointer.ndcY = -(y / h) * 2 + 1;
      ndc.set(input.pointer.ndcX, input.pointer.ndcY);
      raycaster.setFromCamera(ndc, opts.getCamera());
      input.ray.copy(raycaster.ray);
    }

    function pick() {
      const targets = opts.getHitTargets();
      if (!targets || !targets.length) return null;
      const hits = raycaster.intersectObjects(targets, false);
      for (const h of hits) {
        const ud = h.object.userData;
        if (ud && ud.partId && ud.enabled !== false) { hitPoint.copy(h.point); return ud.partId; }
      }
      return null;
    }

    function worldPerPx() {
      const cam = opts.getCamera();
      const h = Math.max(1, el.clientHeight);
      return (2 * grabDepth * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / h;
    }

    function beginFrame(time) {
      input.time = time;
      const d = input.drag;
      d.dx = 0; d.dy = 0; d.dxWorld = 0; d.dyWorld = 0;
      input.down = null; input.released = null; input.tapped = null;
      const now = performance.now();
      // apply movement first (it happened before any queued up event in practice)
      if (input.pointer.active && (moveDx || moveDy)) {
        d.dx = moveDx; d.dy = moveDy; d.totalDx += moveDx; d.totalDy += moveDy;
        const k = worldPerPx(); d.dxWorld = moveDx * k; d.dyWorld = -moveDy * k;
      }
      moveDx = 0; moveDy = 0;
      for (const ev of queue) {
        if (ev.type === 'down') {
          input.pointer.active = true;
          setRay(ev.x, ev.y);
          downX = ev.x; downY = ev.y; downT = ev.t;
          d.totalDx = 0; d.totalDy = 0;
          const id = pick();
          input.grabbed = id; input.down = id;
          input.hitPoint = id ? hitPoint : null;
          const cam = opts.getCamera();
          cam.getWorldDirection(fwd);
          grabDepth = id ? Math.max(0.5, tmp.copy(hitPoint).sub(cam.position).dot(fwd)) : opts.fallbackDepth();
          lastActivity = now;
          opts.onTouch && opts.onTouch(ev.x, ev.y, id);
        } else {
          setRay(ev.x, ev.y);
          const id = input.grabbed;
          const moved = Math.hypot(ev.x - downX, ev.y - downY);
          input.released = id;
          if (ev.type === 'up' && id && ev.t - downT <= TAP_MS && moved <= TAP_PX) input.tapped = id;
          input.pointer.active = false;
          input.grabbed = null;
          lastActivity = now;
        }
      }
      queue = [];
      if (input.pointer.active) { setRay(lastX, lastY); lastActivity = now; }
      input.idle = input.pointer.active ? 0 : (now - lastActivity) / 1000;
      return input;
    }

    function reset() { // e.g. after the replay button
      queue = []; primaryId = null; input.pointer.active = false; input.grabbed = null; input.hitPoint = null;
      lastActivity = performance.now();
    }

    return {
      input, beginFrame, reset,
      setEnabled(v) { enabled = v; if (!v) reset(); },
      markActivity() { lastActivity = performance.now(); },
      dispose() {
        el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
      },
    };
  };
})(window.Castle = window.Castle || {});
