# CLAUDE.md — AutoCC

Working notes for this repo. The JSFX facts below are taken from the **REAPER
v7.79 JSFX Programming Reference** and the **ReaScript API** docs, and each one
that the code depends on has been checked against them. Trust this file over
recollection; when something here is contradicted by REAPER's own docs, the docs
win and this file should be corrected.

---

## 1. The project

`AutoCC.jsfx` is a single-file REAPER JSFX (EEL2). It turns MIDI notes into
orchestral CC curves so a player can use both hands on the keys instead of
riding a mod wheel. There is no build step — the file *is* the product. Its
window has a headless checker in `tools/` (§4).

**How this code has been validated so far:** the envelope maths and the undo
ring buffer were ported to throwaway Python and exercised (preset shapes, stage
transitions, zero-length stages, velocity extremes, retrigger mid-release; undo
round trips, redo clearing, ring overflow both directions). Structure is checked
with a paren-balance and memory-overlap script. Since 1.1 the window is checked
by `tools/uicheck.py`, which runs the real `@gfx` headlessly in ysfx (the same
EEL2 compiler and LICE drawing REAPER uses) — see §4. **None of it has been run
inside REAPER.** Anything touching `sliderchange`, `@serialize`, REAPER's
keyboard routing or its fonts is verified against the docs or ysfx only — say
so rather than implying it has been tested in REAPER.

---

## 2. JSFX language facts this code relies on

### File structure
- `desc:` should be the first line. Order: description lines, then code sections.
- Sections: `@init`, `@slider`, `@block`, `@sample`, `@serialize`, `@gfx [w] [h]`.
  Each may appear only once.
- `in_pin:none` + `out_pin:none` marks a MIDI-only FX and enables host
  optimisations. `options:no_meter` suppresses meters.
- Up to **256** sliders. `slider1:name=default<min,max,inc{labels}>Description`.
  A `-` prefix on the description hides a slider.
- `options:want_all_kb` turns on "send all keyboard input to plug-in" by default.
- `options:maxmem=N` raises the memory cap (default ~8M slots, max 128M).

### `@init` re-runs — and why `@serialize` protects us
> "All memory and variables are zero on load, and are **re-zeroed before calling
> @init**. To avoid this behavior, a script can define a non-empty `@serialize`
> code section, which will prevent memory/variables from being cleared on @init."

`@init` runs on **load, samplerate change, and transport start**. AutoCC has a
non-empty `@serialize`, so memory survives those re-runs — which is exactly what
the `init_done` guard in `@init` depends on. **Do not delete or empty
`@serialize`**: it would silently wipe curves, undo history and `init_done` every
time the user hits play. (`ext_noinit = 1` is the alternative, but then `srate`
may be wrong in `@init`.)

### Numbers, operators, gotchas
- Hex is `$x90`, and **`0x90` also works** (REAPER 4.25+). ASCII is `$'c'`.
- **`&` and `|` bind *tighter* than `==` / `<` — the opposite of C.** Parenthesise
  anyway.
- `||` and `&&` have *equal* precedence, left-to-right. So do `|`, `&`, `~`.
  Parenthesise when mixing.
- `?:` is lower precedence than `&&`. Chained ternaries as if/else-if are fine,
  and a trailing `cond ? a;` with no `: b` is legal (returns 0).
- **`==` is approximate**: true when the difference is < 0.00001. `===` is exact.
- Array indexing rounds as `value + 0.00001` truncated. Truncate fractional
  indices yourself with `x[y|0]`.
- ~8,388,608 memory slots by default. `gmem[]` is shared across plug-ins.
- No `for`. Use `while (cond) ( ... );` or `loop(n, ...)`.
- Functions: `function f(a,b) local(x,y) ( ... );` — last expression is the
  return value. Globals are visible inside functions. **Define before use.**

### MIDI (`@block` is the right place)
- `midirecv(offset, msg1, msg2, msg3)` — loop `while (midirecv(...))`.
  Receiving **consumes** the event; you must `midisend` to pass it through.
