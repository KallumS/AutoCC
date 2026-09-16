# AutoCC

**A REAPER JSFX that plays your CC curves for you.**

AutoCC watches incoming MIDI notes and generates orchestral controller curves
automatically. Play a note and it draws the arc — a rise, a sustain, and a fall —
across up to seven CC lanes at once, shaped to match how the real instrument
family behaves.

The point: program orchestral libraries with **both hands on the keys**, instead
of riding a mod wheel with one hand and playing with the other.

---

## Install

1. Copy `AutoCC.jsfx` into your REAPER resource folder under `Effects/`
   (REAPER → *Options → Show REAPER resource path…* → `Effects/`).
   A subfolder like `Effects/AutoCC/` is fine.
2. In REAPER, open the FX browser (`F`) and hit *Options → Rescan…* if it
   doesn't show up immediately.
3. Add it to a track's FX chain **before** your sample library — the library
   needs to receive the CCs AutoCC generates.

```
[MIDI keyboard] → [AutoCC] → [Kontakt / Spitfire / VSL / …]
```

To bake the result into the item, use REAPER's *Track → Render/Apply track FX
to items (MIDI output)*.

---

## The CC lanes

Every preset — including the default state — drives four **fixed** lanes
simultaneously:

| Lane | CC   | Typical use                                      |
|------|------|--------------------------------------------------|
| 1    | CC1  | Dynamics / modwheel (layer crossfade)            |
| 2    | CC11 | Expression                                       |
| 3    | CC7  | Volume                                           |
| 4    | CC21 | Aux — vibrato, tightness, alt dynamics           |

Their CC numbers cannot be changed. Everything else about them can.

Each lane sits in its own value range so they don't fight each other:

| Lane | Floor | Peak | Sustain | Range across all presets |
|------|-------|------|---------|--------------------------|
| CC1  | 0     | 100–112 | 90–96 | full sweep, 0% up to ~88% |
| CC11 | 20–30 | 100–110 | 90–100 | ~16% up to ~87% |
| CC7  | 110–112 | 118–121 | 115 | **stays in an 87–95% band** so volume never drops far |
| CC21 | 0     | 25      | 25    | **peaks at 20%** — deliberately minimal |

CC7 only breathes by a few values around 90% — enough to add body on a swell
without ever pulling the level down. CC21 is capped low because it usually
drives vibrato or tightness, where a high value is rarely wanted.

### CC21 builds late, then drops away

Vibrato is mostly a late-note gesture, so CC21 is shaped differently from the
other lanes: a long, heavily curved rise that stays near zero for most of its
attack, no settle stage (it holds at the top once it arrives), and a very short
fall.

| Preset | 50% of peak at | 90% of peak at | Back to 10% after note-off |
|--------|----------------|----------------|-----------------------------|
| Strings   | 1405 ms | 1730 ms | 140 ms |
| Brass     |  685 ms |  860 ms | 115 ms |
| Woodwinds |  610 ms |  765 ms | 100 ms |
| Default   |  840 ms | 1055 ms | 125 ms |

The practical effect is that note length decides how much vibrato you get,
without you doing anything:

| Held note (Strings) | CC21 reaches |
|---------------------|--------------|
| 250 ms  | 0.1%  |
| 500 ms  | 0.5%  |
| 1000 ms | 3.8%  |
| 2000 ms | 20% (full) |

Short runs stay dry, long notes bloom into vibrato near the end, and it clears
almost immediately on release.

Plus three **free lanes** (5–7). Pick any CC number `0–127` and draw whatever
curve you want. They start blank.

### Turning lanes off

Any lane can be switched off individually, either with the green toggle at the
left of its row in the GUI or with its own slider (**Lane 1–7**, sliders 11–17).
Both are the same control, so the toggle and the slider always agree, and
because it is a real parameter it can be automated and is saved with the
project and with presets.

When you mute a lane, AutoCC sends its floor value once and then stops
transmitting on that CC entirely — so the lane is left at a known resting value
rather than frozen wherever the envelope happened to be, and the CC is free for
you to write by hand.

Lane enables are deliberately **not** part of the instrument presets: switching
from Strings to Brass will never turn a lane back on behind your back.

---

## How the arc works

```
          peak ....┌──╮
                  ╱     ╰──────────────╮        ← SETTLE drops to the
                 ╱       sustain        ╲         sustain level
                ╱                        ╲
   floor ──────╯                          ╰────  ← FALL returns to floor
               │  RISE  │      hold      │ FALL │
             note-on                  note-off
```

* **RISE** — from the current value up to *peak*, following the rise curve.
* **SETTLE** — peak eases down to the *sustain* level (the natural post-attack
  settle of a real bow/breath).
* **SUSTAIN** — holds while the note is held.
* **FALL** — on note-off, drops from wherever it is back to *floor*, following
  the fall curve.

