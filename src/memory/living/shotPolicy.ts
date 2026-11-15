import type { Values } from '../types';
import type { LivingSpec } from './woodland';
import { headFor, type LivingArt } from './woodlandArt';

/** When the woodland's scene frames the two-shot rather than the wide: the parts that read only the art and the spec. */

/** Her head's drawing for these values (the same in either shot: both atlases hold the same drawings). */
export function headCel(art: LivingArt, v: Values): number {
  const heads = art.near?.heads ?? art.heads;
  return heads ? headFor(v['figure:b.turn'] ?? 0, heads.at) : 0;
}

/** The two-shot's band for a screen's aspect (`near.frames`). */
export function bandFor(spec: LivingSpec, aspect: number): NonNullable<LivingSpec['near']>['frames'][number] {
  const fr = spec.near!.frames;
  return fr.find((b) => aspect <= b.upTo) ?? fr[fr.length - 1];
}

/** Whether the two-shot may come back at `t`: not near a beat, not in its last two seconds. */
export function mayReturn(spec: LivingSpec, t: number): boolean {
  const sp = spec.near;
  if (!sp) return false;
  if (t > sp.span[1] - 2) return false;
  return sp.beats.every((b) => Math.abs(t - b) >= 0.5);
}

/** Whether the two-shot could be had (with her look drawn in the wide too: every state in both shots). */
export function hasNear(art: LivingArt): boolean {
  return !!art.near && !!art.figures && !!art.heads;
}
