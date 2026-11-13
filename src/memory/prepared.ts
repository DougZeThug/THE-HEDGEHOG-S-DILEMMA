import type * as THREE from 'three';
import type { MemoryAudio, MemoryAudioHost } from './MemoryAudio';
import type { MemoryDef } from './memoryDef';
import type { WindowLayer } from '../world/MemoryWindow';
import type { WoodlandScene } from './living/WoodlandScene';
import type { FilmScene } from './living/FilmScene';
import type { FilmSpec } from './living/shared';
import type { Pane } from './art';

export interface RuntimeHost {
  renderer: THREE.WebGLRenderer;
  audio: MemoryAudioHost | null;
  /** 'low' loads the phone set (@low). */
  quality: 'low' | 'medium' | 'high';
  base?: string;
  /** A living memory's scene: the screen's shape (its render target is that shape), and the room's noise. */
  screen?: { width: number; height: number };
  noise?: THREE.Texture;
  reduced?: boolean;
  /**
   * The version of its overheard voices to lay in (src/content/memory-voices.ts), already chosen by
   * the Director and allowed by the recordings (null: wordless, as it always was), and a key's
   * recordings (to find a line's reading by name).
   */
  voices?: { version: string | null; filesOf?: (key: string) => readonly string[] };
}

interface PreparedLivingBase {
  /** Where its picture sits when it covers the screen (and, for a film, how its close shots are framed). */
  spec: FilmSpec;
  /** It may be entered (or only seen on the wall). */
  immerse: boolean;
  /** What the wall shows first (painting uv: x0, y0, w, h). */
  crop: [number, number, number, number];
  /** The painting's aspect (w / h). */
  aspect: number;
  /** When each pencil line is drawn on the wall and the colour comes, or null (the light finds it). */
  order: THREE.Texture | null;
  /** When the colour reaches a point of the painting (uv, y up; the order map's g), or null. */
  colourAt: ((u: number, v: number) => number) | null;
}

/** A film as a living memory (src/memory/living/FilmScene.ts). */
export interface PreparedFilm extends PreparedLivingBase {
  kind: 'film';
  scene: FilmScene;
  /** Carried out of the wall, its edge is torn (hard and ragged) rather than a soft brush. */
  torn: boolean;
  /** ... or a shadow's: no raggedness, a wide fall. */
  shade: boolean;
  /** Its soft edge on the wall (m), if wider than the usual brush. */
  feather?: number;
}

/** A painting that lives (the woodland's rig, dormant): it has no film's edge to carry out. */
export interface PreparedPainting extends PreparedLivingBase {
  kind: 'painting';
  scene: WoodlandScene;
  torn?: undefined;
  shade?: undefined;
  feather?: undefined;
}

/** A living memory's scene, prepared (src/memory/living/). */
export type PreparedLiving = PreparedFilm | PreparedPainting;

export interface Prepared {
  def: MemoryDef;
  variant: string;
  size: [number, number];
  /** The band at the painting's top kept for the words. */
  band: number;
  /** The painted sun's pane, if the memory's light can stay in the room. */
  pane: Pane | null;
  /** Where the painting's drawn shape is (to register it on a drawing on the wall). */
  register: { x: number; y: number; h: number } | null;
  layers: WindowLayer[];
  audio: MemoryAudio | null;
  /** The voices laid in (memory-voices.ts), or null. */
  voices: { version: string; filesOf?: (key: string) => readonly string[] } | null;
  /** Drawn by a living scene (its render target is the first layer), or null. */
  living: PreparedLiving | null;
  dispose(): void;
}
