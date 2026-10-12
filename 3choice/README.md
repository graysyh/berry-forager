# Berry Forager (web) — three-choice copy

**This folder is a copy of the main build (`../`) with two changes** (made 2026-10-09), served
at /berry-forager/3choice/:

1. The prompt has three choices: **STAY** `F` (pick again on this branch:
   the same bunches, the one just picked now bare, after the same faded
   `DECISION_GAP_RANGE` jitter as a switch, without the pan), **NEW BRANCH** `J` (the old "stay": pan to a fresh,
   depleted ladder after `DECISION_GAP_RANGE`) and **EXPLORE** `K` (travel).
   Data: `choice` is `stay` / `switch` / `leave` — note `stay` here is NOT
   the original build's `stay` (that is now `switch`). A missed prompt
   counts as `switch`. Harvest rows carry `branch_id` (0, 1, … within a
   bush); the stay gap is the `stay_branch` phase in the timeline. The MVT
   tracker and debug panel still only model switch vs leave.
   The highlight never visits an empty branch (`SKIP_EMPTY_BRANCHES`, on in
   both v1 and v2 here); a branch stayed on until bare shows "No berries
   left on this branch" and no highlight.
2. Travel: the walker goes along an endless row of bushes that all look
   alike, scattered loosely (and drawn bigger than in the main build, since
   travel distance no longer needs to fit on screen), stopping to search each
   one (the bush shakes) and walking
   on, until one turns out to be full; nothing shows in advance which one.
   It is slow on purpose: ~4 s walk per bush, the rest of the travel time
   shared out over the searches (≥ 2 s each), so 1–3 bushes per trip. The
   travel time itself is unchanged. Placeholder art; settings
   `TRAVEL_WALK_PER_BUSH_S`, `TRAVEL_SEARCH_MIN_S`, `TRAVEL_BUSH_SPACING`,
   `TRAVEL_SCATTER_*`, `TRAVEL_BUSH_W`, `TRAVEL_FORAGER_H` in `js/config.js`.

Because of (1) this copy no longer matches the Python task value for
value, so it has no parity tools.

---

A browser version of the Berry Forager patch-foraging task (MVT build), for
trying the task online. It is a port of the PsychoPy task, which remains the
source of truth for the design; this build reproduces its logic exactly
(same seeded random stream, bushes, timing and MVT benchmark) and writes the
same data files.

**Run it:** open the published page, fill in the participant ID, and press
Start. Keys: `Space` pick · `F` stay · `J` new branch · `K` explore · `D` MVT debug panel ·
`Esc` quit. At the end (or on quit) a zip with the events, patches,
timeline, triggers and meta files is downloaded.

Differences from the PsychoPy task: no scanner mode (triggers, lead-in /
lead-out); onsets are stamped at the browser's animation frame, so timing
is good to about one refresh.

## Version 2 (web only, on trial)

`?v2` on this page runs a variant that is not in the
PsychoPy task yet: bushes never run dry (the smallest bush has two branches
with one berry each), the highlight only visits branches that still have
berries, and the MVT "blind press" value averages over those branches only.
It is one flag, `NO_EMPTY_BRANCHES` in `js/config.js`; the main page is
unchanged and still matches the Python value for value. The data's meta file
records `variant` (`v1` / `v2`).

## Development

Serve the parent folder (`web/`, which holds the shared `assets/`) over
HTTP and open `/3choice/`:

    python3 -m http.server 8000

`tools/e2e.py` plays a full session headless (stay, new branch, explore at
every bush) and `tools/frames.py` renders animation frames, including the
travel walk.
