// ?debug=1 overlay: tier, canvas size, fps (avg / p95), draw calls, triangles (hero / scene),
// textures, estimated GPU memory and errors. Values over budget are shown in red.
import { BUDGET } from './config.js';
import { report, nanScan } from './budget.js';

export const errors = [];
export function installErrorCapture() {
  const push = (msg) => { errors.push(String(msg).slice(0, 300)); if (errors.length > 20) errors.shift(); };
  window.addEventListener('error', (e) => push(e.message || e.error || 'error'));
  window.addEventListener('unhandledrejection', (e) => push('promise: ' + ((e.reason && e.reason.message) || e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { push(a.map(String).join(' ')); ce(...a); };
  return push;
}

export class DebugOverlay {
  constructor(enabled) {
    this.enabled = enabled;
    this.frames = new Float32Array(240); this.fi = 0; this.fn = 0;
    this.acc = 0;
    this.last = null; // last report
    this.extra = {};
    if (!enabled) return;
    this.el = document.createElement('div');
    this.el.className = 'r25-debug';
    this.pre = document.createElement('pre');
    this.el.appendChild(this.pre);
    this.buttons = document.createElement('div');
    this.el.appendChild(this.buttons);
    document.body.appendChild(this.el);
  }

  addButton(label, fn) {
    if (!this.enabled) return;
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    this.buttons.appendChild(b);
  }

  /** Frame time in ms (real time, not scaled). */
  frame(ms) {
    this.frames[this.fi] = ms; this.fi = (this.fi + 1) % this.frames.length; this.fn = Math.min(this.fn + 1, this.frames.length);
  }

  fps() {
    if (!this.fn) return { avg: 0, p95: 0 };
    const arr = Array.from(this.frames.subarray(0, this.fn)).sort((a, b) => a - b);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const p95ms = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
    return { avg: 1000 / Math.max(1e-3, mean), p95: 1000 / Math.max(1e-3, p95ms) }; // p95 = fps of the slow 5%
  }

  /** Recompute the budget report (cheap enough every 0.5 s). */
  measure(ctx) {
    const { renderer, scene, heroRoot, tier } = ctx;
    const size = renderer.getDrawingBufferSize(ctx._v || (ctx._v = new ctx.THREE.Vector2()));
    this.last = report(scene, heroRoot, size.x, size.y, tier.msaaSamples);
    this.last.draw = { w: size.x, h: size.y };
    this.last.nan = nanScan(scene, ctx.camera, ctx.state);
    this.nanMax = Math.max(this.nanMax || 0, this.last.nan);
    this.last.nanMax = this.nanMax;
    this.last.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
    return this.last;
  }

  update(dt, ctx) {
    this.acc += dt;
    if (this.acc < 0.5 && this.last) return;
    this.acc = 0;
    const r = this.measure(ctx);
    if (!this.enabled) return;
    const { tier, renderer, state } = ctx;
    const f = this.fps();
    const red = (ok, s) => (ok ? s : `<b class="bad">${s}</b>`);
    const k = (n) => (n / 1000).toFixed(1) + 'k';
    const css = { w: renderer.domElement.clientWidth, h: renderer.domElement.clientHeight };
    const lines = [
      `tier ${tier.name}${tier.forced ? ' (forced)' : ''}  dpr ${renderer.getPixelRatio().toFixed(2)}  msaa ${tier.msaaSamples}`,
      `canvas ${css.w}x${css.h} css  ${r.draw.w}x${r.draw.h} px`,
      `fps ${f.avg.toFixed(0)} avg / ${f.p95.toFixed(0)} p95`,
      `draw calls ${r.info.calls}  (hero ${red(r.hero.calls <= BUDGET.heroDrawCalls, r.hero.calls)} / scene ${red(r.scene.calls <= BUDGET.sceneDrawCalls, r.scene.calls)})`,
      `tris drawn ${red(r.info.triangles <= BUDGET.trisTotal, k(r.info.triangles))}  in scene ${red(r.total.tris <= BUDGET.trisTotal, k(r.total.tris))}`,
      `  hero ${red(r.hero.tris <= BUDGET.trisHero, k(r.hero.tris))} / scene ${red(r.scene.tris <= BUDGET.trisScene, k(r.scene.tris))}`,
      `textures ${r.total.textures} (gl ${r.info.textures})  hero ${red(r.hero.textures <= BUDGET.heroTextures && r.hero.maxTex <= BUDGET.heroTexSize, r.hero.textures + ' max ' + r.hero.maxTex)}`,
      `GPU est ${red(r.total.gpuMiB <= BUDGET.gpuMiB, r.total.gpuMiB.toFixed(1) + ' MiB')}  (fb ${r.total.fbMiB.toFixed(1)}, hero tex ${r.hero.texMiB.toFixed(1)} geo ${r.hero.geoMiB.toFixed(1)}, scene tex ${r.scene.texMiB.toFixed(1)} geo ${r.scene.geoMiB.toFixed(1)})`,
      `stage r${state.round} ${state.stage} ctl ${state.control || '-'} p ${(state.progress || 0).toFixed(2)}  ${ctx.extraLine || ''}`,
      `NaN ${red(r.nanMax === 0, r.nan + ' now / ' + r.nanMax + ' max')}  ctx lost ${ctx.losses || 0} restored ${ctx.restores || 0}  boot ${ctx.bootMs || '-'} ms  first frame ${ctx.firstFrameMs || '-'} ms`,
      `errors ${errors.length}${errors.length ? '\n  ' + errors.slice(-4).join('\n  ') : ''}`,
    ];
    this.pre.innerHTML = lines.join('\n');
  }
}
