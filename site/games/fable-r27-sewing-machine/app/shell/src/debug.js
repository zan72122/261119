// ?debug=1 の小さなオーバーレイ：tier・canvas・fps(平均/p95)・draw call・三角形（hero/周辺）・
// テクスチャ数と見積もり GPU メモリ・エラー。統計は __game.stats() でも読める（煙テスト用）。

export function createStats(THREE, renderer, scene, getHeroRoot, tier, envRef) {
  const dts = new Float32Array(240); let n = 0, k = 0;
  let last = { calls: 0, triangles: 0 };
  let staticCache = null;

  function frame(dt) { dts[k] = dt; k = (k + 1) % dts.length; n = Math.min(n + 1, dts.length); }
  function afterRender() { last = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; }

  function fps() {
    if (!n) return { avg: 0, p95: 0, p95ms: 0 };
    const a = Array.from(dts.slice(0, n)).sort((x, y) => x - y);
    const mean = a.reduce((s, v) => s + v, 0) / n;
    const p95 = a[Math.min(n - 1, Math.floor(n * 0.95))];
    return { avg: 1 / Math.max(1e-6, mean), p95: 1 / Math.max(1e-6, p95), p95ms: p95 * 1000 };
  }

  function texBytes(t) {
    if (t.isRenderTargetTexture) return 0;
    const img = t.image;
    const w = (img && (img.width || img.videoWidth)) || 0, h = (img && (img.height || img.videoHeight)) || 0;
    const mips = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1;
    const bpp = t.type === THREE.FloatType ? 16 : t.type === THREE.HalfFloatType ? 8 : 4;
    return w * h * bpp * mips;
  }
  function geoBytes(g) {
    let b = 0;
    for (const a of Object.values(g.attributes)) b += a.array.byteLength;
    if (g.index) b += g.index.array.byteLength;
    return b;
  }
  function isVisible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

  /** シーンを走査して静的な数（見えている三角形・テクスチャ・GPU 見積）を出す。読まれたときだけ（?debug=1 の表示は 4 回/秒）。
   *  ふだんの遊びでは走らない（以前は毎秒走って Map/Set を作っていた）。 */
  function scan() {
    const heroRoot = getHeroRoot();
    const texs = new Map(), geos = new Map();
    let triHero = 0, triBg = 0, meshesHero = 0, meshesBg = 0, instBytes = 0;
    const heroSet = new Set();
    if (heroRoot) heroRoot.traverse((o) => heroSet.add(o));
    scene.traverse((o) => {
      if (!(o.isMesh || o.isLine || o.isPoints)) return;
      const inHero = heroSet.has(o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const v of Object.values(m)) if (v && v.isTexture && !v.isRenderTargetTexture) { const e = texs.get(v) || { hero: false, bg: false }; if (inHero) e.hero = true; else e.bg = true; texs.set(v, e); }
      }
      if (o.geometry) geos.set(o.geometry, true);
      if (o.isInstancedMesh) instBytes += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
      if (!o.isMesh || !isVisible(o) || mats.every((m) => !m || !m.visible)) return;
      const g = o.geometry;
      let cnt = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
      cnt = Math.min(cnt, g.drawRange.count);
      let tri = cnt / 3;
      if (o.isInstancedMesh) tri *= o.count;
      if (inHero) { triHero += tri; meshesHero++; } else { triBg += tri; meshesBg++; }
    });
    let texHeroB = 0, texBgB = 0, texHeroN = 0, texBgN = 0;
    for (const [t, e] of texs) { const b = texBytes(t); if (e.hero) { texHeroB += b; texHeroN++; } else { texBgB += b; texBgN++; } }
    let geoB = 0; for (const g of geos.keys()) geoB += geoBytes(g);
    const rt = envRef.renderTarget; const envB = rt ? rt.width * rt.height * 8 : 0;
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const samples = tier.msaaSamples || 0;
    // 描画バッファ：色4B＋深度/ステンシル4B（MSAA ならサンプル数倍＋解決用の色）＋表示用の色4B
    const fbB = w * h * ((4 + 4) * Math.max(1, samples) + (samples ? 4 : 0) + 4);
    const total = texHeroB + texBgB + geoB + instBytes + envB + fbB;
    staticCache = { triHero, triBg, meshesHero, meshesBg, texHeroN, texBgN, texHeroB, texBgB, geoB: geoB + instBytes, envB, fbB, total };
  }
  const MiB = (b) => (b / 1048576).toFixed(1);

  return {
    frame, afterRender,
    snapshot() {
      scan();
      const f = fps();
      return {
        tier: tier.name + (tier.downgraded ? '(↓0.75)' : ''), canvasCss: [renderer.domElement.clientWidth, renderer.domElement.clientHeight],
        canvasPx: [renderer.domElement.width, renderer.domElement.height], pixelRatio: renderer.getPixelRatio(),
        fpsAvg: f.avg, fpsP95: f.p95, p95ms: f.p95ms, calls: last.calls, triangles: last.triangles,
        gpuTextures: renderer.info.memory.textures, gpuGeometries: renderer.info.memory.geometries,
        ...staticCache,
        mib: { texHero: +MiB(staticCache.texHeroB), texBg: +MiB(staticCache.texBgB), geo: +MiB(staticCache.geoB), env: +MiB(staticCache.envB), fb: +MiB(staticCache.fbB), total: +MiB(staticCache.total) },
      };
    },
    format(s, errors, extra) {
      const k = (v) => (v / 1000).toFixed(1) + 'k';
      return [
        `tier ${s.tier}  canvas ${s.canvasCss[0]}x${s.canvasCss[1]} css / ${s.canvasPx[0]}x${s.canvasPx[1]} px (pr ${s.pixelRatio.toFixed(2)})`,
        `fps avg ${s.fpsAvg.toFixed(0)}  p95 ${s.fpsP95.toFixed(0)} (${s.p95ms.toFixed(1)}ms)`,
        `draw ${s.calls}  tri(frame) ${k(s.triangles)}  tri hero ${k(s.triHero)} / bg ${k(s.triBg)}`,
        `tex gpu ${s.gpuTextures} (hero ${s.texHeroN} ${s.mib.texHero}MiB / bg ${s.texBgN} ${s.mib.texBg}MiB)  geo ${s.gpuGeometries}`,
        `GPU est ${s.mib.total}MiB = tex ${(s.mib.texHero + s.mib.texBg).toFixed(1)} + geo ${s.mib.geo} + env ${s.mib.env} + fb ${s.mib.fb}`,
        extra,
        `errors ${errors.length}` + (errors.length ? '\n' + errors.slice(-3).map((e) => '  ' + String(e).slice(0, 110)).join('\n') : ''),
      ].join('\n');
    },
  };
}
