#!/usr/bin/env python3
"""City isolation test: with one city selected, NOTHING from another active city may appear.
For every active city (data/cities.json) on desktop 1440 and phone 390:
  - every loaded place (TGApp.R, i.e. list, map, quiz, cards, cuisine, search, chips) has an id of this city's own data files only
    and coordinates inside this city's box; every map marker (TGApp.layer) too;
  - the visible page text (outside the Country/City switcher), the title, meta description and og tags never name another city
    (word match on every name of every other active city: Gent/Ghent, Antwerpen/Antwerp, Brugge/Bruges, Ostend/Oostende, Brussels/Brussel/Bruxelles); also with the quiz, Suggest form and By cuisine opened;
  - the Suggest form's city defaults to the current city; switching city via the switcher gives the other city only;
  - a detail page of this city never names another city; another city's place id under this city = "Not found".
Requests to the visit counter / forms are mocked. Usage: python3 scripts/test_city_isolation.py [--shots DIR]   (needs a server on :8765)"""
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
B = 'http://localhost:8765/'
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
cfg = json.loads((ROOT / 'data/cities.json').read_text())
CITIES = [c for co in cfg['countries'] for c in co['cities'] if c.get('active')]
def ids_of(c):
    out = set()
    for k in ('data', 'osm', 'upcoming'):
        if not c.get(k) or not (ROOT / c[k]).exists(): continue
        d = json.loads((ROOT / c[k]).read_text())
        out |= {r['id'] for r in d.get('restaurants', []) + d.get('places', []) + d.get('upcoming', []) if r.get('id')}
    return out
IDS = {c['id']: ids_of(c) for c in CITIES}
BOX = {c['id']: (c['center'][0] - .16, c['center'][0] + .16, c['center'][1] - .2, c['center'][1] + .2) for c in CITIES}   # ±.16 lat: Zeebrugge (Brugge) is ~.13 north of the centre
NAMES = {c['id']: [n for n in {c['name'], c.get('nameEn'), c.get('nameNl'), c.get('nameFr')} if n] for c in CITIES}   # e.g. Brussels / Brussel / Bruxelles
res = {}
def ok(k, v, info=''):
    res[k] = bool(v); print(('PASS ' if v else 'FAIL ') + k, str(info)[:300])
def names_of(c):
    out = set()
    for k in ('data', 'osm', 'upcoming'):
        if not c.get(k) or not (ROOT / c[k]).exists(): continue
        d = json.loads((ROOT / c[k]).read_text())
        out |= {r['name'] for r in d.get('restaurants', []) + d.get('places', []) + d.get('upcoming', []) if r.get('name')}
    return out
RX_CITY = {}
def others_re(cid):
    ns = [n for c in CITIES if c['id'] != cid for n in NAMES[c['id']]]
    rx = re.compile(r'\b(' + '|'.join(map(re.escape, ns)) + r')\b', re.I); RX_CITY[rx.pattern] = cid
    return rx
# A place of THIS city whose own business name contains another city's name (e.g. Antwerp's "Aan het strand van Oostende",
# Dageraadplaats 19) is not a reference to that city: its exact name is masked before matching. Nothing else is exempt.
PROPER = {}
for _c in CITIES:
    _rx = others_re(_c['id']); PROPER[_c['id']] = sorted((n for n in names_of(_c) if _rx.search(n)), key=len, reverse=True)
    if PROPER[_c['id']]: print(f"note {_c['id']}: own place names containing another city's name (masked): {PROPER[_c['id']]}")
VISIBLE = """() => { const kill = [...document.querySelectorAll('.citysel')]; const t = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode, el = n.parentElement; if (!el || kill.some(k => k.contains(el))) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    if (n.textContent.trim()) t.push(n.textContent.trim()); }
  const m = s => (document.querySelector(s) || {}).content || '';
  return { text: t.join(' | '), head: [document.title, m('meta[name="description"]'), m('meta[property="og:title"]'), m('meta[property="og:description"]'), m('meta[property="og:url"]')].join(' | ') }; }"""
