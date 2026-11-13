/** A canvas and its 2D context. `readBack` keeps it on the CPU, for canvases whose pixels are read back (no GPU readback stall). */
export function canvas(w: number, h: number, readBack = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', readBack ? { willReadFrequently: true } : undefined)!];
}
