// The task — a port of the routines in ../foraging.py (run_minigame,
// run_prompt, hold, run_patch, travel, run_session, main). Same phases,
// same order of random draws, same logged values. foraging.py documents
// why each step is the way it is; this file keeps its structure so the
// two can be read side by side.

import { cfg } from './config.js';
import { PyRandom, systemSeed } from './pyrandom.js';
import { makeLadder, tierAt, chanceExpectedValue, sweepSlots, takeSlot } from './ladder.js';
import { jitter, jitterInt } from './timing.js';
import { MvtTracker, describe } from './mvt.js';
import { Sync } from './sync.js';
import { Logger, f, round, pyJsonList, ARR_EWMA_FIELDS } from './logger.js';
import { Scene, loadAssets } from './scene.js';
import { MvtPanel } from './panel.js';

let rng;                                // the session's seeded stream

const r4 = x => f(round(x, 4));

function sampleTravelTime() {
  const base = rng.choice(cfg.TRAVEL_TIMES);
  return [base + jitterInt(...cfg.DECISION_GAP_RANGE, rng), base];
}

function bounceSlot(start, dir, tElapsed, stepS, n) {
  if (n <= 1) return 0;
  const raw = start + dir * Math.trunc(tElapsed / stepS);
  const m = ((raw % (2 * n)) + 2 * n) % (2 * n);
  return m < n ? m : 2 * n - 1 - m;
}

// ─── Minigame ───────────────────────────────────────────────────────────

