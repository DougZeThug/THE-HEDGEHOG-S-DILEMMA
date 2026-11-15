import * as THREE from 'three';
import { DEFORMERS, FILM_FRAG, FILM_VERT, FRAG, VERT } from './shaders';

export { DEFORMERS };

/**
 * The material of a living (animated) memory: a painting that breathes (docs/memories.md,
 * docs/reviews/2026-10-woodland.md). In the main bundle and made once, at boot, so its program is
 * compiled before anyone goes in and never again (tests/playtest/perf.mjs): a memory's scene (the
 * lazy runtime) borrows it and only changes uniforms. One program for everything it draws (the
 * plate and the people; `uKind` says which), never disposed.
 *
 * Everything is drawn in the painting's own sRGB values into the memory's render target (no tone
 * mapping, no colour-space conversion), premultiplied, like the wall's other painted layers.
 *
 * One wind moves all of it (`uWind`: the air as each kind of thing answers it, across the
 * painting, from src/memory/living/performance.ts), so nothing has a clock of its own.
 *
 *  - The plate (`uKind` 0): the artist's painting. Its grass moves on a long wave of that wind
 *    (strongest in the near grass, whose tips stand above their roots), its clumps a little out of
 *    step; its leaves at their edges against the sky; the sky in the canopy's gap drifts behind
 *    the leaves (its own layer); the painted sun flecks shift as the leaves above them move. Long
 *    waves and smooth fields only: nothing that moves more than a few pixels is moved inside the
 *    painting (that tears it); it is drawn as its own geometry instead.
 *  - The people (`uKind` 1): a puppet. One cut-out (an atlas: the body; her forearm) on a mesh,
 *    moved by soft deformers (their ellipses from the art's manifest, their moves from the
 *    scene): chests, heads, faces, irises, locks of hair, hands, a foot. Their lids (shut, half),
 *    their colour going to graphite, the light moving on them.
 *  - The near flowers (`uKind` 2): strips bent about their roots in the grass.
 *  - What is in the air (`uKind` 3): motes, seen only in the sun.
 *  - The ground round them in the two-shot (`uKind` 4): out of focus, barely stirring.
 *  - The two-shot (`uNear`, scripts/two-shot.py): the people close, from the character sheet's own
 *    panel (an atlas reaching as far across it as the camera looks); their eyes looking (the iris
 *    moves along each opening, the white filling in where it was; the lash line stays drawn); the
 *    light on them as the wide's, at the same place on the painting, so a cut keeps it.
 *  - Her head as the artist redrew it, in either shot (cells, laid in on held keys).
 */

export interface LivingMaterials {
  /** The one program; `plate` and `people` share it (two instances, so each keeps its own textures). */
  plate: THREE.ShaderMaterial;
  people: THREE.ShaderMaterial;
  /** The near flowers on their stems (`uKind` 2). */
  flowers: THREE.ShaderMaterial;
  /** Motes in the air (`uKind` 3). */
  air: THREE.ShaderMaterial;
  /** The ground round them in the two-shot (`uKind` 4). */
  frame: THREE.ShaderMaterial;
  /** One transparent texel, for any map not given yet. */
  empty: THREE.DataTexture;
}

let made: LivingMaterials | null = null;

