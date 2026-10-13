import type { Rng } from '../../core/rng';
import type { Phase, Phrase, Surface, VoiceStyle } from '../../content/types';
import type { VisitorModel } from '../VisitorModel';
import type { Memory } from '../Memory';
import type { FieldValues } from '../EmotionalField';
import type { Cue, VoicePosition } from '../cues';
import type { VisibleState } from '../Director';

/**
 * Situations: authored, multi-beat episodes that bind concrete things (a wall, a phrase,
 * a tune, the place where you knelt), wait for what the visitor actually does, and come
 * back later with something changed, missing or moved. The rules in Director are the
 * room's weather; situations are the things that happen in it.
 */

export type Channel = 'beyond' | 'chair-voice' | 'music';

export interface PhraseGeometry {
  surface: Surface;
  /** World position, chair at the origin. */
  x: number;
  y: number;
  z: number;
}

export interface ContributionTrace {
  key: string;
  /** The one word that would survive being rubbed out (the rest of the text is not kept). */
  keep: string;
  surface: Surface;
  at: number;
}

/** What a situation may see and do. Implemented by the Director. */
export interface SituationHost {
  readonly now: number;
  /** A meeting with a line is under way (its beat is pending): nothing new should start over it. */
  attending?(): boolean;
  readonly visitor: VisitorModel;
  readonly memory: Memory;
  readonly field: FieldValues;
  readonly phase: Phase;
  readonly facing: Surface;
  readonly visible: ReadonlyMap<string, VisibleState>;
  readonly rng: Rng;
  geometry(phraseId: string): PhraseGeometry | undefined;
  /** Distance from the visitor to a wall (metres). */
  distToSurface(s: Surface): number;
  emit(rule: string, delay: number, cue: Cue, opts?: { major?: boolean; ttl?: number; priority?: number }): void;
  cancel(rule: string): void;
  reveal(rule: string, id: string, delay: number, mode: 'emerge' | 'still', seconds: number): void;
  speak(rule: string, p: Phrase, position: VoicePosition, delay: number, style: VoiceStyle, gain: number): void;
  musicReady(seconds: number): boolean;
  markMusic(): void;
  lastContribution(): ContributionTrace | null;
}

export interface SituationState {
  stage: string;
  startedAt: number;
  stageAt: number;
  data: Record<string, unknown>;
}

export interface SituationContext {
  h: SituationHost;
  st: SituationState;
  /** Rule name used for this situation's cues (`sit:<id>`). */
  rule: string;
  /** Seconds in the current stage. */
  since: number;
  go(stage: string): void;
  emit(delay: number, cue: Cue, opts?: { major?: boolean; ttl?: number; priority?: number }): void;
  claim(ch: Channel): boolean;
  release(ch: Channel): void;
  claimed(ch: Channel): boolean;
  /** Finish. 'abort' returns the situation to the repertoire so it may begin again later. */
  end(how?: 'done' | 'abort'): void;
}

export interface SituationDef {
  id: string;
  /** Upper bound on how long it may stay open (seconds). */
  maxLife: number;
  /** Quiet enough to begin at any moment (it claims nothing and makes no sound when it starts). */
  gentle?: boolean;
  /** Fragments that belong to this situation: the generic rules stop using them. */
  owns?: string[];
  ready(h: SituationHost, claimed: (ch: Channel) => boolean): boolean;
  begin(c: SituationContext): void;
  step(c: SituationContext): void;
}

interface Active {
  def: SituationDef;
  st: SituationState;
  ended?: 'done' | 'abort';
}

export class SituationRunner {
  readonly pending: SituationDef[];
  readonly active: Active[] = [];
  readonly finished: { id: string; at: number; how: string; stage: string }[] = [];
  private claims = new Map<Channel, string>();
  private lastStart = -Infinity;
  /** Last time any situation held the 'beyond' channel. */
  lastBeyond = -Infinity;
  maxActive = 2;
  startGap = 40;

  constructor(readonly repertoire: SituationDef[]) {
    this.pending = [...repertoire];
  }

  claimed(ch: Channel): boolean {
    return this.claims.has(ch);
  }

  owned(): Set<string> {
    return new Set(this.repertoire.flatMap((d) => d.owns ?? []));
  }

  private ctx(h: SituationHost, a: Active): SituationContext {
    const rule = `sit:${a.def.id}`;
    const self = this;
    return {
      h,
      st: a.st,
      rule,
      get since() {
        return h.now - a.st.stageAt;
      },
      go(stage) {
        a.st.stage = stage;
        a.st.stageAt = h.now;
      },
      emit(delay, cue, opts) {
        h.emit(rule, delay, cue, opts);
      },
      claim(ch) {
        const holder = self.claims.get(ch);
        if (holder && holder !== a.def.id) return false;
        self.claims.set(ch, a.def.id);
        if (ch === 'beyond') self.lastBeyond = h.now;
        return true;
      },
      release(ch) {
        if (self.claims.get(ch) === a.def.id) self.claims.delete(ch);
        if (ch === 'beyond') self.lastBeyond = h.now;
      },
      claimed: (ch) => this.claimed(ch),
      end(how = 'done') {
        a.ended = how;
      },
    };
  }

  tick(h: SituationHost): void {
    for (const a of [...this.active]) {
      if (h.now - a.st.startedAt > a.def.maxLife) a.ended = a.ended ?? 'done';
      if (!a.ended) a.def.step(this.ctx(h, a));
      if (a.ended) this.close(h, a);
    }
    for (const [ch, id] of this.claims) if (ch === 'beyond' && id) this.lastBeyond = h.now;
    if (this.active.length >= this.maxActive || h.now - this.lastStart < this.startGap) return;
    // Nothing loud begins while the visitor is in the middle of meeting a line, or over something else.
    const busy = h.attending?.() ?? false;
    for (const def of this.pending) {
      if (busy && !def.gentle) continue;
      if (!def.ready(h, (ch) => this.claimed(ch))) continue;
      this.pending.splice(this.pending.indexOf(def), 1);
      const a: Active = { def, st: { stage: 'begin', startedAt: h.now, stageAt: h.now, data: {} } };
      this.active.push(a);
      this.lastStart = h.now;
      def.begin(this.ctx(h, a));
      if (a.ended) this.close(h, a);
      break;
    }
  }

  private close(h: SituationHost, a: Active) {
    for (const [ch, id] of [...this.claims]) if (id === a.def.id) this.claims.delete(ch);
    this.active.splice(this.active.indexOf(a), 1);
    this.finished.push({ id: a.def.id, at: +h.now.toFixed(1), how: a.ended ?? 'done', stage: a.st.stage });
    if (a.ended === 'abort') this.pending.push(a.def);
  }

  /** Close a situation from outside (e.g. the visitor asked the room to forget their words). */
  drop(id: string) {
    const i = this.active.findIndex((a) => a.def.id === id);
    if (i >= 0) {
      for (const [ch, holder] of [...this.claims]) if (holder === id) this.claims.delete(ch);
      this.active.splice(i, 1);
    }
  }

  snapshot() {
    return {
      active: this.active.map((a) => `${a.def.id}:${a.st.stage}`),
      pending: this.pending.map((d) => d.id),
      finished: this.finished.map((f) => `${f.id}@${f.at}(${f.how}:${f.stage})`),
      claims: [...this.claims.entries()].map(([c, id]) => `${c}=${id}`),
    };
  }
}
