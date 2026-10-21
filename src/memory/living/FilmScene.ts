import * as THREE from 'three';
import { filmMaterial, livingCamera, livingTarget } from '../../world/living/materials';
import type { Values } from '../types';

/**
 * A film as a living memory: "Almost" (docs/almost.md), a felt stop-motion film photographed offline
 * (scripts/almost/). It is drawn into the memory's render target as the woodland's living painting
 * is, so the wall's way in, being taken in and the way out are the same.
 *
 * One clock. The film shows the frame for `scene.film`, a timeline key in seconds into the film. A
 * muted inline <video> is only its decoder:
 * - While the memory plays, the video plays too, kept with the timeline by its rate (a little drift)
 *   or a seek aimed ahead (a large one), never while a seek is still landing.
 * - Held, seeked or recorded, the video is paused on the exact frame.
 *
 * Its sound is not the video's: the soundtrack is the memory's own cue, on the memory's audio.
 *
 * The whole film is its "painting": the open-matte frame (taller than the screen's 16:9). Covering
 * a wide screen shows the band across its middle; covering an upright phone shows the crop round
 * the two figures. Both are the film as photographed (the spec's `cover` focus points).
 */

export interface FilmArt {
  video: HTMLVideoElement;
  fps: number;
  frames: number;
}

/**
 * Whether this browser plays a film type ('webm' VP9 or 'mp4' H.264), best first. WebKit (Safari,
 * and every browser on an iPhone) gets H.264 first: what it decodes in hardware on every device.
 */
export function filmType(probe: HTMLVideoElement = document.createElement('video')): 'webm' | 'mp4' | null {
  const vp9 = !!probe.canPlayType('video/webm; codecs="vp9"');
  const h264 = !!(probe.canPlayType('video/mp4; codecs="avc1.640028"') || probe.canPlayType('video/mp4; codecs="avc1.42E01E"'));
  if (h264 && 'webkitSetPresentationMode' in probe) return 'mp4';
  if (vp9) return 'webm';
  return h264 ? 'mp4' : null;
}

/**
 * Whether a video's current frame can be drawn: drawn into a 2x2 canvas and read back. (Cut short,
 * a film loaded and then would not upload, a "cross-origin data" error on every frame, and the
 * visitor was carried into black: QA, 2026-10-21.)
 */
export function drawable(v: HTMLVideoElement): boolean {
  if (!(v.videoWidth > 0) || v.readyState < 2) return false;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return true;
    g.drawImage(v, 0, 0, 2, 2);
    g.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

/** A film's video let go: stopped, emptied, its blob URL released. */
export function releaseFilm(v: HTMLVideoElement): void {
  v.pause();
  const src = v.src;
  v.removeAttribute('src');
  v.load();
  if (src.startsWith('blob:')) URL.revokeObjectURL(src);
}

/**
 * A video element for a film's blob URL, muted and inline, with its first frame decoded and
 * drawable. (Safari on an iPhone may decode nothing of a video that has not played: it is played
 * and paused once its metadata is in, a refusal costing nothing, as it is then stepped. Nothing in
 * 5 s, and the memory is the wall's still instead: the video emptied and its URL released.)
 */
export async function loadFilm(
  url: string,
  timeout = 5000,
  o: { make?: () => HTMLVideoElement; check?: (v: HTMLVideoElement) => boolean } = {},
): Promise<HTMLVideoElement> {
  const v = (o.make ?? (() => document.createElement('video')))();
  const check = o.check ?? drawable;
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        if (check(v)) (cleanup(), resolve());
      };
      const fail = () => (cleanup(), reject(new Error(`film could not be decoded: ${v.error?.message ?? 'no frame'}`)));
      const nudge = () => {
        const p = v.play();
        if (p) p.then(() => v.pause(), () => {});
      };
      const timer = setTimeout(fail, timeout);
      const cleanup = () => {
        clearTimeout(timer);
        v.removeEventListener('loadedmetadata', nudge);
        v.removeEventListener('loadeddata', done);
        v.removeEventListener('canplay', done);
        v.removeEventListener('error', fail);
      };
      v.addEventListener('loadedmetadata', nudge);
      v.addEventListener('loadeddata', done);
      v.addEventListener('canplay', done);
      v.addEventListener('error', fail);
      v.load();
    });
  } catch (e) {
    // (Kept, a failed film held its blob, the whole film, for every attempt: QA, 2026-10-21.)
    releaseFilm(v);
    throw e;
  }
  return v;
}

export class FilmScene {
  readonly target: THREE.WebGLRenderTarget;
  reduced: boolean;
  private readonly scene = new THREE.Scene();
  private readonly camera = livingCamera();
  private readonly texture: THREE.VideoTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.PlaneGeometry;
  private readonly lastView = new THREE.Vector4(-1, -1, -1, -1);
  private lastFilm = -1;
  private disposed = false;
  /** The video refused to play (no autoplay): the film is stepped frame by frame instead. */
  private stepOnly = false;
  /** A play() not yet begun (no seeking under it). */
  private starting = false;
  /** The frame last sent to the texture, and whether a seek has landed since. */
  private uploaded = -1;
  private landed = false;
  /** What the last correcting seek took to land (s), and when it was asked for (performance.now()). */
  private seekCost = 0.1;
  private seekAsked = -1;
  private readonly onSeeked = () => {
    this.landed = true;
    if (this.seekAsked >= 0) {
      this.seekCost = Math.min(0.6, (performance.now() - this.seekAsked) / 1000);
      this.seekAsked = -1;
    }
  };
  readonly view = new THREE.Vector4(0, 0, 1, 1);

