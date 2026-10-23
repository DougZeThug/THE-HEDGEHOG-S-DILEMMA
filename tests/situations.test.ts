import { DRAWINGS } from '../src/content/drawings';
import { drawingSpots } from '../src/world/layout';
import { describe, it, expect } from 'vitest';
import { Director } from '../src/state/Director';
import type { VisitorInput } from '../src/state/VisitorModel';
import type { TimedCue, Cue } from '../src/state/cues';
import type { Surface } from '../src/content/types';
import { PHRASES, PHRASE_BY_ID } from '../src/content/phrases';
import { layoutPhrases, layoutToWorld, ROOM } from '../src/world/layout';
import { interpretLocally } from '../src/interpret/LocalInterpreter';
import { keptWord, HUM_NOTE } from '../src/state/situations/library';

// Geometry without a browser: the same layout, approximate font metrics.
const SZ: Record<string, number> = { xs: 0.13, s: 0.17, m: 0.22, l: 0.31, xl: 0.53 };
const placements = layoutPhrases(PHRASES, (p) => {
  const w = Math.min(2.6, p.text.length * 0.034 * (SZ[p.size] / 0.17));
  return { w, h: SZ[p.size] };
}, 4242, drawingSpots(DRAWINGS));
const geometry = (id: string) => {
  const pl = placements.get(id);
  return pl ? { surface: pl.surface, ...layoutToWorld(pl.surface, pl.u, pl.v) } : undefined;
};

type In = Partial<VisitorInput> & { facing?: Surface };
class Visit {
  d: Director;
  cues: TimedCue[] = [];
  constructor(situations: string[], seed = 5) {
    this.d = new Director({ seed, geometry, situations });
  }
  run(seconds: number, input: In | ((t: number) => In), until?: (c: TimedCue) => boolean): TimedCue | undefined {
    const base: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    for (let t = 0; t < seconds; t += 0.1) {
      const i = typeof input === 'function' ? input(t) : input;
      const out = this.d.tick(0.1, { ...base, ...i }, i.facing ?? 'north');
      this.cues.push(...out);
      const hit = until && out.find(until);
      if (hit) return hit;
    }
    return undefined;
  }
  get t() {
    return this.d.now;
  }
  of(rule: string) {
    return this.cues.filter((c) => c.rule === rule);
  }
}

/** A point 0.8 m in front of a wall, facing it. */
function before(w: Surface): In {
  const o = ROOM.halfW - 0.8;
  const pos = { north: { x: 0, z: -o }, south: { x: 0, z: o }, east: { x: o, z: 0 }, west: { x: -o, z: 0 } }[w as 'north'];
  return { ...pos, facing: w };
}
const isVoice = (c: Cue): c is Extract<Cue, { type: 'voice' }> => c.type === 'voice';

