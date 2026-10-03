"""Reference values from the PsychoPy task's own modules, for
parity_check.py to compare the web build against."""
import json, random, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import ladder, mvt
from fmri import jitter, jitter_int

out = {}
r = random.Random(12345)
out['rng'] = [r.random() for _ in range(5)] + [r.randint(-1, 1) for _ in range(20)] \
    + [r.randrange(10) for _ in range(20)] + [r.choice((4.0, 8.0, 12.0)) for _ in range(10)]
xs = list(range(10)); r.shuffle(xs); out['shuffle'] = xs
out['uniform'] = r.uniform(0.9, 1.1)
for seed in (0, 1, 42, 2**31 - 1):
    r = random.Random(seed)
    out[f'seed{seed}'] = [r.random() for _ in range(3)]
r = random.Random(7)
out['ladders'] = [(l.values, l.edges, l.peak, l.floor, l.peak_center, l.slot_counts)
                  for l in (ladder.make_ladder(n % 14, rng=r) for n in range(300))]
out['jitter'] = [jitter(0.8, 3.0, rng=r) for _ in range(20)] + [jitter_int(2, 6, rng=r) for _ in range(20)]
out['ev'] = [mvt._ladder_ev(n) for n in range(12)]
th, tt = mvt.expected_durations()
out['durations'] = [th, tt]
pol = mvt.optimal_policy(th, tt, None, 0.9, 0.02)
out['policy'] = [pol['n_opt'], pol['rate_opt'], list(pol['flat_span']), pol['marginal_at_opt']]
print(json.dumps(out))