async function runMinigame(sync, scene, runDuration, lad, totalReward, ids) {
  const handSpeed = cfg.HAND_SPEED * rng.uniform(1.0 - cfg.HAND_SPEED_JITTER,
                                                 1.0 + cfg.HAND_SPEED_JITTER);
  const period = 1.0 / handSpeed;
  const timeout = cfg.MINIGAME_TIMEOUT !== null ? cfg.MINIGAME_TIMEOUT : 2.0 * period;
  const stepS = period / cfg.GRID_SLOTS;

  const revealHold = jitter(...cfg.REVEAL_HOLD_RANGE, rng);
  const grabHold = jitter(...cfg.GRAB_HOLD_RANGE, rng);
  const feedbackHold = jitter(...cfg.FEEDBACK_HOLD_RANGE, rng);

  // The highlight steps through `stops` (only slots with berries, see
  // SKIP_EMPTY_BRANCHES), one step every stepS. A bare branch has none:
  // the timing runs over every slot as usual but nothing is highlighted.
  let stops = sweepSlots(lad);
  const bare = !stops.length;
  if (bare) stops = [...Array(cfg.GRID_SLOTS).keys()];
  const shown = slot => bare ? null : slot;
  let startSlot = 0, sweepDir = 1;
  if (cfg.RANDOM_SWEEP_START) {
    startSlot = rng.randrange(stops.length);
    sweepDir = rng.choice([-1, 1]);
  }
  const slotAt = t => stops[bounceSlot(startSlot, sweepDir, t, stepS, stops.length)];
  const sweepStartX = scene.slot_center_frac(stops[startSlot]);

  const chanceEv = round(chanceExpectedValue(lad), 4);
  const tags = { ...ids, ladder_peak: lad.peak, ladder_chance_ev: f(chanceEv) };
  const empty = lad.peak === 0;

  // Phase 1: reveal
  let [status] = await sync.align(() => { scene.beginFrame(); scene.drawFixation(); }, runDuration);
  if (status !== 'ok') return { aborted: status };

  scene.begin_harvest();
  sync.flush();
  sync.begin('reveal', tags);
  const revealTotal = cfg.LADDER_REVEAL_S + revealHold;
  const r0 = sync.now();
  while (sync.now() - r0 < revealTotal) {
    if (sync.now() >= runDuration) return { aborted: 'run_end' };
    if (sync.poll([cfg.KEY_QUIT]).length) return { aborted: 'abort' };
    const rf = Math.min(1.0, (sync.now() - r0) / cfg.LADDER_REVEAL_S);
    scene.beginFrame();
    scene.draw_patch(rf);
    scene.draw_skyline(lad, rf);
    scene.draw_reveal_note(empty);
    scene.drawHud(totalReward);
    await sync.flip();
  }

  // Phase 2: the marker hops between bunches until a press
  sync.flush();
  sync.begin('sweep', tags);
  const sweepT0 = sync.now();
  let pressRunT = null, lastDrawnT = 0.0, timedOut = false, pickSlot;
  while (true) {
    if (sync.now() >= runDuration) return { aborted: 'run_end' };
    for (const [k, t] of sync.poll([cfg.KEY_PICK, cfg.KEY_QUIT])) {
      if (k === cfg.KEY_QUIT) return { aborted: 'abort' };
      if (k === cfg.KEY_PICK && pressRunT === null) pressRunT = t;
    }
    const tElapsed = sync.now() - sweepT0;
    // Pay the bunch that was ON SCREEN, not the one the maths reached.
    if (pressRunT !== null) {
      pickSlot = slotAt(lastDrawnT);
      break;
    }
    if (tElapsed >= timeout) {
      timedOut = true;
      pickSlot = slotAt(lastDrawnT);
      break;
    }
    const drawSlot = slotAt(tElapsed);
    scene.beginFrame();
    scene.draw_patch();
    scene.draw_skyline(lad, 1.0, shown(drawSlot));
    scene.draw_pick_note(empty);
    scene.drawHud(totalReward);
    await sync.flip();
    lastDrawnT = tElapsed;
  }

  const handX = scene.slot_center_frac(pickSlot);
  let tierIdx = null, tierValue = 0, reward = 0;
  if (timedOut) {
    scene.show_warning('Too slow!');
  } else {
    [tierIdx, tierValue] = tierAt(lad, handX);
    reward = tierValue;               // exactly the berries on the bunch
  }

  // Phase 3: the grab
  if (!timedOut && grabHold > 0) {
    sync.begin('grab', { tier_value: tierValue, ...tags });
    const grabEnd = sync.now() + grabHold;
    while (sync.now() < grabEnd) {
      if (sync.now() >= runDuration) return { aborted: 'run_end' };
      if (sync.poll([cfg.KEY_QUIT]).length) return { aborted: 'abort' };
      scene.beginFrame();
      scene.draw_grab(lad, shown(pickSlot));
      scene.drawHud(totalReward);
      await sync.flip();
    }
  }

  if (!timedOut) {
    scene.show_popup(reward);
    scene.cluster_start = scene.column_pos(lad, tierIdx, handX);
    scene.mark_taken(lad, tierIdx, handX);
  }

  // Phase 4: feedback
  let fbLast = sync.now();
  const fbDraw = () => {
    const now = sync.now(), dt = now - fbLast;
    fbLast = now;
    scene.beginFrame();
    scene.draw_patch();
    scene.draw_skyline(lad, 1.0, timedOut ? null : shown(pickSlot));
    scene.draw_popup(dt);
    scene.draw_warning(dt);
    scene.drawHud(totalReward);
  };
  sync.begin(timedOut ? 'timeout' : 'outcome',
             { reward, timed_out: timedOut ? 1 : 0, tier_value: timedOut ? '' : tierValue, ...tags });
  const outcomeT = sync.now();
  const fbEnd = sync.now() + feedbackHold;
  while (sync.now() < fbEnd) {
    if (sync.now() >= runDuration) break;
    if (sync.poll([cfg.KEY_QUIT]).length) return { aborted: 'abort' };
    fbDraw();
    await sync.flip();
  }
  if (sync.now() < runDuration) {
    if ((await sync.align(fbDraw, runDuration))[0] === 'abort') return { aborted: 'abort' };
  }

  return {
    timed_out: timedOut,
    press_time: pressRunT === null ? null : pressRunT - sweepT0,
    outcome_onset: outcomeT,
    hand_pos: timedOut ? null : handX,
    pick_slot: timedOut ? null : pickSlot, bare,
    tier_idx: tierIdx, tier_value: tierValue, reward,
    hand_speed: handSpeed, sweep_start_x: sweepStartX, sweep_dir: sweepDir,
  };
}

// ─── Prompt ─────────────────────────────────────────────────────────────

