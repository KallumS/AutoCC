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

## Final sweep (16 October 2026)

AutoCC 1.2. Every guideline the shared checklist marks as doable in a
custom-drawn window was taken back to its Foundations page and decided for this
window; the measurements are WCAG contrast ratios at 100%.

### Fixed now

| Guideline (page) | Before | Now |
| --- | --- | --- |
| Non-text contrast of controls (Accessibility; Color; Dark Mode) | Every field and Global setting was a dark box with a `#3A404A` edge: 1.6:1 on its fill, 1.7:1 on the ground, so the box itself barely showed. | A new ramp entry, `C_EDGE` `#6D7581`: 3.6:1 on the fill, 3.9:1 on the ground. A field that is off keeps the faint edge, so on and off differ by more than the label's colour. |
| Non-text contrast of the canvas (Accessibility; Color) | The lines marking where Rise, Settle, Hold and Fall start were `#3A404A` (1.5–1.8:1 on the bands), the floor line 1.4:1; the playhead line 3.0:1. | Stage lines and floor in `C_EDGE` (3.4–4.0:1 on every band); the playhead line at half strength, 4.7–4.9:1. The grid and the wash under the curve stay faint on purpose — they are texture, not information. |
| Truncation at large sizes (Typography; Layout) | At 150–200% the message bar cut hints and messages short with "…" (the 1.1 decision recorded it as a cost). | The bar wraps. Its words sit beside Dismiss and Options, or under them when that leaves too little room, and it is as tall as the longest built-in message needs at that width and size — so it keeps one height as the pointer moves and when a message comes and goes. "…" survives only for a single word wider than the window. |
| Adapt to the window; nothing past the edge (Layout) | The lane list is 316 points wide, so a window narrower than the chosen size needed drew the lanes past its right edge. | A large interface shrinks just enough to fit the width (never below 100%); the Options menu still ticks the size chosen, which comes back when the window is wide again. Down to 340 points wide at 100%, nothing is drawn past the edge. |
| Make mistakes cheap to recover from; feedback (Design principles; Writing) | Choosing a preset replaced the four fixed lanes' settings and curves without a word; Reset Curves did not say Undo puts them back. | Both say what they replaced and that Undo puts it back, in the bar, until dismissed. Every action that discards curve edits (preset, Reset Curves, Copy Shape to All, Clear Lane, a lane's box) was already one step of AutoCC's 32-step Undo — so nothing asks first; it can all be taken back. |
| Say how to do the unfamiliar (Design principles; Writing) | "Drag in Rise or Fall to draw the curve" was hidden when the editor was narrow, and the canvas had no hint. | Pointing at the canvas says how to draw on it, and that Rise Shape and Fall Shape do it from the keyboard. |

### Already met

| Guideline | Why |
| --- | --- |
| Colour never alone (ACC-02, COL-08, ACC-16, COL-09) | Chosen preset: ink bar; lane on: tick; bypassed: words; selected lane: stripe and the editor's heading; meters: their number. Yellow, grey and the red edge are told apart by lightness as well as hue. |
| One colour, one meaning (COL-01, COL-14) | Yellow is "on" or "live" only; the focus ring is near-white; one chosen preset at a time. |
| Esc (house rule) | Esc lets go of the keyboard focus; AutoCC never closes its own window. |
| Menus (Dark Mode: elevated surfaces) | The only menu is REAPER's own (`gfx_showmenu`), drawn by the system. AutoCC draws no popup, tooltip or modal. |
| System font (Typography TYP-05/08, Branding BRA-04) | `pick_font` asks for Segoe UI, then `.AppleSystemUIFont`, and keeps only what `gfx_getfont` says it got; Arial otherwise. One family; bold only for values. |
| Motion (ACC-38–42, MOT-01–06, MOT-13, MOT-15, COL-26) | Nothing animates for decoration. The playhead and the live meters follow playback: information, not ornament, and they never flash. |
| Every gesture has another way (ACC-26), many inputs (DP-14) | Drag a field: the arrows (Shift for fine); right-click a setting: Left arrow; draw a curve: Rise Shape, Fall Shape, Reset Curves. |
| Shortcuts (ACC-31) | Only Tab, Return, Space, the arrows and Esc, inside the window; Command-Z / -Y only when REAPER hands them over. |
| Hit targets and spacing (ACC-24, SPA-07) | Every control is a framed box 28 points tall and 12 apart; the lane box answers a 28-point target; the canvas is the whole editor. |
| Text floor and weights (ACC-08/09, TYP-03/13) | 13 points or more, Regular and Bold only. |
| Marks grow with the text (ACC-07, TYP-17, SFS-09) | The tick, the curves and the canvas lines thicken with the interface size (`tline`). |
| Layout (LAY-02/03/05/07/09/12/13/14, TYP-19/20) | Rows wrap, grids lose columns, the lane list and editor stack; the message bar and Options stay at the top at every size; the checker tests 100–200%, a narrow window and Retina. |
| Dark only (DRK-04) | The house scheme; a media tool, which the Dark Mode page allows; a JSFX can't read the system's appearance. |
| Writing (WRI-02–25, INC-04–10, INC-19) | No "we", "Oops", "Click here", idioms or gendered words; every hint starts with its control's name; messages say what happened and how to take it back. |
| Branding (BRA-03/05–09) | No logo or splash; REAPER's title bar names the plug-in. |
| Privacy (PRV-01–03, 06, 13, 16) | Nothing is collected; everything is saved in the project. |
| Sound (ACC-21, ACC-35) | AutoCC makes no sound of its own; the meters and playhead show every CC it sends. |

### Not done, and why

| Guideline | Why |
| --- | --- |
| Show selection more softly when the window isn't key (COL-22) | A JSFX can ask `gfx_getchar(65536)` whether its window has focus, but ysfx does not answer it, so it could not be checked; the selected lane's stripe and the chosen preset are the only selections and they stay true. |
| Send people to a setting with a button (WRI-23) | "Set Engine to Active" names a control that is on screen, outlined in red, one Tab away. A second Engine control in the bar would be a duplicate. |
| Let people recolour (ACC-17, COL-07) | The house scheme is the user's decision; the colours are fixed across the family. |
| Zebra rows (COL-21) | Seven lanes, each a separate filled row with a gap between. |
| A minimum window size (LAY-20) | A JSFX can't set one. Below 340 points wide at 100% the lane list runs past the edge. |
| VoiceOver, Dynamic Type, Increase Contrast, Reduce Motion, appearance (ACC-03, COL-02, DP-12) | Unchanged from 1.1: out of a JSFX's reach (see above). |

### Not relevant

Icons, SF Symbols, Images, App icons, Materials, Spatial layout, Immersive
experiences, games (ACC-34, MOT-08/09), right-to-left (RTL-04/10),
localisation (INC-22/24, COL-10): AutoCC has none of these.

### Checked by

`tools/uicheck.py` gained six rules (145 checks in all), each broken on purpose
in a copy with `tools/bite.py` and seen to fail: field and setting edges 3:1 on
their fill and the ground; every mark on the canvas 3:1 on each band; no text
cut short with "…"; at 200% a long message wraps whole inside the bar, and the
bar keeps one height as the focus moves and the message goes; 200% in a
560-point window and 100% in a 340-point window pass every window rule; choosing
a preset says Undo puts it back; pointing at the canvas says how to draw. The
playhead line is measured, not run: the checker's busy state has no note on
the selected lane.
