import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { FilmScene, filmType, loadFilm } from '../src/memory/living/FilmScene';
import { ALMOST, ALMOST_SECTIONS, FILM_AT, FILM_BEATS, FILM_SECONDS, THINGS, THINGS_AT, THINGS_BEATS, THINGS_SECONDS, THINGS_SECTIONS } from '../src/memory/defs';
import { SCENE_MEMORIES } from '../src/content/memories';

// "Almost" (docs/almost.md): a film played as a living memory. The memory's one clock decides the
// frame; the video is only its decoder, kept on that frame whether the memory plays, is held or is
// seeked.

/** A video element as far as FilmScene uses it: it records seeks and plays. */
class FakeVideo {
  paused = true;
  readyState = 4;
  HAVE_CURRENT_DATA = 2;
  src = 'blob:film';
  seeks: number[] = [];
  plays = 0;
  playbackRate = 1;
  refuse: string | null = null;
  private t = 0;
  private listeners = new Map<string, () => void>();
  get currentTime(): number {
    return this.t;
  }
  set currentTime(x: number) {
    this.t = x;
    this.seeks.push(x);
  }
  /** Time passing while it plays (at its rate). */
  advance(dt: number): void {
    if (!this.paused) this.t += dt * this.playbackRate;
  }
  /** The decoder falling behind. */
  stall(s: number): void {
    this.t -= s;
  }
  play(): Promise<void> {
    this.plays++;
    if (this.refuse) return Promise.reject(Object.assign(new Error('no'), { name: this.refuse }));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(k: string, f: () => void): void {
    this.listeners.set(k, f);
  }
  removeEventListener(k: string): void {
    this.listeners.delete(k);
  }
  fire(k: string): void {
    this.listeners.get(k)?.();
  }
  removeAttribute(): void {
    this.src = '';
  }
  load(): void {}
}

const gl = { getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {} } as unknown as THREE.WebGLRenderer;
const view = new THREE.Vector4(0, 0, 1, 1);
const make = () => {
  const video = new FakeVideo();
  const scene = new FilmScene({ video: video as unknown as HTMLVideoElement, fps: 24, frames: Math.round(FILM_SECONDS * 24) }, { width: 16, height: 16, reduced: false });
  return { video, scene };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a film as a living memory', () => {
  it('shows the frame the timeline asks for, clamped to the film', () => {
    const { scene } = make();
    expect(scene.frameAt({ 'scene.film': 0 })).toBe(0);
    expect(scene.frameAt({ 'scene.film': 1 })).toBe(24);
    expect(scene.frameAt({ 'scene.film': 12.5 })).toBe(300);
    expect(scene.frameAt({ 'scene.film': FILM_SECONDS - 0.001 })).toBe(Math.round(FILM_SECONDS * 24) - 1);
    expect(scene.frameAt({ 'scene.film': FILM_SECONDS + 9 })).toBe(Math.round(FILM_SECONDS * 24) - 1);
    expect(scene.frameAt({ 'scene.film': -1 })).toBe(0);
    expect(scene.frameAt({})).toBe(0);
    expect(scene.choose()).toBe(0);
  });

  it('held: paused on the middle of the exact frame, and drawn only when something changed', () => {
    const { video, scene } = make();
    expect(scene.update(gl, 5, { 'scene.film': 0 }, { view })).toBe(true);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(0.5 / 24, 9);
    // The same time again (a held memory): nothing new, no draw, no seek.
    const seeks = video.seeks.length;
    expect(scene.update(gl, 5, { 'scene.film': 0 }, { view })).toBe(false);
    expect(video.seeks.length).toBe(seeks);
    // A seek elsewhere (scrubbing): straight to that frame, still paused.
    scene.update(gl, 5, { 'scene.film': 12.51 }, { view });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(300.5 / 24, 9);
  });

  it('framed by the frame on the screen: a seek across a close shot\'s edge reframes only once it has landed', () => {
    // (A decoder whose currentTime is the seek's target the moment it is asked for, while the
    // picture is still the last frame decoded, as browsers' are. With the target taken as the frame
    // sent, the room reframed the close-up as the wide before the cut landed: review of PR 43.)
    const v = {
      paused: true, seeking: false, readyState: 4, src: 'blob:film', playbackRate: 1, t: 0, target: 0, on: new Map<string, () => void>(),
      get currentTime() { return this.seeking ? this.target : this.t; },
      set currentTime(x: number) { this.target = x; this.seeking = true; },
      land() { this.seeking = false; this.t = this.target; this.on.get('seeked')?.(); },
      play() { this.paused = false; return Promise.resolve(); },
      pause() { this.paused = true; },
      addEventListener(k: string, f: () => void) { this.on.set(k, f); },
      removeEventListener(k: string) { this.on.delete(k); },
      removeAttribute() {}, load() {},
    };
    const scene = new FilmScene({ video: v as unknown as HTMLVideoElement, fps: 24, frames: 708 }, { width: 16, height: 16, reduced: false, close: [[132, 378]] });
    const at = (frame: number) => ({ 'scene.film': (frame + 0.5) / 24 });
    // Held on the close-up's last frame, landed.
    scene.update(gl, 0, at(377), { view });
    v.land();
    scene.update(gl, 0, at(377), { view });
    expect(scene.choose()).toBe(1);
    // The wide's first frame asked for: while its seek lands, the close-up is what is on the screen.
    scene.update(gl, 0, at(378), { view });
    expect(v.seeking).toBe(true);
    expect(scene.choose()).toBe(1);
    scene.update(gl, 0, at(378), { view });
    expect(scene.choose()).toBe(1);
    // Landed: sent, and framed as the wide.
    v.land();
    expect(scene.update(gl, 0, at(378), { view })).toBe(true);
    expect(scene.choose()).toBe(0);
  });

  it("a held position doesn't play, however the memory's clock runs on", () => {
    const { video, scene } = make();
    for (let i = 0; i < 30; i++) scene.update(gl, 20 + i / 60, { 'scene.film': 6 }, { view });
    expect(video.plays).toBe(0);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo((6 * 24 + 0.5) / 24, 9);
  });

  /**
   * The whole film on a decoder whose seeks take a fixed time plus a decode from the keyframe before
   * the target (one a second), queued as Chromium queues them, and whose play() takes a moment to
   * start, or is refused (no autoplay: the film is stepped). Returns the seeks asked while one was
   * landing, the share of the film with the picture two frames or more off the clock, and the most
   * it fell behind (frames).
   */
  const slowFilm = async (refuse: boolean) => {
    const fps = 24;
    let now = 0;
    const realNow = performance.now;
    performance.now = () => now;
    try {
      const v = {
        paused: true, seeking: false, readyState: 4, src: 'blob:film', playbackRate: 1, plays: 0, seeks: 0, under: 0,
        t: 0, target: 0, left: 0, start: 0, shown: 0, on: new Map<string, () => void>(),
        get currentTime() { return this.seeking ? this.target : this.t; },
        set currentTime(x: number) {
          this.seeks++;
          if (this.seeking) this.under++;
          this.target = x;
          this.seeking = true;
          this.left = 60 + Math.round((x - Math.floor(x)) * fps) * 8;
        },
        play() {
          this.plays++;
          if (refuse) return Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
          if (this.paused) { this.paused = false; this.start = 60; }
          return Promise.resolve();
        },
        pause() { this.paused = true; },
        addEventListener(k: string, f: () => void) { this.on.set(k, f); },
        removeEventListener(k: string) { this.on.delete(k); },
        removeAttribute() {}, load() {},
        tick(ms: number) {
          if (this.seeking) {
            this.left -= ms;
            if (this.left <= 0) { this.seeking = false; this.t = this.target; this.shown = this.t; this.on.get('seeked')?.(); }
            return;
          }
          if (this.paused) return;
          if (this.start > 0) { this.start -= ms; return; }
          this.t += (ms / 1000) * this.playbackRate;
          this.shown = this.t;
        },
      };
      const scene = new FilmScene({ video: v as unknown as HTMLVideoElement, fps, frames: Math.round(FILM_SECONDS * fps) }, { width: 16, height: 16, reduced: false });
      let off = 0, n = 0, behind = 0;
      let film = 0;
      scene.update(gl, FILM_AT, { 'scene.film': 0 }, { view });
      for (let ms = 0; ms < (FILM_SECONDS - 0.5) * 1000; ms += 1000 / 60) {
        now = ms;
        // (one long frame of 150 ms, as a busy page has)
        const step = Math.abs(ms - 15000) < 8 ? 1000 / 60 + 150 : 1000 / 60;
        v.tick(step);
        film += step / 1000;
        scene.update(gl, FILM_AT + film, { 'scene.film': film }, { view });
        await Promise.resolve();
        await Promise.resolve();
        n++;
        const lag = Math.floor(film * fps) - Math.floor(v.shown * fps + 1e-6);
        if (Math.abs(lag) >= 2) off++;
        behind = Math.max(behind, lag);
      }
      return { under: v.under, off: off / n, behind };
    } finally {
      performance.now = realNow;
    }
  };

  it('on a slow decoder: no seek while one is landing, and the picture within two frames of the clock', async () => {
    // (Corrected by a seek to the present frame, the film sought under each seek in flight and
    // trailed its sounds: QA, 2026-10-21.)
    const r = await slowFilm(false);
    expect(r.under, 'seeks asked while one was landing').toBe(0);
    expect(r.off, 'the share of the film the picture is two frames or more off the clock').toBeLessThan(0.05);
  });

  it('stepped on a slow decoder (play refused): no seek while one is landing, never half a second behind', async () => {
    // (Sought every frame, each seek replaced the one in flight and the picture fell up to 9 s
    // behind: QA, 2026-10-21. Stepped, each picture lands about a seek's time after the last.)
    const r = await slowFilm(true);
    expect(r.under, 'seeks asked while one was landing').toBe(0);
    expect(r.behind, 'the most frames the picture fell behind the clock').toBeLessThan(12);
  });

  it('a seek that lands later is drawn when it lands', () => {
    const { video, scene } = make();
    scene.update(gl, 5, { 'scene.film': 3 }, { view });
    expect(scene.update(gl, 5, { 'scene.film': 3 }, { view })).toBe(false);
    video.fire('seeked');
    expect(scene.update(gl, 5, { 'scene.film': 3 }, { view })).toBe(true);
  });

  it('playing: plays from the right frame, and is pulled back when it drifts', async () => {
    const { video, scene } = make();
    let t = 20;
    const film = (x: number) => ({ 'scene.film': x - FILM_AT });
    scene.update(gl, t, film(t), { view });
    t += 1 / 60;
    scene.update(gl, t, film(t), { view });
    await settle();
    expect(video.plays).toBe(1);
    expect(video.paused).toBe(false);
    // In step: no seeks while it plays along.
    const seeks = video.seeks.length;
    for (let i = 0; i < 120; i++) {
      t += 1 / 60;
      video.advance(1 / 60);
      scene.update(gl, t, film(t), { view });
    }
    expect(video.seeks.length).toBe(seeks);
    // A stall in the decoder (a fifth of a second behind): taken up by the rate, without a seek.
    video.stall(0.2);
    const quiet = video.seeks.length;
    for (let i = 0; i < 240; i++) {
      t += 1 / 60;
      video.advance(1 / 60);
      scene.update(gl, t, film(t), { view });
    }
    expect(video.seeks.length).toBe(quiet);
    expect(Math.abs(video.currentTime - (t - FILM_AT))).toBeLessThan(1 / 24);
    expect(video.playbackRate).toBe(1);
    // Most of a second behind: one seek, aimed ahead of the clock (it takes time to land).
    video.stall(0.8);
    t += 1 / 60;
    scene.update(gl, t, film(t), { view });
    expect(video.seeks.length).toBe(quiet + 1);
    expect(video.currentTime).toBeGreaterThan(t - FILM_AT);
    // Paused (a held memory): the video pauses too.
    scene.update(gl, t, film(t), { view });
    expect(video.paused).toBe(true);
  });

  it('a refused play steps the film frame by frame; an interrupted one does not', async () => {
    const a = make();
    a.video.refuse = 'AbortError';
    a.scene.update(gl, 20, { 'scene.film': 5 }, { view });
    a.scene.update(gl, 20 + 1 / 60, { 'scene.film': 5 + 1 / 60 }, { view });
    await settle();
    a.video.refuse = null;
    a.scene.update(gl, 20 + 2 / 60, { 'scene.film': 5 + 2 / 60 }, { view });
    await settle();
    expect(a.video.paused).toBe(false);
    const b = make();
    b.video.refuse = 'NotAllowedError';
    b.scene.update(gl, 20, { 'scene.film': 5 }, { view });
    b.scene.update(gl, 20 + 1 / 60, { 'scene.film': 5 + 1 / 60 }, { view });
    await settle();
    b.video.refuse = null;
    for (let i = 2; i < 10; i++) b.scene.update(gl, 20 + i / 60, { 'scene.film': 5 + i / 60 }, { view });
    await settle();
    expect(b.video.plays).toBe(1);
    expect(b.video.paused).toBe(true);
    // (stepped: the frame the clock is on, or one a seek's time ahead of it)
    const at = Math.floor(b.video.currentTime * 24 + 1e-6);
    expect(at).toBeGreaterThanOrEqual(Math.floor((5 + 9 / 60) * 24));
    expect(at).toBeLessThanOrEqual(Math.floor((5 + 9 / 60 + 0.1) * 24));
  });

  it('its last frame is held, not played past', () => {
    const { video, scene } = make();
    scene.update(gl, 50, { 'scene.film': FILM_SECONDS }, { view });
    scene.update(gl, 50 + 1 / 60, { 'scene.film': FILM_SECONDS }, { view });
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo((FILM_SECONDS * 24 - 0.5) / 24, 9);
  });

  describe('loading a film', () => {
    /** A video element as loadFilm uses it: its events fired by hand. */
    const element = (refuse = false) => {
      const on = new Map<string, () => void>();
      const v = {
        muted: false, defaultMuted: false, playsInline: false, preload: '', crossOrigin: '', src: '', error: null, attrs: new Map<string, string>(),
        paused: true, plays: 0, loads: 0,
        setAttribute(k: string, x: string) { this.attrs.set(k, x); },
        removeAttribute(k: string) { if (k === 'src') this.src = ''; },
        addEventListener(k: string, f: () => void) { on.set(k, f); },
        removeEventListener(k: string) { on.delete(k); },
        play() { this.plays++; return refuse ? Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })) : Promise.resolve(); },
        pause() { this.paused = true; },
        load() { this.loads++; },
        fire(k: string) { on.get(k)?.(); },
      };
      return v;
    };
    const opts = (v: ReturnType<typeof element>, ok: () => boolean) => ({ make: () => v as unknown as HTMLVideoElement, check: ok });

