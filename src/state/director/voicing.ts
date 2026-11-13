import { PHRASES, PHRASE_BY_ID } from '../../content/phrases';
import { ARCS } from '../../content/encounters';
import { FRAGMENT_IDS, PHRASE_IDS } from '../../content/ids';
import { STAY_WORDS, type VoiceFragment } from '../../content/relations';
import { WALLS, type Motif, type Phrase } from '../../content/types';
import { VOICE_FRAGMENT_BY_ID } from '../../content/relations';
import type { VoicePosition } from '../cues';
import type { VoiceKind } from '../../content/types';
import { phaseAtLeast } from '../Phase';
import { performancesFor, pickReadings } from '../performance';
import { isSituation } from '../rules';
import type { RuleHost } from './host';

/** Lines with several directed readings, kept for their own meetings and a second hearing. */
const KEPT_READINGS = new Set([PHRASE_IDS.stay, 'love-go-away', 'happy-then']);

/** What the voices need to know of the heart, the way out and the opening. */
export interface VoicingLink {
  /** The north wall is held for the heart's answer. */
  northKept(): boolean;
  /** "Stay" and its answers are never said near the way out. */
  refusesStayWords(): boolean;
  /** The old arrival (the walls already written). */
  legacy: boolean;
}

/**
 * The room's voices: whether it declines to say a line now, which recorded reading is cast, the
 * voices prompted by what the visitor does (attention, a second hearing), and the replies owed to
 * the patterns the room has noticed (motifs).
 */
export class Voicing {
  constructor(
    private readonly h: RuleHost,
    private readonly link: VoicingLink,
  ) {}

  /** A voice that was decided on but never sounded: it was not heard, so the next hearing may be the same reading. */
  forget(phraseId: string): void {
    this.heard.delete(phraseId);
  }

  /** Which recorded reading of each line has been heard, so a second hearing can be a different one. */
  private heard = new Map<string, string>();
  private reheard = false;

  /** The hesitation motif's reply, declined when it formed and still owed. */
  private hesitationOwed = false;
  private attentionVoices = 0;

  private readsUnanswered = 0;
  private readArmedUntil = -Infinity;

  private readArmedFor: string | null = null;
  private longLookAt: string | null = null;

  private lastAttentionVoice = -Infinity;
  private prevGaze: { id: string | null; held: number } = { id: null, held: 0 };

  /**
   * Whether the room declines to say this now. A refused voice queues nothing, so nothing may be
   * counted for it: callers that commit state around a voice ask first, or use what `voice` returns.
   */
  voiceRefused(rule: string, phraseId?: string, finish = false): boolean {
    // Never "stay" near the way out: not as it appears, nor while they touch it (it would be a plea).
    if (phraseId && STAY_WORDS.has(phraseId) && this.link.refusesStayWords()) return true;
    if (phraseId && !finish && this.h.withheld().includes(phraseId)) return true;
    // The memory's line has just been written for the visitor to stay with: the room doesn't
    // talk over it (authored situations and a finished line aside).
    if (this.h.now < this.h.shared.memoryQuietUntil && !finish && !isSituation(rule)) return true;
    // Nothing talks over a living memory (a finished line aside; nothing at all over one with voices of its own).
    if (this.h.scenes.active && (!finish || this.h.vignettePlaying)) return true;
    // A vignette's line is its own: the room doesn't say it first.
    return !!phraseId && !finish && this.h.scenes.claimsVoice(phraseId);
  }

