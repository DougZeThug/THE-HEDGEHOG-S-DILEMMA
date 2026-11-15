import * as THREE from 'three';
import { UPRIGHT } from '../world/living/Immersion';
import { washInputs, washOf } from '../world/living/wash';
import type { Lifecycle } from '../memory/types';
import { HUSH_MAX } from './presentation';
import type { AppContext } from './context';
import type { EndReason, Living } from './living';

/** What a living memory's controller gives for one frame. */
export interface LivingFrame {
  t: number;
  state: Lifecycle;
  position: number;
  final: Record<string, number>;
}

/**
 * A living memory's frame: how far in (the carry, the settle), then its scene drawn for the
 * part of the painting on the screen. The window is placed first (its painting's place is
 * where the visitor is carried to). `end`: the visitor's turn away from it, which lets it go.
 */
export function drawLiving(ctx: AppContext, l: Living, f: LivingFrame, dt: number, end: (why: EndReason) => void): void {
  const pl = l.memory.prepared.living;
  // (How far it has played, for variants with no scene too: their seenAt is judged by it.)
  l.reached = Math.max(l.reached, f.position);
  if (!pl) {
    // (A living memory's revisit stays on the wall, as any memory, but lies under its writing as
    // the scene did. Every other memory keeps its words on bare plaster, legible: washInputs.)
    washUnderPainting(ctx, l, f.final);
    // Of what it would have told, a still tells only its going back into the wall (a film that
    // could not be had left a screen reader with its opening line alone: QA, 2026-10-22).
    const exit = l.memory.prepared.def.sections.exit;
    announceLater(ctx, l, f, (line) => line.at >= exit && !line.inside && line.shot === undefined);
    return;
  }
  const aspect = innerWidth / innerHeight;
  const upright = aspect < UPRIGHT;
  // The shot on now, chosen first so the view frames it from its first frame. A painted scene
  // (the rig) chooses its two-shot: only for someone taken all the way in, the wide while they are
  // turned from it, never upright (the reviews of 2026-10-17 and 18). A film cuts itself: it says
  // which shot is on the screen, by the frame being shown, and is framed for it.
  const shot = pl.scene.choose(f.final, { inside: ctx.inside.taken, turn: ctx.inside.turned, t: f.t, now: ctx.time, aspect });
  ctx.post.close = shot > 0 ? 1 : 0;
  // (A film's close shot is framed by its own focus, from its first frame to its last: a reframe on
  // its cut, never a move; upright, the face whose shot it is: src/memory/living/woodlandFilm.ts.
  // Upright, a film that moves its focus by its own clock says where: src/memory/living/drive.ts.)
  const close = shot > 0 ? pl.spec.close : undefined;
  const focus = close
    ? (upright ? close.upright : close.coverAt(aspect))
    : upright ? pl.spec.uprightAt?.(f.final['scene.film'] ?? 0, ctx.prefs.reducedMotion) ?? pl.spec.cover.upright : pl.spec.coverAt?.(aspect) ?? (aspect > 2.0 ? pl.spec.cover.ultra : pl.spec.cover.wide);
  const film = pl.kind === 'film' ? pl : null;
  const go = ctx.inside.step(dt, {
    immerse: f.final['scene.immerse'] ?? 0,
    focus,
    held: l.held,
    enter: pl.immerse,
    away: l.away,
    leavingNaturally: f.state === 'withdrawing' || f.state === 'residue',
    approach: 'scene.approach' in f.final ? f.final['scene.approach'] : undefined,
    torn: film?.torn,
    shade: film?.shade,
    scale: upright ? pl.spec.cover.uprightScale ?? 1 : 1,
  }, { reduced: ctx.prefs.reducedMotion, aspect, scene: pl.scene.target.texture, group: l.anchor.group });
  // The window was placed before the spread changed: place it again for this frame.
  ctx.memoryWindow.update(f.final, ctx.rig.restingEye, 0);
  // Inside the painting the white room's hum goes further down (it is not in the clearing), and
  // comes back as the painting goes back to the wall (the sound designer's review, 2026-10-18).
  const deep = ctx.inside.entered && (f.final['scene.immerse'] ?? 0) >= 0.9;
  if (deep !== l.deep && f.state !== 'residue' && f.state !== 'complete') {
    l.deep = deep;
    ctx.audio?.memoryHush(deep ? HUSH_MAX : l.memory.prepared.def.hush, deep ? 2.5 : 4.5);
  }
  washUnderPainting(ctx, l, f.final);
  // (Its dusk is dark: a sound's caption over it, while it fills the view, is light words, not a
  // pale pill; on the wall, in the white room, the pill.)
  ctx.captions.dim = ctx.inside.entered && (f.final['scene.immerse'] ?? 0) >= 0.6 && (f.final['scene.after'] ?? 0) >= 0.5;
  pl.scene.reduced = ctx.prefs.reducedMotion;
  // (The two-shot's frame is the screen's: a narrower one sees less of its width, a wider one less of its height.)
  // (A film let go early cuts to the frame its wall's pencil draws and holds it as it goes back:
  // src/memory/living/woodlandFilm.ts `leave`.)
  const leave = pl.spec.leave;
  if (leave && (f.state === 'withdrawing' || f.state === 'residue') && f.position < leave.before) l.leftEarly = true;
  const values = l.leftEarly && leave ? { ...f.final, 'scene.film': leave.to } : f.final;
  pl.scene.update(ctx.renderer, f.t, values, { view: ctx.inside.view, parallax: new THREE.Vector2(), aspect });
  // What changes later, told to a screen reader when it happens (not before: the cut is not given away).
  // (A close-up's line only while it is shown; what happens inside only to someone taken in;
  // the wall's own line only to someone it stayed on the wall for.)
  announceLater(ctx, l, f, (line) => (line.shot !== undefined ? shot === line.shot : line.inside ? ctx.inside.entered : line.wall ? !ctx.inside.entered : true));
  const coda = l.memory.prepared.def.coda;
  if (coda && dt > 0 && f.position >= coda.at) writeCoda(ctx, l);
  if (go) end('interrupt');
}

