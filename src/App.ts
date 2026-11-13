import * as THREE from 'three';
import { parseLook, LOOKS, type PresetLookName } from './world/Style';
import { ROOM_LEVELS } from './state/OpeningScore';
import { RULE } from './state/rules';
import type { VisitorInput } from './state/VisitorModel';
import { loadPrefs, readVisits } from './ui/prefs';
import { Captions } from './ui/Captions';
import { lookupDom, setEnter, type Dom } from './ui/dom';
import type { Prefs } from './ui/prefs';
import type { Cue } from './state/cues';
import { AppContext, type Parts, type World } from './app/context';
import { buildWorld, restoreOnContextRestored, warmUp } from './app/boot';
import { applyPrefs, resize, setStyle } from './app/prefsApply';
import { Opening, ScreenWake } from './app/opening';
import { LivingMemories } from './app/livingMemory';
import { Vignettes } from './app/vignettes';
import { Cues } from './app/cues';
import { Input } from './app/input';
import { Menus } from './app/menus';
import { Hints } from './app/hints';
import { Debug } from './app/debug';
import { bindLifecycle } from './app/lifecycle';
import { mountTuneControls } from './app/tuneControls';
import type { Immersion } from './world/living/Immersion';

/**
 * The installation in the browser: the room, built once, and the frame loop that carries it.
 * What it does is in src/app/ (opening, living memories, vignettes, cues, input, menus), each
 * reaching the others through the shared `AppContext`; this class builds them, runs the frame,
 * and is the handle the playtests and the Memory Editor hold (`window.__hedgehog`, inspector.ts).
 */
export class App {
  private readonly ctx: AppContext;
  private readonly parts: Parts;
  private readonly clock = new THREE.Clock();
  private readonly debug: Debug;

  /** Build the room (behind the black threshold) and start it. Resolves once it can be entered. */
  static async boot(): Promise<App> {
    const params = new URLSearchParams(location.search);
    const dom = lookupDom();
    const prefs = loadPrefs();
    const visits = readVisits();
    const { world, immersion } = await buildWorld(params, dom, prefs, visits);
    const app = new App(world, dom, prefs, visits);
    app.start(params, immersion);
    return app;
  }

  private constructor(world: World, dom: Dom, prefs: Prefs, visits: number) {
    const ctx = (this.ctx = new AppContext(world, dom, prefs, new Captions(dom.captions), visits));
    const parts = {} as Parts;
    this.parts = parts;
    parts.opening = new Opening(ctx, parts);
    parts.living = new LivingMemories(ctx, parts);
    parts.vignettes = new Vignettes(ctx, parts);
    parts.cues = new Cues(ctx, parts);
    parts.input = new Input(ctx, parts);
    parts.menus = new Menus(ctx, parts);
    parts.hints = new Hints(ctx);
    parts.wake = new ScreenWake();
    this.debug = new Debug(ctx);
  }

  private start(params: URLSearchParams, immersion: Immersion) {
    const { ctx, parts } = this;
    // Words in the air rubbed out by someone coming close: an eraser where they were, and a breath.
    ctx.text.onAirGone = (how, at) => parts.cues.airGone(how, at);
    setStyle(ctx, parseLook(params.get('style')));
    applyPrefs(ctx);
    resize(ctx);
    addEventListener('resize', () => resize(ctx));
    restoreOnContextRestored(ctx);
    parts.input.bind();
    bindLifecycle(ctx, parts);
    parts.menus.bindUI();
    // The artist's panel: only with ?tune, loaded only then.
    if (params.has('tune')) void import('./ui/Tune').then(({ mountTune }) => mountTuneControls(ctx, parts, mountTune));
    window.__hedgehog = this;
    // The Memory Editor (Theatre Studio): development builds only, never shipped.
    if (import.meta.env.DEV && /[?&]studio\b/.test(location.search)) void import('./memory/editor/MemoryEditor').then((m) => m.openEditor(this));

    warmUp(ctx, immersion);
    setEnter(ctx.visits > 0 ? 'go in again' : 'go in', true);
    ctx.dom.enter.focus();
    ctx.renderer.setAnimationLoop(() => this.frame());
  }

