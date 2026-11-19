// 材質・自作テクスチャと、動かない部品（台座、ゆりかごの固定部）。
// 同じ材質の部品は1メッシュに結合する（draw call を増やさない）。

const C = {
  steel: 0xdfe6f0, steelDark: 0x9aa6b8, cream: 0xfff4dc, pink: 0xff8fb1, hot: 0xff5fa2, red: 0xff5a6e,
  yellow: 0xffd84d, orange: 0xffa64d, mint: 0x7fe0c0, teal: 0x54c8d8, purple: 0xb08cff, blue: 0x4db8ff, white: 0xffffff,
};
export const COLORS = C;

// 塗装アトラス（Canvas 1枚）：白地＋ボタンの星。UV 矩形は [u0, v0, u1, v1]。
export const ATLAS = { star: [0, 0.5, 0.5, 1] };

export function makeMaterials(THREE, opts, P, keep) {
  const low = opts.tier === 'low';
  const texSize = Math.min(1024, (opts.budget && opts.budget.textureMaxSize) || 1024);
  const steelTex = opts.textures.get('brushed_steel', texSize);   // シェル所有（dispose しない）
  const woodTex = opts.textures.get('wood_planks', texSize);

  // ---- 塗装アトラス ----
  const S = low ? 128 : 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  {
    // ボタンの星
    const w = S / 2, cx = w / 2, cy = w / 2;
    g.fillStyle = '#ff5a6e'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#fff7d0'; g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 0.2 : 0.42) * w;
      g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }
  const atlas = keep(new THREE.CanvasTexture(cv));
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = Math.min(4, opts.maxAnisotropy || 1);

  // ---- 光る輪（次の操作部） ----
  const hv = document.createElement('canvas');
  hv.width = hv.height = 128;
  const h = hv.getContext('2d');
  const gr = h.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,244,200,0)'); gr.addColorStop(0.5, 'rgba(255,244,200,0.05)');
  gr.addColorStop(0.72, 'rgba(255,240,170,0.95)'); gr.addColorStop(0.86, 'rgba(255,236,160,0.25)'); gr.addColorStop(1, 'rgba(255,236,160,0)');
  h.fillStyle = gr; h.fillRect(0, 0, 128, 128);
  const haloTex = keep(new THREE.CanvasTexture(hv));
  haloTex.colorSpace = THREE.SRGBColorSpace;

  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const warm = 0xfff0b8;
  return {
    atlas, haloTex,
    steel: std({ map: steelTex, vertexColors: true, metalness: 0.25, roughness: 0.45, side: THREE.DoubleSide }),
    wood: std({ map: woodTex, vertexColors: true, metalness: 0, roughness: 0.8 }),
    paint: std({ map: atlas, vertexColors: true, metalness: 0.05, roughness: 0.5, side: THREE.DoubleSide }),
    spring: std({ color: 0xffcf3a, metalness: 0.0, roughness: 0.3, emissive: 0xffb020, emissiveIntensity: 0.12 }),
    grip: std({ color: C.blue, metalness: 0.05, roughness: 0.35, emissive: warm, emissiveIntensity: 0 }),
    button: std({ map: atlas, vertexColors: true, metalness: 0.05, roughness: 0.4, emissive: warm, emissiveIntensity: 0 }),
    pawl: std({ color: C.hot, metalness: 0.15, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 }),
    halo: keep(new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })),
    hit: keep(new THREE.MeshBasicMaterial({ visible: false })),
  };
}

