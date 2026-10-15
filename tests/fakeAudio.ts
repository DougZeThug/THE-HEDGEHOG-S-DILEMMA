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
  cancelScheduledValues() {}
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
  /** Advance the clock, ending every source whose stop time (or natural end) has passed. */
  advance(dt: number) {
    this.currentTime += dt;
    for (const s of this.sources) {
      const end = s.stopAt ?? (s.loop ? Infinity : s.startAt![0] + s.buffer!.duration - s.startAt![1]);
      if (s.onended && end <= this.currentTime) s.onended();
    }
  }
}

