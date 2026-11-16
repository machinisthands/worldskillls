# Usage: run a local server in the site folder (python -m http.server 8000), then:
#   python scripts/render_cards.py http://localhost:8000/ .   [project folders, e.g. 2024-1]
#   python scripts/render_cards.py http://localhost:8000/ . --og   [...]   (only the share pictures)
# Needs: pip install playwright pillow && playwright install chromium
# Renders each project's pictures: the part right way up and flipped, side by side, in one 3D scene.
#   card.webp, card-400.webp, top.jpg  ← home page and Previous/Next
#   og.jpg (1200×628)                  ← shown when a page is shared on LinkedIn, WhatsApp, Facebook, X
import sys, asyncio, json, tempfile
from playwright.async_api import async_playwright
from PIL import Image
BASE, OUT = sys.argv[1], sys.argv[2]
OG_ONLY = "--og" in sys.argv
only = [a for a in sys.argv[3:] if a != "--og"]
PROJ = json.load(open(OUT + '/data/projects.json'))
ids = [(f"worldskills-{p['year']}-test-project-{p['project']}.html", p['dir']) for p in PROJ if not only or p['dir'] in only]
VIEWER = ".site-header{display:none!important}.viewer{width:%dpx!important;height:%dpx!important;aspect-ratio:auto!important;max-height:none!important;border:0!important;border-radius:0!important}"


async def shot(pg, w, h, path):
    """Size the viewer to w×h, show the part top + bottom, and save a screenshot of it."""
    await pg.add_style_tag(content=VIEWER % (w, h))
    await pg.evaluate("window.dispatchEvent(new Event('resize'))")
    await pg.wait_for_timeout(1500)  # let the viewer finish its own refit before the pair view
    await pg.evaluate("window.scrollTo(0, document.getElementById('viewer').getBoundingClientRect().top + scrollY - 20)")
    await pg.wait_for_timeout(400)
    await pg.evaluate("window.MH_pairView()")
    await pg.wait_for_timeout(900)
    bb = await pg.locator('#viewer').bounding_box()
    await pg.screenshot(path=path, clip=bb, timeout=120000)
    return Image.open(path).convert("RGB")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":1300,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        for pid, d in ids:
            await pg.goto(BASE + pid)
            await pg.wait_for_function("document.getElementById('viewer-status').hidden", timeout=60000)
            og = await shot(pg, 1200, 628, f"{tempfile.gettempdir()}/{d}-og.png")
            og.save(f"{OUT}/projects/{d}/og.jpg", quality=84, optimize=True, progressive=True)  # for social-media previews
            if OG_ONLY:
                print(d, end=" ", flush=True)
                continue
            im = await shot(pg, 1000, 500, f"{tempfile.gettempdir()}/{d}-card.png")
            card = im.resize((800, 400), Image.LANCZOS)
            card.save(f"{OUT}/projects/{d}/card.webp", "WEBP", quality=82, method=6)  # shown on the home page
            card.resize((400, 200), Image.LANCZOS).save(f"{OUT}/projects/{d}/card-400.webp", "WEBP", quality=82, method=6)  # same, for small/1x screens
            w, h = im.size  # left half = the part right way up -> small picture for Previous/Next
            im.crop((0, 0, w // 2, h)).resize((160, 160), Image.LANCZOS).save(f"{OUT}/projects/{d}/top.jpg", quality=82, optimize=True)
            print(d, end=" ", flush=True)
        print("\nerrors:", errs)
        await b.close()
asyncio.run(main())
