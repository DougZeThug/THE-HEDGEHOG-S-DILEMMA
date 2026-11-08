"""Measure a round of sound-effect takes and make their listening copies.

For each take in the sound-effects ledger's round:
  - facts the ear can miss, written to the ledger: where it starts, peaks and dies away; how many
    separate events it holds (the touch should be one); the longest drop inside it (the branch
    should be one unbroken rustle); how much of its energy sits above 4 kHz (hiss, insects or
    birds would show there; decision 17 rules out crickets); its noise floor; for a loop, how far
    its end and start differ where it wraps; how alike its two channels are (the film is mono);
  - a copy to hear alone, loudness-matched within its cue;
  - a copy "in the film": a window of the locked radio cut (narration and night) with the chosen
    score (score-m3-f-1-9lu.wav) and the take at its place and a provisional level:
      curtains: from 0.5 s in the lead-in, its loudest moment at -30 LUFS momentary, before any word;
      branch:   from 0.5 s before "The fox pulled a branch over the water." (the image leads the
                words), one gain, its loudest moment under each line 12 LU under that line's
                median voice, and 9 LU under through the phone stand-in (a rustle is mostly above
                4 kHz, which a phone keeps while it loses the voice's low end);
      touch:    its peak 0.25 s into the 1 s gap at the touch (the only hard sync), loudest moment
                -26 LUFS momentary; faded over 0.25 s where Tom resumes, since the ripples' decay
                will be made in code;
      pond:     looped from "There, she could lay her reflection..." with no crossfade, so the
                seam is heard as it is; -42 LUFS over the take (the night air is -45).
    The final balance is set in the mix; these levels are for choosing takes.

Usage: python scripts/fable/sfx_takes.py ROUND STEMS_DIR OUT_DIR
  STEMS_DIR holds radio_cut.mjs's narration.wav and radio-cut.wav for the locked cut.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import lfilter, stft

sys.path.insert(0, str(Path(__file__).parent))
from music_takes import RATE, decode, encode, ffmpeg_loudness, loudness_curve  # noqa: E402
from score import CUT, MUSIC, PHONE, median_voice, peak_in, write_wav  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'scripts/fable/sfx-ledger.json'
ALONE_LUFS = -27.0
UNITS = {f"{u['p']}{u.get('part', '')}": u for u in CUT['units']}
TOUCH_GAP = next((u['end'], u['end'] + u['gapAfter']) for u in CUT['units'] if u.get('why') == 'the touch')
PLACES = {
    'curtains': {'window': (0.0, 12.0), 'at': 0.5, 'rule': 'momentary max -30 LUFS'},
    'branch': {'window': (108.0, 127.0), 'at': UNITS['19']['at'] - 0.5, 'rule': 'momentary max 12 LU under each line it lies under (9 through the phone stand-in)'},
    'touch': {'window': (126.0, 138.0), 'peakAt': TOUCH_GAP[0] + 0.25, 'rule': 'momentary max -26 LUFS, peak 0.25 s into the gap'},
    'pond': {'window': (26.0, 61.0), 'at': UNITS['6']['at'], 'rule': '-42 LUFS over the take, looped without a crossfade'},
}


def rms_db(x, step):
    n = int(step * RATE)
    m = len(x) // n
    return 20 * np.log10(np.sqrt((x[:m * n].reshape(m, n) ** 2).mean(axis=1)) + 1e-9)


def facts(stereo, loop):
    x = stereo.mean(axis=0)
    db = rms_db(x, 0.01)  # 10 ms steps
    top = db.max()
    on = np.nonzero(db > top - 30)[0]
    onset, tail = on[0] * 0.01, (on[-1] + 1) * 0.01
    # Separate events: stretches within 20 dB of the loudest, apart by more than 150 ms.
    loud = np.nonzero(db > top - 20)[0]
    events = 1 + int(np.sum(np.diff(loud) > 15)) if len(loud) else 0
    # The longest drop more than 25 dB under the loudest, between the start and the end.
    quiet = db[on[0]:on[-1] + 1] < top - 25
    longest, run = 0, 0
    for q in quiet:
        run = run + 1 if q else 0
        longest = max(longest, run)
    f, _, z = stft(x, RATE, nperseg=2048)
    power = (np.abs(z) ** 2).sum(axis=1)
    out = {
        'onset': round(float(onset), 2),
        'peakAt': round(float(np.argmax(db) * 0.01), 2),
        'tail': round(float(tail), 2),
        'events': events,
        'longestDrop': round(longest * 0.01, 2),
        'above4kHz': round(float(power[f >= 4000].sum() / power.sum()), 3),
        'floorBelowPeak': round(float(top - np.percentile(db, 5)), 1),
        'channelCorrelation': round(float(np.corrcoef(*stereo)[0, 1]), 2),
    }
    if loop:
        # Where it wraps: the level of the last and first 200 ms, and the step from the last sample to
        # the first against the largest steps inside the take (its 99.9th percentile): above 1 is a
        # step the take never makes on its own, which is heard as a click.
        end, start = rms_db(x[-int(0.2 * RATE):], 0.2)[0], rms_db(x[:int(0.2 * RATE)], 0.2)[0]
        inside = np.percentile(np.abs(np.diff(x)), 99.9)
        out['seam'] = {'levelStepDb': round(float(end - start), 1),
                       'wrapStepVsInside': round(float(abs(x[-1] - x[0]) / (inside + 1e-12)), 2)}
    return out


def centred_max(t, l, u):
    m = (t + 0.2 >= u['at']) & (t + 0.2 <= u['end']) & (l > -70)
    return l[m].max() if m.any() else -np.inf


def momentary_max(x):
    _, l = loudness_curve(x, 0.4)
    return float(l.max())


def place(cue, take, length, vt, vl, pt, pl, out):
    """The take on the film's timeline at its provisional level, and that gain."""
    p = PLACES[cue]
    placed = np.zeros(length)
    if cue == 'pond':
        i0 = int(p['at'] * RATE)
        reps = int(np.ceil((length - i0) / len(take)))
        placed[i0:] = np.tile(take, reps)[:length - i0]
        placed[i0:i0 + int(2 * RATE)] *= np.linspace(0, 1, int(2 * RATE))  # in over 2 s
        tmp = out / 'pond-loudness.wav'
        write_wav(take, tmp)
        gain = -42.0 - ffmpeg_loudness(tmp)['lufs']
        tmp.unlink()
        return placed * 10 ** (gain / 20), gain
    if cue == 'touch':
        db = rms_db(take, 0.01)
        i0 = int((p['peakAt'] - np.argmax(db) * 0.01) * RATE)
    else:
        i0 = int(p['at'] * RATE)
    seg = take[:length - i0].copy()
    if i0 < 0:
        seg, i0 = take[-i0:].copy(), 0
    placed[i0:i0 + len(seg)] = seg
    if cue == 'touch':
        tt = np.arange(length) / RATE
        placed *= np.clip(1 - (tt - TOUCH_GAP[1]) / 0.25, 0, 1)  # out where Tom resumes
        gain = -26.0 - momentary_max(placed)
    elif cue == 'curtains':
        gain = -30.0 - momentary_max(placed)
    else:  # branch: 12 LU under every line it lies under, 9 through the phone stand-in
        mt, ml = loudness_curve(placed, 0.4)
        _, mlp = loudness_curve(lfilter(*PHONE, placed), 0.4)
        a, b = i0 / RATE, (i0 + len(seg)) / RATE
        under = [u for u in CUT['units'] if u['end'] > a and u['at'] < b]
        gain = min(min(median_voice(vt, vl, u) - 12.0 - peak_in(mt, ml, u['at'], u['end'], 0.4),
                       median_voice(pt, pl, u) - 9.0 - peak_in(mt, mlp, u['at'], u['end'], 0.4)) for u in under)
    return placed * 10 ** (gain / 20), gain


