# The Fox and the Moon: style bible (draft 2, 2026-11-08)

This bible sets how the film looks and moves, in rules that can be checked. It comes from:
- **the artist's reference sheet:** `references/fable/Fox_and_Moon_Orange_Reference_v2.png`, six
  panels, the fox facing right in all of them;
- **the artist's production bible and handoff:** `references/The Fox the Moon/.../docs/`,
  `handoff/`. They ask for "expressive puppet acting and cinematic control of light, framing and
  stillness"; the touch is "a belated reaching gesture, not violence".
- **the study of high-quality stop-motion and cut-out work** the artist chose: Norstein, Wes
  Anderson, Laika/Aardman.

Draft 2 takes in the creative director's, technical artist's and cinematic director's reviews and
the skeptic's challenge (recorded in `docs/reviews/2026-10-fable.md`).

Numbers are marked:
- **[study]**: from published sources. The frame-by-frame measurement of the artist's study clips
  will confirm or correct them.
- **[judged]**: our own call.
- **[locked]**: fixed by an earlier decision.

The film runs on radio cut v1 with soundtrack mix 1 [locked].

**Units.** Sizes are in **render pixels** of the 1920×1440 open matte, unless marked as source
pixels. Luminance is **display** (sRGB code value / 255) unless marked linear.

## Why the first picture failed, and the rule it gives us

The pond test was one 505 px panel, upscaled and cut into six flat pieces. All of them moved on four
shared curves: about 2 s of real motion, then light changing on a still. That is the "technical
demo" the handoff warns against.

The draft pilot nearly repeated it. The fox acted for 2.9 s of a 13.6 s shot, then held while the
water did the work.

**The motion budget, checked on every shot:**
- no stretch longer than about 2 s without a change in the fox of at least 3 px [judged];
- every shot shows at least one change of pose family, not only rotations within one.

## 0. Who he is

- He is a shy, ordinary fox who tells the moon small things. He is never a hunter and never cute,
  and he never looks at us: no head turns toward the lens, every head is in profile.
- He acts as the artist's bible asks: with his spine, the angle of his head, his ears, his tail and
  his pace.
- His only relief from sadness is a little irritation and embarrassment (¶19's hiding place,
  "pretending to be busy").
- His ears tell the truth when his body gives up. After the touch, his body sinks while his ears
  still point to where she was.

## 1. The world: a miniature paper theatre

- **Scale:** everything is cut paper and card at about 1:12. The fox is about 25 cm nose to tail.
- **The proscenium:** dark wooden curtains on brass rings open on the first frame and never close
  [locked, decision 11]. The proscenium is seen only at the start and the end.
- **Materials:**
  - **The fox:** one mould-made burnt-orange paper with a coarse mottle. Fur is **cut at the
    edges**, as a ragged outline. Inside each piece is the paper's own mottle, with only sparse
    painted strokes [the creative director, from the reference].
  - **Cream:** a softer paper for the chest, cheek and tail tip.
  - **Charcoal:** for the lower legs and the outer face of the ears from mid-height up. No inner ear
    shows in profile.
  - **The ground:** dark brown card, layered and torn.
  - **Trees and reeds:** sharp black card with a faint blue rim where the moon catches them.
  - **The water:** indigo and slate tissue and glassine, with cut silver-leaf glints.
  - **The moon:** a disc of handmade tissue, lit from behind, its fibres showing as a mottled ivory
    glow.
  - **The air:** tracing-paper gauze on its own planes for haze (Norstein) [study].
- **Edges:** every cut edge has a slight lift. The rim on the side toward the moon is drawn by the
  compositor from the piece's normals, never painted into the source.

## 2. Palette and light

- **Palette:** sampled from the reference (median, with the 20–80% range):

  | Role | Colour |
  |---|---|
  | night sky | `#303948` (`#262d3a`–`#3d4454`) |
  | water | `#2f3643` |
  | ground and deep shadow | `#110c0a` |
  | fox | shadow `#7d310c`, mid `#87370e`, lit `#bf6b25`, highlight `#cf9f66` |
  | cream | `#e1d9c3` |
  | moon core | `#fcf7e7` |
  | moon glow | `#ba9670` |

  The reference is dark and muted everywhere but the fox and the moon.
- **The kit's albedo is graded to this per material:** fox orange, cream, charcoal and brass, each
  by its own 3D LUT or matrix, because the compositor's light is neutral. **Gate:** the fox's mid
  tone in a test render is within ΔE 5 of `#87370e` [technical artist].
