#!/usr/bin/env python3
"""Language switcher check: each language loads the landing, a guide and a place page without console errors, and no
English UI string from scripts/i18n_strings.txt is left visible (outside restaurant names / curated text).
  python3 scripts/test_i18n.py [base_url] [--dump fr]   (serve the repo first, e.g. python3 -m http.server 8765)"""
import re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
B = next((a for a in sys.argv[1:] if a.startswith('http')), 'http://localhost:8765/')
DUMP = sys.argv[sys.argv.index('--dump') + 1] if '--dump' in sys.argv else None
import json
def dict_of(l):  # keys whose translation differs from the English (same-word translations may stay visible)
    s = (Path(__file__).parent.parent / 'js' / 'i18n' / f'{l}.js').read_text(encoding='utf-8')
    d = json.loads(s[s.index(' = {') + 3:s.rstrip().rindex(';')]); return sorted(k for k, v in d.items() if v != k and '{' not in k)
JS = r'''(keys) => { const SKIP = '[data-i18n-skip], script, style, .card h3, .qz-card__name, .ev__title, .ev__meta, .ev__desc, .ev__type, .qz-card__type, #hname, .summary, .sources, .changelog, #about-text, .quote, .credit, .pill-credit, .wl-card__tag, .ws-cap, .leaflet-popup-content, .resv-note, .dmap-cap, textarea, .langsel, .leaflet-control-attribution, #wl-creds-list, .site-footer .wordmark, #ig, #gal-grid, .wl-card__name';
  const out = [], all = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const s = n.nodeValue.trim(), p = n.parentElement; if (!s || !p || p.closest(SKIP) || !p.getClientRects().length) continue; all.push(s); if (keys.includes(s)) out.push(s); }
  document.querySelectorAll('[placeholder],[aria-label]').forEach(e => { if (e.closest(SKIP)) return; ['placeholder', 'aria-label'].forEach(a => { const v = e.getAttribute(a); if (v && keys.includes(v.trim())) out.push('@' + a + ': ' + v); }); });
  return { left: out, all, lang: document.documentElement.lang, sw: !!document.querySelector('.langsel__btn'), title: document.title }; }'''
fails = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for lang in ['en', 'nl', 'de', 'fr', 'es']:
        for name, path in [('landing', ''), ('guide', 'guide.html?country=be&city=gent'), ('guide-antwerp', 'guide.html?country=be&city=antwerpen'), ('place', None)]:
            pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
            if path is None:
                pg.goto(B + 'guide.html?country=be&city=gent&lang=' + lang); pg.wait_for_timeout(1500)
                href = pg.evaluate("(document.querySelector('#list a[href*=\"restaurant.html\"]')||{}).href"); pg.goto(href)
            else: pg.goto(B + path + ('&' if '?' in path else '?') + 'lang=' + lang)
            pg.wait_for_timeout(2500)
            if name == 'guide':   # open the quiz and answer the first question, then the suggest form
                pg.evaluate("document.querySelector('[data-quiz-open]').click()"); pg.wait_for_timeout(600)
                pg.evaluate("(document.querySelector('.qz__opts button')||{click(){}}).click()"); pg.wait_for_timeout(600)
                r0 = pg.evaluate(JS, dict_of('fr' if lang == 'en' else lang)); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
                pg.evaluate("document.querySelector('[data-suggest]').click()"); pg.wait_for_timeout(500)
            r = pg.evaluate(JS, dict_of('fr' if lang == 'en' else lang))
            errs = [e for e in errs if not re.search(r'favicon|ERR_|net::|instagram|Failed to load resource', e, re.I)]
            left = [] if lang == 'en' else sorted(set(x for x in r['left'] ))
            ok = not errs and not left and r['lang'] == lang and r['sw']
            fails += not ok
            print(f"{'ok ' if ok else 'FAIL'} {lang} {name:13} title={r['title'][:60]!r}" + (f" errors={errs[:3]}" if errs else '') + (f" untranslated={left[:12]}" if left else '') + ('' if r['sw'] else ' NO SWITCHER'))
            if DUMP == lang: print('   ', sorted(set(x for x in r['all'] if re.search(r'\b(the|and|of|to|is|in|for|a|all|more|open|show|with|by|or)\b', x, re.I)))[:80])
            pg.close()
    b.close()
print('PASS' if not fails else f'{fails} FAILED'); sys.exit(1 if fails else 0)
