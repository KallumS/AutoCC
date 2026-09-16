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
riding a mod wheel. There is no build step and no test harness — the file *is*
the product.

**How this code has been validated so far:** the envelope maths and the undo
ring buffer were ported to throwaway Python and exercised (preset shapes, stage
transitions, zero-length stages, velocity extremes, retrigger mid-release; undo
round trips, redo clearing, ring overflow both directions). Structure is checked
with a paren-balance and memory-overlap script. **None of it has been run inside
REAPER.** Anything touching `@gfx`, `sliderchange`, `gfx_getchar` or
`@serialize` is verified against the docs only — say so rather than implying it
has been tested.

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
  report keyboard modifiers when the mouse is not captured.** AutoCC's Ctrl
  fine-adjust depends on this.
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
- CC7 stays in an **87–95%** band (floor 110–112, peak 118–121, sustain 115) so
  volume is never pulled far down.
- CC21 peaks at **20%** (25 of 127) and is shaped as a *late* gesture: long
  heavily-curved rise, no settle stage, short fall. Note length therefore decides
  vibrato depth on its own.

### Envelope
Stages `0 idle → 1 attack → 2 settle → 3 sustain → 4 release`. A stage with
duration 0 falls straight through (`t >= dur` is true at `t > 0`), which is why
the stage loop terminates — don't "fix" that by special-casing zero.

Curves are 33-point tables interpolated at runtime, generated from an exponent
or drawn by hand. Exponent **< 1** rises fast early, **> 1** is a slow swell.

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

### The UI is the only surface
All 17 sliders are declared with a `-` prefix, which hides the standard slider
panel while keeping each parameter live and automatable. That means **every
parameter must have a control in `@gfx`** — adding a slider without one makes it
unreachable. The GLOBAL strip along the bottom covers sliders 2–10, the header
buttons cover slider 1, and the lane list's green boxes cover 11–17.

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
