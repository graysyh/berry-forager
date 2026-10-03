"""Play the web build end to end in headless Chromium: a bot picks, stays
twice per bush then explores, screenshots each phase the first time it
appears, and saves the downloaded data zip.
Usage: e2e.py <port> <outdir> [dur_s] [seed]"""
import sys, time, zipfile, io, json
from pathlib import Path
from playwright.sync_api import sync_playwright
port, out = sys.argv[1], Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
dur = sys.argv[3] if len(sys.argv) > 3 else '60'; seed = sys.argv[4] if len(sys.argv) > 4 else '7'
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.goto(f'http://127.0.0.1:{port}/index.html?auto&dur={dur}&seed={seed}')
    pg.wait_for_function('window.__task', timeout=30000)
    pg.wait_for_timeout(600); pg.screenshot(path=str(out / '00_title.png'))
    with pg.expect_download(timeout=(float(dur) + 90) * 1000) as dl:
        pg.keyboard.press('Space')
        seen, harvests_here, last_patch, last_space = set(), 0, None, 0
        t_end = time.time() + float(dur) + 60
        while time.time() < t_end:
            st = pg.evaluate('''() => { const t = window.__task; if (!t) return null;
                const ph = t.logger.phases; const last = ph.length ? ph[ph.length-1] : {};
                return {phase: last.phase, patch: last.patch_id, prompt: t.scene.prompt_visible,
                        pressed: t.scene.pressed_button, ended: t.sync.recording === false && ph.length > 3}; }''')
            if st is None: break
            ph = st['phase']
            if ph and ph not in seen:
                seen.add(ph); pg.wait_for_timeout(250 if ph in ('reveal', 'travel') else 60)
                pg.screenshot(path=str(out / f'{len(seen):02d}_{ph}.png'))
            if st['patch'] != last_patch: last_patch, harvests_here = st['patch'], 0
            if st['prompt'] and not st['pressed']:
                harvests_here += 1
                pg.keyboard.press('KeyJ' if harvests_here >= 3 else 'KeyF')
            elif ph == 'sweep' and time.time() - last_space > 0.9:
                pg.keyboard.press('Space'); last_space = time.time()
            if st['ended']: break
            pg.wait_for_timeout(120)
        pg.wait_for_timeout(500); pg.screenshot(path=str(out / '99_end.png'))
    d = dl.value; zpath = out / d.suggested_filename; d.save_as(str(zpath))
    b.close()
print('errors:', errors or 'none')
print('phases seen:', sorted(seen))
z = zipfile.ZipFile(zpath); print('zip:', zpath.name, z.namelist())
for n in z.namelist():
    txt = z.read(n).decode()
    print(f'--- {n}: {len(txt.splitlines())} lines'); print('\n'.join(txt.splitlines()[:3])[:700])
