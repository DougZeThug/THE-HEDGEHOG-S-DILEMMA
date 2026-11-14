import * as THREE from 'three';
import { ROOM } from '../core/room';
import { PHRASE_IDS } from '../content/ids';
import { setMemoryLight } from './presentation';
import type { AppContext } from './context';
import type { LivingFrame } from './livingFrame';
import type { Living } from './living';

/**
 * What a living memory does to the room's light: its sun coming into the room as it withdraws,
 * its hold on the chair's shadow, and the light that comes to the visitor at the end.
 */

/**
 * What stays: as a memory withdraws naturally, its sun comes into the room. It starts while the
 * painted sun is still half there, at the painted pane's size, place and slant, so one becomes
 * the other; then it is the kitchen-light memory's own light, fading on its own time.
 */
export function bleedMemory(ctx: AppContext, l: Living, frame: LivingFrame): void {
  const def = l.memory.prepared.def;
  if (l.bled || def.bleed !== PHRASE_IDS.kitchenLight || ctx.memoryLight.active) return;
  const c = l.memory.controller;
  if (frame.state !== 'withdrawing' || frame.position < c.sections.exit + (def.bleedAt ?? 2)) return;
  l.bled = true;
  const spill = frame.final['light.roomSpill'] ?? 1;
  if (spill <= 0) return;
  const pane = l.memory.prepared.pane;
  if (!pane) return;
  const at = ctx.memoryWindow.toWall(pane.x + (frame.final['layer:sun.x'] ?? 0), pane.y + (frame.final['layer:sun.y'] ?? 0));
  setMemoryLight(ctx, spill);
  ctx.memoryLight.startPane(l.anchor.group, at.x, at.y, (pane.w / 2) * at.scale, (pane.h / 2) * at.scale, pane.transom * at.scale, pane.mullion * at.scale, { attack: 3, hold: 4, release: 6 }, ctx.time, 0);
  ctx.memoryKey = l.key;
}

/**
 * A living memory's hold on the chair's shadow (Memory VII, docs/shadows.md: `room.shadow` and
 * `room.lamp`), from its last frame: the lamp is aimed at its painting's place on the wall, a
 * little under its middle. Nothing playing, or nothing held, and the shadow goes home by itself.
 */
export function holdChairShadow(ctx: AppContext): void {
  const m = ctx.lighting.memoryShadow;
  const l = ctx.living;
  const f = l?.memory.controller.frame?.final;
  // (And its night, The Drive Home's: nothing playing, the room's light comes back by itself.)
  ctx.lighting.night = f?.['room.night'] ?? 0;
  m.amount = f?.['room.shadow'] ?? 0;
  m.lamp = f?.['room.lamp'] ?? 1;
  if (!l || m.amount <= 0 || !ctx.memoryWindow.isPlaced) return;
  const p = ctx.memoryWindow.painting;
  l.anchor.group.updateWorldMatrix(true, false);
  l.anchor.group.localToWorld(m.at.set(p.cx, p.cy - 0.15 * p.h, 0));
}

/**
 * The Drive Home's end (docs/drive-home.md): as the indicator stops, the room's light comes to
 * the visitor first, before the chair: onto where they are looking, a little over a metre up, on
 * the wall they face or the floor before them, taken once and never following them; then back to
 * the chair by itself over half a minute (Lighting.leanTo). Not if they are already by the chair
 * (the light is there), never after a let go (compose: `lean`).
 */
export function leanToVisitor(ctx: AppContext, l: Living, lean: number): void {
  if (l.leaned || lean < 0.5) return;
  l.leaned = true;
  const eye = ctx.rig.restingEye;
  const chair = ctx.chair.group.position;
  if (Math.hypot(eye.x - chair.x, eye.z - chair.z) < 1.5) return;
  // Under reduced motion the room's light does not travel (as the kitchen's: light, not movement).
  if (ctx.prefs.reducedMotion) return;
  const dir = ctx.rig.camera.getWorldDirection(new THREE.Vector3()).setY(0);
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  // Where the look meets a wall (the room's box), at most 3 m ahead: the floor short of it.
  const hx = ROOM.halfW - 0.05, hz = ROOM.halfD - 0.05;
  let t = 3;
  if (dir.x > 1e-6) t = Math.min(t, (hx - eye.x) / dir.x);
  if (dir.x < -1e-6) t = Math.min(t, (-hx - eye.x) / dir.x);
  if (dir.z > 1e-6) t = Math.min(t, (hz - eye.z) / dir.z);
  if (dir.z < -1e-6) t = Math.min(t, (-hz - eye.z) / dir.z);
  const at = new THREE.Vector3(eye.x + dir.x * t, t < 2.95 ? 1.2 : 0, eye.z + dir.z * t);
  ctx.lighting.leanTo(at, ctx.time);
  ctx.announce('The light moves a little toward you.');
}
