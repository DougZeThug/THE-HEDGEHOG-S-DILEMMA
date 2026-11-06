# Approach reviews and draft reconciliation (2026-11-06)

Four specialists reviewed `brief.md` and `baseline.md`. Their findings are condensed below; the evidence references are theirs. The main session's draft decisions follow, for the skeptic to challenge.

A first A/B on 744 visits (`test-output/core-loop/ab1.md`, simulated) already showed one thing: A1 as first built raised the answer to coming near from 17% to 41%, to kneeling from 24% to 40%, and to tapping the chair from 13% to 43%. Density stayed at 6.8 a minute and imposed quiet at 42%. That version is the one the reviewers below argue against.

## Creative director

**Rule.** The room answers bodies, not words.
- An answer may be reliable in *kind* (light, sound, shadow), but never in *content* (a line, a voice, a memory). It must change or fade when the visitor repeats the act.
- Keep README's rule for reading.
- Add a counter-metric: the same act getting the identical answer. It has since been added as "identical answer to a repeated act".

**The flinch.**
- The flinch is true; the cold flash isn't.
- A warm flash for a gentle approach teaches a moral ("be gentle").
- Proposed instead: a subtraction (the shadow drawing back, the hum stopping dead), and no flash for gentleness. Warmth comes from staying.
- Don't tie the voice to manner, or abrupt visitors get scolded.

**The air line (A2).** It should come after the first withdrawal that follows *being let in* (≥ 6 s near). Spines go up after being left, not after being met. Drop the fast/slow rub-out.