    it('resolves once its first frame can be drawn, not before', async () => {
      const v = element();
      let ready = false;
      let done = false;
      const p = loadFilm('blob:x', 5000, opts(v, () => ready)).then(() => (done = true));
      v.fire('loadedmetadata');
      v.fire('loadeddata');
      await settle();
      expect(done).toBe(false);
      ready = true;
      v.fire('canplay');
      await p;
      expect(done).toBe(true);
      expect(v.plays).toBe(1);
      expect(v.src).toBe('blob:x');
    });

    it('a refused nudge costs nothing', async () => {
      const v = element(true);
      const p = loadFilm('blob:x', 5000, opts(v, () => true));
      v.fire('loadedmetadata');
      await settle();
      v.fire('loadeddata');
      await expect(p).resolves.toBe(v);
    });

    it('nothing drawable in time, or an error: rejects, the video emptied', async () => {
      const a = element();
      await expect(loadFilm('blob:a', 10, opts(a, () => false))).rejects.toThrow(/could not be decoded/);
      expect(a.src).toBe('');
      const b = element();
      const p = loadFilm('blob:b', 5000, opts(b, () => true));
      b.fire('error');
      await expect(p).rejects.toThrow(/could not be decoded/);
      expect(b.src).toBe('');
    });
  });

  it('let go: the video stops and its blob URL is released', () => {
    const { video, scene } = make();
    scene.dispose();
    expect(video.paused).toBe(true);
    expect(video.src).toBe('');
    expect(scene.update(gl, 1, { 'scene.film': 1 }, { view })).toBe(false);
  });

  it('chooses VP9 where it plays, else H.264, else nothing; on WebKit, H.264 first', () => {
    const probe = (ok: string[], webkit = false) =>
      ({ canPlayType: (t: string) => (ok.some((o) => t.includes(o)) ? 'probably' : ''), ...(webkit ? { webkitSetPresentationMode: () => {} } : {}) }) as unknown as HTMLVideoElement;
    expect(filmType(probe(['vp9', 'avc1']))).toBe('webm');
    expect(filmType(probe(['avc1']))).toBe('mp4');
    expect(filmType(probe([]))).toBe(null);
    expect(filmType(probe(['vp9', 'avc1'], true))).toBe('mp4');
    expect(filmType(probe(['vp9'], true))).toBe('webm');
  });
});