- **Key:** the moon, always from where she is. Her light tells the story [locked, decisions 6–7].
- **Fill:** cool, low and from the front. The fox's darkest fur is never below 8% display luminance
  [judged].
- **Flicker:** none. Light changes on twos with what causes it: the strips, the leaves, the moon's
  height. Never per frame [study].

## 3. The puppet

- **Facing right,** as in the reference. Generated pieces may be flipped: they are lit flat, and the
  pins are added in compositing.
- **Pose families, not a piece-by-piece kit** [the skeptic, over the technical artist]:
  - Each pose family is one whole assembled fox in one 4K image, made as an edit of the artist's
    approved model sheet, so the eye, the fur scale and the paper stay his.
  - Each family is cut into about 6 layers: the body with the far legs, the head, the near ear, the
    near upper foreleg, the near lower foreleg with its paw, and the tail.
  - Only the overlaps a joint's range will expose are painted in.
  - Within a family, the layers rotate on their pins for the slow motion. A change of family is a
    replacement, made on the fast frames, as Norstein and Laika replace pieces rather than bend
    them.
- **Visible pins** go only at the shoulder, elbow, hip, knee and hock [the creative director].
  - They are matte domed brass, about 1/12 of the head's length.
  - Each is a pin sprite added in compositing, not rotated with its piece, lit from the moon's side.
  - All generated pins and eyelets are painted out of the source.
  - The neck and tail hinges hide under the overlaps.
- **The eye:** a dark almond, no iris colour, a heavy upper lid, at most a dull catchlight. Three
  states: open, half, closed.
- **Heads, all in profile:**
  - neutral;
  - raised (to the moon);
  - lowered (ashamed);
  - telling (jaw open, ears forward: ¶2 and the ending);
  - pretending to be busy (looking away, ears half down: ¶19);
  - content (the ease);
  - reaching and intent;
  - sleeping;
  - trying not to cry (¶27, seen in his reflection).
- **Joints:** the under piece's end is an arc centred on the pivot, covered by the over piece across
  the joint's whole range: neck ±35°, elbow 0–130°, tail ±25° [technical artist, judged].
- **Detail, measured against the screen:**
  - A source must carry about 4× the screen size in *real* detail. The 2× downscale-upscale test
    finds a "4K" Nano Banana Pro image holds about 2.75K of real detail [the skeptic, measured].
  - A head about 150 px on screen (panel 5's distance) is therefore served by one pose per 4K image:
    a head of about 1,400 source px, about 700 px of real detail.
  - Only the panel-4 close-up needs heads at about 2,500 source px.

## 4. Sets: depth planes per place

Each place is a stack of painted planes at set depths, Norstein's multiplane [study]. Each plane is
generated at 4K, flat-lit, and graded to the palette.

| Place | Planes, far to near |
|---|---|
| The hill (panels 1, 6) | sky and moon · far hills · treeline · the hill's ground row · grass · proscenium |
| The pond, wide (panel 2) | sky · far trees · far water · bank · near water · near reeds |
| **The pond, close (panels 3, 5; the pilot)** | sky and moon · the hill's silhouette under her final height · far trees · far water · bank · the branch (on the fox's plane, sharp) · water strips · near reeds (soft) |
| The branch from above (panel 4) | water and her disc · lily pads · leaf shadows · branch · bank and paw |
| The empty pond | the wide pond, without him, the reeds still pressed |

**Before any rig is built, one still is shown to the artist:** the touch pose composited into the
pond-close set, lit by the moon, beside panel 5. It is the cheapest place to fail [the skeptic].

## 5. Camera and frame

- **Locked off** [locked, decision 5; confirmed by the cinematic director]. A parallax drift across
  flat planes is the Ken Burns look, close to what the artist rejected; the cure is more drawings,
  not camera movement. Pieces travel across the planes instead.
- **The frame:**
  - render the 1920×1440 open matte;
  - phones get the 4:5 column, 1152×1440 scaled to 864×1080;
  - desktops get the 16:9 crop, which loses the top and bottom 12.5% of the matte. So everything
    that tells the story stays between y 0.14 and 0.86 of the matte [the cinematic director].
