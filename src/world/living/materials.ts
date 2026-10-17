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
 *  - What is in the air (`uKind` 3): motes seen in the light, seeds, a falling leaf.
 *  - A close-up (`uKind` 4): the artist's drawings (scripts/closeups.py): its first drawing, and
 *    over the part that changes, the drawing of now (held, cut on the timeline's keys, never
 *    mixed); the chest breathing and the grass in the air, both the engine's.
 */

const COMMON = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uMotion;    // 1, or less under reduced motion
  uniform vec4 uTap;        // a touch on the grass: x, y (painting uv), seconds since, strength
  // The air, answered (src/memory/living/performance.ts windResponse), at 16 places across the
  // painting, left to right: x the grass, y a flower on its stem, z the leaves, w the leaves a
  // moment ago (their light follows them).
  uniform vec4 uWind[16];
  // The crossing's push (src/world/living/Inside.ts): about (x, y), how much nearer things grow
  // than far ones as the view arrives (0: the composition as painted).
  uniform vec3 uPush;

  // A layer at depth d (0 far .. 1 near), pushed.
  vec2 pushed(vec2 p, float d) {
    return uPush.xy + (p - uPush.xy) * (1.0 + uPush.z * (d - 0.4));
  }

  vec4 windAt(float x) {
    float f = clamp(x, 0.0, 1.0) * 15.0;
    int i = int(min(floor(f), 14.0));
    return mix(uWind[i], uWind[i + 1], f - float(i));
  }

  // The light on them moving as the leaves above move (a few percent; it rocks, it doesn't drift).
  float leafLight(vec2 uv) {
    vec4 w = windAt(uv.x);
    vec2 o = vec2(w.w * 0.006, w.w * 0.002);
    float a = texture2D(uNoise, uv * vec2(1.1, 0.8) + o).r;
    float b = texture2D(uNoise, uv * vec2(1.1, 0.8)).r;
    return 1.0 + (a - b) * 0.55 * uMotion;
  }
