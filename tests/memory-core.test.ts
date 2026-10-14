import { describe, it, expect } from 'vitest';
import gsap from 'gsap';
import { compose, FULL, weightsFor } from '../src/memory/compose';
import { lifeTimeline, leaveTimeline } from '../src/memory/behaviours';
import { CueDispatch } from '../src/memory/cueDispatch';
import { MemoryPlaybackController, type AudioSink } from '../src/memory/MemoryPlaybackController';
import type { Marker, Sections, TimelineSource, Values } from '../src/memory/types';

/** A linear stand-in for Theatre: reveal and opacity ramp over the emergence. */
function fakeTimeline(sections: Sections, markers: Marker[] = []): TimelineSource & { disposed: boolean; positions: number[] } {
  const f = {
    sections,
    markers,
    disposed: false,
    positions: [] as number[],
    at(p: number): Values {
      f.positions.push(p);
      const k = Math.min(1, p / sections.active);
      return { 'window.reveal': k, 'layer:bowl.opacity': k, 'layer:curtain.x': 0, 'light.intensity': 1, 'window.residue': 1 };
    },
    dispose() {
      f.disposed = true;
    },
  };
  return f;
}

function fakeAudio() {
  const log: string[] = [];
  const sink: AudioSink & { log: string[]; live: number } = {
    log,
    live: 0,
    play(due) {
      for (const d of due) {
        log.push(`play ${d.marker.label}`);
        sink.live++;
      }
    },
    release(mode, fade) {
      log.push(`release ${mode} ${fade.toFixed(2)}`);
    },
    pause() {
      log.push('pause');
    },
    resume() {
      log.push('resume');
    },
    seek(p) {
      log.push(`seek ${p}`);
    },
    dispose() {
      log.push('dispose');
      sink.live = 0;
    },
  };
  return sink;
}

const SECTIONS: Sections = { active: 6, exit: 16, residue: 20, end: 24 };

function controller(extra: Partial<ConstructorParameters<typeof MemoryPlaybackController>[0]> = {}) {
  const timeline = fakeTimeline(SECTIONS, [
    { label: 'sfx:spoon', position: 7 },
    { label: 'bed:kitchen', position: 4 },
    { label: 'sfx:after', position: 18 },
  ]);
  const audio = fakeAudio();
  const states: string[] = [];
  const c = new MemoryPlaybackController({
    timeline,
    audio,
    weights: FULL,
    reduced: false,
    entrance: 1.5,
    sways: [{ key: 'sway:curtain.x', amp: 0.02, period: 5, at: 6 }],
    exit: 1.2,
    residue: { rise: 1.5, hold: 3, fall: 3 },
    maxHold: 40,
    tail: 2,
    onState: (s) => states.push(s),
    ...extra,
  });
  return { c, timeline, audio, states };
}

const run = (c: MemoryPlaybackController, seconds: number, dt = 0.05) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) c.step(dt);
};

describe('compose: one writer per field', () => {
  it('opacity is base × emerge × exit × presence; the dissolve takes the reveal, then the graphite; offsets add motion', () => {
    const base = { 'layer:bowl.opacity': 0.8, 'layer:curtain.x': 0.1, 'window.parallax': 1, 'light.intensity': 2, 'window.reveal': 1, 'window.sketch': 1 };
    const env = { emerge: 0.5, dissolve: 0.25, exit: 1, 'sway:curtain.x': 0.02 };
    const f = compose(base, env, FULL);
    expect(f['layer:bowl.opacity']).toBeCloseTo(0.8 * 0.5, 6);
    expect(f['window.reveal']).toBeCloseTo(1 - 0.25 / 0.7, 6);
    expect(f['window.sketch']).toBe(1); // still there while the colour goes
    const late = compose(base, { ...env, dissolve: 0.7 }, FULL);
    expect(late['window.reveal']).toBe(0); // the colour has gone with the light…
    expect(late['window.sketch']).toBeCloseTo(1 - 0.05 / 0.35, 6); // …and the drawing stands alone
    expect(f['layer:curtain.x']).toBeCloseTo(0.12, 6);
    expect(f['light.intensity']).toBeCloseTo(1, 6);
    const r = compose(base, env, weightsFor(true, true));
    expect(r['layer:curtain.x']).toBeCloseTo(0.1, 6); // no procedural motion under reduced motion
    expect(r['window.parallax']).toBeCloseTo(0.25, 6);
    expect(r['layer:bowl.opacity']).toBeCloseTo(0.8 * 0.5 * 0.6, 6); // gentle presence
  });
});

