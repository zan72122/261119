// 計測（三角形・draw call・テクスチャ・GPU メモリ見積もり・fps）と ?debug=1 の小さなオーバーレイ。
// 計測関数は煙テストからも使う（window.__game.metrics）。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});
  const THREE = window.THREE;
  const MiB = 1024 * 1024;

  const _frustum = new THREE.Frustum();
  const _m = new THREE.Matrix4();
  const _sphere = new THREE.Sphere();

  function drawable(o) {
    if (!(o.isMesh || o.isPoints || o.isLine)) return false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    return mats.some((m) => m && m.visible !== false);
  }

  function triCount(o) {
    const g = o.geometry;
    if (!g || !o.isMesh) return 0;
    let n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
    if (isFinite(g.drawRange.count)) n = Math.min(n, g.drawRange.count);
    const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
    return Math.floor(n / 3) * (isFinite(inst) ? inst : 1);
  }

  // 本描画の画面内三角形（three と同じ視錐台カリング。影パスは含まない）
  function countGroup(root, camera) {
    const res = { triangles: 0, trianglesAll: 0, drawCalls: 0, meshes: 0 };
    if (!root) return res;
    camera.updateMatrixWorld();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    root.traverseVisible((o) => {
      if (!drawable(o)) return;
      const t = triCount(o);
      res.trianglesAll += t;
      res.meshes++;
      let inView = true;
      if (o.frustumCulled && o.geometry) {
        if (o.isInstancedMesh || o.isSkinnedMesh) {
          if (o.boundingSphere === null && o.computeBoundingSphere) o.computeBoundingSphere();
          _sphere.copy(o.boundingSphere || o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        } else {
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          _sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        }
        inView = _frustum.intersectsSphere(_sphere);
      }
      if (inView) {
        res.triangles += t;
        res.drawCalls += Array.isArray(o.material) ? o.geometry.groups.length || 1 : 1;
      }
    });
    return res;
  }

  function texBytes(t) {
    const img = t.image;
    if (!img) return 0;
    const w = img.width || img.videoWidth || 0, h = img.height || img.videoHeight || 0;
    const bpp = t.type === THREE.FloatType ? 16 : t.type === THREE.HalfFloatType ? 8 : 4;
    const mip = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1;
    return w * h * bpp * mip;
  }

  // GPU メモリ見積もり（docs/PLAN.md §3 の式）
  function estimate(renderer, scene, groups) {
    const sources = new Map(); // Source -> {bytes, owner, name}
    const attrs = new Set();
    let geoBytes = { hero: 0, shell: 0 };
    const ownerOf = new Map();
    for (const [owner, g] of Object.entries(groups)) if (g) g.traverse((o) => ownerOf.set(o, owner));
    scene.traverse((o) => {
      if (!drawable(o)) return;
      const owner = ownerOf.get(o) || 'shell';
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture && !sources.has(v.source)) {
            sources.set(v.source, { bytes: texBytes(v), owner, name: v.name, size: v.image ? `${v.image.width}x${v.image.height}` : '?' });
          }
        }
      }
      const g = o.geometry;
      if (g) {
        const list = Object.values(g.attributes);
        if (g.index) list.push(g.index);
        if (o.isInstancedMesh) { list.push(o.instanceMatrix); if (o.instanceColor) list.push(o.instanceColor); }
        for (const a of list) {
          const key = a.isInterleavedBufferAttribute ? a.data : a;
          if (attrs.has(key)) continue;
          attrs.add(key);
          geoBytes[owner] = (geoBytes[owner] || 0) + (key.array ? key.array.byteLength : 0);
        }
      }
    });
    const tex = { hero: 0, shell: 0, heroCount: 0, shellCount: 0, list: [] };
    sources.forEach((s) => {
      tex[s.owner] += s.bytes;
      tex[s.owner + 'Count']++;
      tex.list.push(`${s.owner}:${s.name || '?'}:${s.size}`);
    });
    const gl = renderer.getContext();
    const fbW = gl.drawingBufferWidth, fbH = gl.drawingBufferHeight;
    const framebuffer = fbW * fbH * (4 + 4 + 4); // 色 + 深度/ステンシル + 表示用
    let shadow = 0;
    if (renderer.shadowMap.enabled) scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow) shadow += o.shadow.mapSize.x * o.shadow.mapSize.y * 8; });
    const total = tex.hero + tex.shell + geoBytes.hero + geoBytes.shell + framebuffer + shadow;
    return {
      textureMiB: { hero: tex.hero / MiB, shell: tex.shell / MiB },
      textureCount: { hero: tex.heroCount, shell: tex.shellCount, list: tex.list },
      geometryMiB: { hero: geoBytes.hero / MiB, shell: geoBytes.shell / MiB },
      framebufferMiB: framebuffer / MiB,
      shadowMiB: shadow / MiB,
      totalMiB: total / MiB,
      drawingBuffer: [fbW, fbH],
    };
  }

  function createFps() {
    const N = 240;
    const ms = new Float32Array(N);
    let i = 0, n = 0;
    return {
      push(dtMs) { ms[i] = dtMs; i = (i + 1) % N; n = Math.min(N, n + 1); },
      stats() {
        if (!n) return { avg: 0, p95: 0 };
        const a = Array.from(ms.subarray(0, n)).sort((x, y) => x - y);
        const mean = a.reduce((s, v) => s + v, 0) / n;
        const p95ms = a[Math.min(n - 1, Math.floor(n * 0.95))];
        return { avg: 1000 / Math.max(1e-3, mean), p95: 1000 / Math.max(1e-3, p95ms) };
      },
      reset() { i = 0; n = 0; },
    };
  }

  function createOverlay(el, onSkip) {
    el.style.display = 'block';
    const pre = document.createElement('pre');
    el.appendChild(pre);
    const btn = document.createElement('button');
    btn.textContent = '▶▶';
    btn.title = 'skip stage';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onSkip && onSkip(); });
    el.appendChild(btn);
    let acc = 0;
    return {
      update(dt, info) {
        acc += dt;
        if (acc < 0.5) return;
        acc = 0;
        pre.textContent = info();
      },
    };
  }

  // NaN の見張り（全画面が黒くなる原因を CPU 側で見つける）。
  // 毎回：物体の行列・インスタンス行列・書き換えのある頂点（version>0）。full=true のときは全ての法線の長さ 0 も数える
  // （長さ 0 の法線は GPU の normalize で NaN になり、Apple の GPU では黒い点になる）。
  function badFloats(arr, start, end) {
    let n = 0;
    for (let i = start; i < end; i++) if (!Number.isFinite(arr[i])) n++;
    return n;
  }
  function zeroNormals(attr) {
    if (!attr || attr.itemSize !== 3 || !attr.array || attr.isInterleavedBufferAttribute) return 0;
    const a = attr.array;
    let n = 0;
    for (let i = 0; i < attr.count; i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      if (!(x * x + y * y + z * z > 1e-12)) n++;
    }
    return n;
  }
  function scanNaN(scene, full) {
    const res = { nan: 0, zeroNormals: 0, where: [] };
    scene.traverse((o) => {
      let bad = badFloats(o.matrixWorld.elements, 0, 16);
      if (o.isInstancedMesh) bad += badFloats(o.instanceMatrix.array, 0, o.count * 16);
      const g = o.geometry;
      if (g && g.attributes) {
        for (const k in g.attributes) {
          const a = g.attributes[k];
          if (!a.array || a.isInterleavedBufferAttribute) continue;
          if (full || a.version > 0) bad += badFloats(a.array, 0, a.array.length);
        }
        if (full && o.isMesh && g.attributes.normal) {
          const z = zeroNormals(g.attributes.normal);
          if (z) { res.zeroNormals += z; res.where.push((o.name || o.type) + ' zeroN ' + z); }
        }
      }
      if (bad) { res.nan += bad; res.where.push((o.name || o.type) + ' NaN ' + bad); }
    });
    return res;
  }

  S.debug = { countGroup, estimate, createFps, createOverlay, scanNaN };
})();
