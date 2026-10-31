# Phrase-level shaping — findings for a future project

**Status:** out of scope for AutoCC. AutoCC shapes each note on its own and
will stay that way. This file keeps what the analysis of professional projects
shows about shaping *across* a phrase, so a later project can start from it.

Source data and method: [`per-note-analysis.md`](per-note-analysis.md)
(Set 1: 15 Lorne Balfe mock-ups, the gold standard; Set 2: 17 mock-ups of
Zimmer-school scores, for comparison). Statistics only; no MIDI in the repo.
Reproduce with `tools/ccstudy.py` (its `--raw` records carry the curves
below).

"Phrase" here means AutoCC's Legato gesture: first key down to last key up,
with overlapping notes in between. That is a rough stand-in for a musical
phrase, since one gesture can be a single long note.

## Findings (2026-10-22)

### Most CC movement in Balfe's writing is phrase-level

- 89% of Set 1's notes start within 0.3 s of the previous key-up. Those get no
  swell of their own (mean change at 1 s between −6 and +5): the line carries
  on through them.
- Yet CC moved within 86–96% of sustained notes in the first six-cue survey,
  so the movement follows the line, not the note.
- Set 2 is the same inside lines (±3), with the gap threshold nearer 0.6 s.

### Phrases fade at the end (Set 1)

Mean CC1 change from the start of a connected gesture (one that starts
< 0.4 s after the previous key-up), sampled at
0, 10, 20 … 100% of its length:

| Family | Length | Notes | Curve (0% → 100%) |
|---|---|---|---|
| strings | 1.2–2.5 s | 433 | 0, +1, +1, −0, −1, −3, −5, −7, −10, −13, −12 |
| strings | 2.5–5 s | 188 | 0, +1, +0, −2, −5, −8, −10, −13, −16, −21, −25 |
| strings | > 5 s | 71 | 0, +3, +5, +3, +2, +1, −3, −7, −12, −17, −26 |
| brass | 1.2–2.5 s | 419 | 0, +3, +3, +2, +2, +1, −1, −3, −5, −9, −10 |
| brass | 2.5–5 s | 208 | 0, +3, +4, +4, +3, +1, −0, −2, −5, −9, −15 |
| winds | 1.2–2.5 s | 82 | 0, +1, +2, +3, +1, +0, −1, −5, −9, −15, −19 |

Shape: a small rise (+1 to +4) in the first 20–30%, then a steady fall that
ends **10–26 below the starting level**. CC11 follows the same curve (it
correlates 0.96 with CC1 in Set 1).

### Long phrases are hairpins (Set 1, > 5 s)

| Family | Notes | Curve (0% → 100%) |
|---|---|---|
| brass | 32 | 0, +8, +14, +18, +21, +23, +22, +20, +13, +1, −13 |
| winds | 57 | 0, +13, +22, +28, +36, +41, +43, +43, +36, +25, +2 |

They peak **+20 to +43** at 50–70% of the phrase, then return to the start
or below by the end.

### The last second tapers (Set 1)

Before a phrase ending followed by ≥ 1 s of silence, CC1 and CC11 fall
**~14 over the final second** before note-off, and only 3–4 more after. Set 2
doesn't do this (±1).

With the six cues added in the second batch (21 in all), the final-second
taper is +14 (CC1) / +17 (CC11) at −1 s, then −4 to −6 after the key lifts.

### Between phrases, CC dips and comes back early (Set 1)

Half a second before a phrase that starts from silence, CC sits **18–26
below** the phrase's starting value. It climbs back over the last ~200 ms
before the first note, so the attack already hears the target level.

### Where the sets differ

| Behaviour | Set 1 (Balfe) | Set 2 |
|---|---|---|
| End-of-phrase fade | −10 to −26 | ≈ 0 |
| Final-second taper | −14 | ≈ 0 |
| Pre-phrase dip and lead-in | 18–26, ~200 ms | none |
| Starting level (strings CC1) | ≈ 80 | ≈ 5 |

## Still open

- How is a phrase bounded musically (slurs, rests, bar lines), beyond key
  overlap?
- Does the peak position depend on the phrase's melodic shape (highest note,
  harmonic arrival)?
- How does phrase shape change with tempo and register?
