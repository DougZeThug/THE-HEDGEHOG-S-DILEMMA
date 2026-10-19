import type { AudioSink } from './MemoryPlaybackController';
import type { Due } from './cueDispatch';
import { cueKind, isSpot, type AnyPlace, type Cue, type CueKind, type CueSheet } from './cueSheet';
import type { Marker } from './types';

/**
 * A memory's sound, played through Web Audio on the AudioContext's clock.
 *
 * The playback controller hands it the events that fall due (each once, with how far ahead it
 * falls); this schedules them, places them inside the memory (a panner behind the wall, a lowpass,
 * the memory's own small room, never the white room's reverb) and keeps track of every node so
 * that leaving, pausing, seeking and disposing never leave anything sounding or connected.
 *
 * - One-shots (`sfx:`) ring on when the memory lets go, unless marked `cutOnInterrupt`.
 * - Beds (`bed:`) are state, not timeline: they loop until the memory lets go, and a seek never
 *   restarts one that is already playing.
 * - Music (`music:`) is timeline: a seek or a resume restarts it at the right offset, with a fade.
 * - Nothing new starts while the context isn't running; such an event is simply missed (no late
 *   burst when the tab comes back).
 * - Voices (`voice:`, a vignette's lines) are one-shots captioned as speech for as long as they
 *   sound. Interrupted, a voice is cut (0.3 s); paused mid-sentence, the sentence is taken back
 *   and said again from its start on resume. One that may stop part-way (`stopAfter`) is cut
 *   there. A voice with no recording yet goes to the host's fallback (previews only).
 */
export interface MemoryAudioHost {
  ctx: BaseAudioContext;
  /** The memory bus (not ducked by the room's silences). */
  out: AudioNode;
  /** A decoded file for a cue, as recorded (no normalising). */
  load(asset: string, take?: number): Promise<AudioBuffer | null>;
  impulse(seconds: number, decay: number, seed: number): AudioBuffer;
  /** The room's sound intensity setting (0…1). */
  intensity: number;
  /** A window-local place (or a place in the room, for a vignette) → world position. */
  where(p: AnyPlace): [number, number, number];
  /** A caption: a sound's description, or (`speech`) the words being said, and by whom. */
  caption?(text: string, seconds: number, speech?: boolean, side?: 'left' | 'right'): void;
  /** A voice with no recording (previews only): said some other way, `delay` seconds from now. */
  fallback?(cue: Cue, delay: number): void;
  /** A gain that brings a recording to a common level (spoken lines; 1 if absent). */
  level?(asset: string, buf: AudioBuffer): number;
}

interface Live {
  label: string;
  kind: CueKind;
  cue: Cue;
  src: AudioBufferSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
  /** Context time it starts (or started). */
  at: number;
  /** Seconds into the file at `at`. */
  from: number;
  marker: Marker;
}

const SILENT = 1e-4;

