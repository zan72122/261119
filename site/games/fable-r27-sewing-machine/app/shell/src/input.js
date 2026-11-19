// 入力：指1本（最初のポインタだけ）。タップ／ドラッグ。ヒット判定は押した瞬間に hero.hitTargets へレイキャスト。
// 外れても、ヒントの操作部の画面位置から近ければ（子どもの指はずれる）それをつかんだことにする。

const TAP_MAX_TIME = 0.35;   // 秒
const TAP_MAX_MOVE = 14;     // CSS px
const NEAR_PX = 90;          // 近接救済の半径（CSS px）

export function createInput(THREE, canvas, getCamera, now) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmpV = new THREE.Vector3();
  const st = {
    pointerId: null, startX: 0, startY: 0, startT: 0, moved: 0,
    lastX: 0, lastY: 0, accDx: 0, accDy: 0,
    pressed: false, released: false, tapped: false, down: false,
    part: null, grabPoint: null, lastTouch: -1e9, pendingDown: null,
  };
  const listeners = { down: [] };

  const input = {
    time: 0, down: false, pressed: false, released: false, tapped: false,
    part: null, grabPoint: null, x: 0, y: 0, dx: 0, dy: 0,
    ray: raycaster.ray, camera: null, viewport: { width: 1, height: 1 }, idle: 0,
    project(v, out) {
      const cam = getCamera();
      tmpV.copy(v).project(cam);
      const o = out || {};
      o.x = (tmpV.x * 0.5 + 0.5) * input.viewport.width;
      o.y = (-tmpV.y * 0.5 + 0.5) * input.viewport.height;
      o.behind = tmpV.z > 1;
      return o;
    },
  };

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onDown(e) {
    if (st.pointerId !== null) return; // 2本目以降の指は無視
    st.pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const [x, y] = local(e);
    st.startX = st.lastX = x; st.startY = st.lastY = y; st.startT = now(); st.moved = 0;
    st.down = true; st.pressed = true; st.pendingDown = { x, y };
    st.lastTouch = now();
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId !== st.pointerId) return;
    const [x, y] = local(e);
    st.accDx += x - st.lastX; st.accDy += y - st.lastY;
    st.moved = Math.max(st.moved, Math.hypot(x - st.startX, y - st.startY));
    st.lastX = x; st.lastY = y;
    st.lastTouch = now();
    e.preventDefault();
  }
  function onUp(e) {
    if (e.pointerId !== st.pointerId) return;
    const [x, y] = local(e);
    st.accDx += x - st.lastX; st.accDy += y - st.lastY;
    st.lastX = x; st.lastY = y;
    st.released = true; st.down = false;
    st.tapped = e.type === 'pointerup' && (now() - st.startT) < TAP_MAX_TIME && st.moved < TAP_MAX_MOVE;
    st.pointerId = null;
    st.lastTouch = now();
    e.preventDefault();
  }
  canvas.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: false });
  window.addEventListener('pointercancel', onUp, { passive: false });
  // iOS Safari：スクロール・ピンチ・ダブルタップ拡大・長押しメニューを止める
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener('touchstart', stop, { passive: false });
  document.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', stop, { passive: false });

  function setRay(x, y) {
    ndc.set((x / input.viewport.width) * 2 - 1, -(y / input.viewport.height) * 2 + 1);
    raycaster.setFromCamera(ndc, getCamera());
  }

  /**
   * 1フレーム分の input を作る。hero と hint を渡す（ヒット判定のため）。
   * 戻り値は使い回しの input オブジェクト。
   */
  function frame(hero, hint, viewport) {
    input.viewport.width = viewport.width; input.viewport.height = viewport.height;
    input.camera = getCamera();
    input.time = now();
    if (st.pendingDown) {
      const { x, y } = st.pendingDown;
      st.pendingDown = null;
      setRay(x, y);
      let part = null, point = null;
      const targets = hero && hero.hitTargets ? hero.hitTargets : [];
      if (targets.length) {
        const hits = raycaster.intersectObjects(targets, true);
        for (const h of hits) {
          let o = h.object;
          while (o && !(o.userData && typeof o.userData.part === 'string')) o = o.parent;
          if (o) { part = o.userData.part; point = h.point.clone(); break; }
        }
      }
      if (!part && hint && hint.position) {
        const s = input.project(hint.position);
        if (!s.behind && Math.hypot(s.x - x, s.y - y) < NEAR_PX + hintRadiusPx(hint)) { part = hint.part; point = hint.position.clone(); }
      }
      st.part = part; st.grabPoint = point;
      listeners.down.forEach((f) => f(x, y, part));
    }
    input.down = st.down;
    input.pressed = st.pressed; input.released = st.released; input.tapped = st.tapped;
    input.x = st.lastX; input.y = st.lastY;
    input.dx = st.accDx; input.dy = st.accDy;
    input.part = st.part; input.grabPoint = st.grabPoint;
    input.idle = st.down ? 0 : Math.max(0, now() - st.lastTouch);
    setRay(st.lastX, st.lastY);
    return input;
  }
  /** hero.update の後に呼ぶ：1フレームだけ立つフラグを下ろす。 */
  function endFrame() {
    st.pressed = false; st.tapped = false; st.accDx = 0; st.accDy = 0;
    if (st.released) { st.released = false; st.part = null; st.grabPoint = null; }
  }
  function hintRadiusPx(hint) {
    const cam = getCamera();
    const a = input.project(hint.position, {});
    tmpV.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(hint.radius || 0.03).add(hint.position);
    const b = input.project(tmpV, {});
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
  return {
    input, frame, endFrame, hintRadiusPx,
    onDown(f) { listeners.down.push(f); },
    /** 触った扱いにする（nudge 等で idle を進めたいときに使わない。idle は実際の指だけで決まる） */
    get lastTouch() { return st.lastTouch; },
  };
}
