// ロボット：足・胴・頭・顔（表情 4 つ）・腕 2 本（上腕と前腕は同じ形なので InstancedMesh）。
// 腕は 2 リンク IK（kinematics.ik2）。左手は自分のハンドルの握りに付き、右手で手招き・指さし・ばんざい・手を振る。
import { TAU } from './params.js';
import { ik2, clamp, damp } from './kinematics.js';

export function createRobot(THREE, kit, ctx) {
  const { P, COLORS, mats, shadows, own, atlas } = ctx;
  const { M, Builder } = kit;
  const R = P.robot;
  const HX = Math.PI / 2;
  const WAIST = 0.46;

  const robot = new THREE.Group();
  robot.name = 'robot';
  robot.position.fromArray(R.foot);
  robot.rotation.y = R.yaw;
  robot.scale.setScalar(R.scale);
  const body = new THREE.Group(); // 跳ねる・つぶれる
  robot.add(body);
  const cast = (m) => { if (shadows) { m.castShadow = true; m.receiveShadow = true; } return m; };

  // ---- 足・脚・腰（体に対して動かない）
  {
    const b = new Builder();
    for (const sx of [-1, 1]) {
      b.color(COLORS.robotMint).rbox(0.17, 0.09, 0.27, 0.04, 2, M(sx * 0.115, 0.045, 0.03));
      b.color(COLORS.robotDark).cyl(0.05, 0.055, 0.3, 10, M(sx * 0.115, 0.23, 0), { open: true });
    }
    b.color(COLORS.robotMint).rbox(0.36, 0.13, 0.27, 0.055, 2, M(0, 0.415, 0));
    cast(body.add(new THREE.Mesh(own(b.build()), mats.paint)).children[0]);
  }

  // ---- 胴（腰で傾く）
  const torso = new THREE.Group();
  torso.position.set(0, WAIST, 0);
  body.add(torso);
  const [tw, th, td] = R.torso;
  const ty = R.torsoY - WAIST;
  const sh = [R.shoulderX, R.shoulderY - WAIST, 0]; // 左肩（+X）。右肩は x を反転
  {
    const b = new Builder();
    b.color(COLORS.robotWhite).rbox(tw, th, td, 0.09, 3, M(0, ty, 0));
    b.decal(atlas.rect('buttons'), 0.19, 0.19, M(-0.045, ty - 0.055, td / 2 + 0.002));
    b.decal(atlas.rect('heart'), 0.1, 0.1, M(0.115, ty + 0.105, td / 2 + 0.002));
    b.color(COLORS.robotMint);
    for (const sx of [-1, 1]) b.sphere(0.08, 12, 8, M(sx * sh[0], sh[1], 0));
    b.rbox(0.27, 0.25, 0.1, 0.04, 2, M(0, ty + 0.01, -td / 2 - 0.035));           // 背中の箱
    b.color(COLORS.robotDark).cyl(0.06, 0.07, 0.07, 12, M(0, ty + th / 2 + 0.02, 0), { open: true }); // 首
    b.color(COLORS.robotYellow).box(tw + 0.012, 0.035, td + 0.012, M(0, ty - th / 2 + 0.05, 0));       // 帯
    torso.add(cast(new THREE.Mesh(own(b.build()), mats.paint)));
  }

  // ---- 頭（首で向きを変える）
  const head = new THREE.Group();
  const [hw, hh, hd] = R.head;
  const headY = R.headY - hh / 2 - WAIST; // 頭の下端（胴の座標）
  head.position.set(0, headY, 0);
  torso.add(head);
  {
    const b = new Builder();
    b.color(COLORS.robotWhite).rbox(hw, hh, hd, 0.11, 3, M(0, hh / 2, 0));
    b.color(COLORS.robotDark).rbox(0.42, 0.25, 0.07, 0.035, 2, M(0, hh / 2, hd / 2 - 0.012));
    for (const sx of [-1, 1]) {
      b.color(COLORS.robotMint).cyl(0.08, 0.08, 0.05, 16, M(sx * (hw / 2 + 0.015), hh / 2, 0, 0, 0, HX));
      b.color(COLORS.robotYellow).cyl(0.04, 0.04, 0.03, 12, M(sx * (hw / 2 + 0.045), hh / 2, 0, 0, 0, HX));
    }
    b.color(COLORS.robotDark).cyl(0.012, 0.012, 0.1, 6, M(0, hh + 0.05, 0), { open: true });
    b.color(COLORS.robotYellow).sphere(0.042, 12, 8, M(0, hh + 0.12, 0));
    head.add(cast(new THREE.Mesh(own(b.build()), mats.paint)));
  }
  // 顔：アトラスの顔のマスを、テクスチャの offset で切り替える
  const face = new THREE.Mesh(own(new THREE.PlaneGeometry(0.38, 0.19)), mats.face);
  face.position.set(0, hh / 2, hd / 2 + 0.0245);
  head.add(face);
  let faceNow = '';
  function setFace(name) {
    if (name === faceNow) return;
    faceNow = name;
    const o = atlas.faceOffset(name);
    mats.face.map.offset.set(o[0], o[1]);
  }
  setFace('faceNeutral');

  // ---- 腕：腕の長さは、握りの円に届くように必要なら伸ばす
  let a = R.upperArm, bLen = R.foreArm;
  {
    robot.updateMatrixWorld(true);
    const S = new THREE.Vector3(sh[0], sh[1], 0).applyMatrix4(torso.matrixWorld);
    const rc = P.crank.robot;
    const gz = rc.armZ + 0.02 + rc.gripLen / 2;
    let far = 0;
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * TAU;
      far = Math.max(far, Math.hypot(rc.center[0] + rc.radius * Math.cos(t) - S.x, rc.center[1] + rc.radius * Math.sin(t) - S.y, gz - S.z));
    }
    const k = Math.max(1, far / ((a + bLen) * 0.93) / R.scale);
    a *= k; bLen *= k;
  }
  let upper, fore;
  {
    const b = new Builder();
    b.color(COLORS.robotMint).capsule(R.armR, a - 0.03, 4, 10, M(0, -a / 2, 0));
    upper = new THREE.InstancedMesh(own(b.build()), mats.paint, 2);
    const f = new Builder();
    f.color(COLORS.robotDark).sphere(0.06, 10, 8);
    f.color(COLORS.robotWhite).cyl(0.047, 0.055, bLen - 0.09, 10, M(0, -(bLen - 0.09) / 2 - 0.015, 0), { open: true });
    f.color(COLORS.robotYellow).cyl(0.062, 0.062, 0.035, 12, M(0, -bLen + 0.075, 0));
    f.color(COLORS.robotWhite).sphere(0.074, 12, 9, M(0, -bLen, 0));                                    // 手
    f.color(COLORS.robotMint);
    for (const [x, z] of [[0.045, 0.03], [-0.045, 0.03], [0, -0.05]]) f.sphere(0.034, 8, 6, M(x, -bLen - 0.05, z)); // 指
    fore = new THREE.InstancedMesh(own(f.build()), mats.paint, 2);
    upper.frustumCulled = fore.frustumCulled = false;
    torso.add(upper, fore);
  }

  // ---- 状態
  const DOWN = new THREE.Vector3(0, -1, 0);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const q1 = new THREE.Quaternion(), m4 = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
  const ikOut = { elbow: [0, 0, 0], hand: [0, 0, 0], reach: 0 };
  const arms = [
    { side: 1, S: [sh[0], sh[1], 0], pole: [0.55, -0.75, -0.4], pose: new THREE.Vector3(0.37, -0.2, 0.12), hand: new THREE.Vector3(0.37, -0.2, 0.12), hold: 0, prev: new THREE.Vector3() },
    { side: -1, S: [-sh[0], sh[1], 0], pole: [-0.55, -0.75, -0.4], pose: new THREE.Vector3(-0.37, -0.2, 0.12), hand: new THREE.Vector3(-0.37, -0.2, 0.12), hold: 0, prev: new THREE.Vector3() },
  ];
  const st = { hopT: 0, hops: 0, y: 0, spin: 0, lean: 0, roll: 0, twist: 0, headYaw: 0, headPitch: 0, blink: 2, servo: 0, dip: 0, happyT: 0, air: false };
  const T3 = [0, 0, 0], S3 = [0, 0, 0];

  function solveArm(i, target) {
    const A = arms[i];
    T3[0] = target.x; T3[1] = target.y; T3[2] = target.z;
    ik2(A.S, T3, A.pole, a, bLen, ikOut);
    v1.set(ikOut.elbow[0] - A.S[0], ikOut.elbow[1] - A.S[1], ikOut.elbow[2] - A.S[2]);
    if (v1.lengthSq() < 1e-10) v1.copy(DOWN); else v1.normalize();
    q1.setFromUnitVectors(DOWN, v1);
    v2.set(A.S[0], A.S[1], A.S[2]);
    upper.setMatrixAt(i, m4.compose(v2, q1, ONE));
    v1.set(ikOut.hand[0] - ikOut.elbow[0], ikOut.hand[1] - ikOut.elbow[1], ikOut.hand[2] - ikOut.elbow[2]);
    if (v1.lengthSq() < 1e-10) v1.copy(DOWN); else v1.normalize();
    q1.setFromUnitVectors(DOWN, v1);
    v2.set(ikOut.elbow[0], ikOut.elbow[1], ikOut.elbow[2]);
    fore.setMatrixAt(i, m4.compose(v2, q1, ONE));
  }

  // c: { time, mode, grip(Vector3 root), hold(bool), hover(bool), point(Vector3|null), look(Vector3), phi, effort 0..1, ask(bool), happy(bool), load 0..1 }
  function update(dt, c) {
    const t = c.time;
    const party = c.mode === 'party';
    // --- 体：跳ねる（お祝い）、わくわく（頂上）、力を入れる（回す）
    let y = 0, squash = 1, hopped = false;
    if (party) {
      const Tc = 0.62, air = 0.44;
      st.hopT += dt;
      if (st.hopT >= Tc) { st.hopT -= Tc; st.hops++; }
      const u = st.hopT / air;
      if (u < 1) { y = 0.26 * 4 * u * (1 - u); if (!st.air) { st.air = true; hopped = true; } }
      else { const g = (st.hopT - air) / (Tc - air); squash = 1 - 0.1 * Math.sin(Math.PI * g); st.air = false; }
      if (st.hops === 2 || st.hops === 5) st.spin = TAU * clamp(st.hopT / air, 0, 1); else st.spin = 0;
    } else {
      st.hopT = 0; st.hops = 0; st.spin = 0; st.air = false;
      if (c.mode === 'excited') y = 0.035 * Math.abs(Math.sin(t * 5.2));
    }
    st.y = y;
    body.position.y = y;
    body.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);
    body.rotation.y = st.spin;
    // 胴：回しているときは握りの方へ傾き、握りの上下に合わせて揺れる。荷を放すと肩がふっと下がる
    const work = c.mode === 'work' ? 1 : c.mode === 'watch' ? 0.35 : 0;
    const gy = c.grip.y - P.crank.robot.center[1];
    const leanT = 0.05 + work * (0.13 - 0.25 * gy) + (c.mode === 'point' || c.mode === 'ask' ? 0.06 : 0);
    st.lean = damp(st.lean, leanT, 9, dt);
    st.roll = damp(st.roll, work * 0.12 * Math.sin(c.phi), 9, dt);
    st.twist = damp(st.twist, c.hold ? 0.22 : c.mode === 'point' ? -0.2 : 0, 6, dt);
    st.dip = damp(st.dip, c.load > 0.5 ? 0.014 : 0, c.load > 0.5 ? 6 : 22, dt); // 荷を支える間は肩が上がり、放すとふっと下がる
    torso.rotation.set(st.lean, st.twist, st.roll);
    torso.position.y = WAIST + 0.004 * Math.sin(t * 2.2) + st.dip + (party ? 0.01 : 0);
    robot.updateMatrixWorld(true);

    // --- 頭：見る点の方へ
    v1.copy(c.look);
    torso.worldToLocal(v1);
    v1.y -= headY + hh / 2;
    const yaw = clamp(Math.atan2(v1.x, v1.z), -1.35, 1.35);
    const pitch = clamp(-Math.atan2(v1.y, Math.hypot(v1.x, v1.z)), -0.7, 0.5);
    st.headYaw = damp(st.headYaw, yaw, 7, dt);
    st.headPitch = damp(st.headPitch, pitch, 7, dt);
    head.rotation.set(st.headPitch, st.headYaw, party ? 0.12 * Math.sin(t * 9) : c.ask ? 0.1 * Math.sin(t * 3) : 0);

    // --- 腕の目標（胴の座標）
    const L = arms[0], Rr = arms[1];
    // 右手
    if (c.mode === 'beckon') { // 手招き
      const w = Math.sin(t * 7.5);
      Rr.pose.set(-0.5, 0.56 + 0.1 * w, 0.3 - 0.16 * (0.5 + 0.5 * w));
    } else if ((c.mode === 'point' || c.mode === 'ask' || c.mode === 'excited') && c.point) { // 指さし
      v1.copy(c.point); torso.worldToLocal(v1);
      v2.set(Rr.S[0], Rr.S[1], Rr.S[2]);
      v1.sub(v2);
      const len = Math.max(v1.length(), 1e-4);
      v1.multiplyScalar(1 / len);
      if (c.mode !== 'excited') { v1.y -= 0.38; v1.normalize(); }                // 自分のハンドルの下を通して指す（握っている手と重ならない）
      const tap = 0.5 + 0.5 * Math.sin(t * 6.5);                                // ちょんちょんと指す
      v1.multiplyScalar((a + bLen) * (0.86 + 0.1 * tap));
      Rr.pose.copy(v2).add(v1);
    } else if (c.mode === 'watch') { // 子どもが回している：ハンドルと一緒に小さく応援
      Rr.pose.set(-0.35, 0.14 + 0.07 * Math.sin(c.phi), 0.27 + 0.06 * Math.cos(c.phi));
    } else if (c.mode === 'work') { // 自分で回す：反対の腕でつり合いを取る
      Rr.pose.set(-0.37, 0.02 - 0.1 * Math.sin(c.phi + 0.6), 0.06 - 0.2 * Math.cos(c.phi + 0.6));
    } else if (party) {
      Rr.pose.set(-0.42 - 0.09 * Math.sin(t * 9), 0.82, 0.1);
    } else if (c.mode === 'wave') {
      Rr.pose.set(-0.5 + 0.14 * Math.sin(t * 7), 0.76 + 0.03 * Math.cos(t * 14), 0.14);
    } else Rr.pose.set(-0.37, -0.2 + 0.012 * Math.sin(t * 2.2), 0.12);
    // 左手：握りに付く（hold）。放しかけ（hover）は握りの少し上
    v3.copy(c.grip); torso.worldToLocal(v3);
    if (party) L.pose.set(0.42 + 0.09 * Math.sin(t * 9), 0.82, 0.1);
    else if (c.hover) L.pose.set(v3.x - 0.02, v3.y + 0.09, v3.z + 0.05);
    else L.pose.set(0.37, -0.2 + 0.012 * Math.sin(t * 2.2), 0.12);
    L.hold = damp(L.hold, c.hold ? 1 : 0, c.hold ? 16 : 10, dt);
    if (c.hold && L.hold > 0.985) L.hold = 1;

    let speed = 0;
    for (let i = 0; i < 2; i++) {
      const A = arms[i];
      A.hand.x = damp(A.hand.x, A.pose.x, 11, dt); A.hand.y = damp(A.hand.y, A.pose.y, 11, dt); A.hand.z = damp(A.hand.z, A.pose.z, 11, dt);
      v1.copy(A.hand);
      if (i === 0 && A.hold > 0) v1.lerp(v3, A.hold);       // 握りの位置にぴったり付く
      solveArm(i, v1);
      speed += v1.distanceTo(A.prev) / Math.max(dt, 1e-3);
      A.prev.copy(v1);
    }
    upper.instanceMatrix.needsUpdate = true;
    fore.instanceMatrix.needsUpdate = true;
    st.servo = damp(st.servo, clamp(speed / 2.2, 0, 1), 8, dt);

    // --- 顔
    st.blink -= dt;
    if (st.blink < -0.12) st.blink = 2.4 + 1.8 * (0.5 + 0.5 * Math.sin(t * 12.9898));
    if (c.happy || party) setFace('faceHappy');
    else if (c.ask) setFace(st.blink < 0 ? 'faceBlink' : 'faceAsk');
    else setFace(st.blink < 0 ? 'faceBlink' : 'faceNeutral');
    return hopped;
  }

  function reset() {
    st.hopT = 0; st.hops = 0; st.spin = 0; st.air = false;
  }

  return {
    group: robot, update, reset, state: st,
    armLength: () => [a, bLen],
    // 頭の位置（root 座標）
    headWorld(out) { head.updateWorldMatrix(true, false); return out.set(0, hh / 2, 0).applyMatrix4(head.matrixWorld); },
  };
}
