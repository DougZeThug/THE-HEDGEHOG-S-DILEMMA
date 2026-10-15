import gsap from 'gsap';

/**
 * GSAP without its own clock. Its ticker would otherwise run a requestAnimationFrame loop of its
 * own (the reason docs/reviews/2026-10-dependencies.md once rejected it): here every timeline is
 * created paused and positioned by the memory's controller, which is stepped by the App's frame.
 * Nothing advances unless the room's clock advances it.
 */
gsap.ticker.remove(gsap.updateRoot);
gsap.ticker.lagSmoothing(0);
// Creating a tween can wake the ticker; with nothing to update it costs a callback a frame, and
// sleep() stops even that.
gsap.ticker.sleep();

export { gsap };

/** Call after building timelines: creating a tween may wake the ticker's own loop. */
export function quiet(): void {
  gsap.ticker.sleep();
}

/**
 * Position a paused timeline. Rendering wakes GSAP's ticker (it would then run a frame loop for
 * the rest of the visit, ticking nothing); put it straight back to sleep. Every seek goes here.
 */
export function seek(tl: gsap.core.Timeline, t: number): void {
  tl.time(t, true);
  gsap.ticker.sleep();
}
