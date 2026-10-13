import type { AudioEngine } from './AudioEngine';
import type { VoiceKind } from '../state/cues';
import { Rng, hashString } from '../core/rng';
import { chooseSource, preloadStages, type Source } from './selection';
import dialogue from '../content/dialogue.json';

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

export interface VoicePlacement {
  /** Fixed position, or a path start→end over the duration. */
  from?: [number, number, number];
  to?: [number, number, number];
  /** Behind a wall: muffled. */
  muffled?: boolean;
  /** No position at all: inside the head, drifting. */
  nowhere?: boolean;
  /** A recorded performance (gentler muffling, narrower drift). */
  recording?: boolean;
  /** Handle for cutting the sound off later. */
  tag?: string;
}

export interface PlayOptions {
  /** Recorded performance files for this phrase, best first for this moment. */
  performances?: string[];
  /** Semitones above the base for a hummed tune; -100 is a rest. */
  melody?: number[];
  /** Never substitute a recording. */
  synth?: boolean;
}

/** Seconds per note of a given hummed melody (kept in step with the composer). */
const HUM_NOTE = 0.62;

type Formants = [number, number, number];
const VOWELS: Record<string, Formants> = {
  a: [780, 1250, 2550],
  e: [520, 1850, 2500],
  i: [320, 2250, 2950],
  o: [520, 900, 2450],
  u: [340, 850, 2300],
  '@': [560, 1450, 2500],
};

interface Syllable {
  vowel: string;
  onset: 'fric' | 'plos' | 'none';
  stress: boolean;
  pauseAfter: number;
}

function measure(buf: AudioBuffer) {
  let sum = 0, peak = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * d[i];
      peak = Math.max(peak, Math.abs(d[i]));
      n++;
    }
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)) || 1e-6, peak: peak || 1e-6 };
}

/**
 * Gain to bring a recording toward -24 dBFS RMS without pushing its peak past -3 dBFS.
 * Performances are only half-corrected: a take whispered "very quietly" should stay quieter
 * than one where the voice rises, and their authored `levelDb` is applied on top.
 */
function normaliseGain(buf: AudioBuffer, partial = false): number {
  const { rms, peak } = measure(buf);
  const target = Math.pow(10, -24 / 20);
  const ceiling = Math.pow(10, -3 / 20);
  const full = target / rms;
  return Math.min(partial ? Math.sqrt(full) : full, ceiling / peak, 16);
}

/** Authored relative level of each performance file, in dB. */
const LEVEL_DB = new Map<string, number>((dialogue.performances as { file: string; levelDb?: number }[]).map((p) => [p.file, p.levelDb ?? 0]));

