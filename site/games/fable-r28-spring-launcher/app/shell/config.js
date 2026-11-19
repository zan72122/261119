// 世界の定数（単位: m, 秒, ラジアン。Y が上、右手系）。
// hero との約束ごとは docs/HERO-SPEC.md と一致させること。

export const WORLD = {
  gravity: 9.8,                 // m/s^2（-Y 向き）
  ballRadius: 0.3,              // 球の半径
  ballColors: [0xff9ec7, 0xffe066, 0x8ee6b8, 0x8ccfff, 0xc7a8ff, 0xffb88a, 0xff7f7f, 0xfffaf0],
  maxBalls: 8,                  // 同時に画面にある球の上限（飛行中＋キャッチャー内）

  // hero（ばね発射機）の置き場所と発射の約束
  launch: {
    speedMin: 7.0,              // m/s（歯止め1段で出る最小）
    speedMax: 12.0,             // m/s（最大圧縮）
    angleMinDeg: 25,
    angleMaxDeg: 55,
    angleDefaultDeg: 40,
    minIntervalSec: 1.2,        // 連続発射の最小間隔（hero の装填サイクルで保証）
  },
  heroBox: { min: [-2.5, 0, -1.6], max: [2.0, 4.2, 1.6] }, // hero が収まる箱（ローカル=ワールド）

  // 周辺の仕掛け
  ring: { inner: 1.0, tube: 0.13, spin: 1.6 },            // 風船がつるす回転リング（中心=放物線の頂点）
  pad: { top: 0.9, radius: 0.95, xMin: 5.0, xMax: 18.5, restitution: 0.75, keepVx: 0.7 },
  catcher: { rim: 1.15, radius: 0.95, xMin: 8.5, xMax: 28.0 },
  rail: { x0: 3.8, x1: 29.2 },
};

// ティア別の設定（tier.js が選ぶ）
export const TIERS = {
  // maxPixels: 描画バッファの画素数の上限（MSAA 込みで GPU 128MiB に収めるため）
  high: { dprMax: 2.0, antialias: true,  msaaSamples: 4, shadow: 512, texMax: 1024, renderScale: 1.0,  maxPixels: 2.0e6 },
  mid:  { dprMax: 1.0, antialias: true,  msaaSamples: 4, shadow: 512, texMax: 1024, renderScale: 1.0,  maxPixels: 2.0e6 },
  low:  { dprMax: 1.0, antialias: false, msaaSamples: 0, shadow: 0,   texMax: 512,  renderScale: 0.85, maxPixels: 1.6e6 },
};

export const BUDGET = {
  hero:  { triangles: 50000, textures: 4, textureMaxSize: 1024, drawCalls: 40 },
  scene: { triangles: 50000, textureMaxSize: 512, drawCalls: 45 },
  total: { triangles: 100000, gpuMiB: 128 },
};
