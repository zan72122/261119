// Celebration props on the banks: flag poles + flags, flowers that pop up when a bank is
// connected, and balloons for the finale. Each kind is one (Instanced)Mesh.
import { mergeParts, rng, clamp } from './geo.js';

const backOut = (t) => { t = clamp(t, 0, 1); const s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };

export function buildDecor(THREE, tex, islands) {
  const group = new THREE.Group();
  group.name = 'decor';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const n = islands.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);

  // --- flag poles (static, merged, wood)
  const poleH = 1.7;
  const poleSpots = islands.map((is) => {
    const side = new THREE.Vector3(-is.dir.z, 0, is.dir.x);
    return is.landing.clone().addScaledVector(is.dir, 1.0).addScaledVector(side, 1.15);
  });
  const poleParts = [];
  poleSpots.forEach((sp, i) => {
    poleParts.push({ geo: new THREE.CylinderGeometry(0.045, 0.06, poleH, 6), matrix: new THREE.Matrix4().makeTranslation(sp.x, sp.y + poleH / 2, sp.z), color: new THREE.Color(0xffffff) });
    poleParts.push({ geo: new THREE.SphereGeometry(0.09, 8, 6), matrix: new THREE.Matrix4().makeTranslation(sp.x, sp.y + poleH + 0.05, sp.z), color: new THREE.Color(islands[i].target.color) });
  });
  const poles = new THREE.Mesh(keep(mergeParts(THREE, poleParts)), keep(new THREE.MeshLambertMaterial({ map: tex.wood, vertexColors: true })));
  poles.name = 'flagpoles';
  group.add(poles);

  // --- flags (triangle pennants)
  const flagGeo = keep(new THREE.BufferGeometry());
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.25, 0, 0, -0.25, 0, 0.75, 0, 0], 3));
  flagGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const flags = new THREE.InstancedMesh(flagGeo, keep(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })), n);
  islands.forEach((is, i) => flags.setColorAt(i, new THREE.Color(is.target.color)));
  flags.name = 'flags';
  flags.frustumCulled = false;
  group.add(flags);

  // --- flowers (puffy blossoms on the bank tops)
  const PER = 16;
  const flowerGeo = keep(mergeParts(THREE, [
    { geo: new THREE.IcosahedronGeometry(0.12, 0), matrix: new THREE.Matrix4().makeScale(1, 0.6, 1).setPosition(0, 0.1, 0) },
    { geo: new THREE.IcosahedronGeometry(0.05, 0), matrix: new THREE.Matrix4().makeTranslation(0, 0.17, 0), color: new THREE.Color(0xfff27a) },
  ]));
  const flowers = new THREE.InstancedMesh(flowerGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true })), n * PER);
  const palette = [0xff8fc8, 0xffffff, 0xffd23f, 0xc79bff, 0xff6f6f].map((c) => new THREE.Color(c));
  const flowerSpots = [];
  islands.forEach((is, k) => {
    const R = rng(500 + k);
    const side = new THREE.Vector3(-is.dir.z, 0, is.dir.x);
    let guard = 0;
    while (flowerSpots.length < (k + 1) * PER && guard++ < 500) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * is.radius * 0.85;
      const pt = is.center.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      const rel = pt.clone().sub(is.landing);
      const along = rel.dot(is.dir), lat = rel.dot(side);
      if (along > -0.6 && along < 3.2 && Math.abs(lat) < 0.8) continue; // train lane
      if (rel.length() < 1.3) continue; // landing pad
      if (pt.distanceTo(poleSpots[k]) < 0.4) continue;
      pt.y = is.target.height;
      flowerSpots.push({ pos: pt, island: k, delay: R() * 0.9, scale: 0.8 + R() * 0.6 });
    }
  });
  flowerSpots.forEach((f, i) => flowers.setColorAt(i, palette[i % palette.length]));
  flowers.count = flowerSpots.length;
  flowers.name = 'flowers';
  flowers.frustumCulled = false;
  group.add(flowers);

  // --- balloons (finale)
  const BAL = 15;
  const balloonGeo = keep(mergeParts(THREE, [
    { geo: new THREE.SphereGeometry(0.32, 10, 8), matrix: new THREE.Matrix4().makeScale(1, 1.18, 1).setPosition(0, 0.9, 0) },
    { geo: new THREE.ConeGeometry(0.06, 0.08, 5), matrix: new THREE.Matrix4().makeTranslation(0, 0.51, 0) },
    { geo: new THREE.CylinderGeometry(0.008, 0.008, 0.5, 3), matrix: new THREE.Matrix4().makeTranslation(0, 0.25, 0), color: new THREE.Color(0x777777) },
  ]));
  const balloons = new THREE.InstancedMesh(balloonGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 })), BAL);
  const balloonData = [];
  for (let i = 0; i < BAL; i++) {
    const is = islands[i % n];
    const R = rng(900 + i);
    const a = R() * Math.PI * 2, r = R() * is.radius * 0.6;
    balloonData.push({ x: is.center.x + Math.cos(a) * r, z: is.center.z + Math.sin(a) * r, y0: is.target.height, delay: i * 0.18 + R() * 0.3, phase: R() * 6, speed: 0.9 + R() * 0.5 });
    balloons.setColorAt(i, palette[(i + 2) % palette.length]);
  }
  balloons.name = 'balloons';
  balloons.frustumCulled = false;
  group.add(balloons);

  // --- state
  const flagT = new Float32Array(n).fill(-1);   // seconds since raise, -1 = lowered
  const flowerT = new Float32Array(n).fill(-1);
  let balloonT = -1;
  let time = 0;

  function writeFlags() {
    for (let i = 0; i < n; i++) {
      const sp = poleSpots[i];
      const t = flagT[i];
      const k = t < 0 ? 0 : clamp(t / 1.6, 0, 1);
      const y = sp.y + 0.35 + (poleH - 0.45) * (1 - Math.pow(1 - k, 3));
      q.setFromAxisAngle(Y, Math.atan2(islands[i].dir.x, islands[i].dir.z) + Math.PI / 2 + Math.sin(time * 2.2 + i) * 0.25 * k);
      const sc = t < 0 ? 0.0001 : Math.min(1, backOut(t / 0.5));
      flags.setMatrixAt(i, m.compose(p.set(sp.x, y, sp.z), q, s.set(sc, sc, sc)));
    }
    flags.instanceMatrix.needsUpdate = true;
  }
  function writeFlowers() {
    flowerSpots.forEach((f, i) => {
      const t = flowerT[f.island];
      const k = t < 0 ? 0 : backOut((t - f.delay) / 0.45);
      const sc = Math.max(0.0001, k * f.scale);
      q.setFromAxisAngle(Y, i * 1.3);
      flowers.setMatrixAt(i, m.compose(f.pos, q, s.set(sc, sc, sc)));
    });
    flowers.instanceMatrix.needsUpdate = true;
  }
  function writeBalloons() {
    balloonData.forEach((b, i) => {
      const t = balloonT < 0 ? -1 : balloonT - b.delay;
      let sc = 0.0001, y = b.y0;
      if (t >= 0) {
        sc = Math.min(1, backOut(t / 0.4));
        y = b.y0 + t * b.speed * 0.8 + t * t * 0.03;
      }
      if (y > 40) sc = 0.0001;
      q.setFromAxisAngle(Y, 0);
      const sway = t > 0 ? Math.sin(time * 1.3 + b.phase) * 0.25 : 0;
      balloons.setMatrixAt(i, m.compose(p.set(b.x + sway, y, b.z + sway * 0.5), q, s.set(sc, sc, sc)));
    });
    balloons.instanceMatrix.needsUpdate = true;
  }
  function reset() {
    flagT.fill(-1); flowerT.fill(-1); balloonT = -1;
    writeFlags(); writeFlowers(); writeBalloons();
  }
  reset();

  return {
    group,
    poleSpots,
    /** bank `i` got connected: raise its flag */
    raiseFlag(i) { if (flagT[i] < 0) flagT[i] = 0; },
    /** the train arrived on bank `i`: flowers pop up */
    bloom(i) { if (flowerT[i] < 0) flowerT[i] = 0; },
    finale() { balloonT = 0; },
    reset,
    update(dt) {
      time += dt;
      let any = false;
      for (let i = 0; i < n; i++) if (flagT[i] >= 0) { flagT[i] += dt; any = true; }
      if (any) writeFlags();
      let fl = false;
      for (let i = 0; i < n; i++) if (flowerT[i] >= 0 && flowerT[i] < 2) { flowerT[i] += dt; fl = true; }
      if (fl) writeFlowers();
      if (balloonT >= 0 && balloonT < 60) { balloonT += dt; writeBalloons(); }
    },
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
