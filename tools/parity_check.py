"""Compare the web build's logic with the PsychoPy task's, value by value.
Usage: parity_check.py <py_json> <port>  (web/ served on localhost:<port>)"""
import json, sys
from playwright.sync_api import sync_playwright
py = json.load(open(sys.argv[1]))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.on('console', lambda m: print('console:', m.text))
    pg.goto(f'http://127.0.0.1:{sys.argv[2]}/tools/parity.html')
    pg.wait_for_function('document.title === "done"', timeout=60000)
    js = pg.evaluate('window.RESULT'); b.close()
def same(a, b):
    if isinstance(a, (list, tuple)): return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float): return abs(a - b) <= 1e-12 * max(1, abs(a))
    return a == b
bad = 0
for k in py:
    ok = same(py[k], js[k]); bad += not ok
    print(f'{k:10s} {"OK" if ok else "MISMATCH"}')
    if not ok: print('  py:', str(py[k])[:300], '\n  js:', str(js[k])[:300])
print('ALL MATCH' if not bad else f'{bad} MISMATCHES')
