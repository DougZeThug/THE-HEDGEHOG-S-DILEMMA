import * as THREE from 'three';
import { UPRIGHT } from '../world/living/Immersion';
import { washInputs, washOf } from '../world/living/wash';
import { ROOM } from '../core/room';
import { hashString } from '../core/rng';
import { idle } from '../core/time';
import { PHRASE_IDS } from '../content/ids';
import { fetchBlob } from '../memory/fetched';
import type { Lifecycle } from '../memory/types';
import type { MemoryAudioHost } from '../memory/MemoryAudio';
import { MemoryClock } from '../memory/clock';
import { isSpot } from '../memory/cueSheet';
import { versionKeys, voicesEnd } from '../content/memory-voices';
import { SCENE_BY_PHRASE } from '../content/memories';
import { readMemoryCounts, countMemory, writeTrace, writeHeartAnswer } from '../ui/prefs';
import { gentle } from './presentation';
import { pixelRatio } from './prefsApply';
import type { AppContext, Peers } from './context';
import type { Living } from './living';

/** How far the room goes down while the visitor is inside a living memory's painting (-26 dB). */
const DEEP_HUSH = 0.95;

/**
 * Living memories: a painting that forms in the plaster round a line, plays with its sound, lets
 * go (src/memory is what they are; this plays one in the room and keeps what is kept of it).
 */
export class LivingMemories {
  /** The memories' runtime (GSAP, Theatre.js, the controller): a lazy chunk, loaded once. */
  private memoryRuntime: Promise<typeof import('../memory/runtime')> | null = null;
  private readonly memoryClock = new MemoryClock();
  private memoryGen = 0;
  private frameCount = 0;
  private readonly prefetched = new Set<string>();

  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {}

  /** The memories' runtime (GSAP, Theatre.js, the controller): a lazy chunk, loaded once. */
  private memoryChunk() {
    return (this.memoryRuntime ??= import('../memory/runtime'));
  }

  memoryAudioHost(): MemoryAudioHost | null {
    const a = this.ctx.audio, voices = this.ctx.voices;
    if (!a || !voices) return null;
    const mesh = this.ctx.memoryWindow.mesh;
    return {
      ctx: a.ctx,
      out: a.buses.memory,
      load: async (asset, take) => {
        if (asset.startsWith('synth:')) return loadSynth(asset, a.ctx, take);
        if (!asset.startsWith('music/')) return voices.raw(asset, take);
        try {
          // (Fetched ahead with the memory's art, when its line was armed.)
          return await a.ctx.decodeAudioData(await (await fetchBlob('./' + asset)).arrayBuffer());
        } catch (e) {
          // Music that will not decode is a memory without that music, not a failed memory.
          console.warn(`[hedgehog] ${asset} could not be loaded or decoded; the memory plays without it`, e);
          return null;
        }
      },
      impulse: (sec, decay, seed) => a.impulse(sec, decay, seed),
      get intensity() {
        return a.intensity;
      },
      // Window-local (u, v across it; d metres behind the wall) → the room.
      where: (p) => {
        if (isSpot(p)) return this.peers.vignettes.spotWorld(p);
        mesh.updateWorldMatrix(true, false);
        const w = mesh.localToWorld(new THREE.Vector3(p.u, p.v, -p.d / Math.max(1e-3, mesh.scale.z)));
        return [w.x, w.y, w.z];
      },
      // Spoken lines (a painted memory's overheard voices) are levelled as a vignette's are.
      level: (asset, buf) => (asset.startsWith('vig:') ? voices.voicedLevel(buf) : 1),
      caption: (text, seconds, speech, side) => {
        // Words said in it are captioned as speech, by side; its sounds only while nobody speaks.
        // (Beneath the words still on screen, as a vignette's, when it has words: never over them.)
        if (speech) this.ctx.captions.say('speech', text, seconds, side, true);
        else if (this.ctx.living?.memory.prepared.voices) this.ctx.captions.say('sound', text, seconds, undefined, true);
        else if (!this.ctx.captions.speaking) this.ctx.captions.say('sound', text, seconds);
      },
      // Not recorded yet (`?memory=` previews only): the words in a voice without words, and the caption.
      fallback: (cue, delay) => {
        const text = cue.text ?? '';
        const living = this.ctx.living;
        // Previews only: a visitor hears kept takes or nothing. A kept take that failed to load
        // leaves the memory wordless here, not a synthetic whisper with the words captioned.
        if (!living?.preview) return;
        setTimeout(() => {
          // (Not after it has been let go: a sentence not yet begun is never begun then.)
          if (!living || this.ctx.living !== living || (living.memory.state !== 'emerging' && living.memory.state !== 'active')) return;
          const from = isSpot(cue.place) ? this.peers.vignettes.spotWorld(cue.place) : this.memoryAudioHost()!.where(cue.place);
          void voices.playLine('whisper', text, { from }, 0.7, undefined, { synth: true, priority: true }).then((pl) => {
            if (pl.duration > 0) this.ctx.captions.show(text, pl.duration, false, cue.side);
          });
        }, delay * 1000);
      },
    };
  }

