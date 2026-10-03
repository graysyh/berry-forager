// Marginal Value Theorem instrumentation — a port of ../mvt.py, which
// documents what each estimator is and why. Same seeds, same arithmetic, so
// the benchmark (N*, R*) and every logged rate match the PsychoPy task.

import { cfg } from './config.js';
import { PyRandom } from './pyrandom.js';
import { makeLadder, peakExpectedValue, chanceExpectedValue } from './ladder.js';
import { jitter, jitterInt, nextBoundary } from './timing.js';

// ─── Expected durations ────────────────────────────────────────────────

export function jitterMean(lo, hi) {
  if (hi <= lo) return lo;
  return lo + (hi - lo) * (1.0 / 3.0 - 3.0 * Math.exp(-3.0)
                           / (1.0 - Math.exp(-3.0)));
}

function gridUp(t) {
  return cfg.LOCK_ONSETS_TO_GRID ? nextBoundary(t) : t;
}

export function sampleCycle(pressS, rtS, rng, leaving = false) {
  let t = cfg.LADDER_REVEAL_S + jitter(...cfg.REVEAL_HOLD_RANGE, rng);
  const timeout = cfg.MINIGAME_TIMEOUT !== null ? cfg.MINIGAME_TIMEOUT
                                                 : 2.0 / cfg.HAND_SPEED;
  const timedOut = pressS === null || pressS >= timeout;
  t += timedOut ? timeout : pressS;
  if (!timedOut) t += jitter(...cfg.GRAB_HOLD_RANGE, rng);
  t += jitter(...cfg.FEEDBACK_HOLD_RANGE, rng);
  t = gridUp(t);
  t += rtS === null ? cfg.PROMPT_RESPONSE_WINDOW : rtS + cfg.PROMPT_FB_HOLD;
  t = gridUp(t);
  t += jitterInt(...cfg.DECISION_GAP_RANGE, rng);
  if (leaving) t += rng.choice(cfg.TRAVEL_TIMES);
  return t;
}

export function expectedDurations(pressS = null, rtS = null, timeoutRate = 0.0,
                                  n = 4000, seed = 12345) {
  pressS = pressS === null ? cfg.MVT_ASSUMED_PRESS_S : pressS;
  rtS = rtS === null ? cfg.MVT_ASSUMED_RT_S : rtS;
  const rng = new PyRandom(seed);
  let stay = 0.0;
  for (let i = 0; i < n; i++) {
    const timedOut = rng.random() < timeoutRate;
    stay += sampleCycle(timedOut ? null : pressS, rtS, rng);
  }
  const tauH = stay / n;
  const tauT = cfg.TRAVEL_TIMES.reduce((a, b) => a + b, 0) / cfg.TRAVEL_TIMES.length;
  return [tauH, tauT];
}

// ─── What a harvest is worth ────────────────────────────────────────────

const EV_DRAWS = 1000;
const evCache = new Map();

// [perfect-aim, blind-press] expected berries with n harvests taken,
// averaged over ladders from a fixed seed (see mvt._ladder_ev).
export function ladderEv(n, r0 = null) {
  const key = `${n}|${r0}`;
  if (evCache.has(key)) return evCache.get(key);
  const rng = new PyRandom(0);
  let peak = 0.0, chance = 0.0;
  for (let i = 0; i < EV_DRAWS; i++) {
    const lad = makeLadder(n, rng, r0);
    peak += peakExpectedValue(lad);
    chance += chanceExpectedValue(lad);
  }
  const out = [peak / EV_DRAWS, chance / EV_DRAWS];
  evCache.set(key, out);
  return out;
}

export function harvestGain(n, r0 = null, hitRate = 1.0, timeoutRate = 0.0) {
  const [peak, chance] = ladderEv(n, r0);
  const p = Math.max(0.0, Math.min(1.0, hitRate));
  return (1.0 - timeoutRate) * (p * peak + (1.0 - p) * chance);
}

// ─── The optimal policy ─────────────────────────────────────────────────

