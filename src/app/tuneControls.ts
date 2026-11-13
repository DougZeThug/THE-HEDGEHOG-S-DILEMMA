/**
 * The artist's panel (?tune): which values of the room's light and look it moves, and the actions
 * beside them. Presentation only: it never touches the Director's state or timing (src/ui/Tune.ts).
 */
import { MEMORY_IDS } from '../content/ids';
import { Director } from '../state/Director';
import { LOOK_NAMES, type Look } from '../world/Style';
import { applyLook, setStyle } from './prefsApply';
import { sleep } from '../core/time';
import type { AppContext, Peers } from './context';

type Mount = typeof import('../ui/Tune').mountTune;

/** The look's sliders (Style.ts): name, least, most. The presets set all of these; a slider then changes one. */
const LOOK_SLIDERS: [keyof Look, number, number][] = [
  ['fill', 0, 1.5], ['area', 0, 4], ['key', 0, 2], ['cone', 0.5, 1.3], ['glow', 0, 1.5], ['warmth', 0, 1.5], ['ceiling', 0, 12],
  ['exposure', 0.8, 1.4], ['vignette', 0, 0.6], ['grain', 0, 0.06], ['texture', 0, 2], ['contact', 0, 1.5], ['shadowSoft', 0.3, 3],
  ['faint', 0.8, 1.6], ['skyGlow', 0, 20], ['contrast', 0, 0.8], ['stains', 0, 1], ['aim', 0, 1], ['panel', 0.5, 3], ['vigLow', 0, 1],
];

export function mountTuneControls(ctx: AppContext, peers: Peers, mount: Mount): void {
  const sc = ctx.lighting.score;
  const slider = (group: string, label: string, min: number, max: number, get: () => number, set: (v: number) => void) => ({ group, label, min, max, step: (max - min) / 100, get, set });
  mount(
    [
      slider('light', 'key', 0, 1.5, () => sc.key, (v) => (sc.key = v)),
      slider('light', 'room', 0, 1.5, () => sc.area, (v) => (sc.area = v)),
      slider('light', 'sky', 0, 1.5, () => sc.hemi, (v) => (sc.hemi = v)),
      slider('light', 'glow', 0, 2, () => sc.glow, (v) => (sc.glow = v)),
      slider('light', 'cone', 0.5, 1.2, () => sc.cone, (v) => (sc.cone = v)),
      ...LOOK_SLIDERS.map(([k, lo, hi]) =>
        slider('look', k, lo, hi, () => ctx.look[k], (v) => {
          ctx.look = { ...ctx.look, [k]: v };
          ctx.lookName = 'custom';
          applyLook(ctx);
        }),
      ),
      slider('memory', 'light', 0, 0.8, () => ctx.memoryLight.gain, (v) => (ctx.memoryLight.gain = v)),
    ],
    [
      ...LOOK_NAMES.map((name) => ({ label: name, run: () => setStyle(ctx, name), pressed: () => ctx.lookName === name })),
      {
        label: 'the memory, now',
        run: () => {
          const m = Director.MEMORY;
          if (!ctx.text.anchorOf(m.phraseId)) ctx.text.setShown(m.phraseId);
          peers.cues.apply({ type: 'memory', phraseId: m.phraseId, attack: m.attack, hold: m.hold, release: m.release });
        },
      },
      {
        label: 'cereal, now',
        run: () => {
          if (!ctx.text.anchorOf(MEMORY_IDS.cereal)) ctx.text.setShown(MEMORY_IDS.cereal);
          // Walk to where it is seen whole, face it, and begin once the line is there.
          void sleep(600).then(() => {
            peers.living.frameMemory(MEMORY_IDS.cereal);
            void peers.living.playMemory(MEMORY_IDS.cereal, MEMORY_IDS.cereal);
          });
        },
      },
    ],
  );
}
