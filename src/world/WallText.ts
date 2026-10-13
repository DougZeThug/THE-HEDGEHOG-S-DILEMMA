import * as THREE from 'three';
import type { Phrase, Surface, Hand, Size } from '../content/types';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import type { Room } from './Room';
import { layoutPhrases, layoutOf, surfaceSize, type Placement, type SurfaceLayout } from './layout';
import { HANDS, measureText, textTexture, pencilLineTexture } from './textures';
import { wordRanges } from './handwriting';
import { approach, clamp, smoothstep } from '../core/math';
import { hashString } from '../core/rng';
import type { Environment } from '../state/Director';

/**
 * Writing on the walls. Every piece of writing is a textured plane lying on its surface, lit
 * by the same light as the plaster. New writing is *written*: a hand puts it down stroke by
 * stroke (the texture carries when each pixel is reached; see textures.ts and strokes.ts),
 * either at its own pace or following a voice. Rubbing out is a dissolve: writing leaves in
 * patches, the way pencil does under an eraser.
 */

const VERT_HEAD = /* glsl */ `
uniform float uReveal;
uniform float uOpacity;
uniform float uEmphasis;
uniform float uSeed;
uniform float uAspect;
`;

/**
 * The hand keeps real time (the same clock the audio plays on), not the scene's clock, which
 * slows when frames are dropped: writing that follows a voice must not drift from it.
 */
export const wallClock = () => performance.now() / 1000;

const FRAG_NOISE = /* glsl */ `
uniform float uWrite;
uniform float uFresh;
uniform float uReveal;
uniform float uOpacity;
uniform float uEmphasis;
uniform float uSeed;
uniform float uAspect;
float hhHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hhNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hhHash(i), hhHash(i+vec2(1,0)), u.x), mix(hhHash(i+vec2(0,1)), hhHash(i+vec2(1,1)), u.x), u.y);
}
float hhFbm(vec2 p){ return 0.6*hhNoise(p) + 0.3*hhNoise(p*2.3) + 0.1*hhNoise(p*5.1); }
`;

function makeTextMaterial(tex: THREE.Texture, hand: Hand, aspect: number, seed: number, duration: number) {
  const st = HANDS[hand];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(st.ink),
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: hand === 'marker' || hand === 'pen' ? 0.7 : 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const uniforms = {
    /** How far the hand has got, as a fraction of the whole piece (≥1: all written). */
    uWrite: { value: 2 },
    /** How long just-written ink stays heavier, in the same units. */
    uFresh: { value: 0.5 / Math.max(0.5, duration) },
    uReveal: { value: 0 },
    uOpacity: { value: st.opacity },
    uEmphasis: { value: 0 },
    uSeed: { value: (seed % 1000) / 37 },
    uAspect: { value: aspect },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader;
    shader.fragmentShader = FRAG_NOISE + shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `
      {
        // Alpha is the ink; red is when the hand reaches it.
        vec4 hhTx = texture2D(map, vMapUv);
        if (hhTx.a < 0.004) discard;
        float hhLeft = uWrite - hhTx.r;
        float hhInk = smoothstep(-0.004, 0.006, hhLeft);
        if (hhInk <= 0.0) discard;
        // Just-written ink sits a little heavier for a moment, like a pen pressed down.
        float hhFreshInk = 1.0 - smoothstep(0.0, uFresh, hhLeft);
        diffuseColor.a *= hhTx.a * hhInk;
        diffuseColor.rgb *= 1.0 - 0.25 * hhFreshInk;
      }
      // Rubbing out: patches, uneven, like an eraser on plaster (only while it happens).
      if (uReveal < 0.999) {
        float n = hhFbm(vMapUv * vec2(uAspect * 5.0, 5.0) + uSeed);
        float edge = uReveal * 1.25 - 0.12;
        diffuseColor.a *= 1.0 - smoothstep(edge - 0.1, edge + 0.02, n);
      }
      diffuseColor.a *= uOpacity;
      diffuseColor.rgb *= 1.0 - 0.45 * uEmphasis;`,
    );
  };
  mat.customProgramCacheKey = () => 'hh-text2';
  return { mat, uniforms };
}

