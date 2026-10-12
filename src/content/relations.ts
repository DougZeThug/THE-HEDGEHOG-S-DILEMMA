import type { Dimension, DimVector, Hand } from './types';

/**
 * Authored re-contextualisations. Late in a visit, a phrase the visitor has already read
 * can be written again somewhere else, in another hand, beside a phrase that changes it.
 */
export interface Recontext {
  id: string;
  /** Phrase written again. */
  phrase: string;
  /** Phrase it is written beside. */
  beside: string;
  hand: Hand;
}

export const RECONTEXTS: Recontext[] = [
  { id: 'rc-alone-good-day', phrase: 'alone-ok', beside: 'good-day', hand: 'crayon' },
  { id: 'rc-afraid-maybe', phrase: 'afraid-leave', beside: 'easier-without', hand: 'pencil' },
  { id: 'rc-closer-thank', phrase: 'closer', beside: 'thank-staying', hand: 'faint' },
  { id: 'rc-understand', phrase: 'why-understand', beside: 'dont-want-understood', hand: 'pencil' },
  { id: 'rc-laugh-cups', phrase: 'laugh', beside: 'two-cups', hand: 'cyan' },
  { id: 'rc-stay-lonely', phrase: 'stay', beside: 'lonely-birthday', hand: 'pencil' },
  { id: 'rc-happy-ordinary', phrase: 'happy-then', beside: 'ordinary', hand: 'pen' },
  { id: 'rc-hello-glad', phrase: 'w-hello', beside: 'glad-came', hand: 'child' },
  { id: 'rc-fine-calm', phrase: 'im-fine', beside: 'breathe-out', hand: 'faint' },
];

/** Things heard but never written. Captions show them in brackets or as speech. */
export interface VoiceFragment {
  id: string;
  caption: string;
  kind: 'laugh' | 'murmur' | 'breath' | 'speech' | 'hum';
  dims: DimVector;
}

export const VOICE_FRAGMENTS: VoiceFragment[] = [
  { id: 'vf-laugh-next-room', caption: '(laughter, in another room)', kind: 'laugh', dims: { happiness: 0.7, connection: 0.5, isolation: 0.3 } },
  { id: 'vf-two-voices', caption: '(two people talking, too far away to follow)', kind: 'murmur', dims: { connection: 0.4, isolation: 0.6, misunderstanding: 0.4 } },
  { id: 'vf-breath', caption: '(someone breathing, close)', kind: 'breath', dims: { fear: 0.4, affection: 0.4, connection: 0.4 } },
  { id: 'vf-hum', caption: '(someone humming, not quite a song)', kind: 'hum', dims: { happiness: 0.5, nostalgia: 0.6, connection: 0.4 } },
  { id: 'vf-be-right-back', caption: "I'll be right back.", kind: 'speech', dims: { uncertainty: 0.5, desire: 0.4, fear: 0.3 } },
  { id: 'vf-other-one', caption: 'No — the other one.', kind: 'speech', dims: { happiness: 0.3, connection: 0.5 } },
  { id: 'vf-hey', caption: 'hey.', kind: 'speech', dims: { connection: 0.6, affection: 0.4 } },
  { id: 'vf-come-here', caption: 'Come here.', kind: 'speech', dims: { affection: 0.6, desire: 0.5, fear: 0.2 } },
  { id: 'vf-shh', caption: 'shh. it’s alright.', kind: 'speech', dims: { forgiveness: 0.5, affection: 0.5, relief: 0.5 } },
];

/**
 * Lexicon used by the local interpreter: stems → dimensions. Deliberately not a
 * sentiment table — most entries pull in more than one direction.
 */
