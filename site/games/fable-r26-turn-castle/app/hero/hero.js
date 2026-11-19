// Hero mechanism of "三階建て回転お城" (API: docs/HERO-SPEC.md).
//
// What it is: three turntable floors around a fixed column. Each floor carries one flight of a
// spiral stair that stands in the open stairwell. Turn a floor until its flight meets the landing
// below (integer detent steps): the drawbridge treads fold down, the gate opens, the chest and the
// teddy hop up to the next landing. After the third flight they enter the tower; the lift pedestal
// rises and its circular rack turns the sector gear on every petal hinge, so the onion dome opens
// like a flower, the flag pole extends and the chest opens.
//
// Everything is kinematic (no physics engine):
//   ring angle      theta_i = step_i * 2π/STEPS (+ drag offset, critically damped spring on release)
//   rim gear        theta_pinion = -(Z_RING / Z_PINION) * theta_i
//   detent cam      roller lift = DEPTH * |sin(WAVES/2 * theta_i)|  ->  pawl arm angle = asin(lift / ARM)
//   rack & pinion   petal angle = (pedestal height - HINGE_Y) / SECTOR_R
//   cargo           position = piecewise path (landing arc, treads, landing arc) of one parameter
// No imports of three: THREE arrives as an argument. Build: `npm run build:hero`.

import { PARAMS as P } from './params.js';
import { buildParts } from './parts.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, u) => a + (b - a) * u;
const mod = (a, n) => ((a % n) + n) % n;
const easeOutBack = (x, c1) => { x = clamp01(x); const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12]; // one note of the major scale per tread

export { PARAMS } from './params.js';