describe('situation: the next room', () => {
  it('follow the laughter, find a memory, and later the memory returns without it', () => {
    const v = new Visit(['next-room']);
    // (No vignette recorded: F, at the chair, would otherwise take the moment this waits for.)
    v.d.scenes.setAvailable(new Set());
    const first = v.run(240, { x: 0, z: 2.4 }, (c) => isVoice(c.cue) && c.cue.tag === 'next-room');
    expect(first).toBeTruthy();
    const wall = (first!.cue as Extract<Cue, { type: 'voice' }>).position as { kind: 'beyond'; surface: Surface };
    expect(wall.kind).toBe('beyond');
    expect(wall.surface).not.toBe('north'); // not the wall being faced

    v.run(12, before(wall.surface));
    const found = v.of('sit:next-room').find((c) => c.cue.type === 'reveal');
    const memoryId = found && found.cue.type === 'reveal' ? found.cue.phraseId : (v.d.situations.active[0]?.st.data.memory as string);
    expect(memoryId).toBeTruthy();
    expect(geometry(memoryId)!.surface).toBe(wall.surface);
    const md = PHRASE_BY_ID.get(memoryId)!.dims;
    expect((md.nostalgia ?? 0) >= 0.4 || (md.happiness ?? 0) >= 0.7).toBe(true);

    v.run(110, { x: 0, z: 2.6 });
    const write = v.run(40, { x: 0.1, z: 0.8 }, (c) => c.rule === 'sit:next-room' && c.cue.type === 'write');
    expect(write).toBeTruthy();
    expect(write!.cue.type === 'write' && write!.cue.text).toBe(PHRASE_BY_ID.get(memoryId)!.text);
    expect(write!.cue.type === 'write' && write!.cue.surface).toBe('floor');
    v.run(15, { x: 0.1, z: 0.8 });
    const silence = v.of('sit:next-room').find((c) => c.cue.type === 'silence');
    expect(silence).toBeTruthy();
    // The absence: no laughter anywhere near that moment, or ever again.
    const laughs = v.cues.filter((c) => isVoice(c.cue) && c.cue.kind === 'laugh');
    // Nothing else speaks at the chair as the memory is written, or during the quiet that follows.
    const quietEnd = silence!.t + (silence!.cue as { seconds: number }).seconds;
    expect(v.cues.filter((c) => isVoice(c.cue) && c.t > write!.t - 6 && c.t < quietEnd && !c.rule.startsWith('sit:')).length).toBe(0);
    expect(laughs.every((c) => c.t < write!.t - 10)).toBe(true);
    v.run(300, { x: 2, z: 2 });
    expect(v.cues.filter((c) => isVoice(c.cue) && c.cue.kind === 'laugh').length).toBe(laughs.length);
  });

  it('ignored, it calls once more from another wall, then lets go', () => {
    const v = new Visit(['next-room']);
    v.run(420, { x: 0, z: 2.4 });
    const laughs = v.cues.filter((c) => isVoice(c.cue) && c.cue.tag === 'next-room');
    expect(laughs.length).toBe(2);
    const walls = laughs.map((c) => ((c.cue as Extract<Cue, { type: 'voice' }>).position as { surface: Surface }).surface);
    expect(walls[0]).not.toBe(walls[1]);
    expect(v.of('sit:next-room').some((c) => c.cue.type === 'write')).toBe(false);
    expect(v.d.situations.finished.map((f) => f.id)).toContain('next-room');
  });
});

describe('situation: someone humming', () => {
  it('stops mid-phrase when approached; the piano later stops on the same note', () => {
    const v = new Visit(['humming']);
    const hum = v.run(200, { x: 0, z: 2.4 }, (c) => isVoice(c.cue) && c.cue.tag === 'humming');
    expect(hum).toBeTruthy();
    const h = hum!.cue as Extract<Cue, { type: 'voice' }>;
    expect(h.synth).toBe(true);
    expect(h.melody!.length).toBeGreaterThan(8);
    const wall = (h.position as { surface: Surface }).surface;
    v.run(2.2, { x: 0, z: 2.4 });
    const stop = v.run(10, before(wall), (c) => c.cue.type === 'stopVoice');
    expect(stop).toBeTruthy();
    const tune = v.d.situations.active[0].st.data.tune as number[];
    const cutAt = v.d.situations.active[0].st.data.cutAt as number;
    expect(cutAt).toBeGreaterThanOrEqual(1);
    expect(cutAt).toBeLessThanOrEqual(tune.length);
    expect((stop!.t - hum!.t) / HUM_NOTE).toBeGreaterThan(cutAt - 1);
    const music = v.run(400, { x: 0, z: 2.4 }, (c) => c.cue.type === 'music');
    expect(music).toBeTruthy();
    expect(music!.rule).toBe('sit:humming');
    const m = music!.cue as Extract<Cue, { type: 'music' }>;
    expect(m.melody).toEqual(tune.map((s) => 62 + s));
    expect(m.stopAt).toBe(cutAt);
  });

  it('heard through, it returns whole', () => {
    const v = new Visit(['humming']);
    const music = v.run(600, { x: 0, z: 2.4 }, (c) => c.cue.type === 'music' && c.rule === 'sit:humming');
    expect(music).toBeTruthy();
    expect((music!.cue as Extract<Cue, { type: 'music' }>).stopAt).toBeUndefined();
    expect(v.cues.some((c) => c.cue.type === 'stopVoice')).toBe(false);
  });
});

