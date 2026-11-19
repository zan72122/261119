// 周辺の場面（遠景・地面・飾り）。低ポリ＋写真風テクスチャ（512² まで）。
// 遠景は「固定カメラから見える側」だけ作り、資源を削る。
import { WORLD } from './config.js';
import { drawRadial, merge, paint, rng } from './util.js';

export function buildEnvironment(THREE, tm, tier) {
  const root = new THREE.Group();
  root.name = 'environment';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // ---- 空（円筒の内側に写真。キャップなし：カメラは上を向かない） ----
  {
    const tex = tm.get('sky_clouds', 512, { repeat: [5, 1], mirror: true });
    const geo = keep(new THREE.CylinderGeometry(150, 150, 170, 20, 1, true));
    const mat = keep(new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(10, 73, 0);
    m.renderOrder = -10;
    m.name = 'sky';
    root.add(m);
  }

  // ---- 遠い丘（写真の帯。上端はアルファで空に溶かす） ----
  {
    const tex = tm.get('far_hills', 512, { repeat: [4, 1], mirror: true });
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const alpha = tm.canvas('hills-alpha', 4, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0.0, '#000'); gr.addColorStop(0.28, '#000');
      gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#fff');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { srgb: false });
    const geo = keep(new THREE.CylinderGeometry(120, 120, 30, 24, 1, true));
    const mat = keep(new THREE.MeshBasicMaterial({
      map: tex, alphaMap: alpha, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false,
      color: 0xf2f6f2,
    }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(10, 11, 0);
    m.renderOrder = -9;
    m.name = 'hills';
    root.add(m);
  }

  // ---- 地面（草の写真をタイル） ----
  {
    const tex = tm.get('meadow_grass', 512, { repeat: [56, 56] });
    const geo = keep(new THREE.CircleGeometry(112, 28));
    geo.rotateX(-Math.PI / 2);
    const mat = keep(new THREE.MeshLambertMaterial({ map: tex, color: 0xe8f2d8 }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(10, 0, 0);
    m.receiveShadow = tier.shadow > 0;
    m.name = 'ground';
    root.add(m);
  }

  // ---- 発射台の下の土（疑似の踏み固めた地面） ----
  {
    const tex = tm.canvas('dirt', 128, 128, (g, w, h) => drawRadial(g, w, h, [
      [0, 'rgba(196,160,110,0.95)'], [0.6, 'rgba(190,155,105,0.75)'], [1, 'rgba(190,155,105,0)'],
    ]));
    const geo = keep(new THREE.PlaneGeometry(8.5, 6.5));
    geo.rotateX(-Math.PI / 2);
    const mat = keep(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(-0.2, 0.01, 0);
    m.receiveShadow = tier.shadow > 0;
    m.name = 'dirt';
    root.add(m);
  }

  // ---- レール（受け皿とキャッチャーが走る） ----
  {
    const { x0, x1 } = WORLD.rail;
    const len = x1 - x0;
    const steel = tm.get('brushed_steel', 512, { repeat: [12, 1] });
    const geoR = merge(THREE, [
      new THREE.BoxGeometry(len, 0.1, 0.09).translate(x0 + len / 2, 0.17, 0.42),
      new THREE.BoxGeometry(len, 0.1, 0.09).translate(x0 + len / 2, 0.17, -0.42),
      new THREE.BoxGeometry(0.2, 0.3, 1.2).translate(x0 - 0.1, 0.15, 0),
      new THREE.BoxGeometry(0.2, 0.3, 1.2).translate(x1 + 0.1, 0.15, 0),
    ]);
    keep(geoR);
    const matR = keep(new THREE.MeshLambertMaterial({ map: steel, color: 0xd8dce6 }));
    const rails = new THREE.Mesh(geoR, matR);
    rails.name = 'rails';
    root.add(rails);
    const wood = tm.get('wood_planks', 512);
    const geoS = keep(new THREE.BoxGeometry(0.28, 0.12, 1.3));
    const matS = keep(new THREE.MeshLambertMaterial({ map: wood, color: 0xd9b48a }));
    const n = Math.floor(len / 0.9) + 1;
    const sleepers = new THREE.InstancedMesh(geoS, matS, n);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { mtx.makeTranslation(x0 + i * 0.9, 0.06, 0); sleepers.setMatrixAt(i, mtx); }
    sleepers.name = 'sleepers';
    root.add(sleepers);
  }

  // ---- 木（幹＋丸い樹冠を結合し、InstancedMesh で並べる） ----
  const r = rng(28);
  {
    const trunk = paint(THREE, new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6).translate(0, 0.8, 0), 0x8a5a3b);
    const crownA = paint(THREE, new THREE.IcosahedronGeometry(1.25, 0).translate(0, 2.3, 0), 0x5fae4a);
    const crownB = paint(THREE, new THREE.IcosahedronGeometry(0.9, 0).translate(0.45, 3.0, 0.1), 0x74c35a);
    const geo = keep(merge(THREE, [trunk, crownA, crownB]));
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const x = -14 + r() * 52;
      const z = -9 - r() * 30;
      spots.push([x, z, 0.8 + r() * 0.9]);
    }
    // 両脇（手前の左右は空ける）
    for (let i = 0; i < 8; i++) spots.push([-12 - r() * 8, -2 + r() * 10, 0.9 + r() * 0.6]);
    for (let i = 0; i < 6; i++) spots.push([33 + r() * 8, -4 + r() * 10, 0.9 + r() * 0.6]);
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
    const c = new THREE.Color();
    spots.forEach(([x, z, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      s.set(k, k * (0.9 + r() * 0.3), k);
      m.compose(new THREE.Vector3(x, 0, z), q, s);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.setHSL(0.25 + r() * 0.08, 0.35, 0.75 + r() * 0.25));
    });
    inst.name = 'trees';
    root.add(inst);
  }

  // ---- しげみ ----
  {
    const geo = keep(paint(THREE, new THREE.IcosahedronGeometry(0.7, 1).scale(1.3, 0.75, 1), 0x6cbf55));
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const n = 26;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(); const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = -8 + r() * 42;
      const z = -4.5 - r() * 5;
      const k = 0.6 + r() * 0.8;
      m.makeScale(k, k, k).setPosition(x, 0.15 * k, z);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.setHSL(0.27 + r() * 0.06, 0.4, 0.7 + r() * 0.3));
    }
    inst.name = 'bushes';
    root.add(inst);
  }

  // ---- 花（手前の草むらだけ。小さな低ポリ） ----
  {
    const petals = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      petals.push(paint(THREE, new THREE.CircleGeometry(0.07, 5).rotateX(-Math.PI / 2)
        .translate(Math.cos(a) * 0.07, 0.3, Math.sin(a) * 0.07), 0xffffff));
    }
    const center = paint(THREE, new THREE.CircleGeometry(0.05, 5).rotateX(-Math.PI / 2).translate(0, 0.305, 0), 0xffd84a);
    const stem = paint(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 3, 1, true).translate(0, 0.15, 0), 0x3f8a3a);
    const geo = keep(merge(THREE, [...petals, center, stem]));
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const n = 70;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(); const c = new THREE.Color();
    const cols = [0xffb3d1, 0xffffff, 0xfff07a, 0xc9b3ff, 0xffc49a];
    for (let i = 0; i < n; i++) {
      let x, z;
      do { x = -9 + r() * 30; z = -3.5 + r() * 9; } while ((z > -2.2 && z < 2.2 && x > -3 && x < 29) || (x > -3.5 && x < 3 && z < 3.5));
      const k = 0.9 + r() * 0.8;
      m.makeRotationY(r() * 6.28).scale(new THREE.Vector3(k, k, k)).setPosition(x, 0, z);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.set(cols[i % cols.length]));
    }
    inst.name = 'flowers';
    root.add(inst);
  }

  // ---- 旗の列（後ろの柵。距離感の手がかり） ----
  {
    const parts = [];
    const cols = [0xff8fb1, 0xffd166, 0x7fd8a6, 0x7cc4ff, 0xc3a6ff];
    const z = -6.5;
    const posts = [];
    for (let x = -6; x <= 32; x += 5) posts.push(x);
    for (const x of posts) parts.push(paint(THREE, new THREE.CylinderGeometry(0.06, 0.08, 3.0, 5).translate(x, 1.5, z), 0xf4efe6));
    let ci = 0;
    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i], b = posts[i + 1];
      const nflag = 7;
      for (let k = 0; k < nflag; k++) {
        const t0 = (k + 0.15) / nflag, t1 = (k + 0.85) / nflag, tm_ = (k + 0.5) / nflag;
        const sag = (t) => 2.9 - 0.55 * 4 * t * (1 - t);
        const g = new THREE.BufferGeometry();
        const p = new Float32Array([
          a + (b - a) * t0, sag(t0), z,
          a + (b - a) * t1, sag(t1), z,
          a + (b - a) * tm_, sag(tm_) - 0.42, z,
        ]);
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
        parts.push(paint(THREE, g, cols[ci++ % cols.length]));
      }
    }
    // 位置と法線と色だけそろえる
    for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    const geo = keep(merge(THREE, parts));
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const m = new THREE.Mesh(geo, mat);
    m.name = 'bunting';
    root.add(m);
  }

  return {
    root,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

/** 疑似影（丸い影）。SubtractiveBlending: dst*(1-src) で地面を暗くする。1 draw call。 */
export class BlobShadows {
  constructor(THREE, tm, max = 24) {
    this.THREE = THREE;
    const tex = tm.canvas('blob', 64, 64, (g, w, h) => drawRadial(g, w, h, [
      [0, 'rgb(118,112,118)'], [0.55, 'rgb(64,60,64)'], [1, 'rgb(0,0,0)'],
    ]), { srgb: false });
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.SubtractiveBlending, premultipliedAlpha: true, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.name = 'blobShadows';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.max = max;
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    // 色の属性を先に作る
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
  }
  begin() { this.n = 0; }
  /** strength 0..1（0で消える） */
  add(x, z, radius, strength = 1, y = 0.02) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.m.makeScale(radius * 2, 1, radius * 2).setPosition(x, y, z);
    this.mesh.setMatrixAt(i, this.m);
    const k = Math.max(0, Math.min(1, strength));
    this.mesh.setColorAt(i, this.c.setRGB(k, k, k));
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
