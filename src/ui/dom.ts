/**
 * The page's elements, looked up once. index.html owns every id here; a missing one is an error
 * that names it, not a null cast away to fail somewhere else later.
 */

/** The class names the room switches on <body>, <html> and its overlays. */
export const CLASS = {
  darkRoom: 'dark-room',
  reduceMotion: 'reduce-motion',
  on: 'on',
  away: 'away',
  titling: 'titling',
} as const;

function find<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}, which the room needs`);
  return el as T;
}

export interface Dom {
  stage: HTMLElement;
  threshold: HTMLElement;
  thresholdLine: HTMLElement;
  title: HTMLElement;
  enter: HTMLButtonElement;
  captions: HTMLElement;
  /** The live region a screen reader hears the room's changes from. */
  memorySr: HTMLElement;
  hint: HTMLElement;
  skip: HTMLElement;
  menuBtn: HTMLElement;
  writeBtn: HTMLElement;
  contribute: HTMLElement;
  contributeForm: HTMLFormElement;
  contributeInput: HTMLInputElement;
  settings: HTMLElement;
  resume: HTMLElement;
  forget: HTMLButtonElement;
  leave: HTMLElement;
  departure: HTMLElement;
  departureLine: HTMLElement;
  returnBtn: HTMLElement;
  debug: HTMLElement;
  optVolume: HTMLInputElement;
  optMute: HTMLInputElement;
  optCaptions: HTMLInputElement;
  optSpeech: HTMLInputElement;
  optMotion: HTMLInputElement;
  optIntensity: HTMLSelectElement;
  optQuality: HTMLSelectElement;
}

export function lookupDom(): Dom {
  return {
    stage: find('stage'),
    threshold: find('threshold'),
    thresholdLine: find('threshold-line'),
    title: find('title'),
    enter: find('enter'),
    captions: find('captions'),
    memorySr: find('memory-sr'),
    hint: find('hint'),
    skip: find('skip'),
    menuBtn: find('menu-btn'),
    writeBtn: find('write-btn'),
    contribute: find('contribute'),
    contributeForm: find('contribute-form'),
    contributeInput: find('contribute-input'),
    settings: find('settings'),
    resume: find('resume'),
    forget: find('forget'),
    leave: find('leave'),
    departure: find('departure'),
    departureLine: find('departure-line'),
    returnBtn: find('return'),
    debug: find('debug'),
    optVolume: find('opt-volume'),
    optMute: find('opt-mute'),
    optCaptions: find('opt-captions'),
    optSpeech: find('opt-speech'),
    optMotion: find('opt-motion'),
    optIntensity: find('opt-intensity'),
    optQuality: find('opt-quality'),
  };
}

/**
 * #enter is the visitor's way in, and its text the room's one word to them before the opening.
 * The boot sets it (`go in`) and main.ts sets it when the room cannot be built, both through
 * this, so there is one owner of what that button says.
 */
export function setEnter(text: string, enabled: boolean): void {
  const b = document.getElementById('enter') as HTMLButtonElement | null;
  if (!b) return;
  b.textContent = text;
  b.disabled = !enabled;
}
