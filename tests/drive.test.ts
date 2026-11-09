import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { DRIVE, DRIVE_AT, DRIVE_BEATS, DRIVE_PASSES, DRIVE_SECONDS, DRIVE_SECTIONS } from '../src/memory/defs';
import { SCENE_MEMORIES, HEART_IDS, heartOf } from '../src/content/memories';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { DRIVE_FROM, uprightAt } from '../src/memory/living/drive';
import { compose } from '../src/memory/compose';
import { StreetLight } from '../src/world/StreetLight';
import { Lighting } from '../src/world/Lighting';
import type { Environment } from '../src/state/Director';

/** The Drive Home in the room (docs/drive-home.md). */
const ROOT = join(__dirname, '..');
const film = readFileSync(join(ROOT, 'scripts/the-drive-home/film.py'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/memories/drive/manifest.json'), 'utf8'));
const seed = DRIVE.seed('film');
const track = (k: string) => seed.tracks[k] as [number, number, string?][];
/** A track's value at t (straight between keys, held after a 'hold'). */
const at = (k: string, t: number) => {
  const ks = track(k);
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++)
    if (t <= ks[i][0]) return ks[i - 1][2] === 'hold' ? ks[i - 1][1] : ks[i - 1][1] + ((ks[i][1] - ks[i - 1][1]) * (t - ks[i - 1][0])) / (ks[i][0] - ks[i - 1][0]);
  return ks[ks.length - 1][1];
};

describe('The Drive Home on its timeline', () => {
  it('opens from "Are you angry with me?", reserved, counted once the vent is turned, never cut before the carry', () => {
    const m = SCENE_MEMORIES.find((x) => x.id === 'drive')!;
    expect(PHRASE_BY_ID.get(m.phraseId)!.text).toBe('Are you angry with me?');
    expect(m.reserved).toBe(true);
    expect(m.seenAt!).toBeGreaterThanOrEqual(DRIVE_BEATS.vent);
    expect(m.minHold).toBeGreaterThanOrEqual(DRIVE_BEATS.lamp2);
    expect(m.maxHold).toBe(DRIVE_SECTIONS.exit);
    expect(m.span).toBe(DRIVE_SECTIONS.end);
    // Only ever a heart: no phase offers it otherwise.
    expect(m.offer!.phases).toEqual([]);
  });

  it("is the room's cut of the film: from film.py's ROOM_FROM, every frame there, its seconds the film's", () => {
    expect(Number(film.match(/^ROOM_FROM = ([\d.]+)/m)![1])).toBe(DRIVE_FROM);
    expect(DRIVE_AT).toBe(DRIVE_FROM);
    expect(manifest.living.film.frames / manifest.living.film.fps).toBeCloseTo(DRIVE_SECONDS, 6);
    // The film's own moments, as film.py has them (its lamps, the indicator).
    expect(film).toContain('lamps=[(7.8, 1.0), (9.8, 0.8)]');
    expect(film).toContain('lamps=[(13.6, 1.0)]');
    expect(Number(film.match(/^BLINK_ON, BLINK_HZ = ([\d.]+)/m)![1])).toBe(DRIVE_BEATS.indicator);
    // Memory s = film s once it plays.
    for (const t of [DRIVE_AT, 20, 40]) expect(at('scene.film', t) + DRIVE_FROM).toBeCloseTo(t, 6);
  });

  it('three streetlights, the first silent, the third crossing as the film\'s own lamp; the faces found one pass at a time', () => {
    expect(DRIVE_PASSES.length).toBe(3);
    const [p1, p2, p3] = DRIVE_PASSES;
    const wall = DRIVE.markers.find((m) => m.label === 'music:wall')!.position;
    expect(wall).toBeGreaterThan(p1[1]);
    expect(wall).toBeLessThan(p2[0] + 0.5);
    // The third is crossing the wall's middle while the film's lamp crosses the picture (7.8-8.7).
    expect((p3[0] + p3[1]) / 2).toBeGreaterThan(DRIVE_BEATS.lamp);
    expect((p3[0] + p3[1]) / 2).toBeLessThan(DRIVE_BEATS.lamp + 0.9);
    // The film is on the wall before the third, and the carry in waits for it.
    expect(DRIVE_AT).toBeLessThan(p3[0]);
    expect(track('scene.immerse').find(([, v]) => v > 0)![0]).toBeGreaterThanOrEqual(p3[1]);
    // Found grows only as a light crosses, never between: each pass leaves more.
    let last = -1;
    for (const [, e] of DRIVE_PASSES) {
      const f = at('window.found', e);
      expect(f).toBeGreaterThan(last);
      last = f;
    }
    expect(last).toBe(1);
    for (let i = 1; i < DRIVE_PASSES.length; i++) expect(at('window.found', DRIVE_PASSES[i][0])).toBeCloseTo(at('window.found', DRIVE_PASSES[i - 1][1]), 6);
    // The street's phase: each pass one whole number.
    for (const [i, [s, e]] of DRIVE_PASSES.entries()) {
      expect(at('room.street', s)).toBe(i);
      expect(at('room.street', e)).toBe(i + 1);
    }
  });

  it('goes back into the wall: carried out as the car goes, the tail lamps into the plaster, the relay on while the night lifts, then the light to the visitor', () => {
    const S = DRIVE_SECTIONS;
    expect(at('scene.immerse', S.exit)).toBe(1);
    expect(at('scene.immerse', DRIVE_BEATS.away + 4.5)).toBe(0);
    expect(at('layer:scene.opacity', S.residue)).toBe(0);
    const relay = DRIVE.markers.find((m) => m.label === 'music:relay')!.position;
    // The relay comes in under the film's fade (48.4) and runs on alone past the picture.
    expect(relay).toBeLessThan(48.4);
    expect(at('room.night', S.residue - 0.5)).toBe(1);
    expect(at('room.night', 57.5)).toBe(0);
    // The light comes to them as the relay stops (its last tick about 57.4: room-sound.sh), inside the memory.
    const lean = track('room.lean').find(([, v]) => v >= 0.5)![0];
    expect(lean).toBeGreaterThan(57);
    expect(lean).toBeLessThan(S.end);
  });

  it('is let go cleanly: the night lifts with the way out, no streetlight is left crossing, the light never comes after a let go', () => {
    const base = { 'room.night': 1, 'room.street': 1.4, 'room.lean': 1 };
    const kept = compose(base, { emerge: 1, exit: 1 }, { presence: 1, parallax: 1, motion: 1 }, true);
    expect(kept['room.street']).toBe(1.4);
    expect(kept['room.lean']).toBe(1);
    const gone = compose(base, { emerge: 1, exit: 0.2 }, { presence: 1, parallax: 1, motion: 1 }, true);
    expect(gone['room.night']).toBe(0);
    expect(gone['room.street']).toBe(1);
    expect(gone['room.lean']).toBe(0);
  });

  it('an upright screen holds each shot still across its cuts, and pans only within the second two-shot', () => {
    for (let t = 0; t < DRIVE_SECONDS; t += 0.1) {
      const d = Math.abs(uprightAt(t + 0.1)[0] - uprightAt(t)[0]);
      const film = t + DRIVE_FROM;
      const cut = [10.9, 16.9, 21.4, 25.9, 29.9, 34.3, 37.8, 40.8, 44.0].some((c) => film < c && film + 0.1 >= c);
      if (!cut) expect(d, `${film.toFixed(1)}`).toBeLessThan(0.03);
    }
    expect(uprightAt(38.3 - DRIVE_FROM)[0]).toBeGreaterThan(0.6);
    expect(uprightAt(40.6 - DRIVE_FROM)[0]).toBeLessThan(0.3);
  });

  it('under reduced motion, the pan is a cut at its middle', () => {
    for (let t = 0; t < DRIVE_SECONDS; t += 0.1) {
      const d = Math.abs(uprightAt(t + 0.1, true)[0] - uprightAt(t, true)[0]);
      const film = t + DRIVE_FROM;
      if (d > 1e-9) expect([10.9, 16.9, 21.4, 25.9, 29.9, 34.3, 37.8, 39.35, 40.8, 44.0].some((c) => film < c && film + 0.1 >= c), `${film.toFixed(2)}`).toBe(true);
    }
    expect(uprightAt(39.0 - DRIVE_FROM, true)[0]).toBe(0.72);
    expect(uprightAt(39.7 - DRIVE_FROM, true)[0]).toBe(0.24);
  });

  it('a screen reader is told what is there as the film begins, and the next line well after', () => {
    const said = DRIVE.describe('film');
    expect(said).toMatch(/two men/i);
    expect(said).not.toMatch(/streetlight/i);
    const lines = DRIVE.announce!('film');
    expect(lines[0].at - DRIVE_SECTIONS.active).toBeGreaterThanOrEqual(3.5);
    for (let i = 1; i < lines.length; i++) expect(lines[i].at - lines[i - 1].at).toBeGreaterThanOrEqual(3.5);
  });
});

describe('the recoil\'s heart on a return visit', () => {
  it('is Almost on a first visit, The Drive Home once Almost has been seen more, Almost again on a tie', () => {
    expect(HEART_IDS.has('drive')).toBe(true);
    expect(heartOf('recoiled', {}, 0.99)).toBe('almost');
    expect(heartOf('recoiled', { almost: 1 }, 0.01)).toBe('drive');
    expect(heartOf('recoiled', { almost: 1, drive: 1 }, 0.99)).toBe('almost');
    expect(heartOf('recoiled', { almost: 2, drive: 1 }, 0.5)).toBe('drive');
    // The others are as they were.
    expect(heartOf('refused', { things: 4 }, 0.5)).toBe('things');
  });
});

describe('the streetlights across the wall', () => {
  const s = new StreetLight();
  s.place({ group: new THREE.Group(), minX: -3.1, maxX: 3.1, minY: -1.7, maxY: 1.7 });
  it('cross from the right to the left, coming in and going off whole, quick at the edges and slowest in the middle', () => {
    expect(s.band(0)).toBeNull();
    expect(s.band(1)).toBeNull();
    const xs = [0.01, 0.25, 0.5, 0.75, 0.99].map((f) => s.band(1 + f)!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1]);
    expect(xs[0]).toBeGreaterThan(3.2);
    expect(xs[4]).toBeLessThan(-3.2);
    expect(Math.abs(xs[2])).toBeLessThan(1e-6);
    const speed = (f: number) => Math.abs(s.band(1 + f + 0.01)!.x - s.band(1 + f)!.x);
    expect(speed(0.5)).toBeLessThan(speed(0.05));
  });
  it('under reduced motion, none crosses', () => {
    s.reducedMotion = true;
    expect(s.band(1.5)).toBeNull();
    s.reducedMotion = false;
  });
});