def main():
    round_id, stems, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    ledger = json.loads(LEDGER.read_text(encoding='utf8'))
    voice = decode(stems / 'narration.wav')
    cut = decode(stems / 'radio-cut.wav')
    score = decode(ROOT / 'audition' / MUSIC['score']['stem'])
    assert len(score) == len(cut), 'the score stem must line up with the radio cut'
    vt, vl = loudness_curve(voice, 0.4)
    pt, pl = loudness_curve(lfilter(*PHONE, voice), 0.4)
    for take_id, e in ledger['entries'].items():
        if e['round'] != round_id:
            continue
        cue = e['cue']
        node = ledger['rounds'][round_id]['nodes'][cue]
        stereo = decode(ROOT / 'audition' / e['file'], channels=2)
        e['facts'] = facts(stereo, node['settings'].get('loop', False))
        take = stereo.mean(axis=0)

        # Alone, loudness-matched.
        tmp = out / f'{take_id}-tmp.wav'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(ROOT / 'audition' / e['file']), '-ac', '1', '-ar', str(RATE), str(tmp)], check=True)
        alone_gain = ALONE_LUFS - ffmpeg_loudness(tmp)['lufs']
        tmp.unlink()
        encode(take * 10 ** (alone_gain / 20), out / f'{take_id}-alone.mp3', -1)

        # In the film.
        placed, gain = place(cue, take, len(cut), vt, vl, pt, pl, out)
        a, b = (int(s * RATE) for s in PLACES[cue]['window'])
        mix = cut + score + placed
        wav = out / f'{take_id}-film.wav'
        write_wav(mix[a:b], wav)
        loud = ffmpeg_loudness(wav)
        wav.unlink()
        encode(mix[a:b], out / f'{take_id}-in-film.mp3', -3.5)
        # How close it comes to Tom under each line in the window, alone and with the score, counting
        # the 0.4 s windows centred inside the line (so a touch in a gap isn't counted as under words).
        lines = [u for u in CUT['units'] if u['end'] > PLACES[cue]['window'][0] and u['at'] < PLACES[cue]['window'][1]]

        def closest(sig, phone=False):
            t, l = loudness_curve(lfilter(*PHONE, sig) if phone else sig, 0.4)
            ref_t, ref_l = (pt, pl) if phone else (vt, vl)
            m = [median_voice(ref_t, ref_l, u) - centred_max(t, l, u) for u in lines]
            m = [x for x in m if np.isfinite(x)]
            return round(float(min(m)), 1) if m else None
        e['inFilm'] = {'window': list(PLACES[cue]['window']), 'rule': PLACES[cue]['rule'], 'gainDb': round(float(gain), 1),
                       'effectMomentaryMax': round(momentary_max(placed), 1), 'windowTruePeak': loud['truePeak'],
                       'effectUnderWordsLU': closest(placed), 'effectUnderWordsPhoneLU': closest(placed, True),
                       'withScoreLU': closest(score + placed), 'withScorePhoneLU': closest(score + placed, True)}
        f, i = e['facts'], e['inFilm']
        print(f"{take_id}: on {f['onset']} s, peak {f['peakAt']} s, tail {f['tail']} s, {f['events']} event(s), longest drop {f['longestDrop']} s,"
              f" >4 kHz {f['above4kHz']:.1%}, floor -{f['floorBelowPeak']} dB, L/R {f['channelCorrelation']}"
              + (f", seam {f['seam']}" if 'seam' in f else '')
              + f" | in film: gain {i['gainDb']:+.1f} dB, max {i['effectMomentaryMax']} LUFS, TP {i['windowTruePeak']};"
              f" under words alone {i['effectUnderWordsLU']} LU (phone {i['effectUnderWordsPhoneLU']}),"
              f" with the score {i['withScoreLU']} (phone {i['withScorePhoneLU']})")
    LEDGER.write_bytes((json.dumps(ledger, indent=2, ensure_ascii=False) + '\n').encode('utf8'))


if __name__ == '__main__':
    main()
