import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SHADOWS } from '../src/memory/memories/shadows';
import { SHADOWS_AT, SHADOWS_BEATS, SHADOWS_SECONDS, SHADOWS_SECTIONS } from '../src/memory/beats/shadows';
import { SCENE_MEMORIES, HEART_BY_SHAPE, HEART_IDS, heartOf } from '../src/content/memories';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { shadowsAt, uprightAt } from '../src/memory/living/shadows';
import { compose } from '../src/memory/compose';
import { Lighting } from '../src/world/Lighting';
import type { Environment } from '../src/core/environment';

/** Memory VII, The Shape of Someone, in the room (docs/shadows.md). */
const seed = SHADOWS.seed('film');
const track = (k: string) => seed.tracks[k] as [number, number, string?][];
const at = (k: string, t: number) => {
  const ks = track(k);
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return ks[i - 1][1] + ((ks[i][1] - ks[i - 1][1]) * (t - ks[i - 1][0])) / (ks[i][0] - ks[i - 1][0]);
  return ks[ks.length - 1][1];
};

describe('Memory VII on its timeline', () => {
  it('opens from "You understood me once, completely, for about a minute.", reserved, counted once they meet', () => {
    const m = SCENE_MEMORIES.find((x) => x.id === 'shadows')!;
    expect(PHRASE_BY_ID.get(m.phraseId)!.text).toBe('You understood me once, completely, for about a minute.');
    expect(m.seenAt!).toBeGreaterThanOrEqual(SHADOWS_AT + SHADOWS_BEATS.meet - 0.5);
  });

  it('the film begins on the wall in the gathered shade, before the visitor is carried in, and ends as its light goes', () => {
    const film = track('scene.film');
    expect(film.find(([t]) => t === SHADOWS_AT)?.[1]).toBe(0);
    expect(film.find(([t]) => t === SHADOWS_AT + SHADOWS_SECONDS)?.[1]).toBe(SHADOWS_SECONDS);
    const imm = track('scene.immerse');
    const carried = imm.find(([, v], i) => v === 0 && imm[i + 1] && imm[i + 1][1] > 0)![0];
    expect(SHADOWS_AT).toBeLessThan(carried);
    // (the shade is all there, and the film's light has begun, before the way in)
    expect(at('window.reveal', carried)).toBe(1);
    // (out as its light goes: the film's last second under the way out)
    expect(SHADOWS_SECTIONS.exit).toBeGreaterThan(SHADOWS_AT + SHADOWS_BEATS.dark);
    expect(SHADOWS_SECTIONS.exit).toBeLessThanOrEqual(SHADOWS_AT + SHADOWS_SECONDS);
  });

  it("the chair's shadow moves first and goes home last; its lamp gives way to the film's light and comes back as it goes", () => {
    expect(track('room.shadow')[0][0]).toBeLessThan(track('window.reveal')[0][0]);
    expect(at('room.shadow', track('window.reveal')[0][0])).toBeGreaterThan(0);
    const out = track('window.reveal').filter(([t]) => t > SHADOWS_SECTIONS.exit);
    const shadowHome = track('room.shadow')[track('room.shadow').length - 1][0];
    expect(shadowHome).toBeGreaterThan(out[out.length - 1][0]);
    expect(shadowHome).toBeLessThanOrEqual(SHADOWS_SECTIONS.end);
    expect(at('room.shadow', out[out.length - 1][0])).toBe(1);
    expect(at('room.lamp', SHADOWS_AT + SHADOWS_BEATS.hold)).toBeLessThan(0.3);
    expect(at('room.lamp', SHADOWS_SECTIONS.exit + 2)).toBe(1);
    // Going, the words are uncovered first and held a breath before the rest goes.
    const r = track('window.reveal');
    expect(r.some(([t, v], i) => i > 0 && v > 0 && v < 1 && r[i - 1][1] === v && t > r[i - 1][0])).toBe(true);
  });

  it('let go early, the chair goes home with the way in (compose)', () => {
    const f = compose({ 'room.shadow': 1, 'room.lamp': 1 }, { emerge: 1, exit: 0 }, { presence: 1, parallax: 1, motion: 1 } as never, true);
    expect(f['room.shadow']).toBe(0);
    const g = compose({ 'room.shadow': 1 }, { emerge: 1, exit: 1 }, { presence: 1, parallax: 1, motion: 1 } as never, true);
    expect(g['room.shadow']).toBe(1);
  });
});