async function runPrompt(sync, scene, logger, runDuration, a) {
  const { run_id, patch_id, prompt_id, harvest_index, total_reward,
          tracker, next_lad, bgDraw, tags } = a;
  scene.show_prompt();
  let rt = null, choice = null, missed = false;

  sync.flush();
  sync.begin('prompt', { prompt_id, ...tags });
  const promptDraw = () => {
    scene.beginFrame(); bgDraw(); scene.draw_prompt(); scene.drawHud(total_reward);
  };
  promptDraw();
  const promptOnset = await sync.flip();
  const mrow = tracker.promptRow(promptOnset, next_lad, prompt_id, harvest_index);

  let responseAt = null;
  while (true) {
    const nowRun = sync.now();
    const elapsed = nowRun - promptOnset;
    if (responseAt === null) {
      const keys = sync.poll([cfg.KEY_STAY, cfg.KEY_SWITCH, cfg.KEY_LEAVE, cfg.KEY_QUIT]);
      if (keys.length) {
        const [k, t] = keys[0];
        rt = t - promptOnset;
        if (k === cfg.KEY_STAY) { choice = 'stay'; scene.set_button_pressed('stay'); responseAt = nowRun; }
        else if (k === cfg.KEY_SWITCH) { choice = 'switch'; scene.set_button_pressed('switch'); responseAt = nowRun; }
        else if (k === cfg.KEY_LEAVE) { choice = 'leave'; scene.set_button_pressed('leave'); responseAt = nowRun; }
        else if (k === cfg.KEY_QUIT) { choice = 'quit'; break; }
        if (responseAt !== null) {
          sync.begin('prompt_fb', { prompt_id, choice, rt: r4(rt), ...tags });
        }
      }
      if (elapsed >= cfg.PROMPT_RESPONSE_WINDOW) { choice = 'missed'; missed = true; rt = null; break; }
    }
    if (responseAt !== null && nowRun - responseAt >= cfg.PROMPT_FB_HOLD) break;
    if (nowRun >= runDuration) { choice = 'run_end'; missed = true; rt = null; break; }
    promptDraw();
    await sync.flip();
  }

  let tGrid = sync.now(), abortedInAlign = false;
  if (choice !== 'quit' && choice !== 'run_end') {
    const [st, tg] = await sync.align(promptDraw, runDuration);
    tGrid = tg;
    abortedInAlign = st === 'abort';
  }
  scene.hide_prompt();
  if (choice !== 'quit') tracker.noteChoice(sync.now(), mrow, choice, rt, missed);

  const ew = {};
  ARR_EWMA_FIELDS.forEach((k, i) => { ew[k] = r4(mrow.arr_ewma[i]); });
  logger.logEvent({
    run_time: r4(promptOnset), event_type: 'prompt', run_id, patch_id, harvest_index, prompt_id,
    reward_since_last_prompt: mrow.reward_since_last_prompt,
    time_since_last_prompt: r4(mrow.time_since_last_prompt),
    crr_peak: r4(mrow.crr_peak), crr_chance: r4(mrow.crr_chance), arr: r4(mrow.arr_cum),
    mvt_suggested_leave: mrow.mvt_suggested_leave,
    choice, rt: rt !== null ? r4(rt) : '', missed_response: missed ? 1 : 0,
    total_reward,
    n_harvests_here: mrow.n_harvests_here, patch_age: r4(mrow.patch_age),
    crr_aim: r4(mrow.crr_aim), crr_recent: r4(mrow.crr_recent),
    crr_minus_arr: r4(mrow.crr_minus_arr),
    crr_aim_minus_arr_ewma: r4(mrow.crr_aim_minus_arr_ewma),
    mvt_leave_ewma: mrow.mvt_leave_ewma, mvt_leave_opt: mrow.mvt_leave_opt,
    mvt_n_opt: mrow.mvt_n_opt, mvt_rate_opt: r4(mrow.mvt_rate_opt),
    mvt_tau_h: r4(mrow.mvt_tau_h), mvt_tau_t: r4(mrow.mvt_tau_t),
    mvt_hit_rate: r4(mrow.mvt_hit_rate),
    ...ew,
  });

  let out;
  if (abortedInAlign) out = 'quit';
  else if (choice === 'missed') out = cfg.MISSED_PROMPT_DEFAULTS_TO_STAY ? 'switch' : 'leave';
  else out = choice;
  return [out, rt, missed, tGrid];
}

// ─── Patch ──────────────────────────────────────────────────────────────

async function hold(sync, runDuration, until, phase, draw, tags = {}, stopAtRunEnd = true) {
  sync.begin(phase, tags);
  while (sync.now() < until) {
    if (stopAtRunEnd && sync.now() >= runDuration) return 'run_end';
    if (sync.poll([cfg.KEY_QUIT]).length) return 'abort';
    draw();
    await sync.flip();
  }
  return 'ok';
}

