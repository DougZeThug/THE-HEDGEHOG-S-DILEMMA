/**
 * Fetched bytes, kept so a memory armed earlier starts without a network wait: its art and its
 * recordings are fetched when its line is armed (runtime.prefetch), and decoded only when it is
 * prepared. (Its own small module, so the room's sound loader shares it without loading the
 * memories' runtime.)
 */
const fetched = new Map<string, Promise<Blob>>();

export function fetchBlob(url: string): Promise<Blob> {
  let p = fetched.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${url}: ${r.status}`))));
    p.catch(() => fetched.delete(url));
    fetched.set(url, p);
  }
  return p;
}
