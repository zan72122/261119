// Resource accounting for the debug overlay and docs/PLAN.md: triangles, draw calls,
// textures and an estimate of GPU memory, split into hero / scene.

const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'specularMap', 'envMap', 'gradientMap'];

function texBytes(t) {
  const img = t.image;
  const w = (img && (img.width || img.videoWidth)) || 0;
  const h = (img && (img.height || img.videoHeight)) || 0;
  const mip = t.generateMipmaps !== false && t.minFilter !== 1006 && t.minFilter !== 1003 ? 4 / 3 : 1;
  return { w, h, bytes: w * h * 4 * mip };
}

function geoBytes(g) {
  let b = 0;
  for (const k in g.attributes) b += g.attributes[k].array.byteLength;
  if (g.index) b += g.index.array.byteLength;
  return b;
}

function trisOf(o) {
  const g = o.geometry;
  if (!g || !g.attributes.position) return 0;
  let n = g.index ? g.index.count : g.attributes.position.count;
  const dr = g.drawRange;
  if (dr && dr.count !== Infinity) n = Math.min(n, dr.count);
  let t = n / 3;
  if (o.isInstancedMesh) t *= o.count;
  return Math.floor(t);
}

function texturesOf(material, set) {
  const mats = Array.isArray(material) ? material : [material];
  for (const m of mats) {
    if (!m) continue;
    for (const k of TEX_KEYS) if (m[k] && m[k].isTexture) set.add(m[k]);
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) set.add(v); }
  }
}

/** Walks a subtree. Draw calls counted per visible mesh with a visible material (no culling). */
export function measure(root) {
  const geos = new Map(), texs = new Set();
  let tris = 0, calls = 0, meshes = 0, instBytes = 0;
  root.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const drawn = mats.some((m) => m && m.visible);
    if (!drawn) return;
    meshes++;
    calls += o.isInstancedMesh && o.count === 0 ? 0 : mats.filter((m) => m && m.visible).length;
    tris += trisOf(o);
    if (!geos.has(o.geometry.uuid)) geos.set(o.geometry.uuid, geoBytes(o.geometry));
    if (o.isInstancedMesh) {
      instBytes += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
    }
    texturesOf(o.material, texs);
  });
  let geoB = instBytes; for (const b of geos.values()) geoB += b;
  let texB = 0, maxTex = 0;
  const texList = [];
  for (const t of texs) {
    const r = texBytes(t);
    texB += r.bytes; maxTex = Math.max(maxTex, r.w, r.h);
    texList.push(`${t.name || 'tex'}:${r.w}x${r.h}`);
  }
  return { tris, calls, meshes, textures: texs.size, texList, maxTex, geoMiB: geoB / 1048576, texMiB: texB / 1048576, texSet: texs };
}

/** Framebuffer bytes: colour + depth (24/8), double buffered; plus MSAA buffers when used. */
export function framebufferMiB(w, h, samples) {
  const base = w * h * (4 + 4) * 2;
  const msaa = samples > 0 ? w * h * (4 + 4) * samples : 0;
  return (base + msaa) / 1048576;
}

/** Full report: hero vs the rest of the scene, plus framebuffer and totals. */
export function report(scene, heroRoot, drawW, drawH, samples) {
  const hero = measure(heroRoot);
  const all = measure(scene);
  const sceneOnly = {
    tris: all.tris - hero.tris,
    calls: all.calls - hero.calls,
    textures: [...all.texSet].filter((t) => !hero.texSet.has(t)).length,
    geoMiB: all.geoMiB - hero.geoMiB,
    texMiB: 0,
  };
  // textures shared with the hero (blob) are counted for the scene only
  let sceneTexB = 0, heroTexB = 0;
  for (const t of all.texSet) {
    const b = texBytes(t).bytes;
    if (hero.texSet.has(t) && t.name !== 'blob') heroTexB += b; else sceneTexB += b;
  }
  sceneOnly.texMiB = sceneTexB / 1048576;
  const heroTexCount = [...hero.texSet].filter((t) => t.name !== 'blob').length;
  const fb = framebufferMiB(drawW, drawH, samples);
  const gpu = all.geoMiB + all.texMiB + fb;
  return {
    hero: { tris: hero.tris, calls: hero.calls, textures: heroTexCount, maxTex: hero.maxTex, geoMiB: hero.geoMiB, texMiB: heroTexB / 1048576, texList: hero.texList },
    scene: sceneOnly,
    total: { tris: all.tris, calls: all.calls, textures: all.textures, texList: all.texList, fbMiB: fb, gpuMiB: gpu },
  };
}

/**
 * NaN / Infinity check (debug only): world matrices of every drawn object, instance matrices,
 * the camera and the hero state numbers. Returns the number of bad values found.
 */
export function nanScan(scene, camera, state) {
  let bad = 0;
  const chk = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) bad++; };
  scene.traverseVisible((o) => {
    chk(o.matrixWorld.elements);
    if (o.isInstancedMesh) chk(o.instanceMatrix.array);
  });
  chk(camera.matrixWorld.elements);
  chk(camera.projectionMatrix.elements);
  if (state) for (const k of ['round', 'progress', 'motor']) if (!Number.isFinite(state[k])) bad++;
  return bad;
}
