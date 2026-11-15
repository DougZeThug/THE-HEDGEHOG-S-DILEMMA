/** A fresh in-memory `localStorage` for the test, returned so it can be read and set directly. */
export function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
  return store;
}

/** `matchMedia` answering `matches(query)`. */
export function stubMatchMedia(matches: (query: string) => boolean): void {
  (globalThis as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({ matches: matches(q) });
}
