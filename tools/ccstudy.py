#!/usr/bin/env python3
"""
Measures how professional mock-ups shape CC1 / CC11 / CC7 / CC21 around each
held note, in the terms AutoCC's envelope uses (start, rise, peak, settle,
sustain, fall), so presets can be set from data rather than taste.

    pip install mido
    python3 tools/ccstudy.py --set gold DIR [DIR ...] --set comp DIR ... \
        --json out.json

Each --set names a group of folders of .mid/.midi files. Nothing from the
files is written out except statistics; the MIDI itself never enters the repo.

The unit of analysis is AutoCC's own trigger unit, a *gesture*: the span from
the first key down (with no key held before it) to the last key up. That is
what Legato mode starts an envelope on. A live plug-in cannot know a
gesture's length at note-on, so the main curves are aligned to note-on and
averaged over the gestures still held at each moment: that is the curve a
live envelope could reproduce.
"""

import argparse
import bisect
import collections
import json
import math
import os
import re
import statistics as st
import sys

import mido

CCS = (1, 11, 7, 21)
MIN_CC_EVENTS = 20          # a track "rides" a CC if it has at least this many
MIN_GESTURE = 0.25          # s; shorter gestures are shorts, not AutoCC's job
DT = 0.02                   # s; trajectory sampling step
MOVE = 4                    # CC steps that count as movement, not jitter

# ---------------------------------------------------------------- classify
FAMILY = [
    ('perc',  r'perc|timp|cym|drum|snare|taiko|boom|hits?\b|gong|tam|toms?\b|djun|dhol|'
              r'triang|tamb|marimb|glock|celest|bells|xylo|kit|stomp|thump|clock'),
    ('keys',  r'\((choir|great|swell)\)|choir concert|piano|harp|guitar|gtr|organ|rhodes|celesta|mandolin|kora|oud|pluck|'
              r'keys|synth|zebra|omni|edna|pad|arp|seq|bass pulse|sub bass|drone|'
              r'nylon|pre-bass|glass|fx|growl|sweep|groove|batflap|posthuman|'
              r'diva|falcon|prologue|cimbalom|dulcimer|banjo|setar|dulcitone|orstphone'),
    ('choir', r'choir|vox|voice|whit[ai]c|syllab|venus|mars |oh-oo|lacrim|lacrm|\bahh\b|'
              r'\bmm\b|ooo|vocal|rhodope'),
    ('brass', r'brass|brs|horn|hn\b|fhn|tpt|trump|trb|tbn|tromb|bone|tuba|cimb|'
              r'cornet|flugel'),
    ('winds', r'wood|winds?\b|\bww\b|flute|fl\b|picc|oboe|clar|bsn|bassoon|recorder|'
              r'cor anglais|english horn|sax|shakuhachi|bansuri|pipes|whistle'),
    ('strings', r'\bstr\b|string|vln|violin|vla|viola|cello|celli|\bcell\b|\bbas\b|\bvc\b|\bcb\b|bass|ens|'
                r'con sord|flaut|harm|legato|leg\b|sus|long|scs|css|mural|albion|ark'),
]
SHORT = (r'spic|stac|short|\bsh\b|pizz|marc|portato|col legno|hits?\b|accent|acct|'
         r'falls?\b|core tech|trem|trill|ostinat|triplet|arps?\b|16th|\bsht\b|'
         r'(?<=full)sh\b|pulse|episodic|runs\b')


def despace(name):
    """'C e l l  B a s  4' -> 'Cell Bas 4': some exports space out every letter,
    with a wider gap between words."""
    words = []
    for part in re.split(r'\s{2,}', name.strip()):
        toks, run = [], []
        for t in part.split(' ') + ['']:          # join runs of 2+ single letters
            if len(t) == 1 and t.isalpha():
                run.append(t)
                continue
            toks += [''.join(run)] if len(run) > 1 else run
            run = []
            if t:
                toks.append(t)
        words.append(' '.join(toks))
    out = []          # 'F  u  l  l' arrives as four one-letter words
    for w in words:
        if out and len(w) == 1 and w.isalpha() and out[-1].isalpha() and \
                (len(out[-1]) == 1 or out[-1][-1].islower() and w.islower()):
            out[-1] += w
        else:
            out.append(w)
    return ' '.join(out)


