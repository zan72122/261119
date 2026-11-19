/* 自動生成: tools/build-hero.mjs (app/hero/hero.js から)。直接編集しない。 */
var HeroModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // app/hero/hero.js
  var hero_exports = {};
  __export(hero_exports, {
    createHero: () => createHero
  });

  // app/hero/params.js
  var STAGES = ["pull", "rewind", "suck", "unlock", "dump", "finale"];
  function makeParams(layout) {
    const A = layout;
    const bx = A.bodyCenter[0], bz = A.bodyCenter[2];
    const body = {
      x0: bx - 0.21,
      x1: bx + 0.21,
      // 長手 0.42
      y0: 0.035,
      y1: 0.255,
      // 床からの高さ
      zBack: bz - 0.135,
      zFront: bz + 0.135,
      // 奥行 0.27
      rTop: 0.04,
      rBottom: 0.045,
      // 輪郭の角の丸み
      bevel: 0.012,
      frontBevel: 5e-3,
      bayDepth: 0.062,
      // リール室（前面の窓の奥行。浅いほど上の壁に隠れにくい）
      wheelR: 0.042,
      wheelW: 0.022,
      wheelX: bx - 0.15,
      casterR: 0.0175
    };
    body.zBay = body.zFront - body.bayDepth;
    const bay = { x0: body.x1 - 0.188, x1: body.x1 - 0.012, y0: 0.05, y1: 0.243, r: 0.028 };
    const reel = {
      cx: body.x1 - 0.102,
      cy: 0.135,
      // 軸の位置
      r0: 0.02,
      // 芯の半径
      w: 0.016,
      // 巻き幅
      d: 8e-3,
      // コードの太さ（子どもに見えるよう太め）
      flangeR: 0.064,
      // 奥のつば
      flangeT: 4e-3,
      spokes: 4,
      spokeIn: 0.034,
      spokeOut: 0.058,
      spokeW: 0.014,
      // 手前のつばの窓（巻いたコードが見える）
      axleR: 7e-3
    };
    const zl = {};
    zl.panel = body.zBay + 2e-3;
    zl.rear0 = body.zBay + 7e-3;
    zl.wind0 = zl.rear0 + reel.flangeT;
    zl.wind1 = zl.wind0 + reel.w;
    zl.windC = (zl.wind0 + zl.wind1) / 2;
    zl.ratchet0 = zl.wind1;
    zl.ratchetT = 7e-3;
    zl.spring0 = zl.ratchet0 + zl.ratchetT + 2e-3;
    zl.pane = body.zFront - 8e-3;
    reel.z = zl;
    const ratchet = {
      Z: 12,
      // 歯数
      swing: 0.25,
      // 爪の振れ（rad）
      rRoot: 0.067,
      // 歯底の半径
      pivot: [reel.cx + 0.034, reel.cy + 0.091],
      // 爪の支点（XY）
      tipArm: 0.046,
      // 支点→爪先
      tailArm: 0.023,
      // 支点→押される側（てこ比 tipArm/tailArm = 2.0）
      thick: 7e-3
    };
    const spring = { n0: 4, ri: 8e-3, ro: 0.03, width: 0.01, thick: 13e-4, segments: 168, phase: 0.6 };
    const plugRest = [A.plugRest[0], 0.024, A.plugRest[2]];
    const cord = {
      exit: [body.x1 + 4e-3, 0.08, zl.windC],
      // 本体から出る穴（リールの面と同じ Z）
      radius: reel.d / 2,
      segments: 48,
      sides: 6,
      inside: 3,
      // 節数・断面・本体内の節
      reach: 0.72,
      // 穴からプラグまでの最大距離（引ける範囲のどの辺でも伸びきる長さ）
      areaMin: [A.plugPullArea.min[0], A.plugPullArea.min[2]],
      areaMax: [A.plugPullArea.max[0] + 0.05, A.plugPullArea.max[2]],
      follow: 20,
      // 指への追従（1/s）
      hintDir: [0.68, 0.733]
      // ヒントの引く向き（XZ）
    };
    const plug = {
      len: 0.066,
      h: 0.038,
      w: 0.046,
      prongLen: 0.022,
      prongW: 7e-3,
      prongGap: 0.019,
      // おもちゃらしく大きめ
      y: plugRest[1],
      rest: plugRest,
      hit: 0.14
    };
    cord.rest = Math.hypot(plugRest[0] - cord.exit[0], plugRest[1] - cord.exit[1], plugRest[2] - cord.exit[2]);
    reel.Lmax = cord.reach - cord.rest;
    const button = {
      x: ratchet.pivot[0] - 2e-3,
      z: zl.ratchet0 + ratchet.thick / 2 - 0.0225,
      // 上面の中心
      radius: 0.045,
      height: 0.02,
      stroke: 0.012,
      rodR: 4e-3,
      press: 26
      // 押し込みの速さ（1/s）
    };
    const rewind = { vmax: 0.9, slow: 0.08, floor: 0.22, done: 3e-3 };
    const bin = {
      dock: [A.binDock[0], body.y1 + 0.015, A.binDock[2]],
      // 容器の底の中心（受け台の上）
      radius: 0.06,
      height: 0.14,
      collarR: 0.064,
      collarH: 0.03,
      capH: 0.022,
      handleR: 0.03,
      inletY: 0.095,
      // 吸込み口の高さ（容器の底から）
      lift: 0.02,
      // ロック解除で浮く量
      flapMaxTilt: 1.25,
      // 空けるときの傾き α の最大
      flapStart: 0.6,
      flapGain: 1.6,
      flapMax: 1.6,
      // 底ぶた角 = clamp((α−0.6)·1.6, 0, 1.6)
      hit: [0.17, 0.2, 0.17],
      follow: 14
    };
    const latch = {
      x: bin.dock[0],
      shaftY: bin.dock[1] + 0.019,
      shaftZ: body.zFront - 0.019,
      e: 0.012,
      // 偏心量
      phiMax: Math.PI / 2,
      // レバーの振れ
      releaseAt: 0.8,
      // x ≥ 0.8·e で解除
      camR: 0.017,
      shaftR: 4e-3,
      yokeT: 4e-3,
      camLen: 0.03,
      armX: 0.036,
      armZ: 0.034,
      paddleW: 0.094,
      paddleH: 0.072,
      paddleT: 0.014,
      // 取っ手は枠（開いても下の機構が見える）
      turnTime: 0.5,
      hit: [0.13, 0.12, 0.11]
    };
    latch.pinTip = bin.dock[2] + bin.collarR + 5e-3 - 0.01;
    const riser = {
      radius: 0.021,
      x: body.x0 - 0.028,
      y: A.hosePort[1],
      z: A.hosePort[2],
      topY: bin.dock[1] + bin.inletY,
      endX: bin.dock[0] - bin.radius - 2e-3,
      bend: 0.02
    };
    riser.hoseEnd = [riser.x - 0.027, riser.y, riser.z];
    const nozzle = {
      rest: [A.nozzleRest[0], 0, A.nozzleRest[2]],
      width: 0.26,
      depth: 0.115,
      height: 0.078,
      plateT: 0.012,
      areaMin: [A.scrapArea.min[0] - 0.02, A.scrapArea.min[2] + 0.02],
      areaMax: [A.scrapArea.max[0] - 0.05, A.scrapArea.max[2] + 0.03],
      minPortDist: 0.34,
      // ホース口に近づきすぎない
      follow: 14,
      drift: 4.5,
      yawFollow: 9,
      wandBase: [0, 0.058, -0.036],
      wandTop: [0, 0.2, -0.165],
      wandR: 0.02,
      wheelR: 0.02,
      wheelW: 0.012,
      wheelX: 0.137,
      wheelZ: -0.046,
      // 車輪：回転角 = 移動距離 / 半径
      gearBox: 0.042,
      // 歯車の部屋（+X 端、透明な窓つき）の長さ
      hit: [0.32, 0.24, 0.27]
    };
    const brush = {
      axisY: 0.034,
      axisZ: 0.02,
      coreR: 0.013,
      tipR: 0.032,
      length: 0.19,
      rows: 4,
      perRow: 16,
      turns: 1,
      // 毛束 4列×16、らせん 1 周
      tuftR: 55e-4,
      z1: 10,
      z2: 25,
      module: 2e-3,
      gearW: 8e-3,
      motorDir: -1.4,
      // ローラー軸から見たモーター軸の向き（+Y から +Z へ測る角。後ろ上）
      idle: 6,
      perSpeed: 60,
      maxOmega: 60,
      spin: 5
      // ω_motor = idle + perSpeed·|v|（上限つき）、追従 1/s
    };
    brush.centerDist = brush.module * (brush.z1 + brush.z2) / 2;
    const suction = {
      radius: 0.085,
      halfWidth: 0.1,
      // 吸い口（線分）からの捕獲半径
      pull: 0.2,
      // 捕獲してから吸い口に届くまでの時間
      vAir: 1.5,
      // 管の中の速さ（m/s）
      binTime: 0.55
      // 容器の中で渦を巻いて積もるまで
    };
    const hose = { length: 1.2, rings: 14, ringR: 0.027, ringLen: 0.034, tubeR: 0.0195, tubeSeg: 30, tubeSides: 8, k0: 0.2, k1: 0.16, samples: 32 };
    const scraps = {
      count: 36,
      clusters: 6,
      clusterR: 0.085,
      size: [0.03, 0.046],
      areaMin: [A.scrapArea.min[0] + 0.12, A.scrapArea.min[2] + 0.08],
      areaMax: [A.scrapArea.max[0] - 0.17, A.scrapArea.max[2] - 0.06],
      uvHalf: 0.011,
      floorY: 7e-3
    };
    const can = {
      pos: [A.trashCan[0], 0, A.trashCan[2]],
      radius: A.trashCanRadius,
      height: A.trashCanHeight,
      taper: 0.84,
      wall: 8e-3,
      lidMax: 1.4,
      lidFar: 0.45,
      lidNear: 0.15
    };
    const dump = {
      center: [can.pos[0] - 0.045, A.dumpPoint[1] + 0.01, can.pos[2]],
      tiltFar: 0.28,
      tiltNear: 0.1,
      // 中心までの距離 → 傾き α
      flow: 34,
      // 底ぶた全開での流量（枚/秒）
      gravity: 3,
      // 落下 p = p0 + v0·t − ½·g·t²
      viewDir: [0.03, 0.397, 0.917],
      // 容器を動かす面を決めるための見る向き
      xMin: 0.15,
      xMax: 1.12,
      yMax: 0.8,
      homeX: body.x1 + 0.05
      // これより本体側で離すと受け台へ戻る
    };
    const finale = { duration: 4.6, burstStart: 0.25, burstSpread: 0.7, flight: [1.05, 1.5], stars: 44, hop: 0.035, binBack: 1.3, lidClose: 3.3 };
    const colors = {
      pink: null,
      pinkDeep: "#f58ab8",
      white: "#fff7f2",
      cream: "#fff1dc",
      yellow: "#ffd24a",
      orange: "#ffa23e",
      sky: "#8fd3ff",
      blue: "#5aa9f0",
      mint: "#86dcc0",
      mintDeep: "#4fc3a1",
      lilac: "#c3a8f0",
      purple: "#8a63d2",
      red: "#ff6b7d",
      dark: "#4b4460",
      eye: "#3a3050",
      clear: "#d8f1ff",
      glow: "#ffd36b"
    };
    const hint = { hz: 1.5, glow: 0.35, scale: 0.035, tilt: 0.05 };
    const views = {
      pull: { position: [0.84, 0.84, 1.3], target: [0.78, 0.08, 0.13], fov: 45 },
      rewind: { position: [0.74, 0.98, 1.36], target: [0.7, 0.12, 0.12], fov: 45 },
      // 組み込みで少し引いた：伸びきったプラグも画面に入る
      unlock: { position: [0.3, 0.74, 0.72], target: [0.27, 0.25, -0.08], fov: 45 },
      dump: { position: [0.64, 0.96, 1.28], target: [0.6, 0.33, -0.25], fov: 45 }
    };
    return { body, bay, reel, ratchet, spring, cord, plug, button, rewind, bin, latch, riser, nozzle, brush, suction, hose, scraps, can, dump, finale, colors, hint, views, texAvg: "#fdaccc" };
  }

  // app/hero/mech.js
  var mech_exports = {};
  __export(mech_exports, {
    TAU: () => TAU,
    ballisticV0: () => ballisticV0,
    bezierSample: () => bezierSample,
    buttonFreeStroke: () => buttonFreeStroke,
    camDrop: () => camDrop,
    camPin: () => camPin,
    clamp: () => clamp,
    damp: () => damp,
    finite: () => finite,
    flapAngle: () => flapAngle,
    frac: () => frac,
    gearPhase: () => gearPhase,
    lerp: () => lerp,
    lidAngle: () => lidAngle,
    pawlAngleFromButton: () => pawlAngleFromButton,
    pawlAngleFromRatchet: () => pawlAngleFromRatchet,
    pawlRestAngle: () => pawlRestAngle,
    pawlTip: () => pawlTip,
    polyAt: () => polyAt,
    polyLengths: () => polyLengths,
    ratchetIndex: () => ratchetIndex,
    ratchetProfile: () => ratchetProfile,
    ratchetTipRadius: () => ratchetTipRadius,
    reelAngle: () => reelAngle,
    reelRadius: () => reelRadius,
    reelTangentAngle: () => reelTangentAngle,
    rewindSpeed: () => rewindSpeed,
    rnd: () => rnd,
    smoothstep: () => smoothstep,
    springRadius: () => springRadius,
    springTotalAngle: () => springTotalAngle
  });
  var TAU = Math.PI * 2;
  var clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  var lerp = (a, b, t) => a + (b - a) * t;
  var frac = (x) => x - Math.floor(x);
  function smoothstep(a, b, x) {
    if (a === b) return x < a ? 0 : 1;
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  var damp = (rate, dt) => 1 - Math.exp(-rate * dt);
  var finite = (x, fallback) => Number.isFinite(x) ? x : fallback;
  function rnd(i, k) {
    const x = Math.sin(i * 127.1 + k * 311.7 + 0.37) * 43758.5453;
    return x - Math.floor(x);
  }
  function reelRadius(reel, Lw) {
    return Math.sqrt(reel.r0 * reel.r0 + Math.max(0, Lw) * reel.d * reel.d / reel.w);
  }
  function reelAngle(reel, L) {
    const l = clamp(L, 0, reel.Lmax);
    return 2 * reel.w / (reel.d * reel.d) * (reelRadius(reel, reel.Lmax) - reelRadius(reel, reel.Lmax - l));
  }
  function reelTangentAngle(ex, ey, r) {
    const dist = Math.hypot(ex, ey);
    const a = Math.atan2(ey, ex);
    return a - Math.acos(clamp(r / Math.max(dist, 1e-6), -1, 1));
  }
  function pawlRestAngle(reel, ratchet) {
    const px = ratchet.pivot[0] - reel.cx, py = ratchet.pivot[1] - reel.cy;
    const D = Math.hypot(px, py), a = ratchet.tipArm, r = ratchet.rRoot;
    const cosA = clamp((a * a + D * D - r * r) / (2 * a * D), -1, 1);
    return Math.atan2(-py, -px) - Math.acos(cosA);
  }
  function pawlTip(reel, ratchet, gamma0, delta, out) {
    const g = gamma0 - delta;
    out[0] = ratchet.pivot[0] - reel.cx + ratchet.tipArm * Math.cos(g);
    out[1] = ratchet.pivot[1] - reel.cy + ratchet.tipArm * Math.sin(g);
    return out;
  }
  function ratchetProfile(reel, ratchet, perTooth) {
    const g0 = pawlRestAngle(reel, ratchet);
    const pitch = TAU / ratchet.Z;
    const pts = [];
    const tip = [0, 0];
    for (let k = 0; k < ratchet.Z; k++) {
      for (let j = 0; j <= perTooth; j++) {
        const f = j / perTooth;
        pawlTip(reel, ratchet, g0, ratchet.swing * f, tip);
        const th = -(k + f) * pitch;
        const c = Math.cos(th), s = Math.sin(th);
        pts.push([tip[0] * c - tip[1] * s, tip[0] * s + tip[1] * c]);
      }
    }
    return pts;
  }
  function ratchetTipRadius(reel, ratchet) {
    const t = pawlTip(reel, ratchet, pawlRestAngle(reel, ratchet), ratchet.swing, [0, 0]);
    return Math.hypot(t[0], t[1]);
  }
  var ratchetIndex = (theta, Z) => Math.floor(theta * Z / TAU + 1e-9);
  var pawlAngleFromRatchet = (theta, ratchet) => ratchet.swing * frac(theta * ratchet.Z / TAU + 1e-9);
  var pawlAngleFromButton = (b, ratchet) => Math.asin(clamp(b / ratchet.tailArm, 0, 1));
  var buttonFreeStroke = (ratchet) => ratchet.tailArm * Math.sin(ratchet.swing);
  var springTotalAngle = (spring, psi) => TAU * spring.n0 + Math.max(0, psi);
  var springRadius = (spring, phi, total) => spring.ri + (spring.ro - spring.ri) * phi / Math.max(total, 1e-6);
  function rewindSpeed(rw, L, Lmax) {
    return rw.vmax * (0.35 + 0.65 * L / Lmax) * Math.max(smoothstep(0, rw.slow, L), rw.floor);
  }
  var camPin = (e, phi) => e * (1 - Math.cos(phi));
  var camDrop = (e, phi) => e * Math.sin(phi);
  function gearPhase(brush) {
    const o1 = brush.motorDir + Math.PI;
    const o2 = brush.motorDir - Math.PI / brush.z2;
    return { o1, o2, ratio: brush.z1 / brush.z2 };
  }
  var flapAngle = (bin, alpha) => clamp((alpha - bin.flapStart) * bin.flapGain, 0, bin.flapMax);
  var lidAngle = (can, dist) => can.lidMax * smoothstep(can.lidFar, can.lidNear, dist);
  function bezierSample(p, n, out, lens) {
    let len = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      const x = a * p[0] + b * p[3] + c * p[6] + d * p[9];
      const y = a * p[1] + b * p[4] + c * p[7] + d * p[10];
      const z = a * p[2] + b * p[5] + c * p[8] + d * p[11];
      if (i > 0) len += Math.hypot(x - out[i * 3 - 3], y - out[i * 3 - 2], z - out[i * 3 - 1]);
      out[i * 3] = x;
      out[i * 3 + 1] = y;
      out[i * 3 + 2] = z;
      if (lens) lens[i] = len;
    }
    return len;
  }
  function polyAt(pts, lens, n, s, out) {
    const total = lens[n];
    const q = clamp(s, 0, total);
    let i = 0;
    while (i < n - 1 && lens[i + 1] < q) i++;
    const seg = Math.max(lens[i + 1] - lens[i], 1e-9);
    const t = clamp((q - lens[i]) / seg, 0, 1);
    out[0] = lerp(pts[i * 3], pts[i * 3 + 3], t);
    out[1] = lerp(pts[i * 3 + 1], pts[i * 3 + 4], t);
    out[2] = lerp(pts[i * 3 + 2], pts[i * 3 + 5], t);
    return i;
  }
  function polyLengths(pts, n, lens) {
    lens[0] = 0;
    for (let i = 1; i <= n; i++) lens[i] = lens[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
    return lens[n];
  }
  function ballisticV0(p0, p1, T, g, out) {
    const t = Math.max(T, 1e-3);
    out[0] = (p1[0] - p0[0]) / t;
    out[1] = (p1[1] - p0[1]) / t + 0.5 * g * t;
    out[2] = (p1[2] - p0[2]) / t;
    return out;
  }

  // app/hero/geom.js
  function makeGeom(THREE, addons, texAvgHex) {
    const { mergeGeometries, toCreasedNormals, RoundedBoxGeometry } = addons;
    const avg = new THREE.Color(texAvgHex);
    const _c = new THREE.Color();
    const KEEP = ["position", "normal", "uv", "color"];
    function paint(geo, hex) {
      let g = geo;
      if (g.index) {
        g = geo.toNonIndexed();
        geo.dispose();
      }
      const n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
      g.morphAttributes = {};
      g.clearGroups();
      let r = 1, gg = 1, b = 1;
      if (hex) {
        _c.set(hex);
        r = _c.r / Math.max(avg.r, 0.05);
        gg = _c.g / Math.max(avg.g, 0.05);
        b = _c.b / Math.max(avg.b, 0.05);
      }
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = r;
        arr[i * 3 + 1] = gg;
        arr[i * 3 + 2] = b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      return g;
    }
    function plain(geo) {
      let g = geo;
      if (g.index) {
        g = geo.toNonIndexed();
        geo.dispose();
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      g.clearGroups();
      return g;
    }
    function sideExtrude(ptsZY, total, bevel, holeZY) {
      const s = polyShape(ptsZY.map((p) => [-p[0], p[1]]));
      if (holeZY) {
        const h = new THREE.Path();
        holeZY.forEach((p, i) => i ? h.lineTo(-p[0], p[1]) : h.moveTo(-p[0], p[1]));
        h.closePath();
        s.holes.push(h);
      }
      const g = extrude(s, total, bevel, 6);
      g.rotateY(Math.PI / 2);
      return g;
    }
    const _basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    const axisXfromZ = (g) => {
      g.applyMatrix4(_basis);
      return g;
    };
    const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);
    function aim(g, dir, pos) {
      _q.setFromUnitVectors(_up, dir);
      _m.compose(pos, _q, _one);
      g.applyMatrix4(_m);
      return g;
    }
    function tint(hex, out) {
      _c.set(hex);
      return out.setRGB(_c.r / Math.max(avg.r, 0.05), _c.g / Math.max(avg.g, 0.05), _c.b / Math.max(avg.b, 0.05));
    }
    function merge(list) {
      const src = list.filter(Boolean);
      const m = mergeGeometries(src, false);
      src.forEach((g) => g.dispose());
      if (!m) throw new Error("hero: mergeGeometries failed");
      m.clearGroups();
      return m;
    }
    const at = (g, x, y, z) => {
      g.translate(x || 0, y || 0, z || 0);
      return g;
    };
    const axisX = (g) => {
      g.rotateZ(-Math.PI / 2);
      return g;
    };
    const axisZ = (g) => {
      g.rotateX(Math.PI / 2);
      return g;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const rbox = (w, h, d, r, seg) => new RoundedBoxGeometry(w, h, d, seg || 3, Math.min(r, w / 2, h / 2, d / 2));
    const cyl = (r, h, seg, rTop) => new THREE.CylinderGeometry(rTop === void 0 ? r : rTop, r, h, seg || 20);
    const sphere = (r, w, h) => new THREE.SphereGeometry(r, w || 14, h || 10);
    function revolve(profile, seg, crease) {
      const n = profile.length;
      const pos = new Float32Array(seg * n * 3);
      for (let i = 0; i < seg; i++) {
        const a = i / seg * TAU, c = Math.cos(a), s = Math.sin(a);
        for (let j = 0; j < n; j++) {
          const k = (i * n + j) * 3;
          pos[k] = profile[j][0] * c;
          pos[k + 1] = profile[j][1];
          pos[k + 2] = profile[j][0] * s;
        }
      }
      const idx = [];
      for (let i = 0; i < seg; i++) {
        const i1 = (i + 1) % seg;
        for (let j = 0; j < n - 1; j++) {
          if (profile[j][0] < 1e-7 && profile[j + 1][0] < 1e-7) continue;
          const a = i * n + j, b = i * n + j + 1, c2 = i1 * n + j, d = i1 * n + j + 1;
          if (profile[j][0] >= 1e-7) idx.push(a, b, c2);
          if (profile[j + 1][0] >= 1e-7) idx.push(c2, b, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      const out = toCreasedNormals(g, crease === void 0 ? 0.7 : crease);
      if (out !== g) g.dispose();
      return out;
    }
    const ring = (rIn, rOut, h, seg) => revolve([[rIn, 0], [rOut, 0], [rOut, h], [rIn, h], [rIn, 0]], seg || 24, 0.5);
    const torus = (R, r, seg, tube2) => {
      const g = new THREE.TorusGeometry(R, r, tube2 || 6, seg || 20);
      g.rotateX(Math.PI / 2);
      return g;
    };
    function extrude(shape, total, bevel, curveSegments, uvScale) {
      const b = bevel || 0;
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(1e-4, total - 2 * b),
        steps: 1,
        curveSegments: curveSegments || 10,
        bevelEnabled: b > 0,
        bevelThickness: b,
        bevelSize: b,
        bevelOffset: -b,
        bevelSegments: b > 0 ? 3 : 0
      });
      if (b > 0) g.translate(0, 0, b);
      const uv = g.attributes.uv, s = uvScale || 2.5;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
      return g;
    }
    function roundRect(path, x0, y0, x1, y1, r) {
      const q = Array.isArray(r) ? r : [r, r, r, r];
      path.moveTo(x0 + q[0], y0);
      path.lineTo(x1 - q[1], y0);
      path.absarc(x1 - q[1], y0 + q[1], q[1], -Math.PI / 2, 0, false);
      path.lineTo(x1, y1 - q[2]);
      path.absarc(x1 - q[2], y1 - q[2], q[2], 0, Math.PI / 2, false);
      path.lineTo(x0 + q[3], y1);
      path.absarc(x0 + q[3], y1 - q[3], q[3], Math.PI / 2, Math.PI, false);
      path.lineTo(x0, y0 + q[0]);
      path.absarc(x0 + q[0], y0 + q[0], q[0], Math.PI, Math.PI * 1.5, false);
      return path;
    }
    function circlePath(x, y, r) {
      const p = new THREE.Path();
      p.absarc(x, y, r, 0, TAU, false);
      return p;
    }
    function polyShape(pts) {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.closePath();
      return s;
    }
    function sectorPath(r0, r1, a0, a1) {
      const p = new THREE.Path();
      p.moveTo(r0 * Math.cos(a0), r0 * Math.sin(a0));
      p.lineTo(r1 * Math.cos(a0), r1 * Math.sin(a0));
      p.absarc(0, 0, r1, a0, a1, false);
      p.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1));
      p.absarc(0, 0, r0, a1, a0, true);
      return p;
    }
    function gearShape(z, m, bore, holes) {
      const rp = m * z / 2, ra = rp + m, rf = rp - 1.25 * m, tau = TAU / z;
      const pts = [];
      for (let i = 0; i < z; i++) {
        const a = i * tau;
        for (const [r, da] of [[rf, -0.3], [rp, -0.25], [ra, -0.13], [ra, 0.13], [rp, 0.25], [rf, 0.3]]) pts.push([r * Math.cos(a + da * tau), r * Math.sin(a + da * tau)]);
      }
      const s = polyShape(pts);
      if (bore > 0) s.holes.push(circlePath(0, 0, bore));
      if (holes && holes.count > 0) for (let i = 0; i < holes.count; i++) {
        const a = i / holes.count * TAU + (holes.phase || 0);
        s.holes.push(circlePath(holes.at * Math.cos(a), holes.at * Math.sin(a), holes.r));
      }
      return s;
    }
    function surface(nu, nv, f) {
      const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2);
      const p = [0, 0, 0];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        f(i / nu, j / nv, p);
        const k = j * (nu + 1) + i;
        pos[k * 3] = p[0];
        pos[k * 3 + 1] = p[1];
        pos[k * 3 + 2] = p[2];
        uv[k * 2] = i / nu;
        uv[k * 2 + 1] = j / nv;
      }
      const idx = [];
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function tube(nSeg, nSides, radius, dynamic) {
      const nRing = nSeg + 1;
      const pos = new Float32Array(nRing * nSides * 3), nor = new Float32Array(nRing * nSides * 3), uv = new Float32Array(nRing * nSides * 2);
      const idx = [];
      for (let i = 0; i < nSeg; i++) for (let k = 0; k < nSides; k++) {
        const a = i * nSides + k, b = i * nSides + (k + 1) % nSides, c = a + nSides, d = b + nSides;
        idx.push(a, b, c, b, d, c);
      }
      for (let i = 0; i < nRing; i++) for (let k = 0; k < nSides; k++) {
        uv[(i * nSides + k) * 2] = k / nSides;
        uv[(i * nSides + k) * 2 + 1] = i / nSeg * 8;
      }
      const g = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
      if (dynamic) {
        pa.setUsage(THREE.DynamicDrawUsage);
        na.setUsage(THREE.DynamicDrawUsage);
      }
      g.setAttribute("position", pa);
      g.setAttribute("normal", na);
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const pts = new Float32Array(nRing * 3);
      let nx = 0, ny = 1, nz = 0;
      function update(r) {
        const rad = r || radius;
        nx = 0;
        ny = 1;
        nz = 0;
        for (let i = 0; i < nRing; i++) {
          const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(nRing - 1, i + 1) * 3;
          let tx = pts[i1] - pts[i0], ty = pts[i1 + 1] - pts[i0 + 1], tz = pts[i1 + 2] - pts[i0 + 2];
          let tl = Math.hypot(tx, ty, tz);
          if (!(tl > 1e-9)) {
            tx = 1;
            ty = 0;
            tz = 0;
            tl = 1;
          }
          tx /= tl;
          ty /= tl;
          tz /= tl;
          let d = nx * tx + ny * ty + nz * tz;
          nx -= d * tx;
          ny -= d * ty;
          nz -= d * tz;
          let nl = Math.hypot(nx, ny, nz);
          if (!(nl > 1e-5)) {
            if (Math.abs(ty) < 0.9) {
              nx = 0;
              ny = 1;
              nz = 0;
            } else {
              nx = 1;
              ny = 0;
              nz = 0;
            }
            d = nx * tx + ny * ty + nz * tz;
            nx -= d * tx;
            ny -= d * ty;
            nz -= d * tz;
            nl = Math.max(Math.hypot(nx, ny, nz), 1e-9);
          }
          nx /= nl;
          ny /= nl;
          nz /= nl;
          const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
          for (let k = 0; k < nSides; k++) {
            const a = k / nSides * TAU, c = Math.cos(a), s = Math.sin(a);
            const ox = c * nx + s * bx, oy = c * ny + s * by, oz = c * nz + s * bz;
            const q = (i * nSides + k) * 3;
            pos[q] = pts[i * 3] + ox * rad;
            pos[q + 1] = pts[i * 3 + 1] + oy * rad;
            pos[q + 2] = pts[i * 3 + 2] + oz * rad;
            nor[q] = ox;
            nor[q + 1] = oy;
            nor[q + 2] = oz;
          }
        }
        pa.needsUpdate = true;
        na.needsUpdate = true;
      }
      return { geometry: g, pts, update, nSeg };
    }
    function tubeAlong(points, nSides, radius) {
      const t = tube(points.length - 1, nSides, radius, false);
      points.forEach((p, i) => {
        t.pts[i * 3] = p[0];
        t.pts[i * 3 + 1] = p[1];
        t.pts[i * 3 + 2] = p[2];
      });
      t.update();
      return t.geometry;
    }
    function roundedPath(corners, r, perArc) {
      const out = [corners[0].slice()];
      const V = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = (v) => Math.hypot(v[0], v[1], v[2]);
      for (let i = 1; i < corners.length - 1; i++) {
        const a = corners[i - 1], b = corners[i], c = corners[i + 1];
        const u = V(b, a), w = V(b, c);
        const lu = L(u), lw = L(w);
        const k = clamp(r, 0, Math.min(lu, lw) * 0.49);
        const p0 = [b[0] + u[0] / lu * k, b[1] + u[1] / lu * k, b[2] + u[2] / lu * k];
        const p1 = [b[0] + w[0] / lw * k, b[1] + w[1] / lw * k, b[2] + w[2] / lw * k];
        for (let j = 0; j <= perArc; j++) {
          const t = j / perArc, s = 1 - t;
          out.push([s * s * p0[0] + 2 * s * t * b[0] + t * t * p1[0], s * s * p0[1] + 2 * s * t * b[1] + t * t * p1[1], s * s * p0[2] + 2 * s * t * b[2] + t * t * p1[2]]);
        }
      }
      out.push(corners[corners.length - 1].slice());
      return out;
    }
    function springRibbon(sp) {
      const N = sp.segments, rings = N + 1;
      const pos = new Float32Array(rings * 8 * 3), nor = new Float32Array(rings * 8 * 3);
      const idx = [];
      for (let i = 0; i < N; i++) {
        const a = i * 8, b = a + 8;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
        idx.push(a + 4, a + 5, b + 4, a + 5, b + 5, b + 4);
        idx.push(a + 6, b + 6, a + 7, a + 7, b + 6, b + 7);
      }
      const g = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
      pa.setUsage(THREE.DynamicDrawUsage);
      na.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("position", pa);
      g.setAttribute("normal", na);
      g.setIndex(idx);
      const hw = sp.width / 2, ht = sp.thick / 2;
      function update(total, phase) {
        for (let i = 0; i < rings; i++) {
          const phi = total * i / N;
          const r = sp.ri + (sp.ro - sp.ri) * i / N;
          const c = Math.cos(phase + phi), s = Math.sin(phase + phi);
          const k = i * 24;
          const set = (j, rr, z, nx, ny, nz) => {
            const q = k + j * 3;
            pos[q] = rr * c;
            pos[q + 1] = rr * s;
            pos[q + 2] = z;
            nor[q] = nx;
            nor[q + 1] = ny;
            nor[q + 2] = nz;
          };
          set(0, r + ht, -hw, c, s, 0);
          set(1, r + ht, hw, c, s, 0);
          set(2, r - ht, -hw, -c, -s, 0);
          set(3, r - ht, hw, -c, -s, 0);
          set(4, r - ht, hw, 0, 0, 1);
          set(5, r + ht, hw, 0, 0, 1);
          set(6, r - ht, -hw, 0, 0, -1);
          set(7, r + ht, -hw, 0, 0, -1);
        }
        pa.needsUpdate = true;
        na.needsUpdate = true;
      }
      return { geometry: g, update };
    }
    return { plain, sideExtrude, axisXfromZ, aim, paint, tint, merge, at, axisX, axisZ, box, rbox, cyl, sphere, revolve, ring, torus, extrude, roundRect, circlePath, polyShape, sectorPath, gearShape, surface, tube, tubeAlong, roundedPath, springRibbon };
  }

  // app/hero/parts-body.js
  function buildBody(ctx) {
    const { THREE, G, P, M, own, hitMat } = ctx;
    const { body: B, bay, reel: R, ratchet: RT, spring: SP, button: BT, bin: BN, latch: LT, riser: RS, cord: CD, colors: C } = P;
    const zl = R.z;
    const group = new THREE.Group();
    group.name = "vacuum-body";
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    function mesh(geo, mat, parent, cast) {
      const m = new THREE.Mesh(own(geo), mat);
      m.castShadow = !!cast;
      m.receiveShadow = true;
      (parent || group).add(m);
      return m;
    }
    const st = [];
    const outline = () => G.roundRect(new THREE.Shape(), B.x0, B.y0, B.x1, B.y1, [B.rBottom, B.rBottom, B.rTop, B.rTop]);
    const bayPath = (grow) => G.roundRect(new THREE.Path(), bay.x0 - grow, bay.y0 - grow, bay.x1 + grow, bay.y1 + grow, bay.r + grow);
    st.push(G.paint(G.at(G.extrude(outline(), B.zBay - B.zBack, B.bevel, 8), 0, 0, B.zBack), C.pink));
    const front = outline();
    front.holes.push(bayPath(0));
    st.push(G.paint(G.at(G.extrude(front, B.bayDepth + B.bevel + B.frontBevel, B.frontBevel, 8), 0, 0, B.zBay - B.bevel - B.frontBevel), C.pink));
    st.push(G.paint(G.at(G.extrude(G.roundRect(new THREE.Shape(), bay.x0, bay.y0, bay.x1, bay.y1, bay.r), 15e-4, 0, 6), 0, 0, zl.panel - 15e-4), C.cream));
    const axleLen = zl.spring0 + SP.width + 3e-3 - B.zBay;
    st.push(G.paint(G.at(G.axisZ(G.cyl(R.axleR, axleLen, 14)), R.cx, R.cy, B.zBay + axleLen / 2), C.white));
    st.push(G.paint(G.at(G.axisZ(G.cyl(SP.ri + 3e-3, 3e-3, 16)), R.cx, R.cy, B.zBay + axleLen), C.yellow));
    st.push(G.paint(G.at(G.axisZ(G.cyl(4e-3, zl.ratchet0 + RT.thick + 3e-3 - B.zBay, 10)), RT.pivot[0], RT.pivot[1], (B.zBay + zl.ratchet0 + RT.thick + 3e-3) / 2), C.white));
    st.push(G.paint(G.at(G.axisX(G.torus(CD.radius + 5e-3, 45e-4, 14)), CD.exit[0] + 1e-3, CD.exit[1], CD.exit[2]), C.purple));
    function wheel(x, z, side) {
      const w = B.wheelW;
      st.push(G.paint(G.at(G.axisZ(G.cyl(B.wheelR, w, 22)), x, B.wheelR, z), C.pinkDeep));
      st.push(G.paint(G.at(G.axisZ(G.cyl(B.wheelR * 0.62, 4e-3, 18)), x, B.wheelR, z + side * (w / 2 + 1e-3)), C.white));
      st.push(G.paint(G.at(G.axisZ(G.cyl(B.wheelR * 0.24, 4e-3, 12)), x, B.wheelR, z + side * (w / 2 + 4e-3)), C.yellow));
    }
    wheel(B.wheelX, B.zFront + B.wheelW / 2, 1);
    wheel(B.wheelX, B.zBack - B.wheelW / 2, -1);
    wheel(B.x1 - 0.08, B.zBack - B.wheelW / 2, -1);
    st.push(G.paint(G.at(G.sphere(B.casterR, 12, 8), B.x1 - 0.07, B.casterR, B.zFront - 0.05), C.pinkDeep));
    st.push(G.paint(G.at(G.cyl(8e-3, B.y0 - B.casterR + 6e-3, 8), B.x1 - 0.07, (B.y0 + B.casterR) / 2 + 3e-3, B.zFront - 0.05), C.white));
    st.push(G.paint(G.at(G.cyl(BN.collarR + 4e-3, BN.dock[1] - B.y1 + 4e-3, 28), BN.dock[0], (BN.dock[1] + B.y1 - 4e-3) / 2, BN.dock[2]), C.lilac));
    for (const s of [-1, 1]) {
      const h2 = LT.shaftY + 7e-3 - B.y1;
      st.push(G.paint(G.at(G.rbox(0.012, h2 + 4e-3, 0.02, 4e-3, 2), LT.x + s * (LT.armX + 0.014), B.y1 + h2 / 2 - 2e-3, LT.shaftZ), C.white));
    }
    const pinR = 45e-4;
    const guideZ = LT.pinTip + 0.016;
    st.push(G.paint(G.at(G.box(0.02, LT.shaftY - pinR - B.y1 + 2e-3, 8e-3), LT.x, (LT.shaftY - pinR + B.y1) / 2 - 1e-3, guideZ), C.white));
    st.push(G.paint(G.at(G.ring(BT.radius + 15e-4, BT.radius + 8e-3, 9e-3, 26), BT.x, B.y1 - 3e-3, BT.z), C.white));
    st.push(G.paint(G.at(G.axisX(G.ring(RS.radius - 1e-3, RS.radius + 6e-3, 0.016, 18)), RS.hoseEnd[0] + 0.016, RS.y, RS.z), C.lilac));
    st.push(G.paint(G.at(G.ring(RS.radius - 1e-3, RS.radius + 5e-3, 0.012, 18), RS.x, RS.y + RS.bend + 6e-3, RS.z), C.lilac));
    st.push(G.paint(G.at(G.axisX(G.ring(RS.radius - 1e-3, RS.radius + 5e-3, 8e-3, 18)), RS.endX, RS.topY, RS.z), C.lilac));
    for (const y of [RS.y + 0.055, B.y1 - 0.03]) st.push(G.paint(G.at(G.box(B.x0 - RS.x + 4e-3, 0.012, 0.02), (B.x0 + RS.x) / 2 + 6e-3, y, RS.z), C.white));
    const fx = bay.x0 - 0.062, fy = 0.172, fz = B.zFront + 5e-4;
    for (const s of [-1, 1]) {
      const eye = G.sphere(0.0155, 14, 10);
      eye.scale(1, 1.15, 0.3);
      st.push(G.paint(G.at(eye, fx + s * 0.026, fy, fz), C.eye));
      const hl = G.sphere(5e-3, 8, 6);
      hl.scale(1, 1, 0.4);
      st.push(G.paint(G.at(hl, fx + s * 0.026 + 5e-3, fy + 7e-3, fz + 5e-3), C.white));
      const ck = G.axisZ(G.cyl(95e-4, 2e-3, 12));
      st.push(G.paint(G.at(ck, fx + s * 0.047, fy - 0.026, fz + 5e-4), C.pinkDeep));
    }
    const smile = new THREE.TorusGeometry(0.014, 32e-4, 6, 12, Math.PI);
    smile.rotateZ(Math.PI);
    st.push(G.paint(G.at(smile, fx, fy - 0.022, fz + 1e-3), C.eye));
    const bodyMesh = mesh(G.merge(st), M.plastic, group, true);
    bodyMesh.name = "body-static";
    const pane = G.plain(G.at(G.extrude(G.roundRect(new THREE.Shape(), bay.x0 - 5e-3, bay.y0 - 5e-3, bay.x1 + 5e-3, bay.y1 + 5e-3, bay.r + 5e-3), 2e-3, 0, 6), 0, 0, zl.pane));
    const riserPts = G.roundedPath([
      RS.hoseEnd,
      [RS.x, RS.y, RS.z],
      [RS.x, RS.topY, RS.z],
      [RS.endX, RS.topY, RS.z]
    ], RS.bend, 5);
    const riserTube = G.plain(G.tubeAlong(riserPts, 12, RS.radius));
    const clearMesh = mesh(G.merge([pane, riserTube]), M.clear, group, false);
    clearMesh.name = "body-clear";
    clearMesh.renderOrder = 3;
    const rotor = new THREE.Group();
    rotor.position.set(R.cx, R.cy, 0);
    group.add(rotor);
    const rt = [];
    rt.push(G.paint(G.at(G.axisZ(G.cyl(R.flangeR, R.flangeT, 30)), 0, 0, zl.rear0 + R.flangeT / 2), C.sky));
    rt.push(G.paint(G.at(G.axisZ(G.cyl(R.r0 * 0.96, R.w, 20)), 0, 0, zl.windC), C.white));
    const wheelShape = G.polyShape(ratchetProfile(R, RT, 4));
    wheelShape.holes.push(G.circlePath(0, 0, R.axleR + 15e-4));
    const gap = R.spokeW / ((R.spokeIn + R.spokeOut) / 2);
    for (let i = 0; i < R.spokes; i++) {
      const a0 = i / R.spokes * TAU + gap / 2, a1 = (i + 1) / R.spokes * TAU - gap / 2;
      wheelShape.holes.push(G.sectorPath(R.spokeIn, R.spokeOut, a0, a1));
    }
    rt.push(G.paint(G.at(G.extrude(wheelShape, zl.ratchetT, 0, 8), 0, 0, zl.ratchet0), C.blue));
    rt.push(G.paint(G.at(G.axisZ(G.ring(R.axleR + 2e-3, R.spokeIn - 2e-3, 12e-4, 24)), 0, 0, zl.ratchet0 + zl.ratchetT + 12e-4), C.yellow));
    const pegLen = SP.width + 4e-3;
    rt.push(G.paint(G.at(G.axisZ(G.cyl(32e-4, pegLen, 8)), SP.ro * Math.cos(SP.phase), SP.ro * Math.sin(SP.phase), zl.spring0 + SP.width / 2), C.orange));
    const rotorMesh = mesh(G.merge(rt), M.plastic, rotor, false);
    rotorMesh.name = "reel";
    const turns = Math.max(1, Math.round(R.w / R.d));
    const prof = [];
    for (let j = 0; j <= turns * 6; j++) {
      const u = j / (turns * 6);
      prof.push([0.9 + 0.1 * Math.abs(Math.sin(Math.PI * u * turns)), (u - 0.5) * R.w]);
    }
    const winding = mesh(G.paint(G.axisZ(G.revolve(prof, 24, 1.2)), C.purple), M.plastic, rotor, false);
    winding.position.z = zl.windC;
    winding.name = "cord-winding";
    const ribbon = G.springRibbon(SP);
    const springMesh = mesh(ribbon.geometry, M.spring, group, false);
    springMesh.position.set(R.cx, R.cy, zl.spring0 + SP.width / 2);
    springMesh.frustumCulled = false;
    springMesh.name = "spring";
    let lastPsi = NaN;
    function setSpring(psi) {
      if (Math.abs(psi - lastPsi) < 1e-4) return;
      lastPsi = psi;
      ribbon.update(springTotalAngle(SP, psi), SP.phase);
    }
    const g0 = pawlRestAngle(R, RT);
    const tip = pawlTip(R, RT, g0, 0, [0, 0]);
    const tx = tip[0] + R.cx - RT.pivot[0], ty = tip[1] + R.cy - RT.pivot[1];
    const tl = Math.hypot(tx, ty), ux = tx / tl, uy = ty / tl, nx = -uy, ny = ux;
    const pw = [];
    const armShape = G.polyShape([[nx * 65e-4, ny * 65e-4], [-nx * 65e-4, -ny * 65e-4], [tx - nx * 1e-3 - ux * 4e-3, ty - ny * 1e-3 - uy * 4e-3], [tx, ty], [tx + nx * 45e-4 - ux * 6e-3, ty + ny * 45e-4 - uy * 6e-3]]);
    pw.push(G.paint(G.extrude(armShape, RT.thick, 0, 4), C.orange));
    pw.push(G.paint(G.at(G.box(RT.tailArm + 3e-3, 8e-3, RT.thick), (RT.tailArm + 3e-3) / 2, 0, RT.thick / 2), C.orange));
    pw.push(G.paint(G.at(G.axisZ(G.cyl(9e-3, RT.thick + 2e-3, 14)), 0, 0, RT.thick / 2), C.yellow));
    const pawl = mesh(G.merge(pw), M.plastic, group, false);
    pawl.position.set(RT.pivot[0], RT.pivot[1], zl.ratchet0);
    pawl.name = "pawl";
    const button = new THREE.Group();
    button.position.set(BT.x, B.y1, BT.z);
    group.add(button);
    const bt = [];
    const h = BT.height;
    bt.push(G.paint(G.revolve([[0, -4e-3], [BT.radius, -4e-3], [BT.radius, h - 7e-3], [BT.radius - 7e-3, h], [0, h]], 28, 0.9), C.yellow));
    const rodX = RT.pivot[0] + RT.tailArm * 0.86 - BT.x, rodZ = zl.ratchet0 + RT.thick / 2 - BT.z;
    const rodBottom = RT.pivot[1] + 4e-3 - B.y1;
    bt.push(G.paint(G.at(G.cyl(BT.rodR, -rodBottom - 0.01, 8), rodX, (rodBottom - 0.01) / 2, rodZ), C.orange));
    const buttonMesh = mesh(G.merge(bt), M.button, button, false);
    buttonMesh.name = "rewind-button";
    const buttonHit = new THREE.Mesh(own(G.box(0.13, 0.1, 0.13)), hitMat);
    buttonHit.position.y = 0.02;
    buttonHit.userData.control = "rewindButton";
    buttonHit.userData.enabled = false;
    button.add(buttonHit);
    const lever = new THREE.Group();
    lever.position.set(LT.x, LT.shaftY, LT.shaftZ);
    group.add(lever);
    const lv = [];
    lv.push(G.paint(G.axisX(G.cyl(LT.shaftR, 2 * (LT.armX + 0.022), 10)), C.white));
    lv.push(G.paint(G.at(G.axisX(G.cyl(LT.camR, LT.camLen, 22)), 0, 0, -LT.e), C.red));
    for (const s of [-1, 1]) lv.push(G.paint(G.at(G.rbox(8e-3, 0.012, LT.armZ + 0.012, 3e-3, 2), s * LT.armX, 0, LT.armZ / 2), C.orange));
    const gripY = 6e-3 - LT.paddleH;
    for (const s of [-1, 1]) lv.push(G.paint(G.at(G.rbox(0.012, -gripY + 8e-3, LT.paddleT, 4e-3, 2), s * LT.armX, gripY / 2 + 4e-3, LT.armZ + LT.paddleT / 2), C.yellow));
    lv.push(G.paint(G.at(G.rbox(LT.paddleW, 0.024, LT.paddleT + 6e-3, 7e-3, 3), 0, gripY + 8e-3, LT.armZ + LT.paddleT / 2), C.yellow));
    lv.push(G.paint(G.at(G.rbox(LT.paddleW * 0.5, 8e-3, 6e-3, 3e-3, 2), 0, gripY + 8e-3, LT.armZ + LT.paddleT + 4e-3), C.orange));
    const leverMesh = mesh(G.merge(lv), M.latch, lever, false);
    leverMesh.name = "latch-lever";
    const latchHit = new THREE.Mesh(own(G.box(LT.hit[0], LT.hit[1], LT.hit[2])), hitMat);
    latchHit.position.set(0, 6e-3 - LT.paddleH / 2, LT.armZ);
    latchHit.userData.control = "latch";
    latchHit.userData.enabled = false;
    lever.add(latchHit);
    const yk = [];
    const yc = LT.shaftZ - LT.e;
    const slotBottom = LT.shaftY - LT.e - LT.camR - 1e-3;
    const yokeH = LT.shaftY + LT.camR * 0.6 - slotBottom;
    for (const s of [-1, 1]) yk.push(G.paint(G.at(G.box(LT.camLen + 4e-3, yokeH, LT.yokeT), LT.x, slotBottom + yokeH / 2, yc + s * (LT.camR + LT.yokeT / 2)), C.blue));
    yk.push(G.paint(G.at(G.box(LT.camLen + 4e-3, LT.yokeT, 2 * LT.camR + 2 * LT.yokeT), LT.x, slotBottom - LT.yokeT / 2 + 5e-4, yc), C.blue));
    const pinFrom = yc - LT.camR - LT.yokeT;
    yk.push(G.paint(G.at(G.axisZ(G.cyl(pinR, pinFrom - LT.pinTip, 10)), LT.x, LT.shaftY, (pinFrom + LT.pinTip) / 2), C.red));
    const pin = mesh(G.merge(yk), M.plastic, group, false);
    pin.name = "lock-pin";
    const ejector = mesh(G.paint(G.cyl(0.024, 0.03, 16), C.orange), M.plastic, group, false);
    ejector.position.set(BN.dock[0], BN.dock[1] - 0.0155, BN.dock[2]);
    ejector.name = "ejector";
    return {
      group,
      rotor,
      winding,
      pawl,
      button,
      lever,
      pin,
      ejector,
      setSpring,
      hits: { button: buttonHit, latch: latchHit },
      riserPts,
      // ホース口→容器の吸込み口（紙片の通り道）
      pawlRest: g0,
      buttonTop: V3(BT.x, B.y1 + BT.height, BT.z),
      ejectorY: BN.dock[1] - 0.0155
    };
  }

  // app/hero/parts-clean.js
  function meshIn(THREE, own, parent, geo, mat, cast) {
    const m = new THREE.Mesh(own(geo), mat);
    m.castShadow = !!cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function hitBox(THREE, own, hitMat, control, size) {
    const m = new THREE.Mesh(own(new THREE.BoxGeometry(size[0], size[1], size[2])), hitMat);
    m.userData.control = control;
    m.userData.enabled = false;
    m.name = "hit-" + control;
    return m;
  }
  function buildPlug(ctx) {
    const { THREE, G, P, M, own, hitMat } = ctx;
    const p = P.plug, C = P.colors;
    const group = new THREE.Group();
    const parts = [];
    parts.push(G.paint(G.rbox(p.w, p.h, p.len, 8e-3, 3), C.yellow));
    parts.push(G.paint(G.at(G.axisZ(G.cyl(6e-3, 0.016, 10, 95e-4)), 0, 0, -p.len / 2 - 6e-3), C.orange));
    for (const s of [-1, 1]) parts.push(G.paint(G.at(G.rbox(p.prongW, 0.013, p.prongLen, 2e-3, 1), s * p.prongGap / 2, 0, p.len / 2 + p.prongLen / 2 - 2e-3), C.white));
    const m = meshIn(THREE, own, group, G.merge(parts), M.plug, true);
    m.name = "plug";
    const hit = hitBox(THREE, own, hitMat, "plug", [p.hit, 0.12, p.hit]);
    hit.position.y = 0.03;
    group.add(hit);
    return { group, hit, tail: -p.len / 2 - 0.012 };
  }
  function buildNozzle(ctx) {
    const { THREE, G, P, M, own, hitMat } = ctx;
    const N = P.nozzle, BR = P.brush, C = P.colors;
    const group = new THREE.Group();
    group.name = "nozzle";
    const hw = N.width / 2;
    const ay = BR.axisY, az = BR.axisZ, coverR = BR.tipR + 6e-3;
    const prof = [];
    prof.push([az + coverR * 0.92, 4e-3]);
    for (let i = 0; i <= 8; i++) {
      const a = -0.45 + i / 8 * (Math.PI / 2 + 0.75);
      prof.push([az + coverR * Math.cos(a), ay + coverR * Math.sin(a)]);
    }
    prof.push([-0.03, N.height], [-0.052, N.height - 0.012], [-N.depth / 2, 0.03], [-N.depth / 2, 0.012], [-0.05, 4e-3]);
    const cz = prof.reduce((s, q) => s + q[0], 0) / prof.length, cy = prof.reduce((s, q) => s + q[1], 0) / prof.length;
    const inset = (d) => prof.map((q) => {
      const l = Math.hypot(q[0] - cz, q[1] - cy) || 1;
      return [q[0] + (cz - q[0]) / l * d, q[1] + (cy - q[1]) / l * d];
    });
    const st = [];
    const boxX0 = hw - N.gearBox;
    st.push(G.paint(G.at(G.sideExtrude(prof, N.plateT, 3e-3), -hw, 0, 0), C.mint));
    const inner = inset(7e-3);
    const arch = [];
    for (let i = 0; i < prof.length; i++) arch.push(prof[i]);
    for (let i = inner.length - 1; i >= 0; i--) arch.push([inner[i][0], Math.max(inner[i][1], 4e-3)]);
    st.push(G.paint(G.at(G.sideExtrude(arch, N.gearBox, 2e-3), boxX0, 0, 0), C.mint));
    const back = [[-0.016, 6e-3], [-0.016, N.height - 0.01], [-0.03, N.height], [-0.052, N.height - 0.012], [-N.depth / 2, 0.03], [-N.depth / 2, 0.012], [-0.05, 6e-3]];
    st.push(G.paint(G.at(G.sideExtrude(back, boxX0 + hw - N.plateT + 2e-3, 0), -hw + N.plateT - 1e-3, 0, 0), C.mint));
    st.push(G.paint(G.at(G.rbox(boxX0 + hw - 4e-3, 0.012, 8e-3, 3e-3, 2), (boxX0 - hw) / 2, 0.016, az + coverR * 0.93), C.mintDeep));
    const wb = new THREE.Vector3().fromArray(N.wandBase), wt = new THREE.Vector3().fromArray(N.wandTop);
    const wdir = wt.clone().sub(wb).normalize(), wlen = wt.distanceTo(wb);
    st.push(G.paint(G.aim(G.at(G.cyl(N.wandR, wlen, 14), 0, wlen / 2, 0), wdir, wb), C.white));
    st.push(G.paint(G.aim(G.ring(N.wandR - 1e-3, N.wandR + 7e-3, 0.022, 16), wdir, wb.clone().addScaledVector(wdir, -4e-3)), C.mintDeep));
    st.push(G.paint(G.aim(G.ring(N.wandR - 1e-3, N.wandR + 6e-3, 0.05, 16), wdir, wb.clone().addScaledVector(wdir, wlen * 0.42)), C.yellow));
    st.push(G.paint(G.aim(G.ring(N.wandR - 1e-3, N.wandR + 6e-3, 0.016, 16), wdir, wt.clone().addScaledVector(wdir, -0.016)), C.lilac));
    const ph = gearPhase(BR);
    const my = ay + BR.centerDist * Math.cos(BR.motorDir), mz = az + BR.centerDist * Math.sin(BR.motorDir);
    st.push(G.paint(G.at(G.axisX(G.cyl(3e-3, N.gearBox - 4e-3, 8)), boxX0 + N.gearBox / 2, my, mz), C.white));
    const housing = meshIn(THREE, own, group, G.merge(st), M.nozzle, true);
    housing.name = "nozzle-housing";
    const a0 = -0.45, a1 = Math.PI - Math.acos(Math.min(1, (az + 0.016) / coverR));
    const cover = G.surface(12, 1, (u, v, o) => {
      const a = a0 + (a1 - a0) * u;
      o[0] = -hw + N.plateT + (boxX0 + hw - N.plateT) * (1 - v);
      o[1] = ay + coverR * Math.sin(a);
      o[2] = az + coverR * Math.cos(a);
    });
    const pane = G.at(G.sideExtrude(inset(3e-3), 2e-3, 0), hw - 4e-3, 0, 0);
    const clear = meshIn(THREE, own, group, G.merge([G.plain(cover), G.plain(pane)]), M.clear, false);
    clear.renderOrder = 3;
    clear.name = "nozzle-clear";
    const rotor = new THREE.Group();
    rotor.position.set(0, ay, az);
    group.add(rotor);
    const rp = [];
    const rollX0 = -hw + N.plateT + 4e-3, rollX1 = boxX0 - 4e-3;
    const rollLen = rollX1 - rollX0, rollC = (rollX0 + rollX1) / 2;
    rp.push(G.paint(G.at(G.axisX(G.cyl(BR.coreR, rollLen, 14)), rollC, 0, 0), C.white));
    rp.push(G.paint(G.at(G.axisX(G.cyl(4e-3, N.width - 0.012, 8)), 0, 0, 0), C.white));
    const tuftColors = [C.red, C.yellow, C.blue, C.mintDeep];
    const th = BR.tipR - BR.coreR + 2e-3;
    for (let k = 0; k < BR.rows; k++) for (let i = 0; i < BR.perRow; i++) {
      const t = (i + 0.5) / BR.perRow;
      const g = G.cyl(BR.tuftR, th, 6, BR.tuftR * 0.45);
      g.translate(0, BR.coreR - 2e-3 + th / 2, 0);
      g.rotateX(TAU * (k / BR.rows + t * BR.turns));
      g.translate(rollX0 + t * rollLen, 0, 0);
      rp.push(G.paint(g, tuftColors[k % tuftColors.length]));
    }
    const gearX = hw - 6e-3 - BR.gearW;
    const g2 = G.axisXfromZ(G.extrude(G.gearShape(BR.z2, BR.module, 4e-3, { count: 5, at: BR.module * BR.z2 * 0.3, r: BR.module * BR.z2 * 0.1 }), BR.gearW, 0, 6));
    rp.push(G.paint(G.at(g2, gearX, 0, 0), C.yellow));
    const rotorMesh = meshIn(THREE, own, rotor, G.merge(rp), M.plastic, false);
    rotorMesh.name = "brush-roller";
    const motor = new THREE.Group();
    motor.position.set(gearX, my, mz);
    group.add(motor);
    const g1 = G.axisXfromZ(G.extrude(G.gearShape(BR.z1, BR.module, 3e-3, { count: 3, at: BR.module * BR.z1 * 0.27, r: BR.module * BR.z1 * 0.11 }), BR.gearW, 0, 6));
    meshIn(THREE, own, motor, G.paint(g1, C.red), M.plastic, false).name = "motor-gear";
    const wheels = new THREE.Group();
    wheels.position.set(0, N.wheelR, N.wheelZ);
    group.add(wheels);
    const wp = [];
    for (const s of [-1, 1]) {
      wp.push(G.paint(G.at(G.axisX(G.cyl(N.wheelR, N.wheelW, 18)), s * N.wheelX, 0, 0), C.mintDeep));
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        wp.push(G.paint(G.at(G.axisX(G.cyl(45e-4, 3e-3, 8)), s * (N.wheelX + N.wheelW / 2 + 1e-3), Math.cos(a) * N.wheelR * 0.55, Math.sin(a) * N.wheelR * 0.55), C.white));
      }
    }
    meshIn(THREE, own, wheels, G.merge(wp), M.plastic, false).name = "nozzle-wheels";
    const hit = hitBox(THREE, own, hitMat, "nozzle", N.hit);
    hit.position.set(0, N.hit[1] / 2 - 0.01, -0.035);
    group.add(hit);
    const neck = [[0, ay - BR.tipR * 0.2, az - BR.tipR], [0, 0.03, -0.02], [0, N.wandBase[1], N.wandBase[2]], [0, N.wandTop[1], N.wandTop[2]]];
    return { group, rotor, motor, wheels, hit, phase: ph, wandDir: wdir, wandTop: wt, neck };
  }
  function buildHose(ctx) {
    const { THREE, G, P, M, own } = ctx;
    const H = P.hose, C = P.colors;
    const l = H.ringLen / 2, R = H.ringR, ri = H.tubeR - 5e-4;
    const bead = G.paint(G.revolve([[ri, -l], [R * 0.9, -l], [R, -l * 0.45], [R, l * 0.45], [R * 0.9, l], [ri, l]], 16, 1), null);
    const rings = new THREE.InstancedMesh(own(bead), M.plastic, H.rings);
    rings.castShadow = true;
    rings.receiveShadow = true;
    rings.frustumCulled = false;
    rings.name = "hose-rings";
    const col = new THREE.Color();
    for (let i = 0; i < H.rings; i++) rings.setColorAt(i, G.tint(i % 2 ? C.white : C.lilac, col));
    const t = G.tube(H.tubeSeg, H.tubeSides, H.tubeR, true);
    const tubeMesh = new THREE.Mesh(own(t.geometry), M.clear);
    tubeMesh.frustumCulled = false;
    tubeMesh.renderOrder = 3;
    tubeMesh.name = "hose-tube";
    return { rings, tube: t, tubeMesh };
  }
  function buildBin(ctx) {
    const { THREE, G, P, M, own, hitMat } = ctx;
    const B = P.bin, C = P.colors, LT = P.latch, RS = P.riser;
    const group = new THREE.Group();
    group.name = "dust-bin";
    const shell = meshIn(THREE, own, group, G.plain(G.revolve([[B.radius, B.collarH - 2e-3], [B.radius, B.height]], 32, 1.2)), M.bin, true);
    shell.renderOrder = 4;
    shell.name = "bin-shell";
    const sp = [];
    sp.push(G.paint(G.ring(B.radius - 3e-3, B.collarR, B.collarH, 30), C.blue));
    const lugY = LT.shaftY - B.dock[1];
    sp.push(G.paint(G.at(G.axisZ(G.ring(6e-3, 0.011, 7e-3, 12)), 0, lugY, B.collarR - 3e-3), C.yellow));
    sp.push(G.paint(G.revolve([[B.radius - 4e-3, B.height - 4e-3], [B.radius + 3e-3, B.height - 4e-3], [B.radius + 3e-3, B.height + 7e-3], [B.radius - 0.012, B.height + B.capH], [0, B.height + B.capH]], 30, 0.8), C.blue));
    const handle = new THREE.TorusGeometry(B.handleR, 75e-4, 8, 14, Math.PI);
    sp.push(G.paint(G.at(handle, 0, B.height + B.capH - 4e-3, 0), C.yellow));
    sp.push(G.paint(G.at(G.axisX(G.ring(RS.radius - 2e-3, RS.radius + 5e-3, 0.01, 16)), -B.radius - 6e-3, B.inletY, 0), C.lilac));
    sp.push(G.paint(G.at(G.axisZ(G.cyl(55e-4, 0.05, 8)), B.radius - 1e-3, 3e-3, 0), C.yellow));
    const solid = meshIn(THREE, own, group, G.merge(sp), M.binSolid, true);
    solid.name = "bin-solid";
    const flap = new THREE.Group();
    flap.position.set(B.radius - 1e-3, 3e-3, 0);
    group.add(flap);
    const fr = B.radius - 4e-3;
    const fp = [G.paint(G.at(G.cyl(fr, 5e-3, 26), -(B.radius - 1e-3), 0, 0), C.orange), G.paint(G.at(G.box(0.014, 4e-3, 0.02), -2 * B.radius + 8e-3, -35e-4, 0), C.yellow)];
    meshIn(THREE, own, flap, G.merge(fp), M.binSolid, false).name = "bin-flap";
    const hit = hitBox(THREE, own, hitMat, "bin", B.hit);
    hit.position.y = B.height / 2 + 0.01;
    group.add(hit);
    return { group, flap, hit, shell };
  }
  function buildCan(ctx) {
    const { THREE, G, P, M, own } = ctx;
    const K = P.can, C = P.colors;
    const rt = K.radius, rb = K.radius * K.taper, H = K.height, w = K.wall;
    const group = new THREE.Group();
    group.position.set(K.pos[0], 0, K.pos[2]);
    group.name = "trash-can";
    const parts = [];
    parts.push(G.paint(G.revolve([[0, 0], [rb, 0], [rt, H], [rt - w, H], [rb - w, w], [0, w]], 32, 0.8), C.sky));
    parts.push(G.paint(G.at(G.ring(rt - 2e-3, rt + 6e-3, 0.016, 32), 0, H - 0.016, 0), C.white));
    parts.push(G.paint(G.at(G.ring(rb + (rt - rb) * 0.3, rb + (rt - rb) * 0.3 + 4e-3, 0.03, 32), 0, H * 0.3, 0), C.blue));
    parts.push(G.paint(G.at(G.rbox(0.07, 0.03, 0.02, 6e-3, 2), 0, H - 5e-3, -rt - 6e-3), C.blue));
    meshIn(THREE, own, group, G.merge(parts), M.plastic, true).name = "can";
    const lid = new THREE.Group();
    lid.position.set(0, H + 2e-3, -rt - 4e-3);
    group.add(lid);
    const lr = rt + 8e-3;
    const lp = [];
    lp.push(G.paint(G.at(G.revolve([[0, 0], [lr, 0], [lr, 0.012], [lr * 0.72, 0.03], [0, 0.038]], 30, 0.8), 0, 0, lr - 4e-3), C.blue));
    lp.push(G.paint(G.at(G.sphere(0.02, 12, 8), 0, 0.048, lr - 4e-3), C.yellow));
    lp.push(G.paint(G.axisX(G.cyl(7e-3, 0.08, 8)), C.white));
    meshIn(THREE, own, lid, G.merge(lp), M.plastic, true).name = "can-lid";
    return { group, lid };
  }
  var SCRAP_UV = [
    0.3213,
    0.0889,
    0.5166,
    0.5732,
    0.2354,
    0.2568,
    0.9111,
    0.7529,
    0.3877,
    0.3662,
    0.583,
    0.0928,
    0.8213,
    0.9717,
    0.7471,
    0.6748,
    0.29,
    0.3545,
    0.5049,
    0.7529,
    0.7314,
    0.7764,
    0.7002,
    0.2568,
    0.9424,
    0.0732,
    0.0205,
    0.46,
    0.4424,
    0.9639,
    0.0244,
    0.792,
    0.0752,
    0.2725,
    0.1729,
    0.9326,
    0.5596,
    0.7451,
    0.2354,
    0.7178,
    0.9775,
    0.4014,
    0.915,
    0.2021,
    0.4775,
    0.292,
    0.5518,
    0.1982,
    0.9463,
    0.9131,
    0.1963,
    0.417,
    0.958,
    0.5889,
    0.2354,
    0.4756,
    0.751,
    0.1045,
    0.3174,
    0.9287,
    0.583,
    0.3076,
    0.0439,
    0.085,
    0.7236,
    0.3232,
    0.4619,
    0.5342,
    0.1377,
    0.792,
    0.3877,
    0.3076,
    0.8018,
    0.0811,
    0.6494,
    0.4443,
    0.9268,
    0.6904,
    0.6494,
    0.9756,
    0.1299,
    0.6006,
    0.3916,
    0.9092,
    0.6494,
    0.8936,
    0.2275,
    0.8037,
    0.7041,
    0.4131,
    0.4697,
    0.8896
  ];
  function buildScraps(ctx, paperTex) {
    const { THREE, G, P, own } = ctx;
    const S = P.scraps;
    const geo = G.surface(2, 2, (u, v, o) => {
      o[0] = 0.5 - u;
      o[2] = v - 0.5;
      o[1] = 0.1 * ((u - 0.5) * (u - 0.5) * 2 - (v - 0.5) * (v - 0.5));
    });
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * 2 * S.uvHalf, (uv.getY(i) - 0.5) * 2 * S.uvHalf);
    const off = new Float32Array(S.count * 2);
    const nUv = SCRAP_UV.length / 2;
    for (let i = 0; i < S.count; i++) {
      const k = (i * 7 + 3) % nUv;
      off[i * 2] = SCRAP_UV[k * 2];
      off[i * 2 + 1] = SCRAP_UV[k * 2 + 1];
    }
    geo.setAttribute("aUvOff", new THREE.InstancedBufferAttribute(off, 2));
    const mat = own(new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aUvOff;").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\n	vMapUv += aUvOff;\n#endif");
    };
    mat.customProgramCacheKey = () => "hero-scrap-uv";
    const mesh = new THREE.InstancedMesh(own(geo), mat, S.count);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = "scraps";
    const size = [];
    for (let i = 0; i < S.count; i++) size.push([S.size[0] + rnd(i, 21) * (S.size[1] - S.size[0]), S.size[0] * 0.75 + rnd(i, 22) * (S.size[1] - S.size[0]) * 0.8]);
    return { mesh, size };
  }
  function buildStars(ctx) {
    const { THREE, G, P, own } = ctx;
    const n = P.finale.stars;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, r = i % 2 ? 0.38 : 1;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const geo = new THREE.ShapeGeometry(G.polyShape(pts));
    const mat = own(new THREE.MeshBasicMaterial({ color: "#fff2a8", side: THREE.DoubleSide, toneMapped: false }));
    const mesh = new THREE.InstancedMesh(own(geo), mat, n);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = "stars";
    return { mesh };
  }
  function buildBlob(ctx, radius) {
    const { THREE, own } = ctx;
    const seg = 24, mid = 0.62;
    const pos = [0, 0, 0], col = [0.2, 0.13, 0.1, 0.5];
    for (let i = 0; i < seg; i++) {
      const a = i / seg * TAU;
      pos.push(Math.cos(a) * radius * mid, 0, Math.sin(a) * radius * mid);
      col.push(0.2, 0.13, 0.1, 0.36);
    }
    for (let i = 0; i < seg; i++) {
      const a = i / seg * TAU;
      pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      col.push(0.2, 0.13, 0.1, 0);
    }
    const idx = [];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg, a = 1 + i, b = 1 + j, c = 1 + seg + i, d = 1 + seg + j;
      idx.push(0, b, a, a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    const mat = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const m = new THREE.Mesh(own(g), mat);
    m.renderOrder = 1;
    return m;
  }

  // app/hero/hero.js
  var { TAU: TAU2, clamp: clamp2, lerp: lerp2, smoothstep: smoothstep2, damp: damp2, rnd: rnd2, frac: frac2 } = mech_exports;
  var FLOOR = 0;
  var CAPT = 1;
  var PATH = 2;
  var SWIRL = 3;
  var BIN = 4;
  var POUR = 5;
  var FALL = 6;
  var CAN = 7;
  var POP = 8;
  var FLY = 9;
  function createHero(THREE, opts) {
    const A = opts.layout;
    const q = opts.quality || {};
    const P = makeParams(A);
    const C = P.colors;
    const noop = () => {
    };
    const onStage = opts.onStage || noop, onSound = opts.onSound || noop, onLoop = opts.onLoop || noop;
    const V3 = THREE.Vector3;
    const owned = [];
    const own = (x) => {
      owned.push(x);
      return x;
    };
    const small = q.textureSize === 512;
    const plasticTex = opts.textures.get(small ? "plastic_pastel_512" : "plastic_pastel_1024");
    const paperTex = opts.textures.get(small ? "paper_scraps_512" : "paper_scraps_1024");
    const G = makeGeom(THREE, opts.addons, P.texAvg);
    const plastic = own(new THREE.MeshStandardMaterial({ map: plasticTex, vertexColors: true, roughness: 0.5, metalness: 0 }));
    const ctrlMat = () => {
      const m = own(plastic.clone());
      m.emissive.set(C.glow);
      m.emissiveIntensity = 0;
      return m;
    };
    const M = {
      plastic,
      plug: ctrlMat(),
      button: ctrlMat(),
      latch: ctrlMat(),
      nozzle: ctrlMat(),
      binSolid: ctrlMat(),
      clear: own(new THREE.MeshStandardMaterial({ color: C.clear, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.15, metalness: 0 })),
      bin: own(new THREE.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.36, depthWrite: false, roughness: 0.15, metalness: 0, emissive: C.glow, emissiveIntensity: 0 })),
      spring: own(new THREE.MeshStandardMaterial({ color: C.orange, roughness: 0.45, metalness: 0 })),
      cord: own(new THREE.MeshStandardMaterial({ color: C.purple, roughness: 0.6, metalness: 0 }))
    };
    const hitMat = own(new THREE.MeshBasicMaterial({ visible: false }));
    const ctx = { THREE, G, P, M, own, hitMat };
    const root = new THREE.Group();
    root.name = "hero";
    const body = buildBody(ctx);
    root.add(body.group);
    const plug = buildPlug(ctx);
    root.add(plug.group);
    const cordTube = G.tube(P.cord.segments, P.cord.sides, P.cord.radius, true);
    const cordMesh = new THREE.Mesh(own(cordTube.geometry), M.cord);
    cordMesh.frustumCulled = false;
    cordMesh.receiveShadow = true;
    cordMesh.name = "cord";
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
      const b1 = buildBlob(ctx, 0.42);
      b1.position.set(A.bodyCenter[0], 8e-3, A.bodyCenter[2]);
      b1.scale.set(1, 1, 0.74);
      const b2 = buildBlob(ctx, P.can.radius * 1.75);
      b2.position.set(P.can.pos[0], 8e-3, P.can.pos[2]);
      nozBlob = buildBlob(ctx, 0.23);
      nozBlob.scale.set(1, 1, 0.62);
      root.add(b1, b2, nozBlob);
    }
    const hitTargets = [plug.hit, body.hits.button, nozzle.hit, body.hits.latch, bin.hit];
    const stageHit = { pull: plug.hit, rewind: body.hits.button, suck: nozzle.hit, unlock: body.hits.latch, dump: bin.hit };
    const R = P.reel, RT = P.ratchet, CD = P.cord, BT = P.button, BN = P.bin, LT = P.latch, NZ = P.nozzle, BR = P.brush, HS = P.hose, SC = P.scraps, CN = P.can, DP = P.dump, FN = P.finale;
    const N = SC.count;
    const exit = new V3().fromArray(CD.exit);
    const plugRest = new V3().fromArray(P.plug.rest);
    const nozRest = new V3().fromArray(NZ.rest);
    const hoseEnd = new V3().fromArray(P.riser.hoseEnd);
    const dumpC = new V3().fromArray(DP.center);
    const canC = new V3().fromArray(CN.pos);
    const freeStroke = buttonFreeStroke(RT);
    const releaseX = LT.releaseAt * LT.e;
    const dockC0 = new V3(BN.dock[0], BN.dock[1] + BN.lift + BN.height / 2, BN.dock[2]);
    const planeN = new V3();
    {
      const u = new V3().subVectors(dumpC, dockC0).normalize();
      const v = new V3().fromArray(DP.viewDir).normalize();
      planeN.copy(v).addScaledVector(u, -v.dot(u)).normalize();
    }
    const planeD = planeN.dot(dumpC);
    const arcR = BR.tipR * 0.92;
    const lArc = arcR * Math.PI / 2;
    const neckN = nozzle.neck.length - 1;
    const neckPts = new Float32Array(nozzle.neck.flat()), neckLens = new Float32Array(neckN + 1);
    const lNeck = polyLengths(neckPts, neckN, neckLens);
    const riserN = body.riserPts.length - 1;
    const riserPts = new Float32Array(body.riserPts.flat()), riserLens = new Float32Array(riserN + 1);
    const lRiser = polyLengths(riserPts, riserN, riserLens);
    const hosePts = new Float32Array((HS.samples + 1) * 3), hoseLens = new Float32Array(HS.samples + 1);
    const hoseTry = new Float32Array(17 * 3);
    const bez = new Float32Array(12);
    let lHose = HS.length;
    const S = {
      stage: "pull",
      t: 0,
      round: 0,
      hintT: 0,
      // コード
      L: 0,
      tick: 0,
      plug: plugRest.clone(),
      hx: 0,
      hz: 1,
      grabOff: new V3(),
      b: 0,
      pressed: false,
      rewinding: false,
      // ノズル
      noz: nozRest.clone(),
      prevNoz: nozRest.clone(),
      yaw: 0,
      odo: 0,
      speed: 0,
      motorOmega: 0,
      motorAngle: 0,
      nozGrab: new V3(),
      popT: 0,
      rattleT: 0,
      // 留め金
      latchT: 0,
      latchDir: 0,
      phi: 0,
      pinX: 0,
      released: false,
      liftT: 0,
      lift: 0,
      // 容器
      binMode: "dock",
      binC: dockC0.clone(),
      tilt: 0,
      dropV: 0,
      dropX: 0,
      dropZ: 0,
      pourAcc: 0,
      pourIdx: 0,
      lid: 0,
      arrive: 0,
      inBin: 0,
      inCan: 0,
      falling: 0,
      // フィナーレ
      fT: 0,
      hop: 0,
      flyFrom: new V3(),
      flyTilt: 0,
      docked: false,
      relocked: false
    };
    const sc = [];
    for (let i = 0; i < N; i++) {
      sc.push({ st: FLOOR, p: new V3(), home: new V3(), yaw: 0, t: 0, T: 1, s: 0, slot: 0, lat: 0, p0: new V3(), v: new V3(), delay: 0, ax: new V3(rnd2(i, 51) - 0.5, rnd2(i, 52) - 0.5, rnd2(i, 53) - 0.5).normalize(), spin: 5 + rnd2(i, 54) * 6 });
    }
    const binOrder = new Int16Array(N);
    const starData = [];
    for (let i = 0; i < FN.stars; i++) starData.push({ p0: new V3(), v: new V3(), t0: 0, life: 1, size: 0.02, ax: new V3(rnd2(i, 61) - 0.5, rnd2(i, 62) - 0.5, rnd2(i, 63) - 0.5).normalize() });
    const tv = new V3(), tv2 = new V3(), tv3 = new V3(), tv4 = new V3();
    const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sv = new V3(1, 1, 1);
    const UP = new V3(0, 1, 0);
    const a3 = [0, 0, 0], b3 = [0, 0, 0];
    const ease = (x) => {
      const t = clamp2(x, 0, 1);
      return t * t * (3 - 2 * t);
    };
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
    function nozToWorld(x, y, z, out) {
      const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      return out.set(S.noz.x + x * c + z * s, S.noz.y + y, S.noz.z - x * s + z * c);
    }
    function dockCenter(out) {
      return out.set(BN.dock[0], BN.dock[1] + S.lift + S.hop + BN.height / 2, BN.dock[2]);
    }
    function binSlot(n, out) {
      const a = n * 2.399963, r = 0.012 + 0.034 * Math.sqrt(frac2(n * 0.618034 + 0.31));
      return out.set(r * Math.cos(a), 0.012 + n / N * (BN.height - 0.04), r * Math.sin(a));
    }
    function canSlot(n, out) {
      const a = n * 2.399963 + 1, r = 0.085 * Math.sqrt(frac2(n * 0.618034 + 0.11));
      return out.set(canC.x + r * Math.cos(a), CN.wall + 0.012 + n / N * 0.15, canC.z + r * Math.sin(a));
    }
    function clampNozzle(v) {
      v.x = clamp2(v.x, NZ.areaMin[0], NZ.areaMax[0]);
      v.z = clamp2(v.z, NZ.areaMin[1], NZ.areaMax[1]);
      v.y = 0;
      const dx = v.x - hoseEnd.x, dz = v.z - hoseEnd.z, d = Math.hypot(dx, dz);
      if (d < NZ.minPortDist) {
        const k = d > 1e-4 ? NZ.minPortDist / d : 0;
        if (k) {
          v.x = hoseEnd.x + dx * k;
          v.z = hoseEnd.z + dz * k;
        } else {
          v.x = hoseEnd.x - NZ.minPortDist;
        }
        v.x = clamp2(v.x, NZ.areaMin[0], NZ.areaMax[0]);
        v.z = clamp2(v.z, NZ.areaMin[1], NZ.areaMax[1]);
      }
      return v;
    }
    function clampPlug(v) {
      v.x = clamp2(v.x, CD.areaMin[0], CD.areaMax[0]);
      v.z = clamp2(v.z, CD.areaMin[1], CD.areaMax[1]);
      v.y = P.plug.y;
      const dy = v.y - exit.y;
      const maxH = Math.sqrt(Math.max(1e-6, CD.reach * CD.reach - dy * dy));
      const dx = v.x - exit.x, dz = v.z - exit.z, d = Math.hypot(dx, dz);
      if (d > maxH) {
        v.x = exit.x + dx / d * maxH;
        v.z = exit.z + dz / d * maxH;
      }
      return v;
    }
    const nozYawAt = (x, z) => Math.atan2(x - hoseEnd.x, z - hoseEnd.z);
    function pushFrom(o, px, pz, min) {
      const dx = o[0] - px, dz = o[1] - pz, d = Math.hypot(dx, dz);
      if (d >= min) return;
      if (d > 1e-4) {
        o[0] = px + dx / d * min;
        o[1] = pz + dz / d * min;
      } else {
        o[0] = px - min;
      }
    }
    function scatter(round) {
      const cols = 3, rows = Math.max(1, Math.ceil(SC.clusters / cols));
      const cx = [], cz = [], o = [0, 0];
      const portMin = NZ.minPortDist + 0.05;
      const inArea = () => {
        o[0] = clamp2(o[0], SC.areaMin[0], SC.areaMax[0]);
        o[1] = clamp2(o[1], SC.areaMin[1], SC.areaMax[1]);
      };
      for (let c = 0; c < SC.clusters; c++) {
        const ix = c % cols, iz = Math.floor(c / cols) % rows;
        o[0] = lerp2(SC.areaMin[0], SC.areaMax[0], (ix + 0.5) / cols) + (rnd2(c, 31 + round * 7) - 0.5) * 0.15;
        o[1] = lerp2(SC.areaMin[1], SC.areaMax[1], (iz + 0.5) / rows) + (rnd2(c, 32 + round * 7) - 0.5) * 0.13;
        for (let k = 0; k < 3; k++) {
          pushFrom(o, nozRest.x, nozRest.z, 0.25);
          pushFrom(o, hoseEnd.x, hoseEnd.z, portMin + SC.clusterR);
          inArea();
        }
        cx.push(o[0]);
        cz.push(o[1]);
      }
      for (let i = 0; i < N; i++) {
        const c = i % SC.clusters;
        const a = rnd2(i, 41 + round * 3) * TAU2, r = SC.clusterR * Math.sqrt(rnd2(i, 42 + round * 3));
        o[0] = cx[c] + r * Math.cos(a);
        o[1] = cz[c] + r * Math.sin(a);
        for (let k = 0; k < 3; k++) {
          inArea();
          pushFrom(o, hoseEnd.x, hoseEnd.z, portMin);
        }
        sc[i].home.set(o[0], SC.floorY + i * 2e-4, o[1]);
        sc[i].yaw = rnd2(i, 43 + round) * TAU2;
      }
    }
    function setStage(s) {
      const prev = S.stage;
      S.stage = s;
      for (const h of hitTargets) h.userData.enabled = false;
      if (stageHit[s]) stageHit[s].userData.enabled = true;
      onStage(s, prev);
    }
    function resetState(keepScatter) {
      S.L = 0;
      S.tick = 0;
      S.plug.copy(plugRest);
      S.b = 0;
      S.pressed = false;
      S.rewinding = false;
      const hd = Math.hypot(plugRest.x - exit.x, plugRest.z - exit.z) || 1;
      S.hx = (plugRest.x - exit.x) / hd;
      S.hz = (plugRest.z - exit.z) / hd;
      S.noz.copy(nozRest);
      S.prevNoz.copy(nozRest);
      S.yaw = nozYawAt(nozRest.x, nozRest.z);
      S.speed = 0;
      S.motorOmega = 0;
      S.latchT = 0;
      S.latchDir = 0;
      S.phi = 0;
      S.pinX = 0;
      S.released = false;
      S.liftT = 0;
      S.lift = 0;
      S.binMode = "dock";
      S.tilt = 0;
      S.dropV = 0;
      S.pourAcc = 0;
      S.pourIdx = 0;
      S.lid = 0;
      S.arrive = 0;
      S.inBin = 0;
      S.inCan = 0;
      S.falling = 0;
      S.fT = 0;
      S.hop = 0;
      S.docked = false;
      S.relocked = false;
      dockCenter(S.binC);
      if (!keepScatter) {
        S.round++;
        scatter(S.round);
      }
      for (let i = 0; i < N; i++) {
        sc[i].st = FLOOR;
        sc[i].p.copy(sc[i].home);
        sc[i].t = 0;
      }
      stars.mesh.visible = false;
    }
    function reset(keepScatter) {
      resetState(keepScatter === true);
      setStage("pull");
    }
    function finishPull() {
      S.L = R.Lmax;
      S.tick = ratchetIndex(reelAngle(R, S.L), RT.Z);
      onSound("boing", { pan: 0.3 });
      setStage("rewind");
    }
    function updatePull(dt, input) {
      if (input.grabbed === "plug" && input.pointer.isDown && rayAtY(input.ray, P.plug.y, tv)) {
        if (input.justGrabbed) {
          S.grabOff.set(S.plug.x - tv.x, 0, S.plug.z - tv.z);
          if (S.grabOff.length() > 0.09) S.grabOff.setLength(0.09);
        }
        clampPlug(tv.add(S.grabOff));
        S.plug.lerp(tv, damp2(CD.follow, dt));
      }
      const need = dist3(S.plug, exit) - CD.rest;
      if (need > S.L) S.L = Math.min(R.Lmax, need);
      const idx = ratchetIndex(reelAngle(R, S.L), RT.Z);
      if (idx > S.tick) {
        S.tick = idx;
        onSound("tick", { rate: 0.85 + 0.55 * S.L / R.Lmax, gain: 0.7, pan: 0.2 });
      }
      if (S.L >= R.Lmax - 4e-3) finishPull();
    }
    function finishRewind() {
      S.L = 0;
      S.tick = 0;
      S.plug.copy(plugRest);
      S.rewinding = false;
      S.pressed = false;
      onSound("thunk", { pan: 0.2 });
      setStage("suck");
    }
    function updateRewind(dt, input) {
      if (!S.rewinding && input.justGrabbed && input.grabbed === "rewindButton") {
        S.rewinding = true;
        S.pressed = true;
        onSound("click");
      }
      if (S.rewinding && S.b >= freeStroke) {
        const v = rewindSpeed(P.rewind, S.L, R.Lmax);
        S.L = Math.max(0, S.L - v * dt);
        const lim = CD.rest + S.L;
        if (dist3(S.plug, exit) > lim) {
          let lo = 0, hi = 1;
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            tv.lerpVectors(S.plug, plugRest, mid);
            if (dist3(tv, exit) > lim) lo = mid;
            else hi = mid;
          }
          S.plug.lerp(plugRest, hi);
        }
        onLoop("whirr", 0.85, 0.7 + 1.2 * v / P.rewind.vmax);
        if (S.L <= P.rewind.done) finishRewind();
      }
    }
    function updateSuck(dt, input) {
      if (input.pointer.isDown && input.floorPoint) {
        if (input.grabbed === "nozzle") {
          if (input.justGrabbed) {
            S.nozGrab.set(S.noz.x - input.floorPoint.x, 0, S.noz.z - input.floorPoint.z);
            if (S.nozGrab.length() > 0.16) S.nozGrab.setLength(0.16);
          }
          clampNozzle(tv.copy(input.floorPoint).add(S.nozGrab));
          S.noz.lerp(tv, damp2(NZ.follow, dt));
        } else if (!input.grabbed) {
          clampNozzle(tv.copy(input.floorPoint));
          S.noz.lerp(tv, damp2(NZ.drift, dt));
        }
      }
      const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      const mx = S.noz.x + s * BR.axisZ, mz = S.noz.z + c * BR.axisZ;
      S.popT -= dt;
      for (let i = 0; i < N; i++) {
        const o = sc[i];
        if (o.st !== FLOOR) continue;
        const rx = o.p.x - mx, rz = o.p.z - mz;
        const lat = rx * c - rz * s, fw = rx * s + rz * c;
        if (Math.hypot(Math.max(Math.abs(lat) - P.suction.halfWidth, 0), fw) < P.suction.radius) {
          o.st = CAPT;
          o.t = 0;
          o.p0.copy(o.p);
          o.lat = clamp2(lat, -P.suction.halfWidth, P.suction.halfWidth);
          if (S.popT <= 0) {
            S.popT = 0.05;
            onSound("pop", { rate: 0.85 + rnd2(i, S.round) * 0.5, gain: 0.7, pan: clamp2(o.p.x, -1, 1) * 0.6 });
          }
        }
      }
      if (S.inBin >= N) setStage("unlock");
    }
    function updateUnlock(dt, input) {
      if (S.latchDir === 0 && !S.released && input.justGrabbed && input.grabbed === "latch") {
        S.latchDir = 1;
        onSound("click", { pan: -0.1 });
      }
      if (!S.released && S.pinX >= releaseX) {
        S.released = true;
        S.liftT = 0;
        onSound("clack", { pan: -0.1 });
        setStage("dump");
      }
    }
    function startPour() {
      if (S.binMode === "pour") return;
      S.binMode = "pour";
      onSound("whoosh", { gain: 0.5, pan: 0.5 });
    }
    function updateDump(dt, input) {
      const mode = S.binMode;
      if (mode !== "pour") {
        if (input.justGrabbed && input.grabbed === "bin" && mode !== "hold") {
          S.binMode = "hold";
          onSound("whoosh", { gain: 0.45 });
        }
        if (S.binMode === "hold") {
          if (input.grabbed === "bin" && input.pointer.isDown) {
            if (rayAtPlane(input.ray, planeN, planeD, tv)) {
              tv.x = clamp2(tv.x, DP.xMin, DP.xMax);
              const overBody = tv.x < DP.homeX;
              const nearCan = distXZ(tv, canC) < CN.radius + BN.radius + 0.04;
              const minY = (nearCan ? CN.height + 0.1 : overBody ? BN.dock[1] + BN.lift - 2e-3 : 0.012) + BN.height / 2;
              tv.y = clamp2(tv.y, minY, DP.yMax);
              tv.z = clamp2(tv.z, canC.z - 0.06, 0.2);
              S.binC.lerp(tv, damp2(BN.follow, dt));
            }
          } else {
            if (dist3(S.binC, dumpC) < DP.tiltFar || distXZ(S.binC, canC) < CN.radius + 0.06) startPour();
            else if (S.binC.x < DP.homeX) S.binMode = "home";
            else {
              S.binMode = "drop";
              S.dropV = 0;
              const o = [Math.max(S.binC.x, P.body.x1 + BN.collarR + 0.02), S.binC.z];
              for (let k = 0; k < 2; k++) {
                pushFrom(o, plugRest.x, plugRest.z, BN.collarR + 0.08);
                pushFrom(o, canC.x, canC.z, CN.radius + BN.collarR + 0.02);
              }
              S.dropX = o[0];
              S.dropZ = o[1];
            }
          }
        }
        if (S.binMode === "home") {
          dockCenter(tv);
          S.binC.lerp(tv, damp2(8, dt));
          if (dist3(S.binC, tv) < 4e-3) {
            S.binC.copy(tv);
            S.binMode = "dock";
            onSound("thunk", { gain: 0.35 });
          }
        } else if (S.binMode === "drop") {
          const floorY = BN.height / 2 + 4e-3;
          S.dropV += 5 * dt;
          S.binC.y -= S.dropV * dt;
          S.binC.x += (S.dropX - S.binC.x) * damp2(10, dt);
          S.binC.z += (S.dropZ - S.binC.z) * damp2(10, dt);
          if (S.binC.y <= floorY) {
            S.binC.y = floorY;
            S.binMode = "floor";
            onSound("thunk", { gain: 0.5, pan: 0.3 });
          }
        } else if (S.binMode === "floor") {
          S.binC.x += (S.dropX - S.binC.x) * damp2(10, dt);
          S.binC.z += (S.dropZ - S.binC.z) * damp2(10, dt);
        } else if (S.binMode === "dock") {
          dockCenter(S.binC);
        }
        const want = S.binMode === "hold" ? BN.flapMaxTilt * smoothstep2(DP.tiltFar, DP.tiltNear, dist3(S.binC, dumpC)) : 0;
        S.tilt += (want - S.tilt) * damp2(10, dt);
        if (S.tilt >= BN.flapStart + 0.03) startPour();
      } else {
        S.binC.lerp(dumpC, damp2(8, dt));
        S.tilt = Math.min(BN.flapMaxTilt, S.tilt + 2.6 * dt);
        const beta = flapAngle(BN, S.tilt);
        S.pourAcc += DP.flow * beta / BN.flapMax * dt;
        while (S.pourAcc >= 1 && S.pourIdx < S.inBin) {
          S.pourAcc -= 1;
          const o = sc[binOrder[S.pourIdx++]];
          o.st = POUR;
          o.t = 0;
        }
        if (S.pourIdx >= S.inBin) S.pourAcc = 0;
      }
      if (S.inCan >= N) startFinale();
    }
    function startFinale() {
      S.fT = 0;
      S.docked = false;
      S.relocked = false;
      S.flyFrom.copy(S.binC);
      S.flyTilt = S.tilt;
      S.binMode = "fly";
      S.round++;
      scatter(S.round);
      for (let i = 0; i < N; i++) {
        const o = sc[i];
        if (o.st !== CAN) {
          o.st = CAN;
          canSlot(i, o.p);
        }
        o.delay = FN.burstStart + rnd2(i, 71 + S.round) * FN.burstSpread;
        const far = clamp2(distXZ(o.home, canC) / 2, 0, 1);
        o.T = lerp2(FN.flight[0], FN.flight[1], 0.6 * far + 0.4 * rnd2(i, 72 + S.round));
      }
      for (let i = 0; i < FN.stars; i++) {
        const d = starData[i], second = i % 3 === 0;
        d.t0 = second ? FN.binBack + 0.1 + rnd2(i, 81) * 0.5 : FN.burstStart + rnd2(i, 82) * 0.9;
        d.life = 0.9 + rnd2(i, 83) * 0.9;
        d.size = 0.026 + rnd2(i, 84) * 0.034;
        if (second) d.p0.set(A.bodyCenter[0] + (rnd2(i, 85) - 0.5) * 0.5, 0.3 + rnd2(i, 86) * 0.2, A.bodyCenter[2] + 0.1);
        else d.p0.set(canC.x + (rnd2(i, 85) - 0.5) * 0.2, CN.height + 0.05, canC.z + (rnd2(i, 86) - 0.5) * 0.2);
        d.v.set((rnd2(i, 87) - 0.5) * 0.9, 0.5 + rnd2(i, 88) * 0.9, (rnd2(i, 89) - 0.3) * 0.6);
      }
      stars.mesh.visible = true;
      onSound("sparkle", { pan: 0.4 });
      setStage("finale");
    }
    const crossed = (t0, t1, at) => t0 < at && t1 >= at;
    function updateFinale(dt) {
      const t0 = S.fT;
      S.fT += dt;
      const t = S.fT;
      const ht = t - 0.35;
      S.hop = ht > 0 && ht < 2.52 ? FN.hop * Math.abs(Math.sin(Math.PI * ht / 0.36)) * (1 - ht / 2.52) : 0;
      if (!S.docked) {
        const k = clamp2(t / FN.binBack, 0, 1), e = ease(k);
        dockCenter(tv);
        S.binC.lerpVectors(S.flyFrom, tv, e);
        S.binC.y += Math.sin(Math.PI * e) * 0.14;
        S.tilt = S.flyTilt * (1 - smoothstep2(0, 0.5, k));
        if (k >= 1) {
          S.docked = true;
          S.binMode = "dock";
          S.released = false;
          S.tilt = 0;
          onSound("clack", { gain: 0.6, pan: -0.1 });
        }
      } else {
        dockCenter(S.binC);
        if (!S.relocked && t >= FN.binBack + 0.3) {
          S.relocked = true;
          S.latchDir = -1;
        }
      }
      if (crossed(t0, t, FN.burstStart)) onSound("whoosh", { pan: 0.5 });
      if (crossed(t0, t, FN.burstStart + 0.35)) onSound("sparkle", { rate: 1.2, pan: 0.2 });
      if (crossed(t0, t, FN.binBack + 0.75)) onSound("sparkle", { rate: 0.9, pan: -0.2 });
      if (crossed(t0, t, FN.lidClose + 0.45)) onSound("thunk", { gain: 0.4, pan: 0.5 });
      S.noz.lerp(nozRest, damp2(2.4, dt));
      if (t >= FN.duration) reset(true);
    }
    function setBez(lift) {
      const hy = hoseEnd.y + S.hop;
      bez[0] = hoseEnd.x;
      bez[1] = hy;
      bez[2] = hoseEnd.z;
      bez[3] = hoseEnd.x - HS.k0;
      bez[4] = hy + lift;
      bez[5] = hoseEnd.z;
      bez[6] = tv.x + tv2.x * HS.k1;
      bez[7] = tv.y + tv2.y * HS.k1 + lift;
      bez[8] = tv.z + tv2.z * HS.k1;
      bez[9] = tv.x;
      bez[10] = tv.y;
      bez[11] = tv.z;
    }
    function mechanism(dt, input) {
      const dx = S.noz.x - S.prevNoz.x, dz = S.noz.z - S.prevNoz.z;
      const moved = Math.hypot(dx, dz);
      S.odo += dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw);
      S.speed += (moved / Math.max(dt, 1e-3) - S.speed) * damp2(10, dt);
      S.prevNoz.copy(S.noz);
      let dy = nozYawAt(S.noz.x, S.noz.z) - S.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      S.yaw += dy * damp2(NZ.yawFollow, dt);
      const on = S.stage === "suck" || S.stage === "finale" && S.fT < 2.6;
      const wantOmega = on ? clamp2(BR.idle + BR.perSpeed * S.speed, 0, BR.maxOmega) : 0;
      S.motorOmega += (wantOmega - S.motorOmega) * damp2(BR.spin, dt);
      S.motorAngle = (S.motorAngle + S.motorOmega * dt) % (TAU2 * BR.z2);
      nozzle.group.position.copy(S.noz);
      nozzle.group.rotation.y = S.yaw;
      nozzle.wheels.rotation.x = S.odo / NZ.wheelR;
      nozzle.motor.rotation.x = nozzle.phase.o1 - S.motorAngle;
      nozzle.rotor.rotation.x = nozzle.phase.o2 + nozzle.phase.ratio * S.motorAngle;
      if (nozBlob) {
        nozBlob.position.set(S.noz.x, 8e-3, S.noz.z);
        nozBlob.rotation.y = S.yaw;
      }
      if (S.stage === "suck") {
        onLoop("suck", 0.3 + 0.4 * clamp2(S.speed * 2, 0, 1), 0.8 + clamp2(S.speed, 0, 1));
        onLoop("brush", clamp2(S.motorOmega / BR.maxOmega, 0, 1) * 0.9, 0.6 + 1.2 * S.motorOmega / BR.maxOmega);
      }
      S.b += ((S.pressed ? BT.stroke : 0) - S.b) * damp2(BT.press, dt);
      const theta = reelAngle(R, S.L);
      const Lw = R.Lmax - S.L;
      body.group.position.y = S.hop;
      body.rotor.rotation.z = theta;
      const rw = reelRadius(R, Lw);
      body.winding.visible = Lw > 1e-4;
      body.winding.scale.set(rw, rw, 1);
      body.setSpring(theta);
      const delta = Math.max(pawlAngleFromRatchet(theta, RT), pawlAngleFromButton(S.b, RT));
      body.pawl.rotation.z = -delta;
      body.button.position.y = P.body.y1 - S.b;
      if (S.latchDir !== 0) {
        S.latchT = clamp2(S.latchT + S.latchDir * dt / LT.turnTime, 0, 1);
        if (S.latchT <= 0 || S.latchT >= 1) {
          if (S.latchDir < 0) onSound("click", { pan: -0.1 });
          S.latchDir = 0;
        }
      }
      const wig = hintOn("unlock") && S.latchDir === 0 && !S.released ? P.hint.tilt * (0.5 - 0.5 * Math.cos(TAU2 * P.hint.hz * S.hintT)) : 0;
      S.phi = LT.phiMax * ease(S.latchT);
      S.pinX = camPin(LT.e, S.phi);
      body.lever.rotation.x = -(S.phi + wig);
      body.pin.position.z = camPin(LT.e, S.phi + wig);
      if (S.released) {
        S.liftT += dt;
        S.lift = BN.lift * (1 - Math.exp(-9 * S.liftT) * Math.cos(15 * S.liftT));
      } else S.lift += (0 - S.lift) * damp2(9, dt);
      body.ejector.position.y = body.ejectorY + S.lift;
      const pd = Math.hypot(S.plug.x - exit.x, S.plug.z - exit.z);
      if (pd > 0.03) {
        const k = damp2(14, dt);
        S.hx += ((S.plug.x - exit.x) / pd - S.hx) * k;
        S.hz += ((S.plug.z - exit.z) / pd - S.hz) * k;
      }
      const hl = Math.hypot(S.hx, S.hz) || 1;
      const hx = S.hx / hl, hz = S.hz / hl;
      plug.group.position.copy(S.plug);
      plug.group.rotation.y = Math.atan2(hx, hz);
      const pts = cordTube.pts, ni = CD.inside, no = CD.segments - ni;
      const rr = rw + CD.radius * 0.6;
      const ta = reelTangentAngle(exit.x - R.cx, exit.y - R.cy, rr);
      const tx = R.cx + rr * Math.cos(ta), ty = R.cy + rr * Math.sin(ta) + S.hop, ey = exit.y + S.hop;
      for (let i = 0; i < ni; i++) {
        const k = i / ni;
        pts[i * 3] = lerp2(tx, exit.x, k);
        pts[i * 3 + 1] = lerp2(ty, ey, k);
        pts[i * 3 + 2] = exit.z;
      }
      const tailX = S.plug.x + hx * plug.tail, tailZ = S.plug.z + hz * plug.tail;
      const D = Math.hypot(tailX - exit.x, tailZ - exit.z);
      const slack = Math.max(0, CD.rest + S.L - dist3(S.plug, exit));
      const bulge = Math.sqrt(3 * Math.max(D, 0.05) * slack / 8);
      let px = -hz, pz = hx;
      if (px * 0.6 + pz * 0.8 < 0) {
        px = -px;
        pz = -pz;
      }
      const k1 = Math.min(0.07, D * 0.4), k2 = Math.min(0.12, D * 0.35);
      const minY = CD.radius + 1e-3;
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
      nozToWorld(nozzle.wandTop.x, nozzle.wandTop.y, nozzle.wandTop.z, tv);
      nozToWorld(nozzle.wandDir.x, nozzle.wandDir.y, nozzle.wandDir.z, tv2).sub(S.noz);
      let lo = 0, hi = 1.2;
      setBez(0);
      if (bezierSample(bez, 16, hoseTry, null) < HS.length) {
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          setBez(mid);
          if (bezierSample(bez, 16, hoseTry, null) < HS.length) lo = mid;
          else hi = mid;
        }
        setBez((lo + hi) / 2);
      }
      lHose = bezierSample(bez, HS.samples, hosePts, hoseLens);
      for (let i = 0; i < HS.rings; i++) {
        const seg = polyAt(hosePts, hoseLens, HS.samples, (i + 0.5) / HS.rings * lHose, a3);
        tv3.set(hosePts[seg * 3 + 3] - hosePts[seg * 3], hosePts[seg * 3 + 4] - hosePts[seg * 3 + 1], hosePts[seg * 3 + 5] - hosePts[seg * 3 + 2]);
        if (tv3.lengthSq() < 1e-12) tv3.set(1, 0, 0);
        tq.setFromUnitVectors(UP, tv3.normalize());
        m4.compose(tv4.set(a3[0], a3[1], a3[2]), tq, sv.set(1, 1, 1));
        hose.rings.setMatrixAt(i, m4);
      }
      hose.rings.instanceMatrix.needsUpdate = true;
      const hp = hose.tube.pts, hn = hose.tube.nSeg;
      for (let i = 0; i <= hn; i++) {
        polyAt(hosePts, hoseLens, HS.samples, i / hn * lHose, a3);
        hp[i * 3] = a3[0];
        hp[i * 3 + 1] = a3[1];
        hp[i * 3 + 2] = a3[2];
      }
      hose.tube.update();
      if (S.binMode === "dock") dockCenter(S.binC);
      const half = BN.height / 2;
      const wob = hintOn("dump") && (S.binMode === "dock" || S.binMode === "floor") ? 1 + P.hint.scale * Math.sin(TAU2 * P.hint.hz * S.hintT) : 1;
      bin.group.position.set(S.binC.x + half * Math.sin(S.tilt), S.binC.y - half * Math.cos(S.tilt), S.binC.z);
      bin.group.rotation.z = S.tilt;
      bin.group.scale.setScalar(wob);
      bin.flap.rotation.z = flapAngle(BN, S.tilt);
      bin.group.updateMatrix();
      let lid = lidAngle(CN, distXZ(S.binC, canC));
      if (S.stage === "finale") lid = Math.max(lid, CN.lidMax * (1 - smoothstep2(FN.lidClose, FN.lidClose + 0.5, S.fT)));
      S.lid += (lid - S.lid) * damp2(14, dt);
      can.lid.rotation.x = -S.lid;
    }
    function pathAt(s, lat, out) {
      if (s < lArc) {
        const b = s / arcR, k = 1 - s / lArc;
        return nozToWorld(lat * k, BR.axisY - arcR * Math.cos(b), BR.axisZ - arcR * Math.sin(b), out);
      }
      let r = s - lArc;
      if (r < lNeck) {
        polyAt(neckPts, neckLens, neckN, r, a3);
        return nozToWorld(a3[0], a3[1], a3[2], out);
      }
      r -= lNeck;
      if (r < lHose) {
        polyAt(hosePts, hoseLens, HS.samples, lHose - r, a3);
        return out.set(a3[0], a3[1], a3[2]);
      }
      r -= lHose;
      polyAt(riserPts, riserLens, riserN, r, a3);
      return out.set(a3[0], a3[1] + S.hop, a3[2]);
    }
    function updateScraps(dt) {
      const total = lArc + lNeck + lHose + lRiser;
      const vArc = Math.max(0.3, S.motorOmega * BR.z1 / BR.z2 * BR.tipR);
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
          case CAPT: {
            o.t += dt / P.suction.pull;
            const k = Math.min(1, o.t);
            nozToWorld(o.lat, 0.01, BR.axisZ, tv);
            o.p.lerpVectors(o.p0, tv, k * k);
            o.p.y += 0.012 * Math.sin(Math.PI * k);
            tumble = true;
            if (o.t >= 1) {
              o.st = PATH;
              o.s = 0;
            }
            break;
          }
          case PATH: {
            o.s += (o.s < lArc ? vArc : P.suction.vAir) * dt;
            pathAt(Math.min(o.s, total), o.lat, o.p);
            scale = 0.62;
            tumble = true;
            if (o.s >= total) {
              o.st = SWIRL;
              o.t = 0;
              o.slot = S.arrive;
              binOrder[S.arrive++] = i;
            }
            break;
          }
          case SWIRL: {
            o.t += dt / P.suction.binTime;
            const k = Math.min(1, o.t), e = k * k;
            binSlot(o.slot, tv);
            const a1 = Math.atan2(tv.z, tv.x), r1 = Math.hypot(tv.x, tv.z);
            let turn = a1 - Math.PI;
            turn -= Math.floor(turn / TAU2) * TAU2;
            const ang = Math.PI + (turn + TAU2) * k;
            const rad = lerp2(BN.radius - 0.014, r1, e);
            o.p.set(rad * Math.cos(ang), lerp2(BN.inletY, tv.y, e), rad * Math.sin(ang)).applyMatrix4(binM);
            scale = 0.72;
            tumble = true;
            if (o.t >= 1) {
              o.st = BIN;
              S.inBin++;
              if (S.rattleT <= 0) {
                S.rattleT = 0.09;
                onSound("rattle", { gain: 0.45, rate: 0.9 + 0.4 * (S.inBin / N), pan: 0.1 });
              }
            }
            break;
          }
          case BIN:
            binSlot(o.slot, o.p).applyMatrix4(binM);
            tq.setFromAxisAngle(o.ax, 0.5).premultiply(tq2);
            scale = 0.78;
            break;
          case POUR: {
            o.t += dt / 0.2;
            const k = Math.min(1, o.t);
            binSlot(o.slot, tv).applyMatrix4(binM);
            tv2.set(-(BN.radius - 8e-3), 4e-3, (rnd2(i, 91) - 0.5) * 0.05).applyMatrix4(binM);
            o.p.lerpVectors(tv, tv2, k * k);
            scale = 0.78;
            tumble = true;
            falling++;
            if (o.t >= 1) {
              o.st = FALL;
              o.t = 0;
              o.p0.copy(o.p);
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
            scale = 0.85;
            tumble = true;
            falling++;
            if (o.t >= o.T) {
              o.st = CAN;
              canSlot(i, o.p);
              S.inCan++;
            }
            break;
          }
          case CAN:
            tq.setFromAxisAngle(o.ax, 0.6);
            scale = 0.85;
            if (S.stage === "finale" && S.fT >= o.delay) {
              o.st = POP;
              o.t = 0;
              o.p0.copy(o.p);
            }
            break;
          case POP: {
            o.t += dt / 0.14;
            const k = Math.min(1, o.t);
            tv.set(canC.x + (rnd2(i, 92) - 0.5) * 0.1, CN.height + 0.04, canC.z + (rnd2(i, 93) - 0.5) * 0.1);
            o.p.lerpVectors(o.p0, tv, k);
            scale = 0.85;
            tumble = true;
            if (o.t >= 1) {
              o.st = FLY;
              o.t = 0;
              o.p0.copy(tv);
              ballisticV0(o.p0.toArray(a3), o.home.toArray(b3), o.T, DP.gravity, a3);
              o.v.set(a3[0], a3[1], a3[2]);
            }
            break;
          }
          case FLY: {
            o.t += dt;
            const t = Math.min(o.t, o.T), k = t / o.T;
            o.p.copy(o.p0).addScaledVector(o.v, t);
            o.p.y -= 0.5 * DP.gravity * t * t;
            const fl = 0.035 * Math.sin(Math.PI * k);
            o.p.x += fl * Math.sin(9 * t + i);
            o.p.z += fl * Math.cos(7 * t + i * 1.7);
            scale = lerp2(0.85, 1, k) + 0.3 * Math.sin(Math.PI * k);
            tumble = true;
            if (o.t >= o.T) {
              o.st = FLOOR;
              o.p.copy(o.home);
              tq.setFromAxisAngle(UP, o.yaw);
              tumble = false;
            }
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
      if (S.stage === "dump") onLoop("pour", falling > 0 ? 0.9 : 0, 0.8 + 0.5 * (S.inCan / N));
    }
    function updateStars() {
      if (!stars.mesh.visible) return;
      const t = S.fT;
      for (let i = 0; i < FN.stars; i++) {
        const d = starData[i];
        const u = (t - d.t0) / d.life;
        if (u <= 0 || u >= 1) {
          m4.makeScale(0, 0, 0);
          stars.mesh.setMatrixAt(i, m4);
          continue;
        }
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
    let showHint = false;
    const hintOn = (stage) => showHint && S.stage === stage;
    const glowMats = { pull: [M.plug], rewind: [M.button], suck: [M.nozzle], unlock: [M.latch], dump: [M.bin, M.binSolid] };
    function updateGlow(dt) {
      const pulse = showHint && getHint() ? P.hint.glow * (0.5 - 0.5 * Math.cos(TAU2 * P.hint.hz * S.hintT)) : 0;
      for (const k in glowMats) {
        const want = k === S.stage ? pulse : 0;
        for (const m of glowMats[k]) m.emissiveIntensity += (want - m.emissiveIntensity) * damp2(12, dt);
      }
      const w = showHint ? P.hint.scale * Math.sin(TAU2 * P.hint.hz * S.hintT) : 0;
      plug.group.scale.setScalar(S.stage === "pull" ? 1 + w : 1);
      const bs = S.stage === "rewind" && !S.rewinding ? 1 + w : 1;
      body.button.scale.set(bs, 1, bs);
      nozzle.group.scale.setScalar(S.stage === "suck" ? 1 + w * 0.8 : 1);
    }
    function update(dt, input) {
      const d = clamp2(finite(dt, 1 / 60), 1e-4, 0.05);
      S.t += d;
      showHint = !!input.showHint;
      S.hintT = showHint ? S.hintT + d : 0;
      switch (S.stage) {
        case "pull":
          updatePull(d, input);
          break;
        case "rewind":
          updateRewind(d, input);
          break;
        case "suck":
          updateSuck(d, input);
          break;
        case "unlock":
          updateUnlock(d, input);
          break;
        case "dump":
          updateDump(d, input);
          break;
        case "finale":
          updateFinale(d);
          break;
      }
      mechanism(d, input);
      updateScraps(d);
      updateStars();
      updateGlow(d);
    }
    const hintPos = new V3(), hintTo = new V3();
    const hintObj = { control: "", position: hintPos, gesture: "tap", to: void 0 };
    function hint(control, gesture, to) {
      hintObj.control = control;
      hintObj.gesture = gesture;
      hintObj.to = to;
      return hintObj;
    }
    function getHint() {
      switch (S.stage) {
        case "pull": {
          hintPos.copy(S.plug);
          const reach = CD.reach * 1.06;
          hintTo.set(exit.x + CD.hintDir[0] * reach, 0, exit.z + CD.hintDir[1] * reach);
          return hint("plug", "drag", hintTo);
        }
        case "rewind":
          if (S.rewinding) return null;
          hintPos.set(BT.x, P.body.y1 + BT.height - S.b, BT.z);
          return hint("rewindButton", "tap");
        case "suck": {
          let best = null, bd = Infinity;
          for (let i = 0; i < N; i++) {
            if (sc[i].st !== FLOOR) continue;
            const dd = distXZ(sc[i].p, S.noz);
            if (dd < bd) {
              bd = dd;
              best = sc[i];
            }
          }
          if (!best) return null;
          hintPos.set(S.noz.x, 0, S.noz.z);
          clampNozzle(hintTo.set(best.p.x - Math.sin(S.yaw) * BR.axisZ, 0, best.p.z - Math.cos(S.yaw) * BR.axisZ));
          return hint("nozzle", "drag", hintTo);
        }
        case "unlock":
          if (S.latchDir !== 0 || S.released) return null;
          hintPos.set(LT.x, LT.shaftY + 0.014 - LT.paddleH + S.hop, LT.shaftZ + LT.armZ + LT.paddleT);
          return hint("latch", "tap");
        case "dump":
          if (S.binMode !== "dock" && S.binMode !== "floor") return null;
          hintPos.copy(S.binC);
          return hint("bin", "drag", hintTo.copy(dumpC));
        default:
          return null;
      }
    }
    function getProgress() {
      switch (S.stage) {
        case "pull":
          return clamp2(S.L / R.Lmax, 0, 1);
        case "rewind":
          return clamp2(1 - S.L / R.Lmax, 0, 1);
        case "suck":
          return S.inBin / N;
        case "unlock":
          return clamp2(S.pinX / releaseX, 0, 1);
        case "dump":
          return S.inCan / N;
        case "finale":
          return clamp2(S.fT / FN.duration, 0, 1);
        default:
          return 0;
      }
    }
    function debugCompleteStage() {
      switch (S.stage) {
        case "pull":
          clampPlug(S.plug.set(exit.x + CD.hintDir[0] * CD.reach, P.plug.y, exit.z + CD.hintDir[1] * CD.reach));
          finishPull();
          break;
        case "rewind":
          finishRewind();
          break;
        case "suck":
          for (let i = 0; i < N; i++) {
            const o = sc[i];
            if (o.st === BIN) continue;
            if (o.st !== SWIRL) {
              o.slot = S.arrive;
              binOrder[S.arrive++] = i;
            }
            o.st = BIN;
            S.inBin++;
          }
          setStage("unlock");
          break;
        case "unlock":
          S.latchT = 1;
          S.latchDir = 0;
          S.released = true;
          S.liftT = 0;
          onSound("clack");
          setStage("dump");
          break;
        case "dump":
          S.binC.copy(dumpC);
          S.tilt = BN.flapMaxTilt;
          S.binMode = "pour";
          S.pourIdx = S.inBin;
          for (let i = 0; i < N; i++) {
            sc[i].st = CAN;
            canSlot(i, sc[i].p);
          }
          S.inCan = N;
          startFinale();
          break;
        case "finale":
          reset(true);
          break;
      }
    }
    function dispose() {
      for (const x of owned) {
        try {
          x.dispose();
        } catch (_) {
        }
      }
      owned.length = 0;
      hose.rings.dispose();
      scraps.mesh.dispose();
      stars.mesh.dispose();
      root.removeFromParent();
      root.clear();
    }
    resetState(false);
    plug.hit.userData.enabled = true;
    const idle = { showHint: false };
    mechanism(1 / 60, idle);
    updateScraps(1 / 60);
    updateStars();
    return {
      root,
      get stage() {
        return S.stage;
      },
      hitTargets,
      update,
      getHint,
      getProgress,
      reset: () => reset(false),
      debugCompleteStage,
      dispose,
      views: P.views,
      stages: STAGES,
      params: P
    };
  }
  return __toCommonJS(hero_exports);
})();