export function createHero(THREE, opts) {
  opts = opts || {};
  const low = opts.tier === 'low';
  const calm = !!opts.reducedMotion;
  const parts = buildParts(THREE, opts, low);
  const L = parts.L, S = P.STAIR, T = P.TOWER, CG = P.CARGO, CH = P.CHAIN;
  const N = P.FLOORS;
  const ALPHA = TAU / P.STEPS;
  const GEAR_RATIO = P.GEAR.Z_RING / P.GEAR.Z_PINION;
  const STAGE_NAMES = ['ring0', 'ring1', 'ring2', 'tower', 'finale'];
  const sound = (n, p) => { if (opts.playSound) { try { opts.playSound(n, p); } catch (_) { /* never break the frame */ } } };

  // ---------------------------------------------------------------- state
  const rings = parts.rings.map((r, i) => ({
    group: r.group, woodMat: r.woodMat, trimMat: r.trimMat, lamps: r.lamps,
    ang: P.START_STEPS[i] * ALPHA, vel: 0, step: P.START_STEPS[i], locked: false, wig: 0, lastTick: P.START_STEPS[i], dragVel: 0, vis: 0,
  }));
  const bridge = new Float32Array(N);        // 0 = folded up, 1 = down
  const doorOpen = new Float32Array(N + 1);  // gates 0..N-1, tower door N
  // cargo[0] = chest, cargo[1] = teddy. plat: landing index (-1 = start pad); frac: place on that landing
  const cargo = [
    { obj: parts.chest, base: CG.CHEST_SCALE, plat: -1, frac: S.SLOT_NEAR, dr: -S.SLOT_DR, hopK: -1 },
    { obj: parts.teddy, base: CG.TEDDY_SCALE, plat: -1, frac: S.SLOT_FAR, dr: S.SLOT_DR, hopK: -1 },
  ];
  const tower = { z: L.roofY, ext: 0, phi: -1, shake: 0, lid: 0 };
  let stage = 0, lastStage = -1, busy = false, finished = false;
  let chain = null, time = 0, flash = 0, finT = 0, bounceT = 9, lastNow = 0;
  const stateOut = { stage: 0, stageName: STAGE_NAMES[0], busy: false, finished: false };

  function setStage(s) {
    stage = s;
    if (s !== lastStage) {
      lastStage = s;
      if (opts.onStage) { try { opts.onStage(s, { name: STAGE_NAMES[s], stageCount: STAGE_NAMES.length }); } catch (_) { /* ignore */ } }
    }
  }
  const activeRing = () => (stage < N ? stage : -1);

  // ---------------------------------------------------------------- scratch objects (no per-frame allocation)
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  const vPos = new THREE.Vector3(), vScl = new THREE.Vector3(), qRot = new THREE.Quaternion(), eul = new THREE.Euler();
  const ONE = new THREE.Vector3(1, 1, 1);

  // ---------------------------------------------------------------- linked parts: everything that follows a ring angle
  function updateLinks() {
    for (let i = 0; i < N; i++) {
      const r = rings[i], y = L.floorY(i);
      r.group.rotation.y = r.vis;
      // drawbridge: rigid piece about the hinge line of gate frame i
      mA.makeRotationY(r.vis).multiply(parts.gateFrames[i]).multiply(mB.makeRotationX(-P.BRIDGE.UP * (1 - bridge[i])));
      parts.bridgeMesh.setMatrixAt(i, mA);
      // pinion on the rim gear: theta_p = -(Z_RING / Z_PINION) * theta
      const pr = P.R_OUT + L.pinionR + 0.01;
      mA.makeRotationY(P.GEAR.ANGLE + Math.PI - GEAR_RATIO * r.vis).setPosition(pr * Math.sin(P.GEAR.ANGLE), y - P.RING.T / 2 - 0.005, pr * Math.cos(P.GEAR.ANGLE));
      parts.pinionMesh.setMatrixAt(i, mA);
      // detent pawl: the roller rides the cam track
      const lift = P.DETENT.DEPTH * Math.abs(Math.sin(P.DETENT.WAVES * 0.5 * r.vis));
      const up = clamp((lift + P.DETENT.ROLLER_R - P.DETENT.PIVOT_H) / P.DETENT.ARM, -0.95, 0.95);
      const pa = L.pawlPivotAngle;
      mA.makeRotationY(pa - Math.PI / 2).multiply(mB.makeRotationX(-Math.asin(up))).setPosition(L.trackR * Math.sin(pa), y + P.DETENT.PIVOT_H, L.trackR * Math.cos(pa));
      parts.pawlMesh.setMatrixAt(i, mA);
    }
    for (let k = 0; k < parts.doors.length; k++) {
      const d = parts.doors[k];
      const open = P.GATE.OPEN * doorOpen[d.group];
      mB.makeRotationY(d.base + d.sign * open).setPosition(d.hx, d.hy, d.hz);
      if (d.ring >= 0) mA.makeRotationY(rings[d.ring].vis).multiply(d.frame).multiply(mB); else mA.copy(d.frame).multiply(mB);
      parts.doorMesh.setMatrixAt(k, mA);
    }
    parts.bridgeMesh.instanceMatrix.needsUpdate = true;
    parts.pinionMesh.instanceMatrix.needsUpdate = true;
    parts.pawlMesh.instanceMatrix.needsUpdate = true;
    parts.doorMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- tower: one driver (pedestal height z) moves everything
  function updateTower() {
    const phi = Math.max(0, (tower.z - T.HINGE_Y) / T.SECTOR_R); // rack and pinion
    parts.pedestal.position.y = tower.z;
    parts.pole.position.y = tower.z - P.FLAG.POLE * (1 - tower.ext) - 0.02;
    parts.flag.visible = tower.ext > 0.03;
    parts.flag.scale.x = Math.max(0.05, smooth(tower.ext * 1.4));
    parts.lid.rotation.x = -tower.lid;
    const key = tower.shake ? -1 - time : phi; // while trembling the petals move every frame
    if (key === tower.phi) return;
    tower.phi = key;
    for (let j = 0; j < T.PETALS; j++) {
      const psi = TAU * j / T.PETALS;
      const wob = tower.shake ? tower.shake * Math.sin(time * 38 + j * 2.1) : 0;
      eul.set(Math.max(0, phi + wob), psi, 0, 'YXZ');
      qRot.setFromEuler(eul);
      vPos.set(T.HINGE_R * Math.sin(psi), T.HINGE_Y, T.HINGE_R * Math.cos(psi));
      mA.compose(vPos, qRot, ONE);
      parts.petalOut.setMatrixAt(j, mA); parts.petalIn.setMatrixAt(j, mA); parts.petalHw.setMatrixAt(j, mA);
    }
    parts.petalOut.instanceMatrix.needsUpdate = true;
    parts.petalIn.instanceMatrix.needsUpdate = true;
    parts.petalHw.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- cargo placement
  function setCargo(c, r, a, y, tilt, squash) {
    c.obj.position.set(r * Math.sin(a), y, r * Math.cos(a));
    c.obj.rotation.set(0, a, tilt || 0);
    const s = squash || 0, b = c.base;
    c.obj.scale.set(b * (1 - s * 0.5), b * (1 + s), b * (1 - s * 0.5));
  }
  function restCargo(c) { setCargo(c, L.rMid + c.dr, L.slotAngle(c.plat, c.frac), L.platY(c.plat), 0, 0); }
  function onPedestal(c, k, hop) {
    c.obj.position.set(k === 0 ? -0.28 : 0.28, tower.z + hop, 0.06);
    c.obj.rotation.set(0, k === 0 ? 0.2 : -0.2, 0);
    c.obj.scale.setScalar(c.base);
  }
  // one character climbing flight i; tau = seconds since it started; s0/s1 = path positions (metres from the foot)
  const climbDur = CG.ROLL_IN + S.N * CG.HOP_SEC + CG.ROLL_OUT;
  function climb(c, i, tau, s0, s1, dr1, lead) {
    const sPre = -0.06;
    let s, h = 0, tilt = 0, squash = 0, dr = 0;
    if (tau <= 0) { s = s0; dr = c.dr; }
    else if (tau < CG.ROLL_IN) { const u = smooth(tau / CG.ROLL_IN); s = lerp(s0, sPre, u); dr = c.dr * (1 - u); tilt = 0.06 * Math.sin(tau * 30); }
    else if (tau < CG.ROLL_IN + S.N * CG.HOP_SEC) {
      const kf = (tau - CG.ROLL_IN) / CG.HOP_SEC, k = Math.min(S.N - 1, Math.floor(kf)), u = kf - k;
      s = lerp(k === 0 ? sPre : (k - 0.5) * L.tread, (k + 0.5) * L.tread, u);
      h = (k + smooth(Math.min(1, u * 1.5))) * L.rise + CG.HOP_H * Math.sin(Math.PI * u);
      tilt = (k % 2 ? 1 : -1) * 0.1 * Math.sin(Math.PI * u);
      squash = 0.1 * Math.sin(Math.PI * u) - 0.08 * Math.max(0, 1 - u * 5);
      if (k !== c.hopK) { c.hopK = k; sound('hop', { pitch: SCALE[k % 8] - (lead ? 0 : 12), gain: lead ? 0.9 : 0.5, pan: 0 }); }
    } else {
      const u = clamp01((tau - CG.ROLL_IN - S.N * CG.HOP_SEC) / CG.ROLL_OUT);
      s = lerp((S.N - 0.5) * L.tread, s1, smooth(u)); dr = dr1 * smooth(u); h = P.FLOOR_H; tilt = 0.05 * Math.sin(u * 12) * (1 - u);
    }
    setCargo(c, L.rMid + dr, L.foot[i] + L.dir[i] * s / L.rMid, L.floorY(i) + h, tilt, squash);
  }

  // ---------------------------------------------------------------- sparkles (pooled, instanced)
  const SP = parts.nSpark;
  const sp = { n: 0, p: new Float32Array(SP * 3), v: new Float32Array(SP * 3), age: new Float32Array(SP), life: new Float32Array(SP), size: new Float32Array(SP) };
  const SPARK_COL = [[1, 0.9, 0.35], [1, 1, 1], [1, 0.5, 0.75], [0.55, 0.85, 1], [1, 0.75, 0.3]];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function burst(x, y, z, count, speed, upward) {
    if (calm) count = Math.ceil(count / 3);
    const ca = parts.sparkles.instanceColor.array;
    for (let k = 0; k < count && sp.n < SP; k++) {
      const i = sp.n++, a = rnd() * TAU, e = (rnd() - 0.25) * 1.4, v = speed * (0.5 + rnd() * 0.7);
      sp.p[i * 3] = x; sp.p[i * 3 + 1] = y; sp.p[i * 3 + 2] = z;
      sp.v[i * 3] = v * Math.cos(e) * Math.sin(a); sp.v[i * 3 + 1] = v * Math.sin(e) + upward; sp.v[i * 3 + 2] = v * Math.cos(e) * Math.cos(a);
      sp.age[i] = 0; sp.life[i] = 0.8 + rnd() * 1.0; sp.size[i] = 0.07 + rnd() * 0.09;
      const c = SPARK_COL[(rnd() * SPARK_COL.length) | 0];
      ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2];
    }
    parts.sparkles.instanceColor.needsUpdate = true;
  }
  function updateSparkles(dt) {
    if (!sp.n && !parts.sparkles.count) return;
    const ca = parts.sparkles.instanceColor.array;
    for (let i = 0; i < sp.n; i++) {
      sp.age[i] += dt;
      if (sp.age[i] >= sp.life[i]) { // remove: move the last one into this slot
        const l = --sp.n;
        if (l !== i) {
          for (let k = 0; k < 3; k++) { sp.p[i * 3 + k] = sp.p[l * 3 + k]; sp.v[i * 3 + k] = sp.v[l * 3 + k]; ca[i * 3 + k] = ca[l * 3 + k]; }
          sp.age[i] = sp.age[l]; sp.life[i] = sp.life[l]; sp.size[i] = sp.size[l];
        }
        i--; continue;
      }
      sp.v[i * 3 + 1] -= 1.6 * dt;
      const drag = Math.max(0, 1 - 1.2 * dt);
      for (let k = 0; k < 3; k++) { sp.v[i * 3 + k] *= drag; sp.p[i * 3 + k] += sp.v[i * 3 + k] * dt; }
      const u = sp.age[i] / Math.max(sp.life[i], 1e-3);
      const s = sp.size[i] * Math.sin(Math.PI * Math.sqrt(u)) * (0.75 + 0.25 * Math.sin(sp.age[i] * 25 + i));
      eul.set(sp.age[i] * 3 + i, sp.age[i] * 5, 0, 'XYZ'); qRot.setFromEuler(eul);
      mA.compose(vPos.set(sp.p[i * 3], sp.p[i * 3 + 1], sp.p[i * 3 + 2]), qRot, vScl.setScalar(Math.max(s, 1e-4)));
      parts.sparkles.setMatrixAt(i, mA);
    }
    parts.sparkles.count = sp.n;
    parts.sparkles.instanceMatrix.needsUpdate = true;
    parts.sparkles.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- flag wave: z = WAVE * u * sin(6t - 6.4u), 45 vertices
  const flagPos = parts.flag.geometry.attributes.position;
  const flagBase = new Float32Array(flagPos.array);
  function updateFlag() {
    if (!parts.flag.visible) return;
    const a = flagPos.array, amp = calm ? 0.4 : 1;
    for (let i = 0; i < flagPos.count; i++) {
      const u = flagBase[i * 3] / P.FLAG.W;
      a[i * 3 + 2] = amp * P.FLAG.WAVE * u * Math.sin(6 * time - 6.4 * u);
      a[i * 3 + 1] = flagBase[i * 3 + 1] + amp * 0.012 * u * Math.sin(5 * time - 1.8 * u);
    }
    flagPos.needsUpdate = true;
  }

  // ---------------------------------------------------------------- marks: rim trim glow + chasing lamps (P12)
  const RAIN = [[1, 0.45, 0.6], [1, 0.65, 0.35], [1, 0.9, 0.4], [0.55, 0.95, 0.5], [0.45, 0.8, 1], [0.65, 0.6, 1], [0.95, 0.6, 1], [1, 0.45, 0.6]];
  function updateMarks(input) {
    const act = activeRing();
    const pulse = 0.5 + 0.5 * Math.sin(time * TAU / 1.4);
    const idle = input.idle > 3;
    for (let i = 0; i < N; i++) {
      const r = rings[i], isNext = i === act && !busy;
      let e = 0;
      if (isNext) {
        e = idle ? 0.45 + 0.35 * pulse : 0.15 + 0.3 * pulse;
        if (input.pointer.active) e *= 0.5;
        // "you are close": brighter while the dragged ring sits near its connected position
        if (input.grabbed === 'ring' + i && Math.abs(r.ang - TAU * Math.round(r.ang / TAU)) < ALPHA * 0.45) e = 0.7;
        if (flash > 0) e = Math.max(e, 0.9);
      } else if (r.locked) e = finished ? 0.25 + 0.2 * pulse : 0.12;
      r.trimMat.emissiveIntensity = e;
      r.woodMat.emissiveIntensity = isNext ? e * 0.2 : 0;
      // lamps: next ring = two lights running in the direction to turn; connected = all on; not yet = dim
      const ca = r.lamps.instanceColor.array, n = P.LAMPS;
      const dirSign = mod(r.step, P.STEPS) >= 1 && mod(r.step, P.STEPS) <= P.STEPS / 2 ? -1 : 1;
      for (let k = 0; k < n; k++) {
        let b, cr = 1, cg = 0.82, cb = 0.38;
        if (finished) { const c = RAIN[(k + i * 3 + Math.floor(time * 6)) % 8]; cr = c[0]; cg = c[1]; cb = c[2]; b = 1; }
        else if (isNext) {
          const w = Math.cos(TAU * (2 * k / n - dirSign * time * (idle ? 1.1 : 0.7)));
          const hot = Math.pow(Math.max(0, w), 3) * (input.pointer.active ? 0.7 : 1);
          b = 0.5 + 0.6 * hot; cg = 0.8 + 0.2 * hot; cb = 0.35 + 0.5 * hot; // amber -> warm white
          if (flash > 0) { b = 1.1; cg = 1; cb = 0.85; }
        } else if (r.locked) { b = 0.95 + 0.08 * Math.sin(time * 3 + k); cg = 0.9; cb = 0.55; }
        else { b = 0.42; cg = 0.72; cb = 0.5; }
        ca[k * 3] = cr * b; ca[k * 3 + 1] = cg * b; ca[k * 3 + 2] = cb * b;
      }
      r.lamps.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- rings: drag, detent, lock
  function closeness(r) { // steps away from the connected position, 0..STEPS/2
    const s = mod(Math.round(r.ang / ALPHA), P.STEPS);
    return Math.min(s, P.STEPS - s);
  }
  function updateRings(dt, input) {
    const act = activeRing();
    if (input.down) {
      const id = input.down;
      const wrongRing = id.indexOf('ring') === 0 && (busy || +id.slice(4) !== act);
      if (wrongRing) { rings[+id.slice(4)].wig = 0.45; sound('wiggle'); if (!busy) flash = 0.6; }
      if (id === 'tower') {
        if (finished) { bounceT = 0; sound('sparkle'); burst(0, tower.z + 0.5, 0, 14, 1.8, 1.6); }
        else if (!busy) { tower.shake = 0.05; sound('wiggle'); flash = 0.6; }
      }
    }
    for (let i = 0; i < N; i++) {
      const r = rings[i], id = 'ring' + i;
      const canTurn = i === act && !busy && !r.locked;
      if (canTurn && input.grabbed === id) {
        const hp = input.hitPoint;
        const R = hp ? Math.max(0.5, Math.hypot(hp.x, hp.z)) : P.R_OUT;
        const d = (hp && hp.z < 0 ? -1 : 1) * input.drag.dxWorld / R;
        if (Number.isFinite(d)) {
          r.ang += d;
          if (dt > 1e-4) r.dragVel = lerp(r.dragVel, d / dt, 0.35);
        }
        r.vel = 0;
      } else {
        if (canTurn && input.released === id) {
          // the detent is chosen at the moment of release, as an integer step (never from elapsed time)
          const bias = clamp(r.dragVel * P.FLICK_GAIN, -0.4 * ALPHA, 0.4 * ALPHA);
          r.step = Math.round((r.ang + bias) / ALPHA);
          // a tap without a drag on the glowing ring turns it one detent the short way home
          // (small children tap before they swipe; the spring below animates the step as usual)
          if (input.tapped === id) { const sm = mod(r.step, P.STEPS); if (sm) r.step += sm <= P.STEPS / 2 ? -1 : 1; }
          r.dragVel = 0;
          sound('clack');
          if (mod(r.step, P.STEPS) === 0) { r.locked = true; startClimb(i); }
        }
        if (!chain || chain.kind !== 'reset') { // critically damped spring to the detent
          const target = r.step * ALPHA, w = P.SPRING_W;
          r.vel += (w * w * (target - r.ang) - 2 * w * r.vel) * dt;
          r.ang += r.vel * dt;
          if (r.locked && Math.abs(target - r.ang) < 1e-3 && Math.abs(r.vel) < 1e-2) { r.ang = target; r.vel = 0; }
        }
      }
      const tick = Math.round(r.ang / ALPHA);
      if (tick !== r.lastTick) { r.lastTick = tick; if (!chain || chain.kind !== 'reset') sound('tick', { gain: 0.7, pitch: 6 - 2 * closeness(r) }); }
      // visual angle = angle + "not this one" shiver + idle nudge (±3°, two swings, then one second of rest)
      let vis = r.ang;
      if (r.wig > 0) { r.wig = Math.max(0, r.wig - dt); vis += 0.026 * Math.sin(r.wig * 40) * (r.wig / 0.45); }
      if (canTurn && !calm && input.idle > 3) {
        const tau = (input.idle - 3) % 2;
        if (tau < 1) vis += 0.052 * Math.sin(TAU * 2 * tau) * Math.sin(Math.PI * tau);
      }
      r.vis = vis;
    }
    flash = Math.max(0, flash - dt);
  }

  // ---------------------------------------------------------------- chains
  function startClimb(i) {
    busy = true;
    // the one nearest to the foot of the flight goes first
    const lead = cargo[0].frac < cargo[1].frac ? 0 : 1;
    chain = { kind: 'climb', i, t: 0, lead, ev: 0 };
    cargo[0].hopK = cargo[1].hopK = -1;
    sound('connect');
  }
  // fire an event once when the chain time passes `at`
  function passed(c, bit, at) { if (c.t >= at && !(c.ev & (1 << bit))) { c.ev |= 1 << bit; return true; } return false; }

  function updateClimb(c, dt) {
    c.t += dt;
    const i = c.i, t = c.t, lead = cargo[c.lead], foll = cargo[1 - c.lead];
    // 1. lock: the ring has snapped in; 2. drawbridge folds down (falls, small rebound)
    const ub = clamp01((t - CH.BRIDGE_AT) / P.BRIDGE.SEC);
    bridge[i] = ub < 0.8 ? (ub / 0.8) * (ub / 0.8) : 1 - 0.05 * Math.sin(Math.PI * (ub - 0.8) / 0.2);
    if (passed(c, 0, CH.BRIDGE_AT)) sound('chain', { dur: P.BRIDGE.SEC });
    if (passed(c, 1, CH.BRIDGE_AT + P.BRIDGE.SEC * 0.8)) {
      sound('clack', { pitch: -4 });
      const a = L.foot[i] + rings[i].ang;
      burst(L.rMid * Math.sin(a), L.floorY(i) + 0.1, L.rMid * Math.cos(a), 8, 1.2, 1.2);
    }
    // 3. gate opens: phi = OPEN * smoothstep(t / SEC)
    doorOpen[i] = smooth((t - CH.GATE_AT) / P.GATE.SEC);
    if (passed(c, 2, CH.GATE_AT)) sound('door');
    // 4. chest and teddy hop up the flight, one note per tread
    if (passed(c, 3, CH.CLIMB_AT)) sound('roll', { dur: CG.ROLL_IN + 0.1 });
    const w = S.PLAT_W * L.rMid, sTop = S.BETA * L.rMid;
    climb(lead, i, t - CH.CLIMB_AT, -lead.frac * w, sTop + S.SLOT_FAR * w, S.SLOT_DR, true);
    climb(foll, i, t - CH.CLIMB_AT - CG.FOLLOW_DELAY, -foll.frac * w, sTop + S.SLOT_NEAR * w, -S.SLOT_DR, false);
    // 5. arrival: the chest lid pops (cam), a few sparkles
    const tArrive = CH.CLIMB_AT + CG.FOLLOW_DELAY + climbDur;
    const last = i === N - 1;
    if (!last) {
      tower.lid = CG.LID_OPEN * Math.max(0, Math.sin(Math.PI * clamp01((t - tArrive) / CH.LID_SEC)));
      if (passed(c, 4, tArrive)) { sound('sparkle', { gain: 0.6 }); burst(parts.chest.position.x, parts.chest.position.y + 0.3, parts.chest.position.z, 8, 1.0, 1.4); }
    }
    if (t >= tArrive + (last ? 0.05 : CH.LID_SEC)) {
      lead.plat = i; lead.frac = S.SLOT_FAR; lead.dr = S.SLOT_DR; foll.plat = i; foll.frac = S.SLOT_NEAR; foll.dr = -S.SLOT_DR;
      restCargo(lead); restCargo(foll);
      tower.lid = 0;
      if (last) { chain = { kind: 'tower', t: 0, ev: 0 }; setStage(N); if (opts.setView) opts.setView('tower'); }
      else { chain = null; busy = false; setStage(i + 1); } // 6. the next ring starts to glow
    }
  }

  // into the tower: along the landing to the door, then straight in
  function enterTower(c, tau) {
    const a0 = L.slotAngle(N - 1, c.frac), u1 = smooth(tau / 0.4), u2 = smooth((tau - 0.4) / 0.45);
    setCargo(c, lerp(L.rMid + c.dr * (1 - u1), 0.3, u2), lerp(a0, L.doorAngle, u1), L.roofY, tau > 0 && tau < 0.85 ? 0.06 * Math.sin(tau * 30) : 0, 0);
  }
  function updateTowerChain(c, dt) {
    c.t += dt;
    const t = c.t;
    const T_IN = T.ENTER_SEC, T_LIFT = T.LIFT_AT, T_OPEN = T_LIFT + T.LIFT_SEC, T_POLE = T_OPEN + P.FLAG.RISE_FROM * T.OPEN_SEC, T_END = T_OPEN + T.OPEN_SEC + T.END_PAD;
    // door opens, both walk in, door closes
    doorOpen[N] = smooth(t / 0.4) * (1 - smooth((t - T_IN) / 0.3));
    if (passed(c, 0, 0)) sound('door');
    if (passed(c, 1, 0.25)) sound('roll', { dur: 0.8 });
    if (t < T_IN) { enterTower(cargo[0], t - 0.25); enterTower(cargo[1], t - 0.6); }
    // lift rises inside the stem (hidden), the closed dome trembles
    const ul = clamp01((t - T_LIFT) / T.LIFT_SEC);
    if (passed(c, 2, T_LIFT)) sound('lift', { dur: T.LIFT_SEC });
    // bloom: the pedestal keeps rising and its rack turns every petal: phi = OPEN * easeOutBack(t / OPEN_SEC)
    const uo = clamp01((t - T_OPEN) / T.OPEN_SEC);
    if (passed(c, 3, T_OPEN)) sound('open');
    tower.z = t < T_OPEN ? lerp(L.roofY, T.HINGE_Y, smooth(ul)) : T.HINGE_Y + L.stroke * easeOutBack(uo, calm ? 0.4 : 1.4);
    tower.shake = calm ? 0 : 0.03 * Math.sin(Math.PI * ul) * (t < T_OPEN ? 1 : 0);
    // flag pole extends once the dome is 60 % open
    tower.ext = smooth((t - T_POLE) / T.POLE_SEC);
    if (passed(c, 4, T_POLE + T.POLE_SEC)) sound('flag');
    // chest opens for good, sparkles, fanfare
    const TL = T_OPEN + T.OPEN_SEC * 0.75;
    tower.lid = CG.LID_OPEN * easeOutBack((t - TL) / 0.5, 1.4);
    if (passed(c, 5, TL)) { sound('sparkle'); burst(-0.28, tower.z + 0.4, 0.06, 18, 2.0, 2.2); }
    if (passed(c, 6, T_OPEN + T.OPEN_SEC * 0.55)) sound('fanfare');
    if (passed(c, 7, T_OPEN + T.OPEN_SEC)) burst(0, tower.z + 0.6, 0, 16, 2.6, 1.5);
    if (t >= T_IN) {
      const hop = t > TL ? 0.1 * Math.abs(Math.sin((t - TL) * 7)) * Math.max(0, 1 - (t - TL) / 0.9) : 0;
      onPedestal(cargo[0], 0, 0); onPedestal(cargo[1], 1, hop);
    }
    if (t >= T_END) {
      chain = null; busy = false; finished = true; finT = 0; tower.shake = 0;
      tower.z = T.HINGE_Y + L.stroke; tower.ext = 1; tower.lid = CG.LID_OPEN;
      setStage(N + 1);
    }
  }

  function updateFinished(dt) {
    finT += dt; bounceT += dt;
    // the pedestal breathes a little; through the rack the petals sway with it
    tower.z = T.HINGE_Y + L.stroke + (calm ? 0 : 0.012 * Math.sin(finT * 2.2));
    const hop = bounceT < 0.8 ? 0.16 * Math.abs(Math.sin(bounceT * Math.PI / 0.4)) * (1 - bounceT / 0.8)
      : (calm ? 0 : 0.035 * Math.max(0, Math.sin(finT * 5)));
    onPedestal(cargo[0], 0, 0); onPedestal(cargo[1], 1, hop);
    if (!calm && Math.floor(finT / 0.9) !== Math.floor((finT - dt) / 0.9)) burst(-0.28, tower.z + 0.4, 0.06, 5, 1.4, 2.0);
  }

  function updateReset(c, dt) {
    c.t += dt;
    const u = smooth(c.t / P.RESET_SEC);
    for (let i = 0; i < N; i++) {
      const r = rings[i];
      r.ang = lerp(c.ang0[i], c.ang1[i], u); r.vel = 0; r.lastTick = Math.round(r.ang / ALPHA);
      bridge[i] = c.bridge0[i] * (1 - u);
      doorOpen[i] = c.door0[i] * (1 - u);
    }
    doorOpen[N] = c.door0[N] * (1 - u);
    tower.z = lerp(c.z0, L.roofY, u);
    tower.ext = c.ext0 * (1 - smooth(c.t / (P.RESET_SEC * 0.45)));
    tower.lid = c.lid0 * (1 - u);
    for (let k = 0; k < 2; k++) { // fly home in one big hop
      const cg = cargo[k], a1 = L.slotAngle(-1, cg.frac), r1 = L.rMid + cg.dr;
      const x = lerp(c.pos0[k * 3], r1 * Math.sin(a1), u), z = lerp(c.pos0[k * 3 + 2], r1 * Math.cos(a1), u);
      const y = lerp(c.pos0[k * 3 + 1], L.platY(-1), u) + 0.9 * Math.sin(Math.PI * u);
      cg.obj.position.set(x, y, z);
      cg.obj.rotation.set(0, lerp(c.rot0[k], a1, u), 0);
      cg.obj.scale.setScalar(cg.base);
    }
    if (c.t >= P.RESET_SEC) {
      chain = null; busy = false;
      for (let i = 0; i < N; i++) { rings[i].ang = rings[i].step * ALPHA; rings[i].lastTick = rings[i].step; }
      restCargo(cargo[0]); restCargo(cargo[1]);
    }
  }

  // ---------------------------------------------------------------- API
  function update(dt, input) {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
    time += dt;
    // The shell clamps dt to 0.05 s. Below 20 fps that would stretch every chain (a 3.4 s climb takes 10 s
    // at 7 fps). The chain timelines are pure functions of time, so on slow frames they follow the real clock
    // (at most 0.25 s per frame) and the wait stays inside the 5 s of the spec. Springs keep the clamped dt.
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    let cdt = dt;
    if (dt >= 0.0499 && lastNow > 0) cdt = clamp((now - lastNow) / 1000, dt, 0.25);
    lastNow = now;
    updateRings(dt, input);
    if (chain) {
      if (chain.kind === 'climb') updateClimb(chain, cdt);
      else if (chain.kind === 'tower') updateTowerChain(chain, cdt);
      else if (chain.kind === 'reset') updateReset(chain, cdt);
    } else if (finished) updateFinished(dt);
    if (tower.shake && (!chain || chain.kind !== 'tower')) tower.shake = Math.max(0, tower.shake - dt * 0.12);
    for (let i = 0; i < N; i++) if (chain && chain.kind === 'reset') rings[i].vis = rings[i].ang;
    updateLinks();
    updateTower();
    updateMarks(input);
    updateSparkles(dt);
    updateFlag();
  }

  function getState() {
    stateOut.stage = stage; stateOut.stageName = STAGE_NAMES[stage]; stateOut.busy = busy; stateOut.finished = finished;
    return stateOut;
  }

  const hintOut = { partId: '', point: new THREE.Vector3(), dir: new THREE.Vector3() };
  function getHint() {
    const act = activeRing();
    if (act < 0 || busy || finished) return null;
    const s = mod(rings[act].step, P.STEPS);
    hintOut.partId = 'ring' + act;
    hintOut.point.set(0, L.floorY(act) + 0.42, P.R_OUT + 0.08);
    // shortest way to the connected step: steps 1..4 ahead -> turn back (the front moves left)
    hintOut.dir.set(s >= 1 && s <= P.STEPS / 2 ? -1 : 1, 0, 0);
    return hintOut;
  }

  function initialState() {
    for (let i = 0; i < N; i++) {
      const r = rings[i];
      r.step = P.START_STEPS[i]; r.locked = false; r.vel = 0; r.dragVel = 0; r.wig = 0;
      bridge[i] = 0; doorOpen[i] = 0;
    }
    doorOpen[N] = 0;
    cargo[0].plat = -1; cargo[0].frac = S.SLOT_NEAR; cargo[0].dr = -S.SLOT_DR; cargo[1].plat = -1; cargo[1].frac = S.SLOT_FAR; cargo[1].dr = S.SLOT_DR;
    busy = false; finished = false; chain = null; flash = 0;
  }

  function reset() {
    const c = { kind: 'reset', t: 0, ev: 0, ang0: [], ang1: [], bridge0: Array.from(bridge), door0: Array.from(doorOpen),
      z0: tower.z, ext0: tower.ext, lid0: tower.lid, pos0: [], rot0: [] };
    for (let k = 0; k < 2; k++) { const o = cargo[k].obj; c.pos0.push(o.position.x, o.position.y, o.position.z); c.rot0.push(o.rotation.y); }
    for (let i = 0; i < N; i++) {
      const a0 = rings[i].ang, home = P.START_STEPS[i] * ALPHA;
      c.ang0.push(a0); c.ang1.push(home + TAU * Math.round((a0 - home) / TAU)); // shortest way home
    }
    initialState();
    for (let i = 0; i < N; i++) rings[i].step = Math.round(c.ang1[i] / ALPHA); // same detent, counted from where the ring is
    busy = true; chain = c; tower.shake = 0; sp.n = 0;
    lastStage = -1; setStage(0);
    if (opts.setView) opts.setView('main');
  }

  function dispose() {
    parts.instanced.forEach((m) => m.dispose());
    parts.owned.forEach((x) => x.dispose());
    parts.root.clear();
    parts.hitTargets.length = 0;
  }

  // ---------------------------------------------------------------- first frame
  initialState();
  restCargo(cargo[0]); restCargo(cargo[1]);
  for (let i = 0; i < N; i++) rings[i].vis = rings[i].ang;
  updateLinks();
  updateTower();
  setStage(0);

  const B = P.BOUNDS;
  return {
    root: parts.root,
    bounds: new THREE.Box3(new THREE.Vector3(-B.X, 0, B.Z_BACK), new THREE.Vector3(B.X, B.TOP, B.Z_FRONT)),
    towerFocus: new THREE.Vector3(0, T.HINGE_Y + 1.5, 0), // between the open flower and the flag
    hitTargets: parts.hitTargets,
    stageCount: STAGE_NAMES.length,
    update, getState, getHint, reset, dispose,
    onContextRestored() { parts.flagTex.needsUpdate = true; },
  };
}
