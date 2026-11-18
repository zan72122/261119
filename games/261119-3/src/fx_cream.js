// fx_cream.js — fresh cream effects: bowl cream, pour stream, cake coat, flung splats.
import * as THREE from 'three';

const CREAM_HEX = 0xf3eadb;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, s = 0) {
  return vnoise(x, y, s) * 0.55 + vnoise(x * 2.13, y * 2.13, s + 7) * 0.3 + vnoise(x * 4.37, y * 4.37, s + 13) * 0.15;
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Index buffer for a polar grid: vertex 0 = centre, rings 1..NR with NS sectors (wrapped).
function polarIndices(NR, NS) {
  const idx = [];
  for (let j = 0; j < NS; j++) idx.push(0, 1 + ((j + 1) % NS), 1 + j);
  for (let i = 1; i < NR; i++) {
    const r0 = 1 + (i - 1) * NS, r1 = 1 + i * NS;
    for (let j = 0; j < NS; j++) {
      const j1 = (j + 1) % NS;
      const a = r0 + j, b = r0 + j1, c = r1 + j, d = r1 + j1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return idx;
}

// Static polar geometry; fn(u, theta, out:Vector3) fills the position.
function polarGeometry(NR, NS, fn) {
  const count = 1 + NR * NS;
  const pos = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  fn(0, 0, v); pos[0] = v.x; pos[1] = v.y; pos[2] = v.z;
  for (let i = 1; i <= NR; i++) {
    for (let j = 0; j < NS; j++) {
      fn(i / NR, (j / NS) * TAU, v);
      const k = (1 + (i - 1) * NS + j) * 3;
      pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(polarIndices(NR, NS));
  g.computeVertexNormals();
  return g;
}

function mergeGeos(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// whip: 0 liquid (glossy) .. 1 whipped (satin)
function creamMaterial(whip) {
  const m = new THREE.MeshPhysicalMaterial({
    color: CREAM_HEX, metalness: 0, roughness: 0.22,
    clearcoat: 0.3, clearcoatRoughness: 0.12,
    sheen: 0.02, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xfff2df),
  });
  setCreamWhip(m, whip);
  m.onBeforeCompile = creamShaderPatch;
  m.customProgramCacheKey = () => 'cream';
  return m;
}
// Cream is bright; tone the diffuse environment light down a little so the
// key light's shading keeps the shape readable (does not touch reflections).
function creamShaderPatch(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tiblIrradiance *= 0.55;');
}
function setCreamWhip(m, k) {
  m.roughness = 0.22 + 0.33 * k;
  m.clearcoat = Math.max(0.01, 0.32 * (1 - k)); // never cross 0 (avoids shader recompiles)
  m.sheen = Math.max(0.01, 0.3 * k);
}

// ===================================================================== BOWL
export function createBowlCream(opts = {}) {
  const innerR = opts.innerRadiusAt || ((y) => { const q = (0.098 - y) / 0.09; return 0.128 * Math.sqrt(Math.max(0, 1 - q * q)); });
  const N = 48, EXT = 0.13, DX = (2 * EXT) / (N - 1), INV = 1 / DX;
  const H = new Float32Array(N * N), V = new Float32Array(N * N), T = new Float32Array(N * N), G = new Float32Array(N * N);
  const LUMP = new Float32Array(N * N), CD = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -EXT + i * DX, z = -EXT + j * DX;
    CD[j * N + i] = Math.hypot(x, z);
    LUMP[j * N + i] = (fbm(x * 38 + 3.1, z * 38 - 1.7, 5) - 0.5) * 2;
  }
  const NR = 30, NS = 72;
  const VC = 1 + (NR + 1) * NS;
  const pos = new Float32Array(VC * 3), nor = new Float32Array(VC * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const norAttr = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr); geo.setAttribute('normal', norAttr);
  geo.setIndex(polarIndices(NR + 1, NS));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.05, 0), 0.16);
  const cosT = new Float32Array(NS), sinT = new Float32Array(NS);
  for (let j = 0; j < NS; j++) { cosT[j] = Math.cos((j / NS) * TAU); sinT[j] = Math.sin((j / NS) * TAU); }

  const mat = creamMaterial(0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const object = new THREE.Group();
  object.name = 'bowlCream';
  object.add(mesh);

  // little peaks ("tsuno") left when the beaters leave stiff cream
  const peakPts = [];
  const pp = [[0.0105, -0.004], [0.0095, -0.0005], [0.0072, 0.002], [0.0050, 0.0045], [0.0033, 0.0072], [0.0019, 0.0098], [0.0009, 0.0118], [0.0003, 0.0129], [0, 0.0132]];
  for (const p of pp) peakPts.push(new THREE.Vector2(p[0], p[1]));
  const peakGeo = new THREE.LatheGeometry(peakPts, 18);
  {
    const pa = peakGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), f = Math.max(0, y / 0.0132 - 0.35) / 0.65;
      pa.setX(i, pa.getX(i) + 0.0042 * f * f);
      pa.setY(i, y - 0.0012 * f * f * f);
    }
    peakGeo.computeVertexNormals();
  }
  const MAXP = 8;
  const peaks = [];
  for (let i = 0; i < MAXP; i++) {
    const m = new THREE.Mesh(peakGeo, mat);
    m.visible = false; m.castShadow = true; m.receiveShadow = true;
    object.add(m);
    peaks.push({ mesh: m, x: 0, z: 0, s: 1, grow: 1 });
  }
  let peakNext = 0;

  // smears clinging to the wall after takeOut
  const smearGeo = makeSplatGeo(5);
  const smears = [];
  const srnd = mulberry32(77);
  const tmpN = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(smearGeo, mat);
    m.visible = false; m.receiveShadow = true;
    const ang = (i / 5) * TAU + srnd() * 0.9;
    const y = 0.018 + srnd() * 0.038;
    const r = innerR(y) - 0.0012;
    m.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
    // ellipse wall normal (inward)
    tmpN.set(-Math.cos(ang) * r / (0.128 * 0.128), -(y - 0.098) / (0.09 * 0.09), -Math.sin(ang) * r / (0.128 * 0.128)).normalize();
    tmpQ.setFromUnitVectors(upV, tmpN);
    tmpQ2.setFromAxisAngle(upV, srnd() * TAU);
    m.quaternion.copy(tmpQ).multiply(tmpQ2);
    m.scale.set(0.018 + srnd() * 0.012, 0.012, 0.03 + srnd() * 0.02);
    object.add(m);
    smears.push(m);
  }

  const st = {
    fill: 0, k: 0, time: 0, L: 0.012, R: 0.04,
    stirring: false, lastStirT: -10, lastCx: 0, lastCz: 0, hasLast: false, phase: 0,
    pourX: 0, pourZ: 0, pourT: -10, fillRiseT: -10,
    taking: -1, takeFromL: 0, taken: false, matK: -1,
  };

  function idealLevel() {
    const L0 = 0.012 + st.fill * 0.05;
    return 0.008 + (L0 - 0.008) * (1 + 0.35 * st.k);
  }
  function sample(arr, x, z) {
    let fx = (x + EXT) * INV, fz = (z + EXT) * INV;
    fx = clamp(fx, 0, N - 1.001); fz = clamp(fz, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, o = j * N + i;
    const a = arr[o], b = arr[o + 1], c = arr[o + N], d = arr[o + N + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  function men(u) {
    if (u < 0.88) return 0;
    const q = (u - 0.88) / 0.12;
    return q * q * (0.0016 * (1 - st.k) + 0.0028 * st.k);
  }
  function menD(u) {
    if (u < 0.88) return 0;
    const q = (u - 0.88) / 0.12;
    return (2 * q / 0.12) * (0.0016 * (1 - st.k) + 0.0028 * st.k);
  }

  function spawnPeak(x, z, amp) {
    const p = peaks[peakNext]; peakNext = (peakNext + 1) % MAXP;
    p.x = x; p.z = z; p.s = amp * (0.75 + Math.random() * 0.45); p.grow = 0;
    p.mesh.rotation.set(0, Math.random() * TAU, 0);
    p.mesh.visible = true;
    // blend the base into the surface
    addBump(x, z, 0.0065, 0.0025 * amp);
  }
  function addBump(x, z, sig, amp) {
    const i0 = Math.max(1, Math.floor((x - 3 * sig + EXT) * INV)), i1 = Math.min(N - 2, Math.ceil((x + 3 * sig + EXT) * INV));
    const j0 = Math.max(1, Math.floor((z - 3 * sig + EXT) * INV)), j1 = Math.min(N - 2, Math.ceil((z + 3 * sig + EXT) * INV));
    const s2 = 1 / (2 * sig * sig);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = -EXT + i * DX - x, dz = -EXT + j * DX - z;
      H[j * N + i] += amp * Math.exp(-(dx * dx + dz * dz) * s2);
    }
  }

  const RB = 0.016; // beater cage radius
  function applyBeater(bx, bz, vx, vz, power, dt) {
    const k = st.k, wl = (1 - k) * (1 - k), wk = smoothstep(0.15, 0.9, k);
    const ext = RB * 2.4;
    const i0 = Math.max(1, Math.floor((bx - ext + EXT) * INV)), i1 = Math.min(N - 2, Math.ceil((bx + ext + EXT) * INV));
    const j0 = Math.max(1, Math.floor((bz - ext + EXT) * INV)), j1 = Math.min(N - 2, Math.ceil((bz + ext + EXT) * INV));
    const lim = st.R * 0.97;
    const speed = Math.hypot(vx, vz);
    const dimple = -(0.0035 + 0.006 * power) * power;
    const carve = -(0.004 + 0.011 * k) * Math.min(1, power * 1.6);
    let removed = 0, wsum = 0;
    const sub = Math.min(1, dt * 14);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = j * N + i;
      if (CD[o] > lim) continue;
      const dx = -EXT + i * DX - bx, dz = -EXT + j * DX - bz;
      const q = Math.sqrt(dx * dx + dz * dz) / RB;
      if (q < 1) {
        const f = 1 - q * q * 0.5;
        // liquid vortex dimple
        if (wl > 0.001) { H[o] += (dimple * f - H[o]) * sub * wl; V[o] *= 1 - 0.5 * wl; }
        // thick: carve a track, remember the removed volume
        if (wk > 0.001) {
          const tg = carve * f;
          if (H[o] > tg) { const dh = (H[o] - tg) * sub * wk; H[o] -= dh; removed += dh; }
          V[o] *= 0.5;
        }
      } else if (q < 2.3) {
        const fall = Math.sin(((q - 1) / 1.3) * Math.PI);
        if (wl > 0.001) {
          const ang = Math.atan2(dz, dx);
          V[o] += wl * power * dt * (2.2 * Math.sin(3 * ang - st.phase + q * 2.2) + (Math.random() - 0.5) * 3.0) * fall * 0.3;
        }
        // ridges pile more in front of the motion
        let front = 1;
        if (speed > 0.01) front = 1 + 0.6 * ((dx * vx + dz * vz) / (q * RB * speed));
        wsum += fall * front;
      }
    }
    if (removed > 0 && wsum > 0) {
      const per = (removed / wsum) * 0.95;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const o = j * N + i;
        if (CD[o] > lim) continue;
        const dx = -EXT + i * DX - bx, dz = -EXT + j * DX - bz;
        const q = Math.sqrt(dx * dx + dz * dz) / RB;
        if (q <= 1 || q >= 2.3) continue;
        const fall = Math.sin(((q - 1) / 1.3) * Math.PI);
        let front = 1;
        if (speed > 0.01) front = 1 + 0.6 * ((dx * vx + dz * vz) / (q * RB * speed));
        H[o] = Math.min(0.0095, H[o] + per * fall * front);
      }
    }
    // drag the surface along with the beaters (semi-Lagrangian)
    const dragW = 1 - 0.8 * k;
    if (speed > 0.005 && dragW > 0.05) {
      T.set(H);
      const dragK = 0.7 * dragW * dt;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const o = j * N + i;
        if (CD[o] > lim) continue;
        const x = -EXT + i * DX, z = -EXT + j * DX;
        const dx = x - bx, dz = z - bz;
        const q = Math.sqrt(dx * dx + dz * dz) / RB;
        if (q > 2.3) continue;
        const f = q < 1 ? 1 : 1 - (q - 1) / 1.3;
        H[o] = sample(T, x - vx * dragK * f, z - vz * dragK * f);
      }
    }
    // beaters destroy peaks they pass
    for (let p = 0; p < MAXP; p++) {
      const pk = peaks[p];
      if (pk.mesh.visible && (pk.x - bx) * (pk.x - bx) + (pk.z - bz) * (pk.z - bz) < RB * RB * 1.6) pk.mesh.visible = false;
    }
  }

  const lastB = [0, 0, 0, 0];
  function stir(x, z, power, dt) {
    if (st.fill <= 0.001 || st.taken) return;
    dt = Math.max(1e-3, Math.min(dt || 1 / 30, 0.05));
    power = clamp01(power);
    const maxC = Math.max(0, st.R - 0.036);
    const d = Math.hypot(x, z);
    if (d > maxC) { x *= maxC / d; z *= maxC / d; }
    let vx = 0, vz = 0;
    const fresh = !st.hasLast || st.time - st.lastStirT > 0.15;
    const jump = !fresh && Math.hypot(x - st.lastCx, z - st.lastCz) > 0.045;
    if (jump && st.k > 0.55) { spawnPeak(lastB[0], lastB[1], st.k); spawnPeak(lastB[2], lastB[3], st.k); }
    if (!fresh && !jump) { vx = (x - st.lastCx) / dt; vz = (z - st.lastCz) / dt; const sp = Math.hypot(vx, vz); if (sp > 1.5) { vx *= 1.5 / sp; vz *= 1.5 / sp; } }
    st.phase += dt * 40 * (0.3 + power);
    applyBeater(x - 0.018, z, vx, vz, power, dt);
    applyBeater(x + 0.018, z, vx, vz, power, dt);
    lastB[0] = x - 0.018; lastB[1] = z; lastB[2] = x + 0.018; lastB[3] = z;
    st.lastCx = x; st.lastCz = z; st.hasLast = true;
    st.lastStirT = st.time; st.stirring = power > 0.05;
  }

  function simulate(dt) {
    const k = st.k;
    const sub = 2, h = dt / sub;
    const c = 0.21 * Math.pow(1 - k, 1.5);
    const c2 = (c * c) / (DX * DX);
    const damp = 2.5 + 14 * k;
    const relax = k < 0.5 ? 9 + (0.8 - 9) * (k / 0.5) : 0.8 * Math.pow(1 - (k - 0.5) / 0.5, 2.5);
    const diff = Math.min(0.2, (0.04 + 2.5 * (1 - k) * (1 - k)) * h);
    const lim = st.R * 0.985;
    // keep the mean level (volume) stable
    let sum = 0, cnt = 0;
    for (let o = 0; o < N * N; o++) if (CD[o] <= lim) { sum += H[o]; cnt++; }
    if (cnt) { const m = (sum / cnt) * Math.min(1, dt * 3); for (let o = 0; o < N * N; o++) if (CD[o] <= lim) H[o] -= m; }
    for (let s = 0; s < sub; s++) {
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const o = j * N + i;
          if (CD[o] > lim) { H[o] = 0; V[o] = 0; continue; }
          const lap = H[o - 1] + H[o + 1] + H[o - N] + H[o + N] - 4 * H[o];
          if (c2 > 0) V[o] = (V[o] + c2 * lap * h) * (1 - damp * h);
          T[o] = lap;
        }
      }
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const o = j * N + i;
          if (CD[o] > lim) continue;
          H[o] += V[o] * h + T[o] * diff * 0.25 - H[o] * relax * h;
        }
      }
    }
  }

  function updateMaterial() {
    const k = st.k;
    if (Math.abs(k - st.matK) > 0.004) { setCreamWhip(mat, k); st.matK = k; }
  }

  function rebuild() {
    const k = st.k, L = st.L, R = st.R;
    let tk = 1; // takeOut fade of surface shape
    if (st.taking >= 0) tk = 1 - easeInOut(Math.min(1, st.taking / 0.5));
    if (st.taken && st.taking < 0) tk = 0;
    const kk = k * k;
    for (let o = 0; o < N * N; o++) {
      const u = CD[o] / R;
      if (u >= 1.05) { G[o] = 0; continue; }
      const uc = Math.min(1, u);
      const edge = 1 - uc * uc * uc * uc;
      const mound = k * 0.0065 * (1 - uc * uc) + kk * 0.0032 * LUMP[o] * edge;
      G[o] = (H[o] + mound) * tk + (1 - tk) * (0.0016 * LUMP[o] + 0.0012 * (1 - uc * uc)) * edge;
    }
    // vertices
    const e = DX * 0.9;
    // centre
    {
      const h0 = sample(G, 0, 0);
      pos[0] = 0; pos[1] = L + h0; pos[2] = 0;
      const gx = (sample(G, e, 0) - sample(G, -e, 0)) / (2 * e), gz = (sample(G, 0, e) - sample(G, 0, -e)) / (2 * e);
      const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      nor[0] = -gx * il; nor[1] = il; nor[2] = -gz * il;
    }
    for (let i = 1; i <= NR; i++) {
      const u = i / NR, r = u * R;
      const m = men(u), md = menD(u) / R;
      for (let j = 0; j < NS; j++) {
        const cx = cosT[j], sz = sinT[j];
        const x = r * cx, z = r * sz;
        const y = L + sample(G, x, z) + m;
        const v = 1 + (i - 1) * NS + j, o = v * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        const gx = (sample(G, x + e, z) - sample(G, x - e, z)) / (2 * e) + md * cx;
        const gz = (sample(G, x, z + e) - sample(G, x, z - e)) / (2 * e) + md * sz;
        const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        nor[o] = -gx * il; nor[o + 1] = il; nor[o + 2] = -gz * il;
      }
    }
    // skirt down along the wall (hides gaps when waves dip at the edge)
    const ys = L - 0.007, rs = innerR(ys) * 0.965;
    for (let j = 0; j < NS; j++) {
      const v = 1 + NR * NS + j, o = v * 3, on = (v - NS) * 3;
      pos[o] = rs * cosT[j]; pos[o + 1] = ys; pos[o + 2] = rs * sinT[j];
      nor[o] = nor[on]; nor[o + 1] = nor[on + 1]; nor[o + 2] = nor[on + 2];
    }
    posAttr.needsUpdate = true; norAttr.needsUpdate = true;
    // peaks follow the surface
    for (let p = 0; p < MAXP; p++) {
      const pk = peaks[p];
      if (!pk.mesh.visible) continue;
      const g = pk.grow < 1 ? easeInOut(pk.grow) : 1;
      const s = pk.s * g * tk;
      if (s < 0.02) { pk.mesh.scale.setScalar(0.0001); } else pk.mesh.scale.set(s, s * (0.85 + 0.3 * g), s);
      pk.mesh.position.set(pk.x, L + sample(G, pk.x, pk.z) - 0.0008, pk.z);
    }
  }

  function update(dt, t) {
    dt = Math.min(dt, 0.05);
    st.time += dt;
    object.visible = st.fill > 0.001;
    if (!object.visible) return;
    // beaters left the cream → pull up little peaks
    if (st.stirring && st.time - st.lastStirT > 0.12) {
      st.stirring = false;
      if (st.k > 0.55 && !st.taken) { spawnPeak(lastB[0], lastB[1], st.k); spawnPeak(lastB[2], lastB[3], st.k); }
    }
    if (st.time - st.lastStirT > 0.12) st.hasLast = false;
    for (let p = 0; p < MAXP; p++) if (peaks[p].grow < 1) peaks[p].grow = Math.min(1, peaks[p].grow + dt / 0.18);
    // level
    if (st.taking >= 0) {
      st.taking += dt;
      const p = easeInOut(Math.min(1, st.taking / 0.5));
      st.L = st.takeFromL + (0.0125 - st.takeFromL) * p;
      if (st.taking >= 0.5) { st.taking = -1; st.L = 0.0125; H.fill(0); V.fill(0); for (const pk of peaks) pk.mesh.visible = false; }
      for (let i = 0; i < smears.length; i++) {
        const sm = smears[i];
        sm.visible = sm.position.y < st.takeFromL - 0.002;
      }
    } else if (!st.taken) {
      st.L += (idealLevel() - st.L) * Math.min(1, dt * 6);
    }
    st.R = innerR(st.L) * 0.975;
    // pouring ripples
    if (st.time - st.fillRiseT < 0.12 && !st.taken) {
      const px = st.time - st.pourT < 0.5 ? st.pourX : 0, pz = st.time - st.pourT < 0.5 ? st.pourZ : 0;
      const i = Math.round((px + EXT) * INV), j = Math.round((pz + EXT) * INV);
      if (i > 1 && i < N - 2 && j > 1 && j < N - 2) {
        const imp = (Math.sin(st.time * 38) * 0.6 - 0.5) * 0.12 * (1 - st.k);
        const o = j * N + i;
        V[o] += imp; V[o + 1] += imp * 0.5; V[o - 1] += imp * 0.5; V[o + N] += imp * 0.5; V[o - N] += imp * 0.5;
        H[o] += -0.0012 * (1 - st.k) * dt * 30 * 0.1;
      }
    }
    if (!st.taken || st.taking >= 0) simulate(dt);
    updateMaterial();
    rebuild();
  }

  function setFill(f) {
    f = clamp01(f);
    if (f > st.fill + 1e-5) st.fillRiseT = st.time;
    if (st.fill <= 0.001 && f > 0.001) st.L = 0.012;
    st.fill = f;
  }
  function setThickness(k) { st.k = clamp01(k); }
  function pourAt(x, z) { st.pourX = x; st.pourZ = z; st.pourT = st.time; }
  function surfaceY() { return st.L + st.k * 0.0065 * (st.taken ? 0 : 1); }
  function takeOut() {
    if (st.taken) return;
    st.taken = true; st.taking = 0; st.takeFromL = st.L;
  }
  function reset() {
    st.fill = 0; st.k = 0; st.L = 0.012; st.taken = false; st.taking = -1; st.stirring = false; st.hasLast = false;
    H.fill(0); V.fill(0);
    for (const pk of peaks) pk.mesh.visible = false;
    for (const sm of smears) sm.visible = false;
    setCreamWhip(mat, 0); st.matK = 0;
    object.visible = false;
  }
  reset();

  return {
    object, setFill, setThickness, stir, update, surfaceY, takeOut, reset, pourAt,
    get fill() { return st.fill; },
    get thickness() { return st.k; },
  };
}

