/**
 * Building the room, once, behind the black threshold: fonts and material scans first, then the
 * renderer, the room, the chair, the light, the writing, the camera, the Director and the grade.
 * Everything comes out defined; nothing is filled in later.
 */
import { PHRASE_IDS } from '../content/ids';
import * as THREE from 'three';
import { Room } from '../world/Room';
import { loadScans, releaseScans } from '../world/scans';
import { Chair } from '../world/Chair';
import { Lighting } from '../world/Lighting';
import { MemoryLight } from '../world/MemoryLight';
import { StreetLight } from '../world/StreetLight';
import { MemoryWindow } from '../world/MemoryWindow';
import { Immersion } from '../world/living/Immersion';
import { Inside } from '../world/living/Inside';
import { warmLiving } from '../world/living/materials';
import { WallText } from '../world/WallText';
import { CameraRig } from '../world/CameraRig';
import { Post } from '../world/Post';
import { QUALITY } from '../world/quality';
import { FONTS_TO_LOAD } from '../world/textures';
import { Director, returnYaw } from '../state/Director';
import { THRESHOLD_LINES } from '../content/relations';
import { readTrace, readHeartAnswer, readMemoryCounts, type Prefs } from '../ui/prefs';
import { ignored, withTimeout } from '../core/time';
import { isHeartKey } from '../state/writeKeys';
import type { Dom } from '../ui/dom';
import type { AppContext, World } from './context';

/** The fonts get at most this long (ms), then the scans a little more: the room never waits longer. */
const FONTS_MS = 4000;
const SCANS_MS = 1500;

export interface Built {
  world: World;
  immersion: Immersion;
}

export async function buildWorld(params: URLSearchParams, dom: Dom, prefs: Prefs, visits: number): Promise<Built> {
  const seedParam = Number(params.get('seed'));
  // Each visit its own draw (`?seed=` fixes it): by visit count alone, every first visit anyone
  // ever made drew the same room (docs/reviews/2026-11-core-loop.md).
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 1 + Math.floor(Math.random() * 2 ** 30);
  dom.thresholdLine.textContent = THRESHOLD_LINES[Math.min(THRESHOLD_LINES.length - 1, visits)];

  // The fonts (at most four seconds), then the material scans the room's surfaces are baked with
  // (scans.ts), which get at most a second and a half more: on a slow connection the room bakes
  // without them, as before, rather than keep the visitor at the threshold.
  const scans = loadScans();
  // (A font that will not load must not hold the door: the room writes in whatever the browser has.)
  await withTimeout(Promise.all(FONTS_TO_LOAD.map((f) => document.fonts.load(f).catch(ignored))), FONTS_MS, null);
  await withTimeout(scans, SCANS_MS, null);

  const renderer = createRenderer(dom);
  const scene = new THREE.Scene();
  const room = new Room(prefs.quality);
  const chair = new Chair();
  releaseScans();
  const lighting = new Lighting(prefs.quality);
  const text = new WallText(room, 4242);
  scene.add(room.group, chair.group, lighting.group, text.air);
  scene.background = new THREE.Color(0xf3f2ef);
  const rig = new CameraRig(innerWidth / innerHeight);

  const forced = params.get('situations')?.split(',').map((s) => s.trim()).filter(Boolean);
  const trace = visits > 0 ? readTrace() : null;
  // Design experiments for inspection (`?exp=a,b`): only those this build defines.
  const wanted = params.get('exp')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const unknown = wanted.filter((e) => !Director.EXPERIMENTS.includes(e));
  if (unknown.length) console.warn(`[hedgehog] no such experiment: ${unknown.join(', ')} (defined: ${Director.EXPERIMENTS.join(', ') || 'none'})`);
  const director = new Director({
    seed,
    visits: visits + 1,
    trace,
    // What the last visit's heart left is found beside the first line again.
    answer: visits > 0 ? readHeartAnswer() : null,
    memoryCounts: readMemoryCounts(),
    situations: forced,
    experiments: wanted,
    // Is a piece of writing in view (the heart's line is found, never written in front of them).
    inView: (id) => {
      // (The heart's answer is read once it is all there: not while the hand is still writing it.)
      if (isHeartKey(id) && text.writing(id)) return false;
      const c = text.centreOf(id);
      if (!c) return false;
      const p = c.project(rig.camera);
      return p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15;
    },
    // Where each piece of writing is, for situations that relate place to memory.
    geometry: (id) => {
      const w = text.whereIs(id);
      return w ? { surface: w.surface, x: w.centre.x, y: w.centre.y, z: w.centre.z } : undefined;
    },
  });
  // Until the voices' manifest says which are recorded, no vignette speaks.
  director.scenes.setAvailable(new Set());
  // How the last visit left the chair, set in the dark before anything is seen: the only change
  // to it on return (docs/reviews/2026-10-emotional-depth.md).
  const yaw = returnYaw(trace, chair.baseYaw);
  if (yaw !== null) chair.group.rotation.y = yaw;
  for (const [id, st] of director.visible) if (st.base) text.setShown(id);
  // The hand that wrote what is already there left its marks under it.
  room.handMarks(
    [...director.visible]
      .filter(([, st]) => st.base)
      .map(([id]) => text.placementOf(id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.surface !== 'floor' && p.surface !== 'ceiling'),
  );

  const memoryLight = new MemoryLight();
  const street = new StreetLight();
  const memoryWindow = new MemoryWindow();
  const post = new Post(renderer, scene, rig.camera, QUALITY[prefs.quality].msaa);
  const immersion = new Immersion(memoryWindow.noise);
  post.addOverlay(immersion.pass);
  const inside = new Inside(rig, memoryWindow, immersion, post);
  return { world: { renderer, scene, room, chair, lighting, text, rig, post, director, inside, memoryLight, street, memoryWindow }, immersion };
}

function createRenderer(dom: Dom): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  // Redrawn when the light or the chair moves (Lighting.shadowDirty), not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  dom.stage.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = -1;
  return renderer;
}

