// パンタグラフ橋（リンク・ピン・蛇腹の床板・先端のツメ）を InstancedMesh で描く。
// 全ラウンドの橋を同じ4つの InstancedMesh に入れる（ラウンドごとに範囲を分ける）。
// 位置は「ブーム座標 (x, v, −u)」で作り、ブームの行列を掛けて root 座標にする。
import { P, clamp, smooth, scissor } from './kin.js';
import { builder } from './parts.js';

export const BRIDGE_COL = {
  plain: 0xf6f1e4,                              // つながる前のリンクの色
  rounds: [0xff7eb6, 0xffb53d, 0x6ec6ff],       // つながったあとの色（ラウンド順にくり返す）
  pin: 0x596579, pinDone: 0xffffff,
  launch: 0x9483dc,
  claw: 0xff5578,
};

export function buildBridges(THREE, R, mats, keep) {
  const nR = R.length;
  const off = { link: [], pin: [], deck: [] };
  let nl = 4, np = 8, nd = 0;                   // 先頭は発射セル用（リンク4、ピン8）
  R.forEach((r) => {
    off.link.push(nl); off.pin.push(np); off.deck.push(nd);
    nl += 4 * r.n; np += 2 * (3 * r.n + 2); nd += 2 * r.n;
  });

  const linkGeo = keep(new THREE.BoxGeometry(P.linkT, P.linkW, P.link + P.linkW));
  const pinGeo = keep(new THREE.CylinderGeometry(P.pinR, P.pinR, P.pinLen, 8).rotateZ(Math.PI / 2));
  const deckGeo = keep(new THREE.BoxGeometry(P.deckW, P.deckT, 1));
  { // 板目が橋を横切る向きに、1枚に約3本
    const uv = deckGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.375);
  }
  const cb = builder(THREE);                    // ツメ：ピンから前（−Z）へのびる板
  cb.box(0.04, 0.05, 0.2, 0, 0, -0.08);
  cb.box(0.04, 0.09, 0.05, 0, -0.02, -0.17);
  const clawGeo = keep(cb.build());

  const mk = (geo, mat, n) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.frustumCulled = false;
    return im;
  };
  const links = mk(linkGeo, mats.link, nl);
  const pins = mk(pinGeo, mats.link, np);
  const deck = mk(deckGeo, mats.deck, Math.max(1, nd));
  const claws = mk(clawGeo, mats.link, 2 * nR);
  const meshes = [links, pins, deck, claws];

  const m = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const mPack = new THREE.Matrix4(), mT = new THREE.Matrix4();
  const sc = { w: 0, phi: 0, h: 0 };
  const col = new THREE.Color(), colA = new THREE.Color(), colB = new THREE.Color(), white = new THREE.Color(1.7, 1.7, 1.5);

  /** ブーム座標の局所行列 T(x, v, −u)·Rx(rho)·S(sx, 1, sz) に base を掛けて書く */
  function put(im, i, base, x, v, u, rho, sz, sx) {
    const c = Math.cos(rho), s = Math.sin(rho);
    m.set(sx || 1, 0, 0, x, 0, c, -s * sz, v, 0, s, c * sz, -u, 0, 0, 0, 1);
    im.setMatrixAt(i, m.premultiply(base));
  }
  const touch = () => { for (const im of meshes) im.instanceMatrix.needsUpdate = true; };

  function hideRound(r) {
    const n = R[r].n;
    for (let i = 0; i < 4 * n; i++) links.setMatrixAt(off.link[r] + i, zero);
    for (let i = 0; i < 2 * (3 * n + 2); i++) pins.setMatrixAt(off.pin[r] + i, zero);
    for (let i = 0; i < 2 * n; i++) deck.setMatrixAt(off.deck[r] + i, zero);
    claws.setMatrixAt(2 * r, zero); claws.setMatrixAt(2 * r + 1, zero);
    touch();
  }

  /**
   * ラウンド r の橋を書く。w = 1セルの長さ、base = ブームの行列（root 座標）、
   * clawK = ツメ 0（立っている）..1（倒れて掛かった）、pop = 出てくるときの大きさ 0..1。
   */
  function writeRound(r, w, base, clawK, pop) {
    const rr = R[r], n = rr.n;
    scissor(w, sc);
    if (pop < 0.999) {     // 固定ピンのまわりに縮める
      mT.makeTranslation(0, P.vR, -P.uA);
      mPack.copy(base).multiply(mT).multiply(m.makeScale(pop, pop, pop)).multiply(mT.makeTranslation(0, -P.vR, P.uA));
      base = mPack;
    }
    const psi = Math.acos(clamp(w / rr.w1, -1, 1));       // 蛇腹の床板の折れ角：伸び切ると 0（平ら）
    const pv = P.vR + rr.panel * Math.sin(psi) / 2;
    let li = off.link[r], pi = off.pin[r], di = off.deck[r];
    const xIn = P.trussX - P.linkT / 2, xOut = P.trussX + P.linkT / 2;
    for (let i = 0; i <= n; i++) {
      const u0 = P.uA + (i + 1) * w;
      for (const sx of [-1, 1]) {
        put(pins, pi++, base, sx * P.trussX, P.vR, u0, 0, 1);
        put(pins, pi++, base, sx * P.trussX, P.vR + sc.h, u0, 0, 1);
        if (i < n) {
          put(pins, pi++, base, sx * P.trussX, P.vR + sc.h / 2, u0 + w / 2, 0, 1);
          put(links, li++, base, sx * xIn, P.vR + sc.h / 2, u0 + w / 2, sc.phi, 1);
          put(links, li++, base, sx * xOut, P.vR + sc.h / 2, u0 + w / 2, -sc.phi, 1);
        }
      }
      if (i < n) {
        put(deck, di++, base, 0, pv, u0 + w * 0.25, psi, rr.panel);
        put(deck, di++, base, 0, pv, u0 + w * 0.75, -psi, rr.panel);
      }
    }
    const uTip = P.uA + (n + 1) * w, ca = (1 - clamp(clawK, 0, 1)) * Math.PI / 2;
    put(claws, 2 * r, base, -(P.trussX + 0.07), P.vR, uTip, ca, 1);
    put(claws, 2 * r + 1, base, P.trussX + 0.07, P.vR, uTip, ca, 1);
    touch();
  }

  /** 発射セル（機械側の X リンク）。wL = その長さ。free = 橋から離れている（先のピンも描く） */
  function writeLaunch(wL, base, free) {
    scissor(wL, sc);
    const xIn = P.trussX - P.linkT / 2, xOut = P.trussX + P.linkT / 2;
    let li = 0, pi = 0;
    for (const sx of [-1, 1]) {
      put(links, li++, base, sx * xIn, P.vR + sc.h / 2, P.uA + wL / 2, sc.phi, 1);
      put(links, li++, base, sx * xOut, P.vR + sc.h / 2, P.uA + wL / 2, -sc.phi, 1);
      put(pins, pi++, base, sx * P.trussX, P.vR, P.uA, 0, 1);
      put(pins, pi++, base, sx * (P.trussX + 0.045), P.vR + sc.h / 2, P.uA + wL / 2, 0, 1, 2.0);   // フォークを通る長いピン
      if (free) {
        put(pins, pi++, base, sx * P.trussX, P.vR, P.uA + wL, 0, 1);
        put(pins, pi++, base, sx * P.trussX, P.vR + sc.h, P.uA + wL, 0, 1);
      } else { pins.setMatrixAt(pi++, zero); pins.setMatrixAt(pi++, zero); }
    }
    touch();
    return sc.h;
  }

  /** 色。k = 0（つながる前）..1（つながった色）。波：先端から根元へ色が走る（wave 0..1.4）。 */
  // つながったあとの色：シェルが島の色（targets[].color）を渡していればそれ、無ければ表
  const doneCol = (r) => (R[r].target && R[r].target.color !== undefined ? R[r].target.color : BRIDGE_COL.rounds[r % BRIDGE_COL.rounds.length]);
  function colorRound(r, wave) {
    const n = R[r].n;
    colA.set(BRIDGE_COL.plain); colB.set(doneCol(r));
    const at = (cell) => {            // cell 0 = 根元 … n = 先端
      const f = 1 - cell / Math.max(1, n);
      const k = smooth((wave * 1.25 - f) / 0.18);
      const flash = Math.max(0, 1 - Math.abs(wave * 1.25 - f - 0.09) / 0.12);
      return { k, flash };
    };
    for (let i = 0; i < n; i++) {
      const { k, flash } = at(i + 0.5);
      col.copy(colA).lerp(colB, k).lerp(white, flash * 0.8);
      for (let j = 0; j < 4; j++) links.setColorAt(off.link[r] + 4 * i + j, col);
    }
    let pi = off.pin[r];
    for (let i = 0; i <= n; i++) {
      const { k, flash } = at(i);
      col.set(BRIDGE_COL.pin).lerp(colB.set(BRIDGE_COL.pinDone), k).lerp(white, flash);
      colB.set(doneCol(r));
      const cnt = i < n ? 6 : 4;
      for (let j = 0; j < cnt; j++) pins.setColorAt(pi++, col);
    }
    col.set(BRIDGE_COL.claw);
    claws.setColorAt(2 * r, col); claws.setColorAt(2 * r + 1, col);
    links.instanceColor.needsUpdate = pins.instanceColor.needsUpdate = claws.instanceColor.needsUpdate = true;
  }

  function resetColors() {
    col.set(BRIDGE_COL.launch);
    for (let i = 0; i < 4; i++) links.setColorAt(i, col);
    col.set(BRIDGE_COL.pin);
    for (let i = 0; i < 8; i++) pins.setColorAt(i, col);
    col.set(0xffffff);
    for (let i = 0; i < deck.count; i++) deck.setColorAt(i, col);
    deck.instanceColor.needsUpdate = true;
    for (let r = 0; r < nR; r++) colorRound(r, 0);
  }

  return {
    meshes, hideRound, writeRound, writeLaunch, colorRound, resetColors, touch,
    dispose() { for (const im of meshes) im.dispose(); },
  };
}
