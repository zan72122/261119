// パラメータ → ジオメトリの生成関数。すべて「寸法を受け取って形を返す」関数で、決め打ちの形は無い。
// 静的な部品は頂点色を付けて mergeGeometries で1つにまとめる（draw call を減らす）。
import { TAU, clamp } from './mech.js';

export function makeGeom(THREE, addons, texAvgHex) {
  const { mergeGeometries, toCreasedNormals, RoundedBoxGeometry } = addons;
  const avg = new THREE.Color(texAvgHex); // 写真テクスチャの平均色（リニア）
  const _c = new THREE.Color();
  const KEEP = ['position', 'normal', 'uv', 'color'];

  // 頂点色を付ける。hex が null なら写真テクスチャの色そのまま、色を指定したらテクスチャの色味を打ち消して掛ける
  function paint(geo, hex) {
    let g = geo;
    if (g.index) { g = geo.toNonIndexed(); geo.dispose(); }
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    g.clearGroups();
    let r = 1, gg = 1, b = 1;
    if (hex) {
      _c.set(hex);
      r = _c.r / Math.max(avg.r, 0.05); gg = _c.g / Math.max(avg.g, 0.05); b = _c.b / Math.max(avg.b, 0.05);
    }
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  // 頂点色なしで結合できる形にそろえる（透明な部品用）
  function plain(geo) {
    let g = geo;
    if (g.index) { g = geo.toNonIndexed(); geo.dispose(); }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.clearGroups();
    return g;
  }
  // 2D の点（u=−z, v=y）の輪郭を X 方向に押し出す（ノズルの横断面用）。x = 0..total
  function sideExtrude(ptsZY, total, bevel, holeZY) {
    const s = polyShape(ptsZY.map((p) => [-p[0], p[1]]));
    if (holeZY) { const h = new THREE.Path(); holeZY.forEach((p, i) => (i ? h.lineTo(-p[0], p[1]) : h.moveTo(-p[0], p[1]))); h.closePath(); s.holes.push(h); }
    const g = extrude(s, total, bevel, 6);
    g.rotateY(Math.PI / 2);
    return g;
  }
  // 歯車などの「XY の形を Z に押し出した物」を、歯0が +Y、軸が +X になるよう向ける
  const _basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
  const axisXfromZ = (g) => { g.applyMatrix4(_basis); return g; };
  // Y 軸の形を、向き dir（単位ベクトル）へ向けて pos に置く
  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);
  function aim(g, dir, pos) {
    _q.setFromUnitVectors(_up, dir);
    _m.compose(pos, _q, _one);
    g.applyMatrix4(_m);
    return g;
  }
  // インスタンス色用（テクスチャ打ち消し済み）
  function tint(hex, out) {
    _c.set(hex);
    return out.setRGB(_c.r / Math.max(avg.r, 0.05), _c.g / Math.max(avg.g, 0.05), _c.b / Math.max(avg.b, 0.05));
  }

  function merge(list) {
    const src = list.filter(Boolean);
    const m = mergeGeometries(src, false);
    src.forEach((g) => g.dispose());
    if (!m) throw new Error('hero: mergeGeometries failed');
    m.clearGroups();
    return m;
  }

  const at = (g, x, y, z) => { g.translate(x || 0, y || 0, z || 0); return g; };
  const axisX = (g) => { g.rotateZ(-Math.PI / 2); return g; }; // Y 軸の形を X 軸へ
  const axisZ = (g) => { g.rotateX(Math.PI / 2); return g; }; // Y 軸の形を Z 軸へ

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const rbox = (w, h, d, r, seg) => new RoundedBoxGeometry(w, h, d, seg || 3, Math.min(r, w / 2, h / 2, d / 2));
  const cyl = (r, h, seg, rTop) => new THREE.CylinderGeometry(rTop === undefined ? r : rTop, r, h, seg || 20);
  const sphere = (r, w, h) => new THREE.SphereGeometry(r, w || 14, h || 10);

  // 回転体：profile は [r, y] の並び（外側を下→上に進むと外向きの面）。角は折り目として残す
  function revolve(profile, seg, crease) {
    const n = profile.length;
    const pos = new Float32Array(seg * n * 3);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
      for (let j = 0; j < n; j++) {
        const k = (i * n + j) * 3;
        pos[k] = profile[j][0] * c; pos[k + 1] = profile[j][1]; pos[k + 2] = profile[j][0] * s;
      }
    }
    const idx = [];
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      for (let j = 0; j < n - 1; j++) {
        if (profile[j][0] < 1e-7 && profile[j + 1][0] < 1e-7) continue;
        const a = i * n + j, b = i * n + j + 1, c2 = i1 * n + j, d = i1 * n + j + 1;
        // 外向き：(i,j),(i,j+1),(i+1,j) は +Y 軸を右ねじに回る向きで反時計回りになるよう並べる
        // 軸の上の点（r=0）では片方の三角形が面積 0 になる。法線が長さ 0（GPU の normalize で NaN）になるので作らない
        if (profile[j][0] >= 1e-7) idx.push(a, b, c2);
        if (profile[j + 1][0] >= 1e-7) idx.push(c2, b, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const out = toCreasedNormals(g, crease === undefined ? 0.7 : crease);
    if (out !== g) g.dispose();
    return out;
  }
  // 輪（内径・外径・高さ）。y は 0..h
  const ring = (rIn, rOut, h, seg) => revolve([[rIn, 0], [rOut, 0], [rOut, h], [rIn, h], [rIn, 0]], seg || 24, 0.5);
  // 円環（断面が丸い輪）。軸は Y
  const torus = (R, r, seg, tube) => { const g = new THREE.TorusGeometry(R, r, tube || 6, seg || 20); g.rotateX(Math.PI / 2); return g; };

  // 2D の形 → Z に押し出す（z = 0..total）。bevel があれば角を落とす（側面は輪郭どおり、端面が内側へ寄る）
  function extrude(shape, total, bevel, curveSegments, uvScale) {
    const b = bevel || 0;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-4, total - 2 * b), steps: 1, curveSegments: curveSegments || 10,
      bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: b > 0 ? 3 : 0,
    });
    if (b > 0) g.translate(0, 0, b); // z = 0..total
    const uv = g.attributes.uv, s = uvScale || 2.5;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
    return g;
  }
  // 角丸の長方形の輪郭（r は [左下, 右下, 右上, 左上] か数）
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
  function circlePath(x, y, r) { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, false); return p; }
  function polyShape(pts) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return s;
  }
  // 扇形の窓（内径 r0〜外径 r1、角 a0〜a1）
  function sectorPath(r0, r1, a0, a1) {
    const p = new THREE.Path();
    p.moveTo(r0 * Math.cos(a0), r0 * Math.sin(a0));
    p.lineTo(r1 * Math.cos(a0), r1 * Math.sin(a0));
    p.absarc(0, 0, r1, a0, a1, false);
    p.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1));
    p.absarc(0, 0, r0, a1, a0, true);
    return p;
  }

  // 平歯車の輪郭（歯数 z、モジュール m）。歯0は +X。ピッチ半径 m·z/2、歯先 +m、歯底 −1.25m（台形で近似）
  function gearShape(z, m, bore, holes) {
    const rp = (m * z) / 2, ra = rp + m, rf = rp - 1.25 * m, tau = TAU / z;
    const pts = [];
    for (let i = 0; i < z; i++) {
      const a = i * tau;
      for (const [r, da] of [[rf, -0.3], [rp, -0.25], [ra, -0.13], [ra, 0.13], [rp, 0.25], [rf, 0.3]]) pts.push([r * Math.cos(a + da * tau), r * Math.sin(a + da * tau)]);
    }
    const s = polyShape(pts);
    if (bore > 0) s.holes.push(circlePath(0, 0, bore));
    if (holes && holes.count > 0) for (let i = 0; i < holes.count; i++) { const a = (i / holes.count) * TAU + (holes.phase || 0); s.holes.push(circlePath(holes.at * Math.cos(a), holes.at * Math.sin(a), holes.r)); }
    return s;
  }

  // 関数 f(u, v, out) の格子面（nu×nv 区画）。法線は面から計算
  function surface(nu, nv, f) {
    const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2);
    const p = [0, 0, 0];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      f(i / nu, j / nv, p);
      const k = j * (nu + 1) + i;
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv;
    }
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // 折れ線に沿う管（毎フレーム作り直せる）。pts(Float32Array, (nSeg+1)*3) を書いて update() を呼ぶ
  function tube(nSeg, nSides, radius, dynamic) {
    const nRing = nSeg + 1;
    const pos = new Float32Array(nRing * nSides * 3), nor = new Float32Array(nRing * nSides * 3), uv = new Float32Array(nRing * nSides * 2);
    const idx = [];
    for (let i = 0; i < nSeg; i++) for (let k = 0; k < nSides; k++) {
      const a = i * nSides + k, b = i * nSides + ((k + 1) % nSides), c = a + nSides, d = b + nSides;
      idx.push(a, b, c, b, d, c);
    }
    for (let i = 0; i < nRing; i++) for (let k = 0; k < nSides; k++) { uv[(i * nSides + k) * 2] = k / nSides; uv[(i * nSides + k) * 2 + 1] = i / nSeg * 8; }
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
    if (dynamic) { pa.setUsage(THREE.DynamicDrawUsage); na.setUsage(THREE.DynamicDrawUsage); }
    g.setAttribute('position', pa);
    g.setAttribute('normal', na);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const pts = new Float32Array(nRing * 3);
    let nx = 0, ny = 1, nz = 0;
    function update(r) {
      const rad = r || radius;
      // 進行方向に直交する枠を、ねじれないよう前の節から引き継ぐ
      nx = 0; ny = 1; nz = 0;
      for (let i = 0; i < nRing; i++) {
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(nRing - 1, i + 1) * 3;
        let tx = pts[i1] - pts[i0], ty = pts[i1 + 1] - pts[i0 + 1], tz = pts[i1 + 2] - pts[i0 + 2];
        let tl = Math.hypot(tx, ty, tz);
        if (!(tl > 1e-9)) { tx = 1; ty = 0; tz = 0; tl = 1; }
        tx /= tl; ty /= tl; tz /= tl;
        let d = nx * tx + ny * ty + nz * tz;
        nx -= d * tx; ny -= d * ty; nz -= d * tz;
        let nl = Math.hypot(nx, ny, nz);
        if (!(nl > 1e-5)) {
          // 接線と平行になった：別の軸から作り直す
          if (Math.abs(ty) < 0.9) { nx = 0; ny = 1; nz = 0; } else { nx = 1; ny = 0; nz = 0; }
          d = nx * tx + ny * ty + nz * tz;
          nx -= d * tx; ny -= d * ty; nz -= d * tz;
          nl = Math.max(Math.hypot(nx, ny, nz), 1e-9);
        }
        nx /= nl; ny /= nl; nz /= nl;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        for (let k = 0; k < nSides; k++) {
          const a = (k / nSides) * TAU, c = Math.cos(a), s = Math.sin(a);
          const ox = c * nx + s * bx, oy = c * ny + s * by, oz = c * nz + s * bz;
          const q = (i * nSides + k) * 3;
          pos[q] = pts[i * 3] + ox * rad; pos[q + 1] = pts[i * 3 + 1] + oy * rad; pos[q + 2] = pts[i * 3 + 2] + oz * rad;
          nor[q] = ox; nor[q + 1] = oy; nor[q + 2] = oz;
        }
      }
      pa.needsUpdate = true;
      na.needsUpdate = true;
    }
    return { geometry: g, pts, update, nSeg };
  }
  // 点の並び（[[x,y,z],…]）に沿う静的な管
  function tubeAlong(points, nSides, radius) {
    const t = tube(points.length - 1, nSides, radius, false);
    points.forEach((p, i) => { t.pts[i * 3] = p[0]; t.pts[i * 3 + 1] = p[1]; t.pts[i * 3 + 2] = p[2]; });
    t.update();
    return t.geometry;
  }
  // 折れ線の角を半径 r の円弧で丸めた点の並び
  function roundedPath(corners, r, perArc) {
    const out = [corners[0].slice()];
    const V = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = (v) => Math.hypot(v[0], v[1], v[2]);
    for (let i = 1; i < corners.length - 1; i++) {
      const a = corners[i - 1], b = corners[i], c = corners[i + 1];
      const u = V(b, a), w = V(b, c);
      const lu = L(u), lw = L(w);
      const k = clamp(r, 0, Math.min(lu, lw) * 0.49);
      const p0 = [b[0] + (u[0] / lu) * k, b[1] + (u[1] / lu) * k, b[2] + (u[2] / lu) * k];
      const p1 = [b[0] + (w[0] / lw) * k, b[1] + (w[1] / lw) * k, b[2] + (w[2] / lw) * k];
      for (let j = 0; j <= perArc; j++) {
        const t = j / perArc, s = 1 - t;
        out.push([s * s * p0[0] + 2 * s * t * b[0] + t * t * p1[0], s * s * p0[1] + 2 * s * t * b[1] + t * t * p1[1], s * s * p0[2] + 2 * s * t * b[2] + t * t * p1[2]]);
      }
    }
    out.push(corners[corners.length - 1].slice());
    return out;
  }

  // ぜんまい（帯の螺旋）。update(total, phase) で r(φ)=ri+(ro−ri)·φ/total を描き直す。Z が帯の幅方向
  function springRibbon(sp) {
    const N = sp.segments, rings = N + 1;
    // 節ごとに 8 頂点（外・内・前・後ろの面がそれぞれ法線を持つ）
    const pos = new Float32Array(rings * 8 * 3), nor = new Float32Array(rings * 8 * 3);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 8, b = a + 8;
      // 外面(0,1) 内面(2,3) 前面(4,5) 後面(6,7)
      idx.push(a, b, a + 1, a + 1, b, b + 1);
      idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      idx.push(a + 4, a + 5, b + 4, a + 5, b + 5, b + 4);
      idx.push(a + 6, b + 6, a + 7, a + 7, b + 6, b + 7);
    }
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
    pa.setUsage(THREE.DynamicDrawUsage); na.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa);
    g.setAttribute('normal', na);
    g.setIndex(idx);
    const hw = sp.width / 2, ht = sp.thick / 2;
    function update(total, phase) {
      for (let i = 0; i < rings; i++) {
        const phi = (total * i) / N;
        const r = sp.ri + ((sp.ro - sp.ri) * i) / N;
        const c = Math.cos(phase + phi), s = Math.sin(phase + phi);
        const k = i * 24;
        const set = (j, rr, z, nx, ny, nz) => { const q = k + j * 3; pos[q] = rr * c; pos[q + 1] = rr * s; pos[q + 2] = z; nor[q] = nx; nor[q + 1] = ny; nor[q + 2] = nz; };
        set(0, r + ht, -hw, c, s, 0); set(1, r + ht, hw, c, s, 0);
        set(2, r - ht, -hw, -c, -s, 0); set(3, r - ht, hw, -c, -s, 0);
        set(4, r - ht, hw, 0, 0, 1); set(5, r + ht, hw, 0, 0, 1);
        set(6, r - ht, -hw, 0, 0, -1); set(7, r + ht, -hw, 0, 0, -1);
      }
      pa.needsUpdate = true;
      na.needsUpdate = true;
    }
    return { geometry: g, update };
  }

  return { plain, sideExtrude, axisXfromZ, aim, paint, tint, merge, at, axisX, axisZ, box, rbox, cyl, sphere, revolve, ring, torus, extrude, roundRect, circlePath, polyShape, sectorPath, gearShape, surface, tube, tubeAlong, roundedPath, springRibbon };
}