  /** Queues the voice; false when the room declined to speak (nothing was queued or counted). */
  voice(
    rule: string,
    delay: number,
    kind: VoiceKind,
    text: string | null,
    caption: string,
    position: VoicePosition,
    extra: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number; finish?: boolean } = {},
  ): boolean {
    if (this.voiceRefused(rule, extra.phraseId, extra.finish)) return false;
    // A phrase with recorded performances: the one directed for this moment (heard before: the reading furthest from it).
    const ranked = extra.phraseId && kind !== 'laugh' && kind !== 'murmur' && kind !== 'breath' && kind !== 'hum'
      ? pickReadings(extra.phraseId, this.h.field.v, kind, this.heard.get(extra.phraseId))
      : [];
    if (ranked.length && extra.phraseId) this.heard.set(extra.phraseId, ranked[0].id);
    // Sometimes what is said writes itself where it belongs, as it is heard — not always: some
    // voices leave a mark, most leave nothing at all.
    // (Never onto the north wall while the heart holds it: the voice is heard, nothing is written.)
    const writes = !extra.finish && !!extra.phraseId && ranked.length > 0 && !this.h.visible.has(extra.phraseId) && !this.link.legacy && !(this.link.northKept() && PHRASE_BY_ID.get(extra.phraseId)?.surface === 'north') && this.h.rng.chance(0.35);
    if (writes) {
      this.h.ledger.accumulating.add(extra.phraseId!);
      this.h.visible.set(extra.phraseId!, { mode: 'shown', since: this.h.now + delay, base: true });
      this.h.memory.surfaced.set(extra.phraseId!, this.h.now + delay);
    }
    this.h.queue(
      delay,
      {
        type: 'voice', kind, text, caption, position, gain: extra.gain ?? 0.8, assetId: extra.assetId, phraseId: extra.phraseId,
        // Anticipation: the room holds its breath a moment before someone speaks.
        ...(ranked.length ? { performance: ranked[0].id, performances: ranked.map((p) => p.file), ...(position.kind !== 'beyond' ? { lead: 1.3 } : {}) } : {}),
        ...(writes ? { write: true } : {}),
        ...(extra.finish ? { finish: true } : {}),
      },
      rule,
      { major: true, ttl: extra.ttl ?? 20, priority: extra.priority ?? 1 },
    );
    return true;
  }

  /** Says a phrase; only a voice that was queued is counted as spoken. */
  speakPhrase(rule: string, p: Phrase, position: VoicePosition, delay = 0, styleOverride?: Phrase['voice'], gain = 0.8): boolean {
    const style = styleOverride ?? p.voice ?? 'whisper';
    if (!this.voice(rule, delay, style, p.text, p.text, position, { phraseId: p.id, gain })) return false;
    this.h.memory.spoken.set(p.id, this.h.now + delay);
    return true;
  }

  fragment(rule: string, f: VoiceFragment, position: VoicePosition, delay = 0, gain = 0.6) {
    if (position.kind === 'chair' && this.h.situations.claimed('chair-voice') && !isSituation(rule)) return;
    // Sounds that belong to an authored situation are not used as generic texture.
    if (this.h.owned.has(f.id) && !isSituation(rule)) return;
    if (position.kind === 'beyond' && this.h.situations.claimed('beyond')) return;
    const kind = f.kind === 'speech' ? 'distant' : f.kind;
    this.voice(rule, delay, kind, f.kind === 'speech' ? f.caption : null, f.caption, position, { assetId: f.id, gain });
  }

  /**
   * Voices, prompted by what the visitor does — never by the clock. When someone turns away
   * from a line they held for a while, comes back to one, or steps away from the chair,
   * sometimes (not usually) a line connected to it is said: its echo or its contradiction,
   * from where that writing is, or from beyond a wall. The three central lines, with several readings each,
   * are kept for their own meetings and for a second hearing.
   */
  attention() {
    const v = this.h.visitor;
    const now = this.h.now;
    // What just happened.
    let source: string | null = null;
    if (this.prevGaze.id && v.gazeId !== this.prevGaze.id && this.prevGaze.held >= 4.5) source = this.prevGaze.id;
    const ret = this.h.engagement.fresh.find((x) => x.kind === 'return');
    if (ret?.id) source = ret.id;
    if (!source && v.lastWithdrawAt === now && v.readOrder.length) source = v.readOrder[v.readOrder.length - 1];
    // Someone reading line after line with nothing answering, or resting on one line a long
    // time: the room may speak to it. The chance is taken once; if the room is busy at that
    // moment, it waits a little for room to speak.
    const reads = this.h.engagement.fresh.filter((x) => x.kind === 'read' || x.kind === 'tap');
    if (reads.length) this.readsUnanswered += reads.length;
    const longLook = !!v.gazeId && v.gazeFor >= 12 && this.longLookAt !== v.gazeId;
    if (longLook) this.longLookAt = v.gazeId;
    if (!source && ((this.readsUnanswered >= 3 && reads.length) || longLook) && now >= this.readArmedUntil) {
      // Once, early, it always does: the first sign that attention is heard.
      if (this.attentionVoices === 0 || this.h.rng.chance(0.4)) this.readArmedUntil = now + 20;
      this.readArmedFor = (longLook ? v.gazeId : reads[reads.length - 1]?.id) ?? null;
    }
    let certain = false;
    if (!source && now < this.readArmedUntil && this.readArmedFor) {
      source = this.readArmedFor;
      certain = true;
    }
    this.prevGaze = { id: v.gazeId, held: v.gazeFor };
    if (!source || this.h.phase === 'arrival') return;
    if (now - this.lastAttentionVoice < 70 || (now < 300 && this.attentionVoices >= 4)) return;
    if (!this.h.scheduler.majorFree(now) || !this.h.pacing.intenseFree(now) || this.h.pacing.repeats('voice', now, 20) || this.h.attending() || this.h.pacing.holding(now)) return;
    if (!certain && !this.h.rng.chance(0.4)) return;
    const p = PHRASE_BY_ID.get(source);
    if (!p) return;
    const ok = (x: Phrase | undefined): x is Phrase =>
      !!x && !!x.voice && !ARCS[x.id] && !KEPT_READINGS.has(x.id) && !this.h.memory.spoken.has(x.id) && !this.h.withheld().includes(x.id) && (x.tier !== 'transform' || this.h.phase === 'transform');
    const cands = [...(p.contradicts ?? []), ...(p.echoes ?? [])].map((r) => PHRASE_BY_ID.get(r)).filter(ok);
    // A recorded line is preferred: if nothing related has a recording, something else from
    // the same wall that does; failing that, whatever is related.
    if (!cands.some((x) => performancesFor(x.id).length)) {
      const sameWall = PHRASES.filter((x) => x.surface === p.surface && x.id !== p.id && ok(x) && performancesFor(x.id).length);
      if (sameWall.length) cands.unshift(sameWall[this.h.rng.int(0, sameWall.length - 1)]);
    }
    cands.sort((a, b) => Math.sign(performancesFor(b.id).length) - Math.sign(performancesFor(a.id).length));
    const q = cands[0];
    if (!q) return;
    const pos: VoicePosition = this.h.visible.has(q.id) ? { kind: 'surface', phraseId: q.id } : { kind: 'beyond', surface: q.surface === this.h.facing ? this.h.rng.pick(WALLS.filter((w) => w !== this.h.facing)) : q.surface };
    // Only a voice that sounds spends the room's one answer to this attention.
    if (!this.speakPhrase('voice-attention', q, pos, 0.8, undefined, 0.6)) return;
    this.lastAttentionVoice = now;
    this.attentionVoices++;
    this.readsUnanswered = 0;
    this.readArmedUntil = -Infinity;
  }

  /**
   * Once in a visit, late, a line already heard comes back in a different reading, from
   * somewhere else: the same words, a different person, a different meaning.
   */
  rehear() {
    if (this.reheard || !phaseAtLeast(this.h.phase, 'contradiction')) return;
    const now = this.h.now;
    if (this.h.pacing.sinceDev(now) < 10 || !this.h.scheduler.majorFree(now) || !this.h.pacing.intenseFree(now) || this.h.attending() || this.h.pacing.holding(now)) return;
    const id = [...this.heard.keys()].find((x) => performancesFor(x).length > 1 && now - (this.h.memory.spoken.get(x) ?? now) > 60);
    const p = id ? PHRASE_BY_ID.get(id) : undefined;
    if (!p) return;
    const pos: VoicePosition = this.h.visitor.near ? { kind: 'beyond', surface: this.h.rng.pick(WALLS) } : { kind: 'chair' };
    if (this.speakPhrase('rehear', p, pos, 0.5, undefined, 0.6)) this.reheard = true;
  }

  payHesitation() {
    const p = PHRASE_BY_ID.get(PHRASE_IDS.ifCloser);
    if (!this.hesitationOwed || !p) return;
    if (this.speakPhrase('motif-hesitation', p, { kind: 'chair' }, 8, 'whisper', 0.6)) this.hesitationOwed = false;
  }

  onMotif(m: Motif) {
    switch (m) {
      case 'hesitation':
        // Motifs form once: a reply the room declined to say is owed, and said when it can be.
        this.hesitationOwed = true;
        this.payHesitation();
        break;
      case 'stillness':
        this.h.reveal(PHRASE_IDS.dontHaveSay, this.h.pacing.repeats('voice', this.h.now, 20) ? 20 : 2, 'motif-stillness', this.h.visitor.stillFor > 3 ? 'still' : 'emerge', 10);
        break;
      case 'warmth':
        this.fragment('motif-warmth', VOICE_FRAGMENT_BY_ID.get(FRAGMENT_IDS.laughNextRoom)!, { kind: 'beyond', surface: 'east' }, 3, 0.45);
        break;
      case 'distance':
        this.h.reveal(this.h.rng.chance(0.5) ? PHRASE_IDS.farEnough : PHRASE_IDS.happiestUnneeded, 2, 'motif-distance', 'emerge', 10);
        break;
      case 'wandering':
        this.fragment('motif-wandering', VOICE_FRAGMENT_BY_ID.get(FRAGMENT_IDS.twoVoices)!, { kind: 'beyond', surface: this.h.rng.pick(WALLS) }, 6, 0.35);
        break;
      default:
        break;
    }
  }
}
