import * as THREE from 'three';
import { MemoryPlaybackController } from './MemoryPlaybackController';
import { MemoryAudio, type MemoryAudioHost } from './MemoryAudio';
import { weightsFor } from './compose';
import { MEMORIES, sheetId, type MemoryDef } from './defs';
import { memorySchema } from './sheets';
import { sheetSource } from './theatre';
import type { Lifecycle, MemoryFrame, ReleaseReason } from './types';
import type { WindowLayer, LayerKind } from '../world/MemoryWindow';
import { LivingScene, type FigureArt, type HeadCels, type LivingArt, type NearArt, type Eye } from './living/LivingScene';
import { WOODLAND as WOODLAND_SPEC, type LivingSpec } from './living/woodland';
import { ALMOST } from './living/almost';
import { THINGS } from './living/things';
import { FilmScene, filmType, loadFilm, releaseFilm } from './living/FilmScene';
import { fetchBlob } from './fetched';

/**
 * The memories' runtime: a lazy chunk (GSAP, Theatre.js, the controller and the memory's audio),
 * loaded at idle after the opening, or when a memory is prepared. The App owns the one clock and
 * the renderer; this prepares a memory (its art and its sounds, before anything is due) and
 * plays it, a step at a time.
 */
export { MEMORIES };

export interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
  transom: number;
  mullion: number;
}

interface ArtManifest {
  size: [number, number];
  band?: number | null;
  pane?: Pane | null;
  register?: { x: number; y: number; h: number } | null;
  variants: Record<string, { name: string; kind: LayerKind; file: string; source: string }[]>;
  /** A living memory: the part of the painting the wall shows first (painting uv), and its plate's pixels. */
  crop?: [number, number, number, number];
  plate?: [number, number];
  living?: Record<string, LivingManifest | FilmManifest | null>;
}

/**
 * A film as a living memory (FilmScene): `<film><@low>.webm` (VP9) and `.mp4` (H.264), silent (its
 * sound is a cue), the frames it holds, and the order its wall's fibres and colour come in.
 */
interface FilmManifest {
  kind: 'film';
  film: string;
  fps: number;
  frames: number;
  order?: string | null;
  immerse: boolean;
  /** Its edge when carried out of the wall: torn (felt, "Almost": the default) or soft (a sheet rubbed). */
  edge?: 'torn' | 'soft';
}

/** Where each film sits when it covers the screen (src/memory/living/), by memory. */
const FILM_SPECS: Record<string, Pick<LivingSpec, 'cover' | 'coverAt'>> = { almost: ALMOST, things: THINGS };

const isFilm = (m: LivingManifest | FilmManifest | null | undefined): m is FilmManifest => !!m && (m as FilmManifest).kind === 'film';
/** How long the film's bytes may take to come (ms; most are fetched ahead, when its line is armed). */
const FILM_FETCH_MS = 8000;

interface LivingManifest {
  plate: string;
  maps: string;
  grade: string | null;
  /** The same composition later, nobody there (the cut). */
  after?: string | null;
  sky: { file: string; box: [number, number, number, number] } | null;
  /** The people (and her head turned to him at their size: scripts/two-shot.py, with the two-shot). */
  figures: (Omit<FigureArt, 'texture' | 'lids'> & { file: string; lids: string; heads?: { file: string; box: [number, number, number, number]; at: number[]; cells: number; grid: [number, number, number, number] } }) | null;
  /** The near flowers' heads and where they are (painting uv). */
  flowers?: { file: string; heads: [number, number, number][] } | null;
  /** The sky in the gap, drifting: where it shows, the afternoon's and the evening's layers (one size). */
  clouds?: { mask: string; file: string; after: string; box: [number, number, number, number]; pad: number } | null;
  /** When each pencil line is drawn and the colour comes (scripts/stroke-order.py), one size. */
  order?: string | null;
  /**
   * The two-shot (scripts/two-shot.py): the two of them close, the character sheet's own panel (an
   * atlas: the body, her forearm, as far across as `reach`), their lids (over `lidBox`), her turn
   * (cells: scripts/her-turn.py), the ground round them, out of focus, and their eyes (opening,
   * iris, white: `Eye`).
   */
  near?: {
    file: string;
    lids: string;
    pixels: [number, number];
    gutter: number;
    reach: number;
    lidBox: [number, number, number, number];
    heads: { file: string; box: [number, number, number, number]; takes: string[]; at: number[]; cells: number; grid: [number, number, number, number] };
    ground: { file: string; box: [number, number, number, number] };
    /** Where their bed's grass moves in the air (a map, R; one size). */
    maps: string;
    eyes: { a: Eye[]; b: Eye[] };
  } | null;
  immerse: boolean;
}

