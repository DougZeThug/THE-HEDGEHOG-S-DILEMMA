import * as THREE from 'three';
import type { Phrase, Surface, Hand, Size } from '../content/types';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import type { Room } from './Room';
import { layoutPhrases, layoutOf, surfaceSize, drawingSpots, drawingBeside, isWallSurface, type Placement, type SurfaceLayout } from './layout';
import { HANDS, measureText, wordPosition, textTexture, pencilLineTexture, inkTexture } from './textures';
import { DRAWINGS, DRAWING_BY_ID, type DrawingDef } from '../content/drawings';
import { bakeDrawing, bakedSize } from './sketch';
import { wordRanges } from './handwriting';
import { approach, clamp, smoothstep } from '../core/math';
import { hashString } from '../core/rng';
import { idle } from '../core/time';
import type { Environment } from '../core/environment';
import { AirWriting } from './airText';
import { makeTextMaterial, type TextUniforms } from './textMaterial';
import { placeByDrawing, placeWithin, placeWrite } from './writePlacement';
import { handAt, recedeStep, speechPlan, wallClock, wordBand, type RecedeState, type WritePlan } from './writePlan';

export { handAt, recedeStep, speechPlan, wallClock, wordBand, type RecedeState, type WritePlan };

/**
 * Writing on the walls. Every piece of writing is a textured plane lying on its surface, lit
 * by the same light as the plaster. New writing is *written*: a hand puts it down stroke by
 * stroke (the texture carries when each pixel is reached; see textures.ts and strokes.ts),
 * either at its own pace or following a voice. Rubbing out is a dissolve: writing leaves in
 * patches, the way pencil does under an eraser.
 */

type Purpose = 'phrase' | 'annotation' | 'recall' | 'recontext' | 'contribution' | 'drawing';

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
  uniforms: TextUniforms;
  vis: number;
  target: number;
  rate: number;
  shy: number;
  emphasis: number;
  /** A touch on the words, felt in the ink: darker at once, settling back over about a second. */
  pressed?: number;
  /** Touched, and it shows a little afterwards, like handled paper (fades over minutes). */
  handled?: number;
  presses?: number;
  expires: number;
  centre: THREE.Vector3;
  normal: THREE.Vector3;
  /** The hand's own time for each word, and for the whole piece (seconds). */
  words: [number, number][];
  duration: number;
  /** The hand at work, or null once the writing simply exists. */
  plan: WritePlan | null;
  /** A fraction of the hand's usual strength (drawings are fainter than writing). */
  strength?: number;
  /** Washed out by light falling across it (0–1): a memory's sun on the wall. */
  wash?: number;
  /** One word going (or gone), as a vignette leaves it: its band of the hand's time. */
  gap?: { lo: number; hi: number; gone: number; target: number; rate: number };
  /** Harder to read the closer one comes (0–1), and how far it is receding now. */
  recede?: RecedeState;
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

/** How much of a touch the words keep (of the emphasis, 0–1; a long look reaches 0.7). */
const HANDLED = 0.25;

/** Where a piece of writing is, for light to be laid across it: its wall's writing group, its centre there, and the wall's limits. */
interface WallAnchor {
  key: string;
  group: THREE.Object3D;
  x: number;
  y: number;
  w: number;
  h: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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
  /** How much faint writing is strengthened (the look's, with the room's light; 1 = as written). */
  faintBoost = 1;
  /** Writing in the air: at most one piece, which goes when approached. */
  private airText = new AirWriting(this.geo, () => this.reducedMotion);
  get air(): THREE.Group {
    return this.airText.group;
  }
  /** The key light's strength relative to the room's usual (the air writing's shadow follows it). */
  get airShadowLight(): number {
    return this.airText.shadowLight;
  }
  set airShadowLight(v: number) {
    this.airText.shadowLight = v;
  }
  /** Told once when the writing in the air goes: rubbed out by someone coming close, or simply fading. */
  get onAirGone(): AirWriting['onGone'] {
    return this.airText.onGone;
  }
  set onAirGone(f: AirWriting['onGone']) {
    this.airText.onGone = f;
  }

