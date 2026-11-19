// 2D overlay without any text: touch ripple, ghost-finger hint, replay button, lost-context veil.
(function (C) {
  'use strict';
  const HAND_SVG = '<svg viewBox="0 0 100 120" width="100%" height="100%" aria-hidden="true">' +
    '<path d="M38 8c6 0 10 5 10 11v34l4-2c0-6 4-10 9-10s9 4 9 10v2c2-3 5-5 8-5 5 0 9 4 9 10v4c2-2 4-3 7-3 5 0 7 4 7 9v20c0 17-12 30-30 30H55c-12 0-20-6-27-15L10 79c-3-4-2-10 2-13 4-3 9-2 12 1l4 5V19c0-6 4-11 10-11z" ' +
    'fill="#fff" stroke="#5a3d6e" stroke-width="5" stroke-linejoin="round"/></svg>';
  const REPLAY_SVG = '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="46" fill="#ff7eb6" stroke="#fff" stroke-width="6"/>' +
    '<path d="M50 24a26 26 0 1 1-24 16" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>' +
    '<path d="M14 30l16 18 10-22z" fill="#fff"/></svg>';

  C.createOverlay = function (root, handlers) {
    const layer = document.createElement('div');
    layer.className = 'ov-layer';
    root.appendChild(layer);

    const hand = document.createElement('div'); hand.className = 'ov-hand'; hand.innerHTML = HAND_SVG; layer.appendChild(hand);
    const replay = document.createElement('button'); replay.className = 'ov-replay'; replay.type = 'button';
    replay.setAttribute('aria-label', 'replay'); replay.innerHTML = REPLAY_SVG; layer.appendChild(replay);
    const veil = document.createElement('div'); veil.className = 'ov-veil'; layer.appendChild(veil);

    replay.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    replay.addEventListener('pointerup', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (replay.classList.contains('show')) handlers.onReplay();
    });

    function ripple(x, y, strong) {
      const r = document.createElement('div');
      r.className = 'ov-ripple' + (strong ? ' strong' : '');
      r.style.left = x + 'px'; r.style.top = y + 'px';
      layer.appendChild(r);
      setTimeout(() => r.remove(), 650);
    }

    // hint: x,y = start (CSS px), dx,dy = swipe vector (px) or 0,0 for tap
    let handOn = false, phase = 0, hx = 0, hy = 0, hdx = 0, hdy = 0;
    function showHint(x, y, dx, dy) { hx = x; hy = y; hdx = dx; hdy = dy; if (!handOn) { handOn = true; phase = 0; hand.classList.add('show'); } }
    function hideHint() { if (handOn) { handOn = false; hand.classList.remove('show'); } }
    function update(dt) {
      if (!handOn) return;
      phase = (phase + dt / 1.6) % 1; // 1.6 s loop: press, swipe, lift
      const p = phase < 0.15 ? 0 : phase < 0.75 ? (phase - 0.15) / 0.6 : 1;
      const e = p * p * (3 - 2 * p);
      const press = phase < 0.15 ? 1 - phase / 0.15 * 0.15 : phase < 0.8 ? 0.85 : 0.85 + (phase - 0.8) / 0.2 * 0.15;
      const tap = (hdx === 0 && hdy === 0);
      const x = hx + (tap ? 0 : hdx * e), y = hy + (tap ? 0 : hdy * e);
      const s = tap ? 0.85 + 0.15 * Math.abs(Math.cos(phase * Math.PI * 2)) : press;
      hand.style.transform = `translate(${x - 14}px, ${y - 6}px) scale(${s.toFixed(3)})`;
      hand.style.opacity = (phase > 0.9 ? (1 - phase) / 0.1 : phase < 0.05 ? phase / 0.05 : 1).toFixed(2);
    }
    function setReplay(v) { replay.classList.toggle('show', !!v); }
    function setVeil(v) { veil.classList.toggle('show', !!v); }
    return { ripple, showHint, hideHint, update, setReplay, setVeil, get hintVisible() { return handOn; } };
  };
})(window.Castle = window.Castle || {});
