#!/usr/bin/env python3
"""Instagram / photo layer: data/cities/<city>-instagram.json (loaded by js/common.js as city.instagram).

  python3 scripts/build_instagram_layer.py gent [--research=/workspace/handoff/gent-instagram-research.json] [--check] [--recheck]

1. --research: merges a researcher hand-off [{id,name,instagram_handle,handleSource,posts,ogImage,ogImageSource,note}] into
   `places` (handle verified from a linking page, post permalinks verified via oEmbed, og:image of the own site).
   Research entries carry "origin": "research (approved <date>)" (first hand-off approved by the user 20 Oct 2026; review new hand-offs
   before merging). The site applies them on top of <city>.json /
   <city>-osm.json: a handle replaces a missing/renamed one, posts are used only when a place has none, an og:image only when
   there is no hero yet (≥ 800 px wide, checked here). An og:image the note flags (logo, text overlay, render, chain promo, duplicate…)
   is left out and, as heroReject, also hidden when <city>-heroes.json has the same URL. instagram_handle null = "could not be confirmed" → no profile embed.
2. --check: opens the official profile embed https://www.instagram.com/<handle>/embed/ in headless Chrome (desktop UA, served
   from a 127.0.0.1 page) for every handle not checked yet (--recheck: all) and stores whether it renders the photo grid
   without a login → `embed: {handle: {ok, checked, why?}}`. The site shows profile embeds only for ok handles.
   Polite: 4 embeds per page, one page at a time.
Nothing is downloaded or rehosted; images stay on Instagram / the place's own site.
"""
import io, json, re, sys, threading, http.server, socketserver
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
OUT = ROOT / 'data' / 'cities' / f'{CITY}-instagram.json'
TODAY = date.today().isoformat()
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
# og:images the researcher's note flags as not a plain photo of this place: left out
OG_FLAG = re.compile(r'logo|text|render|chain|promo|same (photo|brand)|brand-wide|duplicate|collage|not confirmed|\bsign\b', re.I)
POST = re.compile(r'^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/?$')


def records():
    cur = json.loads((ROOT / 'data' / 'cities' / f'{CITY}.json').read_text())['restaurants']
    osm = json.loads((ROOT / 'data' / 'cities' / f'{CITY}-osm.json').read_text())['places']
    ids = {r['id'] for r in cur}
    return cur + [o for o in osm if o['id'] not in ids]


def img_width(url):
    import requests
    from PIL import Image
    try:
        r = requests.get(url, headers={'User-Agent': UA}, timeout=15, stream=True)
        if r.status_code != 200 or not r.headers.get('content-type', '').startswith('image/'): return 0, f'HTTP {r.status_code}'
        return Image.open(io.BytesIO(r.raw.read(10_000_000, decode_content=True))).size[0], ''
    except Exception as e:
        return 0, type(e).__name__


def merge_research(db, path):
    data = json.loads(Path(path).read_text())
    known = {r['id'] for r in records()}
    for x in data:
        if x['id'] not in known: print('research: unknown id', x['id']); continue
        prev = db['places'].get(x['id'], {})
        e = {'name': x.get('name'), 'instagram_handle': x.get('instagram_handle'), 'handleSource': x.get('handleSource'),
             'posts': [p for p in (x.get('posts') or []) if POST.match(p)], 'note': x.get('note'), 'origin': f'research (approved {TODAY})'}
        if x.get('ogImage') and OG_FLAG.search(x.get('note') or ''):
            e['ogImageRejected'] = f'{x["ogImage"]} (note flags it: {OG_FLAG.search(x["note"]).group(0)})'
            e['heroReject'] = x['ogImage']          # the site also drops this image when <city>-heroes.json has it
        elif x.get('ogImage'):
            ph = prev.get('heroImage') or {}
            w, why = (ph['w'], '') if ph.get('url') == x['ogImage'] and ph.get('w') else img_width(x['ogImage'])
            if w >= 800: e['heroImage'] = {'url': x['ogImage'], 'source': x.get('ogImageSource') or x.get('handleSource'), 'type': 'og:image', 'w': w, 'checked': TODAY, 'origin': 'research'}
            else: e['ogImageRejected'] = f'{x["ogImage"]} ({"width " + str(w) if w else why}; < 800 px)'
        db['places'][x['id']] = {k: v for k, v in e.items() if v not in (None, [], '') or k == 'instagram_handle'}