describe('behaviours: paused GSAP timelines on the room clock', () => {
  it('seeking forward and back gives the same values; killing leaves nothing behind', () => {
    const before = gsap.globalTimeline.getChildren().length;
    const env: Values = {};
    const tl = lifeTimeline(env, { reduced: false, entrance: 2, sways: [{ key: 'sway:curtain.x', amp: 0.02, period: 4, at: 2 }] });
    expect(tl.paused()).toBe(true);
    expect(tl.labels.in).toBe(0);
    expect(tl.labels.living).toBe(2);
    const sample = (t: number) => (tl.time(t, true), [env.emerge, env['sway:curtain.x']]);
    const a = sample(3.1), b = sample(9), c = sample(3.1);
    expect(c).toEqual(a);
    expect(b[0]).toBe(1);
    tl.kill();
    expect(gsap.globalTimeline.getChildren().length).toBe(before);
  });

  it('a breath starts from stillness, never from its full amplitude', () => {
    const env: Values = {};
    const tl = lifeTimeline(env, { reduced: false, entrance: 2, sways: [{ key: 'sway:curtain.x', amp: 0.02, period: 4, at: 5 }] });
    for (const t of [0, 2, 4.9]) {
      tl.time(t, true);
      expect(env['sway:curtain.x']).toBe(0);
    }
    tl.time(5.4, true);
    expect(Math.abs(env['sway:curtain.x'])).toBeLessThan(0.005);
    tl.time(7, true);
    expect(env['sway:curtain.x']).toBeCloseTo(0.02, 6);
    tl.time(2, true); // seeking back is still again
    expect(env['sway:curtain.x']).toBe(0);
    tl.kill();
  });

  it('reduced motion: no sway at all, and a slower entrance', () => {
    const env: Values = {};
    const tl = lifeTimeline(env, { reduced: true, entrance: 2, sways: [{ key: 'sway:curtain.x', amp: 0.02, period: 4, at: 0 }] });
    tl.time(2, true);
    expect(env.emerge).toBeLessThan(1);
    tl.time(10, true);
    expect(env['sway:curtain.x']).toBe(0);
    tl.kill();
  });

  it('leaving: natural dissolves, interrupted exits; the residue rises and falls', () => {
    const env: Values = {};
    const nat = leaveTimeline(env, { reduced: false, mode: 'natural', dissolve: 4, exit: 1.2, residue: { rise: 1, hold: 2, fall: 2 } });
    nat.time(4, true);
    expect(env.dissolve).toBeCloseTo(1, 6);
    expect(env.exit).toBe(1);
    nat.time(2.4 + 1 + 1, true);
    expect(env.residue).toBeCloseTo(1, 3);
    nat.time(nat.duration(), true);
    expect(env.residue).toBeCloseTo(0, 3);
    nat.kill();
    const int = leaveTimeline(env, { reduced: false, mode: 'interrupt', dissolve: 4, exit: 1.2 });
    int.time(1.2, true);
    expect(env.exit).toBeCloseTo(0, 6);
    int.kill();
  });
});

describe('cue dispatch: every event once, never on a seek', () => {
  const M: Marker[] = [
    { label: 'a', position: 1 },
    { label: 'b', position: 2 },
    { label: 'c', position: 5 },
  ];
  it('hands out events inside the lookahead, once', () => {
    const d = new CueDispatch(M, 0.3);
    const got: string[] = [];
    for (let p = 0; p <= 6; p += 0.05) for (const x of d.advance(p)) got.push(`${x.marker.label}:${x.delay.toFixed(2)}`);
    expect(got.map((g) => g.split(':')[0])).toEqual(['a', 'b', 'c']);
    for (const g of got) expect(Number(g.split(':')[1])).toBeLessThanOrEqual(0.3 + 1e-9);
  });
  it('a jump plays nothing; seeking back re-arms what lies ahead', () => {
    const d = new CueDispatch(M, 0.3);
    d.advance(0);
    expect(d.advance(4.5)).toEqual([]); // a jump past a and b: heard, not played
    expect(d.advance(4.55).map((x) => x.marker.label)).toEqual([]);
    expect(d.advance(4.75).map((x) => x.marker.label)).toEqual(['c']);
    d.seek(0.5);
    const again: string[] = [];
    for (let p = 0.5; p <= 6; p += 0.05) for (const x of d.advance(p)) again.push(x.marker.label);
    expect(again).toEqual(['a', 'b', 'c']);
  });
  it('a stall while playing: one-shots it passed stay unheard, a bed or music it passed starts part-way in', () => {
    const d = new CueDispatch([{ label: 'bed:air', position: 1 }, { label: 'music:radio', position: 5.5 }, { label: 'sfx:spoon', position: 5.6 }], 0.3);
    const got: string[] = [];
    for (let p = 0; p < 5; p += 1 / 30) for (const x of d.advance(p)) got.push(x.marker.label);
    const jump = d.advance(5.9); // a 0.9 s frame
    expect(jump.map((x) => x.marker.label)).toEqual(['music:radio']);
    expect(jump[0].late).toBeCloseTo(0.4, 6);
    for (let p = 5.92; p < 8; p += 1 / 30) for (const x of d.advance(p)) got.push(x.marker.label);
    expect(got).toEqual(['bed:air']); // the spoon is never played late; the radio not twice
  });

  it('never past the hold: an event beyond where the scene holds waits for the release', () => {
    const d = new CueDispatch([{ label: 'late', position: 10.1 }], 0.3);
    for (let p = 9; p <= 10; p += 0.05) expect(d.advance(p, 10)).toEqual([]);
    expect(d.advance(10, 10)).toEqual([]);
    expect(d.advance(10.05, Infinity).map((x) => x.marker.label)).toEqual(['late']);
  });
});

