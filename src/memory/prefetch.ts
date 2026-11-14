import { fetchBlob } from './fetched';
import { filmType } from './living/FilmScene';
import { artUrl, framesNear, filmUrl, isFilm, livingFiles, manifestOf, type ArtFile } from './art';
import { resolve } from './stage';
import type { RuntimeHost } from './prepared';

/**
 * Fetch a memory's art and its recordings (`music/…`) ahead, when its line is armed, so beginning
 * it waits on nothing but decoding (the woodland's recordings alone took 13 s on a slow phone
 * connection when they were fetched only as it began: QA, 2026-10-19). Its spoken and recorded
 * sounds (`mem:…`) are the voices' own loader's.
 */
export async function prefetch(id: string, variant: string, host: Pick<RuntimeHost, 'quality' | 'base' | 'screen'>): Promise<void> {
  const { entry, def, v, base, suffix } = resolve(id, variant, host);
  try {
    const manifest = await manifestOf(base, def.art);
    const lm = manifest.living?.[v];
    const wall: ArtFile[] = manifest.variants[v].filter((l) => !(lm && l.name === 'scene')).map((l) => ({ file: l.file, suffix }));
    const sounds = Object.values(def.cues(v).cues).map((c) => c.asset).filter((a) => a.startsWith('music/'));
    if (isFilm(lm)) {
      // (Where no video can be asked what it plays, the film waits to be fetched as it begins; its
      // wall and its sounds are fetched all the same.)
      const type = filmType();
      const files = [...wall, ...(lm.order ? [{ file: lm.order, suffix: '' }] : [])];
      await Promise.all([
        ...files.map((f) => fetchBlob(artUrl(base, def.art, f))),
        ...(type ? [fetchBlob(filmUrl(base, def.art, lm, suffix, type))] : []),
        ...sounds.map((a) => fetchBlob(`./${a}`)),
      ]);
      return;
    }
    const files = lm ? [...wall, ...livingFiles(lm, suffix, !framesNear(host, entry.rig!))] : wall;
    await Promise.all([...files.map((f) => fetchBlob(artUrl(base, def.art, f))), ...sounds.map((a) => fetchBlob(`./${a}`))]);
  } catch (e) {
    // (A failed fetch costs only the head start: it is fetched again when it is needed.)
    console.debug(`memory ${id}: prefetch failed`, e);
  }
}
