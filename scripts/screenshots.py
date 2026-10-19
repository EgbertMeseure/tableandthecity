"""Verification screenshots for Table and the City (desktop 1280x800 + mobile 390x844).
Requires: python3 -m http.server 8765 in the site folder. Fails (exit 1) on any console/page error."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/'
OUT = 'screenshots/'
async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        def watch(pg, tag):
            pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
            pg.on('console', lambda m: m.type == 'error' and errs.append(f'{tag} console: {m.text} @ {m.location.get("url")}'))
            pg.on('response', lambda r: r.status >= 400 and errs.append(f'{tag} HTTP {r.status}: {r.url}'))
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, locale='en-GB')
        pg = await ctx.new_page(); watch(pg, 'desktop')
        await pg.goto(BASE + 'index.html?city=gent', wait_until='networkidle'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + '01-hero.png')
        await pg.click('.hero [data-citysel] button'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + '02-city-selector.png'); await pg.mouse.click(640, 500)
        await pg.evaluate("document.getElementById('categories').scrollIntoView()"); await pg.wait_for_timeout(600)
        await pg.hover('.pillcard[data-cat="5"]'); await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT + '03-categories-hover.png')
        await pg.evaluate("document.getElementById('explore').scrollIntoView()"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=OUT + '04-map-list.png')
        await pg.click('[data-toggle="vegan"]'); await pg.wait_for_timeout(1000)
        await pg.evaluate("document.getElementById('explore').scrollIntoView()"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + '05-filter-vegan.png')
        print('vegan url:', pg.url)
        await pg.click('#reset'); await pg.wait_for_timeout(300)
        await pg.evaluate("document.getElementById('events').scrollIntoView()"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '06-events.png')
        await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + '07-about-footer.png')
        await pg.goto(BASE + 'restaurant.html?city=gent&id=vrijmoed', wait_until='networkidle'); await pg.wait_for_timeout(1800)
        await pg.screenshot(path=OUT + '08-detail.png')
        await pg.evaluate("document.getElementById('main').scrollIntoView()"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=OUT + '09-detail-info.png')
        await pg.goto(BASE + 'index.html?city=antwerpen', wait_until='networkidle'); await pg.wait_for_timeout(800)
        print('inactive city notice:', await pg.text_content('#city-notice'))
        m = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='en-GB')
        mp = await m.new_page(); watch(mp, 'mobile')
        await mp.goto(BASE + 'index.html?city=gent', wait_until='networkidle'); await mp.wait_for_timeout(1200)
        await mp.screenshot(path=OUT + '10-mobile-hero.png')
        await mp.goto(BASE + 'index.html?city=gent&vegan=1', wait_until='networkidle'); await mp.wait_for_timeout(1000)
        await mp.evaluate("document.getElementById('explore').scrollIntoView()"); await mp.wait_for_timeout(800)
        await mp.screenshot(path=OUT + '11-mobile-list.png')
        await mp.goto(BASE + 'restaurant.html?city=gent&id=yusu', wait_until='networkidle'); await mp.wait_for_timeout(1200)
        await mp.screenshot(path=OUT + '12-mobile-detail.png')
        await b.close()
    print('errors:', errs)
    sys.exit(1 if errs else 0)
asyncio.run(main())
