// ?debug=1 のオーバーレイ：tier・canvas・fps(平均/p95)・draw call・三角形・テクスチャ・GPU 見積もり・起動時間・NaN 検査・段階・エラー。
export function createErrorLog() {
  const errors = [];
  const push = (msg) => { errors.push(String(msg).slice(0, 300)); if (errors.length > 50) errors.shift(); };
  window.addEventListener('error', (e) => push(e.message || e.error || 'error'));
  window.addEventListener('unhandledrejection', (e) => push('unhandled: ' + (e.reason && (e.reason.message || e.reason))));
  const ce = console.error.bind(console);
  console.error = (...a) => { push(a.map((x) => (x && x.message) || x).join(' ')); ce(...a); };
  return { errors, push };
}

export function createFrameStats() {
  const N = 240;
  const buf = new Float32Array(N);
  let i = 0, n = 0;
  const sorted = new Float32Array(N);
  return {
    add(ms) { buf[i] = ms; i = (i + 1) % N; n = Math.min(n + 1, N); },
    avgFps() {
      if (!n) return 0;
      let s = 0;
      for (let k = 0; k < n; k++) s += buf[k];
      return 1000 / Math.max(s / n, 1e-3);
    },
    p95Ms() {
      if (!n) return 0;
      sorted.set(buf);
      const view = sorted.subarray(0, n).sort();
      return view[Math.min(n - 1, Math.floor(n * 0.95))];
    },
    // 直近 k フレームの平均 fps
    recentFps(k) {
      k = Math.min(k, n);
      if (!k) return 60;
      let s = 0;
      for (let j = 1; j <= k; j++) s += buf[(i - j + N) % N];
      return 1000 / Math.max(s / k, 1e-3);
    },
  };
}

export function createDebugOverlay() {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:6px;top:6px;margin:0;padding:6px 8px;background:rgba(0,0,0,.62);color:#e8ffe8;font:11px/1.35 ui-monospace,Menlo,monospace;z-index:20;pointer-events:none;max-width:60vw;white-space:pre-wrap;border-radius:6px';
  document.body.appendChild(el);
  const MB = (b) => (b / 1048576).toFixed(1);
  return {
    render(d) {
      const m = d.measure;
      const over = (v, lim) => (v > lim ? ' !!' : '');
      const lines = [
        `tier ${d.tier.name}${d.tier.isMobile ? ' (mobile)' : ''}  msaa ${d.tier.msaa ? 4 : 0}  shadow ${d.shadows ? d.tier.shadowMapSize : 'off'}  ${d.mode}`,
        `canvas ${d.canvasW}x${d.canvasH} @dpr ${d.dpr.toFixed(2)}`,
        `fps ${d.fps.toFixed(1)} avg  p95 ${d.p95.toFixed(1)} ms`,
        `draw ${d.calls}  tris/frame ${d.trisFrame}`,
        m ? `tris hero ${m.hero.tris}${over(m.hero.tris, 50000)} / env ${m.env.tris}${over(m.env.tris, 50000)}  meshes ${m.hero.meshes}/${m.env.meshes}` : '',
        m ? `tex ${m.textures.length} (hero ${m.hero.textures} ${MB(m.hero.texBytes)}MB, env ${m.env.textures} ${MB(m.env.texBytes)}MB)` : '',
        m ? `gpu≈ ${MB(m.totalBytes)}MB${over(m.totalBytes, 128 * 1048576)} (fb ${MB(m.fbBytes)} geo ${MB(m.hero.geoBytes + m.env.geoBytes)} pmrem ${MB(m.pmremBytes)} shadow ${MB(m.shadowBytes)})` : '',
        d.timeline ? `boot→1st frame ${d.timeline.firstFrame ?? '-'} ms (hero ${d.timeline.heroCreated ?? '-'}, tex ${d.timeline.texturesReady ?? '-'})  programs ${d.programs}` : '',
        d.sanity ? (d.sanity.ok ? `nan-check ok (${d.sanity.meshes} meshes)` : `nan-check !! pos ${d.sanity.badPos} normal ${d.sanity.badNormal} matrix ${d.sanity.badMatrix} flat ${d.sanity.flatInst}`) : '',
        `stage ${d.stage.id} r${d.stage.round} p${(d.stage.progress || 0).toFixed(2)} view ${d.view}  idle ${d.idle.toFixed(1)}s`,
        d.notes.length ? 'note: ' + d.notes.slice(-2).join(' | ') : '',
        d.errors.length ? `errors ${d.errors.length}: ${d.errors[d.errors.length - 1]}` : 'errors 0',
      ];
      el.textContent = lines.filter(Boolean).join('\n');
      el.style.color = d.errors.length ? '#ffd0d0' : '#e8ffe8';
    },
  };
}
