// The surrounding scene (everything that is not the hero): sky, far mountains, valley terrain,
// river, the machine's plateau, the three banks (islands) and trees. All low-poly and procedural.
import { TARGETS, WORLD, landingPoint } from './config.js';
import { mergeParts, rng, noise2, smooth } from './geo.js';

export const HORIZON = 0xacd1fc; // top colour of the mountain picture

const riverZ = (x) => -7.5 + 2.2 * Math.sin(x * 0.07 + 0.6);

/** Terrain height of the valley (not the mesas). */
export function groundHeight(x, z) {
  const base = WORLD.valleyY + 0.25 * noise2(x, z);
  const d = Math.abs(z - riverZ(x));
  let y = base + (-3.7 - base) * (1 - smooth((d - 5.5) / 4));
  const r = Math.hypot(x, z + 6);
  y += smooth((r - 42) / 60) * (3.5 + 2.5 * noise2(x * 0.4, z * 0.4));
  return y;
}

function skyMaterial(THREE, map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, horizon: { value: new THREE.Color(HORIZON) } },
    vertexShader: `
      varying vec2 vUv; varying float vElev;
      void main() {
        vUv = uv;
        vElev = position.y / 450.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    // no pow / normalize: nothing here can produce NaN
    fragmentShader: `
      uniform sampler2D map; uniform vec3 horizon;
      varying vec2 vUv; varying float vElev;
      void main() {
        vec3 tex = texture2D(map, vec2(vUv.x * 5.0, clamp(vElev, 0.0, 1.0) * 1.3)).rgb;
        float k = smoothstep(0.02, 0.30, vElev);
        gl_FragColor = vec4(mix(horizon, tex, k), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

/**
 * Mesa (flat-topped rock): top cap + grassy lip go to `tops`, cliff sides go to `sides`.
 * o: { cx, cz, rx, rzFront, rzBack, top, bottom, seed, segs, calmAngle }
 */
function mesa(THREE, o, tops, sides) {
  const R = rng(o.seed);
  const segs = o.segs || 28;
  const ring = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i % segs) / segs * Math.PI * 2;
    // keep the edge facing the machine exact (no wobble) so landing distances stay true
    let da = Math.abs(Math.atan2(Math.sin(a - o.calmAngle), Math.cos(a - o.calmAngle)));
    const calm = o.calmAngle === undefined ? 1 : smooth((da - 0.5) / 0.5);
    const j = i % segs === 0 && i > 0 ? ring[0].j : 1 + 0.12 * R() * calm;
    const rz = Math.sin(a) > 0 ? o.rzBack : o.rzFront;
    ring.push({ a, j, x: Math.cos(a) * o.rx, z: Math.sin(a) * rz });
  }
  const topPos = [], topUv = [];
  const lipY = o.top - 0.16;
  for (let i = 0; i < segs; i++) {
    const a = ring[i], b = ring[i + 1];
    const ax = o.cx + a.x * a.j, az = o.cz + a.z * a.j, bx = o.cx + b.x * b.j, bz = o.cz + b.z * b.j;
    // top fan (counter-clockwise seen from above => normal +Y)
    topPos.push(o.cx, o.top, o.cz, bx, o.top, bz, ax, o.top, az);
    // lip (slight bevel)
    const ax2 = o.cx + a.x * (a.j + 0.05), az2 = o.cz + a.z * (a.j + 0.05);
    const bx2 = o.cx + b.x * (b.j + 0.05), bz2 = o.cz + b.z * (b.j + 0.05);
    topPos.push(ax, o.top, az, bx, o.top, bz, bx2, lipY, bz2, ax, o.top, az, bx2, lipY, bz2, ax2, lipY, az2);
  }
  for (let k = 0; k < topPos.length; k += 3) topUv.push(topPos[k] / 4, topPos[k + 2] / 4);
  tops.push({ pos: topPos, uv: topUv });

  // sides: three bands flaring outward toward the bottom
  const rows = [
    { y: lipY, f: 0.05 },
    { y: lipY + (o.bottom - lipY) * 0.45, f: 0.09 },
    { y: o.bottom, f: 0.16 },
  ];
  const sidePos = [], sideUv = [];
  let per = [0];
  for (let i = 1; i <= segs; i++) {
    const a = ring[i - 1], b = ring[i];
    per.push(per[i - 1] + Math.hypot(b.x * b.j - a.x * a.j, b.z * b.j - a.z * a.j));
  }
  const vtx = (i, r, wob) => {
    const p = ring[i];
    const s = p.j + rows[r].f + wob;
    return [o.cx + p.x * s, rows[r].y, o.cz + p.z * s, per[i] / 3, rows[r].y / 3];
  };
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < segs; i++) {
      // the same wobble for a ring vertex in both bands that share it (no cracks)
      const wob = (row, k) => (row === 0 ? 0 : 0.08 * Math.sin((k % segs) * 1.7 + row * 3 + o.seed));
      const a0 = vtx(i, r, wob(r, i)), b0 = vtx(i + 1, r, wob(r, i + 1)), a1 = vtx(i, r + 1, wob(r + 1, i)), b1 = vtx(i + 1, r + 1, wob(r + 1, i + 1));
      for (const v of [a0, b1, a1, a0, b0, b1]) { sidePos.push(v[0], v[1], v[2]); sideUv.push(v[3], v[4]); }
    }
  }
  sides.push({ pos: sidePos, uv: sideUv });
}

