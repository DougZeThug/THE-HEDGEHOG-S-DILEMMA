"""Lay a through-composed take under the whole locked radio cut, at several levels, and measure it.

The artist asked for music through the entire fable (decision 13, 2026-11-07). The take runs from
the first frame (the curtains) and stops with the image at the cut (a 30 ms fade, so it doesn't
click); the black after it and the silent title stay digital silence. The take's own dynamics
carry the arc. It gets one gain, set so that under the typical line the music's loudest moment
sits a chosen number of LU under that line's median voice (the median over all lines). Where the
take is busier under a line than that allows (m3-f-1 is loudest through the exposure and the
branch), a slow ride takes it down: the cut each line needs, held from 1.5 s before the line to
2.5 s after it and smoothed over 2 s, so it moves over seconds, never word by word, and lifts
again in the long silences. The floor is 3 LU under the typical setting on headphones, and the
phone stand-in keeps at least max(3, typical - 6) LU. Each level is a version for the artist to
choose by ear; the report gives, for each, the ride and how close the music comes to Tom under
every line, so masking is visible before anyone listens.

Usage: python scripts/fable/score_through.py TAKE_ID STEMS_DIR OUT_DIR LU [LU ...]
Writes OUT_DIR/{A,<LU>}.mp3 and scripts/fable/score-through-render.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

sys.path.insert(0, str(Path(__file__).parent))
from music_takes import RATE, decode, ffmpeg_loudness, loudness_curve  # noqa: E402
from score import CUT, MUSIC, PHONE, median_voice, mp3, peak_in, write_wav  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NARRATION_LUFS = CUT['plan']['narrationLufs']
CUT_AT = CUT['length']['toCut']


def main():
    take_id, stems, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    levels = [float(x) for x in sys.argv[4:]]
    out.mkdir(parents=True, exist_ok=True)
    entry = MUSIC['entries'][take_id]
    take = decode(ROOT / 'audition' / entry['file'])
    voice = decode(stems / 'narration.wav')
    cut = decode(stems / 'radio-cut.wav')
    length = len(cut)

    # The take on the film's timeline: from 0, stopped with the image at the cut.
    music = np.zeros(length)
    n = min(len(take), int(CUT_AT * RATE))
    music[:n] = take[:n]
    fade = int(0.03 * RATE)
    music[n - fade:n] *= np.linspace(1, 0, fade)
    tmp = out / 'music-unity.wav'
    write_wav(music[:n], tmp)
    unity_lufs = ffmpeg_loudness(tmp)['lufs']
    tmp.unlink()

    vt, vl = loudness_curve(voice, 0.4)
    pt, pl = loudness_curve(lfilter(*PHONE, voice), 0.4)
    # Each line's margin at unity gain; a gain of g dB lowers every margin by g.
    ut, ul = loudness_curve(music, 0.4)
    unity_margins = [median_voice(vt, vl, u) - peak_in(ut, ul, u['at'], u['end'], 0.4) for u in CUT['units']]
    report = {'take': take_id, 'radioCut': CUT['version'], 'musicUnityLufs': unity_lufs, 'takeSeconds': round(len(take) / RATE, 2),
              'stopsAt': CUT_AT, 'levelRule': 'median over lines of (line median voice - music momentary max under it)', 'versions': {}}
    tt = np.arange(length) / RATE
    for lu in levels:
        gain = float(np.median(unity_margins)) - lu
        floor, phone_floor = lu - 3, max(3.0, lu - 6)
        need = {id(u): 0.0 for u in CUT['units']}  # extra cut each line needs, dB (<= 0)
        for _ in range(8):
            ride = np.zeros(length)
            for u in CUT['units']:
                if need[id(u)] < 0:
                    a, b = int(max(0, u['at'] - 1.5) * RATE), int(min(length / RATE, u['end'] + 2.5) * RATE)
                    ride[a:b] = np.minimum(ride[a:b], need[id(u)])
            # A 2 s moving average, from running sums (a direct convolution would be ~10^12 operations).
            k = int(2.0 * RATE)
            c = np.concatenate([[0.0], np.cumsum(np.pad(ride, (k // 2, k - k // 2 - 1), mode='edge'))])
            ride = (c[k:] - c[:-k]) / k
            m = music * 10 ** ((gain + ride) / 20)
            mt, ml = loudness_curve(m, 0.4)
            _, mlp = loudness_curve(lfilter(*PHONE, m), 0.4)
            short = False
            for u in CUT['units']:
                margin = median_voice(vt, vl, u) - peak_in(mt, ml, u['at'], u['end'], 0.4)
                pmargin = median_voice(pt, pl, u) - peak_in(mt, mlp, u['at'], u['end'], 0.4)
                deficit = max(floor - margin, phone_floor - pmargin)
                if deficit > 0.05:
                    need[id(u)] -= deficit + 0.2
                    short = True
            if not short:
                break
        lines = []
        for u in CUT['units']:
            lines.append({'p': f"{u['p']}{u.get('part', '')}",
                          'margin': round(float(median_voice(vt, vl, u) - peak_in(mt, ml, u['at'], u['end'], 0.4)), 1),
                          'phoneMargin': round(float(median_voice(pt, pl, u) - peak_in(mt, mlp, u['at'], u['end'], 0.4)), 1)})
        mix = out / f'{lu:g}.wav'
        write_wav(cut + m, mix)
        loud = ffmpeg_loudness(mix)
        mp3(mix, out / f'{lu:g}.mp3')
        worst = sorted(lines, key=lambda x: x['margin'])[:3]
        ridden = ride < -0.5
        report['versions'][f'{lu:g}'] = {
            'typicalMarginLU': lu, 'gainDb': round(float(gain), 1), 'loudness': loud,
            'ride': {'deepestDb': round(float(ride.min()), 1), 'secondsRidden': round(float(ridden.sum() / RATE), 1),
                     'from': round(float(tt[ridden][0]), 1) if ridden.any() else None, 'to': round(float(tt[ridden][-1]), 1) if ridden.any() else None},
            'floors': {'headphones': floor, 'phone': phone_floor},
            'worstLines': worst, 'medianMargin': float(np.median([x['margin'] for x in lines])),
            'worstPhoneMargin': min(x['phoneMargin'] for x in lines),
            'blackSilent': bool(np.abs(m[int(CUT_AT * RATE):]).max() == 0),
            'lines': lines,
        }
        r = report['versions'][f'{lu:g}']
        print(f"typical {lu:g} LU under: gain {r['gainDb']} dB, ride to {r['ride']['deepestDb']} dB over {r['ride']['secondsRidden']} s"
              f" ({r['ride']['from']}-{r['ride']['to']} s); mix {loud}; under Tom median {r['medianMargin']:.1f} LU, worst "
              + ', '.join(f"¶{x['p']} {x['margin']}" for x in worst) + f"; phone worst {r['worstPhoneMargin']}; black silent {r['blackSilent']}")
    mp3(stems / 'radio-cut.wav', out / 'A.mp3')
    (ROOT / 'scripts/fable/score-through-render.json').write_bytes((json.dumps(report, indent=1) + '\n').encode('utf8'))


if __name__ == '__main__':
    main()