def classify(name):
    n = despace(name).lower()
    fam = 'other'
    for f, rx in FAMILY:
        if re.search(rx, n):
            fam = f
            break
    # "English Horn" is a woodwind even though it says horn
    if re.search(r'english horn|cor anglais', n):
        fam = 'winds'
    short = bool(re.search(SHORT, n))
    return fam, short


# ---------------------------------------------------------------- loading
class Series:
    """Sample-and-hold CC lane."""
    def __init__(self, pts):
        pts.sort()
        self.t = [p[0] for p in pts]
        self.v = [p[1] for p in pts]

    def at(self, t):
        i = bisect.bisect_right(self.t, t) - 1
        return self.v[i] if i >= 0 else None

    def window(self, a, b):
        i = bisect.bisect_left(self.t, a)
        j = bisect.bisect_right(self.t, b)
        return self.t[i:j], self.v[i:j]


def load(path):
    mf = mido.MidiFile(path, clip=True)
    tpb = mf.ticks_per_beat
    tempo = [(0, 500000)]
    for tr in mf.tracks:
        tick = 0
        for m in tr:
            tick += m.time
            if m.type == 'set_tempo':
                tempo.append((tick, m.tempo))
    tempo.sort()
    # collapse duplicate ticks, last wins
    tm = []
    for tk, us in tempo:
        if tm and tm[-1][0] == tk:
            tm[-1] = (tk, us)
        else:
            tm.append((tk, us))
    ticks = [x for x, _ in tm]
    secs = [0.0]
    for (a, ua), (b, _) in zip(tm, tm[1:]):
        secs.append(secs[-1] + (b - a) * ua / tpb / 1e6)

    def sec(tick):
        i = bisect.bisect_right(ticks, tick) - 1
        return secs[i] + (tick - tm[i][0]) * tm[i][1] / tpb / 1e6

    def beat_len(t_sec):
        i = bisect.bisect_right(secs, t_sec) - 1
        return tm[max(0, i)][1] / 1e6

    tracks = []
    for tr in mf.tracks:
        name = ''
        by_ch = collections.defaultdict(lambda: {'notes': [], 'cc': collections.defaultdict(list)})
        open_ = {}
        tick = 0
        for m in tr:
            tick += m.time
            if m.type == 'track_name':
                name = name or m.name
            elif m.type == 'note_on' and m.velocity > 0:
                open_.setdefault((m.channel, m.note), []).append((sec(tick), m.velocity))
            elif m.type in ('note_off', 'note_on'):
                k = (m.channel, m.note)
                if open_.get(k):
                    s, v = open_[k].pop(0)
                    by_ch[m.channel]['notes'].append((s, sec(tick), m.note, v))
            elif m.type == 'control_change' and m.control in CCS:
                by_ch[m.channel]['cc'][m.control].append((sec(tick), m.value))
        for ch, d in by_ch.items():
            if not d['notes']:
                continue
            d['notes'].sort()
            tracks.append({'name': name.strip(), 'ch': ch, 'notes': d['notes'],
                           'cc': {c: Series(p) for c, p in d['cc'].items()
                                  if len(p) >= MIN_CC_EVENTS}})
    return tracks, beat_len


def gestures(notes):
    """AutoCC's Legato unit: first key down to last key up."""
    out = []
    cur = None
    for s, e, p, v in notes:
        if cur and s < cur['off'] - 1e-6:
            cur['off'] = max(cur['off'], e)
            cur['n'] += 1
        else:
            if cur:
                out.append(cur)
            cur = {'on': s, 'off': e, 'vel': v, 'pitch': p, 'n': 1}
    if cur:
        out.append(cur)
    for i, g in enumerate(out):
        g['prev_off'] = out[i - 1]['off'] if i else None
        g['next_on'] = out[i + 1]['on'] if i + 1 < len(out) else None
    return out


