// WebAudio sound effects, synthesised (no files). Names: docs/HERO-SPEC.md §5.
(function (C) {
  'use strict';
  C.createAudio = function (opts) {
    let ctx = null, master = null, noise = null;
    const last = Object.create(null);
    let voices = 0;
    const muted = !!(opts && opts.muted);

    function ensure() {
      if (ctx || muted) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0.7;
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      return ctx;
    }

    // must be called from a user gesture (iOS)
    function unlock() {
      if (!ensure() || ctx.state === 'running') return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(master); b.start(0);
    }

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
    });

    // --- building blocks
    function out(gain, pan) {
      const g = ctx.createGain(); g.gain.value = gain;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); }
      else g.connect(master);
      return g;
    }
    function env(param, t, a, peak, d) { // attack, exponential decay
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      param.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function tone(dest, type, f0, f1, t, a, peak, d) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
      env(g.gain, t, a, peak, d);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + a + d + 0.05);
      voices++; o.onended = () => { voices--; };
    }
    function hiss(dest, filterType, f0, f1, q, t, a, peak, d) {
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
      const g = ctx.createGain(); env(g.gain, t, a, peak, d);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05);
      voices++; s.onended = () => { voices--; };
      return g;
    }
    const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

    const RECIPES = {
      tick(o, t, k) { tone(o, 'triangle', 2400 * k, 1800 * k, t, 0.002, 0.25, 0.03); hiss(o, 'highpass', 5000, 0, 1, t, 0.001, 0.12, 0.02); },
      clack(o, t, k) { tone(o, 'triangle', 900 * k, 420 * k, t, 0.003, 0.5, 0.09); hiss(o, 'bandpass', 2200, 1200, 2, t, 0.002, 0.4, 0.06); },
      connect(o, t, k) {
        [72, 79, 84].forEach((n, i) => { tone(o, 'sine', NOTE(n) * k, 0, t + i * 0.11, 0.005, 0.32, 0.7); tone(o, 'sine', NOTE(n + 12) * k, 0, t + i * 0.11, 0.005, 0.08, 0.35); });
      },
      door(o, t, k) {
        const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = 170 * k; lfo.frequency.value = 23; lg.gain.value = 40;
        lfo.connect(lg); lg.connect(osc.frequency); f.type = 'lowpass'; f.frequency.value = 1100;
        env(g.gain, t, 0.04, 0.12, 0.42); osc.connect(f); f.connect(g); g.connect(o);
        osc.start(t); lfo.start(t); osc.stop(t + 0.55); lfo.stop(t + 0.55); voices++; osc.onended = () => { voices--; };
      },
      roll(o, t, k, p) {
        const dur = Math.max(0.2, Math.min(4, p.dur || 1));
        const g = hiss(o, 'bandpass', 380 * k, 300 * k, 1.5, t, 0.08, 0.35, dur);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 16; lg.gain.value = 0.15;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + dur + 0.1);
      },
      hop(o, t, k) { tone(o, 'sine', 330 * k, 720 * k, t, 0.005, 0.35, 0.13); },
      chain(o, t, k, p) { // drawbridge chain running out: a quick rattle of clicks that slows down
        const dur = Math.max(0.2, Math.min(1.5, p.dur || 0.5));
        let dt = 0;
        for (let i = 0; dt < dur; i++) {
          hiss(o, 'bandpass', (3200 - 900 * dt / dur) * k, 0, 6, t + dt, 0.001, 0.22, 0.022);
          dt += 0.028 + 0.03 * (dt / dur);
        }
        tone(o, 'triangle', 180 * k, 110 * k, t + dur, 0.004, 0.35, 0.12); // the bridge lands
      },
      lift(o, t, k) { tone(o, 'triangle', 220 * k, 520 * k, t, 0.1, 0.18, 0.9); tone(o, 'sine', 440 * k, 1040 * k, t, 0.1, 0.06, 0.9); },
      open(o, t, k) { [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(o, 'sine', NOTE(n) * k, 0, t + i * 0.07, 0.004, 0.22, 0.5)); hiss(o, 'highpass', 3000, 8000, 0.7, t, 0.3, 0.06, 0.6); },
      flag(o, t, k) { hiss(o, 'bandpass', 300 * k, 2200 * k, 1.2, t, 0.15, 0.35, 0.45); tone(o, 'triangle', NOTE(79) * k, 0, t + 0.45, 0.005, 0.2, 0.4); },
      fanfare(o, t, k) {
        const seq = [[67, 0, 0.16], [72, 0.17, 0.16], [76, 0.34, 0.16], [79, 0.51, 0.45], [76, 0.98, 0.14], [79, 1.13, 0.9]];
        seq.forEach(([n, dt, d]) => {
          tone(o, 'square', NOTE(n) * k, 0, t + dt, 0.015, 0.07, d + 0.25);
          tone(o, 'triangle', NOTE(n) * k, 0, t + dt, 0.01, 0.25, d + 0.3);
          tone(o, 'sine', NOTE(n - 12) * k, 0, t + dt, 0.01, 0.12, d + 0.3);
        });
      },
      sparkle(o, t, k) { for (let i = 0; i < 7; i++) tone(o, 'sine', (1600 + Math.random() * 1800) * k, 0, t + i * 0.07 + Math.random() * 0.03, 0.003, 0.12, 0.25); },
      wiggle(o, t, k) {
        const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 420 * k; lfo.frequency.value = 18; lg.gain.value = 45;
        lfo.connect(lg); lg.connect(osc.frequency); env(g.gain, t, 0.01, 0.25, 0.28); osc.connect(g); g.connect(o);
        osc.start(t); lfo.start(t); osc.stop(t + 0.35); lfo.stop(t + 0.35); voices++; osc.onended = () => { voices--; };
      },
      reset(o, t, k) { [84, 79, 76, 72, 67, 60].forEach((n, i) => tone(o, 'sine', NOTE(n) * k, 0, t + i * 0.08, 0.004, 0.2, 0.4)); },
      hint(o, t, k) { tone(o, 'sine', 880 * k, 0, t, 0.01, 0.16, 1.0); tone(o, 'sine', 1320 * k, 0, t, 0.01, 0.05, 0.6); },
    };

    function play(name, params) {
      const p = params || {};
      const rec = RECIPES[name];
      if (!rec || !ensure() || ctx.state !== 'running') return;
      if (voices > 48) return;
      const now = ctx.currentTime;
      if (last[name] !== undefined && now - last[name] < 0.04) return;
      last[name] = now;
      const gain = Math.max(0, Math.min(1, p.gain === undefined ? 1 : +p.gain || 0));
      const k = Math.pow(2, Math.max(-12, Math.min(12, +p.pitch || 0)) / 12);
      try { rec(out(gain, +p.pan || 0), now + 0.005, k, p); } catch (e) { C.reportError && C.reportError(e); }
    }

    return { unlock, play, names: Object.keys(RECIPES), get state() { return ctx ? ctx.state : 'none'; } };
  };
})(window.Castle = window.Castle || {});
