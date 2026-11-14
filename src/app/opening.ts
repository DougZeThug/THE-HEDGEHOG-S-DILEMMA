import { STATIC_DRAWINGS } from '../content/drawings';
import { DOOR_AT, ROOM } from '../core/room';
import { idle, ignored, sleep } from '../core/time';
import { wallClock } from '../world/writePlan';
import { AudioEngine } from '../audio/AudioEngine';
import { Ambience } from '../audio/Ambience';
import { Music } from '../audio/Music';
import { Voices, type Played } from '../audio/Voices';
import type { VoicePlacement } from '../audio/voiceSynth';
import { openingScore, levelsAt, stageAt, ROOM_LEVELS, OPENING_WRITTEN, OPENING_SPOKEN, OPENING_UNFINISHED, type Score, type Levels, type Stage, type ScoreEvent } from '../state/OpeningScore';
import { readOpeningSeen, writeOpeningSeen, writeVisits } from '../ui/prefs';
import { CLASS } from '../ui/dom';
import { applyPrefs } from './prefsApply';
import type { AppContext, Peers } from './context';

type SoundKind = Parameters<Voices['sound']>[0];
/** Every sound the voices can make of a score's `sfx:` key: a key with no kind here is a mistake the compiler names. */
const SFX_KINDS = { door: 0, 'chair-creak': 0, cup: 0, switch: 0, graphite: 0, eraser: 0 } satisfies Record<SoundKind, 0>;

function sfxKind(key: string): SoundKind | null {
  const k = key.replace(/^sfx:/, '');
  return k in SFX_KINDS ? (k as SoundKind) : null;
}

/** What a score plays, to be fetched first: its sounds, the hand's pencil, its recorded voice. */
function openingAssets(score: Score): string[] {
  const out = new Set<string>();
  for (const ev of score.events) {
    if (ev.kind === 'sound') out.add(ev.key);
    else if (ev.kind === 'write' && ev.sound) out.add(ev.sound);
    else if (ev.kind === 'voice') out.add(ev.file);
  }
  return [...out];
}

/**
 * The opening: the dark, the title, the light coming up, what is written and said, and the hand-off
 * to the Director (src/state/OpeningScore.ts is the score; this plays it), and the way in to it.
 */
export class Opening {
  /** The opening while it plays: its score, when it started (wall clock), what has been done. */
  active: { score: Score; start: number; fired: Set<number>; skip?: { at: number; from: Levels } } | null = null;
  /** When the room was handed to the Director (scene time), for hints and the inspector. */
  handoffAt = Infinity;
  /** Until when the opening's voice (and its writing) is still going, wall clock. */
  private voiceUntil = 0;
  /** When the opening's first hand stops (wall clock). */
  private writeDoneAt = 0;

  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {}

  /** For tests and the inspector: where the opening is. */
  get score() {
    const o = this.active;
    if (!o) return { t: null, stage: (this.handoffAt < Infinity ? 'done' : 'invite') as Stage | 'invite', handoffAt: this.handoffAt };
    const t = wallClock() - o.start;
    // The hand-off waits for the voice: until it has happened, the opening is still in its last stage.
    let stage: Stage = stageAt(o.score, t);
    if (stage === 'handoff' || stage === 'done') stage = 'voice';
    return { t, stage, handoffAt: o.score.handoff, name: o.score.name };
  }

  /** The visitor's tap at the door: the sound begins (it needs the gesture), and the opening with it. */
  async enter() {
    if (this.ctx.hasEntered()) return;
    this.ctx.mode = 'room';
    this.ctx.visits++;
    writeVisits(this.ctx.visits);
    try {
      // iOS: let the room be heard even with the ringer switched to silent.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      this.ctx.audio = new AudioEngine();
      // Never let a stuck audio session hold the visitor at the door.
      void this.ctx.audio.resume().catch(ignored);
      this.ctx.ambience = new Ambience(this.ctx.audio);
      this.ctx.ambience.start();
      this.ctx.music = new Music(this.ctx.audio);
      this.ctx.voices = new Voices(this.ctx.audio);
      // What the opening needs comes first.
      void this.ctx.voices.loadManifest().then(() => {
        this.ctx.voices!.preload(openingAssets(openingScore({ returning: false, touch: this.ctx.touch })));
        // Vignettes speak only once their voices are recorded and kept (the rest wait, or play voiceless).
        this.ctx.director.scenes.setAvailable(this.peers.vignettes.vignettesAvailable());
      });
    } catch (e) {
      console.warn('[hedgehog] audio unavailable; continuing in silence', e);
      this.ctx.audio = null;
    }
    applyPrefs(this.ctx);
    // Focus the room itself (a labelled region a screen reader names); Skip is a tab away.
    this.ctx.dom.skip.hidden = false;
    this.ctx.dom.stage.tabIndex = -1;
    this.ctx.dom.stage.focus({ preventScroll: true });
    void this.peers.wake.keepAwake();
    // A phone's back gesture (an edge swipe, easily made while walking) pauses instead of leaving.
    history.pushState({ room: 1 }, '');
    this.beginOpening();
  }

