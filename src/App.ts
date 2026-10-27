import { STATIC_DRAWINGS } from './content/drawings';
import * as THREE from 'three';
import { Room } from './world/Room';
import { loadScans, releaseScans } from './world/scans';
import { Chair } from './world/Chair';
import { Lighting, shadowMapSize } from './world/Lighting';
import { lookFor, parseLook, LOOK_NAMES, LOOKS, type Look, type LookName } from './world/Style';
import { MemoryLight } from './world/MemoryLight';
import { MemoryWindow } from './world/MemoryWindow';
import { Immersion, UPRIGHT } from './world/living/Immersion';
import { Inside } from './world/living/Inside';
import { washInputs, washOf } from './world/living/wash';
import { warmLiving } from './world/living/materials';
import { MemoryClock } from './memory/clock';
import { fetchBlob } from './memory/fetched';
import type { Lifecycle } from './memory/types';
import type { LivingMemory } from './memory/runtime';
import type { MemoryAudioHost } from './memory/MemoryAudio';
import { VignettePlayer, type VignetteHost } from './memory/VignettePlayer';
import { isSpot, type SpotPlace } from './memory/cueSheet';
import { VIGNETTE_BY_ID, VIGNETTES, vignetteKeys, spokenLines, lineKey, type Effect, type GapKind } from './content/vignettes';
import { chooseVoices, versionKeys, voicesEnd } from './content/memory-voices';
import { WallText, wallClock, type TextItem } from './world/WallText';
import { CameraRig } from './world/CameraRig';
import { Post } from './world/Post';
import { FONTS_TO_LOAD } from './world/textures';
import { ROOM } from './world/layout';
import { Director, returnYaw } from './state/Director';
import type { Cue, VoicePosition } from './state/cues';
import type { Surface } from './content/types';
import { PHRASES } from './content/phrases';
import { THRESHOLD_LINES } from './content/relations';
import { AudioEngine } from './audio/AudioEngine';
import { Ambience } from './audio/Ambience';
import { Music } from './audio/Music';
import { Voices, type VoicePlacement, type Played } from './audio/Voices';
import { openingScore, levelsAt, stageAt, ROOM_LEVELS, OPENING_WRITTEN, OPENING_SPOKEN, OPENING_UNFINISHED, type Score, type Levels, type Stage, type ScoreEvent } from './state/OpeningScore';
import VOICE_TIMINGS from './content/voice-timings.json';
import { Captions } from './ui/Captions';
import { loadPrefs, savePrefs, readVisits, writeVisits, forgetVisits, readOpeningSeen, writeOpeningSeen, readMemoryCounts, writeMemoryCounts, readTrace, writeTrace, type Prefs } from './ui/prefs';
import { SCENE_BY_PHRASE, SCENE_MEMORIES } from './content/memories';
import { LocalInterpreter } from './interpret/LocalInterpreter';
import type { Interpreter } from './interpret/Interpreter';
import { clamp } from './core/math';
import { hashString } from './core/rng';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** How far the room goes down while the visitor is inside a living memory's painting (−26 dB). */
const DEEP_HUSH = 0.95;

type Mode = 'threshold' | 'room' | 'settings' | 'contribute' | 'departed';

/** Where a vignette's places in the room are measured from (fixed as it begins). */
interface SpotFrame {
  eye: THREE.Vector3;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  anchor: THREE.Vector3 | null;
}

export class App {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  room!: Room;
  chair!: Chair;
  lighting!: Lighting;
  text!: WallText;
  rig!: CameraRig;
  post!: Post;
  director!: Director;
  audio: AudioEngine | null = null;
  ambience: Ambience | null = null;
  music: Music | null = null;
  voices: Voices | null = null;
  captions = new Captions($('captions'));
  interpreter: Interpreter = new LocalInterpreter();
  prefs: Prefs = loadPrefs();
  mode: Mode = 'threshold';
  visits = readVisits();
  private clock = new THREE.Clock();
  private time = 0;
  private enteredAt = 0;
  private gazeId: string | null = null;
  private gazeChair = false;
  private raycaster = new THREE.Raycaster();
  private debugEl = $('debug');
  private debug = new URLSearchParams(location.search).has('debug');
  private fps = 60;
  private lastDebug = 0;
  private hintShown = false;
  private touchHintShown = false;
  /** The visitor has touched writing or the chair at least once. */
  private touched = false;
  /** The visitor has dragged on the screen (so knows how to move). */
  private dragged = false;
  private touch = matchMedia('(pointer: coarse)').matches;
  private tabIndex = 0;
  private departTimer = 0;
  /** Leaving plays the opening backwards: the room's light goes, then the chair's, then black (wall-clock time it began). */
  private leaving: number | null = null;
  /** A memory's light on a wall, and the writing it falls across. */
  readonly memoryLight = new MemoryLight();
  /** A living memory in the plaster (src/memory): neutral and on the wall from boot, so it is compiled with the room. */
  readonly memoryWindow = new MemoryWindow();
  /** The living memory playing now (at most one), and the writing it formed round. */
  private living: { memory: LivingMemory; id: string; key: string; anchor: NonNullable<ReturnType<WallText['anchorOf']>>; bled: boolean; hiddenSince: number | null; held: boolean;
    /** Seconds looking away from it, and watching it; why it was let go. */
    awayFor: number; watched: number; minHold: number; seenAt?: number; reached: number; deep: boolean; why: string | null;
    /** Looking away from it now (last attention check); how many of its later descriptions are told. */
    away: boolean; told: number;
    /** The room's writing its painting has washed out (given back when it goes). */
    washed: Set<string>;
    /** Since when its sound has been stopped while it was visible; let go for it. */
    downSince: number | null; gaveUp: boolean;
    /** Its line where the painting was, if it has one: tried (once). */
    coda: boolean;
  } | null = null;
  /** Going into a living memory and back (src/world/living/Inside.ts). */
  private inside!: Inside;
  private memoryClock = new MemoryClock();
  private memoryGen = 0;
  /**
   * The vignette playing now (src/content/vignettes.ts): heard, not painted. `frame` is where the
   * visitor was and faced when it began, so its voices stay where they were placed.
   */
  private vignette: {
    player: VignettePlayer; id: string; key: string | null; frame: SpotFrame; hiddenSince: number | null; settingsFor: number; preview: boolean;
    /** Seconds moving away from where it began; let go before its end (not counted as heard to the end). */
    leaving: number; cutShort: boolean; uncounted: boolean;
    /** When settings were opened over it (wall-clock seconds), or null. */
    settingsSince: number | null;
  } | null = null;
  private vignetteClock = new MemoryClock(1);
  private vignetteGen = 0;
  /**
   * `?vignette=<id>[&variant=<v>]`: play one, as a preview, a few seconds after the room is
   * open (recorded or not: an unrecorded line is a wordless voice with its caption).
   */
  private previewVignette: { id: string; variant: string; at: number | null } | null = (() => {
    const p = new URLSearchParams(location.search);
    const id = p.get('vignette');
    return id ? { id, variant: p.get('variant') ?? 'first', at: null } : null;
  })();
  /**
   * `?memory=<id>[&variant=<v>][&voices=<version>]`: play a painted memory with its overheard
   * voices, as a preview, a few seconds after the room is open (takes kept or not; an unrecorded
   * line is a wordless voice with its caption).
   */
  private previewMemory: { id: string; variant: string; voices: string | null; at: number | null } | null = (() => {
    const p = new URLSearchParams(location.search);
    const id = p.get('memory');
    if (!id || p.has('studio')) return null;
    const variant = p.get('variant') ?? (SCENE_MEMORIES.find((m) => m.id === id)?.variants.first ?? 'first');
    return { id, variant, voices: p.get('voices') ?? chooseVoices(id, variant, { seen: 0, visits: 1, field: {}, motifs: [], withdrew: false }), at: null };
  })();
  private prefetched = new Set<string>();
  /** Theatre Studio's ticker, while the Memory Editor is open (development only). */
  studioTick: ((now: number) => void) | null = null;
  private memoryRuntime: Promise<typeof import('./memory/runtime')> | null = null;
  private memoryKey: string | null = null;
  /** How far the memory's light washes its line this frame. */
  private lightWash = 0;
  /** The piece of writing last touched (the memory's light falls where the visitor touched). */
  private lastTappedKey: string | null = null;
  /** How dark the chair's contact with the floor is, at full light (the look sets it). */
  chairContact = 1;
  /** The room's look (Style.ts): ?style=original|subtle|reference; reference unless asked. */
  lookName: LookName = 'reference';
  look: Look = lookFor('reference');
  /** The opening while it plays: its score, when it started (wall clock), what has been done. */
  /** The visitor asked to be forgotten: nothing of this visit is written from then on. */
  private forgotten = false;
  private opening: { score: Score; start: number; fired: Set<number>; skip?: { at: number; from: Levels } } | null = null;
  /** When the room was handed to the Director (scene time), for hints and the inspector. */
  private handoffAt = Infinity;

  /** For tests and the inspector: where the opening is. */
  get score() {
    const o = this.opening;
    if (!o) return { t: null, stage: (this.handoffAt < Infinity ? 'done' : 'invite') as Stage | 'invite', handoffAt: this.handoffAt };
    const t = wallClock() - o.start;
    // The hand-off waits for the voice: until it has happened, the opening is still in its last stage.
    let stage: Stage = stageAt(o.score, t);
    if (stage === 'handoff' || stage === 'done') stage = 'voice';
    return { t, stage, handoffAt: o.score.handoff, name: o.score.name };
  }

