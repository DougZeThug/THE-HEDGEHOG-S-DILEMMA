import { PHRASES, PHRASE_BY_ID } from '../../content/phrases';
import type { Phrase, Surface } from '../../content/types';
import { warmthOf } from '../Memory';
import type { SituationContext, SituationDef, SituationHost } from './Situation';

const WALLS: Surface[] = ['north', 'east', 'south', 'west'];

function otherWalls(not: Surface[]): Surface[] {
  return WALLS.filter((w) => !not.includes(w));
}

/** Seconds per hummed note; fixed so the room knows which note was cut off. */
export const HUM_NOTE = 0.62;
/** A rest inside a hummed sequence. */
export const REST = -100;

// ─────────────────────────────────────────────────────────────────────────────
// 1. The next room
//    Laughter beyond a wall. Follow it and a happy memory is there on that wall.
//    Much later, at the chair, the memory returns — and where the laughter was,
//    there is only quiet.
// ─────────────────────────────────────────────────────────────────────────────
const LAUGH_SECONDS = 4.5;

export const nextRoom: SituationDef = {
  id: 'next-room',
  maxLife: 720,
  owns: ['vf-laugh-next-room'],
  ready: (h, claimed) => h.phase !== 'arrival' && h.now > 25 && !claimed('beyond') && h.visitor.speed < 0.6,
  begin(c) {
    if (!c.claim('beyond')) return c.end('abort');
    const wall = c.h.rng.pick(otherWalls([c.h.facing, 'south']).length ? otherWalls([c.h.facing, 'south']) : otherWalls([c.h.facing]));
    c.st.data.wall = wall;
    c.st.data.laughs = 1;
    laugh(c, wall, 0.5);
    c.go('listening');
  },
  step(c) {
    const { h, st } = c;
    const d = st.data as { wall: Surface; laughs: number; memory?: string; dist0?: number; keeping?: boolean };
    if (st.stage === 'listening') {
      if (h.distToSurface(d.wall) < 1.3) {
        const m = memoryOn(h, d.wall);
        if (m) {
          d.memory = m.id;
          if (!h.visible.has(m.id)) h.reveal(c.rule, m.id, 0.5, 'emerge', 6);
        }
        // Once more, softer, as if just the other side of the wall.
        laugh(c, d.wall, 0.32, 3);
        c.release('beyond');
        return d.memory ? c.go('found') : c.end();
      }
      if (c.since > 75) {
        if (d.laughs >= 2) {
          c.release('beyond');
          return c.end();
        }
        d.laughs = 2;
        // From somewhere else — never the wall the visitor is already standing at.
        const away = otherWalls([d.wall, h.facing]).filter((w) => h.distToSurface(w) > 1.6);
        d.wall = h.rng.pick(away.length ? away : otherWalls([d.wall, h.facing]));
        laugh(c, d.wall, 0.3);
        c.go('listening');
      }
      return;
    }
    if (st.stage === 'found') {
      const v = h.visitor;
      if (c.since < 100) return;
      // The memory is owed at the chair: from the moment they head for it (within 2 m), the chair
      // and the walls are kept for it, so nothing else speaks as they come and settle. Let go if
      // they walk away again.
      if (v.distance > (d.keeping ? 2.4 : 2.0)) {
        if (d.keeping) {
          c.release('chair-voice');
          c.release('beyond');
          d.keeping = false;
        }
        return;
      }
      if (!d.keeping) {
        if (!c.claim('chair-voice')) return;
        c.claim('beyond');
        d.keeping = true;
      }
      if (!v.near || v.nearFor < 6 || v.speed > 0.15) return;
      const m = PHRASE_BY_ID.get(d.memory!)!;
      // The same memory, small, on the floor by the chair. Where the laughter was: nothing.
      const len = Math.hypot(v.x, v.z) || 1;
      c.emit(0, {
        type: 'write', key: `nr:${m.id}`, text: m.text, hand: 'cyan', size: 'xs', surface: 'floor', purpose: 'recall', ttl: 150,
        nearPoint: { x: (v.x / len) * 0.42, z: (v.z / len) * 0.42 }, source: m.id,
      });
      c.emit(1.5, { type: 'silence', depth: 0.65, seconds: LAUGH_SECONDS + 1.5 }, { priority: 5 });
      c.go('remembered');
      return;
    }
    if (st.stage === 'remembered' && c.since > LAUGH_SECONDS + 12) c.end();
  },
};

function laugh(c: SituationContext, wall: Surface, gain: number, delay = 0) {
  c.emit(delay, {
    type: 'voice', kind: 'laugh', text: null, caption: '(laughter, through the wall)', position: { kind: 'beyond', surface: wall },
    gain, assetId: 'vf-laugh-next-room', tag: 'next-room',
  }, { major: true, ttl: 12 });
}

