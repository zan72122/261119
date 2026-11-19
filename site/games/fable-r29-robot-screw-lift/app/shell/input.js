// 入力：指1本（最初のポインタだけ）。操作部をつかむ判定、ドラッグ量、タップ。HERO-SPEC §3.2 の input を毎フレーム作る。
export function createInput(THREE, canvas, camera, getTargets) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmpV = new THREE.Vector3();
  const tmpPlane = new THREE.Plane();
  const camDir = new THREE.Vector3();
  const hits = [];

  const state = {
    id: null, down: false, x: 0, y: 0, lastX: 0, lastY: 0, startX: 0, startY: 0, startT: 0,
    targetId: null, plane: new THREE.Plane(), hasPlane: false,
    pendingStart: false, pendingEnd: false, lastActivity: 0,
  };
  const out = {
    time: 0, idle: 0,
    pointer: { down: false, x: 0, y: 0, ndc: new THREE.Vector2(), ray: raycaster.ray },
    grab: null,
    taps: [],
  };
  const grabObj = {
    targetId: null, phase: 'start', point: null, startPoint: null,
    deltaPx: { x: 0, y: 0 }, totalPx: { x: 0, y: 0 }, duration: 0,
  };
  const pointV = new THREE.Vector3(), startV = new THREE.Vector3();
  let startPointValid = false;
  const tapQueue = [];
  let now = 0;
  const listeners = { down: [], miss: [] };

  function setNdc(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function projectAnchor(t, outXY) {
    const r = canvas.getBoundingClientRect();
    tmpV.copy(t.anchor || t.object.getWorldPosition(tmpV)).project(camera);
    outXY.x = r.left + (tmpV.x * 0.5 + 0.5) * r.width;
    outXY.y = r.top + (-tmpV.y * 0.5 + 0.5) * r.height;
    outXY.behind = tmpV.z > 1;
    return outXY;
  }

  function pickTarget(x, y) {
    const targets = getTargets() || [];
    setNdc(x, y);
    let best = null, bestD = Infinity;
    for (const t of targets) {
      if (!t.enabled || !t.object) continue;
      hits.length = 0;
      raycaster.intersectObject(t.object, true, hits);
      if (hits.length && hits[0].distance < bestD) { best = t; bestD = hits[0].distance; }
    }
    if (best) return best;
    // 外れても、画面の短辺の 20% 以内なら一番近い有効な操作部をつかむ（5歳児の指の補助）
    const r = canvas.getBoundingClientRect();
    const lim = Math.min(r.width, r.height) * 0.2;
    const xy = {};
    bestD = Infinity;
    for (const t of targets) {
      if (!t.enabled || !t.object) continue;
      projectAnchor(t, xy);
      if (xy.behind) continue;
      const d = Math.hypot(xy.x - x, xy.y - y);
      if (d < lim && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  function computePoint(target) {
    if (!state.hasPlane) return false;
    return raycaster.ray.intersectPlane(state.plane, target) !== null;
  }

  function onDown(e) {
    if (state.id !== null) return; // 2本目以降の指は無視
    e.preventDefault();
    state.id = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    state.down = true;
    state.x = state.lastX = state.startX = e.clientX;
    state.y = state.lastY = state.startY = e.clientY;
    state.startT = now;
    state.lastActivity = now;
    const t = pickTarget(e.clientX, e.clientY);
    state.targetId = t ? t.id : null;
    if (t) {
      if (t.plane && t.plane.isPlane) { state.plane.copy(t.plane); state.hasPlane = true; }
      else {
        camera.getWorldDirection(camDir);
        const a = t.anchor || t.object.getWorldPosition(tmpV);
        state.plane.setFromNormalAndCoplanarPoint(camDir.negate(), a); state.hasPlane = true;
      }
      setNdc(e.clientX, e.clientY);
      startPointValid = computePoint(startV);
      state.pendingStart = true;
      state.pendingEnd = false;
    } else {
      state.hasPlane = false;
    }
    for (const f of listeners.down) f(e, t);
  }

  function onMove(e) {
    if (e.pointerId !== state.id) return;
    e.preventDefault();
    state.x = e.clientX; state.y = e.clientY;
    state.lastActivity = now;
  }

  function onUp(e) {
    if (e.pointerId !== state.id) return;
    e.preventDefault();
    state.x = e.clientX; state.y = e.clientY;
    const moved = Math.hypot(state.x - state.startX, state.y - state.startY);
    const dur = now - state.startT;
    if (e.type !== 'pointercancel' && moved < 16 && dur < 0.45) {
      setNdc(state.x, state.y);
      const p = new THREE.Vector3();
      const ok = state.targetId ? computePoint(p) : false;
      tapQueue.push({ targetId: state.targetId, point: ok ? p : null });
      if (!state.targetId) for (const f of listeners.miss) f(e);
    }
    if (state.targetId) state.pendingEnd = true;
    state.down = false;
    state.id = null;
    state.lastActivity = now;
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp, { passive: false });
  canvas.addEventListener('pointercancel', onUp, { passive: false });
  // Safari のピンチ・長押しメニュー・ダブルタップ拡大を止める
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  return {
    on(type, f) { listeners[type].push(f); },
    projectAnchor,
    get grabbing() { return state.down && state.targetId !== null; },
    // 毎フレーム1回。hero に渡す input を返す
    frame(dt) {
      now += dt;
      out.time = now;
      out.idle = state.down ? 0 : now - state.lastActivity;
      setNdc(state.x, state.y);
      out.pointer.down = state.down;
      out.pointer.x = state.x; out.pointer.y = state.y;
      out.pointer.ndc.copy(ndc);
      out.taps.length = 0;
      while (tapQueue.length) out.taps.push(tapQueue.shift());

      if (state.targetId && (state.down || state.pendingStart || state.pendingEnd)) {
        out.grab = grabObj;
        grabObj.targetId = state.targetId;
        if (state.pendingStart) {
          grabObj.phase = 'start';
          state.pendingStart = false;
          grabObj.deltaPx.x = grabObj.deltaPx.y = 0;
          grabObj.totalPx.x = grabObj.totalPx.y = 0;
          grabObj.duration = 0;
          state.lastX = state.startX; state.lastY = state.startY;
        } else if (!state.down && state.pendingEnd) {
          grabObj.phase = 'end';
          state.pendingEnd = false;
        } else {
          grabObj.phase = 'hold';
        }
        grabObj.deltaPx.x = state.x - state.lastX; grabObj.deltaPx.y = state.y - state.lastY;
        grabObj.totalPx.x = state.x - state.startX; grabObj.totalPx.y = state.y - state.startY;
        grabObj.duration = now - state.startT;
        state.lastX = state.x; state.lastY = state.y;
        grabObj.point = computePoint(pointV) ? pointV : null;
        grabObj.startPoint = startPointValid ? startV : null;
        if (grabObj.phase === 'end') state.targetId = null;
      } else {
        out.grab = null;
      }
      return out;
    },
  };
}
