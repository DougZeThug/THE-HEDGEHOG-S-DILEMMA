import type { Surface } from '../../src/content/types';

/**
 * Playtest personas: five ways of being in the room, as scripts of a body over time.
 * They are deliberately ordinary — nobody here is trying to "solve" the installation.
 *
 * Positions are chair-relative metres (chair at the origin, the door/spawn at z ≈ 2.5,
 * north wall at z = -3.2). `gaze` names the phrase attention rests on, as the browser's
 * attention test would report it; `tap` is a touch on writing or on the chair.
 */
export interface Frame {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  gaze: string | null;
  gazeChair: boolean;
  kneeling: boolean;
  /** A tap on this phrase / on the chair, this tick. */
  tap?: { phrase?: string; chair?: boolean };
}

export interface Persona {
  id: string;
  label: string;
  /** Input device, for the report. */
  device: 'desktop' | 'phone';
  frame(t: number): Frame;
}

const SPAWN = { x: 0.15, z: 2.55 };
/** Yaw that faces each wall (0 = north, +π/2 = west). */
const YAW: Record<Surface, number> = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2, floor: 0, ceiling: 0 };

type Seg = { until: number; at?: [number, number]; to?: [number, number]; face?: Surface; gaze?: string | null; chair?: boolean; kneel?: boolean; tap?: 'phrase' | 'chair'; look?: number };

/** Piecewise script: walk linearly between points, face a wall, rest attention on a phrase. */
function scripted(segs: Seg[]): (t: number) => Frame {
  return (t) => {
    let start = 0;
    let from: [number, number] = [SPAWN.x, SPAWN.z];
    for (const s of segs) {
      const a = s.at ?? from;
      if (t < s.until) {
        const k = s.to ? Math.min(1, (t - start) / Math.max(0.1, s.until - start)) : 0;
        const p = s.to ? [a[0] + (s.to[0] - a[0]) * k, a[1] + (s.to[1] - a[1]) * k] : a;
        const face = s.face ?? 'north';
        const look = s.look ? Math.sin(t * 0.7) * s.look : 0;
        // Taps happen on the first tick of a segment.
        const tap = s.tap && t - start < 0.1 ? (s.tap === 'chair' ? { chair: true } : { phrase: s.gaze ?? undefined }) : undefined;
        return {
          x: p[0], z: p[1], yaw: s.chair ? Math.atan2(p[0], p[1]) : YAW[face] + look, pitch: s.chair ? -0.45 : -0.04,
          gaze: s.gaze ?? null, gazeChair: !!s.chair, kneeling: !!s.kneel, tap,
        };
      }
      from = s.to ?? a;
      start = s.until;
    }
    return { x: from[0], z: from[1], yaw: 0, pitch: 0, gaze: null, gazeChair: false, kneeling: false };
  };
}

/** 1. Enters and hardly moves: stands at the door, looks at what is in front, turns its head now and then. */
export const stillVisitor: Persona = {
  id: 'still',
  label: 'Hardly moves',
  device: 'desktop',
  frame: scripted([
    { until: 6, face: 'north' },
    { until: 16, face: 'north', gaze: 'stay' },
    { until: 30, face: 'north', look: 0.02 },
    { until: 38, face: 'north', gaze: 'closer' },
    { until: 70, face: 'north' },
    { until: 76, face: 'north', chair: true },
    { until: 120, face: 'north' },
    { until: 128, face: 'north', gaze: 'stay' },
    { until: 400, face: 'north' },
  ]),
};