/** 台座と、台に固定された支え（root 座標）。 */
export function buildBase(K) {
  const { THREE, G, P, M, keep } = K;
  const { mat, prep, merge, box, cylZ, rod } = G;
  const D = P.deck;
  const px = P.pivot[0], py = P.pivot[1];
  const wood = [], steel = [], paint = [];
  const lenX = D.x1 - D.x0, lenZ = D.z1 - D.z0, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2;

  // --- 木の枠：そり2本 → 横木4本 → 板 planks 枚 ---
  const skidH = 0.16, crossH = D.top - D.plankT - skidH;
  for (const z of [D.z0 + 0.3, D.z1 - 0.3]) {
    wood.push(prep(box(lenX - 0.1, skidH, 0.2), { m: mat(cx, skidH / 2, z), uvMul: [3, 0.25], uvOff: [z, 0.1], color: 0xe8d2b0 }));
  }
  for (let i = 0; i < 4; i++) {
    const x = D.x0 + 0.2 + (lenX - 0.4) * i / 3;
    wood.push(prep(box(0.2, crossH, lenZ - 0.06), { m: mat(x, skidH + crossH / 2, cz), uvMul: [0.25, 2.2], uvOff: [0.3 * i, 0.5], color: 0xf2dcbc }));
  }
  const pw = lenZ / D.planks;
  for (let i = 0; i < D.planks; i++) {
    const z = D.z0 + pw * (i + 0.5);
    wood.push(prep(box(lenX, D.plankT, pw - 0.015), { m: mat(cx, D.top - D.plankT / 2, z), uvMul: [2.6, 0.34], uvOff: [0.37 * i, 0.17 * i], color: i % 2 ? 0xffffff : 0xf6ead8 }));
  }

  // --- 回転軸の支柱（-Z は台形の板、+Z は細い柱）---
  {
    const s = new THREE.Shape([
      new THREE.Vector2(-0.42, D.top), new THREE.Vector2(0.42, D.top), new THREE.Vector2(0.13, py + 0.02),
      new THREE.Vector2(-0.13, py + 0.02),
    ]);
    const hole = new THREE.Path([new THREE.Vector2(-0.16, D.top + 0.14), new THREE.Vector2(0.16, D.top + 0.14), new THREE.Vector2(0.05, py - 0.3), new THREE.Vector2(-0.05, py - 0.3)]);
    s.holes.push(hole);
    steel.push(prep(G.extrude(s, -0.62, -0.50).translate(px, 0, 0), { color: C.teal }));
    steel.push(prep(cylZ(0.14, 0.16, -0.64, 18).translate(px, py, 0), { color: C.steel }));
    steel.push(prep(box(0.16, py - D.top, P.zPost1 - P.zPost0), { m: mat(px, (py + D.top) / 2, (P.zPost0 + P.zPost1) / 2), color: C.teal }));
    steel.push(prep(cylZ(0.13, P.zPost1 - P.zPost0 + 0.04, P.zPost0 - 0.02, 18).translate(px, py, 0), { color: C.steel }));
    paint.push(prep(cylZ(0.09, 0.03, P.zPost1 + 0.02, 14).translate(px, py, 0), { flat: true, color: C.yellow }));
  }
  // --- ダイヤルの軸受け柱 ---
  {
    const [dx, dy] = P.dialCenter;
    const zp = P.dialZ - 0.22;
    steel.push(prep(box(0.12, dy - D.top, 0.12), { m: mat(dx, (dy + D.top) / 2, zp), color: C.teal }));
    steel.push(prep(cylZ(0.085, 0.18, zp - 0.09, 14).translate(dx, dy, 0), { color: C.steel }));
  }
  // --- 解放レバーの支点、ヨークの案内棒、ボタンの案内 ---
  {
    const [ex, ey] = P.releaseFulcrum;
    for (const z of [0.63, P.buttonPos[2] + 0.08]) steel.push(prep(box(0.1, ey - D.top + 0.05, 0.06), { m: mat(ex, (ey + D.top + 0.05) / 2, z), color: C.steelDark }));
    const zy = (P.zYoke0 + P.zYoke1) / 2;
    for (const s of [-1, 1]) steel.push(prep(rod([P.relRodX + s * P.yokeGuideOff, D.top, zy], [P.relRodX + s * P.yokeGuideOff, py - 0.14, zy], 0.015, 8), { color: C.steel }));
    const [bx, by, bz] = P.buttonPos;
    const zl = bz + 0.26;                       // 片持ちの案内（内側は解放レバーが通るので脚は外側だけ）
    const yg = by - 0.12;
    steel.push(prep(box(0.07, yg - D.top, 0.07), { m: mat(bx, (yg + D.top) / 2, zl), color: C.steelDark }));
    steel.push(prep(box(0.07, 0.045, zl - bz), { m: mat(bx, yg, (zl + bz) / 2), color: C.steelDark }));
    steel.push(prep(new THREE.TorusGeometry(0.065, 0.02, 6, 14).rotateX(Math.PI / 2), { m: mat(bx, yg, bz), color: C.steelDark }));
  }
  // --- かざり：台の角のまるい当て ---
  for (const [x, z] of [[D.x0, D.z0], [D.x0, D.z1], [D.x1, D.z0], [D.x1, D.z1]]) {
    paint.push(prep(new THREE.CylinderGeometry(0.11, 0.11, D.plankT + 0.03, 12), { m: mat(x + (x < cx ? 0.09 : -0.09), D.top - D.plankT / 2 + 0.012, z + (z < cz ? 0.09 : -0.09)), flat: true, color: C.pink }));
  }

  const g = new THREE.Group();
  g.name = 'base';
  g.add(new THREE.Mesh(keep(merge(wood)), M.wood), new THREE.Mesh(keep(merge(steel)), M.steel), new THREE.Mesh(keep(merge(paint)), M.paint));
  return g;
}

