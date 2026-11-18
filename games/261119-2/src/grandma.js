// おばあちゃん（正座・ちゃぶ台の向こう）の 3D モデル。
// 外部素材なし：テクスチャはすべて Canvas2D で手続き生成。
// 単位はメートル、Y 上、+Z が正面。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- utils
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (e0, e1, x) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const gauss = (a, l, a0, l0, sa, sl) => { const da = (a - a0) / sa, dl = (l - l0) / sl; return Math.exp(-(da * da + dl * dl)); };
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646); }
function table1(tab, x) { // piecewise linear [[x,y],...]
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return lerp(y0, y1, sstep(0, 1, (x - x0) / (x1 - x0)) * 0.5 + (x - x0) / (x1 - x0) * 0.5); }
  return tab[tab.length - 1][1];
}
function catmull(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function scaleUV(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function setUV(g, u, v) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v); return g; }
function mirrorX(g) {
  g = g.index ? g : g; const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); if (n) n.setX(i, -n.getX(i)); }
  const idx = g.index; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  return g;
}
function gridGeometry(nu, nv, fn) { // fn(i/nu, j/nv, outPos, outUV)
  const pos = [], uv = [], idx = []; const p = new THREE.Vector3(), t = new THREE.Vector2();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p, t); pos.push(p.x, p.y, p.z); uv.push(t.x, t.y); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function fixPoleRow(g, nu, row, ref) { // smooth normals at a collapsed pole row
  const n = g.attributes.normal; let x = 0, y = 0, z = 0;
  for (let i = 0; i <= nu; i++) { const k = ref * (nu + 1) + i; x += n.getX(k); y += n.getY(k); z += n.getZ(k); }
  const L = Math.hypot(x, y, z) || 1; for (let i = 0; i <= nu; i++) n.setXYZ(row * (nu + 1) + i, x / L, y / L, z / L);
}
function prep(g) { // make mergeable: indexed, position/normal/uv only
  if (!g.index) { const n = g.attributes.position.count; const a = []; for (let i = 0; i < n; i++) a.push(i); g.setIndex(a); }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function merge(list) { return mergeGeometries(list.map(prep), false); }

// ---------------------------------------------------------------- colors
const SKIN = '#dcaa87';
const SKIN_HEX = new THREE.Color(SKIN);

// ---------------------------------------------------------------- head shape
// The head is parameterised by azimuth a (0 = front, +a toward +x) and latitude l.
const HR = { x: 0.070, y: 0.093, zf: 0.079, zb: 0.094 };
function tabC(tab, x) { // Catmull-Rom through [[x,y],...]
  const n = tab.length; if (x <= tab[0][0]) return tab[0][1]; if (x >= tab[n - 1][0]) return tab[n - 1][1];
  let i = 0; while (x > tab[i + 1][0]) i++;
  const f = (x - tab[i][0]) / (tab[i + 1][0] - tab[i][0]); const Y = (k) => tab[clamp(k, 0, n - 1)][1];
  return catmull(Y(i - 1), Y(i), Y(i + 1), Y(i + 2), f);
}
// width / depth multipliers by latitude (relative to a sphere) — round, plump lower face
const KW = [[-1.571, 0.72], [-1.25, 0.84], [-1.0, 0.95], [-0.75, 1.04], [-0.5, 1.04], [-0.25, 1.02], [0, 1.0], [0.5, 1.01], [1.0, 1.1], [1.571, 1.15]];
const KF = [[-1.571, 1.8], [-1.25, 1.75], [-1.0, 1.4], [-0.75, 1.22], [-0.5, 1.09], [-0.25, 1.02], [0, 1.0], [0.5, 1.0], [1.0, 0.96], [1.571, 1.0]];
const KB = [[-1.571, 0.6], [-1.0, 0.62], [-0.75, 0.76], [-0.5, 0.9], [-0.25, 1.0], [0, 1.05], [0.6, 1.07], [1.0, 1.04], [1.571, 1.0]];
function headBase(a, l, o = new THREE.Vector3()) {
  const sa = Math.sin(a), ca = Math.cos(a), sl = Math.sin(l), cl = Math.cos(l);
  const ux = sa * cl, uy = sl, uz = ca * cl;
  let x = HR.x * cl * tabC(KW, l) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.92);
  let y = (sl > 0 ? 0.087 : HR.y) * sl;
  let z = ca >= 0 ? HR.zf * cl * tabC(KF, l) * Math.pow(ca, 0.8) : -HR.zb * cl * tabC(KB, l) * Math.pow(-ca, 0.95);
  { // tuck the underside of the jaw and the lower back of the skull in toward the neck
    const low = sstep(-0.45, -1.35, l), fr = sstep(0.2, 0.85, ca);
    const k = low * (1 - fr);
    x *= 1 - 0.22 * k; z = z * (1 - 0.4 * k) + 0.01 * k;
    const ks = sstep(0.85, 0.1, ca) * sstep(-0.35, -1.15, l);
    y *= 1 - 0.2 * ks; z += 0.008 * ks * sstep(0.2, -0.6, ca);
  }
  const aa = Math.abs(a);
  let dz = 0, dr = 0;
  // nose
  const lt = -0.31, lb = -0.40;
  { const t = clamp((0.05 - l) / (0.05 - lt), 0, 1);
    let h = 0.0035 + 0.0125 * Math.pow(t, 1.5);
    h *= sstep(0.16, 0.02, l) * (1 - sstep(lt + 0.005, lb, l));
    const sg = 0.048 + 0.056 * t;
    dz += h * Math.exp(-(a / sg) * (a / sg));
    dz += 0.006 * gauss(a, l, 0, -0.305, 0.07, 0.05);
    dz += 0.005 * gauss(aa, l, 0.14, -0.355, 0.055, 0.042);
  }
  dz -= 0.003 * gauss(aa, l, 0.42, 0.04, 0.17, 0.1);    // eye sockets
  dz += 0.0016 * gauss(aa, l, 0.38, 0.2, 0.3, 0.06);    // brow ridge
  dr += 0.0065 * gauss(aa, l, 0.62, -0.33, 0.3, 0.22);  // full cheeks
  dz += 0.0024 * gauss(a, l, 0, -0.6, 0.22, 0.05);      // lips
  dz -= 0.0012 * gauss(a, l, 0, -0.72, 0.2, 0.045);     // under-lip groove
  dz += 0.0025 * gauss(a, l, 0, -0.92, 0.22, 0.12);     // chin
  dr -= 0.002 * gauss(aa, l, 1.0, 0.28, 0.2, 0.2);      // temples
  o.set(x + ux * dr, y + uy * dr, z + dz + uz * dr);
  return o;
}
function morphCheek(a, l, o) { const g = gauss(Math.abs(a), l, 0.6, -0.31, 0.27, 0.16); return o.set(0, 0.0035 * g, 0.0022 * g); }
function morphJaw(a, l, o) {
  const j = sstep(-0.65, -0.86, l) * (0.35 + 0.65 * Math.max(0, Math.cos(a)));
  return o.set(0, -0.0045 * j, -0.0008 * j);
}

// ---------------------------------------------------------------- face painting
const FW = 1024, SX = 409.6 / 70, SY = (FW / 2.4) / 92; // px per mm
const OFF = 3000;
function faceCtxMM(ctx, off = 0) { ctx.setTransform(SX, 0, 0, -SY, FW / 2 + off, FW / 2); }
function soft(ctx, blurPx, color, draw) {
  ctx.save(); faceCtxMM(ctx, OFF);
  ctx.shadowOffsetX = -OFF; ctx.shadowOffsetY = 0; ctx.shadowBlur = blurPx; ctx.shadowColor = color;
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
  draw(ctx); ctx.restore();
}
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function poly(ctx, pts, close) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); }
function curve(fn, n = 24, u0 = 0, u1 = 1) { const p = []; for (let i = 0; i <= n; i++) { const u = lerp(u0, u1, i / n); p.push(fn(u)); } return p; }
function strokeVar(ctx, pts, w0, w1) { // filled variable-width stroke
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
    let dx = q[0] - r[0], dy = q[1] - r[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = lerp(w0, w1, i / (pts.length - 1)) * 0.5 * Math.sin(Math.PI * (0.08 + 0.84 * i / (pts.length - 1))) ** 0.35;
    L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
  }
  poly(ctx, L.concat(R.reverse()), true);
}