export const LEXICON: Record<string, DimVector> = {
  miss: { grief: 0.6, desire: 0.6, nostalgia: 0.4, affection: 0.3 },
  missing: { grief: 0.5, desire: 0.5, isolation: 0.3 },
  remember: { nostalgia: 0.8, grief: 0.2, happiness: 0.2 },
  forget: { nostalgia: 0.4, grief: 0.4, uncertainty: 0.4 },
  forgot: { nostalgia: 0.4, grief: 0.4, shame: 0.2 },
  love: { affection: 0.8, fear: 0.3, desire: 0.4, contradiction: 0.2 },
  loved: { affection: 0.7, nostalgia: 0.4, grief: 0.2 },
  hate: { anger: 0.7, affection: 0.2, contradiction: 0.4 },
  alone: { isolation: 0.7, relief: 0.3, self: 0.3 },
  lonely: { isolation: 0.9, desire: 0.4 },
  together: { connection: 0.8, fear: 0.2 },
  friend: { connection: 0.7, happiness: 0.4, nostalgia: 0.2 },
  friends: { connection: 0.7, happiness: 0.4 },
  mother: { affection: 0.6, nostalgia: 0.5, misunderstanding: 0.3, grief: 0.2 },
  mum: { affection: 0.6, nostalgia: 0.5, misunderstanding: 0.3 },
  mom: { affection: 0.6, nostalgia: 0.5, misunderstanding: 0.3 },
  father: { affection: 0.5, nostalgia: 0.4, misunderstanding: 0.4, anger: 0.2 },
  dad: { affection: 0.5, nostalgia: 0.5, misunderstanding: 0.3 },
  home: { nostalgia: 0.7, connection: 0.4, uncertainty: 0.2 },
  happy: { happiness: 0.8, nostalgia: 0.2 },
  happiest: { happiness: 0.8, nostalgia: 0.5 },
  laugh: { happiness: 0.8, connection: 0.5, nostalgia: 0.3 },
  laughed: { happiness: 0.7, nostalgia: 0.5, connection: 0.4 },
  fun: { happiness: 0.7, connection: 0.3 },
  joy: { happiness: 0.8, affection: 0.3 },
  sad: { grief: 0.6, isolation: 0.3 },
  cry: { grief: 0.6, relief: 0.3, shame: 0.2 },
  cried: { grief: 0.6, relief: 0.4 },
  afraid: { fear: 0.8, uncertainty: 0.3 },
  scared: { fear: 0.8, self: 0.2 },
  fear: { fear: 0.8 },
  angry: { anger: 0.8, misunderstanding: 0.3 },
  mad: { anger: 0.6 },
  sorry: { shame: 0.6, forgiveness: 0.6 },
  forgive: { forgiveness: 0.8, grief: 0.2 },
  forgave: { forgiveness: 0.7, relief: 0.4 },
  shame: { shame: 0.9 },
  ashamed: { shame: 0.9, self: 0.3 },
  embarrassed: { shame: 0.6, happiness: 0.2 },
  stupid: { shame: 0.6, anger: 0.3 },
  wrong: { shame: 0.4, misunderstanding: 0.4, uncertainty: 0.3 },
  understand: { misunderstanding: 0.6, connection: 0.4 },
  understood: { connection: 0.6, misunderstanding: 0.3 },
  listen: { connection: 0.6, misunderstanding: 0.3 },
  want: { desire: 0.7 },
  wanted: { desire: 0.6, nostalgia: 0.3, grief: 0.2 },
  need: { desire: 0.6, fear: 0.3 },
  stay: { desire: 0.7, connection: 0.4, fear: 0.2 },
  leave: { isolation: 0.5, fear: 0.4, relief: 0.3 },
  left: { isolation: 0.5, grief: 0.4 },
  gone: { grief: 0.7, isolation: 0.4 },
  died: { grief: 0.9, nostalgia: 0.3 },
  dead: { grief: 0.8 },
  close: { connection: 0.5, fear: 0.3, desire: 0.3 },
  closer: { desire: 0.5, fear: 0.4, connection: 0.4 },
  far: { isolation: 0.5, relief: 0.2, desire: 0.3 },
  touch: { desire: 0.5, affection: 0.5, fear: 0.3 },
  hug: { affection: 0.7, connection: 0.5, fear: 0.2 },
  hold: { affection: 0.6, desire: 0.4, fear: 0.2 },
  quiet: { relief: 0.5, isolation: 0.4 },
  peace: { relief: 0.8, forgiveness: 0.3 },
  calm: { relief: 0.6, self: 0.3 },
  tired: { relief: 0.3, self: 0.4, grief: 0.3 },
  free: { relief: 0.7, isolation: 0.3 },
  who: { self: 0.4, uncertainty: 0.5 },
  myself: { self: 0.8 },
  me: { self: 0.4 },
  maybe: { uncertainty: 0.6 },
  perhaps: { uncertainty: 0.6 },
  never: { contradiction: 0.3, grief: 0.3, anger: 0.2 },
  always: { contradiction: 0.3, nostalgia: 0.3 },
  summer: { nostalgia: 0.8, happiness: 0.5 },
  winter: { nostalgia: 0.5, isolation: 0.3 },
  rain: { nostalgia: 0.6, relief: 0.3 },
  night: { isolation: 0.4, nostalgia: 0.3, relief: 0.2 },
  morning: { relief: 0.5, nostalgia: 0.3 },
  kitchen: { nostalgia: 0.6, connection: 0.4, happiness: 0.3 },
  dog: { affection: 0.6, happiness: 0.5, relief: 0.3 },
  cat: { affection: 0.5, happiness: 0.4, relief: 0.3 },
  music: { nostalgia: 0.5, happiness: 0.4, connection: 0.3 },
  song: { nostalgia: 0.6, happiness: 0.4 },
  school: { nostalgia: 0.6, shame: 0.2, uncertainty: 0.2 },
  child: { nostalgia: 0.6, self: 0.4 },
  little: { nostalgia: 0.4, self: 0.3 },
  used: { nostalgia: 0.5, grief: 0.3 },
  anymore: { grief: 0.5, nostalgia: 0.4 },
  sorrow: { grief: 0.8 },
  hope: { desire: 0.6, uncertainty: 0.4, happiness: 0.3 },
  thank: { forgiveness: 0.4, affection: 0.5, relief: 0.4 },
  thanks: { forgiveness: 0.3, affection: 0.4, relief: 0.4 },
  fine: { contradiction: 0.5, relief: 0.3 },
  okay: { relief: 0.5, uncertainty: 0.3 },
  hurt: { grief: 0.5, fear: 0.4, anger: 0.3 },
  pain: { grief: 0.5, fear: 0.4 },
  warm: { happiness: 0.5, affection: 0.5 },
  cold: { isolation: 0.6, fear: 0.2 },
  light: { relief: 0.4, happiness: 0.3 },
  dark: { fear: 0.5, isolation: 0.4 },
  nothing: { isolation: 0.3, relief: 0.3, uncertainty: 0.3 },
  everything: { desire: 0.4, contradiction: 0.3 },
  nobody: { isolation: 0.7 },
  everyone: { connection: 0.4, isolation: 0.3, misunderstanding: 0.3 },
};

