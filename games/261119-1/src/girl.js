/* girl.js — the heroine (an ordinary 5-year-old girl, ≈1.08 m) and Mum (seen from behind, under a parasol).
   GF.createGirl({low}) / GF.createMom({low}).
   Bodies are skinned meshes on a small bone rig (smooth weights → no seams at joints); the girl's face is a
   canvas texture on a sculpted head, redrawn only when the expression changes. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};
  var V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function damp(c, t, l, dt) { return c + (t - c) * (1 - Math.exp(-l * dt)); }
  function cr(a, b, c, d, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3); }
  function C(hex) { return new THREE.Color(hex); }
  function v3(a) { return a.isVector3 ? a.clone() : new V3(a[0], a[1], a[2]); }
  var AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);

  // =====================================================================================
  // geometry builder (positions, normals, uvs, vertex colours, skin weights)
  function Builder() { this.P = []; this.N = []; this.U = []; this.Cc = []; this.SI = []; this.SW = []; this.I = []; }
  Builder.prototype.add = function (p, n, u, v, c, w) {
    this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.U.push(u, v);
    if (c) this.Cc.push(c.r, c.g, c.b); else this.Cc.push(1, 1, 1);
    var ia = [0, 0, 0, 0], wa = [1, 0, 0, 0];
    if (w && w.length) {
      w.sort(function (x, y) { return y[1] - x[1]; });
      var s = 0, i; wa[0] = 0;
      for (i = 0; i < 4 && i < w.length; i++) { ia[i] = w[i][0]; wa[i] = w[i][1]; s += wa[i]; }
      if (s > 0) for (i = 0; i < 4; i++) wa[i] /= s; else { wa[0] = 1; }
    }
    this.SI.push(ia[0], ia[1], ia[2], ia[3]); this.SW.push(wa[0], wa[1], wa[2], wa[3]);
    return this.P.length / 3 - 1;
  };
  Builder.prototype.tri = function (a, b, c) {
    var P = this.P, N = this.N;
    var ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    var vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    var nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) this.I.push(a, c, b); else this.I.push(a, b, c);
  };
  Builder.prototype.geometry = function (skinned) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.Cc, 3));
    if (skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    }
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  };

  var _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3();
  function normalAt(o, u, v, p, out) {
    if (o.pole && o.pole(u, v, out)) return out;
    var e = 1e-3, u0 = u - e, u1 = u + e, v0 = Math.max(0, v - e), v1 = Math.min(1, v + e);
    if (!o.closedU) { u0 = Math.max(0, u0); u1 = Math.min(1, u1); }
    o.f(u0, v, _a); o.f(u1, v, _b); _b.sub(_a);
    o.f(u, v0, _c); o.f(u, v1, _d); _d.sub(_c);
    out.crossVectors(_b, _d);
    if (out.lengthSq() < 1e-18) {
      var vs = v < 0.5 ? v + 0.02 : v - 0.02;
      o.f(u0, vs, _a); o.f(u1, vs, _b); _b.sub(_a); o.f(u, vs - e, _c); o.f(u, vs + e, _d); _d.sub(_c);
      out.crossVectors(_b, _d);
    }
    if (out.lengthSq() < 1e-24) out.set(0, 1, 0);
    out.normalize();
    if (o.center) { o.center(u, v, _e); _e.subVectors(p, _e); if (out.dot(_e) < 0) out.negate(); }
    else if (o.flip) out.negate();
    return out;
  }
  // parametric grid surface. o: {nu, nv, f(u,v,out), closedU, center(u,v,out), pole(u,v,out)->bool, uv(u,v,p)->[u,v], col | color(p,u,v), weights(p,u,v)}
  function surf(B, o) {
    var base = B.P.length / 3, nu = o.nu, nv = o.nv, i, j, n = new V3();
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = new V3();
      o.f(u, v, p); normalAt(o, u, v, p, n);
      var uv = o.uv ? o.uv(u, v, p) : [u, v];
      var c = o.color ? o.color(p, u, v) : o.col;
      var w = o.weights ? o.weights(p, u, v) : null;
      B.add(p, n, uv[0], uv[1], c, w);
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = base + j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1;
      B.tri(a, b, d); B.tri(a, d, c2);
    }
  }
  // swept tube along a smooth centreline. keys: [{p, r:[ra, rb], bone, bw}] (ra along `side`, rb across);
  // a key with `bone` starts that bone's region (blend width bw centred on the key).
  function sweep(B, keys, o) {
    var K = keys.map(function (k) { return { p: v3(k.p), r: k.r, bone: k.bone, bw: k.bw }; });
    var n = K.length, M = o.M || 8, pts = [], rad = [], arc = [0], kIdx = [], k, i;
    function P(i) {
      if (i < 0) return K[0].p.clone().multiplyScalar(2).sub(K[1].p);
      if (i >= n) return K[n - 1].p.clone().multiplyScalar(2).sub(K[n - 2].p);
      return K[i].p;
    }
    function R(i, c) { return K[clamp(i, 0, n - 1)].r[c]; }
    for (k = 0; k < n - 1; k++) {
      kIdx.push(pts.length);
      var a = P(k - 1), b = P(k), c = P(k + 1), d = P(k + 2);
      for (var s = 0; s < M; s++) {
        var t = s / M;
        pts.push(new V3(cr(a.x, b.x, c.x, d.x, t), cr(a.y, b.y, c.y, d.y, t), cr(a.z, b.z, c.z, d.z, t)));
        rad.push([Math.max(1e-4, cr(R(k - 1, 0), R(k, 0), R(k + 1, 0), R(k + 2, 0), t)), Math.max(1e-4, cr(R(k - 1, 1), R(k, 1), R(k + 1, 1), R(k + 2, 1), t))]);
      }
    }
    kIdx.push(pts.length); pts.push(K[n - 1].p.clone()); rad.push([K[n - 1].r[0], K[n - 1].r[1]]);
    var N = pts.length, tans = [];
    for (i = 1; i < N; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    for (i = 0; i < N; i++) tans.push(new V3().subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
    var L = arc[N - 1];
    var Cn = new V3(), T = new V3(), A = new V3(), Bn = new V3(), RR = [0, 0], side = o.side || AX;
    function frame(a) {
      a = clamp(a, 0, L);
      var lo = 0, hi = N - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (arc[mid] <= a) lo = mid; else hi = mid; }
      var f = (a - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo]);
      Cn.lerpVectors(pts[lo], pts[hi], f); T.lerpVectors(tans[lo], tans[hi], f).normalize();
      RR[0] = lerp(rad[lo][0], rad[hi][0], f); RR[1] = lerp(rad[lo][1], rad[hi][1], f);
      A.copy(side).addScaledVector(T, -side.dot(T));
      if (A.lengthSq() < 1e-8) A.set(0, 0, 1).addScaledVector(T, -T.z);
      A.normalize(); Bn.crossVectors(T, A);
    }
    var r0 = (K[0].r[0] + K[0].r[1]) / 2, r1 = (K[n - 1].r[0] + K[n - 1].r[1]) / 2;
    var capA = (o.capA || 0) * r0, capB = (o.capB || 0) * r1;
    var nv = o.nv, ncA = capA > 0 ? (o.ncap || 4) : 0, ncB = capB > 0 ? (o.ncap || 4) : 0, NV = nv + ncA + ncB;
    var vm = [0, 0];
    function vmap(v) {
      var j = v * NV, al;
      if (j < ncA) { al = (j / ncA) * PI / 2; vm[0] = -capA * Math.cos(al); vm[1] = Math.sin(al); }
      else if (j > NV - ncB) { al = ((NV - j) / ncB) * PI / 2; vm[0] = L + capB * Math.cos(al); vm[1] = Math.sin(al); }
      else { vm[0] = (j - ncA) / nv * L; vm[1] = 1; }
    }
    var joints = [];
    for (k = 1; k < n; k++) if (K[k].bone !== undefined) joints.push({ a: arc[kIdx[k]], b: K[k].bone, w: K[k].bw || 0.02 });
    function wts(a) {
      var cur = K[0].bone || 0;
      for (var i = 0; i < joints.length; i++) {
        var J = joints[i];
        if (a < J.a - J.w / 2) break;
        if (a > J.a + J.w / 2) { cur = J.b; continue; }
        var t = sstep(J.a - J.w / 2, J.a + J.w / 2, a);
        return [[cur, 1 - t], [J.b, t]];
      }
      return [[cur, 1]];
    }
    var f = function (u, v, out) {
      vmap(v); var a = vm[0]; frame(a);
      var ex = a < 0 ? a : (a > L ? a - L : 0);
      var ph = u * TAU, ra = RR[0] * vm[1], rb = RR[1] * vm[1];
      if (o.mod) { var m = o.mod(ph, a / L); ra *= m; rb *= m; }
      if (o.flatB && Math.sin(ph) > 0) rb *= o.flatB;
      out.copy(Cn).addScaledVector(T, ex).addScaledVector(A, ra * Math.cos(ph)).addScaledVector(Bn, rb * Math.sin(ph));
      if (o.post) o.post(out, ph, a / L);
    };
    surf(B, {
      nu: o.nu, nv: NV, closedU: true, f: f,
      center: function (u, v, out) { vmap(v); frame(vm[0]); out.copy(Cn); },
      pole: function (u, v, out) {
        vmap(v); if (vm[1] > 1e-3) return false;
        frame(vm[0]); out.copy(T).multiplyScalar(vm[0] < L * 0.5 ? -1 : 1); return true;
      },
      uv: function (u, v) { vmap(v); return [u * (o.us || 1), vm[0] * (o.vs || 1)]; },
      color: function (p, u, v) { if (o.color) { vmap(v); return o.color(p, vm[0] / L); } return o.col; },
      weights: function (p, u, v) { if (o.weights) return o.weights(p); vmap(v); return wts(vm[0]); }
    });
    return { L: L, keyArc: kIdx.map(function (i) { return arc[i]; }) };
  }
  // ellipsoid blob. c centre, r radii along (ax, ay, az)
  function blob(B, c, r, o) {
    o = o || {};
    var ax = o.ax || AX, ay = o.ay || AY, az = o.az || AZ, cc = v3(c);
    surf(B, {
      nu: o.nu || 16, nv: o.nv || 10, closedU: true,
      f: function (u, v, out) {
        var th = v * PI, ph = u * TAU, s = Math.sin(th);
        var lx = s * Math.cos(ph) * r[0], ly = Math.cos(th) * r[1], lz = s * Math.sin(ph) * r[2];
        out.copy(cc).addScaledVector(ax, lx).addScaledVector(ay, ly).addScaledVector(az, lz);
      },
      center: function (u, v, out) { out.copy(cc); },
      pole: function (u, v, out) { if (v < 1e-6) { out.copy(ay); return true; } if (v > 1 - 1e-6) { out.copy(ay).negate(); return true; } return false; },
      col: o.col, weights: o.weights, uv: o.uv
    });
  }
  // a hand. o: wrist, d (finger direction), n (palm faces), t (thumb side), sc, curl, bone, col, q
  function buildHand(B, o) {
    var W = v3(o.wrist), d = o.d.clone().normalize(), n = o.n.clone(), t = o.t.clone(), sc = o.sc || 1, curl = o.curl === undefined ? 0.35 : o.curl;
    n.addScaledVector(d, -n.dot(d)).normalize(); t.addScaledVector(d, -t.dot(d)).addScaledVector(n, -t.dot(n)).normalize();
    var bone = o.bone, wts = function () { return [[bone, 1]]; }, lo = o.q < 1;
    function at(sd, st, sn) { return new V3().copy(W).addScaledVector(d, sd * sc).addScaledVector(t, st * sc).addScaledVector(n, sn * sc); }
    sweep(B, [
      { p: at(-0.006, 0, -0.001), r: [0.0155 * sc, 0.0105 * sc], bone: bone },
      { p: at(0.016, 0.001, 0.0), r: [0.0205 * sc, 0.0108 * sc] },
      { p: at(0.037, 0.0005, 0.0005), r: [0.0222 * sc, 0.0094 * sc] },
      { p: at(0.051, 0, 0.0), r: [0.0205 * sc, 0.0076 * sc] }
    ], { side: t, nu: lo ? 10 : 14, nv: lo ? 4 : 6, capA: 0.6, capB: 0.5, ncap: 3, col: o.col, weights: wts });
    var offs = [0.0138, 0.0046, -0.0046, -0.0134], lens = [0.033, 0.038, 0.035, 0.028], spread = [0.10, 0.03, -0.04, -0.12], rads = [0.0058, 0.006, 0.0057, 0.0051];
    var segs = [0.46, 0.30, 0.24], bends = [0.32, 0.5, 0.36];
    for (var i = 0; i < 4; i++) {
      var dir0 = new V3().copy(d).multiplyScalar(Math.cos(spread[i])).addScaledVector(t, Math.sin(spread[i]));
      var p = at(0.046, offs[i], 0.0005), keys = [{ p: p.clone(), r: [rads[i] * sc, rads[i] * 0.88 * sc], bone: bone }];
      var phi = 0.06, cur = p.clone();
      for (var k = 0; k < 3; k++) {
        phi += bends[k] * curl + 0.05;
        var dir = new V3().copy(dir0).multiplyScalar(Math.cos(phi)).addScaledVector(n, Math.sin(phi));
        cur.addScaledVector(dir, lens[i] * segs[k] * sc);
        keys.push({ p: cur.clone(), r: [rads[i] * (0.93 - 0.07 * k) * sc, rads[i] * (0.82 - 0.07 * k) * sc] });
      }
      sweep(B, keys, { side: t, nu: lo ? 6 : 8, nv: lo ? 4 : 6, capA: 0, capB: 1, ncap: 3, col: o.col, weights: wts });
    }
    var tb = at(0.010, 0.0145, 0.004), tdir = new V3().copy(d).multiplyScalar(0.62).addScaledVector(t, 0.55).addScaledVector(n, 0.5).normalize();
    var tbend = new V3().copy(n).multiplyScalar(0.8).addScaledVector(t, -0.6).normalize();
    var tk = [{ p: tb.clone(), r: [0.0082 * sc, 0.0075 * sc], bone: bone }], tc = tb.clone(), tl = [0.017, 0.013, 0.011];
    for (k = 0; k < 3; k++) {
      var tw = 0.12 + (0.18 + 0.15 * k) * curl;
      tdir.multiplyScalar(Math.cos(tw)).addScaledVector(tbend, Math.sin(tw)).normalize();
      tc.addScaledVector(tdir, tl[k] * sc);
      tk.push({ p: tc.clone(), r: [(0.0074 - 0.0006 * k) * sc, (0.0066 - 0.0006 * k) * sc] });
    }
    sweep(B, tk, { side: n, nu: lo ? 6 : 8, nv: lo ? 4 : 6, capA: 0, capB: 1, ncap: 3, col: o.col, weights: wts });
    // palm anchor (hand-bone-local offset is computed by the caller from this world point)
    return at(0.03, 0.002, 0.012);
  }

  // bones from defs [name, parent, [x,y,z] bind position in model space]
  function makeBones(defs) {
    var map = {}, list = [];
    defs.forEach(function (d) {
      var b = new THREE.Bone(); b.name = d[0];
      var wp = v3(d[2]); b.userData.bindW = wp; b.userData.idx = list.length;
      if (d[1]) { b.position.copy(wp).sub(map[d[1]].userData.bindW); map[d[1]].add(b); } else b.position.copy(wp);
      map[d[0]] = b; list.push(b);
    });
    return { map: map, list: list };
  }
  // skirt panel bones: n bones around the waist ring, rotated about their tangent to flare/fold the skirt
  function skirtBoneDefs(prefix, parent, y, W, D, zc, n) {
    var out = [];
    for (var k = 0; k < n; k++) { var th = k / n * TAU; out.push([prefix + k, parent, [Math.sin(th) * W, y, zc + Math.cos(th) * D]]); }
    return out;
  }
  function skirtWeights(map, prefix, pelvisIdx, n, yTop, len, extra) {
    return function (p) {
      var th = Math.atan2(p.x, p.z - 0.0); if (th < 0) th += TAU;
      var x = th / TAU * n, i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, f = x - Math.floor(x);
      var t = clamp((yTop - p.y) / len, 0, 1.2); t = Math.min(1, Math.pow(t, 0.9));
      var w = [[pelvisIdx, 1 - t], [map[prefix + i0].userData.idx, t * (1 - f)], [map[prefix + i1].userData.idx, t * f]];
      if (extra) extra(p, w);
      return w;
    };
  }
  var _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ax = new V3();
  // sets panel k: outward fold angle `out` (+ = hem away from the body), extra pitch about X and roll about Z, length scale
  function setPanel(bone, th, out, pitch, roll, scl) {
    _ax.set(Math.cos(th), 0, -Math.sin(th));
    _qa.setFromAxisAngle(_ax, -out);
    _qb.setFromAxisAngle(AX, pitch); _qa.premultiply(_qb);
    _qb.setFromAxisAngle(AZ, roll); _qa.premultiply(_qb);
    bone.quaternion.copy(_qa);
    bone.scale.set(1, scl, 1);
  }

  // =====================================================================================
  // two-bone IK (upper arm + forearm), solved in the parent (clavicle) space
  var IK = { S: new V3(), T: new V3(), D: new V3(), u: new V3(), n: new V3(), dU: new V3(), dF: new V3(), E: new V3(), h: new V3(), f3: new V3(), e1: new V3(), e2: new V3(), e3: new V3(), tmp: new V3(), m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), qi: new THREE.Quaternion() };
  function makeArm(par, up, fore, endPos) { // endPos: wrist position in fore-local bind (V3)
    var a = up === fore ? 0 : fore.position.length();
    return { par: par, up: up, fore: fore, a: a, bindU: fore.position.clone().normalize(), b: endPos.length(), bindF: endPos.clone().normalize(), hinge: AX.clone() };
  }
  function solveIK(arm, targetW, pole, q1, q2) {
    var k = IK;
    k.S.copy(arm.up.position);
    k.T.copy(targetW); arm.par.worldToLocal(k.T);
    k.D.subVectors(k.T, k.S);
    var d = k.D.length(); if (d < 1e-5) { k.D.set(0, -1, 0); d = 1e-5; }
    k.u.copy(k.D).divideScalar(d);
    var a = arm.a, b = arm.b; d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
    var cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sA = Math.sqrt(1 - cosA * cosA);
    k.n.copy(pole).addScaledVector(k.u, -pole.dot(k.u));
    if (k.n.lengthSq() < 1e-8) k.n.set(0, 0, 1).addScaledVector(k.u, -k.u.z);
    k.n.normalize();
    k.dU.copy(k.u).multiplyScalar(cosA).addScaledVector(k.n, sA);
    k.E.copy(k.S).addScaledVector(k.dU, a);
    k.dF.copy(k.S).addScaledVector(k.u, d).sub(k.E).normalize();
    k.h.crossVectors(k.n, k.u).normalize();
    k.e1.copy(arm.bindU); k.e2.copy(arm.hinge).addScaledVector(k.e1, -arm.hinge.dot(k.e1)).normalize(); k.e3.crossVectors(k.e1, k.e2);
    k.tmp.copy(k.h).addScaledVector(k.dU, -k.h.dot(k.dU)).normalize(); k.f3.crossVectors(k.dU, k.tmp);
    k.m1.makeBasis(k.dU, k.tmp, k.f3); k.m2.makeBasis(k.e1, k.e2, k.e3).transpose(); k.m1.multiply(k.m2);
    q1.setFromRotationMatrix(k.m1);
    k.qi.copy(q1).invert(); k.tmp.copy(k.dF).applyQuaternion(k.qi);
    q2.setFromUnitVectors(arm.bindF, k.tmp);
  }

  // =====================================================================================
  // shared canvas textures
  function weaveTex(size, base, amp, opts) {
    return GF.canvasTex(size, size, function (c, w, h) {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      var img = c.getImageData(0, 0, w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var v = ((x + y) & 1 ? 1 : -1) * amp * 0.5 + (GF.noise2(x * 0.35, y * 2.1) - 0.5) * amp + (GF.noise2(x * 2.1 + 40, y * 0.35) - 0.5) * amp;
        if (opts && opts.rib) v += (Math.sin(x / w * TAU * opts.rib) * 0.5 + 0.5) * -amp * 0.9;
        d[i] = clamp(d[i] + v, 0, 255); d[i + 1] = clamp(d[i + 1] + v, 0, 255); d[i + 2] = clamp(d[i + 2] + v, 0, 255);
      }
      c.putImageData(img, 0, 0);
      if (opts && opts.dots) {
        c.fillStyle = 'rgba(255,253,246,0.95)';
        for (var gy = 0; gy < 4; gy++) for (var gx = 0; gx < 4; gx++) {
          var cx = gx * w / 4 + (gy & 1) * w / 8 + w / 16, cy = gy * h / 4 + h / 8;
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) { c.beginPath(); c.arc(cx + ox * w, cy + oy * h, opts.dots, 0, TAU); c.fill(); }
        }
      }
    }, { repeat: [1, 1] });
  }

  // =====================================================================================
  // FACE: canvas painted over the whole head (scalp = hair colour, face = features)
  var FK = 2.6;   // horizontal texel concentration toward the face
  function gmap(a) { var s = a < 0 ? -1 : 1; a = Math.abs(a); return s * FK * a / (1 + (FK - 1) * a); }
  function ginv(g) { var s = g < 0 ? -1 : 1; g = Math.min(Math.abs(g), 1.2); return s * g / (FK - (FK - 1) * g); }
  var SKIN_RGB = [235, 188, 158], HAIR_RGB = [26, 18, 12];
  var HAIRLINE = [[0, 0.052], [22, 0.050], [40, 0.042], [52, 0.030], [62, 0.016], [70, 0.002], [77, -0.014], [83, -0.008], [88, 0.012], [94, 0.022], [106, 0.020], [116, 0.0], [128, -0.040], [145, -0.066], [165, -0.076], [180, -0.079]];
  function hairY(psi) {
    for (var i = 1; i < HAIRLINE.length; i++) if (psi <= HAIRLINE[i][0]) {
      var a = HAIRLINE[i - 1], b = HAIRLINE[i], t = (psi - a[0]) / (b[0] - a[0]); t = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * t;
    }
    return HAIRLINE[HAIRLINE.length - 1][1];
  }
  function makeFace(S) {
    var R = GF.HEAD.skull, H = GF.HEAD;
    var base = document.createElement('canvas'); base.width = base.height = S;
    (function paintBase(ctx) {
      var img = ctx.createImageData(S, S), d = img.data;
      for (var py = 0; py < S; py++) {
        var th = (py + 0.5) / S * PI, st = Math.sin(th), ct = Math.cos(th);
        for (var px = 0; px < S; px++) {
          var phi = ginv(((px + 0.5) / S - 0.5) * 2) * PI;
          var dx = st * Math.sin(phi), dy = ct, dz = -st * Math.cos(phi);
          var x = dx * R[0], y = dy * R[1], z = dz * R[2];
          var psi = Math.abs(Math.atan2(x, -z)) * 180 / PI;
          var yh = hairY(psi) + (GF.noise2(px * 0.21, py * 0.21) - 0.5) * 0.004 + (GF.noise2(px * 0.05 + 9, 3) - 0.5) * 0.004;
          var hair = sstep(yh - 0.0025, yh + 0.0045, y);
          if (py > S * 0.95) hair = 0;
          var n1 = GF.noise2(px * 0.07, py * 0.07) - 0.5, n2 = GF.noise2(px * 0.6, py * 0.6) - 0.5;
          var sr = SKIN_RGB[0] + n1 * 6 + n2 * 3, sg = SKIN_RGB[1] + n1 * 6 + n2 * 3, sb = SKIN_RGB[2] + n1 * 5 + n2 * 3;
          // a touch warmer on the nose tip / chin / ears zone, slight shade under the jaw
          var under = sstep(-0.075, -0.094, y) * (py > S * 0.95 ? 0 : 1);
          sr -= under * 14; sg -= under * 18; sb -= under * 14;
          var hn = GF.noise2(px * 1.3, py * 0.12) - 0.5, hn2 = GF.noise2(px * 0.2, py * 0.05) - 0.5;
          var hr = HAIR_RGB[0] + hn * 14 + hn2 * 8, hg = HAIR_RGB[1] + hn * 10 + hn2 * 6, hb = HAIR_RGB[2] + hn * 8 + hn2 * 4;
          var i = (py * S + px) * 4;
          d[i] = sr + (hr - sr) * hair; d[i + 1] = sg + (hg - sg) * hair; d[i + 2] = sb + (hb - sb) * hair; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    })(base.getContext('2d'));
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    var ctx = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    var pt = [0, 0];
    function P(x, y) {
      var dx = x / R[0], dy = y / R[1], q = 1 - dx * dx - dy * dy, dz = -Math.sqrt(Math.max(0, q));
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
      pt[0] = (0.5 + 0.5 * gmap(Math.atan2(dx, -dz) / PI)) * S; pt[1] = Math.acos(clamp(dy, -1, 1)) / PI * S;
      return pt;
    }
    function mv(x, y) { P(x, y); ctx.moveTo(pt[0], pt[1]); }
    function ln(x, y) { P(x, y); ctx.lineTo(pt[0], pt[1]); }
    var pxm = (function () { P(0.028, -0.008); var a = pt[0], b = pt[1]; P(0.029, -0.008); return Math.hypot(pt[0] - a, pt[1] - b) * 1000; })();
    var NE = 14, up = new Float32Array(NE + 1), lo = new Float32Array(NE + 1), xs = new Float32Array(NE + 1);
    function eye(s, F, open) {
      var cx = s * 0.029, cy = H.eyeY, ew = 0.0118, i, t;
      var eu = 0.0102 * (1 + 0.16 * F.wide), el = 0.0054;
      for (i = 0; i <= NE; i++) {
        t = i / NE;                                 // 0 inner corner … 1 outer corner
        var x = cx + s * ew * (2 * t - 1), base = lerp(cy - 0.0003, cy + 0.0012, t);
        var Su = Math.pow(Math.sin(PI * Math.pow(t, 0.9)), 0.65), Sl = Math.pow(Math.sin(PI * Math.pow(t, 1.05)), 0.85);
        var upO = base + eu * Su, loO = base - el * Sl + F.lift * el * 1.45 * Sl;
        var closed = base - el * 0.6 * Sl + F.hclose * 0.0062 * Su;
        var u = closed + (upO - closed) * open;
        xs[i] = x; up[i] = u; lo[i] = Math.min(loO, u);
      }
      var gx = cx + F.gx * 0.0043, gy = cy + 0.0016 + F.gy * 0.0026, ir = 0.0073;
      if (open > 0.07) {
        ctx.save();
        ctx.beginPath(); mv(xs[0], up[0]); for (i = 1; i <= NE; i++) ln(xs[i], up[i]); for (i = NE; i >= 0; i--) ln(xs[i], lo[i]); ctx.closePath();
        ctx.fillStyle = '#efe6df'; ctx.fill(); ctx.clip();
        P(cx, cy); var ex = pt[0], ey = pt[1];
        var sg = ctx.createRadialGradient(ex, ey, 0, ex, ey, ew * pxm * 1.1); sg.addColorStop(0, 'rgba(255,252,250,0.9)'); sg.addColorStop(1, 'rgba(214,188,178,0.9)');
        ctx.fillStyle = sg; ctx.fillRect(ex - 30, ey - 30, 60, 60);
        P(gx, gy); var ix = pt[0], iy = pt[1], ipx = ir * pxm;
        var ig = ctx.createRadialGradient(ix, iy, 0, ix, iy, ipx);
        ig.addColorStop(0, '#120a06'); ig.addColorStop(0.38, '#1d100a'); ig.addColorStop(0.5, '#4b2c1a'); ig.addColorStop(0.78, '#5e3b24'); ig.addColorStop(0.92, '#3a2214'); ig.addColorStop(1, '#1e110a');
        ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ipx, 0, TAU); ctx.fill();
        // lid shadow on the eyeball
        P(cx, cy + eu); var ty = pt[1];
        var lg = ctx.createLinearGradient(0, ty, 0, ty + ipx * 1.25); lg.addColorStop(0, 'rgba(50,25,15,0.55)'); lg.addColorStop(1, 'rgba(50,25,15,0)');
        ctx.fillStyle = lg; ctx.fillRect(ex - 30, ty - 4, 60, ipx * 1.25 + 4);
        // catchlights
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(ix - 0.0019 * pxm, iy - 0.0019 * pxm, 0.00135 * pxm, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(ix + 0.0017 * pxm, iy + 0.0015 * pxm, 0.0007 * pxm, 0, TAU); ctx.fill();
        ctx.restore();
        // lid crease
        ctx.strokeStyle = 'rgba(150,88,66,' + (0.22 * open).toFixed(3) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); for (i = 2; i <= NE - 1; i++) { var cy2 = up[i] + 0.0032 * (0.6 + 0.4 * open); if (i === 2) mv(xs[i], cy2); else ln(xs[i], cy2); } ctx.stroke();
        // lower lid
        ctx.strokeStyle = 'rgba(130,72,52,0.35)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); mv(xs[1], lo[1]); for (i = 2; i <= NE; i++) ln(xs[i], lo[i]); ctx.stroke();
      }
      // upper lash line (also the closed-eye line)
      ctx.strokeStyle = '#2a170f'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 0.0012 * pxm * (open > 0.07 ? 1 : 0.85);
      ctx.beginPath(); mv(xs[0], up[0]); for (i = 1; i <= NE; i++) ln(xs[i], up[i]);
      ln(xs[NE] + s * 0.0013, up[NE] + 0.0008 * (open > 0.07 ? 1 : 0.2)); ctx.stroke();
      ctx.lineWidth = 0.0008 * pxm;
      ctx.beginPath(); mv(xs[NE / 2], up[NE / 2]); for (i = NE / 2 + 1; i <= NE; i++) ln(xs[i], up[i] + 0.0003); ctx.stroke();
      if (F.squeeze > 0.2) {
        ctx.strokeStyle = 'rgba(140,78,60,' + (0.55 * F.squeeze).toFixed(3) + ')'; ctx.lineWidth = 1.3;
        var ox = cx + s * (ew + 0.0025);
        ctx.beginPath(); mv(ox, cy + 0.003); ln(ox + s * 0.0035, cy + 0.0045); ctx.stroke();
        ctx.beginPath(); mv(ox, cy - 0.0008); ln(ox + s * 0.0036, cy - 0.0016); ctx.stroke();
      }
    }
    function brow(s, F) {
      var y0 = H.browY + 0.0075 + F.brow;
      ctx.beginPath();
      for (var pass = 0; pass < 2; pass++) for (var i = 0; i <= 10; i++) {
        var t = pass === 0 ? i / 10 : 1 - i / 10;
        var x = s * (0.011 + 0.034 * t), y = y0 + 0.0032 * Math.sin(PI * Math.pow(t, 0.75)) - 0.0022 * t - F.knit * 0.0016 * (1 - t);
        var th = (0.0022 * (1 - 0.65 * t) + 0.0004) * (pass === 0 ? 0.5 : -0.5);
        if (pass === 0 && i === 0) mv(x, y + th); else ln(x, y + th);
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(100,64,42,0.55)'; ctx.fill();
    }
    var NM = 14, mt = new Float32Array(NM + 1), mb = new Float32Array(NM + 1), mx = new Float32Array(NM + 1);
    function mouth(F) {
      var cy = H.mouthY, w = F.mw, h = F.mh, rnd = F.mround, i;
      var e = lerp(1.0, 0.5, rnd), kt = lerp(0.18, 0.45, rnd);
      for (i = 0; i <= NM; i++) {
        var t = i / NM, St = Math.pow(Math.sin(PI * t), e), q = 2 * t - 1;
        var line = cy + F.corner * q * q - 0.0005 * F.smile * Math.sin(PI * t);
        mx[i] = -w + 2 * w * t; mt[i] = line + h * kt * St; mb[i] = line - h * (1 - kt) * St;
      }
      ctx.save(); ctx.shadowBlur = 1.5;
      // upper lip
      ctx.shadowColor = 'rgba(200,118,110,0.8)';
      ctx.beginPath(); mv(mx[0], mt[0]);
      for (i = 0; i <= NM; i++) { var t1 = i / NM; ln(mx[i], mt[i] + 0.0021 * Math.pow(Math.sin(PI * t1), 0.6) - 0.0005 * Math.exp(-Math.pow((t1 - 0.5) / 0.09, 2))); }
      for (i = NM; i >= 0; i--) ln(mx[i], mt[i]);
      ctx.fillStyle = 'rgba(206,112,106,0.9)'; ctx.fill();
      // lower lip
      ctx.shadowColor = 'rgba(222,140,128,0.8)';
      ctx.beginPath(); mv(mx[0], mb[0]);
      for (i = 0; i <= NM; i++) { var t2 = i / NM; ln(mx[i], mb[i] - 0.0031 * Math.pow(Math.sin(PI * t2), 0.7)); }
      for (i = NM; i >= 0; i--) ln(mx[i], mb[i]);
      ctx.fillStyle = 'rgba(226,132,124,0.9)'; ctx.fill();
      ctx.restore();
      P(0.0, H.mouthY - 0.0012 - h * 0.9 - 0.0011); ctx.fillStyle = 'rgba(255,225,215,0.28)'; ctx.beginPath(); ctx.ellipse(pt[0], pt[1], w * pxm * 0.45, 0.0006 * pxm, 0, 0, TAU); ctx.fill();
      if (h > 0.0003) {
        ctx.save();
        ctx.beginPath(); mv(mx[0], mt[0]); for (i = 1; i <= NM; i++) ln(mx[i], mt[i]); for (i = NM; i >= 0; i--) ln(mx[i], mb[i]); ctx.closePath();
        ctx.fillStyle = '#5a2020'; ctx.fill();
        if (F.laugh > 0.25) {
          ctx.clip(); P(0, H.mouthY + h * kt); var ty = pt[1];
          ctx.fillStyle = 'rgba(244,238,232,' + (0.9 * sstep(0.25, 0.6, F.laugh)).toFixed(3) + ')';
          ctx.fillRect(pt[0] - w * pxm * 0.75, ty - 3, w * pxm * 1.5, 3 + h * pxm * 0.32);
          P(0, H.mouthY - h * 0.75); ctx.fillStyle = 'rgba(200,100,100,0.6)'; ctx.beginPath(); ctx.ellipse(pt[0], pt[1], w * pxm * 0.55, h * pxm * 0.3, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(135,64,56,' + (0.85 * (1 - sstep(0.0004, 0.0012, h))).toFixed(3) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); mv(mx[0], (mt[0] + mb[0]) / 2); for (i = 1; i <= NM; i++) ln(mx[i], (mt[i] + mb[i]) / 2); ctx.stroke();
      if (F.smile > 0.3) {
        ctx.fillStyle = 'rgba(170,95,82,' + (0.25 * F.smile).toFixed(3) + ')';
        for (var s = -1; s <= 1; s += 2) { P(s * (w + 0.0009), cy + F.corner + 0.0003); ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.3, 0, TAU); ctx.fill(); }
      }
    }
    function blush(s, F) {
      P(s * 0.043, -0.037 + 0.004 * F.smile); var x = pt[0], y = pt[1], r = 0.021 * pxm;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(236,118,108,' + F.blush.toFixed(3) + ')'); g.addColorStop(1, 'rgba(236,118,108,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    function nose() {
      P(0, H.noseY - 0.0055); var g = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 0.0075 * pxm);
      g.addColorStop(0, 'rgba(170,90,72,0.20)'); g.addColorStop(1, 'rgba(170,90,72,0)'); ctx.fillStyle = g; ctx.fillRect(pt[0] - 20, pt[1] - 20, 40, 40);
      ctx.fillStyle = 'rgba(125,62,52,0.42)';
      for (var s = -1; s <= 1; s += 2) { P(s * 0.0043, H.noseY - 0.0036); ctx.beginPath(); ctx.ellipse(pt[0], pt[1], 0.0013 * pxm, 0.0008 * pxm, s * 0.3, 0, TAU); ctx.fill(); }
      P(0, H.noseY + 0.0025); var h2 = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 0.0035 * pxm);
      h2.addColorStop(0, 'rgba(255,238,228,0.30)'); h2.addColorStop(1, 'rgba(255,238,228,0)'); ctx.fillStyle = h2; ctx.fillRect(pt[0] - 12, pt[1] - 12, 24, 24);
      // soft shade on the nose sides
      for (s = -1; s <= 1; s += 2) {
        P(s * 0.0075, H.noseY + 0.004); var g3 = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 0.006 * pxm);
        g3.addColorStop(0, 'rgba(190,120,95,0.10)'); g3.addColorStop(1, 'rgba(190,120,95,0)'); ctx.fillStyle = g3; ctx.fillRect(pt[0] - 20, pt[1] - 20, 40, 40);
      }
    }
    function draw(F) {
      ctx.globalAlpha = 1; ctx.drawImage(base, 0, 0);
      blush(-1, F); blush(1, F); nose();
      brow(-1, F); brow(1, F);
      eye(-1, F, F.open); eye(1, F, F.open);
      mouth(F);
      tex.needsUpdate = true;
    }
    return { tex: tex, draw: draw, canvas: cv };
  }

  // the sculpted head (head-local, origin = head centre) + ears, uv = face canvas mapping
  function buildHead(B, low) {
    var R = GF.HEAD.skull;
    var bumps = [
      { c: [0, -0.43, -0.90], s: 0.055, a: 0.0030, d: [0, -0.3, -1] },      // nose
      { c: [0, -0.62, -0.78], s: 0.3, a: 0.003, d: [0, 0, -1] },          // nose bridge/tip blend
      { c: [0.55, -0.56, -0.62], s: 0.3, a: 0.0105 }, { c: [-0.55, -0.56, -0.62], s: 0.3, a: 0.0105 },   // cheeks
      { c: [0, -0.84, -0.54], s: 0.2, a: 0.006, d: [0, 0.1, -1] },     // chin / lower face forward
      { c: [0, -0.66, -0.75], s: 0.12, a: 0.0022, d: [0, -0.2, -1] },      // lips area
      { c: [0.33, -0.08, -0.94], s: 0.09, a: -0.0022 }, { c: [-0.33, -0.08, -0.94], s: 0.09, a: -0.0022 },  // eye sockets (soft)
      { c: [0.74, -0.62, -0.2], s: 0.22, a: -0.003 }, { c: [-0.74, -0.62, -0.2], s: 0.22, a: -0.003 }, // jaw narrows
      { c: [0, -0.55, 0.83], s: 0.33, a: -0.006 },                         // nape tucks in
      { c: [0, 0.15, 0.99], s: 0.45, a: 0.0035 }                            // round back of the head
    ].map(function (b) { b.c = v3(b.c).normalize(); if (b.d) b.d = v3(b.d).normalize(); b.k = 1 / (2 * b.s * b.s); return b; });
    var dir = new V3(), tmp = new V3();
    function f(u, v, out) {
      var phi = ginv(2 * u - 1) * PI, th = v * PI, st = Math.sin(th);
      dir.set(st * Math.sin(phi), Math.cos(th), -st * Math.cos(phi));
      out.set(dir.x * R[0], dir.y * R[1], dir.z * R[2]);
      for (var i = 0; i < bumps.length; i++) {
        var b = bumps[i], g = Math.exp(-tmp.subVectors(dir, b.c).lengthSq() * b.k) * b.a;
        if (g * g < 1e-14) continue;
        out.addScaledVector(b.d || dir, g);
      }
    }
    surf(B, {
      nu: low ? 40 : 56, nv: low ? 28 : 40, closedU: true, f: f,
      center: function (u, v, out) { out.set(0, 0, 0); },
      pole: function (u, v, out) { if (v < 1e-6) { out.set(0, 1, 0); return true; } if (v > 1 - 1e-6) { out.set(0, -1, 0); return true; } return false; },
      uv: function (u, v) { return [u, 1 - v]; }
    });
    // ears
    var H = GF.HEAD;
    for (var s = -1; s <= 1; s += 2) {
      var ang = 0.42, out = new V3(s * Math.cos(ang), 0, -Math.sin(ang)), upv = new V3(0, 1, 0.18).normalize();
      upv.addScaledVector(out, -upv.dot(out)).normalize();
      var bk = new V3().crossVectors(out, upv).normalize(); if (bk.z < 0) bk.negate();
      var ec = new V3(s * (H.earX - 0.004), H.earY + 0.001, H.earZ + 0.004);
      (function (out, upv, bk, ec) {
        surf(B, {
          nu: low ? 14 : 20, nv: low ? 10 : 14, closedU: true,
          f: function (u, v, o2) {
            var th = v * PI, ph = u * TAU, rho = Math.sin(th), eo = Math.cos(th);
            var ey = rho * Math.cos(ph), ez = rho * Math.sin(ph);
            var ry = ey < 0 ? 0.0225 : 0.026, rz = ey < 0 ? 0.0135 : 0.0165;
            var o = eo > 0 ? eo * 0.0068 - 0.0072 * (1 - sstep(0.5, 0.88, rho)) * sstep(-0.8, -0.35, ey) : eo * 0.008;
            o2.copy(ec).addScaledVector(upv, ey * ry).addScaledVector(bk, ez * rz).addScaledVector(out, o + 0.002);
          },
          center: function (u, v, o2) { o2.copy(ec).addScaledVector(out, -0.03); },
          uv: function () { return [0.5, 0.012]; }
        });
      })(out, upv, bk, ec);
    }
  }

  // =====================================================================================
  // torso-like surface from 9 uniform keys (y, W, D, zc, tummy, ex)
  function keyAt(arr, v) {
    var x = clamp(v, 0, 1) * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(x)), f = x - i;
    return cr(arr[Math.max(0, i - 1)], arr[i], arr[i + 1], arr[Math.min(arr.length - 1, i + 2)], f);
  }
  function makeTorso(K, neckDrop) {
    return function (th, v, out) {
      var y = keyAt(K.y, v), W = keyAt(K.W, v), D = keyAt(K.D, v), zc = keyAt(K.zc, v), tum = keyAt(K.tum, v), ex = keyAt(K.ex, v);
      var s = Math.sin(th), c = Math.cos(th);
      var sx = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / ex), cz = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / ex);
      var z = zc + D * cz;
      if (c < 0) z += tum * c * Math.abs(c);
      if (K.blade && c > 0) z += K.blade * sstep(0.3, 0.5, v) * (1 - sstep(0.62, 0.8, v)) * Math.exp(-Math.pow((Math.abs(s) - 0.55) / 0.22, 2));
      if (neckDrop && c < 0) y -= neckDrop * sstep(0.8, 1, v) * c * c;
      out.set(W * sx, y, z);
    };
  }
  function torsoNormal(fn, th, v, out) {
    var e = 1e-3;
    fn(th - e, v, _a); fn(th + e, v, _b); _b.sub(_a);
    fn(th, Math.max(0, v - e), _c); fn(th, Math.min(1, v + e), _d); _d.sub(_c);
    out.crossVectors(_b, _d).normalize();
    fn(th, v, _e); _e.y = 0; _a.set(_e.x, 0, _e.z - 0.005);
    if (out.dot(_a) < 0) out.negate();
    return out;
  }

  // =====================================================================================
  //                                           GIRL
  // =====================================================================================
  GF.createGirl = function (opts) {
    opts = opts || {};
    var low = !!opts.low, qq = low ? 0.62 : 1;
    function seg(n) { return Math.max(4, Math.round(n * qq)); }
    var group = new THREE.Group(); group.name = 'girl';

    var defs = [
      ['root', null, [0, 0, 0]],
      ['pelvis', 'root', [0, 0.56, 0.0]],
      ['spine', 'pelvis', [0, 0.645, 0.004]],
      ['chest', 'spine', [0, 0.725, 0.006]],
      ['neck', 'chest', [0, 0.85, 0.008]],
      ['head', 'neck', [0, 0.912, 0.004]],
      ['clavR', 'chest', [0.02, 0.80, 0.006]], ['armR', 'clavR', [0.098, 0.812, 0.002]], ['foreR', 'armR', [0.114, 0.645, 0.012]], ['twR', 'foreR', [0.119, 0.578, 0.009]], ['handR', 'twR', [0.124, 0.507, 0.004]],
      ['clavL', 'chest', [-0.02, 0.80, 0.006]], ['armL', 'clavL', [-0.098, 0.812, 0.002]], ['foreL', 'armL', [-0.114, 0.645, 0.012]], ['twL', 'foreL', [-0.119, 0.578, 0.009]], ['handL', 'twL', [-0.124, 0.507, 0.004]],
      ['thighR', 'pelvis', [0.062, 0.52, 0.0]], ['shinR', 'thighR', [0.06, 0.295, -0.004]], ['footR', 'shinR', [0.058, 0.062, 0.012]],
      ['thighL', 'pelvis', [-0.062, 0.52, 0.0]], ['shinL', 'thighL', [-0.06, 0.295, -0.004]], ['footL', 'shinL', [-0.058, 0.062, 0.012]]
    ];
    var SKN = 8, WAISTY = 0.618, SKW = 0.113, SKD = 0.076, SKZ = 0.004;
    defs = defs.concat(skirtBoneDefs('sk', 'pelvis', WAISTY, SKW, SKD, SKZ, SKN));
    var rig = makeBones(defs), Bm = rig.map, skB = [];
    for (var ki = 0; ki < SKN; ki++) skB.push(Bm['sk' + ki]);
    function bi(n) { return Bm[n].userData.idx; }
    group.add(Bm.root);
    group.updateMatrixWorld(true);
    var skeleton = new THREE.Skeleton(rig.list);

    var SK = C(0xebbc9e), WHITE = C(0xf8f7f3), SASH = C(0xebcf7d), PEARL = C(0xf4efe4), SHOE = C(0x7b1a2c), SOLE = C(0xc9ad8b), BUCK = C(0xd8d2c8);
    var skinB = new Builder(), dressB = new Builder(), trimB = new Builder(), shoeB = new Builder(), headB = new Builder();

    // ---- torso (bodice) weights
    function torsoW(p) {
      var w = [], y = p.y, ax = Math.abs(p.x), side = p.x >= 0 ? 'R' : 'L';
      var tps = sstep(0.585, 0.64, y), tsc = sstep(0.69, 0.74, y);
      var wp = 1 - tps, ws = tps * (1 - tsc), wc = tps * tsc;
      var cl = sstep(0.05, 0.115, ax) * sstep(0.755, 0.83, y) * 0.85, ar = sstep(0.112, 0.14, ax) * sstep(0.74, 0.8, y) * 0.5;
      if (wp > 0) w.push([bi('pelvis'), wp]);
      if (ws > 0) w.push([bi('spine'), ws]);
      if (wc > 0) {
        var rest = wc * (1 - cl), clw = wc * cl;
        w.push([bi('chest'), rest]);
        if (clw > 0) { w.push([bi('clav' + side), clw * (1 - ar)]); if (ar > 0) w.push([bi('arm' + side), clw * ar]); }
      }
      return w;
    }
    // ---- bodice
    var BK = {
      y: [0.596, 0.66, 0.72, 0.77, 0.808, 0.836, 0.855, 0.868, 0.877],
      W: [0.110, 0.113, 0.120, 0.127, 0.129, 0.121, 0.100, 0.071, 0.045],
      D: [0.073, 0.072, 0.071, 0.069, 0.066, 0.060, 0.052, 0.045, 0.040],
      zc: [0.0, 0.0, 0.003, 0.005, 0.006, 0.006, 0.007, 0.008, 0.009],
      tum: [0.010, 0.007, 0.002, 0.0, 0, 0, 0, 0, 0],
      ex: [2.0, 2.05, 2.15, 2.3, 2.45, 2.5, 2.4, 2.2, 2.0], blade: 0.004
    };
    var bodyPos = makeTorso(BK, 0.014);
    surf(dressB, {
      nu: seg(48), nv: seg(26), closedU: true,
      f: function (u, v, out) { bodyPos(TAU * u - PI / 2, v, out); },
      center: function (u, v, out) { out.set(0, keyAt(BK.y, v), keyAt(BK.zc, v)); },
      uv: function (u, v, p) { return [u * 8, p.y / 0.08]; },
      weights: function (p) { return torsoW(p); }
    });
    // ---- skirt
    var skirtLen = 0.262;
    function skirtPos(u, v, out) {
      var th = TAU * u - PI / 2, lip = 0, vv = v / 0.88;
      if (vv > 1) { lip = (vv - 1) / (0.12 / 0.88); vv = 1; }
      var e = Math.pow(vv, 0.8);
      var rx = SKW + 0.098 * e, rz = SKD + 0.104 * e, zc = SKZ + 0.014 * e;
      var fold = 0.0115 * Math.pow(vv, 1.25) * (0.55 * Math.sin(7 * th + 1.3) + 0.35 * Math.sin(11 * th + 0.4) + 0.2 * Math.sin(17 * th + 2.1));
      var s = Math.sin(th), c = Math.cos(th);
      var rad = 1 - lip * 0.045, x = (rx * s) * rad + s * fold, z = zc + (rz * c) * rad + c * fold;
      if (c < 0) z += c * Math.abs(c) * 0.008 * (1 - vv);
      var y = WAISTY - skirtLen * vv + fold * 0.25 * vv + lip * 0.018;
      out.set(x, y, z);
    }
    var skW = skirtWeights(Bm, 'sk', bi('pelvis'), SKN, WAISTY, skirtLen);
    surf(dressB, {
      nu: seg(80), nv: seg(20), closedU: true, f: skirtPos,
      center: function (u, v, out) { var vv = Math.min(1, v / 0.88); out.set(0, WAISTY - skirtLen * vv, SKZ + 0.014 * vv); },
      uv: function (u, v, p) { return [u * 13, (WAISTY - p.y) / 0.08 + (v > 0.88 ? (v - 0.88) * 0.6 : 0)]; },
      weights: function (p) { return skW(p); }
    });
    // ---- sleeves (dress)
    for (var s = -1; s <= 1; s += 2) {
      var sd = s > 0 ? 'R' : 'L';
      sweep(dressB, [
        { p: [s * 0.093, 0.834, 0.001], r: [0.037, 0.035], bone: bi('chest') },
        { p: [s * 0.102, 0.80, 0.003], r: [0.045, 0.043], bone: bi('arm' + sd), bw: 0.05 },
        { p: [s * 0.108, 0.765, 0.005], r: [0.044, 0.042] },
        { p: [s * 0.111, 0.738, 0.006], r: [0.042, 0.040] }
      ], { side: AX, nu: seg(24), nv: seg(8), capA: 0.75, capB: 0, ncap: 4, us: 3, vs: 1 / 0.08, mod: function (ph, a) { return 1 + 0.03 * Math.sin(6 * ph) * a; } });
    }

    // ---- skin: neck, arms, hands, legs
    sweep(skinB, [
      { p: [0, 0.80, 0.012], r: [0.037, 0.035], bone: bi('chest') },
      { p: [0, 0.85, 0.010], r: [0.0355, 0.0335], bone: bi('neck'), bw: 0.035 },
      { p: [0, 0.905, 0.006], r: [0.034, 0.032], bone: bi('head'), bw: 0.035 },
      { p: [0, 0.955, 0.0], r: [0.030, 0.028] }
    ], { side: AX, nu: seg(24), nv: seg(10), capA: 0, capB: 0.7, col: SK });
    var handAnchorPos = {};
    for (s = -1; s <= 1; s += 2) {
      sd = s > 0 ? 'R' : 'L';
      sweep(skinB, [
        { p: [s * 0.072, 0.828, 0.0], r: [0.030, 0.030], bone: bi('clav' + sd) },
        { p: [s * 0.098, 0.808, 0.002], r: [0.0315, 0.031], bone: bi('arm' + sd), bw: 0.05 },
        { p: [s * 0.107, 0.735, 0.007], r: [0.029, 0.0285] },
        { p: [s * 0.114, 0.645, 0.012], r: [0.0235, 0.0225], bone: bi('fore' + sd), bw: 0.032 },
        { p: [s * 0.117, 0.598, 0.011], r: [0.0225, 0.0235] },
        { p: [s * 0.120, 0.565, 0.009], r: [0.0195, 0.022], bone: bi('tw' + sd), bw: 0.07 },
        { p: [s * 0.124, 0.512, 0.004], r: [0.0135, 0.0185], bone: bi('hand' + sd), bw: 0.022 },
        { p: [s * 0.1245, 0.498, 0.004], r: [0.0128, 0.0178] }
      ], { side: AX, nu: seg(18), nv: seg(28), capA: 0.6, capB: 0.6, ncap: 3, col: SK });
      var hp = buildHand(skinB, {
        wrist: [s * 0.124, 0.506, 0.004], d: new V3(s * 0.04, -1, -0.01), n: new V3(-s, 0, 0), t: new V3(0, 0, -1),
        sc: 1, curl: 0.42, bone: bi('hand' + sd), col: SK, q: qq
      });
      handAnchorPos[sd] = hp;
      // leg (skin) down to the ankle (inside the sock)
      sweep(skinB, [
        { p: [s * 0.062, 0.575, 0.002], r: [0.056, 0.058], bone: bi('pelvis') },
        { p: [s * 0.062, 0.52, 0.0], r: [0.0565, 0.058], bone: bi('thigh' + sd), bw: 0.07 },
        { p: [s * 0.0625, 0.42, -0.003], r: [0.050, 0.051] },
        { p: [s * 0.061, 0.335, -0.004], r: [0.0405, 0.040] },
        { p: [s * 0.060, 0.295, -0.004], r: [0.0375, 0.0375], bone: bi('shin' + sd), bw: 0.04 },
        { p: [s * 0.0598, 0.235, 0.0], r: [0.036, 0.039] },
        { p: [s * 0.059, 0.16, 0.006], r: [0.031, 0.032] },
        { p: [s * 0.058, 0.10, 0.010], r: [0.0245, 0.0245] },
        { p: [s * 0.058, 0.066, 0.012], r: [0.0225, 0.0235], bone: bi('foot' + sd), bw: 0.03 },
        { p: [s * 0.058, 0.05, 0.012], r: [0.021, 0.022] }
      ], { side: AX, nu: seg(18), nv: seg(28), capA: 0, capB: 0.6, ncap: 3, col: SK });

      // ---- trim: socks
      sweep(trimB, [
        { p: [s * 0.058, 0.045, 0.012], r: [0.0245, 0.0255], bone: bi('foot' + sd) },
        { p: [s * 0.058, 0.07, 0.012], r: [0.0255, 0.0262], bone: bi('shin' + sd), bw: 0.03 },
        { p: [s * 0.058, 0.098, 0.0105], r: [0.0268, 0.0268] },
        { p: [s * 0.0582, 0.118, 0.0095], r: [0.0285, 0.0285] }
      ], { side: AX, nu: seg(20), nv: seg(6), capA: 0, capB: 0, col: WHITE, us: 4, vs: 30 });
      sweep(trimB, [
        { p: [s * 0.058, 0.029, 0.045], r: [0.0215, 0.022], bone: bi('foot' + sd) },
        { p: [s * 0.058, 0.032, 0.014], r: [0.0245, 0.031] },
        { p: [s * 0.0595, 0.027, -0.022], r: [0.0275, 0.026] },
        { p: [s * 0.061, 0.022, -0.062], r: [0.030, 0.019] },
        { p: [s * 0.060, 0.019, -0.092], r: [0.0285, 0.015] },
        { p: [s * 0.0585, 0.018, -0.106], r: [0.024, 0.0125] }
      ], { side: AX, nu: seg(16), nv: seg(9), capA: 1, capB: 1, ncap: 3, flatB: 0.62, col: WHITE, us: 4, vs: 30 });

      // ---- shoes (Mary Janes, only shown standing)
      (function (s, sd) {
        var fx = s * 0.0585, zc = -0.0285, Lh = 0.0955, bone = bi('foot' + sd);
        var wts = function () { return [[bone, 1]]; };
        // sock-foot sections (z, yc, half-width, half-height): the shoe is built just outside them
        var SZs = [0.069, 0.045, 0.014, -0.022, -0.062, -0.092, -0.106, -0.128];
        var SY = [0.027, 0.029, 0.032, 0.027, 0.022, 0.019, 0.018, 0.018];
        var SWd = [0.004, 0.0215, 0.0245, 0.0275, 0.030, 0.0285, 0.024, 0.004];
        var SH = [0.004, 0.022, 0.031, 0.026, 0.019, 0.015, 0.0125, 0.003];
        function sec(z, o) {
          var i = 0; while (i < SZs.length - 2 && z < SZs[i + 1]) i++;
          var t = clamp((z - SZs[i]) / (SZs[i + 1] - SZs[i]), 0, 1), a, b, n = SZs.length - 2;
          if (i === 0) { var e0 = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); a = SWd[1] * e0; b = SH[1] * e0; }
          else if (i === n) { var e1 = Math.sqrt(Math.max(0, 1 - t * t)); a = SWd[n] * e1; b = SH[n] * e1; }
          else { a = lerp(SWd[i], SWd[i + 1], t); b = lerp(SH[i], SH[i + 1], t); }
          var m = Math.min(1, a / 0.006); o[0] = lerp(SY[i], SY[i + 1], t); o[1] = a + 0.0045 * m; o[2] = b + 0.0042 * m;
          return o;
        }
        var so = [0, 0, 0];
        function shoeF(u, v, out) {
          var vz = 0.5 - 0.5 * Math.cos(PI * v), z = lerp(SZs[0], SZs[SZs.length - 1], vz); sec(z, so);
          var toe = sstep(0.56, 0.78, vz), heel = 1 - sstep(0.08, 0.22, vz);
          var h = lerp(lerp(1.85, 2.1, heel), PI, toe);
          var ph = -h + 2 * h * u, dn = Math.cos(ph), bz = dn > 0 ? 0.62 : 1;
          out.set(fx + so[1] * Math.sin(ph), so[0] - so[2] * dn * bz, z);
          if (out.y < 0.0098) out.y = 0.0098;
        }
        surf(shoeB, {
          nu: seg(24), nv: seg(20), closedU: false, f: shoeF,
          center: function (u, v, out) { var z = lerp(SZs[0], SZs[SZs.length - 1], 0.5 - 0.5 * Math.cos(PI * v)); sec(z, so); out.set(fx, so[0], z); },
          col: SHOE, weights: wts
        });
        function outline(psi, out) {
          var z = zc - Lh * Math.cos(psi); sec(clamp(z, SZs[SZs.length - 1], SZs[0]), so);
          var k = Math.pow(Math.abs(Math.sin(psi)), 0.5);
          out.set(fx + (Math.sin(psi) < 0 ? -1 : 1) * k * (so[1] + 0.001), 0, z);
        }
        var oc = new V3(fx, 0, zc);
        surf(shoeB, {
          nu: seg(30), nv: 2, closedU: true,
          f: function (u, v, out) { outline(u * TAU, out); out.x = oc.x + (out.x - oc.x) * 1.035; out.z = oc.z + (out.z - oc.z) * 1.03; out.y = 0.0098 * (1 - v); },
          center: function (u, v, out) { out.set(fx, 0.005, zc); }, col: SOLE, weights: wts
        });
        surf(shoeB, {
          nu: seg(30), nv: 2, closedU: true,
          f: function (u, v, out) { outline(u * TAU, out); var k = 1 - v; out.x = oc.x + (out.x - oc.x) * 1.035 * k; out.z = oc.z + (out.z - oc.z) * 1.03 * k; out.y = 0; },
          center: function (u, v, out) { out.set(fx, 0.02, zc); }, col: SOLE, weights: wts
        });
        sweep(shoeB, [
          { p: [fx + s * 0.031, 0.022, -0.006], r: [0.0055, 0.0018], bone: bone },
          { p: [fx + s * 0.024, 0.050, -0.007], r: [0.0055, 0.0018] },
          { p: [fx + s * 0.003, 0.064, -0.008], r: [0.0055, 0.0018] },
          { p: [fx - s * 0.020, 0.054, -0.007], r: [0.0055, 0.0018] },
          { p: [fx - s * 0.029, 0.028, -0.006], r: [0.0055, 0.0018] }
        ], { side: AZ, nu: 6, nv: seg(12), capA: 0.6, capB: 0.6, ncap: 2, col: SHOE, weights: wts });
        blob(shoeB, [fx + s * 0.0285, 0.033, -0.0065], [0.0035, 0.0045, 0.004], { col: BUCK, weights: wts, nu: 8, nv: 6, ax: new V3(0.3 * s, 0, 0).add(new V3(s, 0, 0)).normalize(), ay: AY, az: AZ });
      })(s, sd);
    }

    // ---- trim: collar
    var collarW = 0.034, NCU = seg(30), vEdge = [];
    for (var ci = 0; ci <= 60; ci++) {
      var uu = ci / 60, thc = lerp(0.07, PI - 0.09, uu), acc = 0, vv2 = 1, pa = new V3(), pb = new V3();
      var shape = uu < 0.13 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.13 - uu) / 0.13, 2))) : (uu > 0.84 ? Math.sqrt(Math.max(0, 1 - Math.pow((uu - 0.84) / 0.16, 2))) : 1);
      var target = collarW * (0.12 + 0.88 * shape);
      bodyPos(thc, 1, pa);
      while (vv2 > 0.3 && acc < target) { vv2 -= 0.004; bodyPos(thc, vv2, pb); acc += pb.distanceTo(pa); pa.copy(pb); }
      vEdge.push(vv2);
    }
    function vEdgeAt(u) { var x = clamp(u, 0, 1) * 60, i = Math.min(59, Math.floor(x)), f = x - i; return lerp(vEdge[i], vEdge[i + 1], f); }
    var cn = new V3(), cp = new V3();
    for (s = -1; s <= 1; s += 2) {
      (function (s) {
        function cf(u, w, out) {
          var th = s * lerp(0.07, PI - 0.09, clamp(u, 0, 1)), ve = vEdgeAt(u), v, lift;
          var ww = w * 1.18;
          if (ww <= 1) { v = 1 - (1 - ve) * ww; lift = 0.0034 + 0.0016 * ww; }
          else { var r = (ww - 1) / 0.18; v = ve - 0.0035 * Math.sin(r * PI * 0.5); lift = 0.005 * (1 - r) + 0.0012; }
          bodyPos(th, v, out); torsoNormal(bodyPos, th, v, cn);
          out.addScaledVector(cn, lift);
          if (ww <= 1) out.y += 0.004 * Math.pow(1 - ww, 2);
        }
        surf(trimB, {
          nu: NCU, nv: seg(8), closedU: false, f: cf,
          center: function (u, w, out) { var th = s * lerp(0.07, PI - 0.09, clamp(u, 0, 1)); bodyPos(th, vEdgeAt(u), out); torsoNormal(bodyPos, th, vEdgeAt(u), cn); out.addScaledVector(cn, -0.02); },
          col: WHITE, uv: function (u, w) { return [u * 3, w * 0.5]; }, weights: function (p) { return torsoW(p); }
        });
      })(s);
    }
    // ---- trim: sash + bow + buttons
    surf(trimB, {
      nu: seg(64), nv: 5, closedU: true,
      f: function (u, v, out) {
        var th = TAU * u - PI / 2, s2 = Math.sin(th), c2 = Math.cos(th), b = Math.sin(PI * v);
        var g = 0.0008 * Math.sin(41 * th) * b;
        var x = (0.1165 + 0.0016 * b + g) * s2, z = 0.004 + (0.0795 + 0.0016 * b + g) * c2;
        if (c2 < 0) z += c2 * Math.abs(c2) * 0.004;
        out.set(x, lerp(0.598, 0.633, v), z);
      },
      center: function (u, v, out) { out.set(0, lerp(0.598, 0.633, v), 0.004); },
      col: SASH, uv: function (u, v) { return [u * 10, v * 0.5]; }, weights: function (p) { return torsoW(p); }
    });
    var bowW = function (p) { return torsoW(new V3(0, 0.615, 0)); };
    for (s = -1; s <= 1; s += 2) {
      sweep(trimB, [
        { p: [s * 0.003, 0.616, 0.0905], r: [0.0062, 0.0016] },
        { p: [s * 0.022, 0.623, 0.090], r: [0.0105, 0.0017] },
        { p: [s * 0.046, 0.628, 0.092], r: [0.0135, 0.0018] },
        { p: [s * 0.057, 0.625, 0.0975], r: [0.0135, 0.0018] },
        { p: [s * 0.047, 0.622, 0.1045], r: [0.0130, 0.0018] },
        { p: [s * 0.022, 0.619, 0.1025], r: [0.0098, 0.0017] },
        { p: [s * 0.003, 0.616, 0.0985], r: [0.006, 0.0016] }
      ], { side: AY, nu: seg(8), nv: seg(15), capA: 0.3, capB: 0.3, ncap: 2, col: SASH, weights: bowW, us: 1, vs: 8 });
      sweep(trimB, [
        { p: [s * 0.004, 0.612, 0.0985], r: [0.0075, 0.0016] },
        { p: [s * 0.012, 0.590, 0.101], r: [0.0085, 0.0016] },
        { p: [s * 0.022, 0.560, 0.1035], r: [0.0095, 0.0016] },
        { p: [s * 0.030, 0.534, 0.1055], r: [0.0105, 0.0016] }
      ], { side: AX, nu: seg(10), nv: seg(10), capA: 0.3, capB: 0.25, ncap: 2, col: SASH, us: 1, vs: 8,
        weights: function (p) { var t = sstep(0.6, 0.53, p.y); return [[bi('pelvis'), 1 - t * 0.5], [bi('sk0'), t * 0.5]]; } });
    }
    blob(trimB, [0, 0.6155, 0.0985], [0.0085, 0.0105, 0.006], { col: SASH, weights: bowW, nu: 12, nv: 8 });
    [0.48, 0.62, 0.74].forEach(function (vb) {
      var bp = new V3(); bodyPos(0, vb, bp); bp.z += 0.0012;
      blob(trimB, bp, [0.0042, 0.0042, 0.0022], { col: PEARL, weights: function (p) { return torsoW(p); }, nu: 10, nv: 6 });
    });

    // ---- head (rigid, child of the head bone)
    buildHead(headB, low);

    // ---- materials & meshes
    var face = makeFace(512);
    var skinMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc2a8), emissive: new THREE.Color(0x2a1208), emissiveIntensity: 0.6 });
    var headMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: face.tex, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc2a8), emissive: new THREE.Color(0xffffff), emissiveMap: face.tex, emissiveIntensity: 0.07 });
    var dressTex = weaveTex(256, '#eed27c', 9, { dots: 3.6 });
    var dressMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: dressTex, roughness: 0.86, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xfff2d0), side: THREE.DoubleSide });
    var trimTex = weaveTex(128, '#f6f4ef', 10);
    var trimMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: trimTex, vertexColors: true, roughness: 0.82, sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
    var shoeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
    function skinned(b, mat, name) {
      var m = new THREE.SkinnedMesh(b.geometry(true), mat); m.name = name;
      m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      group.add(m); return m;
    }
    var skinMesh = skinned(skinB, skinMat, 'girl-skin');
    var dressMesh = skinned(dressB, dressMat, 'girl-dress');
    var trimMesh = skinned(trimB, trimMat, 'girl-trim');
    var shoeMesh = skinned(shoeB, shoeMat, 'girl-shoes');
    var headCenter = v3(GF.POS.headStand), headBoneW = Bm.head.userData.bindW;
    var headMesh = new THREE.Mesh(headB.geometry(false), headMat); headMesh.name = 'girl-head';
    headMesh.position.subVectors(headCenter, headBoneW); headMesh.castShadow = true; headMesh.receiveShadow = true;
    Bm.head.add(headMesh);
    var headAnchor = new THREE.Object3D(); headAnchor.name = 'girl-headAnchor'; headAnchor.position.copy(headMesh.position); Bm.head.add(headAnchor);
    var torsoAnchor = new THREE.Object3D(); torsoAnchor.name = 'girl-torsoAnchor';
    torsoAnchor.position.set(0, GF.POS.headStand[1] + GF.HEAD.torsoC[1], GF.HEAD.torsoC[2]).sub(Bm.chest.userData.bindW); Bm.chest.add(torsoAnchor);
    var handR = new THREE.Object3D(); handR.name = 'girl-handR'; handR.position.copy(handAnchorPos.R).sub(Bm.handR.userData.bindW); Bm.handR.add(handR);
    var handLa = new THREE.Object3D(); handLa.position.copy(handAnchorPos.L).sub(Bm.handL.userData.bindW); Bm.handL.add(handLa);

    // ---- arm IK records
    function wristEnd(sd) { return new V3().copy(Bm['tw' + sd].position).add(Bm['hand' + sd].position); }
    var armR = makeArm(Bm.clavR, Bm.armR, Bm.foreR, wristEnd('R')), armL = makeArm(Bm.clavL, Bm.armL, Bm.foreL, wristEnd('L'));
    var twAxisR = Bm.handR.position.clone().normalize(), twAxisL = Bm.handL.position.clone().normalize();

    // =================================================================== state
    var st = {
      pose: 'sit', towel: false, towelS: 0,
      face: { smile: 0.25, blink: 0, squint: 0, mouthO: 0, gazeX: 0, gazeY: 0, sleepy: 1 },
      fs: { smile: 0.25, blink: 0, squint: 0, mouthO: 0, gazeX: 0, gazeY: 0, sleepy: 1 },
      hasLook: false, lookW: new V3(), yaw: 0, pitch: 0, eyeX: 0, eyeY: 0,
      wind: 0, windS: 0, walk: 0, walkS: 0, phase: 0, hold: 0, holdS: 0,
      react: null, rt: 0, rdur: 1, blinkT: -1, nextBlink: 1.5, autoBlink: 0, dbl: false,
      lastDraw: -1, happyS: 0, time: 0
    };
    var RK = ['sh', 'chx', 'hx', 'hy', 'hz', 'sy', 'sz', 'bounce', 'kick', 'smile', 'squint', 'mo', 'wide', 'laugh', 'arms'];
    var Rt = {}, Rs = {};
    RK.forEach(function (k) { Rt[k] = 0; Rs[k] = 0; });
    var holdTarget = new V3(0.27, 0.665, -0.025);
    var lapR = new V3(0.074, 0.545, -0.118), lapL = new V3(-0.074, 0.545, -0.118);
    var poleLap = new V3(0.35, -0.2, 1), poleLapL = new V3(-0.35, -0.2, 1), poleHold = new V3(0.35, -1, 0.25);
    var rootOff = { sit: new V3(), stand: new V3() };
    var tq1 = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), fq1 = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), tq3 = new THREE.Quaternion();
    var tE = new THREE.Euler(), tv = new V3(), tv2 = new V3(), tw = new V3();
    var FACE = { open: 1, lift: 0, hclose: 0, gx: 0, gy: 0, wide: 0, brow: 0, knit: 0, squeeze: 0, mw: 0.008, mh: 0, mround: 0, corner: 0, smile: 0, laugh: 0, blush: 0.2 };
    var sig = new Float32Array(12), sigLast = new Float32Array(12); sigLast[0] = -9;

    function eul(bone, x, y, z) { bone.rotation.set(x, y, z); }
    function solveArmTo(arm, sd, targetLocal, pole, w, fkx, fky, fkz, fkfx, twist) {
      // FK
      tE.set(fkx, fky, fkz); fq1.setFromEuler(tE); tE.set(fkfx, 0, 0); fq2.setFromEuler(tE);
      if (w > 0.001) {
        // palm target -> wrist target, in world
        tv.copy(targetLocal); group.localToWorld(tv);
        arm.up.getWorldPosition(tv2);
        tw.subVectors(tv, tv2).normalize(); tv.addScaledVector(tw, -0.036);
        solveIK(arm, tv, pole, tq1, tq2);
        fq1.slerp(tq1, w); fq2.slerp(tq2, w);
      }
      arm.up.quaternion.copy(fq1); arm.fore.quaternion.copy(fq2);
      (sd === 'R' ? Bm.twR : Bm.twL).quaternion.setFromAxisAngle(sd === 'R' ? twAxisR : twAxisL, twist * 0.55);
    }

    // full pose evaluation. neutral = no life / reactions (for calibration)
    function applyPose(dt, t, neutral) {
      var sit = st.pose === 'sit', k = neutral ? 0 : 1;
      var br = Math.sin(t * TAU * 0.26) * k;
      var n1 = (GF.noise2(t * 0.21, 1.7) - 0.5) * k, n2 = (GF.noise2(t * 0.29, 7.3) - 0.5) * k, n3 = (GF.noise2(t * 0.17, 13.1) - 0.5) * k, n4 = (GF.noise2(t * 0.25, 21.9) - 0.5) * k;
      var w = neutral ? 0 : st.walkS, ph = st.phase, sp = Math.sin(ph), cp = Math.cos(ph);
      var R = neutral ? Rt0 : Rs, wind = neutral ? 0 : st.windS, hold = neutral ? 0 : st.holdS;
      var tow = neutral ? 0 : st.towelS;
      // spine
      var pelX = sit ? 0.06 : 0.0, pelY = w * 0.075 * sp + (sit ? 0 : n1 * 0.05), pelZ = (sit ? 0.012 : 0.03) * n2 + R.sz * 0.5 - w * 0.025 * cp;
      var spX = (sit ? -0.03 : 0.01) + 0.008 * br, spY = R.sy * 0.5 - pelY * 0.4, spZ = R.sz * 0.5 - pelZ * 0.5;
      var chX = (sit ? -0.025 : -0.015) - 0.012 * br + R.chx, chY = R.sy * 0.5 - pelY * 0.45, chZ = -pelZ * 0.3 - 0.045 * hold;
      eul(Bm.pelvis, pelX, pelY, pelZ); eul(Bm.spine, spX, spY, spZ); eul(Bm.chest, chX, chY, chZ);
      // shoulders
      var sh = R.sh + 0.11 * wind + 0.014 * br;
      eul(Bm.clavR, 0, 0, sh * 0.9 + 0.03 * hold); eul(Bm.clavL, 0, 0, -sh * 0.9);
      // head & neck: desired head orientation (relative to the room), compensating the spine
      var hX = st.pitch * k + R.hx + n3 * 0.07 - 0.06 * wind - 0.045 * tow + (sit ? 0 : -0.04);
      var hY = -st.yaw * k + R.hy + n4 * 0.09;
      var hZ = R.hz + n1 * 0.05 + 0.03 * wind;
      var bx = pelX + spX + chX, by = pelY + spY + chY, bz = pelZ + spZ + chZ;
      var nx = 0.4 * (hX - bx), ny = 0.4 * (hY - by), nz = 0.4 * (hZ - bz);
      eul(Bm.neck, nx, ny, nz); eul(Bm.head, hX - bx - nx, hY - by - ny, hZ - bz - nz);
      // legs
      var kick = R.kick, hap = neutral ? 0 : st.happyS;
      if (sit) {
        var swR = 0.05 * Math.sin(t * TAU * 0.33) * k + hap * 0.22 * Math.sin(t * TAU * 1.15) + kick * 0.38 * Math.sin(t * TAU * 2.4);
        var swL = 0.05 * Math.sin(t * TAU * 0.33 + 2.1) * k + hap * 0.22 * Math.sin(t * TAU * 1.15 + PI) + kick * 0.38 * Math.sin(t * TAU * 2.4 + PI);
        eul(Bm.thighR, 1.49 - pelX, 0, 0.07); eul(Bm.thighL, 1.49 - pelX, 0, -0.07);
        eul(Bm.shinR, -1.36 + swR, 0, 0); eul(Bm.shinL, -1.36 + swL, 0, 0);
        eul(Bm.footR, -0.32 + swR * 0.3, 0, 0); eul(Bm.footL, -0.32 + swL * 0.3, 0, 0);
      } else {
        var thR = 0.34 * sp * w, thL = -0.34 * sp * w;
        var knR = -(0.06 + 0.62 * Math.pow(Math.max(0, cp), 1.5)) * w - 0.03, knL = -(0.06 + 0.62 * Math.pow(Math.max(0, -cp), 1.5)) * w - 0.03;
        var ftR = (0.16 * Math.max(0, sp) - 0.28 * Math.max(0, -sp) * Math.max(0, -cp) * 2) * w + 0.03, ftL = (0.16 * Math.max(0, -sp) - 0.28 * Math.max(0, sp) * Math.max(0, cp) * 2) * w + 0.03;
        eul(Bm.thighR, thR - pelX + n2 * 0.02, -pelY * 0.5, 0.025 + pelZ * -1); eul(Bm.thighL, thL - pelX - n2 * 0.02, -pelY * 0.5, -0.025 - pelZ);
        eul(Bm.shinR, knR, 0, 0); eul(Bm.shinL, knL, 0, 0);
        eul(Bm.footR, ftR - knR - thR, 0, 0); eul(Bm.footL, ftL - knL - thL, 0, 0);
      }
      // skirt panels
      var thRx = Bm.thighR.rotation.x, thLx = Bm.thighL.rotation.x;
      for (var i = 0; i < SKN; i++) {
        var th = i / SKN * TAU, sx = Math.sin(th), cz = Math.cos(th), b = skB[i];
        if (sit) {
          var front = Math.max(0, -cz), back = Math.max(0, cz), sideA = Math.abs(sx);
          var wsum = back + sideA + front;
          var outA = (0.5 * back + 0.22 * sideA + 1.3 * front) / wsum;
          var scl = (0.55 * back + 0.56 * sideA + 0.84 * front) / wsum;
          setPanel(b, th, outA, 0, 0, scl);
        } else {
          var wr = 0.5 + 0.5 * sx, legP = wr * thRx + (1 - wr) * thLx;
          setPanel(b, th, 0.02 + 0.05 * w, legP * 0.42, -pelZ * 0.6 + w * 0.03 * Math.sin(ph * 2 - 0.8), 1);
        }
      }
      // arms
      var walkArm = sit ? 0 : w;
      var armSwR = -0.30 * sp * walkArm, armSwL = 0.30 * sp * walkArm;
      var fkArmZ = 0.10 + 0.01 * br, foreFK = 0.16 + 0.18 * walkArm;
      if (sit) {
        solveArmTo(armR, 'R', lapR, poleLap, 1, 0.1, 0, fkArmZ, 0.6, 1.25);
        solveArmTo(armL, 'L', lapL, poleLapL, 1, 0.1, 0, -fkArmZ, 0.6, -1.25);
        eul(Bm.handR, -0.10, 0.45, 0.10); eul(Bm.handL, -0.10, -0.45, -0.10);
      } else {
        if (hold > 0.001) Bm.root.updateMatrixWorld(true);
        solveArmTo(armR, 'R', holdTarget, poleHold, hold, 0.04 + armSwR, 0, fkArmZ, foreFK + 0.1 * Math.max(0, -sp) * walkArm, 0.15 * hold);
        solveArmTo(armL, 'L', holdTarget, poleHold, 0, 0.04 + armSwL, 0, -fkArmZ, foreFK + 0.1 * Math.max(0, sp) * walkArm, 0);
        eul(Bm.handR, 0.05 - 0.2 * hold, 0.0, -0.05 - 0.25 * hold); eul(Bm.handL, 0.05, 0.0, 0.05);
      }
      // root
      var off = rootOff[st.pose];
      Bm.root.position.set(off.x + (sit ? 0 : -0.012 * cp * w), off.y + R.bounce + 0.0012 * br + (sit ? 0 : w * (-0.011 + 0.011 * Math.cos(2 * ph))), off.z);
      Bm.root.rotation.set(0, 0, 0);
    }
    var Rt0 = {}; RK.forEach(function (k) { Rt0[k] = 0; });

    function calibrate() {
      var keep = st.pose;
      ['sit', 'stand'].forEach(function (p) {
        st.pose = p; rootOff[p].set(0, 0, 0);
        applyPose(0, 0, true);
        group.updateMatrixWorld(true);
        headAnchor.getWorldPosition(tv); group.worldToLocal(tv);
        rootOff[p].fromArray(p === 'sit' ? GF.POS.headSit : GF.POS.headStand).sub(tv);
      });
      st.pose = keep;
    }
    // group must be at the identity while calibrating (it is, at creation)
    calibrate();

    function reactTargets(name, tau) {
      for (var i = 0; i < RK.length; i++) Rt[RK[i]] = 0;
      if (!name) return;
      var env = Math.sin(PI * clamp(tau, 0, 1)), e2 = Math.min(1, env * 1.7);
      switch (name) {
        case 'wake':
          var y = Math.sin(PI * clamp(tau * 1.5, 0, 1));
          Rt.sh = 0.15 * env; Rt.chx = -0.10 * env; Rt.hx = 0.13 * env; Rt.hz = 0.05 * env;
          Rt.mo = 0.55 * y; Rt.squint = 0.55 * y; Rt.wide = 0.4 * sstep(0.6, 0.8, tau) * (1 - sstep(0.85, 1, tau)); break;
        case 'tickle':
          Rt.sh = 0.26 * e2; Rt.hz = 0.13 * Math.sin(tau * TAU * 2) * env; Rt.sy = 0.10 * Math.sin(tau * TAU * 3) * env; Rt.sz = 0.045 * Math.sin(tau * TAU * 3 + 1) * env;
          Rt.smile = e2; Rt.squint = 0.7 * e2; Rt.laugh = 0.85 * e2; Rt.hx = -0.07 * env; break;
        case 'surprise':
          var a = tau < 0.15 ? sstep(0, 0.15, tau) : 1 - sstep(0.35, 1, tau);
          Rt.sh = 0.16 * a; Rt.chx = -0.05 * a; Rt.hx = 0.06 * a; Rt.wide = a; Rt.mo = 0.9 * a; Rt.bounce = 0.008 * a; break;
        case 'happy':
          Rt.bounce = 0.013 * Math.abs(Math.sin(tau * PI * 3)) * env; Rt.sz = 0.05 * Math.sin(tau * TAU * 2) * env; Rt.hz = 0.10 * Math.sin(tau * TAU * 2 + 0.6) * env;
          Rt.smile = e2; Rt.laugh = 0.9 * e2; Rt.kick = env; Rt.squint = 0.25 * env; Rt.sh = 0.06 * env; break;
        case 'nod':
          Rt.hx = -0.16 * Math.pow(Math.sin(PI * clamp(tau, 0, 1) * 2), 2) * (tau < 0.5 ? 1 : 0.7); Rt.smile = 0.3 * env; break;
      }
    }

    function updateFace(dt, t) {
      var fs = st.fs, f = st.face;
      fs.smile = damp(fs.smile, f.smile, 8, dt); fs.squint = damp(fs.squint, f.squint, 10, dt); fs.mouthO = damp(fs.mouthO, f.mouthO, 10, dt);
      fs.blink = damp(fs.blink, f.blink, 25, dt); fs.gazeX = damp(fs.gazeX, f.gazeX, 12, dt); fs.gazeY = damp(fs.gazeY, f.gazeY, 12, dt);
      fs.sleepy = damp(fs.sleepy, f.sleepy, 2.5, dt);
      // auto blink
      if (st.blinkT < 0) { st.nextBlink -= dt; if (st.nextBlink <= 0) { st.blinkT = 0; } }
      if (st.blinkT >= 0) {
        st.blinkT += dt; var bt = st.blinkT;
        st.autoBlink = bt < 0.06 ? bt / 0.06 : (bt < 0.09 ? 1 : Math.max(0, 1 - (bt - 0.09) / 0.1));
        if (bt > 0.19) { st.blinkT = -1; st.autoBlink = 0; if (!st.dbl && Math.random() < 0.18) { st.nextBlink = 0.12; st.dbl = true; } else { st.nextBlink = 2.2 + Math.random() * 3.2 + fs.sleepy * 1.5; st.dbl = false; } }
      }
      var wind = st.windS;
      var smile = clamp(fs.smile + Rs.smile + 0.65 * wind, 0, 1);
      var squint = clamp(fs.squint + Rs.squint + 0.9 * wind, 0, 1);
      var mo = clamp(fs.mouthO + Rs.mo, 0, 1);
      var laugh = clamp(Rs.laugh + 0.55 * wind + Math.max(0, smile - 0.7) * 2.4, 0, 1);
      var wide = clamp(Rs.wide, 0, 1);
      var blink = Math.max(fs.blink, st.autoBlink);
      var open = (1 - 0.5 * fs.sleepy * (1 - wide)) * (1 - 0.2 * smile) * (1 - 0.97 * squint) * (1 - blink);
      open = clamp(open + 0.2 * wide * (1 - blink), 0, 1.2);
      FACE.open = open; FACE.lift = clamp(0.62 * smile + 0.4 * squint, 0, 1); FACE.hclose = clamp(1.2 * smile + squint - 0.2 * fs.sleepy, 0, 1);
      FACE.gx = clamp(fs.gazeX + st.eyeX, -1, 1); FACE.gy = clamp(fs.gazeY + st.eyeY, -1, 1);
      FACE.wide = wide; FACE.brow = 0.0028 * wide + 0.0012 * mo - 0.0012 * squint - 0.0006 * fs.sleepy; FACE.knit = squint; FACE.squeeze = squint;
      FACE.smile = smile; FACE.laugh = laugh;
      FACE.mw = 0.0082 + 0.0028 * smile + 0.0015 * laugh - 0.0034 * mo;
      FACE.mh = Math.max(0.0055 * laugh, 0.0088 * mo); FACE.mround = mo / (mo + laugh + 1e-3);
      FACE.corner = 0.0026 * smile - 0.0007 * mo * (1 - smile);
      FACE.blush = 0.26 + 0.12 * smile + 0.1 * wind;
      sig[0] = open; sig[1] = FACE.lift; sig[2] = FACE.hclose; sig[3] = FACE.gx; sig[4] = FACE.gy; sig[5] = FACE.brow * 300; sig[6] = smile;
      sig[7] = laugh; sig[8] = mo; sig[9] = FACE.blush; sig[10] = squint; sig[11] = wide;
      var diff = 0; for (var i = 0; i < 12; i++) diff = Math.max(diff, Math.abs(sig[i] - sigLast[i]));
      if (diff > 0.025 && (t - st.lastDraw > 0.033 || st.lastDraw < 0 || t < st.lastDraw)) {
        face.draw(FACE); sigLast.set(sig); st.lastDraw = t;
      }
    }

    function update(dt, t) {
      dt = clamp(dt || 0, 0, 0.1); if (t === undefined) t = st.time + dt; st.time = t;
      // inputs smoothing
      st.windS = damp(st.windS, st.wind, 5, dt);
      st.walkS = damp(st.walkS, st.walk, 4, dt);
      st.holdS = damp(st.holdS, st.hold, 4, dt);
      st.towelS = damp(st.towelS, st.towel ? 1 : 0, 3, dt);
      if (st.walkS > 0.002) st.phase = (st.phase + dt * TAU * 1.38) % (TAU * 1000);
      st.happyS = damp(st.happyS, clamp((st.fs.smile - 0.45) / 0.5, 0, 1), 2, dt);
      // reactions
      if (st.react) { st.rt += dt; var tau = st.rt / st.rdur; if (tau >= 1) { st.react = null; reactTargets(null, 0); } else reactTargets(st.react, tau); }
      for (var i = 0; i < RK.length; i++) Rs[RK[i]] = damp(Rs[RK[i]], Rt[RK[i]], 20, dt);
      // look
      var ty = 0, tp = 0, ex = 0, ey = 0;
      if (st.hasLook) {
        tv.copy(st.lookW); group.worldToLocal(tv);
        var hc = st.pose === 'sit' ? GF.POS.headSit : GF.POS.headStand;
        var dx = tv.x - hc[0], dy = tv.y - hc[1], dz = tv.z - hc[2];
        var yawT = Math.atan2(dx, -dz), pitchT = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        yawT = clamp(yawT, -1.3, 1.3);
        ty = clamp(yawT * 0.55, -0.35, 0.35); tp = clamp(pitchT * 0.5, -0.21, 0.21);
        ex = clamp((yawT - ty) / 0.5, -1, 1); ey = clamp((pitchT - tp) / 0.4, -1, 1);
      }
      st.yaw = damp(st.yaw, ty, 3.2, dt); st.pitch = damp(st.pitch, tp, 3.2, dt);
      st.eyeX = damp(st.eyeX, ex, 10, dt); st.eyeY = damp(st.eyeY, ey, 10, dt);
      applyPose(dt, t, false);
      updateFace(dt, t);
    }

    function setPose(p) {
      if (p !== 'sit' && p !== 'stand') return;
      st.pose = p; shoeMesh.visible = p === 'stand';
      applyPose(0, st.time, false);
    }
    setPose('sit');
    face.draw(FACE);

    var api = {
      group: group, headAnchor: headAnchor, torsoAnchor: torsoAnchor, handR: handR, handL: handLa,
      holdTarget: holdTarget, bones: Bm, meshes: { skin: skinMesh, dress: dressMesh, trim: trimMesh, shoes: shoeMesh, head: headMesh },
      faceCanvas: face.canvas,
      setPose: setPose,
      get pose() { return st.pose; },
      setFace: function (o) {
        if (!o) return;
        var f = st.face;
        if (typeof o.smile === 'number') f.smile = clamp(o.smile, 0, 1);
        if (typeof o.blink === 'number') f.blink = clamp(o.blink, 0, 1);
        if (typeof o.squint === 'number') f.squint = clamp(o.squint, 0, 1);
        if (typeof o.mouthO === 'number') f.mouthO = clamp(o.mouthO, 0, 1);
        if (typeof o.gazeX === 'number') f.gazeX = clamp(o.gazeX, -1, 1);
        if (typeof o.gazeY === 'number') f.gazeY = clamp(o.gazeY, -1, 1);
        if (typeof o.sleepy === 'number') f.sleepy = clamp(o.sleepy, 0, 1);
      },
      lookAt: function (p) {
        if (p && typeof p.x === 'number' && isFinite(p.x + p.y + p.z)) { st.lookW.set(p.x, p.y, p.z); st.hasLook = true; } else st.hasLook = false;
      },
      setWindFace: function (v) { st.wind = clamp(+v || 0, 0, 1); },
      react: function (name) {
        var d = { wake: 1.3, tickle: 1.1, surprise: 0.85, happy: 1.25, nod: 0.8 }[name];
        if (!d) return;
        st.react = name; st.rt = 0; st.rdur = d;
        if (name === 'wake') st.face.sleepy = 0;
      },
      setTowelOn: function (b) { st.towel = !!b; },
      setWalk: function (v) { st.walk = clamp(+v || 0, 0, 1); },
      holdHand: function (v) { st.hold = clamp(+v || 0, 0, 1); },
      update: update
    };
    return api;
  };

  // =====================================================================================
  //                                           MUM
  // =====================================================================================
  GF.createMom = function (opts) {
    opts = opts || {};
    var low = !!opts.low, qq = low ? 0.62 : 1;
    function seg(n) { return Math.max(4, Math.round(n * qq)); }
    var group = new THREE.Group(); group.name = 'mom';
    var defs = [
      ['root', null, [0, 0, 0]],
      ['pelvis', 'root', [0, 0.93, 0]],
      ['spine', 'pelvis', [0, 1.06, 0.005]],
      ['chest', 'spine', [0, 1.20, 0.01]],
      ['neck', 'chest', [0, 1.385, 0.015]],
      ['head', 'neck', [0, 1.46, 0.01]],
      ['clavR', 'chest', [0.03, 1.34, 0.012]], ['armR', 'clavR', [0.165, 1.315, 0.014]], ['foreR', 'armR', [0.183, 1.04, 0.03]], ['handR', 'foreR', [0.19, 0.80, 0.028]],
      ['clavL', 'chest', [-0.03, 1.34, 0.012]], ['armL', 'clavL', [-0.165, 1.315, 0.014]], ['foreL', 'armL', [-0.183, 1.04, 0.03]], ['handL', 'foreL', [-0.19, 0.80, 0.028]],
      ['thighR', 'pelvis', [0.088, 0.875, 0]], ['shinR', 'thighR', [0.085, 0.475, 0.0]], ['footR', 'shinR', [0.082, 0.078, 0.02]],
      ['thighL', 'pelvis', [-0.088, 0.875, 0]], ['shinL', 'thighL', [-0.085, 0.475, 0.0]], ['footL', 'shinL', [-0.082, 0.078, 0.02]]
    ];
    var SKN = 8, WY = 0.99, SW = 0.135, SD = 0.094, SZ = 0.0;
    defs = defs.concat(skirtBoneDefs('sk', 'pelvis', WY, SW, SD, SZ, SKN));
    var rig = makeBones(defs), Bm = rig.map, skB = [];
    for (var ki = 0; ki < SKN; ki++) skB.push(Bm['sk' + ki]);
    function bi(n) { return Bm[n].userData.idx; }
    group.add(Bm.root); group.updateMatrixWorld(true);
    var skeleton = new THREE.Skeleton(rig.list);
    var SKIN = C(0xe9c0a3), HAIR = C(0x2a1c14), CARD = C(0xd9c9ad), RIB = C(0xc9b89b), SKIRT = C(0x3e4a5d), SHOE = C(0x6d5c4e), SOLE = C(0x3b302a);
    var skinB = new Builder(), clothB = new Builder();

    function torsoW(p) {
      var y = p.y, ax = Math.abs(p.x), sd = p.x >= 0 ? 'R' : 'L', w = [];
      var a = sstep(0.95, 1.05, y), b = sstep(1.12, 1.22, y);
      var wp = 1 - a, ws = a * (1 - b), wc = a * b, cl = sstep(0.08, 0.17, ax) * sstep(1.25, 1.33, y) * 0.8;
      if (wp > 0) w.push([bi('pelvis'), wp]); if (ws > 0) w.push([bi('spine'), ws]);
      if (wc > 0) { w.push([bi('chest'), wc * (1 - cl)]); if (cl > 0) w.push([bi('clav' + sd), wc * cl]); }
      return w;
    }
    // cardigan body
    var MK = {
      y: [0.845, 0.95, 1.04, 1.13, 1.215, 1.285, 1.33, 1.365, 1.392],
      W: [0.192, 0.172, 0.150, 0.157, 0.166, 0.176, 0.160, 0.115, 0.062],
      D: [0.130, 0.118, 0.100, 0.104, 0.110, 0.100, 0.084, 0.068, 0.056],
      zc: [0.005, 0.004, 0.006, 0.006, 0.006, 0.010, 0.012, 0.014, 0.016],
      tum: [0, 0, 0, 0.012, 0.02, 0.008, 0, 0, 0],
      ex: [2.1, 2.1, 2.1, 2.2, 2.3, 2.45, 2.4, 2.2, 2.0], blade: 0.006
    };
    var mPos = makeTorso(MK, 0.02);
    surf(clothB, {
      nu: seg(36), nv: seg(18), closedU: true,
      f: function (u, v, out) { mPos(TAU * u - PI / 2, v, out); var th = TAU * u - PI / 2; if (v < 0.08) { var r = 1 + 0.02 * (1 - v / 0.08); out.x *= r; out.z = (out.z - 0.005) * r + 0.005; } },
      center: function (u, v, out) { out.set(0, keyAt(MK.y, v), keyAt(MK.zc, v)); },
      color: function (p, u, v) { return v < 0.05 ? RIB : CARD; }, uv: function (u, v, p) { return [u * 20, p.y / 0.03]; },
      weights: function (p) { return torsoW(p); }
    });
    // skirt
    var sLen = 0.70;
    var mskW = skirtWeights(Bm, 'sk', bi('pelvis'), SKN, WY, sLen);
    surf(clothB, {
      nu: seg(60), nv: seg(16), closedU: true,
      f: function (u, v, out) {
        var th = TAU * u - PI / 2, lip = 0, vv = v / 0.92; if (vv > 1) { lip = (vv - 1) / (0.08 / 0.92); vv = 1; }
        var e = Math.pow(vv, 1.25), rx = SW + 0.15 * e, rz = SD + 0.13 * e;
        var fold = 0.02 * Math.pow(vv, 1.1) * (0.55 * Math.sin(7 * th + 0.7) + 0.35 * Math.sin(12 * th + 2.0) + 0.2 * Math.sin(19 * th + 4.1));
        var s = Math.sin(th), c = Math.cos(th), k = 1 - lip * 0.03;
        out.set(rx * s * k + s * fold, WY - sLen * vv + lip * 0.02, SZ + 0.02 * e + rz * c * k + c * fold);
      },
      center: function (u, v, out) { var vv = Math.min(1, v / 0.92); out.set(0, WY - sLen * vv, 0.02 * vv); },
      color: function () { return SKIRT; }, uv: function (u, v, p) { return [u * 30, (WY - p.y) / 0.03]; },
      weights: function (p) { return mskW(p); }
    });
    var palm = {};
    for (var s = -1; s <= 1; s += 2) {
      var sd = s > 0 ? 'R' : 'L';
      // cardigan sleeve
      sweep(clothB, [
        { p: [s * 0.14, 1.335, 0.012], r: [0.05, 0.05], bone: bi('chest') },
        { p: [s * 0.165, 1.31, 0.014], r: [0.054, 0.052], bone: bi('arm' + sd), bw: 0.08 },
        { p: [s * 0.175, 1.17, 0.02], r: [0.047, 0.046] },
        { p: [s * 0.183, 1.04, 0.03], r: [0.044, 0.043], bone: bi('fore' + sd), bw: 0.06 },
        { p: [s * 0.187, 0.90, 0.03], r: [0.037, 0.037] },
        { p: [s * 0.189, 0.835, 0.029], r: [0.034, 0.034], bone: bi('hand' + sd), bw: 0.04 },
        { p: [s * 0.19, 0.815, 0.028], r: [0.034, 0.034] }
      ], { side: AX, nu: seg(16), nv: seg(16), capA: 0.8, capB: 0, ncap: 3, us: 5, vs: 1 / 0.03, color: function (p, a) { return a > 0.9 ? RIB : CARD; } });
      palm[sd] = buildHand(skinB, { wrist: [s * 0.19, 0.825, 0.028], d: new V3(s * 0.03, -1, 0), n: new V3(-s, 0, 0), t: new V3(0, 0, -1), sc: 1.45, curl: s > 0 ? 1.5 : 0.4, bone: bi('hand' + sd), col: SKIN, q: 0.5 });
      sweep(skinB, [
        { p: [s * 0.19, 0.86, 0.028], r: [0.026, 0.028], bone: bi('hand' + sd) },
        { p: [s * 0.19, 0.82, 0.028], r: [0.022, 0.028] }
      ], { side: AX, nu: seg(12), nv: 3, capA: 0, capB: 0.6, ncap: 2, col: SKIN });
      // lower legs (skin) and shoes
      sweep(skinB, [
        { p: [s * 0.086, 0.62, 0.0], r: [0.05, 0.05], bone: bi('thigh' + sd) },
        { p: [s * 0.085, 0.475, 0.0], r: [0.045, 0.045], bone: bi('shin' + sd), bw: 0.05 },
        { p: [s * 0.084, 0.33, 0.012], r: [0.041, 0.044] },
        { p: [s * 0.083, 0.17, 0.016], r: [0.03, 0.031] },
        { p: [s * 0.082, 0.085, 0.02], r: [0.024, 0.025], bone: bi('foot' + sd), bw: 0.03 },
        { p: [s * 0.082, 0.06, 0.02], r: [0.023, 0.024] }
      ], { side: AX, nu: seg(14), nv: seg(14), capA: 0, capB: 0.6, ncap: 2, col: SKIN });
      sweep(clothB, [
        { p: [s * 0.082, 0.040, 0.06], r: [0.03, 0.032], bone: bi('foot' + sd) },
        { p: [s * 0.083, 0.045, 0.02], r: [0.035, 0.042] },
        { p: [s * 0.085, 0.036, -0.04], r: [0.04, 0.032] },
        { p: [s * 0.086, 0.028, -0.11], r: [0.041, 0.022] },
        { p: [s * 0.085, 0.024, -0.16], r: [0.032, 0.017] }
      ], { side: AX, nu: seg(16), nv: seg(10), capA: 1, capB: 1, ncap: 3, flatB: 0.78, col: SHOE, us: 4, vs: 20 });
    }
    // neck + head + hair (hidden under the parasol, but complete)
    sweep(skinB, [
      { p: [0, 1.33, 0.02], r: [0.05, 0.048], bone: bi('chest') },
      { p: [0, 1.385, 0.018], r: [0.049, 0.047], bone: bi('neck'), bw: 0.05 },
      { p: [0, 1.45, 0.012], r: [0.046, 0.045], bone: bi('head'), bw: 0.05 },
      { p: [0, 1.50, 0.005], r: [0.04, 0.04] }
    ], { side: AX, nu: seg(16), nv: seg(8), capA: 0, capB: 0.6, col: SKIN });
    var hcen = new V3(0, 1.515, 0.0), hw = function () { return [[bi('head'), 1]]; };
    surf(skinB, {
      nu: seg(20), nv: seg(12), closedU: true,
      f: function (u, v, out) { var th = v * PI, ph = u * TAU, st = Math.sin(th); out.set(st * Math.sin(ph) * 0.076, Math.cos(th) * 0.108, -st * Math.cos(ph) * 0.094).add(hcen); },
      center: function (u, v, out) { out.copy(hcen); },
      color: function (p) { var y = p.y - hcen.y, z = p.z - hcen.z; return (y > 0.035 || z > -0.03 + Math.max(0, -y - 0.02) * 0.2 && y > -0.06) ? HAIR : SKIN; },
      weights: hw
    });
    blob(skinB, [0, 1.52, 0.1], [0.062, 0.095, 0.03], { col: HAIR, weights: hw, nu: 16, nv: 10 });
    blob(skinB, [0, 1.535, 0.125], [0.042, 0.038, 0.034], { col: HAIR, weights: hw, nu: 14, nv: 10 });

    // materials
    var clothTex = weaveTex(128, '#f2f2f2', 14, { rib: 24 });
    var clothMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: clothTex, vertexColors: true, roughness: 0.88, sheen: 0.5, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
    var skinMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc2a8) });
    function skinned(b, mat, name) {
      var m = new THREE.SkinnedMesh(b.geometry(true), mat); m.name = name; m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); return m;
    }
    skinned(skinB, skinMat, 'mom-skin'); skinned(clothB, clothMat, 'mom-cloth');
    var handL = new THREE.Object3D(); handL.name = 'mom-handL'; handL.position.copy(palm.L).sub(Bm.handL.userData.bindW); Bm.handL.add(handL);

    var st = { walk: 0, walkS: 0, reach: 0, reachS: 0, phase: 0, time: 0, bagA: 0, bagV: 0 };
    var armL = makeArm(Bm.clavL, Bm.armL, Bm.foreL, Bm.handL.position.clone());
    var reachT = new V3(-0.205, 0.64, 0.05), poleReach = new V3(-0.6, 0.0, 0.8);
    var tE = new THREE.Euler(), fq1 = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), iq1 = new THREE.Quaternion(), iq2 = new THREE.Quaternion(), tv = new V3(), tv2 = new V3(), tw = new V3();
    function eul(b, x, y, z) { b.rotation.set(x, y, z); }
    var RA = { x: 0.30, y: -0.20, z: 0.0, fx: 1.74, hx: -0.15, hy: 0.0, hz: 0.25 };

    function applyPose(dt, t, neutral) {
      var k = neutral ? 0 : 1, w = neutral ? 0 : st.walkS, r = neutral ? 0 : st.reachS, ph = st.phase, sp = Math.sin(ph), cp = Math.cos(ph);
      var n1 = (GF.noise2(t * 0.17, 3.3) - 0.5) * k, n2 = (GF.noise2(t * 0.23, 9.1) - 0.5) * k, br = Math.sin(t * TAU * 0.22) * k;
      var pelY = 0.05 * sp * w + n1 * 0.03, pelZ = 0.02 * n2 - 0.02 * cp * w;
      eul(Bm.pelvis, 0, pelY, pelZ);
      eul(Bm.spine, 0.005 * br + 0.04 * r, -pelY * 0.4, -pelZ * 0.5 + 0.08 * r);
      eul(Bm.chest, -0.01 - 0.006 * br + 0.05 * r, -pelY * 0.5 - 0.08 * r, -pelZ * 0.3 + 0.15 * r);
      eul(Bm.neck, 0, 0, 0); eul(Bm.head, -0.03, 0.05 * r, -0.04 * r);
      eul(Bm.clavR, 0, 0, 0.01 * br); eul(Bm.clavL, 0, 0, -0.01 * br + 0.16 * r);
      var thR = 0.24 * sp * w, thL = -0.24 * sp * w;
      var knR = -(0.04 + 0.5 * Math.pow(Math.max(0, cp), 1.5)) * w, knL = -(0.04 + 0.5 * Math.pow(Math.max(0, -cp), 1.5)) * w;
      eul(Bm.thighR, thR, -pelY * 0.5, 0.012 - pelZ); eul(Bm.thighL, thL, -pelY * 0.5, -0.012 - pelZ);
      eul(Bm.shinR, knR, 0, 0); eul(Bm.shinL, knL, 0, 0);
      eul(Bm.footR, -knR - thR + 0.12 * Math.max(0, sp) * w, 0, 0); eul(Bm.footL, -knL - thL + 0.12 * Math.max(0, -sp) * w, 0, 0);
      for (var i = 0; i < SKN; i++) {
        var th = i / SKN * TAU, sx = Math.sin(th), wr = 0.5 + 0.5 * sx;
        var lag = Math.sin(ph - 0.7) * 0.24 * w, legP = wr * lag + (1 - wr) * -lag;
        setPanel(skB[i], th, 0.015 + 0.03 * w, legP * 0.35 + 0.01 * n1, -pelZ * 0.7 + 0.025 * w * Math.sin(2 * ph - 1.0) + 0.01 * n2, 1);
      }
      // right arm: parasol
      eul(Bm.armR, RA.x + 0.015 * Math.sin(2 * ph) * w, RA.y, RA.z); eul(Bm.foreR, RA.fx, 0, 0); eul(Bm.handR, RA.hx, RA.hy, RA.hz);
      // left arm: swing / reach
      tE.set(0.03 + 0.16 * sp * w * (1 - r), 0, -0.07); fq1.setFromEuler(tE); tE.set(0.12 + 0.1 * w, 0, 0); fq2.setFromEuler(tE);
      if (r > 0.001) {
        Bm.root.updateMatrixWorld(true);
        tv.copy(reachT); group.localToWorld(tv); Bm.armL.getWorldPosition(tv2); tw.subVectors(tv, tv2).normalize(); tv.addScaledVector(tw, -0.05);
        solveIK(armL, tv, poleReach, iq1, iq2); fq1.slerp(iq1, r); fq2.slerp(iq2, r);
      }
      Bm.armL.quaternion.copy(fq1); Bm.foreL.quaternion.copy(fq2);
      eul(Bm.handL, -0.25 * r, 0.6 * r, 0.1 * r);
      Bm.root.position.set(-0.008 * cp * w, w * (-0.012 + 0.009 * Math.cos(2 * ph)) - 0.008 * r, 0);
    }
    applyPose(0, 0, true);
    group.updateMatrixWorld(true);
    // parasol: placed in the posed hand, shaft over the right shoulder
    var grip = new V3(); Bm.handR.localToWorld(grip.copy(palm.R).sub(Bm.handR.userData.bindW));
    var shoulder = new V3(); Bm.armR.getWorldPosition(shoulder); shoulder.add(new V3(-0.01, 0.075, 0.06));
    var sdir = new V3().subVectors(shoulder, grip).normalize();
    sdir.lerp(new V3(0.02, 0.86, 0.5).normalize(), 0.45).normalize();
    var parasolPivot = new THREE.Object3D(); parasolPivot.name = 'mom-parasol';
    var qW = new THREE.Quaternion().setFromUnitVectors(AY, sdir), hq = new THREE.Quaternion(); Bm.handR.getWorldQuaternion(hq);
    parasolPivot.quaternion.copy(hq.clone().invert().multiply(qW));
    parasolPivot.position.copy(Bm.handR.worldToLocal(grip.clone()));
    Bm.handR.add(parasolPivot);
    var spin = new THREE.Object3D(); parasolPivot.add(spin);
    // canopy
    var CR = 0.43, CH = 0.17, APEX = 0.80, NRIB = 8, PHM = 1.05;
    var canB = new Builder();
    function canopyF(u, v, out) {
      var th = u * TAU, rib = Math.abs(Math.cos(th * NRIB / 2));            // 1 at ribs, 0 between
      var vmax = 1 + 0.075 * (1 - Math.pow(rib, 1.6)), s = v * vmax;
      var a = s * PHM, rr = CR * Math.sin(a) / Math.sin(PHM), y = APEX - CH * (1 - Math.cos(a)) / (1 - Math.cos(PHM));
      var sag = 0.035 * (1 - rib) * Math.sin(Math.min(1, s) * PI) * 0.6;
      rr *= 1 - sag * 0.3; y -= sag * 0.25;
      out.set(Math.cos(th) * rr, y, Math.sin(th) * rr);
    }
    surf(canB, {
      nu: seg(72), nv: seg(13), closedU: true, f: canopyF,
      center: function (u, v, out) { out.set(0, APEX - 0.5, 0); },
      pole: function (u, v, out) { if (v < 1e-6) { out.set(0, 1, 0); return true; } return false; },
      uv: function (u, v, p) { return [0.5 + p.x / (CR * 2.4), 0.5 + p.z / (CR * 2.4)]; }
    });
    var canTex = GF.canvasTex(512, 512, function (c, w, h) {
      c.fillStyle = '#f3ecdc'; c.fillRect(0, 0, w, h);
      var img = c.getImageData(0, 0, w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var i = (y * w + x) * 4, n = ((x + y) & 1 ? 2 : -2) + (GF.noise2(x * 0.5, y * 0.5) - 0.5) * 8; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      c.putImageData(img, 0, 0);
      var cx = w / 2, cy = h / 2, R0 = w / 2.4;
      c.strokeStyle = 'rgba(150,130,100,0.35)'; c.lineWidth = 1.5;
      for (var k = 0; k < NRIB; k++) { var a = k / NRIB * TAU; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w); c.stroke(); }
      // lace band near the edge
      c.strokeStyle = 'rgba(205,190,160,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R0 * 0.86, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(190,172,140,0.55)';
      for (k = 0; k < 120; k++) { var b = k / 120 * TAU; c.beginPath(); c.arc(cx + Math.cos(b) * R0 * 0.93, cy + Math.sin(b) * R0 * 0.93, 2.2, 0, TAU); c.fill(); }
      c.strokeStyle = 'rgba(180,160,125,0.6)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R0 * 1.0, 0, TAU); c.stroke();
    });
    var canMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: canTex, roughness: 0.85, sheen: 0.4, sheenColor: new THREE.Color(0xfff6e0), side: THREE.DoubleSide, emissive: new THREE.Color(0xfff2da), emissiveMap: canTex, emissiveIntensity: 0.12 });
    var canopy = new THREE.Mesh(canB.geometry(false), canMat); canopy.castShadow = true; canopy.receiveShadow = true; canopy.name = 'mom-canopy';
    spin.add(canopy);
    // shaft, handle, ribs, finial
    var wdB = new Builder(), WOOD = C(0x8a5a36), MET = C(0xb9b2a6);
    sweep(wdB, [{ p: [0, -0.12, 0], r: [0.0135, 0.0135] }, { p: [0, -0.02, 0], r: [0.0145, 0.0145] }, { p: [0, 0.05, 0], r: [0.012, 0.012] }], { side: AX, nu: 12, nv: 4, capA: 1, capB: 0, col: WOOD });
    sweep(wdB, [{ p: [0, 0.04, 0], r: [0.0065, 0.0065] }, { p: [0, APEX + 0.06, 0], r: [0.006, 0.006] }], { side: AX, nu: 8, nv: 2, capA: 0, capB: 1, col: WOOD });
    blob(wdB, [0, APEX + 0.065, 0], [0.011, 0.016, 0.011], { col: WOOD, nu: 10, nv: 8 });
    var tp = new V3();
    for (var rk = 0; rk < NRIB; rk++) {
      var keys = [];
      for (var q = 0; q <= 4; q++) { canopyF(rk / NRIB, 0.08 + q / 4 * 0.92, tp); tp.y -= 0.006; tp.multiplyScalar(1); keys.push({ p: [tp.x * 0.995, tp.y, tp.z * 0.995], r: [0.0022, 0.0022] }); }
      sweep(wdB, keys, { side: AY, nu: 4, nv: 6, capA: 0, capB: 1, ncap: 2, col: MET });
      canopyF(rk / NRIB, 1.0, tp); blob(wdB, [tp.x * 1.01, tp.y - 0.004, tp.z * 1.01], [0.006, 0.008, 0.006], { col: WOOD, nu: 8, nv: 6 });
    }
    var woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.45, metalness: 0.0 });
    var shaft = new THREE.Mesh(wdB.geometry(false), woodMat); shaft.castShadow = true; shaft.name = 'mom-parasol-shaft'; spin.add(shaft);
    // tote bag on the right forearm (rigid + pendulum)
    var elbow = new V3(); Bm.foreR.getWorldPosition(elbow);
    var handW = new V3(); Bm.handR.getWorldPosition(handW);
    var hookW = elbow.clone().lerp(handW, 0.22); hookW.y += 0.035;
    var bagPivot = new THREE.Object3D(); bagPivot.position.copy(Bm.foreR.worldToLocal(hookW.clone()));
    var fq = new THREE.Quaternion(); Bm.foreR.getWorldQuaternion(fq); bagPivot.quaternion.copy(fq.invert());
    Bm.foreR.add(bagPivot);
    var bagSwing = new THREE.Object3D(); bagPivot.add(bagSwing);
    var bgB = new Builder(), BAG = C(0xcbb998), BAGH = C(0x8b5a3a), BSTR = C(0x3e4a5d);
    var bx = 0.055, bh = 0.15, bw = 0.15, bcy = -0.29;
    surf(bgB, {
      nu: 24, nv: 10, closedU: true,
      f: function (u, v, out) {
        var ph = u * TAU, c = Math.cos(ph), s2 = Math.sin(ph), e = 0.35;
        var x = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e) * bx * (0.6 + 0.4 * v), z = (s2 < 0 ? -1 : 1) * Math.pow(Math.abs(s2), e) * bw * (1 + 0.06 * (1 - v));
        out.set(x * (0.85 + 0.15 * Math.sin(PI * v)), bcy - bh + 2 * bh * v, z);
      },
      center: function (u, v, out) { out.set(0, bcy - bh + 2 * bh * v, 0); },
      col: BAG, uv: function (u, v, p) { return [u * 12, p.y / 0.03]; }
    });
    surf(bgB, { nu: 16, nv: 3, closedU: true, f: function (u, v, out) { var ph = u * TAU, c = Math.cos(ph), s2 = Math.sin(ph); out.set((c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 0.35) * bx * 0.6 * (1 - v), bcy - bh, (s2 < 0 ? -1 : 1) * Math.pow(Math.abs(s2), 0.35) * bw * 1.06 * (1 - v)); }, center: function (u, v, out) { out.set(0, bcy, 0); }, col: BAG });
    for (var hs = -1; hs <= 1; hs += 2) {
      sweep(bgB, [{ p: [hs * 0.03, bcy + bh - 0.01, -0.07], r: [0.004, 0.007] }, { p: [hs * 0.02, bcy + bh + 0.12, -0.035], r: [0.004, 0.007] }, { p: [hs * 0.005, -0.004, 0], r: [0.004, 0.007] }, { p: [hs * 0.02, bcy + bh + 0.12, 0.035], r: [0.004, 0.007] }, { p: [hs * 0.03, bcy + bh - 0.01, 0.07], r: [0.004, 0.007] }],
        { side: AX, nu: 5, nv: 12, capA: 0.5, capB: 0.5, ncap: 2, col: BAGH });
    }
    var bag = new THREE.Mesh(bgB.geometry(false), clothMat); bag.castShadow = true; bag.receiveShadow = true; bag.name = 'mom-bag'; bagSwing.add(bag);

    function update(dt, t) {
      dt = clamp(dt || 0, 0, 0.1); if (t === undefined) t = st.time + dt; st.time = t;
      st.walkS = damp(st.walkS, st.walk, 3, dt); st.reachS = damp(st.reachS, st.reach, 3.5, dt);
      if (st.walkS > 0.002) st.phase = (st.phase + dt * TAU * 0.92) % (TAU * 1000);
      applyPose(dt, t, false);
      var w = st.walkS, ph = st.phase;
      spin.rotation.set(0.025 * Math.sin(2 * ph - 0.6) * w + 0.01 * Math.sin(t * 0.9), 0.35 * Math.sin(t * 0.33) + 0.2 * Math.sin(t * 0.13), 0.02 * Math.sin(ph) * w);
      // bag pendulum
      var drive = -0.6 * Math.sin(2 * ph) * w;
      st.bagV += (-st.bagA * 28 - st.bagV * 3 + drive * 6) * dt; st.bagA += st.bagV * dt; st.bagA = clamp(st.bagA, -0.4, 0.4);
      bagSwing.rotation.set(st.bagA, 0, 0.3 * st.bagA);
    }
    update(0, 0);
    return {
      group: group, handL: handL, bones: Bm, parasol: parasolPivot,
      reach: function (v) { st.reach = clamp(+v || 0, 0, 1); },
      setWalk: function (v) { st.walk = clamp(+v || 0, 0, 1); },
      update: update
    };
  };
})();
