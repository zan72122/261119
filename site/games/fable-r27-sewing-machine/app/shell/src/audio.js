// WebAudio 効果音（音声ファイルなし、すべて合成）。
// iOS は最初のタッチの中で AudioContext を作り/再開する必要がある。
// hero は onCue(name, params) で「鳴らすタイミング」だけを伝える。

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // ド レ ミ ソ ラ …（半音）

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let hum = null;
  const lastAt = new Map();
  const log = [];
  let unknownWarned = new Set();

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 回転の連続音：帯域ノイズ＋低い三角波。音量は crankSpeed で変える。
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 70;
    const og = ctx.createGain(); og.gain.value = 0.25;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(g); osc.connect(og); og.connect(g); g.connect(master);
    src.start(); osc.start();
    hum = { g, bp, osc };
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function env(gainNode, t, a, peak, d) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(type, f0, f1, dur, peak, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, 0.006, peak, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(type, freq, q, dur, peak, delay = 0, f1) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const note = (semi) => 523.25 * Math.pow(2, semi / 12);

  const SOUNDS = {
    tap: () => tone('sine', 880, 990, 0.12, 0.25),
    slide: () => noise('bandpass', 600, 1.5, 0.45, 0.35, 0, 2400),
    clunk: (p) => { const gn = p && p.gain != null ? p.gain : 1; tone('sine', 150, 70, 0.18, 0.6 * gn); noise('lowpass', 900, 0.7, 0.05, 0.4 * gn); },
    tick: (p) => noise('highpass', 2500 + 2500 * ((p && p.pitch) || 0), 2, 0.025, 0.22),
    needle: (p) => {
      const i = Math.max(0, Math.min(PENTA.length - 1, Math.round(((p && p.pitch) || 0) * (PENTA.length - 1))));
      tone('triangle', note(PENTA[i] - 12), null, 0.16, 0.45); tone('sine', note(PENTA[i]), null, 0.22, 0.18);
      noise('bandpass', 1800, 3, 0.03, 0.25);
    },
    hook: () => noise('bandpass', 3200, 4, 0.08, 0.12, 0, 1600),
    feed: () => noise('bandpass', 1200, 2, 0.05, 0.1),
    pop: () => { tone('sine', 320, 760, 0.18, 0.5); noise('bandpass', 1500, 1, 0.08, 0.3); },
    nudge: () => { tone('sine', 220, 180, 0.12, 0.35); },
    whoosh: () => noise('bandpass', 400, 0.8, 0.7, 0.4, 0, 2600),
    sparkle: () => { [0, 4, 7, 12, 16].forEach((s, k) => tone('sine', note(s + 12), null, 0.5, 0.22, k * 0.09)); },
    ripple: () => tone('sine', 660, 700, 0.08, 0.12),
  };

  return {
    unlock: ensure,
    get state() { return ctx ? ctx.state : 'none'; },
    log,
    cue(name, params) {
      log.push(name); if (log.length > 64) log.shift();
      if (!ctx || ctx.state !== 'running') return;
      const t = performance.now();
      if ((lastAt.get(name) || 0) > t - 40) return; // 同じ音は 1 秒に 25 回まで
      lastAt.set(name, t);
      const f = SOUNDS[name];
      if (!f) { if (!unknownWarned.has(name)) { unknownWarned.add(name); console.warn('unknown cue: ' + name); } SOUNDS.tap(); return; }
      try { f(params); } catch (e) { /* 音の失敗はゲームを止めない */ }
    },
    /** 回転の連続音（crankSpeed rad/s） */
    setSpin(speed) {
      if (!hum || !ctx || ctx.state !== 'running') return;
      const k = Math.min(1, Math.max(0, speed / (4 * Math.PI)));
      const t = ctx.currentTime;
      hum.g.gain.setTargetAtTime(k * 0.22, t, 0.06);
      hum.bp.frequency.setTargetAtTime(600 + 1400 * k, t, 0.08);
      hum.osc.frequency.setTargetAtTime(55 + 60 * k, t, 0.08);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
  };
}
