"""Verification screenshots for Table and the City. Desktop 1366x768 + 1920x1080, mobile 390x844.
Requires: python3 -m http.server 8765 in the site folder. Exit 1 on any console/page/HTTP error."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/'; OUT = 'screenshots/'
THIRD = lambda u: any(h in (u or '') for h in ('instagram.com', 'cdninstagram', 'fbcdn', 'facebook'))
PEEK = "(() => { const h = document.querySelector('#categories h2').getBoundingClientRect(); const p = document.querySelector('.pillcard').getBoundingClientRect(); return {vh: innerHeight, heading: Math.round(h.top), pills: Math.round(p.top)}; })()"
async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        def watch(pg, tag):
            pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
            # third-party embeds (Instagram/Facebook CDN) log their own noise; only count errors from our site
            pg.on('console', lambda m: m.type == 'error' and not THIRD(m.location.get('url', '')) and errs.append(f'{tag} console: {m.text}'))
            pg.on('response', lambda r: r.status >= 400 and not THIRD(r.url) and errs.append(f'{tag} HTTP {r.status}: {r.url}'))
        async def ctx(w, h, dpr=1, tag=''):
            c = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, locale='en-GB')
            pg = await c.new_page(); watch(pg, tag or f'{w}x{h}'); return pg
        # hero peek at common sizes
        for w, h in [(1366, 768), (1536, 864), (1920, 1080)]:
            pg = await ctx(w, h)
            await pg.goto(BASE + 'index.html?country=be&city=gent', wait_until='networkidle'); await pg.wait_for_timeout(1200)
            m = await pg.evaluate(PEEK); print(f'peek {w}x{h}:', m, 'OK' if m['pills'] < m['vh'] - 20 and m['heading'] < m['vh'] else 'NO PEEK')
            if w != 1536: await pg.screenshot(path=OUT + f'01-hero-{w}x{h}.png')
            if w == 1366:
                await pg.click('[data-dd="country"]>button'); await pg.click('[data-soon="France"]'); await pg.wait_for_timeout(300)
                await pg.screenshot(path=OUT + '02-country-selector.png'); await pg.mouse.click(700, 600)
                await pg.click('[data-dd="city"]>button'); await pg.wait_for_timeout(300)
                await pg.screenshot(path=OUT + '02b-city-selector.png'); await pg.mouse.click(700, 600)
                await pg.evaluate("document.getElementById('categories').scrollIntoView()"); await pg.wait_for_timeout(500)
                await pg.hover('.pillcard[data-cat="5"]'); await pg.wait_for_timeout(900)
                await pg.screenshot(path=OUT + '03-categories-hover.png')
                await pg.evaluate("document.getElementById('explore').scrollIntoView()"); await pg.wait_for_timeout(1000)
                await pg.screenshot(path=OUT + '04-map-list.png')
                await pg.click('[data-toggle="vegan"]'); await pg.wait_for_timeout(600)
                await pg.click('#btn-more'); await pg.wait_for_timeout(700)
                await pg.screenshot(path=OUT + '05-more-filters.png')
                await pg.click('#mf-apply'); await pg.wait_for_timeout(600)
                await pg.screenshot(path=OUT + '05b-vegan-reset-link.png'); print('vegan url:', pg.url)
                await pg.click('#reset'); await pg.wait_for_timeout(300)
                await pg.evaluate("document.getElementById('events').scrollIntoView()"); await pg.wait_for_timeout(600)
                await pg.screenshot(path=OUT + '06-events.png')
                print('events shown:', await pg.eval_on_selector_all('#evlist .ev__date', 'e=>e.map(x=>x.textContent)'))
                card = pg.locator('.pillcard[data-cat="5"]'); await card.scroll_into_view_if_needed(); await card.hover(); await pg.wait_for_timeout(900)
                await card.screenshot(path=OUT + '03b-veggie-card.png')
                # detail with Instagram embeds (official embed.js), feature tiles, Reserve button
                await pg.goto(BASE + 'restaurant.html?country=be&city=gent&id=bask', wait_until='networkidle'); await pg.wait_for_timeout(1200)
                await pg.screenshot(path=OUT + '07-detail-plain-hero.png')
                await pg.evaluate("document.getElementById('main').scrollIntoView({behavior:'instant'})"); await pg.wait_for_timeout(800)
                await pg.screenshot(path=OUT + '08-detail-info-tiles.png')
                await pg.evaluate("document.querySelector('.ftgrid').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(400)
                await pg.screenshot(path=OUT + '08b-feature-tiles.png')
                print('reserve:', await pg.get_attribute('#reserve', 'href'), await pg.get_attribute('#reserve', 'rel'))
                await pg.evaluate("document.getElementById('gallery').scrollIntoView({behavior:'instant'})"); await pg.wait_for_timeout(7000)
                await pg.screenshot(path=OUT + '09-gallery-instagram.png')
                print('instagram embeds: blockquotes', await pg.evaluate("document.querySelectorAll('#gal-grid .tile--ig').length"),
                      'rendered iframes', await pg.evaluate("document.querySelectorAll('#gal-grid iframe.instagram-media-rendered, #gal-grid iframe[id^=instagram-embed]').length"))
                # Commons photo hero + lightbox
                await pg.goto(BASE + 'restaurant.html?country=be&city=gent&id=tribune', wait_until='networkidle'); await pg.wait_for_timeout(1200)
                await pg.screenshot(path=OUT + '07b-detail-commons-hero.png')
                await pg.evaluate("document.getElementById('gallery').scrollIntoView({behavior:'instant'})"); await pg.wait_for_timeout(800)
                await pg.click('.tile__btn[data-i="0"]'); await pg.wait_for_timeout(1200)
                await pg.screenshot(path=OUT + '10-lightbox-commons.png')
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
                print('lightbox closed:', await pg.eval_on_selector('#lb', 'e=>e.hidden'))
                # gallery empty state
                await pg.goto(BASE + 'restaurant.html?country=be&city=gent&id=le-baan-thai', wait_until='networkidle'); await pg.wait_for_timeout(800)
                await pg.evaluate("document.getElementById('gallery').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(500)
                await pg.screenshot(path=OUT + '09b-gallery-empty.png')
                print('empty state:', await pg.text_content('.gal-empty__t'))
                await pg.goto(BASE + 'index.html?country=fr', wait_until='networkidle'); await pg.wait_for_timeout(600)
                print('inactive country notice:', await pg.text_content('#city-notice'))
        mp = await ctx(390, 844, 2, 'mobile')
        await mp.goto(BASE + 'index.html?country=be&city=gent', wait_until='networkidle'); await mp.wait_for_timeout(1200)
        print('peek mobile:', await mp.evaluate(PEEK))
        await mp.screenshot(path=OUT + '11-mobile-hero.png')
        await mp.click('[data-dd="country"]>button'); await mp.wait_for_timeout(300)
        await mp.screenshot(path=OUT + '11b-mobile-country.png'); await mp.mouse.click(200, 700)
        await mp.goto(BASE + 'index.html?country=be&city=gent&vegan=1', wait_until='networkidle'); await mp.wait_for_timeout(900)
        await mp.evaluate("document.getElementById('explore').scrollIntoView()"); await mp.wait_for_timeout(700)
        await mp.screenshot(path=OUT + '12-mobile-list.png')
        await mp.goto(BASE + 'restaurant.html?country=be&city=gent&id=oak', wait_until='networkidle'); await mp.wait_for_timeout(1000)
        await mp.evaluate("document.querySelector('.dcta').scrollIntoView({block:'start',behavior:'instant'})"); await mp.wait_for_timeout(500)
        await mp.screenshot(path=OUT + '13-mobile-reserve.png')
        await mp.evaluate("document.querySelector('.ftgrid').scrollIntoView({block:'start',behavior:'instant'})"); await mp.wait_for_timeout(500)
        await mp.screenshot(path=OUT + '13b-mobile-tiles.png')
        await mp.evaluate("document.getElementById('gallery').scrollIntoView({behavior:'instant'})"); await mp.wait_for_timeout(7000)
        await mp.screenshot(path=OUT + '14-mobile-gallery-instagram.png')
        await b.close()
    print('errors:', errs); sys.exit(1 if errs else 0)
asyncio.run(main())