  async boot() {
    const params = new URLSearchParams(location.search);
    const seedParam = Number(params.get('seed'));
    const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 1000 + (this.visits + 1) * 7919;
    $('threshold-line').textContent = THRESHOLD_LINES[Math.min(THRESHOLD_LINES.length - 1, this.visits)];

    // The fonts (at most four seconds), then the material scans the room's surfaces are baked with
    // (scans.ts), which get at most a second and a half more: on a slow connection the room bakes
    // without them, as before, rather than keep the visitor at the threshold.
    const scans = loadScans();
    await Promise.race([
      Promise.all(FONTS_TO_LOAD.map((f) => document.fonts.load(f).catch(() => null))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    await Promise.race([scans, new Promise((r) => setTimeout(r, 1500))]);

    this.setupRenderer();
    this.room = new Room(this.prefs.quality);
    this.chair = new Chair();
    releaseScans();
    this.lighting = new Lighting(this.prefs.quality);
    this.text = new WallText(this.room, 4242);
    this.scene.add(this.room.group, this.chair.group, this.lighting.group, this.text.air);
    // Words in the air rubbed out by someone coming close: an eraser where they were, and a breath.
    this.text.onAirGone = (how, at) => {
      if (how !== 'approach' || !this.voices || !this.audio) return;
      const place = { from: [at.x, at.y, at.z] as [number, number, number] };
      void this.voices.sound('eraser', place, 0.35).then((dur) => {
        if (dur > 0 && !this.captions.speaking) this.captions.show('[rubbed out]', Math.max(1.4, dur), true);
      });
      setTimeout(() => void this.voices?.playLine('breath', null, place, 0.12, 'vf-breath'), 200);
    };
    this.scene.background = new THREE.Color(0xf3f2ef);
    this.rig = new CameraRig(innerWidth / innerHeight);
    const forced = params.get('situations')?.split(',').map((s) => s.trim()).filter(Boolean);
    const trace = this.visits > 0 ? readTrace() : null;
    this.director = new Director({
      seed,
      visits: this.visits + 1,
      trace,
      memoryCounts: readMemoryCounts(),
      situations: forced,
      // Where each piece of writing is, for situations that relate place to memory.
      geometry: (id) => {
        const w = this.text.whereIs(id);
        return w ? { surface: w.surface, x: w.centre.x, y: w.centre.y, z: w.centre.z } : undefined;
      },
    });
    // Until the voices' manifest says which are recorded, no vignette speaks.
    this.director.scenes.setAvailable(new Set());
    // How the last visit left the chair, set in the dark before anything is seen: the only change
    // to it on return (docs/reviews/2026-10-emotional-depth.md).
    const yaw = returnYaw(trace, this.chair.baseYaw);
    if (yaw !== null) this.chair.group.rotation.y = yaw;
    for (const [id, st] of this.director.visible) if (st.base) this.text.setShown(id);
    // The hand that wrote what is already there left its marks under it.
    this.room.handMarks(
      [...this.director.visible]
        .filter(([, st]) => st.base)
        .map(([id]) => this.text.placementOf(id))
        .filter((p): p is NonNullable<typeof p> => !!p && p.surface !== 'floor' && p.surface !== 'ceiling'),
    );

    const samples = this.prefs.quality === 'high' ? 4 : this.prefs.quality === 'medium' ? 2 : 0;
    this.post = new Post(this.renderer, this.scene, this.rig.camera, samples);
    const immersion = new Immersion(this.memoryWindow.noise);
    this.post.addOverlay(immersion.pass);
    this.inside = new Inside(this.rig, this.memoryWindow, immersion, this.post);
    this.setStyle(parseLook(params.get('style')));
    this.applyPrefs();
    this.onResize();
    addEventListener('resize', () => this.onResize());
    this.bindInput();
    this.bindUI();
    if (this.debug) this.debugEl.hidden = false;
    // The artist's panel: only with ?tune, loaded only then.
    if (params.has('tune')) void import('./ui/Tune').then(({ mountTune }) => this.mountTune(mountTune));
    (window as unknown as { __hedgehog: unknown }).__hedgehog = this;
    // The Memory Editor (Theatre Studio): development builds only, never shipped.
    if (import.meta.env.DEV && /[?&]studio\b/.test(location.search)) void import('./memory/editor/MemoryEditor').then((m) => m.openEditor(this));

    // Warm up behind the black threshold: compile every shader now (with every light present,
    // so nothing recompiles when the light comes on), then render one black frame.
    this.post.black = 1;
    this.lighting.score.key = this.lighting.score.area = this.lighting.score.hemi = this.lighting.score.glow = 0;
    this.room.setLit(0, 0);
    this.rig.update(0.016, this.room, this.chair.group.position);
    // Compiled for the target the scene is really drawn into (the composer's, linear, before
    // tone mapping), not the screen: three keys programs on the bound target. The memory's light
    // is in the scene, unseen, so it is compiled here too.
    this.room.frames.north.writing.add(this.memoryLight.mesh);
    this.room.frames.north.writing.add(this.memoryWindow.mesh);
    this.renderer.setRenderTarget(this.post.composer.readBuffer);
    this.renderer.compile(this.scene, this.rig.camera);
    this.renderer.setRenderTarget(null);
    // A living memory's painting and the way into it: compiled now, kept (never compiled again).
    warmLiving(this.renderer, this.memoryWindow.noise);
    immersion.pass.enabled = true;
    this.post.render();
    immersion.off();
    const enter = $<HTMLButtonElement>('enter');
    enter.disabled = false;
    enter.textContent = this.visits > 0 ? 'go in again' : 'go in';
    enter.focus();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Change the room's look (uniforms and light levels only: nothing compiles). */
  setStyle(name: LookName) {
    this.lookName = name;
    this.look = lookFor(name);
    this.applyLook();
  }

  /** Push the current look's values to the lights, the room, the grade and the chair. */
  private applyLook() {
    const l = this.look;
    this.lighting.look = l;
    this.room.setLook(l);
    this.post.grain = l.grain;
    this.post.vignette = l.vignette;
    this.post.vigLow = l.vigLow;
    this.chairContact = l.contact;
  }

  private setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    // Redrawn when the light or the chair moves (Lighting.shadowDirty), not every frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    $('stage').appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = -1;
    // A phone may drop the GL context (a backgrounded tab); when it comes back, so must the
    // chair's shadow, which is otherwise only redrawn when something moves.
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.lighting?.invalidateShadow();
      this.renderer.shadowMap.needsUpdate = true;
    });
  }

  private pixelRatio() {
    const dpr = devicePixelRatio || 1;
    // Phones have small, dense screens: writing at ratio 1 is soft, so 'low' still renders at up to 1.5 there.
    return this.prefs.quality === 'low' ? Math.min(dpr, this.touch ? 1.5 : 1) : this.prefs.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  private onResize() {
    const w = innerWidth, h = innerHeight;
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.post.setSize(w, h, pr);
    this.rig.camera.aspect = w / h;
    this.rig.setAspect(w / h);
    this.rig.camera.updateProjectionMatrix();
  }

  // ─────────────────────────────── entering ───────────────────────────────

  async enter() {
    if (this.mode !== 'threshold') return;
    this.mode = 'room';
    this.visits++;
    writeVisits(this.visits);
    try {
      // iOS: let the room be heard even with the ringer switched to silent.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      this.audio = new AudioEngine();
      // Never let a stuck audio session hold the visitor at the door.
      void this.audio.resume().catch(() => {});
      this.ambience = new Ambience(this.audio);
      this.ambience.start();
      this.music = new Music(this.audio);
      this.voices = new Voices(this.audio);
      // What the opening needs comes first.
      void this.voices.loadManifest().then(() => {
        this.voices!.preload(['sfx:switch', 'sfx:chair-creak', 'sfx:graphite', 'dialogue/crumbs--laughing.mp3']);
        // Vignettes speak only once their voices are recorded and kept (the rest wait, or play voiceless).
        this.director.scenes.setAvailable(this.vignettesAvailable());
      });
    } catch (e) {
      console.warn('[hedgehog] audio unavailable; continuing in silence', e);
      this.audio = null;
    }
    this.applyPrefs();
    this.enteredAt = this.time;
    // Focus the room itself (a labelled region a screen reader names); Skip is a tab away.
    $('skip').hidden = false;
    $('stage').tabIndex = -1;
    $('stage').focus({ preventScroll: true });
    void this.keepAwake();
    // A phone's back gesture (an edge swipe, easily made while walking) pauses instead of leaving.
    history.pushState({ room: 1 }, '');
    this.beginOpening();
  }

  // ─────────────────────────────── the opening ───────────────────────────────

  /**
   * The drawings that were always there: part of the room's history, there when its light
   * comes up. Baked one at a time while the screen is still black after the tap, not while
   * the page loads.
   */
  private mountTune(mount: typeof import('./ui/Tune').mountTune) {
    const sc = this.lighting.score;
    const n = (group: string, label: string, min: number, max: number, get: () => number, set: (v: number) => void) => ({ group, label, min, max, step: (max - min) / 100, get, set });
    mount(
      [
        n('light', 'key', 0, 1.5, () => sc.key, (v) => (sc.key = v)),
        n('light', 'room', 0, 1.5, () => sc.area, (v) => (sc.area = v)),
        n('light', 'sky', 0, 1.5, () => sc.hemi, (v) => (sc.hemi = v)),
        n('light', 'glow', 0, 2, () => sc.glow, (v) => (sc.glow = v)),
        n('light', 'cone', 0.5, 1.2, () => sc.cone, (v) => (sc.cone = v)),
        // The look (Style.ts): the presets below set all of these; a slider then changes one.
        ...(
          [
            ['fill', 0, 1.5], ['area', 0, 4], ['key', 0, 2], ['cone', 0.5, 1.3], ['glow', 0, 1.5], ['warmth', 0, 1.5], ['ceiling', 0, 12],
            ['exposure', 0.8, 1.4], ['vignette', 0, 0.6], ['grain', 0, 0.06], ['texture', 0, 2], ['contact', 0, 1.5], ['shadowSoft', 0.3, 3],
            ['faint', 0.8, 1.6], ['skyGlow', 0, 20], ['contrast', 0, 0.8], ['stains', 0, 1], ['aim', 0, 1], ['panel', 0.5, 3], ['vigLow', 0, 1],
          ] as [keyof Look, number, number][]
        ).map(([k, lo, hi]) =>
          n('look', k, lo, hi, () => this.look[k], (v) => {
            this.look = { ...this.look, [k]: v };
            this.lookName = 'custom' as LookName;
            this.applyLook();
          }),
        ),
        n('memory', 'light', 0, 0.8, () => this.memoryLight.gain, (v) => (this.memoryLight.gain = v)),
      ],
      [
        ...LOOK_NAMES.map((name) => ({ label: name, run: () => this.setStyle(name), pressed: () => this.lookName === name })),
        {
          label: 'the memory, now',
          run: () => {
            const m = Director.MEMORY;
            if (!this.text.anchorOf(m.phraseId)) this.text.setShown(m.phraseId);
            this.apply({ type: 'memory', phraseId: m.phraseId, attack: m.attack, hold: m.hold, release: m.release });
          },
        },
        {
          label: 'cereal, now',
          run: () => {
            if (!this.text.anchorOf('cereal')) this.text.setShown('cereal');
            // Walk to where it is seen whole, face it, and begin once the line is there.
            setTimeout(() => {
              this.frameMemory('cereal');
              void this.playMemory('cereal', 'cereal');
            }, 600);
          },
        },
      ],
    );
  }

  // ─────────────────────────────── living memories ───────────────────────────────

  /** The memories' runtime (GSAP, Theatre.js, the controller): a lazy chunk, loaded once. */
  private memoryChunk() {
    return (this.memoryRuntime ??= import('./memory/runtime'));
  }

  private memoryAudioHost(): MemoryAudioHost | null {
    const a = this.audio, voices = this.voices;
    if (!a || !voices) return null;
    const mesh = this.memoryWindow.mesh;
    return {
      ctx: a.ctx,
      out: a.buses.memory,
      load: async (asset, take) => {
        if (asset === 'synth:air') return (await import('./memory/synthAir')).synthAir(a.ctx.sampleRate, 7 + (take ?? 0));
        if (asset.startsWith('synth:')) {
          const w = await import('./memory/synthWoods');
          const kind = asset.slice(6) as (typeof w.WOODS_KINDS)[number];
          if (w.WOODS_KINDS.includes(kind)) return w.synthWoods(a.ctx, kind);
        }
        if (asset.startsWith('synth:')) {
          const { synthSound, SYNTH_KINDS } = await import('./memory/synthSounds');
          const kind = asset.slice(6) as (typeof SYNTH_KINDS)[number];
          return SYNTH_KINDS.includes(kind) ? synthSound(a.ctx, kind, 1 + (take ?? 0)) : null;
        }
        if (!asset.startsWith('music/')) return voices.raw(asset, take);
        try {
          // (Fetched ahead with the memory's art, when its line was armed.)
          return await a.ctx.decodeAudioData(await (await fetchBlob('./' + asset)).arrayBuffer());
        } catch {
          return null;
        }
      },
      impulse: (sec, decay, seed) => a.impulse(sec, decay, seed),
      get intensity() {
        return a.intensity;
      },
      // Window-local (u, v across it; d metres behind the wall) → the room.
      where: (p) => {
        if (isSpot(p)) return this.spotWorld(p);
        mesh.updateWorldMatrix(true, false);
        const w = mesh.localToWorld(new THREE.Vector3(p.u, p.v, -p.d / Math.max(1e-3, mesh.scale.z)));
        return [w.x, w.y, w.z];
      },
      // Spoken lines (a painted memory's overheard voices) are levelled as a vignette's are.
      level: (asset, buf) => (asset.startsWith('vig:') ? voices.voicedLevel(buf) : 1),
      caption: (text, seconds, speech, side) => {
        // Words said in it are captioned as speech, by side; its sounds only while nobody speaks.
        // (Beneath the words still on screen, as a vignette's, when it has words: never over them.)
        if (speech) this.captions.show(text, Math.max(1.4, seconds), false, side, true);
        else if (this.living?.memory.prepared.voices) this.captions.show(text, Math.max(1.6, seconds), true, undefined, true);
        else if (!this.captions.speaking) this.captions.show(text, Math.max(1.6, seconds), true);
      },
      // Not recorded yet (`?memory=` previews only): the words in a voice without words, and the caption.
      fallback: (cue, delay) => {
        const text = cue.text ?? '';
        const living = this.living;
        setTimeout(() => {
          if (!living || this.living !== living) return;
          const from = isSpot(cue.place) ? this.spotWorld(cue.place) : this.memoryAudioHost()!.where(cue.place);
          void voices.playLine('whisper', text, { from }, 0.7, undefined, { synth: true, priority: true }).then((pl) => {
            if (pl.duration > 0) this.captions.show(text, pl.duration, false, cue.side);
          });
        }, delay * 1000);
      },
    };
  }

  /**
   * Play a living memory round the line it belongs to (on whatever wall it is written).
   * Returns false if the line isn't on a wall or the memory couldn't be prepared.
   */
  /** Walk to where a memory is seen whole and face it (the editor's Start: the real framing). */
  frameMemory(phraseId: string) {
    const a = this.text.anchorOf(phraseId);
    const c = a && this.text.centreOf(a.key);
    if (c) this.rig.attend(c, 2.4);
  }

  /**
   * The version of a painted memory's overheard voices it may speak: every line kept by the
   * artist, or (a preview) taken so far, kept or not. Otherwise null: wordless, as it always was.
   */
  private memoryVoices(id: string, variant: string, version: string | null | undefined, preview: boolean): string | null {
    const voices = this.voices;
    if (!version || !voices) return null;
    const keys = versionKeys(id, variant, version);
    if (!keys.length) return null;
    return keys.every((k) => (preview ? voices.filesOf(k).length > 0 : voices.hasAsset(k))) || preview ? version : null;
  }

  async playMemory(id: string, phraseId: string, variant = 'first', voiced?: string | null, preview = false): Promise<boolean> {
    let a = this.text.anchorOf(phraseId, this.gazeId ?? this.lastTappedKey);
    // A memory that opens from a drawing can begin from the drawing alone.
    const opensFrom = SCENE_BY_PHRASE.get(phraseId)?.id === 'door' ? 'ghost-door' : null;
    const drawn = opensFrom ? this.text.anchorOfKey(opensFrom) : null;
    if (drawn && (!a || a.group !== drawn.group)) a = drawn;
    if (!a) return false;
    this.endLivingMemory('switch');
    // Only the latest request plays (two overlapping ones would otherwise both load).
    const gen = ++this.memoryGen;
    let rt: typeof import('./memory/runtime');
    let prepared: Awaited<ReturnType<typeof rt.prepare>>;
    try {
      rt = await this.memoryChunk();
      prepared = await rt.prepare(id, variant, {
        renderer: this.renderer,
        audio: this.memoryAudioHost(),
        quality: this.prefs.quality,
        screen: { width: innerWidth * this.pixelRatio(), height: innerHeight * this.pixelRatio() },
        noise: this.memoryWindow.noise,
        reduced: this.prefs.reducedMotion,
        voices: { version: this.memoryVoices(id, variant, voiced, preview), filesOf: (k) => this.voices?.filesOf(k) ?? [] },
      });
    } catch (e) {
      console.warn('memory could not be prepared', e);
      return false;
    }
    // Asked for and then superseded, or the visitor has gone to write or to leave meanwhile.
    if (gen !== this.memoryGen || this.mode !== 'room') {
      prepared.dispose();
      prepared.audio?.dispose(0);
      return false;
    }
    // A switch released the one before: let it go at once rather than overlap.
    const before = this.living;
    if (before) {
      before.memory.dispose(0.3);
      // (Disposed, it completes, and its completion lets go of the window and gives the room its
      // words back (memoryState). Read after that, `this.living` was null: QA, 2026-10-18.)
      if (this.living === before) {
        this.memoryWindow.release();
        for (const k of before.washed) this.text.wash(k, 0);
        this.living = null;
      }
    }
    // Opening from a drawing already on the wall: the painting's own drawn shape lies on it.
    let fixed: { cx: number; cy: number; w: number } | null = null;
    const from = prepared.def.opensFrom ? this.text.anchorOfKey(prepared.def.opensFrom) : null;
    if (from && prepared.register && from.group === a.group) {
      const scale = from.h / prepared.register.h;
      fixed = { cx: from.x - prepared.register.x * scale, cy: from.y - prepared.register.y * scale, w: prepared.size[0] * scale };
    }
    this.memoryWindow.place(a, hashString(a.key), fixed);
    // Anything already drawn on that wall is kept clear of (a painting never lands on a drawing).
    this.memoryWindow.avoid = fixed ? [] : this.drawingsOn(a.group);
    this.memoryWindow.setLayers(prepared.layers, prepared.size, prepared.band);
    this.memoryWindow.setLiving(prepared.living ? { crop: prepared.living.crop, size: prepared.size, order: prepared.living.order } : null, !prepared.living && !!prepared.def.living);
    this.inside.begin(hashString(a.key), this.prefs.reducedMotion);
    const memory = new rt.LivingMemory(prepared, {
      reduced: this.prefs.reducedMotion,
      gentle: this.prefs.intensity === 'gentle',
      onState: (s, why) => {
        if (why && this.living) this.living.why ??= why;
        this.memoryState(s);
      },
    });
    const sm = SCENE_BY_PHRASE.get(phraseId);
    this.living = { memory, id, key: a.key, anchor: a, bled: false, hiddenSince: null, held: false, awayFor: 0, watched: 0, minHold: Math.max(sm?.minHold ?? 8, prepared.voices ? voicesEnd(id, prepared.variant, prepared.voices.version) + 1 : 0), seenAt: sm?.seenAt, reached: 0, deep: false, why: null, away: false, told: 0, washed: new Set(), downSince: null, gaveUp: false, coda: false };
    this.memoryClock.reset();
    // The room hushes round it (and its music stops), until it lets go. For the door the white
    // room itself goes to evening, so the landing's light is the brightest thing there. Nothing
    // passes outside and the drone keeps its chord while it plays (a swell or a chord change under
    // it is a score cue: the sound designer's and the skeptic's reviews, 2026-10-18).
    this.audio?.memoryHush(prepared.def.hush, 1.4);
    this.ambience?.hold(this.time + prepared.def.sections.end);
    // A memory whose music is the room's last: no chord of the room's under it (its reverb isn't
    // hushed, and four of its five chords are a semitone from the woodland's key).
    if (this.ambience && (prepared.def.lastMusic === prepared.variant || prepared.def.drone === false)) this.ambience.score.drone = 0;
    if (prepared.def.roomDim) this.lighting.dimToChair(prepared.def.roomDim, prepared.def.maxHold + 4, this.time);
    if (this.director.scenes.active?.id !== id) this.director.memoryExternal(id);
    // Its position 0 is this instant on the audio clock, for its first sounds and its first frame
    // alike (the clock measures its first frame from here: QA, 2026-10-19).
    const ctx = this.audio?.ctx;
    this.memoryClock.prime(performance.now() / 1000, ctx?.currentTime ?? 0, ctx?.state === 'running');
    memory.start(ctx?.currentTime);
    return true;
  }

  private memoryState(s: Lifecycle) {
    const l = this.living;
    if (!l) return;
    // What the picture is, for a screen reader (not shown: the captions are for sounds).
    if (s === 'active') this.srRegion().textContent = l.memory.prepared.def.describe(l.memory.prepared.variant);
    // Letting go early: the room's own light comes back with it (over about 4 s).
    if (s === 'withdrawing' && l.memory.prepared.def.roomDim) this.lighting.dimToChair(l.memory.prepared.def.roomDim, 4, this.time);
    if (s === 'residue' || s === 'complete') {
      // The room comes back as the memory lets go (issued now, never precomputed).
      this.audio?.memoryHush(0, 20);
    }

    if (s === 'complete') {
      // Its line where the painting was, if one long frame went past its moment (QA, 2026-10-20).
      this.writeCoda(l);
      // (A living memory that was never entered, only seen on its wall, hasn't been seen: it is
      // offered again. Interaction review, 2026-10-17.)
      const entered = this.inside.entered || !l.memory.prepared.living?.immerse;
      // Whoever was carried in is back where they stood.
      this.inside.end();
      this.captions.dim = false;
      this.memoryWindow.release();
      for (const k of l.washed) this.text.wash(k, 0);
      // Its recordings are let go too (a phone keeps little decoded audio; they load again if it returns).
      const p = l.memory.prepared;
      this.voices?.forget(Object.values(p.def.cues(p.variant).cues).map((c) => c.asset).filter((a) => a.startsWith('mem:')));
      l.memory.prepared.dispose();
      this.living = null;
      // Seen: watched past its first moments (or, if it says where its heart is, played to there).
      // It ran to its end if nobody let it go early. (A tab hidden for long ends it uncounted, as a
      // vignette: it comes back, the same, another time.)
      const seen = l.why !== 'hidden' && entered && (l.seenAt !== undefined ? l.reached >= l.seenAt : l.watched >= Math.min(l.minHold, 8));
      if (this.director.memoryEnded(l.id, seen, l.why === null || l.why === 'complete') && !this.forgotten) {
        const counts = readMemoryCounts();
        counts[l.id] = (counts[l.id] ?? 0) + 1;
        writeMemoryCounts(counts);
      }
      // Its music was the room's last: seen, the room's own never comes back this visit (the
      // drone stays away, and the Director plays nothing); let go before then, the drone returns.
      if (p.def.lastMusic === p.variant) {
        if (seen) this.director.withdrawMusic();
        if (this.ambience && !this.director.musicWithdrawn) this.ambience.score.drone = 1;
      } else if (p.def.drone === false && this.ambience && !this.director.musicWithdrawn) {
        this.ambience.score.drone = 1;
      }
      this.ambience?.hold(this.time + Math.max(12, this.director.aftermathLeft()));
    }
  }

  /**
   * What stays: as a memory withdraws naturally, its sun comes into the room. It starts while the
   * painted sun is still half there, at the painted pane's size, place and slant, so one becomes
   * the other; then it is the kitchen-light memory's own light, fading on its own time.
   */
  private bleedMemory(l: NonNullable<App['living']>, frame: { state: Lifecycle; position: number; final: Record<string, number> }) {
    const def = l.memory.prepared.def;
    if (l.bled || def.bleed !== 'kitchen-light' || this.memoryLight.active) return;
    const c = l.memory.controller;
    if (frame.state !== 'withdrawing' || frame.position < c.sections.exit + (def.bleedAt ?? 2)) return;
    l.bled = true;
    const spill = frame.final['light.roomSpill'] ?? 1;
    if (spill <= 0) return;
    const pane = l.memory.prepared.pane;
    if (!pane) return;
    const at = this.memoryWindow.toWall(pane.x + (frame.final['layer:sun.x'] ?? 0), pane.y + (frame.final['layer:sun.y'] ?? 0));
    this.memoryLight.reducedMotion = this.prefs.reducedMotion;
    this.memoryLight.strength = (this.prefs.intensity === 'gentle' ? 0.6 : 1) * spill;
    this.memoryLight.startPane(l.anchor.group, at.x, at.y, (pane.w / 2) * at.scale, (pane.h / 2) * at.scale, pane.transom * at.scale, pane.mullion * at.scale, { attack: 3, hold: 4, release: 6 }, this.time, 0);
    this.memoryKey = l.key;
  }

  /** Let the playing memory go: gracefully, or (switch, depart, hidden) at once. */
  endLivingMemory(why: 'complete' | 'look-away' | 'walk-away' | 'interrupt' | 'switch' | 'depart' | 'hidden') {
    this.living?.memory.release(why);
    // A vignette: leaving cuts it; turning to write lets the sentence being said finish (the
    // writing may be an answer to it), and nothing more is said.
    if (why === 'depart' || why === 'hidden' || why === 'switch') this.vignette?.player.release('interrupt');
    else if (why === 'interrupt' && this.vignette) {
      this.vignette.cutShort = true;
      this.vignette.player.release('natural');
    }
  }

  // ─────────────────────────────── vignettes ───────────────────────────────

  /** Where the visitor is and faces as a vignette begins: its places in the room are fixed from it. */
  private spotFrame(anchorKey: string | null): SpotFrame {
    const cam = this.rig.camera;
    const eye = cam.position.clone();
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const c = anchorKey ? this.text.centreOf(anchorKey) : null;
    return { eye, fwd, right, anchor: c ? new THREE.Vector3(c.x, c.y, c.z) : null };
  }

  /** A place in the room (a vignette's) → world position. */
  spotWorld(p: SpotPlace): [number, number, number] {
    const f = this.vignette?.frame ?? this.spotFrame(null);
    const head = p.h ?? Math.max(1.2, f.eye.y);
    const c = this.chair.group.position;
    const hw = this.room.halfW, hd = this.room.halfD;
    const clampIn = (v: THREE.Vector3) => v.set(clamp(v.x, -hw + 0.2, hw - 0.2), v.y, clamp(v.z, -hd + 0.2, hd - 0.2));
    switch (p.at) {
      case 'chair':
        // Someone sitting on it (h 0.6: lying down, a child in bed).
        return [c.x, p.h ?? 1.1, c.z];
      case 'left':
      case 'right': {
        // Two people a little ahead of the visitor, on either side: the space between them is
        // what is heard (d: how far apart each is from the middle).
        const s = p.at === 'left' ? -1 : 1;
        const v = clampIn(f.eye.clone().addScaledVector(f.fwd, 1.3).addScaledVector(f.right, s * (p.d ?? 1.2)));
        return [v.x, head, v.z];
      }
      case 'close': {
        // Just beside the head, as a phone held to the ear.
        const v = f.eye.clone().addScaledVector(f.right, p.d ?? 0.3).addScaledVector(f.fwd, 0.05);
        return [v.x, f.eye.y, v.z];
      }
      case 'self': {
        // The one remembering: a step ahead, centred (neither ear), at head height.
        const v = clampIn(f.eye.clone().addScaledVector(f.fwd, p.d ?? 0.7));
        return [v.x, f.eye.y, v.z];
      }
      case 'beyond': {
        // Past the wall where its line is (or the one ahead): another room.
        const a = f.anchor ?? f.eye.clone().addScaledVector(f.fwd, 10);
        const out = new THREE.Vector3(a.x, 0, a.z);
        const k = Math.abs(out.x) / hw > Math.abs(out.z) / hd ? 'x' : 'z';
        const v = new THREE.Vector3(clamp(a.x, -hw, hw), head, clamp(a.z, -hd, hd));
        if (k === 'x') v.x = Math.sign(a.x || 1) * (hw + (p.d ?? 2));
        else v.z = Math.sign(a.z || 1) * (hd + (p.d ?? 2));
        return [v.x, v.y, v.z];
      }
      case 'door':
        return [0.9, p.h ?? 1.25, ROOM.halfD - 0.1];
      case 'anchor': {
        const a = f.anchor ?? f.eye.clone().addScaledVector(f.fwd, 2);
        return [a.x, a.y, a.z];
      }
    }
  }

  private vignetteHost(def: { id: string }): VignetteHost | null {
    const base = this.memoryAudioHost();
    if (!base || !this.voices) return null;
    const voices = this.voices;
    return {
      ...base,
      where: (p) => (isSpot(p) ? this.spotWorld(p) : base.where(p)),
      filesOf: (k) => voices.filesOf(k),
      // Spoken lines arrive at whatever level they were generated; brought level here, so a
      // score's gains are relative to one voice speaking normally.
      level: (asset, buf) => (asset.startsWith('vig:') || asset.startsWith('phrase:') ? voices.voicedLevel(buf) : 1),
      // A vignette's sounds are scored: one that marks a silence (a door closing) is captioned
      // beneath the words still on screen, never dropped.
      caption: (text, seconds, speech, side) => {
        if (speech) this.captions.show(text, Math.max(1.4, seconds), false, side, true);
        else this.captions.show(text, Math.max(1.6, seconds), true, undefined, true);
      },
      // Not recorded yet (previews only): the words in a voice without words, and the caption.
      fallback: (cue, delay) => {
        const text = cue.text ?? '';
        setTimeout(() => {
          if (!this.vignette || this.vignette.id !== def.id) return;
          const from = isSpot(cue.place) ? this.spotWorld(cue.place) : base.where(cue.place);
          void voices.playLine('whisper', text, { from }, 0.7, undefined, { synth: true, priority: true }).then((p) => {
            if (p.duration > 0) this.captions.show(text, p.duration, false, cue.side);
          });
        }, delay * 1000);
      },
      effect: (fx, delay) => {
        setTimeout(() => {
          if (this.vignette?.id === def.id) this.vignetteEffect(fx);
        }, delay * 1000);
      },
      gap: (kind, seconds, caption) => this.vignetteGap(kind, seconds, caption),
      letGo: (mode) => {
        // Interrupted, or let go early (walking off, turning to write): the room's light comes
        // back (over a few seconds, never a jump).
        if (mode === 'interrupt' || this.vignette?.cutShort) this.lighting.liftDim(this.time);
      },
    };
  }

  /** What the room does during a vignette (never a figure, never a cutscene). */
  private vignetteEffect(fx: Effect) {
    const v = this.vignette;
    const gentle = this.prefs.intensity === 'gentle' ? 0.6 : 1;
    switch (fx.kind) {
      case 'sun': {
        const a = v?.key ? this.text.anchorOfKey(v.key) : null;
        if (!a || this.memoryLight.active) break;
        this.memoryLight.reducedMotion = this.prefs.reducedMotion;
        this.memoryLight.strength = gentle * (fx.strength ?? 1);
        this.memoryLight.start(a.group, a.x, a.y, a.w, a.h, a.minX, a.maxX, a.maxY, fx, this.time, 0);
        this.memoryKey = a.key;
        break;
      }
      case 'dim':
        // Gentle intensity keeps half the room's light, as the held silence's dark does.
        this.lighting.dimToChair(this.prefs.intensity === 'gentle' ? Math.max(fx.to, 0.5) : fx.to, fx.seconds, this.time);
        break;
      default:
        this.absence(fx);
    }
  }

  /**
   * A gap in a vignette. Pauses, waits and silences are not captioned (an empty caption is what
   * a deaf visitor has of nothing being said); only a sound that defines a silence is, as a sound.
   */
  private vignetteGap(kind: GapKind, seconds: number, caption?: string) {
    // Waiting for an answer: the unanswered line stays on screen, dimmed, through the wait.
    if (kind === 'wait') setTimeout(() => this.captions.linger(seconds), 300);
    if (caption && !this.captions.speaking) this.captions.show(caption, Math.max(2, seconds * 0.6), true);
    // A chosen silence: the white room's own sound goes further down too, for its length, so what
    // is left is nearly nothing (a pause or a wait leaves the room as it was).
    const v = this.vignette;
    if (kind === 'silence' && v) {
      const hush = v.player.def.hush;
      this.audio?.memoryHush(Math.min(0.95, hush + 0.35), 1.2);
      setTimeout(() => {
        if (this.vignette === v && !v.player.releasedHow) this.audio?.memoryHush(hush, 2);
      }, Math.max(0.5, seconds - 1) * 1000);
    }
  }

  /** What a vignette leaves on the walls: a word gone, a line that withdraws as one comes close. */
  private absence(fx: Effect) {
    if (fx.kind === 'loseWord') for (const k of this.text.keysOf(fx.phraseId)) this.text.loseWord(k, fx.word, fx.seconds);
    else if (fx.kind === 'recede') for (const k of this.text.keysOf(fx.phraseId)) this.text.recede(k, fx.amount);
  }

  /**
   * Play a vignette. From the Director (its line was read, or the chair was stayed with), or a
   * preview (`?vignette=<id>&variant=<v>`, the artist's panel): a preview plays whether or not its
   * voices are recorded (an unrecorded line is a wordless voice with its caption).
   */
  async playVignette(id: string, variant: string, preview = false): Promise<boolean> {
    const def = VIGNETTE_BY_ID.get(id);
    if (!def || this.living || this.mode !== 'room') return false;
    const host = this.vignetteHost(def);
    if (!host) return false;
    this.vignette?.player.dispose(0.2);
    this.vignette = null;
    // A hint on screen goes (on a phone it sits where the vignette's words will be).
    $('hint').classList.remove('on');
    const gen = ++this.vignetteGen;
    // A preview shows its line, if the room hasn't written it (so what it leaves there is seen).
    if (preview && def.anchor.phrase && !this.text.anchorOf(def.anchor.phrase)) this.text.setShown(def.anchor.phrase);
    const a = def.anchor.phrase ? this.text.anchorOf(def.anchor.phrase, this.gazeId ?? this.lastTappedKey) : null;
    const frame = this.spotFrame(a?.key ?? null);
    const player = new VignettePlayer(def, variant, host, hashString(def.id + variant));
    // Its places are fixed from now (the frame is read while preparing, too).
    this.vignette = { player, id, key: a?.key ?? null, frame, hiddenSince: null, settingsFor: 0, preview, leaving: 0, cutShort: false, uncounted: false, settingsSince: null };
    try {
      await player.prepare();
    } catch (e) {
      console.warn('vignette could not be prepared', e);
    }
    if (gen !== this.vignetteGen || this.mode !== 'room' || this.living) {
      player.dispose(0);
      if (this.vignette?.player === player) this.vignette = null;
      return false;
    }
    // A voice of the room still speaking: the vignette waits for it (a few seconds at most).
    const wait = Math.min(4, Math.max(0, (this.voices?.busyUntil ?? 0) - performance.now() / 1000));
    // A cold open (B) cuts straight in: no settling hush first.
    const pre = def.coldOpen ? 0.05 : 1.2;
    this.audio?.memoryHush(def.hush, def.coldOpen ? 0.2 : 1.6);
    // The room waits with it (a preview too, though a preview is never counted).
    if (this.director.scenes.active?.id !== id) this.director.memoryExternal(id);
    const sr = this.srRegion();
    sr.textContent = def.describe;
    setTimeout(() => {
      if (this.vignette?.player !== player) return;
      this.vignetteClock.reset();
      player.start();
    }, (wait + pre) * 1000);
    return true;
  }

  private srRegion(): HTMLElement {
    let sr = document.getElementById('memory-sr');
    if (!sr) {
      sr = document.createElement('div');
      sr.id = 'memory-sr';
      sr.className = 'sr-only';
      sr.setAttribute('aria-live', 'polite');
      document.body.append(sr);
    }
    return sr;
  }

  private stepVignette() {
    const pm = this.previewMemory;
    if (pm && this.mode === 'room' && !this.opening && !this.living) {
      pm.at ??= wallClock() + 4;
      if (wallClock() >= pm.at) {
        this.previewMemory = null;
        const phraseId = SCENE_MEMORIES.find((m) => m.id === pm.id)?.phraseId;
        if (phraseId) {
          if (!this.text.anchorOf(phraseId)) this.text.setShown(phraseId);
          setTimeout(() => {
            this.frameMemory(phraseId);
            void (this.voices?.loadPreview() ?? Promise.resolve()).then(() => this.playMemory(pm.id, phraseId, pm.variant, pm.voices, true));
          }, 600);
        }
      }
    }
    const pv = this.previewVignette;
    if (pv && this.mode === 'room' && !this.opening && !this.living) {
      pv.at ??= wallClock() + 4;
      if (wallClock() >= pv.at) {
        this.previewVignette = null;
        // A preview hears the takes generated so far, kept or not (visitors only ever the kept).
        void (this.voices?.loadPreview() ?? Promise.resolve()).then(() => this.playVignette(pv.id, pv.variant, true));
      }
    }
    const v = this.vignette;
    if (!v) return;
    const p = v.player;
    // (Paused until the sound is running again too: a sentence said into a suspended context is lost.)
    const paused = this.mode === 'settings' || document.hidden || (!!this.audio && this.audio.ctx.state !== 'running');
    if (paused !== p.isPaused) paused ? p.pause() : p.resume();
    const dt = this.vignetteClock.tick(performance.now() / 1000, this.audio?.ctx.currentTime ?? 0, this.audio?.ctx.state === 'running', paused);
    // In settings, or with the sound stopped (a phone's call, a locked screen), for long: let it go
    // (its light runs on scene time and wouldn't wait).
    const held = this.mode === 'settings' || (!!this.audio && this.audio.ctx.state !== 'running');
    v.settingsSince = held ? v.settingsSince ?? wallClock() : null;
    if (v.settingsSince !== null && wallClock() - v.settingsSince > 10 && !p.releasedHow) {
      v.uncounted = true;
      p.release('interrupt');
    }
    // Turning away (toward a voice, often) or touching the walls never ends it. Walking off
    // does (well away from where it began, for a moment, whether still moving or not): the
    // sentence being said is finished, nothing more is said. Coming back within 2.5 m forgives.
    const dist = this.rig.camera.position.distanceTo(v.frame.eye);
    v.leaving = dist > 3 ? v.leaving + dt : dist < 2.5 ? 0 : v.leaving;
    if (v.leaving > 1.5 && p.position > 4 && !p.releasedHow) {
      v.cutShort = true;
      p.release('natural');
    }
    p.step(dt);
    if (!p.done) return;
    this.vignette = null;
    p.dispose(0.3);
    // (The room's sound comes back slowly, over about 20 s: no swell after a memory.)
    this.audio?.memoryHush(0, 20);
    this.voices?.forget(vignetteKeys(p.def));
    if (v.preview) {
      this.director.memoryPreviewEnded(v.id);
      return;
    }
    const counted = this.director.memoryEnded(v.id, p.seen && !v.uncounted, p.releasedHow === 'natural' && !v.cutShort);
    this.ambience?.hold(this.time + Math.max(12, this.director.aftermathLeft()));
    if (counted && !this.forgotten) {
      const counts = readMemoryCounts();
      counts[v.id] = (counts[v.id] ?? 0) + 1;
      writeMemoryCounts(counts);
    }
  }

  /** Which vignettes may speak: every line of every version recorded and kept by the artist. */
  private vignettesAvailable(): Set<string> {
    const out = new Set<string>();
    for (const def of VIGNETTES) {
      const lines = new Set(Object.keys(def.variants).flatMap((k) => spokenLines(def, k)));
      if ([...lines].every((l) => this.voices?.hasAsset(lineKey(def, l)))) out.add(def.id);
    }
    return out;
  }

  /**
   * Hold the playing memory at a position of its sequence (the editor, captures): it is shown as
   * if played there, nothing sounds, and it stays until `heldAt(null)` lets it play on.
   */
  heldAt(position: number | null) {
    const l = this.living;
    if (!l) return null;
    l.held = position !== null;
    if (position === null) {
      // Plays on from here: no stale time from the hold.
      this.memoryClock.reset();
      return null;
    }
    const f = l.memory.controller.scrub(position);
    this.memoryWindow.update(f.final, this.rig.restingEye, 1);
    this.drawLiving(l, f, 0);
    return { state: f.state, position: f.position, final: f.final };
  }

  /**
   * Is the visitor still with the memory? Judged by the painting, not by which line the gaze
   * rests on (a painting larger than its words is still being watched when the eye wanders
   * over it). Looking away lets it go after its minimum hold (2 s, or 3 s on a touch screen,
   * looking back cancels it); walking off lets it go; stepping back to see it whole, or coming
   * closer, never does. Looked away from for 6 s before anyone saw it: it withdraws, unspent.
   */
  private judgeMemoryAttention(l: NonNullable<App['living']>, dt: number) {
    const c = l.memory.controller;
    if (dt <= 0 || (c.state !== 'emerging' && c.state !== 'active')) return;
    const cam = this.rig.camera;
    const mesh = this.memoryWindow.mesh;
    const centre = mesh.getWorldPosition(new THREE.Vector3());
    const to = centre.clone().sub(cam.position);
    const dist = to.length();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const half = Math.atan2(mesh.scale.x / 2, Math.max(0.1, dist));
    const away = fwd.angleTo(to) > half + THREE.MathUtils.degToRad(10);
    l.away = away;
    // Inside it, it is all there is: watched, never looked away from (leaving is a turn: Inside.ts).
    if (this.inside.eff > 0.02) {
      l.awayFor = 0;
      l.watched += dt;
      return;
    }
    l.awayFor = away ? l.awayFor + dt : 0;
    if (!away) l.watched += dt;
    if (c.t < l.minHold) {
      if (l.awayFor > 6) this.endLivingMemory('look-away');
      return;
    }
    if (l.awayFor > (this.touch ? 3 : 2)) this.endLivingMemory('look-away');
    else if (away && dist > 4.5) this.endLivingMemory('walk-away');
  }

  /**
   * Studio's playhead moved (the editor). The memory's own playing also moves it (the controller
   * sets the sequence's position each frame): that is not a scrub, and doesn't hold it.
   */
  followPlayhead(position: number) {
    const l = this.living;
    if (!l) return;
    if (!l.held && Math.abs(l.memory.controller.position - position) < 1e-3) return;
    this.heldAt(position);
  }

  /**
   * A memory's line is on a wall: fetch the runtime and its art now (at idle), so that when it is
   * asked for it begins without a wait.
   */
  private prefetchMemories() {
    if (this.mode !== 'room' || (this.frameCount++ & 31) !== 0) return;
    const soon = new Set(this.director.scenes.comingSoon(this.director.now).map((m) => m.id));
    for (const [phraseId, m] of SCENE_BY_PHRASE) {
      // Its line on a wall, or its offer near (a reserved line is written only as it is offered).
      if (this.prefetched.has(m.id) || !(this.text.anchorOf(phraseId) || soon.has(m.id))) continue;
      this.prefetched.add(m.id);
      const variant = (readMemoryCounts()[m.id] ?? 0) > 0 ? m.variants.revisit[0] ?? m.variants.first : m.variants.first;
      const idle = (window as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      idle(() => void this.memoryChunk().then((rt) => rt.prefetch(m.id, variant, { quality: this.prefs.quality, screen: { width: innerWidth, height: innerHeight } })));
    }
  }
  private frameCount = 0;

  private stepLivingMemory() {
    this.studioTick?.(performance.now());
    this.prefetchMemories();
    const l = this.living;
    if (!l) return;
    if (l.held) {
      // In the editor, re-read the timeline every frame so an edit shows as it is made.
      const f = this.studioTick ? l.memory.controller.refresh() : l.memory.controller.frame;
      if (f) {
        this.memoryWindow.update(f.final, this.rig.restingEye, 1 / 60);
        this.drawLiving(l, f, 0);
        this.bleedMemory(l, f);
      }
      return;
    }
    // One reading of the audio clock for the frame: the memory's clock and every sound it schedules
    // (or resumes, or brings back) use the same, so the picture and its sound never part.
    const ctx = this.audio?.ctx;
    const now = ctx?.currentTime, running = ctx?.state === 'running';
    // With its sound stopped (a phone's call; the context still resuming after a hidden tab, or
    // not yet running as it begins) it waits for it, so the two come back together: on real time
    // it would run on ahead of its sound, which never finds it again. Stopped ten seconds while
    // visible, it is let go uncounted, as a vignette is (QA, 2026-10-20).
    const down = !!ctx && !running && !l.gaveUp;
    if (down && !document.hidden && this.mode !== 'settings') {
      l.downSince ??= performance.now();
      if (performance.now() - l.downSince > 10000) {
        l.gaveUp = true;
        this.endLivingMemory('hidden');
      }
    } else l.downSince = null;
    const paused = this.mode === 'settings' || document.hidden || (down && !l.gaveUp);
    const c = l.memory.controller;
    if (paused !== c.isPaused) paused ? c.pause() : c.resume(now);
    const dt = this.memoryClock.tick(performance.now() / 1000, now ?? 0, running, paused);
    this.judgeMemoryAttention(l, dt);
    const frame = l.memory.step(dt, now);
    if (frame) {
      this.memoryWindow.update(frame.final, this.rig.restingEye, dt);
      this.drawLiving(l, frame, dt);
      this.bleedMemory(l, frame);
    }
  }

  /**
   * A living memory's frame: how far in (the carry, the settle), then its scene drawn for the
   * part of the painting on the screen. The window is placed first (its painting's place is
   * where the visitor is carried to).
   */
  private drawLiving(l: NonNullable<App['living']>, f: { t: number; state: Lifecycle; position: number; final: Record<string, number> }, dt: number) {
    const pl = l.memory.prepared.living;
    // (How far it has played, for variants with no scene too: their seenAt is judged by it.)
    l.reached = Math.max(l.reached, f.position);
    if (!pl) {
      // (A living memory's revisit stays on the wall, as any memory, but lies under its writing as
      // the scene did. Every other memory keeps its words on bare plaster, legible: washInputs.)
      this.washUnderPainting(l, f.final);
      // Of what it would have told, a still tells only its going back into the wall (a film that
      // could not be had left a screen reader with its opening line alone: QA, 2026-10-22).
      const later = l.memory.prepared.def.announce?.(l.memory.prepared.variant) ?? [];
      const exit = l.memory.prepared.def.sections.exit;
      while (l.told < later.length && f.position >= later[l.told].at && f.state !== 'emerging') {
        const line = later[l.told++];
        if (line.at >= exit && !line.inside && line.shot === undefined) this.srRegion().textContent = line.text;
      }
      return;
    }
    const aspect = innerWidth / innerHeight;
    const upright = aspect < UPRIGHT;
    // The shot on now, chosen first so the view frames it from its first frame. The two-shot only
    // for someone taken all the way in; turned 14° from it, the wide until they settle facing it
    // again (interaction and QA reviews, 2026-10-17 and 18). Only on a screen that can frame it
    // (the spec's aspects: never upright, where a 16:9 two-shot holds one face and the wide holds
    // both, with her look and his drawn in it; the reviews of 2026-10-18): elsewhere the dusk cut
    // is its only cut.
    const shot = pl.scene.choose(f.final, { inside: this.inside.taken, turn: this.inside.turned, t: f.t, now: this.time, aspect });
    this.post.close = shot > 0 ? 1 : 0;
    const focus = upright ? pl.spec.cover.upright : pl.spec.coverAt?.(aspect) ?? (aspect > 2.0 ? pl.spec.cover.ultra : pl.spec.cover.wide);
    const go = this.inside.step(dt, {
      immerse: f.final['scene.immerse'] ?? 0,
      focus,
      held: l.held,
      enter: pl.immerse,
      away: l.away,
      leavingNaturally: f.state === 'withdrawing' || f.state === 'residue',
      approach: 'scene.approach' in f.final ? f.final['scene.approach'] : undefined,
      torn: pl.torn,
      scale: upright ? pl.spec.cover.uprightScale ?? 1 : 1,
    }, { reduced: this.prefs.reducedMotion, aspect, scene: pl.scene.target.texture, group: l.anchor.group });
    // The window was placed before the spread changed: place it again for this frame.
    this.memoryWindow.update(f.final, this.rig.restingEye, 0);
    // Inside the painting the white room's hum goes further down (it is not in the clearing), and
    // comes back as the painting goes back to the wall (the sound designer's review, 2026-10-18).
    const deep = this.inside.entered && (f.final['scene.immerse'] ?? 0) >= 0.9;
    if (deep !== l.deep && f.state !== 'residue' && f.state !== 'complete') {
      l.deep = deep;
      this.audio?.memoryHush(deep ? DEEP_HUSH : l.memory.prepared.def.hush, deep ? 2.5 : 4.5);
    }
    this.washUnderPainting(l, f.final);
    // (Its dusk is dark: a sound's caption over it, while it fills the view, is light words, not a
    // pale pill; on the wall, in the white room, the pill.)
    this.captions.dim = this.inside.entered && (f.final['scene.immerse'] ?? 0) >= 0.6 && (f.final['scene.after'] ?? 0) >= 0.5;
    pl.scene.reduced = this.prefs.reducedMotion;
    // (The two-shot's frame is the screen's: a narrower one sees less of its width, a wider one less of its height.)
    pl.scene.update(this.renderer, f.t, f.final, { view: this.inside.view, parallax: new THREE.Vector2(), aspect });
    // What changes later, told to a screen reader when it happens (not before: the cut is not given away).
    const later = l.memory.prepared.def.announce?.(l.memory.prepared.variant) ?? [];
    while (l.told < later.length && f.position >= later[l.told].at && f.state !== 'emerging') {
      const line = later[l.told++];
      // (A close-up's line only while it is shown; what happens inside only to someone taken in;
      // the wall's own line only to someone it stayed on the wall for.)
      const told = line.shot !== undefined ? shot === line.shot : line.inside ? this.inside.entered : line.wall ? !this.inside.entered : true;
      if (told) this.srRegion().textContent = line.text;
    }
    const coda = l.memory.prepared.def.coda;
    if (coda && dt > 0 && f.position >= coda.at) this.writeCoda(l);
    if (go) this.endLivingMemory('interrupt');
  }

  /**
   * Its line where the painting was (decisions 119–123): once, while it plays on unbroken to there,
   * for someone taken all the way in; in the hand and size of its own line, under it, silently. A
   * line whose own place is beside it is kept off the walls for the rest of the visit (137). As its
   * position passes the line's moment, or, if no frame was drawn there (one long frame), as it ends.
   */
  private writeCoda(l: NonNullable<App['living']>): void {
    const coda = l.memory.prepared.def.coda;
    if (!coda || l.coda || l.held || coda.variant !== l.memory.prepared.variant || !this.inside.entered || !(l.why === null || l.why === 'complete') || this.mode !== 'room') return;
    l.coda = true;
    const own = this.text.items.get(l.key);
    const waiting = own ? this.text.writeWithin({ key: `coda:${l.id}`, text: coda.text, hand: own.hand, size: own.size, under: l.key, within: this.memoryWindow.painting,
      purpose: 'annotation', now: this.time, source: this.text.phraseOf(l.key) ?? undefined }) : null;
    if (waiting) {
      this.director.keepBack(waiting);
      this.srRegion().textContent = `Written on the wall where the painting was: ${coda.text}`;
    }
  }

  /**
   * The room's writing under a living memory's painting, its own line too (`washOf`: each piece
   * goes to a trace just ahead of the colour, and comes back with the pencil, or as the painting
   * goes if it is let go early; reviews of 2026-10-17 and 18). A revisit without its own scene (no
   * order map) has the colour everywhere at once, at the reveal's half way.
   */
  private washUnderPainting(l: NonNullable<App['living']>, final: Record<string, number>) {
    const m = washInputs(l.memory.prepared.def, l.memory.prepared.living, final, l.memory.controller.weights.presence);
    if (!m) return;
    for (const it of this.text.items.values()) {
      const a = this.text.anchorOfKey(it.key);
      if (!a || a.group !== l.anchor.group) continue;
      const w = washOf(a, this.memoryWindow.rect, m.colourAt, m.reveal, m.presence, m.hold);
      if (w <= 0 && !l.washed.has(it.key)) continue;
      // (Its own line may be in the memory's light as well: the more washed of the two.)
      this.text.wash(it.key, it.key === this.memoryKey ? Math.max(w, this.lightWash) : w);
      l.washed.add(it.key);
    }
  }

  private bakeOldDrawings() {
    const idle = (f: () => void) => ((window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((g: () => void) => setTimeout(g, 30)))(f, { timeout: 400 });
    const pending = STATIC_DRAWINGS.filter((d) => !this.text.items.has(d.id));
    const next = () => {
      const d = pending.shift();
      if (!d) return;
      this.text.setShown(d.id);
      idle(next);
    };
    idle(next);
  }

  /** One word for the next visit about how this one left the chair; nothing after a forget. */
  private keepTrace() {
    if (!this.forgotten) writeTrace(this.director.leaving());
  }

  private beginOpening() {
    this.bakeOldDrawings();
    const returning = readOpeningSeen();
    const score = openingScore({ returning, touch: this.touch });
    this.opening = { score, start: wallClock(), fired: new Set() };
    this.director.hold();
    this.rig.frameOpening(innerWidth / innerHeight);
    this.rig.enabled = false;
    this.rig.walk = false;
    if (this.ambience) this.ambience.score.drone = 0;
    document.body.classList.add('dark-room');
    // The threshold becomes the title card: everything but the title goes; the score shows it.
    const th = $('threshold');
    th.classList.add('titling');
    $<HTMLElement>('title').style.opacity = returning ? '0' : '1';
    if (returning) th.hidden = true;
  }

  /** Apply the opening's levels for this moment, perform what is due, and hand over at the end. */
  private playOpening() {
    const o = this.opening!;
    const t = wallClock() - o.start;
    let lv = levelsAt(o.score, t);
    if (o.skip) {
      // Skipping eases everything to the room as it will be, never a hard cut.
      const k = Math.min(1, (wallClock() - o.skip.at) / 1.2);
      const e = k * k * (3 - 2 * k);
      const mix = {} as Levels;
      for (const key of Object.keys(ROOM_LEVELS) as (keyof Levels)[]) mix[key] = o.skip.from[key] + (ROOM_LEVELS[key] - o.skip.from[key]) * e;
      mix.title = o.skip.from.title * (1 - Math.min(1, k * 3));
      lv = mix;
      if (k >= 1) return this.finishOpening();
    }
    $<HTMLElement>('title').style.opacity = String(lv.title);
    if (lv.title <= 0.001 && t > 1 && !$('threshold').hidden) $('threshold').hidden = true;
    this.post.black = lv.black;
    this.post.scoreDark = lv.dark;
    const sc = this.lighting.score;
    sc.key = lv.key;
    sc.area = lv.area;
    sc.hemi = lv.hemi;
    sc.glow = lv.glow;
    sc.cone = lv.cone;
    this.room.setLit(lv.panel, lv.ceiling);
    if (this.ambience) {
      this.ambience.score.hum = lv.hum;
      this.ambience.score.vent = lv.vent;
      this.ambience.score.outside = 0.35 + 0.65 * lv.vent;
    }
    this.rig.enabled = lv.look > 0.5;
    this.rig.walk = lv.walk > 0.5;
    document.body.classList.toggle('dark-room', lv.area < 0.5);
    if (o.skip) return;
    o.score.events.forEach((ev, i) => {
      if (o.fired.has(i) || t < ev.at) return;
      if (ev.kind === 'handoff' && wallClock() < this.voiceUntil) return;
      // The laugh only after the hand has stopped and the stop has been held.
      if (ev.kind === 'voice' && ev.afterStop !== undefined && wallClock() < this.writeDoneAt + ev.afterStop) return;
      o.fired.add(i);
      this.performOpening(ev);
    });
    // Nobody is held: whatever happens, the room is theirs within 40 s.
    if (t > Math.max(40, o.score.handoff + 5)) this.finishOpening();
  }

  private performOpening(ev: ScoreEvent, skipping = false) {
    switch (ev.kind) {
      case 'prepare': {
        this.text.prepare(ev.phrases);
        // The voiced line is made now too, in the dark: making writing costs a moment, and that
        // moment must not fall where the voice begins.
        const v = this.opening?.score.events.find((e) => e.kind === 'voice');
        if (v && v.kind === 'voice') this.prepareVoiceLine(v);
        break;
      }
      case 'sound': {
        if (skipping || !this.voices || !this.audio) break;
        const c = this.chair.group.position;
        const place: VoicePlacement =
          ev.where === 'chair' ? { from: [c.x, 0.45, c.z] } : ev.where === 'door' ? { from: [0.9, 1.25, ROOM.halfD - 0.1] } : { from: [0, ROOM.height - 0.1, -0.95] };
        const kind = ev.key.replace('sfx:', '') as 'switch' | 'chair-creak' | 'door' | 'cup' | 'graphite';
        void this.voices.sound(kind, place, ev.gain).then((dur) => {
          if (dur > 0 && ev.caption) this.captions.show(ev.caption, Math.max(1.6, dur), true);
        });
        break;
      }
      case 'write': {
        const done = this.text.writeOn(ev.phrase, { upto: ev.upto, instant: skipping });
        this.writeDoneAt = done;
        if (!skipping && ev.sound && this.voices && this.audio) {
          const w = this.text.whereIs(ev.phrase);
          // The pencil is heard while the hand writes and nobody speaks.
          if (w && done - wallClock() > 0.5) void this.voices.sound('graphite', { from: [w.centre.x, w.centre.y, w.centre.z] }, 0.32);
        }
        break;
      }
      case 'voice': {
        if (skipping) break;
        const key = this.prepareVoiceLine(ev);
        // The hand-off waits for the voice (it may start late on a slow phone).
        this.voiceUntil = wallClock() + 30;
        void this.speakAndWrite(key, ev.phrase, ev.text, ev.file).finally(() => {
          this.voiceUntil = Math.min(this.voiceUntil, wallClock() + 0.8);
        });
        break;
      }
      case 'handoff':
        this.finishOpening();
        break;
    }
  }

  /** Until when the opening's voice (and its writing) is still going, wall clock. */
  private voiceUntil = 0;
  /** When the opening's first hand stops (wall clock). */
  private writeDoneAt = 0;

  /** The writing a voice will write in the opening: made once, in advance. */
  private prepareVoiceLine(ev: Extract<ScoreEvent, { kind: 'voice' }>): string | null {
    const key = `opening:${ev.phrase}`;
    if (this.text.items.has(key)) return key;
    void ev.besideOf;
    // To the right of the chair at about eye height, well below the cornice: in frame from the
    // door on a phone held upright (the wall's u runs west to east from its west end).
    const c = this.chair.group.position;
    const near = { u: c.x + ROOM.halfW + 1.0, v: 1.35 };
    for (const size of ['m', 's'] as const) {
      if (this.text.write({ key, text: ev.text, hand: ev.hand, size, surface: 'north', near, purpose: 'recall', ttl: 0, now: this.time, source: ev.phrase, start: false })) return key;
    }
    return null;
  }

  /** A voice from where its words are written, and the words written as they are heard. */
  private async speakAndWrite(writeKey: string | null, phraseId: string, text: string, file: string) {
    let played: Played = { duration: 0 };
    // The room draws breath just before the laugh.
    this.audio?.silence(0.3, 2.6, 0.3);
    if (this.voices && this.audio) {
      played = await this.voices.playLine('tender', text, writeKey ? { ...this.place({ kind: 'surface', phraseId: writeKey }) } : this.place({ kind: 'chair' }), 0.9, `phrase:${phraseId}`, {
        performances: [file], priority: true,
      });
    }
    const writtenBy = writeKey ? this.writeWithVoice(writeKey, played) : 0;
    // When the words are being written in view, the wall is their caption; the caption follows
    // once the hand has finished, rather than giving the line away first.
    if (writeKey) setTimeout(() => this.captions.show(text, 3, false), Math.max(0, writtenBy - wallClock()) * 1000);
    else this.captions.show(text, played.duration > 0 ? played.duration : 3.5, false);
    // Wait for the voice to end and the hand to finish, then a breath.
    const voiceEnd = wallClock() + Math.max(0, played.duration) ;
    await new Promise((r) => setTimeout(r, Math.max(0, Math.max(voiceEnd, writtenBy) - wallClock()) * 1000));
  }

  /** Write a piece of writing following the recording just played (or at the hand's own pace if there is none). */
  private writeWithVoice(key: string, played: Played): number {
    const timing = played.file ? (VOICE_TIMINGS as unknown as Record<string, { chars: [number, number][] }>)[played.file] : undefined;
    if (timing && played.startAt !== undefined && this.audio) {
      const ctx = this.audio.ctx;
      const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
      return this.text.writeOn(key, { speech: timing.chars, audioStart: wallClock() + (played.startAt - ctx.currentTime) + latency });
    }
    return this.text.writeOn(key);
  }

  /** Finish an unfinished line: the hand goes on as the first missing word is heard. */
  private finishWithVoice(id: string, played: Played) {
    const timing = played.file ? (VOICE_TIMINGS as unknown as Record<string, { chars: [number, number][] }>)[played.file] : undefined;
    if (!timing || played.startAt === undefined || !this.audio) return this.text.finish(id, 0.6);
    const ctx = this.audio.ctx;
    const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
    const audioStart = wallClock() + (played.startAt - ctx.currentTime) + latency;
    const at = this.text.nextWordStart(id);
    const heard = at !== null && timing.chars[at] ? audioStart + timing.chars[at][0] : wallClock() + 0.6;
    this.text.finish(id, Math.max(0, heard - wallClock()));
  }

  /** Skip (Esc, the Skip button, a hidden tab): what was to be written is written; the light eases up. */
  skipOpening() {
    const o = this.opening;
    if (!o || o.skip) return;
    const t = wallClock() - o.start;
    o.score.events.forEach((ev, i) => {
      if (o.fired.has(i)) return;
      o.fired.add(i);
      if (ev.kind === 'prepare' || ev.kind === 'write') this.performOpening(ev, true);
    });
    o.skip = { at: wallClock(), from: levelsAt(o.score, t) };
  }

  /** A tap during the title: the title goes now (it has been read), the rest keeps its time. */
  private advanceTitle() {
    const o = this.opening;
    if (!o) return;
    const t = wallClock() - o.start;
    const dark = o.score.stages.find(([st]) => st === 'dark')?.[1] ?? t;
    // Skip forward to a second before the dark, never backwards, never past the title's own fade.
    const to = Math.max(t, dark - 1.0);
    o.start -= to - t;
  }

  private finishOpening() {
    if (!this.opening) return;
    this.opening = null;
    const sc = this.lighting.score;
    sc.area = sc.hemi = sc.glow = 1;
    sc.key = ROOM_LEVELS.key;
    sc.cone = ROOM_LEVELS.cone;
    this.room.setLit(1, 1);
    this.post.black = 0;
    this.post.scoreDark = 0;
    if (this.ambience) Object.assign(this.ambience.score, { hum: 1, vent: 1, outside: 1, drone: 1 });
    this.rig.enabled = this.mode === 'room';
    this.rig.walk = true;
    document.body.classList.remove('dark-room');
    $('threshold').hidden = true;
    $('skip').hidden = true;
    $('menu-btn').hidden = false;
    $('write-btn').hidden = false;
    if (this.mode === 'room') this.renderer.domElement.focus();
    this.director.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED.filter((id) => this.text.unfinished(id)) });
    this.handoffAt = this.time;
    this.rig.endOpeningFrame();
    writeOpeningSeen();
  }

  private wakeLock: { release(): Promise<void> } | null = null;
  /** The room rewards standing still; the screen shouldn't go dark for it. */
  private async keepAwake() {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl && !this.wakeLock) this.wakeLock = await wl.request('screen');
    } catch {
      /* refused or unsupported: the screen may sleep */
    }
  }

