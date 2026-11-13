import type * as THREE from 'three';
import { WoodlandScene, type HeadCels, type LivingArt, type NearArt } from './living/WoodlandScene';
import { framesNear, loadLayer, colourTimes, type LivingManifest } from './art';
import { dropScene, fallBackToPoster, targetSize, type Stage } from './stage';
import type { PreparedPainting } from './prepared';

/**
 * A painting that lives (the woodland's rig, dormant since its afternoon became a film): its
 * plate, maps and figures drawn by WoodlandScene. Null (and the wall's poster in its place) if the
 * scene couldn't be made.
 */
export async function preparePainting(st: Stage, lm: LivingManifest): Promise<PreparedPainting | null> {
  const { def, entry, host, manifest, extra, suffix } = st;
  const url = st.url;
  const spec = entry.rig;
  if (!spec) throw new Error(`Memory "${def.id}" has no painted rig`);
  try {
    const one = async (file: string, o: { data?: boolean; sfx?: string } = {}) => {
      const r = await loadLayer(url(file, o.sfx ?? suffix), { living: true, data: o.data });
      extra.push(r);
      return r.texture;
    };
    const mainP = Promise.all([
      one(lm.plate),
      one(lm.maps, { data: true, sfx: '' }),
      lm.grade ? one(lm.grade, { data: true, sfx: '' }) : Promise.resolve(null),
      lm.sky ? one(lm.sky.file, { sfx: '' }) : Promise.resolve(null),
      lm.figures ? one(lm.figures.file) : Promise.resolve(null),
      lm.figures ? one(lm.figures.lids) : Promise.resolve(null),
      lm.after ? one(lm.after) : Promise.resolve(null),
      lm.flowers ? one(lm.flowers.file) : Promise.resolve(null),
      lm.clouds ? one(lm.clouds.mask, { data: true, sfx: '' }) : Promise.resolve(null),
      lm.clouds ? one(lm.clouds.file, { sfx: '' }) : Promise.resolve(null),
      lm.clouds ? one(lm.clouds.after, { sfx: '' }) : Promise.resolve(null),
    ]);
    // (The pencil's order is mipmapped, unlike the scene's layers: seen from across the room.)
    // (If it can be had: else the light finds the painting unordered, and the memory still plays.)
    const orderP = lm.order ? loadLayer(url(lm.order, ''), { data: true }).then((r) => (extra.push(r), r), () => null) : Promise.resolve(null);
    // Her turn in the wide (at its size), if it can be had (else her head stays as the panel has
    // it; the memory still plays).
    const headsP = (async (): Promise<HeadCels | null> => {
      const h = lm.figures?.heads;
      if (!h) return null;
      try {
        const r = await loadLayer(url(h.file), { living: true });
        extra.push(r);
        return { texture: r.texture, box: h.box, at: h.at, cells: h.cells, grid: h.grid };
      } catch (e) {
        // (A failed head atlas is not fatal: her head stays as the panel has it.)
        console.debug('living memory: her turn in the wide could not be loaded', e);
        return null;
      }
    })();
    // The two-shot: all of it, or none (its shot is then the wide), and only for a screen that
    // shows it.
    const nearP = (async (): Promise<NearArt | null> => {
      const n = lm.near;
      if (!n || !lm.figures?.heads || !framesNear(host, spec)) return null;
      const got = await Promise.allSettled([
        loadLayer(url(n.file), { living: true }),
        loadLayer(url(n.lids), { living: true }),
        loadLayer(url(n.heads.file), { living: true }),
        loadLayer(url(n.ground.file, ''), { living: true }),
        loadLayer(url(n.maps, ''), { living: true, data: true }),
      ]);
      const ok = got.every((r) => r.status === 'fulfilled');
      for (const r of got) {
        if (r.status !== 'fulfilled') continue;
        if (ok) extra.push(r.value);
        else {
          r.value.texture.dispose();
          r.value.bitmap.close();
        }
      }
      if (!ok) return null;
      const [atlas, lids, heads, ground, maps] = got.map((r) => (r as PromiseFulfilledResult<{ texture: THREE.Texture }>).value.texture);
      return {
        texture: atlas,
        lids,
        heads: { texture: heads, box: n.heads.box, at: n.heads.at, cells: n.heads.cells, grid: n.heads.grid },
        ground,
        maps,
        pixels: n.pixels,
        gutter: n.gutter,
        reach: n.reach,
        lidBox: n.lidBox,
        groundBox: n.ground.box,
        eyes: [...n.eyes.a, ...n.eyes.b],
      };
    })();
    // (All of it settled before any failure is thrown, so nothing loads after it is let go.)
    const bad = (await Promise.allSettled([mainP, orderP, headsP, nearP])).find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (bad) throw bad.reason;
    const [plate, maps, grade, sky, fig, lids, after, flowers, skyMask, clouds, cloudsAfter] = await mainP;
    const [orderR, heads, near] = [await orderP, await headsP, await nearP];
    const order = orderR?.texture ?? null;
    const art: LivingArt = {
      plate,
      maps,
      grade,
      after,
      sky: sky && lm.sky ? { texture: sky, box: lm.sky.box } : null,
      flowers: flowers && lm.flowers ? { texture: flowers, heads: lm.flowers.heads } : null,
      clouds: lm.clouds && skyMask && clouds && cloudsAfter ? { mask: skyMask, day: clouds, after: cloudsAfter, box: lm.clouds.box, pad: lm.clouds.pad } : null,
      figures: lm.figures && fig && lids ? { ...lm.figures, texture: fig, lids } : null,
      heads,
      // (Without her look in the wide, no two-shot: a turn away would undo her look.)
      near: heads ? near : null,
      size: manifest.plate ?? [1672, 941],
    };
    const size = targetSize(host);
    const scene = new WoodlandScene(art, spec, { ...size, noise: host.noise!, reduced: !!host.reduced, low: host.quality === 'low' });
    st.scene = scene;
    st.loaded.unshift({ texture: scene.target.texture, bitmap: null as unknown as ImageBitmap, name: 'scene', kind: 'pigment' });
    return { kind: 'painting', scene, spec, immerse: lm.immerse, crop: manifest.crop ?? [0, 0, 1, 1], aspect: manifest.size[0] / manifest.size[1], order, colourAt: orderR ? colourTimes(orderR.bitmap) : null };
  } catch (e) {
    // The living scene couldn't be made: the wall's poster instead, as any memory.
    console.warn('living scene unavailable; the painting stays still', e);
    dropScene(st);
    await fallBackToPoster(st);
    return null;
  }
}