/** 2. Actively explores: keeps walking, turns to each wall, glances at writing without settling for long. */
export const explorer: Persona = {
  id: 'explorer',
  label: 'Actively explores',
  device: 'desktop',
  frame: (t) => {
    // A loop round the room, about 50 s a lap, glancing at whatever is on the wall it passes.
    const a = t * 0.125;
    const x = Math.sin(a) * 2.3, z = Math.cos(a) * 2.3;
    const walls: Surface[] = ['north', 'east', 'south', 'west'];
    const face = walls[Math.floor(((a / (Math.PI * 2)) * 4 + 0.5) % 4)];
    const glance: Record<string, string[]> = {
      north: ['stay', 'closer', 'together', 'not-going'],
      east: ['happy-then', 'good-day', 'laugh', 'summer'],
      south: ['arm-dead', 'alone-ok'],
      west: ['why-understand', 'im-fine', 'angry-with-me', 'laugh-breathe'],
    };
    // Glances of ~3 s every ~7 s.
    const g = Math.floor(t / 7);
    const gaze = t % 7 < 3 ? glance[face][g % glance[face].length] : null;
    // Crosses the middle (and so passes the chair) once a minute.
    const cross = t % 60 > 40 && t % 60 < 48;
    return {
      // Head turning as it walks: glancing about, not a tripod.
      x: cross ? x * 0.3 : x, z: cross ? z * 0.3 : z, yaw: YAW[face] + Math.sin(t * 0.9) * 0.6, pitch: -0.05, gaze: cross ? null : gaze, gazeChair: cross, kneeling: false,
    };
  },
};

/** 3. Goes straight to the chair: arrives in seconds, looks at it, kneels, stands, steps back, returns. */
export const chairFirst: Persona = {
  id: 'chair',
  label: 'Approaches the chair at once',
  device: 'desktop',
  frame: scripted([
    { until: 3, to: [0.1, 0.9], face: 'north', chair: true },
    { until: 12, at: [0.1, 0.9], chair: true },
    { until: 30, at: [0.1, 0.9], chair: true, kneel: true },
    { until: 40, at: [0.1, 0.9], face: 'north', gaze: 'small-minute' },
    { until: 46, at: [0.1, 0.9], to: [0.6, 2.6], face: 'south' },
    { until: 60, at: [0.6, 2.6], chair: true },
    { until: 66, at: [0.6, 2.6], to: [0.2, 0.85], chair: true },
    { until: 100, at: [0.2, 0.85], chair: true },
    { until: 110, at: [0.2, 0.85], to: [-1.8, 1.8], face: 'west' },
    { until: 125, at: [-1.8, 1.8], face: 'west', gaze: 'why-understand' },
    { until: 135, at: [-1.8, 1.8], to: [0.2, 0.9], chair: true },
    { until: 400, at: [0.2, 0.9], chair: true },
  ]),
};

/** 4. Reads: walks to a wall and reads line after line, then another wall; comes back to a line already read. */
export const reader: Persona = {
  id: 'reader',
  label: 'Reads several phrases',
  device: 'desktop',
  frame: scripted([
    { until: 5, to: [1.6, 0.6], face: 'east' },
    { until: 12, at: [1.6, 0.6], face: 'east', gaze: 'happy-then' },
    { until: 18, face: 'east', gaze: 'good-day' },
    { until: 24, face: 'east', gaze: 'laugh' },
    { until: 30, face: 'east', gaze: 'summer' },
    { until: 36, face: 'east', gaze: 'cereal' },
    { until: 42, to: [0.2, -1.6], face: 'north' },
    { until: 50, at: [0.2, -1.6], face: 'north', gaze: 'stay' },
    { until: 56, face: 'north', gaze: 'closer' },
    { until: 62, face: 'north', gaze: 'together' },
    { until: 68, to: [-1.7, 0.2], face: 'west' },
    { until: 76, at: [-1.7, 0.2], face: 'west', gaze: 'why-understand' },
    { until: 82, face: 'west', gaze: 'im-fine' },
    { until: 88, face: 'west', gaze: 'angry-with-me' },
    { until: 94, face: 'west', gaze: 'laugh-breathe' },
    { until: 100, to: [0.2, -1.6], face: 'north' },
    // Back to a line already read: the second meeting.
    { until: 110, at: [0.2, -1.6], face: 'north', gaze: 'stay' },
    { until: 118, face: 'north', gaze: 'not-going' },
    { until: 126, to: [1.6, 0.6], face: 'east' },
    { until: 136, at: [1.6, 0.6], face: 'east', gaze: 'happy-then' },
    { until: 146, face: 'east', gaze: 'home' },
    { until: 160, to: [0.4, 2.4], face: 'south', gaze: null },
    { until: 172, at: [0.4, 2.4], face: 'south', gaze: 'arm-dead' },
    { until: 182, to: [-1.6, 0.4], face: 'west' },
    { until: 194, at: [-1.6, 0.4], face: 'west', gaze: 'why-understand' },
    { until: 210, to: [0.2, -1.6], face: 'north' },
    { until: 222, at: [0.2, -1.6], face: 'north', gaze: 'stay' },
    { until: 400, face: 'north', gaze: 'closer' },
  ]),
};

