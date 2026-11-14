import { PHRASES, PHRASE_BY_ID } from '../../content/phrases';
import { VOICE_FRAGMENTS } from '../../content/relations';
import { WALLS, oppositeWall, type Phrase, type Tier } from '../../content/types';
import { devKind } from '../Pacing';
import { RULE } from '../rules';
import type { RuleHost } from './host';

/**
 * When quiet has turned into waiting — the visitor is doing things and nothing has
 * answered for longer than feels chosen — answer what they are doing: the line they are
 * reading, the chair they are standing at, the room they have just looked round. Not with
 * more of whatever just happened, and never loudly. Silence that is chosen (recovering
 * after something strong, or simply not yet long) is left alone.
 */
export class Responses {
  constructor(private readonly h: RuleHost) {}

  private lastRespondKind: string | null = null;
  private fragHeard = new Map<string, number>();

  tick() {
    const now = this.h.now;
    if (this.h.pacing.rhythm(now, this.h.phase, this.h.engagement.activity(now)) !== 'stalled' || !this.h.scheduler.ready('respond', now, 8) || this.h.attending()) return;
    // Something already on its way will answer.
    if (this.h.scheduler.pending().some((e) => e.at - now < 4 && devKind(e.payload.cue) && devKind(e.payload.cue) !== 'silence')) return;
    this.h.scheduler.mark('respond', now);
    const v = this.h.visitor;
    const last = this.h.engagement.last();
    const options: [string, () => boolean][] = [];
    if (v.gazeId) options.push(['line', () => this.respondToLine(v.gazeId!)]);
    if (v.near) options.push(['chair', () => this.respondAtChair()]);
    if (last && (last.kind === 'sweep' || last.kind === 'cross') && now - last.t < 20) options.push(['behind', () => this.respondBehind()]);
    if (v.stillFor > 3) options.push(['still', () => this.respondStill()]);
    if (!this.h.pacing.crowded(now)) options.push(['behind', () => this.respondBehind()], ['sound', () => this.respondSound()]);
    // Sometimes the answer is that nobody speaks: the room hushes, as if about to, and doesn't.
    if (this.h.phase !== 'arrival' && this.lastRespondKind !== 'withhold' && this.h.rng.chance(0.25))
      options.unshift(['withhold', () => (this.h.queue(0, { type: 'silence', depth: 0.38, seconds: 5 }, RULE.withhold, { major: true, ttl: 4 }), true)]);
    // Not the same kind of answer twice running.
    const tired = this.h.pacing.repeats('text', now, 25);
    options.sort((a, b) => Number(a[0] === this.lastRespondKind) - Number(b[0] === this.lastRespondKind) || (tired ? Number(a[0] !== 'sound') - Number(b[0] !== 'sound') : 0));
    for (const [kind, o] of options) {
      if (o()) {
        this.lastRespondKind = kind;
        return;
      }
    }
  }

  private respondToLine(id: string): boolean {
    const p = PHRASE_BY_ID.get(id);
    if (!p) return false;
    const ok = (x: Phrase | undefined): x is Phrase =>
      !!x && x.tier !== 'annotation' && !this.h.visible.has(x.id) && !this.h.reserved(x.id) && (x.tier !== 'transform' || this.h.phase === 'transform');
    // A related line comes up somewhere else — to be come across, not handed over beside it.
    const related = [...(p.echoes ?? []), ...(this.h.phase === 'arrival' ? [] : (p.contradicts ?? []))].map((r) => PHRASE_BY_ID.get(r)).filter(ok);
    const r = related[0];
    if (r) {
      this.h.reveal(r.id, 2, 'respond-line', 'emerge', 7);
      return true;
    }
    // Otherwise something near it in feeling, on the same wall.
    const q = this.h.selector.select(this.h.ctx(), { exclude: this.h.hiddenExcluding(), surfaces: [p.surface], bias: (x) => (x.keywords ?? []).some((k) => (p.keywords ?? []).includes(k)) ? 0.4 : 0 });
    if (!q) return false;
    this.h.reveal(q.id, 2, 'respond-line', 'emerge', 7);
    return true;
  }

  private respondAtChair(): boolean {
    if (this.h.shared.creaks < 2 && this.h.scheduler.ready('respond-creak', this.h.now, 90)) {
      this.h.scheduler.mark('respond-creak', this.h.now);
      this.h.shared.creaks++;
      this.h.queue(0.5, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.26 }, 'respond-chair');
      return true;
    }
    const p = PHRASES.find((x) => x.tier === 'near' && !this.h.visible.has(x.id)) ??
      this.h.selector.select(this.h.ctx(), { tiers: ['still', 'familiar'], exclude: this.h.hiddenExcluding(), surfaces: ['floor', this.h.facing] });
    if (!p) return false;
    this.h.reveal(p.id, 0.5, 'respond-chair', 'emerge', 7);
    return true;
  }

  /** Something appears on a wall the visitor has just turned away from, to be found. */
  private respondBehind(): boolean {
    const behind = this.h.facingWall() ? oppositeWall(this.h.facingWall()!) : undefined;
    const walls = [behind ?? 'south', ...WALLS.filter((s) => s !== this.h.facing && s !== behind)];
    // Early on, the room's next layer of writing is already within reach.
    const tiers: Tier[] | undefined = this.h.phase === 'arrival' ? ['arrival', 'familiar'] : undefined;
    for (const w of walls) {
      const p = this.h.selector.select(this.h.ctx(), { exclude: this.h.hiddenExcluding(), surfaces: [w], tiers });
      if (p) {
        this.h.reveal(p.id, 0, 'respond-behind', 'emerge', 8);
        return true;
      }
    }
    return false;
  }

  private respondStill(): boolean {
    const p = this.h.selector.select(this.h.ctx(), { tiers: ['still'], exclude: this.h.hiddenExcluding(), surfaces: [this.h.facing] }) ??
      this.h.selector.select(this.h.ctx(), { exclude: this.h.hiddenExcluding(), surfaces: [this.h.facing] });
    if (!p) return false;
    this.h.reveal(p.id, 0, 'respond-still', p.tier === 'still' ? 'still' : 'emerge', 8);
    return true;
  }

  private respondSound(): boolean {
    if (this.h.situations.claimed('beyond') || !this.h.pacing.intenseFree(this.h.now) || this.h.pacing.repeats('sound', this.h.now, 25)) return false;
    const wall = this.h.rng.pick(WALLS.filter((s) => s !== this.h.facing));
    // (The door is kept for its authored moments.) Nothing heard twice within three minutes.
    const fresh = (id: string) => this.h.now - (this.fragHeard.get(id) ?? -Infinity) > 180;
    if (this.h.rng.chance(0.4) && fresh('sfx:cup')) {
      this.fragHeard.set('sfx:cup', this.h.now);
      this.h.queue(0, { type: 'sound', kind: 'cup', position: { kind: 'beyond', surface: wall }, gain: 0.3 }, 'respond-sound');
      return true;
    }
    const frags = VOICE_FRAGMENTS.filter((f) => f.kind !== 'speech' && f.kind !== 'breath' && !this.h.owned.has(f.id) && fresh(f.id));
    if (!frags.length) return false;
    const f = this.h.rng.pick(frags);
    this.fragHeard.set(f.id, this.h.now);
    this.h.fragment('respond-sound', f, { kind: 'beyond', surface: wall }, 0, 0.35);
    return true;
  }
}
