import { DRAWING_BY_ID } from '../../src/content/drawings';
import { VIGNETTE_BY_ID } from '../../src/content/vignettes';
import { Director } from '../../src/state/Director';
import { OPENING_WRITTEN, OPENING_SPOKEN, OPENING_UNFINISHED } from '../../src/state/OpeningScore';
import { PHRASE_BY_ID } from '../../src/content/phrases';
import { Rng } from '../../src/core/rng';
import type { Surface } from '../../src/content/types';
import type { Cue, TimedCue } from '../../src/state/cues';
import type { Persona, Frame } from './personas';

/**
 * Measures what a visit is like from the inside: when the room first answers, what is
 * heard and seen, how long nothing happens, and whether events trample each other.
 * Pure engine time (no rendering), so it runs a three-minute visit in milliseconds.
 */

export type Kind = 'voice' | 'sound' | 'music' | 'silence' | 'text' | 'light' | 'chair';

export interface Development {
  t: number;
  rule: string;
  kind: Kind;
  /** Spoken words with a recorded performance available. */
  recorded: boolean;
  /** Caused by something the visitor did (not the room's own drift). */
  responsive: boolean;
  /** Writing appeared on the wall the visitor was facing (or anything audible). */
  seen: boolean;
  label: string;
  /** For writing: the surface it appeared on. */
  surface?: Surface;
  /** For a deliberate held silence: when it ends (the quiet inside it is chosen, not a gap). */
  holdUntil?: number;
}

/**
 * Rules that answer something the visitor did. Everything else — the opening, drift,
 * migration, recontext, music, life next door, situations' own ambience, and the room's
 * filler when it is waiting (sounds, writing behind you) — is the room's own life.
 */
const RESPONSIVE = /^(finish-|accumulate-turn|accumulate-read|encounter:|first-approach|near-|long-near|still-|still-voice|withdraw-|kneel|motif-|tap|respond-line|respond-chair|respond-still|voice-attention|rehear|contribution|sit:residue|sit:listening|withhold|vignette|echo:)/;

const HALF = 3.2;

const vignetteSpan = (id: string, variant: string) => {
  const v = VIGNETTE_BY_ID.get(id);
  return (v?.variants[variant] ?? v?.variants.first)?.span ?? 20;
};

export function facingOf(yaw: number): Surface {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz < 0 ? 'north' : 'south';
}

function nearWall(x: number, z: number): Surface | null {
  const d: [Surface, number][] = [['north', z + HALF], ['south', HALF - z], ['east', HALF - x], ['west', x + HALF]];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][1] < 1.1 ? d[0][0] : null;
}

function classify(cue: Cue): { kind: Kind; label: string; recorded: boolean; surface?: Surface } | null {
  switch (cue.type) {
    case 'voice':
      return cue.text
        ? { kind: 'voice', label: `“${cue.text}”`, recorded: !!cue.performances?.length }
        : { kind: 'sound', label: cue.caption || cue.kind, recorded: false };
    case 'sound':
      return { kind: 'sound', label: cue.kind, recorded: false };
    case 'music':
      return { kind: 'music', label: `music ${cue.mood}`, recorded: false };
    case 'silence':
      return { kind: 'silence', label: `silence ${cue.depth}`, recorded: false };
    case 'reveal':
      return { kind: 'text', label: `reveal ${cue.phraseId}`, recorded: false, surface: PHRASE_BY_ID.get(cue.phraseId)?.surface };
    case 'write':
      return {
        kind: 'text', label: `write “${cue.text.slice(0, 28)}”`, recorded: false,
        surface: cue.surface ?? (cue.beside ? PHRASE_BY_ID.get(cue.beside)?.surface : undefined),
      };
    case 'redraw':
      return { kind: 'text', label: `redraw ${cue.phraseId}`, recorded: false, surface: PHRASE_BY_ID.get(cue.phraseId)?.surface };
    case 'link':
      return { kind: 'text', label: `link ${cue.a}–${cue.b}`, recorded: false, surface: PHRASE_BY_ID.get(cue.a)?.surface };
    case 'erode':
      return { kind: 'text', label: 'erode', recorded: false };
    case 'air':
      return { kind: 'text', label: `air ${cue.phraseId}`, recorded: false };
    case 'draw':
      return { kind: 'text', label: `draw ${cue.id}`, recorded: false, surface: DRAWING_BY_ID.get(cue.id)?.surface };
    case 'glow':
    case 'flash':
      return { kind: 'light', label: cue.type, recorded: false };
    case 'memory':
      return { kind: 'light', label: `memory ${cue.phraseId}`, recorded: false, surface: PHRASE_BY_ID.get(cue.phraseId)?.surface };
    case 'memory-scene':
      // It opens on the line being looked at, wherever that is written: always seen.
      return { kind: 'light', label: `memory-scene ${cue.id}`, recorded: false };
    case 'vignette':
      // Heard: voices (recorded: only approved vignettes ever play in the room).
      return { kind: 'voice', label: `vignette ${cue.id}`, recorded: true };
    case 'chairTurn':
    case 'chairNudge':
      return { kind: 'chair', label: cue.type, recorded: false };
    default:
      return null;
  }
}

