import { PHRASE_BY_ID } from '../content/phrases';
import { WALLS, type Hand, type Size, type Surface } from '../content/types';
import { hashString } from '../core/rng';
import { WALL_ROLE, isFlat, surfaceSize, type Placement, type Rect, type SurfaceLayout } from './layout';
import { measureText } from './textures';

/**
 * Where new writing goes: the policy that turns "write this beside that" or "near where they look"
 * into a free place on a wall. It only reads and adds to the layout; making the writing is WallText's.
 */

/** The small turn of a line that is written by hand, never quite level. */
const tilt = (key: string, amount: number) => (((hashString(key) % 100) / 100) - 0.5) * amount;

/** Writing made by a drawing: as close to it as the wall allows, under it, else beside it, in a smaller hand if that is what fits. */
export function placeByDrawing(layout: SurfaceLayout, d: Placement, o: { key: string; text: string; hand: Hand; size: Size }): { placement: Placement; size: Size } | null {
  for (const size of [o.size, 'xs'] as Size[]) {
    const mm = measureText(o.text, o.hand, size);
    const W = surfaceSize(d.surface).w;
    const regions: [[number, number], [number, number]][] = [
      [[d.u - d.w / 2 - 0.1, d.u - d.w / 2 + mm.w + 0.1], [d.v - d.h / 2 - mm.h - 0.25, d.v - d.h / 2 - 0.02]],
      [[d.u - d.w / 2 - mm.w - 0.2, d.u - d.w / 2 - 0.02], [d.v - d.h / 2 - 0.1, d.v + d.h / 2]],
      [[d.u + d.w / 2 + 0.02, d.u + d.w / 2 + mm.w + 0.2], [d.v - d.h / 2 - 0.1, d.v + d.h / 2]],
    ];
    for (const [ur, vr] of regions) {
      const rect = layout.findIn(d.surface, mm.w, mm.h, [Math.max(0, ur[0]) / W, Math.min(W, ur[1]) / W], [Math.max(0.3, vr[0]), vr[1]], 0.03, 120, true);
      if (rect) return { placement: layout.add({ surface: d.surface, ...rect, rot: tilt(o.key, 0.04) }), size };
    }
  }
  return null;
}

interface WriteSpot {
  key: string;
  text: string;
  hand: Hand;
  size: Size;
  surface?: Surface;
  near?: { u: number; v: number };
  purpose: string;
}

/** The ways a place is looked for, in order; the first that finds room wins. */
export function placeWrite(layout: SurfaceLayout, o: WriteSpot, target: Placement | undefined): { placement: Placement; size: Size } | null {
  const m = measureText(o.text, o.hand, o.size);
  const contribution = o.purpose === 'contribution';
  let rect: Rect | null = null;
  let surface: Surface | undefined = o.surface;
  if (target) {
    surface = target.surface;
    rect = layout.findBeside(target, m.w, m.h);
    // The heart's answer is beside the first line or not yet written: anywhere else on that wall it
    // reads as a line of its own, not an answer. (The room tries again as lines there fade.)
    if (!rect && o.key.startsWith('heart:')) return null;
  }
  const wall = !!surface && !isFlat(surface);
  if (!rect && surface && o.near && o.purpose === 'recall' && wall && o.key.startsWith('memory:')) {
    // A memory's line, offered where the visitor looks: at a height it can be read at, as near
    // their line of sight as the wall allows, or not at all (it is offered again elsewhere). The
    // whole-wall scan put it by the skirting, out of frame on a phone (QA, 2026-11-06). Close to
    // where they look it may go into the space kept behind the chair, as an answer may: from the
    // chair, facing the wall behind it, that is where they look, and the rest of the band is full.
    // Only that space: the band kept on the south wall is the visitors' own.
    const behindChair = surface === WALL_ROLE.behindChair;
    const size = surfaceSize(surface!);
    const near = o.near;
    const across = (spread: number): [number, number] => [Math.max(0, near.u - spread - m.w / 2) / size.w, Math.min(size.w, near.u + spread + m.w / 2) / size.w];
    const band = (spread: number, open: boolean) => layout.findIn(surface!, m.w, m.h, across(spread), [0.9, 1.85], 0.02, 160, open);
    for (const spread of [0.4, 0.9, 1.6, size.w]) {
      rect = band(spread, false) ?? (behindChair && spread <= 0.9 ? band(spread, true) : null);
      if (rect) break;
    }
    // (The tries are random: before it is given up, the band is gone over cell by cell, so a
    // narrow place they missed is still found.)
    rect ??= (behindChair ? layout.scanIn(surface!, m.w, m.h, across(0.9), [0.9, 1.85], 0.02, near, true) : null) ?? layout.scanIn(surface!, m.w, m.h, [0, 1], [0.9, 1.85], 0.02, near, false);
    if (!rect) return null;
  }
  if (!rect && surface && o.near) {
    const size = surfaceSize(surface);
    for (const spread of [0.5, 1, 1.8]) {
      rect = layout.findIn(surface, m.w, m.h, [(o.near.u - spread - m.w / 2) / size.w, (o.near.u + spread + m.w / 2) / size.w], [Math.max(0.3, o.near.v - spread * 0.5 - m.h / 2), Math.min(size.h - 0.15, o.near.v + spread * 0.5 + m.h / 2)], 0.03, 120, contribution);
      if (rect) break;
    }
  }
  if (!rect && target) rect = layout.scan(target.surface, m.w, m.h, 0.02);
  if (!rect && surface) {
    const size = surfaceSize(surface);
    if (contribution && surface === WALL_ROLE.contribution)
      rect = layout.findIn(surface, m.w, m.h, [0.3, 0.7], [1.0, 1.95], 0.05, 120, true) ?? layout.findIn(surface, m.w, m.h, [0.08, 0.92], [0.6, 2.4], 0.03, 120, true);
    else rect = layout.findIn(surface, m.w, m.h, [0.05, 0.95], [0.9, Math.min(2.3, size.h - 0.2)], 0.03, 120);
  }
  if (!rect && surface) rect = layout.scan(surface, m.w, m.h, 0.02, contribution);
  // A visitor's words are always written: try the other walls, then the band kept for them.
  let size = o.size;
  if (!rect && contribution) {
    for (const s of [WALL_ROLE.contribution, ...WALLS.filter((w) => w !== WALL_ROLE.contribution)]) {
      if (s === surface) continue;
      rect = layout.scan(s, m.w, m.h, 0.02, true);
      if (rect) {
        surface = s;
        break;
      }
    }
    if (!rect && size !== 'xs') {
      size = 'xs';
      const mx = measureText(o.text, o.hand, 'xs');
      surface = WALL_ROLE.contribution;
      rect = layout.scan(surface, mx.w, mx.h, 0, true);
    }
  }
  if (!rect || !surface) return null;
  return { placement: layout.add({ surface, ...rect, rot: tilt(o.key, 0.06) }), size };
}

