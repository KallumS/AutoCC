#!/usr/bin/env python3
"""
Turns ccstudy.py's output into the tables in docs/research/per-note-analysis.md,
and fits AutoCC's own envelope (rise, settle, sustain) to what was measured.

    python3 tools/ccstudy.py --set gold DIR --set comp DIR \
        --json summary.json --raw raw.json
    python3 tools/ccreport.py raw.json summary.json

"Isolated" notes start at least 0.4 s after the previous key was lifted, so
they are the ones a fresh AutoCC envelope would fire on. Curves are means over
the notes still held at each moment, which is what a live envelope, not
knowing how long the note will be, can reproduce.
"""
import json
import statistics as st
import sys

ISO = 0.4


def mean(xs):
    xs = [x for x in xs if x is not None]
    return st.mean(xs) if xs else None


def q(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    i = int(k)
    return xs[i] if i + 1 >= len(xs) else xs[i] + (xs[i + 1] - xs[i]) * (k - i)


def rank(x):
    o = sorted(range(len(x)), key=lambda i: x[i])
    r = [0] * len(x)
    for j, i in enumerate(o):
        r[i] = j
    return r


def rho(a, b):
    return st.correlation(rank(a), rank(b)) if len(a) > 10 else None


def env(t, A, T, e, D, S):
    """AutoCC above its start value: stage 1 rise, stage 2 settle, stage 3 hold."""
    if t < T:
        return A * (t / T) ** e
    t -= T
    if t < D:
        return A + (S - A) * (t / D)
    return S


def held_curve(ms):
    pts = []
    for i in range(1, 41):
        xs = [m['onset'][i] for m in ms if len(m['onset']) > i]
        if len(xs) >= 15:
            pts.append((i * 0.1, mean(xs), len(xs)))
    return pts


def fit(pts):
    best = None
    for A in range(2, 41):
        for T in (100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500,
                  1800, 2200, 2600, 3000, 3500, 4000):
            for k in range(-30, 21):
                e = 2 ** (k / 10)
                for D in (0, 200, 400, 800, 1200):
                    for S in ([A] if D == 0 else [A * f for f in (0.4, 0.6, 0.8)]):
                        err = sum(n * (env(t, A, T / 1000, e, D / 1000, S) - y) ** 2
                                  for t, y, n in pts)
                        if best is None or err < best[0]:
                            best = (err, A, T, e, D, S)
    err, A, T, e, D, S = best
    return A, T, e, D, S, (err / sum(n for *_, n in pts)) ** 0.5


def groups(R, setn):
    for cc in (1, 11):
        for fam in ('strings', 'brass', 'winds', 'choir', 'all'):
            ms = [m for m in R[setn] if m['cc'] == cc and (fam == 'all' or m['fam'] == fam)
                  and m['gap_before'] >= ISO]
            if len(ms) >= 40:
                yield cc, fam, ms


def main():
    R = json.load(open(sys.argv[1]))
    J = json.load(open(sys.argv[2]))
    f = lambda x: '–' if x is None else f"{x:.0f}"
    fs = lambda x: '–' if x is None else f"{x:+.0f}"

    print("## Isolated notes: level at note-on, then the mean rise while held\n")
    print("| Set | Lane | Family | Notes | Files | 0.5 s before | Note-on | +0.2 s | +0.5 s | +1 s | +2 s | +3 s |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for setn in R:
        for cc, fam, ms in groups(R, setn):
            def at(t):
                i = int(round(t / 0.1))
                xs = [m['onset'][i] for m in ms if len(m['onset']) > i]
                return mean(xs) if len(xs) >= 15 else None
            print(f"| {setn} | CC{cc} | {fam} | {len(ms)} | {len({m['file'] for m in ms})} | "
                  f"{f(q([m['pre'][0] for m in ms], .5))} | {f(q([m['v_on'] for m in ms], .5))} | "
                  f"{fs(at(.2))} | {fs(at(.5))} | {fs(at(1))} | {fs(at(2))} | {fs(at(3))} |")

    print("\n## AutoCC's envelope fitted to those curves\n")
    print("| Set | Lane | Family | Start | Swell | Rise | Rise Shape | Settle | Sustain | Error (RMS) |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for setn in R:
        for cc, fam, ms in groups(R, setn):
            A, T, e, D, S, rms = fit(held_curve(ms))
            print(f"| {setn} | CC{cc} | {fam} | {f(q([m['v_on'] for m in ms], .5))} | +{A} | "
                  f"{T} ms | {e:.2f} | {D} ms | +{S:.0f} | {rms:.1f} |")

    print("\n## Notes inside a legato line (connected): mean change while held\n")
    print("| Set | Lane | Notes | +0.5 s | +1 s | +2 s | +3 s |")
    print("|---|---|---|---|---|---|---|")
    for setn in R:
        for cc in (1, 11):
            ms = [m for m in R[setn] if m['cc'] == cc and m['gap_before'] < ISO]
            row = [mean([m['onset'][i] for m in ms if len(m['onset']) > i]) for i in (5, 10, 20, 30)]
            print(f"| {setn} | CC{cc} | {len(ms)} | " + ' | '.join(fs(x) for x in row) + " |")

    print("\n## Around note-off (notes followed by at least 1 s of silence)\n")
    print("| Set | Lane | Notes | −1 s | −0.6 s | −0.2 s | +0.2 s | +0.6 s | +1 s |")
    print("|---|---|---|---|---|---|---|---|---|")
    for setn in R:
        for cc in (1, 11):
            ms = [m for m in R[setn] if m['cc'] == cc and m.get('off') and None not in m['off']]
            row = [mean([m['off'][k] - m['off'][10] for m in ms]) for k in (0, 4, 8, 12, 16, 20)]
            print(f"| {setn} | CC{cc} | {len(ms)} | " + ' | '.join(fs(x) for x in row) + " |")

    print("\n## Velocity and tempo\n")
    print("| Set | Lane | Tracks | ρ velocity ~ level at note-on | ρ velocity ~ peak | ρ half-rise time ~ beat length |")
    print("|---|---|---|---|---|---|")
    for setn in R:
        for cc in (1, 11):
            lane = J[setn]['lanes'].get(f'all/CC{cc}', {})
            iso = [m for m in R[setn] if m['cc'] == cc and m['gap_before'] >= ISO]
            t50, bl = [], []
            for m in iso:
                if m['dur'] >= 2 and m['peak'] - m['v_on'] >= 8:
                    tgt = (m['peak'] - m['v_on']) / 2
                    k = next((i for i, x in enumerate(m['onset']) if x >= tgt), None)
                    if k is not None:
                        t50.append(k * 0.1)
                        bl.append(m['beat'])
            r = rho(bl, t50)
            vo, vp = lane.get('vel_rho_v_on', {}), lane.get('vel_rho_peak', {})
            print(f"| {setn} | CC{cc} | {lane.get('vel_tracks', '–')} | {vo.get('med', 0):.2f} | "
                  f"{vp.get('med', 0):.2f} | {'–' if r is None else f'{r:.2f}'} |")

    print("\n## CC11 against CC1 on the same notes\n")
    print("| Set | Family | Notes | Both move | CC11 range ÷ CC1 range (median, IQR) | Correlation (median) |")
    print("|---|---|---|---|---|---|")
    for setn in J:
        for fam, p in J[setn]['pair'].items():
            rr, c = p['range_ratio_11_over_1'], p['corr']
            if rr['med'] is None:
                continue
            print(f"| {setn} | {fam} | {p['gestures']} | {p['both_move']:.0%} | "
                  f"{rr['med']:.2f} ({rr['p25']:.2f}–{rr['p75']:.2f}) | {c['med']:.2f} |")

    print("\n## How often each lane moves at all inside a held note\n")
    print("| Set | Lane | Notes | Flat | Rise | Arch | Fall |")
    print("|---|---|---|---|---|---|---|")
    for setn in J:
        for cc in (1, 11, 7, 21):
            lane = J[setn]['lanes'].get(f'all/CC{cc}')
            if lane:
                s = lane['shape']
                print(f"| {setn} | CC{cc} | {lane['gestures']} | {s.get('flat', 0):.0%} | "
                      f"{s.get('rise', 0):.0%} | {s.get('arch', 0):.0%} | {s.get('fall', 0):.0%} |")


if __name__ == '__main__':
    main()
