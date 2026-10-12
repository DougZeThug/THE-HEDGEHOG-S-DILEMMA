/** Quiet captions for what is heard. Never more than two at once. */
export class Captions {
  enabled = true;
  constructor(private el: HTMLElement) {}

  show(text: string, seconds: number, sound = false) {
    if (!this.enabled || !text) return;
    while (this.el.children.length >= 2) this.el.firstElementChild?.remove();
    const s = document.createElement('span');
    s.className = 'cap' + (sound ? ' sound' : '');
    s.textContent = text;
    this.el.appendChild(s);
    requestAnimationFrame(() => s.classList.add('on'));
    const hold = Math.max(2.5, seconds + 1.2) * 1000;
    setTimeout(() => {
      s.classList.remove('on');
      setTimeout(() => s.remove(), 1600);
    }, hold);
  }

  clear() {
    this.el.replaceChildren();
  }
}
