# Review against Apple's Human Interface Guidelines: Foundations

AutoCC 1.1 checked against all 19 Foundations pages (the Markdown versions
Apple publishes, read in October 2026; they are Apple's text and are not kept
in this repository). The decision is
[`docs/decisions/0001-apples-hig-foundations.md`](decisions/0001-apples-hig-foundations.md).

AutoCC draws its own window inside REAPER, so some guidance can't apply: a
JSFX can't reach macOS accessibility features (VoiceOver, Dynamic Type,
Increase Contrast, Reduce Motion) or read the system's appearance. Where a
guideline couldn't be met for that reason, this review says so rather than
counting it as met.

## What changed

| Guideline | Before | Now |
| --- | --- | --- |
| **Accessibility, Color, Dark Mode: contrast** | Secondary text 4.7:1; the "Fixed" tag, the canvas hint and the footer in the separator grey (about 1.6:1); "Bypassed" in the house red, 3.4:1; the canvas's band names over the curve's fill. | Every line of text at least 7:1 on what it sits on (`#B0B6C0` secondary, `#FF9E96` for a warning in words, body text on the lighter selected row). The red marks the bypassed Engine box but is not used for words. Band names and the playhead's value sit on small plates. Unticked lane boxes are the control grey with an ink border instead of a near-invisible outline. Only the dimmed labels of controls that are off (Undo/Redo with nothing to undo, Hold outside One-Shot) are fainter, as Apple allows. |
| **Accessibility, Typography: larger text** | One fixed size. | **Options → Interface Size**: 100%, 125%, 150% or 200%, saved with the project. Everything grows together through one scale factor; rows wrap, grids lose columns and the lane list and editor stack when there is no room, and the window scrolls under its message bar when it is still too small. |
| **Typography: system font and sizes** | Arial, with 11- and 12-point labels. | San Francisco on a Mac, Segoe UI on Windows, Arial otherwise, checked with `gfx_getfont`. Text 13–14 points at 100% (Apple's macOS default is 13, its minimum 10). Full resolution on a Retina screen. |
| **Accessibility, Layout: control size and spacing** | Buttons 26 points tall, 6 apart; lane boxes a 16-point target. | Controls 28 points tall (Apple's macOS default) with 12 between them; buttons never narrower than their labels; lane boxes answer a 28-point target. Lines (curves, ticks) thicken with the interface size. |
| **Accessibility: keyboard alone** | Mouse only. | Tab and Shift+Tab move a visible ring through every control in reading order, scrolling it into view; Return or Space presses; the arrows nudge a field or Global setting, Shift for finer steps; Esc lets go. Controls that are off are skipped. |
| **Color, Accessibility: not colour alone** | A chosen preset was told only by yellow. | It also carries an ink bar under its name. A lane that is on has a tick; the selected lane has its stripe and is named in the editor's heading. The focus ring is near-white, never the yellow that means "on". |
| **Layout (macOS): nothing important at the bottom** | Two lines of help along the bottom edge. | A message bar at the top: what just happened, else what the control under the pointer or the focus does, else the bypass warning, else what to do. The footer is gone. |
| **Accessibility: avoid time-boxed elements** | (No messages at all.) | Copy Shape to All, Clear Lane, Reset Curves and Panic say what they did, and the message stays until **Dismiss** or the next message. Nothing is on a timer. |
| **Design principles, Writing: feedback and recovery** | Copy Shape to All and Clear Lane changed several lanes silently. | Their messages say what changed and that Undo puts it back. |
| **Branding: let branding defer to content** | A large yellow "AutoCC" and a tagline, repeating REAPER's title bar. | Gone; the tagline is the bar's resting text. Yellow now only means "on" or "live". |
| **Color: one colour, one meaning** | Hovering a field or Global setting outlined it in yellow. | Hover is a light grey outline; yellow outlines a field only while it is being dragged. |

## Already met

- **Purpose and simplicity**: the window does one thing — shape the curves —
  in three steps down the page (choose a preset, choose and shape a lane,
  set the global behaviour).
- **Agency and recovery**: AutoCC's own 32-step Undo and Redo cover every lane
  edit; REAPER's undo covers the parameters; Panic / Reset is always visible.
- **Feedback**: hover and press states on every control; the live meters and
  the playhead show what is being sent.
- **Every gesture has another way to do it**: dragging a field has the arrow
  keys; clicking a Global setting has Return and the arrows (and right-click
  steps back); drawing a curve has Rise Shape, Fall Shape and Reset Curves.
- **Writing**: title-style buttons and labels, sentence-case hints and
  messages, em dashes and curly quotes (the 2026-10-14 change); each new hint
  starts with its control's name.
- **Dark Mode**: the window is always dark, the house scheme. Apple allows a
  dark-only appearance for media apps, and a JSFX can't read the system
  setting.
- **Motion**: there is no decorative animation. The playhead and meters show
  real playback, which Reduce Motion does not ask to stop.
- **Privacy**: nothing is collected or sent; the curves are saved in the
  project.

## Not met, because a JSFX can't

- **VoiceOver, Voice Control, Switch Control.** They can't read a window a
  JSFX draws itself. Every setting is also a REAPER parameter (19 sliders,
  hidden from the slider panel but listed in REAPER's FX parameter list and
  its automation), which screen readers can reach — for example with the
  OSARA extension. The drawn curves are not parameters.
- **Dynamic Type, Increase Contrast, Reduce Motion, system appearance.** A
  JSFX can't read these settings. Interface Size and the 7:1 colours stand in
  for the first two.
- **Freehand drawing from the keyboard.** The curve shapes are reachable
  (Rise Shape, Fall Shape, Reset Curves), a hand-drawn curve is not.
- **Right to left.** A JSFX can't be translated, so the window is English
  only. Time runs left to right as in every DAW.

## Not relevant

Materials (Liquid Glass), App icons, Icons, SF Symbols, Images, Spatial layout
and Immersive experiences (visionOS) — AutoCC has none of these.

## Unverified

Checked only in ysfx, which runs the same EEL2 compiler and LICE drawing as
REAPER, never in REAPER itself:

- whether REAPER passes Tab, Return, Space and the arrows to the window
  without "Send all keyboard input to plug-in" (Space may start playback);
- whether `.AppleSystemUIFont` gives San Francisco and `gfx_getfont` names it;
- that REAPER sets `gfx_ext_retina` to 2 on a Retina screen;
- whether changing the interface size alone marks the project as changed;
- how the window looks at each size on a real screen.

## Checked by

`tools/uicheck.py` (with `tools/build_host.sh` building its ysfx host) runs
the real `@gfx` code and checks, at 100%, 125%, 150%, 200% and on a Retina
screen and in two states (fresh; a user lane in One-Shot with the engine
bypassed, a note sounding and a message showing): the contrast of every
string against the pixels under it, that no text is wider than its box or
under 13 points, that every control is 28 points tall, inside the window and
12 points from the next, the Tab order by name, a `#F2F4F7` ring on every
stop and never a yellow one, Return/Space/arrows/Shift/Esc, the ink bar,
messages at the top that outlast 1.5 seconds and 60 frames until dismissed,
the bypass warning in words, no text below the last row of controls, the
Interface Size menu, the size surviving a reload, every control and word
exactly doubling at 200%, scrolling the focus into view, and the source rules
(R < G < B, colours through `setx`, balanced brackets, memory regions, every
slider reachable, no `want_all_kb`). Each was broken on purpose in a copy
(`tools/bite.py`) and the checker failed; see
`docs/sessions/2026-10-15-apple-hig.md`.