async function runPatch(sync, scene, logger, runId, patchId, runDuration, state) {
  const patchR0 = rng.choice(cfg.PATCH_R0_LEVELS);
  const patchEntry = sync.now();
  let nHarvests = 0, nPrompts = 0, nTimeouts = 0, patchTotal = 0;
  const deficits = [];

  const tracker = state.mvt;
  tracker.notePatchEntry(patchEntry, patchId, patchR0);
  let prevTrialStart = null;
  scene.warning.active = false;
  scene.begin_patch();

  let lad = makeLadder(0, rng, patchR0);
  let branchId = 0;
  let exitReason = null;
  while (true) {
    if (sync.now() >= runDuration) { exitReason = 'run_end'; break; }
    const ids = { run_id: runId, patch_id: patchId, patch_r0: f(patchR0), harvest_index: nHarvests };
    const trialStart = sync.now();
    if (prevTrialStart !== null) tracker.noteCycle(trialStart - prevTrialStart);
    prevTrialStart = trialStart;
    const res = await runMinigame(sync, scene, runDuration, lad, state.total_reward, ids);
    if (res.aborted) { exitReason = res.aborted; break; }

    const { reward, timed_out: timedOut, tier_idx: tierIdx, tier_value: tierValue } = res;
    nHarvests += 1;
    if (timedOut) nTimeouts += 1;
    const aimDeficit = lad.peak - tierValue, luck = reward - tierValue, deficit = lad.peak - reward;
    deficits.push(deficit);
    patchTotal += reward;
    state.total_reward += reward;
    tracker.noteHarvest(res.outcome_onset, reward, timedOut,
                        !timedOut && tierValue === lad.peak, null, res.press_time);

    logger.logEvent({
      run_time: r4(trialStart), event_type: 'harvest', run_id: runId, patch_id: patchId,
      harvest_index: nHarvests - 1, branch_id: branchId,
      peak_value: lad.peak, floor_value: lad.floor, n_tiers: lad.values.length,
      tier_values: pyJsonList(lad.values),
      tier_edges: pyJsonList(lad.edges.map(e => round(e, 4)), true),
      peak_center: r4(lad.peakCenter), hand_speed: r4(res.hand_speed),
      sweep_start_x: r4(res.sweep_start_x), sweep_start_dir: res.sweep_dir,
      press_time: res.press_time !== null ? r4(res.press_time) : '',
      hand_pos_at_press: res.hand_pos !== null ? r4(res.hand_pos) : '',
      tier_index: tierIdx !== null ? tierIdx : '',
      tier_value: timedOut ? '' : tierValue, reward,
      max_possible: lad.peak, reward_deficit: deficit,
      aim_deficit: timedOut ? '' : aimDeficit, luck: timedOut ? '' : luck,
      timed_out: timedOut ? 1 : 0,
      patch_total_reward: patchTotal, total_reward: state.total_reward,
    });

    if (sync.now() >= runDuration) { exitReason = 'run_end'; break; }

    state.prompt_id += 1;
    nPrompts += 1;
    const nextLad = makeLadder(nHarvests, rng, patchR0);
    const pickSlot = res.pick_slot;
    const harvested = lad;
    const bgDraw = () => { scene.draw_patch(); scene.draw_skyline(harvested, 1.0, res.bare ? null : pickSlot); };

    const [choice, , , tGrid] = await runPrompt(sync, scene, logger, runDuration, {
      run_id: runId, patch_id: patchId, prompt_id: state.prompt_id,
      harvest_index: nHarvests - 1, total_reward: state.total_reward,
      tracker, next_lad: nextLad, bgDraw,
      tags: { run_id: runId, patch_id: patchId, patch_r0: f(patchR0),
              harvest_index: nHarvests - 1, ladder_peak: nextLad.peak,
              total_reward: state.total_reward },
    });

    if (choice === 'quit') { exitReason = 'abort'; break; }
    const leaving = choice === 'leave';
    if (choice === 'run_end' || sync.now() >= runDuration) {
      exitReason = leaving ? 'leave' : 'run_end'; break;
    }
    if (leaving) { exitReason = 'leave'; break; }

    // Stay on this branch: a short still gap, then the same bunches minus
    // the one just picked. (The next ladder drawn above goes unused.)
    if (choice === 'stay') {
      const stayLad = takeSlot(harvested, pickSlot);
      scene.begin_stay();
      const stayEnd = tGrid + jitterInt(...cfg.STAY_GAP_RANGE, rng);
      const stayDraw = () => {
        scene.beginFrame();
        scene.draw_patch();
        scene.draw_skyline(stayLad);
        scene.drawHud(state.total_reward);
      };
      const outcome = await hold(sync, runDuration, stayEnd, 'stay_branch', stayDraw, {
        run_id: runId, patch_id: patchId, patch_r0: f(patchR0),
        harvest_index: nHarvests - 1, choice, ladder_peak: stayLad.peak });
      if (outcome === 'abort') { exitReason = 'abort'; break; }
      if (outcome === 'run_end') { exitReason = 'run_end'; break; }
      lad = stayLad;
      continue;
    }


    // Exploit: the jitter, then a pan along the same bush.
    const searchEnd = tGrid + jitterInt(...cfg.DECISION_GAP_RANGE, rng);
    scene.begin_search(rng.choice([[-1, 0], [1, 0], [0, -1], [0, 1]]), lad);
    const searchDraw = () => {
      const now = sync.now();
      scene.beginFrame();
      scene.draw_search(harvested);
      scene.drawHud(state.total_reward);
      scene.draw_search_fade(now - tGrid);
    };
    const outcome = await hold(sync, runDuration, searchEnd, 'search', searchDraw, {
      run_id: runId, patch_id: patchId, patch_r0: f(patchR0),
      harvest_index: nHarvests - 1, choice, ladder_peak: nextLad.peak });
    if (outcome === 'abort') { exitReason = 'abort'; break; }
    if (outcome === 'run_end') { exitReason = 'run_end'; break; }
    lad = nextLad;
    branchId += 1;
  }

  const leaveTime = sync.now();
  const dur = leaveTime - patchEntry;
  const meanDef = deficits.length ? deficits.reduce((x, y) => x + y, 0) / deficits.length : '';
  const nOpt = state.mvt.policy.n_opt;
  logger.logPatch({
    patch_rate: dur > 1e-6 ? r4(patchTotal / dur) : '',
    mvt_n_opt_at_leave: nOpt,
    harvests_vs_optimal: exitReason === 'leave' ? nHarvests - nOpt : '',
    run_id: runId, patch_id: patchId,
    patch_entry_time: r4(patchEntry), patch_duration: r4(dur), leave_time: r4(leaveTime),
    n_harvests: nHarvests, n_prompts: nPrompts, patch_total_reward: patchTotal,
    exit_reason: exitReason || 'unknown',
    mean_reward_deficit: meanDef !== '' ? r4(meanDef) : '',
    n_timeouts: nTimeouts, patch_r0: f(patchR0),
  });
  return exitReason || 'unknown';
}

