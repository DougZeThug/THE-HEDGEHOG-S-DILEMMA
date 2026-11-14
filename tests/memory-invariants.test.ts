import { describe, it, expect } from 'vitest';
import { MEMORIES } from '../src/memory/registry';
import { SCENE_MEMORIES } from '../src/content/memories';
import { PHRASE_BY_ID } from '../src/content/phrases';

// What must hold for every living memory, whichever it is: how the room opens it, when it counts it
// seen, how long it runs, and what a screen reader or a deaf visitor is given while it plays.
// What is particular to one memory is in its own test file.

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const living = Object.values(MEMORIES).filter((d) => d.living);

describe.each(living.map((def) => [def.id, def] as const))('the living memory %s', (id, def) => {
  const scene = SCENE_MEMORIES.find((m) => m.id === id);

  it('opens from a line the room writes', () => {
    expect(scene, 'a scene memory by this id').toBeDefined();
    expect(PHRASE_BY_ID.has(scene!.phraseId)).toBe(true);
  });

  it('is counted once seen only after it has been entered and while it is still held, and runs exactly its sections', () => {
    expect(scene!.seenAt!).toBeGreaterThan(def.sections.active);
    expect(scene!.seenAt!).toBeLessThan(def.sections.exit);
    expect(scene!.maxHold).toBe(def.sections.exit);
    expect(scene!.span).toBe(def.sections.end);
  });

  for (const variant of def.variants) {
    it(`${variant}: tells a screen reader what is there, in order, at least 3.5 s apart`, () => {
      const lines = def.announce?.(variant) ?? [];
      const ats = [...new Set(lines.map((l) => l.at))];
      for (let i = 1; i < ats.length; i++) expect(ats[i] - ats[i - 1], `${ats[i - 1]} → ${ats[i]}`).toBeGreaterThanOrEqual(3.5);
    });

    it(`${variant}: each screen-reader line can be said before the next begins`, () => {
      const lines = def.announce?.(variant) ?? [];
      // Read at 180 words a minute and queued behind the last: 2.5 words for each second until the
      // next line, from the description read as the memory begins, seen from inside or from the wall.
      for (const from of ['inside', 'wall'] as const) {
        const said = [{ at: def.sections.active, text: def.describe(variant) }, ...lines.filter((l) => !(from === 'inside' ? l.wall : l.inside))];
        for (let i = 0; i + 1 < said.length; i++)
          expect(words(said[i].text), `${from}: "${said[i].text}"`).toBeLessThanOrEqual(Math.floor(2.5 * (said[i + 1].at - said[i].at)));
      }
    });

    it(`${variant}: each caption is up long enough to read before the next (0.4 s a word, at least 1.2 s)`, () => {
      for (const [label, cue] of Object.entries(def.cues(variant).cues)) {
        if (!cue.caption && !cue.captions) continue;
        const all = [...(cue.caption ? [{ at: cue.captionAt ?? 0, text: cue.caption }] : []), ...(cue.captions ?? [])].sort((a, b) => a.at - b.at);
        for (let i = 1; i < all.length; i++)
          expect(all[i].at - all[i - 1].at, `${label}: ${all[i - 1].text} → ${all[i].text}`).toBeGreaterThanOrEqual(Math.max(1.2, 0.4 * words(all[i - 1].text)) - 1e-6);
      }
    });
  }
});
