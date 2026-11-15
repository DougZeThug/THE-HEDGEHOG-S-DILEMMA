import type { RuleName } from '../rules';
import type { Rng } from '../../core/rng';
import type { EventScheduler } from '../../core/scheduler';
import type { Phase, Phrase, Surface, Wall } from '../../content/types';
import type { VoiceFragment } from '../../content/relations';
import type { Cue, VoicePosition } from '../cues';
import type { VoiceKind } from '../../content/types';
import type { Engagement } from '../Engagement';
import type { EmotionalField } from '../EmotionalField';
import type { Memory } from '../Memory';
import type { MemoryDirector } from '../MemoryDirector';
import type { Pacing } from '../Pacing';
import type { SelectContext, PhraseSelector } from '../PhraseSelector';
import type { SituationRunner } from '../situations/Situation';
import type { VisitorModel } from '../VisitorModel';
import type { VisibleState } from '../situations/Situation';
import type { WallLedger } from './ledger';

/** Times and counts that more than one rule group reads or sets. */
interface SharedMarks {
  /** How often the chair has creaked this visit (the opening, an approach, a response share the allowance). */
  creaks: number;
  /** When the long held silence ends: the room's own life waits, and the turn to the last phase doesn't break into it. */
  heldSilenceUntil: number;
  /** When words were last written in the air (a return through them is that return's answer). */
  airAt: number;
  /** The last turn into a new phase, and the last turn the visitor can see (it writes, or holds a silence and dims). */
  lastTurnAt: number;
  markedTurnAt: number;
  /** When the visit turned to its last phase. */
  transformAt: number;
  /** A turn waiting for a living memory to end and a few seconds more. */
  pendingPhase: Phase | null;
  /** After a vignette, even the room finishing its own line waits (its quiet is part of it). */
  vignetteQuietUntil: number;
  /** No voices of the room's own until then (a memory's line has just been offered, or a vignette has ended). */
  memoryQuietUntil: number;
}

export const newSharedMarks = (): SharedMarks => ({
  creaks: 0,
  heldSilenceUntil: -Infinity,
  airAt: -Infinity,
  lastTurnAt: -Infinity,
  markedTurnAt: -Infinity,
  transformAt: Infinity,
  pendingPhase: null,
  vignetteQuietUntil: -Infinity,
  memoryQuietUntil: -Infinity,
});

export type QueueOptions = { major?: boolean; key?: string; ttl?: number; priority?: number };

/**
 * What the rule groups ask of one another. The Director wires each (src/state/Director.ts); a group
 * names the members it needs with `Pick<RuleLinks, ...>` rather than declaring them again.
 */
export interface RuleLinks {
  /** The north wall is held for the heart's answer. */
  northKept(): boolean;
  /** The way out is shown and is this line (it is never culled). */
  isWayOut(phraseId: string): boolean;
  /** The kitchen-light memory has played. */
  memoryPlayed(): boolean;
  /** "Stay" and its answers are never said near the way out. */
  refusesStayWords(): boolean;
}

/**
 * What a group of the Director's rules may see and do: the shared room (visitor, field, walls,
 * scheduler) and the few verbs every rule uses (queue a cue, reveal a line, speak). Each rule
 * group owns its own state and reaches the rest of the room only through this.
 * The Director implements it.
 */
export interface RuleHost {
  readonly now: number;
  readonly phase: Phase;
  readonly facing: Surface;
  readonly departing: boolean;
  readonly seed: number;
  readonly visitor: VisitorModel;
  readonly memory: Memory;
  readonly field: EmotionalField;
  readonly engagement: Engagement;
  readonly pacing: Pacing;
  readonly selector: PhraseSelector;
  readonly scheduler: EventScheduler<{ cue: Cue; rule: RuleName }>;
  readonly rng: Rng;
  readonly visible: Map<string, VisibleState>;
  readonly scenes: MemoryDirector;
  readonly situations: SituationRunner;
  readonly owned: ReadonlySet<string>;
  readonly ledger: WallLedger;
  readonly visits: number;
  /** The room's music is over for this visit. */
  readonly musicWithdrawn: boolean;
  /** A memory with voices of its own is playing: a vignette, or a painted memory begun with its overheard voices. */
  readonly vignettePlaying: boolean;
  readonly shared: SharedMarks;
  /** The wall faced, or null when looking at the floor or ceiling. */
  facingWall(): Wall | null;
  /** The wall opposite the one faced. */
  behindWall(): Wall | undefined;

  queue(delay: number, cue: Cue, rule: RuleName, opts?: QueueOptions): void;
  reveal(id: string, delay: number, rule: RuleName, mode?: 'emerge' | 'still', seconds?: number): void;
  /** Says a phrase; only a voice that was queued is counted as spoken. */
  speakPhrase(rule: RuleName, p: Phrase, position: VoicePosition, delay?: number, styleOverride?: Phrase['voice'], gain?: number): boolean;
  fragment(rule: RuleName, f: VoiceFragment, position: VoicePosition, delay?: number, gain?: number): void;
  voice(
    rule: RuleName,
    delay: number,
    kind: VoiceKind,
    text: string | null,
    caption: string,
    position: VoicePosition,
    extra?: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number; finish?: boolean },
  ): boolean;
  ctx(): SelectContext;
  /** The visitor is in the middle of meeting a line: its beat is waiting or about to sound. */
  attending(): boolean;
  /** Whether the room declines to say this now (a refused voice queues nothing, so nothing may be counted for it). */
  voiceRefused(rule: RuleName, phraseId?: string, finish?: boolean): boolean;
  /** Kept for its moment: never drifted onto a wall before that. */
  reserved(id: string): boolean;
  /** Lines not to choose from: on the walls, reserved, withheld. */
  hiddenExcluding(): Set<string>;
  withheld(): string[];
  /** A cooldown whose length wanders (×0.6–1.6) from use to use, so periodic rules don't beat in time. */
  cool(key: string, base: number): boolean;
  used(key: string): void;
  aftermath(): boolean;
}
