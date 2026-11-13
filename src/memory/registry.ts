import type { MemoryDef } from './memoryDef';
import type { FilmSpec } from './living/shared';
import type { LivingSpec } from './living/woodland';
import { CEREAL } from './memories/cereal';
import { BEDROOM } from './memories/bedroom';
import { DOOR } from './memories/door';
import { WOODLAND } from './memories/woodland';
import { ALMOST } from './memories/almost';
import { THINGS } from './memories/things';
import { SHADOWS } from './memories/shadows';
import { DRIVE } from './memories/drive';
import { WOODLAND as WOODLAND_RIG } from './living/woodland';
import { WOODLAND_FILM_SPEC } from './living/woodlandFilm';
import { ALMOST as ALMOST_FILM } from './living/almost';
import { THINGS as THINGS_FILM } from './living/things';
import { SHADOWS as SHADOWS_FILM } from './living/shadows';
import { DRIVE as DRIVE_FILM } from './living/drive';

/**
 * Every memory the room can play, in one place: its definition, and (if it is a living memory)
 * how its picture sits on a screen. An id that is not here is an error, never another memory's
 * framing.
 */
export interface MemoryEntry {
  def: MemoryDef;
  /** Where its film sits on a screen (src/memory/living/): the film variants. */
  film?: FilmSpec;
  /** The painted rig's involuntary life (the woodland's dormant painting). */
  rig?: LivingSpec;
}

/** A living memory (`def.living`) has a film or a rig to frame; any other has neither. */
export function defineMemory(e: MemoryEntry): MemoryEntry {
  const living = !!e.def.living;
  if (living !== !!(e.film || e.rig)) {
    throw new Error(`Memory "${e.def.id}": ${living ? 'is living but has no film or rig spec' : 'has a film or rig spec but is not living'}`);
  }
  return e;
}

const ENTRIES: MemoryEntry[] = [
  defineMemory({ def: CEREAL }),
  defineMemory({ def: BEDROOM }),
  defineMemory({ def: DOOR }),
  defineMemory({ def: WOODLAND, film: WOODLAND_FILM_SPEC, rig: WOODLAND_RIG }),
  defineMemory({ def: ALMOST, film: ALMOST_FILM }),
  defineMemory({ def: THINGS, film: THINGS_FILM }),
  defineMemory({ def: SHADOWS, film: SHADOWS_FILM }),
  defineMemory({ def: DRIVE, film: DRIVE_FILM }),
];

const BY_ID = new Map(ENTRIES.map((e) => [e.def.id, e]));
if (BY_ID.size !== ENTRIES.length) throw new Error('Two memories share an id');

export const MEMORIES: Record<string, MemoryDef> = Object.fromEntries(ENTRIES.map((e) => [e.def.id, e.def]));

export function memoryEntry(id: string): MemoryEntry {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`No memory "${id}"`);
  return e;
}

/** The framing of a film memory's picture. */
export function filmSpecOf(id: string): FilmSpec {
  const spec = memoryEntry(id).film;
  if (!spec) throw new Error(`Memory "${id}" has no film spec`);
  return spec;
}

/** The painted rig of a painted living memory. */
export function rigSpecOf(id: string): LivingSpec {
  const spec = memoryEntry(id).rig;
  if (!spec) throw new Error(`Memory "${id}" has no painted rig`);
  return spec;
}
