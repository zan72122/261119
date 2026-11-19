// 次に触る所を教える「半透明の指の玉」（文字なし）。tap は押す動き、drag は position→to へ動く。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});

  function createHint(root) {
    root.innerHTML = '<div class="hint-ring"></div><div class="hint-ball"></div>';
    const ring = root.querySelector('.hint-ring');
    const ball = root.querySelector('.hint-ball');
    let opacity = 0;
    let t = 0;
    let lastKey = '';

    // h: null か { gesture, x, y, toX, toY }（CSS px）
    function update(dt, h, visible) {
      const target = visible && h ? 1 : 0;
      opacity += (target - opacity) * Math.min(1, dt * 5);
      if (opacity < 0.01) {
        root.style.opacity = '0';
        root.style.visibility = 'hidden';
        t = 0;
        return;
      }
      root.style.visibility = 'visible';
      root.style.opacity = opacity.toFixed(3);
      if (!h) return;
      const key = h.control + h.gesture;
      if (key !== lastKey) { lastKey = key; t = 0; }
      t += dt;
      let bx = h.x, by = h.y, scale = 1, ringScale = 1, ringAlpha = 0;
      if (h.gesture === 'drag' && isFinite(h.toX)) {
        const period = 2.0;
        const p = (t % period) / period;
        // 0〜0.15 押す、0.15〜0.75 動く、0.75〜1 離して消える
        const move = p < 0.15 ? 0 : p < 0.75 ? (p - 0.15) / 0.6 : 1;
        const k = move < 0.5 ? 2 * move * move : 1 - Math.pow(-2 * move + 2, 2) / 2;
        bx = h.x + (h.toX - h.x) * k;
        by = h.y + (h.toY - h.y) * k;
        scale = p < 0.15 ? 1 - p * 1.2 : p < 0.75 ? 0.82 : 0.82 + (p - 0.75) * 0.7;
        ball.style.opacity = p > 0.85 ? String(Math.max(0, 1 - (p - 0.85) / 0.15)) : '1';
        ringAlpha = p < 0.3 ? 1 - p / 0.3 : 0;
        ringScale = 1 + p * 2.5;
      } else {
        const period = 1.3;
        const p = (t % period) / period;
        scale = p < 0.2 ? 1 - p * 1.0 : p < 0.35 ? 0.8 + (p - 0.2) * 1.33 : 1;
        ringAlpha = p > 0.2 && p < 0.8 ? 1 - (p - 0.2) / 0.6 : 0;
        ringScale = p > 0.2 ? 1 + (p - 0.2) * 2.4 : 1;
        ball.style.opacity = '1';
      }
      ball.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      ring.style.transform = `translate(${h.x.toFixed(1)}px, ${h.y.toFixed(1)}px) translate(-50%, -50%) scale(${ringScale.toFixed(3)})`;
      ring.style.opacity = ringAlpha.toFixed(3);
    }

    return { update };
  }

  S.createHint = createHint;
})();
