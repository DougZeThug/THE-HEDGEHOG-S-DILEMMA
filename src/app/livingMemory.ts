import * as THREE from 'three';
import { hashString } from '../core/rng';
import type { Lifecycle } from '../memory/types';
import { MemoryClock } from '../memory/clock';
import { versionKeys, voicesEnd } from '../content/memory-voices';
import { SCENE_BY_PHRASE } from '../content/memories';
import { countMemory } from '../ui/prefs';
import { pixelRatio } from './prefsApply';
import { memoryAudioHost } from './audioHost';
import { GIVE_UP_AFTER_S, type AppContext, type Peers } from './context';
import { drawLiving, writeCoda } from './livingFrame';
import { bleedMemory, holdChairShadow, leanToVisitor } from './livingLight';
import { MemoryPreviews } from './livingPreview';
import type { EndReason, Living } from './living';

/** Whether the room's own chord stays away while this memory plays: its music is the room's last, or it has none of its own. */
const silencesDrone = (def: { lastMusic?: string; drone?: boolean }, variant: string) => def.lastMusic === variant || def.drone === false;

/**
 * Living memories: a painting that forms in the plaster round a line, plays with its sound, lets
 * go (src/memory is what they are; this plays one in the room and keeps what is kept of it).
 */
export class LivingMemories {
  /** The memories' runtime (GSAP, Theatre.js, the controller): a lazy chunk, loaded once. */
  private memoryRuntime: Promise<typeof import('../memory/runtime')> | null = null;
  private readonly memoryClock = new MemoryClock();
  private memoryGen = 0;
  /** The memory the tab was hidden on, and when (performance.now). */
  private hiddenAt: { at: number; run: Living } | null = null;
  private readonly previews: MemoryPreviews;

  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {
    this.previews = new MemoryPreviews(ctx, peers, () => this.memoryChunk());
  }

  private memoryChunk() {
    return (this.memoryRuntime ??= import('../memory/runtime'));
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
        audio: memoryAudioHost(this.ctx, this.peers),
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
    this.ctx.living = { memory, id, key: a.key, anchor: a, bled: false, held: false, awayFor: 0, watched: 0, minHold: Math.max(sm?.minHold ?? 8, prepared.voices ? voicesEnd(id, prepared.variant, prepared.voices.version) + 1 : 0), seenAt: sm?.seenAt, reached: 0, deep: false, why: null, away: false, told: 0, washed: new Set(), downSince: null, gaveUp: false, coda: false, preview };
    this.memoryClock.reset();
    // The room hushes round it (and its music stops), until it lets go. For the door the white
    // room itself goes to evening, so the landing's light is the brightest thing there. Nothing
    // passes outside and the drone keeps its chord while it plays (a swell or a chord change under
    // it is a score cue: the sound designer's and the skeptic's reviews, 2026-10-18).
    this.ctx.audio?.memoryHush(prepared.def.hush, 1.4);
    this.ctx.ambience?.hold(this.ctx.time + prepared.def.sections.end);
    // A memory whose music is the room's last: no chord of the room's under it (its reverb isn't
    // hushed, and four of its five chords are a semitone from the woodland's key).
    if (this.ctx.ambience && silencesDrone(prepared.def, prepared.variant)) this.ctx.ambience.score.drone = 0;
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
      writeCoda(this.ctx, l);
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
      if (p.def.lastMusic === p.variant && seen) this.ctx.director.withdrawMusic();
      if (silencesDrone(p.def, p.variant) && this.ctx.ambience && !this.ctx.director.musicWithdrawn) this.ctx.ambience.score.drone = 1;
      this.ctx.ambience?.hold(this.ctx.time + Math.max(12, this.ctx.director.aftermathLeft()));
    }
  }

  /**
   * The tab was hidden or brought back (here, not in the frame loop: a background tab runs no
   * frames). A memory pauses with the tab; away for more than `GIVE_UP_AFTER_S`, it ends (uncounted).
   */
  onVisibility(hidden: boolean) {
    const l = this.ctx.living;
    if (l && hidden) {
      this.hiddenAt = { at: performance.now(), run: l };
      l.memory.controller.pause();
      return;
    }
    const h = this.hiddenAt;
    this.hiddenAt = null;
    if (!l || h?.run !== l) return;
    this.memoryClock.reset();
    if (performance.now() - h.at > GIVE_UP_AFTER_S * 1000) this.endLivingMemory('hidden');
  }

  /** Let the playing memory go: gracefully, or (switch, depart, hidden) at once; and any vignette with it. */
  endLivingMemory(why: EndReason) {
    this.ctx.living?.memory.release(why);
    this.peers.vignettes.release(why);
  }

  /** The chair's shadow and the room's night, held by what is playing (livingLight.ts). */
  holdChairShadow() {
    holdChairShadow(this.ctx);
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
    leanToVisitor(this.ctx, l, f.final['room.lean'] ?? 0);
    drawLiving(this.ctx, l, f, 0, (why) => this.endLivingMemory(why));
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

  step() {
    this.previews.step();
    this.ctx.studioTick?.(performance.now());
    const l = this.ctx.living;
    if (!l) return;
    if (l.held) {
      // In the editor, re-read the timeline every frame so an edit shows as it is made.
      const f = this.ctx.studioTick ? l.memory.controller.refresh() : l.memory.controller.frame;
      if (f) {
        this.ctx.memoryWindow.update(f.final, this.ctx.rig.restingEye, 1 / 60);
        this.ctx.memoryWindow.setBand(this.ctx.street.update(f.final['room.street'] ?? 0));
        leanToVisitor(this.ctx, l, f.final['room.lean'] ?? 0);
        drawLiving(this.ctx, l, f, 0, (why) => this.endLivingMemory(why));
        bleedMemory(this.ctx, l, f);
      }
      return;
    }
    // One reading of the audio clock for the frame: the memory's clock and every sound it schedules
    // (or resumes, or brings back) use the same, so the picture and its sound never part.
    const ctx = this.ctx.audio?.ctx;
    const now = ctx?.currentTime, running = ctx?.state === 'running';
    // With its sound stopped (a phone's call; the context still resuming after a hidden tab, or
    // not yet running as it begins) it waits for it, so the two come back together: on real time
    // it would run on ahead of its sound, which never finds it again. Stopped
    // visible for `GIVE_UP_AFTER_S`, it is let go uncounted, as a vignette is (QA, 2026-10-20).
    const down = !!ctx && !running && !l.gaveUp;
    if (down && !document.hidden && this.ctx.mode !== 'settings') {
      l.downSince ??= performance.now();
      if (performance.now() - l.downSince > GIVE_UP_AFTER_S * 1000) {
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
      leanToVisitor(this.ctx, l, frame.final['room.lean'] ?? 0);
      drawLiving(this.ctx, l, frame, dt, (why) => this.endLivingMemory(why));
      bleedMemory(this.ctx, l, frame);
    }
  }
}
