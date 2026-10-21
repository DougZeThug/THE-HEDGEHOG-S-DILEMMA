import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import type { RuntimeHost } from '../src/memory/runtime';

// The pencil's order map is an optional living-memory asset (the light finds it): a flaky fetch
// must degrade to the designed `order: null` path, not throw the whole living scene away (the
// wall's poster). Every sibling auxiliary load (`heads`, `near`, `colourTimes`) fails soft by
// design; this holds the order fetch to the same contract. See docs/reviews/2026-10-woodland.md.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

const ORDER = './memories/woodland/afternoon/order.webp';
const POSTER = './memories/woodland/afternoon/scene.webp';

function stubFetch(failOrder: boolean, asked: string[]) {
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url);
    if (failOrder && url === ORDER) return new Response(null, { status: 404 });
    const file = `public/${url.replace(/^\.\//, '')}`;
    return existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 });
  });
}

function stubBrowser() {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close: vi.fn() }) as unknown as ImageBitmap);
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    cb(0);
    return 0;
  });
  // `colourTimes` reads the order bitmap via a 2D canvas (OffscreenCanvas or a page canvas). In
  // node neither exists, so without this stub the control test can only prove `colourAt: null`.
  // The stub returns a green channel of 0.5 everywhere, so `colourAt(u,v) === 0.5` for all uv.
  const ctx2d = {
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(128), // green = 128/255 ≈ 0.5
    }),
  };
  vi.stubGlobal('OffscreenCanvas', class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext() { return ctx2d; }
  });
}

function host(): RuntimeHost {
  return {
    renderer: { initTexture: () => {} } as unknown as THREE.WebGLRenderer,
    audio: null,
    quality: 'high',
    screen: { width: 1280, height: 720 },
    noise: new THREE.Texture(),
  };
}

describe('the pencil order map is optional (the light finds it)', () => {
  it('a failed fetch of the order map degrades to the unordered living scene, not the wall poster', async () => {
    const asked: string[] = [];
    stubFetch(true, asked);
    stubBrowser();
    const disposeSpy = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { prepare } = await import('../src/memory/runtime');
    const prepared = await prepare('woodland', 'afternoon', host());

    // The living scene plays (no fallback to the wall's poster).
    expect(prepared.living).not.toBeNull();
    // The order map went away (the designed unordered path).
    expect(prepared.living!.order).toBeNull();
    // The scene layer is the living render target, not a fetched poster.
    const scene = prepared.layers.find((l) => l.name === 'scene');
    expect(scene).toBeDefined();
    expect(scene!.texture).toBe(prepared.living!.scene.target.texture);
    // The wall poster was never fetched (the catch's fallback did not run).
    expect(asked).not.toContain(POSTER);
    // No living texture was disposed by the prepare() catch (the scene kept its art).
    expect(disposeSpy).not.toHaveBeenCalled();
    // The order file was asked for (and refused); the rest of the scene still loaded.
    expect(asked).toContain(ORDER);
    // The fetch failure is surfaced to QA (matches `colourTimes` on its read of the same map),
    // so a real 404 is visible without disposing the scene.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('order map could not be fetched'), expect.anything());

    prepared.dispose();
    warnSpy.mockRestore();
  });

  it('control: with the order fetch succeeding, the order map is bound (no regression to the ordered path)', async () => {
    const asked: string[] = [];
    stubFetch(false, asked);
    stubBrowser();
    const { prepare } = await import('../src/memory/runtime');
    const prepared = await prepare('woodland', 'afternoon', host());

    expect(prepared.living).not.toBeNull();
    expect(prepared.living!.order).toBeInstanceOf(THREE.Texture);
    // The order map's colour times are read (the wiring the degraded path loses): a function,
    // returning the stub's green channel (0.5 everywhere) — so `washInputs` has a `colourAt`.
    expect(prepared.living!.colourAt).toBeTypeOf('function');
    expect(prepared.living!.colourAt!(0.3, 0.7)).toBeCloseTo(128 / 255, 5);
    expect(asked).toContain(ORDER);
    // The poster is still not fetched: the living scene draws it.
    expect(asked).not.toContain(POSTER);

    prepared.dispose();
  });

  it('the living scene is double-dispose safe after a degraded order load', async () => {
    const asked: string[] = [];
    stubFetch(true, asked);
    stubBrowser();
    const disposeSpy = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const { prepare } = await import('../src/memory/runtime');
    const prepared = await prepare('woodland', 'afternoon', host());
    expect(prepared.living).not.toBeNull();
    expect(prepared.living!.order).toBeNull();
    // The living scene and its art are freed exactly once; a second dispose is a no-op (the
    // `gone` guard holds on the degraded path too).
    prepared.dispose();
    const freedOnce = disposeSpy.mock.calls.length;
    expect(freedOnce).toBeGreaterThan(0);
    prepared.dispose();
    expect(disposeSpy.mock.calls.length).toBe(freedOnce);
  });

  it('a manifest without an order field plays the living scene unordered (no regression to the omit path)', async () => {
    const asked: string[] = [];
    // Remove the order field from the committed manifest, as a memory authored without one.
    const manifestUrl = './memories/woodland/manifest.json';
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      if (url === manifestUrl) {
        const json = JSON.parse(readFileSync('public/memories/woodland/manifest.json', 'utf8'));
        json.living.afternoon.order = null;
        return new Response(JSON.stringify(json));
      }
      const file = `public/${url.replace(/^\.\//, '')}`;
      return existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 });
    });
    stubBrowser();
    const { prepare } = await import('../src/memory/runtime');
    const prepared = await prepare('woodland', 'afternoon', host());
    // The omit path already took Promise.resolve(null); the fix does not change it.
    expect(prepared.living).not.toBeNull();
    expect(prepared.living!.order).toBeNull();
    // The order file is never asked for when the manifest omits it.
    expect(asked).not.toContain(ORDER);
    prepared.dispose();
  });
});