type Purpose = 'phrase' | 'annotation' | 'recall' | 'recontext' | 'contribution';

/**
 * How the hand is moving: on its own from `start` (wall-clock seconds), or following a voice
 * through `segments` ([wall from, wall to, hand from, hand to], in order). It never goes
 * below `floor` (what is already written stays) or past `cap` (a sentence nobody finished).
 */
export interface WritePlan {
  start: number;
  segments?: [number, number, number, number][];
  floor: number;
  cap: number;
}

export interface TextItem {
  key: string;
  phrase?: Phrase;
  /** For writing that repeats a phrase elsewhere: the phrase it repeats. */
  source?: string;
  purpose: Purpose;
  hand: Hand;
  size: Size;
  placement: Placement;
  mesh: THREE.Mesh;
  uniforms: ReturnType<typeof makeTextMaterial>['uniforms'];
  vis: number;
  target: number;
  rate: number;
  shy: number;
  emphasis: number;
  expires: number;
  centre: THREE.Vector3;
  normal: THREE.Vector3;
  /** The hand's own time for each word, and for the whole piece (seconds). */
  words: [number, number][];
  duration: number;
  /** The hand at work, or null once the writing simply exists. */
  plan: WritePlan | null;
}

/** Where the hand is (its own seconds) at wall-clock time `now`. */
export function handAt(plan: WritePlan, now: number): number {
  let h: number;
  if (!plan.segments) h = now - plan.start;
  else {
    h = plan.floor;
    for (const [a, b, h0, h1] of plan.segments) {
      if (now < a) break;
      h = now >= b ? h1 : h0 + ((now - a) / Math.max(1e-3, b - a)) * (h1 - h0);
    }
  }
  return Math.min(plan.cap, Math.max(plan.floor, h));
}

/**
 * A hand following a voice. `speech` is the recording's timing for each character of this
 * exact text (seconds from the start of the file), `audioStart` when the file starts playing
 * (wall clock). Each word starts as it is heard; a hand can't write as fast as people speak,
 * so a long word may run on a little, and the next one waits — pauses in the speech stay
 * pauses in the writing.
 */
export function speechPlan(text: string, words: [number, number][], speech: [number, number][], audioStart: number, speedUp = 1.3): [number, number, number, number][] {
  const ranges = wordRanges(text);
  const out: [number, number, number, number][] = [];
  let free = -Infinity;
  ranges.forEach(([i0, i1], k) => {
    const hw = words[k];
    if (!hw) return;
    const s = audioStart + (speech[i0]?.[0] ?? 0);
    const e = audioStart + (speech[i1 - 1]?.[1] ?? 0);
    const start = Math.max(s, free);
    const end = start + Math.max(e - s, (hw[1] - hw[0]) / speedUp);
    out.push([start, end, hw[0], hw[1]]);
    free = end + 0.04;
  });
  return out;
}

interface LineItem {
  key: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  vis: number;
  target: number;
  expires: number;
  surface: Surface;
  from: Placement;
  to?: Placement;
  strikeOf?: Placement;
}

export class WallText {
  readonly items = new Map<string, TextItem>();
  private lines = new Map<string, LineItem>();
  private layout: SurfaceLayout;
  private placements: Map<string, Placement>;
  private lastScale = 1;
  private lineTex: THREE.CanvasTexture[];
  private geo = new THREE.PlaneGeometry(1, 1);
  reducedMotion = false;

