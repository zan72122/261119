// 手回しミシンの主役（hero）。API は docs/HERO-SPEC.md のとおり。
//   params.js     寸法表（ここを変えれば形も動きも変わる）
//   kinematics.js 数式（スライダークランク・四節リンク・送りの楕円・模様カム・位相）
//   geom.js       形を作る道具（歯車・押し出し・回転体・糸の管）
//   machine.js    本体と機構の組み立て、pose(θ) で全部品を置く
//   cloth.js      布（垂れる形はシェーダー）と縫い目
//   atlas.js      自作 Canvas テクスチャ 1 枚（模様ダイヤルとカバーの飾り）
// 編集したら `npm run build:hero` で hero.bundle.js を作り直すこと。
import { P } from './params.js';
import { TAU, clamp, smooth, finite, sewState, patternPoints, HOOK_CATCH } from './kinematics.js';
import { makeKit, makeTube } from './geom.js';
import { makeAtlas } from './atlas.js';
import { buildMachine } from './machine.js';
import { makeClothKit } from './cloth.js';

export { patternPoints };
export const PLATE_Y = P.PLATE_Y;
export const NEEDLE_X = P.NEEDLE_X;
export const WHEEL_C = P.wheel.c;

const PATTERNS = ['wave', 'star', 'heart'];
// 布と糸の組み合わせ（糸は布と強く対比する色。糸巻き・糸・縫い目が同じ色になる）
const LOOKS = [
  { tex: 'linen', tint: [1.08, 1.08, 1.08], thread: 0xd93a6e },   // 生成り × いちご色
  { tex: 'linen', tint: [0.74, 1.12, 1.10], thread: 0xf08a00 },   // 若草 × みかん色
  { tex: 'linen', tint: [1.20, 0.80, 0.95], thread: 0xe0244f },   // さくら × 赤
  { tex: 'floral', tint: [1, 1, 1], thread: 0x2f7fd8 },           // 小花 × 青
];
const ICON_COLORS = ['#d93a6e', '#f08a00', '#e0244f'];
const HALF = Math.PI / 2;
const MAX_SPEED = 6 * Math.PI;   // 手回し車の上限（毎秒 3 回転）
const TAP_SPEED = 3 * Math.PI;   // タップ 1 回 = 1 回転を約 0.7 秒で