/**
 * Warm up behind the black threshold: compile every shader now (with every light present, so
 * nothing recompiles when the light comes on), then render one black frame.
 */
export function warmUp(ctx: AppContext, immersion: Immersion): void {
  ctx.post.black = 1;
  ctx.lighting.score.key = ctx.lighting.score.area = ctx.lighting.score.hemi = ctx.lighting.score.glow = 0;
  ctx.room.setLit(0, 0);
  ctx.rig.update(0.016, ctx.room, ctx.chair.group.position);
  // Compiled for the target the scene is really drawn into (the composer's, linear, before
  // tone mapping), not the screen: three keys programs on the bound target. The memory's light
  // is in the scene, unseen, so it is compiled here too.
  ctx.room.frames.north.writing.add(ctx.memoryLight.mesh);
  ctx.room.frames.north.writing.add(ctx.memoryWindow.mesh);
  // (The streetlights' quad too, lit by nothing, so its program is compiled now.)
  ctx.street.place(ctx.text.anchorOf(PHRASE_IDS.stay) ?? { group: ctx.room.frames.north.writing, minX: -3, maxX: 3, minY: -1.7, maxY: 1.7 });
  ctx.street.mesh.visible = true;
  ctx.renderer.setRenderTarget(ctx.post.composer.readBuffer);
  ctx.renderer.compile(ctx.scene, ctx.rig.camera);
  ctx.renderer.setRenderTarget(null);
  // A living memory's painting and the way into it: compiled now, kept (never compiled again).
  warmLiving(ctx.renderer, ctx.memoryWindow.noise);
  immersion.pass.enabled = true;
  ctx.post.render();
  immersion.off();
  ctx.street.release();
}

/** A phone may drop the GL context (a backgrounded tab); when it comes back, so must the chair's shadow. */
export function restoreOnContextRestored(ctx: AppContext): void {
  // (Otherwise only redrawn when something moves.)
  ctx.renderer.domElement.addEventListener('webglcontextrestored', () => {
    ctx.lighting.invalidateShadow();
    ctx.renderer.shadowMap.needsUpdate = true;
  });
}