describe('situation: listening', () => {
  it('voices stop when you listen at the wall; much later, elsewhere, a question', () => {
    const v = new Visit(['listening']);
    const near = { x: -1.6, z: 0, facing: 'west' as Surface };
    const murmur = v.run(260, near, (c) => isVoice(c.cue) && c.cue.tag === 'listening');
    expect(murmur).toBeTruthy();
    const stop = v.run(10, before('west'), (c) => c.cue.type === 'stopVoice');
    expect(stop).toBeTruthy();
    v.run(1, before('west'));
    expect(v.of('sit:listening').some((c) => c.cue.type === 'silence')).toBe(true);
    // No further murmurs once caught.
    const after = v.run(200, { x: 2.2, z: 0.5, facing: 'east' }, (c) => c.rule === 'sit:listening' && c.cue.type === 'write');
    expect(after).toBeTruthy();
    expect(after!.cue.type === 'write' && after!.cue.surface).toBe('east');
    expect(after!.cue.type === 'write' && after!.cue.text).toBe(PHRASE_BY_ID.get('who-talking')!.text);
    expect(v.cues.filter((c) => isVoice(c.cue) && c.cue.tag === 'listening' && c.t > stop!.t).length).toBe(0);
  });
});

describe('situation: residue', () => {
  it('warmth stays where you knelt; later the chair has turned toward it', () => {
    const v = new Visit(['residue']);
    v.run(4, { x: 0.3, z: 0.9 });
    v.run(10, { x: 0.3, z: 0.9, kneeling: true });
    const glow = v.run(10, (t) => ({ x: 0.3, z: 0.9 + t * 0.4 }), (c) => c.cue.type === 'glow');
    expect(glow).toBeTruthy();
    const g = glow!.cue as Extract<Cue, { type: 'glow' }>;
    expect(g.x).toBeCloseTo(0.3, 1);
    expect(g.z).toBeCloseTo(0.9, 1);
    v.run(30, { x: 0, z: 2.6 });
    expect(v.cues.some((c) => c.cue.type === 'chairTurn')).toBe(false);
    v.run(40, { x: 0, z: 2.6 });
    // Near again, looking at it: it is not seen turning. Then with it out of view: found turned.
    expect(v.run(10, { x: 0, z: 1.5 }, (c) => c.cue.type === 'chairTurn')).toBeUndefined();
    const turn = v.run(10, { x: 0, z: 1.5, yaw: Math.PI }, (c) => c.cue.type === 'chairTurn');
    expect(turn).toBeTruthy();
    const ct = turn!.cue as Extract<Cue, { type: 'chairTurn' }>;
    expect([ct.x, ct.z].map((n) => +n.toFixed(1))).toEqual([0.3, 0.9]);
  });

  it('a brief kneel leaves nothing, and can begin again later', () => {
    const v = new Visit(['residue']);
    v.run(3, { x: 0.3, z: 0.9, kneeling: true });
    v.run(60, { x: 0, z: 2.6 });
    expect(v.cues.some((c) => c.cue.type === 'glow')).toBe(false);
    expect(v.d.situations.pending.map((d) => d.id)).toContain('residue');
  });
});