// =============================================================== POUR STREAM
export function createPourStream() {
  const SEG = 30, RAD = 10;
  const VC = (SEG + 1) * RAD + 2;
  const pos = new Float32Array(VC * 3), nor = new Float32Array(VC * 3);
  const geo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const nA = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pA); geo.setAttribute('normal', nA);
  const idx = [];
  for (let s = 0; s < SEG; s++) for (let r = 0; r < RAD; r++) {
    const r1 = (r + 1) % RAD;
    const a = s * RAD + r, b = s * RAD + r1, c = (s + 1) * RAD + r, d = (s + 1) * RAD + r1;
    idx.push(a, b, c, b, d, c);
  }
  const capTop = (SEG + 1) * RAD, capBot = capTop + 1;
  for (let r = 0; r < RAD; r++) { const r1 = (r + 1) % RAD; idx.push(capTop, r, r1); idx.push(capBot, SEG * RAD + r1, SEG * RAD + r); }
  geo.setIndex(idx);
  const mat = creamMaterial(0);
  const tube = new THREE.Mesh(geo, mat);
  tube.frustumCulled = false; tube.castShadow = true;
  const object = new THREE.Group();
  object.name = 'pourStream';
  object.add(tube);

  // splash droplets + crown ring
  const DMAX = 18;
  const dropGeo = new THREE.SphereGeometry(1, 10, 8);
  const drops = new THREE.InstancedMesh(dropGeo, mat, DMAX);
  drops.frustumCulled = false; drops.count = 0;
  object.add(drops);
  const dP = new Float32Array(DMAX * 3), dV = new Float32Array(DMAX * 3), dS = new Float32Array(DMAX), dLive = new Uint8Array(DMAX);
  const ringGeo = new THREE.TorusGeometry(1, 0.22, 8, 28);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, mat);
  ring.visible = false;
  object.add(ring);
  // falling drips after the stream stops
  const drip = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(dropGeo, mat);
    m.visible = false; object.add(m);
    drip.push({ mesh: m, t0: 0, y: 0, v: 0, active: false });
  }

  const from = new THREE.Vector3(), to = new THREE.Vector3();
  const st = { on: false, head: 0, tail: 0, tOn: 0, tOff: 0, time: 0, offDrips: 0, spawnAcc: 0 };
  const C = new THREE.Vector3(), Tn = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), ref = new THREE.Vector3(), tmp = new THREE.Vector3();
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  function curve(s, out, t) {
    const dx = to.x - from.x, dz = to.z - from.z, dy = from.y - to.y;
    // horizontal: fast near the spout, slowing (stream bends down), y: gravity
    const hs = 1 - (1 - s) * (1 - s) * 0.35 - 0.65 * (1 - s);
    const hh = s * 0.55 + hs * 0.45;
    const w = 0.0011 * s * Math.sin(t * 9 + s * 8) * (1 - s * 0.5);
    out.set(from.x + dx * hh + w * -dz / (Math.hypot(dx, dz) + 1e-4), from.y - dy * s * s, from.z + dz * hh + w * dx / (Math.hypot(dx, dz) + 1e-4));
    return out;
  }
  function set(on, f, t2) {
    if (f) from.copy(f);
    if (t2) to.copy(t2);
    if (on && !st.on) { st.on = true; st.tOn = st.time; if (st.tail >= 1 || st.head <= 0) { st.head = 0; st.tail = 0; } st.tail = 0; }
    else if (!on && st.on) { st.on = false; st.tOff = st.time; st.offDrips = 0; }
  }

  function update(dt, t) {
    dt = Math.min(dt, 0.05);
    st.time += dt;
    if (st.on) {
      st.head = Math.min(1, st.head + dt / 0.15);
      st.tail = 0;
    } else {
      if (st.head > 0) {
        const e = st.time - st.tOff;
        st.tail = Math.min(1, Math.max(st.tail, (e / 0.2) * (e / 0.2) * 0.6 + e / 0.2 * 0.4));
        if (st.head < 1) st.head = Math.min(1, st.head + dt / 0.15);
        if (st.tail >= 1) { st.head = 0; st.tail = 0; }
        // drips
      }
      const e = st.time - st.tOff;
      for (let i = 0; i < 2; i++) {
        const dr = drip[i];
        if (st.offDrips === i && e > 0.28 + i * 0.35 && st.tOff > 0) {
          st.offDrips++;
          if (i === 1 && Math.random() < 0.35) continue;
          dr.active = true; dr.y = from.y - 0.004; dr.v = 0; dr.mesh.visible = true;
          dr.mesh.position.set(from.x, dr.y, from.z);
        }
      }
    }
    for (const dr of drip) {
      if (!dr.active) continue;
      dr.v -= 9.8 * dt; dr.y += dr.v * dt;
      const sp = -dr.v;
      dr.mesh.position.set(from.x + (to.x - from.x) * 0.15, dr.y, from.z + (to.z - from.z) * 0.15);
      dr.mesh.scale.set(0.0022, 0.0026 + sp * 0.002, 0.0022);
      if (dr.y < to.y) { dr.active = false; dr.mesh.visible = false; spawnSplash(3, 0.6); }
    }

    const visible = st.head > st.tail + 1e-3;
    tube.visible = visible;
    if (visible) {
      const s0 = st.tail, s1 = st.head;
      ref.set(-(to.z - from.z), 0, to.x - from.x);
      if (ref.lengthSq() < 1e-8) ref.set(1, 0, 0);
      ref.normalize();
      for (let si = 0; si <= SEG; si++) {
        const u = si / SEG;
        const s = s0 + (s1 - s0) * u;
        curve(s, C, t);
        curve(Math.min(1, s + 0.01), tmp, t);
        Tn.subVectors(tmp, C);
        if (Tn.lengthSq() < 1e-12) Tn.set(0, -1, 0);
        Tn.normalize();
        N1.copy(ref).addScaledVector(Tn, -ref.dot(Tn)).normalize();
        N2.crossVectors(Tn, N1);
        let rad = 0.0046 - 0.0024 * Math.sqrt(s);
        rad *= 1 + 0.06 * Math.sin(t * 23 + s * 30);
        if (s1 < 0.999) rad *= Math.sqrt(clamp01((s1 - s) / 0.05)) * 0.8 + 0.2 * clamp01((s1 - s) / 0.01);
        if (s0 > 0.001) rad *= 0.25 + 0.75 * Math.sqrt(clamp01((s - s0) / 0.12));
        for (let r = 0; r < RAD; r++) {
          const a = (r / RAD) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          const nx = ca * N1.x + sa * N2.x, ny = ca * N1.y + sa * N2.y, nz = ca * N1.z + sa * N2.z;
          const o = (si * RAD + r) * 3;
          pos[o] = C.x + (ca * N1.x * 1.0 + sa * N2.x * 0.8) * rad;
          pos[o + 1] = C.y + (ca * N1.y * 1.0 + sa * N2.y * 0.8) * rad;
          pos[o + 2] = C.z + (ca * N1.z * 1.0 + sa * N2.z * 0.8) * rad;
          nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
          if (si === 0) { const oc = capTop * 3; pos[oc] = C.x; pos[oc + 1] = C.y + rad * 0.3; pos[oc + 2] = C.z; nor[oc] = 0; nor[oc + 1] = 1; nor[oc + 2] = 0; }
          if (si === SEG) { const oc = capBot * 3; pos[oc] = C.x; pos[oc + 1] = C.y - rad * 0.6; pos[oc + 2] = C.z; nor[oc] = 0; nor[oc + 1] = -1; nor[oc + 2] = 0; }
        }
      }
      pA.needsUpdate = true; nA.needsUpdate = true;
    }
    // splash while the stream hits the surface
    const landing = visible && st.head >= 1 && st.tail < 0.95;
    if (landing) {
      st.spawnAcc += dt * 45;
      while (st.spawnAcc > 1) { st.spawnAcc -= 1; spawnSplash(1, 1); }
      ring.visible = true;
      const wob = 1 + 0.12 * Math.sin(t * 31) + 0.06 * Math.sin(t * 53);
      ring.position.set(to.x, to.y + 0.0006, to.z);
      ring.scale.set(0.0075 * wob, 0.0028, 0.0075 * (2 - wob));
    } else ring.visible = false;
    // droplets
    let n = 0;
    for (let i = 0; i < DMAX; i++) {
      if (!dLive[i]) continue;
      const o = i * 3;
      dV[o + 1] -= 9.8 * dt;
      dP[o] += dV[o] * dt; dP[o + 1] += dV[o + 1] * dt; dP[o + 2] += dV[o + 2] * dt;
      if (dP[o + 1] < to.y && dV[o + 1] < 0) { dLive[i] = 0; continue; }
      P.set(dP[o], dP[o + 1], dP[o + 2]);
      tmp.set(dV[o], dV[o + 1], dV[o + 2]);
      const sp = tmp.length();
      Q.setFromUnitVectors(UP, tmp.multiplyScalar(1 / (sp + 1e-6)));
      S.set(dS[i], dS[i] * (1 + sp * 1.2), dS[i]);
      M4.compose(P, Q, S);
      drops.setMatrixAt(n++, M4);
    }
    drops.count = n;
    if (n) drops.instanceMatrix.needsUpdate = true;
  }
  function spawnSplash(cnt, sc) {
    for (let c = 0; c < cnt; c++) {
      let i = -1;
      for (let k = 0; k < DMAX; k++) if (!dLive[k]) { i = k; break; }
      if (i < 0) return;
      const a = Math.random() * TAU, sp = (0.12 + Math.random() * 0.2) * sc;
      const o = i * 3;
      dP[o] = to.x + Math.cos(a) * 0.004; dP[o + 1] = to.y + 0.001; dP[o + 2] = to.z + Math.sin(a) * 0.004;
      dV[o] = Math.cos(a) * sp; dV[o + 1] = (0.25 + Math.random() * 0.3) * sc; dV[o + 2] = Math.sin(a) * sp;
      dS[i] = 0.0008 + Math.random() * 0.0012;
      dLive[i] = 1;
    }
  }
  return { object, set, update };
}

