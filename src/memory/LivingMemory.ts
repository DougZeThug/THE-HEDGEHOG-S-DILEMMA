import { MemoryPlaybackController } from './MemoryPlaybackController';
import { weightsFor } from './compose';
import { soundOf } from './theatre';
import type { Lifecycle, MemoryFrame, ReleaseReason, TimelineSource } from './types';
import type { Prepared } from './prepared';

export interface PlayOptions {
  reduced: boolean;
  gentle: boolean;
  onState?: (s: Lifecycle, why?: ReleaseReason) => void;
}

/** A memory playing: the App steps it once a frame. */
export class LivingMemory {
  readonly controller: MemoryPlaybackController;

  constructor(readonly prepared: Prepared, o: PlayOptions) {
    const { def, variant } = prepared;
    const { source: sheet, markers } = soundOf(def, variant, prepared.voices);
    // The voices' markers join the timeline's (the controller hands out the audio's cues from them).
    const timeline: TimelineSource = prepared.voices ? { sections: sheet.sections, markers, at: (p) => sheet.at(p), dispose: () => sheet.dispose() } : sheet;
    this.controller = new MemoryPlaybackController({
      timeline,
      audio: prepared.audio ?? undefined,
      weights: weightsFor(o.reduced, o.gentle),
      reduced: o.reduced,
      // The procedural entrance is only the soft start of what the timeline authors.
      entrance: Math.min(2, timeline.sections.active * 0.4),
      sways: def.sways ?? [],
      exit: def.exit,
      // If the artist moves the exit later in Studio, the memory still closes naturally there.
      maxHold: Math.max(def.maxHold, timeline.sections.exit),
      tail: def.tail,
      living: !!prepared.living,
      onState: o.onState,
    });
  }

  /** `now`: the audio time its position 0 stands for (MemoryPlaybackController). */
  start(now?: number): void {
    this.controller.start(now);
  }
  step(dt: number, now?: number): MemoryFrame | null {
    return this.controller.step(dt, now);
  }
  release(why: ReleaseReason): void {
    this.controller.release(why);
  }
  get state(): Lifecycle {
    return this.controller.state;
  }
  /** End now; the art is let go too. */
  dispose(fade = 0.3): void {
    this.controller.dispose(fade);
    this.prepared.dispose();
  }
}