/**
 * 5. A phone, with touch: short drag-walks, lots of looking around, taps on writing
 * (which turns toward it and walks a little closer), a tap on the chair, a pause.
 * Attention is briefer and more scattered than with a mouse.
 */
export const phone: Persona = {
  id: 'phone',
  label: 'Phone, touch controls',
  device: 'phone',
  frame: scripted([
    { until: 4, face: 'north', look: 0.4 },
    { until: 7, face: 'north', gaze: 'stay', tap: 'phrase' },
    { until: 12, to: [0.2, 0.2], face: 'north', gaze: 'stay' },
    { until: 15, at: [0.2, 0.2], face: 'east', look: 0.3 },
    { until: 18, face: 'east', gaze: 'happy-then', tap: 'phrase' },
    { until: 24, to: [1.6, 0.2], face: 'east', gaze: 'happy-then' },
    { until: 27, at: [1.6, 0.2], face: 'east', gaze: 'laugh' },
    { until: 30, face: 'south', look: 0.5 },
    { until: 32, face: 'north', chair: true, tap: 'chair' },
    { until: 38, to: [0.4, 0.8], chair: true },
    { until: 44, at: [0.4, 0.8], chair: true },
    { until: 47, at: [0.4, 0.8], face: 'west', look: 0.4 },
    { until: 50, face: 'west', gaze: 'why-understand', tap: 'phrase' },
    { until: 56, to: [-1.6, 0.4], face: 'west', gaze: 'why-understand' },
    { until: 60, at: [-1.6, 0.4], face: 'west', gaze: 'im-fine' },
    { until: 64, face: 'north', look: 0.3 },
    { until: 67, face: 'north', gaze: 'stay', tap: 'phrase' },
    { until: 74, to: [0.0, -1.5], face: 'north', gaze: 'stay' },
    { until: 80, at: [0.0, -1.5], face: 'north', gaze: 'closer' },
    { until: 84, face: 'east', look: 0.4 },
    { until: 87, face: 'north', chair: true, tap: 'chair' },
    { until: 92, to: [0.1, -0.7], chair: true },
    { until: 95, at: [0.1, -0.7], chair: true, tap: 'chair' },
    { until: 112, at: [0.1, -0.7], chair: true, kneel: true },
    { until: 116, at: [0.1, -0.7], face: 'south', look: 0.3 },
    { until: 120, to: [0.3, 2.3], face: 'south' },
    { until: 126, at: [0.3, 2.3], face: 'south', gaze: 'arm-dead', tap: 'phrase' },
    { until: 140, face: 'south', gaze: 'arm-dead' },
    { until: 150, face: 'east', look: 0.4 },
    { until: 154, face: 'east', gaze: 'good-day', tap: 'phrase' },
    { until: 160, to: [1.6, 0.8], face: 'east', gaze: 'good-day' },
    { until: 166, at: [1.6, 0.8], face: 'north', look: 0.3 },
    { until: 172, face: 'north', gaze: 'stay', tap: 'phrase' },
    { until: 180, to: [0.2, -1.5], face: 'north', gaze: 'stay' },
    { until: 400, at: [0.2, -1.5], face: 'north', look: 0.2 },
  ]),
};

export const PERSONAS: Persona[] = [stillVisitor, explorer, chairFirst, reader, phone];
