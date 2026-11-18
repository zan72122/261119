// game.js — story / stage logic for 「ういーん！パパのおたんじょうびケーキ」.
// One continuous kitchen counter; nine wordless stages driven by in-world hints.
import * as THREE from 'three';
import {
  makeCounter, makeBowl, makeCarton, makeMixer, makeSpatula, makeLighter, makeCracker,
  makePhotoFrame, makeCandleBox, makeBerryPlate,
} from './models_tools.js';
import {
  makeCakeStand, makeSponge, makeStrawberry, makeCandle, makePapa, makeRoom, makeCrayonDrawingTexture,
} from './models_party.js';
import { createBowlCream, createPourStream, createCakeCream, createSplats } from './fx_cream.js';
import { createFlame, createCandleGlow, createSmoke, createConfetti, createHints } from './fx_party.js';
import {
  clamp, clamp01, lerp, damp, easeInOut, easeOut, easeIn, backOut, createTimeline,
} from './game_util.js';
import { createWorldFx } from './game_world.js';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const UP = new V3(0, 1, 0);
const AX = new V3(1, 0, 0);
const AZ = new V3(0, 0, 1);
const QI = new THREE.Quaternion();

// ---------------------------------------------------------------- layout
const BOWL_HOME = new V3(0, 0, 0.10);
const CARTON_HOME = new V3(-0.205, 0, -0.03);
const MIXER_HOME = new V3(0.215, 0, -0.02);
const CAKE_HOME = new V3(0, 0, -0.22);
const SLOT = new V3(0, 0, 0.07);
const KNIFE_SLOT = new V3(0, 0.0006, 0.035);
const OFF = new V3(0, 0, 0.74);
const TIDY_BOWL = new V3(-0.47, 0, 0.20);
const TIDY_CARTON = new V3(-0.43, 0, -0.06);
const TIDY_MIXER = new V3(0.45, 0, 0.14);
const FRAME_POS = new V3(-0.215, 0, -0.47);
const FRAME_YAW = 22 * DEG;
const PAPA_Z = -0.98;
const PARTY_DIM = 0.1; // room level while the candles burn: Papa stays a faint silhouette
const CAKE_GIVEN_Z = -0.40;
const STAND_TOP = 0.060;
const PALETTES = [
  null,
  ['#ff9ec4', '#ffd6e8', '#a8e0ff', '#fff2a8', '#c9b6ff', '#ffffff'],
  ['#e0b040', '#f4d27a', '#ffffff', '#e8343c', '#d4d8e0'],
];

