/** What each quality setting buys, in one place. */
export type Quality = 'low' | 'medium' | 'high';

/** Keys mirror the `<option>`s of #quality in index.html (static markup). `msaa` is the post target's sample count. */
export const QUALITY = {
  low: { shadowMap: 512, texelsPerM: 100, msaa: 0 },
  medium: { shadowMap: 1024, texelsPerM: 200, msaa: 2 },
  high: { shadowMap: 1024, texelsPerM: 200, msaa: 4 },
} as const satisfies Record<Quality, { shadowMap: number; texelsPerM: number; msaa: number }>;
