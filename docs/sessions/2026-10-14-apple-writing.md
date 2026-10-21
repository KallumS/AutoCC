# 2026-10-14 - The window's words, to Apple's writing guidelines

Part of a sweep of every repository asked for by the user: the text in each
window to follow Apple's Human Interface Guidelines on writing, with the
rules Noterator settled in its decision 0053. This is the repository's first
session log; earlier history is in the commit log and `CLAUDE.md`.

## What changed

- **Headings and labels** were all capitals: "CC LANES", "LIVE", "ENVELOPE",
  "GLOBAL", and every field ("CC NUMBER", "RISE SHAPE", "MIDI THRU"). They are
  title style now: "CC Lanes", "Envelope", "Global", "CC Number", "Rise
  Shape", "MIDI Thru". The canvas bands read "Rise", "Sustain" (or "Hold" in
  One-Shot) and "Fall"; the preset badge "Custom"; the engine warning
  "Bypassed" (still in the warning red).
- **Values**: "One-shot" is "One-Shot" wherever it is a mode's name; the
  under-lane tag "fixed" is "Fixed"; a lane with no CC shows "—" instead of
  "--".
- **Buttons**: "Copy Shape To All" is "Copy Shape to All" (short prepositions
  stay lower case). The others were already right.
- **Hints**: "drag in the rise / fall areas to draw" is "Drag in Rise or Fall
  to draw the curve"; the tagline (shown only in a wide window) is "Play with
  both hands — the CCs write themselves".
- **Footer**: "CC1 / CC11 / CC7 / CC21 are fixed lanes. Lanes 5-7 are yours…"
  reads "CC1, CC11, CC7 and CC21 are fixed lanes. Lanes 5–7 are yours: set a
  CC number, then draw its curve." The second line said "Green box mutes a
  lane" - the box is yellow - and "Ctrl for fine"; it is "Click a lane’s box
  to mute it. Drag a field to edit it; hold Command for fine steps. Click a
  Global setting to change it, right-click to go back."
- **Slider names and enum lists** (REAPER's parameter and automation lists):
  " - " became " — " ("Lane 1 — CC1 Dynamics", "Legato — First Note Only",
  "Gated — Follows the Key"), and "Follow note", "One-shot Hold (ms)" take
  capitals. Numbers, order, defaults and ranges are untouched, so saved
  projects and automation are unaffected.
- `README.md` quotes the new labels; its colour words were also wrong ("green
  toggle", "green playhead", "blue"/"red" bands) and now match the window.
  `docs/palette-preview.svg`'s text was brought in line too (colours untouched).

## Left alone

- "AutoCC" (the name), "Panic / Reset" (a familiar musician's word with what
  it does), the preset names and lane names, which were already title style.

## Verification

There is no test harness here. The file was compiled and its `@gfx` run
headlessly through ysfx (Reverberator's `tools/build/gui`, which builds from
its `tools/build_host.sh`): it compiles, and renders at the 820 x 660 minimum
in Gated mode and in One-Shot with the engine bypassed and a Custom preset,
and at 1100 wide for the tagline. Nothing overflows; the footer's longer
second line still fits at 820. Not yet seen in REAPER.
