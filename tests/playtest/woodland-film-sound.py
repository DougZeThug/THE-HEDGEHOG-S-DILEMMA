"""The review film's sound: the memory's cues as the room plays them (per-cue stems from
tests/playtest/woodland-audio.ts, GAIN=0, PRE=5), with the white room round them, approximated from
src/audio/Ambience.ts at a typical visit's levels (its hum, ventilation and outside; its drone,
silenced from the woodland's start and never back), hushed and given back as the App does
(src/App.ts: 0.7 on the wall, 0.95 once taken in, 0.7 as it goes back, and the room's own rise
over 20 s from the residue), through the output's gain at volume 0.8 (+2.5 dB), then raised by one
fixed amount for listening (the same for every version, so they can be compared). And the same
through a phone's speaker (a crude model: nothing under 500 Hz, little over 10 kHz).

  .venv-audio/bin/python tests/playtest/woodland-film-sound.py <stems dir> <out.wav> [<out-phone.wav>]

(The stems: PRE=5 POST=8 GAIN=0 STEMS=<dir> npx vite-node tests/playtest/woodland-audio.ts. The
whole film: tests/playtest/woodland-film.py.)
"""
import os
import sys

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
PRE = 5.0            # film seconds before the memory begins
LISTEN_DB = 14.0     # raised for listening (the room plays it about 14 dB quieter; its gust peaks at -2 dBFS)


def stems(d):
    xs = [sf.read(os.path.join(d, f), dtype='float64')[0] for f in sorted(os.listdir(d)) if f.endswith('.wav')]
    n = max(len(x) for x in xs)
    out = np.zeros((n, 2))
    for x in xs:
        out[:len(x)] += x
    return out


def room(n, seed=3):
    """The room's tone: the light's hum, the ventilation, the outside, and its drone (D A E A)."""
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR
    # Hum: 60 Hz and its partials (Ambience: 0.5, 0.32, 0.12, 0.08, 0.035), a slow flutter, under 520 Hz.
    hum = sum(a * np.sin(2 * np.pi * 60 * (i + 1) * (1 + (0.0015 if i % 2 else 0)) * t) for i, a in enumerate([0.5, 0.32, 0.12, 0.08, 0.035]))
    hum *= 1 + 0.15 * np.sin(2 * np.pi * 0.13 * t)
    hum = signal.sosfilt(signal.butter(2, 520, 'low', fs=SR, output='sos'), hum)
    # Ventilation: noise round 520 Hz, under 2.2 kHz.
    vent = rng.uniform(-1, 1, n)
    vent = signal.sosfilt(signal.butter(1, [520 / 1.8, 520 * 1.8], 'band', fs=SR, output='sos'), vent)
    vent = signal.sosfilt(signal.butter(2, 2200, 'low', fs=SR, output='sos'), vent)
    # Outside: a low rumble.
    out = rng.uniform(-1, 1, n)
    out = signal.sosfilt(signal.butter(2, 160, 'low', fs=SR, output='sos'), signal.sosfilt(signal.butter(2, 400, 'low', fs=SR, output='sos'), out))
    # A typical visit's environment (the Director's field at mid values): hum 0.8, vent 0.65, outside 0.4.
    g_hum, g_vent, g_out = (0.012 + 0.03 * 0.8) * 0.71, (0.006 + 0.055 * 0.65) * 0.63, 0.02 + 0.14 * 0.4
    # The drone: four notes, each a pair detuned, under a 420–640 Hz lowpass; 0.05 * drone 0.3.
    mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
    drone = np.zeros(n)
    for i, m in enumerate([38, 45, 52, 57]):
        for det in (-5, 5):
            f = mtof(m) * 2 ** (det / 1200)
            wave = np.sin(2 * np.pi * f * t) if i == 0 else signal.sawtooth(2 * np.pi * f * t, 0.5)
            drone += wave * (0.35 if i == 0 else 0.18)
    drone = signal.sosfilt(signal.butter(2, 520, 'low', fs=SR, output='sos'), drone) * 0.05 * 0.3
    left = hum * g_hum + vent * g_vent * 1.1 + out * g_out
    right = hum * g_hum + vent * g_vent * 0.9 + out * g_out
    return np.stack([left, right], 1), np.stack([drone, drone], 1)


def target(t0, v0, v1, tau):
    """setTargetAtTime from v0 toward v1 from t0 (time constant tau), as a function of t."""
    return lambda t: v1 + (v0 - v1) * np.exp(-np.maximum(0, t - t0) / tau)


def duck(n):
    """The room's level under the memory (memory seconds), as App.ts and AudioEngine.memoryHush."""
    t = np.arange(n) / SR - PRE
    g = np.ones(n)
    # On the wall: 0.7 (to 0.3 of the room) over 1.4 s.
    a = target(0, 1.0, 0.3, 1.4 / 3)(t)
    g = np.where(t >= 0, a, g)
    # Taken in (immersed past 0.9, 9.3 s): 0.95.
    v93 = target(0, 1.0, 0.3, 1.4 / 3)(np.array([9.3]))[0]
    b = target(9.3, v93, 0.05, 2.5 / 3)(t)
    g = np.where(t >= 9.3, b, g)
    # Going back (43.2 s: below 0.9 again): 0.7, an even rise over 4.5 s.
    v432 = target(9.3, v93, 0.05, 2.5 / 3)(np.array([43.2]))[0]
    c = v432 * (0.3 / v432) ** np.clip((t - 43.2) / 4.5, 0, 1)
    g = np.where(t >= 43.2, c, g)
    # The residue (49.5): the room given back over 20 s, evenly in loudness.
    d = 0.3 * (1.0 / 0.3) ** np.clip((t - 49.5) / 20, 0, 1)
    g = np.where(t >= 49.5, d, g)
    return g


def drone_level(n):
    """The drone: its chord under the room before; silent from the woodland's start (Ambience.update's
    ramp over 4 s), never back once it has been seen."""
    t = np.arange(n) / SR - PRE
    # (AudioEngine.ramp's time constant is a third of the seconds it is given: 4 s.)
    return np.where(t < 0, 1.0, np.exp(-np.maximum(0, t) / (4.0 / 3)))


def main(d, out, phone=None):
    mem = stems(d)
    n = len(mem)
    tone, drone = room(n)
    g = duck(n)[:, None]
    mix = mem + (tone + drone * drone_level(n)[:, None]) * g
    mix *= 1.478 * 0.9 * 10 ** (LISTEN_DB / 20)
    pk = np.abs(mix).max()
    if pk > 0.95:
        print(f'(peak {20 * np.log10(pk):.1f} dBFS: limited)')
        mix = np.tanh(mix / 0.95) * 0.95
    sf.write(out, mix.astype(np.float32), SR, subtype='PCM_24')
    print(out, f'{n / SR:.1f} s, peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS')
    if phone:
        p = signal.sosfilt(signal.butter(4, 500, 'high', fs=SR, output='sos'), mix, axis=0)
        p = signal.sosfilt(signal.butter(2, 10000, 'low', fs=SR, output='sos'), p, axis=0)
        p = p.mean(axis=1, keepdims=True).repeat(2, 1)  # one small speaker
        p *= 10 ** (6 / 20)  # (a phone is played louder)
        p = np.clip(p, -0.98, 0.98)
        sf.write(phone, p.astype(np.float32), SR, subtype='PCM_24')
        print(phone)


if __name__ == '__main__':
    main(*sys.argv[1:])
