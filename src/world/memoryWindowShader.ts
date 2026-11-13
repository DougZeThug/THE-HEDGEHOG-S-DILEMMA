import * as THREE from 'three';

/** The memory window's shader, its noise tile and its light's colour: what the window draws with, apart from how it is driven. */

/** Layer slots: the shader's arrays and the window's layers are this long. */
export const SLOTS = 6;

export const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const FRAG = /* glsl */ `
  uniform sampler2D uL0, uL1, uL2, uL3, uL4, uL5, uNoise;
  uniform float uOpacity[${SLOTS}];
  uniform float uKind[${SLOTS}];   // 0 pigment, 1 light, 2 sketch, 3 shade (a shadow in the light)
  uniform vec2 uShift[${SLOTS}];   // parallax and layer offset, in uv
  uniform float uSkew[${SLOTS}];   // a hanging layer's sway: none at the top (its rod), most at the bottom, in uv
  uniform int uCount;
  uniform vec2 uSize;              // metres
  uniform vec2 uNominal;           // the painting's own size (m), in which its light is authored
  uniform float uPlaster;          // the lit plaster's mean, linear (what pigment is relative to)
  uniform float uReveal, uSketch, uPresence, uStylize;
  uniform vec3 uLight;             // the memory's light colour × intensity, linear
  uniform vec4 uPool;              // light pool: centre (m), radius (m), softness (m)
  uniform vec4 uReserve;           // the words: centre (m), half size (m)
  uniform float uSeed;
  // A living memory: the part of the painting this quad shows (painting uv, as it spreads), the
  // part its first layer (the living scene's render target) holds, and how far it is open.
  uniform vec4 uCrop;
  uniform vec4 uView0;
  uniform float uOpen;
  uniform float uSoftReserve;
  // A living memory drawn stroke by stroke (scripts/stroke-order.py): when each line is drawn (r)
  // and when the colour reaches each point (g), against the sketch's and the reveal's progress.
  uniform sampler2D uOrder;
  uniform float uOrdered;
  // How strongly a living memory's pigment sinks into the plaster (a faded fresco, never a hole:
  // the dusk painting multiplied in at full strength is a black stain).
  uniform float uSunk;
  // How far a living painting (drawn in order, or its revisit) is lifted toward the plaster (a light
  // wash, as image 3, not a dark stain), all the way at its colour's front.
  uniform float uLift;
  // Its words lie on it, washed to a trace (a living memory's revisit, on the wall without a scene
  // of its own): no plaster kept round them.
  uniform float uUnder;
  // A living memory's own soft edge on the wall (m; 0: the usual brush): shade has no edge
  // (Memory VII: a 6-11 cm brush round a patch of shade read as a stain; the technical artist's
  // and the cinematic director's reviews, 2026-11-09).
  uniform float uFeather;
  // Light passing across the wall (The Drive Home's streetlights, src/world/StreetLight.ts): its
  // band (centre from the window's centre, half width, shear (m of x a metre up), strength) and the
  // wall's middle from the window's centre (m); what it has left found (the order map's b), and
  // the flat dark of what isn't found yet, as a share of the plaster (1: none, nothing touched).
  uniform vec4 uBand;
  uniform float uBandY, uFound, uDark;
  varying vec2 vUv;

  vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

  float shade = 1.0;
  void layer(int i, vec4 c, inout vec3 col, inout float cov, inout vec3 light, inout vec4 lead) {
    float o = uOpacity[i];
    // A shadow falls only in the light: it takes light away, never adds paint.
    if (uKind[i] > 2.5) { shade *= 1.0 - c.a * o; return; }
    // The graphite is kept apart (premultiplied), so the colour it lies over (not yet revealed)
    // never tints it; it is laid over the colour at the end, revealed by its own mask.
    if (uKind[i] > 1.5) lead = c * o + lead * (1.0 - c.a * o);
    else if (uKind[i] > 0.5) light += c.rgb * o;
    else { col = c.rgb * o + col * (1.0 - c.a * o); cov = c.a * o + cov * (1.0 - c.a * o); }
  }

  void main() {
    vec2 m = (vUv - 0.5) * uSize; // metres from the window's centre
    // Where on the painting (the whole of it, unless a living memory shows a part).
    vec2 P = uCrop.xy + vUv * uCrop.zw;
    float n = texture2D(uNoise, P * uNominal * 0.9 + uSeed).r;
    float n2 = texture2D(uNoise, P * uNominal * 3.1 - uSeed).r;

    // The pool of the memory's light: what it reaches is what is revealed. The drawing is
    // found a little ahead of the colour (the light finds the pencil first).
    vec2 mp = (P - 0.5) * uNominal;
    float d = length((mp - uPool.xy) / max(uPool.z, 1e-3)) + (n - 0.5) * 0.35 + (n2 - 0.5) * 0.12;
    float soft = uPool.w / max(uPool.z, 1e-3) + 0.05;
    float colourMask = 1.0 - smoothstep(uReveal - soft, uReveal + soft, d);
    float sketchMask = 1.0 - smoothstep(uSketch - soft, uSketch + soft, d);
    // The light's own pool (where it falls, whatever is revealed yet).
    float pool = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, d);
    if (uOrdered > 0.5) {
      // Each line appears in order (out from the words); the colour follows as a wash, its edge
      // broken by the paper's grain, soft. (uSketch and uReveal run to 1.25 for the pool: 1 is all.)
      vec2 o = texture2D(uOrder, P).rg;
      sketchMask = clamp((uSketch / 1.25 - o.r) / 0.012 + 0.5, 0.0, 1.0);
      float g = o.g + (n2 - 0.5) * 0.05;
      colourMask = smoothstep(g - 0.08, g + 0.08, uReveal / 1.25);
    }
    // Opened across the plaster, the whole of it is found (its edge is the quad's ragged edge;
    // one drawn in order has its order for an edge).
    colourMask = max(colourMask, uOpen * step(0.5, uReveal) * (1.0 - uOrdered));
    sketchMask = max(sketchMask, uOpen * step(0.5, uSketch) * (1.0 - uOrdered));
    // Never to the window's edge: ragged, inside its rectangle (wider as a living one spreads:
    // a brush, not a frame). One drawn in order has its corners rounded as wide as its band (no
    // corner is ever seen: image 3 has none; the creative director's and the skeptic's reviews).
    vec2 e = min(vUv, 1.0 - vUv) * uSize;
    float band = max((0.06 + 0.05 * n) * (1.0 + 0.6 * uOpen), uFeather * (0.9 + 0.2 * n));
    float rr = band * 1.5 * uOrdered;
    float ed = (e.x < rr && e.y < rr) ? rr - length(vec2(rr) - e) : min(e.x, e.y);
    float edge = smoothstep(0.0, band, ed + (n2 - 0.5) * 0.08 * uOpen);

    vec3 col = vec3(0.0); float cov = 0.0; vec3 light = vec3(0.0); vec4 lead = vec4(0.0);
    if (uCount > 0) layer(0, texture2D(uL0, (P - uView0.xy) / uView0.zw + uShift[0] + vec2(uSkew[0] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 1) layer(1, texture2D(uL1, P + uShift[1] + vec2(uSkew[1] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 2) layer(2, texture2D(uL2, P + uShift[2] + vec2(uSkew[2] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 3) layer(3, texture2D(uL3, P + uShift[3] + vec2(uSkew[3] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 4) layer(4, texture2D(uL4, P + uShift[4] + vec2(uSkew[4] * (1.0 - P.y), 0.0)), col, cov, light, lead);
    if (uCount > 5) layer(5, texture2D(uL5, P + uShift[5] + vec2(uSkew[5] * (1.0 - P.y), 0.0)), col, cov, light, lead);

    // Unstylized (the editor's comparison): the layers as baked, with no mask, noise or reserve.
    float mask = mix(1.0, colourMask, uStylize);
    float smask = mix(1.0, sketchMask, uStylize);
    // Drawn in order, the colour keeps inside its ragged edge and the pencil runs on past it, to
    // the plate's edge (image 3); otherwise both keep inside it.
    float edgeAll = edge;
    if (uOrdered > 0.5) {
      mask *= edge;
      smask *= smoothstep(0.0, 0.015, ed);
      edgeAll = 1.0;
    }
    // (The light reveals as the colour does, inside its edge: before the colour, on bare plaster,
    // it read as two pale smears, not as light (the skeptic's third review); past the colour's
    // rounded edge it ran on to the plate's straight one (QA, 2026-10-18).)
    float lightMask = mask;
    // Graphite is found by the light first; colour follows. Lead over colour, premultiplied.
    float cA = cov * mask, lA = lead.a * smask;
    vec3 premul = lead.rgb * smask + col * mask * (1.0 - lA);
    if (uLift > 0.0) {
      // (Its colour lifted toward the plaster's own lightness, all the way at the colour's front:
      // a dark multiply read as stains coming and a scorch going.)
      vec3 sc = col / max(cov, 1e-3);
      float plasterS = 1.055 * pow(uPlaster, 1.0 / 2.4) - 0.055;
      premul = lead.rgb * smask + mix(vec3(plasterS), sc, (1.0 - uLift) * smoothstep(0.0, 1.0, mask)) * cA * (1.0 - lA);
    }
    cov = lA + cA * (1.0 - lA);
    col = premul;
    float pigCov = clamp(cov, 0.0, 1.0) * edgeAll * uPresence * uSunk;

    // Bare plaster round the words, feathered over 2–3 cm with a rough edge.
    vec2 r = abs(m - uReserve.xy) - uReserve.zw;
    // (A living memory's painting keeps its words in a bloom of plaster, not a card: a wider,
    // noise-edged reserve, the painting faintly there behind them.)
    float bloom = step(0.5, uSoftReserve);
    float rd = max(r.x, r.y) + (n2 - 0.5) * mix(0.02, 0.07, bloom) + (n - 0.5) * 0.06 * bloom;
    float reserve = (1.0 - smoothstep(-0.005, mix(0.03, 0.11, bloom), rd)) * mix(1.0, 0.7, bloom);
    // (A living memory's painting, opened across the plaster, lies under its words as image 3:
    // no card of bare plaster round them.)
    pigCov *= 1.0 - mix(0.0, 0.85, reserve * uStylize * (1.0 - uOpen) * (1.0 - uUnder));

    vec3 pigment = toLinear(col / max(cov, 1e-3));
    if (uDark < 1.0) {
      // Faces in a car at night: found where a streetlight crosses them, and left found after.
      float bx = (m.x - uBand.x - uBand.z * (m.y - uBandY)) / max(uBand.y, 1e-3);
      float lit = uBand.w * exp(-bx * bx);
      float b = texture2D(uOrder, P).b + (n2 - 0.5) * 0.1;
      float found = smoothstep(b - 0.16, b + 0.16, uFound);
      // (Not yet found it is the flat dark of a car's inside at night, a share of the plaster, no
      // face in it: the picture only darkened still showed its pale faces before any light came.)
      pigment = mix(vec3(uPlaster * uDark), pigment, max(lit, found));
    }
    vec3 lit = toLinear(min(light, vec3(1.0))) * shade * uLight * lightMask * edgeAll * uPresence;

    // dst × (cover × pigment / plaster + (1 − cover)) + dst × light (see the blend below).
    gl_FragColor = vec4(pigCov * pigment / uPlaster + lit, 1.0 - pigCov);
  }
`;

