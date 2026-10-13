import { describe, it, expect } from 'vitest';
import { chooseSource } from '../src/audio/selection';
import { rankPerformances, performancesFor } from '../src/state/performance';
import { Director } from '../src/state/Director';
import type { FieldValues } from '../src/state/EmotionalField';
import type { Cue } from '../src/state/cues';

const field = (o: Partial<FieldValues>): FieldValues => ({ warmth: 0, exposure: 0, solitude: 0, relief: 0, tension: 0, reminiscence: 0, hush: 0, dissonance: 0, ...o });
const manifest = {
  'phrase:stay': ['dialogue/stay--tender.mp3', 'dialogue/stay--guarded.mp3'],
  'style:whisper': ['style-whisper-1.mp3'],
};
const base = { manifest, text: 'I wanted you to stay.', kind: 'tender', speechFallback: false, speechAvailable: true };

describe('where a voice comes from', () => {
  it('1. the performance chosen for this moment', () => {
    expect(chooseSource({ ...base, assetKey: 'phrase:stay', performances: ['dialogue/stay--guarded.mp3', 'dialogue/stay--tender.mp3'] }))
      .toEqual({ kind: 'recording', file: 'dialogue/stay--guarded.mp3', exact: true });
  });
  it('2. another recorded performance of the same phrase', () => {
    expect(chooseSource({ ...base, assetKey: 'phrase:stay', performances: ['dialogue/stay--remembered.mp3', 'dialogue/stay--tender.mp3'] }))
      .toEqual({ kind: 'recording', file: 'dialogue/stay--tender.mp3', exact: false });
  });
  it('a recording wins even when browser speech is turned on', () => {
    expect(chooseSource({ ...base, assetKey: 'phrase:stay', speechFallback: true }).kind).toBe('recording');
  });
  it('3. browser speech, only when enabled, for unrecorded lines', () => {
    expect(chooseSource({ ...base, assetKey: 'phrase:closer', speechFallback: true }).kind).toBe('speech');
    expect(chooseSource({ ...base, assetKey: 'phrase:closer', speechFallback: true, speechAvailable: false }).kind).toBe('synth');
    expect(chooseSource({ ...base, kind: 'laugh', assetKey: 'phrase:closer', speechFallback: true }).kind).toBe('synth');
  });
  it('4. a texture or synthesis when nothing intelligible exists', () => {
    expect(chooseSource({ ...base, kind: 'whisper', assetKey: 'phrase:closer' })).toEqual({ kind: 'texture', key: 'style:whisper' });
    expect(chooseSource({ ...base, assetKey: 'phrase:closer' }).kind).toBe('synth');
    expect(chooseSource({ ...base, assetKey: 'phrase:stay', synthOnly: true }).kind).toBe('synth');
  });
});

describe('performance follows the emotional field', () => {
  it('"I wanted you to stay": warm → tender, hushed → soft or whispered, alone and exposed → breaking or whispered', () => {
    expect(rankPerformances('stay', field({ warmth: 0.9, hush: 0.3 }))[0].id).toBe('stay--tender');
    // Hushed: a soft or whispered reading (the artist kept several whispered takes).
    expect(['stay--soft', 'stay--whispered', 'stay--whispered-b']).toContain(rankPerformances('stay', field({ hush: 0.9, tension: 0.4 }))[0].id);
    // Alone and exposed: a breaking or whispered reading (the artist prefers sadder and whispered takes).
    expect(['stay--breaking', 'stay--breaking-b', 'stay--after-silence', 'stay--breaking-lean', 'stay--whispered', 'stay--whispered-b']).toContain(rankPerformances('stay', field({ solitude: 0.8, exposure: 0.5, hush: 0.5 }))[0].id);
    // Rejected and not-yet-heard takes come last, whatever the room is like.
    const ranked = rankPerformances('stay', field({ tension: 0.8, dissonance: 0.5 }));
    const firstOut = ranked.findIndex((p) => p.retired || p.audition);
    expect(ranked.slice(firstOut).every((p) => p.retired || p.audition)).toBe(true);
    expect(ranked[0].id).not.toBe('stay--abandoned');
  });
  it('the readings in the room each win in some state of it', () => {
    const states = [{ warmth: 0.9 }, { tension: 0.9, dissonance: 0.6 }, { solitude: 0.9, exposure: 0.6 }, { reminiscence: 0.9, solitude: 0.8 }, { warmth: 0.8, relief: 0.6 },
      { tension: 0.8, exposure: 0.8 }, { hush: 0.9, tension: 0.4 }, { reminiscence: 0.9, warmth: 0.8 }, { dissonance: 0.9, reminiscence: 0.5 }, { reminiscence: 1, solitude: 1 }];
    for (const id of ['stay', 'love-go-away', 'happy-then']) {
      const winners = new Set(states.map((s) => rankPerformances(id, field(s))[0].id));
      // Every reading in the room can win (up to three); happy-then has two until its new takes are heard.
      expect(winners.size, id).toBeGreaterThanOrEqual(Math.min(3, performancesFor(id).length));
    }
  });
  it('the manner the room asks for matters when the field is undecided', () => {
    expect(rankPerformances('closer', field({}), 'flat')[0].id).toBe('closer--held');
    expect(rankPerformances('closer', field({}), 'whisper')[0].id).toBe('closer--quiet');
  });
  it('the Director puts the chosen performance in a typed cue, with the exact authored caption', () => {
    const d = new Director({ seed: 1, situations: ['residue'] });
    Object.assign(d.field.v, field({ solitude: 0.9, exposure: 0.6 }));
    (d as unknown as { voice: (...a: unknown[]) => void }).voice('t', 0, 'tender', 'I wanted you to stay.', 'I wanted you to stay.', { kind: 'chair' }, { phraseId: 'stay' });
    const cue = d.scheduler.pending().at(-1)!.payload.cue as Extract<Cue, { type: 'voice' }>;
    expect(['stay--breaking', 'stay--after-silence', 'stay--breaking-lean', 'stay--tears-loose']).toContain(cue.performance);
    expect(cue.performances?.[0]).toBe(`dialogue/${cue.performance}.mp3`);
    expect(cue.caption).toBe('I wanted you to stay.');
  });
  it('phrases without recordings, and non-verbal sounds, carry no performance', () => {
    const d = new Director({ seed: 1, situations: ['residue'] });
    (d as unknown as { voice: (...a: unknown[]) => void }).voice('t', 0, 'whisper', 'stay', 'stay', { kind: 'chair' }, { phraseId: 'w-stay' });
    expect((d.scheduler.pending().at(-1)!.payload.cue as Extract<Cue, { type: 'voice' }>).performance).toBeUndefined();
  });
});