/** The living scenes' involuntary lives, by memory. */
const SPECS: Record<string, LivingSpec> = { woodland: WOODLAND_SPEC };

export interface RuntimeHost {
  renderer: THREE.WebGLRenderer;
  audio: MemoryAudioHost | null;
  /** 'low' loads the phone set (@low). */
  quality: 'low' | 'medium' | 'high';
  base?: string;
  /** A living memory's scene: the screen's shape (its render target is that shape), and the room's noise. */
  screen?: { width: number; height: number };
  noise?: THREE.Texture;
  reduced?: boolean;
}

/** A living memory's scene, prepared (src/memory/living/): a painting that lives, or a film. */
export interface PreparedLiving {
  scene: LivingScene | FilmScene;
  /** Where its picture sits when it covers the screen. */
  spec: Pick<LivingSpec, 'cover' | 'coverAt'>;
  /** It may be entered (or only seen on the wall). */
  immerse: boolean;
  /** Carried out of the wall, its edge is torn (hard and ragged) rather than a soft brush. */
  torn?: boolean;
  /** What the wall shows first (painting uv: x0, y0, w, h). */
  crop: [number, number, number, number];
  /** The painting's aspect (w / h). */
  aspect: number;
  /** When each pencil line is drawn on the wall and the colour comes, or null (the light finds it). */
  order: THREE.Texture | null;
  /** When the colour reaches a point of the painting (uv, y up; the order map's g), or null. */
  colourAt: ((u: number, v: number) => number) | null;
}

export interface Prepared {
  def: MemoryDef;
  variant: string;
  size: [number, number];
  /** The band at the painting's top kept for the words. */
  band: number;
  /** The painted sun's pane, if the memory's light can stay in the room. */
  pane: Pane | null;
  /** Where the painting's drawn shape is (to register it on a drawing on the wall). */
  register: { x: number; y: number; h: number } | null;
  layers: WindowLayer[];
  audio: MemoryAudio | null;
  /** Drawn by a living scene (its render target is the first layer), or null. */
  living: PreparedLiving | null;
  dispose(): void;
}

/**
 * `living`: drawn about 1:1 into a living scene's target (no mipmaps); `data`: numbers, not
 * colour (decoded straight, never premultiplied: a map's alpha is a channel of its own).
 */
async function loadLayer(url: string, o: { living?: boolean; data?: boolean } = {}): Promise<{ texture: THREE.Texture; bitmap: ImageBitmap }> {
  const blob = await fetchBlob(url);
  // ImageBitmaps ignore the texture's flipY and premultiply flags: ask for both when decoding.
  // Premultiplied, so transparent edges never filter to a dark fringe.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: o.data ? 'none' : 'premultiply', colorSpaceConversion: 'none' });
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace; // composited in sRGB in the shader, as painted
  if (o.living) {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    // The tiling noise samples at its edges; the painting's own maps clamp.
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    texture.anisotropy = 4; // walls are seen obliquely
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
  }
  texture.needsUpdate = true;
  return { texture, bitmap };
}

/**
 * When the colour reaches each part of the painting (its order map's g, 0..1), read once and
 * coarsely: for the room's writing under it (src/App.ts). Painting uv, y up.
 */
function colourTimes(bitmap: ImageBitmap): ((u: number, v: number) => number) | null {
  const w = 96, h = 54;
  try {
    // (An offscreen canvas where there is one with a 2D context, else a page canvas.)
    const off = typeof OffscreenCanvas !== 'undefined' ? (new OffscreenCanvas(w, h).getContext('2d') as OffscreenCanvasRenderingContext2D | null) : null;
    const x = off ?? Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    if (!x) {
      console.warn('living memory: no 2D canvas to read its order map; the writing under it stays');
      return null;
    }
    x.drawImage(bitmap, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = d[i * 4 + 1] / 255;
    // (Decoded upside down, as the textures are: its first row is the painting's foot.)
    const at = (k: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(k * n)));
    return (u, v) => g[at(v, h) * w + at(u, w)];
  } catch (e) {
    console.warn('living memory: its order map could not be read; the writing under it stays', e);
    return null;
  }
}

/** A living scene's render target: the screen's shape, capped by quality (its long side). */
function targetSize(host: RuntimeHost): { width: number; height: number } {
  const cap = host.quality === 'low' ? 1280 : host.quality === 'medium' ? 1600 : 1920;
  const w = host.screen?.width ?? 1280, h = host.screen?.height ?? 720;
  const aspect = Math.min(2.6, Math.max(0.42, w / h));
  const long = Math.min(cap, Math.max(w, h));
  return aspect >= 1 ? { width: Math.round(long), height: Math.round(long / aspect) } : { width: Math.round(long * aspect), height: Math.round(long) };
}

