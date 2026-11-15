// What the Playwright scripts in this folder (and tests/smoke.mjs) share: finding Playwright
// (installed here, or globally), the address of the built room, a Chromium that renders WebGL in
// software, and the phone they pretend to be.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(`${execSync('npm root -g').toString().trim()}/playwright`);
}
export const { chromium, devices } = playwright;

/** Where `vite preview` serves the built room. */
export const BASE = process.env.BASE ?? 'http://localhost:4173/';

/** Chromium with software WebGL (about 10 fps) and sound allowed to start without a click. */
export const launch = (extra = {}) =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    ...extra,
  });

/** An iPhone 13 at pixel ratio 1: the phone the scripts' phone profiles emulate (fast to render). */
export const PHONE = { ...devices['iPhone 13'], deviceScaleFactor: 1 };

/** The room's address with a seed, and anything else the script wants in the query. */
export const roomUrl = (seed = 7, query = '') => `${BASE}?seed=${seed}${query ? `&${query}` : ''}`;
