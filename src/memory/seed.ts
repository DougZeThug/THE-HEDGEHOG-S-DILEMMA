/**
 * The memories' first authored timelines, written in Theatre.js's own saved-state format so the
 * artist can open them in Studio and carry on (docs/memories.md). Once saved from Studio,
 * `src/memory/theatre-state.json` is the source of truth; `npm run memories:seed` only creates
 * sheets that aren't there yet (or all of them with `--force`, which discards authored work).
 *
 * A seed is compact: each track is a list of [position, value] keyframes (seconds); each sheet
 * names its sections as markers (`active`, `exit`, `residue`, `end`) and its sounds as markers
 * (`sfx:spoon`, `bed:kitchen`, `music:kitchen`), which the artist moves in Studio's timeline.
 */
/** A keyframe; its ease shapes the segment that starts at it (soft by default). */
export type Key = [position: number, value: number] | [position: number, value: number, ease: 'linear' | 'hold'];

export interface SheetSeed {
  /** `object.prop` → keyframes; a single [0, v] is a static value. */
  tracks: Record<string, Key[]>;
  markers: { label: string; position: number }[];
}

/**
 * A keyframe's handles are [left x, left y, right x, right y]: a segment's curve is the right
 * handle of the key it leaves and the left handle of the key it reaches. Theatre's default
 * (a soft ease in and out) is left (0.5, 1), right (0.5, 0); a straight segment is (1/3, 1/3) out
 * and (2/3, 2/3) in.
 */
function handles(keys: Key[], i: number): [number, number, number, number] {
  const prevLinear = i > 0 && keys[i - 1][2] === 'linear';
  const linear = keys[i][2] === 'linear';
  const left: [number, number] = prevLinear ? [2 / 3, 2 / 3] : [0.5, 1];
  const right: [number, number] = linear ? [1 / 3, 1 / 3] : [0.5, 0];
  return [left[0], left[1], right[0], right[1]];
}

let ids = 0;
const id = (p: string) => `${p}${(ids++).toString(36)}`;

/** Theatre 0.7 project state (definitionVersion 0.4.0) for the given sheets. */
export function seedState(sheets: Record<string, SheetSeed>, revision = 'seed'): TheatreState {
  ids = 0;
  const sheetsById: TheatreState['sheetsById'] = {};
  for (const [sheetId, seed] of Object.entries(sheets)) {
    const tracksByObject: Record<string, { trackData: Record<string, unknown>; trackIdByPropPath: Record<string, string> }> = {};
    const byObject: Record<string, Record<string, number>> = {};
    for (const [path, keys] of Object.entries(seed.tracks)) {
      const dot = path.lastIndexOf('.');
      const obj = path.slice(0, dot), prop = path.slice(dot + 1);
      if (keys.length === 1) {
        (byObject[obj] ??= {})[prop] = keys[0][1];
        continue;
      }
      const t = (tracksByObject[obj] ??= { trackData: {}, trackIdByPropPath: {} });
      const trackId = id('t');
      t.trackData[trackId] = {
        type: 'BasicKeyframedTrack',
        __debugName: `${obj}:["${prop}"]`,
        keyframes: keys.map(([position, value, ease], i) => ({
          id: id('k'),
          position,
          connectedRight: ease !== 'hold',
          handles: handles(keys, i),
          type: 'bezier',
          value,
        })),
      };
      t.trackIdByPropPath[`["${prop}"]`] = trackId;
    }
    const end = seed.markers.find((m) => m.label === 'end')?.position ?? 30;
    sheetsById[sheetId] = {
      staticOverrides: { byObject },
      sequence: {
        subUnitsPerUnit: 30,
        length: end,
        type: 'PositionalSequence',
        markers: seed.markers.map((m) => ({ id: id('m'), label: m.label, position: m.position })),
        tracksByObject,
      },
    };
  }
  return { sheetsById, definitionVersion: '0.4.0', revisionHistory: [revision] };
}

export interface TheatreState {
  sheetsById: Record<
    string,
    {
      staticOverrides: { byObject: Record<string, Record<string, number>> };
      sequence: {
        subUnitsPerUnit: number;
        length: number;
        type: 'PositionalSequence';
        markers?: { id: string; label: string; position: number }[];
        tracksByObject: Record<string, unknown>;
      };
    }
  >;
  definitionVersion: string;
  revisionHistory: string[];
}
