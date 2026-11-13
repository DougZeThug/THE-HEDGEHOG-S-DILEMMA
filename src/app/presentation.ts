/**
 * How the room's presentation scales with the visitor's choices, and the one hint line. What each
 * `gentle` intensity does to each thing is a table here, not a number at each call site.
 */
import type { Prefs } from '../ui/prefs';
import { STREET_GENTLE } from '../world/StreetLight';
import { CLASS } from '../ui/dom';

/** What 'gentle' intensity multiplies each kind of effect by (1 at 'full'). */
const GENTLE = {
  /** The memory's light, a glow left behind, the chair's own light in a flinch. */
  light: 0.6,
  /** A silence's depth, the hush before a voice. */
  sound: 0.8,
  /** A flash of the room's light. */
  flash: 0.5,
  /** The audio engine's overall intensity. */
  audio: 0.5,
  /** The grade's response (Post.intensityScale). */
  post: 0.4,
  /** The streetlights passing across a memory's wall. */
  street: STREET_GENTLE,
  /** How far the room's light pulls back in a flinch. */
  flinchDim: 0.55,
  /** The room's glow in a flinch. */
  flinchGlow: 0.5,
} as const;

export type GentleKind = keyof typeof GENTLE;

/** At gentle intensity a held dim never takes the room's light below this fraction. */
const GENTLE_DIM_FLOOR = 0.5;

/** How far a dim takes the room's light: as asked, or (gentle) no further than the floor. */
export function gentleDim(intensity: Prefs['intensity'], to: number): number {
  return intensity === 'gentle' ? Math.max(to, GENTLE_DIM_FLOOR) : to;
}

/** The factor for an effect: its entry in the table when the visitor chose gentle, else 1. */
export function gentle(intensity: Prefs['intensity'], kind: GentleKind): number {
  return intensity === 'gentle' ? GENTLE[kind] : 1;
}

/** How long each of the hints stays on screen (ms). */
/** The most the room is ever hushed for a memory (-26 dB). */
export const HUSH_MAX = 0.95;

export const HINT_MS = { controls: 5500, walk: 5500, touch: 4500 } as const;

/** Put a line in the hint's place for `ms`, then take it away. */
export function flashHint(el: HTMLElement, text: string, ms: number): void {
  el.textContent = text;
  el.classList.add(CLASS.on);
  setTimeout(() => el.classList.remove(CLASS.on), ms);
}