export interface VisitResult {
  persona: string;
  seed: number;
  devs: Development[];
  interruptions: number;
  frames: (t: number) => Frame;
  director: Director;
  /** Interactions the room recognised, sampled at each window. */
  recognised: Record<number, Recognised>;
  /** When each phase opened. */
  phases: { phase: string; t: number }[];
}

export interface Recognised {
  reads: number;
  meetings: number;
  returns: number;
  approaches: number;
  knelt: boolean;
  taps: number;
}

export const WINDOWS = [15, 30, 60, 90, 180];

/** Run one persona through a visit. */
/**
 * A visit from the hand-off on: the authored opening (src/state/OpeningScore.ts, tested on its
 * own) has already written its line and spoken its voice. A persona's gaze rests on writing
 * that is there: if the line it would read hasn't been written yet, it reads the nearest line
 * that has on the same wall, or nothing.
 */
export function visit(p: Persona, seconds: number, seed: number, dt = 0.1): VisitResult {
  const d = new Director({ seed });
  d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
  const devs: Development[] = [];
  let interruptions = 0;
  let taps = 0;
  const recognised: Record<number, Recognised> = {};
  const phases: { phase: string; t: number }[] = [];
  let phase = d.phase;
  const tapper = d as unknown as { tapped?: (t: { phraseId?: string; chair?: boolean }) => boolean };
  // A living memory, as the App plays it: it runs to its natural close (about 22 s, then its
  // residue) unless the visitor leaves, and then reports back. Seen while it plays: it opens on
  // the line being looked at.
  let memoryEndsAt: { id: string; at: number } | null = null;
  // Where each line is actually written (the first lines are often re-written on the wall the
  // visitor faces, not their own), and a visitor's habit of glancing at writing that appears
  // in front of them. The chance is fixed here, before any memory was measured with it:
  // 0.6 at a desk, 0.4 on a phone (a small screen and a thumb busy walking).
  const writtenOn = new Map<string, Surface>();
  for (const id of OPENING_WRITTEN) writtenOn.set(id, PHRASE_BY_ID.get(id)!.surface);
  const noticeRng = new Rng(seed * 7919 + 13);
  // (NOTICE=0…1 overrides it, to see how much a result leans on this assumption.)
  const noticeChance = process.env.NOTICE !== undefined ? Number(process.env.NOTICE) : p.device === 'phone' ? 0.4 : 0.6;
  let notice: { id: string; until: number } | null = null;
  let lastAftermath = -Infinity;
  for (let t = 0; t < seconds; t += dt) {
    if (memoryEndsAt && t >= memoryEndsAt.at) {
      d.memoryEnded(memoryEndsAt.id, true, true);
      memoryEndsAt = null;
    }
    const f = p.frame(t);
    if (f.tap && tapper.tapped) taps += tapper.tapped(f.tap.chair ? { chair: true } : { phraseId: f.tap.phrase }) ? 1 : 0;
    const facing = facingOf(f.yaw);
    if (notice && (t >= notice.until || facing !== writtenOn.get(notice.id))) notice = null;
    const gaze = notice ? notice.id : readable(d, f.gaze, facing, writtenOn);
    const cues: TimedCue[] = d.tick(dt, {
      x: f.x, z: f.z, yaw: f.yaw, pitch: f.pitch, gazePhraseId: gaze, gazeChair: f.gazeChair && !notice, nearSurface: nearWall(f.x, f.z), kneeling: f.kneeling,
    }, facing);
    for (const c of cues) {
      const cue = c.cue;
      // (A line written again in front of them can be noticed as a new one can.)
      const id = cue.type === 'write' ? cue.source ?? cue.key : cue.type === 'reveal' || cue.type === 'redraw' ? cue.phraseId : null;
      if (!id || !PHRASE_BY_ID.has(id)) continue;
      const surface = cue.type === 'write' ? cue.surface ?? PHRASE_BY_ID.get(id)!.surface : cue.type === 'redraw' ? writtenOn.get(id) ?? PHRASE_BY_ID.get(id)!.surface : PHRASE_BY_ID.get(id)!.surface;
      writtenOn.set(id, surface);
      if (surface === facing && !notice && noticeRng.chance(noticeChance)) notice = { id, until: t + dt + noticeRng.range(2, 3) };
    }
    if (d.phase !== phase) phases.push({ phase: (phase = d.phase), t: +(t + dt).toFixed(1) });
    // A memory's aftermath is chosen quiet: the last memory's hold reaches to its end.
    if (d.aftermathUntil > lastAftermath) {
      lastAftermath = d.aftermathUntil;
      const m = [...devs].reverse().find((x) => /^(vignette|memory-scene) /.test(x.label));
      if (m) m.holdUntil = Math.max(m.holdUntil ?? 0, lastAftermath);
    }
    for (const c of cues) {
      if (c.cue.type === 'stopVoice') interruptions++;
      const k = classify(c.cue);
      if (!k) continue;
      devs.push({
        t: +(t + dt).toFixed(1), rule: c.rule, kind: k.kind, recorded: k.recorded, label: k.label, surface: k.surface,
        responsive: RESPONSIVE.test(c.rule),
        seen: k.kind !== 'text' || !k.surface || k.surface === facing || k.surface === 'floor' || (k.surface === 'ceiling' && f.pitch > 0.4),
        holdUntil:
          (c.rule === 'held-silence' || c.rule === 'still-silence') && c.cue.type === 'silence'
            ? t + dt + c.cue.seconds
            : c.cue.type === 'memory-scene'
              ? t + dt + Math.min(c.cue.maxHold, 22) + 6
              : c.cue.type === 'vignette'
                ? // Its span, then a recovery that is chosen quiet only so long (15 s).
                  t + dt + vignetteSpan(c.cue.id, c.cue.variant) + 2.7 + 15
                : undefined,
      });
      if (c.cue.type === 'memory-scene') memoryEndsAt = { id: c.cue.id, at: t + dt + Math.min(c.cue.maxHold, 22) + 6 };
      // A vignette plays to its end (its pre-roll, its span, its last sound ringing out).
      if (c.cue.type === 'vignette') memoryEndsAt = { id: c.cue.id, at: t + dt + vignetteSpan(c.cue.id, c.cue.variant) + 2.7 };
    }
    for (const w of WINDOWS) {
      if (t < w && t + dt >= w) {
        const v = d.visitor;
        let meetings = 0, returns = 0;
        for (const e of v.encounters.values()) {
          meetings += e.count;
          if (e.count > 1) returns++;
        }
        recognised[w] = { reads: v.read.size, meetings, returns, approaches: v.approaches.length, knelt: v.kneelTime > 0, taps };
      }
    }
  }
  return { persona: p.id, seed, devs, interruptions, frames: p.frame, director: d, recognised, phases };
}

