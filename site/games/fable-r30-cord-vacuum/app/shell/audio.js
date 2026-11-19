// WebAudio の効果音。音声ファイルは使わず、その場で合成する。
// 単発: tick click clack boing pop rattle thunk whoosh sparkle fanfare boop
// ループ: whirr suck brush pour（hero が毎フレーム level を渡す。来なくなったら自動で消える）
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});

  let ctx = null;
  let out = null; // master gain
  let noise = null; // 1秒の白色ノイズ
  let crackle = null; // ざらざら用のまばらなパルス
  let enabled = true;
  const loops = Object.create(null);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function makeBuffer(seconds, fill) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    fill(buf.getChannelData(0), ctx.sampleRate);
    return buf;
  }

  // 最初のタッチで呼ぶ（iOS は利用者の操作の中でないと音が出ない）。
  function unlock() {
    if (!enabled) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { enabled = false; return; }
        ctx = new AC({ latencyHint: 'interactive' });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        out = ctx.createGain();
        out.gain.value = 0.8;
        out.connect(comp);
        comp.connect(ctx.destination);
        noise = makeBuffer(1, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
        crackle = makeBuffer(1, (d, sr) => {
          let env = 0;
          for (let i = 0; i < d.length; i++) {
            if (Math.random() < 260 / sr) env = 0.4 + Math.random() * 0.6;
            env *= 0.993;
            d[i] = (Math.random() * 2 - 1) * env;
          }
        });
        // 無音を1回鳴らして iOS のロックを外す
        const b = ctx.createBufferSource();
        b.buffer = ctx.createBuffer(1, 1, 22050);
        b.connect(ctx.destination);
        b.start(0);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      enabled = false;
      S.reportError && S.reportError(e);
    }
  }

  function ready() { return !!(ctx && ctx.state === 'running'); }

  function panner(pan, dest) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan || 0, -1, 1);
      p.connect(dest);
      return p;
    }
    return dest;
  }

  // 音色の部品
  function tone(dest, t, type, f0, f1, dur, gain, attack) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + (attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function burst(dest, t, filterType, freq, q, dur, gain, buffer) {
    const s = ctx.createBufferSource();
    s.buffer = buffer || noise;
    s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    const off = Math.random() * 0.5;
    s.start(t, off, dur + 0.02);
  }

  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

  const ONE_SHOTS = {
    tick(d, t, r) { burst(d, t, 'highpass', 2600 * r, 0.7, 0.025, 0.35); tone(d, t, 'square', 1900 * r, 1500 * r, 0.02, 0.05); },
    click(d, t, r) { tone(d, t, 'triangle', 1300 * r, 600 * r, 0.05, 0.35); burst(d, t, 'bandpass', 3000 * r, 1.2, 0.02, 0.4); },
    clack(d, t, r) {
      tone(d, t, 'triangle', 900 * r, 420 * r, 0.06, 0.4);
      burst(d, t, 'bandpass', 2200 * r, 1, 0.03, 0.5);
      tone(d, t + 0.05, 'sine', 160 * r, 80 * r, 0.12, 0.45);
    },
    boing(d, t, r) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(260 * r, t);
      o.frequency.exponentialRampToValueAtTime(170 * r, t + 0.5);
      lfo.frequency.value = 14;
      lg.gain.setValueAtTime(60 * r, t);
      lg.gain.exponentialRampToValueAtTime(1, t + 0.5);
      lfo.connect(lg);
      lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g);
      g.connect(d);
      o.start(t); lfo.start(t);
      o.stop(t + 0.6); lfo.stop(t + 0.6);
    },
    pop(d, t, r) { tone(d, t, 'sine', 720 * r, 260 * r, 0.09, 0.4); },
    rattle(d, t, r) {
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) burst(d, t + Math.random() * 0.22, 'bandpass', (2400 + Math.random() * 1800) * r, 3, 0.02, 0.18 + Math.random() * 0.15);
    },
    thunk(d, t, r) { tone(d, t, 'sine', 150 * r, 70 * r, 0.16, 0.6); burst(d, t, 'lowpass', 600 * r, 0.7, 0.06, 0.4); },
    whoosh(d, t, r) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(350 * r, t);
      f.frequency.exponentialRampToValueAtTime(1800 * r, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      s.connect(f); f.connect(g); g.connect(d);
      s.start(t, 0, 0.5);
    },
    sparkle(d, t, r) {
      for (let i = 0; i < 6; i++) {
        const f = PENTA[3 + Math.floor(Math.random() * 6)] * 2 * r;
        tone(d, t + i * 0.07, 'sine', f, f, 0.35, 0.12);
      }
    },
    fanfare(d, t, r) {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => { tone(d, t + i * 0.13, 'triangle', f * r, f * r, 0.32, 0.22); });
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(d, t + 0.6, 'triangle', f * r, f * r, 1.0, 0.13, 0.02));
      for (let i = 0; i < 5; i++) tone(d, t + 0.62 + i * 0.09, 'sine', PENTA[4 + i] * 2 * r, PENTA[4 + i] * 2 * r, 0.3, 0.06);
    },
    boop(d, t, r) { tone(d, t, 'sine', 440 * r, 520 * r, 0.12, 0.25, 0.01); },
  };

  function play(id, params) {
    if (!ready()) return;
    const fn = ONE_SHOTS[id];
    if (!fn) return;
    const p = params || {};
    const gain = clamp(p.gain == null ? 1 : p.gain, 0, 1);
    if (gain <= 0.001) return;
    const rate = clamp(p.rate == null ? 1 : p.rate, 0.5, 2);
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(out);
    const dest = panner(p.pan, g);
    try { fn(dest, ctx.currentTime + 0.005, rate); } catch (e) { S.reportError && S.reportError(e); }
    setTimeout(() => { try { g.disconnect(); } catch (_) { /* 既に切断済み */ } }, 2500);
  }

  // ループ音の組み立て。{ gain, setRate(r), stop() }
  const LOOP_BUILDERS = {
    whirr(dest) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const n = ctx.createBufferSource();
      n.buffer = noise; n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 2;
      const ng = ctx.createGain(); ng.gain.value = 0.5;
      const og = ctx.createGain(); og.gain.value = 0.18;
      o.connect(lp); lp.connect(og); og.connect(dest);
      n.connect(bp); bp.connect(ng); ng.connect(dest);
      o.start(); n.start();
      return {
        setRate(r, t) { o.frequency.setTargetAtTime(70 + 110 * r, t, 0.05); bp.frequency.setTargetAtTime(1200 + 1600 * r, t, 0.05); },
        stop() { o.stop(); n.stop(); },
      };
    },
    suck(dest) {
      const n = ctx.createBufferSource();
      n.buffer = noise; n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 0.8;
      const hum = ctx.createOscillator();
      hum.type = 'triangle';
      const hg = ctx.createGain(); hg.gain.value = 0.12;
      const ng = ctx.createGain(); ng.gain.value = 0.55;
      n.connect(bp); bp.connect(ng); ng.connect(dest);
      hum.connect(hg); hg.connect(dest);
      n.start(); hum.start();
      return {
        setRate(r, t) { bp.frequency.setTargetAtTime(700 + 900 * r, t, 0.08); hum.frequency.setTargetAtTime(110 + 60 * r, t, 0.08); },
        stop() { n.stop(); hum.stop(); },
      };
    },
    brush(dest) {
      const n = ctx.createBufferSource();
      n.buffer = noise; n.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2800;
      const am = ctx.createGain(); am.gain.value = 0.25;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain(); lg.gain.value = 0.2;
      lfo.connect(lg); lg.connect(am.gain);
      n.connect(hp); hp.connect(am); am.connect(dest);
      n.start(); lfo.start();
      return {
        setRate(r, t) { lfo.frequency.setTargetAtTime(6 + 20 * r, t, 0.05); },
        stop() { n.stop(); lfo.stop(); },
      };
    },
    pour(dest) {
      const s = ctx.createBufferSource();
      s.buffer = crackle; s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.9;
      const g = ctx.createGain(); g.gain.value = 1.1;
      s.connect(bp); bp.connect(g); g.connect(dest);
      s.start();
      return {
        setRate(r, t) { s.playbackRate.setTargetAtTime(0.6 + 0.8 * r, t, 0.05); },
        stop() { s.stop(); },
      };
    },
  };

  function loop(id, level, rate) {
    if (!LOOP_BUILDERS[id]) return;
    let L = loops[id];
    if (!L) L = loops[id] = { node: null, gain: null, level: 0, rate: 1, lastSet: 0, silentFor: 0 };
    L.level = clamp(+level || 0, 0, 1);
    L.rate = clamp(rate == null ? 1 : +rate || 1, 0.5, 2);
    L.lastSet = performance.now();
  }

  // 毎フレーム（シェルから）
  function update() {
    if (!ready()) return;
    const now = performance.now();
    const t = ctx.currentTime;
    for (const id in loops) {
      const L = loops[id];
      // 0.2秒 呼ばれなければ止める
      const target = now - L.lastSet > 200 ? 0 : L.level;
      if (target > 0.001 && !L.node) {
        L.gain = ctx.createGain();
        L.gain.gain.value = 0.0001;
        L.gain.connect(out);
        L.node = LOOP_BUILDERS[id](L.gain);
      }
      if (!L.node) continue;
      L.gain.gain.setTargetAtTime(target * 0.6, t, 0.06);
      L.node.setRate((L.rate - 0.5) / 1.5, t);
      L.silentFor = target > 0.001 ? 0 : L.silentFor + 1;
      if (L.silentFor > 90) {
        try { L.node.stop(); L.gain.disconnect(); } catch (_) { /* 停止済み */ }
        L.node = null; L.gain = null; L.silentFor = 0;
      }
    }
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  S.audio = {
    unlock, play, loop, update, suspend, resume, ready,
    ONE_SHOT_IDS: Object.keys(ONE_SHOTS), LOOP_IDS: Object.keys(LOOP_BUILDERS),
    get state() { return ctx ? ctx.state : 'none'; },
  };
})();
