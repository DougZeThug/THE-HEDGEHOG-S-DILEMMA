import { DRAWINGS, DRAWING_BY_ID } from '../content/drawings';
import { MemoryDirector, type PendingEcho } from './MemoryDirector';
import { VIGNETTE_BY_ID, lineKey } from '../content/vignettes';
import { Rng } from '../core/rng';
import { EventScheduler } from '../core/scheduler';
import { clamp, smoothstep } from '../core/math';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import { DEPARTURE_LINES, RECONTEXTS, VOICE_FRAGMENTS, type VoiceFragment } from '../content/relations';
import type { Phase, Phrase, Surface, Tier } from '../content/types';
import { VisitorModel, type VisitorInput } from './VisitorModel';
import { Memory, warmthOf, type Motif } from './Memory';
import { EmotionalField } from './EmotionalField';
import { PhaseTracker } from './Phase';
import { Engagement } from './Engagement';
import { Pacing, devKind } from './Pacing';
import { PhraseSelector, TIER_OPEN, type SelectContext, type SelectQuery } from './PhraseSelector';
import type { Cue, TimedCue, VoiceKind, VoicePosition } from './cues';
import type { Interpretation } from '../interpret/schema';
import { ARCS, type Arc, type EncounterBeat, type Gesture } from '../content/encounters';
import { belonging, CHARACTER_WALLS } from '../content/walls';
import { rankPerformances, performancesFor } from './performance';
import { SituationRunner, type PhraseGeometry, type SituationHost, type ContributionTrace } from './situations/Situation';
import { SITUATIONS, SITUATION_BY_ID, keptWord } from './situations/library';
import { ROOM } from '../world/layout';
import { hashString } from '../core/rng';

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
  /** A hide has been queued for it. */
  hiding?: boolean;
}

export interface DirectorOptions {
  seed: number;
  visits?: number;
  /** How many times each living memory has been seen on earlier visits. */
  memoryCounts?: Record<string, number>;
  /** Where each phrase is (world metres, chair at origin). Situations need it to relate place and writing. */
  geometry?: (phraseId: string) => PhraseGeometry | undefined;
  /** Force a repertoire of situations (for inspection and tests). */
  situations?: string[];
  /**
   * The old arrival: the walls already written and a line redrawn as you come in. The room
   * now begins nearly empty and an authored opening (src/state/OpeningScore.ts) comes first.
   */
  legacyOpening?: boolean;
}

const SURFACES: Surface[] = ['north', 'east', 'south', 'west'];
/** Lines with several directed readings, kept for their own meetings and a second hearing. */
const KEPT_READINGS = new Set(['stay', 'love-go-away', 'happy-then']);

export class Director {
  readonly visitor = new VisitorModel();
  readonly memory = new Memory();
  readonly field = new EmotionalField();
  readonly phaseTracker = new PhaseTracker();
  readonly engagement = new Engagement();
  readonly pacing = new Pacing();
  readonly selector = new PhraseSelector();
  readonly scheduler = new EventScheduler<{ cue: Cue; rule: string }>(7);
  readonly rng: Rng;
  readonly visible = new Map<string, VisibleState>();
  readonly log: TimedCue[] = [];
  env: Environment;
  visits: number;
  departing = false;

  private _facing: Surface = 'north';
  get facing(): Surface {
    return this._facing;
  }
  readonly situations: SituationRunner;
  private readonly host: SituationHost;
  private readonly owned: Set<string>;
  private lastContrib: ContributionTrace | null = null;
  private geometry: (id: string) => PhraseGeometry | undefined;
  private annotationsUsed = new Set<string>();
  private recontextsUsed = new Set<string>();
  /** How many beats of each phrase's arc have been played. */
  private played = new Map<string, number>();
  /** Beats waiting for room to play, while their meeting lasts: phrase id → give up at. */
  private heldBeats = new Map<string, number>();
  /** Lines that have migrated to a wall that isn't theirs: phrase id → wall. */
  readonly strays = new Map<string, Surface>();
  private heldMoved = false;
  private strayAnchors = new Set<string>();
  private spokenFirstApproach = false;
  private stillStage = 0;
  /** Seconds of stillness that is not reading (reading has its own answers). */
  private stillClock = 0;
  /** How many times stillness has been answered and broken: each time, it is answered later. */
  private stillCycles = 0;
  private stillVoiceOwed = false;
  /** Which recorded reading of each line has been heard, so a second hearing can be a different one. */
  private heard = new Map<string, string>();
  private reheard = false;
  private heldSilenceDone = false;
  /** The memory has been offered (its line written where the visitor looks) / has played. */
  private memoryOffered = false;
  memoryPlayed = false;
  /** No voices of the room's own until then: the memory's line has just been offered. */
  private memoryQuietUntil = -Infinity;
  /** The living memories: when one may open (src/state/MemoryDirector.ts). */
  readonly scenes: MemoryDirector;
  /** The line was touched (phones): latched until the memory can play. */
  private memoryTouched = false;
  /** The end of the pacing hold the memory asked for itself (so it never waits on its own hold). */
  private memoryHoldTo = -Infinity;
  /** Drawings drawn during this visit (each at most once). */
  readonly drawn = new Set<string>();
  /** Writing in the air happens at most once a visit. */
  private airDone = false;
  /** When the long held silence ends (the turn to the last phase doesn't break into it). */
  private heldSilenceUntil = -Infinity;
  private pendingPhase: Phase | null = null;
  /** A few seconds after a living memory ends, before the room turns a phase. */
  private scenesQuietAt = -Infinity;
  private attentionVoices = 0;
  private readsUnanswered = 0;
  private readArmedUntil = -Infinity;
  private readArmedFor: string | null = null;
  private longLookAt: string | null = null;
  private lastAttentionVoice = -Infinity;
  private creaks = 0;
  private taps = 0;
  private tappedAt = new Map<string, number>();
  private lastTapAt = -Infinity;
  private fragHeard = new Map<string, number>();
  private prevGaze: { id: string | null; held: number } = { id: null, held: 0 };
  /** Per-cooldown jitter, re-rolled each time it is used, so periodic rules don't beat in time. */
  private jitter = new Map<string, number>();
  private transformAt = Infinity;
  private lastSeenWithdraw = -Infinity;
  private chairNudges = 0;
  private kneelVoiced = false;
  private contributionCount = 0;
  private nextDistantLife = 45;
  private openingDone = false;
  private readonly legacy: boolean;
  private readonly seed: number;
  /** While the authored opening plays, the room's own rules wait and its clock doesn't run. */
  held = false;
  private nextAccumulate = 4;
  private lastAccumulateAt = -Infinity;
  private accumulated = 0;
  private lastRespondKind: string | null = null;
  private nearVoices = 0;
  /** Stillness thresholds differ from visit to visit, so waiting is never a ladder. */
  private stillAt: [number, number, number, number];
  private stillVoice: boolean;
  private stillMusic: boolean;

  constructor(opts: DirectorOptions) {
    this.rng = new Rng(opts.seed);
    this.seed = opts.seed;
    this.scenes = new MemoryDirector(opts.memoryCounts ?? {});
    this.visits = opts.visits ?? 1;
    // Stillness is one way in among many: it is answered soon, but not always the same way.
    const t1 = this.rng.range(5, 9);
    const t2 = t1 + this.rng.range(7, 12);
    const t3 = t2 + this.rng.range(10, 16);
    this.stillAt = [t1, t2, t3, t3 + this.rng.range(14, 24)];
    this.stillVoice = this.rng.chance(0.8);
    this.stillMusic = this.rng.chance(0.45);
    // The room begins nearly empty: only the writing on the floor by the chair, which can only
    // be read by someone who comes close. The rest accumulates (ruleAccumulate).
    this.legacy = !!opts.legacyOpening;
    for (const p of PHRASES) if (this.legacy ? p.tier === 'arrival' || p.tier === 'near' : p.tier === 'near' && p.surface === 'floor') this.visible.set(p.id, { mode: 'shown', since: 0, base: true });
    this.geometry = opts.geometry ?? (() => undefined);
    this.situations = new SituationRunner(Director.repertoire(this.visits, opts.situations));
    this.owned = this.situations.owned();
    this.host = this.makeHost();
    this.env = this.computeEnv();
    // Returning visitors find a room that remembers being visited.
    if (this.visits > 1) {
      this.reveal('remember-me', 7, 'return', 'emerge', 8);
      if (this.visits > 2) this.queue(16, { type: 'chairNudge', dx: 0.05, dz: -0.03, dyaw: 0.12 }, 'return');
    }
  }

  /** Seeded choice of which situations this visit can hold: three of the four, plus erosion if the visitor writes. */
  static repertoire(visits: number, forced?: string[]) {
    if (forced?.length) return forced.map((id) => SITUATION_BY_ID.get(id)).filter((d): d is NonNullable<typeof d> => !!d);
    const r = new Rng(hashString(`situations:${visits}`));
    const main = SITUATIONS.filter((d) => d.id !== 'erosion');
    for (let i = main.length - 1; i > 0; i--) {
      const j = r.int(0, i);
      [main[i], main[j]] = [main[j], main[i]];
    }
    return [...main.slice(0, 3), SITUATION_BY_ID.get('erosion')!];
  }

  private makeHost(): SituationHost {
    const d = this;
    return {
      get now() {
        return d.now;
      },
      get visitor() {
        return d.visitor;
      },
      get memory() {
        return d.memory;
      },
      get field() {
        return d.field.v;
      },
      get phase() {
        return d.phase;
      },
      get facing() {
        return d.facing;
      },
      get visible() {
        return d.visible;
      },
      get rng() {
        return d.rng;
      },
      geometry: (id) => d.geometry(id),
      distToSurface: (s) => {
        const sc = d.env?.roomScale ?? 1;
        const { x, z } = d.visitor;
        if (s === 'north') return z + ROOM.halfD * sc;
        if (s === 'south') return ROOM.halfD * sc - z;
        if (s === 'east') return ROOM.halfW * sc - x;
        if (s === 'west') return x + ROOM.halfW * sc;
        return 0;
      },
      emit: (rule, delay, cue, opts) => d.queue(delay, cue, rule, opts),
      cancel: (rule) => d.scheduler.cancelWhere((e) => e.rule === rule),
      reveal: (rule, id, delay, mode, seconds) => d.reveal(id, delay, rule, mode, seconds),
      speak: (rule, p, position, delay, style, gain) => d.speakPhrase(rule, p, position, delay, style, gain),
      musicReady: (sec) => d.scheduler.ready('music', d.now, sec),
      markMusic: () => d.scheduler.mark('music', d.now),
      lastContribution: () => d.lastContrib,
      // A situation is a strong thing: it doesn't begin over a meeting, inside a held silence,
      // or while the room is still recovering from something else.
      attending: () => d.attending() || d.pacing.holding(d.now) || !d.pacing.intenseFree(d.now) || !d.scheduler.majorFree(d.now),
    };
  }

  get phase(): Phase {
    return this.phaseTracker.phase;
  }
  get now(): number {
    return this.visitor.t;
  }

  /** A cooldown whose length wanders (×0.6–1.6) from use to use. */
  private cool(key: string, base: number): boolean {
    return this.scheduler.ready(key, this.now, base * (this.jitter.get(key) ?? 1));
  }
  private used(key: string) {
    this.scheduler.mark(key, this.now);
    this.jitter.set(key, this.rng.range(0.6, 1.6));
  }

