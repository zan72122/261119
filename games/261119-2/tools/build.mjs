// ビルド（開発時のみ）: src/main.js を 1 本にまとめて、単一ファイルの index.html を作る。
// usage: node tools/build.mjs [--out <path>] [--entry <path>]
import { build } from 'esbuild';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const out = arg('out') || path.join(root, 'index.html');
const entry = arg('entry') || path.join(root, 'src/main.js');
const r = await build({ entryPoints: [entry], bundle: true, format: 'iife', minify: true, write: false, target: ['safari14'], nodePaths: [path.join(here, 'node_modules')], logLevel: 'warning', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const fbPath = path.join(root, 'src/fallback.jpg');
const fb = fs.existsSync(fbPath) ? 'data:image/jpeg;base64,' + fs.readFileSync(fbPath).toString('base64') : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const html = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8').replace('/*__JS__*/', () => js).replace('__FALLBACK__', () => fb);
fs.writeFileSync(out, html);
console.log('built', out, (html.length / 1024 | 0) + ' KB');
