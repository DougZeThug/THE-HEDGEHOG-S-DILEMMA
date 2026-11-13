/** What each quality setting buys, in one place. */
export type Quality = 'low' | 'medium' | 'high';

export const QUALITY = {
  low: { shadowMap: 512, texelsPerM: 100, msaa: 0 },
  medium: { shadowMap: 1024, texelsPerM: 200, msaa: 2 },
  high: { shadowMap: 1024, texelsPerM: 200, msaa: 4 },
} as const satisfies Record<Quality, { shadowMap: number; texelsPerM: number; msaa: number }>;

export const shadowMapSize = (quality: Quality) => QUALITY[quality].shadowMap;

/** MSAA samples for the post-processing target. */
export const samplesFor = (quality: Quality) => QUALITY[quality].msaa;
