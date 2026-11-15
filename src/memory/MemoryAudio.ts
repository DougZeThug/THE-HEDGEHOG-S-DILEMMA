import type { AudioSink } from './MemoryPlaybackController';
import type { Due } from './cueDispatch';
import { CaptionTimers } from './captionTimers';
import { cueGraph } from './cueGraph';
import { cueKind, type AnyPlace, type Cue, type CueKind, type CueSheet } from './cueSheet';
import type { Marker } from './types';

/**
 * Web Audio throws `InvalidAccessError` for a node already disconnected and `InvalidStateError`
 * for a source already stopped or never started: both mean "already done". Anything else is a bug.
 */
function expectedAudioError(e: unknown): void {
  const name = (e as { name?: string } | null)?.name;
  if (name !== 'InvalidAccessError' && name !== 'InvalidStateError') console.warn('memory audio:', e);
}


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
  /** Let go at its natural close (not interrupted): its going's own cues still begin. */
  private releasedNaturally = false;
  /** What a pause stopped: where in its own timeline it was, and (sent ahead of the picture by the
   *  lead, not yet reached by it) how long before the picture reaches its start. */
  private paused: { marker: Marker; at: number; wait: number }[] = [];
  /** Sentences of a released memory that played on through a pause: their words, shown again for
   *  what is left of them when the pause ends (the caption's own time ran on while it lasted). */
  private spoken: { text: string; side: Cue['side']; end: number }[] = [];
  private disposed = false;
  /** Captions still to come, each with its sound: kept, shown or dropped with it. */
  private captions = new CaptionTimers<Live>();
  /** Sources fading out for a pause. */
  private fading = new Set<Live>();

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

  /**
   * Never play `label`: a film's sound when the film couldn't be had (its eraser and latch over a
   * still picture read as broken: QA, 2026-10-21).
   */
  without(label: string): void {
    this.markers = this.markers.filter((m) => m.label !== label);
    this.buffers.delete(label);
  }

  get ready(): boolean {
    const used = new Set(this.markers.map((m) => m.label));
    return Object.keys(this.sheet.cues).filter((k) => used.has(k)).every((k) => this.buffers.has(k));
  }

  /** How many sources are scheduled or sounding (for tests). */
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

  /**
   * How far ahead of the picture the sound is sent: its own way to the ear (the context's
   * buffering and the output's latency, where the browser reports them: 0.09 s in a headless
   * Chromium, 0.15–0.3 s through earbuds), less the picture's own way to the screen (about a frame
   * and a half), never more than 0.3 s. Read once, when the first sound is scheduled, and kept for
   * the whole memory (a lead that changed half-way would part its cut from its evening).
   */
  private lead = 0;
  private leadRead = false;
  private readLead(): void {
    if (this.leadRead) return;
    this.leadRead = true;
    const c = this.host.ctx as BaseAudioContext & { baseLatency?: number; outputLatency?: number };
    const way = (Number.isFinite(c.baseLatency) ? c.baseLatency! : 0) + (Number.isFinite(c.outputLatency) ? c.outputLatency! : 0);
    this.lead = Math.max(0, Math.min(0.3, way - 0.025));
  }

  /**
   * Schedule what fell due. `now` is the context time the clock read on this frame, the time the
   * sequence's position stands for (the memory's one anchor: every cue, whenever it is handed out,
   * resumed or brought back, keeps one mapping from the timeline to the audio clock); without it,
   * the context's time now.
   */
  play(due: Due[], now = this.now): Marker[] {
    // (Not running: nothing can be scheduled; handed back, to be handed out again when it runs.)
    if (this.disposed) return [];
    if (!this.running) return due.map((d) => d.marker);
    this.readLead();
    for (const d of due) {
      // Joined part-way after a stall: brought in over 0.3 s, or its own shorter fade (the
      // evening comes up in 40 ms, late or not).
      const fade = d.late ? Math.min(0.3, this.sheet.cues[d.marker.label]?.fadeIn ?? 0.3) : undefined;
      this.start(d.marker, now - this.lead + d.delay, d.late ?? 0, fade, true);
    }
    return [];
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
    // Nothing new to stay once the memory lets go; but a natural going may have sounds of its own.
    if (this.released && kind !== 'sfx' && !(cue.inWithdrawal && this.releasedNaturally)) return;
    // Seconds from now until the picture reaches the point `into` of this cue (it sees what is
    // heard), and where that was, for its caption.
    const shown = at + this.lead - this.now, into0 = into;
    // (A render quantum ahead: by the time the context hears of it, "now" may have passed.)
    const soonest = this.now + 128 / this.host.ctx.sampleRate;
    if (at < soonest) {
      // Already due (a stall, a resume, the sound sent ahead of the picture by its latency): a bed
      // or the music joins where it has got to, so it stays on the memory's timeline; a one-shot
      // or a sentence starts now, whole.
      if (kind === 'bed' || kind === 'music') into += soonest - at;
      at = soonest;
    }
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
    const stop = Math.min(cue.stopAfter !== undefined && kind !== 'bed' ? Math.max(0.05, cue.stopAfter - from) : Infinity, until);
    const dur = kind === 'bed' ? stop : Math.min(buf.duration - from, stop);
    const cut = Number.isFinite(stop) && (kind === 'bed' || stop < buf.duration - from);
    // A fade-in that a cut comes into (a resume just before it) rises only until the cut begins,
    // to the level it has reached by then: its ramp may not outlast the cut's (the context orders
    // them by time, and the cut's silence would come before its own fade had ended).
    const fadeIn = fade ?? cue.fadeIn ?? 0;
    const rise = cut ? Math.min(fadeIn, stop - 0.04) : fadeIn;
    const reached = fadeIn > 0 ? level * Math.min(1, rise / fadeIn) : level;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, at);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(reached, at + rise);
    src.connect(gain);
    if (cut) {
      // Cut off, not faded: a sentence that stops, but without a click.
      gain.gain.setValueAtTime(reached, at + stop - 0.04);
      gain.gain.linearRampToValueAtTime(SILENT, at + stop);
    }
    const nodes: AudioNode[] = [src, gain, ...cueGraph(this.host, this.room, gain, cue, kind, at, dur)];
    const live: Live = { label, kind, cue, src, gain, nodes, at, from, marker };
    src.onended = () => this.drop(live);
    this.live.add(live);
    src.start(at, from);
    if (cut) src.stop(at + stop + 0.02);
    // Every caption is shown as its sound is heard, with the picture: a cue is handed out ahead of
    // both, by up to the dispatch's lookahead (QA, 2026-10-20: a caption without its own moment came
    // up 0.75 s before its sound).
    if (kind === 'voice') {
      // The words, for as long as they are said (a sentence that is cut off ends in a dash).
      const text = cue.text;
      if (text && (into === 0 || caption)) this.captions.later(shown, () => this.host.caption?.(text, dur, true, cue.side), live);
      return;
    }
    // A caption says what began, briefly (a bed or music isn't captioned for its whole length).
    // (Also when it starts late or part-way in, after a stall: the caption is what a deaf visitor
    // has of it. Not when it comes back after a pause or a seek, unless its caption, given a
    // moment into it (`captionAt`), was still to come.)
    const said = [...(cue.caption ? [{ at: cue.captionAt ?? 0, text: cue.caption }] : []), ...(cue.captions ?? [])];
    for (const { at: when, text } of said) {
      const due = when - into0;
      if (!(into0 === 0 || caption || due > 0)) continue;
      const seconds = kind === 'sfx' ? Math.min(dur, 4) : 2.5;
      this.captions.later(shown + Math.max(0, due), () => this.host.caption?.(text, seconds), live);
    }
  }

  private drop(l: Live): void {
    if (!this.live.delete(l)) return;
    l.src.onended = null;
    for (const n of l.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        // (Already disconnected.)
        expectedAudioError(e);
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
      } catch (e) {
        // (Never started.)
        expectedAudioError(e);
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
    } catch (e) {
      // (Already stopped.)
      expectedAudioError(e);
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

  /**
   * `soft`: let go early but gently (a painted memory looked away from, walked off, tapped past):
   * a sentence already begun is said to its end, as a vignette's is, and nothing new is begun.
   * Overheard words are never chopped mid-syllable by a turned head.
   */
  release(mode: 'natural' | 'interrupt', fade: number, soft = false): void {
    if (this.released) return;
    this.released = true;
    this.releasedNaturally = mode === 'natural';
    // Let go naturally, a sentence or a one-shot plays on (begun or not), captioned as it is heard;
    // interrupted, one that has begun is heard a moment more, and captioned at once.
    const begun = (l: Live) => (l.kind === 'voice' || l.kind === 'sfx') && l.at <= this.now + 0.005;
    if (mode === 'natural') this.captions.settle((l) => l.kind === 'voice' || l.kind === 'sfx');
    else this.captions.settle(undefined, begun);
    for (const l of [...this.live]) {
      // Interrupted, a bed or music the picture hasn't reached yet (sent ahead of it by the lead:
      // the evening, let go in the last instant before the cut) goes at once, unseen.
      if (mode === 'interrupt' && (l.kind === 'music' || l.kind === 'bed') && l.at + this.lead > this.now + 0.005) {
        this.fadeOut(l, 0.03);
        continue;
      }
      if (l.kind === 'voice') {
        // A sentence already begun is finished at a natural close or a soft one; interrupted, it is cut.
        if (mode === 'interrupt' && (l.at > this.now + 0.005 || !soft)) this.fadeOut(l, l.at > this.now + 0.005 ? 0 : 0.3);
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
      // Interrupted, music recedes just after the picture (a bed goes with it); a file that ends
      // sooner (cut where the memory cuts) has faded by its end, not stopped part-way down.
      let f = mode === 'natural' ? own : Math.min(own, l.kind === 'music' ? fade + 1.5 : fade);
      if (l.kind === 'music' && l.src.buffer) f = Math.min(f, Math.max(0.02, l.src.buffer.duration - (Math.max(0, this.now - l.at) + l.from) - 0.02));
      this.fadeOut(l, f);
    }
  }

  /**
   * Settings opened, or the tab hidden: what hasn't sounded yet is taken back (returned, so the
   * dispatcher hands it out again), beds and music fade and remember where they were, and a
   * one-shot already ringing finishes. `now`: the clock's time on the frame the picture stopped
   * at, so each remembers the place the picture shows (not a frame later).
   */
  pause(now = this.now): Marker[] {
    const back: Marker[] = [];
    const t = this.now;
    const shown = now - this.lead;
    this.paused = [];
    this.spoken = [];
    // (A one-shot already ringing finishes, and so does a sentence of a released memory: captioned at once. What is taken back, or said again,
    // is captioned when it is.)
    this.captions.settle(undefined, (l) => (l.kind === 'sfx' || (l.kind === 'voice' && this.released)) && l.at <= t + 0.005);
    for (const l of [...this.live]) {
      if (l.at > t + 0.005) {
        back.push(l.marker);
        this.fadeOut(l, 0);
      } else if (l.kind === 'voice' && this.released) {
        // Let go while it spoke (a soft release: "a sentence already begun is said to its end"):
        // nothing new is begun once released, so it could never be said again. It plays on, whole.
        if (l.cue.text && l.src.buffer) {
          // (It ends where start() would have stopped it: at its recording's end, or the cut it was given.)
          const stop = l.cue.stopAfter !== undefined ? Math.max(0.05, l.cue.stopAfter - l.from) : Infinity;
          const until = l.cue.until !== undefined ? l.cue.until - l.marker.position - l.from : Infinity;
          this.spoken.push({ text: l.cue.text, side: l.cue.side, end: l.at + Math.min(l.src.buffer.duration - l.from, stop, until) });
        }
        continue;
      } else if (l.kind === 'voice') {
        // Paused mid-sentence: it is said again from the start when the room comes back.
        back.push(l.marker);
        this.fadeOut(l, 0.25);
        this.fading.add(l);
      } else if (l.kind !== 'sfx') {
        // (Begun ahead of the frozen picture, by the lead: it begins that far ahead again.)
        const wait = Math.max(0, l.at - shown);
        this.paused.push({ marker: l.marker, at: wait > 0 ? this.into(l, l.at) : this.into(l, shown), wait });
        this.fadeOut(l, 0.4);
        this.fading.add(l);
      }
    }
    return back;
  }

  /** Seconds into the cue's own timeline (from its marker) a source has reached at time `t`. */
  private into(l: Live, t: number): number {
    return Math.max(0, t - l.at) + l.from - (l.kind === 'music' ? l.cue.offset ?? 0 : l.src.loopStart);
  }

  /**
   * Back where the picture is, on the frame it moves on from (`now`, the clock's time then).
   * `back`: seconds the picture stepped back on resuming (a sentence the pause cut, said again from
   * its start): the music steps back with it, so it keeps its place in the timeline; a bed is state,
   * not timeline, and carries on (Codex review, 2026-11-09).
   */
  resume(now = this.now, back = 0): void {
    if (this.disposed) return;
    // What faded for the pause and never finished (the context was suspended with it, a hidden
    // tab) goes now, so it doesn't fade on over its own restart.
    for (const l of this.fading) if (this.live.has(l)) this.fadeOut(l, 0.02);
    this.fading.clear();
    for (const p of this.paused) {
      let { at, wait } = p;
      if (back > 0 && cueKind(p.marker.label) === 'music') {
        // (Stepped back to before it began: it waits for its place again.)
        wait += Math.max(0, back - at);
        at = Math.max(0, at - back);
      }
      this.start(p.marker, now - this.lead + wait, at, wait > 0 ? undefined : 1);
    }
    this.paused = [];
    // A sentence that played on through the pause: its words again, for what is left of it.
    for (const w of this.spoken) if (w.end - this.now > 0.3) this.host.caption?.(w.text, w.end - this.now, true, w.side);
    this.spoken = [];
  }

  /**
   * The sequence was moved by hand (the editor, a held capture): it is silent while held, so
   * everything fades and nothing new is scheduled. `resync` brings back what should be sounding
   * when it plays on.
   */
  seek(_position: number): void {
    if (this.disposed) return;
    this.released = this.releasedNaturally = false;
    this.paused = [];
    this.captions.settle();
    for (const l of [...this.live]) this.fadeOut(l, l.kind === 'sfx' ? 0.05 : 0.3);
  }

  /**
   * Playing on from `position` after a seek: the bed and the music it is inside, part-way in.
   * `now`: the clock's time that position stands for.
   */
  resync(position: number, now = this.now): void {
    if (this.disposed || !this.running) return;
    this.readLead();
    const t = this.now;
    for (const m of this.markers) {
      const kind = cueKind(m.label);
      if (m.position > position || kind === 'sfx' || kind === 'voice' || kind === null) continue;
      if (kind === 'bed' && [...this.live].some((l) => l.marker === m && l.at <= t)) continue;
      this.start(m, now - this.lead, position - m.position, 0.3);
    }
  }

  dispose(fade = 0.3): void {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = [];
    this.captions.settle();
    for (const l of [...this.live]) this.fadeOut(l, fade);
    const room = this.room, wet = this.wet;
    const done = () => {
      for (const l of [...this.live]) this.drop(l);
      try {
        room.disconnect();
        wet.disconnect();
      } catch (e) {
        // (Already disconnected.)
        expectedAudioError(e);
      }
    };
    // Sources disconnect themselves when they end; the room goes once its tail has rung out.
    setTimeout(done, (fade + this.sheet.room[0] + 0.2) * 1000);
  }
}
