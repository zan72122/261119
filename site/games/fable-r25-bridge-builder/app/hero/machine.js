// 架橋機の本体（橋そのもの以外）を組み立てる。寸法は kin.js の P、形は parts.js。
// 返すのは「動かす部品」の取っ手だけ。動かす計算は hero.js がする。
import { P, TAU, gearLayout } from './kin.js';
import { builder, gearGeometry, screwGeometry, panelGeometry, ringGeometry, ratchetGeometry } from './parts.js';

export const COL = {
  chassis: 0x58b9c9, pedestal: 0x3f93a6, panel: 0xfff0d2, bracket: 0xd9b98c,
  disc: 0xffa94d, tower: 0xff8a5c, peg: 0xfff0d2,
  boom: 0x9483dc, mast: 0x7f6fd0, follower: 0x6b5fb5,
  cross: 0xff7096, nut: 0xff7096, steel: 0xe2e8f0, ring: 0xffd34e,
  pier: 0xc99a66, recv: 0xc99a66,
  idler: 0xffcf5a, screwGear: 0x7fd9c4,
  grey: 0xa9adba, crank: 0xff5578, lever: 0x52cc68, wheel: 0x33b4f2,
};

/**
 * @param R ラウンドごとの解（kin.solveRound の配列）
 * @param lift kin.makeLift の戻り値
 * @param mats { body, metal, crank, wheel, lever, hit }
 */
