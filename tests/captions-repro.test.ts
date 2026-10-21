import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Captions } from '../src/ui/Captions';

// The reproduction of the shipped five-minutes/first scenario: the child's "Promise?" is held on
// screen, dimmed, through a `gap:'wait'` of 6 s; the chair creak caption ([the chair creaks]) lands
// ~3.1 s into the wait. Before the fix the creak replaced the still-lingering line; after it, the
// creak sits beneath it, exactly as a sound during the line's normal hold does.
//
// The vitest environment is `node` (vite.config.ts): there is no `document` or `requestAnimationFrame`
// at runtime, so just enough of an element is rolled here (the same approach tests/fakeAudio.ts takes
// for Web Audio). `Captions` reads `performance.now()` for its `speaking` window and uses
// `setTimeout` for its removal timers, and this vitest version does not advance `performance.now`
// with `vi.advanceTimersByTime`, so `performance.now` is stubbed to a hand-cranked clock kept in
// step with the fake timer queue.

/** Just enough of a DOM element's class list, in insertion order. */
class FakeClassList {
  private set = new Set<string>();
  add(...c: string[]) {
    for (const x of c) this.set.add(x);
  }
  remove(...c: string[]) {
    for (const x of c) this.set.delete(x);
  }
  contains(c: string) {
    return this.set.has(c);
  }
  toString() {
    return [...this.set].join(' ');
  }
}

/** Just enough of an HTMLElement to see what Captions shows, holds and removes. */
class FakeEl {
  classList = new FakeClassList();
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  private _text = '';
  get textContent() {
    return this._text;
  }
  set textContent(t: string) {
    this._text = t;
  }
  get className() {
    return this.classList.toString();
  }
  set className(c: string) {
    // `className =` replaces the whole class list, as it does in the DOM.
    const next = new FakeClassList();
    for (const k of c.split(/\s+/)) if (k) next.add(k);
    this.classList = next;
  }
  get isConnected() {
    return this.parent !== null;
  }
  appendChild(c: FakeEl) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  replaceChildren() {
    for (const c of this.children) c.parent = null;
    this.children = [];
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((x) => x !== this);
      this.parent = null;
    }
  }
}

// The hand-cranked clock `Captions.speaking` reads as `performance.now()`.
let clock = 0;

