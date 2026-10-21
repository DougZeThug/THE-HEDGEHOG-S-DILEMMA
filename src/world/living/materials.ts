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
 *  - What is in the air (`uKind` 3): motes, seen only in the sun.
 *  - The ground round them in the two-shot (`uKind` 4): out of focus, barely stirring.
 *  - The two-shot (`uNear`, scripts/two-shot.py): the people close, from the character sheet's own
 *    panel (an atlas reaching as far across it as the camera looks); their eyes looking (the iris
 *    moves along each opening, the white filling in where it was; the lash line stays drawn); the
 *    light on them as the wide's, at the same place on the painting, so a cut keeps it.
 *  - Her head as the artist redrew it, in either shot (cells, laid in on held keys).
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
                             // a mote: its kind (0), its index, its size (px)
  attribute vec2 home;       // a mote: where it starts (painting uv, hashed on the CPU)
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
      float kind = stem.x, n = stem.y, size = stem.z;
      vec2 at;
      float show = 1.0, spin = 1.0;
      {
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
      }
      vScene = at;
      vDest = at;
      vMote = vec4(kind, show, spin, n);
      // The quad round it (position.xy is its corner, ±1).
      vec2 corner = position.xy * size * uPx;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(at + corner, 0.0, 1.0);
      return;
    }
    if (uKind < 0.5 || uKind > 3.5) {
      // The plate, or the two-shot's ground: a square (placed by its mesh).
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
      vec2 at = position.xy + vec2(dx, -0.3 * abs(dx) * b) * uPx;
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
    vScene = uPlace.xy + f * uPlace.zw;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vScene, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uKind;
  uniform sampler2D uPlate, uMaps, uGrade, uSky, uAfterPlate;
  uniform float uAfter;      // 0 the afternoon, 1 the same place later (a cut: never between)
  uniform sampler2D uFigures, uLids, uFlowers, uSkyMask, uClouds, uCloudsAfter;
  uniform sampler2D uFrame;  // the ground round them in the two-shot (its map, uMaps: R where the air may move it)
  uniform vec4 uCloudBox;    // where the drifting sky is: x0, y0, w, h (painting uv)
  uniform vec2 uCloud;       // its layers' left margin (a fraction of their width), how far it has drifted (the same)
  uniform vec2 uFigRows;     // an atlas row's height and pitch (fractions of the atlas): figures
  uniform vec2 uLidRows;     // and lids (rows: shut, half, her sleeve)
  uniform float uFigU;       // how far across the panel the figures' atlas reaches (figure u)
  uniform vec4 uLidBox;      // the part of the panel the lids' rows cover (figure uv: x0, y0, w, h)
  uniform vec2 uPx;          // one plate pixel, in uv
  uniform float uDusk;       // 0 afternoon .. 1 the evening's colour
  uniform float uDuskSky;    // the real dusk sky in the gap (0..1)
  uniform vec4 uSkyBox;      // where the gap is: x0, y0, w, h (painting uv)
  uniform vec2 uParallax;    // the view's shift at depth 1 (uv), from the visitor's small looks
  uniform float uBlinkA, uBlinkB; // 0 open, 0.5 the half lid, 1 shut
  uniform float uSplit;      // figure u between A and B (eyes left of it are A's)
  uniform float uColour;     // the people: 1 painted, 0 graphite
  uniform float uPeople;     // how present they are at all
  // The two-shot: on (1) or not; where the people lie on the painting in the wide (its light on
  // them is the wide's there: painting uv, x0, y0, w, h).
  uniform float uNear;
  uniform vec4 uWidePlace;
  uniform vec2 uSheet;       // the panel's own pixels (the figure uv's scale: stage px)
  // Her turn: an atlas of cells (its drawings, then the region they are laid in by), where they lie
  // (figure uv: x0, y0, w, h), which is shown (−1 none) and how many cells, and how they are laid
  // out (columns, rows, left to right and top to bottom; each cell's inset in its frame, a fraction
  // of its pitch across and up).
  uniform sampler2D uHeads;
  uniform vec4 uHeadBox;
  uniform vec2 uHeadCel;
  uniform vec4 uHeadGrid;
  // Their eyes looking (how far each one's irises have moved: fractions of each opening's radii,
  // along it and across it, up positive): his, then hers. Each eye's opening (centre, stage px y
  // up, and radii), its iris (centre, radius; and the opening's angle), and its white.
  uniform vec2 uGaze, uGazeB;
  uniform vec4 uEyes[4];
  uniform vec4 uIrises[4];
  uniform vec3 uWhites[4];
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

  // The figures' atlas at figure uv (none past where it reaches).
  vec4 figureAt(vec2 uv, float r) {
    if (uv.x > uFigU) return vec4(0.0);
    return texture2D(uFigures, row(vec2(uv.x / uFigU, uv.y), r, uFigRows));
  }

  // A lid's drawing (r: 0 shut, 1 half, 2 her sleeve) at figure uv, where the lids' rows cover.
  vec4 lidAt(vec2 uv, float r) {
    vec2 q = (uv - uLidBox.xy) / uLidBox.zw;
    if (any(lessThan(q, vec2(0.0))) || any(greaterThan(q, vec2(1.0)))) return vec4(0.0);
    return texture2D(uLids, row(q, r, uLidRows));
  }

  // Where a point of her head's box (hq, 0..1 up) is in cell i of her turn's atlas.
  vec2 headCell(float i, vec2 hq) {
    float r = floor(i / uHeadGrid.x + 0.001), c = i - r * uHeadGrid.x;
    vec2 inner = uHeadGrid.zw + hq * (1.0 - 2.0 * uHeadGrid.zw);
    return vec2((c + inner.x) / uHeadGrid.x, (uHeadGrid.y - 1.0 - r + inner.y) / uHeadGrid.y);
  }

  // An eye looking by g at p (stage px, y up), over what is drawn there (c): inside its opening,
  // its iris where it has moved to (as drawn, from where it was drawn), the white where it was;
  // outside the opening, the lash line and the lid, as drawn.
  vec3 looking(vec3 c, vec2 p, vec4 e, vec4 ir, vec3 white, vec2 g) {
    float cs = cos(ir.w), sn = sin(ir.w);
    vec2 r = p - e.xy;
    vec2 q = vec2(cs * r.x + sn * r.y, -sn * r.x + cs * r.y) / e.zw;
    float m = 1.0 - smoothstep(0.82, 1.0, length(q));
    if (m <= 0.0) return c;
    vec2 dl = g * e.zw;
    vec2 src = p - vec2(cs * dl.x - sn * dl.y, sn * dl.x + cs * dl.y);
    vec2 rs = src - e.xy;
    vec2 qs = vec2(cs * rs.x + sn * rs.y, -sn * rs.x + cs * rs.y) / e.zw;
    float iris = (1.0 - smoothstep(ir.z - 0.7, ir.z + 0.3, distance(src, ir.xy))) * (1.0 - smoothstep(0.85, 1.0, length(qs)));
    // (The white is shaded under the upper lid, as drawn.)
    float was = 1.0 - smoothstep(ir.z - 0.2, ir.z + 0.8, distance(p, ir.xy));
    vec3 base = mix(c, white * mix(1.0, 0.8, smoothstep(-0.2, 0.9, q.y)), was);
    vec3 moved = figureAt(src / uSheet, 0.0).rgb;
    return mix(c, mix(base, moved, iris), m);
  }

  void main() {
    if (uKind < 0.5) {
      vec4 m0 = texture2D(uMaps, vUv);
      vec2 uv = vUv + uParallax * (m0.r - 0.4);
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
      // The leaves: their edges against the sky most (the map's sway is larger there); a few
      // pixels, never more, a gust too (at 16 px the far trees and the mountain smeared).
      float leaves = w.z * 5.0 * m.g;
      leaves = 7.0 * leaves / sqrt(49.0 + leaves * leaves);
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
      float sky = 0.0;
      if (uCloudBox.z > 0.0 && all(greaterThan(sq, vec2(0.0))) && all(lessThan(sq, vec2(1.0)))) {
        // (Its matte: R the afternoon's, G the evening's: their leaves aren't quite in the same
        // places, and through the afternoon's the evening sky showed leaf-shaped halos.)
        vec2 mm = texture2D(uSkyMask, sq).rg;
        sky = uAfter > 0.5 ? mm.g : mm.r;
        vec2 cq = vec2(uCloud.x + (1.0 - uCloud.x) * ((uv - uCloudBox.xy) / uCloudBox.zw).x - uCloud.y, sq.y);
        vec3 cl = uAfter > 0.5 ? texture2D(uCloudsAfter, cq).rgb : texture2D(uClouds, cq).rgb;
        c = mix(c, cl, sky);
      }
      // The painted sun flecks move as the leaves above them move (a moment behind them, a few
      // pixels at most); not in the sky, whose bright clouds the flecks map holds too (a gust
      // printed shifted copies of their edges: the directors' film review, 2026-10-17).
      float f0 = m.a;
      vec2 fs = vec2(w.w * 5.0, w.w * 1.5);
      fs *= 5.0 / sqrt(25.0 + dot(fs, fs));
      float f1 = texture2D(uMaps, uv + fs * uPx * uMotion).a;
      c *= 1.0 + (f1 - f0) * 0.75 * (1.0 - uAfter) * (1.0 - sky);
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
      // The ground round them (the two-shot): its grass in the air, as far as its map says.
      vec2 uv = vUv;
      float g = texture2D(uMaps, uv).r;
      if (g > 0.0) {
        vec4 w = windAt(uv.x);
        float clump = sin(uTime * 3.4 + texture2D(uNoise, uv * vec2(0.7, 0.45) + 0.31).r * 6.2831);
        float dx = (w.x * 4.0 + clump * 1.2) * g * uMotion;
        dx = 6.0 * dx / sqrt(36.0 + dx * dx);
        uv += vec2(dx, -0.25 * abs(dx)) * uPx;
      }
      gl_FragColor = vec4(texture2D(uFrame, uv).rgb, 1.0);
      return;
    }
    if (uKind > 2.5) {
      vec2 q = vUv * 2.0 - 1.0;
      float r = length(q);
      {
        // A mote: soft, warm, seen only where the sun is (the painted light under it), and less
        // against what is already bright.
        // (After the cut the afternoon's sun flecks are gone: an even evening light.)
        vec4 m = texture2D(uMaps, vScene);
        float bg = dot((uAfter > 0.5 ? texture2D(uAfterPlate, vScene) : texture2D(uPlate, vScene)).rgb, vec3(0.3, 0.59, 0.11));
        float sun = uAfter > 0.5 ? 0.35 : smoothstep(0.05, 0.4, m.a);
        // (None in the shade: one there, catching the sun on a dark ground, glowed cyan-white, a
        // sparkle: the directors' film review, 2026-10-18.)
        float lit = sun * (1.0 - 0.5 * bg);
        float a = exp(-r * r * 5.0) * vMote.y * lit * vMote.z * 0.9;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, 0.0);
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
      f = figureAt(vUv, 1.0);
      f *= 1.0 - lidAt(clamp(vDest, 0.0, 1.0), 2.0).a;
    } else {
      vec2 uvF = vUv;
      if (uNear > 0.5) {
        // Their bed's grass in the air (the two-shot): bent a little by the wind where they lie on
        // the painting, but close up it is many clumps, each its own: never on them nor within 6
        // sheet px of them (its map, uMaps here: R), less where it is out of focus and round their
        // faces. (Weaker, and kept off the grass between them, the heart moved half as much as the
        // second wide: the artist's "still images" again.)
        float sw = texture2D(uMaps, vec2(vUv.x / uFigU, vUv.y)).r;
        if (sw > 0.0) {
          vec2 at = uWidePlace.xy + vUv * uWidePlace.zw;
          float w = windAt(at.x).x;
          // Clumps about 80 sheet px across (the noise's cells), each with its own phase and its
          // own pace, which wanders ±20% (bounded: a pace of its own kept would shear them apart
          // over the shot), and swaying as far as the air takes it. (The wide's clumps and the
          // wind's bend, magnified, moved the whole bed as one sheet on one clock, 0.8–0.96 alike
          // across it: a wave-warp, the cinematic director's evaluation of the film, 2026-10-18.)
          vec2 q = vUv * uSheet / 1280.0;
          float n1 = texture2D(uNoise, q + 0.47).r, n2 = texture2D(uNoise, q + vec2(0.21, 0.66)).r;
          float clump = sin(uTime * 3.4 + 2.0 * sin(uTime * 0.34 + 9.42 * n2) + 9.42 * n1) * (0.3 + 0.7 * min(1.0, abs(w)));
          float dx = (w * 1.5 + clump * 3.2) * sw * uMotion;
          dx = 7.0 * dx / sqrt(49.0 + dx * dx);
          uvF += vec2(dx, -0.25 * abs(dx)) / uSheet;
        }
      }
      f = figureAt(uvF, 0.0);
      // Their eyes looking (the two-shot): the iris moves along each opening.
      if (uGaze != vec2(0.0) || uGazeB != vec2(0.0)) {
        vec2 p = vUv * uSheet;
        if (uGaze != vec2(0.0)) {
          f.rgb = looking(f.rgb, p, uEyes[0], uIrises[0], uWhites[0], uGaze);
          f.rgb = looking(f.rgb, p, uEyes[1], uIrises[1], uWhites[1], uGaze);
        }
        if (uGazeB != vec2(0.0)) {
          f.rgb = looking(f.rgb, p, uEyes[2], uIrises[2], uWhites[2], uGazeB);
          f.rgb = looking(f.rgb, p, uEyes[3], uIrises[3], uWhites[3], uGazeB);
        }
      }
      // Her turn's drawing, laid in by its own soft region (held: never mixed between drawings;
      // only the region's edge is soft, and it lies where every drawing is the panel).
      bool redrawn = false;
      if (uHeadCel.x >= 0.0) {
        // (where their bed's grass sways, so does the grass at the drawing's soft edge: it lies
        // where the body's does; on them uvF is vUv)
        vec2 hq = (uvF - uHeadBox.xy) / uHeadBox.zw;
        if (all(greaterThan(hq, vec2(0.0))) && all(lessThan(hq, vec2(1.0)))) {
          vec4 cel = texture2D(uHeads, headCell(uHeadCel.x, hq));
          float m = texture2D(uHeads, headCell(uHeadCel.y - 1.0, hq)).r;
          f = f * (1.0 - m) + cel * m;
          redrawn = m > 0.02;
        }
      }
      float shut = vUv.x < uSplit ? uBlinkA : uBlinkB;
      // (Her lids are drawn for her eyes as the panel has them: not over a redrawn head.)
      if (shut > 0.0 && !redrawn) {
        vec4 lid = lidAt(vUv, shut > 0.75 ? 0.0 : 1.0);
        f.rgb = f.rgb * (1.0 - lid.a) + lid.rgb;
      }
    }
    vec3 col = f.rgb;
    // The leaves' light on them, where they lie on the painting (in the two-shot too: the same
    // place, so the cut keeps it).
    col *= leafLight(uNear > 0.5 ? uWidePlace.xy + vDest * uWidePlace.zw : vScene);
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

/**
 * A film's frame as it is (src/memory/living/FilmScene.ts): its pixels in sRGB, like the
 * paintings' (the window composites in sRGB).
 */
const FILM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FILM_FRAG = /* glsl */ `
  uniform sampler2D uFilm;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(uFilm, vUv).rgb, 1.0); }
`;
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
