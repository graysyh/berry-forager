// Reward-ladder maths — a line-for-line port of ../ladder.py, which
// documents the design. Every random draw goes through the PyRandom it is
// handed, in the same order as the Python, so a seed gives the same bushes.

import { cfg } from './config.js';

export function peakValue(nHarvests, r0 = null) {
  const v = (r0 === null ? cfg.R0 : r0) * Math.exp(-cfg.K * nHarvests);
  return Math.trunc(Math.max(cfg.MIN_REWARD,
    Math.min(cfg.MAX_REWARD, Math.floor(v + 0.5))));
}

function tierValues(peak) {
  const floor = Math.max(cfg.MIN_REWARD, peak - cfg.TIER_DROP);
  if (floor >= peak) return [peak];
  const left = [], right = [];
  for (let v = floor; v < peak; v++) left.push(v);
  for (let v = peak - 1; v > floor - 1; v--) right.push(v);
  return [...left, peak, ...right];
}

function tierWeight(peak, value) {
  return cfg.TIER_WIDTH_BASE ** (peak - value);
}

function quantizeWidths(widths, totalSlots) {
  const n = widths.length;
  const raw = widths.map(w => w * totalSlots);
  const counts = raw.map(x => Math.max(1, Math.floor(x)));
  const diff = totalSlots - counts.reduce((a, b) => a + b, 0);
  const idx = [...Array(n).keys()];
  if (diff > 0) {
    // Python sorted(..., reverse=True) is stable; so is Array.sort.
    const order = idx.slice().sort((a, b) =>
      (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])));
    for (let k = 0; k < diff; k++) counts[order[k % n]] += 1;
  } else if (diff < 0) {
    const order = idx.slice().sort((a, b) => raw[a] - raw[b]);
    let k = 0, taken = 0;
    while (taken < -diff && k < 10 * n) {
      const j = order[k % n];
      if (counts[j] > 1) { counts[j] -= 1; taken += 1; }
      k += 1;
    }
  }
  return counts;
}

function shuffleColumns(columns, rng, maxAttempts = 100) {
  const n = columns.length;
  const top = Math.max(...columns);
  const topIsClear = cols => cols.every((v, i) =>
    v !== top || (cfg.PEAK_MARGIN <= (i + 0.5) / n
                  && (i + 0.5) / n <= 1.0 - cfg.PEAK_MARGIN));
  const cols = columns.slice();
  for (let a = 0; a < maxAttempts; a++) {
    rng.shuffle(cols);
    if (topIsClear(cols)) break;
  }
  return cols;
}

// Berries actually on a bunch whose tier is worth `nominal`; an empty spot
// stays empty.
function growBunch(nominal, rng) {
  const s = Math.trunc(cfg.BUNCH_SPREAD);
  if (s <= 0 || nominal <= 0) return Math.trunc(nominal);
  const v = Math.trunc(nominal) + rng.randint(-s, s);
  return Math.trunc(Math.max(cfg.MIN_REWARD, Math.min(cfg.MAX_REWARD, v)));
}

// {values, edges, peak, floor, peakCenter, slotCounts} — see ladder.py.
export function makeLadder(nHarvests, rng, r0 = null) {
  const peak = peakValue(nHarvests, r0);
  const values = tierValues(peak);

  if (values.length === 1) {
    return { values, edges: [0.0, 1.0], peak, floor: peak,
             peakCenter: 0.5, slotCounts: [cfg.GRID_SLOTS] };
  }

  const weights = values.map(v => tierWeight(peak, v));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const counts = quantizeWidths(weights.map(w => w / totalWeight),
                                cfg.GRID_SLOTS);

  let columns = [];
  values.forEach((v, t) => {
    for (let c = 0; c < counts[t]; c++) columns.push(growBunch(v, rng));
  });
  columns = shuffleColumns(columns, rng);

  const merged = [], slotCounts = [];
  for (const v of columns) {
    if (merged.length && merged[merged.length - 1] === v) {
      slotCounts[slotCounts.length - 1] += 1;
    } else {
      merged.push(v);
      slotCounts.push(1);
    }
  }

  const edges = [0.0];
  for (const n of slotCounts) edges.push(edges[edges.length - 1] + n / cfg.GRID_SLOTS);
  edges[edges.length - 1] = 1.0;

  const top = Math.max(...merged);
  const topIdx = merged.indexOf(top);
  return { values: merged, edges, peak: top, floor: Math.min(...merged),
           peakCenter: (edges[topIdx] + edges[topIdx + 1]) / 2,
           slotCounts };
}

// [tierIndex, tierValue] for a hand position xFrac (0-1).
export function tierAt(lad, xFrac) {
  const x = Math.max(0.0, Math.min(1.0, xFrac));
  // bisect_right(edges, x) - 1
  let lo = 0, hi = lad.edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x < lad.edges[mid]) hi = mid; else lo = mid + 1;
  }
  const i = Math.max(0, Math.min(lad.values.length - 1, lo - 1));
  return [i, lad.values[i]];
}

// A press pays exactly the berries on the bunch.
export function tierExpectedValue(v) { return v; }

export function peakExpectedValue(lad) { return tierExpectedValue(lad.peak); }

export function chanceExpectedValue(lad) {
  let total = 0.0;
  lad.values.forEach((v, i) => {
    total += tierExpectedValue(v) * (lad.edges[i + 1] - lad.edges[i]);
  });
  return total;
}
