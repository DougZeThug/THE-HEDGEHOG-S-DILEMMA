# Five More Minutes: drawings for the shot list

The memory is eight shots (your shot list, 2026-10-17). The engine draws the wide shots (3, 7, 8)
and the way in (1, 2) from the paintings already here. What it can't draw is people acting up
close. The three close-ups (shots 4, 5, 6) are your drawings, shown as drawn animation: each one
held, then a cut to the next. Nothing is morphed between them (a face warped between two drawings
tears). The engine adds only the breathing and the grass moving in the air. The camera stays
still on each close-up.

So every movement is made of drawings: a start, sometimes a drawing halfway, and where it ends.
That is 11 drawings for the close-ups, plus the pencil drawing for shot 1 (and, if you like, the
same pencil drawing with nobody in it, for the end). Two more are optional, for the way in: the
leaves passing the lens in shot 2, and where the colour goes on the wall.

This replaces the earlier lists. The three full-scene takes of her look (`b-look-full-*`) are not
needed now; nor is `c4-blink`, nor her blink (`c5-end-shut`, `c5-end-half`): your shot 5 has no
blink in it, and it would have read as a tender, deliberate one.

## How

- Make each close-up as a **widescreen 1920×1080** image.
- **Framing (matched close-ups):** his head in the left half of the frame looking right, her head
  in the right half looking left, each head **no more than about 40% of the frame's height**,
  with grass all round it. Leave room: I crop each shot here so their eyes line up across the
  cut, so the prompt doesn't have to place them exactly.
- **The same light as the wide:** the warm late afternoon from the upper right, no brighter
  than the two of them are in the wide painting (the close-ups cut straight to and from it).
- **Faces at rest:** mouths at rest, no smile needed (the sheet's panels smile; every face edit
  inherits from its first drawing, so say it there).
- For each shot, make its first drawing from the sheet's close-up panel (in this folder). Make
  every other drawing as an **edit of the drawing named**, changing only what the prompt says.
  That keeps the grass, the clothes and the light the same from drawing to drawing, which is what
  lets them cut together.
- Put the results in `references/woodland/drawings/` with the names below (or upload them). PNG,
  WebP or JPEG are all fine.
- **Check before keeping a take:** when a set is in, I'll send you each shot as a flipbook (a
  12-a-second GIF). Reject any take where the line weight, softness or colour shifts, or where
  something changed that the prompt didn't ask for. A take that won't line up with its shot's
  first drawing is refused here, and the timeline holds the drawing before it.

Start every prompt with:

> Hand-painted anime illustration, soft watercolour and gouache texture, fine ink linework, warm
> late-afternoon light from the upper right with soft dappled leaf light, the same characters,
> face, hair and clothes as the reference.

Negative prompt for all: different face, different hairstyle, different clothes, extra fingers,
extra limbs, text, watermark, photo, 3D render, blur.

## Shot 1: the pencil on the wall (from `../drawings/base-scene.png`): most important

Every visitor who meets this memory sees shot 1. The wall shows a stand-in for now: an edge
filter of the painting, and it reads as one.

| File | Prompt |
|---|---|
| `pencil.png` | Turn this painting into a loose graphite pencil underdrawing on white paper: exactly the same composition, light searching lines for the tree trunks, branches and leaves, the grasses, the log, the two people outlined; some lines drawn twice where the hand wasn't sure; the two people the faintest lines in it; no colour; only a few hatched strokes of shading. Keep every element in exactly the same place, same size (1672×941). |
| `pencil-after.png` (optional) | (Made from `pencil.png`.) The same drawing with nobody lying in the grass: the grass drawn through where they were; nothing else changes. (For the end, when the empty clearing goes back into the wall. Without it, the two of them are taken out of your `pencil.png` here, the grass beside them carried across.) |
| `wash.png` (optional) | The same composition as an early watercolour stage over that pencil drawing: soft washes of colour blocked in, no detail yet, paper showing through, everything in exactly the same place. |
| `colour-extent.png` (optional) | Not a prompt: painted by hand over the painting (`../drawings/base-scene.png`), the same size. White where the colour goes on the wall, black where it stays pencil, soft where it fades between them. Follow what is in the picture: the canopy's edge, the grass spilling down, the sides going back into the pencil. Until there is one, the colour stops at a soft-edged rectangle with rounded corners. (Not wired in yet: I'll add it when the file is here.) |

