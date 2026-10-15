/**
 * The emotional journey of a visit, measured (docs/reviews/2026-10-emotional-depth.md): not how
 * much happens, but whether what matters is given room and whether what it leaves behind is met.
 * 5 personas × 8 seeds × 600 s (each persona repeating the middle of its script once it runs
 * out, as in scripts/vignette-reach.ts).
 *
 * Per visit:
 * - encounters: memories (painted or heard) that played;
 * - quietAfter: seconds from a memory's end until the room's own next event (not counting what
 *   the visitor caused, nor a silence); capped at 120;
 * - diluted: the room's own events within 30 s of a memory's end;
 * - consequences: aftermath gestures (rules `resonance:`, `absence:`, `return:`, `echo:`,
 *   `sit:residue`), and how many were perceived — a sound with no voice within 3 s of it; a
 *   sound with nothing else sounding 5 s either side; a silence with nothing sounding in it (and,
 *   drawn in to the chair, the chair in view 3 s of it); a light with the chair in view 1.5 s
 *   within its first 15 s; a moved chair seen both before and after; writing whose wall is faced
 *   1.5 s within 60 s. The field of view is about 20° either side on a phone, 40° at a desk.
 *
 *   npx vite-node scripts/journey.ts            # summary table
 *   OUT=file.json npx vite-node scripts/journey.ts   # also writes every visit's numbers
 *   TRACE=chair:1,still:2 …                      # prints those visits' event traces
 *   RETURN=1 …                                   # a second visit, cereal and the biscuit heard before
 */
import { writeFileSync } from 'node:fs';
import { PERSONAS, type Persona } from '../tests/playtest/personas';
import { visit, facingOf, type Development } from '../tests/playtest/measure';
import { ROOM_OWN } from '../src/state/Director';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SECONDS = Number(process.env.SECONDS ?? 600);
const looped = (p: Persona): Persona => ({ ...p, frame: (t) => p.frame(t < 240 ? t : 60 + ((t - 240) % 180)) });
const CONSEQUENCE = /^(resonance:|absence:|return:|echo:|sit:residue)/;
const PAST = process.env.RETURN ? { visits: 2, memoryCounts: { cereal: 1, biscuit: 1 } } : {};

interface Journey {
  persona: string;
  seed: number;
  encounters: string[];
  quietAfter: number[];
  diluted: number[];
  consequences: { rule: string; t: number; perceived: boolean }[];
  /** How the visit left the chair (what the next visit is given). */
  leaving: string | null;
  /** Share of 30–300 s in imposed quiet; most of the room's own events in any 20 s; held silences a sound broke into. */
  quietShare: number;
  most20: number;
  silencesBroken: number;
  silences: number;
}

function journey(p: Persona, seed: number): { j: Journey; devs: Development[] } {
  const lp = looped(p);
  const r = visit(lp, SECONDS, seed, 0.1, PAST);
  const devs = r.devs;
  const own = (d: Development) => !d.responsive && d.kind !== 'silence' && !CONSEQUENCE.test(d.rule);
  const ownT = devs.filter((d) => ROOM_OWN.test(d.rule)).map((d) => d.t);
  const held = devs.filter((d) => d.kind === 'silence' && (d.rule === 'held-silence' || d.rule === 'resonance:table'));
  const j: Journey = {
    persona: p.id, seed, encounters: [], quietAfter: [], diluted: [], consequences: [], leaving: r.director.leaving(),
    quietShare: r.imposedQuiet / 270,
    most20: Math.max(0, ...ownT.map((t) => ownT.filter((u) => u >= t && u < t + 20).length)),
    silences: held.length,
    // (By the room's own sounds: an answer to the visitor may still come in one.)
    silencesBroken: held.filter((h) => devs.some((e) => ROOM_OWN.test(e.rule) && (e.kind === 'voice' || e.kind === 'sound' || e.kind === 'music') && e.t > h.t && e.t < (h.holdUntil ?? h.t + 30))).length,
  };
  for (const d of devs) {
    if (!/^(vignette|memory-scene) /.test(d.label)) continue;
    j.encounters.push(d.label.replace(/^(vignette|memory-scene) /, ''));
    // Its end: a vignette's chosen quiet is 15 s past its last sound; a painted one's hold is its end.
    const end = d.endsAt ?? d.t;
    const next = devs.find((e) => e.t > end && own(e));
    j.quietAfter.push(Math.min(120, +(((next?.t ?? SECONDS) - end)).toFixed(1)));
    j.diluted.push(devs.filter((e) => e.t > end && e.t <= end + 30 && own(e)).length);
  }
  for (const d of devs) {
    if (!CONSEQUENCE.test(d.rule)) continue;
    // What the visitor can see: about 20° either side on an upright phone, 40° at a desk.
    const half = ((p.device === 'phone' ? 20 : 40) * Math.PI) / 180;
    const chairInView = (t: number) => {
      const f = lp.frame(t);
      const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), cx = -f.x, cz = -f.z, n = Math.hypot(cx, cz) || 1;
      return (fx * cx + fz * cz) / n > Math.cos(half) || n < 0.6;
    };
    const held = (from: number, to: number, secs: number, test: (t: number) => boolean) => {
      let run = 0;
      for (let t = from; t <= Math.min(SECONDS, to); t += 0.5) {
        run = test(t) ? run + 0.5 : 0;
        if (run >= secs) return true;
      }
      return false;
    };
    let perceived: boolean;
    if (d.kind === 'silence') {
      // A silence: nothing else sounding for its whole length; one drawn in to the chair, only
      // if the chair is in view in it (behind the visitor it is just a dim of the wall in front).
      const end = d.holdUntil ?? d.t + 30;
      const clean = !devs.some((e) => e !== d && (e.kind === 'voice' || e.kind === 'sound' || e.kind === 'music') && e.t >= d.t - 5 && e.t <= end);
      perceived = clean && (d.rule !== 'resonance:table' || held(d.t, end, 3, chairInView));
    } else if (d.kind === 'sound' || d.kind === 'voice' || d.kind === 'music')
      // Heard: nothing else sounding within 5 s either side.
      perceived = !devs.some((e) => e !== d && (e.kind === 'voice' || e.kind === 'sound' || e.kind === 'music') && Math.abs(e.t - d.t) < 5);
    else if (d.kind === 'chair')
      // A moved chair is noticed only by someone who saw it before and after.
      perceived = held(d.t - 60, d.t, 1.5, chairInView) && held(d.t, d.t + 30, 1.5, chairInView);
    else if (d.kind === 'light')
      // A warmth that fades: in view 1.5 s while still strong (its first 15 s).
      perceived = held(d.t, d.t + 15, 1.5, chairInView);
    else perceived = d.surface ? held(d.t, d.t + 60, 1.5, (t) => facingOf(lp.frame(t).yaw) === d.surface) : d.seen;
    j.consequences.push({ rule: d.rule, t: d.t, perceived });
  }
  return { j, devs };
}