/**
 * What a gaze can rest on: the line, if it is written where the visitor is looking; else a line
 * that is written on the wall they face; else nothing.
 */
function readable(d: Director, id: string | null, facing: Surface, writtenOn: Map<string, Surface>): string | null {
  if (!id) return null;
  const where = (pid: string) => writtenOn.get(pid) ?? PHRASE_BY_ID.get(pid)?.surface;
  const home = PHRASE_BY_ID.get(id)?.surface;
  const st = d.visible.get(id);
  // Floor and ceiling writing is read where it is (looking down or up), whatever the facing.
  if (st && st.mode === 'shown' && (where(id) === facing || home === 'floor' || home === 'ceiling')) return id;
  if (home === 'floor' || home === 'ceiling') return null;
  for (const [vid, vs] of d.visible) if (vs.mode === 'shown' && where(vid) === facing) return vid;
  return null;
}

/** Developments that count as something happening (a dip in the room tone alone does not — unless it is the room deliberately holding back). */
const DELIBERATE = new Set(['withhold', 'held-silence', 'still-silence']);
export const meaningful = (x: Development) => x.kind !== 'silence' || DELIBERATE.has(x.rule);
/** …and that the visitor could actually see or hear. */
export const perceptible = (x: Development) => meaningful(x) && x.seen;