  /**
   * The drawings that were always there: part of the room's history, there when its light
   * comes up. Baked one at a time while the screen is still black after the tap, not while
   * the page loads.
   */
  private bakeOldDrawings() {
    const pending = STATIC_DRAWINGS.filter((d) => !this.ctx.text.items.has(d.id));
    const next = () => {
      const d = pending.shift();
      if (!d) return;
      this.ctx.text.setShown(d.id);
      idle(next, 30, 400);
    };
    idle(next, 30, 400);
  }

  private beginOpening() {
    this.bakeOldDrawings();
    const returning = readOpeningSeen();
    const score = openingScore({ returning, touch: this.ctx.touch });
    this.active = { score, start: wallClock(), fired: new Set() };
    this.ctx.director.hold();
    this.ctx.rig.frameOpening(innerWidth / innerHeight);
    this.ctx.rig.enabled = false;
    this.ctx.rig.walk = false;
    if (this.ctx.ambience) this.ctx.ambience.score.drone = 0;
    document.body.classList.add(CLASS.darkRoom);
    // The threshold becomes the title card: everything but the title goes; the score shows it.
    const th = this.ctx.dom.threshold;
    th.classList.add(CLASS.titling);
    this.ctx.dom.title.style.opacity = returning ? '0' : '1';
    if (returning) th.hidden = true;
  }