export function rateCurve(tauH, tauT, r0 = null, hitRate = 1.0,
                          timeoutRate = 0.0, maxN = 30) {
  const out = [];
  let totalR = 0.0;
  for (let n = 0; n < maxN; n++) {
    totalR += harvestGain(n, r0, hitRate, timeoutRate);
    const nH = n + 1;
    const totalT = nH * tauH + tauT;
    out.push([nH, totalR, totalT, totalR / totalT]);
  }
  return out;
}

export function optimalPolicy(tauH, tauT, r0 = null, hitRate = 1.0,
                              timeoutRate = 0.0, tolerance = null) {
  if (tolerance === null) tolerance = cfg.MVT_FLAT_TOLERANCE;
  const curve = rateCurve(tauH, tauT, r0, hitRate, timeoutRate);
  // max() keeps the FIRST of tied rows, like Python's.
  let best = curve[0];
  for (const row of curve) if (row[3] > best[3]) best = row;
  const [nOpt, , , rateOpt] = best;
  const flat = curve.filter(r => r[3] >= rateOpt * (1.0 - tolerance)).map(r => r[0]);
  const gNext = harvestGain(nOpt, r0, hitRate, timeoutRate);
  return {
    n_opt: nOpt, rate_opt: rateOpt, tau_h: tauH, tau_t: tauT,
    hit_rate: hitRate, timeout_rate: timeoutRate,
    flat_span: [Math.min(...flat), Math.max(...flat)],
    flat_tolerance: tolerance,
    marginal_at_opt: gNext / tauH,
    curve,
  };
}

// ─── Rate estimators ────────────────────────────────────────────────────

export class Ewma {
  constructor(halflifeS) {
    this.halflife = halflifeS;
    this.tau = halflifeS / Math.log(2.0);
    this.r = 0.0; this.w = 0.0; this.t = 0.0;
  }
  advance(t, reward = 0.0) {
    const dt = Math.max(0.0, t - this.t);
    this.t = t;
    const d = Math.exp(-dt / this.tau);
    this.r = this.r * d + reward;
    this.w = this.w * d + this.tau * (1.0 - d);
    return this.rate;
  }
  get rate() { return this.w > 1e-9 ? this.r / this.w : 0.0; }
}

// Value at t WITHOUT consuming the interval.
function peek(e, t) {
  const dt = Math.max(0.0, t - e.t);
  const d = Math.exp(-dt / e.tau);
  const w = e.w * d + e.tau * (1.0 - d);
  return w > 1e-9 ? (e.r * d) / w : 0.0;
}

// ─── Live tracker ───────────────────────────────────────────────────────

export class MvtTracker {
  constructor(r0 = null) {
    this.r0 = r0;
    // Fill the expected-gain cache now, not inside the first prompt.
    for (const level of new Set([r0, ...cfg.PATCH_R0_LEVELS])) {
      for (let n = 0; n < 31; n++) ladderEv(n, level);
    }
    this.total_reward = 0;
    this.n_harvests = 0;
    this.n_timeouts = 0;
    this.n_hits = 0;
    this.n_presses = 0;
    this.travel_total = 0.0;
    this.n_travels = 0;

    this.patch_id = 0;
    this.patch_harvests = 0;
    this.patch_reward = 0;
    this.patch_entry_t = 0.0;

    this.reward_since_prompt = 0;
    this.last_prompt_t = 0.0;

    this.cycle_times = [];
    this.rts = [];
    this.press_times = [];

    this.ewmas = cfg.ARR_EWMA_HALFLIVES.map(h => new Ewma(h));

    const [tauH, tauT] = expectedDurations();
    this.policy_nominal = optimalPolicy(
      tauH, tauT, r0, cfg.MVT_ASSUMED_HIT_RATE, cfg.MVT_ASSUMED_TIMEOUT_RATE);
    this.policy = this.policy_nominal;

    this.series = [];     // [t, arr_cum, crr_peak|null]
    this.prompts = [];
  }

