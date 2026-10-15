# Browser runs, before and after (real time, 300 s each)

`node tests/playtest/browser.mjs` on the built preview, phone emulation for still and phone; before = f0cbaf2 (clean worktree), after = 976eca6. The container renders at 11–19 fps, so the Director covers only part of the 300 s (column 'engine s'). No memory began in these six short runs, so they show the spacing, not an aftermath (the engine journeys in `journey-*.txt` measure that).

| run | engine s | events | room's own events | moments with two or more of them at once (within 0.5 s) | captions | errors |
|---|---|---|---|---|---|---|
| still before | 193 | 20 | 11 | 2: 77.2 s (accumulate + drift); 84.6 s (accumulate + stray) | 9 | 0 |
| still after | 208 | 23 | 15 | 0 | 9 | 0 |
| desktop before | 34 | 8 | 3 | 0 | 4 | 0 |
| desktop after | 25 | 7 | 3 | 0 | 5 | 0 |
| phone before | 193 | 29 | 13 | 2: 110.5 s (drift + resurface); 110.5 s (resurface + recontext) | 9 | 0 |
| phone after | 152 | 18 | 8 | 0 | 7 | 0 |
