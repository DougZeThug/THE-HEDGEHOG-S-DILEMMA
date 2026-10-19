# Five More Minutes: drawings for the shot list

Since your brief of 2026-10-18 the memory is six shots: the room remembers (1), crossing in (2),
the wide afternoon (3), the two of them close (4), the wide again (5), and the cut to the same
place empty at dusk (6). The engine draws all of it from the paintings and drawings already here.

The two of them close (shot 4) is one held frame of your character sheet's top panel (the two of
them lying side by side, their hands almost touching in the grass between them, exactly as you
drew them), shown at twice its size (the upscale you chose). In it:

- her eyes go to him first, and a moment later her head turns a little toward him and settles
  there: her own face from the panel, turned (`scripts/her-turn.py`);
- then his eyes go to her, and he stays there too: the shot cuts back to the wide with them still
  looking at each other, and they are still looking when it cuts to the empty clearing at dusk
  (you: "She should glance toward him, settle into that gaze, and simply remain there").

Her look is your drawing, turned. **His look is not**: there is no drawing of it, so his irises are
moved inside his eye openings (the lash line stays as drawn) and his head rolls about 2°. That is a
stand-in.

**Her turn** is made from the panel alone, nothing redrawn: a head is fitted under your painting of
her (her pose from points of her face; skull, face, nose, chin; her ear; her neck) and turned 14°
about her neck, on twos over a second, easing in and out as a head does; her hair on the grass
stays, the hair near her head follows a little, and her eyes, already on him, ease back in their
sockets as her head comes round. Your drawing of her turned further (`../drawings/b-look-full-b.webp`)
is no longer used: the turn you asked for is a slight one, and a drawing that turned her 70-90°
could only be reached by bending one picture into another, which read as morphing. If you would
like her turned more, or less, or sooner, say so: it is a number.

This replaces the earlier lists: the eleven close-up drawings (`c4-*`, `c5-*`, `c6-*`), the
three close-up panels and the two in-betweens of her turn (`b-look-full-mid1`, `-mid2`) are no
longer needed. Your shot list had him look first and her notice; the
order is now hers first, his last (the reasons are in `docs/reviews/2026-10-woodland.md`): tell
me if you want it the other way round.

## How

- Make each drawing as an **edit of the image named**, changing only what the prompt says, at its
  size. That keeps the grass, the clothes, the light and the line the same, which is what lets
  them cut together.
- Put the results in `references/woodland/drawings/` with the names below (or upload them). PNG,
  WebP or JPEG are all fine.
- **Check before keeping a take:** reject any take where the line weight, softness or colour
  shifts, or where something changed that the prompt didn't ask for (her takes `a` and `c`
  changed her whole head to change her mouth, so they aren't used).

Start every prompt with:

> Hand-painted anime illustration, soft watercolour and gouache texture, fine ink linework, warm
> late-afternoon light from the upper right with soft dappled leaf light, the same characters,
> face, hair and clothes as the reference.

Negative prompt for all: different face, different hairstyle, different clothes, extra fingers,
extra limbs, text, watermark, photo, 3D render, blur.

## Shot 4: the two of them close (from the character sheet, `../02-characters.webp`)

| File | Make it from | Prompt (after the line above) |
|---|---|---|
| `a-look-full.png` | `../02-characters.webp` | The same image; only the young man's eyes have moved: he is looking sideways to the right, toward her, out of the corners of his eyes. His head still faces up, his mouth exactly as it is. Nothing else changes, nothing on her. |

His drawing replaces the moved irises (laid in the way hers is, over his head only). Judge how his
look reads in the flipbook: if it reads sly rather than fond, a second edit can soften it.

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

## Sound (optional): two people breathing

There is no breathing in the memory now: a synthesised breath would be the one thing in it that
pretends to be a person. If you would like their breathing in it, a phone voice memo is enough
(lossless or WAV if your phone offers it):

- indoors at night, the fridge, heating and fans off; two people lying on their backs on a bed or
  a blanket; the phone flat between their heads, 25–35 cm from each nose;
- each person alone for 3 minutes, after a still first minute, mouth closed, not trying to be
  heard; then both side by side for 3 minutes, no talking, not matching on purpose;
- 30 seconds of the room with both of them still.

I would lay single breaths on the drawn breathing and send you the film with and without it.

## Order

1. `pencil.png`.
2. `a-look-full.png` (his look).
3. Any time, if you like: `pencil-after`, `colour-extent`, `c2-leaves`, the voice memo.
