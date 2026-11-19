// Builds every mesh of the hero from PARAMS (no logic here; hero.js moves the parts).
// Static things are merged per material; repeated moving things are InstancedMesh.

import { PARAMS as P } from './params.js';
import { createKit } from './geo.js';

const TAU = Math.PI * 2;

// ---- derived layout shared by parts.js and hero.js ---------------------------------------
export function layout() {
  const S = P.STAIR;
  const rise = P.FLOOR_H / S.N;
  const delta = S.BETA / S.N;               // angle of one tread
  const rMid = (S.R_IN + S.R_OUT) / 2;      // cargo path radius
  const tread = delta * rMid;               // tread depth along the path
  const floorY = (i) => P.FLOOR_Y0 + i * P.FLOOR_H;
  const foot = [], top = [], dir = S.DIR.slice();
  let f = S.FOOT0;
  for (let i = 0; i < P.FLOORS; i++) { foot.push(f); f += dir[i] * S.BETA; top.push(f); }
  // landing j (j = -1 is the start pad on the ground): starts at edge[j], extends platDir[j] * PLAT_W
  const platEdge = (j) => (j < 0 ? foot[0] : top[j]);
  const platDir = (j) => (j < 0 ? -dir[0] : dir[j]);
  const platY = (j) => floorY(j + 1);
  const slotAngle = (j, frac) => platEdge(j) + platDir(j) * frac * S.PLAT_W;
  const hingeStep = P.BRIDGE.N + 1;                         // the first fixed tread
  const hingeAngle = (i) => foot[i] + dir[i] * P.BRIDGE.N * delta;
  const hingeY = hingeStep * rise - S.TREAD_T;              // above the ring floor
  const T = P.TOWER;
  const roofY = floorY(P.FLOORS);
  const doorAngle = top[P.FLOORS - 1] + dir[P.FLOORS - 1] * S.PLAT_W * S.SLOT_FAR; // tower door faces the far place of the last landing
  const rackPitch = TAU * T.SECTOR_R / T.SECTOR_Z;
  const stroke = T.SECTOR_R * T.OPEN;                        // pedestal travel that opens the dome
  const pinionR = P.R_OUT * P.GEAR.Z_PINION / P.GEAR.Z_RING; // pitch radius
  const trackR = (P.DETENT.TRACK_R0 + P.DETENT.TRACK_R1) / 2;
  const pawlPivotAngle = P.DETENT.ANGLE + P.DETENT.ARM / trackR;
  return { rise, delta, rMid, tread, floorY, foot, top, dir, platEdge, platDir, platY, slotAngle,
    hingeStep, hingeAngle, hingeY, roofY, doorAngle, rackPitch, stroke, pinionR, trackR, pawlPivotAngle };
}

