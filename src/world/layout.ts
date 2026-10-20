import type { DrawingDef } from '../content/drawings';
import type { Phrase, Surface } from '../content/types';
import { Rng, hashString } from '../core/rng';

/** The room as built (metres). The chair stands at the origin. */
// 3.6 m high: a taller box than a house's room (the artist's reference is this proportion).
export const ROOM = { halfW: 3.2, halfD: 3.2, height: 3.6 };

export interface SurfaceSize {
  /** Extent along u (metres). */
  w: number;
  /** Extent along v (metres). */
  h: number;
}

export function surfaceSize(s: Surface): SurfaceSize {
  if (s === 'north' || s === 'south') return { w: ROOM.halfW * 2, h: ROOM.height };
  if (s === 'east' || s === 'west') return { w: ROOM.halfD * 2, h: ROOM.height };
  return { w: ROOM.halfW * 2, h: ROOM.halfD * 2 };
}

/**
 * World position (metres, chair at the origin, room at scale 1) of a layout point.
 * Mirrors Room.world() so the engine can reason about where writing is without a renderer.
 */
export function layoutToWorld(surface: Surface, u: number, v: number): { x: number; y: number; z: number } {
  const { halfW, halfD, height } = ROOM;
  switch (surface) {
    case 'north':
      return { x: -halfW + u, y: v, z: -halfD };
    case 'south':
      return { x: halfW - u, y: v, z: halfD };
    case 'east':
      return { x: halfW, y: v, z: -halfD + u };
    case 'west':
      return { x: -halfW, y: v, z: halfD - u };
    case 'floor':
      return { x: -halfW + u, y: 0, z: -halfD + v };
    case 'ceiling':
      return { x: -halfW + u, y: height, z: -halfD + v };
  }
}

export interface Rect {
  /** Centre along u, metres from the surface's left edge (as seen from inside). */
  u: number;
  /** Centre height (walls) or depth (floor/ceiling), metres. */
  v: number;
  w: number;
  h: number;
}

export interface Placement extends Rect {
  surface: Surface;
  /** Small in-plane rotation (radians) — handwriting is never quite level. */
  rot: number;
}

/** Authored compositional regions (fractions of u, metres of v). */
interface Cluster {
  name: string;
  u: [number, number];
  v: [number, number];
}

const CLUSTERS: Record<Surface, Cluster[]> = {
  north: [
    { name: 'left', u: [0.03, 0.4], v: [0.7, 2.8] },
    { name: 'right', u: [0.6, 0.97], v: [0.5, 2.6] },
    { name: 'top', u: [0.3, 0.72], v: [2.25, 2.95] },
    { name: 'low', u: [0.34, 0.66], v: [0.25, 0.95] },
  ],
  east: [
    { name: 'mid', u: [0.05, 0.95], v: [0.95, 2.25] },
    { name: 'high', u: [0.12, 0.88], v: [2.25, 2.9] },
    { name: 'low', u: [0.08, 0.92], v: [0.3, 0.95] },
  ],
  west: [
    { name: 'dense', u: [0.08, 0.92], v: [0.7, 2.75] },
    { name: 'low', u: [0.05, 0.55], v: [0.25, 0.7] },
  ],
  south: [
    { name: 'sparse', u: [0.06, 0.94], v: [0.5, 2.5] },
  ],
  floor: [{ name: 'near', u: [0.4, 0.6], v: [2.5, 3.9] }],
  ceiling: [{ name: 'centre', u: [0.3, 0.7], v: [2.2, 4.2] }],
};

/**
 * Regions kept deliberately empty: the column of wall directly behind the chair, and
 * the band of the south wall where visitors' own words will be written.
 */
export const RESERVED: Partial<Record<Surface, Rect[]>> = {
  north: [{ u: ROOM.halfW, v: 1.55, w: 1.1, h: 1.2 }],
  south: [{ u: ROOM.halfW, v: 1.45, w: 2.2, h: 0.9 }],
  // The skylight's opening (Room.PANEL), with a margin: nothing is written into the light.
  ceiling: [{ u: ROOM.halfW + 0.1, v: ROOM.halfD - 0.95, w: 1.6, h: 1.6 }],
};

