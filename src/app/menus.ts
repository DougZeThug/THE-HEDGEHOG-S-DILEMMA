import { ROOM_LEVELS } from '../state/OpeningScore';
import { wallClock } from '../world/WallText';
import { interpretLocally } from '../interpret/LocalInterpreter';
import { MAX_CONTRIBUTION } from '../interpret/schema';
import { forgetVisits, savePrefs, type Prefs } from '../ui/prefs';
import { CLASS } from '../ui/dom';
import { applyPrefs } from './prefsApply';
import type { AppContext, Peers } from './context';

/**
 * The visitor's own controls over the room: pausing and the settings, writing something on the
 * wall, forgetting, and leaving (and coming back in).
 */
export class Menus {
  private departTimer = 0;
  /** Leaving plays the opening backwards: the room's light goes, then the chair's, then black (wall-clock time it began). */
  leaving: number | null = null;

  constructor(
    private readonly ctx: AppContext,
    private readonly peers: Peers,
  ) {}

  /** Wire the page's own buttons and fields. Once, when the room is built. */
  bindUI() {
    this.ctx.dom.enter.addEventListener('click', () => void this.peers.opening.enter());
    this.ctx.dom.menuBtn.addEventListener('click', () => {
      if (this.ctx.mode === 'contribute') this.closeContribute();
      if (this.ctx.mode === 'settings') this.closeSettings();
      else this.openSettings();
    });
    this.ctx.dom.writeBtn.addEventListener('click', () => (this.ctx.mode === 'contribute' ? this.closeContribute() : this.openContribute()));
    // On a phone the keyboard closing is the way out: an empty field just closes.
    this.ctx.dom.contributeInput.addEventListener('blur', () =>
      setTimeout(() => {
        if (this.ctx.mode === 'contribute' && !this.ctx.dom.contributeInput.value.trim()) this.closeContribute();
      }, 150),
    );
    this.ctx.dom.resume.addEventListener('click', () => this.closeSettings());
    this.ctx.dom.leave.addEventListener('click', () => this.depart());
    this.ctx.dom.returnBtn.addEventListener('click', () => this.returnToRoom());
    this.ctx.dom.forget.addEventListener('click', () => {
      this.ctx.text.removeContributions();
      this.ctx.director.forgetContributions();
      this.ctx.director.forgetVisits();
      forgetVisits();
      this.ctx.visits = 0;
      // Nothing of this visit is kept from here on (its counts, how it left).
      this.ctx.forgotten = true;
      const b = this.ctx.dom.forget;
      b.textContent = 'forgotten';
      b.disabled = true;
      setTimeout(() => {
        b.textContent = 'forget what I wrote, and that I was here';
        b.disabled = false;
      }, 3000);
    });

    const vol = this.ctx.dom.optVolume;
    vol.addEventListener('input', () => this.setPref('volume', Number(vol.value)));
    this.ctx.dom.optMute.addEventListener('change', (e) => this.setPref('muted', (e.target as HTMLInputElement).checked));
    this.ctx.dom.optCaptions.addEventListener('change', (e) => {
      this.ctx.prefs.captionsChosen = true;
      this.setPref('captions', (e.target as HTMLInputElement).checked);
    });
    this.ctx.dom.optSpeech.addEventListener('change', (e) => this.setPref('speech', (e.target as HTMLInputElement).checked));
    this.ctx.dom.optMotion.addEventListener('change', (e) => {
      this.ctx.prefs.reducedMotionChosen = true;
      this.setPref('reducedMotion', (e.target as HTMLInputElement).checked);
    });
    this.ctx.dom.optIntensity.addEventListener('change', (e) => this.setPref('intensity', (e.target as HTMLSelectElement).value as Prefs['intensity']));
    this.ctx.dom.optQuality.addEventListener('change', (e) => this.setPref('quality', (e.target as HTMLSelectElement).value as Prefs['quality']));

    const form = this.ctx.dom.contributeForm;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitContribution();
    });
    // Keep the room's keys from firing while typing.
    this.ctx.dom.contributeInput.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.closeContribute();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    // Focus trap for the settings dialog.
    this.ctx.dom.settings.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...this.ctx.dom.settings.querySelectorAll<HTMLElement>('button, input, select')].filter((x) => !x.hasAttribute('disabled'));
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    });
    this.syncSettingsUI();
  }

  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    this.ctx.prefs[k] = v;
    savePrefs(this.ctx.prefs);
    applyPrefs(this.ctx);
    this.syncSettingsUI();
  }

  syncSettingsUI() {
    const p = this.ctx.prefs;
    this.ctx.dom.optVolume.value = String(p.volume);
    this.ctx.dom.optMute.checked = p.muted;
    this.ctx.dom.optCaptions.checked = p.captions;
    this.ctx.dom.optSpeech.checked = p.speech;
    this.ctx.dom.optMotion.checked = p.reducedMotion;
    this.ctx.dom.optIntensity.value = p.intensity;
    this.ctx.dom.optQuality.value = p.quality;
  }

  openSettings() {
    if (this.ctx.mode !== 'room') return;
    this.ctx.mode = 'settings';
    // (Paused as the room let them go: they stayed.)
    this.ctx.director.stayed();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ctx.rig.keys.clear();
    this.ctx.rig.cancelAttend();
    this.ctx.dom.settings.hidden = false;
    this.ctx.dom.resume.focus();
    if (this.ctx.audio) this.ctx.audio.ramp(this.ctx.audio.pause.gain, 0.3, 0.8);
    this.ctx.voices?.stopSpeech();
  }

  closeSettings() {
    if (this.ctx.mode !== 'settings') return;
    this.ctx.mode = 'room';
    this.ctx.dom.settings.hidden = true;
    this.ctx.renderer.domElement.focus();
    if (this.ctx.audio) this.ctx.audio.ramp(this.ctx.audio.pause.gain, 1, 1.5);
  }

  openContribute() {
    // Writing is another thing to do: the memory lets go.
    this.peers.living.endLivingMemory('interrupt');
    if (this.ctx.mode !== 'room') return;
    this.ctx.mode = 'contribute';
    if (document.pointerLockElement) document.exitPointerLock();
    this.ctx.rig.keys.clear();
    this.ctx.rig.cancelAttend();
    this.ctx.dom.contribute.hidden = false;
    const inp = this.ctx.dom.contributeInput;
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
  }

  closeContribute() {
    if (this.ctx.mode !== 'contribute') return;
    this.ctx.mode = 'room';
    this.ctx.dom.contribute.hidden = true;
    this.ctx.dom.contributeInput.value = '';
    this.ctx.renderer.domElement.focus();
  }

  private submitContribution() {
    const inp = this.ctx.dom.contributeInput;
    const text = inp.value.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTRIBUTION);
    inp.value = '';
    this.closeContribute();
    if (!text) return;
    const it = interpretLocally(text);
    this.ctx.director.contribute(text, it);
  }

  depart(how: 'door' | 'menu' = 'menu') {
    if (this.ctx.mode !== 'settings' && this.ctx.mode !== 'room') return;
    this.peers.living.endLivingMemory('depart');
    this.ctx.dom.settings.hidden = true;
    this.ctx.mode = 'departed';
    this.peers.wake.release();
    const line = this.ctx.director.departureLine(how);
    this.peers.living.keepTrace();
    this.ctx.director.depart();
    this.leaving = wallClock();
    this.ctx.voices?.stopSpeech();
    // The hum goes on a little after the visitor has gone.
    if (this.ctx.audio) this.ctx.audio.silence(0.97, 9999, 3);
    this.ctx.captions.clear();
    this.ctx.dom.menuBtn.hidden = true;
    this.ctx.dom.writeBtn.hidden = true;
    const dep = this.ctx.dom.departure;
    clearTimeout(this.departTimer);
    this.departTimer = window.setTimeout(() => {
      dep.hidden = false;
      requestAnimationFrame(() => dep.classList.add(CLASS.on));
      // The visit's sentence, when there is one: the room's first line, and under it, a moment later,
      // what the visit's heart left beside it on the wall (docs/reviews/2026-11-emotional-arc.md).
      const [first, answer] = line.split('\n');
      const el = this.ctx.dom.departureLine;
      el.textContent = first;
      if (answer) {
        // (A pause for a screen reader between the two: "I wanted you to" runs on into the answer.)
        const pause = document.createElement('span');
        pause.className = 'sr-only';
        pause.textContent = ' … ';
        const span = document.createElement('span');
        span.className = 'departure-answer';
        span.textContent = answer;
        el.append(pause, span);
      }
      setTimeout(() => this.ctx.dom.departureLine.classList.add(CLASS.on), 1500);
      // (Not before the answer, when there is one, has fully come.)
      setTimeout(() => {
        this.ctx.dom.returnBtn.hidden = false;
        this.ctx.dom.returnBtn.focus();
        void this.ctx.audio?.suspend();
      }, answer && !this.ctx.prefs.reducedMotion ? 9000 : 6000);
    }, this.ctx.prefs.reducedMotion ? 1500 : 4600);
  }

  /**
   * The opening in reverse, before the departure overlay: the room's light and the sky go
   * first, leaving the chair lit alone, held; then the view goes to black with the chair's light
   * still on ("The light stays on."): it is the visitor who leaves. Quicker under reduced
   * motion, where the overlay comes sooner.
   */
  playLeaving() {
    const k = this.ctx.prefs.reducedMotion ? 0.35 : 1;
    // Wall clock, like the opening, so the overlay (on a timer) never arrives before the dark.
    const t = (wallClock() - (this.leaving ?? wallClock())) / k;
    const ease = (a: number, b: number) => {
      const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };
    const room = 1 - ease(0, 1.8);
    const sc = this.ctx.lighting.score;
    sc.area = sc.hemi = room;
    sc.cone = ROOM_LEVELS.cone - 0.3 * ease(0, 1.8);
    this.ctx.room.setLit(0.12 + 0.88 * room, room);
    this.ctx.post.depart = t > 3.6 ? 1 : 0;
  }

  returnToRoom() {
    if (this.ctx.mode !== 'departed') return;
    void this.ctx.audio?.resume();
    this.ctx.audio?.lift();
    // The screen was let go when they left; keep it awake again.
    void this.peers.wake.keepAwake();
    this.ctx.mode = 'room';
    this.ctx.director.returnAfterDeparture();
    // Back in from the dark, slowly: the overlay fades while the room lightens beneath it.
    this.leaving = null;
    this.ctx.lighting.cancelDim();
    this.ctx.post.depart = 0;
    Object.assign(this.ctx.lighting.score, { area: 1, hemi: 1, glow: 1, key: ROOM_LEVELS.key, cone: ROOM_LEVELS.cone });
    this.ctx.room.setLit(1, 1);
    this.ctx.rig.pos.set(0.15, 0, 2.55);
    this.ctx.rig.yaw = 0.06;
    this.ctx.rig.pitch = -0.06;
    this.ctx.rig.stand();
    this.ctx.rig.setKneel(false);
    this.ctx.rig.cancelAttend();
    const dep = this.ctx.dom.departure;
    dep.classList.remove(CLASS.on);
    this.ctx.dom.departureLine.classList.remove(CLASS.on);
    this.ctx.dom.returnBtn.hidden = true;
    const hide = () => {
      if (!dep.classList.contains(CLASS.on)) dep.hidden = true;
    };
    dep.addEventListener('transitionend', hide, { once: true });
    setTimeout(hide, 3600);
    this.ctx.dom.menuBtn.hidden = false;
    this.ctx.dom.writeBtn.hidden = false;
    this.ctx.renderer.domElement.focus();
  }
}
