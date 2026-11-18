/* hair.js — the girl's hair.
   Guide strands (≈130 × 10 nodes) are simulated on the CPU in world space (PBD + rest-shape springs,
   collisions in head-local space against skull / ears / neck / shoulders). Each frame the guides are
   up-sampled into a small float texture; ~1500 render strands (camera-facing ribbons with a procedural
   multi-hair alpha texture) are expanded entirely in the vertex shader from 3 guides each.
   Shading: MeshStandardMaterial patched with a Kajiya-Kay direct-light term, so it uses three's lights,
   shadows and scene.environment automatically.
   States per guide: wet (1→0), fluff (0→1 when drying), smooth (0→1 when brushing).
   GF.createHair({anchor, low}) — see CONTRACT.md. */
(function () {
  'use strict';
  var GF = window.GF = window.GF || {};

  var NN = 10;          // simulated nodes per guide
  var NS = 19;          // up-sampled points per guide (texture columns)
  var TW = NS + 1;      // + 1 state texel
  var SEGS = 14;        // render segments per strand
  var NCOW = 6;         // cowlick guides
  var COW_PER = 5;      // render strands per cowlick guide
  var DEG = Math.PI / 180;

  function sstep(a, b, v) { var t = (v - a) / (b - a); t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
  function c01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  // ------------------------------------------------------------------ shaders
  var VERT_HEAD = [
    'uniform highp sampler2D uHairTex;',
    'uniform mat4 uHeadMat;',
    'uniform mat4 uHeadInv;',
    'uniform float uTime;',
    'uniform vec4 uWindO;',
    'uniform vec4 uWindD;',
    'uniform float uPix;',
    'uniform float uWidthMul;',
    'attribute vec3 aG;',
    'attribute vec3 aW;',
    'attribute vec4 aS;',
    'attribute vec4 aR;',
    'attribute vec2 aQ;',
    'attribute vec3 aRoot;',
    '#ifdef HAIR_COLOR',
    'varying vec3 vHT;',
    'varying vec4 vHI;',
    'varying vec3 vHC;',
    'varying vec2 vHU;',
    '#endif',
    'vec3 hP; vec3 hN; vec3 hT;',
    '#define HNS ' + NS,
    'vec3 hFetch(int g, int j) { return texelFetch(uHairTex, ivec2(j, g), 0).xyz; }',
    'void hGuide(int g, float u, out vec3 P, out vec3 T) {',
    '  float fi = clamp(u, 0.0, 1.0) * float(HNS - 1);',
    '  int i1 = int(min(floor(fi), float(HNS - 2)));',
    '  float f = fi - float(i1);',
    '  vec3 p0 = hFetch(g, max(i1 - 1, 0)); vec3 p1 = hFetch(g, i1);',
    '  vec3 p2 = hFetch(g, i1 + 1); vec3 p3 = hFetch(g, min(i1 + 2, HNS - 1));',
    '  vec3 m1 = (i1 == 0) ? (p2 - p1) : (p2 - p0) * 0.5;',
    '  vec3 m2 = (i1 + 2 > HNS - 1) ? (p2 - p1) : (p3 - p1) * 0.5;',
    '  float f2 = f * f, f3 = f2 * f;',
    '  P = (2.0 * f3 - 3.0 * f2 + 1.0) * p1 + (f3 - 2.0 * f2 + f) * m1 + (-2.0 * f3 + 3.0 * f2) * p2 + (f3 - f2) * m2;',
    '  T = (6.0 * f2 - 6.0 * f) * p1 + (3.0 * f2 - 4.0 * f + 1.0) * m1 + (-6.0 * f2 + 6.0 * f) * p2 + (3.0 * f2 - 2.0 * f) * m2;',
    '}',
    // strand offset from the interpolated guide curve (frizz, layering, clumping, inward tips, wind flutter)
    'vec3 hOff(float s, vec3 N, vec3 B, float wet, float frz, float slk, float infl, float flag) {',
    '  float ramp = smoothstep(0.0, 0.10, s);',
    '  float ph = aR.w * 6.2832;',
    '  bool cow = flag > 0.5 && flag < 1.5;',
    '  vec3 o = N * (aR.x - 0.6) * mix(mix(0.004, 0.010, frz), 0.0012, wet) * ramp;',
    '  float cr = mix(mix(0.0022, 0.0045, frz), 0.0020 * pow(1.0 - s, 1.4) + 0.0002, wet);',
    '  if (cow) cr = 0.0012 * (1.0 - 0.6 * s);',
    '  o += (N * aR.y + B * aR.z) * cr * ramp;',
    '  float fa = cow ? 0.0 : frz;',
    '  o += (N * sin(s * 8.0 + ph) * 0.7 + B * sin(s * 11.0 + ph * 1.7)) * 0.014 * fa * s;',
    '  o += (N * sin(s * 15.0 + ph * 2.0) * 0.6 + B * cos(s * 17.0 + ph * 1.3)) * 0.005 * fa * sqrt(s) * (flag < -0.5 ? 0.4 : 1.0);',
    '  if (flag > 1.5) o += (N * (0.6 + 0.4 * sin(ph * 5.0)) * 0.040 * s * s + B * sin(ph * 3.0) * 0.025 * s) * fa;',
    '  o -= N * smoothstep(0.72, 1.0, s) * 0.008 * slk;',
    '  float fl = (1.0 - 0.85 * wet) * infl * s;',
    '  o += (B * sin(uTime * 37.0 + ph * 9.0 + s * 12.0) + N * sin(uTime * 29.0 + ph * 5.0 + s * 9.0) * 0.6) * 0.005 * fl;',
    '  return o;',
    '}',
    'void hairCompute() {',
    '  int g0 = int(aG.x + 0.5), g1 = int(aG.y + 0.5), g2 = int(aG.z + 0.5);',
    '  vec4 st = texelFetch(uHairTex, ivec2(HNS, g0), 0) * aW.x + texelFetch(uHairTex, ivec2(HNS, g1), 0) * aW.y + texelFetch(uHairTex, ivec2(HNS, g2), 0) * aW.z;',
    '  float wet = clamp(st.x, 0.0, 1.0), fl = clamp(st.y, 0.0, 1.0), sm = clamp(st.z, 0.0, 1.0);',
    '  float frz = (1.0 - wet) * fl, slk = (1.0 - wet) * sm;',
    '  float s = aS.x * aS.z;',
    '  vec3 w = pow(max(aW, vec3(1e-4)), vec3(1.0 + wet * 2.0)); w /= (w.x + w.y + w.z);',
    '  vec3 P0, T0, P1, T1, P2, T2;',
    '  hGuide(g0, s, P0, T0); hGuide(g1, s, P1, T1); hGuide(g2, s, P2, T2);',
    '  vec3 P = P0 * w.x + P1 * w.y + P2 * w.z;',
    '  vec3 G0 = hFetch(g0, 0) * w.x + hFetch(g1, 0) * w.y + hFetch(g2, 0) * w.z;',
    '  P += ((uHeadMat * vec4(aRoot, 1.0)).xyz - G0) * mix(1.0, 0.35, smoothstep(0.0, 0.5, s));',
    '  vec3 Tu = (T0 * w.x + T1 * w.y + T2 * w.z) * float(HNS - 1);',
    '  vec3 T = normalize(Tu + vec3(0.0, -1e-6, 0.0));',
    '  vec3 Pl = (uHeadInv * vec4(P, 1.0)).xyz;',
    '  vec3 ax = vec3(0.0, clamp(Pl.y, -0.32, 0.0), 0.012);',
    '  vec3 N = normalize(mat3(uHeadMat) * (Pl - ax) + vec3(1e-6));',
    '  N = normalize(N - T * dot(N, T) + vec3(1e-6));',
    '  vec3 B = cross(T, N);',
    '  float infl = 0.0;',
    '  if (uWindO.w > 0.0) {',
    '    if (uWindD.w > 0.5) infl = uWindO.w;',
    '    else { vec3 v = P - uWindO.xyz; float al = dot(v, uWindD.xyz);',
    '      if (al > 0.01) { float r = length(v - uWindD.xyz * al);',
    '        float fa = 1.0 - smoothstep(0.0, 0.47, r / al); infl = fa * fa * (1.0 - smoothstep(0.15, 0.68, al)) * uWindO.w; } }',
    '  }',
    '  vec3 o0 = hOff(s, N, B, wet, frz, slk, infl, aS.w);',
    '  vec3 o1 = hOff(s + 0.01, N, B, wet, frz, slk, infl, aS.w);',
    '  vec3 Tf = normalize(Tu * 0.01 + (o1 - o0));',
    '  P += o0;',
    '  vec3 V = cameraPosition - P; float dist = length(V); V /= max(dist, 1e-5);',
    '  vec3 side = cross(Tf, V); float sl = length(side);',
    '  side = sl > 1e-4 ? side / sl : B;',
    '  float wd = aQ.x * mix(1.0, 0.3, smoothstep(0.45, 1.0, aS.x)) * mix(0.6, 1.0, smoothstep(0.0, 0.06, aS.x));',
    '  wd *= mix(1.0, 0.75, wet) * (aS.w > 1.5 ? mix(1.0, 0.4, frz) : 1.0 + 0.5 * frz) * uWidthMul;',
    '  wd = max(wd, uPix * dist * 1.25);',
    '  hP = P + side * aS.y * wd * 0.5;',
    '  hT = Tf;',
    '  hN = normalize(N + side * aS.y * 0.35);',
    '#ifdef HAIR_COLOR',
    '  vec3 cWet = vec3(0.0065, 0.0048, 0.0040);',
    '  vec3 cSleek = vec3(0.0115, 0.0071, 0.0048);',
    '  vec3 cFluff = vec3(0.026, 0.0158, 0.0098);',
    '  vec3 c = mix(cSleek, cFluff, fl);',
    '  c = mix(c, cWet, wet);',
    '  c *= 0.86 + 0.28 * aQ.y;',
    '  c *= mix(0.45, 1.0, smoothstep(0.0, 0.2, aS.x));',
    '  c *= 1.0 + 0.22 * s * s * (1.0 - wet);',
    '  c *= mix(0.6, 1.0, aR.x);',
    '  vHC = c;',
    '  vHI = vec4(wet, frz, slk, aS.x);',
    '  vHU = vec2(aS.y * 0.5 + 0.5, s * 6.0 + aR.w * 3.0);',
    '  vHT = (viewMatrix * vec4(hT, 0.0)).xyz;',
    '#endif',
    '}'
  ].join('\n');

  var FRAG_HEAD = [
    'uniform sampler2D uStrandTex;',
    'varying vec3 vHT;',
    'varying vec4 vHI;',
    'varying vec3 vHC;',
    'varying vec2 vHU;',
    'float hairShift = 0.0;'
  ].join('\n');

  var FRAG_LIGHT = [
    '#undef RE_Direct',
    'float hKK(vec3 T, vec3 H, float e) { float th = dot(T, H); float s = sqrt(max(0.0, 1.0 - th * th)); return pow(s, e) * smoothstep(-1.0, 0.0, th); }',
    'void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {',
    '  vec3 L = directLight.direction; vec3 N = geometryNormal; vec3 V = geometryViewDir;',
    '  vec3 T = normalize(vHT + vec3(1e-6));',
    '  float NL = dot(N, L);',
    '  float wrapd = clamp((NL + 0.3) / 1.3, 0.0, 1.0);',
    '  float tl = dot(T, L); float sinTL = sqrt(max(0.0, 1.0 - tl * tl));',
    '  vec3 irr = directLight.color * wrapd * mix(1.0, sinTL, 0.35);',
    '  reflectedLight.directDiffuse += irr * BRDF_Lambert(material.diffuseColor);',
    '  vec3 Hh = normalize(L + V);',
    '  float wet = vHI.x * vHI.x, frz = vHI.y, slk = vHI.z;',
    '  float e1 = mix(mix(50.0, 200.0, slk), 320.0, wet);',
    '  float k1 = mix(mix(0.025, 0.19, slk * slk) * (1.0 - 0.5 * frz), 0.20, wet);',
    '  float e2 = mix(30.0, 90.0, slk);',
    '  float k2 = mix(0.06, 0.12, slk) * (1.0 - 0.6 * wet);',
    '  vec3 T1 = normalize(T + N * (hairShift + 0.12));',
    '  vec3 T2 = normalize(T + N * (hairShift - 0.16));',
    '  float occ = smoothstep(-0.15, 0.35, NL) * smoothstep(0.02, 0.22, vHI.w);',
    '  vec3 tint = material.diffuseColor / max(max(material.diffuseColor.r, material.diffuseColor.g), 1e-4);',
    '  vec3 spec = vec3(k1 * hKK(T1, Hh, e1)) + tint * k2 * hKK(T2, Hh, e2) * 0.5;',
    '  reflectedLight.directSpecular += spec * directLight.color * occ;',
    '}',
    '#define RE_Direct RE_Direct_Hair'
  ].join('\n');

  var FRAG_MAP = [
    'vec4 hst = texture2D(uStrandTex, vHU);',
    'float ha = hst.a;',
    'vec2 hdx = dFdx(vHU * vec2(64.0, 256.0)), hdy = dFdy(vHU * vec2(64.0, 256.0));',
    'float hlod = max(0.0, 0.5 * log2(max(dot(hdx, hdx), dot(hdy, hdy)) + 1e-6));',
    'ha = clamp(ha * (1.0 + hlod * 0.35), 0.0, 1.0);',
    'ha *= step(hst.b * 0.10, vHI.w) * step(vHI.w, 1.0 - hst.b * 0.16);',
    'diffuseColor.rgb = vHC * (0.72 + 0.56 * hst.r);',
    'diffuseColor.a = ha;',
    'hairShift = (hst.g - 0.5) * 0.3;'
  ].join('\n');

  // ------------------------------------------------------------------ factory
  GF.createHair = function (opts) {
    opts = opts || {};
    var low = !!opts.low;
    var anchor = opts.anchor || new THREE.Object3D();
    var HD = GF.HEAD, SK = HD.skull;
    var rng = GF.rng(26111901);

    // ---------- head-local geometry helpers
    function ellOnDir(dx, dy, dz, out) {
      var t = 1 / Math.sqrt((dx / SK[0]) * (dx / SK[0]) + (dy / SK[1]) * (dy / SK[1]) + (dz / SK[2]) * (dz / SK[2]));
      out[0] = dx * t; out[1] = dy * t; out[2] = dz * t; return out;
    }
    function ellNormal(p, out) {
      var x = p[0] / (SK[0] * SK[0]), y = p[1] / (SK[1] * SK[1]), z = p[2] / (SK[2] * SK[2]);
      var l = Math.sqrt(x * x + y * y + z * z) || 1; out[0] = x / l; out[1] = y / l; out[2] = z / l; return out;
    }
    var HL = [[0, 0.052], [34, 0.052], [60, 0.016], [70, -0.004], [80, -0.012], [83, 0.030], [106, 0.030], [128, -0.045], [146, -0.072], [180, -0.076]];
    function hairlineY(th) {
      for (var i = 1; i < HL.length; i++) {
        if (th <= HL[i][0]) { var a = HL[i - 1], b = HL[i]; var f = (th - a[0]) / (b[0] - a[0]); f = f * f * (3 - 2 * f); return a[1] + (b[1] - a[1]) * f; }
      }
      return HL[HL.length - 1][1];
    }
    function thetaOf(p) { return Math.atan2(Math.abs(p[0]), -p[2]) / DEG; }
    function inRegion(p, margin) { return p[1] > hairlineY(thetaOf(p)) + (margin || 0); }
    function isFringe(p) { return p[2] < 0.03 && Math.abs(p[0]) < Math.min(0.05, 0.018 + 0.3 * (0.03 - p[2])) && p[1] > 0.03; }

    var cd = HD.cowlickDir, cdl = Math.sqrt(cd[0] * cd[0] + cd[1] * cd[1] + cd[2] * cd[2]);
    var W = ellOnDir(cd[0] / cdl, cd[1] / cdl, cd[2] / cdl, [0, 0, 0]);   // whorl / crown point

    function tangentize(v, n) { var d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]; v[0] -= n[0] * d; v[1] -= n[1] * d; v[2] -= n[2] * d; var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; }
    function flowDir(p, n, fringe, out) {
      out[0] = p[0] - W[0]; out[1] = p[1] - W[1]; out[2] = p[2] - W[2];
      var len = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]);
      if (len < 1e-4) { out[0] = 0; out[1] = -0.3; out[2] = 1; }
      tangentize(out, n);
      var sw = Math.exp(-len / 0.03) * 1.6;
      var cx = n[1] * out[2] - n[2] * out[1], cy = n[2] * out[0] - n[0] * out[2], cz = n[0] * out[1] - n[1] * out[0];
      out[0] += cx * sw; out[1] += cy * sw; out[2] += cz * sw;
      if (!fringe) {
        var fwd = Math.max(0, -out[2] + 0.15);
        var sx = p[0] > 0.002 ? 1 : (p[0] < -0.002 ? -1 : (p[2] > 0 ? 1 : -1));
        out[0] += sx * 2.2 * fwd; out[1] -= 0.4 * fwd; out[2] += 0.6 * fwd;
      } else {
        out[1] -= 0.1; out[0] = out[0] * 0.5 + p[0] * 6.0;
      }
      out[1] -= 0.12;
      return tangentize(out, n);
    }

    // collision against skull / ears / neck / shoulders in head-local space. c = [x,y,z] modified in place
    var NA = HD.neckA, NB = HD.neckB, TC = HD.torsoC, TR = HD.torsoR;
    var EAR_R = 0.017;
    function collide(c, L, towel, face) {
      var x = c[0], y = c[1], z = c[2], q, s, moved = false;
      // keep long hair out of the face (beside the cheeks)
      if (face && z < -0.02 && y < 0.035) {
        var fx = 0.074 + L * 0.5, ax = Math.abs(x), fw = sstep(0.035, 0.0, y) * sstep(-0.02, -0.045, z);
        if (ax < fx && fw > 0) { var nx = (x >= 0 ? 1 : -1) * fx; x += (nx - x) * fw; moved = true; }
      }
      // skull
      var rx = SK[0] + L, ry = SK[1] + L, rz = SK[2] + L;
      var qx = x / rx, qy = y / ry, qz = z / rz; q = qx * qx + qy * qy + qz * qz;
      if (q < 1 && q > 1e-8) { s = 1 / Math.sqrt(q); x *= s; y *= s; z *= s; moved = true; }
      // towel: upper head pressed close
      if (towel > 0.001 && y > -0.035) {
        var tx = SK[0] + 0.007, ty = SK[1] + 0.007, tz = SK[2] + 0.007;
        qx = x / tx; qy = y / ty; qz = z / tz; q = qx * qx + qy * qy + qz * qz;
        if (q > 1) {
          var tw = towel * sstep(-0.035, -0.005, y); s = 1 + (1 / Math.sqrt(q) - 1) * tw;
          x *= s; y *= s; z *= s; moved = true;
        }
      }
      // ears
      for (var e = -1; e <= 1; e += 2) {
        var ex = x - e * (HD.earX + 0.004), ey = y - HD.earY, ez = z - HD.earZ, ed = ex * ex + ey * ey + ez * ez, er = EAR_R + L * 0.7;
        if (ed < er * er) { var el = Math.sqrt(ed) || 1e-4; s = er / el; x = e * (HD.earX + 0.004) + ex * s; y = HD.earY + ey * s; z = HD.earZ + ez * s; moved = true; }
      }
      // neck capsule
      var abx = NB[0] - NA[0], aby = NB[1] - NA[1], abz = NB[2] - NA[2];
      var tt = ((x - NA[0]) * abx + (y - NA[1]) * aby + (z - NA[2]) * abz) / (abx * abx + aby * aby + abz * abz);
      tt = tt < 0 ? 0 : (tt > 1 ? 1 : tt);
      var px = NA[0] + abx * tt, py = NA[1] + aby * tt, pz = NA[2] + abz * tt;
      var dx = x - px, dy = y - py, dz = z - pz, dl = dx * dx + dy * dy + dz * dz, nr = HD.neckR + L;
      if (dl < nr * nr) { var d1 = Math.sqrt(dl); if (d1 < 1e-5) { dx = 0; dy = 0; dz = 1; d1 = 1; } s = nr / d1; x = px + dx * s; y = py + dy * s; z = pz + dz * s; moved = true; }
      // shoulders / upper back (elliptic cylinder below the centre)
      var ox = x - TC[0], oy = y - TC[1], oz = z - TC[2];
      var sy = oy > 0 ? oy : 0;
      qx = ox / (TR[0] + L); qy = sy / (TR[1] + L); qz = oz / (TR[2] + L); q = qx * qx + qy * qy + qz * qz;
      if (q < 1 && q > 1e-8) { s = 1 / Math.sqrt(q); x = TC[0] + ox * s; z = TC[2] + oz * s; if (oy > 0) y = TC[1] + oy * s; moved = true; }
      c[0] = x; c[1] = y; c[2] = z;
      return moved;
    }

    // ---------- static rest shapes (relaxation under gravity against the inflated body)
    var ST = [
      // wet: plastered, limp
      { base: 0.0018, thick: 0.0030, grav: 1.0, stiff: 0.10, ang: 3, spread: 0, wave: 0, fringeThick: 0.002 },
      // fluffy: big, springy, spreading
      { base: 0.006, thick: 0.034, grav: 0.5, stiff: 0.32, ang: 30, spread: 0.55, wave: 0.016, fringeThick: 0.013 },
      // smooth: moderate volume
      { base: 0.0030, thick: 0.0085, grav: 1.0, stiff: 0.26, ang: 7, spread: 0, wave: 0, fringeThick: 0.004 }
    ];
    function liftAt(arc, P, fringe) { return P.base + (fringe ? P.fringeThick : P.thick) * sstep(0, 0.10, arc); }
    var tmpC = [0, 0, 0], relaxArcs = new Float32Array(32), relaxSegs = new Float32Array(32);
    var ARC_EXP = 1.3;
    function relax(root, n, f, len, N, P, fringe, out, seed, expo) {
      var a = P.ang * DEG, ca = Math.cos(a), sa = Math.sin(a), arcs = relaxArcs, segs = relaxSegs;
      for (var k = 0; k < N; k++) { arcs[k] = len * Math.pow(k / (N - 1), expo); segs[k] = k ? arcs[k] - arcs[k - 1] : 0; }
      var seg = len / (N - 1);
      var d0 = [f[0] * ca + n[0] * sa, f[1] * ca + n[1] * sa, f[2] * ca + n[2] * sa];
      var p0 = [root[0] + n[0] * 0.0022, root[1] + n[1] * 0.0022, root[2] + n[2] * 0.0022];
      var i, it;
      for (k = 0; k < N; k++) { out[k * 3] = p0[0] + d0[0] * arcs[k]; out[k * 3 + 1] = p0[1] + d0[1] * arcs[k]; out[k * 3 + 2] = p0[2] + d0[2] * arcs[k]; }
      for (it = 0; it < 60; it++) {
        for (k = 2; k < N; k++) {
          i = k * 3;
          out[i + 1] -= P.grav * segs[k] * 0.35;
          if (P.spread) {
            var hx = out[i], hz = out[i + 2] - 0.01, hl = Math.sqrt(hx * hx + hz * hz) || 1, sp = P.spread * seg * 0.2 * (k / (N - 1)) * (fringe ? 0.2 : 1);
            out[i] += hx / hl * sp; out[i + 2] += hz / hl * sp;
          }
        }
        out[3] = p0[0] + d0[0] * segs[1]; out[4] = p0[1] + d0[1] * segs[1]; out[5] = p0[2] + d0[2] * segs[1];
        for (k = 2; k < N; k++) {
          i = k * 3; var rr = segs[k] / segs[k - 1];
          out[i] += (out[i - 3] + (out[i - 3] - out[i - 6]) * rr - out[i]) * P.stiff;
          out[i + 1] += (out[i - 2] + (out[i - 2] - out[i - 5]) * rr - out[i + 1]) * P.stiff;
          out[i + 2] += (out[i - 1] + (out[i - 1] - out[i - 4]) * rr - out[i + 2]) * P.stiff;
        }
        for (k = 1; k < N; k++) {
          i = k * 3;
          var dx = out[i] - out[i - 3], dy = out[i + 1] - out[i - 2], dz = out[i + 2] - out[i - 1], dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          out[i] = out[i - 3] + dx / dl * segs[k]; out[i + 1] = out[i - 2] + dy / dl * segs[k]; out[i + 2] = out[i - 1] + dz / dl * segs[k];
          tmpC[0] = out[i]; tmpC[1] = out[i + 1]; tmpC[2] = out[i + 2];
          collide(tmpC, liftAt(arcs[k], P, fringe), 0, !fringe);
          out[i] = tmpC[0]; out[i + 1] = tmpC[1]; out[i + 2] = tmpC[2];
        }
      }
      if (P.wave) {   // messy waves for the blow-dried mop
        var r = GF.rng(seed), ph1 = r() * 6.28, ph2 = r() * 6.28, fq = 1.6 + r() * 1.6, amp = P.wave * (0.6 + 0.8 * r()) * (fringe ? 0.35 : 1);
        for (k = 2; k < N; k++) {
          i = k * 3; var s = k / (N - 1);
          var ax = out[i], ay = Math.min(0, Math.max(-0.32, out[i + 1])), az = out[i + 2] - 0.012;
          var nx = ax, ny = out[i + 1] - ay, nz = az, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          var tx = out[i] - out[i - 3], ty = out[i + 1] - out[i - 2], tz = out[i + 2] - out[i - 1], tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= tl; ty /= tl; tz /= tl;
          var bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
          var w1 = Math.sin(s * fq * 6.28 + ph1) * amp * s, w2 = Math.sin(s * (fq + 0.9) * 6.28 + ph2) * amp * s * 0.8;
          out[i] += nx * Math.abs(w1) * 0.8 + bx * w2; out[i + 1] += ny * Math.abs(w1) * 0.8 + by * w2; out[i + 2] += nz * Math.abs(w1) * 0.8 + bz * w2;
          tmpC[0] = out[i]; tmpC[1] = out[i + 1]; tmpC[2] = out[i + 2];
          collide(tmpC, liftAt(arcs[k], P, fringe) * 0.8, 0, !fringe);
          out[i] = tmpC[0]; out[i + 1] = tmpC[1]; out[i + 2] = tmpC[2];
        }
      }
      return out;
    }

    // ---------- guide roots
    function fibDir(i, n, out) {
      var y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = i * 2.399963229728653;
      out[0] = Math.cos(phi) * r; out[1] = y; out[2] = Math.sin(phi) * r; return out;
    }
    var gRoots = [], tmpD = [0, 0, 0];
    var nFib = low ? 210 : 290;
    for (var i = 0; i < nFib; i++) {
      fibDir(i, nFib, tmpD);
      var rp = ellOnDir(tmpD[0], tmpD[1], tmpD[2], [0, 0, 0]);
      if (inRegion(rp, 0.004)) gRoots.push(rp);
    }
    var nG = gRoots.length;
    var NROWS = nG + NCOW;

    var shapes = new Float32Array(3 * nG * NN * 3);   // [state][g][k][xyz] head-local
    var lifts = new Float32Array(3 * nG * NN);
    var segL = new Float32Array(nG), restL = new Float32Array(nG * NN);
    var gFringe = new Uint8Array(nG);
    var rootDir = new Float32Array(nG * 3);
    var gFlow = new Float32Array(nG * 3);
    var longTmp = new Float32Array(26 * 3), shp = new Float32Array(NN * 3);
    var nrm = [0, 0, 0], fl = [0, 0, 0];
    for (var g = 0; g < nG; g++) {
      var R = gRoots[g];
      ellNormal(R, nrm);
      var fr = isFringe(R);
      gFringe[g] = fr ? 1 : 0;
      flowDir(R, nrm, fr, fl);
      gFlow[g * 3] = fl[0]; gFlow[g * 3 + 1] = fl[1]; gFlow[g * 3 + 2] = fl[2];
      var rl = Math.sqrt(R[0] * R[0] + R[1] * R[1] + R[2] * R[2]);
      rootDir[g * 3] = R[0] / rl; rootDir[g * 3 + 1] = R[1] / rl; rootDir[g * 3 + 2] = R[2] / rl;
      // find length: relax a long strand in the smooth state and cut it at the style line
      var th = thetaOf(R);
      var cutY = fr ? 0.016 + (rng() - 0.5) * 0.006 : (-0.125 - 0.125 * sstep(75, 170, th) + (rng() - 0.5) * 0.018);
      var LMAX = fr ? 0.16 : 0.46, NL = 26;
      relax(R, nrm, fl, LMAX, NL, ST[2], fr, longTmp, g + 1, 1);
      var sg = LMAX / (NL - 1), L = -1;
      for (var k = 1; k < NL; k++) {
        var y0 = longTmp[(k - 1) * 3 + 1], y1 = longTmp[k * 3 + 1];
        if (k * sg > 0.02 && y1 < cutY && y0 >= cutY) { L = (k - 1 + (y0 - cutY) / Math.max(1e-6, y0 - y1)) * sg; break; }
      }
      if (L < 0) L = fr ? 0.09 : 0.30;
      L = Math.max(fr ? 0.025 : 0.04, Math.min(fr ? 0.14 : 0.42, L));
      segL[g] = L / (NN - 1);
      for (k = 1; k < NN; k++) restL[g * NN + k] = L * (Math.pow(k / (NN - 1), ARC_EXP) - Math.pow((k - 1) / (NN - 1), ARC_EXP));
      for (var s = 0; s < 3; s++) {
        relax(R, nrm, fl, L, NN, ST[s], fr, shp, g * 7 + s * 131 + 5, ARC_EXP);
        shapes.set(shp, (s * nG + g) * NN * 3);
        for (k = 0; k < NN; k++) lifts[(s * nG + g) * NN + k] = liftAt(L * Math.pow(k / (NN - 1), ARC_EXP), ST[s], fr);
      }
    }

    // neighbours (for drying / smoothing spread) and coarse regions (for serialize)
    var NBR = 5, nbr = new Int16Array(nG * NBR);
    (function () {
      var d = new Float32Array(nG);
      for (var a = 0; a < nG; a++) {
        for (var b = 0; b < nG; b++) {
          var dx = gRoots[a][0] - gRoots[b][0], dy = gRoots[a][1] - gRoots[b][1], dz = gRoots[a][2] - gRoots[b][2];
          d[b] = b === a ? 1e9 : dx * dx + dy * dy + dz * dz;
        }
        for (var j = 0; j < NBR; j++) {
          var best = 0, bv = 1e10;
          for (b = 0; b < nG; b++) if (d[b] < bv) { bv = d[b]; best = b; }
          nbr[a * NBR + j] = best; d[best] = 1e10;
        }
      }
    })();
    var NREG = 24, region = new Uint8Array(nG);
    (function () {
      var seeds = [0], md = new Float32Array(nG);
      for (var a = 0; a < nG; a++) md[a] = 1e9;
      while (seeds.length < Math.min(NREG, nG)) {
        var last = seeds[seeds.length - 1], best = 0, bv = -1;
        for (a = 0; a < nG; a++) {
          var dx = gRoots[a][0] - gRoots[last][0], dy = gRoots[a][1] - gRoots[last][1], dz = gRoots[a][2] - gRoots[last][2];
          md[a] = Math.min(md[a], dx * dx + dy * dy + dz * dz);
          if (md[a] > bv) { bv = md[a]; best = a; }
        }
        seeds.push(best);
      }
      for (a = 0; a < nG; a++) {
        var bi = 0, bd = 1e9;
        for (var j = 0; j < seeds.length; j++) {
          var e = gRoots[seeds[j]], ex = gRoots[a][0] - e[0], ey = gRoots[a][1] - e[1], ez = gRoots[a][2] - e[2], dd = ex * ex + ey * ey + ez * ez;
          if (dd < bd) { bd = dd; bi = j; }
        }
        region[a] = bi;
      }
      NREG = seeds.length;
    })();

    // ---------- cowlick (head-local construction)
    var cowRoot = W.slice(), cowN = ellNormal(cowRoot, [0, 0, 0]);
    var cowF = tangentize([1.0, 0.0, 0.35], cowN);
    var cowB = [cowN[1] * cowF[2] - cowN[2] * cowF[1], cowN[2] * cowF[0] - cowN[0] * cowF[2], cowN[0] * cowF[1] - cowN[1] * cowF[0]];
    var cowUp = new Float32Array(NCOW * NS * 3);    // 'up' pose, head-local
    var cowOff = new Float32Array(NCOW * 3);        // root offsets, head-local
    var cowLen = new Float32Array(NCOW);
    var gL = 0;
    (function () {
      var bd = 1e9;
      for (var a = 0; a < nG; a++) {
        if (gFringe[a]) continue;
        var dx = gRoots[a][0] - cowRoot[0], dy = gRoots[a][1] - cowRoot[1], dz = gRoots[a][2] - cowRoot[2], dd = dx * dx + dy * dy + dz * dz;
        if (gFlow[a * 3 + 2] < 0.1) dd += 0.01;
        if (dd < bd) { bd = dd; gL = a; }
      }
      var r = GF.rng(777);
      var cU = [cowN[0] * 0.5, cowN[1] * 0.5 + 1, cowN[2] * 0.5 - 0.3], cul = Math.sqrt(cU[0] * cU[0] + cU[1] * cU[1] + cU[2] * cU[2]);
      cU[0] /= cul; cU[1] /= cul; cU[2] /= cul;
      for (var c = 0; c < NCOW; c++) {
        var phi = r() * 6.28, rad = 0.0005 + r() * 0.0025;
        var ox = (cowF[0] * Math.cos(phi) + cowB[0] * Math.sin(phi)) * rad, oy = (cowF[1] * Math.cos(phi) + cowB[1] * Math.sin(phi)) * rad, oz = (cowF[2] * Math.cos(phi) + cowB[2] * Math.sin(phi)) * rad;
        cowOff[c * 3] = ox; cowOff[c * 3 + 1] = oy; cowOff[c * 3 + 2] = oz;
        var len = 0.068 + r() * 0.010; cowLen[c] = len;
        var beta = (c / (NCOW - 1) - 0.5) * 0.45 + (r() - 0.5) * 0.1;
        var a0 = 0.04 + r() * 0.10, a1 = 1.9 + r() * 0.4;
        var fx = cowF[0] * Math.cos(beta) + cowB[0] * Math.sin(beta), fy = cowF[1] * Math.cos(beta) + cowB[1] * Math.sin(beta), fz = cowF[2] * Math.cos(beta) + cowB[2] * Math.sin(beta);
        var px = cowRoot[0] + ox, py = cowRoot[1] + oy, pz = cowRoot[2] + oz, ds = len / (NS - 1);
        for (var j = 0; j < NS; j++) {
          var o = (c * NS + j) * 3;
          cowUp[o] = px; cowUp[o + 1] = py; cowUp[o + 2] = pz;
          var s = (j + 0.5) / (NS - 1), ang = a0 + (a1 - a0) * Math.pow(s, 4.0);
          var ca = Math.cos(ang), sa = Math.sin(ang);
          px += (cU[0] * ca + fx * sa) * ds; py += (cU[1] * ca + fy * sa) * ds; pz += (cU[2] * ca + fz * sa) * ds;
        }
      }
    })();

    // ---------- state
    var P = new Float32Array(nG * NN * 3), Q = new Float32Array(nG * NN * 3), Vv = new Float32Array(nG * NN * 3);
    var TWt = new Float32Array(nG * NN * 3), LIFT = new Float32Array(nG * NN);
    var wet = new Float32Array(nG), fluff = new Float32Array(nG), smooth = new Float32Array(nG);
    var infG = new Float32Array(nG), liftG = new Float32Array(nG), inflN = new Float32Array(NN);
    var tex = new Float32Array(TW * NROWS * 4);
    var samp = new Float32Array(nG * NS * 3);     // up-sampled guide points (world)
    var cowW = new Float32Array(NCOW * NS * 3);   // cowlick world points
    var dataTex = new THREE.DataTexture(tex, TW, NROWS, THREE.RGBAFormat, THREE.FloatType);
    dataTex.minFilter = dataTex.magFilter = THREE.NearestFilter;
    dataTex.generateMipmaps = false; dataTex.needsUpdate = true;

    var M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), Mprev = new THREE.Matrix4(), Mpi = new THREE.Matrix4(), Dm = new THREE.Matrix4();
    var inited = false, towel = 0, towelT = 0, simT = 0, lastDt = 1 / 30, prevAx = 0, prevAy = 0, prevAz = 0;
    var wind = { on: false, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1, s: 0, breeze: false, gust: 1 };
    var brushActiveT = -9, windActiveT = -9;
    var cow = { state: 'none', u: 0, uv: 0, ut: 0, w: 0, wv: 0, count: 0, pressT: -9, pressed: false };

    // up-sampling weights (Catmull-Rom, NN nodes → NS samples)
    var upI = new Int8Array(NS), upW = new Float32Array(NS * 4);
    for (var j = 0; j < NS; j++) {
      var fi = j / (NS - 1) * (NN - 1), ii = Math.min(Math.floor(fi), NN - 2), f = fi - ii, f2 = f * f, f3 = f2 * f;
      upI[j] = ii;
      upW[j * 4] = (-f3 + 2 * f2 - f) / 2; upW[j * 4 + 1] = (3 * f3 - 5 * f2 + 2) / 2; upW[j * 4 + 2] = (-3 * f3 + 4 * f2 + f) / 2; upW[j * 4 + 3] = (f3 - f2) / 2;
    }

    // ---------- transforms
    function readAnchor() {
      anchor.updateWorldMatrix(true, false);
      M.copy(anchor.matrixWorld);
      var e = M.elements, ok = true;
      for (var i = 0; i < 16; i++) if (!isFinite(e[i])) { ok = false; break; }
      if (!ok) M.identity();
      Mi.copy(M).invert();
    }
    var Me, Mie;
    function toWorld(x, y, z, arr, o) {
      arr[o] = Me[0] * x + Me[4] * y + Me[8] * z + Me[12];
      arr[o + 1] = Me[1] * x + Me[5] * y + Me[9] * z + Me[13];
      arr[o + 2] = Me[2] * x + Me[6] * y + Me[10] * z + Me[14];
    }

    // blended local target → world target (TWt) and per-node collision lift
    function computeTargets() {
      Me = M.elements;
      var gs = nG * NN * 3;
      for (var g = 0; g < nG; g++) {
        var w = wet[g], d = 1 - w, cf = d * fluff[g], cs = d - cf, cw = w;
        if (towel > 0.001) { cw = cw + (1 - cw) * towel; cf *= 1 - towel; cs *= 1 - towel; }
        var b = g * NN;
        for (var k = 0; k < NN; k++) {
          var o = (b + k) * 3;
          var x = shapes[o] * cw + shapes[gs + o] * cf + shapes[2 * gs + o] * cs;
          var y = shapes[o + 1] * cw + shapes[gs + o + 1] * cf + shapes[2 * gs + o + 1] * cs;
          var z = shapes[o + 2] * cw + shapes[gs + o + 2] * cf + shapes[2 * gs + o + 2] * cs;
          toWorld(x, y, z, TWt, o);
          var li = b + k;
          LIFT[li] = lifts[li] * cw + lifts[nG * NN + li] * cf + lifts[2 * nG * NN + li] * cs;
        }
      }
    }

    function windInfl(x, y, z) {
      if (!wind.on) return 0;
      if (wind.breeze) return wind.s * wind.gust;
      var vx = x - wind.ox, vy = y - wind.oy, vz = z - wind.oz;
      var al = vx * wind.dx + vy * wind.dy + vz * wind.dz;
      if (al <= 0.01 || al > 0.7) return 0;
      var r2 = vx * vx + vy * vy + vz * vz - al * al, ta = Math.sqrt(r2 > 0 ? r2 : 0) / al;
      if (ta >= 0.47) return 0;
      var fa = 1 - sstep(0.0, 0.47, ta);
      return fa * fa * (1 - sstep(0.15, 0.68, al)) * wind.s;
    }

    var cl = [0, 0, 0];
    function collideWorld(arr, o, L, tw, face) {
      var x = arr[o], y = arr[o + 1], z = arr[o + 2];
      cl[0] = Mie[0] * x + Mie[4] * y + Mie[8] * z + Mie[12];
      cl[1] = Mie[1] * x + Mie[5] * y + Mie[9] * z + Mie[13];
      cl[2] = Mie[2] * x + Mie[6] * y + Mie[10] * z + Mie[14];
      if (collide(cl, L, tw, face)) toWorld(cl[0], cl[1], cl[2], arr, o);
    }

    function settle() {
      readAnchor(); computeTargets();
      Me = M.elements; Mie = Mi.elements;
      P.set(TWt); Q.set(TWt); Vv.fill(0);
      for (var it = 0; it < 4; it++) {
        for (var g = 0; g < nG; g++) {
          var sg = segL[g];
          for (var k = 1; k < NN; k++) {
            var o = (g * NN + k) * 3;
            var dx = P[o] - P[o - 3], dy = P[o + 1] - P[o - 2], dz = P[o + 2] - P[o - 1], dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            sg = restL[o / 3]; P[o] = P[o - 3] + dx / dl * sg; P[o + 1] = P[o - 2] + dy / dl * sg; P[o + 2] = P[o - 1] + dz / dl * sg;
            collideWorld(P, o, Math.max(0.002, LIFT[g * NN + k] * 0.6), towel, !gFringe[g]);
          }
        }
      }
      Q.set(P);
      Mprev.copy(M); Mpi.copy(Mi);
      var e = M.elements; prevAx = e[12]; prevAy = e[13]; prevAz = e[14];
      cow.u = cow.state === 'up' ? 1 : 0; cow.uv = 0; cow.ut = cow.u; cow.w = 0; cow.wv = 0;
      inited = true;
      upsample(); updateCowlick(0); writeTexture();
    }

    // ---------- simulation step
    function simulate(dt, t) {
      Me = M.elements; Mie = Mi.elements;
      var n3 = nG * NN * 3, i, o;
      // carry most of the head motion rigidly; the rest becomes inertia (lag / sway)
      Dm.multiplyMatrices(M, Mpi);
      var de = Dm.elements, CARRY = 0.8;
      for (o = 0; o < n3; o += 3) {
        var x = P[o], y = P[o + 1], z = P[o + 2];
        P[o] += (de[0] * x + de[4] * y + de[8] * z + de[12] - x) * CARRY;
        P[o + 1] += (de[1] * x + de[5] * y + de[9] * z + de[13] - y) * CARRY;
        P[o + 2] += (de[2] * x + de[6] * y + de[10] * z + de[14] - z) * CARRY;
      }
      Q.set(P);
      var anyWind = false, idt = 1 / dt;
      for (var g = 0; g < nG; g++) {
        var w = wet[g], d = 1 - w, base = g * NN, sg = segL[g];
        var damp = Math.exp(-(2.6 + 5 * w) * dt);
        var gy = -(1.2 + 2.6 * w);
        var wAcc = 70 * d + 6 * w, tAcc = (55 * d + 4 * w) * (wind.breeze ? 0.4 : 1);
        var kRel = 1 - Math.exp(-(24 - 10 * w) * dt);
        var maxInf = 0, sumInf = 0;
        // root
        o = base * 3;
        P[o] = TWt[o]; P[o + 1] = TWt[o + 1]; P[o + 2] = TWt[o + 2];
        // integrate
        for (var k = 1; k < NN; k++) {
          o = (base + k) * 3;
          var vx = Vv[o] * damp, vy = Vv[o + 1] * damp + gy * dt, vz = Vv[o + 2] * damp;
          var inf = windInfl(P[o], P[o + 1], P[o + 2]);
          inflN[k] = inf;
          if (inf > 0) {
            if (inf > maxInf) maxInf = inf;
            sumInf += inf;
            var nt = t * (wind.breeze ? 1.3 : 6.5);
            var tx = GF.noise2(nt + g * 0.73, k * 0.41) - 0.5, ty = GF.noise2(nt + 17.3 + g * 0.61, k * 0.37 + 5) - 0.5, tz = GF.noise2(nt + 41.1 + g * 0.57, k * 0.43 + 9) - 0.5;
            var sk = k / (NN - 1);
            vx += (wind.dx * wAcc + tx * 2 * tAcc) * inf * dt * sk;
            vy += (wind.dy * wAcc + ty * 2 * tAcc + 8 * d * (wind.breeze ? 0 : 1)) * inf * dt * sk;
            vz += (wind.dz * wAcc + tz * 2 * tAcc) * inf * dt * sk;
          }
          var vl = vx * vx + vy * vy + vz * vz;
          if (vl > 9) { vl = 3 / Math.sqrt(vl); vx *= vl; vy *= vl; vz *= vl; }
          P[o] += vx * dt; P[o + 1] += vy * dt; P[o + 2] += vz * dt;
        }
        // rest-shape springs (relative to the parent node + weak absolute) , length, collision
        for (k = 1; k < NN; k++) {
          o = (base + k) * 3;
          var sk2 = k / (NN - 1);
          var hold = 1 - 0.85 * inflN[k] * (1 - 0.8 * w);
          var kr = (k === 1 ? 0.9 : kRel) * hold;
          var ka = (1 - Math.exp(-(1.5 + 9 * (1 - sk2) * (1 - sk2)) * dt)) * hold;
          var tx2 = P[o - 3] + TWt[o] - TWt[o - 3], ty2 = P[o - 2] + TWt[o + 1] - TWt[o - 2], tz2 = P[o - 1] + TWt[o + 2] - TWt[o - 1];
          P[o] += (tx2 - P[o]) * kr; P[o + 1] += (ty2 - P[o + 1]) * kr; P[o + 2] += (tz2 - P[o + 2]) * kr;
          P[o] += (TWt[o] - P[o]) * ka; P[o + 1] += (TWt[o + 1] - P[o + 1]) * ka; P[o + 2] += (TWt[o + 2] - P[o + 2]) * ka;
          var dx = P[o] - P[o - 3], dy = P[o + 1] - P[o - 2], dz = P[o + 2] - P[o - 1], dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          sg = restL[o / 3]; P[o] = P[o - 3] + dx / dl * sg; P[o + 1] = P[o - 2] + dy / dl * sg; P[o + 2] = P[o - 1] + dz / dl * sg;
          collideWorld(P, o, Math.max(0.0025, LIFT[base + k] * 0.55), towel, !gFringe[g]);
          var nvx = (P[o] - Q[o]) * idt, nvy = (P[o + 1] - Q[o + 1]) * idt, nvz = (P[o + 2] - Q[o + 2]) * idt;
          var nl = nvx * nvx + nvy * nvy + nvz * nvz;
          if (nl > 9) { nl = 3 / Math.sqrt(nl); nvx *= nl; nvy *= nl; nvz *= nl; }
          Vv[o] = nvx; Vv[o + 1] = nvy; Vv[o + 2] = nvz;
        }
        infG[g] = 0.5 * maxInf + 0.5 * sumInf / (NN - 1);
        if (maxInf > 0.05) anyWind = true;
      }
      if (anyWind && !wind.breeze) windActiveT = t;
      // drying (directly blown ≈1.3 s), drying spreads to neighbours while the dryer works on the head
      var spreadOn = (t - windActiveT) < 0.3, brushOn = (t - brushActiveT) < 0.3;
      var spW = 1 - Math.exp(-0.35 * dt), spS = 1 - Math.exp(-1.1 * dt);
      for (g = 0; g < nG; g++) {
        var wg = wet[g];
        if (!wind.breeze) wg -= dt * infG[g] / 1.3;
        if (spreadOn) {
          var av = 0; for (var j = 0; j < NBR; j++) av += wet[nbr[g * NBR + j]]; av /= NBR;
          if (av < wg) wg += (av - wg) * spW;
          wg -= dt * 0.012;
        }
        wet[g] = wg < 0 ? 0 : wg;
        if (brushOn) {
          var as = 0; for (j = 0; j < NBR; j++) as += smooth[nbr[g * NBR + j]]; as /= NBR;
          if (as > smooth[g]) smooth[g] += (as - smooth[g]) * spS;
          smooth[g] = Math.min(1, smooth[g] + dt * 0.03);
        }
        var fmax = 1 - smooth[g];
        var ft = (1 - wet[g]) * fmax;
        if (fluff[g] < ft) fluff[g] = ft;
        if (fluff[g] > fmax) fluff[g] = fmax;
      }
    }

    // NN nodes → NS samples per guide (world)
    function upsample() {
      for (var g = 0; g < nG; g++) {
        var b = g * NN * 3;
        for (var j = 0; j < NS; j++) {
          var i1 = upI[j], o = (g * NS + j) * 3;
          for (var c = 0; c < 3; c++) {
            var p1 = P[b + i1 * 3 + c], p2 = P[b + (i1 + 1) * 3 + c];
            var p0 = i1 > 0 ? P[b + (i1 - 1) * 3 + c] : 2 * p1 - p2;
            var p3 = i1 + 2 < NN ? P[b + (i1 + 2) * 3 + c] : 2 * p2 - p1;
            samp[o + c] = p0 * upW[j * 4] + p1 * upW[j * 4 + 1] + p2 * upW[j * 4 + 2] + p3 * upW[j * 4 + 3];
          }
        }
      }
    }

    // ---------- cowlick
    var cowLy = [0, 0, 0];
    function updateCowlick(dt) {
      Me = M.elements;
      // spring
      var n = dt > 0 ? Math.max(1, Math.ceil(dt / 0.016)) : 0, h = n ? dt / n : 0;
      if (cow.state === 'pinned') cow.ut = -0.03;
      else if (cow.state === 'none') cow.ut = 0;
      else cow.ut = (simT - cow.pressT) < 0.25 ? 0.06 : 1;
      if (cow.state === 'up' && cow.pressed && (simT - cow.pressT) >= 0.25) { cow.pressed = false; doPop(); }
      for (var s = 0; s < n; s++) {
        var K = cow.ut < 0.5 ? 700 : 380;
        cow.uv += (K * (cow.ut - cow.u) - 9 * cow.uv) * h; cow.u += cow.uv * h;
        cow.wv += (-300 * cow.w - 5 * cow.wv) * h; cow.w += cow.wv * h;
      }
      if (!isFinite(cow.u) || !isFinite(cow.w)) { cow.u = cow.ut; cow.uv = 0; cow.w = 0; cow.wv = 0; }
      var u = Math.max(-0.15, Math.min(1.4, cow.u));
      // lying pose follows the guide gL (translated to the cowlick root)
      var gb = gL * NS * 3, Lg = segL[gL] * (NN - 1);
      var rootW0 = 0, rootW1 = 0, rootW2 = 0;
      toWorld(cowRoot[0], cowRoot[1], cowRoot[2], cowLy, 0);
      rootW0 = cowLy[0] - samp[gb]; rootW1 = cowLy[1] - samp[gb + 1]; rootW2 = cowLy[2] - samp[gb + 2];
      var bx = Me[0] * cowB[0] + Me[4] * cowB[1] + Me[8] * cowB[2], by = Me[1] * cowB[0] + Me[5] * cowB[1] + Me[9] * cowB[2], bz = Me[2] * cowB[0] + Me[6] * cowB[1] + Me[10] * cowB[2];
      for (var c = 0; c < NCOW; c++) {
        var ox = Me[0] * cowOff[c * 3] + Me[4] * cowOff[c * 3 + 1] + Me[8] * cowOff[c * 3 + 2];
        var oy = Me[1] * cowOff[c * 3] + Me[5] * cowOff[c * 3 + 1] + Me[9] * cowOff[c * 3 + 2];
        var oz = Me[2] * cowOff[c * 3] + Me[6] * cowOff[c * 3 + 1] + Me[10] * cowOff[c * 3 + 2];
        var frac = Math.pow(Math.min(1, cowLen[c] / Math.max(0.01, Lg)), 1 / ARC_EXP);
        for (var j = 0; j < NS; j++) {
          var sj = j / (NS - 1), fi = sj * frac * (NS - 1), i0 = Math.min(NS - 2, Math.floor(fi)), ff = fi - i0;
          var a = gb + i0 * 3;
          var lx = samp[a] + (samp[a + 3] - samp[a]) * ff + rootW0 * (1 - sj * 0.5) + ox;
          var ly = samp[a + 1] + (samp[a + 4] - samp[a + 1]) * ff + rootW1 * (1 - sj * 0.5) + oy;
          var lz = samp[a + 2] + (samp[a + 5] - samp[a + 2]) * ff + rootW2 * (1 - sj * 0.5) + oz;
          var q = (c * NS + j) * 3;
          var ux = cowUp[q], uy = cowUp[q + 1], uz = cowUp[q + 2];
          var wx = Me[0] * ux + Me[4] * uy + Me[8] * uz + Me[12], wy = Me[1] * ux + Me[5] * uy + Me[9] * uz + Me[13], wz = Me[2] * ux + Me[6] * uy + Me[10] * uz + Me[14];
          var px = lx + (wx - lx) * u, py = ly + (wy - ly) * u, pz = lz + (wz - lz) * u;
          var s15 = Math.pow(sj, 1.5) * c01(u);
          px += bx * cow.w * s15 * 0.03; py += by * cow.w * s15 * 0.03; pz += bz * cow.w * s15 * 0.03;
          if (wind.on && j > 0 && u > 0.2) {
            var inf = windInfl(px, py, pz) * c01(u), s2 = sj * sj;
            if (inf > 0) {
              var nt = simT * 7 + c * 1.3;
              var tt = GF.noise2(nt, j * 0.2) - 0.5, t2 = GF.noise2(nt + 9.1, j * 0.2 + 3) - 0.5;
              px += (wind.dx * 0.03 + bx * tt * 0.04) * inf * s2; py += (wind.dy * 0.03 + t2 * 0.03) * inf * s2; pz += (wind.dz * 0.03 + bz * tt * 0.04) * inf * s2;
            }
          }
          cowW[q] = px; cowW[q + 1] = py; cowW[q + 2] = pz;
        }
      }
    }
    function doPop() {
      cow.state = 'up'; cow.ut = 1; cow.uv += 9; cow.wv += (cow.count % 2 ? -1 : 1) * 3.5;
      cow.count++;
      if (typeof api.onPop === 'function') { try { api.onPop(cow.count); } catch (e) { /* game callback errors are not ours */ } }
    }

    function writeTexture() {
      var g, j, o, s;
      for (g = 0; g < nG; g++) {
        for (j = 0; j < NS; j++) {
          o = (g * TW + j) * 4; s = (g * NS + j) * 3;
          tex[o] = samp[s]; tex[o + 1] = samp[s + 1]; tex[o + 2] = samp[s + 2]; tex[o + 3] = 1;
        }
        o = (g * TW + NS) * 4;
        tex[o] = wet[g]; tex[o + 1] = fluff[g]; tex[o + 2] = smooth[g]; tex[o + 3] = 0;
      }
      for (var c = 0; c < NCOW; c++) {
        g = nG + c;
        for (j = 0; j < NS; j++) {
          o = (g * TW + j) * 4; s = (c * NS + j) * 3;
          tex[o] = cowW[s]; tex[o + 1] = cowW[s + 1]; tex[o + 2] = cowW[s + 2]; tex[o + 3] = 1;
        }
        o = (g * TW + NS) * 4;
        tex[o] = wet[gL]; tex[o + 1] = fluff[gL]; tex[o + 2] = smooth[gL]; tex[o + 3] = 0;
      }
      dataTex.needsUpdate = true;
      cap.matrix.copy(M); cap.matrixWorldNeedsUpdate = true;
      U.uHeadMat.value.copy(M); U.uHeadInv.value.copy(Mi);
      if (wind.on) {
        U.uWindO.value.set(wind.ox, wind.oy, wind.oz, wind.s * (wind.breeze ? wind.gust : 1));
        U.uWindD.value.set(wind.dx, wind.dy, wind.dz, wind.breeze ? 1 : 0);
      } else U.uWindO.value.w = 0;
    }

    // ---------- render strands
    var U = {
      uHairTex: { value: dataTex },
      uHeadMat: { value: new THREE.Matrix4() },
      uHeadInv: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uWindO: { value: new THREE.Vector4(0, 0, 0, 0) },
      uWindD: { value: new THREE.Vector4(0, 0, -1, 0) },
      uPix: { value: 0.001 },
      uWidthMul: { value: 1 },
      uStrandTex: { value: null }
    };
    var Udepth = { uWidthMul: { value: 2.2 } };

    var strandTex = GF.canvasTex(64, 256, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var r = GF.rng(4242);
      var nh = 9;
      for (var i = 0; i < nh; i++) {
        var x0 = 5 + (i + 0.5) * (w - 10) / nh + (r() - 0.5) * 3, k = 1 + Math.floor(r() * 3), ph = r() * 6.28, amp = 0.6 + r() * 1.6;
        var lw = 2.8 + r() * 2.4, br = Math.floor(70 + r() * 185), sh = Math.floor(r() * 255);
        ctx.strokeStyle = 'rgb(' + br + ',' + sh + ',' + Math.floor(20 + r() * 235) + ')'; ctx.lineWidth = lw; ctx.lineCap = 'butt';
        ctx.beginPath();
        for (var y = -4; y <= h + 4; y += 4) {
          var x = x0 + Math.sin(y / h * 6.2832 * k + ph) * amp;
          if (y === -4) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }, { srgb: false, repeat: [1, 1] });
    strandTex.wrapS = THREE.ClampToEdgeWrapping;
    U.uStrandTex.value = strandTex;

    // render strand roots
    var nStr = low ? 760 : 1530;
    var strands = [];
    (function () {
      var target = nStr, nf = Math.round(target / (nG / nFib) / 0.75), roots = [], i, r = GF.rng(99), tries = 0;
      while (roots.length < target && tries < 4) {
        roots.length = 0;
        for (i = 0; i < nf; i++) {
          fibDir(i, nf, tmpD);
          tmpD[0] += (r() - 0.5) * 0.02; tmpD[1] += (r() - 0.5) * 0.02; tmpD[2] += (r() - 0.5) * 0.02;
          var p = ellOnDir(tmpD[0], tmpD[1], tmpD[2], [0, 0, 0]);
          if (inRegion(p, 0.002) && r() < 0.6 + 0.4 * sstep(0.02, 0.085, p[1])) roots.push(p);
        }
        nf = Math.round(nf * 1.12); tries++;
      }
      while (roots.length > target) roots.splice(Math.floor(r() * roots.length), 1);
      var dd = new Float32Array(nG);
      for (i = 0; i < roots.length; i++) {
        var p2 = roots[i], fr = isFringe(p2), cnt = 0;
        ellNormal(p2, nrm); flowDir(p2, nrm, fr, fl);
        for (var g = 0; g < nG; g++) {
          var dx = p2[0] - gRoots[g][0], dy = p2[1] - gRoots[g][1], dz = p2[2] - gRoots[g][2];
          var fd = fl[0] * gFlow[g * 3] + fl[1] * gFlow[g * 3 + 1] + fl[2] * gFlow[g * 3 + 2];
          dd[g] = (gFringe[g] === (fr ? 1 : 0)) ? Math.sqrt(dx * dx + dy * dy + dz * dz) * (1 + 3 * (1 - fd)) : 1e9;
          if (dd[g] < 1e8) cnt++;
        }
        if (cnt < 4) for (g = 0; g < nG; g++) { var ex = p2[0] - gRoots[g][0], ey = p2[1] - gRoots[g][1], ez = p2[2] - gRoots[g][2]; dd[g] = Math.sqrt(ex * ex + ey * ey + ez * ez); }
        var idx = [0, 0, 0, 0], dv = [0, 0, 0, 0];
        for (var m = 0; m < 4; m++) {
          var bi = 0, bv = 1e10;
          for (g = 0; g < nG; g++) if (dd[g] < bv) { bv = dd[g]; bi = g; }
          idx[m] = bi; dv[m] = bv; dd[bi] = 1e10;
        }
        var w0 = Math.pow(Math.max(0, 1 - dv[0] / dv[3]), 2) + 1e-4, w1 = Math.pow(Math.max(0, 1 - dv[1] / dv[3]), 2), w2 = Math.pow(Math.max(0, 1 - dv[2] / dv[3]), 2), ws = w0 + w1 + w2;
        var ang = r() * 6.2832, rad = Math.sqrt(r());
        var flag = fr ? -1 : (r() < 0.06 ? 2 : 0);
        strands.push({ root: [p2[0] + nrm[0] * 0.0022, p2[1] + nrm[1] * 0.0022, p2[2] + nrm[2] * 0.0022], g: [idx[0], idx[1], idx[2]], w: [w0 / ws, w1 / ws, w2 / ws], len: fr ? 0.9 + r() * 0.1 : 0.84 + r() * 0.16, flag: flag,
          rr: [Math.pow(r(), 0.7), Math.cos(ang) * rad, Math.sin(ang) * rad, r()], wd: (fr ? 0.0026 : 0.0031) * (0.8 + r() * 0.4), tint: r() });
      }
      // shuffle so that a draw range keeps an even coverage
      for (i = strands.length - 1; i > 0; i--) { var jj = Math.floor(r() * (i + 1)), tmp = strands[i]; strands[i] = strands[jj]; strands[jj] = tmp; }
      var cs = [];
      for (var c = 0; c < NCOW; c++) for (var q = 0; q < COW_PER; q++) {
        var a2 = r() * 6.2832, rd = Math.sqrt(r());
        cs.push({ root: [cowRoot[0] + cowOff[c * 3], cowRoot[1] + cowOff[c * 3 + 1], cowRoot[2] + cowOff[c * 3 + 2]], g: [nG + c, nG + c, nG + c], w: [1, 0, 0], len: 0.86 + r() * 0.14, flag: 1, rr: [0.5 + r() * 0.5, Math.cos(a2) * rd, Math.sin(a2) * rd, r()], wd: 0.0022 * (0.8 + r() * 0.4), tint: r() });
      }
      strands = cs.concat(strands);
    })();
    var nCowStr = NCOW * COW_PER, nAll = strands.length;
    var VPS = (SEGS + 1) * 2, nV = nAll * VPS;
    var aG = new Float32Array(nV * 3), aW = new Float32Array(nV * 3), aS = new Float32Array(nV * 4), aR = new Float32Array(nV * 4), aQ = new Float32Array(nV * 2), aRoot = new Float32Array(nV * 3);
    var idxArr = nV > 65535 ? new Uint32Array(nAll * SEGS * 6) : new Uint16Array(nAll * SEGS * 6);
    (function () {
      var v = 0, ii = 0;
      for (var si = 0; si < nAll; si++) {
        var st = strands[si], vb = v;
        for (var r = 0; r <= SEGS; r++) {
          for (var sd = -1; sd <= 1; sd += 2) {
            aG[v * 3] = st.g[0]; aG[v * 3 + 1] = st.g[1]; aG[v * 3 + 2] = st.g[2];
            aW[v * 3] = st.w[0]; aW[v * 3 + 1] = st.w[1]; aW[v * 3 + 2] = st.w[2];
            aS[v * 4] = r / SEGS; aS[v * 4 + 1] = sd; aS[v * 4 + 2] = st.len; aS[v * 4 + 3] = st.flag;
            aR[v * 4] = st.rr[0]; aR[v * 4 + 1] = st.rr[1]; aR[v * 4 + 2] = st.rr[2]; aR[v * 4 + 3] = st.rr[3];
            aQ[v * 2] = st.wd; aQ[v * 2 + 1] = st.tint;
            aRoot[v * 3] = st.root[0]; aRoot[v * 3 + 1] = st.root[1]; aRoot[v * 3 + 2] = st.root[2];
            v++;
          }
        }
        for (r = 0; r < SEGS; r++) {
          var a = vb + r * 2;
          idxArr[ii++] = a; idxArr[ii++] = a + 1; idxArr[ii++] = a + 2;
          idxArr[ii++] = a + 1; idxArr[ii++] = a + 3; idxArr[ii++] = a + 2;
        }
      }
    })();
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    geo.setAttribute('aG', new THREE.BufferAttribute(aG, 3));
    geo.setAttribute('aW', new THREE.BufferAttribute(aW, 3));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
    geo.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 2));
    geo.setAttribute('aRoot', new THREE.BufferAttribute(aRoot, 3));
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e4, -1e4, -1e4), new THREE.Vector3(1e4, 1e4, 1e4));

    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.38 });
    mat.alphaToCoverage = !low;
    mat.envMapIntensity = 0.4;
    mat.defines = { HAIR_COLOR: '' };
    mat.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <beginnormal_vertex>', 'hairCompute();\nvec3 objectNormal = hN;')
        .replace('#include <begin_vertex>', 'vec3 transformed = hP;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(0.58, 0.45, vHI.z), 0.28, vHI.x);')
        .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;')
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= mix(0.12, 0.7, vHI.x * vHI.x);\n#endif')
        .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + FRAG_LIGHT);
    };
    mat.customProgramCacheKey = function () { return 'gf-hair-strands-1'; };

    var depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    depthMat.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.uniforms.uWidthMul = Udepth.uWidthMul;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
        .replace('#include <begin_vertex>', 'hairCompute();\nvec3 transformed = hP;');
    };
    depthMat.customProgramCacheKey = function () { return 'gf-hair-depth-1'; };

    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'hairStrands';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = depthMat;
    var szTmp = new THREE.Vector2();
    mesh.onBeforeRender = function (renderer, scene, camera) {
      var h = 0, rt = renderer.getRenderTarget();
      if (rt) h = rt.height; else { renderer.getDrawingBufferSize(szTmp); h = szTmp.y; }
      var p5 = camera.projectionMatrix.elements[5];
      if (h > 0 && p5 > 0 && !camera.isOrthographicCamera) U.uPix.value = 2 / (p5 * h);
      else U.uPix.value = 0;
    };

    // ---------- dark under-cap on the scalp
    var cap = (function () {
      var nu = low ? 40 : 64, nv = low ? 28 : 44, pos = [], ind = [], ok = [], vi = [], p = [0, 0, 0];
      for (var a = 0; a <= nv; a++) {
        for (var b = 0; b <= nu; b++) {
          var th = a / nv * Math.PI, ph = b / nu * Math.PI * 2;
          var dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = -Math.sin(th) * Math.cos(ph);
          ellOnDir(dx, dy, dz, p);
          var n = ellNormal(p, [0, 0, 0]);
          var inside = inRegion(p, 0.004);
          ok.push(inside);
          vi.push(pos.length / 3);
          pos.push(p[0] + n[0] * 0.0006, p[1] + n[1] * 0.0006, p[2] + n[2] * 0.0006);
        }
      }
      for (a = 0; a < nv; a++) for (b = 0; b < nu; b++) {
        var i0 = a * (nu + 1) + b, i1 = i0 + 1, i2 = i0 + nu + 1, i3 = i2 + 1;
        if (ok[i0] && ok[i2] && ok[i1]) ind.push(i0, i1, i2);
        if (ok[i1] && ok[i2] && ok[i3]) ind.push(i1, i3, i2);
      }
      var cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      cg.setIndex(ind);
      cg.computeVertexNormals();
      var cm = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
      cm.color.setRGB(0.0075, 0.0047, 0.0032);
      var wn = ellNormal(W, [0, 0, 0]), e1 = tangentize([0, 0, -1], wn), e2 = [wn[1] * e1[2] - wn[2] * e1[1], wn[2] * e1[0] - wn[0] * e1[2], wn[0] * e1[1] - wn[1] * e1[0]];
      var cu = { uW: { value: new THREE.Vector3(W[0], W[1], W[2]) }, uE1: { value: new THREE.Vector3(e1[0], e1[1], e1[2]) }, uE2: { value: new THREE.Vector3(e2[0], e2[1], e2[2]) } };
      cm.onBeforeCompile = function (sh) {
        for (var k in cu) sh.uniforms[k] = cu[k];
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCapL = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapL;\nuniform vec3 uW; uniform vec3 uE1; uniform vec3 uE2;')
          .replace('#include <map_fragment>', [
            'vec3 cd = vCapL - uW; float ca = atan(dot(cd, uE2), dot(cd, uE1)); float cr = length(cd);',
            'float ct = ca / 6.2832 * 300.0 + sin(cr * 70.0 + ca * 3.0) * 0.8;',
            'float cid = floor(ct), cf = fract(ct);',
            'float ch = fract(sin(cid * 12.9898) * 43758.5453);',
            'float cline = smoothstep(0.0, 0.35, cf) * smoothstep(1.0, 0.65, cf);',
            'diffuseColor.rgb *= mix(0.5, 1.35, ch) * mix(0.55, 1.0, cline);'].join('\n'));
      };
      cm.customProgramCacheKey = function () { return 'gf-hair-cap-1'; };
      var m = new THREE.Mesh(cg, cm);
      m.name = 'hairCap';
      m.matrixAutoUpdate = false;
      m.castShadow = true; m.receiveShadow = true;
      return m;
    })();

    var group = new THREE.Group();
    group.name = 'hair';
    group.add(cap, mesh);

    function setDetail(f) {
      f = Math.max(0.4, Math.min(1, num(f, 1)));
      var n = nCowStr + Math.round((nAll - nCowStr) * f);
      geo.setDrawRange(0, n * SEGS * 6);
    }

    // ---------- outer hair volume (for surfacePoint)
    function updateLiftG() {
      for (var g = 0; g < nG; g++) {
        var d = 1 - wet[g];
        liftG[g] = 0.004 + d * (fluff[g] * 0.034 + (1 - fluff[g]) * 0.007) + (1 - d) * 0.001;
      }
    }
    function localLift(x, y, z) {
      var l = Math.sqrt(x * x + y * y + z * z) || 1, dx = x / l, dy = y / l, dz = z / l, sw = 0, sl = 0;
      for (var g = 0; g < nG; g++) {
        var c = dx * rootDir[g * 3] + dy * rootDir[g * 3 + 1] + dz * rootDir[g * 3 + 2];
        if (c < 0.6) continue;
        var w = Math.exp((c - 1) * 30);
        sw += w; sl += w * liftG[g];
      }
      return sw > 1e-6 ? sl / sw : 0.006;
    }
    function sdBox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
      var qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
      var ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
    }
    function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
    function sdf(x, y, z) {
      var L = localLift(x, y, z);
      var rx = SK[0] + L, ry = SK[1] + L, rz = SK[2] + L;
      var k0 = Math.sqrt((x / rx) * (x / rx) + (y / ry) * (y / ry) + (z / rz) * (z / rz));
      var k1 = Math.sqrt((x / (rx * rx)) * (x / (rx * rx)) + (y / (ry * ry)) * (y / (ry * ry)) + (z / (rz * rz)) * (z / (rz * rz)));
      var e = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -0.05;
      var zb = 0.095 + L * 0.9;
      var back = sdBox(x, y, z, 0, -0.14, (0.03 + zb) / 2, 0.078 + L * 0.8, 0.12, (zb - 0.03) / 2, 0.012);
      var sides = sdBox(x, y, z, 0, -0.08, 0.025, 0.084 + L, 0.08, 0.055, 0.015);
      sides = Math.max(sides, 0.055 - Math.abs(x));
      return smin(e, Math.min(back, sides), 0.03);
    }
    var rO = [0, 0, 0], rD = [0, 0, 0];
    function surfacePoint(origin, dir, out) {
      if (!origin || !dir || !out) return false;
      if (!inited) settle();
      Mie = Mi.elements; Me = M.elements;
      var ox = num(origin.x, NaN), oy = num(origin.y, NaN), oz = num(origin.z, NaN), dx = num(dir.x, NaN), dy = num(dir.y, NaN), dz = num(dir.z, NaN);
      if (!isFinite(ox + oy + oz + dx + dy + dz)) return false;
      rO[0] = Mie[0] * ox + Mie[4] * oy + Mie[8] * oz + Mie[12]; rO[1] = Mie[1] * ox + Mie[5] * oy + Mie[9] * oz + Mie[13]; rO[2] = Mie[2] * ox + Mie[6] * oy + Mie[10] * oz + Mie[14];
      rD[0] = Mie[0] * dx + Mie[4] * dy + Mie[8] * dz; rD[1] = Mie[1] * dx + Mie[5] * dy + Mie[9] * dz; rD[2] = Mie[2] * dx + Mie[6] * dy + Mie[10] * dz;
      var dl = Math.sqrt(rD[0] * rD[0] + rD[1] * rD[1] + rD[2] * rD[2]); if (dl < 1e-9) return false;
      rD[0] /= dl; rD[1] /= dl; rD[2] /= dl;
      updateLiftG();
      // bounding sphere
      var cx = 0, cy = -0.09, cz = 0.02, BR = 0.30;
      var lx = rO[0] - cx, ly = rO[1] - cy, lz = rO[2] - cz;
      var bq = lx * rD[0] + ly * rD[1] + lz * rD[2], cq = lx * lx + ly * ly + lz * lz - BR * BR, disc = bq * bq - cq;
      if (disc < 0) return false;
      var sq = Math.sqrt(disc), t0 = Math.max(0, -bq - sq), t1 = -bq + sq;
      if (t1 < 0) return false;
      var t = t0, hit = false;
      for (var i = 0; i < 110; i++) {
        var x = rO[0] + rD[0] * t, y = rO[1] + rD[1] * t, z = rO[2] + rD[2] * t;
        var f = sdf(x, y, z);
        if (f < 0.0006) { hit = true; break; }
        t += Math.max(f * 0.85, 0.0007);
        if (t > t1) break;
      }
      if (!hit) return false;
      var px = rO[0] + rD[0] * t, py = rO[1] + rD[1] * t, pz = rO[2] + rD[2] * t, e = 0.002;
      var nx = sdf(px + e, py, pz) - sdf(px - e, py, pz), ny = sdf(px, py + e, pz) - sdf(px, py - e, pz), nz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (!out.position) out.position = new THREE.Vector3();
      if (!out.normal) out.normal = new THREE.Vector3();
      out.position.set(Me[0] * px + Me[4] * py + Me[8] * pz + Me[12], Me[1] * px + Me[5] * py + Me[9] * pz + Me[13], Me[2] * px + Me[6] * py + Me[10] * pz + Me[14]);
      out.normal.set(Me[0] * nx + Me[4] * ny + Me[8] * nz, Me[1] * nx + Me[5] * ny + Me[9] * nz, Me[2] * nx + Me[6] * ny + Me[10] * nz).normalize();
      return true;
    }

    // ---------- public
    function avg(a) { var s = 0; for (var i = 0; i < nG; i++) s += a[i]; return s / nG; }
    function setStates(w, f, s) { for (var g = 0; g < nG; g++) { wet[g] = w; fluff[g] = f; smooth[g] = s; } }

    function update(dt, t) {
      dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 0.05) dt = 0.05;
      simT = (typeof t === 'number' && isFinite(t)) ? t : simT + dt;
      U.uTime.value = simT % 1000;
      towel += (towelT - towel) * (1 - Math.exp(-6 * dt));
      if (Math.abs(towel - towelT) < 0.002) towel = towelT;
      if (wind.breeze) wind.gust = 0.55 + 0.45 * GF.noise2(simT * 0.35, 3.7) + 0.25 * (GF.noise2(simT * 1.7, 8.1) - 0.5);
      if (!inited) { settle(); return; }
      readAnchor();
      var e = M.elements, jx = e[12] - prevAx, jy = e[13] - prevAy, jz = e[14] - prevAz;
      if (jx * jx + jy * jy + jz * jz > 0.09) { settle(); return; }
      prevAx = e[12]; prevAy = e[13]; prevAz = e[14];
      if (dt > 0) {
        lastDt = dt;
        computeTargets();
        simulate(dt, simT);
        var bad = false;
        for (var i = 0; i < P.length; i += 7) if (!(P[i] === P[i])) { bad = true; break; }
        if (bad) { settle(); return; }
      }
      Mprev.copy(M); Mpi.copy(Mi);
      upsample();
      updateCowlick(dt);
      writeTexture();
    }

    function setWind(origin, dir, strength) {
      var s = c01(num(strength, 0));
      if (!origin || !dir || s <= 0) { wind.on = false; wind.s = 0; return; }
      var dx = num(dir.x, 0), dy = num(dir.y, 0), dz = num(dir.z, 0), l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var ox = num(origin.x, NaN), oy = num(origin.y, NaN), oz = num(origin.z, NaN);
      if (l < 1e-6 || !isFinite(ox + oy + oz)) { wind.on = false; return; }
      wind.on = true; wind.s = s;
      wind.ox = ox; wind.oy = oy; wind.oz = oz; wind.dx = dx / l; wind.dy = dy / l; wind.dz = dz / l;
      var e = anchor.matrixWorld.elements, hx = e[12] - ox, hy = e[13] - oy, hz = e[14] - oz;
      wind.breeze = (hx * hx + hy * hy + hz * hz) > 1.0;
    }

    function brush(point, vel, radius) {
      if (!point || !inited) return 0;
      var px = num(point.x, NaN), py = num(point.y, NaN), pz = num(point.z, NaN);
      if (!isFinite(px + py + pz)) return 0;
      var vx = vel ? num(vel.x, 0) : 0, vy = vel ? num(vel.y, 0) : 0, vz = vel ? num(vel.z, 0) : 0;
      var sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > 3) { vx *= 3 / sp; vy *= 3 / sp; vz *= 3 / sp; sp = 3; }
      var r = Math.max(0.005, Math.min(0.2, num(radius, 0.035))), r2 = r * r, dt = lastDt, contact = 0;
      var gain = Math.min(sp, 1.2) * 9.0 * dt;
      for (var g = 0; g < nG; g++) {
        var best = 0, base = g * NN, re = r + Math.min(0.03, LIFT[base + NN - 1] * 0.8), re2 = re * re;
        for (var k = 1; k < NN; k++) {
          var o = (base + k) * 3;
          var ax = P[o - 3], ay = P[o - 2], az = P[o - 1], sx = P[o] - ax, sy = P[o + 1] - ay, sz = P[o + 2] - az;
          var tt = ((px - ax) * sx + (py - ay) * sy + (pz - az) * sz) / (sx * sx + sy * sy + sz * sz + 1e-12);
          tt = tt < 0 ? 0 : (tt > 1 ? 1 : tt);
          var dx = ax + sx * tt - px, dy = ay + sy * tt - py, dz = az + sz * tt - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < re2) {
            var c = 1 - Math.sqrt(d2) / re;
            if (c > best) best = c;
            var dr = c * 0.45 * dt * tt;
            P[o] += vx * dr; P[o + 1] += vy * dr; P[o + 2] += vz * dr;
          }
        }
        if (best > 0) {
          smooth[g] = Math.min(1, smooth[g] + Math.sqrt(best) * gain);
          if (fluff[g] > 1 - smooth[g]) fluff[g] = 1 - smooth[g];
          if (best > contact) contact = best;
        }
      }
      if (contact > 0 && sp > 0.03) brushActiveT = simT;
      // cowlick under the brush
      if (cow.state === 'up') {
        var rr = r + 0.02, hitC = false;
        for (var c2 = 0; c2 < NCOW && !hitC; c2 += 2) for (var j = 4; j < NS; j += 4) {
          var q = (c2 * NS + j) * 3, ex = cowW[q] - px, ey = cowW[q + 1] - py, ez = cowW[q + 2] - pz;
          if (ex * ex + ey * ey + ez * ez < rr * rr) { hitC = true; break; }
        }
        if (hitC) { cow.pressed = true; cow.pressT = simT; contact = Math.max(contact, 0.6); }
      }
      return contact;
    }

    function setPreset(name) {
      if (name === 'wet') setStates(1, 0, 0);
      else if (name === 'fluffy') setStates(0, 1, 0);
      else if (name === 'sleek') setStates(0, 0, 1);
      else return;
      settle();
    }

    function serialize() {
      var w = [], f = [], s = [], cnt = [], i;
      for (i = 0; i < NREG; i++) { w.push(0); f.push(0); s.push(0); cnt.push(0); }
      for (var g = 0; g < nG; g++) { var r = region[g]; w[r] += wet[g]; f[r] += fluff[g]; s[r] += smooth[g]; cnt[r]++; }
      for (i = 0; i < NREG; i++) { var n = cnt[i] || 1; w[i] = Math.round(w[i] / n * 100) / 100; f[i] = Math.round(f[i] / n * 100) / 100; s[i] = Math.round(s[i] / n * 100) / 100; }
      return { v: 1, w: w, f: f, s: s, c: cow.state, n: cow.count };
    }
    function restore(obj) {
      try {
        if (!obj || typeof obj !== 'object') return false;
        var A = function (a) { return Array.isArray(a) ? a : null; };
        var w = A(obj.w), f = A(obj.f), s = A(obj.s);
        for (var g = 0; g < nG; g++) {
          var r = region[g];
          if (w && r < w.length) wet[g] = c01(num(w[r], wet[g]));
          if (s && r < s.length) smooth[g] = c01(num(s[r], smooth[g]));
          if (f && r < f.length) fluff[g] = c01(num(f[r], fluff[g]));
          if (fluff[g] > 1 - smooth[g]) fluff[g] = 1 - smooth[g];
        }
        if (obj.c === 'none' || obj.c === 'up' || obj.c === 'pinned') { cow.state = obj.c; cow.pressed = false; }
        cow.count = Math.max(0, Math.floor(num(obj.n, cow.count)));
        settle();
        return true;
      } catch (e) { return false; }
    }

    var cowlick = {
      get state() { return cow.state; },
      pop: function () { cow.pressed = false; doPop(); },
      pin: function () { cow.state = 'pinned'; cow.pressed = false; },
      unpin: function () { if (cow.state === 'pinned') { cow.pressed = false; doPop(); } },
      tip: function (out) {
        out = out || new THREE.Vector3();
        if (!inited) settle();
        var q = ((NCOW >> 1) * NS + NS - 1) * 3;
        return out.set(cowW[q], cowW[q + 1], cowW[q + 2]);
      }
    };

    var api = {
      group: group,
      update: update,
      setWind: setWind,
      brush: brush,
      get wetness() { return avg(wet); },
      get fluff() { var s = 0; for (var g = 0; g < nG; g++) s += (1 - wet[g]) * fluff[g]; return s / nG; },
      get smoothness() { return avg(smooth); },
      setTowel: function (v) { towelT = c01(num(v, 0)); },
      cowlick: cowlick,
      onPop: null,
      surfacePoint: surfacePoint,
      setPreset: setPreset,
      serialize: serialize,
      restore: restore,
      setDetail: setDetail,
      // extras (not in the contract, handy for the game / debugging)
      info: { guides: nG, strands: nAll, triangles: nAll * SEGS * 2, cowlickRootLocal: cowRoot.slice() },
      _debug: { wet: wet, fluff: fluff, smooth: smooth, P: P, NN: NN, nG: nG, segL: segL, fringe: gFringe, mesh: mesh }
    };

    setStates(1, 0, 0);
    setDetail(1);
    try { settle(); } catch (e) { inited = false; }
    return api;
  };
})();
