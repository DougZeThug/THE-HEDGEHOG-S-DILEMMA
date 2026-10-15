import { Rng } from '../core/rng';

/** Fixed mix level into the limiter: the old volume curve at 0.8, plus the ~6.5 dB the old compressor added as makeup. */
const MIX = 0.64 * 1.1 * 2.1;

/**
 * AudioEngine — the shared signal chain.
 *
 *   sources → [ambience | music | voices] buses → master → limiter → output
 *                         └──── sends ────→ reverb (small/large crossfade) ─┘
 *
 * Everything level-related is ramped (no clicks). A compressor set as a brick-wall-ish
 * limiter sits before the output; a final trim keeps headroom for headphones.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly out: GainNode;
  readonly buses: { ambience: GainNode; music: GainNode; voices: GainNode; memory: GainNode };
  /** Ducking stage for "silence" moments (ambience + music). */
  readonly duck: GainNode;
  readonly reverbIn: GainNode;
  private revSmall: ConvolverNode;
  private revLarge: ConvolverNode;
  private revSmallGain: GainNode;
  private revLargeGain: GainNode;
  readonly analyser: AnalyserNode;
  /** Whole-mix stage for pausing (settings open); independent of silences. */
  readonly pause: GainNode;
  private readonly memoryDuck: GainNode;
  private readonly memoryMusic: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.8;
  private muted = false;
  intensity = 1;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'playback' });
    const c = this.ctx;
    // The listener's volume and mute come after the limiter, so they never change the dynamics.
    this.out = c.createGain();
    this.out.gain.value = 0;
    // A safety limiter, not a compressor: it should almost never act. (The old settings
    // squashed everything above -14 dBFS and added ~6.7 dB of makeup; MIX restores that level
    // as plain gain so the room sounds as loud as before, with its dynamics intact.)
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 2048;
    this.pause = c.createGain();
    this.master.connect(this.pause).connect(this.limiter).connect(this.out).connect(c.destination);
    this.out.connect(this.analyser);

    this.duck = c.createGain();
    // While a living memory plays, the room recedes round it on its own stage (multiplying the
    // room's silences, never replacing them), and the room's own music stops.
    this.memoryDuck = c.createGain();
    this.memoryMusic = c.createGain();
    this.duck.connect(this.memoryDuck).connect(this.master);
    // A playing memory has its own bus: the room's silences fall around it, never on it.
    this.buses = { ambience: c.createGain(), music: c.createGain(), voices: c.createGain(), memory: c.createGain() };
    this.buses.memory.connect(this.master);
    this.buses.ambience.connect(this.duck);
    this.buses.music.connect(this.memoryMusic).connect(this.duck);
    this.buses.voices.connect(this.master);
    this.buses.music.gain.value = 0.8;
    this.buses.voices.gain.value = 0.9;

    this.reverbIn = c.createGain();
    this.revSmall = c.createConvolver();
    this.revLarge = c.createConvolver();
    this.revSmall.buffer = this.impulse(1.3, 2.6, 1);
    this.revLarge.buffer = this.impulse(3.8, 2.2, 2);
    this.revSmallGain = c.createGain();
    this.revLargeGain = c.createGain();
    this.revSmallGain.gain.value = 0.5;
    this.revLargeGain.gain.value = 0.15;
    this.reverbIn.connect(this.revSmall).connect(this.revSmallGain).connect(this.master);
    this.reverbIn.connect(this.revLarge).connect(this.revLargeGain).connect(this.master);
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.applyMaster(3);
  }

  async suspend() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (this.ctx.state === 'running') await this.ctx.suspend();
  }

  get now() {
    return this.ctx.currentTime;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster(0.3);
  }
  setMuted(m: boolean) {
    this.muted = m;
    if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.applyMaster(0.3);
  }
  get isMuted() {
    return this.muted;
  }
  get vol() {
    return this.volume;
  }

  /** Perceptual volume curve (after the limiter), and the fixed mix level before it. */
  private applyMaster(tau: number) {
    this.ramp(this.master.gain, MIX, tau);
    this.ramp(this.out.gain, this.muted ? 0 : Math.pow(this.volume, 2) * 1.1 * 0.9 / (0.64 * 1.1), tau);
  }

  ramp(p: AudioParam, v: number, tau: number, at = this.ctx.currentTime) {
    if (!Number.isFinite(v)) return;
    p.cancelScheduledValues(at);
    p.setTargetAtTime(v, at, Math.max(0.01, tau / 3));
  }

  /** 0 = small, dry room; 1 = large, distant. */
  setReverb(amount: number) {
    const a = Math.max(0, Math.min(1, amount));
    this.ramp(this.revSmallGain.gain, 0.55 * (1 - a) + 0.1, 2);
    this.ramp(this.revLargeGain.gain, 0.5 * a + 0.05, 2);
  }

  private duckDepth = 0;
  private duckUntil = 0;

  /**
   * A deliberate silence: ambience and music fall away, then return. A shallower silence
   * never lifts a deeper one already under way. `fall` is how quickly it falls (seconds).
   */
  silence(depth: number, seconds: number, fall = 1.4, rise = 3.5) {
    const t = this.ctx.currentTime;
    if (t < this.duckUntil && depth < this.duckDepth) return;
    this.duckDepth = depth;
    this.duckUntil = t + seconds;
    const p = this.duck.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(Math.max(0.03, 1 - depth), t, fall);
    p.setTargetAtTime(1, t + seconds, rise);
  }

  /**
   * End any silence at once, however deep (coming back into the room after leaving): the
   * one way past the rule that a shallower silence never lifts a deeper one.
   */
  lift(seconds = 0.1) {
    const t = this.ctx.currentTime;
    this.duckDepth = 0;
    this.duckUntil = 0;
    const p = this.duck.gain;
    p.cancelScheduledValues(t);
    if (seconds >= 0.5) {
      // A slow return, even in loudness all the way (no jump in its first second).
      p.setValueAtTime(Math.max(p.value, 0.03), t);
      p.exponentialRampToValueAtTime(1, t + seconds);
      return;
    }
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(1, t, Math.max(0.01, seconds));
  }

  /** Stereo decaying noise with a few early reflections. */
  impulse(seconds: number, decay: number, seed: number): AudioBuffer {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    const r = new Rng(seed);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = r.next() * 2 - 1;
        lp = lp + (n - lp) * (0.35 + 0.6 * (1 - t)); // darker as it decays
        d[i] = lp * Math.pow(1 - t, decay) * 0.6;
      }
      for (let k = 0; k < 7; k++) {
        const idx = Math.floor(c.sampleRate * r.range(0.007, 0.06));
        if (idx < len) d[idx] += r.range(-0.5, 0.5);
      }
    }
    return buf;
  }

  noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const c = this.ctx;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    const r = new Rng(1234);
    for (let i = 0; i < len; i++) d[i] = r.next() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  noiseSource(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise();
    s.loop = true;
    s.loopStart = Math.random() * 3;
    return s;
  }

  updateListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number) {
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(px, t, 0.03);
      l.positionY.setTargetAtTime(py, t, 0.03);
      l.positionZ.setTargetAtTime(pz, t, 0.03);
      l.forwardX.setTargetAtTime(fx, t, 0.03);
      l.forwardY.setTargetAtTime(fy, t, 0.03);
      l.forwardZ.setTargetAtTime(fz, t, 0.03);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  panner(x: number, y: number, z: number, ref = 1, rolloff = 1.1): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 30;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    return p;
  }

  /**
   * A living memory hushes the room (depth 0…1) and stops its music; `memoryHush(0)` gives the
   * room back. Its own stage: a deeper room silence already under way is kept, not lifted.
   */
  memoryHush(depth: number, seconds = 1.4) {
    const t = this.ctx.currentTime;
    for (const [p, v] of [[this.memoryDuck.gain, 1 - depth], [this.memoryMusic.gain, depth > 0 ? 0 : 1]] as const) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.setTargetAtTime(v, t, Math.max(0.05, seconds / 3));
    }
  }

  /** Peak level (dBFS) at the output, for diagnostics. */
  peakDb(): number {
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    let m = 0;
    for (const v of a) m = Math.max(m, Math.abs(v));
    return m > 0 ? 20 * Math.log10(m) : -Infinity;
  }
}
