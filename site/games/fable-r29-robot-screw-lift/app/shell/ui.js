// 画面の上に重ねる絵（文字なし）：指のお手本、もう一回の矢印、コンテキスト喪失中の歯車。
const FINGER_SVG = `<svg viewBox="0 0 100 120" width="100%" height="100%" aria-hidden="true">
  <circle cx="34" cy="22" r="20" fill="rgba(255,214,64,0.45)"/>
  <path d="M28 20 q0-10 9-10 q9 0 9 10 v34 q6-6 13-3 q6 2 6 9 q6-4 12 0 q5 3 5 9 q6-2 9 3 q3 4 3 12 v12 q0 22-22 22 h-18 q-12 0-20-10 l-18-24 q-5-7 1-11 q6-4 12 2 l8 8 z"
    fill="#fff" stroke="#3a2a1a" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

const REPLAY_SVG = `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <circle cx="50" cy="50" r="47" fill="#ffd640" stroke="#3a2a1a" stroke-width="4"/>
  <path d="M50 22 a28 28 0 1 1 -26 17" fill="none" stroke="#3a2a1a" stroke-width="10" stroke-linecap="round"/>
  <path d="M50 8 l16 14 l-16 14 z" fill="#3a2a1a"/>
</svg>`;

const GEAR_SVG = `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <g fill="#ffd640" stroke="#3a2a1a" stroke-width="3">
    <path d="M44 6h12l2 12 8 3 10-7 8 8-7 10 3 8 12 2v12l-12 2-3 8 7 10-8 8-10-7-8 3-2 12H44l-2-12-8-3-10 7-8-8 7-10-3-8-12-2V44l12-2 3-8-7-10 8-8 10 7 8-3z"/>
    <circle cx="50" cy="50" r="14" fill="#fff6dc"/>
  </g>
</svg>`;

export function createUI(container) {
  const style = document.createElement('style');
  style.textContent = `
    .r29-finger{position:fixed;left:0;top:0;width:15vmin;height:18vmin;min-width:72px;min-height:86px;pointer-events:none;opacity:0;transition:opacity .4s;z-index:7;transform-origin:34% 18%;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))}
    .r29-ring{position:fixed;left:0;top:0;width:22vmin;height:22vmin;margin:-11vmin 0 0 -11vmin;border-radius:50%;border:1.2vmin solid rgba(255,214,64,.9);box-shadow:0 0 3vmin rgba(255,214,64,.8);pointer-events:none;opacity:0;transition:opacity .4s;z-index:4}
    .r29-replay{position:fixed;left:50%;bottom:6vmin;width:24vmin;height:24vmin;margin-left:-12vmin;border:0;padding:0;background:none;opacity:0;transform:scale(.6);transition:opacity .5s,transform .5s;z-index:6;pointer-events:none;-webkit-tap-highlight-color:transparent;touch-action:none}
    .r29-replay.on{opacity:1;transform:scale(1);pointer-events:auto;animation:r29beat 1.2s ease-in-out .6s infinite}
    @keyframes r29beat{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
    .r29-boot{transition:opacity .35s}
    .r29-veil{position:fixed;inset:0;background:rgba(40,30,20,.55);display:none;align-items:center;justify-content:center;z-index:8}
    .r29-veil.on{display:flex}
    .r29-veil div{width:20vmin;height:20vmin;animation:r29spin 3s linear infinite}
    @keyframes r29spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
  const finger = document.createElement('div');
  finger.className = 'r29-finger';
  finger.innerHTML = FINGER_SVG;
  const ring = document.createElement('div');
  ring.className = 'r29-ring';
  const replay = document.createElement('button');
  replay.className = 'r29-replay';
  replay.setAttribute('aria-label', 'replay');
  replay.innerHTML = REPLAY_SVG;
  const veil = document.createElement('div');
  veil.className = 'r29-veil';
  veil.innerHTML = `<div>${GEAR_SVG}</div>`;
  container.append(ring, finger, replay, veil);

  let hintT = 0, hintOn = false, ringSize = 0;
  return {
    replayButton: replay,
    // 指のお手本。x,y は画面座標（操作部の anchor）。gesture: circle/down/tap
    // radiusPx：ぐるぐるの半径（画面 px）。操作部の大きさ（target.radius）から。無ければ 9vmin
    hint(show, x, y, gesture, dt, radiusPx) {
      if (show !== hintOn) { hintOn = show; hintT = 0; finger.style.opacity = show ? '1' : '0'; ring.style.opacity = show ? '0.9' : '0'; }
      if (!show) return;
      hintT += dt;
      const u = Math.min(window.innerWidth, window.innerHeight) / 100; // 1vmin
      let dx = 0, dy = 0, s = 1;
      const rc = radiusPx > 0 ? Math.min(Math.max(radiusPx, 6 * u), 30 * u) : 9 * u;
      const ringR = Math.round(gesture === 'circle' && radiusPx > 0 ? rc + 2 * u : 11 * u);
      if (ringR !== ringSize) { ringSize = ringR; ring.style.width = ring.style.height = `${2 * ringR}px`; ring.style.margin = `${-ringR}px 0 0 ${-ringR}px`; }
      if (gesture === 'circle') { const a = hintT * 3.2; dx = Math.cos(a) * rc; dy = Math.sin(a) * rc; }
      else if (gesture === 'down') { const k = (hintT * 0.9) % 1; dy = (k < 0.7 ? k / 0.7 : 1) * 12 * u - 6 * u; s = k < 0.7 ? 1 : 0.92; }
      else { const k = (hintT * 1.4) % 1; s = k < 0.2 ? 0.88 : 1; dy = k < 0.2 ? 0 : -Math.sin((k - 0.2) / 0.8 * Math.PI) * 3 * u; }
      // 指先（SVG の 34%,18% の位置）が目標に来るように置く
      const fw = finger.offsetWidth, fh = finger.offsetHeight;
      finger.style.transform = `translate(${x + dx - fw * 0.34}px, ${y + dy - fh * 0.18}px) scale(${s})`;
      const pulse = 1 + 0.08 * Math.sin(hintT * 5);
      ring.style.transform = `translate(${x}px, ${y}px) scale(${pulse})`;
    },
    get hintVisible() { return hintOn; },
    showReplay(on) { replay.classList.toggle('on', on); },
    get replayVisible() { return replay.classList.contains('on'); },
    showVeil(on) { veil.classList.toggle('on', on); },
  };
}
