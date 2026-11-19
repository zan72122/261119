// hero：ロボットと巨大ねじ昇降機（docs/HERO-SPEC.md の createHero）。
// 1つの量 φ（ハンドル角）から、歯車列 → 駆動軸 → かさ歯車 → ねじ → 昇降台、ラチェットの爪、ランプ、ロボットの手 が式で決まる。
//   params.js      すべての寸法・歯数・角度
//   kinematics.js  連動の式（歯車の位相、送り、ラチェット、カム、IK）
//   geom.js        形の生成（歯車・かさ歯車・ねじ・丸い箱）と結合
//   machine.js / robot.js / treasure.js / atlas.js  部品
import { P, COLORS, TAU } from './params.js';
import { solveTrain, solveRatchet, clamp, frac, wrapPi, damp, smooth } from './kinematics.js';
import { createAtlas } from './atlas.js';
import { createKit } from './geom.js';
import { createMachine } from './machine.js';
import { createRobot } from './robot.js';
import { createTreasure } from './treasure.js';

// 段階の順番（固定）。mark：その段階で台が着く高さ（P.flow.marks の番号）
const SEQ = [
  { id: 'intro', round: 0, view: 'overview', targets: ['crank'] },
  { id: 'child-crank', round: 1, view: 'crank', targets: ['crank'], mark: 0 },
  { id: 'robot-crank', round: 1, view: 'crank', targets: [], mark: 1 },
  { id: 'ratchet', round: 1, view: 'ratchet', targets: ['lever'] },
  { id: 'child-crank', round: 2, view: 'crank', targets: ['crank'], mark: 2 },
  { id: 'robot-crank', round: 2, view: 'crank', targets: [], mark: 3 },
  { id: 'ratchet', round: 2, view: 'ratchet', targets: ['lever'] },
  { id: 'child-crank', round: 3, view: 'crank', targets: ['crank'], mark: 4 },
  { id: 'summit', round: 0, view: 'summit', targets: ['treasure'] },
  { id: 'celebrate', round: 0, view: 'summit', targets: [] },
  { id: 'done', round: 0, view: 'overview', targets: [] },
];

// カメラ定位置の上書き：ロボットと操作部が同時に入るように
const VIEWS = {
  crank: { target: [-0.25, 1.45, 0.3], dir: [0.1, 0.16, 1], fitW: 2.05, fitH: 1.55 },
  ratchet: { target: [-0.3, 0.98, 0.6], dir: [0.07, 0.2, 1], fitW: 1.72, fitH: 1.02 },
  summit: { target: [-0.32, 2.0, 0.2], dir: [0, 0.3, 1], fitW: 1.8, fitH: 1.6 },
};