beforeEach(() => {
  // Fake only the timer queue; `performance` is stubbed separately below so the window and the
  // timeouts stay in the same timeline (advance() moves both by the same amount).
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  clock = 0;
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('document', { createElement: () => new FakeEl() });
  // `requestAnimationFrame` is used only to add `on` on the next frame; run it on the fake queue.
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(clock), 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Advance the fake timer queue and the performance clock together, as one timeline. */
function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  clock += ms;
}

/** Show `text` (speech) with the vignette flags the App uses (`vignette=true`, `side` optional). */
function speak(c: Captions, text: string, side?: 'left' | 'right') {
  c.show(text, 1.4, false, side, true);
}

/** Show `text` (a sound caption) with the vignette flags the App's host uses (`vignette=true`). */
function sound(c: Captions, text: string, seconds = 2, vignette = true) {
  c.show(text, seconds, true, undefined, vignette);
}

describe('Captions — a lingered line is still a caption of words on screen', () => {
  it('a vignette sound during the wait goes beneath the lingering words, not over them', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    // The shipped five-minutes/first shape: "Promise?" shown with a 1.4 s floor, hold max(2.5, 2.6) s.
    speak(captions, 'Promise?', 'left');
    const promise = el.children[0];
    // The line gains `on` on the next frame; the hold's removal timer (2.6 s) is not yet due.
    advance(1300); // a beat before the hold ends, exactly when the wait gap fires
    expect(promise.classList.contains('on')).toBe(true);
    // The wait: the unanswered line lingers, dimmed, for 6 s — as App's `vignetteGap` calls `linger`.
    captions.linger(6);
    expect(promise.classList.contains('waiting')).toBe(true);
    // [the chair creaks] lands 3.1 s later, mid-linger (the shipped 14.0 s inside the 10.6–16.9 s wait).
    advance(3100);
    // After the fix, the speaking window spans the whole wait, so the creak takes the `alongside` path.
    expect(captions.speaking).toBe(true);
    sound(captions, '[the chair creaks]');
    // The lingering line is NOT replaced: it keeps `on` and `waiting`, and the creak sits beneath it.
    expect(promise.classList.contains('on')).toBe(true);
    expect(promise.classList.contains('waiting')).toBe(true);
    expect(promise.isConnected).toBe(true);
    expect(el.children).toHaveLength(2);
    expect(el.children).toContain(promise);
    const creak = el.children.find((c) => c.textContent === '[the chair creaks]');
    expect(creak).toBeDefined();
    expect(creak!.classList.contains('sound')).toBe(true);
    expect(creak!.classList.contains('vig')).toBe(true);
  });

  it('a vignette sound during a line\'s normal hold also goes beneath it (the existing path, unchanged)', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    speak(captions, 'Promise?', 'left');
    const promise = el.children[0];
    advance(500); // well inside the 2.6 s hold, so `speaking` is still true
    expect(captions.speaking).toBe(true);
    sound(captions, '[the chair creaks]');
    expect(promise.classList.contains('on')).toBe(true);
    expect(el.children).toHaveLength(2);
    expect(el.children).toContain(promise);
    const creak = el.children.find((c) => c.textContent === '[the chair creaks]');
    expect(creak).toBeDefined();
    expect(creak!.classList.contains('sound')).toBe(true);
  });

  it('speaking stays true for the whole wait and turns false once it ends', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    speak(captions, 'Promise?', 'left');
    advance(1300); // hold is 2.6 s; the wait fires a beat before it ends
    captions.linger(6);
    // Past the original 2.6 s deadline: before the fix, `speaking` would already be false here.
    advance(2000); // -> 3.3 s
    expect(captions.speaking).toBe(true);
    advance(3000); // -> 6.3 s
    expect(captions.speaking).toBe(true);
    advance(1000); // -> 7.3 s: the wait ends, `on` drops with it
    expect(captions.speaking).toBe(false);
  });

  it('a vignette speech line during the wait still replaces the lingering line (alongside is for sounds)', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    speak(captions, 'Promise?', 'left');
    advance(1300);
    const promise = el.children[0];
    captions.linger(6);
    advance(3100);
    // After the fix `speaking` is true here (the window spans the wait). The no-regression this
    // test pins: a *speech* line (sound = false) still REPLACES the lingering line, not goes
    // beneath it — `alongside` is for sounds only, and a spoken line answers the wait.
    speak(captions, "I'm still here.", 'right');
    expect(promise.classList.contains('on')).toBe(false); // the lingering line was replaced
    expect(el.children).toContain(promise); // but still in the DOM until its 900 ms fade completes
    const reply = el.children.find((c) => c.textContent === "I'm still here.");
    expect(reply).toBeDefined();
    expect(reply!.classList.contains('vig')).toBe(true);
    expect(reply!.classList.contains('sound')).toBe(false);
  });

  it('a non-vignette sound during the wait still replaces the lingering line (alongside is for vignette sounds)', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    speak(captions, 'Promise?', 'left');
    advance(1300);
    const promise = el.children[0];
    captions.linger(6);
    advance(3100);
    // A memory-audio caption (vignette = false) takes the replace path, exactly as before.
    sound(captions, '[two spoons in bowls]', 2, false);
    expect(promise.classList.contains('on')).toBe(false);
    expect(el.children).toContain(promise); // present until its 900 ms fade completes
    const sfx = el.children.find((c) => c.textContent === '[two spoons in bowls]');
    expect(sfx).toBeDefined();
    expect(sfx!.classList.contains('vig')).toBe(false);
  });

  it('after the wait ends, the lingering line is removed (the linger timer is unchanged)', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    speak(captions, 'Promise?', 'left');
    advance(1300);
    const promise = el.children[0];
    captions.linger(6);
    // 1.3 s + 6 s = 7.3 s. Advance to the linger removal: `on` drops, actual removal scheduled 1.6 s on.
    advance(6000);
    expect(promise.classList.contains('on')).toBe(false);
    expect(promise.isConnected).toBe(true); // still fading out
    advance(1600); // the post-`on` removal takes 1.6 s, as in `linger`
    expect(promise.isConnected).toBe(false);
    expect(el.children).not.toContain(promise);
  });

  it('lingering a line that has already lost `on` is a no-op (a later wait does not re-arm it)', () => {
    const el = new FakeEl();
    const captions = new Captions(el as unknown as HTMLElement);
    speak(captions, 'Promise?', 'left');
    advance(1300);
    const promise = el.children[0];
    captions.linger(6);
    advance(6000); // the wait ends: `on` is gone
    // A later wait (or a stray `linger`) on an already-faded line re-arms nothing.
    captions.linger(3);
    expect(promise.classList.contains('waiting')).toBe(true); // unchanged from the first wait
  });
});
