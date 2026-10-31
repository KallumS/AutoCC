# Per-note CC analysis — how professionals shape a held note

**Status:** analysis done and **adopted in AutoCC 1.3** (2026-10-22): the
fitted presets, a Dynamic control, CC11 at the measured ratio, flat CC7, lower
velocity scaling and the restart rule. See *Decisions*. Phrase-level findings from the same data are in
[`phrase-shaping.md`](phrase-shaping.md), since that work is out of scope here.

## The data

| Set | Role | Cues | What it is |
|---|---|---|---|
| **Set 1** | Gold standard | 15 | Lorne Balfe's own mock-ups (one co-written with Mark Mancina): Assassin's Creed III, Beyond Two Souls, Bad Boys for Life, Call of Duty MW2, The Crown (×2), Genius S2, His Dark Materials (×4), Kung Fu Panda 3, Mission: Impossible – Fallout, Penguins of Madagascar, 6 Underground. Almost all Spitfire libraries. |
| **Set 2** | Comparison | 17 | Mock-ups of Zimmer-school scores by various people (Inception, Dark Knight, Dunkirk, Gladiator, Interstellar, Oppenheimer, Game of Thrones and others). Mixed libraries. |

After filtering (shorts, percussion, keys, synths and unnamed tracks removed;
"(D)" doubles counted once): **Set 1 — 224 tracks** (92 strings, 83 brass,
31 woodwinds, 18 choir); **Set 2 — 385 tracks**.

The MIDI files are not in the repo; only statistics are. To reproduce:

```sh
pip install mido
python3 tools/ccstudy.py --set gold "Analysis Set 1" --set comp "Analysis Set 2" \
    --json summary.json --raw raw.json
python3 tools/ccreport.py raw.json summary.json     # the tables below
```

## Method, in AutoCC's terms

- The unit is AutoCC's Legato trigger: first key down to last key up (a
  *gesture*). Gestures under 0.25 s are skipped.
- **Isolated** notes start ≥ 0.4 s after the previous key-up; finding 4
  shows that's where a fresh swell begins. **Connected** notes start sooner
  and continue a line.
- A live plug-in cannot know at note-on how long a note will be. So the main
  curves are the **mean change over the notes still held** at each moment,
  which is exactly what a live envelope can reproduce.
- AutoCC's own envelope (rise with exponent, linear settle, sustain) was then
  fitted to those curves. Typical error is **about 1 CC step** (RMS).

## Findings

### 1. The per-note swell is small — about +25, not +100

Isolated notes, mean change above the note-on value while held:

| Set | Lane | Family | Notes | 0.5 s before | Note-on | +0.2 s | +0.5 s | +1 s | +2 s | +3 s |
|---|---|---|---|---|---|---|---|---|---|---|
| Set 1 | CC1 | strings | 217 | 54 | 80 | +7 | +11 | +16 | +26 | +28 |
| Set 1 | CC1 | brass | 201 | 88 | 105 | +5 | +7 | +9 | +4 | +5 |
| Set 1 | CC1 | woodwinds | 54 | 28 | 40 | +9 | +14 | +14 | +26 | +23 |
| Set 1 | CC11 | strings | 220 | 73 | 96 | +7 | +12 | +15 | +25 | +24 |
| Set 1 | CC11 | brass | 207 | 83 | 100 | +5 | +7 | +11 | +8 | +9 |
| Set 1 | CC11 | woodwinds | 81 | 42 | 64 | +8 | +10 | +11 | +18 | +31 |
| Set 2 | CC1 | strings | 723 | 6 | 5 | +4 | +9 | +15 | +21 | +25 |
| Set 2 | CC1 | brass | 606 | 37 | 39 | +4 | +7 | +12 | +12 | +15 |
| Set 2 | CC1 | woodwinds | 158 | 23 | 20 | +1 | +3 | +11 | +15 | +16 |
| Set 2 | CC11 | strings | 105 | 66 | 59 | +3 | +7 | +11 | +17 | +18 |

The current presets at the same moments (full velocity, from note-on):