  /** Walk to where a memory is seen whole and face it (the editor's Start: the real framing). */
  frameMemory(phraseId: string) {
    const a = this.ctx.text.anchorOf(phraseId);
    const c = a && this.ctx.text.centreOf(a.key);
    if (c) this.ctx.rig.attend(c, 2.4);
  }

  /**
   * The version of a painted memory's overheard voices it may speak: every line kept by the
   * artist, or (a preview) taken so far, kept or not. Otherwise null: wordless, as it always was.
   */
  memoryVoices(id: string, variant: string, version: string | null | undefined, preview: boolean): string | null {
    const voices = this.ctx.voices;
    if (!version || !voices) return null;
    const keys = versionKeys(id, variant, version);
    if (!keys.length) return null;
    return keys.every((k) => (preview ? voices.filesOf(k).length > 0 : voices.hasAsset(k))) || preview ? version : null;
  }

  /**
   * Play a living memory round the line it belongs to (on whatever wall it is written).
   * Returns false if the line isn't on a wall or the memory couldn't be prepared.
   */
  async playMemory(id: string, phraseId: string, variant = 'first', voiced?: string | null, preview = false): Promise<boolean> {
    let a = this.ctx.text.anchorOf(phraseId, this.ctx.gazeId ?? this.ctx.lastTappedKey);
    // A memory that opens from a drawing can begin from the drawing alone (its `under`, the drawing
    // its line is written beneath: the door's).
    const opensFrom = SCENE_BY_PHRASE.get(phraseId)?.under ?? null;
    const drawn = opensFrom ? this.ctx.text.anchorOfKey(opensFrom) : null;
    if (drawn && (!a || a.group !== drawn.group)) a = drawn;
    if (!a) return false;
    this.endLivingMemory('switch');
    // (The Drive Home's light, if it is still on its way back to the chair, goes back now.)
    this.ctx.lighting.leanHome(this.ctx.time);
    // Only the latest request plays (two overlapping ones would otherwise both load).
    const gen = ++this.memoryGen;
    let rt: typeof import('../memory/runtime');
    let prepared: Awaited<ReturnType<typeof rt.prepare>>;
    try {
      rt = await this.memoryChunk();
      prepared = await rt.prepare(id, variant, {
        renderer: this.ctx.renderer,
        audio: this.memoryAudioHost(),
        quality: this.ctx.prefs.quality,
        screen: { width: innerWidth * pixelRatio(this.ctx), height: innerHeight * pixelRatio(this.ctx) },
        noise: this.ctx.memoryWindow.noise,
        reduced: this.ctx.prefs.reducedMotion,
        voices: { version: this.memoryVoices(id, variant, voiced, preview), filesOf: (k) => this.ctx.voices?.filesOf(k) ?? [] },
      });
    } catch (e) {
      console.warn('memory could not be prepared', e);
      return false;
    }
    // Asked for and then superseded, or the visitor has gone to write or to leave meanwhile.
    if (gen !== this.memoryGen || this.ctx.mode !== 'room') {
      prepared.dispose();
      prepared.audio?.dispose(0);
      return false;
    }
    // A switch released the one before: let it go at once rather than overlap.
    const before = this.ctx.living;
    if (before) {
      before.memory.dispose(0.3);
      // (Disposed, it completes, and its completion lets go of the window and gives the room its
      // words back (memoryState). Read after that, `this.ctx.living` was null: QA, 2026-10-18.)
      if (this.ctx.living === before) {
        this.ctx.memoryWindow.release();
        this.ctx.street.release();
        for (const k of before.washed) this.ctx.text.wash(k, 0);
        this.ctx.living = null;
      }
    }
    // Opening from a drawing already on the wall: the painting's own drawn shape lies on it.
    let fixed: { cx: number; cy: number; w: number } | null = null;
    const from = prepared.def.opensFrom ? this.ctx.text.anchorOfKey(prepared.def.opensFrom) : null;
    if (from && prepared.register && from.group === a.group) {
      const scale = from.h / prepared.register.h;
      fixed = { cx: from.x - prepared.register.x * scale, cy: from.y - prepared.register.y * scale, w: prepared.size[0] * scale };
    }
    this.ctx.memoryWindow.place(a, hashString(a.key), fixed);
    // Anything already drawn on that wall is kept clear of (a painting never lands on a drawing).
    this.ctx.memoryWindow.avoid = fixed ? [] : this.peers.cues.drawingsOn(a.group);
    this.ctx.memoryWindow.setLayers(prepared.layers, prepared.size, prepared.band);
    const living = prepared.living;
    this.ctx.memoryWindow.setLiving(living ? { crop: living.crop, size: prepared.size, order: living.order, feather: living.kind === 'film' ? living.feather : undefined } : null, !living && !!prepared.def.living);
    // (Over the whole of its wall: it shows only while a streetlight crosses it.)
    this.ctx.street.place(a);
    this.ctx.street.reducedMotion = this.ctx.prefs.reducedMotion;
    this.ctx.street.strength = gentle(this.ctx.prefs.intensity, 'street');
    this.ctx.inside.begin(hashString(a.key), this.ctx.prefs.reducedMotion);
    const memory = new rt.LivingMemory(prepared, {
      reduced: this.ctx.prefs.reducedMotion,
      gentle: this.ctx.prefs.intensity === 'gentle',
      onState: (s, why) => {
        if (why && this.ctx.living) this.ctx.living.why ??= why;
        this.memoryState(s);
      },
    });
    const sm = SCENE_BY_PHRASE.get(phraseId);
    this.ctx.living = { memory, id, key: a.key, anchor: a, bled: false, hiddenSince: null, held: false, awayFor: 0, watched: 0, minHold: Math.max(sm?.minHold ?? 8, prepared.voices ? voicesEnd(id, prepared.variant, prepared.voices.version) + 1 : 0), seenAt: sm?.seenAt, reached: 0, deep: false, why: null, away: false, told: 0, washed: new Set(), downSince: null, gaveUp: false, coda: false, preview };
    this.memoryClock.reset();
    // The room hushes round it (and its music stops), until it lets go. For the door the white
    // room itself goes to evening, so the landing's light is the brightest thing there. Nothing
    // passes outside and the drone keeps its chord while it plays (a swell or a chord change under
    // it is a score cue: the sound designer's and the skeptic's reviews, 2026-10-18).
    this.ctx.audio?.memoryHush(prepared.def.hush, 1.4);
    this.ctx.ambience?.hold(this.ctx.time + prepared.def.sections.end);
    // A memory whose music is the room's last: no chord of the room's under it (its reverb isn't
    // hushed, and four of its five chords are a semitone from the woodland's key).
    if (this.ctx.ambience && (prepared.def.lastMusic === prepared.variant || prepared.def.drone === false)) this.ctx.ambience.score.drone = 0;
    if (prepared.def.roomDim) this.ctx.lighting.dimToChair(prepared.def.roomDim, Math.max(prepared.def.maxHold, prepared.def.sections.exit) + (prepared.def.roomDimOut ?? 4), this.ctx.time);
    if (this.ctx.director.scenes.active?.id !== id) this.ctx.director.memoryExternal(id, !!prepared.voices);
    // Its position 0 is this instant on the audio clock, for its first sounds and its first frame
    // alike (the clock measures its first frame from here: QA, 2026-10-19).
    const ctx = this.ctx.audio?.ctx;
    this.memoryClock.prime(performance.now() / 1000, ctx?.currentTime ?? 0, ctx?.state === 'running');
    memory.start(ctx?.currentTime);
    return true;
  }

