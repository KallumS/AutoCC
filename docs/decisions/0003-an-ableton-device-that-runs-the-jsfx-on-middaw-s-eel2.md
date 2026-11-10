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
