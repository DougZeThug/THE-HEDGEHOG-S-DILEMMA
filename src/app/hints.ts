import { readTouchHintSeen, writeTouchHintSeen } from '../ui/prefs';
import { flashHint, HINT_MS } from './presentation';
import type { AppContext } from './context';

/**
 * The few words that tell a visitor how to move, shown once the room is theirs and only if they
 * haven't found out: how to pause, how to walk, that the words and the chair can be touched.
 */
export class Hints {
  private controlsShown = false;
  private walkShown = false;
  private touchShown = false;

  constructor(private readonly ctx: AppContext) {}

  /** Each frame once the room is theirs; `since`: seconds since the hand-off. */
  step(since: number) {
    const c = this.ctx;
    // (No hint while a memory is forming or playing, painted or heard: it waits. On a phone a
    // hint would sit where a vignette's captions are.)
    const remembering = !!c.living || !!c.vignette;
    if (!this.controlsShown && since > 4 && !(c.touch && c.dragged) && !remembering) this.showControls();
    // Someone exploring only by eye, still sitting where the opening left them, may not know
    // they can get up: told once, never moved for them.
    if (!c.touch && !this.walkShown && since > 25 && c.rig.seated && c.mode === 'room' && !remembering) {
      this.walkShown = true;
      flashHint(c.dom.hint, '↑ or W to walk · Esc to pause', HINT_MS.walk);
    }
    if (c.touch && c.mode === 'room' && !this.touchShown && since > 12 && !c.touched && !remembering) this.showTouch();
  }

  private showControls() {
    this.controlsShown = true;
    flashHint(this.ctx.dom.hint, this.ctx.touch ? 'drag left to walk · drag right to look' : 'Esc to pause', HINT_MS.controls);
  }

  /** Once, if a touch visitor hasn't touched anything yet: that the words and the chair can be touched. */
  private showTouch() {
    this.touchShown = true;
    // (Where storage is unavailable it is not remembered: shown once per visit instead.)
    if (readTouchHintSeen()) return;
    writeTouchHintSeen();
    flashHint(this.ctx.dom.hint, 'touch the words, or the chair', HINT_MS.touch);
  }
}
