import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { woodMaps, SEAT_V0 } from './wood';

/**
 * A plain hand-made ladder-back chair, modelled at a child's chair's measurements (seat 34 cm,
 * posts 72 cm) and shown at CHAIR_SCALE, the proportion of the artist's reference (seat about
 * 44 cm, posts about 92 cm): smallish, made by someone who cared. Square legs eased at the edges, back posts
 * raked back, a top rail and two slats, square stretchers, a seat of two boards. Wear is baked
 * into vertex colour: paler where hands and bodies touched it (the seat's front edge, the top
 * rail, every arris), darker in the joints and where it meets the floor.
 */

/**
 * A square bar from a to b (its length along the grain), eased at the arrises, tapering to
 * `taper` of its width at a (the foot).
 */
function squareBar(a: THREE.Vector3, b: THREE.Vector3, w: number, taper: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new RoundedBoxGeometry(w, len, w, 2, 0.0035);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / len + 0.5;
    const k = taper + (1 - taper) * t;
    pos.setXYZ(i, x * k, y, z * k);
    // Around the bar, v runs at half the texels per metre u does along it (it used to squeeze the
    // whole perimeter into a sliver, smearing the grain across the bar); inside the legs' half.
    uv.setXY(i, t * len * 2.2, (Math.atan2(z, x) / (2 * Math.PI) + 0.5) * 4 * w * 2.2);
  }
  edgeWear(g);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** A board bent along its width (z) and, for the crest, arched along its top edge. */
function bentBoard(w: number, h: number, t: number, bend: number, arch: number): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, t, 3, Math.min(t, h) * 0.45);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const k = 1 - (2 * x / w) ** 2;
    pos.setZ(i, pos.getZ(i) - bend * k);
    if (y > 0) pos.setY(i, y + arch * k);
  }
  g.computeVertexNormals();
  edgeWear(g);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * 2.2, uv.getY(k) * 0.08 + 0.3);
  return g;
}

/** The chair's size in the room against its modelled measurements (the reference's proportion). */
export const CHAIR_SCALE = 1.28;

export class Chair {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  /** Its contact with the floor, and the panel's shade under the seat (opacities set each frame with their lights). */
  readonly contact: THREE.Mesh;
  readonly seatShade: THREE.Mesh;
  /** Where the chair is meant to be; the nudge moves it away from here. */
  readonly home = new THREE.Vector3(0, 0, 0);
  baseYaw = 0.22;

