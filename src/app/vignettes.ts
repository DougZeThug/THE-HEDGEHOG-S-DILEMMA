import * as THREE from 'three';
import { clamp } from '../core/math';
import { hashString } from '../core/rng';
import { ROOM } from '../core/room';
import { MemoryClock } from '../memory/clock';
import { VignettePlayer, type VignetteHost } from '../memory/VignettePlayer';
import { isSpot, type SpotPlace } from '../memory/cueSheet';
import { VIGNETTE_BY_ID, VIGNETTES, vignetteKeys, spokenLines, lineKey, type Effect, type GapKind } from '../content/vignettes';
import { allVersions, chooseVoices, voicesId } from '../content/memory-voices';
import { SCENE_MEMORIES } from '../content/memories';
import { countMemory } from '../ui/prefs';
import { CLASS } from '../ui/dom';
import { wallClock } from '../world/writePlan';
import { gentle, gentleDim } from './presentation';
import type { AppContext, Peers } from './context';

/** Where a vignette's places in the room are measured from (fixed as it begins). */
export interface SpotFrame {
  eye: THREE.Vector3;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  anchor: THREE.Vector3 | null;
}

/**
 * The vignette playing now (src/content/vignettes.ts): heard, not painted. `frame` is where the
 * visitor was and faced when it began, so its voices stay where they were placed.
 */
export interface ActiveVignette {
  player: VignettePlayer;
  id: string;
  key: string | null;
  frame: SpotFrame;
  hiddenSince: number | null;
  preview: boolean;
  /** Seconds moving away from where it began; let go before its end (not counted as heard to the end). */
  leaving: number;
  cutShort: boolean;
  uncounted: boolean;
  /** When settings were opened over it (wall-clock seconds), or null. */
  settingsSince: number | null;
}

/**
 * Vignettes: a memory that is heard and not painted (its places in the room, its effects on the
 * walls and light), and the `?vignette=` / `?memory=` previews that start one a few seconds in.
 */
export class Vignettes {
  readonly vignetteClock = new MemoryClock(1);
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

  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {}

  /** Where the visitor is and faces as a vignette begins: its places in the room are fixed from it. */
  private spotFrame(anchorKey: string | null): SpotFrame {
    const cam = this.ctx.rig.camera;
    const eye = cam.position.clone();
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const c = anchorKey ? this.ctx.text.centreOf(anchorKey) : null;
    return { eye, fwd, right, anchor: c ? new THREE.Vector3(c.x, c.y, c.z) : null };
  }

