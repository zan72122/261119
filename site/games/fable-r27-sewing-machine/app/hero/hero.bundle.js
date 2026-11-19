/* generated from app/hero/hero.js by tools/build.mjs — edit hero.js, then npm run build:hero */
var __HERO_MODULE__ = (() => {
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
    NEEDLE_X: () => NEEDLE_X2,
    PLATE_Y: () => PLATE_Y2,
    WHEEL_C: () => WHEEL_C,
    createHero: () => createHero,
    patternPoints: () => patternPoints
  });

  // app/hero/params.js
  var PLATE_Y = 0.05;
  var NEEDLE_X = -0.14;
  var SHAFT_Y = 0.24;
  var P = {
    PLATE_Y,
    NEEDLE_X,
    SHAFT_Y,
    // --- 本体（外形）---
    bed: { x0: -0.27, x1: 0.27, z0: -0.13, z1: 0.13, wall: 7e-3, floor: 6e-3, top: 6e-3, corner: 0.025 },
    arm: { x0: -0.23, x1: 0.22, y0: 0.17, y1: 0.31, z0: -0.07, z1: 0.07, wall: 7e-3, topWall: 0.017, corner: 0.035 },
    head: { x1: -0.1, y0: 0.14 },
    // 頭部は針棒のぶん下へ長い
    pillar: { x0: 0.12, x1: 0.22 },
    // 台の天板の切り欠き（カバーを外すと下軸・歯車が上から見える）と、前面のすき間
    bedOpen: { x0: -0.045, x1: 0.12, z0: -0.07, frontX0: -0.05, frontX1: 0.24 },
    needleHole: { hx: 0.026, hz: 0.022 },
    // 針板の下の穴（半幅）
    plate: { x0: -0.19, x1: -0.09, z0: -0.05, z1: 0.06, t: 1e-3, slotHX: 0.019, slotHZ: 25e-4 },
    // --- 手回し車 ---
    wheel: {
      c: [0.255, SHAFT_Y, 0],
      R: 0.08,
      rimW: 0.028,
      rimT: 0.014,
      rimX: 0.258,
      spokes: 5,
      hubR: 0.016,
      hubLen: 0.034,
      knobArm: 0.06,
      knobR: 0.014,
      knobLen: 0.032,
      bossR: 0.024
    },
    // --- 軸 ---
    upper: { r: 6e-3, x0: -0.115, x1: 0.262 },
    vert: { r: 5e-3, x: 0.17, zTop: 0, zBot: -0.024, yBot: 0.024 },
    // 上端は上軸、下端は下軸と交わる（6.3°傾く）
    lower: { r: 5e-3, y: 0.024, z: -0.024, x0: -0.03, x1: 0.158 },
    hookShaft: { r: 4e-3, y: 0.024, z: 0, x0: -0.127, x1: -8e-3 },
    // --- 歯車 ---
    bevel: { N: 20, m: 15e-4, face: 6e-3, hubR: 9e-3 },
    // G1〜G4（1:1、軸角 90°）
    spur: { N5: 20, N6: 10, m: 16e-4, x: -0.02, w5: 7e-3, w6: 9e-3 },
    // G5/G6（2:1、中心距離 0.024）
    // --- 針棒クランク（スライダークランク）---
    crank: { r: 0.018, L: 0.06, yTop: PLATE_Y + 0.03, discR: 0.024, discX0: -0.121, discX1: -0.115, pinR: 3e-3, rodX: -0.129, rodT: 6e-3 },
    needle: { len: 0.04, r: 14e-4, eye: 4e-3, clampH: 0.016, clampW: 0.013, barR: 35e-4, barTop: 0.211 },
    // barTop: 針先から棒の上端まで
    // 針棒の枠（上のピンで振れる＝針振り）
    frame: { pivotY: 0.285, lugTopY: 0.248, lugBotY: 0.152, spineX: -0.01, rodY: 0.185, rodZ: -0.02 },
    swing: { max: 0.016, a0: 3.665, a1: 5.76 },
    // φ' が a0→a1 の間に x_c → x_{c+1}
    // --- 天びん（四節リンク：天びんクランク → 連結棒 → てこ）---
    takeup: {
      r: 0.016,
      phase: Math.PI - 0.35,
      webX0: -0.098,
      webX1: -0.092,
      webR: 0.022,
      oy: 0.268,
      oz: 0.042,
      rho: 0.042,
      c: 0.028,
      tip: 0.045,
      couplerX: -0.1035,
      leverX: -0.1095
    },
    // --- 釜 ---
    hook: { R: 0.018, x0: -0.137, x1: -0.127, phiC: 200 / 180 * Math.PI },
    // --- 送り ---
    feed: {
      lift: 4e-3,
      rest: -2e-3,
      maxS: 0.01,
      eccX0: 0.04,
      eccX1: 0.05,
      eccR: 0.01,
      rowsZ: [-0.011, 9e-3, 0.017],
      colsX: [-0.016, -8e-3, 0, 8e-3, 0.016],
      toothW: 6e-3,
      toothD: 4e-3,
      toothH: 2e-3
    },
    // --- 押さえ金とレバー ---
    // 押さえ棒は針の左（縫い目が出てくる針の奥をふさがない）
    foot: { lift: 0.01, gap: 5e-4, hx: 0.022, z0: -0.013, z1: 0.024, t: 25e-4, barX: -0.17, barZ: -8e-3, barR: 3e-3 },
    lever: { pivot: [-0.2365, 0.195, 0.048], len: 0.062, up: -0.45, down: 0.45, knobR: 0.016, time: 0.25 },
    // --- 糸の道 ---
    thread: {
      r: 8e-4,
      spool: [0.1, 0.31, -0.03],
      spoolR: 0.013,
      spoolH: 0.04,
      flangeR: 0.017,
      g0: [0, 0.327, 0],
      tension: [-0.035, 0.3075, 0.08],
      g1: [-0.103, 0.134, 0.08],
      g2: [-0.127, 0.134, 0.08]
    },
    // --- 模様ダイヤル ---
    dial: { c: [0.045, 0.316, 0.043], R: 0.028, t: 6e-3 },
    // --- 布 ---
    cloth: {
      w: 0.16,
      len: 0.4,
      startZ: 0.128,
      tableY: 2e-3,
      lift: 12e-4,
      zeta0: 0.02,
      // 机 → 台 → 机 の高さの形（世界の z で決まる）
      frontZ0: 0.131,
      frontZ1: 0.215,
      backZ0: -0.131,
      backZ1: -0.205,
      maxStitch: 32,
      stitchW: 4e-3,
      stitchH: 2e-3,
      hem: 7e-3
    },
    // --- 針数 ---
    K_SEW1: 10,
    K_TOTAL: 30
  };

  // app/hero/kinematics.js
  var TAU = Math.PI * 2;
  var clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  var smooth = (x) => {
    const t = clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
  };
  var sqrt0 = (v) => Math.sqrt(Math.max(v, 0));
  var finite = (v, d = 0) => Number.isFinite(v) ? v : d;
  function needleDrop(phi) {
    const { r, L } = P.crank, s = r * Math.sin(phi);
    return r * (1 - Math.cos(phi)) + L - sqrt0(L * L - s * s);
  }
  var needleTipY = (phi) => P.crank.yTop - needleDrop(phi);
  var WRIST = P.SHAFT_Y + P.crank.r - P.crank.L - P.crank.yTop;
  var PIERCE = (() => {
    let a = Math.PI / 2, b = Math.PI;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (needleTipY(m) > P.PLATE_Y) a = m;
      else b = m;
    }
    return (a + b) / 2;
  })();
  var PEN = PIERCE - Math.PI / 2;
  var HOOK_CATCH = P.hook.phiC - Math.PI / 2;
  function takeUp(phi, out = {}) {
    const t = P.takeup, a = phi + t.phase;
    const py = P.SHAFT_Y + t.r * Math.cos(a), pz = t.r * Math.sin(a);
    let dy = t.oy - py, dz = t.oz - pz;
    const d0 = Math.hypot(dy, dz) || 1e-9;
    const d = clamp(d0, Math.abs(t.rho - t.c) + 1e-6, t.rho + t.c - 1e-6);
    dy /= d0;
    dz /= d0;
    const k = (d * d + t.c * t.c - t.rho * t.rho) / (2 * d);
    const h = sqrt0(t.c * t.c - k * k);
    const qy = py + k * dy + h * dz, qz = pz + k * dz - h * dy;
    const ly = t.oy - qy, lz = t.oz - qz, ll = Math.hypot(ly, lz) || 1e-9;
    out.py = py;
    out.pz = pz;
    out.qy = qy;
    out.qz = qz;
    out.ty = t.oy + ly / ll * t.tip;
    out.tz = t.oz + lz / ll * t.tip;
    out.lever = Math.atan2(qz - t.oz, qy - t.oy) + Math.PI / 2;
    out.coupler = Math.atan2(qz - pz, qy - py);
    out.couplerLen = Math.hypot(qz - pz, qy - py);
    return out;
  }
  function patternPoints(name, n = P.K_TOTAL + 1, z0 = P.cloth.zeta0) {
    const pts = [[0, z0]];
    const run = (toZ, step) => {
      const from = pts[pts.length - 1][1], cnt = Math.max(1, Math.ceil(Math.abs(toZ - from) / step - 1e-6));
      for (let i = 1; i <= cnt; i++) pts.push([0, from + (toZ - from) * i / cnt]);
    };
    if (name === "star") {
      const Ro = 0.0148, Ri = 65e-4;
      const v = (c, j) => {
        const a = -Math.PI / 2 + j * Math.PI / 5, r = j % 2 ? Ri : Ro;
        return [r * Math.cos(a), c + r * Math.sin(a)];
      };
      let top = z0 + 0.012;
      for (let s = 0; s < 2 && pts.length < n; s++) {
        run(top, 8e-3);
        const c = top + Ro;
        for (let j = 1; j <= 10; j++) pts.push(v(c, j));
        if (s === 0) {
          for (let j = 1; j <= 5; j++) pts.push(v(c, j));
          top = c + Ro * Math.sin(0.3 * Math.PI) + 8e-3;
        }
      }
    } else if (name === "heart") {
      const hs = 1e-3;
      const v = (c2, j) => {
        const t = TAU * j / 14;
        return [hs * 16 * Math.sin(t) ** 3, c2 - hs * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
      };
      const notch = z0 + 0.032;
      run(notch, 8e-3);
      const c = notch + 5 * hs;
      for (let j = 1; j <= 14; j++) pts.push(v(c, j));
      for (let j = 1; j <= 7; j++) pts.push(v(c, j));
    } else {
      for (let k = 1; k < n; k++) pts.push([0.012 * Math.sin(TAU * k / 12), z0 + 6e-3 * k]);
    }
    while (pts.length < n) pts.push([0, pts[pts.length - 1][1] + (pts.length === n - 1 && name !== "wave" ? 4e-3 : 8e-3)]);
    pts.length = n;
    pts[n - 1][0] = 0;
    const { max } = P.swing, { maxS } = P.feed;
    for (let k = 0; k < n; k++) {
      pts[k][0] = clamp(finite(pts[k][0]), -max, max);
      if (k) pts[k][1] = pts[k - 1][1] + clamp(finite(pts[k][1] - pts[k - 1][1]), -maxS, maxS);
    }
    return pts;
  }
  function sewState(psi, pts, out = {}) {
    const N = pts.length - 1;
    psi = Math.max(0, finite(psi));
    const c = Math.floor(psi / TAU + 1e-9), fp = Math.max(0, psi - c * TAU);
    const i0 = Math.min(c, N), i1 = Math.min(c + 1, N), im = Math.max(0, Math.min(c - 1, N));
    const s = pts[i1][1] - pts[i0][1];
    out.c = c;
    out.fp = fp;
    out.stitches = Math.min(N, c + (fp >= PEN ? 1 : 0));
    out.x = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * smooth((fp - P.swing.a0) / (P.swing.a1 - P.swing.a0));
    out.zeta = pts[i0][1] + s * (fp >= Math.PI ? (1 + Math.cos(fp)) / 2 : 0);
    out.feedS = fp < Math.PI / 2 ? pts[i0][1] - pts[im][1] : s;
    return out;
  }
  function feedDog(phi, s, out = {}) {
    out.y = P.PLATE_Y + P.feed.rest + P.feed.lift * Math.cos(phi);
    out.z = -(clamp(finite(s), -P.feed.maxS, P.feed.maxS) / 2) * Math.sin(phi);
    return out;
  }

  // app/hero/geom.js
  function makeKit(THREE, addons, detail = 1) {
    const seg = (n, min = 6) => Math.max(min, Math.round(n * detail));
    const tmpC = new THREE.Color();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    function paint(g, hex) {
      if (g.attributes.color) return g;
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      tmpC.set(hex);
      for (let i = 0; i < n; i++) {
        a[i * 3] = tmpC.r;
        a[i * 3 + 1] = tmpC.g;
        a[i * 3 + 2] = tmpC.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      return g;
    }
    function boxUV(g, scale = 9) {
      const p = g.attributes.position, nrm = g.attributes.normal, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
        let u, v;
        if (ax >= ay && ax >= az) {
          u = p.getZ(i);
          v = p.getY(i);
        } else if (ay >= az) {
          u = p.getX(i);
          v = p.getZ(i);
        } else {
          u = p.getX(i);
          v = p.getY(i);
        }
        uv[i * 2] = u * scale;
        uv[i * 2 + 1] = v * scale;
      }
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      return g;
    }
    function merge(list, { uv = null, weld = true } = {}) {
      const parts = list.map((g) => {
        let n = g.index ? g.toNonIndexed() : g;
        if (n !== g) g.dispose();
        for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "color" && !(k === "uv" && uv === "keep")) n.deleteAttribute(k);
        if (!n.attributes.color) paint(n, 16777215);
        if (uv === "keep" && !n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
        n.morphAttributes = {};
        return n;
      });
      let m = addons.mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      if (!m) throw new Error("hero: mergeGeometries failed");
      if (uv === "box") boxUV(m);
      if (weld) {
        const w = addons.mergeVertices(m, 1e-5);
        if (w !== m) m.dispose();
        m = w;
      }
      m.computeBoundingSphere();
      return m;
    }
    const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const boxAt = (x0, x1, y0, y1, z0, z1) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const rbox = (x0, x1, y0, y1, z0, z1, r = 2e-3) => {
      const w = x1 - x0, h = y1 - y0, d = z1 - z0, rr = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
      return new addons.RoundedBoxGeometry(w, h, d, 2, rr).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    const cylX = (r, x0, x1, y = 0, z = 0, n = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, Math.abs(x1 - x0), seg(n)).rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, y, z);
    const cylY = (r, y0, y1, x = 0, z = 0, n = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, Math.abs(y1 - y0), seg(n)).translate(x, (y0 + y1) / 2, z);
    const cylZ = (r, z0, z1, x = 0, y = 0, n = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, Math.abs(z1 - z0), seg(n)).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
    const sphere = (r, x, y, z, n = 14) => new THREE.SphereGeometry(r, seg(n), seg(n * 0.7, 5)).translate(x, y, z);
    const torus = (R, r, x, y, z, axis = "z", n = 14) => {
      const g = new THREE.TorusGeometry(R, r, 6, seg(n, 8));
      if (axis === "y") g.rotateX(Math.PI / 2);
      else if (axis === "x") g.rotateY(Math.PI / 2);
      return g.translate(x, y, z);
    };
    const lathe = (profile, axis = "y", n = 32) => {
      const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0), h)), seg(n, 10));
      if (axis === "x") g.rotateZ(-Math.PI / 2);
      else if (axis === "z") g.rotateX(Math.PI / 2);
      return g;
    };
    function tracePoly(path, pts, radius) {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
        const l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1e-9, l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1e-9;
        const r = Math.min(Array.isArray(radius) ? radius[i] : radius, l0 * 0.45, l2 * 0.45);
        const ax = p1[0] + (p0[0] - p1[0]) / l0 * r, ay = p1[1] + (p0[1] - p1[1]) / l0 * r;
        const bx = p1[0] + (p2[0] - p1[0]) / l2 * r, by = p1[1] + (p2[1] - p1[1]) / l2 * r;
        if (i === 0) path.moveTo(ax, ay);
        else path.lineTo(ax, ay);
        if (r > 1e-6) path.quadraticCurveTo(p1[0], p1[1], bx, by);
      }
      path.closePath();
      return path;
    }
    const polyShape = (pts, radius = 0, holes = []) => {
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      if (area < 0) {
        pts = pts.slice().reverse();
        if (Array.isArray(radius)) radius = radius.slice().reverse();
      }
      const s = tracePoly(new THREE.Shape(), pts, radius);
      for (const h of holes) s.holes.push(tracePoly(new THREE.Path(), h.pts, h.r || 0));
      return s;
    };
    const rectPts = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    function extrude(shape, t0, t1, { bevel = 0, plane = "xy", curve = 5 } = {}) {
      const b = Math.min(bevel, (t1 - t0) * 0.45);
      const g = new THREE.ExtrudeGeometry(shape, { depth: t1 - t0 - 2 * b, steps: 1, curveSegments: seg(curve, 3), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2 });
      g.translate(0, 0, t0 + b);
      if (plane === "xz") g.rotateX(-Math.PI / 2);
      else if (plane === "zy") g.rotateY(Math.PI / 2);
      return g;
    }
    function flat() {
      const pos = [], nor = [], col = [];
      const a = V(), b = V(), n = V();
      function tri(p, q, r, hint, hex) {
        a.subVectors(q, p);
        b.subVectors(r, p);
        n.crossVectors(a, b);
        const len = n.length();
        if (!(len > 1e-14)) return;
        n.multiplyScalar(1 / len);
        let v = [p, q, r];
        if (hint && n.dot(hint) < 0) {
          v = [p, r, q];
          n.negate();
        }
        tmpC.set(hex === void 0 ? 16777215 : hex);
        for (const w of v) {
          pos.push(w.x, w.y, w.z);
          nor.push(n.x, n.y, n.z);
          col.push(tmpC.r, tmpC.g, tmpC.b);
        }
      }
      return {
        tri,
        quad(p, q, r, s, hint, hex) {
          tri(p, q, r, hint, hex);
          tri(p, r, s, hint, hex);
        },
        done() {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
          g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
          return g;
        }
      };
    }
    function prismX(profile, rIn, x0, x1, colors = () => 16777215) {
      const f2 = flat(), n = profile.length, hx0 = V(-1, 0, 0), hx1 = V(1, 0, 0), h = V();
      for (let i = 0; i < n; i++) {
        const [y0, z0] = profile[i], [y1, z1] = profile[(i + 1) % n];
        h.set(0, y0 + y1, z0 + z1);
        f2.quad(V(x0, y0, z0), V(x0, y1, z1), V(x1, y1, z1), V(x1, y0, z0), h, colors(i, "wall"));
        const l0 = Math.hypot(y0, z0) || 1e-9, l1 = Math.hypot(y1, z1) || 1e-9;
        const iy0 = y0 / l0 * rIn, iz0 = z0 / l0 * rIn, iy1 = y1 / l1 * rIn, iz1 = z1 / l1 * rIn;
        for (const [x, hint] of [[x0, hx0], [x1, hx1]]) {
          if (rIn > 0) f2.quad(V(x, iy0, iz0), V(x, y0, z0), V(x, y1, z1), V(x, iy1, iz1), hint, colors(i, "cap"));
          else f2.tri(V(x, 0, 0), V(x, y0, z0), V(x, y1, z1), hint, colors(i, "cap"));
        }
      }
      return f2.done();
    }
    const circleProfile = (r, n, cy = 0, cz = 0) => {
      const p = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        p.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]);
      }
      return p;
    };
    function spurGear({ N, m, x0, x1, bore = 0, c1 = 16777215, c2 = 16777215 }) {
      const R = N * m / 2, ra = R + m, rr = R - 1.25 * m, tau = Math.PI * 2 / N, prof = [];
      for (let i = 0; i < N; i++) for (const [da, r] of [[-0.3, rr], [-0.13, ra], [0.13, ra], [0.3, rr]]) {
        const a = (i + da) * tau;
        prof.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      const q = prof.length / 4;
      return prismX(prof, bore, x0, x1, (i, part) => part === "cap" && Math.floor(i / q) % 2 ? c2 : c1);
    }
    function bevelGear({ N, m, face, dir = 1, hubR = 8e-3, c1 = 16777215, c2 = 16777215 }) {
      const delta = Math.PI / 4, R = N * m / 2, A = R / Math.sin(delta), k = (A - face) / A, tau = Math.PI * 2 / N;
      const f2 = flat(), ring = [], cd = Math.cos(delta), sd = Math.sin(delta);
      for (let i = 0; i < N; i++) for (const [da, h] of [[-0.3, -1.25 * m], [-0.13, m], [0.13, m], [0.3, -1.25 * m]]) {
        const a = (i + da) * tau, ca = Math.cos(a), sa = Math.sin(a);
        ring.push({ a, L: V(dir * (A * cd - h * sd), A * sd * ca + h * cd * ca, A * sd * sa + h * cd * sa) });
      }
      const n = ring.length, xBack = dir * (A * cd + 4e-3), xFront = dir * ((A - face) * cd - 1e-3), q = n / 4;
      const hOut = V(), hBack = V(dir, 0, 0), hFront = V(-dir, 0, 0);
      for (let i = 0; i < n; i++) {
        const p = ring[i], p2 = ring[(i + 1) % n];
        const S1 = p.L.clone().multiplyScalar(k), S2 = p2.L.clone().multiplyScalar(k);
        hOut.set(-dir * sd, cd * Math.cos(p.a), cd * Math.sin(p.a));
        f2.quad(p.L, p2.L, S2, S1, hOut, c1);
        const col = Math.floor(i / q) % 2 ? c2 : c1;
        f2.quad(p.L, p2.L, V(xBack, hubR * Math.cos(p2.a), hubR * Math.sin(p2.a)), V(xBack, hubR * Math.cos(p.a), hubR * Math.sin(p.a)), hBack, col);
        f2.tri(S1, S2, V(xFront, 0, 0), hFront, c1);
      }
      const hub = paint(cylX(hubR, xBack, xBack + dir * 6e-3, 0, 0, 14), c1);
      const g = merge([f2.done(), hub], { weld: false });
      g.userData = { R, A, xBack };
      return g;
    }
    const up = V(0, 1, 0), dirV = V(), quat = new THREE.Quaternion(), mat = new THREE.Matrix4();
    function rod(r, a, b, n = 8) {
      dirV.subVectors(b, a);
      const len = dirV.length() || 1e-6;
      const g = new THREE.CylinderGeometry(r, r, len, seg(n, 5));
      quat.setFromUnitVectors(up, dirV.multiplyScalar(1 / len));
      mat.compose(V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), quat, V(1, 1, 1));
      return g.applyMatrix4(mat);
    }
    return { seg, V, paint, boxUV, merge, box, boxAt, rbox, cylX, cylY, cylZ, sphere, torus, lathe, polyShape, rectPts, extrude, flat, prismX, circleProfile, spurGear, bevelGear, rod };
  }
  function makeTube(THREE, counts, radial = 5) {
    const total = counts.reduce((s, c) => s + c, 0);
    const pos = new Float32Array(total * radial * 3), nor = new Float32Array(total * radial * 3), idx = [];
    let base = 0;
    const starts = [];
    for (const c of counts) {
      starts.push(base);
      for (let i = 0; i < c - 1; i++) for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j, b2 = base + i * radial + (j + 1) % radial, c2 = a + radial, d2 = b2 + radial;
        idx.push(a, c2, b2, b2, c2, d2);
      }
      base += c * radial;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0.05, 0.2, 0.03), 0.4);
    const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), prevT = new THREE.Vector3(), d = new THREE.Vector3();
    function write(which, points, r) {
      const c = counts[which], s = starts[which];
      prevT.set(0, -1, 0);
      n.set(0, 0, 1);
      for (let i = 0; i < c; i++) {
        const p = points[i], q0 = points[Math.max(0, i - 1)], q1 = points[Math.min(c - 1, i + 1)];
        t.subVectors(q1, q0);
        const len = t.length();
        if (len > 1e-9 && Number.isFinite(len)) t.multiplyScalar(1 / len);
        else t.copy(prevT);
        n.addScaledVector(t, -n.dot(t));
        let nl = n.length();
        if (nl < 1e-6) {
          n.set(1, 0, 0).addScaledVector(t, -t.x);
          nl = n.length();
          if (nl < 1e-6) {
            n.set(0, 0, 1);
            nl = 1;
          }
        }
        n.multiplyScalar(1 / nl);
        b.crossVectors(t, n);
        prevT.copy(t);
        for (let j = 0; j < radial; j++) {
          const a = j / radial * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), o = (s + i * radial + j) * 3;
          d.set(n.x * ca + b.x * sa, n.y * ca + b.y * sa, n.z * ca + b.z * sa);
          pos[o] = p.x + d.x * r;
          pos[o + 1] = p.y + d.y * r;
          pos[o + 2] = p.z + d.z * r;
          nor[o] = d.x;
          nor[o + 1] = d.y;
          nor[o + 2] = d.z;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
    }
    return { geometry: g, write, counts };
  }

  // app/hero/atlas.js
  var ATLAS = { W: 1024, H: 512, coverScale: 512 / 0.444, coverX0: -0.227, coverY1: 0.297, stripRow: 300, flatUV: [0.75, 0.08] };
  var INK = { pink: "#f6b8c8", deep: "#ee7fa0", cream: "#fff6e4", white: "#fffaf2", mint: "#9edfcf" };
  var coverUV = (x, y) => [(512 + (x - ATLAS.coverX0) * ATLAS.coverScale) / ATLAS.W, 1 - (ATLAS.coverY1 - y) * ATLAS.coverScale / ATLAS.H];
  var stripUV = (x, y) => [(512 + 20 + (x + 0.049) * ATLAS.coverScale) / ATLAS.W, 1 - (ATLAS.stripRow + (0.044 - y) * ATLAS.coverScale) / ATLAS.H];
  var heartPts = (s) => {
    const p = [];
    for (let j = 0; j <= 28; j++) {
      const t = TAU * j / 28;
      p.push([s * 16 * Math.sin(t) ** 3, -s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
    }
    return p;
  };
  var starPts = (ro, ri) => {
    const p = [];
    for (let j = 0; j <= 10; j++) {
      const a = -Math.PI / 2 + j * Math.PI / 5, r = j % 2 ? ri : ro;
      p.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return p;
  };
  var wavePts = (w, h) => {
    const p = [];
    for (let j = 0; j <= 32; j++) p.push([-w + 2 * w * j / 32, -h * Math.sin(TAU * 1.5 * j / 32)]);
    return p;
  };
  function stroke(ctx, pts, color, width, dash) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function flower(ctx, x, y, r, petal, center) {
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, 0, TAU);
      ctx.fillStyle = petal;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.34, 0, TAU);
    ctx.fillStyle = center;
    ctx.fill();
  }
  function makeAtlas(THREE, coverOutline, threadColors, maxSize = 1024) {
    const canvas = document.createElement("canvas");
    const k = Math.min(1, maxSize / ATLAS.W);
    canvas.width = Math.round(ATLAS.W * k);
    canvas.height = Math.round(ATLAS.H * k);
    const ctx = canvas.getContext("2d");
    ctx.scale(k, k);
    ctx.fillStyle = INK.cream;
    ctx.fillRect(0, 0, 512, 512);
    ctx.beginPath();
    ctx.arc(256, 256, 246, 0, TAU);
    ctx.strokeStyle = INK.deep;
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 256, 226, 0, TAU);
    ctx.strokeStyle = INK.pink;
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    const icons = [wavePts(58, 20), starPts(58, 25), heartPts(3.3)];
    const pads = ["#d6eefc", "#fff1bd", "#ffdbe6"];
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 - i * TAU / 3, cx2 = 256 + 132 * Math.cos(a), cy2 = 256 - 132 * Math.sin(a);
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.rotate(Math.PI / 2 - a);
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, TAU);
      ctx.fillStyle = pads[i];
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK.white;
      ctx.stroke();
      stroke(ctx, icons[i], threadColors[i], 13);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(256, 256, 30, 0, TAU);
    ctx.fillStyle = INK.pink;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK.white;
    ctx.stroke();
    ctx.fillStyle = INK.pink;
    ctx.fillRect(512, 0, 512, 512);
    const S = ATLAS.coverScale, X = (x) => 512 + (x - ATLAS.coverX0) * S, Y = (y) => (ATLAS.coverY1 - y) * S;
    let cx = 0, cy = 0;
    coverOutline.forEach(([x, y]) => {
      cx += x;
      cy += y;
    });
    cx /= coverOutline.length;
    cy /= coverOutline.length;
    const inset = coverOutline.map(([x, y]) => [X(x + Math.sign(cx - x) * 9e-3), Y(y + Math.sign(cy - y) * 9e-3)]);
    stroke(ctx, inset.concat([inset[0]]), INK.white, 3.2, [9, 7]);
    const hx = X(0.035), hy = Y(0.238);
    stroke(ctx, heartPts(1.7).map(([x, y]) => [hx + x, hy + y + 4]), INK.white, 3.4, [8, 6]);
    flower(ctx, X(-0.045), Y(0.236), 17, INK.white, "#ffd98a");
    flower(ctx, X(0.115), Y(0.236), 17, INK.white, "#ffd98a");
    flower(ctx, X(0.17), Y(0.115), 20, INK.white, "#ffd98a");
    for (const [x, y] of [[-5e-3, 0.262], [0.075, 0.262], [-5e-3, 0.208], [0.075, 0.208], [0.17, 0.165], [0.17, 0.068]]) {
      ctx.beginPath();
      ctx.arc(X(x), Y(y), 4.5, 0, TAU);
      ctx.fillStyle = INK.white;
      ctx.fill();
    }
    const r0 = ATLAS.stripRow;
    stroke(ctx, [[512 + 30, r0 + 25], [512 + 20 + 0.288 * S - 10, r0 + 25]], INK.white, 3.2, [9, 7]);
    for (let i = 0; i < 4; i++) flower(ctx, 512 + 20 + (0.045 + i * 0.066) * S, r0 + 25, 11, INK.white, "#ffd98a");
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.name = "hero-atlas";
    return tex;
  }

  // app/hero/machine.js
  var COL = {
    mint: 10411983,
    liner: 4165510,
    cream: 16774108,
    pink: 16169160,
    deep: 15630240,
    wood: 15318922,
    steel: 16054008,
    brass: 16765562,
    brassLight: 16774095,
    rose: 16753594,
    sun: 16764762
  };
  function buildMachine(THREE, kit, mats) {
    const { V, paint, merge, box, boxAt, rbox, cylX, cylY, cylZ, sphere, torus, lathe, polyShape, rectPts, extrude, flat, prismX, circleProfile, spurGear, bevelGear, rod: rodGeo } = kit;
    const { PLATE_Y: PLATE_Y3, NEEDLE_X: NX, SHAFT_Y: SY } = P;
    const A = P.arm, H = P.head, PL = P.pillar, B = P.bed, O = P.bedOpen, W = P.wheel, F = P.frame, T = P.takeup, TH = P.thread;
    const root = new THREE.Group();
    root.name = "machine";
    const geos = [];
    const mesh = (geo, mat, parent = root, name = "") => {
      geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      parent.add(m);
      return m;
    };
    const group = (parent = root, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const xz = (pts) => pts.map(([x, z]) => [x, -z]);
    const c = (g, hex) => paint(g, hex);
    const sp = [];
    const t = A.wall;
    const outerXY = [[A.x0, H.y0], [H.x1, H.y0], [H.x1, A.y0], [PL.x0, A.y0], [PL.x0, 0], [PL.x1, 0], [A.x1, A.y1], [A.x0, A.y1]];
    const innerXY = [[A.x0 + t, H.y0 + t], [H.x1 - t, H.y0 + t], [H.x1 - t, A.y0 + t], [PL.x0 + t, A.y0 + t], [PL.x0 + t, t], [PL.x1 - t, t], [A.x1 - t, A.y1 - A.topWall], [A.x0 + t, A.y1 - A.topWall]];
    const innerR = [0.013, 6e-3, 0.016, 0.018, 0, 0, 0.02, 0.02];
    sp.push(c(extrude(polyShape(outerXY, [0.02, 0.012, 0.01, 0.012, 0, 0, A.corner, A.corner], [{ pts: innerXY, r: innerR }]), A.z0, A.z1, { bevel: 25e-4 }), COL.mint));
    sp.push(c(extrude(polyShape(innerXY, innerR), A.z0, A.z0 + t), COL.liner));
    const bc = B.corner, zi = B.z1 - B.wall, w = B.wall;
    sp.push(c(extrude(polyShape(
      xz([[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [O.frontX1, B.z1], [O.frontX1, zi], [B.x1 - w, zi], [B.x1 - w, B.z0 + w], [B.x0 + w, B.z0 + w], [B.x0 + w, zi], [O.frontX0, zi], [O.frontX0, B.z1], [B.x0, B.z1]]),
      [bc, bc, bc, 0, 0, 0.018, 0.018, 0.018, 0.018, 0, 0, bc]
    ), 0, PLATE_Y3 - B.top, { plane: "xz" }), COL.mint));
    sp.push(c(extrude(polyShape(xz(rectPts(B.x0 + 4e-3, B.x1 - 4e-3, B.z0 + 4e-3, B.z1 - 4e-3)), 0.02), 0, B.floor, { plane: "xz" }), COL.liner));
    sp.push(c(extrude(polyShape(
      xz([[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [PL.x0, B.z1], [PL.x0, A.z1], [PL.x1, A.z1], [PL.x1, O.z0], [O.x0, O.z0], [O.x0, B.z1], [B.x0, B.z1]]),
      [bc, bc, bc, 4e-3, 0, 0, 0, 8e-3, 4e-3, bc],
      [{ pts: xz(rectPts(NX - P.needleHole.hx, NX + P.needleHole.hx, -P.needleHole.hz, P.needleHole.hz)), r: 4e-3 }]
    ), PLATE_Y3 - B.top, PLATE_Y3, { bevel: 15e-4, plane: "xz" }), COL.mint));
    sp.push(c(cylX(W.bossR, A.x1 - 2e-3, 0.241, SY, 0, 24), COL.mint));
    sp.push(c(rbox(0.082, 0.098, SY - 0.013, SY + 0.013, A.z0 + t, 0.011), COL.cream));
    sp.push(c(rbox(-0.078, -0.048, A.y0 + t, SY + 0.016, -0.045, 0.014, 4e-3), COL.pink));
    sp.push(c(rbox(0.156, 0.184, 0.118, 0.136, A.z0 + t, -2e-3), COL.cream));
    sp.push(c(rbox(0.092, 0.104, B.floor, 0.034, -0.035, -0.013), COL.cream));
    sp.push(c(rbox(-0.062, -0.05, B.floor, 0.033, -0.035, 0.01), COL.cream));
    sp.push(c(rbox(T.webX0 - 15e-4, T.webX0 + 4e-3, T.oy - 8e-3, A.y1 - A.topWall, T.oz - 8e-3, T.oz + 8e-3), COL.cream));
    sp.push(c(cylZ(65e-4, A.z0 + t, -6e-3, NX, F.pivotY, 12), COL.cream));
    sp.push(c(cylX(0.0105, P.hook.x0 - 4e-3, P.hook.x1 + 5e-4, P.hookShaft.y, 0, 16), COL.cream));
    sp.push(c(cylZ(6e-3, TH.tension[2] + 35e-4, TH.tension[2] + 0.012, TH.tension[0], TH.tension[1], 14), COL.deep));
    sp.push(c(cylX(8e-3, A.x0 - 0.01, A.x0 + 1e-3, P.lever.pivot[1], P.lever.pivot[2], 12), COL.cream));
    const [sx, sy, sz] = TH.spool;
    sp.push(c(cylY(TH.flangeR, sy + 1e-3, sy + 4e-3, sx, sz, 18), COL.wood));
    sp.push(c(cylY(TH.flangeR, sy + TH.spoolH - 3e-3, sy + TH.spoolH, sx, sz, 18), COL.wood));
    const bodyStatic = mesh(merge(sp), mats.paint, root, "body");
    const sm = [];
    const pl = P.plate;
    const slots = [{ pts: xz(rectPts(NX - pl.slotHX, NX + pl.slotHX, -pl.slotHZ, pl.slotHZ)), r: 2e-3 }];
    for (const rz of P.feed.rowsZ) slots.push({ pts: xz(rectPts(NX - 0.0205, NX + 0.0205, rz - 3e-3, rz + 3e-3)), r: 15e-4 });
    sm.push(c(extrude(polyShape(xz(rectPts(pl.x0, pl.x1, pl.z0, pl.z1)), 8e-3, slots), PLATE_Y3 - 4e-4, PLATE_Y3 + pl.t - 4e-4, { plane: "xz", curve: 3 }), COL.steel));
    for (const [x, z] of [[pl.x0 + 9e-3, pl.z1 - 9e-3], [pl.x1 - 9e-3, pl.z0 + 9e-3]]) sm.push(c(cylY(3e-3, PLATE_Y3, PLATE_Y3 + 14e-4, x, z, 8), COL.brass));
    sm.push(c(cylY(6e-3, H.y0 - 8e-3, H.y0 + 2e-3, P.foot.barX, P.foot.barZ, 10), COL.steel));
    sm.push(c(cylY(2e-3, sy, sy + TH.spoolH + 8e-3, sx, sz, 8), COL.steel));
    sm.push(c(cylY(15e-4, A.y1, TH.g0[1] - 3e-3, TH.g0[0], TH.g0[2], 6), COL.steel));
    sm.push(c(torus(3e-3, 9e-4, TH.g0[0], TH.g0[1], TH.g0[2], "x"), COL.steel));
    for (const g of [TH.g1, TH.g2]) {
      sm.push(c(torus(3e-3, 9e-4, g[0], g[1], g[2], "y"), COL.steel));
      sm.push(c(rodGeo(11e-4, V(g[0], H.y0 + 2e-3, A.z1 - 3e-3), V(g[0], g[1], g[2] - 3e-3), 5), COL.steel));
    }
    const [tx, ty, tz] = TH.tension;
    sm.push(c(cylZ(2e-3, A.z1 - 2e-3, tz + 0.012, tx, ty, 8), COL.steel));
    sm.push(c(cylZ(9e-3, tz - 25e-4, tz - 5e-4, tx, ty, 18), COL.steel));
    sm.push(c(cylZ(9e-3, tz + 5e-4, tz + 25e-4, tx, ty, 18), COL.steel));
    sm.push(c(cylX(2e-3, T.leverX - 5e-3, T.webX0 + 4e-3, T.oy, T.oz, 8), COL.steel));
    sm.push(c(cylZ(25e-4, A.z0 + t, 8e-3, NX, F.pivotY, 8), COL.steel));
    mesh(merge(sm, { uv: "box" }), mats.metal, root, "fixed-metal");
    const Ob = V(P.vert.x, P.vert.yBot, P.vert.zBot), Ot = V(P.vert.x, SY, P.vert.zTop);
    const dAxis = Ot.clone().sub(Ob), Lv = dAxis.length();
    dAxis.normalize();
    const X = V(1, 0, 0), qv = new THREE.Quaternion().setFromUnitVectors(X, dAxis), qvInv = qv.clone().invert();
    const az = (v) => Math.atan2(v.z, v.y);
    const tauB = TAU / P.bevel.N;
    const mTop = V(-1, 0, 0).sub(dAxis).normalize();
    const mBot = dAxis.clone().add(V(-1, 0, 0)).normalize();
    const sv = Math.sign(V().crossVectors(X, mTop).dot(V().crossVectors(dAxis, mTop))) || -1;
    const sl = sv * (Math.sign(V().crossVectors(dAxis, mBot).dot(V().crossVectors(X, mBot))) || -1);
    const sh = -sl;
    const ratio = P.spur.N5 / P.spur.N6;
    const hookAt = (phi) => sh * ratio * (phi - P.hook.phiC);
    const gearC = { c1: COL.brass, c2: COL.brassLight };
    const upper = group(root, 0, SY, 0);
    const U = P.upper, CR = P.crank;
    const up = [c(cylX(U.r, U.x0, U.x1, 0, 0, 12), COL.steel)];
    up.push(bevelGear({ ...P.bevel, dir: -1, ...gearC }).rotateX(az(mTop)).translate(P.vert.x, 0, 0));
    up.push(prismX(circleProfile(CR.discR, kit.seg(28, 12)), U.r, CR.discX0, CR.discX1, (i, part) => part === "cap" && Math.floor(i / kit.seg(28, 12) * 4) % 2 ? COL.brassLight : COL.brass));
    up.push(c(cylX(CR.pinR, CR.rodX - CR.rodT / 2 - 1e-3, CR.discX0, CR.r, 0, 8), COL.steel));
    up.push(prismX(circleProfile(T.webR, kit.seg(24, 12)), U.r, T.webX0, T.webX1, () => COL.rose));
    up.push(c(cylX(3e-3, T.couplerX - 4e-3, T.webX0, T.r * Math.cos(T.phase), T.r * Math.sin(T.phase), 8), COL.steel));
    for (const x of [0.045, -0.02]) {
      up.push(c(cylX(95e-4, x - 4e-3, x + 4e-3, 0, 0, 14), COL.steel));
      up.push(c(boxAt(x - 3e-3, x + 3e-3, 8e-3, 0.017, -3e-3, 3e-3), COL.deep));
    }
    mesh(merge(up, { uv: "box" }), mats.metal, upper, "upper-shaft");
    const wh = [];
    const rc = W.R - W.rimT / 2, hw = W.rimW / 2, ht = W.rimT / 2, cr = 5e-3, prof = [];
    for (const [cx, cy, a0] of [[hw - cr, ht - cr, 0], [-(hw - cr), ht - cr, Math.PI / 2], [-(hw - cr), -(ht - cr), Math.PI], [hw - cr, -(ht - cr), 1.5 * Math.PI]])
      for (let i = 0; i <= 3; i++) {
        const a = a0 + i / 3 * (Math.PI / 2);
        prof.push([rc + cy + cr * Math.sin(a), W.rimX + cx + cr * Math.cos(a)]);
      }
    prof.reverse();
    prof.push(prof[0]);
    {
      const nSeg = 4 * Math.round(kit.seg(48, 16) / 4), per = prof.length;
      const rimG = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), nSeg).rotateZ(-Math.PI / 2);
      const cnt = rimG.attributes.position.count, col = new Float32Array(cnt * 3), ca = new THREE.Color(COL.cream), cb = new THREE.Color(COL.pink);
      for (let i = 0; i < cnt; i++) {
        const k = Math.floor(i / per) % nSeg, cc = Math.floor(k / (nSeg / 12)) % 2 ? cb : ca;
        col[i * 3] = cc.r;
        col[i * 3 + 1] = cc.g;
        col[i * 3 + 2] = cc.b;
      }
      rimG.setAttribute("color", new THREE.BufferAttribute(col, 3));
      wh.push(rimG);
    }
    for (let i = 0; i < W.spokes; i++) wh.push(c(rbox(W.rimX - 6e-3, W.rimX + 6e-3, W.hubR - 3e-3, W.R - W.rimT + 2e-3, -65e-4, 65e-4, 3e-3).rotateX(i / W.spokes * TAU), COL.cream));
    wh.push(c(lathe([[0, W.rimX - W.hubLen / 2], [W.hubR, W.rimX - W.hubLen / 2], [W.hubR, W.rimX + W.hubLen / 2 - 4e-3], [W.hubR * 0.7, W.rimX + W.hubLen / 2], [0, W.rimX + W.hubLen / 2]], "x", 20), COL.cream));
    const k0 = W.rimX + 5e-3, kr = W.knobR;
    wh.push(c(lathe([[0, k0], [kr * 0.62, k0], [kr * 0.62, k0 + 5e-3], [kr * 0.82, k0 + 0.011], [kr, k0 + 0.019], [kr * 0.96, k0 + 0.026], [kr * 0.7, k0 + 0.031], [kr * 0.3, k0 + W.knobLen + 1e-3], [0, k0 + W.knobLen + 1e-3]], "x", 18).translate(0, W.knobArm, 0), COL.deep));
    const wheel = mesh(merge(wh), mats.wheel, upper, "wheel");
    const vertBase = group(root, Ob.x, Ob.y, Ob.z);
    vertBase.quaternion.copy(qv);
    const vert = group(vertBase);
    const ve = [c(cylX(P.vert.r, 0.012, Lv - 0.014, 0, 0, 10), COL.steel)];
    ve.push(bevelGear({ ...P.bevel, dir: 1, ...gearC }).rotateX(az(mBot.clone().applyQuaternion(qvInv))));
    ve.push(bevelGear({ ...P.bevel, dir: -1, ...gearC }).rotateX(az(mTop.clone().applyQuaternion(qvInv)) + tauB / 2).translate(Lv, 0, 0));
    ve.push(c(cylX(85e-4, 0.068, 0.076, 0, 0, 14), COL.steel));
    ve.push(c(boxAt(0.069, 0.075, 7e-3, 0.016, -3e-3, 3e-3), COL.deep));
    mesh(merge(ve, { uv: "box" }), mats.metal, vert, "vertical-shaft");
    const lower = group(root, 0, P.lower.y, P.lower.z);
    const lo = [c(cylX(P.lower.r, P.lower.x0, P.lower.x1, 0, 0, 10), COL.steel)];
    lo.push(bevelGear({ ...P.bevel, dir: -1, ...gearC }).rotateX(az(mBot) + tauB / 2).translate(P.vert.x, 0, 0));
    const S = P.spur;
    lo.push(spurGear({ N: S.N5, m: S.m, x0: S.x - S.w5 / 2, x1: S.x + S.w5 / 2, bore: P.lower.r, ...gearC }).rotateX(Math.PI / 2));
    lo.push(prismX(circleProfile(P.feed.eccR, kit.seg(24, 12), P.feed.lift, 0), P.lower.r, P.feed.eccX0, P.feed.eccX1, (i, part) => part === "cap" ? COL.rose : COL.deep));
    lo.push(c(cylX(85e-4, 0.071, 0.079, 0, 0, 14), COL.steel));
    lo.push(c(boxAt(0.072, 0.078, 7e-3, 0.015, -3e-3, 3e-3), COL.deep));
    mesh(merge(lo, { uv: "box" }), mats.metal, lower, "lower-shaft");
    const hookG = group(root, 0, P.hookShaft.y, P.hookShaft.z);
    const HS = P.hookShaft, HK = P.hook;
    const ho = [c(cylX(HS.r, HS.x0, HS.x1, 0, 0, 10), COL.steel)];
    ho.push(spurGear({ N: S.N6, m: S.m, x0: S.x - S.w6 / 2, x1: S.x + S.w6 / 2, bore: HS.r, ...gearC }).rotateX(-Math.PI / 2 + TAU / S.N6 / 2 - hookAt(0)));
    const hp = [], hn = 44, lead = sh >= 0 ? 1 : -1;
    for (let i = 0; i < hn; i++) {
      const a = i / hn * TAU, g = a > 0.1 && a < 1.25;
      const r = i === 0 ? HK.R + 15e-4 : g ? 0.0125 : HK.R;
      hp.push([r * Math.cos(a * lead), r * Math.sin(a * lead)]);
    }
    if (lead < 0) hp.reverse();
    ho.push(prismX(hp, 0.0108, HK.x0, HK.x1, (i) => {
      const j = lead < 0 ? hn - 1 - i : i;
      return j >= hn - 4 || j === 0 ? COL.deep : COL.steel;
    }));
    mesh(merge(ho, { uv: "box" }), mats.metal, hookG, "hook");
    const rodG = group(root);
    mesh(merge([c(boxAt(-25e-4, 25e-4, -CR.L + 4e-3, -4e-3, -3e-3, 3e-3), COL.rose), c(cylX(65e-4, -3e-3, 3e-3, 0, 0, 12), COL.rose), c(cylX(55e-4, -3e-3, 3e-3, -CR.L, 0, 12), COL.rose)], { uv: "box" }), mats.metal, rodG, "conrod");
    const frame = group(root, NX, F.pivotY, 0);
    const fy = (y) => y - F.pivotY, fx = F.spineX;
    mesh(merge([
      c(cylZ(6e-3, -8e-3, 6e-3, 0, 0, 12), COL.steel),
      c(boxAt(fx - 3e-3, 4e-3, -4e-3, 4e-3, -4e-3, 4e-3), COL.steel),
      c(boxAt(fx - 3e-3, fx + 3e-3, fy(F.lugBotY) - 4e-3, 0, -4e-3, 4e-3), COL.steel),
      c(boxAt(fx, 55e-4, fy(F.lugTopY) - 5e-3, fy(F.lugTopY) + 5e-3, -6e-3, 6e-3), COL.brass),
      c(boxAt(fx, 55e-4, fy(F.lugBotY) - 4e-3, fy(F.lugBotY) + 4e-3, -6e-3, 6e-3), COL.brass),
      c(boxAt(fx - 3e-3, fx + 3e-3, fy(F.rodY) - 3e-3, fy(F.rodY) + 3e-3, F.rodZ - 3e-3, -4e-3), COL.steel)
    ], { uv: "box" }), mats.metal, frame, "needle-frame");
    const bar = group(frame);
    const ND = P.needle;
    mesh(merge([
      c(cylY(5e-5, 0, 4e-3, 0, 0, 6, ND.r), COL.steel),
      c(cylY(ND.r, 4e-3, ND.len, 0, 0, 6), COL.steel),
      c(rbox(-ND.clampW / 2, ND.clampW / 2, ND.len, ND.len + ND.clampH, -ND.clampW / 2, ND.clampW / 2, 3e-3), COL.deep),
      // 針留め（上下するのが見える色）
      c(cylX(2e-3, ND.clampW / 2 - 1e-3, ND.clampW / 2 + 4e-3, ND.len + ND.clampH / 2, 0, 6), COL.brass),
      c(cylY(ND.barR, ND.len + ND.clampH, ND.barTop, 0, 0, 10), COL.steel),
      c(cylX(3e-3, 0, CR.rodX - NX + 3e-3, WRIST, 0, 8), COL.steel)
    ], { uv: "box" }), mats.metal, bar, "needle-bar");
    const zig = group(root);
    mesh(merge([c(cylX(2e-3, NX + fx, -0.058, F.rodY, F.rodZ, 6), COL.steel), c(cylX(4e-3, -0.088, -0.082, F.rodY, F.rodZ, 8), COL.deep)], { uv: "box" }), mats.metal, zig, "zigzag-rod");
    const coupler = group(root, T.couplerX, SY, 0);
    mesh(merge([c(boxAt(-25e-4, 25e-4, 3e-3, T.c - 3e-3, -25e-4, 25e-4), COL.brass), c(cylX(55e-4, -25e-4, 25e-4, 0, 0, 10), COL.brass), c(cylX(45e-4, -25e-4, 25e-4, T.c, 0, 10), COL.brass)], { uv: "box" }), mats.metal, coupler, "takeup-link");
    const takeLever = group(root, T.leverX, T.oy, T.oz);
    mesh(merge([
      c(boxAt(-25e-4, 25e-4, -3e-3, 3e-3, -T.rho, T.tip - 3e-3), COL.steel),
      c(cylX(6e-3, -3e-3, 3e-3, 0, 0, 10), COL.steel),
      c(cylX(2e-3, -3e-3, T.couplerX - T.leverX + 3e-3, 0, -T.rho, 6), COL.steel),
      c(torus(35e-4, 12e-4, 0, 0, T.tip, "x", 10), COL.steel)
    ], { uv: "box" }), mats.metal, takeLever, "takeup-lever");
    const feed = group(root);
    const FD = P.feed, topY = PLATE_Y3 + FD.rest, fb = flat();
    for (const rz of FD.rowsZ) for (const cx of FD.colsX) {
      const x0 = NX + cx - FD.toothW / 2, x1 = NX + cx + FD.toothW / 2, z0 = rz - FD.toothD / 2, z1 = rz + FD.toothD / 2, yb = topY - FD.toothH;
      fb.quad(V(x0, yb, z1), V(x1, yb, z1), V(x1, topY, z0), V(x0, topY, z0), V(0, 1, 1), COL.steel);
      fb.quad(V(x0, yb, z0), V(x0, topY, z0), V(x1, topY, z0), V(x1, yb, z0), V(0, 0, -1), COL.steel);
      fb.tri(V(x0, yb, z0), V(x0, yb, z1), V(x0, topY, z0), V(-1, 0, 0), COL.steel);
      fb.tri(V(x1, yb, z0), V(x1, yb, z1), V(x1, topY, z0), V(1, 0, 0), COL.steel);
    }
    const yokeY = P.lower.y, yokeZ = P.lower.z, win = FD.eccR, wz = FD.eccR + 0.01;
    mesh(merge([
      fb.done(),
      c(boxAt(NX - 0.021, NX + 0.021, topY - FD.toothH - 2e-3, topY - FD.toothH, -0.016, 0.022), COL.steel),
      c(boxAt(NX - 0.025, NX - 0.02, topY - 0.012, topY - FD.toothH, -0.053, -0.01), COL.steel),
      c(boxAt(NX - 0.025, FD.eccX1 - 1e-3, 0.03, 0.035, -0.053, -0.047), COL.steel),
      c(extrude(polyShape(
        rectPts(-(yokeZ + wz + 4e-3), -(yokeZ - wz - 9e-3), yokeY - win - 3e-3, yokeY + win + 3e-3),
        3e-3,
        [{ pts: rectPts(-(yokeZ + wz), -(yokeZ - wz), yokeY - win, yokeY + win), r: 2e-3 }]
      ), FD.eccX0 + 1e-3, FD.eccX1 - 1e-3, { plane: "zy", curve: 3 }), COL.brass)
    ], { uv: "box" }), mats.metal, feed, "feed-dog");
    const FT = P.foot, footY = PLATE_Y3 + P.cloth.lift + FT.gap;
    const foot = group(root);
    mesh(merge([
      c(extrude(polyShape(xz(rectPts(NX - FT.hx, NX + FT.hx, FT.z0, FT.z1)), 4e-3, [{ pts: xz(rectPts(NX - 0.019, NX + 0.019, -3e-3, 3e-3)), r: 2e-3 }]), footY, footY + FT.t, { plane: "xz", curve: 3 }), COL.steel),
      c(rbox(FT.barX - 6e-3, NX - FT.hx + 4e-3, footY + 5e-4, 0.074, FT.barZ - 6e-3, FT.barZ + 6e-3, 2e-3), COL.steel),
      c(cylY(FT.barR, 0.068, 0.2, FT.barX, FT.barZ, 8), COL.steel)
    ], { uv: "box" }), mats.metal, foot, "presser-foot");
    const LV = P.lever;
    const lever = group(root, ...LV.pivot);
    mesh(merge([c(cylX(7e-3, -6e-3, 6e-3, 0, 0, 12), COL.cream), c(rbox(-3e-3, 3e-3, -4e-3, 4e-3, 0, LV.len - 6e-3, 2e-3), COL.cream), c(sphere(LV.knobR, 0, 0, LV.len), COL.sun)]), mats.lever, lever, "lever");
    const cov = 4e-3;
    const coverXY = [
      [A.x0 + t - cov, H.y0 + t - cov],
      [H.x1 - t + cov, H.y0 + t - cov],
      [H.x1 - t + cov, A.y0 + t - cov],
      [PL.x0 + t - cov, A.y0 + t - cov],
      [PL.x0 + t - cov, PLATE_Y3 + 2e-3],
      [PL.x1 - t + cov, PLATE_Y3 + 2e-3],
      [A.x1 - t + cov, A.y1 - A.topWall + cov],
      [A.x0 + t - cov, A.y1 - A.topWall + cov]
    ];
    const slotX0 = T.leverX - 4e-3, slotX1 = T.leverX + 4e-3;
    const cg = extrude(polyShape(coverXY, [0.015, 8e-3, 0.012, 0.014, 4e-3, 4e-3, 0.024, 0.024], [{ pts: rectPts(slotX0, slotX1, 0.244, 0.2925), r: 3e-3 }]), A.z1 + 3e-4, A.z1 + 5e-3, { bevel: 12e-4 });
    const uvFront = (g, fn) => {
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const q = n.getZ(i) > 0.7 ? fn(p.getX(i), p.getY(i)) : ATLAS.flatUV;
        uv.setXY(i, q[0], q[1]);
      }
      return g;
    };
    const coverArmC = V(-5e-3, 0.2, A.z1 + 25e-4), coverBedC = V(0.095, 0.03, 0.1);
    const coverArm = group(root, coverArmC.x, coverArmC.y, coverArmC.z);
    const cga = merge([uvFront(cg, coverUV)], { uv: "keep", weld: true }).translate(-coverArmC.x, -coverArmC.y, -coverArmC.z);
    cga.deleteAttribute("color");
    mesh(cga, mats.cover, coverArm, "cover-arm");
    const coverBed = group(root, coverBedC.x, coverBedC.y, coverBedC.z);
    const lip = uvFront(extrude(polyShape(xz(rectPts(O.x0 + 1e-3, O.x1 - 1e-3, O.z0 + 1e-3, B.z1)), [7e-3, 1e-3, 3e-3, 3e-3]), PLATE_Y3 - B.top + 2e-4, PLATE_Y3, { bevel: 15e-4, plane: "xz" }), () => ATLAS.flatUV);
    const front = uvFront(rbox(O.frontX0 + 1e-3, O.frontX1 - 1e-3, 1e-3, PLATE_Y3 - B.top - 2e-4, zi, B.z1, 2e-3), stripUV);
    const cgb = merge([lip, front], { uv: "keep", weld: true }).translate(-coverBedC.x, -coverBedC.y, -coverBedC.z);
    cgb.deleteAttribute("color");
    mesh(cgb, mats.cover, coverBed, "cover-bed");
    const D = P.dial;
    const dial = group(root, ...D.c);
    const face = new THREE.CircleGeometry(D.R, kit.seg(36, 16)).translate(0, 0, D.t / 2 + 5e-4);
    {
      const uv = face.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
    }
    const rim = cylZ(D.R, -D.t / 2, D.t / 2, 0, 0, 36);
    {
      const uv = rim.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 4e-3, 0.99);
    }
    const dg = merge([face, rim], { uv: "keep", weld: true });
    dg.deleteAttribute("color");
    mesh(dg, mats.dial, dial, "pattern-dial");
    const spoolGeo = cylY(TH.spoolR, sy + 4e-3, sy + TH.spoolH - 3e-3, sx, sz, 18);
    spoolGeo.deleteAttribute("uv");
    mesh(spoolGeo, mats.thread, root, "spool-thread");
    const proxy = (part, geo, parent, x, y, z) => {
      const m = mesh(geo, mats.hidden, parent, "hit-" + part);
      m.position.set(x, y, z);
      m.userData.part = part;
      return m;
    };
    const hit = {
      wheel: proxy("wheel", new THREE.CylinderGeometry(0.1, 0.1, 0.09, 16).rotateZ(Math.PI / 2), root, W.c[0] + 0.01, W.c[1], W.c[2]),
      lever: proxy("lever", box(0.075, 0.13, 0.1), root, LV.pivot[0] - 2e-3, LV.pivot[1], LV.pivot[2] + 0.045),
      coverArm: proxy("cover", box(0.44, 0.17, 0.05), root, -5e-3, 0.235, 0.085),
      coverBed: proxy("cover", box(0.3, 0.07, 0.06), root, 0.095, 0.035, 0.15)
    };
    const out = { eye: V(), clamp: V(), tip: V(), sv, sl, sh };
    const tu = {}, fd = {}, pin = V(), wrist = V(), dir = V(), DOWN = V(0, -1, 0);
    const swingLen = F.pivotY - PLATE_Y3;
    function pose(theta, xn, feedS) {
      upper.rotation.x = theta;
      vert.rotation.x = sv * theta;
      lower.rotation.x = sl * theta;
      hookG.rotation.x = hookAt(theta);
      const tipY = needleTipY(theta);
      const beta = Math.asin(clamp(xn / swingLen, -0.2, 0.2)), cb = Math.cos(beta), sb = Math.sin(beta);
      frame.rotation.z = beta;
      bar.position.y = tipY - F.pivotY;
      const lx = CR.rodX - NX, ly = tipY + WRIST - F.pivotY;
      wrist.set(NX + lx * cb - ly * sb, F.pivotY + lx * sb + ly * cb, 0);
      pin.set(CR.rodX, SY + CR.r * Math.cos(theta), CR.r * Math.sin(theta));
      dir.subVectors(wrist, pin);
      const dist = dir.length() || CR.L;
      rodG.position.copy(pin);
      rodG.quaternion.setFromUnitVectors(DOWN, dir.multiplyScalar(1 / dist));
      rodG.scale.y = dist / CR.L;
      zig.position.x = (F.pivotY - F.rodY) * sb;
      takeUp(theta, tu);
      coupler.position.set(T.couplerX, tu.py, tu.pz);
      coupler.rotation.x = tu.coupler;
      coupler.scale.y = tu.couplerLen / T.c;
      takeLever.rotation.x = tu.lever;
      feedDog(theta, feedS, fd);
      feed.position.set(0, fd.y - topY, fd.z);
      const ey = tipY + ND.eye - F.pivotY, cy = tipY + ND.len + ND.clampH - F.pivotY;
      out.eye.set(NX - ey * sb, F.pivotY + ey * cb, 12e-4);
      out.clamp.set(NX - cy * sb + 2e-3, F.pivotY + cy * cb, 6e-3);
      out.tip.set(T.leverX, tu.ty, tu.tz);
      out.tipY = tipY;
      return out;
    }
    return {
      root,
      geos,
      pose,
      hit,
      wheel,
      lever,
      foot,
      coverArm,
      coverBed,
      coverArmC,
      coverBedC,
      dial,
      bodyStatic,
      coverOutline: coverXY,
      setFoot(lift, leverAngle) {
        foot.position.y = lift;
        lever.rotation.x = leverAngle;
      }
    };
  }

  // app/hero/cloth.js
  var f = (v) => v.toFixed(5);
  function patchDrape(material, uniforms) {
    const C = P.cloth, HH = P.PLATE_Y + C.lift - C.tableY;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDrape = uniforms.uDrape;
      shader.uniforms.uFlutter = uniforms.uFlutter;
      shader.uniforms.uHeroTime = uniforms.uHeroTime;
      shader.uniforms.uFold = uniforms.uFold;
      shader.uniforms.uFoldAt = uniforms.uFoldAt;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
uniform float uDrape; uniform float uFlutter; uniform float uHeroTime; uniform float uFold; uniform float uFoldAt;
float heroS(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float heroDS(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return 6.0 * t * (1.0 - t) / (e1 - e0); }
// \u53F0\u306E\u4E0A\u3067 1\u3001\u673A\u306E\u4E0A\u3067 0\uFF08\u524D\u306F ${f(C.frontZ0)}\u2192${f(C.frontZ1)}\u3001\u5965\u306F ${f(C.backZ0)}\u2192${f(C.backZ1)} \u3067\u4E0B\u308A\u308B\uFF09
float heroH(float z) { return ${f(HH)} * (1.0 - heroS(${f(C.frontZ0)}, ${f(C.frontZ1)}, z)) * heroS(${f(C.backZ1)}, ${f(C.backZ0)}, z); }
float heroDH(float z) { return ${f(HH)} * ((1.0 - heroS(${f(C.frontZ0)}, ${f(C.frontZ1)}, z)) * heroDS(${f(C.backZ1)}, ${f(C.backZ0)}, z) - heroDS(${f(C.frontZ0)}, ${f(C.frontZ1)}, z) * heroS(${f(C.backZ1)}, ${f(C.backZ0)}, z)); }`).replace("#include <defaultnormal_vertex>", `#include <defaultnormal_vertex>
{
  vec4 heroN = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    heroN = instanceMatrix * heroN;
  #endif
  heroN = modelMatrix * heroN;
  transformedNormal -= uDrape * heroDH( heroN.z ) * viewMatrix[ 2 ].xyz;
  transformedNormal /= max( length( transformedNormal ), 1e-4 );
}`).replace("#include <project_vertex>", `vec4 heroP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  heroP = instanceMatrix * heroP;
#endif
// \u3072\u3082\u306B\u639B\u3051\u308B\u3068\u304D\u306E\u4E8C\u3064\u6298\u308A\uFF1AuFoldAt \u3088\u308A\u5148\u3092\u3001\u6298\u308A\u76EE\u306E\u307E\u308F\u308A\u306B\u88CF\u3078\u56DE\u3059\uFF08uFold 0\u21921 \u3067 0\xB0\u2192180\xB0\uFF09
float heroD = max( heroP.z - uFoldAt, 0.0 );
float heroA = uFold * 3.14159265;
heroP.z -= heroD * ( 1.0 - cos( heroA ) );
heroP.y -= heroD * sin( heroA ) + 0.004 * uFold * step( 1e-5, heroD );
heroP.y += uFlutter * 0.012 * sin( heroP.z * 20.0 - uHeroTime * 8.0 );
heroP = modelMatrix * heroP;
heroP.y += uDrape * heroH( heroP.z );
vec4 mvPosition = viewMatrix * heroP;
gl_Position = projectionMatrix * mvPosition;`);
    };
    material.customProgramCacheKey = () => "hero-drape";
  }
  function makeClothKit(THREE, kit, textures, timeUniform, hiddenMat) {
    const C = P.cloth;
    const geos = [];
    const fabricGeo = new THREE.PlaneGeometry(C.w, C.len, 4, kit.seg(56, 28)).rotateX(-Math.PI / 2).translate(0, 0, C.len / 2);
    {
      const uv = fabricGeo.attributes.uv, p = fabricGeo.attributes.position, col = new Float32Array(p.count * 3), hw = C.w / 2, eps = 1e-5;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        if (Math.abs(Math.abs(x) - hw / 2) < eps) p.setX(i, Math.sign(x) * (hw - C.hem));
        uv.setXY(i, (p.getX(i) / C.w + 0.5) * (C.w / 0.2), uv.getY(i) * (C.len / 0.2));
        const edge = Math.abs(x) > hw - eps || p.getZ(i) < eps || p.getZ(i) > C.len - eps;
        col[i * 3] = 1;
        col[i * 3 + 1] = edge ? 0.62 : 1;
        col[i * 3 + 2] = edge ? 0.72 : 1;
      }
      fabricGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    }
    const stitchGeo = new THREE.CylinderGeometry(C.stitchW / 2, C.stitchW / 2, 1, 6, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, C.stitchH / (C.stitchW / 2), 1);
    stitchGeo.deleteAttribute("uv");
    const proxyGeo = new THREE.BoxGeometry(C.w + 0.05, 0.05, C.len + 0.03).translate(0, 0.02, C.len / 2);
    geos.push(fabricGeo, stitchGeo, proxyGeo);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
    function make(look) {
      const u = { uDrape: { value: 1 }, uFlutter: { value: 0 }, uHeroTime: timeUniform, uFold: { value: 0 }, uFoldAt: { value: C.len } };
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: textures[look.tex] || textures.linen || null, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
      const stitchMat = new THREE.MeshStandardMaterial({ color: look.thread, roughness: 0.7, metalness: 0 });
      mat.color.setRGB(look.tint[0], look.tint[1], look.tint[2]);
      patchDrape(mat, u);
      patchDrape(stitchMat, u);
      const group = new THREE.Group();
      group.name = "cloth";
      const mesh = new THREE.Mesh(fabricGeo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      const stitches = new THREE.InstancedMesh(stitchGeo, stitchMat, C.maxStitch);
      stitches.count = 0;
      stitches.position.y = 2e-4;
      stitches.frustumCulled = false;
      group.add(stitches);
      const proxy = new THREE.Mesh(proxyGeo, hiddenMat);
      proxy.userData.part = "fabric";
      group.add(proxy);
      return { group, mat, stitchMat, stitches, proxy, u, look };
    }
    function lay(cloth, pts, n) {
      const st = cloth.stitches;
      n = Math.min(n, C.maxStitch, pts.length);
      for (let k = st.count; k < n; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[k];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        q.setFromAxisAngle(yAxis, len > 1e-6 ? Math.atan2(dx, dz) : 0);
        pos.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
        scl.set(1, 1, Math.max(len, 2e-3) + 12e-4);
        m4.compose(pos, q, scl);
        st.setMatrixAt(k, m4);
      }
      if (n !== st.count) {
        st.count = n;
        st.instanceMatrix.needsUpdate = true;
      }
    }
    function dispose(cloth) {
      cloth.group.removeFromParent();
      cloth.mat.dispose();
      cloth.stitchMat.dispose();
      cloth.stitches.dispose();
    }
    return { make, lay, dispose, geos, height: P.PLATE_Y + C.lift - C.tableY };
  }

  // app/hero/hero.js
  var PLATE_Y2 = P.PLATE_Y;
  var NEEDLE_X2 = P.NEEDLE_X;
  var WHEEL_C = P.wheel.c;
  var PATTERNS = ["wave", "star", "heart"];
  var LOOKS = [
    { tex: "linen", tint: [1.08, 1.08, 1.08], thread: 14236270 },
    // 生成り × いちご色
    { tex: "linen", tint: [0.74, 1.12, 1.1], thread: 15763968 },
    // 若草 × みかん色
    { tex: "linen", tint: [1.2, 0.8, 0.95], thread: 14689359 },
    // さくら × 赤
    { tex: "floral", tint: [1, 1, 1], thread: 3112920 }
    // 小花 × 青
  ];
  var ICON_COLORS = ["#d93a6e", "#f08a00", "#e0244f"];
  var HALF = Math.PI / 2;
  var MAX_SPEED = 6 * Math.PI;
  var TAP_SPEED = 3 * Math.PI;
  function createHero(THREE, opts = {}) {
    const tex = opts.textures || {};
    const detail = clamp(finite(opts.tier && opts.tier.detail, 1), 0.4, 1.5);
    const onStage = opts.onStage || (() => {
    });
    const onCue = opts.onCue || (() => {
    });
    const slots = opts.displaySlots || [];
    const addons = opts.addons || (typeof window !== "undefined" ? window.THREE_ADDONS : null);
    const kit = makeKit(THREE, addons, detail);
    const C = P.cloth, W = P.wheel, LV = P.lever, NX = P.NEEDLE_X;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const root = new THREE.Group();
    root.name = "hero";
    const own = { geos: [], mats: [], texs: [], inst: [] };
    const M = (m) => (own.mats.push(m), m);
    const time = { value: 0 };
    const mats = {
      paint: M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04 })),
      metal: M(new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.metal || null, roughness: 0.34, metalness: 0.82 })),
      wheel: M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.04 })),
      lever: M(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.04 })),
      cover: M(new THREE.MeshStandardMaterial({ color: 16777215, roughness: 0.45, metalness: 0.04 })),
      dial: M(new THREE.MeshStandardMaterial({ color: 16777215, roughness: 0.5, metalness: 0.02 })),
      thread: M(new THREE.MeshStandardMaterial({ color: LOOKS[0].thread, roughness: 0.75, metalness: 0 })),
      hidden: M(new THREE.MeshBasicMaterial({ visible: false })),
      spark: M(new THREE.MeshBasicMaterial({ color: 16773288, side: THREE.DoubleSide, toneMapped: false }))
    };
    const machine = buildMachine(THREE, kit, mats);
    root.add(machine.root);
    own.geos.push(...machine.geos);
    let atlas = null;
    try {
      atlas = makeAtlas(THREE, machine.coverOutline, ICON_COLORS, opts.tier && opts.tier.maxTextureSize || 1024);
      own.texs.push(atlas);
    } catch (e) {
      atlas = null;
    }
    if (atlas) {
      mats.cover.map = atlas;
      mats.dial.map = atlas;
    } else {
      mats.cover.color.set(16169160);
      mats.dial.color.set(16774108);
    }
    const clothKit = makeClothKit(THREE, kit, tex, time, mats.hidden);
    own.geos.push(...clothKit.geos);
    const lookOf = (round) => LOOKS[round % LOOKS.length];
    let cloth = clothKit.make(lookOf(0));
    root.add(cloth.group);
    const hung = [];
    const tube = makeTube(THREE, [14, 4], 5);
    own.geos.push(tube.geometry);
    const threadMesh = new THREE.Mesh(tube.geometry, mats.thread);
    threadMesh.frustumCulled = false;
    threadMesh.name = "thread";
    root.add(threadMesh);
    const TH = P.thread;
    const way = [V(TH.spool[0] - TH.spoolR, TH.spool[1] + TH.spoolH * 0.55, TH.spool[2]), V(...TH.g0), V(TH.tension[0], TH.tension[1] - 25e-4, TH.tension[2]), V(...TH.g1), V(), V(...TH.g2), V(), V()];
    const upPts = Array.from({ length: 14 }, () => V()), lowPts = Array.from({ length: 4 }, () => V());
    const va = V(), vb = V(), hole = V();
    const sparkGeo = (() => {
      const s = new THREE.Shape();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 0.28 : 1, a = i * Math.PI / 4;
        if (i) s.lineTo(r * Math.cos(a), r * Math.sin(a));
        else s.moveTo(r, 0);
      }
      s.closePath();
      return new THREE.ShapeGeometry(s);
    })();
    own.geos.push(sparkGeo);
    const SPARKS = 14;
    const sparks = new THREE.InstancedMesh(sparkGeo, mats.spark, SPARKS);
    sparks.visible = false;
    sparks.frustumCulled = false;
    sparks.name = "sparkles";
    own.inst.push(sparks);
    root.add(sparks);
    const sparkSeed = Array.from({ length: SPARKS }, (_, i) => {
      const a = i * 2.399963, r = 0.35 + 0.65 * (i * 0.618034 % 1);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, d: i % 5 * 0.11, s: 0.014 + 0.012 * (i * 0.37 % 1) };
    });
    const sparkC = V(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = V(), zAxis = V(0, 0, 1);
    const status = { stage: "fabric", round: 0, pattern: "wave", stitches: 0, progress: 0, crankSpeed: 0, busy: false, coverOpen: false };
    const S = {
      theta: HALF,
      thetaR: HALF,
      last: HALF,
      omega: 0,
      auto: 0,
      pts: patternPoints("wave"),
      kTarget: P.K_SEW1,
      sewing: false,
      cut: true,
      fabT: 0,
      footT: 0,
      footDown: 0,
      coverT: 0,
      finT: 0,
      wiggle: 0,
      grab: null,
      popT: 1,
      dial: 0,
      sparkT: -1,
      settle: 0
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
        case "fabric":
          return "fabric";
        case "foot":
          return "lever";
        case "sew1":
        case "sew2":
          return "wheel";
        case "cover":
          return "cover";
        default:
          return null;
      }
    }
    const WC = V(...W.c), pA = {}, pB = {}, cand = Array.from({ length: 16 }, () => ({ x: 0, y: 0, tx: 0, ty: 0, t2: 0 }));
    function wheelDrag(input) {
      let best = null, bestD = Infinity, tmax = 0;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, k = cand[i];
        va.set(0, W.knobArm * Math.cos(a), W.knobArm * Math.sin(a)).add(WC);
        input.project(va, pA);
        va.set(0, W.knobArm * Math.cos(a + 0.01), W.knobArm * Math.sin(a + 0.01)).add(WC);
        input.project(va, pB);
        k.x = pA.x;
        k.y = pA.y;
        k.tx = (pB.x - pA.x) / 0.01;
        k.ty = (pB.y - pA.y) / 0.01;
        k.t2 = k.tx * k.tx + k.ty * k.ty;
        if (k.t2 > tmax) tmax = k.t2;
      }
      for (const k of cand) {
        if (!(k.t2 >= 0.16 * tmax)) continue;
        const d = Math.hypot(k.x - input.x, k.y - input.y);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      if (!best) return 0;
      return clamp(finite((input.dx * best.tx + input.dy * best.ty) / Math.max(best.t2, 400)), -0.6, 0.6);
    }
    function updateThread(m) {
      way[4].copy(m.tip);
      way[6].copy(m.clamp);
      way[7].copy(m.eye);
      let n = 0;
      upPts[n++].copy(way[0]);
      for (let i = 1; i < 7; i++) {
        const a = way[i - 1], b = way[i], c = way[i + 1];
        const la = a.distanceTo(b) || 1e-9, lc = c.distanceTo(b) || 1e-9;
        upPts[n++].copy(b).addScaledVector(va.subVectors(a, b), Math.min(4e-3, la * 0.3) / la);
        upPts[n++].copy(b).addScaledVector(va.subVectors(c, b), Math.min(4e-3, lc * 0.3) / lc);
      }
      upPts[n++].copy(way[7]);
      tube.write(0, upPts, TH.r);
      const e = m.eye;
      if (!S.cut && status.stitches > 0) {
        const p = S.pts[Math.min(status.stitches, S.pts.length) - 1];
        hole.set(NX + p[0], P.PLATE_Y + C.lift + 8e-4, p[1] - sew.zeta);
      } else hole.set(e.x + 1e-3, Math.max(e.y - 8e-3, P.PLATE_Y + 4e-3), e.z + 0.012);
      for (let i = 0; i < 4; i++) lowPts[i].lerpVectors(e, hole, i / 3);
      tube.write(1, lowPts, TH.r);
    }
    const glowCol = new THREE.Color(16761466);
    function glow(part, t) {
      const k = 0.16 + 0.12 * Math.sin(t * TAU * 1.2);
      mats.wheel.emissive.copy(glowCol).multiplyScalar(part === "wheel" ? k : 0);
      mats.lever.emissive.copy(glowCol).multiplyScalar(part === "lever" ? k : 0);
      mats.cover.emissive.copy(glowCol).multiplyScalar(part === "cover" ? k : 0);
      cloth.mat.emissive.copy(glowCol).multiplyScalar(part === "fabric" ? k * 0.8 : 0);
    }
    function idleShake(idle) {
      if (!(idle > 2)) return 0;
      const w = (idle - 2) % 2.5;
      return w < 1.5 ? Math.sin(w * TAU * 2) : 0;
    }
    function coverPose(g, home, k, f2) {
      if (k <= 0) {
        g.position.copy(home);
        g.rotation.set(0, 0, 0);
        g.scale.setScalar(1);
        return;
      }
      g.position.set(home.x + f2.side * k, home.y + f2.hop * Math.sin(Math.PI * Math.min(1, k * 1.15)) - f2.drop * k * k, home.z + 0.02 * smooth(k * 6) + f2.out * k);
      g.rotation.set(f2.rot * k * k, 0, f2.roll * k);
      g.scale.setScalar(Math.max(1e-3, 1 - smooth((k - 0.72) / 0.28)));
    }
    const FALL_ARM = { hop: 0.06, drop: 0.17, out: 0.3, rot: -1.35, roll: -0.25, side: -0.03 };
    const FALL_BED = { hop: 0.08, drop: 0.02, out: 0.26, rot: -0.9, roll: 0.3, side: 0.05 };
    function finish(dt) {
      const t0 = S.finT;
      S.finT += dt;
      const t = S.finT;
      const cross = (x) => t0 < x && t >= x;
      S.footDown = 1 - smooth((t - 0.05) / LV.time);
      if (cross(0.28)) onCue("clunk", { gain: 0.6 });
      if (cross(0.3)) S.cut = true;
      if (cross(0.35)) onCue("slide");
      if (t >= 0.35 && t < 0.85) {
        const k = smooth((t - 0.35) / 0.5);
        cloth.u.uDrape.value = 1 - k;
        cloth.group.position.set(NX, C.tableY + clothKit.height * k + 0.02 * k, fly.z0 + (Math.max(fly.z0, 0.11) - fly.z0) * k);
      }
      if (cross(0.85)) {
        onCue("whoosh");
        cloth.u.uDrape.value = 0;
        const idx = slots.length ? status.round % slots.length : 0, slot = slots[idx];
        fly.from.copy(cloth.group.position);
        fly.fromQ.copy(cloth.group.quaternion);
        if (slot) {
          root.updateMatrixWorld(true);
          fly.to.copy(slot.position).applyMatrix4(m4.copy(root.matrixWorld).invert());
          fly.toQ.copy(slot.quaternion).multiply(q4.setFromAxisAngle(va.set(1, 0, 0), HALF));
          fly.toS = clamp(finite(slot.width / C.w, 0.5), 0.2, 1.5);
          fly.foldAt = clamp(finite(slot.height / fly.toS, C.len), C.len * 0.5, C.len);
        } else {
          fly.to.set(0.4, 0.6, -0.45);
          fly.toQ.setFromAxisAngle(va.set(1, 0, 0), HALF);
          fly.toS = 0.5;
          fly.foldAt = C.len;
        }
        cloth.u.uFoldAt.value = fly.foldAt;
      }
      if (t >= 0.85 && t < 2.45) {
        const k = smooth((t - 0.85) / 1.6), g = cloth.group;
        g.position.lerpVectors(fly.from, fly.to, k);
        g.position.y += Math.sin(k * Math.PI) * 0.3;
        g.quaternion.slerpQuaternions(fly.fromQ, fly.toQ, k);
        g.scale.setScalar(1 + (fly.toS - 1) * k);
        cloth.u.uFlutter.value = Math.sin(k * Math.PI) * 0.9 + 0.25 * k;
        cloth.u.uFold.value = fly.foldAt < C.len ? smooth((k - 0.3) / 0.6) : 0;
      }
      if (cross(2.45)) {
        onCue("sparkle");
        const idx = slots.length ? status.round % slots.length : 0;
        cloth.group.position.copy(fly.to);
        cloth.group.quaternion.copy(fly.toQ);
        cloth.group.scale.setScalar(fly.toS);
        cloth.u.uFold.value = fly.foldAt < C.len ? 1 : 0;
        const old = hung.find((h) => h.slot === idx);
        if (old) {
          clothKit.dispose(old.cloth);
          hung.splice(hung.indexOf(old), 1);
        }
        cloth.proxy.removeFromParent();
        cloth.mat.emissive.setScalar(0);
        hung.push({ cloth, slot: idx });
        S.settle = 1;
        S.sparkT = 0;
        sparkC.copy(fly.to);
        sparkC.y -= fly.foldAt * fly.toS * 0.5;
        sparkC.z += 0.03;
      }
      if (t >= 3.9) nextRound();
    }
    function updateHung(dt) {
      if (S.settle > 0 && hung.length) {
        S.settle = Math.max(0, S.settle - dt / 1.1);
        hung[hung.length - 1].cloth.u.uFlutter.value = 0.25 * S.settle * S.settle;
      }
      if (S.sparkT >= 0) {
        S.sparkT += dt;
        const T = S.sparkT, sw = slots[0] && slots[0].width || 0.15, sh = slots[0] && slots[0].height || 0.22;
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
      S.thetaR = S.theta;
      S.last = S.theta;
      S.omega = 0;
      S.auto = 0;
      S.sewing = false;
      S.cut = true;
      S.finT = 0;
      S.footDown = 0;
      S.popT = 0;
      status.stitches = 0;
      status.progress = 0;
      status.busy = false;
      status.crankSpeed = 0;
      startCloth(status.round);
      setStage("fabric");
    }
    function update(dt, input) {
      dt = clamp(finite(dt), 0, 0.05);
      time.value = finite(input.time) % 600;
      const st = status.stage, part = input.part;
      if (input.pressed) S.grab = { x: input.x, y: input.y };
      const drag = S.grab && (input.down || input.released) ? Math.hypot(input.x - S.grab.x, input.y - S.grab.y) : 0;
      S.wiggle = Math.max(0, S.wiggle - dt);
      if (!status.busy && input.pressed && part) {
        if (part === activePart()) onCue("tap");
        else {
          if (part === "wheel") S.wiggle = 0.4;
          onCue("nudge");
        }
      }
      if (!status.busy && st === "fabric" && part === "fabric" && (input.tapped || drag > 20)) {
        S.fabT = 1e-4;
        status.busy = true;
        onCue("slide");
      }
      if (S.fabT > 0) {
        S.fabT = Math.min(1, S.fabT + dt / 0.7);
        cloth.group.position.set(NX, C.tableY, C.startZ + (-S.pts[0][1] - C.startZ) * smooth(S.fabT));
        cloth.group.rotation.y = 0;
        cloth.group.scale.setScalar(1);
        if (S.fabT >= 1) {
          S.fabT = 0;
          status.busy = false;
          setStage("foot");
        }
      } else if (st === "fabric" && S.popT < 1) {
        S.popT = Math.min(1, S.popT + dt / 0.35);
        const k = S.popT - 1;
        cloth.group.scale.setScalar(1 + 2.2 * k * k * k + 1.2 * k * k);
      }
      if (!status.busy && st === "foot" && part === "lever" && (input.tapped || drag > 16)) {
        S.footT = 1e-4;
        status.busy = true;
      }
      if (S.footT > 0) {
        S.footT = Math.min(1, S.footT + dt / LV.time);
        S.footDown = S.footT;
        if (S.footT >= 1) {
          S.footT = 0;
          status.busy = false;
          onCue("clunk");
          S.sewing = true;
          S.thetaR = S.theta;
          S.last = S.theta;
          S.kTarget = status.round === 0 && !status.coverOpen ? P.K_SEW1 : P.K_TOTAL;
          setStage(status.round === 0 && !status.coverOpen ? "sew1" : "sew2");
        }
      }
      if (!status.busy && st === "cover" && part === "cover" && (input.tapped || drag > 16)) {
        S.coverT = 1e-4;
        status.busy = true;
        onCue("pop");
      }
      if (S.coverT > 0) {
        const c0 = S.coverT;
        S.coverT += dt;
        if (c0 < 0.12 && S.coverT >= 0.12) onCue("pop");
        coverPose(machine.coverArm, machine.coverArmC, clamp(S.coverT / 0.8, 0, 1), FALL_ARM);
        coverPose(machine.coverBed, machine.coverBedC, clamp((S.coverT - 0.12) / 0.8, 0, 1), FALL_BED);
        if (S.coverT >= 0.92) {
          S.coverT = 0;
          machine.coverArm.visible = false;
          machine.coverBed.visible = false;
          status.coverOpen = true;
          status.busy = false;
          S.kTarget = P.K_TOTAL;
          setStage("sew2");
        }
      }
      const sewing = (st === "sew1" || st === "sew2") && !status.busy;
      if (sewing) {
        if (part === "wheel" && input.down) {
          const d = wheelDrag(input);
          if (d > 0) {
            S.theta += d;
            S.omega = 0.6 * S.omega + 0.4 * Math.min(MAX_SPEED, d / Math.max(dt, 1 / 120));
          } else if (d < -0.01) S.wiggle = Math.max(S.wiggle, 0.2);
          else S.omega *= Math.exp(-8 * dt);
        } else {
          if (part === "wheel" && input.tapped) S.auto = Math.min(2 * TAU, S.auto + TAU);
          S.omega = Math.min(MAX_SPEED, S.omega * Math.exp(-1.5 * dt));
          if (S.omega < 0.05) S.omega = 0;
          S.theta += S.omega * dt;
        }
        if (S.auto > 0) {
          const a = Math.min(S.auto, TAP_SPEED * dt);
          S.auto -= a;
          S.theta += a;
        }
        const end = S.thetaR + TAU * S.kTarget;
        if (!(S.theta < end)) {
          S.theta = end;
          S.omega = 0;
          S.auto = 0;
        }
      }
      if (!Number.isFinite(S.theta)) S.theta = S.last;
      status.crankSpeed = sewing ? clamp((S.theta - S.last) / Math.max(dt, 1e-3), 0, MAX_SPEED * 1.5) : 0;
      const active = status.busy ? null : activePart();
      const shake = idleShake(input.idle);
      let th = S.theta;
      if (S.wiggle > 0) th += 0.035 * Math.sin(S.wiggle * 30) * (S.wiggle / 0.4);
      if (active === "wheel" && S.omega === 0 && S.auto === 0) th += 0.05 * shake;
      sewState(S.sewing ? S.theta - S.thetaR : 0, S.pts, sew);
      const m = machine.pose(th, sew.x, sew.feedS);
      machine.setFoot(P.foot.lift * (1 - S.footDown), LV.up + (LV.down - LV.up) * smooth(S.footDown) + (active === "lever" ? 0.05 * shake : 0));
      S.dial += (status.round * (TAU / 3) - S.dial) * (1 - Math.exp(-5 * dt));
      machine.dial.rotation.z = S.dial;
      if (!status.coverOpen && S.coverT === 0) {
        const dz = active === "cover" ? 3e-3 * shake : 0;
        machine.coverArm.position.z = machine.coverArmC.z + dz;
        machine.coverBed.position.z = machine.coverBedC.z + dz;
      }
      if (S.sewing && status.stage !== "finish") {
        const before = status.stitches;
        cloth.group.position.set(NX, C.tableY, -sew.zeta);
        clothKit.lay(cloth, S.pts, sew.stitches);
        status.stitches = sew.stitches;
        status.progress = clamp(sew.stitches / P.K_TOTAL, 0, 1);
        if (sew.stitches > 0) S.cut = false;
        if (sew.stitches > before) onCue("needle", { pitch: status.progress });
        if (Math.floor(S.theta / (Math.PI / 4)) > Math.floor(S.last / (Math.PI / 4))) onCue("tick", { pitch: clamp(status.crankSpeed / MAX_SPEED, 0, 1) });
        if (Math.floor((S.theta - S.thetaR - HOOK_CATCH) / TAU) > Math.floor((S.last - S.thetaR - HOOK_CATCH) / TAU)) onCue("hook");
        if (sewing && S.theta >= S.thetaR + TAU * S.kTarget - 1e-9) {
          if (st === "sew1") setStage("cover");
          else {
            S.sewing = false;
            S.finT = 1e-4;
            status.busy = true;
            fly.z0 = cloth.group.position.z;
            setStage("finish");
          }
        }
      }
      S.last = S.theta;
      if (status.stage === "fabric" && S.fabT === 0) cloth.group.rotation.y = active === "fabric" ? 0.03 * shake : 0;
      if (status.stage === "finish") finish(dt);
      updateHung(dt);
      updateThread(m);
      glow(active, time.value);
      refreshTargets();
      if (input.released) S.grab = null;
    }
    const hintObj = { part: null, position: V(), radius: 0.05, gesture: "tap", path: [] };
    const circlePath = Array.from({ length: 12 }, (_, i) => {
      const a = i / 12 * TAU;
      return V(W.c[0] + 0.03, W.c[1] + W.knobArm * Math.cos(a), W.c[2] + W.knobArm * Math.sin(a));
    });
    const fabricPath = [V(), V()];
    function getHint() {
      if (status.busy) return null;
      const p = activePart();
      if (!p) return null;
      hintObj.part = p;
      hintObj.path = [];
      hintObj.gesture = "tap";
      if (p === "fabric") {
        hintObj.position.set(NX, C.tableY + 4e-3, cloth.group.position.z + C.len * 0.45);
        hintObj.radius = 0.07;
        fabricPath[0].copy(hintObj.position);
        fabricPath[1].set(NX, P.PLATE_Y + 0.01, 0.06);
        hintObj.path = fabricPath;
      } else if (p === "lever") {
        machine.lever.updateWorldMatrix(true, false);
        hintObj.position.set(0, 0, LV.len).applyMatrix4(machine.lever.matrixWorld);
        hintObj.radius = 0.03;
      } else if (p === "cover") {
        hintObj.position.set(0.02, 0.235, P.arm.z1 + 8e-3);
        hintObj.radius = 0.08;
      } else {
        hintObj.position.set(W.c[0] + 0.03, W.c[1], W.c[2]);
        hintObj.radius = 0.085;
        hintObj.gesture = "circle";
        hintObj.path = circlePath;
      }
      return hintObj;
    }
    const hitTargets = [];
    function refreshTargets() {
      hitTargets.length = 0;
      const p = status.busy ? null : activePart();
      if (p === "lever") hitTargets.push(machine.hit.lever);
      if (p === "cover" && !status.coverOpen) hitTargets.push(machine.hit.coverArm, machine.hit.coverBed);
      if (p === "fabric" && cloth.proxy.parent) hitTargets.push(cloth.proxy);
      hitTargets.push(machine.hit.wheel);
    }
    function reset() {
      hung.forEach((h) => clothKit.dispose(h.cloth));
      hung.length = 0;
      clothKit.dispose(cloth);
      Object.assign(status, { stage: "fabric", round: 0, pattern: "wave", stitches: 0, progress: 0, crankSpeed: 0, busy: false, coverOpen: false });
      Object.assign(S, { theta: HALF, thetaR: HALF, last: HALF, omega: 0, auto: 0, kTarget: P.K_SEW1, sewing: false, cut: true, fabT: 0, footT: 0, footDown: 0, coverT: 0, finT: 0, wiggle: 0, grab: null, popT: 1, dial: 0, sparkT: -1, settle: 0 });
      machine.coverArm.visible = true;
      machine.coverBed.visible = true;
      coverPose(machine.coverArm, machine.coverArmC, 0);
      coverPose(machine.coverBed, machine.coverBedC, 0);
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
      root,
      hitTargets,
      status,
      getHint,
      update,
      reset,
      onContextLost() {
      },
      onContextRestored() {
        if (atlas) atlas.needsUpdate = true;
        tube.geometry.attributes.position.needsUpdate = true;
        tube.geometry.attributes.normal.needsUpdate = true;
        sparks.instanceMatrix.needsUpdate = true;
        cloth.stitches.instanceMatrix.needsUpdate = true;
        hung.forEach((h) => {
          h.cloth.stitches.instanceMatrix.needsUpdate = true;
        });
      },
      dispose() {
        hung.forEach((h) => clothKit.dispose(h.cloth));
        hung.length = 0;
        clothKit.dispose(cloth);
        own.inst.forEach((i) => i.dispose());
        own.geos.forEach((g) => g.dispose());
        own.mats.forEach((mt) => mt.dispose());
        own.texs.forEach((t) => t.dispose());
        root.removeFromParent();
      }
    };
    if (opts.debug && typeof window !== "undefined") window.__heroDebug = { hero, S, P, machine, sew };
    return hero;
  }
  return __toCommonJS(hero_exports);
})();