function chooseCluster(p: Phrase): string {
  const d = p.dims;
  switch (p.surface) {
    case 'north':
      if (p.size === 'xs' || p.tier === 'near') return 'low';
      if (p.kind === 'question' && p.size !== 'm') return 'top';
      return (d.fear ?? 0) + (d.isolation ?? 0) > (d.desire ?? 0) + (d.affection ?? 0) + (d.connection ?? 0) ? 'right' : 'left';
    case 'east':
      if (p.size === 'xs' || p.tier === 'still') return 'low';
      if (p.kind === 'word') return 'high';
      return 'mid';
    case 'west':
      return p.size === 'xs' && p.tier !== 'arrival' ? 'low' : 'dense';
    default:
      return CLUSTERS[p.surface][0].name;
  }
}

export function overlaps(a: Rect, b: Rect, pad = 0.05): boolean {
  return Math.abs(a.u - b.u) * 2 < a.w + b.w + pad * 2 && Math.abs(a.v - b.v) * 2 < a.h + b.h + pad * 2;
}

export type Measure = (p: Phrase) => { w: number; h: number };

export class SurfaceLayout {
  readonly placed = new Map<Surface, Placement[]>();
  constructor(private rng: Rng) {
    for (const s of Object.keys(CLUSTERS) as Surface[]) this.placed.set(s, []);
  }

  private free(surface: Surface, r: Rect, pad: number, ignoreReserved = false): boolean {
    const size = surfaceSize(surface);
    if (r.u - r.w / 2 < 0.05 || r.u + r.w / 2 > size.w - 0.05) return false;
    if (r.v - r.h / 2 < 0.12 || r.v + r.h / 2 > size.h - 0.08) return false;
    for (const q of this.placed.get(surface)!) if (overlaps(r, q, pad)) return false;
    if (!ignoreReserved) for (const q of RESERVED[surface] ?? []) if (overlaps(r, q, 0)) return false;
    // Keep floor writing clear of the chair's footprint.
    if (surface === 'floor' && overlaps(r, { u: ROOM.halfW, v: ROOM.halfD, w: 0.5, h: 0.5 }, 0.02)) return false;
    return true;
  }

  add(p: Placement): Placement {
    this.placed.get(p.surface)!.push(p);
    return p;
  }

  remove(p: Placement): void {
    const arr = this.placed.get(p.surface)!;
    const i = arr.indexOf(p);
    if (i >= 0) arr.splice(i, 1);
  }

  /** Find a free spot in a region; returns null if the region is full. */
  findIn(surface: Surface, w: number, h: number, uRange: [number, number], vRange: [number, number], pad: number, tries = 90, ignoreReserved = false): Rect | null {
    const size = surfaceSize(surface);
    const u0 = uRange[0] * size.w + w / 2;
    const u1 = uRange[1] * size.w - w / 2;
    const v0 = vRange[0] + h / 2;
    const v1 = vRange[1] - h / 2;
    for (let i = 0; i < tries; i++) {
      const r = { u: u1 > u0 ? this.rng.range(u0, u1) : (u0 + u1) / 2, v: v1 > v0 ? this.rng.range(v0, v1) : (v0 + v1) / 2, w, h };
      if (this.free(surface, r, pad, ignoreReserved)) return r;
    }
    return null;
  }

  /** Exhaustive scan for any free spot, nearest the middle band of the surface first. */
  scan(surface: Surface, w: number, h: number, pad: number, ignoreReserved = false): Rect | null {
    const size = surfaceSize(surface);
    const step = 0.05;
    const cands: Rect[] = [];
    for (let v = h / 2 + 0.13; v <= size.h - h / 2 - 0.08; v += step)
      for (let u = w / 2 + 0.06; u <= size.w - w / 2 - 0.06; u += step) cands.push({ u, v, w, h });
    const mid = surface === 'floor' || surface === 'ceiling' ? size.h / 2 : 1.5;
    cands.sort((a, b) => Math.abs(a.v - mid) - Math.abs(b.v - mid) + (this.rng.next() - 0.5) * 0.4);
    for (const r of cands) if (this.free(surface, r, pad, ignoreReserved)) return r;
    return null;
  }