  constructor(private room: Room, seed: number) {
    this.placements = layoutPhrases(PHRASES, (p) => measureText(p.text, p.hand, p.size), seed);
    this.layout = layoutOf(this.placements);
    this.lineTex = [pencilLineTexture(1), pencilLineTexture(2), pencilLineTexture(3)];
    // Writing is made when it is first needed: the room begins nearly empty, and baking every
    // phrase up front would cost a phone seconds and tens of megabytes.
  }

  /** The item for a phrase, made the first time it is asked for. */
  private ensure(id: string): TextItem | undefined {
    const have = this.items.get(id);
    if (have) return have;
    const p = PHRASE_BY_ID.get(id);
    const pl = this.placements.get(id);
    if (!p || !pl) return undefined;
    return this.create(p.id, p.text, p.hand, p.size, pl, 'phrase', p);
  }

  /** Make the writing for these phrases now (e.g. while the screen is dark), so writing them later costs nothing. */
  prepare(ids: string[]) {
    for (const id of ids) this.ensure(id);
  }

  private create(key: string, text: string, hand: Hand, size: Size, pl: Placement, purpose: Purpose, phrase?: Phrase): TextItem {
    const { tex, w, h, words, duration } = textTexture(text, hand, size, key);
    const { mat, uniforms } = makeTextMaterial(tex, hand, w / h, hashString(key), duration);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.set(w, h, 1);
    mesh.userData.text = text;
    mesh.renderOrder = 2;
    mesh.visible = false;
    mesh.receiveShadow = true;
    this.room.frames[pl.surface].writing.add(mesh);
    const item: TextItem = {
      key, phrase, purpose, hand, size, placement: pl, mesh, uniforms,
      vis: 0, target: 0, rate: 0.1, shy: 1, emphasis: 0, expires: 0,
      centre: new THREE.Vector3(), normal: new THREE.Vector3(),
      words, duration, plan: null,
    };
    this.position(item);
    this.items.set(key, item);
    return item;
  }

  private position(it: TextItem) {
    const pl = it.placement;
    const l = this.room.local(pl.surface, pl.u, pl.v);
    it.mesh.position.set(l.x, l.y, 0.002 + (hashString(it.key) % 7) * 0.0002);
    it.mesh.rotation.z = pl.rot;
    this.room.world(pl.surface, pl.u, pl.v, it.centre);
    this.room.normal(pl.surface, it.normal);
  }

  /** Show without animation (already there). */
  setShown(id: string) {
    const it = this.ensure(id);
    if (!it) return;
    it.vis = it.target = 1;
    it.plan = null;
    it.mesh.visible = true;
  }

  /** Writing that isn't there yet is written by hand; writing already half there comes back in patches. */
  reveal(id: string, seconds: number) {
    const it = this.ensure(id);
    if (!it) return;
    if (it.vis <= 0.02) {
      this.writeOn(id);
      return;
    }
    it.target = 1;
    it.rate = 1 / Math.max(0.5, seconds);
    it.mesh.visible = true;
  }

  /** Write a line again: it is gone at once and the hand writes it anew. */
  redraw(id: string, seconds: number) {
    void seconds;
    this.writeOn(id);
  }

  /**
   * A hand writes this. On its own (starting after `delay` seconds), or — with `speech` (the
   * recording's character timing for this exact text) and `audioStart` (wall-clock time the
   * recording starts) — following the voice. `upto` stops after that many words: a sentence
   * nobody finished. Returns the wall-clock time the hand will be done.
   */
  writeOn(id: string, o: { delay?: number; speech?: [number, number][]; audioStart?: number; upto?: number; instant?: boolean } = {}): number {
    const it = this.ensure(id);
    if (!it) return 0;
    const text = (it.mesh.userData.text as string) ?? '';
    const now = wallClock();
    const cap = o.upto !== undefined && o.upto < it.words.length ? it.words[Math.max(0, o.upto - 1)][1] : it.duration;
    // Reduced motion: no stroke-by-stroke animation; the writing is simply there, word by word, quickly.
    const plan: WritePlan = { start: now + (o.delay ?? 0), floor: 0, cap };
    if (o.speech && o.speech.length === text.length && o.audioStart !== undefined) plan.segments = speechPlan(text, it.words, o.speech, o.audioStart);
    else if (this.reducedMotion) plan.segments = it.words.map(([a, b], k) => [plan.start + k * 0.15, plan.start + k * 0.15 + 0.01, a, b] as [number, number, number, number]);
    // Already written (a skipped opening): as far as it goes, at once.
    if (o.instant) plan.floor = cap;
    it.plan = plan;
    it.vis = it.target = 1;
    it.mesh.visible = true;
    return plan.segments ? plan.segments[plan.segments.length - 1][1] : plan.start + cap;
  }

