"""Render the fable's music from score.json onto the locked radio cut, and check it.

Each cue is cut from the approved take, faded and placed on the film's timeline. The cues of one
phrase (a `group`) share their level, written from the timeline rather than keyed by the voice:
one level under words and in the 1 s gaps, and one for the long silences (1.3 s or more), reached
by a rise of 0.5 s as the silence opens and a single 1 s fade that ends as the next line begins.
So a phrase that runs on under Tom eases down once, like a fader, and never pumps between lines.

The levels come from the music review's gates (decision 13): under each line the music's momentary
loudness stays at least 18 LU below that line's median voice, and 15 LU through a phone stand-in
(a 400 Hz high-pass); in the 1 s gaps its momentary loudness stays under -31 LUFS; in the long
silences its short-term loudness reaches about -34 LUFS and never passes -33. Where phrases overlap
and the sum breaks a gate, every phrase there comes down by the excess.

The mixes are the locked cut (radio_cut.mjs's radio-cut.wav, untouched: version A) plus each
version's music. Tom is identical in all three unless the true peak would pass -3 dBTP, in which
case the sum goes through the cut's own limiter and the report says so.

Writes OUT_DIR/{A,B,C}.mp3 and the music stems, and scripts/fable/score-render.json (the gains and
every gate as measured).
Usage: python scripts/fable/score.py STEMS_DIR OUT_DIR
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter

sys.path.insert(0, str(Path(__file__).parent))
from music_takes import RATE, decode, ffmpeg_loudness, loudness_curve  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCORE = json.loads((ROOT / 'scripts/fable/score.json').read_text(encoding='utf8'))
CUT = json.loads((ROOT / 'scripts/fable/radio-cut.json').read_text(encoding='utf8'))
MUSIC = json.loads((ROOT / 'scripts/fable/music-ledger.json').read_text(encoding='utf8'))
G = SCORE['gates']
TOUCH = next((u['end'], u['end'] + u['gapAfter']) for u in CUT['units'] if u.get('why') == 'the touch')
LAST_LINE = CUT['units'][-1]['at']  # "The moon looked too.": every note has gone before it
CUT_AT = CUT['length']['toCut']
PHONE = butter(2, 400, btype='highpass', fs=RATE)


def write_wav(x, path):
    raw = path.with_suffix('.f32')
    raw.write_bytes(x.astype(np.float32).tobytes())
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', str(raw),
                    '-c:a', 'pcm_s16le', str(path)], check=True)
    raw.unlink()


def mp3(wav, path, extra=()):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), *extra, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', str(path)], check=True)


def cue_audio(take, cue):
    a, b = (int(s * RATE) for s in cue['take'])
    x = take[a:b].copy()
    n = len(x)
    fi, fo = int(cue['fadeIn'] * RATE), int(cue['fadeOut'] * RATE)
    env = np.ones(n)
    env[:fi] = np.linspace(0, 1, fi)
    env[n - fo:] = np.minimum(env[n - fo:], np.linspace(1, 0, fo))
    return x * env


def place(length, audio, at):
    y = np.zeros(length)
    i = int(at * RATE)
    y[i:i + len(audio)] = audio[: max(0, length - i)]
    return y


def lines_under(span):
    return [u for u in CUT['units'] if u['end'] > span[0] and u['at'] < span[1]]


GAPS = [(u['end'], CUT['units'][i + 1]['at']) for i, u in enumerate(CUT['units'][:-1])]
LONG = [g for g in GAPS if g[1] - g[0] >= G['longGap']]
SHORT = [g for g in GAPS if g[1] - g[0] < G['longGap']]


def gaps_under(span, gaps):
    return [g for g in gaps if g[1] > span[0] and g[0] < span[1]]


def envelope_db(length, words_db, gap_db, span):
    """The phrase's written level: words_db, rising to gap_db in each long silence it sounds in."""
    env = np.full(length, words_db)
    for a, b in gaps_under(span, LONG):
        i0, i1 = int(a * RATE), int(b * RATE)
        t = np.arange(i0, i1) / RATE
        k = np.clip(np.minimum((t - a) / G['rideUp'], (b - t) / G['rideDown']), 0, 1)
        env[i0:i1] = words_db + (gap_db - words_db) * k
    return env


