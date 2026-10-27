/** Just enough of Web Audio to see what is scheduled, when, and what is left connected. */
export class FakeParam {
  value = 0;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    this.value = v;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['ramp', v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
  }
  setTargetAtTime(v: number, t: number) {
    this.events.push(['target', v, t]);
  }
  /** As Web Audio: every event at or after `t` is dropped. */
  cancelScheduledValues(t: number) {
    this.events = this.events.filter((e) => e[2] < t);
  }
  /**
   * The value at context time `t` as Web Audio computes it: events ordered by time (not by call),
   * a value held until the next event, a ramp running from the event before it.
   */
  valueAt(t: number, initial = 1): number {
    const ev = this.events.map((e, i) => ({ kind: e[0], v: e[1], t: e[2], i })).sort((a, b) => a.t - b.t || a.i - b.i);
    let pt = -Infinity, pv = initial;
    for (const e of ev) {
      if (e.t <= t) {
        pt = e.t;
        pv = e.v;
        continue;
      }
      if (e.kind === 'ramp' && Number.isFinite(pt)) return pv + ((e.v - pv) * (t - pt)) / (e.t - pt);
      if (e.kind === 'exp' && Number.isFinite(pt) && pv > 0 && e.v > 0) return pv * Math.pow(e.v / pv, (t - pt) / (e.t - pt));
      return pv;
    }
    return pv;
  }
}
export class FakeNode {
  out = new Set<FakeNode>();
  constructor(public ctx: FakeCtx) {
    ctx.nodes.add(this);
  }
  connect(n: FakeNode) {
    this.out.add(n);
    return n;
  }
  disconnect() {
    this.out.clear();
    this.ctx.nodes.delete(this);
  }
}
export class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startAt: [number, number] | null = null;
  stopAt: number | null = null;
  onended: (() => void) | null = null;
  start(t: number, offset: number) {
    this.startAt = [t, offset];
    this.ctx.sources.push(this);
  }
  stop(t = this.ctx.currentTime) {
    this.stopAt = t;
  }
}
export class FakeCtx {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  nodes = new Set<FakeNode>();
  sources: FakeSource[] = [];
  createBufferSource() {
    return new FakeSource(this);
  }
  createGain() {
    return Object.assign(new FakeNode(this), { gain: new FakeParam() });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(this), { type: '', Q: new FakeParam(), frequency: new FakeParam() });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(this), { pan: new FakeParam() });
  }
  createPanner() {
    return Object.assign(new FakeNode(this), { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam() });
  }
  createConvolver() {
    return Object.assign(new FakeNode(this), { buffer: null });
  }
  // (Enough for the engine itself: its limiter, analyser, reverb impulses and the speakers.)
  sampleRate = 8000;
  private dest: FakeNode | null = null;
  get destination() {
    if (!this.dest) (this.dest = new FakeNode(this)), this.nodes.delete(this.dest);
    return this.dest;
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(this), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createAnalyser() {
    return Object.assign(new FakeNode(this), { fftSize: 0 });
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, getChannelData: (i: number) => data[i] };
  }
  /** Advance the clock, ending every source whose stop time (or natural end) has passed. */
  advance(dt: number) {
    this.currentTime += dt;
    for (const s of this.sources) {
      const end = s.stopAt ?? (s.loop ? Infinity : s.startAt![0] + s.buffer!.duration - s.startAt![1]);
      if (s.onended && end <= this.currentTime) s.onended();
    }
  }
}