  /** Let the hand go on with a sentence it stopped, after `pause` seconds. */
  finish(id: string, pause = 0.4) {
    const it = this.items.get(id);
    if (!it?.plan || it.plan.cap >= it.duration) return;
    const done = it.plan.cap;
    it.plan = { start: wallClock() + pause - done, floor: done, cap: it.duration };
  }

  /** Index (in the text) of the first character the hand hasn't reached, for an unfinished line. */
  nextWordStart(id: string): number | null {
    const it = this.items.get(id);
    if (!it?.plan || it.plan.cap >= it.duration) return null;
    const k = it.words.findIndex(([, end]) => end > it.plan!.cap + 1e-3);
    if (k < 0) return null;
    return wordRanges((it.mesh.userData.text as string) ?? '')[k]?.[0] ?? null;
  }

  /** Is the hand still writing this? Has it stopped part-way? */
  writing(id: string): boolean {
    const it = this.items.get(id);
    return !!it?.plan && handAt(it.plan, wallClock()) < it.plan.cap;
  }

  unfinished(id: string): boolean {
    const it = this.items.get(id);
    return !!it?.plan && it.plan.cap < it.duration;
  }

  /** How many characters a hand has written so far (for tests and the inspector). */
  writtenFraction(id: string): number {
    const it = this.items.get(id);
    if (!it || it.vis <= 0) return 0;
    if (!it.plan) return 1;
    return Math.min(1, handAt(it.plan, wallClock()) / Math.max(1e-3, it.duration));
  }

  hide(id: string, seconds: number) {
    const it = this.items.get(id);
    if (!it) return;
    it.target = 0;
    it.rate = 1 / Math.max(0.5, seconds);
  }

  placementOf(id: string): Placement | undefined {
    return this.items.get(id)?.placement ?? this.placements.get(id);
  }

  /** Where a phrase is (or would be) written, in world space, without making it. */
  whereIs(id: string): { surface: Surface; centre: THREE.Vector3 } | undefined {
    const pl = this.placementOf(id);
    if (!pl) return undefined;
    return { surface: pl.surface, centre: this.room.world(pl.surface, pl.u, pl.v, new THREE.Vector3()) };
  }