  /** A place in the room (a vignette's) → world position. */
  spotWorld(p: SpotPlace): [number, number, number] {
    const f = this.ctx.vignette?.frame ?? this.spotFrame(null);
    const head = p.h ?? Math.max(1.2, f.eye.y);
    const c = this.ctx.chair.group.position;
    const hw = this.ctx.room.halfW, hd = this.ctx.room.halfD;
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
    const base = this.peers.living.memoryAudioHost();
    if (!base || !this.ctx.voices) return null;
    const voices = this.ctx.voices;
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
        if (speech) this.ctx.captions.say('speech', text, seconds, side, true);
        else this.ctx.captions.say('sound', text, seconds, undefined, true);
      },
      // Not recorded yet (previews only): the words in a voice without words, and the caption.
      fallback: (cue, delay) => {
        const text = cue.text ?? '';
        setTimeout(() => {
          // Previews only: a visitor hears kept takes or nothing (a take that failed to load stays silent).
          if (!this.ctx.vignette || this.ctx.vignette.id !== def.id || !this.ctx.vignette.preview) return;
          const from = isSpot(cue.place) ? this.spotWorld(cue.place) : base.where(cue.place);
          void voices.playLine('whisper', text, { from }, 0.7, undefined, { synth: true, priority: true }).then((p) => {
            if (p.duration > 0) this.ctx.captions.show(text, p.duration, false, cue.side);
          });
        }, delay * 1000);
      },
      effect: (fx, delay) => {
        setTimeout(() => {
          if (this.ctx.vignette?.id === def.id) this.vignetteEffect(fx);
        }, delay * 1000);
      },
      gap: (kind, seconds, caption) => this.vignetteGap(kind, seconds, caption),
      letGo: (mode) => {
        // Interrupted, or let go early (walking off, turning to write): the room's light comes
        // back (over a few seconds, never a jump).
        if (mode === 'interrupt' || this.ctx.vignette?.cutShort) this.ctx.lighting.liftDim(this.ctx.time);
      },
    };
  }

  /** What the room does during a vignette (never a figure, never a cutscene). */
  private vignetteEffect(fx: Effect) {
    const v = this.ctx.vignette;
    switch (fx.kind) {
      case 'sun': {
        const a = v?.key ? this.ctx.text.anchorOfKey(v.key) : null;
        if (!a || this.ctx.memoryLight.active) break;
        this.ctx.memoryLight.reducedMotion = this.ctx.prefs.reducedMotion;
        this.ctx.memoryLight.strength = gentle(this.ctx.prefs.intensity, 'light') * (fx.strength ?? 1);
        this.ctx.memoryLight.start(a.group, a.x, a.y, a.w, a.h, a.minX, a.maxX, a.maxY, fx, this.ctx.time, 0);
        this.ctx.memoryKey = a.key;
        break;
      }
      case 'dim':
        // Gentle intensity keeps half the room's light, as the held silence's dark does.
        this.ctx.lighting.dimToChair(gentleDim(this.ctx.prefs.intensity, fx.to), fx.seconds, this.ctx.time);
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
    if (kind === 'wait') setTimeout(() => this.ctx.captions.linger(seconds), 300);
    if (caption && !this.ctx.captions.speaking) this.ctx.captions.show(caption, Math.max(2, seconds * 0.6), true);
    // A chosen silence: the white room's own sound goes further down too, for its length, so what
    // is left is nearly nothing (a pause or a wait leaves the room as it was).
    const v = this.ctx.vignette;
    if (kind === 'silence' && v) {
      const hush = v.player.def.hush;
      this.ctx.audio?.memoryHush(Math.min(0.95, hush + 0.35), 1.2);
      setTimeout(() => {
        if (this.ctx.vignette === v && !v.player.releasedHow) this.ctx.audio?.memoryHush(hush, 2);
      }, Math.max(0.5, seconds - 1) * 1000);
    }
  }

  /** What a vignette leaves on the walls: a word gone, a line that withdraws as one comes close. */
  private absence(fx: Effect) {
    if (fx.kind === 'loseWord') for (const k of this.ctx.text.keysOf(fx.phraseId)) this.ctx.text.loseWord(k, fx.word, fx.seconds);
    else if (fx.kind === 'recede') for (const k of this.ctx.text.keysOf(fx.phraseId)) this.ctx.text.recede(k, fx.amount);
  }

  /**
   * Play a vignette. From the Director (its line was read, or the chair was stayed with), or a
   * preview (`?vignette=<id>&variant=<v>`, the artist's panel): a preview plays whether or not its
   * voices are recorded (an unrecorded line is a wordless voice with its caption). `line`: which
   * of its lines opened it (it is placed beside that one); its own, by default.
   */
  async playVignette(id: string, variant: string, preview = false, line?: string): Promise<boolean> {
    const def = VIGNETTE_BY_ID.get(id);
    if (!def || this.ctx.living || this.ctx.mode !== 'room') return false;
    const host = this.vignetteHost(def);
    if (!host) return false;
    this.ctx.vignette?.player.dispose(0.2);
    this.ctx.vignette = null;
    // A hint on screen goes (on a phone it sits where the vignette's words will be).
    this.ctx.dom.hint.classList.remove(CLASS.on);
    const gen = ++this.vignetteGen;
    // A preview shows its line, if the room hasn't written it (so what it leaves there is seen).
    const opens = line && (line === def.anchor.phrase || def.anchor.also?.includes(line)) ? line : def.anchor.phrase;
    if (preview && opens && !this.ctx.text.anchorOf(opens)) this.ctx.text.setShown(opens);
    // Placed by the line read; if it has gone, its own line only where they face it; else round them.
    const own = def.anchor.phrase && opens !== def.anchor.phrase ? this.ctx.text.anchorOf(def.anchor.phrase) : null;
    // (Where its own line is written now: an offer writes it on whichever wall they faced.)
    const a = (opens ? this.ctx.text.anchorOf(opens, this.ctx.gazeId ?? this.ctx.lastTappedKey) : null) ?? (own && own.group === this.ctx.room.frames[this.ctx.director.facing]?.writing ? own : null);
    const frame = this.spotFrame(a?.key ?? null);
    const player = new VignettePlayer(def, variant, host, hashString(def.id + variant));
    // Its places are fixed from now (the frame is read while preparing, too).
    this.ctx.vignette = { player, id, key: a?.key ?? null, frame, hiddenSince: null, preview, leaving: 0, cutShort: false, uncounted: false, settingsSince: null };
    try {
      await player.prepare();
    } catch (e) {
      console.warn('vignette could not be prepared', e);
    }
    if (gen !== this.vignetteGen || this.ctx.mode !== 'room' || this.ctx.living) {
      player.dispose(0);
      if (this.ctx.vignette?.player === player) this.ctx.vignette = null;
      return false;
    }
    // A voice of the room still speaking: the vignette waits for it (a few seconds at most).
    const wait = Math.min(4, Math.max(0, (this.ctx.voices?.busyUntil ?? 0) - performance.now() / 1000));
    // A cold open (B) cuts straight in: no settling hush first.
    const pre = def.coldOpen ? 0.05 : 1.2;
    this.ctx.audio?.memoryHush(def.hush, def.coldOpen ? 0.2 : 1.6);
    // The room waits with it (a preview too, though a preview is never counted).
    if (this.ctx.director.scenes.active?.id !== id) this.ctx.director.memoryExternal(id);
    this.ctx.announce(def.describe);
    setTimeout(() => {
      if (this.ctx.vignette?.player !== player) return;
      this.vignetteClock.reset();
      player.start();
    }, (wait + pre) * 1000);
    return true;
  }

  /** Each frame: the previews' turn, then the vignette playing now (its clock, its let-go, its end). */
  step() {
    const pm = this.previewMemory;
    if (pm && this.ctx.mode === 'room' && !this.peers.opening.active && !this.ctx.living) {
      pm.at ??= wallClock() + 4;
      if (wallClock() >= pm.at) {
        this.previewMemory = null;
        const phraseId = SCENE_MEMORIES.find((m) => m.id === pm.id)?.phraseId;
        if (phraseId) {
          if (!this.ctx.text.anchorOf(phraseId)) this.ctx.text.setShown(phraseId);
          setTimeout(() => {
            this.peers.living.frameMemory(phraseId);
            void (this.ctx.voices?.loadPreview() ?? Promise.resolve()).then(() => this.peers.living.playMemory(pm.id, phraseId, pm.variant, pm.voices, true));
          }, 600);
        }
      }
    }
    const pv = this.previewVignette;
    if (pv && this.ctx.mode === 'room' && !this.peers.opening.active && !this.ctx.living) {
      pv.at ??= wallClock() + 4;
      if (wallClock() >= pv.at) {
        this.previewVignette = null;
        // A preview hears the takes generated so far, kept or not (visitors only ever the kept).
        void (this.ctx.voices?.loadPreview() ?? Promise.resolve()).then(() => this.playVignette(pv.id, pv.variant, true));
      }
    }
    const v = this.ctx.vignette;
    if (!v) return;
    const p = v.player;
    // (Paused until the sound is running again too: a sentence said into a suspended context is lost.)
    const paused = this.ctx.mode === 'settings' || document.hidden || (!!this.ctx.audio && this.ctx.audio.ctx.state !== 'running');
    if (paused !== p.isPaused) paused ? p.pause() : p.resume();
    const dt = this.vignetteClock.tick(performance.now() / 1000, this.ctx.audio?.ctx.currentTime ?? 0, this.ctx.audio?.ctx.state === 'running', paused);
    // In settings, or with the sound stopped (a phone's call, a locked screen), for long: let it go
    // (its light runs on scene time and wouldn't wait).
    const held = this.ctx.mode === 'settings' || (!!this.ctx.audio && this.ctx.audio.ctx.state !== 'running');
    v.settingsSince = held ? v.settingsSince ?? wallClock() : null;
    if (v.settingsSince !== null && wallClock() - v.settingsSince > 10 && !p.releasedHow) {
      v.uncounted = true;
      p.release('interrupt');
    }
    // Turning away (toward a voice, often) or touching the walls never ends it. Walking off
    // does (well away from where it began, for a moment, whether still moving or not): the
    // sentence being said is finished, nothing more is said. Coming back within 2.5 m forgives.
    const dist = this.ctx.rig.camera.position.distanceTo(v.frame.eye);
    v.leaving = dist > 3 ? v.leaving + dt : dist < 2.5 ? 0 : v.leaving;
    if (v.leaving > 1.5 && p.position > 4 && !p.releasedHow) {
      v.cutShort = true;
      p.release('natural');
    }
    p.step(dt);
    if (!p.done) return;
    this.ctx.vignette = null;
    p.dispose(0.3);
    // (The room's sound comes back slowly, over about 20 s: no swell after a memory.)
    this.ctx.audio?.memoryHush(0, 20);
    this.ctx.voices?.forget(vignetteKeys(p.def));
    if (v.preview) {
      this.ctx.director.memoryPreviewEnded(v.id);
      return;
    }
    const counted = this.ctx.director.memoryEnded(v.id, p.seen && !v.uncounted, p.releasedHow === 'natural' && !v.cutShort);
    this.ctx.ambience?.hold(this.ctx.time + Math.max(12, this.ctx.director.aftermathLeft()));
    if (counted && !this.ctx.forgotten) {
      countMemory(v.id);
    }
  }

  /** Which vignettes may speak: every line of every version recorded and kept by the artist. */
  vignettesAvailable(): Set<string> {
    const out = new Set<string>();
    for (const def of VIGNETTES) {
      const lines = new Set(Object.keys(def.variants).flatMap((k) => spokenLines(def, k)));
      if ([...lines].every((l) => this.ctx.voices?.hasAsset(lineKey(def, l)))) out.add(def.id);
    }
    // And the painted memories' voices: a version only once every line of it is kept.
    for (const { id, variant, version } of allVersions()) if (this.peers.living.memoryVoices(id, variant, version, false)) out.add(voicesId(id, variant, version));
    return out;
  }
}
