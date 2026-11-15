import { describe, expect, it } from 'vitest';
import { Room } from '../src/world/Room';
import type { Surface } from '../src/content/types';

const SURFACES: Surface[] = ['north', 'south', 'east', 'west', 'floor', 'ceiling'];

describe('Room.uvOf is the inverse of Room.local', () => {
  // (Only the two methods and what they read: a room's textures are not needed to measure it.)
  const frames = Object.fromEntries(SURFACES.map((s, i) => [s, { size: { w: 6.4 + i, h: 3.6 + i / 2 } }]));
  const room = { frames, scale: 1.07 } as unknown as Room;
  it.each(SURFACES)('%s', (s) => {
    for (const [u, v] of [[0, 0], [1.3, 2.2], [4.9, 0.7], [6.4, 3.6]]) {
      const back = Room.prototype.uvOf.call(room, s, Room.prototype.local.call(room, s, u, v));
      expect(back.u).toBeCloseTo(u, 9);
      expect(back.v).toBeCloseTo(v, 9);
    }
  });
});
