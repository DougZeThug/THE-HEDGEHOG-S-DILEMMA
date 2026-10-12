import { describe, it, expect } from 'vitest';
import { simulate, scripts } from './sim';

describe('EmotionalField — closeness is not one thing', () => {
  it('settled closeness becomes warmth; restless closeness stays exposed', () => {
    const settled = simulate(scripts.close, 90).d.field.v;
    const restless = simulate((t) => ({ ...scripts.close(t), yaw: Math.sin(t * 2) * 1.2 }), 90).d.field.v;
    expect(settled.warmth).toBeGreaterThan(settled.exposure);
    expect(restless.exposure).toBeGreaterThan(settled.exposure);
  });
  it('exposure rises, then subsides as a settled visitor acclimatises (non-monotonic)', () => {
    const r = simulate(scripts.close, 12);
    const early = r.d.field.v.exposure;
    simulate(scripts.close, 80, 7, 0.1, r.d);
    expect(r.d.field.v.exposure).toBeLessThan(early);
  });
  it('distance becomes solitude over time; withdrawal after exposure brings relief', () => {
    const far = simulate(() => ({ x: 2.6, z: 2.6 }), 120).d.field.v;
    expect(far.solitude).toBeGreaterThan(0.4);
    const r = simulate((t) => (t < 20 ? { z: 0.8, yaw: Math.sin(t * 3) } : { z: 2.8 }), 26);
    expect(r.d.field.v.relief).toBeGreaterThan(0.2);
  });
  it('stillness builds hush, movement breaks it quickly', () => {
    const r = simulate(scripts.still, 60);
    expect(r.d.field.v.hush).toBeGreaterThan(0.5);
    simulate((t) => ({ z: 2.4 - t * 0.5 }), 3, 7, 0.1, r.d);
    expect(r.d.field.v.hush).toBeLessThan(0.35);
  });
});
