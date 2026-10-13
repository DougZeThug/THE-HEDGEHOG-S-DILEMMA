import type { AudioEngine } from './AudioEngine';
import type { Environment } from '../state/Director';
import { Rng } from '../core/rng';
import { ROOM } from '../world/layout';

/**
 * Room tone, built from parts:
 *  - the light fitting's mains hum (positional, at the ceiling panel)
 *  - ventilation (filtered noise from a high corner)
 *  - the world outside (low rumble, occasional passing swell)
 *  - a slow drone whose chord changes without resolving
 * Each layer has a floor, so the room never goes digitally dead unless asked to.
 */
const DRONE_CHORDS = [
  [38, 45, 52, 57], // D A E A — open, unresolved
  [36, 43, 50, 55], // C G D G
  [41, 48, 52, 57], // F C E A — warm, suspended
  [34, 41, 48, 53], // Bb F C F
  [40, 47, 50, 54], // E B D F# — unsettled
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Ambience {
  private hum: GainNode;
  private vent: GainNode;
  private ventFilter: BiquadFilterNode;
  private outside: GainNode;
  private outsideFilter: BiquadFilterNode;
  private swell: GainNode;
  private drone: GainNode;
  private droneFilter: BiquadFilterNode;
  private droneOsc: OscillatorNode[] = [];
  private rng = new Rng(77);
  private nextSwell = 25;
  private nextChord = 50;
  private chordIx = 0;
  private started = false;
  /** Opening fade multiplier (0 → 1). */
  fade = 0;
  /**
   * The opening score's hold on each layer: the fixture's hum rises with its light, the air
   * comes up with the walls, the outside is faint, and the drone (score, not room) waits.
   */
  readonly score = { hum: 1, vent: 1, outside: 1, drone: 1 };

  constructor(private a: AudioEngine) {
    const c = a.ctx;
    const bus = a.buses.ambience;

    // Hum: 60 Hz family through a gentle low-pass, from the panel.
    this.hum = c.createGain();
    this.hum.gain.value = 0;
    const humLp = c.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 520;
    const humPan = a.panner(0, ROOM.height - 0.05, -0.2, 1.2, 0.8);
    this.hum.connect(humLp).connect(humPan).connect(bus);
    const humDepth = c.createGain();
    humDepth.gain.value = 1;
    humDepth.connect(this.hum);
    const amps = [0.5, 0.32, 0.12, 0.08, 0.035];
    amps.forEach((amp, i) => {
      const o = c.createOscillator();
      o.frequency.value = 60 * (i + 1) * (1 + (i % 2 ? 0.0015 : 0));
      const g = c.createGain();
      g.gain.value = amp;
      o.connect(g).connect(humDepth);
      o.start();
    });
    // flutter
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.15;
    lfo.connect(lfoG).connect(humDepth.gain);
    lfo.start();

    // Ventilation: band-limited noise from a high corner.
    this.vent = c.createGain();
    this.vent.gain.value = 0;
    this.ventFilter = c.createBiquadFilter();
    this.ventFilter.type = 'bandpass';
    this.ventFilter.frequency.value = 520;
    this.ventFilter.Q.value = 0.55;
    const ventLp = c.createBiquadFilter();
    ventLp.type = 'lowpass';
    ventLp.frequency.value = 2200;
    const ventPan = a.panner(-ROOM.halfW + 0.3, ROOM.height - 0.2, -ROOM.halfD + 0.3, 1.5, 0.6);
    const vn = a.noiseSource();
    vn.connect(this.ventFilter).connect(ventLp).connect(this.vent).connect(ventPan).connect(bus);
    vn.start();

    // Outside: brown-ish rumble, non-positional, low.
    this.outside = c.createGain();
    this.outside.gain.value = 0;
    this.outsideFilter = c.createBiquadFilter();
    this.outsideFilter.type = 'lowpass';
    this.outsideFilter.frequency.value = 160;
    this.outsideFilter.Q.value = 0.3;
    const on = a.noiseSource();
    const lp2 = c.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 400;
    this.swell = c.createGain();
    this.swell.gain.value = 1;
    on.connect(lp2).connect(this.outsideFilter).connect(this.swell).connect(this.outside).connect(bus);
    on.start();

    // Drone
    this.drone = c.createGain();
    this.drone.gain.value = 0;
    this.droneFilter = c.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 420;
    this.droneFilter.Q.value = 0.7;
    const droneSend = c.createGain();
    droneSend.gain.value = 0.4;
    this.drone.connect(this.droneFilter);
    this.droneFilter.connect(bus);
    this.droneFilter.connect(droneSend).connect(a.reverbIn);
    for (let i = 0; i < 4; i++) {
      for (const det of [-5, 5]) {
        const o = c.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = mtof(DRONE_CHORDS[0][i]);
        o.detune.value = det + this.rng.range(-2, 2);
        const g = c.createGain();
        g.gain.value = i === 0 ? 0.35 : 0.18;
        o.connect(g).connect(this.drone);
        o.start();
        this.droneOsc.push(o);
      }
    }
    const dl = c.createOscillator();
    dl.frequency.value = 0.045;
    const dlg = c.createGain();
    dlg.gain.value = 140;
    dl.connect(dlg).connect(this.droneFilter.frequency);
    dl.start();
  }

  start() {
    this.started = true;
  }

  update(_dt: number, env: Environment, t: number) {
    if (!this.started) return;
    const a = this.a;
    const f = this.fade;
    const k = 0.6 + 0.4 * a.intensity;
    const sc = this.score;
    a.ramp(this.hum.gain, (0.012 + 0.03 * env.hum) * f * sc.hum, 0.4);
    a.ramp(this.vent.gain, (0.006 + 0.055 * env.vent) * f * sc.vent, 1);
    a.ramp(this.outside.gain, (0.02 + 0.14 * env.outside) * f * sc.outside, 3);
    a.ramp(this.drone.gain, 0.05 * env.drone * f * k * sc.drone, 4);
    a.ramp(this.droneFilter.frequency, 220 + 900 * env.droneBrightness, 4);
    a.setReverb(env.reverb);

    // Something passes outside.
    if (t > this.nextSwell) {
      this.nextSwell = t + this.rng.range(28, 75);
      const now = a.ctx.currentTime;
      const g = this.swell.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(1, now);
      g.linearRampToValueAtTime(1.9 + this.rng.range(0, 0.8), now + 3.5);
      g.linearRampToValueAtTime(1, now + 8);
      const fr = this.outsideFilter.frequency;
      fr.cancelScheduledValues(now);
      fr.setValueAtTime(140, now);
      fr.linearRampToValueAtTime(260, now + 3.5);
      fr.linearRampToValueAtTime(150, now + 8);
    }

    // The drone moves to another chord, slowly; it never lands on a cadence.
    if (t > this.nextChord) {
      this.nextChord = t + this.rng.range(35, 70);
      let next = this.rng.int(0, DRONE_CHORDS.length - 1);
      if (next === this.chordIx) next = (next + 1) % DRONE_CHORDS.length;
      this.chordIx = next;
      const now = a.ctx.currentTime;
      this.droneOsc.forEach((o, i) => {
        const note = DRONE_CHORDS[next][Math.floor(i / 2)];
        o.frequency.cancelScheduledValues(now);
        o.frequency.setValueAtTime(o.frequency.value, now);
        o.frequency.exponentialRampToValueAtTime(mtof(note), now + 9 + i * 0.7);
      });
    }
  }
}
