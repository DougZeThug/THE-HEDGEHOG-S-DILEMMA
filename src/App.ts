import { STATIC_DRAWINGS } from './content/drawings';
import * as THREE from 'three';
import { Room } from './world/Room';
import { Chair } from './world/Chair';
import { Lighting, shadowMapSize } from './world/Lighting';
import { lookFor, parseLook, LOOK_NAMES, LOOKS, type Look, type LookName } from './world/Style';
import { MemoryLight } from './world/MemoryLight';
import { WallText, wallClock, type TextItem } from './world/WallText';
import { CameraRig } from './world/CameraRig';
import { Post } from './world/Post';
import { FONTS_TO_LOAD } from './world/textures';
import { ROOM } from './world/layout';
import { Director } from './state/Director';
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
import { loadPrefs, savePrefs, readVisits, writeVisits, forgetVisits, readOpeningSeen, writeOpeningSeen, type Prefs } from './ui/prefs';
import { LocalInterpreter } from './interpret/LocalInterpreter';
import type { Interpreter } from './interpret/Interpreter';
import { clamp } from './core/math';
import { hashString } from './core/rng';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Mode = 'threshold' | 'room' | 'settings' | 'contribute' | 'departed';

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
  private memoryKey: string | null = null;
  /** The piece of writing last touched (the memory's light falls where the visitor touched). */
  private lastTappedKey: string | null = null;
  /** How dark the chair's contact with the floor is, at full light (the look sets it). */
  chairContact = 1;
  /** The room's look (Style.ts): ?style=original|subtle|reference; reference unless asked. */
  lookName: LookName = 'reference';
  look: Look = lookFor('reference');
  /** The opening while it plays: its score, when it started (wall clock), what has been done. */
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

    await Promise.race([
      Promise.all(FONTS_TO_LOAD.map((f) => document.fonts.load(f).catch(() => null))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);

    this.setupRenderer();
    this.room = new Room(this.prefs.quality);
    this.chair = new Chair();
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
    this.director = new Director({
      seed,
      visits: this.visits + 1,
      situations: forced,
      // Where each piece of writing is, for situations that relate place to memory.
      geometry: (id) => {
        const w = this.text.whereIs(id);
        return w ? { surface: w.surface, x: w.centre.x, y: w.centre.y, z: w.centre.z } : undefined;
      },
    });
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
    this.renderer.setRenderTarget(this.post.composer.readBuffer);
    this.renderer.compile(this.scene, this.rig.camera);
    this.renderer.setRenderTarget(null);
    this.post.render();
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
      void this.voices.loadManifest().then(() => this.voices!.preload(['sfx:switch', 'sfx:chair-creak', 'sfx:graphite', 'dialogue/crumbs--laughing.mp3']));
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
            ['fill', 0, 1.5], ['area', 0, 4], ['key', 0, 2], ['cone', 0.7, 1.3], ['glow', 0, 1.5], ['warmth', 0, 1.5], ['ceiling', 0, 12],
            ['exposure', 0.8, 1.4], ['vignette', 0, 0.6], ['grain', 0, 0.06], ['texture', 0, 2], ['contact', 0, 1.5], ['shadowSoft', 0.3, 3],
            ['faint', 0.8, 1.6], ['skyGlow', 0, 20], ['contrast', 0, 0.8], ['stains', 0, 1],
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
      ],
    );
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
    const running = this.mode === 'room' || this.mode === 'contribute';

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
        if (!this.hintShown && since > 4 && !(this.touch && this.dragged)) this.showHint();
        // Someone exploring only by eye, still sitting where the opening left them, may not know
        // they can get up: told once, never moved for them.
        if (!this.touch && !this.walkHintShown && since > 25 && this.rig.seated && this.mode === 'room') {
          this.walkHintShown = true;
          const h = $('hint');
          h.textContent = '↑ or W to walk · Esc to pause';
          h.classList.add('on');
          setTimeout(() => h.classList.remove('on'), 5500);
        }
        if (this.touch && this.mode === 'room' && !this.touchHintShown && since > 12 && !this.touched) this.showTouchHint();
      }
    }

    if (!this.opening) this.rig.enabled = this.mode === 'room';
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
    if (this.memoryKey) {
      // The light washes the words out a little (to about half their strength), then gives them back.
      const m = this.memoryLight.update(this.time);
      this.text.wash(this.memoryKey, 0.35 * m);
      if (!this.memoryLight.active) this.memoryKey = null;
    }
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
        const ok = this.text.write({ key: cue.key, text: cue.text, hand: cue.hand, size, beside: cue.beside, surface: cue.surface, near, purpose: cue.purpose, ttl: cue.ttl, now: this.time, source: cue.source });
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
        this.audio?.silence(cue.depth * (this.prefs.intensity === 'gentle' ? 0.8 : 1), cue.seconds);
        if (cue.dim !== undefined) this.lighting.dimToChair(this.prefs.intensity === 'gentle' ? Math.max(cue.dim, 0.5) : cue.dim, Math.min(cue.seconds, cue.dimSeconds ?? 11), this.time);
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
    if (this.mode !== 'room') return;
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
    addEventListener('keyup', (e) => this.rig.keys.delete(e.code));
    addEventListener('blur', () => this.rig.keys.clear());

    // Mouse: pointer lock where possible, drag-to-look otherwise.
    let dragging = false;
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
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'room') return;
      if (document.pointerLockElement === canvas) this.rig.look(e.movementX, e.movementY);
      else if (dragging && e.pointerType === 'mouse') {
        this.rig.look((e.clientX - lastX) * 1.2, (e.clientY - lastY) * 1.2);
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
    const touches = new Map<number, { side: 'L' | 'R'; x: number; y: number; sx: number; sy: number; t: number }>();
    canvas.addEventListener('pointerdown', (e) => {
      // Touching the room while writing means: keep it to yourself after all.
      if (this.mode === 'contribute' && !$<HTMLInputElement>('contribute-input').value.trim()) this.closeContribute();
      if (e.pointerType === 'mouse' || this.mode !== 'room') return;
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { side: e.clientX < innerWidth / 2 ? 'L' : 'R', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp });
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (!t || this.mode !== 'room') return;
      if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 14) this.dragged = true;
      // A half-screen swipe turns about 65° on a narrow phone, as on a wide screen.
      if (t.side === 'R') this.rig.look((e.clientX - t.x) * 1.6 * clamp(640 / innerWidth, 1, 1.8), (e.clientY - t.y) * 1.6);
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
      if (t.side === 'L') this.rig.touchMove.set(0, 0);
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
    document.addEventListener('visibilitychange', () => {
      // Away during the opening: on return, the room is simply there.
      if (document.hidden && this.opening) this.skipOpening();
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
    const cam = this.rig.camera;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, cam);
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(cam);
      return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, front: p.z < 1 };
    };
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
    if (it.placement.surface === 'ceiling') this.rig.faceToward(c);
    else this.rig.attend(c, it.placement.surface === 'floor' ? 0.8 : 1.25);
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
      forgetVisits();
      this.visits = 0;
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
    $<HTMLInputElement>('opt-captions').addEventListener('change', (e) => this.setPref('captions', (e.target as HTMLInputElement).checked));
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
    $('settings').hidden = true;
    this.mode = 'departed';
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    const line = this.director.departureLine();
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
