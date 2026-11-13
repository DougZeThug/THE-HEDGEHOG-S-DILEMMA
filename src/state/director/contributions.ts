import { Rng, hashString } from '../../core/rng';
import { keptWord } from '../../core/words';
import { PHRASE_BY_ID } from '../../content/phrases';
import { VOICE_FRAGMENT_BY_ID } from '../../content/relations';
import { FRAGMENT_IDS } from '../../content/ids';
import type { Interpretation } from '../../interpret/schema';
import type { ContributionTrace } from '../situations/Situation';
import { RULE, isContribution } from '../rules';
import { WriteKeys } from '../writeKeys';
import { WALLS } from '../../content/types';
import type { RuleHost } from './host';

/** What the room does with a visitor's own words (docs/pacing.md). */
export class Contributions {
  private count = 0;
  /** The last thing written, for the situation that rubs it out (the words themselves are not kept). */
  last: ContributionTrace | null = null;

  constructor(private readonly h: RuleHost) {}

  /**
   * A visitor's words become material in the room. The text itself is passed to the
   * world once (to be written on a wall) and is not retained by the Director.
   */
  add(text: string, it: Interpretation): void {
    this.count++;
    this.h.engagement.raise('contribute', this.h.now);
    this.h.memory.contributions.push({ dims: it.dims, at: this.h.now });
    const key = WriteKeys.contribution(this.count);
    this.last = { key, keep: keptWord(text), surface: this.h.facing, at: this.h.now };
    // The words are always written. The room does not reply: at most one other thing
    // happens, often nothing, and anything related surfaces much later, as if by itself.
    this.h.queue(0.5, { type: 'write', key, text, hand: 'visitor', size: text.length > 60 ? 'xs' : 's', surface: this.h.facing, purpose: 'contribution', ttl: 0 }, RULE.contribution);
    const options = it.gestures.filter((g) => g !== 'writeOnWall');
    // Its own stream of chance, so what a visitor's words bring doesn't shift whenever some
    // unrelated rule of the room is added or changed.
    const r = new Rng(hashString(`contribution:${this.h.seed}:${this.count}`));
    if (!options.length || r.chance(0.4)) return;
    const g = r.pick(options);
    const later = r.range(60, 180);
    switch (g) {
      case 'quiet':
        this.h.queue(1, { type: 'silence', depth: 0.45 + 0.25 * it.intensity, seconds: 10 }, 'contribution-quiet', { major: true, ttl: 6 });
        break;
      case 'revealRelated': {
        const p = it.related.map((id) => PHRASE_BY_ID.get(id)).find((x) => x && x.tier !== 'annotation' && !this.h.visible.has(x.id));
        if (p) this.h.reveal(p.id, later, 'contribution-related', 'emerge', 12);
        break;
      }
      case 'distantRecollection': {
        const p = it.related.map((id) => PHRASE_BY_ID.get(id)).find((x) => x?.voice && !this.h.memory.spoken.has(x.id));
        if (p) this.h.speakPhrase('contribution-recollection', p, { kind: 'beyond', surface: this.h.rng.pick(WALLS) }, later, 'distant', 0.45);
        else this.h.fragment('contribution-recollection', VOICE_FRAGMENT_BY_ID.get(FRAGMENT_IDS.twoVoices)!, { kind: 'beyond', surface: 'west' }, later, 0.35);
        break;
      }
      case 'rearrange': {
        const a = it.related[0];
        const b = it.contradictions[0];
        if (!a || !b) break;
        if (!this.h.visible.has(b)) this.h.reveal(b, later, 'contribution-rearrange', 'emerge', 10);
        const pa = PHRASE_BY_ID.get(a);
        const pb = PHRASE_BY_ID.get(b);
        if (pa && pb && pa.surface === pb.surface) this.h.queue(later + 12, { type: 'link', a, b, ttl: 60 }, 'contribution-rearrange');
        break;
      }
      case 'temperatureShift': {
        // Authored asymmetries rather than sentiment colours: grief warms the light (memory),
        // anger cools and hardens it, joy brings a little ache with it, shame makes the room look away.
        const d = it.dims;
        this.h.field.nudge({
          warmth: 0.25 * (d.grief ?? 0) + 0.15 * (d.affection ?? 0) + 0.1 * (d.happiness ?? 0) - 0.15 * (d.anger ?? 0),
          reminiscence: 0.4 * (d.nostalgia ?? 0) + 0.2 * (d.grief ?? 0) + 0.15 * (d.happiness ?? 0),
          tension: 0.25 * (d.anger ?? 0) + 0.1 * (d.fear ?? 0),
          exposure: -0.2 * (d.shame ?? 0) + 0.1 * (d.affection ?? 0),
          hush: 0.2 * (d.fear ?? 0) + 0.15 * (d.uncertainty ?? 0),
          dissonance: 0.12 * (d.happiness ?? 0) + 0.3 * (d.contradiction ?? 0),
          solitude: 0.2 * (d.isolation ?? 0),
          relief: 0.15 * (d.isolation ?? 0) + 0.2 * (d.forgiveness ?? 0),
        });
        break;
      }
    }
  }

  /** The visitor asked to be forgotten. */
  forget(): void {
    this.last = null;
    this.h.situations.dropTagged('contribution');
    this.h.memory.contributions = [];
    this.h.scheduler.cancelWhere((e) => isContribution(e.rule));
  }
}
