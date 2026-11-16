# Usage: run a local server in the site folder (python -m http.server 8000), then:
#   python scripts/render_cards.py http://localhost:8000/ .   [project folders, e.g. 2024-1]
# Needs: pip install playwright pillow && playwright install chromium
# Renders each project's home-page card: the part right way up and flipped, side by side, in one 3D scene.
import sys, asyncio, json, tempfile
from playwright.async_api import async_playwright
from PIL import Image
BASE, OUT = sys.argv[1], sys.argv[2]
PROJ = json.load(open(OUT + '/data/projects.json'))
ids = [(f"worldskills-{p['year']}-test-project-{p['project']}.html", p['dir']) for p in PROJ if len(sys.argv) < 4 or p['dir'] in sys.argv[3:]]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":1300,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        css = ".site-header{display:none!important}.viewer{width:1000px!important;height:500px!important;aspect-ratio:auto!important;max-height:none!important;border:0!important;border-radius:0!important}"
        for pid, d in ids:
            await pg.goto(BASE + pid)
            await pg.add_style_tag(content=css)
            await pg.wait_for_function("document.getElementById('viewer-status').hidden", timeout=60000)
            await pg.evaluate("window.scrollTo(0, document.getElementById('viewer').getBoundingClientRect().top + scrollY - 20)")
            await pg.wait_for_timeout(400)
            await pg.evaluate("window.MH_pairView()")
            await pg.wait_for_timeout(900)
            bb = await pg.locator('#viewer').bounding_box()
            await pg.screenshot(path=f"{tempfile.gettempdir()}/{d}-card.png", clip=bb, timeout=120000)
            im = Image.open(f"{tempfile.gettempdir()}/{d}-card.png").convert("RGB")
            card = im.resize((800, 400), Image.LANCZOS)
            card.save(f"{OUT}/projects/{d}/card.jpg", quality=82, optimize=True)      # for social-media previews
            card.save(f"{OUT}/projects/{d}/card.webp", "WEBP", quality=82, method=6)  # shown on the home page
            card.resize((400, 200), Image.LANCZOS).save(f"{OUT}/projects/{d}/card-400.webp", "WEBP", quality=82, method=6)  # same, for small/1x screens
            w, h = im.size  # left half = the part right way up -> small picture for Previous/Next
            im.crop((0, 0, w // 2, h)).resize((160, 160), Image.LANCZOS).save(f"{OUT}/projects/{d}/top.jpg", quality=82, optimize=True)
            print(d, end=" ", flush=True)
        print("\nerrors:", errs)
        await b.close()
asyncio.run(main())