  /** Write new text beside a phrase or somewhere on a surface. Returns false if there was no room. */
  write(o: { key: string; text: string; hand: Hand; size: Size; beside?: string; surface?: Surface; near?: { u: number; v: number }; purpose: Exclude<Purpose, 'phrase'>; ttl: number; now: number; source?: string; start?: boolean }): boolean {
    if (this.items.has(o.key)) return false;
    const m = measureText(o.text, o.hand, o.size);
    let rect = null as null | { u: number; v: number; w: number; h: number };
    let surface: Surface | undefined = o.surface;
    const target = o.beside ? this.placementOf(o.beside) : undefined;
    if (target) {
      surface = target.surface;
      rect = this.layout.findBeside(target, m.w, m.h);
    }
    if (!rect && surface && o.near) {
      const size = surfaceSize(surface);
      for (const spread of [0.5, 1, 1.8]) {
        rect = this.layout.findIn(surface, m.w, m.h, [(o.near.u - spread - m.w / 2) / size.w, (o.near.u + spread + m.w / 2) / size.w], [Math.max(0.3, o.near.v - spread * 0.5 - m.h / 2), Math.min(size.h - 0.15, o.near.v + spread * 0.5 + m.h / 2)], 0.03, 120, o.purpose === 'contribution');
        if (rect) break;
      }
    }
    if (!rect && target) rect = this.layout.scan(target.surface, m.w, m.h, 0.02);
    if (!rect && surface) {
      const size = surfaceSize(surface);
      if (o.purpose === 'contribution' && surface === 'south')
        rect = this.layout.findIn(surface, m.w, m.h, [0.3, 0.7], [1.0, 1.95], 0.05, 120, true) ?? this.layout.findIn(surface, m.w, m.h, [0.08, 0.92], [0.6, 2.4], 0.03, 120, true);
      else rect = this.layout.findIn(surface, m.w, m.h, [0.05, 0.95], [0.9, Math.min(2.3, size.h - 0.2)], 0.03, 120);
    }
    if (!rect && surface) rect = this.layout.scan(surface, m.w, m.h, 0.02, o.purpose === 'contribution');
    // A visitor's words are always written: try the other walls, then the band kept for them.
    let size = o.size;
    if (!rect && o.purpose === 'contribution') {
      for (const s of ['south', 'north', 'east', 'west'] as Surface[]) {
        if (s === surface) continue;
        rect = this.layout.scan(s, m.w, m.h, 0.02, true);
        if (rect) {
          surface = s;
          break;
        }
      }
      if (!rect && size !== 'xs') {
        size = 'xs';
        const mx = measureText(o.text, o.hand, 'xs');
        surface = 'south';
        rect = this.layout.scan('south', mx.w, mx.h, 0, true);
      }
    }
    if (!rect || !surface) return false;
    const pl = this.layout.add({ surface, ...rect, rot: (((hashString(o.key) % 100) / 100) - 0.5) * 0.06 });
    const it = this.create(o.key, o.text, o.hand, size, pl, o.purpose);
    it.source = o.source;
    it.expires = o.ttl > 0 ? o.now + o.ttl : 0;
    // start: false — made, but written later (by a voice).
    if (o.start !== false) this.writeOn(o.key);
    return true;
  }

  private makeLine(key: string, surface: Surface, seed: number): LineItem {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4a4b50'),
      map: this.lineTex[seed % this.lineTex.length],
      transparent: true,
      depthWrite: false,
      opacity: 0,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.renderOrder = 3;
    this.room.frames[surface].writing.add(mesh);
    return { key, mesh, mat, vis: 0, target: 0.55, expires: 0, surface, from: null as unknown as Placement };
  }

  /** A faint pencil line joining two phrases on the same surface. */
  link(a: string, b: string, ttl: number, now: number): boolean {
    const pa = this.items.get(a)?.placement, pb = this.items.get(b)?.placement;
    if (!pa || !pb || pa.surface !== pb.surface) return false;
    const key = `link:${a}:${b}`;
    if (this.lines.has(key)) return false;
    const ln = this.makeLine(key, pa.surface, hashString(key));
    ln.from = pa;
    ln.to = pb;
    ln.expires = now + ttl;
    ln.target = 0.5;
    this.lines.set(key, ln);
    this.positionLine(ln);
    return true;
  }

  strike(id: string, now: number, ttl = 0) {
    const pl = this.items.get(id)?.placement;
    if (!pl) return;
    const key = `strike:${id}`;
    if (this.lines.has(key)) return;
    const ln = this.makeLine(key, pl.surface, hashString(key));
    ln.from = pl;
    ln.strikeOf = pl;
    ln.target = 0.6;
    ln.expires = ttl ? now + ttl : 0;
    this.lines.set(key, ln);
    this.positionLine(ln);
  }