describe('Almost on its timeline', () => {
  const seed = ALMOST.seed('film');
  it('the film holds its first frame until the visitor is inside, then runs at one second a second', () => {
    const keys = seed.tracks['scene.film'] as [number, number, string?][];
    expect(keys.find(([t]) => t === FILM_AT)?.[1]).toBe(0);
    expect(keys.find(([t]) => t === FILM_AT + FILM_SECONDS)?.[1]).toBe(FILM_SECONDS);
    // Inside by then: fully immersed from 9.8 s.
    const imm = seed.tracks['scene.immerse'] as [number, number][];
    const full = imm.find(([, v]) => v === 1)!;
    expect(full[0]).toBeLessThan(FILM_AT);
    // Out once the film is all but over, on its held last moments.
    expect(ALMOST_SECTIONS.exit).toBeGreaterThan(FILM_AT + FILM_SECONDS - 1.5);
    expect(ALMOST_SECTIONS.exit).toBeLessThanOrEqual(FILM_AT + FILM_SECONDS);
  });

  it('counts as seen once the startle has been seen inside, and plays to its exit', () => {
    const m = SCENE_MEMORIES.find((x) => x.id === 'almost')!;
    expect(m.phraseId).toBe('your-hand');
    expect(m.seenAt!).toBeGreaterThanOrEqual(FILM_AT + FILM_BEATS.startle);
    expect(m.seenAt!).toBeLessThan(ALMOST_SECTIONS.exit);
    expect(m.maxHold).toBe(ALMOST_SECTIONS.exit);
    expect(m.span).toBe(ALMOST_SECTIONS.end);
  });

  it('its sounds were laid offline on the timeline that plays', () => {
    // (scripts/almost/sound.py places the kitchen and the film's sounds, and the clock's ticks,
    // from these two moments: moved here without running it again, the ticks drift off the film.)
    const py = readFileSync(join(__dirname, '../scripts/almost/sound.py'), 'utf8');
    const at = (name: string) => Number(py.match(new RegExp(`^${name} = ([\\d.]+)`, 'm'))![1]);
    const marker = (label: string) => ALMOST.markers.find((m) => m.label === label)!.position;
    expect(at('KITCHEN_AT')).toBe(marker('music:kitchen'));
    expect(at('FILM_AT')).toBe(marker('music:film'));
    expect(marker('music:film')).toBe(FILM_AT);
  });

  it("its two sounds were made from the exposure sheet and the mix as they are now", () => {
    // (sound.py --publish records what it laid them on; change the sheet or the mix and they are
    // laid again, or the clock and the sleeves fall off the frames they belong to)
    const made = JSON.parse(readFileSync(join(__dirname, '../public/music/almost-sound.json'), 'utf8'));
    const sha = (f: string) => createHash('sha256').update(readFileSync(join(__dirname, '..', f))).digest('hex').slice(0, 16);
    expect(made.xsheet).toBe(sha('scripts/almost/xsheet.py'));
    expect(made.sound).toBe(sha('scripts/almost/sound.py'));
  });

  it("its screen-reader lines are in order and at least 3.5 s apart", () => {
    const lines = ALMOST.announce!('film');
    const ats = [...new Set(lines.map((l) => l.at))];
    for (let i = 1; i < ats.length; i++) expect(ats[i] - ats[i - 1], `${ats[i - 1]} → ${ats[i]}`).toBeGreaterThanOrEqual(3.5);
  });

  it("each of its screen-reader lines is said before the next begins", () => {
    // (Read at 180 words a minute, each queued behind the last, the eighth began 19 s late, after
    // the film had ended: QA, 2026-10-21. 2.5 words for each second until the next line, from the
    // description read as the memory begins; seen from inside or from the wall.)
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    for (const from of ['inside', 'wall'] as const) {
      const lines = [{ at: ALMOST_SECTIONS.active, text: ALMOST.describe('film') }, ...ALMOST.announce!('film').filter((l) => !(from === 'inside' ? l.wall : l.inside))];
      for (let i = 0; i + 1 < lines.length; i++) {
        expect(words(lines[i].text), `${from}: "${lines[i].text}"`).toBeLessThanOrEqual(Math.floor(2.5 * (lines[i + 1].at - lines[i].at)));
      }
    }
  });
});

