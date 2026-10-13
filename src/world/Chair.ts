import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { woodMaps, SEAT_V0 } from './wood';

/**
 * A small hand-made ladder-back chair. Seat at 34 cm, finials at 72 cm: a child's chair,
 * too small for the visitor, made by someone who cared. Turned legs that splay a little,
 * back posts that lean and end in finials, an arched crest rail bent to fit a back, a
 * dished seat. Wear is baked into vertex colour: paler where hands and bodies touched it
 * (the seat's front edge, the middle of the crest rail), darker where it meets the floor.
 */

type Profile = [number, number][]; // [t, radius]

function radiusAt(p: Profile, t: number): number {
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const [t0, r0] = p[i - 1], [t1, r1] = p[i];
      const k = (t - t0) / (t1 - t0);
      const s = k * k * (3 - 2 * k);
      return r0 + (r1 - r0) * s;
    }
  }
  return p[p.length - 1][1];
}

/** A turned part: a tube along a curve whose radius follows a lathe profile. */
function turned(points: THREE.Vector3[], profile: Profile, segs = 64, radial = 14): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const tube = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = tube.attributes.position;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, centre);
    const r = radiusAt(profile, t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(r).add(centre);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  tube.computeVertexNormals();
  // Wear on the turning's high points (beads, the swell of a leg): where hands and shoes catch.
  const wear = new Float32Array(pos.count);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, d = 0.04;
    const bulge = radiusAt(profile, t) - (radiusAt(profile, Math.max(0, t - d)) + radiusAt(profile, Math.min(1, t + d))) / 2;
    for (let j = 0; j <= radial; j++) wear[i * (radial + 1) + j] = Math.max(0, Math.min(1, bulge / 0.0012));
  }
  tube.setAttribute('wear', new THREE.BufferAttribute(wear, 1));
  const len = curve.getLength();
  const uv = tube.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len * 2.2, uv.getY(k) * 0.12);
  return tube;
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

export class Chair {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  /** Its contact with the floor (opacity set each frame with the light that falls on it). */
  readonly contact: THREE.Mesh;
  /** Where the chair is meant to be; the nudge moves it away from here. */
  readonly home = new THREE.Vector3(0, 0, 0);
  baseYaw = 0.22;