  // What tests, the playtests and the editor reach (inspector.ts lists them; each is the context's or a part's).
  get scene() {
    return this.ctx.scene;
  }
  get renderer() {
    return this.ctx.renderer;
  }
  get chair() {
    return this.ctx.chair;
  }
  get lighting() {
    return this.ctx.lighting;
  }
  get text() {
    return this.ctx.text;
  }
  get rig() {
    return this.ctx.rig;
  }
  get post() {
    return this.ctx.post;
  }
  get director() {
    return this.ctx.director;
  }
  get inside() {
    return this.ctx.inside;
  }
  get audio() {
    return this.ctx.audio;
  }
  get voices() {
    return this.ctx.voices;
  }
  get gazeId() {
    return this.ctx.gazeId;
  }
  get fps() {
    return this.debug.fps;
  }
  get mode() {
    return this.ctx.mode;
  }
  get time() {
    return this.ctx.time;
  }
  get look() {
    return this.ctx.look;
  }
  get memoryLight() {
    return this.ctx.memoryLight;
  }
  get memoryWindow() {
    return this.ctx.memoryWindow;
  }
  get living() {
    return this.ctx.living;
  }
  get vignette() {
    return this.ctx.vignette;
  }
  get handoffAt() {
    return this.parts.opening.handoffAt;
  }
  /** For tests and the inspector: where the opening is. */
  get score() {
    return this.parts.opening.score;
  }
  get studioTick() {
    return this.ctx.studioTick;
  }
  set studioTick(f: ((now: number) => void) | null) {
    this.ctx.studioTick = f;
  }

  setStyle(name: PresetLookName) {
    setStyle(this.ctx, name);
  }
  apply(cue: Cue) {
    this.parts.cues.apply(cue);
  }
  playMemory(id: string, phraseId: string, variant = 'first', voiced?: string | null, preview = false) {
    return this.parts.living.playMemory(id, phraseId, variant, voiced, preview);
  }
  playVignette(id: string, variant: string, preview = false, line?: string) {
    return this.parts.vignettes.playVignette(id, variant, preview, line);
  }
  heldAt(position: number | null) {
    return this.parts.living.heldAt(position);
  }
  followPlayhead(position: number) {
    this.parts.living.followPlayhead(position);
  }
  frameMemory(phraseId: string) {
    this.parts.living.frameMemory(phraseId);
  }
  endLivingMemory(why: Parameters<LivingMemories['endLivingMemory']>[0]) {
    this.parts.living.endLivingMemory(why);
  }
  lookBy(dx: number, dy: number) {
    this.parts.input.lookBy(dx, dy);
  }
  depart(how: 'door' | 'menu' = 'menu') {
    this.parts.menus.depart(how);
  }

  /** What the Director is told of the visitor each tick. `carried`: moved by a memory, not by themselves. */
  private directorInput(gazePhraseId: string | null, gazeChair: boolean, carried: boolean): VisitorInput {
    const { rig, chair, room } = this.ctx;
    return {
      x: rig.pos.x - chair.group.position.x,
      z: rig.pos.z - chair.group.position.z,
      yaw: rig.yaw,
      pitch: rig.pitch,
      gazePhraseId,
      gazeChair,
      nearSurface: room.nearWall(rig.pos.x, rig.pos.z),
      kneeling: rig.kneeling,
      carried,
    };
  }

