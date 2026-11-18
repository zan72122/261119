/* audio.js — every sound of the game, synthesised with the Web Audio API (no files, no external loads).
   GF.createAudio() -> { unlock, suspend, resume, play, dryer, brush, musicBox, ambience, update }
   If Web Audio is missing or refused every method is a silent no-op. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var noop = function () {};

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { v = +v; if (v !== v) v = a; return v < a ? a : (v > b ? b : v); }

  // ---------------------------------------------------------------- shared noise buffers (built once per context)
  function makeBuffers(ctx) {
    var sr = ctx.sampleRate, N = Math.floor(sr * 4), F = Math.floor(sr * 0.08);
    function seamless(gen, len) {      // generate len+F samples, crossfade the tail into the head -> clickless loop
      var x = new Float32Array(len + F), i, mean = 0, peak = 0;
      gen(x);
      for (i = 0; i < len + F; i++) mean += x[i];
      mean /= (len + F);
      var b = ctx.createBuffer(1, len, sr), y = b.getChannelData(0);
      for (i = 0; i < len; i++) y[i] = x[i] - mean;
      for (i = 0; i < F; i++) { var w = i / F; y[i] = (x[i] - mean) * w + (x[len + i] - mean) * (1 - w); }
      for (i = 0; i < len; i++) { var a = Math.abs(y[i]); if (a > peak) peak = a; }
      if (peak > 0) for (i = 0; i < len; i++) y[i] *= 0.9 / peak;
      return b;
    }
    var white = seamless(function (x) { for (var i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; }, N);
    var pink = seamless(function (x) {
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (var i = 0; i < x.length; i++) {
        var w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
    }, N);
    var brown = seamless(function (x) {
      var v = 0;
      for (var i = 0; i < x.length; i++) { v = v * 0.996 + (Math.random() * 2 - 1) * 0.06; x[i] = v; }
    }, N);
    // slow random 'grain' control signal (−1..1, new value every 6–22 ms, lightly smoothed) for bristle / rustle texture
    var grain = seamless(function (x) {
      var i = 0, cur = 0, tgt = 0, left = 0;
      for (; i < x.length; i++) {
        if (left-- <= 0) { left = Math.floor(sr * (0.006 + Math.random() * 0.016)); tgt = Math.random() * 2 - 1; tgt = tgt * Math.abs(tgt); }
        cur += (tgt - cur) * 0.02; x[i] = cur;
      }
    }, Math.floor(sr * 2));
    return { white: white, pink: pink, brown: brown, grain: grain };
  }

  // ---------------------------------------------------------------- the music-box tune (original), 3/4, 12 bars
  // [beat, midi, velocity]; melody, plus bass on beat 1 and a soft chord dyad on beats 2 and 3
  var BEAT = 0.6, TUNE_BEATS = 36;
  var TUNE = (function () {
    var mel = [
      [84, 1], [79, 1], [76, 1],
      [77, 1], [81, 1], [79, 1],
      [76, 1], [79, 0.5], [77, 0.5], [76, 1],
      [74, 2], [79, 1],
      [84, 1], [79, 1], [76, 1],
      [81, 1], [84, 1], [83, 0.5], [81, 0.5],
      [79, 1], [77, 0.5], [76, 0.5], [74, 1],
      [76, 1], [74, 1], [79, 1],
      [81, 1.5], [79, 0.5], [77, 1],
      [76, 1], [79, 1], [84, 1],
      [86, 1], [83, 0.5], [81, 0.5], [79, 1],
      [76, 0.5], [74, 0.5], [72, 2]
    ];
    // per bar: bass root, chord dyad
    var bars = [
      [60, [64, 67]], [65, [69, 72]], [60, [64, 67]], [55, [65, 71]],
      [60, [64, 67]], [65, [69, 72]], [55, [62, 65]], [55, [62, 67]],
      [65, [69, 72]], [60, [64, 67]], [55, [62, 65]], [60, [64, 67]]
    ];
    var ev = [], b = 0, i;
    for (i = 0; i < mel.length; i++) {
      var vel = (Math.abs(b % 3) < 1e-6) ? 1 : 0.82;
      ev.push([b, mel[i][0], vel, 0]); b += mel[i][1];
    }
    for (i = 0; i < bars.length; i++) {
      ev.push([i * 3, bars[i][0], 0.75, 1]);
      ev.push([i * 3 + 1, bars[i][1][0], 0.32, 1]); ev.push([i * 3 + 1, bars[i][1][1], 0.28, 1]);
      ev.push([i * 3 + 2, bars[i][1][0], 0.28, 1]); ev.push([i * 3 + 2, bars[i][1][1], 0.24, 1]);
    }
    ev.sort(function (p, q) { return p[0] - q[0]; });
    return ev;
  })();

  // ---------------------------------------------------------------- the synthesis library (works on any (Offline)AudioContext)
  function makeLib(ctx, B) {
    function gain(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
    function filt(type, f, q, dest) {
      var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q;
      if (dest) b.connect(dest); return b;
    }
    // attack (linear) then exponential decay to silence; returns end time
    function env(p, t, a, peak, len) {
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
      p.exponentialRampToValueAtTime(Math.max(peak * 1e-4, 1e-7), t + a + len);
      return t + a + len;
    }
    // swell: 0 -> peak (over a, curved) -> hold -> 0 (over r); linear segments only (for noises)
    function swell(p, t, a, peak, hold, r) {
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak * 0.35, t + a * 0.4);
      p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + a + hold);
      p.linearRampToValueAtTime(peak * 0.25, t + a + hold + r * 0.5); p.linearRampToValueAtTime(0, t + a + hold + r);
      return t + a + hold + r;
    }
    function osc(type, f, t, end, dest) {
      var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      o.connect(dest); o.start(t); o.stop(end + 0.03); return o;
    }
    function tone(dest, type, f, t, a, peak, len, f2, gT) {
      var g = gain(0, dest), end = env(g.gain, t, a, peak, len), o = osc(type, f, t, end, g);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + (gT || len));
      return end;
    }
    function nsrc(buf, t, end, dest) {
      var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest);
      s.start(t, Math.random() * (buf.duration - 0.6)); s.stop(end + 0.03); return s;
    }
    function burst(dest, buf, type, f, q, t, a, peak, len, f2, gT) {
      var g = gain(0, dest), fl = filt(type, f, q, g), end = env(g.gain, t, a, peak, len);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + (gT || len));
      nsrc(buf, t, end, fl); return end;
    }
    // bell / celesta / music-box tine: parts = [[ratio, amp, decayScale], ...]
    function bell(dest, f, t, peak, dec, parts) {
      var end = t, i;
      for (i = 0; i < parts.length; i++) {
        var fr = f * parts[i][0]; if (fr > 9000) continue;
        var e = tone(dest, 'sine', fr, t, 0.003, peak * parts[i][1], dec * parts[i][2]);
        if (e > end) end = e;
      }
      return end;
    }
    var CELESTA = [[1, 1, 1], [2, 0.16, 0.45], [3.01, 0.05, 0.25], [4.1, 0.035, 0.12]];
    var TINE = [[1, 1, 1], [1.0018, 0.35, 0.8], [2.0, 0.07, 0.4], [5.95, 0.03, 0.06]];
    // rustle: a cluster of short filtered noise grains (cloth, leather, paper)
    function rustle(dest, t, dur, n, fLo, fHi, q, peak, buf) {
      var end = t;
      for (var i = 0; i < n; i++) {
        var tt = t + Math.random() * dur, f = fLo * Math.pow(fHi / fLo, Math.random());
        var e = burst(dest, buf || B.white, 'bandpass', f, q, tt, 0.004 + Math.random() * 0.01,
          peak * (0.5 + Math.random() * 0.5), 0.03 + Math.random() * 0.05);
        if (e > end) end = e;
      }
      return end;
    }
    function metalTick(dest, t, f, peak) {
      burst(dest, B.white, 'highpass', 2500, 0.7, t, 0.0008, peak * 0.5, 0.012);
      return Math.max(tone(dest, 'sine', f, t, 0.001, peak * 0.35, 0.07), tone(dest, 'sine', f * 1.47, t, 0.001, peak * 0.2, 0.045));
    }
    function woodTok(dest, t, f, peak) {
      burst(dest, B.white, 'bandpass', f * 2.1, 2.2, t, 0.0015, peak * 0.7, 0.025);
      tone(dest, 'sine', f * 2.43, t, 0.001, peak * 0.18, 0.03);
      return tone(dest, 'triangle', f, t, 0.002, peak, 0.1, f * 0.82, 0.06);
    }
    function creak(dest, t, r, peak, dur) {
      dur = dur || 0.42;
      var g = gain(0, dest), end = swell(g.gain, t, dur * 0.3, peak, dur * 0.25, dur * 0.45);
      var b1 = filt('bandpass', 820 * r, 7, g), b2 = filt('bandpass', 1650 * r, 9, g), b3 = filt('bandpass', 2900 * r, 10, gain(0.4, g));
      var pre = gain(1); pre.connect(b1); pre.connect(b2); pre.connect(b3);
      var o = osc('sawtooth', 62 * r, t, end, pre);
      o.frequency.linearRampToValueAtTime(95 * r, t + dur * 0.4);
      o.frequency.linearRampToValueAtTime(78 * r, t + dur * 0.75);
      o.frequency.linearRampToValueAtTime(104 * r, t + dur);
      var j = gain(9 * r); j.connect(o.frequency); nsrc(B.grain, t, end, j);   // stick-slip jitter
      return end;
    }
    function ocarina(dest, f, t, dur, peak, bend) {
      var g = gain(0, dest), end = t + dur;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.02);
      g.gain.linearRampToValueAtTime(peak * 0.72, t + dur * 0.65); g.gain.linearRampToValueAtTime(0, end);
      var lp = filt('lowpass', f * 3, 0.5, g);
      var o = osc('sine', f * (bend || 1), t, end, lp); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      var h = gain(0.08, lp); var o2 = osc('triangle', f * (bend || 1), t, end, h); o2.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      burst(dest, B.white, 'bandpass', f * 2, 3, t, 0.006, peak * 0.22, 0.06);     // breath onset "f"
      return end;
    }

    var V = {};
    V.tap = function (o, t, r) { return woodTok(o, t, 470 * r, 0.6); };
    V.pickup = function (o, t, r) {
      woodTok(o, t, 560 * r, 0.32);
      rustle(o, t + 0.01, 0.06, 3, 1800, 3200, 1.2, 0.12);
      return tone(o, 'sine', 640 * r, t + 0.02, 0.01, 0.16, 0.08, 820 * r, 0.05);
    };
    V.putdown = function (o, t, r) {
      woodTok(o, t, 400 * r, 0.6);
      return woodTok(o, t + 0.075, 430 * r, 0.16);
    };
    V.knob = function (o, t, r) { return metalTick(o, t, 2350 * r, 0.42); };
    V.creak = function (o, t, r) { return creak(o, t, r, 0.55); };
    V.wingOpen = function (o, t, r) {
      burst(o, B.pink, 'lowpass', 900 * r, 0.7, t, 0.004, 0.35, 0.09);
      tone(o, 'sine', 610 * r, t, 0.002, 0.16, 0.07);
      return tone(o, 'triangle', 300 * r, t, 0.004, 0.62, 0.22, 235 * r, 0.12);
    };
    V.reveal = function (o, t, r) {
      var notes = [72, 74, 76, 79, 81, 84, 86, 88, 91], end = t;
      for (var i = 0; i < notes.length; i++) {
        var last = i === notes.length - 1;
        var e = bell(o, mtof(notes[i]) * r, t + i * 0.075, last ? 0.2 : 0.16 + i * 0.004, last ? 1.6 : 1.0, CELESTA);
        if (e > end) end = e;
      }
      var g = gain(0, o), sh = filt('bandpass', 3000, 0.8, g);
      sh.frequency.exponentialRampToValueAtTime(6500, t + 0.8);
      swell(g.gain, t, 0.5, 0.05, 0.1, 0.6); nsrc(B.white, t, t + 1.3, sh);
      return end;
    };
    V.cloth = function (o, t, r) {
      burst(o, B.pink, 'bandpass', 1500 * r, 0.8, t, 0.04, 0.32, 0.18);
      return rustle(o, t, 0.2, 7, 1200 * r, 3500 * r, 1.0, 0.35);
    };
    V.towelOff = function (o, t, r) {
      var g = gain(0, o), f = filt('bandpass', 600 * r, 0.9, g);
      f.frequency.setValueAtTime(600 * r, t); f.frequency.exponentialRampToValueAtTime(2200 * r, t + 0.32);
      f.frequency.exponentialRampToValueAtTime(800 * r, t + 0.75);
      var end = swell(g.gain, t, 0.22, 0.6, 0.12, 0.45);
      nsrc(B.pink, t, end, f);
      rustle(o, t + 0.05, 0.6, 14, 1000 * r, 3200 * r, 1.0, 0.3);
      return end;
    };
    V.flop = function (o, t, r) {
      burst(o, B.pink, 'lowpass', 1000 * r, 0.8, t, 0.006, 0.5, 0.12, 400 * r, 0.1);
      tone(o, 'sine', 300 * r, t, 0.004, 0.45, 0.12, 190 * r, 0.1);
      tone(o, 'sine', 950 * r, t + 0.035, 0.002, 0.12, 0.03, 520 * r, 0.025);
      tone(o, 'sine', 1200 * r, t + 0.07, 0.002, 0.08, 0.025, 640 * r, 0.02);
      return rustle(o, t + 0.01, 0.12, 4, 1300 * r, 2600 * r, 2.5, 0.16, B.pink);
    };
    V.drip = function (o, t, r) {
      tone(o, 'sine', 900 * r, t, 0.002, 0.42, 0.12, 1700 * r, 0.04);
      return tone(o, 'sine', 1800 * r, t, 0.001, 0.05, 0.04);
    };
    function slideSwitch(o, t, f, peak) {
      burst(o, B.white, 'bandpass', f, 3, t, 0.0008, peak, 0.018);
      tone(o, 'sine', f * 0.42, t, 0.001, peak * 0.35, 0.03);
      burst(o, B.white, 'bandpass', f * 1.2, 3, t + 0.028, 0.0008, peak * 0.55, 0.014);
      return t + 0.07;
    }
    V.switchOn = function (o, t, r) { return slideSwitch(o, t, 3000 * r, 0.6); };
    V.switchOff = function (o, t, r) { return slideSwitch(o, t, 2300 * r, 0.6); };
    V.tissue = function (o, t, r) {
      var g = gain(0, o), f = filt('bandpass', 2200 * r, 0.7, g), l = filt('lowpass', 5000, 0.5, f);
      f.frequency.setValueAtTime(1700 * r, t); f.frequency.exponentialRampToValueAtTime(3000 * r, t + 0.12);
      var end = swell(g.gain, t, 0.04, 0.28, 0.03, 0.17); nsrc(B.white, t, end, l);
      rustle(o, t, 0.15, 5, 2200 * r, 4200 * r, 2, 0.1);
      return end;
    };
    V.boing = function (o, t, r) {
      var g = gain(0, o), lp = filt('lowpass', 2200, 0.7, g), end = t + 0.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.42, t + 0.01);
      g.gain.linearRampToValueAtTime(0.26, t + 0.12); g.gain.linearRampToValueAtTime(0.1, t + 0.32); g.gain.linearRampToValueAtTime(0, end);
      var o1 = osc('triangle', 300 * r, t, end, lp);
      o1.frequency.exponentialRampToValueAtTime(560 * r, t + 0.09);
      o1.frequency.exponentialRampToValueAtTime(480 * r, end);
      var vg = gain(0), vib = osc('sine', 15, t, end, vg);
      vg.connect(o1.frequency); vg.gain.setValueAtTime(110 * r, t + 0.04); vg.gain.exponentialRampToValueAtTime(4 * r, end);
      vib.frequency.setValueAtTime(15, t); vib.frequency.linearRampToValueAtTime(10, end);
      tone(o, 'sine', 1100 * r, t, 0.004, 0.06, 0.12, 1600 * r, 0.08);
      return end;
    };
    V.lidOpen = function (o, t, r) {
      metalTick(o, t, 2800 * r, 0.32);
      creak(o, t + 0.05, 1.5 * r, 0.18, 0.28);
      return woodTok(o, t + 0.3, 520 * r, 0.22);
    };
    V.lidClose = function (o, t, r) {
      woodTok(o, t, 430 * r, 0.6);
      return metalTick(o, t + 0.05, 2900 * r, 0.3);
    };
    V.clip = function (o, t, r) {
      metalTick(o, t, 3100 * r, 0.22);
      burst(o, B.white, 'bandpass', 2600 * r, 2, t + 0.03, 0.0008, 0.55, 0.02);
      tone(o, 'sine', 1250 * r, t + 0.03, 0.001, 0.22, 0.05);
      return metalTick(o, t + 0.03, 3900 * r, 0.3);
    };
    V.sparkle = function (o, t, r) {
      var n = [84, 88, 91, 96], end = t;
      for (var i = 0; i < n.length; i++) { var e = bell(o, mtof(n[i]) * r, t + i * 0.085, 0.17, i === 3 ? 1.1 : 0.7, CELESTA); if (e > end) end = e; }
      return end;
    };
    V.hint = function (o, t, r) {
      var f = mtof(88) * r;
      bell(o, f, t, 0.2, 1.1, CELESTA);
      tone(o, 'sine', f * 1.004, t, 0.004, 0.07, 1.0);
      return bell(o, mtof(95) * r, t + 0.09, 0.08, 0.8, CELESTA);
    };
    V.strap = function (o, t, r) {
      var e = rustle(o, t, 0.25, 9, 700 * r, 1800 * r, 1.4, 0.32, B.pink);
      burst(o, B.pink, 'bandpass', 1000 * r, 0.8, t, 0.05, 0.18, 0.2);
      metalTick(o, t + 0.12, 3300 * r, 0.16);
      metalTick(o, t + 0.2, 4200 * r, 0.1);
      return Math.max(e, metalTick(o, t + 0.26, 3700 * r, 0.12));
    };
    V.giggle = function (o, t, r) {      // playful "fu-fu-fu-fuu" on a soft ocarina
      var n = [[83, 0, 0.09], [81, 0.11, 0.09], [83, 0.21, 0.09], [79, 0.32, 0.26]], end = t;
      for (var i = 0; i < n.length; i++) {
        var e = ocarina(o, mtof(n[i][0]) * r, t + n[i][1], n[i][2], i === 3 ? 0.36 : 0.32, 1.03);
        if (e > end) end = e;
      }
      return end;
    };
    V.handle = function (o, t, r) {
      burst(o, B.white, 'bandpass', 1500 * r, 2.5, t, 0.001, 0.45, 0.04);
      tone(o, 'sine', 380 * r, t, 0.002, 0.3, 0.08, 330 * r, 0.06);
      metalTick(o, t, 1900 * r, 0.25);
      burst(o, B.white, 'bandpass', 2100 * r, 3, t + 0.09, 0.001, 0.35, 0.03);
      tone(o, 'sine', 460 * r, t + 0.09, 0.002, 0.22, 0.06);
      return metalTick(o, t + 0.09, 2600 * r, 0.18);
    };
    V.doorOpen = function (o, t, r) {
      metalTick(o, t, 2200 * r, 0.18);
      woodTok(o, t + 0.01, 300 * r, 0.25);
      var g = gain(0, o), f = filt('lowpass', 400, 0.6, g), hp = filt('highpass', 260, 0.6, f);
      f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.6);
      f.frequency.exponentialRampToValueAtTime(900, t + 1.3);
      var end = swell(g.gain, t + 0.05, 0.5, 0.42, 0.25, 0.6); nsrc(B.pink, t, end, hp);
      creak(o, t + 0.15, 0.75 * r, 0.12, 0.6);
      return end;
    };
    V.bell = function (o, t, r) {
      var hits = [0, 0.12, 0.2, 0.34, 0.47, 0.66], end = t, f = 1680 * r;
      var P = [[1, 1, 1], [2.32, 0.4, 0.55], [4.25, 0.15, 0.3], [1.004, 0.4, 0.9]];
      for (var i = 0; i < hits.length; i++) {
        var e = bell(o, f * (1 + (Math.random() - 0.5) * 0.004), t + hits[i] + Math.random() * 0.02, 0.17 * Math.pow(0.82, i), 0.9, P);
        if (e > end) end = e;
      }
      return end;
    };
    V.step = function (o, t, r) {
      burst(o, B.pink, 'bandpass', 420 * r, 1.0, t, 0.004, 0.7, 0.06);
      tone(o, 'sine', 260 * r, t, 0.003, 0.3, 0.05, 200 * r, 0.04);
      return burst(o, B.white, 'bandpass', 2200 * r, 1, t + 0.01, 0.01, 0.06, 0.04);
    };
    V.whoosh = function (o, t, r) {
      var g = gain(0, o), f = filt('bandpass', 400 * r, 1.1, g);
      f.frequency.setValueAtTime(400 * r, t); f.frequency.exponentialRampToValueAtTime(1800 * r, t + 0.3);
      f.frequency.exponentialRampToValueAtTime(600 * r, t + 0.7);
      var end = swell(g.gain, t, 0.28, 0.7, 0.04, 0.4), src = f;
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner(); p.connect(f); src = p;
        p.pan.setValueAtTime(-0.5, t); p.pan.linearRampToValueAtTime(0.5, end);
      }
      nsrc(B.pink, t, end, src);
      return end;
    };
    V.ending = function (o, t, r) {
      var q = 0.5, end = t + 6.2, i;
      // warm pad: chords C – F – G – C, triangle + detuned sine through a soft low-pass
      var chords = [[0, 1.6, [60, 64, 67]], [1.5, 1.6, [60, 65, 69]], [3.0, 1.1, [59, 62, 67]], [4.0, 2.2, [60, 64, 67, 72]]];
      var pad = gain(1, o), lp = filt('lowpass', 1300, 0.5, pad);
      for (i = 0; i < chords.length; i++) {
        var c = chords[i], ct = t + c[0], cg = gain(0, lp), ce = ct + c[1] + 0.6;
        cg.gain.setValueAtTime(0, ct); cg.gain.linearRampToValueAtTime(0.075, ct + 0.35);
        cg.gain.setValueAtTime(0.075, ct + c[1]); cg.gain.linearRampToValueAtTime(0, ce);
        for (var k = 0; k < c[2].length; k++) {
          var f = mtof(c[2][k]) * r;
          osc('triangle', f, ct, ce, cg); osc('sine', f * 1.003, ct, ce, cg);
        }
        osc('sine', mtof(c[2][0] - 12) * r, ct, ce, gain(0.7, cg));
      }
      // celesta quoting the music-box motif, then resolving down to C with a final rolled chord
      var mel = [[84, 0], [79, 1], [76, 2], [77, 3], [81, 4], [79, 5], [76, 6], [74, 7]];
      for (i = 0; i < mel.length; i++) bell(o, mtof(mel[i][0]) * r, t + mel[i][1] * q, i === 7 ? 0.17 : 0.2, 1.4, TINE);
      var fin = [72, 76, 79, 84];
      for (i = 0; i < fin.length; i++) bell(o, mtof(fin[i]) * r, t + 4.0 + i * 0.09, i === 3 ? 0.2 : 0.15, 2.0, TINE);
      return end;
    };

    // music-box note (melody tines ring ~2 s, bass a bit longer and softer)
    function mbNote(dest, t, midi, vel, bass) {
      var f = mtof(midi), dec = bass ? 1.6 : 2.1 * Math.pow(523 / f, 0.35);
      return bell(dest, f, t, (bass ? 0.17 : 0.22) * vel, dec, TINE);
    }

    // sparrow / garden birds: kind 0 "chun chun", 1 "pii-yo" whistle, 2 short trill, 3 warble
    function bird(dest, t, kind, vol, pan) {
      var g = gain(vol, null), o2 = g, end = t;
      if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(dest); } else g.connect(dest);
      var s = 0.9 + Math.random() * 0.2, i;
      if (kind === 0) {
        var n = 1 + Math.floor(Math.random() * 3);
        for (i = 0; i < n; i++) {
          var tt = t + i * (0.15 + Math.random() * 0.05);
          end = tone(o2, 'sine', 4300 * s, tt, 0.006, 0.5, 0.06, 2900 * s, 0.045);
          tone(o2, 'sine', 2150 * s, tt, 0.006, 0.08, 0.05, 1500 * s, 0.04);
        }
      } else if (kind === 1) {
        tone(o2, 'sine', 2600 * s, t, 0.02, 0.4, 0.16, 3200 * s, 0.12);
        end = tone(o2, 'sine', 3300 * s, t + 0.22, 0.015, 0.35, 0.22, 2500 * s, 0.2);
      } else if (kind === 2) {
        var m = 6 + Math.floor(Math.random() * 4);
        for (i = 0; i < m; i++) end = tone(o2, 'sine', (3600 - i * 60) * s, t + i * 0.045, 0.004, 0.32, 0.035, (3000 - i * 50) * s, 0.03);
      } else {
        var gg = gain(0, o2); end = swell(gg.gain, t, 0.08, 0.35, 0.25, 0.15);
        var ob = osc('sine', 2700 * s, t, end, gg), lg = gain(380); osc('sine', 19, t, end, lg); lg.connect(ob.frequency);
        ob.frequency.linearRampToValueAtTime(3100 * s, end);
      }
      return end;
    }

    // ---- continuous voices (built once, run forever, controlled by gains)
    function buildDryer(dest) {
      var out = gain(0, dest);
      var motorLp = filt('lowpass', 1500, 0.6, out), motor = gain(0.3, motorLp);
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), o4 = ctx.createOscillator();
      o1.type = 'triangle'; o2.type = 'sine'; o3.type = 'sine'; o4.type = 'sine';
      var g2 = gain(0.3, motor), g3 = gain(0.12, motor), g4 = gain(0.05, motor);
      o1.connect(motor); o2.connect(g2); o3.connect(g3); o4.connect(g4);
      var w1 = ctx.createOscillator(), w2 = ctx.createOscillator(); w1.frequency.value = 4.7; w2.frequency.value = 0.31;
      var wg1 = gain(7), wg2 = gain(12); w1.connect(wg1); w2.connect(wg2);
      var oscs = [[o1, 1], [o2, 2], [o3, 3.01], [o4, 7.02]];
      for (var i = 0; i < oscs.length; i++) {
        oscs[i][0].frequency.value = 60 * oscs[i][1];
        wg1.connect(oscs[i][0].detune); wg2.connect(oscs[i][0].detune);
      }
      // air: broad pink noise band + a little soft hiss, with a load-dependent flutter
      var flut = gain(1, out);
      var airLp = filt('lowpass', 2800, 0.5, flut), airBp = filt('bandpass', 1000, 0.45, airLp);
      var airHp = filt('highpass', 220, 0.5, airBp), air = gain(1.3, airHp); nsrcLoop(B.pink, air);
      var hissLp = filt('lowpass', 5000, 0.5, flut), hissHp = filt('highpass', 2400, 0.6, hissLp);
      var hiss = gain(0.07, hissHp); nsrcLoop(B.white, hiss);
      var fl = ctx.createOscillator(); fl.frequency.value = 13; var flDepth = gain(0); fl.connect(flDepth); flDepth.connect(flut.gain);
      var fl2 = ctx.createOscillator(); fl2.frequency.value = 7.3; var fl2Depth = gain(0); fl2.connect(fl2Depth); fl2Depth.connect(flut.gain);
      var all = [o1, o2, o3, o4, w1, w2, fl, fl2];
      for (i = 0; i < all.length; i++) all[i].start();
      return {
        set: function (on, load, now) {
          var f = on ? 212 * (1 - 0.04 * load) : 70, tauF = on ? 0.11 : 0.2;
          for (var k = 0; k < oscs.length; k++) oscs[k][0].frequency.setTargetAtTime(f * oscs[k][1], now, tauF);
          out.gain.setTargetAtTime(on ? 0.3 : 0, now, on ? 0.1 : 0.17);
          airBp.frequency.setTargetAtTime(on ? 1000 - 280 * load : 500, now, 0.15);
          airLp.frequency.setTargetAtTime(on ? 2800 - 1000 * load : 1200, now, 0.15);
          flDepth.gain.setTargetAtTime(on ? 0.3 * load : 0, now, 0.15);
          fl2Depth.gain.setTargetAtTime(on ? 0.15 * load : 0, now, 0.15);
        }
      };
    }
    function nsrcLoop(buf, dest) {
      var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(dest);
      s.start(0, Math.random() * (buf.duration - 0.6)); return s;
    }
    function buildBrush(dest) {
      var out = gain(0, dest), lp = filt('lowpass', 4800, 0.5, out), bp = filt('bandpass', 2500, 1.1, lp), hp = filt('highpass', 700, 0.5, bp);
      var g = gain(0.65, hp); nsrcLoop(B.white, g);
      var gd = gain(0.55); gd.connect(g.gain); nsrcLoop(B.grain, gd);
      return {
        set: function (s, now) {
          out.gain.setTargetAtTime(0.4 * Math.pow(s, 0.8), now, 0.05);
          bp.frequency.setTargetAtTime(1500 + 2000 * s, now, 0.06);
          lp.frequency.setTargetAtTime(3200 + 2400 * s, now, 0.06);
        }
      };
    }
    function buildAmb(dest) {
      var room = gain(0, dest), rl = filt('lowpass', 650, 0.5, room), rh = filt('highpass', 140, 0.5, rl);
      nsrcLoop(B.pink, rh);
      var outs = gain(0, dest), ol = filt('lowpass', 3500, 0.5, outs), oh = filt('highpass', 260, 0.5, ol);
      nsrcLoop(B.pink, oh);
      var bre = gain(0, dest), sw = gain(0.6, bre), bb = filt('bandpass', 600, 0.7, sw); nsrcLoop(B.pink, bb);
      var l1 = ctx.createOscillator(); l1.frequency.value = 0.09; var l1g = gain(260); l1.connect(l1g); l1g.connect(bb.frequency);
      var l2 = ctx.createOscillator(); l2.frequency.value = 0.067; var l2g = gain(0.4); l2.connect(l2g); l2g.connect(sw.gain);
      l1.start(); l2.start();
      var K = { room: [room, 0.06], outside: [outs, 0.07], breeze: [bre, 0.22] };
      return {
        set: function (name, level, now) { var k = K[name]; if (k) k[0].gain.setTargetAtTime(level * k[1], now, 0.7); }
      };
    }

    return { V: V, mbNote: mbNote, bird: bird, buildDryer: buildDryer, buildBrush: buildBrush, buildAmb: buildAmb };
  }

  // per-sound loudness trim (set by offline measurement so one-shots sit at a similar level)
  var TRIM = {
    tap: 0.7, pickup: 1, putdown: 0.7, knob: 1.5, creak: 1.7, wingOpen: 0.53, reveal: 0.75, cloth: 1.6, towelOff: 1.7,
    flop: 0.68, drip: 0.7, switchOn: 1.8, switchOff: 1.8, tissue: 0.9, boing: 0.4, lidOpen: 1.6, lidClose: 0.72, clip: 1.2,
    sparkle: 1, hint: 0.65, strap: 4.5, giggle: 0.38, handle: 1.2, doorOpen: 1.6, bell: 0.75, step: 1.2, whoosh: 2, ending: 0.5
  };

  GF.createAudio = function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null, dead = !AC, hidden = false, lib = null;
    var master, sfxBus, musicBus, ambBus, dryerV, brushV, ambV;
    var active = [], dying = [], lastPlay = {};
    var want = { dryerOn: false, dryerLoad: 0, brush: 0, mb: false, mbRate: 1, amb: { room: 0, outside: 0, breeze: 0 } };
    var applied = { dryerOn: null, dryerLoad: -1, brush: -1 };
    var mb = { idx: 0, next: 0 };
    var birdNext = { room: 0, outside: 0 };

    function now() { return ctx ? ctx.currentTime : 0; }
    function usable() { return !!ctx && !dead && ctx.state !== 'closed'; }
    function tryResume() {
      try { var p = ctx.resume && ctx.resume(); if (p && p.then) p.then(noop, noop); } catch (e) { /* ignore */ }
    }

    function build() {
      var B = makeBuffers(ctx);
      lib = makeLib(ctx, B);
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.25;
      var lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
      master = ctx.createGain(); master.gain.value = 0;
      master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
      master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.3);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.38; musicBus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
      dryerV = lib.buildDryer(master);
      brushV = lib.buildBrush(sfxBus);
      ambV = lib.buildAmb(ambBus);
      // iOS: play one silent sample inside the gesture
      var s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0);
    }
    function applyWanted() {
      var t = now();
      applied.dryerOn = null; applied.brush = -1;
      syncDryer(t); syncBrush(t);
      for (var k in want.amb) if (want.amb[k] > 0) ambV.set(k, want.amb[k], t);
      if (want.mb) mb.next = t + 0.08;
    }
    function syncDryer(t) {
      if (applied.dryerOn === want.dryerOn && Math.abs(applied.dryerLoad - want.dryerLoad) < 0.03) return;
      applied.dryerOn = want.dryerOn; applied.dryerLoad = want.dryerLoad;
      dryerV.set(want.dryerOn, want.dryerLoad, t);
    }
    function syncBrush(t) {
      if (Math.abs(applied.brush - want.brush) < 0.02 && !(want.brush === 0 && applied.brush !== 0)) return;
      applied.brush = want.brush; brushV.set(want.brush, t);
    }

    function unlock() {
      if (dead) return;
      try {
        if (!ctx) {
          try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e1) { ctx = new AC(); }
          build(); applyWanted();
        }
        if (ctx.state === 'closed') { dead = true; return; }
        if (ctx.state !== 'running' && !hidden) tryResume();
      } catch (e) { dead = true; ctx = null; }
    }
    function suspend() {
      hidden = true;
      if (!usable()) return;
      try { var p = ctx.suspend(); if (p && p.then) p.then(noop, noop); } catch (e) { /* ignore */ }
    }
    function resume() {
      hidden = false;
      if (!usable()) return;
      tryResume();
      var t = now(); mb.next = t + 0.1; birdNext.room = t + 2 + Math.random() * 4; birdNext.outside = t + 0.6;
    }

    function sweep(t) {
      var i;
      for (i = active.length - 1; i >= 0; i--) if (t > active[i].end + 0.05) { try { active[i].g.disconnect(); } catch (e) { /* */ } active.splice(i, 1); }
      for (i = dying.length - 1; i >= 0; i--) if (t > dying[i].end) { try { dying[i].g.disconnect(); } catch (e) { /* */ } dying.splice(i, 1); }
    }

    function play(name, opts) {
      if (!usable() || hidden || !lib || !lib.V[name]) return;
      try {
        var wall = Date.now();
        if (lastPlay[name] && wall - lastPlay[name] < 40) return;
        lastPlay[name] = wall;
        opts = opts || {};
        var vol = clamp(opts.vol == null ? 1 : opts.vol, 0, 2), rate = clamp(opts.rate == null ? 1 : opts.rate, 0.25, 4);
        var pan = clamp(opts.pan == null ? 0 : opts.pan, -1, 1);
        if (vol <= 0) return;
        var t = now(); sweep(t);
        while (active.length >= 12) {
          var v = active.shift();
          try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 0.05); } catch (e) { /* */ }
          v.end = t + 0.08; dying.push(v);
        }
        var g = ctx.createGain(); g.gain.value = vol * (TRIM[name] || 1);
        if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfxBus); }
        else g.connect(sfxBus);
        var end = lib.V[name](g, t + 0.01, rate);
        active.push({ g: g, end: end, name: name });
      } catch (e) { /* never throw into the game */ }
    }

    function scheduleMusic(t) {
      if (mb.next < t) mb.next = t + 0.03;          // stalled (tab hiccup): keep position, re-anchor time
      var guard = 0, beat = BEAT / want.mbRate;
      while (mb.next < t + 0.25 && guard++ < 64) {
        var e = TUNE[mb.idx];
        lib.mbNote(musicBus, mb.next, e[1], e[2], e[3]);
        var nIdx = (mb.idx + 1) % TUNE.length, d = TUNE[nIdx][0] - e[0];
        if (nIdx === 0) d += TUNE_BEATS;
        mb.idx = nIdx; mb.next += d * beat;
      }
    }
    function scheduleBirds(t) {
      var r = want.amb.room, o = want.amb.outside;
      if (r > 0.02 && t >= birdNext.room) {
        if (birdNext.room > 0) lib.bird(roomBirdBus(), t + 0.05, Math.random() < 0.7 ? 0 : 2, 0.07 * r, -0.6);
        birdNext.room = t + 5 + Math.random() * 8;
      }
      if (o > 0.02 && t >= birdNext.outside) {
        if (birdNext.outside > 0) lib.bird(ambBus, t + 0.05, Math.floor(Math.random() * 4), 0.13 * o, Math.random() * 1.4 - 0.7);
        birdNext.outside = t + 0.7 + Math.random() * 2.8;
      }
    }
    var roomBirdLp = null;
    function roomBirdBus() {
      if (!roomBirdLp) { roomBirdLp = ctx.createBiquadFilter(); roomBirdLp.type = 'lowpass'; roomBirdLp.frequency.value = 2800; roomBirdLp.connect(ambBus); }
      return roomBirdLp;
    }

    function update(dt) {
      if (!usable() || hidden || !lib) return;
      try {
        if (ctx.state !== 'running') return;
        var t = now();
        syncDryer(t); syncBrush(t);
        if (want.mb) scheduleMusic(t);
        scheduleBirds(t);
        if (active.length || dying.length) sweep(t);
      } catch (e) { /* */ }
    }

    return {
      unlock: unlock, suspend: suspend, resume: resume, play: play, update: update,
      dryer: { set: function (on, load) { want.dryerOn = !!on; want.dryerLoad = clamp(load == null ? 0 : load, 0, 1); } },
      brush: { set: function (speed) { want.brush = clamp(speed, 0, 1); } },
      musicBox: {
        start: function () { if (want.mb) return; want.mb = true; if (usable()) mb.next = now() + 0.05; },
        stop: function () { want.mb = false; },
        setRate: function (r) { want.mbRate = clamp(r == null ? 1 : r, 0.5, 2); }
      },
      ambience: function (name, level) {
        if (!(name in want.amb)) return;
        level = clamp(level, 0, 1); want.amb[name] = level;
        if (usable() && ambV) { try { ambV.set(name, level, now()); } catch (e) { /* */ } }
      }
    };
  };
  // tiny hook for offline rendering / inspection
  GF.createAudio._lib = { makeBuffers: makeBuffers, makeLib: makeLib, TUNE: TUNE, BEAT: BEAT, TUNE_BEATS: TUNE_BEATS, TRIM: TRIM };
})();