**Departure lines, by how the visit went.** The ordinary and funny lines never appeared in 930 visits. Never speak "stay" at departure.
- Close: "It is still warm where you were."
- Came back after stepping away: new, "Somebody came back for the umbrella."
- Refused (came near, went away, didn't return): "Somebody almost knocked."
- Never came near: "From over there it looked smaller."
- Met a memory: "Someone turned the light off next door."
- Restless: "Somebody will have to paint over all of this one day."
- Otherwise: "The light stays on."
- "The chair, from the door." only for those who leave by turning their back. Drop "There is new writing on the wall."

**Leaving by turning away.** It is the most dilemma-true gesture, so protect it.
- Nothing said or written as it ebbs.
- Turning back finds the chair lit alone, the opening's image.
- The light comes back more slowly than it went, and the gesture is not offered again for 60 s.

**Memory order (D).** It is meaningful only if it rhymes with the visitor's behaviour.
- Almost (reach, start, take back, come nearer too late): approached, withdrew, came back.
- Things (a goodbye at a door): kept their distance.
- Woodland: stayed close.
- At least 2 minutes between the behaviour and its rhyme.

**Kneeling (B).** Don't write "It used to fit me." again: it is already there.

**Remove.**
- The warm flash.
- Graphite on every tap.
- The redrawn line.
- The fast/slow air distinction.
- The contributor departure line.

## Interaction designer

Measured by driving the real `CameraRig` through `mannerOf`.

- **[P0] As specified, A1 flinches at the step the opening invites.**
  - Holding W from the spawn arrives at 1.04 m/s, which counts as abrupt; Shift isn't hinted anywhere.
  - On a phone, a thumb push of 60 px gives gentle, 80 px neutral, 100 px abrupt: about 6 mm decides.
  - Recommendations:
    - Approach 1 never flinches; it gets the let-in, visible, plus the hush.
    - Flinch only from approach 2, at most twice.
    - On touch, never classify by speed.
- **[P1] Passes.** An approach should count only if the visitor is heading for the chair (±25°) as they enter *and then stop* inside 1.15 m or reach it. This is A1a: ship it whatever happens to the flinch, because it feeds hesitation and the trace.
- **[P1] In-room leaving.**
  - There is no door, so every departure would be an accident.
  - The still-1 rule writes on the faced wall at 5–9 s.
  - People stand facing south for many reasons.
  - Defer it and keep the departure-line half. If it is built, a long list of guards (≥ 180 s, z ≥ 2.4, ±30° and pitch, no writing near the centre of view, 10 s deep stillness, any input cancels, 90 s refractory, "return" offered at once).
- **[P1] Taps.**
  - Graphite with no visible mark, and nothing at all on a muted phone.
  - Primary: a *visible* acknowledgement on every recognised tap (the line darkens about 15% and settles over 1.2 s).
  - Secondary: one ≤ 0.5 s stroke of sound, if any.
- **[P1] The first click on writing only takes the mouse** (pointer lock). It should also interact.
- **[P1] A2 carries the dilemma better than A1** and is fair across devices. Ship A2 first.
- **[P2] Habituation:** each repeat of the same answer at 0.6× its amplitude.

## Cinematic director

Frames in `test-output/cine-core-loop/`.

- **[P1] The cold flash is a colour jump** (auto white balance), and the chair is already out of frame after a rush.
  - Instead, the room's own light pulls back toward the chair, in the dim's grammar, small and fast.
  - Hush at t0. At +0.25 s, area and sky go to 0.72, hemi to 0.88 and the chair glow to 0, with a smoothstep attack of 0.9 s, a 1.0 s hold and a 5 s release (0.85 under gentle intensity).
  - Key, colour and shadow are left alone.
  - Measured: −14% frame brightness on desktop, −11% on phone, legible without sound.
  - `dimToChair` needs attack and release parameters.
- **[P1] A late flinch is worse than none.** Fire within 0.3 s, or drop it. The second at 0.86, then none.
- **[P1] C as specified is a uniform fade of a blank wall.**
  - Staging if built: sound first; the ebb from the ceiling down; a quiet sound at the chair behind them at about 5 s; `depart` at 10 s without `playLeaving`'s second ramp.
- **[P1] The cancel is the best image in C.** It is the opening's chair alone in a dark room. Hold the dim 1.5 s once the chair is in view, then sound, then light.
- **[P1] B: "It used to fit me." is out of frame where people kneel.** If anything is written for a kneeler, place it from the kneeling view, once a visit.
- **[P2] The welcome is a swell, not a flash:** warm 0.3 over 6 s. The asymmetry (0.9 s in for a flinch, 4 s for a welcome) is the dilemma in tempo.

## Sound designer

- **[P1] The tap mark plays a 4.05 s writing clip.**
  - It sounds into held silences (`tap-mark` isn't held back), counts as a development, and takes one of four voice slots for 4.5 s.
  - Graphite is right only if a visible mark is drawn; otherwise no sound.
  - If kept: a 0.35–0.7 s excerpt, gated.
- **[P1] The flinch hush can't be told apart from the hush before a voice.**
  - Use depth 0.62, fall time constant 0.07 s, hold 1.2 s, rise time constant 1.5 s (add `rise`), with the light's onset in the same frame.
- **[P1] On a phone no hush can be heard** (the hum is −64 dBFS above 400 Hz). There the flinch is the light.
- **[P1] Bug: a deeper, shorter silence ends a longer one early.** After it, the room should return to the longer one's depth. Fixed in `AudioEngine.silence`.
- **[P1] C:** build the leaving on `Ambience.score`, not `silence`/`lift` (`lift` breaks a held silence). Don't start it in a held silence, an aftermath or a voice.
- **[P2]** "Stay" should not be spoken from the chair while they leave.
- **[P2] The welcome gets no added sound.** Hold its 0.4 hush while they stay near: a state, not an event.

## Draft decisions (main session)

These were the decisions sent to the skeptic. Several were superseded after the challenge: decisions 2–4 (the speed-graded flinch, the warm swell, the gentle hold) gave way to a recoil on *returning*, and decision 9 to a way out that is touched, not detected. The final decisions are in `docs/reviews/2026-11-core-loop.md`. Below, "0.86" and "0.6" are strength multipliers on the recoil (its hush depth and how far the light pulls back), and the light starts 0.25 s after the hush.

1. **A1a, confirmed approaches: ship.**
   - An approach counts once the visitor has headed for the chair (±25°) and then arrived (stopped 0.5 s inside 1.15 m, or reached 0.6 m). Leaving unconfirmed is a pass.
   - Passes make no withdrawals, no hesitations, no close trace.
   - Touch is never "abrupt".
2. **The first arrival of a visit is never graded.** Whatever the manner, it gets the existing hush plus the cinematic director's slow warm swell (0.3 over 6 s), so a phone can see it.
   - This answers the interaction designer's "visible let-in" without the creative director's "moral".
   - The swell is for coming, not for coming gently.
3. **The flinch.**
   - Only on a later confirmed arrival that is abrupt (desktop), at most twice a visit, the second at 0.86.
   - It is the room's light pulling back toward the chair (cinematic numbers, the light starting 0.25 s after the hush) with the sound designer's hush (0.62 / 0.07 / 1.2 / 1.5), both decided in the same tick as the arrival. (A confirmed arrival needs a 0.5 s stop, so it lands as they stop, not within 0.3 s of entering reach: "on arrival" is the cinematic director's moment, met.)
   - No colour flash, no shadow move, no voice change.
   - Where the creative director (shadow) and the cinematic director (room light) differ, the cinematic director is followed. Shadow drift has a 6 s time constant, costs shadow redraws, and is out of frame after a rush; the room light pulling back is the same subtraction, and it is visible.
4. **Later gentle arrivals.** Nothing new: the 0.4 hush held a while (the sound designer's state), no swell (the creative director's "no reward").
5. **The near-dwell voice stays tied to exposure over time, not to manner.** The withdraw answer after a flinch is kept: a line about staying or leaving after backing off is right.
6. **A2: ship if it measures well.** After the first withdrawal from a confirmed arrival that stayed ≥ 6 s and wasn't flinched at. The existing rub-out stays.
7. **B.**
   - Kneeling counts only within 1.5 m of the chair: ship.
   - The tap gets no graphite. Instead the touched line visibly takes the touch (darkens and settles), every recognised tap, plus nothing audible.
   - The kneel line is not rewritten.
8. **C, first half: ship.** The departure line by how the visit went (the creative director's mapping, one new line). "The chair, from the door." is unused unless C's second half ships.
9. **C, second half (in-room leaving): deferred.**
   - The interaction designer: no door, accidental endings, conflicts with stillness.
   - The cinematic director: it needs elaborate staging to avoid a fade on a blank wall.
   - The creative director wanted it. The staging and guards are recorded for a later round.
10. **D: ship if measured reach is better without crowding.** Wall offers don't spend a pointing. The later slot rhymes with the relationship (2-min lag).
11. **E: ship.**
    - Per-visit random seed.
    - Situations seeded per visit.
    - The `contribute` signal raised.
    - A click on the centre of the view interacts even as it takes the mouse.
    - The nested-silence fix.
    - The prefetch call fixed.
