/** Quiet captions for what is heard. One at a time. */
export class Captions {
  private _enabled = true;
  get enabled() {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
    if (!v) this.clear();
  }
  constructor(private el: HTMLElement) {}

  /**
   * Over a dark picture (a memory at dusk), a sound's caption is light text with a dark glow rather
   * than a pale pill: the pill was the brightest thing in the empty clearing, eleven times its
   * light (the cinematic director's evaluation, 2026-10-19).
   */
  set dim(v: boolean) {
    this.el.classList.toggle('dim', v);
  }
  private wordsUntil = 0;
  /** A caption of words (not a sound) is on screen: a sound's caption must not replace it. */
  get speaking() {
    return performance.now() < this.wordsUntil;
  }

  /**
   * `side`: which of two speakers is talking (a vignette's two people), so they can be told
   * apart without names.
   */
  show(text: string, seconds: number, sound = false, side?: 'left' | 'right', vignette = false) {
    if (!this.enabled || !text) return;
    // A vignette's sound while its words are still on screen goes beneath them, not over them.
    const alongside = vignette && sound && this.speaking;
    if (!alongside)
      for (const old of [...this.el.children]) {
        old.classList.remove('on');
        setTimeout(() => old.remove(), 900);
      }
    const s = document.createElement('span');
    s.className = 'cap' + (sound ? ' sound' : '') + (side ? ` side-${side}` : '') + (vignette ? ' vig' : '');
    s.textContent = text;
    this.el.appendChild(s);
    requestAnimationFrame(() => s.classList.add('on'));
    const hold = Math.max(2.5, seconds + 1.2) * 1000;
    this.wordsUntil = sound ? (this.speaking ? this.wordsUntil : 0) : performance.now() + hold;
    const timer = setTimeout(() => {
      s.classList.remove('on');
      setTimeout(() => s.remove(), 1600);
    }, hold);
    if (!sound) this.lastWords = { el: s, timer };
  }

  private lastWords: { el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

  /**
   * Someone waits for an answer that doesn't come: what was last said stays, dimmed, for
   * `seconds` (for a visitor who can't hear the silence, the unanswered line is the waiting).
   */
  linger(seconds: number) {
    const w = this.lastWords;
    if (!this.enabled || !w || !w.el.isConnected || !w.el.classList.contains('on')) return;
    clearTimeout(w.timer);
    w.el.classList.add('waiting');
    // (Its words are on screen still: a sound's caption goes beneath them, not over.)
    this.wordsUntil = performance.now() + seconds * 1000;
    w.timer = setTimeout(() => {
      w.el.classList.remove('on');
      setTimeout(() => w.el.remove(), 1600);
    }, seconds * 1000);
  }

  clear() {
    this.el.replaceChildren();
  }
}
