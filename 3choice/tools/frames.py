"""Render specific animation frames of the web build for visual checks."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
port, out = sys.argv[1], Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
JS = '''async (spec) => {
  const { loadAssets, Scene } = await import('./js/scene.js');
  const { makeLadder } = await import('./js/ladder.js');
  const { PyRandom } = await import('./js/pyrandom.js');
  document.getElementById('setup').hidden = true;
  const assets = await loadAssets("../assets/");
  const scene = new Scene(document.getElementById('c'), assets);
  const rng = new PyRandom(3);
  const a = makeLadder(0, rng), b = makeLadder(1, rng);
  window.S = { scene, a, b };
  return true; }'''
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1280, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/3choice/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(JS, {})
    def shot(name, code):
        pg.evaluate('() => { const {scene, a, b} = window.S; scene.beginFrame(); ' + code + ' }')
        pg.screenshot(path=str(out / f'{name}.png'))
    # Arrival after an 18 s trip
    for i, rf in enumerate([0.10, 0.25, 0.38, 0.6]):
        shot(f'arrive_{i}', f'''if ({i} === 0) {{ scene.begin_travel(18); scene.begin_patch(); scene.begin_harvest(); }}
              scene.draw_patch({rf}); scene.draw_skyline(a, {rf}); scene.drawHud(5);''')
    # Vertical stay pan (up) and horizontal
    for d, dirn in (('up', '[0,1]'), ('right', '[1,0]')):
        for i, rf in enumerate([0.0, 0.5, 1.0]):
            shot(f'pan_{d}_{i}', f'''if ({i} === 0) {{ scene._taken_column = 2; scene.begin_search({dirn}, a); scene.begin_harvest(); }}
                  scene.draw_patch({rf}); scene.draw_skyline(b, {rf}); scene.drawHud(5);''')
    # Search fade, empty bush, travel walk frames
    shot('search_fade', 'scene.draw_search(a); scene.drawHud(5); scene.draw_search_fade(2.0);')
    # Travel past empty bushes (12 s trip): walking, rummaging, "empty", arrival
    for i, t in enumerate([1.5, 4.5, 8.0, 10.0, 11.8]):
        shot(f'travel_{i}', f'''if ({i} === 0) scene.begin_travel(12);
              scene.draw_travel({t}, 12); scene.drawHud(5);''')
    br.close()
print('errors:', errs or 'none')
