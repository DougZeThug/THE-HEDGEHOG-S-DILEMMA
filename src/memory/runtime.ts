import * as THREE from 'three';
import { MemoryPlaybackController } from './MemoryPlaybackController';
import { MemoryAudio, type MemoryAudioHost } from './MemoryAudio';
import { weightsFor } from './compose';
import { MEMORIES, sheetId, type MemoryDef } from './defs';
import { memorySchema } from './sheets';
import { sheetSource } from './theatre';
import type { Lifecycle, MemoryFrame, ReleaseReason } from './types';
import type { WindowLayer, LayerKind } from '../world/MemoryWindow';
import { LivingScene, type LivingArt } from './living/LivingScene';
import { WOODLAND as WOODLAND_SPEC, type LivingSpec } from './living/woodland';

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
  living?: Record<string, LivingManifest | null>;
}

interface LivingManifest {
  plate: string;
  maps: string;
  grade: string | null;
  /** The same composition later, nobody there (the cut). */
  after?: string | null;
  sky: { file: string; box: [number, number, number, number] } | null;
  figures: {
    file: string;
    lids: string;
    sketch: string;
    place: [number, number, number, number];
    pixels: [number, number];
    split: number;
    anatomy: LivingArt['figures'] extends infer F ? (F extends { anatomy: infer A } ? A : never) : never;
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

/** A living memory's scene, prepared (src/memory/living/). */
export interface PreparedLiving {
  scene: LivingScene;
  spec: LivingSpec;
  /** It may be entered (or only seen on the wall). */
  immerse: boolean;
  /** What the wall shows first (painting uv: x0, y0, w, h). */
  crop: [number, number, number, number];
  /** The painting's aspect (w / h). */
  aspect: number;
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

/** Fetched bytes, kept so a memory armed earlier starts without a network wait. */
const fetched = new Map<string, Promise<Blob>>();
function fetchBlob(url: string): Promise<Blob> {
  let p = fetched.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${url}: ${r.status}`))));
    p.catch(() => fetched.delete(url));
    fetched.set(url, p);
  }
  return p;
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
 * Fetch a memory's art ahead (when its line is armed), so beginning it waits on nothing but
 * decoding. Sounds are fetched by the voices' own loader when the memory is prepared.
 */
export async function prefetch(id: string, variant: string, host: Pick<RuntimeHost, 'quality' | 'base'>): Promise<void> {
  const def = MEMORIES[id];
  if (!def) return;
  const v = def.variants.includes(variant) ? variant : def.variants[0];
  const base = host.base ?? './memories/';
  const suffix = host.quality === 'low' ? '@low' : '';
  try {
    const manifest = await manifestOf(base, def.art);
    const lm = manifest.living?.[v];
    const wall = manifest.variants[v].filter((l) => !(lm && l.name === 'scene')).map((l) => ({ file: l.file, suffix }));
    const files = lm ? [...wall, ...livingFiles(lm, suffix)] : wall;
    await Promise.all(files.map((f) => fetchBlob(`${base}${def.art}/${f.file}${f.suffix}.webp`)));
  } catch {
    /* it will be fetched again when it is needed */
  }
}

/** A living scene's files (maps, grade and sky have one size only). */
function livingFiles(lm: LivingManifest, suffix: string): { file: string; suffix: string }[] {
  const out = [{ file: lm.plate, suffix }, { file: lm.maps, suffix: '' }];
  if (lm.grade) out.push({ file: lm.grade, suffix: '' });
  if (lm.after) out.push({ file: lm.after, suffix });
  if (lm.sky) out.push({ file: lm.sky.file, suffix: '' });
  if (lm.figures) out.push({ file: lm.figures.file, suffix }, { file: lm.figures.lids, suffix }, { file: lm.figures.sketch, suffix });
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
  let scene: LivingScene | null = null;
  const letGo = () => {
    for (const l of [...loaded, ...extra]) {
      l.texture.dispose();
      l.bitmap.close();
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
  if (lm) {
    try {
      const one = async (file: string, o: { data?: boolean; sfx?: string } = {}) => {
        const r = await loadLayer(url(file, o.sfx ?? suffix), { living: true, data: o.data });
        extra.push(r);
        return r.texture;
      };
      const [plate, maps, grade, sky, fig, lids, fsk, after] = await Promise.all([
        one(lm.plate),
        one(lm.maps, { data: true, sfx: '' }),
        lm.grade ? one(lm.grade, { data: true, sfx: '' }) : Promise.resolve(null),
        lm.sky ? one(lm.sky.file, { sfx: '' }) : Promise.resolve(null),
        lm.figures ? one(lm.figures.file) : Promise.resolve(null),
        lm.figures ? one(lm.figures.lids) : Promise.resolve(null),
        lm.figures ? one(lm.figures.sketch) : Promise.resolve(null),
        lm.after ? one(lm.after) : Promise.resolve(null),
      ]);
      const art: LivingArt = {
        plate,
        maps,
        grade,
        after,
        sky: sky && lm.sky ? { texture: sky, box: lm.sky.box } : null,
        figures: lm.figures && fig && lids && fsk ? { texture: fig, lids, sketch: fsk, place: lm.figures.place, pixels: lm.figures.pixels, split: lm.figures.split, anatomy: lm.figures.anatomy } : null,
        size: manifest.plate ?? [1672, 941],
      };
      const size = targetSize(host);
      scene = new LivingScene(art, SPECS[def.id] ?? WOODLAND_SPEC, { ...size, noise: host.noise!, reduced: !!host.reduced });
      living = { scene, spec: SPECS[def.id] ?? WOODLAND_SPEC, immerse: lm.immerse, crop: manifest.crop ?? [0, 0, 1, 1], aspect: manifest.size[0] / manifest.size[1] };
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

  start(): void {
    this.controller.start();
  }
  step(dt: number): MemoryFrame | null {
    return this.controller.step(dt);
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
