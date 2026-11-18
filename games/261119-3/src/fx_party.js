// fx_party.js — candle flames, candle light, smoke, confetti and the in-world hints.
// All objects live on render layer 0 (foreground). No per-frame allocations in update paths.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const FRAG_END = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const FRAG_END_NOTM = '\n#include <colorspace_fragment>\n';

// Counter area (outside of it things fall to the floor and vanish)
const inCounter = (x, z) => x >= -1.3 && x <= 1.3 && z <= 0.75 && z >= -0.6;

// ============================================================== FLAME
let FLAME_GEO = null, QUAD_GEO = null;
function flameGeo() { if (!FLAME_GEO) FLAME_GEO = new THREE.PlaneGeometry(1, 1, 1, 12); return FLAME_GEO; }
function quadGeo() { if (!QUAD_GEO) QUAD_GEO = new THREE.PlaneGeometry(1, 1); return QUAD_GEO; }

const FLAME_VS = /* glsl */`
uniform float uH; uniform float uW; uniform vec3 uLean;
varying vec2 vUv;
vec3 spine(float v){ float k = max(v, 0.0); return vec3(0.0, (v * 1.15 - 0.15) * uH, 0.0) + uLean * pow(k, 1.6); }
void main(){
  vUv = uv;
  vec3 wick = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec4 a = viewMatrix * vec4(wick + spine(uv.y), 1.0);
  vec4 b = viewMatrix * vec4(wick + spine(uv.y + 0.02), 1.0);
  vec2 tg = b.xy - a.xy; float l = length(tg);
  vec2 dir = l > 1e-9 ? tg / l : vec2(0.0, 1.0);
  a.xy += vec2(dir.y, -dir.x) * (uv.x - 0.5) * uW * 1.3;
  gl_Position = projectionMatrix * a;
}`;
const FLAME_FS = /* glsl */`
uniform float uTime; uniform float uPhase; uniform float uFlut; uniform float uBright;
varying vec2 vUv;
void main(){
  float y = vUv.y * 1.15 - 0.15;
  float s = clamp((y + 0.12) / 1.12, 0.0, 1.0);
  float x = (vUv.x - 0.5) * 1.3;
  x += (sin(y * 8.0 - uTime * 13.0 + uPhase) * 0.035 + sin(y * 15.0 - uTime * 23.0 + uPhase * 1.7) * 0.03 * uFlut) * s * (1.0 + 2.5 * uFlut);
  float prof = 0.5 * pow(sin(3.14159 * pow(s, 0.62)), 0.8);
  float d = abs(x) / max(prof, 0.002);
  float body = (1.0 - smoothstep(0.55, 1.0, d)) * (1.0 - smoothstep(0.78, 1.0, s)) * mix(0.12, 1.0, smoothstep(0.06, 0.26, s));
  float core = (1.0 - smoothstep(0.2, 0.8, d)) * smoothstep(0.12, 0.34, s) * (1.0 - smoothstep(0.58, 0.92, s));
  float blue = (1.0 - smoothstep(0.5, 1.05, d)) * smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.1, 0.3, s));
  float glow = exp(-d * d * 0.9) * smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.7, 1.0, s)) * (1.0 - smoothstep(0.4, 0.64, abs(x)));
  vec3 col = vec3(1.0, 0.86, 0.58) * core * 2.7 + vec3(1.0, 0.5, 0.13) * body * 1.15
           + vec3(0.18, 0.32, 1.0) * blue * 1.1 + vec3(1.0, 0.42, 0.1) * glow * 0.3;
  gl_FragColor = vec4(col * uBright, 1.0);
  ${FRAG_END}
}`;
const HALO_VS = /* glsl */`
uniform vec3 uOff; uniform float uSize;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + uOff;
  vec4 v = viewMatrix * vec4(c, 1.0);
  v.xy += (uv - 0.5) * uSize;
  gl_Position = projectionMatrix * v;
}`;
const HALO_FS = /* glsl */`
uniform float uI;
varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 5.0) * 0.22 + exp(-r * r * 38.0) * 0.45;
  a *= 1.0 - smoothstep(0.75, 1.0, r);
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.22) * a * uI, 1.0);
  ${FRAG_END}
}`;

function backOut(k) { const c1 = 1.3, c3 = c1 + 1; const u = k - 1; return 1 + c3 * u * u * u + c1 * u * u; }

