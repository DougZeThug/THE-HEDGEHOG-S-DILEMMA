import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../src/world/Lighting';
import { LOOKS, lookFor, parseLook, neutralFor } from '../src/world/Style';
import type { Environment } from '../src/state/Director';

const env = { lightIntensity: 1, lightWarmth: 0, shadowDrift: 0, chairGlow: 0.2 } as unknown as Environment;
const settle = (l: Lighting, e = env) => {
  const chair = new THREE.Vector3();
  for (let t = 0; t < 40; t += 0.05) l.update(0.05, e, t, chair);
  return l;
};

describe('the room’s look', () => {
  it('reference unless asked; subtle is halfway', () => {
    expect(parseLook(null)).toBe('reference');
    expect(parseLook('nonsense')).toBe('reference');
    expect(parseLook('original')).toBe('original');
    const s = lookFor('subtle');
    for (const k of Object.keys(LOOKS.original) as (keyof typeof LOOKS.original)[]) {
      expect(s[k]).toBeCloseTo((LOOKS.original[k] + LOOKS.reference[k]) / 2, 6);
    }
  });

  it('original is the room’s light as it was', () => {
    const l = new Lighting('low');
    l.look = lookFor('original');
    settle(l);
    // The constants before the look existed: AREA 8, KEY 44, HEMI 1.15, and a near-white light.
    expect(l.area.intensity).toBeCloseTo(8, 3);
    expect(l.key.intensity).toBeCloseTo(44, 3);
    expect(l.hemi.intensity).toBeCloseTo(1.15, 3);
    expect(l.key.color.getHexString()).toBe(new THREE.Color('#fff8ee').getHexString());
  });

  it('the look belongs to the lit room: while the opening holds only the chair lit, it changes nothing', () => {
    const lit = (name: 'original' | 'reference') => {
      const l = new Lighting('low');
      l.look = lookFor(name);
      // The chair alone: the room's own light not yet up (OpeningScore: area 0, a little sky).
      Object.assign(l.score, { key: 0.45, area: 0, hemi: 0.1, glow: 0.5, cone: 0.7 });
      settle(l);
      return [l.key.intensity, l.key.angle, l.hemi.intensity, l.glow.intensity, l.area.intensity];
    };
    const a = lit('original'), b = lit('reference');
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 6);
  });

  it('warmth lives in the light, and the light still cools as far when the visitor comes close', () => {
    const cooled = (name: 'original' | 'reference') => {
      const l = new Lighting('low');
      l.look = lookFor(name);
      settle(l, { ...env, lightWarmth: -0.6 } as Environment);
      return l.key.color.r / l.key.color.b;
    };
    // At rest the reference is cream; cooled, it is no warmer than the original cooled.
    expect(neutralFor(1).r / neutralFor(1).b).toBeGreaterThan(neutralFor(0).r / neutralFor(0).b);
    expect(cooled('reference')).toBeCloseTo(cooled('original'), 3);
  });

  it('a dim still takes the room back to the chair: the room’s light falls by the same fraction', () => {
    for (const name of ['original', 'reference'] as const) {
      const l = new Lighting('low');
      l.look = lookFor(name);
      settle(l);
      const before = l.area.intensity + l.hemi.intensity * 10;
      l.dimToChair(0.3, 30, 40);
      const chair = new THREE.Vector3();
      for (let t = 40; t < 46; t += 0.05) l.update(0.05, env, t, chair);
      const after = l.area.intensity + l.hemi.intensity * 10;
      expect(after / before).toBeCloseTo(0.3, 2);
    }
  });
});