function geoFrom(THREE, chunks, colorFn) {
  const pos = [].concat(...chunks.map((c) => c.pos));
  const uv = [].concat(...chunks.map((c) => c.uv));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorFn) {
    const col = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) colorFn(pos[i], pos[i + 1], pos[i + 2], col, i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function groundChunk(size, seg) {
  const pos = [], uv = [];
  const h = (i, j) => {
    const x = -size / 2 + (i / seg) * size, z = -size / 2 + (j / seg) * size - 6;
    return [x, groundHeight(x, z), z];
  };
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    for (const v of [a, c, b, b, c, d]) { pos.push(...v); uv.push(v[0] / 4, v[2] / 4); }
  }
  return { pos, uv };
}

/** Builds the scene. Returns handles the game needs (island info for decorations). */
export function buildWorld(THREE, tex) {
  const group = new THREE.Group();
  group.name = 'world';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // --- sky dome + far mountain band (far away: 512² textures, very few triangles)
  const skyGeo = keep(new THREE.SphereGeometry(450, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.56));
  const sky = new THREE.Mesh(skyGeo, keep(skyMaterial(THREE, tex.sky)));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  tex.mountains.repeat.set(6, 1);
  const bandGeo = keep(new THREE.CylinderGeometry(300, 300, 90, 48, 1, true));
  const band = new THREE.Mesh(bandGeo, keep(new THREE.MeshBasicMaterial({ map: tex.mountains, side: THREE.BackSide, fog: true })));
  band.position.y = -22 + 45; // mountain tops reach ~8° above the horizon
  band.renderOrder = -9;
  group.add(band);

  // --- terrain: valley ground + mesas, merged per material
  const tops = [groundChunk(300, 44)];
  const sides = [];
  // machine plateau (top y=0, the hero stands at the origin)
  mesa(THREE, { cx: 0, cz: 1.0, rx: 3.0, rzFront: 3.2, rzBack: 5.4, top: 0, bottom: -3.9, seed: 7, segs: 32, calmAngle: -Math.PI / 2 }, tops, sides);
  const islands = [];
  const v = new THREE.Vector3();
  TARGETS.forEach((t, k) => {
    landingPoint(t, v);
    const dir = new THREE.Vector3(-Math.sin(t.yaw), 0, -Math.cos(t.yaw));
    const R = t.islandRadius;
    const c = v.clone().addScaledVector(dir, R - 0.5);
    const isFar = t.id === 'C';
    const rx = isFar ? R * 1.5 : R, rz = R;
    // calm edge faces the machine
    const calm = Math.atan2(-c.z, -c.x);
    mesa(THREE, { cx: c.x, cz: c.z, rx, rzFront: rz, rzBack: rz * (isFar ? 1.3 : 1), top: t.height, bottom: -3.9, seed: 31 + k * 17, segs: 26, calmAngle: calm }, tops, sides);
    islands.push({ target: t, landing: v.clone(), dir, center: c, radius: R });
  });

  const grassMat = keep(new THREE.MeshLambertMaterial({ map: tex.grass, vertexColors: true, color: 0xe4ecc8 }));
  const grassGeo = keep(geoFrom(THREE, tops, (x, y, z, col, i) => {
    // under water: sandy; low banks: a bit darker; high hills: lighter
    const wet = 1 - smooth((y + 3.2) / 0.6);
    const far = smooth((Math.hypot(x, z + 6) - 30) / 90);   // distant meadows: lighter, hazier
    const patch = 0.5 + 0.5 * noise2(x * 2.3 + 11, z * 2.3 - 7); // meadow patches
    const k = 0.86 + 0.14 * patch;
    col[i] = (k + far * 0.18 + wet * 0.05) * (1 - 0.1 * (1 - patch));
    col[i + 1] = k * (1 - wet * 0.25) + far * 0.06;
    col[i + 2] = k * (1 - wet * 0.45) * 0.9 + far * 0.32;
  }));
  const ground = new THREE.Mesh(grassGeo, grassMat);
  ground.name = 'ground';
  group.add(ground);

  const cliffMat = keep(new THREE.MeshLambertMaterial({ map: tex.cliff, color: 0xf2e6d8 }));
  const cliffs = new THREE.Mesh(keep(geoFrom(THREE, sides)), cliffMat);
  cliffs.name = 'cliffs';
  group.add(cliffs);

  // --- river
  tex.water.repeat.set(52, 7);
  const water = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(300, 40)),
    keep(new THREE.MeshPhongMaterial({ map: tex.water, shininess: 60, specular: 0x406080, color: 0xe8f6ff })),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WORLD.waterY, -8);
  water.name = 'water';
  group.add(water);

  // --- trees (one InstancedMesh)
  const treeGeo = keep(mergeParts(THREE, [
    { geo: new THREE.CylinderGeometry(0.12, 0.18, 0.8, 5), matrix: new THREE.Matrix4().makeTranslation(0, 0.4, 0), color: new THREE.Color(0x8a5a35) },
    { geo: new THREE.ConeGeometry(0.85, 1.6, 7), matrix: new THREE.Matrix4().makeTranslation(0, 1.4, 0), color: new THREE.Color(0x4f9a3c) },
    { geo: new THREE.ConeGeometry(0.62, 1.2, 7), matrix: new THREE.Matrix4().makeTranslation(0, 2.2, 0), color: new THREE.Color(0x5fb048) },
  ]));
  const treeSpots = [];
  const R = rng(99);
  const blocked = (x, z) => {
    if (Math.hypot(x, z - 1.0) < 7.5) return true; // plateau + camera
    if (z > 3 && Math.abs(x) < 9) return true; // keep the camera's view clear
    for (const is of islands) if (Math.hypot(x - is.center.x, z - is.center.z) < is.radius * 1.6 + 1.5) return true;
    if (Math.abs(z - riverZ(x)) < 7.5) return true;
    return false;
  };
  let guard = 0;
  while (treeSpots.length < 46 && guard++ < 2000) {
    const a = R() * Math.PI * 2, r = 12 + R() * 48;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 6;
    if (blocked(x, z)) continue;
    treeSpots.push([x, groundHeight(x, z) - 0.05, z, 0.8 + R() * 0.9]);
  }
  // a few trees on the islands (away from landing and train)
  islands.forEach((is, k) => {
    const side = new THREE.Vector3(-is.dir.z, 0, is.dir.x);
    for (const s of [1, -1]) {
      const p = is.center.clone().addScaledVector(side, s * is.radius * 0.62).addScaledVector(is.dir, 0.6);
      treeSpots.push([p.x, is.target.height, p.z, 0.55 + 0.1 * k]);
    }
  });
  const treeMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeSpots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  treeSpots.forEach((t, i) => {
    q.setFromAxisAngle(yAxis, t[0] * 3.1);
    sc.set(t[3], t[3] * (0.9 + 0.3 * Math.abs(Math.sin(i * 7.7))), t[3]);
    trees.setMatrixAt(i, m.compose(p.set(t[0], t[1], t[2]), q, sc));
  });
  trees.computeBoundingSphere();
  trees.name = 'trees';
  group.add(trees);

  // --- lights (no shadow maps)
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x7a8f55, 1.5);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-7, 12, 9);
  group.add(hemi, sun);

  const fog = new THREE.Fog(HORIZON, 70, 430);

  return {
    group,
    fog,
    islands,
    water,
    update(dt) {
      tex.water.offset.x = (tex.water.offset.x + dt * 0.012) % 1;
      tex.water.offset.y = (tex.water.offset.y + dt * 0.004) % 1;
    },
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
