import type * as THREE from 'three';
import type { LayerKind } from '../world/MemoryWindow';
import type { MemoryAudio } from './MemoryAudio';
import type { MemoryDef } from './memoryDef';
import type { WoodlandScene } from './living/WoodlandScene';
import type { FilmScene } from './living/FilmScene';
import { loadLayer, type ArtManifest } from './art';
import type { RuntimeHost } from './prepared';

/** A texture and the bitmap it was decoded from (a living scene's own render target has none). */
export interface Decoded {
  texture: THREE.Texture;
  bitmap: ImageBitmap;
}

/** What `prepare` has loaded so far, so that a failure anywhere can let all of it go. */
export interface Stage {
  def: MemoryDef;
  /** The variant being prepared. */
  v: string;
  host: RuntimeHost;
  base: string;
  /** '@low' on a phone, else ''. */
  suffix: string;
  manifest: ArtManifest;
  audio: MemoryAudio | null;
  /** The wall's layers (and, first, a living scene's own render target). */
  loaded: (Decoded & { name: string; kind: LayerKind })[];
  /** A living scene's own art. */
  extra: Decoded[];
  scene: WoodlandScene | FilmScene | null;
  url(file: string, sfx?: string): string;
  /** Let go of everything staged, the audio too. */
  letGo(): void;
}

/** A living scene's render target: the screen's shape, capped by quality (its long side). */
export function targetSize(host: RuntimeHost): { width: number; height: number } {
  const cap = host.quality === 'low' ? 1280 : host.quality === 'medium' ? 1600 : 1920;
  const w = host.screen?.width ?? 1280, h = host.screen?.height ?? 720;
  const aspect = Math.min(2.6, Math.max(0.42, w / h));
  const long = Math.min(cap, Math.max(w, h));
  return aspect >= 1 ? { width: Math.round(long), height: Math.round(long / aspect) } : { width: Math.round(long * aspect), height: Math.round(long) };
}

/** Let go of a living scene's art, and the scene itself (a scene that failed half-made). */
export function dropScene(st: Stage): void {
  for (const l of st.extra) {
    l.texture.dispose();
    l.bitmap.close();
  }
  st.extra.length = 0;
  st.scene?.dispose();
  st.scene = null;
}

/** The living scene couldn't be made: the wall's poster instead, still (as any memory). */
export async function fallBackToPoster(st: Stage): Promise<void> {
  const poster = st.manifest.variants[st.v].find((l) => l.name === 'scene');
  if (!poster) return;
  try {
    st.loaded.unshift({ ...(await loadLayer(st.url(poster.file))), name: poster.name, kind: poster.kind });
  } catch (err) {
    st.letGo();
    throw err;
  }
}