function uniforms(noise: THREE.Texture, empty: THREE.Texture): Record<string, THREE.IUniform> {
  return {
    uKind: { value: 0 },
    uNoise: { value: noise },
    uTime: { value: 0 },
    uWind: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
    uDrift: { value: new Array(16).fill(0) },
    uCount: { value: 40 },
    uMotion: { value: 1 },
    uTap: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPlate: { value: empty },
    uAfterPlate: { value: empty },
    uAfter: { value: 0 },
    uMaps: { value: empty },
    uGrade: { value: empty },
    uSky: { value: empty },
    uFigures: { value: empty },
    uLids: { value: empty },
    uFlowers: { value: empty },
    uSkyMask: { value: empty },
    uClouds: { value: empty },
    uCloudsAfter: { value: empty },
    uFrame: { value: empty },
    uCloudBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCloud: { value: new THREE.Vector2(0, 0) },
    uFigRows: { value: new THREE.Vector2(1, 1) },
    uLidRows: { value: new THREE.Vector2(1, 1) },
    uPx: { value: new THREE.Vector2(1 / 1672, 1 / 941) },
    uDusk: { value: 0 },
    uDuskSky: { value: 0 },
    uSkyBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uParallax: { value: new THREE.Vector2() },
    uBlinkA: { value: 0 },
    uBlinkB: { value: 0 },
    uSplit: { value: 0.26 },
    uColour: { value: 1 },
    uPeople: { value: 1 },
    uNear: { value: 0 },
    uWidePlace: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFigU: { value: 1 },
    uLidBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHeads: { value: empty },
    uHeadBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHeadCel: { value: new THREE.Vector2(-1, 1) },
    uHeadGrid: { value: new THREE.Vector4(1, 1, 0, 0) },
    uGaze: { value: new THREE.Vector2(0, 0) },
    uGazeB: { value: new THREE.Vector2(0, 0) },
    uEyes: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 1)) },
    uIrises: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uWhites: { value: Array.from({ length: 4 }, () => new THREE.Vector3(1, 1, 1)) },
    uSheet: { value: new THREE.Vector2(1, 1) },
    uPlace: { value: new THREE.Vector4(0, 0, 1, 1) },
    uD: { value: Array.from({ length: DEFORMERS * 4 }, () => new THREE.Vector4()) },
  };
}

function material(u: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG });
  m.transparent = true;
  m.depthTest = false;
  m.depthWrite = false;
  m.premultipliedAlpha = true;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.toneMapped = false;
  return m;
}

/** The living memory's materials (made once; `noise` is the memory window's tiling noise). */
export function livingMaterials(noise: THREE.Texture): LivingMaterials {
  if (made) return made;
  const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  empty.needsUpdate = true;
  const plate = material(uniforms(noise, empty));
  const people = material(uniforms(noise, empty));
  people.uniforms.uKind.value = 1;
  const flowers = material(uniforms(noise, empty));
  flowers.uniforms.uKind.value = 2;
  const air = material(uniforms(noise, empty));
  air.uniforms.uKind.value = 3;
  const frame = material(uniforms(noise, empty));
  frame.uniforms.uKind.value = 4;
  made = { plate, people, flowers, air, frame, empty };
  return made;
}

/** The render target a living memory is drawn into (sized to what is seen; mipmapped only on the wall). */
export function livingTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  t.texture.anisotropy = 4;
  return t;
}

/** An orthographic camera over a part of the painting's uv square (the view: x0, y0, w, h). */
export function livingCamera(): THREE.OrthographicCamera {
  const c = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  c.position.z = 0.5;
  return c;
}

let blankFilm: THREE.DataTexture | null = null;
/**
 * A film material kept for good: while one lives, every film's material is the same program. (A
 * program goes with the last material using it: warmed and disposed, the film's was compiled again
 * on the way in: the memory playtest, 2026-10-21.)
 */
let keptFilm: THREE.ShaderMaterial | null = null;

/** The film's material, showing `texture` (a video's), or black until it has one. */
export function filmMaterial(texture: THREE.Texture | null): THREE.ShaderMaterial {
  if (!blankFilm) {
    blankFilm = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blankFilm.needsUpdate = true;
  }
  return new THREE.ShaderMaterial({
    vertexShader: FILM_VERT,
    fragmentShader: FILM_FRAG,
    uniforms: { uFilm: { value: texture ?? blankFilm } },
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * Compile the living memories' programs now (at boot), for the target they are really drawn into,
 * so nothing compiles when someone goes in: the painting that lives and the film. The materials
 * are kept for good (the film's is the same program as every film's, kept by `keptFilm`).
 */
export function warmLiving(renderer: THREE.WebGLRenderer, noise: THREE.Texture): void {
  const m = livingMaterials(noise);
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0.5, 0.5, 0);
  const grid = new THREE.PlaneGeometry(1, 1, 2, 2);
  grid.translate(0.5, 0.5, 0);
  keptFilm ??= filmMaterial(null);
  scene.add(new THREE.Mesh(quad, m.plate), new THREE.Mesh(grid, m.people), new THREE.Mesh(quad, keptFilm));
  const target = livingTarget(16, 16);
  const cam = livingCamera();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.compile(scene, cam);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  target.dispose();
  quad.dispose();
  grid.dispose();
}