export function createFlame(opts = {}) {
  const scale = opts.scale ?? 1;
  const object = new THREE.Group();
  object.name = 'flame';
  const uni = {
    uH: { value: 0 }, uW: { value: 0 }, uLean: { value: new THREE.Vector3() },
    uTime: { value: 0 }, uPhase: { value: Math.random() * 10 }, uFlut: { value: 0 }, uBright: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const body = new THREE.Mesh(flameGeo(), mat);
  body.frustumCulled = false; body.renderOrder = 12;
  const huni = { uOff: { value: new THREE.Vector3() }, uSize: { value: 0 }, uI: { value: 1 } };
  const hmat = new THREE.ShaderMaterial({
    uniforms: huni, vertexShader: HALO_VS, fragmentShader: HALO_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(quadGeo(), hmat);
  halo.frustumCulled = false; halo.renderOrder = 11;
  object.add(halo, body);

  const phase = Math.random() * 100;
  let litTarget = false, litFrom = 0, litT = 1, size = 0;
  let twx = 0, twz = 0, wx = 0, wz = 0;
  let shiver = 0, shiverTimer = 1 + Math.random() * 3;
  body.visible = halo.visible = false;

  const api = {
    object,
    get lit() { return litTarget; },
    setLit(on, instant = false) {
      on = !!on;
      if (instant) { litTarget = on; size = on ? 1 : 0; litFrom = size; litT = 1; return; }
      if (on === litTarget) return;
      litTarget = on; litFrom = size; litT = 0;
    },
    setWind(x, z) { twx = x || 0; twz = z || 0; },
    update(dt, t) {
      // wind (eases in quickly, back slowly)
      const r = (twx * twx + twz * twz) > 1e-6 ? 7 : 2.5;
      wx = damp(wx, twx, r, dt); wz = damp(wz, twz, r, dt);
      let wm = Math.sqrt(wx * wx + wz * wz); if (wm > 1) wm = 1;
      // light / extinguish animation
      litT += dt;
      if (litTarget) {
        const k = clamp01(litT / 0.12);
        size = litFrom + (1 - litFrom) * backOut(k);
      } else {
        const k = clamp01(litT / 0.15);
        size = litFrom * (1 - k) * (1 - k * 0.5);
      }
      const vis = size > 0.003;
      body.visible = halo.visible = vis;
      if (!vis) return;
      // occasional quick shiver
      shiverTimer -= dt;
      if (shiverTimer < 0) { shiver = 0.6 + Math.random() * 0.4; shiverTimer = 1.2 + Math.random() * 4; }
      shiver = Math.max(0, shiver - dt * 3.2);
      const p = phase;
      const breath = 1 + 0.045 * Math.sin(t * 6.1 + p) + 0.03 * Math.sin(t * 10.7 + p * 2.3) + 0.018 * Math.sin(t * 17.3 + p * 0.7);
      const sh = shiver * Math.sin(t * 38 + p);
      const flut = wm * (Math.sin(t * 29 + p) * 0.6 + Math.sin(t * 47.3 + p * 1.3) * 0.4);
      const sz = size * scale;
      uni.uH.value = 0.022 * sz * breath * (1 + 0.35 * wm + 0.15 * flut) * (1 + 0.07 * sh);
      uni.uW.value = 0.008 * sz * (1 + 0.6 * (breath - 1)) * (1 - 0.22 * wm) * (1 - 0.05 * sh);
      const sway = 0.0011 * sz;
      let lx = sway * (Math.sin(t * 1.9 + p) + 0.6 * Math.sin(t * 3.7 + p * 1.9)) + 0.0018 * sz * sh;
      let lz = sway * (Math.cos(t * 1.6 + p * 1.3) + 0.6 * Math.sin(t * 4.1 + p * 0.4));
      const wl = 0.03 * sz * (1 + 0.35 * flut);
      lx += wx * wl - wz * 0.005 * sz * flut;
      lz += wz * wl + wx * 0.005 * sz * flut;
      const hl = Math.sqrt(lx * lx + lz * lz);
      uni.uLean.value.set(lx, -0.45 * hl, lz);
      uni.uFlut.value = wm;
      uni.uTime.value = t;
      const bright = (0.95 + 0.6 * (breath - 1)) * (1 - 0.2 * wm * Math.abs(flut)) * Math.min(1, size * 1.2 + 0.1);
      uni.uBright.value = bright;
      huni.uOff.value.set(lx * 0.4, uni.uH.value * 0.33 - 0.15 * hl, lz * 0.4);
      huni.uSize.value = 0.075 * sz * (0.9 + 0.1 * breath);
      huni.uI.value = bright * Math.min(1, size);
    },
  };
  return api;
}

// ============================================================== CANDLE GLOW
export function createCandleGlow() {
  const light = new THREE.PointLight(0xffb060, 0, 3, 2);
  light.castShadow = false; light.layers.enableAll(); light.name = 'candleGlow';
  const light2 = new THREE.PointLight(0xffa458, 0, 4, 1);
  light2.castShadow = false; light2.layers.enableAll(); light2.name = 'candleGlowFill';
  const center = new THREE.Vector3();
  let count = 0, cur = 0, nT = 0, nTarget = 0, nV = 0;
  const PER = 0.1, PER2 = 0.035; // tuned for r170 physical units with the engine's dark room
  return {
    light, light2,
    set(c, ctr) { count = Math.max(0, c | 0); if (ctr) center.copy(ctr); },
    update(dt, t) {
      if (light.layers.mask !== 0xffffffff) light.layers.enableAll();
      if (light2.layers.mask !== 0xffffffff) light2.layers.enableAll();
      const target = count > 0 ? Math.pow(count, 0.85) : 0;
      cur = damp(cur, target, 6, dt);
      nT -= dt;
      if (nT < 0) { nT = 0.05 + Math.random() * 0.09; nTarget = Math.random() * 2 - 1; }
      nV = damp(nV, nTarget, 9, dt);
      let n = 0.7 * nV + 0.2 * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 13.9);
      const f = 1 + 0.08 * n;
      light.intensity = PER * cur * f;
      light2.intensity = PER2 * cur * (1 + 0.06 * n);
      light.position.set(center.x + nV * 0.002, center.y + 0.05, center.z + n * 0.0015);
      light2.position.set(center.x, center.y + 0.08, center.z);
      light.visible = light2.visible = true; // never toggle: a light-count change recompiles every lit shader (hitch)
    },
  };
}

// ============================================================== BILLBOARD helpers
// Instanced camera-facing quads (world-space positions; add the mesh at scene root).
function instancedQuads(max, attrs) {
  const base = quadGeo();
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  for (const name in attrs) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * attrs[name]), attrs[name]);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
  }
  g.instanceCount = max;
  return g;
}

// ============================================================== SMOKE
let SMOKE_TEX = null;
function smokeTex() {
  if (SMOKE_TEX) return SMOKE_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r = i === 0 ? 0 : rnd() * 16;
    const x = 64 + Math.cos(a) * r * 0.7, y = 64 + Math.sin(a) * r * 1.4, rad = i === 0 ? 50 : 16 + rnd() * 18;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, i === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  // fade to edges
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 63);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  SMOKE_TEX = new THREE.CanvasTexture(c);
  return SMOKE_TEX;
}
const SMOKE_VS = /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute float iRot; attribute float iA;
varying vec2 vUv; varying float vA;
void main(){
  vUv = uv; vA = iA;
  vec4 v = modelViewMatrix * vec4(iPos, 1.0);
  vec2 p = position.xy * iSize;
  float c = cos(iRot), s = sin(iRot);
  v.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * v;
}`;
const SMOKE_FS = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv; varying float vA;
void main(){
  float a = texture2D(uMap, vUv).a * vA;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vec3(0.5, 0.5, 0.52), a);
  ${FRAG_END_NOTM}
}`;