  constructor() {
    const { map, rough } = woodMaps(7);
    // Oiled, not lacquered: no clearcoat, and no sheen (a cloth lobe; it made the seat velvet).
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rough,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
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
      const W0 = 0.33, W1 = 0.37, D = 0.315, T = 0.028;
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

    // Front legs: turned, splayed slightly outward and forward.
    const front: Profile = [[0, 0.0105], [0.12, 0.0135], [0.3, 0.0165], [0.5, 0.0128], [0.6, 0.017], [0.66, 0.0128], [0.92, 0.0145], [1, 0.012]];
    for (const sx of [-1, 1]) {
      add(turned([new THREE.Vector3(sx * 0.17, 0.004, 0.165), new THREE.Vector3(sx * 0.161, 0.17, 0.152), new THREE.Vector3(sx * 0.153, 0.334, 0.14)], front));
    }
    // Back legs run up into the back posts, leaning back, ending in finials.
    const back: Profile = [[0, 0.011], [0.08, 0.0145], [0.2, 0.0158], [0.42, 0.0145], [0.47, 0.0158], [0.52, 0.0136], [0.93, 0.0122], [0.965, 0.0098], [1, 0.011]];
    const postTop = (sx: number) => new THREE.Vector3(sx * 0.122, 0.705, -0.212);
    for (const sx of [-1, 1]) {
      add(
        turned(
          [
            new THREE.Vector3(sx * 0.158, 0.004, -0.17),
            new THREE.Vector3(sx * 0.146, 0.334, -0.135),
            new THREE.Vector3(sx * 0.134, 0.53, -0.162),
            postTop(sx),
          ],
          back,
          96,
        ),
      );
      const fin = new THREE.SphereGeometry(0.0158, 18, 12);
      fin.scale(1, 1.25, 1);
      fin.translate(postTop(sx).x, postTop(sx).y + 0.014, postTop(sx).z - 0.002);
      fin.setAttribute('wear', new THREE.BufferAttribute(new Float32Array(fin.attributes.position.count).fill(0.6), 1));
      add(fin);
    }

    // Back: an arched crest rail and two slats, bent to receive a back, following the lean.
    const lean = new THREE.Matrix4().makeRotationX(-0.13);
    const rail = (y: number, z: number, h: number, arch: number, bend: number, tilt = 0) => {
      const g = bentBoard(0.262, h, 0.013, bend, arch);
      const m = new THREE.Matrix4().makeTranslation(0, y, z).multiply(lean).multiply(new THREE.Matrix4().makeRotationZ(tilt));
      add(g, m);
    };
    rail(0.648, -0.196, 0.056, 0.014, 0.018);
    // Made by hand: the middle slat went in not quite level.
    rail(0.565, -0.175, 0.034, 0.004, 0.015, 0.012);
    rail(0.482, -0.158, 0.03, 0.002, 0.013);

    // Stretchers, slightly bowed, with a bead at the front.
    const stretch = (a: THREE.Vector3, b: THREE.Vector3, beaded: boolean) => {
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.002;
      const prof: Profile = beaded
        ? [[0, 0.0062], [0.42, 0.0074], [0.5, 0.0096], [0.58, 0.0074], [1, 0.0062]]
        : [[0, 0.006], [0.5, 0.0072], [1, 0.006]];
      add(turned([a, mid, b], prof, 32, 10));
    };
    const fl = (sx: number, y: number) => new THREE.Vector3(sx * (0.17 - (y / 0.334) * 0.017), y, 0.165 - (y / 0.334) * 0.025);
    const bl = (sx: number, y: number) => new THREE.Vector3(sx * (0.158 - (y / 0.334) * 0.012), y, -0.17 + (y / 0.334) * 0.035);
    stretch(fl(-1, 0.13), fl(1, 0.13), true);
    stretch(bl(-1, 0.12), bl(1, 0.12), false);
    for (const sx of [-1, 1]) {
      stretch(fl(sx, 0.085), bl(sx, 0.085), false);
      stretch(fl(sx, 0.175), bl(sx, 0.175), false);
    }

    // Merge and bake wear into vertex colour.
    const merged = mergeParts(parts);
    bakeWear(merged, seatTop);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Where it touches the floor: four small dark contacts under the feet and the faintest
    // shade under the seat. The soft shadow from the light can't make these (the frosted panel
    // casts none, and lights the floor under the chair): without them the chair floats.
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(CONTACT_M, CONTACT_M),
      new THREE.MeshBasicMaterial({ color: 0x2a2018, alphaMap: contactTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.0015;
    this.contact.renderOrder = 1;
    this.contact.name = 'chair-contact';
    this.group.add(this.contact);

    // Invisible proxy for gaze/click.
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.37;
    this.group.add(this.hit);

    this.group.rotation.y = this.baseYaw;
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

/** The contacts, as an alpha map in the chair's own floor plan (canvas rows run front-ward). */
function contactTexture(): THREE.CanvasTexture {
  const N = 128, ppm = N / CONTACT_M;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  const at = (x: number, z: number) => [N / 2 + x * ppm, N / 2 + z * ppm] as const;
  const spot = (x: number, z: number, r: number, a: number) => {
    const [px, py] = at(x, z);
    const grd = g.createRadialGradient(px, py, 0, px, py, r * ppm);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.45, `rgba(255,255,255,${a * 0.45})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, N, N);
  };
  // Under the seat: the frosted panel is almost overhead and casts no shadow of its own (three
  // can't), so the seat's shade from it is drawn here, the seat's shape, soft-edged. It doesn't
  // drift, and shouldn't: the panel never moves (the key's shadow, which does, is separate).
  g.save();
  g.filter = `blur(${0.05 * ppm}px)`;
  g.fillStyle = 'rgba(255,255,255,0.42)';
  const [sx, sy] = at(-0.17, -0.14);
  g.fillRect(sx, sy, 0.34 * ppm, 0.33 * ppm);
  g.restore();
  g.filter = 'none';
  for (const [x, z] of [[-0.17, 0.165], [0.17, 0.165], [-0.158, -0.17], [0.158, -0.17]]) spot(x, z, 0.032, 0.85);
  const t = new THREE.CanvasTexture(c);
  return t;
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
  const edge = g.attributes.wear;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let k = 1 + 0.2 * edge.getX(i);
    // Joints: old finish and dust gather where the stretchers go in and under the seat.
    if (Math.abs(x) > 0.12 && y < seatTop - 0.02) {
      for (const yj of [0.085, 0.12, 0.13, 0.175]) k -= 0.1 * Math.exp(-(((y - yj) / 0.012) ** 2));
      k -= 0.12 * Math.exp(-(((y - (seatTop - 0.035)) / 0.015) ** 2));
    }
    // Seat: worn pale across the front edge and in the middle where someone sat.
    if (Math.abs(y - seatTop) < 0.03) {
      k += 0.16 * Math.exp(-(((z - 0.15) / 0.035) ** 2)) * Math.exp(-((x / 0.17) ** 4));
      k += 0.08 * Math.exp(-(x * x + (z - 0.02) ** 2) / 0.012);
    }
    // Crest rail: where hands pulled the chair out, again and again.
    if (y > 0.62) k += 0.14 * Math.exp(-((x / 0.07) ** 2));
    // Finials, rubbed.
    if (y > 0.7) k += 0.08;
    // Feet: darker, from the floor.
    if (y < 0.06) k -= 0.18 * (1 - y / 0.06);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
