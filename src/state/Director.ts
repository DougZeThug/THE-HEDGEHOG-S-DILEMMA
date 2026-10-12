import { Rng } from '../core/rng';
import { EventScheduler } from '../core/scheduler';
import { clamp, smoothstep } from '../core/math';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import { DEPARTURE_LINES, RECONTEXTS, VOICE_FRAGMENTS, type VoiceFragment } from '../content/relations';
import type { Phase, Phrase, Surface } from '../content/types';
import { VisitorModel, type VisitorInput } from './VisitorModel';
import { Memory, warmthOf, type Motif } from './Memory';
import { EmotionalField } from './EmotionalField';
import { PhaseTracker } from './Phase';
import { PhraseSelector, type SelectContext, type SelectQuery } from './PhraseSelector';
import type { Cue, TimedCue, VoiceKind, VoicePosition } from './cues';
import type { Interpretation } from '../interpret/schema';

/** Continuous environment targets, recomputed every tick from the field. */
export interface Environment {
  lightIntensity: number;
  /** -1 cool … +1 warm */
  lightWarmth: number;
  /** Radians the key light (and so the chair's shadow) has drifted from where it should be. */
  shadowDrift: number;
  /** 1 = room as built; >1 walls further away. */
  roomScale: number;
  /** 0..1, near-black at emotional extremes and at departure. */
  darkness: number;
  /** Clarity of the writing. */
  textContrast: number;
  /** Local warm glow around the chair. */
  chairGlow: number;
  saturation: number;
  // audio
  hum: number;
  vent: number;
  outside: number;
  drone: number;
  droneBrightness: number;
  reverb: number;
}

export interface VisibleState {
  mode: 'shown' | 'still';
  since: number;
  /** Shown from the start (arrival tier) — never culled. */
  base: boolean;
}

export interface DirectorOptions {
  seed: number;
  visits?: number;
}

const SURFACES: Surface[] = ['north', 'east', 'south', 'west'];

export class Director {
  readonly visitor = new VisitorModel();
  readonly memory = new Memory();
  readonly field = new EmotionalField();
  readonly phaseTracker = new PhaseTracker();
  readonly selector = new PhraseSelector();
  readonly scheduler = new EventScheduler<{ cue: Cue; rule: string }>(7);
  readonly rng: Rng;
  readonly visible = new Map<string, VisibleState>();
  readonly log: TimedCue[] = [];
  env: Environment;
  visits: number;
  departing = false;

  private facing: Surface = 'north';
  private annotationsUsed = new Set<string>();
  private recontextsUsed = new Set<string>();
  private relationsShown = new Set<string>();
  private spokenFirstApproach = false;
  private stillStage = 0;
  private lastSeenWithdraw = -Infinity;
  private chairNudges = 0;
  private kneelVoiced = false;
  private exposedSince = -1;
  private contributionCount = 0;
  private nextDistantLife = 70;

  constructor(opts: DirectorOptions) {
    this.rng = new Rng(opts.seed);
    this.visits = opts.visits ?? 1;
    for (const p of PHRASES) if (p.tier === 'arrival' || p.tier === 'near') this.visible.set(p.id, { mode: 'shown', since: 0, base: true });
    this.env = this.computeEnv();
    // Returning visitors find a room that remembers being visited.
    if (this.visits > 1) {
      this.reveal('remember-me', 20, 'return', 'emerge', 10);
      if (this.visits > 2) this.queue(30, { type: 'chairNudge', dx: 0.05, dz: -0.03, dyaw: 0.12 }, 'return');
    }
  }

  get phase(): Phase {
    return this.phaseTracker.phase;
  }
  get now(): number {
    return this.visitor.t;
  }

  private ctx(): SelectContext {
    return {
      field: this.field.v,
      phase: this.phase,
      memory: this.memory,
      now: this.now,
      recentRead: this.visitor.readOrder,
      rng: this.rng,
    };
  }

  private queue(delay: number, cue: Cue, rule: string, opts: { major?: boolean; key?: string; ttl?: number; priority?: number } = {}) {
    this.scheduler.schedule(this.now + delay, { cue, rule }, opts);
  }

  private reveal(id: string, delay: number, rule: string, mode: 'emerge' | 'still' = 'emerge', seconds = 9) {
    const p = PHRASE_BY_ID.get(id);
    if (!p || p.tier === 'annotation') return;
    this.queue(delay, { type: 'reveal', phraseId: id, mode, seconds }, rule, { key: `reveal:${id}` });
  }

