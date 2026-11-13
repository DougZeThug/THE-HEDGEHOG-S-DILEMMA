import { PHRASE_BY_ID } from '../../content/phrases';
import { VOICE_FRAGMENT_BY_ID } from '../../content/relations';
import { FRAGMENT_IDS } from '../../content/ids';
import { ARCS, type Arc, type EncounterBeat, type Gesture } from '../../content/encounters';
import { WALLS, type Phrase } from '../../content/types';
import type { VoicePosition } from '../cues';
import { phaseAtLeast } from '../Phase';
import { encounterRule } from '../rules';
import { WriteKeys } from '../writeKeys';
import type { RuleHost } from './host';

/**
 * Encounters. The same words, met again, in a different context. Each phrase has an arc —
 * authored for the central ones, derived from relations for the rest — and each meeting
 * plays the next beat of it. Most beats are nothing at all; empty beats count too, so the
 * visitor never learns that looking makes things happen.
 */
export class Encounters {
  constructor(
    private readonly h: RuleHost,
    /** The way out says nothing about leaving: no answer beside it, no reassurance (creative director, 2026-11-06). */
    private readonly wayOutShown: (phraseId: string) => boolean,
  ) {}

  /** A meeting's beat is waiting for room to play. */
  get waiting(): boolean {
    return this.heldBeats.size > 0;
  }

  /** A beat whose voice or writing never landed is played again at the next meeting. */
  rewind(phraseId: string, n: number): void {
    this.played.set(phraseId, Math.max(0, n - 1));
  }

  /** How many beats of each phrase's arc have been played. */
  private played = new Map<string, number>();

  /** Beats waiting for room to play, while their meeting lasts: phrase id → give up at. */
  private heldBeats = new Map<string, number>();

  /**
   * Encounters. The same words, met again, in a different context. Each phrase has an arc —
   * authored for the central ones, derived from relations for the rest — and each meeting
   * plays the next beat of it. Most beats are nothing at all; empty beats count too, so the
   * visitor never learns that looking makes things happen.
   */
  tick() {
    // A beat that could not play when its meeting began waits while the visitor keeps looking.
    const tries: string[] = [];
    for (const [id, until] of this.heldBeats) {
      if (this.h.now > until || !this.h.visitor.encounters.get(id)?.open) this.heldBeats.delete(id);
      else tries.push(id);
    }
    for (const { id } of this.h.visitor.encounterStarted) tries.push(id);
    for (const id of tries) {
      const p = PHRASE_BY_ID.get(id);
      if (!p) continue;
      // The way out says nothing about leaving: no answer beside it, no reassurance (creative director, 2026-11-06).
      if (this.wayOutShown(id)) continue;
      const n = this.played.get(id) ?? 0;
      const beat = this.beatFor(p, n);
      if (beat === null) continue;
      // An empty beat is just the phrase, alone: it always happens, and takes no room.
      if (!beat.gestures.length) {
        this.played.set(id, n + 1);
        this.heldBeats.delete(id);
        continue;
      }
      const hold = () => {
        if (!this.heldBeats.has(id)) this.heldBeats.set(id, this.h.now + 12);
      };
      if (!this.h.scheduler.ready('encounter', this.h.now, 8)) {
        hold();
        continue;
      }
      if (beat.gestures.some((g) => ('sound' in g || ('voice' in g && g.from === 'beyond')) && this.h.situations.claimed('beyond'))) continue;
      // A voice belongs to the moment of looking; if the room has just spoken, the beat waits a
      // little. (A meeting is what the visitor is attending to: it outranks recovery.)
      if (beat.gestures.some((g) => 'voice' in g || 'breath' in g || 'silence' in g || 'sound' in g) && !this.h.scheduler.majorFree(this.h.now)) {
        hold();
        continue;
      }
      // A voice the room declines to say (a line left unfinished, a memory's quiet) is not lost:
      // the beat waits for it, whole, rather than playing without it.
      if (beat.gestures.some((g) => 'voice' in g) && this.h.voiceRefused(encounterRule(id, n + 1), id)) {
        hold();
        continue;
      }
      // A beat that has already waited plays at once: the wait was its pause.
      const waited = this.heldBeats.has(id);
      this.heldBeats.delete(id);
      this.h.scheduler.mark('encounter', this.h.now);
      this.played.set(id, n + 1);
      this.playBeat(p, n + 1, beat, waited);
    }
  }