*Floor* is the resting value sent when nothing is playing, so the library is
always in a sane state.

### Per-lane parameters

| Field       | Meaning                                                       |
|-------------|---------------------------------------------------------------|
| CC NUMBER   | Target controller (editable on lanes 5–7 only)                |
| FLOOR       | Resting / idle value                                          |
| PEAK        | Top of the rise                                               |
| SUSTAIN     | Level held while the note sustains                            |
| VELOCITY    | How much note velocity scales the peak (0% = velocity ignored)|
| RISE        | Attack time, ms                                               |
| SETTLE      | Peak → sustain time, ms                                       |
| FALL        | Release time, ms                                              |
| RISE SHAPE  | Curve exponent: `<1` fast off the mark, `>1` slow swell       |
| FALL SHAPE  | Curve exponent for the release                                |

Drag any field to change it; hold **Ctrl** for fine adjustment.

### Drawing custom curves

The big panel is a live envelope display. Drag inside the blue **RISE** band or
the red **FALL** band to draw that segment freehand — the shape is stored as a
33-point table per lane and used verbatim by the engine. Dragging across
several points interpolates between them, so a single sweep paints a smooth
curve.

*Reset Curves* regenerates the segment from the RISE/FALL SHAPE exponents.
*Copy Shape To All* pushes the selected lane's timings and drawn curves onto
every other lane.

Drawing is available on **all** lanes, fixed and free alike.

---

## Instrument presets

| Preset        | Behaviour                                                        |
|---------------|------------------------------------------------------------------|
| **Default**   | Neutral, moderate rise and fall — a sane starting point           |
| **Strings**   | Slow swelling rise (~900 ms to peak), settled sustain, long gentle fall (~1.1 s) |
| **Brass**     | Fast attack with a bloom above sustain (~130 ms), firm sustain, moderate fall (~420 ms) |
| **Woodwinds** | Quick speech-like attack (~150 ms), steady sustain, quick fall (~220 ms) |

CC21 follows the same family character but on its own much longer timescale —
see *CC21 builds late* above.

Preset buttons only rewrite the four fixed lanes, so custom lanes you have
built survive while you audition instruments.

Touching *any* parameter flips the selector to **CUSTOM** — the built-in
presets are never silently overwritten.

### Saving your own presets

Use REAPER's own preset system: the `+` button at the top of the FX window →
*Save preset…*. AutoCC serialises every lane parameter **and every drawn curve
table**, so your saved preset restores the exact shapes you drew. Presets can
be exported and shared as `.rpl` banks like any other REAPER preset.

---

## Global controls

| Slider                  | Notes                                                   |
|-------------------------|---------------------------------------------------------|
| Instrument Preset       | Default / Strings / Brass / Woodwinds / Custom           |
| Master Depth (%)        | Scales all CC movement around each lane's floor          |
| Time Scale (%)          | Stretches or compresses every rise/settle/fall time      |
| Trigger Mode            | *Legato*: only the first note of a phrase starts a new rise. *Retrigger*: every note-on restarts it (from the current value — no jumps) |
| MIDI Input Channel      | Omni, or listen to one channel only                      |
| CC Output Channel       | Follow the triggering note's channel, or force a channel |
| Sustain Pedal Holds     | CC64 keeps the envelope sustaining after keys are released |
| CC Update Interval (ms) | Resolution of the generated CC stream (default 5 ms)     |
| Pass Through MIDI       | Forward the incoming notes (leave on unless AutoCC feeds another instance) |
| CC Engine               | Active / Bypassed                                        |
| Lane 1–7 (sliders 11–17)| Per-lane on/off, mirrored by the GUI toggles             |

All seventeen are automatable from the track's envelope lanes.

---

## Implementation notes

* Notes are collected per block and the envelope is advanced **between** MIDI
  events, so an event landing mid-block is timed to the sample. Generated CCs
  carry correct sample offsets rather than being quantised to block boundaries.
* On a note-on the starting CC value is emitted *before* the note-on is
  forwarded, so libraries that latch dynamics at note-on read the right value.
* CCs are only transmitted when the rounded 0–127 value actually changes — no
  redundant traffic.
* Polyphony is tracked by held-note count. In *Legato* mode the arc starts on
  the first note of a phrase and releases only when the last note (and the
  sustain pedal) is let go.
* A retrigger always starts from the *current* value, never from the floor, so
  repeated notes never produce a click or a dip.
* `CC120` (all sound off) and `CC123` (all notes off) reset the note state.
* Idle floor values are sent once when the effect starts so the library is
  initialised before the first note.
* Muting a lane queues a single floor value that is flushed on the next audio
  block (MIDI cannot be sent from the parameter-change handler). Loading a
  project where a lane was already off does not trigger that flush.

---

## License

MIT