export function createSmoke() {
  const MAX = 40;
  const geo = instancedQuads(MAX, { iPos: 3, iSize: 2, iRot: 1, iA: 1 });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: smokeTex() } }, vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const object = new THREE.Mesh(geo, mat);
  object.frustumCulled = false; object.renderOrder = 14; object.name = 'smoke';
  const aPos = geo.getAttribute('iPos'), aSize = geo.getAttribute('iSize'), aRot = geo.getAttribute('iRot'), aA = geo.getAttribute('iA');
  const alive = new Uint8Array(MAX), age = new Float32Array(MAX), life = new Float32Array(MAX), born = new Float32Array(MAX);
  const p0 = new Float32Array(MAX * 3), drift = new Float32Array(MAX * 2), curl = new Float32Array(MAX * 3), rot = new Float32Array(MAX * 2);
  let clock = 0, anyAlive = false;
  object.visible = false;

  function alloc() {
    let best = 0, bt = Infinity;
    for (let i = 0; i < MAX; i++) { if (!alive[i]) return i; if (born[i] < bt) { bt = born[i]; best = i; } }
    return best;
  }
  return {
    object,
    puff(pos) {
      const n = 5 + Math.floor(Math.random() * 3);
      const dx = (Math.random() - 0.5) * 0.02, dz = (Math.random() - 0.5) * 0.02;
      const ph = Math.random() * TAU;
      for (let k = 0; k < n; k++) {
        const i = alloc();
        alive[i] = 1; born[i] = clock + k * 0.001; age[i] = -k * 0.075; life[i] = 1.9 + Math.random() * 0.5;
        p0[i * 3] = pos.x; p0[i * 3 + 1] = pos.y + 0.003; p0[i * 3 + 2] = pos.z;
        drift[i * 2] = dx; drift[i * 2 + 1] = dz;
        curl[i * 3] = 0.004 + Math.random() * 0.004; curl[i * 3 + 1] = 2.2 + Math.random() * 1.2; curl[i * 3 + 2] = ph + k * 0.25;
        rot[i * 2] = (Math.random() - 0.5) * 0.3; rot[i * 2 + 1] = (Math.random() - 0.5) * 0.5;
      }
      anyAlive = true; object.visible = true;
    },
    update(dt) {
      clock += dt;
      if (!anyAlive) return;
      anyAlive = false;
      for (let i = 0; i < MAX; i++) {
        if (!alive[i]) { aA.array[i] = 0; aSize.array[i * 2] = 0; aSize.array[i * 2 + 1] = 0; continue; }
        anyAlive = true;
        const a = (age[i] += dt);
        if (a < 0) { aA.array[i] = 0; continue; }
        if (a > life[i]) { alive[i] = 0; aA.array[i] = 0; continue; }
        const rise = 0.17 * (1 - Math.exp(-a * 0.9));
        const c = curl[i * 3] * (0.4 + a), w = curl[i * 3 + 1], ph = curl[i * 3 + 2];
        aPos.array[i * 3] = p0[i * 3] + drift[i * 2] * a + c * Math.sin(a * w + ph);
        aPos.array[i * 3 + 1] = p0[i * 3 + 1] + rise;
        aPos.array[i * 3 + 2] = p0[i * 3 + 2] + drift[i * 2 + 1] * a + c * Math.cos(a * w * 0.8 + ph);
        const g = a / life[i];
        const sx = 0.006 + 0.026 * g, sy = sx * (2.8 - 1.4 * g);
        aSize.array[i * 2] = sx; aSize.array[i * 2 + 1] = sy;
        aRot.array[i] = rot[i * 2] + rot[i * 2 + 1] * a + 0.35 * Math.cos(a * w + ph) * Math.min(1, a);
        aA.array[i] = 0.34 * smooth(a / 0.15) * (1 - smooth((g - 0.3) / 0.7)) * (1 - 0.35 * g);
      }
      aPos.needsUpdate = aSize.needsUpdate = aRot.needsUpdate = aA.needsUpdate = true;
      if (!anyAlive) object.visible = false;
    },
  };
}

// ============================================================== CONFETTI
const DEFAULT_PALETTE = ['#e8343c', '#ffd23a', '#4db4ef', '#45c068', '#ff7eb6', '#e0b040', '#d4d8e0'];