function paintBase(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = SKIN; ctx.fillRect(0, 0, FW, FW);
  const r = rng(7);
  // gentle mottling (kept away from texture edges)
  for (let i = 0; i < 90; i++) {
    const x = 220 + r() * 584, y = 200 + r() * 640, rad = 30 + r() * 90;
    const warm = r() < 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = warm ? 'rgba(214,150,130,' : 'rgba(245,214,186,';
    g.addColorStop(0, c + (0.05 + r() * 0.05) + ')'); g.addColorStop(1, c + '0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // few very faint age spots
  for (let i = 0; i < 7; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (38 + r() * 18), y = 4 + r() * 22;
    soft(ctx, 3, 'rgba(170,115,85,0.18)', (c) => { ell(c, x, y, 0.8 + r(), 0.7 + r() * 0.8); c.fill(); });
  }
  // ambient occlusion & structure
  for (const s of [-1, 1]) {
    soft(ctx, 26, 'rgba(150,90,70,0.16)', (c) => { ell(c, s * 28, 5, 15, 8); c.fill(); });   // eye socket
    soft(ctx, 14, 'rgba(140,80,64,0.16)', (c) => { ell(c, s * 12.5, 0, 4.5, 6); c.fill(); }); // beside bridge
    soft(ctx, 12, 'rgba(150,85,66,0.10)', (c) => { ell(c, s * 11, -30, 2, 4.5, s * 0.3); c.fill(); }); // alar side
    soft(ctx, 6, 'rgba(95,45,38,0.42)', (c) => { ell(c, s * 5.2, -34.4, 1.9, 1.0, s * -0.25); c.fill(); }); // nostril
  }
  soft(ctx, 10, 'rgba(130,70,58,0.14)', (c) => { ell(c, 0, -37.2, 6.5, 1.8); c.fill(); });  // under nose
  soft(ctx, 30, 'rgba(140,105,90,0.22)', (c) => { c.fillRect(-70, 43, 140, 30); });  // hairline shade
  soft(ctx, 10, 'rgba(255,235,215,0.28)', (c) => { ell(c, 0, -14, 2.2, 10); c.fill(); }); // nose ridge highlight
  soft(ctx, 8, 'rgba(255,238,220,0.25)', (c) => { ell(c, 0, -28, 3.4, 2.6); c.fill(); }); // nose tip highlight
  soft(ctx, 12, 'rgba(160,95,80,0.07)', (c) => { ell(c, 0, -44, 2.2, 3.2); c.fill(); });  // philtrum
  soft(ctx, 14, 'rgba(120,64,54,0.18)', (c) => { ell(c, 0, -64, 9, 2.2); c.fill(); });   // under lower lip
  // faint forehead lines
  for (const y of [32, 38]) soft(ctx, 4, 'rgba(160,100,80,0.10)', (c) => { c.lineWidth = 0.45; c.beginPath(); c.moveTo(-17, y - 1); c.quadraticCurveTo(0, y + 1.2, 17, y - 1); c.stroke(); });
}

function paintBrows(ctx, lift, arch) {
  const r = rng(11);
  for (const s of [-1, 1]) {
    const P = (u) => [s * lerp(14, 46, u), 13 + lift + arch * Math.sin(Math.PI * Math.pow(u, 0.8)) - 3.2 * u * u + (u < 0.15 ? -0.6 * (0.15 - u) / 0.15 : 0)];
    // soft base
    soft(ctx, 5, 'rgba(120,108,100,0.30)', (c) => { strokeVar(c, curve(P, 20), 3.2, 1.4); c.fill(); });
    // hairs
    ctx.save(); faceCtxMM(ctx);
    for (let i = 0; i < 70; i++) {
      const u = r(); const p = P(u); const p2 = P(Math.min(1, u + 0.06));
      const ang = Math.atan2(p2[1] - p[1], p2[0] - p[0]) + (u < 0.25 ? s * 0.6 : 0) * (1 - u * 3);
      const len = 2.2 + r() * 2.2; const oy = (r() - 0.5) * (2.6 - 1.4 * u);
      const g = 105 + Math.floor(r() * 60);
      ctx.strokeStyle = `rgba(${g},${g - 6},${g - 10},${0.35 + r() * 0.3})`; ctx.lineWidth = 0.28 + r() * 0.18;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] + oy); ctx.lineTo(p[0] + Math.cos(ang) * len, p[1] + oy + Math.sin(ang) * len * 0.6); ctx.stroke();
    }
    ctx.restore();
  }
}

// eye geometry in mm for side s (+1 = grandma's left, +x)
function eyeLids(kind, s) {
  const xin = 16.5, xout = 42;
  const X = (u) => s * lerp(xin, xout, u);
  const bump = (u, p = 0.8) => Math.sin(Math.PI * Math.pow(clamp(u, 0, 1), p));
  if (kind === 'calm') return { X, up: (u) => lerp(4.4, 3.4, u) + 4.6 * bump(u), lo: (u) => lerp(4.4, 3.4, u) - 1.7 * bump(u, 1.1), iris: [s * 29.5, 4.4], ir: 5.1 };
  if (kind === 'wow') return { X, up: (u) => lerp(4.2, 4.0, u) + 7.4 * bump(u), lo: (u) => lerp(4.2, 4.0, u) - 3.3 * bump(u, 1.05), iris: [s * 29.5, 5.6], ir: 5.3 };
  if (kind === 'blink') return { X, up: (u) => lerp(4.2, 3.0, u) - 1.1 * bump(u, 1), lo: null };
  // laugh: arched closed
  return { X, up: (u) => lerp(3.0, 2.2, u) + 3.6 * bump(u, 0.9), lo: null };
}

function paintEye(ctx, kind, s) {
  const E = eyeLids(kind, s);
  const P = (fn) => (u) => [E.X(u), fn(u)];
  // eyelid skin tone (slightly rosy-brown)
  soft(ctx, 16, 'rgba(160,96,80,0.16)', (c) => { ell(c, s * 29, kind === 'wow' ? 10 : 8.5, 14, 5.5); c.fill(); });
  if (E.lo) {
    const open = curve(P(E.up), 28).concat(curve(P(E.lo), 28, 1, 0));
    ctx.save(); faceCtxMM(ctx);
    poly(ctx, open, true); ctx.clip();
    // sclera
    const g = ctx.createLinearGradient(s * 16, 0, s * 42, 0);
    g.addColorStop(0, '#c7aa9c'); g.addColorStop(0.18, '#e7dcd2'); g.addColorStop(0.55, '#ebe2d9'); g.addColorStop(0.9, '#cdb7aa'); g.addColorStop(1, '#b89a8c');
    ctx.fillStyle = g; ctx.fillRect(-60, -20, 120, 40);
    // iris
    const [ix, iy] = E.iris, ir = E.ir;
    const gi = ctx.createRadialGradient(ix, iy, 0, ix, iy, ir);
    gi.addColorStop(0, '#1b110c'); gi.addColorStop(0.36, '#24160f'); gi.addColorStop(0.42, '#5b3b27'); gi.addColorStop(0.75, '#4a2f20'); gi.addColorStop(0.93, '#2e1d14'); gi.addColorStop(1, 'rgba(40,26,18,0.6)');
    ctx.fillStyle = gi; ell(ctx, ix, iy, ir, ir); ctx.fill();
    ctx.restore();
    // shadow cast by the upper lid onto the eye (clipped)
    ctx.save(); faceCtxMM(ctx); poly(ctx, open, true); ctx.clip();
    soft(ctx, 9, 'rgba(45,25,18,0.55)', (c) => { strokeVar(c, curve(P(E.up), 24), 3.4, 3.4); c.fill(); });
    soft(ctx, 6, 'rgba(90,50,40,0.25)', (c) => { strokeVar(c, curve(P(E.lo), 24), 1.4, 1.4); c.fill(); });
    ctx.restore();
    // catchlights
    ctx.save(); faceCtxMM(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ell(ctx, ix + 1.7, iy + 1.5, 1.0, 1.0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ell(ctx, ix - 1.6, iy - 1.7, 0.45, 0.45); ctx.fill();
    ctx.restore();
    // upper lid line
    soft(ctx, 2.5, 'rgba(58,34,25,0.92)', (c) => { strokeVar(c, curve(P(E.up), 28), 0.55, 1.0); c.fill(); });
    // sparse lashes at outer half
    ctx.save(); faceCtxMM(ctx); ctx.strokeStyle = 'rgba(60,38,28,0.55)'; ctx.lineWidth = 0.25;
    for (let i = 0; i < 6; i++) { const u = 0.55 + i * 0.075; const x = E.X(u), y = E.up(u); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * (0.6 + u), y + 1.1); ctx.stroke(); }
    ctx.restore();
    // lower lid line
    soft(ctx, 3, 'rgba(140,82,66,0.42)', (c) => { strokeVar(c, curve(P(E.lo), 24, 0.05, 1), 0.35, 0.45); c.fill(); });
    // lid crease
    const crease = (u) => [E.X(u), E.up(u) + (kind === 'wow' ? 2.6 : 2.2) - 0.4 * u];
    soft(ctx, 4, 'rgba(140,82,62,0.38)', (c) => { strokeVar(c, curve(crease, 20, 0.08, 0.98), 0.5, 0.5); c.fill(); });
    // under-eye softness
    const bag = (u) => [E.X(u), E.lo(u) - 3.4 - 0.6 * Math.sin(Math.PI * u)];
    soft(ctx, 5, 'rgba(150,92,74,0.20)', (c) => { strokeVar(c, curve(bag, 20, 0.15, 0.95), 0.5, 0.5); c.fill(); });
  } else {
    // closed eye
    const lid = curve(P(E.up), 28);
    const lw = kind === 'laugh' ? 1.15 : 0.85;
    soft(ctx, 2.5, 'rgba(60,35,26,0.9)', (c) => { strokeVar(c, lid, lw * 0.8, lw); c.fill(); });
    // lashes hint at outer end
    ctx.save(); faceCtxMM(ctx); ctx.strokeStyle = 'rgba(60,38,28,0.5)'; ctx.lineWidth = 0.25;
    for (let i = 0; i < 5; i++) { const u = 0.6 + i * 0.08; const x = E.X(u), y = E.up(u); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.8, y - 1.0); ctx.stroke(); }
    ctx.restore();
    if (kind === 'laugh') {
      const crease = (u) => [E.X(u), E.up(u) + 2.6 - 0.3 * u];
      soft(ctx, 4, 'rgba(140,82,62,0.36)', (c) => { strokeVar(c, curve(crease, 20, 0.1, 0.95), 0.5, 0.5); c.fill(); });
      const under = (u) => [E.X(u), E.up(u) - 3.4 + 0.5 * Math.sin(Math.PI * u)];
      soft(ctx, 5, 'rgba(150,90,72,0.30)', (c) => { strokeVar(c, curve(under, 20, 0.12, 0.92), 0.6, 0.6); c.fill(); });
    } else {
      const crease = (u) => [E.X(u), E.up(u) + 3.6 + 1.2 * Math.sin(Math.PI * u)];
      soft(ctx, 4, 'rgba(140,82,62,0.30)', (c) => { strokeVar(c, curve(crease, 20, 0.1, 0.95), 0.5, 0.5); c.fill(); });
    }
  }
  // crow's feet
  const strong = kind === 'laugh' ? 0.34 : kind === 'calm' ? 0.22 : 0.12;
  for (let k = 0; k < 3; k++) {
    const y0 = 4 + (k - 1) * 2.6, ang = (k - 1) * 0.35;
    soft(ctx, 5, `rgba(150,92,72,${strong * 0.6})`, (c) => {
      c.lineWidth = 0.6; c.beginPath(); c.moveTo(s * 44, y0);
      c.quadraticCurveTo(s * (47.5), y0 + Math.sin(ang) * 2.4 + 0.5, s * (50 + (k === 1 ? 1.5 : 0)), y0 + Math.sin(ang) * 4.5); c.stroke();
    });
  }
}

