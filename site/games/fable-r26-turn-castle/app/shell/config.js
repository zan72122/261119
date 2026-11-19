// Device detection and performance tiers (docs/PLAN.md §3).
(function (C) {
  'use strict';
  const q = new URLSearchParams(location.search);

  function detect() {
    const nav = navigator;
    const ua = nav.userAgent || '';
    // iPadOS reports a Mac UA, so touch points are the reliable signal.
    const mobile = (nav.maxTouchPoints || 0) > 1 || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const shortSide = Math.min(screen.width || 1024, screen.height || 768);
    const cores = nav.hardwareConcurrency || 8;
    const mem = nav.deviceMemory || 8; // not exposed by Safari
    // Safari clamps hardwareConcurrency and hides deviceMemory, so iPads are judged by screen size only;
    // phones (short side < 700 CSS px) and low-memory Android devices get 'low'.
    let tier = mobile ? ((shortSide < 700 || mem <= 3) ? 'low' : 'mid') : 'high';
    const forced = q.get('tier');
    if (forced === 'low' || forced === 'mid' || forced === 'high') tier = forced;
    return { mobile, tier, shortSide, cores, mem };
  }

  const TIERS = {
    // pixelRatio: function of devicePixelRatio. maxPixels caps the drawing buffer.
    high: { pixelRatio: (d) => Math.min(d, 2), maxPixels: 3.2e6, anisotropy: 4, decor: 1.0, ground: 48 },
    mid:  { pixelRatio: () => 1.0,             maxPixels: 2.4e6, anisotropy: 2, decor: 1.0, ground: 40 },
    low:  { pixelRatio: () => 1.0,             maxPixels: 1.6e6, anisotropy: 1, decor: 0.5, ground: 28 },
  };

  const dev = detect();
  C.config = {
    device: dev,
    tier: dev.tier,
    settings: TIERS[dev.tier],
    debug: q.get('debug') === '1',
    test: q.get('test') === '1',
    muted: q.get('mute') === '1',
    reducedMotion: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    // runtime governor: lower render scale when p95 frame time stays above this (ms)
    governor: { p95LimitMs: 33, scales: [1.0, 0.85, 0.75], windowMs: 2000 },
    idleHintSec: 3,
    firstHintSec: 1, // before the first touch the finger appears sooner
  };
})(window.Castle = window.Castle || {});
