/**
 * Voices overheard inside the painted memories (docs/memories.md, "Voices in painted memories";
 * decisions in docs/reviews/2026-10-overheard.md). A few seconds of somebody else's life, said to
 * each other in the remembered moment, after the picture has formed and before its light goes.
 *
 * Not a second engine: a version's beats become `voice:` cues on the memory's own cue sheet and
 * markers on its own timeline, played by its MemoryAudio on its own clock (src/memory/runtime.ts),
 * so interruption, pause and the room's hush are the memory's. Which version is heard is the
 * MemoryDirector's choice (deterministic, from what the visitor has done); whether it is heard at
 * all is the recordings': every line of the version kept by the artist, or the memory plays
 * exactly as it did, wordless.
 *
 * Pure data and pure functions. The words live in memory-voices.json and nowhere else.
 */
import DATA from './memory-voices.json';
import { matchesRule, readingTake, type Speaker, type VLine, type VariantContext, type VariantRule } from './vignettes';
import type { Cue, CueSheet, Place } from '../memory/cueSheet';
import type { Marker } from '../memory/types';

/** One line said, at a time in the memory's sequence (seconds), from a place in the painting. */
export interface Beat {
  at: number;
  line: string;
  place: Place;
  gainDb?: number;
  lowpass?: number;
  highpass?: number;
  /** A reading by name (`--<reading>` in its recording's file name). */
  reading?: string;
  /** Cut off this far into the file, captioned as cut. */
  stopAfter?: number;
  end?: 'complete' | 'cut';
}

export interface Version {
  beats: Beat[];
  /** The memory's own sound markers left out of this version (the laugh, when nobody laughs). */
  mute?: string[];
  /** The memory's own sounds at another level (dB) while it has words (the radio, under speech). */
  gains?: Record<string, number>;
}

export interface VariantVoices {
  /**
   * Where no voice may sound (sequence seconds, [from, to]): the picture's own beats (its forming,
   * a light lifting, a curtain, the sun arriving) are left to it. Checked by the tests.
   */
  quiet?: [number, number][];
  /** `default` is heard unless a rule picks another. */
  versions: Record<string, Version>;
  /** First match wins. */
  rules?: { when: VariantRule['when']; version: string }[];
}

export interface MemoryVoicesDef {
  /** The painted memory's id (src/memory/defs.ts). */
  id: string;
  speakers: Record<string, Speaker>;
  lines: VLine[];
  /** Painted variants with voices; a variant not here is silent. */
  variants: Record<string, VariantVoices>;
}

export const MEMORY_VOICES: MemoryVoicesDef[] = (DATA as unknown as { memories: MemoryVoicesDef[] }).memories;
export const MEMORY_VOICES_BY_ID = new Map(MEMORY_VOICES.map((m) => [m.id, m]));

/** The manifest key of a line's recordings (the vignettes' namespace: one recording pipeline). */
export function memoryLineKey(def: MemoryVoicesDef, line: VLine): string {
  return `vig:${def.id}:${line.id}`;
}

/** Which version of a painted variant's voices a visitor hears, or null (it has none). */
export function chooseVoices(id: string, variant: string, ctx: VariantContext): string | null {
  const vv = MEMORY_VOICES_BY_ID.get(id)?.variants[variant];
  if (!vv) return null;
  for (const r of vv.rules ?? []) if (vv.versions[r.version] && matchesRule(r.when, ctx)) return r.version;
  return vv.versions.default ? 'default' : Object.keys(vv.versions)[0] ?? null;
}

export function versionOf(id: string, variant: string, version: string | null | undefined): Version | null {
  return (version && MEMORY_VOICES_BY_ID.get(id)?.variants[variant]?.versions[version]) || null;
}

/** About how long a line takes to say (s), before a take exists: a hold, never a cue time. */
export function saidFor(text: string): number {
  return 0.5 + 0.38 * text.split(/\s+/).length;
}

/** When a version's last line will have been said (sequence seconds; 0: it has none). */
export function voicesEnd(id: string, variant: string, version: string | null | undefined): number {
  const def = MEMORY_VOICES_BY_ID.get(id);
  const v = versionOf(id, variant, version);
  if (!def || !v) return 0;
  return Math.max(0, ...v.beats.map((b) => b.at + (b.stopAfter ?? saidFor(def.lines.find((l) => l.id === b.line)?.text ?? ''))));
}

/** The manifest keys a version speaks (all must be kept for it to be heard). */
export function versionKeys(id: string, variant: string, version: string | null | undefined): string[] {
  const def = MEMORY_VOICES_BY_ID.get(id);
  const v = versionOf(id, variant, version);
  if (!def || !v) return [];
  return [...new Set(v.beats.flatMap((b) => {
    const l = def.lines.find((x) => x.id === b.line);
    return l ? [memoryLineKey(def, l)] : [];
  }))];
}

/**
 * A painted memory's sound with a version's voices laid in: its markers (less any the version
 * mutes) and `voice:<line>@<i>` markers at the beats, and cues for them, captioned as speech with
 * the speaker's side (the first speaker's lines lean left, the second's right; one voice alone is
 * centred), as a vignette's are.
 */
export function withVoices(
  sheet: CueSheet,
  markers: Marker[],
  id: string,
  variant: string,
  version: string | null | undefined,
  filesOf: (key: string) => readonly string[] = () => [],
): { sheet: CueSheet; markers: Marker[] } {
  const def = MEMORY_VOICES_BY_ID.get(id);
  const v = versionOf(id, variant, version);
  if (!def || !v) return { sheet, markers };
  // Captions tell two people apart by which side of the painting each speaks from (phones play
  // one channel: the caption is how a phone visitor knows who). One voice alone is centred.
  const order: string[] = Object.keys(def.speakers);
  const at = (speaker: string) => v.beats.find((b) => def.lines.find((l) => l.id === b.line)?.speaker === speaker)?.place.u ?? 0;
  const side = (speaker: string): 'left' | 'right' | undefined => (order.length < 2 ? undefined : at(speaker) < 0 ? 'left' : 'right');
  const mute = new Set(v.mute ?? []);
  const cues: Record<string, Cue> = { ...sheet.cues };
  for (const [label, gainDb] of Object.entries(v.gains ?? {})) if (cues[label]) cues[label] = { ...cues[label], gainDb };
  const out = markers.filter((m) => !mute.has(m.label));
  v.beats.forEach((b, i) => {
    const line = def.lines.find((l) => l.id === b.line);
    if (!line) return;
    const label = `voice:${line.id}@${i}`;
    const asset = memoryLineKey(def, line);
    const cut = b.end === 'cut';
    cues[label] = {
      asset, take: b.reading ? readingTake(filesOf(asset), b.reading) : undefined, gainDb: b.gainDb ?? 0, place: b.place, lowpass: b.lowpass, highpass: b.highpass,
      stopAfter: b.stopAfter, text: cut && !/[—-]$/.test(line.text) ? `${line.text.replace(/[.…]+$/, '')}—` : line.text, side: side(line.speaker), cutOnInterrupt: true,
    };
    out.push({ label, position: b.at });
  });
  out.sort((a, b) => a.position - b.position);
  return { sheet: { ...sheet, cues }, markers: out };
}