function paintMouth(ctx, kind) {
  const my = -54;
  // nasolabial folds
  const nl = kind === 'laugh' ? 0.3 : kind === 'calm' ? 0.17 : 0.12;
  for (const s of [-1, 1]) {
    soft(ctx, 9, `rgba(150,88,70,${nl})`, (c) => {
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(s * 11.5, -33);
      c.quadraticCurveTo(s * 20.5, -42, s * (kind === 'laugh' ? 22.5 : 21), -57); c.stroke();
    });
  }
  const lipU = 'rgba(176,96,92,0.80)', lipL = 'rgba(192,112,104,0.72)';
  if (kind === 'calm') {
    const W = 18.5, SM = 4.0;
    const line = (u) => { const x = lerp(-W, W, u); return [x, my + SM * Math.abs(x / W) ** 2.3 - 0.8]; };
    // upper lip
    soft(ctx, 3, lipU, (c) => {
      const top = curve((u) => { const x = lerp(W, -W, u); const ax = Math.abs(x); return [x, my + 0.5 + SM * Math.abs(x / W) ** 2.3 + 2.2 * Math.sin(Math.PI / 2 * clamp(1 - ax / W, 0, 1) ** 0.6) - 0.7 * Math.exp(-(x * x) / 5)]; }, 30);
      poly(c, curve(line, 30).concat(top), true); c.fill();
    });
    // lower lip
    soft(ctx, 4, lipL, (c) => {
      const bot = curve((u) => { const x = lerp(W * 0.92, -W * 0.92, u); return [x, my - 0.6 + SM * 0.85 * Math.abs(x / W) ** 2.3 - 3.8 * Math.sin(Math.PI / 2 * clamp(1 - Math.abs(x) / (W * 0.92), 0, 1) ** 0.55)]; }, 30);
      poly(c, curve(line, 30, 0.04, 0.96).concat(bot), true); c.fill();
    });
    soft(ctx, 5, 'rgba(255,225,215,0.35)', (c) => { ell(c, 0, my - 3.0, 5, 0.9); c.fill(); }); // lower lip sheen
    soft(ctx, 2.5, 'rgba(100,44,40,0.9)', (c) => { strokeVar(c, curve(line, 30), 0.7, 0.7); c.fill(); });
    for (const s of [-1, 1]) soft(ctx, 4, 'rgba(120,60,50,0.35)', (c) => { ell(c, s * (W + 0.6), my + SM - 0.2, 1.3, 1.1); c.fill(); });
  } else if (kind === 'wow') {
    const cy = my - 2.2, rx = 7.4, ry = 7.6;
    soft(ctx, 4, 'rgba(176,98,94,0.85)', (c) => { ell(c, 0, cy, rx + 2.4, ry + 2.6); c.fill(); });
    ctx.save(); faceCtxMM(ctx);
    const g = ctx.createRadialGradient(0, cy - 1, 0.5, 0, cy, ry);
    g.addColorStop(0, '#5a2224'); g.addColorStop(0.7, '#4a1c1e'); g.addColorStop(1, '#6e3030');
    ctx.fillStyle = g; ell(ctx, 0, cy, rx, ry); ctx.fill();
    ell(ctx, 0, cy, rx, ry); ctx.clip();
    ctx.fillStyle = '#b4605c'; ell(ctx, 0, cy - ry * 0.95, rx * 0.8, ry * 0.45); ctx.fill(); // tongue
    ctx.fillStyle = 'rgba(240,232,220,0.9)'; ell(ctx, 0, cy + ry * 1.02, rx * 0.62, 1.6); ctx.fill(); // teeth hint
    ctx.restore();
    soft(ctx, 3, 'rgba(90,40,38,0.6)', (c) => { c.lineWidth = 0.5; ell(c, 0, cy, rx, ry); c.stroke(); });
    soft(ctx, 4, 'rgba(255,225,215,0.3)', (c) => { ell(c, 0, cy - ry - 1.6, 4, 0.8); c.fill(); });
  } else { // laugh
    const W = 20.5;
    const top = (u) => { const x = lerp(-W, W, u); return [x, my + 2.4 + 1.3 * (x / W) ** 2 - 0.3]; };
    const bot = (u) => { const x = lerp(W, -W, u); const k = 1 - (x / W) ** 2; return [x, my + 2.4 + 1.3 * (x / W) ** 2 - 12.5 * Math.pow(Math.max(0, k), 0.75)]; };
    const shape = curve(top, 30).concat(curve(bot, 30));
    // lips around the opening
    soft(ctx, 3, lipU, (c) => { strokeVar(c, curve((u) => { const p = top(u); return [p[0], p[1] + 0.9]; }, 30), 1.8, 1.8); c.fill(); });
    soft(ctx, 4, lipL, (c) => { strokeVar(c, curve((u) => { const p = bot(u); return [p[0], p[1] - 1.1]; }, 30, 0.05, 0.95), 3.4, 3.4); c.fill(); });
    ctx.save(); faceCtxMM(ctx);
    poly(ctx, shape, true);
    const g = ctx.createLinearGradient(0, my + 2, 0, my - 10);
    g.addColorStop(0, '#5e2426'); g.addColorStop(1, '#3f1618');
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    // tongue
    ctx.fillStyle = '#b8625d'; ell(ctx, 0, my - 9.6, 9.5, 4.2); ctx.fill();
    // upper teeth
    const tg = ctx.createLinearGradient(0, my + 3, 0, my - 1.6);
    tg.addColorStop(0, '#f3ede2'); tg.addColorStop(0.75, '#e6dccb'); tg.addColorStop(1, 'rgba(200,185,170,0.0)');
    ctx.fillStyle = tg; poly(ctx, curve(top, 30, 0.12, 0.88).concat(curve((u) => { const p = top(u); return [p[0], p[1] - 3.0 * Math.sin(Math.PI * u) ** 0.4]; }, 30, 0.88, 0.12)), true); ctx.fill();
    ctx.strokeStyle = 'rgba(170,150,135,0.35)'; ctx.lineWidth = 0.2;
    for (const x of [-7.5, -3.6, 0, 3.6, 7.5]) { ctx.beginPath(); ctx.moveTo(x, my + 2.3); ctx.lineTo(x, my - 0.4); ctx.stroke(); }
    ctx.restore();
    soft(ctx, 3, 'rgba(90,40,38,0.5)', (c) => { c.lineWidth = 0.45; poly(c, shape, true); c.stroke(); });
    for (const s of [-1, 1]) soft(ctx, 4, 'rgba(120,60,50,0.35)', (c) => { ell(c, s * (W + 0.8), my + 3.4, 1.4, 1.2); c.fill(); });
  }
}

function paintFace(expr, blink) {
  const c = makeCanvas(FW, FW); const ctx = c.getContext('2d');
  ctx.drawImage(BASE_CANVAS(), 0, 0);
  // cheeks blush
  for (const s of [-1, 1]) {
    const cx = s * (expr === 'laugh' ? 35 : 37), cy = expr === 'laugh' ? -24 : -27, a = expr === 'laugh' ? 0.34 : 0.26;
    soft(ctx, 60, `rgba(226,120,112,${a})`, (k) => { ell(k, cx, cy, 11, 9); k.fill(); });
  }
  const brow = expr === 'wow' ? [3.2, 3.6] : expr === 'laugh' ? [1.2, 2.6] : [0, 2.3];
  if (expr === 'wow') for (const y of [30, 35.5]) soft(ctx, 4, 'rgba(160,100,80,0.10)', (k) => { k.lineWidth = 0.4; k.beginPath(); k.moveTo(-15, y); k.quadraticCurveTo(0, y + 1.5, 15, y); k.stroke(); });
  paintBrows(ctx, brow[0], brow[1]);
  const ek = blink ? 'blink' : expr;
  for (const s of [-1, 1]) paintEye(ctx, ek, s);
  paintMouth(ctx, expr);
  return c;
}
let _base = null;
function BASE_CANVAS() { if (!_base) { _base = makeCanvas(FW, FW); paintBase(_base.getContext('2d')); } return _base; }

