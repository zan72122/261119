// 小さな道具：ジオメトリ結合、場面の計測（三角形・テクスチャ・GPU メモリ見積もり）。

export function mergeGeometries(THREE, geoms) {
  if (!geoms.length) return new THREE.BufferGeometry();
  const indexed = geoms[0].index !== null;
  const names = Object.keys(geoms[0].attributes);
  let vTotal = 0, iTotal = 0;
  for (const g of geoms) {
    if ((g.index !== null) !== indexed) throw new Error('mergeGeometries: index の有無が揃っていない');
    for (const n of names) if (!g.attributes[n]) throw new Error('mergeGeometries: 属性 ' + n + ' が無い');
    vTotal += g.attributes.position.count;
    if (indexed) iTotal += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const a0 = geoms[0].attributes[n];
    const arr = new a0.array.constructor(vTotal * a0.itemSize);
    let off = 0;
    for (const g of geoms) {
      const a = g.attributes[n];
      arr.set(a.array.subarray(0, a.count * a.itemSize), off);
      off += a.count * a.itemSize;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
  }
  if (indexed) {
    const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
    let off = 0, base = 0;
    for (const g of geoms) {
      const src = g.index.array;
      for (let i = 0; i < g.index.count; i++) idx[off + i] = src[i] + base;
      off += g.index.count;
      base += g.attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  out.computeBoundingSphere();
  return out;
}

// 形を置いてから結合するための補助：geometry に変換を焼き込む
export function placed(THREE, geom, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geom.applyMatrix4(m);
  return geom;
}

const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap', 'displacementMap'];

function texBytes(tex) {
  if (tex.isRenderTargetTexture) return { w: tex.image?.width || 0, h: tex.image?.height || 0, bytes: (tex.image?.width || 0) * (tex.image?.height || 0) * 8 };
  const img = tex.image;
  const w = (img && (img.width || img.videoWidth)) || tex.userData.size || 0;
  const h = (img && (img.height || img.videoHeight)) || tex.userData.size || 0;
  const mip = tex.generateMipmaps !== false && tex.minFilter !== 1006 /* LinearFilter */ && tex.minFilter !== 1003 /* NearestFilter */ ? 4 / 3 : 1;
  return { w, h, bytes: w * h * 4 * mip };
}

function geomBytes(g) {
  let b = 0;
  for (const k in g.attributes) b += g.attributes[k].array.byteLength;
  if (g.index) b += g.index.array.byteLength;
  return b;
}

// heroRoot 配下を hero、それ以外を周辺として数える。renderer があればフレームバッファ等も見積もる。
export function measureScene(scene, heroRoot, renderer, extra = {}) {
  const res = {
    hero: { tris: 0, meshes: 0, textures: 0, texBytes: 0, geoBytes: 0 },
    env: { tris: 0, meshes: 0, textures: 0, texBytes: 0, geoBytes: 0 },
    textures: [], fbBytes: 0, shadowBytes: 0, pmremBytes: extra.pmremBytes || 0, totalBytes: 0,
  };
  const seenTex = new Map(); // source -> {bucket}
  const seenGeo = new Set();
  const heroSet = new Set();
  if (heroRoot) heroRoot.traverse((o) => heroSet.add(o));
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const b = heroSet.has(o) ? res.hero : res.env;
    const g = o.geometry;
    if (!g || !g.attributes.position) return;
    const inst = o.isInstancedMesh ? o.count : 1;
    if (o.isMesh) {
      let n = g.index ? g.index.count : g.attributes.position.count;
      if (g.drawRange && g.drawRange.count !== Infinity) n = Math.min(n, g.drawRange.count);
      b.tris += Math.floor(n / 3) * inst;
    }
    b.meshes += Array.isArray(o.material) ? o.material.length : 1;
    if (!seenGeo.has(g)) {
      seenGeo.add(g);
      b.geoBytes += geomBytes(g);
      if (o.isInstancedMesh) b.geoBytes += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const slot of TEX_SLOTS) {
        const t = m[slot];
        if (!t || !t.isTexture) continue;
        const key = t.source || t;
        if (seenTex.has(key)) continue;
        const info = texBytes(t);
        seenTex.set(key, true);
        b.textures++;
        b.texBytes += info.bytes || 0;
        res.textures.push({ name: t.name || '(unnamed)', owner: b === res.hero ? 'hero' : 'env', w: info.w, h: info.h, mb: +((info.bytes || 0) / 1048576).toFixed(2) });
      }
    }
  });
  if (renderer) {
    const c = renderer.domElement;
    const px = c.width * c.height;
    const msaa = renderer.getContextAttributes ? renderer.getContextAttributes()?.antialias : false;
    // 色 4B + 深度ステンシル 4B。MSAA 4x は 4 サンプル分 + 解決用。表示（合成）用にもう 1 枚。
    res.fbBytes = msaa ? px * 8 * 4 + px * 4 + px * 4 : px * 8 + px * 4;
    if (renderer.shadowMap.enabled && extra.shadowMapSize) res.shadowBytes = extra.shadowMapSize * extra.shadowMapSize * 8;
  }
  res.totalBytes = res.hero.texBytes + res.env.texBytes + res.hero.geoBytes + res.env.geoBytes + res.fbBytes + res.shadowBytes + res.pmremBytes;
  return res;
}

// NaN の芽を数える（?debug=1 と煙テスト用）。全画面が黒くなる主な原因は、シェーダーで
// normalize(0) や NaN を含む頂点・行列が使われること。見える物について次を数える：
//   badPos   位置が有限でない頂点 / badNormal  法線が有限でないか長さ 0（normalize(0) → NaN）
//   badMatrix ワールド行列・インスタンス行列が有限でない
//   flatInst  1 軸だけ 0 に潰したインスタンス（法線の変換で 0 除算 → NaN。全軸 0 は面積 0 なので無害）
export function sanityScan(scene) {
  const r = { badPos: 0, badNormal: 0, badMatrix: 0, flatInst: 0, meshes: 0 };
  const seen = new Set();
  const fin = (a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    r.meshes++;
    if (!fin(o.matrixWorld.elements)) r.badMatrix++;
    const g = o.geometry;
    if (g && !seen.has(g)) {
      seen.add(g);
      const p = g.attributes.position, n = g.attributes.normal;
      if (p && !fin(p.array)) r.badPos++;
      if (n && !o.material?.isMeshBasicMaterial) {
        const a = n.array;
        for (let i = 0; i < n.count; i++) {
          const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
          const l = x * x + y * y + z * z;
          if (!(l > 1e-8) || !Number.isFinite(l)) r.badNormal++;
        }
      }
    }
    if (o.isInstancedMesh) {
      const e = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const k = i * 16;
        let ok = true;
        for (let j = 0; j < 16; j++) if (!Number.isFinite(e[k + j])) ok = false;
        if (!ok) { r.badMatrix++; continue; }
        const sx = e[k] * e[k] + e[k + 1] * e[k + 1] + e[k + 2] * e[k + 2];
        const sy = e[k + 4] * e[k + 4] + e[k + 5] * e[k + 5] + e[k + 6] * e[k + 6];
        const sz = e[k + 8] * e[k + 8] + e[k + 9] * e[k + 9] + e[k + 10] * e[k + 10];
        const zero = (sx < 1e-12) + (sy < 1e-12) + (sz < 1e-12);
        if (zero > 0 && zero < 3 && !o.material?.isMeshBasicMaterial) r.flatInst++;
      }
    }
  });
  r.ok = r.badPos + r.badNormal + r.badMatrix + r.flatInst === 0;
  return r;
}
