import type { Rng } from '../../core/rng';
import type { EventScheduler } from '../../core/scheduler';
import type { Phase, Phrase, Surface } from '../../content/types';
import type { VoiceFragment } from '../../content/relations';
import type { Cue, VoiceKind, VoicePosition } from '../cues';
import type { Engagement } from '../Engagement';
import type { EmotionalField } from '../EmotionalField';
import type { Memory } from '../Memory';
import type { MemoryDirector } from '../MemoryDirector';
import type { Pacing } from '../Pacing';
import type { SelectContext, PhraseSelector } from '../PhraseSelector';
import type { SituationRunner } from '../situations/Situation';
import type { VisitorModel } from '../VisitorModel';
import type { VisibleState } from '../Director';

export type QueueOptions = { major?: boolean; key?: string; ttl?: number; priority?: number };

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
  readonly scheduler: EventScheduler<{ cue: Cue; rule: string }>;
  readonly rng: Rng;
  readonly visible: Map<string, VisibleState>;
  readonly scenes: MemoryDirector;
  readonly situations: SituationRunner;
  readonly owned: ReadonlySet<string>;

  queue(delay: number, cue: Cue, rule: string, opts?: QueueOptions): void;
  reveal(id: string, delay: number, rule: string, mode?: 'emerge' | 'still', seconds?: number): void;
  /** Says a phrase; only a voice that was queued is counted as spoken. */
  speakPhrase(rule: string, p: Phrase, position: VoicePosition, delay?: number, styleOverride?: Phrase['voice'], gain?: number): boolean;
  fragment(rule: string, f: VoiceFragment, position: VoicePosition, delay?: number, gain?: number): void;
  voice(
    rule: string,
    delay: number,
    kind: VoiceKind,
    text: string | null,
    caption: string,
    position: VoicePosition,
    extra?: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number; finish?: boolean },
  ): boolean;
  ctx(): SelectContext;
}
