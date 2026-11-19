// WebAudio の効果音（すべて合成。音声ファイルなし）。最初のタッチで鳴らせるようにする（iOS の制約）。
// play(name, {gain, rate, pan}) 単発 / loop(name, {level, rate}) 連続（gear, servo）
export function createAudio() {
  let ctx = null, master = null, noise = null;
  const lastPlay = new Map();
  const loops = {};
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (_) { return null; }
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    // 1 秒の白色雑音
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state !== 'running') c.resume().catch(() => {});
  }

  function out(pan) {
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(master);
      return p;
    }
    return master;
  }

  function env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  function tone(dest, type, f0, f1, t, dur, peak, a = 0.005) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(f0, 1), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    env(g, t, a, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
  }

  function burst(dest, t, dur, peak, ftype, f, q = 1, f1) {
    const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    flt.type = ftype; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.003, peak, dur);
    s.connect(flt); flt.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const SFX = {
    tick(d, t, r) { burst(d, t, 0.03, 0.25, 'bandpass', 2600 * r, 4); },
    click(d, t, r) { burst(d, t, 0.025, 0.4, 'highpass', 3000 * r, 1); tone(d, 'square', 1800 * r, 1500 * r, t, 0.03, 0.06); },
    ratchet(d, t, r) {
      burst(d, t, 0.03, 0.7, 'highpass', 3500 * r, 1);
      tone(d, 'sine', 2400 * r, 2380 * r, t, 0.25, 0.18);
      tone(d, 'sine', 3700 * r, 3650 * r, t, 0.18, 0.1);
      burst(d, t + 0.06, 0.02, 0.4, 'highpass', 4000 * r, 1);
    },
    clunk(d, t, r) { tone(d, 'sine', 110 * r, 45 * r, t, 0.35, 0.9); burst(d, t, 0.18, 0.5, 'lowpass', 500 * r, 1); },
    beep(d, t, r) { tone(d, 'triangle', 620 * r, 900 * r, t, 0.12, 0.25); tone(d, 'triangle', 900 * r, 1250 * r, t + 0.13, 0.16, 0.25); },
    'beep-ask'(d, t, r) { tone(d, 'triangle', 520 * r, 820 * r, t, 0.22, 0.25); },
    pop(d, t, r) { tone(d, 'sine', 380 * r, 1300 * r, t, 0.09, 0.45); },
    sparkle(d, t, r) { [0, 1, 2, 3, 4].forEach((i) => tone(d, 'sine', [1568, 1760, 2093, 2349, 2637][i] * r, [1568, 1760, 2093, 2349, 2637][i] * r, t + i * 0.07, 0.35, 0.16)); },
    whoosh(d, t, r) { burst(d, t, 0.6, 0.35, 'bandpass', 300 * r, 1.5, 2200 * r); },
    chime(d, t, r) { tone(d, 'sine', 1318 * r, 1318 * r, t, 0.6, 0.12, 0.01); tone(d, 'sine', 1976 * r, 1976 * r, t + 0.05, 0.5, 0.07, 0.01); },
    fanfare(d, t, r) {
      const n = [523, 659, 784, 1047];
      n.forEach((f, i) => { tone(d, 'triangle', f * r, f * r, t + i * 0.13, 0.4, 0.22); tone(d, 'sine', f * 2 * r, f * 2 * r, t + i * 0.13, 0.3, 0.05); });
      [523, 659, 784].forEach((f) => tone(d, 'triangle', f * r, f * r, t + 0.55, 1.2, 0.16, 0.02));
    },
  };

  function makeLoop(name) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.connect(g);
    const o = ctx.createOscillator();
    let base;
    if (name === 'gear') {
      o.type = 'sawtooth'; base = 48; flt.frequency.value = 380;
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8;
      const ng = ctx.createGain(); ng.gain.value = 0.25;
      n.connect(nf); nf.connect(ng); ng.connect(g); n.start();
    } else {
      o.type = 'sawtooth'; base = 180; flt.frequency.value = 900;
    }
    o.frequency.value = base;
    o.connect(flt); o.start();
    return { g, o, base, level: 0 };
  }

  return {
    unlock,
    get ready() { return !!ctx && ctx.state === 'running'; },
    setMuted(m) { muted = m; },
    play(name, params = {}) {
      if (muted || !ctx || ctx.state !== 'running') return;
      if (name === 'gear' || name === 'servo') return this.loop(name, params);
      const f = SFX[name];
      if (!f) return;
      const t = ctx.currentTime;
      const last = lastPlay.get(name) || -1;
      if (t - last < 0.04) return; // 同名単発は 40 ms 以内なら間引く
      lastPlay.set(name, t);
      const gain = params.gain == null ? 1 : Math.max(0, Math.min(2, params.gain));
      const rate = params.rate == null ? 1 : Math.max(0.25, Math.min(4, params.rate));
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(out(params.pan || 0));
      f(g, t + 0.005, rate);
    },
    loop(name, params = {}) {
      if (!ctx || ctx.state !== 'running') return;
      const L = loops[name] || (loops[name] = makeLoop(name));
      const level = muted ? 0 : Math.max(0, Math.min(1, params.level == null ? 0 : params.level));
      const rate = Math.max(0.25, Math.min(4, params.rate == null ? 1 : params.rate));
      const t = ctx.currentTime;
      L.g.gain.setTargetAtTime(level * (name === 'gear' ? 0.35 : 0.12), t, 0.05);
      L.o.frequency.setTargetAtTime(L.base * rate, t, 0.05);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
  };
}
