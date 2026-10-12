// Run clock, keyboard and phase timeline — the browser counterpart of
// Sync in ../fmri.py. Routines are written as async functions that
// `await sync.flip()` once per frame, so the task code reads exactly like
// the PsychoPy version's draw-then-flip loops.
//
// Differences from PsychoPy, all forced by the browser:
//   * a frame is presented at the browser's next paint; the onset stamped
//     is that frame's requestAnimationFrame time, i.e. within one refresh
//     of when it became visible (PsychoPy: right after the buffer swap)
//   * no scanner triggers
//   * the key buffer is filled by keydown events and stamped with the
//     event's own timeStamp, so a press is timed when it happened, not
//     when the frame loop got round to reading it

import { cfg } from './config.js';
import { nextBoundary } from './timing.js';

// KeyboardEvent.key -> PsychoPy key names.
function keyName(e) {
  if (e.key === ' ') return 'space';
  if (e.key === 'Escape') return 'escape';
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key.toLowerCase();
}

const nextFrame = () => new Promise(res => requestAnimationFrame(res));

export class Sync {
  constructor(logger) {
    this.logger = logger;
    this.t0 = performance.now();
    this.buffer = [];                 // [{key, ms}] — absolute performance.now() ms
    this.lastFlip = 0.0;
    this.pending = null;
    this.overlay = null;
    this.debugOn = !!cfg.MVT_DEBUG_PANEL;
    this.frameTimes = [];             // rAF timestamps (ms) while recording
    this.recording = false;
    this.hiddenPeriods = 0;
    this.n_triggers = 0;

    this._onKey = e => {
      if (e.repeat) return;
      const k = keyName(e);
      if (['space', 'f', 'j', 'd', 'escape'].includes(k)) e.preventDefault();
      this.buffer.push({ key: k, ms: e.timeStamp });
    };
    window.addEventListener('keydown', this._onKey);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hiddenPeriods += 1;
    });
  }

  now() { return (performance.now() - this.t0) / 1000; }

  startNow() { this.t0 = performance.now(); this.t0Wall = new Date().toISOString(); }

  _rel(ms) { return (ms - this.t0) / 1000; }

  // Like event.getKeys(keyList): returns, and removes from the buffer, only
  // the keys asked about; anything else stays queued. The debug toggle is
  // always consumed and never returned.
  poll(keys = []) {
    const out = [], keep = [];
    for (const ev of this.buffer) {
      if (ev.key === cfg.KEY_DEBUG_TOGGLE) {
        this.debugOn = !this.debugOn;
      } else if (keys.includes(ev.key)) {
        out.push([ev.key, this._rel(ev.ms)]);
      } else {
        keep.push(ev);
      }
    }
    this.buffer = keep;
    return out;
  }

  // Drop everything pressed before the current phase began.
  flush() {
    for (const ev of this.buffer) {
      if (ev.key === cfg.KEY_DEBUG_TOGGLE) this.debugOn = !this.debugOn;
    }
    this.buffer = [];
  }

  begin(phase, state = {}) { this.pending = [phase, this.now(), state]; }

  async flip() {
    if (this.overlay && this.debugOn) this.overlay();
    const ts = await nextFrame();
    if (this.recording) this.frameTimes.push(ts);
    const t = this._rel(ts);
    this.lastFlip = t;
    if (this.pending) {
      const [phase, intended, state] = this.pending;
      this.pending = null;
      this.logger.logPhase({ onset: t, onset_intended: intended, phase, ...state });
    }
    return t;
  }

  // Hold what is on screen until the next onset-grid boundary.
  async align(draw, runDuration = null, stopAtRunEnd = true) {
    if (!cfg.LOCK_ONSETS_TO_GRID) return ['ok', this.now()];
    const target = nextBoundary(this.now());
    while (this.now() < target) {
      if (stopAtRunEnd && runDuration !== null && this.now() >= runDuration) {
        return ['run_end', target];
      }
      if (this.poll([cfg.KEY_QUIT]).length) return ['abort', target];
      draw();
      await this.flip();
    }
    return ['ok', target];
  }

  frameStats() {
    const ft = this.frameTimes;
    if (ft.length < 2) return { n_frames: ft.length };
    const iv = [];
    for (let i = 1; i < ft.length; i++) iv.push((ft[i] - ft[i - 1]) / 1000);
    const sorted = iv.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    return {
      n_frames: ft.length,
      median_frame_interval: med,
      max_frame_interval: sorted[sorted.length - 1],
      // A frame that took more than 1.5 refreshes: the browser's dropped frame.
      n_dropped_frames: iv.filter(x => x > 1.5 * med).length,
    };
  }
}
