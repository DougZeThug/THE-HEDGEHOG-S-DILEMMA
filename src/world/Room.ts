import * as THREE from 'three';
import type { Surface } from '../content/types';
import { ROOM, surfaceSize } from './layout';

/** Where the frosted panel hangs: north of the chair, so the chair's shadow falls toward whoever arrives. */
export const PANEL = { x: 0.1, z: -0.95 };
import { wallMaps, floorMaps, ceilingMaps, surfaceDetail } from './surfaces';
import { ceilingFor, panelFor, type Look } from './Style';

const SKIRT = 0.1;
const WELL_M = 1.3;

/** The well's reveal as an alpha map: a square ring from the panel's rim outward, fading. */
function wellTexture(): THREE.DataTexture {
  const N = 128, d = new Uint8Array(N * N * 4);
  const inner = 0.48 / (WELL_M / 2), outer = 1;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = Math.abs((i + 0.5) / N * 2 - 1), y = Math.abs((j + 0.5) / N * 2 - 1);
      const r = Math.max(x, y);
      const t = r < inner ? 0 : Math.max(0, 1 - (r - inner) / (outer - inner));
      const a = Math.round(255 * 0.9 * t * t);
      const k = (j * N + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = a;
      d[k + 3] = 255;
    }
  const t = new THREE.DataTexture(d, N, N);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The ceiling's bounce, as a map: 1 at the panel's rim, falling steeply toward the walls. */
function ceilingGlow(wM: number, dM: number): THREE.CanvasTexture {
  const ppm = 40;
  const c = document.createElement('canvas');
  c.width = Math.round(wM * ppm);
  c.height = Math.round(dM * ppm);
  const g = c.getContext('2d')!;
  // Canvas rows run toward -z in the room (the ceiling is laid face down), as in surfaces.ts.
  const px = c.width / 2 + PANEL.x * ppm, pz = c.height / 2 - PANEL.z * ppm;
  const grd = g.createRadialGradient(px, pz, 0.45 * ppm, px, pz, 3.2 * ppm);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.2, '#787878');
  grd.addColorStop(1, '#262626');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  // Linear values (a factor, not a colour): 1 at the rim, 0.47 half a metre out, 0.15 at the walls.
  return new THREE.CanvasTexture(c);
}

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

  constructor(quality: 'low' | 'medium' | 'high' = 'medium') {
    surfaceDetail(quality);
    const H = ROOM.height;
    const wallSurfaces: Surface[] = ['north', 'east', 'south', 'west'];
    const seeds: Record<Surface, number> = { north: 11, east: 23, south: 37, west: 41, floor: 53, ceiling: 67 };
    for (const s of [...wallSurfaces, 'floor', 'ceiling'] as Surface[]) {
      const size = surfaceSize(s);
      const isFloor = s === 'floor';
      const isCeil = s === 'ceiling';
      const tex = isFloor ? floorMaps(seeds[s], size.w, size.h) : isCeil ? ceilingMaps(seeds[s], size.w, size.h) : wallMaps(s, seeds[s], size.w, size.h);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        bumpMap: tex.bump,
        bumpScale: isFloor ? 0.5 : 0.9,
        roughnessMap: tex.rough ?? null,
        roughness: isFloor ? 1 : 0.95,
        metalness: 0,
        color: 0xffffff,
        // A white ceiling is lit only by bounce; a little self-light stands in for it, strongest
        // round the panel and falling away to the walls (a flat grey lid reads as an office).
        emissive: new THREE.Color(isCeil ? 0x23262a : 0x000000),
        emissiveMap: isCeil ? ceilingGlow(size.w, size.h) : null,
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

    // Frosted ceiling panel — the only visible source of light. Brighter at its centre,
    // softening toward a thin frame, like light through etched glass.
    const pc = document.createElement('canvas');
    pc.width = pc.height = 128;
    const pg = pc.getContext('2d')!;
    const grd = pg.createRadialGradient(64, 64, 6, 64, 64, 92);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.6, '#f4f2ec');
    grd.addColorStop(1, '#d8d6d0');
    pg.fillStyle = grd;
    pg.fillRect(0, 0, 128, 128);
    const ptex = new THREE.CanvasTexture(pc);
    ptex.colorSpace = THREE.SRGBColorSpace;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: ptex, emissiveIntensity: 2.2, roughness: 1 });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), panelMat);
    this.panel.rotation.x = Math.PI / 2;
    this.panel.position.set(PANEL.x, H - 0.021, PANEL.z);
    // The rim of the light well catches the light (lit from the panel itself, which no light here
    // reaches): the brightest ring after the glass, not a drawn frame.
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.02, 0.96),
      new THREE.MeshStandardMaterial({ color: 0xc9c7c2, roughness: 0.55, emissive: 0x000000 }),
    );
    this.rim = rim.material as THREE.MeshStandardMaterial;
    rim.position.set(PANEL.x, H - 0.008, PANEL.z);
    // The light well's reveal: the glass sits back in the ceiling, and the splayed sides of its
    // opening catch the light, brightest at the glass and fading into the ceiling (the artist's
    // reference shows the source as a lit opening, not a fitting).
    this.well = new THREE.Mesh(
      new THREE.PlaneGeometry(WELL_M, WELL_M),
      new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: wellTexture(), transparent: true, depthWrite: false, opacity: 1 }),
    );
    this.well.rotation.x = Math.PI / 2;
    this.well.position.set(PANEL.x, H - 0.003, PANEL.z);
    this.group.add(rim, this.panel, this.well);

    this.setScale(1);
  }

  private rim: THREE.MeshStandardMaterial;
  private well: THREE.Mesh;
  private rimEmissive = new THREE.Color(0xffffff);
  private ceilingEmissive = new THREE.Color(0x23262a);
  private ceilingLit = 1;

  /** The look's share of the room: the ceiling's bounce, the plaster's relief. */
  setLook(look: Look) {
    this.ceilingBounce = look.ceiling;
    for (const s of Object.keys(this.frames) as Surface[]) {
      const m = this.frames[s].mesh.material as THREE.MeshStandardMaterial;
      m.bumpScale = (s === 'floor' ? 0.5 : 0.9) * look.texture;
    }
    this.setWarmth(this.warmth);
  }
  private ceilingBounce = 1;
  private warmth = 0;

  /** The light's warmth as it is now (Lighting.warmthNow): the panel's glass, its rim, the ceiling's bounce. */
  setWarmth(w: number) {
    this.warmth = w;
    ceilingFor(w, this.ceilingEmissive).multiplyScalar(this.ceilingBounce);
    (this.panel.material as THREE.MeshStandardMaterial).emissive.copy(panelFor(w));
    panelFor(w, this.rimEmissive).multiplyScalar(0.3);
    (this.well.material as THREE.MeshBasicMaterial).color.copy(panelFor(w)).multiplyScalar(0.5);
    this.setLit(this.panelLit, this.ceilingLit);
  }
  private panelLit = 1;
  /**
   * The opening's light: how lit the panel looks (0 dark, 1 as built) and how much of the
   * ceiling's stand-in bounce there is. Only intensities change: no light is added or removed,
   * so no shader recompiles while the room comes up.
   */
  setLit(panel: number, ceiling: number) {
    this.panelLit = panel;
    this.ceilingLit = ceiling;
    (this.panel.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * panel;
    (this.frames.ceiling.mesh.material as THREE.MeshStandardMaterial).emissive.copy(this.ceilingEmissive).multiplyScalar(ceiling);
    this.rim.emissive.copy(this.rimEmissive).multiplyScalar(panel);
    (this.well.material as THREE.MeshBasicMaterial).opacity = Math.min(1, panel);
  }

  /**
   * Soft grey trim: a skirting, and where the wall meets it and the ceiling, a soft shadow a
   * few centimetres deep rather than a ruled line (a hard 1-px seam is the most computer-drawn
   * thing in a white room).
   */
  private addSkirting(group: THREE.Group, w: number) {
    // A painted grey board, darker than the wall, so the room's base line reads.
    const trim = new THREE.MeshStandardMaterial({ color: 0x9e988f, roughness: 0.6 });
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w, SKIRT, 0.014), trim);
    sk.position.set(0, -ROOM.height / 2 + SKIRT / 2, 0.007);
    sk.receiveShadow = true;
    sk.name = 'skirting';
    const reveal = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.03), Room.seam(false));
    reveal.position.set(0, -ROOM.height / 2 + SKIRT + 0.015, 0.0015);
    reveal.name = 'skirting';
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.04), Room.seam(true));
    top.position.set(0, ROOM.height / 2 - 0.02, 0.0015);
    top.name = 'skirting';
    group.add(sk, reveal, top);
  }

  /** A shadow that is darkest at one edge (the top, or the bottom) and fades out over its height. */
  private static seams: Partial<Record<'top' | 'bottom', THREE.MeshStandardMaterial>> = {};
  private static seam(atTop: boolean): THREE.MeshStandardMaterial {
    const k = atTop ? 'top' : 'bottom';
    const cached = Room.seams[k];
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, atTop ? 0 : 64, 0, atTop ? 64 : 0);
    grd.addColorStop(0, 'rgb(110,110,110)');
    grd.addColorStop(0.3, 'rgb(55,55,55)');
    grd.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1, 64);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.MeshStandardMaterial({ color: 0x8f8a83, roughness: 0.95, alphaMap: t, transparent: true, depthWrite: false });
    Room.seams[k] = m;
    return m;
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
      for (const o of f[k].group.children) if (o.name === 'skirting') o.scale.x = s;
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
