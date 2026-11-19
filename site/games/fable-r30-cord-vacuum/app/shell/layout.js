// 配置アンカーと段階・既定カメラ。docs/HERO-SPEC.md §1〜2 と同じ値（変えるなら両方直す）。
// 組み込みで、本物の hero（docs/hero-notes.md §4）に合わせて cordExit・plugPullArea・cordMaxLength・rewindButton・dumpPoint を直した。
// hero はこのうち bodyCenter・plugRest・plugPullArea・binDock・hosePort・nozzleRest・scrapArea・trashCan* と dumpPoint の高さだけを読む。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});

  const STAGES = Object.freeze(['pull', 'rewind', 'suck', 'unlock', 'dump', 'finale']);

  const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

  // 単位 m、Y 上、床 y=0、カメラは +Z 側から -Z を見る。
  const LAYOUT = deepFreeze({
    bodyCenter: [0.35, 0, -0.15],
    cordExit: [0.564, 0.08, -0.058],
    plugRest: [0.66, 0.03, 0.02],
    plugPullArea: { min: [0.6, 0, -0.1], max: [1.25, 0, 0.65] }, // hero は x の上限を 5cm 広げて使う（1.30）
    cordMaxLength: 0.72, // cordExit からプラグまでの最大距離（hero の cord.reach）
    rewindButton: [0.49, 0.275, -0.069],
    binDock: [0.22, 0.27, -0.15],
    latch: [0.22, 0.25, -0.01],
    hosePort: [0.13, 0.12, -0.15],
    nozzleRest: [-0.35, 0, 0.15],
    scrapArea: { min: [-1.0, 0, -0.15], max: [0.05, 0, 0.6] },
    trashCan: [1.0, 0, -0.42],
    trashCanRadius: 0.15,
    trashCanHeight: 0.36,
    dumpPoint: [0.955, 0.55, -0.42], // 容器をここへ運ぶと傾けて空ける（hero は容器の中心を y+0.01 に置く。y は hero が読むので変えない）
    heroZone: { min: [-1.2, 0, -0.65], max: [1.35, 1.0, 0.75] },
  });

  // 既定の定位置（fov は 4:3 横向きでの縦画角。縦長画面ではシェルが横画角を保つように広げる）
  const DEFAULT_VIEWS = deepFreeze({
    pull: { position: [0.86, 0.88, 1.38], target: [0.8, 0.07, 0.14], fov: 45 },
    rewind: { position: [0.6, 1.0, 1.35], target: [0.52, 0.16, -0.04], fov: 45 },
    suck: { position: [-0.28, 1.12, 1.2], target: [-0.3, 0.05, 0.04], fov: 45 }, // 組み込みで寄せた（ノズルと紙片を大きく）
    unlock: { position: [0.3, 0.85, 1.05], target: [0.26, 0.24, -0.1], fov: 45 },
    dump: { position: [0.68, 1.1, 1.55], target: [0.62, 0.32, -0.25], fov: 45 },
    finale: { position: [0.2, 1.3, 2.35], target: [0.15, 0.25, -0.15], fov: 45 },
  });

  S.layout = { STAGES, LAYOUT, DEFAULT_VIEWS };
})();
