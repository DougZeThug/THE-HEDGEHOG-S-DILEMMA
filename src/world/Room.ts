import * as THREE from 'three';
import type { Surface } from '../content/types';
import { ROOM, surfaceSize } from './layout';

/** Where the frosted panel hangs: north of the chair, so the chair's shadow falls toward whoever arrives. */
export const PANEL = { x: 0.1, z: -0.95 };
import { wallMaps, floorMaps, ceilingMaps, surfaceDetail, handMarks, weatheringMap } from './surfaces';
import { ceilingFor, panelFor, type Look } from './Style';
import { makeNoise } from './noise';

const SKIRT = 0.1;
/** The skylight: frosted glass set back in a square well, its sides splaying out to the ceiling. */
const GLASS = 0.9;
const OPENING = 0.96;
const WELL_DEPTH = 0.1;
/** Seams where planes meet: a dark core about a centimetre wide, gone by three. */
const SEAM = 0.03;
/** The glass's emissive intensity as built (the look's `panel` multiplies it). */
const PANEL_GLOW = 2.2;
/** The well's sides, lit by the glass: their brightest, as a multiple of the glass's colour. */
const WELL_GLOW = 0.6;

/**
 * The ceiling: a plane with the skylight's opening cut out (eight quads round a square hole), in
 * the ceiling group's plane (local y is world z). The opening stays where the skylight is as the
 * room's scale changes; the rest stretches, its texture with it, as a scaled plane would.
 */
function ceilingGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(16 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(16 * 2), 2));
  const idx: number[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue; // the opening
      const a = j * 4 + i, b = a + 1, c = a + 4, d = a + 5;
      idx.push(a, b, d, a, d, c);
    }
  geo.setIndex(idx);
  return geo;
}
function setCeilingGeometry(geo: THREE.BufferGeometry, w: number, h: number) {
  const xs = [-w / 2, PANEL.x - OPENING / 2, PANEL.x + OPENING / 2, w / 2];
  const ys = [-h / 2, PANEL.z - OPENING / 2, PANEL.z + OPENING / 2, h / 2];
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const k = j * 4 + i;
      pos.setXYZ(k, xs[i], ys[j], 0);
      uv.setXY(k, xs[i] / w + 0.5, ys[j] / h + 0.5);
    }
  pos.needsUpdate = uv.needsUpdate = true;
  geo.computeBoundingSphere();
}

/**
 * The well's four splayed sides, as one mesh: lit by the glass (no light in the room reaches
 * them), brightest where they meet it and falling off toward the ceiling; the far side, which
 * faces whoever looks up from the south, a third brighter than the others.
 */
