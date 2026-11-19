// 形を作る道具。部品はすべてパラメータから手続き的に生成し、剛体ごと・材質ごとに 1 つの BufferGeometry に結合する。
//  - Builder：three の基本形や自作の面を、変換・色・UV を付けて 1 本に結合（index つき）
//  - polarPrism：極座標の輪郭を押し出す（平歯車・ラチェット車）
//  - bevelGear：かさ歯車（輪郭を円すいの頂点へ向けて縮める）
//  - thread：台形ねじ（台形断面をらせんに沿って掃引）
//  - roundedBox：角の丸い箱（ロボット）
import { TAU } from './params.js';

export function createKit(THREE, atlas) {
  const WHITE = atlas ? atlas.white : [0.5, 0.5];
  const _c = new THREE.Color();
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

  // 位置・回転（XYZ オイラー）・拡大の行列
  const _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)).clone(), new THREE.Vector3(sx, sy, sz));
  }

  class Builder {
    constructor({ colors = true } = {}) {
      this.pos = []; this.nor = []; this.uv = []; this.col = colors ? [] : null; this.idx = [];
      this.r = 1; this.g = 1; this.b = 1;
      this.count = 0;
    }
    color(hex) { _c.set(hex); this.r = _c.r; this.g = _c.g; this.b = _c.b; return this; }
    vert(x, y, z, nx, ny, nz, u = WHITE[0], v = WHITE[1]) {
      this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v);
      if (this.col) this.col.push(this.r, this.g, this.b);
      return this.count++;
    }
    tri(a, b, c) { this.idx.push(a, b, c); }
    // 平らな四角形（p0..p3 は一周の順）。hint の向きが表になるように向きを決める。uv は [u0,v0,u1,v1]（省略時は白）
    quad(p0, p1, p2, p3, hint, uvRect) {
      _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      _b.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      _n.crossVectors(_a, _b);
      if (_n.lengthSq() < 1e-16) { // p0 と p1 が重なる三角形など
        _a.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
        _n.crossVectors(_a, _b);
        if (_n.lengthSq() < 1e-16) return;
      }
      _n.normalize();
      const flip = hint && _n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0;
      if (flip) _n.negate();
      const R = uvRect;
      const i0 = this.vert(p0[0], p0[1], p0[2], _n.x, _n.y, _n.z, R ? R[0] : undefined, R ? R[1] : undefined);
      const i1 = this.vert(p1[0], p1[1], p1[2], _n.x, _n.y, _n.z, R ? R[2] : undefined, R ? R[1] : undefined);
      const i2 = this.vert(p2[0], p2[1], p2[2], _n.x, _n.y, _n.z, R ? R[2] : undefined, R ? R[3] : undefined);
      const i3 = this.vert(p3[0], p3[1], p3[2], _n.x, _n.y, _n.z, R ? R[0] : undefined, R ? R[3] : undefined);
      if (flip) { this.tri(i0, i2, i1); this.tri(i0, i3, i2); } else { this.tri(i0, i1, i2); this.tri(i0, i2, i3); }
    }
    // three の geometry を足す。m：変換行列。opt.uv：なし=白 / 'keep' / {scale:[su,sv]} / {rect:[u0,v0,u1,v1]} / {world:s}（面の向きで平面投影）
    add(geom, m, opt = {}) {
      const p = geom.attributes.position, n = geom.attributes.normal, t = geom.attributes.uv;
      const base = this.count;
      if (m) _nm.getNormalMatrix(m);
      const uvm = opt.uv;
      for (let i = 0; i < p.count; i++) {
        _v.fromBufferAttribute(p, i);
        _n.fromBufferAttribute(n, i);
        if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
        let u = WHITE[0], v = WHITE[1];
        if (uvm && t) {
          const tu = t.getX(i), tv = t.getY(i);
          if (uvm === 'keep') { u = tu; v = tv; }
          else if (uvm.scale) { u = tu * uvm.scale[0]; v = tv * uvm.scale[1]; }
          else if (uvm.rect) { u = uvm.rect[0] + (uvm.rect[2] - uvm.rect[0]) * tu; v = uvm.rect[1] + (uvm.rect[3] - uvm.rect[1]) * tv; }
        }
        if (uvm && uvm.world) {
          const s = uvm.world, ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
          if (ax >= ay && ax >= az) { u = _v.z * s; v = _v.y * s; } else if (ay >= az) { u = _v.x * s; v = _v.z * s; } else { u = _v.x * s; v = _v.y * s; }
        }
        this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, u, v);
      }
      const flip = m ? m.determinant() < 0 : false;
      if (geom.index) {
        const ix = geom.index;
        for (let i = 0; i < ix.count; i += 3) {
          const a = ix.getX(i) + base, b = ix.getX(i + 1) + base, c = ix.getX(i + 2) + base;
          if (flip) this.tri(a, c, b); else this.tri(a, b, c);
        }
      } else {
        for (let i = 0; i < p.count; i += 3) { if (flip) this.tri(base + i, base + i + 2, base + i + 1); else this.tri(base + i, base + i + 1, base + i + 2); }
      }
      if (!opt.keep) geom.dispose();
      return this;
    }
    // よく使う形
    box(w, h, d, m, opt) { return this.add(new THREE.BoxGeometry(w, h, d), m, opt); }
    cyl(r1, r2, h, seg, m, opt = {}) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg, 1, !!opt.open), m, opt); }
    sphere(r, ws, hs, m, opt) { return this.add(new THREE.SphereGeometry(r, ws, hs), m, opt); }
    torus(R, r, rs, ts, m, opt = {}) { return this.add(new THREE.TorusGeometry(R, r, rs, ts, opt.arc || TAU), m, opt); }
    capsule(r, len, cs, rs, m, opt) { return this.add(new THREE.CapsuleGeometry(r, len, cs, rs), m, opt); }
    rbox(w, h, d, r, k, m, opt) { return this.add(roundedBox(w, h, d, r, k), m, opt); }
    // 絵（アトラスの一部）を貼った板。XY 面で +Z 向き
    decal(rect, w, h, m) {
      const g = new THREE.PlaneGeometry(w, h);
      return this.add(g, m, { uv: { rect } });
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
      if (this.col) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
      g.setIndex(new THREE.BufferAttribute(this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      this.pos = this.nor = this.uv = this.col = this.idx = null;
      return g;
    }
  }

  // ---- 角の丸い箱。k = 角の分割数。角の中の格子は角度が等間隔になるように置く
  function roundedBox(w, h, d, r, k = 3) {
    const half = [w / 2, h / 2, d / 2];
    r = Math.min(r, half[0], half[1], half[2]);
    const line = (hf) => {
      const out = [];
      for (let j = k; j >= 0; j--) out.push(-(hf - r) - r * Math.tan((Math.PI / 4) * (j / k)));
      for (let j = 0; j <= k; j++) out.push(hf - r + r * Math.tan((Math.PI / 4) * (j / k)));
      return out;
    };
    const L = [line(half[0]), line(half[1]), line(half[2])];
    const pos = [], nor = [], uv = [], idx = [];
    const n = 2 * k + 2;
    let count = 0;
    // 6 面：(固定軸 a, 符号 s, u 軸, v 軸)
    const faces = [[0, 1, 2, 1], [0, -1, 2, 1], [1, 1, 0, 2], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 0, 1]];
    for (const [a, s, ua, va] of faces) {
      const base = count;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const p = [0, 0, 0];
        p[a] = s * half[a]; p[ua] = L[ua][i]; p[va] = L[va][j];
        const c = [0, 0, 0];
        for (let q = 0; q < 3; q++) c[q] = Math.max(-(half[q] - r), Math.min(half[q] - r, p[q]));
        let nx = p[0] - c[0], ny = p[1] - c[1], nz = p[2] - c[2];
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) { nx = ny = nz = 0; if (a === 0) nx = s; else if (a === 1) ny = s; else nz = s; } else { nx /= len; ny /= len; nz /= len; }
        pos.push(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r);
        nor.push(nx, ny, nz);
        uv.push(i / (n - 1), j / (n - 1));
        count++;
      }
      // 面の向き：u × v が外向きかどうかで三角形の順を決める
      const eu = [0, 0, 0], ev = [0, 0, 0];
      eu[ua] = 1; ev[va] = 1;
      const cr = [eu[1] * ev[2] - eu[2] * ev[1], eu[2] * ev[0] - eu[0] * ev[2], eu[0] * ev[1] - eu[1] * ev[0]];
      const outward = cr[a] * s > 0;
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const p0 = base + j * n + i, p1 = p0 + 1, p2 = p0 + n + 1, p3 = p0 + n;
        if (outward) idx.push(p0, p1, p2, p0, p2, p3); else idx.push(p0, p2, p1, p0, p3, p2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // ---- 平歯車の輪郭（極座標 [角, 半径] の列、反時計回り）。歯 0 の中心が角 0
  function gearOutline(z, m) {
    const r = (m * z) / 2, rf = r - 1.25 * m, ra = r + m, tau = TAU / z;
    const wf = 0.33 * tau, wa = 0.15 * tau;
    const out = [];
    for (let k = 0; k < z; k++) {
      const c = k * tau;
      out.push([c - wf, rf], [c - wa, ra], [c + wa, ra], [c + wf, rf]);
    }
    return out;
  }

  // ---- ラチェット車の輪郭：半径 R(α) = radiusFn(α) を歯ごとに刻む（s = 前進の向き）
  function ratchetOutline(N, alphaRef, s, radiusFn, rRoot, rTip, samples = 3) {
    const pitch = TAU / N;
    const out = [];
    // 歯の段差（frac = 0）は α = alphaRef − s·k·pitch。α の増える順に並べる
    for (let k = 0; k < N; k++) {
      const a0 = alphaRef + k * pitch; // 段差の位置
      // 段差の直後（α が増える側）：s > 0 なら frac は 1 から下がる（歯先 → 斜面を下る）。s < 0 なら 0 から上がる
      const hi = s > 0;
      out.push([a0, hi ? rTip : rRoot]);
      for (let j = 1; j < samples; j++) out.push([a0 + (pitch * j) / samples, radiusFn(a0 + (pitch * j) / samples)]);
      out.push([a0 + pitch, hi ? rRoot : rTip]);
    }
    return out;
  }

  // ---- 極座標の輪郭を z0〜z1 に押し出す。外周は面ごとに平ら、内側は半径 rIn の穴（0 なら中まで詰める）
  function polarPrism(b, outline, rIn, z0, z1, uvS = 1) {
    const n = outline.length;
    const P = outline.map(([a, r]) => [r * Math.cos(a), r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    // 外周
    let arc = 0;
    for (let i = 0; i < n; i++) {
      const A = P[i], B = P[(i + 1) % n];
      const ex = B[0] - A[0], ey = B[1] - A[1];
      const len = Math.hypot(ex, ey);
      if (len < 1e-9) continue;
      const nx = ey / len, ny = -ex / len;
      const u0 = arc * uvS, u1 = (arc + len) * uvS;
      arc += len;
      const i0 = b.vert(A[0], A[1], z0, nx, ny, 0, u0, z0 * uvS), i1 = b.vert(B[0], B[1], z0, nx, ny, 0, u1, z0 * uvS);
      const i2 = b.vert(B[0], B[1], z1, nx, ny, 0, u1, z1 * uvS), i3 = b.vert(A[0], A[1], z1, nx, ny, 0, u0, z1 * uvS);
      b.tri(i0, i1, i2); b.tri(i0, i2, i3);
    }
    // 両面のふた（輪郭と内円の間の帯）
    for (const [zz, nz] of [[z1, 1], [z0, -1]]) {
      const outer = [], inner = [];
      for (let i = 0; i < n; i++) {
        outer.push(b.vert(P[i][0], P[i][1], zz, 0, 0, nz, P[i][0] * uvS, P[i][1] * uvS));
        inner.push(b.vert(rIn * P[i][2], rIn * P[i][3], zz, 0, 0, nz, rIn * P[i][2] * uvS, rIn * P[i][3] * uvS));
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const same = Math.abs(outline[i][0] - outline[j][0] - (j === 0 ? TAU : 0)) < 1e-9; // 同じ角（歯の段差）は面積 0
        if (same) continue;
        if (nz > 0) { b.tri(inner[i], outer[i], outer[j]); if (rIn > 0) b.tri(inner[i], outer[j], inner[j]); }
        else { b.tri(inner[i], outer[j], outer[i]); if (rIn > 0) b.tri(inner[i], inner[j], outer[j]); }
      }
    }
    // 内周
    if (rIn > 0) {
      const lo = [], hi = [];
      for (let i = 0; i < n; i++) {
        lo.push(b.vert(rIn * P[i][2], rIn * P[i][3], z0, -P[i][2], -P[i][3], 0, outline[i][0] * rIn * uvS, z0 * uvS));
        hi.push(b.vert(rIn * P[i][2], rIn * P[i][3], z1, -P[i][2], -P[i][3], 0, outline[i][0] * rIn * uvS, z1 * uvS));
      }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; b.tri(lo[i], hi[j], lo[j]); b.tri(lo[i], hi[i], hi[j]); }
    }
  }

  // ---- 平歯車（輪＋スポーク＋ボス）。軸は Z、中心 z = 0、歯 0 が +X
  function spurGear(b, { z, m, face, spokes = 0, hubR = 0.05, hubLen = null, boreR = 0.02, uvS = 1.6 }) {
    const outline = gearOutline(z, m);
    const rf = (m * z) / 2 - 1.25 * m;
    if (spokes > 0) {
      const rimIn = rf - 1.6 * m;
      polarPrism(b, outline, rimIn, -face / 2, face / 2, uvS);
      for (let i = 0; i < spokes; i++) {
        const a = (i + 0.5) * (TAU / spokes);
        const len = rimIn - hubR + 0.02;
        b.box(len, 0.2 * rimIn, face * 0.55, M(Math.cos(a) * (hubR + len / 2 - 0.01), Math.sin(a) * (hubR + len / 2 - 0.01), 0, 0, 0, a), { uv: { world: uvS } });
      }
      b.cyl(hubR, hubR, hubLen || face * 1.25, 20, M(0, 0, 0, Math.PI / 2, 0, 0), { uv: { world: uvS } });
    } else {
      polarPrism(b, outline, boreR, -face / 2, face / 2, uvS);
    }
  }

  // ---- かさ歯車。軸は Z、ピッチ円すいの頂点が原点、体は −Z 側、歯は頂点（+Z）を向く。歯 0 が +X
  function bevelGear(b, { z, r, cone = Math.PI / 4, face, backThick = 0.03, hubR = 0.05, hubLen = 0.05, boreR = 0.03, uvS = 1.6 }) {
    const m = (2 * r) / z;
    const add = m, ded = 1.25 * m;
    const tau = TAU / z, wf = 0.33 * tau, wa = 0.15 * tau;
    const cd = Math.cos(cone), sd = Math.sin(cone);
    const A = r / sd, k = (A - face) / A, zL = -r / Math.tan(cone);
    const prof = [];
    for (let i = 0; i < z; i++) { const c = i * tau; prof.push([c - wf, -ded], [c - wa, add], [c + wa, add], [c + wf, -ded]); }
    const n = prof.length;
    const PL = prof.map(([a, h]) => { const rho = r + h * cd; return [rho * Math.cos(a), rho * Math.sin(a), zL + h * sd]; });
    const PS = PL.map((p) => [p[0] * k, p[1] * k, p[2] * k]);
    const rootR = r - ded * cd, zRoot = zL - ded * sd;
    const zBack = zRoot - backThick;
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0.4];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = (prof[i][0] + prof[j][0] + (j === 0 ? TAU : 0)) / 2, ca = Math.cos(a), sa = Math.sin(a);
      // 歯の面（大端 → 小端）
      b.quad(PL[i], PL[j], PS[j], PS[i], mid(PL[i], PL[j]));
      // 大端の面（輪郭 → 背中の輪）
      const bi = [rootR * 0.98 * Math.cos(prof[i][0]), rootR * 0.98 * Math.sin(prof[i][0]), zBack];
      const bj = [rootR * 0.98 * Math.cos(prof[j][0]), rootR * 0.98 * Math.sin(prof[j][0]), zBack];
      b.quad(PL[i], PL[j], bj, bi, [ca, sa, -0.6]);
      // 背中の円板（背中の輪 → ボス）
      const hi = [hubR * Math.cos(prof[i][0]), hubR * Math.sin(prof[i][0]), zBack], hj = [hubR * Math.cos(prof[j][0]), hubR * Math.sin(prof[j][0]), zBack];
      b.quad(bi, bj, hj, hi, [0, 0, -1]);
      // 小端の面（輪郭 → 穴）
      const zs = zRoot * k;
      const si = [boreR * Math.cos(prof[i][0]), boreR * Math.sin(prof[i][0]), zs], sj = [boreR * Math.cos(prof[j][0]), boreR * Math.sin(prof[j][0]), zs];
      b.quad(PS[i], PS[j], sj, si, [0, 0, 1]);
    }
    // ボス
    b.cyl(hubR, hubR, hubLen, 16, M(0, 0, zBack - hubLen / 2, Math.PI / 2, 0, 0), { uv: { world: uvS } });
    return { zBack, zRoot, zHub: zBack - hubLen };
  }

  // ---- 台形ねじ。軸は Y。hand = +1 右ねじ。y0〜y1 の間にねじ山。1周 seg 分割
  function thread(b, { rOuter, rRoot, lead, y0, y1, seg, crest, root, hand, uPerTurn = 1 }) {
    const turns = Math.max((y1 - y0) / lead - 1, 1);
    const steps = Math.ceil(turns * seg);
    const fl = (1 - crest - root) / 2;
    // 断面（1 リードぶん）：[y のずれ, 半径]
    const prof = [[0, rRoot], [root * lead, rRoot], [(root + fl) * lead, rOuter], [(root + fl + crest) * lead, rOuter], [lead, rRoot]];
    const kk = lead / TAU;
    for (let f = 0; f < 4; f++) {
      const [ya, ra] = prof[f], [yb, rb] = prof[f + 1];
      const dr = rb - ra, dy = yb - ya;
      const base = b.count;
      for (let j = 0; j <= steps; j++) {
        const th = (j / seg) * TAU, ang = hand * th;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const y = y0 + kk * th;
        for (let e = 0; e < 2; e++) {
          const r = e ? rb : ra, yo = e ? yb : ya;
          // 掃引方向の接線 Tθ と断面方向 Tp の外積が法線
          _a.set(-r * sa * hand, kk, -r * ca * hand);
          _d.set(dr * ca, dy, -dr * sa);
          _n.crossVectors(_d, _a);
          if (_n.x * ca - _n.z * sa < 0) _n.negate();
          _n.normalize();
          b.vert(r * ca, y + yo, -r * sa, _n.x, _n.y, _n.z, (th / TAU) * uPerTurn, (f + e) * 0.25);
        }
      }
      // 三角形の向き：最初の四角形の幾何法線と頂点法線を比べて決める
      const p = b.pos, i0 = base * 3, i1 = (base + 1) * 3, i2 = (base + 2) * 3;
      _a.set(p[i1] - p[i0], p[i1 + 1] - p[i0 + 1], p[i1 + 2] - p[i0 + 2]);
      _d.set(p[i2] - p[i0], p[i2 + 1] - p[i0 + 1], p[i2 + 2] - p[i0 + 2]);
      _n.crossVectors(_a, _d);
      const ccw = _n.x * b.nor[i0] + _n.y * b.nor[i0 + 1] + _n.z * b.nor[i0 + 2] > 0;
      for (let j = 0; j < steps; j++) {
        const q0 = base + j * 2, q1 = q0 + 1, q2 = q0 + 2, q3 = q0 + 3;
        if (ccw) { b.tri(q0, q1, q2); b.tri(q1, q3, q2); } else { b.tri(q0, q2, q1); b.tri(q1, q2, q3); }
      }
    }
    return { steps };
  }

  // ---- コイルばね。軸は Y、y = 0〜1、巻き半径 R、線の半径 r（y 方向に拡大して使う）
  function spring(b, { R, r, turns, seg = 12, radial = 5 }) {
    const steps = Math.ceil(turns * seg);
    const base = b.count;
    for (let j = 0; j <= steps; j++) {
      const t = (j / seg) * TAU, ct = Math.cos(t), st = Math.sin(t), y = j / steps;
      for (let i = 0; i < radial; i++) {
        const s = (i / radial) * TAU, cs = Math.cos(s), ss = Math.sin(s);
        b.vert((R + r * cs) * ct, y + r * ss * 0.6, (R + r * cs) * st, cs * ct, ss, cs * st);
      }
    }
    for (let j = 0; j < steps; j++) for (let i = 0; i < radial; i++) {
      const a = base + j * radial + i, c = base + j * radial + ((i + 1) % radial), d = a + radial, e = c + radial;
      b.tri(a, d, c); b.tri(c, d, e);
    }
  }

  // ---- 2D の形を押し出す（星・ハート・爪・レバーの腕）。points は [x, y] の列（反時計回り）
  function extrude(points, depth, bevel = 0, bevelSeg = 2, curveSeg = 6) {
    const sh = new THREE.Shape();
    points.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: curveSeg, steps: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  // 2 点を結ぶ棒（XY 面内、厚み方向 Z）。両端は丸い座
  function bar(b, p1, p2, width, thick, zc, opt, boss = true) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy);
    if (len > 1e-6) b.box(len, width, thick, M((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, zc, 0, 0, Math.atan2(dy, dx)), opt);
    if (boss) for (const p of [p1, p2]) b.cyl(width * 0.62, width * 0.62, thick * 1.2, 16, M(p[0], p[1], zc, Math.PI / 2, 0, 0), opt);
  }

  return { M, Builder, roundedBox, gearOutline, ratchetOutline, polarPrism, spurGear, bevelGear, thread, spring, extrude, bar };
}
