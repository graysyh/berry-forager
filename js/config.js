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
  TRAVEL_BUSH_W: 0.22,
  TRAVEL_FORAGER_H: 0.17,
  TRAVEL_EDGE_MARGIN: 0.03,
  TRAVEL_STANDOFF: 0.035,
  TRAVEL_FRAME_DIST: 0.038,     // leg cycle, ~3 steps/s at TRAVEL_WALK_SPEED
  TRAVEL_GROUND_Y: -0.08,

  // Travel walk (web only; not in config.py): a loose scatter of
  // identical-looking bushes. The walker walks to the next one at a steady
  // TRAVEL_WALK_SPEED (height units / s) and searches it (at least
  // TRAVEL_SEARCH_MIN_S; the travel time left over is shared out over the
  // searches), so as many bushes are searched as fit the travel time; only
  // the last one turns out to have berries. Cosmetic only — the travel
  // duration is drawn exactly as before.
  TRAVEL_WALK_SPEED: 0.11,      // ~4 s per bush at the mean spacing
  TRAVEL_SEARCH_MIN_S: 2.0,
  TRAVEL_BUSH_SPACING: 0.42,    // mean gap; each bush is scattered around it
  TRAVEL_SCATTER_X: 0.06,       // +/- horizontal scatter
  TRAVEL_SCATTER_Y: [-0.07, 0.04],   // vertical scatter (down = nearer = bigger)
  TRAVEL_WALKER_SCREEN_X: -0.12,

  // Missed prompt (web only): no default choice. "Too slow!", the screen
  // greys out for a DECISION_GAP_RANGE jitter, then the prompt comes back
  // (a new prompt_id) until they answer.
  MISSED_PROMPT_REPROMPT: true,

  // Keys (browser KeyboardEvent.key, mapped to PsychoPy names in sync.js)
  KEY_STAY: 'f',
  KEY_LEAVE: 'j',
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

  // Web-only variant, on by default in index.html (?v1 turns it off; not in
  // config.py). Left false here so the parity tools still match the Python.
  // Bushes never run dry: the peak bottoms out at 1 and every bush keeps at
  // least 2 branches with berries; the highlight hops only between branches
  // that still have berries; the MVT "blind press" value averages over
  // those branches only.
  NO_EMPTY_BRANCHES: false,
  VARIANT: 'v1',
};
