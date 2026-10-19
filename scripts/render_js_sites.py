import asyncio,json,sys
from playwright.async_api import async_playwright
urls=sys.argv[1:]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(ignore_https_errors=True)
        out={}
        for u in urls:
            pg=await ctx.new_page()
            try:
                await pg.goto(u,timeout=30000,wait_until='domcontentloaded'); await pg.wait_for_timeout(3500)
                t=await pg.inner_text('body')
                out[u]=' '.join(t.split())
            except Exception as e: out[u]='ERR '+str(e)[:100]
            await pg.close()
            print('=====',u); print(out[u][:1500])
        await b.close()
        json.dump(out,open('render_out.json','w'),ensure_ascii=False)
asyncio.run(main())
