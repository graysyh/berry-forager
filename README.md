# Berry Forager (web)

A browser version of the Berry Forager patch-foraging task (MVT build), for
trying the task online. It is a port of the PsychoPy task, which remains the
source of truth for the design; this build reproduces its logic exactly
(same seeded random stream, bushes, timing and MVT benchmark) and writes the
same data files.

**Run it:** open the published page, fill in the participant ID, and press
Start. Keys: `Space` pick · `F` stay · `J` explore · `D` MVT debug panel ·
`Esc` quit. At the end (or on quit) a zip with the events, patches,
timeline, triggers and meta files is downloaded.

Differences from the PsychoPy task: no scanner mode (triggers, lead-in /
lead-out); onsets are stamped at the browser's animation frame, so timing
is good to about one refresh.

## Development

Serve the folder over HTTP (ES modules don't load from `file://`):

    python3 -m http.server 8000

`tools/` holds the checks used to build this port: `export_assets.py`
(re-exports the art from the PsychoPy project), `parity_py.py` +
`parity_check.py` + `parity.html` (value-for-value comparison with the
Python logic), `e2e.py` (plays a full session headless) and `frames.py`
(renders animation frames).
