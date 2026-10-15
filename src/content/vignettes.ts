/**
 * Vignettes: small remembered fragments, mostly heard rather than seen (docs/vignettes.md;
 * decisions in docs/reviews/2026-10-weight-of-absence.md). One or two voices, the pauses between
 * them, sometimes only a sound or a light, and what the room keeps afterwards.
 *
 * They are memories like the living ones (src/content/memories.ts): opened by a line on the wall
 * (or by sitting still by the chair), one at a time, through the same MemoryDirector. Only what
 * they are is here: their lines, their scores (when each thing happens), the variants a returning
 * or differently-behaving visitor meets, and the echoes that come back later in a visit.
 *
 * Pure data and pure functions, read by the Director, the App, the recording scripts and the
 * audition sheet. The texts live in vignettes.json and nowhere else.
 */
import DATA from './vignettes.json';
import type { Phase, Surface } from './types';
import type { AnyPlace, Cue, CueSheet, SpotPlace } from '../memory/cueSheet';
import type { Marker } from '../memory/types';

export type Tone = 'sad' | 'bittersweet' | 'warm';

/** Who speaks, and with which voice (a key of the recording direction's voices). */
export interface Speaker {
  voice: string;
  who: string;
}

export interface VLine {
  id: string;
  speaker: string;
  /** Exactly what is said, and what the caption shows. */
  text: string;
  /** The line is an existing wall phrase: its approved readings can be used. */
  phraseId?: string;
}

/**
 * How a gap differs from another (the brief: a pause, an interruption and a deliberate silence
 * are not the same thing):
 * - `pause`: the conversation goes on afterwards; nothing changes in the room.
 * - `interrupt`: something stops (a line cut off); the room's tone doesn't fill the hole.
 * - `silence`: chosen; the memory's own air falls away too, so the white room is what is left.
 * - `wait`: someone waits for an answer that doesn't come.
 */
export type GapKind = 'pause' | 'interrupt' | 'silence' | 'wait';

/** What the room does (src/App.ts `vignetteEffect`); never a figure, never a cutscene. */
export type Effect =
  /** Afternoon light across the line's wall (MemoryLight), slow to come and slower to go. */
  | { kind: 'sun'; attack: number; hold: number; release: number; strength?: number }
  /** The white room's own light goes down toward the chair, and comes back. */
  | { kind: 'dim'; to: number; seconds: number }
  /** One word of a line on the wall goes, as if rubbed out (and may come back). */
  | { kind: 'loseWord'; phraseId: string; word: string; seconds: number }
  /** A line becomes harder to read the closer the visitor comes. */
  | { kind: 'recede'; phraseId: string; amount: number; seconds: number };

export type ScoreEvent =
  | {
      at: number;
      line: string;
      place: SpotPlace;
      gainDb?: number;
      /** How the line ends: said through, cut off (`stopAfter` s into the file), or trailing away. */
      end?: 'complete' | 'cut' | 'trail';
      stopAfter?: number;
      lowpass?: number;
      highpass?: number;
      dry?: boolean;
      /** Which reading (an index into the line's approved takes). */
      take?: number;
    }
  | { at: number; sfx: string; asset: string; take?: number; place: SpotPlace; gainDb: number; lowpass?: number; caption?: string; stopAfter?: number }
  | { at: number; bed: string; asset: string; take?: number; gainDb: number; place?: SpotPlace; fadeIn?: number; fadeOut?: number; lowpass?: number; caption?: string }
  | { at: number; fx: Effect }
  | { at: number; gap: GapKind; seconds: number; caption?: string };

export interface Score {
  /** Seconds from the first sound to the last thing the vignette does. */
  span: number;
  events: ScoreEvent[];
}

export interface VariantContext {
  /** Times seen on earlier visits (persisted). */
  seen: number;
  visits: number;
  field: Record<string, number>;
  motifs: string[];
  /** The visitor stepped back from something within the last minute. */
  withdrew: boolean;
}

export interface VariantRule {
  when: {
    seen?: [number, number];
    visits?: [number, number];
    motif?: string;
    notMotif?: string;
    field?: Record<string, [number, number]>;
    withdrew?: boolean;
  };
  variant: string;
}

/** Something that comes back later in the same visit, once the vignette has been heard. */
export interface Echo {
  id: string;
  /** Seconds after the vignette ended: the earliest and the latest it may come. */
  after: [number, number];
  when?: { notFacing?: boolean; nearChair?: boolean; facing?: Surface };
  /** Written on a wall (in another hand, faint), or heard (a line, or a sound). */
  write?: { text: string; hand: 'faint' | 'pencil' | 'pen'; size: 'xs' | 's'; beside?: string; otherWall?: boolean; strike?: boolean };
  voice?: { line: string; place: 'chair' | 'beyond' | 'behind'; stopAfter?: number; caption?: string; asLaugh?: boolean };
}

export interface Anchor {
  /** The wall line that opens it. */
  phrase?: string;
  /** Or: a drawing on the wall that means that line (looking at it reads it). */
  drawing?: string;
  /** Or: being still by the chair (or kneeling there). */
  chair?: { within: number; still: number };
}

