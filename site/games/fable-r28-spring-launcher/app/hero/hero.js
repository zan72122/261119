// 主役の仕掛け「ばね発射機」。docs/HERO-SPEC.md の API（createHero）を満たす。
// three は import しない（引数の THREE を使う）。部品は params.js のパラメータから生成し、
// 動きはすべて「状態（歯数 k、レバー角 ψ、仰角 θ、ボタンの押し込み、段階の経過時間）」から毎フレーム式で求める。
//
// 連動（1つの操作 → 3つ以上の動き）
//   レバー ψ ─ 同軸 ─ ピニオン ─ ラック x = rP·ψ ─ 押し板・座席・球 ─ 主ばね L = L0 − x
//        │                         └ ラックの色の帯が固定の矢印の下をすべる（1歯 = 1色）
//        └ 同軸 ─ ラチェット（1歯 = 2π/zR）─ 爪（のこぎり波で上下、歯を越えるたびにカチッ）
//   ボタン d ─ 解放レバー（てこ比 2）─ ヨーク δ = 2d ─ 爪のピンを引き下げる ─ ラチェットが外れる
//        → ばねが伸びる x(t) = x0·cos(πt/2T) → ラック・ピニオン・レバー・針が一緒に戻る → 球が飛ぶ
//   ダイヤル φ ─ ピニオン z1 ─ セクター z2 ─ 仰角 θ = θ0 − (z1/z2)·φ（ゆりかごごと全部が傾く）
//   装填：カム 1回転 s:0→1、止めの出 p = c + e·cos(2πs)。球は止めに沿って下り、p ≤ 0 で転がり落ちる
import { makeParams } from './params.js';
import { makeGeom } from './geom.js';
import { makeMaterials, buildBase, buildCradle } from './parts-static.js';
import { buildPlunger, buildLever, buildPawl, buildDial, buildRelease, buildCam } from './parts-moving.js';

