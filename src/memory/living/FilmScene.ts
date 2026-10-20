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
 * - While the memory plays, the video plays too, and is pulled back to the timeline whenever the two
 *   drift more than a frame and a half apart.
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

/** Whether this browser plays a film type ('webm' VP9 or 'mp4' H.264), best first. */
export function filmType(probe: HTMLVideoElement = document.createElement('video')): 'webm' | 'mp4' | null {
  if (probe.canPlayType('video/webm; codecs="vp9"')) return 'webm';
  if (probe.canPlayType('video/mp4; codecs="avc1.640028"') || probe.canPlayType('video/mp4; codecs="avc1.42E01E"')) return 'mp4';
  return null;
}

/** A video element for a film's blob URL, muted and inline, with its first frame decoded. */
export async function loadFilm(url: string, timeout = 20000): Promise<HTMLVideoElement> {
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = url;
  await new Promise<void>((resolve, reject) => {
    const done = () => (cleanup(), resolve());
    const fail = () => (cleanup(), reject(new Error(`film could not be decoded: ${v.error?.message ?? 'no frame'}`)));
    const timer = setTimeout(fail, timeout);
    const cleanup = () => {
      clearTimeout(timer);
      v.removeEventListener('loadeddata', done);
      v.removeEventListener('error', fail);
    };
    v.addEventListener('loadeddata', done);
    v.addEventListener('error', fail);
    v.load();
  });
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
  private lastT = -1;
  private disposed = false;
  /** The video refused to play (no autoplay): the film is stepped frame by frame instead. */
  private stepOnly = false;
  /** A play() not yet begun (no seeking under it). */
  private starting = false;
  /** The frame last sent to the texture, and whether a seek has landed since. */
  private uploaded = -1;
  private landed = false;
  private readonly onSeeked = () => {
    this.landed = true;
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
  update(renderer: THREE.WebGLRenderer, t: number, v: Values, o: { view: THREE.Vector4; parallax?: THREE.Vector2; aspect?: number }): boolean {
    if (this.disposed) return false;
    const video = this.art.video;
    const fps = this.art.fps;
    const frame = this.frameAt(v);
    const want = (frame + 0.5) / fps;
    const film = v['scene.film'] ?? 0;
    // Playing: the memory's time advancing as a clock does, inside the film.
    const advancing = t > this.lastT + 1e-6 && t - this.lastT < 0.5 && film > 0 && film < this.duration - 1 / fps;
    this.lastT = t;
    if (advancing && !this.stepOnly) {
      if (video.paused) {
        if (!this.starting) {
          if (Math.abs(video.currentTime - want) > 0.5 / fps) video.currentTime = want;
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
      } else if (Math.abs(video.currentTime - film) > 1.5 / fps) {
        video.currentTime = want;
      }
    } else {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - want) > 0.25 / fps) video.currentTime = want;
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
    video.pause();
    const src = video.src;
    video.removeAttribute('src');
    video.load();
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    this.texture.dispose();
    this.material.dispose();
    this.quad.dispose();
    this.target.dispose();
  }
}
