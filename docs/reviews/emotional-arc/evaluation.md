# The finished heart: QA and the creative director's evaluation

Steps 5 and 6 of the review process (`CLAUDE.md`), on the built change. Condensed; the decisions are in `../2026-11-emotional-arc.md` ("After QA and the evaluation").

## QA and accessibility (real input in the browser, desktop and phone emulation)

**Verdict.** Most of the path works with real input: the recoil, Almost, the answer that stays, the two-line card, reload and forget. Two P1 defects stopped the offered line being reachable where it matters.

Passed, with real input (walking and turning by keys and touch drags, clicks, taps, the menu, leave, Esc, forget, reload): the recoil (about 44 s desktop, 47 s phone), after which the heart was Almost; the gate holding the line back while they looked down at the seat (26 s) and offering it 7.6 s after they lifted their eyes; Almost begun by a click from 1.6 m and by a tap; the answer written beside "I wanted you to stay." and still there after 270 s and a phase change; the card (first line, then the answer, focus on "go back in", its accessible description); reduced motion (OS and in-app); `hh.heart.v1` kept over a reload and found beside the first line once they turned away; forget clearing it; no console errors or failed requests. `tsc`, vitest, the build (no ElevenLabs in the bundle), smoke and the phone playtest clean.

Forced, and said so: two runs advanced from about 47 s to 67 s; one aim set on the rig (pointer locked); a 240 s advance; kneeling on the phone; the answer set directly for the reduced-motion and unfinished-card checks; storage seeded for the phone return. Not assessed: audio and captions, a real screen reader, real devices and frame rates.

| | Finding | What was done |
|---|---|---|
| P1 | The offered line landed near the skirting (v 0.29 m and 0.59 m), partly off a phone's screen: the level point is in the space kept behind the chair, the rest of the eye band was full, and the whole-wall scan found the floor. | A memory's line is placed only at eye height (0.9–1.85 m), as near the line of sight as the wall allows; close to it, it may go into the space behind the chair, as an answer may. If nothing fits it is not spent: it is offered again, not on that wall for a minute. |
| P1 | A click on the line from beside the chair knelt instead of touching it. | A click on a line being looked at touches it, at any distance. |
| P2 | "Found, not watched" used the yaw quadrant: the answer was written with the first line in the middle of the frame. | A frustum test of the first line (`inView`). |
| P2 | Unfinished first line: a screen reader heard "I wanted you to I took my hand back." | A spoken pause between the two lines. |
| P2 | The button took focus while the answer was still fading in. | With an answer, the button comes at 9 s. |
| P2 | The privacy text was out of date. | It lists what is remembered. |
| re-check | With the fixes, a click on the line from beside the chair began Almost, but it ended unseen 6 s later, the view turned 80° to the side and up. Traced: the first pointer move once the mouse is taken carried the cursor's whole offset as movement (yaw +1.41 = 640 px, pitch +0.84 = 380 px), so a visitor's first click of a visit turned the view away from what it touched. Pre-existing (QA's first click from the chair "lost its gaze while kneeling" the same way); it now cost the heart. | The first move after the lock is ignored if it is a jump (over 120 px). |
| note | In 4 of 4 real-input runs the first return to the chair (about 23 s, just after the visit turned "familiar") got no recoil. Pre-existing, but it now decides whether the heart is Almost. | Fixed: a turn that neither writes nor dims no longer blocks the recoil, and a turn waits while a return may be under way (at most 30 s). Simulated, 5-minute visits: first return lost to a turn 22% → 12%. |

## Creative director, on the finished experience

**Verdict.** "When the whole chain happens, the visit now reads as one sentence. The room flinches, a film shows a flinch, the room owns it in pencil, the card says it again, and the next visit finds it. The room has never had a consequence before this." It still broke at both ends: a short visit stopped at the film, and the card could be the first place the line was read.

| | Finding | What was done |
|---|---|---|
| P1 | A short visit stops at the film: at 3 minutes 25% saw Almost but 3% had its line written, so most left nothing. | Taken. Once Almost has been seen, its line is kept for the next visit, written on the wall yet or not: the room writes it while they are away. The card still shows only what was on the wall. |
| P1 | The card may be the first reading, and then it explains. | Taken. The card ends on the answer only if it has been in view (1.5 s). A line never seen is found on the next visit instead. |
| P1 | The north wall keeps filling after the peak (verified in one run; simulated, a median of 4 new north-wall lines after the answer in a 10-minute visit). | Taken, as a cut. Once the answer is written nothing new is written, revealed or re-inked on the north wall for the rest of the visit; the room chooses from the other walls. The visitor's own words aside. |
| P1 | Too much happens between the flinch and the film (asked for the battery's count; if above 3, hold the room quiet after the recoil until the line is offered, up to 30 s). | Measured: a median of 4 events in a median 33 s between the recoil and the line. **Not taken.** The rhyme is carried by the line "I took my hand back.", which names the flinch, not by the two being close in time; a 30 s hold just after the visitor has come back would leave them unanswered at the moment they acted (the core loop's measure), and the skeptic cut the 45 s clearing as machinery. Left as a question for the artist (below). |
| P2 | Order on the wall is left to chance; the comment said "under 'I didn't know how.'"; that line fades after 300 s, so what lasts is the two-line version. | Comment corrected; the two-line version accepted. |
| P2 | The privacy text announced a reward ("the one line the room may leave you"). | "a line of the room's own writing". |

Answers to the open questions: the third line **deepens** Almost ("the film is in third person … the line puts it in first person and past tense, also means 'taking back' in the sense of retracting, and names the room's own recoil"); the unfinished card "I wanted you to / I took my hand back." lands; **keep the card to this visit** (if it followed the wall, every later card would be the couplet); the woodland and Things without a line are coherent "as a quieter sentence", closed by the existing cards. Add no lines.

Could not assess: whether anyone feels the flinch and the film as one gesture; whether the card reads as confession or slogan; on a phone, the kept line can't be read from the starting position.
