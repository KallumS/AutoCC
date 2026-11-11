# 0003. An Ableton device that runs the JSFX on Middaw's EEL2

Taken 2026-11-10. Stands.

## Context

The user is moving from REAPER to Ableton Live and asked for every family REAPER project as Max for Live, each on its own branch. A JSFX cannot be loaded in Live, but Middaw already runs every family JSFX unchanged on its EEL2 runtime (JavaScript), and Max 9 runs modern JavaScript in `[v8ui]`.

## Decision

`ableton/` holds a Max for Live MIDI effect that runs the `.jsfx` itself, unchanged, on Middaw's EEL2 runtime: @init, @slider, @block, @serialize, and now @gfx, drawn by `ableton/kit/gfx.js` (REAPER's `gfx_*` on Max's mgraphics) in a window the device strip's Show Window opens. A Task runs a block every 4 ms with the MIDI that arrived since the last, and Live's tempo, meter, transport and position stand in for REAPER's. The plug-in's @serialize is kept with the Live set, written only when it changes. gfx_showmenu, which REAPER answers inside the frame, is answered by drawing the menu and running the frame again with the choice. Keys typed in the window come in through Max's `[key]`. 

## Consequences

- `ableton/kit/` is copied into every family repository with a device; `VENDORED.md` there records where each part came from, including Middaw's runtime with @gfx support (Middaw 10e0446).
- The bundle is built, not hand-written, from the `.jsfx` in the repository root: a fix to the plug-in reaches the device by rebuilding.
- Timing is Max's JavaScript clock, not the audio thread: MIDI comes out up to a few milliseconds late.
- Nothing here has been opened in Live. The tests run the device in Node on a stand-in for Max and Live, and `ableton/kit/test/shot.js` draws its window to a PNG.

## 11 November 2026: Live's colours

The user asked for the Ableton versions to look like Ableton, and pointed to the Ableton-inspired scheme the family had tried: Starting Blocks' window themed after Live 8 on 18 September 2026 (commit 2765b0a3), neutral greys with a warm amber accent, replaced the same day by the yellow house scheme. The devices now draw in that scheme (`ableton/kit/palette.js`), with two changes so the family's rules hold: the chrome is #3E3E3E rather than #4A4A4A, because on the lighter grey a secondary word cannot reach 7:1 and still look secondary; and the buttons are light grey with dark ink, because light words on its #5E5E5E buttons reach only 5:1. The greys are neutral, as Live's are, not blue-shifted as the house scheme's.

The window is the script's own and is not edited for Live. `Palette.tone` translates as it draws: the house scheme's colours one for one (each chosen so the pairs the script was checked for stay 7:1 and 3:1), its yellow and the shades made of it to the amber, any other grey made neutral at the same brightness (so a palette of its own keeps every contrast), and every other colour left as it is. The REAPER version keeps the house scheme. `kit/test/palette_suite.js` holds all of it, and was checked by breaking each rule.