async function manifestOf(base: string, art: string): Promise<ArtManifest> {
  return JSON.parse(await (await fetchBlob(`${base}${art}/manifest.json`)).text()) as ArtManifest;
}

/**
 * Fetch a memory's art and its recordings (`music/…`) ahead, when its line is armed, so beginning
 * it waits on nothing but decoding (the woodland's recordings alone took 13 s on a slow phone
 * connection when they were fetched only as it began: QA, 2026-10-19). Its spoken and recorded
 * sounds (`mem:…`) are the voices' own loader's.
 */
export async function prefetch(id: string, variant: string, host: Pick<RuntimeHost, 'quality' | 'base' | 'screen'>): Promise<void> {
  const def = MEMORIES[id];
  if (!def) return;
  const v = def.variants.includes(variant) ? variant : def.variants[0];
  const base = host.base ?? './memories/';
  const suffix = host.quality === 'low' ? '@low' : '';
  try {
    const manifest = await manifestOf(base, def.art);
    const lm = manifest.living?.[v];
    const wall = manifest.variants[v].filter((l) => !(lm && l.name === 'scene')).map((l) => ({ file: l.file, suffix }));
    const sounds = Object.values(def.cues(v).cues).map((c) => c.asset).filter((a) => a.startsWith('music/'));
    if (isFilm(lm)) {
      const type = filmType();
      const files = [...wall, ...(lm.order ? [{ file: lm.order, suffix: '' }] : [])];
      await Promise.all([
        ...files.map((f) => fetchBlob(`${base}${def.art}/${f.file}${f.suffix}.webp`)),
        ...(type ? [fetchBlob(`${base}${def.art}/${lm.film}${suffix}.${type}`)] : []),
        ...sounds.map((a) => fetchBlob(`./${a}`)),
      ]);
      return;
    }
    const files = lm ? [...wall, ...livingFiles(lm, suffix, !framesNear(host, SPECS[def.id] ?? WOODLAND_SPEC))] : wall;
    await Promise.all([...files.map((f) => fetchBlob(`${base}${def.art}/${f.file}${f.suffix}.webp`)), ...sounds.map((a) => fetchBlob(`./${a}`))]);
  } catch {
    /* it will be fetched again when it is needed */
  }
}

/**
 * Whether the screen can show the two-shot (the spec's aspects, framed by band: narrower than 1.3
 * no frame holds his face, wider than 2.45 none holds hers and the hands, and upright a 16:9 one
 * would hold one face): elsewhere its shot is the wide, and its art isn't loaded (about 24 MB on a
 * desktop).
 */
function framesNear(host: Pick<RuntimeHost, 'screen'>, spec: LivingSpec): boolean {
  if (!host.screen || !spec.near) return true;
  const a = host.screen.width / host.screen.height;
  return a >= spec.near.aspect[0] && a <= spec.near.aspect[1];
}

/** A living scene's files (maps, grade and sky have one size only); the two-shot's only for a screen that shows it. */
function livingFiles(lm: LivingManifest, suffix: string, noNear = false): { file: string; suffix: string }[] {
  const out = [{ file: lm.plate, suffix }, { file: lm.maps, suffix: '' }];
  if (lm.grade) out.push({ file: lm.grade, suffix: '' });
  if (lm.after) out.push({ file: lm.after, suffix });
  if (lm.sky) out.push({ file: lm.sky.file, suffix: '' });
  if (lm.figures) out.push({ file: lm.figures.file, suffix }, { file: lm.figures.lids, suffix });
  if (lm.flowers) out.push({ file: lm.flowers.file, suffix });
  if (lm.clouds) out.push({ file: lm.clouds.mask, suffix: '' }, { file: lm.clouds.file, suffix: '' }, { file: lm.clouds.after, suffix: '' });
  if (lm.order) out.push({ file: lm.order, suffix: '' });
  if (lm.figures?.heads) out.push({ file: lm.figures.heads.file, suffix });
  if (lm.near && lm.figures?.heads && !noNear) out.push({ file: lm.near.file, suffix }, { file: lm.near.lids, suffix }, { file: lm.near.heads.file, suffix }, { file: lm.near.ground.file, suffix: '' }, { file: lm.near.maps, suffix: '' });
  return out;
}

