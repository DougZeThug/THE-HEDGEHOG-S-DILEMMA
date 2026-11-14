import { isSpot, type Cue, type CueKind } from './cueSheet';
import type { MemoryAudioHost } from './MemoryAudio';

/**
 * The nodes between a cue's gain and the room: its lowpass and highpass, then where it sits (a bed
 * or wide music is the place's air, a stereo pan; anything else a point, an HRTF panner that may
 * travel to `cue.to` over `dur`), sent to the memory bus and, unless `dry`, into the memory's own
 * small room. `gain` is already fed by the source; returns the nodes it made, in order, so they
 * can all be let go.
 */
export function cueGraph(host: Pick<MemoryAudioHost, 'ctx' | 'out' | 'where'>, room: ConvolverNode, gain: GainNode, cue: Cue, kind: CueKind, at: number, dur: number): AudioNode[] {
  const c = host.ctx;
  const nodes: AudioNode[] = [];
  let node: AudioNode = gain;
  if (cue.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(cue.lowpass, at);
    if (cue.lowpassTo && Number.isFinite(dur)) lp.frequency.exponentialRampToValueAtTime(cue.lowpassTo, at + dur);
    node.connect(lp);
    node = lp;
    nodes.push(lp);
  }
  if (cue.highpass) {
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 0.7;
    hp.frequency.setValueAtTime(cue.highpass, at);
    node.connect(hp);
    node = hp;
    nodes.push(hp);
  }
  let out: AudioNode;
  if (kind === 'bed' || (kind === 'music' && cue.wide)) {
    // A bed is the place's air: wide, leaning toward the window, not a point (and music
    // marked wide is the place's air laid along the timeline).
    const sp = c.createStereoPanner();
    const pan = isSpot(cue.place) ? { left: -0.5, right: 0.5 }[cue.place.at as 'left'] ?? 0 : cue.place.u * 0.6;
    sp.pan.value = Math.max(-1, Math.min(1, pan));
    out = sp;
  } else {
    const [x, y, z] = host.where(cue.place);
    const p = c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    // A voice falls off as the room's speech does (it stays intelligible a few metres away).
    p.refDistance = kind === 'voice' ? 2 : 1.5;
    p.rolloffFactor = kind === 'voice' ? 0.6 : 0.8;
    p.maxDistance = 30;
    p.positionX.setValueAtTime(x, at);
    p.positionY.setValueAtTime(y, at);
    p.positionZ.setValueAtTime(z, at);
    if (cue.to && Number.isFinite(dur)) {
      const [x2, y2, z2] = host.where(cue.to);
      p.positionX.linearRampToValueAtTime(x2, at + dur);
      p.positionY.linearRampToValueAtTime(y2, at + dur);
      p.positionZ.linearRampToValueAtTime(z2, at + dur);
    }
    out = p;
  }
  node.connect(out);
  nodes.push(out);
  out.connect(host.out);
  if (!cue.dry) out.connect(room);
  return nodes;
}