// ---------------------------------------------------------------- other textures
function knitCanvas(hex, cols, rows, size = 256, bump = false) {
  const c = makeCanvas(size, size); const g = c.getContext('2d');
  const base = new THREE.Color(hex); const hsl = {}; base.getHSL(hsl);
  const col = (dl) => { const k = new THREE.Color().setHSL(hsl.h, hsl.s, clamp(hsl.l + dl, 0, 1)); return bump ? (() => { const v = Math.round(clamp(0.5 + dl * 2.2, 0, 1) * 255); return `rgb(${v},${v},${v})`; })() : '#' + k.getHexString(); };
  g.fillStyle = col(-0.12); g.fillRect(0, 0, size, size);
  const cw = size / cols, ch = size / rows; const r = rng(3 + cols);
  const jit = []; for (let i = 0; i < cols * rows; i++) jit.push((r() - 0.5) * 0.05);
  for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
    const jj = ((j % rows) + rows) % rows, ii = ((i % cols) + cols) % cols; const dj = jit[jj * cols + ii];
    const cx = (i + 0.5) * cw, cy = (j + 0.5) * ch;
    for (const s of [-1, 1]) {
      const x = cx + s * cw * 0.23, y = cy;
      const gr = g.createRadialGradient(x - s * cw * 0.04, y - ch * 0.15, 0, x, y, ch * 0.62);
      gr.addColorStop(0, col(0.07 + dj)); gr.addColorStop(0.6, col(0.0 + dj)); gr.addColorStop(1, col(-0.1 + dj));
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, cw * 0.26, ch * 0.6, -s * 0.5, 0, Math.PI * 2); g.fill();
    }
  }
  // fuzz
  g.globalAlpha = 0.12;
  for (let i = 0; i < size * 6; i++) { g.fillStyle = r() < 0.5 ? col(0.12) : col(-0.12); g.fillRect(r() * size, r() * size, 1, 1 + r() * 2); }
  g.globalAlpha = 1;
  return c;
}
function hairCanvas(bump = false) {
  // wavy, combed-back strands (v runs from the hairline toward the crown) with soft perm waves
  const S = 512; const c = makeCanvas(S, S); const g = c.getContext('2d'); const r = rng(5);
  g.fillStyle = bump ? '#606060' : '#8a8783'; g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  const draw = (x0, y0, len, amp, ph, freq, col, w) => {
    g.strokeStyle = col; g.lineWidth = w;
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
      if (ox && Math.abs(x0 + ox - S / 2) > S / 2 + 40) continue;
      if (oy && Math.abs(y0 + oy - S / 2) > S / 2 + len) continue;
      g.beginPath();
      for (let k = 0; k <= 12; k++) { const t = k / 12; const y = y0 + oy - t * len; const x = x0 + ox + Math.sin(ph + t * freq) * amp + t * amp * 0.3; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  };
  for (let i = 0; i < 2600; i++) {
    const lv = r(); const x = r() * S, y = r() * S; const len = 50 + r() * 90, amp = 4 + r() * 7, ph = r() * 6.28, fr = 5 + r() * 5;
    let col;
    if (bump) { const v = Math.round(70 + lv * 170); col = `rgba(${v},${v},${v},0.55)`; }
    else col = lv < 0.3 ? 'rgba(92,88,84,0.5)' : lv < 0.7 ? `rgba(${150 + lv * 40 | 0},${147 + lv * 40 | 0},${143 + lv * 40 | 0},0.5)` : `rgba(${208 + lv * 30 | 0},${206 + lv * 30 | 0},${202 + lv * 30 | 0},0.55)`;
    draw(x, y, len, amp, ph, fr, col, 1.2 + r() * 1.8);
  }
  return c;
}

// ---------------------------------------------------------------- body geometry helpers
function ringPoint(r, th, o) {
  const sx = Math.sin(th), cz = Math.cos(th), e = 2 / r.n;
  const x = r.w * Math.sign(sx) * Math.pow(Math.abs(sx), e);
  const z = r.c + (cz >= 0 ? r.df : r.db) * Math.sign(cz) * Math.pow(Math.abs(cz), e);
  return o.set(x, r.y, z);
}
function sampleRing(rings, t) {
  const n = rings.length - 1, tt = clamp(t, 0, 1) * n, k = Math.min(n - 1, Math.floor(tt)), f = tt - k;
  const R = (i) => rings[clamp(i, 0, n)];
  const o = {};
  for (const key of ['y', 'w', 'df', 'db', 'c', 'n']) o[key] = catmull(R(k - 1)[key], R(k)[key], R(k + 1)[key], R(k + 2)[key], f);
  return o;
}
function loftGeometry(rings, nu, nv, openFn, tile, scale = 1) {
  return gridGeometry(nu, nv, (u, v, p, t) => {
    const r = sampleRing(rings, v);
    r.w *= scale; r.df *= scale; r.db *= scale;
    const op = openFn ? openFn(r.y) : 0;
    const th = openFn ? lerp(op, Math.PI * 2 - op, u) : Math.PI + u * Math.PI * 2;
    ringPoint(r, th, p);
    t.set(th * (r.w + r.df) * 0.5 / tile, r.y / tile);
  });
}

// cardigan torso rings (y, half width, front depth, back depth, z centre, superellipse exponent)
const TORSO = [
  { y: 0.180, w: 0.168, df: 0.128, db: 0.112, c: 0.010, n: 2.4 },
  { y: 0.215, w: 0.160, df: 0.120, db: 0.110, c: 0.010, n: 2.4 },
  { y: 0.290, w: 0.150, df: 0.113, db: 0.104, c: 0.016, n: 2.4 },
  { y: 0.370, w: 0.148, df: 0.106, db: 0.101, c: 0.020, n: 2.3 },
  { y: 0.445, w: 0.152, df: 0.101, db: 0.103, c: 0.023, n: 2.3 },
  { y: 0.505, w: 0.156, df: 0.095, db: 0.108, c: 0.026, n: 2.3 },
  { y: 0.540, w: 0.152, df: 0.086, db: 0.110, c: 0.026, n: 2.3 },
  { y: 0.566, w: 0.141, df: 0.074, db: 0.102, c: 0.026, n: 2.3 },
  { y: 0.589, w: 0.114, df: 0.065, db: 0.088, c: 0.026, n: 2.2 },
  { y: 0.609, w: 0.083, df: 0.059, db: 0.071, c: 0.028, n: 2.1 },
  { y: 0.625, w: 0.064, df: 0.058, db: 0.062, c: 0.030, n: 2.0 },
  { y: 0.638, w: 0.059, df: 0.056, db: 0.058, c: 0.031, n: 2.0 },
];
const OPEN = [[0.0, 0.012], [0.46, 0.012], [0.49, 0.07], [0.53, 0.16], [0.57, 0.33], [0.605, 0.62], [0.645, 1.0]];
const openAt = (y) => table1(OPEN, y);
function torsoPoint(y, th, scale = 1, o = new THREE.Vector3()) {
  // find ring param for y by bisection
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (sampleRing(TORSO, m).y < y) lo = m; else hi = m; }
  const r = sampleRing(TORSO, (lo + hi) / 2); r.w *= scale; r.df *= scale; r.db *= scale;
  return ringPoint(r, th, o);
}

