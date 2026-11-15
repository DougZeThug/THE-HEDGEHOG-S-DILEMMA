import { FilmScene, filmType, loadFilm, releaseFilm } from './living/FilmScene';
import { FILM_FETCH_MS, artUrl, colourTimes, filmUrl, loadLayer, type FilmManifest } from './art';
import { fetchBlob } from './fetched';
import { FILM_CUE } from './memoryDef';
import { filmSpecOf } from './registry';
import { dropScene, fallBackToPoster, targetSize, type Stage } from './stage';
import type { PreparedFilm } from './prepared';

/**
 * A film as a living memory: the browser's best type, decoded from its blob (fetched ahead), its
 * first frame ready before the memory is; its wall's order map as the woodland's. Null (and the
 * wall's poster in its place) if the film couldn't be had.
 */
export async function prepareFilm(st: Stage, lm: FilmManifest): Promise<PreparedFilm | null> {
  const { def, host, base, suffix, manifest } = st;
  let video: HTMLVideoElement | null = null;
  try {
    const type = filmType();
    if (!type) throw new Error('no film type this browser plays');
    // (under a deadline too: a request never answered left the memory never beginning, no still,
    // no sound: QA, 2026-10-21)
    const blob = await Promise.race([
      fetchBlob(filmUrl(base, def.art, lm, suffix, type)),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('film not fetched in time')), FILM_FETCH_MS)),
    ]);
    video = await loadFilm(URL.createObjectURL(blob));
    const orderR = lm.order ? await loadLayer(artUrl(base, def.art, { file: lm.order, suffix: '' }), { data: true }) : null;
    if (orderR) st.extra.push(orderR);
    const spec = filmSpecOf(def.id);
    const scene = new FilmScene({ video, fps: lm.fps, frames: lm.frames }, { ...targetSize(host), reduced: !!host.reduced, close: spec.close?.frames });
    st.scene = scene;
    st.loaded.unshift({ texture: scene.target.texture, bitmap: null as unknown as ImageBitmap, name: 'scene', kind: 'pigment' });
    return {
      kind: 'film',
      scene,
      spec,
      immerse: lm.immerse,
      torn: (lm.edge ?? 'torn') === 'torn',
      shade: lm.edge === 'shade',
      crop: manifest.crop ?? [0, 0, 1, 1],
      order: orderR?.texture ?? null,
      colourAt: orderR ? colourTimes(orderR.bitmap) : null,
      feather: lm.feather,
    };
  } catch (e) {
    // The film couldn't be had: the wall's poster instead, still (as any memory).
    console.warn('film unavailable; the memory stays a still', e);
    // (and without the film's sound: its eraser over a still read as broken: QA, 2026-10-21)
    st.audio?.without(FILM_CUE);
    // (A film loaded before its order map failed is no scene's yet: let go here, or its blob and
    // decoder stayed for every attempt: review of PR 14.)
    const hadScene = !!st.scene;
    dropScene(st);
    if (!hadScene && video) releaseFilm(video);
    await fallBackToPoster(st);
    return null;
  }
}
