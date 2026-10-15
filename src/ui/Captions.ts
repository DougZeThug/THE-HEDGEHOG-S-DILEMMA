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
  private wordsUntil = 0;
  /** A caption of words (not a sound) is on screen: a sound's caption must not replace it. */
  get speaking() {
    return performance.now() < this.wordsUntil;
  }

  /**
   * `side`: which of two speakers is talking (a vignette's two people), so they can be told
   * apart without names.
   */
  show(text: string, seconds: number, sound = false, side?: 'left' | 'right') {
    if (!this.enabled || !text) return;
    for (const old of [...this.el.children]) {
      old.classList.remove('on');
      setTimeout(() => old.remove(), 900);
    }
    const s = document.createElement('span');
    s.className = 'cap' + (sound ? ' sound' : '') + (side ? ` side-${side}` : '');
    s.textContent = text;
    this.el.appendChild(s);
    requestAnimationFrame(() => s.classList.add('on'));
    const hold = Math.max(2.5, seconds + 1.2) * 1000;
    this.wordsUntil = sound ? (this.speaking ? this.wordsUntil : 0) : performance.now() + hold;
    setTimeout(() => {
      s.classList.remove('on');
      setTimeout(() => s.remove(), 1600);
    }, hold);
  }

  clear() {
    this.el.replaceChildren();
  }
}
