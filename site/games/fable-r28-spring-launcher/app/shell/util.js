// 小さな数学・描画の道具

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** フレームレートに依存しない指数減衰の補間係数 */
export const dampK = (rate, dt) => 1 - Math.exp(-rate * dt);

/** 決まった種の乱数（毎回同じ景色にする） */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** 放射グラデーション（疑似影・きらきら用） */
export function drawRadial(ctx, w, h, stops) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** 頂点色を1色で塗る（結合用） */
export function paint(THREE, geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** 同じ属性構成の BufferGeometry を1つに結合する（index あり/なし混在可） */
export function merge(THREE, geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(parts[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = parts[0].attributes[name].itemSize;
    let len = 0;
    for (const p of parts) len += p.attributes[name].count * size;
    const arr = new Float32Array(len);
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of geos) g.dispose();
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  return out;
}

/** 三角形数（表示中のメッシュ。InstancedMesh は count 倍） */
export function countTriangles(root) {
  let tris = 0;
  root.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints) || !o.geometry) return;
    if (o.isPoints) return;
    if (o.material && !Array.isArray(o.material) && o.material.visible === false) return; // 当たり判定用
    const g = o.geometry;
    let n = g.index ? g.index.count : g.attributes.position.count;
    if (g.drawRange && g.drawRange.count !== Infinity) n = Math.min(n, g.drawRange.count);
    const inst = o.isInstancedMesh ? o.count : 1;
    tris += Math.floor(n / 3) * inst;
  });
  return tris;
}