  /** Beat for the (n+1)th meeting, or null when the phrase has nothing more and should rest. */
  private beatFor(p: Phrase, n: number): EncounterBeat | null {
    const arc = ARCS[p.id] ?? this.defaultArc(p);
    const variants = arc[n];
    if (!variants) return n < 6 ? { gestures: [] } : null;
    const v = this.h.visitor;
    return (
      variants.find((b) => {
        const w = b.when;
        if (!w) return true;
        if (w.phase && !w.phase.includes(this.h.phase)) return false;
        if (w.motif && !this.h.memory.has(w.motif)) return false;
        if (w.near !== undefined && w.near !== v.near) return false;
        return true;
      }) ?? { gestures: [] }
    );
  }

  /** A restrained arc from a phrase's own relations: alone; one relation; a different context; rest. */
  private defaultArc(p: Phrase): Arc {
    const late = phaseAtLeast(this.h.phase, 'contradiction');
    const echoes = (p.echoes ?? []).map((id) => PHRASE_BY_ID.get(id)).filter((x): x is Phrase => !!x);
    const contra = (p.contradicts ?? []).map((id) => PHRASE_BY_ID.get(id)).filter((x): x is Phrase => !!x);
    const ok = (x: Phrase) => x.tier !== 'transform' || this.h.phase === 'transform';
    const first = [...(this.h.phase === 'arrival' ? echoes : [...echoes, ...contra])].find(ok);
    const second = [...(late ? [...contra, ...echoes] : [...echoes, ...contra])].find((x) => ok(x) && x !== first);
    const relate = (r: Phrase): Gesture =>
      r.tier === 'annotation' || (!this.h.visible.has(r.id) && r.surface !== p.surface)
        ? { annotate: r.id, hand: r.tier === 'annotation' ? r.hand : 'faint', strike: late && contra.includes(r) && this.h.rng.chance(0.3) }
        : { reveal: r.id, link: r.surface === p.surface };
    const arc: Arc = [[{ gestures: [] }]];
    arc.push([{ gestures: first ? [relate(first)] : [], delay: 1.5 }]);
    if (second) arc.push([{ gestures: [relate(second)], delay: 1.5 }]);
    else if (p.voice) arc.push([{ gestures: [{ voice: p.voice === 'flat' ? 'tender' : 'flat', from: 'surface', gain: 0.5 }], delay: 2 }]);
    return arc;
  }

  private playBeat(p: Phrase, n: number, beat: EncounterBeat, waited = false) {
    const rule = encounterRule(p.id, n);
    const d = waited ? 0.3 : beat.delay ?? 1.5;
    const beyond = (): VoicePosition => ({ kind: 'beyond', surface: this.h.rng.pick(WALLS.filter((s) => s !== this.h.facing)) });
    for (const g of beat.gestures) {
      if ('voice' in g) {
        const pos: VoicePosition =
          g.from === 'behind' ? { kind: 'behind' } : g.from === 'chair' ? { kind: 'chair' } : g.from === 'surface' ? { kind: 'surface', phraseId: p.id } : g.from === 'nowhere' ? { kind: 'nowhere' } : beyond();
        if (this.h.voice(rule, d, g.voice, p.text, p.text, pos, { phraseId: p.id, gain: g.gain ?? 0.5, ttl: 15, priority: 6 })) this.h.memory.spoken.set(p.id, this.h.now + d);
      } else if ('annotate' in g) {
        const a = PHRASE_BY_ID.get(g.annotate);
        if (!a) continue;
        this.h.queue(d, {
          // An authored answer is written to be read from where the phrase is read.
          type: 'write', key: WriteKeys.enc(p.id, n), text: a.text, hand: g.hand ?? a.hand, size: ARCS[p.id] ? 's' : 'xs', beside: p.id, purpose: 'annotation',
          strike: g.strike ? p.id : undefined, ttl: 300, source: a.id,
        }, rule);
      } else if ('reveal' in g) {
        if (!this.h.visible.has(g.reveal)) this.h.reveal(g.reveal, d, rule, 'emerge', 8);
        const r = PHRASE_BY_ID.get(g.reveal);
        if (g.link && r && r.surface === p.surface) this.h.queue(d + 2, { type: 'link', a: p.id, b: r.id, ttl: 60 }, rule);
      } else if ('sound' in g) {
        const pos: VoicePosition = g.sound === 'chair-creak' ? { kind: 'chair' } : beyond();
        // A sound in a meeting is an event of its own: it keeps its distance from voices.
        this.h.queue(d, { type: 'sound', kind: g.sound, position: pos, gain: g.gain ?? 0.45 }, rule, { major: true, ttl: 8 });
      } else if ('silence' in g) {
        this.h.queue(d, { type: 'silence', depth: g.silence, seconds: g.seconds }, rule, { priority: 3 });
      } else if ('breath' in g) {
        this.h.fragment(rule, VOICE_FRAGMENT_BY_ID.get(FRAGMENT_IDS.breath)!, { kind: g.breath }, d, 0.4);
      }
    }
  }
}
