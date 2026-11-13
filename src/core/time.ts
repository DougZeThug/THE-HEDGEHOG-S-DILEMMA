export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves with `fallback` if `p` has not settled within `ms`. */
export const withTimeout = <T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> =>
  Promise.race([p, sleep(ms).then(() => fallback)]);

/** Runs `fn` when the browser has a moment, or after `fallbackMs` where requestIdleCallback is missing. */
export function idle(fn: () => void, fallbackMs = 200): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn());
  else setTimeout(fn, fallbackMs);
}