// ─── Travel ─────────────────────────────────────────────────────────────

async function travel(sync, scene, logger, runDuration, totalReward, runId, patchId, tracker) {
  const [duration, base] = sampleTravelTime();
  const [status, t0] = await sync.align(() => { scene.beginFrame(); scene.drawFixation(); }, runDuration);
  if (status !== 'ok') return status;

  scene.begin_travel(duration);
  logger.logEvent({
    run_time: r4(sync.now()), event_type: 'travel', run_id: runId, patch_id: patchId,
    travel_time: f(duration), travel_base: f(base),
    travel_level: cfg.TRAVEL_TIMES.indexOf(base), total_reward: totalReward,
  });
  tracker.noteTravel(sync.now(), duration, base);
  sync.begin('travel', { run_id: runId, patch_id: patchId, travel_time: f(duration),
                         travel_base: f(base), total_reward: totalReward });
  const tEnd = t0 + duration;
  while (sync.now() < tEnd) {
    if (sync.now() >= runDuration) return 'run_end';
    if (sync.poll([cfg.KEY_QUIT]).length) return 'abort';
    scene.beginFrame();
    scene.draw_travel(Math.min(duration, sync.now() - t0), duration);
    scene.drawHud(totalReward);
    await sync.flip();
  }
  return 'ok';
}

// ─── Session ────────────────────────────────────────────────────────────

async function runSession(sync, scene, logger, runId, duration, state) {
  const taskEnd = duration;          // no scanner lead-in online
  let patchId = 0, aborted = false;
  while (sync.now() < taskEnd) {
    patchId += 1;
    if (patchId > 1) {
      const outcome = await travel(sync, scene, logger, taskEnd, state.total_reward,
                                   runId, patchId, state.mvt);
      if (outcome === 'abort') { aborted = true; break; }
      if (outcome === 'run_end') break;
    }
    const exit = await runPatch(sync, scene, logger, runId, patchId, taskEnd, state);
    if (exit === 'abort') { aborted = true; break; }
    if (exit === 'run_end') break;
  }
  return aborted ? 'aborted' : 'completed';
}