/** One of the lines a memory tells a screen reader as it goes. */
type Told = ReturnType<NonNullable<Living['memory']['prepared']['def']['announce']>>[number];

/**
 * What a memory tells a screen reader later, as the picture changes: each line once, as its time
 * comes (never while it is still emerging); `tells` chooses which of them are said at all.
 */
function announceLater(ctx: AppContext, l: Living, f: LivingFrame, tells: (line: Told) => boolean): void {
  const later = l.memory.prepared.def.announce?.(l.memory.prepared.variant) ?? [];
  while (l.told < later.length && f.position >= later[l.told].at && f.state !== 'emerging') {
    const line = later[l.told++];
    if (tells(line)) ctx.announce(line.text);
  }
}

/**
 * Its line where the painting was (decisions 119–123): once, while it plays on unbroken to there,
 * for someone taken all the way in; in the hand and size of its own line, under it, silently. A
 * line whose own place is beside it is kept off the walls for the rest of the visit (137). As its
 * position passes the line's moment, or, if no frame was drawn there (one long frame), as it ends.
 */
export function writeCoda(ctx: AppContext, l: Living): void {
  const coda = l.memory.prepared.def.coda;
  if (!coda || l.coda || l.held || coda.variant !== l.memory.prepared.variant || !ctx.inside.entered || !(l.why === null || l.why === 'complete') || ctx.mode !== 'room') return;
  l.coda = true;
  const own = ctx.text.items.get(l.key);
  const waiting = own ? ctx.text.writeWithin({ key: `coda:${l.id}`, text: coda.text, hand: own.hand, size: own.size, under: l.key, within: ctx.memoryWindow.painting,
    purpose: 'annotation', now: ctx.time, source: ctx.text.phraseOf(l.key) ?? undefined }) : null;
  if (waiting) {
    ctx.director.keepBack(waiting);
    ctx.announce(`Written on the wall where the painting was: ${coda.text}`);
  }
}

/**
 * The room's writing under a living memory's painting, its own line too (`washOf`: each piece
 * goes to a trace just ahead of the colour, and comes back with the pencil, or as the painting
 * goes if it is let go early; reviews of 2026-10-17 and 18). A revisit without its own scene (no
 * order map) has the colour everywhere at once, at the reveal's half way.
 */
export function washUnderPainting(ctx: AppContext, l: Living, final: Record<string, number>): void {
  const m = washInputs(l.memory.prepared.def, l.memory.prepared.living, final, l.memory.controller.weights.presence);
  if (!m) return;
  for (const it of ctx.text.items.values()) {
    const a = ctx.text.anchorOfKey(it.key);
    if (!a || a.group !== l.anchor.group) continue;
    const w = washOf(a, ctx.memoryWindow.rect, m.colourAt, m.reveal, m.presence, m.hold);
    if (w <= 0 && !l.washed.has(it.key)) continue;
    // (Its own line may be in the memory's light as well: the more washed of the two.)
    ctx.text.wash(it.key, it.key === ctx.memoryKey ? Math.max(w, ctx.lightWash) : w);
    l.washed.add(it.key);
  }
}
