// Small geometry helpers (no examples/jsm dependency).

/**
 * Merge parts into one non-indexed BufferGeometry with position/normal/uv/color.
 * parts: [{ geo, matrix?, color? (THREE.Color) }]
 */
export function mergeParts(THREE, parts) {
  let total = 0;
  const prepared = parts.map((p) => {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: p.color };
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color } of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    const c = color || { r: 1, g: 1, b: 1 };
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Deterministic pseudo random generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise for terrain wobble. */
export function noise2(x, z) {
  const s = Math.sin(x * 0.173 + z * 0.091) * 0.5 + Math.sin(x * 0.051 - z * 0.137 + 1.7) * 0.35 +
    Math.sin(x * 0.311 + z * 0.263 + 4.1) * 0.15;
  return s; // about -1..1
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
