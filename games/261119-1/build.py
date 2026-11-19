#!/usr/bin/env python3
"""Build games/261119-1 from src/: index.html (small page with an inline poster) + app.js (all of src/*.js).
vendor/three.min.js and src/fallback.jpg are loaded from where they are.
Usage: python3 build.py     (run from anywhere; no dependencies)"""
import base64, hashlib, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ['base.js', 'audio.js', 'sets.js', 'props.js', 'girl.js', 'hair.js', 'game.js']


def read(*p):
    with open(os.path.join(HERE, *p), encoding='utf-8') as f:
        return f.read()


def data_uri(*p):
    path = os.path.join(HERE, *p)
    if not os.path.exists(path):
        return ''
    with open(path, 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('ascii')


def main():
    html = read('src', 'index.template.html')
    parts = []
    for name in ORDER:
        path = os.path.join(HERE, 'src', name)
        if not os.path.exists(path):
            print('skip (missing):', name)
            continue
        parts.append('/* ---- %s ---- */\n%s' % (name, read('src', name)))
    app = '\n'.join(parts) + '\n'
    ver = hashlib.sha1(app.encode('utf-8')).hexdigest()[:10]
    with open(os.path.join(HERE, 'app.js'), 'w', encoding='utf-8') as f:
        f.write(app)
    # poster: tiny stills of the opening view (portrait / landscape), blurred by CSS until the first real frame
    html = (html.replace('__POSTER_P__', data_uri('src', 'poster-p.jpg'))
                .replace('__POSTER_L__', data_uri('src', 'poster-l.jpg'))
                .replace('__VER__', ver))
    out = os.path.join(HERE, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('wrote index.html (%.1f KB) + app.js (%.0f KB)' % (os.path.getsize(out) / 1e3, len(app.encode('utf-8')) / 1e3))


if __name__ == '__main__':
    main()