- `midisend(offset, msg1, msg2, msg3)` — returns 0 on failure, else `msg1`.
- `offset` is in samples into the current block.
- Buses other than 0 pass through untouched unless `ext_midi_bus = 1`.

### Sliders from code
- `sliderchange(slider4)` or `sliderchange(2^idx)` — refresh the UI. Does **not**
  write automation.
- `slider_automate(sliderN[, end_touch])` — writes automation. Not needed in
  `@slider`.
- **`sliderchange(-1)` called from `@gfx` makes REAPER add a project undo
  point.** This is the supported way to get internal `@gfx` state changes into
  REAPER's own undo, and it snapshots the serialized data with it.
- `slider(i)` reads *and writes* a slider by index: `slider(i) = 1;`.
- `slider_next_chg(idx, val)` gives sample-accurate automation in `@block`.

### `@serialize`
- Runs for both save and load. **`file_avail(0) < 0` means writing**, `>= 0`
  means reading.
- `file_var(0, x)` for scalars, `file_mem(0, addr, len)` for blocks.
- Slider values are saved by REAPER automatically; `@serialize` is only for
  extra state.

### Graphics
- `gfx_drawstr(str[, flags, right, bottom])` — `flags&1` centre horizontally,
  `&2` right justify, `&4` centre vertically, `&8` bottom justify.
- `gfx_setfont(idx[, "Arial", sz, flags])`, `idx` 1..16; flags `'b'`, `'i'`, `'u'`.
  `gfx_setfont(idx)` re-selects a font already configured.
- `gfx_rect(x,y,w,h[,fill])`, `gfx_line`, `gfx_circle`, `gfx_triangle`.
- String literals are values: `x = "hi"; gfx_drawstr(x);` — so they can be passed
  as function arguments. Literals are immutable; use `#named` strings with
  `sprintf`/`strcpy` for mutable ones.
- `mouse_cap` bits: **1** left, **2** right, **4** Ctrl/Cmd, **8** Shift,
  **16** Alt, **32** Win/Ctrl(macOS), **64** middle.
- **`gfx_getchar()` must be called at least once per frame for `mouse_cap` to
  report keyboard modifiers when the mouse is not captured.** AutoCC's Command
  fine-drag and Shift fine-arrows depend on this. Since 1.1 it is called
  **once** a frame, into `ui_key`, and each control consumes the key it uses
  (sets `ui_key = 0`); a second key waits in REAPER's queue for the next frame.
- Named keys from `gfx_getchar()`: Tab 9, Return 13, Esc 27, Space 32, and the
  arrows as multi-character constants `'up'` (30064), `'down'`, `'left'`,
  `'rght'`. Shift+Tab is 9 with `mouse_cap & 8`.
- `gfx_ext_retina = 1` (set in `@init`) asks for full resolution; on a Retina
  screen REAPER sets it to 2 and `gfx_w`/`gfx_h` double. Every size in `@gfx`
  goes through `ui_s = max(1, gfx_ext_retina) * ui_zoom`.
- `gfx_getfont(#str)` writes the face actually used into `#str`; `pick_font()`
  uses it to choose San Francisco (`.AppleSystemUIFont`), Segoe UI or Arial.
  Unverified in REAPER (ysfx accepts it).
- **ysfx differs from REAPER in two ways that matter to the checker**: it packs
  the arrow codes the other way round (`'up'` arrives as 0x7075, not 30064), and
  it puts Shift in `mouse_cap` only while a mouse button is down. So
  `tools/uicheck.py` hands keys in through `t_getchar()` in its instrumented
  copy, in REAPER's documented form, rather than through ysfx's key queue.
- `gfx_getchar()` returns Ctrl+A..Z as **1..26** *only if* the user has enabled
  "Send all keyboard input to plug-in". So Ctrl+Z = 26, Ctrl+Y = 25 are opt-in.
  Don't set `options:want_all_kb` here: it would swallow the spacebar, and this
  is a plug-in people use while playing. Buttons stay the reliable path.