| Preset | Lane | Note-on | +0.2 s | +0.5 s | +1 s | +2 s | +3 s |
|---|---|---|---|---|---|---|---|
| Strings | CC1 | 0 | 5 | 31 | 99 | 89 | 89 |
| Brass | CC1 | 0 | 106 | 92 | 92 | 92 | 92 |
| Woodwinds | CC1 | 0 | 101 | 91 | 91 | 91 | 91 |
| Strings | CC11 | 65 | 70 | 88 | 101 | 101 | 101 |

Both sets agree on the size and speed of the swell (strings +25–28 by 3 s)
even though they start at very different levels. **The swell is the
transferable part; the start level is not** (finding 2).

### 2. The note starts at the dynamic, not at zero — and the sets disagree

Balfe starts strings at CC1 ≈ 80, brass ≈ 105, woodwinds ≈ 40. Set 2 starts
strings at ≈ 5 and brass at ≈ 39. The start level is effectively the
written dynamic, which is a phrase-level choice. The swell also shrinks as the
start gets higher (ρ = −0.74 between note-on level and swell in Set 1): it
takes about **0.36–0.45 of the remaining headroom** (127 − start) for
strings.

### 3. The rise is fast early, slow late — the opposite of the Strings preset

Fitted Rise Shape exponents are **0.35–0.6** in Set 1 (< 1 rises fast early).
The current Strings preset uses 2.0 and Default uses 1.0. Half the swell
arrives in **0.9 s** (CC1) and **0.7 s** (CC11), median. Strings and woodwinds
keep rising slowly for 2–3 s; brass blooms by ~1 s, then settles back by
about half.

### 4. Only notes after a real gap get a swell

Set 1 CC1, by the gap since the previous key-up (mean change while held):

| Gap before the note | Share of notes | +1 s | +2 s |
|---|---|---|---|
| 0 (notes abut) | 52% | −6 | −6 |
| under 0.05 s | 12% | +1 | −8 |
| 0.05–0.15 s | 18% | +5 | +10 |
| 0.15–0.3 s | 7% | +4 | +1 |
| 0.3–0.6 s | 3% | +6 | +19 |
| 0.6–1.2 s | 1% | +13 | +22 |
| over 1.2 s | 7% | +13 to +14 | +18 to +19 |

Notes that follow within ~0.3 s, **89% of Set 1**, carry the line on: no swell
of their own, and a fade where a phrase ends. Set 2 behaves the same, with the
full swell appearing after ~0.6 s.

AutoCC's Legato mode restarts the envelope whenever every key is up, even for
notes that abut. So it adds swells professionals don't write. Retrigger mode
adds even more.

### 5. CC11 copies CC1 — at ~0.87 of its range, not half

On the same notes in Set 1, CC11 and CC1 correlate **0.96** (median) and
CC11's range is **0.87×** CC1's (IQR 0.69–1.06), consistently across strings,
brass, woodwinds and choir. CC11 sits ~15 higher at note-on. Set 2 couples
them more loosely (correlation 0.75; CC11 often left alone).

This contradicts AutoCC's "CC11 moves half as far as CC1" rule (CLAUDE.md §3).
Balfe draws CC11 as a near copy of CC1.

### 6. CC7 doesn't move; CC21 has no evidence

- **CC7** is flat on 78% of notes in Set 1. When set, it's around 118 and left
  there, so it acts as a mix level, not a performance lane.
- **CC21** appears in 2 Set 1 cues (83% flat) and barely in Set 2 (33 notes,
  all flat). There's nothing to set the vibrato lane from.

### 7. Velocity barely predicts CC; tempo barely matters

| Set | Lane | Tracks | ρ velocity ~ note-on level | ρ velocity ~ peak | ρ half-rise time ~ beat length |
|---|---|---|---|---|---|
| Set 1 | CC1 | 167 | 0.20 | 0.22 | 0.27 |
| Set 1 | CC11 | 172 | 0.00 | 0.07 | 0.18 |
| Set 2 | CC1 | 110 | 0.30 | 0.32 | −0.04 |

