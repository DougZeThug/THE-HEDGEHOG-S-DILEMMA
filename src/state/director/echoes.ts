import { VIGNETTE_BY_ID, lineKey } from '../../content/vignettes';
import { PHRASE_BY_ID } from '../../content/phrases';
import { DRAWING_IDS } from '../../content/ids';
import { WALLS, oppositeWall } from '../../content/types';
import type { Cue, VoicePosition } from '../cues';
import type { PendingEcho } from '../MemoryDirector';
import { WriteKeys } from '../writeKeys';
import type { RuleHost } from './host';

/** What a heard vignette leaves comes back later in the visit, when it fits. */
export class Echoes {
  constructor(private readonly h: RuleHost) {}

  /**
   * What a heard vignette left comes back, later in the visit, when it fits: never over anything,
   * never while the room holds still, and only where its condition holds (on a wall the visitor
   * isn't facing; by the chair). One that finds no moment before its time is up doesn't come.
   */
  tick() {
    if (this.h.departing || this.h.scenes.active || this.h.attending()) return;
    if (!this.h.scheduler.majorFree(this.h.now) || this.h.pacing.holding(this.h.now) || !this.h.pacing.intenseFree(this.h.now) || this.h.now < this.h.shared.memoryQuietUntil) return;
    for (const p of this.h.scenes.dueEchoes(this.h.now)) {
      const cue = this.cue(p);
      if (!cue) continue;
      this.h.scenes.echoDone(p);
      for (const [delay, c, opts] of cue) this.h.queue(delay, c, `echo:${p.vignette}`, opts);
      return;
    }
  }

  private cue(p: PendingEcho): [number, Cue, { major?: boolean; ttl?: number; key?: string }][] | null {
    const def = VIGNETTE_BY_ID.get(p.vignette);
    if (!def) return null;
    const e = p.echo;
    const anchor = def.anchor.phrase ? PHRASE_BY_ID.get(def.anchor.phrase) : undefined;
    const w = e.when ?? {};
    if (w.notFacing && anchor && anchor.surface === this.h.facing) return null;
    if (w.facing && w.facing !== this.h.facing) return null;
    if (w.nearChair && this.h.visitor.distance > 1.4) return null;
    if (e.write) {
      // Another wall, and not the one being looked at: it is found, not watched being written.
      // The one behind them first (a wall beside can be at the edge of the view).
      const behind = this.h.facingWall() ? oppositeWall(this.h.facingWall()!) : undefined;
      // Beside the room's drawn door (B's "tomorrow"): found there, never watched being written.
      if (e.write.atDoor) {
        if (this.h.facing === 'south') return null;
        // (Under the drawing alone, never beside the door's own line: two lines together read as a caption.)
        return [[0, {
          type: 'write', key: WriteKeys.echo(def.id, e.id), text: e.write.text, hand: e.write.hand, size: e.write.size,
          under: DRAWING_IDS.ghostDoor, surface: 'south',
          purpose: 'recall', ttl: 0, found: true,
        }, { key: WriteKeys.echo(def.id, e.id) }]];
      }
      const surface = e.write.otherWall
        ? behind && behind !== anchor?.surface ? behind : WALLS.find((s) => s !== this.h.facing && s !== anchor?.surface)
        : undefined;
      return [[0, {
        type: 'write', key: WriteKeys.echo(def.id, e.id), text: e.write.text, hand: e.write.hand, size: e.write.size,
        ...(e.write.beside ? { beside: e.write.beside } : {}), ...(surface ? { surface } : {}),
        purpose: e.write.beside ? 'annotation' : 'recall', ...(e.write.strike && e.write.beside ? { strike: e.write.beside } : {}), ttl: 0,
        // Found on a wall later, not watched being written.
        found: true,
      }, { key: WriteKeys.echo(def.id, e.id) }]];
    }
    if (e.voice) {
      // A voice comes back only if it was recorded and kept.
      if (!this.h.scenes.isAvailable(def.id)) return null;
      const line = def.lines.find((l) => l.id === e.voice!.line);
      if (!line) return null;
      const position: VoicePosition = e.voice.place === 'beyond' ? { kind: 'beyond', surface: anchor?.surface ?? this.h.facing } : { kind: e.voice.place };
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
}
