import type { AudioEngine } from './AudioEngine';
import { Rng } from '../core/rng';

/**
 * Sparse, piano-like music that arrives without being announced and sometimes leaves
 * before it resolves. Notes are additive tones with slightly inharmonic partials, a
 * felt-hammer thump and a closing filter. Each mood has a pool of notes that avoids
 * the comfort of a tonic; motifs are remembered and returned to, altered.
 */
type Mood = 'warm' | 'tender' | 'uneasy' | 'sparse' | 'memory';

interface MoodDef {
  pool: number[];
  gap: [number, number];
  vel: [number, number];
  dyad: number;
  /** Notes never to end on (would sound resolved). */
  avoidEnd: number[];
}

const MOODS: Record<Mood, MoodDef> = {
  sparse: { pool: [62, 64, 66, 69, 71, 73, 76], gap: [2.2, 4.5], vel: [0.25, 0.4], dyad: 0.1, avoidEnd: [62, 74] },
  warm: { pool: [50, 57, 62, 64, 66, 69, 73, 76], gap: [0.9, 1.7], vel: [0.3, 0.5], dyad: 0.3, avoidEnd: [50, 62] },
  tender: { pool: [59, 62, 64, 66, 69, 71, 74], gap: [1.2, 2.1], vel: [0.25, 0.42], dyad: 0.2, avoidEnd: [59, 71] },
  memory: { pool: [74, 76, 78, 81, 83, 86], gap: [0.45, 0.75], vel: [0.18, 0.3], dyad: 0, avoidEnd: [74, 86] },
  uneasy: { pool: [49, 50, 56, 57, 61, 62, 68], gap: [1.6, 3.2], vel: [0.22, 0.38], dyad: 0.35, avoidEnd: [] },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private out: GainNode;
  private send: GainNode;
  private rng = new Rng(2024);
  private motifs = new Map<Mood, number[]>();
  private playingUntil = 0;
  onNote?: (midi: number) => void;

  constructor(private a: AudioEngine) {
    const c = a.ctx;
    this.out = c.createGain();
    this.out.gain.value = 0.32;
    this.out.connect(a.buses.music);
    this.send = c.createGain();
    this.send.gain.value = 0.55;
    this.out.connect(this.send).connect(a.reverbIn);
  }

  get busy() {
    return this.a.ctx.currentTime < this.playingUntil;
  }

  /** Compose and schedule a phrase. Returns its duration in seconds. */
  play(mood: Mood, notes: number, truncate: boolean): number {
    if (this.busy) return 0;
    const d = MOODS[mood];
    const prev = this.motifs.get(mood);
    let seq: number[];
    if (prev && this.rng.chance(0.55)) {
      // Return to the motif, but not quite the same.
      seq = prev.slice();
      const i = this.rng.int(0, seq.length - 1);
      seq[i] = this.rng.pick(d.pool);
      if (this.rng.chance(0.3)) seq.reverse();
    } else {
      seq = [];
      let idx = this.rng.int(0, d.pool.length - 1);
      for (let i = 0; i < notes; i++) {
        idx = Math.max(0, Math.min(d.pool.length - 1, idx + this.rng.pick([-2, -1, -1, 1, 1, 2, 0, 3])));
        seq.push(d.pool[idx]);
      }
    }
    if (d.avoidEnd.includes(seq[seq.length - 1])) seq[seq.length - 1] = this.rng.pick(d.pool.filter((n) => !d.avoidEnd.includes(n)));
    this.motifs.set(mood, seq);
    // Leaving before it resolves: drop the tail.
    const count = truncate ? Math.max(2, Math.ceil(seq.length * this.rng.range(0.4, 0.7))) : seq.length;

    const c = this.a.ctx;
    let t = c.currentTime + 0.3;
    const k = 0.7 + 0.3 * this.a.intensity;
    for (let i = 0; i < count; i++) {
      const vel = this.rng.range(d.vel[0], d.vel[1]) * k * (i === count - 1 && truncate ? 0.6 : 1);
      this.note(seq[i], t, vel);
      if (this.rng.chance(d.dyad)) this.note(seq[i] + this.rng.pick([-5, -7, 3, 4, -10]), t + this.rng.range(0, 0.04), vel * 0.6);
      t += this.rng.range(d.gap[0], d.gap[1]) * (mood === 'memory' && i % 4 === 3 ? 2 : 1);
    }
    const dur = t - c.currentTime + 3;
    this.playingUntil = c.currentTime + dur;
    return dur;
  }

  /**
   * Play a given tune as written, slowly. With `stopAt`, it stops after that many notes —
   * the last one quieter, the rest of the tune never arriving.
   */
  playMelody(notes: number[], stopAt?: number): number {
    if (this.busy) return 0;
    const c = this.a.ctx;
    const count = stopAt ? Math.min(notes.length, Math.max(1, stopAt)) : notes.length;
    let t = c.currentTime + 0.3;
    const k = 0.7 + 0.3 * this.a.intensity;
    for (let i = 0; i < count; i++) {
      const last = i === count - 1;
      this.note(notes[i], t, (last && stopAt ? 0.18 : this.rng.range(0.26, 0.36)) * k);
      t += this.rng.range(0.85, 1.15);
    }
    const dur = t - c.currentTime + 3;
    this.playingUntil = c.currentTime + dur;
    return dur;
  }

  private note(midi: number, t: number, vel: number) {
    const c = this.a.ctx;
    const f = mtof(midi);
    const decay = Math.max(1.2, 4.2 - (midi - 48) * 0.06);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.setTargetAtTime(vel * 0.35, t + 0.006, 0.18);
    g.gain.setTargetAtTime(0, t + 0.25, decay / 3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 14), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.2), t + 1.4);
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-0.6, Math.min(0.6, (midi - 64) / 30));
    g.connect(lp).connect(pan).connect(this.out);

    const partials: [number, number][] = [[1, 1], [2.001, 0.42], [3.004, 0.18], [4.01, 0.09], [5.03, 0.04], [6.07, 0.02]];
    const end = t + decay * 2.2;
    for (const [m, amp] of partials) {
      const o = c.createOscillator();
      o.frequency.value = f * m;
      o.detune.value = this.rng.range(-3, 3);
      const pg = c.createGain();
      pg.gain.value = amp;
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(end);
    }
    // felt hammer
    const n = c.createBufferSource();
    n.buffer = this.a.noise();
    const ng = c.createGain();
    ng.gain.setValueAtTime(vel * 0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    const nf = c.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(4000, f * 3);
    n.connect(nf).connect(ng).connect(g);
    n.start(t, this.rng.range(0, 3));
    n.stop(t + 0.05);
    if (this.onNote) setTimeout(() => this.onNote?.(midi), Math.max(0, (t - c.currentTime) * 1000));
  }
}
