# 2026-10-16 — Apple HIG Foundations, the final sweep (1.2)

Every guideline in the shared checklist that a custom-drawn window can follow
was decided for AutoCC; the verdicts are in `docs/apple-hig-review.md` under
*Final sweep*, the reasons in decision 0001's dated section.

## What changed

- Field and Global-setting edges, and the canvas's stage and floor lines, are
  `C_EDGE` `#6D7581` (3:1 or more); they were `#3A404A` at 1.4–1.8:1. The
  playhead line went from 35% to 50% strength (3.0:1 to 4.7:1).
- The message bar wraps instead of cutting text short, sized for the longest
  built-in message so it does not jump; under the buttons when there is not
  room beside them.
- A window narrower than the chosen interface size needs shrinks the
  interface to fit (never below 100%).
- Choosing a preset and Reset Curves say that Undo puts things back.
- Pointing at the canvas says how to draw on it.

## How it was checked

`tools/uicheck.py` now also logs `gfx_line` (its ends, colour and the pixel
under it). Six new rules; ten sabotages through `tools/bite.py`, all BIT:
field edge, setting edge, stage lines, floor line, message cut to one line,
bar one line tall, bar sized by the message alone, no fit to a narrow window,
the preset's message, the canvas hint. 145 checks pass.

## Found on the way

- A first version of the line rule compared each line with the pixel under
  it. The curve is drawn as overlapping thick strokes, so most strokes sat on
  the stroke before and "failed" at 1.3:1. The rule now compares each mark
  inside the canvas with each of the canvas's band colours instead.
- Deciding "beside or under the buttons" from the room left *without*
  Dismiss made the bar change shape when a message appeared at 200%; it is
  decided from the room left *with* Dismiss, so it holds still.

## Only REAPER can tell

Everything from the 1.1 list still stands (keys reaching the window, San
Francisco, Retina). New: how the wrapped bar and a shrunken interface look on
a real screen, and whether REAPER lets the FX window get narrow enough for the
shrink to matter.
