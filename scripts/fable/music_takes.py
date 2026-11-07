"""Measure a round of music takes and make their listening copies.

For each take in the music ledger's round:
  - facts the artist can't see by ear alone, written to the ledger: notes (audible onsets) and the
    longest gap between them, how much of the take is near silence, whether something sustains
    under the notes (how far the quietest moments fall below the loudest), and how alike its two
    channels are (the film is mono). Pitch is left to the ear: a generated instrument can sit
    between equal-tempered notes, so a chroma count would invent semitones;
  - a copy to hear alone, loudness-matched;
  - a copy "with Tom": the company section of the locked radio cut (narration and night stems)
    with the take laid under it from the pond, at the levels of the music review (decision 13):
    under words, at least 18 LU below each line's median voice; in the ease, up to -33 LUFS
    short-term; it fades out by 57 s.

Usage: python scripts/fable/music_takes.py ROUND STEMS_DIR OUT_DIR
  STEMS_DIR holds radio_cut.mjs's narration.wav and night.wav for the locked cut.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import lfilter, stft

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'scripts/fable/music-ledger.json'
CUT = json.loads((ROOT / 'scripts/fable/radio-cut.json').read_text(encoding='utf8'))
RATE = 44100
ALONE_LUFS = -27.0
WINDOW = (26.0, 61.0)  # film seconds heard in the preview: from "...easy to love." into the exposure
ENTER = 31.0           # the music enters under "There, she could lay her reflection..." (from the pond)
GONE = 57.0            # and has decayed by here (the review: by about 57 s)
UNDER_WORDS_LU = 18.0  # below each line's median voice
EASE_MAX_LUFS = -33.0  # short-term maximum in the long silences


def decode(path, channels=1):
    raw = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(path), '-ac', str(channels),
                          '-ar', str(RATE), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, channels).T if channels > 1 else x


def biquad_shelf(f0, gain_db, q):
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / RATE
    alpha, c, sa = np.sin(w0) / (2 * q), np.cos(w0), np.sqrt(a_)
    b = [a_ * ((a_ + 1) + (a_ - 1) * c + 2 * sa * alpha), -2 * a_ * ((a_ - 1) + (a_ + 1) * c), a_ * ((a_ + 1) + (a_ - 1) * c - 2 * sa * alpha)]
    a = [(a_ + 1) - (a_ - 1) * c + 2 * sa * alpha, 2 * ((a_ - 1) - (a_ + 1) * c), (a_ + 1) - (a_ - 1) * c - 2 * sa * alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def biquad_highpass(f0, q):
    w0 = 2 * np.pi * f0 / RATE
    alpha, c = np.sin(w0) / (2 * q), np.cos(w0)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a = [1 + alpha, -2 * c, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


SHELF = biquad_shelf(1681.974450955533, 3.999843853973347, 0.7071752369554196)  # BS.1770 K-weighting
HIGHPASS = biquad_highpass(38.13547087602444, 0.5003270373238773)


def loudness_curve(x, window):
    """K-weighted loudness (LUFS) of `window`-second blocks every 0.1 s, for a mono signal."""
    k = lfilter(*HIGHPASS, lfilter(*SHELF, x))
    n, hop = int(window * RATE), int(0.1 * RATE)
    sq = np.concatenate([[0.0], np.cumsum(k * k)])
    starts = np.arange(0, max(1, len(k) - n + 1), hop)
    ms = (sq[starts + n] - sq[starts]) / n
    return starts / RATE, -0.691 + 10 * np.log10(ms + 1e-12)


def ffmpeg_loudness(path):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    pick = lambda key: float(log.split(key)[-1].split()[0])
    return {'lufs': pick('I:'), 'lra': pick('LRA:'), 'truePeak': pick('Peak:')}


def facts(stereo):
    x = stereo.mean(axis=0)
    # Activity, from 50 ms RMS.
    n = int(0.05 * RATE)
    rms = np.sqrt(np.add.reduceat(x * x, np.arange(0, len(x) - n, n)) / n + 1e-12)
    db = 20 * np.log10(rms)
    top = np.percentile(db, 95)
    # Onsets, from positive spectral flux on a log spectrogram, counted only where the take is
    # within 20 dB of its loudest: rises in the near silence are noise, not notes.
    f, t, z = stft(x, RATE, nperseg=2048, noverlap=2048 - 512)
    mag = np.log1p(100 * np.abs(z))
    flux = np.maximum(0, np.diff(mag, axis=1)).sum(axis=0)
    thr = np.median(flux) + 2.5 * np.median(np.abs(flux - np.median(flux)))
    onsets, last = [], -1.0
    for i in range(1, len(flux) - 1):
        at = t[i + 1]
        audible = db[min(len(db) - 1, int(at / 0.05)):int(at / 0.05) + 3].max() > top - 20
        if flux[i] > thr and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1] and at - last > 0.12 and audible:
            onsets.append(float(at))
            last = at
    gaps = np.diff([0.0] + onsets + [len(x) / RATE])
    left, right = stereo
    return {
        'notes': len(onsets),
        'notesPerMinute': round(len(onsets) / (len(x) / RATE) * 60, 1),
        'longestGap': round(float(gaps.max()), 2),
        'nearSilence': round(float(np.mean(db < top - 30)), 2),
        'quietestBelowLoudest': round(float(top - np.percentile(db, 10)), 1),
        'channelCorrelation': round(float(np.corrcoef(left, right)[0, 1]), 2),
    }


def encode(x, path, limit_db):
    raw = path.with_suffix('.f32')
    raw.write_bytes(x.astype(np.float32).tobytes())
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', str(raw),
                    '-af', f'alimiter=limit={limit_db}dB:level=false:attack=1:release=50', '-c:a', 'libmp3lame', '-b:a', '128k', str(path)], check=True)
    raw.unlink()


def main():
    round_id, stems, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    ledger = json.loads(LEDGER.read_text(encoding='utf8'))
    voice = decode(stems / 'narration.wav')
    night = decode(stems / 'night.wav')
    a, b = int(WINDOW[0] * RATE), int(WINDOW[1] * RATE)
    units = [u for u in CUT['units'] if u['end'] > WINDOW[0] and u['at'] < WINDOW[1]]
    vt, vl = loudness_curve(voice, 0.4)
    ease = next(u for u in CUT['units'] if u['p'] == 7)  # the long silence after "For many nights, they were happy."
    for take_id, e in ledger['entries'].items():
        if e['round'] != round_id:
            continue
        stereo = decode(ROOT / 'audition' / e['file'], channels=2)
        e['facts'] = facts(stereo)
        music = stereo.mean(axis=0)

        # Alone, loudness-matched.
        alone = out / f'{take_id}-alone.mp3'
        tmp = out / f'{take_id}-tmp.wav'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(ROOT / 'audition' / e['file']), '-ac', '1', '-ar', str(RATE), str(tmp)], check=True)
        gain = ALONE_LUFS - ffmpeg_loudness(tmp)['lufs']
        tmp.unlink()
        encode(music * 10 ** (gain / 20), alone, -1)

        # With Tom: the take on the film's timeline, from ENTER, gone by GONE.
        placed = np.zeros_like(voice)
        i0 = int(ENTER * RATE)
        take = music[: len(placed) - i0]
        placed[i0:i0 + len(take)] = take
        fade = np.clip((GONE - np.arange(len(placed)) / RATE) / 3.0, 0, 1)  # out over the last 3 s
        placed *= fade
        mt, ml = loudness_curve(placed, 0.4)
        # Under words: the loudest moment of music under each line, 18 LU under that line's median voice.
        words_gain = min(
            (np.median(vl[(vt >= u['at']) & (vt + 0.4 <= u['end'])]) - UNDER_WORDS_LU)
            - ml[(mt + 0.4 > u['at']) & (mt < u['end'])].max()
            for u in units if u['at'] < GONE and u['end'] > ENTER)
        # In the ease: up to EASE_MAX_LUFS short-term, and never more than 10 dB above the level under words.
        st, sl = loudness_curve(placed, 3.0)
        in_ease = (st >= ease['end']) & (st + 3.0 <= ease['end'] + ease['gapAfter'])
        ease_gain = min(EASE_MAX_LUFS - sl[in_ease].max(), words_gain + 10)
        # Written gains, eased over 0.4 s at the edges of the ease (the only change of level).
        tt = np.arange(len(placed)) / RATE
        up = np.clip((tt - ease['end']) / 0.4, 0, 1) * np.clip((ease['end'] + ease['gapAfter'] - tt) / 0.4, 0, 1)
        g = 10 ** ((words_gain + (ease_gain - words_gain) * up) / 20)
        mix = voice + night + placed * g
        with_tom = out / f'{take_id}-with-tom.mp3'
        encode(mix[a:b], with_tom, -3.5)
        e['preview'] = {'window': WINDOW, 'enters': ENTER, 'goneBy': GONE, 'underWordsGainDb': round(float(words_gain), 1),
                        'easeGainDb': round(float(ease_gain), 1), 'aloneGainDb': round(float(gain), 1)}
        f = e['facts']
        print(f"{take_id}: {f['notes']} notes ({f['notesPerMinute']}/min), longest gap {f['longestGap']} s, near silence {f['nearSilence']:.0%},"
              f" quietest {f['quietestBelowLoudest']} dB under loudest, L/R {f['channelCorrelation']};"
              f" with Tom: words {words_gain:+.1f} dB, ease {ease_gain:+.1f} dB")
    LEDGER.write_bytes((json.dumps(ledger, indent=2) + '\n').encode('utf8'))  # LF on Windows too


if __name__ == '__main__':
    main()
