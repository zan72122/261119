// モバイル判定とティア（性能上限）の選択。
// iPad は Mac の UA を名乗るので navigator.maxTouchPoints > 1 で判定する。
import { TIERS } from './config.js';

export function detectTier(params) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const isMobile = (nav.maxTouchPoints || 0) > 1 || /Android|iPhone|iPad|iPod/i.test(nav.userAgent || '');
  let name = isMobile ? 'mid' : 'high';
  const forced = params.get('tier');
  if (forced && TIERS[forced]) name = forced;
  const t = TIERS[name];
  const dpr = isMobile ? 1.0 : Math.min(window.devicePixelRatio || 1, t.dprMax);
  return {
    name,
    isMobile,
    dpr,
    ...t,
    // 実行中に下げられる項目（低下時は shadow を切り、renderScale を下げる）
    downgraded: false,
  };
}