/** Fetch and decode a memory's art and sounds (in parallel), uploading one texture a frame. */
export async function prepare(id: string, variant: string, host: RuntimeHost): Promise<Prepared> {
  const def = MEMORIES[id];
  if (!def) throw new Error(`No memory "${id}"`);
  const v = def.variants.includes(variant) ? variant : def.variants[0];
  const base = host.base ?? './memories/';
  const manifest = await manifestOf(base, def.art);
  const suffix = host.quality === 'low' ? '@low' : '';
  let audio: MemoryAudio | null = null;
  if (host.audio) {
    const sid = sheetId(def.id, v);
    const src = sheetSource(sid, memorySchema(def.layers, def.living), { sections: def.sections, markers: def.markers });
    audio = new MemoryAudio(host.audio, def.cues(v), src.markers, id.length * 7 + v.length);
  }
  // A living variant draws its painting itself: the wall's flattened poster is only its fallback.
  const lm = def.living && host.noise ? manifest.living?.[v] ?? null : null;
  const wallLayers = manifest.variants[v].filter((l) => !(lm && l.name === 'scene'));
  const url = (file: string, sfx = suffix) => `${base}${def.art}/${file}${sfx}.webp`;
  const settled = await Promise.allSettled(wallLayers.map((l) => loadLayer(url(l.file))));
  const loaded: { texture: THREE.Texture; bitmap: ImageBitmap; name: string; kind: LayerKind }[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') loaded.push({ ...r.value, name: wallLayers[i].name, kind: wallLayers[i].kind });
  });
  const extra: { texture: THREE.Texture; bitmap: ImageBitmap }[] = [];
  let scene: LivingScene | FilmScene | null = null;
  const letGo = () => {
    for (const l of [...loaded, ...extra]) {
      l.texture.dispose();
      // (The living scene's own entry has no bitmap: QA, 2026-10-20.)
      l.bitmap?.close();
    }
    scene?.dispose();
    audio?.dispose(0);
  };
  const failed = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) {
    letGo();
    throw failed.reason;
  }
  let living: PreparedLiving | null = null;
  if (isFilm(lm)) {
    let video: HTMLVideoElement | null = null;
    try {
      // The film: the browser's best type, decoded from its blob (fetched ahead), its first frame
      // ready before the memory is; its wall's order map as the woodland's.
      const type = filmType();
      if (!type) throw new Error('no film type this browser plays');
      // (under a deadline too: a request never answered left the memory never beginning, no still,
      // no sound: QA, 2026-10-21)
      const blob = await Promise.race([
        fetchBlob(`${base}${def.art}/${lm.film}${suffix}.${type}`),
        new Promise<never>((_, no) => setTimeout(() => no(new Error('film not fetched in time')), FILM_FETCH_MS)),
      ]);
      video = await loadFilm(URL.createObjectURL(blob));
      const orderR = lm.order ? await loadLayer(url(lm.order, ''), { data: true }) : null;
      if (orderR) extra.push(orderR);
      const size = targetSize(host);
      scene = new FilmScene({ video, fps: lm.fps, frames: lm.frames }, { ...size, reduced: !!host.reduced });
      living = { scene, spec: FILM_SPECS[def.id] ?? ALMOST, immerse: lm.immerse, torn: (lm.edge ?? 'torn') === 'torn', crop: manifest.crop ?? [0, 0, 1, 1], aspect: manifest.size[0] / manifest.size[1], order: orderR?.texture ?? null, colourAt: orderR ? colourTimes(orderR.bitmap) : null };
      loaded.unshift({ texture: scene.target.texture, bitmap: null as unknown as ImageBitmap, name: 'scene', kind: 'pigment' });
    } catch (e) {
      // The film couldn't be had: the wall's poster instead, still (as any memory).
      console.warn('film unavailable; the memory stays a still', e);
      // (and without the film's sound: its eraser over a still read as broken: QA, 2026-10-21)
      audio?.without('music:film');
      for (const l of extra) {
        l.texture.dispose();
        l.bitmap.close();
      }
      extra.length = 0;
      // (A film loaded before its order map failed is no scene's yet: let go here, or its blob and
      // decoder stayed for every attempt: review of PR 14.)
      if (scene) scene.dispose();
      else if (video) releaseFilm(video);
      scene = null;
      const poster = manifest.variants[v].find((l) => l.name === 'scene');
      if (poster) {
        try {
          loaded.unshift({ ...(await loadLayer(url(poster.file))), name: poster.name, kind: poster.kind });
        } catch (err) {
          letGo();
          throw err;
        }
      }
    }
  } else if (lm) {
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
      const orderP = lm.order ? loadLayer(url(lm.order, ''), { data: true }).then((r) => (extra.push(r), r)) : Promise.resolve(null);
      // Her turn in the wide (at its size), if it can be had (else her head stays as the panel has
      // it; the memory still plays).
      const headsP = (async (): Promise<HeadCels | null> => {
        const h = lm.figures?.heads;
        if (!h) return null;
        try {
          const r = await loadLayer(url(h.file), { living: true });
          extra.push(r);
          return { texture: r.texture, box: h.box, at: h.at, cells: h.cells, grid: h.grid };
        } catch {
          return null;
        }
      })();
      // The two-shot: all of it, or none (its shot is then the wide), and only for a screen that
      // shows it.
      const nearP = (async (): Promise<NearArt | null> => {
        const n = lm.near;
        if (!n || !lm.figures?.heads || !framesNear(host, SPECS[def.id] ?? WOODLAND_SPEC)) return null;
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
      scene = new LivingScene(art, SPECS[def.id] ?? WOODLAND_SPEC, { ...size, noise: host.noise!, reduced: !!host.reduced, low: host.quality === 'low' });
      living = { scene, spec: SPECS[def.id] ?? WOODLAND_SPEC, immerse: lm.immerse, crop: manifest.crop ?? [0, 0, 1, 1], aspect: manifest.size[0] / manifest.size[1], order, colourAt: orderR ? colourTimes(orderR.bitmap) : null };
      loaded.unshift({ texture: scene.target.texture, bitmap: null as unknown as ImageBitmap, name: 'scene', kind: 'pigment' });
    } catch (e) {
      // The living scene couldn't be made: the wall's poster instead, as any memory.
      console.warn('living scene unavailable; the painting stays still', e);
      for (const l of extra) {
        l.texture.dispose();
        l.bitmap.close();
      }
      extra.length = 0;
      scene?.dispose();
      scene = null;
      const poster = manifest.variants[v].find((l) => l.name === 'scene');
      if (poster) {
        try {
          loaded.unshift({ ...(await loadLayer(url(poster.file))), name: poster.name, kind: poster.kind });
        } catch (err) {
          letGo();
          throw err;
        }
      }
    }
  }
  try {
    await audio?.prepare();
    // Upload one a frame, so the first frame the memory is drawn doesn't stall.
    for (const l of [...loaded.filter((x) => x.bitmap), ...extra]) {
      host.renderer.initTexture(l.texture);
      await new Promise((r) => requestAnimationFrame(r));
    }
  } catch (e) {
    letGo();
    throw e;
  }
  let gone = false;
  return {
    def,
    variant: v,
    size: manifest.size,
    band: manifest.band ?? 0.17,
    pane: manifest.pane ?? null,
    register: manifest.register ?? null,
    layers: loaded.map((l) => ({ name: l.name, kind: l.kind, texture: l.texture })),
    audio,
    living,
    dispose() {
      if (gone) return;
      gone = true;
      for (const l of [...loaded, ...extra]) {
        if (!l.bitmap) continue;
        l.texture.dispose();
        l.bitmap.close();
      }
      scene?.dispose();
    },
  };
}

