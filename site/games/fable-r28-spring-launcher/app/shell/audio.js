// WebAudio の効果音（すべて合成。音声ファイルなし＝file:// でも動く）。
// iOS は最初のタッチの中で resume() が必要 → unlock() を pointerdown/touchend から呼ぶ。
// 使える音の名前は SOUND_NAMES（docs/HERO-SPEC.md にも同じ一覧）。

export const SOUND_NAMES = [
  // hero 用
  'click',    // 歯止めが1歯かかる「カチッ」          gain, pitch
  'clack',    // 歯止めが外れる/大きく閉じる「ガチャ」 gain
  'press',    // ボタンを押す「ぽん」                 gain
  'boing',    // ばねが伸びて発射「びよーん」         gain, pitch(0.7..1.4 で強さ)
  'tick',     // ダイヤルの1目盛り                    gain, pitch
  'roll',     // 次の球が転がって装填                 gain
  'creak',    // レバーをぎゅっと引くきしみ           gain, pitch
  'whoosh',   // 風切り
  // shell が自分で使う
  'chime', 'bounce', 'catch', 'thud', 'pop', 'fanfare', 'sparkle',
];

export class AudioBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.last = new Map();
    this.voices = 0;
    this.muted = false;
    this.chimeStep = 0;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(comp); comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 1.0;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch (e) { /* 音が出なくても遊べる */ }
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  play(name, { gain = 1, pitch = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted) return;
    const now = ctx.currentTime;
    const prev = this.last.get(name) || 0;
    if (now - prev < 0.03) return;            // 同じ音の連打を間引く
    if (this.voices > 18) return;             // 同時発音の上限
    this.last.set(name, now);
    gain = Math.max(0, Math.min(1.5, gain));
    pitch = Math.max(0.25, Math.min(4, pitch));
    const fn = this['_' + name];
    if (fn) fn.call(this, now, gain, pitch);
  }

  // ---- 部品 ----
  _env(t, a, d, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(this.master);
    this.voices++;
    setTimeout(() => { this.voices--; }, (a + d) * 1000 + 50);
    return g;
  }
  _osc(type, f0, f1, t, dur, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  _noise(t, dur, dest, type = 'bandpass', f = 2000, q = 1, f1 = f) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f, t);
    if (f1 !== f) filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(filt); filt.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- 音色 ----
  _click(t, g, p) {
    const e = this._env(t, 0.002, 0.06, 0.5 * g);
    this._osc('square', 2200 * p, 1400 * p, t, 0.05, e);
    this._noise(t, 0.04, this._env(t, 0.001, 0.04, 0.6 * g), 'highpass', 3000, 0.7);
  }
  _clack(t, g, p) {
    this._osc('triangle', 700 * p, 300 * p, t, 0.12, this._env(t, 0.002, 0.12, 0.6 * g));
    this._noise(t, 0.08, this._env(t, 0.001, 0.08, 0.7 * g), 'bandpass', 1800 * p, 1.2);
  }
  _press(t, g, p) {
    this._osc('sine', 520 * p, 300 * p, t, 0.15, this._env(t, 0.004, 0.16, 0.7 * g));
  }
  _boing(t, g, p) {
    // びよーん：周波数が上がりながらビブラートが減衰
    const e = this._env(t, 0.01, 0.75, 0.7 * g);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150 * p, t);
    o.frequency.exponentialRampToValueAtTime(560 * p, t + 0.22);
    o.frequency.exponentialRampToValueAtTime(380 * p, t + 0.7);
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.setValueAtTime(22, t);
    lfo.frequency.linearRampToValueAtTime(9, t + 0.7);
    lg.gain.setValueAtTime(90 * p, t);
    lg.gain.exponentialRampToValueAtTime(3, t + 0.7);
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(e); o.start(t); lfo.start(t); o.stop(t + 0.85); lfo.stop(t + 0.85);
    this._noise(t, 0.3, this._env(t, 0.01, 0.3, 0.25 * g), 'bandpass', 800, 0.8, 3000);
  }
  _tick(t, g, p) {
    this._osc('square', 3000 * p, 2600 * p, t, 0.02, this._env(t, 0.001, 0.025, 0.25 * g));
  }
  _roll(t, g, p) {
    const e = this._env(t, 0.05, 0.5, 0.35 * g);
    this._noise(t, 0.55, e, 'lowpass', 500 * p, 2, 250 * p);
    this._osc('sine', 90 * p, 70 * p, t, 0.5, this._env(t, 0.05, 0.45, 0.25 * g));
  }
  _creak(t, g, p) {
    const e = this._env(t, 0.03, 0.18, 0.2 * g);
    this._osc('sawtooth', 160 * p, 210 * p, t, 0.2, e);
  }
  _whoosh(t, g, p) {
    this._noise(t, 0.5, this._env(t, 0.08, 0.45, 0.35 * g), 'bandpass', 400 * p, 0.9, 2400 * p);
  }
  _chime(t, g, p) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const n = scale[this.chimeStep++ % scale.length];
    const f = 880 * Math.pow(2, n / 12) * p;
    for (const [m, a] of [[1, 0.5], [2.76, 0.18], [5.4, 0.08]]) {
      this._osc('sine', f * m, f * m, t, 1.2, this._env(t, 0.003, 1.1, a * g));
    }
  }
  _bounce(t, g, p) {
    const e = this._env(t, 0.005, 0.35, 0.6 * g);
    this._osc('sine', 120 * p, 330 * p, t, 0.25, e);
    this._osc('triangle', 240 * p, 520 * p, t, 0.2, this._env(t, 0.005, 0.2, 0.2 * g));
  }
  _catch(t, g, p) {
    // ぽすん：やわらかい低い音＋布の音
    this._osc('sine', 210 * p, 80 * p, t, 0.22, this._env(t, 0.004, 0.25, 0.9 * g));
    this._noise(t, 0.18, this._env(t, 0.003, 0.18, 0.4 * g), 'lowpass', 1200, 0.7, 300);
  }
  _thud(t, g, p) {
    this._osc('sine', 120 * p, 60 * p, t, 0.15, this._env(t, 0.003, 0.15, 0.6 * g));
  }
  _pop(t, g, p) {
    this._osc('sine', 500 * p, 1300 * p, t, 0.08, this._env(t, 0.002, 0.09, 0.45 * g));
  }
  _sparkle(t, g, p) {
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.06;
      const f = (1760 + i * 440) * p;
      this._osc('sine', f, f, tt, 0.25, this._env(tt, 0.002, 0.25, 0.12 * g));
    }
  }
  _fanfare(t, g, p) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const times = [0, 0.12, 0.24, 0.36, 0.56, 0.68];
    notes.forEach((f, i) => {
      const tt = t + times[i];
      const d = i === notes.length - 1 ? 0.8 : 0.16;
      this._osc('triangle', f * p, f * p, tt, d, this._env(tt, 0.01, d, 0.45 * g));
      this._osc('sine', f * 2 * p, f * 2 * p, tt, d, this._env(tt, 0.01, d, 0.12 * g));
    });
  }
}