/** What `placeWithin` needs to know of a piece of writing already made. */
interface Made {
  key: string;
  placement: Placement;
  vis: number;
  target: number;
}

/**
 * A place for a line under another, inside a place on its wall (`within`, in the writing group's
 * metres, as the memory window gives a painting's place): just under it and close, clear of what is
 * already written there (decisions 122, 133, 136 and 137). The places kept for lines not yet shown
 * give way, and are found again elsewhere on their wall; a line with its own place close by
 * waits, as does one with no room left on its wall. The ids of the lines that wait (the room keeps
 * them off the walls from then on), or null, and nothing placed, if nothing fits.
 */
export function placeWithin(
  ctx: { layout: SurfaceLayout; placements: Map<string, Placement>; items: ReadonlyMap<string, Made>; scale: number },
  o: { key: string; text: string; hand: Hand; size: Size; under: string; within: { cx: number; cy: number; w: number; h: number } },
): { placement: Placement; waiting: string[] } | null {
  const { layout, placements, items } = ctx;
  const anchor = items.get(o.under)?.placement;
  if (!anchor || isFlat(anchor.surface)) return null;
  const size = surfaceSize(anchor.surface), s = ctx.scale;
  const within = { u: o.within.cx / s + size.w / 2, v: o.within.cy + size.h / 2, w: o.within.w / s, h: o.within.h };
  const m = measureText(o.text, o.hand, o.size);
  // (A line not yet on any wall keeps a place: one with no place of its own can go elsewhere, one
  // with its own place can only wait, as can one made ahead (the opening's) and not yet written.)
  const slots = new Map<Placement, string>(), own = new Map<Placement, string>();
  for (const [id, pl] of placements) {
    const made = items.get(id);
    if (!made) (PHRASE_BY_ID.get(id)?.at ? own : slots).set(pl, id);
    else if (made.placement === pl && made.vis <= 0.05 && made.target <= 0) own.set(pl, id);
  }
  // (What is already written on that wall, drawings too, its own line aside.)
  const written = [...items.values()].filter((it) => it.key !== o.under && it.placement.surface === anchor.surface && (it.vis > 0.05 || it.target > 0)).map((it) => it.placement);
  const found = layout.findUnder(anchor, m.w, m.h, within, (p) => slots.has(p), written, (p) => own.has(p));
  if (!found) return null;
  for (const p of found.displaced) layout.remove(p);
  const placement = layout.add({ surface: anchor.surface, ...found.rect, rot: tilt(o.key, 0.04) });
  // (Kept clear for the rest of the visit: nothing placed after it, those lines included, comes
  // within 20 cm.)
  layout.add({ surface: anchor.surface, u: placement.u, v: placement.v, w: placement.w + 0.4, h: placement.h + 0.4, rot: 0 });
  // (A line moved has no place of its own: it goes elsewhere on its wall, or, with no room left
  // there, waits with the others rather than go to another wall: QA, 2026-10-20.)
  const waiting = found.waiting.map((p) => own.get(p)!);
  for (const p of found.displaced) {
    const id = slots.get(p)!;
    const moved = layout.placeOn(PHRASE_BY_ID.get(id)!, (q) => measureText(q.text, q.hand, q.size));
    if (moved) placements.set(id, moved);
    else {
      placements.delete(id);
      waiting.push(id);
    }
  }
  return { placement, waiting };
}
