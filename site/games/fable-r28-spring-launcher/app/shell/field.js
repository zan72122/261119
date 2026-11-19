// 発射場の周辺の仕掛け：飛ぶ球（解析的な放物線）、風船の回転リング、跳ねる受け皿、
// 追いかけるキャッチャー、狙いの点線、きらきら、紙吹雪。物理エンジンは使わない。
import { WORLD } from './config.js';
import { clamp, dampK, drawRadial, merge, paint } from './util.js';

const G = WORLD.gravity;
const R = WORLD.ballRadius;

/** 放物線の位置: p0 + v0 t + 1/2 g t^2 */
function posAt(out, p0, v0, t) {
  out.set(p0.x + v0.x * t, p0.y + v0.y * t - 0.5 * G * t * t, p0.z + v0.z * t);
  return out;
}
/** 下りで高さ Y を通る時刻（届かなければ頂点の時刻） */
function timeDown(p0y, v0y, Y) {
  const disc = v0y * v0y + 2 * G * (p0y - Y);
  if (disc <= 0) return Math.max(0, v0y / G);
  return (v0y + Math.sqrt(disc)) / G;
}

/** 発射から着地までの全予定（解析） */
export function planShot(THREE, origin, velocity) {
  const p0 = origin.clone();
  const v0 = velocity.clone();
  const tA = Math.max(0, v0.y / G);
  const apex = posAt(new THREE.Vector3(), p0, v0, tA);
  const pad = WORLD.pad;
  const tP = timeDown(p0.y, v0.y, pad.top + R);
  const padHit = posAt(new THREE.Vector3(), p0, v0, tP);
  const vyP = v0.y - G * tP;
  const v1 = new THREE.Vector3(v0.x * pad.keepVx, Math.abs(vyP) * pad.restitution, v0.z * pad.keepVx);
  const tC = timeDown(padHit.y, v1.y, WORLD.catcher.rim + R * 0.2);
  const catchHit = posAt(new THREE.Vector3(), padHit, v1, tC);
  return { p0, v0, tA, apex, tP, padHit, v1, tC, catchHit };
}

/** 1次元／2次元の追従（締め切りがあれば間に合う速さで動く） */
class Tracker {
  constructor(x, min, max) { this.x = x; this.v = 0; this.min = min; this.max = max; }
  step(target, tRemain, dt, cruise) {
    target = clamp(target, this.min, this.max);
    const d = target - this.x;
    let speed = cruise;
    if (tRemain != null) speed = Math.max(cruise * 0.6, Math.abs(d) / Math.max(tRemain - 0.12, 0.05) * 1.15);
    speed = Math.min(speed, 45);
    const vDes = Math.sign(d) * Math.min(speed, Math.abs(d) * 6);
    this.v += (vDes - this.v) * Math.min(1, dt * (tRemain != null ? 20 : 7));
    this.x = clamp(this.x + this.v * dt, this.min, this.max);
    return this.x;
  }
}

export class Field {
  constructor(THREE, tm, audio, tier, blobs) {
    this.THREE = THREE;
    this.tm = tm;
    this.audio = audio;
    this.blobs = blobs;
    this.root = new THREE.Group();
    this.root.name = 'field';
    this.disposables = [];
    this.balls = [];          // 飛んでいる球
    this.pile = [];           // キャッチャーの中の球
    this.time = 0;
    this.stats = { launched: 0, ringPasses: 0, bounces: 0, caught: 0, celebrations: 0, missed: 0 };
    this.v = new THREE.Vector3();
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s3 = new THREE.Vector3();
    this.col = new THREE.Color();

    this._buildBalls();
    this._buildRing();
    this._buildPad();
    this._buildCatcher();
    this._buildAimDots();
    this._buildSparkles();
    this._buildConfetti();

    this.ringT = new Tracker(4, 2.5, 10.5); this.ringY = new Tracker(3.5, 2.2, 8.0);
    this.padT = new Tracker(8, WORLD.pad.xMin, WORLD.pad.xMax);
    this.catT = new Tracker(12, WORLD.catcher.xMin, WORLD.catcher.xMax);
    this.aim = null;
    this.aimVisible = 0;
    this.celebrate = 0;
  }

  keep(x) { this.disposables.push(x); return x; }