  constructor() {
    const { map, rough, normal } = woodMaps(7);
    // Oiled, not lacquered: no clearcoat, and no sheen (a cloth lobe; it made the seat velvet).
    // The grain's relief from the scans (wood.ts), when they loaded.
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rough,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });

    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, m = new THREE.Matrix4()) => {
      g.applyMatrix4(m);
      parts.push(g);
    };

    // Seat: dished, a little wider at the front, softened edges.
    const seatTop = 0.345;
    const seat = new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
    {
      const pos = seat.attributes.position;
      // It overhangs the legs a little at the front and sides, its front edge a visible board.
      const W0 = 0.355, W1 = 0.395, D = 0.35, T = 0.032;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const front = z + 0.5; // 0 at back, 1 at front
        x *= W0 + (W1 - W0) * front;
        z *= D;
        y = y * T;
        if (y > 0) y -= 0.006 * (1 - (2 * x / W1) ** 2) * (1 - (2 * z / D) ** 2); // dished
        pos.setXYZ(i, x, y + seatTop - T / 2, z);
      }
      seat.computeVertexNormals();
      edgeWear(seat);
      const uv = seat.attributes.uv;
      // The seat has its own part of the wood: two boards, darker at the edges (wood.ts).
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.8, SEAT_V0 + uv.getY(k) * (1 - SEAT_V0));
    }
    add(seat);

    // Square legs, eased at the arrises, a little slimmer at the foot. The front pair stands
    // straight; the back pair runs on up into the posts, raked back.
    const W = 0.036;
    const postX = (y: number) => 0.152 - 0.012 * (y / 0.72);
    const postZ = (y: number) => -0.165 - 0.05 * (y / 0.72);
    for (const sx of [-1, 1]) {
      add(squareBar(new THREE.Vector3(sx * 0.162, 0.004, 0.152), new THREE.Vector3(sx * 0.16, 0.334, 0.142), W, 0.88));
      // Made by hand: the left post came out a little short. The posts run on above the top
      // rail and end in a rounded cap.
      const top = sx < 0 ? 0.748 : 0.76;
      add(squareBar(new THREE.Vector3(sx * postX(0), 0.004, postZ(0)), new THREE.Vector3(sx * postX(top), top, postZ(top)), W, 0.9));
      // A flattened dome, the post's own width.
      const cap = new RoundedBoxGeometry(W, W * 0.5, W, 3, W * 0.24);
      edgeWear(cap);
      const cuv = cap.attributes.uv;
      for (let k = 0; k < cuv.count; k++) cuv.setXY(k, cuv.getX(k) * W * 2.2 + 0.3, cuv.getY(k) * W * 2.2 * 0.5);
      add(cap, new THREE.Matrix4().makeTranslation(sx * postX(top), top + W * 0.2, postZ(top)));
    }

    // Back: a wider top rail and two slats, tenoned into the posts, following their rake.
    const lean = new THREE.Matrix4().makeRotationX(-Math.atan(0.05 / 0.716));
    const rail = (y: number, h: number, tilt = 0) => {
      const g = bentBoard(2 * postX(y) + 0.01, h, 0.018, 0.006, 0);
      const m = new THREE.Matrix4().makeTranslation(0, y, postZ(y) + 0.002).multiply(lean).multiply(new THREE.Matrix4().makeRotationZ(tilt));
      add(g, m);
    };
    rail(0.665, 0.052);
    // Made by hand: the middle slat went in not quite level.
    rail(0.575, 0.034, 0.055);
    rail(0.485, 0.034);

    // Stretchers: square too, low at the sides, a little higher across the front and back.
    const S = 0.022;
    const legAt = (sx: number, front: boolean, y: number) =>
      front ? new THREE.Vector3(sx * (0.162 - 0.002 * (y / 0.33)), y, 0.152 - 0.01 * (y / 0.33)) : new THREE.Vector3(sx * postX(y), y, postZ(y));
    add(squareBar(legAt(-1, true, 0.14), legAt(1, true, 0.14), S, 1));
    add(squareBar(legAt(-1, false, 0.14), legAt(1, false, 0.14), S, 1));
    for (const sx of [-1, 1]) add(squareBar(legAt(sx, true, 0.09), legAt(sx, false, 0.09), S, 1));

    // Merge and bake wear into vertex colour.
    const merged = mergeParts(parts);
    bakeWear(merged, seatTop);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Where it touches the floor: four small dark contacts under the feet (with the key light),
    // and under the seat the frosted panel's shade, the seat's own shape (with the panel's light:
    // the panel is almost overhead and three can't cast a shadow from it). Neither drifts, and
    // shouldn't: the key's shadow, which does, is separate. Without them the chair floats.
    const plane = (tex: THREE.Texture, name: string) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(CONTACT_M, CONTACT_M),
        new THREE.MeshBasicMaterial({ color: 0x1d1b19, alphaMap: tex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.0015;
      // After writing on the floor, so ink under the chair is shaded too.
      m.renderOrder = 3;
      m.name = name;
      this.group.add(m);
      return m;
    };
    const { feet, seat: seatShade } = contactTextures();
    this.contact = plane(feet, 'chair-contact');
    this.seatShade = plane(seatShade, 'chair-seat-shade');

    // Invisible proxy for gaze/click.
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.46), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.set(0, 0.4, -0.015);
    this.group.add(this.hit);

    this.group.rotation.y = this.baseYaw;
    // Built at a child's chair's measurements, shown at the artist's reference's: a plain, smallish
    // chair (seat 44 cm, posts 92 cm). Everything on it (the hit proxy, its contacts) scales with it.
    this.group.scale.setScalar(CHAIR_SCALE);
  }

  /**
   * Lean toward a world point: turn part of the way to face it (at most ~20°), and if it
   * already faces it, shift a few centimetres toward it instead.
   */
  turnToward(x: number, z: number, amount: number) {
    const p = this.group.position;
    const want = Math.atan2(x - p.x, z - p.z);
    let d = want - this.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.max(-0.35, Math.min(0.35, d * amount));
    this.group.rotation.y += turn;
    if (Math.abs(turn) < 0.08) {
      const len = Math.hypot(x - p.x, z - p.z) || 1;
      p.x += ((x - p.x) / len) * 0.06 * amount;
      p.z += ((z - p.z) / len) * 0.06 * amount;
    }
  }

  nudge(dx: number, dz: number, dyaw: number) {
    this.group.position.x += dx;
    this.group.position.z += dz;
    this.group.rotation.y += dyaw;
  }
}

