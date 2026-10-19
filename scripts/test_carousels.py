"""Playwright test: every carousel arrow scrolls its track, arrows disable at the ends,
mouse drag scrolls without opening a card, touch swipe scrolls, keyboard arrows scroll. Exit 1 on failure."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/index.html?country=be&city=gent'
fails = []
def check(cond, msg): print(('PASS ' if cond else 'FAIL ') + msg); cond or fails.append(msg)

async def regression(b):
    """Clicks must still work after every way of scrolling (bug: cards unclickable after scrolling)."""
    VIS = """(id)=>{const t=document.getElementById(id).getBoundingClientRect();
      const c=[...document.querySelectorAll('#'+id+' .pillcard')].find(x=>{const r=x.getBoundingClientRect();return r.left>=t.left+4&&r.right<=t.right-4&&x.dataset.cat!=='0'});
      if(!c)return null;const r=c.getBoundingClientRect();return {cat:c.dataset.cat,x:r.left+r.width/2,y:r.top+r.height/2}}"""
    async def fresh(pg):
        await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(500)
        await pg.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(300)
        return await pg.locator('#carousel').bounding_box()
    async def click_card(pg, label, how='mouse'):
        await pg.wait_for_timeout(1500)                                  # let smooth scroll / momentum settle
        v = await pg.evaluate(VIS, 'carousel')
        if how == 'mouse': await pg.mouse.click(v['x'], v['y'])
        else: await pg.touchscreen.tap(v['x'], v['y'])
        await pg.wait_for_timeout(500)
        ok = await pg.evaluate("document.querySelector('.pillcard.active')!==null") or ('?' in pg.url and '=' in pg.url.split('?')[1] and pg.url != BASE)
        check(ok and pg.url != BASE, f'{label}: card click after scrolling still applies the filter ({pg.url.split("?")[1]})')
    pg = await (await b.new_context(viewport={'width': 1366, 'height': 768})).new_page()
    tb = await fresh(pg); await pg.click('[data-car-next="carousel"]'); await click_card(pg, 'after arrow click')
    tb = await fresh(pg); y = tb['y'] + tb['height'] / 2
    await pg.mouse.move(tb['x'] + 900, y); await pg.mouse.down()
    for i in range(1, 11): await pg.mouse.move(tb['x'] + 900 - i * 40, y); await pg.wait_for_timeout(16)
    await pg.mouse.up(); await click_card(pg, 'after mouse drag (momentum settled)')
    tb = await fresh(pg); y = tb['y'] + tb['height'] / 2
    await pg.mouse.move(tb['x'] + 900, y); await pg.mouse.down()
    for i in range(1, 11): await pg.mouse.move(tb['x'] + 900 - i * 60, y); await pg.wait_for_timeout(8)
    await pg.mouse.up(); await pg.wait_for_timeout(60)
    await pg.mouse.click(tb['x'] + 300, y)                               # click DURING momentum = stop glide only
    await click_card(pg, 'after interrupting momentum with a click')
    tb = await fresh(pg); y = tb['y'] + tb['height'] / 2
    await pg.mouse.move(tb['x'] + 400, y); await pg.keyboard.down('Shift'); await pg.mouse.wheel(0, 500); await pg.keyboard.up('Shift')
    await click_card(pg, 'after shift+wheel')
    tb = await fresh(pg); await pg.mouse.move(tb['x'] + 400, y); await pg.mouse.wheel(500, 0); await click_card(pg, 'after horizontal (trackpad) wheel')
    tb = await fresh(pg); await pg.mouse.move(tb['x'] + 400, y); await pg.mouse.down(); await pg.mouse.move(tb['x'] + 403, y); await pg.mouse.up()
    await pg.wait_for_timeout(300); check(pg.url != BASE, 'click with 3 px jitter is still a click')
    # touch swipe then tap (mobile)
    m = await (await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)).new_page()
    tb = await fresh(m); y = tb['y'] + tb['height'] / 2
    cdp = await m.context.new_cdp_session(m)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 330, 'y': y}]})
    for i in range(1, 13): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 330 - i * 22, 'y': y}]}); await m.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await click_card(m, 'mobile: after touch swipe (tap)', how='touch')
    # events carousel: link still opens after a drag
    pg = await (await b.new_context(viewport={'width': 1366, 'height': 768})).new_page()
    await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(500)
    await pg.evaluate("document.getElementById('evlist').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(300)
    tb = await pg.locator('#evlist').bounding_box(); y = tb['y'] + tb['height'] / 2
    await pg.mouse.move(tb['x'] + 900, y); await pg.mouse.down()
    for i in range(1, 8): await pg.mouse.move(tb['x'] + 900 - i * 40, y); await pg.wait_for_timeout(16)
    await pg.mouse.up(); await pg.wait_for_timeout(1500)
    links = pg.locator('#evlist a[target=_blank]')
    n = await links.count(); target = None
    for i in range(n):
        bb = await links.nth(i).bounding_box()
        if bb and bb['x'] > tb['x'] + 20 and bb['x'] + bb['width'] < tb['x'] + tb['width'] - 20: target = links.nth(i); break
    try:
        async with pg.context.expect_page(timeout=5000) as pi: await target.click()
        check(True, 'events: link click after drag opens the page')
    except Exception as e: check(False, f'events: link click after drag ({e})')

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
        await regression(b)
        check(not errs, f'no page errors {errs}')
        await b.close()
    print('FAILURES:', fails); sys.exit(1 if fails else 0)
asyncio.run(main())