  // ------------------------------------------------------------------ 球
  _buildBalls() {
    const THREE = this.THREE;
    // 球の模様（白地に淡い帯。色は instanceColor / material.color で掛ける）
    this.ballTex = this.tm.canvas('ball-stripes', 128, 64, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#f3f0ea' : '#ffffff';
        g.fillRect((i * w) / 4, 0, w / 4, h);
      }
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(0, h * 0.44, w, h * 0.12);
      g.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i < 4; i++) g.fillRect((i * w) / 4 - 1, 0, 2, h);
    });
    this.ballGeo = this.keep(new THREE.SphereGeometry(R, 20, 14));
    this.ballMat = this.keep(new THREE.MeshStandardMaterial({ map: this.ballTex, roughness: 0.55, metalness: 0 }));
    const max = WORLD.maxBalls * 2;
    this.ballMesh = new THREE.InstancedMesh(this.ballGeo, this.ballMat, max);
    this.ballMesh.name = 'balls';
    this.ballMesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.ballMesh.setColorAt(i, this.col.set(0xffffff));
    this.ballMesh.count = 0;
    this.root.add(this.ballMesh);
    this.ballMats = new Map();
  }

  /** hero が装填中の球を描くためのメッシュ（形と材質は shell と共有。dispose しない） */
  createBallMesh(colorIndex) {
    const THREE = this.THREE;
    const ci = ((colorIndex % WORLD.ballColors.length) + WORLD.ballColors.length) % WORLD.ballColors.length;
    let mat = this.ballMats.get(ci);
    if (!mat) {
      mat = this.keep(this.ballMat.clone());
      mat.color.set(WORLD.ballColors[ci]);
      this.ballMats.set(ci, mat);
    }
    const m = new THREE.Mesh(this.ballGeo, mat);
    m.name = 'loadedBall';
    m.userData.shellOwned = true;
    return m;
  }
  setBallMeshColor(mesh, colorIndex) {
    const tmp = this.createBallMesh(colorIndex);
    mesh.material = tmp.material;
  }

  // ------------------------------------------------------------------ 風船＋回転リング
  _buildRing() {
    const THREE = this.THREE;
    const { inner, tube } = WORLD.ring;
    const g = new THREE.Group(); g.name = 'ringBalloon';
    // リング：8色の帯＋電球（頂点色で1メッシュ）
    const ringR = inner + tube;
    const segs = 8, perSeg = 6;
    const cols = [0xff7aa8, 0xffb36b, 0xffe26b, 0x7de0a0, 0x6cc8ff, 0x9c8cff, 0xff8fe0, 0xfff3c4];
    const parts = [];
    for (let i = 0; i < segs; i++) {
      const arc = (Math.PI * 2) / segs;
      const t = new THREE.TorusGeometry(ringR, tube, 8, perSeg, arc).rotateZ(i * arc);
      parts.push(paint(THREE, t, cols[i]));
      const a = (i + 0.5) * arc;
      parts.push(paint(THREE, new THREE.IcosahedronGeometry(0.075, 0)
        .translate(Math.cos(a) * ringR, Math.sin(a) * ringR, tube * 0.9), 0xffffff));
    }
    for (const p of parts) { p.deleteAttribute('uv'); }
    const ringGeo = this.keep(merge(THREE, parts));
    this.ringMat = this.keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 }));
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.y = Math.PI / 2;  // 輪の面を YZ に（軸は飛ぶ向き +X）
    this.ringSpin = new THREE.Group();
    this.ringSpin.add(this.ring);
    g.add(this.ringSpin);
    // 上のローラー台（ここに綱がつながる。リングはローラーの上で回る）
    const holderGeo = this.keep(merge(THREE, [
      paint(THREE, new THREE.BoxGeometry(0.12, 0.12, 1.1).translate(0, ringR + tube + 0.16, 0), 0xb0b8c8),
      paint(THREE, new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateZ(Math.PI / 2).translate(0, ringR + tube + 0.04, 0.35), 0x7a8494),
      paint(THREE, new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateZ(Math.PI / 2).translate(0, ringR + tube + 0.04, -0.35), 0x7a8494),
    ].map((x) => { x.deleteAttribute('uv'); return x; })));
    const holderMat = this.keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    g.add(new THREE.Mesh(holderGeo, holderMat));
    // 風船（かお付き）
    const top = ringR + tube + 0.22;
    const bal = [];
    bal.push(paint(THREE, new THREE.SphereGeometry(1.0, 16, 12).scale(1, 1.15, 1).translate(0, top + 2.4, 0), 0xffa3c4));
    bal.push(paint(THREE, new THREE.ConeGeometry(0.16, 0.25, 8).rotateX(Math.PI).translate(0, top + 1.2, 0), 0xff8fb5));
    for (const sx of [-0.32, 0.32]) {
      bal.push(paint(THREE, new THREE.SphereGeometry(0.11, 8, 6).translate(sx, top + 2.55, 0.93), 0x3a2a3a));
      bal.push(paint(THREE, new THREE.SphereGeometry(0.035, 6, 4).translate(sx + 0.03, top + 2.6, 1.03), 0xffffff));
      bal.push(paint(THREE, new THREE.SphereGeometry(0.13, 8, 6).scale(1, 0.6, 0.4).translate(sx * 1.6, top + 2.25, 0.88), 0xff6f9a));
    }
    bal.push(paint(THREE, new THREE.TorusGeometry(0.2, 0.035, 6, 10, Math.PI).rotateZ(Math.PI).translate(0, top + 2.3, 0.95), 0x3a2a3a));
    // 綱
    for (const sz of [-0.5, 0.5]) {
      const len = 1.25;
      const c = new THREE.CylinderGeometry(0.015, 0.015, len, 4, 1, true);
      c.rotateX(Math.atan2(-sz, len) * 0.9);
      c.translate(sz * 0.5, top + len / 2, 0);
      bal.push(paint(THREE, c, 0xf7f2e8));
    }
    for (const p of bal) p.deleteAttribute('uv');
    const balGeo = this.keep(merge(THREE, bal));
    this.balloonMat = this.keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.balloon = new THREE.Mesh(balGeo, this.balloonMat);
    g.add(this.balloon);
    this.ringGroup = g;
    this.ringFlash = 0;
    this.ringAngle = 0;
    this.root.add(g);
  }

  // ------------------------------------------------------------------ 跳ねる受け皿
  _buildPad() {
    const THREE = this.THREE;
    const P = WORLD.pad;
    const g = new THREE.Group(); g.name = 'bouncePad';
    const steel = this.tm.get('brushed_steel', 512);
    const wood = this.tm.get('wood_planks', 512);
    // 台車
    const base = new THREE.Mesh(this.keep(new THREE.BoxGeometry(1.5, 0.18, 1.2).translate(0, 0.36, 0)),
      this.keep(new THREE.MeshLambertMaterial({ map: wood, color: 0xe0c098 })));
    g.add(base);
    // 車輪（4つ、レールの上。x の移動量 / 半径 で回る）
    this.wheelGeo = this.keep(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12).rotateX(Math.PI / 2));
    this.wheelMat = this.keep(new THREE.MeshLambertMaterial({ map: steel, color: 0x9aa3b5 }));
    this.padWheels = new THREE.InstancedMesh(this.wheelGeo, this.wheelMat, 4);
    g.add(this.padWheels);
    // 脚のばね（コイル風：細いトーラスを重ねて結合）
    const coil = [];
    for (let k = 0; k < 5; k++) coil.push(new THREE.TorusGeometry(0.09, 0.022, 5, 10).rotateX(Math.PI / 2).translate(0, 0.47 + k * 0.08, 0));
    for (const c of coil) c.deleteAttribute('uv');
    const coilGeo = this.keep(merge(THREE, coil));
    const coilMat = this.keep(new THREE.MeshLambertMaterial({ color: 0xc8ced8 }));
    this.padCoils = new THREE.InstancedMesh(coilGeo, coilMat, 4);
    const m = new THREE.Matrix4();
    [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]].forEach(([x, z], i) => {
      m.makeTranslation(x * 0.95, 0, z * 0.95); this.padCoils.setMatrixAt(i, m);
    });
    g.add(this.padCoils);
    // 枠と膜
    this.padTop = new THREE.Group();
    const frame = new THREE.Mesh(this.keep(new THREE.TorusGeometry(P.radius, 0.07, 6, 28).rotateX(Math.PI / 2)),
      this.keep(new THREE.MeshLambertMaterial({ color: 0x6cc8ff })));
    this.padTop.add(frame);
    const memTex = this.tm.canvas('pad-membrane', 256, 16, (c, w, h) => {
      const cols = ['#ffd1e3', '#fff3b0', '#c9f2dc', '#cfe6ff'];
      for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 4]; c.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
    });
    // 円錐（頂点が下）を y 方向につぶした膜。押されると y スケールで凹む。
    this.membrane = new THREE.Mesh(this.keep(new THREE.ConeGeometry(P.radius - 0.02, 1, 24, 1, true).rotateX(Math.PI).translate(0, -0.5, 0)),
      this.keep(new THREE.MeshLambertMaterial({ map: memTex, side: THREE.DoubleSide })));
    this.membrane.scale.y = 0.02;
    this.padTop.add(this.membrane);
    this.padTop.position.y = P.top;
    g.add(this.padTop);
    this.padGroup = g;
    this.padDip = 0; this.padDipV = 0;
    this.root.add(g);
  }

  // ------------------------------------------------------------------ キャッチャー（顔つきのバケツ）
  _buildCatcher() {
    const THREE = this.THREE;
    const C = WORLD.catcher;
    const g = new THREE.Group(); g.name = 'catcher';
    const wood = this.tm.get('wood_planks', 512);
    const base = new THREE.Mesh(this.keep(new THREE.BoxGeometry(1.7, 0.2, 1.3).translate(0, 0.37, 0)),
      this.keep(new THREE.MeshLambertMaterial({ map: wood, color: 0xe0c098 })));
    g.add(base);
    this.catWheels = new THREE.InstancedMesh(this.wheelGeo, this.wheelMat, 4);
    g.add(this.catWheels);
    // バケツ：外側と内側の輪郭を Lathe で（厚みあり）
    const prof = [];
    const rTop = C.radius + 0.12, rBot = 0.72, yBot = 0.5, yTop = C.rim;
    prof.push(new THREE.Vector2(0.001, yBot));
    prof.push(new THREE.Vector2(rBot, yBot));
    prof.push(new THREE.Vector2(rTop, yTop));
    prof.push(new THREE.Vector2(rTop + 0.06, yTop + 0.05));
    prof.push(new THREE.Vector2(rTop - 0.08, yTop + 0.05));
    prof.push(new THREE.Vector2(rBot - 0.08, yBot + 0.1));
    prof.push(new THREE.Vector2(0.001, yBot + 0.1));
    const bucketTex = this.tm.canvas('bucket', 256, 32, (c, w, h) => {
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#ffb3c8' : '#ffe1ea'; c.fillRect((i * w) / 12, 0, w / 12 + 1, h); }
    });
    this.bucket = new THREE.Mesh(this.keep(new THREE.LatheGeometry(prof, 28)),
      this.keep(new THREE.MeshLambertMaterial({ map: bucketTex, side: THREE.DoubleSide })));
    // 顔（カメラ側 +Z に向ける）
    const face = [];
    const fy = 0.86, fz = 0.97;
    for (const sx of [-0.3, 0.3]) {
      face.push(paint(THREE, new THREE.SphereGeometry(0.2, 12, 8).scale(1, 1, 0.5).translate(sx, fy, fz), 0xffffff));
    }
    face.push(paint(THREE, new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI).rotateZ(Math.PI).translate(0, 0.68, fz + 0.02), 0x5a3040));
    for (const sx of [-0.5, 0.5]) face.push(paint(THREE, new THREE.SphereGeometry(0.1, 8, 6).scale(1, 0.6, 0.3).translate(sx, 0.7, fz - 0.03), 0xff7f9f));
    for (const p of face) p.deleteAttribute('uv');
    const faceMat = this.keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const faceMesh = new THREE.Mesh(this.keep(merge(THREE, face)), faceMat);
    // 黒目（球を目で追う）
    const pupilGeo = this.keep(new THREE.SphereGeometry(0.09, 10, 8));
    const pupilMat = this.keep(new THREE.MeshBasicMaterial({ color: 0x2a1a24 }));
    this.pupils = [-0.3, 0.3].map((sx) => {
      const p = new THREE.Mesh(pupilGeo, pupilMat);
      p.userData.base = new THREE.Vector3(sx, fy, fz + 0.09);
      p.position.copy(p.userData.base);
      return p;
    });
    this.bucketGroup = new THREE.Group();
    this.bucketGroup.add(this.bucket, faceMesh, ...this.pupils);
    g.add(this.bucketGroup);
    this.catGroup = g;
    this.catSquash = 0; this.catSquashV = 0; this.catHop = 0;
    this.root.add(g);
  }

  // ------------------------------------------------------------------ 狙いの点線
  _buildAimDots() {
    const THREE = this.THREE;
    this.dotN = 22;
    this.dotGeo = this.keep(new THREE.IcosahedronGeometry(0.075, 1));
    this.dotMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }));
    this.dots = new THREE.InstancedMesh(this.dotGeo, this.dotMat, this.dotN);
    this.dots.name = 'aimDots';
    this.dots.frustumCulled = false;
    this.root.add(this.dots);
  }

  // ------------------------------------------------------------------ きらきら（Points 1つ）
  _buildSparkles() {
    const THREE = this.THREE;
    this.spMax = 220;
    const tex = this.tm.canvas('sparkle', 64, 64, (g, w, h) => {
      drawRadial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.65)'], [1, 'rgba(255,255,255,0)']]);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, h - 4); g.moveTo(4, h / 2); g.lineTo(w - 4, h / 2); g.stroke();
    });
    this.spPos = new Float32Array(this.spMax * 3);
    this.spCol = new Float32Array(this.spMax * 3);
    this.spData = [];
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.spCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = this.keep(new THREE.PointsMaterial({ size: 0.45, map: tex, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    this.sparkles = new THREE.Points(geo, mat);
    this.sparkles.frustumCulled = false;
    this.sparkles.name = 'sparkles';
    this.root.add(this.sparkles);
  }

  sparkle(pos, color = 0xffffff, n = 14, speed = 2.5) {
    const c = new this.THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.spData.length >= this.spMax) this.spData.shift();
      const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      const k = Math.sqrt(1 - b * b);
      this.spData.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * k * s, vy: b * s + 1, vz: Math.sin(a) * k * s,
        life: 0.7 + Math.random() * 0.5, age: 0, r: c.r, g: c.g, b: c.b });
    }
  }

  // ------------------------------------------------------------------ 紙吹雪
  _buildConfetti() {
    const THREE = this.THREE;
    this.cfMax = 140;
    this.cfGeo = this.keep(new THREE.PlaneGeometry(0.14, 0.22));
    this.cfMat = this.keep(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    this.confetti = new THREE.InstancedMesh(this.cfGeo, this.cfMat, this.cfMax);
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;
    this.confetti.name = 'confetti';
    for (let i = 0; i < this.cfMax; i++) this.confetti.setColorAt(i, this.col.set(0xffffff));
    this.cf = [];
    this.root.add(this.confetti);
  }

  burstConfetti(pos, n = 120) {
    const cols = WORLD.ballColors;
    for (let i = 0; i < n; i++) {
      if (this.cf.length >= this.cfMax) this.cf.shift();
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.cf.push({
        p: new this.THREE.Vector3(pos.x, pos.y, pos.z),
        v: new this.THREE.Vector3(Math.cos(a) * s * 0.6, 5 + Math.random() * 5, Math.sin(a) * s * 0.6),
        rot: Math.random() * 6, spin: 4 + Math.random() * 8, ax: Math.random(), age: 0, life: 3.2 + Math.random(),
        color: cols[i % cols.length],
      });
    }
  }

  // ------------------------------------------------------------------ 発射
  launch(origin, velocity, colorIndex = 0) {
    const THREE = this.THREE;
    // 数値の安全確認（NaN を世界に入れない）
    if (![origin.x, origin.y, origin.z, velocity.x, velocity.y, velocity.z].every(Number.isFinite)) return false;
    if (this.balls.length >= WORLD.maxBalls) this.balls.shift();
    const plan = planShot(THREE, origin, velocity);
    const ci = ((colorIndex % WORLD.ballColors.length) + WORLD.ballColors.length) % WORLD.ballColors.length;
    this.balls.push({ plan, t: 0, phase: 'fly1', p: plan.p0.clone(), color: WORLD.ballColors[ci], ci,
      spin: 0, squash: 0, ringChecked: false, scale: 1, groundT: 0, from: null });
    this.stats.launched++;
    this.audio.play('whoosh', { gain: 0.5, pitch: 0.8 + velocity.length() / 30 });
    return true;
  }

  setAim(aim) { this.aim = aim; }

  // ------------------------------------------------------------------ 毎フレーム
  update(dt, showAim) {
    const THREE = this.THREE;
    this.time += dt;
    const t = this.time;

    // --- 狙いの予定（球が飛んでいないときの追従先） ---
    let aimPlan = null;
    if (this.aim && Number.isFinite(this.aim.velocity.x)) aimPlan = planShot(THREE, this.aim.origin, this.aim.velocity);

    // --- 球の更新 ---
    for (const b of this.balls) this._stepBall(b, dt);
    this.balls = this.balls.filter((b) => !b.dead && !b.moved);

    // --- 追従：リング（次に頂点に着く球、なければ狙い） ---
    const nextRing = this.balls.find((b) => b.phase === 'fly1' && b.t < b.plan.tA);
    const ringTarget = nextRing ? nextRing.plan.apex : aimPlan ? aimPlan.apex : null;
    if (ringTarget) {
      const rem = nextRing ? nextRing.plan.tA - nextRing.t : null;
      this.ringT.step(ringTarget.x, rem, dt, 3.5);
      this.ringY.step(ringTarget.y, rem, dt, 3.5);
    }
    this.ringAngle += dt * WORLD.ring.spin * (1 + this.ringFlash * 3);
    this.ringSpin.rotation.x = this.ringAngle;
    this.ringGroup.position.set(this.ringT.x, this.ringY.x + Math.sin(t * 1.3) * 0.03, 0);
    this.balloon.rotation.z = clamp(-this.ringT.v * 0.04, -0.25, 0.25);
    this.ringFlash = Math.max(0, this.ringFlash - dt * 1.6);
    this.ringMat.emissiveIntensity = this.ringFlash * 0.8;

    // --- 追従：受け皿 ---
    const nextPad = this.balls.find((b) => b.phase === 'fly1');
    if (nextPad) this.padT.step(nextPad.plan.padHit.x, nextPad.plan.tP - nextPad.t, dt, 5);
    else if (aimPlan) this.padT.step(aimPlan.padHit.x, null, dt, 5);
    const padX = this.padT.x;
    this.padGroup.position.x = padX;
    // 膜のばね（減衰振動）
    this.padDipV += (-60 * this.padDip - 7 * this.padDipV) * dt;
    this.padDip += this.padDipV * dt;
    this.membrane.scale.y = Math.max(0.02, 0.02 + this.padDip);
    this._wheels(this.padWheels, padX, 0.75, 0.6);

    // --- 追従：キャッチャー（次に落ちてくる球） ---
    const nextCat = this.balls
      .filter((b) => b.phase === 'fly1' || b.phase === 'fly2')
      .sort((a, b2) => this._catchEta(a) - this._catchEta(b2))[0];
    if (nextCat) this.catT.step(nextCat.plan.catchHit.x, this._catchEta(nextCat), dt, 6);
    else if (aimPlan) this.catT.step(aimPlan.catchHit.x, null, dt, 5);
    const catX = this.catT.x;
    this.catSquashV += (-90 * this.catSquash - 9 * this.catSquashV) * dt;
    this.catSquash += this.catSquashV * dt;
    this.catHop = Math.max(0, this.catHop - dt * 2.2);
    const hopY = Math.sin(Math.min(1, 1 - this.catHop) * Math.PI) * (this.catHop > 0 ? 0.6 : 0);
    this.catGroup.position.set(catX, 0, 0);
    this.bucketGroup.position.y = hopY;
    const sq = clamp(this.catSquash, -0.4, 0.4);
    this.bucketGroup.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    this._wheels(this.catWheels, catX, 0.8, 0.6);
    // 目：一番近い飛んでいる球（なければ発射台）を見る
    const look = nextCat ? nextCat.p : this.v.set(0, 2, 0);
    for (const p of this.pupils) {
      const base = p.userData.base;
      const dx = look.x - (catX + base.x), dy = look.y - (base.y + hopY);
      const d = Math.hypot(dx, dy) || 1;
      p.position.set(base.x + (dx / d) * 0.08, base.y + (dy / d) * 0.08, base.z);
    }

    // --- 祝い ---
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      if (this.celebrate <= 0) this._emptyPile();
    }

    this._drawBalls(dt);
    this._drawAim(aimPlan, showAim, dt);
    this._stepSparkles(dt);
    this._stepConfetti(dt);
  }

  _catchEta(b) {
    if (b.phase === 'fly1') return b.plan.tP - b.t + b.plan.tC;
    return b.plan.tC - b.t;
  }

  _wheels(inst, x, dx, dz) {
    const ang = -x / 0.16;
    this.q.setFromAxisAngle(this.v.set(0, 0, 1), ang);
    let i = 0;
    for (const sx of [-dx, dx]) for (const sz of [-dz, dz]) {
      this.m4.compose(this.s3.set(sx, 0.16 + 0.12, sz), this.q, this.v.set(1, 1, 1));
      inst.setMatrixAt(i++, this.m4);
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  _stepBall(b, dt) {
    const THREE = this.THREE;
    const P = WORLD.pad, C = WORLD.catcher;
    b.t += dt;
    b.spin += dt * 6;
    b.squash *= Math.exp(-dt * 8);
    const pl = b.plan;
    if (b.phase === 'fly1') {
      // リング通過の判定（輪の面 x を横切るとき）
      const prevX = b.p.x;
      posAt(b.p, pl.p0, pl.v0, b.t);
      const rx = this.ringT.x;
      if (!b.ringChecked && prevX < rx && b.p.x >= rx) {
        b.ringChecked = true;
        const d = Math.hypot(b.p.y - this.ringY.x, b.p.z);
        if (d < WORLD.ring.inner - R * 0.3) {
          this.stats.ringPasses++;
          this.ringFlash = 1;
          this.audio.play('chime', { gain: 0.8 });
          this.sparkle(b.p, 0xfff0a0, 18, 3);
        }
      }
      if (b.t >= pl.tP) {
        posAt(b.p, pl.p0, pl.v0, pl.tP);
        if (Math.abs(b.p.x - this.padT.x) < P.radius + R * 0.6) {
          // 受け皿で跳ねる：実際の位置から2本目の放物線を作り直す
          b.phase = 'fly2';
          b.t2 = 0;
          pl.padHit.copy(b.p);
          pl.tC = timeDown(b.p.y, pl.v1.y, C.rim + R * 0.2);
          posAt(pl.catchHit, b.p, pl.v1, pl.tC);
          b.t = 0;
          b.squash = 0.35;
          this.padDipV -= 4.5;
          this.stats.bounces++;
          this.audio.play('bounce', { gain: 0.8, pitch: 0.9 + Math.random() * 0.2 });
          this.sparkle(b.p, 0xc9f2ff, 8, 1.6);
        } else {
          b.phase = 'fall'; b.t = 0; b.from = b.p.clone();
          b.vFall = new THREE.Vector3(pl.v0.x, pl.v0.y - G * pl.tP, pl.v0.z);
        }
      }
    } else if (b.phase === 'fly2') {
      posAt(b.p, pl.padHit, pl.v1, b.t);
      if (b.t >= pl.tC) {
        posAt(b.p, pl.padHit, pl.v1, pl.tC);
        if (Math.abs(b.p.x - this.catT.x) < C.radius + R * 0.8) this._catch(b);
        else { b.phase = 'fall'; b.t = 0; b.from = b.p.clone(); b.vFall = new THREE.Vector3(pl.v1.x, pl.v1.y - G * pl.tC, pl.v1.z); }
      }
    } else if (b.phase === 'fall') {
      // 外れても失敗にしない：地面で2回小さく弾んで、きらきらになって消える
      posAt(b.p, b.from, b.vFall, b.t);
      if (b.p.y <= R) {
        b.p.y = R;
        b.groundT++;
        this.audio.play('thud', { gain: 0.5 });
        if (b.groundT >= 3) { this._pop(b); return; }
        b.from = b.p.clone();
        b.vFall.set(b.vFall.x * 0.5, Math.abs(b.vFall.y) * 0.4, b.vFall.z * 0.5);
        b.t = 0;
        b.squash = 0.3;
      }
    } else if (b.phase === 'out') {
      // お祝いのあと：キャッチャーから飛び出して、きらきらになって消える
      posAt(b.p, b.from, b.vFall, b.t);
      if (b.t > 0.6) this._pop(b);
    }
  }

  _catch(b) {
    // 球はキャッチャーの中へ（飛んでいる球の一覧から外し、pile に移す）
    b.phase = 'settle'; b.t = 0; b.from = b.p.clone();
    b.slot = this.pile.length;
    b.moved = true;
    this.pile.push(b);
    this.stats.caught++;
    this.catSquashV += 5;
    this.audio.play('catch', { gain: 1 });
    this.sparkle(b.p, b.color, 14, 2.2);
    if (this.pile.length >= WORLD.maxBalls && this.celebrate <= 0) {
      this.celebrate = 2.4;
      this.stats.celebrations++;
      this.catHop = 1;
      this.audio.play('fanfare', { gain: 0.9 });
      this.burstConfetti(this.v.set(this.catT.x, 2.0, 0), 130);
    }
  }

  _slotPos(i, out) {
    const C = WORLD.catcher;
    const layer = i < 4 ? 0 : 1;
    const k = i < 4 ? i : i - 4;
    const a = k * (Math.PI / 2) + layer * Math.PI / 4;
    const rr = 0.36;
    return out.set(this.catT.x + Math.cos(a) * rr, 0.5 + 0.1 + R + layer * 0.42 + this.bucketGroup.position.y, Math.sin(a) * rr);
  }

  _emptyPile() {
    for (const b of this.pile) {
      b.phase = 'out'; b.t = 0; b.from = b.p.clone(); b.moved = false;
      b.vFall = new this.THREE.Vector3((Math.random() - 0.5) * 3, 6 + Math.random() * 3, (Math.random() - 0.3) * 2);
      this.balls.push(b);
    }
    this.pile = [];
  }

  _pop(b) {
    b.dead = true;
    this.audio.play('pop', { gain: 0.5, pitch: 0.9 + Math.random() * 0.3 });
    this.sparkle(b.p, b.color, 16, 2.5);
  }

  _drawBalls(dt) {
    // キャッチャーの中の球：すべり込んでから決まった場所に並ぶ
    for (const b of this.pile) {
      b.t += dt;
      b.squash *= Math.exp(-dt * 8);
      const k = Math.min(1, b.t / 0.25);
      this._slotPos(b.slot, this.v);
      if (k < 1) b.p.lerpVectors(b.from, this.v, k * k); else b.p.copy(this.v);
    }
    let n = 0;
    const inst = this.ballMesh;
    const cap = inst.instanceMatrix.count;
    for (const list of [this.balls, this.pile]) {
      for (const b of list) {
        if (b.dead || n >= cap) continue;
        const sq = b.squash;
        this.q.setFromAxisAngle(this.v.set(0, 0, 1), -b.spin);
        this.s3.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5).multiplyScalar(b.scale);
        this.m4.compose(b.p, this.q, this.s3);
        inst.setMatrixAt(n, this.m4);
        inst.setColorAt(n, this.col.set(b.color));
        n++;
      }
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  _drawAim(plan, show, dt) {
    this.aimVisible += ((show ? 1 : 0) - this.aimVisible) * dampK(8, dt);
    const inst = this.dots;
    if (!plan || this.aimVisible < 0.02) { inst.count = 0; this.dotMat.opacity = 0; return; }
    this.dotMat.opacity = 0.8 * this.aimVisible;
    const n = this.dotN;
    const tEnd = plan.tP;
    const phase = (this.time * 0.8) % 1;
    for (let i = 0; i < n; i++) {
      const tt = ((i + phase) / n) * tEnd;
      posAt(this.v, plan.p0, plan.v0, tt);
      const k = 1 - (i / n) * 0.5;
      this.m4.makeScale(k, k, k).setPosition(this.v);
      inst.setMatrixAt(i, this.m4);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
  }

  _stepSparkles(dt) {
    let n = 0;
    for (const s of this.spData) {
      s.age += dt;
      if (s.age >= s.life) continue;
      s.vy -= 2.5 * dt;
      s.vx *= 1 - dt * 1.5; s.vz *= 1 - dt * 1.5;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const f = 1 - s.age / s.life;
      const i3 = n * 3;
      this.spPos[i3] = s.x; this.spPos[i3 + 1] = s.y; this.spPos[i3 + 2] = s.z;
      this.spCol[i3] = s.r * f; this.spCol[i3 + 1] = s.g * f; this.spCol[i3 + 2] = s.b * f;
      n++;
    }
    this.spData = this.spData.filter((s) => s.age < s.life);
    const geo = this.sparkles.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  _stepConfetti(dt) {
    let n = 0;
    for (const c of this.cf) {
      c.age += dt;
      if (c.age >= c.life) continue;
      c.v.y = Math.max(c.v.y - G * dt, -1.4);
      c.v.x *= 1 - dt * 1.2; c.v.z *= 1 - dt * 1.2;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.03) { c.p.y = 0.03; c.v.set(0, 0, 0); }
      c.rot += c.spin * dt;
      this.q.setFromAxisAngle(this.v.set(c.ax, 1 - c.ax, 0.3).normalize(), c.rot);
      const k = Math.min(1, (c.life - c.age) * 2);
      this.m4.compose(c.p, this.q, this.s3.set(k, k, k));
      this.confetti.setMatrixAt(n, this.m4);
      this.confetti.setColorAt(n, this.col.set(c.color));
      n++;
    }
    this.cf = this.cf.filter((c) => c.age < c.life);
    this.confetti.count = n;
    this.confetti.instanceMatrix.needsUpdate = true;
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }

  _shadows() {
    const B = this.blobs;
    for (const b of this.balls) {
      if (b.dead || b.phase === 'out') continue;
      const h = Math.max(0, b.p.y - R);
      B.add(b.p.x, b.p.z, R * (1.1 + h * 0.08), clamp(0.9 - h * 0.08, 0.15, 0.9));
    }
    B.add(this.ringT.x, 0, 1.2 + this.ringY.x * 0.1, clamp(0.55 - this.ringY.x * 0.04, 0.12, 0.5));
    B.add(this.padT.x, 0, 1.15, 0.6);
    B.add(this.catT.x, 0, 1.2, 0.65);
  }

  /** いまの状態（煙テスト・デバッグ用） */
  snapshot() {
    return { flying: this.balls.filter((b) => b.phase === 'fly1' || b.phase === 'fly2').length,
      pile: this.pile.length, ...this.stats };
  }

  reset() {
    this.balls = []; this.pile = []; this.cf = []; this.spData = []; this.celebrate = 0;
  }

  dispose() { for (const d of this.disposables) d.dispose(); }
}
