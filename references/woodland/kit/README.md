# Five More Minutes: drawings for the shot list

The memory is now eight shots (the artist's shot list, 2026-10-17). The wide shots (3, 7, 8) and
the way in (1, 2) are drawn by the engine from the paintings already here. What it can't draw
well is people acting up close. Those three close-ups (shots 4, 5, 6) are made from key drawings
in your image tool. The engine in-betweens them, adds breath, wind and a slow camera drift, and
plays them as drawn animation.

This replaces the earlier list (the reach, the foot, the breathing, the looks on the wide
drawing): none of those is needed now.

## How

- Make each close-up as a **widescreen 1920×1080** image.
- For each shot, make the **base** first (from the sheet's own close-up panel, in this folder),
  then make every other drawing of that shot as an **edit of that base**, changing only what the
  prompt says. That keeps the grass, the clothes and the light identical from drawing to drawing,
  which is what lets them be animated.
- Put the results in `references/woodland/drawings/` with the names below (or upload them).

Start every prompt with:

> Hand-painted anime illustration, soft watercolour and gouache texture, fine ink linework, warm
> late-afternoon light from the upper right with soft dappled leaf light, the same characters,
> face, hair and clothes as the reference.

Negative prompt for all: different face, different hairstyle, different clothes, extra fingers,
extra limbs, text, watermark, photo, 3D render, blur.

## Shot 4: he looks toward her (base: `panel-him.png`)

| File | Prompt (after the line above) |
|---|---|
| `c4-end.png` | Recreate this close-up as a widescreen 16:9 image, 1920×1080: the young man lying on his back in the grass, one arm folded behind his head, his face turned toward the right of the frame, looking at someone just out of frame. His head in the left half of the frame, not cropped; extend the grass and clover naturally to fill the frame. |
| `c4-start.png` | (edit of c4-end) The same image, but he is looking straight up at the sky: face turned up, chin slightly raised, eyes looking upward. Nothing else changes. |
| `c4-eyes.png` | (edit of c4-start) The same image, only his eyes have moved, looking sideways to the right toward her. His head still faces up. Nothing else changes. |
| `c4-blink.png` | (edit of c4-start) The same image, his eyes gently closed. Nothing else changes. |

## Shot 5: she notices (base: `panel-her.png`)

| File | Prompt |
|---|---|
| `c5-end.png` | Recreate this close-up as a widescreen 16:9 image, 1920×1080: the young woman lying on her back in the grass, her hair spread over the grass, her face turned a little toward the left of the frame, looking at someone just out of frame. Calm; no smile needed. Her head in the right half of the frame, not cropped; extend the grass naturally. |
| `c5-start.png` | (edit of c5-end) The same image, but she is looking straight up at the sky: face turned up, eyes looking upward. Nothing else changes. |
| `c5-eyes.png` | (edit of c5-start) The same image, only her eyes have moved, looking sideways to the left toward him. Her head still faces up. Nothing else changes. |
| `c5-blink.png` | (edit of c5-start) The same image, her eyes gently closed. Nothing else changes. |

## Shot 6: almost touching (base: `panel-hands.png`)

| File | Prompt |
|---|---|
| `c6-start.png` | Recreate this close-up as a widescreen 16:9 image, 1920×1080: two hands resting in the grass close together, his coming in from the left, hers from the right, fingers relaxed and apart, a small white flower in the grass, his dark trousers at the left edge and her rust trousers at the right. |
| `c6-end.png` | (edit of c6-start) The same image, her hand has moved slightly toward his through the grass, a little closer, the fingers still apart. Nothing else changes. |

## Shot 1: the pencil on the wall (base: `../drawings/base-scene.png`)

| File | Prompt |
|---|---|
| `pencil.png` | Turn this painting into a loose graphite pencil underdrawing on white paper: exactly the same composition, light searching lines for the tree trunks, branches and leaves, the grasses, the log, the two people outlined; no colour; only a few hatched strokes of shading. Keep every element in exactly the same place, same size (1672×941). |
| `wash.png` (optional) | The same composition as an early watercolour stage over that pencil drawing: soft washes of colour blocked in, no detail yet, paper showing through, everything in exactly the same place. |

Most important first: the three bases (`c4-end`, `c5-end`, `c6-start`), then the starts, then
the rest. If an edit moves the whole picture a little, that's fine: it's lined up here.