export function createHero(THREE, opts) {
  opts = opts || {};
  const tier = opts.tier || {};
  const shadows = !!tier.shadows;
  const tex = opts.textures || {};
  const root = new THREE.Group();
  root.name = 'hero';
  const owned = [];
  const own = (x) => (owned.push(x), x);
  const sound = (name, p) => { if (opts.onSound) opts.onSound(name, p); };

  // ---- 連動を解く（歯車の位置と位相、進行の区切り、ラチェットとカム）
  const train = solveTrain(P);
  const rat = solveRatchet(P, train);

  // ---- 材質（テクスチャ：シェルの brass / metal / wood ＋ 自作アトラス 1 枚）
  const atlas = createAtlas(THREE, tier);
  own(atlas.texture);
  const faceMap = own(atlas.texture.clone());
  faceMap.repeat.set(atlas.faceRepeat[0], atlas.faceRepeat[1]);
  const std = (o) => own(new THREE.MeshStandardMaterial(o));
  const glowMat = () => std({ map: atlas.texture, vertexColors: true, roughness: 0.4, metalness: 0.08, emissive: 0x000000 });
  const mats = {
    metal: std({ map: tex.metal || null, roughness: 0.55, metalness: 0.25 }),
    brass: std({ map: tex.brass || null, vertexColors: true, roughness: 0.33, metalness: 0.85 }),
    wood: std({ map: tex.wood || null, roughness: 0.75, metalness: 0 }),
    paint: std({ map: atlas.texture, vertexColors: true, roughness: 0.42, metalness: 0.05 }),
    steel: std({ vertexColors: true, roughness: 0.3, metalness: 0.75 }),
    crank: glowMat(), lever: glowMat(), chest: glowMat(),
    face: own(new THREE.MeshBasicMaterial({ map: faceMap })),
    lamp: own(new THREE.MeshBasicMaterial({ color: 0xffffff })),
    sparkle: own(new THREE.MeshBasicMaterial({ color: 0xfff2a0, side: THREE.DoubleSide })),
    proxy: own(new THREE.MeshBasicMaterial()),
    shadowOnly: own(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })),
    blob: own(new THREE.MeshBasicMaterial({ map: tex.blob || null, transparent: true, depthWrite: false, opacity: 0.9 })),
  };
  const GLOW = new THREE.Color(COLORS.glow);

  // ---- 部品
  const kit = createKit(THREE, atlas);
  const ctx = { P, COLORS, train, rat, mats, shadows, own, atlas };
  const machine = createMachine(THREE, kit, ctx);
  root.add(machine.group);
  const treasure = createTreasure(THREE, kit, ctx);
  machine.platform.add(treasure.group);
  const robot = createRobot(THREE, kit, ctx);
  root.add(robot.group);

  // 疑似影（影なしティア）。影ありティアでも作って隠しておき、実行時に影が切れたら出す（onTierChange）
  const blobs = [];
  if (tex.blob) {
    const geo = own(new THREE.PlaneGeometry(1, 1));
    for (const [x, z, w, d] of [[0, 0.15, 5.2, 3.3], [P.robot.foot[0], P.robot.foot[2], 1.35, 1.35]]) {
      const b = new THREE.Mesh(geo, mats.blob);
      b.rotation.x = -Math.PI / 2; b.position.set(x, 0.006, z); b.scale.set(w, d, 1); b.renderOrder = 1;
      b.visible = !shadows;
      root.add(b); blobs.push(b);
    }
  }
  // 影だけを落とす代役（ねじの円柱など）。影が切れたら隠す（色も深度も書かないが draw call は残るため）
  const shadowOnlyMeshes = [];
  root.traverse((o) => { if (o.isMesh && o.material === mats.shadowOnly) shadowOnlyMeshes.push(o); });

  // ---- 操作部
  const cc = P.crank.child;
  const targets = [
    { id: 'crank', object: machine.crankProxy, enabled: false, gesture: 'circle', anchor: machine.crankCenter.clone(), radius: cc.radius,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), machine.crankCenter) },
    { id: 'lever', object: machine.leverProxy, enabled: false, gesture: 'down', anchor: new THREE.Vector3(), plane: null },
    { id: 'treasure', object: treasure.proxy, enabled: false, gesture: 'tap', anchor: new THREE.Vector3(), plane: null },
  ];
  const T = { crank: targets[0], lever: targets[1], treasure: targets[2] };
  const glow = { crank: 0, lever: 0, treasure: 0 };
  const glowMats = { crank: mats.crank, lever: mats.lever, treasure: mats.chest };

  // ---- 状態
  const Lv = P.lever, FL = P.flow;
  const knobTravel = Math.abs(machine.leverKnob(new THREE.Vector3(), 0).y - machine.leverKnob(new THREE.Vector3(), Lv.throw).y);
  const S = {
    step: 0, started: false, stageT: 0, time: 0,
    phi: 0,            // ハンドル角（進行。減らない）
    settle: 1,         // 0 = 手が荷を支えている、1 = 爪が支えている（歯の面まで戻って座る）
    lever: 0, leverMode: 'up', // up / drag / auto / locked / release
    autoTurn: 0, hasPrev: false, prevA: 0, prevX: 0, prevY: 0, prevR: 0, leverY: 0, leverHasY: false,
    tooth: 0, lastClick: -1, phiVis: 0, omega: 0,
    wob: 0, wobAmp: 0, asked: false, settled: true,
    openT: -1, relT: 0, happyT: 0, sparkled: false, beeps: 0,
    rewind: false, rewindFrom: 0, rewindT: 0,
  };
  const stageObj = { id: 'intro', round: 0, progress: 0, view: 'overview', targets: [] };
  const v1 = new THREE.Vector3(), grip = new THREE.Vector3(), knob = new THREE.Vector3(), look = new THREE.Vector3(), chest = new THREE.Vector3();
  const CAM = new THREE.Vector3(0.5, 1.5, 6);
  const rc = { time: 0, mode: 'beckon', grip, hold: true, hover: false, point: null, look, phi: 0, ask: false, happy: false, load: 0 };
  const toothOf = (phi) => Math.floor(phi / train.phiPerTooth + P.ratchet.hold + 1e-7);

  function emitStage() {
    const s = SEQ[S.step];
    stageObj.id = s.id; stageObj.round = s.round; stageObj.view = s.view;
    stageObj.progress = clamp(S.phi / train.phiTotal, 0, 1);
    stageObj.targets = s.targets.slice();
    for (const t of targets) t.enabled = s.targets.includes(t.id);
    S.stageT = 0; S.asked = false; S.hasPrev = false; S.leverHasY = false; S.sparkled = false; S.beeps = 0;
    if (opts.onStage) opts.onStage(stageObj);
    if (s.targets.length) sound('chime', { gain: 0.6 });
  }
  function next() { S.step = Math.min(S.step + 1, SEQ.length - 1); emitStage(); }

  // φ を進める（区間の端まで）。ラチェットの歯を 1 枚越えるたびに click
  function advance(d, limit) {
    if (!(d > 0)) return;
    S.phi = Math.min(S.phi + d, limit);
    const tooth = toothOf(S.phi);
    if (tooth !== S.tooth) {
      S.tooth = tooth;
      if (S.time - S.lastClick > 0.055) { S.lastClick = S.time; sound('click', { gain: 0.45, rate: 0.92 + 0.08 * (tooth % 3), pan: 0.1 }); }
    }
  }

  // 子どもの指 → ハンドルの前進量。どちら回りでも、まっすぐこすっても前進。タップは 1/4 周
  function crankInput(input, dt) {
    let d = 0;
    const g = input.grab;
    if (g && g.targetId === 'crank') {
      if (g.phase === 'start') S.hasPrev = false;
      if (g.point) {
        const dx = g.point.x - cc.center[0], dy = g.point.y - cc.center[1];
        const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        if (S.hasPrev) {
          const move = Math.hypot(g.point.x - S.prevX, g.point.y - S.prevY);
          const da = r > 0.06 && S.prevR > 0.06 ? Math.abs(wrapPi(a - S.prevA)) : 0;
          d += Math.max(da, (0.75 * move) / cc.radius);
        }
        S.prevA = a; S.prevX = g.point.x; S.prevY = g.point.y; S.prevR = r; S.hasPrev = true;
      } else {
        d += Math.hypot(g.deltaPx.x, g.deltaPx.y) / 120;
        S.hasPrev = false;
      }
    } else S.hasPrev = false;
    for (let i = 0; i < input.taps.length; i++) if (input.taps[i].targetId === 'crank') S.autoTurn = Math.min(S.autoTurn + FL.tapTurn, TAU);
    if (S.autoTurn > 0) { const k = Math.min(S.autoTurn, 5.5 * dt); S.autoTurn -= k; d += k; }
    if (!Number.isFinite(d)) d = 0;
    return Math.min(d, FL.maxStep);
  }

  function update(dt, input) {
    if (!S.started) { S.started = true; emitStage(); }
    if (!(dt >= 0)) dt = 0;
    S.time += dt; S.stageT += dt;
    const time = input.time, idle = input.idle;
    const g = input.grab;
    let s = SEQ[S.step];
    const tapOn = (id) => { for (let i = 0; i < input.taps.length; i++) if (input.taps[i].targetId === id) return true; return false; };
    const grabCrank = !!(g && g.targetId === 'crank');

    // ================= 段階ごとの進行
    switch (s.id) {
      case 'intro':
        if (grabCrank || tapOn('crank')) {
          if (S.rewind) { S.rewind = false; }
          next();
        }
        break;
      case 'child-crank': {
        const lim = train.marks[s.mark];
        let d = crankInput(input, dt);
        if (d > 0 && (S.leverMode === 'locked')) { S.leverMode = 'release'; sound('tick', { gain: 0.7, rate: 0.8 }); }
        d *= smooth(1 - S.lever / Lv.throw);               // 歯止めが外れるまでは動かない
        advance(d, lim);
        if (S.phi >= lim - 1e-9) { sound('clunk', { gain: s.mark === 4 ? 1 : 0.8 }); S.autoTurn = 0; next(); }
        break;
      }
      case 'robot-crank': {
        const lim = train.marks[s.mark], from = train.marks[s.mark - 1];
        if (S.beeps === 0) { S.beeps = 1; sound('beep', { gain: 0.8, pan: -0.5 }); }
        const u = (S.stageT - FL.robotPrep) / FL.robotTime;
        if (u > 0) advance(from + (lim - from) * smooth(u) - S.phi, lim);
        if (u >= 1) { S.phi = lim; sound('clunk', { gain: 0.7 }); next(); }
        break;
      }
      case 'ratchet': {
        if (g && g.targetId === 'lever') {
          if (S.leverMode === 'up') S.leverMode = 'drag';
          if (g.phase === 'start') S.leverHasY = false;
          let dy = 0;
          if (g.point) { if (S.leverHasY) dy = (S.leverY - g.point.y) / Math.max(knobTravel, 0.05); S.leverY = g.point.y; S.leverHasY = true; }
          else dy = g.deltaPx.y / 170;
          if (S.leverMode === 'drag') S.lever = clamp(S.lever + Math.max(dy, 0) * 1.25 * Lv.throw, 0, Lv.throw);
          if (g.phase === 'end' || g.duration > 0.4) S.leverMode = S.leverMode === 'drag' ? 'auto' : S.leverMode; // 離す・押さえ続ける → 自動で下まで
        }
        if (tapOn('lever') && (S.leverMode === 'up' || S.leverMode === 'drag')) S.leverMode = 'auto';
        if (S.leverMode === 'auto') S.lever = Math.min(S.lever + (dt * Lv.throw) / 0.2, Lv.throw);
        if (S.lever >= Lv.throw - 1e-6 && (S.leverMode === 'drag' || S.leverMode === 'auto')) {
          S.lever = Lv.throw; S.leverMode = 'locked';
          sound('ratchet'); S.happyT = 1.2; S.relT = 0.9;
          next();
        }
        break;
      }
      case 'summit':
        if (!S.sparkled && S.stageT > 0.45) { S.sparkled = true; sound('sparkle', { gain: 0.7 }); }
        if ((g && g.targetId === 'treasure') || tapOn('treasure')) { S.openT = 0; sound('pop'); sound('whoosh', { gain: 0.6 }); next(); }
        break;
      case 'celebrate':
        if (!S.sparkled && S.stageT > 0.9) { S.sparkled = true; sound('sparkle'); }
        if (S.stageT > FL.celebrate) next();
        break;
      default: break;
    }
    s = SEQ[S.step];

    // ================= ふた・レバーの戻り
    if (S.openT >= 0) S.openT += dt;
    if (S.leverMode === 'release') {                       // 前に回すと歯が爪を押し上げ、カムが押し戻されてレバーが跳ね上がる
      S.lever -= (dt * Lv.throw) / 0.16;
      if (S.lever <= 0) { S.lever = 0; S.leverMode = 'up'; }
    }
    if (S.relT > 0) S.relT -= dt;
    if (S.happyT > 0) S.happyT -= dt;

    // ================= 荷の受け手：手が支えている間は爪は歯の斜面の途中、手を離すと歯の面まで戻って座る（台が少し沈む）
    const robotHolds = s.id === 'robot-crank' || s.id === 'ratchet';
    const handHolds = (grabCrank && T.crank.enabled) || S.autoTurn > 0 || robotHolds;
    const U = frac(S.phi / train.phiPerTooth + P.ratchet.hold);  // 歯の斜面上の位置（進行から）
    if (handHolds) { S.settle = damp(S.settle, 0, 30, dt); if (S.settle < 0.5) S.settled = false; }
    else {
      S.settle = damp(S.settle, 1, 9, dt);
      if (!S.settled && S.settle > 0.8) { S.settled = true; if (U > 0.08 && S.leverMode !== 'locked') sound('tick', { gain: 0.45, rate: 0.7 }); }
    }
    // 待っているときの揺れ：歯 1 枚の中で前へ少し回して戻す（歯車列ぜんぶが一緒に揺れる）
    const wobOn = T.crank.enabled && !handHolds && !S.rewind && idle > 0.7 && S.settle > 0.97 && S.leverMode !== 'release';
    S.wobAmp = damp(S.wobAmp, wobOn ? 1 : 0, wobOn ? 3 : 14, dt);
    S.wob = wobOn || S.wobAmp > 0.01 ? S.wob + dt * (TAU / 1.25) : 0;
    let uFree = U * (1 - S.settle) + S.wobAmp * (idle > 2 ? 0.4 : 0.3) * (0.5 - 0.5 * Math.cos(S.wob));
    if (s.id === 'ratchet') uFree += 0.018 * Math.sin(time * 41) * (1 - S.settle); // ロボットが重さを支えて小さく震える
    // レバー（見た目）：有効なときは小さく揺れる
    let leverVis = S.lever;
    if (T.lever.enabled && S.leverMode === 'up') leverVis += 0.05 * (0.5 - 0.5 * Math.cos(time * (TAU / 1.1))) * clamp(idle * 2, 0, 1) * (idle > 2 ? 1.5 : 1);
    // カム：レバーが下がるほど爪が上がれる限界が下がり、爪が斜面を押して車を戻す
    const uLim = rat.uLimit(leverVis);
    let u = clamp(Math.min(uFree, uLim), 0, 0.985);
    let phiVis = S.phi - (U - u) * train.phiPerTooth;
    if (S.rewind) {                                         // もう一回：爪を上げて台を下ろす
      S.rewindT += dt;
      const k = smooth(S.rewindT / 1.5);
      phiVis = S.rewindFrom + (phiVis - S.rewindFrom) * k;
      u = k < 0.92 ? 1.22 : u + (1.22 - u) * (1 - k) / 0.08;
      if (S.rewindT >= 1.5) { S.rewind = false; sound('clunk', { gain: 0.5 }); }
    }
    if (!Number.isFinite(phiVis)) phiVis = S.phi;
    machine.apply({ phi: phiVis, lever: leverVis, u });

    // 回転の速さ → 歯車の音
    const om = (phiVis - S.phiVis) / Math.max(dt, 1e-3);
    S.phiVis = phiVis;
    S.omega = damp(S.omega, Math.abs(om), 12, dt);
    sound('gear', { level: clamp(S.omega / 5, 0, 1), rate: 0.8 + clamp(S.omega / 8, 0, 1) });

    // ランプ
    const party = s.id === 'celebrate' ? 1 : 0;
    const newLamps = machine.updateLamps(time, party);
    if (newLamps > 0 && !S.rewind && !party) sound('pop', { gain: 0.3, rate: 0.85 + 0.13 * machine.state.lit, pan: 0.3 });

    // ================= 宝箱
    const pops = treasure.update(dt, time, S.openT, s.id === 'summit' ? 1 : 0, s.id === 'summit' ? 1 : S.openT >= 0 ? 0.85 : 0);
    if (pops > 0) sound('pop', { gain: 0.9, rate: 1 + 0.18 * S.beeps++ });
    treasure.anchor(chest);

    // ================= ロボット
    machine.robotGrip(grip);
    machine.leverKnob(knob, leverVis);
    const active = s.targets.length ? T[s.targets[0]] : null;
    const waiting = !!active && idle > 2 && !(g && g.targetId === active.id);
    rc.time = time; rc.phi = phiVis; rc.point = null; rc.hover = false;
    rc.happy = S.happyT > 0 || s.id === 'done';
    rc.ask = waiting;
    rc.load = robotHolds ? 1 : 0;
    const glance = Math.sin(time * 1.9) > 0.55; // ときどき子どもの方を見る
    switch (s.id) {
      case 'intro':
        rc.mode = 'beckon'; rc.hold = true; look.copy(CAM);
        break;
      case 'child-crank':
        rc.hold = S.relT <= 0; rc.hover = S.relT > 0;
        if (waiting) { rc.mode = 'ask'; rc.point = machine.crankCenter; look.copy(glance ? machine.crankCenter : CAM); }
        else { rc.mode = 'watch'; look.set(0, machine.state.height + 0.25, 0.4); if (glance && !grabCrank) look.copy(CAM); }
        break;
      case 'robot-crank':
        rc.mode = 'work'; rc.hold = true;
        look.set(-0.6, machine.state.height + 0.1, 0.5);
        break;
      case 'ratchet':
        rc.mode = 'point'; rc.hold = true; rc.point = knob;
        look.copy(glance ? CAM : knob);
        break;
      case 'summit':
        rc.mode = 'excited'; rc.hold = false; rc.point = chest; look.copy(chest);
        break;
      case 'celebrate':
        rc.mode = 'party'; rc.hold = false; look.copy(glance ? CAM : chest);
        break;
      default:
        rc.mode = 'wave'; rc.hold = false; look.copy(CAM);
    }
    const hopped = robot.update(dt, rc);
    if (hopped && (robot.state.hops % 2 === 0)) sound('beep', { gain: 0.7, rate: 1 + 0.12 * (robot.state.hops % 4), pan: -0.5 });
    sound('servo', { level: robot.state.servo * 0.7, rate: 0.8 + 0.7 * robot.state.servo });
    // 止まって 2 秒：ロボットが「どうぞ」
    if (active && idle > 2 && !S.asked) { S.asked = true; sound('beep-ask', { pan: -0.5 }); }
    if (idle < 0.5) S.asked = false;
    if (blobs.length > 1) { const k = 1 - 0.5 * clamp(robot.state.y / 0.3, 0, 1); blobs[1].scale.set(1.35 * k, 1.35 * k, 1); }

    // ================= 操作部の目印と光（有効な操作部だけ、暖かい黄色で脈を打つ）
    T.lever.anchor.copy(knob);
    T.treasure.anchor.copy(chest);
    const pulse = 0.5 + 0.5 * Math.sin((time * TAU) / 1.2);
    for (let i = 0; i < targets.length; i++) {
      const tt = targets[i];
      const grabbing = !!(g && g.targetId === tt.id);
      const k = tt.enabled ? (0.15 + 0.45 * pulse) * (idle > 2 ? 1.3 : 1) * (grabbing ? 0.35 : 1) : 0;
      glow[tt.id] = damp(glow[tt.id], k, tt.enabled ? 14 : 8, dt);
      glowMats[tt.id].emissive.copy(GLOW).multiplyScalar(glow[tt.id]);
    }
    stageObj.progress = clamp(S.phi / train.phiTotal, 0, 1);
  }

  function reset() {
    S.rewind = S.phiVis > 0.05; S.rewindFrom = S.phiVis; S.rewindT = 0;
    S.step = 0; S.phi = 0; S.settle = 1; S.settled = true; S.lever = 0; S.leverMode = 'up';
    S.autoTurn = 0; S.tooth = toothOf(0); S.omega = 0; S.openT = -1; S.relT = 0; S.happyT = 0; S.wobAmp = 0;
    S.started = true;
    robot.reset();
    if (S.rewind) sound('whoosh', { gain: 0.7, rate: 0.8 });
    emitStage();
  }

  function dispose() {
    root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    for (const x of owned) if (x && x.dispose) x.dispose();
    owned.length = 0;
    blobs.length = 0;
    root.clear();
  }

  S.tooth = toothOf(0);
  return {
    root,
    views: VIEWS,
    update,
    getTargets: () => targets,
    getStage: () => stageObj,
    reset,
    dispose,
    onContextRestored() { atlas.texture.needsUpdate = true; faceMap.needsUpdate = true; },
    // シェルが実行時に影を切ったとき（governor）。影の代わりに疑似影を出す
    onTierChange(t) {
      const off = !(t && t.shadows);
      for (const b of blobs) b.visible = off;
      for (const o of shadowOnlyMeshes) o.visible = !off;
    },
    // デバッグ用（シェルは使わない）：解いた連動の値
    info: { train, ratchet: rat, params: P },
  };
}
