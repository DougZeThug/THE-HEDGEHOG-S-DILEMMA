import * as THREE from 'three';

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
 *  - The plate: the artist's painting, barely moved. Its maps say how much: the canopy's edge
 *    against the sky and the near grass most (a pixel or two), the clearing's fine grass and the
 *    canopy's inside not at all (they only catch the light). The motion is two slow sways at
 *    incommensurate rates (never in step, never repeating) whose phase drifts over a few hundred
 *    pixels, plus authored gusts that cross the clearing. Nothing has a per-pixel phase (that
 *    tears a painting apart). The painted sun flecks brighten and dim a little as the leaves move;
 *    no shadow scrolls over them. Dusk is the evening's colour multiplied in, and the real dusk sky
 *    crossfaded into the canopy's gap.
 *  - The people: a fine mesh over their cut-out, deformed by smooth weights evaluated here from
 *    their anatomy (in the art's manifest): a chest swelling along its own short axis, a forearm
 *    turning at the elbow, a head inclining at the neck. Nothing stretches more than a few percent.
 *    Their eyelids, their colour going to graphite, and the same light and evening as the plate.
 */

const COMMON = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform vec2 uGust;       // strength, front (0..1 across the frame)
  uniform float uMotion;    // 1, or less under reduced motion
  uniform vec4 uTap;        // a touch on the grass: x, y (painting uv), seconds since, strength

  float gustAt(float x) {
    float d = (x - uGust.y) / 0.25;
    // The front, and the grass settling behind it.
    return uGust.x * (exp(-d * d) + 0.35 * smoothstep(0.0, -1.2, d));
  }

  // The breeze's displacement at a painting point, in plate pixels per unit of sway.
  vec2 breeze(vec2 uv) {
    float t = uTime;
    // A phase that changes slowly across the painting (a few hundred pixels per turn).
    float ph = texture2D(uNoise, uv * vec2(1.3, 0.8) + 0.31).r * 6.2831;
    float ph2 = texture2D(uNoise, uv * vec2(0.9, 1.1) + 0.67).r * 6.2831;
    float s = 0.55 * sin(6.2831 * 0.23 * t + ph) + 0.45 * sin(6.2831 * 0.37 * t + ph2);
    float g = gustAt(uv.x);
    // Bending to the right as the gust passes (it comes from the left), a little down at the tips.
    float x = s * 0.7 + g * 1.6;
    vec2 d = vec2(x, -0.3 * abs(x));
    if (uTap.w > 0.0) {
      vec2 r = (uv - uTap.xy) * vec2(1.78, 1.0);
      float k = exp(-dot(r, r) / 0.0012) * exp(-uTap.z / 0.6) * uTap.w;
      d += normalize(r + 1e-5) * k * 2.0 * sin(uTap.z * 9.0);
    }
    return d * uMotion;
  }

  // The leaves' light moving over what is lit: stationary, a few percent, shivering with the gust.
  float dapple(vec2 uv, float lit) {
    float t = uTime;
    float a = texture2D(uNoise, uv * vec2(9.0, 3.6) + vec2(t * 0.004, 0.0)).r;
    float b = texture2D(uNoise, uv * vec2(23.0, 9.0) + vec2(0.0, t * 0.006)).r;
    float g = gustAt(uv.x - 0.04); // the light follows the leaves a moment later
    float flicker = (a - 0.5) * 0.10 + (b - 0.5) * 0.06 * (1.0 + 2.0 * g);
    return 1.0 + lit * flicker * (0.4 + 0.6 * uMotion);
  }
`;

const VERT = /* glsl */ `
  uniform float uKind;       // 0 the plate, 1 the people
  uniform vec2 uSheet;       // the figure art's own pixels (anatomy is in these, y up)
  uniform vec4 uPlace;       // where the people lie on the painting: x0, y0, w, h (painting uv)
  // Ellipses: 0 chest A, 1 chest B, 2 head A, 3 head B, 4 shoulder B, 5 settle B, 6 hair A, 7 hair B.
  uniform vec4 uE[8];        // centre, radii
  uniform float uEA[8];      // angle
  uniform float uEE[8];      // how soft its rim (fraction of the radius)
  // Forearms: 0 A, 1 B: elbow, hand.
  uniform vec4 uL[2];
  uniform vec2 uLR[2];       // the forearm's half width, the hand's radius
  // Bones: 0 chest A, 1 chest B, 2 hand B, 3 head A, 4 head B, 5 shoulder B, 6 hand A, 7 settle B.
  uniform vec2 uPivot[8];
  uniform float uTurn[8];
  uniform float uSwell[8];   // along its own short axis (a chest)
  uniform float uSwellA[8];  // that axis's angle
  uniform vec2 uMove[8];
  varying vec2 vUv;
  varying vec2 vScene;
  varying float vHair;

  float ell(vec2 p, int i) {
    vec2 d = p - uE[i].xy;
    float c = cos(uEA[i]), s = sin(uEA[i]);
    vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / uE[i].zw;
    return 1.0 - smoothstep(1.0 - uEE[i], 1.0, length(q));
  }
  float limb(vec2 p, int i) {
    vec2 a = uL[i].xy, b = uL[i].zw;
    vec2 v = b - a;
    float t = clamp(dot(p - a, v) / dot(v, v), 0.0, 1.0);
    float arm = (1.0 - smoothstep(uLR[i].x * 0.6, uLR[i].x, length(p - a - v * t))) * smoothstep(0.0, 1.0, t);
    float hand = 1.0 - smoothstep(0.5, 1.0, length((p - b) / vec2(uLR[i].y, uLR[i].y * 0.8)));
    return max(arm, hand);
  }
  vec2 bone(int i, vec2 p, float w) {
    if (w <= 0.0) return vec2(0.0);
    vec2 q = p - uPivot[i];
    vec2 n = vec2(-sin(uSwellA[i]), cos(uSwellA[i]));
    q += n * dot(q, n) * uSwell[i];
    float c = cos(uTurn[i]), s = sin(uTurn[i]);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    return w * (q + uPivot[i] + uMove[i] - p);
  }

  void main() {
    vUv = uv;
    vHair = 0.0;
    if (uKind < 0.5) {
      vScene = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      return;
    }
    vec2 p = uv * uSheet;
    float hb = limb(p, 1);
    float ha = limb(p, 0) * (1.0 - hb);
    float headA = ell(p, 2);
    float headB = ell(p, 3) * (1.0 - headA);
    vec2 d = bone(0, p, ell(p, 0)) + bone(1, p, ell(p, 1)) + bone(2, p, hb)
           + bone(3, p, headA) + bone(4, p, headB) + bone(5, p, ell(p, 4))
           + bone(6, p, ha) + bone(7, p, max(ell(p, 5), headB));
    vHair = max(ell(p, 6), ell(p, 7));
    vec2 f = (p + d) / uSheet;
    vScene = uPlace.xy + f * uPlace.zw;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vScene, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uKind;
  uniform sampler2D uPlate, uMaps, uGrade, uSky, uAfterPlate;
  uniform float uAfter;      // 0 the afternoon, 1 the same place later (a cut: never between)
  uniform sampler2D uFigures, uLids, uFSketch;
  uniform vec2 uPx;          // one plate pixel, in uv
  uniform vec2 uFigPx;       // one figure pixel, in uv
  uniform float uDusk;       // 0 afternoon .. 1 the evening's colour
  uniform float uDuskSky;    // the real dusk sky in the gap (0..1)
  uniform vec4 uSkyBox;      // where the gap is: x0, y0, w, h (painting uv)
  uniform vec2 uParallax;    // the view's shift at depth 1 (uv), from the visitor's small looks
  uniform float uBlinkA, uBlinkB;
  uniform float uSplit;      // figure u between A and B (eyes left of it are A's)
  uniform float uColour;     // the people: 1 painted, 0 graphite
  uniform float uPeople;     // how present they are at all
  uniform float uHair;       // how much the gust moves their hair now
  varying vec2 vUv;
  varying vec2 vScene;
  varying float vHair;
  ${COMMON}

  vec3 evening(vec3 c, vec2 uv) {
    return mix(c, c * texture2D(uGrade, uv).rgb * 2.0, uDusk);
  }

  void main() {
    if (uKind < 0.5) {
      vec4 m0 = texture2D(uMaps, vUv);
      vec2 uv = vUv + uParallax * (m0.r - 0.4);
      vec4 m = texture2D(uMaps, uv);
      vec2 d = breeze(uv) * m.g * 1.6 * uPx;
      // The cut: the same composition, later (its own painting), on one frame.
      vec3 c = uAfter > 0.5 ? texture2D(uAfterPlate, uv + d).rgb : texture2D(uPlate, uv + d).rgb;
      c *= dapple(uv, m.a * (1.0 - uAfter));
      c = evening(c, uv);
      vec2 sq = (uv - uSkyBox.xy) / uSkyBox.zw;
      if (uDuskSky > 0.0 && all(greaterThan(sq, vec2(0.0))) && all(lessThan(sq, vec2(1.0)))) {
        vec4 s = texture2D(uSky, sq);
        c = c * (1.0 - s.a * uDuskSky) + s.rgb * uDuskSky;
      }
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    // The people (premultiplied, as decoded): hair stirs only when the gust passes.
    vec2 d = breeze(vScene) * vHair * uHair * 1.2 * uFigPx;
    vec4 f = texture2D(uFigures, vUv + d);
    vec4 lid = texture2D(uLids, vUv);
    float shut = vUv.x < uSplit ? uBlinkA : uBlinkB;
    vec3 col = f.rgb * (1.0 - lid.a * shut) + lid.rgb * shut;
    col *= dapple(vScene, 0.5);
    col = evening(col, vScene);
    // To graphite: the colour leaves first, the drawing stays a moment (the room's own grammar).
    vec4 g = texture2D(uFSketch, vUv) * 0.9;
    gl_FragColor = mix(g, vec4(col, f.a), uColour) * uPeople;
  }
`;

export interface LivingMaterials {
  /** The one program; `plate` and `people` share it (two instances, so each keeps its own textures). */
  plate: THREE.ShaderMaterial;
  people: THREE.ShaderMaterial;
  /** One transparent texel, for any map not given yet. */
  empty: THREE.DataTexture;
}

let made: LivingMaterials | null = null;

function uniforms(noise: THREE.Texture, empty: THREE.Texture): Record<string, THREE.IUniform> {
  const v2 = (n: number) => Array.from({ length: n }, () => new THREE.Vector2());
  const v4 = (n: number) => Array.from({ length: n }, () => new THREE.Vector4(0, 0, 1, 1));
  return {
    uKind: { value: 0 },
    uNoise: { value: noise },
    uTime: { value: 0 },
    uGust: { value: new THREE.Vector2(0, -1) },
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
    uFSketch: { value: empty },
    uPx: { value: new THREE.Vector2(1 / 1672, 1 / 941) },
    uFigPx: { value: new THREE.Vector2(1 / 927, 1 / 323) },
    uDusk: { value: 0 },
    uDuskSky: { value: 0 },
    uSkyBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uParallax: { value: new THREE.Vector2() },
    uBlinkA: { value: 0 },
    uBlinkB: { value: 0 },
    uSplit: { value: 0.26 },
    uColour: { value: 1 },
    uPeople: { value: 1 },
    uHair: { value: 0 },
    uSheet: { value: new THREE.Vector2(1, 1) },
    uPlace: { value: new THREE.Vector4(0, 0, 1, 1) },
    uE: { value: v4(8) },
    uEA: { value: new Array(8).fill(0) },
    uEE: { value: new Array(8).fill(0.5) },
    uL: { value: v4(2) },
    uLR: { value: v2(2) },
    uPivot: { value: v2(8) },
    uTurn: { value: new Array(8).fill(0) },
    uSwell: { value: new Array(8).fill(0) },
    uSwellA: { value: new Array(8).fill(0) },
    uMove: { value: v2(8) },
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
  made = { plate, people, empty };
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

/**
 * Compile the living memory's program now (at boot), for the target it is really drawn into, so
 * nothing compiles when someone goes in. The materials are kept for good.
 */
export function warmLiving(renderer: THREE.WebGLRenderer, noise: THREE.Texture): void {
  const m = livingMaterials(noise);
  const scene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0.5, 0.5, 0);
  const grid = new THREE.PlaneGeometry(1, 1, 2, 2);
  grid.translate(0.5, 0.5, 0);
  scene.add(new THREE.Mesh(quad, m.plate), new THREE.Mesh(grid, m.people));
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
