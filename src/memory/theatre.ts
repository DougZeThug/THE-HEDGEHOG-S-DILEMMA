import { getProject, types, createRafDriver, type IProject, type ISheet, type ISheetObject, type IRafDriver } from '@theatre/core';
import committed from './theatre-state.json';
import type { TheatreState } from './seed';
import type { Marker, Sections, TimelineSource, Values } from './types';

/**
 * Theatre.js, as the memories' authored timelines (docs/memories.md).
 *
 * One project holds one sheet per memory and variant. The production app never plays a sequence:
 * the memory's controller sets `sheet.sequence.position` on the room's clock and reads the
 * objects' values back at once (Theatre computes them synchronously). The state comes from the
 * committed `theatre-state.json`, written by Studio's "Save to repo" in development.
 *
 * The one raf driver below exists for Studio (development only, which ticks its own UI through
 * it); the App ticks it once a frame only while Studio is open, so Theatre never runs a loop of
 * its own.
 */
export const PROJECT_ID = 'Hedgehog Memories';

/** A memory's objects: object → prop → [default, min, max]. */
export type Schema = Record<string, Record<string, [number, number, number]>>;

export const driver: IRafDriver = createRafDriver({ name: 'hedgehog' });

let project: IProject | null = null;
let initial: TheatreState = committed as unknown as TheatreState;
let stateRead: () => TheatreState = () => initial;

/** The project, created once with the committed state. */
export function theatreProject(): IProject {
  return (project ??= getProject(PROJECT_ID, { state: initial }));
}

/** Start from another state (tests): only before the project exists. */
export function useInitialState(state: TheatreState): void {
  if (project) throw new Error('The memories project already exists.');
  initial = state;
}

/** In Studio, the live state (unsaved edits included) is where sections and markers come from. */
export function readStateFrom(read: () => TheatreState): void {
  stateRead = read;
}

const SECTION_LABELS = ['active', 'exit', 'residue', 'end'] as const;

/** Sections and sound markers of a sheet, from the (committed or live) state, with fallbacks. */
export function sheetMarkers(sheetId: string, fallback: { sections: Sections; markers: Marker[] }): { sections: Sections; markers: Marker[] } {
  const seq = stateRead().sheetsById[sheetId]?.sequence;
  const all = seq?.markers ?? [];
  const sections = { ...fallback.sections };
  for (const k of SECTION_LABELS) {
    const m = all.find((x) => x.label === k);
    if (m) sections[k] = m.position;
  }
  const sounds = all.filter((m) => /^(sfx|bed|music):/.test(m.label)).map((m) => ({ label: m.label, position: m.position }));
  return { sections, markers: sounds.length ? sounds.sort((a, b) => a.position - b.position) : fallback.markers };
}

const objects = new Map<string, ISheetObject>();

function objectFor(sheet: ISheet, sheetId: string, name: string, props: Record<string, [number, number, number]>): ISheetObject {
  const key = `${sheetId}/${name}`;
  let o = objects.get(key);
  if (!o) {
    const shape: Record<string, ReturnType<typeof types.number>> = {};
    for (const [p, [v, lo, hi]] of Object.entries(props)) shape[p] = types.number(v, { range: [lo, hi] });
    o = sheet.object(name, shape);
    objects.set(key, o);
  }
  return o;
}

/** A memory's sheet as the controller's authored timeline. */
export function sheetSource(sheetId: string, schema: Schema, fallback: { sections: Sections; markers: Marker[] }): TimelineSource & { sheet: ISheet } {
  const sheet = theatreProject().sheet(sheetId);
  const objs = Object.entries(schema).map(([name, props]) => [name, objectFor(sheet, sheetId, name, props)] as const);
  const { sections, markers } = sheetMarkers(sheetId, fallback);
  return {
    sheet,
    sections,
    markers,
    at(position: number): Values {
      sheet.sequence.position = position;
      const out: Values = {};
      for (const [name, o] of objs) {
        const v = o.value as Record<string, number>;
        for (const p in v) out[`${name}.${p}`] = v[p];
      }
      return out;
    },
    dispose() {
      // Objects are kept (tiny, and Studio keeps showing them); nothing ticks while unplayed.
    },
  };
}