const all: Journey[] = [];
const traces = new Set((process.env.TRACE ?? '').split(',').filter(Boolean));
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : NaN);
console.log('| persona | encounters / visit | quiet after a memory (median s) | room events ≤30 s after (mean) | consequences (perceived) | left the chair | imposed quiet 30–300 s | most own events in 20 s | held silences the room broke into |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const p of PERSONAS) {
  const js: Journey[] = [];
  for (const s of SEEDS) {
    const { j, devs } = journey(p, s);
    js.push(j);
    if (traces.has(`${p.id}:${s}`)) {
      console.error(`\n# ${p.id} seed ${s}`);
      for (const d of devs) if (!d.responsive || /^(vignette|memory|resonance|absence|return|echo)/.test(d.rule)) console.error(`${d.t.toFixed(1).padStart(6)}  ${d.rule.padEnd(24)} ${d.label}`);
    }
  }
  all.push(...js);
  const enc = js.reduce((n, j) => n + j.encounters.length, 0) / js.length;
  const q = js.flatMap((j) => j.quietAfter), dl = js.flatMap((j) => j.diluted);
  const cons = js.flatMap((j) => j.consequences);
  const left: Record<string, number> = {};
  for (const j of js) left[j.leaving ?? '—'] = (left[j.leaving ?? '—'] ?? 0) + 1;
  console.log(`| ${p.id} | ${enc.toFixed(2)} | ${median(q)} | ${dl.length ? (dl.reduce((a, b) => a + b, 0) / dl.length).toFixed(2) : '—'} | ${cons.length} (${cons.filter((c) => c.perceived).length}) | ${Object.entries(left).map(([k, n]) => `${k} ${n}`).join(', ')} | ${Math.round((100 * js.reduce((a, j) => a + j.quietShare, 0)) / js.length)}% | ${Math.max(...js.map((j) => j.most20))} | ${js.reduce((a, j) => a + j.silencesBroken, 0)}/${js.reduce((a, j) => a + j.silences, 0)} |`);
}
const q = all.flatMap((j) => j.quietAfter), dl = all.flatMap((j) => j.diluted), cons = all.flatMap((j) => j.consequences);
console.log(`| all | ${(all.reduce((n, j) => n + j.encounters.length, 0) / all.length).toFixed(2)} | ${median(q)} | ${(dl.reduce((a, b) => a + b, 0) / Math.max(1, dl.length)).toFixed(2)} | ${cons.length} (${cons.filter((c) => c.perceived).length}) | | ${Math.round((100 * all.reduce((a, j) => a + j.quietShare, 0)) / all.length)}% | ${Math.max(...all.map((j) => j.most20))} | ${all.reduce((a, j) => a + j.silencesBroken, 0)}/${all.reduce((a, j) => a + j.silences, 0)} |`);
const byRule: Record<string, [number, number]> = {};
for (const c of cons) {
  const k = c.rule.replace(/:\d+$/, '');
  byRule[k] ??= [0, 0];
  byRule[k][0]++;
  if (c.perceived) byRule[k][1]++;
}
console.log('\nconsequences by rule (fired, perceived):', JSON.stringify(byRule));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ seconds: SECONDS, seeds: SEEDS, journeys: all }, null, 1));