export function syllabify(text: string): Syllable[] {
  const out: Syllable[] = [];
  const words = text.toLowerCase().replace(/[^a-z.,?!' ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const raw of words) {
    const punct = /[.?!]$/.test(raw) ? 0.42 : /,$/.test(raw) ? 0.22 : 0.05;
    const w = raw.replace(/[^a-z']/g, '');
    const groups = w.match(/[aeiouy]+/g) ?? ['@'];
    // silent final e
    if (groups.length > 1 && w.endsWith('e') && !w.endsWith('ee')) groups.pop();
    const onsets = w.split(/[aeiouy]+/);
    groups.forEach((g, i) => {
      const c = onsets[i] ?? '';
      const onset: Syllable['onset'] = /^(s|sh|f|th|h|z|ch|v)/.test(c) ? 'fric' : /^[pbtdkgc]/.test(c) ? 'plos' : 'none';
      const v = g.includes('ee') || g === 'y' || g[0] === 'i' ? 'i' : g[0] === 'a' ? 'a' : g[0] === 'e' ? 'e' : g[0] === 'o' ? (g.includes('u') ? 'u' : 'o') : g[0] === 'u' ? 'u' : '@';
      out.push({ vowel: v, onset, stress: i === 0, pauseAfter: i === groups.length - 1 ? punct : 0 });
    });
  }
  return out.length ? out : [{ vowel: '@', onset: 'none', stress: true, pauseAfter: 0.2 }];
}

interface StyleDef {
  syll: number;
  formantShift: number;
  voiced: boolean;
  f0?: number;
  reverb: number;
  lowpass: number;
  gain: number;
  stressAmt: number;
  attack: number;
}

/** Run when the browser has a moment (or soon, where there is no idle callback). */
const idle = (f: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(() => f(), { timeout: 4000 }) : setTimeout(f, 500));

const STYLES: Record<string, StyleDef> = {
  whisper: { syll: 0.2, formantShift: 1, voiced: false, reverb: 0.35, lowpass: 5200, gain: 1, stressAmt: 0.35, attack: 0.03 },
  tender: { syll: 0.25, formantShift: 0.92, voiced: false, reverb: 0.22, lowpass: 3200, gain: 1.05, stressAmt: 0.45, attack: 0.05 },
  flat: { syll: 0.17, formantShift: 0.96, voiced: false, reverb: 0.04, lowpass: 7000, gain: 0.95, stressAmt: 0, attack: 0.008 },
  child: { syll: 0.17, formantShift: 1.2, voiced: false, reverb: 0.3, lowpass: 6000, gain: 0.9, stressAmt: 0.4, attack: 0.025 },
  distant: { syll: 0.19, formantShift: 1, voiced: true, f0: 165, reverb: 0.6, lowpass: 900, gain: 0.9, stressAmt: 0.5, attack: 0.03 },
};

export class Voices {
  private manifest: Record<string, string[]> = {};
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private rng = new Rng(31);
  speechFallback = false;
  private active = 0;

  constructor(private a: AudioEngine, private base = './voices/') {}

  async loadManifest() {
    try {
      const r = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
      if (r.ok) this.manifest = await r.json();
    } catch {
      this.manifest = {};
    }
  }

  get assetCount() {
    return Object.values(this.manifest).reduce((n, v) => n + v.length, 0);
  }

  hasAsset(key: string) {
    return !!this.manifest[key]?.length;
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
  preload() {
    const { first, rest } = preloadStages(this.manifest);
    const later = () => {
      const next = rest.splice(0, 3);
      if (!next.length) return;
      void Promise.all(next.map((f) => this.loadBuffer(f))).then(() => idle(later));
    };
    void Promise.all(first.map((f) => this.loadBuffer(f))).then(() => idle(later));
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
      const p = this.a.panner(x, y, z, 0.8, 1.15);
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
    if (this.active >= 4) return 0; // never a crowd
    this.active++; // reserve the slot before anything asynchronous
    let dur = 0;
    try {
      dur = await this.play_(kind, text, place, gain, opts.synth ? undefined : assetKey, opts);
    } finally {
      setTimeout(() => this.active--, dur * 1000 + 500);
    }
    return dur;
  }

  private tagged = new Map<string, GainNode[]>();
  /** Where the most recent voice came from (for inspection and tests). */
  lastSource: Source | null = null;

  /**
   * A small household sound somewhere: a door closing in another room, a cup set down,
   * the chair creaking. Recorded if a clip exists (`sfx:<kind>`), otherwise synthesised.
   */
  async sound(kind: 'door' | 'chair-creak' | 'cup', place: VoicePlacement, gain: number): Promise<number> {
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
      dur = kind === 'door' ? this.synthDoor(place, g) : kind === 'cup' ? this.synthCup(place, g) : this.synthCreak(place, g);
      return dur;
    } finally {
      setTimeout(() => this.active--, dur * 1000 + 500);
    }
  }

  /** A door closing: a soft low thud, then the latch. */
  private synthDoor(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const t = c.currentTime + 0.05;
    const out = c.createGain();
    const thud = c.createOscillator();
    thud.frequency.setValueAtTime(78, t);
    thud.frequency.exponentialRampToValueAtTime(48, t + 0.3);
    const tg = c.createGain();
    tg.gain.setValueAtTime(0, t);
    tg.gain.linearRampToValueAtTime(0.9, t + 0.006);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    thud.connect(tg).connect(out);
    thud.start(t);
    thud.stop(t + 0.5);
    const n = this.a.noiseSource();
    const nl = c.createBiquadFilter();
    nl.type = 'lowpass';
    nl.frequency.value = 260;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.7, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(nl).connect(ng).connect(out);
    const latch = t + 0.11;
    const lh = c.createBiquadFilter();
    lh.type = 'bandpass';
    lh.frequency.value = 2600;
    lh.Q.value = 4;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, latch);
    lg.gain.linearRampToValueAtTime(0.35, latch + 0.002);
    lg.gain.exponentialRampToValueAtTime(0.0001, latch + 0.03);
    n.connect(lh).connect(lg).connect(out);
    n.start(t);
    n.stop(t + 0.6);
    const tail = this.chain({ ...place, muffled: place.muffled ?? true }, 0.55, 1.6, gain * 0.9);
    out.connect(tail);
    return 1.6;
  }

  /** A cup set down: a short ceramic ring. */
  private synthCup(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const t = c.currentTime + 0.05;
    const out = c.createGain();
    for (const [f, a, d] of [[2380, 0.4, 0.35], [3710, 0.25, 0.22], [5620, 0.12, 0.12], [920, 0.18, 0.08]] as const) {
      const o = c.createOscillator();
      o.frequency.value = f * this.rng.range(0.98, 1.02);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    const tail = this.chain(place, 0.4, 1.2, gain * 0.35);
    out.connect(tail);
    return 1.2;
  }

  /** Old wood taking weight: a slow, rough creak. */
  private synthCreak(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const t = c.currentTime + 0.05;
    const n = this.a.noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 14;
    bp.frequency.setValueAtTime(310, t);
    bp.frequency.linearRampToValueAtTime(540, t + 0.7);
    const g = c.createGain();
    g.gain.value = 0;
    const flutter = c.createOscillator();
    flutter.frequency.value = 23;
    const fg = c.createGain();
    fg.gain.value = 0.5;
    flutter.connect(fg).connect(g.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.12);
    env.gain.linearRampToValueAtTime(0.6, t + 0.55);
    env.gain.linearRampToValueAtTime(0, t + 0.8);
    n.connect(bp).connect(g).connect(env);
    const tail = this.chain(place, 0.2, 1.2, gain * 1.6);
    env.connect(tail);
    n.start(t);
    n.stop(t + 0.9);
    flutter.start(t);
    flutter.stop(t + 0.9);
    return 1.2;
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

  private async play_(kind: VoiceKind, text: string | null, place: VoicePlacement, gain: number, assetKey: string | undefined, opts: PlayOptions): Promise<number> {
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
        return this.playBuffer(buf, place, g * level, kind === 'flat' ? 0.05 : src.kind === 'recording' ? 0.22 : 0.3);
      }
    }
    if (src.kind === 'speech' && text) return this.speak(text, kind, g);
    switch (kind) {
      case 'breath':
        return this.breath(place, g);
      case 'laugh':
        return this.laugh(place, g);
      case 'murmur':
        return this.murmur(place, g);
      case 'hum':
        return opts.melody?.length ? this.humTune(place, g, opts.melody) : this.hum(place, g);
      default:
        return this.utter(text ?? '...', STYLES[kind] ?? STYLES.whisper, place, g, hashString(text ?? kind));
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

  /** Formant bank shared by whisper and voiced styles. */
  private formantBank(source: AudioNode, shift: number, q: number, out: AudioNode): BiquadFilterNode[] {
    const c = this.a.ctx;
    const gains = [1, 0.7, 0.35];
    return VOWELS['@'].map((f, i) => {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * shift;
      bp.Q.value = q * (i === 0 ? 0.8 : 1);
      const g = c.createGain();
      g.gain.value = gains[i] * (1 + i * 0.6);
      source.connect(bp).connect(g).connect(out);
      return bp;
    });
  }

  private utter(text: string, st: StyleDef, place: VoicePlacement, gain: number, seed: number): number {
    const c = this.a.ctx;
    const r = new Rng(seed);
    const syl = syllabify(text);
    let dur = 0.2;
    for (const s of syl) dur += st.syll * (s.stress ? 1.15 : 0.9) + s.pauseAfter;
    const t0 = c.currentTime + 0.05;
    const env = c.createGain();
    env.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = st.lowpass;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = st.voiced ? 90 : 350;
    const sum = c.createGain();
    sum.gain.value = st.voiced ? 0.5 : 2.2;
    const tail = this.chain(place, st.reverb, dur + 1, gain * st.gain * 0.5);
    sum.connect(env).connect(hp).connect(lp).connect(tail);

    const noise = this.a.noiseSource();
    let osc: OscillatorNode | null = null;
    let src: AudioNode = noise;
    if (st.voiced) {
      osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = (st.f0 ?? 160) * r.range(0.85, 1.2);
      const mix = c.createGain();
      const ng = c.createGain();
      ng.gain.value = 0.12;
      osc.connect(mix);
      noise.connect(ng).connect(mix);
      src = mix;
    }
    const bank = this.formantBank(src, st.formantShift, st.voiced ? 6 : 9, sum);

    // Consonant layer.
    const fric = c.createBiquadFilter();
    fric.type = 'highpass';
    fric.frequency.value = 3800;
    const fricG = c.createGain();
    fricG.gain.value = 0;
    noise.connect(fric).connect(fricG).connect(env);

    let t = t0;
    for (const s of syl) {
      const d = st.syll * (s.stress ? 1.15 : 0.9) * r.range(0.9, 1.1);
      const fm = VOWELS[s.vowel] ?? VOWELS['@'];
      bank.forEach((bp, i) => bp.frequency.setTargetAtTime(fm[i] * st.formantShift * r.range(0.95, 1.05), t, 0.025));
      const lvl = 1 - st.stressAmt + (s.stress ? st.stressAmt : 0) * r.range(0.8, 1);
      if (s.onset === 'fric') {
        fricG.gain.setValueAtTime(0, t);
        fricG.gain.linearRampToValueAtTime(0.25 * lvl, t + 0.02);
        fricG.gain.linearRampToValueAtTime(0, t + 0.07);
      } else if (s.onset === 'plos') {
        fricG.gain.setValueAtTime(0.35 * lvl, t);
        fricG.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      }
      const on = t + (s.onset === 'none' ? 0 : 0.03);
      env.gain.setValueAtTime(env.gain.value > 0 ? 0.05 : 0, on);
      env.gain.linearRampToValueAtTime(lvl, on + st.attack);
      env.gain.setTargetAtTime(lvl * 0.75, on + st.attack, d * 0.4);
      env.gain.setTargetAtTime(0, on + d * 0.8, 0.025);
      if (osc) osc.frequency.setTargetAtTime((st.f0 ?? 160) * (s.stress ? 1.08 : 0.96) * (1 - (t - t0) / (dur * 6)), t, 0.04);
      t += d + s.pauseAfter;
    }
    noise.start(t0);
    noise.stop(t + 0.5);
    if (osc) {
      osc.start(t0);
      osc.stop(t + 0.5);
    }
    return dur;
  }

  private breath(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const t0 = c.currentTime + 0.05;
    const n = this.a.noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.value = 0;
    const cycles = 2;
    const dur = cycles * 3.4;
    const tail = this.chain(place, 0.15, dur, gain * 0.55);
    n.connect(bp).connect(g).connect(tail);
    for (let i = 0; i < cycles; i++) {
      const t = t0 + i * 3.4;
      // inhale
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.linearRampToValueAtTime(1600, t + 1.1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.9);
      g.gain.linearRampToValueAtTime(0, t + 1.2);
      // exhale
      bp.frequency.setValueAtTime(1300, t + 1.5);
      bp.frequency.linearRampToValueAtTime(700, t + 3.1);
      g.gain.setValueAtTime(0, t + 1.4);
      g.gain.linearRampToValueAtTime(0.5, t + 1.7);
      g.gain.linearRampToValueAtTime(0, t + 3.1);
    }
    n.start(t0);
    n.stop(t0 + dur + 0.2);
    return dur;
  }

  private voicedPulse(f0: number, out: AudioNode, vowel: Formants, t: number, d: number, lvl: number) {
    const c = this.a.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.06, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.92, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.012);
    g.gain.setTargetAtTime(0, t + d * 0.6, d * 0.2);
    const sum = c.createGain();
    sum.gain.value = 0.6;
    vowel.forEach((f, i) => {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 5;
      const fg = c.createGain();
      fg.gain.value = [1, 0.6, 0.3][i];
      o.connect(bp).connect(fg).connect(sum);
    });
    // breathy aspiration on the onset
    const n = this.a.noiseSource();
    const hg = c.createGain();
    hg.gain.setValueAtTime(0.08 * lvl, t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(hg).connect(g);
    sum.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.2);
    n.start(t);
    n.stop(t + 0.08);
  }

  private laugh(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const t0 = c.currentTime + 0.05;
    const r = this.rng;
    let end = t0;
    const out = c.createGain();
    out.gain.value = 1;
    const voices = r.chance(0.6) ? 2 : 1;
    let dur = 0;
    for (let v = 0; v < voices; v++) {
      const f0 = v === 0 ? r.range(210, 270) : r.range(140, 180);
      let t = t0 + v * r.range(0.25, 0.7);
      const pulses = r.int(5, 9);
      for (let i = 0; i < pulses; i++) {
        const d = r.range(0.08, 0.12);
        this.voicedPulse(f0 * (1 - i * 0.025), out, VOWELS.a, t, d, (1 - i / (pulses + 2)) * 0.5);
        t += d + r.range(0.06, 0.1);
      }
      end = Math.max(end, t);
    }
    dur = end - t0 + 0.5;
    const tail = this.chain({ ...place, muffled: place.muffled ?? true }, 0.45, dur, gain * 0.6);
    out.connect(tail);
    return dur;
  }

  private murmur(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const r = this.rng;
    const turns = r.int(3, 5);
    const out = c.createGain();
    let t = c.currentTime + 0.1;
    const t0 = t;
    for (let i = 0; i < turns; i++) {
      const f0 = i % 2 ? r.range(185, 215) : r.range(110, 135);
      const n = r.int(5, 11);
      for (let k = 0; k < n; k++) {
        const d = r.range(0.11, 0.2);
        const v = r.pick(Object.values(VOWELS));
        this.voicedPulse(f0 * (1 + 0.1 * Math.sin(k * 0.9)) * (1 - k / (n * 8)), out, v, t, d, k === 0 ? 0.45 : 0.32);
        t += d + r.range(0.01, 0.06);
      }
      t += r.range(0.3, 0.8);
    }
    const dur = t - t0;
    const tail = this.chain({ ...place, muffled: true }, 0.4, dur, gain * 0.55);
    out.connect(tail);
    return dur;
  }

  private hum(place: VoicePlacement, gain: number): number {
    const c = this.a.ctx;
    const r = this.rng;
    const scale = [0, 2, 4, 7, 9, 12];
    const base = r.range(190, 230);
    const o = c.createOscillator();
    o.type = 'triangle';
    const g = c.createGain();
    g.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const nasal = c.createBiquadFilter();
    nasal.type = 'peaking';
    nasal.frequency.value = 270;
    nasal.gain.value = 8;
    let t = c.currentTime + 0.1;
    const t0 = t;
    let idx = 2;
    const notes = r.int(6, 10);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.3);
    for (let i = 0; i < notes; i++) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + r.pick([-1, 1, -2, 1, 0])));
      o.frequency.setTargetAtTime(base * Math.pow(2, scale[idx] / 12), t, 0.06);
      const d = r.range(0.35, 0.8) * (i === notes - 1 ? 1.8 : 1);
      g.gain.setTargetAtTime(r.range(0.25, 0.4), t, 0.05);
      t += d;
      if (r.chance(0.2)) {
        g.gain.setTargetAtTime(0.02, t - 0.05, 0.04);
        t += 0.2;
      }
    }
    g.gain.setTargetAtTime(0, t, 0.2);
    const dur = t - t0 + 0.8;
    const tail = this.chain({ ...place, muffled: place.muffled ?? true }, 0.4, dur, gain * 0.5);
    o.connect(nasal).connect(lp).connect(g).connect(tail);
    o.start(t0);
    o.stop(t + 1);
    return dur;
  }

  /** Hum a given tune, one note per HUM_NOTE seconds, legato, with breaths at the rests. */
  private humTune(place: VoicePlacement, gain: number, melody: number[]): number {
    const c = this.a.ctx;
    const base = 205;
    const o = c.createOscillator();
    o.type = 'triangle';
    const g = c.createGain();
    g.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const nasal = c.createBiquadFilter();
    nasal.type = 'peaking';
    nasal.frequency.value = 270;
    nasal.gain.value = 8;
    const t0 = c.currentTime + 0.1;
    let t = t0;
    for (const n of melody) {
      if (n <= -50) {
        g.gain.setTargetAtTime(0.0, t, 0.05);
      } else {
        o.frequency.setTargetAtTime(base * Math.pow(2, n / 12), t, 0.05);
        g.gain.setTargetAtTime(0.32 + this.rng.range(-0.05, 0.05), t, 0.06);
      }
      t += HUM_NOTE;
    }
    g.gain.setTargetAtTime(0, t, 0.25);
    const dur = t - t0 + 0.6;
    const tail = this.chain({ ...place, muffled: place.muffled ?? true }, 0.4, dur, gain * 0.5);
    o.connect(nasal).connect(lp).connect(g).connect(tail);
    o.start(t0);
    o.stop(t + 1);
    return dur;
  }
}
