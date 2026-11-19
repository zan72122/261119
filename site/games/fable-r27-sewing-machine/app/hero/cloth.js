// 布と縫い目。布は 1 枚の板のまま動かし（剛体スクロール）、机 → 台の上 → 机 へ「垂れる形」は
// 頂点シェーダーが世界の z から高さを決める（毎フレームの頂点書き換えなし）。縫い目は InstancedMesh 1 つ。
import { P } from './params.js';

const f = (v) => v.toFixed(5);

/** 布と縫い目の材質に、垂れ（uDrape）とはためき（uFlutter）を足す。NaN が出ない式だけを使う。 */
function patchDrape(material, uniforms) {
  const C = P.cloth, HH = P.PLATE_Y + C.lift - C.tableY;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDrape = uniforms.uDrape;
    shader.uniforms.uFlutter = uniforms.uFlutter;
    shader.uniforms.uHeroTime = uniforms.uHeroTime;
    shader.uniforms.uFold = uniforms.uFold;
    shader.uniforms.uFoldAt = uniforms.uFoldAt;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uDrape; uniform float uFlutter; uniform float uHeroTime; uniform float uFold; uniform float uFoldAt;
float heroS(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float heroDS(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return 6.0 * t * (1.0 - t) / (e1 - e0); }
// 台の上で 1、机の上で 0（前は ${f(C.frontZ0)}→${f(C.frontZ1)}、奥は ${f(C.backZ0)}→${f(C.backZ1)} で下りる）
float heroH(float z) { return ${f(HH)} * (1.0 - heroS(${f(C.frontZ0)}, ${f(C.frontZ1)}, z)) * heroS(${f(C.backZ1)}, ${f(C.backZ0)}, z); }
float heroDH(float z) { return ${f(HH)} * ((1.0 - heroS(${f(C.frontZ0)}, ${f(C.frontZ1)}, z)) * heroDS(${f(C.backZ1)}, ${f(C.backZ0)}, z) - heroDS(${f(C.frontZ0)}, ${f(C.frontZ1)}, z) * heroS(${f(C.backZ1)}, ${f(C.backZ0)}, z)); }`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
{
  vec4 heroN = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    heroN = instanceMatrix * heroN;
  #endif
  heroN = modelMatrix * heroN;
  transformedNormal -= uDrape * heroDH( heroN.z ) * viewMatrix[ 2 ].xyz;
  transformedNormal /= max( length( transformedNormal ), 1e-4 );
}`)
      .replace('#include <project_vertex>', `vec4 heroP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  heroP = instanceMatrix * heroP;
#endif
// ひもに掛けるときの二つ折り：uFoldAt より先を、折り目のまわりに裏へ回す（uFold 0→1 で 0°→180°）
float heroD = max( heroP.z - uFoldAt, 0.0 );
float heroA = uFold * 3.14159265;
heroP.z -= heroD * ( 1.0 - cos( heroA ) );
heroP.y -= heroD * sin( heroA ) + 0.004 * uFold * step( 1e-5, heroD );
heroP.y += uFlutter * 0.012 * sin( heroP.z * 20.0 - uHeroTime * 8.0 );
heroP = modelMatrix * heroP;
heroP.y += uDrape * heroH( heroP.z );
vec4 mvPosition = viewMatrix * heroP;
gl_Position = projectionMatrix * mvPosition;`);
  };
  material.customProgramCacheKey = () => 'hero-drape';
}

export function makeClothKit(THREE, kit, textures, timeUniform, hiddenMat) {
  const C = P.cloth;
  const geos = [];
  // 布：長さ方向に細かく割った板。先端（奥側の端）が原点、+Z へ伸びる。織り目は 0.2 m ごとにくり返す。
  const fabricGeo = new THREE.PlaneGeometry(C.w, C.len, 4, kit.seg(56, 28)).rotateX(-Math.PI / 2).translate(0, 0, C.len / 2);
  {
    // ふち（幅 hem）だけ色を少し濃くして、机の上でも布の形が分かるようにする（頂点色）。
    const uv = fabricGeo.attributes.uv, p = fabricGeo.attributes.position, col = new Float32Array(p.count * 3), hw = C.w / 2, eps = 1e-5;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (Math.abs(Math.abs(x) - hw / 2) < eps) p.setX(i, Math.sign(x) * (hw - C.hem));
      uv.setXY(i, (p.getX(i) / C.w + 0.5) * (C.w / 0.2), uv.getY(i) * (C.len / 0.2));
      const edge = Math.abs(x) > hw - eps || p.getZ(i) < eps || p.getZ(i) > C.len - eps;
      col[i * 3] = 1; col[i * 3 + 1] = edge ? 0.62 : 1; col[i * 3 + 2] = edge ? 0.72 : 1;
    }
    fabricGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  // 縫い目：かまぼこ形の短い糸（長さ 1 を行列で伸ばす）
  const stitchGeo = new THREE.CylinderGeometry(C.stitchW / 2, C.stitchW / 2, 1, 6, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, C.stitchH / (C.stitchW / 2), 1);
  stitchGeo.deleteAttribute('uv');
  const proxyGeo = new THREE.BoxGeometry(C.w + 0.05, 0.05, C.len + 0.03).translate(0, 0.02, C.len / 2);
  geos.push(fabricGeo, stitchGeo, proxyGeo);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

  /** look = { tex: 'linen'|'floral', tint: [r,g,b], thread } */
  function make(look) {
    const u = { uDrape: { value: 1 }, uFlutter: { value: 0 }, uHeroTime: timeUniform, uFold: { value: 0 }, uFoldAt: { value: C.len } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: textures[look.tex] || textures.linen || null, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const stitchMat = new THREE.MeshStandardMaterial({ color: look.thread, roughness: 0.7, metalness: 0 });
    mat.color.setRGB(look.tint[0], look.tint[1], look.tint[2]);   // 生成りの織り目に掛ける色（1 を超えると明るくなる）
    patchDrape(mat, u); patchDrape(stitchMat, u);
    const group = new THREE.Group(); group.name = 'cloth';
    const mesh = new THREE.Mesh(fabricGeo, mat); mesh.frustumCulled = false; group.add(mesh);
    const stitches = new THREE.InstancedMesh(stitchGeo, stitchMat, C.maxStitch);
    stitches.count = 0; stitches.position.y = 0.0002; stitches.frustumCulled = false; group.add(stitches);
    const proxy = new THREE.Mesh(proxyGeo, hiddenMat); proxy.userData.part = 'fabric'; group.add(proxy);
    return { group, mat, stitchMat, stitches, proxy, u, look };
  }

  /** 縫い目を n 本まで置く。k 本目は 点 k−1 → 点 k（0 本目は縫い始めの玉）。 */
  function lay(cloth, pts, n) {
    const st = cloth.stitches;
    n = Math.min(n, C.maxStitch, pts.length);
    for (let k = st.count; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[k];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      q.setFromAxisAngle(yAxis, len > 1e-6 ? Math.atan2(dx, dz) : 0);
      pos.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
      scl.set(1, 1, Math.max(len, 0.002) + 0.0012);
      m4.compose(pos, q, scl);
      st.setMatrixAt(k, m4);
    }
    if (n !== st.count) { st.count = n; st.instanceMatrix.needsUpdate = true; }
  }

  function dispose(cloth) {
    cloth.group.removeFromParent();
    cloth.mat.dispose(); cloth.stitchMat.dispose(); cloth.stitches.dispose();
  }

  return { make, lay, dispose, geos, height: P.PLATE_Y + C.lift - C.tableY };
}
