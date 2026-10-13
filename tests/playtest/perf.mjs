// Performance and continuity, in a browser: startup, frame pacing, shader programs, GPU
// memory, and fixed-state frames for comparing before and after a visual change.
//
//   npm run build && npx vite preview --port 4180 --strictPort &
//   BASE=http://localhost:4180/ OUT=test-output/perf/<label> node tests/playtest/perf.mjs
//
// Writes OUT/perf.json and OUT/<profile>-<state>.png. Under software GL (SwiftShader, as in CI
// containers) absolute frame times are meaningless; counts (programs, textures, draw calls),
// memory, startup ordering and relative changes between two runs on the same machine are not.
// A real GPU run is the same command against a real browser (CHROMIUM_PATH, HEADED=1).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  ({ chromium, devices } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output/perf/run';
const SAMPLE_S = Number(process.env.SAMPLE_S ?? 8);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: !process.env.HEADED,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  // Too few frames to say anything (one very long frame under software GL): marked, not reported as data.
  if (s.length < 10) return { n: s.length, invalid: true, max: s.length ? +s[s.length - 1].toFixed(1) : null };
  return { n: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1), over50: s.filter((x) => x > 50).length };
};

/** Frame intervals over `seconds` of real time, from the page's own rAF. */
const framePacing = (page, seconds) =>
  page.evaluate(
    (s) =>
      new Promise((done) => {
        const out = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now) => {
          out.push(now - last);
          last = now;
          if (now - t0 < s * 1000) requestAnimationFrame(tick);
          else done(out.slice(1));
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );

/** What the GPU holds: programs, textures and their estimated bytes, geometries, the last frame's draw calls. */
const gpu = (page) =>
  page.evaluate(() => {
    const a = window.__hedgehog;
    const r = a.renderer;
    const seen = new Set();
    let texBytes = 0;
    const tex = (t) => {
      if (!t || seen.has(t)) return;
      seen.add(t);
      const img = t.image;
      const w = img?.width ?? 0, h = img?.height ?? 0;
      const bpp = t.type === 1016 /* HalfFloat */ ? 8 : 4;
      texBytes += w * h * bpp * (t.generateMipmaps !== false ? 1.33 : 1);
    };
    a.scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) for (const k of ['map', 'bumpMap', 'roughnessMap', 'normalMap', 'alphaMap', 'emissiveMap']) tex(m[k]);
    });
    // The composer renders several passes; three resets its counts after each unless told
    // not to. Count one whole frame.
    if (!a.__perfWrapped) {
      a.__perfWrapped = true;
      r.info.autoReset = false;
      const post = a.post;
      const render = post.render.bind(post);
      post.render = () => {
        r.info.reset();
        render();
        a.__lastFrame = { calls: r.info.render.calls, triangles: r.info.render.triangles };
        (a.__recent ??= []).push(a.__lastFrame);
        if (a.__recent.length > 30) a.__recent.shift();
      };
    }
    // The composer's targets too: two RGBA16F colour buffers, and MSAA storage when sampling.
    const comp = a.post.composer;
    for (const rt of [comp.renderTarget1, comp.renderTarget2]) {
      const px = rt.width * rt.height;
      texBytes += px * 8 * Math.max(1, rt.samples || 0);
    }
    const gl = r.getContext();
    return {
      programs: r.info.programs?.length ?? null,
      programKeys: (r.info.programs ?? []).map((p) => p.cacheKey),
      textures: r.info.memory.textures,
      geometries: r.info.memory.geometries,
      calls: a.__lastFrame?.calls ?? null,
      triangles: a.__lastFrame?.triangles ?? null,
      sceneTextureMB: +(texBytes / 1048576).toFixed(2),
      parallelCompile: !!gl.getExtension('KHR_parallel_shader_compile'),
      timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
      renderer: (() => {
        const d = gl.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    };
  });

/** Put the visitor somewhere fixed, looking at something fixed, and hold still for a frame. */
const stand = (page, from, to) =>
  page.evaluate(
    ([f, t]) => {
      const a = window.__hedgehog;
      a.rig.cancelAttend();
      a.rig.pos.set(f[0], 0, f[2]);
      const eye = a.rig.eye ?? 1.58;
      const dx = t[0] - f[0], dy = t[1] - eye, dz = t[2] - f[2];
      a.rig.yaw = Math.atan2(-dx, -dz);
      a.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    [from, to],
  );

const result = { base: BASE, at: new Date().toISOString(), profiles: {} };
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', { ...devices['iPhone 13'], deviceScaleFactor: 1 }],
]) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  // Long tasks (main thread blocked > 50 ms): startup and the opening's stalls.
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__longTasks.push([Math.round(e.startTime), Math.round(e.duration)]);
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const r = { errors };
  const t0 = Date.now();
  await page.goto(`${BASE}?seed=7`);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
  r.readyMs = Date.now() - t0;
  r.nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transferKB: Math.round(performance.getEntriesByType('resource').reduce((a, e) => a + (e.transferSize || 0), 0) / 1024) };
  });
  r.threshold = await gpu(page);
  const tEnter = Date.now();
  await page.click('#enter');
  await page.waitForFunction(() => (window.__hedgehog.score.t ?? 0) > 0.2, null, { timeout: 60000 });
  r.enterToScoreMs = Date.now() - tEnter;
  // The opening, whole: when the room is handed over, and how the frames went meanwhile.
  const opening = framePacing(page, 6);
  r.openingFrames = stats(await opening);
  await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 90000 });
  r.handoffS = +(await page.evaluate(() => window.__hedgehog.handoffAt ?? 0)).toFixed(1);
  r.handoffWallMs = Date.now() - tEnter;
  await page.waitForTimeout(1500);
  r.gpu = await gpu(page);
  // Steady state in the room: standing, looking at the chair.
  await stand(page, [0.1, 0, 2.6], [0, 0.6, 0]);
  await page.waitForTimeout(800);
  r.roomFrames = stats(await framePacing(page, SAMPLE_S));
  // Draw calls from a fixed pose: a still frame, and a frame that redraws the chair's shadow
  // (the shadow map is redrawn only when the light or the chair moves).
  r.stillFrame = { ...(await gpu(page)) };
  r.stillFrame = { calls: r.stillFrame.calls, triangles: r.stillFrame.triangles };
  r.shadowFrame = await page.evaluate(async () => {
    const a = window.__hedgehog;
    a.__recent = [];
    a.lighting.invalidateShadow();
    await new Promise((d) => setTimeout(d, 1500));
    return a.__recent.reduce((m, f) => (f.calls > m.calls ? f : m), { calls: 0, triangles: 0 });
  });
  // Fixed frames for continuity (compare by eye, or diff two runs).
  for (const [state, from, to] of [
    ['chair', [0.1, 0, 2.6], [0, 0.6, 0]],
    ['east', [-1.6, 0, 0.3], [3.2, 1.3, 0.3]],
    ['west', [1.6, 0, -0.3], [-3.2, 1.0, -0.3]],
  ]) {
    await stand(page, from, to);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}-${state}.png`, timeout: 120000 });
  }
  // The memory of light, playing: frames and draw calls while it is on the wall.
  await page.evaluate(() => {
    const a = window.__hedgehog;
    a.text.setShown('kitchen-light');
    const w = a.text.whereIs('kitchen-light');
    const n = { east: [-1, 0], west: [1, 0], north: [0, 1], south: [0, -1] }[w.surface];
    a.rig.cancelAttend();
    a.rig.pos.set(w.centre.x + n[0] * 2.2, 0, w.centre.z + n[1] * 2.2);
    a.rig.yaw = Math.atan2(-(w.centre.x - a.rig.pos.x), -(w.centre.z - a.rig.pos.z));
    a.rig.pitch = -0.1;
    a.apply({ type: 'memory', phraseId: 'kitchen-light', attack: 3, hold: 6, release: 4 });
  });
  await page.waitForFunction(() => window.__hedgehog.memoryLight.mesh.material.uniforms.uEnv.value > 0.95, null, { timeout: 120000 });
  r.memoryFrames = stats(await framePacing(page, Math.min(4, SAMPLE_S)));
  r.memoryGpu = await gpu(page);
  r.gpuAfter = await gpu(page);
  // Shaders are compiled before the visitor enters: none should be compiled later. Programs
  // by key, not a count (one released and another compiled would cancel out).
  const before = new Set(r.threshold.programKeys);
  r.programsAddedAfterEntering = r.gpuAfter.programKeys.filter((k) => !before.has(k)).length;
  for (const g of [r.threshold, r.gpu, r.memoryGpu, r.gpuAfter]) delete g.programKeys;
  const lt = await page.evaluate(() => window.__longTasks);
  r.longTasks = { count: lt.length, totalMs: lt.reduce((a, [, d]) => a + d, 0), worstMs: lt.reduce((a, [, d]) => Math.max(a, d), 0) };
  result.profiles[name] = r;
  console.log(name, JSON.stringify({ readyMs: r.readyMs, enterToScoreMs: r.enterToScoreMs, handoffWallMs: r.handoffWallMs, programsAtThreshold: r.threshold.programs, programsAdded: r.programsAddedAfterEntering, longTasks: r.longTasks, room: r.roomFrames, stillFrame: r.stillFrame, shadowFrame: r.shadowFrame, memory: r.memoryFrames, memoryCalls: r.memoryGpu.calls, gpu: { ...r.gpuAfter, renderer: undefined }, errors: errors.length }));
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/perf.json`, JSON.stringify(result, null, 1));
console.log(`perf → ${OUT}/perf.json`);
