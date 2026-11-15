/**
 * The query string, read once: the switches for the artist, the playtests and the previews
 * (`?style=`, `?tune`, `?debug`, `?studio`, `?memory=`, `?vignette=`, `?seed=`, `?situations=`, `?exp=`).
 */
export interface Params {
  style: string | null;
  tune: boolean;
  debug: boolean;
  /** The Memory Editor (development builds only). */
  studio: boolean;
  /** `?memory=<id>[&variant=<v>][&voices=<version>]` and `?vignette=<id>[&variant=<v>]`: previews. */
  memory: string | null;
  vignette: string | null;
  variant: string | null;
  voices: string | null;
  /** `?seed=`: NaN, 0 or less when absent or not a seed. */
  seed: number;
  /** `?situations=a,b`: absent unless given. */
  situations: string[] | undefined;
  /** `?exp=a,b`: design experiments for inspection. */
  exp: string[];
}

const list = (p: URLSearchParams, key: string) =>
  p.get(key)?.split(',').map((s) => s.trim()).filter(Boolean);

export function readParams(search: string = location.search): Params {
  const p = new URLSearchParams(search);
  return {
    style: p.get('style'),
    tune: p.has('tune'),
    debug: p.has('debug'),
    studio: p.has('studio'),
    memory: p.get('memory'),
    vignette: p.get('vignette'),
    variant: p.get('variant'),
    voices: p.get('voices'),
    seed: Number(p.get('seed')),
    situations: list(p, 'situations'),
    exp: list(p, 'exp') ?? [],
  };
}
