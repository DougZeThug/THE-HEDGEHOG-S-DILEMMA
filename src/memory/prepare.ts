import { MemoryAudio } from './MemoryAudio';
import { sheetId } from './memoryDef';
import { memorySchema } from './sheets';
import { sheetSource } from './theatre';
import { memoryEntry } from './registry';
import { withVoices } from '../content/memory-voices';
import { isFilm, loadLayer, manifestOf } from './art';
import { prepareFilm } from './prepareFilm';
import { preparePainting } from './preparePainting';
import type { Prepared, PreparedLiving, RuntimeHost } from './prepared';
import type { Stage } from './stage';

/** Fetch and decode a memory's art and sounds (in parallel), uploading one texture a frame. */
export async function prepare(id: string, variant: string, host: RuntimeHost): Promise<Prepared> {
  const { def } = memoryEntry(id);
  const v = def.variants.includes(variant) ? variant : def.variants[0];
  const base = host.base ?? './memories/';
  const manifest = await manifestOf(base, def.art);
  const suffix = host.quality === 'low' ? '@low' : '';
  let audio: MemoryAudio | null = null;
  const voices = host.voices?.version ? { version: host.voices.version, filesOf: host.voices.filesOf } : null;
  if (host.audio) {
    const sid = sheetId(def.id, v);
    const src = sheetSource(sid, memorySchema(def.layers, def.living), { sections: def.sections, markers: def.markers });
    // Its voices, if any, are its own cues on its own markers: one clock, one dispatch.
    const sound = withVoices(def.cues(v), src.markers, def.id, v, voices?.version, voices?.filesOf);
    audio = new MemoryAudio(host.audio, sound.sheet, sound.markers, id.length * 7 + v.length);
  }
  // A living variant draws its painting itself: the wall's flattened poster is only its fallback.
  const lm = def.living && host.noise ? manifest.living?.[v] ?? null : null;
  const wallLayers = manifest.variants[v].filter((l) => !(lm && l.name === 'scene'));
  const url = (file: string, sfx = suffix) => `${base}${def.art}/${file}${sfx}.webp`;
  const settled = await Promise.allSettled(wallLayers.map((l) => loadLayer(url(l.file))));
  const st: Stage = {
    def, v, host, base, suffix, manifest, audio, url,
    loaded: [],
    extra: [],
    scene: null,
    letGo() {
      for (const l of [...st.loaded, ...st.extra]) {
        l.texture.dispose();
        // (The living scene's own entry has no bitmap: QA, 2026-10-20.)
        l.bitmap?.close();
      }
      st.scene?.dispose();
      audio?.dispose(0);
    },
  };
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') st.loaded.push({ ...r.value, name: wallLayers[i].name, kind: wallLayers[i].kind });
  });
  const failed = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) {
    st.letGo();
    throw failed.reason;
  }
  let living: PreparedLiving | null = null;
  if (isFilm(lm)) living = await prepareFilm(st, lm);
  else if (lm) living = await preparePainting(st, lm);
  try {
    await audio?.prepare();
    // Upload one a frame, so the first frame the memory is drawn doesn't stall.
    for (const l of [...st.loaded.filter((x) => x.bitmap), ...st.extra]) {
      host.renderer.initTexture(l.texture);
      await new Promise((r) => requestAnimationFrame(r));
    }
  } catch (e) {
    st.letGo();
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
    layers: st.loaded.map((l) => ({ name: l.name, kind: l.kind, texture: l.texture })),
    audio,
    voices,
    living,
    dispose() {
      if (gone) return;
      gone = true;
      for (const l of [...st.loaded, ...st.extra]) {
        if (!l.bitmap) continue;
        l.texture.dispose();
        l.bitmap.close();
      }
      st.scene?.dispose();
    },
  };
}
