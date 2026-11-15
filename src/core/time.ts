export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves with `fallback` if `p` has not settled within `ms`. */
export const withTimeout = <T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> =>
  Promise.race([p, sleep(ms).then(() => fallback)]);

/**
 * Runs `fn` when the browser has a moment (at the latest after `timeoutMs`, if given), or after
 * `fallbackMs` where requestIdleCallback is missing.
 */
export function idle(fn: () => void, fallbackMs = 200, timeoutMs?: number): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), timeoutMs === undefined ? undefined : { timeout: timeoutMs });
  else setTimeout(fn, fallbackMs);
}

/**
 * For a promise whose failure changes nothing a visitor would notice (a font that will not load, an
 * audio context still resuming): `.catch(ignored)` says so at the call site, with the reason beside it.
 */
export const ignored = (): undefined => undefined;
