import { describe, it, expect } from 'vitest';
import { interpretLocally, tokenize } from '../src/interpret/LocalInterpreter';
import { validateInterpretation } from '../src/interpret/schema';

describe('LocalInterpreter', () => {
  it('a question mark is not part of the last word', () => {
    expect(tokenize('are you lonely?')).toEqual(['are', 'you', 'lonely']);
    const q = interpretLocally('are you lonely?');
    expect(q.dims.isolation ?? 0).toBeCloseTo(interpretLocally('are you lonely.').dims.isolation ?? 0, 5);
    expect(q.dims.isolation ?? 0).toBeGreaterThan(0.2);
  });
  it('reads tense and longing, not just valence', () => {
    const it1 = interpretLocally('I miss who I used to be.');
    expect(it1.tense).toBe('past');
    expect(it1.dims.nostalgia ?? 0).toBeGreaterThan(0.4);
    expect(it1.dims.self ?? 0).toBeGreaterThan(0);
    expect(it1.gestures).toContain('distantRecollection');
    expect(it1.related.length).toBeGreaterThan(0);
  });
  it('negation makes a feeling ambivalent rather than inverting it', () => {
    const a = interpretLocally("I'm not lonely");
    expect(a.dims.isolation ?? 0).toBeGreaterThan(0.2);
    expect(a.dims.contradiction ?? 0).toBeGreaterThan(0.2);
  });
  it('happy words are material, not a cue for a tune', () => {
    const a = interpretLocally('we laughed all summer');
    expect(a.gestures).not.toContain('music');
    expect(a.gestures).toContain('temperatureShift');
    expect(a.related.some((id) => ['summer', 'laugh', 'laugh-breathe', 'good-day', 'happy-then'].includes(id))).toBe(true);
  });
  it('treats unknown words as ordinary objects with memory', () => {
    const a = interpretLocally('blue bicycle');
    expect(a.dims.nostalgia ?? 0).toBeGreaterThan(0);
    expect(a.gestures).toContain('writeOnWall');
  });
  it('questions become uncertainty and rearrangement', () => {
    const a = interpretLocally('why did you go?');
    expect(a.question).toBe(true);
    expect(a.gestures).toContain('rearrange');
  });
});

describe('validateInterpretation', () => {
  it('rejects junk and strips unsafe fields', () => {
    expect(validateInterpretation(null)).toBeNull();
    expect(validateInterpretation({})).toBeNull();
    const v = validateInterpretation({
      dims: { grief: 4, hacking: 1, fear: -2, joy: 'x' },
      related: ['stay', 'not-a-phrase', 'stay', 42],
      gestures: ['quiet', 'eval(alert(1))', 'quiet'],
      intensity: 7,
      script: 'document.body.remove()',
    })!;
    expect(v.dims).toEqual({ grief: 1 });
    expect(v.related).toEqual(['stay']);
    expect(v.gestures).toEqual(['quiet']);
    expect(v.intensity).toBe(1);
    expect((v as unknown as Record<string, unknown>).script).toBeUndefined();
  });
});
