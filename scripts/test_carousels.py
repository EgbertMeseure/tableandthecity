"""Playwright test: every carousel arrow scrolls its track, arrows disable at the ends,
mouse drag scrolls without opening a card, touch swipe scrolls, keyboard arrows scroll. Exit 1 on failure."""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/index.html?country=be&city=gent'
fails = []
MENU = '.pillcard.menu-open .pillmenu'                              # the sub-menu lives inside the card
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
        else:                                                            # touch: tap opens the sub-menu, its first item = whole group
            await pg.touchscreen.tap(v['x'], v['y']); await pg.wait_for_timeout(400)
            check(await pg.is_visible(MENU), f'{label}: tap opens the sub-menu')
            bb = await pg.locator(MENU + ' [data-s]').first.bounding_box(); await pg.touchscreen.tap(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
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

INSIDE = """(cat)=>{const card=document.querySelector(`.pillcard[data-cat="${cat}"]`),c=card.getBoundingClientRect(),R=c.width/2,
  m=card.querySelector('.pillmenu').getBoundingClientRect();
  const ok=(x,y)=>{if(x<c.left-.5||x>c.right+.5||y<c.top-.5||y>c.bottom+.5)return false;const cx=c.left+R;const cy=y<c.top+R?c.top+R:y>c.bottom-R?c.bottom-R:null;return cy==null||Math.hypot(x-cx,y-cy)<=R+.5};
  return [...card.querySelectorAll('.pillmenu [data-s]')].filter(b=>{const r=b.getBoundingClientRect();
    return !([[r.left,r.top],[r.right,r.top],[r.left,r.bottom],[r.right,r.bottom]].every(([x,y])=>ok(x,y))&&r.top>=m.top-.5&&r.bottom<=m.bottom+.5&&b.scrollWidth<=b.clientWidth+1)}).map(b=>b.innerText)}"""

async def hover_menu(b):
    """'Choose your table' sub-menus: hover (desktop), keyboard, tap (touch); counts match the list."""
    pg = await (await b.new_context(viewport={'width': 1366, 'height': 768})).new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(500)
    await pg.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(300)
    card = pg.locator('.pillcard[data-cat="2"]'); bb = await card.bounding_box()
    await pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + 40); await pg.wait_for_timeout(450)
    check(await pg.is_visible(MENU), 'hover: menu opens on hovering a group card')
    items = await pg.locator(MENU + ' [data-s]').all_inner_texts()
    out = await pg.evaluate(INSIDE, '2'); check(not out, f'hover: every sub-item lies inside the stadium shape and is not clipped {out}')
    check(len(items) >= 6 and any(i.lower().startswith('fine dining') for i in items), f'hover: restaurant sub-categories listed ({len(items)})')
    check(await card.locator('.pill-main').get_attribute('aria-expanded') == 'true', 'hover: aria-expanded=true')
    it = pg.locator(MENU + ' [data-s]', has_text='Fine dining'); n = int((await it.locator('b').inner_text()).strip())
    ib = await it.bounding_box(); await pg.mouse.move(bb['x'] + bb['width'] / 2, ib['y'] + ib['height'] / 2, steps=8)
    await pg.wait_for_timeout(350); check(await pg.is_visible(MENU), 'hover: menu stays open while moving into it')
    await it.click(); await pg.wait_for_timeout(400)
    cnt = await pg.inner_text('#count')
    check('group=restaurants' in pg.url and 'type=fine' in pg.url and cnt.startswith(f'{n} '), f'hover: sub-item applies its filter, count matches ({n} / {cnt})')
    check(not await pg.is_visible(MENU), 'hover: menu closes after choosing')
    await pg.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(300)
    bb = await pg.locator('.pillcard[data-cat="3"]').bounding_box()
    await pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + 40); await pg.wait_for_timeout(450)
    await pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] - 120, steps=4); await pg.wait_for_timeout(500)
    check(not await pg.is_visible(MENU), 'hover: menu closes on mouse leave')
    # every sub-menu count equals the list count it produces
    bad = []
    for cat in range(7):
        await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(300)
        await pg.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})")
        c = pg.locator(f'.pillcard[data-cat="{cat}"]'); await c.scroll_into_view_if_needed(); await pg.wait_for_timeout(500)
        k = await pg.locator(MENU + ' [data-s]').count() if False else None
        await c.locator('.pill-main').focus(); await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(250)
        k = await pg.locator(MENU + ' [data-s]').count()
        for j in range(k):
            if j: await c.locator('.pill-main').focus(); await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(200)
            for _ in range(j): await pg.keyboard.press('ArrowDown')
            t = await pg.evaluate("document.activeElement.innerText"); want = (await pg.evaluate("document.activeElement.querySelector('b').innerText")).strip()
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)
            got = (await pg.inner_text('#count')).split(' ')[0]
            if got != want: bad.append((cat, t, got))
            await pg.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(150)
    check(not bad, f'keyboard: ArrowDown opens menu, Enter applies; all sub-menu counts match the list {bad}')
    await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(300)
    await pg.focus('.pillcard[data-cat="2"] .pill-main'); await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
    check(not await pg.is_visible(MENU) and await pg.evaluate("document.activeElement.dataset.cat==='2'"), 'keyboard: Escape closes and returns focus')
    await pg.focus('.pillcard[data-cat="3"] .pill-main'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    check('group=cafes_bars' in pg.url, 'keyboard: Enter on a card selects the whole group')
    # no menu while dragging
    await pg.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await pg.wait_for_timeout(300)
    tb = await pg.locator('#carousel').bounding_box(); y = tb['y'] + tb['height'] / 2
    await pg.mouse.move(tb['x'] + 900, y); await pg.mouse.down()
    for i in range(1, 11): await pg.mouse.move(tb['x'] + 900 - i * 40, y); await pg.wait_for_timeout(16)
    vis = await pg.is_visible(MENU); await pg.mouse.up(); await pg.wait_for_timeout(1500)
    check(not vis, 'drag: menu does not open while dragging')
    v = await pg.evaluate("""()=>{const t=document.getElementById('carousel').getBoundingClientRect();const c=[...document.querySelectorAll('.pillcard')].find(x=>{const r=x.getBoundingClientRect();return r.left>=t.left+4&&r.right<=t.right-4&&x.dataset.cat!=='5'});const r=c.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+40}}""")
    await pg.mouse.move(v['x'] - 5, v['y']); await pg.mouse.move(v['x'], v['y'], steps=3); await pg.wait_for_timeout(450)
    check(await pg.is_visible(MENU), 'drag: hover menu works again after a drag')
    # touch
    m = await (await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)).new_page()
    m.on('pageerror', lambda e: errs.append(str(e)))
    await m.goto(BASE, wait_until='networkidle'); await m.wait_for_timeout(500)
    await m.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await m.wait_for_timeout(300)
    c = m.locator('.pillcard[data-cat="3"]'); await m.evaluate("document.querySelector('.pillcard[data-cat=\"3\"]').scrollIntoView({inline:'center',block:'center',behavior:'instant'})"); await m.wait_for_timeout(600)
    bb = await c.bounding_box(); await m.touchscreen.tap(bb['x'] + bb['width'] / 2, bb['y'] + 40); await m.wait_for_timeout(400)
    check(await m.is_visible(MENU) and 'group=' not in m.url, 'touch: tap on a card opens its menu (no filter yet)')
    it = m.locator(MENU + ' [data-s]', has_text='Brown'); n = (await it.locator('b').inner_text()).strip(); ib = await it.bounding_box()
    cb = await c.bounding_box(); mb = await m.locator(MENU).bounding_box()
    check(mb['x'] >= cb['x'] - .5 and mb['x'] + mb['width'] <= cb['x'] + cb['width'] + .5 and mb['y'] + mb['height'] <= cb['y'] + cb['height'] + .5, 'touch: menu sits inside the card')
    out = await m.evaluate(INSIDE, '3'); check(not out, f'touch: every sub-item lies inside the stadium shape {out}')
    await m.touchscreen.tap(ib['x'] + ib['width'] / 2, ib['y'] + ib['height'] / 2); await m.wait_for_timeout(400)
    check('type=brown_cafe' in m.url and (await m.inner_text('#count')).startswith(n + ' '), f'touch: tapping a sub-item applies it ({n})')
    await m.evaluate("document.getElementById('carousel').scrollIntoView({block:'center',behavior:'instant'})"); await m.wait_for_timeout(300)
    bb = await c.bounding_box(); await m.touchscreen.tap(bb['x'] + bb['width'] / 2, bb['y'] + 40); await m.wait_for_timeout(300)
    await m.touchscreen.tap(20, 20); await m.wait_for_timeout(300)
    check(not await m.is_visible(MENU), 'touch: tapping outside closes the menu')
    check(not errs, f'menu: no page errors {errs}')

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
        await pg.evaluate("document.getElementById('carousel').scrollLeft=0"); await pg.click('.pillcard[data-cat="2"]'); await pg.wait_for_timeout(400)
        check('group=restaurants' in pg.url, 'plain click on a group card filters the whole group')
        await hover_menu(b)
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
