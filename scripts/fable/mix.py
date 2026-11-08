"""Mix the fable's soundtrack on the locked radio cut, from what the artist chose, and measure it.

Stems, all mono at 44.1 kHz and sample-aligned (the cut plus 3 s of black):
  - dialogue: Tom exactly as locked. The locked cut holds his few loudest peaks under -3.5 dBFS with
    a limiter whose lookahead delays it by about 1 ms, so the dialogue stem is the locked cut moved
    back onto the stems' timeline (the one radio-cut.json describes) less the night;
  - night: the night air in code, as in the locked cut (-45 LUFS);
  - music: the chosen score (m3-f-1 at level 3), eased only where the effects and night under a line
    would bring the bed within the floors (mix.json gates), with its own ride's hold and smoothing,
    and at most mix.json's dipMaxDb;
  - effects: the curtains, the branch and the touch, placed and levelled as on the effects page
    (sfx_takes.py); and the pond: the chosen loop cut in with the picture's cut to the pond at one
    level, its read jumped once so the ease and the rest don't replay the same lapping, its phase
    chosen so no wrap lands near a long silence or the touch. At the touch a second read of the
    same take, brighter and louder, is placed so a lap starts inside the silence (the ripples);
    from the touch, bed and ripples decay on one envelope to the night's level in the next silence
    and to digital silence by the end of "still,".
The black stays digital silence. No limiter: the true peak is a gate, reported, also after the
delivery codecs. Under words means while Tom speaks: 0.4 s loudness windows wholly inside a line
where his own level is within 15 dB of the line's median (a line's span runs from cut point to cut
point in the silences, so a touch in a gap isn't counted); margins are against that median, on
headphones and through the phone stand-in (a 400 Hz high-pass).

Usage: python scripts/fable/mix.py STEMS_DIR OUT_DIR
  STEMS_DIR holds radio_cut.mjs's narration.wav, night.wav and radio-cut.wav for the locked cut.
  OUT_DIR gets the stems, soundtrack.wav and the listening copies A (the locked cut), B (with the
  score as chosen), mix and no-music (Tom, night and effects: decision 25's strangers);
  scripts/fable/mix-render.json gets the measurements.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

sys.path.insert(0, str(Path(__file__).parent))
from music_takes import RATE, biquad_shelf, decode, ffmpeg_loudness, loudness_curve  # noqa: E402
from score import CUT, MUSIC, PHONE, median_voice, mp3, write_wav  # noqa: E402
from sfx_takes import TOUCH_GAP, place  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CONF = json.loads((ROOT / 'scripts/fable/mix.json').read_text(encoding='utf8'))
SFX = json.loads((ROOT / 'scripts/fable/sfx-ledger.json').read_text(encoding='utf8'))
CUT_AT = CUT['length']['toCut']
G = CONF['gates']
TOUCH = TOUCH_GAP[0] + 0.25  # the touch's peak (sfx_takes.PLACES)


def mono(take_id):
    return decode(ROOT / 'audition' / SFX['entries'][take_id]['file'], channels=2).mean(axis=0)


def smooth(x, seconds):
    k = int(seconds * RATE)
    c = np.concatenate([[0.0], np.cumsum(np.pad(x, (k // 2, k - k // 2 - 1), mode='edge'))])
    return (c[k:] - c[:-k]) / k


def read(loop, start, count):
    """`count` samples of the loop read from `start` seconds into it, wrapping."""
    s = int(start * RATE) % len(loop)
    return np.tile(loop, int(np.ceil((count + s) / len(loop))) + 1)[s:s + count]


def strongest_lap(loop):
    """Where in the take a lap rises most clearly: the 10 ms level's rise over the 0.3 s before."""
    n = int(0.01 * RATE)
    db = 20 * np.log10(np.sqrt((loop[:len(loop) // n * n].reshape(-1, n) ** 2).mean(axis=1)) + 1e-9)
    rise = [db[i:i + 25].max() - db[i - 30:i].mean() for i in range(30, len(db) - 25)]
    return (30 + int(np.argmax(rise))) * 0.01, float(max(rise))


def pond(n, tt, out, night, voice_curves):
    p, r = CONF['pond'], CONF['ripples']
    loop = mono(p['take'])
    length = len(loop) / RATE
    tmp = out / 'pond-loop.wav'
    write_wav(loop, tmp)
    gain = 10 ** ((p['lufs'] - ffmpeg_loudness(tmp)['lufs']) / 20)
    tmp.unlink()
    t_in, t_still = p['in']['at'], r['stillAt']
    sp, jump = p['splice']['at'], p['splice']['jumpS']
    i0, i1 = int(t_in * RATE), int(t_still * RATE)

    # The bed's phase: wraps (before and after the jump) as far as possible from the long silences and the touch.
    hazards = [(u['end'], u['end'] + u['gapAfter']) for u in CUT['units'] if u['gapAfter'] > 1.0 and u['end'] < t_still] + [(TOUCH - 0.3, TOUCH + 1.0)]

    def wraps(off):
        a = [w for w in np.arange(t_in + length - off, sp, length)]
        b = [w for w in np.arange(sp + (length - (sp - t_in + off + jump) % length), t_still, length)]
        return a + b

    def clearance(off):
        return min((0.0 if a - 1 <= w <= b + 1 else min(abs(w - a), abs(w - b))) for w in wraps(off) for a, b in hazards)
    off = float(max(np.arange(0, length, 0.05), key=clearance))
    count = i1 - i0
    first, second = read(loop, off, count), read(loop, off + jump, count)
    x = (tt[i0:i1] - (sp - p['splice']['crossfadeS'] / 2)) / p['splice']['crossfadeS']
    w = np.clip(x, 0, 1) * np.pi / 2
    bed = np.zeros(n)
    bed[i0:i1] = (first * np.cos(w) + second * np.sin(w)) * gain
    k = int(p['in']['fadeS'] * RATE)
    bed[i0:i0 + k] *= np.linspace(0, 1, k)

    # The ripples: a second read, brighter and louder, with a lap starting inside the silence.
    lap, lap_rise = strongest_lap(loop)
    t0 = TOUCH
    soff = lap - r['lapAfterTouchS']
    j0 = int(t0 * RATE)
    stir = np.zeros(n)
    stir[j0:i1] = read(loop, soff, i1 - j0) * gain * 10 ** (r['stirDb'] / 20)
    stir = lfilter(*biquad_shelf(r['shelfHz'], r['shelfDb'], 0.7071), stir)
    after = np.clip(tt - t0, 0, None)
    stir *= np.where(tt >= t0, 1 - np.exp(-after / 0.08), 0.0)
    # One envelope from the touch for both, then a short fade to digital silence ending at "still,".
    env = np.where(tt < t0, 1.0, np.exp(-after / r['tauS']))
    env *= np.clip((t_still - tt) / r['fadeToZeroS'], 0, 1)
    # Under words the ripples keep the branch's rule: 12 LU under each line, 9 through the phone
    # stand-in. They are brightest just as Tom says what made them, so this only ever lowers them.
    vt, vl, pt, pl = voice_curves
    under = [u for u in CUT['units'] if u['end'] > t0 and u['at'] < t_still]
    trim = min(0.0, min(min(m - r['underWordsLU'], pm - r['underWordsPhoneLU']) for _, m, pm in margins(under, stir * env, vt, vl, pt, pl)))
    stir *= 10 ** (trim / 20)
    wet = (bed + stir) * env
    wet[i1:] = 0.0

    # Checks on the pond alone: water in the touch's silence, settled by the next silence, and how
    # alike the ease and the rest are.
    pt_, pl_ = loudness_curve(wet, 0.4)
    nt_, nl_ = loudness_curve(night, 0.4)
    pre = np.median(pl_[(pt_ >= t0 - 10) & (pt_ + 0.4 <= TOUCH_GAP[0])])
    in_gap = pl_[(pt_ + 0.2 >= t0 + 0.1) & (pt_ + 0.2 <= TOUCH_GAP[1])].max()
    quiet_gap = next((u['end'], u['end'] + u['gapAfter']) for u in CUT['units'] if u['end'] > TOUCH_GAP[1])
    settled = pl_[(pt_ >= quiet_gap[0] + 0.5) & (pt_ + 0.4 <= quiet_gap[1])]
    night_there = nl_[(nt_ >= quiet_gap[0] + 0.5) & (nt_ + 0.4 <= quiet_gap[1])]
    ease, rest = (next(u for u in CUT['units'] if u.get('why') == why) for why in ('the ease', 'the rest'))
    a = wet[int((ease['end'] + 0.5) * RATE):int((ease['end'] + ease['gapAfter'] - 0.5) * RATE)]
    b = wet[int((rest['end'] + 0.5) * RATE):int((rest['end'] + 0.5) * RATE) + len(a)]
    alike = float(np.corrcoef(a, b)[0, 1])
    facts = {'gainDb': round(float(20 * np.log10(gain)), 1), 'in': t_in, 'stillAt': t_still, 'touch': round(t0, 2),
             'phaseS': round(off, 2), 'wraps': [round(float(v), 2) for v in wraps(off)], 'wrapClearanceS': round(float(clearance(off)), 2),
             'splice': sp, 'easeRestCorrelation': round(alike, 2),
             'ripples': {'trimUnderWordsDb': round(float(trim), 1), 'lapInTakeS': round(lap, 2), 'lapRiseDb': round(lap_rise, 1), 'readFromS': round(soff, 2),
                         'preTouchMedianLufs': round(float(pre), 1), 'inGapMaxLufs': round(float(in_gap), 1),
                         'inGapOverBedDb': round(float(in_gap - pre), 1),
                         'settledGap': [round(quiet_gap[0], 2), round(quiet_gap[1], 2)],
                         'settledMaxLufs': round(float(settled.max()), 1), 'nightThereMinLufs': round(float(night_there.min()), 1)}}
    return wet, facts


def speaking_max(t, l, u, vl, med):
    """The bed's loudest 0.4 s window while Tom speaks the line: wholly inside the line's span (which
    runs from cut point to cut point in the silences, so a sound in the gap before it isn't counted)
    and with his own level there within 15 dB of the line's median."""
    m = (t >= u['at']) & (t + 0.4 <= u['end']) & (vl >= med - 15)
    return l[m].max() if m.any() else -np.inf


def margins(units, bed, vt, vl, pt, pl):
    t, l = loudness_curve(bed, 0.4)
    _, lp = loudness_curve(lfilter(*PHONE, bed), 0.4)
    out = []
    for u in units:
        mv, mp = median_voice(vt, vl, u), median_voice(pt, pl, u)
        out.append((u, float(mv - speaking_max(t, l, u, vl, mv)), float(mp - speaking_max(t, lp, u, pl, mp))))
    return out


def codec_true_peak(wav, out):
    """The true peak after the delivery codecs (decision 23: Opus 96k, AAC-LC 128k)."""
    peaks = {}
    for name, args, ext in (('opus96', ['-c:a', 'libopus', '-b:a', '96k'], 'opus'), ('aac128', ['-c:a', 'aac', '-b:a', '128k'], 'm4a')):
        enc = out / f'soundtrack-check.{ext}'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), *args, str(enc)], check=True)
        peaks[name] = ffmpeg_loudness(enc)['truePeak']
        enc.unlink()
    return peaks



def main():
    stems, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    narration, night, cut = decode(stems / 'narration.wav'), decode(stems / 'night.wav'), decode(stems / 'radio-cut.wav')
    n = len(cut)
    score = decode(ROOT / 'audition' / MUSIC['score']['stem'])
    assert len(narration) == len(night) == len(score) == n, 'stems must line up with the radio cut'
    a, b = int(10 * RATE), int(14 * RATE)
    s = narration + night
    lag = max(range(-200, 201), key=lambda k: float(np.dot(s[a:b], cut[a + k:b + k])))
    aligned = np.zeros(n)
    aligned[:n - lag] = cut[lag:]
    voice = aligned - night
    assert np.abs(voice - narration).max() < 0.5, 'the aligned cut should differ from the narration only where the limiter acted'
    limiter_db = float(20 * np.log10((np.abs(narration).max() + 1e-12) / (np.abs(voice).max() + 1e-12)))
    cut = aligned
    tt = np.arange(n) / RATE
    vt, vl = loudness_curve(voice, 0.4)
    pt, pl = loudness_curve(lfilter(*PHONE, voice), 0.4)
    units = CUT['units']

    effects, report = np.zeros(n), {'mix': CONF['version'], 'radioCut': CUT['version'], 'score': MUSIC['score']['take'], 'effects': {}}
    for cue, c in CONF['effects'].items():
        x, gain = place(cue, mono(c['take']), n, vt, vl, pt, pl, out)
        trim = c.get('trimDb', 0.0)  # the artist's ear, after the effects page's first level
        effects += x * 10 ** (trim / 20)
        report['effects'][cue] = {'take': c['take'], 'gainDb': round(float(gain + trim), 1), 'trimDb': trim}
    wet, report['pond'] = pond(n, tt, out, night, (vt, vl, pt, pl))
    effects += wet
    effects[int(CUT_AT * RATE):] = 0.0  # nothing passes the cut

    # The score, eased only where the bed under a line would come within the floors.
    cap = CONF['score']['dipMaxDb']
    # Held dips the artist asked for by ear (mix.json score.holds), through the same 2 s smoothing as
    # the ride, so the score moves over seconds, never as an edit.
    held = np.zeros(n)
    for h in CONF['score'].get('holds', []):
        held[int(h['from'] * RATE):int(h['to'] * RATE)] = np.minimum(held[int(h['from'] * RATE):int(h['to'] * RATE)], h['db'])
    held = smooth(held, 2.0)
    need = {id(u): 0.0 for u in units}
    for _ in range(10):
        dip = np.zeros(n)
        for u in units:
            if need[id(u)] < 0:
                i, j = int(max(0, u['at'] - 1.5) * RATE), int(min(n / RATE, u['end'] + 2.5) * RATE)
                dip[i:j] = np.minimum(dip[i:j], need[id(u)])
        dip = np.maximum(smooth(dip, 2.0), -cap)
        short = False
        for u, m, pm in margins(units, score * 10 ** ((dip + held) / 20) + effects + night, vt, vl, pt, pl):
            deficit = max(G['underWordsLU'] - m, G['underWordsPhoneLU'] - pm)
            if deficit > 0.05 and need[id(u)] > -cap:
                need[id(u)] -= deficit + 0.2
                short = True
        if not short:
            break
    music = score * 10 ** ((dip + held) / 20)

    soundtrack = voice + night + music + effects
    for name, x in {'dialogue': voice, 'night': night, 'music': music, 'effects': effects, 'soundtrack': soundtrack,
                    'dialogue-effects': voice + effects, 'no-music': voice + night + effects}.items():
        write_wav(x, out / f'{name}.wav')
    write_wav(decode(stems / 'radio-cut.wav') + score, out / 'with-score.wav')  # B as the artist heard it
    mp3(stems / 'radio-cut.wav', out / 'A.mp3')
    mp3(out / 'with-score.wav', out / 'B.mp3')
    mp3(out / 'soundtrack.wav', out / 'mix.mp3')
    mp3(out / 'no-music.wav', out / 'no-music.mp3')
    (out / 'with-score.wav').unlink()

    # Measurements and gates.
    lines = margins(units, music + effects + night, vt, vl, pt, pl)
    without = margins(units, music + night, vt, vl, pt, pl)
    cost = [(u, m0 - m, pm0 - pm) for (u, m, pm), (_, m0, pm0) in zip(lines, without)]
    gaps = [(u['end'], u['end'] + u['gapAfter'], u.get('why') or 'a 1 s gap') for u in units] + [(0.0, units[0]['at'], 'the curtains')]
    bt, bl = loudness_curve(music + effects + night, 0.4)
    silences = []
    for x0, x1, why in gaps:
        m = (bt + 0.2 >= x0) & (bt + 0.2 <= x1)
        silences.append({'from': round(x0, 2), 'to': round(x1, 2), 'why': why, 'momentaryMax': round(float(bl[m].max()), 1) if m.any() else None})
    loud = {k: ffmpeg_loudness(out / f'{k}.wav') for k in ('soundtrack', 'dialogue', 'music', 'effects', 'dialogue-effects')}
    loud['dialogueEffectsNight'] = ffmpeg_loudness(out / 'no-music.wav')
    (out / 'dialogue-effects.wav').unlink()
    rp = report['pond']['ripples']
    gates = {
        'underWords': min(m for _, m, _ in lines) >= G['underWordsLU'] - 0.05,
        'underWordsPhone': min(pm for _, _, pm in lines) >= G['underWordsPhoneLU'] - 0.05,
        # In the silences nothing passes -26 LUFS momentary; the touch's own gap holds the touch, set at
        # -26 itself, so there the bed under it is allowed touchGapAllowanceLU.
        'silences': all(x['momentaryMax'] is None or x['momentaryMax'] <= G['silenceMomentaryMax'] + (G['touchGapAllowanceLU'] if x['why'] == 'the touch' else 0)
                        for x in silences),
        'scoreDip': float(dip.min()) >= -cap - 0.05,
        'ripplesInTheGap': rp['inGapOverBedDb'] >= G['rippleInGapOverBedDb'],
        'pondSettledByTheNextSilence': rp['settledMaxLufs'] <= rp['nightThereMinLufs'],
        'truePeak': loud['soundtrack']['truePeak'] <= G['truePeakMax'],
        'dialogueLra': loud['dialogue']['lra'] <= G['dialogueLraMax'],
        'dialogueAndEffectsLra': loud['dialogue-effects']['lra'] <= G['dialogueAndEffectsLraMax'],
        'blackSilent': bool(np.abs(soundtrack[int(CUT_AT * RATE):]).max() == 0),
        # Tom and the night together are the locked cut, to within 16-bit rounding of the written stems.
        'dialogueAndNightAreTheLockedCut': bool(np.abs(decode(out / 'dialogue.wav') + decode(out / 'night.wav') - cut).max() <= 2.5 / 32768),
    }
    r = dip < -0.1
    worst_cost = sorted(cost, key=lambda x: -x[2])[:3]
    report.update({
        'lockedCutLimiterDb': round(limiter_db, 2),
        'lockedCutLagSamples': lag,
        'scoreDip': {'deepestDb': round(float(dip.min()), 1), 'secondsEased': round(float(r.sum() / RATE), 1),
                     'spans': [round(float(tt[r][0]), 1), round(float(tt[r][-1]), 1)] if r.any() else None},
        'scoreHolds': [{**h, 'deepestDb': round(float(held[int(h['from'] * RATE):int(h['to'] * RATE)].min()), 1)} for h in CONF['score'].get('holds', [])],
        'loudness': loud,
        'deliveryTruePeak': codec_true_peak(out / 'soundtrack.wav', out),
        'lines': [{'p': f"{u['p']}{u.get('part', '')}", 'margin': round(m, 1), 'phoneMargin': round(pm, 1),
                   'effectsCost': round(c, 1), 'effectsCostPhone': round(cp, 1)} for (u, m, pm), (_, c, cp) in zip(lines, cost)],
        'worstLines': [f"{u['p']}{u.get('part', '')} {m:.1f}" for u, m, _ in sorted(lines, key=lambda x: x[1])[:3]],
        'worstPhoneLines': [f"{u['p']}{u.get('part', '')} {pm:.1f}" for u, _, pm in sorted(lines, key=lambda x: x[2])[:3]],
        'effectsCostPhoneMost': [f"{u['p']}{u.get('part', '')} {cp:.1f}" for u, _, cp in worst_cost],
        'silences': silences,
        'gates': gates,
    })
    (ROOT / 'scripts/fable/mix-render.json').write_bytes((json.dumps(report, indent=1, ensure_ascii=False) + '\n').encode('utf8'))
    print('effects:', report['effects'])
    print('pond:', report['pond'])
    print('score dip:', report['scoreDip'], '| holds:', report['scoreHolds'])
    print('loudness:', loud, '| after codecs:', report['deliveryTruePeak'])
    print('worst lines:', report['worstLines'], '| phone:', report['worstPhoneLines'], '| effects cost most (phone):', report['effectsCostPhoneMost'])
    print('loudest silences:', sorted(silences, key=lambda x: -(x['momentaryMax'] or -99))[:4])
    print('gates:', gates)


if __name__ == '__main__':
    main()
