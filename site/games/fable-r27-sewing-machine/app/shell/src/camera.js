// カメラ：固定の定位置 3 つだけ。切り替えは 1.6 秒の ease-in-out。揺れ・急な回転・ズーム操作なし。
// 各定位置は「見る向き（dir）」と「必ず画面に入れる点（fit）」で決める。縦持ち／横持ち・どんな縦横比でも、
// fit の点が全部、余白つきで画面に入る距離を解き、点の集まりが画面の真ん中に来るよう注視点を少しずらす。

const box = (x0, x1, y0, y1, z0, z1) => {
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push([x, y, z]);
  return out;
};

// 手回し車のヒントの輪（中心 (0.285, 0.24, 0)、画面上の半径は世界で約 0.10 m）が切れないための点
const RING = [[0.39, 0.24, 0.0], [0.285, 0.345, 0.0], [0.285, 0.135, 0.0], [0.285, 0.24, 0.10], [0.285, 0.24, -0.10]];

export const VIEWS = {
  // 機械全体＋手前の布（いちばん大きな操作部）＋押さえレバー＋手回し車
  front: {
    target: [0.0, 0.12, 0.10], dir: [0.34, 0.62, 1.0], minDist: 0.95,
    fit: [...box(-0.29, 0.30, 0.0, 0.36, -0.13, 0.14), [-0.23, 0.0, 0.42], [-0.05, 0.0, 0.42], ...RING],
  },
  // カバーを外した中：頭の中のクランク・針の後ろの縫い目・軸と歯車、そして回す手回し車（輪ごと）
  inside: {
    target: [0.0, 0.12, 0.02], dir: [0.20, 0.33, 1.0], minDist: 0.80,
    fit: [...box(-0.25, 0.22, 0.0, 0.33, -0.07, 0.13), [-0.14, 0.05, 0.16], ...RING],
  },
  // 壁のひもの飾り 3 枚
  display: {
    target: [0.465, 0.62, -0.47], dir: [-0.10, 0.02, 1.0], minDist: 0.80,
    fit: [...box(0.17, 0.76, 0.50, 0.79, -0.47, -0.46)],
  },
};
const FOV = 36;
const TWEEN = 1.6;
const MARGIN_X = 0.92, MARGIN_Y = 0.90;   // NDC で使ってよい範囲

export function createCameraRig(THREE) {
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.03, 12);
  const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const to = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const probe = new THREE.PerspectiveCamera(FOV, 1, 0.03, 12);
  const dir = new THREE.Vector3(), p = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const fitPts = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.fit.map((a) => new THREE.Vector3().fromArray(a))]));
  let view = 'front', t = 1;

  /** 注視点 tgt・距離 d から見たとき、fit の点の NDC の範囲 */
  function bounds(pts, tgt, d) {
    probe.position.copy(dir).multiplyScalar(d).add(tgt);
    probe.lookAt(tgt); probe.updateMatrixWorld(); probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, behind: false };
    for (const q of pts) {
      p.copy(q).applyMatrix4(probe.matrixWorldInverse);
      if (p.z > -0.05) { b.behind = true; continue; }
      p.applyMatrix4(probe.projectionMatrix);
      b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
    }
    return b;
  }
  const fits = (b) => !b.behind && b.x0 >= -MARGIN_X && b.x1 <= MARGIN_X && b.y0 >= -MARGIN_Y && b.y1 <= MARGIN_Y;

  function solve(name, aspect, outPos, outTgt) {
    const v = VIEWS[name] || VIEWS.front, pts = fitPts[name] || fitPts.front;
    probe.aspect = aspect; probe.updateProjectionMatrix();
    dir.fromArray(v.dir).normalize();
    outTgt.fromArray(v.target);
    let d = v.minDist;
    for (let pass = 0; pass < 3; pass++) {
      // 全部が入る最小の距離（二分探索）
      let lo = v.minDist, hi = 6;
      if (fits(bounds(pts, outTgt, lo))) hi = lo;
      else for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fits(bounds(pts, outTgt, m))) hi = m; else lo = m; }
      d = hi;
      if (pass === 2) break;
      // 点の集まりの中心が画面の中心に来るよう、注視点を画面の左右・上下にずらす
      const b = bounds(pts, outTgt, d);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const halfH = Math.tan((FOV * Math.PI / 180) / 2) * d, halfW = halfH * aspect;
      right.setFromMatrixColumn(probe.matrixWorld, 0); up.setFromMatrixColumn(probe.matrixWorld, 1);
      outTgt.addScaledVector(right, cx * halfW * 0.9).addScaledVector(up, cy * halfH * 0.9);
    }
    outPos.copy(dir).multiplyScalar(d).add(outTgt);
  }
  const ease = (x) => x * x * (3 - 2 * x);

  return {
    camera,
    get view() { return view; },
    get moving() { return t < 1; },
    setAspect(aspect, snap) {
      camera.aspect = aspect; camera.updateProjectionMatrix();
      solve(view, aspect, to.pos, to.tgt);
      if (snap || t >= 1) { cur.pos.copy(to.pos); cur.tgt.copy(to.tgt); t = 1; this.apply(); }
    },
    go(name) {
      if (!VIEWS[name] || name === view) return;
      view = name;
      from.pos.copy(cur.pos); from.tgt.copy(cur.tgt);
      solve(view, camera.aspect, to.pos, to.tgt);
      t = 0;
    },
    update(dt) {
      if (t < 1) {
        t = Math.min(1, t + dt / TWEEN);
        const k = ease(ease(t)); // よりゆっくり始まり、ゆっくり止まる
        cur.pos.lerpVectors(from.pos, to.pos, k);
        cur.tgt.lerpVectors(from.tgt, to.tgt, k);
      }
      this.apply();
    },
    apply() { camera.position.copy(cur.pos); camera.lookAt(cur.tgt); camera.updateMatrixWorld(); },
  };
}
