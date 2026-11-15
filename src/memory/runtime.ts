/**
 * The memories' runtime: a lazy chunk (GSAP, Theatre.js, the controller and the memory's audio),
 * loaded at idle after the opening, or when a memory is prepared. The App owns the one clock and
 * the renderer; this prepares a memory (its art and its sounds, before anything is due) and
 * plays it, a step at a time.
 *
 * `prefetch.ts` fetches ahead, `prepare.ts` (with `prepareFilm.ts` and `preparePainting.ts`) loads,
 * `LivingMemory.ts` plays; `art.ts` reads the art manifest.
 */
export { prefetch } from './prefetch';
export { prepare } from './prepare';
export { LivingMemory } from './LivingMemory';
