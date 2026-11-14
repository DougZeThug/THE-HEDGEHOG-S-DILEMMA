import type { AppContext, Peers } from './context';

/**
 * The page's own comings and goings: a tab closed, hidden or brought back, and the browser's back
 * gesture. What each does to a memory, a vignette, the sound and the screen's wake lock.
 */
export function bindLifecycle(ctx: AppContext, peers: Peers): void {
  // A tab closed without leaving: how the visit left the chair is kept all the same.
  addEventListener('pagehide', () => {
    if (ctx.inVisit()) peers.menus.keepTrace();
  });
  document.addEventListener('visibilitychange', () => {
    // (A phone may discard a hidden tab without pagehide: this is the last sure moment.)
    if (document.hidden && ctx.inVisit()) peers.menus.keepTrace();
    // Away during the opening: on return, the room is simply there.
    if (document.hidden && peers.opening.active) peers.opening.skipOpening();
    // A memory or a vignette pauses with the tab, and is let go if it is away for long (here, not
    // in the frame loop: a background tab runs no frames).
    peers.vignettes.onVisibility(document.hidden);
    peers.living.onVisibility(document.hidden);
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
