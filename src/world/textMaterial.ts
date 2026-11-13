import * as THREE from 'three';
import type { Hand } from '../content/types';
import { HANDS } from './textures';

/**
 * The material every piece of writing, drawing and shadow of writing shares: the plaster's lit
 * standard material, with the hand's reveal, the rubbing out and a word's loss added in its shader.
 */

function textUniforms(opacity: number, aspect: number, seed: number, duration: number) {
  return {
    /** How far the hand has got, as a fraction of the whole piece (≥1: all written). */
    uWrite: { value: 2 },
    /** How long just-written ink stays heavier, in the same units. */
    uFresh: { value: 0.5 / Math.max(0.5, duration) },
    uReveal: { value: 0 },
    uOpacity: { value: opacity },
    uEmphasis: { value: 0 },
    uSeed: { value: (seed % 1000) / 37 },
    uAspect: { value: aspect },
    /** A fixed mip level for a shadow of the writing; -1 (the usual sampling) everywhere else. */
    uLod: { value: -1 },
    /** Drawings only: how much fine lines are held as they get small (0 for writing). */
    uThin: { value: 0 },
    /**
     * One word gone (a vignette's trace): the band of the hand's time [x, y] that is that word,
     * and how far it has gone (z, 0–1). Every text material has it (one shared program): off by
     * default, so no piece of writing inherits another's gap.
     */
    uGap: { value: new THREE.Vector3(-1, -1, 0) },
  };
}

export type TextUniforms = ReturnType<typeof textUniforms>;

/** GLSL declarations for the named uniforms, typed from their values. */
function declare(u: TextUniforms, names: readonly (keyof TextUniforms)[]): string {
  return names.map((n) => `uniform ${typeof u[n].value === 'number' ? 'float' : 'vec3'} ${n};`).join('\n') + '\n';
}

const FRAGMENT_ONLY = ['uLod', 'uThin', 'uGap', 'uWrite', 'uFresh'] as const;
const SHARED = ['uReveal', 'uOpacity', 'uEmphasis', 'uSeed', 'uAspect'] as const;
const SAMPLE = textUniforms(0, 1, 0, 1);

/** Both stages declare the shared uniforms (a uniform used by both stages must agree in type and precision). */
const VERT_HEAD = '\n' + declare(SAMPLE, SHARED);
const FRAG_UNIFORMS = '\n' + declare(SAMPLE, [...FRAGMENT_ONLY, ...SHARED]);

const FRAG_NOISE = /* glsl */ `
float hhHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hhNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hhHash(i), hhHash(i+vec2(1,0)), u.x), mix(hhHash(i+vec2(0,1)), hhHash(i+vec2(1,1)), u.x), u.y);
}
float hhFbm(vec2 p){ return 0.6*hhNoise(p) + 0.3*hhNoise(p*2.3) + 0.1*hhNoise(p*5.1); }
`;

export function makeTextMaterial(tex: THREE.Texture, hand: Hand, aspect: number, seed: number, duration: number) {
  const st = HANDS[hand];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(st.ink),
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: hand === 'marker' || hand === 'pen' ? 0.7 : 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const uniforms = textUniforms(st.opacity, aspect, seed, duration);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader;
    shader.fragmentShader = FRAG_UNIFORMS + FRAG_NOISE + shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `
      float hhR = 0.0;
      {
        // Alpha is the ink; red is when the hand reaches it.
        // A fixed, softer level for a shadow (uLod ≥ 0), so it doesn't sharpen as you come close.
        // (The top of the words is further from the floor: its shadow is softer.)
        vec4 hhTx = uLod >= 0.0 ? textureLod(map, vMapUv, uLod + vMapUv.y) : texture2D(map, vMapUv);
        hhR = hhTx.r;
        // Drawings' fine lines would mip away on a phone: hold their ink as they get small.
        if (uThin > 0.0) hhTx.a = min(1.0, hhTx.a * (1.0 + uThin * clamp(log2(fwidth(vMapUv.x) * float(textureSize(map, 0).x)), 0.0, 2.0)));
        if (hhTx.a < 0.004) discard;
        float hhLeft = uWrite - hhTx.r;
        float hhInk = smoothstep(-0.004, 0.006, hhLeft);
        if (hhInk <= 0.0) discard;
        // Just-written ink sits a little heavier for a moment, like a pen pressed down.
        float hhFreshInk = 1.0 - smoothstep(0.0, uFresh, hhLeft);
        diffuseColor.a *= hhTx.a * hhInk;
        diffuseColor.rgb *= 1.0 - 0.25 * hhFreshInk;
      }
      // Rubbing out: patches, uneven, like an eraser on plaster (only while it happens).
      if (uReveal < 0.999) {
        float n = hhFbm(vMapUv * vec2(uAspect * 5.0, 5.0) + uSeed);
        float edge = uReveal * 1.25 - 0.12;
        diffuseColor.a *= 1.0 - smoothstep(edge - 0.1, edge + 0.02, n);
      }
      // A word gone: rubbed out unevenly, as an eraser leaves graphite on plaster: patches of a
      // faint smudge, most of it gone (never a clean, even grey).
      if (uGap.z > 0.0) {
        float hhBand = step(uGap.x, hhR) * step(hhR, uGap.y);
        float hhRub = hhFbm(vMapUv * vec2(uAspect * 8.0, 12.0) + uSeed * 1.7);
        diffuseColor.a *= mix(1.0, 0.08 + 0.2 * smoothstep(0.45, 0.85, hhRub), uGap.z * hhBand);
      }
      diffuseColor.a *= uOpacity;
      diffuseColor.rgb *= 1.0 - 0.45 * uEmphasis;`,
    );
  };
  mat.customProgramCacheKey = () => 'hh-text4';
  return { mat, uniforms };
}
