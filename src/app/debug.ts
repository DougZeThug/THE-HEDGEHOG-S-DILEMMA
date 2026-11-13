import { PHRASES } from '../content/phrases';
import type { AppContext } from './context';

/** `?debug`: a few lines of the room's state over the picture, four times a second. */
export class Debug {
  readonly enabled = new URLSearchParams(location.search).has('debug');
  /** A smoothed frames per second (the playtests read it through `window.__hedgehog.fps`). */
  fps = 60;
  private lastShown = 0;

  constructor(private readonly ctx: AppContext) {
    if (this.enabled) ctx.dom.debug.hidden = false;
  }

  frame(dt: number) {
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (this.enabled && this.ctx.time - this.lastShown > 0.25) this.show();
  }

  private show() {
    const c = this.ctx;
    this.lastShown = c.time;
    const s = c.director.snapshot();
    const peak = c.audio ? c.audio.peakDb().toFixed(1) : 'off';
    c.dom.debug.textContent =
      `fps ${this.fps.toFixed(0)}  peak ${peak} dBFS  scale ${c.room.scale.toFixed(3)}  phrases ${PHRASES.length}  assets ${c.voices?.assetCount ?? 0}\n` +
      `phase ${s.phase}  gaze ${c.gazeId ?? '-'}${c.gazeChair ? ' [chair]' : ''}\n` +
      `visitor ${JSON.stringify(s.visitor)}\nfield ${JSON.stringify(s.field)}\nmotifs ${JSON.stringify(s.memory.strength)} formed ${s.memory.formed.join(',')}\n` +
      `env ${JSON.stringify(Object.fromEntries(Object.entries(c.director.env).map(([k, v]) => [k, +v.toFixed(2)])))}\n` +
      `situations ${JSON.stringify(s.situations)}\n` +
      `met again ${s.encounters.join(' ')}\n` +
      `pending\n  ${s.pending.join('\n  ')}\nrecent\n  ${s.recent.join('\n  ')}`;
  }
}
