/* ---- base.js ---- */
/* base.js — shared foundation (renderer, lights, env, constants, helpers).
   Loaded first. Everything hangs off the global `GF`. three.js r160 is the global `THREE`. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  GF.ID = 'gf-261119-1';

  // ---------- small math helpers
  GF.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  GF.lerp = function (a, b, t) { return a + (b - a) * t; };
  GF.smooth = function (a, b, v) { var t = GF.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // frame-rate independent approach: cur -> target
  GF.damp = function (cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); };
  GF.ease = {
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) { if (t <= 0) return 0; if (t >= 1) return 1; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; }
  };
  // seeded random: var r = GF.rng(123); r() -> [0,1)
  GF.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  function hash2(ix, iy) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  // value noise in [0,1]
  GF.noise2 = function (x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  GF.fbm = function (x, y, oct) {
    var s = 0, a = 0.5, n = 0;
    for (var i = 0; i < (oct || 4); i++) { s += a * GF.noise2(x, y); n += a; x *= 2.03; y *= 2.03; a *= 0.5; }
    return s / n;
  };

  // ---------- procedural texture helper
  // GF.canvasTex(256,256,function(ctx,w,h){...},{srgb:true,repeat:[2,2]})
  GF.canvasTex = function (w, h, draw, opts) {
    opts = opts || {};
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    draw(ctx, w, h);
    var t = new THREE.CanvasTexture(c);
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    t.anisotropy = opts.aniso || 4;
    return t;
  };

  // ---------- fixed layout constants (metres). See CONTRACT.md for the full picture.
  // World axes: +X = screen right, +Y = up, +Z = toward the camera. The girl faces −Z (the mirror).
  GF.POS = {
    // dresser scene
    seatY: 0.42,                    // chair seat top
    dresserTopY: 0.70,
    headSit: [0, 0.93, 0],          // girl head centre when seated (headAnchor world pos)
    headStand: [0, 0.985, 0],       // girl head centre when standing (relative to girl.group)
    mirrorZ: -0.685,                // centre mirror glass plane
    mirrorY: [0.76, 1.52],          // glass bottom / top
    mirrorHalfW: 0.22,
    wingHingeX: 0.235, wingHingeZ: -0.67, wingW: 0.22,
    dryerStand: [0.40, 0.70, -0.43],
    musicBox: [0.33, 0.70, -0.30],
    tissueBox: [-0.36, 0.70, -0.42],
    brushCup: [-0.27, 0.70, -0.29],
    towelRail: [-0.09, 0.66, 0.20],   // chair back top rail, left half (towel hangs here)
    pochetteHook: [0.17, 0.70, 0.20], // right finial of the chair back
    // genkan scene
    girlGenkan: [0, 0, 0.25],
    doorZ: -1.50, doorHingeX: -0.43, doorW: 0.86, doorH: 2.0, doorHandle: [0.33, 0.98, -1.50],
    momGenkan: [0.42, 0, -2.9]
  };
  // head-local frame (origin = head centre, face toward −Z, back of the head toward +Z)
  GF.HEAD = {
    skull: [0.072, 0.096, 0.088],                       // ellipsoid radii x,y,z
    neckA: [0, -0.15, 0.008], neckB: [0, -0.07, 0.0], neckR: 0.034,
    torsoC: [0, -0.235, 0.012], torsoR: [0.155, 0.115, 0.085], // shoulders / upper back ellipsoid
    earX: 0.072, earY: -0.012, earZ: 0.006,
    browY: 0.012, eyeY: -0.008, noseY: -0.040, mouthY: -0.060, chinY: -0.096,
    hairlineFrontY: 0.052,
    cowlickDir: [0.22, 0.88, 0.42]                       // (normalise) crown, slightly right/back
  };
  // camera shots: pos, look, and the half extents (at the look point) that must stay visible
  GF.SHOTS = {
    intro: { pos: [0, 1.80, 1.95], look: [0, 0.98, -0.30], halfW: 0.60, halfH: 0.80 },
    work: { pos: [0, 1.72, 1.62], look: [0, 0.98, -0.30], halfW: 0.46, halfH: 0.66 },
    genkan: { pos: [0, 1.30, 2.55], look: [0, 0.95, -1.20], halfW: 0.62, halfH: 1.05 },
    ending: { pos: [0, 1.25, 1.60], look: [0, 0.95, -3.20], halfW: 0.95, halfH: 1.05 }
  };
  // place a PerspectiveCamera so that the shot's box fits for the given aspect
  GF.applyShot = function (camera, shot, aspect) {
    var p = shot.pos, l = shot.look;
    var dx = l[0] - p[0], dy = l[1] - p[1], dz = l[2] - p[2];
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var half = Math.max(shot.halfH, shot.halfW / aspect);
    camera.fov = 2 * Math.atan(half / dist) * 180 / Math.PI;
    camera.aspect = aspect;
    camera.near = 0.05; camera.far = 60;
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(l[0], l[1], l[2]);
    camera.updateProjectionMatrix();
  };

  // ---------- lighting of the dresser room (morning sun through the window on the left, behind the camera)
  GF.LIGHT = {
    keyPos: [-1.5, 2.1, 1.6], keyColor: 0xfff0dc, keyIntensity: 3.2,
    hemiSky: 0xe6eeff, hemiGround: 0x9a8468, hemiIntensity: 1.25,
    fillPos: [1.4, 1.1, -0.4], fillColor: 0xffe8d2, fillIntensity: 0.55
  };
  // creates the three standard lights (sets.js uses this for the dresser room; previews use it too)
  GF.addLights = function (parent, opts) {
    opts = opts || {};
    var L = GF.LIGHT;
    var key = new THREE.DirectionalLight(L.keyColor, L.keyIntensity);
    key.position.set(L.keyPos[0], L.keyPos[1], L.keyPos[2]);
    key.target.position.set(0, 0.8, -0.2);
    if (opts.shadows !== false) {
      key.castShadow = true;
      key.shadow.mapSize.set(opts.shadowSize || 1024, opts.shadowSize || 1024);
      var sc = key.shadow.camera; sc.left = -1.3; sc.right = 1.3; sc.top = 1.3; sc.bottom = -1.3; sc.near = 0.5; sc.far = 7;
      key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
    }
    var hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
    var fill = new THREE.DirectionalLight(L.fillColor, L.fillIntensity);
    fill.position.set(L.fillPos[0], L.fillPos[1], L.fillPos[2]);
    parent.add(key, key.target, hemi, fill);
    return { key: key, hemi: hemi, fill: fill };
  };

  // ---------- renderer with the one agreed colour pipeline
  GF.makeRenderer = function (canvas, opts) {
    opts = opts || {};
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: !opts.low, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = !opts.low;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x15110e, 1);
    return r;
  };

  // ---------- image based lighting: a tiny procedural "bright bedroom" baked to PMREM
  GF.makeEnv = function (renderer) {
    var s = new THREE.Scene();
    function basic(r, g, b) { var m = new THREE.MeshBasicMaterial({ side: THREE.BackSide }); m.color.setRGB(r, g, b); m.toneMapped = false; return m; }
    var room = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 6), [
      basic(0.80, 0.74, 0.68), basic(0.86, 0.80, 0.74),   // +x, -x walls
      basic(1.05, 1.02, 0.98), basic(0.34, 0.25, 0.18),   // ceiling, floor
      basic(0.84, 0.78, 0.72), basic(0.80, 0.75, 0.70)    // +z, -z walls
    ]);
    room.position.y = 1.4;
    s.add(room);
    function panel(w, h, x, y, z, ry, r, g, b) {
      var m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); m.color.setRGB(r, g, b); m.toneMapped = false;
      var q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); q.position.set(x, y, z); q.rotation.y = ry; s.add(q);
    }
    panel(2.2, 1.6, -2.95, 1.6, 0.8, Math.PI / 2, 9, 8.6, 8.0);   // the sunny window (left)
    panel(1.4, 0.9, 0.2, 2.95, 0.4, 0, 2.2, 2.1, 2.0);            // soft ceiling bounce
    var pm = new THREE.PMREMGenerator(renderer);
    var tex = pm.fromScene(s, 0.035).texture;
    pm.dispose();
    return tex;
  };

  // ---------- "focus glow" helper. var setGlow = GF.makeGlow([mesh,...]); setGlow(0..1)
  // Works on Mesh(Standard|Physical|Lambert|Phong)Material. Materials are cloned once so shared ones are not polluted.
  GF.makeGlow = function (meshes, color) {
    var list = [], last = -1, glowCol = new THREE.Color(color !== undefined ? color : 0xffc37a);
    (meshes || []).forEach(function (m) {
      if (!m || !m.material || !m.material.emissive) return;
      m.material = m.material.clone();
      list.push({ mat: m.material, base: m.material.emissive.clone(), baseI: m.material.emissiveIntensity });
    });
    return function (v) {
      v = GF.clamp(v, 0, 1);
      if (Math.abs(v - last) < 0.004) return;
      last = v;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        e.mat.emissive.copy(e.base).lerp(glowCol, Math.min(1, v * 1.2));
        e.mat.emissiveIntensity = e.baseI + (0.8 - e.baseI) * v;
      }
    };
  };
})();

/* ---- audio.js ---- */
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

/* ---- sets.js ---- */
/* sets.js — the two environments: Mum's bedroom corner with the three-panel dresser (+ real planar mirror)
   and the genkan (front entrance) with the garden outside. GF.createSets({renderer, low}). See CONTRACT.md. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var T = THREE;
  var TAU = Math.PI * 2;

  // =====================================================================================
  // small geometry kit
  // =====================================================================================
  var _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function xf(g, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    _v.set(x || 0, y || 0, z || 0);
    if (sx === undefined) sx = 1;
    if (sy === undefined) sy = sx;
    if (sz === undefined) sz = sx;
    _s.set(sx, sy, sz);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    return g;
  }
  function hash(ix, iy) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  // random table (256 x 256 tile) for per-pixel speckle
  var RAND = (function () { var r = GF.rng(1234), a = new Float32Array(65536); for (var i = 0; i < 65536; i++) a[i] = r(); return a; })();
  // smooth periodic value-noise field w x h (cell size cx x cy px) -> Float32Array in [0,1]
  function field(w, h, cx, cy, seed) {
    var P = Math.max(1, Math.round(w / cx)), Q = Math.max(1, Math.round(h / cy)), i, x, y;
    var L = new Float32Array(P * Q), r = GF.rng(seed * 7919 + 1);
    for (i = 0; i < P * Q; i++) L[i] = r();
    var out = new Float32Array(w * h), X0 = new Int32Array(w), X1 = new Int32Array(w), WX = new Float32Array(w);
    for (x = 0; x < w; x++) { var fx = x * P / w, ix = fx | 0, t = fx - ix; X0[x] = ix % P; X1[x] = (ix + 1) % P; WX[x] = t * t * (3 - 2 * t); }
    for (y = 0; y < h; y++) {
      var fy = y * Q / h, iy = fy | 0, ty = fy - iy, wy = ty * ty * (3 - 2 * ty), r0 = (iy % Q) * P, r1 = ((iy + 1) % Q) * P, o = y * w;
      for (x = 0; x < w; x++) {
        var a = L[r0 + X0[x]], b = L[r0 + X1[x]], c = L[r1 + X0[x]], dd = L[r1 + X1[x]], wx = WX[x];
        var top = a + (b - a) * wx; out[o + x] = top + (c + (dd - c) * wx - top) * wy;
      }
    }
    return out;
  }
  // 1-D wood grain profile (periodic, length len): fine fibres + thin dark latewood lines. Returns offsets ~ -0.2..0.05
  function grain(len, seed, spacing, sc) {
    var G = new Float32Array(len), r = GF.rng(seed), i, k;
    for (i = 0; i < len; i++) G[i] = 0.05 * (GF.noise2(i * 0.45 / sc, seed) - 0.5) + 0.07 * (GF.noise2(i * 0.02 / sc, seed + 3.3) - 0.5);
    for (var p = r() * spacing; p < len; p += spacing * (0.45 + r() * 1.1)) {
      var wd = (0.7 + r() * 1.6) * sc, dk = 0.05 + 0.11 * r() * r() + 0.04;
      for (k = -6; k <= 6; k++) { var q = Math.floor(p) + k, dq = (q - p) / wd; G[((q % len) + len) % len] -= dk * Math.exp(-dq * dq); }
    }
    return G;
  }
  function n3(x, y, z) { return (GF.noise2(x, y) + GF.noise2(y + 5.2, z + 1.3) + GF.noise2(z + 9.1, x + 3.7)) / 3; }

  // rounded box (centred), s = segments per rounded edge
  function rbox(w, h, d, r, s) {
    s = Math.max(1, s | 0);
    r = Math.max(0.0004, Math.min(r, w * 0.499, h * 0.499, d * 0.499));
    var N = 2 * s + 1, g = new T.BoxGeometry(1, 1, 1, N, N, N);
    var P = g.attributes.position, Nn = g.attributes.normal, hs = [w / 2, h / 2, d / 2];
    var c = [0, 0, 0], inn = [0, 0, 0];
    for (var i = 0; i < P.count; i++) {
      c[0] = P.getX(i); c[1] = P.getY(i); c[2] = P.getZ(i);
      for (var a = 0; a < 3; a++) {
        var k = Math.round((c[a] + 0.5) * N), hh = hs[a];
        var t = k <= s ? -hh + r * k / s : hh - r * (N - k) / s;
        c[a] = t; inn[a] = Math.max(-hh + r, Math.min(hh - r, t));
      }
      var dx = c[0] - inn[0], dy = c[1] - inn[1], dz = c[2] - inn[2];
      var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      P.setXYZ(i, inn[0] + dx / L * r, inn[1] + dy / L * r, inn[2] + dz / L * r);
      Nn.setXYZ(i, dx / L, dy / L, dz / L);
    }
    return g;
  }
  function boxAt(x0, x1, y0, y1, z0, z1, r, s) {
    var g = rbox(x1 - x0, y1 - y0, z1 - z0, r, s);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  }
  function lathe(pts, seg) {
    var v = []; for (var i = 0; i < pts.length; i++) v.push(new T.Vector2(pts[i][0], pts[i][1]));
    return new T.LatheGeometry(v, seg || 16);
  }
  // box-projected UVs in object/world units: sc = texture repeats per metre. Grain of wood textures runs along u.
  function boxUV(g, sc, vert, ou, ov) {
    var P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    if (!U) { U = new T.BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv', U); }
    ou = ou || 0; ov = ov || 0;
    for (var i = 0; i < P.count; i++) {
      var nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      var x = P.getX(i), y = P.getY(i), z = P.getZ(i), u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
      if (vert && ny < Math.max(nx, nz)) { var t = u; u = v; v = t; }
      U.setXY(i, u * sc + ou, v * sc + ov);
    }
    return g;
  }
  function planarUV(g, ua, va, su, sv, ou, ov) {
    var P = g.attributes.position, U = g.attributes.uv;
    if (!U) { U = new T.BufferAttribute(new Float32Array(P.count * 2), 2); g.setAttribute('uv', U); }
    for (var i = 0; i < P.count; i++) U.setXY(i, P.getComponent(i, ua) * su + (ou || 0), P.getComponent(i, va) * sv + (ov || 0));
    return g;
  }
  function tint(g, hex, jit, rnd) {
    var c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    var k = jit ? 1 + (rnd() - 0.5) * jit : 1;
    for (var i = 0; i < n; i++) { a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
  }
  // weld-by-position smooth normals (works for non-indexed and seamed geometry)
  function smoothNormals(g) {
    var P = g.attributes.position, n = P.count, idx = g.index ? g.index.array : null;
    var map = new Map(), id = new Int32Array(n), cnt = 0;
    for (var i = 0; i < n; i++) {
      var key = (Math.round(P.getX(i) * 1000) + 65536) + 131072 * ((Math.round(P.getY(i) * 1000) + 65536) + 131072 * (Math.round(P.getZ(i) * 1000) + 65536));
      var k = map.get(key); if (k === undefined) { k = cnt++; map.set(key, k); } id[i] = k;
    }
    var acc = new Float32Array(cnt * 3), tri = idx ? idx.length / 3 : n / 3;
    var a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3();
    for (var t = 0; t < tri; t++) {
      var i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      var ids = [id[i0], id[i1], id[i2]];
      for (var j = 0; j < 3; j++) { acc[ids[j] * 3] += e1.x; acc[ids[j] * 3 + 1] += e1.y; acc[ids[j] * 3 + 2] += e1.z; }
    }
    var N = g.attributes.normal || new T.BufferAttribute(new Float32Array(n * 3), 3);
    for (var v = 0; v < n; v++) {
      var q = id[v] * 3; a.set(acc[q], acc[q + 1], acc[q + 2]).normalize();
      N.setXYZ(v, a.x, a.y, a.z);
    }
    g.setAttribute('normal', N);
    return g;
  }
  function merge(list) {
    var nv = 0, ni = 0, hasC = false, i, j;
    for (i = 0; i < list.length; i++) {
      var g = list[i]; nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
      if (g.attributes.color) hasC = true;
    }
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    var col = hasC ? new Float32Array(nv * 3) : null;
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var G = list[i], cnt = G.attributes.position.count;
      if (!G.attributes.normal) G.computeVertexNormals();
      pos.set(G.attributes.position.array.subarray(0, cnt * 3), vo * 3);
      nor.set(G.attributes.normal.array.subarray(0, cnt * 3), vo * 3);
      if (G.attributes.uv) uv.set(G.attributes.uv.array.subarray(0, cnt * 2), vo * 2);
      if (col) {
        if (G.attributes.color && G.attributes.color.itemSize === 3) col.set(G.attributes.color.array.subarray(0, cnt * 3), vo * 3);
        else for (j = 0; j < cnt * 3; j++) col[vo * 3 + j] = 1;
      }
      if (G.index) { var ia = G.index.array; for (j = 0; j < ia.length; j++) idx[io++] = ia[j] + vo; }
      else for (j = 0; j < cnt; j++) idx[io++] = vo + j;
      vo += cnt;
      G.dispose();
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.setIndex(new T.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  function mesh(geo, mat, cast, recv, name) {
    var m = new T.Mesh(geo, mat);
    m.castShadow = !!cast; m.receiveShadow = !!recv;
    if (name) m.name = name;
    return m;
  }
  // a quad from 4 corners (a,b,c,d counter-clockwise seen from the front), UV 0..1
  function quad(a, b, c, d) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]]), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }
  // organic blob (bush / tree canopy): displaced icosphere with vertex-colour AO
  function blob(r, detail, amp, freq, seed, col, rnd, flat) {
    var g = new T.IcosahedronGeometry(r, detail), P = g.attributes.position;
    var base = new T.Color(col), cc = new T.Color(), ca = new Float32Array(P.count * 3);
    for (var i = 0; i < P.count; i++) {
      var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      var n = n3(x * freq + seed, y * freq, z * freq - seed) - 0.5;
      var n2 = n3(x * freq * 3.1 - seed, y * freq * 3.1, z * freq * 3.1) - 0.5;
      var k = 1 + amp * n + amp * 0.45 * n2;
      if (flat && y < -r * 0.25) y = -r * 0.25 + (y + r * 0.25) * 0.35;
      P.setXYZ(i, x * k, y * k, z * k);
      var ao = GF.clamp(0.55 + 0.45 * (y / r + 1) * 0.6 + n * 0.8, 0.35, 1.15);
      cc.copy(base).multiplyScalar(ao * (0.9 + 0.2 * hash(i * 7 + seed * 13 | 0, 3)));
      ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new T.BufferAttribute(ca, 3));
    smoothNormals(g);
    return g;
  }

  // =====================================================================================
  // procedural textures (12 canvases)
  // =====================================================================================
  function makeTextures(low, aniso) {
    var X = {};
    function rep(t) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; return t; }

    // 1) oak plank floor (planks run along v). Texture spans 1.2 m x 1.2 m, 8 planks.
    var FS = low ? 512 : 1024;
    X.floor = rep(GF.canvasTex(FS, FS, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, r = GF.rng(7);
      var NP = 8, pw = w / NP, sc = w / 1024, GL = 4096, G = grain(GL, 11, 9 * sc, sc);
      var TF = field(w, h, w / 8, h / 2, 5);
      var pl = [], p, x, y;
      for (p = 0; p < NP; p++) {
        var j0 = r() * h, j1 = (j0 + h * (0.38 + r() * 0.26)) % h;
        pl.push({ a: Math.min(j0, j1), b: Math.max(j0, j1), ph: r() * TAU,
          s: [{ o: (r() * GL) | 0, t: 0.9 + r() * 0.16, hu: r() - 0.5 }, { o: (r() * GL) | 0, t: 0.9 + r() * 0.16, hu: r() - 0.5 }] });
      }
      var warp = new Float32Array(NP);
      for (y = 0; y < h; y++) {
        var yy = y / h * TAU;
        for (p = 0; p < NP; p++) warp[p] = (3 * Math.sin(yy * 2 + pl[p].ph) + 1.5 * Math.sin(yy * 5 + pl[p].ph * 2)) * sc;
        for (x = 0; x < w; x++) {
          var pi = (x / pw) | 0, P = pl[pi], lx = x - pi * pw;
          var S = (y >= P.a && y < P.b) ? P.s[0] : P.s[1];
          var gi = (S.o + ((lx + warp[pi]) | 0)) & (GL - 1);
          var sh = S.t * (1 + G[gi]) * (0.96 + 0.08 * TF[y * w + x]);
          var e = Math.min(lx, pw - 1 - lx) / sc, dj = Math.min(Math.abs(y - P.a), Math.abs(y - P.b)) / sc;
          if (e < 1.1 || dj < 1.0) sh *= 0.5; else if (e < 2.3 || dj < 2.0) sh *= 0.88;
          sh *= 0.97 + 0.06 * RAND[((y & 255) << 8) | (x & 255)];
          var k = (y * w + x) * 4;
          d[k] = 168 * sh * (1 + 0.05 * S.hu); d[k + 1] = 124 * sh; d[k + 2] = 86 * sh * (1 - 0.08 * S.hu); d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }, { aniso: aniso }));

    // 2) off-white wallpaper (fine woven vinyl look). 512 px = 0.5 m
    X.wall = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F1 = field(w, h, 4, 4, 2), F2 = field(w, h, 32, 32, 3);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var v = 0.95 + 0.032 * (F1[i] - 0.5) + 0.022 * (F2[i] - 0.5) + 0.02 * (RAND[((y & 255) << 8) | (x & 255)] - 0.5);
        v += 0.008 * ((x & 3) < 2 ? 1 : -1) * ((y & 3) < 2 ? 1 : -1);
        var k = i * 4;
        d[k] = 238 * v; d[k + 1] = 230 * v; d[k + 2] = 216 * v; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 3) light natural oak for furniture (grain along u). 512 px = 0.6 m
    X.wood = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, GL = 2048, G = grain(GL, 23, 7, 1);
      var TF = field(w, h, 128, 64, 8), wx = new Float32Array(w), x, y;
      for (x = 0; x < w; x++) { var xx = x / w * TAU; wx[x] = 3 * Math.sin(xx + 1.3) + 1.6 * Math.sin(xx * 2 + 0.4) + 0.8 * Math.sin(xx * 5 + 2.0); }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var i = y * w + x, gi = ((y + wx[x] + 512) | 0) & (GL - 1);
        var sh = (1 + G[gi]) * (0.95 + 0.1 * TF[i]);
        if (RAND[((y & 255) << 8) | ((x >> 1) & 255)] < 0.01) sh *= 0.9;
        var k = i * 4;
        d[k] = 206 * sh; d[k + 1] = 164 * sh; d[k + 2] = 116 * sh; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 4) woven fabric (neutral, tinted by material colour). 256 px = 0.12 m
    X.fabric = rep(GF.canvasTex(256, 256, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F = field(w, h, 2, 24, 4);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var a = 0.5 + 0.5 * Math.sin(x * 1.5708), b = 0.5 + 0.5 * Math.sin(y * 1.5708);
        var chk = ((x >> 2) + (y >> 2)) & 1, i = y * w + x;
        var v = 0.84 + 0.1 * (chk ? a : b) + 0.07 * (F[i] - 0.5) + 0.05 * (RAND[((y & 255) << 8) | (x & 255)] - 0.5);
        var k = i * 4; d[k] = d[k + 1] = d[k + 2] = 255 * v; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 5) rug (cream wool with a soft taupe border), covers the whole rug
    X.rug = GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F1 = field(w, h, 2, 2, 6), F2 = field(w, h, 20, 20, 7);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = x / w, v = y / h, i = y * w + x;
        var e = Math.min(Math.min(u, 1 - u) * 1.3, Math.min(v, 1 - v) * 1.0);
        var f = 0.9 + 0.12 * F1[i] + 0.06 * RAND[((y & 255) << 8) | (x & 255)] + 0.04 * F2[i];
        var cr = 236, cg = 228, cb = 214;
        if ((e > 0.07 && e < 0.085) || (e > 0.105 && e < 0.112)) { cr = 190; cg = 172; cb = 152; }
        if (e < 0.02) f *= 0.93;
        var k = i * 4;
        d[k] = GF.clamp(cr * f, 0, 255); d[k + 1] = GF.clamp(cg * f, 0, 255); d[k + 2] = GF.clamp(cb * f, 0, 255); d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });

    // 6) view out of the bedroom window (soft, out of focus: sky, a neighbour's wall, garden trees)
    X.window = GF.canvasTex(512, 512, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#8fbbe8'); g.addColorStop(0.42, '#c9def0'); g.addColorStop(0.62, '#eef2f0'); g.addColorStop(1, '#e6eadf');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = GF.rng(3), i;
      function soft(x, y, rad, col, a) {
        var gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(0.55, 'rgba(' + col + ',' + (a * 0.7) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // a few soft clouds
      for (i = 0; i < 7; i++) soft(r() * w, h * (0.08 + r() * 0.2), 30 + r() * 40, '255,255,255', 0.55);
      // neighbour's house (pale wall + grey roof), far right
      ctx.fillStyle = 'rgba(232,226,214,0.9)'; ctx.fillRect(w * 0.6, h * 0.40, w * 0.4, h * 0.3);
      ctx.fillStyle = 'rgba(132,138,146,0.85)'; ctx.beginPath(); ctx.moveTo(w * 0.56, h * 0.42); ctx.lineTo(w * 0.8, h * 0.31); ctx.lineTo(w * 1.04, h * 0.42); ctx.fill();
      ctx.fillStyle = 'rgba(150,165,175,0.5)'; ctx.fillRect(w * 0.7, h * 0.48, w * 0.08, h * 0.09);
      // garden trees / hedge
      var greens = ['92,128,70', '120,155,88', '70,104,58', '146,176,104', '104,140,76'];
      for (i = 0; i < 70; i++) {
        var x = r() * w, y = h * (0.45 + r() * 0.55), rad = 24 + r() * 50 * (y / h);
        if (x > w * 0.6 && y < h * 0.6) x -= w * 0.45;
        soft(x, y, rad, greens[(r() * greens.length) | 0], 0.55);
      }
      for (i = 0; i < 40; i++) soft(r() * w, h * (0.5 + r() * 0.45), 8 + r() * 14, '205,225,160', 0.35);
      ctx.fillStyle = 'rgba(80,110,62,0.35)'; ctx.fillRect(0, h * 0.86, w, h * 0.14);
    });

    // 7) soft-edged light patch (white on black, for additive decals: sun patches, light leaks)
    X.soft = GF.canvasTex(128, 128, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = (x + 0.5) / w, v = (y + 0.5) / h;
        var a = GF.smooth(0, 0.16, u) * GF.smooth(0, 0.16, 1 - u) * GF.smooth(0, 0.16, v) * GF.smooth(0, 0.16, 1 - v);
        var k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255 * a; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }, { srgb: false });

    // 8) sheer voile
    X.voile = rep(GF.canvasTex(128, 128, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F = field(w, h, 1, 16, 9);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var v = 0.9 + 0.06 * Math.sin(x * 3.14159 / 2) + 0.03 * Math.sin(y * 3.14159 / 2) + 0.05 * (F[y * w + x] - 0.5);
        var k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255 * GF.clamp(v, 0, 1); d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 9) framed picture: soft watercolour landscape on a white mat (no figures)
    X.picture = GF.canvasTex(256, 192, function (ctx, w, h) {
      ctx.fillStyle = '#f4f0e8'; ctx.fillRect(0, 0, w, h);
      var mx = w * 0.13, my = h * 0.15, iw = w - mx * 2, ih = h - my * 2;
      ctx.save(); ctx.beginPath(); ctx.rect(mx, my, iw, ih); ctx.clip();
      var g = ctx.createLinearGradient(0, my, 0, my + ih);
      g.addColorStop(0, '#b9d2e6'); g.addColorStop(0.6, '#eae6d8'); g.addColorStop(1, '#e6dcc4');
      ctx.fillStyle = g; ctx.fillRect(mx, my, iw, ih);
      var sg = ctx.createRadialGradient(mx + iw * 0.72, my + ih * 0.3, 0, mx + iw * 0.72, my + ih * 0.3, ih * 0.25);
      sg.addColorStop(0, 'rgba(255,236,190,0.95)'); sg.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = sg; ctx.fillRect(mx, my, iw, ih);
      var hills = [['rgba(150,170,180,0.55)', 0.52], ['rgba(140,170,130,0.6)', 0.64], ['rgba(110,150,100,0.7)', 0.76], ['rgba(170,160,110,0.55)', 0.88]];
      var r = GF.rng(9);
      for (var i = 0; i < hills.length; i++) {
        ctx.fillStyle = hills[i][0]; ctx.beginPath(); ctx.moveTo(mx, my + ih);
        var base = my + ih * hills[i][1], ph = r() * 6;
        for (var x = 0; x <= iw; x += 8) ctx.lineTo(mx + x, base - Math.sin(x / iw * 3 + ph) * ih * 0.06 - Math.sin(x / iw * 9 + ph * 2) * ih * 0.015);
        ctx.lineTo(mx + iw, my + ih); ctx.fill();
      }
      for (i = 0; i < 26; i++) {
        ctx.fillStyle = ['rgba(236,150,160,0.8)', 'rgba(250,240,200,0.85)', 'rgba(200,170,220,0.8)'][i % 3];
        ctx.beginPath(); ctx.arc(mx + r() * iw, my + ih * (0.86 + r() * 0.12), 1.2 + r() * 1.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(160,150,135,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(mx - 0.5, my - 0.5, iw + 1, ih + 1);
    });

    // genkan-only textures (tiles, grass, sky): made on demand, while the player is busy at the dresser
    X.loadGenkan = function () {
    if (X.tile) return;
    // 10) entrance tiles (300 mm warm-grey stone porcelain), 512 px = 0.6 m (2 x 2 tiles)
    X.tile = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, ts = w / 2, F1 = field(w, h, 16, 16, 10), F2 = field(w, h, 4, 4, 11);
      var tones = [0.97, 1.03, 1.0, 0.95];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var tx = (x / ts) | 0, ty = (y / ts) | 0, lx = x - tx * ts, ly = y - ty * ts, i = y * w + x;
        var v = tones[tx + ty * 2] * (0.9 + 0.08 * F1[i] + 0.05 * F2[i]);
        var sp = RAND[((y & 255) << 8) | (x & 255)];
        if (sp < 0.04) v *= 0.82; else if (sp > 0.985) v *= 1.12;
        var cr = 150, cg = 145, cb = 137;
        var eg = Math.min(lx, ts - 1 - lx, ly, ts - 1 - ly);
        if (eg < 2.2) { cr = 122; cg = 118; cb = 112; v = 0.95 + 0.08 * RAND[(((y + 7) & 255) << 8) | ((x + 3) & 255)]; } else if (eg < 3.5) v *= 0.92;
        var k = (y * w + x) * 4;
        d[k] = GF.clamp(cr * v, 0, 255); d[k + 1] = GF.clamp(cg * v, 0, 255); d[k + 2] = GF.clamp(cb * v, 0, 255); d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }));

    // 11) grass / foliage
    X.grass = rep(GF.canvasTex(512, 512, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, F1 = field(w, h, 32, 32, 12), F2 = field(w, h, 6, 6, 13);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var n = 0.55 * F1[y * w + x] + 0.45 * F2[y * w + x];
        var k = (y * w + x) * 4, f = 0.72 + 0.5 * n;
        d[k] = 98 * f; d[k + 1] = 122 * f; d[k + 2] = 66 * f; d[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      var r = GF.rng(21), cols = ['#465f2c', '#536f35', '#6c8a45', '#7f9a52', '#93ab62', '#3c5427', '#a9ba78', '#5e7a3a'];
      ctx.lineCap = 'round';
      for (var c = 0; c < cols.length; c++) {
        ctx.strokeStyle = cols[c]; ctx.lineWidth = 1 + (c % 3) * 0.5; ctx.beginPath();
        for (var s = 0; s < 650; s++) {
          var x0 = r() * w, y0 = r() * h, a = r() * TAU, L = 3 + r() * 8, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
            var X0 = x0 + ox * w, Y0 = y0 + oy * h;
            if (X0 + dx < -2 && X0 < -2 || X0 > w + 2 && X0 + dx > w + 2 || Y0 + dy < -2 && Y0 < -2 || Y0 > h + 2 && Y0 + dy > h + 2) continue;
            ctx.moveTo(X0, Y0); ctx.lineTo(X0 + dx, Y0 + dy);
          }
        }
        ctx.stroke();
      }
    }));

    // 12) sky (partial dome facing -Z): zenith at the top, horizon at ~91 % height
    var SW = low ? 512 : 1024, SH = SW / 2;
    X.sky = GF.canvasTex(SW, SH, function (ctx, w, h) {
      var hz = 0.913;
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#4f8bd2'); g.addColorStop(0.45, '#79abe2'); g.addColorStop(0.78, '#b4d1ee');
      g.addColorStop(hz - 0.02, '#dbe8f3'); g.addColorStop(hz, '#e8eff2'); g.addColorStop(1, '#d6ddd8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = GF.rng(5), sc = w / 1024;
      for (var c = 0; c < 16; c++) {
        var cy = h * (0.35 + r() * 0.5), cx = r() * w, persp = 0.35 + 0.65 * (1 - (cy / h - 0.35) / 0.6);
        var size = (40 + r() * 70) * sc * persp;
        for (var b = 0; b < 10; b++) {
          var bx = cx + (r() - 0.5) * size * 3, by = cy + (r() - 0.7) * size * 0.5, br = size * (0.35 + r() * 0.5);
          ctx.save(); ctx.translate(bx, by); ctx.scale(1, 0.55 * (0.6 + persp * 0.5));
          var gr = ctx.createRadialGradient(0, -br * 0.15, 0, 0, 0, br);
          gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(250,252,255,0.45)'); gr.addColorStop(1, 'rgba(240,246,252,0)');
          ctx.fillStyle = gr; ctx.fillRect(-br, -br, br * 2, br * 2); ctx.restore();
        }
      }
    });
    X.sky.anisotropy = aniso;
    };
    return X;
  }

  // =====================================================================================
  // GF.createSets
  // =====================================================================================
  GF.createSets = function (opts) {
    opts = opts || {};
    var low = !!opts.low, rend = opts.renderer || null;
    var SEG = low ? 2 : 3;
    var aniso = 4;
    try { if (rend && rend.capabilities) aniso = Math.max(1, Math.min(8, rend.capabilities.getMaxAnisotropy())); } catch (e) { aniso = 4; }
    var TX = makeTextures(low, aniso);
    function std(o) { return new T.MeshStandardMaterial(o); }

    // shared materials
    var M = {
      floor: std({ map: TX.floor, bumpMap: TX.floor, bumpScale: 0.6, roughness: 0.34, envMapIntensity: 0.8 }),
      wall: std({ map: TX.wall, bumpMap: TX.wall, bumpScale: 0.8, roughness: 0.93, envMapIntensity: 0.6 }),
      ceil: std({ color: 0xf6f3ee, roughness: 0.96, envMapIntensity: 0.5, emissive: 0x7a746a, emissiveIntensity: 1 }),
      white: std({ color: 0xf3f0ea, roughness: 0.5, envMapIntensity: 0.7 }),
      alu: std({ color: 0xcdc6b8, metalness: 0.6, roughness: 0.36 }),
      wood: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.45, roughness: 0.46, envMapIntensity: 0.85 }),
      brass: std({ color: 0xd2a75a, metalness: 1, roughness: 0.28 }),
      cushion: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.2, color: 0xd9ccb8, roughness: 0.92, envMapIntensity: 0.6 }),
      linen: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.0, color: 0xf4f1ec, roughness: 0.95, envMapIntensity: 0.6 }),
      duvet: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.0, color: 0xc2ccb6, roughness: 0.95, envMapIntensity: 0.6 }),
      drape: std({ map: TX.fabric, bumpMap: TX.fabric, bumpScale: 1.0, color: 0xdccfb9, roughness: 0.96, side: T.DoubleSide, envMapIntensity: 0.6 }),
      rug: std({ map: TX.rug, bumpMap: TX.rug, bumpScale: 2.0, roughness: 1.0, envMapIntensity: 0.5 }),
      wingGlass: std({ color: 0xdfe7e4, metalness: 1, roughness: 0.035, envMapIntensity: 1.0 }),
      picture: std({ map: TX.picture, roughness: 0.8 })
    };

    var root = new T.Group(); root.name = 'GF.sets';
    var D = buildDresser(TX, M, low, SEG);
    root.add(D.group);
    // the genkan (front door + garden) is only needed at the end of the story: it is built on demand
    // (ensureGenkan / genkan getter), normally in the background while the player is at the dresser
    var G = null;
    function ensureGenkan(part) {
      if (G) return G.api;
      TX.loadGenkan();
      if (part === 'textures') return null;
      G = buildGenkan(TX, M, low, SEG);
      G.group.visible = current === 'genkan';
      root.add(G.group);
      return G.api;
    }
    var current = '';
    function activate(name) {
      if (name !== 'dresser' && name !== 'genkan') return;
      current = name;
      if (name === 'genkan') ensureGenkan();
      D.group.visible = name === 'dresser';
      if (G) G.group.visible = name === 'genkan';
    }
    activate('dresser');
    var api = { root: root, activate: activate, dresser: D.api, ensureGenkan: ensureGenkan };
    Object.defineProperty(api, 'genkan', { get: function () { return ensureGenkan(); }, enumerable: true });
    Object.defineProperty(api, 'genkanReady', { get: function () { return !!G; } });
    Object.defineProperty(api, 'active', { get: function () { return current; } });
    return api;
  };

  // =====================================================================================
  // DRESSER ROOM
  // =====================================================================================
  function buildDresser(TX, M, low, SEG) {
    var grp = new T.Group(); grp.name = 'set.dresser';
    var lights = GF.addLights(grp, { shadows: !low });
    var X0 = -1.7, X1 = 1.9, Z0 = -0.74, Z1 = 3.4, H = 2.4;
    function std(o) { return new T.MeshStandardMaterial(o); }

    // ---------- shell
    var fl = new T.PlaneGeometry(X1 - X0, Z1 - Z0); fl.rotateX(-Math.PI / 2); fl.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    planarUV(fl, 0, 2, 1 / 1.2, -1 / 1.2, 0.07, 0.31);
    grp.add(mesh(fl, M.floor, false, true, 'floor'));

    var wl = [];
    function wallZ(x0, x1, y0, y1, z, face) {
      var p = new T.PlaneGeometry(x1 - x0, y1 - y0); if (face < 0) p.rotateY(Math.PI);
      p.translate((x0 + x1) / 2, (y0 + y1) / 2, z); planarUV(p, 0, 1, 2, 2); wl.push(p);
    }
    function wallX(z0, z1, y0, y1, x, face) {
      var p = new T.PlaneGeometry(z1 - z0, y1 - y0); p.rotateY(face > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.translate(x, (y0 + y1) / 2, (z0 + z1) / 2); planarUV(p, 2, 1, 2, 2); wl.push(p);
    }
    wallZ(X0, X1, 0, H, Z0, 1);          // back wall (behind the dresser)
    wallZ(X0, X1, 0, H, Z1, -1);         // far wall (behind the camera)
    wallX(Z0, Z1, 0, H, X1, -1);         // right wall
    // left wall with the window opening z [0,1.3], y [0.9,2.1]
    wallX(Z0, 0, 0, H, X0, 1); wallX(1.3, Z1, 0, H, X0, 1);
    wallX(0, 1.3, 0, 0.9, X0, 1); wallX(0, 1.3, 2.1, H, X0, 1);
    grp.add(mesh(merge(wl), M.wall, false, true, 'walls'));

    var ce = new T.PlaneGeometry(X1 - X0, Z1 - Z0); ce.rotateX(Math.PI / 2); ce.translate((X0 + X1) / 2, H, (Z0 + Z1) / 2);
    grp.add(mesh(ce, M.ceil, false, false, 'ceiling'));

    // ---------- white painted joinery: baseboards, cornice, window casing, door (right wall), wardrobe
    var wh = [];
    var bb = 0.065, bt = 0.012;
    wh.push(boxAt(X0, X1, 0, bb, Z0, Z0 + bt, 0.003, 1));
    wh.push(boxAt(X0, X1, 0, bb, Z1 - bt, Z1, 0.003, 1));
    wh.push(boxAt(X1 - bt, X1, 0, bb, Z0, Z1, 0.003, 1));
    wh.push(boxAt(X0, X0 + bt, 0, bb, Z0, Z1, 0.003, 1));
    var cn = 0.03;
    wh.push(boxAt(X0, X1, H - cn, H, Z0, Z0 + cn * 0.7, 0.004, 1));
    wh.push(boxAt(X0, X1, H - cn, H, Z1 - cn * 0.7, Z1, 0.004, 1));
    wh.push(boxAt(X1 - cn * 0.7, X1, H - cn, H, Z0, Z1, 0.004, 1));
    wh.push(boxAt(X0, X0 + cn * 0.7, H - cn, H, Z0, Z1, 0.004, 1));
    // window reveals (wall thickness 0.13) and casing
    var WX = X0 - 0.13;
    wh.push(boxAt(WX, X0, 0.9, 2.1, -0.012, 0, 0.002, 1));
    wh.push(boxAt(WX, X0, 0.9, 2.1, 1.3, 1.312, 0.002, 1));
    wh.push(boxAt(WX, X0, 2.1, 2.112, 0, 1.3, 0.002, 1));
    wh.push(boxAt(X0, X0 + 0.014, 0.86, 2.17, -0.075, 0.0, 0.004, SEG));
    wh.push(boxAt(X0, X0 + 0.014, 0.86, 2.17, 1.3, 1.375, 0.004, SEG));
    wh.push(boxAt(X0, X0 + 0.014, 2.1, 2.17, -0.075, 1.375, 0.004, SEG));
    wh.push(boxAt(WX, X0 + 0.055, 0.88, 0.905, -0.095, 1.395, 0.005, SEG));     // stool / sill board
    wh.push(boxAt(X0, X0 + 0.012, 0.83, 0.88, -0.06, 1.36, 0.003, 1));
    // interior door on the right wall (closed), z [1.45, 2.25]
    var DZ0 = 1.45, DZ1 = 2.25;
    wh.push(boxAt(X1 - 0.036, X1 - 0.002, 0.004, 2.0, DZ0 + 0.01, DZ1 - 0.01, 0.006, SEG));
    wh.push(boxAt(X1 - 0.018, X1, 0, 2.06, DZ0 - 0.06, DZ0 + 0.01, 0.004, 1));
    wh.push(boxAt(X1 - 0.018, X1, 0, 2.06, DZ1 - 0.01, DZ1 + 0.06, 0.004, 1));
    wh.push(boxAt(X1 - 0.018, X1, 2.0, 2.06, DZ0 - 0.06, DZ1 + 0.06, 0.004, 1));
    // wardrobe in the far-left corner (behind the camera; seen in the mirror)
    var WZ0 = 2.82, WZ1 = Z1;
    wh.push(boxAt(-1.69, -0.82, 0.05, 1.98, WZ0 + 0.02, WZ1 - 0.002, 0.008, SEG));
    wh.push(boxAt(-1.68, -1.258, 0.06, 1.965, WZ0, WZ0 + 0.022, 0.006, SEG));
    wh.push(boxAt(-1.252, -0.83, 0.06, 1.965, WZ0, WZ0 + 0.022, 0.006, SEG));
    // ceiling light (round flush mount)
    var cl = lathe([[0, -0.07], [0.2, -0.065], [0.24, -0.05], [0.26, -0.025], [0.26, 0]], low ? 24 : 40);
    cl.translate(0.1, H, 1.3);
    grp.add(mesh(cl, std({ color: 0xffffff, roughness: 0.6, emissive: 0xfff8ee, emissiveIntensity: 0.25 }), false, false, 'ceilingLight'));
    grp.add(mesh(merge(wh), M.white, false, true, 'joinery'));

    // ---------- aluminium: window sashes, curtain rod, door lever, wardrobe handles
    var al = [];
    var sx = X0 - 0.075;
    al.push(boxAt(sx - 0.02, sx + 0.02, 0.9, 0.93, 0, 1.3, 0.003, 1));
    al.push(boxAt(sx - 0.02, sx + 0.02, 2.07, 2.1, 0, 1.3, 0.003, 1));
    al.push(boxAt(sx - 0.02, sx + 0.02, 0.9, 2.1, 0, 0.025, 0.003, 1));
    al.push(boxAt(sx - 0.02, sx + 0.02, 0.9, 2.1, 1.275, 1.3, 0.003, 1));
    function sash(xc, z0, z1) {
      var b = 0.032, t = 0.018;
      al.push(boxAt(xc - t / 2, xc + t / 2, 0.93, 0.93 + b, z0, z1, 0.003, 1));
      al.push(boxAt(xc - t / 2, xc + t / 2, 2.07 - b, 2.07, z0, z1, 0.003, 1));
      al.push(boxAt(xc - t / 2, xc + t / 2, 0.93, 2.07, z0, z0 + b, 0.003, 1));
      al.push(boxAt(xc - t / 2, xc + t / 2, 0.93, 2.07, z1 - b, z1, 0.003, 1));
    }
    sash(sx - 0.011, 0.025, 0.675); sash(sx + 0.011, 0.625, 1.275);
    al.push(xf(new T.CylinderGeometry(0.011, 0.011, 2.2, 12), X0 + 0.11, 2.2, 0.65, Math.PI / 2, 0, 0));
    al.push(xf(new T.CylinderGeometry(0.008, 0.008, 0.11, 8), X0 + 0.055, 2.2, -0.42, 0, 0, Math.PI / 2));
    al.push(xf(new T.CylinderGeometry(0.008, 0.008, 0.11, 8), X0 + 0.055, 2.2, 1.72, 0, 0, Math.PI / 2));
    al.push(xf(new T.SphereGeometry(0.016, 12, 8), X0 + 0.11, 2.2, -0.45));
    al.push(xf(new T.SphereGeometry(0.016, 12, 8), X0 + 0.11, 2.2, 1.75));
    // interior door lever
    al.push(xf(new T.CylinderGeometry(0.024, 0.024, 0.01, 16), X1 - 0.04, 1.0, DZ0 + 0.07, 0, 0, Math.PI / 2));
    al.push(xf(new T.CapsuleGeometry(0.008, 0.1, 4, 10), X1 - 0.075, 1.0, DZ0 + 0.12, Math.PI / 2, 0, 0));
    al.push(xf(new T.CylinderGeometry(0.009, 0.009, 0.04, 10), X1 - 0.055, 1.0, DZ0 + 0.07, 0, 0, Math.PI / 2));
    // wardrobe handles
    al.push(boxAt(-1.275, -1.265, 0.9, 1.25, WZ0 - 0.025, WZ0 - 0.012, 0.004, 1));
    al.push(boxAt(-1.245, -1.235, 0.9, 1.25, WZ0 - 0.025, WZ0 - 0.012, 0.004, 1));
    grp.add(mesh(merge(al), M.alu, false, true, 'aluminium'));

    // ---------- the view out of the window (soft emissive backdrop, beyond the wall)
    var vw = new T.PlaneGeometry(2.6, 2.3); vw.rotateY(Math.PI / 2); vw.translate(X0 - 0.75, 1.45, 0.65);
    var viewMat = new T.MeshBasicMaterial({ map: TX.window }); viewMat.color.setRGB(1.55, 1.5, 1.42);
    grp.add(mesh(vw, viewMat, false, false, 'windowView'));

    // ---------- sheer curtain (vertex-animated) + linen side drapes
    var cU = { uTime: { value: 0 }, uWind: { value: 0 } };
    var cg = new T.PlaneGeometry(1.62, 1.33, low ? 40 : 72, low ? 8 : 14);
    cg.rotateY(Math.PI / 2);
    (function () {
      var P = cg.attributes.position;
      for (var i = 0; i < P.count; i++) {
        var z = P.getZ(i), y = P.getY(i);
        P.setX(i, 0.022 * Math.sin(z * TAU / 0.115) + 0.006 * Math.sin(z * 31 + y * 2));
      }
      cg.computeVertexNormals();
    })();
    cg.translate(X0 + 0.085, 1.515, 0.65);
    planarUV(cg, 2, 1, 4, 3);
    var voile = std({ color: 0xfbf9f4, map: TX.voile, roughness: 0.9, transparent: true, opacity: 0.62, side: T.DoubleSide,
      emissive: 0xfff5e6, emissiveIntensity: 0.32, depthWrite: false, envMapIntensity: 0.4 });
    voile.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = cU.uTime; sh.uniforms.uWind = cU.uWind;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float hang = clamp((2.18 - position.y) / 1.33, 0.0, 1.0);',
        'float sway = sin(uTime * 0.9 + position.z * 2.6) * 0.6 + sin(uTime * 1.7 + position.z * 6.3 + position.y * 2.1) * 0.4;',
        'float amp = (0.016 + 0.085 * uWind) * hang * hang;',
        'transformed.x += amp * (sway + 0.9 * uWind) + 0.004 * hang;',
        'transformed.z += amp * 0.35 * sin(uTime * 1.3 + position.y * 3.0 + position.z);'
      ].join('\n'));
    };
    voile.customProgramCacheKey = function () { return 'gf-voile'; };
    var curtain = mesh(cg, voile, false, false, 'curtain'); curtain.renderOrder = 2;
    grp.add(curtain);
    var dr = [];
    [[-0.44, -0.12], [1.42, 1.74]].forEach(function (zz) {
      var p = new T.PlaneGeometry(zz[1] - zz[0], 1.48, 24, 4); p.rotateY(Math.PI / 2);
      var P = p.attributes.position;
      for (var i = 0; i < P.count; i++) { var z = P.getZ(i); P.setX(i, 0.035 * Math.sin(z * TAU / 0.105) + 0.012); }
      p.computeVertexNormals();
      p.translate(X0 + 0.13, 2.18 - 0.74, (zz[0] + zz[1]) / 2);
      planarUV(p, 2, 1, 6, 6); dr.push(p);
    });
    grp.add(mesh(merge(dr), M.drape, false, true, 'drapes'));

    // ---------- warm sunlight patches where the key light (sun) lands through the window panes
    var kd = new T.Vector3(-GF.LIGHT.keyPos[0], 0.8 - GF.LIGHT.keyPos[1], -0.2 - GF.LIGHT.keyPos[2]).normalize();
    function proj(y, z, plane) { // window point (X0,y,z) along kd onto plane
      var t;
      if (plane === 'floor') t = (0.0025 - y) / kd.y; else t = (Z0 + 0.0025 - z) / kd.z;
      return [X0 + kd.x * t, y + kd.y * t, z + kd.z * t];
    }
    var sp = [];
    [[0.05, 0.64], [0.66, 1.25]].forEach(function (pz) {
      var ya = 0.95, yb = 2.05;
      ['floor', 'wall'].forEach(function (pl) {
        var a = proj(ya, pz[0], pl), b = proj(ya, pz[1], pl), c = proj(yb, pz[1], pl), d = proj(yb, pz[0], pl);
        var q = quad(a, b, c, d);
        // make sure it faces the room
        var N = q.attributes.normal, want = pl === 'floor' ? 1 : 1, comp = pl === 'floor' ? N.getY(0) : N.getZ(0);
        if (comp * want < 0) q.setIndex([0, 2, 1, 0, 3, 2]);
        sp.push(q);
      });
    });
    var sunMat = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    sunMat.color.setRGB(0.26, 0.18, 0.105);
    var sunPatch = mesh(merge(sp), sunMat, false, false, 'sunPatch'); sunPatch.renderOrder = 1;
    grp.add(sunPatch);

    // ---------- rug under the chair
    var rs = new T.Shape(), rw = 1.3, rd = 1.0, rr = 0.07;
    rs.moveTo(-rw / 2 + rr, -rd / 2); rs.lineTo(rw / 2 - rr, -rd / 2); rs.quadraticCurveTo(rw / 2, -rd / 2, rw / 2, -rd / 2 + rr);
    rs.lineTo(rw / 2, rd / 2 - rr); rs.quadraticCurveTo(rw / 2, rd / 2, rw / 2 - rr, rd / 2); rs.lineTo(-rw / 2 + rr, rd / 2);
    rs.quadraticCurveTo(-rw / 2, rd / 2, -rw / 2, rd / 2 - rr); rs.lineTo(-rw / 2, -rd / 2 + rr); rs.quadraticCurveTo(-rw / 2, -rd / 2, -rw / 2 + rr, -rd / 2);
    var rg = new T.ExtrudeGeometry(rs, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.008, bevelSegments: 2, curveSegments: 6 });
    rg.rotateX(-Math.PI / 2); rg.translate(0, 0.005, 0.28);
    planarUV(rg, 0, 2, 1 / (rw + 0.02), -1 / (rd + 0.02), 0.5, 0.5 + 0.28 / (rd + 0.02));
    grp.add(mesh(rg, M.rug, false, true, 'rug'));

    // ---------- light oak furniture (dresser body, mirror frame, chair, bed frame, picture frame) -> one mesh
    var W = [];
    function wpush(g, vert, o) { boxUV(g, 1 / 0.6, vert, o || 0, (o || 0) * 0.7); W.push(g); }
    // dresser top (softly rounded edge)
    wpush(boxAt(-0.56, 0.56, 0.672, 0.70, -0.72, -0.22, 0.011, SEG + 1), false, 0.1);
    // pedestals (carcasses)
    [-1, 1].forEach(function (s) {
      var xa = s < 0 ? -0.548 : 0.248, xb = s < 0 ? -0.248 : 0.548;
      wpush(boxAt(xa, xb, 0.075, 0.674, -0.715, -0.236, 0.005, SEG), true, s * 0.3);
      // drawer fronts (overlay), 3 per stack
      var ys = [0.083, 0.293, 0.483, 0.664];
      for (var i = 0; i < 3; i++) {
        wpush(boxAt(xa + 0.004, xb - 0.004, ys[i] + 0.0025, ys[i + 1] - 0.0025, -0.238, -0.219, 0.0055, SEG), false, i * 0.37 + s * 0.2);
      }
      // short tapered legs
      [[xa + 0.03, -0.69], [xb - 0.03, -0.69], [xa + 0.03, -0.265], [xb - 0.03, -0.265]].forEach(function (p) {
        wpush(xf(new T.CylinderGeometry(0.017, 0.012, 0.078, 14), p[0], 0.039, p[1]), true);
      });
    });
    // knee-hole apron and modesty panel
    wpush(boxAt(-0.25, 0.25, 0.612, 0.674, -0.248, -0.228, 0.005, SEG), false, 0.5);
    wpush(boxAt(-0.25, 0.25, 0.28, 0.674, -0.712, -0.696, 0.004, 1), false);
    // centre mirror frame standing on the top: glass x[-0.22,0.22] y[0.76,1.52] z=-0.685
    wpush(boxAt(-0.237, -0.214, 0.70, 1.548, -0.712, -0.672, 0.006, SEG), true, 0.2);
    wpush(boxAt(0.214, 0.237, 0.70, 1.548, -0.712, -0.672, 0.006, SEG), true, 0.4);
    wpush(boxAt(-0.237, 0.237, 0.70, 0.764, -0.712, -0.672, 0.006, SEG), false, 0.6);
    wpush(boxAt(-0.237, 0.237, 1.516, 1.548, -0.712, -0.672, 0.006, SEG), false, 0.8);
    var crown = boxAt(-0.17, 0.17, 1.54, 1.565, -0.708, -0.676, 0.009, SEG); wpush(crown, false, 0.3);
    wpush(boxAt(-0.22, 0.22, 0.76, 1.52, -0.712, -0.70, 0.002, 1), false);
    // ---- chair (seat top 0.42, seat 0.36 x 0.34 centred at z 0.02, back posts at x=+-0.17 z=0.20)
    wpush(boxAt(-0.178, 0.178, 0.335, 0.366, -0.148, 0.188, 0.007, SEG), false, 0.15);
    [-1, 1].forEach(function (s) {
      wpush(xf(new T.CylinderGeometry(0.0165, 0.0125, 0.336, 16), s * 0.152, 0.168, -0.122), true);
      wpush(boxAt(s * 0.17 - 0.0155, s * 0.17 + 0.0155, 0, 0.664, 0.185, 0.215, 0.0075, SEG), true, s * 0.25);
      var fin = lathe([[0, 0], [0.0125, 0], [0.0125, 0.003], [0.0085, 0.007], [0.0075, 0.009],
        [0.0105, 0.012], [0.0145, 0.0155], [0.0165, 0.0195], [0.0155, 0.025], [0.0125, 0.0297], [0.0075, 0.0336], [0, 0.036]], low ? 12 : 20);
      wpush(fin.translate(s * 0.17, 0.664, 0.20), true);
      wpush(boxAt(s * 0.152 - 0.008, s * 0.152 + 0.008, 0.105, 0.125, -0.12, 0.19, 0.004, 1), false);
    });
    wpush(boxAt(-0.16, 0.16, 0.632, 0.664, 0.188, 0.212, 0.008, SEG), false, 0.45);   // top rail (towel hangs here)
    wpush(boxAt(-0.16, 0.16, 0.49, 0.512, 0.19, 0.21, 0.006, SEG), false, 0.65);       // lower rail
    wpush(boxAt(-0.145, 0.145, 0.105, 0.123, -0.13, -0.114, 0.004, 1), false);        // front stretcher
    // ---- bed frame (behind the camera, against the far wall), picture frame
    wpush(boxAt(-0.12, 1.86, 0.06, 0.30, 2.40, 3.385, 0.012, SEG), false, 0.2);
    wpush(boxAt(1.835, 1.895, 0, 0.92, 2.40, 3.39, 0.014, SEG), true, 0.5);
    wpush(boxAt(-0.12, 1.86, 0.0, 0.06, 2.46, 3.33, 0.004, 1), false);
    var PCX = 0.86, PCY = 1.5, PW = 0.56, PH = 0.42;
    wpush(boxAt(PCX - PW / 2, PCX + PW / 2, PCY - PH / 2, PCY + PH / 2, Z1 - 0.022, Z1 - 0.002, 0.004, SEG), false);
    var woodMesh = mesh(merge(W), M.wood, true, true, 'oakFurniture');
    grp.add(woodMesh);
    var pic = new T.PlaneGeometry(PW - 0.05, PH - 0.05); pic.rotateY(Math.PI); pic.translate(PCX, PCY, Z1 - 0.0235);
    grp.add(mesh(pic, M.picture, false, false, 'picture'));

    // chair cushion (padded)
    var cu = rbox(0.37, 0.05, 0.334, 0.022, SEG + 1);
    (function () {
      var P = cu.attributes.position;
      for (var i = 0; i < P.count; i++) {
        var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        var f = Math.max(0, 1 - Math.pow(x / 0.185, 2)) * Math.max(0, 1 - Math.pow(z / 0.167, 2));
        if (y > 0) P.setY(i, y + 0.007 * f); else P.setY(i, y - 0.002 * f);
      }
      smoothNormals(cu);
    })();
    cu.translate(0, 0.364 + 0.025, 0.02);
    boxUV(cu, 1 / 0.12);
    grp.add(mesh(cu, M.cushion, true, true, 'cushion'));

    // bedding: mattress + pillow (white linen), duvet (sage)
    var bw = [];
    bw.push(boxUV(boxAt(-0.08, 1.83, 0.30, 0.49, 2.43, 3.37, 0.05, SEG), 1 / 0.12));
    var pil = rbox(0.4, 0.13, 0.66, 0.06, SEG + 1);
    (function () { var P = pil.attributes.position; for (var i = 0; i < P.count; i++) { var x = P.getX(i), z = P.getZ(i); P.setY(i, P.getY(i) * (1 - 0.5 * Math.pow(Math.abs(z) / 0.33, 3)) * (1 - 0.3 * Math.pow(Math.abs(x) / 0.2, 3))); } smoothNormals(pil); })();
    pil.rotateZ(0.25); pil.translate(1.62, 0.58, 2.9); bw.push(boxUV(pil, 1 / 0.12));
    grp.add(mesh(merge(bw), M.linen, false, true, 'bedding'));
    var dv = rbox(1.52, 0.34, 1.05, 0.08, SEG + 1);
    (function () {
      var P = dv.attributes.position;
      for (var i = 0; i < P.count; i++) {
        var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        var n = n3(x * 3.1, y * 3.1, z * 3.1) - 0.5, n2 = n3(x * 9, y * 9, z * 9) - 0.5;
        var top = y > 0.1 ? 1 : 0.5, side = Math.abs(z) > 0.45 || x < -0.7 ? 1 : 0.3;
        var sag = y < 0 ? (Math.abs(z) > 0.45 ? 0.03 * Math.sin(x * 9 + z * 3) : 0) : 0;
        P.setXYZ(i, x + n * 0.03, y + (n * 0.05 + n2 * 0.014) * top, z + (n2 * 0.02 + sag) * side);
      }
      smoothNormals(dv);
    })();
    dv.translate(0.66, 0.40, 2.9);
    boxUV(dv, 1 / 0.12);
    var fold = rbox(0.16, 0.05, 1.07, 0.024, SEG); fold.translate(1.36, 0.575, 2.9); boxUV(fold, 1 / 0.12);
    grp.add(mesh(merge([dv, fold]), M.duvet, false, true, 'duvet'));

    // ---------- brass: drawer knobs + hinges of the mirror wings
    var BR = [];
    var knobProf = [[0, 0], [0.0105, 0], [0.0105, 0.0018], [0.0045, 0.006], [0.004, 0.011], [0.0085, 0.0155], [0.0105, 0.0205], [0.0095, 0.025], [0.006, 0.0278], [0, 0.0285]];
    [-1, 1].forEach(function (s) {
      var xc = s * 0.398, ys = [0.083, 0.293, 0.483, 0.664];
      for (var i = 0; i < 3; i++) {
        var k = lathe(knobProf, low ? 12 : 18); k.rotateX(Math.PI / 2); k.translate(xc, (ys[i] + ys[i + 1]) / 2 + (i === 2 ? 0 : 0.0), -0.219);
        BR.push(k);
      }
      [0.81, 1.46].forEach(function (y) { BR.push(xf(new T.CylinderGeometry(0.0045, 0.0045, 0.06, 10), s * 0.235, y, -0.67)); });
    });
    grp.add(mesh(merge(BR), M.brass, true, true, 'brass'));

    // ---------- centre mirror: real planar reflection
    var mirror = makeMirror(grp, low);

    // ---------- the two mirror wings
    var wings = {};
    var glows = {};
    ['L', 'R'].forEach(function (side) {
      var s = side === 'R' ? 1 : -1;               // R: hinge at +x, wing extends toward -x (local)
      var pivot = new T.Group(); pivot.name = 'wing' + side;
      pivot.position.set(s * 0.235, 0.745, -0.67);
      grp.add(pivot);
      var WWID = 0.232, HT = 0.79, TH = 0.02, EW = 0.013;
      // wood panel (hinge side) + free-edge strip (glows)
      var pan = boxAt(-s * (WWID - EW) < 0 ? -(WWID - EW) : 0, -s * (WWID - EW) < 0 ? 0 : (WWID - EW), 0, HT, 0, TH, 0.0045, SEG);
      boxUV(pan, 1 / 0.6, true, s * 0.37, 0.2);
      var panel = mesh(pan, M.wood, true, true, 'wingWood' + side);
      var eg = boxAt(-s * WWID < 0 ? -WWID : WWID - EW, -s * WWID < 0 ? -(WWID - EW) : WWID, 0, HT, 0, TH, 0.0045, SEG);
      boxUV(eg, 1 / 0.6, true, s * 0.37, 0.2);
      var edge = mesh(eg, M.wood, true, true, 'wingEdge' + side);
      // mirror on the inner face (local -z)
      var mg = new T.PlaneGeometry(0.203, 0.758); mg.rotateY(Math.PI); mg.translate(-s * 0.1135, HT / 2, -0.0008);
      var glass = mesh(mg, M.wingGlass, false, false, 'wingGlass' + side);
      // knobs: one on the wooden back (seen when closed), one low dome on the mirror-side border (seen when open)
      var KX = -s * 0.2235, KY = 1.12 - 0.745;
      var kb = lathe(knobProf, low ? 12 : 18); kb.rotateX(Math.PI / 2); kb.translate(KX, KY, TH);
      var kf = lathe([[0, 0], [0.0068, 0], [0.0066, 0.0015], [0.0055, 0.0042], [0.003, 0.0058], [0, 0.0062]], low ? 10 : 16);
      kf.rotateX(-Math.PI / 2); kf.translate(KX, KY, 0);
      var knobs = mesh(merge([kb, kf]), M.brass, true, true, 'wingKnob' + side);
      var knob = new T.Object3D(); knob.name = 'wingKnobAnchor' + side; knob.position.set(-s * 0.226, KY, TH / 2);
      pivot.add(panel, edge, glass, knobs, knob);
      // glow: emissive on knob + edge (GF.makeGlow) plus soft additive halos so it reads in bright light
      var setG = GF.makeGlow([knobs, edge]);
      var hm = new T.SpriteMaterial({ map: TX.soft, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
      hm.color.setRGB(0.95, 0.62, 0.3);
      var halo = new T.Sprite(hm); halo.scale.set(0.05, 0.05, 1); halo.position.set(-s * 0.226, KY, TH + 0.02);
      var hm2 = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      hm2.color.setRGB(0.95, 0.62, 0.3);
      var haloE = new T.Mesh(new T.PlaneGeometry(0.04, HT + 0.04), hm2); haloE.position.set(-s * 0.229, HT / 2, TH + 0.006);
      halo.visible = haloE.visible = false; halo.renderOrder = haloE.renderOrder = 3;
      pivot.add(halo, haloE);
      var halos = { k: halo, e: haloE };
      glows[side] = function (v) {
        v = GF.clamp(v, 0, 1); setG(v);
        hm.opacity = 0.4 * v; hm2.opacity = 0.36 * v;
        halo.visible = haloE.visible = v > 0.004;
      };
      var state = { v: -1 };
      var w = {
        pivot: pivot, knob: knob,
        setOpen: function (v) {
          v = GF.clamp(+v || 0, 0, 1);
          if (v === state.v) return;
          state.v = v;
          pivot.rotation.y = s * v * (155 * Math.PI / 180);
          halos.k.position.z = v < 0.5 ? TH + 0.02 : -0.02;
          halos.e.position.z = v < 0.5 ? TH + 0.006 : -0.006;
          pivot.updateMatrixWorld(true);
        }
      };
      Object.defineProperty(w, 'open', { get: function () { return Math.max(0, state.v); }, enumerable: true });
      w.setOpen(0);
      wings[side] = w;
    });
    // wing mirrors: a one-off cube capture of the room (taken on the first mirror.update) instead of the generic env
    var wingGlasses = [];
    grp.traverse(function (o) { if (o.name === 'wingGlassL' || o.name === 'wingGlassR') wingGlasses.push(o); });
    mirror.onFirst = function (renderer, scene) {
      var crt = new T.WebGLCubeRenderTarget(low ? 128 : 256, { type: T.HalfFloatType });
      var ccam = new T.CubeCamera(0.05, 20, crt);
      ccam.position.set(0, 1.14, -0.25);
      var top = grp; while (top.parent && top.parent !== scene) top = top.parent;
      var hidden = [];
      for (var i = 0; i < scene.children.length; i++) {
        var c = scene.children[i];
        if (c !== top && c.visible && !c.isLight) { c.visible = false; hidden.push(c); }
      }
      var mm = mirror.api.mesh, mv = mm.visible; mm.visible = false;
      wingGlasses.forEach(function (o) { o.visible = false; });
      scene.add(ccam);
      ccam.updateMatrixWorld(true);   // the game may render with scene.matrixWorldAutoUpdate off
      ccam.update(renderer, scene);
      scene.remove(ccam);
      wingGlasses.forEach(function (o) { o.visible = true; });
      mm.visible = mv;
      hidden.forEach(function (c) { c.visible = true; });
      M.wingGlass.envMap = crt.texture; M.wingGlass.needsUpdate = true;
    };
    mirror.wingsClosed = function () { return wings.L.open < 0.015 && wings.R.open < 0.015; };

    // ---------- runtime
    var windT = 0, windC = 0, phase = 0;
    var api = {
      group: grp, lights: lights, wings: wings,
      setWingGlow: function (side, v) { if (glows[side]) glows[side](+v || 0); },
      mirror: mirror.api,
      setCurtainWind: function (v) { windT = GF.clamp(+v || 0, 0, 1); },
      update: function (dt, t) {
        dt = GF.clamp(+dt || 0, 0, 0.1);
        windC = GF.damp(windC, windT, windT > windC ? 4 : 1.5, dt);
        phase += dt * (1 + 2.6 * windC);
        cU.uTime.value = phase; cU.uWind.value = windC;
      }
    };
    return { group: grp, api: api };
  }

  // ---------- planar mirror (Reflector-style: mirrored camera + oblique near plane + projective texture)
  function makeMirror(grp, low) {
    var size = low ? 256 : 512;
    var rt = new T.WebGLRenderTarget(size, Math.round(size * 1.5), { type: T.HalfFloatType, samples: low ? 0 : 4 });
    rt.texture.generateMipmaps = false; rt.texture.minFilter = T.LinearFilter; rt.texture.magFilter = T.LinearFilter;
    var texM = new T.Matrix4();
    var reflMat = new T.ShaderMaterial({
      name: 'GFMirror',
      uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: texM }, tint: { value: new T.Color(0.9, 0.93, 0.92) } },
      vertexShader: 'uniform mat4 textureMatrix;\nvarying vec4 vUv;\nvoid main() {\n  vUv = textureMatrix * vec4(position, 1.0);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
      fragmentShader: 'uniform sampler2D tDiffuse;\nuniform vec3 tint;\nvarying vec4 vUv;\nvoid main() {\n  vec3 c = texture2D(tDiffuse, vUv.xy / vUv.w).rgb * tint;\n  gl_FragColor = vec4(c, 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}'
    });
    var fallMat = new T.MeshStandardMaterial({ color: 0xd9e1de, metalness: 1, roughness: 0.06, envMapIntensity: 1.0 });
    var glass = new T.Mesh(new T.PlaneGeometry(0.44, 0.76), fallMat);
    glass.name = 'centreMirror';
    glass.position.set(0, 1.14, GF.POS.mirrorZ);
    grp.add(glass);

    var enabled = true;
    var vcam = new T.PerspectiveCamera();
    var plane = new T.Plane(), nrm = new T.Vector3(), mPos = new T.Vector3(), cPos = new T.Vector3(), rot = new T.Matrix4();
    var look = new T.Vector3(), view = new T.Vector3(), tgt = new T.Vector3(), clip = new T.Vector4(), q = new T.Vector4();
    var crop = new T.Matrix4(), cp = new T.Vector3(), dbs = new T.Vector2();
    var rtW = size, rtH = Math.round(size * 1.5);
    // match the render target to the glass's footprint on screen (≈1 texel per device pixel, capped by `size`):
    // a phone shows the glass ~600 px tall, so it no longer renders a 512×768 MSAA target for it every frame
    function fitTarget(renderer, bw, bh) {
      renderer.getDrawingBufferSize(dbs);
      var cap = size * 1.5, h = bh * 0.5 * dbs.y, w = bw * 0.5 * dbs.x;
      var k = Math.min(1, cap / Math.max(h, 1), cap / Math.max(w, 1));
      h = Math.max(96, Math.ceil(h * k / 32) * 32); w = Math.max(64, Math.ceil(w * k / 32) * 32);
      if (Math.abs(h - rtH) > rtH * 0.12 || Math.abs(w - rtW) > rtW * 0.12) { rtW = w; rtH = h; rt.setSize(w, h); }
    }
    var CORN = [-0.22, -0.38, 0.22, -0.38, 0.22, 0.38, -0.22, 0.38];
    var self = {};
    self.api = {
      update: function (renderer, scene, camera) {
        if (!renderer || !scene || !camera || !grp.visible) return;
        var shut = self.wingsClosed && self.wingsClosed();
        if (!shut) self.api.capture(renderer, scene);              // wing reflections (normally captured earlier in the background)
        if (!enabled) return;
        if (shut) return;                                          // glass fully covered
        glass.updateWorldMatrix(true, false);
        camera.updateMatrixWorld();
        mPos.setFromMatrixPosition(glass.matrixWorld);
        cPos.setFromMatrixPosition(camera.matrixWorld);
        rot.extractRotation(glass.matrixWorld);
        nrm.set(0, 0, 1).applyMatrix4(rot);
        view.subVectors(mPos, cPos);
        if (view.dot(nrm) > 0) return;                           // camera behind the mirror
        view.reflect(nrm).negate().add(mPos);
        rot.extractRotation(camera.matrixWorld);
        look.set(0, 0, -1).applyMatrix4(rot).add(cPos);
        tgt.subVectors(mPos, look).reflect(nrm).negate().add(mPos);
        vcam.position.copy(view);
        vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(nrm);
        vcam.lookAt(tgt);
        vcam.near = camera.near; vcam.far = camera.far;
        vcam.layers.mask = camera.layers.mask;
        vcam.updateMatrixWorld();
        vcam.projectionMatrix.copy(camera.projectionMatrix);
        // concentrate the render target's pixels on the glass: crop the projection to the mirror's footprint
        var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, ok = true;
        for (var i = 0; i < 4; i++) {
          cp.set(CORN[i * 2], CORN[i * 2 + 1], 0).applyMatrix4(glass.matrixWorld).applyMatrix4(vcam.matrixWorldInverse);
          if (cp.z > -1e-3) { ok = false; break; }
          cp.applyMatrix4(vcam.projectionMatrix);
          if (cp.x < x0) x0 = cp.x; if (cp.x > x1) x1 = cp.x; if (cp.y < y0) y0 = cp.y; if (cp.y > y1) y1 = cp.y;
        }
        if (ok) {
          x0 = Math.max(-1, x0 - 0.01); x1 = Math.min(1, x1 + 0.01); y0 = Math.max(-1, y0 - 0.01); y1 = Math.min(1, y1 + 0.01);
          if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;          // off screen
          crop.set(2 / (x1 - x0), 0, 0, -(x1 + x0) / (x1 - x0), 0, 2 / (y1 - y0), 0, -(y1 + y0) / (y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
          fitTarget(renderer, x1 - x0, y1 - y0);
          vcam.projectionMatrix.premultiply(crop);
        }
        texM.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        texM.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(glass.matrixWorld);
        // oblique near plane = mirror plane (Lengyel)
        plane.setFromNormalAndCoplanarPoint(nrm, mPos).applyMatrix4(vcam.matrixWorldInverse);
        clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        var pe = vcam.projectionMatrix.elements;
        q.x = (Math.sign(clip.x) + pe[8]) / pe[0];
        q.y = (Math.sign(clip.y) + pe[9]) / pe[5];
        q.z = -1.0;
        q.w = (1.0 + pe[10]) / pe[14];
        clip.multiplyScalar(2.0 / clip.dot(q));
        pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1.0; pe[14] = clip.w;
        vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();

        glass.visible = false;
        var cur = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
        var xr = renderer.xr.enabled, sau = renderer.shadowMap.autoUpdate;
        renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(rt);
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, vcam);
        renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = sau;
        renderer.setRenderTarget(cur, face, mip);
        if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
        glass.visible = true;
        if (glass.material !== reflMat) glass.material = reflMat;
      },
      setSize: function (px) {
        px = Math.round(GF.clamp(+px || 512, 64, 2048));
        if (px === size) return;
        size = px; rtW = px; rtH = Math.round(px * 1.5); rt.setSize(rtW, rtH);
      },
      // compile the shader variants the mirror needs (screen pass with the reflection material, linear HDR target pass)
      // ahead of time, so that opening the wings does not stall on shader compilation
      // waits (optional array): compile without blocking where the driver compiles in parallel, pushing promises
      prewarm: function (renderer, scene, camera, waits) {
        var cur = renderer.getRenderTarget(), m = glass.material;
        glass.material = reflMat;
        try {
          if (waits) { waits.push(renderer.compileAsync(scene, camera)); renderer.setRenderTarget(rt); waits.push(renderer.compileAsync(scene, camera)); }
          else { renderer.compile(scene, camera); renderer.setRenderTarget(rt); renderer.compile(scene, camera); }
        }
        finally { glass.material = m; renderer.setRenderTarget(cur); }
      },
      // one-off cube capture for the wing mirrors; deferred while the wings are shut (they hide it), so the first
      // frame does not pay for it. The game calls it in the background; update() does it at the latest on opening
      capture: function (renderer, scene) {
        if (!self.onFirst || !renderer || !scene) return;
        var f = self.onFirst; self.onFirst = null;
        try { f(renderer, scene); } catch (e) { /* keep the plain env */ }
      },
      setEnabled: function (on) {
        enabled = !!on;
        if (!enabled) glass.material = fallMat;
      }
    };
    Object.defineProperty(self.api, 'enabled', { get: function () { return enabled; } });
    self.api.mesh = glass;
    return self;
  }

  // =====================================================================================
  // GENKAN
  // =====================================================================================
  function buildGenkan(TX, M, low, SEG) {
    var grp = new T.Group(); grp.name = 'set.genkan';
    grp.visible = false;
    var rnd = GF.rng(77);
    function std(o) { return new T.MeshStandardMaterial(o); }
    var XL = -0.95, XR = 0.95, ZD = GF.POS.doorZ, ZS = 0.75, ZB = 3.15, H = 2.4, HY = 0.12;

    var mat = {
      tile: std({ map: TX.tile, bumpMap: TX.tile, bumpScale: 0.8, roughness: 0.62, envMapIntensity: 0.7 }),
      darkWood: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.4, color: 0x7a6656, roughness: 0.42 }),
      door: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.4, color: 0x8c7666, roughness: 0.45, vertexColors: true }),
      paleWood: std({ map: TX.wood, bumpMap: TX.wood, bumpScale: 0.35, color: 0xf2e8da, roughness: 0.5 }),
      metal: std({ color: 0xbdbab4, metalness: 1, roughness: 0.3 }),
      lever: std({ color: 0xc9c6c0, metalness: 1, roughness: 0.25 }),
      lawn: std({ map: TX.grass, bumpMap: TX.grass, bumpScale: 1.5, roughness: 0.95, color: 0xd2d6be, envMapIntensity: 0.5 }),
      foliage: std({ map: TX.grass, roughness: 0.88, vertexColors: true, envMapIntensity: 0.6, emissive: 0x1c2a12, emissiveIntensity: 1 }),
      misc: std({ map: TX.wall, roughness: 0.86, vertexColors: true, envMapIntensity: 0.6 }),
      flower: std({ roughness: 0.65, vertexColors: true }),
      down: std({ color: 0xffffff, emissive: 0xfff1dc, emissiveIntensity: 1.6, roughness: 0.5 })
    };

    // ---------- interior shell (thick boxes so the sun's shadow map seals the interior)
    var tl = [];
    var tf = new T.PlaneGeometry(XR - XL, ZS - ZD); tf.rotateX(-Math.PI / 2); tf.translate(0, 0, (ZD + ZS) / 2); planarUV(tf, 0, 2, 1 / 0.6, -1 / 0.6, 0.5, 0); tl.push(tf);
    // porch slab outside, level with the entrance floor
    var po = new T.PlaneGeometry(2.4, 1.1); po.rotateX(-Math.PI / 2); po.translate(0, 0, -2.07); planarUV(po, 0, 2, 1 / 0.6, -1 / 0.6, 0.5, 0); tl.push(po);
    tl.push(boxUV(boxAt(-1.22, 1.22, -0.06, -0.0005, -2.64, -1.6, 0.01, 2), 1 / 0.6, false, 0.5));
    tl.push(boxUV(boxAt(-0.44, 0.44, 0, 0.012, -1.63, -1.5, 0.004, 1), 1 / 0.6, false, 0.5));        // threshold
    tl.push(boxUV(boxAt(XL, XL + 0.012, 0, 0.08, ZD, ZS, 0.003, 1), 1 / 0.6));                         // tiled skirting
    tl.push(boxUV(boxAt(XR - 0.012, XR, 0, 0.08, ZD, ZS, 0.003, 1), 1 / 0.6));
    grp.add(mesh(merge(tl), mat.tile, false, true, 'tiles'));

    var hf = new T.PlaneGeometry(XR - XL, ZB - 0.87); hf.rotateX(-Math.PI / 2); hf.translate(0, HY, (0.87 + ZB) / 2);
    planarUV(hf, 0, 2, 1 / 1.2, -1 / 1.2, 0.3, 0.1);
    grp.add(mesh(hf, M.floor, false, true, 'hallFloor'));

    var wl = [];
    var WT = 0.1;
    wl.push(boxAt(XL - WT, XL, 0, H + 0.1, ZD - 0.12, ZB + 0.1, 0.002, 1));
    wl.push(boxAt(XR, XR + WT, 0, H + 0.1, ZD - 0.12, ZB + 0.1, 0.002, 1));
    wl.push(boxAt(XL - WT, XR + WT, 0, H + 0.1, ZB, ZB + WT, 0.002, 1));
    wl.push(boxAt(XL - WT, -0.44, 0, H + 0.1, ZD - 0.12, ZD, 0.002, 1));
    wl.push(boxAt(0.44, XR + WT, 0, H + 0.1, ZD - 0.12, ZD, 0.002, 1));
    wl.push(boxAt(-0.44, 0.44, 2.025, H + 0.1, ZD - 0.12, ZD, 0.002, 1));
    wl.forEach(function (g) { boxUV(g, 2); });
    var walls = mesh(merge(wl), M.wall, true, true, 'walls');
    grp.add(walls);
    var cb = boxAt(XL - WT, XR + WT, H, H + 0.1, ZD - 0.12, ZB + 0.1, 0.002, 1);
    grp.add(mesh(cb, M.ceil, true, true, 'ceiling'));

    // white trim: hallway baseboards
    var wt = [];
    wt.push(boxAt(XL, XL + 0.012, HY, HY + 0.06, 0.87, ZB, 0.003, 1));
    wt.push(boxAt(XR - 0.012, XR, HY, HY + 0.06, 0.87, ZB, 0.003, 1));
    wt.push(boxAt(XL, XR, HY, HY + 0.06, ZB - 0.012, ZB, 0.003, 1));
    grp.add(mesh(merge(wt), M.white, false, true, 'trim'));

    // dark wood: step nosing (上がり框), door frame, cabinet plinth, picture frame
    var dw = [];
    function dpush(g, vert) { boxUV(g, 1 / 0.6, vert); dw.push(g); }
    dpush(boxAt(XL, XR, 0, HY, ZS, 0.87, 0.006, SEG));
    dpush(boxAt(-0.49, -0.44, 0, 2.07, ZD - 0.125, ZD + 0.018, 0.004, SEG), true);
    dpush(boxAt(0.44, 0.49, 0, 2.07, ZD - 0.125, ZD + 0.018, 0.004, SEG), true);
    dpush(boxAt(-0.49, 0.49, 2.02, 2.07, ZD - 0.125, ZD + 0.018, 0.004, SEG));
    dpush(boxAt(0.62, XR, 0, 0.09, -1.22, 0.42, 0.003, 1));
    var gp = { x: XL + 0.002, y: 1.5, z: -0.35 };
    dpush(boxAt(XL, XL + 0.022, gp.y - 0.19, gp.y + 0.19, gp.z - 0.25, gp.z + 0.25, 0.004, SEG));
    grp.add(mesh(merge(dw), mat.darkWood, true, true, 'darkWood'));
    var gpic = new T.PlaneGeometry(0.45, 0.33); gpic.rotateY(Math.PI / 2); gpic.translate(XL + 0.0235, gp.y, gp.z);
    grp.add(mesh(gpic, M.picture, false, false, 'picture'));

    // shoe cabinet (下駄箱) along the right wall, pale wood, doors face -x
    var sc = [];
    function spush(g, vert, o) { boxUV(g, 1 / 0.6, vert, o || 0, 0); sc.push(g); }
    spush(boxAt(0.63, XR, 0.09, 0.985, -1.22, 0.42, 0.004, SEG));
    spush(boxAt(0.6, XR, 0.985, 1.015, -1.25, 0.45, 0.008, SEG), false, 0.3);
    var dz = [-1.215, -0.805, -0.395, 0.015, 0.415];
    for (var i = 0; i < 4; i++) spush(boxAt(0.612, 0.632, 0.095, 0.978, dz[i] + 0.002, dz[i + 1] - 0.002, 0.004, SEG), true, i * 0.27);
    grp.add(mesh(merge(sc), mat.paleWood, true, true, 'shoeCabinet'));
    var sh = [];
    for (i = 0; i < 4; i++) {
      var hz = (i % 2 === 0) ? dz[i + 1] - 0.03 : dz[i] + 0.03;
      sh.push(boxAt(0.6, 0.612, 0.72, 0.9, hz - 0.006, hz + 0.006, 0.004, 1));
    }
    // ceiling downlights
    var dl = [];
    [[0, -0.55], [0, 1.7]].forEach(function (p) { dl.push(xf(new T.CylinderGeometry(0.06, 0.06, 0.01, 20), p[0], H - 0.004, p[1])); });
    grp.add(mesh(merge(dl), mat.down, false, false, 'downlights'));
    sh.push(xf(new T.TorusGeometry(0.064, 0.005, 6, 24), 0, H - 0.006, -0.55, Math.PI / 2, 0, 0));
    sh.push(xf(new T.TorusGeometry(0.064, 0.005, 6, 24), 0, H - 0.006, 1.7, Math.PI / 2, 0, 0));
    grp.add(mesh(merge(sh), mat.metal, false, true, 'fixtures'));

    // ---------- the front door (hinge x=-0.43, opens outward toward -Z)
    var pivot = new T.Group(); pivot.name = 'doorPivot';
    pivot.position.set(GF.POS.doorHingeX, 0, ZD - 0.04);
    grp.add(pivot);
    var DW = GF.POS.doorW, DH = GF.POS.doorH, DT = 0.04;
    var lf = [];
    var leaf = boxAt(0.003, DW - 0.003, 0.008, DH, 0, DT, 0.004, SEG); boxUV(leaf, 1 / 0.6, true, 0.2); tint(leaf, 0xffffff); lf.push(leaf);
    // shallow horizontal grooves on the inside face (and outside), darker
    [0.52, 1.02, 1.52].forEach(function (y) {
      [DT + 0.0004, -0.0004].forEach(function (z) {
        var gq = boxAt(0.27, DW - 0.06, y - 0.003, y + 0.003, z - 0.0006, z + 0.0006, 0.0005, 1);
        boxUV(gq, 1 / 0.6, true); tint(gq, 0x5e4a3a); lf.push(gq);
      });
    });
    var leafMesh = mesh(merge(lf), mat.door, true, true, 'doorLeaf');
    pivot.add(leafMesh);
    // frosted glass slit
    var SX0 = 0.13, SX1 = 0.2, SY0 = 0.3, SY1 = 1.78;
    var slitMat = new T.MeshBasicMaterial({ color: 0xffffff }); slitMat.color.setRGB(1.7, 1.66, 1.56);
    var slit = mesh(boxAt(SX0, SX1, SY0, SY1, -0.0012, DT + 0.0012, 0.001, 1), slitMat, false, false, 'doorGlass');
    pivot.add(slit);
    // static hardware on the leaf: slit beads, escutcheon + thumb turn inside, pull bar outside, hinges
    var hw = [];
    [DT + 0.002, -0.002].forEach(function (z) {
      hw.push(boxAt(SX0 - 0.008, SX0, SY0 - 0.008, SY1 + 0.008, z - 0.003, z + 0.003, 0.001, 1));
      hw.push(boxAt(SX1, SX1 + 0.008, SY0 - 0.008, SY1 + 0.008, z - 0.003, z + 0.003, 0.001, 1));
      hw.push(boxAt(SX0, SX1, SY0 - 0.008, SY0, z - 0.003, z + 0.003, 0.001, 1));
      hw.push(boxAt(SX0, SX1, SY1, SY1 + 0.008, z - 0.003, z + 0.003, 0.001, 1));
    });
    var HX = GF.POS.doorHandle[0] - GF.POS.doorHingeX, HYh = GF.POS.doorHandle[1];
    hw.push(boxAt(HX - 0.022, HX + 0.022, HYh - 0.07, HYh + 0.2, DT, DT + 0.008, 0.006, SEG));
    hw.push(xf(new T.CylinderGeometry(0.016, 0.016, 0.012, 16), HX, HYh + 0.13, DT + 0.014, Math.PI / 2, 0, 0));
    hw.push(boxAt(HX - 0.004, HX + 0.004, HYh + 0.11, HYh + 0.15, DT + 0.018, DT + 0.03, 0.003, 1));
    hw.push(boxAt(HX - 0.012, HX + 0.012, HYh - 0.45, HYh + 0.45, -0.065, -0.05, 0.006, SEG));   // outside pull bar
    hw.push(boxAt(HX - 0.01, HX + 0.01, HYh - 0.42, HYh - 0.38, -0.05, 0, 0.004, 1));
    hw.push(boxAt(HX - 0.01, HX + 0.01, HYh + 0.38, HYh + 0.42, -0.05, 0, 0.004, 1));
    [0.25, 1.0, 1.75].forEach(function (y) { hw.push(xf(new T.CylinderGeometry(0.007, 0.007, 0.1, 10), 0, y, 0)); });
    pivot.add(mesh(merge(hw), mat.metal, true, true, 'doorHardware'));
    // lever handle (inside): handle = anchor at (0.33, 0.98, -1.50) in world when closed
    var handle = new T.Object3D(); handle.name = 'doorHandle';
    handle.position.set(HX, HYh, DT);
    pivot.add(handle);
    var leverG = new T.Group(); handle.add(leverG);
    var lv = [];
    lv.push(xf(new T.CylinderGeometry(0.0105, 0.0105, 0.05, 14), 0, 0, 0.033, Math.PI / 2, 0, 0));
    lv.push(xf(new T.CylinderGeometry(0.021, 0.021, 0.01, 18), 0, 0, 0.012, Math.PI / 2, 0, 0));
    var lb = new T.CapsuleGeometry(0.0095, 0.11, 4, 12); lb.rotateZ(Math.PI / 2); lb.scale(1, 0.85, 1.15); lb.translate(-0.062, 0, 0.058); lv.push(lb);
    var leverMesh = mesh(merge(lv), mat.lever, true, true, 'doorLever');
    leverG.add(leverMesh);
    var doorGlow = GF.makeGlow([leverMesh]);

    // light leaking round the closed door and under it
    var lk = [];
    var LZ = ZD + 0.0035;
    lk.push(quad([0.415, 0.0, LZ], [0.445, 0.0, LZ], [0.445, 2.02, LZ], [0.415, 2.02, LZ]));
    lk.push(quad([-0.445, 0.0, LZ], [-0.425, 0.0, LZ], [-0.425, 2.02, LZ], [-0.445, 2.02, LZ]));
    lk.push(quad([-0.44, 1.99, LZ], [0.44, 1.99, LZ], [0.44, 2.025, LZ], [-0.44, 2.025, LZ]));
    lk.push(quad([-0.5, 0.003, ZD + 0.28], [0.5, 0.003, ZD + 0.28], [0.5, 0.003, ZD - 0.03], [-0.5, 0.003, ZD - 0.03]));
    var leakMat = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    leakMat.color.setRGB(1.0, 0.9, 0.75);
    var leak = mesh(merge(lk), leakMat, false, false, 'doorLeak'); leak.renderOrder = 1;
    grp.add(leak);

    // ---------- outside
    var lawnG = new T.PlaneGeometry(18, 9.2, 4, 4); lawnG.rotateX(-Math.PI / 2); lawnG.translate(0, -0.004, -6.24);
    planarUV(lawnG, 0, 2, 1 / 1.6, 1 / 1.6);
    grp.add(mesh(lawnG, mat.lawn, false, true, 'lawn'));

    var ms = [];   // misc vertex-coloured exterior pieces
    function mpush(g, col, jit) { boxUV(g, 1.4); tint(g, col, jit || 0.12, rnd); ms.push(g); }
    // garden path: two columns of stone slabs, flush (top at +1 cm)
    for (var z = -2.66; z > -9.25; z -= 0.42) {
      var j1 = (rnd() - 0.5) * 0.02, j2 = (rnd() - 0.5) * 0.02;
      var s1 = boxAt(-0.43 + j1, 0.165 + j1, -0.02, 0.01, z - 0.385, z, 0.008, 1); xf(s1, 0, 0, 0, 0, (rnd() - 0.5) * 0.03, 0); mpush(s1, 0xb9b2a6, 0.18);
      var s2 = boxAt(0.195 + j2, 0.80 + j2, -0.02, 0.01, z - 0.385, z, 0.008, 1); mpush(s2, 0xb3ada2, 0.18);
    }
    // gate pillars + mailbox + low walls at the end of the garden
    var GZ = -9.45;
    mpush(boxAt(-0.82, -0.52, 0, 1.15, GZ - 0.15, GZ + 0.15, 0.015, 2), 0xd9d2c4);
    mpush(boxAt(0.95, 1.25, 0, 1.15, GZ - 0.15, GZ + 0.15, 0.015, 2), 0xd9d2c4);
    mpush(boxAt(-0.84, -0.5, 1.15, 1.19, GZ - 0.17, GZ + 0.17, 0.01, 1), 0x8f8a82);
    mpush(boxAt(0.93, 1.27, 1.15, 1.19, GZ - 0.17, GZ + 0.17, 0.01, 1), 0x8f8a82);
    mpush(boxAt(0.97, 1.23, 0.72, 1.02, GZ + 0.15, GZ + 0.27, 0.012, 2), 0x46505c);
    mpush(boxAt(-6, -0.82, 0, 0.62, GZ - 0.1, GZ + 0.1, 0.01, 1), 0xd3ccbe);
    mpush(boxAt(1.25, 6, 0, 0.62, GZ - 0.1, GZ + 0.1, 0.01, 1), 0xd3ccbe);
    // street, curbs, opposite block wall
    mpush(boxAt(-30, 30, -0.03, -0.002, -14.2, GZ - 0.1, 0.002, 1), 0x6d6c6a, 0.04);
    mpush(boxAt(-30, 30, -0.02, 0.0, GZ - 0.42, GZ - 0.32, 0.002, 1), 0xe9e7e0, 0.02);
    mpush(boxAt(-30, 30, -0.02, 0.0, -13.95, -13.85, 0.002, 1), 0xe9e7e0, 0.02);
    mpush(boxAt(-30, 30, 0, 1.2, -14.5, -14.3, 0.01, 1), 0xc7c0b2);
    mpush(boxAt(-40, 40, -0.05, -0.006, -42, -14.5, 0.002, 1), 0x8d9670, 0.05);
    // utility pole (+ wires)
    mpush(xf(new T.CylinderGeometry(0.13, 0.17, 9, 12), -2.6, 4.5, GZ - 0.6), 0xa8a59e, 0.05);
    mpush(boxAt(-3.35, -1.85, 7.6, 7.7, GZ - 0.66, GZ - 0.54, 0.01, 1), 0x8e8b85, 0.05);
    [7.2, 7.65].forEach(function (y) {
      var wg = new T.CylinderGeometry(0.008, 0.008, 60, 4); wg.rotateZ(Math.PI / 2); wg.translate(0, y, GZ - 0.6); mpush(wg, 0x333333, 0.01);
    });
    // neighbourhood: two-storey houses across the street (with a gap showing distant trees and sky)
    function house(cx, cz, w, d, hgt, wallCol, roofCol) {
      mpush(boxAt(cx - w / 2, cx + w / 2, 0, hgt, cz - d / 2, cz + d / 2, 0.02, 1), wallCol, 0.06);
      var x0 = cx - w / 2 - 0.3, x1 = cx + w / 2 + 0.3, ey = hgt - 0.05, ry = hgt + 1.7, zf = cz + d / 2 + 0.45, zb = cz - d / 2 - 0.45;
      function face(a, b, c, dd, want, col) {
        var q = quad(a, b, c, dd), N = q.attributes.normal;
        if (N.getX(0) * want[0] + N.getY(0) * want[1] + N.getZ(0) * want[2] < 0) { q.setIndex([0, 2, 1, 0, 3, 2]); q.computeVertexNormals(); }
        mpush(q, col, 0.04);
      }
      face([x0, ey, zf], [x1, ey, zf], [x1, ry, cz], [x0, ry, cz], [0, 1, 1], roofCol);
      face([x0, ey, zb], [x1, ey, zb], [x1, ry, cz], [x0, ry, cz], [0, 1, -1], roofCol);
      face([x0, ey, zf], [x1, ey, zf], [x1, ey, zb], [x0, ey, zb], [0, -1, 0], 0xd8d4cc);
      face([x0 + 0.3, hgt, zf - 0.45], [x0 + 0.3, hgt, zb + 0.45], [x0 + 0.3, ry - 0.2, cz], [x0 + 0.3, ry - 0.2, cz], [-1, 0, 0], wallCol);
      face([x1 - 0.3, hgt, zf - 0.45], [x1 - 0.3, hgt, zb + 0.45], [x1 - 0.3, ry - 0.2, cz], [x1 - 0.3, ry - 0.2, cz], [1, 0, 0], wallCol);
      for (var fl = 0; fl < 2; fl++) for (var k = 0; k < 3; k++) {
        var wx = cx - w / 2 + w * (0.2 + 0.3 * k);
        mpush(boxAt(wx - 0.45, wx + 0.45, 1.0 + fl * 2.6, 2.1 + fl * 2.6, cz + d / 2, cz + d / 2 + 0.05, 0.01, 1), 0x5b6670, 0.1);
        mpush(boxAt(wx - 0.5, wx + 0.5, 0.95 + fl * 2.6, 1.0 + fl * 2.6, cz + d / 2, cz + d / 2 + 0.08, 0.01, 1), 0xe6e2da, 0.02);
      }
    }
    house(-4.6, -20, 7, 6, 5.4, 0xe7e0d2, 0x5f6670);
    house(5.2, -21.5, 7.5, 6, 5.6, 0xd9d5cc, 0x7a5d4d);
    house(0.4, -34, 8, 6, 5.0, 0xe2ddd3, 0x6b7280);
    // tree trunk
    mpush(xf(new T.CylinderGeometry(0.07, 0.11, 2.1, 10), 1.45, 1.05, -5.7), 0x6e5845, 0.1);
    mpush(xf(new T.CylinderGeometry(0.035, 0.05, 0.9, 8), 1.3, 1.85, -5.7, 0, 0, 0.6), 0x6e5845, 0.1);
    var misc = mesh(merge(ms), mat.misc, true, true, 'exterior');
    grp.add(misc);

    // foliage: hedges, shrubs, tree canopy, distant trees
    var fo = [];
    var det = low ? 2 : 3;
    function fpush(g) { boxUV(g, 2.6); fo.push(g); }
    [-1, 1].forEach(function (s) {
      var hb = new T.BoxGeometry(0.5, 0.75, 6.3, 3, 5, low ? 24 : 42);
      var P = hb.attributes.position, N = hb.attributes.normal, ca = new Float32Array(P.count * 3), c0 = new T.Color(0x5f8045);
      for (var i = 0; i < P.count; i++) {
        var x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        var n = n3(x * 4 + s * 7, y * 4, z * 4) - 0.5;
        var k = 0.05 * n + 0.02 * (n3(x * 13, y * 13, z * 13) - 0.5);
        var rx = Math.sign(x) * Math.max(0, Math.abs(x) - 0.17), ry = Math.max(0, y - 0.25);
        x -= rx * 0.4 * (ry / 0.13); y -= ry * 0.25 * (Math.abs(rx) / 0.08);
        P.setXYZ(i, x + N.getX(i) * k, y + N.getY(i) * k, z + N.getZ(i) * k);
        var ao = GF.clamp(0.6 + 0.5 * (y + 0.375) / 0.75 + n, 0.4, 1.2);
        ca[i * 3] = c0.r * ao; ca[i * 3 + 1] = c0.g * ao; ca[i * 3 + 2] = c0.b * ao;
      }
      hb.setAttribute('color', new T.BufferAttribute(ca, 3));
      smoothNormals(hb);
      hb.translate(s * 1.75, 0.375, -6.15);
      fpush(hb);
    });
    var shrubs = [[-0.95, -3.4, 0.32, 0x6a8e4c], [1.3, -3.2, 0.36, 0x5f8a48], [-1.08, -5.0, 0.4, 0x6f9650], [1.12, -7.6, 0.34, 0x648f4b], [-1.0, -7.9, 0.38, 0x5d8445], [1.35, -4.5, 0.3, 0x76994f]];
    shrubs.forEach(function (b, i) {
      var g = blob(b[2], det, 0.42, 4.5, i * 3.7, b[3], rnd, true); g.scale(1.2, 0.85, 1.1);
      g.translate(b[0], b[2] * 0.6, b[1]); fpush(g);
    });
    // low flower-bed mounds along the path
    [[-0.68, -4.2, 0.9], [-0.68, -6.4, 1.2], [1.05, -5.6, 1.0], [1.0, -8.5, 0.7]].forEach(function (b, i) {
      var g = blob(0.25, det - 1, 0.3, 4, 11 + i, 0x6f9650, rnd, true); g.scale(1.0, 0.6, b[2] / 0.5);
      g.translate(b[0], 0.08, b[1]); fpush(g);
    });
    // tree canopy (right side)
    [[1.45, 2.6, -5.7, 0.62], [1.0, 2.3, -5.45, 0.45], [1.9, 2.35, -5.95, 0.48], [1.4, 3.1, -5.8, 0.45], [1.15, 2.85, -6.1, 0.4], [1.75, 2.9, -5.5, 0.4], [1.5, 2.2, -5.3, 0.38]].forEach(function (b, i) {
      var g = blob(b[3], det, 0.45, 4.0, 20 + i * 2.3, 0x6b9a4c, rnd, false); g.translate(b[0], b[1], b[2]); fpush(g);
    });
    // distant trees beyond the houses
    for (i = 0; i < 7; i++) {
      var tx = -9 + i * 3 + rnd() * 1.5, r = 2 + rnd() * 1.4;
      var g = blob(r, 1, 0.35, 0.8, 40 + i, 0x9aad8e, rnd, false); g.scale(1, 0.9, 1); g.translate(tx, r * 0.75, -29 - rnd() * 3); fpush(g);
    }
    var foliage = mesh(merge(fo), mat.foliage, true, true, 'foliage');
    grp.add(foliage);

    // flowers (tiny blossoms on the beds and shrubs)
    var flw = [];
    var fcols = [0xf2a7b8, 0xfaf6ee, 0xf5d36a, 0xc7a6e0, 0xf08a8a];
    function flowers(cx, cz, rx, rz, y0, n, seed) {
      var rr = GF.rng(seed);
      for (var k = 0; k < n; k++) {
        var a = rr() * TAU, d = Math.sqrt(rr());
        var g = new T.IcosahedronGeometry(0.018 + rr() * 0.012, 0);
        g.scale(1, 0.6, 1);
        g.translate(cx + Math.cos(a) * rx * d, y0 + (1 - d) * 0.1 + rr() * 0.04, cz + Math.sin(a) * rz * d);
        tint(g, fcols[(rr() * fcols.length) | 0], 0.15, rr);
        flw.push(g);
      }
    }
    flowers(-0.68, -4.2, 0.22, 0.45, 0.12, low ? 30 : 60, 1);
    flowers(-0.68, -6.4, 0.22, 0.6, 0.12, low ? 30 : 70, 2);
    flowers(1.05, -5.6, 0.22, 0.5, 0.12, low ? 30 : 60, 3);
    flowers(1.0, -8.5, 0.22, 0.35, 0.12, low ? 20 : 40, 4);
    flowers(1.12, -3.15, 0.3, 0.3, 0.32, low ? 12 : 25, 5);
    flowers(-0.92, -3.4, 0.28, 0.28, 0.3, low ? 12 : 25, 6);
    grp.add(mesh(merge(flw), mat.flower, false, false, 'flowers'));

    // sky (partial dome facing -Z)
    var skyG = new T.SphereGeometry(44, low ? 24 : 40, low ? 10 : 16, 3.4034, 2.618, 0, Math.PI / 2 + 0.15);
    skyG.translate(0, -1.5, -6);
    var skyMat = new T.MeshBasicMaterial({ map: TX.sky, side: T.BackSide, depthWrite: false, fog: false });
    skyMat.color.setRGB(1.08, 1.08, 1.08);
    var sky = mesh(skyG, skyMat, false, false, 'sky'); sky.renderOrder = -1;
    grp.add(sky);

    // ---------- lights
    var hemi = new T.HemisphereLight(0xe2ebf7, 0x9a8a70, 0.5);
    var ceilL = new T.PointLight(0xffe2c2, 1.6, 0, 2); ceilL.position.set(0, 2.2, -0.45);
    var bounce = new T.PointLight(0xfff0dc, 0, 0, 2); bounce.position.set(0, 0.45, -0.75);
    // The sun stands high on the right, slightly behind the house: porch, path, Mum's back and the garden are
    // front-lit. With shadow maps the sealed shell keeps the interior out of the sun; in low mode a spotlight
    // whose cone stops short of the doorway does the same job.
    var sun;
    if (!low) {
      sun = new T.DirectionalLight(0xfff1de, 3.7);
      sun.target.position.set(0, 0, -3.4);
      sun.position.copy(sun.target.position).addScaledVector(new T.Vector3(0.42, 0.8, 0.43).normalize(), 16);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      var c = sun.shadow.camera; c.left = -3.9; c.right = 3.9; c.top = 7.2; c.bottom = -7.2; c.near = 4; c.far = 32;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    } else {
      sun = new T.SpotLight(0xfff1de, 3.7, 0, 0.56, 0.3, 0);
      sun.position.set(2.6, 8.5, -1.2);
      sun.target.position.set(0, 0, -7.5);
    }
    // sunlight pouring in through the doorway: soft-edged patch on the tiles (length and strength follow daylight)
    var patchMat = new T.MeshBasicMaterial({ map: TX.soft, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      opacity: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    patchMat.color.setRGB(0.62, 0.52, 0.38);
    var patch = mesh(quad([-0.5, 0.003, 0], [0.5, 0.003, 0], [0.5, 0.003, -1], [-0.5, 0.003, -1]), patchMat, false, false, 'sunPatch');
    if (patch.geometry.attributes.normal.getY(0) < 0) patch.geometry.setIndex([0, 2, 1, 0, 3, 2]);
    patch.renderOrder = 1; patch.visible = false;
    grp.add(patch);
    function placePatch(len) {   // trapezoid from the threshold into the room, skewed a little to the right
      var P = patch.geometry.attributes.position, z1 = ZD + 0.02 + len;
      var sk = len * 0.16, wd = 0.47 + len * 0.12;
      P.setXYZ(0, -0.47 + 0.0, 0.003, ZD + 0.02); P.setXYZ(1, 0.47, 0.003, ZD + 0.02);
      P.setXYZ(2, wd + sk, 0.003, z1); P.setXYZ(3, -wd + sk, 0.003, z1);
      P.needsUpdate = true; patch.geometry.computeBoundingSphere();
    }
    grp.add(hemi, ceilL, bounce, sun, sun.target);
    var lights = { sun: sun, hemi: hemi, ceiling: ceilL, bounce: bounce };

    // ---------- state
    var st = { open: -1, handle: -1, day: -1 };
    function applyLeak() {
      var o = Math.max(0, st.open), d = Math.max(0, st.day);
      var k = (1 - GF.smooth(0, 0.25, o));
      leakMat.opacity = k; leak.visible = k > 0.003;
      var pv = GF.clamp(d, 0, 1) * GF.smooth(0.03, 0.55, o);
      patch.visible = pv > 0.003;
      if (patch.visible) { patchMat.opacity = Math.min(1, pv * 1.15); placePatch(0.45 + 1.15 * pv); }
    }
    var door = {
      pivot: pivot, handle: handle,
      setOpen: function (v) {
        v = GF.clamp(+v || 0, 0, 1);
        if (v === st.open) return;
        st.open = v;
        pivot.rotation.y = v * (80 * Math.PI / 180);
        pivot.updateMatrixWorld(true);
        applyLeak();
      },
      setHandle: function (p) {
        p = GF.clamp(+p || 0, 0, 1);
        if (p === st.handle) return;
        st.handle = p;
        leverG.rotation.z = p * (35 * Math.PI / 180);
      }
    };
    Object.defineProperty(door, 'open', { get: function () { return Math.max(0, st.open); }, enumerable: true });
    function setDaylight(v) {
      v = GF.clamp(+v || 0, 0, 1);
      if (v === st.day) return;
      st.day = v;
      hemi.intensity = GF.lerp(0.5, 1.35, v);
      bounce.intensity = GF.lerp(0, 2.2, v);
      ceilL.intensity = GF.lerp(1.6, 1.1, v);
      applyLeak();
    }
    door.setOpen(0); door.setHandle(0); setDaylight(0);

    var api = {
      group: grp, lights: lights, door: door,
      setDoorGlow: function (v) { doorGlow(+v || 0); },
      setDaylight: setDaylight,
      update: function (dt, t) {
        dt = GF.clamp(+dt || 0, 0, 0.1);
        sky.rotation.y = Math.sin((+t || 0) * 0.01) * 0.01;
      }
    };
    return { group: grp, api: api };
  }
})();

/* ---- props.js ---- */
/* props.js — every hand-held / interactive prop of the dresser scene:
   hair dryer (+ ring stand + power cord), paddle brush (+ ceramic cup), tissue box (+ flying tissues),
   music-box jewellery box (+ twirling flower), three hair clips, pochette (hanging + worn),
   bath towel (draped on the head + hung on the chair), translucent demo finger.
   GF.createProps({low}) — see CONTRACT.md. three.js r160 global THREE. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var PI = Math.PI, TAU = PI * 2;

  // ------------------------------------------------------------------ small utils
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  function h2(x, y, s) {
    var n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s | 0, 1442695041) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  // periodic value noise (period px, py integer cells) for tileable textures
  function pnoise(x, y, px, py, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
    var a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function pfbm(x, y, px, py, oct, s) {
    var t = 0, a = 0.5, n = 0;
    for (var i = 0; i < oct; i++) { t += a * pnoise(x, y, px, py, s + i * 17); n += a; x *= 2; y *= 2; px *= 2; py *= 2; a *= 0.5; }
    return t / n;
  }
  function pixTex(w, h, fn, opts) {
    return GF.canvasTex(w, h, function (ctx) {
      var img = ctx.createImageData(w, h), d = img.data, o = [0, 0, 0, 255];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        o[3] = 255; fn(x, y, o);
        var k = (y * w + x) * 4;
        d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3];
      }
      ctx.putImageData(img, 0, 0);
    }, opts);
  }

  // ------------------------------------------------------------------ geometry helpers
  function paint(geo, r, g, b) {
    var n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  }
  function xf(geo, p, r, s) {
    var m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(p[0], p[1], p[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)),
      new THREE.Vector3(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
    geo.applyMatrix4(m);
    return geo;
  }
  function merge(list) {
    var nv = 0, ni = 0, i, k;
    for (i = 0; i < list.length; i++) {
      var g0 = list[i];
      if (!g0.attributes.normal) g0.computeVertexNormals();
      nv += g0.attributes.position.count;
      ni += g0.index ? g0.index.count : g0.attributes.position.count;
    }
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var g = list[i], n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (g.attributes.color && g.attributes.color.itemSize === 3) col.set(g.attributes.color.array, vo * 3);
      else col.fill(1, vo * 3, (vo + n) * 3);
      if (g.index) { for (k = 0; k < g.index.count; k++) idx[io + k] = g.index.array[k] + vo; io += g.index.count; }
      else { for (k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
      vo += n;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  // superellipse point
  function sePt(th, a, b, n, out) {
    var c = Math.cos(th), s = Math.sin(th), e = 2 / n;
    out[0] = a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e);
    out[1] = b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), e);
    return out;
  }
  // average normals of coincident vertex groups (seam column / collapsed rows) of a W x H grid
  function fixGrid(geo, W, H, wrap) {
    var N = geo.attributes.normal.array, P = geo.attributes.position.array, i, j, k, x, y, z, l;
    if (wrap) for (j = 0; j < H; j++) {
      var a = j * W, b = j * W + W - 1;
      x = N[a * 3] + N[b * 3]; y = N[a * 3 + 1] + N[b * 3 + 1]; z = N[a * 3 + 2] + N[b * 3 + 2];
      l = Math.sqrt(x * x + y * y + z * z) || 1;
      N[a * 3] = N[b * 3] = x / l; N[a * 3 + 1] = N[b * 3 + 1] = y / l; N[a * 3 + 2] = N[b * 3 + 2] = z / l;
    }
    for (j = 0; j < H; j++) {
      var r0 = j * W, same = true;
      for (i = 1; i < W && same; i++) {
        k = r0 + i;
        if (Math.abs(P[k * 3] - P[r0 * 3]) + Math.abs(P[k * 3 + 1] - P[r0 * 3 + 1]) + Math.abs(P[k * 3 + 2] - P[r0 * 3 + 2]) > 1e-6) same = false;
      }
      if (!same) continue;
      x = y = z = 0;
      for (i = 0; i < W; i++) { k = r0 + i; x += N[k * 3]; y += N[k * 3 + 1]; z += N[k * 3 + 2]; }
      l = Math.sqrt(x * x + y * y + z * z) || 1;
      for (i = 0; i < W; i++) { k = r0 + i; N[k * 3] = x / l; N[k * 3 + 1] = y / l; N[k * 3 + 2] = z / l; }
    }
  }
  // generic parametric grid: fn(u, v, out[3]); normal = dP/du x dP/dv
  function gridGeo(nu, nv, fn, colFn, wrapU) {
    var W = nu + 1, H = nv + 1, n = W * H;
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = colFn ? new Float32Array(n * 3) : null;
    var o = [0, 0, 0], c = [1, 1, 1], i, j, k;
    for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
      var u = i / nu, v = j / nv; k = j * W + i;
      fn(u, v, o);
      pos[k * 3] = o[0]; pos[k * 3 + 1] = o[1]; pos[k * 3 + 2] = o[2];
      uv[k * 2] = u; uv[k * 2 + 1] = v;
      if (colFn) { colFn(u, v, c); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
    }
    var idx = [];
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    fixGrid(g, W, H, wrapU);
    return g;
  }
  // loft through superellipse rings: {c:[x,y,z], u:[..], v:[..], a, b, n, s (shade)}; outward normal when rings progress along v x u
  function loft(rings, seg, flip) {
    var R = rings.length, W = seg + 1, n = R * W;
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), p = [0, 0], i, j;
    for (i = 0; i < R; i++) {
      var r = rings[i], c = r.c, u = r.u || [1, 0, 0], v = r.v || [0, 0, 1], sh = r.s === undefined ? 1 : r.s;
      var cr = r.col || [sh, sh, sh];
      for (j = 0; j < W; j++) {
        sePt(j / seg * TAU, r.a, r.b, r.n || 2, p);
        var k = i * W + j;
        pos[k * 3] = c[0] + u[0] * p[0] + v[0] * p[1];
        pos[k * 3 + 1] = c[1] + u[1] * p[0] + v[1] * p[1];
        pos[k * 3 + 2] = c[2] + u[2] * p[0] + v[2] * p[1];
        uv[k * 2] = j / seg; uv[k * 2 + 1] = i / (R - 1);
        col[k * 3] = cr[0]; col[k * 3 + 1] = cr[1]; col[k * 3 + 2] = cr[2];
      }
    }
    var idx = [];
    for (i = 0; i < R - 1; i++) for (j = 0; j < seg; j++) {
      var a = i * W + j, b = (i + 1) * W + j, c2 = i * W + j + 1, d = (i + 1) * W + j + 1;
      if (flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    fixGrid(g, W, R, true);
    return g;
  }
  // rounded box with exact rounded normals (m = segments per rounded edge)
  function rbox(w, h, d, r, m) {
    m = m || 3;
    r = Math.min(r, Math.min(w, h, d) * 0.4999);
    var s = 2 * m + 1, g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
    var P = g.attributes.position.array, N = g.attributes.normal.array, H = [w / 2, h / 2, d / 2], q = [0, 0, 0];
    function remap(t, half) {
      var k = Math.round((t + 0.5) * s);
      if (k <= m) return -half + r - r * Math.tan((m - k) / m * PI / 4);
      return half - r + r * Math.tan((k - m - 1) / m * PI / 4);
    }
    for (var i = 0; i < P.length; i += 3) {
      var ox = 0, oy = 0, oz = 0;
      for (var c = 0; c < 3; c++) q[c] = remap(P[i + c], H[c]);
      var ix = clamp(q[0], -H[0] + r, H[0] - r), iy = clamp(q[1], -H[1] + r, H[1] - r), iz = clamp(q[2], -H[2] + r, H[2] - r);
      ox = q[0] - ix; oy = q[1] - iy; oz = q[2] - iz;
      var l = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (l < 1e-9) { ox = N[i]; oy = N[i + 1]; oz = N[i + 2]; l = 1; }
      ox /= l; oy /= l; oz /= l;
      P[i] = ix + ox * r; P[i + 1] = iy + oy * r; P[i + 2] = iz + oz * r;
      N[i] = ox; N[i + 1] = oy; N[i + 2] = oz;
    }
    return g;
  }
  function lathe(pts, seg, phi0, phiL) {
    var v = [];
    for (var i = 0; i < pts.length; i++) v.push(new THREE.Vector2(pts[i][0], pts[i][1]));
    return new THREE.LatheGeometry(v, seg, phi0 || 0, phiL || TAU);
  }
  // flat band (strap) along points with given surface normals: rectangular section w x th
  function bandGeo(pts, nrm, w, th) {
    var n = pts.length, pos = new Float32Array(n * 8 * 3), nor = new Float32Array(n * 8 * 3), uv = new Float32Array(n * 8 * 2);
    var T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), i, f;
    // faces: [normal sign along N, along B] corners A,B (offset in (B,N) units)
    var faces = [
      { nb: 0, nn: 1, A: [-1, 1], Bc: [1, 1] },
      { nb: 0, nn: -1, A: [1, -1], Bc: [-1, -1] },
      { nb: 1, nn: 0, A: [1, 1], Bc: [1, -1] },
      { nb: -1, nn: 0, A: [-1, -1], Bc: [-1, 1] }
    ];
    var len = 0;
    for (i = 0; i < n; i++) {
      var p = pts[i], pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(n - 1, i + 1)];
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      T.subVectors(pb, pa).normalize();
      N.copy(nrm[i]); N.addScaledVector(T, -T.dot(N)).normalize();
      B.crossVectors(N, T).normalize();
      for (f = 0; f < 4; f++) {
        var F = faces[f];
        for (var c = 0; c < 2; c++) {
          var cc = c === 0 ? F.A : F.Bc, k = (i * 8 + f * 2 + c);
          pos[k * 3] = p.x + B.x * cc[0] * w / 2 + N.x * cc[1] * th / 2;
          pos[k * 3 + 1] = p.y + B.y * cc[0] * w / 2 + N.y * cc[1] * th / 2;
          pos[k * 3 + 2] = p.z + B.z * cc[0] * w / 2 + N.z * cc[1] * th / 2;
          nor[k * 3] = B.x * F.nb + N.x * F.nn; nor[k * 3 + 1] = B.y * F.nb + N.y * F.nn; nor[k * 3 + 2] = B.z * F.nb + N.z * F.nn;
          uv[k * 2] = c; uv[k * 2 + 1] = len / w;
        }
      }
    }
    var idx = [];
    for (i = 0; i < n - 1; i++) for (f = 0; f < 4; f++) {
      var a = i * 8 + f * 2, b = a + 1, a1 = a + 8, b1 = b + 8;
      idx.push(a, a1, b, b, a1, b1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  function mesh(geo, mat, cast, recv) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = cast !== false; m.receiveShadow = !!recv;
    return m;
  }
  function pose(obj) {
    obj.updateMatrixWorld(true);
    var p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    obj.matrixWorld.decompose(p, q, s);
    return { position: p, quaternion: q };
  }

  // ================================================================== factory
  GF.createProps = function (opts) {
    opts = opts || {};
    var low = !!opts.low;
    var POS = GF.POS;
    var root = new THREE.Group(); root.name = 'props';

    // ---------------------------------------------------------------- textures (6)
    var woodTex = pixTex(256, 256, function (x, y, o) {
      var u = x / 256, v = y / 256;
      var warp = pfbm(u * 2, v * 3, 2, 3, 3, 11);
      var ring = Math.sin((v * 14 + warp * 2.4) * TAU) * 0.5 + 0.5;
      ring = ring * ring * ring;
      var streak = pnoise(u * 6, v * 96, 6, 96, 5);
      var pore = pnoise(u * 32, v * 192, 32, 192, 9);
      var l = 0.90 - ring * 0.17 - streak * 0.07 - (pore > 0.78 ? (pore - 0.78) * 0.5 : 0);
      o[0] = 255 * l; o[1] = 255 * l * 0.84; o[2] = 255 * l * 0.66;
    }, { repeat: [1, 1] });
    var terryTex = pixTex(256, 256, function (x, y, o) {
      var u = x / 256, v = y / 256;
      var n = pnoise(u * 64, v * 64, 64, 64, 3) * 0.55 + pnoise(u * 128, v * 128, 128, 128, 4) * 0.25 + pnoise(u * 16, v * 16, 16, 16, 5) * 0.2;
      var c = 255 * clamp((n - 0.5) * 1.6 + 0.5, 0, 1); o[0] = o[1] = o[2] = c;
    }, { srgb: false, repeat: [1, 1] });
    var borderTex = GF.canvasTex(256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#f8ece6'; ctx.fillRect(0, 0, w, h);
      function band(x0) {
        ctx.fillStyle = '#f1dcd6'; ctx.fillRect(x0, 0, 15, h);
        ctx.fillStyle = '#e0b9b5'; ctx.fillRect(x0 + 1, 0, 2, h); ctx.fillRect(x0 + 12, 0, 2, h);
        ctx.fillStyle = '#ebcfca'; for (var y = 0; y < h; y += 4) { ctx.fillRect(x0 + 5, y, 2, 2); ctx.fillRect(x0 + 8, y + 2, 2, 2); }
      }
      band(10); band(w - 25);
      ctx.fillStyle = '#efdfd8'; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3); ctx.fillRect(0, 0, 3, h); ctx.fillRect(w - 3, 0, 3, h);
    });
    var leatherTex = pixTex(256, 256, function (x, y, o) {
      var u = x / 256, v = y / 256;
      var n = pfbm(u * 28, v * 28, 28, 28, 2, 21);
      var cr = Math.abs(pnoise(u * 9, v * 9, 9, 9, 23) - 0.5);
      var c = clamp(0.5 + (n - 0.5) * 1.5 - (cr < 0.03 ? (0.03 - cr) * 8 : 0), 0, 1) * 255;
      o[0] = o[1] = o[2] = c;
    }, { srgb: false, repeat: [1, 1] });
    var tissueTex = pixTex(128, 128, function (x, y, o) {
      var u = x / 128, v = y / 128;
      var c = 0.55 + 0.16 * Math.sin(u * TAU * 8) * Math.sin(v * TAU * 8) + 0.25 * (pnoise(u * 32, v * 32, 32, 32, 7) - 0.5);
      o[0] = o[1] = o[2] = clamp(c, 0, 1) * 255;
    }, { srgb: false, repeat: [1, 1] });
    var glitterTex = pixTex(128, 128, function (x, y, o) {
      var cx = x >> 2, cy = y >> 2, r = h2(cx, cy, 31);
      var nx = 0, ny = 0;
      if (r < 0.45) { nx = (h2(cx, cy, 32) - 0.5) * 1.1; ny = (h2(cx, cy, 33) - 0.5) * 1.1; }
      o[0] = (nx * 0.5 + 0.5) * 255; o[1] = (ny * 0.5 + 0.5) * 255; o[2] = 255;
    }, { srgb: false, repeat: [7, 7] });

    var heatTex = GF.canvasTex(64, 64, function (ctx, w, h) {
      ctx.fillStyle = '#100c0b'; ctx.fillRect(0, 0, w, h);
      for (var y = 3; y < h - 8; y += 6) { ctx.fillStyle = '#ffb070'; ctx.fillRect(0, y, w, 2); ctx.fillStyle = '#a04a20'; ctx.fillRect(0, y + 2, w, 1); }
      ctx.fillStyle = '#100c0b'; for (var x = 0; x < w; x += 16) ctx.fillRect(x, 0, 3, h);
    });
    // ---------------------------------------------------------------- materials
    var M = {
      dryer: new THREE.MeshPhysicalMaterial({ color: 0xebc6b8, metalness: 0.28, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, vertexColors: true }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xf4f1ee, metalness: 1, roughness: 0.1, vertexColors: true }),
      heat: new THREE.MeshStandardMaterial({ color: 0x2a2220, map: heatTex, roughness: 0.7, emissive: 0xff7a30, emissiveMap: heatTex, emissiveIntensity: 0 }),
      cord: new THREE.MeshStandardMaterial({ color: 0xd8c3bb, roughness: 0.5 }),
      stand: new THREE.MeshPhysicalMaterial({ color: 0xf2eee9, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
      oak: new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xffffff, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
      lacquer: new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0x9a4c34, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 }),
      beech: new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xfff4e6, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x2c2627, roughness: 0.6 }),
      pins: new THREE.MeshPhysicalMaterial({ color: 0x1c191a, roughness: 0.3, clearcoat: 0.6 }),
      ceramic: new THREE.MeshPhysicalMaterial({ color: 0xc9d5c6, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.04 }),
      tissueFly: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.92, side: THREE.DoubleSide, bumpMap: tissueTex, bumpScale: 0.5, vertexColors: true, alphaHash: true }),
      tissue: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.92, side: THREE.DoubleSide, bumpMap: tissueTex, bumpScale: 0.5 }),
      velvet: new THREE.MeshPhysicalMaterial({ color: 0xb06a76, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0.75, 0.42, 0.48), sheenRoughness: 0.45 }),
      mirror: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 1, roughness: 0.03 }),
      brass: new THREE.MeshPhysicalMaterial({ color: 0xdcb065, metalness: 1, roughness: 0.24, clearcoat: 0.4 }),
      enamel: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe2b860, metalness: 1, roughness: 0.22 }),
      nickel: new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.2 }),
      satin: new THREE.MeshPhysicalMaterial({ color: 0xb5142e, roughness: 0.3, sheen: 1, sheenColor: new THREE.Color(1.0, 0.5, 0.56), sheenRoughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
      daisy: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(1, 1, 1), side: THREE.DoubleSide }),
      star: new THREE.MeshPhysicalMaterial({ color: 0xebbd4e, metalness: 1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: glitterTex, normalScale: new THREE.Vector2(0.4, 0.4) }),
      leather: new THREE.MeshPhysicalMaterial({ color: 0xb48ccd, roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4, bumpMap: leatherTex, bumpScale: 0.35, sheen: 0.25, sheenColor: new THREE.Color(1, 1, 1) }),
      terry: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: borderTex, bumpMap: terryTex, bumpScale: 1.4, roughness: 1, sheen: 1, sheenColor: new THREE.Color(1, 0.97, 0.95), sheenRoughness: 0.5, side: THREE.DoubleSide }),
      skin: new THREE.MeshPhysicalMaterial({ color: 0xeab394, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(1, 0.84, 0.77), transparent: true, opacity: 0, depthWrite: false, vertexColors: true, emissive: 0x4a2014, emissiveIntensity: 0.3 })
    };
    borderTex.channel = 1;
    var terryRep = 1 / 0.07; // terry tile 7 cm (uv0 in metres * this)

    // ================================================================ DRYER
    var dryer = (function () {
      var seg = low ? 22 : 34;
      var g = new THREE.Group(); g.name = 'dryer';
      var BY = 0.09, HA = 0.26;
      var U = [0, 1, 0], V = [1, 0, 0];   // barrel rings: a vertical, b horizontal; progress +Z
      var body = [
        [-0.0790, 0.0268, 0.0268, 2, 1], [-0.0832, 0.0300, 0.0300, 2, 1], [-0.0840, 0.0324, 0.0324, 2, 1],
        [-0.0822, 0.0352, 0.0352, 2, 1], [-0.0772, 0.0370, 0.0370, 2, 1], [-0.0650, 0.0379, 0.0379, 2, 1],
        [-0.0300, 0.0383, 0.0383, 2, 1], [0.0200, 0.0379, 0.0379, 2, 1], [0.0480, 0.0363, 0.0363, 2, 1],
        [0.0640, 0.0338, 0.0338, 2, 1], [0.0720, 0.0312, 0.0312, 2, 1], [0.0745, 0.0296, 0.0296, 2, 1],
        [0.0770, 0.0287, 0.0290, 2.1, 0.84], [0.0900, 0.0240, 0.0312, 2.5, 0.84], [0.1060, 0.0160, 0.0342, 3.2, 0.84],
        [0.1200, 0.0102, 0.0362, 4.0, 0.84], [0.1262, 0.0088, 0.0360, 4.0, 0.84], [0.1274, 0.0072, 0.0346, 4.0, 0.8],
        [0.1262, 0.0059, 0.0333, 4.0, 0.45], [0.1180, 0.0063, 0.0325, 4.0, 0.2], [0.1050, 0.0110, 0.0300, 3.2, 0.1],
        [0.0955, 0.0150, 0.0276, 2.6, 0.08]
      ];
      var rings = body.map(function (r) { return { c: [0, BY, r[0]], u: U, v: V, a: r[1], b: r[2], n: r[3], s: r[4] }; });
      var gBarrel = loft(rings, seg);
      // handle
      var cH = Math.cos(HA), sH = Math.sin(HA);
      var dA = [0, cH, sH], hv = [0, -sH, cH], hu = [1, 0, 0];
      function hp(t) { return [0, cH * t, sH * t]; }
      var htab = [[-0.0690, 0.0030, 0.0025, 2, 1], [-0.0676, 0.0095, 0.0080, 2.4, 1], [-0.0642, 0.0128, 0.0108, 2.6, 1],
        [-0.0580, 0.0142, 0.0120, 2.8, 1], [-0.0200, 0.0150, 0.0126, 2.8, 1], [0.0200, 0.0160, 0.0133, 2.8, 1],
        [0.0450, 0.0170, 0.0142, 2.7, 1], [0.0580, 0.0190, 0.0166, 2.4, 1], [0.0680, 0.0216, 0.0200, 2.2, 1], [0.0820, 0.0216, 0.0200, 2.2, 1]];
      var gHandle = loft(htab.map(function (r) { return { c: hp(r[0]), u: hu, v: hv, a: r[1], b: r[2], n: r[3], s: r[4] }; }), seg);
      var stab = [[-0.0600, 0.0066], [-0.0700, 0.0062], [-0.0790, 0.0054], [-0.0870, 0.0047], [-0.0890, 0.0040], [-0.0896, 0.0025]];
      var gRelief = loft(stab.map(function (r) { return { c: hp(r[0]), u: hu, v: hv, a: r[1], b: r[1], n: 2, s: 0.78 }; }), 14);
      // switch track (dark recess) on the front of the handle
      var basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dA[0], dA[1], dA[2]), new THREE.Vector3(hv[0], hv[1], hv[2]));
      var track = paint(rbox(0.0085, 0.028, 0.002, 0.0009, 2), 0.18, 0.15, 0.15);
      var tp = hp(0.012);
      track.applyMatrix4(new THREE.Matrix4().copy(basis).setPosition(tp[0] + hv[0] * 0.0129, tp[1] + hv[1] * 0.0129, tp[2] + hv[2] * 0.0129));
      var bodyMesh = mesh(merge([gBarrel, gHandle, gRelief, track]), M.dryer, true, true);
      g.add(bodyMesh);
      // chrome: rear grille + front ring
      var gp = [[0.0272, 0.0006]], kR;
      for (kR = 0; kR < 7; kR++) {
        var r0 = 0.0265 - kR * 0.0036;
        gp.push([r0 - 0.0004, 0.0016], [r0 - 0.0014, 0.0016], [r0 - 0.0018, -0.0008], [r0 - 0.0032, -0.0008]);
      }
      gp.push([0.0012, 0.0024], [0, 0.0026]);
      var grille = lathe(gp, seg);
      (function () {
        var P = grille.attributes.position.array, n = P.length / 3, col = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) { var c = P[i * 3 + 1] < 0 ? 0.16 : 1; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
        grille.setAttribute('color', new THREE.BufferAttribute(col, 3));
      })();
      xf(grille, [0, BY, -0.0795], [-PI / 2, 0, 0]);
      var ring = paint(new THREE.TorusGeometry(0.0301, 0.0026, 10, seg + 8), 1, 1, 1);
      xf(ring, [0, BY, 0.0738]);
      var chromeMesh = mesh(merge([grille, ring]), M.chrome, true, false);
      g.add(chromeMesh);
      // slide switch
      var knob = mesh(paint(rbox(0.0090, 0.011, 0.0042, 0.0016, 2), 1, 1, 1), M.chrome, false, false);
      knob.matrixAutoUpdate = true;
      knob.quaternion.setFromRotationMatrix(basis);
      g.add(knob);
      function placeKnob(v) {
        var t = lerp(0.004, 0.020, v), p = hp(t), off = 0.0133 + 0.0016;
        knob.position.set(p[0] + hv[0] * off, p[1] + hv[1] * off, p[2] + hv[2] * off);
      }
      placeKnob(0);
      // heater glow disc inside the nozzle
      var heat = mesh(loft([{ c: [0, BY, 0.0960], u: U, v: V, a: 0.0152, b: 0.0278, n: 2.6 }, { c: [0, BY, 0.0960], u: U, v: V, a: 0.0002, b: 0.0002, n: 2 }], seg), M.heat, false, false);
      g.add(heat);
      var nozzle = new THREE.Object3D(); nozzle.name = 'dryerNozzle'; nozzle.position.set(0, BY, 0.1275); g.add(nozzle);

      // ---- stand (weighted base + post + ring round the handle)
      var stand = new THREE.Group(); stand.name = 'dryerStand';
      stand.position.set(POS.dryerStand[0], POS.dryerStand[1], POS.dryerStand[2]);
      var beta = Math.atan2(-0.82, -0.57);
      var gripY = 0.0125 + 0.006 + 0.0896;              // strain relief end hovers 6 mm above the base
      var ringH = gripY + 0.040;
      var side = new THREE.Vector3(0.57, 0, -0.82).normalize();   // post on the far side of the barrel
      var base = lathe([[0, 0], [0.046, 0], [0.0490, 0.0016], [0.0502, 0.0055], [0.0494, 0.0098], [0.0468, 0.0122], [0.040, 0.0127], [0, 0.0127]], seg + 6);
      var postH = ringH - 0.0127;
      var post = new THREE.CylinderGeometry(0.0052, 0.0060, postH, 14, 1, true);
      xf(post, [side.x * 0.0215, 0.0127 + postH / 2, side.z * 0.0215]);
      var cap = new THREE.SphereGeometry(0.0062, 12, 8); xf(cap, [side.x * 0.0215, ringH, side.z * 0.0215]);
      var tor = new THREE.TorusGeometry(0.0215, 0.0034, 10, 36); xf(tor, [0, ringH, 0], [PI / 2, 0, 0]);
      var standMesh = mesh(merge([base, post, cap, tor]), M.stand, true, true);
      stand.add(standMesh);
      root.add(stand);
      var qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -HA);
      var qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), beta);
      var home = { position: new THREE.Vector3(POS.dryerStand[0], POS.dryerStand[1] + gripY, POS.dryerStand[2]), quaternion: qb.multiply(qa) };
      g.position.copy(home.position); g.quaternion.copy(home.quaternion);
      root.add(g);

      // ---- power cord
      var ND = low ? 34 : 46, TAIL = [[0.543, 0.7029, -0.688], [0.547, 0.6995, -0.716], [0.550, 0.672, -0.729], [0.551, 0.38, -0.731]];
      var CN = ND + TAIL.length, CRS = 6, CR = 0.0029;
      var cP = new Float32Array(CN * 3);
      for (var ti = 0; ti < TAIL.length; ti++) { cP[(ND + ti) * 3] = TAIL[ti][0]; cP[(ND + ti) * 3 + 1] = TAIL[ti][1]; cP[(ND + ti) * 3 + 2] = TAIL[ti][2]; }
      var cpos = new Float32Array(CN * CRS * 3), cnor = new Float32Array(CN * CRS * 3), cidx = [];
      for (var ci = 0; ci < CN - 1; ci++) for (var cr = 0; cr < CRS; cr++) {
        var a = ci * CRS + cr, b = ci * CRS + (cr + 1) % CRS, c = (ci + 1) * CRS + cr, d = (ci + 1) * CRS + (cr + 1) % CRS;
        cidx.push(a, b, c, b, d, c);
      }
      var cgeo = new THREE.BufferGeometry();
      cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
      cgeo.setAttribute('normal', new THREE.BufferAttribute(cnor, 3));
      cgeo.setIndex(cidx);
      var cordMesh = mesh(cgeo, M.cord, true, false); cordMesh.frustumCulled = false; cordMesh.name = 'dryerCord';
      root.add(cordMesh);
      var CS = hp(-0.0860), CD = [-dA[0], -dA[1], -dA[2]];
      var vS = new THREE.Vector3(), vT = new THREE.Vector3(), vB = new THREE.Vector3(TAIL[0][0], 0, 0), mA = new THREE.Matrix4(), mI = new THREE.Matrix4();
      var vN = new THREE.Vector3(), vBn = new THREE.Vector3(), vTi = new THREE.Vector3(), vW = new THREE.Vector3();
      var SC = POS.dryerStand;
      function cordFloor(x, z) {
        if (x > -0.56 && x < 0.56 && z > -0.72 && z < -0.22) {
          var dx = x - SC[0], dz = z - SC[2];
          return dx * dx + dz * dz < 0.0025 ? 0.7127 : 0.70;
        }
        // just outside the top: the cord drapes over the edge instead of cutting through the dresser
        var ox = x < -0.56 ? -0.56 - x : (x > 0.56 ? x - 0.56 : 0), oz = z < -0.72 ? -0.72 - z : (z > -0.22 ? z + 0.22 : 0);
        var dO = Math.sqrt(ox * ox + oz * oz);
        return Math.max(0, 0.70 - dO * 4.5);
      }
      function updateCord() {
        root.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false);
        mI.copy(root.matrixWorld).invert();
        mA.multiplyMatrices(mI, g.matrixWorld);
        vS.set(CS[0], CS[1], CS[2]).applyMatrix4(mA);
        vT.set(CD[0], CD[1], CD[2]).transformDirection(mA);
        var Ax = vS.x, Ay = vS.y, Az = vS.z, Bx = 0.540, By = 0.70 + CR, Bz = -0.62;
        var dx = Bx - Ax, dy = By - Ay, dz = Bz - Az, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var k1 = 0.30 * d + 0.03, k2 = 0.35 * d + 0.03;
        var sag = 0.05 + 0.22 * d;
        vW.set(dz, 0, -dx); var wl = vW.length(); if (wl > 1e-5) vW.multiplyScalar(1 / wl); else vW.set(1, 0, 0);
        var i, s;
        for (i = 0; i < ND; i++) {
          s = i / (ND - 1);
          var s2 = s * s, s3 = s2 * s;
          var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
          var x = h00 * Ax + h10 * vT.x * k1 + h01 * Bx + h11 * 0;
          var y = h00 * Ay + h10 * vT.y * k1 + h01 * By + h11 * 0;
          var z = h00 * Az + h10 * vT.z * k1 + h01 * Bz + h11 * (-k2);
          var bell = Math.sin(PI * s);
          y -= sag * Math.pow(bell, 0.8) * sstep(0, 0.15, s);
          var wig = 0.022 * Math.sin(TAU * s * 1.3 + 0.7) * bell * Math.min(1, d * 2);
          x += vW.x * wig; z += vW.z * wig;
          cP[i * 3] = x; cP[i * 3 + 1] = y; cP[i * 3 + 2] = z;
        }
        for (var pass = 0; pass < 5; pass++) {
          for (i = 0; i < ND; i++) {
            if (pass > 0 && i > 2 && i < ND - 1) {
              cP[i * 3] = 0.5 * cP[i * 3] + 0.25 * (cP[i * 3 - 3] + cP[i * 3 + 3]);
              cP[i * 3 + 1] = 0.5 * cP[i * 3 + 1] + 0.25 * (cP[i * 3 - 2] + cP[i * 3 + 4]);
              cP[i * 3 + 2] = 0.5 * cP[i * 3 + 2] + 0.25 * (cP[i * 3 - 1] + cP[i * 3 + 5]);
            }
            if (i > 1) { var fl = cordFloor(cP[i * 3], cP[i * 3 + 2]) + CR; if (cP[i * 3 + 1] < fl) cP[i * 3 + 1] = fl; }
          }
        }
        // parallel-transport frames + ring vertices
        for (i = 0; i < CN; i++) {
          var ia = Math.max(0, i - 1), ib = Math.min(CN - 1, i + 1);
          vTi.set(cP[ib * 3] - cP[ia * 3], cP[ib * 3 + 1] - cP[ia * 3 + 1], cP[ib * 3 + 2] - cP[ia * 3 + 2]);
          var tl = vTi.length(); if (tl < 1e-7) vTi.set(0, -1, 0); else vTi.multiplyScalar(1 / tl);
          if (i === 0) { vN.set(1, 0, 0); if (Math.abs(vTi.x) > 0.9) vN.set(0, 1, 0); }
          vN.addScaledVector(vTi, -vTi.dot(vN));
          var nl = vN.length(); if (nl < 1e-6) { vN.set(0, 0, 1).addScaledVector(vTi, -vTi.z); nl = vN.length() || 1; }
          vN.multiplyScalar(1 / nl);
          vBn.crossVectors(vTi, vN);
          for (var r = 0; r < CRS; r++) {
            var an = r / CRS * TAU, co = Math.cos(an), si = Math.sin(an), k = (i * CRS + r) * 3;
            var nx = co * vN.x + si * vBn.x, ny = co * vN.y + si * vBn.y, nz = co * vN.z + si * vBn.z;
            cnor[k] = nx; cnor[k + 1] = ny; cnor[k + 2] = nz;
            cpos[k] = cP[i * 3] + nx * CR; cpos[k + 1] = cP[i * 3 + 1] + ny * CR; cpos[k + 2] = cP[i * 3 + 2] + nz * CR;
          }
        }
        cgeo.attributes.position.needsUpdate = true; cgeo.attributes.normal.needsUpdate = true;
      }
      updateCord();

      var setGlow = GF.makeGlow([bodyMesh]);
      var on = false, onCur = 0;
      return {
        group: g, nozzle: nozzle, home: home, stand: stand, cord: cordMesh,
        setOn: function (v) { on = !!v; },
        setGlow: setGlow,
        updateCord: updateCord,
        _update: function (dt) {
          var tgt = on ? 1 : 0;
          if (Math.abs(onCur - tgt) < 0.0005) { if (onCur === tgt) return; onCur = tgt; }
          else onCur = GF.damp(onCur, tgt, 9, dt);
          placeKnob(clamp(onCur * 1.6, 0, 1));
          M.heat.emissiveIntensity = 1.6 * onCur * onCur;
        }
      };
    })();

    // ================================================================ BRUSH (+ cup)
    var brush = (function () {
      var seg = low ? 20 : 30;
      var g = new THREE.Group(); g.name = 'brush';
      var HC = 0.105, HHy = 0.052, HW = 0.037, TOP = HC + HHy, BH = 0.0095;
      var tabH = [[-0.0690, 0.0030, 0.0022], [-0.0678, 0.0075, 0.0052], [-0.0655, 0.0105, 0.0072], [-0.0620, 0.0119, 0.0082],
        [-0.0560, 0.0125, 0.0087], [-0.020, 0.0122, 0.0089], [0.020, 0.0108, 0.0086], [0.042, 0.0097, 0.0082], [0.30, 0.0097, 0.0082]];
      function hab(y, out) {
        for (var i = 0; i < tabH.length - 1; i++) if (y <= tabH[i + 1][0]) {
          var t = (y - tabH[i][0]) / (tabH[i + 1][0] - tabH[i][0]);
          out[0] = lerp(tabH[i][1], tabH[i + 1][1], t); out[1] = lerp(tabH[i][2], tabH[i + 1][2], t); return out;
        }
        out[0] = tabH[tabH.length - 1][1]; out[1] = tabH[tabH.length - 1][2]; return out;
      }
      function headA(y) { var t = Math.abs((y - HC) / HHy); if (t >= 1) return 0; return HW * Math.pow(1 - Math.pow(t, 2.6), 1 / 2.6); }
      var ys = [-0.0690, -0.0678, -0.0655, -0.0620, -0.0560, -0.040, -0.020, 0, 0.020, 0.034, 0.042];
      for (var y = 0.047; y < TOP - 0.004; y += 0.0042) ys.push(y);
      ys.push(TOP - 0.0030, TOP - 0.0016, TOP - 0.0006, TOP - 0.00005);
      var rows = [], hb = [0, 0];
      ys.forEach(function (yy) {
        hab(yy, hb);
        var w = sstep(0.046, 0.066, yy);
        var aH = hb[0] * (1 - sstep(0.06, 0.085, yy));
        var a = Math.max(aH, headA(yy));
        var b = lerp(hb[1], BH, w);
        var dtp = TOP - yy; if (dtp < BH) b = BH * Math.sqrt(Math.max(0.02, 1 - Math.pow((BH - dtp) / BH, 2)));
        rows.push({ y: yy, a: a, b: b, n: lerp(2.3, 4.2, w) });
      });
      for (var pass = 0; pass < 2; pass++) for (var ri = 1; ri < rows.length - 1; ri++) if (rows[ri].y > 0.03 && rows[ri].y < 0.075) rows[ri].a = (rows[ri - 1].a + 2 * rows[ri].a + rows[ri + 1].a) / 4;
      var gBody = loft(rows.map(function (r) { return { c: [0, r.y, 0], u: [1, 0, 0], v: [0, 0, 1], a: Math.max(r.a, 0.0002), b: Math.max(r.b, 0.0002), n: r.n }; }), seg);
      (function () { // wood uv: grain along the length
        var P = gBody.attributes.position.array, UV = gBody.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 3 + P[i * 3 + 2] * 3 + 0.3; UV[i * 2 + 1] = P[i * 3 + 1] * 1.6; }
      })();
      var bodyMesh = mesh(gBody, M.beech, true, true); g.add(bodyMesh);
      // cushion pad (faces -Z)
      var PA = 0.0285, PB = 0.0445, PN = 2.6;
      function padZ(r) { return -(BH + 0.0005 + 0.0034 * (1 - Math.pow(Math.min(1, r), 4))); }
      var prow = [];
      var rr = [0.0, 0.25, 0.5, 0.7, 0.85, 0.95, 1.0, 1.04];
      rr.forEach(function (r) { var z = r >= 1.0 ? (r > 1.01 ? -BH + 0.0015 : -BH - 0.0007) : padZ(r); prow.push({ c: [0, HC, z], u: [1, 0, 0], v: [0, 1, 0], a: Math.max(r, 0.002) * PA, b: Math.max(r, 0.002) * PB, n: PN }); });
      var padMesh = mesh(loft(prow, seg + 6, true), M.rubber, true, false); g.add(padMesh);
      // pins with ball tips (instanced)
      var L = 0.0125;
      var pinG = new THREE.CylinderGeometry(0.00062, 0.00078, L, 6, 1, true); xf(pinG, [0, 0, -L / 2], [PI / 2, 0, 0]);
      var ballG = new THREE.SphereGeometry(0.00155, 8, 6); xf(ballG, [0, 0, -L]);
      var pinGeo = merge([pinG, ballG]);
      var pinsList = [], sp = low ? 0.0085 : 0.0068, row = 0;
      for (var py = -PB + 0.006; py <= PB - 0.006; py += sp, row++) {
        for (var px = -PA + (row % 2 ? sp / 2 : 0); px <= PA; px += sp) {
          var rn = Math.pow(Math.pow(Math.abs(px / PA), PN) + Math.pow(Math.abs(py / PB), PN), 1 / PN);
          if (rn > 0.84) continue;
          pinsList.push([px, py, rn]);
        }
      }
      var pins = new THREE.InstancedMesh(pinGeo, M.pins, pinsList.length);
      var m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), mz = new THREE.Vector3(0, 0, -1), pv = new THREE.Vector3();
      pinsList.forEach(function (p, i) {
        dir.set(p[0] / PA * 0.16, p[1] / PB * 0.16, -1).normalize();
        q4.setFromUnitVectors(mz, dir);
        pv.set(p[0], HC + p[1], padZ(p[2]) + 0.0004);
        m4.compose(pv, q4, one); pins.setMatrixAt(i, m4);
      });
      pins.castShadow = true; g.add(pins);
      // cup
      var cup = lathe([[0, 0], [0.030, 0], [0.0322, 0.0014], [0.0328, 0.004], [0.0342, 0.030], [0.0356, 0.070], [0.0359, 0.0788], [0.0352, 0.0814],
        [0.0338, 0.0812], [0.0328, 0.0790], [0.0320, 0.070], [0.0304, 0.013], [0.0284, 0.0085], [0, 0.0082]], low ? 24 : 36);
      var cupMesh = mesh(cup, M.ceramic, true, true);
      cupMesh.position.set(POS.brushCup[0], POS.brushCup[1], POS.brushCup[2]);
      root.add(cupMesh);
      // home: handle-down in the cup, bristles toward the camera, leaning back
      var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.30))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI));
      var end = new THREE.Vector3(POS.brushCup[0] - 0.002, POS.brushCup[1] + 0.0112, POS.brushCup[2] + 0.010);
      var up = new THREE.Vector3(0, 0.0690, 0).applyQuaternion(q);
      var home = { position: end.clone().add(up), quaternion: q };
      g.position.copy(home.position); g.quaternion.copy(home.quaternion);
      root.add(g);
      return { group: g, home: home, cup: cupMesh, setGlow: GF.makeGlow([bodyMesh]) };
    })();

    // ================================================================ surfaces (for tissues)
    var TB = POS.tissueBox, MB = POS.musicBox, DS = POS.dryerStand, BC = POS.brushCup;
    function surfaceY(x, z) {
      if (x > -0.56 && x < 0.56 && z > -0.72 && z < -0.22) {
        if (Math.abs(x - TB[0]) < 0.111 && Math.abs(z - TB[2]) < 0.058) return 0.7755;
        if (Math.abs(x - MB[0]) < 0.074 && Math.abs(z - MB[2]) < 0.050) return 0.7858;
        var dx = x - DS[0], dz = z - DS[2]; if (dx * dx + dz * dz < 0.0025) return 0.7128;
        dx = x - BC[0]; dz = z - BC[2]; if (dx * dx + dz * dz < 0.0013) return 0.7815;
        return 0.70;
      }
      return 0;
    }

    // ================================================================ TISSUE BOX + flying tissues
    var tissue = (function () {
      var seg = low ? 28 : 44;
      var g = new THREE.Group(); g.name = 'tissueBox';
      g.position.set(TB[0], TB[1], TB[2]); g.rotation.y = 0.10;
      var A0 = 0.110, B0 = 0.0575, NO = 9;
      var R = [[0, 0.001, 0.001, NO], [0, A0 - 0.004, B0 - 0.004, NO], [0.0014, A0 - 0.0012, B0 - 0.0012, NO], [0.0045, A0, B0, NO],
        [0.0700, A0, B0, NO], [0.0736, A0 - 0.0012, B0 - 0.0012, NO], [0.0750, A0 - 0.0050, B0 - 0.0050, NO],
        [0.0750, 0.090, 0.044, 6], [0.0750, 0.068, 0.026, 3.2], [0.0750, 0.0545, 0.0150, 2.4], [0.0743, 0.0512, 0.0122, 2.2],
        [0.0715, 0.0503, 0.0113, 2.2], [0.0660, 0.0498, 0.0108, 2.2], [0.0650, 0.0010, 0.0010, 2]];
      var gBox = loft(R.map(function (r) { return { c: [0, r[0], 0], u: [1, 0, 0], v: [0, 0, 1], a: r[1], b: r[2], n: r[3], s: r[0] < 0.07 && r[1] < 0.06 ? 0.55 : 1 }; }), seg);
      (function () {
        var P = gBox.attributes.position.array, UV = gBox.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 4.0 + 0.1; UV[i * 2 + 1] = (P[i * 3 + 2] + P[i * 3 + 1]) * 6.0; }
      })();
      M.oak.vertexColors = true;
      var cover = mesh(gBox, M.oak, true, true); g.add(cover);
      // the tuft sticking out of the slot
      var tuftG = gridGeo(12, 9, function (u, v, o) {
        var s = u * 2 - 1, h = v;
        o[0] = s * (0.034 + 0.026 * h) + 0.004 * Math.sin(h * 3 + s);
        o[1] = 0.062 + h * 0.066 * (1 - 0.32 * s * s) + 0.006 * Math.sin(h * PI) * s;
        o[2] = 0.0035 * Math.sin(s * PI * 2.2 + h * 2.5) * (0.4 + h) + 0.014 * h * h * (0.6 - s * 0.5) - 0.002 * (1 - h);
      });
      var tuft = mesh(tuftG, M.tissue, true, false); g.add(tuft);
      root.add(g);

      // ---- flying tissues (one dynamic mesh)
      var NG = low ? 7 : 9, MAXT = 14, CAP = 12, S = 0.16, NVt = NG * NG;
      var pos = new Float32Array(NVt * MAXT * 3), nor = new Float32Array(NVt * MAXT * 3), col = new Float32Array(NVt * MAXT * 4), uvs = new Float32Array(NVt * MAXT * 2);
      var idx = [], i, j, k;
      for (k = 0; k < MAXT; k++) for (j = 0; j < NG - 1; j++) for (i = 0; i < NG - 1; i++) {
        var a = k * NVt + j * NG + i; idx.push(a, a + 1, a + NG, a + 1, a + NG + 1, a + NG);
      }
      for (k = 0; k < MAXT * NVt; k++) { col[k * 4] = col[k * 4 + 1] = col[k * 4 + 2] = 1; col[k * 4 + 3] = 1; var gi = k % NVt; uvs[k * 2] = (gi % NG) / (NG - 1) * 1.25; uvs[k * 2 + 1] = Math.floor(gi / NG) / (NG - 1) * 1.25; }
      var tgeo = new THREE.BufferGeometry();
      tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      tgeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      tgeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      tgeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      tgeo.setIndex(idx);
      var fly = mesh(tgeo, M.tissueFly, true, true); fly.frustumCulled = false; fly.name = 'tissues';
      root.add(fly);
      var rnd = GF.rng(4242);
      var wr = new Float32Array(MAXT * NVt);
      for (k = 0; k < wr.length; k++) wr[k] = rnd() - 0.5;
      var slots = [];
      for (k = 0; k < MAXT; k++) slots.push({
        id: k, active: false, phase: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, pz: 0,
        q: new THREE.Quaternion(), w: new THREE.Vector3(), landQ: new THREE.Quaternion(), flatQ: new THREE.Quaternion(),
        age: 0, unf: 1, sb: 0, flip: 1, surf: 0, alpha: 1, fading: false, born: 0, flut: 0, ph1: 0, ph2: 0, dirty: true, seed: 0
      });
      var clock = 0, lastLaunch = -10, gap = 0.4, tuftUp = 1, count = 0, born = 0;
      var tv = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tm = new THREE.Matrix4();
      var ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(), slotPos = new THREE.Vector3();
      var QX_DOWN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PI / 2);
      var QX_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), PI / 2);
      var YAX = new THREE.Vector3(0, 1, 0);

      function hideSlot(s) {
        var o = s.id * NVt * 3;
        for (var v = 0; v < NVt; v++) { pos[o + v * 3] = TB[0]; pos[o + v * 3 + 1] = TB[1] + 0.03; pos[o + v * 3 + 2] = TB[2]; }
        s.dirty = true;
      }
      function flatTarget(s, out) {
        ax.set(1, 0, 0).applyQuaternion(s.q); az.set(0, 0, 1).applyQuaternion(s.q);
        var yaw = Math.atan2(-ax.z, ax.x);
        out.setFromAxisAngle(YAX, yaw);
        if (az.y >= 0) { out.multiply(QX_DOWN); return 1; }
        out.multiply(QX_UP); return -1;
      }
      // dresser-top fold: distance outside the top rectangle
      function writeSlot(s) {
        var o = s.id * NVt, sc = 0.22 + 0.78 * s.unf, sb = s.sb, fl = s.flut, t = s.age;
        var settledish = s.phase === 2;
        for (var jj = 0; jj < NG; jj++) for (var ii = 0; ii < NG; ii++) {
          var vi = jj * NG + ii, lx = (ii / (NG - 1) - 0.5) * S, ly = (jj / (NG - 1) - 0.5) * S;
          var r2 = (lx * lx + ly * ly) / (S * S * 0.25);
          var w0 = wr[o + vi];
          var fz = fl * (0.6 * Math.sin(lx * 38 + s.ph1 + t * 9.0) + 0.4 * Math.sin(ly * 31 - t * 7.3 + s.ph2)) * (0.35 + r2)
            + (1 - s.unf) * 0.028 * w0 + 0.022 * (lx * lx / (S * S * 0.25)) * (1 - sb) * Math.sin(s.ph1 + t * 2.3) + 0.012 * (ly * ly / (S * S * 0.25)) * Math.cos(s.ph2 + t * 1.7);
          var sz = s.flip * (0.0042 * w0 + 0.010 * Math.pow(Math.max(0, r2 - 0.45), 1.5) * (0.6 + 0.4 * Math.sin(s.ph2 + lx * 30)) + 0.0060 * (1 + Math.sin(lx * 22 + s.ph1) * Math.sin(ly * 16 + s.ph2 + lx * 9)) + 0.010 * Math.max(0, (lx + ly) / S * 1.4 + Math.sin(s.ph1 * 3) * 0.3 - 0.45));
          var lz = lerp(fz, sz, sb);
          tv.set(lx * sc, ly * sc, lz).applyQuaternion(s.q);
          var x = s.x + tv.x, y = s.y + tv.y, z = s.z + tv.z;
          var su = surfaceY(x, z);
          if (settledish && s.surf > 0.69) {
            // fold over the dresser edge
            var cx = clamp(x, -0.56, 0.56), cz = clamp(z, -0.72, -0.22), ddx = x - cx, ddz = z - cz, dOut = Math.sqrt(ddx * ddx + ddz * ddz);
            if (dOut > 1e-5) {
              var ox = ddx / dOut, oz = ddz / dOut;
              var RB = 0.008, qa = RB * PI / 2, hx2, hy2;
              if (dOut < qa) { var th = dOut / RB; hx2 = RB * Math.sin(th); hy2 = RB * (1 - Math.cos(th)); }
              else { hx2 = RB; hy2 = RB + (dOut - qa); }
              hx2 = lerp(dOut, hx2, sb); hy2 *= sb;
              x = cx + ox * (hx2 - RB * 0.75 * sb); z = cz + oz * (hx2 - RB * 0.75 * sb);
              y = 0.7012 - hy2 + (1 - sb) * Math.max(0, y - 0.70);
              su = 0;
            } else if (su < s.surf - 0.01) {
              y = Math.max(su + 0.0012, y - 0.9 * sb * 0.0);
            }
          }
          if (su - y > 0.09) {
            // below the dresser top: lean against the dresser's side instead of being lifted
            var ex0 = x + 0.5605, ex1 = 0.5605 - x, ez0 = z + 0.7205, ez1 = -0.2195 - z, em = Math.min(ex0, ex1, ez1);
            if (em === ex0) x = -0.5605; else if (em === ex1) x = 0.5605; else z = -0.2195;
            if (ez0 < em) z = -0.7205;
            su = 0;
          }
          if (y < su + 0.0012) y = su + 0.0012;
          var k3 = (o + vi) * 3;
          pos[k3] = x; pos[k3 + 1] = y; pos[k3 + 2] = z;
        }
        // normals
        for (jj = 0; jj < NG; jj++) for (ii = 0; ii < NG; ii++) {
          var i0 = (o + jj * NG + Math.max(0, ii - 1)) * 3, i1 = (o + jj * NG + Math.min(NG - 1, ii + 1)) * 3;
          var j0 = (o + Math.max(0, jj - 1) * NG + ii) * 3, j1 = (o + Math.min(NG - 1, jj + 1) * NG + ii) * 3;
          var ux = pos[i1] - pos[i0], uy = pos[i1 + 1] - pos[i0 + 1], uz = pos[i1 + 2] - pos[i0 + 2];
          var vx = pos[j1] - pos[j0], vy = pos[j1 + 1] - pos[j0 + 1], vz = pos[j1 + 2] - pos[j0 + 2];
          var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          var kk = (o + jj * NG + ii) * 3;
          nor[kk] = nx / nl; nor[kk + 1] = ny / nl; nor[kk + 2] = nz / nl;
          col[(o + jj * NG + ii) * 4 + 3] = s.alpha;
        }
        s.dirty = true;
      }
      for (k = 0; k < MAXT; k++) hideSlot(slots[k]);

      function aliveCount() { var n = 0; for (var q = 0; q < MAXT; q++) if (slots[q].active && !slots[q].fading) n++; return n; }
      function launch(dir, strength) {
        var s = null, q, oldest = null;
        for (q = 0; q < MAXT; q++) if (!slots[q].active) { s = slots[q]; break; }
        if (!s) { for (q = 0; q < MAXT; q++) if (!oldest || slots[q].born < oldest.born) oldest = slots[q]; s = oldest; }
        if (aliveCount() >= CAP) {
          oldest = null;
          for (q = 0; q < MAXT; q++) { var o2 = slots[q]; if (o2 !== s && o2.active && !o2.fading && (!oldest || (o2.phase === 2) > (oldest.phase === 2) || ((o2.phase === 2) === (oldest.phase === 2) && o2.born < oldest.born))) oldest = o2; }
          if (oldest) oldest.fading = true;
        }
        g.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
        slotPos.set(0, 0.10, 0).applyMatrix4(g.matrixWorld); tm.copy(root.matrixWorld).invert(); slotPos.applyMatrix4(tm);
        var hx = num(dir.x, 0), hz = num(dir.z, 0), hl = Math.sqrt(hx * hx + hz * hz);
        if (hl < 0.2) { var an = rnd() * TAU; hx = Math.cos(an); hz = Math.sin(an); hl = 1; }
        hx /= hl; hz /= hl;
        var sp = 0.55 + 0.65 * strength;
        s.active = true; s.phase = 1; s.fading = false; s.alpha = 1; s.age = 0; s.unf = 0; s.sb = 0; s.flip = 1; s.surf = 0;
        s.x = slotPos.x; s.y = slotPos.y; s.z = slotPos.z;
        s.vx = hx * sp + (rnd() - 0.5) * 0.3; s.vz = hz * sp + (rnd() - 0.5) * 0.3; s.vy = 0.75 + 0.35 * strength + rnd() * 0.2;
        s.px = -hz; s.pz = hx; s.seed = rnd() * TAU; s.ph1 = rnd() * TAU; s.ph2 = rnd() * TAU; s.flut = 0.012;
        s.born = ++born;
        // sheet faces the wind, upright
        az.set(hx, 0, hz); ay.set(0, 1, 0); ax.crossVectors(ay, az);
        tm.makeBasis(ax, ay, az); s.q.setFromRotationMatrix(tm);
        s.w.set((rnd() - 0.5) * 9, (rnd() - 0.5) * 5, (rnd() - 0.5) * 9);
        tuftUp = 0; count++;
        writeSlot(s);
      }
      function stepSlot(s, dt) {
        s.age += dt;
        if (s.phase === 1) {
          s.unf = Math.min(1, s.unf + dt / 0.28);
          var drag = 2.6, geff = 1.45;
          var sway = s.vy < 0 ? 0.42 * Math.sin(s.age * 4.6 + s.seed) : 0;
          s.vx += (-drag * s.vx + sway * s.px) * dt;
          s.vz += (-drag * s.vz + sway * s.pz) * dt;
          s.vy += (-geff - drag * s.vy) * dt;
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          // walls / mirror / room
          var zmin = s.y > 0.70 ? -0.655 : -0.715;
          if (s.z < zmin) { s.z = zmin; s.vz = Math.abs(s.vz) * 0.2; }
          if (s.x < -1.6) { s.x = -1.6; s.vx = Math.abs(s.vx) * 0.2; } if (s.x > 1.6) { s.x = 1.6; s.vx = -Math.abs(s.vx) * 0.2; }
          if (s.z > 1.6) { s.z = 1.6; s.vz = -Math.abs(s.vz) * 0.2; }
          // cannot enter the dresser block
          if (s.y < 0.695 && s.x > -0.575 && s.x < 0.575 && s.z > -0.73 && s.z < -0.205) {
            var dl = s.x + 0.575, dr = 0.575 - s.x, df = -0.205 - s.z, dm = Math.min(dl, dr, df);
            if (dm === dl) { s.x = -0.575; s.vx = -Math.abs(s.vx) * 0.3; } else if (dm === dr) { s.x = 0.575; s.vx = Math.abs(s.vx) * 0.3; } else { s.z = -0.205; s.vz = Math.abs(s.vz) * 0.3; }
          }
          // the girl (rough ellipsoid) pushes tissues aside
          var ex = s.x / 0.20, ey = (s.y - 0.72) / 0.33, ez = (s.z - 0.02) / 0.16, e = ex * ex + ey * ey + ez * ez;
          if (e < 1 && e > 1e-6) { var f = 1 / Math.sqrt(e); s.x *= f; s.y = 0.72 + (s.y - 0.72) * f; s.z = 0.02 + (s.z - 0.02) * f; s.vx *= 0.5; s.vz *= 0.5; }
          // tumbling
          var damp = Math.exp(-1.3 * dt); s.w.multiplyScalar(damp);
          var wl = s.w.length();
          if (wl > 1e-5) { ax.copy(s.w).multiplyScalar(1 / wl); tq.setFromAxisAngle(ax, wl * dt); s.q.premultiply(tq).normalize(); }
          var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
          s.flut = 0.004 + 0.010 * Math.min(1, sp / 0.6);
          var su = surfaceY(s.x, s.z), hgt = s.y - su;
          if (hgt < 0.12) { s.flip = flatTarget(s, tq2); s.q.slerp(tq2, Math.min(1, dt * 5 * (1 - hgt / 0.12))); s.w.multiplyScalar(Math.exp(-4 * dt)); }
          if (hgt <= 0.004 && s.vy <= 0) {
            s.y = su + 0.0015; s.surf = su; s.phase = 2; s.sb = 0;
            s.flip = flatTarget(s, s.flatQ); s.landQ.copy(s.q); s.vx = s.vy = s.vz = 0; s.w.set(0, 0, 0);
          }
          writeSlot(s);
        } else if (s.phase === 2) {
          if (s.sb < 1 || s.flut > 0.0002) {
            s.sb = Math.min(1, s.sb + dt / 0.45);
            s.q.slerpQuaternions(s.landQ, s.flatQ, GF.ease.out(s.sb));
            s.flut *= Math.exp(-6 * dt);
            if (s.flut <= 0.0002) s.flut = 0;
            writeSlot(s);
          }
        }
        if (s.fading) {
          s.alpha -= dt / 0.8;
          if (s.alpha <= 0) { s.active = false; s.fading = false; s.alpha = 1; hideSlot(s); }
          else writeSlot(s);
        }
      }
      function update(dt) {
        clock += dt;
        var any = false;
        for (var q = 0; q < MAXT; q++) {
          var s = slots[q];
          if (s.active) stepSlot(s, dt);
          if (s.dirty) { any = true; s.dirty = false; }
        }
        if (any) { tgeo.attributes.position.needsUpdate = true; tgeo.attributes.normal.needsUpdate = true; tgeo.attributes.color.needsUpdate = true; }
        if (tuftUp < 1) {
          tuftUp = Math.min(1, tuftUp + dt / 0.30);
          var e = tuftUp < 0.25 ? 0 : GF.ease.outBack((tuftUp - 0.25) / 0.75);
          tuft.position.y = lerp(-0.068, 0, e); tuft.scale.y = lerp(0.4, 1, clamp(e, 0, 1.2));
          tuft.visible = e > 0.001;
        }
      }
      function reset() {
        for (var q = 0; q < MAXT; q++) { slots[q].active = false; slots[q].fading = false; hideSlot(slots[q]); }
        count = 0; tuftUp = 1; tuft.position.y = 0; tuft.scale.y = 1; tuft.visible = true;
        tgeo.attributes.position.needsUpdate = true; tgeo.attributes.normal.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;
      }
      var SPOTS = [[-0.12, -0.50, 0.5], [-0.12, -0.31, 2.2], [-0.66, -0.02, 1.1], [-0.40, 0.20, 2.9], [-0.20, 0.44, 0.3], [0.13, -0.56, 1.9], [-0.80, 0.34, 0.8], [0.05, -0.36, 2.6]];
      function restore(n) {
        reset();
        n = Math.max(0, Math.floor(num(n, 0)));
        var m = Math.min(n, 8);
        for (var q = 0; q < m; q++) {
          var s = slots[q], sp = SPOTS[q];
          s.active = true; s.phase = 2; s.fading = false; s.alpha = 1; s.unf = 1; s.sb = 1; s.flut = 0; s.age = 3 + q;
          s.x = sp[0]; s.z = sp[1]; s.surf = surfaceY(sp[0], sp[1]); s.y = s.surf + 0.0015;
          s.flatQ.setFromAxisAngle(YAX, sp[2]).multiply(QX_DOWN); s.q.copy(s.flatQ); s.landQ.copy(s.flatQ); s.flip = 1;
          s.ph1 = q * 1.7; s.ph2 = q * 2.3; s.born = ++born;
          writeSlot(s);
        }
        count = n;
        tgeo.attributes.position.needsUpdate = true; tgeo.attributes.normal.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;
      }
      var api = {
        group: g, cover: cover, tuft: tuft, flying: fly,
        setGlow: GF.makeGlow([cover, tuft]),
        blow: function (dir, strength) {
          if (!dir) return false;
          strength = clamp(num(strength, 0), 0, 1);
          if (strength < 0.12) return false;
          if (clock - lastLaunch < gap || tuftUp < 0.85) return false;
          lastLaunch = clock; gap = 0.35 + rnd() * 0.10;
          launch(dir, strength);
          return true;
        },
        reset: reset, restore: restore, _update: update
      };
      Object.defineProperty(api, 'count', { get: function () { return count; }, enumerable: true });
      return api;
    })();

    // ================================================================ MUSIC BOX
    var musicBox = (function () {
      var seg = low ? 28 : 44;
      var g = new THREE.Group(); g.name = 'musicBox';
      g.position.set(MB[0], MB[1], MB[2]); g.rotation.y = -0.25;
      var A0 = 0.075, B0 = 0.050, T = 0.0065, NN = 7, TRAY = 0.052, HB = 0.063;
      function ring(y, a, b, n, s) { return { c: [0, y, 0], u: [1, 0, 0], v: [0, 0, 1], a: a, b: b, n: n || NN, s: s }; }
      var gBase = loft([ring(0, 0.001, 0.001), ring(0, A0 - 0.004, B0 - 0.004), ring(0.0012, A0 - 0.0012, B0 - 0.0012), ring(0.004, A0, B0),
        ring(0.0590, A0, B0), ring(0.0618, A0 - 0.0010, B0 - 0.0010), ring(HB, A0 - 0.0035, B0 - 0.0035), ring(HB, A0 - T + 0.0012, B0 - T + 0.0012),
        ring(HB - 0.0010, A0 - T, B0 - T), ring(TRAY - 0.002, A0 - T, B0 - T)], seg);
      function woodUV(geo) {
        var P = geo.attributes.position.array, UV = geo.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 6.0 + 0.4; UV[i * 2 + 1] = (P[i * 3 + 2] + P[i * 3 + 1]) * 9.0 + 0.2; }
      }
      woodUV(gBase);
      M.lacquer.vertexColors = true;
      var baseMesh = mesh(gBase, M.lacquer, true, true); g.add(baseMesh);
      // velvet tray with three shallow places + liner
      var CLIPX = [-0.043, 0, 0.043], CLIPZ = 0.012;
      var trayW = 2 * (A0 - T) + 0.002, trayD = 2 * (B0 - T) + 0.002;
      var tray = gridGeo(low ? 24 : 40, low ? 16 : 26, function (u, v, o) {
        var x = (u - 0.5) * trayW, z = (v - 0.5) * trayD, y = TRAY;
        for (var c = 0; c < 3; c++) { var e = Math.pow((x - CLIPX[c]) / 0.021, 2) + Math.pow((z - CLIPZ) / 0.025, 2); if (e < 1) y -= 0.0024 * (1 - e) * (1 - e); }
        var rn = Math.pow(Math.pow(Math.abs(x) / (A0 - T + 0.0008), NN) + Math.pow(Math.abs(z) / (B0 - T + 0.0008), NN), 1 / NN);
        if (rn > 1) { x /= rn; z /= rn; }
        y += 0.0018 * sstep(0.88, 1.0, rn);
        o[0] = x; o[1] = y; o[2] = -z;
      });
      var liner = loft([ring(TRAY - 0.001, A0 - T - 0.0006, B0 - T - 0.0006), ring(HB - 0.0045, A0 - T - 0.0006, B0 - T - 0.0006), ring(HB - 0.0030, A0 - T + 0.0002, B0 - T + 0.0002)], seg, true);
      var velvetMesh = mesh(merge([tray, liner]), M.velvet, false, true); g.add(velvetMesh);
      // brass on the base: hinges, catch, flower collar
      var hingeA = new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 12); xf(hingeA, [-0.045, HB, -B0 - 0.0005], [0, 0, PI / 2]);
      var hingeB = new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 12); xf(hingeB, [0.045, HB, -B0 - 0.0005], [0, 0, PI / 2]);
      var catchP = rbox(0.012, 0.007, 0.0014, 0.0006, 2); xf(catchP, [0, 0.0535, B0 + 0.0006]);
      var catchK = new THREE.SphereGeometry(0.0017, 10, 8); xf(catchK, [0, 0.0535, B0 + 0.0016]);
      var FX = -0.048, FZ = -0.029;
      var collar = new THREE.CylinderGeometry(0.0040, 0.0044, 0.0024, 16); xf(collar, [FX, TRAY + 0.0008, FZ]);
      var baseBrass = mesh(merge([hingeA, hingeB, catchP, catchK, collar]), M.brass, true, false); g.add(baseBrass);
      // lid
      var pivot = new THREE.Group(); pivot.name = 'musicBoxLidPivot'; pivot.position.set(0, HB, -B0); g.add(pivot);
      function lr(y, a, b) { return { c: [0, y, B0], u: [1, 0, 0], v: [0, 0, 1], a: a, b: b, n: NN }; }
      var gLid = loft([lr(0.0080, 0.010, 0.006), lr(0.0080, A0 - 0.0105, B0 - 0.0105), lr(0.0070, A0 - T - 0.0004, B0 - T - 0.0004), lr(0.0006, A0 - T, B0 - T),
        lr(0, A0 - T + 0.0015, B0 - T + 0.0015), lr(0, A0 - 0.003, B0 - 0.003), lr(0.0012, A0 - 0.0006, B0 - 0.0006), lr(0.0040, A0, B0), lr(0.0150, A0, B0),
        lr(0.0186, A0 - 0.0015, B0 - 0.0015), lr(0.0212, A0 - 0.0062, B0 - 0.0062), lr(0.0223, A0 - 0.0140, B0 - 0.0140), lr(0.0227, A0 - 0.030, B0 - 0.030), lr(0.0229, 0.001, 0.001)], seg);
      woodUV(gLid);
      var lidMesh = mesh(gLid, M.lacquer, true, true); pivot.add(lidMesh);
      var mirrorMesh = mesh(loft([lr(0.0076, A0 - 0.0115, B0 - 0.0115), lr(0.0076, 0.001, 0.001)], seg, true), M.mirror, false, false); pivot.add(mirrorMesh);
      var hasp = rbox(0.0130, 0.0150, 0.0016, 0.0007, 2); xf(hasp, [0, 0.0045, 2 * B0 + 0.0009]);
      var haspRivet = new THREE.SphereGeometry(0.0013, 8, 6); xf(haspRivet, [0, 0.0095, 2 * B0 + 0.0016]);
      var lidBrass = mesh(merge([hasp, haspRivet]), M.brass, true, false); pivot.add(lidBrass);
      var knob = new THREE.Object3D(); knob.name = 'musicBoxLidKnob'; knob.position.set(0, 0.0112, 2 * B0 + 0.002); pivot.add(knob);
      // flower on a telescoping post
      var postMesh = mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 1, 8, 1).translate(0, 0.5, 0), M.gold, true, false);
      postMesh.position.set(FX, TRAY, FZ); g.add(postMesh);
      var spinner = new THREE.Group(); spinner.position.set(FX, TRAY + 0.012, FZ); g.add(spinner);
      var fl = [];
      for (var pk = 0; pk < 6; pk++) {
        var pg = new THREE.SphereGeometry(1, 10, 6);
        (function (geo) {
          var P = geo.attributes.position.array, c = new Float32Array(P.length);
          for (var i = 0; i < P.length / 3; i++) { var t = clamp((P[i * 3] + 1) / 2, 0, 1); c[i * 3] = lerp(0.80, 0.95, t); c[i * 3 + 1] = lerp(0.16, 0.42, t); c[i * 3 + 2] = lerp(0.30, 0.52, t); }
          geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        })(pg);
        pg.scale(0.0072, 0.0017, 0.0046); pg.translate(0.0066, 0, 0); pg.rotateZ(0.38); pg.rotateY(pk * PI / 3);
        fl.push(pg);
      }
      for (pk = 0; pk < 2; pk++) {
        var lg = paint(new THREE.SphereGeometry(1, 8, 5), 0.30, 0.56, 0.34);
        lg.scale(0.0062, 0.0010, 0.0026); lg.translate(0.0088, -0.0018, 0); lg.rotateZ(-0.1); lg.rotateY(pk * PI + 0.5); fl.push(lg);
      }
      var gem = paint(new THREE.IcosahedronGeometry(0.0034, 1), 1, 0.97, 0.9); gem.scale(1, 0.7, 1); gem.translate(0, 0.0016, 0); fl.push(gem);
      var flowerMesh = mesh(merge(fl), M.enamel, true, false); spinner.add(flowerMesh);
      var lidV = 0, spinT = 0, spinC = 0, spinA = 0;
      function setLid(v) {
        lidV = clamp(num(v, 0), 0, 1);
        pivot.rotation.x = -lidV * 100 * PI / 180;
        var rise = sstep(0.12, 0.75, lidV), h = lerp(0.0095, 0.031, rise);
        postMesh.scale.y = h; spinner.position.y = TRAY + h;
      }
      setLid(0);
      root.add(g);
      var api = {
        group: g, lid: { pivot: pivot, knob: knob }, flower: spinner,
        setLid: setLid,
        setSpin: function (r) { spinT = num(r, 0); },
        setGlow: GF.makeGlow([lidMesh, lidBrass, baseBrass]),
        clipPlaces: CLIPX.map(function (x) { return [x, TRAY - 0.0016, CLIPZ]; }),
        _update: function (dt) {
          spinC = GF.damp(spinC, spinT, 3.5, dt);
          if (Math.abs(spinC) > 1e-4) { spinA = (spinA + spinC * dt) % TAU; spinner.rotation.y = spinA; }
        }
      };
      Object.defineProperty(api, 'lidOpen', { get: function () { return lidV > 0.5; }, enumerable: true });
      Object.defineProperty(api, 'lidValue', { get: function () { return lidV; }, enumerable: true });
      return api;
    })();

    // ================================================================ HAIR CLIPS
    var clips = (function () {
      var Z0 = 0.0017;
      function snapBase() {
        var L = 0.046, rings = [], n = 22;
        for (var i = 0; i <= n; i++) {
          var t = i / n, x = (t - 0.5) * L, e = Math.abs(2 * x / L);
          var w = 0.0042 * (1 - 0.25 * e * e) * Math.sqrt(Math.max(0.0, 1 - Math.pow(e, 8)));
          var th = 0.0007 * Math.sqrt(Math.max(0, 1 - Math.pow(e, 10)));
          rings.push({ c: [x, 0, 0.0007 - 0.0026 * e * e], u: [0, 0, 1], v: [0, 1, 0], a: Math.max(th, 0.00005), b: Math.max(w, 0.00005), n: 3 });
        }
        var top = loft(rings, 12);
        var r2 = [];
        for (i = 0; i <= n; i++) {
          var t2 = i / n, x2 = (t2 - 0.5) * L * 0.86, e2 = Math.abs(2 * x2 / (L * 0.86));
          var w2 = 0.0026 * Math.sqrt(Math.max(0, 1 - Math.pow(e2, 6)));
          r2.push({ c: [x2, 0, -0.0006 - 0.0020 * e2 * e2], u: [0, 0, 1], v: [0, 1, 0], a: 0.00045 * Math.sqrt(Math.max(0, 1 - Math.pow(e2, 10))) + 0.00003, b: w2 + 0.00003, n: 3 });
        }
        var tongue = loft(r2, 10);
        return merge([top, tongue]);
      }
      function ribbon() {
        var parts = [], side;
        for (side = -1; side <= 1; side += 2) (function (sd) {
          parts.push(gridGeo(low ? 22 : 30, 6, function (u, v, o) {
            var ph = u * TAU, q = v * 2 - 1;
            var cx = sd * 0.0108 * (1 - Math.cos(ph)), cz = Z0 + 0.0046 + 0.0043 * Math.sin(ph);
            var bx = -sd * Math.cos(ph) * 0.0043, bz = Math.sin(ph) * 0.0108, bl = Math.sqrt(bx * bx + bz * bz) || 1;
            var w = 0.0055 + 0.0135 * Math.pow(Math.sin(ph / 2), 1.4);
            var bul = 0.0016 * (1 - q * q) * Math.sin(ph / 2);
            var yc = 0.0032 * (1 - Math.cos(ph)) / 2;
            o[0] = cx + bx / bl * bul; o[1] = yc + q * w / 2 * (1 - 0.08 * Math.sin(ph / 2) * q * q); o[2] = cz + bz / bl * bul;
          }));
          parts.push(gridGeo(10, 4, function (u, v, o) {
            var t = u, q = v * 2 - 1;
            var cx = sd * (0.002 + 0.0105 * t + 0.0025 * t * t), cy = -0.002 - 0.0185 * t, cz = Z0 + 0.0040 - 0.0018 * t + 0.0012 * Math.sin(t * PI);
            var wx = 0.86, wy = sd * 0.5, wz = 0.25 * Math.sin(t * 2.4 + sd);
            var wl = Math.sqrt(wx * wx + wy * wy + wz * wz), hw = 0.0042 * q;
            var notch = t > 0.999 ? 0.0028 * (1 - Math.abs(q)) : 0;
            o[0] = cx + wx / wl * hw; o[1] = cy + wy / wl * hw + notch; o[2] = cz + wz / wl * hw;
          }));
        })(side);
        var knot = new THREE.SphereGeometry(1, 14, 10);
        (function () {
          var P = knot.attributes.position.array;
          for (var i = 0; i < P.length; i += 3) {
            var x = P[i], y = P[i + 1], z = P[i + 2];
            var sx = Math.sign(x) * Math.pow(Math.abs(x), 0.6), sy = Math.sign(y) * Math.pow(Math.abs(y), 0.7);
            var f = 1 + 0.10 * Math.sin(y * 7.5) * (1 - Math.abs(y));
            P[i] = sx * 0.0044 * f; P[i + 1] = sy * 0.0064; P[i + 2] = z * 0.0024 * f;
          }
          knot.translate(0, 0.0006, Z0 + 0.0058); knot.computeVertexNormals();
        })();
        parts.push(knot);
        return merge(parts);
      }
      function daisy() {
        var parts = [], N = 13, layer, k;
        for (layer = 0; layer < 2; layer++) for (k = 0; k < N; k++) (function (ly, kk) {
          var ang = (kk + ly * 0.5) / N * TAU + Math.sin(kk * 7.1) * 0.06, sc = ly ? 0.9 : 1, zb = Z0 + 0.0011 + ly * 0.0008;
          var tilt = 0.10 + 0.05 * Math.sin(kk * 3.3 + ly);
          var ca = Math.cos(ang), sa = Math.sin(ang);
          parts.push(gridGeo(6, 4, function (u, v, o) {
            var q = v * 2 - 1, r = (0.0042 + 0.0168 * u) * sc;
            var wv = u < 0.82 ? (0.58 + 0.42 * u / 0.82) : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.82) / 0.18, 2)));
            var w = 0.0029 * sc * wv;
            var lx = r, ly2 = q * w, lz = zb + r * tilt * 0.35 + 0.0016 * u - 0.0013 * u * u + 0.00035 * q * q;
            o[0] = lx * ca - ly2 * sa; o[1] = lx * sa + ly2 * ca; o[2] = lz;
          }, function (u, v, c) { var t = sstep(0, 0.35, u); c[0] = lerp(0.93, 0.97, t); c[1] = lerp(0.91, 0.965, t); c[2] = lerp(0.80, 0.94, t); }));
        })(layer, k);
        parts.push(gridGeo(24, 6, function (u, v, o) {
          var a = u * TAU, r = 0.0068 * v, bump = 0.00028 * Math.sin(a * 11) * Math.sin(v * 13);
          o[0] = r * Math.cos(a); o[1] = r * Math.sin(a); o[2] = Z0 + 0.0024 + 0.0036 * Math.sqrt(Math.max(0, 1 - v * v)) + bump;
        }, function (u, v, c) { c[0] = lerp(0.88, 0.98, v); c[1] = lerp(0.58, 0.76, v); c[2] = lerp(0.06, 0.14, v); }, true));
        var g = merge(parts);
        // polar grid above has its normal pointing -Z; it is double-sided material so shading is fine
        return g;
      }
      function star() {
        var Ro = 0.0215, Ri = 0.0094, zt = Z0 + 0.0075, zo = Z0 + 0.0013, zi = Z0 + 0.0027, pts = [], k;
        for (k = 0; k < 10; k++) { var a = PI / 2 + k * PI / 5, r = k % 2 ? Ri : Ro; pts.push([r * Math.cos(a), r * Math.sin(a), k % 2 ? zi : zo]); }
        var P = [];
        function tri(a, b, c) { P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
        var top = [0, 0, zt], bot = [0, 0, Z0];
        for (k = 0; k < 10; k++) {
          var p0 = pts[k], p1 = pts[(k + 1) % 10];
          tri(top, p0, p1);
          var b0 = [p0[0], p0[1], Z0], b1 = [p1[0], p1[1], Z0];
          tri(bot, b1, b0);
          tri(p0, b0, b1); tri(p0, b1, p1);
        }
        var g = new THREE.BufferGeometry();
        var pa = new Float32Array(P), uv = new Float32Array(P.length / 3 * 2);
        for (k = 0; k < P.length / 3; k++) { uv[k * 2] = P[k * 3] / 0.05 + 0.5; uv[k * 2 + 1] = P[k * 3 + 1] / 0.05 + 0.5; }
        g.setAttribute('position', new THREE.BufferAttribute(pa, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.computeVertexNormals();
        return g;
      }
      var baseGeo = snapBase();
      var defs = [['ribbon', ribbon(), M.satin], ['flower', daisy(), M.daisy], ['star', star(), M.star]];
      var mbM = musicBox.group;
      mbM.updateMatrixWorld(true);
      var qLay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PI / 2);
      return defs.map(function (d, i) {
        var g = new THREE.Group(); g.name = 'clip_' + d[0];
        var bm = mesh(baseGeo, M.nickel, true, false), om = mesh(d[1], d[2], true, false);
        g.add(bm); g.add(om);
        var pl = musicBox.clipPlaces[i];
        var lp = new THREE.Vector3(pl[0], pl[1] + 0.0026, pl[2]).applyMatrix4(mbM.matrixWorld);
        var lq = mbM.getWorldQuaternion(new THREE.Quaternion()).multiply(qLay);
        var home = { position: lp, quaternion: lq };
        g.position.copy(lp); g.quaternion.copy(lq);
        root.add(g);
        return { id: d[0], group: g, home: home, setGlow: GF.makeGlow([om, bm]) };
      });
    })();

    // ================================================================ POCHETTE
    var pochette = (function () {
      var A = 0.065, B = 0.055, D = 0.020;
      function nOf(s) { return s >= 0 ? 5 : 2.7; }
      function outline(th, out) { var s = Math.sin(th); return sePt(th, A, B, nOf(s), out); }
      function bulgeR(r) { return D * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, r), 4)), 0.42); }
      function rOf(x, y) { var n = nOf(y); return Math.pow(Math.pow(Math.abs(x / A), n) + Math.pow(Math.abs(y / B), n), 1 / n); }
      var op = [0, 0];
      var nu = low ? 30 : 44, nr = low ? 7 : 10;
      var front = gridGeo(nu, nr, function (u, v, o) { outline(-u * TAU, op); o[0] = op[0] * v; o[1] = op[1] * v; o[2] = bulgeR(v); }, null, true);
      var back = gridGeo(nu, nr, function (u, v, o) { outline(u * TAU, op); o[0] = op[0] * v; o[1] = op[1] * v; o[2] = -bulgeR(v); }, null, true);
      var opts3 = [];
      for (var k = 0; k < 64; k++) { outline(k / 64 * TAU, op); opts3.push(new THREE.Vector3(op[0] * 1.004, op[1] * 1.004, 0)); }
      var piping = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(opts3, true), low ? 64 : 96, 0.0021, 6, true);
      function yTop(x) { return B * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x / A), 5)), 1 / 5) - 0.0016; }
      function yBot(s) { return -0.004 - 0.021 * Math.sqrt(Math.max(0, 1 - s * s)); }
      var flap = gridGeo(low ? 16 : 22, low ? 8 : 11, function (u, v, o) {
        var s = u * 2 - 1, t = Math.min(v / 0.86, 1), skirt = v > 0.86 ? (v - 0.86) / 0.14 : 0;
        var x = s * 0.0612, y = lerp(yTop(x), yBot(s), t);
        var edge = 1 - 0.35 * Math.pow(t, 6);
        o[0] = x; o[1] = y - 0.0012 * skirt; o[2] = bulgeR(rOf(x, y)) + (0.0042 + 0.0012 * (1 - t)) * edge * (1 - skirt) + 0.0002 * skirt;
      });
      var fe = [];
      for (k = 0; k <= 24; k++) {
        var fs = -1 + 2 * k / 24, fx = fs * 0.0612, fy = yBot(fs);
        fe.push(new THREE.Vector3(fx, fy - 0.0008, bulgeR(rOf(fx, fy)) + 0.0028));
      }
      fe.unshift(new THREE.Vector3(-0.0612, yTop(-0.0612) - 0.004, bulgeR(rOf(-0.0612, yTop(-0.0612) - 0.004)) + 0.0028));
      fe.push(new THREE.Vector3(0.0612, yTop(0.0612) - 0.004, bulgeR(rOf(0.0612, yTop(0.0612) - 0.004)) + 0.0028));
      var flapPipe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fe, false, 'centripetal'), 48, 0.0019, 6, false);
      var bagGeo = merge([front, back, piping, flap, flapPipe]);
      (function () {
        var P = bagGeo.attributes.position.array, UV = bagGeo.attributes.uv.array;
        for (var i = 0; i < P.length / 3; i++) { UV[i * 2] = P[i * 3] * 9 + P[i * 3 + 2] * 4; UV[i * 2 + 1] = P[i * 3 + 1] * 9 + P[i * 3 + 2] * 4; }
      })();
      var snapY = yBot(0) + 0.0075, snapZ = bulgeR(rOf(0, snapY)) + 0.0042;
      function metalGeo() {
        var sn = new THREE.SphereGeometry(0.0042, 16, 8); sn.scale(1, 1, 0.38); sn.translate(0, snapY, snapZ);
        var r1 = new THREE.TorusGeometry(0.0046, 0.0011, 8, 18); r1.rotateY(PI / 2); r1.translate(-0.052, 0.051, 0);
        var r2 = new THREE.TorusGeometry(0.0046, 0.0011, 8, 18); r2.rotateY(PI / 2); r2.translate(0.052, 0.051, 0);
        return merge([sn, r1, r2]);
      }
      var metal = metalGeo();
      var SW = 0.011, ST = 0.0019;
      // ---- hanging form (origin = top of the strap loop on the finial)
      var g = new THREE.Group(); g.name = 'pochette';
      g.position.set(POS.pochetteHook[0], POS.pochetteHook[1], POS.pochetteHook[2]);
      var BAGZ = 0.046, BAGY = -0.258;
      var bag = mesh(bagGeo, M.leather, true, true); bag.position.set(0, BAGY, BAGZ); g.add(bag);
      var met = mesh(metal, M.gold, true, false); met.position.copy(bag.position); g.add(met);
      var ctrl = [[-0.052, BAGY + 0.056, BAGZ], [-0.043, -0.15, BAGZ - 0.002], [-0.025, -0.08, 0.034], [-0.011, -0.034, 0.024]];
      var RL = 0.019;
      for (k = 0; k <= 12; k++) { var ph = -0.55 - k / 12 * (TAU - 1.1); ctrl.push([RL * Math.sin(ph), -0.0105 - 0.0085 * Math.cos(ph), RL * Math.cos(ph)]); }
      ctrl.push([0.011, -0.034, 0.024], [0.025, -0.08, 0.034], [0.043, -0.15, BAGZ - 0.002], [0.052, BAGY + 0.056, BAGZ]);
      var curve = new THREE.CatmullRomCurve3(ctrl.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), false, 'centripetal');
      var hp = curve.getSpacedPoints(low ? 50 : 80), hn = [];
      hp.forEach(function (p) {
        var w = sstep(-0.034, -0.016, p.y), rl = Math.sqrt(p.x * p.x + p.z * p.z) || 1;
        hn.push(new THREE.Vector3(lerp(0, p.x / rl, w), 0, lerp(1, p.z / rl, w)).normalize());
      });
      var strap = mesh(bandGeo(hp, hn, SW, ST), M.leather, true, false); g.add(strap);
      root.add(g);
      var home = pose(g);
      // ---- worn form (torso-local: origin chest centre between the shoulder blades, +Z = her back)
      var worn = new THREE.Group(); worn.name = 'pochetteWorn'; worn.visible = false;
      var bagW = mesh(bagGeo, M.leather, true, true), metW = mesh(metal, M.gold, true, false);
      var bx = new THREE.Vector3(0.8, 0, 0.6), by = new THREE.Vector3(0, 1, 0), bz = new THREE.Vector3(-0.6, 0, 0.8);
      var bq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
      var bc = new THREE.Vector3(-0.15, -0.24, 0.05);
      bagW.position.copy(bc); bagW.quaternion.copy(bq); metW.position.copy(bc); metW.quaternion.copy(bq);
      worn.add(bagW); worn.add(metW);
      function ringPt(sx) { return bc.clone().addScaledVector(bx, sx * 0.052).addScaledVector(by, 0.056); }
      var EC = new THREE.Vector3(0, -0.02, 0), ER = new THREE.Vector3(0.135 + 0.0062, 0.20 + 0.0062, 0.075 + 0.0062);
      var wc = [ringPt(1), new THREE.Vector3(-0.09, -0.15, 0.07), new THREE.Vector3(-0.035, -0.07, 0.08), new THREE.Vector3(0.025, 0.01, 0.07),
        new THREE.Vector3(0.072, 0.080, 0.045), new THREE.Vector3(0.100, 0.122, 0.0), new THREE.Vector3(0.072, 0.080, -0.045),
        new THREE.Vector3(0.020, 0.0, -0.075), new THREE.Vector3(-0.050, -0.10, -0.075), new THREE.Vector3(-0.115, -0.165, -0.055),
        new THREE.Vector3(-0.165, -0.19, -0.02), ringPt(-1)];
      var wcur = new THREE.CatmullRomCurve3(wc, false, 'centripetal');
      var wp = wcur.getSpacedPoints(low ? 70 : 110), wn = [];
      var tv = new THREE.Vector3();
      wp.forEach(function (p, i) {
        tv.set((p.x - EC.x) / ER.x, (p.y - EC.y) / ER.y, (p.z - EC.z) / ER.z);
        var e = tv.length(), endW = Math.min(i, wp.length - 1 - i) / (wp.length * 0.12);
        var hug = clamp(endW, 0, 1) * sstep(-0.19, -0.13, p.y);
        if (e > 1e-6) {
          var f = e < 1 ? 1 / e : lerp(1, 1 / e, hug);
          p.set(EC.x + (p.x - EC.x) * f, EC.y + (p.y - EC.y) * f, EC.z + (p.z - EC.z) * f);
        }
        var n = new THREE.Vector3((p.x - EC.x) / (ER.x * ER.x), (p.y - EC.y) / (ER.y * ER.y), (p.z - EC.z) / (ER.z * ER.z)).normalize();
        wn.push(n);
      });
      for (var pass = 0; pass < 2; pass++) for (k = 2; k < wp.length - 2; k++) wp[k].lerp(tv.copy(wp[k - 1]).add(wp[k + 1]).multiplyScalar(0.5), 0.5);
      var strapW = mesh(bandGeo(wp, wn, SW, ST), M.leather, true, false); worn.add(strapW);
      // pendulum
      var thz = 0, vz = 0, thx = 0, vx = 0, swinging = false;
      var api = {
        group: g, home: home, worn: worn,
        setWorn: function (b) { b = !!b; worn.visible = b; g.visible = !b; },
        swing: function (imp) {
          var ix, iz;
          if (imp && typeof imp === 'object') { ix = num(imp.x, 0); iz = num(imp.z, 0); }
          else { ix = num(imp, 0); iz = ix * 0.35; }
          vz += clamp(ix, -3, 3) * 2.2; vx -= Math.abs(clamp(iz, -3, 3)) * 1.2; swinging = true;
        },
        setGlow: GF.makeGlow([bag, strap]),
        _update: function (dt) {
          if (!swinging) return;
          var w2 = 30, c = 0.55;
          vz += (-w2 * thz - c * vz) * dt; thz += vz * dt;
          vx += (-w2 * thx - c * vx) * dt; thx += vx * dt;
          if (thx > 0) { thx = 0; vx = -vx * 0.3; }   // the chair back stops it
          thz = clamp(thz, -0.6, 0.6); thx = clamp(thx, -0.5, 0);
          g.rotation.set(thx, 0, thz);
          if (Math.abs(thz) + Math.abs(vz) * 0.2 + Math.abs(thx) + Math.abs(vx) * 0.2 < 0.0005) { thz = vz = thx = vx = 0; g.rotation.set(0, 0, 0); swinging = false; }
        }
      };
      return api;
    })();

    // ================================================================ TOWEL
    var towel = (function () {
      var NU = low ? 24 : 34, NV = low ? 18 : 26, NG = NU * NV;
      var XMIN = -0.31, XMAX = 0.31, ZMIN = -0.106, ZMAX = 0.35, TH = 0.0045;
      // ---- hanging hull of head + neck + shoulders (head-local), per horizontal direction
      var H = GF.HEAD, IA = H.skull[0] + 0.022, IB = H.skull[1] + 0.019, IC = H.skull[2] + 0.020;
      var SC = H.torsoC, SR = [H.torsoR[0] + 0.013, H.torsoR[1] + 0.013, H.torsoR[2] + 0.013];
      var NPSI = 64, ND = 34, NB = 70, NK = ND + NB;
      var tY = new Float32Array(NPSI * NK), tR = new Float32Array(NPSI * NK), tS = new Float32Array(NPSI * NK);
      function bodyR(y, hx, hz) {
        var r = 0, k, t;
        if (y > -IB && y < IB) { k = Math.sqrt(1 - (y / IB) * (y / IB)); r = 1 / Math.sqrt(Math.pow(hx / (IA * k), 2) + Math.pow(hz / (IC * k), 2)); }
        if (y < -0.055 && y > -0.18) r = Math.max(r, H.neckR + 0.014);
        var dy = (y - SC[1]) / SR[1];
        if (dy > -1 && dy < 1) {
          k = Math.sqrt(1 - dy * dy);
          var ax = SR[0] * k, az = SR[2] * k, zc = SC[2];
          var a2 = hx * hx / (ax * ax) + hz * hz / (az * az), b1 = -2 * hz * zc / (az * az), c0 = zc * zc / (az * az) - 1;
          var disc = b1 * b1 - 4 * a2 * c0;
          if (disc > 0) { t = (-b1 + Math.sqrt(disc)) / (2 * a2); r = Math.max(r, t); }
        }
        return r;
      }
      for (var pi = 0; pi < NPSI; pi++) {
        var psi = -PI + pi / NPSI * TAU, hx = Math.sin(psi), hz = Math.cos(psi);
        var rEq = 1 / Math.sqrt(Math.pow(hx / IA, 2) + Math.pow(hz / IC, 2));
        var o = pi * NK, R = 0, s = 0, py = IB, pr = 0;
        for (var kk = 0; kk < NK; kk++) {
          var y, r;
          if (kk < ND) { var ph = kk / (ND - 1) * PI / 2; y = IB * Math.cos(ph); r = rEq * Math.sin(ph); }
          else { y = -(kk - ND + 1) / NB * 0.66; r = bodyR(y, hx, hz); }
          R = Math.max(R, r);
          if (kk > 0) s += Math.sqrt((R - pr) * (R - pr) + (y - py) * (y - py));
          tY[o + kk] = y; tR[o + kk] = R; tS[o + kk] = s; py = y; pr = R;
        }
      }
      var look = [0, 0];
      function lookup(pi, sg, out) {
        var o = pi * NK;
        if (sg >= tS[o + NK - 1]) { out[0] = tY[o + NK - 1] - (sg - tS[o + NK - 1]); out[1] = tR[o + NK - 1]; return; }
        var lo = 0, hi = NK - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (tS[o + mid] <= sg) lo = mid; else hi = mid; }
        var f = (sg - tS[o + lo]) / Math.max(1e-9, tS[o + hi] - tS[o + lo]);
        out[0] = lerp(tY[o + lo], tY[o + hi], f); out[1] = lerp(tR[o + lo], tR[o + hi], f);
      }
      function hoodMap(x, z, foldK, out, oi) {
        var sg = Math.sqrt(x * x + z * z), psi = Math.atan2(x, z);
        var fi = (psi + PI) / TAU * NPSI, i0 = Math.floor(fi), f = fi - i0;
        i0 = ((i0 % NPSI) + NPSI) % NPSI; var i1 = (i0 + 1) % NPSI;
        lookup(i0, sg, look); var y0 = look[0], r0 = look[1];
        lookup(i1, sg, look); var y = lerp(y0, look[0], f), R = lerp(r0, look[1], f);
        var excess = Math.max(0, sg - R);
        var fp = 0.5 + 0.5 * Math.cos(psi * 12 + 2.6 * Math.sin(psi * 3 + 0.6) + sg * 9 + 1.4 * Math.sin(sg * 13 + psi * 4));
        fp = fp * fp * (3 - 2 * fp);
        var amp = 0.5 + 0.9 * GF.noise2(psi * 2.3 + 3.1, sg * 4);
        var depth = foldK * sstep(0.07, 0.22, sg) * Math.min(0.022, excess * 0.11 + 0.002) * amp;
        var room = Math.max(0, R - bodyR(y, Math.sin(psi), Math.cos(psi)) - 0.005);
        var A = depth * fp - Math.min(room, depth, 0.003) * (1 - fp);
        // a thick terry towel never hugs the skull perfectly: soft low puffs everywhere
        A += 0.0045 * GF.noise2(x * 9 + 7.3, z * 9 + 1.1) + 0.003 * sstep(0.0, 0.08, sg) * (1 - sstep(0.12, 0.2, sg));
        R += A;
        out[oi] = R * Math.sin(psi); out[oi + 1] = y - A * 0.3; out[oi + 2] = R * Math.cos(psi);
      }
      // ---- hung over the chair rail (world)
      var RAIL = POS.towelRail, HX = RAIL[0] + 0.005, RY = RAIL[1] - 0.015, RZ = RAIL[2], ZTOP = 0.108;
      function hungMap(x, z, fa, t, out, oi) {
        var q = (x - XMIN) / (XMAX - XMIN) * 4, k = Math.min(3, Math.floor(q)), f = q - k, xs = (k % 2 === 0) ? f : 1 - f;
        var r = 0.0175 + k * 0.0046, a = z - ZTOP, qa = PI * r / 2;
        var px = HX + (xs - 0.5) * 0.16, py, pz;
        if (Math.abs(a) <= qa) { var th = a / r; py = RY + r * Math.cos(th); pz = RZ + r * Math.sin(th); }
        else {
          var hang = Math.abs(a) - qa, sgn = a > 0 ? 1 : -1, hn = hang / 0.25;
          var fold = 0.004 * Math.sin(px * 70 + k * 1.3) * hn + 0.006 * hn * hn;
          py = RY - hang; pz = RZ + sgn * (r + fold);
          if (sgn > 0 && fa > 0) {
            pz += fa * (0.045 * Math.pow(hn, 1.5) * (0.75 + 0.25 * Math.sin(t * 9 + px * 25)) + 0.007 * Math.sin(t * 17 + hang * 34 + px * 40) * hn);
            py += fa * 0.025 * hn * hn;
            px += fa * 0.004 * Math.sin(t * 13 + hang * 20) * hn;
          }
        }
        out[oi] = px; out[oi + 1] = py; out[oi + 2] = pz;
      }
      // ---- two-layer cloth mesh
      var PER = 2 * (NU - 1) + 2 * (NV - 1), perim = [], inward = [], i, j;
      for (i = 0; i < NU; i++) perim.push(i);
      for (j = 1; j < NV; j++) perim.push(j * NU + NU - 1);
      for (i = NU - 2; i >= 0; i--) perim.push((NV - 1) * NU + i);
      for (j = NV - 2; j >= 1; j--) perim.push(j * NU);
      perim.forEach(function (gi) {
        var ii = gi % NU, jj = Math.floor(gi / NU);
        var ni = ii === 0 ? 1 : (ii === NU - 1 ? NU - 2 : ii), nj = jj === 0 ? 1 : (jj === NV - 1 ? NV - 2 : jj);
        inward.push(nj * NU + ni);
      });
      var FX = new Float32Array(NG), FZ = new Float32Array(NG);
      for (j = 0; j < NV; j++) for (i = 0; i < NU; i++) { FX[j * NU + i] = lerp(XMIN, XMAX, i / (NU - 1)); FZ[j * NU + i] = lerp(ZMIN, ZMAX, j / (NV - 1)); }
      function makeCloth() {
        var nV = NG * 2 + PER * 2;
        var pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv0 = new Float32Array(nV * 2), uv1 = new Float32Array(nV * 2);
        var idx = [], a, b, c, d, k;
        for (k = 0; k < NG; k++) {
          uv0[k * 2] = uv0[(k + NG) * 2] = FX[k] * terryRep; uv0[k * 2 + 1] = uv0[(k + NG) * 2 + 1] = FZ[k] * terryRep;
          uv1[k * 2] = uv1[(k + NG) * 2] = (FX[k] - XMIN) / (XMAX - XMIN); uv1[k * 2 + 1] = uv1[(k + NG) * 2 + 1] = (FZ[k] - ZMIN) / (ZMAX - ZMIN);
        }
        for (k = 0; k < PER; k++) for (var e = 0; e < 2; e++) {
          var vi = NG * 2 + k * 2 + e, src = perim[k];
          uv0[vi * 2] = uv0[src * 2]; uv0[vi * 2 + 1] = uv0[src * 2 + 1]; uv1[vi * 2] = uv1[src * 2]; uv1[vi * 2 + 1] = uv1[src * 2 + 1];
        }
        for (j = 0; j < NV - 1; j++) for (i = 0; i < NU - 1; i++) {
          a = j * NU + i; b = a + 1; c = a + NU; d = c + 1;
          idx.push(a, c, b, b, c, d);
          idx.push(a + NG, b + NG, c + NG, b + NG, d + NG, c + NG);
        }
        for (k = 0; k < PER; k++) {
          var k1 = (k + 1) % PER, ok = NG * 2 + k * 2, ok1 = NG * 2 + k1 * 2;
          idx.push(ok, ok + 1, ok1, ok1, ok + 1, ok1 + 1);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv0, 2));
        geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
        geo.setIndex(idx);
        var P = new Float32Array(NG * 3);
        return {
          geo: geo, P: P,
          commit: function () {
            var jj, ii, k3;
            for (jj = 0; jj < NV; jj++) for (ii = 0; ii < NU; ii++) {
              var i0 = (jj * NU + Math.max(0, ii - 1)) * 3, i1 = (jj * NU + Math.min(NU - 1, ii + 1)) * 3;
              var j0 = (Math.max(0, jj - 1) * NU + ii) * 3, j1 = (Math.min(NV - 1, jj + 1) * NU + ii) * 3;
              var ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2];
              var vx = P[j1] - P[j0], vy = P[j1 + 1] - P[j0 + 1], vz = P[j1 + 2] - P[j0 + 2];
              var nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
              nx /= nl; ny /= nl; nz /= nl;
              k3 = (jj * NU + ii) * 3;
              pos[k3] = P[k3]; pos[k3 + 1] = P[k3 + 1]; pos[k3 + 2] = P[k3 + 2];
              nor[k3] = nx; nor[k3 + 1] = ny; nor[k3 + 2] = nz;
              var q3 = k3 + NG * 3;
              pos[q3] = P[k3] - nx * TH; pos[q3 + 1] = P[k3 + 1] - ny * TH; pos[q3 + 2] = P[k3 + 2] - nz * TH;
              nor[q3] = -nx; nor[q3 + 1] = -ny; nor[q3 + 2] = -nz;
            }
            for (var k = 0; k < PER; k++) {
              var s3 = perim[k] * 3, w3 = inward[k] * 3, o3 = (NG * 2 + k * 2) * 3;
              var ex = P[s3] - P[w3], ey = P[s3 + 1] - P[w3 + 1], ez = P[s3 + 2] - P[w3 + 2], el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
              ex /= el; ey /= el; ez /= el;
              pos[o3] = pos[s3]; pos[o3 + 1] = pos[s3 + 1]; pos[o3 + 2] = pos[s3 + 2];
              pos[o3 + 3] = pos[s3 + NG * 3]; pos[o3 + 4] = pos[s3 + NG * 3 + 1]; pos[o3 + 5] = pos[s3 + NG * 3 + 2];
              nor[o3] = nor[o3 + 3] = ex; nor[o3 + 1] = nor[o3 + 4] = ey; nor[o3 + 2] = nor[o3 + 5] = ez;
            }
            geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
          }
        };
      }
      var headC = makeCloth(), hungC = makeCloth();
      var headMesh = mesh(headC.geo, M.terry, true, true); headMesh.frustumCulled = false; headMesh.name = 'towelHead';
      var hungMesh = mesh(hungC.geo, M.terry, true, true); hungMesh.frustumCulled = false; hungMesh.name = 'towelHung';
      var head = new THREE.Group(); head.name = 'towelHead'; head.add(headMesh);
      var hung = new THREE.Group(); hung.name = 'towelHung'; hung.add(hungMesh); root.add(hung);
      // the hung shape seen from the head frame (for the end of the slide)
      var HS = POS.headSit, hungLocal = new Float32Array(NG * 3);
      for (k = 0; k < NG; k++) { hungMap(FX[k], FZ[k], 0, 0, hungLocal, k * 3); hungLocal[k * 3] -= HS[0]; hungLocal[k * 3 + 1] -= HS[1]; hungLocal[k * 3 + 2] -= HS[2]; }
      var k;
      var slideP = -1, slideDx = 0;
      function setSlide(p, dx) {
        p = clamp(num(p, 0), 0, 1); dx = clamp(num(dx, 0), -1, 1);
        if (Math.abs(p - slideP) < 1e-4 && Math.abs(dx - slideDx) < 1e-4) return;
        slideP = p; slideDx = dx;
        var pe = GF.ease.inOut(clamp(p / 0.62, 0, 1)), bl = GF.ease.inOut(sstep(0.52, 1.0, p)), P = headC.P;
        for (var q = 0; q < NG; q++) {
          var zn = (FZ[q] - ZMIN) / (ZMAX - ZMIN);
          var sh = 0.40 * pe * (0.78 + 0.22 * zn);
          var xs = FX[q] * (1 - 0.12 * pe * (1 - zn)) + dx * 0.075 * pe * (0.4 + 0.6 * zn);
          hoodMap(xs, FZ[q] + sh, 1 + 1.6 * pe, P, q * 3);
          if (bl > 0) {
            var sag = 0.06 * Math.sin(bl * PI);
            P[q * 3] = lerp(P[q * 3], hungLocal[q * 3], bl);
            P[q * 3 + 1] = lerp(P[q * 3 + 1], hungLocal[q * 3 + 1], bl) - sag * (0.5 + 0.5 * zn);
            P[q * 3 + 2] = lerp(P[q * 3 + 2], hungLocal[q * 3 + 2], bl) + sag * 0.4;
          }
        }
        headC.commit();
      }
      var flapT = 0, flapC = 0, flapDirty = true;
      function writeHung(t) {
        var P = hungC.P;
        for (var q = 0; q < NG; q++) hungMap(FX[q], FZ[q], flapC, t, P, q * 3);
        hungC.commit();
      }
      setSlide(0, 0); writeHung(0);
      var state = 'head';
      function setState(s) {
        if (s !== 'head' && s !== 'hung' && s !== 'hidden') return;
        state = s; head.visible = s === 'head'; hung.visible = s === 'hung';
      }
      setState('hidden'); state = 'head'; head.visible = true;
      return {
        head: head, hung: hung,
        setState: setState,
        setSlide: setSlide,
        flap: function (v) { flapT = Math.max(flapT, clamp(num(v, 0), 0, 1)); },
        setGlow: GF.makeGlow([headMesh]),
        _update: function (dt, t) {
          flapC = GF.damp(flapC, flapT, 5, dt);
          flapT *= Math.exp(-5 * dt);
          if (flapC < 0.0015) { if (flapC > 0 || flapDirty) { flapC = 0; flapDirty = false; if (hung.visible) writeHung(t); else flapDirty = true; } return; }
          if (hung.visible) writeHung(t);
          flapDirty = true;
        }
      };
    })();

    // ================================================================ DEMO FINGER
    var finger = (function () {
      var g = new THREE.Group(); g.name = 'demoFinger'; g.visible = false;
      var tab = [[0.0000, 0.0010, 0.0009, 0], [0.0008, 0.0042, 0.0036, -0.0004], [0.0025, 0.0062, 0.0055, -0.0006], [0.0055, 0.0074, 0.0066, -0.0006],
        [0.0110, 0.0080, 0.0070, -0.0004], [0.0200, 0.0080, 0.0069, -0.0002], [0.0270, 0.0086, 0.0073, 0], [0.0340, 0.0083, 0.0071, 0],
        [0.0450, 0.0087, 0.0074, 0], [0.0520, 0.0093, 0.0079, 0.0002], [0.0600, 0.0091, 0.0078, 0], [0.0700, 0.0096, 0.0081, 0],
        [0.0780, 0.0128, 0.0094, 0.0005], [0.0850, 0.0192, 0.0110, 0.0010], [0.0920, 0.0262, 0.0124, 0.0015], [0.1000, 0.0305, 0.0130, 0.0020]];
      var fg = loft(tab.map(function (r) { return { c: [0, r[0], r[3]], u: [1, 0, 0], v: [0, 0, 1], a: r[1], b: r[2], n: 2.1 }; }), 24);
      function abAt(y) {
        for (var i = 0; i < tab.length - 1; i++) if (y <= tab[i + 1][0]) { var t = (y - tab[i][0]) / (tab[i + 1][0] - tab[i][0]); return [lerp(tab[i][1], tab[i + 1][1], t), lerp(tab[i][2], tab[i + 1][2], t), lerp(tab[i][3], tab[i + 1][3], t)]; }
        return [tab[tab.length - 1][1], tab[tab.length - 1][2], 0];
      }
      var nail = gridGeo(6, 8, function (u, v, o) {
        var y = 0.0028 + v * 0.0112, ab = abAt(y), xw = (u * 2 - 1) * ab[0] * 0.66 * (v < 0.15 ? 0.75 + v / 0.15 * 0.25 : 1);
        o[0] = xw; o[1] = y; o[2] = ab[2] + ab[1] * Math.sqrt(Math.max(0, 1 - Math.pow(xw / ab[0], 2))) + 0.00035;
      }, function (u, v, c) { c[0] = 1.0; c[1] = 0.86; c[2] = 0.84; });
      var geo = merge([fg, nail]);
      var P = geo.attributes.position.array, C3 = geo.attributes.color.array, n = P.length / 3, C4 = new Float32Array(n * 4);
      for (var i = 0; i < n; i++) {
        var y = P[i * 3 + 1], back = P[i * 3 + 2] > 0 ? 1 : 0;
        var crease = back * (Math.exp(-Math.pow((y - 0.027) / 0.0016, 2)) + Math.exp(-Math.pow((y - 0.052) / 0.002, 2))) * 0.12;
        C4[i * 4] = C3[i * 3] * (1 - crease); C4[i * 4 + 1] = C3[i * 3 + 1] * (1 - crease * 1.2); C4[i * 4 + 2] = C3[i * 3 + 2] * (1 - crease * 1.2);
        C4[i * 4 + 3] = 1 - sstep(0.064, 0.098, y);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(C4, 4));
      var fm = mesh(geo, M.skin, false, false); fm.renderOrder = 10; g.add(fm);
      var rimMat = new THREE.MeshBasicMaterial({ color: 0x8a5038, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, vertexColors: true });
      var rim = mesh(geo, rimMat, false, false); rim.renderOrder = 9; rim.scale.set(1.16, 1.012, 1.2); g.add(rim);
      root.add(g);
      return {
        group: g,
        setOpacity: function (v) { v = clamp(num(v, 0), 0, 1); M.skin.opacity = 0.94 * v; rimMat.opacity = 0.5 * v; g.visible = v > 0.003; }
      };
    })();

    // ================================================================ public object
    return {
      group: root,
      dryer: { group: dryer.group, nozzle: dryer.nozzle, home: dryer.home, setOn: dryer.setOn, setGlow: dryer.setGlow, updateCord: dryer.updateCord },
      brush: { group: brush.group, home: brush.home, setGlow: brush.setGlow },
      tissue: tissue,
      musicBox: musicBox,
      clips: clips,
      pochette: pochette,
      towel: { head: towel.head, hung: towel.hung, setState: towel.setState, setSlide: towel.setSlide, flap: towel.flap, setGlow: towel.setGlow },
      finger: finger,
      update: function (dt, t) {
        dt = clamp(num(dt, 0), 0, 0.05); t = num(t, 0);
        dryer._update(dt);
        tissue._update(dt);
        musicBox._update(dt);
        pochette._update(dt);
        towel._update(dt, t);
      }
    };
  };
})();

/* ---- girl.js ---- */
/* girl.js — the heroine (an ordinary 5-year-old girl, ≈1.08 m) and Mum (seen from behind, under a parasol).
   GF.createGirl({low}) / GF.createMom({low}).
   Bodies are skinned meshes on a small bone rig (smooth weights → no seams at joints); the girl's face is a
   canvas texture on a sculpted head, redrawn only when the expression changes. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function damp(c, t, l, dt) { return c + (t - c) * (1 - Math.exp(-l * dt)); }
  function cr(a, b, c, d, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3); }
  function C(hex) { return new THREE.Color(hex); }
  function v3(a) { return a.isVector3 ? a.clone() : new V3(a[0], a[1], a[2]); }
  var AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);

  // =====================================================================================
  // geometry builder (positions, normals, uvs, vertex colours, skin weights)
  function Builder() { this.P = []; this.N = []; this.U = []; this.Cc = []; this.SI = []; this.SW = []; this.I = []; }
  Builder.prototype.add = function (p, n, u, v, c, w) {
    this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.U.push(u, v);
    if (c) this.Cc.push(c.r, c.g, c.b); else this.Cc.push(1, 1, 1);
    var ia = [0, 0, 0, 0], wa = [1, 0, 0, 0];
    if (w && w.length) {
      w.sort(function (x, y) { return y[1] - x[1]; });
      var s = 0, i; wa[0] = 0;
      for (i = 0; i < 4 && i < w.length; i++) { ia[i] = w[i][0]; wa[i] = w[i][1]; s += wa[i]; }
      if (s > 0) for (i = 0; i < 4; i++) wa[i] /= s; else { wa[0] = 1; }
    }
    this.SI.push(ia[0], ia[1], ia[2], ia[3]); this.SW.push(wa[0], wa[1], wa[2], wa[3]);
    return this.P.length / 3 - 1;
  };
  Builder.prototype.tri = function (a, b, c) {
    var P = this.P, N = this.N;
    var ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    var vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    var nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) this.I.push(a, c, b); else this.I.push(a, b, c);
  };
  Builder.prototype.geometry = function (skinned) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.Cc, 3));
    if (skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    }
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  };

  var _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3();
  function normalAt(o, u, v, p, out) {
    if (o.pole && o.pole(u, v, out)) return out;
    var e = 1e-3, u0 = u - e, u1 = u + e, v0 = Math.max(0, v - e), v1 = Math.min(1, v + e);
    if (!o.closedU) { u0 = Math.max(0, u0); u1 = Math.min(1, u1); }
    o.f(u0, v, _a); o.f(u1, v, _b); _b.sub(_a);
    o.f(u, v0, _c); o.f(u, v1, _d); _d.sub(_c);
    out.crossVectors(_b, _d);
    if (out.lengthSq() < 1e-18) {
      var vs = v < 0.5 ? v + 0.02 : v - 0.02;
      o.f(u0, vs, _a); o.f(u1, vs, _b); _b.sub(_a); o.f(u, vs - e, _c); o.f(u, vs + e, _d); _d.sub(_c);
      out.crossVectors(_b, _d);
    }
    if (out.lengthSq() < 1e-24) out.set(0, 1, 0);
    out.normalize();
    if (o.center) { o.center(u, v, _e); _e.subVectors(p, _e); if (out.dot(_e) < 0) out.negate(); }
    else if (o.flip) out.negate();
    return out;
  }
  // parametric grid surface. o: {nu, nv, f(u,v,out), closedU, center(u,v,out), pole(u,v,out)->bool, uv(u,v,p)->[u,v], col | color(p,u,v), weights(p,u,v)}
  function surf(B, o) {
    var base = B.P.length / 3, nu = o.nu, nv = o.nv, i, j, n = new V3();
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = new V3();
      o.f(u, v, p); normalAt(o, u, v, p, n);
      var uv = o.uv ? o.uv(u, v, p) : [u, v];
      var c = o.color ? o.color(p, u, v) : o.col;
      var w = o.weights ? o.weights(p, u, v) : null;
      B.add(p, n, uv[0], uv[1], c, w);
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = base + j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1;
      B.tri(a, b, d); B.tri(a, d, c2);
    }
  }
  // swept tube along a smooth centreline. keys: [{p, r:[ra, rb], bone, bw}] (ra along `side`, rb across);
  // a key with `bone` starts that bone's region (blend width bw centred on the key).
  function sweep(B, keys, o) {
    var K = keys.map(function (k) { return { p: v3(k.p), r: k.r, bone: k.bone, bw: k.bw }; });
    var n = K.length, M = o.M || 8, pts = [], rad = [], arc = [0], kIdx = [], k, i;
    function P(i) {
      if (i < 0) return K[0].p.clone().multiplyScalar(2).sub(K[1].p);
      if (i >= n) return K[n - 1].p.clone().multiplyScalar(2).sub(K[n - 2].p);
      return K[i].p;
    }
    function R(i, c) { return K[clamp(i, 0, n - 1)].r[c]; }
    for (k = 0; k < n - 1; k++) {
      kIdx.push(pts.length);
      var a = P(k - 1), b = P(k), c = P(k + 1), d = P(k + 2);
      for (var s = 0; s < M; s++) {
        var t = s / M;
        pts.push(new V3(cr(a.x, b.x, c.x, d.x, t), cr(a.y, b.y, c.y, d.y, t), cr(a.z, b.z, c.z, d.z, t)));
        rad.push([Math.max(1e-4, cr(R(k - 1, 0), R(k, 0), R(k + 1, 0), R(k + 2, 0), t)), Math.max(1e-4, cr(R(k - 1, 1), R(k, 1), R(k + 1, 1), R(k + 2, 1), t))]);
      }
    }
    kIdx.push(pts.length); pts.push(K[n - 1].p.clone()); rad.push([K[n - 1].r[0], K[n - 1].r[1]]);
    var N = pts.length, tans = [];
    for (i = 1; i < N; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    for (i = 0; i < N; i++) tans.push(new V3().subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
    var L = arc[N - 1];
    var Cn = new V3(), T = new V3(), A = new V3(), Bn = new V3(), RR = [0, 0], side = o.side || AX;
    function frame(a) {
      a = clamp(a, 0, L);
      var lo = 0, hi = N - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (arc[mid] <= a) lo = mid; else hi = mid; }
      var f = (a - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo]);
      Cn.lerpVectors(pts[lo], pts[hi], f); T.lerpVectors(tans[lo], tans[hi], f).normalize();
      RR[0] = lerp(rad[lo][0], rad[hi][0], f); RR[1] = lerp(rad[lo][1], rad[hi][1], f);
      A.copy(side).addScaledVector(T, -side.dot(T));
      if (A.lengthSq() < 1e-8) A.set(0, 0, 1).addScaledVector(T, -T.z);
      A.normalize(); Bn.crossVectors(T, A);
    }
    var r0 = (K[0].r[0] + K[0].r[1]) / 2, r1 = (K[n - 1].r[0] + K[n - 1].r[1]) / 2;
    var capA = (o.capA || 0) * r0, capB = (o.capB || 0) * r1;
    var nv = o.nv, ncA = capA > 0 ? (o.ncap || 4) : 0, ncB = capB > 0 ? (o.ncap || 4) : 0, NV = nv + ncA + ncB;
    var vm = [0, 0];
    function vmap(v) {
      var j = v * NV, al;
      if (j < ncA) { al = (j / ncA) * PI / 2; vm[0] = -capA * Math.cos(al); vm[1] = Math.sin(al); }
      else if (j > NV - ncB) { al = ((NV - j) / ncB) * PI / 2; vm[0] = L + capB * Math.cos(al); vm[1] = Math.sin(al); }
      else { vm[0] = (j - ncA) / nv * L; vm[1] = 1; }
    }
    var joints = [];
    for (k = 1; k < n; k++) if (K[k].bone !== undefined) joints.push({ a: arc[kIdx[k]], b: K[k].bone, w: K[k].bw || 0.02 });
    function wts(a) {
      var cur = K[0].bone || 0;
      for (var i = 0; i < joints.length; i++) {
        var J = joints[i];
        if (a < J.a - J.w / 2) break;
        if (a > J.a + J.w / 2) { cur = J.b; continue; }
        var t = sstep(J.a - J.w / 2, J.a + J.w / 2, a);
        return [[cur, 1 - t], [J.b, t]];
      }
      return [[cur, 1]];
    }
    var f = function (u, v, out) {
      vmap(v); var a = vm[0]; frame(a);
      var ex = a < 0 ? a : (a > L ? a - L : 0);
      var ph = u * TAU, ra = RR[0] * vm[1], rb = RR[1] * vm[1];
      if (o.mod) { var m = o.mod(ph, a / L); ra *= m; rb *= m; }
      if (o.flatB && Math.sin(ph) > 0) rb *= o.flatB;
      out.copy(Cn).addScaledVector(T, ex).addScaledVector(A, ra * Math.cos(ph)).addScaledVector(Bn, rb * Math.sin(ph));
      if (o.post) o.post(out, ph, a / L);
    };
    surf(B, {
      nu: o.nu, nv: NV, closedU: true, f: f,
      center: function (u, v, out) { vmap(v); frame(vm[0]); out.copy(Cn); },
      pole: function (u, v, out) {
        vmap(v); if (vm[1] > 1e-3) return false;
        frame(vm[0]); out.copy(T).multiplyScalar(vm[0] < L * 0.5 ? -1 : 1); return true;
      },
      uv: function (u, v) { vmap(v); return [u * (o.us || 1), vm[0] * (o.vs || 1)]; },
      color: function (p, u, v) { if (o.color) { vmap(v); return o.color(p, vm[0] / L); } return o.col; },
      weights: function (p, u, v) { if (o.weights) return o.weights(p); vmap(v); return wts(vm[0]); }
    });
    return { L: L, keyArc: kIdx.map(function (i) { return arc[i]; }) };
  }
  // ellipsoid blob. c centre, r radii along (ax, ay, az)
  function blob(B, c, r, o) {
    o = o || {};
    var ax = o.ax || AX, ay = o.ay || AY, az = o.az || AZ, cc = v3(c);
    surf(B, {
      nu: o.nu || 16, nv: o.nv || 10, closedU: true,
      f: function (u, v, out) {
        var th = v * PI, ph = u * TAU, s = Math.sin(th);
        var lx = s * Math.cos(ph) * r[0], ly = Math.cos(th) * r[1], lz = s * Math.sin(ph) * r[2];
        out.copy(cc).addScaledVector(ax, lx).addScaledVector(ay, ly).addScaledVector(az, lz);
      },
      center: function (u, v, out) { out.copy(cc); },
      pole: function (u, v, out) { if (v < 1e-6) { out.copy(ay); return true; } if (v > 1 - 1e-6) { out.copy(ay).negate(); return true; } return false; },
      col: o.col, weights: o.weights, uv: o.uv
    });
  }
  // a hand. o: wrist, d (finger direction), n (palm faces), t (thumb side), sc, curl, bone, col, q
  function buildHand(B, o) {
    var W = v3(o.wrist), d = o.d.clone().normalize(), n = o.n.clone(), t = o.t.clone(), sc = o.sc || 1, curl = o.curl === undefined ? 0.35 : o.curl;
    n.addScaledVector(d, -n.dot(d)).normalize(); t.addScaledVector(d, -t.dot(d)).addScaledVector(n, -t.dot(n)).normalize();
    var bone = o.bone, wts = function () { return [[bone, 1]]; }, lo = o.q < 1;
    function at(sd, st, sn) { return new V3().copy(W).addScaledVector(d, sd * sc).addScaledVector(t, st * sc).addScaledVector(n, sn * sc); }
    sweep(B, [
      { p: at(-0.006, 0, -0.001), r: [0.0155 * sc, 0.0105 * sc], bone: bone },
      { p: at(0.016, 0.001, 0.0), r: [0.0205 * sc, 0.0108 * sc] },
      { p: at(0.037, 0.0005, 0.0005), r: [0.0222 * sc, 0.0094 * sc] },
      { p: at(0.051, 0, 0.0), r: [0.0205 * sc, 0.0076 * sc] }
    ], { side: t, nu: lo ? 10 : 14, nv: lo ? 4 : 6, capA: 0.6, capB: 0.5, ncap: 3, col: o.col, weights: wts });
    var offs = [0.0138, 0.0046, -0.0046, -0.0134], lens = [0.033, 0.038, 0.035, 0.028], spread = [0.10, 0.03, -0.04, -0.12], rads = [0.0058, 0.006, 0.0057, 0.0051];
    var segs = [0.46, 0.30, 0.24], bends = [0.32, 0.5, 0.36];
    for (var i = 0; i < 4; i++) {
      var dir0 = new V3().copy(d).multiplyScalar(Math.cos(spread[i])).addScaledVector(t, Math.sin(spread[i]));
      var p = at(0.046, offs[i], 0.0005), keys = [{ p: p.clone(), r: [rads[i] * sc, rads[i] * 0.88 * sc], bone: bone }];
      var phi = 0.06, cur = p.clone();
      for (var k = 0; k < 3; k++) {
        phi += bends[k] * curl + 0.05;
        var dir = new V3().copy(dir0).multiplyScalar(Math.cos(phi)).addScaledVector(n, Math.sin(phi));
        cur.addScaledVector(dir, lens[i] * segs[k] * sc);
        keys.push({ p: cur.clone(), r: [rads[i] * (0.93 - 0.07 * k) * sc, rads[i] * (0.82 - 0.07 * k) * sc] });
      }
      sweep(B, keys, { side: t, nu: lo ? 6 : 8, nv: lo ? 4 : 6, capA: 0, capB: 1, ncap: 3, col: o.col, weights: wts });
    }
    var tb = at(0.010, 0.0145, 0.004), tdir = new V3().copy(d).multiplyScalar(0.62).addScaledVector(t, 0.55).addScaledVector(n, 0.5).normalize();
    var tbend = new V3().copy(n).multiplyScalar(0.8).addScaledVector(t, -0.6).normalize();
    var tk = [{ p: tb.clone(), r: [0.0082 * sc, 0.0075 * sc], bone: bone }], tc = tb.clone(), tl = [0.017, 0.013, 0.011];
    for (k = 0; k < 3; k++) {
      var tw = 0.12 + (0.18 + 0.15 * k) * curl;
      tdir.multiplyScalar(Math.cos(tw)).addScaledVector(tbend, Math.sin(tw)).normalize();
      tc.addScaledVector(tdir, tl[k] * sc);
      tk.push({ p: tc.clone(), r: [(0.0074 - 0.0006 * k) * sc, (0.0066 - 0.0006 * k) * sc] });
    }
    sweep(B, tk, { side: n, nu: lo ? 6 : 8, nv: lo ? 4 : 6, capA: 0, capB: 1, ncap: 3, col: o.col, weights: wts });
    // palm anchor (hand-bone-local offset is computed by the caller from this world point)
    return at(0.03, 0.002, 0.012);
  }

  // bones from defs [name, parent, [x,y,z] bind position in model space]
  function makeBones(defs) {
    var map = {}, list = [];
    defs.forEach(function (d) {
      var b = new THREE.Bone(); b.name = d[0];
      var wp = v3(d[2]); b.userData.bindW = wp; b.userData.idx = list.length;
      if (d[1]) { b.position.copy(wp).sub(map[d[1]].userData.bindW); map[d[1]].add(b); } else b.position.copy(wp);
      map[d[0]] = b; list.push(b);
    });
    return { map: map, list: list };
  }
  // skirt panel bones: n bones around the waist ring, rotated about their tangent to flare/fold the skirt
  function skirtBoneDefs(prefix, parent, y, W, D, zc, n) {
    var out = [];
    for (var k = 0; k < n; k++) { var th = k / n * TAU; out.push([prefix + k, parent, [Math.sin(th) * W, y, zc + Math.cos(th) * D]]); }
    return out;
  }
  function skirtWeights(map, prefix, pelvisIdx, n, yTop, len, extra) {
    return function (p) {
      var th = Math.atan2(p.x, p.z - 0.0); if (th < 0) th += TAU;
      var x = th / TAU * n, i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, f = x - Math.floor(x);
      var t = clamp((yTop - p.y) / len, 0, 1.2); t = Math.min(1, Math.pow(t, 0.9));
      var w = [[pelvisIdx, 1 - t], [map[prefix + i0].userData.idx, t * (1 - f)], [map[prefix + i1].userData.idx, t * f]];
      if (extra) extra(p, w);
      return w;
    };
  }
  var _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ax = new V3();
  // sets panel k: outward fold angle `out` (+ = hem away from the body), extra pitch about X and roll about Z, length scale
  function setPanel(bone, th, out, pitch, roll, scl) {
    _ax.set(Math.cos(th), 0, -Math.sin(th));
    _qa.setFromAxisAngle(_ax, -out);
    _qb.setFromAxisAngle(AX, pitch); _qa.premultiply(_qb);
    _qb.setFromAxisAngle(AZ, roll); _qa.premultiply(_qb);
    bone.quaternion.copy(_qa);
    bone.scale.set(1, scl, 1);
  }

  // =====================================================================================
  // two-bone IK (upper arm + forearm), solved in the parent (clavicle) space
  var IK = { S: new V3(), T: new V3(), D: new V3(), u: new V3(), n: new V3(), dU: new V3(), dF: new V3(), E: new V3(), h: new V3(), f3: new V3(), e1: new V3(), e2: new V3(), e3: new V3(), tmp: new V3(), m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), qi: new THREE.Quaternion() };
  function makeArm(par, up, fore, endPos) { // endPos: wrist position in fore-local bind (V3)
    var a = up === fore ? 0 : fore.position.length();
    return { par: par, up: up, fore: fore, a: a, bindU: fore.position.clone().normalize(), b: endPos.length(), bindF: endPos.clone().normalize(), hinge: AX.clone() };
  }
  function solveIK(arm, targetW, pole, q1, q2) {
    var k = IK;
    k.S.copy(arm.up.position);
    k.T.copy(targetW); arm.par.worldToLocal(k.T);
    k.D.subVectors(k.T, k.S);
    var d = k.D.length(); if (d < 1e-5) { k.D.set(0, -1, 0); d = 1e-5; }
    k.u.copy(k.D).divideScalar(d);
    var a = arm.a, b = arm.b; d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
    var cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sA = Math.sqrt(1 - cosA * cosA);
    k.n.copy(pole).addScaledVector(k.u, -pole.dot(k.u));
    if (k.n.lengthSq() < 1e-8) k.n.set(0, 0, 1).addScaledVector(k.u, -k.u.z);
    k.n.normalize();
    k.dU.copy(k.u).multiplyScalar(cosA).addScaledVector(k.n, sA);
    k.E.copy(k.S).addScaledVector(k.dU, a);
    k.dF.copy(k.S).addScaledVector(k.u, d).sub(k.E).normalize();
    k.h.crossVectors(k.n, k.u).normalize();
    k.e1.copy(arm.bindU); k.e2.copy(arm.hinge).addScaledVector(k.e1, -arm.hinge.dot(k.e1)).normalize(); k.e3.crossVectors(k.e1, k.e2);
    k.tmp.copy(k.h).addScaledVector(k.dU, -k.h.dot(k.dU)).normalize(); k.f3.crossVectors(k.dU, k.tmp);
    k.m1.makeBasis(k.dU, k.tmp, k.f3); k.m2.makeBasis(k.e1, k.e2, k.e3).transpose(); k.m1.multiply(k.m2);
    q1.setFromRotationMatrix(k.m1);
    k.qi.copy(q1).invert(); k.tmp.copy(k.dF).applyQuaternion(k.qi);
    q2.setFromUnitVectors(arm.bindF, k.tmp);
  }

  // =====================================================================================
  // shared canvas textures
  function weaveTex(size, base, amp, opts) {
    return GF.canvasTex(size, size, function (c, w, h) {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      var img = c.getImageData(0, 0, w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var v = ((x + y) & 1 ? 1 : -1) * amp * 0.5 + (GF.noise2(x * 0.35, y * 2.1) - 0.5) * amp + (GF.noise2(x * 2.1 + 40, y * 0.35) - 0.5) * amp;
        if (opts && opts.rib) v += (Math.sin(x / w * TAU * opts.rib) * 0.5 + 0.5) * -amp * 0.9;
        d[i] = clamp(d[i] + v, 0, 255); d[i + 1] = clamp(d[i + 1] + v, 0, 255); d[i + 2] = clamp(d[i + 2] + v, 0, 255);
      }
      c.putImageData(img, 0, 0);
      if (opts && opts.dots) {
        c.fillStyle = 'rgba(255,253,246,0.95)';
        for (var gy = 0; gy < 4; gy++) for (var gx = 0; gx < 4; gx++) {
          var cx = gx * w / 4 + (gy & 1) * w / 8 + w / 16, cy = gy * h / 4 + h / 8;
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) { c.beginPath(); c.arc(cx + ox * w, cy + oy * h, opts.dots, 0, TAU); c.fill(); }
        }
      }
    }, { repeat: [1, 1] });
  }

  // =====================================================================================
  // FACE: canvas painted over the whole head (scalp = hair colour, face = features)
  var FK = 2.6;   // horizontal texel concentration toward the face
  function gmap(a) { var s = a < 0 ? -1 : 1; a = Math.abs(a); return s * FK * a / (1 + (FK - 1) * a); }
  function ginv(g) { var s = g < 0 ? -1 : 1; g = Math.min(Math.abs(g), 1.2); return s * g / (FK - (FK - 1) * g); }
  var SKIN_RGB = [235, 188, 158], HAIR_RGB = [26, 18, 12];
  var HAIRLINE = [[0, 0.052], [22, 0.050], [40, 0.042], [52, 0.030], [62, 0.016], [70, 0.002], [77, -0.014], [83, -0.008], [88, 0.012], [94, 0.022], [106, 0.020], [116, 0.0], [128, -0.040], [145, -0.066], [165, -0.076], [180, -0.079]];
  function hairY(psi) {
    for (var i = 1; i < HAIRLINE.length; i++) if (psi <= HAIRLINE[i][0]) {
      var a = HAIRLINE[i - 1], b = HAIRLINE[i], t = (psi - a[0]) / (b[0] - a[0]); t = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * t;
    }
    return HAIRLINE[HAIRLINE.length - 1][1];
  }
  function makeFace(S) {
    var R = GF.HEAD.skull, H = GF.HEAD;
    var base = document.createElement('canvas'); base.width = base.height = S;
    (function paintBase(ctx) {
      var img = ctx.createImageData(S, S), d = img.data;
      for (var py = 0; py < S; py++) {
        var th = (py + 0.5) / S * PI, st = Math.sin(th), ct = Math.cos(th);
        for (var px = 0; px < S; px++) {
          var phi = ginv(((px + 0.5) / S - 0.5) * 2) * PI;
          var dx = st * Math.sin(phi), dy = ct, dz = -st * Math.cos(phi);
          var x = dx * R[0], y = dy * R[1], z = dz * R[2];
          var psi = Math.abs(Math.atan2(x, -z)) * 180 / PI;
          var yh = hairY(psi) + (GF.noise2(px * 0.21, py * 0.21) - 0.5) * 0.004 + (GF.noise2(px * 0.05 + 9, 3) - 0.5) * 0.004;
          var hair = sstep(yh - 0.0025, yh + 0.0045, y);
          if (py > S * 0.95) hair = 0;
          var n1 = GF.noise2(px * 0.07, py * 0.07) - 0.5, n2 = GF.noise2(px * 0.6, py * 0.6) - 0.5;
          var sr = SKIN_RGB[0] + n1 * 6 + n2 * 3, sg = SKIN_RGB[1] + n1 * 6 + n2 * 3, sb = SKIN_RGB[2] + n1 * 5 + n2 * 3;
          // a touch warmer on the nose tip / chin / ears zone, slight shade under the jaw
          var under = sstep(-0.075, -0.094, y) * (py > S * 0.95 ? 0 : 1);
          sr -= under * 14; sg -= under * 18; sb -= under * 14;
          var hn = GF.noise2(px * 1.3, py * 0.12) - 0.5, hn2 = GF.noise2(px * 0.2, py * 0.05) - 0.5;
          var hr = HAIR_RGB[0] + hn * 14 + hn2 * 8, hg = HAIR_RGB[1] + hn * 10 + hn2 * 6, hb = HAIR_RGB[2] + hn * 8 + hn2 * 4;
          var i = (py * S + px) * 4;
          d[i] = sr + (hr - sr) * hair; d[i + 1] = sg + (hg - sg) * hair; d[i + 2] = sb + (hb - sb) * hair; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    })(base.getContext('2d'));
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    var ctx = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    var pt = [0, 0];
    function P(x, y) {
      var dx = x / R[0], dy = y / R[1], q = 1 - dx * dx - dy * dy, dz = -Math.sqrt(Math.max(0, q));
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
      pt[0] = (0.5 + 0.5 * gmap(Math.atan2(dx, -dz) / PI)) * S; pt[1] = Math.acos(clamp(dy, -1, 1)) / PI * S;
      return pt;
    }
    function mv(x, y) { P(x, y); ctx.moveTo(pt[0], pt[1]); }
    function ln(x, y) { P(x, y); ctx.lineTo(pt[0], pt[1]); }
    var pxm = (function () { P(0.028, -0.008); var a = pt[0], b = pt[1]; P(0.029, -0.008); return Math.hypot(pt[0] - a, pt[1] - b) * 1000; })();
    var NE = 14, up = new Float32Array(NE + 1), lo = new Float32Array(NE + 1), xs = new Float32Array(NE + 1);
    function eye(s, F, open) {
      var cx = s * 0.029, cy = H.eyeY, ew = 0.0118, i, t;
      var eu = 0.0102 * (1 + 0.16 * F.wide), el = 0.0054;
      for (i = 0; i <= NE; i++) {
        t = i / NE;                                 // 0 inner corner … 1 outer corner
        var x = cx + s * ew * (2 * t - 1), base = lerp(cy - 0.0003, cy + 0.0012, t);
        var Su = Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.65), Sl = Math.pow(Math.sin(PI * Math.pow(t, 1.05)), 0.85);
        var upO = base + eu * Su, loO = base - el * Sl + F.lift * el * 1.45 * Sl;
        var closed = base - el * 0.6 * Sl + F.hclose * 0.0062 * Su;
        var u = closed + (upO - closed) * open;
        xs[i] = x; up[i] = u; lo[i] = Math.min(loO, u);
      }
      var gx = cx + F.gx * 0.0043, gy = cy + 0.0016 + F.gy * 0.0026, ir = 0.0073;
      if (open > 0.07) {
        ctx.save();
        ctx.beginPath(); mv(xs[0], up[0]); for (i = 1; i <= NE; i++) ln(xs[i], up[i]); for (i = NE; i >= 0; i--) ln(xs[i], lo[i]); ctx.closePath();
        ctx.fillStyle = '#efe6df'; ctx.fill(); ctx.clip();
        P(cx, cy); var ex = pt[0], ey = pt[1];
        var sg = ctx.createRadialGradient(ex, ey, 0, ex, ey, ew * pxm * 1.1); sg.addColorStop(0, 'rgba(255,252,250,0.9)'); sg.addColorStop(1, 'rgba(214,188,178,0.9)');
        ctx.fillStyle = sg; ctx.fillRect(ex - 30, ey - 30, 60, 60);
        P(gx, gy); var ix = pt[0], iy = pt[1], ipx = ir * pxm;
        var ig = ctx.createRadialGradient(ix, iy, 0, ix, iy, ipx);
        ig.addColorStop(0, '#120a06'); ig.addColorStop(0.38, '#1d100a'); ig.addColorStop(0.5, '#4b2c1a'); ig.addColorStop(0.78, '#5e3b24'); ig.addColorStop(0.92, '#3a2214'); ig.addColorStop(1, '#1e110a');
        ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ipx, 0, TAU); ctx.fill();
        // lid shadow on the eyeball
        P(cx, cy + eu); var ty = pt[1];
        var lg = ctx.createLinearGradient(0, ty, 0, ty + ipx * 1.25); lg.addColorStop(0, 'rgba(50,25,15,0.55)'); lg.addColorStop(1, 'rgba(50,25,15,0)');
        ctx.fillStyle = lg; ctx.fillRect(ex - 30, ty - 4, 60, ipx * 1.25 + 4);
        // catchlights
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(ix - 0.0019 * pxm, iy - 0.0019 * pxm, 0.00135 * pxm, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(ix + 0.0017 * pxm, iy + 0.0015 * pxm, 0.0007 * pxm, 0, TAU); ctx.fill();
        ctx.restore();
        // lid crease
        ctx.strokeStyle = 'rgba(150,88,66,' + (0.22 * open).toFixed(3) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); for (i = 2; i <= NE - 1; i++) { var cy2 = up[i] + 0.0032 * (0.6 + 0.4 * open); if (i === 2) mv(xs[i], cy2); else ln(xs[i], cy2); } ctx.stroke();
        // lower lid
        ctx.strokeStyle = 'rgba(130,72,52,0.35)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); mv(xs[1], lo[1]); for (i = 2; i <= NE; i++) ln(xs[i], lo[i]); ctx.stroke();
      }
      // upper lash line (also the closed-eye line)
      ctx.strokeStyle = '#2a170f'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 0.0012 * pxm * (open > 0.07 ? 1 : 0.85);
      ctx.beginPath(); mv(xs[0], up[0]); for (i = 1; i <= NE; i++) ln(xs[i], up[i]);
      ln(xs[NE] + s * 0.0013, up[NE] + 0.0008 * (open > 0.07 ? 1 : 0.2)); ctx.stroke();
      ctx.lineWidth = 0.0008 * pxm;
      ctx.beginPath(); mv(xs[NE / 2], up[NE / 2]); for (i = NE / 2 + 1; i <= NE; i++) ln(xs[i], up[i] + 0.0003); ctx.stroke();
      if (F.squeeze > 0.2) {
        ctx.strokeStyle = 'rgba(140,78,60,' + (0.55 * F.squeeze).toFixed(3) + ')'; ctx.lineWidth = 1.3;
        var ox = cx + s * (ew + 0.0025);
        ctx.beginPath(); mv(ox, cy + 0.003); ln(ox + s * 0.0035, cy + 0.0045); ctx.stroke();
        ctx.beginPath(); mv(ox, cy - 0.0008); ln(ox + s * 0.0036, cy - 0.0016); ctx.stroke();
      }
    }
    function brow(s, F) {
      var y0 = H.browY + 0.0075 + F.brow;
      ctx.beginPath();
      for (var pass = 0; pass < 2; pass++) for (var i = 0; i <= 10; i++) {
        var t = pass === 0 ? i / 10 : 1 - i / 10;
        var x = s * (0.011 + 0.034 * t), y = y0 + 0.0032 * Math.sin(PI * Math.pow(t, 0.75)) - 0.0022 * t - F.knit * 0.0016 * (1 - t);
        var th = (0.0022 * (1 - 0.65 * t) + 0.0004) * (pass === 0 ? 0.5 : -0.5);
        if (pass === 0 && i === 0) mv(x, y + th); else ln(x, y + th);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(100,64,42,0.55)'; ctx.fill();
    }
    var NM = 14, mt = new Float32Array(NM + 1), mb = new Float32Array(NM + 1), mx = new Float32Array(NM + 1);
    function mouth(F) {
      var cy = H.mouthY, w = F.mw, h = F.mh, rnd = F.mround, i;
      var e = lerp(1.0, 0.5, rnd), kt = lerp(0.18, 0.45, rnd);
      for (i = 0; i <= NM; i++) {
        var t = i / NM, St = Math.pow(Math.sin(PI * t), e), q = 2 * t - 1;
        var line = cy + F.corner * q * q - 0.0005 * F.smile * Math.sin(PI * t);
        mx[i] = -w + 2 * w * t; mt[i] = line + h * kt * St; mb[i] = line - h * (1 - kt) * St;
      }
      ctx.save(); ctx.shadowBlur = 1.5;
      // upper lip
      ctx.shadowColor = 'rgba(200,118,110,0.8)';
      ctx.beginPath(); mv(mx[0], mt[0]);
      for (i = 0; i <= NM; i++) { var t1 = i / NM; ln(mx[i], mt[i] + 0.0021 * Math.pow(Math.sin(PI * t1), 0.6) - 0.0005 * Math.exp(-Math.pow((t1 - 0.5) / 0.09, 2))); }
      for (i = NM; i >= 0; i--) ln(mx[i], mt[i]);
      ctx.fillStyle = 'rgba(206,112,106,0.9)'; ctx.fill();
      // lower lip
      ctx.shadowColor = 'rgba(222,140,128,0.8)';
      ctx.beginPath(); mv(mx[0], mb[0]);
      for (i = 0; i <= NM; i++) { var t2 = i / NM; ln(mx[i], mb[i] - 0.0031 * Math.pow(Math.sin(PI * t2), 0.7)); }
      for (i = NM; i >= 0; i--) ln(mx[i], mb[i]);
      ctx.fillStyle = 'rgba(226,132,124,0.9)'; ctx.fill();
      ctx.restore();
      P(0.0, H.mouthY - 0.0012 - h * 0.9 - 0.0011); ctx.fillStyle = 'rgba(255,225,215,0.28)'; ctx.beginPath(); ctx.ellipse(pt[0], pt[1], w * pxm * 0.45, 0.0006 * pxm, 0, 0, TAU); ctx.fill();
      if (h > 0.0003) {
        ctx.save();
        ctx.beginPath(); mv(mx[0], mt[0]); for (i = 1; i <= NM; i++) ln(mx[i], mt[i]); for (i = NM; i >= 0; i--) ln(mx[i], mb[i]); ctx.closePath();
        ctx.fillStyle = '#5a2020'; ctx.fill();
        if (F.laugh > 0.25) {
          ctx.clip(); P(0, H.mouthY + h * kt); var ty = pt[1];
          ctx.fillStyle = 'rgba(244,238,232,' + (0.9 * sstep(0.25, 0.6, F.laugh)).toFixed(3) + ')';
          ctx.fillRect(pt[0] - w * pxm * 0.75, ty - 3, w * pxm * 1.5, 3 + h * pxm * 0.32);
          P(0, H.mouthY - h * 0.75); ctx.fillStyle = 'rgba(200,100,100,0.6)'; ctx.beginPath(); ctx.ellipse(pt[0], pt[1], w * pxm * 0.55, h * pxm * 0.3, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(135,64,56,' + (0.85 * (1 - sstep(0.0004, 0.0012, h))).toFixed(3) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); mv(mx[0], (mt[0] + mb[0]) / 2); for (i = 1; i <= NM; i++) ln(mx[i], (mt[i] + mb[i]) / 2); ctx.stroke();
      if (F.smile > 0.3) {
        ctx.fillStyle = 'rgba(170,95,82,' + (0.25 * F.smile).toFixed(3) + ')';
        for (var s = -1; s <= 1; s += 2) { P(s * (w + 0.0009), cy + F.corner + 0.0003); ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.3, 0, TAU); ctx.fill(); }
      }
    }
    function blush(s, F) {
      P(s * 0.043, -0.037 + 0.004 * F.smile); var x = pt[0], y = pt[1], r = 0.021 * pxm;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(236,118,108,' + F.blush.toFixed(3) + ')'); g.addColorStop(1, 'rgba(236,118,108,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    function nose() {
      P(0, H.noseY - 0.0055); var g = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 0.0075 * pxm);
      g.addColorStop(0, 'rgba(170,90,72,0.20)'); g.addColorStop(1, 'rgba(170,90,72,0)'); ctx.fillStyle = g; ctx.fillRect(pt[0] - 20, pt[1] - 20, 40, 40);
      ctx.fillStyle = 'rgba(125,62,52,0.42)';
      for (var s = -1; s <= 1; s += 2) { P(s * 0.0043, H.noseY - 0.0036); ctx.beginPath(); ctx.ellipse(pt[0], pt[1], 0.0013 * pxm, 0.0008 * pxm, s * 0.3, 0, TAU); ctx.fill(); }
      P(0, H.noseY + 0.0025); var h2 = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 0.0035 * pxm);
      h2.addColorStop(0, 'rgba(255,238,228,0.30)'); h2.addColorStop(1, 'rgba(255,238,228,0)'); ctx.fillStyle = h2; ctx.fillRect(pt[0] - 12, pt[1] - 12, 24, 24);
      // soft shade on the nose sides
      for (s = -1; s <= 1; s += 2) {
        P(s * 0.0075, H.noseY + 0.004); var g3 = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 0.006 * pxm);
        g3.addColorStop(0, 'rgba(190,120,95,0.10)'); g3.addColorStop(1, 'rgba(190,120,95,0)'); ctx.fillStyle = g3; ctx.fillRect(pt[0] - 20, pt[1] - 20, 40, 40);
      }
    }
    function draw(F) {
      ctx.globalAlpha = 1; ctx.drawImage(base, 0, 0);
      blush(-1, F); blush(1, F); nose();
      brow(-1, F); brow(1, F);
      eye(-1, F, F.open); eye(1, F, F.open);
      mouth(F);
      tex.needsUpdate = true;
    }
    return { tex: tex, draw: draw, canvas: cv };
  }

  // the sculpted head (head-local, origin = head centre) + ears, uv = face canvas mapping
  function buildHead(B, low) {
    var R = GF.HEAD.skull;
    var bumps = [
      { c: [0, -0.43, -0.90], s: 0.055, a: 0.0030, d: [0, -0.3, -1] },      // nose
      { c: [0, -0.62, -0.78], s: 0.3, a: 0.003, d: [0, 0, -1] },          // nose bridge/tip blend
      { c: [0.55, -0.56, -0.62], s: 0.3, a: 0.0105 }, { c: [-0.55, -0.56, -0.62], s: 0.3, a: 0.0105 },   // cheeks
      { c: [0, -0.84, -0.54], s: 0.2, a: 0.006, d: [0, 0.1, -1] },     // chin / lower face forward
      { c: [0, -0.66, -0.75], s: 0.12, a: 0.0022, d: [0, -0.2, -1] },      // lips area
      { c: [0.33, -0.08, -0.94], s: 0.09, a: -0.0022 }, { c: [-0.33, -0.08, -0.94], s: 0.09, a: -0.0022 },  // eye sockets (soft)
      { c: [0.74, -0.62, -0.2], s: 0.22, a: -0.003 }, { c: [-0.74, -0.62, -0.2], s: 0.22, a: -0.003 }, // jaw narrows
      { c: [0, -0.55, 0.83], s: 0.33, a: -0.006 },                         // nape tucks in
      { c: [0, 0.15, 0.99], s: 0.45, a: 0.0035 }                            // round back of the head
    ].map(function (b) { b.c = v3(b.c).normalize(); if (b.d) b.d = v3(b.d).normalize(); b.k = 1 / (2 * b.s * b.s); return b; });
    var dir = new V3(), tmp = new V3();
    function f(u, v, out) {
      var phi = ginv(2 * u - 1) * PI, th = v * PI, st = Math.sin(th);
      dir.set(st * Math.sin(phi), Math.cos(th), -st * Math.cos(phi));
      out.set(dir.x * R[0], dir.y * R[1], dir.z * R[2]);
      for (var i = 0; i < bumps.length; i++) {
        var b = bumps[i], g = Math.exp(-tmp.subVectors(dir, b.c).lengthSq() * b.k) * b.a;
        if (g * g < 1e-14) continue;
        out.addScaledVector(b.d || dir, g);
      }
    }
    surf(B, {
      nu: low ? 40 : 56, nv: low ? 28 : 40, closedU: true, f: f,
      center: function (u, v, out) { out.set(0, 0, 0); },
      pole: function (u, v, out) { if (v < 1e-6) { out.set(0, 1, 0); return true; } if (v > 1 - 1e-6) { out.set(0, -1, 0); return true; } return false; },
      uv: function (u, v) { return [u, 1 - v]; }
    });
    // ears
    var H = GF.HEAD;
    for (var s = -1; s <= 1; s += 2) {
      var ang = 0.42, out = new V3(s * Math.cos(ang), 0, -Math.sin(ang)), upv = new V3(0, 1, 0.18).normalize();
      upv.addScaledVector(out, -upv.dot(out)).normalize();
      var bk = new V3().crossVectors(out, upv).normalize(); if (bk.z < 0) bk.negate();
      var ec = new V3(s * (H.earX - 0.004), H.earY + 0.001, H.earZ + 0.004);
      (function (out, upv, bk, ec) {
        surf(B, {
          nu: low ? 14 : 20, nv: low ? 10 : 14, closedU: true,
          f: function (u, v, o2) {
            var th = v * PI, ph = u * TAU, rho = Math.sin(th), eo = Math.cos(th);
            var ey = rho * Math.cos(ph), ez = rho * Math.sin(ph);
            var ry = ey < 0 ? 0.0225 : 0.026, rz = ey < 0 ? 0.0135 : 0.0165;
            var o = eo > 0 ? eo * 0.0068 - 0.0072 * (1 - sstep(0.5, 0.88, rho)) * sstep(-0.8, -0.35, ey) : eo * 0.008;
            o2.copy(ec).addScaledVector(upv, ey * ry).addScaledVector(bk, ez * rz).addScaledVector(out, o + 0.002);
          },
          center: function (u, v, o2) { o2.copy(ec).addScaledVector(out, -0.03); },
          uv: function () { return [0.5, 0.012]; }
        });
      })(out, upv, bk, ec);
    }
  }

  // =====================================================================================
  // torso-like surface from 9 uniform keys (y, W, D, zc, tummy, ex)
  function keyAt(arr, v) {
    var x = clamp(v, 0, 1) * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(x)), f = x - i;
    return cr(arr[Math.max(0, i - 1)], arr[i], arr[i + 1], arr[Math.min(arr.length - 1, i + 2)], f);
  }
  function makeTorso(K, neckDrop) {
    return function (th, v, out) {
      var y = keyAt(K.y, v), W = keyAt(K.W, v), D = keyAt(K.D, v), zc = keyAt(K.zc, v), tum = keyAt(K.tum, v), ex = keyAt(K.ex, v);
      var s = Math.sin(th), c = Math.cos(th);
      var sx = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / ex), cz = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / ex);
      var z = zc + D * cz;
      if (c < 0) z += tum * c * Math.abs(c);
      if (K.blade && c > 0) z += K.blade * sstep(0.3, 0.5, v) * (1 - sstep(0.62, 0.8, v)) * Math.exp(-Math.pow((Math.abs(s) - 0.55) / 0.22, 2));
      if (neckDrop && c < 0) y -= neckDrop * sstep(0.8, 1, v) * c * c;
      out.set(W * sx, y, z);
    };
  }
  function torsoNormal(fn, th, v, out) {
    var e = 1e-3;
    fn(th - e, v, _a); fn(th + e, v, _b); _b.sub(_a);
    fn(th, Math.max(0, v - e), _c); fn(th, Math.min(1, v + e), _d); _d.sub(_c);
    out.crossVectors(_b, _d).normalize();
    fn(th, v, _e); _e.y = 0; _a.set(_e.x, 0, _e.z - 0.005);
    if (out.dot(_a) < 0) out.negate();
    return out;
  }

  // =====================================================================================
  //                                           GIRL
  // =====================================================================================
  GF.createGirl = function (opts) {
    opts = opts || {};
    var low = !!opts.low, qq = low ? 0.62 : 1;
    function seg(n) { return Math.max(4, Math.round(n * qq)); }
    var group = new THREE.Group(); group.name = 'girl';

    var defs = [
      ['root', null, [0, 0, 0]],
      ['pelvis', 'root', [0, 0.56, 0.0]],
      ['spine', 'pelvis', [0, 0.645, 0.004]],
      ['chest', 'spine', [0, 0.725, 0.006]],
      ['neck', 'chest', [0, 0.85, 0.008]],
      ['head', 'neck', [0, 0.912, 0.004]],
      ['clavR', 'chest', [0.02, 0.80, 0.006]], ['armR', 'clavR', [0.098, 0.812, 0.002]], ['foreR', 'armR', [0.114, 0.645, 0.012]], ['twR', 'foreR', [0.119, 0.578, 0.009]], ['handR', 'twR', [0.124, 0.507, 0.004]],
      ['clavL', 'chest', [-0.02, 0.80, 0.006]], ['armL', 'clavL', [-0.098, 0.812, 0.002]], ['foreL', 'armL', [-0.114, 0.645, 0.012]], ['twL', 'foreL', [-0.119, 0.578, 0.009]], ['handL', 'twL', [-0.124, 0.507, 0.004]],
      ['thighR', 'pelvis', [0.062, 0.52, 0.0]], ['shinR', 'thighR', [0.06, 0.295, -0.004]], ['footR', 'shinR', [0.058, 0.062, 0.012]],
      ['thighL', 'pelvis', [-0.062, 0.52, 0.0]], ['shinL', 'thighL', [-0.06, 0.295, -0.004]], ['footL', 'shinL', [-0.058, 0.062, 0.012]]
    ];
    var SKN = 8, WAISTY = 0.618, SKW = 0.113, SKD = 0.076, SKZ = 0.004;
    defs = defs.concat(skirtBoneDefs('sk', 'pelvis', WAISTY, SKW, SKD, SKZ, SKN));
    var rig = makeBones(defs), Bm = rig.map, skB = [];
    for (var ki = 0; ki < SKN; ki++) skB.push(Bm['sk' + ki]);
    function bi(n) { return Bm[n].userData.idx; }
    group.add(Bm.root);
    group.updateMatrixWorld(true);
    var skeleton = new THREE.Skeleton(rig.list);

    var SK = C(0xebbc9e), WHITE = C(0xf8f7f3), SASH = C(0xebcf7d), PEARL = C(0xf4efe4), SHOE = C(0x7b1a2c), SOLE = C(0xc9ad8b), BUCK = C(0xd8d2c8);
    var skinB = new Builder(), dressB = new Builder(), trimB = new Builder(), shoeB = new Builder(), headB = new Builder();

    // ---- torso (bodice) weights
    function torsoW(p) {
      var w = [], y = p.y, ax = Math.abs(p.x), side = p.x >= 0 ? 'R' : 'L';
      var tps = sstep(0.585, 0.64, y), tsc = sstep(0.69, 0.74, y);
      var wp = 1 - tps, ws = tps * (1 - tsc), wc = tps * tsc;
      var cl = sstep(0.05, 0.115, ax) * sstep(0.755, 0.83, y) * 0.85, ar = sstep(0.112, 0.14, ax) * sstep(0.74, 0.8, y) * 0.5;
      if (wp > 0) w.push([bi('pelvis'), wp]);
      if (ws > 0) w.push([bi('spine'), ws]);
      if (wc > 0) {
        var rest = wc * (1 - cl), clw = wc * cl;
        w.push([bi('chest'), rest]);
        if (clw > 0) { w.push([bi('clav' + side), clw * (1 - ar)]); if (ar > 0) w.push([bi('arm' + side), clw * ar]); }
      }
      return w;
    }
    // ---- bodice
    var BK = {
      y: [0.596, 0.66, 0.72, 0.77, 0.808, 0.836, 0.855, 0.868, 0.877],
      W: [0.110, 0.113, 0.120, 0.127, 0.129, 0.121, 0.100, 0.071, 0.045],
      D: [0.073, 0.072, 0.071, 0.069, 0.066, 0.060, 0.052, 0.045, 0.040],
      zc: [0.0, 0.0, 0.003, 0.005, 0.006, 0.006, 0.007, 0.008, 0.009],
      tum: [0.010, 0.007, 0.002, 0.0, 0, 0, 0, 0, 0],
      ex: [2.0, 2.05, 2.15, 2.3, 2.45, 2.5, 2.4, 2.2, 2.0], blade: 0.004
    };
    var bodyPos = makeTorso(BK, 0.014);
    surf(dressB, {
      nu: seg(48), nv: seg(26), closedU: true,
      f: function (u, v, out) { bodyPos(TAU * u - PI / 2, v, out); },
      center: function (u, v, out) { out.set(0, keyAt(BK.y, v), keyAt(BK.zc, v)); },
      uv: function (u, v, p) { return [u * 8, p.y / 0.08]; },
      weights: function (p) { return torsoW(p); }
    });
    // ---- skirt
    var skirtLen = 0.262;
    function skirtPos(u, v, out) {
      var th = TAU * u - PI / 2, lip = 0, vv = v / 0.88;
      if (vv > 1) { lip = (vv - 1) / (0.12 / 0.88); vv = 1; }
      var e = Math.pow(vv, 0.8);
      var rx = SKW + 0.098 * e, rz = SKD + 0.104 * e, zc = SKZ + 0.014 * e;
      var fold = 0.0115 * Math.pow(vv, 1.25) * (0.55 * Math.sin(7 * th + 1.3) + 0.35 * Math.sin(11 * th + 0.4) + 0.2 * Math.sin(17 * th + 2.1));
      var s = Math.sin(th), c = Math.cos(th);
      var rad = 1 - lip * 0.045, x = (rx * s) * rad + s * fold, z = zc + (rz * c) * rad + c * fold;
      if (c < 0) z += c * Math.abs(c) * 0.008 * (1 - vv);
      var y = WAISTY - skirtLen * vv + fold * 0.25 * vv + lip * 0.018;
      out.set(x, y, z);
    }
    var skW = skirtWeights(Bm, 'sk', bi('pelvis'), SKN, WAISTY, skirtLen);
    surf(dressB, {
      nu: seg(80), nv: seg(20), closedU: true, f: skirtPos,
      center: function (u, v, out) { var vv = Math.min(1, v / 0.88); out.set(0, WAISTY - skirtLen * vv, SKZ + 0.014 * vv); },
      uv: function (u, v, p) { return [u * 13, (WAISTY - p.y) / 0.08 + (v > 0.88 ? (v - 0.88) * 0.6 : 0)]; },
      weights: function (p) { return skW(p); }
    });
    // ---- sleeves (dress)
    for (var s = -1; s <= 1; s += 2) {
      var sd = s > 0 ? 'R' : 'L';
      sweep(dressB, [
        { p: [s * 0.093, 0.834, 0.001], r: [0.037, 0.035], bone: bi('chest') },
        { p: [s * 0.102, 0.80, 0.003], r: [0.045, 0.043], bone: bi('arm' + sd), bw: 0.05 },
        { p: [s * 0.108, 0.765, 0.005], r: [0.044, 0.042] },
        { p: [s * 0.111, 0.738, 0.006], r: [0.042, 0.040] }
      ], { side: AX, nu: seg(24), nv: seg(8), capA: 0.75, capB: 0, ncap: 4, us: 3, vs: 1 / 0.08, mod: function (ph, a) { return 1 + 0.03 * Math.sin(6 * ph) * a; } });
    }

    // ---- skin: neck, arms, hands, legs
    sweep(skinB, [
      { p: [0, 0.80, 0.012], r: [0.037, 0.035], bone: bi('chest') },
      { p: [0, 0.85, 0.010], r: [0.0355, 0.0335], bone: bi('neck'), bw: 0.035 },
      { p: [0, 0.905, 0.006], r: [0.034, 0.032], bone: bi('head'), bw: 0.035 },
      { p: [0, 0.955, 0.0], r: [0.030, 0.028] }
    ], { side: AX, nu: seg(24), nv: seg(10), capA: 0, capB: 0.7, col: SK });
    var handAnchorPos = {};
    for (s = -1; s <= 1; s += 2) {
      sd = s > 0 ? 'R' : 'L';
      sweep(skinB, [
        { p: [s * 0.072, 0.828, 0.0], r: [0.030, 0.030], bone: bi('clav' + sd) },
        { p: [s * 0.098, 0.808, 0.002], r: [0.0315, 0.031], bone: bi('arm' + sd), bw: 0.05 },
        { p: [s * 0.107, 0.735, 0.007], r: [0.029, 0.0285] },
        { p: [s * 0.114, 0.645, 0.012], r: [0.0235, 0.0225], bone: bi('fore' + sd), bw: 0.032 },
        { p: [s * 0.117, 0.598, 0.011], r: [0.0225, 0.0235] },
        { p: [s * 0.120, 0.565, 0.009], r: [0.0195, 0.022], bone: bi('tw' + sd), bw: 0.07 },
        { p: [s * 0.124, 0.512, 0.004], r: [0.0135, 0.0185], bone: bi('hand' + sd), bw: 0.022 },
        { p: [s * 0.1245, 0.498, 0.004], r: [0.0128, 0.0178] }
      ], { side: AX, nu: seg(18), nv: seg(28), capA: 0.6, capB: 0.6, ncap: 3, col: SK });
      var hp = buildHand(skinB, {
        wrist: [s * 0.124, 0.506, 0.004], d: new V3(s * 0.04, -1, -0.01), n: new V3(-s, 0, 0), t: new V3(0, 0, -1),
        sc: 1, curl: 0.42, bone: bi('hand' + sd), col: SK, q: qq
      });
      handAnchorPos[sd] = hp;
      // leg (skin) down to the ankle (inside the sock)
      sweep(skinB, [
        { p: [s * 0.062, 0.575, 0.002], r: [0.056, 0.058], bone: bi('pelvis') },
        { p: [s * 0.062, 0.52, 0.0], r: [0.0565, 0.058], bone: bi('thigh' + sd), bw: 0.07 },
        { p: [s * 0.0625, 0.42, -0.003], r: [0.050, 0.051] },
        { p: [s * 0.061, 0.335, -0.004], r: [0.0405, 0.040] },
        { p: [s * 0.060, 0.295, -0.004], r: [0.0375, 0.0375], bone: bi('shin' + sd), bw: 0.04 },
        { p: [s * 0.0598, 0.235, 0.0], r: [0.036, 0.039] },
        { p: [s * 0.059, 0.16, 0.006], r: [0.031, 0.032] },
        { p: [s * 0.058, 0.10, 0.010], r: [0.0245, 0.0245] },
        { p: [s * 0.058, 0.066, 0.012], r: [0.0225, 0.0235], bone: bi('foot' + sd), bw: 0.03 },
        { p: [s * 0.058, 0.05, 0.012], r: [0.021, 0.022] }
      ], { side: AX, nu: seg(18), nv: seg(28), capA: 0, capB: 0.6, ncap: 3, col: SK });

      // ---- trim: socks
      sweep(trimB, [
        { p: [s * 0.058, 0.045, 0.012], r: [0.0245, 0.0255], bone: bi('foot' + sd) },
        { p: [s * 0.058, 0.07, 0.012], r: [0.0255, 0.0262], bone: bi('shin' + sd), bw: 0.03 },
        { p: [s * 0.058, 0.098, 0.0105], r: [0.0268, 0.0268] },
        { p: [s * 0.0582, 0.118, 0.0095], r: [0.0285, 0.0285] }
      ], { side: AX, nu: seg(20), nv: seg(6), capA: 0, capB: 0, col: WHITE, us: 4, vs: 30 });
      sweep(trimB, [
        { p: [s * 0.058, 0.029, 0.045], r: [0.0215, 0.022], bone: bi('foot' + sd) },
        { p: [s * 0.058, 0.032, 0.014], r: [0.0245, 0.031] },
        { p: [s * 0.0595, 0.027, -0.022], r: [0.0275, 0.026] },
        { p: [s * 0.061, 0.022, -0.062], r: [0.030, 0.019] },
        { p: [s * 0.060, 0.019, -0.092], r: [0.0285, 0.015] },
        { p: [s * 0.0585, 0.018, -0.106], r: [0.024, 0.0125] }
      ], { side: AX, nu: seg(16), nv: seg(9), capA: 1, capB: 1, ncap: 3, flatB: 0.62, col: WHITE, us: 4, vs: 30 });

      // ---- shoes (Mary Janes, only shown standing)
      (function (s, sd) {
        var fx = s * 0.0585, zc = -0.0285, Lh = 0.0955, bone = bi('foot' + sd);
        var wts = function () { return [[bone, 1]]; };
        // sock-foot sections (z, yc, half-width, half-height): the shoe is built just outside them
        var SZs = [0.069, 0.045, 0.014, -0.022, -0.062, -0.092, -0.106, -0.128];
        var SY = [0.027, 0.029, 0.032, 0.027, 0.022, 0.019, 0.018, 0.018];
        var SWd = [0.004, 0.0215, 0.0245, 0.0275, 0.030, 0.0285, 0.024, 0.004];
        var SH = [0.004, 0.022, 0.031, 0.026, 0.019, 0.015, 0.0125, 0.003];
        function sec(z, o) {
          var i = 0; while (i < SZs.length - 2 && z < SZs[i + 1]) i++;
          var t = clamp((z - SZs[i]) / (SZs[i + 1] - SZs[i]), 0, 1), a, b, n = SZs.length - 2;
          if (i === 0) { var e0 = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); a = SWd[1] * e0; b = SH[1] * e0; }
          else if (i === n) { var e1 = Math.sqrt(Math.max(0, 1 - t * t)); a = SWd[n] * e1; b = SH[n] * e1; }
          else { a = lerp(SWd[i], SWd[i + 1], t); b = lerp(SH[i], SH[i + 1], t); }
          var m = Math.min(1, a / 0.006); o[0] = lerp(SY[i], SY[i + 1], t); o[1] = a + 0.0045 * m; o[2] = b + 0.0042 * m;
          return o;
        }
        var so = [0, 0, 0];
        function shoeF(u, v, out) {
          var vz = 0.5 - 0.5 * Math.cos(PI * v), z = lerp(SZs[0], SZs[SZs.length - 1], vz); sec(z, so);
          var toe = sstep(0.56, 0.78, vz), heel = 1 - sstep(0.08, 0.22, vz);
          var h = lerp(lerp(1.85, 2.1, heel), PI, toe);
          var ph = -h + 2 * h * u, dn = Math.cos(ph), bz = dn > 0 ? 0.62 : 1;
          out.set(fx + so[1] * Math.sin(ph), so[0] - so[2] * dn * bz, z);
          if (out.y < 0.0098) out.y = 0.0098;
        }
        surf(shoeB, {
          nu: seg(24), nv: seg(20), closedU: false, f: shoeF,
          center: function (u, v, out) { var z = lerp(SZs[0], SZs[SZs.length - 1], 0.5 - 0.5 * Math.cos(PI * v)); sec(z, so); out.set(fx, so[0], z); },
          col: SHOE, weights: wts
        });
        function outline(psi, out) {
          var z = zc - Lh * Math.cos(psi); sec(clamp(z, SZs[SZs.length - 1], SZs[0]), so);
          var k = Math.pow(Math.abs(Math.sin(psi)), 0.5);
          out.set(fx + (Math.sin(psi) < 0 ? -1 : 1) * k * (so[1] + 0.001), 0, z);
        }
        var oc = new V3(fx, 0, zc);
        surf(shoeB, {
          nu: seg(30), nv: 2, closedU: true,
          f: function (u, v, out) { outline(u * TAU, out); out.x = oc.x + (out.x - oc.x) * 1.035; out.z = oc.z + (out.z - oc.z) * 1.03; out.y = 0.0098 * (1 - v); },
          center: function (u, v, out) { out.set(fx, 0.005, zc); }, col: SOLE, weights: wts
        });
        surf(shoeB, {
          nu: seg(30), nv: 2, closedU: true,
          f: function (u, v, out) { outline(u * TAU, out); var k = 1 - v; out.x = oc.x + (out.x - oc.x) * 1.035 * k; out.z = oc.z + (out.z - oc.z) * 1.03 * k; out.y = 0; },
          center: function (u, v, out) { out.set(fx, 0.02, zc); }, col: SOLE, weights: wts
        });
        sweep(shoeB, [
          { p: [fx + s * 0.031, 0.022, -0.006], r: [0.0055, 0.0018], bone: bone },
          { p: [fx + s * 0.024, 0.050, -0.007], r: [0.0055, 0.0018] },
          { p: [fx + s * 0.003, 0.064, -0.008], r: [0.0055, 0.0018] },
          { p: [fx - s * 0.020, 0.054, -0.007], r: [0.0055, 0.0018] },
          { p: [fx - s * 0.029, 0.028, -0.006], r: [0.0055, 0.0018] }
        ], { side: AZ, nu: 6, nv: seg(12), capA: 0.6, capB: 0.6, ncap: 2, col: SHOE, weights: wts });
        blob(shoeB, [fx + s * 0.0285, 0.033, -0.0065], [0.0035, 0.0045, 0.004], { col: BUCK, weights: wts, nu: 8, nv: 6, ax: new V3(0.3 * s, 0, 0).add(new V3(s, 0, 0)).normalize(), ay: AY, az: AZ });
      })(s, sd);
    }

    // ---- trim: collar
    var collarW = 0.034, NCU = seg(30), vEdge = [];
    for (var ci = 0; ci <= 60; ci++) {
      var uu = ci / 60, thc = lerp(0.07, PI - 0.09, uu), acc = 0, vv2 = 1, pa = new V3(), pb = new V3();
      var shape = uu < 0.13 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.13 - uu) / 0.13, 2))) : (uu > 0.84 ? Math.sqrt(Math.max(0, 1 - Math.pow((uu - 0.84) / 0.16, 2))) : 1);
      var target = collarW * (0.12 + 0.88 * shape);
      bodyPos(thc, 1, pa);
      while (vv2 > 0.3 && acc < target) { vv2 -= 0.004; bodyPos(thc, vv2, pb); acc += pb.distanceTo(pa); pa.copy(pb); }
      vEdge.push(vv2);
    }
    function vEdgeAt(u) { var x = clamp(u, 0, 1) * 60, i = Math.min(59, Math.floor(x)), f = x - i; return lerp(vEdge[i], vEdge[i + 1], f); }
    var cn = new V3(), cp = new V3();
    for (s = -1; s <= 1; s += 2) {
      (function (s) {
        function cf(u, w, out) {
          var th = s * lerp(0.07, PI - 0.09, clamp(u, 0, 1)), ve = vEdgeAt(u), v, lift;
          var ww = w * 1.18;
          if (ww <= 1) { v = 1 - (1 - ve) * ww; lift = 0.0034 + 0.0016 * ww; }
          else { var r = (ww - 1) / 0.18; v = ve - 0.0035 * Math.sin(r * PI * 0.5); lift = 0.005 * (1 - r) + 0.0012; }
          bodyPos(th, v, out); torsoNormal(bodyPos, th, v, cn);
          out.addScaledVector(cn, lift);
          if (ww <= 1) out.y += 0.004 * Math.pow(1 - ww, 2);
        }
        surf(trimB, {
          nu: NCU, nv: seg(8), closedU: false, f: cf,
          center: function (u, w, out) { var th = s * lerp(0.07, PI - 0.09, clamp(u, 0, 1)); bodyPos(th, vEdgeAt(u), out); torsoNormal(bodyPos, th, vEdgeAt(u), cn); out.addScaledVector(cn, -0.02); },
          col: WHITE, uv: function (u, w) { return [u * 3, w * 0.5]; }, weights: function (p) { return torsoW(p); }
        });
      })(s);
    }
    // ---- trim: sash + bow + buttons
    surf(trimB, {
      nu: seg(64), nv: 5, closedU: true,
      f: function (u, v, out) {
        var th = TAU * u - PI / 2, s2 = Math.sin(th), c2 = Math.cos(th), b = Math.sin(PI * v);
        var g = 0.0008 * Math.sin(41 * th) * b;
        var x = (0.1165 + 0.0016 * b + g) * s2, z = 0.004 + (0.0795 + 0.0016 * b + g) * c2;
        if (c2 < 0) z += c2 * Math.abs(c2) * 0.004;
        out.set(x, lerp(0.598, 0.633, v), z);
      },
      center: function (u, v, out) { out.set(0, lerp(0.598, 0.633, v), 0.004); },
      col: SASH, uv: function (u, v) { return [u * 10, v * 0.5]; }, weights: function (p) { return torsoW(p); }
    });
    var bowW = function (p) { return torsoW(new V3(0, 0.615, 0)); };
    for (s = -1; s <= 1; s += 2) {
      sweep(trimB, [
        { p: [s * 0.003, 0.616, 0.0905], r: [0.0062, 0.0016] },
        { p: [s * 0.022, 0.623, 0.090], r: [0.0105, 0.0017] },
        { p: [s * 0.046, 0.628, 0.092], r: [0.0135, 0.0018] },
        { p: [s * 0.057, 0.625, 0.0975], r: [0.0135, 0.0018] },
        { p: [s * 0.047, 0.622, 0.1045], r: [0.0130, 0.0018] },
        { p: [s * 0.022, 0.619, 0.1025], r: [0.0098, 0.0017] },
        { p: [s * 0.003, 0.616, 0.0985], r: [0.006, 0.0016] }
      ], { side: AY, nu: seg(8), nv: seg(15), capA: 0.3, capB: 0.3, ncap: 2, col: SASH, weights: bowW, us: 1, vs: 8 });
      sweep(trimB, [
        { p: [s * 0.004, 0.612, 0.0985], r: [0.0075, 0.0016] },
        { p: [s * 0.012, 0.590, 0.101], r: [0.0085, 0.0016] },
        { p: [s * 0.022, 0.560, 0.1035], r: [0.0095, 0.0016] },
        { p: [s * 0.030, 0.534, 0.1055], r: [0.0105, 0.0016] }
      ], { side: AX, nu: seg(10), nv: seg(10), capA: 0.3, capB: 0.25, ncap: 2, col: SASH, us: 1, vs: 8,
        weights: function (p) { var t = sstep(0.6, 0.53, p.y); return [[bi('pelvis'), 1 - t * 0.5], [bi('sk0'), t * 0.5]]; } });
    }
    blob(trimB, [0, 0.6155, 0.0985], [0.0085, 0.0105, 0.006], { col: SASH, weights: bowW, nu: 12, nv: 8 });
    [0.48, 0.62, 0.74].forEach(function (vb) {
      var bp = new V3(); bodyPos(0, vb, bp); bp.z += 0.0012;
      blob(trimB, bp, [0.0042, 0.0042, 0.0022], { col: PEARL, weights: function (p) { return torsoW(p); }, nu: 10, nv: 6 });
    });

    // ---- head (rigid, child of the head bone)
    buildHead(headB, low);

    // ---- materials & meshes
    var face = makeFace(512);
    var skinMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc2a8), emissive: new THREE.Color(0x2a1208), emissiveIntensity: 0.6 });
    var headMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: face.tex, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc2a8), emissive: new THREE.Color(0xffffff), emissiveMap: face.tex, emissiveIntensity: 0.07 });
    var dressTex = weaveTex(256, '#eed27c', 9, { dots: 3.6 });
    var dressMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: dressTex, roughness: 0.86, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xfff2d0), side: THREE.DoubleSide });
    var trimTex = weaveTex(128, '#f6f4ef', 10);
    var trimMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: trimTex, vertexColors: true, roughness: 0.82, sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
    var shoeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
    function skinned(b, mat, name) {
      var m = new THREE.SkinnedMesh(b.geometry(true), mat); m.name = name;
      m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      group.add(m); return m;
    }
    var skinMesh = skinned(skinB, skinMat, 'girl-skin');
    var dressMesh = skinned(dressB, dressMat, 'girl-dress');
    var trimMesh = skinned(trimB, trimMat, 'girl-trim');
    var shoeMesh = skinned(shoeB, shoeMat, 'girl-shoes');
    var headCenter = v3(GF.POS.headStand), headBoneW = Bm.head.userData.bindW;
    var headMesh = new THREE.Mesh(headB.geometry(false), headMat); headMesh.name = 'girl-head';
    headMesh.position.subVectors(headCenter, headBoneW); headMesh.castShadow = true; headMesh.receiveShadow = true;
    Bm.head.add(headMesh);
    var headAnchor = new THREE.Object3D(); headAnchor.name = 'girl-headAnchor'; headAnchor.position.copy(headMesh.position); Bm.head.add(headAnchor);
    var torsoAnchor = new THREE.Object3D(); torsoAnchor.name = 'girl-torsoAnchor';
    torsoAnchor.position.set(0, GF.POS.headStand[1] + GF.HEAD.torsoC[1], GF.HEAD.torsoC[2]).sub(Bm.chest.userData.bindW); Bm.chest.add(torsoAnchor);
    var handR = new THREE.Object3D(); handR.name = 'girl-handR'; handR.position.copy(handAnchorPos.R).sub(Bm.handR.userData.bindW); Bm.handR.add(handR);
    var handLa = new THREE.Object3D(); handLa.position.copy(handAnchorPos.L).sub(Bm.handL.userData.bindW); Bm.handL.add(handLa);

    // ---- arm IK records
    function wristEnd(sd) { return new V3().copy(Bm['tw' + sd].position).add(Bm['hand' + sd].position); }
    var armR = makeArm(Bm.clavR, Bm.armR, Bm.foreR, wristEnd('R')), armL = makeArm(Bm.clavL, Bm.armL, Bm.foreL, wristEnd('L'));
    var twAxisR = Bm.handR.position.clone().normalize(), twAxisL = Bm.handL.position.clone().normalize();

    // =================================================================== state
    var st = {
      pose: 'sit', towel: false, towelS: 0,
      face: { smile: 0.25, blink: 0, squint: 0, mouthO: 0, gazeX: 0, gazeY: 0, sleepy: 1 },
      fs: { smile: 0.25, blink: 0, squint: 0, mouthO: 0, gazeX: 0, gazeY: 0, sleepy: 1 },
      hasLook: false, lookW: new V3(), yaw: 0, pitch: 0, eyeX: 0, eyeY: 0,
      wind: 0, windS: 0, walk: 0, walkS: 0, phase: 0, hold: 0, holdS: 0,
      react: null, rt: 0, rdur: 1, blinkT: -1, nextBlink: 1.5, autoBlink: 0, dbl: false,
      lastDraw: -1, happyS: 0, time: 0
    };
    var RK = ['sh', 'chx', 'hx', 'hy', 'hz', 'sy', 'sz', 'bounce', 'kick', 'smile', 'squint', 'mo', 'wide', 'laugh', 'arms'];
    var Rt = {}, Rs = {};
    RK.forEach(function (k) { Rt[k] = 0; Rs[k] = 0; });
    var holdTarget = new V3(0.27, 0.665, -0.025);
    var lapR = new V3(0.074, 0.545, -0.118), lapL = new V3(-0.074, 0.545, -0.118);
    var poleLap = new V3(0.35, -0.2, 1), poleLapL = new V3(-0.35, -0.2, 1), poleHold = new V3(0.35, -1, 0.25);
    var rootOff = { sit: new V3(), stand: new V3() };
    var tq1 = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), fq1 = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), tq3 = new THREE.Quaternion();
    var tE = new THREE.Euler(), tv = new V3(), tv2 = new V3(), tw = new V3();
    var FACE = { open: 1, lift: 0, hclose: 0, gx: 0, gy: 0, wide: 0, brow: 0, knit: 0, squeeze: 0, mw: 0.008, mh: 0, mround: 0, corner: 0, smile: 0, laugh: 0, blush: 0.2 };
    var sig = new Float32Array(12), sigLast = new Float32Array(12); sigLast[0] = -9;

    function eul(bone, x, y, z) { bone.rotation.set(x, y, z); }
    function solveArmTo(arm, sd, targetLocal, pole, w, fkx, fky, fkz, fkfx, twist) {
      // FK
      tE.set(fkx, fky, fkz); fq1.setFromEuler(tE); tE.set(fkfx, 0, 0); fq2.setFromEuler(tE);
      if (w > 0.001) {
        // palm target -> wrist target, in world
        tv.copy(targetLocal); group.localToWorld(tv);
        arm.up.getWorldPosition(tv2);
        tw.subVectors(tv, tv2).normalize(); tv.addScaledVector(tw, -0.036);
        solveIK(arm, tv, pole, tq1, tq2);
        fq1.slerp(tq1, w); fq2.slerp(tq2, w);
      }
      arm.up.quaternion.copy(fq1); arm.fore.quaternion.copy(fq2);
      (sd === 'R' ? Bm.twR : Bm.twL).quaternion.setFromAxisAngle(sd === 'R' ? twAxisR : twAxisL, twist * 0.55);
    }

    // full pose evaluation. neutral = no life / reactions (for calibration)
    function applyPose(dt, t, neutral) {
      var sit = st.pose === 'sit', k = neutral ? 0 : 1;
      var br = Math.sin(t * TAU * 0.26) * k;
      var n1 = (GF.noise2(t * 0.21, 1.7) - 0.5) * k, n2 = (GF.noise2(t * 0.29, 7.3) - 0.5) * k, n3 = (GF.noise2(t * 0.17, 13.1) - 0.5) * k, n4 = (GF.noise2(t * 0.25, 21.9) - 0.5) * k;
      var w = neutral ? 0 : st.walkS, ph = st.phase, sp = Math.sin(ph), cp = Math.cos(ph);
      var R = neutral ? Rt0 : Rs, wind = neutral ? 0 : st.windS, hold = neutral ? 0 : st.holdS;
      var tow = neutral ? 0 : st.towelS;
      // spine
      var pelX = sit ? 0.06 : 0.0, pelY = w * 0.075 * sp + (sit ? 0 : n1 * 0.05), pelZ = (sit ? 0.012 : 0.03) * n2 + R.sz * 0.5 - w * 0.025 * cp;
      var spX = (sit ? -0.03 : 0.01) + 0.008 * br, spY = R.sy * 0.5 - pelY * 0.4, spZ = R.sz * 0.5 - pelZ * 0.5;
      var chX = (sit ? -0.025 : -0.015) - 0.012 * br + R.chx, chY = R.sy * 0.5 - pelY * 0.45, chZ = -pelZ * 0.3 - 0.045 * hold;
      eul(Bm.pelvis, pelX, pelY, pelZ); eul(Bm.spine, spX, spY, spZ); eul(Bm.chest, chX, chY, chZ);
      // shoulders
      var sh = R.sh + 0.11 * wind + 0.014 * br;
      eul(Bm.clavR, 0, 0, sh * 0.9 + 0.03 * hold); eul(Bm.clavL, 0, 0, -sh * 0.9);
      // head & neck: desired head orientation (relative to the room), compensating the spine
      var hX = st.pitch * k + R.hx + n3 * 0.07 - 0.06 * wind - 0.045 * tow + (sit ? 0 : -0.04);
      var hY = -st.yaw * k + R.hy + n4 * 0.09;
      var hZ = R.hz + n1 * 0.05 + 0.03 * wind;
      var bx = pelX + spX + chX, by = pelY + spY + chY, bz = pelZ + spZ + chZ;
      var nx = 0.4 * (hX - bx), ny = 0.4 * (hY - by), nz = 0.4 * (hZ - bz);
      eul(Bm.neck, nx, ny, nz); eul(Bm.head, hX - bx - nx, hY - by - ny, hZ - bz - nz);
      // legs
      var kick = R.kick, hap = neutral ? 0 : st.happyS;
      if (sit) {
        var swR = 0.05 * Math.sin(t * TAU * 0.33) * k + hap * 0.22 * Math.sin(t * TAU * 1.15) + kick * 0.38 * Math.sin(t * TAU * 2.4);
        var swL = 0.05 * Math.sin(t * TAU * 0.33 + 2.1) * k + hap * 0.22 * Math.sin(t * TAU * 1.15 + PI) + kick * 0.38 * Math.sin(t * TAU * 2.4 + PI);
        eul(Bm.thighR, 1.49 - pelX, 0, 0.07); eul(Bm.thighL, 1.49 - pelX, 0, -0.07);
        eul(Bm.shinR, -1.36 + swR, 0, 0); eul(Bm.shinL, -1.36 + swL, 0, 0);
        eul(Bm.footR, -0.32 + swR * 0.3, 0, 0); eul(Bm.footL, -0.32 + swL * 0.3, 0, 0);
      } else {
        var thR = 0.34 * sp * w, thL = -0.34 * sp * w;
        var knR = -(0.06 + 0.62 * Math.pow(Math.max(0, cp), 1.5)) * w - 0.03, knL = -(0.06 + 0.62 * Math.pow(Math.max(0, -cp), 1.5)) * w - 0.03;
        var ftR = (0.16 * Math.max(0, sp) - 0.28 * Math.max(0, -sp) * Math.max(0, -cp) * 2) * w + 0.03, ftL = (0.16 * Math.max(0, -sp) - 0.28 * Math.max(0, sp) * Math.max(0, cp) * 2) * w + 0.03;
        eul(Bm.thighR, thR - pelX + n2 * 0.02, -pelY * 0.5, 0.025 + pelZ * -1); eul(Bm.thighL, thL - pelX - n2 * 0.02, -pelY * 0.5, -0.025 - pelZ);
        eul(Bm.shinR, knR, 0, 0); eul(Bm.shinL, knL, 0, 0);
        eul(Bm.footR, ftR - knR - thR, 0, 0); eul(Bm.footL, ftL - knL - thL, 0, 0);
      }
      // skirt panels
      var thRx = Bm.thighR.rotation.x, thLx = Bm.thighL.rotation.x;
      for (var i = 0; i < SKN; i++) {
        var th = i / SKN * TAU, sx = Math.sin(th), cz = Math.cos(th), b = skB[i];
        if (sit) {
          var front = Math.max(0, -cz), back = Math.max(0, cz), sideA = Math.abs(sx);
          var wsum = back + sideA + front;
          var outA = (0.5 * back + 0.22 * sideA + 1.3 * front) / wsum;
          var scl = (0.55 * back + 0.56 * sideA + 0.84 * front) / wsum;
          setPanel(b, th, outA, 0, 0, scl);
        } else {
          var wr = 0.5 + 0.5 * sx, legP = wr * thRx + (1 - wr) * thLx;
          setPanel(b, th, 0.02 + 0.05 * w, legP * 0.42, -pelZ * 0.6 + w * 0.03 * Math.sin(ph * 2 - 0.8), 1);
        }
      }
      // arms
      var walkArm = sit ? 0 : w;
      var armSwR = -0.30 * sp * walkArm, armSwL = 0.30 * sp * walkArm;
      var fkArmZ = 0.10 + 0.01 * br, foreFK = 0.16 + 0.18 * walkArm;
      if (sit) {
        solveArmTo(armR, 'R', lapR, poleLap, 1, 0.1, 0, fkArmZ, 0.6, 1.25);
        solveArmTo(armL, 'L', lapL, poleLapL, 1, 0.1, 0, -fkArmZ, 0.6, -1.25);
        eul(Bm.handR, -0.10, 0.45, 0.10); eul(Bm.handL, -0.10, -0.45, -0.10);
      } else {
        if (hold > 0.001) Bm.root.updateMatrixWorld(true);
        solveArmTo(armR, 'R', holdTarget, poleHold, hold, 0.04 + armSwR, 0, fkArmZ, foreFK + 0.1 * Math.max(0, -sp) * walkArm, 0.15 * hold);
        solveArmTo(armL, 'L', holdTarget, poleHold, 0, 0.04 + armSwL, 0, -fkArmZ, foreFK + 0.1 * Math.max(0, sp) * walkArm, 0);
        eul(Bm.handR, 0.05 - 0.2 * hold, 0.0, -0.05 - 0.25 * hold); eul(Bm.handL, 0.05, 0.0, 0.05);
      }
      // root
      var off = rootOff[st.pose];
      Bm.root.position.set(off.x + (sit ? 0 : -0.012 * cp * w), off.y + R.bounce + 0.0012 * br + (sit ? 0 : w * (-0.011 + 0.011 * Math.cos(2 * ph))), off.z);
      Bm.root.rotation.set(0, 0, 0);
    }
    var Rt0 = {}; RK.forEach(function (k) { Rt0[k] = 0; });

    function calibrate() {
      var keep = st.pose;
      ['sit', 'stand'].forEach(function (p) {
        st.pose = p; rootOff[p].set(0, 0, 0);
        applyPose(0, 0, true);
        group.updateMatrixWorld(true);
        headAnchor.getWorldPosition(tv); group.worldToLocal(tv);
        rootOff[p].fromArray(p === 'sit' ? GF.POS.headSit : GF.POS.headStand).sub(tv);
      });
      st.pose = keep;
    }
    // group must be at the identity while calibrating (it is, at creation)
    calibrate();

    function reactTargets(name, tau) {
      for (var i = 0; i < RK.length; i++) Rt[RK[i]] = 0;
      if (!name) return;
      var env = Math.sin(PI * clamp(tau, 0, 1)), e2 = Math.min(1, env * 1.7);
      switch (name) {
        case 'wake':
          var y = Math.sin(PI * clamp(tau * 1.5, 0, 1));
          Rt.sh = 0.15 * env; Rt.chx = -0.10 * env; Rt.hx = 0.13 * env; Rt.hz = 0.05 * env;
          Rt.mo = 0.55 * y; Rt.squint = 0.55 * y; Rt.wide = 0.4 * sstep(0.6, 0.8, tau) * (1 - sstep(0.85, 1, tau)); break;
        case 'tickle':
          Rt.sh = 0.26 * e2; Rt.hz = 0.13 * Math.sin(tau * TAU * 2) * env; Rt.sy = 0.10 * Math.sin(tau * TAU * 3) * env; Rt.sz = 0.045 * Math.sin(tau * TAU * 3 + 1) * env;
          Rt.smile = e2; Rt.squint = 0.7 * e2; Rt.laugh = 0.85 * e2; Rt.hx = -0.07 * env; break;
        case 'surprise':
          var a = tau < 0.15 ? sstep(0, 0.15, tau) : 1 - sstep(0.35, 1, tau);
          Rt.sh = 0.16 * a; Rt.chx = -0.05 * a; Rt.hx = 0.06 * a; Rt.wide = a; Rt.mo = 0.9 * a; Rt.bounce = 0.008 * a; break;
        case 'happy':
          Rt.bounce = 0.013 * Math.abs(Math.sin(tau * PI * 3)) * env; Rt.sz = 0.05 * Math.sin(tau * TAU * 2) * env; Rt.hz = 0.10 * Math.sin(tau * TAU * 2 + 0.6) * env;
          Rt.smile = e2; Rt.laugh = 0.9 * e2; Rt.kick = env; Rt.squint = 0.25 * env; Rt.sh = 0.06 * env; break;
        case 'nod':
          Rt.hx = -0.16 * Math.pow(Math.sin(PI * clamp(tau, 0, 1) * 2), 2) * (tau < 0.5 ? 1 : 0.7); Rt.smile = 0.3 * env; break;
      }
    }

    function updateFace(dt, t) {
      var fs = st.fs, f = st.face;
      fs.smile = damp(fs.smile, f.smile, 8, dt); fs.squint = damp(fs.squint, f.squint, 10, dt); fs.mouthO = damp(fs.mouthO, f.mouthO, 10, dt);
      fs.blink = damp(fs.blink, f.blink, 25, dt); fs.gazeX = damp(fs.gazeX, f.gazeX, 12, dt); fs.gazeY = damp(fs.gazeY, f.gazeY, 12, dt);
      fs.sleepy = damp(fs.sleepy, f.sleepy, 2.5, dt);
      // auto blink
      if (st.blinkT < 0) { st.nextBlink -= dt; if (st.nextBlink <= 0) { st.blinkT = 0; } }
      if (st.blinkT >= 0) {
        st.blinkT += dt; var bt = st.blinkT;
        st.autoBlink = bt < 0.06 ? bt / 0.06 : (bt < 0.09 ? 1 : Math.max(0, 1 - (bt - 0.09) / 0.1));
        if (bt > 0.19) { st.blinkT = -1; st.autoBlink = 0; if (!st.dbl && Math.random() < 0.18) { st.nextBlink = 0.12; st.dbl = true; } else { st.nextBlink = 2.2 + Math.random() * 3.2 + fs.sleepy * 1.5; st.dbl = false; } }
      }
      var wind = st.windS;
      var smile = clamp(fs.smile + Rs.smile + 0.65 * wind, 0, 1);
      var squint = clamp(fs.squint + Rs.squint + 0.9 * wind, 0, 1);
      var mo = clamp(fs.mouthO + Rs.mo, 0, 1);
      var laugh = clamp(Rs.laugh + 0.55 * wind + Math.max(0, smile - 0.7) * 2.4, 0, 1);
      var wide = clamp(Rs.wide, 0, 1);
      var blink = Math.max(fs.blink, st.autoBlink);
      var open = (1 - 0.5 * fs.sleepy * (1 - wide)) * (1 - 0.2 * smile) * (1 - 0.97 * squint) * (1 - blink);
      open = clamp(open + 0.2 * wide * (1 - blink), 0, 1.2);
      FACE.open = open; FACE.lift = clamp(0.62 * smile + 0.4 * squint, 0, 1); FACE.hclose = clamp(1.2 * smile + squint - 0.2 * fs.sleepy, 0, 1);
      FACE.gx = clamp(fs.gazeX + st.eyeX, -1, 1); FACE.gy = clamp(fs.gazeY + st.eyeY, -1, 1);
      FACE.wide = wide; FACE.brow = 0.0028 * wide + 0.0012 * mo - 0.0012 * squint - 0.0006 * fs.sleepy; FACE.knit = squint; FACE.squeeze = squint;
      FACE.smile = smile; FACE.laugh = laugh;
      FACE.mw = 0.0082 + 0.0028 * smile + 0.0015 * laugh - 0.0034 * mo;
      FACE.mh = Math.max(0.0055 * laugh, 0.0088 * mo); FACE.mround = mo / (mo + laugh + 1e-3);
      FACE.corner = 0.0026 * smile - 0.0007 * mo * (1 - smile);
      FACE.blush = 0.26 + 0.12 * smile + 0.1 * wind;
      sig[0] = open; sig[1] = FACE.lift; sig[2] = FACE.hclose; sig[3] = FACE.gx; sig[4] = FACE.gy; sig[5] = FACE.brow * 300; sig[6] = smile;
      sig[7] = laugh; sig[8] = mo; sig[9] = FACE.blush; sig[10] = squint; sig[11] = wide;
      var diff = 0; for (var i = 0; i < 12; i++) diff = Math.max(diff, Math.abs(sig[i] - sigLast[i]));
      if (diff > 0.025 && (t - st.lastDraw > 0.033 || st.lastDraw < 0 || t < st.lastDraw)) {
        face.draw(FACE); sigLast.set(sig); st.lastDraw = t;
      }
    }

    function update(dt, t) {
      dt = clamp(dt || 0, 0, 0.1); if (t === undefined) t = st.time + dt; st.time = t;
      // inputs smoothing
      st.windS = damp(st.windS, st.wind, 5, dt);
      st.walkS = damp(st.walkS, st.walk, 4, dt);
      st.holdS = damp(st.holdS, st.hold, 4, dt);
      st.towelS = damp(st.towelS, st.towel ? 1 : 0, 3, dt);
      if (st.walkS > 0.002) st.phase = (st.phase + dt * TAU * 1.38) % (TAU * 1000);
      st.happyS = damp(st.happyS, clamp((st.fs.smile - 0.45) / 0.5, 0, 1), 2, dt);
      // reactions
      if (st.react) { st.rt += dt; var tau = st.rt / st.rdur; if (tau >= 1) { st.react = null; reactTargets(null, 0); } else reactTargets(st.react, tau); }
      for (var i = 0; i < RK.length; i++) Rs[RK[i]] = damp(Rs[RK[i]], Rt[RK[i]], 20, dt);
      // look
      var ty = 0, tp = 0, ex = 0, ey = 0;
      if (st.hasLook) {
        tv.copy(st.lookW); group.worldToLocal(tv);
        var hc = st.pose === 'sit' ? GF.POS.headSit : GF.POS.headStand;
        var dx = tv.x - hc[0], dy = tv.y - hc[1], dz = tv.z - hc[2];
        var yawT = Math.atan2(dx, -dz), pitchT = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        yawT = clamp(yawT, -1.3, 1.3);
        ty = clamp(yawT * 0.55, -0.35, 0.35); tp = clamp(pitchT * 0.5, -0.21, 0.21);
        ex = clamp((yawT - ty) / 0.5, -1, 1); ey = clamp((pitchT - tp) / 0.4, -1, 1);
      }
      st.yaw = damp(st.yaw, ty, 3.2, dt); st.pitch = damp(st.pitch, tp, 3.2, dt);
      st.eyeX = damp(st.eyeX, ex, 10, dt); st.eyeY = damp(st.eyeY, ey, 10, dt);
      applyPose(dt, t, false);
      updateFace(dt, t);
    }

    function setPose(p) {
      if (p !== 'sit' && p !== 'stand') return;
      st.pose = p; shoeMesh.visible = p === 'stand';
      applyPose(0, st.time, false);
    }
    setPose('sit');
    face.draw(FACE);

    var api = {
      group: group, headAnchor: headAnchor, torsoAnchor: torsoAnchor, handR: handR, handL: handLa,
      holdTarget: holdTarget, bones: Bm, meshes: { skin: skinMesh, dress: dressMesh, trim: trimMesh, shoes: shoeMesh, head: headMesh },
      faceCanvas: face.canvas,
      setPose: setPose,
      get pose() { return st.pose; },
      setFace: function (o) {
        if (!o) return;
        var f = st.face;
        if (typeof o.smile === 'number') f.smile = clamp(o.smile, 0, 1);
        if (typeof o.blink === 'number') f.blink = clamp(o.blink, 0, 1);
        if (typeof o.squint === 'number') f.squint = clamp(o.squint, 0, 1);
        if (typeof o.mouthO === 'number') f.mouthO = clamp(o.mouthO, 0, 1);
        if (typeof o.gazeX === 'number') f.gazeX = clamp(o.gazeX, -1, 1);
        if (typeof o.gazeY === 'number') f.gazeY = clamp(o.gazeY, -1, 1);
        if (typeof o.sleepy === 'number') f.sleepy = clamp(o.sleepy, 0, 1);
      },
      lookAt: function (p) {
        if (p && typeof p.x === 'number' && isFinite(p.x + p.y + p.z)) { st.lookW.set(p.x, p.y, p.z); st.hasLook = true; } else st.hasLook = false;
      },
      setWindFace: function (v) { st.wind = clamp(+v || 0, 0, 1); },
      react: function (name) {
        var d = { wake: 1.3, tickle: 1.1, surprise: 0.85, happy: 1.25, nod: 0.8 }[name];
        if (!d) return;
        st.react = name; st.rt = 0; st.rdur = d;
        if (name === 'wake') st.face.sleepy = 0;
      },
      setTowelOn: function (b) { st.towel = !!b; },
      setWalk: function (v) { st.walk = clamp(+v || 0, 0, 1); },
      holdHand: function (v) { st.hold = clamp(+v || 0, 0, 1); },
      update: update
    };
    return api;
  };

  // =====================================================================================
  //                                           MUM
  // =====================================================================================
  GF.createMom = function (opts) {
    opts = opts || {};
    var low = !!opts.low, qq = low ? 0.62 : 1;
    function seg(n) { return Math.max(4, Math.round(n * qq)); }
    var group = new THREE.Group(); group.name = 'mom';
    var defs = [
      ['root', null, [0, 0, 0]],
      ['pelvis', 'root', [0, 0.93, 0]],
      ['spine', 'pelvis', [0, 1.06, 0.005]],
      ['chest', 'spine', [0, 1.20, 0.01]],
      ['neck', 'chest', [0, 1.385, 0.015]],
      ['head', 'neck', [0, 1.46, 0.01]],
      ['clavR', 'chest', [0.03, 1.34, 0.012]], ['armR', 'clavR', [0.165, 1.315, 0.014]], ['foreR', 'armR', [0.183, 1.04, 0.03]], ['handR', 'foreR', [0.19, 0.80, 0.028]],
      ['clavL', 'chest', [-0.03, 1.34, 0.012]], ['armL', 'clavL', [-0.165, 1.315, 0.014]], ['foreL', 'armL', [-0.183, 1.04, 0.03]], ['handL', 'foreL', [-0.19, 0.80, 0.028]],
      ['thighR', 'pelvis', [0.088, 0.875, 0]], ['shinR', 'thighR', [0.085, 0.475, 0.0]], ['footR', 'shinR', [0.082, 0.078, 0.02]],
      ['thighL', 'pelvis', [-0.088, 0.875, 0]], ['shinL', 'thighL', [-0.085, 0.475, 0.0]], ['footL', 'shinL', [-0.082, 0.078, 0.02]]
    ];
    var SKN = 8, WY = 0.99, SW = 0.135, SD = 0.094, SZ = 0.0;
    defs = defs.concat(skirtBoneDefs('sk', 'pelvis', WY, SW, SD, SZ, SKN));
    var rig = makeBones(defs), Bm = rig.map, skB = [];
    for (var ki = 0; ki < SKN; ki++) skB.push(Bm['sk' + ki]);
    function bi(n) { return Bm[n].userData.idx; }
    group.add(Bm.root); group.updateMatrixWorld(true);
    var skeleton = new THREE.Skeleton(rig.list);
    var SKIN = C(0xe9c0a3), HAIR = C(0x2a1c14), CARD = C(0xd9c9ad), RIB = C(0xc9b89b), SKIRT = C(0x3e4a5d), SHOE = C(0x6d5c4e), SOLE = C(0x3b302a);
    var skinB = new Builder(), clothB = new Builder();

    function torsoW(p) {
      var y = p.y, ax = Math.abs(p.x), sd = p.x >= 0 ? 'R' : 'L', w = [];
      var a = sstep(0.95, 1.05, y), b = sstep(1.12, 1.22, y);
      var wp = 1 - a, ws = a * (1 - b), wc = a * b, cl = sstep(0.08, 0.17, ax) * sstep(1.25, 1.33, y) * 0.8;
      if (wp > 0) w.push([bi('pelvis'), wp]); if (ws > 0) w.push([bi('spine'), ws]);
      if (wc > 0) { w.push([bi('chest'), wc * (1 - cl)]); if (cl > 0) w.push([bi('clav' + sd), wc * cl]); }
      return w;
    }
    // cardigan body
    var MK = {
      y: [0.845, 0.95, 1.04, 1.13, 1.215, 1.285, 1.33, 1.365, 1.392],
      W: [0.192, 0.172, 0.150, 0.157, 0.166, 0.176, 0.160, 0.115, 0.062],
      D: [0.130, 0.118, 0.100, 0.104, 0.110, 0.100, 0.084, 0.068, 0.056],
      zc: [0.005, 0.004, 0.006, 0.006, 0.006, 0.010, 0.012, 0.014, 0.016],
      tum: [0, 0, 0, 0.012, 0.02, 0.008, 0, 0, 0],
      ex: [2.1, 2.1, 2.1, 2.2, 2.3, 2.45, 2.4, 2.2, 2.0], blade: 0.006
    };
    var mPos = makeTorso(MK, 0.02);
    surf(clothB, {
      nu: seg(36), nv: seg(18), closedU: true,
      f: function (u, v, out) { mPos(TAU * u - PI / 2, v, out); var th = TAU * u - PI / 2; if (v < 0.08) { var r = 1 + 0.02 * (1 - v / 0.08); out.x *= r; out.z = (out.z - 0.005) * r + 0.005; } },
      center: function (u, v, out) { out.set(0, keyAt(MK.y, v), keyAt(MK.zc, v)); },
      color: function (p, u, v) { return v < 0.05 ? RIB : CARD; }, uv: function (u, v, p) { return [u * 20, p.y / 0.03]; },
      weights: function (p) { return torsoW(p); }
    });
    // skirt
    var sLen = 0.70;
    var mskW = skirtWeights(Bm, 'sk', bi('pelvis'), SKN, WY, sLen);
    surf(clothB, {
      nu: seg(60), nv: seg(16), closedU: true,
      f: function (u, v, out) {
        var th = TAU * u - PI / 2, lip = 0, vv = v / 0.92; if (vv > 1) { lip = (vv - 1) / (0.08 / 0.92); vv = 1; }
        var e = Math.pow(vv, 1.25), rx = SW + 0.15 * e, rz = SD + 0.13 * e;
        var fold = 0.02 * Math.pow(vv, 1.1) * (0.55 * Math.sin(7 * th + 0.7) + 0.35 * Math.sin(12 * th + 2.0) + 0.2 * Math.sin(19 * th + 4.1));
        var s = Math.sin(th), c = Math.cos(th), k = 1 - lip * 0.03;
        out.set(rx * s * k + s * fold, WY - sLen * vv + lip * 0.02, SZ + 0.02 * e + rz * c * k + c * fold);
      },
      center: function (u, v, out) { var vv = Math.min(1, v / 0.92); out.set(0, WY - sLen * vv, 0.02 * vv); },
      color: function () { return SKIRT; }, uv: function (u, v, p) { return [u * 30, (WY - p.y) / 0.03]; },
      weights: function (p) { return mskW(p); }
    });
    var palm = {};
    for (var s = -1; s <= 1; s += 2) {
      var sd = s > 0 ? 'R' : 'L';
      // cardigan sleeve
      sweep(clothB, [
        { p: [s * 0.14, 1.335, 0.012], r: [0.05, 0.05], bone: bi('chest') },
        { p: [s * 0.165, 1.31, 0.014], r: [0.054, 0.052], bone: bi('arm' + sd), bw: 0.08 },
        { p: [s * 0.175, 1.17, 0.02], r: [0.047, 0.046] },
        { p: [s * 0.183, 1.04, 0.03], r: [0.044, 0.043], bone: bi('fore' + sd), bw: 0.06 },
        { p: [s * 0.187, 0.90, 0.03], r: [0.037, 0.037] },
        { p: [s * 0.189, 0.835, 0.029], r: [0.034, 0.034], bone: bi('hand' + sd), bw: 0.04 },
        { p: [s * 0.19, 0.815, 0.028], r: [0.034, 0.034] }
      ], { side: AX, nu: seg(16), nv: seg(16), capA: 0.8, capB: 0, ncap: 3, us: 5, vs: 1 / 0.03, color: function (p, a) { return a > 0.9 ? RIB : CARD; } });
      palm[sd] = buildHand(skinB, { wrist: [s * 0.19, 0.825, 0.028], d: new V3(s * 0.03, -1, 0), n: new V3(-s, 0, 0), t: new V3(0, 0, -1), sc: 1.45, curl: s > 0 ? 1.5 : 0.4, bone: bi('hand' + sd), col: SKIN, q: 0.5 });
      sweep(skinB, [
        { p: [s * 0.19, 0.86, 0.028], r: [0.026, 0.028], bone: bi('hand' + sd) },
        { p: [s * 0.19, 0.82, 0.028], r: [0.022, 0.028] }
      ], { side: AX, nu: seg(12), nv: 3, capA: 0, capB: 0.6, ncap: 2, col: SKIN });
      // lower legs (skin) and shoes
      sweep(skinB, [
        { p: [s * 0.086, 0.62, 0.0], r: [0.05, 0.05], bone: bi('thigh' + sd) },
        { p: [s * 0.085, 0.475, 0.0], r: [0.045, 0.045], bone: bi('shin' + sd), bw: 0.05 },
        { p: [s * 0.084, 0.33, 0.012], r: [0.041, 0.044] },
        { p: [s * 0.083, 0.17, 0.016], r: [0.03, 0.031] },
        { p: [s * 0.082, 0.085, 0.02], r: [0.024, 0.025], bone: bi('foot' + sd), bw: 0.03 },
        { p: [s * 0.082, 0.06, 0.02], r: [0.023, 0.024] }
      ], { side: AX, nu: seg(14), nv: seg(14), capA: 0, capB: 0.6, ncap: 2, col: SKIN });
      sweep(clothB, [
        { p: [s * 0.082, 0.040, 0.06], r: [0.03, 0.032], bone: bi('foot' + sd) },
        { p: [s * 0.083, 0.045, 0.02], r: [0.035, 0.042] },
        { p: [s * 0.085, 0.036, -0.04], r: [0.04, 0.032] },
        { p: [s * 0.086, 0.028, -0.11], r: [0.041, 0.022] },
        { p: [s * 0.085, 0.024, -0.16], r: [0.032, 0.017] }
      ], { side: AX, nu: seg(16), nv: seg(10), capA: 1, capB: 1, ncap: 3, flatB: 0.78, col: SHOE, us: 4, vs: 20 });
    }
    // neck + head + hair (hidden under the parasol, but complete)
    sweep(skinB, [
      { p: [0, 1.33, 0.02], r: [0.05, 0.048], bone: bi('chest') },
      { p: [0, 1.385, 0.018], r: [0.049, 0.047], bone: bi('neck'), bw: 0.05 },
      { p: [0, 1.45, 0.012], r: [0.046, 0.045], bone: bi('head'), bw: 0.05 },
      { p: [0, 1.50, 0.005], r: [0.04, 0.04] }
    ], { side: AX, nu: seg(16), nv: seg(8), capA: 0, capB: 0.6, col: SKIN });
    var hcen = new V3(0, 1.515, 0.0), hw = function () { return [[bi('head'), 1]]; };
    surf(skinB, {
      nu: seg(20), nv: seg(12), closedU: true,
      f: function (u, v, out) { var th = v * PI, ph = u * TAU, st = Math.sin(th); out.set(st * Math.sin(ph) * 0.076, Math.cos(th) * 0.108, -st * Math.cos(ph) * 0.094).add(hcen); },
      center: function (u, v, out) { out.copy(hcen); },
      color: function (p) { var y = p.y - hcen.y, z = p.z - hcen.z; return (y > 0.035 || z > -0.03 + Math.max(0, -y - 0.02) * 0.2 && y > -0.06) ? HAIR : SKIN; },
      weights: hw
    });
    blob(skinB, [0, 1.52, 0.1], [0.062, 0.095, 0.03], { col: HAIR, weights: hw, nu: 16, nv: 10 });
    blob(skinB, [0, 1.535, 0.125], [0.042, 0.038, 0.034], { col: HAIR, weights: hw, nu: 14, nv: 10 });

    // materials
    var clothTex = weaveTex(128, '#f2f2f2', 14, { rib: 24 });
    var clothMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: clothTex, vertexColors: true, roughness: 0.88, sheen: 0.5, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
    var skinMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc2a8) });
    function skinned(b, mat, name) {
      var m = new THREE.SkinnedMesh(b.geometry(true), mat); m.name = name; m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); return m;
    }
    skinned(skinB, skinMat, 'mom-skin'); skinned(clothB, clothMat, 'mom-cloth');
    var handL = new THREE.Object3D(); handL.name = 'mom-handL'; handL.position.copy(palm.L).sub(Bm.handL.userData.bindW); Bm.handL.add(handL);

    var st = { walk: 0, walkS: 0, reach: 0, reachS: 0, phase: 0, time: 0, bagA: 0, bagV: 0 };
    var armL = makeArm(Bm.clavL, Bm.armL, Bm.foreL, Bm.handL.position.clone());
    var reachT = new V3(-0.205, 0.64, 0.05), poleReach = new V3(-0.6, 0.0, 0.8);
    var tE = new THREE.Euler(), fq1 = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), iq1 = new THREE.Quaternion(), iq2 = new THREE.Quaternion(), tv = new V3(), tv2 = new V3(), tw = new V3();
    function eul(b, x, y, z) { b.rotation.set(x, y, z); }
    var RA = { x: 0.30, y: -0.20, z: 0.0, fx: 1.74, hx: -0.15, hy: 0.0, hz: 0.25 };

    function applyPose(dt, t, neutral) {
      var k = neutral ? 0 : 1, w = neutral ? 0 : st.walkS, r = neutral ? 0 : st.reachS, ph = st.phase, sp = Math.sin(ph), cp = Math.cos(ph);
      var n1 = (GF.noise2(t * 0.17, 3.3) - 0.5) * k, n2 = (GF.noise2(t * 0.23, 9.1) - 0.5) * k, br = Math.sin(t * TAU * 0.22) * k;
      var pelY = 0.05 * sp * w + n1 * 0.03, pelZ = 0.02 * n2 - 0.02 * cp * w;
      eul(Bm.pelvis, 0, pelY, pelZ);
      eul(Bm.spine, 0.005 * br + 0.04 * r, -pelY * 0.4, -pelZ * 0.5 + 0.08 * r);
      eul(Bm.chest, -0.01 - 0.006 * br + 0.05 * r, -pelY * 0.5 - 0.08 * r, -pelZ * 0.3 + 0.15 * r);
      eul(Bm.neck, 0, 0, 0); eul(Bm.head, -0.03, 0.05 * r, -0.04 * r);
      eul(Bm.clavR, 0, 0, 0.01 * br); eul(Bm.clavL, 0, 0, -0.01 * br + 0.16 * r);
      var thR = 0.24 * sp * w, thL = -0.24 * sp * w;
      var knR = -(0.04 + 0.5 * Math.pow(Math.max(0, cp), 1.5)) * w, knL = -(0.04 + 0.5 * Math.pow(Math.max(0, -cp), 1.5)) * w;
      eul(Bm.thighR, thR, -pelY * 0.5, 0.012 - pelZ); eul(Bm.thighL, thL, -pelY * 0.5, -0.012 - pelZ);
      eul(Bm.shinR, knR, 0, 0); eul(Bm.shinL, knL, 0, 0);
      eul(Bm.footR, -knR - thR + 0.12 * Math.max(0, sp) * w, 0, 0); eul(Bm.footL, -knL - thL + 0.12 * Math.max(0, -sp) * w, 0, 0);
      for (var i = 0; i < SKN; i++) {
        var th = i / SKN * TAU, sx = Math.sin(th), wr = 0.5 + 0.5 * sx;
        var lag = Math.sin(ph - 0.7) * 0.24 * w, legP = wr * lag + (1 - wr) * -lag;
        setPanel(skB[i], th, 0.015 + 0.03 * w, legP * 0.35 + 0.01 * n1, -pelZ * 0.7 + 0.025 * w * Math.sin(2 * ph - 1.0) + 0.01 * n2, 1);
      }
      // right arm: parasol
      eul(Bm.armR, RA.x + 0.015 * Math.sin(2 * ph) * w, RA.y, RA.z); eul(Bm.foreR, RA.fx, 0, 0); eul(Bm.handR, RA.hx, RA.hy, RA.hz);
      // left arm: swing / reach
      tE.set(0.03 + 0.16 * sp * w * (1 - r), 0, -0.07); fq1.setFromEuler(tE); tE.set(0.12 + 0.1 * w, 0, 0); fq2.setFromEuler(tE);
      if (r > 0.001) {
        Bm.root.updateMatrixWorld(true);
        tv.copy(reachT); group.localToWorld(tv); Bm.armL.getWorldPosition(tv2); tw.subVectors(tv, tv2).normalize(); tv.addScaledVector(tw, -0.05);
        solveIK(armL, tv, poleReach, iq1, iq2); fq1.slerp(iq1, r); fq2.slerp(iq2, r);
      }
      Bm.armL.quaternion.copy(fq1); Bm.foreL.quaternion.copy(fq2);
      eul(Bm.handL, -0.25 * r, 0.6 * r, 0.1 * r);
      Bm.root.position.set(-0.008 * cp * w, w * (-0.012 + 0.009 * Math.cos(2 * ph)) - 0.008 * r, 0);
    }
    applyPose(0, 0, true);
    group.updateMatrixWorld(true);
    // parasol: placed in the posed hand, shaft over the right shoulder
    var grip = new V3(); Bm.handR.localToWorld(grip.copy(palm.R).sub(Bm.handR.userData.bindW));
    var shoulder = new V3(); Bm.armR.getWorldPosition(shoulder); shoulder.add(new V3(-0.01, 0.075, 0.06));
    var sdir = new V3().subVectors(shoulder, grip).normalize();
    sdir.lerp(new V3(0.02, 0.86, 0.5).normalize(), 0.45).normalize();
    var parasolPivot = new THREE.Object3D(); parasolPivot.name = 'mom-parasol';
    var qW = new THREE.Quaternion().setFromUnitVectors(AY, sdir), hq = new THREE.Quaternion(); Bm.handR.getWorldQuaternion(hq);
    parasolPivot.quaternion.copy(hq.clone().invert().multiply(qW));
    parasolPivot.position.copy(Bm.handR.worldToLocal(grip.clone()));
    Bm.handR.add(parasolPivot);
    var spin = new THREE.Object3D(); parasolPivot.add(spin);
    // canopy
    var CR = 0.43, CH = 0.17, APEX = 0.80, NRIB = 8, PHM = 1.05;
    var canB = new Builder();
    function canopyF(u, v, out) {
      var th = u * TAU, rib = Math.abs(Math.cos(th * NRIB / 2));            // 1 at ribs, 0 between
      var vmax = 1 + 0.075 * (1 - Math.pow(rib, 1.6)), s = v * vmax;
      var a = s * PHM, rr = CR * Math.sin(a) / Math.sin(PHM), y = APEX - CH * (1 - Math.cos(a)) / (1 - Math.cos(PHM));
      var sag = 0.035 * (1 - rib) * Math.sin(Math.min(1, s) * PI) * 0.6;
      rr *= 1 - sag * 0.3; y -= sag * 0.25;
      out.set(Math.cos(th) * rr, y, Math.sin(th) * rr);
    }
    surf(canB, {
      nu: seg(72), nv: seg(13), closedU: true, f: canopyF,
      center: function (u, v, out) { out.set(0, APEX - 0.5, 0); },
      pole: function (u, v, out) { if (v < 1e-6) { out.set(0, 1, 0); return true; } return false; },
      uv: function (u, v, p) { return [0.5 + p.x / (CR * 2.4), 0.5 + p.z / (CR * 2.4)]; }
    });
    var canTex = GF.canvasTex(512, 512, function (c, w, h) {
      c.fillStyle = '#f3ecdc'; c.fillRect(0, 0, w, h);
      var img = c.getImageData(0, 0, w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var i = (y * w + x) * 4, n = ((x + y) & 1 ? 2 : -2) + (GF.noise2(x * 0.5, y * 0.5) - 0.5) * 8; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      c.putImageData(img, 0, 0);
      var cx = w / 2, cy = h / 2, R0 = w / 2.4;
      c.strokeStyle = 'rgba(150,130,100,0.35)'; c.lineWidth = 1.5;
      for (var k = 0; k < NRIB; k++) { var a = k / NRIB * TAU; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w); c.stroke(); }
      // lace band near the edge
      c.strokeStyle = 'rgba(205,190,160,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R0 * 0.86, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(190,172,140,0.55)';
      for (k = 0; k < 120; k++) { var b = k / 120 * TAU; c.beginPath(); c.arc(cx + Math.cos(b) * R0 * 0.93, cy + Math.sin(b) * R0 * 0.93, 2.2, 0, TAU); c.fill(); }
      c.strokeStyle = 'rgba(180,160,125,0.6)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R0 * 1.0, 0, TAU); c.stroke();
    });
    var canMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: canTex, roughness: 0.85, sheen: 0.4, sheenColor: new THREE.Color(0xfff6e0), side: THREE.DoubleSide, emissive: new THREE.Color(0xfff2da), emissiveMap: canTex, emissiveIntensity: 0.12 });
    var canopy = new THREE.Mesh(canB.geometry(false), canMat); canopy.castShadow = true; canopy.receiveShadow = true; canopy.name = 'mom-canopy';
    spin.add(canopy);
    // shaft, handle, ribs, finial
    var wdB = new Builder(), WOOD = C(0x8a5a36), MET = C(0xb9b2a6);
    sweep(wdB, [{ p: [0, -0.12, 0], r: [0.0135, 0.0135] }, { p: [0, -0.02, 0], r: [0.0145, 0.0145] }, { p: [0, 0.05, 0], r: [0.012, 0.012] }], { side: AX, nu: 12, nv: 4, capA: 1, capB: 0, col: WOOD });
    sweep(wdB, [{ p: [0, 0.04, 0], r: [0.0065, 0.0065] }, { p: [0, APEX + 0.06, 0], r: [0.006, 0.006] }], { side: AX, nu: 8, nv: 2, capA: 0, capB: 1, col: WOOD });
    blob(wdB, [0, APEX + 0.065, 0], [0.011, 0.016, 0.011], { col: WOOD, nu: 10, nv: 8 });
    var tp = new V3();
    for (var rk = 0; rk < NRIB; rk++) {
      var keys = [];
      for (var q = 0; q <= 4; q++) { canopyF(rk / NRIB, 0.08 + q / 4 * 0.92, tp); tp.y -= 0.006; tp.multiplyScalar(1); keys.push({ p: [tp.x * 0.995, tp.y, tp.z * 0.995], r: [0.0022, 0.0022] }); }
      sweep(wdB, keys, { side: AY, nu: 4, nv: 6, capA: 0, capB: 1, ncap: 2, col: MET });
      canopyF(rk / NRIB, 1.0, tp); blob(wdB, [tp.x * 1.01, tp.y - 0.004, tp.z * 1.01], [0.006, 0.008, 0.006], { col: WOOD, nu: 8, nv: 6 });
    }
    var woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.45, metalness: 0.0 });
    var shaft = new THREE.Mesh(wdB.geometry(false), woodMat); shaft.castShadow = true; shaft.name = 'mom-parasol-shaft'; spin.add(shaft);
    // tote bag on the right forearm (rigid + pendulum)
    var elbow = new V3(); Bm.foreR.getWorldPosition(elbow);
    var handW = new V3(); Bm.handR.getWorldPosition(handW);
    var hookW = elbow.clone().lerp(handW, 0.22); hookW.y += 0.035;
    var bagPivot = new THREE.Object3D(); bagPivot.position.copy(Bm.foreR.worldToLocal(hookW.clone()));
    var fq = new THREE.Quaternion(); Bm.foreR.getWorldQuaternion(fq); bagPivot.quaternion.copy(fq.invert());
    Bm.foreR.add(bagPivot);
    var bagSwing = new THREE.Object3D(); bagPivot.add(bagSwing);
    var bgB = new Builder(), BAG = C(0xcbb998), BAGH = C(0x8b5a3a), BSTR = C(0x3e4a5d);
    var bx = 0.055, bh = 0.15, bw = 0.15, bcy = -0.29;
    surf(bgB, {
      nu: 24, nv: 10, closedU: true,
      f: function (u, v, out) {
        var ph = u * TAU, c = Math.cos(ph), s2 = Math.sin(ph), e = 0.35;
        var x = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e) * bx * (0.6 + 0.4 * v), z = (s2 < 0 ? -1 : 1) * Math.pow(Math.abs(s2), e) * bw * (1 + 0.06 * (1 - v));
        out.set(x * (0.85 + 0.15 * Math.sin(PI * v)), bcy - bh + 2 * bh * v, z);
      },
      center: function (u, v, out) { out.set(0, bcy - bh + 2 * bh * v, 0); },
      col: BAG, uv: function (u, v, p) { return [u * 12, p.y / 0.03]; }
    });
    surf(bgB, { nu: 16, nv: 3, closedU: true, f: function (u, v, out) { var ph = u * TAU, c = Math.cos(ph), s2 = Math.sin(ph); out.set((c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 0.35) * bx * 0.6 * (1 - v), bcy - bh, (s2 < 0 ? -1 : 1) * Math.pow(Math.abs(s2), 0.35) * bw * 1.06 * (1 - v)); }, center: function (u, v, out) { out.set(0, bcy, 0); }, col: BAG });
    for (var hs = -1; hs <= 1; hs += 2) {
      sweep(bgB, [{ p: [hs * 0.03, bcy + bh - 0.01, -0.07], r: [0.004, 0.007] }, { p: [hs * 0.02, bcy + bh + 0.12, -0.035], r: [0.004, 0.007] }, { p: [hs * 0.005, -0.004, 0], r: [0.004, 0.007] }, { p: [hs * 0.02, bcy + bh + 0.12, 0.035], r: [0.004, 0.007] }, { p: [hs * 0.03, bcy + bh - 0.01, 0.07], r: [0.004, 0.007] }],
        { side: AX, nu: 5, nv: 12, capA: 0.5, capB: 0.5, ncap: 2, col: BAGH });
    }
    var bag = new THREE.Mesh(bgB.geometry(false), clothMat); bag.castShadow = true; bag.receiveShadow = true; bag.name = 'mom-bag'; bagSwing.add(bag);

    function update(dt, t) {
      dt = clamp(dt || 0, 0, 0.1); if (t === undefined) t = st.time + dt; st.time = t;
      st.walkS = damp(st.walkS, st.walk, 3, dt); st.reachS = damp(st.reachS, st.reach, 3.5, dt);
      if (st.walkS > 0.002) st.phase = (st.phase + dt * TAU * 0.92) % (TAU * 1000);
      applyPose(dt, t, false);
      var w = st.walkS, ph = st.phase;
      spin.rotation.set(0.025 * Math.sin(2 * ph - 0.6) * w + 0.01 * Math.sin(t * 0.9), 0.35 * Math.sin(t * 0.33) + 0.2 * Math.sin(t * 0.13), 0.02 * Math.sin(ph) * w);
      // bag pendulum
      var drive = -0.6 * Math.sin(2 * ph) * w;
      st.bagV += (-st.bagA * 28 - st.bagV * 3 + drive * 6) * dt; st.bagA += st.bagV * dt; st.bagA = clamp(st.bagA, -0.4, 0.4);
      bagSwing.rotation.set(st.bagA, 0, 0.3 * st.bagA);
    }
    update(0, 0);
    return {
      group: group, handL: handL, bones: Bm, parasol: parasolPivot,
      reach: function (v) { st.reach = clamp(+v || 0, 0, 1); },
      setWalk: function (v) { st.walk = clamp(+v || 0, 0, 1); },
      update: update
    };
  };
})();

/* ---- hair.js ---- */
/* hair.js — the girl's hair.
   Guide strands (≈130 × 10 nodes) are simulated on the CPU in world space (PBD + rest-shape springs,
   collisions in head-local space against skull / ears / neck / shoulders). Each frame the guides are
   up-sampled into a small float texture; ~1500 render strands (camera-facing ribbons with a procedural
   multi-hair alpha texture) are expanded entirely in the vertex shader from 3 guides each.
   Shading: MeshStandardMaterial patched with a Kajiya-Kay direct-light term, so it uses three's lights,
   shadows and scene.environment automatically.
   States per guide: wet (1→0), fluff (0→1 when drying), smooth (0→1 when brushing).
   GF.createHair({anchor, low}) — see CONTRACT.md. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};

  var NN = 10;          // simulated nodes per guide
  var NS = 19;          // up-sampled points per guide (texture columns)
  var TW = NS + 1;      // + 1 state texel
  var SEGS = 14;        // render segments per strand
  var NCOW = 6;         // cowlick guides
  var COW_PER = 5;      // render strands per cowlick guide
  var DEG = Math.PI / 180;

  function sstep(a, b, v) { var t = (v - a) / (b - a); t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
  function c01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  // ------------------------------------------------------------------ shaders
  var VERT_HEAD = [
    'uniform highp sampler2D uHairTex;',
    'uniform mat4 uHeadMat;',
    'uniform mat4 uHeadInv;',
    'uniform float uTime;',
    'uniform vec4 uWindO;',
    'uniform vec4 uWindD;',
    'uniform float uPix;',
    'uniform float uWidthMul;',
    'attribute vec3 aG;',
    'attribute vec3 aW;',
    'attribute vec4 aS;',
    'attribute vec4 aR;',
    'attribute vec2 aQ;',
    'attribute vec3 aRoot;',
    '#ifdef HAIR_COLOR',
    'varying vec3 vHT;',
    'varying vec4 vHI;',
    'varying vec3 vHC;',
    'varying vec2 vHU;',
    '#endif',
    'vec3 hP; vec3 hN; vec3 hT;',
    '#define HNS ' + NS,
    'vec3 hFetch(int g, int j) { return texelFetch(uHairTex, ivec2(j, g), 0).xyz; }',
    'void hGuide(int g, float u, out vec3 P, out vec3 T) {',
    '  float fi = clamp(u, 0.0, 1.0) * float(HNS - 1);',
    '  int i1 = int(min(floor(fi), float(HNS - 2)));',
    '  float f = fi - float(i1);',
    '  vec3 p0 = hFetch(g, max(i1 - 1, 0)); vec3 p1 = hFetch(g, i1);',
    '  vec3 p2 = hFetch(g, i1 + 1); vec3 p3 = hFetch(g, min(i1 + 2, HNS - 1));',
    '  vec3 m1 = (i1 == 0) ? (p2 - p1) : (p2 - p0) * 0.5;',
    '  vec3 m2 = (i1 + 2 > HNS - 1) ? (p2 - p1) : (p3 - p1) * 0.5;',
    '  float f2 = f * f, f3 = f2 * f;',
    '  P = (2.0 * f3 - 3.0 * f2 + 1.0) * p1 + (f3 - 2.0 * f2 + f) * m1 + (-2.0 * f3 + 3.0 * f2) * p2 + (f3 - f2) * m2;',
    '  T = (6.0 * f2 - 6.0 * f) * p1 + (3.0 * f2 - 4.0 * f + 1.0) * m1 + (-6.0 * f2 + 6.0 * f) * p2 + (3.0 * f2 - 2.0 * f) * m2;',
    '}',
    // strand offset from the interpolated guide curve (frizz, layering, clumping, inward tips, wind flutter)
    'vec3 hOff(float s, vec3 N, vec3 B, float wet, float frz, float slk, float infl, float flag) {',
    '  float ramp = smoothstep(0.0, 0.10, s);',
    '  float ph = aR.w * 6.2832;',
    '  bool cow = flag > 0.5 && flag < 1.5;',
    '  vec3 o = N * (aR.x - 0.6) * mix(mix(0.004, 0.010, frz), 0.0012, wet) * ramp;',
    '  float cr = mix(mix(0.0022, 0.0045, frz), 0.0020 * pow(1.0 - s, 1.4) + 0.0002, wet);',
    '  if (cow) cr = 0.0015 + 0.004 * s;',
    '  o += (N * aR.y + B * aR.z) * cr * ramp;',
    '  float fa = cow ? 0.0 : frz;',
    '  o += (N * sin(s * 8.0 + ph) * 0.7 + B * sin(s * 11.0 + ph * 1.7)) * 0.014 * fa * s;',
    '  o += (N * sin(s * 15.0 + ph * 2.0) * 0.6 + B * cos(s * 17.0 + ph * 1.3)) * 0.005 * fa * sqrt(s) * (flag < -0.5 ? 0.4 : 1.0);',
    '  if (flag > 1.5) o += (N * (0.6 + 0.4 * sin(ph * 5.0)) * 0.040 * s * s + B * sin(ph * 3.0) * 0.025 * s) * fa;',
    '  o -= N * smoothstep(0.72, 1.0, s) * 0.008 * slk;',
    '  float fl = (1.0 - 0.85 * wet) * infl * s;',
    '  o += (B * sin(uTime * 37.0 + ph * 9.0 + s * 12.0) + N * sin(uTime * 29.0 + ph * 5.0 + s * 9.0) * 0.6) * 0.005 * fl;',
    '  return o;',
    '}',
    'void hairCompute() {',
    '  int g0 = int(aG.x + 0.5), g1 = int(aG.y + 0.5), g2 = int(aG.z + 0.5);',
    '  vec4 st = texelFetch(uHairTex, ivec2(HNS, g0), 0) * aW.x + texelFetch(uHairTex, ivec2(HNS, g1), 0) * aW.y + texelFetch(uHairTex, ivec2(HNS, g2), 0) * aW.z;',
    '  float wet = clamp(st.x, 0.0, 1.0), fl = clamp(st.y, 0.0, 1.0), sm = clamp(st.z, 0.0, 1.0);',
    '  float frz = (1.0 - wet) * fl, slk = (1.0 - wet) * sm;',
    '  float s = aS.x * aS.z;',
    '  vec3 w = pow(max(aW, vec3(1e-4)), vec3(1.0 + wet * 2.0)); w /= (w.x + w.y + w.z);',
    '  vec3 P0, T0, P1, T1, P2, T2;',
    '  hGuide(g0, s, P0, T0); hGuide(g1, s, P1, T1); hGuide(g2, s, P2, T2);',
    '  vec3 P = P0 * w.x + P1 * w.y + P2 * w.z;',
    '  vec3 G0 = hFetch(g0, 0) * w.x + hFetch(g1, 0) * w.y + hFetch(g2, 0) * w.z;',
    '  P += ((uHeadMat * vec4(aRoot, 1.0)).xyz - G0) * mix(1.0, 0.35, smoothstep(0.0, 0.5, s));',
    '  vec3 Tu = (T0 * w.x + T1 * w.y + T2 * w.z) * float(HNS - 1);',
    '  vec3 T = normalize(Tu + vec3(0.0, -1e-6, 0.0));',
    '  vec3 Pl = (uHeadInv * vec4(P, 1.0)).xyz;',
    '  vec3 ax = vec3(0.0, clamp(Pl.y, -0.32, 0.0), 0.012);',
    '  vec3 N = normalize(mat3(uHeadMat) * (Pl - ax) + vec3(1e-6));',
    '  N = normalize(N - T * dot(N, T) + vec3(1e-6));',
    '  vec3 B = cross(T, N);',
    '  float infl = 0.0;',
    '  if (uWindO.w > 0.0) {',
    '    if (uWindD.w > 0.5) infl = uWindO.w;',
    '    else { vec3 v = P - uWindO.xyz; float al = dot(v, uWindD.xyz);',
    '      if (al > 0.01) { float r = length(v - uWindD.xyz * al);',
    '        float fa = 1.0 - smoothstep(0.0, 0.47, r / al); infl = fa * fa * (1.0 - smoothstep(0.15, 0.68, al)) * uWindO.w; } }',
    '  }',
    '  vec3 o0 = hOff(s, N, B, wet, frz, slk, infl, aS.w);',
    '  vec3 o1 = hOff(s + 0.01, N, B, wet, frz, slk, infl, aS.w);',
    '  vec3 Tf = normalize(Tu * 0.01 + (o1 - o0));',
    '  P += o0;',
    '  vec3 V = cameraPosition - P; float dist = length(V); V /= max(dist, 1e-5);',
    '  vec3 side = cross(Tf, V); float sl = length(side);',
    '  side = sl > 1e-4 ? side / sl : B;',
    '  float wd = aQ.x * mix(1.0, 0.3, smoothstep(0.45, 1.0, aS.x)) * mix(0.6, 1.0, smoothstep(0.0, 0.06, aS.x));',
    '  wd *= mix(1.0, 0.75, wet) * (aS.w > 1.5 ? mix(1.0, 0.4, frz) : 1.0 + 0.5 * frz) * uWidthMul;',
    '  wd = max(wd, uPix * dist * 1.25);',
    '  hP = P + side * aS.y * wd * 0.5;',
    '  hT = Tf;',
    '  hN = normalize(N + side * aS.y * 0.35);',
    '#ifdef HAIR_COLOR',
    '  vec3 cWet = vec3(0.0065, 0.0048, 0.0040);',
    '  vec3 cSleek = vec3(0.0200, 0.0122, 0.0082);',
    '  vec3 cFluff = vec3(0.026, 0.0158, 0.0098);',
    '  vec3 c = mix(cSleek, cFluff, fl);',
    '  c = mix(c, cWet, wet);',
    '  c *= 0.86 + 0.28 * aQ.y;',
    '  c *= mix(0.45, 1.0, smoothstep(0.0, 0.2, aS.x));',
    '  c *= 1.0 + 0.22 * s * s * (1.0 - wet);',
    '  c *= mix(0.6, 1.0, aR.x);',
    '  vHC = c;',
    '  vHI = vec4(wet, frz, slk, aS.x);',
    '  vHU = vec2(aS.y * 0.5 + 0.5, s * 6.0 + aR.w * 3.0);',
    '  vHT = (viewMatrix * vec4(hT, 0.0)).xyz;',
    '#endif',
    '}'
  ].join('\n');

  var FRAG_HEAD = [
    'uniform sampler2D uStrandTex;',
    'varying vec3 vHT;',
    'varying vec4 vHI;',
    'varying vec3 vHC;',
    'varying vec2 vHU;',
    'float hairShift = 0.0;'
  ].join('\n');

  var FRAG_LIGHT = [
    '#undef RE_Direct',
    'float hKK(vec3 T, vec3 H, float e) { float th = dot(T, H); float s = sqrt(max(0.0, 1.0 - th * th)); return pow(s, e) * smoothstep(-1.0, 0.0, th); }',
    'void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {',
    '  vec3 L = directLight.direction; vec3 N = geometryNormal; vec3 V = geometryViewDir;',
    '  vec3 T = normalize(vHT + vec3(1e-6));',
    '  float NL = dot(N, L);',
    '  float wrapd = clamp((NL + 0.3) / 1.3, 0.0, 1.0);',
    '  float tl = dot(T, L); float sinTL = sqrt(max(0.0, 1.0 - tl * tl));',
    '  vec3 irr = directLight.color * wrapd * mix(1.0, sinTL, 0.35);',
    '  reflectedLight.directDiffuse += irr * BRDF_Lambert(material.diffuseColor);',
    '  vec3 Hh = normalize(L + V);',
    '  float wet = vHI.x * vHI.x, frz = vHI.y, slk = vHI.z;',
    '  float e1 = mix(mix(50.0, 110.0, slk), 320.0, wet);',
    '  float k1 = mix(mix(0.025, 0.17, slk * slk) * (1.0 - 0.5 * frz), 0.20, wet);',
    '  float e2 = mix(30.0, 90.0, slk);',
    '  float k2 = mix(0.06, 0.15, slk) * (1.0 - 0.6 * wet);',
    '  vec3 T1 = normalize(T + N * (hairShift + 0.12));',
    '  vec3 T2 = normalize(T + N * (hairShift - 0.16));',
    '  float occ = smoothstep(-0.15, 0.35, NL) * smoothstep(0.02, 0.22, vHI.w);',
    '  vec3 tint = material.diffuseColor / max(max(material.diffuseColor.r, material.diffuseColor.g), 1e-4);',
    '  vec3 spec = vec3(1.0, 0.92, 0.84) * (k1 * hKK(T1, Hh, e1)) + tint * k2 * hKK(T2, Hh, e2) * 0.5;',
    '  reflectedLight.directSpecular += spec * directLight.color * occ;',
    '}',
    '#define RE_Direct RE_Direct_Hair'
  ].join('\n');

  var FRAG_MAP = [
    'vec4 hst = texture2D(uStrandTex, vHU);',
    'float ha = hst.a;',
    'vec2 hdx = dFdx(vHU * vec2(64.0, 256.0)), hdy = dFdy(vHU * vec2(64.0, 256.0));',
    'float hlod = max(0.0, 0.5 * log2(max(dot(hdx, hdx), dot(hdy, hdy)) + 1e-6));',
    'ha = clamp(ha * (1.0 + hlod * 0.35), 0.0, 1.0);',
    'ha *= step(hst.b * 0.10, vHI.w) * step(vHI.w, 1.0 - hst.b * 0.16);',
    'diffuseColor.rgb = vHC * (0.72 + 0.56 * hst.r);',
    'diffuseColor.a = ha;',
    'hairShift = (hst.g - 0.5) * 0.3;'
  ].join('\n');

  // ------------------------------------------------------------------ factory
  GF.createHair = function (opts) {
    opts = opts || {};
    var low = !!opts.low;
    var anchor = opts.anchor || new THREE.Object3D();
    var HD = GF.HEAD, SK = HD.skull;
    var rng = GF.rng(26111901);

    // ---------- head-local geometry helpers
    function ellOnDir(dx, dy, dz, out) {
      var t = 1 / Math.sqrt((dx / SK[0]) * (dx / SK[0]) + (dy / SK[1]) * (dy / SK[1]) + (dz / SK[2]) * (dz / SK[2]));
      out[0] = dx * t; out[1] = dy * t; out[2] = dz * t; return out;
    }
    function ellNormal(p, out) {
      var x = p[0] / (SK[0] * SK[0]), y = p[1] / (SK[1] * SK[1]), z = p[2] / (SK[2] * SK[2]);
      var l = Math.sqrt(x * x + y * y + z * z) || 1; out[0] = x / l; out[1] = y / l; out[2] = z / l; return out;
    }
    var HL = [[0, 0.052], [34, 0.052], [60, 0.016], [70, -0.004], [80, -0.012], [83, 0.030], [106, 0.030], [128, -0.045], [146, -0.072], [180, -0.076]];
    function hairlineY(th) {
      for (var i = 1; i < HL.length; i++) {
        if (th <= HL[i][0]) { var a = HL[i - 1], b = HL[i]; var f = (th - a[0]) / (b[0] - a[0]); f = f * f * (3 - 2 * f); return a[1] + (b[1] - a[1]) * f; }
      }
      return HL[HL.length - 1][1];
    }
    function thetaOf(p) { return Math.atan2(Math.abs(p[0]), -p[2]) / DEG; }
    function inRegion(p, margin) { return p[1] > hairlineY(thetaOf(p)) + (margin || 0); }
    function isFringe(p) { return p[2] < 0.03 && Math.abs(p[0]) < Math.min(0.05, 0.018 + 0.3 * (0.03 - p[2])) && p[1] > 0.03; }

    var cd = HD.cowlickDir, cdl = Math.sqrt(cd[0] * cd[0] + cd[1] * cd[1] + cd[2] * cd[2]);
    var W = ellOnDir(cd[0] / cdl, cd[1] / cdl, cd[2] / cdl, [0, 0, 0]);   // whorl / crown point

    function tangentize(v, n) { var d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]; v[0] -= n[0] * d; v[1] -= n[1] * d; v[2] -= n[2] * d; var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; }
    function flowDir(p, n, fringe, out) {
      out[0] = p[0] - W[0]; out[1] = p[1] - W[1]; out[2] = p[2] - W[2];
      var len = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]);
      if (len < 1e-4) { out[0] = 0; out[1] = -0.3; out[2] = 1; }
      tangentize(out, n);
      var sw = Math.exp(-len / 0.03) * 1.6;
      var cx = n[1] * out[2] - n[2] * out[1], cy = n[2] * out[0] - n[0] * out[2], cz = n[0] * out[1] - n[1] * out[0];
      out[0] += cx * sw; out[1] += cy * sw; out[2] += cz * sw;
      if (!fringe) {
        var fwd = Math.max(0, -out[2] + 0.15);
        var sx = p[0] > 0.002 ? 1 : (p[0] < -0.002 ? -1 : (p[2] > 0 ? 1 : -1));
        out[0] += sx * 2.2 * fwd; out[1] -= 0.4 * fwd; out[2] += 0.6 * fwd;
      } else {
        out[1] -= 0.1; out[0] = out[0] * 0.5 + p[0] * 6.0;
      }
      out[1] -= 0.12;
      return tangentize(out, n);
    }

    // collision against skull / ears / neck / shoulders in head-local space. c = [x,y,z] modified in place
    var NA = HD.neckA, NB = HD.neckB, TC = HD.torsoC, TR = HD.torsoR;
    var EAR_R = 0.017;
    function collide(c, L, towel, face) {
      var x = c[0], y = c[1], z = c[2], q, s, moved = false;
      // keep long hair out of the face (beside the cheeks)
      if (face && z < -0.02 && y < 0.035) {
        var fx = 0.074 + L * 0.5, ax = Math.abs(x), fw = sstep(0.035, 0.0, y) * sstep(-0.02, -0.045, z);
        if (ax < fx && fw > 0) { var nx = (x >= 0 ? 1 : -1) * fx; x += (nx - x) * fw; moved = true; }
      }
      // skull
      var rx = SK[0] + L, ry = SK[1] + L, rz = SK[2] + L;
      var qx = x / rx, qy = y / ry, qz = z / rz; q = qx * qx + qy * qy + qz * qz;
      if (q < 1 && q > 1e-8) { s = 1 / Math.sqrt(q); x *= s; y *= s; z *= s; moved = true; }
      // towel: upper head pressed close
      if (towel > 0.001 && y > -0.035) {
        var tx = SK[0] + 0.007, ty = SK[1] + 0.007, tz = SK[2] + 0.007;
        qx = x / tx; qy = y / ty; qz = z / tz; q = qx * qx + qy * qy + qz * qz;
        if (q > 1) {
          var tw = towel * sstep(-0.035, -0.005, y); s = 1 + (1 / Math.sqrt(q) - 1) * tw;
          x *= s; y *= s; z *= s; moved = true;
        }
      }
      // ears
      for (var e = -1; e <= 1; e += 2) {
        var ex = x - e * (HD.earX + 0.004), ey = y - HD.earY, ez = z - HD.earZ, ed = ex * ex + ey * ey + ez * ez, er = EAR_R + L * 0.7;
        if (ed < er * er) { var el = Math.sqrt(ed) || 1e-4; s = er / el; x = e * (HD.earX + 0.004) + ex * s; y = HD.earY + ey * s; z = HD.earZ + ez * s; moved = true; }
      }
      // neck capsule
      var abx = NB[0] - NA[0], aby = NB[1] - NA[1], abz = NB[2] - NA[2];
      var tt = ((x - NA[0]) * abx + (y - NA[1]) * aby + (z - NA[2]) * abz) / (abx * abx + aby * aby + abz * abz);
      tt = tt < 0 ? 0 : (tt > 1 ? 1 : tt);
      var px = NA[0] + abx * tt, py = NA[1] + aby * tt, pz = NA[2] + abz * tt;
      var dx = x - px, dy = y - py, dz = z - pz, dl = dx * dx + dy * dy + dz * dz, nr = HD.neckR + L;
      if (dl < nr * nr) { var d1 = Math.sqrt(dl); if (d1 < 1e-5) { dx = 0; dy = 0; dz = 1; d1 = 1; } s = nr / d1; x = px + dx * s; y = py + dy * s; z = pz + dz * s; moved = true; }
      // shoulders / upper back (elliptic cylinder below the centre)
      var ox = x - TC[0], oy = y - TC[1], oz = z - TC[2];
      var sy = oy > 0 ? oy : 0;
      qx = ox / (TR[0] + L); qy = sy / (TR[1] + L); qz = oz / (TR[2] + L); q = qx * qx + qy * qy + qz * qz;
      if (q < 1 && q > 1e-8) { s = 1 / Math.sqrt(q); x = TC[0] + ox * s; z = TC[2] + oz * s; if (oy > 0) y = TC[1] + oy * s; moved = true; }
      c[0] = x; c[1] = y; c[2] = z;
      return moved;
    }

    // ---------- static rest shapes (relaxation under gravity against the inflated body)
    var ST = [
      // wet: plastered, limp
      { base: 0.0018, thick: 0.0030, grav: 1.0, stiff: 0.10, ang: 3, spread: 0, wave: 0, fringeThick: 0.002 },
      // fluffy: big, springy, spreading
      { base: 0.006, thick: 0.034, grav: 0.5, stiff: 0.32, ang: 30, spread: 0.55, wave: 0.016, fringeThick: 0.013 },
      // smooth: moderate volume
      { base: 0.0030, thick: 0.0085, grav: 1.0, stiff: 0.26, ang: 7, spread: 0, wave: 0, fringeThick: 0.004 }
    ];
    function liftAt(arc, P, fringe) { return P.base + (fringe ? P.fringeThick : P.thick) * sstep(0, 0.10, arc); }
    var tmpC = [0, 0, 0], relaxArcs = new Float32Array(32), relaxSegs = new Float32Array(32);
    var ARC_EXP = 1.3;
    function relax(root, n, f, len, N, P, fringe, out, seed, expo) {
      var a = P.ang * DEG, ca = Math.cos(a), sa = Math.sin(a), arcs = relaxArcs, segs = relaxSegs;
      for (var k = 0; k < N; k++) { arcs[k] = len * Math.pow(k / (N - 1), expo); segs[k] = k ? arcs[k] - arcs[k - 1] : 0; }
      var seg = len / (N - 1);
      var d0 = [f[0] * ca + n[0] * sa, f[1] * ca + n[1] * sa, f[2] * ca + n[2] * sa];
      var p0 = [root[0] + n[0] * 0.0022, root[1] + n[1] * 0.0022, root[2] + n[2] * 0.0022];
      var i, it;
      for (k = 0; k < N; k++) { out[k * 3] = p0[0] + d0[0] * arcs[k]; out[k * 3 + 1] = p0[1] + d0[1] * arcs[k]; out[k * 3 + 2] = p0[2] + d0[2] * arcs[k]; }
      for (it = 0; it < 60; it++) {
        for (k = 2; k < N; k++) {
          i = k * 3;
          out[i + 1] -= P.grav * segs[k] * 0.35;
          if (P.spread) {
            var hx = out[i], hz = out[i + 2] - 0.01, hl = Math.sqrt(hx * hx + hz * hz) || 1, sp = P.spread * seg * 0.2 * (k / (N - 1)) * (fringe ? 0.2 : 1);
            out[i] += hx / hl * sp; out[i + 2] += hz / hl * sp;
          }
        }
        out[3] = p0[0] + d0[0] * segs[1]; out[4] = p0[1] + d0[1] * segs[1]; out[5] = p0[2] + d0[2] * segs[1];
        for (k = 2; k < N; k++) {
          i = k * 3; var rr = segs[k] / segs[k - 1];
          out[i] += (out[i - 3] + (out[i - 3] - out[i - 6]) * rr - out[i]) * P.stiff;
          out[i + 1] += (out[i - 2] + (out[i - 2] - out[i - 5]) * rr - out[i + 1]) * P.stiff;
          out[i + 2] += (out[i - 1] + (out[i - 1] - out[i - 4]) * rr - out[i + 2]) * P.stiff;
        }
        for (k = 1; k < N; k++) {
          i = k * 3;
          var dx = out[i] - out[i - 3], dy = out[i + 1] - out[i - 2], dz = out[i + 2] - out[i - 1], dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          out[i] = out[i - 3] + dx / dl * segs[k]; out[i + 1] = out[i - 2] + dy / dl * segs[k]; out[i + 2] = out[i - 1] + dz / dl * segs[k];
          tmpC[0] = out[i]; tmpC[1] = out[i + 1]; tmpC[2] = out[i + 2];
          collide(tmpC, liftAt(arcs[k], P, fringe), 0, !fringe);
          out[i] = tmpC[0]; out[i + 1] = tmpC[1]; out[i + 2] = tmpC[2];
        }
      }
      if (P.wave) {   // messy waves for the blow-dried mop
        var r = GF.rng(seed), ph1 = r() * 6.28, ph2 = r() * 6.28, fq = 1.6 + r() * 1.6, amp = P.wave * (0.6 + 0.8 * r()) * (fringe ? 0.35 : 1);
        for (k = 2; k < N; k++) {
          i = k * 3; var s = k / (N - 1);
          var ax = out[i], ay = Math.min(0, Math.max(-0.32, out[i + 1])), az = out[i + 2] - 0.012;
          var nx = ax, ny = out[i + 1] - ay, nz = az, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          var tx = out[i] - out[i - 3], ty = out[i + 1] - out[i - 2], tz = out[i + 2] - out[i - 1], tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= tl; ty /= tl; tz /= tl;
          var bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
          var w1 = Math.sin(s * fq * 6.28 + ph1) * amp * s, w2 = Math.sin(s * (fq + 0.9) * 6.28 + ph2) * amp * s * 0.8;
          out[i] += nx * Math.abs(w1) * 0.8 + bx * w2; out[i + 1] += ny * Math.abs(w1) * 0.8 + by * w2; out[i + 2] += nz * Math.abs(w1) * 0.8 + bz * w2;
          tmpC[0] = out[i]; tmpC[1] = out[i + 1]; tmpC[2] = out[i + 2];
          collide(tmpC, liftAt(arcs[k], P, fringe) * 0.8, 0, !fringe);
          out[i] = tmpC[0]; out[i + 1] = tmpC[1]; out[i + 2] = tmpC[2];
        }
      }
      return out;
    }

    // ---------- guide roots
    function fibDir(i, n, out) {
      var y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = i * 2.399963229728653;
      out[0] = Math.cos(phi) * r; out[1] = y; out[2] = Math.sin(phi) * r; return out;
    }
    var gRoots = [], tmpD = [0, 0, 0];
    var nFib = low ? 210 : 290;
    for (var i = 0; i < nFib; i++) {
      fibDir(i, nFib, tmpD);
      var rp = ellOnDir(tmpD[0], tmpD[1], tmpD[2], [0, 0, 0]);
      if (inRegion(rp, 0.004)) gRoots.push(rp);
    }
    var nG = gRoots.length;
    var NROWS = nG + NCOW;

    var shapes = new Float32Array(3 * nG * NN * 3);   // [state][g][k][xyz] head-local
    var lifts = new Float32Array(3 * nG * NN);
    var segL = new Float32Array(nG), restL = new Float32Array(nG * NN);
    var gFringe = new Uint8Array(nG);
    var rootDir = new Float32Array(nG * 3);
    var gFlow = new Float32Array(nG * 3);
    var longTmp = new Float32Array(26 * 3), shp = new Float32Array(NN * 3);
    var nrm = [0, 0, 0], fl = [0, 0, 0];
    for (var g = 0; g < nG; g++) {
      var R = gRoots[g];
      ellNormal(R, nrm);
      var fr = isFringe(R);
      gFringe[g] = fr ? 1 : 0;
      flowDir(R, nrm, fr, fl);
      gFlow[g * 3] = fl[0]; gFlow[g * 3 + 1] = fl[1]; gFlow[g * 3 + 2] = fl[2];
      var rl = Math.sqrt(R[0] * R[0] + R[1] * R[1] + R[2] * R[2]);
      rootDir[g * 3] = R[0] / rl; rootDir[g * 3 + 1] = R[1] / rl; rootDir[g * 3 + 2] = R[2] / rl;
      // find length: relax a long strand in the smooth state and cut it at the style line
      var th = thetaOf(R);
      var cutY = fr ? 0.016 + (rng() - 0.5) * 0.006 : (-0.125 - 0.125 * sstep(75, 170, th) + (rng() - 0.5) * 0.018);
      var LMAX = fr ? 0.16 : 0.46, NL = 26;
      relax(R, nrm, fl, LMAX, NL, ST[2], fr, longTmp, g + 1, 1);
      var sg = LMAX / (NL - 1), L = -1;
      for (var k = 1; k < NL; k++) {
        var y0 = longTmp[(k - 1) * 3 + 1], y1 = longTmp[k * 3 + 1];
        if (k * sg > 0.02 && y1 < cutY && y0 >= cutY) { L = (k - 1 + (y0 - cutY) / Math.max(1e-6, y0 - y1)) * sg; break; }
      }
      if (L < 0) L = fr ? 0.09 : 0.30;
      L = Math.max(fr ? 0.025 : 0.04, Math.min(fr ? 0.14 : 0.42, L));
      segL[g] = L / (NN - 1);
      for (k = 1; k < NN; k++) restL[g * NN + k] = L * (Math.pow(k / (NN - 1), ARC_EXP) - Math.pow((k - 1) / (NN - 1), ARC_EXP));
      for (var s = 0; s < 3; s++) {
        relax(R, nrm, fl, L, NN, ST[s], fr, shp, g * 7 + s * 131 + 5, ARC_EXP);
        shapes.set(shp, (s * nG + g) * NN * 3);
        for (k = 0; k < NN; k++) lifts[(s * nG + g) * NN + k] = liftAt(L * Math.pow(k / (NN - 1), ARC_EXP), ST[s], fr);
      }
    }

    // neighbours (for drying / smoothing spread) and coarse regions (for serialize)
    var NBR = 5, nbr = new Int16Array(nG * NBR);
    (function () {
      var d = new Float32Array(nG);
      for (var a = 0; a < nG; a++) {
        for (var b = 0; b < nG; b++) {
          var dx = gRoots[a][0] - gRoots[b][0], dy = gRoots[a][1] - gRoots[b][1], dz = gRoots[a][2] - gRoots[b][2];
          d[b] = b === a ? 1e9 : dx * dx + dy * dy + dz * dz;
        }
        for (var j = 0; j < NBR; j++) {
          var best = 0, bv = 1e10;
          for (b = 0; b < nG; b++) if (d[b] < bv) { bv = d[b]; best = b; }
          nbr[a * NBR + j] = best; d[best] = 1e10;
        }
      }
    })();
    var NREG = 24, region = new Uint8Array(nG);
    (function () {
      var seeds = [0], md = new Float32Array(nG);
      for (var a = 0; a < nG; a++) md[a] = 1e9;
      while (seeds.length < Math.min(NREG, nG)) {
        var last = seeds[seeds.length - 1], best = 0, bv = -1;
        for (a = 0; a < nG; a++) {
          var dx = gRoots[a][0] - gRoots[last][0], dy = gRoots[a][1] - gRoots[last][1], dz = gRoots[a][2] - gRoots[last][2];
          md[a] = Math.min(md[a], dx * dx + dy * dy + dz * dz);
          if (md[a] > bv) { bv = md[a]; best = a; }
        }
        seeds.push(best);
      }
      for (a = 0; a < nG; a++) {
        var bi = 0, bd = 1e9;
        for (var j = 0; j < seeds.length; j++) {
          var e = gRoots[seeds[j]], ex = gRoots[a][0] - e[0], ey = gRoots[a][1] - e[1], ez = gRoots[a][2] - e[2], dd = ex * ex + ey * ey + ez * ez;
          if (dd < bd) { bd = dd; bi = j; }
        }
        region[a] = bi;
      }
      NREG = seeds.length;
    })();

    // ---------- cowlick (head-local construction)
    var cowRoot = W.slice(), cowN = ellNormal(cowRoot, [0, 0, 0]);
    var cowF = tangentize([1.0, 0.0, 0.35], cowN);
    var cowB = [cowN[1] * cowF[2] - cowN[2] * cowF[1], cowN[2] * cowF[0] - cowN[0] * cowF[2], cowN[0] * cowF[1] - cowN[1] * cowF[0]];
    var cowUp = new Float32Array(NCOW * NS * 3);    // 'up' pose, head-local
    var cowOff = new Float32Array(NCOW * 3);        // root offsets, head-local
    var cowLen = new Float32Array(NCOW);
    var gL = 0;
    (function () {
      var bd = 1e9;
      for (var a = 0; a < nG; a++) {
        if (gFringe[a]) continue;
        var dx = gRoots[a][0] - cowRoot[0], dy = gRoots[a][1] - cowRoot[1], dz = gRoots[a][2] - cowRoot[2], dd = dx * dx + dy * dy + dz * dz;
        if (gFlow[a * 3 + 2] < 0.1) dd += 0.01;
        if (dd < bd) { bd = dd; gL = a; }
      }
      var r = GF.rng(777);
      var cU = [cowN[0] * 0.5, cowN[1] * 0.5 + 1, cowN[2] * 0.5 - 0.3], cul = Math.sqrt(cU[0] * cU[0] + cU[1] * cU[1] + cU[2] * cU[2]);
      cU[0] /= cul; cU[1] /= cul; cU[2] /= cul;
      for (var c = 0; c < NCOW; c++) {
        var phi = r() * 6.28, rad = 0.001 + r() * 0.004;
        var ox = (cowF[0] * Math.cos(phi) + cowB[0] * Math.sin(phi)) * rad, oy = (cowF[1] * Math.cos(phi) + cowB[1] * Math.sin(phi)) * rad, oz = (cowF[2] * Math.cos(phi) + cowB[2] * Math.sin(phi)) * rad;
        cowOff[c * 3] = ox; cowOff[c * 3 + 1] = oy; cowOff[c * 3 + 2] = oz;
        var len = 0.070 + r() * 0.014; cowLen[c] = len;
        var beta = (c / (NCOW - 1) - 0.5) * 0.9 + (r() - 0.5) * 0.15;
        var a0 = 0.04 + r() * 0.10, a1 = 2.2 + r() * 0.4;
        var fx = cowF[0] * Math.cos(beta) + cowB[0] * Math.sin(beta), fy = cowF[1] * Math.cos(beta) + cowB[1] * Math.sin(beta), fz = cowF[2] * Math.cos(beta) + cowB[2] * Math.sin(beta);
        var px = cowRoot[0] + ox, py = cowRoot[1] + oy, pz = cowRoot[2] + oz, ds = len / (NS - 1);
        for (var j = 0; j < NS; j++) {
          var o = (c * NS + j) * 3;
          cowUp[o] = px; cowUp[o + 1] = py; cowUp[o + 2] = pz;
          var s = (j + 0.5) / (NS - 1), ang = a0 + (a1 - a0) * Math.pow(s, 4.0);
          var ca = Math.cos(ang), sa = Math.sin(ang);
          var lat = beta * 0.35 * s;
          px += (cU[0] * ca + fx * sa + cowB[0] * lat) * ds; py += (cU[1] * ca + fy * sa + cowB[1] * lat) * ds; pz += (cU[2] * ca + fz * sa + cowB[2] * lat) * ds;
        }
      }
    })();

    // ---------- state
    var P = new Float32Array(nG * NN * 3), Q = new Float32Array(nG * NN * 3), Vv = new Float32Array(nG * NN * 3);
    var TWt = new Float32Array(nG * NN * 3), LIFT = new Float32Array(nG * NN);
    var wet = new Float32Array(nG), fluff = new Float32Array(nG), smooth = new Float32Array(nG);
    var infG = new Float32Array(nG), liftG = new Float32Array(nG), inflN = new Float32Array(NN);
    var tex = new Float32Array(TW * NROWS * 4);
    var samp = new Float32Array(nG * NS * 3);     // up-sampled guide points (world)
    var cowW = new Float32Array(NCOW * NS * 3);   // cowlick world points
    var dataTex = new THREE.DataTexture(tex, TW, NROWS, THREE.RGBAFormat, THREE.FloatType);
    dataTex.minFilter = dataTex.magFilter = THREE.NearestFilter;
    dataTex.generateMipmaps = false; dataTex.needsUpdate = true;

    var M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), Mprev = new THREE.Matrix4(), Mpi = new THREE.Matrix4(), Dm = new THREE.Matrix4();
    var autoDry = 0;
    var inited = false, towel = 0, towelT = 0, simT = 0, lastDt = 1 / 30, prevAx = 0, prevAy = 0, prevAz = 0;
    var wind = { on: false, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1, s: 0, breeze: false, gust: 1 };
    var brushActiveT = -9, windActiveT = -9;
    var cow = { state: 'none', u: 0, uv: 0, ut: 0, w: 0, wv: 0, count: 0, pressT: -9, pressed: false };

    // up-sampling weights (Catmull-Rom, NN nodes → NS samples)
    var upI = new Int8Array(NS), upW = new Float32Array(NS * 4);
    for (var j = 0; j < NS; j++) {
      var fi = j / (NS - 1) * (NN - 1), ii = Math.min(Math.floor(fi), NN - 2), f = fi - ii, f2 = f * f, f3 = f2 * f;
      upI[j] = ii;
      upW[j * 4] = (-f3 + 2 * f2 - f) / 2; upW[j * 4 + 1] = (3 * f3 - 5 * f2 + 2) / 2; upW[j * 4 + 2] = (-3 * f3 + 4 * f2 + f) / 2; upW[j * 4 + 3] = (f3 - f2) / 2;
    }

    // ---------- transforms
    function readAnchor() {
      anchor.updateWorldMatrix(true, false);
      M.copy(anchor.matrixWorld);
      var e = M.elements, ok = true;
      for (var i = 0; i < 16; i++) if (!isFinite(e[i])) { ok = false; break; }
      if (!ok) M.identity();
      Mi.copy(M).invert();
    }
    var Me, Mie;
    function toWorld(x, y, z, arr, o) {
      arr[o] = Me[0] * x + Me[4] * y + Me[8] * z + Me[12];
      arr[o + 1] = Me[1] * x + Me[5] * y + Me[9] * z + Me[13];
      arr[o + 2] = Me[2] * x + Me[6] * y + Me[10] * z + Me[14];
    }

    // blended local target → world target (TWt) and per-node collision lift
    function computeTargets() {
      Me = M.elements;
      var gs = nG * NN * 3;
      for (var g = 0; g < nG; g++) {
        var w = wet[g], d = 1 - w, cf = d * fluff[g], cs = d - cf, cw = w;
        if (towel > 0.001) { cw = cw + (1 - cw) * towel; cf *= 1 - towel; cs *= 1 - towel; }
        var b = g * NN;
        for (var k = 0; k < NN; k++) {
          var o = (b + k) * 3;
          var x = shapes[o] * cw + shapes[gs + o] * cf + shapes[2 * gs + o] * cs;
          var y = shapes[o + 1] * cw + shapes[gs + o + 1] * cf + shapes[2 * gs + o + 1] * cs;
          var z = shapes[o + 2] * cw + shapes[gs + o + 2] * cf + shapes[2 * gs + o + 2] * cs;
          toWorld(x, y, z, TWt, o);
          var li = b + k;
          LIFT[li] = lifts[li] * cw + lifts[nG * NN + li] * cf + lifts[2 * nG * NN + li] * cs;
        }
      }
    }

    function windInfl(x, y, z) {
      if (!wind.on) return 0;
      if (wind.breeze) return wind.s * wind.gust;
      var vx = x - wind.ox, vy = y - wind.oy, vz = z - wind.oz;
      var al = vx * wind.dx + vy * wind.dy + vz * wind.dz;
      if (al <= 0.01 || al > 0.7) return 0;
      var r2 = vx * vx + vy * vy + vz * vz - al * al, ta = Math.sqrt(r2 > 0 ? r2 : 0) / al;
      if (ta >= 0.47) return 0;
      var fa = 1 - sstep(0.0, 0.47, ta);
      return fa * fa * (1 - sstep(0.15, 0.68, al)) * wind.s;
    }

    var cl = [0, 0, 0];
    function collideWorld(arr, o, L, tw, face) {
      var x = arr[o], y = arr[o + 1], z = arr[o + 2];
      cl[0] = Mie[0] * x + Mie[4] * y + Mie[8] * z + Mie[12];
      cl[1] = Mie[1] * x + Mie[5] * y + Mie[9] * z + Mie[13];
      cl[2] = Mie[2] * x + Mie[6] * y + Mie[10] * z + Mie[14];
      if (collide(cl, L, tw, face)) toWorld(cl[0], cl[1], cl[2], arr, o);
    }

    function settle() {
      readAnchor(); computeTargets();
      Me = M.elements; Mie = Mi.elements;
      P.set(TWt); Q.set(TWt); Vv.fill(0);
      for (var it = 0; it < 4; it++) {
        for (var g = 0; g < nG; g++) {
          var sg = segL[g];
          for (var k = 1; k < NN; k++) {
            var o = (g * NN + k) * 3;
            var dx = P[o] - P[o - 3], dy = P[o + 1] - P[o - 2], dz = P[o + 2] - P[o - 1], dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            sg = restL[o / 3]; P[o] = P[o - 3] + dx / dl * sg; P[o + 1] = P[o - 2] + dy / dl * sg; P[o + 2] = P[o - 1] + dz / dl * sg;
            collideWorld(P, o, Math.max(0.002, LIFT[g * NN + k] * 0.6), towel, !gFringe[g]);
          }
        }
      }
      Q.set(P);
      Mprev.copy(M); Mpi.copy(Mi);
      var e = M.elements; prevAx = e[12]; prevAy = e[13]; prevAz = e[14];
      cow.u = cow.state === 'up' ? 1 : 0; cow.uv = 0; cow.ut = cow.u; cow.w = 0; cow.wv = 0;
      inited = true;
      upsample(); updateCowlick(0); writeTexture();
    }

    // ---------- simulation step
    function simulate(dt, t) {
      Me = M.elements; Mie = Mi.elements;
      var n3 = nG * NN * 3, i, o;
      // carry most of the head motion rigidly; the rest becomes inertia (lag / sway)
      Dm.multiplyMatrices(M, Mpi);
      var de = Dm.elements, CARRY = 0.8;
      for (o = 0; o < n3; o += 3) {
        var x = P[o], y = P[o + 1], z = P[o + 2];
        P[o] += (de[0] * x + de[4] * y + de[8] * z + de[12] - x) * CARRY;
        P[o + 1] += (de[1] * x + de[5] * y + de[9] * z + de[13] - y) * CARRY;
        P[o + 2] += (de[2] * x + de[6] * y + de[10] * z + de[14] - z) * CARRY;
      }
      Q.set(P);
      var anyWind = false, idt = 1 / dt;
      for (var g = 0; g < nG; g++) {
        var w = wet[g], d = 1 - w, base = g * NN, sg = segL[g];
        var damp = Math.exp(-(2.6 + 5 * w) * dt);
        var gy = -(1.2 + 2.6 * w);
        var wAcc = (130 * d + 8 * w) * (wind.breeze ? 0.4 : 1), tAcc = (90 * d + 5 * w) * (wind.breeze ? 0.3 : 1);
        var kRel = 1 - Math.exp(-(24 - 10 * w) * dt);
        var maxInf = 0, sumInf = 0;
        // root
        o = base * 3;
        P[o] = TWt[o]; P[o + 1] = TWt[o + 1]; P[o + 2] = TWt[o + 2];
        // integrate
        for (var k = 1; k < NN; k++) {
          o = (base + k) * 3;
          var vx = Vv[o] * damp, vy = Vv[o + 1] * damp + gy * dt, vz = Vv[o + 2] * damp;
          var inf = windInfl(P[o], P[o + 1], P[o + 2]);
          inflN[k] = inf;
          if (inf > 0) {
            if (inf > maxInf) maxInf = inf;
            sumInf += inf;
            var nt = t * (wind.breeze ? 1.3 : 6.5);
            var tx = GF.noise2(nt + g * 0.73, k * 0.41) - 0.5, ty = GF.noise2(nt + 17.3 + g * 0.61, k * 0.37 + 5) - 0.5, tz = GF.noise2(nt + 41.1 + g * 0.57, k * 0.43 + 9) - 0.5;
            var sk = k / (NN - 1);
            vx += (wind.dx * wAcc + tx * 2 * tAcc) * inf * dt * sk;
            vy += (wind.dy * wAcc + ty * 2 * tAcc + 8 * d * (wind.breeze ? 0 : 1)) * inf * dt * sk;
            vz += (wind.dz * wAcc + tz * 2 * tAcc) * inf * dt * sk;
          }
          var vl = vx * vx + vy * vy + vz * vz;
          if (vl > 9) { vl = 3 / Math.sqrt(vl); vx *= vl; vy *= vl; vz *= vl; }
          P[o] += vx * dt; P[o + 1] += vy * dt; P[o + 2] += vz * dt;
        }
        // rest-shape springs (relative to the parent node + weak absolute) , length, collision
        for (k = 1; k < NN; k++) {
          o = (base + k) * 3;
          var sk2 = k / (NN - 1);
          var hold = 1 - 0.93 * inflN[k] * (1 - 0.8 * w);
          var kr = (k === 1 ? 0.9 : kRel) * hold;
          var ka = (1 - Math.exp(-(1.5 + 9 * (1 - sk2) * (1 - sk2)) * dt)) * hold;
          var tx2 = P[o - 3] + TWt[o] - TWt[o - 3], ty2 = P[o - 2] + TWt[o + 1] - TWt[o - 2], tz2 = P[o - 1] + TWt[o + 2] - TWt[o - 1];
          P[o] += (tx2 - P[o]) * kr; P[o + 1] += (ty2 - P[o + 1]) * kr; P[o + 2] += (tz2 - P[o + 2]) * kr;
          P[o] += (TWt[o] - P[o]) * ka; P[o + 1] += (TWt[o + 1] - P[o + 1]) * ka; P[o + 2] += (TWt[o + 2] - P[o + 2]) * ka;
          var dx = P[o] - P[o - 3], dy = P[o + 1] - P[o - 2], dz = P[o + 2] - P[o - 1], dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          sg = restL[o / 3]; P[o] = P[o - 3] + dx / dl * sg; P[o + 1] = P[o - 2] + dy / dl * sg; P[o + 2] = P[o - 1] + dz / dl * sg;
          collideWorld(P, o, Math.max(0.0025, LIFT[base + k] * 0.55), towel, !gFringe[g]);
          var nvx = (P[o] - Q[o]) * idt, nvy = (P[o + 1] - Q[o + 1]) * idt, nvz = (P[o + 2] - Q[o + 2]) * idt;
          var nl = nvx * nvx + nvy * nvy + nvz * nvz;
          if (nl > 9) { nl = 3 / Math.sqrt(nl); nvx *= nl; nvy *= nl; nvz *= nl; }
          Vv[o] = nvx; Vv[o + 1] = nvy; Vv[o + 2] = nvz;
        }
        infG[g] = 0.5 * maxInf + 0.5 * sumInf / (NN - 1);
        if (maxInf > 0.05) anyWind = true;
      }
      if (anyWind && !wind.breeze) windActiveT = t;
      // drying (directly blown ≈1.3 s), drying spreads to neighbours while the dryer works on the head
      var spreadOn = (t - windActiveT) < 0.3, brushOn = (t - brushActiveT) < 0.3;
      var spW = 1 - Math.exp(-0.35 * dt), spS = 1 - Math.exp(-1.1 * dt);
      for (g = 0; g < nG; g++) {
        var wg = wet[g];
        if (!wind.breeze) wg -= dt * infG[g] / 1.3;
        if (autoDry > 0) wg -= dt * autoDry;
        if (spreadOn) {
          var av = 0; for (var j = 0; j < NBR; j++) av += wet[nbr[g * NBR + j]]; av /= NBR;
          if (av < wg) wg += (av - wg) * spW;
          wg -= dt * 0.012;
        }
        wet[g] = wg < 0 ? 0 : wg;
        if (brushOn) {
          var as = 0; for (j = 0; j < NBR; j++) as += smooth[nbr[g * NBR + j]]; as /= NBR;
          if (as > smooth[g]) smooth[g] += (as - smooth[g]) * spS;
          smooth[g] = Math.min(1, smooth[g] + dt * 0.03);
        }
        var fmax = 1 - smooth[g];
        var ft = (1 - wet[g]) * fmax;
        if (fluff[g] < ft) fluff[g] = ft;
        if (fluff[g] > fmax) fluff[g] = fmax;
      }
    }

    // NN nodes → NS samples per guide (world)
    function upsample() {
      for (var g = 0; g < nG; g++) {
        var b = g * NN * 3;
        for (var j = 0; j < NS; j++) {
          var i1 = upI[j], o = (g * NS + j) * 3;
          for (var c = 0; c < 3; c++) {
            var p1 = P[b + i1 * 3 + c], p2 = P[b + (i1 + 1) * 3 + c];
            var p0 = i1 > 0 ? P[b + (i1 - 1) * 3 + c] : 2 * p1 - p2;
            var p3 = i1 + 2 < NN ? P[b + (i1 + 2) * 3 + c] : 2 * p2 - p1;
            samp[o + c] = p0 * upW[j * 4] + p1 * upW[j * 4 + 1] + p2 * upW[j * 4 + 2] + p3 * upW[j * 4 + 3];
          }
        }
      }
    }

    // ---------- cowlick
    var cowLy = [0, 0, 0];
    function updateCowlick(dt) {
      Me = M.elements;
      // spring
      var n = dt > 0 ? Math.max(1, Math.ceil(dt / 0.016)) : 0, h = n ? dt / n : 0;
      if (cow.state === 'pinned') cow.ut = -0.03;
      else if (cow.state === 'none') cow.ut = 0;
      else cow.ut = (simT - cow.pressT) < 0.25 ? 0.06 : 1;
      if (cow.state === 'up' && cow.pressed && (simT - cow.pressT) >= 0.25) { cow.pressed = false; doPop(); }
      for (var s = 0; s < n; s++) {
        var K = cow.ut < 0.5 ? 700 : 380;
        cow.uv += (K * (cow.ut - cow.u) - 9 * cow.uv) * h; cow.u += cow.uv * h;
        cow.wv += (-300 * cow.w - 5 * cow.wv) * h; cow.w += cow.wv * h;
      }
      if (!isFinite(cow.u) || !isFinite(cow.w)) { cow.u = cow.ut; cow.uv = 0; cow.w = 0; cow.wv = 0; }
      var u = Math.max(-0.15, Math.min(1.4, cow.u));
      // lying pose follows the guide gL (translated to the cowlick root)
      var gb = gL * NS * 3, Lg = segL[gL] * (NN - 1);
      var rootW0 = 0, rootW1 = 0, rootW2 = 0;
      toWorld(cowRoot[0], cowRoot[1], cowRoot[2], cowLy, 0);
      rootW0 = cowLy[0] - samp[gb]; rootW1 = cowLy[1] - samp[gb + 1]; rootW2 = cowLy[2] - samp[gb + 2];
      var bx = Me[0] * cowB[0] + Me[4] * cowB[1] + Me[8] * cowB[2], by = Me[1] * cowB[0] + Me[5] * cowB[1] + Me[9] * cowB[2], bz = Me[2] * cowB[0] + Me[6] * cowB[1] + Me[10] * cowB[2];
      for (var c = 0; c < NCOW; c++) {
        var ox = Me[0] * cowOff[c * 3] + Me[4] * cowOff[c * 3 + 1] + Me[8] * cowOff[c * 3 + 2];
        var oy = Me[1] * cowOff[c * 3] + Me[5] * cowOff[c * 3 + 1] + Me[9] * cowOff[c * 3 + 2];
        var oz = Me[2] * cowOff[c * 3] + Me[6] * cowOff[c * 3 + 1] + Me[10] * cowOff[c * 3 + 2];
        var frac = Math.pow(Math.min(1, cowLen[c] / Math.max(0.01, Lg)), 1 / ARC_EXP);
        for (var j = 0; j < NS; j++) {
          var sj = j / (NS - 1), fi = sj * frac * (NS - 1), i0 = Math.min(NS - 2, Math.floor(fi)), ff = fi - i0;
          var a = gb + i0 * 3;
          var lx = samp[a] + (samp[a + 3] - samp[a]) * ff + rootW0 * (1 - sj * 0.5) + ox;
          var ly = samp[a + 1] + (samp[a + 4] - samp[a + 1]) * ff + rootW1 * (1 - sj * 0.5) + oy;
          var lz = samp[a + 2] + (samp[a + 5] - samp[a + 2]) * ff + rootW2 * (1 - sj * 0.5) + oz;
          var q = (c * NS + j) * 3;
          var ux = cowUp[q], uy = cowUp[q + 1], uz = cowUp[q + 2];
          var wx = Me[0] * ux + Me[4] * uy + Me[8] * uz + Me[12], wy = Me[1] * ux + Me[5] * uy + Me[9] * uz + Me[13], wz = Me[2] * ux + Me[6] * uy + Me[10] * uz + Me[14];
          var px = lx + (wx - lx) * u, py = ly + (wy - ly) * u, pz = lz + (wz - lz) * u;
          var s15 = Math.pow(sj, 1.5) * c01(u);
          px += bx * cow.w * s15 * 0.03; py += by * cow.w * s15 * 0.03; pz += bz * cow.w * s15 * 0.03;
          if (wind.on && j > 0 && u > 0.2) {
            var inf = windInfl(px, py, pz) * c01(u), s2 = sj * sj;
            if (inf > 0) {
              var nt = simT * 7 + c * 1.3;
              var tt = GF.noise2(nt, j * 0.2) - 0.5, t2 = GF.noise2(nt + 9.1, j * 0.2 + 3) - 0.5;
              px += (wind.dx * 0.03 + bx * tt * 0.04) * inf * s2; py += (wind.dy * 0.03 + t2 * 0.03) * inf * s2; pz += (wind.dz * 0.03 + bz * tt * 0.04) * inf * s2;
            }
          }
          cowW[q] = px; cowW[q + 1] = py; cowW[q + 2] = pz;
        }
      }
    }
    function doPop() {
      cow.state = 'up'; cow.ut = 1; cow.uv += 9; cow.wv += (cow.count % 2 ? -1 : 1) * 3.5;
      cow.count++;
      if (typeof api.onPop === 'function') { try { api.onPop(cow.count); } catch (e) { /* game callback errors are not ours */ } }
    }

    function writeTexture() {
      var g, j, o, s;
      for (g = 0; g < nG; g++) {
        for (j = 0; j < NS; j++) {
          o = (g * TW + j) * 4; s = (g * NS + j) * 3;
          tex[o] = samp[s]; tex[o + 1] = samp[s + 1]; tex[o + 2] = samp[s + 2]; tex[o + 3] = 1;
        }
        o = (g * TW + NS) * 4;
        tex[o] = wet[g]; tex[o + 1] = fluff[g]; tex[o + 2] = smooth[g]; tex[o + 3] = 0;
      }
      for (var c = 0; c < NCOW; c++) {
        g = nG + c;
        for (j = 0; j < NS; j++) {
          o = (g * TW + j) * 4; s = (c * NS + j) * 3;
          tex[o] = cowW[s]; tex[o + 1] = cowW[s + 1]; tex[o + 2] = cowW[s + 2]; tex[o + 3] = 1;
        }
        o = (g * TW + NS) * 4;
        tex[o] = wet[gL]; tex[o + 1] = fluff[gL]; tex[o + 2] = smooth[gL]; tex[o + 3] = 0;
      }
      dataTex.needsUpdate = true;
      cap.matrix.copy(M); cap.matrixWorldNeedsUpdate = true;
      U.uHeadMat.value.copy(M); U.uHeadInv.value.copy(Mi);
      if (wind.on) {
        U.uWindO.value.set(wind.ox, wind.oy, wind.oz, wind.s * (wind.breeze ? wind.gust : 1));
        U.uWindD.value.set(wind.dx, wind.dy, wind.dz, wind.breeze ? 1 : 0);
      } else U.uWindO.value.w = 0;
    }

    // ---------- render strands
    var U = {
      uHairTex: { value: dataTex },
      uHeadMat: { value: new THREE.Matrix4() },
      uHeadInv: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uWindO: { value: new THREE.Vector4(0, 0, 0, 0) },
      uWindD: { value: new THREE.Vector4(0, 0, -1, 0) },
      uPix: { value: 0.001 },
      uWidthMul: { value: 1 },
      uStrandTex: { value: null }
    };
    var Udepth = { uWidthMul: { value: 2.2 } };

    var strandTex = GF.canvasTex(64, 256, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var r = GF.rng(4242);
      var nh = 9;
      for (var i = 0; i < nh; i++) {
        var x0 = 5 + (i + 0.5) * (w - 10) / nh + (r() - 0.5) * 3, k = 1 + Math.floor(r() * 3), ph = r() * 6.28, amp = 0.6 + r() * 1.6;
        var lw = 2.8 + r() * 2.4, br = Math.floor(70 + r() * 185), sh = Math.floor(r() * 255);
        ctx.strokeStyle = 'rgb(' + br + ',' + sh + ',' + Math.floor(20 + r() * 235) + ')'; ctx.lineWidth = lw; ctx.lineCap = 'butt';
        ctx.beginPath();
        for (var y = -4; y <= h + 4; y += 4) {
          var x = x0 + Math.sin(y / h * 6.2832 * k + ph) * amp;
          if (y === -4) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }, { srgb: false, repeat: [1, 1] });
    strandTex.wrapS = THREE.ClampToEdgeWrapping;
    U.uStrandTex.value = strandTex;

    // render strand roots
    var nStr = low ? 760 : 1530;
    var strands = [];
    (function () {
      var target = nStr, nf = Math.round(target / (nG / nFib) / 0.75), roots = [], i, r = GF.rng(99), tries = 0;
      while (roots.length < target && tries < 4) {
        roots.length = 0;
        for (i = 0; i < nf; i++) {
          fibDir(i, nf, tmpD);
          tmpD[0] += (r() - 0.5) * 0.02; tmpD[1] += (r() - 0.5) * 0.02; tmpD[2] += (r() - 0.5) * 0.02;
          var p = ellOnDir(tmpD[0], tmpD[1], tmpD[2], [0, 0, 0]);
          if (inRegion(p, 0.002) && r() < 0.6 + 0.4 * sstep(0.02, 0.085, p[1])) roots.push(p);
        }
        nf = Math.round(nf * 1.12); tries++;
      }
      while (roots.length > target) roots.splice(Math.floor(r() * roots.length), 1);
      var dd = new Float32Array(nG);
      for (i = 0; i < roots.length; i++) {
        var p2 = roots[i], fr = isFringe(p2), cnt = 0;
        ellNormal(p2, nrm); flowDir(p2, nrm, fr, fl);
        for (var g = 0; g < nG; g++) {
          var dx = p2[0] - gRoots[g][0], dy = p2[1] - gRoots[g][1], dz = p2[2] - gRoots[g][2];
          var fd = fl[0] * gFlow[g * 3] + fl[1] * gFlow[g * 3 + 1] + fl[2] * gFlow[g * 3 + 2];
          dd[g] = (gFringe[g] === (fr ? 1 : 0)) ? Math.sqrt(dx * dx + dy * dy + dz * dz) * (1 + 3 * (1 - fd)) : 1e9;
          if (dd[g] < 1e8) cnt++;
        }
        if (cnt < 4) for (g = 0; g < nG; g++) { var ex = p2[0] - gRoots[g][0], ey = p2[1] - gRoots[g][1], ez = p2[2] - gRoots[g][2]; dd[g] = Math.sqrt(ex * ex + ey * ey + ez * ez); }
        var idx = [0, 0, 0, 0], dv = [0, 0, 0, 0];
        for (var m = 0; m < 4; m++) {
          var bi = 0, bv = 1e10;
          for (g = 0; g < nG; g++) if (dd[g] < bv) { bv = dd[g]; bi = g; }
          idx[m] = bi; dv[m] = bv; dd[bi] = 1e10;
        }
        var w0 = Math.pow(Math.max(0, 1 - dv[0] / dv[3]), 2) + 1e-4, w1 = Math.pow(Math.max(0, 1 - dv[1] / dv[3]), 2), w2 = Math.pow(Math.max(0, 1 - dv[2] / dv[3]), 2), ws = w0 + w1 + w2;
        var ang = r() * 6.2832, rad = Math.sqrt(r());
        var flag = fr ? -1 : (r() < 0.06 ? 2 : 0);
        strands.push({ root: [p2[0] + nrm[0] * 0.0022, p2[1] + nrm[1] * 0.0022, p2[2] + nrm[2] * 0.0022], g: [idx[0], idx[1], idx[2]], w: [w0 / ws, w1 / ws, w2 / ws], len: fr ? 0.9 + r() * 0.1 : 0.84 + r() * 0.16, flag: flag,
          rr: [Math.pow(r(), 0.7), Math.cos(ang) * rad, Math.sin(ang) * rad, r()], wd: (fr ? 0.0026 : 0.0031) * (0.8 + r() * 0.4) * (low ? 1.35 : 1), tint: r() });
      }
      // shuffle so that a draw range keeps an even coverage
      for (i = strands.length - 1; i > 0; i--) { var jj = Math.floor(r() * (i + 1)), tmp = strands[i]; strands[i] = strands[jj]; strands[jj] = tmp; }
      var cs = [];
      for (var c = 0; c < NCOW; c++) for (var q = 0; q < COW_PER; q++) {
        var a2 = r() * 6.2832, rd = Math.sqrt(r());
        cs.push({ root: [cowRoot[0] + cowOff[c * 3], cowRoot[1] + cowOff[c * 3 + 1], cowRoot[2] + cowOff[c * 3 + 2]], g: [nG + c, nG + c, nG + c], w: [1, 0, 0], len: 0.86 + r() * 0.14, flag: 1, rr: [0.5 + r() * 0.5, Math.cos(a2) * rd, Math.sin(a2) * rd, r()], wd: 0.0022 * (0.8 + r() * 0.4), tint: r() });
      }
      strands = cs.concat(strands);
    })();
    var nCowStr = NCOW * COW_PER, nAll = strands.length;
    var VPS = (SEGS + 1) * 2, nV = nAll * VPS;
    var aG = new Float32Array(nV * 3), aW = new Float32Array(nV * 3), aS = new Float32Array(nV * 4), aR = new Float32Array(nV * 4), aQ = new Float32Array(nV * 2), aRoot = new Float32Array(nV * 3);
    var idxArr = nV > 65535 ? new Uint32Array(nAll * SEGS * 6) : new Uint16Array(nAll * SEGS * 6);
    (function () {
      var v = 0, ii = 0;
      for (var si = 0; si < nAll; si++) {
        var st = strands[si], vb = v;
        for (var r = 0; r <= SEGS; r++) {
          for (var sd = -1; sd <= 1; sd += 2) {
            aG[v * 3] = st.g[0]; aG[v * 3 + 1] = st.g[1]; aG[v * 3 + 2] = st.g[2];
            aW[v * 3] = st.w[0]; aW[v * 3 + 1] = st.w[1]; aW[v * 3 + 2] = st.w[2];
            aS[v * 4] = r / SEGS; aS[v * 4 + 1] = sd; aS[v * 4 + 2] = st.len; aS[v * 4 + 3] = st.flag;
            aR[v * 4] = st.rr[0]; aR[v * 4 + 1] = st.rr[1]; aR[v * 4 + 2] = st.rr[2]; aR[v * 4 + 3] = st.rr[3];
            aQ[v * 2] = st.wd; aQ[v * 2 + 1] = st.tint;
            aRoot[v * 3] = st.root[0]; aRoot[v * 3 + 1] = st.root[1]; aRoot[v * 3 + 2] = st.root[2];
            v++;
          }
        }
        for (r = 0; r < SEGS; r++) {
          var a = vb + r * 2;
          idxArr[ii++] = a; idxArr[ii++] = a + 1; idxArr[ii++] = a + 2;
          idxArr[ii++] = a + 1; idxArr[ii++] = a + 3; idxArr[ii++] = a + 2;
        }
      }
    })();
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    geo.setAttribute('aG', new THREE.BufferAttribute(aG, 3));
    geo.setAttribute('aW', new THREE.BufferAttribute(aW, 3));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
    geo.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 2));
    geo.setAttribute('aRoot', new THREE.BufferAttribute(aRoot, 3));
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e4, -1e4, -1e4), new THREE.Vector3(1e4, 1e4, 1e4));

    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.38 });
    mat.alphaToCoverage = !low;
    mat.envMapIntensity = 0.4;
    mat.defines = { HAIR_COLOR: '' };
    mat.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <beginnormal_vertex>', 'hairCompute();\nvec3 objectNormal = hN;')
        .replace('#include <begin_vertex>', 'vec3 transformed = hP;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(0.58, 0.45, vHI.z), 0.28, vHI.x);')
        .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= mix(0.12, 0.7, vHI.x * vHI.x);\n#endif')
        .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + FRAG_LIGHT);
    };
    mat.customProgramCacheKey = function () { return 'gf-hair-strands-1'; };

    var depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    depthMat.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.uniforms.uWidthMul = Udepth.uWidthMul;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <begin_vertex>', 'hairCompute();\nvec3 transformed = hP;');
    };
    depthMat.customProgramCacheKey = function () { return 'gf-hair-depth-1'; };

    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'hairStrands';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = depthMat;
    var szTmp = new THREE.Vector2();
    mesh.onBeforeRender = function (renderer, scene, camera) {
      var h = 0, rt = renderer.getRenderTarget();
      if (rt) h = rt.height; else { renderer.getDrawingBufferSize(szTmp); h = szTmp.y; }
      var p5 = camera.projectionMatrix.elements[5];
      if (h > 0 && p5 > 0 && !camera.isOrthographicCamera) U.uPix.value = 2 / (p5 * h);
      else U.uPix.value = 0;
    };

    // ---------- dark under-cap on the scalp
    var cap = (function () {
      var nu = low ? 40 : 64, nv = low ? 28 : 44, pos = [], ind = [], ok = [], vi = [], p = [0, 0, 0];
      for (var a = 0; a <= nv; a++) {
        for (var b = 0; b <= nu; b++) {
          var th = a / nv * Math.PI, ph = b / nu * Math.PI * 2;
          var dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = -Math.sin(th) * Math.cos(ph);
          ellOnDir(dx, dy, dz, p);
          var n = ellNormal(p, [0, 0, 0]);
          var inside = inRegion(p, 0.004);
          ok.push(inside);
          vi.push(pos.length / 3);
          pos.push(p[0] + n[0] * 0.0006, p[1] + n[1] * 0.0006, p[2] + n[2] * 0.0006);
        }
      }
      for (a = 0; a < nv; a++) for (b = 0; b < nu; b++) {
        var i0 = a * (nu + 1) + b, i1 = i0 + 1, i2 = i0 + nu + 1, i3 = i2 + 1;
        if (ok[i0] && ok[i2] && ok[i1]) ind.push(i0, i1, i2);
        if (ok[i1] && ok[i2] && ok[i3]) ind.push(i1, i3, i2);
      }
      var cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      cg.setIndex(ind);
      cg.computeVertexNormals();
      var cm = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
      cm.color.setRGB(0.0075, 0.0047, 0.0032);
      var wn = ellNormal(W, [0, 0, 0]), e1 = tangentize([0, 0, -1], wn), e2 = [wn[1] * e1[2] - wn[2] * e1[1], wn[2] * e1[0] - wn[0] * e1[2], wn[0] * e1[1] - wn[1] * e1[0]];
      var cu = { uW: { value: new THREE.Vector3(W[0], W[1], W[2]) }, uE1: { value: new THREE.Vector3(e1[0], e1[1], e1[2]) }, uE2: { value: new THREE.Vector3(e2[0], e2[1], e2[2]) } };
      cm.onBeforeCompile = function (sh) {
        for (var k in cu) sh.uniforms[k] = cu[k];
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCapL = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapL;\nuniform vec3 uW; uniform vec3 uE1; uniform vec3 uE2;')
          .replace('#include <map_fragment>', [
            'vec3 cd = vCapL - uW; float ca = atan(dot(cd, uE2), dot(cd, uE1)); float cr = length(cd);',
            'float ct = ca / 6.2832 * 300.0 + sin(cr * 70.0 + ca * 3.0) * 0.8;',
            'float cid = floor(ct), cf = fract(ct);',
            'float ch = fract(sin(cid * 12.9898) * 43758.5453);',
            'float cline = smoothstep(0.0, 0.35, cf) * smoothstep(1.0, 0.65, cf);',
            'diffuseColor.rgb *= mix(0.5, 1.35, ch) * mix(0.55, 1.0, cline);'].join('\n'));
      };
      cm.customProgramCacheKey = function () { return 'gf-hair-cap-1'; };
      var m = new THREE.Mesh(cg, cm);
      m.name = 'hairCap';
      m.matrixAutoUpdate = false;
      m.castShadow = true; m.receiveShadow = true;
      return m;
    })();

    var group = new THREE.Group();
    group.name = 'hair';
    group.add(cap, mesh);

    function setDetail(f) {
      f = Math.max(0.4, Math.min(1, num(f, 1)));
      var n = nCowStr + Math.round((nAll - nCowStr) * f);
      geo.setDrawRange(0, n * SEGS * 6);
    }

    // ---------- outer hair volume (for surfacePoint)
    function updateLiftG() {
      for (var g = 0; g < nG; g++) {
        var d = 1 - wet[g];
        liftG[g] = 0.004 + d * (fluff[g] * 0.034 + (1 - fluff[g]) * 0.007) + (1 - d) * 0.001;
      }
    }
    function localLift(x, y, z) {
      var l = Math.sqrt(x * x + y * y + z * z) || 1, dx = x / l, dy = y / l, dz = z / l, sw = 0, sl = 0;
      for (var g = 0; g < nG; g++) {
        var c = dx * rootDir[g * 3] + dy * rootDir[g * 3 + 1] + dz * rootDir[g * 3 + 2];
        if (c < 0.6) continue;
        var w = Math.exp((c - 1) * 30);
        sw += w; sl += w * liftG[g];
      }
      return sw > 1e-6 ? sl / sw : 0.006;
    }
    function sdBox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
      var qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
      var ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
    }
    function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
    function sdf(x, y, z) {
      var L = localLift(x, y, z);
      var rx = SK[0] + L, ry = SK[1] + L, rz = SK[2] + L;
      var k0 = Math.sqrt((x / rx) * (x / rx) + (y / ry) * (y / ry) + (z / rz) * (z / rz));
      var k1 = Math.sqrt((x / (rx * rx)) * (x / (rx * rx)) + (y / (ry * ry)) * (y / (ry * ry)) + (z / (rz * rz)) * (z / (rz * rz)));
      var e = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -0.05;
      var zb = 0.095 + L * 0.9;
      var back = sdBox(x, y, z, 0, -0.14, (0.03 + zb) / 2, 0.078 + L * 0.8, 0.12, (zb - 0.03) / 2, 0.012);
      var sides = sdBox(x, y, z, 0, -0.08, 0.025, 0.084 + L, 0.08, 0.055, 0.015);
      sides = Math.max(sides, 0.055 - Math.abs(x));
      return smin(e, Math.min(back, sides), 0.03);
    }
    var rO = [0, 0, 0], rD = [0, 0, 0];
    function surfacePoint(origin, dir, out) {
      if (!origin || !dir || !out) return false;
      if (!inited) settle();
      Mie = Mi.elements; Me = M.elements;
      var ox = num(origin.x, NaN), oy = num(origin.y, NaN), oz = num(origin.z, NaN), dx = num(dir.x, NaN), dy = num(dir.y, NaN), dz = num(dir.z, NaN);
      if (!isFinite(ox + oy + oz + dx + dy + dz)) return false;
      rO[0] = Mie[0] * ox + Mie[4] * oy + Mie[8] * oz + Mie[12]; rO[1] = Mie[1] * ox + Mie[5] * oy + Mie[9] * oz + Mie[13]; rO[2] = Mie[2] * ox + Mie[6] * oy + Mie[10] * oz + Mie[14];
      rD[0] = Mie[0] * dx + Mie[4] * dy + Mie[8] * dz; rD[1] = Mie[1] * dx + Mie[5] * dy + Mie[9] * dz; rD[2] = Mie[2] * dx + Mie[6] * dy + Mie[10] * dz;
      var dl = Math.sqrt(rD[0] * rD[0] + rD[1] * rD[1] + rD[2] * rD[2]); if (dl < 1e-9) return false;
      rD[0] /= dl; rD[1] /= dl; rD[2] /= dl;
      updateLiftG();
      // bounding sphere
      var cx = 0, cy = -0.09, cz = 0.02, BR = 0.30;
      var lx = rO[0] - cx, ly = rO[1] - cy, lz = rO[2] - cz;
      var bq = lx * rD[0] + ly * rD[1] + lz * rD[2], cq = lx * lx + ly * ly + lz * lz - BR * BR, disc = bq * bq - cq;
      if (disc < 0) return false;
      var sq = Math.sqrt(disc), t0 = Math.max(0, -bq - sq), t1 = -bq + sq;
      if (t1 < 0) return false;
      var t = t0, hit = false;
      for (var i = 0; i < 110; i++) {
        var x = rO[0] + rD[0] * t, y = rO[1] + rD[1] * t, z = rO[2] + rD[2] * t;
        var f = sdf(x, y, z);
        if (f < 0.0006) { hit = true; break; }
        t += Math.max(f * 0.85, 0.0007);
        if (t > t1) break;
      }
      if (!hit) return false;
      var px = rO[0] + rD[0] * t, py = rO[1] + rD[1] * t, pz = rO[2] + rD[2] * t, e = 0.002;
      var nx = sdf(px + e, py, pz) - sdf(px - e, py, pz), ny = sdf(px, py + e, pz) - sdf(px, py - e, pz), nz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (!out.position) out.position = new THREE.Vector3();
      if (!out.normal) out.normal = new THREE.Vector3();
      out.position.set(Me[0] * px + Me[4] * py + Me[8] * pz + Me[12], Me[1] * px + Me[5] * py + Me[9] * pz + Me[13], Me[2] * px + Me[6] * py + Me[10] * pz + Me[14]);
      out.normal.set(Me[0] * nx + Me[4] * ny + Me[8] * nz, Me[1] * nx + Me[5] * ny + Me[9] * nz, Me[2] * nx + Me[6] * ny + Me[10] * nz).normalize();
      return true;
    }

    // ---------- public
    function avg(a) { var s = 0; for (var i = 0; i < nG; i++) s += a[i]; return s / nG; }
    function setStates(w, f, s) { for (var g = 0; g < nG; g++) { wet[g] = w; fluff[g] = f; smooth[g] = s; } }

    function update(dt, t) {
      dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 0.05) dt = 0.05;
      simT = (typeof t === 'number' && isFinite(t)) ? t : simT + dt;
      U.uTime.value = simT % 1000;
      towel += (towelT - towel) * (1 - Math.exp(-6 * dt));
      if (Math.abs(towel - towelT) < 0.002) towel = towelT;
      if (wind.breeze) wind.gust = 0.55 + 0.45 * GF.noise2(simT * 0.35, 3.7) + 0.25 * (GF.noise2(simT * 1.7, 8.1) - 0.5);
      if (!inited) { settle(); return; }
      readAnchor();
      var e = M.elements, jx = e[12] - prevAx, jy = e[13] - prevAy, jz = e[14] - prevAz;
      if (jx * jx + jy * jy + jz * jz > 0.09) { settle(); return; }
      prevAx = e[12]; prevAy = e[13]; prevAz = e[14];
      if (dt > 0) {
        lastDt = dt;
        computeTargets();
        simulate(dt, simT);
        var bad = false;
        for (var i = 0; i < P.length; i += 7) if (!(P[i] === P[i])) { bad = true; break; }
        if (bad) { settle(); return; }
      }
      Mprev.copy(M); Mpi.copy(Mi);
      upsample();
      updateCowlick(dt);
      writeTexture();
    }

    function setWind(origin, dir, strength) {
      var s = c01(num(strength, 0));
      if (!origin || !dir || s <= 0) { wind.on = false; wind.s = 0; return; }
      var dx = num(dir.x, 0), dy = num(dir.y, 0), dz = num(dir.z, 0), l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var ox = num(origin.x, NaN), oy = num(origin.y, NaN), oz = num(origin.z, NaN);
      if (l < 1e-6 || !isFinite(ox + oy + oz)) { wind.on = false; return; }
      wind.on = true; wind.s = s;
      wind.ox = ox; wind.oy = oy; wind.oz = oz; wind.dx = dx / l; wind.dy = dy / l; wind.dz = dz / l;
      var e = anchor.matrixWorld.elements, hx = e[12] - ox, hy = e[13] - oy, hz = e[14] - oz;
      wind.breeze = (hx * hx + hy * hy + hz * hz) > 1.0;
    }

    function brush(point, vel, radius) {
      if (!point || !inited) return 0;
      var px = num(point.x, NaN), py = num(point.y, NaN), pz = num(point.z, NaN);
      if (!isFinite(px + py + pz)) return 0;
      var vx = vel ? num(vel.x, 0) : 0, vy = vel ? num(vel.y, 0) : 0, vz = vel ? num(vel.z, 0) : 0;
      var sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > 3) { vx *= 3 / sp; vy *= 3 / sp; vz *= 3 / sp; sp = 3; }
      var r = Math.max(0.005, Math.min(0.2, num(radius, 0.035))), r2 = r * r, dt = lastDt, contact = 0;
      var gain = Math.min(sp, 1.2) * 9.0 * dt;
      for (var g = 0; g < nG; g++) {
        var best = 0, base = g * NN, re = r + Math.min(0.03, LIFT[base + NN - 1] * 0.8), re2 = re * re;
        for (var k = 1; k < NN; k++) {
          var o = (base + k) * 3;
          var ax = P[o - 3], ay = P[o - 2], az = P[o - 1], sx = P[o] - ax, sy = P[o + 1] - ay, sz = P[o + 2] - az;
          var tt = ((px - ax) * sx + (py - ay) * sy + (pz - az) * sz) / (sx * sx + sy * sy + sz * sz + 1e-12);
          tt = tt < 0 ? 0 : (tt > 1 ? 1 : tt);
          var dx = ax + sx * tt - px, dy = ay + sy * tt - py, dz = az + sz * tt - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < re2) {
            var c = 1 - Math.sqrt(d2) / re;
            if (c > best) best = c;
            var dr = c * 0.45 * dt * tt;
            P[o] += vx * dr; P[o + 1] += vy * dr; P[o + 2] += vz * dr;
          }
        }
        if (best > 0) {
          smooth[g] = Math.min(1, smooth[g] + Math.sqrt(best) * gain);
          if (fluff[g] > 1 - smooth[g]) fluff[g] = 1 - smooth[g];
          if (best > contact) contact = best;
        }
      }
      if (contact > 0 && sp > 0.03) brushActiveT = simT;
      // cowlick under the brush
      if (cow.state === 'up') {
        var rr = r + 0.02, hitC = false;
        for (var c2 = 0; c2 < NCOW && !hitC; c2 += 2) for (var j = 4; j < NS; j += 4) {
          var q = (c2 * NS + j) * 3, ex = cowW[q] - px, ey = cowW[q + 1] - py, ez = cowW[q + 2] - pz;
          if (ex * ex + ey * ey + ez * ez < rr * rr) { hitC = true; break; }
        }
        if (hitC) { cow.pressed = true; cow.pressT = simT; contact = Math.max(contact, 0.6); }
      }
      return contact;
    }

    function setPreset(name) {
      if (name === 'wet') setStates(1, 0, 0);
      else if (name === 'fluffy') setStates(0, 1, 0);
      else if (name === 'sleek') setStates(0, 0, 1);
      else return;
      settle();
    }

    function serialize() {
      var w = [], f = [], s = [], cnt = [], i;
      for (i = 0; i < NREG; i++) { w.push(0); f.push(0); s.push(0); cnt.push(0); }
      for (var g = 0; g < nG; g++) { var r = region[g]; w[r] += wet[g]; f[r] += fluff[g]; s[r] += smooth[g]; cnt[r]++; }
      for (i = 0; i < NREG; i++) { var n = cnt[i] || 1; w[i] = Math.round(w[i] / n * 100) / 100; f[i] = Math.round(f[i] / n * 100) / 100; s[i] = Math.round(s[i] / n * 100) / 100; }
      return { v: 1, w: w, f: f, s: s, c: cow.state, n: cow.count };
    }
    function restore(obj) {
      try {
        if (!obj || typeof obj !== 'object') return false;
        var A = function (a) { return Array.isArray(a) ? a : null; };
        var w = A(obj.w), f = A(obj.f), s = A(obj.s);
        for (var g = 0; g < nG; g++) {
          var r = region[g];
          if (w && r < w.length) wet[g] = c01(num(w[r], wet[g]));
          if (s && r < s.length) smooth[g] = c01(num(s[r], smooth[g]));
          if (f && r < f.length) fluff[g] = c01(num(f[r], fluff[g]));
          if (fluff[g] > 1 - smooth[g]) fluff[g] = 1 - smooth[g];
        }
        if (obj.c === 'none' || obj.c === 'up' || obj.c === 'pinned') { cow.state = obj.c; cow.pressed = false; }
        cow.count = Math.max(0, Math.floor(num(obj.n, cow.count)));
        settle();
        return true;
      } catch (e) { return false; }
    }

    var cowlick = {
      get state() { return cow.state; },
      pop: function () { cow.pressed = false; doPop(); },
      pin: function () { cow.state = 'pinned'; cow.pressed = false; },
      unpin: function () { if (cow.state === 'pinned') { cow.pressed = false; doPop(); } },
      tip: function (out) {
        out = out || new THREE.Vector3();
        if (!inited) settle();
        var q = ((NCOW >> 1) * NS + NS - 1) * 3;
        return out.set(cowW[q], cowW[q + 1], cowW[q + 2]);
      }
    };

    var api = {
      group: group,
      update: update,
      setWind: setWind,
      brush: brush,
      get wetness() { return avg(wet); },
      get fluff() { var s = 0; for (var g = 0; g < nG; g++) s += (1 - wet[g]) * fluff[g]; return s / nG; },
      get smoothness() { return avg(smooth); },
      setTowel: function (v) { towelT = c01(num(v, 0)); },
      setAutoDry: function (v) { autoDry = Math.max(0, num(v, 0)); },
      cowlick: cowlick,
      onPop: null,
      surfacePoint: surfacePoint,
      setPreset: setPreset,
      serialize: serialize,
      restore: restore,
      setDetail: setDetail,
      // extras (not in the contract, handy for the game / debugging)
      info: { guides: nG, strands: nAll, triangles: nAll * SEGS * 2, cowlickRootLocal: cowRoot.slice() },
      _debug: { wet: wet, fluff: fluff, smooth: smooth, P: P, NN: NN, nG: nG, segL: segL, fringe: gFringe, mesh: mesh }
    };

    setStates(1, 0, 0);
    setDetail(1);
    try { settle(); } catch (e) { inited = false; }
    return api;
  };
})();

/* ---- game.js ---- */
/* game.js — the game: renderer, camera, one-finger input, story state machine, in-world guidance,
   particles, save / restore, performance scaling and the no-WebGL fallback. Boots itself on DOMContentLoaded. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var SAVE_KEY = 'gf-261119-1';
  var DEG = Math.PI / 180;

  function showFallback(canvas) {
    try {
      var fb = document.getElementById('fallback');
      if (canvas) canvas.style.display = 'none';
      if (fb) {
        var img = fb.getAttribute('data-img') || '';
        if (img) fb.style.backgroundImage = 'url("' + img + '")';
        fb.style.display = 'block';
      }
      reveal();
    } catch (e) { /* nothing more we can do */ }
  }
  // the page shows a soft still of the opening view until the first real frame; then it fades away
  function reveal() {
    try {
      var p = document.getElementById('poster');
      if (!p) return;
      p.style.opacity = '0';
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 900);
    } catch (e) { /* */ }
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      return true;
    } catch (e) { return false; }
  }
  function noopAudio() {
    var n = function () {};
    return { unlock: n, suspend: n, resume: n, play: n, update: n, dryer: { set: n }, brush: { set: n },
      musicBox: { start: n, stop: n, setRate: n }, ambience: n };
  }

  function start() {
    var canvas = document.getElementById('gl');
    if (!canvas || !window.THREE || !GF.makeRenderer || !GF.createSets || !GF.createProps || !GF.createGirl || !GF.createHair || !hasWebGL()) { showFallback(canvas); return; }
    var low = false;
    try { low = (navigator.hardwareConcurrency || 4) <= 2; } catch (e) { low = false; }
    var renderer = null;
    try {
      renderer = GF.makeRenderer(canvas, { low: low });
      if (!renderer || !renderer.getContext()) throw new Error('no gl');
    } catch (e) { showFallback(canvas); return; }
    try { build(canvas, renderer, low); } catch (e) {
      try { renderer.dispose(); } catch (e2) { /* */ }
      showFallback(canvas);
    }
  }

  // =====================================================================================================
  function build(canvas, renderer, low) {
    var T = THREE, clamp = GF.clamp, damp = GF.damp, lerp = GF.lerp, smooth = GF.smooth, ease = GF.ease, P = GF.POS;
    var V3 = T.Vector3, Q = T.Quaternion;
    function c01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function al(lambda, dt) { return 1 - Math.exp(-lambda * dt); }

    // ---------------------------------------------------------------- scene
    var scene = new T.Scene();
    scene.environment = GF.makeEnv(renderer);
    var camera = new T.PerspectiveCamera(40, 1, 0.05, 60);
    var sets = GF.createSets({ renderer: renderer, low: low });
    var props = GF.createProps({ low: low });
    var girl = GF.createGirl({ low: low });
    var mom = null;   // Mum and the genkan set are built later (ensureLate), in the background while the player is busy
    var hair = GF.createHair({ anchor: girl.headAnchor, low: low });
    var audio = null;
    try { audio = GF.createAudio ? GF.createAudio() : null; } catch (e) { audio = null; }
    if (!audio) audio = noopAudio();
    scene.add(sets.root, props.group, girl.group, hair.group);
    girl.headAnchor.add(props.towel.head);
    girl.torsoAnchor.add(props.pochette.worn);
    scene.updateMatrixWorld(true);
    scene.attach(props.finger.group);
    props.finger.setOpacity(0);
    var D = sets.dresser, G = null;
    function ensureMom() {
      if (mom) return;
      try { mom = GF.createMom ? GF.createMom({ low: low }) : null; } catch (e) { mom = null; }
      if (!mom) mom = { group: new T.Group(), handL: new T.Object3D(), reach: function () {}, setWalk: function () {}, update: function () {} };
      mom.group.position.fromArray(P.momGenkan);
      mom.group.visible = state.scene === 'genkan';
      scene.add(mom.group);
    }
    function ensureGenkan() {
      if (G) return;
      G = sets.ensureGenkan();
      if (state.lowPower && G.lights && G.lights.sun) G.lights.sun.castShadow = false;
    }
    function ensureLate() { ensureGenkan(); ensureMom(); }
    var dryer = props.dryer, brushP = props.brush, tissue = props.tissue, mbox = props.musicBox, pochette = props.pochette, towelP = props.towel, finger = props.finger;

    // guidance "sunbeam"
    var spot = new T.SpotLight(0xffd7a0, 0, 0, 0.15, 0.95, 2);
    spot.castShadow = false;
    scene.add(spot, spot.target);

    // ---------------------------------------------------------------- temporaries (no per-frame allocation)
    var tA = new V3(), tB = new V3(), tC = new V3(), tD = new V3(), tE = new V3(), tF = new V3(), tG = new V3();
    var bX = new V3(), bY = new V3(), qA = new Q(), qB = new Q(), m4 = new T.Matrix4();
    var UP = new V3(0, 1, 0), AXZ = new V3(0, 0, 1), AXX = new V3(1, 0, 0);
    var hitS = { position: new V3(), normal: new V3() };
    var raycaster = new T.Raycaster(), ndc = new T.Vector2(), ray = raycaster.ray;

    var state = { stage: 0, round: 0, busy: false, trans: false, scene: 'dresser', lowPower: low };
    var clock = 0;

    // ---------------------------------------------------------------- sizing / camera
    var PIX_BUDGET = 3.1e6;
    var view = { w: 390, h: 844, left: 0, top: 0, dpr: 1, scale: 1, bufH: 844, pr: 0, sw: 0, sh: 0 };
    var shot = { from: { pos: [0, 0, 0], look: [0, 0, 0], halfW: 1, halfH: 1 }, to: GF.SHOTS.intro, k: 1, dur: 1.2,
      cur: { pos: [0, 0, 0], look: [0, 0, 0], halfW: 1, halfH: 1 } };
    function copyShot(dst, s) { dst.pos[0] = s.pos[0]; dst.pos[1] = s.pos[1]; dst.pos[2] = s.pos[2]; dst.look[0] = s.look[0]; dst.look[1] = s.look[1]; dst.look[2] = s.look[2]; dst.halfW = s.halfW; dst.halfH = s.halfH; }
    function shotTo(name, dur) { copyShot(shot.from, shot.cur); shot.to = GF.SHOTS[name]; shot.k = 0; shot.dur = dur || 1.2; }
    function shotSnap(name) { shot.to = GF.SHOTS[name]; shot.k = 1; copyShot(shot.cur, shot.to); copyShot(shot.from, shot.to); }
    copyShot(shot.cur, GF.SHOTS.intro);
    function updateCamera(dt, t) {
      if (shot.k < 1) {
        shot.k = Math.min(1, shot.k + dt / shot.dur);
        var e = ease.inOut(shot.k), f = shot.from, to = shot.to, c = shot.cur;
        for (var i = 0; i < 3; i++) { c.pos[i] = lerp(f.pos[i], to.pos[i], e); c.look[i] = lerp(f.look[i], to.look[i], e); }
        c.halfW = lerp(f.halfW, to.halfW, e); c.halfH = lerp(f.halfH, to.halfH, e);
      }
      GF.applyShot(camera, shot.cur, view.w / Math.max(1, view.h));
      camera.position.x += 0.004 * Math.sin(t * 0.23);
      camera.position.y += 0.003 * Math.sin(t * 0.37 + 1.1);
      camera.lookAt(shot.cur.look[0], shot.cur.look[1], shot.cur.look[2]);
      camera.updateMatrixWorld();
    }
    function resize() {
      try {
        var r = canvas.getBoundingClientRect();
        var w = Math.round(r.width) || window.innerWidth || 390, h = Math.round(r.height) || window.innerHeight || 844;
        view.w = Math.max(1, w); view.h = Math.max(1, h); view.left = r.left; view.top = r.top;
        // device pixel ratio capped at 2 and at a total pixel budget (big iPads would otherwise shade ~5.6M px per frame)
        view.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(PIX_BUDGET / (view.w * view.h))));
        var pr = Math.round(view.dpr * view.scale * 100) / 100;
        if (pr !== view.pr || view.w !== view.sw || view.h !== view.sh) {   // re-allocating the drawing buffer is costly: only when it changes
          view.pr = pr; view.sw = view.w; view.sh = view.h;
          renderer.setPixelRatio(pr);
          renderer.setSize(view.w, view.h, false);
        }
        view.bufH = renderer.getContext().drawingBufferHeight || view.h;
        GF.applyShot(camera, shot.cur, view.w / view.h);
      } catch (e) { /* */ }
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { resize(); setTimeout(resize, 250); setTimeout(resize, 700); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

    // screen helpers
    function toScreen(v, out) {   // out: {x, y, ok, d}
      tG.copy(v).project(camera);
      out.x = (tG.x + 1) * 0.5 * view.w; out.y = (1 - tG.y) * 0.5 * view.h; out.ok = tG.z < 1 && tG.z > -1;
      out.d = camera.position.distanceTo(v);
      return out;
    }
    var scr = { x: 0, y: 0, ok: false, d: 1 }, scr2 = { x: 0, y: 0, ok: false, d: 1 };
    function pxPerMeter(dist) { return (view.h * 0.5) / Math.tan(camera.fov * DEG * 0.5) / Math.max(0.05, dist); }
    function panOf(v) { tG.copy(v).project(camera); return clamp(tG.x * 0.6, -0.8, 0.8); }
    function setRay(sx, sy) {
      ndc.set((sx - view.left) / view.w * 2 - 1, -((sy - view.top) / view.h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    }
    function rayZ(z, out) {
      var dz = ray.direction.z; if (Math.abs(dz) < 1e-5) return false;
      var t = (z - ray.origin.z) / dz; if (t < 0) return false;
      out.copy(ray.origin).addScaledVector(ray.direction, t); return true;
    }
    // orthonormal basis: local +Z = z (unit), +Y ≈ upRef projected
    function basisQ(z, upRef, alt, outQ) {
      bY.copy(upRef).addScaledVector(z, -z.dot(upRef));
      if (bY.lengthSq() < 0.01) { bY.copy(alt).addScaledVector(z, -z.dot(alt)); }
      bY.normalize(); bX.crossVectors(bY, z).normalize();
      m4.makeBasis(bX, bY, z); outQ.setFromRotationMatrix(m4); return outQ;
    }

    // ---------------------------------------------------------------- sound helpers
    var SO = { vol: 1, rate: 1, pan: 0 };
    function snd(name, vol, rate, pan) { SO.vol = vol == null ? 1 : vol; SO.rate = rate == null ? 1 : rate; SO.pan = pan || 0; try { audio.play(name, SO); } catch (e) { /* */ } }
    function sndAt(name, pos, vol, rate) { snd(name, vol, rate, pos ? panOf(pos) : 0); }

    // ---------------------------------------------------------------- scheduler (event-time allocations only)
    var queue = [];
    function sched(delay, fn) { queue.push({ t: clock + delay, fn: fn }); }
    function runQueue() {
      for (var i = 0; i < queue.length; i++) {
        if (queue[i].t <= clock) { var f = queue[i].fn; queue.splice(i, 1); i--; try { f(); } catch (e) { /* */ } }
      }
    }

    // ---------------------------------------------------------------- face helpers
    var FS = { smile: 0 }, FB = { blink: 0, smile: 0 }, baseSmile = 0, smileBoostT = 0, brushFace = false;
    function setBaseSmile(v) { baseSmile = v; FS.smile = v; girl.setFace(FS); }
    function smileBoost(d) { smileBoostT = d; FS.smile = 0.85; girl.setFace(FS); }
    var lookT = 0, lookP = new V3();
    function glance(pos, d) { if (!pos) return; lookP.copy(pos); lookT = d || 2; }

    // ---------------------------------------------------------------- particles
    var PMAX = 120, pCap = low ? 60 : 120, DUSTN = low ? 6 : 14;
    var pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 4), pSize = new Float32Array(PMAX), pStar = new Float32Array(PMAX);
    var pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pMaxL = new Float32Array(PMAX), pKind = new Uint8Array(PMAX), pBase = new Float32Array(PMAX * 4), pSz0 = new Float32Array(PMAX);
    var pGeo = new T.BufferGeometry();
    var pPosA = new T.BufferAttribute(pPos, 3), pColA = new T.BufferAttribute(pCol, 4), pSizeA = new T.BufferAttribute(pSize, 1), pStarA = new T.BufferAttribute(pStar, 1);
    pPosA.setUsage(T.DynamicDrawUsage); pColA.setUsage(T.DynamicDrawUsage); pSizeA.setUsage(T.DynamicDrawUsage);
    pGeo.setAttribute('position', pPosA); pGeo.setAttribute('aCol', pColA); pGeo.setAttribute('aSize', pSizeA); pGeo.setAttribute('aStar', pStarA);
    var pMat = new T.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: 'attribute vec4 aCol; attribute float aSize; attribute float aStar; uniform float uScale; varying vec4 vC; varying float vS;\n' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;\n' +
        ' gl_PointSize = aSize > 0.0 ? clamp(aSize * uScale / max(0.05, -mv.z), 1.0, 96.0) : 0.0; vC = aCol; vS = aStar; }',
      fragmentShader: 'varying vec4 vC; varying float vS;\n' +
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;\n' +
        ' float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r));\n' +
        ' float s = vS * (max(0.0, 1.0 - abs(d.x) * 18.0) * max(0.0, 1.0 - abs(d.y) * 2.1) + max(0.0, 1.0 - abs(d.y) * 18.0) * max(0.0, 1.0 - abs(d.x) * 2.1));\n' +
        ' float k = clamp(a + s * 0.8, 0.0, 1.0) * vC.a; if (k < 0.004) discard; gl_FragColor = vec4(vC.rgb, k); }',
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    var points = new T.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 5;
    scene.add(points);
    var pNext = DUSTN;
    function spawn(kind, x, y, z, vx, vy, vz, size, life, r, g, b, a) {
      var i = -1, n = pCap - DUSTN;
      for (var k = 0; k < n; k++) { var j = DUSTN + ((pNext - DUSTN + k) % n); if (pLife[j] <= 0) { i = j; break; } }
      if (i < 0) i = DUSTN + ((pNext - DUSTN) % n);
      pNext = DUSTN + ((i - DUSTN + 1) % n);
      pKind[i] = kind; pLife[i] = life; pMaxL[i] = life;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
      pBase[i * 4] = r; pBase[i * 4 + 1] = g; pBase[i * 4 + 2] = b; pBase[i * 4 + 3] = a;
      pSz0[i] = size; pStar[i] = kind === 2 ? 1 : 0;
    }
    function sparkleBurst(pos, n, spread) {
      n = Math.min(n, low ? 8 : 16); spread = spread || 0.08;
      for (var k = 0; k < n; k++) {
        var a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2, sp = 0.05 + Math.random() * 0.12;
        spawn(2, pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.3) * spread, pos.z + (Math.random() - 0.5) * spread,
          Math.cos(a) * sp, 0.05 + e * sp, Math.sin(a) * sp, 0.022 + Math.random() * 0.02, 0.8 + Math.random() * 0.6, 1.0, 0.86, 0.58, 0.95);
      }
    }
    function dropBurst(pos, n, dir, sp) {
      for (var k = 0; k < n; k++) {
        var vx = (Math.random() - 0.5) * 0.5, vy = Math.random() * 0.4, vz = (Math.random() - 0.2) * 0.4;
        if (dir) { vx += dir.x * sp; vy += dir.y * sp; vz += dir.z * sp; }
        spawn(1, pos.x + (Math.random() - 0.5) * 0.08, pos.y + (Math.random() - 0.5) * 0.05, pos.z + (Math.random() - 0.5) * 0.06,
          vx, vy, vz, 0.006 + Math.random() * 0.005, 0.7 + Math.random() * 0.5, 0.62, 0.74, 0.86, 0.9);
      }
    }
    function initDust() {
      for (var i = 0; i < DUSTN; i++) {
        pKind[i] = 3; pLife[i] = 1;
        pPos[i * 3] = -0.8 + Math.random() * 1.3; pPos[i * 3 + 1] = 0.8 + Math.random() * 0.9; pPos[i * 3 + 2] = -0.45 + Math.random() * 1.3;
        pSz0[i] = 0.0035 + Math.random() * 0.003; pStar[i] = 0;
        pBase[i * 4] = 1.0; pBase[i * 4 + 1] = 0.93; pBase[i * 4 + 2] = 0.78; pBase[i * 4 + 3] = 0.22;
      }
    }
    initDust();
    pStarA.needsUpdate = true;
    function killTransient() { for (var i = DUSTN; i < PMAX; i++) { pLife[i] = 0; pSize[i] = 0; } }
    function updateParticles(dt, t) {
      var showDust = state.scene === 'dresser';
      for (var i = 0; i < PMAX; i++) {
        var k = pKind[i], i3 = i * 3, i4 = i * 4;
        if (i >= pCap || pLife[i] <= 0 || (k === 3 && !showDust)) { pSize[i] = 0; pCol[i4 + 3] = 0; continue; }
        var a = pBase[i4 + 3], sz = pSz0[i];
        if (k === 3) {
          pPos[i3] += (Math.sin(t * 0.21 + i * 1.7) * 0.012 + 0.004) * dt;
          pPos[i3 + 1] += (Math.sin(t * 0.17 + i * 2.3) * 0.010 + 0.003) * dt;
          pPos[i3 + 2] += Math.sin(t * 0.13 + i * 0.9) * 0.010 * dt;
          if (pPos[i3 + 1] > 1.75) pPos[i3 + 1] = 0.8;
          if (pPos[i3] > 0.55) pPos[i3] = -0.8;
          a *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.31));
        } else {
          pLife[i] -= dt;
          var u = 1 - pLife[i] / pMaxL[i];
          if (k === 1) {
            pVel[i3 + 1] -= 5.5 * dt;
            pVel[i3] *= 1 - 0.8 * dt; pVel[i3 + 2] *= 1 - 0.8 * dt;
            a *= 1 - u * u * u;
          } else {
            pVel[i3] *= 1 - 2.2 * dt; pVel[i3 + 1] = pVel[i3 + 1] * (1 - 2.2 * dt) + 0.03 * dt; pVel[i3 + 2] *= 1 - 2.2 * dt;
            a *= Math.sin(Math.PI * Math.min(1, u * 1.05)) * (0.65 + 0.35 * Math.sin(t * 23 + i * 3.7));
            sz *= 0.7 + 0.5 * Math.sin(Math.PI * u);
          }
          pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] += pVel[i3 + 1] * dt; pPos[i3 + 2] += pVel[i3 + 2] * dt;
          if (pPos[i3 + 1] < 0.01) pLife[i] = 0;
          if (pLife[i] <= 0) { pSize[i] = 0; pCol[i4 + 3] = 0; continue; }
        }
        pSize[i] = sz;
        pCol[i4] = pBase[i4]; pCol[i4 + 1] = pBase[i4 + 1]; pCol[i4 + 2] = pBase[i4 + 2]; pCol[i4 + 3] = Math.max(0, a);
      }
      pPosA.needsUpdate = true; pColA.needsUpdate = true; pSizeA.needsUpdate = true;
      pMat.uniforms.uScale.value = view.bufH / (2 * Math.tan(camera.fov * DEG * 0.5));
    }

    // ---------------------------------------------------------------- items (picking + wobble)
    var items = [];
    function addItem(o) {
      o.wt = 9; o.wa = 0; o.pv = 0; o.wobOn = false; o.scene = o.scene || 'dresser';
      if (o.pickable === undefined) o.pickable = true;
      items.push(o); return o;
    }
    function wobble(it, amp) { if (!it) return; it.wt = 0; it.wa = amp || 1; if (it.onWobble) it.onWobble(); }
    function updateWobbles(dt) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i], w = 0, act = false;
        if (it.wt < 1.2) { it.wt += dt; w = it.wa * Math.sin(it.wt * 24) * Math.exp(-it.wt * 4.5); act = true; }
        if (it.pv > 0.001) { if (it.pv > Math.abs(w)) w = it.pv; act = true; }
        if (act) { it.wobOn = true; if (it.wob) it.wob(w); }
        else if (it.wobOn) { it.wobOn = false; if (it.wob) it.wob(0); }
      }
    }
    // generic home-pose wobble for tools resting at home
    function homeWobble(obj, home, w, cord) {
      qA.setFromAxisAngle(AXZ, w * 0.10); qB.setFromAxisAngle(AXX, w * 0.05);
      obj.quaternion.copy(home.quaternion).multiply(qA).multiply(qB);
      obj.position.copy(home.position); obj.position.y += Math.abs(w) * 0.008;
      if (cord) cord();
    }

    // glides (tools flying home)
    function makeGlide(obj, cord) { return { obj: obj, cord: cord || null, active: false, k: 0, dur: 0.4, fromP: new V3(), fromQ: new Q(), toP: new V3(), toQ: new Q(), done: null }; }
    function startGlide(g, toP, toQ, dur, done) {
      g.fromP.copy(g.obj.position); g.fromQ.copy(g.obj.quaternion); g.toP.copy(toP); g.toQ.copy(toQ);
      g.k = 0; g.dur = dur || 0.4; g.done = done || null; g.active = true;
    }
    function updateGlide(g, dt) {
      if (!g.active) return;
      g.k = Math.min(1, g.k + dt / g.dur);
      var e = ease.inOut(g.k);
      g.obj.position.lerpVectors(g.fromP, g.toP, e);
      g.obj.position.y += Math.sin(Math.PI * g.k) * 0.03 * Math.min(1, g.fromP.distanceTo(g.toP) * 4);
      g.obj.quaternion.slerpQuaternions(g.fromQ, g.toQ, e);
      if (g.cord) g.cord();
      if (g.k >= 1) { g.active = false; var d = g.done; g.done = null; if (d) d(); }
    }

    // ---------------------------------------------------------------- input state
    var ptr = { id: null, sx: 0, sy: 0, x0: 0, y0: 0, t0: 0, maxMove: 0, item: null, dragging: false };
    var idleT = 0, unlocked = false;

    // =====================================================================================================
    // WINGS
    var wings = {};
    function wingX(st, v) { return st.s * 0.235 - st.s * 0.226 * Math.cos(v * 155 * DEG); }
    function wingV(st, x) { var c = clamp(st.s * (st.s * 0.235 - x) / 0.226, -1, 1); return clamp(Math.acos(c) / (155 * DEG), 0, 1); }
    ['R', 'L'].forEach(function (side) {
      var st = { side: side, s: side === 'R' ? 1 : -1, api: D.wings[side], v: 0, target: 0, drag: false, open: false, xoff: 0, lastV: 0, nextCreak: 0, off: 0 };
      wings[side] = st;
      st.item = addItem({
        id: 'wing' + side, r: 0.05,
        pos: function (out) { return st.api.knob.getWorldPosition(out); },
        can: function () { return state.scene === 'dresser' && !state.trans; },
        glow: function (v) { D.setWingGlow(side, v); },
        down: function () {
          if (state.stage === 0 && !st.open) {
            st.drag = true;
            if (rayZ(P.wingHingeZ, tA)) st.xoff = tA.x - wingX(st, st.v); else st.xoff = 0;
            snd('knob', 0.5, 1, st.s * 0.3);
            return true;
          }
          wobble(st.item, 1); snd('knob', 0.7, 1, st.s * 0.3); return false;
        },
        drag: function (dt) {
          if (!rayZ(P.wingHingeZ, tA)) return;
          var tv = wingV(st, tA.x - st.xoff);
          st.v = damp(st.v, tv, 22, dt);
        },
        up: function (tap) {
          st.drag = false;
          if (tap && st.v < 0.12) { st.target = 0; wobble(st.item, 1.6); snd('creak', 0.6, 1.1, st.s * 0.3); return; }
          if (st.v > 0.3) { st.target = 1; snd('wingOpen', 1, 1, st.s * 0.3); }
          else { st.target = 0; snd('knob', 0.45, 0.9, st.s * 0.3); }
        },
        wob: function (w) { st.off = w; },
        demo: function (a, b, c) {
          st.api.knob.getWorldPosition(a);
          c.set(st.s * 0.38, 1.12, -0.56); b.lerpVectors(a, c, 0.5); b.z += 0.03;
        }
      });
    });
    function updateWings(dt) {
      ['R', 'L'].forEach(function (side) {
        var st = wings[side];
        if (!st.drag) st.v = damp(st.v, st.target, st.target > st.v ? 4.2 : 7, dt);
        if (st.target === 1 && st.v > 0.985 && !st.drag) { st.v = 1; st.open = true; }
        if (st.drag && Math.abs(st.v - st.lastV) > 0.25 * dt && clock > st.nextCreak) {
          snd('creak', 0.45, 0.9 + Math.random() * 0.25, st.s * 0.3); st.nextCreak = clock + 0.45 + Math.random() * 0.6;
        }
        st.lastV = st.v;
        var o = Math.abs(st.off), v = st.open ? st.v - 0.022 * o : st.v + 0.075 * o;
        st.api.setOpen(c01(v));
      });
    }

    // =====================================================================================================
    // TOWEL
    var tw = { state: 'head', p: 0, dx: 0, drag: false, anim: false, k: 0, from: 0, start: new V3(), lastCloth: 0, lastP: 0, off: 0 };
    var itTowel = addItem({
      id: 'towel', r: 0.11,
      pos: function (out) { out.set(0, 0.06, 0.03); return girl.headAnchor.localToWorld(out); },
      can: function () { return state.scene === 'dresser' && tw.state === 'head' && !tw.anim && !state.trans; },
      glow: function (v) { towelP.setGlow(v); },
      down: function () {
        if (state.stage >= 1) {
          tw.drag = true;
          if (!rayZ(0.06, tw.start)) itTowel.pos(tw.start);
          snd('cloth', 0.5);
          return true;
        }
        wrongTap(itTowel); return false;
      },
      drag: function (dt) {
        if (!rayZ(0.06, tA)) return;
        tA.sub(tw.start);
        var pT = c01(tA.length() / 0.22), dxT = clamp(tA.x / 0.15, -1, 1);
        tw.p = damp(tw.p, pT, 28, dt); tw.dx = damp(tw.dx, dxT, 28, dt);
        if (Math.abs(tw.p - tw.lastP) > 0.05 && clock - tw.lastCloth > 0.2) { snd('cloth', 0.6, 0.9 + Math.random() * 0.2); tw.lastCloth = clock; tw.lastP = tw.p; }
      },
      up: function (tap) {
        tw.drag = false;
        if (tw.p >= 0.4) { tw.anim = true; tw.k = 0; tw.from = tw.p; snd('towelOff'); }
        else if (tap) { wobble(itTowel, 1.2); snd('cloth', 0.5); }
      },
      wob: function (w) { tw.off = w; },
      demo: function (a, b, c) {
        a.set(0, 0.112, 0.045); girl.headAnchor.localToWorld(a);
        c.copy(a); c.x += 0.05; c.y -= 0.17; c.z += 0.12; b.lerpVectors(a, c, 0.45);
      }
    });
    function updateTowel(dt) {
      if (tw.state !== 'head') return;
      if (tw.anim) {
        tw.k = Math.min(1, tw.k + dt / 0.4);
        tw.p = lerp(tw.from, 1, ease.inOut(tw.k));
        if (tw.k >= 1) { towelDone(); return; }
      } else if (!tw.drag) tw.p = damp(tw.p, 0, 9, dt);
      var pp = tw.p + ((tw.drag || tw.anim) ? 0 : 0.06 * Math.abs(tw.off));
      towelP.setSlide(c01(pp), tw.dx);
      if (state.stage >= 1) hair.setTowel(1 - smooth(0.25, 0.7, tw.p));
      girl.setTowelOn(tw.p < 0.5);
    }
    function towelDone() {
      tw.anim = false; tw.state = 'hung'; tw.p = 1;
      towelP.setState('hung');
      hair.setTowel(0); girl.setTowelOn(false);
      snd('flop');
      girl.headAnchor.getWorldPosition(tA);
      dropBurst(tA, low ? 8 : 14, null, 0);
      girl.react('surprise');
      state.busy = true;
      [0.25, 0.6, 1.0].forEach(function (d, i) {
        sched(d, function () { snd('drip', 0.7, 0.9 + i * 0.12); girl.headAnchor.getWorldPosition(tA); tA.y -= 0.06; dropBurst(tA, 3, null, 0); });
      });
      sched(0.9, function () { setBaseSmile(0.5); });
      sched(1.2, function () { if (state.stage === 1) state.stage = 2; state.busy = false; dirty(); });
      dirty();
    }

    // =====================================================================================================
    // DRYER
    var dr = { held: false, T: new V3(), Ts: new V3(), nz: new V3(), dir: new V3(), side: 1, sideT: 1, blowT: 0, lastSwing: 0, dropAcc: 0, spinFast: false, glide: makeGlide(dryer.group, dryer.updateCord) };
    var itDryer = addItem({
      id: 'dryer', r: 0.09,
      pos: function (out) { out.set(0, 0.07, 0.04); return dryer.group.localToWorld(out); },
      can: function () { return state.scene === 'dresser' && !state.trans; },
      glow: function (v) { dryer.setGlow(v); },
      down: function () {
        if (state.stage >= 2) {
          dr.held = true; dr.glide.active = false; dr.glide.done = null;
          snd('pickup'); snd('switchOn', 0.8);
          dryer.setOn(true); audio.dryer.set(true, 0.3);
          dryerTarget(dr.T); dr.Ts.copy(dr.T);
          dr.sideT = dr.side = dr.Ts.x < -0.12 ? -1 : 1;
          return true;
        }
        wrongTap(itDryer); return false;
      },
      drag: function (dt) { dryerHold(dt); },
      up: function () { dryerRelease(); },
      wob: function (w) { if (!dr.held && !dr.glide.active) homeWobble(dryer.group, dryer.home, w, dryer.updateCord); },
      demo: function (a, b, c) {
        itDryer.pos(a); c.set(0.03, 0.03, 0.10); girl.headAnchor.localToWorld(c);
        b.lerpVectors(a, c, 0.6); b.y += 0.08;
      },
      wave: true
    });
    function dryerTarget(out) {
      if (hair.surfacePoint(ray.origin, ray.direction, hitS)) { out.copy(hitS.position); return true; }
      rayZ(-0.36, out); return false;
    }
    var coneD = 0;
    function inCone(pos, maxAng, maxDist) {
      tF.subVectors(pos, dr.nz); var d = tF.length(); coneD = d;
      if (d > maxDist || d < 1e-4) return false;
      return tF.dot(dr.dir) / d > Math.cos(maxAng * DEG);
    }
    var WINDOW = new V3(-1.7, 1.2, 0.6), towelHungPos = new V3(-0.09, 0.52, 0.22);
    function dryerHold(dt) {
      var onHair = dryerTarget(dr.T);
      dr.Ts.lerp(dr.T, al(18, dt));
      if (dr.Ts.x < -0.12) dr.sideT = -1; else if (dr.Ts.x > 0.02) dr.sideT = 1;
      dr.side = damp(dr.side, dr.sideT, 6, dt);
      tA.set(clamp(dr.Ts.x + dr.side * 0.17, -0.44, 0.46), dr.Ts.y - 0.10, dr.Ts.z + 0.24);
      dryer.group.position.lerp(tA, al(16, dt));
      dryer.group.lookAt(dr.Ts.x, dr.Ts.y - 0.085, dr.Ts.z);
      dryer.group.updateMatrixWorld(true);
      dryer.updateCord();
      dryer.nozzle.getWorldPosition(dr.nz);
      dr.dir.subVectors(dr.Ts, dr.nz);
      if (dr.dir.lengthSq() < 1e-6) dr.dir.set(0, 0, -1); else dr.dir.normalize();
      hair.setWind(dr.nz, dr.dir, 1);
      // her head in the cone?
      girl.headAnchor.getWorldPosition(tB);
      var hitHead = onHair || inCone(tB, 25, 0.68);
      girl.setWindFace(hitHead ? 1 : 0);
      audio.dryer.set(true, hitHead ? 0.65 : 0.25);
      if (hitHead) {
        dr.blowT += dt;
        var wet = hair.wetness;
        if (wet > 0.12) {
          dr.dropAcc += dt * 26 * wet;
          while (dr.dropAcc >= 1) {
            dr.dropAcc -= 1;
            spawn(1, dr.Ts.x + (Math.random() - 0.5) * 0.06, dr.Ts.y + (Math.random() - 0.5) * 0.05, dr.Ts.z + (Math.random() - 0.5) * 0.04,
              dr.dir.x * 0.9 + (Math.random() - 0.5) * 0.4, dr.dir.y * 0.9 + Math.random() * 0.3, dr.dir.z * 0.9 + (Math.random() - 0.5) * 0.4,
              0.005 + Math.random() * 0.004, 0.6 + Math.random() * 0.4, 0.62, 0.74, 0.86, 0.85);
          }
        }
      }
      // things in the wind
      tissue.group.getWorldPosition(tC); tC.y += 0.07;
      if (state.stage >= 2 && inCone(tC, 25, 0.8)) {
        if (tissue.blow(dr.dir, 1)) { sndAt('tissue', tC, 0.9, 0.9 + Math.random() * 0.2); glance(tC, 1.3); smileBoost(1.2); }
      }
      if (tw.state === 'hung' && inCone(towelHungPos, 25, 0.8)) towelP.flap(1);
      if (!bag.worn && !bag.held && !bag.glide.active) {
        pochette.group.localToWorld(tC.set(0, -0.24, 0.046));
        if (inCone(tC, 25, 0.8) && clock - dr.lastSwing > 0.45) { pochette.swing(clamp(dr.dir.x * 1.4, -1.2, 1.2) + 0.35); dr.lastSwing = clock; }
      }
      tC.subVectors(WINDOW, dr.nz).normalize();
      D.setCurtainWind(tC.dot(dr.dir) > Math.cos(32 * DEG) ? 1 : 0);
      var fast = false;
      if (lid.v > 0.6) { mbox.group.getWorldPosition(tC); tC.y += 0.06; fast = inCone(tC, 25, 0.8); }
      if (fast !== dr.spinFast) {
        dr.spinFast = fast;
        if (lid.target === 1) { mbox.setSpin(fast ? 9 : 2.2); audio.musicBox.setRate(fast ? 1.7 : 1); }
      }
    }
    function dryerRelease() {
      if (!dr.held) return;
      dr.held = false;
      snd('switchOff', 0.8); dryer.setOn(false); audio.dryer.set(false, 0);
      hair.setWind(null); girl.setWindFace(0); D.setCurtainWind(0);
      if (dr.spinFast) { dr.spinFast = false; if (lid.target === 1) { mbox.setSpin(2.2); audio.musicBox.setRate(1); } }
      startGlide(dr.glide, dryer.home.position, dryer.home.quaternion, 0.4, dryerHome);
    }
    function dryerHome() { snd('putdown', 0.6); }

    // =====================================================================================================
    // BRUSH
    var BR_TIP = new V3(0, 0.105, -0.024);
    var br = { held: false, T: new V3(), Ts: new V3(), prev: new V3(), vel: new V3(), N: new V3(0, 0, 1), Ns: new V3(0, 0, 1), contactT: 0, glide: makeGlide(brushP.group, null) };
    var itBrush = addItem({
      id: 'brush', r: 0.08,
      pos: function (out) { out.set(0, 0.09, -0.01); return brushP.group.localToWorld(out); },
      can: function () { return state.scene === 'dresser' && !state.trans; },
      glow: function (v) { brushP.setGlow(v); },
      down: function () {
        if (state.stage >= 3) {
          br.held = true; br.glide.active = false; br.glide.done = null;
          snd('pickup');
          brushTarget(); br.Ts.copy(br.T); br.prev.copy(br.T); br.Ns.copy(br.N); br.vel.set(0, 0, 0);
          return true;
        }
        wrongTap(itBrush); return false;
      },
      drag: function (dt) { brushHold(dt); },
      up: function () { brushRelease(); },
      wob: function (w) { if (!br.held && !br.glide.active) homeWobble(brushP.group, brushP.home, w, null); },
      demo: function (a, b, c) {
        itBrush.pos(a); b.set(0.01, 0.075, 0.06); girl.headAnchor.localToWorld(b);
        c.set(0.015, -0.03, 0.11); girl.headAnchor.localToWorld(c);
      }
    });
    function brushTarget() {
      if (hair.surfacePoint(ray.origin, ray.direction, hitS)) { br.T.copy(hitS.position); br.N.copy(hitS.normal); return true; }
      if (!rayZ(0.06, br.T)) br.T.copy(br.Ts);
      br.N.copy(ray.direction).negate(); return false;
    }
    function brushHold(dt) {
      brushTarget();
      br.prev.copy(br.Ts);
      br.Ts.lerp(br.T, al(25, dt));
      if (dt > 1e-4) br.vel.subVectors(br.Ts, br.prev).multiplyScalar(1 / dt); else br.vel.set(0, 0, 0);
      br.Ns.lerp(br.N, al(16, dt)).normalize();
      tB.setFromMatrixColumn(camera.matrixWorld, 1);
      basisQ(br.Ns, tB, UP, qA);
      brushP.group.quaternion.slerp(qA, al(20, dt));
      tC.copy(BR_TIP).applyQuaternion(brushP.group.quaternion);
      brushP.group.position.copy(br.Ts).sub(tC).addScaledVector(br.Ns, 0.003);
      var contact = hair.brush(br.Ts, br.vel, 0.045) || 0;
      var speed = br.vel.length();
      audio.brush.set(contact * c01(speed * 1.5));
      var brushing = contact > 0.12;
      if (brushing !== brushFace) {
        brushFace = brushing;
        FB.blink = brushing ? 0.8 : 0; FB.smile = brushing ? 0.7 : baseSmile; girl.setFace(FB);
      }
      if (contact > 0.2 && speed > 0.05) br.contactT += dt;
    }
    function brushRelease() {
      if (!br.held) return;
      br.held = false;
      audio.brush.set(0);
      if (brushFace) { brushFace = false; FB.blink = 0; FB.smile = baseSmile; girl.setFace(FB); }
      startGlide(br.glide, brushP.home.position, brushP.home.quaternion, 0.4, brushHome);
    }
    function brushHome() { snd('putdown', 0.7); }

    // =====================================================================================================
    // TISSUE BOX
    var TISSUE_UP = new V3(0, 1, 0.25).normalize();
    var tissueBase = { y: tissue.group.position.y, rz: tissue.group.rotation.z };
    var itTissue = addItem({
      id: 'tissue', r: 0.08,
      pos: function (out) { tissue.group.getWorldPosition(out); out.y += 0.06; return out; },
      can: function () { return state.scene === 'dresser' && !state.trans; },
      glow: function (v) { tissue.setGlow(v); },
      down: function () {
        itTissue.pos(tA);
        if (state.stage >= 2) {
          if (tissue.blow(TISSUE_UP, 0.6)) { sndAt('tissue', tA, 0.9); glance(tA, 1.2); smileBoost(1); }
          else { wobble(itTissue, 0.8); sndAt('tap', tA, 0.6); }
          return false;
        }
        wrongTap(itTissue); return false;
      },
      wob: function (w) { tissue.group.rotation.z = tissueBase.rz + w * 0.07; tissue.group.position.y = tissueBase.y + Math.abs(w) * 0.008; }
    });

    // =====================================================================================================
    // MUSIC BOX LID
    var lid = { v: 0, target: 0, drag: false, y0: 0, v0: 0, z: 0, off: 0, ever: false };
    var itLid = addItem({
      id: 'lid', r: 0.065,
      pos: function (out) { return mbox.lid.knob.getWorldPosition(out); },
      can: function () { return state.scene === 'dresser' && !state.trans; },
      glow: function (v) { mbox.setGlow(v); },
      down: function () {
        if (state.stage >= 4) {
          lid.drag = true; mbox.lid.knob.getWorldPosition(tA); lid.z = tA.z;
          lid.y0 = rayZ(lid.z, tB) ? tB.y : tA.y; lid.v0 = lid.v;
          return true;
        }
        wrongTap(itLid); return false;
      },
      drag: function (dt) {
        if (!rayZ(lid.z, tA)) return;
        lid.v = damp(lid.v, c01(lid.v0 + (tA.y - lid.y0) / 0.09), 25, dt);
      },
      up: function (tap) {
        lid.drag = false;
        var open;
        if (tap) open = lid.v0 < 0.5;
        else open = lid.v > (lid.v0 > 0.5 ? 0.7 : 0.3);
        itLid.pos(tA);
        if (open) {
          if (lid.target !== 1 || lid.v < 0.9) sndAt('lidOpen', tA);
          lid.target = 1; audio.musicBox.start(); audio.musicBox.setRate(1); mbox.setSpin(2.2); dr.spinFast = false;
          if (!lid.ever) { lid.ever = true; }
          if (state.stage === 4) { state.stage = 5; sparkleBurst(tA, 8, 0.06); }
        } else {
          if (lid.target !== 0 || lid.v > 0.1) sndAt('lidClose', tA);
          lid.target = 0; audio.musicBox.stop(); mbox.setSpin(0);
        }
        dirty();
      },
      wob: function (w) { lid.off = w; },
      demo: function (a, b, c) { mbox.lid.knob.getWorldPosition(a); c.copy(a); c.y += 0.08; c.z -= 0.02; b.lerpVectors(a, c, 0.5); }
    });
    function updateLid(dt) {
      if (!lid.drag) lid.v = damp(lid.v, lid.target, 9, dt);
      mbox.setLid(c01(lid.v + 0.13 * Math.abs(lid.off)));
    }

    // =====================================================================================================
    // CLIPS
    var COW_ROOT = new V3(0.0204, 0.0817, 0.0390);
    try { var cr0 = hair.info && hair.info.cowlickRootLocal; if (cr0 && cr0.length === 3 && isFinite(cr0[0] + cr0[1] + cr0[2])) COW_ROOT.set(cr0[0], cr0[1], cr0[2]); } catch (e) { /* default */ }
    var clipSt = props.clips.map(function (c, i) {
      var st = { c: c, i: i, mode: 'tray', pin: false, onHair: false, glide: makeGlide(c.group, null), slide: { on: false, k: 0, fp: new V3(), fq: new Q(), tp: new V3(), tq: new Q() }, tp: new V3(), tq: new Q() };
      st.item = addItem({
        id: 'clip' + i, r: 0.028,
        pos: function (out) { return c.group.getWorldPosition(out); },
        can: function () {
          if (state.scene !== 'dresser' || state.trans || st.glide.active || st.slide.on) return false;
          return (st.mode === 'tray' && lid.v > 0.75 && lid.target === 1) || st.mode === 'hair';
        },
        glow: function (v) { c.setGlow(v); },
        down: function () {
          if (st.mode === 'hair') {
            props.group.attach(c.group);
            if (st.pin) { st.pin = false; hair.cowlick.unpin(); }
          }
          st.mode = 'held'; st.onHair = false;
          snd('pickup', 0.8, 1.2);
          return true;
        },
        drag: function (dt) { clipHold(st, dt); },
        up: function () { clipRelease(st); },
        wob: function (w) { if (st.mode === 'tray' && !st.glide.active) { c.group.position.copy(c.home.position); c.group.position.y += Math.abs(w) * 0.007; } }
      });
      return st;
    });
    function clipHold(st, dt) {
      var g = st.c.group;
      if (hair.surfacePoint(ray.origin, ray.direction, hitS)) {
        st.onHair = true; st.tp.copy(hitS.position);
        tB.setFromMatrixColumn(camera.matrixWorld, 1);
        basisQ(hitS.normal, UP, tB, st.tq);
      } else {
        st.onHair = false;
        if (!rayZ(0.10, st.tp)) st.tp.copy(g.position);
        tC.copy(ray.direction).negate();
        tB.setFromMatrixColumn(camera.matrixWorld, 1);
        basisQ(tC, tB, UP, st.tq);
      }
      g.position.lerp(st.tp, al(30, dt));
      g.quaternion.slerp(st.tq, al(25, dt));
    }
    function pinnedClip() { for (var i = 0; i < clipSt.length; i++) if (clipSt[i].pin || clipSt[i].slide.on) return clipSt[i]; return null; }
    function cowlickTarget(outP, outQ) {
      var S = GF.HEAD.skull;
      tB.set(COW_ROOT.x / (S[0] * S[0]), COW_ROOT.y / (S[1] * S[1]), COW_ROOT.z / (S[2] * S[2])).normalize();   // head-local normal
      tC.copy(COW_ROOT); girl.headAnchor.localToWorld(tC);
      tD.copy(tB).transformDirection(girl.headAnchor.matrixWorld);
      tE.copy(tC).addScaledVector(tD, 0.25); tF.copy(tD).negate();
      if (hair.surfacePoint(tE, tF, hitS)) { outP.copy(hitS.position); girl.headAnchor.worldToLocal(outP); }
      else outP.copy(COW_ROOT).addScaledVector(tB, 0.03);
      basisQ(tB, UP, AXZ, outQ);
    }
    function clipRelease(st) {
      var g = st.c.group;
      if (st.onHair && state.scene === 'dresser') {
        girl.headAnchor.attach(g);
        st.mode = 'hair';
        g.getWorldPosition(tA); sndAt('clip', tA);
        if (hair.cowlick.state === 'up' && !pinnedClip()) {
          var sl = st.slide;
          sl.fp.copy(g.position); sl.fq.copy(g.quaternion);
          cowlickTarget(sl.tp, sl.tq);
          sl.k = 0; sl.on = true;
          state.busy = true;
        } else if (state.stage === 5) {
          sparkleBurst(tA, 6, 0.04);
          state.busy = true;
          sched(0.5, function () { if (state.stage === 5) state.stage = 6; state.busy = false; dirty(); });
        }
        dirty();
      } else {
        st.mode = 'gliding';
        startGlide(st.glide, st.c.home.position, st.c.home.quaternion, 0.35, st.homeDone || (st.homeDone = function () { st.mode = 'tray'; snd('putdown', 0.5, 1.3); }));
        dirty();
      }
    }
    function updateClips(dt) {
      for (var i = 0; i < clipSt.length; i++) {
        var st = clipSt[i], sl = st.slide;
        updateGlide(st.glide, dt);
        if (sl.on) {
          sl.k = Math.min(1, sl.k + dt / 0.15);
          var e = ease.out(sl.k);
          st.c.group.position.lerpVectors(sl.fp, sl.tp, e);
          st.c.group.quaternion.slerpQuaternions(sl.fq, sl.tq, e);
          if (sl.k >= 1) {
            sl.on = false; st.pin = true;
            if (hair.cowlick.state === 'up') hair.cowlick.pin();
            st.c.group.getWorldPosition(tA);
            snd('sparkle'); sparkleBurst(tA, 12, 0.06);
            girl.react('happy'); snd('giggle', 0.9); smileBoost(1.5);
            sched(0.9, function () { if (state.stage === 5) state.stage = 6; state.busy = false; dirty(); });
            dirty();
          }
        }
      }
    }
    var itClips = addItem({   // focus proxy for the clips in the tray (not pickable itself)
      id: 'clips', r: 0.05, pickable: false,
      pos: function (out) {
        for (var i = 0; i < clipSt.length; i++) if (clipSt[i].mode === 'tray') return clipSt[i].c.group.getWorldPosition(out);
        return mbox.group.getWorldPosition(out);
      },
      can: function () { return false; },
      glow: function (v) { for (var i = 0; i < clipSt.length; i++) clipSt[i].c.setGlow(clipSt[i].mode === 'tray' ? v : 0); },
      wob: function (w) { for (var i = 0; i < clipSt.length; i++) if (clipSt[i].mode === 'tray') clipSt[i].item.wob(w * (i % 2 ? -1 : 1)); },
      demo: function (a, b, c) {
        itClips.pos(a);
        c.copy(COW_ROOT); c.y += 0.01; girl.headAnchor.localToWorld(c);
        b.lerpVectors(a, c, 0.5); b.y += 0.1;
      }
    });
    function anyTrayClip() { for (var i = 0; i < clipSt.length; i++) if (clipSt[i].mode === 'tray') return true; return false; }

    // =====================================================================================================
    // POCHETTE
    var bag = { worn: false, held: false, off: new V3(), tgt: new V3(), prevX: 0, lastSwing: 0, glide: makeGlide(pochette.group, null) };
    var itBag = addItem({
      id: 'bag', r: 0.09,
      pos: function (out) { out.set(0, -0.24, 0.046); return pochette.group.localToWorld(out); },
      can: function () { return state.scene === 'dresser' && !bag.worn && !state.trans; },
      glow: function (v) { pochette.setGlow(v); },
      down: function () {
        if (state.stage >= 6) {
          bag.held = true; bag.glide.active = false; bag.glide.done = null;
          snd('strap', 0.8);
          if (rayZ(0.28, tA)) { bag.off.subVectors(pochette.group.position, tA); bag.off.z = 0; } else bag.off.set(0, 0.24, 0);
          bag.prevX = pochette.group.position.x;
          return true;
        }
        wrongTap(itBag); return false;
      },
      drag: function (dt) {
        if (rayZ(0.28, tA)) { bag.tgt.copy(tA).add(bag.off); bag.tgt.z = 0.28; }
        var g = pochette.group;
        g.position.lerp(bag.tgt, al(28, dt));
        var vx = dt > 1e-4 ? (g.position.x - bag.prevX) / dt : 0; bag.prevX = g.position.x;
        if (clock - bag.lastSwing > 0.1 && Math.abs(vx) > 0.15) { pochette.swing(clamp(-vx * 0.5, -1.5, 1.5)); bag.lastSwing = clock; }
      },
      up: function () {
        bag.held = false;
        if (overHer()) wearBag();
        else startGlide(bag.glide, pochette.home.position, pochette.home.quaternion, 0.4, bagHome);
      },
      onWobble: function () { if (!bag.held && !bag.glide.active) pochette.swing(0.7); },
      demo: function (a, b, c) {
        itBag.pos(a); girl.torsoAnchor.getWorldPosition(c); c.x += 0.06; c.y += 0.04; c.z += 0.08;
        b.lerpVectors(a, c, 0.5); b.y += 0.08;
      }
    });
    if (!bag.tgt.lengthSq()) bag.tgt.copy(pochette.home.position);
    function bagHome() { pochette.swing(0.6); snd('strap', 0.4, 1.2); }
    function overHer() {
      girl.torsoAnchor.getWorldPosition(tA);
      toScreen(tA, scr);
      var th = Math.max(110, 0.28 * Math.min(view.w, view.h));
      if (scr.ok && Math.hypot(scr.x - ptr.sx, scr.y - ptr.sy) < th) return true;
      girl.headAnchor.getWorldPosition(tB); toScreen(tB, scr2);
      if (scr2.ok && Math.hypot(scr2.x - ptr.sx, scr2.y - ptr.sy) < th) return true;
      pochette.group.localToWorld(tC.set(0, -0.24, 0.046));
      return tC.distanceTo(tA) < 0.3;
    }
    function wearBag() {
      bag.worn = true;
      pochette.setWorn(true);
      pochette.group.position.copy(pochette.home.position); pochette.group.quaternion.copy(pochette.home.quaternion);
      snd('strap'); snd('sparkle', 0.9);
      girl.torsoAnchor.getWorldPosition(tA); sparkleBurst(tA, 14, 0.12);
      girl.react('happy'); smileBoost(1.6);
      state.busy = true;
      dirty();
      sched(1.6, startTransition);
    }

    // =====================================================================================================
    // DOOR (genkan)
    var door = { v: 0, target: 0, p: 0, drag: false, start: new V3(), handled: false, nextCreak: 0, off: 0, lastV: 0 };
    var itDoor = addItem({
      id: 'door', r: 0.07, scene: 'genkan',
      pos: function (out) { return G.door.handle.getWorldPosition(out); },
      can: function () { return state.scene === 'genkan' && state.stage === 7 && !state.trans && door.target === 0; },
      hit: function () {
        if (rayZ(P.doorZ, tA) && tA.x > P.doorHingeX - 0.05 && tA.x < P.doorHingeX + P.doorW + 0.05 && tA.y > -0.05 && tA.y < P.doorH + 0.05) return 0.5;
        return 9;
      },
      glow: function (v) { G.setDoorGlow(v); },
      down: function () {
        door.drag = true; door.handled = false;
        if (!rayZ(P.doorZ, door.start)) G.door.handle.getWorldPosition(door.start);
        return true;
      },
      drag: function (dt) {
        if (!rayZ(P.doorZ, tA)) return;
        var L = tA.distanceTo(door.start);
        door.p = damp(door.p, c01(L / 0.04), 30, dt);
        if (door.p > 0.92 && !door.handled) { door.handled = true; snd('handle'); }
        door.v = damp(door.v, c01((L - 0.04) / 0.35), 12, dt);
      },
      up: function (tap) {
        door.drag = false;
        if (tap && door.v < 0.05) { wobble(itDoor, 1.3); if (!door.handled) snd('handle', 0.7); }
        if (door.v > 0.25) { door.target = 1; snd('doorOpen'); sched(0.25, function () { snd('bell', 0.8); }); }
        else door.target = 0;
      },
      wob: function (w) { door.off = w; },
      demo: function (a, b, c) {
        G.door.handle.getWorldPosition(a); a.z += 0.02;
        b.copy(a); b.y -= 0.04; c.copy(a); c.x -= 0.24; c.y -= 0.14; c.z -= 0.05;
      }
    });
    function updateDoor(dt) {
      if (state.scene !== 'genkan') return;
      if (!door.drag) { door.v = damp(door.v, door.target, door.target ? 2.6 : 6, dt); door.p = damp(door.p, 0, 8, dt); }
      if (door.drag && Math.abs(door.v - door.lastV) > 0.2 * dt && clock > door.nextCreak) { snd('creak', 0.35, 0.8 + Math.random() * 0.3); door.nextCreak = clock + 0.5 + Math.random() * 0.5; }
      door.lastV = door.v;
      G.door.setOpen(door.v);
      G.door.setHandle(c01(door.p + 0.65 * Math.abs(door.off)));
      G.setDaylight(state.stage >= 8 ? Math.max(door.v, endT.day) : door.v);
      if (state.stage === 7 && door.target === 1 && door.v > 0.97) startEnding();
    }

    // =====================================================================================================
    // GIRL (fallback touch: a little tickle)
    var lastTickle = -9;
    var itGirl = addItem({
      id: 'girl', r: 0.15, pickable: false,
      pos: function (out) { return girl.headAnchor.getWorldPosition(out); },
      can: function () { return state.scene === 'dresser' && !state.trans; },
      down: function () {
        if (clock - lastTickle > 1.3) { lastTickle = clock; girl.react('tickle'); snd('giggle', 0.75, 1.05); }
        else snd('tap', 0.5);
        var f = getFocus(); if (f) { f.pos(tA); glance(tA, 1.6); }
        return false;
      }
    });
    function girlHit(sx, sy) {
      girl.headAnchor.getWorldPosition(tA); toScreen(tA, scr);
      if (scr.ok && Math.hypot(scr.x - sx, scr.y - sy) < Math.max(70, pxPerMeter(scr.d) * 0.16)) return true;
      girl.torsoAnchor.getWorldPosition(tA); toScreen(tA, scr);
      return scr.ok && Math.hypot(scr.x - sx, scr.y - sy) < Math.max(70, pxPerMeter(scr.d) * 0.17);
    }

    function wrongTap(it) {
      wobble(it, 1); it.pos(tA); sndAt('tap', tA, 0.7);
      var f = getFocus();
      if (f && f !== it) {
        f.pos(tB); glance(tB, 2);
        // jump straight to a gentle wobble of the right thing
        idleT = Math.max(idleT, 3.0); hint.nextWob = Math.min(hint.nextWob, clock + 0.45);
      }
    }

    // ---------------------------------------------------------------- picking
    function pick(sx, sy) {
      var best = null, bestS = 1, f = getFocus();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.pickable || !it.can()) continue;
        var s;
        if (it.hit) s = it.hit(sx, sy);
        else {
          it.pos(tA); toScreen(tA, scr);
          if (!scr.ok) continue;
          var thr = Math.max(46, it.r * pxPerMeter(scr.d) * 1.3);
          s = Math.hypot(scr.x - sx, scr.y - sy) / thr;
        }
        if (it === f || (f === itClips && it.id.indexOf('clip') === 0)) s *= 0.8;
        if (s < bestS) { bestS = s; best = it; }
      }
      if (!best && itGirl.can() && girlHit(sx, sy)) best = itGirl;
      return best;
    }

    // =====================================================================================================
    // FOCUS + GUIDANCE
    function getFocus() {
      if (state.busy || state.trans || state.stage >= 8) return null;
      switch (state.stage) {
        case 0: return !wings.R.open && wings.R.target < 1 ? wings.R.item : (!wings.L.open && wings.L.target < 1 ? wings.L.item : null);
        case 1: return tw.state === 'head' && !tw.anim ? itTowel : null;
        case 2: return itDryer;
        case 3: return itBrush;
        case 4: return itLid;
        case 5: return (lid.target !== 1 || lid.v < 0.6) ? itLid : (anyTrayClip() ? itClips : null);
        case 6: return bag.worn ? null : itBag;
        case 7: return state.scene === 'genkan' && door.target === 0 ? itDoor : null;
      }
      return null;
    }
    var hint = { focus: null, nextWob: 0, demoT: -1, a: new V3(), b: new V3(), c: new V3(), spotOn: 0, fpos: new V3(), spotP: new V3(), spotT: new V3(), spotInit: false };
    function updateGuidance(dt, t) {
      var f = getFocus(), dragging = !!ptr.item;
      if (f !== hint.focus) {
        if (hint.focus && hint.focus.glow) hint.focus.glow(0);
        if (hint.focus) hint.focus.pv = 0;
        hint.focus = f; idleT = 0; hint.demoT = -1; hint.nextWob = clock + 1.6;
        finger.setOpacity(0);
        if (f) { f.pos(tA); glance(tA, 2.2); }
      }
      idleT += dt;
      var quiet = !f || dragging || state.trans;
      if (f) {
        f.pos(hint.fpos);
        var pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.3));
        if (f.glow) f.glow(dragging ? 0.25 : pulse);
      }
      // sunbeam
      var on = f && !dragging ? 1 : 0;
      hint.spotOn = damp(hint.spotOn, on, 2.5, dt);
      if (f) {
        var gk = state.scene === 'genkan';
        hint.spotT.copy(hint.fpos);
        tA.copy(hint.fpos); tA.x -= gk ? 0.6 : 0.45; tA.y += gk ? 1.6 : 1.25; tA.z += gk ? 1.2 : 0.75;
        if (!hint.spotInit) { hint.spotP.copy(tA); spot.target.position.copy(hint.spotT); hint.spotInit = true; }
        hint.spotP.lerp(tA, al(3, dt));
        spot.target.position.lerp(hint.spotT, al(3, dt));
        spot.angle = gk ? 0.11 : 0.12;
      }
      spot.position.copy(hint.spotP);
      spot.intensity = (state.scene === 'genkan' ? 14 : 9) * hint.spotOn;
      spot.target.updateMatrixWorld();
      if (quiet) { if (hint.demoT >= 0) { hint.demoT = -1; finger.setOpacity(0); } if (f) f.pv = 0; return; }
      // wobble + chime
      if (idleT > 1.5 && clock >= hint.nextWob) {          // a first quiet nudge, then nudges with a chime
        hint.nextWob = clock + 2.5;
        if (idleT > 3.5) { wobble(f, 1); sndAt('hint', hint.fpos, 0.55); } else wobble(f, 0.7);
        glance(hint.fpos, 2);
      }
      // demo finger
      if (idleT > 6.5) {
        if (hint.demoT < 0) hint.demoT = 0;
        hint.demoT += dt;
        demoFinger(f, hint.demoT % 3.4);
      } else if (hint.demoT >= 0) { hint.demoT = -1; finger.setOpacity(0); f.pv = 0; }
    }
    function demoFinger(f, ph) {
      if (!f.demo) { finger.setOpacity(0); return; }
      f.demo(hint.a, hint.b, hint.c);
      var op = 0, u = 0, pv = 0;
      if (ph < 0.35) { op = ph / 0.35; u = 0; }
      else if (ph < 1.95) { op = 1; u = (ph - 0.35) / 1.6; pv = Math.sin(Math.PI * u); }
      else if (ph < 2.3) { op = 1 - (ph - 1.95) / 0.35; u = 1; }
      else { op = 0; u = 1; }
      f.pv = pv;
      var e = ease.inOut(u), g = finger.group;
      if (e < 0.45) g.position.lerpVectors(hint.a, hint.b, e / 0.45);
      else g.position.lerpVectors(hint.b, hint.c, (e - 0.45) / 0.55);
      if (f.wave && u > 0.55) { var wv = Math.sin((u - 0.55) * Math.PI * 7) * 0.025 * Math.sin(Math.PI * (u - 0.55) / 0.45); g.position.x += wv; g.position.y += wv * 0.4; }
      // orientation: tip at the point, body toward the viewer and down-screen
      tA.subVectors(camera.position, g.position).normalize();
      tB.setFromMatrixColumn(camera.matrixWorld, 1).negate();
      tC.setFromMatrixColumn(camera.matrixWorld, 0);
      tC.multiplyScalar(0.6).addScaledVector(tB, 0.75).addScaledVector(tA, 0.35).normalize();   // local +Y (finger body): from the lower right, mostly in the screen plane
      tD.copy(tA).addScaledVector(tC, -tA.dot(tC)).normalize();      // local +Z (nail toward the viewer)
      tE.crossVectors(tC, tD);                                        // local +X
      m4.makeBasis(tE, tC, tD); g.quaternion.setFromRotationMatrix(m4);
      var d = camera.position.distanceTo(g.position);
      g.position.addScaledVector(tA, 0.05);                          // hover just in front of the surface
      g.scale.setScalar(2.0 * clamp(d / 1.9, 1, 2.2));
      finger.setOpacity(op);
    }

    // =====================================================================================================
    // STAGE LOGIC
    function stageChecks() {
      hair.setAutoDry(state.stage >= 3 || (state.stage === 2 && dr.done) ? 0.5 : 0);   // the last damp strands finish on their own
      if (state.busy || state.trans) return;
      var s = state.stage;
      if (s === 0 && wings.R.open && wings.L.open) {
        state.busy = true;
        snd('reveal'); girl.react('wake'); shotTo('work', 1.4);
        sched(1.3, function () { if (state.stage === 0) state.stage = 1; state.busy = false; dirty(); });
        dirty();
      } else if (s === 2) {
        var w = hair.wetness;
        if (w < 0.24 || (dr.blowT > 9 && w < 0.6) || dr.blowT > 15) {
          state.busy = true; dr.done = true;
          sched(0.6, function () { snd('sparkle'); girl.headAnchor.getWorldPosition(tA); tA.y += 0.04; sparkleBurst(tA, 14, 0.14); girl.react('surprise'); });
          sched(1.5, function () { snd('giggle'); girl.react('happy'); setBaseSmile(0.5); });
          sched(2.0, function () { if (state.stage === 2) state.stage = 3; state.busy = false; dirty(); });
        }
      } else if (s === 3) {
        var sm = hair.smoothness;
        if (sm > 0.85 || (br.contactT > 20 && sm > 0.6)) {
          state.busy = true;
          sched(0.6, function () { if (hair.cowlick.state === 'none') hair.cowlick.pop(); });
          sched(1.6, function () { if (state.stage === 3) state.stage = 4; state.busy = false; dirty(); });
        }
      }
    }
    var popV = new V3();
    hair.onPop = function (count) {
      count = count || 1;
      var head = popV; hair.cowlick.tip(head);
      sndAt('boing', head, 0.9, Math.min(1 + 0.05 * (count - 1), 1.4));
      if (count === 1) girl.react('surprise');
      if (count % 3 === 0) { snd('giggle', 0.8); smileBoost(1); }
    };

    // ---------------------------------------------------------------- transition to the genkan
    var veil = { el: document.getElementById('veil'), v: 0, from: 0, to: 0, k: 1, dur: 1, last: -1 };
    function veilTo(v, dur) { veil.from = veil.v; veil.to = v; veil.k = 0; veil.dur = dur; }
    function updateVeil(dt) {
      if (veil.k < 1) { veil.k = Math.min(1, veil.k + dt / veil.dur); veil.v = lerp(veil.from, veil.to, ease.inOut(veil.k)); }
      if (veil.el && Math.abs(veil.v - veil.last) > 0.002) { veil.last = veil.v; veil.el.style.opacity = veil.v.toFixed(3); }
    }
    function startTransition() {
      if (state.trans || state.scene !== 'dresser') return;
      forceRelease();
      state.trans = true; state.busy = true;
      snd('whoosh');
      veilTo(1, 0.6);
      sched(0.65, function () {
        toGenkan();
        veilTo(0, 0.9);
        sched(0.9, function () { state.trans = false; state.busy = false; dirty(); });
      });
    }
    function settleHair() {
      girl.update(0.016, clock); girl.group.updateMatrixWorld(true);
      try { hair.restore(hair.serialize()); } catch (e) { /* */ }
    }
    function toGenkan() {
      ensureLate();
      dryerRelease(); brushRelease();
      sets.activate('genkan'); state.scene = 'genkan';
      props.group.visible = false;
      girl.setPose('stand'); girl.group.position.fromArray(P.girlGenkan);
      girl.setWindFace(0); girl.lookAt(null);
      mom.group.visible = true; mom.group.position.fromArray(P.momGenkan); mom.setWalk(0); mom.reach(0);
      door.v = 0; door.p = 0; door.target = 0; door.drag = false;
      G.door.setOpen(0); G.door.setHandle(0); G.setDaylight(0);
      hair.setWind(null);
      shotSnap('genkan');
      audio.ambience('room', 0); audio.ambience('outside', 0.25); audio.ambience('breeze', 0);
      audio.musicBox.stop();
      state.stage = 7;
      settleHair();
      killTransient();
    }

    // ---------------------------------------------------------------- ending
    var endT = { on: false, t: 0, phase: '', arriveT: 0, walk: 0, momWalk: 0, nextStep: 0, stepSide: 1, day: 0, gx: 0, gz: 0, breezeO: new V3(0, 1.0, -4), breezeD: new V3(0, 0, 1), done1: false, done2: false, done3: false, done4: false };
    function startEnding() {
      state.stage = 8; state.busy = true;
      forceRelease();
      endT.on = true; endT.t = 0; endT.phase = 'wait'; endT.walk = 0; endT.momWalk = 0; endT.day = 1;
      endT.done1 = endT.done2 = endT.done3 = endT.done4 = false;
      G.setDaylight(1);
      audio.ambience('outside', 0.8); audio.ambience('breeze', 0.4);
      girl.react('happy'); setBaseSmile(0.6);
      mom.reach(1);
      dirty();
    }
    function updateEnding(dt, t) {
      if (!endT.on) return;
      endT.t += dt;
      var e = endT, g = girl.group.position, m = mom.group.position;
      hair.setWind(e.breezeO, e.breezeD, 0.15 + 0.07 * GF.noise2(t * 0.4, 2.3));
      tA.copy(m); tA.y += 1.45; girl.lookAt(tA); lookT = 0;
      var tx = m.x - 0.40, tz = m.z;
      if (e.phase === 'wait' && e.t > 0.7) { e.phase = 'toMum'; girl.setWalk(1); shotTo('ending', 3.2); e.nextStep = clock + 0.2; }
      if (e.phase === 'toMum') {
        e.walk = damp(e.walk, 1, 4, dt);
        var dx = tx - g.x, dz = tz - g.z, dist = Math.sqrt(dx * dx + dz * dz), stepL = 0.55 * e.walk * dt;
        if (dist <= stepL + 0.005) { g.x = tx; g.z = tz; e.phase = 'hold'; e.arriveT = e.t; girl.setWalk(0); }
        else { g.x += dx / dist * stepL; g.z += dz / dist * stepL; }
        if (dist < 0.7) girl.holdHand(1);
      }
      if (e.phase === 'hold' || e.phase === 'away') {
        var at = e.t - e.arriveT;
        if (!e.done1 && at > 0.3) { e.done1 = true; girl.react('happy'); snd('giggle'); }
        if (!e.done2 && at > 0.8) { e.done2 = true; snd('ending'); }
        if (e.phase === 'hold' && at > 2.0) { e.phase = 'away'; girl.setWalk(1); mom.setWalk(1); e.nextStep = clock + 0.15; }
        if (!e.done3 && at > 2.8) { e.done3 = true; veilTo(1, 2.5); }
        if (!e.done4 && at > 6.5) { e.done4 = true; newMorning(); return; }
      }
      if (e.phase === 'away') {
        e.walk = damp(e.walk, 1, 4, dt); e.momWalk = damp(e.momWalk, 1, 3, dt);
        g.z -= 0.55 * e.walk * dt; m.z -= 0.55 * e.momWalk * dt;
      }
      var walking = e.phase === 'toMum' || e.phase === 'away';
      if (walking && clock >= e.nextStep) { e.stepSide = -e.stepSide; snd('step', 0.45, 0.95 + Math.random() * 0.1, e.stepSide * 0.15); e.nextStep = clock + 0.362; }
    }
    function updateHold() {
      if (state.scene !== 'genkan') return;
      mom.group.updateMatrixWorld(true);
      mom.handL.getWorldPosition(tA);
      girl.group.updateMatrixWorld(true);
      girl.group.worldToLocal(tA);
      if (girl.holdTarget && isFinite(tA.x + tA.y + tA.z)) girl.holdTarget.copy(tA);
    }

    // ---------------------------------------------------------------- world reset / new morning
    function forceRelease() {
      if (ptr.item) {
        var it = ptr.item; ptr.item = null;
        try { if (ptr.dragging && it.up) it.up(false); } catch (e) { /* */ }
      }
      ptr.id = null; ptr.dragging = false;
      try { if (dr.held) dryerRelease(); if (br.held) brushRelease(); } catch (e) { /* */ }
    }
    function resetWorld() {
      forceRelease();
      queue.length = 0;
      state.busy = false; state.trans = false; endT.on = false;
      ['R', 'L'].forEach(function (s) { var w = wings[s]; w.v = 0; w.target = 0; w.drag = false; w.open = false; w.off = 0; w.api.setOpen(0); });
      tw.state = 'head'; tw.p = 0; tw.dx = 0; tw.anim = false; tw.drag = false;
      towelP.setState('head'); towelP.setSlide(0, 0); girl.setTowelOn(true);
      dr.held = false; dr.glide.active = false; dr.blowT = 0; dr.done = false;
      dryer.group.position.copy(dryer.home.position); dryer.group.quaternion.copy(dryer.home.quaternion); dryer.setOn(false); dryer.updateCord();
      audio.dryer.set(false, 0);
      br.held = false; br.glide.active = false; br.contactT = 0;
      brushP.group.position.copy(brushP.home.position); brushP.group.quaternion.copy(brushP.home.quaternion);
      audio.brush.set(0);
      tissue.reset();
      tissue.group.rotation.z = tissueBase.rz; tissue.group.position.y = tissueBase.y;
      lid.v = 0; lid.target = 0; lid.drag = false; lid.ever = false; mbox.setLid(0); mbox.setSpin(0);
      audio.musicBox.stop(); audio.musicBox.setRate(1);
      clipSt.forEach(function (st) {
        if (st.c.group.parent !== props.group) props.group.add(st.c.group);
        st.c.group.position.copy(st.c.home.position); st.c.group.quaternion.copy(st.c.home.quaternion);
        st.mode = 'tray'; st.pin = false; st.slide.on = false; st.glide.active = false;
      });
      bag.worn = false; bag.held = false; bag.glide.active = false;
      pochette.setWorn(false); pochette.group.position.copy(pochette.home.position); pochette.group.quaternion.copy(pochette.home.quaternion);
      door.v = 0; door.p = 0; door.target = 0; door.drag = false;
      if (G) { G.door.setOpen(0); G.door.setHandle(0); G.setDaylight(0); }
      if (mom) { mom.group.visible = false; mom.group.position.fromArray(P.momGenkan); mom.setWalk(0); mom.reach(0); }
      girl.setPose('sit'); girl.group.position.set(0, 0, 0); girl.setWalk(0); girl.holdHand(0);
      girl.setFace({ sleepy: 1, smile: 0, blink: 0, squint: 0, mouthO: 0, gazeX: 0, gazeY: 0 });
      baseSmile = 0; smileBoostT = 0; brushFace = false; lookT = 0;
      girl.lookAt(null); girl.setWindFace(0);
      sets.activate('dresser'); state.scene = 'dresser'; props.group.visible = true;
      D.setCurtainWind(0);
      hair.setWind(null);
      girl.update(0.016, clock); girl.group.updateMatrixWorld(true);
      hair.setAutoDry(0);
      hair.setPreset('wet'); hair.restore({ c: 'none', n: 0 }); hair.setTowel(1);
      audio.ambience('room', 0.5); audio.ambience('outside', 0); audio.ambience('breeze', 0);
      state.stage = 0;
      shotSnap('intro');
      killTransient();
      finger.setOpacity(0);
      if (hint.focus && hint.focus.glow) hint.focus.glow(0);
      if (hint.focus) hint.focus.pv = 0;
      hint.focus = null; idleT = 0;
    }
    function newMorning() {
      resetWorld();
      state.round++;
      veil.v = 1; veilTo(0, 1.2);
      save();
    }

    // ---------------------------------------------------------------- save / restore
    var saveAt = -1;
    function dirty() { saveAt = clock + 1.0; }
    function r4(v) { return Math.round(v * 10000) / 10000; }
    function snapshot() {
      var clips = clipSt.map(function (st) {
        if (st.mode !== 'hair') return { a: 0 };
        var g = st.c.group;
        return { a: 1, p: [r4(g.position.x), r4(g.position.y), r4(g.position.z)], q: [r4(g.quaternion.x), r4(g.quaternion.y), r4(g.quaternion.z), r4(g.quaternion.w)], pin: st.pin || st.slide.on ? 1 : 0 };
      });
      var hs = null; try { hs = hair.serialize(); } catch (e) { hs = null; }
      var stg = state.stage; if (stg >= 8) stg = 7;
      return { v: 1, stage: stg, round: state.round, wings: [wings.L.open || wings.L.target === 1 ? 1 : 0, wings.R.open || wings.R.target === 1 ? 1 : 0],
        towel: tw.state === 'hung' || tw.anim ? 'hung' : 'head', hair: hs, cow: hair.cowlick.state, lid: lid.target === 1 ? 1 : 0,
        clips: clips, bag: bag.worn ? 1 : 0, tissue: tissue.count | 0 };
    }
    function save() { saveAt = -1; try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); } catch (e) { /* storage refused */ } }
    function fin(a, n) { if (!Array.isArray(a) || a.length !== n) return false; for (var i = 0; i < n; i++) if (typeof a[i] !== 'number' || !isFinite(a[i])) return false; return true; }
    function restore() {
      var d = null;
      try { var s = window.localStorage.getItem(SAVE_KEY); if (s) d = JSON.parse(s); } catch (e) { d = null; }
      if (!d || typeof d !== 'object' || d.v !== 1) return;
      try { applySave(d); } catch (e) { try { resetWorld(); } catch (e2) { /* */ } }
    }
    function applySave(d) {
      var st = Math.floor(+d.stage); if (!(st >= 0)) st = 0; st = Math.min(8, st); if (st === 8) st = 7;
      var rd = Math.floor(+d.round); state.round = rd >= 0 && rd < 1e6 ? rd : 0;
      var bagWorn = d.bag === 1 || d.bag === true;
      if (st === 6 && bagWorn) st = 7;
      if (st === 7) bagWorn = true;
      if (st < 6) bagWorn = false;
      var wl = Array.isArray(d.wings) && d.wings[0] === 1, wr = Array.isArray(d.wings) && d.wings[1] === 1;
      if (st >= 1) wl = wr = true;
      if (st === 0 && wl && wr) st = 1;
      if (wl) { wings.L.v = 1; wings.L.target = 1; wings.L.open = true; wings.L.api.setOpen(1); }
      if (wr) { wings.R.v = 1; wings.R.target = 1; wings.R.open = true; wings.R.api.setOpen(1); }
      if (st >= 2) { tw.state = 'hung'; tw.p = 1; towelP.setState('hung'); girl.setTowelOn(false); hair.setTowel(0); }
      if (st >= 1) { girl.setFace({ sleepy: 0 }); setBaseSmile(st >= 2 ? 0.5 : 0.2); shotSnap('work'); }
      // hair
      girl.update(0.016, clock); girl.group.updateMatrixWorld(true);
      if (st >= 2 && d.hair && typeof d.hair === 'object') hair.restore(d.hair);
      var cow = 'none';
      if (st >= 4) cow = (d.cow === 'pinned' || d.cow === 'up') ? d.cow : 'up';
      // tissues
      var tn = Math.floor(+d.tissue); if (st >= 2 && tn > 0) tissue.restore(Math.min(tn, 40));
      // lid
      if (st >= 5 && d.lid === 1) { lid.v = 1; lid.target = 1; lid.ever = true; mbox.setLid(1); mbox.setSpin(2.2); audio.musicBox.start(); }
      else if (st >= 5) lid.ever = true;
      // clips
      var anyPin = false, anyOn = false;
      if (st >= 5 && Array.isArray(d.clips)) {
        for (var i = 0; i < clipSt.length && i < d.clips.length; i++) {
          var c = d.clips[i];
          if (!c || c.a !== 1 || !fin(c.p, 3) || !fin(c.q, 4)) continue;
          if (Math.abs(c.p[0]) > 0.3 || Math.abs(c.p[1]) > 0.3 || Math.abs(c.p[2]) > 0.3) continue;
          qA.set(c.q[0], c.q[1], c.q[2], c.q[3]); if (qA.length() < 0.5) continue; qA.normalize();
          var cs = clipSt[i];
          girl.headAnchor.add(cs.c.group);
          cs.c.group.position.set(c.p[0], c.p[1], c.p[2]); cs.c.group.quaternion.copy(qA);
          cs.mode = 'hair'; anyOn = true;
          if (c.pin === 1 && !anyPin && cow !== 'none') { cs.pin = true; anyPin = true; }
        }
      }
      if (anyPin) cow = 'pinned'; else if (cow === 'pinned') cow = 'up';
      if (st >= 4) hair.restore({ c: cow }); else hair.restore({ c: 'none' });
      if (st === 5 && anyOn) st = 6;
      if (bagWorn) { bag.worn = true; pochette.setWorn(true); }
      state.stage = st;
      if (st === 7) toGenkan();
      else settleHair();
    }

    // ---------------------------------------------------------------- input
    function onDown(e) {
      try {
        if (ptr.id !== null) return;
        if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse') return;
        ptr.id = e.pointerId; ptr.sx = ptr.x0 = e.clientX; ptr.sy = ptr.y0 = e.clientY; ptr.t0 = performance.now(); ptr.maxMove = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (e1) { /* */ }
        if (!unlocked) { unlocked = true; }
        audio.unlock();
        idleT = 0; hint.nextWob = clock + 3.5;
        if (hint.demoT >= 0) { hint.demoT = -1; finger.setOpacity(0); if (hint.focus) hint.focus.pv = 0; }
        if (paused) return;
        setRay(ptr.sx, ptr.sy);
        if (state.stage >= 8 || state.trans) {
          tA.copy(ray.origin).addScaledVector(ray.direction, 1.4); sparkleBurst(tA, 6, 0.05);
          if (state.stage >= 8) snd('sparkle', 0.35, 1.2);
          return;
        }
        if (state.busy && state.stage === 6 && bag.worn) return;
        var it = pick(ptr.sx, ptr.sy);
        if (!it) return;
        var drag = it.down ? it.down() : false;
        if (drag) { ptr.item = it; ptr.dragging = true; if (it.drag) it.drag(1 / 60); }
      } catch (err) { ptr.item = null; ptr.dragging = false; }
    }
    function onMove(e) {
      if (e.pointerId !== ptr.id) return;
      ptr.sx = e.clientX; ptr.sy = e.clientY;
      var m = Math.hypot(ptr.sx - ptr.x0, ptr.sy - ptr.y0); if (m > ptr.maxMove) ptr.maxMove = m;
    }
    function onUp(e) {
      if (e.pointerId !== ptr.id) return;
      if (e.clientX !== undefined && e.type === 'pointerup') { ptr.sx = e.clientX; ptr.sy = e.clientY; }
      var it = ptr.item, tap = (performance.now() - ptr.t0) < 300 && ptr.maxMove < 12;
      ptr.id = null; ptr.item = null; ptr.dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (e1) { /* */ }
      if (it && it.up) { try { setRay(ptr.sx, ptr.sy); it.up(tap); } catch (err) { /* */ } }
      idleT = 0;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
    var stop = function (e) { if (e.cancelable) e.preventDefault(); };
    ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'contextmenu', 'dblclick', 'selectstart', 'dragstart'].forEach(function (n) {
      document.addEventListener(n, stop, { passive: false });
    });

    // ---------------------------------------------------------------- performance
    // 1 s windows of real frame times; resolution steps down below ~42 fps and back up only after 3 s of smooth
    // frames, never above a level that just failed (no resize ping-pong, which itself stutters)
    var perf = { acc: 0, n: 0, slow: 0, nextCheck: 3, slowAtMin: 0, good: 0, ceil: 1, upAt: -10 };
    function enterLowPower() {
      if (state.lowPower) return;
      state.lowPower = true;
      try { D.mirror.setSize(256); } catch (e) { /* */ }
      try { if (D.lights && D.lights.key) D.lights.key.castShadow = false; if (G && G.lights && G.lights.sun) G.lights.sun.castShadow = false; } catch (e) { /* */ }
      try { hair.setDetail(0.6); } catch (e) { /* */ }
      pCap = 60;
    }
    if (low) { try { D.mirror.setSize(256); hair.setDetail(0.6); } catch (e) { /* */ } }
    function perfStep(rawDt) {
      if (rawDt <= 0 || rawDt > 1) return;                     // tab switches etc. are not load
      perf.acc += rawDt; perf.n++; if (rawDt > 0.024) perf.slow++;
      if (clock < perf.nextCheck || perf.n < 20) return;
      perf.nextCheck = clock + 1;
      var ft = perf.acc / perf.n * 1000, slow = perf.slow / perf.n, s = view.scale;
      perf.acc = 0; perf.n = 0; perf.slow = 0;
      if (slow > 0.5) {                                        // most frames slow (a single compile hitch is not)
        perf.good = 0;
        if (s > 0.601) {
          if (clock - perf.upAt < 3.5) perf.ceil = Math.max(0.6, s - 0.1);
          view.scale = Math.max(0.6, Math.round((s - 0.1) * 10) / 10); resize();
        } else if (!state.lowPower && ++perf.slowAtMin >= 2) enterLowPower();
      } else if (ft < 18.5 && slow < 0.1 && s < perf.ceil - 0.001) {
        if (++perf.good >= 3) { perf.good = 0; view.scale = Math.min(perf.ceil, Math.round((s + 0.1) * 10) / 10); perf.upAt = clock; perf.slowAtMin = 0; resize(); }
      } else perf.good = 0;
    }

    // ---------------------------------------------------------------- frame
    var paused = false, hiddenFlag = false, raf = 0, lastNow = -1, mirrorFrame = 0, revealed = false;
    function step(dt) {
      var t = clock;
      // active drag follows the finger (camera matrices from the last frame are fine)
      if (ptr.item && ptr.dragging && ptr.item.drag) { setRay(ptr.sx, ptr.sy); ptr.item.drag(dt); }
      runQueue();
      stageChecks();
      updateWings(dt);
      updateTowel(dt);
      updateGlide(dr.glide, dt);
      updateGlide(br.glide, dt);
      updateGlide(bag.glide, dt);
      updateLid(dt);
      updateClips(dt);
      updateDoor(dt);
      updateWobbles(dt);
      updateGuidance(dt, t);
      updateEnding(dt, t);
      if (smileBoostT > 0) { smileBoostT -= dt; if (smileBoostT <= 0 && !brushFace) setBaseSmile(baseSmile); }
      if (!endT.on) { if (lookT > 0) { lookT -= dt; girl.lookAt(lookP); } else girl.lookAt(null); }
      if (state.scene === 'genkan' && mom) mom.update(dt, t);
      updateHold();
      girl.update(dt, t);
      hair.update(dt, t);
      props.update(dt, t);
      if (state.scene === 'dresser') D.update(dt, t); else G.update(dt, t);
      updateVeil(dt);
      updateCamera(dt, t);
      updateParticles(dt, t);
      audio.update(dt);
      if (saveAt > 0 && clock > saveAt) save();
    }
    // ---------------------------------------------------------------- shader compilation / background preparation
    // The first frame only needs the dresser room with the mirror shut. Everything else (the mirror's shader variants,
    // the wing mirrors' room capture, the genkan set + Mum, their shaders and shadow programs, the other set's
    // variants) is prepared afterwards, one small task at a time between frames, while no finger is down — so the
    // game appears quickly and later moments (opening the mirror, the genkan scene) still do not stutter.
    var parallelGL = false;
    try { parallelGL = !!renderer.extensions.get('KHR_parallel_shader_compile'); } catch (e) { parallelGL = false; }
    var stash = [];
    // compile only the materials of what can appear with the given set (renderer.compile walks the whole scene,
    // hidden objects included, which would also build useless variants of the other set under these lights).
    // Returns a promise that resolves when the programs are ready (driver-parallel compilation when available)
    function compileFor(name, mirrorToo) {
      var excl = name === 'dresser' ? [G && G.group, mom && mom.group] : [sets.dresser.group, props.group];
      for (var i = 0; i < excl.length; i++) if (excl[i]) excl[i].traverse(function (o) { if (o.material) { stash.push(o, o.material); o.material = null; } });
      var waits = [];
      try {
        if (mirrorToo) D.mirror.prewarm(renderer, scene, camera, parallelGL ? waits : null);
        else if (parallelGL) waits.push(renderer.compileAsync(scene, camera));
        else renderer.compile(scene, camera);
      } finally {
        for (var j = 0; j < stash.length; j += 2) stash[j].material = stash[j + 1];
        stash.length = 0;
      }
      return Promise.all(waits);
    }
    // the other set: show it for a moment (inside render(), before the real pass overdraws it) to compile its
    // programs and draw it once so its shadow programs and textures are on the GPU too
    function prepareSet(name, drawToo) {
      var pv = props.group.visible, mv = mom ? mom.group.visible : false, cur = state.scene, wait = null;
      sets.activate(name);
      props.group.visible = name === 'dresser'; if (mom) mom.group.visible = name === 'genkan';
      try {
        scene.updateMatrixWorld();
        if (drawToo) { compileFor(name, false); renderer.render(scene, camera); }
        else wait = compileFor(name, name === 'dresser');
      } finally { sets.activate(cur); props.group.visible = pv; if (mom) mom.group.visible = mv; scene.updateMatrixWorld(); }
      return wait;
    }
    var bg = { list: [], next: 0.8, wait: false, holdT: 0, skip: 0 };   // first task a moment after the first frame
    function bgPlan() {
      bg.list.length = 0;
      if (state.scene === 'dresser') {
        bg.list.push(function () { return compileFor('dresser', true); });               // mirror pass + reflection variants
        bg.list.push(function () { if (state.scene === 'dresser') D.mirror.capture(renderer, scene); }); // wing mirrors
      } else {
        bg.list.push(function () { return prepareSet('dresser', false); });
      }
      bg.list.push(function () { sets.ensureGenkan('textures'); });
      bg.list.push(function () { ensureGenkan(); });
      bg.list.push(function () { ensureMom(); });
      if (state.scene === 'dresser') {
        bg.list.push(function () { return prepareSet('genkan', false); });
        bg.list.push(function () { if (state.scene === 'dresser') prepareSet('genkan', true); });
      }
    }
    function bgPump(dt) {
      if (!bg.list.length || bg.wait) return;
      // not while a finger is dragging something (unless it goes on for long), not during a scene change
      if ((ptr.id !== null && (bg.holdT += dt) < 4) || state.trans) { bg.next = Math.max(bg.next, clock + 0.3); return; }
      if (clock < bg.next) return;
      bg.holdT = 0;
      var fn = bg.list.shift(), r = null;
      try { r = fn(); } catch (e) { r = null; }
      bg.skip = 2;
      bg.next = clock + 0.15;
      if (r && r.then) {
        bg.wait = true;
        var done = function () { bg.wait = false; bg.next = clock + 0.1; };
        r.then(done, done);
        setTimeout(done, 8000);   // never stall the queue on a driver that does not report completion
      }
    }
    function render(dt) {
      bgPump(dt);
      // world matrices once per frame (the mirror pass and the main pass would each walk the whole scene again)
      scene.updateMatrixWorld();
      scene.matrixWorldAutoUpdate = false;
      try {
        if (state.scene === 'dresser') {
          mirrorFrame++;
          if (!state.lowPower || (mirrorFrame & 1) === 0) D.mirror.update(renderer, scene, camera);
        }
        renderer.render(scene, camera);
      } finally { scene.matrixWorldAutoUpdate = true; }
    }
    function frame(now) {
      raf = 0;
      if (paused || hiddenFlag) return;
      raf = requestAnimationFrame(frame);
      // 120 Hz displays (ProMotion iPad): draw every other refresh. Same motion, half the GPU work and heat,
      // so the device does not throttle into uneven frames later on
      if (lastNow >= 0 && now - lastNow < 10.5) return;
      var rawDt = lastNow < 0 ? 1 / 60 : (now - lastNow) / 1000;
      lastNow = now;
      var dt = clamp(rawDt, 0, 0.05);
      clock += dt;
      try { step(dt); render(dt); } catch (e) { /* keep the game alive */ }
      if (!revealed) { revealed = true; reveal(); }
      if (bg.skip > 0) bg.skip--; else perfStep(rawDt);   // a background task's frame is not a sign of load
    }
    function startLoop() { if (!raf && !paused && !hiddenFlag) { lastNow = -1; raf = requestAnimationFrame(frame); } }
    function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function onHide() {
      if (hiddenFlag) return;
      hiddenFlag = true;
      forceRelease(); save();
      audio.suspend(); stopLoop();
    }
    function onShow() {
      if (!hiddenFlag) return;
      hiddenFlag = false;
      audio.resume(); lastNow = -1; resize(); startLoop();
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) onHide(); else onShow(); });
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', function () { if (!document.hidden) onShow(); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); paused = true; forceRelease(); stopLoop(); }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      try { var old = scene.environment; scene.environment = GF.makeEnv(renderer); if (old && old.dispose) old.dispose(); } catch (e) { /* */ }
      paused = false; lastNow = -1; resize(); startLoop();
    }, false);

    // ---------------------------------------------------------------- go
    resetWorld();
    restore();
    if (state.stage >= 1 && state.scene === 'dresser') shotSnap('work');
    GF.game = { state: state, camera: camera, scene: scene, sets: sets, props: props, girl: girl, hair: hair, audio: audio };
    Object.defineProperty(GF.game, 'mom', { get: function () { return mom; }, enumerable: true });
    if (document.hidden) hiddenFlag = true;
    updateCamera(0, 0);
    // first picture: compile only what the opening view shows (in parallel where the driver can), then start;
    // the poster in the page stays up until the first real frame is drawn
    bgPlan();
    var booted = false;
    function go() { if (booted) return; booted = true; startLoop(); }
    var first = null;
    try {
      scene.updateMatrixWorld();
      var mirrorOpen = state.scene === 'dresser' && (wings.L.v > 0.015 || wings.R.v > 0.015);
      first = compileFor(state.scene, mirrorOpen);
    } catch (e) { first = null; }
    if (first && parallelGL) { first.then(go, go); setTimeout(go, 6000); } else go();
  }

  // let the browser paint the poster first, then build (the build blocks the page for a moment)
  var started = false;
  function kick() {
    if (started) return;
    started = true;
    setTimeout(start, 0);
  }
  function boot() {
    try { requestAnimationFrame(kick); } catch (e) { /* */ }
    setTimeout(kick, 120);   // hidden tabs get no animation frames
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

