export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. `tau` is the time constant in seconds. */
export const approach = (current: number, target: number, dt: number, tau: number) =>
  tau <= 0 ? target : current + (target - current) * (1 - Math.exp(-dt / tau));
export const angleDiff = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** Cosine ease: 0 → 1 over x in 0..1, flat at both ends. */
export const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
