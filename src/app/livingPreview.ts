import { idle } from '../core/time';
import { chooseVoices } from '../content/memory-voices';
import { SCENE_BY_PHRASE, SCENE_MEMORIES } from '../content/memories';
import { readMemoryCounts } from '../ui/prefs';
import { wallClock } from '../world/writePlan';
import type { AppContext, Peers } from './context';

/**
 * Getting painted memories ready before they are asked for (their runtime and art, fetched at
 * idle once their line is on a wall), and the `?memory=` preview that plays one a few seconds in.
 */
export class MemoryPreviews {
  private frameCount = 0;
  private readonly prefetched = new Set<string>();

  /**
   * `?memory=<id>[&variant=<v>][&voices=<version>]`: play a painted memory with its overheard
   * voices, as a preview, a few seconds after the room is open (takes kept or not; an unrecorded
   * line is a wordless voice with its caption).
   */
  private preview: { id: string; variant: string; voices: string | null; at: number | null } | null = null;

  /** `chunk`: the memories' runtime (a lazy chunk, loaded once; `LivingMemories` owns it). */
  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
    private readonly chunk: () => Promise<typeof import('../memory/runtime')>,
  ) {
    const { memory: id, studio, variant: v, voices } = ctx.params;
    if (id && !studio) {
      const variant = v ?? (SCENE_MEMORIES.find((m) => m.id === id)?.variants.first ?? 'first');
      this.preview = { id, variant, voices: voices ?? chooseVoices(id, variant, { seen: 0, visits: 1, field: {}, motifs: [], withdrew: false }), at: null };
    }
  }

  step() {
    this.stepPreview();
    this.prefetch();
  }

  /**
   * A memory's line is on a wall: fetch the runtime and its art now (at idle), so that when it is
   * asked for it begins without a wait.
   */
  private prefetch() {
    if (this.ctx.mode !== 'room' || (this.frameCount++ & 31) !== 0) return;
    const soon = new Set(this.ctx.director.scenes.comingSoon(this.ctx.director.now, this.ctx.director.memoryPlayed).map((m) => m.id));
    for (const [phraseId, m] of SCENE_BY_PHRASE) {
      // Its line on a wall, or its offer near (a reserved line is written only as it is offered).
      if (this.prefetched.has(m.id) || !(this.ctx.text.anchorOf(phraseId) || soon.has(m.id))) continue;
      this.prefetched.add(m.id);
      const variant = (readMemoryCounts()[m.id] ?? 0) > 0 ? m.variants.revisit[0] ?? m.variants.first : m.variants.first;
      idle(() => void this.chunk().then((rt) => rt.prefetch(m.id, variant, { quality: this.ctx.prefs.quality, screen: { width: innerWidth, height: innerHeight } })), 200);
    }
  }

  /** The `?memory=` preview's turn: a few seconds after the room is open, when nothing else is playing. */
  private stepPreview() {
    const pm = this.preview;
    if (pm && this.ctx.mode === 'room' && !this.peers.opening.active && !this.ctx.living) {
      const at = (pm.at ??= wallClock() + 4);
      if (wallClock() >= at) {
        this.preview = null;
        const phraseId = SCENE_MEMORIES.find((m) => m.id === pm.id)?.phraseId;
        if (phraseId) {
          if (!this.ctx.text.anchorOf(phraseId)) this.ctx.text.setShown(phraseId);
          setTimeout(() => {
            this.peers.living.frameMemory(phraseId);
            void (this.ctx.voices?.loadPreview() ?? Promise.resolve()).then(() => this.peers.living.playMemory(pm.id, phraseId, pm.variant, pm.voices, true));
          }, 600);
        }
      }
    }
  }
}