export class MemoryAudio implements AudioSink {
  private buffers = new Map<string, AudioBuffer>();
  private live = new Set<Live>();
  private room: ConvolverNode;
  private wet: GainNode;
  private released = false;
  private paused: { marker: Marker; at: number }[] = [];
  private disposed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private host: MemoryAudioHost, private sheet: CueSheet, private markers: Marker[], seed = 1) {
    const c = host.ctx;
    this.room = c.createConvolver();
    this.room.buffer = host.impulse(sheet.room[0], sheet.room[1], seed);
    this.wet = c.createGain();
    this.wet.gain.value = sheet.room[2];
    this.room.connect(this.wet).connect(host.out);
  }

  /** Fetch and decode everything the sheet uses (on `memory-prepare`, before anything is due). */
  async prepare(): Promise<void> {
    // Only what this variant's timeline actually plays (a dusk without its piano never decodes it).
    const used = new Set(this.markers.map((m) => m.label));
    await Promise.all(
      Object.entries(this.sheet.cues).filter(([label]) => used.has(label)).map(async ([label, cue]) => {
        const b = await this.host.load(cue.asset, cue.take);
        if (b) this.buffers.set(label, b);
      }),
    );
  }

  get ready(): boolean {
    const used = new Set(this.markers.map((m) => m.label));
    return Object.keys(this.sheet.cues).filter((k) => used.has(k)).every((k) => this.buffers.has(k));
  }

  /** How many sources are scheduled or sounding (for tests and the editor). */
  get sounding(): number {
    return this.live.size;
  }

  /** Context time the last voice now scheduled or sounding will have finished (0: none). */
  get voicesUntil(): number {
    let end = 0;
    for (const l of this.live) {
      if (l.kind !== 'voice' || !l.src.buffer) continue;
      const len = Math.min(l.src.buffer.duration - l.from, l.cue.stopAfter !== undefined ? l.cue.stopAfter - l.from : Infinity);
      end = Math.max(end, l.at + len);
    }
    return end;
  }

  private get now() {
    return this.host.ctx.currentTime;
  }
  private get running() {
    return this.host.ctx.state === 'running';
  }

  play(due: Due[]): void {
    if (this.disposed || !this.running) return;
    for (const d of due) this.start(d.marker, this.now + d.delay, d.late ?? 0, d.late ? 0.3 : undefined, true);
  }

  /** Start one marker's cue at context time `at`, `into` seconds into its own timeline. */
  private start(marker: Marker, at: number, into: number, fade?: number, caption = false): void {
    const label = marker.label;
    const kind = cueKind(label);
    const cue = this.sheet.cues[label];
    const buf = this.buffers.get(label);
    if (!kind || !cue) return;
    if (!buf) {
      if (kind === 'voice' && into === 0 && !this.released) this.host.fallback?.(cue, Math.max(0, at - this.now));
      return;
    }
    if (this.released && kind !== 'sfx') return; // nothing new to stay once the memory lets go
    const c = this.host.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    let from = into + (kind === 'music' ? cue.offset ?? 0 : 0);
    if (kind === 'bed') {
      // Trim the ends (MP3 priming and padding) so the loop doesn't click. A bed made in the
      // engine is seamless where it wraps: trimmed, it would skip a tenth of a second each time.
      src.loop = true;
      const made = cue.asset.startsWith('synth:');
      src.loopStart = made ? 0 : Math.min(0.05, buf.duration / 4);
      src.loopEnd = made ? buf.duration : Math.max(src.loopStart + 0.1, buf.duration - 0.05);
      from = src.loopStart + (from % Math.max(0.1, src.loopEnd - src.loopStart));
    } else if (from >= buf.duration - 0.05) return;
    // Cut at a point of the memory's timeline (the woodland's cut): seconds from `at`. Already
    // there or nearly (a pause just before it), it isn't started at all.
    const until = cue.until !== undefined ? cue.until - marker.position - into : Infinity;
    if (until < 0.1) return;
    const gain = c.createGain();
    // A one-shot is a point in the scene: mono before its panner (a stereo file's own left/right
    // imbalance would otherwise move it away from where it is placed).
    if (kind === 'sfx' || kind === 'voice') {
      gain.channelCount = 1;
      gain.channelCountMode = 'explicit';
    }
    const level = Math.pow(10, cue.gainDb / 20) * (0.55 + 0.45 * this.host.intensity) * (kind === 'voice' ? this.host.level?.(cue.asset, buf) ?? 1 : 1);
    const fadeIn = fade ?? cue.fadeIn ?? 0;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, at);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, at + fadeIn);
    const nodes: AudioNode[] = [src, gain];
    let node: AudioNode = gain;
    src.connect(gain);
    const stop = Math.min(cue.stopAfter !== undefined && kind !== 'bed' ? Math.max(0.05, cue.stopAfter - from) : Infinity, until);
    const dur = kind === 'bed' ? stop : Math.min(buf.duration - from, stop);
    const cut = Number.isFinite(stop) && (kind === 'bed' || stop < buf.duration - from);
    if (cut) {
      // Cut off, not faded: a sentence that stops, but without a click (and from wherever a
      // fade-in has reached by then, not from its full level).
      gain.gain.setValueAtTime(level * (fadeIn > 0 ? Math.min(1, (stop - 0.04) / fadeIn) : 1), at + stop - 0.04);
      gain.gain.linearRampToValueAtTime(SILENT, at + stop);
    }
    if (cue.lowpass) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(cue.lowpass, at);
      if (cue.lowpassTo && Number.isFinite(dur)) lp.frequency.exponentialRampToValueAtTime(cue.lowpassTo, at + dur);
      node.connect(lp);
      node = lp;
      nodes.push(lp);
    }
    if (cue.highpass) {
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.Q.value = 0.7;
      hp.frequency.setValueAtTime(cue.highpass, at);
      node.connect(hp);
      node = hp;
      nodes.push(hp);
    }
    let out: AudioNode;
    if (kind === 'bed' || (kind === 'music' && cue.wide)) {
      // A bed is the place's air: wide, leaning toward the window, not a point (and music
      // marked wide is the place's air laid along the timeline).
      const sp = c.createStereoPanner();
      const pan = isSpot(cue.place) ? { left: -0.5, right: 0.5 }[cue.place.at as 'left'] ?? 0 : cue.place.u * 0.6;
      sp.pan.value = Math.max(-1, Math.min(1, pan));
      out = sp;
    } else {
      const [x, y, z] = this.host.where(cue.place);
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      // A voice falls off as the room's speech does (it stays intelligible a few metres away).
      p.refDistance = kind === 'voice' ? 2 : 1.5;
      p.rolloffFactor = kind === 'voice' ? 0.6 : 0.8;
      p.maxDistance = 30;
      p.positionX.setValueAtTime(x, at);
      p.positionY.setValueAtTime(y, at);
      p.positionZ.setValueAtTime(z, at);
      if (cue.to && Number.isFinite(dur)) {
        const [x2, y2, z2] = this.host.where(cue.to);
        p.positionX.linearRampToValueAtTime(x2, at + dur);
        p.positionY.linearRampToValueAtTime(y2, at + dur);
        p.positionZ.linearRampToValueAtTime(z2, at + dur);
      }
      out = p;
    }
    node.connect(out);
    nodes.push(out);
    out.connect(this.host.out);
    if (!cue.dry) out.connect(this.room);
    const live: Live = { label, kind, cue, src, gain, nodes, at, from, marker };
    src.onended = () => this.drop(live);
    this.live.add(live);
    src.start(at, from);
    if (cut) src.stop(at + stop + 0.02);
    if (kind === 'voice') {
      // The words, for as long as they are said (a sentence that is cut off ends in a dash).
      if (cue.text && (into === 0 || caption)) this.host.caption?.(cue.text, dur, true, cue.side);
      return;
    }
    // A caption says what began, briefly (a bed or music isn't captioned for its whole length).
    // (Also when it starts late or part-way in, after a stall: the caption is what a deaf visitor
    // has of it. Not when it comes back after a pause or a seek, unless its caption, given a
    // moment into it (`captionAt`), was still to come.)
    const due = cue.captionAt === undefined ? 0 : cue.captionAt - into;
    if (cue.caption && (into === 0 || caption || due > 0)) {
      const text = cue.caption, seconds = kind === 'sfx' ? Math.min(dur, 4) : 2.5;
      if (cue.captionAt === undefined) this.host.caption?.(text, seconds);
      else this.later(at - this.now + Math.max(0, due), () => this.host.caption?.(text, seconds));
    }
  }

  /** Something to do `seconds` from now (a caption a moment into its sound), unless the memory
   *  pauses, seeks, lets go or ends first. */
  private later(seconds: number, f: () => void): void {
    if (seconds <= 0.02 || typeof setTimeout !== 'function') return f();
    const h = setTimeout(() => {
      this.timers.delete(h);
      f();
    }, seconds * 1000);
    this.timers.add(h);
  }

  private cancelLater(): void {
    for (const h of this.timers) clearTimeout(h);
    this.timers.clear();
  }

  private drop(l: Live): void {
    if (!this.live.delete(l)) return;
    l.src.onended = null;
    for (const n of l.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  }

  /** Fade one source out over `fade` seconds from now and stop it there. */
  private fadeOut(l: Live, fade: number): void {
    const t = this.now;
    if (l.at > t + 0.005) {
      // Scheduled but not yet sounding: it never will.
      try {
        l.src.stop();
      } catch {
        /* never started */
      }
      this.drop(l);
      return;
    }
    const g = l.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(SILENT, t + Math.max(0.02, fade));
    try {
      l.src.stop(t + Math.max(0.02, fade) + 0.02);
    } catch {
      /* already stopped */
    }
  }

  /**
   * A deliberate silence: the memory's own air (its beds) falls to `depth` over 1.2 s, holds for
   * `seconds`, and comes back over 2.5 s. (A wait for an answer doesn't do this: the room carries
   * on, and nothing marks what isn't said.)
   */
  duckBeds(depth: number, seconds: number): void {
    const t = this.now;
    for (const l of this.live) {
      if (l.kind !== 'bed' || l.at > t) continue;
      const g = l.gain.gain;
      const level = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(level, t);
      g.linearRampToValueAtTime(level * depth, t + 1.2);
      g.setValueAtTime(level * depth, t + 1.2 + Math.max(0, seconds - 1.2));
      g.linearRampToValueAtTime(level, t + Math.max(1.2, seconds) + 2.5);
    }
  }

  release(mode: 'natural' | 'interrupt', fade: number): void {
    if (this.released) return;
    this.released = true;
    this.cancelLater();
    for (const l of [...this.live]) {
      if (l.kind === 'voice') {
        // A sentence already begun is finished at a natural close; interrupted, it is cut.
        if (mode === 'interrupt') this.fadeOut(l, l.at > this.now + 0.005 ? 0 : 0.3);
        continue;
      }
      if (l.kind === 'sfx') {
        if (l.at > this.now + 0.005 && mode === 'interrupt') this.fadeOut(l, 0);
        else if (mode === 'interrupt' && l.cue.cutOnInterrupt) this.fadeOut(l, 0.3);
        continue; // a clink already ringing rings on
      }
      const own = l.cue.fadeOut ?? fade;
      // Music that ends on its own soon after a natural close plays out (its last chord decays
      // with the image) rather than being faded under.
      if (mode === 'natural' && l.kind === 'music' && l.src.buffer) {
        const left = l.src.buffer.duration - (Math.max(0, this.now - l.at) + l.from);
        if (left <= own + 4) continue;
      }
      // Interrupted, music recedes just after the picture (a bed goes with it).
      this.fadeOut(l, mode === 'natural' ? own : Math.min(own, l.kind === 'music' ? fade + 1.5 : fade));
    }
  }

  /**
   * Settings opened, or the tab hidden: what hasn't sounded yet is taken back (returned, so the
   * dispatcher hands it out again), beds and music fade and remember where they were, and a
   * one-shot already ringing finishes.
   */
  pause(): Marker[] {
    const back: Marker[] = [];
    const t = this.now;
    this.paused = [];
    this.cancelLater();
    for (const l of [...this.live]) {
      if (l.at > t + 0.005) {
        back.push(l.marker);
        this.fadeOut(l, 0);
      } else if (l.kind === 'voice') {
        // Paused mid-sentence: it is said again from the start when the room comes back.
        back.push(l.marker);
        this.fadeOut(l, 0.25);
      } else if (l.kind !== 'sfx') {
        this.paused.push({ marker: l.marker, at: this.into(l, t) });
        this.fadeOut(l, 0.4);
      }
    }
    return back;
  }

  /** Seconds into the cue's own timeline (from its marker) a source has reached at time `t`. */
  private into(l: Live, t: number): number {
    return Math.max(0, t - l.at) + l.from - (l.kind === 'music' ? l.cue.offset ?? 0 : l.src.loopStart);
  }

  resume(): void {
    if (this.disposed) return;
    const t = this.now;
    for (const p of this.paused) this.start(p.marker, t, p.at, 1);
    this.paused = [];
  }

  /**
   * The sequence was moved by hand (the editor, a held capture): it is silent while held, so
   * everything fades and nothing new is scheduled. `resync` brings back what should be sounding
   * when it plays on.
   */
  seek(_position: number): void {
    if (this.disposed) return;
    this.released = false;
    this.paused = [];
    this.cancelLater();
    for (const l of [...this.live]) this.fadeOut(l, l.kind === 'sfx' ? 0.05 : 0.3);
  }

  /** Playing on from `position` after a seek: the bed and the music it is inside, part-way in. */
  resync(position: number): void {
    if (this.disposed || !this.running) return;
    const t = this.now;
    for (const m of this.markers) {
      const kind = cueKind(m.label);
      if (m.position > position || kind === 'sfx' || kind === 'voice' || kind === null) continue;
      if (kind === 'bed' && [...this.live].some((l) => l.marker === m && l.at <= t)) continue;
      this.start(m, t, position - m.position, 0.3);
    }
  }

  dispose(fade = 0.3): void {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = [];
    this.cancelLater();
    for (const l of [...this.live]) this.fadeOut(l, fade);
    const room = this.room, wet = this.wet;
    const done = () => {
      for (const l of [...this.live]) this.drop(l);
      try {
        room.disconnect();
        wet.disconnect();
      } catch {
        /* already gone */
      }
    };
    // Sources disconnect themselves when they end; the room goes once its tail has rung out.
    if (typeof setTimeout === 'function') setTimeout(done, (fade + this.sheet.room[0] + 0.2) * 1000);
    else done();
  }
}
