import { Director } from '../../src/state/Director';
import { PHRASE_BY_ID } from '../../src/content/phrases';
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
}

/** Rules that belong to the room's own life rather than answering the visitor. */
const AMBIENT = /^(opening|drift|distant-life|music|resurface|stray|stray-held|recontext|cull|unstill|phase-|return|chair-nudge|pulse)/;

const HALF = 3.2;

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
    case 'glow':
    case 'flash':
      return { kind: 'light', label: cue.type, recorded: false };
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
export function visit(p: Persona, seconds: number, seed: number, dt = 0.1): VisitResult {
  const d = new Director({ seed });
  const devs: Development[] = [];
  let interruptions = 0;
  let taps = 0;
  const recognised: Record<number, Recognised> = {};
  const phases: { phase: string; t: number }[] = [];
  let phase = d.phase;
  const tapper = d as unknown as { tapped?: (t: { phraseId?: string; chair?: boolean }) => boolean };
  for (let t = 0; t < seconds; t += dt) {
    const f = p.frame(t);
    if (f.tap && tapper.tapped) taps += tapper.tapped(f.tap.chair ? { chair: true } : { phraseId: f.tap.phrase }) ? 1 : 0;
    const facing = facingOf(f.yaw);
    const cues: TimedCue[] = d.tick(dt, {
      x: f.x, z: f.z, yaw: f.yaw, pitch: f.pitch, gazePhraseId: f.gaze, gazeChair: f.gazeChair, nearSurface: nearWall(f.x, f.z), kneeling: f.kneeling,
    }, facing);
    if (d.phase !== phase) phases.push({ phase: (phase = d.phase), t: +(t + dt).toFixed(1) });
    for (const c of cues) {
      if (c.cue.type === 'stopVoice') interruptions++;
      const k = classify(c.cue);
      if (!k) continue;
      devs.push({
        t: +(t + dt).toFixed(1), rule: c.rule, kind: k.kind, recorded: k.recorded, label: k.label,
        responsive: !AMBIENT.test(c.rule),
        seen: k.kind !== 'text' || !k.surface || k.surface === facing || k.surface === 'floor' || (k.surface === 'ceiling' && f.pitch > 0.4),
      });
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

/** Developments that count as something happening (a dip in the room tone alone does not). */
export const meaningful = (x: Development) => x.kind !== 'silence';

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
  /** Two audible events starting within 3 s of each other. */
  overlaps: number;
}

export function windowStats(r: VisitResult, w: number): WindowStats {
  const devs = r.devs.filter((x) => x.t <= w);
  const m = devs.filter(meaningful);
  const firstResp = m.find((x) => x.responsive);
  let gap = 0, last = 0;
  for (const x of m) {
    gap = Math.max(gap, x.t - last);
    last = x.t;
  }
  gap = Math.max(gap, w - last);
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
    overlaps: med((s) => s.overlaps),
    phaseAt: '',
  };
}