  constructor(private room: Room, seed: number) {
    // The drawings already on the walls have their places first: nothing is written over them.
    const spots = drawingSpots(DRAWINGS);
    this.placements = layoutPhrases(PHRASES, (p) => measureText(p.text, p.hand, p.size), seed, spots);
    DRAWINGS.filter((d) => d.at).forEach((d, i) => this.drawingPlaces.set(d.id, spots[i]));
    this.layout = layoutOf(this.placements);
    this.lineTex = [pencilLineTexture(1), pencilLineTexture(2), pencilLineTexture(3)];
    // Writing is made when it is first needed: the room begins nearly empty, and baking every
    // phrase up front would cost a phone seconds and tens of megabytes.
  }

  /** The item for a phrase (or a drawing), made the first time it is asked for. */
  private ensure(id: string): TextItem | undefined {
    const have = this.items.get(id);
    if (have) return have;
    const dd = DRAWING_BY_ID.get(id);
    if (dd) return this.createDrawing(dd);
    // A drawing made beside this line later: bake it now, when the browser is idle, not in the
    // frame it is drawn.
    for (const d of DRAWINGS) {
      if (d.when === 'start' || d.when.seen !== id) continue;
      idle(() => void this.ensure(d.id));
    }
    const p = PHRASE_BY_ID.get(id);
    const pl = this.placements.get(id);
    if (!p || !pl) return undefined;
    return this.create(p.id, p.text, p.hand, p.size, pl, 'phrase', p);
  }

  /** Make the writing for these phrases now (e.g. while the screen is dark), so writing them later costs nothing. */
  prepare(ids: string[]) {
    for (const id of ids) this.ensure(id);
  }

  private drawingPlaces = new Map<string, Placement>();

  /** A drawing: baked once from its strokes, on the wall in the writing's own material. */
  private createDrawing(def: DrawingDef): TextItem | undefined {
    let pl = this.drawingPlaces.get(def.id);
    if (!pl && def.beside) {
      pl = drawingBeside(this.layout, def, this.placementOf(def.beside)) ?? undefined;
      if (pl) this.drawingPlaces.set(def.id, pl);
    }
    if (!pl) return undefined;
    const bake = bakeDrawing(def);
    const [w, h] = bakedSize(def, bake);
    const tex = inkTexture(bake.data, bake.W, bake.H);
    const item = this.make({ key: def.id, text: '', hand: def.hand, tex, w, h, duration: bake.duration, words: bake.words, placement: { ...pl, rot: def.upright ? 0 : ((hashString(def.id) % 7) - 3) * 0.012 }, purpose: 'drawing', size: 's', strength: def.strength });
    item.uniforms.uThin.value = def.style === 'ghost' ? 0 : 0.5;
    return item;
  }

  /** A drawing drawn while someone watches: stroke by stroke, the hand's own pace. False if there was no room for it. */
  draw(id: string): boolean {
    if (!this.ensure(id)) return false;
    this.writeOn(id);
    return true;
  }

  private create(key: string, text: string, hand: Hand, size: Size, pl: Placement, purpose: Purpose, phrase?: Phrase): TextItem {
    const { tex, w, h, words, duration } = textTexture(text, hand, size, key);
    return this.make({ key, text, hand, tex, w, h, duration, words, placement: pl, purpose, size, phrase });
  }

