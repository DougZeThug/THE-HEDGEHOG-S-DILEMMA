/**
 * Rule names: what each cue is queued under. The Scheduler groups by them, Pacing and the App read
 * them, and the playtest logs print them, so the values are a protocol; change one and those
 * readers change with it. The families are `sit:<situation>`, `encounter:<phrase>:<beat>` and
 * `phase-<turn>`; the helpers here are the only place their shapes are written down.
 */

export const RULE = {
  leaving: 'leaving',
  leavingKept: 'leaving-kept',
  memoryOffer: 'memory-offer',
  memory: 'memory',
  heldSilence: 'held-silence',
  tableSilence: 'resonance:table',
  withhold: 'withhold',
  contribution: 'contribution',
  phaseTransform: 'phase-transform',
} as const;

type PhaseRule = `phase-${'contradiction' | 'transform'}`;
type SitRule = `sit:${string}`;
type EncounterRule = `encounter:${string}:${number}`;

/** A situation's cues (src/state/situations): `sit:<id>`. */
export const sitRule = (id: string): SitRule => `sit:${id}`;
export const isSituation = (rule: string): boolean => rule.startsWith('sit:');
/** The situations that answer the visitor (a rubbed-out word, a looked-at line) rather than being the room's own life. */
const isSituationAnswer = (rule: string): boolean => /^sit:(residue|listening)/.test(rule);
/** A situation's own sounds: they wait out an aftermath and a held silence; the answers don't. */
export const isSituationLife = (rule: string): boolean => isSituation(rule) && !isSituationAnswer(rule);

/** A meeting's beat: `encounter:<phrase>:<n>`, the nth meeting. */
export const encounterRule = (phraseId: string, n: number): EncounterRule => `encounter:${phraseId}:${n}`;
export const isEncounter = (rule: string): boolean => rule.startsWith('encounter:');
export function parseEncounterRule(rule: string): { phraseId: string; n: number } | null {
  const m = /^encounter:([^:]+):(\d+)$/.exec(rule);
  return m ? { phraseId: m[1], n: Number(m[2]) } : null;
}

/** The rule a visit's turn into a new phase is queued under (`phase-contradiction`, `phase-transform`). */
export const phaseRule = (turn: 'contradiction' | 'transform'): PhaseRule => `phase-${turn}`;
/** The visit's turns into a new phase (`phase-contradiction`, `phase-transform`). */
export const isPhaseTurn = (rule: string): boolean => rule.startsWith('phase-');

/** What a visitor's own contribution sets going (`contribution`, `contribution-quiet`, ...). */
export const isContribution = (rule: string): boolean => rule.startsWith('contribution');
/** A gesture decided in a meeting or from a contribution: counted when decided, so it waits rather than being lost. */
export const isMeetingOrContribution = (rule: string): boolean => isEncounter(rule) || isContribution(rule);
/** The room has begun letting the visitor go (the silence that opens it), or has handed them back. */
export const isLeavingBegun = (q: { rule: string; cue: { type: string } }): boolean => q.rule === RULE.leaving && q.cue.type === 'silence';
export const isLeavingKept = (rule: string): boolean => rule === RULE.leavingKept;

/** The stillness ladder's cues (`still-1`, `still-voice`, ...). */
export const isStillness = (rule: string): boolean => rule.startsWith('still');

/**
 * What the room does of its own accord, not in answer to the visitor (spaced, one at a time).
 * (Not the kitchen light or a drawing: those answer a look.)
 */
const ROOM_OWN_PREFIXES = ['drift', 'stray', 'resurface', 'recontext', 'distant-life', 'chair-nudge'] as const;
const ROOM_OWN_EXACT = ['accumulate', 'music', 'voice', 'rehear', 'return', 'air', 'link'] as const;
export const ROOM_OWN = new RegExp(`^(${[...ROOM_OWN_PREFIXES, ...ROOM_OWN_EXACT.map((r) => `${r}$`), 'sit:(?!residue|listening)'].join('|')})`);

/** Every rule a cue can be queued under: a typo here fails to compile. */
export type RuleName =
  | (typeof RULE)[keyof typeof RULE]
  | PhaseRule
  | SitRule
  | EncounterRule
  | (typeof ROOM_OWN_PREFIXES)[number]
  | (typeof ROOM_OWN_EXACT)[number]
  | `echo:${string}`
  | `draw:${string}`
  | 'cull' | 'first-approach' | 'long-near' | 'return-recoil'
  | 'contribution-quiet' | 'contribution-related' | 'contribution-rearrange'
  | 'heart-kept' | 'heart-answer' | 'vignette' | 'memory-scene'
  | 'respond-line' | 'respond-chair' | 'respond-behind' | 'respond-still' | 'respond-sound'
  | 'stray-held' | 'withdraw-air' | 'withdraw-hesitant' | 'withdraw-relief' | 'resonance:table-lift'
  | 'unstill' | 'still-1' | 'still-2' | 'still-silence' | 'still-music'
  | 'near-exposed' | 'near-warm' | 'contribution-recollection' | 'kneel' | 'still-voice' | 'still-hum' | 'voice-attention'
  | 'accumulate-turn' | 'accumulate-read' | 'finish-look' | 'finish-chair' | 'motif-hesitation' | 'motif-warmth' | 'motif-wandering'
  | 'motif-stillness' | 'motif-distance' | 'exit-line' | 'leaving-creak';

/** Where a cue came from, read once by `queue()` so the scheduler never re-parses names. */
type RuleSource = 'room' | 'turn' | 'answer';
export function ruleSource(rule: string): RuleSource {
  if (isPhaseTurn(rule)) return 'turn';
  return ROOM_OWN.test(rule) ? 'room' : 'answer';
}