  // ─────────────────────────────── frame ───────────────────────────────

  private frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    // (A memory held at a position, as the editor and a capture hold it, holds the room too.)
    const running = (this.mode === 'room' || this.mode === 'contribute') && !this.living?.held;

    // The opening holds light, image, sound and what the visitor may do; afterwards the room
    // is the Director's. Hints only once the room is theirs, and only if they haven't found out.
    if (this.mode !== 'threshold') {
      if (this.ambience) this.ambience.fade = 1;
      if (this.leaving !== null) this.playLeaving();
      else if (this.opening) this.playOpening();
      else {
        // The room's light, when the Director takes it back to the chair alone: the fixture goes
        // down with it (a blazing panel over a darkening room reads as a brownout), never out.
        const m = this.lighting.roomLight;
        this.room.setLit(0.08 + 0.92 * m ** 1.5, m);
        this.text.airShadowLight = this.lighting.score.key / ROOM_LEVELS.key;
        const since = this.time - this.handoffAt;
        // (No hint while a memory is forming or playing, painted or heard: it waits. On a phone a
        // hint would sit where a vignette's captions are.)
        const remembering = !!this.living || !!this.vignette;
        if (!this.hintShown && since > 4 && !(this.touch && this.dragged) && !remembering) this.showHint();
        // Someone exploring only by eye, still sitting where the opening left them, may not know
        // they can get up: told once, never moved for them.
        if (!this.touch && !this.walkHintShown && since > 25 && this.rig.seated && this.mode === 'room' && !remembering) {
          this.walkHintShown = true;
          const h = $('hint');
          h.textContent = '↑ or W to walk · Esc to pause';
          h.classList.add('on');
          setTimeout(() => h.classList.remove('on'), 5500);
        }
        if (this.touch && this.mode === 'room' && !this.touchHintShown && since > 12 && !this.touched && !remembering) this.showTouchHint();
      }
    }