  get hit_rate() {
    if (this.n_presses < cfg.MVT_MIN_TRIALS_FOR_FIT) return cfg.MVT_ASSUMED_HIT_RATE;
    return this.n_hits / this.n_presses;
  }
  get timeout_rate() {
    if (this.n_harvests < cfg.MVT_MIN_TRIALS_FOR_FIT) return cfg.MVT_ASSUMED_TIMEOUT_RATE;
    return this.n_timeouts / this.n_harvests;
  }
  get mean_cycle() {
    if (this.cycle_times.length < cfg.MVT_MIN_TRIALS_FOR_FIT) return this.policy_nominal.tau_h;
    return this.cycle_times.reduce((a, b) => a + b, 0) / this.cycle_times.length;
  }
  get mean_travel() {
    if (!this.n_travels) return this.policy_nominal.tau_t;
    return this.travel_total / this.n_travels;
  }

  refit() {
    this.policy = optimalPolicy(this.mean_cycle, this.mean_travel, this.r0,
                                this.hit_rate, this.timeout_rate);
    return this.policy;
  }

  notePatchEntry(t, patchId, r0 = null) {
    this.patch_id = patchId;
    this.patch_harvests = 0;
    this.patch_reward = 0;
    this.patch_entry_t = t;
    this.r0 = r0;
    this.last_prompt_t = t;
    this.reward_since_prompt = 0;
  }

  noteHarvest(t, reward, timedOut, wasHit, cycleS = null, pressS = null) {
    this.n_harvests += 1;
    this.patch_harvests += 1;
    this.total_reward += reward;
    this.patch_reward += reward;
    this.reward_since_prompt += reward;
    if (timedOut) {
      this.n_timeouts += 1;
    } else {
      this.n_presses += 1;
      if (wasHit) this.n_hits += 1;
      if (pressS !== null) this.press_times.push(pressS);
    }
    if (cycleS !== null) this.cycle_times.push(cycleS);
    for (const e of this.ewmas) e.advance(t, reward);
    this.series.push([t, this.arrCum(t), null]);
  }

  noteCycle(seconds) { this.cycle_times.push(seconds); }

  noteTravel(t, duration, base) {
    this.travel_total += base;
    this.n_travels += 1;
    for (const e of this.ewmas) e.advance(t);
  }

  arrCum(t) { return this.total_reward / Math.max(t, 1e-6); }
  arrEwma(t) { return this.ewmas.map(e => peek(e, t)); }
  crrRecent(t) {
    return this.reward_since_prompt / Math.max(t - this.last_prompt_t, 1e-6);
  }

  // Prospective CRR from BUSH AGE (see MvtTracker.crr_next in mvt.py).
  crrNext(nHere, tauH = null) {
    const tau = Math.max(tauH !== null ? tauH : this.mean_cycle, 1e-6);
    const [peak, chance] = ladderEv(nHere, this.r0);
    const p = this.hit_rate;
    const aim = (1.0 - this.timeout_rate) * (p * peak + (1.0 - p) * chance);
    return [peak / tau, chance / tau, aim / tau];
  }

  promptRow(t, nextLad, promptId, harvestIndex) {
    this.refit();
    const nHere = harvestIndex + 1;
    const [crrPeak, crrChance, crrAim] = this.crrNext(nHere);
    const arrC = this.arrCum(t);
    const ewmas = this.ewmas.map(e => peek(e, t));
    const arrFast = ewmas.length ? ewmas[0] : arrC;
    const row = {
      prompt_id: promptId,
      run_time: t,
      patch_id: this.patch_id,
      harvest_index: harvestIndex,
      n_harvests_here: nHere,
      reward_since_last_prompt: this.reward_since_prompt,
      time_since_last_prompt: t - this.last_prompt_t,
      total_reward: this.total_reward,
      patch_total_reward: this.patch_reward,
      patch_age: t - this.patch_entry_t,
      crr_peak: crrPeak,
      crr_chance: crrChance,
      crr_aim: crrAim,
      crr_recent: this.crrRecent(t),
      arr_cum: arrC,
      arr_ewma: ewmas,
      crr_minus_arr: crrPeak - arrC,
      crr_aim_minus_arr_ewma: crrAim - arrFast,
      mvt_suggested_leave: crrPeak < arrC ? 1 : 0,
      mvt_leave_ewma: crrAim < arrFast ? 1 : 0,
      mvt_leave_opt: nHere >= this.policy.n_opt ? 1 : 0,
      mvt_n_opt: this.policy.n_opt,
      mvt_rate_opt: this.policy.rate_opt,
      mvt_tau_h: this.policy.tau_h,
      mvt_tau_t: this.policy.tau_t,
      mvt_hit_rate: this.hit_rate,
      ladder_peak: nextLad.peak,
    };
    this.prompts.push(row);
    this.series.push([t, arrC, crrPeak]);
    return row;
  }

