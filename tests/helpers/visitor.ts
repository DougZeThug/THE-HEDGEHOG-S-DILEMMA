import type { VisitorInput } from '../../src/state/VisitorModel';

/** A visitor standing still just inside the room, looking at nothing: the starting point of almost every scenario. */
export const BASE_INPUT: VisitorInput = { x: 0, z: 2.4, yaw: 0, pitch: 0, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };

/** The base visitor, with whatever the scenario changes. */
export const input = (overrides: Partial<VisitorInput> = {}): VisitorInput => ({ ...BASE_INPUT, ...overrides });

/** The seeds a test runs a scenario over. */
export const SEEDS = [1, 2, 3, 4];
