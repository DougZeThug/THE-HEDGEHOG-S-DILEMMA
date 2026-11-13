import { fetchBlob } from './fetched';
import { filmType } from './living/FilmScene';
import { memoryEntry, rigSpecOf } from './registry';
import { framesNear, isFilm, livingFiles, manifestOf } from './art';
import type { RuntimeHost } from './prepared';

/**
 * Fetch a memory's art and its recordings (`music/…`) ahead, when its line is armed, so beginning
 * it waits on nothing but decoding (the woodland's recordings alone took 13 s on a slow phone
 * connection when they were fetched only as it began: QA, 2026-10-19). Its spoken and recorded
 * sounds (`mem:…`) are the voices' own loader's.
 */
export async function prefetch(id: string, variant: string, host: Pick<RuntimeHost, 'quality' | 'base' | 'screen'>): Promise<void> {
  const { def } = memoryEntry(id);
  const v = def.variants.includes(variant) ? variant : def.variants[0];
  const base = host.base ?? './memories/';
  const suffix = host.quality === 'low' ? '@low' : '';
  try {
    const manifest = await manifestOf(base, def.art);
    const lm = manifest.living?.[v];
    const wall = manifest.variants[v].filter((l) => !(lm && l.name === 'scene')).map((l) => ({ file: l.file, suffix }));
    const sounds = Object.values(def.cues(v).cues).map((c) => c.asset).filter((a) => a.startsWith('music/'));
    if (isFilm(lm)) {
      // (Where no video can be asked what it plays, the film waits to be fetched as it begins; its
      // wall and its sounds are fetched all the same.)
      let type: ReturnType<typeof filmType> = null;
      try {
        type = filmType();
      } catch {
        // (No video element to ask: a browser without one has no film to fetch.)
        type = null;
      }
      const files = [...wall, ...(lm.order ? [{ file: lm.order, suffix: '' }] : [])];
      await Promise.all([
        ...files.map((f) => fetchBlob(`${base}${def.art}/${f.file}${f.suffix}.webp`)),
        ...(type ? [fetchBlob(`${base}${def.art}/${lm.film}${suffix}.${type}`)] : []),
        ...sounds.map((a) => fetchBlob(`./${a}`)),
      ]);
      return;
    }
    const files = lm ? [...wall, ...livingFiles(lm, suffix, !framesNear(host, rigSpecOf(def.id)))] : wall;
    await Promise.all([...files.map((f) => fetchBlob(`${base}${def.art}/${f.file}${f.suffix}.webp`)), ...sounds.map((a) => fetchBlob(`./${a}`))]);
  } catch (e) {
    // (A failed fetch costs only the head start: it is fetched again when it is needed.)
    console.debug(`memory ${id}: prefetch failed`, e);
  }
}