export interface VignetteDef {
  id: string;
  title: string;
  tone: Tone;
  /** In one sentence, what it is for (the catalogue, the review). */
  intent: string;
  speakers: Record<string, Speaker>;
  anchor: Anchor;
  /** Engine seconds from the hand-off. */
  earliest: number;
  arm: number;
  commit: number;
  lookBack: boolean;
  phases?: Phase[];
  /** Shares a place with another memory: the kitchen (cereal, kitchen-light). */
  group?: 'kitchen';
  /** Only once another memory has been seen (on any visit). */
  requires?: { seen: string };
  /** Only once this unfinished line has been finished (the chair's vignette waits for "stay"). */
  afterFinished?: string;
  /**
   * Its line is offered (written alone where the visitor looks, the room holding still), as the
   * bedroom's and the door's are, if it hasn't been met by then: for lines the room rarely writes.
   * At most two offers a visit, of any memory.
   */
  offer?: { phases: Phase[]; apart: number };
  /** The memory's own small room: [seconds, decay, wet]. */
  room: [number, number, number];
  /** How far the room's own sound goes down while it plays. */
  hush: number;
  /** Heard past this far (seconds): counts as seen. */
  seenAt?: number;
  lines: VLine[];
  variants: Record<string, Score>;
  /** First match wins; otherwise `first` (never seen) or `again`. */
  rules: VariantRule[];
  echoes?: Echo[];
  /** For a screen reader: what is happening, without the words (those are captioned). */
  describe: string;
}

export const VIGNETTES: VignetteDef[] = (DATA as unknown as { vignettes: VignetteDef[] }).vignettes;
export const VIGNETTE_BY_ID = new Map(VIGNETTES.map((v) => [v.id, v]));

/** The manifest key of a line's recordings. */
export function lineKey(v: VignetteDef, line: VLine): string {
  return line.phraseId ? `phrase:${line.phraseId}` : `vig:${v.id}:${line.id}`;
}

function inRange(x: number, r?: [number, number]) {
  return !r || (x >= r[0] && x <= r[1]);
}

/** Which version a visitor meets: deterministic (no chance), from what they have done. */
export function chooseVariant(def: VignetteDef, ctx: VariantContext): string {
  for (const r of def.rules) {
    const w = r.when;
    if (!inRange(ctx.seen, w.seen) || !inRange(ctx.visits, w.visits)) continue;
    if (w.motif && !ctx.motifs.includes(w.motif)) continue;
    if (w.notMotif && ctx.motifs.includes(w.notMotif)) continue;
    if (w.withdrew !== undefined && w.withdrew !== ctx.withdrew) continue;
    if (w.field && !Object.entries(w.field).every(([k, rg]) => inRange(ctx.field[k] ?? 0, rg))) continue;
    if (def.variants[r.variant]) return r.variant;
  }
  if (ctx.seen > 0 && def.variants.again) return 'again';
  return 'first';
}

/** The lines a variant speaks (none: it can play before anything is recorded). */
export function spokenLines(def: VignetteDef, variant: string): VLine[] {
  const ids = new Set((def.variants[variant]?.events ?? []).flatMap((e) => ('line' in e ? [e.line] : [])));
  return def.lines.filter((l) => ids.has(l.id));
}

/** Score events as timeline markers, each with its own label (one event, one marker). */
export function scoreMarkers(score: Score): Marker[] {
  return score.events.map((e, i) => ({ label: labelOf(e, i), position: e.at })).sort((a, b) => a.position - b.position);
}

export function labelOf(e: ScoreEvent, i: number): string {
  if ('line' in e) return `voice:${e.line}@${i}`;
  if ('sfx' in e) return `sfx:${e.sfx}@${i}`;
  if ('bed' in e) return `bed:${e.bed}@${i}`;
  if ('fx' in e) return `fx:${e.fx.kind}@${i}`;
  return `gap:${e.gap}@${i}`;
}

/** The score's sounds as a cue sheet for MemoryAudio (lines: their recordings, placed). */
export function toCueSheet(def: VignetteDef, score: Score, keyOf: (line: VLine) => string = (l) => lineKey(def, l)): CueSheet {
  const cues: Record<string, Cue> = {};
  const side = (p: AnyPlace) => ('at' in p && (p.at === 'left' || p.at === 'right') ? p.at : undefined);
  score.events.forEach((e, i) => {
    const label = labelOf(e, i);
    if ('line' in e) {
      const line = def.lines.find((l) => l.id === e.line);
      if (!line) return;
      const cut = e.end === 'cut';
      cues[label] = {
        asset: keyOf(line), take: e.take, gainDb: e.gainDb ?? 0, place: e.place, lowpass: e.lowpass, highpass: e.highpass, dry: e.dry,
        stopAfter: e.stopAfter, text: cut && !/[—-]$/.test(line.text) ? `${line.text.replace(/[.…]+$/, '')}—` : line.text, side: side(e.place), cutOnInterrupt: true,
      };
    } else if ('sfx' in e) {
      cues[label] = { asset: e.asset, take: e.take, gainDb: e.gainDb, place: e.place, lowpass: e.lowpass, caption: e.caption, stopAfter: e.stopAfter };
    } else if ('bed' in e) {
      cues[label] = { asset: e.asset, take: e.take, gainDb: e.gainDb, place: e.place ?? { at: 'anchor' }, fadeIn: e.fadeIn ?? 2, fadeOut: e.fadeOut ?? 3, lowpass: e.lowpass, caption: e.caption };
    }
  });
  return { room: def.room, cues };
}

/** Every manifest key a vignette may play (to prefetch, and to let go of afterwards). */
export function vignetteKeys(def: VignetteDef): string[] {
  const keys = new Set<string>();
  for (const s of Object.values(def.variants))
    for (const e of s.events) {
      if ('line' in e) {
        const l = def.lines.find((x) => x.id === e.line);
        if (l) keys.add(lineKey(def, l));
      } else if (('sfx' in e || 'bed' in e) && !e.asset.startsWith('synth:') && !e.asset.startsWith('music/')) keys.add(e.asset);
    }
  for (const e of def.echoes ?? []) {
    const l = e.voice && def.lines.find((x) => x.id === e.voice!.line);
    if (l) keys.add(lineKey(def, l));
  }
  return [...keys];
}
