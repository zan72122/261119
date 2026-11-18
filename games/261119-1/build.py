#!/usr/bin/env python3
"""Build games/261119-1/index.html (single self-contained file) from src/ + vendor/.
Usage: python3 build.py     (run from anywhere; no dependencies)"""
import base64, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ['base.js', 'audio.js', 'sets.js', 'props.js', 'girl.js', 'hair.js', 'game.js']


def read(*p):
    with open(os.path.join(HERE, *p), encoding='utf-8') as f:
        return f.read()


def main():
    html = read('src', 'index.template.html')
    three = read('vendor', 'three.min.js')
    parts = []
    for name in ORDER:
        path = os.path.join(HERE, 'src', name)
        if not os.path.exists(path):
            print('skip (missing):', name)
            continue
        parts.append('/* ---- %s ---- */\n%s' % (name, read('src', name)))
    app = '\n'.join(parts)
    fb = os.path.join(HERE, 'src', 'fallback.jpg')
    data = ''
    if os.path.exists(fb):
        with open(fb, 'rb') as f:
            data = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('ascii')
    # </script> inside JS would end the inline block early
    for label, js in (('three', three), ('app', app)):
        if '</script' in js.lower():
            sys.exit('error: "</script" found in %s bundle' % label)
    html = html.replace('/*__THREE__*/', three).replace('/*__APP__*/', app).replace('__FALLBACK_IMG__', data)
    out = os.path.join(HERE, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('wrote %s (%.2f MB)' % (out, os.path.getsize(out) / 1e6))


if __name__ == '__main__':
    main()