export function createHero(THREE, opts = {}) {
  const tex = opts.textures || {};
  const detail = clamp(finite(opts.tier && opts.tier.detail, 1), 0.4, 1.5);
  const onStage = opts.onStage || (() => {});
  const onCue = opts.onCue || (() => {});
  const slots = opts.displaySlots || [];
  const addons = opts.addons || (typeof window !== 'undefined' ? window.THREE_ADDONS : null);
  const kit = makeKit(THREE, addons, detail);
  const C = P.cloth, W = P.wheel, LV = P.lever, NX = P.NEEDLE_X;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const root = new THREE.Group();
  root.name = 'hero';
  const own = { geos: [], mats: [], texs: [], inst: [] };
  const M = (m) => (own.mats.push(m), m);

  // ---------- 材質（塗りは頂点色で塗り分け、金属は 1 枚のヘアラインを色違いで使う）----------
  const time = { value: 0 };
  const mats = {
    paint: M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04 })),
    metal: M(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.metal || null, roughness: 0.34, metalness: 0.82 })),
    wheel: M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.04 })),
    lever: M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.04 })),
    cover: M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.04 })),
    dial: M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.02 })),
    thread: M(new THREE.MeshStandardMaterial({ color: LOOKS[0].thread, roughness: 0.75, metalness: 0 })),
    hidden: M(new THREE.MeshBasicMaterial({ visible: false })),
    spark: M(new THREE.MeshBasicMaterial({ color: 0xfff0a8, side: THREE.DoubleSide, toneMapped: false })),
  };

  // ---------- 機械 ----------
  const machine = buildMachine(THREE, kit, mats);
  root.add(machine.root);
  own.geos.push(...machine.geos);
  let atlas = null;
  try { atlas = makeAtlas(THREE, machine.coverOutline, ICON_COLORS, (opts.tier && opts.tier.maxTextureSize) || 1024); own.texs.push(atlas); } catch (e) { atlas = null; }
  if (atlas) { mats.cover.map = atlas; mats.dial.map = atlas; } else { mats.cover.color.set(0xf6b8c8); mats.dial.color.set(0xfff3dc); }

  // ---------- 布・縫い目 ----------
  const clothKit = makeClothKit(THREE, kit, tex, time, mats.hidden);
  own.geos.push(...clothKit.geos);
  const lookOf = (round) => LOOKS[round % LOOKS.length];
  let cloth = clothKit.make(lookOf(0));
  root.add(cloth.group);
  const hung = [];   // 飾られた布 { cloth, slot }

  // ---------- 糸（管 2 本ぶんを 1 つの形に。頂点は位置だけ書き換える）----------
  const tube = makeTube(THREE, [14, 4], 5);
  own.geos.push(tube.geometry);
  const threadMesh = new THREE.Mesh(tube.geometry, mats.thread);
  threadMesh.frustumCulled = false; threadMesh.name = 'thread';
  root.add(threadMesh);
  const TH = P.thread;
  const way = [V(TH.spool[0] - TH.spoolR, TH.spool[1] + TH.spoolH * 0.55, TH.spool[2]), V(...TH.g0), V(TH.tension[0], TH.tension[1] - 0.0025, TH.tension[2]), V(...TH.g1), V(), V(...TH.g2), V(), V()];
  const upPts = Array.from({ length: 14 }, () => V()), lowPts = Array.from({ length: 4 }, () => V());
  const va = V(), vb = V(), hole = V();

  // ---------- きらきら（飾られた瞬間だけ）----------
  const sparkGeo = (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.28 : 1, a = (i * Math.PI) / 4; if (i) s.lineTo(r * Math.cos(a), r * Math.sin(a)); else s.moveTo(r, 0); } s.closePath(); return new THREE.ShapeGeometry(s); })();
  own.geos.push(sparkGeo);
  const SPARKS = 14;
  const sparks = new THREE.InstancedMesh(sparkGeo, mats.spark, SPARKS);
  sparks.visible = false; sparks.frustumCulled = false; sparks.name = 'sparkles';
  own.inst.push(sparks); root.add(sparks);
  const sparkSeed = Array.from({ length: SPARKS }, (_, i) => { const a = i * 2.399963, r = 0.35 + 0.65 * ((i * 0.618034) % 1); return { x: Math.cos(a) * r, y: Math.sin(a) * r, d: (i % 5) * 0.11, s: 0.014 + 0.012 * ((i * 0.37) % 1) }; });
  const sparkC = V(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = V(), zAxis = V(0, 0, 1);

  // ---------- 状態 ----------
  const status = { stage: 'fabric', round: 0, pattern: 'wave', stitches: 0, progress: 0, crankSpeed: 0, busy: false, coverOpen: false };
  const S = {
    theta: HALF, thetaR: HALF, last: HALF, omega: 0, auto: 0,
    pts: patternPoints('wave'), kTarget: P.K_SEW1, sewing: false, cut: true,
    fabT: 0, footT: 0, footDown: 0, coverT: 0, finT: 0, wiggle: 0, grab: null, popT: 1, dial: 0, sparkT: -1, settle: 0,
  };
  const sew = {};
  const fly = { from: V(), to: V(), toQ: new THREE.Quaternion(), toS: 1, fromQ: new THREE.Quaternion(), z0: 0, foldAt: C.len };

  function setStage(next) {
    const prev = status.stage;
    status.stage = next;
    onStage(next, { round: status.round, pattern: status.pattern, prev });
  }
  function activePart() {
    switch (status.stage) {
      case 'fabric': return 'fabric';
      case 'foot': return 'lever';
      case 'sew1': case 'sew2': return 'wheel';
      case 'cover': return 'cover';
      default: return null;
    }
  }

  // ---------- 手回し車の入力（接線投影法：指の下の縁が指と一緒に動く）----------
  const WC = V(...W.c), pA = {}, pB = {}, cand = Array.from({ length: 16 }, () => ({ x: 0, y: 0, tx: 0, ty: 0, t2: 0 }));
  function wheelDrag(input) {
    let best = null, bestD = Infinity, tmax = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, k = cand[i];
      va.set(0, W.knobArm * Math.cos(a), W.knobArm * Math.sin(a)).add(WC); input.project(va, pA);
      va.set(0, W.knobArm * Math.cos(a + 0.01), W.knobArm * Math.sin(a + 0.01)).add(WC); input.project(va, pB);
      k.x = pA.x; k.y = pA.y; k.tx = (pB.x - pA.x) / 0.01; k.ty = (pB.y - pA.y) / 0.01; k.t2 = k.tx * k.tx + k.ty * k.ty;
      if (k.t2 > tmax) tmax = k.t2;
    }
    for (const k of cand) {
      if (!(k.t2 >= 0.16 * tmax)) continue;          // 真横から見た縁（奥行き方向に動く点）は使わない
      const d = Math.hypot(k.x - input.x, k.y - input.y);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (!best) return 0;
    return clamp(finite((input.dx * best.tx + input.dy * best.ty) / Math.max(best.t2, 400)), -0.6, 0.6);
  }

  // ---------- 糸 ----------
  function updateThread(m) {
    way[4].copy(m.tip); way[6].copy(m.clamp); way[7].copy(m.eye);
    let n = 0;
    upPts[n++].copy(way[0]);
    for (let i = 1; i < 7; i++) {   // 角は少し切り落として曲げる
      const a = way[i - 1], b = way[i], c = way[i + 1];
      const la = a.distanceTo(b) || 1e-9, lc = c.distanceTo(b) || 1e-9;
      upPts[n++].copy(b).addScaledVector(va.subVectors(a, b), Math.min(0.004, la * 0.3) / la);
      upPts[n++].copy(b).addScaledVector(va.subVectors(c, b), Math.min(0.004, lc * 0.3) / lc);
    }
    upPts[n++].copy(way[7]);
    tube.write(0, upPts, TH.r);
    // 針穴 →（縫い目があれば）いちばん新しい縫い目の穴。なければ短い糸の端。
    const e = m.eye;
    if (!S.cut && status.stitches > 0) {
      const p = S.pts[Math.min(status.stitches, S.pts.length) - 1];
      hole.set(NX + p[0], P.PLATE_Y + C.lift + 0.0008, p[1] - sew.zeta);
    } else hole.set(e.x + 0.001, Math.max(e.y - 0.008, P.PLATE_Y + 0.004), e.z + 0.012);
    for (let i = 0; i < 4; i++) lowPts[i].lerpVectors(e, hole, i / 3);
    tube.write(1, lowPts, TH.r);
  }

  // ---------- 光る・揺れる（次の操作部だけ）----------
  const glowCol = new THREE.Color(0xffc27a);
  function glow(part, t) {
    const k = 0.16 + 0.12 * Math.sin(t * TAU * 1.2);   // 1.2 Hz のゆっくりした明滅
    mats.wheel.emissive.copy(glowCol).multiplyScalar(part === 'wheel' ? k : 0);
    mats.lever.emissive.copy(glowCol).multiplyScalar(part === 'lever' ? k : 0);
    mats.cover.emissive.copy(glowCol).multiplyScalar(part === 'cover' ? k : 0);
    cloth.mat.emissive.copy(glowCol).multiplyScalar(part === 'fabric' ? k * 0.8 : 0);
  }
  /** 2 秒止まったら小さく揺れる：2 Hz で 3 回 → 1 秒休み。±1 を返す。 */
  function idleShake(idle) {
    if (!(idle > 2)) return 0;
    const w = (idle - 2) % 2.5;
    return w < 1.5 ? Math.sin(w * TAU * 2) : 0;
  }

  // ---------- カバーが外れる ----------
  function coverPose(g, home, k, f) {
    if (k <= 0) { g.position.copy(home); g.rotation.set(0, 0, 0); g.scale.setScalar(1); return; }
    g.position.set(home.x + f.side * k, home.y + f.hop * Math.sin(Math.PI * Math.min(1, k * 1.15)) - f.drop * k * k, home.z + 0.02 * smooth(k * 6) + f.out * k);
    g.rotation.set(f.rot * k * k, 0, f.roll * k);
    g.scale.setScalar(Math.max(0.001, 1 - smooth((k - 0.72) / 0.28)));
  }
  const FALL_ARM = { hop: 0.06, drop: 0.17, out: 0.30, rot: -1.35, roll: -0.25, side: -0.03 };   // 飾りの面を上にして倒れる
  const FALL_BED = { hop: 0.08, drop: 0.02, out: 0.26, rot: -0.9, roll: 0.3, side: 0.05 };

  // ---------- 完成 → 飾る ----------
  function finish(dt) {
    const t0 = S.finT; S.finT += dt; const t = S.finT;
    const cross = (x) => t0 < x && t >= x;
    // 押さえ金が上がる
    S.footDown = 1 - smooth((t - 0.05) / LV.time);
    if (cross(0.28)) onCue('clunk', { gain: 0.6 });
    if (cross(0.30)) S.cut = true;                                  // 糸が切れる
    // 布を手前へ引き出しながら平らに持ち上げる
    if (cross(0.35)) onCue('slide');
    if (t >= 0.35 && t < 0.85) {
      const k = smooth((t - 0.35) / 0.5);
      cloth.u.uDrape.value = 1 - k;
      cloth.group.position.set(NX, C.tableY + clothKit.height * k + 0.02 * k, fly.z0 + (Math.max(fly.z0, 0.11) - fly.z0) * k);
    }
    if (cross(0.85)) {
      onCue('whoosh');
      cloth.u.uDrape.value = 0;
      const idx = slots.length ? status.round % slots.length : 0, slot = slots[idx];
      fly.from.copy(cloth.group.position); fly.fromQ.copy(cloth.group.quaternion);
      if (slot) {
        root.updateMatrixWorld(true);
        fly.to.copy(slot.position).applyMatrix4(m4.copy(root.matrixWorld).invert());
        fly.toQ.copy(slot.quaternion).multiply(q4.setFromAxisAngle(va.set(1, 0, 0), HALF));   // 先端を上にして下げる
        // 幅いっぱいに見せ、長さの余りはひもの裏へ二つ折りにする（模様が大きく見える）
        fly.toS = clamp(finite(slot.width / C.w, 0.5), 0.2, 1.5);
        fly.foldAt = clamp(finite(slot.height / fly.toS, C.len), C.len * 0.5, C.len);
      } else { fly.to.set(0.4, 0.6, -0.45); fly.toQ.setFromAxisAngle(va.set(1, 0, 0), HALF); fly.toS = 0.5; fly.foldAt = C.len; }
      cloth.u.uFoldAt.value = fly.foldAt;
    }
    if (t >= 0.85 && t < 2.45) {
      const k = smooth((t - 0.85) / 1.6), g = cloth.group;
      g.position.lerpVectors(fly.from, fly.to, k); g.position.y += Math.sin(k * Math.PI) * 0.30;
      g.quaternion.slerpQuaternions(fly.fromQ, fly.toQ, k);
      g.scale.setScalar(1 + (fly.toS - 1) * k);
      cloth.u.uFlutter.value = Math.sin(k * Math.PI) * 0.9 + 0.25 * k;   // ふわっ
      cloth.u.uFold.value = fly.foldAt < C.len ? smooth((k - 0.3) / 0.6) : 0;
    }
    if (cross(2.45)) {
      onCue('sparkle');
      const idx = slots.length ? status.round % slots.length : 0;
      cloth.group.position.copy(fly.to); cloth.group.quaternion.copy(fly.toQ); cloth.group.scale.setScalar(fly.toS);
      cloth.u.uFold.value = fly.foldAt < C.len ? 1 : 0;
      const old = hung.find((h) => h.slot === idx);
      if (old) { clothKit.dispose(old.cloth); hung.splice(hung.indexOf(old), 1); }
      cloth.proxy.removeFromParent();
      cloth.mat.emissive.setScalar(0);
      hung.push({ cloth, slot: idx });
      S.settle = 1; S.sparkT = 0;
      sparkC.copy(fly.to); sparkC.y -= fly.foldAt * fly.toS * 0.5; sparkC.z += 0.03;
    }
    if (t >= 3.9) nextRound();
  }

  function updateHung(dt) {
    if (S.settle > 0 && hung.length) {   // 飾られた布がゆれて落ち着く
      S.settle = Math.max(0, S.settle - dt / 1.1);
      hung[hung.length - 1].cloth.u.uFlutter.value = 0.25 * S.settle * S.settle;
    }
    if (S.sparkT >= 0) {
      S.sparkT += dt;
      const T = S.sparkT, sw = (slots[0] && slots[0].width) || 0.15, sh = (slots[0] && slots[0].height) || 0.22;
      for (let i = 0; i < SPARKS; i++) {
        const p = sparkSeed[i], k = clamp((T - p.d) / 0.9, 0, 1), s = Math.sin(k * Math.PI) * p.s;
        q4.setFromAxisAngle(zAxis, T * 2.5 + i);
        m4.compose(va.set(sparkC.x + p.x * sw * 0.95, sparkC.y + p.y * sh * 0.75 + 0.03 * k, sparkC.z), q4, s4.setScalar(Math.max(s, 1e-5)));
        sparks.setMatrixAt(i, m4);
      }
      sparks.instanceMatrix.needsUpdate = true;
      sparks.visible = T < 1.4;
      if (T >= 1.4) S.sparkT = -1;
    }
  }

  function startCloth(round) {
    status.pattern = PATTERNS[round % PATTERNS.length];
    S.pts = patternPoints(status.pattern);
    cloth = clothKit.make(lookOf(round));
    root.add(cloth.group);
    cloth.group.position.set(NX, C.tableY, C.startZ);
    mats.thread.color.set(cloth.look.thread);
  }
  function nextRound() {
    status.round += 1;
    // θ は単調増加のまま、次の縫い始めもここ（φ ≡ π/2）から
    S.thetaR = S.theta; S.last = S.theta; S.omega = 0; S.auto = 0; S.sewing = false; S.cut = true;
    S.finT = 0; S.footDown = 0; S.popT = 0;
    status.stitches = 0; status.progress = 0; status.busy = false; status.crankSpeed = 0;
    startCloth(status.round);
    setStage('fabric');
  }

  // ---------- 1 フレーム ----------
  function update(dt, input) {
    dt = clamp(finite(dt), 0, 0.05);
    time.value = finite(input.time) % 600;
    const st = status.stage, part = input.part;
    if (input.pressed) S.grab = { x: input.x, y: input.y };
    const drag = S.grab && (input.down || input.released) ? Math.hypot(input.x - S.grab.x, input.y - S.grab.y) : 0;
    S.wiggle = Math.max(0, S.wiggle - dt);

    if (!status.busy && input.pressed && part) {
      if (part === activePart()) onCue('tap');
      else { if (part === 'wheel') S.wiggle = 0.4; onCue('nudge'); }   // 今は動かない → コトッ、すぐヒント
    }

    // --- 布を差し込む ---
    if (!status.busy && st === 'fabric' && part === 'fabric' && (input.tapped || drag > 20)) { S.fabT = 1e-4; status.busy = true; onCue('slide'); }
    if (S.fabT > 0) {
      S.fabT = Math.min(1, S.fabT + dt / 0.7);
      cloth.group.position.set(NX, C.tableY, C.startZ + (-S.pts[0][1] - C.startZ) * smooth(S.fabT));
      cloth.group.rotation.y = 0; cloth.group.scale.setScalar(1);
      if (S.fabT >= 1) { S.fabT = 0; status.busy = false; setStage('foot'); }
    } else if (st === 'fabric' && S.popT < 1) {   // 新しい布がぽんと出る
      S.popT = Math.min(1, S.popT + dt / 0.35);
      const k = S.popT - 1; cloth.group.scale.setScalar(1 + 2.2 * k * k * k + 1.2 * k * k);
    }

    // --- 押さえ金を下ろす ---
    if (!status.busy && st === 'foot' && part === 'lever' && (input.tapped || drag > 16)) { S.footT = 1e-4; status.busy = true; }
    if (S.footT > 0) {
      S.footT = Math.min(1, S.footT + dt / LV.time);
      S.footDown = S.footT;
      if (S.footT >= 1) {
        S.footT = 0; status.busy = false; onCue('clunk');
        S.sewing = true; S.thetaR = S.theta; S.last = S.theta;
        S.kTarget = status.round === 0 && !status.coverOpen ? P.K_SEW1 : P.K_TOTAL;
        setStage(status.round === 0 && !status.coverOpen ? 'sew1' : 'sew2');
      }
    }

    // --- カバーを外す ---
    if (!status.busy && st === 'cover' && part === 'cover' && (input.tapped || drag > 16)) { S.coverT = 1e-4; status.busy = true; onCue('pop'); }
    if (S.coverT > 0) {
      const c0 = S.coverT; S.coverT += dt;
      if (c0 < 0.12 && S.coverT >= 0.12) onCue('pop');
      coverPose(machine.coverArm, machine.coverArmC, clamp(S.coverT / 0.8, 0, 1), FALL_ARM);
      coverPose(machine.coverBed, machine.coverBedC, clamp((S.coverT - 0.12) / 0.8, 0, 1), FALL_BED);
      if (S.coverT >= 0.92) {
        S.coverT = 0; machine.coverArm.visible = false; machine.coverBed.visible = false;
        status.coverOpen = true; status.busy = false; S.kTarget = P.K_TOTAL;
        setStage('sew2');
      }
    }

    // --- 手回し車 ---
    const sewing = (st === 'sew1' || st === 'sew2') && !status.busy;
    if (sewing) {
      if (part === 'wheel' && input.down) {
        const d = wheelDrag(input);
        if (d > 0) { S.theta += d; S.omega = 0.6 * S.omega + 0.4 * Math.min(MAX_SPEED, d / Math.max(dt, 1 / 120)); }
        else if (d < -0.01) S.wiggle = Math.max(S.wiggle, 0.2);    // 逆回しはラチェットで止まる（少し揺れるだけ）
        else S.omega *= Math.exp(-8 * dt);
      } else {
        if (part === 'wheel' && input.tapped) S.auto = Math.min(2 * TAU, S.auto + TAU);   // タップ = 1 針（2 回転分までためる）
        S.omega = Math.min(MAX_SPEED, S.omega * Math.exp(-1.5 * dt));                     // はずみ車
        if (S.omega < 0.05) S.omega = 0;
        S.theta += S.omega * dt;
      }
      if (S.auto > 0) { const a = Math.min(S.auto, TAP_SPEED * dt); S.auto -= a; S.theta += a; }
      const end = S.thetaR + TAU * S.kTarget;
      if (!(S.theta < end)) { S.theta = end; S.omega = 0; S.auto = 0; }
    }
    if (!Number.isFinite(S.theta)) S.theta = S.last;
    status.crankSpeed = sewing ? clamp((S.theta - S.last) / Math.max(dt, 1e-3), 0, MAX_SPEED * 1.5) : 0;

    // --- 機構：θ からすべて決まる ---
    const active = status.busy ? null : activePart();
    const shake = idleShake(input.idle);
    let th = S.theta;
    if (S.wiggle > 0) th += 0.035 * Math.sin(S.wiggle * 30) * (S.wiggle / 0.4);
    if (active === 'wheel' && S.omega === 0 && S.auto === 0) th += 0.05 * shake;
    sewState(S.sewing ? S.theta - S.thetaR : 0, S.pts, sew);
    const m = machine.pose(th, sew.x, sew.feedS);
    machine.setFoot(P.foot.lift * (1 - S.footDown), LV.up + (LV.down - LV.up) * smooth(S.footDown) + (active === 'lever' ? 0.05 * shake : 0));
    S.dial += (status.round * (TAU / 3) - S.dial) * (1 - Math.exp(-5 * dt));
    machine.dial.rotation.z = S.dial;
    if (!status.coverOpen && S.coverT === 0) {
      const dz = active === 'cover' ? 0.003 * shake : 0;
      machine.coverArm.position.z = machine.coverArmC.z + dz; machine.coverBed.position.z = machine.coverBedC.z + dz;
    }

    // --- 縫う：布の位置と縫い目の数も θ の関数 ---
    if (S.sewing && status.stage !== 'finish') {
      const before = status.stitches;
      cloth.group.position.set(NX, C.tableY, -sew.zeta);
      clothKit.lay(cloth, S.pts, sew.stitches);
      status.stitches = sew.stitches;
      status.progress = clamp(sew.stitches / P.K_TOTAL, 0, 1);
      if (sew.stitches > 0) S.cut = false;
      if (sew.stitches > before) onCue('needle', { pitch: status.progress });
      if (Math.floor(S.theta / (Math.PI / 4)) > Math.floor(S.last / (Math.PI / 4))) onCue('tick', { pitch: clamp(status.crankSpeed / MAX_SPEED, 0, 1) });
      if (Math.floor((S.theta - S.thetaR - HOOK_CATCH) / TAU) > Math.floor((S.last - S.thetaR - HOOK_CATCH) / TAU)) onCue('hook');
      if (sewing && S.theta >= S.thetaR + TAU * S.kTarget - 1e-9) {
        if (st === 'sew1') setStage('cover');
        else { S.sewing = false; S.finT = 1e-4; status.busy = true; fly.z0 = cloth.group.position.z; setStage('finish'); }
      }
    }
    S.last = S.theta;
    if (status.stage === 'fabric' && S.fabT === 0) cloth.group.rotation.y = active === 'fabric' ? 0.03 * shake : 0;

    if (status.stage === 'finish') finish(dt);
    updateHung(dt);
    updateThread(m);
    glow(active, time.value);
    refreshTargets();
    if (input.released) S.grab = null;
  }

  // ---------- ヒント（今やるべき操作）----------
  const hintObj = { part: null, position: V(), radius: 0.05, gesture: 'tap', path: [] };
  const circlePath = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return V(W.c[0] + 0.03, W.c[1] + W.knobArm * Math.cos(a), W.c[2] + W.knobArm * Math.sin(a)); });
  const fabricPath = [V(), V()];
  function getHint() {
    if (status.busy) return null;
    const p = activePart();
    if (!p) return null;
    hintObj.part = p; hintObj.path = []; hintObj.gesture = 'tap';
    if (p === 'fabric') {
      hintObj.position.set(NX, C.tableY + 0.004, cloth.group.position.z + C.len * 0.45); hintObj.radius = 0.07;
      fabricPath[0].copy(hintObj.position); fabricPath[1].set(NX, P.PLATE_Y + 0.01, 0.06); hintObj.path = fabricPath;
    } else if (p === 'lever') {
      machine.lever.updateWorldMatrix(true, false);
      hintObj.position.set(0, 0, LV.len).applyMatrix4(machine.lever.matrixWorld); hintObj.radius = 0.03;
    } else if (p === 'cover') { hintObj.position.set(0.02, 0.235, P.arm.z1 + 0.008); hintObj.radius = 0.08; }
    else { hintObj.position.set(W.c[0] + 0.03, W.c[1], W.c[2]); hintObj.radius = 0.085; hintObj.gesture = 'circle'; hintObj.path = circlePath; }
    return hintObj;
  }

  // ---------- 当たり判定の対象：今の操作部（と nudge 用の手回し車）だけ ----------
  const hitTargets = [];
  function refreshTargets() {
    hitTargets.length = 0;
    const p = status.busy ? null : activePart();
    if (p === 'lever') hitTargets.push(machine.hit.lever);
    if (p === 'cover' && !status.coverOpen) hitTargets.push(machine.hit.coverArm, machine.hit.coverBed);
    if (p === 'fabric' && cloth.proxy.parent) hitTargets.push(cloth.proxy);
    hitTargets.push(machine.hit.wheel);
  }

  function reset() {
    hung.forEach((h) => clothKit.dispose(h.cloth)); hung.length = 0;
    clothKit.dispose(cloth);
    Object.assign(status, { stage: 'fabric', round: 0, pattern: 'wave', stitches: 0, progress: 0, crankSpeed: 0, busy: false, coverOpen: false });
    Object.assign(S, { theta: HALF, thetaR: HALF, last: HALF, omega: 0, auto: 0, kTarget: P.K_SEW1, sewing: false, cut: true, fabT: 0, footT: 0, footDown: 0, coverT: 0, finT: 0, wiggle: 0, grab: null, popT: 1, dial: 0, sparkT: -1, settle: 0 });
    machine.coverArm.visible = true; machine.coverBed.visible = true;
    coverPose(machine.coverArm, machine.coverArmC, 0); coverPose(machine.coverBed, machine.coverBedC, 0);
    sparks.visible = false;
    startCloth(0);
    pose0();
  }
  function pose0() {
    sewState(0, S.pts, sew);
    const m = machine.pose(S.theta, sew.x, sew.feedS);
    machine.setFoot(P.foot.lift * (1 - S.footDown), LV.up + (LV.down - LV.up) * S.footDown);
    machine.dial.rotation.z = S.dial;
    updateThread(m);
    refreshTargets();
  }

  cloth.group.position.set(NX, C.tableY, C.startZ);
  pose0();

  const hero = {
    root, hitTargets, status, getHint, update, reset,
    onContextLost() {},
    onContextRestored() {
      // 自作のテクスチャと、毎フレーム書き換える頂点・インスタンス行列を送り直す。ゲームの状態はそのまま。
      if (atlas) atlas.needsUpdate = true;
      tube.geometry.attributes.position.needsUpdate = true; tube.geometry.attributes.normal.needsUpdate = true;
      sparks.instanceMatrix.needsUpdate = true;
      cloth.stitches.instanceMatrix.needsUpdate = true;
      hung.forEach((h) => { h.cloth.stitches.instanceMatrix.needsUpdate = true; });
    },
    dispose() {
      hung.forEach((h) => clothKit.dispose(h.cloth)); hung.length = 0;
      clothKit.dispose(cloth);
      own.inst.forEach((i) => i.dispose());
      own.geos.forEach((g) => g.dispose());
      own.mats.forEach((mt) => mt.dispose());
      own.texs.forEach((t) => t.dispose());   // opts.textures はシェルの持ち物なので触らない
      root.removeFromParent();
    },
  };
  if (opts.debug && typeof window !== 'undefined') window.__heroDebug = { hero, S, P, machine, sew };
  return hero;
}