// ================================================================ CAKE COAT
export function createCakeCream(opts = {}) {
  const SR = opts.radius || 0.105, SH = opts.height || 0.075;
  const RC = 0.006, GAP = 0.0006, TH = 0.0042;
  const NT = 36, NSH = 6, NSD = 14, A = 128;
  // profile rows (row 0 = centre)
  const pr = [], py = [], pnr = [], pny = [], kind = [], pq = [];
  for (let i = 0; i < NT; i++) { pr.push((i / (NT - 1)) * (SR - RC)); py.push(SH); pnr.push(0); pny.push(1); kind.push(0); pq.push(-1); }
  for (let j = 1; j <= NSH; j++) {
    const a = (j / NSH) * Math.PI / 2;
    pr.push(SR - RC + RC * Math.sin(a)); py.push(SH - RC + RC * Math.cos(a)); pnr.push(Math.sin(a)); pny.push(Math.cos(a)); kind.push(1); pq.push(-0.06 + 0.06 * (j / NSH));
  }
  for (let j = 1; j <= NSD; j++) {
    pr.push(SR); py.push(0.0009 + (SH - RC - 0.0009) * (1 - j / NSD)); pnr.push(1); pny.push(0); kind.push(2); pq.push(j / NSD);
  }
  pr.push(SR + 0.0001); py.push(0.0009); pnr.push(1); pny.push(0); kind.push(3); pq.push(1.02); // closing bottom row
  const P = pr.length;
  const VC = 1 + (P - 1) * A;
  const vi = (p, a) => (p === 0 ? 0 : 1 + (p - 1) * A + ((a + A) % A));
  const cosA = new Float32Array(A), sinA = new Float32Array(A);
  for (let a = 0; a < A; a++) { cosA[a] = Math.cos((a / A) * TAU); sinA[a] = Math.sin((a / A) * TAU); }

  const cov = new Float32Array(VC), rid = new Float32Array(VC), ridF = new Float32Array(VC), ext = new Float32Array(VC), nz = new Float32Array(VC);
  const vxA = new Float32Array(VC), vzA = new Float32Array(VC), rowOf = new Uint8Array(VC);
  const sideFill = new Float32Array(A);
  for (let p = 0; p < P; p++) for (let a = 0; a < (p === 0 ? 1 : A); a++) {
    const v = vi(p, a);
    const x = pr[p] * cosA[a], z = pr[p] * sinA[a];
    vxA[v] = x; vzA[v] = z; rowOf[v] = p;
    nz[v] = p === 0 ? 0.5 : fbm(cosA[a] * 6 + py[p] * 90 + pr[p] * 60, sinA[a] * 6 + py[p] * 70, 3);
    // finished look: faint spiral comb trace on top, faint horizontal knife marks on the side
    if (kind[p] === 0) {
      const r = pr[p], th = (a / A) * TAU;
      ridF[v] = 0.00022 * Math.sin((r / 0.0095 + th / TAU) * TAU) * smoothstep(0.01, 0.03, r) + 0.0001 * (nz[v] - 0.5);
    } else if (kind[p] === 2) {
      ridF[v] = 0.0002 * Math.sin((py[p] / 0.0105) * TAU + 0.7 * Math.sin((a / A) * TAU * 3)) + 0.0001 * (nz[v] - 0.5);
    }
  }
  let topW = 0;
  for (let p = 1; p < NT; p++) topW += pr[p] * A;

  const pos = new Float32Array(VC * 3), nor = new Float32Array(VC * 3), covAttrArr = new Float32Array(VC);
  const geo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const nA = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  const cA = new THREE.BufferAttribute(covAttrArr, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pA); geo.setAttribute('normal', nA); geo.setAttribute('cov', cA);
  geo.setIndex(polarIndices(P - 1, A));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SH * 0.5, 0), 0.14);

  const mat = creamMaterial(1);
  mat.onBeforeCompile = (sh) => {
    creamShaderPatch(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float cov;\nvarying float vCov;\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCov = cov; vLP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vCov; varying vec3 vLP;
float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float cn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(ch(i),ch(i+vec2(1,0)),f.x), mix(ch(i+vec2(0,1)),ch(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  { vec2 q = vec2(vLP.x + vLP.y*0.8, vLP.z - vLP.y*0.6);
    float n = cn(q*110.0)*0.55 + cn(q*290.0)*0.45;
    if (vCov + (n-0.5)*0.32 < 0.3) discard; }`);
  };
  mat.customProgramCacheKey = () => 'cakeCoat1';
  const coat = new THREE.Mesh(geo, mat);
  coat.receiveShadow = true; coat.castShadow = false;

  // dollop
  const dollopGeo = (() => {
    const R0 = 0.075, H0 = 0.045;
    return polarGeometry(24, 72, (u, th, out) => {
      const ca = Math.cos(th), sa = Math.sin(th);
      const rn = 1 + 0.09 * (fbm(ca * 1.6 + 4, sa * 1.6 - 2, 11) - 0.5) * 2;
      let rho = u * 1.03;
      let y;
      if (rho <= 1) y = H0 * Math.pow(Math.max(0, 1 - Math.pow(rho, 2.4)), 0.55);
      else y = -0.002;
      const x0 = Math.min(rho, 1) * R0 * rn * ca, z0 = Math.min(rho, 1) * R0 * rn * sa;
      if (rho <= 1) {
        y *= 1 + 0.16 * (fbm(x0 * 45 + 9, z0 * 45, 21) - 0.5) * 2;
        y += 0.0028 * Math.sin(th * 2 + rho * 15) * rho * (1 - rho) * 4; // swirl folds
        const c = Math.max(0, 1 - rho / 0.3);
        y += 0.016 * c * c; // curl tip
      }
      const c = Math.max(0, 1 - rho / 0.32);
      out.set(x0 + 0.009 * c * c * c, y, z0 + 0.003 * c * c);
    });
  })();
  const dollopMesh = new THREE.Mesh(dollopGeo, mat.clone());
  dollopMesh.material.onBeforeCompile = creamShaderPatch;
  dollopMesh.material.customProgramCacheKey = () => 'cream';
  dollopMesh.castShadow = true; dollopMesh.receiveShadow = true;
  const dollopG = new THREE.Group();
  dollopG.add(dollopMesh);
  dollopG.visible = false;

  const object = new THREE.Group();
  object.name = 'cakeCream';
  object.add(coat, dollopG);

  const st = {
    hasDollop: false, dropY: 0, dropV: 0, landed: false, landT: 0, time: 0,
    cov0: 0, coverage: 0, topCov: 0, sideCov: 0, finished: false, finishing: -1, dirty: true,
    lastX: 0, lastZ: 0, lastT: -10, phase: 0, wl: 0.011,
  };

  function topCoverage() {
    let s = 0;
    for (let p = 1; p < NT; p++) { const r = pr[p]; const base = 1 + (p - 1) * A; for (let a = 0; a < A; a++) s += Math.min(1, cov[base + a]) * r; }
    return s / topW;
  }
  function calcCoverage() {
    st.topCov = topCoverage();
    let s = 0; for (let a = 0; a < A; a++) s += Math.min(1, sideFill[a]);
    st.sideCov = s / A;
    st.coverage = Math.min(1, st.topCov * 0.75 + st.sideCov * 0.25);
    if (st.coverage > 0.985) st.coverage = 1;
    return st.coverage;
  }

  function dollop() {
    if (st.finished) return;
    st.hasDollop = true; st.landed = false; st.dropY = 0.16; st.dropV = 0;
    dollopG.visible = true; dollopG.position.set(0, SH + GAP + 0.16, 0);
    dollopG.scale.set(0.92, 1.08, 0.92);
    dollopG.rotation.y = Math.random() * TAU;
  }

  function spreadAt(x, z, r = 0.035) {
    if (st.finished || st.finishing >= 0) return 1;
    if (!st.hasDollop || !st.landed) return st.coverage;
    // stroke direction
    let dx = x - st.lastX, dz = z - st.lastZ;
    const dl = Math.hypot(dx, dz);
    const moving = st.time - st.lastT < 0.25 && dl > 0.0015 && dl < 0.06;
    if (moving) { dx /= dl; dz /= dl; } else { dx = 1; dz = 0; st.phase = Math.random() * TAU; st.wl = 0.009 + Math.random() * 0.006; }
    st.lastX = x; st.lastZ = z; st.lastT = st.time;
    const px = -dz, pz = dx;
    const rr = r * 1.45, rr2 = rr * rr;
    for (let p = 1; p < NT; p++) {
      const base = 1 + (p - 1) * A;
      for (let a = 0; a < A; a++) {
        const v = base + a;
        const ex = vxA[v] - x, ez = vzA[v] - z;
        const d2 = ex * ex + ez * ez;
        if (d2 > rr2) continue;
        const re = r * (0.72 + 0.6 * nz[v]);
        const d = Math.sqrt(d2);
        const w = 1 - smoothstep(0.45 * re, re, d);
        if (w <= 0) continue;
        cov[v] = Math.min(1.2, cov[v] + w * 0.42);
        if (moving) {
          const proj = vxA[v] * px + vzA[v] * pz;
          const pat = 0.00042 * Math.sin((proj / st.wl) * TAU + st.phase + 2.5 * nz[v]) + 0.0005 * (nz[v] - 0.5);
          const edgeBulge = 0.0009 * Math.exp(-((w - 0.3) * (w - 0.3)) / 0.02);
          rid[v] += (pat - rid[v]) * w * 0.45;
          rid[v] += edgeBulge * 0.25;
          if (rid[v] > 0.0016) rid[v] = 0.0016;
        }
      }
    }
    // rubbing near the rim pulls cream over the edge
    const rx = Math.hypot(x, z);
    if (rx > SR - r * 1.6) {
      const ang = Math.atan2(z, x);
      const span = (r * 1.4) / SR;
      for (let a = 0; a < A; a++) {
        let da = Math.abs((a / A) * TAU - ang); if (da > Math.PI) da = TAU - da;
        if (da < span) sideFill[a] = Math.min(1.1, sideFill[a] + 0.12 * (1 - da / span));
      }
    }
    st.dirty = true;
    return calcCoverage();
  }

  function finish() {
    if (st.finished || st.finishing >= 0) return;
    st.finishing = 0;
  }
  function dent(x, z) {
    const R = 0.012;
    for (let p = 1; p < NT; p++) {
      const base = 1 + (p - 1) * A;
      for (let a = 0; a < A; a++) {
        const v = base + a;
        const d = Math.hypot(vxA[v] - x, vzA[v] - z) / R;
        if (d > 1.5) continue;
        if (d < 1) { const q = 1 - d * d; ext[v] = Math.min(ext[v], -0.0028 * q * q); }
        else ext[v] = Math.max(ext[v], 0.0005 * Math.sin(((d - 1) / 0.5) * Math.PI));
      }
    }
    // centre vertex
    if (Math.hypot(x, z) < R) ext[0] = Math.min(ext[0], -0.0028 * Math.pow(1 - (x * x + z * z) / (R * R), 2));
    st.dirty = true;
  }
  function topY() { return SH + GAP + TH; }

  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), t3 = new THREE.Vector3();
  function rebuild() {
    const f = st.finishing >= 0 ? easeInOut(Math.min(1, st.finishing / 1.4)) : st.finished ? 1 : 0;
    for (let p = 0; p < P; p++) {
      const n = p === 0 ? 1 : A;
      for (let a = 0; a < n; a++) {
        const v = vi(p, a);
        let c;
        if (kind[p] === 0) c = Math.min(1, cov[v]);
        else {
          const rimV = vi(NT - 1, a);
          const rim = Math.min(1, (cov[rimV] + cov[vi(NT - 1, a - 1)] + cov[vi(NT - 1, a + 1)]) / 3);
          const s = smoothstep(-0.08, 0.08, sideFill[a] + (nz[v] - 0.5) * 0.18 - pq[p]) * smoothstep(0.0, 0.06, sideFill[a]);
          c = kind[p] === 1 ? Math.max(rim * smoothstep(0.3, 0.7, rim), s) : s;
        }
        c = c + (1 - c) * f;
        const r0 = rid[v] * (1 - f) + ridF[v] * f;
        let th = GAP + smoothstep(0.12, 0.6, c) * (TH + r0);
        if (kind[p] === 1) th += 0.0006 * f; // soft rounded shoulder
        if (kind[p] === 3) th = GAP * 0.5;
        if (kind[p] === 2 && pq[p] > 0.99) th += 0.0016 * f; // tiny lip at the base
        if (kind[p] === 2 && pq[p] > 0.9 && pq[p] <= 0.99) th += 0.0005 * f;
        th += ext[v] * f;
        const rr = pr[p] + pnr[p] * th;
        const o = v * 3;
        pos[o] = rr * cosA[a]; pos[o + 1] = py[p] + pny[p] * th; pos[o + 2] = rr * sinA[a];
        covAttrArr[v] = c;
      }
    }
    // normals from the grid
    nor[0] = 0; nor[1] = 1; nor[2] = 0;
    for (let p = 1; p < P; p++) {
      for (let a = 0; a < A; a++) {
        const v = vi(p, a), va1 = vi(p, a + 1) * 3, va0 = vi(p, a - 1) * 3;
        const vp1 = vi(Math.min(P - 1, p + 1), a) * 3, vp0 = vi(p - 1, a) * 3;
        t1.set(pos[va1] - pos[va0], pos[va1 + 1] - pos[va0 + 1], pos[va1 + 2] - pos[va0 + 2]);
        t2.set(pos[vp1] - pos[vp0], pos[vp1 + 1] - pos[vp0 + 1], pos[vp1 + 2] - pos[vp0 + 2]);
        t3.crossVectors(t1, t2);
        const l = t3.length();
        const o = v * 3;
        if (l < 1e-12) { nor[o] = pnr[p] * cosA[a]; nor[o + 1] = pny[p]; nor[o + 2] = pnr[p] * sinA[a]; }
        else { nor[o] = t3.x / l; nor[o + 1] = t3.y / l; nor[o + 2] = t3.z / l; }
      }
    }
    pA.needsUpdate = true; nA.needsUpdate = true; cA.needsUpdate = true;
  }

  function update(dt, t) {
    dt = Math.min(dt, 0.05);
    st.time += dt;
    // dollop fall + squash/settle
    if (st.hasDollop && dollopG.visible) {
      if (!st.landed) {
        st.dropV -= 9.8 * dt; st.dropY += st.dropV * dt;
        if (st.dropY <= 0) {
          st.dropY = 0; st.landed = true; st.landT = st.time;
          // a little cream under the dollop
          for (let v = 0; v < VC; v++) if (rowOf[v] < NT && Math.hypot(vxA[v], vzA[v]) < 0.04 + 0.01 * nz[v]) cov[v] = Math.max(cov[v], 1);
          st.cov0 = calcCoverage(); st.dirty = true;
        }
        dollopG.position.y = SH + GAP + st.dropY;
      }
      let sy = 1, sxz = 1;
      if (st.landed) {
        const e = st.time - st.landT;
        sy = 1 - 0.32 * Math.exp(-e * 6) * Math.cos(e * 19);
        sxz = 1 / Math.sqrt(sy);
      } else { sy = 1.08; sxz = 0.95; }
      // shrink as cream is spread away
      let rem = 1;
      if (st.landed) rem = clamp01(1 - (st.coverage - st.cov0) / Math.max(0.05, 0.85 - st.cov0));
      if (st.finishing >= 0) rem *= 1 - Math.min(1, st.finishing / 0.5);
      if (rem < 0.04) { dollopG.visible = false; }
      const rs = Math.sqrt(rem);
      dollopG.scale.set(sxz * (0.3 + 0.7 * rs), sy * (0.15 + 0.85 * rem), sxz * (0.3 + 0.7 * rs));
      dollopG.position.y = SH + GAP + st.dropY - 0.0015 * (1 - rem);
    }
    // cream creeps down the side where the rim is covered
    if (st.landed && !st.finished) {
      let ch = false;
      for (let a = 0; a < A; a++) {
        const rim = cov[vi(NT - 1, a)];
        if (rim > 0.45 && sideFill[a] < 1.08) { sideFill[a] = Math.min(1.08, sideFill[a] + dt * 0.5 * Math.min(1, rim)); ch = true; }
      }
      // angular smoothing (organic, not stripy)
      if (ch) {
        let prev = sideFill[A - 1];
        const first = sideFill[0];
        for (let a = 0; a < A; a++) {
          const cur = sideFill[a], next = a === A - 1 ? first : sideFill[a + 1];
          const m = Math.max(prev, next);
          if (m > cur + 0.15) sideFill[a] = cur + (m - cur - 0.15) * dt * 3;
          prev = cur;
        }
        st.dirty = true;
        calcCoverage();
      }
    }
    if (st.finishing >= 0) {
      st.finishing += dt;
      st.dirty = true;
      if (st.finishing >= 1.4) {
        st.finishing = -1; st.finished = true;
        cov.fill(1); sideFill.fill(1.1); rid.set(ridF);
        dollopG.visible = false; st.coverage = 1;
      }
    }
    if (st.dirty) { st.dirty = false; rebuild(); }
  }

  function reset() {
    cov.fill(0); rid.fill(0); ext.fill(0); sideFill.fill(0);
    st.hasDollop = false; st.landed = false; st.finished = false; st.finishing = -1;
    st.coverage = 0; st.cov0 = 0; st.topCov = 0; st.sideCov = 0; st.lastT = -10;
    dollopG.visible = false;
    st.dirty = true;
    rebuild(); st.dirty = false;
  }
  reset();

  return {
    object, dollop, spreadAt, coverage: () => st.coverage, finish, dent, topY, update, reset,
    get hasDollop() { return st.hasDollop; },
    get finished() { return st.finished; },
  };
}

// =================================================================== SPLATS
function makeSplatGeo(seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const lobes = [];
  const nl = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < nl; i++) lobes.push({ a: rnd() * TAU, w: 0.25 + rnd() * 0.3, l: 0.12 + rnd() * 0.22 });
  const ns = (seed * 13.7) % 50;
  // main dome, radius 0.5 (unit diameter), wobbly outline with short tongues
  parts.push(polarGeometry(10, 40, (u, th, out) => {
    let rr = 0.42 * (1 + 0.16 * (fbm(Math.cos(th) * 1.8 + ns, Math.sin(th) * 1.8, seed) - 0.5) * 2);
    for (const lb of lobes) {
      let d = Math.abs(th - lb.a); if (d > Math.PI) d = TAU - d;
      rr += lb.l * 0.42 * Math.exp(-(d * d) / (lb.w * lb.w * 0.3));
    }
    const rho = Math.min(1, u * 1.05);
    let y = u >= 1 ? -0.03 : 0.17 * Math.pow(1 - Math.pow(rho, 2.2), 0.5);
    y *= 1 + 0.12 * (vnoise(Math.cos(th) * 3 * u + ns, Math.sin(th) * 3 * u, seed + 3) - 0.5);
    out.set(Math.cos(th) * rr * rho, y, Math.sin(th) * rr * rho);
  }));
  const nsat = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < nsat; i++) {
    const a = lobes[i % nl].a + (rnd() - 0.5) * 0.5;
    const d = 0.62 + rnd() * 0.28, sr = 0.04 + rnd() * 0.07;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    parts.push(polarGeometry(4, 14, (u, th, out) => {
      const y = u >= 1 ? -0.02 : sr * 0.8 * Math.pow(1 - u * u, 0.5);
      out.set(cx + Math.cos(th) * sr * Math.min(1, u * 1.05), y, cz + Math.sin(th) * sr * Math.min(1, u * 1.05));
    }));
  }
  return mergeGeos(parts);
}

function makeLensTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,253,248,${a})`);
    gr.addColorStop(0.55, `rgba(250,247,240,${a * 0.75})`);
    gr.addColorStop(0.85, `rgba(225,222,215,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(240,238,232,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  blob(64, 66, 52, 0.55);
  blob(50, 56, 30, 0.4);
  blob(80, 74, 28, 0.35);
  blob(62, 84, 22, 0.3);
  // refraction-ish rim darkening
  g.globalCompositeOperation = 'source-atop';
  const rg = g.createRadialGradient(64, 66, 30, 64, 66, 58);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.75, 'rgba(120,115,108,0.25)'); rg.addColorStop(1, 'rgba(120,115,108,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'source-over';
  // highlight
  const hg = g.createRadialGradient(48, 46, 0, 48, 46, 12);
  hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg; g.beginPath(); g.arc(48, 46, 12, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSplats(opts = {}) {
  const object = new THREE.Group();
  object.name = 'creamSplats';
  const lens = new THREE.Group();
  lens.name = 'creamLens';
  const mat = creamMaterial(0.35);

  // flying droplets
  const FMAX = 40;
  const dropGeo = new THREE.SphereGeometry(1, 12, 9);
  const flyMesh = new THREE.InstancedMesh(dropGeo, mat, FMAX);
  flyMesh.frustumCulled = false; flyMesh.count = 0; flyMesh.castShadow = true;
  object.add(flyMesh);
  const fP = new Float32Array(FMAX * 3), fV = new Float32Array(FMAX * 3), fS = new Float32Array(FMAX);
  const fLive = new Uint8Array(FMAX), fLens = new Uint8Array(FMAX), fT = new Float32Array(FMAX);
  const fCb = new Array(FMAX).fill(null);
  const fStart = new Float32Array(FMAX * 3);

  // stuck splats: 3 variants × 20 slots
  const SMAX = 60, NVAR = 3, PER = SMAX / NVAR;
  const varMeshes = [];
  for (let i = 0; i < NVAR; i++) {
    const im = new THREE.InstancedMesh(makeSplatGeo(11 + i * 7), mat, PER);
    im.frustumCulled = false; im.receiveShadow = true;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < PER; k++) im.setMatrixAt(k, z);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.add(im);
    varMeshes.push(im);
  }
  const sPos = new Float32Array(SMAX * 3), sQ = new Float32Array(SMAX * 4), sSize = new Float32Array(SMAX), sAge = new Float32Array(SMAX).fill(99), sUsed = new Uint8Array(SMAX);
  let sNext = 0;

  // lens blobs
  const lensTex = makeLensTexture();
  const lensGeo = polarGeometry(8, 28, (u, th, out) => {
    out.set(Math.cos(th) * u, -Math.sin(th) * u, 0.22 * Math.pow(1 - u * u, 0.7));
  });
  {
    const uv = new Float32Array(lensGeo.attributes.position.count * 2);
    const pa = lensGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) { uv[i * 2] = pa.getX(i) * 0.5 + 0.5; uv[i * 2 + 1] = pa.getY(i) * 0.5 + 0.5; }
    lensGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const LMAX = 3;
  const blobs = [];
  for (let i = 0; i < LMAX; i++) {
    const m = new THREE.MeshStandardMaterial({ map: lensTex, color: 0xe9e5dc, roughness: 0.25, metalness: 0, transparent: true, depthTest: false, depthWrite: false, opacity: 1 });
    const mesh = new THREE.Mesh(lensGeo, m);
    mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 999;
    lens.add(mesh);
    blobs.push({ mesh, mat: m, active: false, dying: false, nx: 0, ny: 0, ny0: 0, size: 1, age: 0, rubs: 0, lastWipe: -10, sx: 1, sy: 1, rot: 0, fade: 1 });
  }
  let heightFn = (x, z) => 0;
  let lastCam = null, aspect = 1.5, time = 0;
  const camPos = new THREE.Vector3();
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), V3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  function stickAt(p, normal, size = 0.02) {
    const s = sNext; sNext = (sNext + 1) % SMAX;
    sUsed[s] = 1; sAge[s] = 0;
    V3.copy(normal || UP);
    if (V3.lengthSq() < 1e-8) V3.set(0, 1, 0);
    V3.normalize();
    sPos[s * 3] = p.x + V3.x * 0.0003; sPos[s * 3 + 1] = p.y + V3.y * 0.0003; sPos[s * 3 + 2] = p.z + V3.z * 0.0003;
    Q.setFromUnitVectors(UP, V3);
    Q2.setFromAxisAngle(UP, Math.random() * TAU);
    Q.multiply(Q2);
    sQ[s * 4] = Q.x; sQ[s * 4 + 1] = Q.y; sQ[s * 4 + 2] = Q.z; sQ[s * 4 + 3] = Q.w;
    sSize[s] = size;
    writeSplat(s);
  }
  function writeSplat(s) {
    const im = varMeshes[s % NVAR], k = (s / NVAR) | 0;
    if (!sUsed[s]) { M4.makeScale(0, 0, 0); im.setMatrixAt(k, M4); im.instanceMatrix.needsUpdate = true; return; }
    const a = Math.min(1, sAge[s] / 0.09);
    const e = 1 - (1 - a) * (1 - a);
    const sz = sSize[s];
    P.set(sPos[s * 3], sPos[s * 3 + 1], sPos[s * 3 + 2]);
    Q.set(sQ[s * 4], sQ[s * 4 + 1], sQ[s * 4 + 2], sQ[s * 4 + 3]);
    S.set(sz * (0.55 + 0.45 * e), sz * (2.2 - 1.2 * e) * 0.9, sz * (0.55 + 0.45 * e));
    M4.compose(P, Q, S);
    im.setMatrixAt(k, M4);
    im.instanceMatrix.needsUpdate = true;
  }

  function spawnLensBlob() {
    let b = null;
    for (const x of blobs) if (!x.active) { b = x; break; }
    if (!b) return;
    b.active = true; b.dying = false; b.age = 0; b.rubs = 0; b.fade = 1;
    // upper or side region; keep the lower middle clear
    if (Math.random() < 0.55) { b.nx = (Math.random() * 2 - 1) * 0.75; b.ny = 0.25 + Math.random() * 0.55; }
    else { const sgn = Math.random() < 0.5 ? -1 : 1; b.nx = sgn * (0.58 + Math.random() * 0.28); b.ny = -0.45 + Math.random() * 1.2; }
    b.ny0 = b.ny;
    b.size = 0.85 + Math.random() * 0.35;
    b.sx = 1 + (Math.random() - 0.5) * 0.25; b.sy = 1 + (Math.random() - 0.5) * 0.25;
    b.rot = Math.random() * TAU;
    b.mesh.rotation.z = b.rot;
    b.mat.opacity = 1;
    b.mesh.visible = true;
  }

  function lensCountFn() { let n = 0; for (const b of blobs) if (b.active && !b.dying) n++; return n; }

  function burst(origin, o = {}) {
    const count = o.count ?? 8, speed = o.speed ?? 1.6, up = o.up ?? 0.6;
    let wantLens = !!o.lens && lensCountFn() < LMAX;
    for (let c = 0; c < count; c++) {
      let i = -1;
      for (let k = 0; k < FMAX; k++) if (!fLive[k]) { i = k; break; }
      if (i < 0) break;
      const a = Math.random() * TAU, sp = speed * (0.5 + Math.random() * 0.6);
      const ii = i * 3;
      fP[ii] = origin.x; fP[ii + 1] = origin.y; fP[ii + 2] = origin.z;
      fStart[ii] = origin.x; fStart[ii + 1] = origin.y; fStart[ii + 2] = origin.z;
      fV[ii] = Math.cos(a) * sp; fV[ii + 1] = up * (0.4 + Math.random() * 0.9); fV[ii + 2] = Math.sin(a) * sp;
      fS[i] = 0.003 + Math.random() * 0.0028;
      fLive[i] = 1; fT[i] = 0; fLens[i] = 0; fCb[i] = o.onLand || null;
      if (wantLens) { wantLens = false; fLens[i] = 1; }
    }
  }

  function update(dt, t, camera) {
    dt = Math.min(dt, 0.05);
    time += dt;
    if (camera) { lastCam = camera; aspect = camera.aspect || aspect; }
    if (lastCam) lastCam.getWorldPosition(camPos);
    let n = 0;
    for (let i = 0; i < FMAX; i++) {
      if (!fLive[i]) continue;
      const ii = i * 3;
      fT[i] += dt;
      if (fLens[i]) {
        if (!lastCam) { fLive[i] = 0; spawnLensBlob(); continue; }
        const u = Math.min(1, fT[i] / 0.32);
        const x = fStart[ii] + (camPos.x - fStart[ii]) * u, z = fStart[ii + 2] + (camPos.z - fStart[ii + 2]) * u;
        const y = fStart[ii + 1] + (camPos.y - fStart[ii + 1]) * u + 0.12 * Math.sin(u * Math.PI);
        V3.set(x - fP[ii], y - fP[ii + 1], z - fP[ii + 2]).multiplyScalar(1 / dt);
        fV[ii] = V3.x; fV[ii + 1] = V3.y; fV[ii + 2] = V3.z;
        fP[ii] = x; fP[ii + 1] = y; fP[ii + 2] = z;
        if (u >= 0.94) { fLive[i] = 0; spawnLensBlob(); continue; }
      } else {
        fV[ii + 1] -= 9.8 * dt;
        fP[ii] += fV[ii] * dt; fP[ii + 1] += fV[ii + 1] * dt; fP[ii + 2] += fV[ii + 2] * dt;
        const x = fP[ii], z = fP[ii + 2];
        const inside = x > -1.3 && x < 1.3 && z > -0.6 && z < 0.75;
        if (inside && fV[ii + 1] < 0) {
          const hy = heightFn(x, z);
          if (fP[ii + 1] <= hy) {
            fLive[i] = 0;
            P.set(x, hy, z);
            stickAt(P, UP, Math.min(0.03, Math.max(0.012, fS[i] * 4.2 * (0.85 + Math.random() * 0.3))));
            if (fCb[i]) { const cb = fCb[i]; fCb[i] = null; cb(new THREE.Vector3(x, hy, z)); }
            continue;
          }
        }
        if (fP[ii + 1] < -1.5) { fLive[i] = 0; continue; }
      }
      P.set(fP[ii], fP[ii + 1], fP[ii + 2]);
      V3.set(fV[ii], fV[ii + 1], fV[ii + 2]);
      const sp = V3.length();
      Q.setFromUnitVectors(UP, V3.multiplyScalar(1 / (sp + 1e-6)));
      const st = 1 + Math.min(1.2, sp * 0.35);
      S.set(fS[i] / Math.sqrt(st), fS[i] * st, fS[i] / Math.sqrt(st));
      M4.compose(P, Q, S);
      flyMesh.setMatrixAt(n++, M4);
    }
    flyMesh.count = n;
    if (n) flyMesh.instanceMatrix.needsUpdate = true;
    // splat landing squash
    for (let s = 0; s < SMAX; s++) {
      if (!sUsed[s] || sAge[s] > 0.2) continue;
      sAge[s] += dt;
      writeSplat(s);
    }
    // lens blobs
    if (lastCam) {
      const near = lastCam.near || 0.1;
      const D = Math.max(0.12, near * 1.3);
      const halfH = D * Math.tan(THREE.MathUtils.degToRad((lastCam.fov || 40) * 0.5)) / (lastCam.zoom || 1);
      const halfW = halfH * aspect;
      for (const b of blobs) {
        if (!b.active) continue;
        b.age += dt;
        b.ny = b.ny0 - 0.05 * (1 - Math.exp(-b.age / 3.5));
        let sc = b.size * 0.09 * halfH;
        if (b.age < 0.15) { const a = b.age / 0.15; sc *= 0.4 + 0.6 * a + 0.25 * Math.sin(a * Math.PI); }
        if (b.dying) {
          b.fade -= dt / 0.35;
          if (b.fade <= 0) { b.active = false; b.dying = false; b.mesh.visible = false; continue; }
          b.mat.opacity = b.fade * b.fade * 0.6;
        }
        b.mesh.position.set(b.nx * halfW, b.ny * halfH, -D);
        b.mesh.scale.set(sc * b.sx, sc * b.sy, sc * 0.5);
      }
    }
  }

  function wipeLens(ndcX, ndcY, radius = 0.15) {
    let hit = false;
    for (const b of blobs) {
      if (!b.active || b.dying) continue;
      const dx = (ndcX - b.nx) * aspect, dy = ndcY - b.ny;
      const br = b.size * 0.09 * Math.max(b.sx, b.sy);
      if (Math.sqrt(dx * dx + dy * dy) > radius + br * 0.85) continue;
      hit = true;
      if (time - b.lastWipe < 0.14) continue;
      b.lastWipe = time;
      b.rubs++;
      b.size *= 0.82;
      b.sx *= 1.18; b.sy *= 0.9;
      b.mesh.rotation.z = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
      b.mat.opacity = Math.max(0.3, b.mat.opacity * 0.72);
      if (b.rubs >= 3) { b.dying = true; b.fade = 1; }
    }
    return hit;
  }

  function clear() {
    fLive.fill(0); flyMesh.count = 0;
    sUsed.fill(0); for (let s = 0; s < SMAX; s++) writeSplat(s);
    sNext = 0;
    for (const b of blobs) { b.active = false; b.dying = false; b.mesh.visible = false; }
  }

  return {
    object, lens, burst, stickAt, wipeLens, update, clear,
    setHeightFn(fn) { heightFn = typeof fn === 'function' ? fn : () => 0; },
    get lensCount() { return lensCountFn(); },
  };
}