    // (Inside a living memory, looking and walking are the memory's: src/world/living/Inside.ts.)
    if (!this.opening) this.rig.enabled = this.mode === 'room' && !this.inside.locked;
    else if (this.mode !== 'room') this.rig.enabled = false;
    this.rig.update(dt, this.room, this.chair.group.position);

    // Attention.
    const cam = this.rig.camera;
    this.gazeId = this.text.attention(cam);
    const gazePhrase = this.text.phraseOf(this.gazeId);
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    this.gazeChair = this.raycaster.intersectObject(this.chair.hit, false).length > 0 && this.rig.distanceToChair() < 6;

    if (running) {
      const input = {
        x: this.rig.pos.x - this.chair.group.position.x,
        z: this.rig.pos.z - this.chair.group.position.z,
        yaw: this.rig.yaw,
        pitch: this.rig.pitch,
        gazePhraseId: gazePhrase,
        gazeChair: this.gazeChair,
        nearSurface: this.room.nearWall(this.rig.pos.x, this.rig.pos.z),
        kneeling: this.rig.kneeling,
        carried: this.inside.carrying,
      };
      const cues = this.director.tick(dt, input, this.room.facing(this.rig.yaw));
      for (const c of cues) this.apply(c.cue);
    }

    const env = this.director.env;
    const v = this.director.visitor;
    const scaleTarget = this.prefs.reducedMotion ? 1 + (env.roomScale - 1) * 0.3 : env.roomScale;
    this.room.setScale(this.room.scale + (scaleTarget - this.room.scale) * (1 - Math.exp(-dt / 6)));
    this.lighting.update(dt, env, this.time, this.chair.group.position, this.chair.group.rotation.y);
    if (this.lighting.shadowDirty) this.renderer.shadowMap.needsUpdate = true;
    // Exposure, like the look's light, comes and goes with the room's own light (the opening, a dim).
    const room = THREE.MathUtils.clamp(this.lighting.score.area, 0, 1) * this.lighting.roomLight;
    this.renderer.toneMappingExposure = LOOKS.original.exposure + (this.look.exposure - LOOKS.original.exposure) * room;
    this.text.faintBoost = 1 + (this.look.faint - 1) * room;
    this.post.contrast = this.look.contrast * room;
    this.room.setWarmth(this.lighting.warmthNow);
    // The chair's contact with the floor is there as the light on it is: none in the dark.
    (this.chair.contact.material as THREE.MeshBasicMaterial).opacity = this.chairContact * Math.min(1, this.lighting.keyLevel);
    (this.chair.seatShade.material as THREE.MeshBasicMaterial).opacity = this.chairContact * Math.min(1, this.lighting.panelLevel);
    this.lightWash = 0;
    if (this.memoryKey) {
      // The light washes the words out a little (to about half their strength), then gives them back.
      const m = this.memoryLight.update(this.time);
      this.lightWash = 0.35 * m;
      this.text.wash(this.memoryKey, this.lightWash);
      if (!this.memoryLight.active) this.memoryKey = null;
    }
    this.stepLivingMemory();
    this.stepVignette();
    this.text.update(dt, this.time, cam, env, this.gazeId, v.gazeId === gazePhrase ? v.gazeFor : 0);
    this.post.update(dt, env, this.time);