export function startGame(engine, A) {
  const scene = engine.scene, camera = engine.camera, canvas = engine.renderer.domElement;
  scene.add(camera); // lens blobs are children of the camera
  const tl = createTimeline();

  // temps (no per-frame allocations)
  const t1 = new V3(), t2 = new V3(), t3 = new V3(), t4 = new V3();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const scr = { x: 0, y: 0 };

  // ================================================================ world
  const counter = makeCounter(); engine.add(counter);
  const room = makeRoom(); engine.addBg(room);
  const papa = makePapa(); engine.addBg(papa);
  papa.visible = false;
  // party decorations: pull them a little lower so they read above Papa in the PARTY view
  room.userData.garland.position.set(0, -0.08, 0);
  room.userData.fairyLights.position.set(0, -0.02, 0);
  engine.onRoomLight((l) => {
    room.userData.setLight(l);
    A.ambience.set(0.25 + 0.75 * l);
  });

  const frame = makePhotoFrame(); frame.position.copy(FRAME_POS); frame.rotation.y = FRAME_YAW; engine.add(frame);
  const drawingTex = makeCrayonDrawingTexture();

  const bowl = makeBowl(); engine.add(bowl);
  const bowlCream = createBowlCream({ innerRadiusAt: bowl.userData.innerRadiusAt });
  bowl.add(bowlCream.object);
  const carton = makeCarton(); engine.add(carton);
  const pour = createPourStream(); engine.add(pour.object);
  const mixer = makeMixer(); engine.add(mixer);
  const mixerRest = mixer.userData.restPose;

  const cake = new THREE.Group(); cake.name = 'cakeRoot'; engine.add(cake);
  const stand = makeCakeStand(); cake.add(stand);
  const sponge = makeSponge(); sponge.position.y = STAND_TOP; cake.add(sponge);
  const cakeCream = createCakeCream({ radius: 0.105, height: 0.075 });
  sponge.add(cakeCream.object);
  const CAKE_TOP = STAND_TOP + cakeCream.topY(); // local y of the coat top

  const spatula = makeSpatula(); engine.add(spatula);
  const plate = makeBerryPlate(); engine.add(plate);
  const box = makeCandleBox(); engine.add(box);
  const lighter = makeLighter(); engine.add(lighter);
  const lighterFlame = createFlame({ scale: 1.3 });
  lighter.userData.tip.add(lighterFlame.object);
  const cracker = makeCracker(); engine.add(cracker);

  const items = [];
  for (let i = 0; i < 6; i++) items.push({ obj: makeStrawberry(i), kind: 'berry', idx: i, state: 'tray', local: new V3(), flame: null, lit: false });
  for (let i = 0; i < 5; i++) {
    const c = makeCandle(i);
    const fl = createFlame();
    c.userData.wickTop.add(fl.object);
    items.push({ obj: c, kind: 'candle', idx: i, state: 'tray', local: new V3(), flame: fl, lit: false });
  }
  const berries = items.filter((it) => it.kind === 'berry');
  const candles = items.filter((it) => it.kind === 'candle');
  for (const it of items) engine.add(it.obj);

  const splats = createSplats(); engine.add(splats.object); camera.add(splats.lens);
  const glow = createCandleGlow(); scene.add(glow.light, glow.light2);
  // soft warm bounce toward the child's side: without it the cake's front goes black in candle light
  const bounce = new THREE.PointLight(0xffa860, 0, 1.6, 2);
  bounce.layers.enableAll(); bounce.castShadow = false; scene.add(bounce);
  let bounceI = 0;
  const smoke = createSmoke(); engine.add(smoke.object);
  const confetti = createConfetti({ particles: engine.quality.particles }); engine.add(confetti.object);
  const hints = createHints(); engine.add(hints.object);

  const W = createWorldFx({ THREE, tl, A, frame, drawingTex, engine });

  splats.setHeightFn((x, z) => {
    // drops falling into the bowl or onto the cake are swallowed (those move later)
    let dx = x - bowl.position.x, dz = z - bowl.position.z;
    if (bowl.visible && dx * dx + dz * dz < 0.155 * 0.155) return -0.5;
    dx = x - cake.position.x; dz = z - cake.position.z;
    if (dx * dx + dz * dz < 0.155 * 0.155) return -0.5;
    return 0;
  });
  confetti.setHeightFn((x, z) => {
    const dx = x - cake.position.x, dz = z - cake.position.z, r2 = dx * dx + dz * dz;
    if (r2 < 0.105 * 0.105) return CAKE_TOP;
    if (r2 < 0.15 * 0.15) return STAND_TOP + 0.003;
    return 0;
  });

  // ================================================================ state
  const S = {
    stage: '', busy: false, idle: 0, nudge: 0,
    poured: 0, pourDone: false, whip: 0, rub: 0,
    placed: 0, lit: 0, pops: 0, photoAt: -1, sinceTouch: 0, sincePop: 0, ending: false,
    time: 0,
  };

  // ================================================================ pointer
  const ptr = { active: false, x: 0, y: 0, ndc: new THREE.Vector2(), ray: new THREE.Ray(), wipeOnly: false, downY: 0 };
  const rc = new THREE.Raycaster();
  function refreshRay() { rc.setFromCamera(ptr.ndc, camera); ptr.ray.copy(rc.ray); }
  const plane = new THREE.Plane(new V3(0, 1, 0), 0);
  function onPlane(y, out) {
    plane.constant = -y;
    if (!ptr.ray.intersectPlane(plane, out)) return null;
    if (out.distanceToSquared(ptr.ray.origin) > 16) return null;
    return out;
  }
  const _pv = new V3();
  function toScreen(v) {
    _pv.copy(v).project(camera);
    scr.x = (_pv.x * 0.5 + 0.5) * canvas.clientWidth;
    scr.y = (-_pv.y * 0.5 + 0.5) * canvas.clientHeight;
    return scr;
  }
  function pxPerM(v) {
    const d = Math.max(0.05, _pv.copy(v).sub(camera.position).length());
    return canvas.clientHeight / (2 * d * Math.tan(camera.fov * DEG / 2));
  }
  function screenDist(v) { toScreen(v); return Math.hypot(scr.x - ptr.x, scr.y - ptr.y); }
  function isNear(v, rMeters, minPx = 70) { return screenDist(v) < Math.max(minPx, rMeters * pxPerM(v) * 1.3); }

  // ================================================================ movers
  function stopMove(obj) { const u = obj.userData; if (u._mv) { tl.cancel(u._mv); u._mv = null; } }
  function moveTo(obj, pos, quat, dur, o = {}) {
    const u = obj.userData;
    if (!u._mf) { u._mf = new V3(); u._mt = new V3(); u._qf = new THREE.Quaternion(); u._qt = new THREE.Quaternion(); }
    stopMove(obj);
    u._mf.copy(obj.position); u._mt.copy(pos);
    u._qf.copy(obj.quaternion); u._qt.copy(quat || obj.quaternion);
    const arc = o.arc || 0;
    u._mv = tl.tween(dur, (e, k) => {
      obj.position.lerpVectors(u._mf, u._mt, e);
      if (arc) obj.position.y += arc * Math.sin(Math.PI * k);
      obj.quaternion.slerpQuaternions(u._qf, u._qt, e);
    }, () => {
      u._mv = null;
      if (o.sound) A.play(o.sound, { vol: o.vol ?? 0.8 });
      if (o.settle) settle(obj, o.settle);
      if (o.done) o.done();
    }, o.ease || easeInOut);
    return u._mv;
  }
  // a small decaying rock when something is put down
  const _sAx = new V3();
  function settle(obj, amt = 1) {
    const u = obj.userData;
    if (!u._qt) return;
    u._qt.copy(obj.quaternion);
    const ax = new V3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const p0 = obj.position.y;
    u._mv = tl.tween(0.42, (e, k) => {
      const a = 0.05 * amt * Math.sin(k * Math.PI * 3) * (1 - k);
      _sAx.copy(ax);
      q3.setFromAxisAngle(_sAx, a);
      obj.quaternion.copy(q3).multiply(u._qt);
      obj.position.y = p0 + 0.002 * amt * Math.max(0, Math.sin(k * Math.PI * 2)) * (1 - k);
    }, () => { obj.quaternion.copy(u._qt); obj.position.y = p0; u._mv = null; });
  }
  function hop(obj, h = 0.012, dur = 0.32) {
    const u = obj.userData;
    if (u._hop) return;
    const y0 = obj.position.y, rx = obj.rotation.x;
    u._hop = tl.tween(dur, (e, k) => {
      obj.position.y = y0 + h * Math.sin(Math.PI * k);
      obj.rotation.x = rx - 0.12 * Math.sin(Math.PI * k) * (1 - k);
    }, () => { obj.position.y = y0; obj.rotation.x = rx; u._hop = null; });
  }

  // ---------------------------------------------------------------- carrying helper
  // follows the finger on a horizontal plane, keeps the grab offset, leans into motion
  function makeCarry() {
    return { obj: null, planeY: 0, off: new V3(), offGoal: new V3(), offRate: 0, tgt: new V3(), pos: new V3(), prev: new V3(), vel: new V3(), lx: 0, lz: 0, ok: false };
  }
  const _ch = new V3();
  function carryTarget(c, dt) {
    const h = onPlane(c.planeY, _ch);
    if (h) {
      if (c.offRate > 0) c.off.lerp(c.offGoal, 1 - Math.exp(-c.offRate * dt));
      c.tgt.set(h.x + c.off.x, 0, h.z + c.off.z);
      c.tgt.x = clamp(c.tgt.x, -1.15, 1.15);
      c.tgt.z = clamp(c.tgt.z, -0.56, 0.66);
      c.ok = true;
    }
    return c.ok;
  }
  function carryLean(c, dt) {
    c.vel.subVectors(c.pos, c.prev).multiplyScalar(1 / Math.max(dt, 1e-3));
    c.prev.copy(c.pos);
    c.lz = damp(c.lz, clamp(-c.vel.x * 0.35, -0.22, 0.22), 10, dt);
    c.lx = damp(c.lx, clamp(c.vel.z * 0.35, -0.22, 0.22), 10, dt);
  }
  function leanQuat(c, out) { eul.set(c.lx, 0, c.lz); return out.setFromEuler(eul); }
  function startCarry(c, obj, planeY, basePos) {
    c.obj = obj; c.planeY = planeY; c.ok = false; c.offRate = 0;
    c.pos.copy(basePos); c.prev.copy(basePos); c.vel.set(0, 0, 0); c.lx = 0; c.lz = 0;
    const h = onPlane(planeY, _ch);
    if (h) { c.off.set(basePos.x - h.x, 0, basePos.z - h.z); } else c.off.set(0, 0, 0);
    c.tgt.copy(basePos); c.ok = true;
  }

  // ================================================================ camera framing
  let framingName = 'PREP';
  function framing(name) {
    const land = camera.aspect > 1.05;
    switch (name) {
      case 'CAKE': return land
        ? { target: [0, 0.05, -0.04], pitch: 50, fitWidth: 0.5, fitHeight: 0.66 }
        : { target: [0, 0.07, -0.10], pitch: 42, fitWidth: 0.44, fitHeight: 0.54 };
      case 'PARTY': return land
        ? { target: [0, 0.185, -0.45], pitch: 13, fitWidth: 0.60, fitHeight: 0.74 }
        : { target: [0, 0.27, -0.52], pitch: 10, fitWidth: 0.56, fitHeight: 0.70 };
      default: return land
        ? { target: [0, 0.04, -0.03], pitch: 44, fitWidth: 0.60, fitHeight: 0.72 }
        : { target: [0, 0.04, -0.14], pitch: 48, fitWidth: 0.58, fitHeight: 0.66 };
    }
  }
  function frameTo(name, sec) { framingName = name; engine.cam.goTo(framing(name), sec); }
  let lastAspect = camera.aspect;

  // ================================================================ Papa controller
  const PK = ['lean', 'armsUp', 'clap', 'blow', 'laugh', 'headTilt', 'nod', 'bounce', 'creamNose', 'streamers'];
  const P = { tgt: {}, cur: {}, out: {}, rate: {}, claps: 0, clapPh: 0, bounceAmp: 0, beckon: false };
  for (const k of PK) { P.tgt[k] = 0; P.cur[k] = 0; P.out[k] = 0; P.rate[k] = 5; }
  P.rate.lean = 3.2; P.rate.blow = 9; P.rate.creamNose = 40; P.rate.nod = 7; P.rate.armsUp = 4; P.rate.streamers = 4;
  function papaReset() {
    for (const k of PK) { P.tgt[k] = 0; P.cur[k] = 0; }
    P.claps = 0; P.bounceAmp = 0; P.beckon = false;
    papa.position.set(1.7, 0.33, PAPA_Z); papa.rotation.set(0, -Math.PI / 2, 0); papa.visible = false;
  }
  function papaClap(n) { P.claps += n; if (P.claps > 8) P.claps = 8; }
  function papaUpdate(dt, t) {
    if (!papa.visible) return;
    const o = P.out;
    for (const k of PK) { P.cur[k] = damp(P.cur[k], P.tgt[k], P.rate[k], dt); o[k] = P.cur[k]; }
    if (P.claps > 0) {
      const arms = Math.max(o.armsUp, 0.9);
      P.cur.armsUp = damp(P.cur.armsUp, 1, 6, dt);
      o.armsUp = arms;
      const before = Math.floor((P.clapPh - Math.PI) / TAU);
      P.clapPh += dt * TAU * 2.3;
      const after = Math.floor((P.clapPh - Math.PI) / TAU);
      if (after > before && P.cur.armsUp > 0.6) { A.play('clap', { vol: 0.7, pitch: 0.95 + Math.random() * 0.1 }); P.claps--; }
      const c = 0.5 - 0.5 * Math.cos(P.clapPh);
      o.clap = (0.25 + 0.75 * c) * clamp01((P.cur.armsUp - 0.3) / 0.5);
      P.cur.clap = o.clap;
      if (P.claps <= 0) P.clapPh = 0;
    }
    P.bounceAmp = Math.max(0, P.bounceAmp - dt * 0.45);
    o.bounce += P.bounceAmp * Math.abs(Math.sin(t * 10.5)) + 0.12 * Math.sin(t * 1.7);
    if (P.beckon) {
      const s = Math.max(0, Math.sin(t * 2.3));
      o.nod += 0.5 * s * s * s;
      o.headTilt += 0.25 * Math.sin(t * 0.7);
    }
    papa.userData.setPose(o);
  }

  // ================================================================ hint director
  const HC = {
    on: false, obj: null, pos: new V3(), r: 0.08, held: false,
    hasDest: false, from: new V3(), dest: new V3(), spot: true, arc: 0.08,
    hasGlint: false, glint: new V3(), demo: null, demoOpts: null,
  };
  const HD = { lastLevel: -1, soundT: 0, pathOn: false, pathT: -1, pf: new V3(), pd: new V3(), pts: [new V3(), new V3(), new V3()], arc: 0 };
  function setPath(on) {
    if (!on) { if (HD.pathOn) { hints.path(null); HD.pathOn = false; } return; }
    if (HD.pathOn && HD.pf.distanceToSquared(HC.from) < 1e-4 && HD.pd.distanceToSquared(HC.dest) < 1e-4 && HD.arc === HC.arc) return;
    if (HD.pathOn && S.time - HD.pathT < 0.12) return; // rebuilding allocates: at most ~8×/s while something is carried
    HD.pathT = S.time;
    HD.pf.copy(HC.from); HD.pd.copy(HC.dest); HD.arc = HC.arc;
    HD.pts[0].copy(HC.from);
    HD.pts[1].lerpVectors(HC.from, HC.dest, 0.5); HD.pts[1].y = Math.max(HC.from.y, HC.dest.y) + HC.arc;
    HD.pts[2].copy(HC.dest);
    hints.path(HD.pts);
    HD.pathOn = true;
  }
  function hintsOff() {
    hints.spot(null); hints.wobble(null); hints.glint(null); setPath(false); hints.finger.stop();
    HD.lastLevel = -1;
  }
  function playDemo() {
    const pts = HC.demo ? HC.demo() : null;
    if (pts) hints.finger.play(pts, HC.demoOpts || {});
  }
  function hintDirector(dt) {
    HC.on = false; HC.held = false; HC.hasDest = false; HC.hasGlint = false; HC.obj = null; HC.arc = 0.08; HC.spot = true;
    const st = STAGES[S.stage];
    if (!S.busy && st && st.hint) st.hint(HC);
    if (!HC.on) { hintsOff(); return; }
    if (!ptr.active && !HC.held) S.idle += dt;
    S.nudge = Math.max(0, S.nudge - dt);
    const lvl = HC.held ? 0 : S.idle > 8 ? 2 : S.idle > 4 ? 1 : 0;
    if (lvl !== HD.lastLevel) {
      if (lvl === 1 && HD.lastLevel === 0) A.play('hint', { index: 0 });
      if (lvl === 2) { A.play('hint', { index: 1 }); HD.soundT = 0; playDemo(); }
      if (lvl < 2) hints.finger.stop();
      HD.lastLevel = lvl;
    }
    if (lvl === 2) {
      HD.soundT += dt;
      if (HD.soundT > 8) { HD.soundT = 0; A.play('hint', { index: 1 }); playDemo(); }
    }
    if (HC.held) hints.wobble(null);
    else hints.wobble(HC.obj, lvl === 2 ? 3 : (lvl === 1 || S.nudge > 0) ? 2 : 1);
    hints.spot(HC.spot ? HC.pos : null, HC.r);
    setPath(HC.hasDest);
    hints.glint(HC.hasGlint ? HC.glint : null);
  }
  function touched() { S.idle = 0; S.sinceTouch = 0; hints.finger.stop(); if (HD.lastLevel > 0) HD.lastLevel = 0; }
  function progressed() { S.idle = 0; }

  // ================================================================ continuous sound + rate limits
  const lastPlay = {};
  function playLimited(name, gap, opts) {
    const t = S.time;
    if (lastPlay[name] !== undefined && t - lastPlay[name] < gap) return;
    lastPlay[name] = t;
    A.play(name, opts);
  }
  function stopContinuous() {
    A.pour.set(false); A.spread.set(0); A.slide.set(0);
    A.mixer.set({ on: false, speed: 0 });
    pour.set(false);
  }

  // ================================================================ stage machinery
  const STAGES = {};
  function enter(name) {
    if (S.stage === name) return;
    S.stage = name;
    S.idle = 0; HD.lastLevel = -1;
    hints.finger.stop();
    const st = STAGES[name];
    if (st && st.enter) st.enter();
  }

  // ================================================================ 1. POUR
  const cartonC = makeCarry();
  const POUR = { held: false, snapped: false, tilt: 0, yaw: 0, dirA: 0, homeYaw: 0 };
  {
    const dx = CARTON_HOME.x - BOWL_HOME.x, dz = CARTON_HOME.z - BOWL_HOME.z;
    POUR.homeYaw = Math.atan2(-dz, dx); // local +X points away from the bowl, so the spout (-X) faces it
  }
  const cartonHomeQ = new THREE.Quaternion();
  function cartonCenter(out) { return out.copy(carton.position).add(t4.set(0, 0.065, 0)); }
  STAGES.POUR = {
    enter() { frameTo('PREP', S.time < 0.1 ? 0 : 1.2); },
    down() {
      if (S.pourDone) return false;
      if (!isNear(cartonCenter(t1), 0.07)) return false;
      stopMove(carton);
      if (!carton.userData.open) carton.userData.setOpen(true);
      POUR.held = true; POUR.snapped = false;
      startCarry(cartonC, carton, 0.10, carton.position);
      A.play('pick');
      return true;
    },
    up() { if (POUR.held) releaseCarton(); },
    update(dt) {
      if (!POUR.held) return;
      carryTarget(cartonC, dt);
      const c = cartonC;
      const dx = c.tgt.x - bowl.position.x, dz = c.tgt.z - bowl.position.z, d = Math.hypot(dx, dz);
      if (!POUR.snapped && d < 0.19) { POUR.snapped = true; A.play('tap', { vol: 0.5 }); }
      else if (POUR.snapped && d > 0.27) POUR.snapped = false;
      if (d > 0.01) {
        const a = Math.atan2(dz, dx);
        let da = a - POUR.dirA; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        POUR.dirA += da * (1 - Math.exp(-10 * dt));
      }
      let tx, ty, tz;
      if (POUR.snapped) {
        tx = bowl.position.x + Math.cos(POUR.dirA) * 0.135; tz = bowl.position.z + Math.sin(POUR.dirA) * 0.135; ty = 0.165;
      } else { tx = c.tgt.x; tz = c.tgt.z; ty = 0.045; }
      const r = 1 - Math.exp(-(POUR.snapped ? 12 : 25) * dt);
      c.pos.x += (tx - c.pos.x) * r; c.pos.z += (tz - c.pos.z) * r; c.pos.y += (ty - c.pos.y) * (1 - Math.exp(-14 * dt));
      carryLean(c, dt);
      POUR.tilt = damp(POUR.tilt, POUR.snapped && !S.pourDone ? 105 : 0, 6, dt);
      // spout (local -X) always faces the bowl
      const yawT = -POUR.dirA;
      let dy = yawT - POUR.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
      POUR.yaw += dy * (1 - Math.exp(-10 * dt));
      carton.position.copy(c.pos);
      leanQuat(c, q1);
      q2.setFromAxisAngle(UP, POUR.yaw); q3.setFromAxisAngle(AZ, POUR.tilt * DEG);
      carton.quaternion.copy(q1).multiply(q2).multiply(q3);
      // pouring
      if (POUR.tilt > 70 && POUR.snapped && S.poured < 1) {
        carton.updateMatrixWorld(true);
        carton.userData.spout.getWorldPosition(t1);
        t2.set(t1.x - Math.cos(POUR.dirA) * 0.012, bowl.position.y + bowlCream.surfaceY(), t1.z - Math.sin(POUR.dirA) * 0.012);
        pour.set(true, t1, t2);
        bowlCream.pourAt(t2.x - bowl.position.x, t2.z - bowl.position.z);
        A.pour.set(true);
        S.poured = Math.min(1, S.poured + dt / 2.8);
        bowlCream.setFill(S.poured);
        progressed();
        if (S.poured >= 1) pourFinished();
      } else { pour.set(false); A.pour.set(false); }
    },
    hint(h) {
      if (S.pourDone) return;
      h.on = true;
      if (POUR.held) {
        h.held = true; h.hasDest = !POUR.snapped; h.spot = !POUR.snapped;
        cartonCenter(h.from); h.dest.set(bowl.position.x, 0.13, bowl.position.z); h.arc = 0.05;
        h.pos.set(bowl.position.x, bowl.position.y + bowlCream.surfaceY(), bowl.position.z); h.r = 0.11;
        return;
      }
      h.obj = carton; h.pos.copy(carton.position); h.r = 0.075;
      h.hasDest = true; cartonCenter(h.from); h.dest.set(bowl.position.x, 0.14, bowl.position.z);
      h.demo = DEMO.pour; h.demoOpts = DOPT.pour;
    },
  };
  function releaseCarton() {
    POUR.held = false; POUR.snapped = false;
    pour.set(false); A.pour.set(false);
    cartonHomeQ.setFromAxisAngle(UP, POUR.homeYaw);
    POUR.tilt = 0;
    moveTo(carton, CARTON_HOME, cartonHomeQ, 0.6, { arc: 0.04, sound: 'put', settle: 1 });
    POUR.yaw = POUR.homeYaw; POUR.dirA = Math.atan2(CARTON_HOME.z - BOWL_HOME.z, CARTON_HOME.x - BOWL_HOME.x);
  }
  function pourFinished() {
    if (S.pourDone) return;
    S.pourDone = true;
    pour.set(false); A.pour.set(false);
    tl.after(0.35, () => { releaseCarton(); });
    POUR.held = false;
    // carton keeps its pose until the release tween takes over
    tl.after(0.1, () => A.play('chime'));
    tl.after(0.7, () => enter('WHIP'));
  }

  // ================================================================ 2. WHIP (+ mixer, always running)
  const M = {
    held: false, s: 0, burst: 0, orient: 0, tip: new V3(), tgt: new V3(), off: new V3(), vel: new V3(), prev: new V3(),
    inCream: false, wasIn: false, fling: 0, flingN: 0, glassN: 0, home: new V3(), lx: 0, lz: 0, audioOn: false, done: false,
  };
  const restPos = new V3();
  const MIXA = { on: false, speed: 0, load: 0, inCream: false };
  function mixAudio(on, speed, load, inCream) { MIXA.on = on; MIXA.speed = speed; MIXA.load = load; MIXA.inCream = inCream; A.mixer.set(MIXA); }
  function mixerRestPos(home, out) { return out.copy(home).add(mixerRest.position); }
  function mixerCenter(out) { return mixer.localToWorld(out.set(0, 0.13, 0.05)); }
  function placeMixerAtHome() {
    mixerRestPos(M.home, mixer.position); mixer.quaternion.copy(mixerRest.quaternion);
  }
  function mixerDown() {
    if (!isNear(mixerCenter(t1), 0.09)) return false;
    stopMove(mixer);
    M.held = true; M.orient = 0;
    M.tip.copy(mixer.position); M.prev.copy(M.tip);
    q1.copy(mixer.quaternion); M.q0 = M.q0 || new THREE.Quaternion(); M.q0.copy(q1);
    const h = onPlane(0.10, t2);
    if (h) M.off.set(M.tip.x - h.x, 0, M.tip.z - h.z); else M.off.set(0, 0, 0);
    A.play('pick');
    M.s = Math.max(M.s, 0.15);
    mixAudio(true, M.s, S.whip, false); M.audioOn = true;
    return true;
  }
  function mixerRelease() {
    if (!M.held) return;
    M.held = false;
    const lift = M.tip.y < 0.13;
    const goHome = () => {
      mixerRestPos(M.home, restPos);
      moveTo(mixer, restPos, mixerRest.quaternion, 0.5, { arc: 0.03, sound: 'put', settle: 0.6 });
    };
    if (lift) {
      t1.copy(mixer.position); t1.y = 0.18;
      moveTo(mixer, t1, mixer.quaternion, 0.18, { ease: easeOut, done: goHome });
    } else goHome();
  }
  const _mt = new V3();
  function mixerUpdate(dt) {
    // spin
    const want = M.held || M.burst > 0;
    M.burst = Math.max(0, M.burst - dt);
    M.s = want ? Math.min(1, M.s + dt / 0.5) : Math.max(0, M.s - dt / 0.45);
    const bs = mixer.userData.beaters;
    bs[0].rotation.y += M.s * 55 * dt; bs[1].rotation.y -= M.s * 55 * dt;
    if (!M.held) {
      if (M.audioOn && !want) { mixAudio(false, 0, 0, false); M.audioOn = false; }
      else if (want) { mixAudio(true, M.s, 0, false); M.audioOn = true; }
      M.inCream = false; M.wasIn = false;
      updateFling(dt);
      return;
    }
    M.orient = Math.min(1, M.orient + dt / 0.2);
    const bx = bowl.position.x, bz = bowl.position.z;
    const h = onPlane(0.10, _mt);
    M.off.multiplyScalar(Math.exp(-dt * 3));
    if (h) M.tgt.set(h.x + M.off.x, 0, h.z + M.off.z);
    let dx = M.tgt.x - bx, dz = M.tgt.z - bz;
    const d = Math.hypot(dx, dz);
    const surf = bowl.position.y + bowlCream.surfaceY();
    const inside = d < 0.19 && bowl.visible && S.stage !== 'DONE';
    let ty;
    if (inside) {
      const r = 0.075 * Math.tanh(d / 0.075);
      if (d > 1e-5) { M.tgt.x = bx + dx / d * r; M.tgt.z = bz + dz / d * r; }
      ty = bowlCream.fill > 0.01 ? surf - 0.022 : 0.03;
      ty = Math.max(0.012, ty);
    } else ty = 0.165;
    M.tgt.x = clamp(M.tgt.x, -1.1, 1.1); M.tgt.z = clamp(M.tgt.z, -0.55, 0.62);
    const rx = 1 - Math.exp(-22 * dt);
    M.tip.x += (M.tgt.x - M.tip.x) * rx; M.tip.z += (M.tgt.z - M.tip.z) * rx;
    M.tip.y = damp(M.tip.y, ty, inside ? 9 : 14, dt);
    // never clip through the rim: while low inside the bowl, stay inside
    dx = M.tip.x - bx; dz = M.tip.z - bz;
    const dd = Math.hypot(dx, dz);
    if (M.tip.y < 0.125 && dd < 0.16 && dd > 0.085) { M.tip.x = bx + dx / dd * 0.085; M.tip.z = bz + dz / dd * 0.085; }
    if (M.tip.y < 0.125 && dd >= 0.16) M.tip.y = damp(M.tip.y, 0.165, 20, dt);
    // velocity + lean
    M.vel.subVectors(M.tip, M.prev).multiplyScalar(1 / Math.max(dt, 1e-3)); M.prev.copy(M.tip);
    M.lz = damp(M.lz, clamp(-M.vel.x * 0.25, -0.14, 0.14), 10, dt);
    M.lx = damp(M.lx, clamp(M.vel.z * 0.25, -0.14, 0.14), 10, dt);
    mixer.position.copy(M.tip);
    eul.set(M.lx, 0, M.lz); q1.setFromEuler(eul);
    q2.slerpQuaternions(M.q0, q1, easeOut(M.orient));
    mixer.quaternion.copy(q2);
    // cream
    M.inCream = inside && M.tip.y < surf + 0.004 && bowlCream.fill > 0.05 && !S.dolloped;
    if (M.inCream && M.s > 0.05) {
      bowlCream.stir(M.tip.x - bx, M.tip.z - bz, M.s, dt);
      if (M.s > 0.3 && S.whip < 1) {
        const sp = Math.hypot(M.vel.x, M.vel.z);
        S.whip = Math.min(1, S.whip + dt * (0.065 + 0.085 * Math.min(1, sp / 0.15)));
        bowlCream.setThickness(S.whip);
        mixer.userData.setCream(Math.min(1, S.whip * 1.3));
        progressed();
        if (S.whip >= 1 && !M.done) { M.done = true; A.play('chime'); enter('DOLLOP'); }
      }
    }
    if (M.wasIn && !M.inCream && M.s > 0.5 && S.whip > 0.05) { M.fling = 0.6; M.flingN = 0; }
    M.wasIn = M.inCream;
    mixAudio(true, M.s, S.whip, M.inCream);
    M.audioOn = true;
    updateFling(dt);
  }
  const _fp = new V3();
  function updateFling(dt) {
    if (M.fling <= 0) return;
    const before = M.fling;
    M.fling -= dt;
    // four little bursts over 0.6 s
    for (let k = 0; k < 4; k++) {
      const at = 0.6 - k * 0.15;
      if (before > at - 1e-4 && M.fling <= at && M.flingN === k) {
        M.flingN++;
        if (M.s < 0.3) continue;
        _fp.copy(mixer.position); _fp.y += 0.015;
        splats.burst(_fp, {
          count: 2 + (Math.random() < 0.5 ? 1 : 0), speed: 1.2 + Math.random() * 0.8, up: 0.7,
          lens: k === 0 && S.whip > 0.25 && Math.random() < 0.55,
          onLand: onSplatLand,
        });
        if (k === 0 && M.glassN < 4 && Math.random() < 0.35) {
          M.glassN++;
          tl.after(0.3, splatOnGlass);
        }
      }
    }
  }
  function onSplatLand() { playLimited('splat', 0.07, { vol: 0.7, pitch: 0.9 + Math.random() * 0.2 }); }
  const _gn = new V3();
  function splatOnGlass() {
    const g = frame.userData.glass;
    g.updateWorldMatrix(true, false);
    g.localToWorld(t3.set((Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * 0.1, 0.002));
    g.getWorldQuaternion(q3); _gn.set(0, 0, 1).applyQuaternion(q3);
    splats.stickAt(t3, _gn, 0.012 + Math.random() * 0.007);
    A.play('splat', { vol: 0.7 });
  }
  STAGES.WHIP = {
    enter() { progressed(); },
    down() { return mixerDown(); },
    up() { mixerRelease(); },
    update() {},
    hint(h) {
      h.on = true;
      if (M.held) {
        h.held = true;
        const inB = Math.hypot(mixer.position.x - bowl.position.x, mixer.position.z - bowl.position.z) < 0.1;
        h.hasDest = !inB; h.spot = !inB; mixerCenter(h.from); h.dest.set(bowl.position.x, 0.12, bowl.position.z); h.arc = 0.04;
        h.pos.set(bowl.position.x, bowl.position.y + bowlCream.surfaceY(), bowl.position.z); h.r = 0.1;
        return;
      }
      h.obj = mixer; h.pos.copy(M.home); h.r = 0.085;
      h.hasDest = true; mixerCenter(h.from); h.dest.set(bowl.position.x, 0.13, bowl.position.z);
      h.demo = DEMO.whip; h.demoOpts = DOPT.whip;
    },
  };

  // ================================================================ 3. DOLLOP
  const bowlC = makeCarry();
  const D = { held: false };
  function bowlCenter(out) { return out.copy(bowl.position).add(t4.set(0, 0.06, 0)); }
  STAGES.DOLLOP = {
    enter() { progressed(); },
    down() {
      if (S.dolloped) return false;
      if (M.held) return false;
      if (!isNear(bowlCenter(t1), 0.15, 80)) return false;
      stopMove(bowl);
      D.held = true;
      startCarry(bowlC, bowl, 0.08, bowl.position);
      A.play('pick');
      return true;
    },
    up() {
      if (!D.held) return;
      D.held = false;
      moveTo(bowl, BOWL_HOME, QI, 0.55, { arc: 0.04, sound: 'put', settle: 0.7 });
    },
    update(dt) {
      if (!D.held) return;
      const c = bowlC;
      carryTarget(c, dt);
      const r = 1 - Math.exp(-25 * dt);
      c.pos.x += (c.tgt.x - c.pos.x) * r; c.pos.z += (c.tgt.z - c.pos.z) * r;
      c.pos.y = damp(c.pos.y, 0.03, 16, dt);
      carryLean(c, dt);
      bowl.position.copy(c.pos);
      leanQuat(c, q1); bowl.quaternion.copy(q1);
      if (Math.hypot(c.pos.x - cake.position.x, c.pos.z - cake.position.z) < 0.21) dollopSequence();
    },
    hint(h) {
      if (S.dolloped) return;
      h.on = true;
      t1.set(cake.position.x, CAKE_TOP + 0.04, cake.position.z);
      if (D.held) { h.held = true; h.hasDest = true; bowlCenter(h.from); h.dest.copy(t1); h.arc = 0.05; h.pos.copy(t1); h.pos.y = cake.position.y + CAKE_TOP + 0.001; h.r = 0.12; return; }
      if (M.held) { h.on = false; return; }
      h.obj = bowl; h.pos.copy(bowl.position); h.r = 0.17;
      h.hasDest = true; bowlCenter(h.from); h.from.y += 0.05; h.dest.copy(t1);
      h.demo = DEMO.dollop; h.demoOpts = DOPT.dollop;
    },
  };
  function dollopSequence() {
    if (S.dolloped) return;
    S.dolloped = true; S.busy = true; D.held = false;
    const cx = cake.position.x, cz = cake.position.z;
    q1.setFromAxisAngle(AZ, -105 * DEG);
    t1.set(cx - 0.19, 0.30, cz + 0.02);
    moveTo(bowl, t1, q1, 0.7, { ease: easeInOut });
    tl.after(0.62, () => { bowlCream.takeOut(); cakeCream.dollop(); });
    tl.after(0.82, () => {
      A.play('bigPlop');
      tl.tween(0.45, (e, k) => sponge.userData.squish(0.7 * Math.sin(Math.PI * k) * (1 - 0.5 * k)), () => sponge.userData.squish(0));
    });
    tl.after(1.05, () => {
      moveTo(bowl, TIDY_BOWL, QI, 0.9, { arc: 0.06, sound: 'put', vol: 0.5, settle: 0.5 });
      A.play('slideOut', { vol: 0.7 });
    });
    tl.after(1.35, () => {
      q2.setFromAxisAngle(UP, POUR.homeYaw);
      moveTo(carton, TIDY_CARTON, q2, 0.55, { ease: easeInOut }); A.play('slideOut', { vol: 0.6 });
    });
    tl.after(1.55, () => {
      M.home.copy(TIDY_MIXER);
      if (!M.held) { mixerRestPos(M.home, restPos); moveTo(mixer, restPos, mixerRest.quaternion, 0.55); A.play('slideOut', { vol: 0.6 }); }
    });
    tl.after(1.4, () => frameTo('CAKE', 1.6));
    tl.after(2.3, () => {
      spatula.visible = true; spatula.position.copy(OFF); spatula.quaternion.identity();
      moveTo(spatula, KNIFE_SLOT, QI, 0.6, { ease: easeOut, settle: 0.5 });
      A.play('slideIn');
    });
    tl.after(3.0, () => { S.busy = false; enter('SPREAD'); });
  }

  // ================================================================ 4. SPREAD
  const K = { held: false, fly: 0, pos: new V3(), prev: new V3(), last: new V3(), yaw: 0, spd: 0, hasLast: false, from: new V3() };
  function knifeCenter(out) { return spatula.localToWorld(out.set(0, 0.01, 0.07)); }
  function cakeTopCenter(out) { return out.set(cake.position.x, cake.position.y + CAKE_TOP, cake.position.z); }
  STAGES.SPREAD = {
    enter() { progressed(); S.rub = 0; },
    down() {
      if (cakeCream.finished) return false;
      const nearKnife = isNear(knifeCenter(t1), 0.09);
      const nearCake = isNear(cakeTopCenter(t1), 0.13, 90);
      if (!nearKnife && !nearCake) return false;
      stopMove(spatula);
      K.held = true; K.fly = 0; K.from.copy(spatula.position); K.hasLast = false;
      A.play('pick');
      return true;
    },
    up() { if (K.held) releaseKnife(); },
    update(dt) {
      if (!K.held) return;
      const ty = cake.position.y + CAKE_TOP;
      const h = onPlane(ty, t1);
      if (h) K.pos.set(h.x, ty + 0.001, h.z - 0.012);
      K.fly = Math.min(1, K.fly + dt / 0.12);
      const e = easeOut(K.fly);
      t2.lerpVectors(K.from, K.pos, e);
      if (K.fly < 1) t2.y += 0.03 * Math.sin(Math.PI * K.fly);
      const vx = (t2.x - spatula.position.x) / Math.max(dt, 1e-3);
      const vz = (t2.z - spatula.position.z) / Math.max(dt, 1e-3);
      K.spd = damp(K.spd, Math.hypot(vx, vz), 12, dt);
      K.yaw = damp(K.yaw, clamp(vx * 0.35, -0.4, 0.4), 6, dt);
      spatula.position.copy(t2);
      eul.set(-0.16, K.yaw, 0.04 * Math.sin(S.time * 9) * Math.min(1, K.spd)); q1.setFromEuler(eul);
      spatula.quaternion.slerp(q1, K.fly < 1 ? e : 1);
      // spreading
      const cx = cake.position.x, cz = cake.position.z;
      const lx = t2.x - cx, lz = t2.z - cz;
      const onCake = K.fly >= 1 && Math.hypot(lx, lz) < 0.125 && cakeCream.hasDollop;
      if (onCake) {
        const rad = 0.036 + 0.016 * Math.min(1, S.rub / 10);
        if (K.hasLast) {
          const ddx = lx - K.last.x, ddz = lz - K.last.z, dl = Math.hypot(ddx, ddz);
          const n = Math.min(12, Math.ceil(dl / 0.012));
          for (let i = 1; i <= n; i++) cakeCream.spreadAt(K.last.x + ddx * i / n, K.last.z + ddz * i / n, rad);
          if (dl > 0.002) { S.rub += dt; progressed(); }
        } else cakeCream.spreadAt(lx, lz, rad);
        K.last.set(lx, 0, lz); K.hasLast = true;
        spatula.userData.setCream(1);
        A.spread.set(clamp01(K.spd / 0.35));
        if (cakeCream.coverage() >= 0.9) spreadFinished();
      } else { K.hasLast = false; A.spread.set(0); }
    },
    hint(h) {
      if (cakeCream.finished || S.busy) return;
      h.on = true;
      if (K.held) { h.held = true; h.spot = false; return; }
      h.obj = spatula; h.pos.copy(spatula.position); h.pos.z += 0.06; h.r = 0.1;
      h.hasDest = true; knifeCenter(h.from); cakeTopCenter(h.dest); h.dest.y += 0.01; h.arc = 0.05;
      h.demo = DEMO.spread; h.demoOpts = DOPT.spread;
    },
  };
  function releaseKnife() {
    K.held = false; A.spread.set(0);
    moveTo(spatula, KNIFE_SLOT, QI, 0.35, { arc: 0.02, sound: 'put', vol: 0.6, settle: 0.4 });
  }
  function spreadFinished() {
    if (S.busy) return;
    S.busy = true; K.held = false; A.spread.set(0);
    cakeCream.finish();
    t1.copy(OFF); t1.y = 0.0006;
    moveTo(spatula, t1, QI, 0.5, { ease: easeIn, done: () => { spatula.visible = false; } });
    A.play('slideOut', { vol: 0.7 });
    tl.after(0.35, () => {
      A.play('turntable');
      tl.tween(1.4, (e) => { cake.rotation.y = e * TAU; }, () => { cake.rotation.y = 0; }, easeInOut);
    });
    tl.after(1.9, () => A.play('chime'));
    tl.after(2.1, () => {
      // berry plate slides in
      plate.visible = true; plate.position.copy(OFF);
      moveTo(plate, SLOT, QI, 0.6, { ease: easeOut, settle: 0.5 });
      A.play('slideIn');
    });
    tl.after(2.8, () => { S.busy = false; enter('BERRIES'); });
  }

  // ================================================================ 5/6. BERRIES + CANDLES (placeables)
  const IC = { item: null, pos: new V3(), off: new V3(), prev: new V3(), lx: 0, lz: 0, upright: 0, planeY: 0.175, q0: new THREE.Quaternion() };
  function trayFor(kind) { return kind === 'berry' ? plate : box; }
  function slotLocal(it, out) {
    if (it.kind === 'berry') return out.copy(plate.userData.slots[it.idx]);
    const s = box.userData.slots[it.idx];
    return out.set(s.x, box.userData.slotY, s.z + 0.0375);
  }
  function slotQuat(it, out) {
    if (it.kind === 'berry') return out.identity();
    return out.setFromAxisAngle(AX, -Math.PI / 2);
  }
  function putInTray(it) {
    const tr = trayFor(it.kind);
    tr.add(it.obj);
    slotLocal(it, it.obj.position); slotQuat(it, it.obj.quaternion);
    it.obj.scale.set(1, 1, 1);
    it.state = 'tray';
  }
  function itemWorld(it, out) {
    it.obj.updateWorldMatrix(true, false);
    if (it.kind === 'candle') return it.obj.localToWorld(out.set(0, it.state === 'tray' ? 0.03 : 0.04, 0));
    return it.obj.localToWorld(out.set(0, 0.015, 0));
  }
  function nextInTray(kind) {
    for (const it of items) if (it.kind === kind && it.state === 'tray') return it;
    return null;
  }
  function countPlaced(kind) { let n = 0; for (const it of items) if (it.kind === kind && it.state === 'placed') n++; return n; }
  function placeDown(kind) {
    const tr = trayFor(kind);
    let best = null, bd = 1e9;
    // a placed item close to the finger can be picked up again
    for (const it of items) {
      if (it.kind !== kind || it.state !== 'placed') continue;
      const d = screenDist(itemWorld(it, t1));
      if (d < 38 && d < bd) { bd = d; best = it; }
    }
    if (!best) {
      t1.copy(tr.position); t1.y += 0.015;
      if (!isNear(t1, 0.09, 90)) return false;
      for (const it of items) {
        if (it.kind !== kind || it.state !== 'tray') continue;
        const d = screenDist(itemWorld(it, t2));
        if (d < bd) { bd = d; best = it; }
      }
    }
    if (!best) return false;
    const it = best;
    stopMove(it.obj);
    scene.attach(it.obj);
    it.obj.scale.set(1, 1, 1);
    it.state = 'held';
    IC.item = it; IC.upright = 0; IC.q0.copy(it.obj.quaternion);
    IC.planeY = kind === 'berry' ? 0.175 : 0.19;
    IC.pos.copy(it.obj.position); IC.prev.copy(IC.pos); IC.lx = 0; IC.lz = 0;
    const h = onPlane(IC.planeY, t2);
    if (h) IC.off.set(IC.pos.x - h.x, 0, IC.pos.z - h.z); else IC.off.set(0, 0, 0);
    A.play('pick', { pitch: kind === 'berry' ? 1.1 : 1.2 });
    return true;
  }
  function placeUpdate(dt) {
    const it = IC.item; if (!it) return;
    const h = onPlane(IC.planeY, t2);
    IC.off.x = damp(IC.off.x, 0, 4, dt); IC.off.z = damp(IC.off.z, -0.014, 4, dt);
    if (h) { t3.set(clamp(h.x + IC.off.x, -1.1, 1.1), IC.planeY, clamp(h.z + IC.off.z, -0.55, 0.65)); }
    else t3.copy(IC.pos);
    const r = 1 - Math.exp(-25 * dt);
    IC.pos.x += (t3.x - IC.pos.x) * r; IC.pos.z += (t3.z - IC.pos.z) * r;
    IC.pos.y = damp(IC.pos.y, IC.planeY, 22, dt);
    const vx = (IC.pos.x - IC.prev.x) / Math.max(dt, 1e-3), vz = (IC.pos.z - IC.prev.z) / Math.max(dt, 1e-3);
    IC.prev.copy(IC.pos);
    IC.lz = damp(IC.lz, clamp(-vx * 0.4, -0.3, 0.3), 10, dt);
    IC.lx = damp(IC.lx, clamp(vz * 0.4, -0.3, 0.3), 10, dt);
    IC.upright = Math.min(1, IC.upright + dt / 0.15);
    it.obj.position.copy(IC.pos);
    eul.set(IC.lx, 0, IC.lz); q1.setFromEuler(eul);
    q2.slerpQuaternions(IC.q0, q1, easeOut(IC.upright));
    it.obj.quaternion.copy(q2);
  }
  function relax(it, lx, lz, out) {
    const rMax = it.kind === 'berry' ? 0.082 : 0.085;
    let x = lx, z = lz;
    for (let iter = 0; iter < 8; iter++) {
      for (const o of items) {
        if (o === it || o.state !== 'placed') continue;
        const need = it.kind === 'candle' ? (o.kind === 'candle' ? 0.024 : 0.026) : (o.kind === 'berry' ? 0.034 : 0.026);
        let dx = x - o.local.x, dz = z - o.local.z;
        let d = Math.hypot(dx, dz);
        if (d >= need) continue;
        if (d < 1e-4) { const a = Math.random() * TAU; dx = Math.cos(a); dz = Math.sin(a); d = 1; x = o.local.x; z = o.local.z; }
        x = o.local.x + dx / d * need; z = o.local.z + dz / d * need;
      }
      const r = Math.hypot(x, z);
      if (r > rMax) { x *= rMax / r; z *= rMax / r; }
    }
    return out.set(x, 0, z);
  }
  function placeUp() {
    const it = IC.item; if (!it) return;
    IC.item = null;
    const lx = it.obj.position.x - cake.position.x, lz = it.obj.position.z - cake.position.z;
    if (Math.hypot(lx, lz) < 0.118) {
      relax(it, lx, lz, t1);
      it.local.copy(t1);
      it.state = 'anim';
      cake.attach(it.obj);
      const finalY = it.kind === 'berry' ? CAKE_TOP - 0.001 : CAKE_TOP - 0.014;
      const from = it.obj.position.clone(), fq = it.obj.quaternion.clone();
      const to = new V3(t1.x, it.kind === 'berry' ? finalY : finalY + 0.014, t1.z);
      const n = countPlaced(it.kind);
      tl.tween(0.17, (e) => {
        it.obj.position.lerpVectors(from, to, e);
        it.obj.quaternion.slerpQuaternions(fq, QI, e);
      }, () => {
        if (it.kind === 'berry') {
          A.play('plop'); A.play('note', { index: n, vol: 0.8 });
          tl.tween(0.32, (e, k) => {
            const s = 1 - 0.22 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k);
            it.obj.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
          }, () => { it.obj.scale.set(1, 1, 1); });
          it.state = 'placed'; afterPlaced('berry');
        } else {
          A.play('put', { vol: 0.45, pitch: 1.5 });
          tl.tween(0.14, (e) => { it.obj.position.y = lerp(finalY + 0.014, finalY, e); }, () => {
            A.play('note', { index: n + 5, vol: 0.8 });
            it.state = 'placed'; afterPlaced('candle');
          }, easeOut);
        }
      }, easeIn);
      progressed();
    } else {
      // hop back to its place in the tray
      const tr = trayFor(it.kind);
      tr.attach(it.obj);
      it.state = 'anim';
      slotLocal(it, t1); slotQuat(it, q1);
      moveTo(it.obj, t1, q1, 0.42, { arc: 0.05, sound: 'put', vol: 0.5, done: () => { it.state = 'tray'; } });
    }
  }
  function afterPlaced(kind) {
    if (countPlaced(kind) < (kind === 'berry' ? 6 : 5) || S.busy) return;
    S.busy = true;
    tl.after(0.3, () => A.play('chime'));
    const tr = trayFor(kind);
    tl.after(0.5, () => {
      t1.copy(OFF);
      moveTo(tr, t1, QI, 0.5, { ease: easeIn, done: () => { tr.visible = false; } });
      A.play('slideOut', { vol: 0.7 });
    });
    tl.after(1.1, () => {
      if (kind === 'berry') {
        box.visible = true; box.position.copy(OFF);
        moveTo(box, SLOT, QI, 0.6, { ease: easeOut, settle: 0.5 });
      } else {
        lighter.visible = true;
        lighter.position.copy(OFF).add(lighter.userData.restPose.position);
        lighter.quaternion.copy(lighter.userData.restPose.quaternion);
        t1.copy(SLOT).add(lighter.userData.restPose.position);
        moveTo(lighter, t1, lighter.userData.restPose.quaternion, 0.6, { ease: easeOut, settle: 0.5 });
      }
      A.play('slideIn');
    });
    tl.after(1.8, () => { S.busy = false; enter(kind === 'berry' ? 'CANDLES' : 'LIGHT'); });
  }
  function placeHint(h, kind) {
    h.on = true;
    cakeTopCenter(h.dest); h.dest.y += 0.02;
    if (IC.item) { h.held = true; h.hasDest = true; itemWorld(IC.item, h.from); h.arc = 0.04; cakeTopCenter(h.pos); h.pos.y += 0.001; h.r = 0.09; return; }
    const it = nextInTray(kind);
    if (!it) { h.on = false; return; }
    h.obj = it.obj;
    const tr = trayFor(kind);
    h.pos.copy(tr.position); h.r = 0.1;
    h.hasDest = true; itemWorld(it, h.from); h.arc = 0.09;
    h.demo = DEMO.place; h.demoOpts = DOPT.place;
  }
  STAGES.BERRIES = {
    enter() { progressed(); },
    down() { return placeDown('berry'); },
    up() { placeUp(); },
    update(dt) { placeUpdate(dt); },
    hint(h) { placeHint(h, 'berry'); },
  };
  STAGES.CANDLES = {
    enter() { progressed(); },
    down() { return placeDown('candle'); },
    up() { placeUp(); },
    update(dt) { placeUpdate(dt); },
    hint(h) { placeHint(h, 'candle'); },
  };

  // ================================================================ 7. LIGHT
  const L = { held: false, orient: 0, q0: new THREE.Quaternion(), pos: new V3(), prev: new V3(), near: null, dwell: 0, lx: 0, lz: 0 };
  function lighterCenter(out) { return lighter.localToWorld(out.set(0, 0.03, 0.15)); }
  function wickWorld(it, out) { it.obj.updateWorldMatrix(true, true); return it.obj.userData.wickTop.getWorldPosition(out); }
  function nextUnlit(from) {
    let best = null, bd = 1e9;
    for (const it of candles) {
      if (it.lit || it.state !== 'placed') continue;
      wickWorld(it, t3);
      const d = from ? Math.hypot(t3.x - from.x, t3.z - from.z) : -t3.z;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  const litCentroid = new V3();
  function updateCentroid() {
    litCentroid.set(0, 0, 0); let n = 0;
    for (const it of candles) if (it.lit) { wickWorld(it, t3); litCentroid.add(t3); n++; }
    if (n) litCentroid.multiplyScalar(1 / n); else litCentroid.set(cake.position.x, CAKE_TOP + 0.07, cake.position.z);
    return n;
  }
  STAGES.LIGHT = {
    enter() { progressed(); },
    down() {
      if (!isNear(lighterCenter(t1), 0.12)) return false;
      stopMove(lighter);
      L.held = true; L.orient = 0; L.q0.copy(lighter.quaternion);
      L.pos.copy(lighter.position); L.prev.copy(L.pos); L.near = null; L.dwell = 0;
      lighter.userData.setTrigger(true);
      lighterFlame.setLit(true);
      A.play('lighterClick'); A.play('flameOn');
      return true;
    },
    up() { if (L.held) releaseLighter(); },
    update(dt) {
      if (!L.held) return;
      const it0 = candles[0];
      const wickY = cake.position.y + CAKE_TOP - 0.014 + it0.obj.userData.length + 0.0066;
      const h = onPlane(wickY, t1);
      if (h) t2.set(clamp(h.x, -1, 1), wickY, clamp(h.z - 0.035, -0.55, 0.65)); else t2.copy(L.pos);
      // magnet
      let best = null, bd = 0.04;
      for (const it of candles) {
        if (it.lit || it.state !== 'placed') continue;
        wickWorld(it, t3);
        const d = Math.hypot(t3.x - t2.x, t3.z - t2.z);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) {
        wickWorld(best, t3);
        t2.set(t3.x, t3.y - 0.005, t3.z + 0.007);
        if (best !== L.near) { L.near = best; L.dwell = 0; }
        L.dwell += dt;
        if (L.dwell > 0.18) lightCandle(best);
      } else { L.near = null; L.dwell = 0; }
      const r = 1 - Math.exp(-(best ? 16 : 25) * dt);
      L.pos.lerp(t2, r);
      L.orient = Math.min(1, L.orient + dt / 0.15);
      const vx = (L.pos.x - L.prev.x) / Math.max(dt, 1e-3), vz = (L.pos.z - L.prev.z) / Math.max(dt, 1e-3);
      L.prev.copy(L.pos);
      L.lz = damp(L.lz, clamp(-vx * 0.2, -0.15, 0.15), 10, dt);
      L.lx = damp(L.lx, clamp(vz * 0.2, -0.15, 0.15), 10, dt);
      lighter.position.copy(L.pos);
      if (L.orient < 1) lighter.position.y += 0.02 * Math.sin(Math.PI * L.orient);
      eul.set(L.lx, 0.12, L.lz); q1.setFromEuler(eul);
      q2.slerpQuaternions(L.q0, q1, easeOut(L.orient));
      lighter.quaternion.copy(q2);
    },
    hint(h) {
      if (S.lit >= 5) return;
      h.on = true;
      const nx = nextUnlit(L.held ? L.pos : null);
      if (L.held) {
        h.held = true; h.spot = false;
        if (nx) { wickWorld(nx, h.glint); h.hasGlint = true; h.hasDest = true; h.from.copy(lighter.position); h.dest.copy(h.glint); h.dest.y += 0.012; h.arc = 0.02; }
        return;
      }
      h.obj = lighter; h.pos.copy(SLOT); h.pos.z -= 0.05; h.r = 0.1;
      if (nx) { h.hasDest = true; lighterCenter(h.from); wickWorld(nx, h.dest); h.dest.y += 0.012; h.hasGlint = true; h.glint.copy(h.dest); }
      h.demo = DEMO.light; h.demoOpts = DOPT.light;
    },
  };
  function releaseLighter() {
    L.held = false;
    lighter.userData.setTrigger(false);
    lighterFlame.setLit(false);
    t1.copy(SLOT).add(lighter.userData.restPose.position);
    moveTo(lighter, t1, lighter.userData.restPose.quaternion, 0.45, { arc: 0.03, sound: 'put', vol: 0.6, settle: 0.4 });
  }
  function lightCandle(it) {
    if (it.lit) return;
    it.lit = true;
    it.flame.setLit(true);
    const k = ++S.lit;
    A.play('candleLit', { index: k - 1 });
    const n = updateCentroid();
    glow.set(n, litCentroid);
    engine.setRoomLight(1 - 0.19 * k, 0.7);
    A.play('roomDim', { vol: 0.7 });
    progressed();
    L.near = null; L.dwell = 0;
    if (S.lit >= 5) allLit();
  }
  function allLit() {
    S.busy = true;
    L.held = false;
    tl.after(0.35, () => {
      lighterFlame.setLit(false); lighter.userData.setTrigger(false);
      t1.copy(OFF).add(lighter.userData.restPose.position);
      moveTo(lighter, t1, lighter.userData.restPose.quaternion, 0.7, { ease: easeInOut, done: () => { lighter.visible = false; } });
      A.play('slideOut', { vol: 0.6 });
    });
    tl.after(0.9, () => { engine.setRoomLight(PARTY_DIM, 1.0); enter('ARRIVE'); });
  }

  // ================================================================ ARRIVE (cut-scene)
  STAGES.ARRIVE = {
    enter() {
      S.busy = true;
      frameTo('PARTY', 2.5);
      // Papa is the subject now: a little less background blur so his face reads
      tl.tween(2.5, (e) => { engine.bgBlur = lerp(0.7, 0.36, e); }, null, easeInOut);
      tl.after(1.0, () => A.play('door', { vol: 0.9 }));
      tl.after(1.9, () => {
        papaReset(); papa.visible = true;
        const walk = 2.1;
        tl.tween(walk, (e, k) => {
          papa.position.x = lerp(1.7, 0, e);
          papa.position.y = 0.33 + 0.012 * Math.abs(Math.sin(k * walk * Math.PI * 2.4));
          papa.rotation.y = -Math.PI / 2 * (1 - easeInOut(clamp01((k - 0.62) / 0.38)));
          P.tgt.headTilt = 0.3 * Math.sin(k * 6);
        }, () => { papa.position.x = 0; papa.rotation.y = 0; P.tgt.headTilt = 0; }, (k) => 1 - (1 - k) * (1 - k));
        for (let i = 0; i < 5; i++) tl.after(0.1 + i * 0.42, () => A.play('footstep', { vol: 0.75 - i * 0.04 }));
      });
      tl.after(3.0, () => A.music.start());
      tl.after(4.05, () => {
        P.tgt.lean = 0.25;
        tl.tween(0.7, (e) => { papa.position.y = lerp(0.33, 0, e); }, () => { papa.position.y = 0; }, easeInOut);
      });
      tl.after(4.8, () => { P.tgt.lean = 0; P.tgt.armsUp = 1; P.tgt.laugh = 0.55; papaClap(3); P.bounceAmp = 0.5; });
      tl.after(6.4, () => { P.tgt.armsUp = 0; P.tgt.laugh = 0.25; S.busy = false; enter('GIVE'); });
    },
  };

  // ================================================================ 8. GIVE
  const G = { held: false, off: 0, z: CAKE_HOME.z, prevZ: CAKE_HOME.z, glide: false, wind: 0 };
  function cakeCenter(out) { return out.set(cake.position.x, cake.position.y + 0.1, cake.position.z); }
  STAGES.GIVE = {
    enter() { progressed(); P.tgt.lean = 0.12; P.beckon = true; G.z = cake.position.z; G.prevZ = G.z; },
    down() {
      if (G.glide || S.given) return false;
      if (!isNear(cakeCenter(t1), 0.15, 90)) return false;
      const h = onPlane(STAND_TOP, t2);
      if (!h) return false;
      G.held = true; G.off = cake.position.z - h.z;
      A.play('tap', { vol: 0.5, pitch: 0.8 });
      return true;
    },
    up() {
      if (!G.held) return;
      G.held = false;
      if (cake.position.z < -0.31) {
        G.glide = true;
        const z0 = cake.position.z;
        tl.tween(0.5, (e) => { G.z = lerp(z0, CAKE_GIVEN_Z, e); }, () => { G.glide = false; G.z = CAKE_GIVEN_Z; }, easeOut);
      }
    },
    update(dt) {
      if (G.held) {
        const h = onPlane(STAND_TOP, t2);
        if (h) G.z = clamp(h.z + G.off, CAKE_GIVEN_Z, CAKE_HOME.z);
      }
      cake.position.z = damp(cake.position.z, G.z, 18, dt);
      const vz = (cake.position.z - G.prevZ) / Math.max(dt, 1e-3);
      G.prevZ = cake.position.z;
      A.slide.set(clamp01(Math.abs(vz) / 0.25));
      G.wind = damp(G.wind, clamp(-vz * 2.5, -1, 1), 8, dt);
      for (const it of candles) if (it.lit) it.flame.setWind(0, G.wind);
      if (Math.abs(vz) > 0.02) progressed();
      if (it0Lit()) { updateCentroid(); glow.set(S.lit, litCentroid); }
      if (!S.given && cake.position.z <= CAKE_GIVEN_Z + 0.005) { S.given = true; A.slide.set(0); blowSequence(); }
    },
    hint(h) {
      if (S.given) return;
      h.on = true;
      h.from.set(0, 0.25, cake.position.z + 0.02); h.dest.set(0, 0.27, -0.60); h.hasDest = true; h.arc = 0.0;
      if (G.held) { h.held = true; h.pos.set(0, 0.001, CAKE_GIVEN_Z); h.r = 0.17; return; }
      h.obj = cake; h.pos.copy(cake.position); h.r = 0.17;
      h.demo = DEMO.give; h.demoOpts = DOPT.give;
    },
  };
  function it0Lit() { return S.lit > 0; }
  function blowSequence() {
    S.busy = true; P.beckon = false; G.held = false;
    for (const it of candles) it.flame.setWind(0, 0);
    tl.tween(0.9, (e) => { P.tgt.lean = lerp(0.12, 1, e); }, null, easeInOut);
    P.rate.lean = 8;
    tl.after(0.9, () => { P.tgt.bounce = 0.8; P.tgt.laugh = 0; P.tgt.armsUp = 0; });
    tl.after(1.3, () => {
      P.tgt.bounce = 0; P.tgt.blow = 1;
      A.play('blow');
      for (const it of candles) it.flame.setWind(0, 1);
      const order = candles.filter((c) => c.lit).sort((a, b) => wickWorld(a, t1).z - wickWorld(b, t2).z);
      order.forEach((it, i) => tl.after(0.15 + i * 0.09, () => {
        it.flame.setLit(false); it.lit = false;
        smoke.puff(wickWorld(it, t3));
        const n = updateCentroid(); glow.set(n, litCentroid);
      }));
      A.music.stop(0.4);
    });
    tl.after(2.0, () => { P.tgt.blow = 0; for (const it of candles) it.flame.setWind(0, 0); glow.set(0, litCentroid); });
    tl.after(2.2, () => { P.tgt.lean = 1.2; });
    tl.after(2.55, () => {
      A.play('plop', { vol: 0.55, pitch: 0.8 });
      cakeCream.dent(0, -0.07);
      P.tgt.creamNose = 1;
    });
    tl.after(3.2, () => {
      A.play('switchOn');
      engine.setRoomLight(1, 0.5);
      P.rate.lean = 3.5; P.tgt.lean = 0; P.tgt.laugh = 1; P.bounceAmp = 1;
    });
    tl.after(3.6, () => { P.tgt.armsUp = 1; papaClap(6); A.music.start(); });
    tl.after(5.0, () => { S.busy = false; enter('POP'); });
  }

  // ================================================================ 9. POP
  // The party popper lies on its side on the counter (a cone rests with its mouth tipped up),
  // mouth toward Papa, its string trailing toward the child. Pull the tab along the string.
  const POP_TILT = Math.atan2(0.023, 0.105);
  const PO = {
    up: false, held: false, pull: 0, sx: 0, sy: 0, ux: 0, uy: 1, perPx: 0.001, firing: false, palette: 0,
    land: null, home: new V3(), dH: new V3(), sDir: new V3(), slide: 1, kick: 0, hopY: 0,
    qBase: new THREE.Quaternion(), qStr: new THREE.Quaternion(), m: new THREE.Matrix4(),
  };
  function popperLayout() {
    const land = camera.aspect > 1.05;
    PO.land = land;
    if (land) PO.home.set(0.30, 0.0143, -0.37); else PO.home.set(0.185, 0.0143, -0.25);
    PO.dH.set(-PO.home.x, 0, PAPA_Z + 0.03 - PO.home.z).normalize();
    t1.copy(PO.dH).multiplyScalar(Math.cos(POP_TILT)); t1.y = Math.sin(POP_TILT);
    PO.qBase.setFromUnitVectors(UP, t1);
    cracker.quaternion.copy(PO.qBase);
    // the string lies flat on the counter, toward the child and a little toward the middle
    PO.sDir.set(-0.28, 0, 1).normalize();
    t2.copy(PO.sDir).negate();           // string local +Y
    t3.crossVectors(t2, UP).normalize(); // string local +X
    PO.m.makeBasis(t3, t2, UP);
    PO.qStr.setFromRotationMatrix(PO.m);
    const st = cracker.userData.string;
    st.quaternion.copy(PO.qBase).invert().multiply(PO.qStr);
    st.scale.set(1, 1, 0.45);
  }
  function popperPlace() {
    cracker.position.set(
      PO.home.x + PO.slide * 0.6 + PO.sDir.x * 0.012 * PO.pull - PO.dH.x * PO.kick,
      PO.home.y + PO.hopY,
      PO.home.z + PO.sDir.z * 0.012 * PO.pull - PO.dH.z * PO.kick);
  }
  function tabWorld(out) { cracker.updateMatrixWorld(true); return cracker.userData.tab.localToWorld(out.set(0, -0.009, 0)); }
  function popperRise() {
    cracker.userData.setFired(false); cracker.userData.setPull(0); PO.pull = 0; PO.kick = 0; PO.hopY = 0;
    popperLayout();
    PO.slide = 1; popperPlace();
    cracker.visible = true;
    tl.tween(0.6, (e) => { PO.slide = 1 - e; }, () => { PO.slide = 0; PO.up = true; }, easeOut);
    A.play('slideIn', { pitch: 1.2, vol: 0.6 });
  }
  STAGES.POP = {
    enter() { progressed(); P.tgt.armsUp = 0; P.tgt.laugh = 0.4; popperRise(); },
    down(p) {
      if (!PO.up || PO.firing) return false;
      if (screenDist(tabWorld(t1)) > 80 && screenDist(t2.copy(cracker.position)) > 50) return false;
      PO.held = true; PO.sx = p.x; PO.sy = p.y;
      // pull along the string as it looks on screen
      toScreen(tabWorld(t1)); const ax = scr.x, ay = scr.y;
      toScreen(t2.copy(t1).addScaledVector(PO.sDir, 0.05));
      let ux = scr.x - ax, uy = scr.y - ay; const ul = Math.hypot(ux, uy);
      if (ul > 1) { PO.ux = ux / ul; PO.uy = uy / ul; PO.perPx = 0.05 / ul; } else { PO.ux = 0; PO.uy = 1; PO.perPx = 0.0006; }
      A.play('tap', { vol: 0.6, pitch: 1.3 });
      return true;
    },
    move(p) {
      if (!PO.held) return;
      const a = clamp01(((p.x - PO.sx) * PO.ux + (p.y - PO.sy) * PO.uy) * PO.perPx / 0.05);
      PO.pull = a; cracker.userData.setPull(a);
      if (a >= 1) firePopper();
    },
    up() {
      if (!PO.held) return;
      PO.held = false;
      if (PO.firing) return;
      const a0 = PO.pull;
      tl.tween(0.35, (e) => { if (PO.firing || PO.held) return; PO.pull = a0 * (1 - e); cracker.userData.setPull(PO.pull); }, null, easeOut);
    },
    update(dt) {
      if (cracker.visible) {
        if ((camera.aspect > 1.05) !== PO.land) popperLayout();
        popperPlace();
      }
      if (S.photoAt >= 0 && !S.ending) {
        if (!ptr.active) S.sinceTouch += dt;
        S.sincePop += dt;
        const since = S.time - S.photoAt;
        if (S.sinceTouch > 7 || (S.pops >= 3 && S.sincePop > 4) || since > 25) endDay();
      }
    },
    hint(h) {
      if (!PO.up || PO.firing || S.ending) return;
      h.on = true;
      tabWorld(h.glint); h.glint.y += 0.004; h.hasGlint = true;
      if (PO.held) { h.held = true; h.spot = false; return; }
      h.obj = cracker; h.pos.set(h.glint.x, 0, h.glint.z); h.r = 0.05;
      h.demo = DEMO.pop; h.demoOpts = DOPT.pop;
    },
  };
  const _dir = new V3();
  function firePopper() {
    if (PO.firing) return;
    PO.firing = true; PO.held = false; PO.up = false;
    S.pops++; S.sincePop = 0;
    cracker.updateMatrixWorld(true);
    cracker.userData.mouth.getWorldPosition(t1);
    // up and over the cake, so it flutters down through the middle of the picture
    _dir.set(-PO.home.x, 0.52, CAKE_GIVEN_Z - PO.home.z).normalize();
    confetti.burst(t1, _dir, { count: 120, palette: PALETTES[PO.palette % PALETTES.length] || undefined });
    PO.palette++;
    A.play('pop');
    tl.after(0.25, () => A.play('rustle'));
    cracker.userData.setFired(true);
    // recoil: it jumps and skids back toward the child
    tl.tween(0.4, (e, k) => {
      PO.kick = 0.03 * e; PO.hopY = 0.022 * Math.sin(Math.PI * k);
      PO.pull = 1 - e; cracker.userData.setPull(PO.pull);
    }, () => { PO.hopY = 0; PO.pull = 0; }, easeOut);
    // Papa startles, then laughs and claps
    P.tgt.nod = -0.8; P.tgt.laugh = 0.2;
    tl.after(0.3, () => { P.tgt.nod = 0; P.tgt.laugh = 1; P.tgt.armsUp = 1; papaClap(4); P.bounceAmp = 0.7; });
    tl.after(0.6, () => { P.tgt.streamers = 1; });
    tl.after(2.4, () => { P.tgt.armsUp = 0; P.tgt.laugh = 0.6; });
    if (S.pops === 1) tl.after(2.2, takePhoto);
    tl.after(1.5, () => {
      tl.tween(0.5, (e) => { PO.slide = e; }, () => {
        cracker.visible = false;
        PO.firing = false;
        if (S.pops < 3 && !S.ending) tl.after(0.4, () => { if (!S.ending && S.stage === 'POP') popperRise(); });
      }, easeIn);
      A.play('slideOut', { vol: 0.5, pitch: 1.2 });
    });
  }
  function takePhoto() {
    if (S.photoAt >= 0) return;
    const hv = hints.object.visible;
    hints.object.visible = false;
    const url = engine.snapshot(320);
    hints.object.visible = hv;
    engine.flash(0.5);
    A.play('shutter');
    S.photoAt = S.time; S.sinceTouch = 0;
    if (url) {
      engine.save.set('photo', url);
      const plays = engine.save.get('plays', 0);
      engine.save.set('plays', (typeof plays === 'number' && isFinite(plays) ? plays : 0) + 1);
      tl.after(0.6, () => { W.showPhoto(url, true); });
    }
  }
  function endDay() {
    if (S.ending) return;
    S.ending = true; S.busy = true;
    A.music.stop(3);
    engine.fade(1, 2.0);
    tl.after(2.15, () => {
      resetWorld();
      engine.fade(0, 1.2);
    });
  }

  // ================================================================ other taps (tiny, never progress)
  const OT = { cool: 0 };
  function otherTap(p) {
    if (OT.cool > 0) return false;
    // lit candle flame → flutter
    for (const it of candles) {
      if (!it.lit) continue;
      if (screenDist(wickWorld(it, t1)) < 26) {
        it.flame.setWind((Math.random() - 0.5) * 1.2, 0.6);
        tl.after(0.35, () => it.flame.setWind(0, 0));
        A.play('sizzle'); OT.cool = 0.2; return true;
      }
    }
    // placed strawberry → jiggle
    if (S.stage !== 'BERRIES') {
      for (const it of berries) {
        if (it.state !== 'placed') continue;
        if (screenDist(itemWorld(it, t1)) < 22) { jiggle(it.obj); A.play('plop', { vol: 0.4, pitch: 1.4 }); OT.cool = 0.15; return true; }
      }
    }
    // photo frame → hop
    if (isNear(t1.copy(frame.position).add(t4.set(0, 0.08, 0)), 0.08, 40)) { hop(frame); A.play('frameHop'); OT.cool = 0.25; return true; }
    // Papa → two claps
    if (papa.visible && (S.stage === 'GIVE' || S.stage === 'POP') && !S.busy) {
      papa.userData.head.getWorldPosition(t1);
      if (isNear(t1, 0.14, 50)) { P.tgt.armsUp = 1; papaClap(2); tl.after(1.3, () => { if (P.claps <= 0 && S.stage !== 'POP') P.tgt.armsUp = 0; }); OT.cool = 0.6; return true; }
    }
    // bare sponge → squish
    if (!cakeCream.hasDollop && S.stage !== 'ARRIVE' && isNear(cakeTopCenter(t1), 0.1, 50)) {
      tl.tween(0.35, (e, k) => sponge.userData.squish(0.6 * Math.sin(Math.PI * k) * (1 - 0.4 * k)), () => sponge.userData.squish(0));
      A.play('boing'); OT.cool = 0.35; return true;
    }
    // empty carton → pok
    if (S.pourDone && !POUR.held && isNear(cartonCenter(t1), 0.07, 40) && !carton.userData._mv) {
      jiggle(carton); A.play('pok'); OT.cool = 0.25; return true;
    }
    // resting mixer → brief ういん
    if (!M.held && S.stage !== 'WHIP' && !mixer.userData._mv && isNear(mixerCenter(t1), 0.08, 40)) {
      M.burst = 0.4; OT.cool = 0.6; return true;
    }
    return false;
  }
  function jiggle(obj) {
    const u = obj.userData;
    if (u._jig) return;
    const q0 = obj.quaternion.clone();
    u._jig = tl.tween(0.4, (e, k) => {
      q3.setFromAxisAngle(AZ, 0.12 * Math.sin(k * Math.PI * 4) * (1 - k));
      obj.quaternion.copy(q0).multiply(q3);
    }, () => { obj.quaternion.copy(q0); u._jig = null; });
  }

  // ================================================================ input
  let wipeT = -1;
  function lens(p) {
    const hit = splats.wipeLens(p.ndc.x, p.ndc.y, 0.16);
    if (hit && S.time - wipeT > 0.15) { wipeT = S.time; A.play('squeak'); }
    return hit;
  }
  engine.input.on('down', (p) => {
    ptr.active = true; ptr.x = p.x; ptr.y = p.y; ptr.ndc.set(p.ndc.x, p.ndc.y); ptr.ray.copy(p.ray);
    ptr.wipeOnly = false;
    touched();
    if (lens(p)) { ptr.wipeOnly = true; return; }
    const st = STAGES[S.stage];
    let used = false;
    if (!S.busy && st && st.down) used = !!st.down(p);
    if (!used) used = otherTap(p);
    if (!used && !S.busy) { S.nudge = 1.2; playLimited('tap', 0.6, { vol: 0.3, pitch: 1.4 }); }
  });
  engine.input.on('move', (p) => {
    ptr.x = p.x; ptr.y = p.y; ptr.ndc.set(p.ndc.x, p.ndc.y); ptr.ray.copy(p.ray);
    if (lens(p) || ptr.wipeOnly) return;
    const st = STAGES[S.stage];
    if (st && st.move) st.move(p);
  });
  function releaseAll() {
    if (POUR.held) releaseCarton();
    if (M.held) mixerRelease();
    if (D.held) STAGES.DOLLOP.up();
    if (K.held) releaseKnife();
    if (IC.item) placeUp();
    if (L.held) releaseLighter();
    if (G.held) STAGES.GIVE.up();
    if (PO.held) STAGES.POP.up();
  }
  engine.input.on('up', (p) => {
    ptr.active = false;
    if (p) { ptr.x = p.x; ptr.y = p.y; }
    ptr.wipeOnly = false;
    releaseAll();
  });
  engine.onVisibility((v) => {
    if (!v) { stopContinuous(); ptr.active = false; releaseAll(); M.burst = 0; }
  });

  // ================================================================ reset (start + new day)
  function resetWorld() {
    tl.clear();
    hintsOff();
    ptr.wipeOnly = false;
    stopContinuous();
    A.music.stop(0.3);
    Object.assign(S, {
      stage: '', busy: false, idle: 0, nudge: 0, poured: 0, pourDone: false, whip: 0, rub: 0,
      placed: 0, lit: 0, pops: 0, photoAt: -1, sinceTouch: 0, sincePop: 0, ending: false,
      dolloped: false, given: false,
    });
    engine.setRoomLight(1, 0); room.userData.setLight(1); A.ambience.set(1);
    engine.bgBlur = 0.7;
    // carton
    POUR.held = false; POUR.snapped = false; POUR.tilt = 0; POUR.yaw = POUR.homeYaw;
    POUR.dirA = Math.atan2(CARTON_HOME.z - BOWL_HOME.z, CARTON_HOME.x - BOWL_HOME.x);
    carton.userData._mv = null; carton.userData._jig = null;
    carton.position.copy(CARTON_HOME); carton.quaternion.setFromAxisAngle(UP, POUR.homeYaw);
    carton.userData.setOpen(false);
    pour.set(false);
    // bowl
    D.held = false; bowl.userData._mv = null; bowl.visible = true;
    bowl.position.copy(BOWL_HOME); bowl.quaternion.identity();
    bowlCream.reset();
    // mixer
    Object.assign(M, { held: false, s: 0, burst: 0, inCream: false, wasIn: false, fling: 0, glassN: 0, audioOn: false, done: false });
    M.home.copy(MIXER_HOME); mixer.userData._mv = null;
    placeMixerAtHome(); mixer.userData.setCream(0);
    // cake
    cake.position.copy(CAKE_HOME); cake.rotation.set(0, 0, 0);
    cakeCream.reset(); sponge.userData.squish(0);
    G.held = false; G.glide = false; G.z = CAKE_HOME.z; G.prevZ = G.z; G.wind = 0;
    // tools
    K.held = false;
    spatula.visible = false; spatula.position.copy(OFF); spatula.quaternion.identity(); spatula.userData.setCream(0); spatula.userData._mv = null;
    plate.visible = false; plate.position.copy(OFF); plate.quaternion.identity(); plate.userData._mv = null;
    box.visible = false; box.position.copy(OFF); box.quaternion.identity(); box.userData._mv = null;
    L.held = false;
    lighter.visible = false; lighter.userData._mv = null; lighter.userData.setTrigger(false); lighterFlame.setLit(false, true);
    lighter.position.copy(OFF);
    IC.item = null;
    for (const it of items) {
      it.lit = false; it.obj.userData._mv = null; it.obj.userData._jig = null;
      if (it.flame) { it.flame.setLit(false, true); it.flame.setWind(0, 0); }
      putInTray(it);
    }
    glow.set(0, litCentroid);
    // popper
    Object.assign(PO, { up: false, held: false, pull: 0, firing: false, palette: 0 });
    cracker.visible = false; cracker.userData.setFired(false); cracker.userData.setPull(0);
    // Papa
    papaReset(); P.rate.lean = 3.2;
    // fx
    splats.clear(); confetti.clear();
    frame.userData._hop = null; frame.position.copy(FRAME_POS); frame.rotation.set(0, FRAME_YAW, 0);
    enter('POUR');
    frameTo('PREP', 0);
  }

  // ---------------------------------------------------------------- finger demonstrations (built only when shown)
  const DOPT = {
    pour: { duration: 1.6 }, whip: { duration: 2.4 }, dollop: { duration: 1.6 }, spread: { duration: 2.2, wiggle: 0.025 },
    place: { duration: 1.6 }, light: { duration: 1.6 }, give: { duration: 1.3 }, pop: { duration: 0.9 },
  };
  const DEMO = {
    pour: () => [cartonCenter(new V3()), new V3(-0.12, 0.17, 0.02), new V3(-0.07, 0.17, 0.07)],
    whip: () => {
      const b = bowl.position;
      return [mixerCenter(new V3()), new V3(b.x + 0.06, 0.13, b.z), new V3(b.x + 0.03, 0.1, b.z + 0.03),
        new V3(b.x - 0.03, 0.1, b.z), new V3(b.x + 0.0, 0.1, b.z - 0.03), new V3(b.x + 0.03, 0.1, b.z + 0.02)];
    },
    dollop: () => [bowlCenter(new V3()), new V3(cake.position.x, 0.16, cake.position.z + 0.12)],
    spread: () => [knifeCenter(new V3()), cakeTopCenter(new V3()).add(t4.set(-0.02, 0.005, 0.03)), cakeTopCenter(new V3()).add(t4.set(0.03, 0.005, -0.02))],
    place: () => {
      const it = nextInTray(S.stage === 'BERRIES' ? 'berry' : 'candle');
      if (!it) return null;
      return [itemWorld(it, new V3()), new V3(cake.position.x * 0.5, 0.2, (cake.position.z + SLOT.z) * 0.5), cakeTopCenter(new V3()).add(t4.set(0.02, 0.01, 0.02))];
    },
    light: () => {
      const nx = nextUnlit(null);
      const w = nx ? wickWorld(nx, new V3()) : cakeTopCenter(new V3());
      return [lighterCenter(new V3()), w.add(t4.set(0, 0.0, 0.03))];
    },
    give: () => [new V3(0, 0.08, cake.position.z + 0.13), new V3(0, 0.08, cake.position.z + 0.11), new V3(0, 0.08, cake.position.z - 0.06)],
    pop: () => { const a = tabWorld(new V3()); a.y += 0.01; return [a, a.clone().addScaledVector(PO.sDir, 0.07)]; },
  };

  // ================================================================ main update
  const fxFlames = [lighterFlame, ...candles.map((c) => c.flame)];
  engine.onUpdate((dt, t) => {
    S.time = t;
    OT.cool = Math.max(0, OT.cool - dt);
    if (camera.aspect !== lastAspect && !engine.cam.busy) {
      lastAspect = camera.aspect;
      frameTo(framingName, 0.35);
    }
    tl.update(dt);
    if (ptr.active) refreshRay();
    const st = STAGES[S.stage];
    if (st && st.update) st.update(dt, t);
    mixerUpdate(dt);
    papaUpdate(dt, t);
    // fx
    bowlCream.update(dt, t);
    pour.update(dt, t);
    cakeCream.update(dt, t);
    splats.update(dt, t, camera);
    for (let i = 0; i < fxFlames.length; i++) fxFlames[i].update(dt, t);
    glow.update(dt, t);
    {
      let n = 0; for (let i = 0; i < candles.length; i++) if (candles[i].lit) n++;
      bounceI = damp(bounceI, n ? 0.2 * Math.pow(n, 0.85) * (1 - engine.roomLight) : 0, 6, dt);
      bounce.intensity = bounceI * (1 + 0.05 * Math.sin(t * 9.1) + 0.03 * Math.sin(t * 15.3));
      bounce.position.set(cake.position.x + 0.05, cake.position.y + 0.22, cake.position.z + 0.34);
    }
    smoke.update(dt, t);
    confetti.update(dt, t);
    hintDirector(dt);
    hints.update(dt, t, camera);
  });

  // ================================================================ boot
  W.loadSavedPhoto();
  // compile every material once up front (hidden props would otherwise hitch when they first appear)
  try {
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    engine.renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
  } catch (e) { /* ignore */ }
  resetWorld();

  return {
    state: S,
    objects: { bowl, carton, mixer, cake, sponge, spatula, plate, box, lighter, cracker, frame, papa, items, room, counter },
    fx: { bowlCream, cakeCream, splats, confetti, hints, pour },
  };
}