- **Depth of field:**
  - The fox sits on one plane, in focus. Planes one step away are blurred 0.5–1.5 px, the near reeds
    3–6 px.
  - Each plane's blur is applied to premultiplied RGBA, so edges don't fringe.
  - Haze is a paper plane moved toward the camera, never a blur [study].

## 6. Animation rules

- **Rate:** 24 fps. Twos by default; ones only for the last 3 frames of the paw's fall and the
  contact [study; the creative director].
- **The frame never freezes, but the fox may:**
  - Water, light and haze keep moving.
  - The fox may hold still when stillness is the meaning: the held breath after the touch, which
    ends in a visible exhale.
  - The motion budget still applies: an ear or a sink breaks a long hold.
- **Breath:** a rotation of the body about the hip pin, 0.5–1°, which is 2–3 px at the shoulder.
  - One cycle every 2.5–3.5 s at rest, 1.5–2 s when afraid [study].
  - The 1–2 px rise of draft 1 is smaller than noise on twos [the cinematic director].
- **Every part on its own clock** [`docs/animation.md`]:
  - In any move, the eyes and ears lead and the head follows by 1–2 drawings, then the body.
  - Overlap is counted in drawings: ears 1, tail 2–3.
  - No two parts start or stop on the same drawing, except at the touch.
- **Spacing:**
  - Ease out of a hold and into the next (t²e^(−t/b), `docs/animation.md`).
  - Rigid joints overshoot 2–5° and settle over 2–3 drawings.
  - Limbs travel on arcs. No straight-line slides.
- **Blinks:** rare and deliberate.
  - An ordinary blink is 2 frames closing, 1 closed, 3 opening.
  - A slow blink is 3 closing, 4 closed, 5 opening, and reopens to **half** [the cinematic director].
- **Re-seat jitter:** none in the pilot. At 0.2° on a 150 px limb it is about 0.5 px, invisible on
  twos [the skeptic]. Revisit only if the pilot reads too clean.
- **Texture** lives in piece space. Each piece is shrunk once per shot with area filtering to about
  1.25× its screen size, then warped with cubic filtering, so fur never shimmers and paper never
  crawls [technical artist].
- **Timing:** block a reel of key poses on the soundtrack first, then time the in-betweens from it.
  The frame numbers in §8 are targets until the blocking reel exists [the skeptic]. The image leads
  the words by 0.3–1 s [locked, decision 12]. The touch's contact is film frame 3169 [locked].

## 7. Effects

- **Water:** three tissue strips in parallax, each moving under 1 px per drawing. Glints turn on and
  off over 4–8 frames.
- **Her reflection:**
  - The disc on the water is cut into horizontal strips.
  - As the sky moon rises, the disc moves **down the frame**, toward the camera, mirrored about the
    horizon [the cinematic director].
  - At the touch, 7–9 strips break outward, nearest first, one per drawing from frame 3171. They
    slide apart, settle and dim on the soundtrack's decay (τ 2.5 s), and never re-form [locked,
    decision 9].
- **Her light on him:**
  - Her reflection lights his chin and chest from below: warm, +15–20%.
  - At the touch, that light breaks with the strips, moving on twos, and dies on τ 2.5 s.
  - After that, only the cold key from above is left. The shot's change is her light leaving his
    face [the creative and cinematic directors].
