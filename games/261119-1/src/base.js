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
        e.mat.emissiveIntensity = e.baseI + (0.55 - e.baseI) * v;
      }
    };
  };
})();
