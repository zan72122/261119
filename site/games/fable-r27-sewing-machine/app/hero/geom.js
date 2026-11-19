// 形を作る道具。すべてパラメータから生成し、同じ材質のものは 1 つの形に結合する。
// 色は頂点色（1 つの材質で塗り分ける）。歯車は歯ごとの Mesh を作らず、歯形の輪を押し出した 1 つの形。

export function makeKit(THREE, addons, detail = 1) {
  const seg = (n, min = 6) => Math.max(min, Math.round(n * detail));
  const tmpC = new THREE.Color();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /** 頂点色を一色で塗る（すでに color があれば何もしない）。 */
  function paint(g, hex) {
    if (g.attributes.color) return g;
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    tmpC.set(hex);
    for (let i = 0; i < n; i++) { a[i * 3] = tmpC.r; a[i * 3 + 1] = tmpC.g; a[i * 3 + 2] = tmpC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }

  /** 箱貼りの UV（金属のヘアラインを貼るため）。法線のいちばん大きい軸に垂直な 2 軸を使う。 */
  function boxUV(g, scale = 9) {
    const p = g.attributes.position, nrm = g.attributes.normal, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      let u, v;
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  /** いくつもの形を 1 つに結合（色つき）。uv:'box' なら箱貼り、'keep' ならそのまま、なければ捨てる。 */
  function merge(list, { uv = null, weld = true } = {}) {
    const parts = list.map((g) => {
      let n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && !(k === 'uv' && uv === 'keep')) n.deleteAttribute(k);
      if (!n.attributes.color) paint(n, 0xffffff);
      if (uv === 'keep' && !n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
      n.morphAttributes = {};
      return n;
    });
    let m = addons.mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!m) throw new Error('hero: mergeGeometries failed');
    if (uv === 'box') boxUV(m);
    if (weld) { const w = addons.mergeVertices(m, 1e-5); if (w !== m) m.dispose(); m = w; }
    m.computeBoundingSphere();
    return m;
  }

  // ---------- 基本の形（置く場所まで含めて返す）----------
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const boxAt = (x0, x1, y0, y1, z0, z1) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const rbox = (x0, x1, y0, y1, z0, z1, r = 0.002) => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, rr = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
    return new addons.RoundedBoxGeometry(w, h, d, 2, rr).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  };
  /** 軸 X / Y / Z の円柱（r1 を渡すと円すい台）。 */
  const cylX = (r, x0, x1, y = 0, z = 0, n = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, Math.abs(x1 - x0), seg(n)).rotateZ(-Math.PI / 2).translate((x0 + x1) / 2, y, z);
  const cylY = (r, y0, y1, x = 0, z = 0, n = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, Math.abs(y1 - y0), seg(n)).translate(x, (y0 + y1) / 2, z);
  const cylZ = (r, z0, z1, x = 0, y = 0, n = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, Math.abs(z1 - z0), seg(n)).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
  const sphere = (r, x, y, z, n = 14) => new THREE.SphereGeometry(r, seg(n), seg(n * 0.7, 5)).translate(x, y, z);
  /** 輪（糸案内など）。axis: 'x'|'y'|'z' が輪の軸。 */
  const torus = (R, r, x, y, z, axis = 'z', n = 14) => {
    const g = new THREE.TorusGeometry(R, r, 6, seg(n, 8));
    if (axis === 'y') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateY(Math.PI / 2);
    return g.translate(x, y, z);
  };
  /** 回転体。profile は [半径, 軸方向の位置] の列。axis: 'x'|'y'|'z'。 */
  const lathe = (profile, axis = 'y', n = 32) => {
    const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0), h)), seg(n, 10));
    if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  };

  // ---------- 角を丸めた多角形と押し出し ----------
  /** 多角形（[x,y] の列）の角を丸めて Shape/Path に描く。radius は数か、頂点ごとの配列。 */
  function tracePoly(path, pts, radius) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1e-9, l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1e-9;
      const r = Math.min(Array.isArray(radius) ? radius[i] : radius, l0 * 0.45, l2 * 0.45);
      const ax = p1[0] + ((p0[0] - p1[0]) / l0) * r, ay = p1[1] + ((p0[1] - p1[1]) / l0) * r;
      const bx = p1[0] + ((p2[0] - p1[0]) / l2) * r, by = p1[1] + ((p2[1] - p1[1]) / l2) * r;
      if (i === 0) path.moveTo(ax, ay); else path.lineTo(ax, ay);
      if (r > 1e-6) path.quadraticCurveTo(p1[0], p1[1], bx, by);
    }
    path.closePath();
    return path;
  }
  const polyShape = (pts, radius = 0, holes = []) => {
    // 外形は反時計回りにそろえる（そうすると ExtrudeGeometry が穴の向きも自動で直す）
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) { pts = pts.slice().reverse(); if (Array.isArray(radius)) radius = radius.slice().reverse(); }
    const s = tracePoly(new THREE.Shape(), pts, radius);
    for (const h of holes) s.holes.push(tracePoly(new THREE.Path(), h.pts, h.r || 0));
    return s;
  };
  const rectPts = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  /**
   * Shape を厚み方向に押し出す。面取り（bevel）つきでも、厚みは t0→t1 にぴったり収まり、外形は広がらない。
   * plane: 'xy'（Z へ押し出す）| 'xz'（Shape の y = −z、Y へ押し出す）| 'zy'（Shape の x = −z、X へ押し出す）
   */
  function extrude(shape, t0, t1, { bevel = 0, plane = 'xy', curve = 5 } = {}) {
    const b = Math.min(bevel, (t1 - t0) * 0.45);
    const g = new THREE.ExtrudeGeometry(shape, { depth: t1 - t0 - 2 * b, steps: 1, curveSegments: seg(curve, 3), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2 });
    g.translate(0, 0, t0 + b);
    if (plane === 'xz') g.rotateX(-Math.PI / 2); else if (plane === 'zy') g.rotateY(Math.PI / 2);
    return g;
  }

  // ---------- 面ごとに平らな形を組む小さな道具（歯車・カム・釜）----------
  function flat() {
    const pos = [], nor = [], col = [];
    const a = V(), b = V(), n = V();
    function tri(p, q, r, hint, hex) {
      a.subVectors(q, p); b.subVectors(r, p); n.crossVectors(a, b);
      const len = n.length();
      if (!(len > 1e-14)) return;                 // つぶれた面は捨てる（法線が NaN にならない）
      n.multiplyScalar(1 / len);
      let v = [p, q, r];
      if (hint && n.dot(hint) < 0) { v = [p, r, q]; n.negate(); }
      tmpC.set(hex === undefined ? 0xffffff : hex);
      for (const w of v) { pos.push(w.x, w.y, w.z); nor.push(n.x, n.y, n.z); col.push(tmpC.r, tmpC.g, tmpC.b); }
    }
    return {
      tri,
      quad(p, q, r, s, hint, hex) { tri(p, q, r, hint, hex); tri(p, r, s, hint, hex); },
      done() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        return g;
      },
    };
  }

  /**
   * 軸 X の柱：外形 profile（(y,z) の輪、+Y から +Z へ回る向き）を x0→x1 に押し出す。
   * 中心穴 rIn（0 なら中心まで埋める）。colors(i, part) で面ごとの色（part: 'wall'|'cap'）。
   */
  function prismX(profile, rIn, x0, x1, colors = () => 0xffffff) {
    const f = flat(), n = profile.length, hx0 = V(-1, 0, 0), hx1 = V(1, 0, 0), h = V();
    for (let i = 0; i < n; i++) {
      const [y0, z0] = profile[i], [y1, z1] = profile[(i + 1) % n];
      h.set(0, y0 + y1, z0 + z1);
      f.quad(V(x0, y0, z0), V(x0, y1, z1), V(x1, y1, z1), V(x1, y0, z0), h, colors(i, 'wall'));
      const l0 = Math.hypot(y0, z0) || 1e-9, l1 = Math.hypot(y1, z1) || 1e-9;
      const iy0 = (y0 / l0) * rIn, iz0 = (z0 / l0) * rIn, iy1 = (y1 / l1) * rIn, iz1 = (z1 / l1) * rIn;
      for (const [x, hint] of [[x0, hx0], [x1, hx1]]) {
        if (rIn > 0) f.quad(V(x, iy0, iz0), V(x, y0, z0), V(x, y1, z1), V(x, iy1, iz1), hint, colors(i, 'cap'));
        else f.tri(V(x, 0, 0), V(x, y0, z0), V(x, y1, z1), hint, colors(i, 'cap'));
      }
    }
    return f.done();
  }

  const circleProfile = (r, n, cy = 0, cz = 0) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]); } return p; };

  /** 平歯車（軸 X）。歯 0 の中心は +Y。歯数 N、モジュール m。色は 4 つの扇で塗り分け（回るのが見える）。 */
  function spurGear({ N, m, x0, x1, bore = 0, c1 = 0xffffff, c2 = 0xffffff }) {
    const R = (N * m) / 2, ra = R + m, rr = R - 1.25 * m, tau = (Math.PI * 2) / N, prof = [];
    for (let i = 0; i < N; i++) for (const [da, r] of [[-0.30, rr], [-0.13, ra], [0.13, ra], [0.30, rr]]) { const a = (i + da) * tau; prof.push([r * Math.cos(a), r * Math.sin(a)]); }
    const q = prof.length / 4;
    return prismX(prof, bore, x0, x1, (i, part) => (part === 'cap' && Math.floor(i / q) % 2 ? c2 : c1));
  }

  /**
   * かさ歯車（軸 X、ピッチ円すいの頂点が原点、円すい半角 45° = 軸角 90° の 1:1）。dir=+1 なら本体は +X 側。
   * 歯 0 の中心は +Y。歯の寸法は頂点へ向かって比例して小さくなる（円すい歯車の形）。
   */
  function bevelGear({ N, m, face, dir = 1, hubR = 0.008, c1 = 0xffffff, c2 = 0xffffff }) {
    const delta = Math.PI / 4, R = (N * m) / 2, A = R / Math.sin(delta), k = (A - face) / A, tau = (Math.PI * 2) / N;
    const f = flat(), ring = [], cd = Math.cos(delta), sd = Math.sin(delta);
    for (let i = 0; i < N; i++) for (const [da, h] of [[-0.30, -1.25 * m], [-0.13, m], [0.13, m], [0.30, -1.25 * m]]) {
      const a = (i + da) * tau, ca = Math.cos(a), sa = Math.sin(a);
      // ピッチ円すい上の点 ＋ 円すいの外向き法線 × 歯の高さ
      ring.push({ a, L: V(dir * (A * cd - h * sd), A * sd * ca + h * cd * ca, A * sd * sa + h * cd * sa) });
    }
    const n = ring.length, xBack = dir * (A * cd + 0.004), xFront = dir * ((A - face) * cd - 0.001), q = n / 4;
    const hOut = V(), hBack = V(dir, 0, 0), hFront = V(-dir, 0, 0);
    for (let i = 0; i < n; i++) {
      const p = ring[i], p2 = ring[(i + 1) % n];
      const S1 = p.L.clone().multiplyScalar(k), S2 = p2.L.clone().multiplyScalar(k);
      hOut.set(-dir * sd, cd * Math.cos(p.a), cd * Math.sin(p.a));
      f.quad(p.L, p2.L, S2, S1, hOut, c1);                                        // 歯の面
      const col = Math.floor(i / q) % 2 ? c2 : c1;
      f.quad(p.L, p2.L, V(xBack, hubR * Math.cos(p2.a), hubR * Math.sin(p2.a)), V(xBack, hubR * Math.cos(p.a), hubR * Math.sin(p.a)), hBack, col);   // 背中
      f.tri(S1, S2, V(xFront, 0, 0), hFront, c1);                                 // 小さい側
    }
    const hub = paint(cylX(hubR, xBack, xBack + dir * 0.006, 0, 0, 14), c1);
    const g = merge([f.done(), hub], { weld: false });
    g.userData = { R, A, xBack };
    return g;
  }

  /** 点 a → b の丸棒。 */
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

