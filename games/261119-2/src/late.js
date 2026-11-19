// あとから読む部分: たび・おばあちゃんの家。共有の部品は main.js が window.__gf2 に置いた物を使う（tools/build.mjs）。
import { core } from './core.js';
import trip from './scene_trip.js';
import home from './scene_home.js';
core.register(trip); core.register(home);
