// Simple wooden toy trains (shell-owned). One train per bank; it pops up at the bridge root,
// rolls along hero.getDeckPath(round) onto the bank and stays parked there.
// Locos and wagons are InstancedMeshes (2 draw calls for all trains) + 1 for blob shadows.
import { mergeParts, clamp } from './geo.js';

const CAR_GAP = 0.74;   // distance between car centres along the path
const CARS = 3;         // loco + 2 wagons
const BOGIE = 0.5;      // distance between a car's front and rear contact points

function carGeometries(THREE) {
  const C = (h) => new THREE.Color(h);
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const rotZ = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  const wheels = (col) => {
    const out = [];
    for (const z of [-0.2, 0.2]) for (const x of [-0.2, 0.2]) {
      out.push({ geo: new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), matrix: T(x, 0.1, z).multiply(rotZ), color: col });
    }
    return out;
  };
  // forward is -Z
  const loco = mergeParts(THREE, [
    { geo: new THREE.BoxGeometry(0.42, 0.14, 0.64), matrix: T(0, 0.17, 0), color: C(0xe8473f) },
    { geo: new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12), matrix: T(0, 0.37, -0.1).multiply(rotX), color: C(0xe8473f) },
    { geo: new THREE.CylinderGeometry(0.05, 0.07, 0.18, 8), matrix: T(0, 0.58, -0.22), color: C(0x333344) },
    { geo: new THREE.BoxGeometry(0.42, 0.34, 0.24), matrix: T(0, 0.41, 0.2), color: C(0xffd23f) },
    { geo: new THREE.BoxGeometry(0.48, 0.05, 0.3), matrix: T(0, 0.6, 0.2), color: C(0x3a6fd8) },
    { geo: new THREE.SphereGeometry(0.06, 8, 6), matrix: T(0, 0.37, -0.31), color: C(0xfff4b0) },
    ...wheels(C(0x2b3a6b)),
  ]);
  const wagon = mergeParts(THREE, [
    { geo: new THREE.BoxGeometry(0.42, 0.1, 0.6), matrix: T(0, 0.17, 0), color: C(0xb98a5a) },
    { geo: new THREE.BoxGeometry(0.36, 0.22, 0.5), matrix: T(0, 0.33, 0), color: C(0xffffff) },
    { geo: new THREE.SphereGeometry(0.1, 8, 6), matrix: T(0, 0.48, 0), color: C(0xfff4d8) },
    ...wheels(C(0x2b3a6b)),
  ]);
  return { loco, wagon };
}