def peak_in(t, curve, a, b, window):
    m = (t + window > a) & (t < b)
    return curve[m].max() if m.any() else -np.inf


def median_voice(vt, vl, u):
    m = (vt >= u['at']) & (vt + 0.4 <= u['end'])
    return np.median(vl[m]) if m.any() else np.median(vl[(vt + 0.4 > u['at']) & (vt < u['end'])])


def main():
    stems, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    take_entry = MUSIC['entries'][SCORE['take']]
    assert take_entry['review'] == 'approved', f"{SCORE['take']} is not the approved take"
    take = decode(ROOT / 'audition' / take_entry['file'])
    voice = decode(stems / 'narration.wav')
    cut = decode(stems / 'radio-cut.wav')
    length = len(cut)
    vt, vl = loudness_curve(voice, 0.4)
    voice_phone = lfilter(*PHONE, voice)
    pt, pl = loudness_curve(voice_phone, 0.4)
    medians = {id(u): (median_voice(vt, vl, u), median_voice(pt, pl, u)) for u in CUT['units']}

    report = {'take': SCORE['take'], 'scoreVersion': SCORE['version'], 'radioCut': CUT['version'], 'versions': {}}
    for name, cues in SCORE['versions'].items():
        groups = {}
        for c in cues:
            g = groups.setdefault(c['group'], {'y': np.zeros(length), 'span': [np.inf, -np.inf]})
            g['y'] += place(length, cue_audio(take, c), c['at'])
            g['span'] = [min(g['span'][0], c['at']), max(g['span'][1], c['at'] + c['take'][1] - c['take'][0])]
        # Each phrase's two levels, from its own sound against the gates.
        for key, g in groups.items():
            y, span = g['y'], g['span']
            mt, ml = loudness_curve(y, 0.4)
            _, mlp = loudness_curve(lfilter(*PHONE, y), 0.4)
            st, sl = loudness_curve(y, 3.0)
            words = []
            for u in lines_under(span):
                med, medp = medians[id(u)]
                words += [med - G['underWordsLU'] - peak_in(mt, ml, u['at'], u['end'], 0.4),
                          medp - G['underWordsPhoneLU'] - peak_in(mt, mlp, u['at'], u['end'], 0.4)]
            words += [G['gapMomentaryMax'] - peak_in(mt, ml, a, b, 0.4) for a, b in gaps_under(span, SHORT)]
            gap = []
            for a, b in gaps_under(span, LONG):
                gap += [G['gapShortTermTarget'] - peak_in(st + 1.5, sl, a, b, 0.0),  # 3 s windows centred in the silence
                        G['gapMomentaryMax'] - peak_in(mt, ml, a, b, 0.4)]
            g['words'] = min(words) if words else min(gap)
            g['gap'] = min(gap) if gap else g['words']
            # A phrase rises only in a silence where one of its notes begins; a tail ringing on into a
            # silence keeps its level (raising it would swell a dying chord).
            if not any(a <= c['at'] < b for c in cues if c['group'] == key for a, b in LONG):
                g['gap'] = min(g['gap'], g['words'])

        def render():
            return sum(g['y'] * 10 ** (envelope_db(length, g['words'], g['gap'], g['span']) / 20) for g in groups.values())

        # The sum must hold the gates too: bring every phrase sounding where a gate breaks down by the excess.
        for _ in range(8):
            music = render()
            mt, ml = loudness_curve(music, 0.4)
            _, mlp = loudness_curve(lfilter(*PHONE, music), 0.4)
            st, sl = loudness_curve(music, 3.0)
            broken = []
            for u in CUT['units']:
                med, medp = medians[id(u)]
                broken.append(((u['at'], u['end']), ('words', 'gap'), max(
                    peak_in(mt, ml, u['at'], u['end'], 0.4) - (med - G['underWordsLU']),
                    peak_in(mt, mlp, u['at'], u['end'], 0.4) - (medp - G['underWordsPhoneLU']))))
            for a, b in SHORT:
                broken.append(((a, b), ('words',), peak_in(mt, ml, a, b, 0.4) - G['gapMomentaryMax']))
            for a, b in LONG:
                broken.append(((a, b), ('gap',), max(peak_in(st + 1.5, sl, a, b, 0.0) - G['gapShortTermMax'],
                                                     peak_in(mt, ml, a, b, 0.4) - G['gapMomentaryMax'])))
            broken = [x for x in broken if x[2] > 0.05]
            if not broken:
                break
            for (a, b), levels, over in broken:
                for g in groups.values():
                    if g['span'][1] > a - 0.4 and g['span'][0] < b:
                        for lv in levels:
                            g[lv] -= over + 0.1

        music = render()
        gains = {k: {'underWords': round(float(g['words']), 1), 'inSilence': round(float(g['gap']), 1)} for k, g in groups.items()}
        stem = out / f'music-{name}.wav'
        write_wav(music, stem)
        mix = out / f'{name}.wav'
        write_wav(cut + music, mix)
        loud = ffmpeg_loudness(mix)
        limited = loud['truePeak'] > G['truePeakMax']
        if limited:
            lim = out / f'{name}-lim.wav'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(mix), '-af',
                            'alimiter=limit=-3.5dB:level=false:attack=1:release=50', '-c:a', 'pcm_s16le', str(lim)], check=True)
            lim.replace(mix)
            loud = ffmpeg_loudness(mix)
        mp3(mix, out / f'{name}.mp3')

        # The gates as measured on the sum.
        mt, ml = loudness_curve(music, 0.4)
        _, mlp = loudness_curve(lfilter(*PHONE, music), 0.4)
        st, sl = loudness_curve(music, 3.0)
        lines = []
        for u in CUT['units']:
            under = peak_in(mt, ml, u['at'], u['end'], 0.4)
            if under > -70:
                med, medp = medians[id(u)]
                lines.append({'p': f"{u['p']}{u.get('part', '')}", 'margin': round(med - under, 1),
                              'phoneMargin': round(medp - peak_in(mt, mlp, u['at'], u['end'], 0.4), 1)})
        gaps = []
        for i, u in enumerate(CUT['units'][:-1]):
            a, b = u['end'], CUT['units'][i + 1]['at']
            top, mom = peak_in(st + 1.5, sl, a, b, 0.0), peak_in(mt, ml, a, b, 0.4)
            if mom > -70:
                gaps.append({'after': f"{u['p']}{u.get('part', '')}", 'long': b - a >= G['longGap'],
                             'shortTermMax': round(float(top), 1), 'momentaryMax': round(float(mom), 1)})
        nz = np.nonzero(np.abs(music) > 10 ** (-90 / 20))[0]
        checks = {
            'lastSound': round(float(nz[-1] / RATE), 2),
            'beforeLastLine': bool(nz[-1] / RATE < LAST_LINE),
            'touchSilent': bool(np.abs(music[int(TOUCH[0] * RATE):int(TOUCH[1] * RATE)]).max() == 0),
            'afterCutSilent': bool(np.abs(music[int(CUT_AT * RATE):]).max() == 0),
            'limiterActed': limited,
        }
        report['versions'][name] = {
            'gains': gains, 'loudness': loud, 'checks': checks,
            'underWords': {'worstMargin': min(l['margin'] for l in lines), 'worstPhoneMargin': min(l['phoneMargin'] for l in lines), 'lines': lines},
            'gaps': gaps, 'musicSeconds': round(float(np.sum(np.abs(music) > 10 ** (-60 / 20)) / RATE), 1),
        }
        r = report['versions'][name]
        print(f"{name}: levels (dB on the take) " + ', '.join(f"{k} {v['underWords']}/{v['inSilence']}" for k, v in gains.items()))
        print(f"   under words: worst {r['underWords']['worstMargin']} LU (phone {r['underWords']['worstPhoneMargin']}), over {len(lines)} lines;"
              f" silences after: {', '.join(f'''¶{g['after']} {g['shortTermMax'] if g['long'] else g['momentaryMax']}{'' if g['long'] else 'm'}''' for g in gaps)}")
        print(f"   mix {loud}; music audible {r['musicSeconds']} s; {checks}")

    mp3(stems / 'radio-cut.wav', out / 'A.mp3')
    (ROOT / 'scripts/fable/score-render.json').write_text(json.dumps(report, indent=1) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