// hand geometry (origin at wrist, fingers +Z, back of hand +Y, thumb on -s side)
function handGeometry(s, curl) {
  const parts = [];
  const wrist = new THREE.CylinderGeometry(0.0195, 0.021, 0.05, 16, 1, true);
  wrist.rotateX(Math.PI / 2); wrist.scale(1.2, 0.85, 1); wrist.translate(0, 0, -0.005); parts.push(wrist);
  const palm = new RoundedBoxGeometry(0.066, 0.024, 0.084, 2, 0.0105);
  { const p = palm.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); const k = 1 - 0.13 * sstep(0.01, -0.042, z); p.setX(i, p.getX(i) * k); const x = p.getX(i); p.setY(i, p.getY(i) - 0.0035 * (1 - (x / 0.033) ** 2) * (p.getY(i) < 0 ? -0.4 : 1)); } }
  palm.computeVertexNormals(); palm.translate(0, 0, 0.044); parts.push(palm);
  const fingers = [ // x, knuckle z, segment lengths, radius, spread
    [-0.0235, 0.082, [0.029, 0.019, 0.017], 0.0079, 0.06],
    [-0.0078, 0.086, [0.032, 0.021, 0.018], 0.0081, 0.0],
    [0.0078, 0.084, [0.030, 0.020, 0.017], 0.0076, -0.05],
    [0.0225, 0.078, [0.024, 0.016, 0.015], 0.0067, -0.11],
  ];
  const cs = [curl * 0.24, curl * 0.38, curl * 0.26];
  const Y1 = new THREE.Vector3(0, 1, 0);
  for (const [fx, fz, lens, rr, spread] of fingers) {
    const x0 = fx * -s;
    const st = new THREE.Vector3(x0, 0.001, fz); let ang = 0;
    for (let k = 0; k < 3; k++) {
      ang += cs[k];
      const d = new THREE.Vector3(spread * s * 0.5, -Math.sin(ang), Math.cos(ang)).normalize();
      const rad = rr * (1 - 0.09 * k);
      const cap = new THREE.CapsuleGeometry(rad, lens[k], 2, 8);
      cap.scale(1, 1, 0.88);
      cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y1, d));
      const m = st.clone().addScaledVector(d, lens[k] / 2); cap.translate(m.x, m.y, m.z); parts.push(cap);
      st.addScaledVector(d, lens[k]);
    }
  }
  // thumb
  const t0 = new THREE.Vector3(-s * 0.025, -0.006, 0.024);
  const td1 = new THREE.Vector3(-s * 0.6, -0.2, 0.75).normalize();
  const td2 = new THREE.Vector3(-s * (0.32 - curl * 0.12), -0.18 - curl * 0.2, 0.9).normalize();
  for (const [d, len, rad, st] of [[td1, 0.034, 0.0098, t0], [td2, 0.03, 0.0086, t0.clone().addScaledVector(td1, 0.034)]]) {
    const cap = new THREE.CapsuleGeometry(rad, len, 2, 8);
    cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
    const m = st.clone().addScaledVector(d, len / 2); cap.translate(m.x, m.y, m.z); parts.push(cap);
  }
  const then = new THREE.SphereGeometry(1, 10, 7); then.scale(0.016, 0.011, 0.022); then.translate(-s * 0.017, -0.006, 0.03); parts.push(then);
  return merge(parts);
}
function handWithMorph(s) {
  const g = handGeometry(s, 1.0), flat = handGeometry(s, 0.15);
  const d = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < d.length; i++) d[i] = flat.attributes.position.array[i] - g.attributes.position.array[i];
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)];
  g.morphTargetsRelative = true; flat.dispose();
  return g;
}

// ---------------------------------------------------------------- rig constants
const NECK_PIVOT = new THREE.Vector3(0, 0.637, 0.03);
const HEAD_CENTER_REL = new THREE.Vector3(0, 0.114, 0.024); // head centre relative to neck pivot
const SHOULDER = (s) => new THREE.Vector3(s * 0.136, 0.527, 0.022);
const L1 = 0.232, L2 = 0.205, PALM_OFF = 0.044;
const SPOTS = { cheekL: [0.74, -0.40], cheekR: [-0.74, -0.40], forehead: [0, 0.40] };

// arm poses: palm centre P, finger direction Z, back-of-hand direction Y, elbow pole, flatness, holdPoint y offset
const POSES = {
  lap:   (s) => ({ P: [s * 0.098, 0.232, 0.11], Z: [-s * 0.4, -0.22, 1], Y: [s * 0.1, 1, 0.22], pole: [s * 0.35, -0.4, -1], flat: 0.35, hy: 0 }),
  table: (s) => ({ P: [s * 0.13, 0.348, 0.32], Z: [-s * 0.3, 0.08, 1], Y: [s * 0.05, 1, -0.06], pole: [s * 0.3, -0.6, -0.7], flat: 0.85, hy: 0 }),
  reach: (s) => ({ P: [s * 0.10, 0.46, 0.42], Z: [-s * 0.25, 0.1, 1], Y: [s * 0.3, -1, 0.05], pole: [s * 0.55, -1, -0.15], flat: 0.25, hy: 0.013 }),
  hold:  (s) => ({ P: [s * 0.10, 0.50, 0.30], Z: [-s * 0.12, 0.45, 1], Y: [s * 1, -0.45, 0.05], pole: [s * 0.6, -1, -0.25], flat: 0.1, hy: -0.035 }),
  cheeks:(s) => ({ P: [0, 0, 0], Z: [0, 1, 0], Y: [s, 0, 0], pole: [s * 0.45, -1, 0.35], flat: 0.55, hy: 0, dyn: 'cheeks' }),
  clap:  (s) => ({ P: [s * 0.06, 0.485, 0.27], Z: [0, 0.6, 1], Y: [s, 0.0, 0], pole: [s * 0.7, -1, -0.15], flat: 0.65, hy: 0, dyn: 'clap' }),
};

