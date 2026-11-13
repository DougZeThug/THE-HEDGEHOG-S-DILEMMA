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

/** A situation's cues (src/state/situations): `sit:<id>`. */
export const sitRule = (id: string): string => `sit:${id}`;
export const isSituation = (rule: string): boolean => rule.startsWith('sit:');
/** The situations that answer the visitor (a rubbed-out word, a looked-at line) rather than being the room's own life. */
const isSituationAnswer = (rule: string): boolean => /^sit:(residue|listening)/.test(rule);
/** A situation's own sounds: they wait out an aftermath and a held silence; the answers don't. */
export const isSituationLife = (rule: string): boolean => isSituation(rule) && !isSituationAnswer(rule);

/** A meeting's beat: `encounter:<phrase>:<n>`, the nth meeting. */
export const encounterRule = (phraseId: string, n: number): string => `encounter:${phraseId}:${n}`;
export const isEncounter = (rule: string): boolean => rule.startsWith('encounter:');
export function parseEncounterRule(rule: string): { phraseId: string; n: number } | null {
  const m = /^encounter:([^:]+):(\d+)$/.exec(rule);
  return m ? { phraseId: m[1], n: Number(m[2]) } : null;
}

/** The visit's turns into a new phase (`phase-contradiction`, `phase-transform`). */
export const isPhaseTurn = (rule: string): boolean => rule.startsWith('phase-');

/** What a visitor's own contribution sets going (`contribution`, `contribution-quiet`, ...). */
export const isContribution = (rule: string): boolean => rule.startsWith('contribution');
/** A gesture decided in a meeting or from a contribution: counted when decided, so it waits rather than being lost. */
export const isMeetingOrContribution = (rule: string): boolean => isEncounter(rule) || isContribution(rule);
/** The stillness ladder's cues (`still-1`, `still-voice`, ...). */
export const isStillness = (rule: string): boolean => rule.startsWith('still');

/**
 * What the room does of its own accord, not in answer to the visitor (spaced, one at a time).
 * (Not the kitchen light or a drawing: those answer a look.)
 */
export const ROOM_OWN = /^(drift|accumulate$|stray|resurface|recontext|music$|distant-life|chair-nudge|voice$|rehear$|return$|air$|link$|sit:(?!residue|listening))/;

/** Where a cue came from, read once by `queue()` so the scheduler never re-parses names. */
type RuleSource = 'room' | 'turn' | 'answer';
export function ruleSource(rule: string): RuleSource {
  if (isPhaseTurn(rule)) return 'turn';
  return ROOM_OWN.test(rule) ? 'room' : 'answer';
}