def handles(db):
    out = set()
    for r in records():
        h = r.get('instagram_handle') or ((r.get('instagram') or '').rstrip('/').split('/')[-1] if r.get('instagram') else '')
        x = db['places'].get(r['id'])
        if x and 'instagram_handle' in x: h = x['instagram_handle']
        if h: out.add(h)
    return sorted(out)


def check(db, todo):
    from playwright.sync_api import sync_playwright
    class Q(http.server.SimpleHTTPRequestHandler):
        def do_GET(self): self.send_response(200); self.send_header('Content-Type', 'text/html'); self.end_headers(); self.wfile.write(b'<!doctype html><body style="margin:0;display:flex"></body>')
        def log_message(self, *a): pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), Q); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = b.new_context(viewport={'width': 2300, 'height': 800}, user_agent=UA).new_page()
        for i in range(0, len(todo), 4):
            bt = todo[i:i + 4]
            pg.goto(f'http://127.0.0.1:{port}/')
            pg.evaluate("hs=>{document.body.innerHTML=hs.map(h=>`<iframe name='${h}' src='https://www.instagram.com/${h}/embed/' width=540 height=700 style='border:0'></iframe>`).join('')}", bt)
            pg.wait_for_timeout(8000)
            for f in pg.frames[1:]:
                try:
                    d = f.evaluate("({n:[...document.images].filter(i=>i.naturalWidth>=300&&i.getBoundingClientRect().top>100).length,t:document.body.innerText.slice(0,100)})")
                except Exception as e:
                    d = {'n': 0, 't': f'error {type(e).__name__}'}
                db['embed'][f.name] = {'ok': True, 'checked': TODAY} if d['n'] >= 1 else {'ok': False, 'checked': TODAY, 'why': 'profile not found / no grid' if 'broken' in d['t'] else 'no photo grid: ' + d['t'][:60].replace('\n', ' ')}
            print(i + len(bt), '/', len(todo), [(h, db['embed'].get(h, {}).get('ok')) for h in bt], flush=True)
        b.close()
    srv.shutdown()


def main():
    db = json.loads(OUT.read_text()) if OUT.exists() else {}
    db.setdefault('places', {}); db.setdefault('embed', {})
    if OPT.get('--research'): merge_research(db, OPT['--research'] if OPT['--research'] is not True else '/workspace/handoff/gent-instagram-research.json')
    if OPT.get('--check') or OPT.get('--recheck'):
        hs = handles(db)
        check(db, [h for h in hs if OPT.get('--recheck') or h not in db['embed']])
    db = {'about': 'Instagram / photo layer for the site (scripts/build_instagram_layer.py). places: researched handles, verified post permalinks and own-site og:images '
                   '(origin "research (approved <date>)"). embed: does https://www.instagram.com/<handle>/embed/ render the photo grid without a login '
                   '(headless Chrome, desktop UA, localhost origin). Nothing is downloaded or rehosted.',
          'places': dict(sorted(db['places'].items())), 'embed': dict(sorted(db['embed'].items()))}
    OUT.write_text(json.dumps(db, ensure_ascii=False, indent=1) + '\n')
    ok = sum(v['ok'] for v in db['embed'].values())
    print(f"places: {len(db['places'])}, embeds checked: {len(db['embed'])}, ok: {ok}")
    for k, v in db['places'].items():
        if v.get('ogImageRejected'): print('  og:image not used:', k, v['ogImageRejected'])


if __name__ == '__main__':
    main()
