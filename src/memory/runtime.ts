import * as THREE from 'three';
import { MemoryPlaybackController } from './MemoryPlaybackController';
import { MemoryAudio, type MemoryAudioHost } from './MemoryAudio';
import { weightsFor } from './compose';
import { MEMORIES, sheetId, type MemoryDef } from './defs';
import { memorySchema } from './sheets';
import { sheetSource } from './theatre';
import type { Lifecycle, MemoryFrame, ReleaseReason } from './types';
import type { WindowLayer, LayerKind } from '../world/MemoryWindow';

/**
 * The memories' runtime: a lazy chunk (GSAP, Theatre.js, the controller and the memory's audio),
 * loaded at idle after the opening, or when a memory is prepared. The App owns the one clock and
 * the renderer; this prepares a memory (its art and its sounds, before anything is due) and
 * plays it, a step at a time.
 */
export { MEMORIES };

interface ArtManifest {
  size: [number, number];
  variants: Record<string, { name: string; kind: LayerKind; file: string; source: string }[]>;
}

export interface RuntimeHost {
  renderer: THREE.WebGLRenderer;
  audio: MemoryAudioHost | null;
  /** 'low' loads the phone set (@low). */
  quality: 'low' | 'medium' | 'high';
  base?: string;
}

export interface Prepared {
  def: MemoryDef;
  variant: string;
  size: [number, number];
  layers: WindowLayer[];
  audio: MemoryAudio | null;
  dispose(): void;
}

async function loadLayer(url: string): Promise<{ texture: THREE.Texture; bitmap: ImageBitmap }> {
  const blob = await (await fetch(url)).blob();
  // ImageBitmaps ignore the texture's flipY and premultiply flags: ask for both when decoding.
  // Premultiplied, so transparent edges never filter to a dark fringe.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
  const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace; // composited in sRGB in the shader, as painted
  texture.anisotropy = 4; // walls are seen obliquely
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return { texture, bitmap };
}

/** Fetch and decode a memory's art and sounds, uploading one texture a frame. */
export async function prepare(id: string, variant: string, host: RuntimeHost): Promise<Prepared> {
  const def = MEMORIES[id];
  if (!def) throw new Error(`No memory "${id}"`);
  const v = def.variants.includes(variant) ? variant : def.variants[0];
  const base = host.base ?? './memories/';
  const manifest = (await (await fetch(`${base}${def.art}/manifest.json`)).json()) as ArtManifest;
  const suffix = host.quality === 'low' ? '@low' : '';
  const loaded: { texture: THREE.Texture; bitmap: ImageBitmap; name: string; kind: LayerKind }[] = [];
  for (const l of manifest.variants[v]) {
    const { texture, bitmap } = await loadLayer(`${base}${def.art}/${l.file}${suffix}.webp`);
    // Upload now, one a frame, so the first frame the memory is drawn doesn't stall.
    host.renderer.initTexture(texture);
    await new Promise((r) => requestAnimationFrame(r));
    loaded.push({ texture, bitmap, name: l.name, kind: l.kind });
  }
  let audio: MemoryAudio | null = null;
  if (host.audio) {
    const sid = sheetId(def.id, v);
    const src = sheetSource(sid, memorySchema(def.layers), { sections: def.sections, markers: def.markers });
    audio = new MemoryAudio(host.audio, def.cues(v), src.markers, id.length * 7 + v.length);
    await audio.prepare();
  }
  return {
    def,
    variant: v,
    size: manifest.size,
    layers: loaded.map((l) => ({ name: l.name, kind: l.kind, texture: l.texture })),
    audio,
    dispose() {
      for (const l of loaded) {
        l.texture.dispose();
        l.bitmap.close();
      }
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
    const timeline = sheetSource(sheetId(def.id, variant), memorySchema(def.layers), { sections: def.sections, markers: def.markers });
    this.controller = new MemoryPlaybackController({
      timeline,
      audio: prepared.audio ?? undefined,
      weights: weightsFor(o.reduced, o.gentle),
      reduced: o.reduced,
      // The procedural entrance is only the soft start of what the timeline authors.
      entrance: Math.min(2, timeline.sections.active * 0.4),
      sways: def.sways,
      exit: def.exit,
      residue: def.residue,
      maxHold: def.maxHold,
      tail: def.tail,
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
