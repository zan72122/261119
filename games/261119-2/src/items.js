// items.js — 小包の中身（マフラー・みかん・子どもの絵）。写実寄り、テクスチャは Canvas2D で手続き生成。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ITEM_KINDS = ['scarf', 'mikan', 'drawing'];

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// ---------------------------------------------------------------- scarf
const KNIT_TILE = 0.044; // 8 目ぶん (m)
function knitTextures() {
  return cached('knit', () => {
    const S = 256, cols = 8, rows = 10, cw = S / cols, rh = S / rows;
    const col = makeCanvas(S, S), c = col.getContext('2d');
    const bmp = makeCanvas(S, S), b = bmp.getContext('2d');
    c.fillStyle = '#4a0710'; c.fillRect(0, 0, S, S);
    b.fillStyle = '#000'; b.fillRect(0, 0, S, S);
    const r = rng(8);
    const leg = (ctx, x, y, ang, stops) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      const g = ctx.createRadialGradient(-1, -rh * 0.25, 1, 0, 0, rh * 0.7);
      stops.forEach(([o, col]) => g.addColorStop(o, col));
      ctx.beginPath(); ctx.ellipse(0, 0, cw * 0.27, rh * 0.66, 0, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    };
    for (let j = -1; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const x = i * cw + cw / 2, y = j * rh + rh / 2;
      for (const s of [-1, 1]) {
        const lx = x + s * cw * 0.22, ang = -s * 0.55;
        const k = 0.88 + r() * 0.18;
        const cs = [[0, `rgb(${Math.round(206 * k)},${Math.round(34 * k)},${Math.round(42 * k)})`],
          [0.55, `rgb(${Math.round(160 * k)},${Math.round(18 * k)},${Math.round(28 * k)})`], [1, '#5e0912']];
        const bs = [[0, '#fff'], [0.6, '#999'], [1, '#111']];
        for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) {
          if (lx + dx < -cw || lx + dx > S + cw || y + dy < -rh || y + dy > S + rh) continue;
          leg(c, lx + dx, y + dy, ang, cs);
          leg(b, lx + dx, y + dy, ang, bs);
        }
      }
    }
    // 毛羽立ち
    c.lineWidth = 0.6;
    for (let i = 0; i < 900; i++) {
      const x = r() * S, y = r() * S, a = r() * 6.28, l = 2 + r() * 5;
      c.strokeStyle = r() < 0.5 ? 'rgba(225,80,85,0.22)' : 'rgba(90,0,10,0.25)';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    return { map: toTex(col, { repeat: true }), bump: toTex(bmp, { repeat: true, srgb: false }) };
  });
}
// 畳んだマフラー: 角の丸い断面を、つづら折りの経路に沿って掃引した 1 枚の帯
const SC = { L: 0.088, th: 0.0175, d: 0.118, s: 0.0162 };
function scarfPath() {
  const { L, s } = SC, y0 = SC.th / 2, r = s / 2, pts = [];
  const line = (xa, xb, y, n) => { for (let i = 0; i <= n; i++) pts.push([xa + (xb - xa) * (i / n), y]); };
  const arc = (cx, cy, a0, a1, n) => { for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  line(-L + 0.012, L, y0, 14);
  arc(L, y0 + r, -Math.PI / 2, Math.PI / 2, 10);
  line(L, -L, y0 + s, 16);
  arc(-L, y0 + 1.5 * s, (3 * Math.PI) / 2, Math.PI / 2, 10);
  line(-L, 0.045, y0 + 2 * s, 12);
  return pts;
}
function scarfGeometry() {
  const pts = scarfPath(), n = pts.length, M = 28, r = rng(17);
  const { th, d } = SC;
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const wob = 1 + (r() - 0.5) * 0.04;
    for (let j = 0; j <= M; j++) {
      const q = (j / M) * Math.PI * 2, cq = Math.cos(q), sq = Math.sin(q);
      const zf = Math.sign(cq) * Math.pow(Math.abs(cq), 0.35);           // 角の丸い断面
      const z = zf * (d / 2) * wob;
      const fat = 1 - 0.45 * Math.pow(Math.abs(zf), 6);                    // 端は少し薄く、中央はふっくら
      const t = Math.sign(sq) * Math.pow(Math.abs(sq), 0.6) * (th / 2) * fat;
      pos.push(pts[i][0] + nx * t, pts[i][1] + ny * t, z);
      uv.push((z + q * 0.0004) / KNIT_TILE, acc / KNIT_TILE);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  // 両端のふた
  for (const [i, flip] of [[0, true], [n - 1, false]]) {
    const ci = pos.length / 3; pos.push(pts[i][0], pts[i][1], 0); uv.push(0, 0);
    for (let j = 0; j < M; j++) { const a = i * (M + 1) + j; if (flip) idx.push(ci, a + 1, a); else idx.push(ci, a, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function createScarf() {
  const g = new THREE.Group();
  const { map, bump } = knitTextures();
  const mat = new THREE.MeshPhysicalMaterial({
    map, bumpMap: bump, bumpScale: 3, roughness: 0.95, sheen: 0.22, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x902028),
  });
  const body = new THREE.Mesh(scarfGeometry(), mat);
  body.castShadow = true; body.receiveShadow = true; g.add(body);
  // 端の房（フリンジ）: 上の段の端から出て、下の段の上に垂れる
  const r = rng(12), parts = [];
  const x0 = 0.043, y0 = SC.th / 2 + 2 * SC.s, drop = SC.s * 0.85;
  for (let i = 0; i < 16; i++) {
    const z = -0.052 + (i / 15) * 0.104 + (r() - 0.5) * 0.003;
    const len = 0.032 + r() * 0.01;
    const cg = new THREE.CylinderGeometry(0.0019, 0.0015, len, 5, 6, true);
    cg.rotateZ(-Math.PI / 2); cg.translate(len / 2, 0, 0);
    const p = cg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = Math.max(0, p.getX(k)) / len;
      p.setY(k, p.getY(k) - drop * Math.sin(Math.min(t * 1.7, 1) * Math.PI / 2));
    }
    cg.rotateY((r() - 0.5) * 0.3);
    cg.translate(x0, y0 + (r() - 0.5) * 0.002, z);
    cg.deleteAttribute('uv');
    parts.push(cg);
  }
  const fg = mergeGeometries(parts); parts.forEach((p) => p.dispose());
  fg.computeVertexNormals();
  const fmat = new THREE.MeshPhysicalMaterial({ color: 0x9c1424, roughness: 1, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x902028) });
  const fr = new THREE.Mesh(fg, fmat); fr.castShadow = true; fr.receiveShadow = true;
  g.add(fr);
  g.userData = { kind: 'scarf', w: 0.2, d: 0.12, h: 0.05 };
  return g;
}

// ---------------------------------------------------------------- mikan
function peelTextures() {
  return cached('peel', () => {
    const w = 256, h = 128;
    const col = makeCanvas(w, h), c = col.getContext('2d');
    const bmp = makeCanvas(w, h), b = bmp.getContext('2d');
    const r = rng(31);
    c.fillStyle = '#f08a14'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,170,40,${r() * 0.18})` : `rgba(210,90,0,${r() * 0.15})`;
      c.beginPath(); c.arc(r() * w, r() * h, 4 + r() * 14, 0, 6.28); c.fill();
    }
    b.fillStyle = '#808080'; b.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const x = r() * w, y = r() * h, rr = 0.4 + r() * 0.7;
      b.fillStyle = `rgba(40,40,40,${0.2 + r() * 0.3})`; b.beginPath(); b.ellipse(x, y, rr * 2, rr, 0, 0, 6.28); b.fill();
      if (r() < 0.6) { c.fillStyle = `rgba(190,80,0,${0.15 + r() * 0.2})`; c.beginPath(); c.ellipse(x, y, rr * 2, rr, 0, 0, 6.28); c.fill(); }
    }
    // 上下の極付近（へた周り・おしり）は少し色が違う
    const gy = c.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0, 'rgba(160,110,10,0.35)'); gy.addColorStop(0.12, 'rgba(160,110,10,0)');
    gy.addColorStop(0.9, 'rgba(230,110,0,0)'); gy.addColorStop(1, 'rgba(200,90,0,0.3)');
    c.fillStyle = gy; c.fillRect(0, 0, w, h);
    return { map: toTex(col, { repeat: true }), bump: toTex(bmp, { repeat: true, srgb: false }) };
  });
}
const MIKAN_R = 0.036, MIKAN_SQ = 0.8;
function createMikan() {
  const g = new THREE.Group();
  const { map, bump } = peelTextures();
  const mat = new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 0.35, roughness: 0.5 });
  const geo = new THREE.SphereGeometry(MIKAN_R, 30, 20);
  const p = geo.attributes.position, r = rng(5);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const yy = y / MIKAN_R;
    // 少しつぶれた形、上下のくぼみ
    const flat = 1 - 0.08 * Math.pow(Math.abs(yy), 6);
    p.setXYZ(i, x * (1 + 0.04 * (1 - yy * yy)), y * MIKAN_SQ * flat, z * (1 + 0.04 * (1 - yy * yy)));
  }
  geo.computeVertexNormals();
  const calMat = new THREE.MeshStandardMaterial({ color: 0x5f7a2a, roughness: 0.7 });
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, rr = i % 2 ? 0.0032 : 0.0075;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const calGeo = new THREE.ShapeGeometry(sh); calGeo.rotateX(-Math.PI / 2);
  const stemGeo = new THREE.CylinderGeometry(0.0016, 0.002, 0.005, 6); stemGeo.translate(0, 0.0025, 0);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x6b6a2c, roughness: 0.8 });
  const hy = MIKAN_R * MIKAN_SQ;
  const side = MIKAN_R * 1.95, th = side * Math.sqrt(3) / 2;
  const pos = [[-side / 2, -th / 3], [side / 2, -th / 3], [0, (2 * th) / 3]];
  const fruits = pos.map(([x, z], i) => {
    const f = new THREE.Group();
    f.position.set(x, hy * 0.985, z);
    const m = new THREE.Mesh(geo, mat); m.rotation.y = r() * 6.28; m.castShadow = true; m.receiveShadow = true;
    const cal = new THREE.Mesh(calGeo, calMat); cal.position.y = hy * 0.985; cal.rotation.y = r() * 6.28;
    const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = hy * 0.985; stem.castShadow = true;
    f.add(m, cal, stem);
    f.rotation.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    f.userData.basePos = f.position.clone(); f.userData.baseRot = f.rotation.clone();
    g.add(f);
    return f;
  });
  const w = side + MIKAN_R * 2.08, d = th + MIKAN_R * 2.08;
  // 原点を底面中心（バウンディング中心）にする
  const cz = (-th / 3 + (2 * th) / 3) / 2;
  fruits.forEach((f) => { f.position.z -= cz; f.userData.basePos.z -= cz; });
  g.userData = { kind: 'mikan', w, d, h: hy * 2, fruits };
  return g;
}

// ---------------------------------------------------------------- drawing
export function drawingTexture() {
  return cached('drawing', () => {
    const w = 512, h = 366;
    const paper = makeCanvas(w, h), pc = paper.getContext('2d');
    const layer = makeCanvas(w, h), c = layer.getContext('2d');
    const r = rng(2025);
    pc.fillStyle = '#fbfaf4'; pc.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { pc.fillStyle = `rgba(140,130,110,${r() * 0.06})`; pc.fillRect(r() * w, r() * h, 1 + r() * 2, 1); }

    const jit = (v, a) => v + (r() - 0.5) * a;
    const stroke = (pts, color, width, passes = 3) => {
      c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 0; k < passes; k++) {
        c.globalAlpha = 0.62 + r() * 0.3; c.lineWidth = width * (0.65 + r() * 0.45);
        c.beginPath();
        pts.forEach(([x, y], i) => { const X = jit(x, width * 0.7), Y = jit(y, width * 0.7); if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y); });
        c.stroke();
      }
      c.globalAlpha = 1;
    };
    const circlePts = (cx, cy, rx, ry, n = 28, wob = 0.06, turns = 1.08) => {
      const o = r() * 6.28, pts = [];
      for (let i = 0; i <= n * turns; i++) { const a = o + (i / n) * Math.PI * 2, k = 1 + (r() - 0.5) * wob; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
      return pts;
    };
    // クレヨンの塗り（クリップ内をギザギザに往復）
    const fill = (pathFn, color, step = 3.2, ang = -0.5 + r()) => {
      c.save(); pathFn(); c.clip();
      c.strokeStyle = color; c.lineWidth = 3.6; c.lineCap = 'round'; c.globalAlpha = 0.75;
      const ca = Math.cos(ang), sa = Math.sin(ang), R = w;
      c.beginPath();
      for (let t = -R; t < R; t += step) {
        const ox = w / 2 - t * sa, oy = h / 2 + t * ca;
        c.moveTo(ox - R * ca + jit(0, 2), oy - R * sa + jit(0, 2));
        c.lineTo(ox + R * ca + jit(0, 2), oy + R * sa + jit(0, 2));
      }
      c.stroke(); c.restore(); c.globalAlpha = 1;
    };
    const ell = (cx, cy, rx, ry) => () => { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
    const poly = (pts) => () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

    // 地面
    fill(poly([[0, 330], [120, 322], [260, 334], [390, 324], [512, 330], [512, 366], [0, 366]]), '#7cc05a', 4);
    stroke([[6, 330], [120, 322], [260, 334], [390, 324], [506, 330]], '#3f9a35', 5);
    // 太陽
    fill(ell(72, 70, 34, 33), '#ffd21f', 3);
    stroke(circlePts(72, 70, 34, 33), '#ff9a14', 5);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28 + 0.2; stroke([[72 + Math.cos(a) * 44, 70 + Math.sin(a) * 44], [72 + Math.cos(a) * 64, 70 + Math.sin(a) * 64]], '#ff9a14', 5, 2); }
    // ハート
    const heart = () => { c.beginPath(); c.moveTo(262, 128); c.bezierCurveTo(232, 108, 236, 80, 262, 92); c.bezierCurveTo(288, 80, 292, 108, 262, 128); c.closePath(); };
    fill(heart, '#f0263f', 3);
    stroke([[262, 128], [240, 112], [238, 92], [252, 86], [262, 94], [272, 86], [286, 92], [284, 112], [262, 128]], '#d0102a', 4);

    // おばあちゃん
    const GX = 186, GY = 150;
    fill(poly([[GX - 10, GY + 40], [GX + 10, GY + 40], [GX + 46, GY + 152], [GX - 46, GY + 152]]), '#9b5fc0', 3.4);
    stroke([[GX - 10, GY + 40], [GX - 46, GY + 152], [GX + 46, GY + 152], [GX + 10, GY + 40]], '#6e3a96', 4);
    stroke([[GX - 18, GY + 152], [GX - 20, GY + 182]], '#5a4632', 5); stroke([[GX + 18, GY + 152], [GX + 20, GY + 182]], '#5a4632', 5);
    stroke([[GX - 30, GY + 184], [GX - 12, GY + 184]], '#3a2a20', 7, 2); stroke([[GX + 12, GY + 184], [GX + 32, GY + 184]], '#3a2a20', 7, 2);
    stroke([[GX - 22, GY + 62], [GX - 50, GY + 98], [GX - 54, GY + 112]], '#e8a074', 6);
    fill(ell(GX, GY, 36, 38), '#ffd7b5', 3);
    fill(ell(GX, GY - 48, 18, 15), '#9c9c9c', 2.6);
    stroke(circlePts(GX, GY - 48, 18, 15), '#6f6f6f', 4);
    fill(() => { c.beginPath(); c.ellipse(GX, GY - 12, 38, 26, 0, Math.PI, 0); c.closePath(); }, '#a3a3a3', 2.6);
    stroke(circlePts(GX, GY, 36, 38), '#c98a63', 4);
    for (const s of [-1, 1]) { stroke(circlePts(GX + s * 14, GY + 2, 10, 10, 20, 0.04), '#3b3b3b', 3, 2); stroke([[GX + s * 14, GY + 1], [GX + s * 14, GY + 4]], '#222', 3.5, 1); }
    stroke([[GX - 4, GY + 2], [GX + 4, GY + 2]], '#3b3b3b', 3, 2);
    fill(ell(GX - 24, GY + 16, 8, 6), '#ff8fb0', 2.2); fill(ell(GX + 24, GY + 16, 8, 6), '#ff8fb0', 2.2);
    stroke([[GX - 12, GY + 20], [GX - 5, GY + 27], [GX + 5, GY + 27], [GX + 12, GY + 20]], '#c0392b', 3.5);

    // 子ども
    const CX = 330, CY = 214;
    fill(poly([[CX - 24, CY + 28], [CX + 24, CY + 28], [CX + 28, CY + 92], [CX - 28, CY + 92]]), '#3d8ee6', 3.4);
    stroke([[CX - 24, CY + 28], [CX - 28, CY + 92], [CX + 28, CY + 92], [CX + 24, CY + 28], [CX - 24, CY + 28]], '#1f5fae', 4);
    stroke([[CX - 12, CY + 92], [CX - 13, CY + 116]], '#2d3e66', 6); stroke([[CX + 12, CY + 92], [CX + 13, CY + 116]], '#2d3e66', 6);
    stroke([[CX - 24, CY + 118], [CX - 8, CY + 118]], '#d23a3a', 7, 2); stroke([[CX + 8, CY + 118], [CX + 24, CY + 118]], '#d23a3a', 7, 2);
    stroke([[CX + 22, CY + 40], [CX + 44, CY + 70]], '#e8a074', 6);
    fill(ell(CX, CY, 26, 27), '#ffd7b5', 3);
    fill(() => { c.beginPath(); c.ellipse(CX, CY - 8, 28, 21, 0, Math.PI, 0); c.closePath(); }, '#5a3a22', 2.6);
    stroke(circlePts(CX, CY, 26, 27), '#c98a63', 4);
    stroke([[CX - 9, CY + 2], [CX - 9, CY + 5]], '#222', 4, 1); stroke([[CX + 9, CY + 2], [CX + 9, CY + 5]], '#222', 4, 1);
    fill(ell(CX - 17, CY + 12, 6, 4.5), '#ff8fb0', 2.2); fill(ell(CX + 17, CY + 12, 6, 4.5), '#ff8fb0', 2.2);
    stroke([[CX - 8, CY + 13], [CX - 2, CY + 18], [CX + 4, CY + 18], [CX + 9, CY + 13]], '#c0392b', 3.5);

    // 手をつなぐ
    stroke([[GX + 22, GY + 62], [GX + 56, GY + 96], [266, 254]], '#e8a074', 6);
    stroke([[CX - 22, CY + 40], [290, 258], [272, 256]], '#e8a074', 6);
    fill(ell(270, 255, 8, 7), '#f2b48a', 2.4);

    // 花
    const flower = (x, y, col, mid) => {
      stroke([[x, y], [x + 2, y + 34], [x, 330]].slice(0, 2).concat([[x + 1, 332]]), '#3f9a35', 4);
      stroke([[x + 1, y + 30], [x + 14, y + 22]], '#3f9a35', 4, 2);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; fill(ell(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 7.5, 7.5), col, 2.4); }
      fill(ell(x, y, 6, 6), mid, 2.2);
    };
    flower(420, 270, '#ff5d8f', '#ffd21f');
    flower(462, 292, '#ff9a14', '#c0392b');
    flower(96, 284, '#e33b3b', '#ffd21f');

    // 紙の凹凸でクレヨンがかすれる
    const grain = makeCanvas(w, h), gc = grain.getContext('2d'), gi = gc.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = r(); gi.data[i * 4 + 3] = v < 0.3 ? 90 + v * 300 : 0; }
    gc.putImageData(gi, 0, 0);
    c.globalCompositeOperation = 'destination-out'; c.drawImage(grain, 0, 0); c.globalCompositeOperation = 'source-over';
    pc.drawImage(layer, 0, 0);
    return toTex(paper);
  });
}
function createDrawing() {
  const g = new THREE.Group();
  const PW = 0.21, PD = 0.15;
  const geo = new THREE.PlaneGeometry(PW, PD, 12, 8); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (PW / 2), z = p.getZ(i) / (PD / 2);
    p.setY(i, 0.0045 * x * x + 0.0018 * z * z + 0.0012 * Math.max(0, x * z));
  }
  geo.computeVertexNormals();
  const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: drawingTexture(), roughness: 0.92, side: THREE.FrontSide }));
  const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf6f4ec, roughness: 0.95, side: THREE.BackSide }));
  front.castShadow = true; front.receiveShadow = true; back.castShadow = false; back.receiveShadow = true;
  g.add(front, back);
  g.userData = { kind: 'drawing', w: PW, d: PD, h: 0.008 };
  return g;
}

// ---------------------------------------------------------------- public
export function createItem(kind) {
  if (kind === 'scarf') return createScarf();
  if (kind === 'mikan') return createMikan();
  if (kind === 'drawing') return createDrawing();
  throw new Error('unknown item kind: ' + kind);
}

// 箱 group ローカル（原点=箱の底面中心）での収まり位置。底板の厚み 0.004 の上。
export function packPose(kind) {
  const floor = 0.004;
  if (kind === 'scarf') return { pos: new THREE.Vector3(-0.085, floor, 0), rotY: Math.PI / 2, tiltX: 0 };
  if (kind === 'mikan') return { pos: new THREE.Vector3(0.085, floor, 0.004), rotY: 0, tiltX: 0 };
  if (kind === 'drawing') return { pos: new THREE.Vector3(0, 0.08, 0.004), rotY: 0.05, tiltX: -0.05 };
  return { pos: new THREE.Vector3(0, floor, 0), rotY: 0, tiltX: 0 };
}