/** ゆりかごに固定された部品（ゆりかご座標。筒の軸は v = vAxis）。 */
export function buildCradle(K, aux) {
  const { THREE, G, P, M, keep } = K;
  const { mat, prep, merge, box, cylZ, cylX, rod } = G;
  const rad = Math.PI / 180;
  const steel = [], paint = [];
  const rIn = P.troughIn, rOut = rIn + P.troughWall, vA = P.vAxis;
  const seg = (n) => Math.max(6, Math.round(n * P.seg));

  // --- とい（下 110°）、尾栓、筒先の輪 ---
  steel.push(prep(G.trough(rIn, rOut, P.troughArcDeg[0] * rad, P.troughArcDeg[1] * rad, P.uBreech - 0.05, P.uMuzzleEnd, seg(12)).translate(0, vA, 0), { color: C.mint }));
  steel.push(prep(cylX(rOut, 0.05, P.uBreech - 0.05, seg(24)).translate(0, vA, 0), { color: C.teal }));
  paint.push(prep(G.trough(rIn, rOut + 0.025, 0, Math.PI * 2, P.uMuzzleEnd - 0.07, P.uMuzzleEnd, seg(28)).translate(0, vA, 0), { flat: true, color: C.pink }));
  paint.push(prep(G.trough(rOut - 0.005, rOut + 0.02, 0, Math.PI * 2, P.uBreech - 0.06, P.uBreech + 0.02, seg(28)).translate(0, vA, 0), { flat: true, color: C.pink }));

  // --- くら（筒を回転軸に載せる2枚の板）と、通し軸 ---
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape([
      new THREE.Vector2(-0.34, vA - 0.2), new THREE.Vector2(-0.12, -0.13), new THREE.Vector2(0.12, -0.13), new THREE.Vector2(0.34, vA - 0.2),
    ]);
    sh.holes.push(new THREE.Path([new THREE.Vector2(-0.16, vA - 0.27), new THREE.Vector2(0.16, vA - 0.27), new THREE.Vector2(0.07, 0.14), new THREE.Vector2(-0.07, 0.14)]));
    steel.push(prep(G.extrude(sh, s * 0.3 - 0.025, s * 0.3 + 0.025), { color: C.teal }));
  }
  steel.push(prep(cylZ(0.06, P.zPost1 + 0.02 + 0.64, -0.64, 12), { color: C.steel }));

  // --- 仰角のセクター歯車（ダイヤルのピニオンと噛む）---
  const a0 = (P.dialMeshDeg - P.thetaMaxDeg - P.sectorMarginDeg) * rad;
  const a1 = (P.dialMeshDeg - P.thetaMinDeg + P.sectorMarginDeg) * rad;
  const phase = (P.dialMeshDeg - P.thetaDefaultDeg) * rad;   // 既定の仰角で、噛み合い点に歯の中心
  steel.push(prep(G.sectorGear(P.module, P.zSector, P.pressureDeg, P.zSector0, P.zSector1, a0, a1, 0.14, phase), { color: C.orange }));
  steel.push(prep(cylZ(0.17, P.zSector1 - 0.325, 0.325, 16), { color: C.orange }));

  // --- 力の目盛りの矢印（ラックの色の帯を指す。u = 0 に固定）---
  {
    const zt = P.zRack1 + 0.012;
    const tri = new THREE.Shape([new THREE.Vector2(0, P.rackBodyTop - 0.035), new THREE.Vector2(0.07, P.rackBodyTop + 0.1), new THREE.Vector2(-0.07, P.rackBodyTop + 0.1)]);
    paint.push(prep(G.extrude(tri, zt, zt + 0.02), { flat: true, color: C.red }));
    steel.push(prep(rod([0, P.rackBodyTop + 0.08, zt + 0.01], [0, vA - 0.2, 0.33], 0.018, 6), { color: C.steelDark }));
  }

  // --- 爪の支点（ピニオンの歯先より外）と、爪ばねの受け ---
  const [qx, qy] = P.pawlQ;
  steel.push(prep(cylZ(0.03, P.zRatchet1 + 0.005 - 0.28, 0.28, 10).translate(qx, qy, 0), { color: C.steel }));
  steel.push(prep(rod([qx, qy, 0.3], [-0.2, 0.2, 0.3], 0.035, 6), { color: C.teal }));
  const [sx, sy] = aux.pawlSpringSeat;
  steel.push(prep(box(0.07, 0.07, P.zRatchet1 - 0.28), { m: mat(sx, sy, (P.zRatchet1 + 0.28) / 2, 0, 0, aux.pawlSpringAngle), color: C.teal }));
  steel.push(prep(rod([qx, qy, 0.3], [sx, sy, 0.3], 0.025, 6), { color: C.teal }));

  // --- 球の供給：2本レール → 角 → 塔（かご）→ じょうご ---
  const dq = P.chuteDir, nq = P.chuteNrm, sM = P.sMuzzle;
  const at = (q, n, du) => [sM + du, vA + q * dq[0] + n * nq[0], q * dq[1] + n * nq[1]];
  const hRail = Math.sqrt(Math.max(1e-4, Math.pow(P.R + P.railR, 2) - P.railOff * P.railOff));
  const under = (du, k) => [sM + du, vA - rOut * 0.75, -rOut * k];
  for (const s of [-1, 1]) {
    steel.push(prep(rod(at(P.R + 0.02, -hRail, s * P.railOff), at(P.qB + 0.1, -hRail, s * P.railOff), P.railR, 8), { color: C.steel }));
    steel.push(prep(rod(at(P.qGate - 0.14, -hRail, s * P.railOff), under(s * P.railOff, 0.6), 0.018, 6), { color: C.steelDark }));
  }
  const vB = vA + P.qB * dq[0], zB = P.qB * dq[1];
  const vTop = vB + P.ballGap + 0.35;
  const rc = P.R + 0.03;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const du = rc * Math.cos(a), dz = rc * Math.sin(a);
    const v0 = dz > 0 ? vB + P.R + 0.12 : vB - 0.22;      // +z 側は球の出口をあける
    steel.push(prep(rod([sM + du, v0, zB + dz], [sM + du, vTop, zB + dz], 0.02, 6), { color: C.steel }));
  }
  for (const v of [vB + P.R + 0.12, vTop]) {
    paint.push(prep(new THREE.TorusGeometry(rc + 0.02, 0.022, 6, seg(20)).rotateX(Math.PI / 2), { m: mat(sM, v, zB), flat: true, color: C.purple }));
  }
  paint.push(prep(new THREE.SphereGeometry(rc + 0.015, seg(14), seg(7), Math.PI, Math.PI, Math.PI / 2, Math.PI / 2), { m: mat(sM, vB, zB), flat: true, color: C.purple }));
  paint.push(prep(new THREE.CylinderGeometry(P.funnelR, rc + 0.02, 0.22, seg(20), 1, true), { m: mat(sM, vTop + 0.11, zB), flat: true, color: C.yellow }));
  // 塔とカム軸の支え（といの下から）
  for (const s of [-1, 1]) {
    steel.push(prep(rod([sM + s * 0.2, vB - 0.2, zB + 0.08], under(s * 0.36, 0.6), 0.022, 6), { color: C.steelDark }));
    const cs = aux.camShaft;
    steel.push(prep(rod([sM + s * 0.24, cs[0], cs[1]], under(s * 0.26, 0.6), 0.018, 6), { color: C.steelDark }));
  }

  const g = new THREE.Group();
  g.name = 'cradleFixed';
  g.add(new THREE.Mesh(keep(merge(steel)), M.steel), new THREE.Mesh(keep(merge(paint)), M.paint));
  return g;
}