describe('Memory VII on an upright screen', () => {
  // (A 9:19.5 phone sees about a quarter of the film's width: ±0.12 round its focus.)
  const half = 0.12;
  it('follows her while they are far apart, and holds both of them once they meet', () => {
    for (const t of [0, 3, 6, 9, 11]) {
      const s = shadowsAt(t);
      if (s.gap > 0.4) expect(Math.abs(s.hers - uprightAt(t)[0]), `her at ${t}`).toBeLessThan(half);
    }
    for (const t of [12.6, 14.1, 15.5, 17]) {
      const s = shadowsAt(t), u = uprightAt(t)[0];
      expect(Math.abs(s.hers - u), `her at ${t}`).toBeLessThan(half);
      expect(Math.abs(s.his - u), `him at ${t}`).toBeLessThan(half);
    }
  });
  it('never jumps: under 2% of the frame a tenth of a second', () => {
    for (let t = 0; t < SHADOWS_SECONDS; t += 0.1) expect(Math.abs(uprightAt(t + 0.1)[0] - uprightAt(t)[0])).toBeLessThan(0.02);
  });
});

describe("the shared heart: someone who stayed by the chair", () => {
  it('is given the woodland or the shadows, whichever they have seen less; on a first visit by the coin', () => {
    expect(HEART_BY_SHAPE.close).toBe('woodland');
    expect(HEART_IDS.has('shadows')).toBe(true);
    expect(heartOf('close', {}, 0.2)).toBe('woodland');
    expect(heartOf('close', {}, 0.7)).toBe('shadows');
    expect(heartOf('close', { woodland: 1 }, 0.2)).toBe('shadows');
    expect(heartOf('close', { shadows: 1 }, 0.7)).toBe('woodland');
    // (The recoil's heart is Almost's while it has been seen no more than The Drive Home: tests/drive.test.ts.)
    expect(heartOf('recoiled', { almost: 3, drive: 3 }, 0.7)).toBe('almost');
    expect(heartOf('refused', {}, 0.7)).toBe('things');
  });
});

describe("the chair's shadow, held by a memory", () => {
  const env = { lightIntensity: 1, lightWarmth: 0, shadowDrift: 0, chairGlow: 0.2 } as unknown as Environment;
  const chair = new THREE.Vector3(0, 0, 0);
  const run = (l: Lighting, s: number) => {
    for (let i = 0; i < s * 30; i++) l.update(1 / 30, env, i / 30, chair, 0);
  };
  it('brings the key down behind the chair, on the line from the wall through it, aimed at the wall, then lets it go', () => {
    const l = new Lighting('low');
    run(l, 2);
    const rest = l.key.position.clone();
    const level = l.keyLevel;
    // The memory on the east wall (x = 3.2).
    l.memoryShadow.at.set(3.2, 1.3, 0.4);
    l.memoryShadow.amount = 1;
    run(l, 3);
    expect(l.key.position.y).toBeLessThan(0.6);
    expect(l.key.position.x).toBeLessThan(-0.9);
    expect(Math.abs(l.key.position.z + 0.4 * (l.key.position.x / 3.2) * -1)).toBeLessThan(0.15);
    expect(l.key.target.position.distanceTo(l.memoryShadow.at)).toBeLessThan(0.05);
    expect(l.key.angle).toBeLessThan(0.45);
    // (the chair's contact shade judges the room's key, not the lamp's)
    expect(l.keyLevel).toBeCloseTo(level, 2);
    l.memoryShadow.amount = 0;
    run(l, 20);
    expect(l.key.position.distanceTo(rest)).toBeLessThan(0.01);
  });
  it('goes round the chair, never through it, for a wall on the far side of the light', () => {
    const l = new Lighting('low');
    run(l, 1);
    l.memoryShadow.at.set(0, 1.3, -3.2);
    let least = Infinity;
    for (let a = 0; a <= 1; a += 0.05) {
      l.memoryShadow.amount = a;
      run(l, 0.5);
      least = Math.min(least, Math.hypot(l.key.position.x, l.key.position.z) + (l.key.position.y > 1 ? 0 : 1));
    }
    expect(l.key.position.z).toBeGreaterThan(0.9);
    void least;
  });
});
