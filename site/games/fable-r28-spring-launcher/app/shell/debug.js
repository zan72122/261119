// ?debug=1 の小さなオーバーレイ：tier・canvas サイズ・fps(平均/p95)・draw call・三角形・
// テクスチャ数と見積もり GPU メモリ・エラー。エラーはデバッグでなくても集める（煙テスト用）。
import { countTriangles } from './util.js';

export const errors = [];
export function captureErrors() {
  const push = (msg) => { errors.push(String(msg).slice(0, 300)); if (errors.length > 50) errors.shift(); };
  window.addEventListener('error', (e) => push(e.message || e.error || 'error'));
  window.addEventListener('unhandledrejection', (e) => push('promise: ' + (e.reason && e.reason.message || e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { push(a.map(String).join(' ')); ce(...a); };
  return push;
}

/** GPU メモリの見積もり（バイト）。テクスチャはミップ込み 4/3、幾何は属性の実サイズ。 */
export function estimateGpu(THREE, renderer, scene, tier) {
  const texs = new Map();
  const geos = new Set();
  let instBytes = 0;
  scene.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.isInstancedMesh) {
      instBytes += o.instanceMatrix.array.byteLength;
      if (o.instanceColor) instBytes += o.instanceColor.array.byteLength;
    }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'lightMap', 'envMap']) {
        const t = m[k];
        if (t && t.isTexture) {
          // Source とラップ設定が同じなら GPU 上は1枚
          const img = t.image || {};
          const key = (t.source ? t.source.uuid : t.uuid) + ':' + t.wrapS + ':' + t.wrapT;
          if (!texs.has(key)) {
            const w = img.width || 1, h = img.height || 1;
            const mip = t.generateMipmaps !== false ? 4 / 3 : 1;
            texs.set(key, { name: (t.userData && t.userData.file) || t.name || (t.isCanvasTexture ? 'canvas:hero?' : '?'), bytes: w * h * 4 * mip, w, h });
          }
        }
      }
    }
  });
  let geoBytes = 0;
  for (const g of geos) {
    for (const k in g.attributes) geoBytes += g.attributes[k].array.byteLength;
    if (g.index) geoBytes += g.index.array.byteLength;
  }
  let texBytes = 0;
  for (const t of texs.values()) texBytes += t.bytes;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const px = size.x * size.y;
  const samples = tier.antialias ? tier.msaaSamples : 0;
  // 表と裏のカラー（4B×2）＋深度ステンシル（4B）＋ MSAA のマルチサンプル（(4+4)B×samples）
  const fbBytes = px * (4 * 2 + 4) + (samples ? px * 8 * samples : 0);
  const shadowBytes = tier.shadow && renderer.shadowMap.enabled ? tier.shadow * tier.shadow * 4 * 2 : 0; // 低下で影を切ったら解放済み
  const total = texBytes + geoBytes + instBytes + fbBytes + shadowBytes;
  return { total, texBytes, geoBytes: geoBytes + instBytes, fbBytes, shadowBytes, textures: [...texs.values()], texCount: texs.size };
}

export class DebugOverlay {
  constructor(enabled) {
    this.enabled = enabled;
    this.frames = [];
    this.last = 0;
    this.info = {};
    if (!enabled) return;
    this.el = document.createElement('div');
    this.el.className = 'debug';
    document.body.appendChild(this.el);
    this.pre = document.createElement('pre');
    this.el.appendChild(this.pre);
    this.buttons = document.createElement('div');
    this.el.appendChild(this.buttons);
  }

  addButton(label, fn) {
    if (!this.enabled) return;
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    this.buttons.appendChild(b);
  }

  /** 毎フレーム呼ぶ。dt は秒 */
  frame(dt) {
    this.frames.push(dt * 1000);
    if (this.frames.length > 180) this.frames.shift();
  }

  /** 平均 fps だけ（並べ替えなし。毎フレームの自動低下の判定用） */
  avgFps() {
    const f = this.frames;
    if (!f.length) return 0;
    let s = 0;
    for (let i = 0; i < f.length; i++) s += f[i];
    return 1000 * f.length / s;
  }

  fps() {
    const f = this.frames.slice().sort((a, b) => a - b);
    if (!f.length) return { avg: 0, p95: 0 };
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const p95ms = f[Math.min(f.length - 1, Math.floor(f.length * 0.95))];
    return { avg: 1000 / avg, p95: 1000 / p95ms, avgMs: avg, p95Ms: p95ms };
  }

  /** 0.5 秒ごとに表示を更新 */
  update(now, get) {
    if (!this.enabled || now - this.last < 500) return; // 集計は ?debug=1 のときだけ
    this.last = now;
    this.info = get();
    const i = this.info;
    const MiB = (b) => (b / 1048576).toFixed(1);
    this.pre.textContent =
      `tier ${i.tier}${i.downgraded ? '↓' : ''}  mobile ${i.mobile}  dpr ${i.dpr}\n` +
      `canvas ${i.canvas}\n` +
      `fps avg ${i.fps.avg.toFixed(1)}  p95 ${i.fps.p95.toFixed(1)}\n` +
      `draw ${i.calls} (hero meshes ${i.heroDraws})  tris ${i.tris} (hero ${i.heroTris} / scene ${i.sceneTris})\n` +
      `tex ${i.gpu.texCount} (${MiB(i.gpu.texBytes)}MiB)  gpu≈${MiB(i.gpu.total)}MiB\n` +
      `  geo ${MiB(i.gpu.geoBytes)} fb ${MiB(i.gpu.fbBytes)} shadow ${MiB(i.gpu.shadowBytes)}\n` +
      `stage ${i.stage}  next ${i.next}  balls ${i.field.flying}/${i.field.pile}\n` +
      `shots ${i.field.launched} ring ${i.field.ringPasses} pad ${i.field.bounces} catch ${i.field.caught}\n` +
      `ctx ${i.ctx}${i.shadow ? `  shadow redraw ${i.shadow.updates}/${i.shadow.frames}` : ''}\n` +
      `errors ${i.errors.length}${i.errors.length ? '\n ' + i.errors.slice(-3).join('\n ') : ''}`;
  }
}

export { countTriangles };
