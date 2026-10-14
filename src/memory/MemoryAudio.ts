import type { AudioSink } from './MemoryPlaybackController';
import type { Due } from './cueDispatch';
import { cueKind, type Cue, type CueKind, type CueSheet, type Place } from './cueSheet';
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
  /** A window-local place → world position. */
  where(p: Place): [number, number, number];
  caption?(text: string, seconds: number): void;
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
    await Promise.all(
      Object.entries(this.sheet.cues).map(async ([label, cue]) => {
        const b = await this.host.load(cue.asset, cue.take);
        if (b) this.buffers.set(label, b);
      }),
    );
  }

  get ready(): boolean {
    return Object.keys(this.sheet.cues).every((k) => this.buffers.has(k));
  }

  /** How many sources are scheduled or sounding (for tests and the editor). */
  get sounding(): number {
    return this.live.size;
  }

  private get now() {
    return this.host.ctx.currentTime;
  }
  private get running() {
    return this.host.ctx.state === 'running';
  }

  play(due: Due[]): void {
    if (this.disposed || !this.running) return;
    for (const d of due) this.start(d.marker, this.now + d.delay, d.late ?? 0, d.late ? 0.3 : undefined);
  }

  /** Start one marker's cue at context time `at`, `into` seconds into its own timeline. */
  private start(marker: Marker, at: number, into: number, fade?: number): void {
    const label = marker.label;
    const kind = cueKind(label);
    const cue = this.sheet.cues[label];
    const buf = this.buffers.get(label);
    if (!kind || !cue || !buf) return;
    if (this.released && kind !== 'sfx') return; // nothing new to stay once the memory lets go
    const c = this.host.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    let from = into + (kind === 'music' ? cue.offset ?? 0 : 0);
    if (kind === 'bed') {
      // Trim the ends (MP3 priming and padding) so the loop doesn't click.
      src.loop = true;
      src.loopStart = Math.min(0.05, buf.duration / 4);
      src.loopEnd = Math.max(src.loopStart + 0.1, buf.duration - 0.05);
      from = src.loopStart + (from % Math.max(0.1, src.loopEnd - src.loopStart));
    } else if (from >= buf.duration - 0.05) return;
    const gain = c.createGain();
    const level = Math.pow(10, cue.gainDb / 20) * (0.55 + 0.45 * this.host.intensity);
    const fadeIn = fade ?? cue.fadeIn ?? 0;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, at);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, at + fadeIn);
    const nodes: AudioNode[] = [src, gain];
    let node: AudioNode = gain;
    src.connect(gain);
    const dur = kind === 'bed' ? Infinity : buf.duration - from;
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
    if (kind === 'bed') {
      // A bed is the place's air: wide, leaning toward the window, not a point.
      const sp = c.createStereoPanner();
      sp.pan.value = Math.max(-1, Math.min(1, cue.place.u * 0.6));
      out = sp;
    } else {
      const [x, y, z] = this.host.where(cue.place);
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.5;
      p.rolloffFactor = 0.8;
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
    out.connect(this.room);
    const live: Live = { label, kind, cue, src, gain, nodes, at, from, marker };
    src.onended = () => this.drop(live);
    this.live.add(live);
    src.start(at, from);
    // A caption says what began, briefly (a bed or music isn't captioned for its whole length).
    if (cue.caption && into === 0) this.host.caption?.(cue.caption, kind === 'sfx' ? Math.min(dur, 4) : 2.5);
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

  release(mode: 'natural' | 'interrupt', fade: number): void {
    if (this.released) return;
    this.released = true;
    for (const l of [...this.live]) {
      if (l.kind === 'sfx') {
        if (l.at > this.now + 0.005 && mode === 'interrupt') this.fadeOut(l, 0);
        else if (mode === 'interrupt' && l.cue.cutOnInterrupt) this.fadeOut(l, 0.3);
        continue; // a clink already ringing rings on
      }
      const own = l.cue.fadeOut ?? fade;
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
    for (const l of [...this.live]) {
      if (l.at > t + 0.005) {
        back.push(l.marker);
        this.fadeOut(l, 0);
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
   * The editor jumped to `position`: nothing scheduled survives the jump; music restarts where the
   * new position puts it; a bed plays if the position is past its marker (and keeps playing,
   * untouched, if it already was).
   */
  seek(position: number): void {
    if (this.disposed) return;
    this.released = false;
    this.paused = [];
    const t = this.now;
    for (const l of [...this.live]) {
      if (l.kind === 'bed' && l.at <= t && l.marker.position <= position) continue;
      this.fadeOut(l, l.kind === 'sfx' ? 0.05 : 0.3);
    }
    if (!this.running) return;
    for (const m of this.markers) {
      const kind = cueKind(m.label);
      if (m.position > position || kind === 'sfx' || kind === null) continue;
      if (kind === 'bed' && [...this.live].some((l) => l.marker === m && l.at <= t)) continue;
      this.start(m, t, position - m.position, 0.3);
    }
  }

  dispose(fade = 0.3): void {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = [];
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