- **Ripples:** cut glassine rings, starting on 3169, 3178 (the water's lap in the mix), 3190 and
  3204, lasting 16, 24, 32 and 40 frames.
- **Haze:** paper planes [study].
- **The shaft:** broad and soft, and never following him [locked].

## 8. The pilot: the reach and the touch

**One locked shot, frames 3080–3406** (128.33–141.92 s). It cuts in 0.3 s after "pond." and cuts
out 0.3 s before "For". The animatic's boundaries were 3097 and 3414.

**Framing,** as fractions of the 4:5 column. These are approved by the artist from the touch still
(2026-11-08), which was composed toward panel 5. They replace draft 2's first table, at which his
head was only about 100 px and his paw landed on the bank.

| Element | Position |
|---|---|
| Horizon | y 0.42 |
| Fox | x 0.0–0.66, about 0.66 of the column wide; his head about 155 px at 1920×1440 |
| Paw contact | (0.66, 0.66), past the bank's lip, on the water |
| Her reflection | a path of torn strips down the water under her, its near edge at the paw; broader, brighter and more broken than the first still (the artist) |
| Sky moon | x 0.62, diameter about 0.11, near y 0.17 at the touch |
| Hill silhouette | under the moon's final position |
| Branch | upper left |
| Near reeds | bottom left and right edge, soft |

**The acting, timed to Tom's word onsets:** "pushed" 129.54 s (f3109), "reached" 130.94 s (f3142),
"her." ends 131.85 s, contact f3169.

| Frames | The fox | The water and the light |
|---|---|---|
| 3080–3098 | Under the branch, coiled, the forepaw that drew the branch over still on it. Eyes move on 3092, ears on 3094. | Leaf shadows dapple him; her disc is low on the water. |
| 3099–3122 | **The same paw pushes the branch aside**, which springs up and away, its leaves following 1–2 drawings late. The push leads "pushed" by about 0.4 s. | The leaf shadows slide off him: her light finds him as she leaves. |
| 3123–3165 | **The reach.** Hips planted on the bank, he leans out and stretches to his limit, neck long, the paw travelling out on an arc after her. A large move, on twos. Ears forward. | The disc sinks down the frame as the moon rises. |
| 3166–3168 | **The paw's fall**, on ones: his weight tips, the paw drops short. | |
| 3169 | **Contact.** The body overshoots 3° and settles by 3175. | The first ring. Her light under his chin breaks. |
| 3170–3264 | **He holds his breath.** The body is still; the near ear turns back at about 3215, late, and the far ear stays toward her. | Strips break one per drawing from 3171. The rings spread, the strips are widest at about 3193 (the score's rise), and the warm light dies on τ 2.5 s. |
| 3264–3290 | **The exhale: the "sunk" family.** Shoulders and head drop 25–40 px, the ears 1–2 drawings late, the paw left in the water. | Only the cold key is left. |
| 3290–3406 | Slow breaths every 3.5–4 s. Head lowers 4° (3310–3358). A slow blink (3349–3360) reopens to half. | The water stills on "still," (f3347), the last glint goes out, the moon stops on "hill" (f3376). |

**Pose families the pilot needs:** under the branch, the full lean and reach, paw in the water,
sunk. Plus the branch (pushed and sprung), the strips, the rings, and the moon at her two heights.

**Sound:** mix 1 has no branch sound for this push (its rustle is the shelter's). The push is silent
unless the artist asks; mix 1 is the artist's choice.

## 9. Quality gates

1. **Detail:**
   - every source holds about 4× screen size in real detail, by the 2× test;
   - side by side at screen size with the reference panel, the paper and fur are at least as fine;
   - no upscaled softness.
2. **Matte:**
   - composited on `#303948`, a 3 px band at the edge has a mean luminance within 10% of the
     interior;
   - no pale halo. Erode 2 px, take the card colour out of the edge pixels, and let the compositor
     draw the rim.
3. **Light:** each source is flat-fielded by its smoothed card before cutting. No baked shadows, no
   painted contact shadows; the compositor makes them.
4. **No generation artefacts:**
   - no extra pins, eyelets, limbs or toes;
   - no inner ear in profile, no smile, no amber iris;
   - no text or watermark;
   - the colour graded to the palette.
5. **Model:** every pose family is checked against the approved sheet at screen size: the eye, the
   ears, the muzzle length, the fur scale.
6. **Motion:**
   - the motion budget (§0);
   - no straight slides;
   - no two parts starting together except the touch;
   - the schedule on twos and ones as sheeted, tested at 12, 24 and 60 fps;
   - the contact on frame 3169.
7. **Render:**
   - the fox casts onto the set as one combined matte;
   - pins cast nothing;
   - static planes are cached per shot.
   - Budget: about 1 h for the pilot.

## 10. Never

- Everything moving on one curve.
- A piece sliding on a still painting.
- A pounce.
- A head turned to the camera.
- A cute or smiling face.
- Painted pins.
- Baked studio light.
- Fur painted everywhere.
- Per-frame flicker.
- Crawling texture.
- Morphing between drawings that disagree.
- A camera drift across flat planes.

## Sources

The research behind the [study] marks is listed in `docs/reviews/2026-10-fable.md`:
- Norstein: the Animation Studies journal; *Animation Obsessive*.
- *Fantastic Mr. Fox*: Den of Geek; MUBI.
- *Kubo*: fxguide; Screen Rant.
- Aardman: Post Magazine.
- Moving holds: Animation Mentor.
- Blinking and breathing: medical and veterinary sources.
