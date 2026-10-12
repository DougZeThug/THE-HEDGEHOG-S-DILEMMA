import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { approach } from '../core/math';
import type { Environment } from '../state/Director';

/**
 * One quiet grading pass: saturation, a vignette that deepens at extremes, film grain,
 * near-black when the room needs it, and the white-out of arrival.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1 },
    uDarkness: { value: 0 },
    uWhite: { value: 1 },
    uVignette: { value: 0.32 },
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
    uniform float uSaturation, uDarkness, uWhite, uVignette, uGrain, uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      vec2 d = vUv - 0.5;
      d.x *= uRes.x / uRes.y;
      float v = smoothstep(0.95, 0.25, length(d));
      c.rgb *= mix(1.0, v, uVignette + uDarkness * 0.6);
      c.rgb *= 1.0 - uDarkness * 0.92;
      float g = h(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      c.rgb += g * uGrain * (0.6 + 0.4 * (1.0 - l));
      c.rgb = mix(c.rgb, vec3(0.955, 0.952, 0.945), uWhite);
      gl_FragColor = c;
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  private grade: ShaderPass;
  private cur = { sat: 1, dark: 0 };
  /** 1 = full white (arrival), 0 = the room. */
  white = 1;
  /** Extra darkness for departure (0..1). */
  depart = 0;
  reducedMotion = false;
  intensityScale = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, samples: number) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  update(dt: number, env: Environment, time: number) {
    this.cur.sat = approach(this.cur.sat, env.saturation, dt, 3);
    // Gentle mode keeps the darkest extremes in reserve.
    const darkTarget = Math.max(env.darkness * (0.55 + 0.45 * this.intensityScale), this.depart);
    this.cur.dark = approach(this.cur.dark, darkTarget, dt, this.depart > 0 ? 2.5 : 4);
    const u = this.grade.uniforms;
    u.uSaturation.value = this.cur.sat;
    u.uDarkness.value = this.cur.dark;
    u.uWhite.value = this.white;
    u.uTime.value = this.reducedMotion ? 0.5 : time * 0.25;
    u.uGrain.value = this.reducedMotion ? 0.02 : 0.032;
  }

  render() {
    this.composer.render();
  }
}
