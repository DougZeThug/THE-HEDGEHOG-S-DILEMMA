import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { woodTexture } from './textures';

/**
 * A small turned-wood ladder-back chair — a child's chair, or a dollhouse chair grown
 * just big enough to be real. Seat height 33 cm, top of the back 66 cm: recognisably a
 * chair, too small for the visitor.
 */
export class Chair {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  /** Where the chair is meant to be; the nudge moves it away from here. */
  readonly home = new THREE.Vector3(0, 0, 0);
  baseYaw = 0.22;

  constructor() {
    const grain = woodTexture(5);
    const mat = new THREE.MeshPhysicalMaterial({
      map: grain,
      roughness: 0.58,
      clearcoat: 0.15,
      clearcoatRoughness: 0.55,
      sheen: 0.15,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color('#d9b48a'),
    });
    const seatGrain = grain.clone();
    seatGrain.needsUpdate = true;
    seatGrain.rotation = Math.PI / 2;
    seatGrain.center.set(0.5, 0.5);
    const seatMat = mat.clone();
    seatMat.map = seatGrain;
    seatMat.roughness = 0.6; // worn where people sat

    const seatH = 0.33;
    const seatW = 0.34;
    const seatD = 0.31;
    const add = (m: THREE.Mesh) => {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };

    // Seat — a slightly dished board with softened edges.
    const seat = add(new THREE.Mesh(new RoundedBoxGeometry(seatW, 0.026, seatD, 3, 0.008), seatMat));
    seat.position.set(0, seatH, 0);

    // Turned legs: lathe profiles with a bead and a taper.
    const frontProfile = this.turnedProfile(seatH, false);
    const backProfile = this.turnedProfile(0.66, true);
    const legGeoF = new THREE.LatheGeometry(frontProfile, 14);
    const legGeoB = new THREE.LatheGeometry(backProfile, 14);
    const lx = seatW / 2 - 0.022;
    const lzF = seatD / 2 - 0.022;
    const lzB = -seatD / 2 + 0.02;
    for (const sx of [-1, 1]) {
      add(new THREE.Mesh(legGeoF, mat)).position.set(sx * lx, 0, lzF);
      const back = add(new THREE.Mesh(legGeoB, mat));
      back.position.set(sx * lx, 0, lzB);
      back.rotation.x = -0.05; // a little rake
    }

    // Curved back slats.
    for (const [i, y] of [0.44, 0.52, 0.6].entries()) {
      const slat = add(new THREE.Mesh(this.curvedSlat(lx * 2 - 0.012, 0.034 - i * 0.003, 0.011), mat));
      slat.position.set(0, y, lzB - (y - 0.0) * 0.05 - 0.004);
    }

    // Stretchers.
    const stretch = (len: number, r: number) => new THREE.CylinderGeometry(r, r, len, 10);
    const sideLen = lzF - lzB;
    for (const sx of [-1, 1]) {
      const s1 = add(new THREE.Mesh(stretch(sideLen, 0.0065), mat));
      s1.rotation.x = Math.PI / 2;
      s1.position.set(sx * lx, 0.1, (lzF + lzB) / 2);
      const s2 = add(new THREE.Mesh(stretch(sideLen, 0.006), mat));
      s2.rotation.x = Math.PI / 2;
      s2.position.set(sx * lx, 0.17, (lzF + lzB) / 2);
    }
    const front = add(new THREE.Mesh(stretch(lx * 2, 0.0065), mat));
    front.rotation.z = Math.PI / 2;
    front.position.set(0, 0.14, lzF);
    const backS = add(new THREE.Mesh(stretch(lx * 2, 0.006), mat));
    backS.rotation.z = Math.PI / 2;
    backS.position.set(0, 0.12, lzB);

    // Invisible proxy for gaze/click.
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.35;
    this.group.add(this.hit);

    this.group.rotation.y = this.baseYaw;
  }

  private turnedProfile(h: number, back: boolean): THREE.Vector2[] {
    const pts: [number, number][] = back
      ? [
          [0.0, 0], [0.012, 0], [0.0135, 0.02], [0.0125, 0.1], [0.016, 0.13], [0.0125, 0.16], [0.0135, 0.3],
          [0.016, 0.335], [0.0125, 0.37], [0.0115, 0.6], [0.014, 0.625], [0.0105, 0.64], [0.012, 0.652], [0.006, 0.66], [0.0, h],
        ]
      : [
          [0.0, 0], [0.0115, 0], [0.013, 0.02], [0.012, 0.1], [0.0165, 0.14], [0.012, 0.18], [0.0125, 0.28], [0.015, 0.31], [0.013, h - 0.005], [0.0, h],
        ];
    return pts.map(([r, y]) => new THREE.Vector2(r, y));
  }

  private curvedSlat(w: number, h: number, t: number): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(w, h, t, 16, 1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, pos.getZ(i) - (1 - (2 * x / w) ** 2) * 0.012);
    }
    g.computeVertexNormals();
    return g;
  }

  nudge(dx: number, dz: number, dyaw: number) {
    this.group.position.x += dx;
    this.group.position.z += dz;
    this.group.rotation.y += dyaw;
  }
}
