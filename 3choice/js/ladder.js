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
  let peak = peakValue(nHarvests, r0);
  if (cfg.NO_EMPTY_BRANCHES) peak = Math.max(peak, 1);
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
  if (cfg.NO_EMPTY_BRANCHES) {
    // At least 2 branches with berries, so the smallest bush is 1 + 1.
    let have = columns.filter(v => v > 0).length;
    for (let c = 0; c < columns.length && have < 2; c++) {
      if (columns[c] <= 0) { columns[c] = 1; have += 1; }
    }
  }
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

// Slot indices the highlight visits: every slot, or (NO_EMPTY_BRANCHES /
// SKIP_EMPTY_BRANCHES) only those with berries — none on a bare branch.
const skipEmpty = () => cfg.NO_EMPTY_BRANCHES || cfg.SKIP_EMPTY_BRANCHES;

export function sweepSlots(lad) {
  const out = [];
  let slot = 0;
  lad.values.forEach((v, i) => {
    for (let k = 0; k < lad.slotCounts[i]; k++, slot++) {
      if (!skipEmpty() || v > 0) out.push(slot);
    }
  });
  return out;
}

export function chanceExpectedValue(lad) {
  if (skipEmpty()) {
    // A blind press lands on one of the visited (non-empty) branches.
    let total = 0.0, n = 0;
    lad.values.forEach((v, i) => {
      if (v > 0) { total += tierExpectedValue(v) * lad.slotCounts[i]; n += lad.slotCounts[i]; }
    });
    return n ? total / n : 0.0;
  }
  let total = 0.0;
  lad.values.forEach((v, i) => {
    total += tierExpectedValue(v) * (lad.edges[i + 1] - lad.edges[i]);
  });
  return total;
}

// Three-choice copy: the same branch after a pick — every bunch where it
// was, the picked one (`slot`) emptied. No random draws.
export function takeSlot(lad, slot) {
  const columns = [];
  lad.values.forEach((v, i) => { for (let k = 0; k < lad.slotCounts[i]; k++) columns.push(v); });
  if (slot !== null && slot >= 0 && slot < columns.length) columns[slot] = 0;
  const merged = [], slotCounts = [];
  for (const v of columns) {
    if (merged.length && merged[merged.length - 1] === v) slotCounts[slotCounts.length - 1] += 1;
    else { merged.push(v); slotCounts.push(1); }
  }
  const edges = [0.0];
  for (const n of slotCounts) edges.push(edges[edges.length - 1] + n / cfg.GRID_SLOTS);
  edges[edges.length - 1] = 1.0;
  const top = Math.max(...merged);
  const topIdx = merged.indexOf(top);
  return { values: merged, edges, peak: top, floor: Math.min(...merged),
           peakCenter: (edges[topIdx] + edges[topIdx + 1]) / 2, slotCounts };
}
