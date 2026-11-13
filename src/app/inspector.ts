/**
 * What may reach into the App from outside: the Memory Editor (Theatre Studio, development only)
 * and the playtests and captures that drive the real page through `window.__hedgehog`. Everything
 * else about the App is its own; a member renamed here is a member those readers change with.
 */
import type { App } from '../App';

/** What the Memory Editor needs of the room (src/memory/editor/MemoryEditor.ts). */
export interface MemoryInspector {
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

/** The members tests/ and the playtests read or call on `window.__hedgehog` (grep `__hedgehog` before changing one). */
export type Hedgehog = Pick<
  App,
  | 'score' | 'handoffAt' | 'time' | 'mode' | 'look' | 'scene' | 'fps' | 'gazeId'
  | 'rig' | 'renderer' | 'director' | 'lighting' | 'text' | 'post' | 'chair' | 'inside' | 'audio' | 'voices' | 'memoryLight' | 'memoryWindow'
  | 'living' | 'vignette'
  | 'playMemory' | 'playVignette' | 'heldAt' | 'endLivingMemory' | 'lookBy' | 'advance' | 'apply' | 'depart' | 'setStyle'
>;

declare global {
  interface Window {
    __hedgehog?: Hedgehog;
  }
}
