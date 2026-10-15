# 0001 - Apple's HIG Foundations are the standard for the window

- **Date:** 2026-10-15
- **Status:** Accepted

## Context

The user asked for every window in the family to meet Apple's Human Interface
Guidelines "Foundations" pages, to the standard Transient Shuffler (another
JSFX of theirs) already meets. The window's words had been brought to Apple's
writing guidelines the day before (`docs/sessions/2026-10-14-apple-writing.md`).
Checked against the other pages, AutoCC 1.0 fell short in several places:
secondary text at 4.7:1 and some labels (the "Fixed" tag, the canvas hint, the
footer) in the separator grey at about 1.6:1; the warning word "Bypassed" in
the house red at 3.4:1; a fixed size with 11-point labels; Arial everywhere;
26-point buttons 6 apart; no keyboard path at all; chosen presets shown by
yellow alone; and the help text in a footer along the bottom edge.

Apple's pages are copyrighted and are not in this repository (the review
refers to them by page and rule).

## Decision

- **Contrast.** Every line of text is at least **7:1** on what it sits on.
  Apple's own table asks 4.5:1 for text up to 17 points and points to WCAG;
  the family takes WCAG's stricter 7:1 for small text in a dark window.
  Secondary text is `C_LABEL2 #B0B6C0`; a warning in words is
  `C_WARN_TEXT #FF9E96`. The house red still marks the bypassed Engine box but
  is never used for words. `C_DIM #8A919C` is only for the dimmed label of a
  control that is off, which Apple exempts, and for marks. Words on the canvas
  sit on small plates so the curve's fill cannot thin them.
- **Interface size.** **Options → Interface Size** offers 100%, 125%, 150% and
  200%. Every size goes through one factor, `ui_s` (interface size times the
  Retina factor). It is saved with the project through `@serialize` (after
  the curve tables, read only when present, so older projects still load),
  not as a slider: it is a preference about the window, not a parameter to
  automate, and every slider must have a control in the window. A preset or
  REAPER's undo never resizes a window that is already open.
- **Retina.** `gfx_ext_retina = 1`, so a Retina screen draws at full
  resolution instead of being scaled up.
- **The system font**: San Francisco on a Mac, Segoe UI on Windows, else
  Arial, chosen by asking `gfx_getfont` what face was actually given (Transient
  Shuffler's `pick_font`). Text is 13–14 points at 100%, nothing smaller.
- **Controls** are 28 points tall with 12 between them; a button is never
  narrower than its label. A lane's on/off box keeps its 16-point square but
  answers a 28-point target. The lane list stays a table whose rows touch.
- **The keyboard alone.** Tab and Shift+Tab move a near-white `#F2F4F7` ring
  (never the accent, which means "on") through every control in reading
  order, scrolling it into view; Return or Space presses; the arrows nudge a
  field or Global setting (Shift for finer steps); Esc lets go. Disabled
  controls are skipped. `options:want_all_kb` stays off (Space must still
  start REAPER's playback while playing). Freehand curve drawing has no
  keyboard path; Rise Shape, Fall Shape and Reset Curves are its alternative.
- **Not colour alone.** A chosen preset carries an ink bar under its name as
  well as the yellow; a lane that is on has a tick; the selected lane has its
  stripe and is named in the editor's heading.
- **Messages at the top, until dismissed.** A message bar heads the window:
  what just happened (Copy Shape to All, Clear Lane, Reset Curves, Panic),
  else the hint of the control pointed at or focused, else the bypass warning,
  else what to do. A message stays until Dismiss or the next message. The
  footer is gone; nothing important sits at the bottom edge.
- **Layout that reflows.** Rows wrap and grids lose columns as the window
  narrows or the interface grows; the lane list and editor stack when there is
  no room side by side; the content scrolls under the fixed bar.
- **The title and tagline went**: REAPER's title bar already names the
  plug-in (Apple: branding defers to content). The tagline is the bar's
  resting text.
- **Motion.** There is no decorative animation. The playhead and the live
  meters show real playback, so there is nothing for a Reduce Motion setting
  to stop.

## Consequences

- Every new control has to meet the same bar; `CLAUDE.md` §4 lists the rules
  and `tools/uicheck.py` checks them, each check proved to bite by breaking the
  rule in a copy (`tools/bite.py`).
- The window grew from 820 × 660 to 820 × 730 at 100%. At 200% it needs a
  1640 × 1460 window to show everything at once; smaller, it scrolls.
- At large sizes in a narrow window a long hint in the bar is cut short with
  an ellipsis.
- A pressed (held) grey button's label is 6.0:1 for the moment it is held, the
  ramp's own "button held" grey; every resting and hover state clears 7:1.
- **Not met, because a JSFX can't:**
  - VoiceOver, Voice Control and Switch Control can't read a window a JSFX
    draws itself. Every setting is also a REAPER parameter, reachable through
    REAPER's FX parameter list (for example with OSARA).
  - A JSFX can't follow Dynamic Type, Increase Contrast, Reduce Motion or the
    system's appearance; Interface Size and the higher-contrast colours stand
    in for the first two, and the window is always dark (the house scheme).
  - It can't be translated, so right-to-left does not arise.
- **Unverified in REAPER** (checked only in ysfx, which runs the same EEL2 and
  LICE code): whether REAPER passes Tab, Return, Space and the arrows to the
  window without "Send all keyboard input to plug-in"; whether `gfx_getfont`
  returns San Francisco's name for `.AppleSystemUIFont`; that REAPER sets
  `gfx_ext_retina` to 2; how the window looks at each size on a real screen;
  and whether changing the interface size alone marks the project as changed
  (if not, the new size is saved with the next change that does).