- `@gfx` runs ~30 Hz in a **separate thread from audio** — shared state can be
  read mid-update. Keep `@gfx` writes to parameters, not to engine runtime state.
- If nothing is drawn in `@gfx`, no update happens.

### Memory
- `memcpy(dest, src, len)`, `memset(dest, value, len)`.
- **`memcpy` with overlapping buffers is undefined if either buffer crosses a
  65,536-slot boundary.** AutoCC's undo ring shift is an overlapping copy, so
  both stacks must stay entirely below 65536. They do — keep it that way.

---

## 3. AutoCC internals

### Memory map (keep this current; overlaps are silent corruption)

| Region | Address | Size |
|---|---|---|
| Lane params (`s_en` … `s_rexp`, contiguous, `PARAM_LEN`=176) | 0 | 176 |
| Runtime (`r_stage` … `r_preven`) | 176 | ~144 |
| Attack curves `ca_base` | 512 | 7 × 33 |
| Release curves `cr_base` | 800 | 7 × 33 |
| Note-held flags `notes_base` | 1200 | 128 |
| MIDI event queue `ev_base` | 2048 | 2048 × 4 |
| Keyboard focus list `focus_base` (window only) | 10240 | 64 × 6 |
| Undo staging `stage_base` | 16384 | 640 |
| Undo stack `u_base` | 17408 | 32 × 640 |
| Redo stack `rd_base` | 38912 | 32 × 640 |

Lane params are deliberately contiguous from address 0 so `@serialize` and the
undo snapshot can move them in one `file_mem` / `memcpy`.

### Lanes
Seven. 0–3 are fixed CCs (**CC1** dynamics, **CC11** expression, **CC7** volume,
**CC21** aux/vibrato) — the CC *number* is immutable, everything else is not.
4–6 are free user lanes (`s_cc = -1` when blank).

Deliberate value ranges, so lanes don't fight:
- CC11's excursion is **half of CC1's** (~35 points against ~95), anchored at
  the peak so the floor rises rather than the top dropping. Reason: CC1
  crossfades recorded dynamic layers, changing timbre *and* level, while CC11 is
  a plain volume trim — sweeping both fully stacks two crescendos on one gesture
  and reads as exaggerated. Don't "restore" CC11's range without that in mind.
- CC7 stays in an **87–95%** band (floor 110–112, peak 118–121, sustain 113–114)
  so volume is never pulled far down.
- CC21 peaks at **20%** (25 of 127) and is shaped as a *late* gesture: long
  heavily-curved rise, no settle stage, short fall. Note length therefore decides
  vibrato depth on its own.

### Envelope
Stages `0 idle → 1 attack → 2 settle → 3 sustain → 4 release`. A stage with
duration 0 falls straight through (`t >= dur` is true at `t > 0`), which is why
the stage loop terminates — don't "fix" that by special-casing zero.

`env_mode` (slider 18) picks how the machine leaves stage 2 and 3:
- **0 Gated** — stage 3 holds until `release_env()` is called from note-off.
- **1 One-shot** — stage 3 holds for `hold_ms` (slider 19, scaled by `tscale`)
  and then releases itself.
- **2 ADR** — stage 2 goes straight to stage 4, so stage 3 is never entered.

In modes 1 and 2 `release_env(force)` no-ops unless `force` is set, which only
panic does; note-off and the sustain pedal are deliberately inert there. The
note-on trigger test also allows `env_idle()`, so a finished one-shot can fire
again in Legato mode — without it a completed shot could never restart while a
key was still held. Verified in simulation: all three modes reach idle at the
floor on every lane and preset, one-shot length tracks
`rise + settle + hold + fall`, ADR tracks `rise + settle + fall`, and Time Scale
stretches the hold with everything else.

Curves are 33-point tables interpolated at runtime, generated from an exponent
or drawn by hand. Exponent **< 1** rises fast early, **> 1** is a slow swell.