export function buildParts(THREE, opts, low) {
  const K = createKit(THREE);
  const L = layout();
  const { Builder, col, polar, xf, box, cyl, sphere, cone, torus, lathe, sector, wallArc, waveRing, plate, leafOutline } = K;
  const S = P.STAIR, T = P.TOWER, SH = P.SHELL, G = P.GEAR, D = P.DETENT;
  const M4 = () => new THREE.Matrix4();
  const owned = [];                       // geometries / materials / textures created here
  const own = (x) => { owned.push(x); return x; };
  const tex = (n) => opts.textures.get(n);
  const q = low ? 0.5 : 1;                // detail factor
  const segs = (n, min) => Math.max(min || 6, Math.round(n * q));

  // ---- palette (sRGB hex -> linear vertex colours)
  const C = {
    gold: col(0xffc83d), goldDark: col(0xd9982a), pink: col(0xff7fb0), rose: col(0xff5c9a), lav: col(0xb79cff),
    mint: col(0x8fe3c0), cream: col(0xfff3dc), white: col(0xffffff), brown: col(0x8a5a33), dark: col(0x4a2e22),
    red: col(0xe8504a), sky: col(0x7cc7ff), fur: col(0xc98a4b), muzzle: col(0xf3dab4), ink: col(0x2e1e16),
    stoneWarm: col(0xf2e6d2), shade: col(0xbfb0a0), doorway: col(0x3a2430), yellow: col(0xffe36e),
  };
  const RAINBOW = [0xff8fb1, 0xffb37a, 0xffe07a, 0xa6e68a, 0x86d6f2, 0xa9a3ff, 0xe3a1ff, 0xff8fb1].map(col);
  const FLOOR_COL = [C.pink, C.lav, C.mint];

  // ---- materials
  // Lambert everywhere: matte toy look, and far cheaper per pixel than Standard on a tablet
  const stoneMat = own(new THREE.MeshLambertMaterial({ map: tex('stone_wall_1024'), vertexColors: true }));
  const woodBase = own(new THREE.MeshLambertMaterial({ map: tex('wood_floor_1024'), vertexColors: true }));
  const roofMat = own(new THREE.MeshLambertMaterial({ map: tex('roof_tiles_1024') }));
  roofMat.color.setRGB(3.0, 1.3, 2.3);    // slate photo tinted to orchid (multiplier > 1 on purpose: the photo is dark)
  const paintMat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const paint2Mat = own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const petalInMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.BackSide }));
  const lampMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const sparkMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const proxyMat = own(new THREE.MeshBasicMaterial({ visible: false }));

  const root = new THREE.Group(); root.name = 'hero';
  const mesh = (geo, mat, name) => { const m = new THREE.Mesh(own(geo), mat); m.name = name; return m; };
  const inst = (geo, mat, n, name) => {
    const m = new THREE.InstancedMesh(own(geo), mat, n); m.name = name; m.frustumCulled = false; // instances move every frame
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  };
  // a bar (box) from point A to point B
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion();
  function bar(b, ax, ay, az, bx, by, bz, th, c) {
    _a.set(ax, ay, az); _b.set(bx, by, bz);
    const len = Math.max(_a.distanceTo(_b), 1e-4);
    _q.setFromUnitVectors(_z, _b.clone().sub(_a).divideScalar(len));
    const m = M4().compose(_a.clone().add(_b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
    box(b, th, th, len, m, c);
  }
  // arched frame (two posts + half ring) in a local frame whose XY plane is the door plane
  function archFrame(b, m, halfW, postH, y0, z, c) {
    const r = halfW + 0.03;
    box(b, 0.055, postH, 0.06, m.clone().multiply(xf(-r, y0 + postH / 2, z)), c);
    box(b, 0.055, postH, 0.06, m.clone().multiply(xf(r, y0 + postH / 2, z)), c);
    torus(b, r, 0.03, 6, segs(12, 8), m.clone().multiply(xf(0, y0 + postH, z)), c, Math.PI);
    b.add(new THREE.OctahedronGeometry(0.055, 0), m.clone().multiply(xf(0, y0 + postH + r + 0.05, z)), C.gold);
  }

  // =====================================================================================
  // 1. fixed structure: ground, centre column, back wall with windows, roof deck, turrets, tower stem
  // =====================================================================================
  const stone = new Builder(), roofB = new Builder(), fixedPaint = new Builder();
  const y3 = L.roofY;
  {
    const R = P.RING;
    // ground: floor of the stairwell + a thin base under ring 0
    sector(stone, { r0: 0, r1: R.R_IN - 0.01, y0: 0, y1: P.FLOOR_Y0, a0: 0, a1: TAU, seg: segs(32, 16), colTop: C.stoneWarm, col: C.shade, tile: 1.6, bottom: false, inner: false });
    sector(stone, { r0: R.R_IN - 0.01, r1: SH.R_IN, y0: 0, y1: 0.02, a0: 0, a1: TAU, seg: segs(32, 16), col: C.shade, tile: 1.6, bottom: false, inner: false });
    // centre column with a collar under every floor
    const prof = [[P.R_CORE, P.FLOOR_Y0]];
    for (let i = 1; i <= P.FLOORS; i++) {
      const y = L.floorY(i);
      prof.push([P.R_CORE, y - 0.2], [P.R_CORE + 0.06, y - 0.15], [P.R_CORE + 0.06, y - 0.03], [P.R_CORE, y]);
    }
    lathe(stone, prof, segs(24, 12), null, C.cream, 3);
    // back wall, one band per floor so each room has its own wall colour and windows
    const hw = (SH.WIN_W / 2) / SH.R_IN;
    for (let i = 0; i < P.FLOORS; i++) {
      const y0 = i === 0 ? 0 : L.floorY(i) - R.T, y1 = L.floorY(i + 1) - R.T;
      wallArc(stone, {
        rIn: SH.R_IN, rOut: SH.R_IN + SH.T, y0, y1, a0: SH.CUT, a1: TAU - SH.CUT, seg: segs(40, 20), sub: low ? 4 : 6,
        windows: SH.WINDOWS.map((d) => ({ a: d * Math.PI / 180, hw, sill: L.floorY(i) + SH.WIN_SILL, h: SH.WIN_H, arch: SH.WIN_ARCH })),
        colIn: col(SH.TINT[i]), colOut: K.WHITE, tile: 2.0, top: i === P.FLOORS - 1,
      });
    }
    // roof deck (ceiling of the top floor), parapet with merlons at the back, low curb at the front
    const rW = SH.R_IN + SH.T;
    sector(stone, { r0: R.R_IN, r1: rW, y0: y3 - R.T, y1: y3, a0: 0, a1: TAU, seg: segs(48, 24), col: C.cream, tile: 2.0, top: false });
    sector(stone, { r0: SH.R_IN, r1: rW, y0: y3, y1: y3 + SH.PARAPET_H, a0: SH.CUT, a1: TAU - SH.CUT, seg: segs(36, 18), tile: 2.0, bottom: false });
    sector(stone, { r0: rW - 0.08, r1: rW, y0: y3, y1: y3 + 0.07, a0: -SH.CUT, a1: SH.CUT, seg: segs(20, 10), col: C.cream, tile: 2.0, bottom: false, caps: false });
    for (let k = 0; k < SH.MERLONS; k++) {
      const a = SH.CUT + (TAU - 2 * SH.CUT) * (k + 0.5) / SH.MERLONS;
      box(stone, 0.3, SH.MERLON_H, SH.T, polar(SH.R_IN + SH.T / 2, a, y3 + SH.PARAPET_H + SH.MERLON_H / 2), null, 0.2);
    }
    // two slim turrets close the cut-away; they also carry the pinions (left) and the pawls (right)
    for (const sg of [-1, 1]) {
      const m = polar(SH.TURRET_RC, sg * SH.TURRET_ANGLE, 0);
      const tr = SH.TURRET_R;
      lathe(stone, [[tr, 0], [tr, SH.TURRET_TOP - 0.3], [tr + 0.07, SH.TURRET_TOP - 0.2], [tr + 0.07, SH.TURRET_TOP]], segs(14, 8), m, K.WHITE, 2.5);
      cone(roofB, tr + 0.16, SH.TURRET_ROOF, segs(14, 8), m.clone().multiply(xf(0, SH.TURRET_TOP + SH.TURRET_ROOF / 2, 0)), null, 2);
      sphere(fixedPaint, 0.06, m.clone().multiply(xf(0, SH.TURRET_TOP + SH.TURRET_ROOF + 0.03, 0)), C.gold, 8, 6);
    }
    // tower stem flaring into the calyx cup that holds the petal hinges
    lathe(stone, [[T.STEM_R, y3], [T.STEM_R, y3 + 0.45], [T.STEM_R + 0.08, y3 + 0.63], [T.CUP_R - 0.12, T.HINGE_Y - 0.35], [T.CUP_R, T.HINGE_Y - 0.22],
      [T.CUP_R, T.HINGE_Y - 0.08], [T.CUP_R - 0.07, T.HINGE_Y - 0.08], [T.CUP_R - 0.07, T.HINGE_Y - 0.3], [T.PED_R + 0.1, T.HINGE_Y - 0.34]], segs(28, 14), null, C.cream, 3);
    torus(fixedPaint, T.CUP_R - 0.035, 0.04, 6, segs(32, 16), xf(0, T.HINGE_Y - 0.08, 0, 0, Math.PI / 2), C.gold);
    for (let j = 0; j < T.PETALS; j++) {
      const m = polar(T.HINGE_R, TAU * j / T.PETALS, T.HINGE_Y);
      for (const sx of [-0.1, 0.1]) box(fixedPaint, 0.03, 0.4, 0.07, m.clone().multiply(xf(sx, -0.17, 0)), C.goldDark);
    }
    // tower door: dark doorway + frame on the stem, facing the last landing
    const md = polar(T.STEM_R + 0.005, L.doorAngle, y3);
    const hwD = T.DOOR_HALF_W, ph = P.GATE.POST_H;
    const arch = [[-hwD, 0], [hwD, 0]];
    for (let j = 0; j <= 8; j++) { const f = Math.PI * j / 8; arch.push([hwD * Math.cos(f), ph + hwD * Math.sin(f)]); }
    plate(fixedPaint, arch, 0.02, md.clone().multiply(xf(0, 0, 0.012)), C.doorway);
    archFrame(fixedPaint, md, hwD, ph, 0, 0.03, C.gold);
    // start pad on the ground floor (a little carpet where the chest and the teddy wait)
    sector(fixedPaint, { r0: S.R_IN + 0.03, r1: S.R_OUT - 0.03, y0: P.FLOOR_Y0, y1: P.FLOOR_Y0 + 0.012, a0: L.platEdge(-1), a1: L.platEdge(-1) + L.platDir(-1) * S.PLAT_W,
      seg: 6, col: C.rose, bottom: false });
    // brackets from the turrets to the pinion axles (left) and the pawl pivots (right)
    for (let i = 0; i < P.FLOORS; i++) {
      const y = L.floorY(i);
      const pr = P.R_OUT + L.pinionR + 0.01;
      const px = pr * Math.sin(G.ANGLE), pz = pr * Math.cos(G.ANGLE);
      const tx = SH.TURRET_RC * Math.sin(-SH.TURRET_ANGLE), tz = SH.TURRET_RC * Math.cos(-SH.TURRET_ANGLE);
      bar(fixedPaint, px, y - 0.125, pz, tx, y - 0.125, tz, 0.045, C.goldDark); // stays above the ground on floor 0
      cyl(fixedPaint, 0.03, 0.03, 0.2, 6, xf(px, y - 0.05, pz), C.goldDark);
      const vr = L.trackR, va = L.pawlPivotAngle;
      const vx = vr * Math.sin(va), vz = vr * Math.cos(va);
      const ux = SH.TURRET_RC * Math.sin(SH.TURRET_ANGLE), uz = SH.TURRET_RC * Math.cos(SH.TURRET_ANGLE);
      bar(fixedPaint, vx, y + D.PIVOT_H, vz, ux, y + D.PIVOT_H + 0.05, uz, 0.045, C.goldDark);
    }
  }
  // roof terrace: two-colour mosaic (vertex colours only). Drawn first: seen from the tower view it covers the floors below
  const deckB = new Builder();
  {
    const bands = [P.RING.R_IN, P.RING.R_IN + 0.38, SH.R_IN - 0.34, SH.R_IN + SH.T], nt = low ? 12 : 24;
    const mc = [col(0xfff1dc), col(0xffd3e0), col(0xe9defc)];
    for (let b = 0; b < 3; b++) for (let k = 0; k < nt; k++) {
      sector(deckB, { r0: bands[b], r1: bands[b + 1], y0: y3 - 0.01, y1: y3, a0: TAU * k / nt, a1: TAU * (k + 1) / nt, seg: 2,
        col: b === 1 ? mc[(k % 2) * 2] : mc[(k + b) % 2], bottom: false, inner: false, outer: false, caps: false });
    }
  }
  const deck = mesh(deckB.build(), paintMat, 'deck'); deck.renderOrder = -1;
  root.add(deck);
  const fixedStone = mesh(stone.build(), stoneMat, 'fixed-stone');
  fixedStone.renderOrder = 2; // drawn after the rings and the small parts in front of it (less overdraw)
  root.add(fixedStone, mesh(roofB.build(), roofMat, 'fixed-roof'), mesh(fixedPaint.build(), paintMat, 'fixed-paint'));

  // =====================================================================================
  // 2. rings: slab + flight of stairs + landing + gear rim + cam track + gate frame + furniture
  // =====================================================================================
  const place = (r, a, y) => polar(r, a, y || 0);
  const FURNITURE = [
    // floor 0: hall — round table with a cake, two stools, a barrel
    (b) => {
      let m = place(2.1, 134 * Math.PI / 180);
      cyl(b, 0.3, 0.3, 0.04, 16, m.clone().multiply(xf(0, 0.36, 0)), C.cream);
      cyl(b, 0.05, 0.09, 0.34, 8, m.clone().multiply(xf(0, 0.17, 0)), C.brown);
      cyl(b, 0.12, 0.12, 0.08, 12, m.clone().multiply(xf(0, 0.42, 0)), C.white);
      cyl(b, 0.125, 0.125, 0.025, 12, m.clone().multiply(xf(0, 0.455, 0)), C.pink);
      sphere(b, 0.03, m.clone().multiply(xf(0, 0.49, 0)), C.red, 8, 6);
      for (const sa of [-0.5, 0.5]) { const s = m.clone().multiply(xf(sa, 0, 0.12)); cyl(b, 0.11, 0.11, 0.05, 10, s.clone().multiply(xf(0, 0.2, 0)), FLOOR_COL[0]); cyl(b, 0.04, 0.06, 0.18, 6, s.clone().multiply(xf(0, 0.09, 0)), C.brown); }
      m = place(2.12, 96 * Math.PI / 180);
      cyl(b, 0.17, 0.17, 0.4, 12, m.clone().multiply(xf(0, 0.2, 0)), C.brown);
      for (const yy of [0.08, 0.32]) cyl(b, 0.178, 0.178, 0.035, 12, m.clone().multiply(xf(0, yy, 0)), C.goldDark);
      sector(b, { r0: 1.85, r1: 2.36, y0: 0, y1: 0.01, a0: 82 * Math.PI / 180, a1: 150 * Math.PI / 180, seg: 8, col: C.sky, bottom: false });
    },
    // floor 1: bedroom — bed with pillow and blanket, toy blocks, rug
    (b) => {
      let m = place(2.1, 212 * Math.PI / 180);
      box(b, 0.95, 0.16, 0.44, m.clone().multiply(xf(0, 0.14, 0)), C.brown);
      box(b, 0.9, 0.1, 0.4, m.clone().multiply(xf(0, 0.27, 0)), C.white);
      box(b, 0.58, 0.07, 0.42, m.clone().multiply(xf(0.16, 0.315, 0)), C.pink);
      box(b, 0.2, 0.08, 0.3, m.clone().multiply(xf(-0.32, 0.345, 0)), C.cream);
      box(b, 0.06, 0.5, 0.46, m.clone().multiply(xf(-0.48, 0.3, 0)), C.rose);
      for (const [sx, sz] of [[-0.42, -0.17], [0.42, -0.17], [-0.42, 0.17], [0.42, 0.17]]) box(b, 0.06, 0.08, 0.06, m.clone().multiply(xf(sx, 0.04, sz)), C.dark);
      m = place(2.1, 250 * Math.PI / 180);
      box(b, 0.16, 0.16, 0.16, m.clone().multiply(xf(-0.1, 0.08, 0)), C.sky);
      box(b, 0.16, 0.16, 0.16, m.clone().multiply(xf(0.1, 0.08, 0, 0.3)), C.yellow);
      box(b, 0.16, 0.16, 0.16, m.clone().multiply(xf(0, 0.24, 0, 0.6)), C.red);
      cone(b, 0.11, 0.16, 4, m.clone().multiply(xf(0, 0.4, 0, 0.6 + Math.PI / 4)), C.mint);
      sector(b, { r0: 1.85, r1: 2.36, y0: 0, y1: 0.01, a0: 232 * Math.PI / 180, a1: 268 * Math.PI / 180, seg: 6, col: C.lav, bottom: false });
    },
    // floor 2: throne room — throne, a low shelf with books, rug
    (b) => {
      let m = place(2.1, 180 * Math.PI / 180);
      box(b, 0.5, 0.22, 0.42, m.clone().multiply(xf(0, 0.11, 0)), C.gold);
      box(b, 0.42, 0.07, 0.34, m.clone().multiply(xf(0, 0.255, -0.02)), C.rose);
      box(b, 0.5, 0.62, 0.08, m.clone().multiply(xf(0, 0.53, 0.19)), C.gold);
      box(b, 0.36, 0.42, 0.03, m.clone().multiply(xf(0, 0.55, 0.14)), C.rose);
      for (const sx of [-0.27, 0.27]) { box(b, 0.06, 0.2, 0.36, m.clone().multiply(xf(sx, 0.32, 0)), C.goldDark); sphere(b, 0.05, m.clone().multiply(xf(sx, 0.88, 0.19)), C.pink, 8, 6); }
      m = place(2.14, 236 * Math.PI / 180);
      box(b, 0.7, 0.34, 0.2, m.clone().multiply(xf(0, 0.17, 0)), C.brown);
      const bc = [C.red, C.sky, C.yellow, C.mint, C.lav, C.pink];
      for (let k = 0; k < 6; k++) box(b, 0.07, 0.2 + 0.03 * (k % 3), 0.15, m.clone().multiply(xf(-0.25 + k * 0.1, 0.34 + (0.2 + 0.03 * (k % 3)) / 2, 0)), bc[k]);
      sector(b, { r0: 1.85, r1: 2.36, y0: 0, y1: 0.01, a0: 150 * Math.PI / 180, a1: 210 * Math.PI / 180, seg: 8, col: C.mint, bottom: false });
    },
  ];

  const lampGeo = own(new THREE.SphereGeometry(0.068, 6, 4));
  const trimGeo = own(new THREE.TorusGeometry(P.R_OUT - 0.01, P.TRIM_TUBE, 6, segs(48, 24)));
  trimGeo.rotateX(Math.PI / 2);
  const rings = [];
  const gateFrames = [];                  // ring-local frame of gate/bridge i (includes the floor height)
  for (let i = 0; i < P.FLOORS; i++) {
    const R = P.RING, sg = L.dir[i], F = L.foot[i];
    const wood = new Builder(), paint = new Builder();
    // P1 slab
    sector(wood, { r0: R.R_IN, r1: P.R_OUT, y0: -R.T, y1: 0, a0: 0, a1: TAU, seg: segs(R.SEG, 24), tile: R.TILE, bottom: false }); // the camera is always above
    // P6 spur teeth on the rim: one tooth is centred on the pinion when the ring is connected
    const zr = low ? G.Z_RING / 2 : G.Z_RING, pitch = TAU * P.R_OUT / zr;
    for (let k = 0; k < zr; k++) {
      box(paint, pitch * 0.5, G.TOOTH_T, G.TOOTH_H + 0.02, polar(P.R_OUT + G.TOOTH_H / 2 - 0.01, G.ANGLE + TAU * k / zr, -R.T / 2 - 0.005), C.goldDark);
    }
    // P5 cam track for the detent roller (a notch under the roller at every half step)
    waveRing(paint, { r0: D.TRACK_R0, r1: D.TRACK_R1, y: 0, depth: D.DEPTH, waves: D.WAVES, phase: D.ANGLE, seg: segs(96, 48), col: C.gold });
    // P4 stair treads above the drawbridge, with a painted top (rainbow) and stringers under both edges
    for (let k = L.hingeStep; k <= S.N; k++) {
      const a0 = F + sg * (k - 1) * L.delta, a1 = F + sg * k * L.delta, y1 = k * L.rise;
      sector(wood, { r0: S.R_IN, r1: S.R_OUT, y0: y1 - S.TREAD_T, y1, a0, a1, seg: 2, tile: 0.9, top: false });
      sector(paint, { r0: S.R_IN, r1: S.R_OUT, y0: y1 - 0.004, y1: y1 + 0.004, a0, a1, seg: 2, col: RAINBOW[(k - 1) % RAINBOW.length], bottom: false });
      if (k < S.N) {
        sector(wood, { r0: S.R_OUT - 0.05, r1: S.R_OUT, y0: y1 - S.TREAD_T - 0.13, y1: y1 - S.TREAD_T, a0, a1, seg: 2, col: C.shade, tile: 0.9, top: false });
        sector(wood, { r0: S.R_IN, r1: S.R_IN + 0.05, y0: y1 - S.TREAD_T - 0.13, y1: y1 - S.TREAD_T, a0, a1, seg: 2, col: C.shade, tile: 0.9, top: false });
      }
    }
    // landing at the top of the flight (level with the next floor) + carpet
    const e0 = L.top[i], e1 = L.top[i] + sg * S.PLAT_W;
    sector(wood, { r0: S.R_IN, r1: S.R_OUT, y0: P.FLOOR_H - S.TREAD_T, y1: P.FLOOR_H, a0: e0, a1: e1, seg: 6, tile: 0.9, top: false });
    sector(paint, { r0: S.R_IN, r1: S.R_OUT, y0: P.FLOOR_H - 0.004, y1: P.FLOOR_H + 0.004, a0: e0, a1: e1, seg: 6, col: FLOOR_COL[i], bottom: false });
    sector(wood, { r0: S.R_OUT - 0.05, r1: S.R_OUT, y0: P.FLOOR_H - 0.2, y1: P.FLOOR_H - S.TREAD_T, a0: e0 - sg * L.delta, a1: e1, seg: 6, col: C.shade, tile: 0.9, top: false });
    // posts standing on the ring's inner edge carry the flight (they stay below the ring above)
    const postHalf = (S.POST_W / 2) / (S.POST_R + S.POST_W / 2);
    const posts = [];
    for (const k of [L.hingeStep, Math.round((L.hingeStep + S.N) / 2)]) posts.push([F + sg * (k - 0.5) * L.delta, k * L.rise - S.TREAD_T - 0.13]);
    posts.push([e0 + sg * 0.2 * S.PLAT_W, P.FLOOR_H - 0.14], [e0 + sg * 0.85 * S.PLAT_W, P.FLOOR_H - 0.14]);
    for (const [a, topY] of posts) {
      sector(paint, { r0: S.POST_R, r1: S.POST_R + S.POST_W, y0: 0, y1: topY, a0: a - postHalf, a1: a + postHalf, seg: 1, col: C.cream, bottom: false });
      sector(paint, { r0: S.R_OUT - 0.05, r1: S.POST_R + S.POST_W, y0: topY - 0.06, y1: topY, a0: a - postHalf, a1: a + postHalf, seg: 1, col: C.cream });
      sphere(paint, 0.045, polar(S.POST_R + S.POST_W / 2, a, 0.03), C.gold, 6, 4);
    }
    // P3 gate frame on the first fixed tread; the drawbridge hinge is on the same line
    const ah = L.hingeAngle(i);
    const gm = M4().makeRotationY(ah - sg * Math.PI / 2).setPosition(L.rMid * Math.sin(ah), L.hingeY, L.rMid * Math.cos(ah));
    archFrame(paint, gm, P.GATE.HALF_W, P.GATE.POST_H, S.TREAD_T, -0.05, C.cream);
    FURNITURE[i](paint);
    const group = new THREE.Group(); group.name = 'ring' + i; group.position.y = L.floorY(i);
    const woodMat = own(woodBase.clone());
    woodMat.emissive.set(0xffb040); woodMat.emissiveIntensity = 0;
    const trimMat = own(new THREE.MeshLambertMaterial({ color: 0xffc83d, emissive: 0xffd34d, emissiveIntensity: 0 }));
    const trim = new THREE.Mesh(trimGeo, trimMat); trim.name = 'trim' + i; trim.position.y = 0.005;
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, P.LAMPS); lamps.name = 'lamps' + i;
    for (let k = 0; k < P.LAMPS; k++) lamps.setMatrixAt(k, polar(P.LAMP_R, D.ANGLE + TAU * (k + 0.5) / P.LAMPS, 0.02));
    lamps.setColorAt(0, new THREE.Color(1, 1, 1)); // allocates instanceColor
    const woodMesh = mesh(wood.build(), woodMat, 'ring-wood' + i); woodMesh.renderOrder = 1;
    group.add(woodMesh, mesh(paint.build(), paintMat, 'ring-paint' + i), trim, lamps);
    root.add(group);
    gateFrames.push(gm.clone().premultiply(M4().makeTranslation(0, L.floorY(i), 0)));
    rings.push({ group, woodMat, trimMat, lamps });
  }

  // =====================================================================================
  // 3. moving parts that live in the fixed frame (instanced)
  // =====================================================================================
  // door leaves: 2 per gate + 2 on the tower. frame = hinge-line frame, (hx, hy, hz) = hinge, base/sign = swing
  const leafB = new Builder();
  const leafW = P.GATE.HALF_W - 0.015;
  plate(leafB, leafOutline(leafW, P.GATE.POST_H, low ? 3 : 5), 0.03, null, K.WHITE);
  sphere(leafB, 0.022, xf(leafW - 0.05, P.GATE.POST_H * 0.55, 0.025), C.gold, 6, 4);
  sphere(leafB, 0.022, xf(leafW - 0.05, P.GATE.POST_H * 0.55, -0.025), C.gold, 6, 4);
  const doorMesh = inst(leafB.build(), paint2Mat, (P.FLOORS + 1) * 2, 'doors');
  const doors = [];
  const DOOR_COL = [0xff8fb1, 0xa9a3ff, 0x7fdcb6, 0xffb347];
  const tc = new THREE.Color();
  for (let i = 0; i <= P.FLOORS; i++) {
    const tower = i === P.FLOORS;
    const frame = tower ? polar(T.STEM_R + 0.005, L.doorAngle, y3) : gateFrames[i];
    const hw = tower ? T.DOOR_HALF_W : P.GATE.HALF_W, hy = tower ? 0 : S.TREAD_T, hz = tower ? 0.045 : -0.05;
    doors.push({ ring: tower ? -1 : i, frame, hx: -hw, hy, hz, base: 0, sign: tower ? -1 : 1, group: i });
    doors.push({ ring: tower ? -1 : i, frame, hx: hw, hy, hz, base: Math.PI, sign: tower ? 1 : -1, group: i });
    doorMesh.setColorAt(i * 2, tc.set(DOOR_COL[i])); doorMesh.setColorAt(i * 2 + 1, tc.set(DOOR_COL[i]));
  }
  root.add(doorMesh);

  // drawbridges: the folded treads of each flight, one rigid piece hinged at the nose of the first fixed tread
  const brB = new Builder();
  for (let j = 1; j <= P.BRIDGE.N; j++) {
    const topY = (j - L.hingeStep) * L.rise + S.TREAD_T, z0 = (P.BRIDGE.N - j) * L.tread;
    box(brB, P.BRIDGE.WIDTH, S.TREAD_T, L.tread, xf(0, topY - S.TREAD_T / 2, z0 + L.tread / 2), null, 0.35);
    box(brB, P.BRIDGE.WIDTH, L.rise - S.TREAD_T, 0.025, xf(0, topY - S.TREAD_T - (L.rise - S.TREAD_T) / 2, z0 + L.tread - 0.0125), C.shade, 0.35);
    for (const sx of [-1, 1]) box(brB, 0.03, 0.05, L.tread, xf(sx * (P.BRIDGE.WIDTH / 2 + 0.015), topY - 0.01, z0 + L.tread / 2), C.gold, 0.1);
  }
  const bridgeMesh = inst(brB.build(), woodBase, P.FLOORS, 'bridges');
  root.add(bridgeMesh);

  // P6 pinions (top painted as a pinwheel so the 8:1 spin is easy to see)
  const zp = low ? G.Z_PINION / 2 : G.Z_PINION, pp = TAU * L.pinionR / zp;
  const pinB = new Builder();
  cyl(pinB, L.pinionR - 0.03, L.pinionR - 0.03, G.TOOTH_T, segs(16, 10), xf(0, 0, 0), C.gold);
  for (let k = 0; k < zp; k++) box(pinB, pp * 0.5, G.TOOTH_T, G.TOOTH_H + 0.03, polar(L.pinionR - 0.005, TAU * (k + 0.5) / zp, 0), C.goldDark);
  for (let k = 0; k < 6; k++) {
    sector(pinB, { r0: 0, r1: L.pinionR - 0.05, y0: G.TOOTH_T / 2, y1: G.TOOTH_T / 2 + 0.03, a0: TAU * k / 6, a1: TAU * (k + 1) / 6, seg: 2,
      col: k % 2 ? C.white : C.rose, bottom: false, inner: false, caps: false });
  }
  sphere(pinB, 0.06, xf(0, G.TOOTH_T / 2 + 0.05, 0), C.gold, 8, 6);
  const pinionMesh = inst(pinB.build(), paintMat, P.FLOORS, 'pinions');
  root.add(pinionMesh);

  // P5 pawls: arm along local +Z, roller at the end, pivot at the origin (rotates about local X)
  const pawlB = new Builder();
  box(pawlB, 0.045, 0.035, D.ARM, xf(0, 0, D.ARM / 2), C.red);
  pawlB.add(new THREE.CylinderGeometry(D.ROLLER_R, D.ROLLER_R, 0.1, 10).rotateZ(Math.PI / 2), xf(0, 0, D.ARM), C.gold);
  sphere(pawlB, 0.04, xf(0, 0, 0), C.gold, 8, 6);
  const pawlMesh = inst(pawlB.build(), paintMat, P.FLOORS, 'pawls');
  root.add(pawlMesh);

  // =====================================================================================
  // 4. tower: petals (gores of the onion dome), sector gears, pedestal lift with rack, pole, flag
  // =====================================================================================
  const nv = low ? 8 : 12, nu = low ? 4 : 6, half = Math.PI / T.PETALS;
  const profR = (t) => T.HINGE_R * Math.pow(Math.max(1 - t, 0), 0.55) * (1 + 0.9 * t);
  const gore = new Builder();
  const cIn0 = col(0xfff0a0), cIn1 = col(0xff8fc0);
  let petalArc = 0;
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, r = profR(t), y = T.PETAL_H * t;
    const t0 = Math.max(0, t - 0.02), t1 = Math.min(1, t + 0.02);
    const dr = profR(t1) - profR(t0), dy = T.PETAL_H * (t1 - t0), len = Math.max(Math.hypot(dr, dy), 1e-6);
    const nr = dy / len, ny = -dr / len;
    if (j > 0) petalArc += Math.hypot(r - profR((j - 1) / nv), T.PETAL_H / nv);
    const c = { r: cIn0.r + (cIn1.r - cIn0.r) * t, g: cIn0.g + (cIn1.g - cIn0.g) * t, b: cIn0.b + (cIn1.b - cIn0.b) * t };
    for (let i = 0; i <= nu; i++) {
      const f = -half + 2 * half * i / nu;
      gore.v(r * Math.sin(f), y, r * Math.cos(f) - T.HINGE_R, nr * Math.sin(f), ny, nr * Math.cos(f), 0.5 + (i / nu - 0.5) * 1.6 * (0.25 + r / T.HINGE_R), t * 2.4, c);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i;
    gore.quad(a, a + 1, a + nu + 2, a + nu + 1);
  }
  const goreGeo = gore.build();
  const petalOut = inst(goreGeo, roofMat, T.PETALS, 'petals-out');
  const petalIn = new THREE.InstancedMesh(goreGeo, petalInMat, T.PETALS); petalIn.name = 'petals-in'; petalIn.frustumCulled = false;
  petalIn.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // sector gear on the hinge of each petal + gold bead at the tip (same instance matrices as the petal)
  const hw2 = new Builder();
  const pie = [[0, 0]];
  for (let k = 0; k <= 8; k++) { const g = (-14 + (T.OPEN * 180 / Math.PI + 42) * k / 8) * Math.PI / 180; pie.push([-(T.SECTOR_R - 0.025) * Math.cos(g), -(T.SECTOR_R - 0.025) * Math.sin(g)]); }
  plate(hw2, pie, 0.05, M4().makeRotationY(-Math.PI / 2), C.gold);
  const nTeeth = Math.floor((T.OPEN + 0.3) / (TAU / T.SECTOR_Z)) + 1;
  for (let k = 0; k < nTeeth; k++) {
    const g = k * TAU / T.SECTOR_Z;
    box(hw2, 0.06, L.rackPitch * 0.45, 0.07, xf(0, -T.SECTOR_R * Math.sin(g), -T.SECTOR_R * Math.cos(g), 0, Math.PI - g), C.goldDark);
  }
  hw2.add(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8).rotateZ(Math.PI / 2), null, C.goldDark);
  sphere(hw2, 0.055, xf(0, T.PETAL_H - 0.02, -T.HINGE_R + 0.04), C.gold, 8, 6);
  const petalHw = inst(hw2.build(), paintMat, T.PETALS, 'petal-gears');
  root.add(petalOut, petalIn, petalHw);

  // P9 pedestal: the lift. Its top carries the cargo; the ribs below the top are the circular rack
  const ped = new Builder();
  cyl(ped, T.PED_R, T.PED_R, T.PED_LEN, segs(20, 12), xf(0, -0.03 - T.PED_LEN / 2, 0), C.cream);
  cyl(ped, T.PED_R + 0.05, T.PED_R + 0.05, 0.03, segs(20, 12), xf(0, -0.015, 0), C.rose);
  const ribR = T.HINGE_R - T.SECTOR_R + 0.035, nRibs = Math.ceil(L.stroke / L.rackPitch) + 1;
  for (let k = 0; k < nRibs; k++) cyl(ped, ribR, ribR, L.rackPitch * 0.45, segs(20, 12), xf(0, -L.rackPitch * (k + 0.5), 0), C.goldDark);
  const pedestal = mesh(ped.build(), paintMat, 'pedestal');
  // P11 pole + finial (origin at the pole foot) and the flag (own canvas texture, CPU wave)
  const poleB = new Builder();
  cyl(poleB, P.FLAG.POLE_R, P.FLAG.POLE_R, P.FLAG.POLE, 6, xf(0, P.FLAG.POLE / 2, 0), C.cream);
  sphere(poleB, 0.055, xf(0, P.FLAG.POLE + 0.03, 0), C.gold, 8, 6);
  const pole = mesh(poleB.build(), paintMat, 'pole');
  const flagCanvas = document.createElement('canvas'); flagCanvas.width = 256; flagCanvas.height = 128;
  drawFlag(flagCanvas);
  const flagTex = own(new THREE.CanvasTexture(flagCanvas));
  flagTex.name = 'hero_flag_256'; flagTex.colorSpace = THREE.SRGBColorSpace;
  const flagGeo = new THREE.PlaneGeometry(P.FLAG.W, P.FLAG.H, P.FLAG.SEG_W, P.FLAG.SEG_H);
  flagGeo.translate(P.FLAG.W / 2, 0, 0);
  const flagMat = own(new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }));
  const flag = mesh(flagGeo, flagMat, 'flag');
  flag.position.set(P.FLAG.POLE_R, P.FLAG.POLE - P.FLAG.H / 2 - 0.04, 0);
  pole.add(flag);
  root.add(pedestal, pole);

  // =====================================================================================
  // 5. cargo: treasure chest (body + hinged lid) and teddy bear; both face local +Z
  // =====================================================================================
  const chB = new Builder();
  box(chB, 0.36, 0.17, 0.24, xf(0, 0.125, 0), C.brown);
  for (const sx of [-0.12, 0.12]) box(chB, 0.035, 0.18, 0.25, xf(sx, 0.125, 0), C.gold);
  box(chB, 0.07, 0.08, 0.02, xf(0, 0.16, 0.125), C.gold);
  for (const [sx, sz] of [[-0.13, -0.09], [0.13, -0.09], [-0.13, 0.09], [0.13, 0.09]]) chB.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8).rotateZ(Math.PI / 2), xf(sx, 0.04, sz), C.dark);
  chB.add(new THREE.SphereGeometry(0.15, 10, 6, 0, TAU, 0, Math.PI / 2), xf(0, 0.185, 0, 0, 0, 1.05, 0.5, 0.72), C.yellow); // treasure heap
  chB.add(new THREE.OctahedronGeometry(0.04, 0), xf(-0.07, 0.25, 0.03), C.rose);
  chB.add(new THREE.OctahedronGeometry(0.035, 0), xf(0.08, 0.245, -0.02), C.sky);
  const chest = new THREE.Group(); chest.name = 'chest'; chest.scale.setScalar(P.CARGO.CHEST_SCALE);
  chest.add(mesh(chB.build(), paintMat, 'chest-body'));
  const lidB = new Builder(); // hinge = local origin (back top edge of the body), lid extends towards +Z
  lidB.add(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), xf(0, 0, 0.12), C.brown);
  for (const sx of [-0.12, 0.12]) lidB.add(new THREE.CylinderGeometry(0.125, 0.125, 0.035, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), xf(sx, 0, 0.12), C.gold);
  box(lidB, 0.36, 0.012, 0.24, xf(0, 0.004, 0.12), C.dark);
  const lid = mesh(lidB.build(), paint2Mat, 'chest-lid');
  lid.position.set(0, 0.215, -0.12);
  chest.add(lid);

  const tdB = new Builder();
  const sp = (r, x, y, z, c, sx, sy, sz) => tdB.add(new THREE.SphereGeometry(r, r > 0.06 ? (low ? 8 : 12) : 6, r > 0.06 ? (low ? 6 : 8) : 4), xf(x, y, z, 0, 0, sx || 1, sy || 1, sz || 1), c);
  sp(0.115, 0, 0.145, 0, C.fur, 1, 1.05, 0.9);            // body
  sp(0.07, 0, 0.13, 0.065, C.muzzle, 1, 1.1, 0.6);        // tummy
  sp(0.095, 0, 0.315, 0, C.fur);                          // head
  for (const sx of [-1, 1]) {
    sp(0.036, sx * 0.07, 0.395, 0, C.fur); sp(0.02, sx * 0.07, 0.395, 0.022, C.muzzle);
    sp(0.042, sx * 0.125, 0.17, 0.02, C.fur, 0.8, 1.5, 0.8);  // arms
    sp(0.05, sx * 0.065, 0.04, 0.05, C.fur, 0.9, 0.8, 1.3);   // legs
    sp(0.013, sx * 0.036, 0.335, 0.083, C.ink);               // eyes
    tdB.add(new THREE.ConeGeometry(0.035, 0.06, 6).rotateZ(-sx * Math.PI / 2), xf(sx * 0.045, 0.228, 0.085), C.rose); // bow
  }
  sp(0.042, 0, 0.292, 0.075, C.muzzle, 1, 0.8, 0.8);
  sp(0.015, 0, 0.305, 0.108, C.ink);
  sp(0.018, 0, 0.228, 0.09, C.red);
  const teddy = new THREE.Group(); teddy.name = 'teddy'; teddy.scale.setScalar(P.CARGO.TEDDY_SCALE);
  teddy.add(mesh(tdB.build(), paintMat, 'teddy-body'));
  root.add(chest, teddy);

  // =====================================================================================
  // 6. sparkles (instanced little stars, unlit) and invisible grab proxies
  // =====================================================================================
  const nSpark = low ? P.SPARKLES / 2 : P.SPARKLES;
  const sparkGeo = new THREE.OctahedronGeometry(1, 0); sparkGeo.scale(0.45, 1, 0.45);
  const sparkles = inst(sparkGeo, sparkMat, nSpark, 'sparkles');
  sparkles.setColorAt(0, new THREE.Color(1, 1, 1));
  sparkles.count = 0;
  root.add(sparkles);

  const hitTargets = [];
  const proxyGeo = own(new THREE.CylinderGeometry(P.PROXY.R, P.PROXY.R, P.PROXY.H, 16));
  for (let i = 0; i < P.FLOORS; i++) {
    const m = new THREE.Mesh(proxyGeo, proxyMat); m.name = 'proxy-ring' + i;
    m.position.y = L.floorY(i) - 0.1 + P.PROXY.H / 2;
    m.userData.partId = 'ring' + i;
    root.add(m); hitTargets.push(m);
  }
  const towerProxy = new THREE.Mesh(own(new THREE.CylinderGeometry(1.5, 1.3, 2.6, 12)), proxyMat);
  towerProxy.name = 'proxy-tower'; towerProxy.position.y = y3 + 0.45 + 1.3; towerProxy.userData.partId = 'tower';
  root.add(towerProxy); hitTargets.push(towerProxy);

  // meshes that only matter for the finale start hidden inside the stem; keep them out of the scene graph cost
  return {
    root, L, owned, rings, doors, doorMesh, bridgeMesh, gateFrames, pinionMesh, pawlMesh,
    petalOut, petalIn, petalHw, pedestal, pole, flag, flagTex, chest, lid, teddy, sparkles, nSpark, hitTargets, petalArc,
    instanced: [doorMesh, bridgeMesh, pinionMesh, pawlMesh, petalOut, petalIn, petalHw, sparkles].concat(rings.map((r) => r.lamps)),
  };
}

// flag pattern (the hero's only own texture, 256×128): pink field, white heart, gold stars, scalloped edge
function drawFlag(c) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#ff6fa8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffd1e3';
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(W - 4, (i + 0.5) * H / 8, H / 16 + 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffe36e'; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  g.fillStyle = '#ffffff';
  const cx = W * 0.42, cy = H * 0.5, s = H * 0.3;
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.7, cy - s * 1.15, cx, cy - s * 0.35);
  g.bezierCurveTo(cx + s * 0.7, cy - s * 1.15, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  g.fill();
  g.fillStyle = '#ffe36e';
  for (const [x, y, r] of [[W * 0.76, H * 0.32, 11], [W * 0.8, H * 0.68, 8], [W * 0.12, H * 0.3, 7]]) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    g.closePath(); g.fill();
  }
}