AutoCC's velocity scaling (25–55% in the presets) is stronger than this data
supports. Timing does not need to follow the tempo, so keep it in
milliseconds with Time Scale.

### 8. Balfe tapers *before* the note ends

Around note-off (notes followed by ≥ 1 s of silence), change relative to the
value at note-off:

| Set | Lane | Notes | −1 s | −0.6 s | −0.2 s | +0.2 s | +0.6 s | +1 s |
|---|---|---|---|---|---|---|---|---|
| Set 1 | CC1 | 390 | +14 | +10 | +5 | −3 | −4 | −2 |
| Set 1 | CC11 | 408 | +15 | +11 | +5 | −3 | −4 | −2 |
| Set 2 | CC1 | 1042 | +1 | +0 | +0 | −0 | −1 | −1 |

Balfe brings CC down ~14 over the last second, then barely moves after the
key lifts. A live plug-in can't see the end coming, so a Fall after note-off
is the nearest it can get.

### 9. Lead-in and note length — not reachable live

- Before an isolated note, Balfe's CC sits ~18–26 lower and climbs over the
  last ~200 ms before note-on. AutoCC's equivalent is to start at the note-on
  level: it already sends the start value before the note-on.
- How long the rise takes grows with the note's length (ρ = 0.68). A live
  envelope can't know the length, so the held-note mean above is the best it
  can do. An offline ReaScript (CLAUDE.md §5) could shape each note to its
  length.

## Proposed presets (first fit, 15 cues — superseded by the 21-cue fit below)

AutoCC terms: Floor = start level, Peak = start + swell. Fall is not
measured, for the reason in finding 8; ~1 s is a suggestion. Velocity
should drop to about 15–20% (finding 7).

| Preset | Lane | Floor | Peak | Sustain | Rise | Rise Shape | Settle | Fit error | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Strings | CC1 | 80 | 108 | 108 | 2600 ms | 0.57 | 0 | 1.2 | 217 |
| Strings | CC11 | 96 | 120 | 120 | 2200 ms | 0.54 | 0 | 1.3 | 220 |
| Brass | CC1 | 105 | 115 | 109 | 1800 ms | 0.35 | 200 ms | 1.2 | 201 |
| Brass | CC11 | 100 | 112 | 107 | 1800 ms | 0.41 | 200 ms | 1.3 | 207 |
| Woodwinds | CC1 | 40 | 68 | 57 | 2600 ms | 0.47 | 1200 ms | 1.2 | 54 ⚠ |
| Woodwinds | CC11 | 64 | 87 | 87 | 3500 ms | 0.47 | 0 | 3.3 | 81 ⚠ |
| All | CC7 | flat at the user's level | | | | | | | |
| All | CC21 | unchanged — no data | | | | | | | |

⚠ Woodwinds rest on 5–6 cues and disagree with Set 2 (exponent 1.07: Set 2
starts slower). Treat them as provisional.

The Floor values are Balfe's dynamics in Spitfire libraries. They are the
least transferable numbers here; the swell, timing and shape are what both
sets agree on.

## Decisions (2026-10-22, all as recommended)

Adopted in 1.3: (1) a **Dynamic** control (slider 20) that moves CC1 and CC11's
start, peak and sustain while keeping the swell; (2) CC11 at the measured
~0.87 ratio; (3) CC7 flat at 118; (4) velocity 20% on CC1 and 15% on CC11;
(5) restart only after a 0.4 s gap (Gated + Legato).

Checked after the change, with the plug-in run in ysfx: Strings at full
velocity sends CC1/CC11 of 80/96 at note-on, 91/107 at 0.5 s, 96/112 at 1 s,
104/119 at 2 s and 108/120 at 3 s. The measured curve is 80/96, 91/108, 96/111,
106/121 and 108/120. Dynamic −40 sends 40/56 → 68/80, the same swell.

The options as they were put:

1. **Start level.** Balfe starts at the dynamic (CC1 ≈ 80); Set 2 starts near
   0. Options: take Balfe's levels; or make the start level the player's
   control (one "Dynamic" setting that moves Floor and Peak together, keeping
   the measured swell).
