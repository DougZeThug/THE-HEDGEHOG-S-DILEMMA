/** Continuous environment targets, recomputed every tick from the field. */
export interface Environment {
  lightIntensity: number;
  /** -1 cool … +1 warm */
  lightWarmth: number;
  /** Radians the key light (and so the chair's shadow) has drifted from where it should be. */
  shadowDrift: number;
  /** 1 = room as built; >1 walls further away. */
  roomScale: number;
  /** 0..1, near-black at emotional extremes and at departure. */
  darkness: number;
  /** Clarity of the writing. */
  textContrast: number;
  /** Local warm glow around the chair. */
  chairGlow: number;
  saturation: number;
  // audio
  hum: number;
  vent: number;
  outside: number;
  drone: number;
  droneBrightness: number;
  reverb: number;
}