  /** The plane for a baked piece of writing, on its wall, not yet shown. */
  private make(o: { key: string; text: string; hand: Hand; tex: THREE.Texture; w: number; h: number; duration: number; words: [number, number][]; placement: Placement; purpose: Purpose; size: Size; phrase?: Phrase; strength?: number }): TextItem {
    const { mat, uniforms } = makeTextMaterial(o.tex, o.hand, o.w / o.h, hashString(o.key), o.duration);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.set(o.w, o.h, 1);
    mesh.userData.text = o.text;
    mesh.renderOrder = 2;
    mesh.visible = false;
    mesh.receiveShadow = true;
    this.room.frames[o.placement.surface].writing.add(mesh);
    const item: TextItem = {
      key: o.key, phrase: o.phrase, purpose: o.purpose, hand: o.hand, size: o.size, placement: o.placement, mesh, uniforms,
      vis: 0, target: 0, rate: 0.1, shy: 1, emphasis: 0, expires: 0,
      centre: new THREE.Vector3(), normal: new THREE.Vector3(),
      words: o.words, duration: o.duration, plan: null, strength: o.strength,
    };
    this.position(item);
    this.items.set(o.key, item);
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
  redraw(id: string) {
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

  /**
   * Write a phrase in the air at `at` (world), facing `face`, by the same hand as on the walls
   * but fainter, on no surface at all (see AirWriting). One at a time.
   */
  writeInAir(o: Parameters<AirWriting['write']>[0]): boolean {
    return this.airText.write(o);
  }

  /** Where the writing in the air is, while it is there (for keyboard navigation). */
  get airCentre(): THREE.Vector3 | null {
    return this.airText.centre;
  }

  /** The writing in the air, if any, and how much of it is there (for tests and the inspector). */
  get airState(): AirWriting['state'] {
    return this.airText.state;
  }

  /** Write new text beside a phrase or somewhere on a surface. Returns false if there was no room. */
  write(o: { key: string; text: string; hand: Hand; size: Size; beside?: string; surface?: Surface; near?: { u: number; v: number }; by?: string; purpose: Exclude<Purpose, 'phrase'>; ttl: number; now: number; source?: string; start?: boolean }): boolean {
    if (this.items.has(o.key)) return false;
    // Written by a drawing (a memory's line, by the drawing it opens from) if there is room by it;
    // otherwise as any other line is.
    const by = o.by ? this.items.get(o.by)?.placement : undefined;
    const found = (by && placeByDrawing(this.layout, by, o)) || placeWrite(this.layout, o, o.beside ? this.placementOf(o.beside) : undefined);
    if (!found) return false;
    const it = this.create(o.key, o.text, o.hand, found.size, found.placement, o.purpose);
    it.source = o.source;
    it.expires = o.ttl > 0 ? o.now + o.ttl : 0;
    // start: false — made, but written later (by a voice).
    if (o.start !== false) this.writeOn(o.key);
    return true;
  }

  /**
   * Write a line under another inside a place on its wall (see `placeWithin`). The ids of the lines
   * that wait (the room keeps them off the walls from then on), or null, and nothing written, if
   * nothing fits.
   */
  writeWithin(o: { key: string; text: string; hand: Hand; size: Size; under: string; within: { cx: number; cy: number; w: number; h: number }; purpose: Exclude<Purpose, 'phrase'>; now: number; source?: string; start?: boolean }): string[] | null {
    if (this.items.has(o.key)) return null;
    const found = placeWithin({ layout: this.layout, placements: this.placements, items: this.items, scale: this.room.scale }, o);
    if (!found) return null;
    const it = this.create(o.key, o.text, o.hand, o.size, found.placement, o.purpose);
    it.source = o.source;
    it.expires = 0;
    if (o.start !== false) this.writeOn(o.key);
    return found.waiting;
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
    const shrink = (p: Placement) => Math.min(p.w / 2 / Math.max(0.01, Math.abs(n.x)), p.h / 2 / Math.max(0.01, Math.abs(n.y))) + 0.04;
    const s0 = shrink(ln.from), s1 = shrink(ln.to!);
    const L = Math.max(0.05, len - s0 - s1);
    const mid = a.clone().add(n.clone().multiplyScalar(s0 + L / 2));
    ln.mesh.position.set(mid.x, mid.y, 0.005);
    ln.mesh.scale.set(L, 0.022, 1);
    ln.mesh.rotation.z = Math.atan2(n.y, n.x);
  }

  /** Every piece of writing that is this line (where it was written, and wherever it was written again). */
  keysOf(phraseId: string): string[] {
    return [...this.items.values()].filter((it) => it.purpose !== 'drawing' && (it.phrase?.id === phraseId || it.source === phraseId || it.key === phraseId)).map((it) => it.key);
  }

  /**
   * One word of a line goes, over `seconds`, as if rubbed out (a ghost of it stays). Returns
   * false if the line or the word isn't there.
   */
  loseWord(key: string, word: string, seconds: number): boolean {
    const it = this.items.get(key);
    const text = (it?.mesh.userData.text as string) ?? '';
    if (!it || !text) return false;
    const ranges = wordRanges(text);
    const k = ranges.findIndex(([a, b]) => text.slice(a, b).toLowerCase().replace(/[^a-z']/g, '') === word.toLowerCase());
    if (k < 0 || k >= it.words.length) return false;
    const [lo, hi] = wordBand(it.words, it.duration, k);
    it.gap = { lo, hi, gone: it.gap?.gone ?? 0, target: 1, rate: 1 / Math.max(0.5, this.reducedMotion ? seconds * 1.5 : seconds) };
    return true;
  }

  /**
   * Made but not yet seen (`write` with `start: false`): it is simply there, as if it always had
   * been, coming up in patches over `seconds`. Never the hand writing it.
   */
  appear(key: string, seconds: number): void {
    const it = this.items.get(key);
    if (!it) return;
    it.plan = null;
    it.uniforms.uWrite.value = 2;
    it.vis = 0;
    it.target = 1;
    it.rate = 1 / Math.max(0.5, seconds);
    it.mesh.visible = true;
  }

  /** The line becomes harder to read as one comes close (for the rest of the visit, or until `amount` 0). */
  recede(key: string, amount: number): void {
    const it = this.items.get(key);
    if (it) it.recede = { amount, k: it.recede?.k ?? 0, near: 0, far: 0, away: it.recede?.away ?? false, once: it.recede?.once ?? false };
  }

  /**
   * Rub out a piece of writing except for one word, which stays where it was written.
   * The remaining word becomes its own item, `${key}:kept`.
   */
  erode(key: string, keep: string, now: number): boolean {
    const it = this.items.get(key);
    if (!it || it.vis <= 0 || !keep) return false;
    const text = (it.mesh.userData.text as string) ?? '';
    // (`keep` has its apostrophes straightened, one character for one, so the index holds in the text as written.)
    const idx = text.toLowerCase().replace(/[’']/g, "'").indexOf(keep);
    const word = idx >= 0 ? text.slice(idx, idx + keep.length) : keep;
    const m = measureText(word, it.hand, it.size);
    const pl = it.placement;
    // (Where it was written: its own line of the wrapped text, and how far along it.)
    const at = idx >= 0 ? wordPosition(text, idx, keep.length, it.hand, it.size) : { line: 0, lines: 1, x: 0, w: 0 };
    const left = pl.u - pl.w / 2 + at.x;
    const kept = this.layout.add({
      surface: pl.surface,
      u: Math.min(left + m.w / 2, pl.u + pl.w / 2 - m.w / 2),
      v: pl.v + pl.h / 2 - ((at.line + 0.5) * pl.h) / at.lines,
      w: m.w, h: m.h, rot: pl.rot,
    });
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

  /**
   * The visitor touched these words: the ink takes the touch, and keeps a little of it for some
   * minutes, like handled paper. Touching again never deepens it: each further touch can leave less
   * than the last, never more (docs/reviews/2026-11-core-loop.md).
   */
  press(key: string): void {
    const it = this.items.get(key);
    if (!it) return;
    it.pressed = 1;
    it.presses = (it.presses ?? 0) + 1;
    it.handled = Math.max(it.handled ?? 0, HANDLED * 0.6 ** (it.presses - 1));
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
    this.airText.update(dt, now, pos, env);
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
      // Drawings are found rather than displayed: barely there from across the room.
      if (it.purpose === 'drawing') legible = 0.5 + 0.5 * smoothstep(5.5, 1.6, dist);
      // Shy writing withdraws from a direct look.
      if (it.phrase?.shy) {
        const ang = fwd.angleTo(to);
        const target = ang < 0.16 && dist < 6 ? 0.06 : 1;
        it.shy = approach(it.shy, target, dt, target < it.shy ? 0.7 : 2.2);
      }
      const gazed = gazeId === it.key;
      it.emphasis = approach(it.emphasis, gazed ? clamp((gazeFor - 0.8) / 3) * 0.7 : 0, dt, gazed ? 1.2 : 3);
      if (it.pressed) it.pressed = it.pressed < 0.01 ? 0 : approach(it.pressed, 0, dt, 0.8);
      // A touch leaves a little of itself on the words, fading over minutes (the hand's, not the eye's).
      if (it.handled) it.handled = it.handled < 0.005 ? 0 : approach(it.handled, 0, dt, 240);
      // Receding: the closer, the less of it (and a look doesn't bring it back); stepping back
      // returns it, more slowly than it went.
      let recede = 0;
      if (it.recede) {
        it.recede = recedeStep(it.recede, dist, dt);
        recede = it.recede.k;
        it.emphasis *= 1 - recede;
      }
      if (it.gap) {
        const g = it.gap;
        g.gone = g.target > g.gone ? Math.min(g.target, g.gone + g.rate * dt) : Math.max(g.target, g.gone - g.rate * dt);
        it.uniforms.uGap.value.set(g.lo, g.hi, g.gone);
      }
      let base = HANDS[it.hand].opacity * (it.strength ?? 1) * (1 - (it.wash ?? 0));
      // Faint writing on a brighter wall sits higher on the tone curve and loses contrast: the
      // look gives it back (only the faint: the strong lines held their own).
      if (it.placement.surface === 'floor') {
        // The floor by the chair is the brightest surface in the room, the key's pool high on the
        // tone curve, where pencil is compressed hardest, strong lines too: all of it is given back
        // more (and none in the original look).
        base = Math.min(0.8, base * this.faintBoost ** 2);
      } else if (base < 0.4) base = Math.min(0.4, base * this.faintBoost);
      if (it.plan) {
        const h = handAt(it.plan, wallClock());
        it.uniforms.uWrite.value = h / Math.max(1e-3, it.duration);
        // Done: the writing simply exists (an unfinished sentence keeps its plan, to be finished).
        if (h >= it.duration) {
          it.plan = null;
          it.uniforms.uWrite.value = 2;
        }
      }
      it.uniforms.uReveal.value = it.vis * (1 - 0.55 * recede);
      it.uniforms.uOpacity.value = clamp(base * legible * Math.min(it.shy, 1 - 0.5 * recede) * env.textContrast * (1 + it.emphasis * 0.3), 0, 1);
      it.uniforms.uEmphasis.value = Math.min(1, Math.max(it.emphasis, it.handled ?? 0) + (it.pressed ?? 0) * 0.35);
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

  /**
   * Where a phrase is written now, to lay light across it: the visible piece of writing that is
   * (or repeats) it, its wall's writing group, its centre there, and the wall's height limits.
   */
  anchorOf(phraseId: string, preferKey?: string | null): WallAnchor | null {
    let best: TextItem | null = null;
    for (const it of this.items.values()) {
      if (it.vis < 0.5 || it.purpose === 'drawing' || this.phraseOf(it.key) !== phraseId) continue;
      if (!isWallSurface(it.placement.surface)) continue;
      // The copy being looked at (or touched) first; then the one written for the memory.
      if (!best || it.key === preferKey || (best.key !== preferKey && it.key.startsWith('memory:'))) best = it;
    }
    return best && this.anchorAt(best);
  }

  /** A drawing now stands for a phrase: looking at it is meeting that phrase (a memory's drawing). */
  drawingMeans(key: string, phraseId: string): void {
    const it = this.items.get(key);
    if (it) it.source = phraseId;
  }

  /** The same, for one item by its key (a drawing a memory opens from). */
  anchorOfKey(key: string): WallAnchor | null {
    const it = this.items.get(key);
    if (!it || it.vis < 0.2 || !isWallSurface(it.placement.surface)) return null;
    return this.anchorAt(it);
  }

  private anchorAt(it: TextItem): WallAnchor {
    const pl = it.placement;
    const l = this.room.local(pl.surface, pl.u, pl.v);
    const size = surfaceSize(pl.surface);
    const half = size.h / 2, halfW = (size.w / 2) * this.room.scale;
    // Inside the corners, above the skirting and its shadow gap, below the cornice.
    return { key: it.key, group: this.room.frames[pl.surface].writing, x: l.x, y: l.y, w: pl.w, h: pl.h, minX: -halfW + 0.1, maxX: halfW - 0.1, minY: -half + 0.1, maxY: half - 0.1 };
  }

  /** Light washing a piece of writing out (0–1). */
  wash(key: string, amount: number) {
    const it = this.items.get(key);
    if (it) it.wash = amount;
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
