import type { AudioEngine } from './AudioEngine';
import type { VoiceKind } from '../state/cues';
import { Rng, hashString } from '../core/rng';
import { idle } from '../core/time';
import { chooseSource, preloadStages, type Source } from './selection';
import { LEVEL_DB, loadKeyFile, measure, normaliseGain, voicedGain } from './voiceAssets';
import { VoiceSynth, type VoicePlacement } from './voiceSynth';

export { voicedGain, type VoicePlacement };

/**
 * Voices.
 *
 * Three sources, in order of preference:
 *  1. Recorded assets listed in /voices/manifest.json (keyed by fragment id or "phrase:<id>").
 *  2. Synthesised voice *textures*: formant-filtered whispers shaped by the syllables of
 *     the text, voiced murmurs heard through a wall, breath, laughter, humming. They are
 *     not meant to be intelligible — captions carry the words — they carry the body.
 *  3. Optional browser speech (off by default): intelligible but generic, non-spatial,
 *     and explicitly a fallback rather than the intended voice of the piece.
 */

export interface PlayOptions {
  /** Recorded performance files for this phrase, best first for this moment. */
  performances?: string[];
  /** Semitones above the base for a hummed tune; -100 is a rest. */
  melody?: number[];
  /** Never substitute a recording. */
  synth?: boolean;
}

/** What was played: how long, when it starts on the audio clock, and which recording. */
export interface Played {
  duration: number;
  startAt?: number;
  file?: string;
}

export class Voices {
  private manifest: Record<string, string[]> = {};
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private rng = new Rng(31);
  speechFallback = false;
  private active = 0;
  private synth: VoiceSynth;

  constructor(private a: AudioEngine, private base = './voices/') {
    this.synth = new VoiceSynth(a, (place, reverb, dur, gain) => this.chain(place, reverb, dur, gain), this.rng);
  }

  async loadManifest() {
    this.manifest = await loadKeyFile(this.base + 'manifest.json');
  }

  /**
   * Takes generated but not kept yet, for the artist's previews only (`?vignette=`): read by `raw`
   * and `filesOf` where the manifest has nothing, never by `hasAsset`, so what visitors meet is
   * unchanged.
   */
  private preview: Record<string, string[]> = {};

  async loadPreview() {
    this.preview = await loadKeyFile(this.base + 'vignette-preview.json');
  }


  private filesFor(key: string): string[] | undefined {
    return this.manifest[key]?.length ? this.manifest[key] : this.preview[key];
  }

  get assetCount() {
    return Object.values(this.manifest).reduce((n, v) => n + v.length, 0);
  }

  hasAsset(key: string) {
    return !!this.manifest[key]?.length;
  }

  private voiced = new WeakMap<AudioBuffer, number>();
  /** `voicedGain` of a decoded recording, measured once. */
  voicedLevel(buf: AudioBuffer): number {
    let g = this.voiced.get(buf);
    if (g === undefined) this.voiced.set(buf, (g = voicedGain(buf)));
    return g;
  }

  /** The recordings kept for a key, in manifest order (what `raw`'s take indexes). */
  filesOf(key: string): readonly string[] {
    return this.filesFor(key) ?? [];
  }

  /** Per-file gain that brings recordings to a common loudness (they arrive at arbitrary levels). */
  private norm = new Map<string, number>();

