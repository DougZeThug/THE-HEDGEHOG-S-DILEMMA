// Types for the offline dialogue tooling (scripts/dialogue-lib.mjs), used by the tests.
export const API: string;
export const MODEL_RATES: Record<string, number>;
export const PILOT: string[];
export const SCENE_MODELS: Set<string>;
export const MAX_TAGS: number;
export function lineStart(heard: { text: string; start: number }[], text: string): number | null;
export function extraWords(text: string, transcript: string): string[];
export interface Ledger { version: number; spent: { credits: number; sttSeconds: number }; entries: Record<string, any>; runs: any[] }
export interface Job { perf: any; hash: string; estimate: number }
export function emptyLedger(): Ledger;
export function performanceHash(perf: any, direction: any): string;
export function estimateCredits(perf: any, direction: any): number;
export function words(s: string): string[];
export function wordErrorRate(reference: string, hypothesis: string): number;
export function spokenTags(perf: any, transcript: string): string[];
export function validateDirection(direction: any, phraseText: (id: string, perf: any) => string | undefined, opts?: { sad?: boolean }): string[];
export function planJobs(direction: any, ledger: Ledger, opts?: { only?: string[]; regenerate?: string[]; pilot?: boolean; proposed?: boolean; fileExists?: (f: string) => boolean }): { jobs: Job[]; skipped: { id: string; reason: string }[] };
export function applyBudget(jobs: Job[], budget: number): { run: Job[]; queued: Job[]; estimate: number };
export function mp3Info(buf: Uint8Array | ArrayBuffer): { valid: boolean; frames: number; seconds: number };
export function classifyFailure(status: number, body: string): { kind: string; code: string; message: string; retry: boolean; stop: boolean };
export function buildManifest(manifest: Record<string, string[]>, direction: any, ledger: Ledger, fileExists?: (f: string) => boolean): Record<string, string[]>;
export function buildVignettePreview(direction: any, ledger: Ledger, fileExists?: (f: string) => boolean): Record<string, string[]>;
export function buildVignetteManifest(manifest: Record<string, string[]>, direction: any, ledger: Ledger, fileExists?: (f: string) => boolean): Record<string, string[]>;
export function runJobs(o: {
  jobs: Job[]; direction: any; ledger: Ledger; key: string; fetch: (url: string, init?: any) => Promise<any>;
  writeFile: (f: string, d: Uint8Array) => Promise<void>; trim?: (audio: Uint8Array, fromSeconds: number) => Promise<Uint8Array>; saveLedger: (l: Ledger) => Promise<void>;
  sleep?: (ms: number) => Promise<void>; log?: (s: string) => void; stt?: boolean; now?: () => string; maxRetries?: number;
}): Promise<{ at: string; credits: number; generated: number; failed: number; queued: number; stopped: string | null }>;
export function transcribe(o: { fetch: any; key: string; audio: Uint8Array }): Promise<{ ok: boolean; text?: string; events?: string[]; code?: string }>;
export type Balance =
  | { known: true; used: number; limit: number; remaining: number; tier?: string; resetsAt?: string }
  | { known: false; reason: string };
export function readBalance(key: string, fetchFn?: (url: string, init?: any) => Promise<any>): Promise<Balance>;
export function balanceAllows(balance: Balance, estimate: number): { ok: boolean; note: string };
/** Directions a vignette (or a painted memory's voice) never uses: bright, amused or laughing. */
export declare const BRIGHT_TAGS: RegExp;
