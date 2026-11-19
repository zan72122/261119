// モバイル判定と性能上限（ティア別設定）。docs/PLAN.md §3。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});

  const TIERS = Object.freeze({
    desktop: Object.freeze({ fixedDpr: 0, dprMax: 2, maxPixels: 3.5e6, renderScale: 1, shadows: true, shadowSize: 512, heroTextureSize: 1024 }),
    mobile: Object.freeze({ fixedDpr: 1, dprMax: 1, maxPixels: 3.0e6, renderScale: 1, shadows: true, shadowSize: 512, heroTextureSize: 1024 }),
    low: Object.freeze({ fixedDpr: 1, dprMax: 1, maxPixels: 2.0e6, renderScale: 0.85, shadows: false, shadowSize: 0, heroTextureSize: 512 }),
  });

  function detect() {
    const q = new URLSearchParams(location.search);
    const forced = q.get('tier');
    // iPad は Mac の UA を名乗るので UA ではなくタッチ点数で判定する。
    const isMobile = (navigator.maxTouchPoints || 0) > 1;
    const tier = forced && TIERS[forced] ? forced : isMobile ? 'mobile' : 'desktop';
    return { tier, isMobile, forced: !!(forced && TIERS[forced]) };
  }

  // CSS px の大きさから、実際に使う devicePixelRatio を決める。
  function pixelRatio(settings, cssW, cssH) {
    let dpr = settings.fixedDpr || Math.min(window.devicePixelRatio || 1, settings.dprMax);
    const px = cssW * cssH * dpr * dpr;
    if (px > settings.maxPixels) dpr = Math.sqrt(settings.maxPixels / Math.max(1, cssW * cssH));
    return Math.max(0.5, dpr * settings.renderScale);
  }

  S.tier = { TIERS, detect, pixelRatio };
})();
