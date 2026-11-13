import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ROOM } from '../core/room';
import { PANEL } from './Room';
import type { Environment } from '../core/environment';
import { approach } from '../core/math';
import { QUALITY, type Quality } from './quality';
import { LIGHT_WHITE, lookFor, neutralFor, type Look } from './Style';

/** One frosted overhead source does nearly all the work; the fill is only bounce. */
/** The lights were set for a 3.1 m ceiling; from higher they fall off with distance. */
const REACH = (ROOM.height / 3.1) ** 2;
const AREA = 8 * REACH;
const KEY = 44 * REACH;
const HEMI = 1.15;

/** VSM blur radius, in texels of a 512 map (the radius scales with the map, so the penumbra doesn't). */
const SHADOW_RADIUS = 5;

/** What may change before the shadow is redrawn: key and target (m), cone (rad), chair (m, rad), blur, map. */
const SIG_TOL = [0.003, 0.003, 0.003, 0.003, 0.003, 0.003, 0.002, 0.002, 0.003, 0.01, 0.5];
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Where a memory takes the key when it holds the chair's shadow (Memory VII): a lamp low behind
 * the chair, this far from it on the side away from the memory's wall and this high (m), so the
 * chair's shadow is thrown up onto the wall, enlarged (the chair's back, 0.9 m, to about 2 m on a
 * wall 3.2 m away); its cone this narrow (rad: onto the wall, never a hot spot on the floor by the
 * lamp); its strength this much of the key's (the wall is further from it than the floor is from
 * the ceiling). Low, it lights the wall and leaves the floor between in its own shadow, as a lamp
 * on the floor does (the cinematic director's review, 2026-11-09).
 */
const LAMP = { out: 1.15, y: 0.42, cone: 0.36, gain: 1.4 };

const COOL = new THREE.Color('#dbe6f0');
const WARM = new THREE.Color('#ffdcb4');
/** Night in the room (The Drive Home): its light a cool moon-blue, against the streetlights' sodium. */
const NIGHT = new THREE.Color('#8fa6c8');
/**
 * The room's light coming to the visitor first as it returns (The Drive Home, docs/drive-home.md):
 * seconds to come, to stay, to go back to the chair; how far its cone narrows onto them.
 */
const LEAN = { attack: 6, hold: 4, release: 30, narrow: 0.3 };

/**
 * One visible source (the ceiling panel) lights the room. A soft area light gives the
 * walls their gradients; a separate shadow-casting spot gives the chair its shadow —
 * which is why the shadow can quietly stop agreeing with the light.
 */
export class Lighting {
  readonly group = new THREE.Group();
  readonly area: THREE.RectAreaLight;
  readonly key: THREE.SpotLight;
  readonly hemi: THREE.HemisphereLight;
  readonly glow: THREE.PointLight;
  /**
   * The skylight's glow in the room's upper air: light that has come through the frosted glass
   * and spreads, washing the ceiling round the opening and the top of the walls nearest it,
   * brightest at the top centre of the wall behind the chair and falling away down and to the
   * corners (the artist's reference is lit so). Unshadowed; part of the look.
   */
  readonly skyGlow: THREE.PointLight;
  /** Warmth left behind at a place on the floor (not at the chair). */
  readonly residue: THREE.PointLight;
  private residueFade: { amount: number; start: number; seconds: number } | null = null;
  private keyBase = new THREE.Vector3(PANEL.x, ROOM.height - 0.06, PANEL.z);
  private cur = { intensity: 1, warmth: 0, drift: 0, glow: 0.2, extraWarm: 0, extraCold: 0 };
  private flash: { kind: 'warm' | 'cold'; amount: number; until: number; start: number } | null = null;
  intensityScale = 1;
  /** The room's look (Style.ts): light levels and colour at rest. */
  look: Look = lookFor('reference');
  private neutral = new THREE.Color();
  private col = new THREE.Color();
  private white = new THREE.Color(0xffffff);
  /** Opening sequence multiplier. */
  fade = 1;
  /**
   * The opening score's hold on each light (1 = as the room has it). The key light can start
   * narrower, so at first only the chair and the floor under it are lit — never narrower than
   * a fixture's own throw, or it reads as a stage spotlight.
   */
  readonly score = { key: 1, area: 1, hemi: 1, glow: 1, cone: 0.82 };
  /**
   * Light as a motif later in the visit: the room's own light (panel and sky) goes down until
   * only the chair is lit, as it was at the start, then comes back. The key light is untouched,
   * except by a recoil's `key` (the chair's own light dipping, docs/reviews/2026-11-core-loop.md).
   */
  private dimming: { from: number; to: number; start: number; seconds: number; rise?: number; fall?: number; glow?: number; key?: number } | null = null;
  /** How much of the chair's own glow, and of its key light, a recoil leaves (1 = all of it). */
  private glowKept = 1;
  private keyKept = 1;
  private mood = 1;
  /**
   * A memory's hold on the chair's shadow (Memory VII, docs/shadows.md): the room's one cast shadow
   * is the first thing to move, and the shadow puppet's lamp is the room's own key. `amount` 0 is
   * the room's light; 1 the key come down behind the chair, low, on the line from the memory's
   * place on the wall (`at`, world) through the chair, narrowed onto that place: the chair's shadow
   * crosses the floor, climbs the skirting and stands on the wall there, enlarged. `lamp` is how
   * strong that low light is (0..1: it gives way to the memory's own light while the film plays).
   * Set every frame a memory holds it; let go, it eases back on its own.
   */
  readonly memoryShadow = { amount: 0, lamp: 1, at: new THREE.Vector3(0, 1.2, -ROOM.halfD) };
  private heldShadow = { amount: 0, lamp: 1 };
  /** How much the room's light is night now (0..1): set every frame a memory holds it, eased. */
  night = 0;
  private nightHeld = 0;
  /**
   * The room's light come to the visitor (`leanTo`): the key's aim taken off the chair onto a point
   * (world) by them, its cone narrowed a little, and given back to the chair by itself. Its own
   * clock: it outlives the memory that began it.
   */
  private lean: { at: THREE.Vector3; start: number; back?: { from: number; at: number; over: number } } | null = null;
  /** How far the light has come to the visitor now (0..1). */
  leanNow = 0;

  constructor(quality: Quality) {
    RectAreaLightUniformsLib.init();
    this.area = new THREE.RectAreaLight(LIGHT_WHITE, AREA, 0.9, 0.9);
    this.area.position.set(PANEL.x, ROOM.height - 0.02, PANEL.z);
    this.area.lookAt(PANEL.x, 0, PANEL.z);
    this.group.add(this.area);

    this.hemi = new THREE.HemisphereLight(0xeef1f4, 0xd8d0c4, HEMI);
    this.group.add(this.hemi);

    this.key = new THREE.SpotLight(LIGHT_WHITE, KEY, 0, 0.82, 1, 2);
    this.key.position.copy(this.keyBase);
    this.key.target.position.set(0, 0, 0);
    this.key.castShadow = true;
    const size = QUALITY[quality].shadowMap;
    this.key.shadow.mapSize.set(size, size);
    // Only the chair casts a shadow, so the shadow's camera looks at the middle of the cone,
    // not all of it (a 115° frustum spent most of the map on bare floor): its texels shrink
    // from about 18 mm to 5 mm on a phone, and the chair's shadow keeps its seat and legs.
    this.key.shadow.focus = 0.4;
    // Soft, frosted-source shadow (VSM blur): a penumbra of a few centimetres at the floor,
    // the same on every device (the blur is in texels, so it scales with the map).
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.01;
    this.key.shadow.radius = SHADOW_RADIUS * (size / 512);
    this.key.shadow.blurSamples = 20;
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 8;
    this.group.add(this.key, this.key.target);

    this.skyGlow = new THREE.PointLight(0xfff1de, 0, 0, 2);
    // Low enough (a metre under the glass) that the ceiling is washed broadly, not spotted, and a
    // little toward the wall behind the chair, which it lights from the top down.
    this.skyGlow.position.set(PANEL.x, ROOM.height - 1.0, PANEL.z - 0.9);
    this.group.add(this.skyGlow);

    this.glow = new THREE.PointLight(0xffd2a6, 0.0, 2.0, 1.8);
    this.glow.position.set(0, 0.7, 0.25);
    this.group.add(this.glow);
    this.residue = new THREE.PointLight(0xffcf9c, 0, 1.4, 2);
    this.residue.position.set(0, 0.22, 0);
    this.group.add(this.residue);
  }

  triggerFlash(kind: 'warm' | 'cold', amount: number, seconds: number, now: number) {
    this.flash = { kind, amount, until: now + seconds, start: now };
  }

  /** Take the room back to the chair alone (area and sky to `to`) for `seconds`, then return. */
  dimToChair(to: number, seconds: number, now: number, o: { fall?: number; rise?: number; delay?: number; glow?: number; key?: number } = {}) {
    // From wherever the light is now: a second dim during a first never lifts the room first.
    // (A recoil: `delay` after its sound, quicker down (`fall`), the chair's glow taken with it.)
    this.dimming = { from: this.mood, to: Math.min(to, this.mood), start: now + (o.delay ?? 0), seconds, rise: o.rise, fall: o.fall, glow: o.glow, key: o.key };
  }

  /** A dim let go early (a vignette interrupted; a held silence left): the room's light comes back over `seconds`, from where it is. */
  liftDim(now: number, seconds = 4) {
    if (!this.dimming) return;
    this.dimming = { from: this.mood, to: this.mood, start: now, seconds, rise: seconds };
  }

  /** Back to the room's own light at once (returning after leaving). */
  cancelDim() {
    this.dimming = null;
    this.mood = 1;
    this.night = this.nightHeld = 0;
    this.cancelLean();
  }

  /** The room's light comes to `at` (world: by the visitor) first, then back to the chair by itself. */
  leanTo(at: THREE.Vector3, now: number) {
    this.lean = { at: at.clone(), start: now };
  }

  /**
   * The light goes back to the chair from wherever it is, over `over` s (another memory begins
   * while it is still on its way back: no jump of the key, QA 2026-11-09).
   */
  leanHome(now: number, over = 2.5) {
    const l = this.lean;
    if (!l || this.leanNow <= 0) return this.cancelLean();
    l.back = { from: this.leanNow, at: now, over };
  }

  /** At once, the light is the chair's again (reduced motion turned on, leaving). */
  cancelLean() {
    this.lean = null;
    this.leanNow = 0;
  }

  /** The room's light, apart from the key, as a fraction of itself (for tests and the inspector). */
  get roomLight() {
    return this.mood;
  }

  /** Leave a faint warmth at a floor point (world x, z) that fades over `seconds`. */
  leaveResidue(x: number, z: number, amount: number, seconds: number, now: number) {
    this.residue.position.set(x, 0.22, z);
    this.residueFade = { amount, start: now, seconds };
  }

  update(dt: number, env: Environment, now: number, chairPos: THREE.Vector3, chairYaw = 0) {
    if (this.residueFade) {
      const f = this.residueFade;
      const t = (now - f.start) / f.seconds;
      // Rises over a few seconds, then thins away slowly.
      const e = t >= 1 ? 0 : Math.min(1, (now - f.start) / 4) * (1 - t) * (1 - t);
      this.residue.intensity = f.amount * 1.1 * e * this.intensityScale * this.fade;
      if (t >= 1) this.residueFade = null;
    }
    let mood = this.dimming && now < this.dimming.start ? this.mood : 1;
    let glowKept = 1;
    let keyKept = 1;
    if (this.dimming && now >= this.dimming.start) {
      const d = this.dimming;
      const t = now - d.start;
      if (t >= d.seconds) this.dimming = null;
      else {
        // Down over 3 s, held, back over 4 s: slow enough to read as the room, not a fault.
        const s = (x: number) => x * x * (3 - 2 * x);
        const down = s(Math.min(1, t / (d.fall ?? 3))), up = s(Math.max(0, Math.min(1, (d.seconds - t) / (d.rise ?? 4))));
        const level = d.from + (d.to - d.from) * down;
        mood = 1 - (1 - level) * up;
        if (d.glow) glowKept = 1 - d.glow * down * up;
        if (d.key) keyKept = 1 - d.key * down * up;
      }
    }
    this.mood = mood;
    // (Eased, so a dim that replaces a recoil's never snaps the chair's glow or key back in a frame.)
    this.glowKept = approach(this.glowKept, glowKept, dt, 0.25);
    this.keyKept = approach(this.keyKept, keyKept, dt, 0.25);
    const c = this.cur;
    c.intensity = approach(c.intensity, env.lightIntensity, dt, 3);
    c.warmth = approach(c.warmth, env.lightWarmth, dt, 4);
    c.drift = approach(c.drift, env.shadowDrift, dt, 6);
    c.glow = approach(c.glow, env.chairGlow, dt, 3);

    let fw = 0, fc = 0;
    if (this.flash) {
      const f = this.flash;
      if (now > f.until) this.flash = null;
      else {
        const t = (now - f.start) / (f.until - f.start);
        const env2 = Math.sin(Math.PI * Math.min(1, t)) * f.amount;
        if (f.kind === 'warm') fw = env2;
        else fc = env2;
      }
    }
    c.extraWarm = approach(c.extraWarm, fw, dt, 1.5);
    c.extraCold = approach(c.extraCold, fc, dt, 1.5);

    const w = THREE.MathUtils.clamp(c.warmth + c.extraWarm - c.extraCold, -1, 1);
    // (Night comes as dusk does and lifts as morning does; the memory sets where it goes.)
    this.nightHeld = approach(this.nightHeld, THREE.MathUtils.clamp(this.night, 0, 1), dt, 0.8);
    const sc = this.score;
    const L = this.look;
    // How much of the room's own light there is: none while the opening holds only the chair lit,
    // less in a dim (the room going back to the chair alone). The look belongs to the lit room:
    // its cream and its balance come with the room and go with it, so the chair-alone image (the
    // opening's, and the dim's quotation of it) is white light on a dark room, as it always was.
    const lit = THREE.MathUtils.clamp(sc.area, 0, 1) * mood;
    // At rest the light is the look's colour. As the Director cools it (the visitor close, the
    // room hardening) the cream goes first: by lightWarmth -0.6 the light is exactly as cool as it
    // was before the look, so a warmer room has lost none of its range.
    this.warmthNow = L.warmth * lit * THREE.MathUtils.clamp(1 + w / 0.6, 0, 1);
    const col = this.col.copy(neutralFor(this.warmthNow, this.neutral));
    if (w > 0) col.lerp(WARM, w * 0.75);
    else col.lerp(COOL, -w * 0.85);
    if (this.nightHeld > 1e-3) col.lerp(NIGHT, 0.6 * this.nightHeld);

    const k = this.intensityScale * this.fade;
    const I = c.intensity * (1 + c.extraCold * 0.15);
    // The key on the chair: weighted by the opening only (a dim never touches the key; a recoil's `key` dips it, keyKept).
    const room = THREE.MathUtils.clamp(sc.area, 0, 1);
    const as = (m: number) => 1 + (m - 1) * room;
    // The room's own light: weighted by the dim (the area light's own level is already zero while
    // the opening holds it dark, so its ramp keeps the opening's curve).
    const asLit = (m: number, by: number) => 1 + (m - 1) * by;
    this.area.color.copy(col);
    this.area.intensity = AREA * I * k * sc.area * mood * asLit(L.area, mood);
    this.key.color.copy(col);
    this.key.intensity = KEY * I * k * (1 + c.extraCold * 0.4) * sc.key * as(L.key) * this.keyKept;
    this.key.angle = sc.cone * as(L.cone);
    this.hemi.color.copy(col).lerp(this.white, 0.4);
    this.hemi.intensity = HEMI * (0.75 + 0.25 * I) * k * sc.hemi * mood * asLit(L.fill, lit);
    this.glow.intensity = (0.1 + c.glow * 0.7 + c.extraWarm * 1.2) * k * sc.glow * as(L.glow) * this.glowKept;
    // The skylight's glow belongs to the lit room: it comes and goes with the room's own light.
    this.skyGlow.color.copy(col);
    this.skyGlow.intensity = L.skyGlow * I * k * lit;

    // The shadow drifts: the key light orbits the chair a little, the visible panel does not.
    const ang = c.drift * (1 + 0.25 * Math.sin(now * 0.05));
    const rel = this.rel.copy(this.keyBase).sub(this.flat.copy(chairPos).setY(0));
    rel.applyAxisAngle(UP, ang);
    this.key.position.copy(chairPos).setY(0).add(rel);
    this.key.target.position.copy(chairPos);
    this.key.target.position.z -= this.look.aim;
    // The cone is aimed past the chair (`aim`), so the shadow's camera must see that much further
    // forward, or the chair's shadow ends in a straight edge just in front of its front legs.
    this.key.shadow.focus = 0.4 * (1 + Math.max(0, this.look.aim));
    this.leanToward(now);
    this.holdShadow(dt, chairPos);
    this.glow.position.set(chairPos.x, 0.7, chairPos.z + 0.25);
    // The shadow map is redrawn only when what it shows changes: the light moved or widened, or
    // the chair moved or turned (its blur reads a million texels twenty times on every redraw).
    // Tolerances are what the eye can't see: 3 mm of key light moves the shadow under 1 mm.
    const kp = this.key.position, tg = this.key.target.position;
    this.key.shadow.radius = SHADOW_RADIUS * (this.key.shadow.mapSize.x / 512) * as(this.look.shadowSoft);
    const cur = this.sigNow;
    cur[0] = kp.x; cur[1] = kp.y; cur[2] = kp.z; cur[3] = tg.x; cur[4] = tg.z;
    cur[5] = this.key.angle; cur[6] = chairPos.x; cur[7] = chairPos.z; cur[8] = chairYaw;
    cur[9] = this.key.shadow.radius; cur[10] = this.key.shadow.mapSize.x;
    const sig = this.shadowSig;
    let dirty = false;
    for (let i = 0; i < cur.length; i++) if (!(Math.abs(cur[i] - sig[i]) <= SIG_TOL[i])) dirty = true;
    this.shadowDirty = dirty;
    if (dirty) sig.set(cur);
  }

  /**
   * A memory's hold on the chair's shadow, eased (quick to follow its timeline, slow to let go if
   * it ends early): the key moved from where the room has it to the lamp's place behind the chair,
   * its cone narrowed and aimed at the memory's place on the wall, its shadow's camera fitted to the
   * cone. (Its own light, moved, not a new lamp: no warmth of its own; the skeptic's review.)
   */
  private holdShadow(dt: number, chairPos: THREE.Vector3) {
    const m = this.memoryShadow, h = this.heldShadow;
    const amt = THREE.MathUtils.clamp(m.amount, 0, 1);
    h.amount = approach(h.amount, amt, dt, amt > h.amount ? 0.3 : 2.5);
    h.lamp = approach(h.lamp, THREE.MathUtils.clamp(m.lamp, 0, 1), dt, 0.3);
    this.lampLevel = 1;
    if (h.amount < 1e-3) return;
    const e = h.amount * h.amount * (3 - 2 * h.amount);
    const away = this.flat.copy(chairPos).sub(m.at).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    away.normalize();
    // Round the chair, not through it: angle, reach and height each eased (a straight line from
    // overhead passed over the chair for a north wall, its shadow shrinking to nothing and
    // flipping: the technical artist's review, 2026-11-09).
    const k = this.key.position;
    const dx = k.x - chairPos.x, dz = k.z - chairPos.z;
    const a0 = Math.atan2(dz, dx), r0 = Math.hypot(dx, dz);
    const a1 = Math.atan2(away.z, away.x);
    let da = a1 - a0;
    da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
    const a = a0 + da * e, r = r0 + (LAMP.out - r0) * e;
    k.set(chairPos.x + Math.cos(a) * r, k.y + (LAMP.y - k.y) * e, chairPos.z + Math.sin(a) * r);
    this.key.target.position.lerp(m.at, e);
    this.key.angle += (LAMP.cone - this.key.angle) * e;
    this.key.shadow.focus += (1 - this.key.shadow.focus) * e;
    this.lampLevel = 1 + (LAMP.gain * h.lamp - 1) * e;
    this.key.intensity *= this.lampLevel;
  }

  /**
   * The room's light come to the visitor (`leanTo`): its aim eased off the chair onto their point,
   * held, then back; the cone a little narrower while it is there, so what it falls on is seen to
   * be lit, and the shadow's camera fitted to it as it moves (a cut-off edge otherwise: the
   * technical artist's review, 2026-11-09).
   */
  private leanToward(now: number) {
    const l = this.lean;
    if (!l) return;
    const t = now - l.start;
    const s = (x: number) => x * x * (3 - 2 * x);
    const b = l.back;
    if (b && now - b.at >= b.over) {
      this.cancelLean();
      return;
    }
    const e = b ? b.from * s(1 - (now - b.at) / b.over) : t < 0 ? 0 : t < LEAN.attack ? s(t / LEAN.attack) : t < LEAN.attack + LEAN.hold ? 1 : s(Math.max(0, 1 - (t - LEAN.attack - LEAN.hold) / LEAN.release));
    if (t >= LEAN.attack + LEAN.hold + LEAN.release) {
      this.cancelLean();
      return;
    }
    this.leanNow = e;
    this.key.target.position.lerp(l.at, e);
    this.key.angle *= 1 - LEAN.narrow * e;
    this.key.shadow.focus += (1 - this.key.shadow.focus) * e;
  }

  /** How much of the room's usual key light falls on the chair now (1 = as the room has it). */
  get keyLevel() {
    return this.look.key > 0 ? this.key.intensity / this.lampLevel / (KEY * 0.85 * this.look.key) : 0;
  }

  /** What a memory's hold has done to the key's strength (1: nothing). */
  private lampLevel = 1;

  /** The look's warmth as it is now (0 white … 1 cream): the panel's glass and the ceiling follow it. */
  warmthNow = 0;

  /** How much of the room's usual panel (area) light there is now (1 = as the room has it). */
  get panelLevel() {
    return Math.min(1, this.score.area * this.mood);
  }

  /** Draw the shadow map again next frame, whatever moved (quality changed, GL context restored). */
  invalidateShadow() {
    this.shadowSig.fill(Infinity);
    this.shadowDirty = true;
  }

  /** The key light or the chair changed since the shadow map was last drawn. */
  shadowDirty = true;
  private shadowSig = new Float64Array(11).fill(Infinity);
  private sigNow = new Float64Array(11);
  private rel = new THREE.Vector3();
  private flat = new THREE.Vector3();
}
