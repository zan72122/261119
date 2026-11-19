// モバイル判定と性能ティア。iPad は Mac の UA を名乗るので maxTouchPoints > 1 で判定する。
export function detectTier(params) {
  const ua = navigator.userAgent || '';
  const isMobile = (navigator.maxTouchPoints || 0) > 1 || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const devMem = navigator.deviceMemory || 8;
  let name = isMobile ? (devMem < 4 ? 'low' : 'mid') : 'high';
  const forced = params.get('tier');
  if (forced === 'low' || forced === 'mid' || forced === 'high') name = forced;
  return makeTier(name, isMobile);
}

export function makeTier(name, isMobile) {
  const base = {
    name, isMobile,
    shadowMapSize: 512,           // 影は 1灯・512² まで
    maxPixels: 4.1e6,             // canvas の画素数上限（デスクトップの高 DPR 対策）
  };
  const T = {
    high: { dpr: Math.min(window.devicePixelRatio || 1, 2), msaa: true, shadows: true, anisotropy: 4, confetti: 160 },
    mid: { dpr: 1, msaa: true, shadows: true, anisotropy: 2, confetti: 160 },
    low: { dpr: isMobile ? 1 : 0.75, msaa: false, shadows: false, anisotropy: 1, confetti: 60 },
  }[name];
  const t = Object.assign(base, T);
  if (isMobile) t.dpr = 1; // モバイルでは devicePixelRatio を 1.0 に固定
  return t;
}