  /** The visitor is in the middle of meeting a line: its beat is waiting or about to sound. */
  private attending(): boolean {
    return this.heldBeats.size > 0 || this.memoryAwaited() || !!this.scenes.active || this.scheduler.pending().some((e) => e.payload.rule.startsWith('encounter:') && e.payload.cue.type === 'voice');
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
    extra: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number; finish?: boolean } = {},
  ) {
    if (extra.phraseId && !extra.finish && this.withheld().includes(extra.phraseId)) return;
    // The memory's line has just been written for the visitor to stay with: the room doesn't
    // talk over it (authored situations and a finished line aside).
    if (this.now < this.memoryQuietUntil && !extra.finish && !rule.startsWith('sit:')) return;
    // Nothing talks over a living memory.
    if (this.scenes.active && !extra.finish) return;
    // A vignette's line is its own: the room doesn't say it first.
    if (extra.phraseId && !extra.finish && this.scenes.claimsVoice(extra.phraseId)) return;
    // A phrase with recorded performances: choose the one directed for this moment.
    let ranked = extra.phraseId && kind !== 'laugh' && kind !== 'murmur' && kind !== 'breath' && kind !== 'hum' ? rankPerformances(extra.phraseId, this.field.v, kind) : [];
    // Heard before: this time, the reading furthest from the one already heard.
    const before = extra.phraseId ? this.heard.get(extra.phraseId) : undefined;
    if (before && ranked.length > 1) {
      const first = ranked.find((r) => r.id === before);
      const dist = (r: (typeof ranked)[number]) => {
        if (!first) return 0;
        const keys = new Set([...Object.keys(r.context), ...Object.keys(first.context)]) as Set<keyof typeof r.context>;
        let d = 0;
        for (const k of keys) d += ((r.context[k] ?? 0) - (first.context[k] ?? 0)) ** 2;
        return d + (r.voice !== first.voice ? 0.5 : 0);
      };
      // Only among the readings in the room: rejected and unheard takes stay last, however different.
      const out = (r: (typeof ranked)[number]) => !!(r.retired || r.audition);
      const others = ranked.filter((r) => r.id !== before);
      ranked = others.filter((r) => !out(r)).sort((a, b) => dist(b) - dist(a)).concat(first ? [first] : [], others.filter(out));
    }
    if (ranked.length && extra.phraseId) this.heard.set(extra.phraseId, ranked[0].id);
    // Sometimes what is said writes itself where it belongs, as it is heard — not always: some
    // voices leave a mark, most leave nothing at all.
    const writes = !extra.finish && !!extra.phraseId && ranked.length > 0 && !this.visible.has(extra.phraseId) && !this.legacy && this.rng.chance(0.35);
    if (writes) {
      this.accumulating.add(extra.phraseId!);
      this.visible.set(extra.phraseId!, { mode: 'shown', since: this.now + delay, base: true });
      this.memory.surfaced.set(extra.phraseId!, this.now + delay);
    }
    this.queue(
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
  }

  private speakPhrase(rule: string, p: Phrase, position: VoicePosition, delay = 0, styleOverride?: Phrase['voice'], gain = 0.8) {
    const style = styleOverride ?? p.voice ?? 'whisper';
    this.voice(rule, delay, style, p.text, p.text, position, { phraseId: p.id, gain });
    this.memory.spoken.set(p.id, this.now + delay);
  }

  private fragment(rule: string, f: VoiceFragment, position: VoicePosition, delay = 0, gain = 0.6) {
    if (position.kind === 'chair' && this.situations.claimed('chair-voice') && !rule.startsWith('sit:')) return;
    // Sounds that belong to an authored situation are not used as generic texture.
    if (this.owned.has(f.id) && !rule.startsWith('sit:')) return;
    if (position.kind === 'beyond' && this.situations.claimed('beyond')) return;
    const kind = f.kind === 'speech' ? 'distant' : f.kind;
    this.voice(rule, delay, kind, f.kind === 'speech' ? f.caption : null, f.caption, position, { assetId: f.id, gain });
  }

  // ───────────────────────────── tick ─────────────────────────────

  tick(dt: number, input: VisitorInput, facing: Surface): TimedCue[] {
    // During the opening the room's own life hasn't begun: no rule runs and no time passes
    // for it (its clock is the visitor model's), so nothing is owed at the hand-off.
    if (this.held) return [];
    this._facing = facing;
    const v = this.visitor;
    v.update(dt, input);
    if (facing !== this.lastFacing) {
      this.lastFacing = facing;
      this.facingSince = this.now;
    }
    this.engagement.update(dt, v, input.yaw);
    const formed = this.memory.update(v, dt);
    const phaseChanged = this.phaseTracker.update(v, this.memory, this.engagement);
    this.field.update(dt, v, this.memory, this.phase);

    if (!this.departing) {
      for (const m of formed) this.onMotif(m);
      // The turn into a new phase waits for a living memory to end (it would black out the room
      // in the middle of it), and a few seconds more.
      if (phaseChanged) this.pendingPhase = phaseChanged;
      if (this.pendingPhase && !this.scenes.active && this.now >= this.scenesQuietAt) {
        this.onPhase(this.pendingPhase);
        this.pendingPhase = null;
      }
      if (phaseChanged === 'transform') this.transformAt = this.now;
      if (this.legacy) this.ruleOpening();
      this.ruleMemory();
      this.ruleScenes();
      this.ruleEchoes();
      this.ruleAccumulate();
      this.ruleDrawings();
      this.ruleFinish();
      this.situations.tick(this.host);
      this.ruleDriftReveal();
      this.ruleStillness(dt);
      this.ruleApproach();
      this.ruleWithdraw();
      this.ruleEncounters();
      this.ruleWarmResurface();
      this.ruleMusic();
      this.ruleRecontext();
      this.ruleContaminate();
      this.ruleDistantLife();
      this.ruleKneel();
      this.ruleChairNudge(input);
      this.ruleVoices();
      this.ruleRehear();
      this.ruleHeldSilence();
      this.ruleAir();
      this.ruleRespond();
    }
    this.pacing.tick(dt, this.now, this.phase, this.engagement.activity(this.now));

    this.env = this.computeEnv();

    const out: TimedCue[] = [];
    const due = this.scheduler.tick(this.now);
    // A meeting's voice that never found room is owed to the next meeting, not lost.
    for (const { cue, rule } of this.scheduler.expired) this.lost(cue, rule);
    for (const { cue, rule } of due) {
      if (!this.accept(cue, rule)) {
        this.lost(cue, rule);
        continue;
      }
      const tc = { t: +this.now.toFixed(2), cue, rule };
      out.push(tc);
      this.pacing.note(this.now, cue, rule);
      // The inspector log never keeps a visitor's own words.
      this.log.push(cue.type === 'write' && cue.purpose === 'contribution' ? { ...tc, cue: { ...cue, text: '[visitor’s words]' } } : tc);
      if (this.log.length > 400) this.log.shift();
    }
    return out;
  }

  /** A voice that was decided on but never sounded: undo what it was counted for. */
  private lost(cue: Cue, rule: string) {
    // A memory that never found room isn't spent: it waits for the next look.
    if (cue.type === 'memory-scene' || cue.type === 'vignette') this.scenes.cancel(cue.id, this.now);
    if (cue.type !== 'voice' || !cue.phraseId) return;
    // A voice that was to write its line as it was heard: the line was marked as there when the
    // voice was queued. Unheard, it was never written, so it isn't there.
    if (cue.write) {
      const st = this.visible.get(cue.phraseId);
      if (st?.base && this.accumulating.has(cue.phraseId)) {
        this.visible.delete(cue.phraseId);
        this.accumulating.delete(cue.phraseId);
        this.memory.surfaced.delete(cue.phraseId);
      }
    }
    if (this.memory.spoken.get(cue.phraseId) !== undefined) this.memory.spoken.delete(cue.phraseId);
    this.heard.delete(cue.phraseId);
    const m = /^encounter:([^:]+):(\d+)$/.exec(rule);
    if (m) this.played.set(m[1], Math.max(0, Number(m[2]) - 1));
  }

  /** Keep the Director's model of what is visible in sync with the cues it lets through. */
  private accept(cue: Cue, rule: string): boolean {
    // A situation that took the chair's voice or the space beyond the walls after this was
    // queued keeps it: claims hold at the moment of sounding, not only when queued.
    if (cue.type === 'voice' && !rule.startsWith('sit:')) {
      if (cue.position.kind === 'chair' && this.situations.claimed('chair-voice')) return false;
      if (cue.position.kind === 'beyond' && this.situations.claimed('beyond')) return false;
    }
    if (cue.type === 'music' && !rule.startsWith('sit:') && this.situations.claimed('music')) return false;
    // Nothing sounds over a memory: a situation's laugh or murmur waits too (it is emitted
    // directly, not through the voice rules that already wait).
    if (this.scenes.active && ((cue.type === 'voice' && !cue.finish) || cue.type === 'sound' || cue.type === 'music')) return false;
    if (cue.type === 'reveal' && this.withheld().includes(cue.phraseId)) return false;
    // While a living memory plays, the room waits with it: no silence (a dim would darken the
    // painting), no new line revealed or written.
    if (this.scenes.active && (cue.type === 'silence' || cue.type === 'reveal' || (cue.type === 'write' && rule !== 'memory-offer'))) return false;
    if (cue.type === 'reveal') {
      const cur = this.visible.get(cue.phraseId);
      if (cur && cur.mode === 'shown') return false;
      if (cue.mode === 'still' && this.visitor.stillFor < 2) return false;
      this.visible.set(cue.phraseId, { mode: cue.mode === 'still' ? 'still' : 'shown', since: this.now, base: this.accumulating.has(cue.phraseId) });
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
    return { arrival: 3, familiar: 8, contradiction: 12, transform: 16 }[this.phase];
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

  /** Kept for its moment: the reserved lines, and the memory's line until the memory offers it. */
  private reserved(id: string): boolean {
    return Director.RESERVED.has(id) || (id === Director.MEMORY.phraseId && !this.memoryOffered);
  }

  private hiddenExcluding(): Set<string> {
    const out = new Set([...this.visible.keys(), ...Director.RESERVED, ...this.withheld()]);
    if (!this.memoryOffered) out.add(Director.MEMORY.phraseId);
    return out;
  }

  /** Lines about leaving and staying, kept back while "I wanted you to" is unfinished. */
  /** What may be written in the air, in order of preference. */
  static readonly AIR_LINES = ['closer', 'far-enough', 'come-back-dont'];

  static readonly ANSWERS_TO_STAY = ['w-stay', 'closer', 'need-no-one', 'if-closer', 'not-going', 'still-here', 'far-enough', 'afraid-leave', 'come-back-dont', 'maybe-wanted', 'w-away', 'w-almost'];

  /**
   * While a line is left unfinished, nothing answers it: not its echoes, not what contradicts
   * it, not other lines about going or staying. The visitor finishes it, or nobody does.
   */
  private withheld(): string[] {
    if (!this.unfinished.size) return [];
    const out = new Set<string>();
    for (const id of this.unfinished) {
      const p = PHRASE_BY_ID.get(id);
      for (const r of [...(p?.echoes ?? []), ...(p?.contradicts ?? [])]) out.add(r);
      if (id === 'stay') for (const r of Director.ANSWERS_TO_STAY) out.add(r);
    }
    return [...out];
  }

  /** The walls slowly offer more writing as the visit goes on. */
  private ruleDriftReveal() {
    const gap = { arrival: 30, familiar: 28, contradiction: 26, transform: 30 }[this.phase];
    if (this.now < 14 || !this.cool('drift', gap) || this.pacing.holding(this.now) || this.pacing.crowded(this.now)) return;
    // Writing has just changed somewhere: let it be found before anything else appears.
    if (this.pacing.repeats('text', this.now, 12)) return;
    this.used('drift');
    // Usually where the visitor is looking; sometimes behind them, to be found on turning round.
    const towardFacing = this.rng.chance(0.6);
    const surfaces = towardFacing ? [this.facing] : SURFACES.filter((s) => s !== this.facing);
    const q: SelectQuery = { exclude: this.hiddenExcluding(), surfaces, contrast: this.phase === 'contradiction' ? 0.35 : 0.15 };
    let p = this.selector.select(this.ctx(), q);
    if (!p) p = this.selector.select(this.ctx(), { exclude: this.hiddenExcluding() });
    if (p) this.reveal(p.id, 0, 'drift', 'emerge', this.rng.range(8, 14));
  }

  /**
   * Stillness thins the room. Sometimes that is all it does; sometimes writing that only
   * exists for someone standing still comes through, or a voice drifts in. The thresholds
   * and what follows them differ per visit.
   */
  private ruleStillness(dt: number) {
    const v = this.visitor;
    if (v.stillFor === 0) this.stillClock = 0;
    // Reading pauses stillness — but a look that has rested on one line for a while has
    // become contemplation, and counts.
    else if (v.deepStillFor > 0 && (!v.gazeId || v.gazeFor > 6)) this.stillClock += dt;
    const s = this.stillClock;
    const k = 1 + 0.5 * Math.min(3, this.stillCycles);
    const [t1, t2, t3, t4] = this.stillAt.map((x) => x * k);
    if (v.stillFor === 0 && [...this.visible.values()].some((st) => st.mode === 'still' && !st.hiding)) {
      // Writing that only exists for someone standing still is gone the moment they move,
      // however it came.
      for (const [id, st] of this.visible)
        if (st.mode === 'still' && !st.hiding) {
          st.hiding = true;
          this.queue(0, { type: 'hide', phraseId: id, seconds: 2.5 }, 'unstill');
        }
    }
    if (v.stillFor === 0 && this.stillStage > 0) {
      this.stillStage = 0;
      this.stillVoiceOwed = false;
      this.stillCycles++;
      this.scheduler.cancelWhere((e) => e.rule.startsWith('still'));
      return;
    }
    if (s > t1 && this.stillStage < 1) {
      this.stillStage = 1;
      const p = this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding(), surfaces: [this.facing] }) ??
        this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding() });
      if (p) this.reveal(p.id, 0, 'still-1', 'still', 7);
    }
    if (s > t2 && this.stillStage < 2) {
      this.stillStage = 2;
      if (this.rng.chance(0.6)) {
        const p = this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding() });
        if (p) this.reveal(p.id, 0, 'still-2', 'still', 9);
      }
      this.stillVoiceOwed = this.stillVoice;
    }
    // The voice that stillness brings waits for the room to be free, while the stillness lasts.
    if (this.stillVoiceOwed && this.stillStage >= 2 && this.scheduler.ready('still-voice', this.now, 60) && this.pacing.intenseFree(this.now) && this.scheduler.majorFree(this.now) && !this.attending()) {
      this.stillVoiceOwed = false;
      const sp = this.selector.select(this.ctx(), {
        voiced: true,
        tiers: ['still', 'arrival', 'familiar', ...(this.phase === 'arrival' ? [] : (['contradiction'] as const))],
        bias: (x) => (this.memory.spoken.has(x.id) ? -0.6 : 0) + (x.tier === 'still' ? 0.2 : 0) + (performancesFor(x.id).length ? 0.4 : 0),
      });
      if (sp) {
        this.scheduler.mark('still-voice', this.now);
        this.speakPhrase('still-voice', sp, { kind: 'approach' }, 1, 'whisper', 0.65);
      }
    }
    if (s > t3 && this.stillStage < 3) {
      this.stillStage = 3;
      this.queue(0, { type: 'silence', depth: 0.85, seconds: 20 }, 'still-silence', { major: true, ttl: 30 });
    }
    if (s > t4 && this.stillStage < 4) {
      this.stillStage = 4;
      if (this.stillMusic && !this.situations.claimed('music') && this.scheduler.ready('music', this.now, 40)) {
        this.scheduler.mark('music', this.now);
        this.queue(0, { type: 'music', mood: 'sparse', notes: 4, truncate: true }, 'still-music', { major: true, ttl: 40 });
      } else if (this.memory.warmMemories.length && this.rng.chance(0.5)) {
        this.fragment('still-hum', VOICE_FRAGMENTS.find((f) => f.id === 'vf-hum')!, { kind: 'beyond', surface: 'east' }, 4, 0.4);
      }
    }
  }

  /**
   * Coming close to the chair. Usually the room answers by subtraction — the hum drops,
   * the light settles. A voice near the chair is rare: at most twice in a visit.
   */
  private ruleApproach() {
    const v = this.visitor;
    if (!v.near) return;
    if (!this.spokenFirstApproach && v.nearFor > 1.2) {
      this.spokenFirstApproach = true;
      // Coming close is answered at once, quietly: the room goes still, and the chair is
      // either heard (a creak, as if someone just got up), breathed beside, or simply left alone.
      this.queue(0, { type: 'silence', depth: 0.4, seconds: 7 }, 'first-approach', { major: true, ttl: 4 });
      // Mostly the silence alone. An empty chair that breathes belongs late in a visit, if at all.
      const r = this.rng.next();
      if (r < 0.2 && this.creaks < 2) {
        this.creaks++;
        this.queue(2.5, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.3 }, 'first-approach');
      } else if (r < 0.45 && this.phase === 'transform' && !this.situations.claimed('chair-voice'))
        this.fragment('first-approach', VOICE_FRAGMENTS.find((f) => f.id === 'vf-breath')!, { kind: 'chair' }, 5, 0.4);
      return;
    }
    const f = this.field.v;
    if (v.nearFor > 6 && this.nearVoices < 3 && !this.situations.claimed('chair-voice') && this.scheduler.ready('near-dwell', this.now, 45) && this.pacing.intenseFree(this.now) && !this.attending()) {
      this.scheduler.mark('near-dwell', this.now);
      if (!this.rng.chance(this.nearVoices === 0 ? 0.9 : 0.55)) return;
      this.nearVoices++;
      const exposed = f.exposure > f.warmth + 0.05;
      if (exposed) {
        // Closeness as pressure: an affectionate line, spoken flatly, from behind.
        const p = this.selector.select(this.ctx(), {
          voiced: true,
          tiers: ['arrival', 'familiar', 'contradiction'],
          bias: (x) => ((x.dims.affection ?? 0) + (x.dims.connection ?? 0) * 0.6) * 0.4 - (this.memory.spoken.has(x.id) ? 0.5 : 0),
        });
        if (p) this.speakPhrase('near-exposed', p, { kind: 'nowhere' }, 0, 'flat', 0.65);
      } else {
        // Closeness as company.
        const p = this.selector.select(this.ctx(), {
          voiced: true,
          tiers: ['arrival', 'familiar', 'still', ...(this.phase === 'transform' ? (['transform'] as const) : [])],
          bias: (x) => warmthOf(x.dims) * 0.3 + (x.dims.connection ?? 0) * 0.4 - (this.memory.spoken.has(x.id) ? 0.5 : 0),
        });
        if (p) this.speakPhrase('near-warm', p, { kind: 'chair' }, 0, p.voice === 'flat' ? 'tender' : p.voice, 0.7);
      }
    }
    // A very long, settled closeness late in the visit.
    if (v.nearFor > 45 && this.phase !== 'arrival' && !this.annotationsUsed.has('thank-staying')) {
      this.annotationsUsed.add('thank-staying');
      this.reveal('thank-staying', 0, 'long-near', 'emerge', 14);
    }
  }

  /**
   * The first seconds. The room must not feel as if it is loading: the line in front of the
   * visitor writes itself as the light comes up, and — differently from visit to visit — the
   * room has only just been left: a door closing behind them, or the chair settling with a
   * warmth still on it, or the hum simply dropping as the line is finished.
   */
  /** Hold the room for the authored opening. */
  hold() {
    this.held = true;
  }

  /**
   * The opening has ended: what it wrote and said are now part of the room. Stillness built up
   * while the visitor watched it doesn't count (or every answer to stillness would arrive at once).
   */
  release(opened: { written?: string[]; spoken?: string[]; unfinished?: string[] } = {}) {
    for (const id of opened.unfinished ?? []) this.unfinished.add(id);
    for (const id of opened.written ?? []) {
      this.visible.set(id, { mode: 'shown', since: this.now, base: true });
      this.memory.surfaced.set(id, this.now);
    }
    for (const id of opened.spoken ?? []) this.memory.spoken.set(id, this.now);
    this.visitor.stillFor = 0;
    this.visitor.deepStillFor = 0;
    this.stillClock = 0;
    this.held = false;
  }

  /** Writing the room starts with, ordinary things first; the rest comes by selection. */
  // ("the light in the kitchen at four in the afternoon" is kept back: it is the memory, late.)
  static readonly FIRST_WRITTEN = ['cereal', 'sandwich', 'good-day', 'summer', 'laugh-breathe', 'home', 'rain-carpark'];

  /**
   * The room fills: the walls start almost bare and gather writing through the visit — a few
   * lines soon after the opening (something to read, something to touch), then more slowly.
   * Usually on the wall the visitor faces, so it is seen being written.
   */
  private ruleAccumulate() {
    if (this.legacy) return;
    // Someone staying with a line is answered sooner: something it echoes or contradicts is
    // written near it — reading makes more to read.
    const v = this.visitor;
    // (Not the memory's line before its memory: that look is the memory's to answer.)
    const memoryLine = (v.gazeId === Director.MEMORY.phraseId && !this.memoryPlayed) || this.scenes.claims(v.gazeId);
    const reading = v.gazeId && v.gazeFor > 2.5 && !memoryLine ? PHRASE_BY_ID.get(v.gazeId) : undefined;
    const answerRead = !!reading && this.now - this.lastAccumulateAt > 5 && this.accumulated < 14;
    if (this.now < this.nextAccumulate && !answerRead) return;
    // Someone settled at the chair is with the chair: the walls can wait.
    if (!answerRead && v.near && v.stillFor > 3) return;
    if (this.pacing.holding(this.now) || this.pacing.repeats('text', this.now, 6)) return;
    // The first comes regardless (something to read); after that the room's own filling
    // waits while enough is happening.
    if (this.accumulated >= 2 && this.pacing.crowded(this.now)) return;
    // Never on top of something that has only just happened.
    if (this.accumulated >= 1 && this.pacing.sinceDev(this.now) < 2.5) return;
    const n = this.accumulated;
    this.nextAccumulate = this.now + (n < 5 ? this.rng.range(8, 12) : n < 12 ? this.rng.range(14, 22) : this.rng.range(26, 40));
    // Turning to a wall is answered: the hand writes there, where the visitor has just looked.
    const turned = this.now - this.facingSince < 4 && this.now > 4;
    const facing = turned || this.rng.chance(0.7);
    // Not a line something else has already promised to bring (a reveal waiting its time).
    const free = (id: string) => !this.visible.has(id) && !this.scheduler.hasPending(`reveal:${id}`);
    const pool = PHRASES.filter((p) => p.tier === 'arrival' && free(p.id) && p.surface !== 'floor' && p.surface !== 'ceiling');
    if (!pool.length) return;
    const onWall = (id: string) => pool.some((p) => p.id === id && (!facing || p.surface === this.facing));
    let id: string | undefined;
    let rule = turned ? 'accumulate-turn' : 'accumulate';
    if (answerRead && reading) {
      const related = [...(reading.contradicts ?? []), ...(reading.echoes ?? [])]
        .map((r) => PHRASE_BY_ID.get(r))
        .find((p) => p && free(p.id) && !this.reserved(p.id) && !this.withheld().includes(p.id) && p.surface !== 'floor' && p.surface !== 'ceiling' && !['transform', 'annotation', 'still', 'near'].includes(p.tier ?? 'arrival'));
      if (related) {
        id = related.id;
        rule = 'accumulate-read';
      }
    }
    if (!id) id = Director.FIRST_WRITTEN.find(onWall);
    // The first few ordinary lines are written where the visitor is looking, whatever wall
    // they were first written on: the room is filling in front of them.
    if (!id && n < 3) {
      const moved = Director.FIRST_WRITTEN.map((x) => PHRASE_BY_ID.get(x)).find((p) => p && free(p.id) && !this.moved.has(p.id));
      if (moved && moved.surface !== this.facing && this.facing !== 'floor' && this.facing !== 'ceiling') {
        this.accumulated++;
        this.lastAccumulateAt = this.now;
        this.moved.add(moved.id);
        this.accumulating.add(moved.id);
        this.visible.set(moved.id, { mode: 'shown', since: this.now, base: true });
        this.memory.surfaced.set(moved.id, this.now);
        this.queue(0, {
          type: 'write', key: `moved:${moved.id}`, text: moved.text, hand: moved.hand === 'typed' ? 'pencil' : moved.hand, size: 's',
          surface: this.facing, purpose: 'recall', ttl: 0, source: moved.id,
        }, rule);
        return;
      }
    }
    if (!id) {
      const there = facing ? pool.filter((p) => p.surface === this.facing) : pool;
      const from = there.length ? there : pool;
      id = this.selector.select(this.ctx(), { exclude: this.hiddenExcluding(), surfaces: [...new Set(from.map((p) => p.surface))] })?.id ?? from[0].id;
    }
    this.accumulated++;
    this.lastAccumulateAt = this.now;
    this.queue(0, { type: 'reveal', phraseId: id, mode: 'emerge', seconds: 6 }, rule, { key: `reveal:${id}` });
    // What accumulates stays: the room remembers it.
    this.accumulating.add(id);
  }
  private accumulating = new Set<string>();
  /** Ordinary lines written on another wall than their own. */
  private moved = new Set<string>();
  /** Lines the opening left unfinished on the wall. */
  private unfinished = new Set<string>();

  /**
   * An unfinished line is finished when someone stays with it: a long look at it, or coming to
   * the chair. A voice says the whole sentence, and the hand writes the rest as it is heard.
   */
  private ruleFinish() {
    if (!this.unfinished.size || this.now < 12) return;
    const v = this.visitor;
    for (const id of this.unfinished) {
      const p = PHRASE_BY_ID.get(id);
      if (!p) continue;
      // Earned by staying, not by arriving: a long look, or stillness at the chair — and only
      // while the line is in view, so the sentence is seen being finished.
      const looked = v.gazeId === id && v.gazeFor > 6;
      const stayed = v.near && v.nearFor > 8 && v.stillFor > 5 && this.facing === p.surface;
      if (!looked && !stayed) continue;
      if (!this.scheduler.majorFree(this.now) || !this.pacing.intenseFree(this.now) || this.pacing.holding(this.now)) return;
      this.unfinished.delete(id);
      this.voice(looked ? 'finish-look' : 'finish-chair', 0, p.voice ?? 'tender', p.text, p.text, { kind: 'surface', phraseId: id }, { phraseId: id, finish: true, ttl: 20, priority: 2 });
      this.memory.spoken.set(id, this.now);
      // Then nothing for a while: the sentence is left to stand.
      this.pacing.holdFor(this.now, 15);
      return;
    }
  }
  /** When the visitor last turned to face a different wall. */
  private facingSince = 0;
  private lastFacing: Surface | null = null;

  private ruleOpening() {
    if (this.openingDone || this.now < 0.3) return;
    this.openingDone = true;
    const focal = this.visits <= 1 ? 'stay' : this.rng.pick(['stay', 'closer', 'not-going']);
    this.queue(0, { type: 'redraw', phraseId: focal, seconds: 4.5 }, 'opening');
    const r = this.rng.next();
    if (r < 0.4) {
      // The hum drops as the line is finished: the room choosing not to say anything more.
      this.queue(4.6, { type: 'silence', depth: 0.55, seconds: 6 }, 'opening');
    } else if (r < 0.75) {
      // Someone has just gone out, behind you.
      this.queue(2.2, { type: 'sound', kind: 'door', position: { kind: 'beyond', surface: 'south' }, gain: 0.36 }, 'opening');
    } else {
      // Someone has just got up from the chair, as you came in.
      this.creaks++;
      this.queue(0.9, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.28 }, 'opening');
      this.queue(1, { type: 'glow', x: 0, z: 0, amount: 0.2, seconds: 20 }, 'opening');
    }
  }

  /**
   * Touching (or clicking) writing is deliberate attention: it counts as reading it at once.
   * The room leans in a little — the hum dips while the words are read. Returns whether the
   * touch was recognised.
   */
  tapped(t: { phraseId?: string; chair?: boolean }): boolean {
    if (this.departing) return false;
    if (t.chair) {
      if (this.now - this.lastTapAt >= 2) this.engagement.raise('tap-chair', this.now);
      this.lastTapAt = this.now;
      return true;
    }
    if (!t.phraseId || !PHRASE_BY_ID.has(t.phraseId)) return false;
    this.visitor.touch(t.phraseId);
    // Touching the memory's line asks for its memory, however recently it was touched.
    if (t.phraseId === Director.MEMORY.phraseId && !this.memoryPlayed && this.visible.has(t.phraseId)) this.memoryTouched = true;
    if (this.visible.has(t.phraseId)) this.scenes.tapped(t.phraseId);
    // Touching the same words again and again, or tapping everything, is not more attention.
    if (this.now - (this.tappedAt.get(t.phraseId) ?? -Infinity) < 9 || this.now - this.lastTapAt < 2) return true;
    this.tappedAt.set(t.phraseId, this.now);
    this.lastTapAt = this.now;
    this.engagement.raise('tap', this.now, t.phraseId);
    this.taps++;
    if (this.taps <= 2 && this.rng.chance(0.5)) {
      this.queue(0.2, { type: 'silence', depth: 0.22, seconds: 3 }, 'tap');
    }
    return true;
  }

  /**
   * When quiet has turned into waiting — the visitor is doing things and nothing has
   * answered for longer than feels chosen — answer what they are doing: the line they are
   * reading, the chair they are standing at, the room they have just looked round. Not with
   * more of whatever just happened, and never loudly. Silence that is chosen (recovering
   * after something strong, or simply not yet long) is left alone.
   */
  private ruleRespond() {
    const now = this.now;
    if (this.pacing.rhythm(now, this.phase, this.engagement.activity(now)) !== 'stalled' || !this.scheduler.ready('respond', now, 8) || this.attending()) return;
    // Something already on its way will answer.
    if (this.scheduler.pending().some((e) => e.at - now < 4 && devKind(e.payload.cue) && devKind(e.payload.cue) !== 'silence')) return;
    this.scheduler.mark('respond', now);
    const v = this.visitor;
    const last = this.engagement.last();
    const options: [string, () => boolean][] = [];
    if (v.gazeId) options.push(['line', () => this.respondToLine(v.gazeId!)]);
    if (v.near) options.push(['chair', () => this.respondAtChair()]);
    if (last && (last.kind === 'sweep' || last.kind === 'cross') && now - last.t < 20) options.push(['behind', () => this.respondBehind()]);
    if (v.stillFor > 3) options.push(['still', () => this.respondStill()]);
    if (!this.pacing.crowded(now)) options.push(['behind', () => this.respondBehind()], ['sound', () => this.respondSound()]);
    // Sometimes the answer is that nobody speaks: the room hushes, as if about to, and doesn't.
    if (this.phase !== 'arrival' && this.lastRespondKind !== 'withhold' && this.rng.chance(0.25))
      options.unshift(['withhold', () => (this.queue(0, { type: 'silence', depth: 0.38, seconds: 5 }, 'withhold', { major: true, ttl: 4 }), true)]);
    // Not the same kind of answer twice running.
    const tired = this.pacing.repeats('text', now, 25);
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
      !!x && x.tier !== 'annotation' && !this.visible.has(x.id) && !this.reserved(x.id) && (x.tier !== 'transform' || this.phase === 'transform');
    // A related line comes up somewhere else — to be come across, not handed over beside it.
    const related = [...(p.echoes ?? []), ...(this.phase === 'arrival' ? [] : (p.contradicts ?? []))].map((r) => PHRASE_BY_ID.get(r)).filter(ok);
    const r = related[0];
    if (r) {
      this.reveal(r.id, 2, 'respond-line', 'emerge', 7);
      return true;
    }
    // Otherwise something near it in feeling, on the same wall.
    const q = this.selector.select(this.ctx(), { exclude: this.hiddenExcluding(), surfaces: [p.surface], bias: (x) => (x.keywords ?? []).some((k) => (p.keywords ?? []).includes(k)) ? 0.4 : 0 });
    if (!q) return false;
    this.reveal(q.id, 2, 'respond-line', 'emerge', 7);
    return true;
  }

  private respondAtChair(): boolean {
    if (this.creaks < 2 && this.scheduler.ready('respond-creak', this.now, 90)) {
      this.scheduler.mark('respond-creak', this.now);
      this.creaks++;
      this.queue(0.5, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.26 }, 'respond-chair');
      return true;
    }
    const p = PHRASES.find((x) => x.tier === 'near' && !this.visible.has(x.id)) ??
      this.selector.select(this.ctx(), { tiers: ['still', 'familiar'], exclude: this.hiddenExcluding(), surfaces: ['floor', this.facing] });
    if (!p) return false;
    this.reveal(p.id, 0.5, 'respond-chair', 'emerge', 7);
    return true;
  }

  /** Something appears on a wall the visitor has just turned away from, to be found. */
  private respondBehind(): boolean {
    const opposite: Record<string, Surface> = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const walls = [opposite[this.facing] ?? 'south', ...SURFACES.filter((s) => s !== this.facing && s !== opposite[this.facing])];
    // Early on, the room's next layer of writing is already within reach.
    const tiers: Tier[] | undefined = this.phase === 'arrival' ? ['arrival', 'familiar'] : undefined;
    for (const w of walls) {
      const p = this.selector.select(this.ctx(), { exclude: this.hiddenExcluding(), surfaces: [w], tiers });
      if (p) {
        this.reveal(p.id, 0, 'respond-behind', 'emerge', 8);
        return true;
      }
    }
    return false;
  }

  private respondStill(): boolean {
    const p = this.selector.select(this.ctx(), { tiers: ['still'], exclude: this.hiddenExcluding(), surfaces: [this.facing] }) ??
      this.selector.select(this.ctx(), { exclude: this.hiddenExcluding(), surfaces: [this.facing] });
    if (!p) return false;
    this.reveal(p.id, 0, 'respond-still', p.tier === 'still' ? 'still' : 'emerge', 8);
    return true;
  }

  private respondSound(): boolean {
    if (this.situations.claimed('beyond') || !this.pacing.intenseFree(this.now) || this.pacing.repeats('sound', this.now, 25)) return false;
    const wall = this.rng.pick(SURFACES.filter((s) => s !== this.facing));
    // (The door is kept for its authored moments.) Nothing heard twice within three minutes.
    const fresh = (id: string) => this.now - (this.fragHeard.get(id) ?? -Infinity) > 180;
    if (this.rng.chance(0.4) && fresh('sfx:cup')) {
      this.fragHeard.set('sfx:cup', this.now);
      this.queue(0, { type: 'sound', kind: 'cup', position: { kind: 'beyond', surface: wall }, gain: 0.3 }, 'respond-sound');
      return true;
    }
    const frags = VOICE_FRAGMENTS.filter((f) => f.kind !== 'speech' && f.kind !== 'breath' && !this.owned.has(f.id) && fresh(f.id));
    if (!frags.length) return false;
    const f = this.rng.pick(frags);
    this.fragHeard.set(f.id, this.now);
    this.fragment('respond-sound', f, { kind: 'beyond', surface: wall }, 0, 0.35);
    return true;
  }

  /**
   * Voices, prompted by what the visitor does — never by the clock. When someone turns away
   * from a line they held for a while, comes back to one, or steps away from the chair,
   * sometimes (not usually) a line connected to it is said: its echo or its contradiction,
   * from where that writing is, or from beyond a wall. The three central lines, with several readings each,
   * are kept for their own meetings and for a second hearing.
   */
  private ruleVoices() {
    const v = this.visitor;
    const now = this.now;
    // What just happened.
    let source: string | null = null;
    if (this.prevGaze.id && v.gazeId !== this.prevGaze.id && this.prevGaze.held >= 4.5) source = this.prevGaze.id;
    const ret = this.engagement.fresh.find((x) => x.kind === 'return');
    if (ret?.id) source = ret.id;
    if (!source && v.lastWithdrawAt === now && v.readOrder.length) source = v.readOrder[v.readOrder.length - 1];
    // Someone reading line after line with nothing answering, or resting on one line a long
    // time: the room may speak to it. The chance is taken once; if the room is busy at that
    // moment, it waits a little for room to speak.
    const reads = this.engagement.fresh.filter((x) => x.kind === 'read' || x.kind === 'tap');
    if (reads.length) this.readsUnanswered += reads.length;
    const longLook = !!v.gazeId && v.gazeFor >= 12 && this.longLookAt !== v.gazeId;
    if (longLook) this.longLookAt = v.gazeId;
    if (!source && ((this.readsUnanswered >= 3 && reads.length) || longLook) && now >= this.readArmedUntil) {
      // Once, early, it always does: the first sign that attention is heard.
      if (this.attentionVoices === 0 || this.rng.chance(0.4)) this.readArmedUntil = now + 20;
      this.readArmedFor = (longLook ? v.gazeId : reads[reads.length - 1]?.id) ?? null;
    }
    let certain = false;
    if (!source && now < this.readArmedUntil && this.readArmedFor) {
      source = this.readArmedFor;
      certain = true;
    }
    this.prevGaze = { id: v.gazeId, held: v.gazeFor };
    if (!source || this.phase === 'arrival') return;
    if (now - this.lastAttentionVoice < 70 || (now < 300 && this.attentionVoices >= 4)) return;
    if (!this.scheduler.majorFree(now) || !this.pacing.intenseFree(now) || this.pacing.repeats('voice', now, 20) || this.attending() || this.pacing.holding(now)) return;
    if (!certain && !this.rng.chance(0.4)) return;
    const p = PHRASE_BY_ID.get(source);
    if (!p) return;
    const ok = (x: Phrase | undefined): x is Phrase =>
      !!x && !!x.voice && !ARCS[x.id] && !KEPT_READINGS.has(x.id) && !this.memory.spoken.has(x.id) && (x.tier !== 'transform' || this.phase === 'transform');
    const cands = [...(p.contradicts ?? []), ...(p.echoes ?? [])].map((r) => PHRASE_BY_ID.get(r)).filter(ok);
    // A recorded line is preferred: if nothing related has a recording, something else from
    // the same wall that does; failing that, whatever is related.
    if (!cands.some((x) => performancesFor(x.id).length)) {
      const sameWall = PHRASES.filter((x) => x.surface === p.surface && x.id !== p.id && ok(x) && performancesFor(x.id).length);
      if (sameWall.length) cands.unshift(sameWall[this.rng.int(0, sameWall.length - 1)]);
    }
    cands.sort((a, b) => Math.sign(performancesFor(b.id).length) - Math.sign(performancesFor(a.id).length));
    const q = cands[0];
    if (!q) return;
    this.lastAttentionVoice = now;
    this.attentionVoices++;
    this.readsUnanswered = 0;
    this.readArmedUntil = -Infinity;
    const pos: VoicePosition = this.visible.has(q.id) ? { kind: 'surface', phraseId: q.id } : { kind: 'beyond', surface: q.surface === this.facing ? this.rng.pick(SURFACES.filter((w) => w !== this.facing)) : q.surface };
    this.speakPhrase('voice-attention', q, pos, 0.8, undefined, 0.6);
  }

  /**
   * Once in a visit, late, a line already heard comes back in a different reading, from
   * somewhere else: the same words, a different person, a different meaning.
   */
  private ruleRehear() {
    if (this.reheard || (this.phase !== 'contradiction' && this.phase !== 'transform')) return;
    const now = this.now;
    if (this.pacing.sinceDev(now) < 10 || !this.scheduler.majorFree(now) || !this.pacing.intenseFree(now) || this.attending() || this.pacing.holding(now)) return;
    const id = [...this.heard.keys()].find((x) => performancesFor(x).length > 1 && now - (this.memory.spoken.get(x) ?? now) > 60);
    const p = id ? PHRASE_BY_ID.get(id) : undefined;
    if (!p) return;
    this.reheard = true;
    const pos: VoicePosition = this.visitor.near ? { kind: 'beyond', surface: this.rng.pick(SURFACES) } : { kind: 'chair' };
    this.speakPhrase('rehear', p, pos, 0.5, undefined, 0.6);
  }

  /**
   * Once, after the first couple of minutes, the room holds a long silence: the hum almost
   * gone, nothing written, nobody speaking, for half a minute or so. Nothing interrupts it.
   */
  private ruleHeldSilence() {
    if (this.heldSilenceDone || this.now < 120 || (this.phase !== 'contradiction' && this.phase !== 'transform')) return;
    if (this.pacing.sinceDev(this.now) < 8 || !this.scheduler.majorFree(this.now) || this.attending() || this.visitor.speed > 0.5) return;
    this.heldSilenceDone = true;
    const seconds = this.rng.range(30, 42);
    this.heldSilenceUntil = this.now + seconds;
    this.queue(0, { type: 'silence', depth: 0.92, seconds, dim: 0.15, dimSeconds: 16 }, 'held-silence', { major: true, ttl: 10 });
  }

  /**
   * One memory a visit intrudes on the room as light: "the light in the kitchen at four in the
   * afternoon", read, and for a few seconds that light falls across the wall where the words
   * are. Late (from 150 s, once the room has begun to contradict itself), so it is not spent on
   * arrival. If the line isn't on a wall yet, it is written first where the visitor is looking;
   * the light comes when they stay with it (2.5 s), or touch it. Then the room holds still.
   */
  static readonly MEMORY = { phraseId: 'kitchen-light', attack: 3, hold: 6, release: 4 };
  /** The visitor is staying with the memory's line (or touched it) and its light is still to come. */
  private memoryAwaited(): boolean {
    if (this.memoryPlayed || !this.memoryOffered || !this.visible.has(Director.MEMORY.phraseId)) return false;
    return this.memoryTouched || this.visitor.gazeId === Director.MEMORY.phraseId;
  }

  private ruleMemory() {
    // Cereal is the same kitchen: if it has opened this visit, the late light isn't offered.
    if (this.memoryPlayed || this.departing || this.scenes.paintedPlayed || this.scenes.kitchenTaken) return;
    if (this.now < 150 || (this.phase !== 'contradiction' && this.phase !== 'transform')) return;
    const m = Director.MEMORY;
    // Its own hold (below) doesn't keep it waiting.
    const free = this.scheduler.majorFree(this.now) && (!this.pacing.holding(this.now) || this.pacing.heldUntil <= this.memoryHoldTo);
    if (!this.visible.has(m.phraseId)) {
      if (this.memoryOffered || !free || this.pacing.repeats('text', this.now, 8) || this.withheld().includes(m.phraseId)) return;
      const p = PHRASE_BY_ID.get(m.phraseId)!;
      this.memoryOffered = true;
      this.memoryQuietUntil = this.now + 15;
      // The line arrives alone: nothing else is revealed, written or begun with it, so a visitor
      // who stays with it gets the light, not whatever else happened at the same moment.
      this.memoryHoldTo = this.now + 2.4;
      this.pacing.holdFor(this.now, 2.4);
      this.visible.set(p.id, { mode: 'shown', since: this.now, base: true });
      this.memory.surfaced.set(p.id, this.now);
      this.queue(0, {
        type: 'write', key: `memory:${p.id}`, text: p.text, hand: p.hand === 'typed' ? 'pencil' : p.hand, size: 's',
        surface: this.facing, purpose: 'recall', ttl: 0, source: p.id,
      }, 'memory-offer');
      return;
    }
    const v = this.visitor;
    // While they stay with it, nothing else is revealed or written: the room waits with them.
    if (this.memoryAwaited() && (!this.pacing.holding(this.now) || this.pacing.heldUntil <= this.memoryHoldTo)) {
      this.memoryHoldTo = this.now + 0.3;
      this.pacing.holdFor(this.now, 0.3);
    }
    const looked = v.gazeId === m.phraseId && v.gazeFor >= 2.5;
    if (!looked && !this.memoryTouched) return;
    // Never on top of a voice (one just heard, or one about to be), a dim, a flash.
    if (!free || this.pacing.repeats('voice', this.now, 4) || this.pacing.repeats('light', this.now, 10)) return;
    this.memoryPlayed = true;
    this.memoryQuietUntil = -Infinity;
    // Later memories keep their distance from this one too.
    this.scenes.lastEnded = this.now + m.attack + m.hold + m.release;
    this.queue(0, { type: 'memory', phraseId: m.phraseId, attack: m.attack, hold: m.hold, release: m.release }, 'memory', { major: true, ttl: 3 });
    // The light is the answer: nothing else while it is there, and a moment after.
    this.pacing.holdFor(this.now, m.attack + m.hold + m.release + 3);
  }

  /**
   * A living memory (src/state/MemoryDirector.ts decides when): once begun, the room waits with
   * it (no voices, nothing new written or revealed) until the App says it has gone.
   */
  private ruleScenes() {
    const v = this.visitor;
    const free = this.scheduler.majorFree(this.now) && !this.pacing.holding(this.now) && !this.pacing.repeats('voice', this.now, 4) && !this.pacing.repeats('light', this.now, 10);
    const start = this.scenes.update({
      now: this.now,
      visible: (id) => this.visible.has(id),
      gazeId: v.gazeId,
      gazeFor: v.gazeFor,
      free,
      // (Kitchen-light having played is not a block: the arc and the spacing decide. Only one
      // waiting to be seen, or playing, is.)
      otherMemory: this.memoryAwaited(),
      departing: this.departing,
      kitchenPlayed: this.memoryPlayed,
      facing: this.facing,
      phase: this.phase,
      chairDistance: v.distance,
      finished: (id) => !this.unfinished.has(id),
      stillFor: v.stillFor,
      kneeling: v.kneeling,
      variantCtx: () => ({
        visits: this.visits,
        field: { ...this.field.v },
        motifs: [...this.memory.formed.keys()],
        withdrew: v.sinceWithdraw < 60,
      }),
    });
    if (start?.kind === 'vignette') this.queue(0, { type: 'vignette', id: start.id, phraseId: start.phraseId, variant: start.variant }, 'vignette', { major: true, ttl: 3 });
    else if (start) this.queue(0, { type: 'memory-scene', id: start.id, phraseId: start.phraseId, variant: start.variant, minHold: start.minHold, maxHold: start.maxHold }, 'memory-scene', { major: true, ttl: 3 });
    if (this.scenes.active) this.pacing.holdFor(this.now, 0.5);
    // A later memory's line is offered as the kitchen-light memory's is: written alone, where
    // the visitor is looking, and the room holds still a moment so a visitor who stays with it
    // gets the memory, not whatever else happened at the same time.
    const offer = this.scenes.offer({
      now: this.now,
      phase: this.phase,
      // (Never into a busy room: the line arrives into quiet, or waits.)
      free: free && !this.pacing.repeats('text', this.now, 8) && !this.pacing.crowded(this.now),
      visibleFacing: (id) => this.visible.has(id) && PHRASE_BY_ID.get(id)?.surface === this.facing,
      departing: this.departing,
      otherMemory: this.memoryAwaited(),
      facing: this.facing,
      darkEnded: Number.isFinite(this.heldSilenceUntil) ? this.heldSilenceUntil : null,
      kitchenPlayed: this.memoryPlayed,
      kitchenOffered: this.memoryOffered,
    });
    if (offer) {
      const p = PHRASE_BY_ID.get(offer.phraseId);
      if (!p) return;
      // The door's line is written beneath the room's drawn door, which its memory opens from.
      const under = offer.id === 'door' ? DRAWING_BY_ID.get('ghost-door') : undefined;
      this.visible.set(p.id, { mode: 'shown', since: this.now, base: true });
      this.memory.surfaced.set(p.id, this.now);
      this.pacing.holdFor(this.now, 2.4);
      this.queue(0, {
        type: 'write', key: `memory:${p.id}`, text: p.text, hand: p.hand === 'typed' ? 'pencil' : p.hand, size: 's',
        surface: under ? under.surface : this.facing, purpose: 'recall', ttl: 0, source: p.id,
        ...(under ? { under: under.id } : {}),
      }, 'memory-offer');
    }
  }

  /**
   * The App reports a living memory has gone (or could not begin). `seen`: watched past its first
   * moments. Returns whether it counts as seen (persisted for revisits).
   */
  /** The App could not begin it (its art or sound failed to load): not spent. */
  memoryFailed(id: string): void {
    this.scenes.cancel(id, this.now);
  }

  /** A memory the Director didn't begin is playing (the artist's panel): the room waits with it. */
  memoryExternal(id: string): void {
    this.scenes.external(id, this.now);
  }

  memoryEnded(id: string, seen: boolean, ranToEnd: boolean): boolean {
    const counted = this.scenes.ended(id, this.now, seen, ranToEnd);
    this.scenesQuietAt = this.now + 6;
    // After a vignette the room doesn't answer at once with another voice: its quiet is part of it.
    if (VIGNETTE_BY_ID.has(id)) this.memoryQuietUntil = Math.max(this.memoryQuietUntil, this.now + 20);
    if (counted) {
      // Staying with a memory is attention, as returning to a line is.
      this.engagement.raise('memory', this.now, id);
      // A moment to come back to the room before anything else.
      this.pacing.holdFor(this.now, 6);
    }
    return counted;
  }

  /**
   * The one drawing made while the visitor watches: when they have stayed with its line a few
   * seconds, the hand draws beside it (two cups, the second never finished). Never while the
   * room is holding its breath, never on top of other writing appearing.
   */
  private ruleDrawings() {
    const v = this.visitor;
    if (this.now < this.drawAgainAt) return;
    for (const d of DRAWINGS) {
      if (d.when === 'start' || this.drawn.has(d.id)) continue;
      const { seen, gaze } = d.when;
      if (!this.visible.has(seen) || v.gazeId !== seen || v.gazeFor < gaze) continue;
      if (this.pacing.holding(this.now) || this.pacing.repeats('text', this.now, 4)) continue;
      this.drawn.add(d.id);
      this.queue(0.4, { type: 'draw', id: d.id }, `draw:${d.id}`);
    }
  }

  /**
   * Writing in the air, once a visit: when the visitor has been close to the chair and stepped
   * back from it (or has kept away from it a long time) and looks at it, "Please don't come any
   * closer." is written in the air in front of it. It goes as they come near: the request and
   * its undoing in one gesture (or, if those words are already on a wall, "far enough to miss
   * you", or "Come back. Don't."). Never while "stay" is unfinished (it would answer it),
   * and never in the first minute.
   */
  private ruleAir() {
    if (this.airDone || this.now < 60) return;
    const v = this.visitor;
    // An answer to stepping back (well clear of the chair, so there is room to come closer), not
    // to standing by the door; only after a long time apart for someone who never came near.
    const back = v.approaches.length > 0;
    if (v.distance < 2.1 || v.gazeChairFor < 1.5 || v.speed > 0.3) return;
    if (!back && this.now < 150) return;
    // Words that are not already on a wall: a repeat would read as a copy, not as something said.
    const withheld = this.withheld();
    const phraseId = Director.AIR_LINES.find((id) => !this.visible.has(id) && !withheld.includes(id));
    if (!phraseId) return;
    // A rare gesture, so not held back by the room being busy, only by it being busy right now:
    // nothing for a few seconds before it and nothing about to happen.
    if (!this.scheduler.majorFree(this.now) || this.pacing.holding(this.now) || this.pacing.sinceDev(this.now) < 6) return;
    if (this.scheduler.pending().some((e) => e.at - this.now < 6 && devKind(e.payload.cue) && devKind(e.payload.cue) !== 'silence')) return;
    this.airDone = true;
    this.queue(0, { type: 'air', phraseId, toward: 0.6, aside: 0.55, height: 0.8 }, 'air', { major: true, ttl: 4 });
    // Then let it be read, and let them decide whether to come closer.
    this.pacing.holdFor(this.now, 12);
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

  /**
   * Encounters. The same words, met again, in a different context. Each phrase has an arc —
   * authored for the central ones, derived from relations for the rest — and each meeting
   * plays the next beat of it. Most beats are nothing at all; empty beats count too, so the
   * visitor never learns that looking makes things happen.
   */
  private ruleEncounters() {
    // A beat that could not play when its meeting began waits while the visitor keeps looking.
    const tries: string[] = [];
    for (const [id, until] of this.heldBeats) {
      if (this.now > until || !this.visitor.encounters.get(id)?.open) this.heldBeats.delete(id);
      else tries.push(id);
    }
    for (const { id } of this.visitor.encounterStarted) tries.push(id);
    for (const id of tries) {
      const p = PHRASE_BY_ID.get(id);
      if (!p) continue;
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
        if (!this.heldBeats.has(id)) this.heldBeats.set(id, this.now + 12);
      };
      if (!this.scheduler.ready('encounter', this.now, 8)) {
        hold();
        continue;
      }
      if (beat.gestures.some((g) => ('sound' in g || ('voice' in g && g.from === 'beyond')) && this.situations.claimed('beyond'))) continue;
      // A voice belongs to the moment of looking; if the room has just spoken, the beat waits a
      // little. (A meeting is what the visitor is attending to: it outranks recovery.)
      if (beat.gestures.some((g) => 'voice' in g || 'breath' in g || 'silence' in g || 'sound' in g) && !this.scheduler.majorFree(this.now)) {
        hold();
        continue;
      }
      // A beat that has already waited plays at once: the wait was its pause.
      const waited = this.heldBeats.has(id);
      this.heldBeats.delete(id);
      this.scheduler.mark('encounter', this.now);
      this.played.set(id, n + 1);
      this.playBeat(p, n + 1, beat, waited);
    }
  }

  /** Beat for the (n+1)th meeting, or null when the phrase has nothing more and should rest. */
  private beatFor(p: Phrase, n: number): EncounterBeat | null {
    const arc = ARCS[p.id] ?? this.defaultArc(p);
    const variants = arc[n];
    if (!variants) return n < 6 ? { gestures: [] } : null;
    const v = this.visitor;
    return (
      variants.find((b) => {
        const w = b.when;
        if (!w) return true;
        if (w.phase && !w.phase.includes(this.phase)) return false;
        if (w.motif && !this.memory.has(w.motif)) return false;
        if (w.near !== undefined && w.near !== v.near) return false;
        return true;
      }) ?? { gestures: [] }
    );
  }

  /** A restrained arc from a phrase's own relations: alone; one relation; a different context; rest. */
  private defaultArc(p: Phrase): Arc {
    const late = this.phase === 'contradiction' || this.phase === 'transform';
    const echoes = (p.echoes ?? []).map((id) => PHRASE_BY_ID.get(id)).filter((x): x is Phrase => !!x);
    const contra = (p.contradicts ?? []).map((id) => PHRASE_BY_ID.get(id)).filter((x): x is Phrase => !!x);
    const ok = (x: Phrase) => x.tier !== 'transform' || this.phase === 'transform';
    const first = [...(this.phase === 'arrival' ? echoes : [...echoes, ...contra])].find(ok);
    const second = [...(late ? [...contra, ...echoes] : [...echoes, ...contra])].find((x) => ok(x) && x !== first);
    const relate = (r: Phrase): Gesture =>
      r.tier === 'annotation' || (!this.visible.has(r.id) && r.surface !== p.surface)
        ? { annotate: r.id, hand: r.tier === 'annotation' ? r.hand : 'faint', strike: late && contra.includes(r) && this.rng.chance(0.3) }
        : { reveal: r.id, link: r.surface === p.surface };
    const arc: Arc = [[{ gestures: [] }]];
    arc.push([{ gestures: first ? [relate(first)] : [], delay: 1.5 }]);
    if (second) arc.push([{ gestures: [relate(second)], delay: 1.5 }]);
    else if (p.voice) arc.push([{ gestures: [{ voice: p.voice === 'flat' ? 'tender' : 'flat', from: 'surface', gain: 0.5 }], delay: 2 }]);
    return arc;
  }

  private playBeat(p: Phrase, n: number, beat: EncounterBeat, waited = false) {
    const rule = `encounter:${p.id}:${n}`;
    const d = waited ? 0.3 : beat.delay ?? 1.5;
    const beyond = (): VoicePosition => ({ kind: 'beyond', surface: this.rng.pick(SURFACES.filter((s) => s !== this.facing)) });
    for (const g of beat.gestures) {
      if ('voice' in g) {
        const pos: VoicePosition =
          g.from === 'behind' ? { kind: 'behind' } : g.from === 'chair' ? { kind: 'chair' } : g.from === 'surface' ? { kind: 'surface', phraseId: p.id } : g.from === 'nowhere' ? { kind: 'nowhere' } : beyond();
        this.voice(rule, d, g.voice, p.text, p.text, pos, { phraseId: p.id, gain: g.gain ?? 0.5, ttl: 15, priority: 6 });
        this.memory.spoken.set(p.id, this.now + d);
      } else if ('annotate' in g) {
        const a = PHRASE_BY_ID.get(g.annotate);
        if (!a) continue;
        this.queue(d, {
          // An authored answer is written to be read from where the phrase is read.
          type: 'write', key: `enc:${p.id}:${n}`, text: a.text, hand: g.hand ?? a.hand, size: ARCS[p.id] ? 's' : 'xs', beside: p.id, purpose: 'annotation',
          strike: g.strike ? p.id : undefined, ttl: 300, source: a.id,
        }, rule);
      } else if ('reveal' in g) {
        if (!this.visible.has(g.reveal)) this.reveal(g.reveal, d, rule, 'emerge', 8);
        const r = PHRASE_BY_ID.get(g.reveal);
        if (g.link && r && r.surface === p.surface) this.queue(d + 2, { type: 'link', a: p.id, b: r.id, ttl: 60 }, rule);
      } else if ('sound' in g) {
        const pos: VoicePosition = g.sound === 'chair-creak' ? { kind: 'chair' } : beyond();
        // A sound in a meeting is an event of its own: it keeps its distance from voices.
        this.queue(d, { type: 'sound', kind: g.sound, position: pos, gain: g.gain ?? 0.45 }, rule, { major: true, ttl: 8 });
      } else if ('silence' in g) {
        this.queue(d, { type: 'silence', depth: g.silence, seconds: g.seconds }, rule, { priority: 3 });
      } else if ('breath' in g) {
        this.fragment(rule, VOICE_FRAGMENTS.find((f) => f.id === 'vf-breath')!, { kind: g.breath }, d, 0.4);
      }
    }
  }

  /** Warm memories return when the visitor is far away. */
  private ruleWarmResurface() {
    const f = this.field.v;
    const mem = this.memory;
    if (!mem.warmMemories.length || f.solitude < 0.45 || this.visitor.distance < 2.2) return;
    if (!this.cool('resurface', 70) || this.pacing.holding(this.now) || this.attending() || this.pacing.crowded(this.now)) return;
    this.used('resurface');
    const id = mem.warmMemories[this.rng.int(0, mem.warmMemories.length - 1)];
    const p = PHRASE_BY_ID.get(id)!;
    this.queue(0, {
      type: 'write', key: `recall:${id}:${Math.round(this.now)}`, text: p.text, hand: 'cyan', size: 'xs', surface: this.facing, purpose: 'recall', ttl: 60, source: id,
    }, 'resurface');
    const f2 = this.rng.chance(0.5) ? 'vf-laugh-next-room' : 'vf-hum';
    this.fragment('resurface', VOICE_FRAGMENTS.find((x) => x.id === f2)!, { kind: 'beyond', surface: this.rng.pick(SURFACES) }, 4, 0.45);
  }

  /** Music arrives sometimes, and sometimes leaves before it resolves. */
  private ruleMusic() {
    const f = this.field.v;
    const gap = { arrival: 9999, familiar: 90, contradiction: 75, transform: 65 }[this.phase];
    if (!this.cool('music', gap) || this.now < 40 || this.situations.claimed('music') || !this.pacing.intenseFree(this.now) || this.attending() || this.pacing.crowded(this.now)) return;
    const pressure = Math.max(f.warmth, f.reminiscence * 1.1, f.dissonance, f.hush * 0.9);
    if (pressure < 0.42) return;
    this.used('music');
    let mood: 'warm' | 'tender' | 'uneasy' | 'sparse' | 'memory' = 'sparse';
    if (f.dissonance > 0.45 && f.exposure > 0.25) mood = 'uneasy';
    else if (f.reminiscence > 0.4) mood = 'memory';
    else if (f.warmth > 0.45) mood = this.rng.chance(0.5) ? 'warm' : 'tender';
    this.queue(0, { type: 'music', mood, notes: this.rng.int(4, 9), truncate: this.rng.chance(0.4) }, 'music', { major: true, ttl: 30 });
  }

  /** Late: something already read is written again elsewhere, beside something that changes it. */
  private ruleRecontext() {
    // Context changes belong to the second half of a visit, but that can begin within a minute.
    if ((this.phase !== 'transform' && this.phase !== 'contradiction') || this.now < 90 || !this.cool('recontext', this.phase === 'transform' ? 40 : 60)) return;
    if (this.pacing.repeats('text', this.now, 10) || this.pacing.holding(this.now) || this.pacing.crowded(this.now)) return;
    // Lines kept for particular moments, and late lines, are never borrowed as context early.
    const fits = (id: string) => {
      const b = PHRASE_BY_ID.get(id);
      return !!b && !this.reserved(id) && (b.tier !== 'transform' || this.phase === 'transform');
    };
    const options = RECONTEXTS.filter((r) => !this.recontextsUsed.has(r.id) && this.visitor.read.has(r.phrase) && fits(r.beside));
    if (!options.length) return;
    this.used('recontext');
    const r = options[this.rng.int(0, options.length - 1)];
    this.recontextsUsed.add(r.id);
    if (!this.visible.has(r.beside)) this.reveal(r.beside, 0, 'recontext', 'emerge', 8);
    this.queue(6, {
      type: 'write', key: `rc:${r.id}`, text: PHRASE_BY_ID.get(r.phrase)!.text, hand: r.hand, size: 'xs', beside: r.beside, purpose: 'recontext', ttl: 120, source: r.phrase,
    }, 'recontext');
  }

  /**
   * Contamination. Each wall keeps its character, but as the visit deepens, writing
   * migrates: a line is written again on a wall where it doesn't belong, beside the line
   * that most belongs there — joy among the shame, a retraction among the warm memories.
   * Late in the visit, the line the visitor held longest is written small on the empty
   * wall behind them.
   */
  private ruleContaminate() {
    const allowed = { arrival: 0, familiar: 1, contradiction: 3, transform: 7 }[this.phase];
    if (this.now < 45 || this.strays.size >= allowed) return;
    if (!this.cool('stray', 40) || this.pacing.holding(this.now) || this.pacing.crowded(this.now)) return;

    if (this.phase === 'transform' && !this.heldMoved) {
      let held: Phrase | undefined;
      let most = 6;
      for (const [id, secs] of this.visitor.gazeTotals) {
        const p = PHRASE_BY_ID.get(id);
        if (p && p.surface !== 'south' && p.tier !== 'annotation' && secs > most && !this.strays.has(id)) {
          most = secs;
          held = p;
        }
      }
      // Only once it is actually written: nothing held long enough yet means later, and while the
      // visitor faces that wall it waits — keeping its place rather than giving it to another stray.
      if (held && this.facing === 'south') return;
      if (held) {
        this.heldMoved = true;
        this.used('stray');
        this.strays.set(held.id, 'south');
        this.queue(0, {
          type: 'write', key: `stray:${held.id}`, text: held.text, hand: held.hand === 'typed' ? 'pencil' : held.hand, size: 'xs',
          surface: 'south', purpose: 'recontext', ttl: 0, source: held.id,
        }, 'stray-held');
        return;
      }
    }

    // A wall the visitor isn't looking at, so the change is found rather than watched.
    const walls = CHARACTER_WALLS.filter((w) => w !== this.facing && w !== 'south');
    const wall = this.rng.pick(walls);
    const anchor = PHRASES.filter((p) => p.surface === wall && this.visible.get(p.id)?.mode === 'shown' && p.tier !== 'near' && !this.strayAnchors.has(p.id))
      .map((p) => ({ p, b: belonging(p, wall) }))
      // Only writing that belongs where it is can be the thing a stray lands beside.
      .filter((x) => x.b > 0)
      .sort((a, b) => b.b - a.b || (a.p.id < b.p.id ? -1 : 1))
      .slice(0, 4);
    if (!anchor.length) return;
    const open = new Set<Tier>(TIER_OPEN[this.phase].filter((t) => t !== 'near'));
    // Floor and ceiling writing belongs to where it is; it never wanders.
    const cands = PHRASES.filter(
      (p) => p.surface !== wall && p.surface !== 'floor' && p.surface !== 'ceiling' && open.has(p.tier) && !this.strays.has(p.id) && !this.reserved(p.id) && p.kind !== 'word' && p.kind !== 'passage',
    ).map((p) => {
      // Strongly something else, and nothing like this wall.
      const foreign = 1 - belonging(p, wall);
      const own = Math.max(...CHARACTER_WALLS.filter((w) => w !== wall).map((w) => belonging(p, w)));
      // Unseen material arriving in the wrong place is stronger than a copy of something already read.
      const unseen = this.visible.has(p.id) || this.visitor.read.has(p.id) ? 0 : 0.12;
      return { p, s: foreign * own + unseen + this.selector.score(p, this.ctx()) * 0.15 };
    });
    cands.sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1));
    const top = cands.slice(0, 10);
    const i = this.rng.weighted(top.map((c) => Math.exp((c.s - top[0].s) / 0.2)));
    if (i < 0) return;
    const p = top[i].p;
    const beside = anchor[this.rng.int(0, anchor.length - 1)].p;
    this.strayAnchors.add(beside.id);
    this.used('stray');
    this.strays.set(p.id, wall);
    this.queue(0, {
      type: 'write', key: `stray:${p.id}`, text: p.text, hand: p.hand, size: p.size === 'xs' ? 'xs' : 's',
      beside: beside.id, purpose: 'recontext', ttl: 0, source: p.id,
    }, 'stray');
  }

  /** Life elsewhere: muffled laughter, two people talking, someone humming. */
  private ruleDistantLife() {
    if (this.phase === 'arrival' || this.now < this.nextDistantLife) return;
    // Not while someone is reading: the room's own life doesn't talk over attention.
    if (this.visitor.gazeId || this.attending() || this.pacing.holding(this.now) || this.pacing.crowded(this.now) || !this.scheduler.majorFree(this.now)) return;
    // Distant life is mostly situational now; this is only a fallback for long quiet stretches.
    if (this.situations.claimed('beyond') || this.now - this.situations.lastBeyond < 90 || !this.pacing.intenseFree(this.now)) return;
    this.nextDistantLife = this.now + this.rng.range(50, 90);
    const ctx = this.ctx();
    const weights = VOICE_FRAGMENTS.filter((f) => f.kind !== 'breath' && !this.owned.has(f.id)).map((f) => {
      const pull: Record<string, number> = {
        happiness: ctx.field.warmth + ctx.field.reminiscence, connection: ctx.field.solitude, isolation: ctx.field.solitude,
        nostalgia: ctx.field.reminiscence, misunderstanding: ctx.field.dissonance, affection: ctx.field.warmth,
      };
      let s = 0;
      // (Typed explicitly: @theatre/core's declarations narrow Object.entries globally.)
      for (const [k, w] of Object.entries(f.dims) as [string, number | undefined][]) s += (w ?? 0) * (pull[k] ?? 0.2);
      return { f, s: s + 0.1 };
    });
    const i = this.rng.weighted(weights.map((x) => x.s));
    if (i < 0) return;
    const frag = weights[i].f;
    const wall = this.rng.pick(SURFACES.filter((s) => s !== this.facing));
    this.fragment('distant-life', frag, { kind: 'beyond', surface: wall }, 0, 0.4);
  }

  private ruleKneel() {
    const v = this.visitor;
    if (!v.kneeling || this.kneelVoiced || v.kneelTime < 4) return;
    // The chair's vignette (a child, asking someone to stay) may still come: its moment is kept.
    if (this.scenes.claimsChair()) return;
    this.kneelVoiced = true;
    if (this.rng.chance(0.4)) this.speakPhrase('kneel', PHRASE_BY_ID.get('small-minute')!, { kind: 'chair' }, 2, 'child', 0.45);
  }

  /** Late, while nobody is looking, the chair is not quite where it was. */
  private ruleChairNudge(input: VisitorInput) {
    if (this.phase !== 'transform' || this.chairNudges >= 1 || this.now - this.transformAt < 60 || this.pacing.holding(this.now)) return;
    if (input.gazeChair || this.visitor.distance < 2.2 || this.visitor.totalChairGaze < 8) return;
    this.chairNudges++;
    this.queue(0, { type: 'chairNudge', dx: this.rng.range(-0.06, 0.06), dz: this.rng.range(-0.06, 0.06), dyaw: this.rng.range(-0.2, 0.2) }, 'chair-nudge');
    if (this.visits > 1) this.reveal('moving-chair', 90, 'chair-nudge', 'emerge', 10);
  }

  private onMotif(m: Motif) {
    switch (m) {
      case 'hesitation':
        if (PHRASE_BY_ID.get('if-closer')) this.speakPhrase('motif-hesitation', PHRASE_BY_ID.get('if-closer')!, { kind: 'chair' }, 8, 'whisper', 0.6);
        break;
      case 'stillness':
        this.reveal('dont-have-say', this.pacing.repeats('voice', this.now, 20) ? 20 : 2, 'motif-stillness', this.visitor.stillFor > 3 ? 'still' : 'emerge', 10);
        break;
      case 'warmth':
        this.fragment('motif-warmth', VOICE_FRAGMENTS.find((f) => f.id === 'vf-laugh-next-room')!, { kind: 'beyond', surface: 'east' }, 3, 0.45);
        break;
      case 'distance':
        this.reveal(this.rng.chance(0.5) ? 'far-enough' : 'happiest-unneeded', 2, 'motif-distance', 'emerge', 10);
        break;
      case 'wandering':
        this.fragment('motif-wandering', VOICE_FRAGMENTS.find((f) => f.id === 'vf-two-voices')!, { kind: 'beyond', surface: this.rng.pick(SURFACES) }, 6, 0.35);
        break;
      default:
        break;
    }
  }

  private onPhase(p: Phase) {
    if (p === 'contradiction') {
      // The contradiction phase brings the fear of being left onto the wall; what it means is left to later meetings.
      if (!this.visible.has('afraid-leave')) this.reveal('afraid-leave', 0, 'phase-contradiction', 'emerge', 6);
    }
    if (p === 'transform') {
      // Already inside the long held silence: that silence, and its dark, are the turn.
      if (this.now + 2 > this.heldSilenceUntil) this.queue(2, { type: 'silence', depth: 0.7, seconds: 14, dim: 0.15, dimSeconds: 11 }, 'phase-transform', { major: true, ttl: 30 });
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
      roomScale: Math.max(1, 1 + 0.13 * f.solitude * (0.4 + late) + 0.07 * (v.kneeling ? 1 : 0) + 0.04 * f.hush - 0.04 * f.exposure * late),
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
    this.lastContrib = { key, keep: keptWord(text), surface: this.facing, at: this.now };
    // The words are always written. The room does not reply: at most one other thing
    // happens, often nothing, and anything related surfaces much later, as if by itself.
    this.queue(0.5, { type: 'write', key, text, hand: 'visitor', size: text.length > 60 ? 'xs' : 's', surface: this.facing, purpose: 'contribution', ttl: 0 }, 'contribution');
    const options = it.gestures.filter((g) => g !== 'writeOnWall' && g !== 'music');
    // Its own stream of chance, so what a visitor's words bring doesn't shift whenever some
    // unrelated rule of the room is added or changed.
    const r = new Rng(hashString(`contribution:${this.seed}:${this.contributionCount}`));
    if (!options.length || r.chance(0.4)) return;
    const g = r.pick(options);
    const later = r.range(60, 180);
    switch (g) {
      case 'quiet':
        this.queue(1, { type: 'silence', depth: 0.45 + 0.25 * it.intensity, seconds: 10 }, 'contribution-quiet', { major: true, ttl: 6 });
        break;
      case 'revealRelated': {
        const p = it.related.map((id) => PHRASE_BY_ID.get(id)).find((x) => x && x.tier !== 'annotation' && !this.visible.has(x.id));
        if (p) this.reveal(p.id, later, 'contribution-related', 'emerge', 12);
        break;
      }
      case 'distantRecollection': {
        const p = it.related.map((id) => PHRASE_BY_ID.get(id)).find((x) => x?.voice && !this.memory.spoken.has(x.id));
        if (p) this.speakPhrase('contribution-recollection', p, { kind: 'beyond', surface: this.rng.pick(SURFACES) }, later, 'distant', 0.45);
        else this.fragment('contribution-recollection', VOICE_FRAGMENTS.find((f) => f.id === 'vf-two-voices')!, { kind: 'beyond', surface: 'west' }, later, 0.35);
        break;
      }
      case 'rearrange': {
        const a = it.related[0];
        const b = it.contradictions[0];
        if (!a || !b) break;
        if (!this.visible.has(b)) this.reveal(b, later, 'contribution-rearrange', 'emerge', 10);
        const pa = PHRASE_BY_ID.get(a);
        const pb = PHRASE_BY_ID.get(b);
        if (pa && pb && pa.surface === pb.surface) this.queue(later + 12, { type: 'link', a, b, ttl: 60 }, 'contribution-rearrange');
        break;
      }
      case 'temperatureShift': {
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
        break;
      }
    }
  }

  /** The world could not find room for a piece of writing: let its relation be tried again later. */
  /** A drawing found no room on its wall: it may be tried again later, once. */
  drawFailed(id: string): void {
    if (this.drawRetried.has(id)) return;
    this.drawRetried.add(id);
    this.drawn.delete(id);
    this.drawAgainAt = this.now + 60;
  }
  private drawRetried = new Set<string>();
  private drawAgainAt = 0;

  writeFailed(key: string): void {
    // The memory's line found no room where the visitor was looking: offer it again later.
    if (key === `memory:${Director.MEMORY.phraseId}`) {
      const id = Director.MEMORY.phraseId;
      this.visible.delete(id);
      this.memory.surfaced.delete(id);
      this.memoryOffered = false;
      this.memoryQuietUntil = -Infinity;
    }
    if (key.startsWith('stray:')) {
      if (this.strays.get(key.slice(6)) === 'south') this.heldMoved = false;
      this.strays.delete(key.slice(6));
    }
    // A beat whose writing found no room is played again at the next meeting.
    const m = /^enc:([^:]+):(\d+)$/.exec(key);
    if (m) this.played.set(m[1], Math.max(0, Number(m[2]) - 1));
  }

  /** Clears contributions from memory (privacy: "forget what I wrote"). */
  forgetContributions(): void {
    this.lastContrib = null;
    this.situations.drop('erosion');
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
    this.scenes.dropEchoes();
  }

  /**
   * What a heard vignette left comes back, later in the visit, when it fits: never over anything,
   * never while the room holds still, and only where its condition holds (on a wall the visitor
   * isn't facing; by the chair). One that finds no moment before its time is up doesn't come.
   */
  private ruleEchoes() {
    if (this.departing || this.scenes.active || this.attending()) return;
    if (!this.scheduler.majorFree(this.now) || this.pacing.holding(this.now) || !this.pacing.intenseFree(this.now) || this.now < this.memoryQuietUntil) return;
    for (const p of this.scenes.dueEchoes(this.now)) {
      const cue = this.echoCue(p);
      if (!cue) continue;
      this.scenes.echoDone(p);
      for (const [delay, c, opts] of cue) this.queue(delay, c, `echo:${p.vignette}`, opts);
      return;
    }
  }

  private echoCue(p: PendingEcho): [number, Cue, { major?: boolean; ttl?: number; key?: string }][] | null {
    const def = VIGNETTE_BY_ID.get(p.vignette);
    if (!def) return null;
    const e = p.echo;
    const anchor = def.anchor.phrase ? PHRASE_BY_ID.get(def.anchor.phrase) : undefined;
    const w = e.when ?? {};
    if (w.notFacing && anchor && anchor.surface === this.facing) return null;
    if (w.facing && w.facing !== this.facing) return null;
    if (w.nearChair && this.visitor.distance > 1.4) return null;
    if (e.write) {
      const walls: Surface[] = ['north', 'east', 'south', 'west'];
      // Another wall, and not the one being looked at: it is found, not watched being written.
      const surface = e.write.otherWall ? walls.find((s) => s !== this.facing && s !== anchor?.surface) : undefined;
      return [[0, {
        type: 'write', key: `echo:${def.id}:${e.id}`, text: e.write.text, hand: e.write.hand, size: e.write.size,
        ...(e.write.beside ? { beside: e.write.beside } : {}), ...(surface ? { surface } : {}),
        purpose: e.write.beside ? 'annotation' : 'recall', ...(e.write.strike && e.write.beside ? { strike: e.write.beside } : {}), ttl: 0,
      }, { key: `echo:${def.id}:${e.id}` }]];
    }
    if (e.voice) {
      // A voice comes back only if it was recorded and kept.
      if (!this.scenes.isAvailable(def.id)) return null;
      const line = def.lines.find((l) => l.id === e.voice!.line);
      if (!line) return null;
      const position: VoicePosition = e.voice.place === 'beyond' ? { kind: 'beyond', surface: anchor?.surface ?? this.facing } : { kind: e.voice.place };
      const tag = `echo:${def.id}:${e.id}`;
      const laugh = !!e.voice.asLaugh;
      const out: [number, Cue, { major?: boolean; ttl?: number; key?: string }][] = [[0, {
        type: 'voice', kind: laugh ? 'laugh' : 'whisper', text: laugh ? null : line.text, caption: e.voice.caption ?? line.text, position, gain: 0.6,
        assetId: lineKey(def, line), tag,
      }, { major: true, ttl: 10 }]];
      if (e.voice.stopAfter) out.push([e.voice.stopAfter, { type: 'stopVoice', tag, fade: 0.6 }, {}]);
      return out;
    }
    return null;
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
      depth: +this.engagement.depth.toFixed(1),
      rhythm: this.pacing.rhythm(this.now, this.phase, this.engagement.activity(this.now)),
      visitor: this.visitor.snapshot(),
      field: this.field.snapshot(),
      memory: this.memory.snapshot(),
      visible: this.visible.size,
      situations: this.situations.snapshot(),
      strays: [...this.strays.entries()].map(([id, w]) => `${id}→${w}`),
      encounters: [...this.visitor.encounters.entries()].filter(([, e]) => e.count > 1).map(([id, e]) => `${id}×${e.count}`).slice(-8),
      pending: this.scheduler.snapshot(this.now).slice(0, 8).map((e) => `${e.in}s ${e.payload.rule}:${e.payload.cue.type}`),
      recent: this.log.slice(-8).map((c) => {
        const cu = c.cue as { phraseId?: string; caption?: string; text?: string };
        return `${c.t}s ${c.rule}:${c.cue.type} ${cu.phraseId ?? cu.caption ?? cu.text ?? ''}`.trim();
      }),
    };
  }
}
