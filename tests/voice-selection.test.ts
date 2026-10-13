import { describe, it, expect } from 'vitest';
import { chooseSource } from '../src/audio/selection';
import { rankPerformances } from '../src/state/performance';
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
  it('"I wanted you to stay": warm → asking, tense and jarring → abandoned, alone and exposed → breaking', () => {
    // Warm: the affectionate request — or the tender take the artist approved back in.
    expect(['stay--asking', 'stay--tender']).toContain(rankPerformances('stay', field({ warmth: 0.9, hush: 0.3 }))[0].id);
    expect(rankPerformances('stay', field({ tension: 0.8, dissonance: 0.5 }))[0].id).toBe('stay--abandoned');
    expect(rankPerformances('stay', field({ solitude: 0.8, exposure: 0.5, hush: 0.5 }))[0].id).toBe('stay--breaking');
    // Retired takes come last, whatever the room is like (they only play if approved back into the manifest).
    expect(rankPerformances('stay', field({ reminiscence: 1 })).slice(0, 3).map((p) => p.id).sort()).toEqual(['stay--abandoned', 'stay--asking', 'stay--breaking']);
  });
  it('each reading of the three central lines wins in some state of the room', () => {
    const states = [{ warmth: 0.9 }, { tension: 0.9, dissonance: 0.6 }, { solitude: 0.9, exposure: 0.6 }, { reminiscence: 0.9, solitude: 0.8 }, { warmth: 0.8, relief: 0.6 },
      { tension: 0.8, exposure: 0.8 }, { hush: 0.9, tension: 0.4 }, { reminiscence: 0.9, warmth: 0.8 }, { dissonance: 0.9, reminiscence: 0.5 }, { reminiscence: 1, solitude: 1 }];
    for (const id of ['stay', 'love-go-away', 'happy-then']) {
      const winners = new Set(states.map((s) => rankPerformances(id, field(s))[0].id));
      expect(winners.size, id).toBeGreaterThanOrEqual(3);
    }
  });
  it('the manner the room asks for matters when the field is undecided', () => {
    expect(rankPerformances('closer', field({}), 'flat')[0].id).toBe('closer--flat');
    expect(rankPerformances('closer', field({}), 'whisper')[0].id).toBe('closer--quiet');
  });
  it('the Director puts the chosen performance in a typed cue, with the exact authored caption', () => {
    const d = new Director({ seed: 1, situations: ['residue'] });
    Object.assign(d.field.v, field({ solitude: 0.9, exposure: 0.6 }));
    (d as unknown as { voice: (...a: unknown[]) => void }).voice('t', 0, 'tender', 'I wanted you to stay.', 'I wanted you to stay.', { kind: 'chair' }, { phraseId: 'stay' });
    const cue = d.scheduler.pending().at(-1)!.payload.cue as Extract<Cue, { type: 'voice' }>;
    expect(cue.performance).toBe('stay--breaking');
    expect(cue.performances?.[0]).toBe('dialogue/stay--breaking.mp3');
    expect(cue.caption).toBe('I wanted you to stay.');
  });
  it('phrases without recordings, and non-verbal sounds, carry no performance', () => {
    const d = new Director({ seed: 1, situations: ['residue'] });
    (d as unknown as { voice: (...a: unknown[]) => void }).voice('t', 0, 'whisper', 'stay', 'stay', { kind: 'chair' }, { phraseId: 'w-stay' });
    expect((d.scheduler.pending().at(-1)!.payload.cue as Extract<Cue, { type: 'voice' }>).performance).toBeUndefined();
  });
});