describe("the room's light, at the end", () => {
  const env = { lightIntensity: 1, lightWarmth: 0, shadowDrift: 0, chairGlow: 0.2 } as unknown as Environment;
  const chair = new THREE.Vector3(0, 0, 0);
  const run = (l: Lighting, from: number, s: number) => {
    for (let i = 0; i < s * 30; i++) l.update(1 / 30, env, from + i / 30, chair, 0);
  };
  it('comes to the visitor first, stays a moment, then goes back to the chair by itself', () => {
    const l = new Lighting('low');
    run(l, 0, 2);
    const rest = l.key.target.position.clone();
    const by = new THREE.Vector3(3.15, 1.2, 0.5);
    l.leanTo(by, 2);
    run(l, 2, 8);
    expect(l.key.target.position.distanceTo(by)).toBeLessThan(0.05);
    expect(l.leanNow).toBe(1);
    run(l, 10, 20);
    expect(l.leanNow).toBeGreaterThan(0);
    expect(l.leanNow).toBeLessThan(1);
    run(l, 30, 15);
    expect(l.leanNow).toBe(0);
    expect(l.key.target.position.distanceTo(rest)).toBeLessThan(0.01);
  });
  it('goes back to the chair over a moment, not at once, when another memory begins', () => {
    const l = new Lighting('low');
    run(l, 0, 2);
    l.leanTo(new THREE.Vector3(3.15, 1.2, 0.5), 2);
    run(l, 2, 8);
    l.leanHome(10, 2.5);
    run(l, 10, 1);
    expect(l.leanNow).toBeGreaterThan(0.2);
    expect(l.leanNow).toBeLessThan(1);
    run(l, 11, 2);
    expect(l.leanNow).toBe(0);
  });
  it('is night while a memory holds it, and lets it go; returning, it is the room\'s at once', () => {
    const l = new Lighting('low');
    run(l, 0, 2);
    const day = l.area.color.clone();
    l.night = 1;
    run(l, 2, 5);
    expect(l.area.color.b / l.area.color.r).toBeGreaterThan(day.b / day.r + 0.05);
    l.leanTo(new THREE.Vector3(3, 1, 0), 7);
    l.cancelDim();
    run(l, 7, 0.1);
    expect(l.leanNow).toBe(0);
    expect(l.area.color.b / l.area.color.r).toBeCloseTo(day.b / day.r, 2);
  });
});