export function buildTrains(THREE, tex, rounds, sfx) {
  const group = new THREE.Group();
  group.name = 'trains';
  const { loco, wagon } = carGeometries(THREE);
  const mat = new THREE.MeshLambertMaterial({ map: tex.wood, vertexColors: true });
  const locos = new THREE.InstancedMesh(loco, mat, rounds);
  const wagons = new THREE.InstancedMesh(wagon, mat, rounds * (CARS - 1));
  const blobGeo = new THREE.PlaneGeometry(0.6, 0.8).rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false }), rounds * CARS);
  for (const im of [locos, wagons, blobs]) { im.frustumCulled = false; group.add(im); }
  const wagonTints = [0xff9ccc, 0xffe07a, 0x9fd8ff, 0xb7f08a];
  for (let i = 0; i < rounds * (CARS - 1); i++) wagons.setColorAt(i, new THREE.Color(wagonTints[Math.floor(i / 2) % wagonTints.length]));

  const trains = []; // {path:[Vector3], cum:[], len, s, v, state, t}
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  function at(tr, s, out) {
    s = clamp(s, 0, tr.len);
    const c = tr.cum;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const seg = c[i] - c[i - 1];
    const u = seg > 1e-6 ? (s - c[i - 1]) / seg : 0;
    return out.copy(tr.path[i - 1]).lerp(tr.path[i], clamp(u, 0, 1));
  }

  function hideAll() {
    for (let i = 0; i < rounds; i++) locos.setMatrixAt(i, hidden);
    for (let i = 0; i < rounds * (CARS - 1); i++) wagons.setMatrixAt(i, hidden);
    for (let i = 0; i < rounds * CARS; i++) blobs.setMatrixAt(i, hidden);
    locos.instanceMatrix.needsUpdate = wagons.instanceMatrix.needsUpdate = blobs.instanceMatrix.needsUpdate = true;
  }
  hideAll();

  function write(tr) {
    const pop = tr.state === 'pop' ? Math.min(1, tr.t / 0.35) : 1;
    const k = pop < 1 ? 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2) : 1;
    for (let c = 0; c < CARS; c++) {
      const sc0 = tr.s - c * CAR_GAP;
      at(tr, sc0, a); at(tr, sc0 - BOGIE, b);
      mid.copy(a).add(b).multiplyScalar(0.5);
      if (a.distanceToSquared(b) < 1e-8) a.z -= 0.01;
      m.lookAt(b, a, up); // +Z points backwards, the model faces -Z
      q.setFromRotationMatrix(m);
      const bob = tr.state === 'run' ? Math.abs(Math.sin(tr.s * 9 + c)) * 0.012 : 0;
      mid.y += bob;
      sc.setScalar(Math.max(0.0001, k));
      m.compose(mid, q, sc);
      if (c === 0) locos.setMatrixAt(tr.index, m); else wagons.setMatrixAt(tr.index * (CARS - 1) + c - 1, m);
      mid.y += 0.01 - bob;
      m.compose(mid, q, sc);
      blobs.setMatrixAt(tr.index * CARS + c, m);
    }
    locos.instanceMatrix.needsUpdate = wagons.instanceMatrix.needsUpdate = blobs.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    /**
     * Start a train on `round` along world-space `points` (root -> tip) and on to the bank.
     * onArrive() is called once it has stopped.
     */
    start(round, points, landing, dir, bankY, onArrive) {
      const path = points.map((p) => p.clone());
      const tip = path[path.length - 1];
      const off = new THREE.Vector3(landing.x, bankY, landing.z).addScaledVector(dir, 0.6);
      if (off.distanceTo(tip) > 0.2) path.push(off);
      path.push(new THREE.Vector3(landing.x, bankY, landing.z).addScaledVector(dir, 2.7));
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
      const len = cum[cum.length - 1];
      const tr = { index: round, path, cum, len, s: Math.min(len, (CARS - 1) * CAR_GAP + BOGIE + 0.05), v: 0, state: 'pop', t: 0, onArrive, chug: 0 };
      trains[round] = tr;
      sfx.play('pop');
      write(tr);
    },
    reset() { trains.length = 0; hideAll(); },
    update(dt) {
      for (const tr of trains) {
        if (!tr || tr.state === 'parked') continue;
        tr.t += dt;
        if (tr.state === 'pop') {
          if (tr.t > 0.8) { tr.state = 'run'; tr.t = 0; sfx.play('toot'); }
        } else if (tr.state === 'run') {
          const end = tr.len - 0.15;
          const remain = end - tr.s;
          const vmax = 1.7;
          const vTarget = Math.min(vmax, Math.sqrt(Math.max(0, 2 * 0.7 * remain)) + 0.05);
          tr.v += clamp(vTarget - tr.v, -1.5 * dt, 0.8 * dt);
          tr.s = Math.min(end, tr.s + tr.v * dt);
          tr.chug += tr.v * dt;
          if (tr.chug > 0.55) { tr.chug = 0; sfx.play('chug', { gain: clamp(tr.v / vmax, 0.3, 1) }); }
          if (remain < 0.01) {
            tr.state = 'parked'; tr.v = 0;
            sfx.play('toot');
            tr.onArrive && tr.onArrive();
          }
        }
        write(tr);
      }
    },
    dispose() {
      loco.dispose(); wagon.dispose(); blobGeo.dispose(); mat.dispose(); blobs.material.dispose();
      locos.dispose(); wagons.dispose(); blobs.dispose();
    },
  };
}