const CONTACT_M = 0.7;

/**
 * The contacts, as alpha maps in the chair's own floor plan (rows run front-ward), baked per
 * pixel (canvas blur filters aren't everywhere).
 */
function contactTextures(): { feet: THREE.DataTexture; seat: THREE.DataTexture } {
  const N = 128, m = CONTACT_M / N;
  const feet = new Uint8Array(N * N * 4), seat = new Uint8Array(N * N * 4);
  const legs = [[-0.162, 0.152], [0.162, 0.152], [-0.152, -0.165], [0.152, -0.165]];
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      // Plane-local metres: x across, z toward the chair's front (the plane is laid face up).
      const x = (i + 0.5) * m - CONTACT_M / 2, z = CONTACT_M / 2 - (j + 0.5) * m;
      let f = 0;
      for (const [lx, lz] of legs) f = Math.max(f, 0.85 * (1 - sm(0, 0.032, Math.hypot(x - lx, z - lz))));
      // The seat's footprint, a rounded box, soft over about 5 cm.
      const dx = Math.abs(x) - 0.13, dz = Math.abs(z) - 0.115;
      const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - 0.04;
      const sh = 0.42 * (1 - sm(-0.03, 0.05, d));
      const k = (j * N + i) * 4;
      feet[k] = feet[k + 1] = feet[k + 2] = Math.round(f * 255);
      seat[k] = seat[k + 1] = seat[k + 2] = Math.round(sh * 255);
      feet[k + 3] = seat[k + 3] = 255;
    }
  const tex = (d: Uint8Array) => {
    const t = new THREE.DataTexture(d, N, N);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { feet: tex(feet), seat: tex(seat) };
}

/** Arrises (the rounded edges of a board) wear first: worn where the normal leaves the faces. */
function edgeWear(g: THREE.BufferGeometry) {
  const n = g.attributes.normal;
  const wear = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) wear[i] = Math.min(1, (1 - Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i)))) * 3);
  g.setAttribute('wear', new THREE.BufferAttribute(wear, 1));
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), wear = new Float32Array(n);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    if (g.attributes.wear) wear.set(g.attributes.wear.array as Float32Array, o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('wear', new THREE.BufferAttribute(wear, 1));
  return out;
}

/** Paler where touched and on the edges, darker in the joints and where it meets the floor. */
function bakeWear(g: THREE.BufferGeometry, seatTop: number) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const edge = g.attributes.wear;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let k = 1 + 0.35 * edge.getX(i);
    // Joints: old finish and dust gather where the stretchers go in and under the seat, and
    // every underside is darker (never handled, never polished).
    if (Math.abs(x) > 0.12 && y < seatTop - 0.02) {
      for (const yj of [0.09, 0.14]) k -= 0.22 * Math.exp(-(((y - yj) / 0.014) ** 2));
      k -= 0.25 * Math.exp(-(((y - (seatTop - 0.035)) / 0.018) ** 2));
    }
    if (nor.getY(i) < -0.5) k -= 0.3;
    // Upper faces answer the skylight: paler, polished by hands and use.
    if (nor.getY(i) > 0.5) k += 0.12;
    // Where the rails go into the posts.
    if (y > 0.46 && Math.abs(Math.abs(x) - 0.148) < 0.02) k -= 0.15;
    // Seat: worn pale across the front edge and in the middle where someone sat.
    if (Math.abs(y - seatTop) < 0.03) {
      k += 0.16 * Math.exp(-(((z - 0.15) / 0.035) ** 2)) * Math.exp(-((x / 0.17) ** 4));
      k += 0.08 * Math.exp(-(x * x + (z - 0.02) ** 2) / 0.012);
    }
    // Crest rail: where hands pulled the chair out, again and again.
    if (y > 0.62) k += 0.14 * Math.exp(-((x / 0.07) ** 2));
    // Feet: darker, from the floor.
    if (y < 0.06) k -= 0.18 * (1 - y / 0.06);
    if (y < 0.3) k -= 0.1 * (1 - y / 0.3);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