  /**
   * Spot beside an existing placement: first the natural places (just below, to the
   * right, to the left, above), then widening rings around it. Writing that answers a
   * phrase may go into the space kept empty behind the chair — but never far away.
   */
  findBeside(target: Placement, w: number, h: number): Rect | null {
    const g = 0.04;
    const natural: Rect[] = [
      { u: target.u - target.w / 2 + w / 2 + target.w * 0.08, v: target.v - target.h / 2 - h / 2 - g, w, h },
      { u: target.u + target.w * 0.15, v: target.v - target.h / 2 - h / 2 - g, w, h },
      { u: target.u + target.w / 2 + w / 2 + g * 2, v: target.v - target.h * 0.2, w, h },
      { u: target.u - target.w / 2 - w / 2 - g * 2, v: target.v + target.h * 0.1, w, h },
      { u: target.u, v: target.v + target.h / 2 + h / 2 + g, w, h },
    ];
    for (const r of natural) if (this.free(target.surface, r, 0.015, true)) return r;
    const rings: Rect[] = [];
    for (let rad = 0.1; rad <= 1.2; rad += 0.08)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        rings.push({ u: target.u + Math.cos(a) * (target.w / 2 + w / 2 + rad) * 0.9, v: target.v + Math.sin(a) * (target.h / 2 + h / 2 + rad * 0.5), w, h });
      }
    for (const r of rings) if (this.free(target.surface, r, 0.015, true)) return r;
    return null;
  }

  /**
   * A place for a line written under another, inside a region of its wall (decisions 122 and 133:
   * the line where the woodland's painting was, `within` its former place): just under `anchor` and
   * close to it, as a hand writes the next line under its own (its top 2–15 cm under the anchor's
   * foot, overlapping at least half the narrower of the two), nearest first to just under its start,
   * a little in; never above it or beside it. It keeps `clearance` (20 cm) from all writing, so it is
   * never read as another line's answer, nor run on into one: from the writing in `clear` (what is
   * already on the wall), and from every place on the wall, unless `movable` says that place can go
   * elsewhere (a line not yet shown; those come back in `displaced`, to be placed again) or `waits`
   * says its line can wait (a line's own place, not yet written: only overlapping it stops it; those
   * within 20 cm come back in `waiting`, their lines to be kept off the wall from then on, decision
   * 137). Null if nothing fits: then nothing is written.
   */
  findUnder(anchor: Placement, w: number, h: number, within: Rect, movable: (p: Placement) => boolean, clear: readonly Rect[] = [], waits: (p: Placement) => boolean = () => false, clearance = 0.2): { rect: Rect; displaced: Placement[]; waiting: Placement[] } | null {
    const size = surfaceSize(anchor.surface);
    const foot = anchor.v - anchor.h / 2;
    const iu = anchor.u - anchor.w / 2 + w / 2 + anchor.w * 0.08, iv = foot - h / 2 - 0.04;
    const need = 0.5 * Math.min(w, anchor.w);
    const cands: Rect[] = [];
    for (let gap = 0.02; gap <= 0.15 + 1e-9; gap += 0.01)
      for (let u = anchor.u - anchor.w / 2 - w / 2 + need; u <= anchor.u + anchor.w / 2 + w / 2 - need + 1e-9; u += 0.02) {
        const r = { u, v: foot - gap - h / 2, w, h };
        const onWall = r.u - w / 2 >= 0.05 && r.u + w / 2 <= size.w - 0.05 && r.v - h / 2 >= 0.12;
        const inPlace = r.u - w / 2 >= within.u - within.w / 2 && r.u + w / 2 <= within.u + within.w / 2 && r.v - h / 2 >= within.v - within.h / 2 && r.v + h / 2 <= within.v + within.h / 2;
        if (onWall && inPlace) cands.push(r);
      }
    cands.sort((a, b) => Math.hypot(a.u - iu, a.v - iv) - Math.hypot(b.u - iu, b.v - iv));
    const placed = this.placed.get(anchor.surface)!;
    for (const r of cands) {
      if (clear.some((q) => overlaps(r, q, clearance))) continue;
      const near = placed.filter((q) => q !== anchor && overlaps(r, q, clearance));
      const displaced = near.filter(movable), waiting = near.filter((q) => !movable(q));
      if (waiting.every((q) => waits(q) && !overlaps(r, q, 0.015))) return { rect: r, displaced, waiting };
    }
    return null;
  }

  place(p: Phrase, measure: Measure): Placement {
    const mine = this.placeOn(p, measure);
    if (mine) return mine;
    const { w, h } = measure(p);
    const size = surfaceSize(p.surface);
    const rot = p.hand === 'typed' ? 0 : ((hashString(p.id) % 1000) / 1000 - 0.5) * 0.05;
    // The wall is full: the writing goes onto another wall rather than over other writing.
    for (const other of ['south', 'west', 'north', 'east'] as Surface[]) {
      if (other === p.surface) continue;
      const o = this.scan(other, w, h, 0.02);
      if (o) return this.add({ surface: other, ...o, rot });
    }
    return this.add({ surface: p.surface, u: size.w / 2, v: 1.6, w, h, rot });
  }

  /** A place for `p` on its own wall (its own place, if it has one), or null if there's no room. */
  placeOn(p: Phrase, measure: Measure): Placement | null {
    const { w, h } = measure(p);
    const size = surfaceSize(p.surface);
    const rot = p.hand === 'typed' ? 0 : ((hashString(p.id) % 1000) / 1000 - 0.5) * 0.05;
    if (p.at) {
      return this.add({ surface: p.surface, u: p.at[0] * size.w, v: p.surface === 'floor' || p.surface === 'ceiling' ? p.at[1] * size.h : p.at[1], w, h, rot });
    }
    const cname = chooseCluster(p);
    const clusters = CLUSTERS[p.surface];
    const c = clusters.find((x) => x.name === cname) ?? clusters[0];
    const r =
      this.findIn(p.surface, w, h, c.u, c.v, 0.07) ??
      this.findIn(p.surface, w, h, c.u, c.v, 0.02) ??
      this.findIn(p.surface, w, h, [0.02, 0.98], [0.2, size.h - 0.1], 0.02, 200) ??
      this.scan(p.surface, w, h, 0.02) ??
      this.scan(p.surface, w, h, 0);
    return r ? this.add({ surface: p.surface, ...r, rot }) : null;
  }
}

