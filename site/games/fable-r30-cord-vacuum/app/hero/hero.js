// 主役の仕掛け（hero）：コード巻取り掃除機。docs/HERO-SPEC.md の API をそのまま満たす。
//  params.js   … 全パラメータ（寸法・歯数・角度・速さ）
//  mech.js     … 連動の式（リール角、ラチェット、ぜんまい、カム、歯車比、ホース、弾道）
//  geom.js     … パラメータ → 形の生成関数
//  parts-*.js  … 部品の組み立て
// three は import しない（引数の THREE を使う）。直したら `npm run build:hero`。
import { STAGES, makeParams } from './params.js';
import * as K from './mech.js';
import { makeGeom } from './geom.js';
import { buildBody } from './parts-body.js';
import { buildPlug, buildNozzle, buildHose, buildBin, buildCan, buildScraps, buildStars, buildBlob } from './parts-clean.js';

const { TAU, clamp, lerp, smoothstep, damp, rnd, frac } = K;

// 紙片の状態
const FLOOR = 0, CAPT = 1, PATH = 2, SWIRL = 3, BIN = 4, POUR = 5, FALL = 6, CAN = 7, POP = 8, FLY = 9;

export function createHero(THREE, opts) {
  const A = opts.layout;
  const q = opts.quality || {};
  const P = makeParams(A);
  const C = P.colors;
  const noop = () => {};
  const onStage = opts.onStage || noop, onSound = opts.onSound || noop, onLoop = opts.onLoop || noop;
  const V3 = THREE.Vector3;

  const owned = [];
  const own = (x) => { owned.push(x); return x; };
  const small = q.textureSize === 512;
  const plasticTex = opts.textures.get(small ? 'plastic_pastel_512' : 'plastic_pastel_1024');
  const paperTex = opts.textures.get(small ? 'paper_scraps_512' : 'paper_scraps_1024');
  const G = makeGeom(THREE, opts.addons, P.texAvg);

  // ---- マテリアル（不透明は1種類＋操作部ごとの光らせ用の写し。テクスチャは共有） ----
  const plastic = own(new THREE.MeshStandardMaterial({ map: plasticTex, vertexColors: true, roughness: 0.5, metalness: 0 }));
  const ctrlMat = () => { const m = own(plastic.clone()); m.emissive.set(C.glow); m.emissiveIntensity = 0; return m; };
  const M = {
    plastic, plug: ctrlMat(), button: ctrlMat(), latch: ctrlMat(), nozzle: ctrlMat(), binSolid: ctrlMat(),
    clear: own(new THREE.MeshStandardMaterial({ color: C.clear, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.15, metalness: 0 })),
    bin: own(new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.36, depthWrite: false, roughness: 0.15, metalness: 0, emissive: C.glow, emissiveIntensity: 0 })),
    spring: own(new THREE.MeshStandardMaterial({ color: C.orange, roughness: 0.45, metalness: 0 })),
    cord: own(new THREE.MeshStandardMaterial({ color: C.purple, roughness: 0.6, metalness: 0 })),
  };
  const hitMat = own(new THREE.MeshBasicMaterial({ visible: false }));
  const ctx = { THREE, G, P, M, own, hitMat };

  // ---- 部品 ----
  const root = new THREE.Group();
  root.name = 'hero';
  const body = buildBody(ctx);
  root.add(body.group);
  const plug = buildPlug(ctx);
  root.add(plug.group);
  const cordTube = G.tube(P.cord.segments, P.cord.sides, P.cord.radius, true);
  const cordMesh = new THREE.Mesh(own(cordTube.geometry), M.cord);
  cordMesh.frustumCulled = false;
  cordMesh.receiveShadow = true;
  cordMesh.name = 'cord';
  root.add(cordMesh);
  const nozzle = buildNozzle(ctx);
  root.add(nozzle.group);
  const hose = buildHose(ctx);
  root.add(hose.rings, hose.tubeMesh);
  const bin = buildBin(ctx);
  root.add(bin.group);
  const can = buildCan(ctx);
  root.add(can.group);
  const scraps = buildScraps(ctx, paperTex);
  root.add(scraps.mesh);
  const stars = buildStars(ctx);
  root.add(stars.mesh);
  let nozBlob = null;
  if (!q.shadows) {
    // 影なしのティア：丸い疑似影
    const b1 = buildBlob(ctx, 0.42);
    b1.position.set(A.bodyCenter[0], 0.008, A.bodyCenter[2]);
    b1.scale.set(1, 1, 0.74);
    const b2 = buildBlob(ctx, P.can.radius * 1.75);
    b2.position.set(P.can.pos[0], 0.008, P.can.pos[2]);
    nozBlob = buildBlob(ctx, 0.23);
    nozBlob.scale.set(1, 1, 0.62);
    root.add(b1, b2, nozBlob);
  }
  const hitTargets = [plug.hit, body.hits.button, nozzle.hit, body.hits.latch, bin.hit];
  const stageHit = { pull: plug.hit, rewind: body.hits.button, suck: nozzle.hit, unlock: body.hits.latch, dump: bin.hit };

  // ---- 定数（params から） ----
  const R = P.reel, RT = P.ratchet, CD = P.cord, BT = P.button, BN = P.bin, LT = P.latch, NZ = P.nozzle, BR = P.brush, HS = P.hose, SC = P.scraps, CN = P.can, DP = P.dump, FN = P.finale;
  const N = SC.count;
  const exit = new V3().fromArray(CD.exit);
  const plugRest = new V3().fromArray(P.plug.rest);
  const nozRest = new V3().fromArray(NZ.rest);
  const hoseEnd = new V3().fromArray(P.riser.hoseEnd);
  const dumpC = new V3().fromArray(DP.center);
  const canC = new V3().fromArray(CN.pos);
  const freeStroke = K.buttonFreeStroke(RT);
  const releaseX = LT.releaseAt * LT.e;
  // 容器を動かす面：受け台と空ける位置を通り、できるだけカメラを向く
  const dockC0 = new V3(BN.dock[0], BN.dock[1] + BN.lift + BN.height / 2, BN.dock[2]);
  const planeN = new V3();
  {
    const u = new V3().subVectors(dumpC, dockC0).normalize();
    const v = new V3().fromArray(DP.viewDir).normalize();
    planeN.copy(v).addScaledVector(u, -v.dot(u)).normalize();
  }
  const planeD = planeN.dot(dumpC);
  // 紙片の通り道の長さ
  const arcR = BR.tipR * 0.92;
  const lArc = (arcR * Math.PI) / 2;
  const neckN = nozzle.neck.length - 1;
  const neckPts = new Float32Array(nozzle.neck.flat()), neckLens = new Float32Array(neckN + 1);
  const lNeck = K.polyLengths(neckPts, neckN, neckLens);
  const riserN = body.riserPts.length - 1;
  const riserPts = new Float32Array(body.riserPts.flat()), riserLens = new Float32Array(riserN + 1);
  const lRiser = K.polyLengths(riserPts, riserN, riserLens);
  const hosePts = new Float32Array((HS.samples + 1) * 3), hoseLens = new Float32Array(HS.samples + 1);
  const hoseTry = new Float32Array(17 * 3);
  const bez = new Float32Array(12);
  let lHose = HS.length;

  // ---- 状態 ----
  const S = {
    stage: 'pull', t: 0, round: 0, hintT: 0,
    // コード
    L: 0, tick: 0, plug: plugRest.clone(), hx: 0, hz: 1, grabOff: new V3(),
    b: 0, pressed: false, rewinding: false,
    // ノズル
    noz: nozRest.clone(), prevNoz: nozRest.clone(), yaw: 0, odo: 0, speed: 0, motorOmega: 0, motorAngle: 0, nozGrab: new V3(), popT: 0, rattleT: 0,
    // 留め金
    latchT: 0, latchDir: 0, phi: 0, pinX: 0, released: false, liftT: 0, lift: 0,
    // 容器
    binMode: 'dock', binC: dockC0.clone(), tilt: 0, dropV: 0, dropX: 0, dropZ: 0, pourAcc: 0, pourIdx: 0, lid: 0,
    arrive: 0, inBin: 0, inCan: 0, falling: 0,
    // フィナーレ
    fT: 0, hop: 0, flyFrom: new V3(), flyTilt: 0, docked: false, relocked: false,
  };
  const sc = [];
  for (let i = 0; i < N; i++) {
    sc.push({ st: FLOOR, p: new V3(), home: new V3(), yaw: 0, t: 0, T: 1, s: 0, slot: 0, lat: 0, p0: new V3(), v: new V3(), delay: 0, ax: new V3(rnd(i, 51) - 0.5, rnd(i, 52) - 0.5, rnd(i, 53) - 0.5).normalize(), spin: 5 + rnd(i, 54) * 6 });
  }
  const binOrder = new Int16Array(N); // 容器に入った順
  const starData = [];
  for (let i = 0; i < FN.stars; i++) starData.push({ p0: new V3(), v: new V3(), t0: 0, life: 1, size: 0.02, ax: new V3(rnd(i, 61) - 0.5, rnd(i, 62) - 0.5, rnd(i, 63) - 0.5).normalize() });

  // 作業用（毎フレーム new しない）
  const tv = new V3(), tv2 = new V3(), tv3 = new V3(), tv4 = new V3();
  const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sv = new V3(1, 1, 1);
  const UP = new V3(0, 1, 0);
  const a3 = [0, 0, 0], b3 = [0, 0, 0];
  const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

  // ================= 小さな道具 =================
  function rayAtY(ray, y, out) {
    const dy = ray.direction.y;
    if (Math.abs(dy) < 1e-6) return false;
    const t = (y - ray.origin.y) / dy;
    if (!(t > 0) || !Number.isFinite(t)) return false;
    out.copy(ray.origin).addScaledVector(ray.direction, t);
    return true;
  }
  function rayAtPlane(ray, n, d, out) {
    const dn = n.dot(ray.direction);
    if (Math.abs(dn) < 1e-6) return false;
    const t = (d - n.dot(ray.origin)) / dn;
    if (!(t > 0) || !Number.isFinite(t)) return false;
    out.copy(ray.origin).addScaledVector(ray.direction, t);
    return true;
  }
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // ノズルのローカル → ワールド
  function nozToWorld(x, y, z, out) {
    const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    return out.set(S.noz.x + x * c + z * s, S.noz.y + y, S.noz.z - x * s + z * c);
  }
  function dockCenter(out) { return out.set(BN.dock[0], BN.dock[1] + S.lift + S.hop + BN.height / 2, BN.dock[2]); }
  function binSlot(n, out) {
    const a = n * 2.399963, r = 0.012 + 0.034 * Math.sqrt(frac(n * 0.618034 + 0.31));
    return out.set(r * Math.cos(a), 0.012 + (n / N) * (BN.height - 0.04), r * Math.sin(a));
  }
  function canSlot(n, out) {
    const a = n * 2.399963 + 1, r = 0.085 * Math.sqrt(frac(n * 0.618034 + 0.11));
    return out.set(canC.x + r * Math.cos(a), CN.wall + 0.012 + (n / N) * 0.15, canC.z + r * Math.sin(a));
  }
  function clampNozzle(v) {
    v.x = clamp(v.x, NZ.areaMin[0], NZ.areaMax[0]);
    v.z = clamp(v.z, NZ.areaMin[1], NZ.areaMax[1]);
    v.y = 0;
    const dx = v.x - hoseEnd.x, dz = v.z - hoseEnd.z, d = Math.hypot(dx, dz);
    if (d < NZ.minPortDist) {
      const k = d > 1e-4 ? NZ.minPortDist / d : 0;
      if (k) { v.x = hoseEnd.x + dx * k; v.z = hoseEnd.z + dz * k; } else { v.x = hoseEnd.x - NZ.minPortDist; }
      v.x = clamp(v.x, NZ.areaMin[0], NZ.areaMax[0]);
      v.z = clamp(v.z, NZ.areaMin[1], NZ.areaMax[1]);
    }
    return v;
  }
  function clampPlug(v) {
    v.x = clamp(v.x, CD.areaMin[0], CD.areaMax[0]);
    v.z = clamp(v.z, CD.areaMin[1], CD.areaMax[1]);
    v.y = P.plug.y;
    // コードの長さより遠くへは行けない
    const dy = v.y - exit.y;
    const maxH = Math.sqrt(Math.max(1e-6, CD.reach * CD.reach - dy * dy));
    const dx = v.x - exit.x, dz = v.z - exit.z, d = Math.hypot(dx, dz);
    if (d > maxH) { v.x = exit.x + (dx / d) * maxH; v.z = exit.z + (dz / d) * maxH; }
    return v;
  }
  const nozYawAt = (x, z) => Math.atan2(x - hoseEnd.x, z - hoseEnd.z);

  // ================= 紙片を散らす =================
  // (x, z) を点 (px, pz) から min 以上離す
  function pushFrom(o, px, pz, min) {
    const dx = o[0] - px, dz = o[1] - pz, d = Math.hypot(dx, dz);
    if (d >= min) return;
    if (d > 1e-4) { o[0] = px + (dx / d) * min; o[1] = pz + (dz / d) * min; } else { o[0] = px - min; }
  }
  function scatter(round) {
    const cols = 3, rows = Math.max(1, Math.ceil(SC.clusters / cols));
    const cx = [], cz = [], o = [0, 0];
    const portMin = NZ.minPortDist + 0.05; // これより口に近いとノズルが届かない
    const inArea = () => { o[0] = clamp(o[0], SC.areaMin[0], SC.areaMax[0]); o[1] = clamp(o[1], SC.areaMin[1], SC.areaMax[1]); };
    for (let c = 0; c < SC.clusters; c++) {
      const ix = c % cols, iz = Math.floor(c / cols) % rows;
      o[0] = lerp(SC.areaMin[0], SC.areaMax[0], (ix + 0.5) / cols) + (rnd(c, 31 + round * 7) - 0.5) * 0.15;
      o[1] = lerp(SC.areaMin[1], SC.areaMax[1], (iz + 0.5) / rows) + (rnd(c, 32 + round * 7) - 0.5) * 0.13;
      // ホース口とノズルの置き場所から離す（範囲に戻して、もう一度）
      for (let k = 0; k < 3; k++) { pushFrom(o, nozRest.x, nozRest.z, 0.25); pushFrom(o, hoseEnd.x, hoseEnd.z, portMin + SC.clusterR); inArea(); }
      cx.push(o[0]); cz.push(o[1]);
    }
    for (let i = 0; i < N; i++) {
      const c = i % SC.clusters;
      const a = rnd(i, 41 + round * 3) * TAU, r = SC.clusterR * Math.sqrt(rnd(i, 42 + round * 3));
      o[0] = cx[c] + r * Math.cos(a); o[1] = cz[c] + r * Math.sin(a);
      for (let k = 0; k < 3; k++) { inArea(); pushFrom(o, hoseEnd.x, hoseEnd.z, portMin); }
      sc[i].home.set(o[0], SC.floorY + i * 0.0002, o[1]);
      sc[i].yaw = rnd(i, 43 + round) * TAU;
    }
  }

  // ================= 段階 =================
  function setStage(s) {
    const prev = S.stage;
    S.stage = s;
    for (const h of hitTargets) h.userData.enabled = false;
    if (stageHit[s]) stageHit[s].userData.enabled = true;
    onStage(s, prev);
  }

  function resetState(keepScatter) {
    S.L = 0; S.tick = 0; S.plug.copy(plugRest); S.b = 0; S.pressed = false; S.rewinding = false;
    const hd = Math.hypot(plugRest.x - exit.x, plugRest.z - exit.z) || 1;
    S.hx = (plugRest.x - exit.x) / hd; S.hz = (plugRest.z - exit.z) / hd;
    S.noz.copy(nozRest); S.prevNoz.copy(nozRest); S.yaw = nozYawAt(nozRest.x, nozRest.z); S.speed = 0; S.motorOmega = 0;
    S.latchT = 0; S.latchDir = 0; S.phi = 0; S.pinX = 0; S.released = false; S.liftT = 0; S.lift = 0;
    S.binMode = 'dock'; S.tilt = 0; S.dropV = 0; S.pourAcc = 0; S.pourIdx = 0; S.lid = 0;
    S.arrive = 0; S.inBin = 0; S.inCan = 0; S.falling = 0;
    S.fT = 0; S.hop = 0; S.docked = false; S.relocked = false;
    dockCenter(S.binC);
    if (!keepScatter) { S.round++; scatter(S.round); }
    for (let i = 0; i < N; i++) { sc[i].st = FLOOR; sc[i].p.copy(sc[i].home); sc[i].t = 0; }
    stars.mesh.visible = false;
  }
  function reset(keepScatter) {
    resetState(keepScatter === true);
    setStage('pull');
  }

  // ---- 1 pull：プラグを引く → コード長 → リール角 → ぜんまい・ラチェット ----
  function finishPull() {
    S.L = R.Lmax;
    S.tick = K.ratchetIndex(K.reelAngle(R, S.L), RT.Z);
    onSound('boing', { pan: 0.3 });
    setStage('rewind');
  }
  function updatePull(dt, input) {
    if (input.grabbed === 'plug' && input.pointer.isDown && rayAtY(input.ray, P.plug.y, tv)) {
      if (input.justGrabbed) { S.grabOff.set(S.plug.x - tv.x, 0, S.plug.z - tv.z); if (S.grabOff.length() > 0.09) S.grabOff.setLength(0.09); }
      clampPlug(tv.add(S.grabOff));
      S.plug.lerp(tv, damp(CD.follow, dt));
    }
    // ラチェットがあるので、引き出した長さは減らない
    const need = dist3(S.plug, exit) - CD.rest;
    if (need > S.L) S.L = Math.min(R.Lmax, need);
    const idx = K.ratchetIndex(K.reelAngle(R, S.L), RT.Z);
    if (idx > S.tick) { S.tick = idx; onSound('tick', { rate: 0.85 + (0.55 * S.L) / R.Lmax, gain: 0.7, pan: 0.2 }); }
    if (S.L >= R.Lmax - 0.004) finishPull();
  }

  // ---- 2 rewind：ボタン → 爪が外れる → ぜんまいがほどけてリール逆回転 → コード巻取り → プラグ収納 ----
  function finishRewind() {
    S.L = 0; S.tick = 0; S.plug.copy(plugRest); S.rewinding = false; S.pressed = false;
    onSound('thunk', { pan: 0.2 });
    setStage('suck');
  }
  function updateRewind(dt, input) {
    if (!S.rewinding && input.justGrabbed && input.grabbed === 'rewindButton') {
      S.rewinding = true; S.pressed = true;
      onSound('click');
    }
    if (S.rewinding && S.b >= freeStroke) {
      const v = K.rewindSpeed(P.rewind, S.L, R.Lmax);
      S.L = Math.max(0, S.L - v * dt);
      // コードがプラグを引きずる：穴からの距離が (収納時の長さ + L) を超えないよう、収納位置へ寄せる
      const lim = CD.rest + S.L;
      if (dist3(S.plug, exit) > lim) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; tv.lerpVectors(S.plug, plugRest, mid); if (dist3(tv, exit) > lim) lo = mid; else hi = mid; }
        S.plug.lerp(plugRest, hi);
      }
      onLoop('whirr', 0.85, 0.7 + (1.2 * v) / P.rewind.vmax);
      if (S.L <= P.rewind.done) finishRewind();
    }
  }

  // ---- 3 suck：ノズル → ブラシ（歯車比）→ 紙片が吸われる → ホース → 容器 ----
  function updateSuck(dt, input) {
    if (input.pointer.isDown && input.floorPoint) {
      if (input.grabbed === 'nozzle') {
        if (input.justGrabbed) { S.nozGrab.set(S.noz.x - input.floorPoint.x, 0, S.noz.z - input.floorPoint.z); if (S.nozGrab.length() > 0.16) S.nozGrab.setLength(0.16); }
        clampNozzle(tv.copy(input.floorPoint).add(S.nozGrab));
        S.noz.lerp(tv, damp(NZ.follow, dt));
      } else if (!input.grabbed) {
        clampNozzle(tv.copy(input.floorPoint));
        S.noz.lerp(tv, damp(NZ.drift, dt));
      }
    }
    // 吸い口（線分）の近くの紙片をつかまえる
    const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    const mx = S.noz.x + s * BR.axisZ, mz = S.noz.z + c * BR.axisZ;
    S.popT -= dt;
    for (let i = 0; i < N; i++) {
      const o = sc[i];
      if (o.st !== FLOOR) continue;
      const rx = o.p.x - mx, rz = o.p.z - mz;
      const lat = rx * c - rz * s, fw = rx * s + rz * c;
      if (Math.hypot(Math.max(Math.abs(lat) - P.suction.halfWidth, 0), fw) < P.suction.radius) {
        o.st = CAPT; o.t = 0; o.p0.copy(o.p); o.lat = clamp(lat, -P.suction.halfWidth, P.suction.halfWidth);
        if (S.popT <= 0) { S.popT = 0.05; onSound('pop', { rate: 0.85 + rnd(i, S.round) * 0.5, gain: 0.7, pan: clamp(o.p.x, -1, 1) * 0.6 }); }
      }
    }
    if (S.inBin >= N) setStage('unlock');
  }

  // ---- 4 unlock：留め金 → 偏心カム → ピンが抜ける → 容器が浮く ----
  function updateUnlock(dt, input) {
    if (S.latchDir === 0 && !S.released && input.justGrabbed && input.grabbed === 'latch') {
      S.latchDir = 1;
      onSound('click', { pan: -0.1 });
    }
    if (!S.released && S.pinX >= releaseX) {
      S.released = true; S.liftT = 0;
      onSound('clack', { pan: -0.1 });
      setStage('dump');
    }
  }

  // ---- 5 dump：容器を運ぶ → ごみ箱のふた → 傾く → 底ぶた → 紙片が落ちる ----
  function startPour() {
    if (S.binMode === 'pour') return;
    S.binMode = 'pour';
    onSound('whoosh', { gain: 0.5, pan: 0.5 });
  }
  function updateDump(dt, input) {
    const mode = S.binMode;
    if (mode !== 'pour') {
      if (input.justGrabbed && input.grabbed === 'bin' && mode !== 'hold') { S.binMode = 'hold'; onSound('whoosh', { gain: 0.45 }); }
      if (S.binMode === 'hold') {
        if (input.grabbed === 'bin' && input.pointer.isDown) {
          if (rayAtPlane(input.ray, planeN, planeD, tv)) {
            tv.x = clamp(tv.x, DP.xMin, DP.xMax);
            const overBody = tv.x < DP.homeX;
            const nearCan = distXZ(tv, canC) < CN.radius + BN.radius + 0.04;
            const minY = (nearCan ? CN.height + 0.1 : overBody ? BN.dock[1] + BN.lift - 0.002 : 0.012) + BN.height / 2;
            tv.y = clamp(tv.y, minY, DP.yMax);
            tv.z = clamp(tv.z, canC.z - 0.06, 0.2);
            S.binC.lerp(tv, damp(BN.follow, dt));
          }
        } else {
          // 離した：ごみ箱の近くなら空ける、本体の上なら受け台へ戻る、それ以外は床に置く
          if (dist3(S.binC, dumpC) < DP.tiltFar || distXZ(S.binC, canC) < CN.radius + 0.06) startPour();
          else if (S.binC.x < DP.homeX) S.binMode = 'home';
          else {
            // 床に置く場所：プラグ・本体・ごみ箱に重ならない所へ寄せる
            S.binMode = 'drop'; S.dropV = 0;
            const o = [Math.max(S.binC.x, P.body.x1 + BN.collarR + 0.02), S.binC.z];
            for (let k = 0; k < 2; k++) { pushFrom(o, plugRest.x, plugRest.z, BN.collarR + 0.08); pushFrom(o, canC.x, canC.z, CN.radius + BN.collarR + 0.02); }
            S.dropX = o[0]; S.dropZ = o[1];
          }
        }
      }
      if (S.binMode === 'home') {
        dockCenter(tv);
        S.binC.lerp(tv, damp(8, dt));
        if (dist3(S.binC, tv) < 0.004) { S.binC.copy(tv); S.binMode = 'dock'; onSound('thunk', { gain: 0.35 }); }
      } else if (S.binMode === 'drop') {
        const floorY = BN.height / 2 + 0.004;
        S.dropV += 5 * dt;
        S.binC.y -= S.dropV * dt;
        S.binC.x += (S.dropX - S.binC.x) * damp(10, dt);
        S.binC.z += (S.dropZ - S.binC.z) * damp(10, dt);
        if (S.binC.y <= floorY) { S.binC.y = floorY; S.binMode = 'floor'; onSound('thunk', { gain: 0.5, pan: 0.3 }); }
      } else if (S.binMode === 'floor') {
        S.binC.x += (S.dropX - S.binC.x) * damp(10, dt);
        S.binC.z += (S.dropZ - S.binC.z) * damp(10, dt);
      } else if (S.binMode === 'dock') {
        dockCenter(S.binC);
      }
      // 空ける位置に近づくほど傾く
      const want = S.binMode === 'hold' ? BN.flapMaxTilt * smoothstep(DP.tiltFar, DP.tiltNear, dist3(S.binC, dumpC)) : 0;
      S.tilt += (want - S.tilt) * damp(10, dt);
      if (S.tilt >= BN.flapStart + 0.03) startPour(); // 底ぶたが開き始めたら、最後まで空ける
    } else {
      S.binC.lerp(dumpC, damp(8, dt));
      S.tilt = Math.min(BN.flapMaxTilt, S.tilt + 2.6 * dt);
      // 底ぶたが開いた分だけ流れ出る
      const beta = K.flapAngle(BN, S.tilt);
      S.pourAcc += ((DP.flow * beta) / BN.flapMax) * dt;
      while (S.pourAcc >= 1 && S.pourIdx < S.inBin) {
        S.pourAcc -= 1;
        const o = sc[binOrder[S.pourIdx++]];
        o.st = POUR; o.t = 0;
      }
      if (S.pourIdx >= S.inBin) S.pourAcc = 0;
    }
    if (S.inCan >= N) startFinale();
  }

  // ---- 6 finale：紙吹雪がごみ箱から噴き出して床に舞い戻る。容器は受け台へ帰ってロック。本体が跳ねる ----
  function startFinale() {
    S.fT = 0; S.docked = false; S.relocked = false;
    S.flyFrom.copy(S.binC); S.flyTilt = S.tilt; S.binMode = 'fly';
    S.round++;
    scatter(S.round); // 次の回の散らばり先（紙片はそこへ着地する）
    for (let i = 0; i < N; i++) {
      const o = sc[i];
      if (o.st !== CAN) { o.st = CAN; canSlot(i, o.p); }
      o.delay = FN.burstStart + rnd(i, 71 + S.round) * FN.burstSpread;
      const far = clamp(distXZ(o.home, canC) / 2, 0, 1);
      o.T = lerp(FN.flight[0], FN.flight[1], 0.6 * far + 0.4 * rnd(i, 72 + S.round));
    }
    for (let i = 0; i < FN.stars; i++) {
      const d = starData[i], second = i % 3 === 0;
      d.t0 = second ? FN.binBack + 0.1 + rnd(i, 81) * 0.5 : FN.burstStart + rnd(i, 82) * 0.9;
      d.life = 0.9 + rnd(i, 83) * 0.9;
      d.size = 0.026 + rnd(i, 84) * 0.034;
      if (second) d.p0.set(A.bodyCenter[0] + (rnd(i, 85) - 0.5) * 0.5, 0.3 + rnd(i, 86) * 0.2, A.bodyCenter[2] + 0.1);
      else d.p0.set(canC.x + (rnd(i, 85) - 0.5) * 0.2, CN.height + 0.05, canC.z + (rnd(i, 86) - 0.5) * 0.2);
      d.v.set((rnd(i, 87) - 0.5) * 0.9, 0.5 + rnd(i, 88) * 0.9, (rnd(i, 89) - 0.3) * 0.6);
    }
    stars.mesh.visible = true;
    onSound('sparkle', { pan: 0.4 });
    setStage('finale');
  }
  const crossed = (t0, t1, at) => t0 < at && t1 >= at;
  function updateFinale(dt) {
    const t0 = S.fT;
    S.fT += dt;
    const t = S.fT;
    // 本体がうれしそうに跳ねる
    const ht = t - 0.35;
    S.hop = ht > 0 && ht < 2.52 ? FN.hop * Math.abs(Math.sin((Math.PI * ht) / 0.36)) * (1 - ht / 2.52) : 0;
    // 容器が弧を描いて受け台へ帰る
    if (!S.docked) {
      const k = clamp(t / FN.binBack, 0, 1), e = ease(k);
      dockCenter(tv);
      S.binC.lerpVectors(S.flyFrom, tv, e);
      S.binC.y += Math.sin(Math.PI * e) * 0.14;
      S.tilt = S.flyTilt * (1 - smoothstep(0, 0.5, k));
      if (k >= 1) { S.docked = true; S.binMode = 'dock'; S.released = false; S.tilt = 0; onSound('clack', { gain: 0.6, pan: -0.1 }); }
    } else {
      dockCenter(S.binC);
      if (!S.relocked && t >= FN.binBack + 0.3) { S.relocked = true; S.latchDir = -1; }
    }
    if (crossed(t0, t, FN.burstStart)) onSound('whoosh', { pan: 0.5 });
    if (crossed(t0, t, FN.burstStart + 0.35)) onSound('sparkle', { rate: 1.2, pan: 0.2 });
    if (crossed(t0, t, FN.binBack + 0.75)) onSound('sparkle', { rate: 0.9, pan: -0.2 });
    if (crossed(t0, t, FN.lidClose + 0.45)) onSound('thunk', { gain: 0.4, pan: 0.5 });
    // ノズルが置き場所へ帰る
    S.noz.lerp(nozRest, damp(2.4, dt));
    if (t >= FN.duration) reset(true);
  }

  // ホースのベジェ（口は −X へ出て、首の先は首の向きに入る。両方の制御点を lift だけ持ち上げる）。tv=首の上端、tv2=首の向き
  function setBez(lift) {
    const hy = hoseEnd.y + S.hop;
    bez[0] = hoseEnd.x; bez[1] = hy; bez[2] = hoseEnd.z;
    bez[3] = hoseEnd.x - HS.k0; bez[4] = hy + lift; bez[5] = hoseEnd.z;
    bez[6] = tv.x + tv2.x * HS.k1; bez[7] = tv.y + tv2.y * HS.k1 + lift; bez[8] = tv.z + tv2.z * HS.k1;
    bez[9] = tv.x; bez[10] = tv.y; bez[11] = tv.z;
  }

  // ================= 毎フレームの連動（状態 → 形） =================
  function mechanism(dt, input) {
    // ---- ノズルの動き → 車輪・向き・モーター ----
    const dx = S.noz.x - S.prevNoz.x, dz = S.noz.z - S.prevNoz.z;
    const moved = Math.hypot(dx, dz);
    S.odo += dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw); // 前へ進んだ距離（車輪の回転角 = 距離 / 半径）
    S.speed += (moved / Math.max(dt, 1e-3) - S.speed) * damp(10, dt);
    S.prevNoz.copy(S.noz);
    let dy = nozYawAt(S.noz.x, S.noz.z) - S.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    S.yaw += dy * damp(NZ.yawFollow, dt);
    const on = S.stage === 'suck' || (S.stage === 'finale' && S.fT < 2.6);
    const wantOmega = on ? clamp(BR.idle + BR.perSpeed * S.speed, 0, BR.maxOmega) : 0;
    S.motorOmega += (wantOmega - S.motorOmega) * damp(BR.spin, dt);
    S.motorAngle = (S.motorAngle + S.motorOmega * dt) % (TAU * BR.z2); // 歯車比が整数に戻る周期で折り返す
    nozzle.group.position.copy(S.noz);
    nozzle.group.rotation.y = S.yaw;
    nozzle.wheels.rotation.x = S.odo / NZ.wheelR;
    nozzle.motor.rotation.x = nozzle.phase.o1 - S.motorAngle;
    nozzle.rotor.rotation.x = nozzle.phase.o2 + nozzle.phase.ratio * S.motorAngle; // ω_brush = (z1/z2)·ω_motor
    if (nozBlob) { nozBlob.position.set(S.noz.x, 0.008, S.noz.z); nozBlob.rotation.y = S.yaw; }
    if (S.stage === 'suck') {
      onLoop('suck', 0.3 + 0.4 * clamp(S.speed * 2, 0, 1), 0.8 + clamp(S.speed, 0, 1));
      onLoop('brush', clamp(S.motorOmega / BR.maxOmega, 0, 1) * 0.9, 0.6 + (1.2 * S.motorOmega) / BR.maxOmega);
    }

    // ---- ボタン → 突き棒 → 爪。リール角 θ(L) → 巻き半径・ぜんまい・爪 ----
    S.b += ((S.pressed ? BT.stroke : 0) - S.b) * damp(BT.press, dt);
    const theta = K.reelAngle(R, S.L);
    const Lw = R.Lmax - S.L;
    body.group.position.y = S.hop;
    body.rotor.rotation.z = theta;
    const rw = K.reelRadius(R, Lw);
    body.winding.visible = Lw > 1e-4;
    body.winding.scale.set(rw, rw, 1);
    body.setSpring(theta); // 締め角 ψ = θ
    const delta = Math.max(K.pawlAngleFromRatchet(theta, RT), K.pawlAngleFromButton(S.b, RT));
    body.pawl.rotation.z = -delta;
    body.button.position.y = P.body.y1 - S.b;

    // ---- 留め金：レバー角 φ → カム → ピン ----
    if (S.latchDir !== 0) {
      S.latchT = clamp(S.latchT + (S.latchDir * dt) / LT.turnTime, 0, 1);
      if (S.latchT <= 0 || S.latchT >= 1) { if (S.latchDir < 0) onSound('click', { pan: -0.1 }); S.latchDir = 0; }
    }
    const wig = hintOn('unlock') && S.latchDir === 0 && !S.released ? P.hint.tilt * (0.5 - 0.5 * Math.cos(TAU * P.hint.hz * S.hintT)) : 0;
    S.phi = LT.phiMax * ease(S.latchT);
    S.pinX = K.camPin(LT.e, S.phi);
    body.lever.rotation.x = -(S.phi + wig);
    body.pin.position.z = K.camPin(LT.e, S.phi + wig);
    // 押し上げ板（ばね）：外れたら容器を持ち上げる
    if (S.released) { S.liftT += dt; S.lift = BN.lift * (1 - Math.exp(-9 * S.liftT) * Math.cos(15 * S.liftT)); } else S.lift += (0 - S.lift) * damp(9, dt);
    body.ejector.position.y = body.ejectorY + S.lift;

    // ---- コード：リールの接点 → 穴 → プラグ ----
    const pd = Math.hypot(S.plug.x - exit.x, S.plug.z - exit.z);
    if (pd > 0.03) { const k = damp(14, dt); S.hx += ((S.plug.x - exit.x) / pd - S.hx) * k; S.hz += ((S.plug.z - exit.z) / pd - S.hz) * k; }
    const hl = Math.hypot(S.hx, S.hz) || 1;
    const hx = S.hx / hl, hz = S.hz / hl;
    plug.group.position.copy(S.plug);
    plug.group.rotation.y = Math.atan2(hx, hz);
    const pts = cordTube.pts, ni = CD.inside, no = CD.segments - ni;
    const rr = rw + CD.radius * 0.6;
    const ta = K.reelTangentAngle(exit.x - R.cx, exit.y - R.cy, rr);
    const tx = R.cx + rr * Math.cos(ta), ty = R.cy + rr * Math.sin(ta) + S.hop, ey = exit.y + S.hop;
    for (let i = 0; i < ni; i++) { const k = i / ni; pts[i * 3] = lerp(tx, exit.x, k); pts[i * 3 + 1] = lerp(ty, ey, k); pts[i * 3 + 2] = exit.z; }
    const tailX = S.plug.x + hx * plug.tail, tailZ = S.plug.z + hz * plug.tail;
    const D = Math.hypot(tailX - exit.x, tailZ - exit.z);
    const slack = Math.max(0, CD.rest + S.L - dist3(S.plug, exit));
    const bulge = Math.sqrt((3 * Math.max(D, 0.05) * slack) / 8); // たるみ：弧の長さ ≈ D + 8b²/(3D)
    let px = -hz, pz = hx; // 横へふくらむ向き（本体から離れる側）
    if (px * 0.6 + pz * 0.8 < 0) { px = -px; pz = -pz; }
    const k1 = Math.min(0.07, D * 0.4), k2 = Math.min(0.12, D * 0.35);
    const minY = CD.radius + 0.001;
    for (let j = 0; j <= no; j++) {
      const t = j / no, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      const side = bulge * Math.sin(Math.PI * t);
      const i = (ni + j) * 3;
      pts[i] = a * exit.x + b * (exit.x + k1) + c * (tailX - hx * k2) + d * tailX + px * side;
      pts[i + 1] = Math.max(minY, a * ey + b * (ey - 0.05) + c * minY + d * S.plug.y);
      pts[i + 2] = a * exit.z + b * exit.z + c * (tailZ - hz * k2) + d * tailZ + pz * side;
    }
    cordTube.update();

    // ---- ホース：長さ一定のベジェ。節を等間隔に、接線へ向ける ----
    nozToWorld(nozzle.wandTop.x, nozzle.wandTop.y, nozzle.wandTop.z, tv);
    nozToWorld(nozzle.wandDir.x, nozzle.wandDir.y, nozzle.wandDir.z, tv2).sub(S.noz); // 向きだけ
    let lo = 0, hi = 1.2;
    setBez(0);
    if (K.bezierSample(bez, 16, hoseTry, null) < HS.length) {
      for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; setBez(mid); if (K.bezierSample(bez, 16, hoseTry, null) < HS.length) lo = mid; else hi = mid; }
      setBez((lo + hi) / 2);
    }
    lHose = K.bezierSample(bez, HS.samples, hosePts, hoseLens);
    for (let i = 0; i < HS.rings; i++) {
      const seg = K.polyAt(hosePts, hoseLens, HS.samples, ((i + 0.5) / HS.rings) * lHose, a3);
      tv3.set(hosePts[seg * 3 + 3] - hosePts[seg * 3], hosePts[seg * 3 + 4] - hosePts[seg * 3 + 1], hosePts[seg * 3 + 5] - hosePts[seg * 3 + 2]);
      if (tv3.lengthSq() < 1e-12) tv3.set(1, 0, 0);
      tq.setFromUnitVectors(UP, tv3.normalize());
      m4.compose(tv4.set(a3[0], a3[1], a3[2]), tq, sv.set(1, 1, 1));
      hose.rings.setMatrixAt(i, m4);
    }
    hose.rings.instanceMatrix.needsUpdate = true;
    const hp = hose.tube.pts, hn = hose.tube.nSeg;
    for (let i = 0; i <= hn; i++) { K.polyAt(hosePts, hoseLens, HS.samples, (i / hn) * lHose, a3); hp[i * 3] = a3[0]; hp[i * 3 + 1] = a3[1]; hp[i * 3 + 2] = a3[2]; }
    hose.tube.update();

    // ---- 容器：中心 C と傾き α → 位置・底ぶた。ごみ箱のふた ----
    if (S.binMode === 'dock') dockCenter(S.binC); // 受け台の上では、押し上げ板と本体の動きに付いていく
    const half = BN.height / 2;
    const wob = hintOn('dump') && (S.binMode === 'dock' || S.binMode === 'floor') ? 1 + P.hint.scale * Math.sin(TAU * P.hint.hz * S.hintT) : 1;
    bin.group.position.set(S.binC.x + half * Math.sin(S.tilt), S.binC.y - half * Math.cos(S.tilt), S.binC.z);
    bin.group.rotation.z = S.tilt;
    bin.group.scale.setScalar(wob);
    bin.flap.rotation.z = K.flapAngle(BN, S.tilt); // 底ぶた角 = clamp((α−0.6)·1.6, 0, 1.6)
    bin.group.updateMatrix();
    let lid = K.lidAngle(CN, distXZ(S.binC, canC)); // ふた角 = 1.4·smoothstep(0.45, 0.15, 距離)
    if (S.stage === 'finale') lid = Math.max(lid, CN.lidMax * (1 - smoothstep(FN.lidClose, FN.lidClose + 0.5, S.fT)));
    S.lid += (lid - S.lid) * damp(14, dt);
    can.lid.rotation.x = -S.lid;
  }

  // 紙片の通り道（長さ s の位置）。床の吸い口 → ブラシの下を後ろへ → 首 → ホース → 立ち上がり管 → 容器の吸込み口
  function pathAt(s, lat, out) {
    if (s < lArc) {
      const b = s / arcR, k = 1 - s / lArc;
      return nozToWorld(lat * k, BR.axisY - arcR * Math.cos(b), BR.axisZ - arcR * Math.sin(b), out);
    }
    let r = s - lArc;
    if (r < lNeck) { K.polyAt(neckPts, neckLens, neckN, r, a3); return nozToWorld(a3[0], a3[1], a3[2], out); }
    r -= lNeck;
    if (r < lHose) { K.polyAt(hosePts, hoseLens, HS.samples, lHose - r, a3); return out.set(a3[0], a3[1], a3[2]); }
    r -= lHose;
    K.polyAt(riserPts, riserLens, riserN, r, a3);
    return out.set(a3[0], a3[1] + S.hop, a3[2]);
  }

  function updateScraps(dt) {
    const total = lArc + lNeck + lHose + lRiser;
    const vArc = Math.max(0.3, ((S.motorOmega * BR.z1) / BR.z2) * BR.tipR); // ブラシの毛先の速さで運ぶ
    const binM = bin.group.matrix;
    tq2.setFromRotationMatrix(binM);
    let falling = 0;
    S.rattleT -= dt;
    for (let i = 0; i < N; i++) {
      const o = sc[i];
      let scale = 1, tumble = false;
      switch (o.st) {
        case FLOOR:
          tq.setFromAxisAngle(UP, o.yaw);
          break;
        case CAPT: { // 吸い口へ引き寄せられる
          o.t += dt / P.suction.pull;
          const k = Math.min(1, o.t);
          nozToWorld(o.lat, 0.01, BR.axisZ, tv);
          o.p.lerpVectors(o.p0, tv, k * k);
          o.p.y += 0.012 * Math.sin(Math.PI * k);
          tumble = true;
          if (o.t >= 1) { o.st = PATH; o.s = 0; }
          break;
        }
        case PATH: {
          o.s += (o.s < lArc ? vArc : P.suction.vAir) * dt;
          pathAt(Math.min(o.s, total), o.lat, o.p);
          scale = 0.62; tumble = true;
          if (o.s >= total) { o.st = SWIRL; o.t = 0; o.slot = S.arrive; binOrder[S.arrive++] = i; }
          break;
        }
        case SWIRL: { // 容器の中で渦を巻いて積もる
          o.t += dt / P.suction.binTime;
          const k = Math.min(1, o.t), e = k * k;
          binSlot(o.slot, tv);
          const a1 = Math.atan2(tv.z, tv.x), r1 = Math.hypot(tv.x, tv.z);
          let turn = a1 - Math.PI; turn -= Math.floor(turn / TAU) * TAU; // 吸込み口（−X）から 1〜2 周
          const ang = Math.PI + (turn + TAU) * k;
          const rad = lerp(BN.radius - 0.014, r1, e);
          o.p.set(rad * Math.cos(ang), lerp(BN.inletY, tv.y, e), rad * Math.sin(ang)).applyMatrix4(binM);
          scale = 0.72; tumble = true;
          if (o.t >= 1) {
            o.st = BIN; S.inBin++;
            if (S.rattleT <= 0) { S.rattleT = 0.09; onSound('rattle', { gain: 0.45, rate: 0.9 + 0.4 * (S.inBin / N), pan: 0.1 }); }
          }
          break;
        }
        case BIN:
          binSlot(o.slot, o.p).applyMatrix4(binM);
          tq.setFromAxisAngle(o.ax, 0.5).premultiply(tq2);
          scale = 0.78;
          break;
        case POUR: { // 傾いた容器の低い縁へすべる
          o.t += dt / 0.2;
          const k = Math.min(1, o.t);
          binSlot(o.slot, tv).applyMatrix4(binM);
          tv2.set(-(BN.radius - 0.008), 0.004, (rnd(i, 91) - 0.5) * 0.05).applyMatrix4(binM);
          o.p.lerpVectors(tv, tv2, k * k);
          scale = 0.78; tumble = true; falling++;
          if (o.t >= 1) {
            // 落下：p = p0 + v0·t − ½·g·t²。ごみ箱の中の自分の場所に着くよう v0 を決める
            o.st = FALL; o.t = 0; o.p0.copy(o.p);
            canSlot(i, tv);
            const v0y = -0.15, dh = Math.max(0.01, o.p0.y - tv.y);
            o.T = (v0y + Math.sqrt(v0y * v0y + 2 * DP.gravity * dh)) / DP.gravity;
            o.v.set((tv.x - o.p0.x) / o.T, v0y, (tv.z - o.p0.z) / o.T);
          }
          break;
        }
        case FALL: {
          o.t += dt;
          const t = Math.min(o.t, o.T);
          o.p.copy(o.p0).addScaledVector(o.v, t);
          o.p.y -= 0.5 * DP.gravity * t * t;
          scale = 0.85; tumble = true; falling++;
          if (o.t >= o.T) { o.st = CAN; canSlot(i, o.p); S.inCan++; }
          break;
        }
        case CAN:
          tq.setFromAxisAngle(o.ax, 0.6);
          scale = 0.85;
          if (S.stage === 'finale' && S.fT >= o.delay) { o.st = POP; o.t = 0; o.p0.copy(o.p); }
          break;
        case POP: { // ごみ箱の口へ飛び出す
          o.t += dt / 0.14;
          const k = Math.min(1, o.t);
          tv.set(canC.x + (rnd(i, 92) - 0.5) * 0.1, CN.height + 0.04, canC.z + (rnd(i, 93) - 0.5) * 0.1);
          o.p.lerpVectors(o.p0, tv, k);
          scale = 0.85; tumble = true;
          if (o.t >= 1) {
            o.st = FLY; o.t = 0; o.p0.copy(tv);
            K.ballisticV0(o.p0.toArray(a3), o.home.toArray(b3), o.T, DP.gravity, a3);
            o.v.set(a3[0], a3[1], a3[2]);
          }
          break;
        }
        case FLY: { // 紙吹雪：弾道で次の散らばり先へ。ひらひら揺れる
          o.t += dt;
          const t = Math.min(o.t, o.T), k = t / o.T;
          o.p.copy(o.p0).addScaledVector(o.v, t);
          o.p.y -= 0.5 * DP.gravity * t * t;
          const fl = 0.035 * Math.sin(Math.PI * k);
          o.p.x += fl * Math.sin(9 * t + i); o.p.z += fl * Math.cos(7 * t + i * 1.7);
          scale = lerp(0.85, 1, k) + 0.3 * Math.sin(Math.PI * k); tumble = true;
          if (o.t >= o.T) { o.st = FLOOR; o.p.copy(o.home); tq.setFromAxisAngle(UP, o.yaw); tumble = false; }
          break;
        }
      }
      if (tumble) tq.setFromAxisAngle(o.ax, S.t * o.spin + i);
      const sz = scraps.size[i];
      m4.compose(o.p, tq, sv.set(sz[0] * scale, sz[0] * scale, sz[1] * scale));
      scraps.mesh.setMatrixAt(i, m4);
    }
    scraps.mesh.instanceMatrix.needsUpdate = true;
    S.falling = falling;
    if (S.stage === 'dump') onLoop('pour', falling > 0 ? 0.9 : 0, 0.8 + 0.5 * (S.inCan / N));
  }

  function updateStars() {
    if (!stars.mesh.visible) return;
    const t = S.fT;
    for (let i = 0; i < FN.stars; i++) {
      const d = starData[i];
      const u = (t - d.t0) / d.life;
      if (u <= 0 || u >= 1) { m4.makeScale(0, 0, 0); stars.mesh.setMatrixAt(i, m4); continue; }
      const lt = t - d.t0;
      tv.copy(d.p0).addScaledVector(d.v, lt);
      tv.y -= 0.5 * 1.2 * lt * lt;
      const s = d.size * Math.sin(Math.PI * u);
      tq.setFromAxisAngle(d.ax, lt * 5 + i);
      m4.compose(tv, tq, sv.set(s, s, s));
      stars.mesh.setMatrixAt(i, m4);
    }
    stars.mesh.instanceMatrix.needsUpdate = true;
  }

  // ================= 次の操作部を目立たせる =================
  let showHint = false;
  const hintOn = (stage) => showHint && S.stage === stage;
  const glowMats = { pull: [M.plug], rewind: [M.button], suck: [M.nozzle], unlock: [M.latch], dump: [M.bin, M.binSolid] };
  function updateGlow(dt) {
    const pulse = showHint && getHint() ? P.hint.glow * (0.5 - 0.5 * Math.cos(TAU * P.hint.hz * S.hintT)) : 0;
    for (const k in glowMats) {
      const want = k === S.stage ? pulse : 0;
      for (const m of glowMats[k]) m.emissiveIntensity += (want - m.emissiveIntensity) * damp(12, dt);
    }
    const w = showHint ? P.hint.scale * Math.sin(TAU * P.hint.hz * S.hintT) : 0;
    plug.group.scale.setScalar(S.stage === 'pull' ? 1 + w : 1);
    const bs = S.stage === 'rewind' && !S.rewinding ? 1 + w : 1;
    body.button.scale.set(bs, 1, bs);
    nozzle.group.scale.setScalar(S.stage === 'suck' ? 1 + w * 0.8 : 1);
  }

  // ================= API =================
  function update(dt, input) {
    const d = clamp(K.finite(dt, 1 / 60), 1e-4, 0.05);
    S.t += d;
    showHint = !!input.showHint;
    S.hintT = showHint ? S.hintT + d : 0;
    switch (S.stage) {
      case 'pull': updatePull(d, input); break;
      case 'rewind': updateRewind(d, input); break;
      case 'suck': updateSuck(d, input); break;
      case 'unlock': updateUnlock(d, input); break;
      case 'dump': updateDump(d, input); break;
      case 'finale': updateFinale(d); break;
    }
    mechanism(d, input);
    updateScraps(d);
    updateStars();
    updateGlow(d);
  }

  const hintPos = new V3(), hintTo = new V3();
  const hintObj = { control: '', position: hintPos, gesture: 'tap', to: undefined };
  function hint(control, gesture, to) { hintObj.control = control; hintObj.gesture = gesture; hintObj.to = to; return hintObj; }
  function getHint() {
    switch (S.stage) {
      case 'pull': {
        hintPos.copy(S.plug);
        const reach = CD.reach * 1.06;
        hintTo.set(exit.x + CD.hintDir[0] * reach, 0, exit.z + CD.hintDir[1] * reach);
        return hint('plug', 'drag', hintTo);
      }
      case 'rewind':
        if (S.rewinding) return null;
        hintPos.set(BT.x, P.body.y1 + BT.height - S.b, BT.z);
        return hint('rewindButton', 'tap');
      case 'suck': {
        // いちばん近い紙片へ
        let best = null, bd = Infinity;
        for (let i = 0; i < N; i++) {
          if (sc[i].st !== FLOOR) continue;
          const dd = distXZ(sc[i].p, S.noz);
          if (dd < bd) { bd = dd; best = sc[i]; }
        }
        if (!best) return null; // 残りは管の中を流れている
        hintPos.set(S.noz.x, 0, S.noz.z);
        clampNozzle(hintTo.set(best.p.x - Math.sin(S.yaw) * BR.axisZ, 0, best.p.z - Math.cos(S.yaw) * BR.axisZ));
        return hint('nozzle', 'drag', hintTo);
      }
      case 'unlock':
        if (S.latchDir !== 0 || S.released) return null;
        hintPos.set(LT.x, LT.shaftY + 0.014 - LT.paddleH + S.hop, LT.shaftZ + LT.armZ + LT.paddleT); // にぎりの所
        return hint('latch', 'tap');
      case 'dump':
        if (S.binMode !== 'dock' && S.binMode !== 'floor') return null;
        hintPos.copy(S.binC);
        return hint('bin', 'drag', hintTo.copy(dumpC));
      default:
        return null;
    }
  }

  function getProgress() {
    switch (S.stage) {
      case 'pull': return clamp(S.L / R.Lmax, 0, 1);
      case 'rewind': return clamp(1 - S.L / R.Lmax, 0, 1);
      case 'suck': return S.inBin / N;
      case 'unlock': return clamp(S.pinX / releaseX, 0, 1);
      case 'dump': return S.inCan / N;
      case 'finale': return clamp(S.fT / FN.duration, 0, 1);
      default: return 0;
    }
  }

  function debugCompleteStage() {
    switch (S.stage) {
      case 'pull':
        clampPlug(S.plug.set(exit.x + CD.hintDir[0] * CD.reach, P.plug.y, exit.z + CD.hintDir[1] * CD.reach));
        finishPull();
        break;
      case 'rewind': finishRewind(); break;
      case 'suck':
        for (let i = 0; i < N; i++) {
          const o = sc[i];
          if (o.st === BIN) continue;
          if (o.st !== SWIRL) { o.slot = S.arrive; binOrder[S.arrive++] = i; }
          o.st = BIN; S.inBin++;
        }
        setStage('unlock');
        break;
      case 'unlock':
        S.latchT = 1; S.latchDir = 0; S.released = true; S.liftT = 0;
        onSound('clack');
        setStage('dump');
        break;
      case 'dump':
        S.binC.copy(dumpC); S.tilt = BN.flapMaxTilt; S.binMode = 'pour'; S.pourIdx = S.inBin;
        for (let i = 0; i < N; i++) { sc[i].st = CAN; canSlot(i, sc[i].p); }
        S.inCan = N;
        startFinale();
        break;
      case 'finale': reset(true); break;
    }
  }

  function dispose() {
    for (const x of owned) { try { x.dispose(); } catch (_) { /* 解放済み */ } }
    owned.length = 0;
    hose.rings.dispose();
    scraps.mesh.dispose();
    stars.mesh.dispose();
    root.removeFromParent();
    root.clear();
  }

  // ---- 初期状態 ----
  resetState(false);
  plug.hit.userData.enabled = true;
  const idle = { showHint: false };
  mechanism(1 / 60, idle);
  updateScraps(1 / 60);
  updateStars();

  return {
    root,
    get stage() { return S.stage; },
    hitTargets,
    update,
    getHint,
    getProgress,
    reset: () => reset(false),
    debugCompleteStage,
    dispose,
    views: P.views,
    stages: STAGES,
    params: P,
  };
}
