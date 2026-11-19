// ミシン本体と中の機構を寸法表（params.js）から組み立てる。動きは pose(θ, …) が数式で決める。
// draw call を減らすため、動かない部品は「塗り」と「金属」の 2 つの形に結合し、動く部品は剛体ごとに 1 つ。
import { P } from './params.js';
import { TAU, clamp, needleTipY, WRIST, takeUp, feedDog } from './kinematics.js';
import { coverUV, stripUV, ATLAS } from './atlas.js';

export const COL = {
  mint: 0x9edfcf, liner: 0x3f8f86, cream: 0xfff3dc, pink: 0xf6b8c8, deep: 0xee7fa0, wood: 0xe9bf8a,
  steel: 0xf4f6f8, brass: 0xffd27a, brassLight: 0xfff3cf, rose: 0xffa3ba, sun: 0xffcf5a,
};

export function buildMachine(THREE, kit, mats) {
  const { V, paint, merge, box, boxAt, rbox, cylX, cylY, cylZ, sphere, torus, lathe, polyShape, rectPts, extrude, flat, prismX, circleProfile, spurGear, bevelGear, rod: rodGeo } = kit;
  const { PLATE_Y, NEEDLE_X: NX, SHAFT_Y: SY } = P;
  const A = P.arm, H = P.head, PL = P.pillar, B = P.bed, O = P.bedOpen, W = P.wheel, F = P.frame, T = P.takeup, TH = P.thread;
  const root = new THREE.Group(); root.name = 'machine';
  const geos = [];
  const mesh = (geo, mat, parent = root, name = '') => { geos.push(geo); const m = new THREE.Mesh(geo, mat); m.name = name; parent.add(m); return m; };
  const group = (parent = root, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const xz = (pts) => pts.map(([x, z]) => [x, -z]);          // 上から見た形（x, z）→ Shape（x, −z）
  const c = (g, hex) => paint(g, hex);

  // =====================================================================
  // 1. 動かない塗りの部品
  // =====================================================================
  const sp = [];
  // --- 上の殻（腕・頭・柱をひと続きの輪郭にして Z へ押し出す。前は開いていて、カバーがふさぐ）---
  const t = A.wall;
  const outerXY = [[A.x0, H.y0], [H.x1, H.y0], [H.x1, A.y0], [PL.x0, A.y0], [PL.x0, 0], [PL.x1, 0], [A.x1, A.y1], [A.x0, A.y1]];
  const innerXY = [[A.x0 + t, H.y0 + t], [H.x1 - t, H.y0 + t], [H.x1 - t, A.y0 + t], [PL.x0 + t, A.y0 + t], [PL.x0 + t, t], [PL.x1 - t, t], [A.x1 - t, A.y1 - A.topWall], [A.x0 + t, A.y1 - A.topWall]];
  const innerR = [0.013, 0.006, 0.016, 0.018, 0, 0, 0.02, 0.02];
  sp.push(c(extrude(polyShape(outerXY, [0.02, 0.012, 0.01, 0.012, 0, 0, A.corner, A.corner], [{ pts: innerXY, r: innerR }]), A.z0, A.z1, { bevel: 0.0025 }), COL.mint));
  sp.push(c(extrude(polyShape(innerXY, innerR), A.z0, A.z0 + t), COL.liner));               // 奥の壁（内張りの色）
  // --- 台：壁の輪（前の右側は開いている）・床・天板（切り欠きと針の穴つき）---
  const bc = B.corner, zi = B.z1 - B.wall, w = B.wall;
  sp.push(c(extrude(polyShape(xz([[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [O.frontX1, B.z1], [O.frontX1, zi], [B.x1 - w, zi], [B.x1 - w, B.z0 + w], [B.x0 + w, B.z0 + w], [B.x0 + w, zi], [O.frontX0, zi], [O.frontX0, B.z1], [B.x0, B.z1]]),
    [bc, bc, bc, 0, 0, 0.018, 0.018, 0.018, 0.018, 0, 0, bc]), 0, PLATE_Y - B.top, { plane: 'xz' }), COL.mint));
  sp.push(c(extrude(polyShape(xz(rectPts(B.x0 + 0.004, B.x1 - 0.004, B.z0 + 0.004, B.z1 - 0.004)), 0.02), 0, B.floor, { plane: 'xz' }), COL.liner));
  sp.push(c(extrude(polyShape(xz([[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [PL.x0, B.z1], [PL.x0, A.z1], [PL.x1, A.z1], [PL.x1, O.z0], [O.x0, O.z0], [O.x0, B.z1], [B.x0, B.z1]]),
    [bc, bc, bc, 0.004, 0, 0, 0, 0.008, 0.004, bc],
    [{ pts: xz(rectPts(NX - P.needleHole.hx, NX + P.needleHole.hx, -P.needleHole.hz, P.needleHole.hz)), r: 0.004 }]), PLATE_Y - B.top, PLATE_Y, { bevel: 0.0015, plane: 'xz' }), COL.mint));
  // --- 手回し車の軸受けの出っぱり、軸受け台、模様カムの箱、ブラケット ---
  sp.push(c(cylX(W.bossR, A.x1 - 0.002, 0.241, SY, 0, 24), COL.mint));
  sp.push(c(rbox(0.082, 0.098, SY - 0.013, SY + 0.013, A.z0 + t, 0.011), COL.cream));                    // 上軸の軸受け
  sp.push(c(rbox(-0.078, -0.048, A.y0 + t, SY + 0.016, -0.045, 0.014, 0.004), COL.pink));                // 模様カムの箱（針振りの棒が出る）
  sp.push(c(rbox(0.156, 0.184, 0.118, 0.136, A.z0 + t, -0.002), COL.cream));                             // 縦軸の軸受け
  sp.push(c(rbox(0.092, 0.104, B.floor, 0.034, -0.035, -0.013), COL.cream));                             // 下軸の軸受け
  sp.push(c(rbox(-0.062, -0.050, B.floor, 0.033, -0.035, 0.010), COL.cream));                            // 下軸と釜軸の軸受け
  sp.push(c(rbox(T.webX0 - 0.0015, T.webX0 + 0.004, T.oy - 0.008, A.y1 - A.topWall, T.oz - 0.008, T.oz + 0.008), COL.cream)); // 天びんの支点
  sp.push(c(cylZ(0.0065, A.z0 + t, -0.006, NX, F.pivotY, 12), COL.cream));                               // 針棒の枠の支点
  sp.push(c(cylX(0.0105, P.hook.x0 - 0.004, P.hook.x1 + 0.0005, P.hookShaft.y, 0, 16), COL.cream));      // ボビンケース（回らない）
  sp.push(c(cylZ(0.006, TH.tension[2] + 0.0035, TH.tension[2] + 0.012, TH.tension[0], TH.tension[1], 14), COL.deep)); // 糸調子のつまみ
  sp.push(c(cylX(0.008, A.x0 - 0.010, A.x0 + 0.001, P.lever.pivot[1], P.lever.pivot[2], 12), COL.cream));           // 押さえレバーの軸
  const [sx, sy, sz] = TH.spool;
  sp.push(c(cylY(TH.flangeR, sy + 0.001, sy + 0.004, sx, sz, 18), COL.wood));
  sp.push(c(cylY(TH.flangeR, sy + TH.spoolH - 0.003, sy + TH.spoolH, sx, sz, 18), COL.wood));
  const bodyStatic = mesh(merge(sp), mats.paint, root, 'body');

  // =====================================================================
  // 2. 動かない金属の部品
  // =====================================================================
  const sm = [];
  const pl = P.plate;
  const slots = [{ pts: xz(rectPts(NX - pl.slotHX, NX + pl.slotHX, -pl.slotHZ, pl.slotHZ)), r: 0.002 }];
  for (const rz of P.feed.rowsZ) slots.push({ pts: xz(rectPts(NX - 0.0205, NX + 0.0205, rz - 0.003, rz + 0.003)), r: 0.0015 });
  sm.push(c(extrude(polyShape(xz(rectPts(pl.x0, pl.x1, pl.z0, pl.z1)), 0.008, slots), PLATE_Y - 0.0004, PLATE_Y + pl.t - 0.0004, { plane: 'xz', curve: 3 }), COL.steel));  // 針板
  for (const [x, z] of [[pl.x0 + 0.009, pl.z1 - 0.009], [pl.x1 - 0.009, pl.z0 + 0.009]]) sm.push(c(cylY(0.003, PLATE_Y, PLATE_Y + 0.0014, x, z, 8), COL.brass));
  sm.push(c(cylY(0.006, H.y0 - 0.008, H.y0 + 0.002, P.foot.barX, P.foot.barZ, 10), COL.steel));                    // 押さえ棒の軸受け
  sm.push(c(cylY(0.002, sy, sy + TH.spoolH + 0.008, sx, sz, 8), COL.steel));                               // 糸立て棒
  sm.push(c(cylY(0.0015, A.y1, TH.g0[1] - 0.003, TH.g0[0], TH.g0[2], 6), COL.steel));
  sm.push(c(torus(0.003, 0.0009, TH.g0[0], TH.g0[1], TH.g0[2], 'x'), COL.steel));
  for (const g of [TH.g1, TH.g2]) {
    sm.push(c(torus(0.003, 0.0009, g[0], g[1], g[2], 'y'), COL.steel));
    sm.push(c(rodGeo(0.0011, V(g[0], H.y0 + 0.002, A.z1 - 0.003), V(g[0], g[1], g[2] - 0.003), 5), COL.steel));
  }
  const [tx, ty, tz] = TH.tension;
  sm.push(c(cylZ(0.002, A.z1 - 0.002, tz + 0.012, tx, ty, 8), COL.steel));
  sm.push(c(cylZ(0.009, tz - 0.0025, tz - 0.0005, tx, ty, 18), COL.steel));
  sm.push(c(cylZ(0.009, tz + 0.0005, tz + 0.0025, tx, ty, 18), COL.steel));
  sm.push(c(cylX(0.002, T.leverX - 0.005, T.webX0 + 0.004, T.oy, T.oz, 8), COL.steel));                    // 天びんの支点ピン
  sm.push(c(cylZ(0.0025, A.z0 + t, 0.008, NX, F.pivotY, 8), COL.steel));                                   // 針棒の枠の支点ピン
  mesh(merge(sm, { uv: 'box' }), mats.metal, root, 'fixed-metal');

  // =====================================================================
  // 3. 歯車の位相（かみ合う点で、片方の歯がもう片方の谷に入るよう形に焼き込む）と回る向き
  // =====================================================================
  const Ob = V(P.vert.x, P.vert.yBot, P.vert.zBot), Ot = V(P.vert.x, SY, P.vert.zTop);
  const dAxis = Ot.clone().sub(Ob), Lv = dAxis.length(); dAxis.normalize();
  const X = V(1, 0, 0), qv = new THREE.Quaternion().setFromUnitVectors(X, dAxis), qvInv = qv.clone().invert();
  const az = (v) => Math.atan2(v.z, v.y);                                         // +Y から +Z へ測った角
  const tauB = TAU / P.bevel.N;
  const mTop = V(-1, 0, 0).sub(dAxis).normalize();                                 // 上の対：G1 は −X 側、G2 は縦軸の下側
  const mBot = dAxis.clone().add(V(-1, 0, 0)).normalize();                         // 下の対：G3 は縦軸の上側、G4 は −X 側
  const sv = Math.sign(V().crossVectors(X, mTop).dot(V().crossVectors(dAxis, mTop))) || -1;   // 縦軸の回る向き
  const sl = sv * (Math.sign(V().crossVectors(dAxis, mBot).dot(V().crossVectors(X, mBot))) || -1); // 下軸の回る向き
  const sh = -sl;                                                                  // 釜軸（平歯車は逆向き、2 倍）
  const ratio = P.spur.N5 / P.spur.N6;
  const hookAt = (phi) => sh * ratio * (phi - P.hook.phiC);
  const gearC = { c1: COL.brass, c2: COL.brassLight };

  // =====================================================================
  // 4. 回る軸たち
  // =====================================================================
  // --- 上軸（手回し車と直結）：軸・G1・針棒クランク・天びんクランク・目印つきカラー ---
  const upper = group(root, 0, SY, 0);
  const U = P.upper, CR = P.crank;
  const up = [c(cylX(U.r, U.x0, U.x1, 0, 0, 12), COL.steel)];
  up.push(bevelGear({ ...P.bevel, dir: -1, ...gearC }).rotateX(az(mTop)).translate(P.vert.x, 0, 0));
  up.push(prismX(circleProfile(CR.discR, kit.seg(28, 12)), U.r, CR.discX0, CR.discX1, (i, part) => (part === 'cap' && Math.floor(i / kit.seg(28, 12) * 4) % 2 ? COL.brassLight : COL.brass)));
  up.push(c(cylX(CR.pinR, CR.rodX - CR.rodT / 2 - 0.001, CR.discX0, CR.r, 0, 8), COL.steel));
  up.push(prismX(circleProfile(T.webR, kit.seg(24, 12)), U.r, T.webX0, T.webX1, () => COL.rose));
  up.push(c(cylX(0.003, T.couplerX - 0.004, T.webX0, T.r * Math.cos(T.phase), T.r * Math.sin(T.phase), 8), COL.steel));
  for (const x of [0.045, -0.02]) { up.push(c(cylX(0.0095, x - 0.004, x + 0.004, 0, 0, 14), COL.steel)); up.push(c(boxAt(x - 0.003, x + 0.003, 0.008, 0.017, -0.003, 0.003), COL.deep)); }
  mesh(merge(up, { uv: 'box' }), mats.metal, upper, 'upper-shaft');

  // --- 手回し車：縁（回転体）・スポーク・ハブ・つまみ ---
  const wh = [];
  const rc = W.R - W.rimT / 2, hw = W.rimW / 2, ht = W.rimT / 2, cr = 0.005, prof = [];
  for (const [cx, cy, a0] of [[hw - cr, ht - cr, 0], [-(hw - cr), ht - cr, Math.PI / 2], [-(hw - cr), -(ht - cr), Math.PI], [hw - cr, -(ht - cr), 1.5 * Math.PI]])
    for (let i = 0; i <= 3; i++) { const a = a0 + (i / 3) * (Math.PI / 2); prof.push([rc + cy + cr * Math.sin(a), W.rimX + cx + cr * Math.cos(a)]); }
  prof.reverse(); prof.push(prof[0]);   // 外側を +X へ進む向き（法線が外を向く）
  {
    // 縁はしま模様（前から見ても回っているのが分かる）。頂点色を角度で塗り分ける。
    const nSeg = 4 * Math.round(kit.seg(48, 16) / 4), per = prof.length;
    const rimG = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), nSeg).rotateZ(-Math.PI / 2);
    const cnt = rimG.attributes.position.count, col = new Float32Array(cnt * 3), ca = new THREE.Color(COL.cream), cb = new THREE.Color(COL.pink);
    for (let i = 0; i < cnt; i++) { const k = Math.floor(i / per) % nSeg, cc = Math.floor(k / (nSeg / 12)) % 2 ? cb : ca; col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    rimG.setAttribute('color', new THREE.BufferAttribute(col, 3));
    wh.push(rimG);
  }
  for (let i = 0; i < W.spokes; i++) wh.push(c(rbox(W.rimX - 0.006, W.rimX + 0.006, W.hubR - 0.003, W.R - W.rimT + 0.002, -0.0065, 0.0065, 0.003).rotateX((i / W.spokes) * TAU), COL.cream));
  wh.push(c(lathe([[0, W.rimX - W.hubLen / 2], [W.hubR, W.rimX - W.hubLen / 2], [W.hubR, W.rimX + W.hubLen / 2 - 0.004], [W.hubR * 0.7, W.rimX + W.hubLen / 2], [0, W.rimX + W.hubLen / 2]], 'x', 20), COL.cream));
  const k0 = W.rimX + 0.005, kr = W.knobR;
  wh.push(c(lathe([[0, k0], [kr * 0.62, k0], [kr * 0.62, k0 + 0.005], [kr * 0.82, k0 + 0.011], [kr, k0 + 0.019], [kr * 0.96, k0 + 0.026], [kr * 0.7, k0 + 0.031], [kr * 0.3, k0 + W.knobLen + 0.001], [0, k0 + W.knobLen + 0.001]], 'x', 18).translate(0, W.knobArm, 0), COL.deep));
  const wheel = mesh(merge(wh), mats.wheel, upper, 'wheel');

  // --- 縦軸（6.3° 傾けて、上軸とも下軸とも軸が交わるようにしてある）：G2・G3 ---
  const vertBase = group(root, Ob.x, Ob.y, Ob.z); vertBase.quaternion.copy(qv);
  const vert = group(vertBase);
  const ve = [c(cylX(P.vert.r, 0.012, Lv - 0.014, 0, 0, 10), COL.steel)];
  ve.push(bevelGear({ ...P.bevel, dir: 1, ...gearC }).rotateX(az(mBot.clone().applyQuaternion(qvInv))));
  ve.push(bevelGear({ ...P.bevel, dir: -1, ...gearC }).rotateX(az(mTop.clone().applyQuaternion(qvInv)) + tauB / 2).translate(Lv, 0, 0));
  ve.push(c(cylX(0.0085, 0.068, 0.076, 0, 0, 14), COL.steel)); ve.push(c(boxAt(0.069, 0.075, 0.007, 0.016, -0.003, 0.003), COL.deep));
  mesh(merge(ve, { uv: 'box' }), mats.metal, vert, 'vertical-shaft');

  // --- 下軸：G4・G5・送りの偏心カム ---
  const lower = group(root, 0, P.lower.y, P.lower.z);
  const lo = [c(cylX(P.lower.r, P.lower.x0, P.lower.x1, 0, 0, 10), COL.steel)];
  lo.push(bevelGear({ ...P.bevel, dir: -1, ...gearC }).rotateX(az(mBot) + tauB / 2).translate(P.vert.x, 0, 0));
  const S = P.spur;
  lo.push(spurGear({ N: S.N5, m: S.m, x0: S.x - S.w5 / 2, x1: S.x + S.w5 / 2, bore: P.lower.r, ...gearC }).rotateX(Math.PI / 2));
  lo.push(prismX(circleProfile(P.feed.eccR, kit.seg(24, 12), P.feed.lift, 0), P.lower.r, P.feed.eccX0, P.feed.eccX1, (i, part) => (part === 'cap' ? COL.rose : COL.deep)));
  lo.push(c(cylX(0.0085, 0.071, 0.079, 0, 0, 14), COL.steel)); lo.push(c(boxAt(0.072, 0.078, 0.007, 0.015, -0.003, 0.003), COL.deep));
  mesh(merge(lo, { uv: 'box' }), mats.metal, lower, 'lower-shaft');

  // --- 釜軸：G6・釜（剣先は角 0 = 真上。回る向きの前に糸の輪が入るすき間がある）---
  const hookG = group(root, 0, P.hookShaft.y, P.hookShaft.z);
  const HS = P.hookShaft, HK = P.hook;
  const ho = [c(cylX(HS.r, HS.x0, HS.x1, 0, 0, 10), COL.steel)];
  ho.push(spurGear({ N: S.N6, m: S.m, x0: S.x - S.w6 / 2, x1: S.x + S.w6 / 2, bore: HS.r, ...gearC }).rotateX(-Math.PI / 2 + TAU / S.N6 / 2 - hookAt(0)));
  const hp = [], hn = 44, lead = sh >= 0 ? 1 : -1;
  for (let i = 0; i < hn; i++) {
    const a = (i / hn) * TAU, g = a > 0.10 && a < 1.25;                         // すき間
    const r = i === 0 ? HK.R + 0.0015 : g ? 0.0125 : HK.R;
    hp.push([r * Math.cos(a * lead), r * Math.sin(a * lead)]);
  }
  if (lead < 0) hp.reverse();
  ho.push(prismX(hp, 0.0108, HK.x0, HK.x1, (i) => { const j = lead < 0 ? hn - 1 - i : i; return j >= hn - 4 || j === 0 ? COL.deep : COL.steel; }));
  mesh(merge(ho, { uv: 'box' }), mats.metal, hookG, 'hook');

  // =====================================================================
  // 5. リンク：連桿・針棒の枠・針棒・針振りの棒・天びん
  // =====================================================================
  const rodG = group(root);
  mesh(merge([c(boxAt(-0.0025, 0.0025, -CR.L + 0.004, -0.004, -0.003, 0.003), COL.rose), c(cylX(0.0065, -0.003, 0.003, 0, 0, 12), COL.rose), c(cylX(0.0055, -0.003, 0.003, -CR.L, 0, 12), COL.rose)], { uv: 'box' }), mats.metal, rodG, 'conrod');

  const frame = group(root, NX, F.pivotY, 0);
  const fy = (y) => y - F.pivotY, fx = F.spineX;
  mesh(merge([
    c(cylZ(0.006, -0.008, 0.006, 0, 0, 12), COL.steel),
    c(boxAt(fx - 0.003, 0.004, -0.004, 0.004, -0.004, 0.004), COL.steel),
    c(boxAt(fx - 0.003, fx + 0.003, fy(F.lugBotY) - 0.004, 0, -0.004, 0.004), COL.steel),
    c(boxAt(fx, 0.0055, fy(F.lugTopY) - 0.005, fy(F.lugTopY) + 0.005, -0.006, 0.006), COL.brass),
    c(boxAt(fx, 0.0055, fy(F.lugBotY) - 0.004, fy(F.lugBotY) + 0.004, -0.006, 0.006), COL.brass),
    c(boxAt(fx - 0.003, fx + 0.003, fy(F.rodY) - 0.003, fy(F.rodY) + 0.003, F.rodZ - 0.003, -0.004), COL.steel),
  ], { uv: 'box' }), mats.metal, frame, 'needle-frame');

  const bar = group(frame);
  const ND = P.needle;
  mesh(merge([
    c(cylY(0.00005, 0, 0.004, 0, 0, 6, ND.r), COL.steel),
    c(cylY(ND.r, 0.004, ND.len, 0, 0, 6), COL.steel),
    c(rbox(-ND.clampW / 2, ND.clampW / 2, ND.len, ND.len + ND.clampH, -ND.clampW / 2, ND.clampW / 2, 0.003), COL.deep),   // 針留め（上下するのが見える色）
    c(cylX(0.002, ND.clampW / 2 - 0.001, ND.clampW / 2 + 0.004, ND.len + ND.clampH / 2, 0, 6), COL.brass),
    c(cylY(ND.barR, ND.len + ND.clampH, ND.barTop, 0, 0, 10), COL.steel),
    c(cylX(0.003, 0, CR.rodX - NX + 0.003, WRIST, 0, 8), COL.steel),
  ], { uv: 'box' }), mats.metal, bar, 'needle-bar');

  const zig = group(root);
  mesh(merge([c(cylX(0.002, NX + fx, -0.058, F.rodY, F.rodZ, 6), COL.steel), c(cylX(0.004, -0.088, -0.082, F.rodY, F.rodZ, 8), COL.deep)], { uv: 'box' }), mats.metal, zig, 'zigzag-rod');

  const coupler = group(root, T.couplerX, SY, 0);
  mesh(merge([c(boxAt(-0.0025, 0.0025, 0.003, T.c - 0.003, -0.0025, 0.0025), COL.brass), c(cylX(0.0055, -0.0025, 0.0025, 0, 0, 10), COL.brass), c(cylX(0.0045, -0.0025, 0.0025, T.c, 0, 10), COL.brass)], { uv: 'box' }), mats.metal, coupler, 'takeup-link');
  const takeLever = group(root, T.leverX, T.oy, T.oz);
  mesh(merge([
    c(boxAt(-0.0025, 0.0025, -0.003, 0.003, -T.rho, T.tip - 0.003), COL.steel),
    c(cylX(0.006, -0.003, 0.003, 0, 0, 10), COL.steel),
    c(cylX(0.002, -0.003, T.couplerX - T.leverX + 0.003, 0, -T.rho, 6), COL.steel),
    c(torus(0.0035, 0.0012, 0, 0, T.tip, 'x', 10), COL.steel),
  ], { uv: 'box' }), mats.metal, takeLever, 'takeup-lever');

  // =====================================================================
  // 6. 送り歯（歯 3 列 × 5、台、送り棒、偏心カムに乗る枠）— ひとつの剛体が楕円に動く
  // =====================================================================
  const feed = group(root);
  const FD = P.feed, topY = PLATE_Y + FD.rest, fb = flat();
  for (const rz of FD.rowsZ) for (const cx of FD.colsX) {
    const x0 = NX + cx - FD.toothW / 2, x1 = NX + cx + FD.toothW / 2, z0 = rz - FD.toothD / 2, z1 = rz + FD.toothD / 2, yb = topY - FD.toothH;
    // のこぎり歯：とがった稜は奥（−Z）側。布を奥へ引っかけて送る形。
    fb.quad(V(x0, yb, z1), V(x1, yb, z1), V(x1, topY, z0), V(x0, topY, z0), V(0, 1, 1), COL.steel);
    fb.quad(V(x0, yb, z0), V(x0, topY, z0), V(x1, topY, z0), V(x1, yb, z0), V(0, 0, -1), COL.steel);
    fb.tri(V(x0, yb, z0), V(x0, yb, z1), V(x0, topY, z0), V(-1, 0, 0), COL.steel);
    fb.tri(V(x1, yb, z0), V(x1, yb, z1), V(x1, topY, z0), V(1, 0, 0), COL.steel);
  }
  const yokeY = P.lower.y, yokeZ = P.lower.z, win = FD.eccR, wz = FD.eccR + 0.010;
  mesh(merge([
    fb.done(),
    c(boxAt(NX - 0.021, NX + 0.021, topY - FD.toothH - 0.002, topY - FD.toothH, -0.016, 0.022), COL.steel),
    c(boxAt(NX - 0.025, NX - 0.020, topY - 0.012, topY - FD.toothH, -0.053, -0.010), COL.steel),
    c(boxAt(NX - 0.025, FD.eccX1 - 0.001, 0.030, 0.035, -0.053, -0.047), COL.steel),
    c(extrude(polyShape(rectPts(-(yokeZ + wz + 0.004), -(yokeZ - wz - 0.009), yokeY - win - 0.003, yokeY + win + 0.003), 0.003,
      [{ pts: rectPts(-(yokeZ + wz), -(yokeZ - wz), yokeY - win, yokeY + win), r: 0.002 }]), FD.eccX0 + 0.001, FD.eccX1 - 0.001, { plane: 'zy', curve: 3 }), COL.brass),
  ], { uv: 'box' }), mats.metal, feed, 'feed-dog');

  // =====================================================================
  // 7. 押さえ金とレバー
  // =====================================================================
  const FT = P.foot, footY = PLATE_Y + P.cloth.lift + FT.gap;
  const foot = group(root);
  mesh(merge([
    c(extrude(polyShape(xz(rectPts(NX - FT.hx, NX + FT.hx, FT.z0, FT.z1)), 0.004, [{ pts: xz(rectPts(NX - 0.019, NX + 0.019, -0.003, 0.003)), r: 0.002 }]), footY, footY + FT.t, { plane: 'xz', curve: 3 }), COL.steel),
    c(rbox(FT.barX - 0.006, NX - FT.hx + 0.004, footY + 0.0005, 0.074, FT.barZ - 0.006, FT.barZ + 0.006, 0.002), COL.steel),
    c(cylY(FT.barR, 0.068, 0.200, FT.barX, FT.barZ, 8), COL.steel),
  ], { uv: 'box' }), mats.metal, foot, 'presser-foot');

  const LV = P.lever;
  const lever = group(root, ...LV.pivot);
  mesh(merge([c(cylX(0.007, -0.006, 0.006, 0, 0, 12), COL.cream), c(rbox(-0.003, 0.003, -0.004, 0.004, 0, LV.len - 0.006, 0.002), COL.cream), c(sphere(LV.knobR, 0, 0, LV.len), COL.sun)]), mats.lever, lever, 'lever');

  // =====================================================================
  // 8. カバー（腕＋柱の前板、台の前板＋天板のふた）と模様ダイヤル、糸巻き
  // =====================================================================
  const cov = 0.004;   // カバーが開口のふちに重なる幅
  const coverXY = [[A.x0 + t - cov, H.y0 + t - cov], [H.x1 - t + cov, H.y0 + t - cov], [H.x1 - t + cov, A.y0 + t - cov], [PL.x0 + t - cov, A.y0 + t - cov],
    [PL.x0 + t - cov, PLATE_Y + 0.002], [PL.x1 - t + cov, PLATE_Y + 0.002], [A.x1 - t + cov, A.y1 - A.topWall + cov], [A.x0 + t - cov, A.y1 - A.topWall + cov]];
  const slotX0 = T.leverX - 0.004, slotX1 = T.leverX + 0.004;
  const cg = extrude(polyShape(coverXY, [0.015, 0.008, 0.012, 0.014, 0.004, 0.004, 0.024, 0.024], [{ pts: rectPts(slotX0, slotX1, 0.244, 0.2925), r: 0.003 }]), A.z1 + 0.0003, A.z1 + 0.005, { bevel: 0.0012 });
  const uvFront = (g, fn) => {   // 前を向いた面だけ飾りを貼り、ほかは塗りの色の画素へ
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const q = n.getZ(i) > 0.7 ? fn(p.getX(i), p.getY(i)) : ATLAS.flatUV; uv.setXY(i, q[0], q[1]); }
    return g;
  };
  const coverArmC = V(-0.005, 0.20, A.z1 + 0.0025), coverBedC = V(0.095, 0.03, 0.10);
  const coverArm = group(root, coverArmC.x, coverArmC.y, coverArmC.z);
  const cga = merge([uvFront(cg, coverUV)], { uv: 'keep', weld: true }).translate(-coverArmC.x, -coverArmC.y, -coverArmC.z); cga.deleteAttribute('color');
  mesh(cga, mats.cover, coverArm, 'cover-arm');
  const coverBed = group(root, coverBedC.x, coverBedC.y, coverBedC.z);
  const lip = uvFront(extrude(polyShape(xz(rectPts(O.x0 + 0.001, O.x1 - 0.001, O.z0 + 0.001, B.z1)), [0.007, 0.001, 0.003, 0.003]), PLATE_Y - B.top + 0.0002, PLATE_Y, { bevel: 0.0015, plane: 'xz' }), () => ATLAS.flatUV);
  const front = uvFront(rbox(O.frontX0 + 0.001, O.frontX1 - 0.001, 0.001, PLATE_Y - B.top - 0.0002, zi, B.z1, 0.002), stripUV);
  const cgb = merge([lip, front], { uv: 'keep', weld: true }).translate(-coverBedC.x, -coverBedC.y, -coverBedC.z); cgb.deleteAttribute('color');
  mesh(cgb, mats.cover, coverBed, 'cover-bed');

  const D = P.dial;
  const dial = group(root, ...D.c);
  const face = new THREE.CircleGeometry(D.R, kit.seg(36, 16)).translate(0, 0, D.t / 2 + 0.0005);
  { const uv = face.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5); }
  const rim = cylZ(D.R, -D.t / 2, D.t / 2, 0, 0, 36);
  { const uv = rim.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.004, 0.99); }
  const dg = merge([face, rim], { uv: 'keep', weld: true }); dg.deleteAttribute('color');
  mesh(dg, mats.dial, dial, 'pattern-dial');

  const spoolGeo = cylY(TH.spoolR, sy + 0.004, sy + TH.spoolH - 0.003, sx, sz, 18); spoolGeo.deleteAttribute('uv');
  mesh(spoolGeo, mats.thread, root, 'spool-thread');

  // =====================================================================
  // 9. 当たり板（見えない。指より大きい）
  // =====================================================================
  const proxy = (part, geo, parent, x, y, z) => { const m = mesh(geo, mats.hidden, parent, 'hit-' + part); m.position.set(x, y, z); m.userData.part = part; return m; };
  const hit = {
    wheel: proxy('wheel', new THREE.CylinderGeometry(0.10, 0.10, 0.09, 16).rotateZ(Math.PI / 2), root, W.c[0] + 0.01, W.c[1], W.c[2]),
    lever: proxy('lever', box(0.075, 0.13, 0.10), root, LV.pivot[0] - 0.002, LV.pivot[1], LV.pivot[2] + 0.045),
    coverArm: proxy('cover', box(0.44, 0.17, 0.05), root, -0.005, 0.235, 0.085),
    coverBed: proxy('cover', box(0.30, 0.07, 0.06), root, 0.095, 0.035, 0.15),
  };

  // =====================================================================
  // 10. 姿勢：θ（手回し車の角）と、模様カムが決める針の x・送り量から、全部の部品を置く
  // =====================================================================
  const out = { eye: V(), clamp: V(), tip: V(), sv, sl, sh };
  const tu = {}, fd = {}, pin = V(), wrist = V(), dir = V(), DOWN = V(0, -1, 0);
  const swingLen = F.pivotY - PLATE_Y;
  function pose(theta, xn, feedS) {
    upper.rotation.x = theta;
    vert.rotation.x = sv * theta;
    lower.rotation.x = sl * theta;
    hookG.rotation.x = hookAt(theta);
    // 針棒：スライダークランク ＋ 枠の振れ（針先が針板の高さで x = xn になる角）
    const tipY = needleTipY(theta);
    const beta = Math.asin(clamp(xn / swingLen, -0.2, 0.2)), cb = Math.cos(beta), sb = Math.sin(beta);
    frame.rotation.z = beta;
    bar.position.y = tipY - F.pivotY;
    const lx = CR.rodX - NX, ly = tipY + WRIST - F.pivotY;
    wrist.set(NX + lx * cb - ly * sb, F.pivotY + lx * sb + ly * cb, 0);
    pin.set(CR.rodX, SY + CR.r * Math.cos(theta), CR.r * Math.sin(theta));
    dir.subVectors(wrist, pin);
    const dist = dir.length() || CR.L;
    rodG.position.copy(pin);
    rodG.quaternion.setFromUnitVectors(DOWN, dir.multiplyScalar(1 / dist));
    rodG.scale.y = dist / CR.L;
    zig.position.x = (F.pivotY - F.rodY) * sb;
    // 天びん
    takeUp(theta, tu);
    coupler.position.set(T.couplerX, tu.py, tu.pz);
    coupler.rotation.x = tu.coupler;
    coupler.scale.y = tu.couplerLen / T.c;
    takeLever.rotation.x = tu.lever;
    // 送り歯
    feedDog(theta, feedS, fd);
    feed.position.set(0, fd.y - topY, fd.z);
    // 糸が通る点
    const ey = tipY + ND.eye - F.pivotY, cy = tipY + ND.len + ND.clampH - F.pivotY;
    out.eye.set(NX - ey * sb, F.pivotY + ey * cb, 0.0012);
    out.clamp.set(NX - cy * sb + 0.002, F.pivotY + cy * cb, 0.006);
    out.tip.set(T.leverX, tu.ty, tu.tz);
    out.tipY = tipY;
    return out;
  }

  return {
    root, geos, pose, hit, wheel, lever, foot, coverArm, coverBed, coverArmC, coverBedC, dial, bodyStatic,
    coverOutline: coverXY,
    setFoot(lift, leverAngle) { foot.position.y = lift; lever.rotation.x = leverAngle; },
  };
}
