// ヒントの輪と「動かし方の点」、指の波紋（DOM、文字なし）。
// hero.getHint() の世界座標を画面に投影して置く。tap=輪が脈打つ、drag=点が線をなぞる、circle=点が円を回る。

const SHOW_AFTER = 3.0; // 秒止まったら出す

export function createHintLayer(fxEl) {
  const ring = document.createElement('div'); ring.className = 'ring'; ring.style.display = 'none';
  fxEl.appendChild(ring);
  const dots = [0, 1, 2].map((i) => { const d = document.createElement('div'); d.className = 'dot'; d.style.display = 'none'; d.style.opacity = String(1 - i * 0.3); fxEl.appendChild(d); return d; });
  let forced = 0, phase = 0;
  const pts = [];
  let lastScreen = null;

  function hide() { ring.style.display = 'none'; dots.forEach((d) => (d.style.display = 'none')); }

  return {
    /** nudge：すぐに 2.5 秒出す */
    force(sec = 2.5) { forced = Math.max(forced, sec); },
    get screen() { return lastScreen; },
    /**
     * @param hint hero.getHint() の結果
     * @param idle 秒
     * @param project 世界→画面
     * @param radiusPx 輪の半径（px）
     */
    update(dt, hint, idle, down, project, radiusPx) {
      forced = Math.max(0, forced - dt);
      lastScreen = null;
      if (!hint || !hint.position) { hide(); return; }
      const c = project(hint.position, {});
      const path = (hint.path || []).map((p) => project(p, {}));
      lastScreen = { part: hint.part, gesture: hint.gesture, x: c.x, y: c.y, r: radiusPx, path: path.map((p) => ({ x: p.x, y: p.y })) };
      const show = !down && (idle > SHOW_AFTER || forced > 0) && !c.behind;
      if (!show) { hide(); phase = 0; return; }
      phase += dt;
      const r = Math.max(46, Math.min(200, radiusPx * 1.15));
      ring.style.display = 'block';
      ring.style.left = c.x + 'px'; ring.style.top = c.y + 'px';
      ring.style.width = ring.style.height = (r * 2) + 'px';
      if ((hint.gesture === 'drag' || hint.gesture === 'circle') && path.length >= 2) {
        pts.length = 0; pts.push(...path);
        if (hint.gesture === 'circle') widenCircle(pts, Math.max(40, radiusPx * 0.55));
        const closed = hint.gesture === 'circle';
        const period = closed ? 1.8 : 1.3;
        dots.forEach((d, i) => {
          let u = ((phase - i * 0.09) / period) % 1; if (u < 0) u += 1;
          const p = along(pts, u, closed);
          d.style.display = 'block'; d.style.transform = ''; d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
        });
      } else {
        // tap：中心で点がぽんぽん（大きさだけ変える）
        const s = 0.7 + 0.5 * Math.abs(Math.sin(phase * Math.PI * 1.2));
        dots.forEach((d, i) => { if (i) { d.style.display = 'none'; return; } d.style.display = 'block'; d.style.left = c.x + 'px'; d.style.top = c.y + 'px'; d.style.transform = 'scale(' + s.toFixed(2) + ')'; });
      }
    },
    ripple(x, y) {
      const d = document.createElement('div'); d.className = 'ripple';
      d.style.left = x + 'px'; d.style.top = y + 'px';
      fxEl.appendChild(d);
      setTimeout(() => d.remove(), 650);
    },
  };
}

function along(pts, u, closed) {
  const n = closed ? pts.length : pts.length - 1;
  const f = u * n, i = Math.floor(f) % pts.length, k = f - Math.floor(f);
  const a = pts[i], b = pts[(i + 1) % pts.length];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * 回す向きの点の輪は、手回し車を真横に近い向きから見ると細い楕円（ほぼ上下の往復）になり、
 * 「回す」ことが 5 歳児に伝わらない。画面上で短い軸の方向だけを伸ばし、短い軸が長い軸の 0.6 倍以上・
 * minR px 以上の楕円にする。点の順番（回す向き）はそのまま。pts は書き換える。
 */
function widenCircle(pts, minR) {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  // 2×2 の共分散の固有値・固有ベクトル（長い軸 u、短い軸 v）
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
  let ux = sxy, uy = l1 - sxx;
  if (Math.abs(ux) + Math.abs(uy) < 1e-9) { ux = sxx >= syy ? 1 : 0; uy = sxx >= syy ? 0 : 1; }
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const vx = -uy, vy = ux;
  const rMajor = Math.sqrt(2 * l1 / n), rMinor = Math.sqrt(2 * l2 / n);   // 楕円の半径（一様に並んだ点の分散 = r²/2）
  const wantMinor = Math.max(rMajor * 0.6, minR * 0.6);
  const wantMajor = Math.max(rMajor, minR);
  const kv = rMinor > 1e-3 ? Math.max(1, wantMinor / rMinor) : 1;
  const ku = rMajor > 1e-3 ? wantMajor / rMajor : 1;
  if (rMinor <= 1e-3) return;   // 完全に一直線（回す向きが分からない）なら触らない
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy;
    const a = (dx * ux + dy * uy) * ku, b = (dx * vx + dy * vy) * kv;
    p.x = cx + a * ux + b * vx; p.y = cy + a * uy + b * vy;
  }
}
