/**
 * What the App's parts share: the world that was built once (renderer, room, rig, director, ...),
 * the visitor's preferences, the captions, the scene clock and the room's mode. Each part
 * (opening, living memories, vignettes, cues, input, menus) holds the context and reaches the others
 * only through `Peers`, the few members of them it calls.
 */
import * as THREE from 'three';
import type { Room } from '../world/Room';
import type { Chair } from '../world/Chair';
import type { Lighting } from '../world/Lighting';
import type { WallText } from '../world/WallText';
import type { CameraRig } from '../world/CameraRig';
import type { Post } from '../world/Post';
import type { MemoryLight } from '../world/MemoryLight';
import type { StreetLight } from '../world/StreetLight';
import type { MemoryWindow } from '../world/MemoryWindow';
import type { Inside } from '../world/living/Inside';
import { lookFor, type Look, type LookName } from '../world/Style';
import type { Director } from '../state/Director';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Ambience } from '../audio/Ambience';
import type { Music } from '../audio/Music';
import type { Voices } from '../audio/Voices';
import type { Captions } from '../ui/Captions';
import type { Prefs } from '../ui/prefs';
import type { Dom } from '../ui/dom';
import type { Living } from './living';
import type { ActiveVignette } from './vignettes';
import type { Opening } from './opening';
import type { LivingMemories } from './livingMemory';
import type { Vignettes } from './vignettes';
import type { Cues } from './cues';
import type { Input } from './input';
import type { Menus } from './menus';
import type { Hints } from './hints';
import type { Params } from './params';
import type { ScreenWake } from './opening';

/** Away from the room (hidden) or its sound stopped for this long (seconds), a memory is let go uncounted. */
export const GIVE_UP_AFTER_S = 10;

type Mode = 'threshold' | 'room' | 'settings' | 'contribute' | 'departed';

/** Everything `buildWorld` makes: built once, so none of it is ever half-initialised. */
export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  room: Room;
  chair: Chair;
  lighting: Lighting;
  text: WallText;
  rig: CameraRig;
  post: Post;
  director: Director;
  inside: Inside;
  /** A memory's light on a wall, and the writing it falls across. */
  memoryLight: MemoryLight;
  /** Streetlights passing across a living memory's wall (The Drive Home, docs/drive-home.md). */
  street: StreetLight;
  /** A living memory in the plaster (src/memory): neutral and on the wall from boot, so it is compiled with the room. */
  memoryWindow: MemoryWindow;
}

export class AppContext implements World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly room: Room;
  readonly chair: Chair;
  readonly lighting: Lighting;
  readonly text: WallText;
  readonly rig: CameraRig;
  readonly post: Post;
  readonly director: Director;
  readonly inside: Inside;
  readonly memoryLight: MemoryLight;
  readonly street: StreetLight;
  readonly memoryWindow: MemoryWindow;

  /** The room's sound: made on the visitor's first gesture (`enter`), so null until then, and after a failure. */
  audio: AudioEngine | null = null;
  ambience: Ambience | null = null;
  music: Music | null = null;
  voices: Voices | null = null;

  mode: Mode = 'threshold';
  /** Scene time (seconds since the page began; stops advancing only when the page does). */
  time = 0;
  readonly touch = matchMedia('(pointer: coarse)').matches;
  readonly raycaster = new THREE.Raycaster();

  /** The writing looked at now, and whether the chair is. */
  gazeId: string | null = null;
  gazeChair = false;
  /** The piece of writing last touched (the memory's light falls where the visitor touched). */
  lastTappedKey: string | null = null;
  touched = false;
  /** The visitor has dragged on the screen (so knows how to move). */
  dragged = false;
  /** The visitor asked to be forgotten: nothing of this visit is written from then on. */
  forgotten = false;

  /** The living memory playing now (at most one), and the writing it formed round. */
  living: Living | null = null;
  /** The vignette playing now (src/content/vignettes.ts): heard, not painted. */
  vignette: ActiveVignette | null = null;
  /** The piece of writing a memory's light is on, and how far that light washes it this frame. */
  memoryKey: string | null = null;
  lightWash = 0;

  /** The room's look (Style.ts): ?style=original|subtle|reference; reference unless asked. */
  lookName: LookName = 'reference';
  look: Look = lookFor('reference');
  /** How dark the chair's contact with the floor is, at full light (the look sets it). */
  chairContact = 1;

  /** Theatre Studio's ticker, while the Memory Editor is open (development only). */
  studioTick: ((now: number) => void) | null = null;

  constructor(
    world: World,
    readonly dom: Dom,
    readonly prefs: Prefs,
    readonly captions: Captions,
    public visits: number,
    readonly params: Params,
  ) {
    this.renderer = world.renderer;
    this.scene = world.scene;
    this.room = world.room;
    this.chair = world.chair;
    this.lighting = world.lighting;
    this.text = world.text;
    this.rig = world.rig;
    this.post = world.post;
    this.director = world.director;
    this.inside = world.inside;
    this.memoryLight = world.memoryLight;
    this.street = world.street;
    this.memoryWindow = world.memoryWindow;
  }

  /** The room has been entered (the threshold is behind the visitor), left or not. */
  hasEntered(): boolean {
    return this.mode !== 'threshold';
  }
  /** In the room, its pause or its writing field: not at the door, not gone. */
  isPlaying(): boolean {
    return this.mode !== 'threshold' && this.mode !== 'departed';
  }
  /** A visit is under way (what is kept of it when the tab closes). */
  inVisit(): boolean {
    return this.mode === 'room' || this.mode === 'settings' || this.mode === 'contribute';
  }
  /** The Director is being fed (the room, or the writing field over it). */
  runsDirector(): boolean {
    return this.mode === 'room' || this.mode === 'contribute';
  }

  /** Tell a screen reader something (not shown: the captions are for sounds). */
  announce(text: string): void {
    this.dom.memorySr.textContent = text;
  }
}

/** The parts of the App, whole: what `App` builds and drives. */
export interface Parts {
  opening: Opening;
  living: LivingMemories;
  vignettes: Vignettes;
  cues: Cues;
  input: Input;
  menus: Menus;
  hints: Hints;
  wake: ScreenWake;
}

/** What the parts may call on one another: only these, so a part's other members are its own. */
export interface Peers {
  opening: Pick<Opening, 'active' | 'enter' | 'skipOpening' | 'advanceTitle'>;
  living: Pick<LivingMemories, 'playMemory' | 'frameMemory' | 'endLivingMemory' | 'memoryVoices' | 'onVisibility'>;
  vignettes: Pick<Vignettes, 'playVignette' | 'spotWorld' | 'vignettesAvailable' | 'onVisibility' | 'release'>;
  cues: Pick<Cues, 'apply' | 'drawingsOn' | 'place' | 'writeWithVoice'>;
  menus: Pick<Menus, 'openSettings' | 'closeSettings' | 'openContribute' | 'closeContribute' | 'depart' | 'setPref' | 'keepTrace'>;
  wake: Pick<ScreenWake, 'keepAwake' | 'release' | 'dropped'>;
}