  private positionLine(ln: LineItem) {
    if (ln.strikeOf) {
      const p = ln.strikeOf;
      const l = this.room.local(p.surface, p.u, p.v);
      ln.mesh.position.set(l.x, l.y - p.h * 0.05, 0.006);
      ln.mesh.scale.set(p.w * 0.95, Math.max(0.012, p.h * 0.1), 1);
      ln.mesh.rotation.z = p.rot + 0.02;
      return;
    }
    const a = this.room.local(ln.surface, ln.from.u, ln.from.v);
    const b = this.room.local(ln.surface, ln.to!.u, ln.to!.v);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const n = dir.clone().normalize();
    // Start and end just outside each phrase's box.
    const shrink = (p: Placement) => Math.min(p.w / 2 / Math.max(0.01, Math.abs(n.x)), p.h / 2 / Math.max(0.01, Math.abs(n.y))) + 0.04;
    const s0 = shrink(ln.from), s1 = shrink(ln.to!);
    const L = Math.max(0.05, len - s0 - s1);
    const mid = a.clone().add(n.clone().multiplyScalar(s0 + L / 2));
    ln.mesh.position.set(mid.x, mid.y, 0.005);
    ln.mesh.scale.set(L, 0.022, 1);
    ln.mesh.rotation.z = Math.atan2(n.y, n.x);
  }

  /**
   * Rub out a piece of writing except for one word, which stays where it was written.
   * The remaining word becomes its own item, `${key}:kept`.
   */
  erode(key: string, keep: string, now: number): boolean {
    const it = this.items.get(key);
    if (!it || it.vis <= 0 || !keep) return false;
    const text = (it.mesh.userData.text as string) ?? '';
    const idx = text.toLowerCase().indexOf(keep);
    const word = idx >= 0 ? text.slice(idx, idx + keep.length) : keep;
    const m = measureText(word, it.hand, it.size);
    const pl = it.placement;
    const single = pl.h < measureText('Ag', it.hand, it.size).h * 1.5;
    const frac = idx >= 0 && text.length ? idx / text.length : 0;
    const left = pl.u - pl.w / 2 + (single ? frac * pl.w : 0);
    const kept = this.layout.add({ surface: pl.surface, u: Math.min(left + m.w / 2, pl.u + pl.w / 2 - m.w / 2), v: single ? pl.v : pl.v + pl.h / 2 - m.h / 2, w: m.w, h: m.h, rot: pl.rot });
    const k = this.create(`${key}:kept`, word, it.hand, it.size, kept, it.purpose);
    k.vis = 0.5;
    k.target = 1;
    k.rate = 1 / 6;
    k.mesh.visible = true;
    k.expires = it.expires;
    // The rest is rubbed out, slowly and unevenly.
    it.target = 0;
    it.rate = 1 / 9;
    it.expires = it.expires === 0 ? now : it.expires;
    if (it.purpose === 'contribution') it.expires = -1;
    return true;
  }

  removeContributions() {
    for (const it of this.items.values()) if (it.purpose === 'contribution') {
      it.target = 0;
      it.rate = 1 / 3;
      it.expires = -1;
    }
  }

  /** Which phrase holds the visitor's attention: nearest to the centre of view, within its own angular size. */
  attention(cam: THREE.Camera): string | null {
    const pos = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    let best: string | null = null;
    let bestScore = Infinity;
    const to = new THREE.Vector3();
    for (const it of this.items.values()) {
      if (it.vis < 0.35 || !(it.phrase || it.source)) continue;
      to.copy(it.centre).sub(pos);
      const dist = to.length();
      if (dist > 6.5 || dist < 0.2) continue;
      if (it.normal.dot(to) > 0) continue; // behind the surface
      const ang = fwd.angleTo(to);
      const half = Math.atan2(Math.max(it.placement.w, it.placement.h * 2) / 2, dist) + 0.04;
      if (ang > half) continue;
      // Too small to read from here.
      const angularH = Math.atan2(it.placement.h, dist);
      if (angularH < 0.006) continue;
      const score = ang / half;
      if (score < bestScore) {
        bestScore = score;
        best = it.key;
      }
    }
    return best;
  }