The canvas hold band `th` is the real `hold_ms` in One-shot and 0 in ADR, so the
drawing is to scale in both; only Gated uses an arbitrary placeholder width,
since a held note has no length. The middle band's label is suppressed below
34px and reads Hold rather than Sustain in One-Shot.

The canvas playhead maps runtime state back onto the drawing: stage picks the
band, and `r_t` is divided by `tscale` because runtime durations are multiplied
by it while the canvas is drawn in unscaled ms. Verified in simulation to land
within 0.00px of the drawn curve at full velocity, at Time Scale 50% and 250%.
Below full velocity the dot sits under the curve by design — the curve is the
nominal shape, the dot is the value actually being sent.

Timing: `@block` collects MIDI into a queue, then advances the envelope
*between* events so generated CCs get true sample offsets. The starting CC value
is emitted **before** the note-on is forwarded, because libraries latch dynamics
at note-on. CCs are only sent when the rounded 0–127 value changes.

### Palette
A shared scheme carried over from another project. Constants live at the top of
`@init`; **every** colour goes through `setx(packed_hex)` / `setxa(hex, alpha)`.
The raw-RGB helpers were deleted on purpose so nothing can slip past the scheme.

Three rules that are easy to break:

1. **Every grey satisfies R < G < B.** A neutral grey at the same lightness reads
   flat beside the accent. `C_ACCENT` (#FFF200), `C_WARN` (#D2483F) and
   `C_WARN_TEXT` (#FF9E96) are the only entries off that ramp.
2. **Dark ink on every button, chosen or not.** `C_CTRL` and `C_ACCENT` are both
   far lighter than the ground, so `C_TEXT` on them is about 1.6:1 — invisible.
   `btn()` therefore draws `C_INK` unconditionally. Contrast against `C_INK` is
   8.2:1 on the grey and 15.4:1 on the accent. The trap is that the *chosen*
   button looks fine while the rest go unreadable, so a bug here hides.
3. **Hover and held are derived, not stored.** `shade(c, ±HOVER_F)` shifts toward
   white or black at runtime, so re-tinting means changing `C_ACCENT` alone. The
   greys use the ramp's own `C_CTRL_H` / `C_CTRL_D` entries since those are
   published values rather than computed ones.

`C_WARN` is reserved for warnings (currently only Engine = Bypassed). Never use
it decoratively — the point is that a warning can't be mistaken for a selection,
which is also why the canvas stage bands are grey steps rather than hues.
**`C_WARN` is never used for words**: it is 3.4:1 on the ground. It marks the
Engine box's border; the word "Bypassed" and the warning in the message bar are
`C_WARN_TEXT` (#FF9E96, 7.55:1).

**Text colours (1.1, decision 0001):** every line of text is at least **7:1** on
what it sits on. Body text `C_TEXT`; secondary text `C_LABEL2` (#B0B6C0: 7.35:1
on the ground, 8.3:1 on panels); `C_DIM` (#8A919C, 4.7:1) **only** for the
dimmed label of a control that is off (Undo/Redo with nothing to undo, Hold
outside One-Shot) and for marks that are not words. `C_SEP` is never text. The
selected lane row is lighter (`C_ACTIVE`), where `C_LABEL2` would be 6.6:1, so
its secondary words step up to `C_TEXT`. Words drawn on the canvas sit on a
small `C_ROLL` plate (`plate_text`) so the curve's fill cannot thin them. The
focus ring is `C_RING` (#F2F4F7) — never the accent, which means "on".

**Edges and marks (1.2, decision 0001's final sweep):** anything you use or
read as a shape is at least **3:1** on what it sits on. The edge of a field or
Global setting and the canvas's stage and floor lines are `C_EDGE` (#6D7581,
3.4–4.0:1); `C_SEP` is only for panel borders and separators, which group
rather than act, and for the edge of a field that is off. The canvas grid
(`C_BEAT`) and the wash under the curve are texture and stay faint.

`docs/palette-preview.svg` is a component mock whose colours are parsed out of
`AutoCC.jsfx`, so regenerate it rather than hand-editing if the scheme changes.

### The UI is the only surface
All 19 sliders are declared with a `-` prefix, which hides the standard slider
panel while keeping each parameter live and automatable. That means **every
parameter must have a control in `@gfx`** — adding a slider without one makes it
unreachable. The Global strip covers sliders 2–10 and 18–19 in two groups
(envelope, then MIDI routing), the preset buttons cover slider 1, and the lane
list's boxes cover 11–17 (through `set_en()`).

### The window's layout (1.1, decision 0001)
Top to bottom: the **message bar** (fixed; messages, hints, the bypass warning,
Dismiss and Options), the presets row with Panic / Reset, the lane list and the
envelope editor side by side (stacked when the window is too narrow), the
lane's fields in a grid, the action buttons (Undo, Redo, Reset Curves, Copy
Shape to All, Clear Lane), and the Global strip. Nothing is drawn below the
last row of controls — the old footer's help now lives in each control's hint.
The content scrolls (mouse wheel, or Tab scrolling the focus into view) when a
large interface size does not fit; the bar is drawn last, over it, and
`inr()` ignores the pointer under it (`hit_top`).

Rows that wrap use `flow(w)`; grids use `cell(n, cols, w, y0)`. Column counts
come from the window width over a minimum cell width, so the layout reflows
rather than overflowing sideways.

Derived values (`depth`, `tscale`, `step_samples`, …) are computed in
`apply_sliders()` rather than inline in `@slider`, because `@gfx` writes sliders
directly and `sliderchange()` does **not** re-run `@slider`. Any GUI control that
writes a slider must call `apply_sliders()` afterwards.

Global settings are deliberately **outside** the internal undo stack — they are
ordinary parameters, so they set `undo_pt` for a REAPER undo point and stop
there. The Undo/Redo buttons cover lane design only. (`field()` arms the undo
staging buffer on mouse-down regardless; with no matching `commit_undo()` the arm
is discarded on mouse-up, which is why global drags are harmless.)

### Lane enables
Live on **sliders 11–17**, not in `s_en` alone and *not* in presets — so changing
instrument never un-mutes a lane the user muted. `set_en()` writes both the array
and the slider. Muting queues a floor value flushed on the next `@block`
(`flush_off`), because **MIDI cannot be sent from `@slider`**.

### Undo
32 steps, two ring buffers. A snapshot is preset selector + param block + both
curve tables (639 words in a 640-word slot). Drags stage on mouse-down and commit
on first movement, so one gesture is one step. Restoring pushes enables back out
to sliders and resets `r_last` so CCs resend. History is per-instance and not
serialized. On top of that, `sliderchange(-1)` fires once on mouse-up so REAPER's
own project undo also captures the edit.

---

## 4. Conventions when editing

- Keep the paren-balance / memory-overlap / arity check handy — a JSFX syntax
  error only shows up when REAPER loads the file, so static checks earn their
  keep.
- Re-simulate the envelope in Python after changing preset values; quote the
  measured numbers rather than the intended ones.
- Update the memory map table above whenever a region moves.
- Match the existing comment density: explain *why* a constraint exists (the
  65536 memcpy rule, the `@serialize` guard), not what a line does.
- Don't claim REAPER-verified behaviour that hasn't been REAPER-verified.
- **Text on screen follows Apple's writing guidelines** (the house rule from
  Noterator's decision 0053; `docs/sessions/2026-10-14-apple-writing.md`):
  headings, field and button labels and slider names in title style
  ("CC Lanes", "Rise Shape", "Copy Shape to All"), hints and the footer in
  sentence case, an em dash between phrases and as the blank-CC placeholder,
  an en dash in ranges, curly apostrophes, "Command" spelled out (ysfx's
  font, and perhaps REAPER's Arial, has no ⌘). Slider descriptions and enum
  labels may be renamed (REAPER stores values by number); numbering, order and
  ranges may not.
- **Apple's HIG Foundations** (decision 0001, `docs/apple-hig-review.md`).
  Rules for new code in `@gfx`:
  - **every size goes through `ui_s`** (`12 * ui_s`, never a bare `12`), or it
    will not grow with Interface Size or on a Retina screen;
  - **every control registers for focus** with `focus_mark(id, x, y, w, h,
    kind)` as it is drawn (in reading order), can be pressed (`key_press`) or
    nudged (`key_step`) from the keyboard, and sets a hint that starts with its
    own name (`hint("Name: what it does.")`). `btn`, `ubtn`, `optctl` and
    `field` already do all of this; give a new control an id and a name in
    `NAMES` in `tools/uicheck.py`, and add it to the expected Tab order there;
  - controls are **28 points tall (`ch`) and 12 apart (`gap`)**; a button's
    width is `bwid(label, min)`, never narrower than its label;
  - **every line of text 7:1** (see *Palette*); a chosen control carries a
    second cue besides the yellow (the ink bar in `btn`, the tick in a box);
  - **messages go in the bar at the top** with `set_status()`/`sprintf(#status,
    …)` and stay until Dismiss or the next message — never on a timer. The bar
    **wraps** (`wrap_text`) and is sized for the longest built-in message, the
    one passed to `wrap_text` at the frame's start; a new message longer than
    that one replaces it there, or the bar grows the frame after it appears;
  - an action that throws away curve edits calls `push_undo()` first and says
    in the bar that Undo puts it back (1.2) — Undo, not a question;
  - **an edge or a mark that carries meaning is 3:1** (`C_EDGE`), and a
    meaningful hover target that is not a control still gets a `hint()`
    (the canvas does, with `w_id = 0`);
  - the layout needs **340 points across**; `ui_s` shrinks a large interface
    to fit a narrower window, never below 100%. A new row wider than that
    must wrap (`flow`, `cell`) or the 340 must change with it.
- **Check the window after any change to it** (needs cmake, g++, freetype,
  fontconfig; the build is about two minutes the first time):

  ```sh
  tools/build_host.sh                        # once: tools/build/uihost (git-ignored)
  python3 tools/uicheck.py                   # ~145 checks; --shots DIR writes PNGs
  python3 tools/uicheck.py --static          # source checks only, no build
  python3 tools/bite.py "what" "old" "new"   # break it in a copy; must say BIT
  ```

  `uicheck.py` makes an instrumented copy (every `gfx_drawstr`/`gfx_rect` in
  `@gfx` logged, with the pixels under each string read before it is drawn)
  and drives it in ysfx: contrast of every string, clipping, text size,
  control size and spacing, the Tab order by name, the ring on every stop,
  Return/Space/arrows/Esc, the ink bar, messages staying, the interface size
  (menu, saved across a reload, doubling exactly at 200%), Retina, scrolling
  the focus into view, and the static rules (R < G < B, colours through
  `setx`, brackets, memory regions, every slider reachable, no
  `want_all_kb`). **Look at the screenshots too** — the checks see rules, not
  taste.

---

## 5. ReaScript API (companion, not used yet)

`REAPER_API_functions.html` documents the **ReaScript** API (EEL2/Lua/Python) —
a different surface from JSFX. A JSFX cannot call it. It matters here only as the
route for an offline companion script that writes curves straight into a MIDI
item instead of generating them live:

- `MIDI_InsertCC(take, selected, muted, ppqpos, chanmsg, chan, msg2, msg3)`
- `MIDI_SetCC(take, ccidx, ...)`, `MIDI_SetCCShape(take, ccidx, shape, beztension)`
- `MIDI_CountEvts`, `MIDI_GetCC`, and `MIDI_Sort` after bulk edits
- `TrackFX_AddByName` / `TrackFX_GetParam` / `TrackFX_SetParam` to drive an
  AutoCC instance from a script
- `Undo_BeginBlock` / `Undo_EndBlock2` to wrap script edits in one undo point

Today the equivalent workflow is REAPER's *Track → Render/apply track FX to items
(MIDI output)*, which bakes AutoCC's live output into the item.
