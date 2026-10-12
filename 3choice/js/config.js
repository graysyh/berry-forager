// Task parameters — a copy of ../config.py (the PsychoPy task), which is
// the source of truth and documents every one of these. Keep the two in
// step: if they differ, the web build is a different task.
//
// Left out: scanner-only settings (triggers, TR, dummies, lead-in/out),
// which do not apply online.

export const cfg = {
  // Reward distribution
  R0: 5.5,
  K: 0.18,
  MAX_REWARD: 6,
  MIN_REWARD: 0,
  PATCH_R0_LEVELS: [5.5],
  BUNCH_SPREAD: 1,

  // Ladder shape
  TIER_DROP: 3,
  TIER_WIDTH_BASE: 2.0,
  PEAK_MARGIN: 0.15,
  GRID_SLOTS: 10,

  // Minigame timing
  HAND_SPEED: 0.55,
  HAND_SPEED_JITTER: 0.10,
  LADDER_REVEAL_S: 0.60,
  MINIGAME_TIMEOUT: null,
  RANDOM_SWEEP_START: true,
  KEY_PICK: 'space',
  ENTER_FRAC: 0.45,
  HARVEST_PAN_DX: 0.30,

  // Bunch geometry
  BAR_W: 0.72,
  BAR_Y: -0.020,
  GRID_BERRY_SIZE: 0.056,
  GRID_BERRY_SPACING_MULT: 0.60,
  BUNCH_STEMS: true,
  BUNCH_STEM_W_MULT: 1.15,
  NOTE_LIFT: 0.165,

  // Session
  RUN_DURATION: 10 * 60.0,
  PROMPT_RESPONSE_WINDOW: 2.5,
  REVEAL_HOLD_RANGE: [0.0, 0.6],
  GRAB_HOLD_RANGE: [0.1, 0.3],
  FEEDBACK_HOLD_RANGE: [0.8, 3.0],
  PROMPT_FB_HOLD: 0.18,
  DECISION_GAP_RANGE: [2, 6],
  SEARCH_FADE_S: 0.6,
  SEARCH_FADE_FLOOR: 0.60,

  // Onset grid
  LOCK_ONSETS_TO_GRID: true,
  ONSET_GRID_S: 1.0,
  ONSET_GRID_EPS_S: 0.05,
  TIMING_VERSION: 5,

  // MVT rates
  ARR_EWMA_HALFLIVES: [20.0, 90.0],

  // Travel
  TRAVEL_TIMES: [4.0, 8.0, 12.0],
  TRAVEL_BUSH_W: 0.14,
  TRAVEL_FORAGER_H: 0.11,
  TRAVEL_EDGE_MARGIN: 0.03,
  TRAVEL_STANDOFF: 0.035,
  TRAVEL_FRAME_DIST: 0.012,
  TRAVEL_GROUND_Y: -0.08,

  MISSED_PROMPT_DEFAULTS_TO_STAY: true,     // missed -> 'switch' (the old stay)

  // ── Three-choice copy (web_3choice only; not in config.py) ──────────
  // At the prompt: STAY on this branch (pick again from what is left on it,
  // the picked bunch now gone), SWITCH to another branch of the same bush
  // (the old "stay": pan + fresh, depleted ladder), or EXPLORE (travel).
  // Placeholder: the gap after a branch stay is shorter than the switch
  // gap (DECISION_GAP_RANGE), whole seconds on the onset grid.
  STAY_GAP_RANGE: [1, 2],
  // Travel: the walker stops at an empty bush every TRAVEL_SEARCH_EVERY_S
  // of travel and rummages in it for TRAVEL_SEARCH_S. Cosmetic only — the
  // travel duration is drawn exactly as before.
  TRAVEL_SEARCH_S: 1.2,
  TRAVEL_SEARCH_EVERY_S: 2.4,
  TRAVEL_BUSH_SPACING: 0.24,
  TRAVEL_WALKER_SCREEN_X: -0.12,

  // Keys (browser KeyboardEvent.key, mapped to PsychoPy names in sync.js)
  KEY_STAY: 'f',          // stay on this branch
  KEY_SWITCH: 'j',        // move to another branch
  KEY_LEAVE: 'k',         // explore
  KEY_QUIT: 'escape',
  KEY_ADVANCE: 'space',
  KEY_DEBUG_TOGGLE: 'd',

  // Display
  ACCENT_COLOR: [205, 70, 70],
  SAFE_HALF_W: 0.42,

  // MVT debug panel
  MVT_DEBUG_PANEL: false,
  MVT_PANEL_WINDOW_S: 150.0,
  MVT_PANEL_TEXT_HZ: 5.0,
  MVT_ASSUMED_PRESS_S: 1.6,
  MVT_ASSUMED_RT_S: 0.70,
  MVT_ASSUMED_HIT_RATE: 0.90,
  MVT_ASSUMED_TIMEOUT_RATE: 0.02,
  MVT_MIN_TRIALS_FOR_FIT: 5,
  MVT_FLAT_TOLERANCE: 0.02,

  SCANNER_MODE: false,

  // Web-only trial variant (the /v2/ page turns it on; not in config.py).
  // Bushes never run dry: the peak bottoms out at 1 and every bush keeps at
  // least 2 branches with berries; the highlight hops only between branches
  // that still have berries; the MVT "blind press" value averages over
  // those branches only.
  NO_EMPTY_BRANCHES: false,
  VARIANT: 'v1',
  TASK_COPY: '3choice',   // recorded in meta; this is the three-choice copy
};