export function createConfetti(opts = {}) {
  const mult = Math.max(0.5, Math.min(1, opts.particles ?? 1));
  const object = new THREE.Group(); object.name = 'confetti';
  let heightFn = () => 0;

  const rectGeo = new THREE.PlaneGeometry(1, 1);
  const circGeo = new THREE.CircleGeometry(0.5, 14);
  const matte = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  const foil = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.26, metalness: 0.92, side: THREE.DoubleSide, envMapIntensity: 1.4 });
  const KINDS = [
    { geo: rectGeo, mat: matte, cap: 110, foil: false, circ: false },
    { geo: rectGeo, mat: foil, cap: 60, foil: true, circ: false },
    { geo: circGeo, mat: matte, cap: 60, foil: false, circ: true },
    { geo: circGeo, mat: foil, cap: 30, foil: true, circ: true },
  ];
  const N = 260;
  const kindOf = new Uint8Array(N), slotOf = new Uint16Array(N), kStart = [];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), dQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), axis = new THREE.Vector3();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  const tmpC = new THREE.Color();
  {
    let idx = 0;
    KINDS.forEach((k, ki) => {
      kStart.push(idx);
      k.mesh = new THREE.InstancedMesh(k.geo, k.mat, k.cap);
      k.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      k.mesh.frustumCulled = false; k.mesh.castShadow = false; k.mesh.receiveShadow = false;
      for (let s = 0; s < k.cap; s++) { k.mesh.setMatrixAt(s, zeroM); k.mesh.setColorAt(s, tmpC.set(1, 1, 1)); kindOf[idx] = ki; slotOf[idx] = s; idx++; }
      k.mesh.instanceColor.needsUpdate = true;
      k.dirty = false;
      object.add(k.mesh);
    });
    kStart.push(idx);
  }
  const state = new Uint8Array(N); // 0 free, 1 flying, 2 landed
  const birth = new Float64Array(N);
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), quat = new Float32Array(N * 4), ang = new Float32Array(N * 3);
  const sx = new Float32Array(N), sy = new Float32Array(N), cmax = new Float32Array(N), age = new Float32Array(N), fl = new Float32Array(N * 3);
  let clock = 0, serial = 0;

  // ---- streamers
  const S = 14, P = 22, W = 0.005;
  const sState = new Uint8Array(S); // 0 free, 1 sim, 2 rest
  const sBirth = new Float64Array(S), sAge = new Float32Array(S), sSeg = new Float32Array(S), sPh = new Float32Array(S);
  const sp = new Float32Array(S * P * 3), sv = new Float32Array(S * P * 3), sPrev = new Float32Array(S * P * 3);
  const sPin = new Uint8Array(S * P);
  const rPos = new Float32Array(S * P * 2 * 3), rNor = new Float32Array(S * P * 2 * 3), rCol = new Float32Array(S * P * 2 * 3);
  const rIdx = [];
  for (let s = 0; s < S; s++) for (let i = 0; i < P - 1; i++) {
    const a = (s * P + i) * 2; rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let k = 1; k < rPos.length; k += 3) rPos[k] = -5;
  const rGeo = new THREE.BufferGeometry();
  rGeo.setIndex(rIdx);
  const aRP = new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage);
  const aRN = new THREE.BufferAttribute(rNor, 3).setUsage(THREE.DynamicDrawUsage);
  const aRC = new THREE.BufferAttribute(rCol, 3).setUsage(THREE.DynamicDrawUsage);
  rGeo.setAttribute('position', aRP); rGeo.setAttribute('normal', aRN); rGeo.setAttribute('color', aRC);
  const rMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide });
  const ribbons = new THREE.Mesh(rGeo, rMat);
  ribbons.frustumCulled = false;
  object.add(ribbons);

  function pickSlot(ki) {
    const a = kStart[ki], b = kStart[ki + 1];
    let oldL = -1, oldLt = Infinity, oldA = a, oldAt = Infinity;
    for (let i = a; i < b; i++) {
      if (state[i] === 0) return i;
      if (state[i] === 2 && birth[i] < oldLt) { oldLt = birth[i]; oldL = i; }
      if (birth[i] < oldAt) { oldAt = birth[i]; oldA = i; }
    }
    return oldL >= 0 ? oldL : oldA;
  }
  function pickStreamer() {
    let o = 0, ot = Infinity, oa = 0, oat = Infinity;
    for (let s = 0; s < S; s++) {
      if (sState[s] === 0) return s;
      if (sState[s] === 2 && sBirth[s] < ot) { ot = sBirth[s]; o = s; }
      if (sBirth[s] < oat) { oat = sBirth[s]; oa = s; }
    }
    return ot < Infinity ? o : oa;
  }
  const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
  function coneDir(dir, half, out) {
    // random direction within a cone around dir
    _u.set(Math.abs(dir.y) < 0.9 ? 0 : 1, Math.abs(dir.y) < 0.9 ? 1 : 0, 0).cross(dir).normalize();
    _w.crossVectors(dir, _u);
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * Math.tan(half);
    out.copy(dir).addScaledVector(_u, Math.cos(a) * r).addScaledVector(_w, Math.sin(a) * r).normalize();
    return out;
  }
  function setStreamerHidden(s) {
    const o = s * P * 2 * 3;
    for (let k = 0; k < P * 2; k++) { rPos[o + k * 3] = 0; rPos[o + k * 3 + 1] = -5; rPos[o + k * 3 + 2] = 0; }
  }

  function burst(origin, dir, o = {}) {
    const count = Math.round((o.count ?? 90) * mult);
    const nStreamers = Math.round((o.streamers ?? 6) * (0.5 + 0.5 * mult));
    const pal = o.palette || DEFAULT_PALETTE;
    _d.copy(dir).normalize();
    for (let n = 0; n < count; n++) {
      const col = pal[(Math.random() * pal.length) | 0];
      tmpC.set(col);
      const isMetal = pal === DEFAULT_PALETTE ? (col === '#e0b040' || col === '#d4d8e0' || Math.random() < 0.12) : Math.random() < 0.25;
      const circ = Math.random() < 0.33;
      const ki = (circ ? 2 : 0) + (isMetal ? 1 : 0);
      const i = pickSlot(ki);
      state[i] = 1; birth[i] = clock + (serial++) * 1e-6; age[i] = 0;
      coneDir(_d, 0.42, tmpV);
      const sp0 = 2.8 + Math.random() * 2.0;
      pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.015;
      pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.015;
      pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.015;
      vel[i * 3] = tmpV.x * sp0; vel[i * 3 + 1] = tmpV.y * sp0; vel[i * 3 + 2] = tmpV.z * sp0;
      tmpQ.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      quat[i * 4] = tmpQ.x; quat[i * 4 + 1] = tmpQ.y; quat[i * 4 + 2] = tmpQ.z; quat[i * 4 + 3] = tmpQ.w;
      axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 12);
      ang[i * 3] = axis.x; ang[i * 3 + 1] = axis.y; ang[i * 3 + 2] = axis.z;
      if (circ) { sx[i] = sy[i] = 0.007 + Math.random() * 0.003; }
      else { sx[i] = 0.008 + Math.random() * 0.0025; sy[i] = 0.0055 + Math.random() * 0.0025; }
      const vt = 0.3 + Math.random() * 0.25;
      cmax[i] = 9.8 / (vt * vt);
      fl[i * 3] = Math.random() * TAU; fl[i * 3 + 1] = 3 + Math.random() * 4; fl[i * 3 + 2] = Math.random() * TAU;
      const k = KINDS[ki];
      if (isMetal) tmpC.multiplyScalar(1.05);
      k.mesh.setColorAt(slotOf[i], tmpC);
      k.mesh.instanceColor.needsUpdate = true;
    }
    for (let n = 0; n < nStreamers; n++) {
      const s = pickStreamer();
      sState[s] = 1; sBirth[s] = clock + n * 1e-6; sAge[s] = 0; sPh[s] = Math.random() * TAU;
      const L = 0.25 + Math.random() * 0.15;
      sSeg[s] = L / (P - 1);
      coneDir(_d, 0.38, tmpV);
      const v0 = 3.4 + Math.random() * 1.6;
      _u.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const wav = Math.random() * TAU, wf = 0.5 + Math.random() * 0.6;
      tmpC.set(pal[(Math.random() * pal.length) | 0]);
      for (let i = 0; i < P; i++) {
        const j = (s * P + i) * 3, f = i / (P - 1);
        sp[j] = origin.x - tmpV.x * f * 0.01; sp[j + 1] = origin.y - tmpV.y * f * 0.01; sp[j + 2] = origin.z - tmpV.z * f * 0.01;
        const vs = v0 * (1 - 0.6 * Math.pow(f, 0.8));
        const lat = 0.6 * Math.sin(i * wf + wav) + 0.35 * Math.sin(i * wf * 2.3 + wav * 1.7);
        sv[j] = tmpV.x * vs + _u.x * lat; sv[j + 1] = tmpV.y * vs + _u.y * lat; sv[j + 2] = tmpV.z * vs + _u.z * lat;
        sPin[s * P + i] = 0;
        const o = (s * P + i) * 2 * 3;
        const shade = 0.92 + 0.08 * Math.sin(i * 0.7);
        for (let e = 0; e < 2; e++) { rCol[o + e * 3] = tmpC.r * shade; rCol[o + e * 3 + 1] = tmpC.g * shade; rCol[o + e * 3 + 2] = tmpC.b * shade; }
      }
    }
    aRC.needsUpdate = true;
  }

  const gUp = new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3(), Sd = new THREE.Vector3(), Bn = new THREE.Vector3(), Nn = new THREE.Vector3();
  function updateFlakes(dt) {
    for (let ki = 0; ki < 4; ki++) KINDS[ki].dirty = false;
    for (let i = 0; i < N; i++) {
      if (state[i] !== 1) continue;
      const a = (age[i] += dt);
      const j = i * 3;
      let vx = vel[j], vy = vel[j + 1], vz = vel[j + 2];
      const c = 0.25 + (cmax[i] - 0.25) * smooth((a - 0.12) / 0.55);
      vy -= 9.8 * dt;
      // flutter: sideways lift oscillation once the burst has slowed
      const fo = smooth((a - 0.45) / 0.4) * 2.2 * Math.sin(a * fl[j + 1] + fl[j]);
      vx += Math.cos(fl[j + 2]) * fo * dt; vz += Math.sin(fl[j + 2]) * fo * dt;
      const sp2 = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const k = 1 / (1 + c * sp2 * dt);
      vx *= k; vy *= k; vz *= k;
      vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
      let x = pos[j] + vx * dt, y = pos[j + 1] + vy * dt, z = pos[j + 2] + vz * dt;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      const ki = kindOf[i], mesh = KINDS[ki].mesh;
      KINDS[ki].dirty = true;
      if (inCounter(x, z)) {
        const h = heightFn(x, z);
        if (y <= h + 0.0015 && vy < 0 && y > h - 0.04) {
          state[i] = 2;
          pos[j + 1] = h + 0.0004 + Math.random() * 0.0009;
          tmpQ.setFromAxisAngle(gUp, Math.random() * TAU);
          dQ.setFromAxisAngle(axis.set(1, 0, 0), -Math.PI / 2 + (Math.random() - 0.5) * 0.08);
          tmpQ.multiply(dQ);
          quat[i * 4] = tmpQ.x; quat[i * 4 + 1] = tmpQ.y; quat[i * 4 + 2] = tmpQ.z; quat[i * 4 + 3] = tmpQ.w;
          tmpV.set(pos[j], pos[j + 1], pos[j + 2]);
          tmpS.set(sx[i], sy[i], 1);
          mesh.setMatrixAt(slotOf[i], tmpM.compose(tmpV, tmpQ, tmpS));
          continue;
        }
      } else if (y < -1) {
        state[i] = 0; mesh.setMatrixAt(slotOf[i], zeroM); continue;
      }
      // tumble (slower when the flake drifts slowly)
      const q = i * 4;
      tmpQ.set(quat[q], quat[q + 1], quat[q + 2], quat[q + 3]);
      const ax = ang[j], ay = ang[j + 1], az = ang[j + 2];
      const am = Math.sqrt(ax * ax + ay * ay + az * az);
      const ang1 = am * dt * (0.55 + 0.45 * Math.min(1, sp2));
      if (am > 1e-6) {
        dQ.setFromAxisAngle(axis.set(ax / am, ay / am, az / am), ang1);
        tmpQ.multiply(dQ).normalize();
        quat[q] = tmpQ.x; quat[q + 1] = tmpQ.y; quat[q + 2] = tmpQ.z; quat[q + 3] = tmpQ.w;
      }
      tmpV.set(x, y, z); tmpS.set(sx[i], sy[i], 1);
      mesh.setMatrixAt(slotOf[i], tmpM.compose(tmpV, tmpQ, tmpS));
    }
    for (let ki = 0; ki < 4; ki++) if (KINDS[ki].dirty) KINDS[ki].mesh.instanceMatrix.needsUpdate = true;
  }

  function updateStreamers(dt) {
    let any = false;
    for (let s = 0; s < S; s++) {
      if (sState[s] !== 1) continue;
      any = true;
      const age1 = (sAge[s] += dt);
      const base = s * P;
      const c = 0.35 + 9 * smooth((age1 - 0.15) / 0.6);
      let allDone = true, allGone = true;
      for (let i = 0; i < P; i++) {
        const j = (base + i) * 3;
        sPrev[j] = sp[j]; sPrev[j + 1] = sp[j + 1]; sPrev[j + 2] = sp[j + 2];
        if (sPin[base + i]) continue;
        let vx = sv[j], vy = sv[j + 1] - 9.8 * dt, vz = sv[j + 2];
        const m = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const k = 1 / (1 + c * m * dt);
        vx *= k; vy *= k; vz *= k;
        sp[j] += vx * dt; sp[j + 1] += vy * dt; sp[j + 2] += vz * dt;
      }
      // inextensible (slack allowed) constraints
      const L = sSeg[s];
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < P - 1; i++) {
          const a = (base + i) * 3, b = a + 3;
          const pa = sPin[base + i], pb = sPin[base + i + 1];
          if (pa && pb) continue;
          const dx = sp[b] - sp[a], dy = sp[b + 1] - sp[a + 1], dz = sp[b + 2] - sp[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d <= L || d < 1e-9) continue;
          const corr = (d - L) / d;
          const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
          sp[a] += dx * corr * wa; sp[a + 1] += dy * corr * wa; sp[a + 2] += dz * corr * wa;
          sp[b] -= dx * corr * wb; sp[b + 1] -= dy * corr * wb; sp[b + 2] -= dz * corr * wb;
        }
      }
      // collisions + velocities
      for (let i = 0; i < P; i++) {
        const j = (base + i) * 3;
        if (sPin[base + i]) continue;
        const x = sp[j], z = sp[j + 2];
        let vx = (sp[j] - sPrev[j]) / dt, vy = (sp[j + 1] - sPrev[j + 1]) / dt, vz = (sp[j + 2] - sPrev[j + 2]) / dt;
        if (inCounter(x, z)) {
          const h = heightFn(x, z) + 0.0012;
          if (sp[j + 1] < h && sp[j + 1] > h - 0.05) {
            sp[j + 1] = h; vy = 0; vx *= 0.4; vz *= 0.4;
            if (vx * vx + vz * vz < 0.04 || age1 > 2.5) { sPin[base + i] = 1; vx = vz = 0; }
          }
        }
        sv[j] = vx; sv[j + 1] = vy; sv[j + 2] = vz;
        if (!sPin[base + i]) allDone = false;
        if (sp[j + 1] > -1) allGone = false;
      }
      if (allGone) { sState[s] = 0; setStreamerHidden(s); continue; }
      if (allDone || age1 > 7) sState[s] = 2;
      // rebuild ribbon
      for (let i = 0; i < P; i++) {
        const j = (base + i) * 3;
        const i0 = i > 0 ? i - 1 : i, i1 = i < P - 1 ? i + 1 : i;
        const j0 = (base + i0) * 3, j1 = (base + i1) * 3;
        T.set(sp[j1] - sp[j0], sp[j1 + 1] - sp[j0 + 1], sp[j1 + 2] - sp[j0 + 2]);
        if (T.lengthSq() < 1e-12) T.set(0, 0, 1); else T.normalize();
        Sd.crossVectors(T, gUp);
        if (Sd.lengthSq() < 1e-4) Sd.set(1, 0, 0); else Sd.normalize();
        const tw = sPin[base + i] ? 0 : 1.3 * Math.sin(i * 0.55 + age1 * 6 + sPh[s]) * (1 - smooth((age1 - 1.5) / 2));
        if (tw !== 0) {
          Bn.crossVectors(T, Sd);
          const ct = Math.cos(tw), st = Math.sin(tw);
          Sd.multiplyScalar(ct).addScaledVector(Bn, st);
        }
        Nn.crossVectors(Sd, T);
        if (Nn.y < 0) Nn.negate();
        const o = (base + i) * 2 * 3;
        rPos[o] = sp[j] - Sd.x * W * 0.5; rPos[o + 1] = sp[j + 1] - Sd.y * W * 0.5; rPos[o + 2] = sp[j + 2] - Sd.z * W * 0.5;
        rPos[o + 3] = sp[j] + Sd.x * W * 0.5; rPos[o + 4] = sp[j + 1] + Sd.y * W * 0.5; rPos[o + 5] = sp[j + 2] + Sd.z * W * 0.5;
        rNor[o] = rNor[o + 3] = Nn.x; rNor[o + 1] = rNor[o + 4] = Nn.y; rNor[o + 2] = rNor[o + 5] = Nn.z;
      }
    }
    if (any) { aRP.needsUpdate = true; aRN.needsUpdate = true; }
  }

  return {
    object,
    burst,
    setHeightFn(fn) { heightFn = typeof fn === 'function' ? fn : () => 0; },
    update(dt) {
      clock += dt;
      if (dt <= 0) return;
      updateFlakes(dt);
      updateStreamers(dt);
    },
    clear() {
      for (let i = 0; i < N; i++) { if (state[i]) { state[i] = 0; KINDS[kindOf[i]].mesh.setMatrixAt(slotOf[i], zeroM); } }
      for (const k of KINDS) k.mesh.instanceMatrix.needsUpdate = true;
      for (let s = 0; s < S; s++) { sState[s] = 0; setStreamerHidden(s); }
      aRP.needsUpdate = true;
    },
    get count() { let c = 0; for (let i = 0; i < N; i++) if (state[i]) c++; return c; },
  };
}