## Shot 2: into the forest (optional)

Your shot 2 has leaves passing close to the lens. A sprig cut from the painting itself was tried
and taken out: small and sharp, it read as a sticker sliding past. A drawing made for the lens
would do it. (Not wired in yet: I'll add it when the file is here.)

| File | Make it from | Prompt |
|---|---|---|
| `c2-leaves.png` (optional) | `../drawings/base-scene.png` | The near oak's leaves very close to the lens, out of focus, lit from behind by the afternoon sun: a few leaves and a twig, large in the frame, soft-edged, warm green and gold where the light comes through. Nothing behind them: a plain, flat background of one colour, so they can be cut out. Widescreen, 1920×1080. |

## Shot 4: he looks toward her (from `panel-him.png`)

His eyes go to her first; half a second later his head follows, through the halfway drawing.

| File | Make it from | Prompt (after the line above) |
|---|---|---|
| `c4-end.png` | `panel-him.png` | Recreate this close-up as a widescreen 16:9 image, 1920×1080: the young man lying on his back in the grass, one arm folded behind his head, his face turned toward the right of the frame, looking at someone just out of frame, his mouth at rest. His head in the left half of the frame, no more than 40% of the frame's height, not cropped; extend the grass and clover naturally to fill the frame. |
| `c4-start.png` | `c4-end` | The same image, but he is looking straight up at the sky: face turned up, chin slightly raised, eyes looking upward. Nothing else changes. |
| `c4-eyes.png` | `c4-start` | The same image, only his eyes have moved, looking sideways to the right toward her. His head still faces up. Nothing else changes. |
| `c4-mid.png` | `c4-end` | The same image, but his head is turned only halfway between looking up at the sky and looking at her; his eyes already on her. Nothing else changes. |

## Shot 5: she notices (from `panel-her.png`)

Her eyes go to him; a pause; her head follows, through the halfway drawing.

| File | Make it from | Prompt |
|---|---|---|
| `c5-end.png` | `panel-her.png` | Recreate this close-up as a widescreen 16:9 image, 1920×1080: the young woman lying on her back in the grass, her hair spread over the grass, her face turned a little toward the left of the frame, looking at someone just out of frame. Calm, her mouth at rest. Her head in the right half of the frame, no more than 40% of the frame's height, not cropped; extend the grass naturally. |
| `c5-start.png` | `c5-end` | The same image, but she is looking straight up at the sky: face turned up, eyes looking upward. Nothing else changes. |
| `c5-eyes.png` | `c5-start` | The same image, only her eyes have moved, looking sideways to the left toward him. Her head still faces up. Nothing else changes. |
| `c5-mid.png` | `c5-end` | The same image, but her head is turned only halfway between looking up at the sky and looking at him; her eyes already on him. Nothing else changes. |

## Shot 6: almost touching (from `panel-hands.png`)

Hers shifts a little nearer through the grass; the fingers stay apart.

| File | Make it from | Prompt |
|---|---|---|
| `c6-start.png` | `panel-hands.png` | Recreate this close-up as a widescreen 16:9 image, 1920×1080: two hands resting in the grass close together, his coming in from the left, hers from the right, fingers relaxed and apart, a small white flower in the grass, his dark trousers at the left edge and her rust trousers at the right. |
| `c6-end.png` | `c6-start` | The same image, her hand has moved slightly toward his through the grass, a little closer, the fingers still apart. Nothing else changes. |
| `c6-mid.png` | `c6-end` | The same image, her hand halfway between where it rests in the first image and where it is now. Nothing else changes. |

## Order

1. `pencil.png`.
2. The first drawing of each close-up: `c4-end`, `c5-end`, `c6-start`.
3. Then `c4-start`, `c5-start`, `c6-end`.
4. Then the eyes (`c4-eyes`, `c5-eyes`).
5. Then the halfway drawings (`c4-mid`, `c5-mid`, `c6-mid`); `pencil-after` if you like.
6. Any time, if you like: `colour-extent`, `c2-leaves`.

A shot uses your drawings as soon as its start is in (`c4-start`, `c5-start`, `c6-start`): until
then it shows the sheet's panel as a stand-in. After that, until a drawing is made, the timeline
holds the one before it (a shot with only its start is that drawing, breathing). If an edit moves
the whole picture a little, that's fine: it's lined up here.
