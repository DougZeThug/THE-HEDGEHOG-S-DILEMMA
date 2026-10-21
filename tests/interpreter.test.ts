import { describe, it, expect } from 'vitest';
import { interpretLocally, tokenize } from '../src/interpret/LocalInterpreter';
import { validateInterpretation } from '../src/interpret/schema';

describe('LocalInterpreter', () => {
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
  it('does not glue "?" onto the final word of a question', () => {
    const a = interpretLocally('are you lonely?');
    expect(a.dims.isolation ?? 0).toBeGreaterThanOrEqual(0.9);
    expect(a.gestures).toContain('temperatureShift');
    expect(a.gestures).toContain('rearrange');
    expect(a.question).toBe(true);
    const b = interpretLocally('will you stay?');
    expect(b.dims.desire ?? 0).toBeGreaterThanOrEqual(1);
    expect(b.dims.connection ?? 0).toBeGreaterThan(0.4);
    expect(b.dims.fear ?? 0).toBeGreaterThan(0);
    expect(b.gestures).toContain('temperatureShift');
    const c = interpretLocally('do you remember?');
    expect(c.dims.nostalgia ?? 0).toBeGreaterThanOrEqual(1);
    expect(c.gestures).toContain('temperatureShift');
  });
  it('reads a question the same as its statement form when only the closing punctuation differs', () => {
    const pairs = [
      ['are you lonely?', 'are you lonely.'],
      ['will you stay?', 'will you stay.'],
      ['do you remember?', 'do you remember.'],
    ];
    for (const [q, s] of pairs) {
      const a = interpretLocally(q);
      const b = interpretLocally(s);
      expect(a, `${q} vs ${s}`).toEqual(b);
    }
  });
  it('still detects a question from a trailing "?" after stripping it from tokens', () => {
    const a = interpretLocally('lonely?');
    expect(a.question).toBe(true);
    expect(a.dims.isolation ?? 0).toBeGreaterThanOrEqual(0.9);
    expect(a.gestures).toContain('rearrange');
    expect(a.gestures).toContain('temperatureShift');
  });
});

describe('tokenize', () => {
  it('strips a trailing "?" from the final word', () => {
    expect(tokenize('are you lonely?')).toEqual(['are', 'you', 'lonely']);
    expect(tokenize('will you stay?')).toEqual(['will', 'you', 'stay']);
    expect(tokenize('do you remember?')).toEqual(['do', 'you', 'remember']);
  });
  it('strips "?" in the middle of the text', () => {
    expect(tokenize('what? why')).toEqual(['what', 'why']);
    expect(tokenize('a?b')).toEqual(['a', 'b']);
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