// ---------------------------------------------------------------- main
export function createGrandma() {
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const shadow = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

  // materials
  const knitPurple = keep(canvasTex(knitCanvas('#83778e', 8, 10), { repeat: true }));
  const knitPurpleB = keep(canvasTex(knitCanvas('#83778e', 8, 10, 256, true), { repeat: true, srgb: false }));
  const knitRed = keep(canvasTex(knitCanvas('#a52429', 6, 8), { repeat: true }));
  const knitRedB = keep(canvasTex(knitCanvas('#b5282e', 6, 8, 256, true), { repeat: true, srgb: false }));
  const hairMap = keep(canvasTex(hairCanvas(), { repeat: true }));
  const hairBump = keep(canvasTex(hairCanvas(true), { repeat: true, srgb: false }));

  const faceTex = {};
  for (const [k, e, b] of [['calm', 'calm', 0], ['calmBlink', 'calm', 1], ['wow', 'wow', 0], ['wowBlink', 'wow', 1], ['laugh', 'laugh', 0]]) {
    faceTex[k] = keep(canvasTex(paintFace(e, b)));
  }

  const M = {
    skin: keep(new THREE.MeshStandardMaterial({ color: SKIN_HEX, roughness: 0.66, metalness: 0 })),
    face: keep(new THREE.MeshStandardMaterial({ map: faceTex.calm, roughness: 0.66, metalness: 0 })),
    cardigan: keep(new THREE.MeshPhysicalMaterial({ map: knitPurple, bumpMap: knitPurpleB, bumpScale: 0.8, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color('#bfb4c8'), side: THREE.DoubleSide })),
    blouse: keep(new THREE.MeshStandardMaterial({ color: '#e4d9c4', roughness: 0.85, side: THREE.DoubleSide })),
    button: keep(new THREE.MeshStandardMaterial({ color: '#e3d9c8', roughness: 0.35 })),
    skirt: keep(new THREE.MeshStandardMaterial({ color: '#4f4a49', roughness: 0.9 })),
    cushion: keep(new THREE.MeshPhysicalMaterial({ color: '#6c2331', roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color('#c0707a'), sheenRoughness: 0.6 })),
    hair: keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, alphaHash: true, map: hairMap, bumpMap: hairBump, bumpScale: 0.6, roughness: 0.82, sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.5 })),
    metal: keep(new THREE.MeshStandardMaterial({ color: '#a8916a', metalness: 1, roughness: 0.35 })),
    lens: keep(new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.12, depthWrite: false })),
    scarf: keep(new THREE.MeshPhysicalMaterial({ map: knitRed, bumpMap: knitRedB, bumpScale: 1.0, roughness: 0.95, sheen: 0.35, sheenColor: new THREE.Color('#a04048'), sheenRoughness: 0.7 })),
  };

  const group = new THREE.Group(); group.name = 'grandma';
  const body = new THREE.Group(); body.name = 'grandma-body'; group.add(body);

  // cushion
  {
    const g = keep(new RoundedBoxGeometry(0.56, 0.062, 0.56, 3, 0.028));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); if (y > 0) p.setY(i, y + 0.012 * Math.max(0, 1 - (x / 0.28) ** 2) * Math.max(0, 1 - (z / 0.28) ** 2)); }
    g.computeVertexNormals();
    const m = shadow(new THREE.Mesh(g, M.cushion)); m.position.set(0, 0.031, 0.02); group.add(m);
  }
  // lap (skirt over kneeling legs, seiza)
  {
    const g = keep(new THREE.SphereGeometry(1, 28, 14));
    const p = g.attributes.position; const se = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    for (let i = 0; i < p.count; i++) {
      let x = se(p.getX(i), 0.6), y = se(p.getY(i), 0.75), z = se(p.getZ(i), 0.7);
      y -= 0.12 * Math.exp(-(x * x) / 0.02) * Math.max(0, y) * Math.max(0, z);     // groove between knees
      y -= 0.18 * Math.max(0, z) * Math.max(0, y);                                  // thighs slope toward knees
      p.setXYZ(i, x * 0.168, y * 0.078, z * 0.185);
    }
    g.computeVertexNormals();
    const m = shadow(new THREE.Mesh(g, M.skirt)); m.position.set(0, 0.138, 0.085); body.add(m);
  }
  // torso (breathing group)
  const chest = new THREE.Group(); body.add(chest);
  const TILE = 0.05;
  {
    const card = loftGeometry(TORSO, 48, 30, openAt, TILE);
    const bands = [];
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const y = lerp(0.183, 0.634, i / 26); const th = openAt(y);
        const q = torsoPoint(y, side > 0 ? th : Math.PI * 2 - th, 1.0);
        const q2 = torsoPoint(y, side > 0 ? th : Math.PI * 2 - th, 1.04);
        pts.push(q.lerp(q2, 0.5));
      }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0068, 6, false);
      scaleUV(tg, 0.45 / TILE, 0.04 / TILE); bands.push(tg);
    }
    const g = keep(merge([card, ...bands]));
    chest.add(shadow(new THREE.Mesh(g, M.cardigan)));
    // blouse (inner) + collar
    const bl = loftGeometry(TORSO.slice(3), 32, 16, null, TILE, 0.975);
    const collar = [gridGeometry(40, 3, (u, v, p, t) => {
      const ph = lerp(0.22, Math.PI * 2 - 0.22, u); const fr = Math.max(0, Math.cos(ph));
      const tip = sstep(0.22, 0.75, Math.min(ph, Math.PI * 2 - ph));
      const r0 = 1.0, r1 = 1.0 + (0.08 + 0.26 * fr) * (0.3 + 0.7 * tip);
      const rr = lerp(r0, r1, v); const y = 0.634 - 0.008 * v * (0.6 + 0.4 * fr) - 0.004 * v * v;
      p.set(Math.sin(ph) * 0.06 * rr, y, 0.031 + Math.cos(ph) * 0.058 * rr + 0.004 * v * fr); t.set(u * 4, v);
    })];
    chest.add(shadow(new THREE.Mesh(keep(merge([bl, ...collar])), M.blouse)));
    // buttons
    const bs = [];
    for (const y of [0.445, 0.385, 0.325, 0.265]) {
      const b = new THREE.CylinderGeometry(0.0062, 0.0062, 0.0032, 16); b.rotateX(Math.PI / 2);
      const p = torsoPoint(y, 0, 1.0); b.translate(0, y, p.z + 0.0065); bs.push(b);
    }
    for (const y of [0.598, 0.553, 0.508]) {
      const b = new THREE.SphereGeometry(0.0038, 10, 6); b.scale(1, 1, 0.55);
      const p = torsoPoint(y, 0, 0.975); b.translate(0, y, p.z + 0.0012); bs.push(b);
    }
    chest.add(shadow(new THREE.Mesh(keep(merge(bs)), M.button)));
    // neck
    const ng = keep(new THREE.CylinderGeometry(0.049, 0.054, 0.13, 20, 3, true));
    const neck = shadow(new THREE.Mesh(ng, M.skin));
    neck.position.set(0, 0.64, 0.032); neck.rotation.x = 0.3; chest.add(neck);
  }

  // head hierarchy: neckBase (breath) -> look (auto) -> head (scene) -> contents
  const neckBase = new THREE.Group(); neckBase.position.copy(NECK_PIVOT); body.add(neckBase);
  const look = new THREE.Group(); look.rotation.order = 'YXZ'; neckBase.add(look);
  const head = new THREE.Group(); head.name = 'grandma-head'; look.add(head);
  const headC = new THREE.Group(); headC.position.copy(HEAD_CENTER_REL); headC.scale.setScalar(1.22); head.add(headC);
  let headMesh;
  {
    const NA = 66, NL = 56;
    const sA = (u) => { const s = u * 2 - 1; return Math.PI * (0.42 * s + 0.58 * s * s * s); };
    const sL = (v) => { const s = v * 2 - 1; return Math.PI / 2 * (0.6 * s + 0.4 * s * s * s); };
    const g = gridGeometry(NA, NL, (u, v, p, t) => { const a = sA(u), l = sL(v); headBase(a, l, p); t.set(clamp(0.5 + a / 2.5, 0, 1), clamp(0.5 + l / 2.4, 0, 1)); });
    fixPoleRow(g, NA, NL, NL - 1); fixPoleRow(g, NA, 0, 1);
    const n = g.attributes.position.count; const m1 = new Float32Array(n * 3), m2 = new Float32Array(n * 3); const tv = new THREE.Vector3();
    let k = 0;
    for (let j = 0; j <= NL; j++) for (let i = 0; i <= NA; i++, k++) { const a = sA(i / NA), l = sL(j / NL); morphCheek(a, l, tv).toArray(m1, k * 3); morphJaw(a, l, tv).toArray(m2, k * 3); }
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(m1, 3), new THREE.Float32BufferAttribute(m2, 3)];
    g.morphTargetsRelative = true;
    // ears
    const ears = [];
    for (const s of [1, -1]) {
      const e = new THREE.SphereGeometry(1, 16, 12);
      const p = e.attributes.position;
      for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (x > 0) x -= 0.55 * Math.exp(-(y * y) / 0.3 - (z * z) / 0.35); y *= 1 + 0.15 * Math.max(0, y); p.setXYZ(i, x * 0.0072, y * 0.0235, z * 0.0145); }
      e.rotateZ(-0.12); e.rotateY(0.12);
      const at = headBase(1.56, -0.1); e.translate(at.x + 0.001, at.y, at.z - 0.004);
      if (s < 0) mirrorX(e);
      e.computeVertexNormals(); setUV(e, 0.004, 0.5);
      const z = new Float32Array(e.attributes.position.count * 3);
      e.morphAttributes.position = [new THREE.Float32BufferAttribute(z, 3), new THREE.Float32BufferAttribute(z.slice(), 3)];
      e.morphTargetsRelative = true;
      ears.push(e);
    }
    const hg = keep(mergeGeometries([g, ...ears], false)); hg.morphTargetsRelative = true;
    headMesh = shadow(new THREE.Mesh(hg, M.face)); headMesh.morphTargetInfluences = [0, 0];
    headC.add(headMesh);
  }
  // hair
  {
    const r = rng(21); const bumps = [];
    for (let i = 0; i < 180; i++) {
      const big = i < 60; let d;
      do { d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (d.lengthSq() > 1 || d.lengthSq() < 0.01);
      d.normalize(); if (d.y < -0.6) d.y = -d.y * 0.5;
      const rad = big ? 0.13 + r() * 0.06 : 0.07 + r() * 0.04; const amp = big ? 0.003 + r() * 0.0025 : 0.0015 + r() * 0.0015;
      bumps.push([d, 2 / (rad * rad), amp]); if (big) bumps.push([new THREE.Vector3(-d.x, d.y + (r() - 0.5) * 0.1, d.z).normalize(), 2 / (rad * rad), amp * (0.8 + r() * 0.4)]);
    }
    const HL = [[0, 0.49], [0.45, 0.47], [0.85, 0.36], [1.2, 0.22], [1.45, 0.13], [1.7, 0.03], [2.05, -0.36], [2.6, -0.6], [Math.PI, -0.66]];
    const NA = 68, NT = 24; const dir = new THREE.Vector3(), nrm = new THREE.Vector3(); const bsumArr = [];
    const g = gridGeometry(NA, NT, (u, v, p, t) => {
      const a = (u * 2 - 1) * Math.PI; const lh = table1(HL, Math.abs(a)) + 0.025 * Math.sin(a * 7 + 0.3) + 0.015 * Math.sin(a * 13 + 1);
      const l = lerp(lh, Math.PI / 2, Math.pow(v, 0.9));
      headBase(a, l, p);
      dir.set(Math.sin(a) * Math.cos(l), Math.sin(l), Math.cos(a) * Math.cos(l));
      nrm.set(dir.x / HR.x, dir.y / HR.y, dir.z / (dir.z > 0 ? HR.zf : HR.zb)).normalize();
      let th = (0.013 + 0.0075 * sstep(0.3, 1.2, Math.abs(a)) * sstep(-0.35, 0.35, l) * sstep(1.3, 0.7, l) + 0.0055 * sstep(0.45, 1.1, l)) * (1 - 0.45 * sstep(0.0, -0.6, l) * sstep(1.8, 2.6, Math.abs(a)));
      let bsum = 0; for (const [d, k, amp] of bumps) bsum += amp * Math.exp(-k * (1 - d.dot(dir)));
      bsumArr.push(bsum);
      th = th * (0.08 + 0.92 * sstep(0, 0.3, v)) + bsum * sstep(0.02, 0.26, v);
      p.addScaledVector(nrm, th);
      t.set(u * 5, v * 1.8);
    });
    fixPoleRow(g, NA, NT, NT - 1);
    { const n = g.attributes.position.count, col = new Float32Array(n * 4); const rr = rng(9);
      for (let j = 0, k = 0; j <= NT; j++) for (let i = 0; i <= NA; i++, k++) { const v = j / NT; const ao = 0.62 + 0.38 * sstep(0.003, 0.009, bsumArr[k]); col.set([ao, ao, ao * 0.99, (v >= 0.06 ? 1 : clamp(0.3 + 0.7 * sstep(0.0, 0.06, v) * (0.8 + 0.4 * rr()), 0, 1))], k * 4); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); }
    headC.add(shadow(new THREE.Mesh(keep(g), M.hair)));
  }
  // glasses
  {
    const R = 0.0188, yaw = 0.13; const parts = [], lens = [];
    const centers = {};
    for (const s of [1, -1]) {
      const e = headBase(s * 29.5 / 70, 4.5 / 92);
      const c = new THREE.Vector3(e.x * 1.0, e.y + 0.0005, e.z + 0.0165); centers[s] = c;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, s * yaw, 0));
      const t = new THREE.TorusGeometry(R, 0.0009, 5, 36); t.applyQuaternion(q); t.translate(c.x, c.y, c.z); parts.push(t);
      const l = new THREE.CircleGeometry(R, 40); l.applyQuaternion(q); l.translate(c.x, c.y, c.z); lens.push(l);
      // temple
      const outer = new THREE.Vector3(R, 0.002, 0).applyQuaternion(q).multiplyScalar(s).add(c);
      outer.x = c.x + s * R * Math.cos(yaw); outer.z = c.z - R * Math.sin(yaw);
      const side = headBase(s * 1.15, 0.07); side.x += s * 0.0075; side.z += 0.001;
      const ear = headBase(s * 1.55, 0.03); ear.x += s * 0.007;
      const back = headBase(s * 1.85, -0.04); back.x += s * 0.002;
      const curveT = new THREE.CatmullRomCurve3([outer, outer.clone().add(new THREE.Vector3(s * 0.004, 0, -0.008)), side, ear, back]);
      parts.push(new THREE.TubeGeometry(curveT, 18, 0.0011, 4, false));
      const hinge = new THREE.BoxGeometry(0.004, 0.003, 0.004); hinge.translate(outer.x, outer.y, outer.z); parts.push(hinge);
    }
    const iL = centers[-1].clone().add(new THREE.Vector3(R * Math.cos(yaw), 0.004, R * Math.sin(yaw) * -1 * -1));
    const iR = centers[1].clone().add(new THREE.Vector3(-R * Math.cos(yaw), 0.004, R * Math.sin(yaw)));
    const nose = headBase(0, 0.03);
    const bridge = new THREE.QuadraticBezierCurve3(iL, new THREE.Vector3(0, iL.y + 0.006, Math.max(nose.z + 0.004, iL.z)), iR);
    parts.push(new THREE.TubeGeometry(bridge, 12, 0.0011, 5, false));
    const gm = shadow(new THREE.Mesh(keep(merge(parts)), M.metal), true, false);
    headC.add(gm);
    const lm = new THREE.Mesh(keep(merge(lens)), M.lens); lm.renderOrder = 2; headC.add(lm);
  }

  // face spot anchors and sticker meshes
  const spots = {};
  for (const [name, [a0, l0]] of Object.entries(SPOTS)) {
    const P0 = headBase(a0, l0); const e = 0.01;
    const ja = headBase(a0 + e, l0).sub(headBase(a0 - e, l0)).length() / (2 * e);
    const jl = headBase(a0, l0 + e).sub(headBase(a0, l0 - e)).length() / (2 * e);
    const Rr = 0.0185, N = 8; const nrm = new THREE.Vector3();
    const geo = gridGeometry(N, N, (u, v, p, t) => {
      const du = (u - 0.5) * 2 * Rr, dv = (v - 0.5) * 2 * Rr;
      const a = a0 + du / ja, l = l0 + dv / jl; headBase(a, l, p);
      const pa = headBase(a + e, l).sub(headBase(a - e, l)); const pl = headBase(a, l + e).sub(headBase(a, l - e));
      nrm.crossVectors(pa, pl).normalize(); p.addScaledVector(nrm, 0.0016); t.set(u, v);
    });
    keep(geo);
    const anchor = new THREE.Group(); anchor.position.copy(P0); headC.add(anchor);
    const holder = new THREE.Group(); headC.add(holder);
    const cheekDelta = morphCheek(a0, l0, new THREE.Vector3());
    spots[name] = { geo, anchor, holder, mesh: null, mat: null, cheekDelta };
  }

  // scarf
  const scarf = new THREE.Group(); scarf.visible = false; chest.add(scarf);
  {
    const parts = []; const ST = 0.06;
    const ring = gridGeometry(64, 10, (u, v, p, t) => {
      const ph = u * Math.PI * 2, ps = v * Math.PI * 2;
      const rx = 0.082, rz = 0.078, zc = 0.026, y0 = 0.62;
      const wob = 1 + 0.05 * Math.sin(ph * 3 + 0.5);
      const cx = Math.sin(ph) * rx, cz = zc + Math.cos(ph) * rz, cy = y0 - 0.012 * Math.cos(ph) + 0.004 * Math.cos(ph * 2);
      const nx = Math.sin(ph) / rx, nz = Math.cos(ph) / rz; const nl = Math.hypot(nx, nz);
      const tr = 0.0185 * wob, th = 0.024 * wob;
      p.set(cx + nx / nl * Math.cos(ps) * tr, cy + Math.sin(ps) * th, cz + nz / nl * Math.cos(ps) * tr);
      t.set(u * 0.5 / ST, v * 0.13 / ST);
    });
    parts.push(ring);
    const ends = [
      { pts: [[0.03, 0.612, 0.112], [0.036, 0.56, 0.13], [0.044, 0.5, 0.14], [0.05, 0.435, 0.146]], w: 0.062, dz: 0.0 },
      { pts: [[-0.012, 0.612, 0.12], [-0.022, 0.565, 0.139], [-0.03, 0.51, 0.151], [-0.036, 0.462, 0.156]], w: 0.06, dz: 0.0 },
    ];
    for (const E of ends) {
      const crv = new THREE.CatmullRomCurve3(E.pts.map((q) => new THREE.Vector3(...q)));
      const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
      const box = new THREE.BoxGeometry(E.w, 1, 0.013, 4, 16, 1); const p = box.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const tt = 0.5 - y;
        const c = crv.getPointAt(tt); crv.getTangentAt(tt, T);
        B.set(1, 0, 0); N.crossVectors(B, T).normalize().multiplyScalar(-1); if (N.z < 0) N.negate();
        B.crossVectors(T, N).normalize(); if (B.x < 0) B.negate();
        const wv = 1 + 0.04 * Math.sin(tt * 9);
        p.setXYZ(i, c.x + B.x * x * wv + N.x * z, c.y + B.y * x * wv + N.y * z, c.z + B.z * x * wv + N.z * z);
      }
      box.computeVertexNormals(); scaleUV(box, E.w / ST, 0.2 / ST); parts.push(box);
      const end = crv.getPointAt(1), tan = crv.getTangentAt(1);
      for (let k = 0; k < 7; k++) {
        const fx = lerp(-E.w / 2 + 0.005, E.w / 2 - 0.005, k / 6);
        const f = new THREE.CylinderGeometry(0.0028, 0.0022, 0.034, 6); f.translate(0, -0.017, 0);
        f.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), tan.clone().add(new THREE.Vector3((k - 3) * 0.02, -0.4, 0)).normalize()));
        f.translate(end.x + fx, end.y + 0.002, end.z); scaleUV(f, 0.1, 0.4); parts.push(f);
      }
    }
    scarf.add(shadow(new THREE.Mesh(keep(merge(parts)), M.scarf)));
  }

  // arms
  const arms = {};
  for (const s of [1, -1]) {
    const ug = new THREE.CylinderGeometry(0.0345, 0.0395, L1, 18, 4, true); ug.translate(0, L1 / 2, 0);
    scaleUV(ug, 0.24 / TILE, L1 / TILE);
    const sh = new THREE.SphereGeometry(0.04, 18, 12); scaleUV(sh, 0.28 / TILE, 0.14 / TILE);
    const el = new THREE.SphereGeometry(0.0352, 16, 10); el.rotateZ(Math.PI / 2); el.translate(0, L1, 0); scaleUV(el, 0.22 / TILE, 0.11 / TILE);
    const upper = shadow(new THREE.Mesh(keep(merge([ug, sh, el])), M.cardigan));
    const fg = new THREE.CylinderGeometry(0.0285, 0.0345, L2, 18, 4, true); fg.translate(0, L2 / 2, 0); scaleUV(fg, 0.2 / TILE, L2 / TILE);
    const cuff = new THREE.CylinderGeometry(0.0305, 0.0305, 0.028, 18, 1, false); cuff.translate(0, L2 - 0.012, 0); scaleUV(cuff, 0.2 / TILE, 0.03 / TILE);
    const lower = shadow(new THREE.Mesh(keep(merge([fg, cuff])), M.cardigan));
    const hand = shadow(new THREE.Mesh(keep(handWithMorph(s)), M.skin)); hand.morphTargetInfluences = [0];
    body.add(upper, lower, hand);
    arms[s] = { upper, lower, hand, cur: null, from: null };
  }

  const holdPoint = new THREE.Group(); holdPoint.name = 'grandma-holdPoint'; body.add(holdPoint);

  // ------------------------------------------------------------ state
  const st = {
    expr: 'calm', blinkT: 2.5, blinking: 0, pose: 'lap', k: 1, lift: 0,
    lookTarget: null, yaw: 0, pitch: 0, bounceY: 0, bounceV: 0, clapPhase: 0, breath: 0,
    morph: [0.25, 0], morphT: [0.25, 0], time: 0,
  };
  const EXPR_MORPH = { calm: [0.3, 0], wow: [0.15, 0.85], laugh: [1, 0.6] };

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  const quatFrom = (Z, Y, out) => {
    _z.fromArray(Z).normalize(); _y.fromArray(Y); _x.crossVectors(_y, _z).normalize(); _y.crossVectors(_z, _x).normalize();
    _m.makeBasis(_x, _y, _z); return out.setFromRotationMatrix(_m);
  };
  function poseTarget(name, s, out) {
    const d = POSES[name](s);
    out.P = out.P || new THREE.Vector3(); out.Q = out.Q || new THREE.Quaternion(); out.pole = out.pole || new THREE.Vector3();
    out.flat = d.flat; out.hy = d.hy;
    out.pole.fromArray(d.pole).normalize();
    if (d.dyn === 'cheeks') {
      // palm against cheek, following the head
      const a = s * 0.95, l = -0.52;
      const pc = headBase(a, l, _v); const pn = headBase(a + 0.01, l, _v2).sub(pc);
      const nrm = new THREE.Vector3(Math.sin(a), -0.1, Math.cos(a) * 0.9).normalize();
      pc.addScaledVector(nrm, 0.0135);
      headC.updateWorldMatrix(true, false); body.updateWorldMatrix(true, false);
      const wp = pc.clone().applyMatrix4(headC.matrixWorld); body.worldToLocal(wp); out.P.copy(wp);
      // orientation in head space then to body space
      const qh = new THREE.Quaternion(); headC.getWorldQuaternion(qh);
      const qb = new THREE.Quaternion(); body.getWorldQuaternion(qb); qh.premultiply(qb.invert());
      const Z = new THREE.Vector3(-s * 0.18, 1, -0.42).applyQuaternion(qh), Y = nrm.clone().applyQuaternion(qh);
      quatFrom(Z.toArray(), Y.toArray(), out.Q);
    } else {
      out.P.fromArray(d.P);
      if (d.dyn === 'clap') {
        const open = Math.pow(0.5 + 0.5 * Math.cos(st.clapPhase), 0.8);
        out.P.x = s * (0.0128 + 0.052 * open);
      }
      quatFrom(d.Z, d.Y, out.Q);
    }
    return out;
  }
  const snap = (c) => ({ P: c.P.clone(), Q: c.Q.clone(), pole: c.pole.clone(), flat: c.flat, hy: c.hy });
  for (const s of [1, -1]) { arms[s].cur = poseTarget('lap', s, {}); arms[s].from = snap(arms[s].cur); arms[s].tgt = {}; }

  function solveArm(s, breathY) {
    const A = arms[s], c = A.cur;
    const S = SHOULDER(s); S.y += breathY;
    const _zz = new THREE.Vector3(0, 0, 1).applyQuaternion(c.Q);
    const W = c.P.clone().addScaledVector(_zz, -PALM_OFF);
    const d = W.clone().sub(S); let dist = d.length(); const n = d.clone().divideScalar(dist || 1);
    dist = clamp(dist, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.002);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const q = c.pole.clone().addScaledVector(n, -c.pole.dot(n)).normalize();
    const E = S.clone().addScaledVector(n, a).addScaledVector(q, h);
    const Wr = S.clone().addScaledVector(n, dist);
    // segment frames: Y along the bone, X = normal of the bending plane (keeps sphere poles on the sides)
    const du = E.clone().sub(S).normalize(), dl = Wr.clone().sub(E).normalize();
    const bx = new THREE.Vector3().crossVectors(du, dl); if (bx.lengthSq() < 1e-6) bx.set(s, 0, 0).cross(du).cross(du).negate(); bx.normalize();
    const setFrame = (obj, y) => { const z = new THREE.Vector3().crossVectors(bx, y).normalize(); const x = new THREE.Vector3().crossVectors(y, z); _m.makeBasis(x, y, z); obj.quaternion.setFromRotationMatrix(_m); };
    A.upper.position.copy(S); setFrame(A.upper, du);
    A.lower.position.copy(E); setFrame(A.lower, dl); _v2.copy(dl);
    A.hand.position.copy(Wr).addScaledVector(_v2, 0.004); A.hand.quaternion.copy(c.Q);
    A.hand.morphTargetInfluences[0] = c.flat;
  }

  const gm = {
    group, head, holdPoint, onClap: null,
    setExpression(name) {
      if (!EXPR_MORPH[name]) return; st.expr = name; st.blinking = 0;
      M.face.map = faceTex[name]; st.morphT = EXPR_MORPH[name].slice();
    },
    lookAt(p) { st.lookTarget = p ? p.clone() : null; },
    setArms(pose) {
      if (!POSES[pose] || pose === st.pose) return;
      const involvesLap = pose === 'lap' || st.pose === 'lap';
      for (const s of [1, -1]) arms[s].from = snap(arms[s].cur);
      st.pose = pose; st.k = 0; st.lift = involvesLap ? 1 : 0.35;
      if (pose === 'clap') st.clapPhase = 0;
    },
    wearScarf(on) { scarf.visible = !!on; },
    setFaceSticker(spot, tex) {
      const S = spots[spot]; if (!S) return;
      if (S.mesh) { S.holder.remove(S.mesh); S.mat.dispose(); S.mesh = null; S.mat = null; }
      if (!tex) return;
      S.mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      S.mesh = new THREE.Mesh(S.geo, S.mat); S.mesh.renderOrder = 1; S.mesh.receiveShadow = true; S.holder.add(S.mesh);
    },
    faceSpotWorld(spot, target = new THREE.Vector3()) { const S = spots[spot]; if (!S) return target.set(0, 0, 0); S.anchor.updateWorldMatrix(true, false); return S.anchor.getWorldPosition(target); },
    headWorld(target = new THREE.Vector3()) { headC.updateWorldMatrix(true, false); return headC.getWorldPosition(target); },
    bounce() { st.bounceV = Math.min(0.55, st.bounceV + 0.42); },
    update(dt, t) {
      dt = clamp(dt || 0, 0, 0.1); st.time = t != null ? t : st.time + dt;
      const time = st.time;
      // breathing
      const b = Math.sin(time * Math.PI * 2 / 4.2);
      chest.scale.set(1 + 0.004 * b, 1 + 0.0035 * b, 1 + 0.008 * b);
      const breathY = 0.0022 * b;
      neckBase.position.set(NECK_PIVOT.x, NECK_PIVOT.y + breathY, NECK_PIVOT.z);
      // bounce spring
      const w = 13, z = 0.42;
      st.bounceV += (-w * w * st.bounceY - 2 * z * w * st.bounceV) * dt; st.bounceY += st.bounceV * dt;
      st.bounceY = clamp(st.bounceY, -0.012, 0.03);
      body.position.y = st.bounceY; body.scale.set(1 - 0.25 * st.bounceY, 1 + 0.9 * st.bounceY, 1 - 0.25 * st.bounceY);
      // look
      let ty = 0, tp = 0;
      if (st.lookTarget) {
        group.updateWorldMatrix(true, false);
        _v.copy(st.lookTarget); neckBase.parent.updateWorldMatrix(true, false);
        neckBase.worldToLocal(_v); _v.sub(HEAD_CENTER_REL);
        ty = clamp(Math.atan2(_v.x, _v.z), -0.45, 0.45);
        tp = clamp(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.3, 0.1); // 下を向きすぎると子どもの目線から顔が見えなくなる
      }
      const kk = 1 - Math.exp(-dt * 3.2);
      st.yaw += (ty - st.yaw) * kk; st.pitch += (tp - st.pitch) * kk;
      look.rotation.set(st.pitch + 0.025 * Math.sin(time * 0.37) + 0.012 * b, st.yaw + 0.02 * Math.sin(time * 0.23), 0.018 * Math.sin(time * 0.29 + 1));
      // expression morph easing & blink
      const km = 1 - Math.exp(-dt * 14);
      for (let i = 0; i < 2; i++) st.morph[i] += (st.morphT[i] - st.morph[i]) * km;
      headMesh.morphTargetInfluences[0] = st.morph[0]; headMesh.morphTargetInfluences[1] = st.morph[1];
      for (const S of Object.values(spots)) S.holder.position.copy(S.cheekDelta).multiplyScalar(st.morph[0]);
      if (st.expr !== 'laugh') {
        if (st.blinking > 0) { st.blinking -= dt; if (st.blinking <= 0) M.face.map = faceTex[st.expr]; }
        else { st.blinkT -= dt; if (st.blinkT <= 0) { st.blinking = 0.12; st.blinkT = 2.2 + Math.random() * 3.3; M.face.map = faceTex[st.expr + 'Blink']; } }
      }
      // clap
      if (st.pose === 'clap') {
        const prev = st.clapPhase; st.clapPhase += dt * Math.PI * 2 * 2.1;
        const cyc = (p) => Math.floor((p - Math.PI) / (Math.PI * 2));
        if (st.k >= 1 && cyc(st.clapPhase) > cyc(prev) && typeof gm.onClap === 'function') gm.onClap();
      }
      // arms
      st.k = Math.min(1, st.k + dt / 0.4);
      const e = sstep(0, 1, st.k);
      group.updateWorldMatrix(true, true);
      for (const s of [1, -1]) {
        const A = arms[s]; const T = poseTarget(st.pose, s, A.tgt);
        if (st.k < 1) {
          A.cur.P.lerpVectors(A.from.P, T.P, e);
          A.cur.P.y += Math.sin(Math.PI * st.k) * 0.07 * st.lift; A.cur.P.z -= Math.sin(Math.PI * st.k) * 0.03 * st.lift;
          A.cur.Q.slerpQuaternions(A.from.Q, T.Q, e);
          A.cur.pole.lerpVectors(A.from.pole, T.pole, e).normalize();
          A.cur.flat = lerp(A.from.flat, T.flat, e); A.cur.hy = lerp(A.from.hy, T.hy, e);
        } else { A.cur.P.copy(T.P); A.cur.Q.copy(T.Q); A.cur.pole.copy(T.pole); A.cur.flat = T.flat; A.cur.hy = T.hy; }
        solveArm(s, breathY);
      }
      holdPoint.position.lerpVectors(arms[1].cur.P, arms[-1].cur.P, 0.5); holdPoint.position.y += arms[1].cur.hy;
    },
    dispose() {
      for (const S of Object.values(spots)) if (S.mat) S.mat.dispose();
      for (const d of disposables) d.dispose && d.dispose();
      for (const m of Object.values(M)) m.dispose();
      group.removeFromParent();
    },
  };
  gm.update(0, 0);
  return gm;
}