# ---------------------------------------------------------------- measures
def fit_exponent(xs, ys):
    """Best e for y = x^e on 0..1, by grid search (AutoCC's curve family)."""
    best, be = None, None
    for k in range(-40, 41):
        e = 2 ** (k / 10)        # 0.0625 .. 16
        err = sum((x ** e - y) ** 2 for x, y in zip(xs, ys))
        if best is None or err < best:
            best, be = err, e
    return be


def measure(g, s):
    on, off = g['on'], g['off']
    dur = off - on
    v_on = s.at(on + 0.001)
    if v_on is None:
        return None
    r = {'dur': dur, 'vel': g['vel'], 'pitch': g['pitch'], 'n': g['n']}
    r['v_on'] = v_on
    r['v_pre'] = s.at(on - 0.25)          # where it sat a quarter second before
    # samples across the held span
    ts = [on + i * DT for i in range(int(dur / DT) + 1)]
    vs = [s.at(t) for t in ts]
    pk = max(vs)
    ipk = vs.index(pk)
    r['peak'] = pk
    r['t_peak'] = ts[ipk] - on
    r['min_held'] = min(vs)
    r['v_end'] = vs[-1]
    r['rise'] = pk - v_on
    r['after_peak_drop'] = pk - min(vs[ipk:])
    r['sus'] = st.median(vs[ipk:]) if ipk < len(vs) - 1 else pk
    # shape class
    span = pk - min(vs)
    if span < MOVE:
        r['shape'] = 'flat'
    elif r['rise'] < MOVE:
        r['shape'] = 'fall'
    elif r['after_peak_drop'] >= MOVE:
        r['shape'] = 'arch'
    else:
        r['shape'] = 'rise'
    # rise exponent, normalised on->peak
    if r['rise'] >= 8 and ipk >= 4:
        xs = [i / ipk for i in range(ipk + 1)]
        ys = [(vs[i] - v_on) / r['rise'] for i in range(ipk + 1)]
        r['rise_exp'] = fit_exponent(xs, ys)
    # release: only when nothing else starts for a while
    nxt = g['next_on']
    gap = (nxt - off) if nxt else 99
    r['gap_after'] = gap
    if gap >= 1.0:
        r['rel'] = [s.at(off + k * 0.1) for k in range(11)]   # 0..1 s
    # lead-in: did the CC move in the 300 ms before the note?
    r['lead'] = v_on - (s.at(on - 0.3) if s.at(on - 0.3) is not None else v_on)
    prev = g['prev_off']
    r['gap_before'] = (on - prev) if prev is not None else 99
    r['pre'] = [s.at(on - 0.5 + k * 0.05) for k in range(11)]       # -500 ms .. note-on
    r['norm'] = [s.at(on + dur * k / 20) - v_on for k in range(21)]
    r['onset'] = [x - v_on for x in vs[:int(4.0 / DT) + 1:5]]      # every 100 ms
    if r.get('rel'):
        r['off'] = [s.at(off + (k - 10) * 0.1) for k in range(21)]
    return r


def trajectory(g, s, horizon=4.0):
    on, off = g['on'], g['off']
    n = int(min(off - on, horizon) / DT) + 1
    return [s.at(on + i * DT) for i in range(n)]


def norm_traj(g, s, k=21):
    on, off = g['on'], g['off']
    return [s.at(on + (off - on) * i / (k - 1)) for i in range(k)]


def offset_traj(g, s):
    """-1 s .. +1 s around note-off, sampled every 100 ms."""
    return [s.at(g['off'] + (k - 10) * 0.1) for k in range(21)]