  private frame() {
    const c = this.ctx;
    const { parts } = this;
    const dt = Math.min(0.1, this.clock.getDelta());
    c.time += dt;
    // (A memory held at a position, as the editor and a capture hold it, holds the room too.)
    const running = c.runsDirector() && !c.living?.held;

    // The opening holds light, image, sound and what the visitor may do; afterwards the room
    // is the Director's. Hints only once the room is theirs, and only if they haven't found out.
    if (c.hasEntered()) {
      if (c.ambience) c.ambience.fade = 1;
      if (parts.menus.leaving !== null) parts.menus.playLeaving();
      else if (parts.opening.active) parts.opening.playOpening();
      else {
        // The room's light, when the Director takes it back to the chair alone: the fixture goes
        // down with it (a blazing panel over a darkening room reads as a brownout), never out.
        const m = c.lighting.roomLight;
        c.room.setLit(0.08 + 0.92 * m ** 1.5, m);
        c.text.airShadowLight = c.lighting.score.key / ROOM_LEVELS.key;
        parts.hints.step(c.time - parts.opening.handoffAt);
      }
    }

    // (Inside a living memory, looking and walking are the memory's: src/world/living/Inside.ts.)
    if (!parts.opening.active) c.rig.enabled = c.mode === 'room' && !c.inside.locked;
    else if (c.mode !== 'room') c.rig.enabled = false;
    c.rig.update(dt, c.room, c.chair.group.position);

    const cam = c.rig.camera;
    c.gazeId = c.text.attention(cam);
    const gazePhrase = c.text.phraseOf(c.gazeId);
    c.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    c.gazeChair = c.raycaster.intersectObject(c.chair.hit, false).length > 0 && c.rig.distanceToChair() < 6;

    if (running) {
      const cues = c.director.tick(dt, this.directorInput(gazePhrase, c.gazeChair, c.inside.carrying), c.room.facing(c.rig.yaw));
      for (const q of cues) {
        parts.cues.apply(q.cue);
        // The way out is told to a screen reader as it is seen: the room going, and what keeps or takes it.
        if (q.rule === RULE.leaving && q.cue.type === 'silence') c.announce('The room begins to let you go. Walk on to leave; turn back, or wait, to stay.');
        else if (q.rule === RULE.leavingKept) c.announce('The room comes back.');
      }
    }

    const env = c.director.env;
    const v = c.director.visitor;
    const scaleTarget = c.prefs.reducedMotion ? 1 + (env.roomScale - 1) * 0.3 : env.roomScale;
    c.room.setScale(c.room.scale + (scaleTarget - c.room.scale) * (1 - Math.exp(-dt / 6)));
    parts.living.holdChairShadow();
    c.lighting.update(dt, env, c.time, c.chair.group.position, c.chair.group.rotation.y);
    if (c.lighting.shadowDirty) c.renderer.shadowMap.needsUpdate = true;
    // Exposure, like the look's light, comes and goes with the room's own light (the opening, a dim).
    const room = THREE.MathUtils.clamp(c.lighting.score.area, 0, 1) * c.lighting.roomLight;
    c.renderer.toneMappingExposure = LOOKS.original.exposure + (c.look.exposure - LOOKS.original.exposure) * room;
    c.text.faintBoost = 1 + (c.look.faint - 1) * room;
    c.post.contrast = c.look.contrast * room;
    c.room.setWarmth(c.lighting.warmthNow);
    // The chair's contact with the floor is there as the light on it is: none in the dark.
    (c.chair.contact.material as THREE.MeshBasicMaterial).opacity = c.chairContact * Math.min(1, c.lighting.keyLevel);
    (c.chair.seatShade.material as THREE.MeshBasicMaterial).opacity = c.chairContact * Math.min(1, c.lighting.panelLevel);
    c.lightWash = 0;
    if (c.memoryKey) {
      // The light washes the words out a little (to about half their strength), then gives them back.
      const m = c.memoryLight.update(c.time);
      c.lightWash = 0.35 * m;
      c.text.wash(c.memoryKey, c.lightWash);
      if (!c.memoryLight.active) c.memoryKey = null;
    }
    parts.living.step();
    parts.vignettes.step();
    c.text.update(dt, c.time, cam, env, c.gazeId, v.gazeId === gazePhrase ? v.gazeFor : 0);
    c.post.update(dt, env, c.time);

    if (c.audio) {
      const p = cam.position;
      const f = cam.getWorldDirection(new THREE.Vector3());
      c.audio.updateListener(p.x, p.y, p.z, f.x, f.y, f.z);
      c.ambience?.update(env, c.time);
    }

    c.post.render();
    this.debug.frame(dt);
  }

  /**
   * QA/inspection hook (not exposed in the UI): advance the room's time by `seconds`
   * with the visitor held where they are, applying every cue as if lived through.
   */
  advance(seconds: number, step = 0.1) {
    const c = this.ctx;
    const cam = c.rig.camera;
    for (let t = 0; t < seconds; t += step) {
      // (Held where they are: not looking at the chair, not carried.)
      const input = this.directorInput(c.text.phraseOf(c.text.attention(cam)), false, false);
      c.time += step;
      for (const q of c.director.tick(step, input, c.room.facing(c.rig.yaw))) this.parts.cues.apply(q.cue);
      c.text.update(step, c.time, cam, c.director.env, c.text.attention(cam), c.director.visitor.gazeFor);
    }
  }
}