  private loadBuffer(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      p = fetch(this.base + file)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => this.a.ctx.decodeAudioData(b))
        .then((buf) => {
          this.norm.set(file, normaliseGain(buf, file.startsWith('dialogue/')) * Math.pow(10, (LEVEL_DB.get(file) ?? 0) / 20));
          return buf;
        })
        .catch(() => null);
      this.buffers.set(file, p);
    }
    return p;
  }

  /**
   * A recording as it was made, for a memory's cue sheet (which carries its own authored levels):
   * the take asked for, or the first. Kept decoded until `forget` lets it go.
   */
  async raw(key: string, take = 0): Promise<AudioBuffer | null> {
    const files = this.filesFor(key);
    if (!files?.length) return null;
    return this.loadBuffer(files[Math.min(files.length - 1, Math.max(0, take))]);
  }

  /** Let a memory's recordings go once it has finished (phones keep little decoded audio). */
  forget(keys: string[]): void {
    for (const k of keys) for (const f of this.filesFor(k) ?? []) this.buffers.delete(f);
  }

  /** Loudness diagnostics for QA: file → [rms dBFS, peak dBFS, seconds]. */
  async levels(): Promise<Record<string, [number, number, number]>> {
    const out: Record<string, [number, number, number]> = {};
    for (const files of Object.values(this.manifest))
      for (const f of files) {
        const b = await this.loadBuffer(f);
        if (b) {
          const { rms, peak } = measure(b);
          out[f] = [+(20 * Math.log10(rms)).toFixed(1), +(20 * Math.log10(peak)).toFixed(1), +b.duration.toFixed(2)];
        }
      }
    return out;
  }

  /** Preload in stages, so a phone isn't asked to download every take on arrival. */
  preload(priority: string[] = []) {
    // What the opening needs, before anything else.
    for (const k of priority) for (const f of this.manifest[k] ?? (k.endsWith('.mp3') ? [k] : [])) void this.loadBuffer(f);
    const { first, rest } = preloadStages(this.manifest);
    const later = () => {
      const next = rest.splice(0, 3);
      if (!next.length) return;
      void Promise.all(next.map((f) => this.loadBuffer(f))).then(() => idle(later, 500, 4000));
    };
    void Promise.all(first.map((f) => this.loadBuffer(f))).then(() => idle(later, 500, 4000));
  }

  /** Build the spatial tail: [input] → (muffle) → panner/stereo → bus (+ reverb send). Returns input node. */
  private chain(place: VoicePlacement, reverb: number, dur: number, gain: number): GainNode {
    const c = this.a.ctx;
    const t = c.currentTime;
    const input = c.createGain();
    input.gain.value = gain;
    if (place.tag) {
      const list = this.tagged.get(place.tag) ?? [];
      list.push(input);
      this.tagged.set(place.tag, list);
      setTimeout(() => {
        const l = this.tagged.get(place.tag!);
        if (l) this.tagged.set(place.tag!, l.filter((n) => n !== input));
      }, (dur + 6) * 1000);
    }
    let node: AudioNode = input;
    if (place.muffled) {
      // Through a wall. Recorded performances keep their breath and catches (they live at
      // 1–3 kHz), so they are muffled more gently and made quieter instead.
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = place.recording ? 2200 : 750;
      lp.Q.value = 0.4;
      node.connect(lp);
      node = lp;
      if (place.recording) {
        const wall = c.createGain();
        wall.gain.value = 0.42;
        node.connect(wall);
        node = wall;
      }
    }
    let outNode: AudioNode;
    if (place.nowhere || !place.from) {
      // Drifting, from no particular place — starting anywhere, not always toward the right.
      const sp = c.createStereoPanner();
      const depth = place.recording ? 0.2 : 0.55;
      const phase = Math.random() * Math.PI * 2;
      const len = Math.max(0.5, dur + 4);
      const curve = new Float32Array(64);
      for (let i = 0; i < curve.length; i++) curve[i] = depth * Math.sin(phase + 2 * Math.PI * 0.07 * (len * i) / (curve.length - 1));
      sp.pan.setValueCurveAtTime(curve, t, len);
      node.connect(sp);
      outNode = sp;
    } else {
      const [x, y, z] = place.from;
      // Speech stays intelligible across the room (and on a phone speaker): its place is
      // carried by direction more than by distance loss.
      const p = place.recording ? this.a.panner(x, y, z, 2.0, 0.6) : this.a.panner(x, y, z, 0.8, 1.15);
      if (place.to) {
        const [x2, y2, z2] = place.to;
        p.positionX.setValueAtTime(x, t);
        p.positionY.setValueAtTime(y, t);
        p.positionZ.setValueAtTime(z, t);
        p.positionX.linearRampToValueAtTime(x2, t + dur);
        p.positionY.linearRampToValueAtTime(y2, t + dur);
        p.positionZ.linearRampToValueAtTime(z2, t + dur);
      }
      node.connect(p);
      outNode = p;
    }
    outNode.connect(this.a.buses.voices);
    const send = c.createGain();
    send.gain.value = reverb;
    outNode.connect(send).connect(this.a.reverbIn);
    // Detach after the sound is done.
    setTimeout(() => {
      try {
        input.disconnect();
        outNode.disconnect();
        send.disconnect();
      } catch {
        /* already gone */
      }
    }, (dur + 6) * 1000);
    return input;
  }

  /**
   * Play a voice event. Returns its approximate duration (seconds) for captions.
   */
  async play(kind: VoiceKind, text: string | null, place: VoicePlacement, gain: number, assetKey?: string, opts: PlayOptions = {}): Promise<number> {
    return (await this.playLine(kind, text, place, gain, assetKey, opts)).duration;
  }

  /**
   * Play, and say what was played and when it starts (in the AudioContext's time), so writing
   * can follow the words. The file may differ from the one asked for (a fallback take).
   */
  async playLine(kind: VoiceKind, text: string | null, place: VoicePlacement, gain: number, assetKey?: string, opts: PlayOptions & { priority?: boolean } = {}): Promise<Played> {
    if (this.active >= 4 && !opts.priority) return { duration: 0 }; // never a crowd
    this.active++; // reserve the slot before anything asynchronous
    let out: Played = { duration: 0 };
    try {
      out = await this.play_(kind, text, place, gain, opts.synth ? undefined : assetKey, opts);
    } finally {
      setTimeout(() => this.active--, out.duration * 1000 + 500);
    }
    this.busyUntil = Math.max(this.busyUntil, performance.now() / 1000 + out.duration);
    return out;
  }

  /** When (performance.now() seconds) the room's last voice finishes sounding, wordless ones too. */
  busyUntil = 0;

  private tagged = new Map<string, GainNode[]>();
  /** Where the most recent voice came from (for inspection and tests). */
  lastSource: Source | null = null;

  /**
   * A small household sound somewhere: a door closing in another room, a cup set down,
   * the chair creaking. Recorded if a clip exists (`sfx:<kind>`), otherwise synthesised.
   */
  async sound(kind: 'door' | 'chair-creak' | 'cup' | 'switch' | 'graphite' | 'eraser', place: VoicePlacement, gain: number): Promise<number> {
    if (this.active >= 4) return 0;
    this.active++;
    let dur = 0;
    try {
      const g = gain * (0.55 + 0.45 * this.a.intensity);
      const key = `sfx:${kind}`;
      if (this.hasAsset(key)) {
        const files = this.manifest[key];
        const file = files[this.rng.int(0, files.length - 1)];
        const buf = await this.loadBuffer(file);
        if (buf) return (dur = this.playBuffer(buf, place, g * (this.norm.get(file) ?? 1), 0.45));
      }
      // No recording: a synthetic stand-in where one exists (a pencil has none: silence is better).
      if (kind === 'graphite') return (dur = 0);
      dur = kind === 'door' ? this.synth.door(place, g) : kind === 'cup' ? this.synth.cup(place, g) : kind === 'switch' ? this.synth.click(place, g) : kind === 'eraser' ? this.synth.eraser(place, g) : this.synth.creak(place, g);
      return dur;
    } finally {
      setTimeout(() => this.active--, dur * 1000 + 500);
    }
  }


  /** Cut off every sound carrying this tag, with a short fade (no click). */
  stop(tag: string, fade: number) {
    const t = this.a.ctx.currentTime;
    for (const g of this.tagged.get(tag) ?? []) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    }
    this.tagged.delete(tag);
  }

  stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  private async play_(kind: VoiceKind, text: string | null, place: VoicePlacement, gain: number, assetKey: string | undefined, opts: PlayOptions): Promise<Played> {
    const g = gain * (0.55 + 0.45 * this.a.intensity);
    const src = chooseSource({
      manifest: this.manifest, assetKey, performances: opts.performances, text, kind,
      speechFallback: this.speechFallback, speechAvailable: 'speechSynthesis' in window, synthOnly: opts.synth,
      pick: (n) => this.rng.int(0, n - 1),
    });
    this.lastSource = src;
    if (src.kind === 'recording' || src.kind === 'texture') {
      const file = src.kind === 'recording' ? src.file : this.manifest[src.key][this.rng.int(0, this.manifest[src.key].length - 1)];
      const buf = await this.loadBuffer(file);
      if (buf) {
        // Intelligible recordings sit a little above the room tone so words aren't masked.
        const level = (this.norm.get(file) ?? 1) * (src.kind === 'recording' ? 1.35 : 1);
        // Recorded speech is dry; the room supplies the space. Flat delivery stays closest.
        const startAt = this.a.ctx.currentTime + 0.01;
        const duration = this.playBuffer(buf, place, g * level, kind === 'flat' ? 0.05 : src.kind === 'recording' ? 0.22 : 0.3);
        return { duration, startAt, file: src.kind === 'recording' ? file : undefined };
      }
    }
    if (src.kind === 'speech' && text) return { duration: this.speak(text, kind, g) };
    switch (kind) {
      case 'breath':
        return { duration: this.synth.breath(place, g) };
      case 'laugh':
        return { duration: this.synth.laugh(place, g) };
      case 'murmur':
        return { duration: this.synth.murmur(place, g) };
      case 'hum':
        return { duration: opts.melody?.length ? this.synth.humTune(place, g, opts.melody) : this.synth.hum(place, g) };
      default:
        return { duration: this.synth.say(kind, text, place, g, hashString(text ?? kind)) };
    }
  }

  private playBuffer(buf: AudioBuffer, place: VoicePlacement, gain: number, reverb: number): number {
    const c = this.a.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    const input = this.chain({ ...place, muffled: place.muffled, recording: true }, reverb, buf.duration, gain * 0.9);
    // A few milliseconds of fade at each end: no clicks, whatever the file's edges are like.
    const env = c.createGain();
    const t = c.currentTime + 0.01;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.005);
    env.gain.setValueAtTime(1, Math.max(t + 0.006, t + buf.duration - 0.03));
    env.gain.linearRampToValueAtTime(0, t + buf.duration);
    src.connect(env).connect(input);
    src.start(t);
    return buf.duration;
  }


  private speak(text: string, kind: VoiceKind, gain: number): number {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = kind === 'flat' ? 0.95 : 0.8;
    u.pitch = kind === 'child' ? 1.3 : kind === 'flat' ? 0.8 : 0.95;
    u.volume = Math.min(1, gain * (this.a.isMuted ? 0 : this.a.vol) * 0.8);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    const dur = Math.max(1.5, text.split(/\s+/).length * 0.42);
    return dur;
  }
}