export interface PlayOptions {
  reduced: boolean;
  gentle: boolean;
  onState?: (s: Lifecycle, why?: ReleaseReason) => void;
}

/** A memory playing: the App steps it once a frame. */
export class LivingMemory {
  readonly controller: MemoryPlaybackController;

  constructor(readonly prepared: Prepared, o: PlayOptions) {
    const { def, variant } = prepared;
    const timeline = sheetSource(sheetId(def.id, variant), memorySchema(def.layers, def.living), { sections: def.sections, markers: def.markers });
    this.controller = new MemoryPlaybackController({
      timeline,
      audio: prepared.audio ?? undefined,
      weights: weightsFor(o.reduced, o.gentle),
      reduced: o.reduced,
      // The procedural entrance is only the soft start of what the timeline authors.
      entrance: Math.min(2, timeline.sections.active * 0.4),
      sways: def.sways,
      exit: def.exit,
      // If the artist moves the exit later in Studio, the memory still closes naturally there.
      maxHold: Math.max(def.maxHold, timeline.sections.exit),
      tail: def.tail,
      living: !!prepared.living,
      onState: o.onState,
    });
  }

  /** `now`: the audio time its position 0 stands for (MemoryPlaybackController). */
  start(now?: number): void {
    this.controller.start(now);
  }
  step(dt: number, now?: number): MemoryFrame | null {
    return this.controller.step(dt, now);
  }
  release(why: ReleaseReason): void {
    this.controller.release(why);
  }
  get state(): Lifecycle {
    return this.controller.state;
  }
  /** End now; the art is let go too. */
  dispose(fade = 0.3): void {
    this.controller.dispose(fade);
    this.prepared.dispose();
  }
}