export function createHero(THREE, opts) {
  const P = makeParams(opts);
  const G = makeGeom(THREE);
  const clamp = G.clamp;
  const RAD = Math.PI / 180;
  const TAU = Math.PI * 2;
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const M = makeMaterials(THREE, opts, P, keep);
  const K = { THREE, G, P, M, keep, opts };
  const emit = (type, p) => { try { opts.emit(type, p); } catch (e) { /* シェル側の問題で止まらない */ } };
  const nColors = Math.max(1, opts.ball.colors.length);

  // ================================================================ 運動学（式だけ。描画なし）
  const depth = P.ratchetOut - P.ratchetRoot;
  const [qx, qy] = P.pawlQ;
  const pinStop = P.yokeSlotIn + P.pawlPinR;      // ヨークが下がったとき、ピンが押し出される半径
  /** 爪の向き：爪先が (cx, cy) から距離 r になる角度（三角形 支点–中心–爪先 の余弦定理）。 */
  let pawlSign = 1;
  function pawlDir(cx, cy, r) {
    const dx = cx - qx, dy = cy - qy;
    const d = Math.max(1e-4, Math.hypot(dx, dy));
    const cosA = clamp((d * d + P.pawlLen * P.pawlLen - r * r) / (2 * d * P.pawlLen), -1, 1);
    return Math.atan2(dy, dx) + pawlSign * Math.acos(cosA);
  }
  {
    // 2つの解のうち、爪先が接触位置（pawlContactDeg）に来るほうを選ぶ
    let best = Infinity, bestS = 1;
    for (const s of [1, -1]) {
      pawlSign = s;
      const a = pawlDir(0, 0, P.ratchetRoot);
      const e = Math.hypot(qx + P.pawlLen * Math.cos(a) - P.pawlTipDir[0] * P.ratchetRoot, qy + P.pawlLen * Math.sin(a) - P.pawlTipDir[1] * P.ratchetRoot);
      if (e < best) { best = e; bestS = s; }
    }
    pawlSign = bestS;
  }
  const pawlSeat = pawlDir(0, 0, P.ratchetRoot);
  // 爪ばねの受け（ゆりかごに固定）：爪の中ほどの外側
  const midK = 0.55;
  const mid0 = [qx + midK * P.pawlLen * Math.cos(pawlSeat), qy + midK * P.pawlLen * Math.sin(pawlSeat)];
  const ml = Math.max(1e-4, Math.hypot(mid0[0], mid0[1]));
  const outward = [mid0[0] / ml, mid0[1] / ml];
  const springSeat = [mid0[0] + outward[0] * 0.17, mid0[1] + outward[1] * 0.17];
  // カムの軸（ゆりかごの (v, z)）と、止めの出
  const camShaftN = -P.R + P.camC - P.camR;
  const camShaft = [P.vAxis + P.qGate * P.chuteDir[0] + camShaftN * P.chuteNrm[0], P.qGate * P.chuteDir[1] + camShaftN * P.chuteNrm[1]];
  const stopOut = (s) => P.camC + P.camE * Math.cos(TAU * s);
  const stopContact = (p) => Math.sqrt(Math.max(0, P.R * P.R - Math.pow(P.R - clamp(p, 0, P.R), 2)));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const powerOf = (k) => (k <= 0 ? 0 : (k - 1) / Math.max(1, P.nDetent - 1));
  const speedOf = (k) => P.speedMin + (P.speedMax - P.speedMin) * powerOf(k);

  // ================================================================ 組み立て
  const root = new THREE.Group();
  root.name = 'hero';
  root.add(buildBase(K));

  const tilt = new THREE.Group();            // ゆりかご（仰角 θ で回る）。座標は (u, v, z)
  tilt.name = 'cradle';
  tilt.position.set(P.pivot[0], P.pivot[1], P.pivot[2]);
  root.add(tilt);
  tilt.add(buildCradle(K, { pawlSpringSeat: springSeat, pawlSpringAngle: Math.atan2(outward[1], outward[0]), camShaft }));

  const plunger = buildPlunger(K);
  tilt.add(plunger);

  const low = opts.tier === 'low';
  const mainSpring = G.helix({ R: P.springMeanR, r: P.springWire / 2, turns: P.springTurns, endTurns: P.springEndTurns, segPerTurn: low ? 14 : 22, radial: low ? 6 : 8, L0: P.springL0 });
  keep(mainSpring.geo);
  const springMesh = new THREE.Mesh(mainSpring.geo, M.spring);
  springMesh.name = 'mainSpring';
  springMesh.position.set(P.uBreech, P.vAxis, 0);
  tilt.add(springMesh);

  const lever = buildLever(K);
  tilt.add(lever.group);
  const leverTo = new THREE.Object3D();      // いっぱいまで引いたときの握りの位置
  leverTo.position.set(P.leverLen * Math.cos(P.alphaRest + P.psiMax), P.leverLen * Math.sin(P.alphaRest + P.psiMax), lever.zc);
  tilt.add(leverTo);

  const pawl = buildPawl(K);
  pawl.position.set(qx, qy, 0);
  tilt.add(pawl);
  const pawlSpring = G.helix({ R: 0.03, r: 0.008, turns: 5, endTurns: 0.5, segPerTurn: low ? 8 : 10, radial: 5, L0: 0.13 });
  keep(pawlSpring.geo);
  const pawlSpringMesh = new THREE.Mesh(pawlSpring.geo, M.spring);
  pawlSpringMesh.name = 'pawlSpring';
  pawlSpringMesh.position.set(springSeat[0], springSeat[1], (P.zRatchet0 + P.zRatchet1) / 2);
  tilt.add(pawlSpringMesh);

  const cam = buildCam(K);
  cam.position.set(P.sMuzzle, camShaft[0], camShaft[1]);
  tilt.add(cam);

  const dial = buildDial(K);
  root.add(dial);
  const dialHit = new THREE.Mesh(keep(new THREE.CylinderGeometry(P.dialR + 0.14, P.dialR + 0.14, 0.36, 12).rotateX(Math.PI / 2)), M.hit);
  dialHit.position.set(P.dialCenter[0], P.dialCenter[1], P.dialZ);
  const dialAnchor = new THREE.Object3D();
  const dialTo = new THREE.Object3D();
  {
    const a = P.dialKnobDeg * RAD, b = (P.dialKnobDeg - P.dialHintTurnDeg) * RAD;
    dialAnchor.position.set(P.dialCenter[0] + P.dialR * Math.cos(a), P.dialCenter[1] + P.dialR * Math.sin(a), P.dialZ + 0.08);
    dialTo.position.set(P.dialCenter[0] + P.dialR * Math.cos(b), P.dialCenter[1] + P.dialR * Math.sin(b), P.dialZ + 0.08);
  }
  root.add(dialHit, dialAnchor, dialTo);

  const rel = buildRelease(K);
  root.add(rel.yoke, rel.rel, rel.button, rel.hit, rel.anchor);

  const halo = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), M.halo);
  halo.name = 'hintHalo';
  halo.renderOrder = 5;
  halo.visible = false;
  root.add(halo);
  for (const o of [halo, dialHit, rel.hit, ...lever.hit.children]) o.userData.noShadow = true;

  // 球：座席の1個＋待っている3個（形と材質はシェルのもの）
  const balls = [];
  const ballColor = [];
  for (let i = 0; i < 4; i++) {
    const b = opts.ball.createMesh(i % nColors);
    balls.push(b); ballColor.push(i % nColors);
    tilt.add(b);
  }
  let order = [0, 1, 2, 3];                  // [座席, A（止めの前）, B（角）, C（塔）] のメッシュ番号

  const targets = [
    { id: 'lever', object: lever.hit, anchor: lever.anchor, gesture: 'drag', dragTo: leverTo },
    { id: 'release', object: rel.hit, anchor: rel.anchor, gesture: 'tap' },
    { id: 'angle', object: dialHit, anchor: dialAnchor, gesture: 'rotate', dragTo: dialTo },
  ];

  // ================================================================ 状態
  const S = {
    stage: 'ready', stageT: 0, time: 0,
    k: 0,                      // かかっている歯数
    psi: 0,                    // レバーの角（休みから。ラジアン）
    theta: P.thetaDefaultDeg, thetaGoal: P.thetaDefaultDeg,
    press: 0, bump: 0,         // ボタンの押し込み 0..1、空押しの残り時間
    x0: 0, fireT: P.fireTimeMin, wob: 0,
    grabPending: false, grabOff: 0, dialPrev: null,
    creakT: 0, creakPsi: 0, tickT: 0, rolled: false,
    flashPawl: 0, flashSpring: 0, wiggle: 0,
  };
  const setStage = (s) => { if (S.stage === s) return; const prev = S.stage; S.stage = s; S.stageT = 0; emit('stage', { stage: s, prev }); };

  // 使い回す一時オブジェクト（update で new しない）
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const lray = new THREE.Ray();
  const aim = { origin: new THREE.Vector3(), velocity: new THREE.Vector3(), power: 0, angleDeg: P.thetaDefaultDeg, teeth: 0 };
  const sound = { name: '', gain: 1, pitch: 1 };
  const play = (name, gain = 1, pitch = 1) => { sound.name = name; sound.gain = gain; sound.pitch = pitch; emit('sound', sound); };
  const spark = { position: new THREE.Vector3(), color: 0xffffff, count: 8, speed: 2 };

  /** 発射位置と速度（getAim と launch が同じ式を使う）。origin = 回転軸 + sMuzzle·dir + vAxis·(dir に直角で上)。 */
  function computeAim() {
    const th = clamp(Number.isFinite(S.theta) ? S.theta : P.thetaDefaultDeg, P.thetaMinDeg, P.thetaMaxDeg) * RAD;
    const c = Math.cos(th), s = Math.sin(th);
    aim.origin.set(P.pivot[0] + P.sMuzzle * c - P.vAxis * s, P.pivot[1] + P.sMuzzle * s + P.vAxis * c, P.pivot[2]).applyMatrix4(root.matrixWorld);
    aim.velocity.set(c, s, 0).transformDirection(root.matrixWorld).multiplyScalar(speedOf(S.k));
    aim.power = powerOf(S.k);
    aim.angleDeg = th / RAD;
    aim.teeth = S.k;
    return aim;
  }

  /** 指のレイと、root ローカルの平面 z = z0 の交点 → 中心 (cx, cy) から見た角度。交わらなければ null。 */
  function pointerAngle(ray, z0, cx, cy) {
    if (!ray) return null;
    lray.copy(ray).applyMatrix4(inv.copy(root.matrixWorld).invert());
    const dz = lray.direction.z;
    if (!(Math.abs(dz) > 1e-5)) return null;
    const t = (z0 - lray.origin.z) / dz;
    if (!(t > 0) || !Number.isFinite(t)) return null;
    const hx = lray.origin.x + lray.direction.x * t - cx, hy = lray.origin.y + lray.direction.y * t - cy;
    if (!(hx * hx + hy * hy > 0.01)) return null;        // 軸に近すぎると角度が暴れる
    return Math.atan2(hy, hx);
  }
  const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

  function click(k) {
    play('click', 0.9, 1 + 0.05 * k);
    S.flashPawl = 1;
    // 爪先（ゆりかご座標）→ ワールド
    spark.position.set(P.pawlTipDir[0] * P.ratchetOut, P.pawlTipDir[1] * P.ratchetOut, P.zYoke1);
    tilt.localToWorld(spark.position);
    spark.color = 0xfff0a0; spark.count = 6 + k; spark.speed = 1.4;
    emit('sparkle', spark);
  }

  function tapLever() {
    if (S.stage !== 'ready' && S.stage !== 'charged') return;
    if (S.k < P.nDetent) { S.k++; click(S.k); setStage('charged'); }
    else { S.wiggle = 1; play('creak', 0.5, 1.2); }       // もう引けない：ぷるっと揺れるだけ
  }
  function tapAngle() {
    if (S.stage === 'firing') return;
    const next = S.thetaGoal + P.tapAngleStepDeg;
    S.thetaGoal = next > P.thetaMaxDeg + 0.01 ? P.thetaMinDeg : Math.min(P.thetaMaxDeg, next);
    play('tick', 0.8, 0.8 + S.thetaGoal / 100);
  }
  function pressRelease() {
    if (S.stage === 'firing' || S.stage === 'reloading') { S.bump = Math.max(S.bump, 0.12); return; }
    play('press', S.k > 0 ? 0.8 : 0.6);
    if (S.k <= 0 || S.stage === 'charging') { S.bump = 0.2; return; }  // 圧縮 0：「ぽん」と押せるだけ
    play('clack', 0.8);
    S.x0 = P.rP * Math.max(S.psi, S.k * P.dPsi * 0.5);
    S.fireT = P.fireTimeMin + (P.fireTimeMax - P.fireTimeMin) * powerOf(S.k);
    setStage('firing');
  }

  function launch() {
    computeAim();
    const ci = ballColor[order[0]];
    emit('launch', { origin: aim.origin.clone(), velocity: aim.velocity.clone(), colorIndex: ci, power: aim.power });
    play('boing', 1, 0.8 + 0.5 * aim.power);
    spark.position.copy(aim.origin); spark.color = opts.ball.colors[ci] ?? 0xffffff; spark.count = 12 + Math.round(16 * aim.power); spark.speed = 2.6;
    emit('sparkle', spark);
    S.flashSpring = 1;
    S.wob = 0.035 + 0.05 * aim.power;
    // 座席の球はシェルの飛ぶ球に引き継ぐ。このメッシュは次に塔の上から入ってくる球になる
    const b = balls[order[0]];
    b.visible = false;
    ballColor[order[0]] = (ballColor[order[3]] + 1) % nColors;
    opts.ball.setColor(b, ballColor[order[0]]);
    S.k = 0;
    S.rolled = false;
    setStage('reloading');
  }

  /** 道のり q の位置（ゆりかご座標）。0 = 座席、qB までは横レール、その先は塔を上る。 */
  function pathPos(q, obj) {
    const qq = Math.max(0, q);
    if (qq <= P.qB) obj.position.set(P.sMuzzle, P.vAxis + qq * P.chuteDir[0], qq * P.chuteDir[1]);
    else obj.position.set(P.sMuzzle, P.vAxis + P.qB * P.chuteDir[0] + (qq - P.qB), P.qB * P.chuteDir[1]);
    obj.rotation.set(-qq / P.R, 0, 0);                    // すべらず転がる：回転 = 道のり / 半径
  }

  // ================================================================ 毎フレーム
  function update(dt, input) {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 1 / 60;
    S.time += dt;
    S.stageT += dt;
    const pt = (input && input.pointer) || {};
    const events = (input && input.events) || [];

    // ---- できごと ----
    for (let i = 0; i < events.length; i++) {
      const e = events[i], id = e.targetId;
      if (e.type === 'down') {
        if (id === 'lever') S.grabPending = true;
        else if (id === 'angle') S.dialPrev = null;
      } else if (e.type === 'up' || e.type === 'cancel') {
        if (id === 'lever' && S.stage === 'charging') setStage(S.k > 0 ? 'charged' : 'ready');
      } else if (e.type === 'tap') {
        if (id === 'release') pressRelease();
        else if (id === 'lever') tapLever();
        else if (id === 'angle') tapAngle();
      }
    }

    // ---- レバー：指の下に握りが付いてくる。歯止めがあるので戻らない ----
    const th0 = S.theta * RAD;
    let psiGoal = S.k * P.dPsi;
    const dragging = pt.down && pt.targetId === 'lever' && (S.stage === 'ready' || S.stage === 'charged' || S.stage === 'charging');
    if (dragging) {
      const a = pointerAngle(pt.ray, lever.zc, P.pivot[0], P.pivot[1]);
      if (a !== null) {
        const psiPtr = wrapPi(a - th0 - P.alphaRest - P.psiMax / 2) + P.psiMax / 2;
        if (S.grabPending) { S.grabOff = clamp(psiPtr - S.psi, -0.4, 0.4); S.grabPending = false; }
        S.grabOff *= Math.exp(-3 * dt);                   // 掴んだ所のずれは少しずつ消す（端まで引ける）
        psiGoal = Math.max(psiGoal, clamp(psiPtr - S.grabOff, 0, P.psiMax));
      }
      setStage('charging');
    } else if (S.stage === 'charging' && !pt.down) {
      setStage(S.k > 0 ? 'charged' : 'ready');            // up を取りこぼしても固まらない
    }
    if (S.stage === 'ready' || S.stage === 'charged' || S.stage === 'charging') {
      S.psi += (psiGoal - S.psi) * (1 - Math.exp(-(S.stage === 'charging' ? 30 : 16) * dt));
      if (S.stage === 'charging') {
        const kNew = Math.min(P.nDetent, Math.floor(S.psi / P.dPsi + 1e-3));
        if (kNew > S.k) { S.k = kNew; click(kNew); }
        S.creakT += dt;
        if (S.psi > S.creakPsi + 0.06 && S.creakT > 0.18) { play('creak', 0.3 + 0.3 * (S.psi / P.psiMax), 0.9 + 0.3 * (S.psi / P.psiMax)); S.creakT = 0; S.creakPsi = S.psi; }
        if (S.psi < S.creakPsi) S.creakPsi = S.psi;
      } else S.creakPsi = S.psi;
    }

    // ---- 仰角ダイヤル（firing 以外）----
    if (S.stage !== 'firing') {
      const before = Math.round(S.theta / 5);
      if (pt.down && pt.targetId === 'angle') {
        const a = pointerAngle(pt.ray, P.dialZ, P.dialCenter[0], P.dialCenter[1]);
        if (a !== null) {
          if (S.dialPrev !== null) {
            const dPhi = wrapPi(a - S.dialPrev);          // ダイヤルが回った角
            S.theta = clamp(S.theta - (dPhi / RAD) / P.dialRatio, P.thetaMinDeg, P.thetaMaxDeg);   // θ = θ0 − (z1/z2) φ
            S.thetaGoal = S.theta;
          }
          S.dialPrev = a;
        }
      } else if (Math.abs(S.thetaGoal - S.theta) > 1e-3) {
        const step = (S.thetaGoal - S.theta) * (1 - Math.exp(-12 * dt));
        S.theta = Math.abs(S.thetaGoal - S.theta) < 0.02 ? S.thetaGoal : S.theta + step;
      }
      S.tickT += dt;
      if (Math.round(S.theta / 5) !== before && S.tickT > 0.05 && pt.down) { play('tick', 0.7, 0.8 + S.theta / 100); S.tickT = 0; }
    }
    if (!Number.isFinite(S.theta)) S.theta = S.thetaGoal = P.thetaDefaultDeg;

    // ---- 段階：発射と装填 ----
    let x = P.rP * S.psi;                                 // 圧縮量 = ラックの移動 = rP·ψ
    let feed = -1;                                        // 装填の位相 s（0..1）。装填中だけ ≥ 0
    if (S.stage === 'firing') {
      const k = S.stageT / Math.max(0.05, S.fireT);
      if (k >= 1) { x = 0; S.psi = 0; launch(); feed = 0; }
      else { x = S.x0 * Math.cos(Math.PI * k / 2); S.psi = x / P.rP; }
    } else if (S.stage === 'reloading') {
      const t = S.stageT;
      x = -S.wob * Math.exp(-7 * t) * Math.sin(38 * t);   // 伸びきったばねの余韻（ラック・レバー・針も一緒に揺れる）
      S.psi = x / P.rP;
      feed = clamp(t / P.reloadTime, 0, 1);
      if (!S.rolled && feed >= P.camFreeAt) { S.rolled = true; play('roll', 0.7); }
      if (t >= P.reloadTime) {
        order = [order[1], order[2], order[3], order[0]];
        feed = -1; x = 0; S.psi = 0;
        setStage('ready');
      }
    }
    if (S.wiggle > 0) { S.wiggle = Math.max(0, S.wiggle - dt * 3); }
    const psiVis = S.psi + 0.02 * S.wiggle * Math.sin(S.time * 40);

    // ---- ボタン → 解放レバー → ヨーク ----
    S.bump = Math.max(0, S.bump - dt);
    const pressGoal = (S.stage === 'firing' || (S.stage === 'reloading' && S.stageT < 0.42) || S.bump > 0) ? 1 : 0;
    S.press += (pressGoal - S.press) * (1 - Math.exp(-(pressGoal > S.press ? 45 : 14) * dt));
    const d = P.buttonTravel * clamp(S.press, 0, 1);      // ボタンの押し込み
    const gamma = Math.asin(clamp(d / P.relArmBtn, -1, 1)); // 解放レバーの角
    const delta = P.relArmRod * Math.sin(gamma);          // ヨークの下がり = てこ比 × 押し込み

    // ================= 見た目：すべて状態から計算 =================
    const th = S.theta * RAD;
    tilt.rotation.z = th;
    dial.rotation.z = -(S.theta - P.thetaDefaultDeg) * RAD * P.dialRatio;
    plunger.position.x = -x;
    mainSpring.update(P.springL0 - x);
    lever.group.rotation.z = P.alphaRest + psiVis;
    rel.button.position.y = P.buttonPos[1] - d;
    rel.rel.rotation.z = gamma;
    rel.yoke.position.y = -delta;

    // 爪：ラチェットの歯に乗る角度と、ヨークに引かれる角度の「外側」のほう
    const sTooth = Math.max(0, psiVis) / P.dPsi;
    const rTooth = P.ratchetRoot + depth * G.ratchetProfile(sTooth - Math.floor(sTooth));
    let pa = pawlDir(0, 0, rTooth);
    if (delta > 1e-4) {
      // ヨークは台に付いていて真下（ワールド −Y）へ動く → ゆりかご座標では (−δ sinθ, −δ cosθ)
      const pb = pawlDir(-delta * Math.sin(th), -delta * Math.cos(th), pinStop);
      const rb = Math.hypot(qx + P.pawlLen * Math.cos(pb), qy + P.pawlLen * Math.sin(pb));
      if (rb > rTooth) pa = pb;
    }
    pawl.rotation.z = pa;
    {
      const mx = qx + midK * P.pawlLen * Math.cos(pa) + outward[0] * 0.035, my = qy + midK * P.pawlLen * Math.sin(pa) + outward[1] * 0.035;
      const sx = mx - springSeat[0], sy = my - springSeat[1];
      pawlSpringMesh.rotation.z = Math.atan2(sy, sx);
      pawlSpring.update(Math.max(0.03, Math.hypot(sx, sy)));
    }

    // 球とカム
    const seat = balls[order[0]], bA = balls[order[1]], bB = balls[order[2]], bC = balls[order[3]];
    if (feed < 0) {
      cam.rotation.x = P.chuteDeg * RAD;
      seat.visible = true; seat.scale.setScalar(1);
      seat.position.set(P.sMuzzle - x, P.vAxis, 0); seat.rotation.set(0, 0, 0);
      pathPos(P.qA, bA); pathPos(P.qB, bB); pathPos(P.qC, bC);
    } else {
      const s = feed, p = stopOut(s);
      cam.rotation.x = P.chuteDeg * RAD + TAU * s;        // カム 1回転で 1個
      // A：止めが下がるのに沿って下り、p ≤ 0 で自由に転がって座席へ
      let q;
      const sSeat = 0.62;
      if (s < P.camFreeAt) q = P.qGate + stopContact(p);
      else if (s < sSeat) { const w = (s - P.camFreeAt) / (sSeat - P.camFreeAt); q = P.qGate * (1 - w * w); }
      else { const tb = (s - sSeat) * P.reloadTime; q = 0.05 * Math.exp(-9 * tb) * Math.abs(Math.sin(24 * tb)); }
      pathPos(q, bA);
      if (q < 0.02) bA.position.x = P.sMuzzle - x;
      // B, C, 新しい球：1列で下りてきて、上がってきた止めに当たって止まる
      let qb = P.qB - (P.qB - (P.qA - 0.08)) * smooth(0.30, 0.82, s);
      if (s > 0.5 && p > 0) qb = Math.max(qb, P.qGate + stopContact(p));
      pathPos(qb, bB);
      pathPos(qb + P.ballGap, bC);
      const sc = smooth(0.22, 0.6, s);
      seat.visible = sc > 0.02;
      seat.scale.setScalar(Math.max(0.02, sc));
      pathPos(qb + 2 * P.ballGap, seat);
    }

    // ---- 光：歯止めのカチッ、発射、次の操作部 ----
    S.flashPawl = Math.max(0, S.flashPawl - dt * 6);
    S.flashSpring = Math.max(0, S.flashSpring - dt * 4);
    M.pawl.emissiveIntensity = 0.9 * S.flashPawl;
    M.spring.emissiveIntensity = 0.12 + 0.6 * S.flashSpring;
    const next = getNextTarget();
    const lv = clamp(Number.isFinite(input && input.hintLevel) ? input.hintLevel : 0, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(S.time * TAU * 1.5);   // 1.5 Hz
    const onL = next === 'lever' ? lv : 0, onB = next === 'release' ? lv : 0;
    M.grip.emissiveIntensity = onL * (0.25 + 0.35 * pulse);
    lever.grip.scale.setScalar(1 + 0.08 * onL * pulse);
    M.button.emissiveIntensity = onB * (0.25 + 0.35 * pulse);
    rel.cap.scale.setScalar(1 + 0.07 * onB * pulse);
    const on = Math.max(onL, onB);
    if (on > 0.01 && input && input.camera) {
      const t = next === 'lever' ? lever.anchor : rel.anchor;
      t.getWorldPosition(v1);
      // 少しカメラ寄りに置く（握りやボタンにめり込まない）
      v2.copy(input.camera.position).sub(v1);
      const len = v2.length();
      if (len > 1e-3) v1.addScaledVector(v2, 0.35 / len);
      root.worldToLocal(v1);
      halo.position.copy(v1);
      halo.quaternion.copy(input.camera.quaternion);
      halo.scale.setScalar((next === 'lever' ? 1.15 : 1.3) * (0.92 + 0.16 * pulse));
      M.halo.opacity = on * (0.45 + 0.4 * pulse);
      halo.visible = true;
    } else halo.visible = false;
  }

  function getNextTarget() {
    if (S.stage === 'ready') return 'lever';
    if (S.stage === 'charged') return 'release';
    return null;
  }

  function getAim() { return computeAim(); }

  function reset() {
    const prev = S.stage;
    S.stage = 'ready'; S.stageT = 0; S.k = 0; S.psi = 0;
    S.theta = S.thetaGoal = P.thetaDefaultDeg;
    S.press = 0; S.bump = 0; S.wob = 0; S.wiggle = 0; S.flashPawl = 0; S.flashSpring = 0;
    S.grabPending = false; S.grabOff = 0; S.dialPrev = null;
    for (const b of balls) { b.visible = true; b.scale.setScalar(1); }
    emit('stage', { stage: 'ready', prev });
  }

  function dispose() {
    root.removeFromParent();
    for (const b of balls) b.removeFromParent();          // 形と材質はシェルのもの（解放しない）
    for (const d of disposables) d.dispose();             // 自分で作った形・材質・Canvas テクスチャ
    disposables.length = 0;
  }

  function onContextRestored() {
    // DataTexture や RenderTarget は持たない。Canvas テクスチャと動く頂点を送り直すだけ（状態はそのまま）。
    M.atlas.needsUpdate = true;
    M.haloTex.needsUpdate = true;
    for (const h of [mainSpring, pawlSpring]) { h.geo.attributes.position.needsUpdate = true; h.geo.attributes.normal.needsUpdate = true; }
  }

  // 最初の姿勢を作っておく（最初のフレームの前に renderer.compile されるため）
  root.updateMatrixWorld(true);
  update(0, { events: [], pointer: {}, hintLevel: 0 });
  root.updateMatrixWorld(true);

  return {
    root, targets, update, getStage: () => S.stage, getNextTarget, getAim, reset, dispose, onContextRestored,
    params: P,                 // デバッグ用（読むだけ）
    debugState: S,
  };
}
