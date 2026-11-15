/**
 * What may reach into the App from outside: the Memory Editor (Theatre Studio, development only)
 * and the playtests and captures that drive the real page through `window.__hedgehog`. Everything
 * else about the App is its own; a member renamed here is a member those readers change with.
 */
import type { App } from '../App';

/**
 * The members tests/, the playtests and the Memory Editor (src/memory/editor/MemoryEditor.ts) read
 * or call on `window.__hedgehog` (grep `__hedgehog` before changing one).
 */
export type Hedgehog = Pick<
  App,
  | 'score' | 'handoffAt' | 'time' | 'mode' | 'look' | 'scene' | 'fps' | 'gazeId'
  | 'rig' | 'renderer' | 'director' | 'lighting' | 'text' | 'post' | 'chair' | 'inside' | 'audio' | 'voices' | 'memoryLight' | 'memoryWindow'
  | 'living' | 'vignette'
  | 'playMemory' | 'playVignette' | 'heldAt' | 'followPlayhead' | 'frameMemory' | 'studioTick' | 'endLivingMemory' | 'lookBy' | 'advance' | 'apply' | 'depart' | 'setStyle'
>;

declare global {
  interface Window {
    __hedgehog?: Hedgehog;
  }
}