`;

/** How many deformers a figure has (each four vec4s of uniforms: src/memory/living/LivingScene.ts). */
export const DEFORMERS = 24;

const VERT = /* glsl */ `
  uniform float uKind;       // 0 the plate, 1 the people
  uniform vec2 uSheet;       // the figure art's own pixels (deformers are in these, y up)
  uniform vec4 uPlace;       // where the people lie on the painting: x0, y0, w, h (painting uv)
  // Deformers, four vec4s each: centre and radii; angle, rim, which parts (1 body, 2 forearm),
  // swell axis; pivot and move; turn, swell.
  uniform vec4 uD[${DEFORMERS * 4}];
  attribute float part;      // 0 the body, 1 her forearm
  attribute vec4 stem;       // a flower: how far up its stem (0 root .. 1 head), how far it swings (px), its root's x, a phase
                             // a mote, a seed, a leaf: which (0, 1, 2), its index, its size (px), when (s)
  attribute vec2 home;       // a mote, a seed, a leaf: where it starts (painting uv, hashed on the CPU)
  uniform vec2 uPx;          // one plate pixel, in uv
  uniform float uDrift[16];  // how far the air has carried something light by now (plate px), across the painting
  uniform float uAfter;
  uniform float uCount;      // how many motes are drawn (fewer under reduced motion)
  varying vec4 vMote;        // which, how bright, how it turns (a leaf), its seed
  varying vec2 vUv;
  varying vec2 vScene;
  varying vec2 vDest;
  varying float vPart;
  ${COMMON}

  float driftAt(float x) {
    float f = clamp(x, 0.0, 1.0) * 15.0;
    int i = int(min(floor(f), 14.0));
    return mix(uDrift[i], uDrift[i + 1], f - float(i));
  }
  // (Small arguments only: n is at most ~50, so every GPU reduces the sine the same way.)
  float h1(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }

  void main() {
    vUv = uv;
    vPart = part;
    vMote = vec4(0.0);
    if (uKind > 2.5 && uKind < 3.5) {
      // Something light in the air (painting uv), a pure function of time.
      float kind = stem.x, n = stem.y, size = stem.z, t0 = stem.w;
      vec2 at;
      float show = 1.0, spin = 1.0;
      if (kind < 0.5) {
        // A mote: hanging in the light, drifting with the air, sinking slowly, wandering.
        // (Its wander and rise are as much as the air moves things: less under reduced motion,
        // none before the painting comes alive.)
        vec2 wander = vec2(sin(uTime * (0.21 + 0.2 * h1(n + 3.0)) + n), cos(uTime * (0.17 + 0.15 * h1(n + 5.0)) + n * 1.7)) * vec2(9.0, 6.0) * uMotion;
        vec2 p = home / uPx + wander + vec2(driftAt(home.x) * 0.5, uTime * (1.0 + h1(n + 9.0)) * uMotion);
        at = fract(p * uPx);
        // Fade where it wraps (never pops at an edge), and only so many of them.
        show = smoothstep(0.0, 0.05, at.x) * (1.0 - smoothstep(0.95, 1.0, at.x)) * smoothstep(0.3, 0.36, at.y) * (1.0 - smoothstep(0.84, 0.9, at.y));
        show *= step(n, uCount - 0.5);
        // After the cut, a few of them still there, in the evening (the air carries on).
        if (uAfter > 0.5) show *= step(n, 14.5) * 0.45;
        // Now and then one catches the sun (one or two a second across them all).
        float tw = sin(uTime * (0.6 + 0.5 * h1(n + 11.0)) + n * 3.1);
        spin = 1.0 + 2.5 * smoothstep(0.985, 1.0, tw) * uMotion;
      } else {
        // A seed or a leaf, crossing in its own few seconds.
        float age = uTime - t0;
        float life = kind < 1.5 ? 3.2 : 2.1;
        show = step(0.0, age) * step(age, life) * smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(life - 0.3, life, age)) * (1.0 - uAfter);
        // (No seeds or falling leaves under reduced motion: they cross the frame.)
        show *= step(0.5, uMotion);
        // (Seeds cross high, from the left; leaves fall from the canopy on the left.)
        vec2 from = home;
        if (kind < 1.5) {
          // The seed: carried right on the gust, rising and falling.
          at = from + vec2(age * 0.11 + driftAt(from.x) * uPx.x * 0.3, 0.012 * sin(age * 2.2 + n)) ;
        } else {
          // The leaf: falling, swinging side to side, turning over (left, away from the hands).
          at = from + vec2(-age * 0.035 + 0.02 * sin(age * 2.6 + n), -age * 0.2);
          spin = cos(age * 5.3 + n);
        }
      }
      at = pushed(at, 0.7);
      vScene = at;
      vDest = at;
      vMote = vec4(kind, show, spin, n);
      // The quad round it (position.xy is its corner, ±1), a leaf turning over (its width flips).
      vec2 corner = position.xy * size * uPx;
      if (kind > 1.5) corner.x *= max(0.15, abs(spin));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(at + corner, 0.0, 1.0);
      return;
    }
    if (uKind < 0.5 || uKind > 3.5) {
      // The plate, or a close-up's frame: the painting's square.
      vScene = uv;
      vDest = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      return;
    }
    if (uKind > 1.5) {
      // A flower: bent on its stem about its root, as the air takes it (and a flutter of its own).
      float b = pow(stem.x, 1.5);
      float dx = (windAt(stem.z).y * stem.y + 0.9 * sin(uTime * 2.3 + stem.w) * stem.x) * b * uMotion;
      dx = 14.0 * dx / sqrt(196.0 + dx * dx);
      vec2 at = pushed(position.xy + vec2(dx, -0.3 * abs(dx) * b) * uPx, 0.95);
      vScene = at;
      vDest = at;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 0.0, 1.0);
      return;
    }
    vec2 p = uv * uSheet;
    vec2 d = vec2(0.0);
    float bit = part > 0.5 ? 2.0 : 1.0;
    for (int i = 0; i < ${DEFORMERS}; i++) {
      vec4 a = uD[i * 4], b = uD[i * 4 + 1], c = uD[i * 4 + 2], e = uD[i * 4 + 3];
      if (mod(floor(b.z / bit), 2.0) < 0.5) continue;
      vec2 r = p - a.xy;
      float ca = cos(b.x), sa = sin(b.x);
      vec2 q = vec2(ca * r.x + sa * r.y, -sa * r.x + ca * r.y) / a.zw;
      float w = 1.0 - smoothstep(1.0 - b.y, 1.0, length(q));
      if (w <= 0.0) continue;
      vec2 o = p - c.xy;
      vec2 n = vec2(-sin(b.w), cos(b.w));
      o += n * dot(o, n) * e.y;
      float ct = cos(e.x), st = sin(e.x);
      o = vec2(ct * o.x - st * o.y, st * o.x + ct * o.y);
      d += w * (o + c.xy + c.zw - p);
    }
    vec2 f = (p + d) / uSheet;
    vDest = f;
    vScene = pushed(uPlace.xy + f * uPlace.zw, 0.6);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vScene, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uKind;
  uniform sampler2D uPlate, uMaps, uGrade, uSky, uAfterPlate;
  uniform float uAfter;      // 0 the afternoon, 1 the same place later (a cut: never between)
  uniform sampler2D uFigures, uLids, uFlowers, uSkyMask, uClouds, uCloudsAfter;
  uniform sampler2D uFrame;  // a close-up: its first drawing (alpha: where the air may move its grass)
  uniform sampler2D uCels;   // its later drawings, cut to the part that changes (an atlas)
  uniform vec4 uCel;         // the drawing now in that atlas: its corner, its size (atlas uv); none: size 0
  uniform vec4 uCelRect;     // the part of the frame it covers: x0, y0, w, h (frame uv)
  uniform vec4 uChest;       // the chest that breathes: centre, radii (frame uv); none: radii 0
  uniform float uBreathe;    // how far it has risen now (a fraction of its size)
  uniform vec4 uCloudBox;    // where the drifting sky is: x0, y0, w, h (painting uv)
  uniform vec2 uCloud;       // its layers' left margin (a fraction of their width), how far it has drifted (the same)
  uniform vec2 uFigRows;     // an atlas row's height and pitch (fractions of the atlas): figures
  uniform vec2 uLidRows;     // and lids (rows: shut, half, her sleeve)
  uniform vec2 uPx;          // one plate pixel, in uv
  uniform float uDusk;       // 0 afternoon .. 1 the evening's colour
  uniform float uDuskSky;    // the real dusk sky in the gap (0..1)
  uniform vec4 uSkyBox;      // where the gap is: x0, y0, w, h (painting uv)
  uniform vec2 uParallax;    // the view's shift at depth 1 (uv), from the visitor's small looks
  uniform float uBlinkA, uBlinkB; // 0 open, 0.5 the half lid, 1 shut
  uniform float uSplit;      // figure u between A and B (eyes left of it are A's)
  uniform float uColour;     // the people: 1 painted, 0 graphite
  uniform float uPeople;     // how present they are at all
  varying vec2 vUv;
  varying vec2 vScene;
  varying vec2 vDest;
  varying float vPart;
  varying vec4 vMote;
  ${COMMON}

  vec2 row(vec2 uv, float r, vec2 rows) {
    return vec2(uv.x, 1.0 - (r * rows.y + (1.0 - uv.y) * rows.x));
  }

  vec3 evening(vec3 c, vec2 uv) {
    return mix(c, c * texture2D(uGrade, uv).rgb * 2.0, uDusk);
  }

  void main() {
    if (uKind < 0.5) {
      // (The push: each point shows what is there at its own depth, nearer things larger.)
      vec2 base = vUv;
      if (uPush.z != 0.0) {
        float dz = texture2D(uMaps, vUv).r;
        base = uPush.xy + (vUv - uPush.xy) / (1.0 + uPush.z * (dz - 0.4));
      }
      vec4 m0 = texture2D(uMaps, base);
      vec2 uv = base + uParallax * (m0.r - 0.4);
      vec4 m = texture2D(uMaps, uv);
      vec4 w = windAt(uv.x);
      // The grass: a long wave crossing it (strongest in the near grass, whose tips stand above
      // their roots at the frame's foot), and clumps of it a little out of step.
      float py = (1.0 - uv.y) / uPx.y;
      float plateH = 1.0 / uPx.y;
      // (Plate px down the painting: the clearing's far grass from ~430, the near grass from ~560;
      // the very foot of the frame is roots, which move less.)
      float near = smoothstep(0.6 * plateH, 0.81 * plateH, py) * (1.0 - 0.5 * smoothstep(0.91 * plateH, plateH, py));
      float clump = sin(uTime * 3.4 + texture2D(uNoise, uv * vec2(0.7, 0.45) + 0.31).r * 6.2831);
      float grass = w.x * (2.5 + 8.0 * near) + clump * (0.6 + 1.8 * near);
      // (A gust bends it further, but never past ~12 px: a smooth field this long doesn't tear.)
      grass = 12.0 * grass / sqrt(144.0 + grass * grass);
      // The leaves: their edges against the sky most (the map's sway is larger there).
      float leaves = w.z * 5.0 * m.g;
      float dx = mix(leaves, grass * clamp(m.g * 5.0, 0.0, 1.0), m.b) * uMotion;
      vec2 d = vec2(dx, -0.25 * abs(dx) * m.b);
      if (uTap.w > 0.0) {
        vec2 r = (uv - uTap.xy) * vec2(1.78, 1.0);
        float k = exp(-dot(r, r) / 0.0012) * exp(-uTap.z / 0.6) * uTap.w;
        d += normalize(r + 1e-5) * k * 2.0 * sin(uTap.z * 9.0) * uMotion;
      }
      vec2 at = uv + d * uPx;
      // The cut: the same composition, later (its own painting), on one frame.
      vec3 c = uAfter > 0.5 ? texture2D(uAfterPlate, at).rgb : texture2D(uPlate, at).rgb;
      // The sky drifting behind the leaves (the leaves and the mountain stay where they are).
      vec2 sq = (at - uCloudBox.xy) / uCloudBox.zw;
      if (uCloudBox.z > 0.0 && all(greaterThan(sq, vec2(0.0))) && all(lessThan(sq, vec2(1.0)))) {
        float sky = texture2D(uSkyMask, sq).r;
        vec2 cq = vec2(uCloud.x + (1.0 - uCloud.x) * ((uv - uCloudBox.xy) / uCloudBox.zw).x - uCloud.y, sq.y);
        vec3 cl = uAfter > 0.5 ? texture2D(uCloudsAfter, cq).rgb : texture2D(uClouds, cq).rgb;
        c = mix(c, cl, sky);
      }
      // The painted sun flecks move as the leaves above them move (a moment behind them).
      float f0 = m.a;
      float f1 = texture2D(uMaps, uv - vec2(w.w * 5.0, w.w * 1.5) * uPx * uMotion).a;
      c *= 1.0 + (f1 - f0) * 0.75 * (1.0 - uAfter);
      c = evening(c, uv);
      vec2 sk = (uv - uSkyBox.xy) / uSkyBox.zw;
      if (uDuskSky > 0.0 && all(greaterThan(sk, vec2(0.0))) && all(lessThan(sk, vec2(1.0)))) {
        vec4 s = texture2D(uSky, sk);
        c = c * (1.0 - s.a * uDuskSky) + s.rgb * uDuskSky;
      }
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    if (uKind > 3.5) {
      // A close-up. The breath: the chest swells toward the eye (a few pixels at its middle).
      vec2 uv = vUv;
      if (uChest.z > 0.0) {
        vec2 q = (uv - uChest.xy) / uChest.zw;
        float e = 1.0 - smoothstep(0.0, 1.0, dot(q, q));
        uv = uChest.xy + (uv - uChest.xy) * (1.0 - uBreathe * e);
      }
      // The grass in the air (where the drawing says it may move: never near what changes).
      float g = texture2D(uFrame, uv).a;
      if (g > 0.0) {
        vec4 w = windAt(uv.x);
        float clump = sin(uTime * 3.4 + texture2D(uNoise, uv * vec2(0.7, 0.45) + 0.31).r * 6.2831);
        float dx = (w.x * 4.0 + clump * 1.2) * g * uMotion;
        dx = 6.0 * dx / sqrt(36.0 + dx * dx);
        uv += vec2(dx, -0.25 * abs(dx)) * uPx;
      }
      vec3 c = texture2D(uFrame, uv).rgb;
      // The drawing of now, over the part that changes (premultiplied, as decoded).
      vec2 cq = (uv - uCelRect.xy) / uCelRect.zw;
      if (uCel.z > 0.0 && all(greaterThan(cq, vec2(0.0))) && all(lessThan(cq, vec2(1.0)))) {
        vec4 cel = texture2D(uCels, uCel.xy + cq * uCel.zw);
        c = c * (1.0 - cel.a) + cel.rgb;
      }
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    if (uKind > 2.5) {
      vec2 q = vUv * 2.0 - 1.0;
      float r = length(q);
      if (vMote.x < 0.5) {
        // A mote: soft, warm, seen only where the sun is (the painted light under it), and less
        // against what is already bright.
        // (After the cut the afternoon's sun flecks are gone: an even evening light.)
        vec4 m = texture2D(uMaps, vScene);
        float bg = dot((uAfter > 0.5 ? texture2D(uAfterPlate, vScene) : texture2D(uPlate, vScene)).rgb, vec3(0.3, 0.59, 0.11));
        float sun = uAfter > 0.5 ? 0.35 : smoothstep(0.05, 0.4, m.a);
        float lit = (0.3 + 0.7 * sun) * (1.0 - 0.5 * bg);
        float a = exp(-r * r * 5.0) * vMote.y * lit * vMote.z * 0.9;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, 0.0);
      } else if (vMote.x < 1.5) {
        // A seed: a little puff of white threads.
        float ang = atan(q.y, q.x + 1e-6);
        float threads = pow(abs(cos(ang * 4.0 + vMote.w)), 14.0) * (1.0 - smoothstep(0.15, 1.0, r));
        float a = clamp(exp(-r * r * 14.0) + exp(-r * r * 3.0) * 0.25 + threads * 0.7, 0.0, 1.0) * vMote.y;
        gl_FragColor = vec4(vec3(0.97, 0.96, 0.9) * a, a * 0.85);
      } else {
        // A leaf: a pointed oval, darker along its middle, its two sides as it turns over.
        float leaf = 1.0 - smoothstep(0.85, 1.0, length(vec2(q.x, q.y * 0.55)) + abs(q.x) * 0.25);
        vec3 col = mix(vec3(0.33, 0.42, 0.14), vec3(0.55, 0.6, 0.22), step(0.0, vMote.z));
        col *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.12, abs(q.x)));
        float a = leaf * vMote.y;
        gl_FragColor = vec4(col * a, a);
      }
      return;
    }
    if (uKind > 1.5) {
      // A flower's head (premultiplied, cut from the plate); only in the afternoon.
      vec4 f = texture2D(uFlowers, vUv);
      gl_FragColor = f * leafLight(vScene) * (1.0 - uAfter);
      return;
    }
    // The people (premultiplied, as decoded).
    vec4 f;
    if (vPart > 0.5) {
      // Her forearm: under her sleeve where it has slid into it.
      f = texture2D(uFigures, row(vUv, 1.0, uFigRows));
      f *= 1.0 - texture2D(uLids, row(clamp(vDest, 0.0, 1.0), 2.0, uLidRows)).a;
    } else {
      f = texture2D(uFigures, row(vUv, 0.0, uFigRows));
      float shut = vUv.x < uSplit ? uBlinkA : uBlinkB;
      if (shut > 0.0) {
        vec4 lid = texture2D(uLids, row(vUv, shut > 0.75 ? 0.0 : 1.0, uLidRows));
        f.rgb = f.rgb * (1.0 - lid.a) + lid.rgb;
      }
    }
    vec3 col = f.rgb * leafLight(vScene);
    col = evening(col, vScene);
    // To graphite: the colour leaves first (the room's own grammar).
    vec3 g = vec3(dot(col, vec3(0.3, 0.59, 0.11))) * 0.85;
    gl_FragColor = vec4(mix(g, col, uColour), f.a) * uPeople;
  }
`;

export interface LivingMaterials {
  /** The one program; `plate` and `people` share it (two instances, so each keeps its own textures). */
  plate: THREE.ShaderMaterial;
  people: THREE.ShaderMaterial;
  /** The near flowers on their stems (`uKind` 2). */
  flowers: THREE.ShaderMaterial;
  /** Motes, seeds, a leaf, in the air (`uKind` 3). */
  air: THREE.ShaderMaterial;
  /** A close-up's drawings (`uKind` 4). */
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
    uPush: { value: new THREE.Vector3(0.5, 0.5, 0) },
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
    uCels: { value: empty },
    uCel: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCelRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uChest: { value: new THREE.Vector4(0, 0, 0, 0) },
    uBreathe: { value: 0 },
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