  private memoryState(s: Lifecycle) {
    const l = this.ctx.living;
    if (!l) return;
    // What the picture is, for a screen reader (not shown: the captions are for sounds).
    if (s === 'active') this.ctx.announce(l.memory.prepared.def.describe(l.memory.prepared.variant));
    // Letting go early: the room's own light comes back with it (over about 4 s; Memory VII's
    // keeps the room down while its shade goes back into the wall: `roomDimOut`).
    if (s === 'withdrawing' && l.memory.prepared.def.roomDim) this.ctx.lighting.dimToChair(l.memory.prepared.def.roomDim, l.memory.prepared.def.roomDimOut ?? 4, this.ctx.time);
    if (s === 'residue' || s === 'complete') {
      // The room comes back as the memory lets go (issued now, never precomputed).
      this.ctx.audio?.memoryHush(0, 20);
    }

    if (s === 'complete') {
      // Its line where the painting was, if one long frame went past its moment (QA, 2026-10-20).
      this.writeCoda(l);
      // (A living memory that was never entered, only seen on its wall, hasn't been seen: it is
      // offered again. Interaction review, 2026-10-17.)
      const entered = this.ctx.inside.entered || !l.memory.prepared.living?.immerse;
      // Whoever was carried in is back where they stood.
      this.ctx.inside.end();
      this.ctx.captions.dim = false;
      this.ctx.memoryWindow.release();
      this.ctx.street.release();
      for (const k of l.washed) this.ctx.text.wash(k, 0);
      // Its recordings are let go too (a phone keeps little decoded audio; they load again if it returns).
      const p = l.memory.prepared;
      this.ctx.voices?.forget(Object.values(p.def.cues(p.variant).cues).map((c) => c.asset).filter((a) => a.startsWith('mem:')));
      l.memory.prepared.dispose();
      this.ctx.living = null;
      // Seen: watched past its first moments (or, if it says where its heart is, played to there).
      // It ran to its end if nobody let it go early. (A tab hidden for long ends it uncounted, as a
      // vignette: it comes back, the same, another time.)
      const seen = l.why !== 'hidden' && entered && (l.seenAt !== undefined ? l.reached >= l.seenAt : l.watched >= Math.min(l.minHold, 8));
      if (l.preview) this.ctx.director.memoryPreviewEnded(l.id);
      else if (this.ctx.director.memoryEnded(l.id, seen, l.why === null || l.why === 'complete') && !this.ctx.forgotten) {
        countMemory(l.id);
      }
      // Its music was the room's last: seen, the room's own never comes back this visit (the
      // drone stays away, and the Director plays nothing); let go before then, the drone returns.
      if (p.def.lastMusic === p.variant) {
        if (seen) this.ctx.director.withdrawMusic();
        if (this.ctx.ambience && !this.ctx.director.musicWithdrawn) this.ctx.ambience.score.drone = 1;
      } else if (p.def.drone === false && this.ctx.ambience && !this.ctx.director.musicWithdrawn) {
        this.ctx.ambience.score.drone = 1;
      }
      this.ctx.ambience?.hold(this.ctx.time + Math.max(12, this.ctx.director.aftermathLeft()));
    }
  }

