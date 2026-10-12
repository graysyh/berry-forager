// Jitter and the onset grid — ports of jitter(), jitter_int() and
// next_boundary() in ../fmri.py, which documents why each is the way it is.

import { cfg } from './config.js';

// One truncated-exponential sample from [lo, hi] (exact inverse CDF).
export function jitter(lo, hi, rng, scale = null) {
  if (hi <= lo) return lo;
  const span = hi - lo;
  const s = scale === null ? span / 3.0 : scale;
  if (s <= 0) return lo;
  const lam = 1.0 / s;
  const u = rng.random();
  return lo - Math.log(1.0 - u * (1.0 - Math.exp(-lam * span))) / lam;
}

// One uniform sample from the integers {lo, ..., hi}, as a float.
export function jitterInt(lo, hi, rng) {
  lo = Math.round(lo); hi = Math.round(hi);
  return hi <= lo ? lo : rng.randint(lo, hi);
}

// Smallest multiple of `grid` at or after t, treating anything within
// `eps` past a boundary as standing on it.
export function nextBoundary(t, grid = cfg.ONSET_GRID_S, eps = cfg.ONSET_GRID_EPS_S) {
  if (grid <= 0) return t;
  return Math.ceil((t - eps) / grid) * grid;
}
