# 0002 - Lorne Balfe's mock-ups are the reference for AutoCC's curves

- **Date:** 2026-10-22
- **Status:** Accepted

## Context

AutoCC 1.2's presets were chosen by ear: every note swelled from CC1 0 to
about 100, CC11 moved half as far as CC1, CC7 breathed in a narrow band and
CC21 built a late vibrato swell. The user wanted the curves to be closer to
what a professional composer writes, and supplied finished MIDI mock-ups to
measure: Set 1, 21 of Lorne Balfe's cues (almost all in Spitfire libraries),
and Set 2, 17 mock-ups of other scores for comparison. The user then set the
rule: **where the data shows how Balfe does something, that is the right way.**

The measurement is in `docs/research/per-note-analysis.md`, made with
`tools/ccstudy.py` and `tools/ccreport.py`. The MIDI files are not in the
repository; only statistics are. Phrase-level findings are kept for a future
project in `docs/research/phrase-shaping.md` and are out of scope here.

## Decision

AutoCC 1.3's presets are fitted to Balfe's average held note, each lane
within 1-2.3 CC RMS. What the data showed, and AutoCC now does:

- **A note starts at the dynamic, not at 0**, and swells with a fast-early
  rise: Strings CC1 85 → 116 over 2.2 s, Woodwinds 46 → 63 within 0.8 s,
  Brass 102 → 109 then easing back to 106, Default 91 → 115.
- **Dynamic** (slider 20, −64 to +64) moves CC1 and CC11's floor, peak and
  sustain together, because in Balfe's cues the start level follows the
  piece (brass CC11 starts at 109-125 in action themes, 45-60 in quiet ones)
  far more than the instrument. The swell keeps its size.
- **CC11 follows CC1** at about 0.84 of its swell (correlation 0.97), not half.
- **CC7 and CC21 are held levels**, 94 and 92, Balfe's medians: he sets each
  per track and leaves it (85% and 78% of notes flat).
- **Velocity** scales CC1's swell by 10% and CC11's not at all: fitted within
  each track, neither effect differs reliably from zero.
- **A note within 0.4 s of the last key-up carries the line on** (Gated +
  Legato, `carry_env`, stage 5) instead of swelling again: his notes that
  start that soon after the last get no swell of their own.
- **Fall is 1 s, linear**, on CC1 and CC11. Balfe fades in the last second
  *before* the key lifts, which a live plug-in cannot see coming; this is the
  nearest it can get, and the only number here not measured.

## Consequences

- A preset change now starts with a re-run of `tools/ccstudy.py` and a fit,
  not a judgement; the numbers to quote are measured ones.
- Set 1 is almost all Spitfire, where CC1 is the dynamics crossfade. The
  levels may sit wrong in other libraries; Dynamic is the first adjustment.
- CC21 now sends 92 constantly while its lane is on. A library that uses
  CC21 for something other than vibrato needs the lane turned off.
- Woodwinds and choir rest on thin data (94 and 41 isolated notes), and
  CC21 on 3 cues.
- Noterator and Miderator port AutoCC's engine value for value; they were
  brought up to 1.3 in their decision 0049 (Noterator #11, Miderator #7).
  When AutoCC's presets or envelope change again, those ports change too.
- None of it has been played in REAPER yet.
