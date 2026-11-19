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
        if (img.indexOf('data:') === 0) fb.style.backgroundImage = 'url("' + img + '")';
        fb.style.display = 'block';
      }
    } catch (e) { /* nothing more we can do */ }
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
    var mom = GF.createMom ? GF.createMom({ low: low }) : { group: new T.Group(), handL: new T.Object3D(), reach: function () {}, setWalk: function () {}, update: function () {} };
    var hair = GF.createHair({ anchor: girl.headAnchor, low: low });
    var audio = null;
    try { audio = GF.createAudio ? GF.createAudio() : null; } catch (e) { audio = null; }
    if (!audio) audio = noopAudio();
    scene.add(sets.root, props.group, girl.group, hair.group, mom.group);
    girl.headAnchor.add(props.towel.head);
    girl.torsoAnchor.add(props.pochette.worn);
    scene.updateMatrixWorld(true);
    scene.attach(props.finger.group);
    props.finger.setOpacity(0);
    mom.group.position.fromArray(P.momGenkan);
    mom.group.visible = false;
    var D = sets.dresser, G = sets.genkan;
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
    var view = { w: 390, h: 844, left: 0, top: 0, dpr: 1, scale: 1, bufH: 844 };
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
        view.dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(view.dpr * view.scale);
        renderer.setSize(view.w, view.h, false);
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
      G.door.setOpen(0); G.door.setHandle(0); G.setDaylight(0);
      mom.group.visible = false; mom.group.position.fromArray(P.momGenkan); mom.setWalk(0); mom.reach(0);
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
    var perf = { ft: 16, nextCheck: 3, slowAtMin: 0 };
    function enterLowPower() {
      if (state.lowPower) return;
      state.lowPower = true;
      try { D.mirror.setSize(256); } catch (e) { /* */ }
      try { if (D.lights && D.lights.key) D.lights.key.castShadow = false; if (G.lights && G.lights.sun) G.lights.sun.castShadow = false; } catch (e) { /* */ }
      try { hair.setDetail(0.6); } catch (e) { /* */ }
      pCap = 60;
    }
    if (low) { try { D.mirror.setSize(256); hair.setDetail(0.6); } catch (e) { /* */ } }
    function perfStep(rawDt) {
      if (rawDt <= 0 || rawDt > 0.3) return;
      perf.ft = perf.ft * 0.93 + rawDt * 1000 * 0.07;
      if (clock < perf.nextCheck) return;
      perf.nextCheck = clock + 1;
      var s = view.scale;
      if (perf.ft > 36) {
        if (s > 0.551) { view.scale = Math.max(0.55, s - 0.1); resize(); }
        else if (!state.lowPower && ++perf.slowAtMin >= 2) enterLowPower();
      } else if (perf.ft < 20 && s < 1) { view.scale = Math.min(1, s + 0.1); resize(); perf.slowAtMin = 0; }
    }

    // ---------------------------------------------------------------- frame
    var paused = false, hiddenFlag = false, raf = 0, lastNow = -1, mirrorFrame = 0;
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
      if (state.scene === 'genkan') mom.update(dt, t);
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
    function render() {
      if (state.scene === 'dresser') {
        mirrorFrame++;
        if (!state.lowPower || (mirrorFrame & 1) === 0) D.mirror.update(renderer, scene, camera);
      }
      renderer.render(scene, camera);
    }
    function frame(now) {
      raf = 0;
      if (paused || hiddenFlag) return;
      raf = requestAnimationFrame(frame);
      var rawDt = lastNow < 0 ? 1 / 60 : (now - lastNow) / 1000;
      lastNow = now;
      var dt = clamp(rawDt, 0, 0.05);
      clock += dt;
      try { step(dt); render(); } catch (e) { /* keep the game alive */ }
      perfStep(rawDt);
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
    GF.game = { state: state, camera: camera, scene: scene, sets: sets, props: props, girl: girl, mom: mom, hair: hair, audio: audio };
    if (document.hidden) hiddenFlag = true;
    updateCamera(0, 0);
    startLoop();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