// ============================================================== HINTS
const WARM = new THREE.Color(1.0, 0.74, 0.42);

const SPOT_VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SPOT_FS = /* glsl */`
uniform float uAlpha; uniform float uBreath; uniform vec3 uColor;
varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float pool = exp(-r * r * 3.2);
  float ringR = 0.6 + 0.05 * uBreath;
  float ring = exp(-pow((r - ringR) / 0.13, 2.0));
  float a = (pool * 0.13 + ring * (0.09 + 0.10 * uBreath)) * (1.0 - smoothstep(0.72, 1.0, r));
  gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
  
}`;
const DOT_VS = /* glsl */`
attribute vec3 iPos; attribute float iSize; attribute float iB;
uniform float uToward;
varying vec2 vUv; varying float vB;
void main(){
  vUv = uv; vB = iB;
  vec4 v = modelViewMatrix * vec4(iPos, 1.0);
  v.xyz += normalize(-v.xyz) * uToward;
  v.xy += position.xy * iSize;
  gl_Position = projectionMatrix * v;
}`;
const DOT_FS = /* glsl */`
uniform float uAlpha; uniform vec3 uColor;
varying vec2 vUv; varying float vB;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = (exp(-r * r * 22.0) * 0.95 + exp(-r * r * 5.0) * 0.16) * (1.0 - smoothstep(0.7, 1.0, r));
  vec3 c = mix(uColor, vec3(1.0, 0.95, 0.85), exp(-r * r * 30.0) * vB);
  gl_FragColor = vec4(c * a * vB * uAlpha, 1.0);
  
}`;
const GLINT_VS = /* glsl */`
uniform vec3 uPos; uniform float uSize;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 v = viewMatrix * vec4(uPos, 1.0);
  v.xyz += normalize(-v.xyz) * 0.02;
  v.xy += position.xy * uSize;
  gl_Position = projectionMatrix * v;
}`;
const GLINT_FS = /* glsl */`
uniform float uI; uniform float uRot;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float c = cos(uRot), s = sin(uRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float r = length(p);
  float core = exp(-r * r * 60.0);
  float rays = exp(-abs(p.x) * 55.0 - p.y * p.y * 4.0) + exp(-abs(p.y) * 55.0 - p.x * p.x * 4.0);
  float halo = exp(-r * r * 9.0) * 0.22;
  float a = (core * 1.3 + rays * 0.75 + halo) * (1.0 - smoothstep(0.8, 1.0, r));
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * a * uI, 1.0);
  
}`;