  /**
   * What stays: as a memory withdraws naturally, its sun comes into the room. It starts while the
   * painted sun is still half there, at the painted pane's size, place and slant, so one becomes
   * the other; then it is the kitchen-light memory's own light, fading on its own time.
   */
  private bleedMemory(l: Living, frame: { state: Lifecycle; position: number; final: Record<string, number> }) {
    const def = l.memory.prepared.def;
    if (l.bled || def.bleed !== PHRASE_IDS.kitchenLight || this.ctx.memoryLight.active) return;
    const c = l.memory.controller;
    if (frame.state !== 'withdrawing' || frame.position < c.sections.exit + (def.bleedAt ?? 2)) return;
    l.bled = true;
    const spill = frame.final['light.roomSpill'] ?? 1;
    if (spill <= 0) return;
    const pane = l.memory.prepared.pane;
    if (!pane) return;
    const at = this.ctx.memoryWindow.toWall(pane.x + (frame.final['layer:sun.x'] ?? 0), pane.y + (frame.final['layer:sun.y'] ?? 0));
    this.ctx.memoryLight.reducedMotion = this.ctx.prefs.reducedMotion;
    this.ctx.memoryLight.strength = gentle(this.ctx.prefs.intensity, 'light') * spill;
    this.ctx.memoryLight.startPane(l.anchor.group, at.x, at.y, (pane.w / 2) * at.scale, (pane.h / 2) * at.scale, pane.transom * at.scale, pane.mullion * at.scale, { attack: 3, hold: 4, release: 6 }, this.ctx.time, 0);
    this.ctx.memoryKey = l.key;
  }

