// WebAudio sound effects, all synthesised (no files). The context is created on the first
// touch (iOS needs a user gesture) and suspended while the page is hidden.

const PENTA = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3, 2637];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.motor = null;
    this.motorLevel = 0;
    this.last = {};
    this.minGap = { tick: 0.04, ratchet: 0.06, creak: 0.12, chug: 0.08, hint: 0.25, pop: 0.05 };
    this.count = 0; // sounds played (debug)
  }

  /** Call from a pointerdown/touchend handler. Safe to call many times. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.75;
        this.master.connect(comp); comp.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._startMotor();
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch (e) { /* audio is optional */ }
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _startMotor() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 58;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 87;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this.motor = { g, o1, o2, lp };
  }

  /** Continuous machine hum, level 0..1 (smoothed). */
  setMotor(level) {
    if (!this.motor) return;
    level = Math.max(0, Math.min(1, level || 0));
    if (Math.abs(level - this.motorLevel) < 0.01) return;
    this.motorLevel = level;
    const t = this.ctx.currentTime;
    this.motor.g.gain.setTargetAtTime(level * 0.09, t, 0.08);
    this.motor.o1.frequency.setTargetAtTime(52 + level * 22, t, 0.1);
    this.motor.o2.frequency.setTargetAtTime(78 + level * 33, t, 0.1);
    this.motor.lp.frequency.setTargetAtTime(260 + level * 260, t, 0.1);
  }

  _env(t, attack, dur, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    g.connect(this.master);
    return g;
  }
  _tone(type, f0, t, dur, peak, f1, attack = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(this._env(t, attack, dur, peak));
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  _noise(t, dur, peak, ftype, freq, q = 1, f1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f); f.connect(this._env(t, 0.003, dur, peak));
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.05);
  }

  /** name: one of SOUND_NAMES (hero) or shell-only: toot, chug, chime, fanfare */
  play(name, opts) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const gain = Math.max(0, Math.min(1, (opts && opts.gain) ?? 1));
    const pitch = Math.max(0.5, Math.min(2, (opts && opts.pitch) ?? 1));
    const t = this.ctx.currentTime + 0.005;
    const gap = this.minGap[name] || 0.02;
    if (this.last[name] && t - this.last[name] < gap) return;
    this.last[name] = t;
    this.count++;
    const P = pitch, G = gain;
    switch (name) {
      case 'tick':
        this._tone('square', 2300 * P, t, 0.018, 0.035 * G);
        this._noise(t, 0.02, 0.06 * G, 'bandpass', 3200 * P, 3);
        break;
      case 'ratchet':
        this._noise(t, 0.03, 0.14 * G, 'bandpass', 1900 * P, 5);
        this._noise(t + 0.04, 0.03, 0.1 * G, 'bandpass', 2300 * P, 5);
        break;
      case 'creak': {
        const o = this._tone('sawtooth', 190 * P, t, 0.22, 0.05 * G, 140 * P, 0.03);
        const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
        lfo.frequency.value = 28; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t); lfo.stop(t + 0.3);
        break;
      }
      case 'clunk':
        this._tone('sine', 150 * P, t, 0.22, 0.5 * G, 55);
        this._noise(t, 0.08, 0.25 * G, 'lowpass', 500 * P, 1);
        break;
      case 'lock': // カチン!
        this._noise(t, 0.012, 0.5 * G, 'highpass', 3500, 1);
        this._tone('sine', 1568 * P, t, 0.7, 0.22 * G);
        this._tone('sine', 2637 * P, t + 0.01, 0.45, 0.12 * G);
        this._tone('triangle', 784 * P, t, 0.35, 0.16 * G);
        break;
      case 'sparkle':
        for (let i = 0; i < 6; i++) this._tone('sine', PENTA[(i * 3 + 1) % PENTA.length] * P, t + i * 0.055, 0.28, 0.07 * G);
        break;
      case 'pop':
        this._tone('sine', 320 * P, t, 0.09, 0.3 * G, 950 * P);
        break;
      case 'whoosh':
        this._noise(t, 0.4, 0.2 * G, 'bandpass', 400 * P, 1.2, 2200 * P);
        break;
      case 'hint':
        this._tone('sine', 523 * P, t, 0.22, 0.16 * G, 0, 0.01);
        this._tone('sine', 784 * P, t + 0.07, 0.22, 0.1 * G, 0, 0.01);
        break;
      case 'toot': // train whistle "poo-poo"
        for (const [dt, len] of [[0, 0.22], [0.28, 0.38]]) {
          for (const f of [880, 1108]) {
            const o = this._tone('sine', f * P, t + dt, len, 0.07 * G, 0, 0.04);
            const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
            lfo.frequency.value = 6; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
            lfo.start(t + dt); lfo.stop(t + dt + len + 0.05);
          }
        }
        break;
      case 'chug':
        this._noise(t, 0.07, 0.07 * G, 'lowpass', 700, 1);
        break;
      case 'chime':
        [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this._tone('triangle', f * P, t + i * 0.09, 0.45, 0.12 * G));
        break;
      case 'fanfare':
        [[523, 0], [659, 0.16], [784, 0.32], [1046.5, 0.48], [784, 0.72], [1046.5, 0.86]].forEach(([f, d], i) => {
          const len = i === 5 ? 0.9 : 0.2;
          this._tone('triangle', f * P, t + d, len, 0.16 * G, 0, 0.01);
          this._tone('sine', f * 2 * P, t + d, len * 0.8, 0.04 * G, 0, 0.01);
        });
        break;
      default:
        this.count--;
    }
  }
}