2. **CC11.** Follow the data (≈ 0.87 × CC1, starting ~15 higher), or keep the
   "half of CC1" rule for its stated reason (two stacked crescendos).
3. **CC7.** Make the lane flat by default, or turn it off by default.
4. **Velocity.** Lower the scaling to ~15–20%, or move velocity onto the start
   level instead of the swell.
5. **When to restart.** Restart the envelope only after a gap of about
   0.3–0.6 s; below that, carry on from the current level with no new rise
   (finding 4).

## Update: six more Balfe cues (Set 1 grows to 21)

Added 2026-10-22: *His Dark Materials* — Alethiometer, End Credits, Mrs
Coulter Theme, The Tales of Lee Scoresby, Teleutaia (S2) — and Home Symphony
in Oh. After filtering, Set 1 is **335 tracks** (149 strings, 116 brass, 47
woodwinds, 23 choir), up from 224. 1.3's presets were then re-fitted to all 21 (below).

**What the files say about instruments.** None has MIDI instrument-name tags,
and the program changes are patch numbers, not General MIDI. The track names
carry it:
- End Credits and Home Symphony use Spitfire's codes ("SF SYM STR VLN 1 Pleg"
  = Symphonic Strings, Violins 1, Performance Legato).
- Teleutaia names its libraries: Spitfire Mural, Albion 3, Solo Strings,
  Sacconi Quartet; CineBrass; Berlin Woodwinds; Andy Findon.
- Alethiometer, Mrs Coulter and Lee Scoresby name only the section ("Violins
  1", "Horns 1s", "Fl Sh 2 g"), with orchestrator notes ("NOTATE AS CUE",
  "DON'T NOTATE", "PRINTED BELOW"). They were prepared for live players.

`ccstudy.py` now reads letter-spaced names ("V i o l i n s  1"), "Trump",
"Sht" and a few more. That moved one track of the original 15 ("CB Trumpets
Sht" was counted as a long); every figure for the 15 is unchanged.

**Results with 21 cues** (isolated notes; mean change while held):

| Lane | Family | Notes | Note-on | +0.2 s | +0.5 s | +1 s | +2 s | +3 s | Fit (start, swell, rise, shape, settle) |
|---|---|---|---|---|---|---|---|---|---|
| CC1 | strings | 426 | 84 | +7 | +13 | +19 | +29 | +33 | 84, +31, 2200 ms, 0.66, none |
| CC1 | brass | 312 | 102 | +4 | +6 | +6 | +4 | +6 | 102, +7, 1800 ms, 0.22, 200 ms to +4 |
| CC1 | woodwinds | 94 | 46 | +7 | +12 | +15 | +17 | +16 | 46, +17, 800 ms, 0.66, none |
| CC1 | choir | 41 | 51 | +8 | +13 | +16 | +26 | +22 | 51, +27, 2200 ms, 0.54, 800 ms to +22 |
| CC11 | strings | 440 | 94 | +7 | +13 | +19 | +25 | +25 | 94, +24, 1800 ms, 0.54, none |
| CC11 | brass | 318 | 78 | +4 | +6 | +6 | +6 | +7 | 78, +7, 1800 ms, 0.23, 400 ms to +4 |
| CC11 | woodwinds | 133 | 69 | +7 | +10 | +17 | +14 | +19 | 69, +19, 1200 ms, 0.66, 800 ms to +15 |
| CC11 | choir | 40 | 76 | +7 | +11 | +13 | +20 | +19 | 76, +19, 1800 ms, 0.44, none |

Fit error is 1.1–2.3 CC RMS. Everything else holds:
- CC11 ÷ CC1 range is 0.84 (was 0.87), with correlation 0.97.
- Notes inside lines stay within ±3.
- The taper before note-off is +14 / +17 at −1 s.
- Velocity ρ is 0.11 (CC1) and 0.02 (CC11); tempo ρ is 0.24.

**1.3's presets against the 21 cues** (RMS error over the first 3 s): strings
CC11 1.5, strings CC1 7.5, woodwinds 5.7–6.0, brass CC1 4.4, Default 6–11, and
brass CC11 **24**. Almost all of it is the starting level, not the swell.

**The starting level follows the piece.** Brass CC11's isolated-note start by
cue ranges from 109–125 in loud action themes (Penguins of Madagascar,
Mission: Impossible, AC3, Home Symphony) to 45–60 in quiet *His Dark Materials*
cues (Mrs Coulter, Teleutaia, HDM2). Two of the six new cues are quiet ones.
This is direct support for Dynamic: one start level cannot suit both.

**CC21 now has a little data** (270 notes, 9 tracks in 3 cues: Spitfire
Symphonic and Solo Strings, Sacconi Quartet, Berlin Woodwinds, Andy Findon
bansuri). Balfe **sets CC21 as a level and leaves it**: 78% of notes are flat,
and the typical level is high (median 92–118 on most tracks; 43 and 59 on two).
No track shows AutoCC's late 0→25 swell. The evidence is thin, but it points
the same way as CC7: a held setting, not a per-note gesture.

### Decision: Balfe is the reference (2026-10-22)

The owner's rule: where the data shows how Lorne Balfe does something, AutoCC
does it that way. So 1.3's presets were **re-fitted to all 21 cues** (the
table above), and CC7 and CC21 became held levels at his medians: CC7 **94**
(20 tracks) and CC21 **92** (9 tracks).

