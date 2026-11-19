// Parametric geometry kit. Everything is generated from numbers (no model files).
// A Builder collects many small parts into ONE indexed BufferGeometry per material
// (position / normal / uv / colour), so a whole assembly is a single draw call.
// Angle convention: a point at (r, a, y) is (r sin a, y, r cos a)  ->  a = 0 is +Z (front).

export function createKit(THREE) {
  const WHITE = { r: 1, g: 1, b: 1 };
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  const _c = new THREE.Color();

  // linear-space colour from an sRGB hex (THREE.Color converts on set)
  function col(hex) { _c.set(hex); return { r: _c.r, g: _c.g, b: _c.b }; }

  // local frame at polar position (r, a, y): local +Z points radially outwards, +X along +angle
  function polar(r, a, y) {
    return new THREE.Matrix4().makeRotationY(a).setPosition(r * Math.sin(a), y, r * Math.cos(a));
  }
  // translate * rotY * rotX * scale
  function xf(x, y, z, ry, rx, sx, sy, sz) {
    const m = new THREE.Matrix4().makeRotationY(ry || 0);
    if (rx) m.multiply(new THREE.Matrix4().makeRotationX(rx));
    if (sx !== undefined) m.scale(new THREE.Vector3(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz));
    return m.setPosition(x, y, z);
  }

  class Builder {
    constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
    v(x, y, z, nx, ny, nz, u, w, c) {
      c = c || WHITE;
      this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, w); this.col.push(c.r, c.g, c.b);
      return this.n++;
    }
    quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
    tri(a, b, c) { this.idx.push(a, b, c); }
    get tris() { return this.idx.length / 3; }

    // Append a (temporary) three geometry, transformed by matrix m, painted with colour c
    // (or its own colour attribute), uv multiplied by uvScale. The source is disposed.
    add(geo, m, c, uvScale) {
      const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, C = geo.attributes.color;
      const base = this.n, s = uvScale === undefined ? 1 : uvScale;
      let flip = false;
      if (m) { _nm.getNormalMatrix(m); flip = m.determinant() < 0; }
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
        if (m) { _p.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
        const cc = c || (C ? { r: C.getX(i), g: C.getY(i), b: C.getZ(i) } : WHITE);
        this.v(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, U ? U.getX(i) * s : 0, U ? U.getY(i) * s : 0, cc);
      }
      const I = geo.index;
      const cnt = I ? I.count : P.count;
      for (let i = 0; i < cnt; i += 3) {
        const a = base + (I ? I.getX(i) : i), b = base + (I ? I.getX(i + 1) : i + 1), d = base + (I ? I.getX(i + 2) : i + 2);
        if (flip) this.idx.push(a, d, b); else this.idx.push(a, b, d);
      }
      geo.dispose();
      return this;
    }

    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      this.pos = this.nrm = this.uv = this.col = this.idx = null;
      return g;
    }
  }

  // ---- three primitives routed through the builder
  const box = (b, w, h, d, m, c, uvS) => b.add(new THREE.BoxGeometry(w, h, d), m, c, uvS);
  const cyl = (b, rTop, rBot, h, seg, m, c, uvS, open) => b.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!open), m, c, uvS);
  const sphere = (b, r, m, c, ws, hs) => b.add(new THREE.SphereGeometry(r, ws || 10, hs || 8), m, c);
  const cone = (b, r, h, seg, m, c, uvS) => b.add(new THREE.ConeGeometry(r, h, seg, 1), m, c, uvS);
  const torus = (b, R, tube, rs, ts, m, c, arc) => b.add(new THREE.TorusGeometry(R, tube, rs, ts, arc === undefined ? Math.PI * 2 : arc), m, c);
  // profile: array of [r, y] from bottom to top, revolved around Y
  function lathe(b, profile, seg, m, c, uvS, phiStart, phiLen) {
    const pts = profile.map((p) => new THREE.Vector2(Math.max(p[0], 1e-4), p[1]));
    return b.add(new THREE.LatheGeometry(pts, seg, phiStart || 0, phiLen === undefined ? Math.PI * 2 : phiLen), m, c, uvS);
  }

  // ---- annular sector prism: r0..r1, y0..y1, a0..a1 (a full ring when a1 - a0 = 2π)
  // o: { r0, r1, y0, y1, a0, a1, seg, col, colTop, tile, top, bottom, inner, outer, caps }
  function sector(b, o) {
    let a0 = o.a0, a1 = o.a1;
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const span = a1 - a0;
    const full = Math.abs(span - Math.PI * 2) < 1e-6;
    const seg = Math.max(1, o.seg || Math.ceil(span / (Math.PI / 20)));
    const { r0, r1, y0, y1 } = o;
    const c = o.col || WHITE, ct = o.colTop || c, k = 1 / (o.tile || 1);
    for (let j = 0; j < seg; j++) {
      const t0 = a0 + span * j / seg, t1 = a0 + span * (j + 1) / seg;
      const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
      if (o.top !== false) {
        b.quad(b.v(r0 * s0, y1, r0 * c0, 0, 1, 0, r0 * s0 * k, r0 * c0 * k, ct), b.v(r1 * s0, y1, r1 * c0, 0, 1, 0, r1 * s0 * k, r1 * c0 * k, ct),
          b.v(r1 * s1, y1, r1 * c1, 0, 1, 0, r1 * s1 * k, r1 * c1 * k, ct), b.v(r0 * s1, y1, r0 * c1, 0, 1, 0, r0 * s1 * k, r0 * c1 * k, ct));
      }
      if (o.bottom !== false) {
        b.quad(b.v(r0 * s1, y0, r0 * c1, 0, -1, 0, r0 * s1 * k, r0 * c1 * k, c), b.v(r1 * s1, y0, r1 * c1, 0, -1, 0, r1 * s1 * k, r1 * c1 * k, c),
          b.v(r1 * s0, y0, r1 * c0, 0, -1, 0, r1 * s0 * k, r1 * c0 * k, c), b.v(r0 * s0, y0, r0 * c0, 0, -1, 0, r0 * s0 * k, r0 * c0 * k, c));
      }
      if (o.outer !== false) {
        b.quad(b.v(r1 * s0, y0, r1 * c0, s0, 0, c0, t0 * r1 * k, y0 * k, c), b.v(r1 * s1, y0, r1 * c1, s1, 0, c1, t1 * r1 * k, y0 * k, c),
          b.v(r1 * s1, y1, r1 * c1, s1, 0, c1, t1 * r1 * k, y1 * k, c), b.v(r1 * s0, y1, r1 * c0, s0, 0, c0, t0 * r1 * k, y1 * k, c));
      }
      if (o.inner !== false && r0 > 1e-4) {
        b.quad(b.v(r0 * s1, y0, r0 * c1, -s1, 0, -c1, t1 * r0 * k, y0 * k, c), b.v(r0 * s0, y0, r0 * c0, -s0, 0, -c0, t0 * r0 * k, y0 * k, c),
          b.v(r0 * s0, y1, r0 * c0, -s0, 0, -c0, t0 * r0 * k, y1 * k, c), b.v(r0 * s1, y1, r0 * c1, -s1, 0, -c1, t1 * r0 * k, y1 * k, c));
      }
    }
    if (!full && o.caps !== false) {
      for (const end of [0, 1]) {
        const t = end ? a1 : a0, s = Math.sin(t), cc = Math.cos(t), sg = end ? 1 : -1;
        const nx = sg * cc, nz = -sg * s; // ±tangent
        const A = b.v(r1 * s, y0, r1 * cc, nx, 0, nz, r1 * k, y0 * k, c), B = b.v(r0 * s, y0, r0 * cc, nx, 0, nz, r0 * k, y0 * k, c);
        const C = b.v(r0 * s, y1, r0 * cc, nx, 0, nz, r0 * k, y1 * k, c), D = b.v(r1 * s, y1, r1 * cc, nx, 0, nz, r1 * k, y1 * k, c);
        if (end) b.quad(A, B, C, D); else b.quad(D, C, B, A);
      }
    }
    return b;
  }

  // ---- thick wall arc with arched window openings (real holes: the sky shows through)
  // o: { rIn, rOut, y0, y1, a0, a1, seg, windows: [{ a, hw, sill, h, arch }], colIn, colOut, tile, sub }
  // window: centre angle a, half angular width hw, sill height (absolute y), straight height h, arch rise
  function wallArc(b, o) {
    const { rIn, rOut, y0, y1, a0, a1 } = o;
    const wins = o.windows || [], sub = o.sub || 6, k = 1 / (o.tile || 1);
    const ci = o.colIn || WHITE, co = o.colOut || WHITE;
    const inWin = (t) => { for (const w of wins) if (t > w.a - w.hw + 1e-6 && t < w.a + w.hw - 1e-6) return w; return null; };
    const cuts = [];
    const seg = Math.max(1, o.seg);
    for (let j = 0; j <= seg; j++) { const t = a0 + (a1 - a0) * j / seg; if (!inWin(t)) cuts.push(t); }
    for (const w of wins) for (let j = 0; j <= sub; j++) cuts.push(w.a - w.hw + 2 * w.hw * j / sub);
    cuts.sort((x, y) => x - y);
    const ts = [];
    for (const t of cuts) if (!ts.length || t - ts[ts.length - 1] > 1e-4) ts.push(t);
    const topOf = (w, t) => { const u = (t - w.a) / w.hw; return w.sill + w.h + w.arch * Math.sqrt(Math.max(0, 1 - u * u)); };
    // one vertical strip of the inside and outside faces between heights (ya0,ya1) at t0 and (yb0,yb1) at t1
    const strip = (t0, t1, ya0, ya1, yb0, yb1) => {
      const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
      b.quad(b.v(rOut * s0, ya0, rOut * c0, s0, 0, c0, t0 * rOut * k, ya0 * k, co), b.v(rOut * s1, yb0, rOut * c1, s1, 0, c1, t1 * rOut * k, yb0 * k, co),
        b.v(rOut * s1, yb1, rOut * c1, s1, 0, c1, t1 * rOut * k, yb1 * k, co), b.v(rOut * s0, ya1, rOut * c0, s0, 0, c0, t0 * rOut * k, ya1 * k, co));
      b.quad(b.v(rIn * s1, yb0, rIn * c1, -s1, 0, -c1, t1 * rIn * k, yb0 * k, ci), b.v(rIn * s0, ya0, rIn * c0, -s0, 0, -c0, t0 * rIn * k, ya0 * k, ci),
        b.v(rIn * s0, ya1, rIn * c0, -s0, 0, -c0, t0 * rIn * k, ya1 * k, ci), b.v(rIn * s1, yb1, rIn * c1, -s1, 0, -c1, t1 * rIn * k, yb1 * k, ci));
    };
    // horizontal-ish face across the wall thickness; up = +1 (sill, wall top) or -1 (arch soffit)
    const across = (t0, t1, ya, yb, up, c) => {
      const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
      const A = b.v(rIn * s0, ya, rIn * c0, 0, up, 0, rIn * s0 * k, rIn * c0 * k, c), B = b.v(rOut * s0, ya, rOut * c0, 0, up, 0, rOut * s0 * k, rOut * c0 * k, c);
      const C = b.v(rOut * s1, yb, rOut * c1, 0, up, 0, rOut * s1 * k, rOut * c1 * k, c), D = b.v(rIn * s1, yb, rIn * c1, 0, up, 0, rIn * s1 * k, rIn * c1 * k, c);
      if (up > 0) b.quad(A, B, C, D); else b.quad(D, C, B, A);
    };
    const jamb = (t, ya, yb, sg) => { // vertical face inside a window opening, normal = sg * tangent
      const s = Math.sin(t), cc = Math.cos(t), nx = sg * cc, nz = -sg * s;
      const A = b.v(rOut * s, ya, rOut * cc, nx, 0, nz, rOut * k, ya * k, co), B = b.v(rIn * s, ya, rIn * cc, nx, 0, nz, rIn * k, ya * k, co);
      const C = b.v(rIn * s, yb, rIn * cc, nx, 0, nz, rIn * k, yb * k, co), D = b.v(rOut * s, yb, rOut * cc, nx, 0, nz, rOut * k, yb * k, co);
      if (sg > 0) b.quad(A, B, C, D); else b.quad(D, C, B, A);
    };
    for (let j = 0; j + 1 < ts.length; j++) {
      const t0 = ts[j], t1 = ts[j + 1], w = inWin((t0 + t1) / 2);
      if (o.top !== false) across(t0, t1, y1, y1, 1, co);
      if (!w) { strip(t0, t1, y0, y1, y0, y1); continue; }
      const ya = topOf(w, t0), yb = topOf(w, t1);
      strip(t0, t1, y0, w.sill, y0, w.sill);
      strip(t0, t1, ya, y1, yb, y1);
      across(t0, t1, w.sill, w.sill, 1, co);
      across(t0, t1, ya, yb, -1, co);
      if (Math.abs(t0 - (w.a - w.hw)) < 1e-5) jamb(t0, w.sill, ya, 1);
      if (Math.abs(t1 - (w.a + w.hw)) < 1e-5) jamb(t1, w.sill, yb, -1);
    }
    return b;
  }

  // ---- wavy cam track: flat ring whose top follows y + depth * |sin(waves/2 * (a - phase))|
  function waveRing(b, o) {
    const { r0, r1, y, depth, waves, phase, seg, col: c } = o;
    const h = (t) => depth * Math.abs(Math.sin(waves * 0.5 * (t - phase)));
    for (let j = 0; j < seg; j++) {
      const t0 = Math.PI * 2 * j / seg, t1 = Math.PI * 2 * (j + 1) / seg;
      const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
      const h0 = y + h(t0), h1 = y + h(t1);
      b.quad(b.v(r0 * s0, h0, r0 * c0, 0, 1, 0, 0, 0, c), b.v(r1 * s0, h0, r1 * c0, 0, 1, 0, 0, 0, c),
        b.v(r1 * s1, h1, r1 * c1, 0, 1, 0, 0, 0, c), b.v(r0 * s1, h1, r0 * c1, 0, 1, 0, 0, 0, c));
      b.quad(b.v(r1 * s0, y, r1 * c0, s0, 0, c0, 0, 0, c), b.v(r1 * s1, y, r1 * c1, s1, 0, c1, 0, 0, c),
        b.v(r1 * s1, h1, r1 * c1, s1, 0, c1, 0, 0, c), b.v(r1 * s0, h0, r1 * c0, s0, 0, c0, 0, 0, c));
      b.quad(b.v(r0 * s1, y, r0 * c1, -s1, 0, -c1, 0, 0, c), b.v(r0 * s0, y, r0 * c0, -s0, 0, -c0, 0, 0, c),
        b.v(r0 * s0, h0, r0 * c0, -s0, 0, -c0, 0, 0, c), b.v(r0 * s1, h1, r0 * c1, -s1, 0, -c1, 0, 0, c));
    }
    return b;
  }

  // ---- flat plate with an outline in its local XY plane (convex, counter-clockwise), thickness t along Z
  function plate(b, outline, t, m, c) {
    const tb = new Builder(), n = outline.length, h = t / 2;
    const f0 = tb.n; for (const p of outline) tb.v(p[0], p[1], h, 0, 0, 1, p[0], p[1], c);
    for (let i = 1; i + 1 < n; i++) tb.tri(f0, f0 + i, f0 + i + 1);
    const k0 = tb.n; for (const p of outline) tb.v(p[0], p[1], -h, 0, 0, -1, p[0], p[1], c);
    for (let i = 1; i + 1 < n; i++) tb.tri(k0, k0 + i + 1, k0 + i);
    for (let i = 0; i < n; i++) {
      const p = outline[i], q = outline[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.max(Math.hypot(dx, dy), 1e-6), nx = dy / L, ny = -dx / L;
      tb.quad(tb.v(p[0], p[1], -h, nx, ny, 0, 0, 0, c), tb.v(q[0], q[1], -h, nx, ny, 0, 0, 0, c),
        tb.v(q[0], q[1], h, nx, ny, 0, 0, 0, c), tb.v(p[0], p[1], h, nx, ny, 0, 0, 0, c));
    }
    return b.add(tb.build(), m, null);
  }

  // door leaf outline: hinge on the Y axis, w wide, straight height h, quarter-round top rising to the meeting edge
  function leafOutline(w, h, seg) {
    const pts = [[0, 0], [w, 0]];
    for (let j = 0; j <= seg; j++) { const f = Math.PI / 2 + (Math.PI / 2) * j / seg; pts.push([w + w * Math.cos(f), h + w * Math.sin(f)]); }
    return pts;
  }

  return { Builder, col, polar, xf, box, cyl, sphere, cone, torus, lathe, sector, wallArc, waveRing, plate, leafOutline, WHITE };
}
