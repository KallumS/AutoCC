# The kit, and where it came from

`ableton/kit/` is the same in every family repository that has an Ableton
device. Change it in one, copy it to all, and rebuild each device.

| File | From | Commit |
| --- | --- | --- |
| `runtime/lua_parse.js`, `lua_runtime.js`, `lua_compile.js` | KallumS/Middaw `runtime/lua/` (Lua 5.4, held to the real Lua byte for byte) | 7884fe9 |
| `runtime/jsfx.js` | KallumS/Middaw `runtime/jsfx/` (EEL2 and the JSFX host, with `@gfx` on a host) | 10e0446 (branch `ccr-ec4dcb66-3i9iqs`) |
| `runtime/polyfill.js`, `runtime/host.js` | KallumS/Middaw `runtime/` (the engines, JSON in and out) | 7884fe9 |
| `ui.js`, `live.js`, `generator.js`, `gfx.js`, `jsfx_device.js`, `build.py`, `test/` | written for the Ableton devices | - |

Do not edit `runtime/`: fix Middaw, then copy. The adapters beside the kit
(`ableton/adapters/`) are Noterator's (42c2c2f, as vendored in Middaw's
`family/engines/adapters/`), unchanged.

- `ui.js` draws in a `[v8ui]` with mgraphics, in Middaw's HousePalette.
- `live.js` is the Live Object Model: tempo, meter and scale; the notes of the
  clip in Detail View; a new clip, an Arrangement clip, or new notes in the
  open clip; and a player for hearing notes before they are used.
- `generator.js` is a whole device for any engine with an adapter.
- `gfx.js` is REAPER's `gfx_*` drawing on mgraphics, so a JSFX's own window runs.
- `jsfx_device.js` is a whole device for a family JSFX MIDI effect: the plug-in on a clock, its window, its state.
- `build.py` writes the bundle, the `.maxpat` and the `.amxd`.
- `test/max.js` is a pretend Max and a pretend Live set, for `node --test`.