  /** Apply the opening's levels for this moment, perform what is due, and hand over at the end. */
  playOpening() {
    const o = this.active!;
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
    this.ctx.dom.title.style.opacity = String(lv.title);
    if (lv.title <= 0.001 && t > 1 && !this.ctx.dom.threshold.hidden) this.ctx.dom.threshold.hidden = true;
    this.ctx.post.black = lv.black;
    this.ctx.post.scoreDark = lv.dark;
    const sc = this.ctx.lighting.score;
    sc.key = lv.key;
    sc.area = lv.area;
    sc.hemi = lv.hemi;
    sc.glow = lv.glow;
    sc.cone = lv.cone;
    this.ctx.room.setLit(lv.panel, lv.ceiling);
    if (this.ctx.ambience) {
      this.ctx.ambience.score.hum = lv.hum;
      this.ctx.ambience.score.vent = lv.vent;
      this.ctx.ambience.score.outside = 0.35 + 0.65 * lv.vent;
    }
    this.ctx.rig.enabled = lv.look > 0.5;
    this.ctx.rig.walk = lv.walk > 0.5;
    document.body.classList.toggle(CLASS.darkRoom, lv.area < 0.5);
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
        this.ctx.text.prepare(ev.phrases);
        // The voiced line is made now too, in the dark: making writing costs a moment, and that
        // moment must not fall where the voice begins.
        const v = this.active?.score.events.find((e) => e.kind === 'voice');
        if (v && v.kind === 'voice') this.prepareVoiceLine(v);
        break;
      }
      case 'sound': {
        if (skipping || !this.ctx.voices || !this.ctx.audio) break;
        const place: VoicePlacement =
          ev.where === 'chair' ? this.peers.cues.place({ kind: 'chair' }) : ev.where === 'door' ? { from: [DOOR_AT.x, DOOR_AT.y, DOOR_AT.z] } : { from: [0, ROOM.height - 0.1, -0.95] };
        const kind = sfxKind(ev.key);
        if (!kind) break;
        void this.ctx.voices.sound(kind, place, ev.gain).then((dur) => {
          if (dur > 0 && ev.caption) this.ctx.captions.say('sound', ev.caption, dur);
        });
        break;
      }
      case 'write': {
        const done = this.ctx.text.writeOn(ev.phrase, { upto: ev.upto, instant: skipping });
        this.writeDoneAt = done;
        if (!skipping && ev.sound && this.ctx.voices && this.ctx.audio) {
          const w = this.ctx.text.whereIs(ev.phrase);
          // The pencil is heard while the hand writes and nobody speaks.
          if (w && done - wallClock() > 0.5) void this.ctx.voices.sound('graphite', { from: [w.centre.x, w.centre.y, w.centre.z] }, 0.32);
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

  /** The writing a voice will write in the opening: made once, in advance. */
  private prepareVoiceLine(ev: Extract<ScoreEvent, { kind: 'voice' }>): string | null {
    const key = `opening:${ev.phrase}`;
    if (this.ctx.text.items.has(key)) return key;
    // To the right of the chair at about eye height, well below the cornice: in frame from the
    // door on a phone held upright (the wall's u runs west to east from its west end).
    const c = this.ctx.chair.group.position;
    const near = { u: c.x + ROOM.halfW + 1.0, v: 1.35 };
    for (const size of ['m', 's'] as const) {
      if (this.ctx.text.write({ key, text: ev.text, hand: ev.hand, size, surface: 'north', near, purpose: 'recall', ttl: 0, now: this.ctx.time, source: ev.phrase, start: false })) return key;
    }
    return null;
  }

  /** A voice from where its words are written, and the words written as they are heard. */
  private async speakAndWrite(writeKey: string | null, phraseId: string, text: string, file: string) {
    let played: Played = { duration: 0 };
    // The room draws breath just before the laugh.
    this.ctx.audio?.silence(0.3, 2.6, 0.3);
    if (this.ctx.voices && this.ctx.audio) {
      played = await this.ctx.voices.playLine('tender', text, writeKey ? { ...this.peers.cues.place({ kind: 'surface', phraseId: writeKey }) } : this.peers.cues.place({ kind: 'chair' }), 0.9, `phrase:${phraseId}`, {
        performances: [file], priority: true,
      });
    }
    const writtenBy = writeKey ? this.peers.cues.writeWithVoice(writeKey, played) : 0;
    // When the words are being written in view, the wall is their caption; the caption follows
    // once the hand has finished, rather than giving the line away first.
    if (writeKey) setTimeout(() => this.ctx.captions.show(text, 3, false), Math.max(0, writtenBy - wallClock()) * 1000);
    else this.ctx.captions.show(text, played.duration > 0 ? played.duration : 3.5, false);
    // Wait for the voice to end and the hand to finish, then a breath.
    const voiceEnd = wallClock() + Math.max(0, played.duration);
    await sleep(Math.max(0, Math.max(voiceEnd, writtenBy) - wallClock()) * 1000);
  }

  /** Skip (Esc, the Skip button, a hidden tab): what was to be written is written; the light eases up. */
  skipOpening() {
    const o = this.active;
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
  advanceTitle() {
    const o = this.active;
    if (!o) return;
    const t = wallClock() - o.start;
    const dark = o.score.stages.find(([st]) => st === 'dark')?.[1] ?? t;
    // Skip forward to a second before the dark, never backwards, never past the title's own fade.
    const to = Math.max(t, dark - 1.0);
    o.start -= to - t;
  }

  private finishOpening() {
    if (!this.active) return;
    this.active = null;
    const sc = this.ctx.lighting.score;
    sc.area = sc.hemi = sc.glow = 1;
    sc.key = ROOM_LEVELS.key;
    sc.cone = ROOM_LEVELS.cone;
    this.ctx.room.setLit(1, 1);
    this.ctx.post.black = 0;
    this.ctx.post.scoreDark = 0;
    if (this.ctx.ambience) Object.assign(this.ctx.ambience.score, { hum: 1, vent: 1, outside: 1, drone: 1 });
    this.ctx.rig.enabled = this.ctx.mode === 'room';
    this.ctx.rig.walk = true;
    document.body.classList.remove(CLASS.darkRoom);
    this.ctx.dom.threshold.hidden = true;
    this.ctx.dom.skip.hidden = true;
    this.ctx.dom.menuBtn.hidden = false;
    this.ctx.dom.writeBtn.hidden = false;
    if (this.ctx.mode === 'room') this.ctx.renderer.domElement.focus();
    this.ctx.director.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED.filter((id) => this.ctx.text.unfinished(id)) });
    this.handoffAt = this.ctx.time;
    this.ctx.rig.endOpeningFrame();
    writeOpeningSeen();
  }
}

/** The room rewards standing still; the screen shouldn't go dark for it. */
export class ScreenWake {
  private lock: { release(): Promise<void> } | null = null;

  async keepAwake() {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl && !this.lock) this.lock = await wl.request('screen');
    } catch {
      /* refused or unsupported: the screen may sleep */
    }
  }

  release() {
    void this.lock?.release().catch(ignored); // (already released by the browser: nothing to undo)
    this.lock = null;
  }

  dropped() {
    this.lock = null;
  }
}
