import studio from '@theatre/studio';
import { onChange } from '@theatre/core';
import { driver, PROJECT_ID, readStateFrom, theatreProject } from '../theatre';
import { MEMORIES, sheetId } from '../defs';
import type { TheatreState } from '../seed';

/**
 * The Memory Editor (development only: `?memory&studio`; never in a production build).
 *
 * Theatre Studio, in the real room, over the real memory: pick a memory and a variant, start it
 * where the visitor would see it, then select, scrub, adjust and keyframe in Studio. The memory
 * follows Studio's playhead (held exactly there, nothing sounding: scrubbing never plays a cue).
 * Sections and sound markers are read when a memory starts: after moving one, press Start again.
 * "Save to repo" writes src/memory/theatre-state.json through the dev server, which is what
 * production plays; commit it. "Download" is the fallback (put the file in the same place).
 * See docs/memories.md.
 */
export interface EditorHost {
  playMemory(id: string, phraseId: string, variant: string): Promise<boolean>;
  heldAt(position: number | null): unknown;
  followPlayhead(position: number): void;
  memoryWindow: { stylize: number };
  frameMemory(phraseId: string): void;
  endLivingMemory(why: 'complete' | 'interrupt' | 'depart'): void;
  /** Ticks Theatre's driver from the App frame (Studio's UI and playback). */
  studioTick: ((now: number) => void) | null;
  text: { anchorOf(id: string): unknown; setShown(id: string): void };
}

const PHRASE: Record<string, string> = { cereal: 'cereal' };

export function openEditor(app: EditorHost): void {
  studio.initialize({ __experimental_rafDriver: driver, persistenceKey: 'hedgehog-memories' });
  readStateFrom(() => studio.createContentOfSaveFile(PROJECT_ID) as unknown as TheatreState);
  theatreProject();
  app.studioTick = (now) => driver.tick(now);

  const bar = document.createElement('div');
  bar.id = 'memory-editor';
  bar.style.cssText =
    'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:6px;align-items:center;padding:6px 8px;background:rgba(20,20,22,.85);color:#eee;font:12px system-ui;border-radius:6px';
  const sel = (opts: string[]) => {
    const s = document.createElement('select');
    for (const o of opts) s.add(new Option(o, o));
    return s;
  };
  const btn = (label: string, run: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = run;
    return b;
  };
  const memory = sel(Object.keys(MEMORIES));
  const variant = sel(MEMORIES[memory.value].variants);
  memory.onchange = () => {
    variant.innerHTML = '';
    for (const v of MEMORIES[memory.value].variants) variant.add(new Option(v, v));
  };
  const status = document.createElement('span');
  let unfollow: (() => void) | null = null;

  const start = async () => {
    const id = memory.value, v = variant.value;
    const phrase = PHRASE[id] ?? id;
    if (!app.text.anchorOf(phrase)) app.text.setShown(phrase);
    await new Promise((r) => setTimeout(r, 600));
    app.frameMemory(phrase);
    if (!(await app.playMemory(id, phrase, v))) {
      status.textContent = 'the line is not on a wall';
      return;
    }
    // Follow Studio's playhead: select the sheet, and the memory is held wherever it is.
    const sheet = theatreProject().sheet(sheetId(id, v));
    unfollow?.();
    unfollow = onChange(sheet.sequence.pointer.position, (p) => app.followPlayhead(p), driver);
    studio.setSelection([sheet]);
    (window as unknown as { __memorySheet: unknown }).__memorySheet = sheet; // for the editor's own tests
    app.heldAt(sheet.sequence.position);
    status.textContent = `${sheetId(id, v)}: scrub or play in Studio`;
  };
  const save = async () => {
    const body = JSON.stringify(studio.createContentOfSaveFile(PROJECT_ID));
    try {
      const r = await fetch('/__memory/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      status.textContent = r.ok ? 'saved to src/memory/theatre-state.json: commit it' : `not saved: ${await r.text()}`;
    } catch (e) {
      status.textContent = `not saved: ${String(e)}`;
    }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(studio.createContentOfSaveFile(PROJECT_ID), null, 2)], { type: 'application/json' }));
    a.download = 'theatre-state.json';
    a.click();
  };
  bar.append(
    memory,
    variant,
    btn('Start', () => void start()),
    btn('Play on', () => app.heldAt(null)),
    btn('Release', () => {
      app.heldAt(null);
      app.endLivingMemory('complete');
    }),
    btn('Interrupt', () => {
      app.heldAt(null);
      app.endLivingMemory('interrupt');
    }),
    btn('Stylized / as baked', () => (app.memoryWindow.stylize = app.memoryWindow.stylize > 0.5 ? 0 : 1)),
    btn('Save to repo', () => void save()),
    btn('Download', download),
    status,
  );
  document.body.append(bar);
}
