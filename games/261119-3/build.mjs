// node build.mjs -> index.html (single self-contained file)
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#e9d8bf"/></svg>');

export async function build({ plugins = [], outFile = path.join(root, 'index.html') } = {}) {
  const res = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['safari15'],
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
    plugins,
  });
  let js = res.outputFiles[0].text;
  // keep the inline script from terminating early / entering HTML comment states
  js = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

  const fb = path.join(root, 'assets/fallback.jpg');
  const fallbackSrc = existsSync(fb)
    ? 'data:image/jpeg;base64,' + readFileSync(fb).toString('base64')
    : PLACEHOLDER_IMG;

  const ps = path.join(root, 'assets/poster.jpg');
  const posterSrc = existsSync(ps)
    ? 'data:image/jpeg;base64,' + readFileSync(ps).toString('base64')
    : PLACEHOLDER_IMG;

  const tpl = readFileSync(path.join(root, 'index.template.html'), 'utf8');
  // function replacers: no `$` pattern interpretation inside the bundle
  const html = tpl.replace('__POSTER_SRC__', () => posterSrc).replace('__FALLBACK_SRC__', () => fallbackSrc).replace('__BUNDLE__', () => js);
  writeFileSync(outFile, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`${path.relative(root, outFile) || outFile}: ${kb} KiB (script ${(Buffer.byteLength(js) / 1024).toFixed(1)} KiB)`);
  return outFile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error(e.message || e); process.exit(1); });
}
