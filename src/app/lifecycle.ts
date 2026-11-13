import type { AppContext, Peers } from './context';

/**
 * The page's own comings and goings: a tab closed, hidden or brought back, and the browser's back
 * gesture. What each does to a memory, a vignette, the sound and the screen's wake lock.
 */
export function bindLifecycle(ctx: AppContext, peers: Peers): void {
  // A tab closed without leaving: how the visit left the chair is kept all the same.
  addEventListener('pagehide', () => {
    if (ctx.inVisit()) peers.living.keepTrace();
  });
  document.addEventListener('visibilitychange', () => {
    // (A phone may discard a hidden tab without pagehide: this is the last sure moment.)
    if (document.hidden && ctx.inVisit()) peers.living.keepTrace();
    // Away during the opening: on return, the room is simply there.
    if (document.hidden && peers.opening.active) peers.opening.skipOpening();
    // A living memory pauses with the tab; away for more than 10 s, it ends (uncounted).
    // (Here, not in the frame loop: a background tab runs no frames.) A vignette too; back in
    // time, the sentence the pause cut is said again from its start.
    const vg = ctx.vignette;
    if (vg && document.hidden) {
      vg.hiddenSince = performance.now();
      vg.player.pause();
    } else if (vg && vg.hiddenSince !== null) {
      const away = performance.now() - vg.hiddenSince;
      vg.hiddenSince = null;
      peers.vignettes.vignetteClock.reset();
      if (away > 10000) {
        vg.uncounted = true;
        vg.player.release('interrupt');
      }
    }
    const l = ctx.living;
    if (l && document.hidden) {
      l.hiddenSince = performance.now();
      l.memory.controller.pause();
    } else if (l && l.hiddenSince !== null) {
      const away = performance.now() - l.hiddenSince;
      l.hiddenSince = null;
      peers.living.resetClock();
      if (away > 10000) peers.living.endLivingMemory('hidden');
    }
    if (document.hidden) {
      void ctx.audio?.suspend();
      peers.wake.dropped(); // released by the browser when hidden
    } else if (ctx.isPlaying()) {
      void ctx.audio?.resume();
      void peers.wake.keepAwake();
    }
  });
  addEventListener('popstate', () => {
    if (!ctx.hasEntered()) return;
    if (ctx.mode === 'contribute') peers.menus.closeContribute();
    if (ctx.mode === 'room') peers.menus.openSettings();
    history.pushState({ room: 1 }, '');
  });
}
