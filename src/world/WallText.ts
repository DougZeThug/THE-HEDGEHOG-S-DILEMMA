import * as THREE from 'three';
import type { Phrase, Surface, Hand, Size } from '../content/types';
import { PHRASES } from '../content/phrases';
import type { Room } from './Room';
import { layoutPhrases, layoutOf, surfaceSize, type Placement, type SurfaceLayout } from './layout';
import { HANDS, measureText, textTexture, pencilLineTexture } from './textures';
import { approach, clamp, smoothstep } from '../core/math';
import { hashString } from '../core/rng';
import type { Environment } from '../state/Director';

/**
 * Writing on the walls. Every phrase is a textured plane lying on its surface, lit by
 * the same light as the plaster. Visibility is a dissolve, not a fade: writing arrives
 * and leaves in patches, the way pencil does when it is pressed or rubbed out.
 */

const VERT_HEAD = /* glsl */ `
uniform float uReveal;
uniform float uOpacity;
uniform float uEmphasis;
uniform float uSeed;
uniform float uAspect;
`;

const FRAG_NOISE = /* glsl */ `
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

function makeTextMaterial(tex: THREE.Texture, hand: Hand, aspect: number, seed: number) {
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
      /* glsl */ `#include <map_fragment>
      {
        float n = hhFbm(vMapUv * vec2(uAspect * 5.0, 5.0) + uSeed);
        float edge = uReveal * 1.25 - 0.12;
        float m = smoothstep(edge + 0.02, edge - 0.1, n);
        diffuseColor.a *= m * uOpacity;
        diffuseColor.rgb *= 1.0 - 0.45 * uEmphasis;
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'hh-text';
  return { mat, uniforms };
}

type Purpose = 'phrase' | 'annotation' | 'recall' | 'recontext' | 'contribution';

export interface TextItem {
  key: string;
  phrase?: Phrase;
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
    for (const p of PHRASES) {
      const pl = this.placements.get(p.id);
      if (pl) this.create(p.id, p.text, p.hand, p.size, pl, 'phrase', p);
    }
  }

  private create(key: string, text: string, hand: Hand, size: Size, pl: Placement, purpose: Purpose, phrase?: Phrase): TextItem {
    const { tex, w, h } = textTexture(text, hand, size, key);
    const { mat, uniforms } = makeTextMaterial(tex, hand, w / h, hashString(key));
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.set(w, h, 1);
    mesh.renderOrder = 2;
    mesh.visible = false;
    mesh.receiveShadow = true;
    this.room.frames[pl.surface].writing.add(mesh);
    const item: TextItem = {
      key, phrase, purpose, hand, size, placement: pl, mesh, uniforms,
      vis: 0, target: 0, rate: 0.1, shy: 1, emphasis: 0, expires: 0,
      centre: new THREE.Vector3(), normal: new THREE.Vector3(),
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

  /** Show without animation (arrival state). */
  setShown(id: string) {
    const it = this.items.get(id);
    if (!it) return;
    it.vis = it.target = 1;
    it.mesh.visible = true;
  }

  reveal(id: string, seconds: number) {
    const it = this.items.get(id);
    if (!it) return;
    it.target = 1;
    it.rate = 1 / Math.max(0.5, seconds);
    it.mesh.visible = true;
  }

  hide(id: string, seconds: number) {
    const it = this.items.get(id);
    if (!it) return;
    it.target = 0;
    it.rate = 1 / Math.max(0.5, seconds);
  }

  placementOf(id: string): Placement | undefined {
    return this.items.get(id)?.placement;
  }

  /** Write new text beside a phrase or somewhere on a surface. Returns false if there was no room. */
  write(o: { key: string; text: string; hand: Hand; size: Size; beside?: string; surface?: Surface; near?: { u: number; v: number }; purpose: Exclude<Purpose, 'phrase'>; ttl: number; now: number }): boolean {
    if (this.items.has(o.key)) return false;
    const m = measureText(o.text, o.hand, o.size);
    let rect = null as null | { u: number; v: number; w: number; h: number };
    let surface: Surface | undefined = o.surface;
    const target = o.beside ? this.items.get(o.beside)?.placement : undefined;
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
    if (!rect && surface) {
      const size = surfaceSize(surface);
      if (o.purpose === 'contribution' && surface === 'south')
        rect = this.layout.findIn(surface, m.w, m.h, [0.3, 0.7], [1.0, 1.95], 0.05, 120, true) ?? this.layout.findIn(surface, m.w, m.h, [0.08, 0.92], [0.6, 2.4], 0.03, 120, true);
      else rect = this.layout.findIn(surface, m.w, m.h, [0.05, 0.95], [0.9, Math.min(2.3, size.h - 0.2)], 0.03, 120);
    }
    if (!rect || !surface) return false;
    const pl = this.layout.add({ surface, ...rect, rot: (((hashString(o.key) % 100) / 100) - 0.5) * 0.06 });
    const it = this.create(o.key, o.text, o.hand, o.size, pl, o.purpose);
    it.expires = o.ttl > 0 ? o.now + o.ttl : 0;
    this.reveal(o.key, o.purpose === 'contribution' ? 5 : 7);
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
      if (it.vis < 0.35 || !it.phrase) continue;
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

  centreOf(key: string): THREE.Vector3 | null {
    return this.items.get(key)?.centre.clone() ?? null;
  }
}
