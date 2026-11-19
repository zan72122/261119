// game_util.js — small math helpers and a dt-driven, cancellable tween timeline.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
export const easeIn = (k) => k * k * k;
export const linear = (k) => k;
export function backOut(k) {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}
export function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// Timeline: everything advances with engine dt only (pauses with the page),
// every entry can be cancelled, and clear() drops all pending work at once.
export function createTimeline() {
  const list = [];
  function add(dur, fn, done, ease) {
    const tw = { t: 0, dur: Math.max(0, dur || 0), fn: fn || null, done: done || null, ease: ease || null, dead: false };
    list.push(tw);
    return tw;
  }
  return {
    tween(dur, fn, done, ease) { return add(dur, fn, done, ease); },
    after(sec, fn) { return add(sec, null, fn, null); },
    cancel(tw) { if (tw) tw.dead = true; return null; },
    clear() { for (let i = 0; i < list.length; i++) list[i].dead = true; list.length = 0; },
    update(dt) {
      const n = list.length;
      for (let i = 0; i < n && i < list.length; i++) {
        const tw = list[i];
        if (tw.dead) continue;
        tw.t += dt;
        const k = tw.dur > 0 ? Math.min(1, tw.t / tw.dur) : 1;
        if (tw.fn) {
          try { tw.fn(tw.ease ? tw.ease(k) : k, k); } catch (e) { console.warn(e); }
        }
        if (k >= 1 && !tw.dead) {
          tw.dead = true;
          if (tw.done) { try { tw.done(); } catch (e) { console.warn(e); } }
        }
      }
      let j = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].dead) list[j++] = list[i];
      list.length = j;
    },
    get size() { return list.length; },
  };
}