# ---------------------------------------------------------------- stats
def q(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    i = int(k)
    return xs[i] if i + 1 >= len(xs) else xs[i] + (xs[i + 1] - xs[i]) * (k - i)


def qs(xs):
    return {'n': len([x for x in xs if x is not None]),
            'p10': q(xs, .1), 'p25': q(xs, .25), 'med': q(xs, .5),
            'p75': q(xs, .75), 'p90': q(xs, .9)}


def spearman(a, b):
    if len(a) < 8:
        return None
    def rank(x):
        o = sorted(range(len(x)), key=lambda i: x[i])
        r = [0] * len(x)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and x[o[j + 1]] == x[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    ra, rb = rank(a), rank(b)
    if len(set(ra)) < 2 or len(set(rb)) < 2:
        return None
    return st.correlation(ra, rb)


RAW = []
DUR_BINS = [(0.25, 0.6), (0.6, 1.2), (1.2, 2.5), (2.5, 5.0), (5.0, 1e9)]


def bin_of(d):
    for i, (a, b) in enumerate(DUR_BINS):
        if a <= d < b:
            return i
    return None


def analyse(paths):
    rows = collections.defaultdict(list)            # (fam, cc) -> measures
    onset = collections.defaultdict(lambda: collections.defaultdict(list))   # (fam,cc)->i->[v-v_on]
    onset_abs = collections.defaultdict(lambda: collections.defaultdict(list))
    normd = collections.defaultdict(lambda: collections.defaultdict(list))   # (fam,cc,bin)->k->[(v-v_on)/rise]
    offs = collections.defaultdict(lambda: collections.defaultdict(list))
    vel_corr = collections.defaultdict(list)          # (fam,cc) -> per-track rho(vel, v_on), rho(vel, peak)
    pair = collections.defaultdict(list)              # fam -> per gesture (range11/range1, corr)
    tempo_rows = collections.defaultdict(list)
    files = []
    track_count = collections.Counter()
    skipped = collections.Counter()
    seen = set()
    for path in paths:
        try:
            tracks, beat_len = load(path)
        except Exception as e:                 # noqa: BLE001 - report and carry on
            print(f"skip {path}: {e}", file=sys.stderr)
            continue
        files.append(os.path.basename(path))
        for tr in tracks:
            if not tr['cc']:
                continue
            fam, short = classify(tr['name'])
            if short or fam in ('perc', 'keys', 'other'):
                skipped[fam if not short else 'short'] += 1
                continue
            # (D) doubles and copies: identical notes and CC -> count once
            key = (tuple((round(a, 3), p) for a, _, p, _ in tr['notes'][:200]),
                   tuple(sorted(tr['cc'])))
            if key in seen:
                skipped['duplicate'] += 1
                continue
            seen.add(key)
            track_count[fam] += 1
            gs = [g for g in gestures(tr['notes']) if g['off'] - g['on'] >= MIN_GESTURE]
            per_track = collections.defaultdict(list)
            for c, s in tr['cc'].items():
                for g in gs:
                    m = measure(g, s)
                    if m is None:
                        continue
                    m['file'] = os.path.basename(path)
                    m['beat'] = beat_len(g['on'])
                    m['fam'] = fam
                    m['cc'] = c
                    m['track'] = tr['name']
                    RAW.append(m)
                    rows[(fam, c)].append(m)
                    rows[('all', c)].append(m)
                    per_track[c].append(m)
                    for F in (fam, 'all'):
                        tr_ = trajectory(g, s)
                        for i, v in enumerate(tr_):
                            onset[(F, c)][i].append(v - m['v_on'])
                            onset_abs[(F, c)][i].append(v)
                        b = bin_of(m['dur'])
                        if m['rise'] >= MOVE or m['after_peak_drop'] >= MOVE:
                            span = max(m['peak'] - m['v_on'], 1)
                            for k, v in enumerate(norm_traj(g, s)):
                                normd[(F, c, b)][k].append((v - m['v_on']) / span)
                        if m['gap_after'] >= 1.0:
                            ot = offset_traj(g, s)
                            if None not in ot:
                                for k, v in enumerate(ot):
                                    offs[(F, c)][k].append(v - ot[10])
            for c, ms in per_track.items():
                if len(ms) >= 8:
                    r1 = spearman([m['vel'] for m in ms], [m['v_on'] for m in ms])
                    r2 = spearman([m['vel'] for m in ms], [m['peak'] for m in ms])
                    vel_corr[(fam, c)].append((r1, r2, len(ms)))
                    vel_corr[('all', c)].append((r1, r2, len(ms)))
            # CC11 against CC1 on the same gesture
            if 1 in tr['cc'] and 11 in tr['cc']:
                for g in gs:
                    a = norm_traj(g, tr['cc'][1], 41)
                    b = norm_traj(g, tr['cc'][11], 41)
                    if None in a or None in b:
                        continue
                    ra, rb = max(a) - min(a), max(b) - min(b)
                    rec = {'r1': ra, 'r11': rb, 'm1': st.mean(a), 'm11': st.mean(b),
                           'dur': g['off'] - g['on']}
                    if ra >= MOVE and rb >= MOVE and len(set(a)) > 1 and len(set(b)) > 1:
                        rec['corr'] = st.correlation(a, b)
                    pair[fam].append(rec)
                    pair['all'].append(rec)
    return {'rows': rows, 'onset': onset, 'onset_abs': onset_abs, 'normd': normd,
            'offs': offs, 'vel_corr': vel_corr, 'pair': pair, 'files': files,
            'tracks': track_count, 'skipped': skipped}


def summarise(A):
    out = {'files': A['files'], 'tracks': dict(A['tracks']), 'skipped': dict(A['skipped']),
           'lanes': {}, 'pair': {}}
    for (fam, c), ms in sorted(A['rows'].items()):
        if len(ms) < 30:
            continue
        shapes = collections.Counter(m['shape'] for m in ms)
        d = {
            'gestures': len(ms),
            'files': len({m['file'] for m in ms}),
            'shape': {k: round(v / len(ms), 3) for k, v in shapes.items()},
            'v_pre': qs([m['v_pre'] for m in ms]),
            'v_on': qs([m['v_on'] for m in ms]),
            'peak': qs([m['peak'] for m in ms]),
            'rise': qs([m['rise'] for m in ms]),
            'lead': qs([m['lead'] for m in ms]),
            'leads_up_share': round(sum(1 for m in ms if m['lead'] >= MOVE) / len(ms), 3),
            'sus': qs([m['sus'] for m in ms]),
            'after_peak_drop': qs([m['after_peak_drop'] for m in ms if m['shape'] == 'arch']),
        }
        # time to peak by duration bin, and as a fraction of the gesture
        d['t_peak_ms'] = {}
        d['t_peak_frac'] = {}
        d['rise_exp'] = {}
        d['t_peak_beats'] = {}
        for i, (a, b) in enumerate(DUR_BINS):
            sel = [m for m in ms if a <= m['dur'] < b and m['shape'] in ('arch', 'rise')]
            lab = f"{a:g}-{b:g}s" if b < 1e8 else f">{a:g}s"
            if len(sel) >= 10:
                d['t_peak_ms'][lab] = qs([1000 * m['t_peak'] for m in sel])
                d['t_peak_frac'][lab] = qs([m['t_peak'] / m['dur'] for m in sel])
                d['t_peak_beats'][lab] = qs([m['t_peak'] / m['beat'] for m in sel])
                ex = [m['rise_exp'] for m in sel if 'rise_exp' in m]
                if len(ex) >= 10:
                    d['rise_exp'][lab] = qs(ex)
        # does rise time follow the clock or the tempo?  compare spread
        sel = [m for m in ms if m['shape'] in ('arch', 'rise') and m['t_peak'] > 0.05]
        if len(sel) >= 30:
            ls = [math.log(m['t_peak']) for m in sel]
            lb = [math.log(m['t_peak'] / m['beat']) for m in sel]
            d['tempo_test'] = {'sd_log_sec': round(st.pstdev(ls), 3),
                               'sd_log_beats': round(st.pstdev(lb), 3),
                               'rho_tpeak_beat': spearman([m['beat'] for m in sel],
                                                          [m['t_peak'] for m in sel]),
                               'rho_tpeak_dur': spearman([m['dur'] for m in sel],
                                                         [m['t_peak'] for m in sel])}
        # onset-aligned median curve of gestures still held (live-reproducible)
        on = A['onset'][(fam, c)]
        oa = A['onset_abs'][(fam, c)]
        d['onset_curve'] = {f"{i * DT:.2f}": {'n': len(on[i]), 'med_delta': q(on[i], .5),
                                              'p25': q(on[i], .25), 'p75': q(on[i], .75),
                                              'med_abs': q(oa[i], .5)}
                            for i in range(0, 201, 5) if len(on.get(i, [])) >= 20}
        d['norm_curve'] = {}
        for i, (a, b) in enumerate(DUR_BINS):
            nd = A['normd'].get((fam, c, i))
            lab = f"{a:g}-{b:g}s" if b < 1e8 else f">{a:g}s"
            if nd and len(nd[0]) >= 20:
                d['norm_curve'][lab] = [round(q(nd[k], .5), 3) for k in range(21)]
        of = A['offs'].get((fam, c))
        if of and len(of[0]) >= 20:
            d['offset_curve'] = {'n': len(of[0]),
                                 'med': [q(of[k], .5) for k in range(21)],
                                 'p25': [q(of[k], .25) for k in range(21)],
                                 'p75': [q(of[k], .75) for k in range(21)]}
        vc = A['vel_corr'].get((fam, c), [])
        if vc:
            d['vel_rho_v_on'] = qs([x[0] for x in vc])
            d['vel_rho_peak'] = qs([x[1] for x in vc])
            d['vel_tracks'] = len(vc)
        out['lanes'][f"{fam}/CC{c}"] = d
    for fam, recs in A['pair'].items():
        if len(recs) < 30:
            continue
        both = [r for r in recs if r['r1'] >= MOVE and r['r11'] >= MOVE]
        out['pair'][fam] = {
            'gestures': len(recs),
            'both_move': round(len(both) / len(recs), 3),
            'only_cc1_moves': round(sum(1 for r in recs if r['r1'] >= MOVE and r['r11'] < MOVE) / len(recs), 3),
            'only_cc11_moves': round(sum(1 for r in recs if r['r11'] >= MOVE and r['r1'] < MOVE) / len(recs), 3),
            'range_ratio_11_over_1': qs([r['r11'] / r['r1'] for r in both]),
            'corr': qs([r['corr'] for r in both if 'corr' in r]),
            'mean_cc1': qs([r['m1'] for r in recs]),
            'mean_cc11': qs([r['m11'] for r in recs]),
        }
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--set', nargs='+', action='append', metavar=('NAME', 'DIR'),
                    required=True, help='a named group of folders')
    ap.add_argument('--json', help='write the summary here')
    ap.add_argument('--raw', help='write every per-gesture record here (JSON, one set per key)')
    a = ap.parse_args()
    res = {}
    raw = {}
    for name, *dirs in a.set:
        paths = []
        for d in dirs:
            for f in sorted(os.listdir(d)):
                if f.lower().endswith(('.mid', '.midi')) and not f.startswith('.'):
                    paths.append(os.path.join(d, f))
        RAW.clear()
        res[name] = summarise(analyse(paths))
        raw[name] = [dict(m) for m in RAW]
        print(f"{name}: {len(res[name]['files'])} files, tracks {res[name]['tracks']}, "
              f"skipped {res[name]['skipped']}", file=sys.stderr)
    js = json.dumps(res, indent=1, default=lambda x: round(x, 3) if isinstance(x, float) else x)
    if a.raw:
        with open(a.raw, 'w') as f:
            json.dump(raw, f)
    if a.json:
        with open(a.json, 'w') as f:
            f.write(js)
    else:
        print(js)


if __name__ == '__main__':
    main()
