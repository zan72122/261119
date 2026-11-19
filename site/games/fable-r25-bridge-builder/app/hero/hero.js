// 主役の仕掛け「伸びる架橋機」。API は docs/HERO-SPEC.md §4 のとおり。
// 寸法と数式は kin.js、本体の形は machine.js、橋の描画は bridge.js。three は引数の THREE を使う。
import { P, TAU, clamp, smooth, wrapPi, solveRound, makeLift, gearAngles, crankToTravel, scissor, wheelAngle, wheelToYaw } from './kin.js';
import { buildMachine, COL } from './machine.js';
import { buildBridges } from './bridge.js';
import { builder } from './parts.js';

const backOut = (t) => { t = clamp(t, 0, 1); const s = 1.7; const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
const lerp = (a, b, k) => a + (b - a) * k;
const CONTROL_OF = { extend: 'crank', lift: 'lever', turn: 'wheel' };

export function createHero(THREE, opts) {
  const targets = opts.targets || [];
  const tex = opts.textures || {};
  const low = !!(opts.quality && opts.quality.tier === 'low');
  const emit = (e) => { try { opts.onEvent && opts.onEvent(e); } catch (err) { console.error(err); } };
  const sound = (name, gain, pitch) => emit({ type: 'sound', name, gain: gain === undefined ? 1 : gain, pitch: pitch === undefined ? 1 : pitch });

  const root = new THREE.Group();
  root.name = 'hero';
  const own = [];
  const keep = (x) => { own.push(x); return x; };

  // ---------- 解（ラウンドごとの橋、起伏のリンク）
  const R = targets.map(solveRound);
  const nR = R.length;
  const lift = makeLift(Math.min(0, ...R.map((r) => r.a1)) - P.releaseDrop);
  const beta0 = lift.betaOf(0);

  // ---------- 材料（draw call を増やさないよう、色は頂点色・インスタンス色で分ける）
  const mats = {
    body: keep(new THREE.MeshLambertMaterial({ map: tex.wood || null, vertexColors: true })),
    metal: keep(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, specular: 0x555555 })),
    link: keep(new THREE.MeshLambertMaterial({ color: 0xffffff })),
    deck: keep(new THREE.MeshLambertMaterial({ map: tex.wood || null, color: 0xffffff })),
    hit: keep(new THREE.MeshBasicMaterial({ visible: false })),
  };
  for (const id of ['crank', 'lever', 'wheel']) {
    mats[id] = keep(new THREE.MeshPhongMaterial({ color: COL.grey, shininess: 40, specular: 0x444444, emissive: 0x000000 }));
  }

  // ---------- 本体と橋
  const mc = buildMachine(THREE, R, lift, mats, keep, low);
  root.add(mc.staticMesh, mc.crank, mc.idler, mc.screw, mc.nut, mc.wheel, mc.lever, mc.ring, mc.turntable);
  const controls = mc.controls;
  for (const id in controls) root.add(controls[id].anchor);
  const ctlMesh = { crank: mc.crank, lever: mc.lever, wheel: mc.wheel };
  const ctlColor = { crank: new THREE.Color(COL.crank), lever: new THREE.Color(COL.lever), wheel: new THREE.Color(COL.wheel) };
  const grey = new THREE.Color(COL.grey);

  const br = buildBridges(THREE, R, mats, keep);
  for (const im of br.meshes) root.add(im);

  if (tex.blob) {
    const blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.7, 3.3).rotateX(-Math.PI / 2)),
      keep(new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false })));
    blob.position.set(0, 0.012, 0.3);
    blob.renderOrder = -1;
    root.add(blob);
  }

  // ---------- 受け口の光（板＋両わきの灯り）と、カチンの光の輪
  const gb = builder(THREE);
  gb.add(new THREE.PlaneGeometry(P.padW, P.padD).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.015, -P.padD / 2 - 0.12));
  for (const sx of [-1, 1]) {
    gb.cyl(0.025, 0.32, sx * (P.trussX + 0.3), 0.16, 0, undefined, 'y', 6);
    gb.ball(0.1, sx * (P.trussX + 0.3), 0.38, 0, undefined, 10);
  }
  const glow = new THREE.InstancedMesh(keep(gb.build()), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })), Math.max(1, nR));
  const flashN = 4;
  const flash = new THREE.InstancedMesh(keep(new THREE.RingGeometry(0.78, 1.0, low ? 24 : 40).rotateX(-Math.PI / 2)),
    keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })), flashN);
  glow.frustumCulled = flash.frustumCulled = false;
  flash.renderOrder = 5;
  root.add(glow, flash);
  const mTmp = new THREE.Matrix4(), mTmp2 = new THREE.Matrix4(), cTmp = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  mc.receivers.forEach((rv, i) => glow.setMatrixAt(i, mTmp.makeRotationY(rv.yaw).setPosition(rv.x, rv.y, rv.z)));
  let flashAt = -1, flashRound = 0;      // 光の輪の経過秒（−1 = 出ていない）

  // ---------- 状態
  const S = { round: 0, rounds: nR, stage: 'extend', control: 'crank', progress: 0, motor: 0, complete: false };
  const st = {
    s: 0,            // ナットの送り（m）＝歯車列の角度のもと
    w: P.w0,         // 今の橋の1セルの長さ
    wL: P.w0,        // 発射セルの長さ
    beta: beta0,     // レバーの角度
    alpha: 0,        // ブームの起伏角
    yaw: 0,          // 旋回角
    clawK: 0, pop: 1,
    packOn: true,    // ブームの上に今のラウンドの橋がある
    rewind: false,   // 押し棒が戻っている途中
    turned: 0,
  };
  const done = [];                 // 固定された橋：{ path: Vector3[] }
  const waves = [];                // 色の波：{ round, t }
  const later = [];                // 少し後に鳴らす音：{ t, name }
  let pendingStage = true, stageTime = 0, force = false;
  let lastFingerAngle = null, tickAcc = 0, clickAcc = 0, creakAcc = 0, wiggleT = 0, hintT = 0, touched = false, lockPhase = 0;
  let relFrom = null, busyFrom = null;
  const ga = { screw: 0, idler: 0, crank: 0 }, sc = { w: 0, phi: 0, h: 0 };
  const v = new THREE.Vector3(), scr = { x: 0, y: 0, z: 0 }, scr2 = { x: 0, y: 0, z: 0 };
  const mBoom = new THREE.Matrix4();

  const cur = () => R[Math.min(S.round, nR - 1)];
  const boomMatrix = (yaw, alpha, out) => out.makeRotationY(yaw).multiply(mTmp2.makeRotationX(alpha)).setPosition(0, P.pivotY, 0);

  function setStage(stage) {
    S.stage = stage;
    S.control = CONTROL_OF[stage] || null;
    S.progress = 0;
    stageTime = 0; lastFingerAngle = null; lockPhase = 0;
    emit({ type: 'stage', round: S.round, stage, control: S.control });
  }

  // ---------- 姿勢を部品へ書く（数式はすべて kin.js）
  function applyPose() {
    gearAngles(st.s, mc.lay, ga);
    let wig = 0, wigW = 0, wigL = 0;
    if (wiggleT > 0 && S.control) {
      const a = Math.sin(wiggleT * TAU * 2) * 0.07;
      if (S.control === 'crank') wig = a; else if (S.control === 'wheel') wigW = a; else wigL = a;
    }
    // 歯車列：揺らすときも歯数比を保つ
    mc.crank.rotation.z = ga.crank + wig;
    mc.idler.rotation.z = ga.idler - wig * P.Z1 / P.Zi;
    mc.screw.rotation.z = ga.screw + wig * P.Z1 / P.Z2;
    mc.nut.position.z = P.nutZ0 - st.s;
    mc.wheel.rotation.z = wheelAngle(st.yaw) + wigW;
    mc.lever.rotation.z = -(st.beta + wigL);
    mc.ring.position.y = lift.ringBottomY(st.beta);
    mc.turntable.rotation.y = st.yaw;
    mc.boom.rotation.x = st.alpha;
    const hL = scissor(st.wL, sc).h;
    mc.crosshead.position.z = -(P.uA + st.wL / 2);
    mc.slider.position.set(0, P.vR + hL, -P.uA);
    boomMatrix(st.yaw, st.alpha, mBoom);
    br.writeLaunch(st.wL, mBoom, !st.packOn);
    if (st.packOn && S.round < nR) br.writeRound(S.round, st.w, mBoom, st.clawK, st.pop);
  }

  function resetAll() {
    for (let r = 0; r < nR; r++) br.hideRound(r);
    br.resetColors();
    done.length = 0; waves.length = 0; later.length = 0;
    S.round = 0; S.complete = false; S.stage = 'extend'; S.control = 'crank'; S.progress = 0; S.motor = 0;
    Object.assign(st, { s: 0, w: P.w0, wL: P.w0, beta: beta0, alpha: 0, yaw: nR ? R[0].target.launchYaw : 0, clawK: 0, pop: 1, packOn: nR > 0, rewind: false, turned: 0 });
    flashAt = -1; wiggleT = 0; hintT = 0; relFrom = busyFrom = null;
    for (let i = 0; i < flashN; i++) flash.setMatrixAt(i, zero);
    flash.instanceMatrix.needsUpdate = true;
    applyPose();
    pendingStage = true;
  }

  // ---------- 指の動き → 進む量
  /** circle：指が操作部の中心のまわりを回った角度（rad、いつも正） */
  function circleAmount(input, c) {
    if (!input.down) { lastFingerAngle = null; return 0; }
    const d = Math.hypot(input.dx, input.dy);
    c.anchor.getWorldPosition(v);
    input.project(v, scr);
    const rx = input.x - scr.x, ry = input.y - scr.y;
    const linear = d / Math.max(40, 0.13 * input.height);     // 離れた所をなぞるときの代わり
    if (Math.hypot(rx, ry) < 20) { lastFingerAngle = null; return Math.min(0.7, linear); }
    const a = Math.atan2(ry, rx);
    let ang = 0;
    if (lastFingerAngle !== null) ang = Math.abs(wrapPi(a - lastFingerAngle));
    lastFingerAngle = a;
    return Math.min(0.7, Math.max(ang, linear));
  }
  /** swipe：swipeDir の向きへなぞった量（段階全体に対する割合、いつも正） */
  function swipeAmount(input, c) {
    if (!input.down) return 0;
    const d = Math.hypot(input.dx, input.dy);
    if (d <= 0) return 0;
    c.anchor.getWorldPosition(v);
    input.project(v, scr);
    v.add(c.swipeDir);
    input.project(v, scr2);
    let sx = scr2.x - scr.x, sy = scr2.y - scr.y;
    const l = Math.hypot(sx, sy);
    let along = d;
    if (l > 1e-3) { sx /= l; sy /= l; along = Math.max(Math.abs(input.dx * sx + input.dy * sy), 0.35 * d); }
    return along / Math.max(60, P.leverSpan * input.height);
  }

  // ---------- 橋を固定する（カチン）
  function lockBridge() {
    const r = S.round, rr = cur(), t = rr.target;
    st.alpha = rr.a1; st.yaw = t.yaw; st.w = rr.w1; st.clawK = 1;
    boomMatrix(st.yaw, st.alpha, mBoom);
    br.writeRound(r, rr.w1, mBoom, 1, 1);
    const path = [];
    for (let i = 0; i <= 5; i++) {
      const u = lerp(rr.rootU, rr.tipU, i / 5);
      path.push(new THREE.Vector3(0, P.vR + P.deckT / 2 + 0.004, -u).applyMatrix4(mBoom));
    }
    done[r] = { path };
    st.packOn = false;
    waves.push({ round: r, t: 0 });
    flashAt = 0; flashRound = r;
    sound('lock');
    later.push({ t: 0.22, name: 'sparkle' });
    emit({ type: 'locked', round: r, targetId: t.id });
  }

  // ---------- 見せ方：色、光、揺れ、受け口、光の輪
  function showState(dt, input) {
    const idle = input.idle || 0, time = input.time || 0;
    if (hintT > 0) hintT -= dt;
    let wig = hintT > 0;
    if (S.control && !input.down && idle > 4 && ((idle - 4) % 2.4) < 1.0) wig = true;
    wiggleT = wig ? wiggleT + dt : 0;
    for (const id in ctlMesh) {
      const m = ctlMesh[id].material, active = S.control === id;
      m.color.lerp(active ? ctlColor[id] : grey, Math.min(1, dt * 8));
      let e = 0;
      if (active && !input.down && idle > 1.5) e = 0.4 + 0.2 * Math.sin(time * 4.2);     // 0.2〜0.6 を往復
      m.emissive.copy(ctlColor[id]).multiplyScalar(e);
    }
    for (let i = 0; i < nR; i++) {
      let k = 0.34;
      if (done[i]) k = 0.8;
      else if (i === S.round && !S.complete) k = (S.stage === 'turn' ? 0.75 : 0.55) + (S.stage === 'turn' ? 0.45 : 0.25) * Math.sin(time * (S.stage === 'turn' ? 5 : 3));
      glow.setColorAt(i, cTmp.setRGB(k, k * 0.93, k * 0.45));
    }
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;

    if (flashAt >= 0) {
      flashAt += dt;
      const rv = mc.receivers[flashRound];
      let alive = false;
      for (let i = 0; i < flashN; i++) {
        const u = (flashAt - i * 0.14) / 0.9;
        if (u <= 0 || u >= 1 || !rv) { flash.setMatrixAt(i, zero); continue; }
        alive = true;
        const s = 0.5 + 3.4 * (1 - (1 - u) * (1 - u));
        mTmp.makeScale(s, s, s);
        if (i === flashN - 1) mTmp.premultiply(mTmp2.makeRotationX(Math.PI / 2 - 0.5));   // 1つは立てて、低いカメラからも見えるように
        flash.setMatrixAt(i, mTmp.setPosition(rv.x, rv.y + (i === flashN - 1 ? 0.5 : 0.06), rv.z));
        const f = (1 - u) * (1 - u);
        flash.setColorAt(i, cTmp.setRGB(f, f * 0.92, f * 0.55));
      }
      flash.instanceMatrix.needsUpdate = true;
      if (flash.instanceColor) flash.instanceColor.needsUpdate = true;
      if (!alive && flashAt > 1.5) flashAt = -1;
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const wv = waves[i];
      wv.t += dt;
      br.colorRound(wv.round, Math.min(1.4, wv.t / 0.8));
      if (wv.t > 1.2) waves.splice(i, 1);
    }
    for (let i = later.length - 1; i >= 0; i--) {
      later[i].t -= dt;
      if (later[i].t <= 0) { sound(later[i].name); later.splice(i, 1); }
    }
  }

  // ---------- 毎フレーム
  function update(dt, input) {
    dt = clamp(dt || 0, 0, 0.05);
    if (pendingStage) { pendingStage = false; setStage(S.stage); }
    stageTime += dt;
    const rr = cur();
    const active = S.control ? controls[S.control] : null;

    // 入力：今の操作部か、何もない所のドラッグだけが進める。違う操作部は「ポン」＋今の操作部を揺らす
    if (input.pressed) touched = input.controlId !== null && input.controlId !== S.control;
    if (active && input.pressed && touched) { hintT = 0.6; sound('hint'); }   // タップもドラッグも、触れた瞬間に1回だけ
    const mine = !!active && input.down && !touched && (input.controlId === S.control || input.controlId === null);
    let amount = 0;      // extend / turn は rad、lift は割合
    if (mine) amount = active.gesture === 'swipe' ? swipeAmount(input, active) : circleAmount(input, active);
    else lastFingerAngle = null;
    const p0 = S.progress;

    if (S.stage === 'extend' && rr) {
      let ds = crankToTravel(amount);
      if (force) { force = false; ds = rr.travel; }
      const s1 = Math.min(rr.travel, st.s + ds);
      ds = s1 - st.s;
      if (ds > 0) {
        const h0 = scissor(st.w, sc).h;
        st.s = s1;
        st.w = st.wL = Math.min(rr.w1, P.w0 + 2 * st.s);
        tickAcc += ds / crankToTravel(TAU / P.Z1);                   // クランク歯車の歯ひとつ
        if (tickAcc >= 1) { tickAcc %= 1; sound('tick', 0.8, 1); }
        clickAcc += (h0 - scissor(st.w, sc).h) / P.ratchetPitch;     // スライダがラチェットの歯をひとつ下がる
        if (clickAcc >= 1) { clickAcc %= 1; sound('ratchet', 0.6, 1.1); }
      }
      S.progress = clamp(st.s / rr.travel, 0, 1);
      if (st.s >= rr.travel - 1e-6) {
        st.s = rr.travel; st.w = st.wL = rr.w1;
        sound('clunk');
        setStage('lift');
      }
    } else if (S.stage === 'lift' && rr) {
      if (force) { force = false; amount = 1; }
      S.progress = clamp(S.progress + amount, 0, 1);
      st.beta = lerp(beta0, P.leverBetaMax, S.progress);
      st.alpha = lift.alphaOf(st.beta);
      if (S.progress > 0.03) st.rewind = true;                        // ブームが離れたら押し棒はばねで戻る
      creakAcc += (S.progress - p0) * 6;
      if (creakAcc >= 1) { creakAcc %= 1; sound('creak', 0.9, 0.9 + 0.3 * S.progress); }
      if (S.progress >= 1) {
        sound('clunk');
        setStage(rr.needTurn ? 'turn' : 'lock');
      }
    } else if (S.stage === 'turn' && rr) {
      let dy = wheelToYaw(amount);
      const total = Math.abs(rr.dyaw);
      if (force) { force = false; dy = total; }
      const t1 = Math.min(total, st.turned + dy);
      clickAcc += (t1 - st.turned) / (TAU / P.Zr);                    // 冠歯車のペグひとつ
      if (clickAcc >= 1) { clickAcc %= 1; sound('ratchet', 0.8, 0.9); }
      st.turned = t1;
      st.yaw = rr.target.launchYaw + Math.sign(rr.dyaw) * st.turned;
      S.progress = total > 0 ? clamp(st.turned / total, 0, 1) : 1;
      if (st.turned >= total - 1e-6) {
        st.yaw = rr.target.yaw;
        sound('whoosh');
        setStage('lock');
      }
    } else if (S.stage === 'lock' && rr) {
      // 自動：レバーが下りて先端が受け口に乗る → ツメが倒れる → カチン
      const u = clamp(stageTime / P.lockTime, 0, 1);
      S.progress = u;
      const bTouch = lift.betaOf(rr.a1);
      const kd = clamp(u / 0.6, 0, 1);
      st.beta = lerp(P.leverBetaMax, bTouch, kd * kd);                // だんだん速く下りる
      st.alpha = Math.max(rr.a1, lift.alphaOf(st.beta));
      if (lockPhase === 0) { lockPhase = 1; sound('creak', 0.7, 0.8); }
      if (lockPhase === 1 && kd >= 1) { lockPhase = 2; st.alpha = rr.a1; sound('clunk'); }
      st.clawK = backOut((u - 0.7) / 0.22);
      if (lockPhase === 2 && u >= 0.7) { lockPhase = 3; sound('ratchet', 1, 1.3); }
      if (u >= 1) {
        lockBridge();
        relFrom = { wL: st.wL, beta: st.beta };
        setStage('cross');
      }
    } else if (S.stage === 'cross' || S.stage === 'finale') {
      // 橋を置いたあと：発射セルを畳んで離し、ブームを少し下げる
      if (relFrom) {
        const u = clamp(stageTime / P.releaseTime, 0, 1);
        if (S.stage === 'cross') S.progress = u;
        const w1 = st.wL;
        st.wL = lerp(relFrom.wL, P.w0, smooth(u / 0.6));
        st.beta = lerp(relFrom.beta, -P.leverBetaMax, smooth((u - 0.4) / 0.6));
        st.alpha = lift.alphaOf(st.beta);
        clickAcc += Math.abs(w1 - st.wL) / 0.12;
        if (clickAcc >= 1) { clickAcc %= 1; sound('ratchet', 0.4, 1.4); }
        if (u >= 1) relFrom = null;
      }
    } else if (S.stage === 'busy' && rr) {
      // 次の橋の用意：ブームを水平に戻し、発射の向きへ回し、畳んだ橋を「ポン」と出す
      if (!busyFrom) busyFrom = { beta: st.beta, yaw: st.yaw, wL: st.wL, pop: false };
      const u = clamp(stageTime / P.busyTime, 0, 1);
      S.progress = u;
      const k = smooth(u / 0.55);
      st.beta = lerp(busyFrom.beta, beta0, k);
      st.alpha = lift.alphaOf(st.beta);
      st.yaw = busyFrom.yaw + wrapPi(rr.target.launchYaw - busyFrom.yaw) * k;
      st.wL = lerp(busyFrom.wL, P.w0, k);
      if (u >= 0.55 && !busyFrom.pop) {
        busyFrom.pop = true;
        st.packOn = true; st.w = P.w0; st.clawK = 0; st.turned = 0;
        sound('pop');
      }
      st.pop = busyFrom.pop ? backOut((u - 0.55) / 0.4) : 0;
      if (u >= 1) {
        st.pop = 1; st.alpha = 0; st.beta = beta0; st.yaw = rr.target.launchYaw; st.wL = P.w0; st.s = 0; st.rewind = false;
        busyFrom = null; relFrom = null;
        setStage('extend');
      }
    }
    force = false;

    // 押し棒の戻り（歯車列も歯数比のまま逆に回る）
    let back = 0;
    if (st.rewind && S.stage !== 'extend') {
      back = Math.min(st.s, 0.42 * dt);
      st.s -= back;
      if (st.s <= 1e-6) { st.s = 0; st.rewind = false; }
      tickAcc += back / crankToTravel(TAU / P.Z1) * 0.5;
      if (tickAcc >= 1) { tickAcc %= 1; sound('tick', 0.35, 1.5); }
    }

    // 機械のうなり音：回している速さ
    let rate = 0;
    if (dt > 0) {
      if (S.stage === 'extend' || S.stage === 'turn') rate = amount / dt / 6;
      else if (S.stage === 'lift') rate = (S.progress - p0) / dt / 1.5;
      rate = Math.max(rate, back > 0 ? 0.35 : 0);
    }
    S.motor += (clamp(rate, 0, 1) - S.motor) * Math.min(1, dt * 8);
    if (!(S.motor >= 0)) S.motor = 0;

    showState(dt, input);
    applyPose();
  }

  function advance() {
    if (S.stage !== 'cross') return;
    if (S.round < nR - 1) {
      S.round++;
      busyFrom = null;
      setStage('busy');
    } else {
      S.complete = true;
      setStage('finale');
      later.push({ t: 0.3, name: 'sparkle' });
      emit({ type: 'complete' });
    }
  }

  function getDeckPath(round) {
    const d = done[round];
    return d ? d.path.map((p) => p.clone()) : [];
  }

  resetAll();
  return {
    root,
    controls,
    update,
    advance,
    reset: resetAll,
    getState: () => S,
    getDeckPath,
    debugFinishStage() { if (CONTROL_OF[S.stage]) force = true; },
    onContextRestored() {
      br.touch();
      glow.instanceMatrix.needsUpdate = flash.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      if (root.parent) root.parent.remove(root);
      br.dispose(); glow.dispose(); flash.dispose();
      for (const x of own) x.dispose();
      own.length = 0;
    },
    /** 確認用：寸法と解（hero-notes の表のもと） */
    debugInfo: () => ({ P, rounds: R, lift: { arm: lift.arm, leverY: lift.leverY, alphaLo: lift.alphaLo, beta0 } }),
  };
}