/**
 * A 256² tiling value noise: one fetch instead of a hash fbm (cheaper, and no artefacts on phones).
 * Not noise.ts's `makeNoise`: that one is a permuted lattice that does not tile, and the two do not
 * give the same values; only the smoothstep fade is common, too small to be worth a shared hot path.
 * The LCG is not core/rng's mulberry32 for the same reason: the grid, and so the look, must stay as it was.
 */
export function noiseTexture(): THREE.DataTexture {
  const N = 256, G = 16;
  const grid = new Float32Array(G * G);
  let s = 1234567;
  for (let i = 0; i < grid.length; i++) grid[i] = ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const data = new Uint8Array(N * N * 4);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0, amp = 0.5, f = 1;
      for (let o = 0; o < 3; o++) {
        const gx = (x / N) * G * f, gy = (y / N) * G * f;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const tx = sm(gx - x0), ty = sm(gy - y0);
        const at = (i: number, j: number) => grid[((j % G) * G + (i % G)) % grid.length];
        const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        amp *= 0.5;
        f *= 2;
      }
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round((v / 0.875) * 255);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A colour temperature (K) as linear RGB, normalised to its brightest channel. */
export function kelvin(k: number): THREE.Vector3 {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = new THREE.Color(Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255);
  c.convertSRGBToLinear();
  const mx = Math.max(c.r, c.g, c.b);
  return new THREE.Vector3(c.r / mx, c.g / mx, c.b / mx);
}