Re-simulated after the change (full velocity, CC1/CC11, 0 → 0.2 → 0.5 → 1 →
2 → 3 s):

| Preset | AutoCC | Balfe (21 cues) |
|---|---|---|
| Strings | 85/94 → 91/101 → 97/106 → 103/111 → 114/118 → 116/118 | 85/94 → 91/101 → 97/107 → 103/113 → 113/119 → 117/119 |
| Brass | 102/78 → 106/82 → 107/83 → 108/84 → 106/84 → 106/82 | 102/78 → 106/82 → 108/84 → 108/84 → 106/84 → 108/85 |
| Woodwinds | 46/69 → 53/75 → 58/80 → 63/86 → 63/84 → 63/84 | 46/69 → 53/76 → 58/79 → 61/86 → 63/83 → 62/88 |
| Default | 91/85 → 97/91 → 101/94 → 105/98 → 112/103 → 115/104 | 91/85 → 97/91 → 101/95 → 105/99 → 112/103 → 115/105 |

The restart gap stays at 0.4 s. Notes within 0.3 s of the last key-up never
swell, and notes after 0.6 s always do. Between 0.3 and 0.5 s the two batches
disagree:

| Gap | 15 cues, CC1 at +1 s | 21 cues, CC1 at +1 s |
|---|---|---|
| 0.30–0.40 s | −10 to +9 | +26 to +36 |
| 0.40–0.50 s | +16 | 0 |

So the data doesn't place the threshold more precisely than 0.4 s.

### Velocity, measured as AutoCC uses it (2026-10-22)

AutoCC's Velocity setting scales the swell by `1 − v + v × velocity/127`. To
fit `v`, each isolated note's swell (peak − note-on, notes ≥ 0.6 s) was
divided by its track's mean swell, then regressed on velocity/127. The 21
cues give 51 tracks and 275 notes for CC1, 53 tracks and 293 notes for CC11,
at velocities 50–127. The 90% ranges are a bootstrap over tracks.

| Lane | Fitted `v` | 90% range |
|---|---|---|
| CC1 | 10% | −17% to +34% |
| CC11 | −8% | −35% to +21% |

Neither differs reliably from zero. Following Balfe, Velocity is now **10% on
CC1 and 0 on CC11** in every preset (was 20% / 15%). Velocity still reaches
the library itself, which is where Balfe's parts use it.

## Unanswered — for Set 2 or more data

- Vibrato (CC21): 270 notes in 3 cues so far (see the update above) — enough
  to say Balfe holds it, not enough to set a level.
- Woodwinds and choir: still thin (94 and 41 isolated notes with 21 cues).
- Library dependence: Set 1 is almost all Spitfire, where CC1 is the dynamics
  crossfade. Levels may not carry to other libraries.