// Title / end screens: wait for the advance key, with press feedback.
async function introLoop(sync, scene, draw, buttonY, label) {
  const b = scene.startButton;
  Object.assign(b, { y: buttonY, text: label, overlay: false, textDy: 0 });
  sync.flush();
  let key = null;
  while (!key) {
    for (const [k] of sync.poll([cfg.KEY_ADVANCE, cfg.KEY_QUIT])) { key = key || k; }
    scene.beginFrame(); draw(); await sync.flip();
  }
  if (key === cfg.KEY_QUIT) return 'quit';
  Object.assign(b, { overlay: true, textDy: -0.006 });
  const tEnd = sync.now() + 0.18;
  while (sync.now() < tEnd) { scene.beginFrame(); draw(); await sync.flip(); }
  Object.assign(b, { overlay: false, textDy: 0 });
  return 'ok';
}

// ─── Main ───────────────────────────────────────────────────────────────

export async function main(info, canvas, assets) {
  info.seed = info.seed === '' || info.seed === null ? systemSeed() : parseInt(info.seed, 10);
  rng = new PyRandom(info.seed);
  cfg.RUN_DURATION = info.run_duration_s;
  info.keys = { stay: cfg.KEY_STAY, switch: cfg.KEY_SWITCH, leave: cfg.KEY_LEAVE, pick: cfg.KEY_PICK };

  const [report, pol] = describe();
  console.log(report);
  info.mvt_startup = {
    report, n_opt: pol.n_opt, rate_opt: pol.rate_opt, tau_h: pol.tau_h, tau_t: pol.tau_t,
    flat_span: pol.flat_span,
    rate_curve: pol.curve.slice(0, 15).map(([n, r, t, rate]) =>
      [n, round(r, 4), round(t, 4), round(rate, 6)]),
  };

  const scene = new Scene(canvas, assets);
  const logger = new Logger(info);
  const sync = new Sync(logger);
  const tracker = new MvtTracker();
  const state = { total_reward: 0, prompt_id: 0, mvt: tracker };
  const panel = new MvtPanel(scene);
  sync.overlay = () => panel.draw(tracker, sync.now());

  window.__task = { scene, sync, tracker, logger, state };   // for testing

  let outcome = 'not_started';
  if (await introLoop(sync, scene, () => scene.draw_title(), -0.43,
                      `PRESS ${cfg.KEY_ADVANCE.toUpperCase()} TO START`) === 'quit') {
    outcome = 'quit_at_title';
  } else {
    sync.startNow();
    sync.recording = true;
    window.onbeforeunload = e => { e.preventDefault(); e.returnValue = ''; };
    outcome = await runSession(sync, scene, logger, info.run, info.run_duration_s, state);
    sync.recording = false;
  }

  const [nP, nL, nS, agree] = tracker.agreement();
  logger.finalize({
    outcome, total_reward: state.total_reward,
    mvt: {
      startup: info.mvt_startup,
      fitted: {
        n_opt: tracker.policy.n_opt, rate_opt: round(tracker.policy.rate_opt, 6),
        tau_h: round(tracker.policy.tau_h, 4), tau_t: round(tracker.policy.tau_t, 4),
        flat_span: tracker.policy.flat_span,
        hit_rate: round(tracker.hit_rate, 4), timeout_rate: round(tracker.timeout_rate, 4),
        mean_rt: tracker.rts.length ? round(tracker.rts.reduce((a, b) => a + b, 0) / tracker.rts.length, 4) : null,
        mean_press: tracker.press_times.length
          ? round(tracker.press_times.reduce((a, b) => a + b, 0) / tracker.press_times.length, 4) : null,
      },
      n_prompts: nP, n_leaves: nL, n_mvt_suggested: nS, agreement: round(agree, 4),
      agreement_ewma_rule: round(tracker.agreement('mvt_leave_ewma')[3], 4),
      agreement_optimal_rule: round(tracker.agreement('mvt_leave_opt')[3], 4),
    },
    timing: {
      seed: info.seed, scanner_mode: false, run_end_time: round(sync.now(), 4),
      ...sync.frameStats(), tab_hidden_periods: sync.hiddenPeriods,
    },
  });
  const fileName = logger.download();
  window.onbeforeunload = null;

  if (outcome !== 'quit_at_title') {
    await introLoop(sync, scene, () => scene.draw_end(state.total_reward), -0.23,
                    `PRESS ${cfg.KEY_ADVANCE.toUpperCase()} TO EXIT`);
  }
  return { outcome, fileName, logger, scene, sync };
}