export interface WindowStats {
  firstResponse: number | null;
  firstAnything: number | null;
  voices: number;
  recordedVoices: number;
  otherSounds: number;
  text: number;
  textUnseen: number;
  silences: number;
  /** Longest stretch with no meaningful development, within the window. */
  longestGap: number;
  /** Longest stretch with nothing the visitor could see or hear. */
  longestSeenGap: number;
  /** Meaningful developments per minute. */
  perMinute: number;
  /** Two audible events starting within 3 s of each other. */
  overlaps: number;
}

export function windowStats(r: VisitResult, w: number): WindowStats {
  const devs = r.devs.filter((x) => x.t <= w);
  const m = devs.filter(meaningful);
  const firstResp = m.find((x) => x.responsive && x.seen);
  const longest = (xs: Development[]) => {
    let gap = 0, last = 0;
    for (const x of xs) {
      gap = Math.max(gap, x.t - last);
      last = Math.max(last, x.holdUntil ?? x.t);
    }
    return Math.max(gap, w - last);
  };
  const gap = longest(m);
  const audible = devs.filter((x) => x.kind === 'voice' || x.kind === 'sound' || x.kind === 'music');
  let overlaps = 0;
  for (let i = 1; i < audible.length; i++) if (audible[i].t - audible[i - 1].t < 3) overlaps++;
  return {
    firstResponse: firstResp?.t ?? null,
    firstAnything: m[0]?.t ?? null,
    voices: devs.filter((x) => x.kind === 'voice').length,
    recordedVoices: devs.filter((x) => x.kind === 'voice' && x.recorded).length,
    otherSounds: devs.filter((x) => x.kind === 'sound' || x.kind === 'music').length,
    text: devs.filter((x) => x.kind === 'text').length,
    textUnseen: devs.filter((x) => x.kind === 'text' && !x.seen).length,
    silences: devs.filter((x) => x.kind === 'silence').length,
    longestGap: +gap.toFixed(1),
    longestSeenGap: +longest(devs.filter(perceptible)).toFixed(1),
    perMinute: +(m.length / (w / 60)).toFixed(1),
    overlaps,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};

/** Median of each stat over several seeds (null first-response counts as the window length). */
export function summarise(results: VisitResult[], w: number): WindowStats & { phaseAt: string } {
  const st = results.map((r) => windowStats(r, w));
  const med = (f: (s: WindowStats) => number) => +median(st.map(f)).toFixed(1);
  return {
    firstResponse: med((s) => s.firstResponse ?? w + 1),
    firstAnything: med((s) => s.firstAnything ?? w + 1),
    voices: med((s) => s.voices),
    recordedVoices: med((s) => s.recordedVoices),
    otherSounds: med((s) => s.otherSounds),
    text: med((s) => s.text),
    textUnseen: med((s) => s.textUnseen),
    silences: med((s) => s.silences),
    longestGap: med((s) => s.longestGap),
    longestSeenGap: med((s) => s.longestSeenGap),
    perMinute: med((s) => s.perMinute),
    overlaps: med((s) => s.overlaps),
    phaseAt: '',
  };
}