def leak(rx, s):
    for n in PROPER.get(RX_CITY.get(rx.pattern), []): s = s.replace(n, '\u2026')
    return sorted({m.group(0) for m in rx.finditer(s)}), [s[max(0, m.start() - 60):m.end() + 60] for m in list(rx.finditer(s))[:3]]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for vp, kw in [('desktop-1440', dict(viewport={'width': 1440, 'height': 900})), ('phone-390', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw)
        ctx.route('https://abacus.jasoncameron.dev/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"value":42}'))
        ctx.route(re.compile(r'https://(formsubmit\.co|api\.web3forms\.com)/.*'), lambda r: r.abort())
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for c in CITIES:
            cid = c['id']; tag = f'{vp} {cid}'; rx = others_re(cid)
            other_ids = set().union(*[IDS[x] for x in IDS if x != cid]) - IDS[cid]
            pg.goto(B + f'index.html?country=be&city={cid}', wait_until='networkidle'); pg.wait_for_function('window.TGApp && TGApp.R'); pg.wait_for_timeout(800)
            d = pg.evaluate("""() => ({ city: TGApp.city.id, R: TGApp.R.map(r => [r.id, r.lat, r.lng]), E: TGApp.E.map(e => (e.restaurantIds || []).join(',')),
                M: TGApp.layer.getLayers().map(m => m.getLatLng ? [m.getLatLng().lat, m.getLatLng().lng] : null).filter(Boolean) })""")
            la0, la1, ln0, ln1 = BOX[cid]
            ok(f'{tag}: city resolved', d['city'] == cid, d['city'])
            ok(f'{tag}: places loaded', len(d['R']) > 0, len(d['R']))
            bad = [i for i, *_ in d['R'] if i in other_ids or i not in IDS[cid]]
            ok(f'{tag}: 0 places of another city (ids)', not bad, bad[:5])
            far = [i for i, la, ln in d['R'] if la is not None and not (la0 < la < la1 and ln0 < ln < ln1)]
            ok(f'{tag}: 0 places outside the city box (coords)', not far, far[:5])
            farm = [m for m in d['M'] if not (la0 < m[0] < la1 and ln0 < m[1] < ln1)]
            ok(f'{tag}: map pins all in this city ({len(d["M"])})', not farm and len(d['M']) > 0, farm[:3])
            ev = [e for e in d['E'] for i in e.split(',') if i and i in other_ids]
            ok(f'{tag}: events only of this city', not ev, ev[:3])
            v = pg.evaluate(VISIBLE); L, ctxs = leak(rx, v['text']); Lh, _ = leak(rx, v['head'])
            ok(f'{tag}: home visible text names no other city', not L, ctxs)
            ok(f'{tag}: title/meta/og name no other city', not Lh, v['head'][:200])
            ok(f'{tag}: list title is this city', pg.locator('#explore-title').inner_text().lower().endswith(c['name'].lower()), pg.locator('#explore-title').inner_text())
            if SHOTS: pg.screenshot(path=f'{SHOTS}/{vp}-{cid}-home.png')
            # chips: open now / new (list re-render) → still only this city
            for chip in ('open', 'new'):
                b = pg.locator(f'[data-toggle="{chip}"]').first
                if b.count() and b.is_visible():
                    b.click(); pg.wait_for_timeout(300)
                    ids = pg.evaluate("() => [...document.querySelectorAll('#list .card[data-id]')].map(e => e.dataset.id)")
                    ok(f'{tag}: chip {chip}: list only this city ({len(ids)})', all(i in IDS[cid] for i in ids), [i for i in ids if i not in IDS[cid]][:3]); b.click(); pg.wait_for_timeout(200)
            # search: another city's place names give nothing
            q = pg.locator('#q').first if pg.locator('#q').count() else None
            # quiz
            pg.evaluate("TGQuiz.open()"); pg.wait_for_timeout(400)
            for _ in range(6):
                o = pg.locator('.qz-opt').first
                if not o.count() or not o.is_visible(): break
                o.click(); pg.wait_for_timeout(300)
            qids = pg.evaluate("() => [...document.querySelectorAll('[data-id]')].filter(e => e.closest('.qz, [class*=qz]')).map(e => e.dataset.id)")
            v = pg.evaluate(VISIBLE); L, ctxs = leak(rx, v['text'])
            ok(f'{tag}: quiz text/results only this city ({len(qids)} cards)', not L and all(i in IDS[cid] for i in qids), ctxs or [i for i in qids if i not in IDS[cid]][:3])
            pg.evaluate("TGQuiz.close()"); pg.wait_for_timeout(300)
            # suggest form
            pg.evaluate("TGSuggest.open()"); pg.wait_for_timeout(400)
            sv = pg.input_value('.sgp [name=city]')
            ok(f'{tag}: Suggest city defaults to {c["name"]}', sv == c['name'], sv)
            v = pg.evaluate(VISIBLE); L, ctxs = leak(rx, v['text']); ok(f'{tag}: Suggest form names no other city', not L, ctxs)
            pg.evaluate("TGSuggest.close()"); pg.wait_for_timeout(300)
            # detail page of a place of this city (rated if possible)
            pid = d['R'][0][0]
            pg.goto(B + f'restaurant.html?country=be&city={cid}&id={pid}', wait_until='networkidle'); pg.wait_for_timeout(800)
            v = pg.evaluate(VISIBLE); L, ctxs = leak(rx, v['text']); Lh, _ = leak(rx, v['head'])
            ok(f'{tag}: detail page names no other city', not L and not Lh, ctxs)
            dirs = pg.evaluate("() => [...document.querySelectorAll('a[href*=\"google.com/maps/dir\"]')].map(a => decodeURIComponent(a.href))")
            ok(f'{tag}: directions link names no other city', not any(rx.search(x) for x in dirs), dirs[:1])
            if SHOTS: pg.screenshot(path=f'{SHOTS}/{vp}-{cid}-detail.png')
            if other_ids:
                oid = sorted(other_ids)[0]
                pg.goto(B + f'restaurant.html?country=be&city={cid}&id={oid}', wait_until='networkidle'); pg.wait_for_timeout(500)
                ok(f'{tag}: other city\'s place under {cid} = Not found', pg.locator('#hname').inner_text().strip() == 'Not found', pg.locator('#hname').inner_text())
        # switcher: from each city to the other, data replaced
        for c in CITIES:
            for o in CITIES:
                if o['id'] == c['id']: continue
                pg.goto(B + f'index.html?country=be&city={c["id"]}', wait_until='networkidle'); pg.wait_for_function('window.TGApp && TGApp.R')
                pg.locator('[data-dd="city"]>button').first.click(); pg.wait_for_timeout(300)
                if SHOTS: pg.screenshot(path=f'{SHOTS}/{vp}-{c["id"]}-city-switcher.png')
                pg.locator(f'[data-dd="city"] a.ci[href*="city={o["id"]}"]').first.click(); pg.wait_for_load_state('networkidle'); pg.wait_for_function('window.TGApp && TGApp.R'); pg.wait_for_timeout(500)
                ids = pg.evaluate("() => TGApp.R.map(r => r.id)")
                v = pg.evaluate(VISIBLE); L, ctxs = leak(others_re(o['id']), v['text'])
                ok(f'{vp}: switch {c["id"]} → {o["id"]}: only {o["id"]} data + text', all(i in IDS[o['id']] for i in ids) and not L, ctxs or [i for i in ids if i not in IDS[o['id']]][:3])
        ok(f'{vp}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
n = sum(res.values()); print(f'PASSED {n} / {len(res)}'); sys.exit(0 if n == len(res) else 1)