  private voice(
    rule: string,
    delay: number,
    kind: VoiceKind,
    text: string | null,
    caption: string,
    position: VoicePosition,
    extra: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number } = {},
  ) {
    this.queue(
      delay,
      { type: 'voice', kind, text, caption, position, gain: extra.gain ?? 0.8, assetId: extra.assetId, phraseId: extra.phraseId },
      rule,
      { major: true, ttl: extra.ttl ?? 20, priority: extra.priority ?? 1 },
    );
  }

  private speakPhrase(rule: string, p: Phrase, position: VoicePosition, delay = 0, styleOverride?: Phrase['voice'], gain = 0.8) {
    const style = styleOverride ?? p.voice ?? 'whisper';
    this.voice(rule, delay, style, p.text, p.text, position, { phraseId: p.id, gain });
    this.memory.spoken.set(p.id, this.now + delay);
  }

  private fragment(rule: string, f: VoiceFragment, position: VoicePosition, delay = 0, gain = 0.6) {
    const kind = f.kind === 'speech' ? 'distant' : f.kind;
    this.voice(rule, delay, kind, f.kind === 'speech' ? f.caption : null, f.caption, position, { assetId: f.id, gain });
  }

  // ───────────────────────────── tick ─────────────────────────────

  tick(dt: number, input: VisitorInput, facing: Surface): TimedCue[] {
    this.facing = facing;
    const v = this.visitor;
    v.update(dt, input);
    const formed = this.memory.update(v, dt);
    const phaseChanged = this.phaseTracker.update(v, this.memory);
    this.field.update(dt, v, this.memory, this.phase);

    if (!this.departing) {
      for (const m of formed) this.onMotif(m);
      if (phaseChanged) this.onPhase(phaseChanged);
      this.ruleDriftReveal();
      this.ruleStillness();
      this.ruleApproach();
      this.ruleWithdraw();
      this.ruleGaze();
      this.ruleWarmResurface();
      this.ruleMusic();
      this.ruleRecontext();
      this.ruleDistantLife();
      this.ruleDeflect();
      this.ruleKneel();
      this.ruleChairNudge(input);
    }

    this.env = this.computeEnv();

    const out: TimedCue[] = [];
    for (const { cue, rule } of this.scheduler.tick(this.now)) {
      if (!this.accept(cue)) continue;
      const tc = { t: +this.now.toFixed(2), cue, rule };
      out.push(tc);
      this.log.push(tc);
      if (this.log.length > 400) this.log.shift();
    }
    return out;
  }

  /** Keep the Director's model of what is visible in sync with the cues it lets through. */
  private accept(cue: Cue): boolean {
    if (cue.type === 'reveal') {
      const cur = this.visible.get(cue.phraseId);
      if (cur && cur.mode === 'shown') return false;
      if (cue.mode === 'still' && this.visitor.stillFor < 2) return false;
      this.visible.set(cue.phraseId, { mode: cue.mode === 'still' ? 'still' : 'shown', since: this.now, base: false });
      this.memory.surfaced.set(cue.phraseId, this.now);
      this.cull();
    } else if (cue.type === 'hide') {
      const cur = this.visible.get(cue.phraseId);
      if (!cur || cur.base) return false;
      this.visible.delete(cue.phraseId);
    }
    return true;
  }

  private budget(): number {
    return { arrival: 0, familiar: 10, contradiction: 18, transform: 26 }[this.phase];
  }

  private cull() {
    const revealed = [...this.visible.entries()].filter(([, s]) => !s.base && s.mode === 'shown');
    const over = revealed.length - this.budget();
    if (over <= 0) return;
    revealed.sort((a, b) => a[1].since - b[1].since);
    for (const [id] of revealed.slice(0, over)) {
      if (id === this.visitor.gazeId) continue;
      this.queue(0.5, { type: 'hide', phraseId: id, seconds: 14 }, 'cull');
    }
  }

  // ───────────────────────────── rules ─────────────────────────────

  /** Phrases kept for particular moments; they never just drift onto the walls. */
  static readonly RESERVED = new Set(['thank-staying', 'moving-chair', 'glad-came', 'dont-have-say']);

  private hiddenExcluding(): Set<string> {
    return new Set([...this.visible.keys(), ...Director.RESERVED]);
  }

  /** The walls slowly offer more writing as the visit goes on. */
  private ruleDriftReveal() {
    const gap = { arrival: 26, familiar: 19, contradiction: 16, transform: 18 }[this.phase];
    if (this.now < 18 || !this.scheduler.ready('drift', this.now, gap)) return;
    if (this.phase === 'arrival' && this.now < 30) return;
    this.scheduler.mark('drift', this.now);
    const towardFacing = this.rng.chance(0.65);
    const surfaces = towardFacing ? [this.facing] : SURFACES.filter((s) => s !== this.facing);
    const q: SelectQuery = { exclude: this.hiddenExcluding(), surfaces, contrast: this.phase === 'contradiction' ? 0.35 : 0.15 };
    let p = this.selector.select(this.ctx(), q);
    if (!p) p = this.selector.select(this.ctx(), { exclude: this.hiddenExcluding() });
    if (p) this.reveal(p.id, 0, 'drift', 'emerge', this.rng.range(8, 14));
  }

  /** Stillness is never empty: it thins the room and lets hidden things through. */
  private ruleStillness() {
    const v = this.visitor;
    const s = v.deepStillFor;
    if (v.stillFor === 0 && this.stillStage > 0) {
      this.stillStage = 0;
      for (const [id, st] of this.visible) if (st.mode === 'still') this.queue(0, { type: 'hide', phraseId: id, seconds: 2.5 }, 'still-break');
      this.scheduler.cancelWhere((e) => e.rule.startsWith('still'));
      return;
    }
    if (s > 9 && this.stillStage < 1) {
      this.stillStage = 1;
      const p = this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding(), surfaces: [this.facing] }) ??
        this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding() });
      if (p) this.reveal(p.id, 0, 'still-1', 'still', 7);
    }
    if (s > 22 && this.stillStage < 2) {
      this.stillStage = 2;
      const p = this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding() });
      if (p) this.reveal(p.id, 0, 'still-2', 'still', 9);
      // A voice from nowhere drifts in towards the chair.
      const sp = this.selector.select(this.ctx(), {
        voiced: true,
        tiers: ['still', 'arrival', 'familiar', ...(this.phase === 'arrival' ? [] : (['contradiction'] as const))],
        bias: (x) => (this.memory.spoken.has(x.id) ? -0.6 : 0) + (x.tier === 'still' ? 0.25 : 0),
      });
      if (sp && this.scheduler.ready('still-voice', this.now, 70)) {
        this.scheduler.mark('still-voice', this.now);
        this.speakPhrase('still-voice', sp, { kind: 'approach' }, 2, 'whisper', 0.7);
      }
    }
    if (s > 42 && this.stillStage < 3) {
      this.stillStage = 3;
      this.queue(0, { type: 'silence', depth: 0.85, seconds: 26 }, 'still-silence', { major: true, ttl: 30 });
      if (this.memory.warmMemories.length && this.rng.chance(0.6)) {
        this.fragment('still-hum', VOICE_FRAGMENTS.find((f) => f.id === 'vf-hum')!, { kind: 'beyond', surface: 'east' }, 16, 0.45);
      }
    }
    if (s > 75 && this.stillStage < 4) {
      this.stillStage = 4;
      if (this.scheduler.ready('music', this.now, 40)) {
        this.scheduler.mark('music', this.now);
        this.queue(0, { type: 'music', mood: 'sparse', notes: 4, truncate: true }, 'still-music', { major: true, ttl: 40 });
      }
      const p = this.selector.select(this.ctx(), { tiers: ['still', 'transform'], exclude: this.hiddenExcluding() });
      if (p) this.reveal(p.id, 6, 'still-4', 'still', 12);
    }
  }

  /** Coming close to the chair. */
  private ruleApproach() {
    const v = this.visitor;
    if (!v.near) {
      this.exposedSince = -1;
      return;
    }
    if (!this.spokenFirstApproach && v.nearFor > 1.5) {
      this.spokenFirstApproach = true;
      // The first approach is met with something small and close: breath, or a child's phrase.
      if (this.rng.chance(0.5)) this.fragment('first-approach', VOICE_FRAGMENTS.find((f) => f.id === 'vf-breath')!, { kind: 'chair' }, 1.5, 0.5);
      else this.speakPhrase('first-approach', PHRASE_BY_ID.get('used-to-fit')!, { kind: 'chair' }, 2, 'child', 0.55);
      this.queue(0, { type: 'flash', kind: 'warm', amount: 0.25, seconds: 6 }, 'first-approach');
      return;
    }
    const f = this.field.v;
    if (f.exposure > f.warmth + 0.08) {
      if (this.exposedSince < 0) this.exposedSince = this.now;
    } else this.exposedSince = -1;

    if (v.nearFor > 13 && this.scheduler.ready('near-dwell', this.now, 48)) {
      this.scheduler.mark('near-dwell', this.now);
      const exposed = f.exposure > f.warmth + 0.05;
      if (exposed) {
        // Closeness as pressure: an affectionate line, spoken flatly, from behind.
        const p = this.selector.select(this.ctx(), {
          voiced: true,
          tiers: ['arrival', 'familiar', 'contradiction', ...(this.phase === 'transform' ? (['transform'] as const) : [])],
          bias: (x) => ((x.dims.fear ?? 0) + (x.dims.affection ?? 0) * 0.8 + (x.dims.contradiction ?? 0) * 0.5) * 0.4 - (this.memory.spoken.has(x.id) ? 0.5 : 0),
        });
        if (p) this.speakPhrase('near-exposed', p, { kind: 'behind' }, 0, 'flat', 0.7);
        this.queue(0, { type: 'flash', kind: 'cold', amount: 0.35, seconds: 10 }, 'near-exposed');
      } else {
        // Closeness as company.
        const p = this.selector.select(this.ctx(), {
          voiced: true,
          tiers: ['arrival', 'near', 'familiar', 'still', ...(this.phase === 'transform' ? (['transform'] as const) : [])],
          bias: (x) => warmthOf(x.dims) * 0.3 + (x.dims.connection ?? 0) * 0.3 - (this.memory.spoken.has(x.id) ? 0.5 : 0),
        });
        if (p) this.speakPhrase('near-warm', p, { kind: 'chair' }, 0, p.voice === 'flat' ? 'tender' : p.voice, 0.75);
      }
    }
    // A very long, settled closeness late in the visit.
    if (v.nearFor > 60 && this.phase !== 'arrival' && !this.annotationsUsed.has('thank-staying')) {
      this.annotationsUsed.add('thank-staying');
      this.reveal('thank-staying', 0, 'long-near', 'emerge', 14);
    }
  }

  /** Stepping back. */
  private ruleWithdraw() {
    const v = this.visitor;
    if (v.lastWithdrawAt <= this.lastSeenWithdraw) return;
    this.lastSeenWithdraw = v.lastWithdrawAt;
    if (!this.scheduler.ready('withdraw', this.now, 25)) return;
    this.scheduler.mark('withdraw', this.now);
    const f = this.field.v;
    if (this.memory.strength.hesitation > 0.5) {
      const p = this.selector.select(this.ctx(), {
        exclude: this.hiddenExcluding(),
        tiers: ['familiar', 'contradiction', 'arrival'],
        bias: (x) => ((x.keywords ?? []).some((k) => /stay|close|leave|come/.test(k)) ? 0.5 : 0),
      });
      if (p) this.reveal(p.id, 1, 'withdraw-hesitant', 'emerge', 6);
    } else if (f.relief > 0.3) {
      const p = this.selector.select(this.ctx(), {
        exclude: this.hiddenExcluding(),
        surfaces: [this.facing],
        bias: (x) => (x.dims.relief ?? 0) * 0.5,
      });
      if (p) this.reveal(p.id, 1.5, 'withdraw-relief', 'emerge', 8);
    }
  }

  /** Attention: holding a phrase in view lets its relations come forward. */
  private ruleGaze() {
    const v = this.visitor;
    const id = v.gazeId;
    if (!id || v.gazeFor < 5 || !this.scheduler.ready('gaze-relate', this.now, 11)) return;
    const p = PHRASE_BY_ID.get(id);
    if (!p || this.relationsShown.has(id)) return;
    const late = this.phase === 'contradiction' || this.phase === 'transform';
    const pool = late ? [...(p.contradicts ?? []), ...(p.echoes ?? [])] : [...(p.echoes ?? []), ...(this.phase !== 'arrival' ? p.contradicts ?? [] : [])];
    const candidates = pool.map((r) => PHRASE_BY_ID.get(r)).filter((x): x is Phrase => !!x && (x.tier !== 'transform' || this.phase === 'transform'));
    if (!candidates.length) {
      this.relationsShown.add(id);
      return;
    }
    this.scheduler.mark('gaze-relate', this.now);
    this.relationsShown.add(id);
    const r = candidates[0];
    const contradicting = (p.contradicts ?? []).includes(r.id) || (r.contradicts ?? []).includes(id);
    const rVisible = this.visible.has(r.id);
    if (r.tier === 'annotation' || (!rVisible && r.surface !== p.surface) || (contradicting && late && this.rng.chance(0.5))) {
      // Written beside it, in another hand — like somebody answered.
      this.queue(0.5, {
        type: 'write', key: `ann:${id}:${r.id}`, text: r.text, hand: r.tier === 'annotation' ? r.hand : this.rng.pick(['pencil', 'faint', 'cyan'] as const),
        size: 'xs', beside: id, purpose: 'annotation', strike: contradicting && this.rng.chance(0.4) ? id : undefined, ttl: 75,
      }, 'gaze-annotate');
    } else {
      if (!rVisible) this.reveal(r.id, 0.5, 'gaze-reveal', 'emerge', 7);
      if (r.surface === p.surface) this.queue(2, { type: 'link', a: id, b: r.id, ttl: 40 }, 'gaze-link');
    }
    // Sometimes the phrase is spoken — and late in the visit, not in the voice it was written in.
    if (p.voice && this.rng.chance(late ? 0.45 : 0.3) && !this.memory.spoken.has(p.id)) {
      const style = late && contradicting ? (p.voice === 'flat' ? 'tender' : 'flat') : p.voice;
      const pos: VoicePosition = late && this.rng.chance(0.5) ? { kind: 'behind' } : { kind: 'surface', phraseId: p.id };
      this.speakPhrase('gaze-voice', p, pos, 3, style, 0.65);
    }
  }

  /** Warm memories return when the visitor is far away. */
  private ruleWarmResurface() {
    const f = this.field.v;
    const mem = this.memory;
    if (!mem.warmMemories.length || f.solitude < 0.45 || this.visitor.distance < 2.2) return;
    if (!this.scheduler.ready('resurface', this.now, 85)) return;
    this.scheduler.mark('resurface', this.now);
    const id = mem.warmMemories[this.rng.int(0, mem.warmMemories.length - 1)];
    const p = PHRASE_BY_ID.get(id)!;
    this.queue(0, {
      type: 'write', key: `recall:${id}:${Math.round(this.now)}`, text: p.text, hand: 'cyan', size: 'xs', surface: this.facing, purpose: 'recall', ttl: 60,
    }, 'resurface');
    const f2 = this.rng.chance(0.5) ? 'vf-laugh-next-room' : 'vf-hum';
    this.fragment('resurface', VOICE_FRAGMENTS.find((x) => x.id === f2)!, { kind: 'beyond', surface: this.rng.pick(SURFACES) }, 4, 0.45);
  }

  /** Music arrives sometimes, and sometimes leaves before it resolves. */
  private ruleMusic() {
    const f = this.field.v;
    const gap = { arrival: 9999, familiar: 120, contradiction: 95, transform: 80 }[this.phase];
    if (!this.scheduler.ready('music', this.now, gap) || this.now < 75) return;
    const pressure = Math.max(f.warmth, f.reminiscence * 1.1, f.dissonance, f.hush * 0.9);
    if (pressure < 0.42) return;
    this.scheduler.mark('music', this.now);
    let mood: 'warm' | 'tender' | 'uneasy' | 'sparse' | 'memory' = 'sparse';
    if (f.dissonance > 0.45 && f.exposure > 0.25) mood = 'uneasy';
    else if (f.reminiscence > 0.4) mood = 'memory';
    else if (f.warmth > 0.45) mood = this.rng.chance(0.5) ? 'warm' : 'tender';
    this.queue(0, { type: 'music', mood, notes: this.rng.int(4, 9), truncate: this.rng.chance(0.4) }, 'music', { major: true, ttl: 30 });
  }

  /** Late: something already read is written again elsewhere, beside something that changes it. */
  private ruleRecontext() {
    if (this.phase !== 'transform' || !this.scheduler.ready('recontext', this.now, 42)) return;
    const options = RECONTEXTS.filter((r) => !this.recontextsUsed.has(r.id) && this.visitor.read.has(r.phrase));
    if (!options.length) return;
    this.scheduler.mark('recontext', this.now);
    const r = options[0];
    this.recontextsUsed.add(r.id);
    if (!this.visible.has(r.beside)) this.reveal(r.beside, 0, 'recontext', 'emerge', 8);
    this.queue(6, {
      type: 'write', key: `rc:${r.id}`, text: PHRASE_BY_ID.get(r.phrase)!.text, hand: r.hand, size: 'xs', beside: r.beside, purpose: 'recontext', ttl: 120,
    }, 'recontext');
  }

  /** Life elsewhere: muffled laughter, two people talking, someone humming. */
  private ruleDistantLife() {
    if (this.phase === 'arrival' || this.now < this.nextDistantLife) return;
    this.nextDistantLife = this.now + this.rng.range(70, 130);
    const ctx = this.ctx();
    const weights = VOICE_FRAGMENTS.filter((f) => f.kind !== 'breath').map((f) => {
      const pull: Record<string, number> = {
        happiness: ctx.field.warmth + ctx.field.reminiscence, connection: ctx.field.solitude, isolation: ctx.field.solitude,
        nostalgia: ctx.field.reminiscence, misunderstanding: ctx.field.dissonance, affection: ctx.field.warmth,
      };
      let s = 0;
      for (const [k, w] of Object.entries(f.dims)) s += (w ?? 0) * (pull[k] ?? 0.2);
      return { f, s: s + 0.1 };
    });
    const i = this.rng.weighted(weights.map((x) => x.s));
    if (i < 0) return;
    const frag = weights[i].f;
    const wall = this.rng.pick(SURFACES.filter((s) => s !== this.facing));
    this.fragment('distant-life', frag, { kind: 'beyond', surface: wall }, 0, 0.4);
  }

  /** People deflect. When the room gets tense, something small and absurd appears. */
  private ruleDeflect() {
    const f = this.field.v;
    if (f.tension < 0.45 || this.phase === 'arrival' || !this.scheduler.ready('deflect', this.now, 70)) return;
    this.scheduler.mark('deflect', this.now);
    const p = this.selector.select(this.ctx(), {
      exclude: this.hiddenExcluding(),
      pool: PHRASES.filter((x) => ['soup', 'angry-cake', 'practise', 'biscuit', 'board-games', 'cereal', 'you-were-right'].includes(x.id)),
      tiers: ['arrival', 'familiar', 'contradiction'],
    });
    if (p) this.reveal(p.id, 0, 'deflect', 'emerge', 6);
  }

  private ruleKneel() {
    const v = this.visitor;
    if (!v.kneeling || this.kneelVoiced || v.kneelTime < 4) return;
    this.kneelVoiced = true;
    this.speakPhrase('kneel', PHRASE_BY_ID.get(this.rng.chance(0.5) ? 'used-to-fit' : 'small-minute')!, { kind: 'chair' }, 0, 'child', 0.5);
  }

  /** Late, while nobody is looking, the chair is not quite where it was. */
  private ruleChairNudge(input: VisitorInput) {
    if (this.phase !== 'transform' || this.chairNudges >= 1) return;
    if (input.gazeChair || this.visitor.distance < 2.2 || this.visitor.totalChairGaze < 8) return;
    this.chairNudges++;
    this.queue(0, { type: 'chairNudge', dx: this.rng.range(-0.06, 0.06), dz: this.rng.range(-0.06, 0.06), dyaw: this.rng.range(-0.2, 0.2) }, 'chair-nudge');
    this.reveal('moving-chair', 40, 'chair-nudge', 'emerge', 10);
  }

  private onMotif(m: Motif) {
    switch (m) {
      case 'hesitation':
        this.queue(1, { type: 'write', key: 'ann:hes', text: PHRASE_BY_ID.get('come-back-dont')!.text, hand: 'pencil', size: 'xs', beside: 'stay', purpose: 'annotation', ttl: 140 }, 'motif-hesitation');
        if (PHRASE_BY_ID.get('if-closer')) this.speakPhrase('motif-hesitation', PHRASE_BY_ID.get('if-closer')!, { kind: 'chair' }, 8, 'whisper', 0.6);
        break;
      case 'stillness':
        this.reveal('dont-have-say', 2, 'motif-stillness', this.visitor.stillFor > 3 ? 'still' : 'emerge', 10);
        break;
      case 'warmth':
        this.fragment('motif-warmth', VOICE_FRAGMENTS.find((f) => f.id === 'vf-laugh-next-room')!, { kind: 'beyond', surface: 'east' }, 3, 0.45);
        break;
      case 'distance':
        this.reveal(this.rng.chance(0.5) ? 'far-enough' : 'happiest-unneeded', 2, 'motif-distance', 'emerge', 10);
        break;
      case 'closeness':
        this.queue(0, { type: 'flash', kind: 'warm', amount: 0.3, seconds: 12 }, 'motif-closeness');
        break;
      case 'wandering':
        this.reveal('room-enormous', 2, 'motif-wandering', 'emerge', 10);
        break;
      default:
        break;
    }
  }

  private onPhase(p: Phase) {
    if (p === 'contradiction') {
      // The room's first open contradiction: an annotation on the line the visitor arrived facing.
      this.queue(4, { type: 'write', key: 'ann:afraid', text: PHRASE_BY_ID.get('maybe-wanted')!.text, hand: 'pencil', size: 'xs', beside: 'afraid-leave', purpose: 'annotation', ttl: 160 }, 'phase-contradiction');
      if (!this.visible.has('afraid-leave')) this.reveal('afraid-leave', 0, 'phase-contradiction', 'emerge', 6);
    }
    if (p === 'transform') {
      this.queue(2, { type: 'silence', depth: 0.7, seconds: 14 }, 'phase-transform', { major: true, ttl: 30 });
      const late = this.selector.select(this.ctx(), { tiers: ['transform'], exclude: this.hiddenExcluding() });
      if (late) this.reveal(late.id, 10, 'phase-transform', 'emerge', 14);
    }
  }

  // ───────────────────────────── environment ─────────────────────────────

  computeEnv(): Environment {
    const f = this.field.v;
    const m = this.memory.strength;
    const v = this.visitor;
    const late = this.phase === 'transform' ? 1 : this.phase === 'contradiction' ? 0.5 : 0;
    const extreme = smoothstep(0.6, 0.95, f.exposure * 0.6 + f.tension * 0.6);
    return {
      lightIntensity: clamp(0.95 + 0.16 * f.exposure - 0.12 * f.hush - 0.1 * f.solitude * (1 - f.relief) + 0.05 * f.warmth, 0.55, 1.25),
      lightWarmth: clamp(0.65 * f.warmth + 0.45 * f.reminiscence - 0.55 * f.exposure - 0.3 * f.solitude * (1 - f.reminiscence) + 0.2 * f.relief, -1, 1),
      shadowDrift: 0.42 * f.dissonance + 0.5 * m.hesitation + 0.15 * late,
      roomScale: 1 + 0.13 * f.solitude * (0.4 + late) + 0.07 * (v.kneeling ? 1 : 0) + 0.04 * f.hush - 0.04 * f.exposure * late,
      darkness: clamp(0.35 * extreme + 0.18 * smoothstep(40, 120, v.deepStillFor) + (this.departing ? 1 : 0)),
      textContrast: clamp(1 + 0.35 * f.hush - 0.2 * f.tension + 0.1 * f.reminiscence, 0.7, 1.4),
      chairGlow: clamp(0.15 + 0.6 * f.warmth * (1 - f.exposure) + 0.25 * m.closeness),
      saturation: clamp(0.85 + 0.2 * f.warmth + 0.15 * f.reminiscence - 0.3 * f.exposure - 0.2 * f.solitude, 0.45, 1.15),
      hum: clamp(1 - 0.75 * f.hush + 0.2 * f.exposure),
      vent: clamp(0.9 - 0.85 * f.hush),
      outside: clamp(0.25 + 0.5 * f.solitude * (1 - f.hush) + 0.2 * f.relief),
      drone: clamp(0.18 + 0.35 * f.dissonance + 0.3 * f.exposure + 0.2 * f.reminiscence - 0.25 * f.hush),
      droneBrightness: clamp(0.3 + 0.4 * f.warmth - 0.2 * f.solitude + 0.3 * f.tension),
      reverb: clamp(0.35 + 0.4 * (this.env ? this.env.roomScale - 1 : 0) * 4 + 0.2 * f.solitude + 0.15 * (v.kneeling ? 1 : 0)),
    };
  }

  // ───────────────────────────── contributions ─────────────────────────────

  /**
   * A visitor's words become material in the room. The text itself is passed to the
   * world once (to be written on a wall) and is not retained by the Director.
   */
  contribute(text: string, it: Interpretation): void {
    this.contributionCount++;
    this.memory.contributions.push({ dims: it.dims, at: this.now });
    const key = `contrib:${this.contributionCount}`;
    const g = new Set(it.gestures);
    if (g.has('quiet')) this.queue(0, { type: 'silence', depth: 0.55 + 0.25 * it.intensity, seconds: 10 }, 'contribution', { major: true, ttl: 5, priority: 5 });
    if (g.has('writeOnWall')) {
      // Written where the visitor is looking, so they can watch it arrive.
      const surface: Surface = this.facing;
      this.queue(0.5, { type: 'write', key, text, hand: 'visitor', size: text.length > 60 ? 'xs' : 's', surface, purpose: 'contribution', ttl: 0 }, 'contribution');
    }
    if (g.has('revealRelated')) {
      let d = 5;
      for (const id of it.related.slice(0, 2)) {
        const p = PHRASE_BY_ID.get(id);
        if (!p || p.tier === 'annotation') continue;
        if (this.visible.has(id)) {
          if (p.voice && !this.memory.spoken.has(id)) this.speakPhrase('contribution-echo', p, { kind: 'surface', phraseId: id }, d + 6, undefined, 0.55);
        } else this.reveal(id, d, 'contribution', 'emerge', 10);
        d += 7;
      }
    }
    if (g.has('distantRecollection')) {
      const p = it.related.map((id) => PHRASE_BY_ID.get(id)).find((x) => x?.voice && !this.memory.spoken.has(x.id));
      if (p) this.speakPhrase('contribution-recollection', p, { kind: 'beyond', surface: this.rng.pick(SURFACES) }, 14, 'distant', 0.5);
      else this.fragment('contribution-recollection', VOICE_FRAGMENTS.find((f) => f.id === 'vf-two-voices')!, { kind: 'beyond', surface: 'west' }, 14, 0.4);
    }
    if (g.has('rearrange')) {
      const a = it.related[0];
      const b = it.contradictions[0];
      if (a && b) {
        if (!this.visible.has(b)) this.reveal(b, 9, 'contribution-rearrange', 'emerge', 9);
        const pa = PHRASE_BY_ID.get(a);
        const pb = PHRASE_BY_ID.get(b);
        if (pa && pb && pa.surface === pb.surface) this.queue(14, { type: 'link', a, b, ttl: 60 }, 'contribution-rearrange');
        else if (pb) this.queue(14, { type: 'write', key: `${key}:re`, text: pb.text, hand: 'faint', size: 'xs', beside: a, purpose: 'annotation', ttl: 80 }, 'contribution-rearrange');
      }
    }
    if (g.has('temperatureShift')) {
      // Authored asymmetries rather than sentiment colours: grief warms the light (memory),
      // anger cools and hardens it, joy brings a little ache with it, shame makes the room look away.
      const d = it.dims;
      this.field.nudge({
        warmth: 0.25 * (d.grief ?? 0) + 0.15 * (d.affection ?? 0) + 0.1 * (d.happiness ?? 0) - 0.15 * (d.anger ?? 0),
        reminiscence: 0.4 * (d.nostalgia ?? 0) + 0.2 * (d.grief ?? 0) + 0.15 * (d.happiness ?? 0),
        tension: 0.25 * (d.anger ?? 0) + 0.1 * (d.fear ?? 0),
        exposure: -0.2 * (d.shame ?? 0) + 0.1 * (d.affection ?? 0),
        hush: 0.2 * (d.fear ?? 0) + 0.15 * (d.uncertainty ?? 0),
        dissonance: 0.12 * (d.happiness ?? 0) + 0.3 * (d.contradiction ?? 0),
        solitude: 0.2 * (d.isolation ?? 0),
        relief: 0.15 * (d.isolation ?? 0) + 0.2 * (d.forgiveness ?? 0),
      });
    }
    if (g.has('music')) this.queue(20, { type: 'music', mood: 'tender', notes: 5, truncate: false }, 'contribution-music', { major: true, ttl: 40 });
  }

  /** Clears contributions from memory (privacy: "forget what I wrote"). */
  forgetContributions(): void {
    this.memory.contributions = [];
    this.scheduler.cancelWhere((e) => e.rule.startsWith('contribution'));
  }

  // ───────────────────────────── leaving ─────────────────────────────

  departureLine(): string {
    const m = this.memory.dominant() ?? 'default';
    const key = m === 'reading' ? 'wandering' : m;
    const lines = DEPARTURE_LINES[key] ?? DEPARTURE_LINES.default;
    return lines[this.rng.int(0, lines.length - 1)];
  }

  depart(): void {
    this.departing = true;
    this.scheduler.cancelWhere(() => true);
  }

  /** Returning within the same session: the room has kept everything. */
  returnAfterDeparture(): void {
    this.departing = false;
    this.visits++;
    const p = this.selector.select(this.ctx(), {
      exclude: this.hiddenExcluding(),
      tiers: ['familiar', 'contradiction', 'transform', 'arrival'],
      bias: (x) => (x.id === 'glad-came' || x.id === 'remember-me' ? 0.6 : 0),
    });
    if (p) this.reveal(p.id, 6, 'return', 'emerge', 10);
    if (this.chairNudges < 2) {
      this.chairNudges++;
      this.queue(1, { type: 'chairNudge', dx: this.rng.range(-0.05, 0.05), dz: this.rng.range(-0.05, 0.05), dyaw: this.rng.range(-0.15, 0.15) }, 'return');
    }
  }

  snapshot() {
    return {
      phase: this.phase,
      visitor: this.visitor.snapshot(),
      field: this.field.snapshot(),
      memory: this.memory.snapshot(),
      visible: this.visible.size,
      pending: this.scheduler.snapshot(this.now).slice(0, 8).map((e) => `${e.in}s ${e.payload.rule}:${e.payload.cue.type}`),
      recent: this.log.slice(-8).map((c) => {
        const cu = c.cue as { phraseId?: string; caption?: string; text?: string };
        return `${c.t}s ${c.rule}:${c.cue.type} ${cu.phraseId ?? cu.caption ?? cu.text ?? ''}`.trim();
      }),
    };
  }
}
