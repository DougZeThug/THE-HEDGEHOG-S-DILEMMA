import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { approach } from '../core/math';
import type { Environment } from '../state/Director';

/**
 * One quiet grading pass: saturation, a vignette that deepens at extremes, film grain,
 * near-black when the room needs it, and the white-out of arrival. It runs after OutputPass,
 * in display space (tone-mapped, sRGB), where its thresholds were tuned: luma rather than
 * luminance, which is what grain and vignette want. (Folding OutputPass into this pass would
 * save one full-screen pass; deferred until it can be measured on a real phone.)
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1 },
    uDarkness: { value: 0 },
    uWhite: { value: 0 },
    uBlack: { value: 1 },
    uVignette: { value: 0.32 },
    uVigLow: { value: 0 },
    uVigOut: { value: 0 },
    uContrast: { value: 0 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uDarkness, uWhite, uBlack, uVignette, uGrain, uTime, uContrast, uVigLow, uVigOut;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      vec2 d = vUv - 0.5;
      d.x *= uRes.x / uRes.y;
      // (Close up inside a living memory it falls off further out: the picture's corners, not a face.)
      float r0 = mix(0.25, 0.45, uVigOut), r1 = mix(0.95, 1.1, uVigOut);
      float v = smoothstep(r1, r0, length(d));
      // The look's own vignette can sit lower (centred at 0.42 of the height) and spare the
      // highlights; the Director's darkness keeps the plain one.
      vec2 dl = vUv - vec2(0.5, 0.5 - 0.08 * uVigLow);
      dl.x *= uRes.x / uRes.y;
      float vl = mix(smoothstep(r1, r0, length(dl)), 1.0, smoothstep(0.85, 0.95, l) * uVigLow);
      float vk = uVignette + uDarkness * 0.6;
      c.rgb *= mix(1.0, mix(v, vl, uVignette / max(vk, 1e-4)), vk);
      c.rgb *= 1.0 - uDarkness * 0.92;
      // A gentle S on luminance (hue kept): fuller lights, deeper darks, mid-greys where they were.
      float ls = clamp(l, 0.0, 1.0);
      ls = ls * ls * (3.0 - 2.0 * ls);
      c.rgb *= mix(1.0, ls / max(l, 1e-4), uContrast);
      float g = h(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      // Grain belongs to light: none on black (it would read as static on a title card).
      c.rgb += g * uGrain * (0.6 + 0.4 * (1.0 - l)) * smoothstep(0.0, 0.08, l);
      c.rgb = mix(c.rgb, vec3(0.955, 0.952, 0.945), uWhite);
      c.rgb = mix(c.rgb, vec3(0.043, 0.043, 0.047), uBlack);
      // A still, triangular dither of one step: the dark frames (the title, the dims, leaving)
      // have no grain to hide banding in their gradients. Interleaved gradient noise (no sin()
      // hash, which shows structure on some mobile GPUs at large coordinates).
      float ign1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float ign2 = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 17.0, vec2(0.06711056, 0.00583715))));
      c.rgb += (ign1 + ign2 - 1.0) * (1.0 / 255.0);
      gl_FragColor = c;
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  private grade: ShaderPass;
  private cur = { sat: 1, dark: 0 };
  /** 1 = full white, 0 = the room. */
  white = 0;
  /** 1 = the black of the title card (the opening), 0 = the room. */
  black = 1;
  /** Extra darkening the opening holds while the room is still dim (0..1). */
  scoreDark = 0;
  /** Extra darkness for departure (0..1). */
  depart = 0;
  reducedMotion = false;
  intensityScale = 1;
  /** Film grain and vignette strengths (the ?tune panel changes them live). */
  grain = 0.032;
  vignette = 0.32;
  /** The vignette's shape (Look.vigLow). */
  vigLow = 0;
  /** The look's tonal S-curve (0 none); App weights it by the room's light. */
  contrast = 0;
  /**
   * Inside a living memory (0..1): the room's own grading (its saturation, its darkness, its
   * S-curve) lets go of the painting, and the grain is held still with the painting's drawings
   * (twelve a second) and lighter. The vignette stays: it is what the room and the memory share.
   */
  immersed = 0;
  /**
   * The two of them close (0..1, the App's, from the shot): inside, the vignette is centred again
   * (the room's sits low for its unlit ceiling) and falls off further out, so it frames the
   * picture's corners and not a face near its edge: his, upper left in the two-shot, was 13%
   * darker there than in the wide (the directors' evaluations, 2026-10-18). Only then: the wides
   * and the dusk keep the vignette they were reviewed with (the cut hides the change).
   */
  close = 0;
  private readonly roomPass: RenderPass;
  private readonly outputPass: OutputPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, samples: number) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, rt);
    this.roomPass = new RenderPass(scene, camera);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.roomPass);
    this.composer.addPass(this.outputPass);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  /** A pass drawn over the room, before the grade (the immersion into a living memory). */
  addOverlay(pass: ShaderPass) {
    this.composer.insertPass(pass, 2);
  }

  /** The room isn't seen at all (a living memory covers the whole view): don't draw it. */
  set roomHidden(hidden: boolean) {
    this.roomPass.enabled = this.outputPass.enabled = !hidden;
  }

  setSamples(n: number) {
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== n) {
        rt.samples = n;
        rt.dispose();
      }
    }
  }

  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  update(dt: number, env: Environment, time: number) {
    this.cur.sat = approach(this.cur.sat, env.saturation, dt, 3);
    // Gentle mode keeps the darkest extremes in reserve.
    const darkTarget = Math.max(env.darkness * (0.55 + 0.45 * this.intensityScale), this.depart, this.scoreDark);
    this.cur.dark = approach(this.cur.dark, darkTarget, dt, this.depart > 0 ? 2.5 : 4);
    const u = this.grade.uniforms;
    const im = this.immersed;
    u.uSaturation.value = this.cur.sat + (1 - this.cur.sat) * im;
    u.uDarkness.value = this.cur.dark * (1 - im);
    u.uWhite.value = this.white;
    u.uBlack.value = this.black;
    const grainTime = im > 0.5 ? Math.floor(time * 12) / 12 : time;
    u.uTime.value = this.reducedMotion ? 0.5 : grainTime * 0.25;
    u.uGrain.value = (this.reducedMotion ? this.grain * 0.625 : this.grain) * (1 - 0.6 * im);
    u.uVignette.value = this.vignette;
    const close = this.close * im;
    u.uVigLow.value = this.vigLow * (1 - close);
    u.uVigOut.value = close;
    u.uContrast.value = this.contrast * (1 - im);
  }

  render() {
    this.composer.render();
  }
}