    if (this.audio) {
      const p = cam.position;
      const f = cam.getWorldDirection(new THREE.Vector3());
      this.audio.updateListener(p.x, p.y, p.z, f.x, f.y, f.z);
      this.ambience?.update(dt, env, this.time);
    }

    this.post.render();
    if (this.debug && this.time - this.lastDebug > 0.25) this.updateDebug();
  }

  // ─────────────────────────────── cues ───────────────────────────────

  private apply(cue: Cue) {
    switch (cue.type) {
      case 'reveal':
        this.text.reveal(cue.phraseId, cue.seconds * (this.prefs.reducedMotion ? 0.7 : 1));
        break;
      case 'hide':
        this.text.hide(cue.phraseId, cue.seconds);
        break;
      case 'redraw':
        this.text.redraw(cue.phraseId, cue.seconds * (this.prefs.reducedMotion ? 0.7 : 1));
        break;
      case 'write': {
        const c = this.chair.group.position;
        const near = cue.nearPoint && cue.surface === 'floor'
          ? { u: c.x + cue.nearPoint.x + ROOM.halfW, v: c.z + cue.nearPoint.z + ROOM.halfD }
          : cue.surface && !cue.beside ? this.viewPointOn(cue.surface) : undefined;
        const size = this.touch && cue.size === 'xs' && cue.purpose === 'recall' ? 's' : cue.size;
        // A memory's line by the drawing it opens from; looking at the drawing is reading it too.
        if (cue.under && cue.source) this.text.drawingMeans(cue.under, cue.source);
        const ok = this.text.write({ key: cue.key, text: cue.text, hand: cue.hand, size, beside: cue.beside, surface: cue.surface, near, by: cue.under, purpose: cue.purpose, ttl: cue.ttl, now: this.time, source: cue.source, start: !cue.found });
        if (ok && cue.found) this.text.appear(cue.key, 5);
        if (ok && cue.strike) this.text.strike(cue.strike, this.time, cue.ttl);
        if (!ok) this.director.writeFailed(cue.key);
        break;
      }
      case 'link':
        this.text.link(cue.a, cue.b, cue.ttl, this.time);
        break;
      case 'voice':
        void this.playVoice(cue);
        break;
      case 'music':
        if (this.music && this.audio) {
          if (cue.melody?.length) this.music.playMelody(cue.melody, cue.stopAt);
          else this.music.play(cue.mood, cue.notes, cue.truncate);
        }
        break;
      case 'sound':
        if (this.voices && this.audio) void this.voices.sound(cue.kind, this.place(cue.position), cue.gain);
        break;
      case 'stopVoice':
        this.voices?.stop(cue.tag, cue.fade);
        break;
      case 'glow': {
        const c = this.chair.group.position;
        this.lighting.leaveResidue(c.x + cue.x, c.z + cue.z, cue.amount * (this.prefs.intensity === 'gentle' ? 0.6 : 1), cue.seconds, this.time);
        break;
      }
      case 'chairTurn': {
        const c = this.chair.group.position;
        this.chair.turnToward(c.x + cue.x, c.z + cue.z, cue.amount);
        break;
      }
      case 'erode':
        this.text.erode(cue.key, cue.keep, this.time);
        break;
      case 'vignette': {
        void this.playVignette(cue.id, cue.variant).then((ok) => {
          if (!ok) this.director.memoryFailed(cue.id);
        });
        break;
      }
      case 'memory-scene': {
        void this.playMemory(cue.id, cue.phraseId, cue.variant, cue.voices).then((ok) => {
          if (!ok) this.director.memoryFailed(cue.id);
        });
        break;
      }
      case 'memory': {
        const a = this.text.anchorOf(cue.phraseId, this.gazeId ?? this.lastTappedKey);
        if (!a) break;
        this.memoryLight.reducedMotion = this.prefs.reducedMotion;
        this.memoryLight.strength = this.prefs.intensity === 'gentle' ? 0.6 : 1;
        // The room hushes first; 0.8 s later the light arrives; the present comes back only after it has gone.
        const lead = 0.8, total = cue.attack + cue.hold + cue.release;
        this.memoryLight.start(a.group, a.x, a.y, a.w, a.h, a.minX, a.maxX, a.maxY, cue, this.time, lead);
        this.memoryKey = a.key;
        this.audio?.silence(0.55, lead + total, 1.4, 2.5);
        // And the room's own light gives way a little: the memory is brighter than the present.
        this.lighting.dimToChair(0.93, lead + total, this.time);
        break;
      }
      case 'draw':
        if (!this.text.draw(cue.id)) this.director.drawFailed(cue.id);
        break;
      case 'air': {
        // Between the chair and the visitor, nearer the chair, facing where they stand.
        const c = this.chair.group.position;
        const p = this.rig.camera.getWorldPosition(new THREE.Vector3());
        const dir = new THREE.Vector3(p.x - c.x, 0, p.z - c.z);
        if (dir.lengthSq() < 1e-4) break;
        dir.normalize();
        // To the visitor's left, so the chair stands at the end of the line rather than under its middle.
        const at = new THREE.Vector3(c.x + dir.x * cue.toward - dir.z * cue.aside, cue.height, c.z + dir.z * cue.toward + dir.x * cue.aside);
        this.text.writeInAir({ key: `air:${cue.phraseId}`, phraseId: cue.phraseId, at, face: p, light: this.lighting.key.position, now: this.time });
        break;
      }
      case 'silence':
        // A silence dimmed for its whole length (at the chair): its sound starts back a few seconds
        // before its light does (heard, then seen).
        if (cue.dim !== undefined && cue.dimSeconds === cue.seconds) this.audio?.silence(cue.depth * (this.prefs.intensity === 'gentle' ? 0.8 : 1), Math.max(1, cue.seconds - 8), 1.4, 2.5);
        else this.audio?.silence(cue.depth * (this.prefs.intensity === 'gentle' ? 0.8 : 1), cue.seconds);
        if (cue.dim !== undefined) this.lighting.dimToChair(this.prefs.intensity === 'gentle' ? Math.max(cue.dim, 0.5) : cue.dim, Math.min(cue.seconds, cue.dimSeconds ?? 11), this.time);
        break;
      case 'lift':
        // The room is heard coming back first; its light follows two seconds later.
        this.audio?.lift(cue.seconds);
        this.lighting.liftDim(this.time + 2, cue.seconds);
        break;
      case 'chairNudge':
        this.chair.nudge(cue.dx, cue.dz, cue.dyaw);
        break;
      case 'flash':
        this.lighting.triggerFlash(cue.kind, cue.amount * (this.prefs.intensity === 'gentle' ? 0.5 : 1), cue.seconds, this.time);
        break;
    }
  }

  /** Where the centre of view meets a surface, in layout (u, v) coordinates. */
  /** The drawings on a wall (their rectangles in its group's metres). */
  private drawingsOn(group: THREE.Object3D): { x: number; y: number; w: number; h: number }[] {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (const it of this.text.items.values()) {
      if (it.purpose !== 'drawing' || it.vis < 0.2) continue;
      const a = this.text.anchorOfKey(it.key);
      if (a && a.group === group) out.push({ x: a.x, y: a.y, w: a.w, h: a.h });
    }
    return out;
  }

  private viewPointOn(surface: Surface): { u: number; v: number } | undefined {
    const frame = this.room.frames[surface];
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.rig.camera);
    const hit = this.raycaster.intersectObject(frame.mesh, false)[0];
    if (!hit) return undefined;
    const local = frame.group.worldToLocal(hit.point.clone());
    const s = this.room.scale;
    if (surface === 'floor') return { u: local.x / s + frame.size.w / 2, v: frame.size.h / 2 - local.y / s };
    if (surface === 'ceiling') return { u: local.x / s + frame.size.w / 2, v: local.y / s + frame.size.h / 2 };
    return { u: local.x / s + frame.size.w / 2, v: local.y + frame.size.h / 2 };
  }

  private place(p: VoicePosition): VoicePlacement {
    const c = this.chair.group.position;
    const cam = this.rig.camera.position;
    switch (p.kind) {
      case 'chair':
        return { from: [c.x, 0.45, c.z] };
      case 'behind': {
        const f = this.rig.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        return { from: [cam.x - f.x * 1.1, cam.y, cam.z - f.z * 1.1] };
      }
      case 'nowhere':
        return { nowhere: true };
      case 'beyond': {
        const hw = this.room.halfW, hd = this.room.halfD;
        const r = (hashString(String(this.time)) % 100) / 100 - 0.5;
        const pts = {
          north: [r * 4, 1.5, -hd - 2],
          south: [r * 4, 1.5, hd + 2],
          east: [hw + 2, 1.5, r * 4],
          west: [-hw - 2, 1.5, r * 4],
          floor: [0, -2, 0],
          ceiling: [0, ROOM.height + 2, 0],
        }[p.surface] as [number, number, number];
        return { from: pts, muffled: true };
      }
      case 'surface': {
        const w = this.text.centreOf(p.phraseId);
        return w ? { from: [w.x, w.y, w.z] } : { from: [c.x, 0.5, c.z] };
      }
      case 'approach': {
        const sx = cam.x > 0 ? -1 : 1, sz = cam.z > 0 ? -1 : 1;
        return { from: [sx * this.room.halfW * 0.9, 1.5, sz * this.room.halfD * 0.9], to: [c.x, 0.6, c.z] };
      }
    }
  }

  private async playVoice(cue: Extract<Cue, { type: 'voice' }>) {
    let dur = 3;
    if (cue.lead && this.audio) {
      // Falls fast enough to be felt before the first word (and never lifts a deeper silence).
      this.audio.silence(0.4 * (this.prefs.intensity === 'gentle' ? 0.8 : 1), cue.lead + 3.5, 0.4);
      await new Promise((r) => setTimeout(r, cue.lead! * 1000));
      if (this.mode === 'departed') return;
    }
    let played: Played = { duration: 0 };
    if (this.voices && this.audio) {
      const assetKey = cue.assetId ?? (cue.phraseId ? `phrase:${cue.phraseId}` : undefined);
      played = await this.voices.playLine(cue.kind, cue.text, { ...this.place(cue.position), tag: cue.tag }, cue.gain, assetKey, {
        melody: cue.melody, synth: cue.synth, performances: cue.performances,
      });
      dur = played.duration;
    }
    // What is said can become writing: written where the line belongs as it is heard, or an
    // unfinished line finished as its missing words are spoken.
    if (cue.phraseId && cue.write) this.writeWithVoice(cue.phraseId, played);
    if (cue.phraseId && cue.finish) this.finishWithVoice(cue.phraseId, played);
    if (dur > 0) this.captions.show(cue.caption, dur, cue.text === null);
  }

  // ─────────────────────────────── input ───────────────────────────────

  private interact() {
    if (this.mode !== 'room' || this.inside.locked) return;
    const d = this.rig.distanceToChair();
    if (this.rig.kneeling) {
      this.rig.setKneel(false);
      return;
    }
    if (this.gazeChair || d < 1.2) {
      if (d < 1.5) this.rig.setKneel(true);
      else this.rig.attend(this.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    this.attendGaze();
  }

  /** Looking: the room's, or (inside a living memory) the memory's. */
  private lookBy(dx: number, dy: number) {
    if (!this.inside.look(dx, dy)) this.rig.look(dx, dy);
  }

  private attendGaze() {
    if (this.gazeChair) {
      this.rig.attend(this.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    if (this.gazeId) {
      const c = this.text.centreOf(this.gazeId);
      const it = this.text.items.get(this.gazeId);
      const pid = this.text.phraseOf(this.gazeId);
      this.lastTappedKey = this.gazeId;
      if (pid) this.director.tapped({ phraseId: pid });
      if (c && it) {
        const s = it.placement.surface;
        if (s === 'floor') this.rig.attend(c, 0.8);
        else if (s === 'ceiling') this.rig.faceToward(c);
        else this.rig.attend(c, 1.25);
      }
    }
  }

  private cyclePhrase(dir: 1 | -1) {
    const cam = this.rig.camera.position;
    const vis: { centre: THREE.Vector3 }[] = [...this.text.items.values()].filter((i) => i.vis > 0.5 && i.purpose !== 'drawing' && i.uniforms.uOpacity.value > 0.2 && i.placement.surface !== 'ceiling');
    const air = this.text.airCentre;
    if (air) vis.push({ centre: air });
    if (!vis.length) return;
    vis.sort((a, b) => {
      const aa = Math.atan2(-(a.centre.x - cam.x), -(a.centre.z - cam.z));
      const bb = Math.atan2(-(b.centre.x - cam.x), -(b.centre.z - cam.z));
      return aa - bb;
    });
    this.tabIndex = (this.tabIndex + dir + vis.length) % vis.length;
    this.rig.faceToward(vis[this.tabIndex].centre);
  }

  private bindInput() {
    const canvas = this.renderer.domElement;
    const typing = () =>
      this.mode === 'contribute' || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT' || !!(document.activeElement as HTMLElement | null)?.closest?.('#tune');

    addEventListener('keydown', (e) => {
      if (this.mode === 'threshold' || this.mode === 'departed') return;
      // Held keys repeat: walking keys are tracked as held, everything else acts once.
      if (e.repeat && !e.code.startsWith('Arrow') && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) return;
      if (e.code === 'Escape' && this.opening && this.mode === 'room') {
        // During the opening, Esc is the way out of it (settings come afterwards; Esc inside
        // settings or the writing field closes them as usual).
        this.skipOpening();
        e.preventDefault();
        return;
      }
      if (this.opening && this.opening.score.name === 'first' && stageAt(this.opening.score, wallClock() - this.opening.start) === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        this.advanceTitle();
        e.preventDefault();
        return;
      }
      // Before the visitor can walk, the room's keys (write, approach, turn to the chair, kneel,
      // turn to writing) wait: they would act in the dark, or queue for later.
      if (this.opening && !this.rig.walk && ['KeyT', 'KeyF', 'KeyC', 'Space', 'Tab', 'Enter'].includes(e.code)) {
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        if (this.mode === 'contribute') this.closeContribute();
        else if (this.mode === 'settings') this.closeSettings();
        else this.openSettings();
        e.preventDefault();
        return;
      }
      if (typing() || this.mode !== 'room') return;
      // Inside a living memory: a new turn or step is the visitor's way out (Inside.ts); the
      // room's other keys wait.
      if (this.inside.locked) {
        if (e.code === 'KeyM') this.setPref('muted', !this.prefs.muted);
        if (!e.repeat) this.inside.freshKeys.add(e.code);
        this.rig.keys.add(e.code);
        if (e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.code === 'Tab') {
        this.cyclePhrase(e.shiftKey ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyT') {
        this.openContribute();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyF') this.attendGaze();
      if (e.code === 'KeyC') this.rig.faceToward(this.chair.group.position.clone().setY(0.35));
      if (e.code === 'Space' || e.code === 'Enter') {
        this.interact();
        e.preventDefault();
      }
      if (e.code === 'KeyK') this.rig.setKneel(!this.rig.kneeling);
      if (e.code === 'KeyM') this.setPref('muted', !this.prefs.muted);
      this.rig.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.rig.keys.delete(e.code);
      this.inside.freshKeys.delete(e.code);
    });
    addEventListener('blur', () => {
      this.rig.keys.clear();
      this.inside.freshKeys.clear();
    });

    // Mouse: pointer lock where possible, drag-to-look otherwise.
    let dragging = false;
    let dragInside = false;
    let lastX = 0, lastY = 0, downX = 0, downY = 0, downT = 0;
    let lockWanted = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'room') return;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      downT = performance.now();
      if (e.pointerType === 'mouse') {
        if (document.pointerLockElement === canvas) {
          this.interact();
          return;
        }
        dragging = true;
        dragInside = this.inside.locked;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'room') return;
      if (document.pointerLockElement === canvas) this.lookBy(e.movementX, e.movementY);
      else if (dragging && e.pointerType === 'mouse') {
        // (A drag begun before a living memory took the view isn't a turn away from it.)
        if (!this.inside.locked || dragInside) this.lookBy((e.clientX - lastX) * 1.2, (e.clientY - lastY) * 1.2);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse' || !dragging) return;
      dragging = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 5 && performance.now() - downT < 350 && this.mode === 'room') {
        // A click: try to take the mouse; if refused, a click still interacts.
        if (!this.touch && canvas.requestPointerLock) {
          lockWanted = true;
          try {
            const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            r?.catch?.(() => this.interact());
          } catch {
            this.interact();
          }
        } else this.interact();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && lockWanted && this.mode === 'room') {
        lockWanted = false;
        this.openSettings();
      }
    });

    // Touch: left half walks (vertical) and turns (horizontal); right half looks; tap goes to things.
    const touches = new Map<number, { side: 'L' | 'R'; x: number; y: number; sx: number; sy: number; t: number; inside: boolean }>();
    canvas.addEventListener('pointerdown', (e) => {
      // Touching the room while writing means: keep it to yourself after all.
      if (this.mode === 'contribute' && !$<HTMLInputElement>('contribute-input').value.trim()) this.closeContribute();
      if (e.pointerType === 'mouse' || this.mode !== 'room') return;
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { side: e.clientX < innerWidth / 2 ? 'L' : 'R', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp, inside: this.inside.locked });
      // A thumb put down to walk while inside a living memory is a way out (one already down isn't).
      if (e.clientX < innerWidth / 2 && this.inside.locked) this.inside.freshThumb = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (!t || this.mode !== 'room') return;
      if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 14) this.dragged = true;
      // A half-screen swipe turns about 65° on a narrow phone, as on a wide screen.
      // (A drag begun before a living memory took the view isn't a turn away from it.)
      if (t.side === 'R') {
        if (!this.inside.locked || t.inside) this.lookBy((e.clientX - t.x) * 1.6 * clamp(640 / innerWidth, 1, 1.8), (e.clientY - t.y) * 1.6);
      }
      else {
        // Walking: a thumb pushing up drifts sideways a little; that shouldn't turn the body.
        const dx = e.clientX - t.sx;
        // And a thumb meant to turn drifts up or down a little: that shouldn't walk.
        const dy = -(e.clientY - t.sy);
        this.rig.touchMove.set(clamp((Math.sign(dx) * Math.max(0, Math.abs(dx) - 20)) / 80, -1, 1), clamp((Math.sign(dy) * Math.max(0, Math.abs(dy) - 10)) / 90, -1, 1));
      }
      t.x = e.clientX;
      t.y = e.clientY;
    });
    const endTouch = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      if (t.side === 'L') {
        this.rig.touchMove.set(0, 0);
        this.inside.freshThumb = false;
      }
      if (e.type === 'pointerup' && this.mode === 'room' && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 14 && e.timeStamp - t.t < 450) this.tapAt(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);

    // The corner buttons stay out of sight until the pointer goes looking for them.
    const corners = [$('menu-btn'), $('write-btn')];
    let cornerTimer = 0;
    const away = () => corners.forEach((b) => b.classList.add('away'));
    away();
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || document.pointerLockElement) return;
      if (e.clientY > innerHeight - 120 && (e.clientX < 140 || e.clientX > innerWidth - 140)) {
        corners.forEach((b) => b.classList.remove('away'));
        clearTimeout(cornerTimer);
        cornerTimer = window.setTimeout(away, 2500);
      }
    });

    canvas.addEventListener('touchend', () => {
      if (this.audio && this.mode === 'room' && this.audio.ctx.state !== 'running') void this.audio.resume();
    }, { passive: true });

    // The opening and its Skip.
    $('skip').addEventListener('click', () => this.skipOpening());
    canvas.addEventListener('pointerdown', () => {
      const o = this.opening;
      // (Not the tap that went in: a moment's grace against a double tap.)
      if (o && wallClock() - o.start > 1.2 && stageAt(o.score, wallClock() - o.start) === 'title') this.advanceTitle();
    });
    // A tab closed without leaving: how the visit left the chair is kept all the same.
    addEventListener('pagehide', () => {
      if (this.mode === 'room' || this.mode === 'settings' || this.mode === 'contribute') this.keepTrace();
    });
    document.addEventListener('visibilitychange', () => {
      // (A phone may discard a hidden tab without pagehide: this is the last sure moment.)
      if (document.hidden && (this.mode === 'room' || this.mode === 'settings' || this.mode === 'contribute')) this.keepTrace();
      // Away during the opening: on return, the room is simply there.
      if (document.hidden && this.opening) this.skipOpening();
      // A living memory pauses with the tab; away for more than 10 s, it ends (uncounted).
      // (Here, not in the frame loop: a background tab runs no frames.) A vignette too; back in
      // time, the sentence the pause cut is said again from its start.
      const vg = this.vignette;
      if (vg && document.hidden) {
        vg.hiddenSince = performance.now();
        vg.player.pause();
      } else if (vg && vg.hiddenSince !== null) {
        const away = performance.now() - vg.hiddenSince;
        vg.hiddenSince = null;
        this.vignetteClock.reset();
        if (away > 10000) {
          vg.uncounted = true;
          vg.player.release('interrupt');
        }
      }
      const l = this.living;
      if (l && document.hidden) {
        l.hiddenSince = performance.now();
        l.memory.controller.pause();
      } else if (l && l.hiddenSince !== null) {
        const away = performance.now() - l.hiddenSince;
        l.hiddenSince = null;
        this.memoryClock.reset();
        if (away > 10000) this.endLivingMemory('hidden');
      }
      if (document.hidden) {
        void this.audio?.suspend();
        this.wakeLock = null; // released by the browser when hidden
      } else if (this.mode !== 'threshold' && this.mode !== 'departed') {
        void this.audio?.resume();
        void this.keepAwake();
      }
    });
    addEventListener('popstate', () => {
      if (this.mode === 'threshold') return;
      if (this.mode === 'contribute') this.closeContribute();
      if (this.mode === 'room') this.openSettings();
      history.pushState({ room: 1 }, '');
    });
  }

  /**
   * A tap is aimed with a finger, not a cursor: writing counts if the tap lands within a
   * little of its on-screen extent, the chair if it lands near it. Touching writing is
   * attention (the room is told), and turns and walks the visitor closer to read it.
   */
  private tapAt(x: number, y: number) {
    // Inside a living memory a touch does nothing (leaving is turning away, or a step).
    if (this.inside.locked) return;
    const cam = this.rig.camera;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, cam);
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(cam);
      return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, front: p.z < 1 };
    };
    // During a living memory, a touch on the painting or its line means "I'm staying"; a touch
    // anywhere else lets it go, then does what it would have done.
    const l = this.living;
    if (l && !l.held && (l.memory.state === 'emerging' || l.memory.state === 'active')) {
      const onWindow = this.raycaster.intersectObject(this.memoryWindow.mesh, false).length > 0;
      // (While someone in it is speaking, a stray touch is staying too: a phone visitor steadying
      // themselves never cuts a sentence: interaction review, 2026-10-27.)
      const speaking = !!l.memory.prepared.voices && (l.memory.prepared.audio?.voicesUntil ?? 0) > (this.audio?.ctx.currentTime ?? Infinity);
      if (onWindow || speaking) {
        l.awayFor = 0;
        return;
      }
      this.endLivingMemory('interrupt');
    }
    const chairAt = toScreen(this.chair.group.position.clone().setY(0.4));
    const chairHit = this.raycaster.intersectObject(this.chair.hit, false).length > 0 || (chairAt.front && Math.hypot(chairAt.x - x, chairAt.y - y) < 56);
    if (chairHit) {
      this.touched = true;
      this.director.tapped({ chair: true });
      if (this.rig.distanceToChair() < 1.5) this.rig.setKneel(!this.rig.kneeling);
      else this.rig.attend(this.chair.group.position.clone().setY(0.35), 0.95);
      return;
    }
    const pad = 24;
    let best: { it: TextItem; d: number } | null = null;
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    const inView = new THREE.Vector3();
    for (const it of this.text.items.values()) {
      // Only writing that can actually be seen: present, legible from here, in front of the eye.
      if (it.vis < 0.4 || !it.mesh.visible || it.uniforms.uOpacity.value < 0.15) continue;
      // Drawings are found by looking, not things to touch: a tap goes to the writing.
      if (it.purpose === 'drawing') continue;
      const c = toScreen(it.centre);
      if (!c.front || c.x < -pad || c.x > innerWidth + pad || c.y < -pad || c.y > innerHeight + pad) continue;
      box.setFromObject(it.mesh);
      if (box.isEmpty()) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        // A corner behind the eye projects to nonsense: such an item is too close to judge by its box.
        if (inView.copy(corner).applyMatrix4(cam.matrixWorldInverse).z > -cam.near) behind = true;
        const p = toScreen(corner);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      if (behind) {
        x0 = c.x - 60; x1 = c.x + 60; y0 = c.y - 30; y1 = c.y + 30;
      }
      if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) continue;
      // Facing away (seen from behind the wall) never counts.
      if (it.normal.dot(it.centre.clone().sub(cam.position)) > 0) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (!best || d < best.d) best = { it, d };
    }
    if (!best) {
      // Nothing there to read: go toward where the finger pointed (floor), or up to that wall.
      const frames = Object.entries(this.room.frames).filter(([s]) => s !== 'ceiling').map(([s, f]) => ({ s, mesh: f.mesh }));
      const hit = this.raycaster.intersectObjects(frames.map((f) => f.mesh), false)[0];
      if (hit) {
        const s = frames.find((f) => f.mesh === hit.object)!.s;
        this.rig.attend(hit.point.clone(), s === 'floor' ? 0.3 : 1.25);
      }
      return;
    }
    const it = best.it;
    this.touched = true;
    const pid = this.text.phraseOf(it.key);
    this.lastTappedKey = it.key;
    if (pid) this.director.tapped({ phraseId: pid });
    const c = it.centre;
    // A line that opens into a memory: stop where its painting is seen whole (on a portrait
    // phone 1.25 m shows only about a metre of wall).
    let stop = 1.25;
    if (pid && SCENE_BY_PHRASE.has(pid)) {
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
      const w = THREE.MathUtils.clamp(it.placement.w * 0.95, 0.8, 1.3);
      stop = Math.max(1.25, (1.15 * w) / (2 * Math.tan(hfov / 2)));
    }
    // (For a memory's line, aim a little below the words, at the painting that forms under them.)
    const aim = stop > 1.25 || (pid && SCENE_BY_PHRASE.has(pid)) ? c.clone().setY(c.y - 0.2) : c;
    if (it.placement.surface === 'ceiling') this.rig.faceToward(c);
    else this.rig.attend(aim, it.placement.surface === 'floor' ? 0.8 : stop);
  }

  /** Once, if a touch visitor hasn't touched anything yet: that the words and the chair can be touched. */
  private showTouchHint() {
    this.touchHintShown = true;
    try {
      if (localStorage.getItem('hh.touch-hint')) return;
      localStorage.setItem('hh.touch-hint', '1');
    } catch {
      /* not remembered: shown once per visit instead */
    }
    const h = $('hint');
    h.textContent = 'touch the words, or the chair';
    h.classList.add('on');
    setTimeout(() => h.classList.remove('on'), 4500);
  }

  // ─────────────────────────────── UI ───────────────────────────────

  private walkHintShown = false;

  private showHint() {
    this.hintShown = true;
    const h = $('hint');
    h.textContent = this.touch
      ? 'drag left to walk · drag right to look'
      : 'Esc to pause';
    h.classList.add('on');
    setTimeout(() => h.classList.remove('on'), 5500);
  }

  private bindUI() {
    $('enter').addEventListener('click', () => void this.enter());
    $('menu-btn').addEventListener('click', () => {
      if (this.mode === 'contribute') this.closeContribute();
      if (this.mode === 'settings') this.closeSettings();
      else this.openSettings();
    });
    $('write-btn').addEventListener('click', () => (this.mode === 'contribute' ? this.closeContribute() : this.openContribute()));
    // On a phone the keyboard closing is the way out: an empty field just closes.
    $('contribute-input').addEventListener('blur', () =>
      setTimeout(() => {
        if (this.mode === 'contribute' && !$<HTMLInputElement>('contribute-input').value.trim()) this.closeContribute();
      }, 150),
    );
    $('resume').addEventListener('click', () => this.closeSettings());
    $('leave').addEventListener('click', () => this.depart());
    $('return').addEventListener('click', () => this.returnToRoom());
    $('forget').addEventListener('click', () => {
      this.text.removeContributions();
      this.director.forgetContributions();
      this.director.forgetVisits();
      forgetVisits();
      this.visits = 0;
      // Nothing of this visit is kept from here on (its counts, how it left).
      this.forgotten = true;
      const b = $<HTMLButtonElement>('forget');
      b.textContent = 'forgotten';
      b.disabled = true;
      setTimeout(() => {
        b.textContent = 'forget what I wrote, and that I was here';
        b.disabled = false;
      }, 3000);
    });

    const vol = $<HTMLInputElement>('opt-volume');
    vol.addEventListener('input', () => this.setPref('volume', Number(vol.value)));
    $<HTMLInputElement>('opt-mute').addEventListener('change', (e) => this.setPref('muted', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-captions').addEventListener('change', (e) => {
      this.prefs.captionsChosen = true;
      this.setPref('captions', (e.target as HTMLInputElement).checked);
    });
    $<HTMLInputElement>('opt-speech').addEventListener('change', (e) => this.setPref('speech', (e.target as HTMLInputElement).checked));
    $<HTMLInputElement>('opt-motion').addEventListener('change', (e) => {
      this.prefs.reducedMotionChosen = true;
      this.setPref('reducedMotion', (e.target as HTMLInputElement).checked);
    });
    $<HTMLSelectElement>('opt-intensity').addEventListener('change', (e) => this.setPref('intensity', (e.target as HTMLSelectElement).value as Prefs['intensity']));
    $<HTMLSelectElement>('opt-quality').addEventListener('change', (e) => this.setPref('quality', (e.target as HTMLSelectElement).value as Prefs['quality']));

    const form = $<HTMLFormElement>('contribute-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submitContribution();
    });
    // Keep the room's keys from firing while typing.
    $('contribute-input').addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.closeContribute();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    // Focus trap for the settings dialog.
    $('settings').addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...$('settings').querySelectorAll<HTMLElement>('button, input, select')].filter((x) => !x.hasAttribute('disabled'));
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    });
    this.syncSettingsUI();
  }

  private setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    this.prefs[k] = v;
    savePrefs(this.prefs);
    this.applyPrefs();
    this.syncSettingsUI();
  }

  private applyPrefs() {
    const p = this.prefs;
    this.text.reducedMotion = p.reducedMotion;
    if (this.audio) {
      this.audio.setVolume(p.volume);
      this.audio.setMuted(p.muted);
      this.audio.intensity = p.intensity === 'gentle' ? 0.5 : 1;
    }
    if (this.voices) this.voices.speechFallback = p.speech;
    this.captions.enabled = p.captions;
    if (this.rig) {
      // Turned on to stop movement: no rise of the view to come either (the panel hides the cut).
      if (p.reducedMotion && !this.rig.reducedMotion) this.rig.stand();
      this.rig.reducedMotion = p.reducedMotion;
    }
    document.documentElement.classList.toggle('reduce-motion', p.reducedMotion);
    if (p.muted || !p.speech) this.voices?.stopSpeech();
    if (this.post) {
      this.post.reducedMotion = p.reducedMotion;
      this.post.intensityScale = p.intensity === 'gentle' ? 0.4 : 1;
    }
    if (this.renderer && this.post) {
      this.onResize();
      const size = shadowMapSize(p.quality);
      const sh = this.lighting.key.shadow;
      if (sh.mapSize.x !== size) {
        sh.mapSize.set(size, size);
        sh.map?.dispose();
        sh.map = null as unknown as THREE.WebGLRenderTarget;
        this.lighting.invalidateShadow();
      }
      this.post.setSamples(p.quality === 'high' ? 4 : p.quality === 'medium' ? 2 : 0);
    }
  }

  private syncSettingsUI() {
    const p = this.prefs;
    $<HTMLInputElement>('opt-volume').value = String(p.volume);
    $<HTMLInputElement>('opt-mute').checked = p.muted;
    $<HTMLInputElement>('opt-captions').checked = p.captions;
    $<HTMLInputElement>('opt-speech').checked = p.speech;
    $<HTMLInputElement>('opt-motion').checked = p.reducedMotion;
    $<HTMLSelectElement>('opt-intensity').value = p.intensity;
    $<HTMLSelectElement>('opt-quality').value = p.quality;
  }

  openSettings() {
    if (this.mode !== 'room') return;
    this.mode = 'settings';
    if (document.pointerLockElement) document.exitPointerLock();
    this.rig.keys.clear();
    this.rig.cancelAttend();
    $('settings').hidden = false;
    $('resume').focus();
    if (this.audio) this.audio.ramp(this.audio.pause.gain, 0.3, 0.8);
    this.voices?.stopSpeech();
  }

  closeSettings() {
    if (this.mode !== 'settings') return;
    this.mode = 'room';
    $('settings').hidden = true;
    this.renderer.domElement.focus();
    if (this.audio) this.audio.ramp(this.audio.pause.gain, 1, 1.5);
  }

  openContribute() {
    // Writing is another thing to do: the memory lets go.
    this.endLivingMemory('interrupt');
    if (this.mode !== 'room') return;
    this.mode = 'contribute';
    if (document.pointerLockElement) document.exitPointerLock();
    this.rig.keys.clear();
    this.rig.cancelAttend();
    $('contribute').hidden = false;
    const inp = $<HTMLInputElement>('contribute-input');
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
  }

  closeContribute() {
    if (this.mode !== 'contribute') return;
    this.mode = 'room';
    $('contribute').hidden = true;
    $<HTMLInputElement>('contribute-input').value = '';
    this.renderer.domElement.focus();
  }

  private async submitContribution() {
    const inp = $<HTMLInputElement>('contribute-input');
    const text = inp.value.replace(/\s+/g, ' ').trim().slice(0, 140);
    inp.value = '';
    this.closeContribute();
    if (!text) return;
    const it = await this.interpreter.interpret(text);
    this.director.contribute(text, it);
  }

  // ─────────────────────────────── leaving ───────────────────────────────

  depart() {
    if (this.mode !== 'settings' && this.mode !== 'room') return;
    this.endLivingMemory('depart');
    $('settings').hidden = true;
    this.mode = 'departed';
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    const line = this.director.departureLine();
    this.keepTrace();
    this.director.depart();
    this.leaving = wallClock();
    this.voices?.stopSpeech();
    // The hum goes on a little after the visitor has gone.
    if (this.audio) this.audio.silence(0.97, 9999, 3);
    this.captions.clear();
    $('menu-btn').hidden = true;
    $('write-btn').hidden = true;
    const dep = $('departure');
    clearTimeout(this.departTimer);
    this.departTimer = window.setTimeout(() => {
      dep.hidden = false;
      requestAnimationFrame(() => dep.classList.add('on'));
      $('departure-line').textContent = line;
      setTimeout(() => $('departure-line').classList.add('on'), 1500);
      setTimeout(() => {
        $('return').hidden = false;
        $('return').focus();
        void this.audio?.suspend();
      }, 6000);
    }, this.prefs.reducedMotion ? 1500 : 4600);
  }

  /**
   * The opening in reverse, before the departure overlay: the room's light and the sky go
   * first, leaving the chair lit alone, held; then the view goes to black with the chair's light
   * still on ("The light stays on."): it is the visitor who leaves. Quicker under reduced
   * motion, where the overlay comes sooner.
   */
  private playLeaving() {
    const k = this.prefs.reducedMotion ? 0.35 : 1;
    // Wall clock, like the opening, so the overlay (on a timer) never arrives before the dark.
    const t = (wallClock() - (this.leaving ?? wallClock())) / k;
    const ease = (a: number, b: number) => {
      const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };
    const room = 1 - ease(0, 1.8);
    const sc = this.lighting.score;
    sc.area = sc.hemi = room;
    sc.cone = ROOM_LEVELS.cone - 0.3 * ease(0, 1.8);
    this.room.setLit(0.12 + 0.88 * room, room);
    this.post.depart = t > 3.6 ? 1 : 0;
  }

  returnToRoom() {
    if (this.mode !== 'departed') return;
    void this.audio?.resume();
    this.audio?.lift();
    // The screen was let go when they left; keep it awake again.
    void this.keepAwake();
    this.mode = 'room';
    this.director.returnAfterDeparture();
    // Back in from the dark, slowly: the overlay fades while the room lightens beneath it.
    this.leaving = null;
    this.lighting.cancelDim();
    this.post.depart = 0;
    Object.assign(this.lighting.score, { area: 1, hemi: 1, glow: 1, key: ROOM_LEVELS.key, cone: ROOM_LEVELS.cone });
    this.room.setLit(1, 1);
    this.rig.pos.set(0.15, 0, 2.55);
    this.rig.yaw = 0.06;
    this.rig.pitch = -0.06;
    this.rig.stand();
    this.rig.setKneel(false);
    this.rig.cancelAttend();
    const dep = $('departure');
    dep.classList.remove('on');
    $('departure-line').classList.remove('on');
    $('return').hidden = true;
    const hide = () => {
      if (!dep.classList.contains('on')) dep.hidden = true;
    };
    dep.addEventListener('transitionend', hide, { once: true });
    setTimeout(hide, 3600);
    $('menu-btn').hidden = false;
    $('write-btn').hidden = false;
    this.renderer.domElement.focus();
  }

  /**
   * QA/inspection hook (not exposed in the UI): advance the room's time by `seconds`
   * with the visitor held where they are, applying every cue as if lived through.
   */
  advance(seconds: number, step = 0.1) {
    const cam = this.rig.camera;
    for (let t = 0; t < seconds; t += step) {
      const input = {
        x: this.rig.pos.x - this.chair.group.position.x,
        z: this.rig.pos.z - this.chair.group.position.z,
        yaw: this.rig.yaw,
        pitch: this.rig.pitch,
        gazePhraseId: this.text.phraseOf(this.text.attention(cam)),
        gazeChair: false,
        nearSurface: this.room.nearWall(this.rig.pos.x, this.rig.pos.z),
        kneeling: this.rig.kneeling,
      };
      this.time += step;
      for (const c of this.director.tick(step, input, this.room.facing(this.rig.yaw))) this.apply(c.cue);
      this.text.update(step, this.time, cam, this.director.env, this.text.attention(cam), this.director.visitor.gazeFor);
    }
    this.enteredAt = Math.min(this.enteredAt, this.time - 30);
  }

  private updateDebug() {
    this.lastDebug = this.time;
    const s = this.director.snapshot();
    const peak = this.audio ? this.audio.peakDb().toFixed(1) : 'off';
    this.debugEl.textContent =
      `fps ${this.fps.toFixed(0)}  peak ${peak} dBFS  scale ${this.room.scale.toFixed(3)}  phrases ${PHRASES.length}  assets ${this.voices?.assetCount ?? 0}\n` +
      `phase ${s.phase}  gaze ${this.gazeId ?? '-'}${this.gazeChair ? ' [chair]' : ''}\n` +
      `visitor ${JSON.stringify(s.visitor)}\nfield ${JSON.stringify(s.field)}\nmotifs ${JSON.stringify(s.memory.strength)} formed ${s.memory.formed.join(',')}\n` +
      `env ${JSON.stringify(Object.fromEntries(Object.entries(this.director.env).map(([k, v]) => [k, +v.toFixed(2)])))}\n` +
      `situations ${JSON.stringify(s.situations)}\n` +
      `met again ${s.encounters.join(' ')}\n` +
      `pending\n  ${s.pending.join('\n  ')}\nrecent\n  ${s.recent.join('\n  ')}`;
  }
}