describe('the playback controller: one clock, a clear lifecycle', () => {
  it('runs dormant → emerging → active, holds while the visitor stays, then withdraws naturally', () => {
    const { c, audio, states, timeline } = controller();
    c.start();
    expect(c.state).toBe('emerging');
    run(c, 7);
    expect(c.state).toBe('active');
    run(c, 20); // stays: the living scene holds at its end
    expect(c.state).toBe('active');
    expect(c.position).toBeLessThan(SECTIONS.exit);
    c.release('look-away');
    expect(c.state).toBe('withdrawing');
    run(c, 30);
    expect(c.state).toBe('complete');
    expect(states).toEqual(['emerging', 'active', 'withdrawing', 'residue', 'complete']);
    expect(audio.log.filter((l) => l.startsWith('play'))).toEqual(['play bed:kitchen', 'play sfx:spoon', 'play sfx:after']);
    expect(audio.log).toContain('release natural 4.00');
    expect(timeline.disposed).toBe(true);
  });

  it('an early look-away freezes the authored timeline and leaves gracefully, without the residue', () => {
    const { c, audio, states } = controller();
    c.start();
    run(c, 3);
    const frozen = c.position;
    c.release('look-away');
    run(c, 0.6);
    expect(c.position).toBe(frozen);
    expect(c.frame!.env.exit).toBeLessThan(1);
    run(c, 10);
    expect(c.state).toBe('complete');
    expect(states).toContain('residue');
    expect(audio.log.filter((l) => l.startsWith('play'))).toEqual([]); // the bed at 4 s never came
    expect(audio.log).toContain('release interrupt 1.20');
  });

  it('can be interrupted from every state, and a hard release ends it at once', () => {
    for (const at of [0.5, 7, 17, 21]) {
      const { c } = controller();
      c.start();
      run(c, at);
      if (at > 16) c.release('complete');
      if (at > 16) run(c, at - 16);
      c.release('depart');
      run(c, 0.4);
      // Withdrawing/residue + hard: disposed immediately; emerging/active + hard: a 0.3 s exit, then tails.
      run(c, 3);
      expect(c.state).toBe('complete');
    }
  });

  it('pause holds time, sound and image; resume carries on', () => {
    const { c, audio } = controller();
    c.start();
    run(c, 2);
    c.pause();
    const t = c.t;
    run(c, 5);
    expect(c.t).toBe(t);
    c.resume();
    run(c, 1);
    expect(c.t).toBeCloseTo(t + 1, 6);
    expect(audio.log).toEqual(expect.arrayContaining(['pause', 'resume']));
  });

  it('closes itself at its longest hold', () => {
    const { c } = controller({ maxHold: 12 });
    c.start();
    run(c, 12.1);
    expect(c.state).toBe('withdrawing');
  });

  it('scrubbing (the editor) never fires sound, in either direction', () => {
    const { c, audio } = controller();
    c.start();
    for (const p of [5, 18, 2, 23, 0]) c.scrub(p);
    expect(audio.log.filter((l) => l.startsWith('play'))).toEqual([]);
    expect(audio.log.filter((l) => l.startsWith('seek')).length).toBe(5);
    expect(c.scrub(18).state).toBe('withdrawing');
    expect(c.scrub(21).state).toBe('residue');
  });

  it("GSAP's ticker never runs a loop of its own, however the memory is stepped or scrubbed", async () => {
    const { c } = controller();
    c.start();
    run(c, 30);
    c.scrub(4);
    c.scrub(19);
    const frame = gsap.ticker.frame;
    await new Promise((r) => setTimeout(r, 150));
    expect(gsap.ticker.frame).toBe(frame);
    c.dispose();
  });

  it('a hundred rapid starts and stops leave no timelines and no sound behind', () => {
    const before = gsap.globalTimeline.getChildren().length;
    let live = 0;
    for (let i = 0; i < 100; i++) {
      const { c, audio } = controller();
      c.start();
      run(c, (i % 7) * 0.9);
      if (i % 3 === 0) c.release('switch');
      else c.dispose(0.1);
      run(c, 1);
      expect(c.state).toBe('complete');
      live += audio.live;
    }
    expect(live).toBe(0);
    expect(gsap.globalTimeline.getChildren().length).toBe(before);
  });
});