export function buildMachine(THREE, R, lift, mats, keep, lowDetail) {
  const lay = gearLayout();
  const zFace = P.panelZ + P.panelT;            // パネルの前面
  const zG = zFace + 0.012 + P.gearT / 2;       // 歯車の層
  const zW = zFace + 0.16;                      // 舵輪・レバーの取っ手の層
  const screwY = P.pivotY + P.screwDY;
  const rodY = P.pivotY + P.barV;
  const M4 = () => new THREE.Matrix4();
  const out = { lay, zG, zW, screwY };

  // ---------- 固定の本体（1メッシュ）
  {
    const b = builder(THREE);
    const zc = (P.chassisZ0 + P.chassisZ1) / 2, zd = P.chassisZ1 - P.chassisZ0;
    b.box(P.chassisW, P.chassisT, zd, 0, P.chassisT / 2, zc, COL.chassis);
    b.cyl(P.chassisDiscR, P.chassisT, 0, P.chassisT / 2, 0, COL.chassis, 'y', 28);
    b.cyl(P.pedestalR, P.pedestalTop - P.chassisT, 0, (P.pedestalTop + P.chassisT) / 2, 0, COL.pedestal, 'y', 20);
    b.add(panelGeometry(THREE, { w: P.chassisW, h: P.panelH, t: P.panelT, tabX0: lay.ci.x - 0.2, tabX1: 0.2, tabH: P.panelTabH }),
      M4().makeTranslation(0, 0, P.panelZ), COL.panel);
    // 軸受け（パネル前面の丸い座）
    for (const c of [lay.c1, lay.ci, lay.c2, { x: 0, y: out.wheelY = P.pedestalTop - P.pegLen / 2 - P.crownR * P.Zw / P.Zr }, { x: P.leverX, y: lift.leverY }]) {
      b.cyl(0.075, 0.012, c.x, c.y, zFace + 0.006, COL.bracket, 'z', 14);
    }
    // 送りねじの受け（パネルから前へ出る2本の腕＋端の板）
    const zb = (P.panelZ + P.screwZ0) / 2, lb = P.panelZ - P.screwZ0;
    for (const sx of [-1, 1]) b.box(0.03, 0.05, lb, sx * 0.13, screwY, zb, COL.bracket);
    b.box(0.29, 0.20, 0.03, 0, screwY - 0.045, P.screwZ0 - 0.015, COL.bracket);
    // リフトリングの案内柱
    for (const sx of [-1, 1]) b.cyl(0.022, 0.9 - P.chassisT, sx * 0.745, (0.9 + P.chassisT) / 2, 0.43, COL.steel, 'y', 8);
    // レバー軸の受け（腕の後ろ）と舵輪の軸の受け
    b.box(0.09, lift.leverY + 0.05, 0.06, P.leverX, (lift.leverY + 0.05) / 2, -0.11, COL.pedestal);
    b.box(0.09, out.wheelY - 0.04, 0.05, 0, (out.wheelY - 0.04) / 2 + 0.0, P.crownR + 0.13, COL.pedestal);
    // 橋台（橋の根元を受ける台）と、島の受け口
    out.receivers = [];
    R.forEach((r) => {
      const t = r.target, sn = Math.sin(t.yaw), cs = Math.cos(t.yaw);
      const rot = M4().makeRotationY(t.yaw);
      const place = (g, lx, y, dist, c) => b.add(g, rot.clone().setPosition(-sn * dist + cs * lx, y, -cs * dist - sn * lx), c);
      // 根元の下ピンの位置（最終姿勢）
      const rr = r.rootU * Math.cos(r.a1) - P.vR * Math.sin(r.a1);
      const ry = P.pivotY + r.rootU * Math.sin(r.a1) + P.vR * Math.cos(r.a1);
      const top = ry - P.pinR;
      for (const sx of [-1, 1]) place(new THREE.CylinderGeometry(0.04, 0.05, top - 0.06, 8), sx * P.pierPostX, (top - 0.06) / 2, rr, COL.pier);
      place(new THREE.BoxGeometry(2 * P.trussX + 0.14, 0.06, 0.09), 0, top - 0.03, rr, COL.pier);
      for (const sx of [-1, 1]) place(new THREE.BoxGeometry(0.03, 0.07, 0.09), sx * (P.trussX + 0.085), top + 0.02, rr, COL.pier);
      // 受け口：先端の下ピンが乗る台（U字の両側）
      const rh = P.recvH - P.pinR;
      place(new THREE.BoxGeometry(2 * P.trussX + 0.2, rh, 0.14), 0, t.height + rh / 2, t.distance, COL.recv);
      for (const sx of [-1, 1]) place(new THREE.BoxGeometry(0.04, 0.16, 0.14), sx * (P.trussX + 0.1), t.height + 0.08, t.distance, COL.recv);
      out.receivers.push({ x: -sn * t.distance, y: t.height, z: -cs * t.distance, yaw: t.yaw });
    });
    out.staticMesh = new THREE.Mesh(keep(b.build()), mats.body);
  }

  // ---------- クランク歯車（操作部）・中間歯車・ねじ歯車＋送りねじ
  {
    const b = builder(THREE);
    b.add(gearGeometry(THREE, { Z: P.Z1, m: P.gearM, t: P.gearT, holes: 6, holeR: 0.082, holeAt: 0.235, curve: lowDetail ? 5 : 8 }));
    b.cyl(0.09, P.gearT + 0.03, 0, 0, 0.015, undefined, 'z', 14);
    // 取っ手（角度 90°＝真上）
    b.cyl(0.05, 0.17, 0, P.knobR, P.gearT / 2 + 0.085, undefined, 'z', 12);
    b.ball(0.07, 0, P.knobR, P.gearT / 2 + 0.18, undefined, 10);
    out.crank = new THREE.Mesh(keep(b.build()), mats.crank);
    out.crank.position.set(lay.c1.x, lay.c1.y, zG);

    const bi = builder(THREE);
    bi.add(gearGeometry(THREE, { Z: P.Zi, m: P.gearM, t: P.gearT, holes: 4, holeR: 0.045, holeAt: 0.105, curve: 6 }), null, COL.idler);
    bi.cyl(0.05, P.gearT + 0.03, 0, 0, 0.015, COL.steel, 'z', 10);
    out.idler = new THREE.Mesh(keep(bi.build()), mats.metal);
    out.idler.position.set(lay.ci.x, lay.ci.y, zG);

    const bs = builder(THREE);
    bs.add(gearGeometry(THREE, { Z: P.Z2, m: P.gearM, t: P.gearT, holes: 3, holeR: 0.04, holeAt: 0.085, curve: 6 }), M4().makeTranslation(0, 0, zG), COL.screwGear);
    bs.cyl(0.045, 0.04, 0, 0, zG + P.gearT / 2 + 0.02, COL.steel, 'z', 10);
    const z0 = P.panelZ - 0.02, len = z0 - P.screwZ0;
    bs.cyl(P.screwR, zG - P.screwZ0, 0, 0, (zG + P.screwZ0) / 2, COL.steel, 'z', 8);
    bs.add(screwGeometry(THREE, { len, lead: P.screwLead, r0: P.screwR, r1: P.screwRidge, seg: lowDetail ? 8 : 12 }), M4().makeTranslation(0, 0, z0), COL.steel);
    out.screw = new THREE.Mesh(keep(bs.build()), mats.metal);
    out.screw.position.set(0, screwY, 0);
  }

  // ---------- ナット＋押し棒（前後に動く）
  {
    const b = builder(THREE);
    const dy = rodY - screwY;                              // 押し棒はねじの下
    b.box(P.nutW, P.nutH, P.nutLen, 0, 0, 0, COL.nut);
    b.box(0.07, -dy + 0.03, P.nutLen * 0.7, 0, dy / 2, 0, COL.nut);
    // 押し棒：先端が s=0 でクロスヘッドの横棒の後ろに付く
    const tipZ = -(P.uA + P.w0 / 2 - P.barR) - P.nutZ0;    // ナット基準
    b.cyl(P.rodR, -tipZ, 0, dy, tipZ / 2, COL.steel, 'z', 8);
    b.cyl(P.rodR * 1.7, 0.03, 0, dy, tipZ + 0.015, COL.nut, 'z', 10);
    out.nut = new THREE.Mesh(keep(b.build()), mats.body);
    out.nut.position.set(0, screwY, P.nutZ0);
  }

  // ---------- 舵輪（操作部）＋軸＋小歯車
  {
    const b = builder(THREE);
    const rim = new THREE.TorusGeometry(P.wheelR, 0.035, 8, lowDetail ? 20 : 28);
    b.add(rim, M4().makeTranslation(0, 0, zW));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, c = Math.cos(a), s = Math.sin(a);
      const L = P.wheelR + P.wheelPeg;
      b.add(new THREE.CylinderGeometry(0.024, 0.024, L, 8), M4().makeRotationZ(a - Math.PI / 2).setPosition(c * L / 2, s * L / 2, zW));
      b.ball(0.045, c * L, s * L, zW, undefined, 8);
    }
    b.cyl(0.075, 0.07, 0, 0, zW, undefined, 'z', 12);
    b.cyl(0.03, zW - P.crownR + 0.05, 0, 0, (zW + P.crownR - 0.05) / 2, undefined, 'z', 8);
    const rw = P.crownR * P.Zw / P.Zr;
    b.add(gearGeometry(THREE, { Z: P.Zw, m: 2 * rw / P.Zw, t: 0.07 }), M4().makeTranslation(0, 0, P.crownR));
    out.wheel = new THREE.Mesh(keep(b.build()), mats.wheel);
    out.wheel.position.set(0, out.wheelY, 0);
  }

  // ---------- レバー（操作部）＋軸＋腕＋ローラ
  {
    const b = builder(THREE);
    b.cyl(0.03, zW + 0.1, 0, 0, (zW - 0.1) / 2 + 0.0, undefined, 'z', 8);
    b.cyl(0.07, 0.08, 0, 0, zW, undefined, 'z', 12);
    b.box(P.leverHandle, 0.07, 0.05, -P.leverHandle / 2, 0, zW);
    b.ball(P.leverBallR, -P.leverHandle, 0, zW, undefined, 14);
    b.box(lift.arm, 0.05, 0.04, -lift.arm / 2, 0, 0);
    b.cyl(P.armRollR, 0.07, -lift.arm, 0, 0, undefined, 'z', 10);
    out.lever = new THREE.Mesh(keep(b.build()), mats.lever);
    out.lever.position.set(P.leverX, lift.leverY, 0);
  }

  // ---------- リフトリング（上下に動く）
  {
    const b = builder(THREE);
    b.add(ringGeometry(THREE, P.ringRi, P.ringRo, P.ringT, lowDetail ? 20 : 32), null, COL.ring);
    for (const sx of [-1, 1]) b.cyl(0.05, P.ringT + 0.02, sx * 0.745, P.ringT / 2, 0.43, COL.ring, 'y', 10);
    out.ring = new THREE.Mesh(keep(b.build()), mats.body);
  }

  // ---------- 旋回台（yaw で回る）
  {
    const b = builder(THREE);
    const y0 = P.pedestalTop, y1 = y0 + P.discT;
    b.cyl(P.discR, P.discT, 0, (y0 + y1) / 2, 0, COL.disc, 'y', lowDetail ? 24 : 32);
    const nPeg = P.Zr;
    for (let k = 0; k < nPeg; k++) {
      const a = (k / nPeg) * TAU;     // k=0 は後ろ（+Z）
      b.cyl(P.pegR, P.pegLen, P.crownR * Math.sin(a), y0 - P.pegLen / 2, P.crownR * Math.cos(a), COL.peg, 'y', 6);
    }
    const th = P.pivotY + 0.07 - y1;
    for (const sx of [-1, 1]) {
      b.box(P.towerW, th, P.towerD, sx * P.towerX, y1 + th / 2, 0, COL.tower);
      b.box(P.towerW, 0.05, P.towerD * 2.2, sx * P.towerX, y1 + 0.025, 0, COL.tower);
      b.cyl(0.03, P.towerX - P.trussX + 0.04, sx * (P.towerX + P.trussX) / 2, P.pivotY, 0, COL.steel, 'x', 8);
    }
    out.turntable = new THREE.Group();
    out.turntableMesh = new THREE.Mesh(keep(b.build()), mats.body);
    out.turntable.add(out.turntableMesh);
  }

  // ---------- ブーム（起伏する桁）＋発射セルのマスト＋従動ローラ。ブーム座標：(x, v, −u)
  {
    const b = builder(THREE);
    const hMax = P.link * Math.sin(Math.acos(P.w0 / P.link));
    const mastTop = P.vR + hMax + 0.13;
    out.mastTop = mastTop;
    const bl = P.railEnd + 0.15;
    for (const sx of [-1, 1]) {
      b.box(P.railW, P.railT, bl, sx * P.trussX, P.beamV, -(P.railEnd - 0.15) / 2, COL.boom);
      b.box(P.railW, P.vR - 0.02 + 0.03, 0.07, sx * P.trussX, (P.vR + 0.02) / 2, -P.uA, COL.boom);           // 固定ピンの支え
      b.box(0.04, mastTop + 0.05, 0.05, sx * P.mastX, (mastTop - 0.05) / 2, -P.uA, COL.mast);                 // マスト
      // ラチェットの歯（後ろ向き＝カメラ側）
      const nT = Math.floor((hMax - 0.25) / P.ratchetPitch);
      b.add(ratchetGeometry(THREE, nT, P.ratchetPitch, 0.02, 0.03),
        M4().makeRotationY(-Math.PI / 2).setPosition(sx * P.mastX, P.vR + 0.28, -P.uA + 0.025), COL.steel);
      b.box(0.04, P.followD, 0.05, sx * P.followX, -P.followD / 2, -P.followU, COL.follower);                 // 従動ローラの腕
      b.cyl(P.followR, 0.07, sx * P.followX, -P.followD, -P.followU, COL.steel, 'x', 12);
    }
    b.box(2 * P.mastX + 0.04, 0.04, 0.05, 0, mastTop, -P.uA, COL.mast);
    b.box(2 * P.trussX, 0.04, 0.05, 0, P.beamV, -(P.railEnd - 0.07), COL.boom);
    b.box(2 * P.trussX, 0.04, 0.05, 0, P.beamV, 0.12, COL.boom);
    out.boom = new THREE.Group();
    out.boom.position.y = P.pivotY;
    out.turntable.add(out.boom);
    out.boomMesh = new THREE.Mesh(keep(b.build()), mats.body);
    out.boom.add(out.boomMesh);

    // クロスヘッド：横棒（押し棒が押す）＋発射セルの中心ピンをはさむフォーク
    const c = builder(THREE);
    const fx = P.mastX + 0.05;
    c.cyl(P.barR, 2 * fx + 0.04, 0, P.barV, 0, COL.cross, 'x', 8);
    for (const sx of [-1, 1]) for (const du of [-0.045, 0.045]) {
      const top = P.vR + hMax / 2 + 0.1;
      c.box(0.022, top - P.barV, 0.022, sx * fx, (top + P.barV) / 2, du, COL.cross);
    }
    for (const sx of [-1, 1]) c.box(0.03, 0.03, 0.112, sx * fx, P.vR + hMax / 2 + 0.1, 0, COL.cross);
    out.crosshead = new THREE.Mesh(keep(c.build()), mats.body);
    out.boom.add(out.crosshead);

    // スライダ：発射セルの上のピン。マストに沿って下がる
    const s = builder(THREE);
    s.cyl(P.pinR, 2 * P.mastX + 0.06, 0, 0, 0, COL.steel, 'x', 8);
    for (const sx of [-1, 1]) s.box(0.085, 0.09, 0.1, sx * P.mastX, 0, 0, COL.cross);
    out.slider = new THREE.Mesh(keep(s.build()), mats.body);
    out.boom.add(out.slider);
  }

  // ---------- 操作部の当たり判定と、指の絵の位置
  const hitGeo = keep(new THREE.SphereGeometry(1, 10, 8));
  const ctl = (id, x, y, z, hitR, gesture, radius) => {
    const anchor = new THREE.Group();
    anchor.position.set(x, y, z);
    const hit = new THREE.Mesh(hitGeo, mats.hit);
    hit.scale.setScalar(hitR);
    anchor.add(hit);
    return { id, hit, anchor, gesture, radius, swipeDir: new THREE.Vector3(0, 1, 0) };
  };
  out.controls = {
    crank: ctl('crank', lay.c1.x, lay.c1.y, zG + 0.05, 0.62, 'circle', P.knobR),
    lever: ctl('lever', P.leverX - P.leverHandle * 0.85, lift.leverY, zW, 0.5, 'swipe', 0.3),
    wheel: ctl('wheel', 0, out.wheelY, zW, 0.5, 'circle', P.wheelR * 0.85),
  };
  return out;
}