describe('Things I Should Have Said on its timeline', () => {
  const seed = THINGS.seed('film');
  const manifest = JSON.parse(readFileSync(join(__dirname, '../public/memories/things/manifest.json'), 'utf8'));
  it('the wall draws the goodbye before the visitor is carried in; the film holds it until they are inside', () => {
    const keys = seed.tracks['scene.film'] as [number, number, string?][];
    expect(keys.find(([t]) => t === THINGS_AT)?.[1]).toBe(0);
    expect(keys.find(([t]) => t === THINGS_AT + THINGS_SECONDS)?.[1]).toBe(THINGS_SECONDS);
    expect(THINGS_SECONDS * manifest.living.film.fps).toBe(manifest.living.film.frames);
    // (the pencil and the tone are all there before the way in begins)
    const sketch = seed.tracks['window.sketch'] as [number, number][];
    const reveal = seed.tracks['window.reveal'] as [number, number][];
    const imm = seed.tracks['scene.immerse'] as [number, number][];
    const begins = imm.find(([, v], i) => v === 0 && imm[i + 1] && imm[i + 1][1] > 0)![0];
    expect(sketch[sketch.length - 1][0]).toBeLessThanOrEqual(begins);
    expect(reveal[reveal.length - 1][0]).toBeLessThanOrEqual(begins);
    expect(imm.find(([, v]) => v === 1)![0]).toBeLessThan(THINGS_AT);
    // out once the film is all but over, on its held empty doorway
    expect(THINGS_SECTIONS.exit).toBeGreaterThan(THINGS_AT + THINGS_SECONDS - 1.5);
    expect(THINGS_SECTIONS.exit).toBeLessThanOrEqual(THINGS_AT + THINGS_SECONDS);
    expect(THINGS_AT + THINGS_BEATS.empty).toBeLessThan(THINGS_SECTIONS.exit);
    // its edge is a sheet rubbed, not felt torn
    expect(manifest.living.film.edge).toBe('soft');
  });

  it('counts as seen once his almost has begun inside, and plays to its exit', () => {
    const m = SCENE_MEMORIES.find((x) => x.id === 'things')!;
    expect(m.phraseId).toBe('didnt-know-say');
    expect(m.seenAt!).toBeGreaterThanOrEqual(THINGS_AT + THINGS_BEATS.found);
    expect(m.seenAt!).toBeLessThan(THINGS_SECTIONS.exit);
    expect(m.maxHold).toBe(THINGS_SECTIONS.exit);
    expect(m.span).toBe(THINGS_SECTIONS.end);
    expect(THINGS.markers.find((k) => k.label === 'music:film')!.position).toBe(THINGS_AT);
  });

  it('its sound was made from the exposure sheet, the Foley and the soundscape as they are now, without music', () => {
    // (soundscape.py records what it made it from; change any and it is made again, or the
    // eraser is heard where nothing is erased)
    const made = JSON.parse(readFileSync(join(__dirname, '../public/music/things-sound.json'), 'utf8'));
    const sha = (f: string) => createHash('sha256').update(readFileSync(join(__dirname, '..', f))).digest('hex').slice(0, 16);
    expect(made.story).toBe(sha('scripts/things/story.py'));
    expect(made.foley).toBe(sha('scripts/things/foley.py'));
    expect(made.soundscape).toBe(sha('scripts/things/soundscape.py'));
    // (Mix B, the room's: the artist's choice, having heard both, 2026-10-22)
    expect(made.mix).toBe('b');
  });

  it("the wall's sound is the wall's drawing: its start, its length, its level, its caption before the film's (QA)", () => {
    const seed = THINGS.seed('film');
    const sketch = seed.tracks['window.sketch'] as [number, number][];
    const made = JSON.parse(readFileSync(join(__dirname, '../public/music/things-sound.json'), 'utf8'));
    const cues = THINGS.cues('film').cues;
    const at = (label: string) => THINGS.markers.find((k) => k.label === label)!.position;
    expect(at('music:wall')).toBe(sketch[0][0]);
    expect(made.seconds.wall).toBeCloseTo(sketch[sketch.length - 1][0] - sketch[0][0], 3);
    expect(made.seconds.film).toBeCloseTo(THINGS_SECONDS, 3);
    // (the same gain as the film's, through the same path: as a point in the wall it was 10 dB under)
    for (const k of ['gainDb', 'wide', 'dry'] as const) expect(cues['music:wall'][k], k).toEqual(cues['music:film'][k]);
    const film = cues['music:film'];
    const first = Math.min(film.captionAt ?? Infinity, ...(film.captions ?? []).map((c) => c.at));
    expect(at('music:film') + first - (at('music:wall') + cues['music:wall'].captionAt!)).toBeGreaterThanOrEqual(2.5);
  });

  it('names every sound a deaf visitor would miss, each caption on long enough to read before the next (QA, 2026-10-22)', () => {
    const cue = THINGS.cues('film').cues['music:film'];
    const all = [{ at: cue.captionAt ?? 0, text: cue.caption! }, ...(cue.captions ?? [])].sort((a, b) => a.at - b.at);
    // (0.4 s a word, at least 1.2 s: a few words in a hold need less than the 2.5 s the longer ones keep)
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    for (let i = 1; i < all.length; i++) {
      const p = all[i - 1];
      expect(all[i].at - p.at, `${p.text} → ${all[i].text}`).toBeGreaterThanOrEqual(Math.max(1.2, 0.4 * words(p.text)) - 1e-6);
    }
    for (const beat of [THINGS_BEATS.latch, THINGS_BEATS.lift, THINGS_BEATS.held, THINGS_BEATS.takenBack, THINGS_BEATS.hersHeld, THINGS_BEATS.hersTaken, THINGS_BEATS.erased])
      expect(Math.min(...all.map((c) => Math.abs(c.at - beat))), `a caption at ${beat}`).toBeLessThanOrEqual(0.5);
  });

  it("its story's moments are where the exposure sheet put them (to a frame)", () => {
    // (Hand-copied, they drifted: the casings were 2.4 s later than the announcements said: QA.)
    const made = JSON.parse(readFileSync(join(__dirname, '../public/music/things-sound.json'), 'utf8'));
    expect(Object.keys(made.beats).sort()).toEqual(Object.keys(THINGS_BEATS).sort());
    for (const [k, at] of Object.entries(THINGS_BEATS)) expect(Math.abs(at - made.beats[k]), k).toBeLessThanOrEqual(1 / 24);
  });

  it("its screen-reader lines are in order, at least 3.5 s apart, and each said before the next", () => {
    const lines = THINGS.announce!('film');
    const ats = [...new Set(lines.map((l) => l.at))];
    for (let i = 1; i < ats.length; i++) expect(ats[i] - ats[i - 1], `${ats[i - 1]} → ${ats[i]}`).toBeGreaterThanOrEqual(3.5);
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    for (const from of ['inside', 'wall'] as const) {
      const said = [{ at: THINGS_SECTIONS.active, text: THINGS.describe('film') }, ...lines.filter((l) => !(from === 'inside' ? l.wall : l.inside))];
      for (let i = 0; i + 1 < said.length; i++) {
        expect(words(said[i].text), `${from}: "${said[i].text}"`).toBeLessThanOrEqual(Math.floor(2.5 * (said[i + 1].at - said[i].at)));
      }
    }
  });
});