  noteChoice(t, row, choice, rt, missed) {
    row.choice = choice;
    row.rt = rt;
    row.missed_response = missed ? 1 : 0;
    if (rt !== null) this.rts.push(rt);
    this.last_prompt_t = t;
    this.reward_since_prompt = 0;
  }

  agreement(key = 'mvt_suggested_leave') {
    const rows = this.prompts.filter(p => 'choice' in p);
    if (!rows.length) return [0, 0, 0, 0.0];
    const left = rows.filter(p => p.choice === 'leave').length;
    const sugg = rows.filter(p => p[key]).length;
    const agree = rows.filter(p => (p.choice === 'leave' ? 1 : 0) === (p[key] ? 1 : 0)).length;
    return [rows.length, left, sugg, agree / rows.length];
  }

  snapshot(t) {
    const [nP, nL, nS, agree] = this.agreement();
    return {
      t, total_reward: this.total_reward, patch_id: this.patch_id,
      patch_harvests: this.patch_harvests, patch_age: t - this.patch_entry_t,
      arr_cum: this.arrCum(t), arr_ewma: this.ewmas.map(e => peek(e, t)),
      crr_recent: this.crrRecent(t),
      n_opt: this.policy.n_opt, rate_opt: this.policy.rate_opt,
      flat_span: this.policy.flat_span, hit_rate: this.hit_rate,
      mean_cycle: this.mean_cycle, mean_travel: this.mean_travel,
      n_prompts: nP, n_leaves: nL, n_suggested: nS, agreement: agree,
    };
  }
}

// ─── Startup report ─────────────────────────────────────────────────────

export function describe(r0 = null, hitRate = null, timeoutRate = null) {
  hitRate = hitRate === null ? cfg.MVT_ASSUMED_HIT_RATE : hitRate;
  timeoutRate = timeoutRate === null ? cfg.MVT_ASSUMED_TIMEOUT_RATE : timeoutRate;
  const [tauH, tauT] = expectedDurations(null, null, timeoutRate);
  const pol = optimalPolicy(tauH, tauT, r0, hitRate, timeoutRate);
  const [lo, hi] = pol.flat_span;
  const f = (x, d) => x.toFixed(d);
  const lines = [
    `[mvt] assumed press ${f(cfg.MVT_ASSUMED_PRESS_S, 2)} s, RT ${f(cfg.MVT_ASSUMED_RT_S, 2)} s, ` +
    `hit rate ${f(100 * hitRate, 0)}%, timeouts ${f(100 * timeoutRate, 0)}%`,
    `[mvt] harvest cycle ${f(tauH, 2)} s, travel ${f(tauT, 2)} s`,
    `[mvt] OPTIMAL POLICY: leave after ${pol.n_opt} harvests, ${f(pol.rate_opt, 4)} berries/s`,
    `[mvt] within ${f(100 * pol.flat_tolerance, 0)}% of optimal: N = ${lo}..${hi}  ` +
    `(${hi - lo <= 2 ? 'SHARP' : 'FLAT — see MVT_NOTES.md'})`,
    '[mvt] rate by N: ' + pol.curve.slice(0, 8).map(r => `${r[0]}:${f(r[3], 3)}`).join('  '),
  ];
  return [lines.join('\n'), pol];
}
