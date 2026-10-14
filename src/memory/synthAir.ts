/**
 * The air of a remembered room, made in the engine (no recording): soft, even pink noise between
 * 200 Hz and 5 kHz (no rumble, nothing a phone can't play), with a faint band of leaves stirring
 * at irregular, seeded moments, as a seamless 16 s loop. Two paid attempts at a recorded room
 * tone came back near-silent and mostly sub-bass (scripts/sfx-ledger.json); this is the bed the
 * sound designer recommended instead (docs/reviews/2026-10-living-memories.md).
 *
 * Normalised to about −45 dBFS RMS; the cue sheet's gain sets it in the scene.
 */
export async function synthAir(sampleRate: number, seed = 7, seconds = 16): Promise<AudioBuffer> {
  const fade = 1;
  const len = Math.floor((seconds + fade) * sampleRate);
  const off = new OfflineAudioContext(2, len, sampleRate);
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const pink = () => {
    const b = off.createBuffer(2, len, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = rnd();
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    return b;
  };
  const air = off.createBufferSource();
  air.buffer = pink();
  const hp = off.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 200;
  const lp = off.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  air.connect(hp).connect(lp).connect(off.destination);
  // Leaves: a 3–8 kHz band that stirs now and then (every 6–11 s, never on a beat).
  const leaves = off.createBufferSource();
  leaves.buffer = pink();
  const bp = off.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 5000;
  bp.Q.value = 0.7;
  const g = off.createGain();
  g.gain.setValueAtTime(0.05, 0);
  for (let t = 1 + (rnd() + 1) * 2; t < seconds + fade - 2; t += 6 + (rnd() + 1) * 2.5) {
    g.gain.setTargetAtTime(2.5, t, 0.3);
    g.gain.setTargetAtTime(0.05, t + 0.9, 0.6);
  }
  leaves.connect(bp).connect(g).connect(off.destination);
  air.start();
  leaves.start();
  const r = await off.startRendering();
  // A seamless loop: the extra second is crossfaded (equal power) into the start.
  const n = Math.floor(seconds * sampleRate), f = Math.floor(fade * sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate });
  let sum = 0;
  for (let ch = 0; ch < 2; ch++) {
    const src = r.getChannelData(ch), dst = out.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      let v = src[i];
      if (i < f) {
        const k = i / f;
        v = src[i] * Math.sin((k * Math.PI) / 2) + src[i + n] * Math.cos((k * Math.PI) / 2);
      }
      dst[i] = v;
      sum += v * v;
    }
  }
  const rms = Math.sqrt(sum / (2 * n)) || 1e-6;
  const k = Math.pow(10, -45 / 20) / rms;
  for (let ch = 0; ch < 2; ch++) {
    const d = out.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  return out;
}
