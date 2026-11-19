// ビルド（開発時のみ）: 2 本にまとめる。
//   index.html … 土台と最初の場面（つつむ）だけを入れた単一ファイル。すぐ表示できるよう小さくする
//   late.js    … たび・おばあちゃんの家。index.html が遊んでいる間に裏で読み込む（file:// でも読める普通の script）
//   fallback.jpg … WebGL が使えないときだけ読む代わりの絵
// usage: node tools/build.mjs [--out <dir>]
import { build } from 'esbuild';
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..'), src = path.join(root, 'src');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const outDir = arg('out') || root;
const common = { bundle: true, format: 'iife', minify: true, write: false, target: ['safari14'], nodePaths: [path.join(here, 'node_modules')], logLevel: 'warning', legalComments: 'none', metafile: true };
const LATE_FILES = ['scene_trip.js', 'scene_home.js', 'grandma.js'];

// late.js: 共有の部品は window.__gf2 から受け取る
const SHARED = [
  [/^three$/, 'three'],
  [/BufferGeometryUtils\.js$/, 'bgu'],
  [/RoundedBoxGeometry\.js$/, 'rbg'],
  [/^\.\/core\.js$/, 'core'], [/^\.\/parcel\.js$/, 'parcel'], [/^\.\/items\.js$/, 'items'], [/^\.\/truck\.js$/, 'truck'],
];
const shared = { name: 'shared', setup(b) {
  b.onResolve({ filter: /.*/ }, a => { for (const [re, key] of SHARED) if (re.test(a.path)) return { path: key, namespace: 'shared' }; return null; });
  b.onLoad({ filter: /.*/, namespace: 'shared' }, a => ({ contents: `module.exports = window.__gf2.${a.path};`, loader: 'js' }));
} };
const late = await build({ ...common, entryPoints: [path.join(src, 'late.js')], plugins: [shared] });
for (const k of Object.keys(Object.values(late.metafile.outputs)[0].inputs))
  if (/node_modules|\/(core|parcel|items|truck)\.js$/.test(k)) throw new Error('late.js に共有の部品が入っている: ' + k);
const lateJs = late.outputFiles[0].text;
const lateName = 'late.js?v=' + crypto.createHash('sha1').update(lateJs).digest('hex').slice(0, 10);

// index.html: late.js が使う three の部品だけを公開する（three 全体を公開すると使わない部分まで入って重くなる）
const names = new Set();
for (const f of LATE_FILES) for (const m of fs.readFileSync(path.join(src, f), 'utf8').matchAll(/THREE\.([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
const virt = { name: 'virt', setup(b) {
  b.onResolve({ filter: /^gf:three-late$/ }, () => ({ path: 'three-late', namespace: 'virt' }));
  b.onLoad({ filter: /.*/, namespace: 'virt' }, () => ({ contents: `export { ${[...names].sort().join(', ')} } from 'three';`, loader: 'js', resolveDir: here }));
} };
const main = await build({ ...common, entryPoints: [path.join(src, 'main.js')], plugins: [virt], define: { __LATE_SRC__: JSON.stringify(lateName) } });
const js = main.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const fbPath = path.join(src, 'fallback.jpg'), hasFb = fs.existsSync(fbPath);
const html = fs.readFileSync(path.join(src, 'template.html'), 'utf8').replace('/*__JS__*/', () => js).replace('__FALLBACK__', () => hasFb ? 'fallback.jpg' : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
fs.writeFileSync(path.join(outDir, 'late.js'), lateJs);
if (hasFb) fs.copyFileSync(fbPath, path.join(outDir, 'fallback.jpg'));
console.log('built', path.join(outDir, 'index.html'), (html.length / 1024 | 0) + ' KB', '+ late.js', (lateJs.length / 1024 | 0) + ' KB');
