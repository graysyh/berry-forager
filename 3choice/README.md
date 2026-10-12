# Berry Forager (web) — three-choice copy

**This folder is a copy of the main build (`../`) with two changes** (made 2026-10-09), served
at /berry-forager/3choice/:

1. The prompt has three choices: **STAY** `F` (pick again on this branch:
   the same bunches, the one just picked now bare, after a short
   `STAY_GAP_RANGE` gap), **NEW BRANCH** `J` (the old "stay": pan to a fresh,
   depleted ladder after `DECISION_GAP_RANGE`) and **EXPLORE** `K` (travel).
   Data: `choice` is `stay` / `switch` / `leave` — note `stay` here is NOT
   the original build's `stay` (that is now `switch`). A missed prompt
   counts as `switch`. Harvest rows carry `branch_id` (0, 1, … within a
   bush); the stay gap is the `stay_branch` phase in the timeline. The MVT
   tracker and debug panel still only model switch vs leave.
   The highlight never visits an empty branch (`SKIP_EMPTY_BRANCHES`, on in
   both v1 and v2 here); a branch stayed on until bare shows "No berries
   left on this branch" and no highlight.
2. Travel: the walker passes a row of empty bushes, stopping to rummage in
   each (bush shakes, "?" bubble, then "empty"), and reaches the full bush
   at exactly the same travel time as before. Placeholder art; settings
   `TRAVEL_SEARCH_*`, `TRAVEL_BUSH_SPACING` in `js/config.js`.

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