function wellGeometry(): THREE.BufferGeometry {
  const a = GLASS / 2, b = OPENING / 2, h = WELL_DEPTH;
  const pos: number[] = [], col: number[] = [];
  // Each side: two corners at the glass (y = h) and two at the ceiling (y = 0), in local x/z.
  const sides: [number, number, number, number, number][] = [
    // [dirX, dirZ, along X?, sign, brightness]
    [0, -1, 1, 1, 1.0], // north, the far side as seen from the south
    [0, 1, 1, 1, 0.55],
    [1, 0, 0, 1, 0.75],
    [-1, 0, 0, 1, 0.75],
  ];
  for (const [dx, dz, alongX, , k] of sides) {
    const corner = (r: number, t: number, y: number) =>
      alongX ? [t * r, y, dz * r] : [dx * r, y, t * r];
    const g0 = corner(a, -1, h), g1 = corner(a, 1, h), c0 = corner(b, -1, 0), c1 = corner(b, 1, 0);
    const top = 0.95 * k, low = 0.3 * k;
    for (const [p, v] of [[g0, top], [g1, top], [c1, low], [g0, top], [c1, low], [c0, low]] as [number[], number][]) {
      pos.push(...p);
      col.push(v, v, v);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** The opening's lip: three square loops (feather, edge, feather), alpha 0 → 0.85 → 0. */
function lipGeometry(): THREE.BufferGeometry {
  const loops = [
    [OPENING / 2 - 0.008, 0],
    [OPENING / 2, 0.85],
    [OPENING / 2 + 0.012, 0],
  ] as const;
  const pos: number[] = [], col: number[] = [];
  const corner = (r: number, k: number) => [[-r, -r], [r, -r], [r, r], [-r, r]][k % 4];
  for (let l = 0; l < 2; l++)
    for (let k = 0; k < 4; k++) {
      const [ra, aa] = loops[l], [rb, ab] = loops[l + 1];
      const a0 = corner(ra, k), a1 = corner(ra, k + 1), b0 = corner(rb, k), b1 = corner(rb, k + 1);
      for (const [p, a] of [[a0, aa], [a1, aa], [b1, ab], [a0, aa], [b1, ab], [b0, ab]] as [number[], number][]) {
        pos.push(p[0], 0, p[1]);
        col.push(1, 1, 1, a);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The ceiling's bounce, as a map: broad, centred between the skylight and the wall behind the
 * chair (the light that comes back off the floor and that wall), not a halo round the opening.
 */
function ceilingGlow(wM: number, dM: number): THREE.CanvasTexture {
  const ppm = 40;
  const c = document.createElement('canvas');
  c.width = Math.round(wM * ppm);
  c.height = Math.round(dM * ppm);
  const g = c.getContext('2d')!;
  // Canvas rows run toward -z in the room (the ceiling is laid face down), as in surfaces.ts.
  const px = c.width / 2 + PANEL.x * ppm, pz = c.height / 2 - (PANEL.z - 0.9) * ppm;
  const grd = g.createRadialGradient(px, pz, 0.2 * ppm, px, pz, 3.6 * ppm);
  grd.addColorStop(0, '#d8d8d8');
  grd.addColorStop(0.45, '#8a8a8a');
  grd.addColorStop(1, '#2a2a2a');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  // Linear values (a factor, not a colour).
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
      // The ceiling has the skylight's opening cut in it (it stays put as the room scales).
      const mesh = new THREE.Mesh(isCeil ? ceilingGeometry() : new THREE.PlaneGeometry(size.w, size.h), mat);
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.name = s;
      group.add(mesh);
      const writing = new THREE.Group();
      writing.position.z = 0.004;
      group.add(writing);
      if (!isFloor && !isCeil) {
        this.addSkirting(group, size.w, size.h);
        // Weathering over the plaster, under the writing; its strength is the look's.
        const wm = new THREE.MeshStandardMaterial({ color: 0x6a6259, roughness: 0.95, alphaMap: weatheringMap(s, size.w, size.h, seeds[s] + 500), transparent: true, depthWrite: false, opacity: 0 });
        const weather = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), wm);
        weather.position.z = 0.002;
        weather.receiveShadow = true;
        weather.name = 'weathering';
        group.add(weather);
        this.weathering.push(wm);
      }
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

    // Frosted glass — the only visible source of light — at the top of its well. Light through
    // it is even but not flat: a faint frosted mottle, a little brighter at the centre.
    const pc = document.createElement('canvas');
    pc.width = pc.height = 128;
    const pg = pc.getContext('2d')!;
    const grd = pg.createRadialGradient(64, 64, 6, 64, 64, 92);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#ecebe6');
    pg.fillStyle = grd;
    pg.fillRect(0, 0, 128, 128);
    const frost = pg.getImageData(0, 0, 128, 128);
    const fn = makeNoise(5);
    for (let j = 0; j < 128; j++)
      for (let i = 0; i < 128; i++) {
        // Clouded, as frosted glass is (the reference's is visibly mottled).
        const m = 1 + 0.12 * (fn.fbm(i / 22, j / 22, 4) - 0.5);
        for (let c = 0; c < 3; c++) frost.data[(j * 128 + i) * 4 + c] = Math.min(255, frost.data[(j * 128 + i) * 4 + c] * m);
      }
    pg.putImageData(frost, 0, 0);
    const ptex = new THREE.CanvasTexture(pc);
    ptex.colorSpace = THREE.SRGBColorSpace;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: ptex, emissiveIntensity: PANEL_GLOW, roughness: 1 });
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(GLASS, GLASS), panelMat);
    this.panel.rotation.x = Math.PI / 2;
    this.panel.position.set(PANEL.x, H + WELL_DEPTH - 0.001, PANEL.z);
    // The well's sides (unlit: coloured by the glass, so the dims and the cooling reach them).
    this.well = new THREE.Mesh(wellGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }));
    this.well.position.set(PANEL.x, H, PANEL.z);
    // A dark line round the opening, where the reveal meets the ceiling: darkest on the edge,
    // feathered a centimetre to either side (it also softens the bright edge on phones, which
    // render without antialiasing). Lit by the room, so it dims with it.
    const lip = new THREE.Mesh(
      lipGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x5f5a54, roughness: 0.95, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    lip.position.set(PANEL.x, H - 0.0005, PANEL.z);
    lip.renderOrder = 2;
    this.group.add(this.panel, this.well, lip);

    this.setScale(1);
  }

  private well: THREE.Mesh;
  private wellColour = new THREE.Color(0xffffff);
  private ceilingEmissive = new THREE.Color(0x23262a);
  private ceilingLit = 1;

  /** The look's share of the room: the ceiling's bounce, the plaster's relief. */
  setLook(look: Look) {
    this.ceilingBounce = look.ceiling;
    this.panelGlow = look.panel;
    for (const m of this.weathering) m.opacity = look.stains;
    for (const s of Object.keys(this.frames) as Surface[]) {
      const m = this.frames[s].mesh.material as THREE.MeshStandardMaterial;
      m.bumpScale = (s === 'floor' ? 0.5 : 0.9) * look.texture;
    }
    this.setWarmth(this.warmth);
  }
  private ceilingBounce = 1;
  private panelGlow = 1;
  private weathering: THREE.MeshStandardMaterial[] = [];
  private warmth = 0;

  /** The light's warmth as it is now (Lighting.warmthNow): the panel's glass, its well, the ceiling's bounce. */
  setWarmth(w: number) {
    this.warmth = w;
    ceilingFor(w, this.ceilingEmissive).multiplyScalar(this.ceilingBounce);
    (this.panel.material as THREE.MeshStandardMaterial).emissive.copy(panelFor(w));
    panelFor(w, this.wellColour).multiplyScalar(WELL_GLOW);
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
    (this.panel.material as THREE.MeshStandardMaterial).emissiveIntensity = PANEL_GLOW * this.panelGlow * panel;
    (this.frames.ceiling.mesh.material as THREE.MeshStandardMaterial).emissive.copy(this.ceilingEmissive).multiplyScalar(ceiling);
    (this.well.material as THREE.MeshBasicMaterial).color.copy(this.wellColour).multiplyScalar(this.panelGlow * panel);
  }

  /**
   * Grey trim, and the lines where planes meet. The artist's reference draws every junction as
   * a crisp dark line a centimetre or so wide (round 1 had softened them to a few centimetres of
   * shade; the reference is the standard): along the ceiling, down both corners, above the
   * skirting, and where the skirting stands on the floor. The skirting stands 1.5 cm proud, so
   * its top catches the light as a lit edge.
   */
  private addSkirting(group: THREE.Group, w: number, h: number) {
    const trim = new THREE.MeshStandardMaterial({ color: 0xaba69e, roughness: 0.6 });
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w, SKIRT, 0.015), trim);
    sk.position.set(0, -h / 2 + SKIRT / 2, 0.0075);
    sk.receiveShadow = true;
    sk.name = 'skirting';
    const above = new THREE.Mesh(new THREE.PlaneGeometry(w, SEAM), Room.seam('bottom'));
    above.position.set(0, -h / 2 + SKIRT + SEAM / 2, 0.0015);
    above.name = 'skirting';
    // On the board's face, where it meets the floor.
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(w, SEAM * 0.6), Room.seam('contact'));
    contact.position.set(0, -h / 2 + SEAM * 0.3, 0.0155);
    contact.name = 'skirting';
    // The board's rounded top edge catches the light: a lit lip a few millimetres deep.
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.005), Room.lipMaterial);
    lit.position.set(0, -h / 2 + SKIRT - 0.0025, 0.0152);
    lit.name = 'skirting';
    group.add(lit);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, SEAM), Room.seam('top'));
    top.position.set(0, h / 2 - SEAM / 2, 0.0015);
    top.name = 'skirting';
    group.add(sk, above, contact, top);
    // Down each corner (kept at the wall's ends as the room scales: `setScale`).
    for (const side of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.PlaneGeometry(SEAM, h), Room.seam(side < 0 ? 'left' : 'right'));
      corner.position.set((side * (w - SEAM)) / 2, 0, 0.0016);
      corner.name = 'corner';
      corner.userData.side = side;
      corner.userData.halfW = w / 2;
      group.add(corner);
    }
  }

  /** A line darkest at one edge, fading out across the strip: a crisp core, gone by its far side. */
  private static lipMaterial = new THREE.MeshStandardMaterial({ color: 0xcdc8bf, roughness: 0.5 });
  private static seams: Partial<Record<'top' | 'bottom' | 'left' | 'right' | 'contact', THREE.MeshStandardMaterial>> = {};
  private static seam(which: 'top' | 'bottom' | 'left' | 'right' | 'contact'): THREE.MeshStandardMaterial {
    const cached = Room.seams[which];
    if (cached) return cached;
    // Where the board stands on the floor: the same line, deeper.
    const edge = which === 'contact' ? 'bottom' : which;
    const across = edge === 'left' || edge === 'right';
    const c = document.createElement('canvas');
    c.width = across ? 64 : 1;
    c.height = across ? 1 : 64;
    const g = c.getContext('2d')!;
    // From the junction outward: a core a third of the strip wide (about a centimetre), then gone.
    const grd = across
      ? g.createLinearGradient(edge === 'left' ? 0 : 64, 0, edge === 'left' ? 64 : 0, 0)
      : g.createLinearGradient(0, edge === 'top' ? 0 : 64, 0, edge === 'top' ? 64 : 0);
    grd.addColorStop(0, 'rgb(120,120,120)');
    grd.addColorStop(0.25, 'rgb(95,95,95)');
    grd.addColorStop(0.45, 'rgb(25,25,25)');
    grd.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.MeshStandardMaterial({ color: which === 'contact' ? 0x4f4b46 : 0x7d7872, roughness: 0.95, alphaMap: t, transparent: true, depthWrite: false });
    Room.seams[which] = m;
    return m;
  }

  private ceilingAt = NaN;

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
      for (const o of f[k].group.children) {
        if (o.name === 'skirting' || o.name === 'weathering') o.scale.x = s;
        else if (o.name === 'corner') o.position.x = o.userData.side * (o.userData.halfW * s - SEAM / 2);
      }
    }
    f.floor.mesh.scale.set(s, s, 1);
    if (s !== this.ceilingAt) {
      this.ceilingAt = s;
      setCeilingGeometry(f.ceiling.mesh.geometry, f.ceiling.size.w * s, f.ceiling.size.h * s);
    }
  }

  /** The writer's hand under the lines on the walls (graphite drags and thumbs, painted once). */
  handMarks(lines: { surface: Surface; u: number; v: number; w: number; h: number }[]) {
    const seeds: Record<string, number> = { north: 101, east: 103, south: 107, west: 109 };
    for (const s of ['north', 'east', 'south', 'west'] as Surface[]) {
      const own = lines.filter((l) => l.surface === s);
      const map = (this.frames[s].mesh.material as THREE.MeshStandardMaterial).map as THREE.CanvasTexture | null;
      if (own.length && map) handMarks(map, own, seeds[s]);
    }
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
