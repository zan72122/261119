// ティア（性能の段）判定と、遅いときに解像度だけ下げる仕組み。
// iPad は Mac の UA を名乗るので navigator.maxTouchPoints > 1 でモバイルと判定する。

export const TIERS = {
  // 基準機：2020 iPad Pro 12.9" Safari。DPR 1.0 固定・MSAA なし。
  mobile:  { name: 'mobile',  mobile: true,  pixelRatio: 1.0, antialias: false, msaaSamples: 0, detail: 1.0,  maxPixels: 2.2e6, maxTextureSize: 1024, envSize: 128 },
  desktop: { name: 'desktop', mobile: false, pixelRatio: 1.5, antialias: false, msaaSamples: 0, detail: 1.0,  maxPixels: 3.2e6, maxTextureSize: 1024, envSize: 128 },
  low:     { name: 'low',     mobile: true,  pixelRatio: 1.0, antialias: false, msaaSamples: 0, detail: 0.6,  maxPixels: 1.2e6, maxTextureSize: 1024, envSize: 64 },
};

export function detectTier(params) {
  const touch = (navigator.maxTouchPoints || 0) > 1;
  const dpr = window.devicePixelRatio || 1;
  let t;
  const forced = params.get('tier');
  if (forced && TIERS[forced]) t = { ...TIERS[forced] };
  else if (touch) t = { ...TIERS.mobile };
  else {
    t = { ...TIERS.desktop, pixelRatio: Math.min(dpr, 1.5) };
    // DPR 1 の画面だけ MSAA 4x（見積もりに含める）。高DPRでは画素が細かいので不要。
    if (t.pixelRatio <= 1.0) { t.antialias = true; t.msaaSamples = 4; }
  }
  t.touch = touch;
  t.renderScale = t.name === 'low' ? 0.75 : 1.0;
  t.downgraded = false;
  return t;
}

/** 描画バッファの画素比を決める（tier の DPR × renderScale、ただし maxPixels を超えない）。 */
export function effectivePixelRatio(tier, cssW, cssH) {
  const want = tier.pixelRatio * tier.renderScale;
  const cap = Math.sqrt(tier.maxPixels / Math.max(1, cssW * cssH));
  return Math.max(0.5, Math.min(want, cap));
}

/**
 * 平均 fps が 40 未満の状態が 4 秒続いたら一度だけ low 相当（解像度 0.75 倍）に落とす。
 * 形は作り直さない（hero の detail は作成時のまま）。
 */
export class PerfGovernor {
  constructor(tier, onDowngrade) {
    this.tier = tier; this.onDowngrade = onDowngrade;
    this.slowTime = 0; this.warmup = 3.0;
  }
  sample(dt) {
    if (this.tier.downgraded || this.tier.name === 'low') return;
    if (this.warmup > 0) { this.warmup -= dt; return; }
    if (dt > 1 / 40) this.slowTime += dt; else this.slowTime = Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime > 4.0) {
      this.tier.downgraded = true;
      this.tier.renderScale = 0.75;
      this.onDowngrade && this.onDowngrade();
    }
  }
}