/**
 * Lay out every placeable phrase deterministically. Large writing first so it gets the best
 * room. `reserve`d places (the drawings already on the walls) are kept clear of writing.
 */
export function layoutPhrases(phrases: readonly Phrase[], measure: Measure, seed: number, reserve: readonly Placement[] = []): Map<string, Placement> {
  const layout = new SurfaceLayout(new Rng(seed));
  for (const r of reserve) layout.add(r);
  const out = new Map<string, Placement>();
  const order = phrases
    .filter((p) => p.tier !== 'annotation')
    .sort((a, b) => (b.at ? 1 : 0) - (a.at ? 1 : 0) || measure(b).w * measure(b).h - measure(a).w * measure(a).h || (a.id < b.id ? -1 : 1));
  for (const p of order) out.set(p.id, layout.place(p, measure));
  (out as Map<string, Placement> & { layout?: SurfaceLayout }).layout = layout;
  return out;
}

export function layoutOf(m: Map<string, Placement>): SurfaceLayout {
  return (m as Map<string, Placement> & { layout: SurfaceLayout }).layout;
}

/**
 * Where each drawing goes: its authored spot (reserved before any writing is laid out, so
 * nothing is ever written over it), or beside a line, wherever there is room once the
 * writing has its places.
 */
export function drawingSpots(defs: readonly DrawingDef[]): Placement[] {
  // With a margin: a line can run a centimetre or so past where it was meant to stop.
  return defs.filter((d) => d.at).map((d) => ({ surface: d.surface, u: d.at![0], v: d.at![1], w: d.size[0] + 0.03, h: d.size[1] + 0.03, rot: 0 }));
}

export function drawingBeside(layout: SurfaceLayout, def: DrawingDef, target: Placement | undefined): Placement | null {
  if (!target || target.surface !== def.surface) return null;
  const r = layout.findBeside(target, def.size[0] + 0.03, def.size[1] + 0.03);
  if (!r) return null;
  const p: Placement = { surface: def.surface, u: r.u, v: r.v, w: def.size[0], h: def.size[1], rot: 0 };
  layout.add(p);
  return p;
}
