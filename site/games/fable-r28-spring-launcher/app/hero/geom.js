// 形を作る道具（three は引数でもらう）。
// ・歯車／セクター／ラック／ラチェットは1つの歯形の式から作る
// ・コイルばねは「らせん × 断面円」を自前生成し、長さが変わっても線の太さは変えない
// ・同じ材質の部品は merge() で1メッシュにまとめる（属性は position / normal / uv / color にそろえる）

export function makeGeom(THREE) {
  const col = new THREE.Color();
  const WHITE_UV = [0.03, 0.03];          // 塗装アトラスの白い所
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  /** 行列（位置＋オイラー角）。 */
  function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(s, s, s),
    );
  }

  /** 結合できる形にそろえる：非インデックス化、行列、頂点色、UV。 */
  function prep(geo, o = {}) {
    let g = geo;
    if (geo.index) { g = geo.toNonIndexed(); geo.dispose(); }
    if (o.m) g.applyMatrix4(o.m);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const uv = g.attributes.uv.array;
    if (o.uv) { for (let i = 0; i < n; i++) { uv[i * 2] = o.uv[0]; uv[i * 2 + 1] = o.uv[1]; } }
    else if (o.flat) { for (let i = 0; i < n; i++) { uv[i * 2] = WHITE_UV[0]; uv[i * 2 + 1] = WHITE_UV[1]; } }
    else if (o.uvMul) {
      const ox = o.uvOff ? o.uvOff[0] : 0, oy = o.uvOff ? o.uvOff[1] : 0;
      for (let i = 0; i < n; i++) { uv[i * 2] = uv[i * 2] * o.uvMul[0] + ox; uv[i * 2 + 1] = uv[i * 2 + 1] * o.uvMul[1] + oy; }
    }
    col.set(o.color === undefined ? 0xffffff : o.color);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  }

  /** prep 済みの形を1つに結合（元は解放する）。 */
  function merge(list) {
    const out = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
      let len = 0;
      for (const g of list) len += g.attributes[name].count * size;
      const arr = new Float32Array(len);
      let o = 0;
      for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].count * size; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    for (const g of list) g.dispose();
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  // ------------------------------------------------------------------ 基本の形
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  /** z 軸向きの円柱（z0 から len） */
  function cylZ(r, len, z0, radial = 16, r2 = r) {
    return new THREE.CylinderGeometry(r2, r, len, radial).rotateX(Math.PI / 2).translate(0, 0, z0 + len / 2);
  }
  /** x 軸向きの円柱（x0 から len） */
  function cylX(r, len, x0, radial = 16, r2 = r) {
    return new THREE.CylinderGeometry(r2, r, len, radial).rotateZ(-Math.PI / 2).translate(x0 + len / 2, 0, 0);
  }
  /** 2点を結ぶ丸棒 */
  function rod(a, b, r, radial = 8) {
    const va = new THREE.Vector3(a[0], a[1], a[2]), vb = new THREE.Vector3(b[0], b[1], b[2]);
    const d = vb.clone().sub(va);
    const len = Math.max(1e-4, d.length());
    const g = new THREE.CylinderGeometry(r, r, len, radial, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / len));
    g.applyMatrix4(new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    return g;
  }
  const pol = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
  function extrude(shape, z0, z1, curveSegments = 12) {
    return new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments }).translate(0, 0, z0);
  }
  /** 輪の一部（扇形の窓）。穴にも外形にも使う。 */
  function arcWindow(r0, r1, a0, a1, n = 6, Ctor = THREE.Path) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(pol(r1, a0 + (a1 - a0) * i / n));
    for (let i = n; i >= 0; i--) pts.push(pol(r0, a0 + (a1 - a0) * i / n));
    return new Ctor(pts);
  }
  function addWindows(shape, n, r0, r1, gap, phase = 0) {
    const da = 2 * Math.PI / n;
    for (let i = 0; i < n; i++) shape.holes.push(arcWindow(r0, r1, phase + i * da + gap / 2, phase + (i + 1) * da - gap / 2));
  }
  function circlePath(r, n = 16) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(pol(r, 2 * Math.PI * i / n));
    return new THREE.Path(pts);
  }

  // ------------------------------------------------------------------ 歯形
  /** 歯1枚の角度の半幅（ピッチ円・歯先・歯底）。圧力角から台形で近似。 */
  function toothAngles(m, z, pressureDeg, add = 1, ded = 1.2) {
    const r = m * z / 2;
    const t = Math.tan(pressureDeg * Math.PI / 180);
    const hp = Math.PI / (2 * z);
    return {
      r, ra: r + add * m, rf: r - ded * m, hp,
      ht: Math.max(hp * 0.25, hp - add * m * t / r),
      hr: Math.min(hp * 1.8, hp + ded * m * t / r),
    };
  }
  /** 歯車の外形の点列。phase = 歯の中心が来る角度の1つ。a0..a1 を渡すとその範囲の歯だけ。 */
  function gearOutline(m, z, pressureDeg, phase = 0, a0 = null, a1 = null) {
    const T = toothAngles(m, z, pressureDeg);
    const pitch = 2 * Math.PI / z;
    const pts = [];
    let i0 = 0, i1 = z - 1;
    if (a0 !== null) {
      i0 = Math.ceil((a0 + T.hr - phase) / pitch - 1e-9);
      i1 = Math.floor((a1 - T.hr - phase) / pitch + 1e-9);
      pts.push(pol(T.rf, a0));
    }
    for (let i = i0; i <= i1; i++) {
      const c = phase + i * pitch;
      pts.push(pol(T.rf, c - T.hr), pol(T.r, c - T.hp), pol(T.ra, c - T.ht), pol(T.ra, c + T.ht), pol(T.r, c + T.hp), pol(T.rf, c + T.hr));
    }
    if (a0 !== null) pts.push(pol(T.rf, a1));
    return { pts, T };
  }
  /** 平歯車（穴・軽め穴つき）。 */
  function gear(m, z, pressureDeg, z0, z1, o = {}) {
    const { pts, T } = gearOutline(m, z, pressureDeg, o.phase || 0);
    const shape = new THREE.Shape(pts);
    if (o.bore) shape.holes.push(circlePath(o.bore));
    if (o.windows) addWindows(shape, o.windows, o.winR0, o.winR1 || T.rf - m * 0.9, o.winGap || 0.35, o.winPhase || 0);
    return extrude(shape, z0, z1);
  }
  /** セクター歯車（a0..a1 の扇。内側は rIn）。 */
  function sectorGear(m, z, pressureDeg, z0, z1, a0, a1, rIn, phase) {
    const { pts, T } = gearOutline(m, z, pressureDeg, phase, a0, a1);
    const n = 8;
    for (let i = 0; i <= n; i++) pts.push(pol(rIn, a1 + (a0 - a1) * i / n));
    const shape = new THREE.Shape(pts);
    const pad = 0.16;
    shape.holes.push(arcWindow(rIn + 0.1, T.rf - 0.09, a0 + pad, a1 - pad, 6));
    return extrude(shape, z0, z1);
  }
  /** ラチェット歯車：のこぎり歯。beta0 = 歯の段（歯底→歯先に跳ぶ所）が来る角度の1つ。 */
  function ratchet(z, rOut, rRoot, z0, z1, beta0, o = {}) {
    const d = 2 * Math.PI / z;
    const pts = [];
    for (let i = 0; i < z; i++) {
      const a = beta0 + i * d;
      pts.push(pol(rRoot, a), pol(rOut, a + RATCHET.rise * d), pol(rOut, a + (RATCHET.rise + RATCHET.land) * d));
    }
    const shape = new THREE.Shape(pts);
    if (o.bore) shape.holes.push(circlePath(o.bore));
    if (o.windows) addWindows(shape, o.windows, o.winR0, o.winR1, o.winGap || 0.3, o.winPhase || 0);
    return extrude(shape, z0, z1);
  }
  /** ラチェットの歯の高さ（0..1）。s = 1歯の中でどれだけ進んだか（0..1）。形と同じ式。 */
  function ratchetProfile(s) {
    const ramp = 1 - RATCHET.rise - RATCHET.land;
    if (s < ramp) return s / ramp;
    if (s < ramp + RATCHET.land) return 1;
    return clamp(1 - (s - ramp - RATCHET.land) / RATCHET.rise, 0, 1);
  }
  const RATCHET = { rise: 0.06, land: 0.14 };

  /**
   * ラック（下面に歯、上面は平ら）。w = 筒に沿った位置（ラックの基準からの距離）、v = 高さ。
   * 歯のピッチ線は vPitch（下にあるピニオンと噛む）。phase = 歯の中心が来る w の1つ。
   */
  function rack(m, pressureDeg, w0, w1, vPitch, vTop, z0, z1, phase) {
    const p = Math.PI * m;
    const t = Math.tan(pressureDeg * Math.PI / 180);
    const ht = p / 4 - m * t, hr = Math.min(p / 2 * 0.9, p / 4 + 1.2 * m * t);
    const root = vPitch + 1.2 * m, tip = vPitch - m;
    const pts = [new THREE.Vector2(w0, root)];
    for (let i = Math.ceil((w0 + hr - phase) / p); phase + i * p + hr <= w1; i++) {
      const c = phase + i * p;
      pts.push(new THREE.Vector2(c - hr, root), new THREE.Vector2(c - ht, tip), new THREE.Vector2(c + ht, tip), new THREE.Vector2(c + hr, root));
    }
    pts.push(new THREE.Vector2(w1, root), new THREE.Vector2(w1, vTop), new THREE.Vector2(w0, vTop));
    return extrude(new THREE.Shape(pts), z0, z1);
  }

  /** とい（弧の断面を u 方向に押し出す）。角度は (z, v) 面で +z から +v へ測る。 */
  function trough(rIn, rOut, a0, a1, u0, u1, n = 14) {
    // 押し出しは形の +Z。rotateY(π/2) で (x, y, z) → (z, y, -x) なので、形の X = -z。
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(new THREE.Vector2(-rOut * Math.cos(a), rOut * Math.sin(a))); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push(new THREE.Vector2(-rIn * Math.cos(a), rIn * Math.sin(a))); }
    return new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: u1 - u0, bevelEnabled: false }).rotateY(Math.PI / 2).translate(u0, 0, 0);
  }

  /** 前を向いた円盤（+z 面）。UV は rect = [u0, v0, u1, v1] に平面投影。 */
  function decalDisc(r, z, rect, n = 28) {
    const pos = [], uv = [], nor = [];
    const U = (x) => rect[0] + (rect[2] - rect[0]) * (0.5 + 0.5 * x / r);
    const V = (y) => rect[1] + (rect[3] - rect[1]) * (0.5 + 0.5 * y / r);
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, b = 2 * Math.PI * (i + 1) / n;
      const p = [[0, 0], [r * Math.cos(a), r * Math.sin(a)], [r * Math.cos(b), r * Math.sin(b)]];
      for (const q of p) { pos.push(q[0], q[1], z); uv.push(U(q[0]), V(q[1])); nor.push(0, 0, 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    return g;
  }

  // ------------------------------------------------------------------ コイルばね
  /**
   * らせんの管。軸は +x、x=0 から長さ L。両端 endTurns 巻きは密着巻き（ピッチ = 線径）。
   * update(L) は頂点を計算し直す：線の半径 r は一定のまま、有効巻きのピッチだけが変わる。
   */
  function helix({ R, r, turns, endTurns = 1, segPerTurn = 20, radial = 8, L0 }) {
    const rings = Math.max(8, Math.round(turns * segPerTurn)) + 1;
    const nv = rings * radial;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const active = Math.max(0.5, turns - 2 * endTurns);
    const closedPitch = 2 * r * 1.04;
    const closedLen = 2 * endTurns * closedPitch;
    // リングごとの前計算
    const ct = new Float32Array(rings), st = new Float32Array(rings);
    const cA = new Float32Array(rings), wA = new Float32Array(rings), sA = new Float32Array(rings), sW = new Float32Array(rings);
    for (let i = 0; i < rings; i++) {
      const tau = turns * i / (rings - 1);
      const t = 2 * Math.PI * tau;
      ct[i] = Math.cos(t); st[i] = Math.sin(t);
      const closed = Math.min(tau, endTurns) + Math.max(0, tau - (turns - endTurns));
      const act = clamp(tau - endTurns, 0, active);
      cA[i] = closed * closedPitch;
      wA[i] = act / active;
      const inActive = tau > endTurns && tau < turns - endTurns;
      sA[i] = inActive ? 0 : closedPitch / (2 * Math.PI);
      sW[i] = inActive ? 1 / (active * 2 * Math.PI) : 0;
    }
    const cp = new Float32Array(radial), sp = new Float32Array(radial);
    for (let j = 0; j < radial; j++) { cp[j] = Math.cos(2 * Math.PI * j / radial); sp[j] = Math.sin(2 * Math.PI * j / radial); }
    const idx = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3);
    pa.setUsage(THREE.DynamicDrawUsage); na.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pa);
    geo.setAttribute('normal', na);
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2).fill(WHITE_UV[0]), 2));
    geo.setIndex(idx);
    let last = -1;
    function update(L) {
      if (!Number.isFinite(L)) return;
      const act = Math.max(0.02, L - closedLen);
      if (Math.abs(act - last) < 1e-5) return;
      last = act;
      let o = 0;
      for (let i = 0; i < rings; i++) {
        const a = cA[i] + wA[i] * act;
        const c = sA[i] + sW[i] * act;                 // 軸方向の進み（1ラジアンあたり）
        const h = Math.sqrt(R * R + c * c);            // > 0（R > 0）
        const bx = R / h, bk = c / h;
        const cosT = ct[i], sinT = st[i];
        for (let j = 0; j < radial; j++) {
          // 断面の向き：N = (0, -cos t, -sin t)、B = (R, c sin t, -c cos t) / h
          const nx = sp[j] * bx;
          const ny = -cp[j] * cosT + sp[j] * bk * sinT;
          const nz = -cp[j] * sinT - sp[j] * bk * cosT;
          pos[o] = a + r * nx; pos[o + 1] = R * cosT + r * ny; pos[o + 2] = R * sinT + r * nz;
          nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
          o += 3;
        }
      }
      pa.needsUpdate = true; na.needsUpdate = true;
    }
    update(L0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(L0 / 2, 0, 0), L0 / 2 + R + r + 0.2);
    return { geo, update, closedLen };
  }

  return { mat, prep, merge, box, cylZ, cylX, rod, pol, extrude, arcWindow, circlePath, gear, sectorGear, ratchet, ratchetProfile, rack, trough, decalDisc, helix, toothAngles, WHITE_UV, clamp };
}