function buildFinger() {
  // finger axis along +Z from the tip (z=0) to the hand; dorsal (nail) side +Y.
  const SEG = 28, R0 = 0.0076, ZF = 0.085, ZEND = 0.15;
  const zs = [];
  for (let k = 1; k <= 8; k++) zs.push(R0 * (1 - Math.cos(k / 8 * Math.PI / 2)));
  for (let z = R0 + 0.003; z <= ZEND + 1e-6; z += 0.003) zs.push(z);
  const bump = (z, c, w, a) => a * Math.exp(-((z - c) / w) * ((z - c) / w));
  const prof = (z) => {
    if (z < R0) return { r: Math.sqrt(Math.max(0, R0 * R0 - (R0 - z) * (R0 - z))), hx: 0, hy: 0, cx: 0, cy: 0, a: 1 };
    const rf = R0 + (0.0092 - R0) * smooth((z - R0) / (ZF - R0)) + bump(z, 0.029, 0.0045, 0.00045) + bump(z, 0.057, 0.006, 0.0007);
    const hz = smooth((z - 0.078) / 0.065);
    return { r: rf, hx: hz * 0.026, hy: hz * 0.004, cx: hz * 0.018, cy: hz * hz * 0.007, a: 1 - smooth((z - 0.076) / 0.06) };
  };
  const skin = new THREE.Color().setRGB(0.93, 0.66, 0.58, THREE.SRGBColorSpace);
  const tipC = new THREE.Color().setRGB(0.95, 0.6, 0.53, THREE.SRGBColorSpace);
  const crease = new THREE.Color().setRGB(0.84, 0.6, 0.52, THREE.SRGBColorSpace);
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  // tip pole
  pos.push(0, -0.0006, 0); col.push(tipC.r, tipC.g, tipC.b, 1);
  for (let ri = 0; ri < zs.length; ri++) {
    const z = zs[ri], p = prof(z);
    for (let s = 0; s < SEG; s++) {
      const th = s / SEG * TAU, ct = Math.cos(th), st = Math.sin(th);
      const ex = p.r * 1.07 + p.hx, ey = p.r * (st < 0 ? 0.86 : 0.95) + p.hy;
      pos.push(p.cx + ex * ct, p.cy + ey * st - (z < R0 ? 0.0006 * (1 - z / R0) : 0), z);
      c.copy(skin).lerp(tipC, 1 - smooth(z / 0.016));
      if (st > 0) {
        const cr = (bump(z, 0.031, 0.0016, 1) + bump(z, 0.059, 0.002, 1)) * st;
        c.lerp(crease, Math.min(1, cr * 0.7));
      }
      col.push(c.r, c.g, c.b, p.a);
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + (s + 1) % SEG, 1 + s);
  for (let ri = 0; ri < zs.length - 1; ri++) {
    const a = 1 + ri * SEG, b = a + SEG;
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      idx.push(a + s, a + s1, b + s, a + s1, b + s1, b + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  // nail patch on the dorsal side near the tip
  const npos = [], nidx = [], NU = 9, NV = 7;
  for (let v = 0; v < NV; v++) {
    const z = 0.0022 + (0.0145 - 0.0022) * v / (NV - 1);
    const p = prof(z);
    const round = Math.sqrt(1 - Math.pow(1 - Math.min(1, (z - 0.0022) / 0.004), 2));
    const half = 0.78 * (0.55 + 0.45 * round);
    for (let u = 0; u < NU; u++) {
      const th = Math.PI / 2 + (u / (NU - 1) - 0.5) * 2 * half;
      const rr = p.r + 0.00035;
      npos.push(rr * 1.07 * Math.cos(th), p.cy + rr * 0.95 * Math.sin(th), z);
    }
  }
  for (let v = 0; v < NV - 1; v++) for (let u = 0; u < NU - 1; u++) {
    const a = v * NU + u; nidx.push(a, a + 1, a + NU, a + 1, a + NU + 1, a + NU);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(npos, 3));
  ng.setIndex(nidx); ng.computeVertexNormals();
  return { g, ng, skin };
}

export function createHints() {
  const object = new THREE.Group(); object.name = 'hints';

  // ---- spot
  const spotU = { uAlpha: { value: 0 }, uBreath: { value: 0 }, uColor: { value: WARM.clone() } };
  const spotMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: spotU, vertexShader: SPOT_VS, fragmentShader: SPOT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  spotMesh.rotation.x = -Math.PI / 2; spotMesh.renderOrder = 5; spotMesh.visible = false; spotMesh.frustumCulled = false;
  object.add(spotMesh);
  const spot = { on: false, a: 0, pos: new THREE.Vector3(), target: new THREE.Vector3(), r: 0.09, tr: 0.09 };

  // ---- path
  const MAXD = 64;
  const dotGeo = instancedQuads(MAXD, { iPos: 3, iSize: 1, iB: 1 });
  dotGeo.instanceCount = 0;
  const dotU = { uAlpha: { value: 0 }, uColor: { value: WARM.clone() }, uToward: { value: 0.015 } };
  const dots = new THREE.Mesh(dotGeo, new THREE.ShaderMaterial({
    uniforms: dotU, vertexShader: DOT_VS, fragmentShader: DOT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  dots.frustumCulled = false; dots.renderOrder = 6; dots.visible = false;
  object.add(dots);
  const dP = dotGeo.getAttribute('iPos'), dS = dotGeo.getAttribute('iSize'), dB = dotGeo.getAttribute('iB');
  const dDist = new Float32Array(MAXD);
  const path = { on: false, a: 0, n: 0, len: 0, pending: null };

  // ---- glint
  const glU = { uPos: { value: new THREE.Vector3() }, uSize: { value: 0.035 }, uI: { value: 0 }, uRot: { value: 0 } };
  const glintMesh = new THREE.Mesh(quadGeo(), new THREE.ShaderMaterial({
    uniforms: glU, vertexShader: GLINT_VS, fragmentShader: GLINT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glintMesh.frustumCulled = false; glintMesh.renderOrder = 7; glintMesh.visible = false;
  object.add(glintMesh);
  const glint = { on: false, a: 0 };

  // ---- finger
  const fg = buildFinger();
  const fingerRoot = new THREE.Group(); fingerRoot.rotation.order = 'YXZ'; fingerRoot.visible = false;
  fingerRoot.scale.setScalar(1.7); // life-size is only ~10 px wide on a phone: too small to notice
  const pre = new THREE.Mesh(fg.g, new THREE.MeshBasicMaterial({ colorWrite: false, vertexColors: true, alphaTest: 0.5, transparent: true }));
  pre.renderOrder = 998;
  const skinMat = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.5, roughness: 0.55, metalness: 0,
    emissive: fg.skin.clone().multiplyScalar(0.12), depthWrite: false, depthFunc: THREE.LessEqualDepth,
  });
  skinMat.onBeforeCompile = (sh) => {
    // soft form shading: skin darkens and reddens toward the silhouette (reads as a rounded finger, no outline)
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
      'float fr = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\n' +
      'outgoingLight *= mix(vec3(0.55, 0.42, 0.38), vec3(1.0), smoothstep(0.0, 0.75, fr));\n' +
      '#include <opaque_fragment>');
  };
  const fingerMesh = new THREE.Mesh(fg.g, skinMat); fingerMesh.renderOrder = 999;
  const nailMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.98, 0.84, 0.82, THREE.SRGBColorSpace), roughness: 0.25, transparent: true, opacity: 0.3,
    emissive: new THREE.Color(0.2, 0.15, 0.14), depthWrite: false,
  });
  const nail = new THREE.Mesh(fg.ng, nailMat); nail.renderOrder = 1000;
  const fingerInner = new THREE.Group();
  fingerInner.add(pre, fingerMesh, nail);
  fingerRoot.add(fingerInner);
  for (const m of [pre, fingerMesh, nail]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; }
  object.add(fingerRoot);
  const F = {
    curve: null, single: new THREE.Vector3(), active: false, stopping: false, t: 0, fade: 0,
    duration: 1.8, loop: true, pressFirst: true, wiggle: 0, tIn: 0.35, tPress: 0.3, tOut: 0.35, pause: 0.8,
    tip: new THREE.Vector3(), prevTip: new THREE.Vector3(), yaw: 0,
  };
  const finger = {
    play(points, o = {}) {
      if (!points || !points.length) { finger.stop(); return; }
      F.duration = o.duration ?? 1.8; F.loop = o.loop ?? true; F.pressFirst = o.pressFirst ?? true; F.wiggle = o.wiggle ?? 0;
      if (points.length >= 2) {
        F.curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal', 0.5);
      } else { F.curve = null; F.single.copy(points[0]); }
      F.t = 0; F.active = true; F.stopping = false; F.fade = 0;
      fingerRoot.visible = true;
    },
    stop() { if (F.active) { F.stopping = true; } },
    get active() { return F.active && !F.stopping; },
  };
  const _cp = new THREE.Vector3();
  function fingerPointAt(u, out) { if (F.curve) return F.curve.getPointAt(clamp01(u), out); return out.copy(F.single); }
  function updateFinger(dt, camera) {
    if (!F.active) return;
    if (F.stopping) {
      F.fade -= dt / 0.13;
      if (F.fade <= 0) { F.fade = 0; F.active = false; F.stopping = false; fingerRoot.visible = false; return; }
    } else {
      F.t += dt;
    }
    const press = F.pressFirst ? F.tPress : 0;
    const glide = F.curve ? F.duration : Math.max(0.6, F.duration * 0.5);
    const t1 = F.tIn, t2 = t1 + press + 0.08, t3 = t2 + glide, t4 = t3 + F.tOut, cyc = t4 + F.pause;
    let t = F.t;
    if (t >= cyc) {
      if (F.loop) { F.t -= cyc; t = F.t; } else if (!F.stopping) { F.stopping = true; }
    }
    let u = 0, lift = 0.008, fade = 1;
    if (t < t1) { const k = t / t1; fade = smooth(k); lift = 0.008 + 0.025 * (1 - smooth(k)); if (!F.pressFirst) lift = 0.025 * (1 - smooth(k)); }
    else if (t < t2) { const k = clamp01((t - t1) / Math.max(press, 1e-3)); lift = F.pressFirst ? 0.008 * (1 - smooth(k)) : 0; }
    else if (t < t3) { u = smooth((t - t2) / glide); lift = 0; }
    else if (t < t4) { const k = (t - t3) / F.tOut; u = 1; lift = 0.03 * smooth(k); fade = 1 - smooth(k); }
    else { u = 1; lift = 0.03; fade = 0; }
    if (!F.stopping) F.fade = fade; else F.fade = Math.min(F.fade, fade);
    fingerPointAt(u, F.tip);
    if (F.wiggle > 0 && t >= t2 && t < t3) {
      const w = (t - t2) * TAU * 2.6, env = Math.sin(Math.PI * clamp01((t - t2) / glide));
      F.tip.x += Math.cos(w) * F.wiggle * env; F.tip.z += Math.sin(w) * F.wiggle * env;
    }
    F.tip.y += lift;
    fingerRoot.position.copy(F.tip);
    // orientation: come from the child's side, slightly from the right, rising toward the camera
    if (camera) {
      _cp.setFromMatrixPosition(camera.matrixWorld);
      const yaw = Math.atan2(_cp.x - F.tip.x, _cp.z - F.tip.z) + 0.85;
      F.yaw = F.yaw === 0 ? yaw : damp(F.yaw, yaw, 4, dt);
    }
    fingerRoot.rotation.set(-0.8 - lift * 2, F.yaw, 0.0);
    fingerInner.rotation.z = 0.12; // a little roll so the nail catches light
    skinMat.opacity = 0.86 * F.fade;
    nailMat.opacity = 0.6 * F.fade;
    fingerRoot.visible = F.fade > 0.002;
  }

  // ---- wobble
  const WB = { obj: null, str: 1, t: 0, base: { rx: 0, rz: 0, py: 0 }, wr: { rx: NaN, rz: NaN, py: NaN } };
  function undoWobble() {
    const o = WB.obj; if (!o) return;
    if (o.rotation.x === WB.wr.rx) o.rotation.x = WB.base.rx;
    if (o.rotation.z === WB.wr.rz) o.rotation.z = WB.base.rz;
    if (o.position.y === WB.wr.py) o.position.y = WB.base.py;
    WB.wr.rx = WB.wr.rz = WB.wr.py = NaN;
  }
  function updateWobble(dt) {
    const o = WB.obj; if (!o) return;
    undoWobble();
    WB.t += dt;
    const s = Math.max(0.3, Math.min(3, WB.str));
    const per = s <= 1 ? 1.6 : s <= 2 ? 1.6 - 0.2 * (s - 1) : 1.4 - 0.3 * (s - 2);
    const A = 0.05 + 0.035 * (s - 1), H = 0.004 + 0.0035 * (s - 1);
    const tau = WB.t % per;
    let rz = 0, rx = 0, py = 0;
    if (tau < 0.6) {
      const env = Math.sin(Math.PI * tau / 0.6) * (1 - tau / 0.75);
      rz = A * Math.sin(TAU * 5.2 * tau) * env;
      rx = A * 0.35 * Math.sin(TAU * 5.2 * tau + 1.3) * env;
      if (tau < 0.26) py = H * Math.sin(Math.PI * tau / 0.26);
    }
    WB.base.rx = o.rotation.x; WB.base.rz = o.rotation.z; WB.base.py = o.position.y;
    o.rotation.x = WB.base.rx + rx; o.rotation.z = WB.base.rz + rz; o.position.y = WB.base.py + py;
    WB.wr.rx = o.rotation.x; WB.wr.rz = o.rotation.z; WB.wr.py = o.position.y;
  }

  const hints = {
    object,
    finger,
    spot(pos, radius = 0.09) {
      if (!pos) { spot.on = false; return; }
      spot.target.copy(pos); spot.tr = radius;
      if (!spot.on && spot.a < 0.02) { spot.pos.copy(pos); spot.r = radius; }
      spot.on = true;
    },
    path(points) {
      if (!points || points.length < 2) { path.on = false; path.pending = null; return; }
      const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal', 0.5);
      const len = curve.getLength();
      const n = Math.max(2, Math.min(MAXD, Math.round(len / 0.035) + 1));
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        curve.getPointAt(i / (n - 1), v);
        dP.array[i * 3] = v.x; dP.array[i * 3 + 1] = v.y; dP.array[i * 3 + 2] = v.z;
        dS.array[i] = i === n - 1 ? 0.055 : 0.034;
        dDist[i] = len * i / (n - 1);
      }
      dP.needsUpdate = dS.needsUpdate = true;
      dotGeo.instanceCount = n;
      path.n = n; path.len = len; path.on = true; path.t0 = -1;
    },
    glint(pos) {
      if (!pos) { glint.on = false; return; }
      glU.uPos.value.copy(pos); glint.on = true;
    },
    wobble(obj, strength = 1) {
      if (obj === WB.obj) { WB.str = strength; return; }
      undoWobble();
      WB.obj = obj || null; WB.str = strength; WB.t = 0.9; // first wiggle comes soon
    },
    clear() { hints.spot(null); hints.path(null); hints.glint(null); finger.stop(); hints.wobble(null); },
    update(dt, t, camera) {
      // spot
      spot.a = damp(spot.a, spot.on ? 1 : 0, 1 / 0.3 * 3, dt);
      if (spot.on) { spot.pos.lerp(spot.target, 1 - Math.exp(-8 * dt)); spot.r = damp(spot.r, spot.tr, 8, dt); }
      spotMesh.visible = spot.a > 0.003;
      if (spotMesh.visible) {
        spotMesh.position.set(spot.pos.x, spot.pos.y + 0.002, spot.pos.z);
        const s = spot.r / 0.6 * 2; spotMesh.scale.set(s, s, 1);
        const br = 0.5 + 0.5 * Math.sin(t * TAU * 1.2);
        spotU.uBreath.value = br * br * (3 - 2 * br);
        spotU.uAlpha.value = spot.a;
      }
      // path
      path.a = damp(path.a, path.on ? 1 : 0, 10, dt);
      dots.visible = path.a > 0.003 && path.n > 0;
      if (dots.visible) {
        dotU.uAlpha.value = path.a;
        const span = path.len + 0.18, speed = Math.max(0.25, Math.min(0.6, span));
        const head = ((t * speed) % span) - 0.06;
        for (let i = 0; i < path.n; i++) {
          const d = dDist[i];
          let w = d <= head ? Math.exp(-(head - d) / 0.07) : Math.exp(-((d - head) / 0.025) * ((d - head) / 0.025));
          let b = 0.32 + 0.68 * w;
          if (i === path.n - 1) b = Math.max(b, 0.6 + 0.15 * Math.sin(t * TAU * 1.2));
          dB.array[i] = b;
        }
        dB.needsUpdate = true;
      }
      // glint
      glint.a = damp(glint.a, glint.on ? 1 : 0, 10, dt);
      glintMesh.visible = glint.a > 0.003;
      if (glintMesh.visible) {
        const pz = 0.5 + 0.5 * Math.sin(t * TAU * 1.3);
        glU.uI.value = glint.a * (0.45 + 0.75 * pz * pz);
        glU.uSize.value = 0.03 + 0.012 * pz;
        glU.uRot.value = 0.3 * Math.sin(t * 0.7);
      }
      updateFinger(dt, camera);
      updateWobble(dt);
    },
  };
  return hints;
}