  constructor(readonly art: FilmArt, o: { width: number; height: number; reduced: boolean }) {
    this.target = livingTarget(o.width, o.height);
    this.reduced = o.reduced;
    this.texture = new THREE.VideoTexture(art.video);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.material = filmMaterial(this.texture);
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.quad.translate(0.5, 0.5, 0);
    this.scene.add(new THREE.Mesh(this.quad, this.material));
    art.video.addEventListener('seeked', this.onSeeked);
  }

  /** The film's length (s). */
  get duration(): number {
    return this.art.frames / this.art.fps;
  }

  /** The frame `scene.film` asks for (clamped to the film). */
  frameAt(v: Values): number {
    const s = v['scene.film'] ?? 0;
    return Math.max(0, Math.min(this.art.frames - 1, Math.floor(s * this.art.fps + 1e-6)));
  }

  /** A film has one shot. */
  choose(): number {
    return 0;
  }

  /**
   * One frame: keep the video on the timeline's frame, then draw the part of the film on the
   * screen (`view`, film uv) when it shows something new. Returns whether it drew.
   */
  update(renderer: THREE.WebGLRenderer, _t: number, v: Values, o: { view: THREE.Vector4; parallax?: THREE.Vector2; aspect?: number }): boolean {
    if (this.disposed) return false;
    const video = this.art.video;
    const fps = this.art.fps;
    const frame = this.frameAt(v);
    const want = (frame + 0.5) / fps;
    const film = v['scene.film'] ?? 0;
    // Playing: the film's own time advancing as a clock does, inside the film. (Not the memory's
    // clock: its position can be held while its clock runs on, and the video would then play and
    // be pulled back every frame and a half.)
    const advancing = film > this.lastFilm + 1e-6 && film - this.lastFilm < 0.5 && film > 0 && film < this.duration - 1 / fps;
    this.lastFilm = film;
    if (advancing && !this.stepOnly) {
      if (video.paused) {
        if (!this.starting) {
          if (Math.abs(video.currentTime - want) > 0.5 / fps) video.currentTime = want;
          video.playbackRate = 1;
          this.starting = true;
          video.play().then(
            () => {
              this.starting = false;
            },
            (e: unknown) => {
              this.starting = false;
              // (Refused, it is stepped from now on; interrupted by a pause, it is only not playing.)
              if ((e as { name?: string })?.name === 'NotAllowedError') this.stepOnly = true;
            },
          );
        }
      } else if (!video.seeking) {
        // Kept with the clock: a drift over half a frame taken up by the rate, a few percent either way; a
        // large one by a seek aimed ahead by what the last one took, so it lands where the clock
        // will be. Never while a seek is still landing. (Corrected by a seek to the present frame
        // whenever it drifted a frame and a half, it sought again under each seek in flight, each
        // from the last one's target, and the picture trailed its sounds by 34-85 ms: QA, 2026-10-21.)
        const d = video.currentTime - film;
        if (Math.abs(d) > 0.25) {
          video.playbackRate = 1;
          video.currentTime = Math.min(this.duration - 0.5 / fps, film + this.seekCost + 0.5 / fps);
          this.seekAsked = performance.now();
        } else {
          video.playbackRate = Math.abs(d) > 0.5 / fps ? 1 - Math.max(-0.1, Math.min(0.1, d * 2)) : 1;
        }
      }
    } else {
      if (!video.paused) video.pause();
      // Stepped (held, scrubbed, or refused play): to the frame, never while a seek is still landing;
      // advancing, aimed ahead by what the last seek took, so the picture lands where the clock will
      // be. (Sought every frame, each seek replaced the one in flight: 72 of 679 landed and the
      // picture fell 9 s behind, her eyes going down never seen moving: QA, 2026-10-21.)
      if (!video.seeking) {
        if (!advancing) {
          if (Math.abs(video.currentTime - want) > 0.25 / fps) video.currentTime = want;
        } else if (Math.floor(video.currentTime * fps + 1e-6) < frame) {
          const aim = Math.min(this.art.frames - 1, Math.floor((film + this.seekCost) * fps + 1e-6));
          video.currentTime = (aim + 0.5) / fps;
          this.seekAsked = performance.now();
        }
      }
    }
    // A new picture: the frame shown changed, or a seek landed. (Three's own frame callback may
    // never come for a video that isn't in the page.)
    const shown = Math.floor(video.currentTime * fps + 1e-6);
    let fresh = false;
    if (shown !== this.uploaded || this.landed) {
      this.texture.needsUpdate = true;
      this.uploaded = shown;
      this.landed = false;
      fresh = true;
    }
    this.view.copy(o.view);
    if (!this.lastView.equals(o.view)) {
      const c = this.camera;
      c.left = o.view.x;
      c.right = o.view.x + o.view.z;
      c.bottom = o.view.y;
      c.top = o.view.y + o.view.w;
      c.updateProjectionMatrix();
      this.lastView.copy(o.view);
      fresh = true;
    }
    if (!fresh) return false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const video = this.art.video;
    video.removeEventListener('seeked', this.onSeeked);
    releaseFilm(video);
    this.texture.dispose();
    this.material.dispose();
    this.quad.dispose();
    this.target.dispose();
  }
}