  update(dt: number, now: number, cam: THREE.Camera, env: Environment, gazeId: string | null, gazeFor: number) {
    if (Math.abs(this.room.scale - this.lastScale) > 0.0005) {
      this.lastScale = this.room.scale;
      for (const it of this.items.values()) this.position(it);
      for (const ln of this.lines.values()) this.positionLine(ln);
    }
    const pos = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const to = new THREE.Vector3();
    for (const it of [...this.items.values()]) {
      if (it.expires && now > it.expires && it.target > 0) {
        it.target = 0;
        it.rate = 1 / 12;
      }
      if (it.vis !== it.target) {
        const step = it.rate * dt;
        it.vis = it.target > it.vis ? Math.min(it.target, it.vis + step) : Math.max(it.target, it.vis - step);
      }
      if (it.vis <= 0 && it.target <= 0) {
        it.mesh.visible = false;
        if (it.purpose !== 'phrase' && it.expires !== 0) this.dispose(it);
        continue;
      }
      it.mesh.visible = true;
      to.copy(it.centre).sub(pos);
      const dist = to.length();
      // Distance legibility: small and faint writing needs you to come close.
      let legible = 1;
      if (it.phrase?.tier === 'near') legible = smoothstep(2.8, 1.1, dist);
      else if (it.size === 'xs') legible = 0.35 + 0.65 * smoothstep(5.5, 2.2, dist);
      else if (it.hand === 'faint') legible = 0.45 + 0.55 * smoothstep(6, 2.5, dist);
      // Shy writing withdraws from a direct look.
      if (it.phrase?.shy) {
        const ang = fwd.angleTo(to);
        const target = ang < 0.16 && dist < 6 ? 0.06 : 1;
        it.shy = approach(it.shy, target, dt, target < it.shy ? 0.7 : 2.2);
      }
      const gazed = gazeId === it.key;
      it.emphasis = approach(it.emphasis, gazed ? clamp((gazeFor - 0.8) / 3) * 0.7 : 0, dt, gazed ? 1.2 : 3);
      const base = HANDS[it.hand].opacity;
      if (it.plan) {
        const h = handAt(it.plan, wallClock());
        it.uniforms.uWrite.value = h / Math.max(1e-3, it.duration);
        // Done: the writing simply exists (an unfinished sentence keeps its plan, to be finished).
        if (h >= it.duration) {
          it.plan = null;
          it.uniforms.uWrite.value = 2;
        }
      }
      it.uniforms.uReveal.value = it.vis;
      it.uniforms.uOpacity.value = clamp(base * legible * it.shy * env.textContrast * (1 + it.emphasis * 0.3), 0, 1);
      it.uniforms.uEmphasis.value = it.emphasis;
    }
    for (const ln of [...this.lines.values()]) {
      if (ln.expires && now > ln.expires) ln.target = 0;
      ln.vis = approach(ln.vis, ln.target, dt, ln.target > ln.vis ? 2.5 : 4);
      ln.mat.opacity = ln.vis * env.textContrast;
      if (ln.target === 0 && ln.vis < 0.01) {
        ln.mesh.removeFromParent();
        ln.mat.dispose();
        this.lines.delete(ln.key);
      }
    }
  }

  private dispose(it: TextItem) {
    it.mesh.removeFromParent();
    const mat = it.mesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.layout.remove(it.placement);
    this.items.delete(it.key);
  }

  /** The phrase a piece of writing is (or repeats). */
  phraseOf(key: string | null): string | null {
    if (!key) return null;
    const it = this.items.get(key);
    return it?.phrase?.id ?? it?.source ?? null;
  }

  centreOf(key: string): THREE.Vector3 | null {
    return this.items.get(key)?.centre.clone() ?? null;
  }
}
