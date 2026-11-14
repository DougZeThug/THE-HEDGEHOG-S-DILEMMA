/**
 * The ids the Director names directly (phrases, living memories, drawings, voice fragments,
 * situations). One typed place for them; tests/content.test.ts asserts every one exists, so a
 * rename in the content fails there rather than silently turning a rule into a no-op.
 */

export const PHRASE_IDS = {
  stay: 'stay',
  kitchenLight: 'kitchen-light',
  /** The way out: touching it starts the room letting the visitor go. */
  partyEarly: 'party-early',
  thankStaying: 'thank-staying',
  movingChair: 'moving-chair',
  gladCame: 'glad-came',
  rememberMe: 'remember-me',
  dontHaveSay: 'dont-have-say',
  ifCloser: 'if-closer',
  smallMinute: 'small-minute',
  afraidLeave: 'afraid-leave',
  farEnough: 'far-enough',
  happiestUnneeded: 'happiest-unneeded',
} as const;

/** Living memories (src/content/memories.ts, vignettes.ts). */
export const MEMORY_IDS = {
  cereal: 'cereal',
  biscuit: 'biscuit',
  almost: 'almost',
} as const;

export const DRAWING_IDS = {
  ghostDoor: 'ghost-door',
} as const;

/** Voice fragments (src/content/relations.ts VOICE_FRAGMENTS). */
export const FRAGMENT_IDS = {
  laughNextRoom: 'vf-laugh-next-room',
  twoVoices: 'vf-two-voices',
  breath: 'vf-breath',
  hum: 'vf-hum',
} as const;

/** Writing the room starts with, ordinary things first; the rest comes by selection. */
// ("the light in the kitchen at four in the afternoon" is kept back: it is the memory, late.)
export const FIRST_WRITTEN: readonly string[] = ['cereal', 'sandwich', 'good-day', 'summer', 'laugh-breathe', 'home', 'rain-carpark'];

export const SITUATION_IDS = {
  erosion: 'erosion',
} as const;