/** The warmest piece of writing on a wall, nearest to where the visitor stands; hidden ones first. */
function memoryOn(h: SituationHost, wall: Surface): Phrase | undefined {
  const v = h.visitor;
  const cands = PHRASES.filter((p) => p.tier !== 'annotation' && p.tier !== 'still' && (p.tier !== 'transform' || h.phase === 'transform'))
    .map((p) => ({ p, g: h.geometry(p.id) }))
    .filter((x) => x.g && x.g.surface === wall && warmthOf(x.p.dims) >= 0.9 && ((x.p.dims.nostalgia ?? 0) >= 0.4 || (x.p.dims.happiness ?? 0) >= 0.7));
  const score = (x: (typeof cands)[number]) => Math.hypot(x.g!.x - v.x, x.g!.z - v.z) + (h.visible.has(x.p.id) ? 1.5 : 0);
  cands.sort((a, b) => score(a) - score(b) || (a.p.id < b.p.id ? -1 : 1));
  return cands[0]?.p;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Someone humming
//    While the visitor is still, someone hums beyond a wall. Go toward it and it
//    stops mid-phrase. Later the piano plays the same tune — and stops where the
//    humming was interrupted.
// ─────────────────────────────────────────────────────────────────────────────
const PENTA = [0, 2, 4, 7, 9, 12];

export const humming: SituationDef = {
  id: 'humming',
  maxLife: 600,
  owns: ['vf-hum'],
  ready: (h, claimed) => h.now > 20 && h.visitor.deepStillFor > 5 && !claimed('beyond'),
  begin(c) {
    if (!c.claim('beyond')) return c.end('abort');
    const r = c.h.rng;
    const tune: number[] = [];
    let i = r.int(1, 3);
    for (let n = r.int(4, 7); n > 0; n--) {
      tune.push(PENTA[i]);
      i = Math.max(0, Math.min(PENTA.length - 1, i + r.pick([-1, 1, -2, 1, 2])));
    }
    // Hummed three times through, with a breath between.
    const seq = [...tune, REST, ...tune, REST, REST, ...tune];
    // From a wall the visitor can walk toward (not the one at their back, a step away).
    const walls = otherWalls([c.h.facing]);
    const far = walls.filter((w) => c.h.distToSurface(w) > 1.6);
    const wall = r.pick(far.length ? far : walls);
    Object.assign(c.st.data, { tune, seq, wall, startAt: c.h.now + 0.1, dist0: c.h.distToSurface(wall) });
    c.emit(0, {
      type: 'voice', kind: 'hum', text: null, caption: '(humming)', position: { kind: 'beyond', surface: wall }, gain: 0.42,
      tag: 'humming', melody: seq, synth: true,
    }, { major: true, ttl: 3, priority: 3 });
    c.go('humming');
  },
  step(c) {
    const { h, st } = c;
    const d = st.data as { tune: number[]; seq: number[]; wall: Surface; startAt: number; dist0: number; cutAt?: number; stillLine?: boolean };
    if (st.stage === 'humming') {
      const elapsed = h.now - d.startAt;
      const total = d.seq.length * HUM_NOTE;
      if (h.distToSurface(d.wall) < d.dist0 - 0.6) {
        // Approached: it stops, mid-phrase.
        c.emit(0, { type: 'stopVoice', tag: 'humming', fade: 0.25 });
        const played = d.seq.slice(0, Math.max(0, Math.floor(elapsed / HUM_NOTE)) + 1).filter((n) => n !== REST).length;
        d.cutAt = Math.max(1, ((played - 1) % d.tune.length) + 1);
        c.release('beyond');
        c.claim('music'); // the tune is owed; the room keeps its music for it
        return c.go('waiting');
      }
      if (elapsed > total + 1) {
        c.release('beyond');
        c.claim('music');
        c.go('waiting');
      }
      return;
    }
    if (st.stage === 'waiting') {
      const f = h.field;
      if (c.since < 90 || (f.hush < 0.45 && f.reminiscence < 0.35) || !h.musicReady(45)) return;
      h.markMusic();
      const melody = d.tune.map((s) => 62 + s);
      c.emit(0, { type: 'music', mood: 'tender', notes: melody.length, truncate: d.cutAt !== undefined, melody, stopAt: d.cutAt }, { major: true, ttl: 20 });
      c.go('played');
      return;
    }
    if (st.stage === 'played' && c.since > 15) c.end();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Listening
//    Two people talking beyond the west wall. Go right up to the wall and stand
//    still to listen, and they stop. Much later, somewhere else, a question.
// ─────────────────────────────────────────────────────────────────────────────
export const listening: SituationDef = {
  id: 'listening',
  maxLife: 720,
  owns: ['vf-two-voices'],
  ready: (h, claimed) =>
    h.now > 45 && h.phase !== 'arrival' && !claimed('beyond') && (h.facing === 'west' || h.distToSurface('west') < 2.2),
  begin(c) {
    if (!c.claim('beyond')) return c.end('abort');
    for (const [i, t] of [0, 8, 16].entries())
      c.emit(t, {
        type: 'voice', kind: 'murmur', text: null, caption: i === 0 ? '(two voices, next door)' : '', position: { kind: 'beyond', surface: 'west' },
        gain: 0.42, tag: 'listening', synth: true,
      }, { major: true, ttl: 10 });
    c.go('murmuring');
  },
  step(c) {
    const { h, st } = c;
    if (st.stage === 'murmuring') {
      if (h.distToSurface('west') < 0.9 && h.visitor.stillFor > 1.5) {
        h.cancel(c.rule);
        c.emit(0, { type: 'stopVoice', tag: 'listening', fade: 0.06 });
        c.emit(0.1, { type: 'silence', depth: 0.8, seconds: 9 }, { priority: 5 });
        st.data.caught = true;
        c.release('beyond');
        return c.go('after');
      }
      if (c.since > 27) {
        c.release('beyond');
        return c.end();
      }
      return;
    }
    if (st.stage === 'after') {
      if (c.since < 120 || h.facing === 'west' || h.distToSurface('west') < 4 || h.visitor.speed > 0.3) return;
      const q = PHRASE_BY_ID.get('who-talking')!;
      c.emit(0, { type: 'write', key: 'listen:q', text: q.text, hand: 'faint', size: 'xs', surface: h.facing, purpose: 'recall', ttl: 120, source: q.id });
      c.end();
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Residue
//    Kneel by the chair a while. When you go, a little warmth stays where you were,
//    not at the chair. Come back later and the chair has turned toward that place.
// ─────────────────────────────────────────────────────────────────────────────
export const residue: SituationDef = {
  id: 'residue',
  maxLife: 900,
  gentle: true,
  ready: (h) => h.visitor.kneeling,
  begin(c) {
    c.go('kneeling');
  },
  step(c) {
    const { h, st } = c;
    const v = h.visitor;
    const d = st.data as { kx: number; kz: number; leftAt: number };
    if (st.stage === 'kneeling') {
      if (!v.kneeling) return c.end(c.since >= 8 ? 'done' : 'abort');
      if (c.since >= 8) {
        d.kx = v.x;
        d.kz = v.z;
        c.go('knelt');
      }
      return;
    }
    if (st.stage === 'knelt') {
      if (v.distance > 1.6) {
        c.emit(0, { type: 'glow', x: d.kx, z: d.kz, amount: 0.4, seconds: 40 });
        d.leftAt = h.now;
        c.go('away');
      }
      return;
    }
    // (Turned while they are not looking at it: found turned, never seen turning.)
    if (st.stage === 'away' && h.now - d.leftAt >= 60 && v.distance < 2.0 && v.gazeChairFor === 0) {
      c.emit(0, { type: 'chairTurn', x: d.kx, z: d.kz, amount: 0.6 });
      c.end();
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Erosion
//    Some minutes after the visitor writes something, while they are elsewhere,
//    it is rubbed out — all but one word. Sometimes the room's own writing has
//    the same word in it, and it appears faintly beside what is left.
// ─────────────────────────────────────────────────────────────────────────────
export const erosion: SituationDef = {
  id: 'erosion',
  maxLife: 600,
  gentle: true,
  ready: (h) => {
    const c = h.lastContribution();
    return !!c && h.now - c.at > 75;
  },
  begin(c) {
    const t = c.h.lastContribution()!;
    Object.assign(c.st.data, { ...t });
    c.go('waiting');
  },
  step(c) {
    const { h, st } = c;
    const d = st.data as { key: string; keep: string; surface: Surface };
    const still = h.lastContribution();
    if (!still) return c.end(); // forgotten
    if (still.key !== d.key) return c.end('abort'); // something newer was written: begin again with that
    if (h.facing === d.surface || h.distToSurface(d.surface) < 3) return;
    c.emit(0, { type: 'erode', key: d.key, keep: d.keep });
    const kin = PHRASES.find((p) => p.tier !== 'annotation' && (p.keywords ?? []).includes(d.keep));
    if (kin) c.emit(8, { type: 'write', key: `${d.key}:kin`, text: kin.text, hand: 'faint', size: 'xs', beside: `${d.key}:kept`, purpose: 'annotation', ttl: 240, source: kin.id });
    c.end();
  },
};

export const SITUATIONS: SituationDef[] = [nextRoom, humming, listening, residue, erosion];
export const SITUATION_BY_ID = new Map(SITUATIONS.map((s) => [s.id, s]));

const STOP = new Set(
  'the a an and or but if then so to of in on at by for with from as is are was were be been am i me my you your we our they them it its this that there here not no do did does have has had just very really what who why how when where all some any one'.split(' '),
);

/** The word that survives: the longest word that carries something. */
export function keptWord(text: string): string {
  const words = text.toLowerCase().replace(/[’']/g, "'").match(/[a-z']+/g) ?? [];
  const content = words.map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w.length > 1 && !STOP.has(w));
  const pool = content.length ? content : words;
  let best = pool[0] ?? '';
  for (const w of pool) if (w.length > best.length) best = w;
  return best;
}
