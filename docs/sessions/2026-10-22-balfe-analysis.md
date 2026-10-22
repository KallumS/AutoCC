# 2026-10-22 — Measuring professional CC, and AutoCC 1.3

The user asked whether finished projects from professional composers could
be used to work out a better formula for AutoCC's curves. Decision 0002 has
the outcome; `docs/research/per-note-analysis.md` has the numbers.

## The route

1. DAWproject was the first idea; MIDI files turned out to carry everything
   needed (notes, velocities, the tempo map, dense CC) and are what the user
   had. Eight single files were surveyed first: one was a transcription with
   no CC at all, and only one carried CC11.
2. The user supplied Set 1 (15 Lorne Balfe cues, the gold standard) and Set 2
   (17 others). `tools/ccstudy.py` measures each held gesture in AutoCC's
   own terms; `tools/ccreport.py` turns that into tables and fits AutoCC's
   envelope to the measured curves.
3. The user said phrase-level shaping is out of scope but should be kept:
   it went to `docs/research/phrase-shaping.md`.
4. Five recommendations (Dynamic, CC11 at the measured ratio, flat CC7, lower
   velocity, the restart rule) were accepted and built as 1.3.
5. Six more Balfe cues arrived; Set 1 became 21. The user set the rule that
   Balfe's way is the right way, so the presets were re-fitted to all 21,
   CC21 became a held level, and velocity was measured the way AutoCC
   applies it and lowered to 10% / 0.
6. Noterator and Miderator, which port AutoCC's engine, were brought up to
   1.3 (their decision 0049; Noterator #11, Miderator #7, both green).

## Mistakes and false starts

- **Median curves hid the swell.** Rising and falling notes cancel, and
  absolute medians mixed loud and quiet passages. Splitting notes that start
  from silence from those that continue a line, and averaging the change
  over the notes still held, is what showed the swell.
- **"Connected" was misread at first** as overlapping legato notes. They are
  separate key presses with a short gap, which AutoCC's Legato mode *does*
  restart on. That is what led to the restart rule.
- **The track-name classifier missed things**: letter-spaced names
  ("V i o l i n s  1"), "Trump", "Sht" for shorts. "CB Trumpets Sht" had been
  counted as a long; fixing it changed no figure for the first 15 cues.
- **`-1e12` does not compile in EEL2** — no exponent notation. The static
  checks passed; ysfx's compiler caught it. Use `-1000000000`.
- **The first velocity fit found no Balfe tracks** with six long isolated
  notes at varied velocities; three notes per track was enough.

## Checks

- Python re-simulation of every preset against Balfe's curves: within 2 CC
  at almost every checkpoint (Strings CC11 at 1 s and Woodwinds CC11 at 3 s
  within 4).
- The real plug-in driven in ysfx: Strings sends 85/94 → 116/118 over 3 s,
  Dynamic −40 gives the same swell 40 lower, CC7 and CC21 hold 94 and 92, the
  restart rule switches between 0.35 and 0.45 s, Retrigger unchanged.
- `tools/uicheck.py`: 145 checks pass with the new Dynamic field.

## Only REAPER can tell

- Whether Balfe's levels suit the user's libraries, and how often Dynamic
  needs moving per cue.
- Whether a constant CC21 of 92 is right on their vibrato patches.
- How the 1 s fall sounds against release samples, since Balfe fades before
  the key lifts.

## Not done

- Vibrato (CC21) needs more data to set a level per family.
- Woodwinds and choir need more isolated notes.
- An offline companion script (CLAUDE.md §5) could shape each note to its
  length, which a live plug-in cannot know; phrase shaping waits for the
  future project.
