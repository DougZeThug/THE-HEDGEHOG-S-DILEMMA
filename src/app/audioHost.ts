import * as THREE from 'three';
import { fetchBlob } from '../memory/fetched';
import { isSpot } from '../memory/cueSheet';
import type { MemoryAudioHost } from '../memory/MemoryAudio';
import type { AppContext, Peers } from './context';

/**
 * Words that are not recorded yet (previews only): said in a voice without words, and captioned.
 * Shared by a painted memory and a vignette; each decides for itself when it is still wanted.
 */
export function previewWhisper(
  ctx: AppContext,
  voices: NonNullable<AppContext['voices']>,
  cue: Parameters<NonNullable<MemoryAudioHost['fallback']>>[0],
  from: ReturnType<MemoryAudioHost['where']>,
): void {
  const text = cue.text ?? '';
  void voices.playLine('whisper', text, { from }, 0.7, undefined, { synth: true, priority: true }).then((p) => {
    if (p.duration > 0) ctx.captions.show(text, p.duration, false, cue.side);
  });
}

/** What a painted memory (or a vignette, which builds on it) plays through: the memory bus, its places, its captions. */
export function memoryAudioHost(ctx: AppContext, peers: Peers): MemoryAudioHost | null {
  const a = ctx.audio, voices = ctx.voices;
  if (!a || !voices) return null;
  const mesh = ctx.memoryWindow.mesh;
  const host: MemoryAudioHost = {
    ctx: a.ctx,
    out: a.buses.memory,
    load: async (asset, take) => {
      if (asset.startsWith('synth:')) return loadSynth(asset, a.ctx, take);
      if (!asset.startsWith('music/')) return voices.raw(asset, take);
      try {
        // (Fetched ahead with the memory's art, when its line was armed.)
        return await a.ctx.decodeAudioData(await (await fetchBlob('./' + asset)).arrayBuffer());
      } catch (e) {
        // Music that will not decode is a memory without that music, not a failed memory.
        console.warn(`[hedgehog] ${asset} could not be loaded or decoded; the memory plays without it`, e);
        return null;
      }
    },
    impulse: (sec, decay, seed) => a.impulse(sec, decay, seed),
    get intensity() {
      return a.intensity;
    },
    // Window-local (u, v across it; d metres behind the wall) → the room.
    where: (p) => {
      if (isSpot(p)) return peers.vignettes.spotWorld(p);
      mesh.updateWorldMatrix(true, false);
      const w = mesh.localToWorld(new THREE.Vector3(p.u, p.v, -p.d / Math.max(1e-3, mesh.scale.z)));
      return [w.x, w.y, w.z];
    },
    // Spoken lines (a painted memory's overheard voices) are levelled as a vignette's are.
    level: (asset, buf) => (asset.startsWith('vig:') ? voices.voicedLevel(buf) : 1),
    caption: (text, seconds, speech, side) => {
      // Words said in it are captioned as speech, by side; its sounds only while nobody speaks.
      // (Beneath the words still on screen, as a vignette's, when it has words: never over them.)
      if (speech) ctx.captions.say('speech', text, seconds, side, true);
      else if (ctx.living?.memory.prepared.voices) ctx.captions.say('sound', text, seconds, undefined, true);
      else if (!ctx.captions.speaking) ctx.captions.say('sound', text, seconds);
    },
    // Not recorded yet (`?memory=` previews only): the words in a voice without words, and the caption.
    fallback: (cue, delay) => {
      const living = ctx.living;
      // Previews only: a visitor hears kept takes or nothing. A kept take that failed to load
      // leaves the memory wordless here, not a synthetic whisper with the words captioned.
      if (!living?.preview) return;
      setTimeout(() => {
        // (Not after it has been let go: a sentence not yet begun is never begun then.)
        if (!living || ctx.living !== living || (living.memory.state !== 'emerging' && living.memory.state !== 'active')) return;
        const from = isSpot(cue.place) ? peers.vignettes.spotWorld(cue.place) : host.where(cue.place);
        previewWhisper(ctx, voices, cue, from);
      }, delay * 1000);
    },
  };
  return host;
}

/** A `synth:` asset: a sound the room makes itself rather than loads (src/memory/synth*.ts). */
async function loadSynth(asset: string, ctx: AudioContext, take: number | undefined): Promise<AudioBuffer | null> {
  const name = asset.slice('synth:'.length);
  if (name === 'air') return (await import('../memory/synthAir')).synthAir(ctx.sampleRate, 7 + (take ?? 0));
  const woods = await import('../memory/synthWoods');
  if ((woods.WOODS_KINDS as readonly string[]).includes(name)) return woods.synthWoods(ctx, name as (typeof woods.WOODS_KINDS)[number]);
  const { synthSound, SYNTH_KINDS } = await import('../memory/synthSounds');
  return (SYNTH_KINDS as readonly string[]).includes(name) ? synthSound(ctx, name as (typeof SYNTH_KINDS)[number], 1 + (take ?? 0)) : null;
}
