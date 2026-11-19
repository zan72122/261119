// audio.js — every sound synthesized with Web Audio. No imports, no files.
// createAudio() never throws; everything is a silent no-op until unlock() succeeds.

export function createAudio() {
  // ---------------------------------------------------------------- state
  let ctx = null;          // AudioContext (after unlock)
  let dead = false;        // creation failed -> silent forever
  let unlocked = false;
  let hidden = false;      // suspend() requested
  let timer = null;

  let master = null, comp = null, softLP = null;
  let shotBus = null, contBus = null, musicOut = null;
  let white = null, pink = null, brown = null;

  const voices = [];
  const MAX_VOICES = 24;

  // continuous-sound wishes (kept even before unlock)
  const want = {
    mixer: { on: false, speed: 0, load: 0, inCream: false },
    pour: false,
    spread: 0,
    slide: 0,
    ambience: 0,
    music: false,
  };
  let cont = null;         // built continuous graph

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const live = () => !!ctx && !dead;
  const running = () => live() && !hidden && ctx.state === 'running';

  function safe(fn) {
    return function () {
      try { return fn.apply(null, arguments); } catch (e) { /* never throw */ }
    };
  }

  // smooth param move (no cancel: avoids jumps on some Safari versions)
  function tgt(p, v, tau) {
    if (!p) return;
    try { p.setTargetAtTime(v, ctx.currentTime, Math.max(0.005, tau)); } catch (e) {}
  }

  // ---------------------------------------------------------------- setup
  function makeBuffers() {
    const sr = ctx.sampleRate, n = Math.floor(sr * 2);
    white = ctx.createBuffer(1, n, sr);
    pink = ctx.createBuffer(1, n, sr);
    brown = ctx.createBuffer(1, n, sr);
    const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
      last = (last + 0.02 * x) / 1.02;
      b[i] = last * 3.5;
    }
    // smooth the loop seam a little
    const f = Math.floor(sr * 0.01);
    for (const d of [w, p, b]) for (let i = 0; i < f; i++) {
      const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k;
    }
  }

  function buildMaster() {
    master = ctx.createGain(); master.gain.value = 0.8;
    softLP = ctx.createBiquadFilter(); softLP.type = 'lowpass'; softLP.frequency.value = 9500; softLP.Q.value = 0.5;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 3.5;
    comp.attack.value = 0.006; comp.release.value = 0.25;
    master.connect(softLP); softLP.connect(comp); comp.connect(ctx.destination);
    shotBus = ctx.createGain(); shotBus.gain.value = 0.9; shotBus.connect(master);
    contBus = ctx.createGain(); contBus.gain.value = 1; contBus.connect(master);
    musicOut = ctx.createGain(); musicOut.gain.value = 0.2; musicOut.connect(master);
  }

  function loopNoise(buf, rate) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start(ctx.currentTime, Math.random() * (buf.duration - 0.1));
    return s;
  }
  function filt(type, f, q) {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f;
    if (q != null) n.Q.value = q; return n;
  }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
  function chain() { for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }

  function buildContinuous() {
    const c = {};
    // ---- MIXER
    const mx = c.mx = {};
    mx.out = gain(1); mx.out.connect(contBus);
    // motor whine
    mx.o1 = osc('sawtooth', 100); mx.o2 = osc('sawtooth', 100); mx.o2.detune.value = 9;
    mx.o3 = osc('square', 50);
    mx.o4 = osc('sine', 400);          // faint gear whine harmonic
    mx.whMix = gain(1);
    const g1 = gain(0.5), g2 = gain(0.45), g3 = gain(0.18), g4 = gain(0.12);
    mx.o1.connect(g1); mx.o2.connect(g2); mx.o3.connect(g3); mx.o4.connect(g4);
    g1.connect(mx.whMix); g2.connect(mx.whMix); g3.connect(mx.whMix);
    mx.bp = filt('bandpass', 300, 1.4);
    mx.lp = filt('lowpass', 2600, 0.6);
    mx.motorG = gain(0);
    chain(mx.whMix, mx.bp, mx.lp, mx.motorG, mx.out);
    g4.connect(mx.lp);
    // gear rattle: noise AM'd at a motor-related rate
    mx.rn = loopNoise(white);
    mx.rbp = filt('bandpass', 2800, 0.9);
    mx.ram = gain(0.5);
    mx.rlfo = osc('square', 40);
    const rdepth = gain(0.5); mx.rlfo.connect(rdepth); rdepth.connect(mx.ram.gain);
    mx.rattleG = gain(0);
    chain(mx.rn, mx.rbp, mx.ram, mx.rattleG, mx.out);
    // labouring growl
    mx.go = osc('sawtooth', 40);
    mx.go2 = osc('triangle', 30);
    mx.glp = filt('lowpass', 220, 0.9);
    mx.growlG = gain(0);
    mx.go.connect(mx.glp); mx.go2.connect(mx.glp); chain(mx.glp, mx.growlG, mx.out);
    // wet slosh: noise AM'd at the beater rate
    mx.sn = loopNoise(pink);
    mx.sbp = filt('bandpass', 1200, 0.8);
    mx.slp = filt('lowpass', 3000, 0.5);
    mx.sam = gain(0.5);
    mx.slfo = osc('sine', 8);
    mx.sdepth = gain(0.5); mx.slfo.connect(mx.sdepth); mx.sdepth.connect(mx.sam.gain);
    mx.slfo2 = osc('triangle', 13.7); const sd2 = gain(0.15); mx.slfo2.connect(sd2); sd2.connect(mx.sam.gain);
    mx.sloshG = gain(0);
    chain(mx.sn, mx.sbp, mx.slp, mx.sam, mx.sloshG, mx.out);
    mx.last = null;

    // ---- POUR
    const pr = c.pr = {};
    pr.bus = gain(0); pr.bus.connect(contBus);
    pr.n = loopNoise(pink);
    pr.bp = filt('bandpass', 700, 0.7);
    pr.lp = filt('lowpass', 1600, 0.5);
    pr.am = gain(0.8);
    pr.lfo = osc('sine', 3.3); const pd = gain(0.2); pr.lfo.connect(pd); pd.connect(pr.am.gain);
    chain(pr.n, pr.bp, pr.lp, pr.am, gain(0.07), pr.bus);
    pr.glugLP = filt('lowpass', 900, 0.7); pr.glugLP.connect(pr.bus);
    pr.next = 0;

    // ---- SPREAD
    const sp = c.sp = {};
    sp.n = loopNoise(pink);
    sp.lp = filt('lowpass', 500, 0.4);
    sp.hp = filt('highpass', 120, 0.5);
    sp.g = gain(0);
    chain(sp.n, sp.hp, sp.lp, sp.g, contBus);
    sp.last = -1;

    // ---- SLIDE
    const sl = c.sl = {};
    sl.n = loopNoise(brown);
    sl.bp = filt('bandpass', 170, 1.1);
    sl.g = gain(0);
    chain(sl.n, sl.bp, sl.g, contBus);
    sl.gn = loopNoise(white);
    sl.gbp = filt('bandpass', 1100, 1.5);
    sl.gam = gain(0.4);
    sl.l1 = osc('square', 23); sl.l2 = osc('sine', 9.3);
    const d1 = gain(0.3), d2 = gain(0.3); sl.l1.connect(d1); sl.l2.connect(d2); d1.connect(sl.gam.gain); d2.connect(sl.gam.gain);
    sl.gg = gain(0);
    chain(sl.gn, sl.gbp, sl.gam, sl.gg, contBus);
    sl.last = -1;

    // ---- AMBIENCE
    const am = c.am = {};
    am.g = gain(0); am.g.connect(contBus);
    am.h1 = osc('sine', 100); am.h2 = osc('sine', 150.4); am.h3 = osc('triangle', 50);
    const hg = gain(0.5), hg2 = gain(0.18), hg3 = gain(0.25);
    am.h1.connect(hg); am.h2.connect(hg2); am.h3.connect(hg3);
    const hlp = filt('lowpass', 300, 0.5);
    hg.connect(hlp); hg2.connect(hlp); hg3.connect(hlp); chain(hlp, gain(0.012), am.g);
    am.n = loopNoise(pink);
    chain(am.n, filt('lowpass', 700, 0.5), gain(0.03), am.g);
    am.last = -1;

    cont = c;
  }

  // ---------------------------------------------------------------- continuous apply
  function applyMixer(force) {
    if (!cont) return;
    const mx = cont.mx, s = want.mixer;
    const on = !!s.on;
    const speed = clamp(num(s.speed, 0));
    const load = clamp(num(s.load, 0));
    const inC = !!s.inCream;
    const key = [on, Math.round(speed * 200), Math.round(load * 200), inC].join();
    if (!force && key === mx.last) return;
    mx.last = key;
    const sp = on ? 0.18 + 0.82 * speed : 0;
    const L = inC ? load : 0;
    const tauF = on ? 0.11 : 0.17;   // ~0.35s spin-up, ~0.5s spin-down
    const tauG = on ? 0.06 : 0.16;
    let f = (55 + 175 * sp) * (1 - 0.2 * L) * (inC ? 1 : 1.07);
    tgt(mx.o1.frequency, f, tauF);
    tgt(mx.o2.frequency, f, tauF);
    tgt(mx.o3.frequency, f * 0.5, tauF);
    tgt(mx.o4.frequency, f * 4.02, tauF);
    tgt(mx.bp.frequency, f * 2.6 + 150, tauF);
    tgt(mx.rlfo.frequency, f * 0.5, tauF);
    tgt(mx.go.frequency, f * 0.25, tauF);
    tgt(mx.go2.frequency, f * 0.125 + 3, tauF);
    const beat = 3 + 11 * sp * (1 - 0.3 * L);
    tgt(mx.slfo.frequency, Math.max(0.5, beat), tauF);
    tgt(mx.slfo2.frequency, Math.max(0.8, beat * 1.71), tauF);
    // levels
    tgt(mx.motorG.gain, on ? 0.12 * (0.55 + 0.45 * sp) * (inC ? 0.92 : 1) : 0, tauG);
    tgt(mx.rattleG.gain, on ? 0.05 * sp * (inC ? 1 : 0.6) : 0, tauG);
    tgt(mx.growlG.gain, on ? 0.16 * L * sp : 0, tauG);
    tgt(mx.sloshG.gain, on && inC ? (0.11 - 0.04 * L) * (0.4 + 0.6 * sp) : 0, on ? 0.04 : 0.12);
    tgt(mx.sbp.frequency, 1900 - 1450 * load, 0.1);
    tgt(mx.slp.frequency, 4200 - 3400 * load, 0.1);
    tgt(mx.sdepth.gain, 0.4 + 0.15 * load, 0.1);
  }
  function applyPour() {
    if (!cont) return;
    tgt(cont.pr.bus.gain, want.pour ? 1 : 0, 0.05);
    if (want.pour && cont.pr.next < ctx.currentTime) cont.pr.next = ctx.currentTime + 0.03;
  }
  function applySpread(force) {
    if (!cont) return;
    const v = clamp(num(want.spread, 0)), sp = cont.sp;
    if (!force && Math.abs(v - sp.last) < 0.004) return;
    sp.last = v;
    tgt(sp.g.gain, 0.16 * Math.pow(v, 0.8), 0.018);
    tgt(sp.lp.frequency, 380 + 2000 * v, 0.025);
  }
  function applySlide(force) {
    if (!cont) return;
    const v = clamp(num(want.slide, 0)), sl = cont.sl;
    if (!force && Math.abs(v - sl.last) < 0.004) return;
    sl.last = v;
    tgt(sl.g.gain, 0.5 * Math.pow(v, 0.9), 0.03);
    tgt(sl.bp.frequency, 140 + 110 * v, 0.05);
    tgt(sl.gg.gain, 0.03 * v, 0.03);
  }
  function applyAmb(force) {
    if (!cont) return;
    const v = clamp(num(want.ambience, 0)), am = cont.am;
    if (!force && Math.abs(v - am.last) < 0.004) return;
    am.last = v;
    tgt(am.g.gain, v, 0.4);
  }
  function applyAll() {
    applyMixer(true); applyPour(); applySpread(true); applySlide(true); applyAmb(true);
  }

  function glug(t) {
    const pr = cont.pr;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = rnd(220, 380);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * rnd(0.5, 0.65), t + rnd(0.05, 0.08));
    const g = ctx.createGain();
    const pk = rnd(0.12, 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.008);
    g.gain.setTargetAtTime(0, t + 0.02, 0.025);
    o.connect(g); g.connect(pr.glugLP);
    o.start(t); o.stop(t + 0.16);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) {} };
  }

  // ---------------------------------------------------------------- music box
  const SPB = 60 / 96;
  const MEL = [[72,.75],[72,.25],[74,1],[72,1],[77,1],[76,2],
               [72,.75],[72,.25],[74,1],[72,1],[79,1],[77,2],
               [72,.75],[72,.25],[84,1],[81,1],[77,1],[76,1],[74,2],
               [82,.75],[82,.25],[81,1],[77,1],[79,1],[77,3]];
  const EVENTS = [];
  (function () {
    let b = 0;
    for (const [m, d] of MEL) { EVENTS.push({ b, m, low: false }); b += d; }
    const acc = [[1,53],[4,48],[7,48],[10,53],[13,53],[16,46],[20,53],[22,48],[23,53],[23,41]];
    for (const [bb, m] of acc) EVENTS.push({ b: bb, m, low: true });
    EVENTS.sort((a, c) => a.b - c.b);
  })();
  const SONG_BEATS = 26;
  const SONG_LEN = SONG_BEATS * SPB;        // 16.25 s
  const LOOP_LEN = SONG_LEN + 2.5;          // 18.75 s
  const mus = { bus: null, start: 0, idx: 0 };

  function boxNote(m, t, low, bus) {
    const f = mtof(m);
    const pk = low ? 0.32 : 0.42;
    const tau = low ? 0.4 : 0.3;
    const end = t + tau * 5.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.006, tau);
    g.connect(bus);
    const parts = low ? [[1, 1], [2, 0.12]] : [[1, 1], [3, 0.1], [4, 0.05]];
    const nodes = [g];
    let n = parts.length;
    for (const [mul, a] of parts) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const pg = ctx.createGain();
      if (mul === 1) pg.gain.value = a;
      else { pg.gain.setValueAtTime(a, t); pg.gain.setTargetAtTime(0, t + 0.01, tau * 0.3); }
      o.connect(pg); pg.connect(g); nodes.push(o, pg);
      o.start(t); o.stop(end);
      o.onended = () => { if (--n === 0) for (const x of nodes) { try { x.disconnect(); } catch (e) {} } };
    }
  }

  function musicTick() {
    if (!want.music || !mus.bus) return;
    const now = ctx.currentTime;
    // if we fell far behind (throttled timer), skip ahead instead of piling up
    if (mus.idx < EVENTS.length && mus.start + EVENTS[mus.idx].b * SPB < now - 0.08) {
      mus.start = now + 0.06 - EVENTS[mus.idx].b * SPB;
    }
    let guard = 0;
    while (guard++ < 64) {
      if (mus.idx >= EVENTS.length) { mus.idx = 0; mus.start += LOOP_LEN; }
      const ev = EVENTS[mus.idx];
      const t = mus.start + ev.b * SPB;
      if (t > now + 0.3) break;
      if (t >= now - 0.02) boxNote(ev.m, Math.max(t, now), ev.low, mus.bus);
      mus.idx++;
    }
  }
  function musicBegin() {
    if (!live() || mus.bus) return;
    mus.bus = gain(1); mus.bus.connect(musicOut);
    mus.start = ctx.currentTime + 0.15; mus.idx = 0;
    musicTick();
  }
  function musicEnd(fade) {
    if (!live() || !mus.bus) return;
    const b = mus.bus; mus.bus = null;
    const f = Math.max(0.02, num(fade, 1));
    const t = ctx.currentTime;
    try {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(b.gain.value, t);
      b.gain.linearRampToValueAtTime(0, t + f);
    } catch (e) {}
    setTimeout(() => { try { b.disconnect(); } catch (e) {} }, (f + 2.5) * 1000);
  }

  // ---------------------------------------------------------------- tick
  function tick() {
    try {
      if (!running()) return;
      const now = ctx.currentTime;
      if (cont && want.pour) {
        const pr = cont.pr;
        if (pr.next < now) pr.next = now + 0.02;
        while (pr.next < now + 0.15) {
          glug(pr.next);
          pr.next += 1 / rnd(4.5, 7.5) + (Math.random() < 0.15 ? rnd(0.04, 0.12) : 0);
        }
      }
      musicTick();
    } catch (e) {}
  }

  // ---------------------------------------------------------------- one-shot voices
  function newVoice(vol, lp) {
    const out = ctx.createGain(); out.gain.value = vol;
    let input = out;
    const nodes = [out];
    if (lp) { const f = filt('lowpass', lp, 0.6); f.connect(out); input = f; nodes.push(f); }
    out.connect(shotBus);
    const v = { out, input, nodes, srcs: 0, ended: 0, born: ctx.currentTime, vol, dead: false };
    voices.push(v);
    while (voices.length > MAX_VOICES) {
      // drop the quietest among the oldest half
      let k = 0;
      const half = Math.max(1, voices.length >> 1);
      for (let i = 1; i < half; i++) if (voices[i].vol < voices[k].vol) k = i;
      killVoice(voices[k]);
    }
    return v;
  }
  function cleanVoice(v) {
    if (v.dead) return; v.dead = true;
    const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) {} }
  }
  function killVoice(v) {
    const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
    try {
      const t = ctx.currentTime;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(v.out.gain.value, t);
      v.out.gain.linearRampToValueAtTime(0, t + 0.03);
    } catch (e) {}
    setTimeout(() => cleanVoice(v), 120);
  }
  function addSrc(v, s, t0, t1) {
    v.nodes.push(s); v.srcs++;
    s.onended = () => { if (++v.ended >= v.srcs) cleanVoice(v); };
    s.start(t0); s.stop(t1);
  }
  function env(g, t, a, pk, d) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // filtered noise burst
  function nz(v, t, o) {
    const buf = o.buf || white;
    const s = ctx.createBufferSource(); s.buffer = buf;
    if (o.rate) s.playbackRate.value = o.rate;
    const f = filt(o.type || 'bandpass', o.f || 1000, o.q != null ? o.q : 1);
    if (o.f2) f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.ft || (o.a || 0.002) + (o.d || 0.1)));
    const g = ctx.createGain();
    const a = o.a || 0.002, d = o.d || 0.1;
    if (o.hold) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.pk, t + a);
      g.gain.setValueAtTime(o.pk, t + a + o.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.hold + d);
    } else env(g, t, a, o.pk, d);
    s.connect(f); f.connect(g); g.connect(v.input);
    v.nodes.push(f, g);
    const end = t + a + (o.hold || 0) + d + 0.02;
    const off = Math.random() * Math.max(0, buf.duration - (end - t) - 0.05);
    v.nodes.push(s); v.srcs++;
    s.onended = () => { if (++v.ended >= v.srcs) cleanVoice(v); };
    s.start(t, off); s.stop(end);
    return f;
  }
  // tone with optional glide
  function tn(v, t, o) {
    const s = ctx.createOscillator(); s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f, t);
    if (o.f2) {
      if (o.lin) s.frequency.linearRampToValueAtTime(o.f2, t + (o.ft || 0.05));
      else s.frequency.exponentialRampToValueAtTime(o.f2, t + (o.ft || 0.05));
    }
    const g = ctx.createGain();
    const a = o.a || 0.003, d = o.d || 0.1;
    env(g, t, a, o.pk, d);
    s.connect(g); g.connect(v.input); v.nodes.push(g);
    addSrc(v, s, t, t + a + d + 0.02);
    return s;
  }
  function bell(v, t, f, pk, d, ratio, rg) {
    tn(v, t, { f, pk, a: 0.003, d });
    tn(v, t, { f: f * (ratio || 2.76), pk: pk * (rg != null ? rg : 0.22), a: 0.002, d: d * 0.35 });
  }

  const PENTA = [0, 2, 4, 7, 9]; // major pentatonic
  function pentaMidi(base, i) { return base + 12 * Math.floor(i / 5) + PENTA[i % 5]; }

  const SHOTS = {
    pick(v, t, p) {
      tn(v, t, { f: 820 * p, f2: 1250 * p, ft: 0.04, pk: 0.12, a: 0.003, d: 0.05 });
      nz(v, t, { type: 'highpass', f: 3000, q: 0.7, pk: 0.05, d: 0.018 });
    },
    put(v, t, p) {
      tn(v, t, { f: 150 * p, f2: 75 * p, ft: 0.08, pk: 0.5, a: 0.003, d: 0.13 });
      tn(v, t, { type: 'triangle', f: 330 * p, f2: 260 * p, pk: 0.08, a: 0.002, d: 0.05 });
      nz(v, t, { type: 'lowpass', f: 900, q: 0.7, pk: 0.18, d: 0.05 });
    },
    tap(v, t, p) {
      tn(v, t, { f: 620 * p, f2: 540 * p, pk: 0.14, a: 0.002, d: 0.06 });
      nz(v, t, { f: 2000, q: 1.2, pk: 0.05, d: 0.02 });
    },
    pok(v, t, p) {
      nz(v, t, { f: 360 * p, q: 7, pk: 0.9, a: 0.002, d: 0.09 });
      tn(v, t, { f: 250 * p, f2: 215 * p, ft: 0.08, pk: 0.22, a: 0.002, d: 0.08 });
      nz(v, t, { type: 'lowpass', f: 1500, q: 0.7, pk: 0.08, d: 0.02 });
    },
    plop(v, t, p) {
      const f = rnd(200, 240) * p;
      tn(v, t, { f, f2: f * 2.1, ft: 0.05, pk: 0.32, a: 0.004, d: 0.08 });
      nz(v, t, { type: 'lowpass', f: 650, q: 0.8, pk: 0.14, a: 0.003, d: 0.06 });
    },
    bigPlop(v, t, p) {
      tn(v, t, { f: 95 * p, f2: 52 * p, ft: 0.2, pk: 0.5, a: 0.008, d: 0.3 });
      nz(v, t, { type: 'lowpass', f: 500, f2: 180, ft: 0.3, q: 0.9, pk: 0.3, a: 0.01, d: 0.3, buf: pink });
      tn(v, t + 0.04, { f: 150 * p, f2: 330 * p, ft: 0.06, pk: 0.14, a: 0.005, d: 0.1 });
      tn(v, t + 0.14, { f: 190 * p, f2: 380 * p, ft: 0.05, pk: 0.07, a: 0.005, d: 0.08 });
    },
    splat(v, t, p) {
      const f = rnd(650, 1200) * p;
      nz(v, t, { f, f2: f * rnd(0.3, 0.5), ft: 0.12, q: rnd(0.7, 1.4), pk: rnd(0.3, 0.45), a: 0.003, d: rnd(0.08, 0.15), buf: pink });
      tn(v, t, { f: rnd(140, 200) * p, f2: rnd(80, 110) * p, ft: 0.06, pk: 0.2, a: 0.003, d: 0.07 });
      if (Math.random() < 0.6) tn(v, t + rnd(0.02, 0.05), { f: rnd(250, 350) * p, f2: rnd(500, 700) * p, ft: 0.04, pk: 0.06, d: 0.05 });
    },
    squeak(v, t, p) {
      const s = ctx.createOscillator(); s.type = 'triangle';
      const f = rnd(880, 980) * p;
      s.frequency.setValueAtTime(f, t);
      s.frequency.linearRampToValueAtTime(f * 1.4, t + 0.05);
      s.frequency.linearRampToValueAtTime(f * 1.22, t + 0.13);
      const lp = filt('lowpass', 2400, 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.setValueAtTime(0.08, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      s.connect(lp); lp.connect(g); g.connect(v.input); v.nodes.push(lp, g);
      addSrc(v, s, t, t + 0.17);
    },
    chime(v, t, p) {
      const ns = [84, 88, 91];
      ns.forEach((m, i) => bell(v, t + i * 0.09, mtof(m) * p, 0.17 - i * 0.02, 1.0 + i * 0.2));
      bell(v, t + 0.3, mtof(96) * p, 0.06, 1.2);
    },
    note(v, t, p, idx) {
      const i = ((Math.floor(num(idx, 0)) % 10) + 10) % 10;
      const f = mtof(pentaMidi(72, i)) * p;
      tn(v, t, { f, pk: 0.26, a: 0.003, d: 0.7 });
      tn(v, t, { f: f * 3.93, pk: 0.05, a: 0.002, d: 0.12 });
      tn(v, t, { f: f * 2, pk: 0.04, a: 0.003, d: 0.3 });
    },
    slideIn(v, t, p) {
      nz(v, t, { f: 500 * p, f2: 1500 * p, ft: 0.18, q: 1.2, pk: 0.22, a: 0.14, d: 0.04, buf: pink });
      tn(v, t + 0.17, { f: 130 * p, f2: 80 * p, ft: 0.05, pk: 0.22, a: 0.003, d: 0.07 });
      nz(v, t + 0.17, { type: 'lowpass', f: 700, pk: 0.07, d: 0.04 });
    },
    slideOut(v, t, p) {
      nz(v, t, { f: 1500 * p, f2: 450 * p, ft: 0.26, q: 1.2, pk: 0.22, a: 0.02, d: 0.25, buf: pink });
    },
    boing(v, t, p) {
      nz(v, t, { type: 'lowpass', f: 350 * p, f2: 200, q: 0.8, pk: 0.3, a: 0.012, d: 0.13, buf: pink });
      tn(v, t, { f: 125 * p, f2: 92 * p, ft: 0.1, pk: 0.16, a: 0.01, d: 0.1 });
    },
    lighterClick(v, t) {
      nz(v, t, { type: 'highpass', f: 3500, q: 0.7, pk: 0.22, a: 0.0005, d: 0.008 });
      nz(v, t, { f: 2600, q: 6, pk: 0.4, a: 0.0005, d: 0.018 });
      nz(v, t + 0.022, { type: 'highpass', f: 4000, q: 0.7, pk: 0.08, a: 0.0005, d: 0.006 });
    },
    flameOn(v, t, p) {
      const f = nz(v, t, { type: 'lowpass', f: 220 * p, q: 0.9, pk: 0.32, a: 0.035, d: 0.38, buf: pink });
      f.frequency.setValueAtTime(220 * p, t);
      f.frequency.exponentialRampToValueAtTime(950 * p, t + 0.05);
      f.frequency.exponentialRampToValueAtTime(380 * p, t + 0.35);
      tn(v, t, { f: 75, f2: 60, ft: 0.2, pk: 0.08, a: 0.03, d: 0.25 });
    },
    candleLit(v, t, p, idx) {
      nz(v, t, { f: 1600, q: 2, pk: 0.14, a: 0.001, d: 0.012 });
      nz(v, t + 0.005, { type: 'lowpass', f: 600, pk: 0.06, a: 0.01, d: 0.12, buf: pink });
      const i = Math.max(0, Math.floor(num(idx, 0)));
      const f = mtof(pentaMidi(79, i % 10)) * p;
      tn(v, t + 0.03, { f, pk: 0.05, a: 0.004, d: 0.55 });
      tn(v, t + 0.03, { f: f * 2.76, pk: 0.012, a: 0.002, d: 0.15 });
    },
    roomDim(v, t, p) {
      nz(v, t, { f: 2200 * p, f2: 380 * p, ft: 1.3, q: 0.7, pk: 0.12, a: 0.25, hold: 0.2, d: 1.0, buf: pink });
      tn(v, t, { f: 523 * p, f2: 392 * p, ft: 1.2, lin: true, pk: 0.018, a: 0.3, d: 1.0 });
    },
    switchOn(v, t, p) {
      nz(v, t, { type: 'highpass', f: 2200, q: 0.7, pk: 0.18, a: 0.0005, d: 0.007 });
      nz(v, t, { f: 1300, q: 4, pk: 0.3, a: 0.0005, d: 0.025 });
      tn(v, t + 0.02, { f: 1318 * p, pk: 0.02, a: 0.3, d: 0.6 });
      tn(v, t + 0.02, { f: 1976 * p, pk: 0.012, a: 0.35, d: 0.55 });
      nz(v, t + 0.02, { type: 'highpass', f: 3500, q: 0.5, pk: 0.015, a: 0.3, d: 0.5, buf: pink });
    },
    door(v, t, p) {
      // whole sound is muffled (next room) via voice low-pass
      nz(v, t, { f: 1800, q: 3, pk: 0.4, a: 0.001, d: 0.03 });
      nz(v, t + 0.05, { f: 1200, q: 2.5, pk: 0.2, a: 0.001, d: 0.03 });
      nz(v, t + 0.1, { f: 400, q: 0.8, pk: 0.05, a: 0.25, d: 0.45, buf: pink }); // air movement
      const c = t + 1.0;
      tn(v, c, { f: 78 * p, f2: 48 * p, ft: 0.15, pk: 0.55, a: 0.004, d: 0.28 });
      nz(v, c, { type: 'lowpass', f: 350, q: 0.8, pk: 0.4, a: 0.003, d: 0.22, buf: pink });
      nz(v, c + 0.03, { f: 1500, q: 3, pk: 0.3, a: 0.001, d: 0.03 });
    },
    footstep(v, t, p) {
      const k = rnd(0.85, 1.15) * p;
      nz(v, t, { type: 'lowpass', f: 450 * k, q: 0.8, pk: rnd(0.25, 0.35), a: 0.008, d: rnd(0.07, 0.11), buf: pink });
      tn(v, t, { f: 95 * k, f2: 70 * k, ft: 0.05, pk: 0.2, a: 0.005, d: 0.07 });
      nz(v, t + rnd(0.01, 0.04), { f: rnd(1500, 2500), q: 1, pk: 0.03, a: 0.01, d: 0.05, buf: pink });
      if (Math.random() < 0.25) tn(v, t + 0.02, { type: 'triangle', f: rnd(300, 380), f2: rnd(330, 420), ft: 0.08, pk: 0.015, a: 0.02, d: 0.08 });
    },
    clap(v, t, p) {
      const f = rnd(950, 1400) * p;
      const q = rnd(0.9, 1.5);
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      let tt = t;
      for (let i = 0; i < n; i++) {
        nz(v, tt, { f, q, pk: rnd(0.2, 0.3), a: 0.0015, d: 0.012 });
        tt += rnd(0.006, 0.011);
      }
      nz(v, tt, { f: f * rnd(0.9, 1.05), q, pk: rnd(0.35, 0.45), a: 0.0015, d: rnd(0.07, 0.11) });
      nz(v, t, { type: 'lowpass', f: rnd(450, 650), q: 0.8, pk: 0.18, a: 0.002, d: 0.05 });
    },
    blow(v, t, p) {
      const f = nz(v, t, { f: 1100 * p, q: 0.6, pk: 0.36, a: 0.04, d: 0.68, buf: white });
      f.frequency.setValueAtTime(1300 * p, t);
      f.frequency.exponentialRampToValueAtTime(700 * p, t + 0.7);
      nz(v, t, { type: 'lowpass', f: 320, q: 0.6, pk: 0.22, a: 0.03, d: 0.6, buf: pink });
      nz(v, t, { type: 'highpass', f: 3500, q: 0.5, pk: 0.04, a: 0.03, d: 0.35 });
    },
    pop(v, t, p) {
      nz(v, t, { f: 1700 * p, q: 0.7, pk: 0.5, a: 0.0015, d: 0.07 });
      nz(v, t, { type: 'lowpass', f: 900, q: 0.7, pk: 0.3, a: 0.0015, d: 0.05 });
      tn(v, t, { f: 170 * p, f2: 80 * p, ft: 0.07, pk: 0.3, a: 0.002, d: 0.09 });
      for (let i = 0; i < 18; i++) {
        const tt = t + 0.05 + Math.pow(i / 18, 1.3) * 0.7 + rnd(0, 0.03);
        nz(v, tt, { f: rnd(2500, 6000), q: rnd(1, 2.5), pk: 0.09 * (1 - i / 22), a: 0.002, d: rnd(0.01, 0.03) });
      }
    },
    rustle(v, t, p) {
      for (let i = 0; i < 26; i++) {
        const tt = t + Math.pow(Math.random(), 1.4) * 0.8;
        const age = (tt - t) / 0.8;
        nz(v, tt, { f: rnd(2200, 6500) * p, q: rnd(1, 2.5), pk: rnd(0.04, 0.09) * (1 - 0.6 * age), a: 0.003, d: rnd(0.012, 0.04) });
      }
      nz(v, t, { type: 'highpass', f: 2500, q: 0.5, pk: 0.02, a: 0.1, d: 0.6, buf: pink });
    },
    shutter(v, t, p) {
      nz(v, t, { f: 2600 * p, q: 2, pk: 0.3, a: 0.0008, d: 0.012 });
      nz(v, t + 0.004, { type: 'lowpass', f: 900, pk: 0.12, a: 0.001, d: 0.02 });
      nz(v, t + 0.015, { type: 'highpass', f: 4500, q: 0.5, pk: 0.02, a: 0.01, d: 0.04 });
      nz(v, t + 0.075, { f: 1700 * p, q: 2, pk: 0.26, a: 0.0008, d: 0.016 });
      nz(v, t + 0.078, { type: 'lowpass', f: 700, pk: 0.1, a: 0.001, d: 0.025 });
    },
    frameHop(v, t, p) {
      const k = rnd(0.94, 1.06) * p;
      tn(v, t, { f: 820 * k, f2: 760 * k, ft: 0.04, pk: 0.16, a: 0.001, d: 0.05 });
      tn(v, t, { f: 1980 * k, pk: 0.03, a: 0.001, d: 0.025 });
      nz(v, t, { f: 1200 * k, q: 4, pk: 0.35, a: 0.001, d: 0.04 });
      tn(v, t, { f: 180 * k, f2: 120 * k, ft: 0.04, pk: 0.1, a: 0.002, d: 0.05 });
    },
    turntable(v, t, p) {
      const f = nz(v, t, { f: 500 * p, q: 1.8, pk: 0.16, a: 0.35, hold: 0.6, d: 0.55, buf: pink });
      f.frequency.setValueAtTime(450 * p, t);
      f.frequency.linearRampToValueAtTime(950 * p, t + 0.7);
      f.frequency.linearRampToValueAtTime(550 * p, t + 1.5);
      nz(v, t, { type: 'lowpass', f: 200, q: 0.8, pk: 0.12, a: 0.3, hold: 0.6, d: 0.55, buf: brown });
    },
    hint(v, t, p, idx) {
      const i = clamp(Math.floor(num(idx, 0)), 0, 2);
      const f = 784 * p * (1 + 0.06 * i);
      tn(v, t, { f, pk: 0.12, a: 0.012, d: 0.55 });
      tn(v, t, { f: f * 2, pk: 0.015 + 0.015 * i, a: 0.01, d: 0.3 });
      if (i > 0) tn(v, t, { f: f * 3, pk: 0.006 * i, a: 0.01, d: 0.18 });
    },
    sizzle(v, t, p) {
      nz(v, t, { type: 'highpass', f: 5000, q: 0.6, pk: 0.05, a: 0.001, d: 0.006 });
      tn(v, t, { f: rnd(2200, 2800) * p, pk: 0.025, a: 0.001, d: 0.03 });
    },
  };
  const VOICE_LP = { door: 900, footstep: 1400 };

  // ---------------------------------------------------------------- public API
  const A = {};

  A.unlock = safe(function () {
    if (dead) return;
    if (!ctx) {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) { dead = true; return; }
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        try { ctx = new AC(); } catch (e2) { ctx = null; }
      }
      if (!ctx) { dead = true; return; }
      try {
        makeBuffers();
        buildMaster();
        buildContinuous();
        applyAll();
      } catch (e) {
        dead = true; try { ctx.close(); } catch (e2) {} ctx = null; return;
      }
      unlocked = true;
      timer = setInterval(tick, 40);
    }
    // iOS: play a silent buffer inside the gesture and resume
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      s.onended = () => { try { s.disconnect(); } catch (e) {} };
    } catch (e) {}
    if (!hidden && ctx.state !== 'running') {
      try { const pr = ctx.resume(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
    }
    if (want.music && !mus.bus) musicBegin();
  });

  A.suspend = safe(function () {
    hidden = true;
    if (!live()) return;
    try { const pr = ctx.suspend(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
  });

  A.resume = safe(function () {
    hidden = false;
    if (!live() || !unlocked) return;
    const after = () => {
      try {
        applyAll();
        if (cont) cont.pr.next = 0;
        if (want.music && mus.bus) {
          // re-anchor to the audio clock if the scheduler fell behind
          const now = ctx.currentTime;
          if (mus.idx < EVENTS.length && mus.start + EVENTS[mus.idx].b * SPB < now) {
            mus.start = now + 0.1 - EVENTS[mus.idx].b * SPB;
          }
        }
      } catch (e) {}
    };
    try {
      const pr = ctx.resume();
      if (pr && pr.then) pr.then(after, () => {}); else after();
    } catch (e) {}
    after();
  });

  A.play = safe(function (name, opts) {
    if (!running()) return;
    const fn = Object.prototype.hasOwnProperty.call(SHOTS, name) ? SHOTS[name] : null;
    if (!fn) return;
    const o = opts || {};
    const p = clamp(num(o.pitch, 1), 0.25, 4);
    const vol = clamp(num(o.vol, 1), 0, 2);
    if (vol <= 0) return;
    const v = newVoice(vol, VOICE_LP[name]);
    const t = ctx.currentTime + 0.005;
    try { fn(v, t, p, o.index); } catch (e) {}
    if (v.srcs === 0) cleanVoice(v);
  });

  A.mixer = {
    set: safe(function (s) {
      if (!s || typeof s !== 'object') return;
      const m = want.mixer;
      if ('on' in s) m.on = !!s.on;
      if ('speed' in s) m.speed = clamp(num(s.speed, m.speed));
      if ('load' in s) m.load = clamp(num(s.load, m.load));
      if ('inCream' in s) m.inCream = !!s.inCream;
      if (live()) applyMixer(false);
    }),
  };
  A.pour = { set: safe(function (on) { want.pour = !!on; if (live()) applyPour(); }) };
  A.spread = { set: safe(function (v) { want.spread = clamp(num(v, 0)); if (live()) applySpread(false); }) };
  A.slide = { set: safe(function (v) { want.slide = clamp(num(v, 0)); if (live()) applySlide(false); }) };
  A.ambience = { set: safe(function (v) { want.ambience = clamp(num(v, 0)); if (live()) applyAmb(false); }) };

  A.music = {
    start: safe(function () {
      if (want.music && mus.bus) return;
      want.music = true;
      if (live()) musicBegin();
    }),
    stop: safe(function (fadeSeconds) {
      want.music = false;
      if (live()) musicEnd(fadeSeconds);
    }),
  };
  Object.defineProperty(A.music, 'playing', { get: () => want.music, enumerable: true });

  // constants useful to the integrator
  A.musicInfo = { songSeconds: SONG_LEN, loopSeconds: LOOP_LEN, lastPhraseAt: 19 * SPB, lastNoteAt: 23 * SPB };

  return A;
}
