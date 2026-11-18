import { createEngine } from './engine.js';
import { createAudio } from './audio.js';
import { startGame } from './game.js';

function showFallback() {
  const img = document.getElementById('fallback');
  if (img) img.style.display = 'block';
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
}

function boot() {
  const opts = { passive: false };
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener('gesturestart', stop, opts);
  document.addEventListener('gesturechange', stop, opts);
  document.addEventListener('contextmenu', stop, opts);
  document.addEventListener('dblclick', stop, opts);
  document.addEventListener('touchmove', stop, opts);

  const container = document.getElementById('app');
  let engine;
  try {
    engine = createEngine(container);
  } catch (e) {
    showFallback();
    return;
  }

  let audio;
  try { audio = createAudio(); } catch (e) { audio = null; }
  const safe = (fn) => { try { fn(); } catch (e) { /* ignore */ } };
  if (!audio) {
    const noop = () => {};
    const ch = { set: noop };
    audio = { unlock: noop, suspend: noop, resume: noop, play: noop, mixer: ch, pour: ch, spread: ch, slide: ch, ambience: ch, music: { start: noop, stop: noop, playing: false } };
  }

  const unlock = () => safe(() => audio.unlock());
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('touchend', unlock, { capture: true });

  engine.onVisibility((v) => safe(() => (v ? audio.resume() : audio.suspend())));

  try {
    startGame(engine, audio);
  } catch (e) {
    console.warn(e);
  }
  engine.start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