/** Departure lines: one is chosen by what the visit was like. Never a moral. */
export const DEPARTURE_LINES: Record<string, string[]> = {
  default: ['The light stays on.', 'The chair will be here.'],
  hesitation: ['Next time, closer. Or not.', 'You almost did.'],
  stillness: ['You were very quiet. So was I.', 'You stayed still for a long time.'],
  closeness: ['It is still warm where you were.', 'You came all the way in.'],
  distance: ['You kept to the edges. That is a way of being here too.', 'From over there it looked smaller.'],
  warmth: ['Someone was humming.', 'You stayed with the good part.'],
  contributor: ['What you wrote will be gone by morning.', 'Your handwriting was on the wall for a while.'],
  wandering: ['You read nearly everything.', 'You went round and round.'],
};

/** Arrival line shown faintly on the threshold, varied by return visits. */
export const THRESHOLD_LINES = [
  'A white room. A small chair. Some things written on the walls.',
  'You came back.',
  'It is the same room.',
  'Someone has been here.',
];

export const DIMENSION_LIST: Dimension[] = [
  'isolation', 'connection', 'fear', 'happiness', 'grief', 'shame', 'nostalgia', 'affection',
  'anger', 'uncertainty', 'forgiveness', 'desire', 'relief', 'self', 'misunderstanding', 'contradiction',
];
