import * as THREE from 'three';
import type { Surface } from '../content/types';
import { ROOM, surfaceSize } from './layout';
import { plasterTextures } from './textures';

export interface SurfaceFrame {
  surface: Surface;
  /** Positioned on the surface plane: local +x = u direction, +y = v direction, +z = into the room. */
  group: THREE.Group;
  /** Holds writing; children positioned in surface-local metres. */
  writing: THREE.Group;
  mesh: THREE.Mesh;
  size: { w: number; h: number };
}

/**
 * The white room. Built from planes with procedural plaster/paper textures, a skirting
 * board, and a frosted ceiling panel. Its horizontal scale can change: walls can drift
 * further away while the visitor is not looking at them.
 */
export class Room {
  readonly group = new THREE.Group();
  readonly frames = {} as Record<Surface, SurfaceFrame>;
  readonly panel: THREE.Mesh;
  scale = 1;

  constructor() {
    const H = ROOM.height;
    const wallSurfaces: Surface[] = ['north', 'east', 'south', 'west'];
    const seeds: Record<Surface, number> = { north: 11, east: 23, south: 37, west: 41, floor: 53, ceiling: 67 };
    for (const s of [...wallSurfaces, 'floor', 'ceiling'] as Surface[]) {
      const size = surfaceSize(s);
      const isFloor = s === 'floor';
      const isCeil = s === 'ceiling';
      const tex = plasterTextures(seeds[s], size.w, size.h, {
        floor: isFloor,
        ceiling: isCeil,
        tone: isFloor ? [229, 226, 220] : isCeil ? [240, 239, 236] : s === 'west' ? [233, 232, 229] : s === 'east' ? [238, 235, 229] : [236, 234, 229],
      });
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        bumpMap: tex.bump,
        bumpScale: isFloor ? 0.6 : 1.1,
        roughness: isFloor ? 0.82 : 0.94,
        metalness: 0,
        color: 0xffffff,
        // A white ceiling is lit only by bounce; a little self-light stands in for it.
        emissive: new THREE.Color(isCeil ? 0x302e2b : 0x000000),
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), mat);
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.name = s;
      group.add(mesh);
      const writing = new THREE.Group();
      writing.position.z = 0.004;
      group.add(writing);
      if (!isFloor && !isCeil) this.addSkirting(group, size.w);
      this.group.add(group);
      this.frames[s] = { surface: s, group, writing, mesh, size };
    }
    this.frames.floor.group.rotation.x = -Math.PI / 2;
    this.frames.ceiling.group.rotation.x = Math.PI / 2;
    this.frames.ceiling.group.position.y = H;
    this.frames.north.group.rotation.y = 0;
    this.frames.south.group.rotation.y = Math.PI;
    this.frames.east.group.rotation.y = -Math.PI / 2;
    this.frames.west.group.rotation.y = Math.PI / 2;

    // Frosted ceiling panel — the only visible source of light.
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 2.4, roughness: 1 });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), panelMat);
    this.panel.rotation.x = Math.PI / 2;
    this.panel.position.set(0, H - 0.021, -0.2);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.02, 0.96),
      new THREE.MeshStandardMaterial({ color: 0xe6e4df, roughness: 0.6 }),
    );
    rim.position.set(0, H - 0.008, -0.2);
    this.group.add(rim, this.panel);

    this.setScale(1);
  }

  private addSkirting(group: THREE.Group, w: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.55 });
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.075, 0.014), mat);
    sk.position.set(0, -ROOM.height / 2 + 0.0375, 0.007);
    sk.castShadow = false;
    sk.receiveShadow = true;
    sk.name = 'skirting';
    group.add(sk);
  }

  /** Horizontal half-extents at the current scale. */
  get halfW() {
    return ROOM.halfW * this.scale;
  }
  get halfD() {
    return ROOM.halfD * this.scale;
  }

  setScale(s: number) {
    this.scale = s;
    const H = ROOM.height;
    const f = this.frames;
    f.north.group.position.set(0, H / 2, -ROOM.halfD * s);
    f.south.group.position.set(0, H / 2, ROOM.halfD * s);
    f.east.group.position.set(ROOM.halfW * s, H / 2, 0);
    f.west.group.position.set(-ROOM.halfW * s, H / 2, 0);
    for (const k of ['north', 'south', 'east', 'west'] as Surface[]) {
      f[k].mesh.scale.x = s;
      const sk = f[k].group.getObjectByName('skirting');
      if (sk) sk.scale.x = s;
    }
    f.floor.mesh.scale.set(s, s, 1);
    f.ceiling.mesh.scale.set(s, s, 1);
  }

  /** Surface-local coordinates (metres, centred) for a (u, v) layout position. */
  local(surface: Surface, u: number, v: number): THREE.Vector2 {
    const size = this.frames[surface].size;
    const s = this.scale;
    if (surface === 'floor') return new THREE.Vector2((u - size.w / 2) * s, (size.h / 2 - v) * s);
    if (surface === 'ceiling') return new THREE.Vector2((u - size.w / 2) * s, (v - size.h / 2) * s);
    return new THREE.Vector2((u - size.w / 2) * s, v - size.h / 2);
  }

  /** World position of a layout point on a surface. */
  world(surface: Surface, u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
    const l = this.local(surface, u, v);
    const g = this.frames[surface].group;
    g.updateMatrixWorld();
    return out.set(l.x, l.y, 0).applyMatrix4(g.matrixWorld);
  }

  normal(surface: Surface, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, 1).applyQuaternion(this.frames[surface].group.quaternion);
  }

  /** Which wall a horizontal view direction mostly faces. */
  facing(yaw: number): Surface {
    // yaw 0 looks toward -z (north); positive yaw turns left (towards -x, west).
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west';
    return dz < 0 ? 'north' : 'south';
  }

  /** Nearest wall if within `range` metres. */
  nearWall(x: number, z: number, range = 1.1): Surface | null {
    const d: [Surface, number][] = [
      ['north', z + this.halfD],
      ['south', this.halfD - z],
      ['east', this.halfW - x],
      ['west', x + this.halfW],
    ];
    d.sort((a, b) => a[1] - b[1]);
    return d[0][1] < range ? d[0][0] : null;
  }
}
