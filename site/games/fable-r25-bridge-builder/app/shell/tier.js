// Device tier detection and per-tier render limits.
// iPadOS Safari reports a Mac UA, so touch support (maxTouchPoints > 1) decides "mobile".

export const TIERS = {
  // desktop: a little supersampling and 4x MSAA (counted in the GPU estimate)
  high: { dprMax: 1.5, antialias: true, msaaSamples: 4, anisotropy: 4, maxPixels: 2560 * 1600 },
  // iPad / phones: DPR fixed to 1.0, no MSAA
  mobile: { dprMax: 1.0, antialias: false, msaaSamples: 0, anisotropy: 2, maxPixels: 1400 * 1100 },
  // fallback after sustained low fps (or ?tier=low)
  low: { dprMax: 0.75, antialias: false, msaaSamples: 0, anisotropy: 1, maxPixels: 1100 * 850 },
};

export function detectTier() {
  const params = new URLSearchParams(location.search);
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 1;
  const mobile = touch || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  let name = params.get('tier');
  const forced = !!TIERS[name];
  if (!forced) name = mobile ? 'mobile' : 'high';
  return { name, mobile, forced, ...TIERS[name] };
}

/** Pixel ratio for the tier: mobile is exactly 1.0; others capped by dprMax and maxPixels. */
export function pixelRatioFor(tier, cssW, cssH) {
  if (tier.name === 'mobile') return 1.0;
  let dpr = Math.min(window.devicePixelRatio || 1, tier.dprMax);
  const px = cssW * cssH * dpr * dpr;
  if (px > tier.maxPixels) dpr = Math.sqrt(tier.maxPixels / Math.max(1, cssW * cssH));
  return Math.max(0.5, dpr);
}

/** Watches frame times; asks for a downgrade once if fps stays low. */
export class PerfGovernor {
  constructor() { this.acc = 0; this.frames = 0; this.slow = 0; this.warm = 3; this.done = false; }
  /** @returns {boolean} true when the caller should step down one tier */
  sample(dtReal) {
    if (this.done) return false;
    if (this.warm > 0) { this.warm -= dtReal; return false; }
    this.acc += dtReal; this.frames++;
    if (this.acc >= 1) {
      const fps = this.frames / this.acc;
      this.slow = fps < 30 ? this.slow + 1 : 0;
      this.acc = 0; this.frames = 0;
      if (this.slow >= 5) { this.slow = 0; return true; }
    }
    return false;
  }
}