describe('situation: erosion', () => {
  it('keeps one word of what was written, and something of the room’s own beside it', () => {
    const text = 'I miss who I used to be.';
    expect(keptWord(text)).toBe('miss');
    const v = new Visit(['erosion']);
    v.run(10, { x: 0, z: 1.5 });
    v.d.contribute(text, interpretLocally(text));
    const erode = v.run(300, { x: 0, z: 2.6, facing: 'south' }, (c) => c.cue.type === 'erode');
    expect(erode).toBeTruthy();
    expect(erode!.cue.type === 'erode' && erode!.cue.keep).toBe('miss');
    expect(erode!.t).toBeGreaterThan(75);
    v.run(10, { x: 0, z: 2.6, facing: 'south' });
    const kin = v.of('sit:erosion').find((c) => c.cue.type === 'write');
    expect(kin && kin.cue.type === 'write' && kin.cue.beside).toBe('contrib:1:kept');
    // The engine keeps only the one word, never the whole text.
    expect(JSON.stringify(v.d.situations.snapshot())).not.toContain('used to be');
  });

  it('writing again while it waits begins it again with the newer words', () => {
    const v = new Visit(['erosion']);
    v.run(10, { x: 0, z: 1.5 });
    v.d.contribute('the blue kitchen', interpretLocally('the blue kitchen'));
    // Stay at that wall, so the first contribution cannot be rubbed out yet.
    v.run(150, { x: 0, z: 1.5, facing: 'north' });
    v.d.contribute('my grandmother laughing', interpretLocally('my grandmother laughing'));
    const erode = v.run(400, { x: 0, z: 2.6, facing: 'south' }, (c) => c.cue.type === 'erode');
    expect(erode && erode.cue.type === 'erode' && erode.cue).toMatchObject({ key: 'contrib:2', keep: 'grandmother' });
  });

  it('forgetting cancels it', () => {
    const v = new Visit(['erosion']);
    v.run(10, { x: 0, z: 1.5 });
    const text = 'the blue kitchen';
    v.d.contribute(text, interpretLocally(text));
    v.d.forgetContributions();
    v.run(300, { x: 0, z: 2.6, facing: 'south' });
    expect(v.cues.some((c) => c.cue.type === 'erode')).toBe(false);
  });
});

describe('situation runner', () => {
  it('different visits hold different situations', () => {
    const sets = new Set([1, 2, 3, 4, 5, 6].map((n) => Director.repertoire(n).map((d) => d.id).sort().join(',')));
    expect(sets.size).toBeGreaterThan(1);
    for (let n = 1; n <= 6; n++) expect(Director.repertoire(n).map((d) => d.id)).toContain('erosion');
  });

  it('generic rules never use the sounds a situation owns, and never more than two run at once', () => {
    const v = new Visit(['next-room', 'humming', 'listening', 'residue']);
    let maxActive = 0;
    v.run(700, (t) => {
      maxActive = Math.max(maxActive, v.d.situations.active.length);
      const a = t * 0.06;
      return { x: Math.sin(a) * 2.4, z: Math.cos(a) * 2.4, facing: (['north', 'east', 'south', 'west'] as Surface[])[Math.floor(a / (Math.PI / 2)) % 4] };
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    const owned = ['vf-laugh-next-room', 'vf-hum', 'vf-two-voices'];
    const leaks = v.cues.filter((c) => isVoice(c.cue) && owned.includes(c.cue.assetId ?? '') && !c.rule.startsWith('sit:'));
    expect(leaks).toEqual([]);
  });

  it('is deterministic', () => {
    const a = new Visit(['next-room', 'humming']);
    const b = new Visit(['next-room', 'humming']);
    a.run(400, { x: 0, z: 2.4 });
    b.run(400, { x: 0, z: 2.4 });
    expect(a.cues.map((c) => JSON.stringify(c))).toEqual(b.cues.map((c) => JSON.stringify(c)));
  });
});

describe('situation: the next room, its wall', () => {
  it("is always one with something happy on it, so following the laughter finds it", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const v = new Visit(['next-room'], seed);
      v.d.scenes.setAvailable(new Set());
      const first = v.run(240, { x: 0, z: 2.4, facing: 'east' }, (c) => isVoice(c.cue) && c.cue.tag === 'next-room');
      expect(first, `seed ${seed}`).toBeTruthy();
      const wall = (first!.cue as Extract<Cue, { type: 'voice' }>).position as { kind: 'beyond'; surface: Surface };
      expect(wall.surface, `seed ${seed}`).not.toBe('north');
    }
  });
});