  /**
   * A living memory's hold on the chair's shadow (Memory VII, docs/shadows.md: `room.shadow` and
   * `room.lamp`), from its last frame: the lamp is aimed at its painting's place on the wall, a
   * little under its middle. Nothing playing, or nothing held, and the shadow goes home by itself.
   */
  holdChairShadow() {
    const m = this.ctx.lighting.memoryShadow;
    const l = this.ctx.living;
    const f = l?.memory.controller.frame?.final;
    // (And its night, The Drive Home's: nothing playing, the room's light comes back by itself.)
    this.ctx.lighting.night = f?.['room.night'] ?? 0;
    m.amount = f?.['room.shadow'] ?? 0;
    m.lamp = f?.['room.lamp'] ?? 1;
    if (!l || m.amount <= 0 || !this.ctx.memoryWindow.isPlaced) return;
    const p = this.ctx.memoryWindow.painting;
    l.anchor.group.updateWorldMatrix(true, false);
    l.anchor.group.localToWorld(m.at.set(p.cx, p.cy - 0.15 * p.h, 0));
  }

  /**
   * The Drive Home's end (docs/drive-home.md): as the indicator stops, the room's light comes to
   * the visitor first, before the chair: onto where they are looking, a little over a metre up, on
   * the wall they face or the floor before them, taken once and never following them; then back to
   * the chair by itself over half a minute (Lighting.leanTo). Not if they are already by the chair
   * (the light is there), never after a let go (compose: `lean`).
   */
  private leanToVisitor(l: Living, lean: number) {
    if (l.leaned || lean < 0.5) return;
    l.leaned = true;
    const eye = this.ctx.rig.restingEye;
    const chair = this.ctx.chair.group.position;
    if (Math.hypot(eye.x - chair.x, eye.z - chair.z) < 1.5) return;
    // Under reduced motion the room's light does not travel (as the kitchen's: light, not movement).
    if (this.ctx.prefs.reducedMotion) return;
    const dir = this.ctx.rig.camera.getWorldDirection(new THREE.Vector3()).setY(0);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    // Where the look meets a wall (the room's box), at most 3 m ahead: the floor short of it.
    const hx = ROOM.halfW - 0.05, hz = ROOM.halfD - 0.05;
    let t = 3;
    if (dir.x > 1e-6) t = Math.min(t, (hx - eye.x) / dir.x);
    if (dir.x < -1e-6) t = Math.min(t, (-hx - eye.x) / dir.x);
    if (dir.z > 1e-6) t = Math.min(t, (hz - eye.z) / dir.z);
    if (dir.z < -1e-6) t = Math.min(t, (-hz - eye.z) / dir.z);
    const at = new THREE.Vector3(eye.x + dir.x * t, t < 2.95 ? 1.2 : 0, eye.z + dir.z * t);
    this.ctx.lighting.leanTo(at, this.ctx.time);
    this.ctx.announce('The light moves a little toward you.');
  }

  /** The memory's clock starts again from now (after a hold, or a tab brought back). */
  resetClock() {
    this.memoryClock.reset();
  }

  /** Let the playing memory go: gracefully, or (switch, depart, hidden) at once. */
  endLivingMemory(why: 'complete' | 'look-away' | 'walk-away' | 'interrupt' | 'switch' | 'depart' | 'hidden') {
    this.ctx.living?.memory.release(why);
    // A vignette: leaving cuts it; turning to write lets the sentence being said finish (the
    // writing may be an answer to it), and nothing more is said.
    if (why === 'depart' || why === 'hidden' || why === 'switch') this.ctx.vignette?.player.release('interrupt');
    else if (why === 'interrupt' && this.ctx.vignette) {
      this.ctx.vignette.cutShort = true;
      this.ctx.vignette.player.release('natural');
    }
  }

