"""Export the task's art for the web build, pre-processed exactly as
art.py prepares it for PsychoPy at startup (glow cleanup, cropping, the
seamless foliage strip, the recoloured twig, the walk-cycle frames), so the
browser only ever draws finished images.

Run from the project root with the PsychoPy interpreter:
    ~/.config/psychopy4/.python/<ver>/bin/python web/tools/export_assets.py
Writes web/assets/*.png|jpg and web/assets/manifest.json.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import art            # noqa: E402
import config as cfg  # noqa: E402
from scene import COL_STEM_LEAF  # noqa: E402

OUT = ROOT / 'web' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)

# Exported for a ~2160 px tall (1080p at 2x) canvas: the browser only ever
# scales these DOWN.
REF_H = 2160
man = {}


def save(im, name, **extra):
    path = OUT / name
    if name.endswith('.jpg'):
        im.convert('RGB').save(path, quality=90)
    else:
        im.save(path, optimize=True)
    man[name.rsplit('.', 1)[0]] = dict(file=name, w=im.width, h=im.height,
                                       **extra)


strip, mean = art.foliage_strip()
save(strip, 'foliage_strip.jpg')
man['foliage_mean'] = [round(c, 3) for c in mean]

save(art.sprite('berry.png', height_px=256), 'berry.png')
stem_w = round(cfg.GRID_BERRY_SIZE * cfg.BUNCH_STEM_W_MULT * REF_H)
save(art.leaves_toward(art.sprite('twig.png', width_px=stem_w),
                       COL_STEM_LEAF), 'twig.png')

small_w = round(cfg.TRAVEL_BUSH_W * REF_H)
for st in ('full', 'picked'):
    save(art.sprite(f'travel_bush_{st}.png', width_px=small_w),
         f'travel_bush_{st}.png')
save(art.sprite('travel_bush_full.png', width_px=1536), 'enter_bush_full.png')

frames = art.sprite_frames('travel_forager_walk.png',
                           round(cfg.TRAVEL_FORAGER_H * REF_H))
man['walker_frames'] = []
for i, f in enumerate(frames):
    save(f, f'walker_{i}.png')
    man['walker_frames'].append(f'walker_{i}')
man['walker_ref_h'] = round(cfg.TRAVEL_FORAGER_H * REF_H)

save(art.backdrop('meadow_travel.png', cfg.MEADOW_BRIGHTNESS), 'meadow.jpg')
save(art.backdrop('splash.png', cfg.MEADOW_BRIGHTNESS), 'splash.jpg')

(OUT / 'manifest.json').write_text(json.dumps(man, indent=1))
print(json.dumps(man, indent=1))
