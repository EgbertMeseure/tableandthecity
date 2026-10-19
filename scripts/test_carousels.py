"""Playwright test: every carousel arrow scrolls its track, arrows disable at the ends,
mouse drag scrolls without opening a card, touch swipe scrolls, keyboard arrows scroll. Exit 1 on failure."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/index.html?country=be&city=gent'
fails = []
def check(cond, msg): print(('PASS ' if cond else 'FAIL ') + msg); cond or fails.append(msg)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await (await b.new_context(viewport={'width': 1366, 'height': 768})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(800)
        sl = lambda id: pg.evaluate(f"document.getElementById('{id}').scrollLeft")
        for tid in ['carousel', 'evlist']:
            await pg.evaluate(f"document.getElementById('{tid}').scrollIntoView({{block:'center',behavior:'instant'}})"); await pg.wait_for_timeout(300)
            prev, nxt = f'[data-car-prev="{tid}"]', f'[data-car-next="{tid}"]'
            check(await pg.is_disabled(prev), f'{tid}: prev disabled at start')
            box = await pg.locator(nxt).bounding_box(); check(box['width'] >= 44 and box['height'] >= 44, f'{tid}: next arrow hit area {box["width"]:.0f}x{box["height"]:.0f}')
            await pg.click(nxt); await pg.wait_for_timeout(900); a = await sl(tid)
            check(a > 50, f'{tid}: next arrow scrolls (scrollLeft={a})')
            await pg.click(prev); await pg.wait_for_timeout(900); a2 = await sl(tid)
            check(a2 < a, f'{tid}: prev arrow scrolls back ({a} -> {a2})')
            for _ in range(15):
                if await pg.is_disabled(nxt): break
                await pg.evaluate(f"document.querySelector('{nxt}').click()"); await pg.wait_for_timeout(600)
            check(await pg.is_disabled(nxt), f'{tid}: next disabled at end')
            await pg.evaluate(f"document.getElementById('{tid}').scrollLeft=0;document.getElementById('{tid}').scrollIntoView({{block:'center',behavior:'instant'}})"); await pg.wait_for_timeout(400)
            # mouse drag
            tb = await pg.locator('#' + tid).bounding_box(); y = tb['y'] + tb['height'] / 2; url0 = pg.url
            await pg.mouse.move(tb['x'] + tb['width'] * .7, y); await pg.mouse.down()
            for i in range(1, 11): await pg.mouse.move(tb['x'] + tb['width'] * .7 - i * 40, y); await pg.wait_for_timeout(16)
            await pg.mouse.up(); await pg.wait_for_timeout(900)
            d = await sl(tid); check(d > 200, f'{tid}: mouse drag scrolls with momentum (scrollLeft={d})')
            check(pg.url == url0 and not await pg.evaluate("document.querySelector('.pillcard.active')!==null"), f'{tid}: drag did not trigger a card click')
            # keyboard
            await pg.evaluate(f"document.getElementById('{tid}').scrollLeft=0"); await pg.wait_for_timeout(400); await pg.focus('#' + tid); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(800)
            check(await sl(tid) > 50, f'{tid}: keyboard ArrowRight scrolls')
            # shift + wheel
            await pg.evaluate(f"document.getElementById('{tid}').scrollLeft=0"); await pg.mouse.move(tb['x'] + 200, y)
            await pg.keyboard.down('Shift'); await pg.mouse.wheel(0, 400); await pg.keyboard.up('Shift'); await pg.wait_for_timeout(600)
            check(await sl(tid) > 50, f'{tid}: shift+wheel scrolls horizontally')
        # a plain click still opens a category (no drag)
        await pg.evaluate("document.getElementById('carousel').scrollLeft=0"); await pg.click('.pillcard[data-cat="1"]'); await pg.wait_for_timeout(400)
        check('type=fine+dining' in pg.url or 'type=fine%20dining' in pg.url, 'plain click on a category still filters')
        # touch swipe (mobile emulation, CDP touch events)
        m = await (await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)).new_page()
        await m.goto(BASE, wait_until='networkidle'); await m.wait_for_timeout(800)
        await m.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await m.wait_for_timeout(300)
        tb = await m.locator('#carousel').bounding_box(); y = tb['y'] + tb['height'] / 2
        cdp = await m.context.new_cdp_session(m)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 330, 'y': y}]})
        for i in range(1, 13): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 330 - i * 22, 'y': y}]}); await m.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await m.wait_for_timeout(900)
        t = await m.evaluate("document.getElementById('carousel').scrollLeft"); check(t > 50, f'mobile: touch swipe scrolls carousel (scrollLeft={t})')
        check(not errs, f'no page errors {errs}')
        await b.close()
    print('FAILURES:', fails); sys.exit(1 if fails else 0)
asyncio.run(main())