  /**
   * Hold the playing memory at a position of its sequence (the editor, captures): it is shown as
   * if played there, nothing sounds, and it stays until `heldAt(null)` lets it play on.
   */
  heldAt(position: number | null) {
    const l = this.ctx.living;
    if (!l) return null;
    l.held = position !== null;
    if (position === null) {
      // Plays on from here: no stale time from the hold.
      this.memoryClock.reset();
      return null;
    }
    const f = l.memory.controller.scrub(position);
    this.ctx.memoryWindow.update(f.final, this.ctx.rig.restingEye, 1);
    // (The streetlights too, so a capture or the editor shows where a pass is; and the light that
    // comes to the visitor at the end, on its own clock, as it would played.)
    this.ctx.memoryWindow.setBand(this.ctx.street.update(f.final['room.street'] ?? 0));
    this.leanToVisitor(l, f.final['room.lean'] ?? 0);
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
  private judgeMemoryAttention(l: Living, dt: number) {
    const c = l.memory.controller;
    if (dt <= 0 || (c.state !== 'emerging' && c.state !== 'active')) return;
    const cam = this.ctx.rig.camera;
    const mesh = this.ctx.memoryWindow.mesh;
    const centre = mesh.getWorldPosition(new THREE.Vector3());
    const to = centre.clone().sub(cam.position);
    const dist = to.length();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const half = Math.atan2(mesh.scale.x / 2, Math.max(0.1, dist));
    const away = fwd.angleTo(to) > half + THREE.MathUtils.degToRad(10);
    l.away = away;
    // Inside it, it is all there is: watched, never looked away from (leaving is a turn: Inside.ts).
    if (this.ctx.inside.eff > 0.02) {
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
    if (l.awayFor > (this.ctx.touch ? 3 : 2)) this.endLivingMemory('look-away');
    else if (away && dist > 4.5) this.endLivingMemory('walk-away');
  }

  /**
   * Studio's playhead moved (the editor). The memory's own playing also moves it (the controller
   * sets the sequence's position each frame): that is not a scrub, and doesn't hold it.
   */
  followPlayhead(position: number) {
    const l = this.ctx.living;
    if (!l) return;
    if (!l.held && Math.abs(l.memory.controller.position - position) < 1e-3) return;
    this.heldAt(position);
  }

  /**
   * A memory's line is on a wall: fetch the runtime and its art now (at idle), so that when it is
   * asked for it begins without a wait.
   */
  private prefetchMemories() {
    if (this.ctx.mode !== 'room' || (this.frameCount++ & 31) !== 0) return;
    const soon = new Set(this.ctx.director.scenes.comingSoon(this.ctx.director.now, this.ctx.director.memoryPlayed).map((m) => m.id));
    for (const [phraseId, m] of SCENE_BY_PHRASE) {
      // Its line on a wall, or its offer near (a reserved line is written only as it is offered).
      if (this.prefetched.has(m.id) || !(this.ctx.text.anchorOf(phraseId) || soon.has(m.id))) continue;
      this.prefetched.add(m.id);
      const variant = (readMemoryCounts()[m.id] ?? 0) > 0 ? m.variants.revisit[0] ?? m.variants.first : m.variants.first;
      idle(() => void this.memoryChunk().then((rt) => rt.prefetch(m.id, variant, { quality: this.ctx.prefs.quality, screen: { width: innerWidth, height: innerHeight } })), 200);
    }
  }

  /** Each frame: the memory's clock, the visitor's attention to it, and its picture and sound. */
  step() {
    this.ctx.studioTick?.(performance.now());
    this.prefetchMemories();
    const l = this.ctx.living;
    if (!l) return;
    if (l.held) {
      // In the editor, re-read the timeline every frame so an edit shows as it is made.
      const f = this.ctx.studioTick ? l.memory.controller.refresh() : l.memory.controller.frame;
      if (f) {
        this.ctx.memoryWindow.update(f.final, this.ctx.rig.restingEye, 1 / 60);
        this.ctx.memoryWindow.setBand(this.ctx.street.update(f.final['room.street'] ?? 0));
        this.leanToVisitor(l, f.final['room.lean'] ?? 0);
        this.drawLiving(l, f, 0);
        this.bleedMemory(l, f);
      }
      return;
    }
    // One reading of the audio clock for the frame: the memory's clock and every sound it schedules
    // (or resumes, or brings back) use the same, so the picture and its sound never part.
    const ctx = this.ctx.audio?.ctx;
    const now = ctx?.currentTime, running = ctx?.state === 'running';
    // With its sound stopped (a phone's call; the context still resuming after a hidden tab, or
    // not yet running as it begins) it waits for it, so the two come back together: on real time
    // it would run on ahead of its sound, which never finds it again. Stopped ten seconds while
    // visible, it is let go uncounted, as a vignette is (QA, 2026-10-20).
    const down = !!ctx && !running && !l.gaveUp;
    if (down && !document.hidden && this.ctx.mode !== 'settings') {
      l.downSince ??= performance.now();
      if (performance.now() - l.downSince > 10000) {
        l.gaveUp = true;
        this.endLivingMemory('hidden');
      }
    } else l.downSince = null;
    const paused = this.ctx.mode === 'settings' || document.hidden || (down && !l.gaveUp);
    const c = l.memory.controller;
    if (paused !== c.isPaused) paused ? c.pause() : c.resume(now);
    const dt = this.memoryClock.tick(performance.now() / 1000, now ?? 0, running, paused);
    this.judgeMemoryAttention(l, dt);
    const frame = l.memory.step(dt, now);
    if (frame) {
      this.ctx.memoryWindow.update(frame.final, this.ctx.rig.restingEye, dt);
      this.ctx.memoryWindow.setBand(this.ctx.street.update(frame.final['room.street'] ?? 0));
      this.leanToVisitor(l, frame.final['room.lean'] ?? 0);
      this.drawLiving(l, frame, dt);
      this.bleedMemory(l, frame);
    }
  }

  /**
   * A living memory's frame: how far in (the carry, the settle), then its scene drawn for the
   * part of the painting on the screen. The window is placed first (its painting's place is
   * where the visitor is carried to).
   */
  private drawLiving(l: Living, f: { t: number; state: Lifecycle; position: number; final: Record<string, number> }, dt: number) {
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
        if (line.at >= exit && !line.inside && line.shot === undefined) this.ctx.announce(line.text);
      }
      return;
    }
    const aspect = innerWidth / innerHeight;
    const upright = aspect < UPRIGHT;
    // The shot on now, chosen first so the view frames it from its first frame. A painted scene
    // (the rig) chooses its two-shot: only for someone taken all the way in, the wide while they are
    // turned from it, never upright (the reviews of 2026-10-17 and 18). A film cuts itself: it says
    // which shot is on the screen, by the frame being shown, and is framed for it.
    const shot = pl.scene.choose(f.final, { inside: this.ctx.inside.taken, turn: this.ctx.inside.turned, t: f.t, now: this.ctx.time, aspect });
    this.ctx.post.close = shot > 0 ? 1 : 0;
    // (A film's close shot is framed by its own focus, from its first frame to its last: a reframe on
    // its cut, never a move; upright, the face whose shot it is: src/memory/living/woodlandFilm.ts.
    // Upright, a film that moves its focus by its own clock says where: src/memory/living/drive.ts.)
    const close = shot > 0 ? pl.spec.close : undefined;
    const focus = close
      ? (upright ? close.upright : close.coverAt(aspect))
      : upright ? pl.spec.uprightAt?.(f.final['scene.film'] ?? 0, this.ctx.prefs.reducedMotion) ?? pl.spec.cover.upright : pl.spec.coverAt?.(aspect) ?? (aspect > 2.0 ? pl.spec.cover.ultra : pl.spec.cover.wide);
    const film = pl.kind === 'film' ? pl : null;
    const go = this.ctx.inside.step(dt, {
      immerse: f.final['scene.immerse'] ?? 0,
      focus,
      held: l.held,
      enter: pl.immerse,
      away: l.away,
      leavingNaturally: f.state === 'withdrawing' || f.state === 'residue',
      approach: 'scene.approach' in f.final ? f.final['scene.approach'] : undefined,
      torn: film?.torn,
      shade: film?.shade,
      scale: upright ? pl.spec.cover.uprightScale ?? 1 : 1,
    }, { reduced: this.ctx.prefs.reducedMotion, aspect, scene: pl.scene.target.texture, group: l.anchor.group });
    // The window was placed before the spread changed: place it again for this frame.
    this.ctx.memoryWindow.update(f.final, this.ctx.rig.restingEye, 0);
    // Inside the painting the white room's hum goes further down (it is not in the clearing), and
    // comes back as the painting goes back to the wall (the sound designer's review, 2026-10-18).
    const deep = this.ctx.inside.entered && (f.final['scene.immerse'] ?? 0) >= 0.9;
    if (deep !== l.deep && f.state !== 'residue' && f.state !== 'complete') {
      l.deep = deep;
      this.ctx.audio?.memoryHush(deep ? DEEP_HUSH : l.memory.prepared.def.hush, deep ? 2.5 : 4.5);
    }
    this.washUnderPainting(l, f.final);
    // (Its dusk is dark: a sound's caption over it, while it fills the view, is light words, not a
    // pale pill; on the wall, in the white room, the pill.)
    this.ctx.captions.dim = this.ctx.inside.entered && (f.final['scene.immerse'] ?? 0) >= 0.6 && (f.final['scene.after'] ?? 0) >= 0.5;
    pl.scene.reduced = this.ctx.prefs.reducedMotion;
    // (The two-shot's frame is the screen's: a narrower one sees less of its width, a wider one less of its height.)
    // (A film let go early cuts to the frame its wall's pencil draws and holds it as it goes back:
    // src/memory/living/woodlandFilm.ts `leave`.)
    const leave = pl.spec.leave;
    if (leave && (f.state === 'withdrawing' || f.state === 'residue') && f.position < leave.before) l.leftEarly = true;
    const values = l.leftEarly && leave ? { ...f.final, 'scene.film': leave.to } : f.final;
    pl.scene.update(this.ctx.renderer, f.t, values, { view: this.ctx.inside.view, parallax: new THREE.Vector2(), aspect });
    // What changes later, told to a screen reader when it happens (not before: the cut is not given away).
    const later = l.memory.prepared.def.announce?.(l.memory.prepared.variant) ?? [];
    while (l.told < later.length && f.position >= later[l.told].at && f.state !== 'emerging') {
      const line = later[l.told++];
      // (A close-up's line only while it is shown; what happens inside only to someone taken in;
      // the wall's own line only to someone it stayed on the wall for.)
      const told = line.shot !== undefined ? shot === line.shot : line.inside ? this.ctx.inside.entered : line.wall ? !this.ctx.inside.entered : true;
      if (told) this.ctx.announce(line.text);
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
  private writeCoda(l: Living): void {
    const coda = l.memory.prepared.def.coda;
    if (!coda || l.coda || l.held || coda.variant !== l.memory.prepared.variant || !this.ctx.inside.entered || !(l.why === null || l.why === 'complete') || this.ctx.mode !== 'room') return;
    l.coda = true;
    const own = this.ctx.text.items.get(l.key);
    const waiting = own ? this.ctx.text.writeWithin({ key: `coda:${l.id}`, text: coda.text, hand: own.hand, size: own.size, under: l.key, within: this.ctx.memoryWindow.painting,
      purpose: 'annotation', now: this.ctx.time, source: this.ctx.text.phraseOf(l.key) ?? undefined }) : null;
    if (waiting) {
      this.ctx.director.keepBack(waiting);
      this.ctx.announce(`Written on the wall where the painting was: ${coda.text}`);
    }
  }

  /**
   * The room's writing under a living memory's painting, its own line too (`washOf`: each piece
   * goes to a trace just ahead of the colour, and comes back with the pencil, or as the painting
   * goes if it is let go early; reviews of 2026-10-17 and 18). A revisit without its own scene (no
   * order map) has the colour everywhere at once, at the reveal's half way.
   */
  private washUnderPainting(l: Living, final: Record<string, number>) {
    const m = washInputs(l.memory.prepared.def, l.memory.prepared.living, final, l.memory.controller.weights.presence);
    if (!m) return;
    for (const it of this.ctx.text.items.values()) {
      const a = this.ctx.text.anchorOfKey(it.key);
      if (!a || a.group !== l.anchor.group) continue;
      const w = washOf(a, this.ctx.memoryWindow.rect, m.colourAt, m.reveal, m.presence, m.hold);
      if (w <= 0 && !l.washed.has(it.key)) continue;
      // (Its own line may be in the memory's light as well: the more washed of the two.)
      this.ctx.text.wash(it.key, it.key === this.ctx.memoryKey ? Math.max(w, this.ctx.lightWash) : w);
      l.washed.add(it.key);
    }
  }

  /** One word for the next visit about how this one left the chair; nothing after a forget. */
  keepTrace() {
    if (this.ctx.forgotten) return;
    writeTrace(this.ctx.director.leaving());
    // What the heart left, written on the wall yet or not; a visit whose heart wasn't seen leaves
    // the last one where it was. (A tab closed in the heart's memory, already played past its
    // heart, closed on a heart that was seen: the memory never ended, but it counts.)
    const l = this.ctx.living;
    const watched = l && !l.preview && l.seenAt !== undefined && l.reached >= l.seenAt && (this.ctx.inside.entered || !l.memory.prepared.living?.immerse) ? l.id : undefined;
    const answer = this.ctx.director.heartLeft(watched);
    if (answer) writeHeartAnswer(answer);
  }
}

/** A `synth:` asset: a sound the room makes itself rather than loads (src/memory/synth*.ts). */
async function loadSynth(asset: string, ctx: AudioContext, take: number | undefined): Promise<AudioBuffer | null> {
  const name = asset.slice('synth:'.length);
  if (name === 'air') return (await import('../memory/synthAir')).synthAir(ctx.sampleRate, 7 + (take ?? 0));
  const woods = await import('../memory/synthWoods');
  if ((woods.WOODS_KINDS as readonly string[]).includes(name)) return woods.synthWoods(ctx, name as (typeof woods.WOODS_KINDS)[number]);
  const { synthSound, SYNTH_KINDS } = await import('../memory/synthSounds');
  return (SYNTH_KINDS as readonly string[]).includes(name) ? synthSound(ctx, name as (typeof SYNTH_KINDS)[number], 1 + (take ?? 0)) : null;
}
