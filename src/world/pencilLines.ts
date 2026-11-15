import * as THREE from 'three';
import type { Surface } from '../content/types';
import type { Placement } from './layout';
import type { Room } from './Room';
import { pencilLineTexture } from './textures';
import { approach } from '../core/math';
import { hashString } from '../core/rng';

/** A line is either drawn between two pieces of writing, or struck through one. */
type Shape = { kind: 'link'; from: Placement; to: Placement } | { kind: 'strike'; of: Placement };

interface Line {
  key: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  vis: number;
  target: number;
  expires: number;
  surface: Surface;
  shape: Shape;
}

/** The faint pencil lines on the walls: a link joining two phrases, or a strike through one. */
export class PencilLines {
  private lines = new Map<string, Line>();
  private tex = [pencilLineTexture(1), pencilLineTexture(2), pencilLineTexture(3)];

  constructor(private room: Room, private geo: THREE.PlaneGeometry) {}

  private add(key: string, surface: Surface, shape: Shape, target: number, expires: number): void {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4a4b50'),
      map: this.tex[hashString(key) % this.tex.length],
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
    const ln: Line = { key, mesh, mat, vis: 0, target, expires, surface, shape };
    this.lines.set(key, ln);
    this.position(ln);
  }

  /** A line joining two placements on the same surface; false when there is nothing to join or it already exists. */
  link(a: string, b: string, from: Placement | undefined, to: Placement | undefined, ttl: number, now: number): boolean {
    if (!from || !to || from.surface !== to.surface) return false;
    const key = `link:${a}:${b}`;
    if (this.lines.has(key)) return false;
    this.add(key, from.surface, { kind: 'link', from, to }, 0.5, now + ttl);
    return true;
  }

  /** A line struck through a placement (for `ttl` seconds, or until the room changes when 0). */
  strike(id: string, of: Placement, now: number, ttl: number): void {
    const key = `strike:${id}`;
    if (this.lines.has(key)) return;
    this.add(key, of.surface, { kind: 'strike', of }, 0.6, ttl ? now + ttl : 0);
  }

  /** Re-lay every line (the room changed size). */
  reposition(): void {
    for (const ln of this.lines.values()) this.position(ln);
  }

  update(dt: number, now: number, textContrast: number): void {
    for (const ln of [...this.lines.values()]) {
      if (ln.expires && now > ln.expires) ln.target = 0;
      ln.vis = approach(ln.vis, ln.target, dt, ln.target > ln.vis ? 2.5 : 4);
      ln.mat.opacity = ln.vis * textContrast;
      if (ln.target === 0 && ln.vis < 0.01) {
        ln.mesh.removeFromParent();
        ln.mat.dispose();
        this.lines.delete(ln.key);
      }
    }
  }

  private position(ln: Line): void {
    const s = ln.shape;
    if (s.kind === 'strike') {
      const p = s.of;
      const l = this.room.local(p.surface, p.u, p.v);
      ln.mesh.position.set(l.x, l.y - p.h * 0.05, 0.006);
      ln.mesh.scale.set(p.w * 0.95, Math.max(0.012, p.h * 0.1), 1);
      ln.mesh.rotation.z = p.rot + 0.02;
      return;
    }
    const a = this.room.local(ln.surface, s.from.u, s.from.v);
    const b = this.room.local(ln.surface, s.to.u, s.to.v);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const n = dir.clone().normalize();
    const shrink = (p: Placement) => Math.min(p.w / 2 / Math.max(0.01, Math.abs(n.x)), p.h / 2 / Math.max(0.01, Math.abs(n.y))) + 0.04;
    const s0 = shrink(s.from), s1 = shrink(s.to);
    const L = Math.max(0.05, len - s0 - s1);
    const mid = a.clone().add(n.clone().multiplyScalar(s0 + L / 2));
    ln.mesh.position.set(mid.x, mid.y, 0.005);
    ln.mesh.scale.set(L, 0.022, 1);
    ln.mesh.rotation.z = Math.atan2(n.y, n.x);
  }
}
