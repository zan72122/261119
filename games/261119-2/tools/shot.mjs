// Dev helper (not shipped): bundle an ES-module entry with esbuild into a temp HTML page and screenshot it.
// usage: node tools/shot.mjs <entry.js> <out.png> [width height] [waitMs]
// The entry may import 'three' and files from ../src. It should append its own canvas to document.body.
import { build } from 'esbuild';
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import os from 'os';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const [entry, out, w = '390', h = '844', wait = '1500'] = process.argv.slice(2);
const r = await build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, nodePaths: [path.join(here, 'node_modules')], logLevel: 'warning' });
const tmp = path.join(os.tmpdir(), 'shot_' + process.pid + '.html');
fs.writeFileSync(tmp, '<!doctype html><meta charset=utf-8><body style="margin:0;background:#222;overflow:hidden"><script>' + r.outputFiles[0].text.replace(/<\/script/g, '<\\/script') + '</script>');
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('file://' + tmp); await p.waitForTimeout(+wait);
await p.screenshot({ path: out }); await b.close(); fs.unlinkSync(tmp);
console.log('saved', out);