/**
 * 糸の管：点の数は固定で、毎フレーム position と normal だけ書き換える（作り直さない）。
 * curves = [点の数, ...]。全部で 1 つの形（draw call 1）。
 */
export function makeTube(THREE, counts, radial = 5) {
  const total = counts.reduce((s, c) => s + c, 0);
  const pos = new Float32Array(total * radial * 3), nor = new Float32Array(total * radial * 3), idx = [];
  let base = 0;
  const starts = [];
  for (const c of counts) {
    starts.push(base);
    for (let i = 0; i < c - 1; i++) for (let j = 0; j < radial; j++) {
      const a = base + i * radial + j, b = base + i * radial + ((j + 1) % radial), c2 = a + radial, d = b + radial;
      idx.push(a, c2, b, b, c2, d);
    }
    base += c * radial;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0.05, 0.2, 0.03), 0.4); // 動く範囲を覆う固定の球
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), prevT = new THREE.Vector3(), d = new THREE.Vector3();
  /** which 番目の曲線を、points（Vector3 の配列、counts[which] 個）と半径 r で書く。 */
  function write(which, points, r) {
    const c = counts[which], s = starts[which];
    prevT.set(0, -1, 0); n.set(0, 0, 1);
    for (let i = 0; i < c; i++) {
      const p = points[i], q0 = points[Math.max(0, i - 1)], q1 = points[Math.min(c - 1, i + 1)];
      t.subVectors(q1, q0);
      const len = t.length();
      if (len > 1e-9 && Number.isFinite(len)) t.multiplyScalar(1 / len); else t.copy(prevT);   // 重なった点でも NaN にしない
      // 法線を接線に垂直に保ったまま運ぶ
      n.addScaledVector(t, -n.dot(t));
      let nl = n.length();
      if (nl < 1e-6) { n.set(1, 0, 0).addScaledVector(t, -t.x); nl = n.length(); if (nl < 1e-6) { n.set(0, 0, 1); nl = 1; } }
      n.multiplyScalar(1 / nl);
      b.crossVectors(t, n);
      prevT.copy(t);
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), o = (s + i * radial + j) * 3;
        d.set(n.x * ca + b.x * sa, n.y * ca + b.y * sa, n.z * ca + b.z * sa);
        pos[o] = p.x + d.x * r; pos[o + 1] = p.y + d.y * r; pos[o + 2] = p.z + d.z * r;
        nor[o] = d.x; nor[o + 1] = d.y; nor[o + 2] = d.z;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
  return { geometry: g, write, counts };
}
