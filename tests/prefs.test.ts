import { describe, it, expect } from 'vitest';
import { stubMatchMedia, stubStorage } from './helpers/storage';

describe('preferences', () => {
  it('the system reduced-motion setting is followed unless the visitor chose otherwise', async () => {
    stubStorage();
    let reduce = true;
    stubMatchMedia((q) => (q.includes('reduced-motion') ? reduce : false));
    const { loadPrefs, savePrefs } = await import('../src/ui/prefs');
    // A volume change once saved every preference, freezing reduced motion as it was then.
    reduce = false;
    savePrefs({ ...loadPrefs(), volume: 0.4 });
    reduce = true;
    expect(loadPrefs().reducedMotion).toBe(true);
    savePrefs({ ...loadPrefs(), reducedMotion: false, reducedMotionChosen: true });
    expect(loadPrefs().reducedMotion).toBe(false);
  });
  it('captions are off unless the visitor chooses them (a default saved with another preference is not a choice)', async () => {
    const store = stubStorage();
    stubMatchMedia(() => false);
    const { loadPrefs, savePrefs } = await import('../src/ui/prefs');
    expect(loadPrefs().captions).toBe(false);
    // Saved while they were on by default (with a volume change): still off.
    store.set('hh.prefs.v1', JSON.stringify({ volume: 0.4, captions: true }));
    expect(loadPrefs().captions).toBe(false);
    savePrefs({ ...loadPrefs(), captions: true, captionsChosen: true });
    expect(loadPrefs().captions).toBe(true);
    savePrefs({ ...loadPrefs(), captions: false, captionsChosen: true });
    expect(loadPrefs().captions).toBe(false);
  });
});
