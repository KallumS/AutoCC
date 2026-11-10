/* AutoCC - built by ableton/kit/build.py from ableton/device.json. Do not edit; edit the sources and rebuild. */
var DEVICE = {"main": "AutoCC.jsfx", "title": "AutoCC"};
DEVICE.files = {"AutoCC.jsfx": "desc:AutoCC - automatic MIDI CC curves for orchestral libraries\nauthor:AutoCC\nversion:1.3\ntags:MIDI processing controller orchestral expression\nabout:\n  AutoCC generates orchestral CC curves automatically from incoming MIDI notes.\n  A note-on starts an arc (rise -> sustain -> fall) on up to seven CC lanes at\n  once. Four fixed lanes (CC1, CC11, CC7, CC21) plus three free user lanes with\n  fully drawable curves. Instrument presets shape the arcs the way the real\n  instrument families behave.\n\nin_pin:none\nout_pin:none\noptions:no_meter\n\nslider1:0<0,4,1{Default,Strings,Brass,Woodwinds,Custom}>-Instrument Preset\nslider2:100<0,200,1>-Master Depth (%)\nslider3:100<10,400,1>-Time Scale (%)\nslider4:0<0,1,1{Legato \u00e2\u0080\u0094 First Note Only,Retrigger \u00e2\u0080\u0094 Every Note}>-Trigger Mode\nslider5:0<0,16,1{Omni,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16}>-MIDI Input Channel\nslider6:0<0,16,1{Follow Note,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16}>-CC Output Channel\nslider7:1<0,1,1{No,Yes}>-Sustain Pedal Holds Envelope\nslider8:5<1,30,1>-CC Update Interval (ms)\nslider9:1<0,1,1{No,Yes}>-Pass Through MIDI\nslider10:0<0,1,1{Active,Bypassed}>-CC Engine\nslider11:1<0,1,1{Off,On}>-Lane 1 \u00e2\u0080\u0094 CC1 Dynamics\nslider12:1<0,1,1{Off,On}>-Lane 2 \u00e2\u0080\u0094 CC11 Expression\nslider13:1<0,1,1{Off,On}>-Lane 3 \u00e2\u0080\u0094 CC7 Volume\nslider14:1<0,1,1{Off,On}>-Lane 4 \u00e2\u0080\u0094 CC21 Aux / Vibrato\nslider15:0<0,1,1{Off,On}>-Lane 5 \u00e2\u0080\u0094 User 1\nslider16:0<0,1,1{Off,On}>-Lane 6 \u00e2\u0080\u0094 User 2\nslider17:0<0,1,1{Off,On}>-Lane 7 \u00e2\u0080\u0094 User 3\nslider18:0<0,2,1{Gated \u00e2\u0080\u0094 Follows the Key,One-Shot \u00e2\u0080\u0094 Plays Through,ADR \u00e2\u0080\u0094 No Sustain}>-Envelope Mode\nslider19:800<0,10000,10>-One-Shot Hold (ms)\nslider20:0<-64,64,1>-Dynamic\n\n@init\n\nNSLOTS = 7;\nCN     = 33;      // curve table resolution\nSER_V  = 1;\n\n// ---- parameter arrays (contiguous 0..175 so @serialize can grab them in one go)\ns_en    = 0;\ns_cc    = 16;\ns_floor = 32;\ns_peak  = 48;\ns_sus   = 64;\ns_atk   = 80;\ns_dcy   = 96;\ns_rel   = 112;\ns_vel   = 128;    // 0..100 %\ns_aexp  = 144;\ns_rexp  = 160;\nPARAM_LEN = 176;\n\n// ---- runtime state\nr_stage = 176;    // 0 idle, 1 attack, 2 decay, 3 sustain, 4 release, 5 carry\nr_t     = 192;\nr_val   = 208;\nr_start = 224;\nr_relst = 240;\nr_last  = 256;\nr_vsc   = 272;\nr_pndoff = 288;   // lane was just switched off -> send its floor once\nr_preven = 304;   // enables as they were before an undo restore\n\n// ---- curve tables\nca_base = 512;    // NSLOTS*CN = 231\ncr_base = 800;\n\nnotes_base = 1200;   // 128 note-held flags\nev_base    = 2048;   // MIDI event queue, 4 words each\nEV_MAX     = 2048;\n\n// ---- undo / redo history\n// REAPER's own undo only covers slider values, not the @serialize blob where\n// the drawn curves live, so AutoCC keeps its own history. One snapshot is the\n// preset selector + every lane parameter + both curve tables = 639 words.\nU_MAX      = 32;\nSNAP_W     = 640;\nstage_base = 16384;                        // gesture staging buffer\nu_base     = 17408;                        // undo stack\nrd_base    = 38912;                        // redo stack\n\nser_ver = SER_V;\n\n// ---- window only (never touched by the audio code)\nfocus_base = 10240;   // keyboard focus list: FOCUS_MAX x FOCUS_W (id, x, y, w, h, kind)\nFOCUS_MAX  = 64;\nFOCUS_W    = 6;\n// Ask for full resolution on a Retina screen; REAPER then sets it to 2 and\n// every size in @gfx doubles through ui_s.\ngfx_ext_retina < 1 ? ( gfx_ext_retina = 1 );\n\n// ---------------------------------------------------------------- palette\n// Shared scheme. Every grey satisfies R < G < B - that is the load-bearing\n// property, because a neutral grey at the same lightness reads flat next to the\n// accent. Accent and warning are the only two entries off that ramp.\nC_ACCENT = 0xFFF200;   // chosen buttons, checkmarks, active grabs, MIDI\nC_CTRL   = 0xA9AFBA;   // unchosen buttons\nC_CTRL_H = 0xC0C6CF;   // button hover\nC_CTRL_D = 0x8F96A2;   // button held\nC_INK    = 0x14171C;   // text on ANY button, and button borders\nC_WARN   = 0xD2483F;   // warnings only - never a shade of the accent\nC_ROLL   = 0x111419;   // deepest ground: the envelope canvas\nC_SUNK   = 0x1A1D23;   // sunken frames, panels\nC_POPUP  = 0x1B1F25;   // lane rows\nC_BEAT   = 0x1E2228;   // grid lines, the held band\nC_HOVER  = 0x22262D;   // frame hover\nC_GROUND = 0x23272E;   // window chrome\nC_ACTIVE = 0x2A2F37;   // frame active\nC_SEP    = 0x3A404A;   // separators, panel borders - not for the edge of anything you use\nC_EDGE   = 0x6D7581;   // the edge of a field or setting, and the canvas's marks: 3:1 or more\nC_DIM    = 0x8A919C;   // disabled text only, and marks - 4.7:1, too faint for words\nC_LABEL2 = 0xB0B6C0;   // secondary text: 7.35:1 on the ground, 8.3:1 on panels\nC_TEXT   = 0xDDE1E7;   // body text\nC_PLAY   = 0xF2F4F7;   // playhead\nC_RING   = 0xF2F4F7;   // the keyboard focus ring - near-white, never the accent\nC_WARN_TEXT = 0xFF9E96; // a warning in words: 7.55:1 (the red itself is 3.4:1)\n\n// Raw-RGB helpers are deliberately absent: every colour goes through setx() so\n// nothing can slip past the scheme.\nfunction setx(c) (\n  gfx_r = ((c / 65536) | 0) / 255;\n  gfx_g = ((((c / 256) | 0) % 256)) / 255;\n  gfx_b = (c % 256) / 255;\n  gfx_a = 1;\n);\nfunction setxa(c, a) ( setx(c); gfx_a = a; );\n\n// Hover and held are derived, not stored: f > 0 shifts toward white, f < 0\n// toward black. The accent's states are computed through here at runtime, so\n// re-tinting the scheme means changing C_ACCENT alone rather than three values.\nfunction shade(c, f) local(r, g, b) (\n  r = (c / 65536) | 0;\n  g = ((c / 256) | 0) % 256;\n  b = c % 256;\n  f > 0 ? (\n    r = r + (255 - r) * f;\n    g = g + (255 - g) * f;\n    b = b + (255 - b) * f;\n  ) : (\n    r = r * (1 + f);\n    g = g * (1 + f);\n    b = b * (1 + f);\n  );\n  ((r | 0) * 65536) + ((g | 0) * 256) + (b | 0);\n);\nHOVER_F =  0.18;\nHELD_F  = -0.18;\nfunction clampv(v, a, b) ( max(a, min(b, v)) );\n\n// Dynamic (slider 20) moves where the two fixed dynamics lanes, CC1 and CC11,\n// start, peak and sustain, keeping the swell's size: in the measured\n// mock-ups the start level is the written dynamic while the swell above it\n// barely changes (docs/research/per-note-analysis.md). Every runtime and\n// drawing use of a level goes through these, so the canvas and the playhead\n// agree with what is sent.\nfunction dyn_of(s) ( s < 2 ? dyn : 0 );\nfunction eff_fl(s) ( clampv(s_floor[s] + dyn_of(s), 0, 127) );\nfunction eff_pk(s) ( clampv(s_peak[s]  + dyn_of(s), 0, 127) );\nfunction eff_su(s) ( clampv(s_sus[s]   + dyn_of(s), 0, 127) );\n\n// A note that starts this soon after every key went up continues the line\n// rather than starting a new swell: below ~0.3-0.6 s the measured notes get no\n// swell of their own. Seconds, not scaled by Time Scale - it is a measure of\n// the playing, not of the envelope.\nRESTART_GAP = 0.4;\n\nfunction mkcurve(base, s, e) local(i, p) (\n  e = max(0.08, min(8, e));\n  i = 0;\n  while (i < CN) (\n    p = i / (CN - 1);\n    base[s * CN + i] = p ^ e;\n    i += 1;\n  );\n);\n\nfunction curve_at(base, s, p) local(x, i0, f) (\n  p = max(0, min(1, p));\n  x = p * (CN - 1);\n  i0 = x | 0;\n  i0 >= CN - 1 ? (\n    base[s * CN + CN - 1];\n  ) : (\n    f = x - i0;\n    base[s * CN + i0] * (1 - f) + base[s * CN + i0 + 1] * f;\n  );\n);\n\n// Lane enable lives on sliders 11-17, not in the preset, so switching\n// instruments never silently turns a lane the user muted back on.\nfunction setslot(s, cc, fl, pk, su, atk, dcy, rel, vel, ae, re) (\n  s_cc[s]    = cc;\n  s_floor[s] = fl;\n  s_peak[s]  = pk;\n  s_sus[s]   = su;\n  s_atk[s]   = atk;\n  s_dcy[s]   = dcy;\n  s_rel[s]   = rel;\n  s_vel[s]   = vel;\n  s_aexp[s]  = ae;\n  s_rexp[s]  = re;\n  mkcurve(ca_base, s, ae);\n  mkcurve(cr_base, s, re);\n  r_last[s]  = -1;\n);\n\n// Built-in instrument presets only touch the four fixed lanes so that any\n// custom lanes the user has built stay intact when auditioning presets.\n// Fitted to Lorne Balfe's mock-ups, which are the reference: Set 1, 21 cues\n// (docs/research/per-note-analysis.md), each lane to within 1-2.3 CC RMS. The\n// note starts at the dynamic and swells with a fast-early rise (shape\n// 0.22-0.66); strings and woodwinds hold the swell, brass blooms and eases\n// back. CC11 follows CC1 at ~0.84 of its range. CC7 and CC21 are levels Balfe\n// sets and leaves, so they are flat at his medians (94 and 92). Fall is not\n// measurable live (he tapers before the key lifts), so it is a plain 1 s.\n// Velocity is 10% on CC1 and 0 on CC11: within a track his swell barely\n// grows with velocity (best fits 10% and -8%, both ranges spanning 0). Re-run\n// tools/ccstudy.py before changing these.\nfunction load_preset(p) (\n  p == 1 ? (\n    // Strings: start at 85, swell +31 over 2.2 s, hold it\n    setslot(0,  1,  85, 116, 116, 2200,    0, 1000, 10, 0.66, 1.00);\n    setslot(1, 11,  94, 118, 118, 1800,    0, 1000,  0, 0.54, 1.00);\n    setslot(2,  7,  94,  94,  94,    0,    0,    0,  0, 1.00, 1.00);\n    setslot(3, 21,  92,  92,  92,    0,    0,    0,  0, 1.00, 1.00);\n  ) : p == 2 ? (\n    // Brass: start high, a quick +7 bloom, ease back by half\n    setslot(0,  1, 102, 109, 106, 1800,  200, 1000, 10, 0.22, 1.00);\n    setslot(1, 11,  78,  85,  82, 1800,  400, 1000,  0, 0.23, 1.00);\n    setslot(2,  7,  94,  94,  94,    0,    0,    0,  0, 1.00, 1.00);\n    setslot(3, 21,  92,  92,  92,    0,    0,    0,  0, 1.00, 1.00);\n  ) : p == 3 ? (\n    // Woodwinds: start low, swell +17 within a second, hold it\n    setslot(0,  1,  46,  63,  63,  800,    0, 1000, 10, 0.66, 1.00);\n    setslot(1, 11,  69,  88,  84, 1200,  800, 1000,  0, 0.66, 1.00);\n    setslot(2,  7,  94,  94,  94,    0,    0,    0,  0, 1.00, 1.00);\n    setslot(3, 21,  92,  92,  92,    0,    0,    0,  0, 1.00, 1.00);\n  ) : (\n    // Default: every family together - start at 91, swell +24 over 2.6 s\n    setslot(0,  1,  91, 115, 115, 2600,    0, 1000, 10, 0.54, 1.00);\n    setslot(1, 11,  85, 104, 104, 2200,    0, 1000,  0, 0.47, 1.00);\n    setslot(2,  7,  94,  94,  94,    0,    0,    0,  0, 1.00, 1.00);\n    setslot(3, 21,  92,  92,  92,    0,    0,    0,  0, 1.00, 1.00);\n  );\n);\n\nfunction clear_slot(s) (\n  setslot(s, -1, 0, 100, 90, 250, 200, 400, 40, 1.00, 1.00);\n);\n\n// Mute a lane from anywhere; the floor value is flushed on the next block so\n// the library is never left parked at whatever the lane last sent.\nfunction sync_en(s, v) (\n  (en_primed && s_en[s] && !v) ? r_pndoff[s] = 1;\n  s_en[s] = v;\n);\n\nfunction set_en(s, v) (\n  sync_en(s, v);\n  s == 0 ? ( slider11 = v; sliderchange(slider11); ) :\n  s == 1 ? ( slider12 = v; sliderchange(slider12); ) :\n  s == 2 ? ( slider13 = v; sliderchange(slider13); ) :\n  s == 3 ? ( slider14 = v; sliderchange(slider14); ) :\n  s == 4 ? ( slider15 = v; sliderchange(slider15); ) :\n  s == 5 ? ( slider16 = v; sliderchange(slider16); ) :\n           ( slider17 = v; sliderchange(slider17); );\n);\n\nfunction snap_write(addr) (\n  addr[0] = slider1;\n  memcpy(addr + 1,                          0,       PARAM_LEN);\n  memcpy(addr + 1 + PARAM_LEN,              ca_base, NSLOTS * CN);\n  memcpy(addr + 1 + PARAM_LEN + NSLOTS * CN, cr_base, NSLOTS * CN);\n);\n\nfunction snap_read(addr) local(i, want) (\n  // remember the live enables: the memcpy below overwrites s_en, and sync_en\n  // needs the before/after pair to know a lane just went quiet.\n  i = 0;\n  while (i < NSLOTS) ( r_preven[i] = s_en[i]; i += 1; );\n\n  slider1     = addr[0];\n  last_preset = slider1;          // stop @slider re-loading over the restore\n  sliderchange(slider1);\n\n  memcpy(0,       addr + 1,                           PARAM_LEN);\n  memcpy(ca_base, addr + 1 + PARAM_LEN,               NSLOTS * CN);\n  memcpy(cr_base, addr + 1 + PARAM_LEN + NSLOTS * CN, NSLOTS * CN);\n\n  i = 0;\n  while (i < NSLOTS) (\n    want      = s_en[i];\n    s_en[i]   = r_preven[i];\n    set_en(i, want);              // pushes the restored enable back to its slider\n    r_last[i] = -1;               // force a resend at the restored values\n    i += 1;\n  );\n);\n\n// Drops the oldest entry when a stack is full. The memcpy overlaps itself,\n// which JSFX only defines while neither buffer crosses a 65536-slot boundary -\n// both stacks sit entirely below 65536 and must stay there.\nfunction hist_push(base, n) (\n  n >= U_MAX ? ( memcpy(base, base + SNAP_W, (U_MAX - 1) * SNAP_W); n = U_MAX - 1; );\n  n;\n);\n\n// Instantaneous edits (buttons, toggles): snapshot the state we are leaving.\nfunction push_undo() (\n  undo_pt = 1;\n  u_n = hist_push(u_base, u_n);\n  snap_write(u_base + u_n * SNAP_W);\n  u_n += 1;\n  rd_n = 0;\n  stage_armed = 0;\n);\n\n// Drags: stage at mouse-down, commit only once the value actually moves, so a\n// click that changes nothing never lands on the stack.\nfunction arm_undo() ( snap_write(stage_base); stage_armed = 1; );\n\nfunction commit_undo() (\n  stage_armed ? (\n    stage_armed = 0;\n    undo_pt = 1;\n    u_n = hist_push(u_base, u_n);\n    memcpy(u_base + u_n * SNAP_W, stage_base, SNAP_W);\n    u_n += 1;\n    rd_n = 0;\n  );\n);\n\nfunction do_undo() (\n  u_n > 0 ? (\n    rd_n = hist_push(rd_base, rd_n);\n    snap_write(rd_base + rd_n * SNAP_W);\n    rd_n += 1;\n    u_n -= 1;\n    snap_read(u_base + u_n * SNAP_W);\n  );\n);\n\nfunction do_redo() (\n  rd_n > 0 ? (\n    u_n = hist_push(u_base, u_n);\n    snap_write(u_base + u_n * SNAP_W);\n    u_n += 1;\n    rd_n -= 1;\n    snap_read(rd_base + rd_n * SNAP_W);\n  );\n);\n\nfunction hist_clear() ( u_n = 0; rd_n = 0; stage_armed = 0; );\n\n// Derived values live here rather than in @slider itself, because the custom UI\n// writes sliders from @gfx and sliderchange() does not re-run @slider.\nfunction apply_sliders() (\n  slider1 != last_preset ? (\n    slider1 < 4 ? load_preset(slider1);\n    last_preset = slider1;\n  );\n\n  depth        = slider2 * 0.01;\n  tscale       = slider3 * 0.01;\n  retrig_mode  = slider4;\n  in_chan_sel  = slider5;\n  out_chan_sel = slider6;\n  pedal_hold   = slider7;\n  step_samples = max(8, floor(srate * slider8 * 0.001));\n  pass_thru    = slider9;\n  engine_on    = slider10 == 0;\n\n  sync_en(0, slider11 >= 0.5);\n  sync_en(1, slider12 >= 0.5);\n  sync_en(2, slider13 >= 0.5);\n  sync_en(3, slider14 >= 0.5);\n  sync_en(4, slider15 >= 0.5);\n  sync_en(5, slider16 >= 0.5);\n  sync_en(6, slider17 >= 0.5);\n  env_mode = slider18;\n  hold_ms  = slider19;\n  dyn      = slider20;\n  en_primed = 1;\n);\n\nfunction reset_runtime() local(i) (\n  i = 0;\n  while (i < NSLOTS) (\n    r_stage[i] = 0;\n    r_t[i]     = 0;\n    r_val[i]   = eff_fl(i);\n    r_start[i] = eff_fl(i);\n    r_relst[i] = eff_fl(i);\n    r_last[i]  = -1;\n    r_vsc[i]   = 1;\n    r_pndoff[i] = 0;\n    i += 1;\n  );\n  i = 0;\n  while (i < 128) ( notes_base[i] = 0; i += 1; );\n  note_cnt   = 0;\n  pedal_down = 0;\n  primed     = 0;\n);\n\nfunction send_cc(off, s, v) local(ch) (\n  ch = out_chan_sel > 0 ? out_chan_sel - 1 : last_chan;\n  midisend(off, 0xB0 | ch, s_cc[s], v);\n);\n\nfunction emit(off, s, v) local(iv) (\n  iv = clampv(floor(v + 0.5), 0, 127);\n  iv != r_last[s] ? ( r_last[s] = iv; send_cc(off, s, iv); );\n);\n\nfunction slot_live(s) ( s_en[s] && s_cc[s] >= 0 && s_cc[s] <= 127 );\n\nfunction env_tick(dt, off) local(i, st, t, fl, pk, su, v, dur, done) (\n  i = 0;\n  while (i < NSLOTS) (\n    slot_live(i) ? (\n      st = r_stage[i];\n      fl = eff_fl(i);\n      pk = fl + (eff_pk(i) - fl) * r_vsc[i] * depth;\n      su = fl + (eff_su(i) - fl) * r_vsc[i] * depth;\n      t  = r_t[i] + dt;\n      v  = r_val[i];\n      done = 0;\n      while (!done) (\n        st == 1 ? (\n          dur = s_atk[i] * 0.001 * tscale;\n          t >= dur ? ( t -= dur; st = 2; ) : (\n            v = r_start[i] + (pk - r_start[i]) * curve_at(ca_base, i, t / dur);\n            done = 1;\n          );\n        ) : st == 2 ? (\n          dur = s_dcy[i] * 0.001 * tscale;\n          t >= dur ? (\n            t -= dur;\n            // ADR has no sustain plateau: the decay runs straight into the fall.\n            env_mode == 2 ? ( r_relst[i] = su; st = 4; ) : ( st = 3; );\n          ) : (\n            v = pk + (su - pk) * (t / dur);\n            done = 1;\n          );\n        ) : st == 3 ? (\n          // Gated holds until note-off. One-shot holds for a fixed time and\n          // then releases itself, because there is no key to wait for.\n          env_mode == 1 ? (\n            dur = hold_ms * 0.001 * tscale;\n            t >= dur ? ( t -= dur; r_relst[i] = su; st = 4; ) : ( v = su; done = 1; );\n          ) : (\n            v = su;\n            done = 1;\n          );\n        ) : st == 5 ? (\n          // Carrying a line on (see carry_env): hold the level the note came\n          // in at, kept relative to the floor so Dynamic still moves it.\n          v = clampv(fl + r_relst[i], 0, 127);\n          // only Gated carries; if the mode changed meanwhile, fall from here\n          env_mode != 0 ? ( r_relst[i] = v; st = 4; t = 0; ) : ( done = 1; );\n        ) : st == 4 ? (\n          dur = s_rel[i] * 0.001 * tscale;\n          t >= dur ? ( st = 0; t = 0; ) : (\n            v = r_relst[i] + (fl - r_relst[i]) * curve_at(cr_base, i, t / dur);\n            done = 1;\n          );\n        ) : (\n          v = fl;\n          t = 0;\n          done = 1;\n        );\n      );\n      r_stage[i] = st;\n      r_t[i]     = t;\n      r_val[i]   = v;\n      engine_on ? emit(off, i, v);\n    );\n    i += 1;\n  );\n);\n\nfunction advance(target) local(n) (\n  while (cur_pos < target) (\n    n = min(step_samples - step_phase, target - cur_pos);\n    cur_pos    += n;\n    step_phase += n;\n    step_phase >= step_samples ? (\n      step_phase -= step_samples;\n      env_tick(step_samples / srate, cur_pos);\n    );\n  );\n);\n\nfunction start_env(vel, off) local(i, va) (\n  i = 0;\n  while (i < NSLOTS) (\n    r_start[i] = r_stage[i] == 0 ? eff_fl(i) : r_val[i];\n    r_val[i]   = r_start[i];\n    r_stage[i] = 1;\n    r_t[i]     = 0;\n    va         = s_vel[i] * 0.01;\n    r_vsc[i]   = 1 - va + va * (vel / 127);\n    (slot_live(i) && engine_on) ? emit(off, i, r_start[i]);\n    i += 1;\n  );\n);\n\n// A note that follows the last key-up by less than RESTART_GAP continues the\n// line: a lane already falling holds where it is (stage 5) until the next\n// key-up, instead of swelling again. Lanes still rising or sustaining (the\n// pedal kept them going) are left to carry on as they were.\nfunction carry_env() local(i) (\n  i = 0;\n  while (i < NSLOTS) (\n    r_stage[i] == 4 ? (\n      r_relst[i] = r_val[i] - eff_fl(i);\n      r_stage[i] = 5;\n      r_t[i]     = 0;\n    );\n    i += 1;\n  );\n);\n\n// force is set by panic; otherwise only Gated mode reacts to a key lift, since\n// One-shot and ADR are meant to finish the arc on their own.\nfunction release_env(force) local(i) (\n  (!force && env_mode != 0) ? 0 : (\n  i = 0;\n  while (i < NSLOTS) (\n    r_stage[i] != 0 ? (\n      r_relst[i] = r_val[i];\n      r_stage[i] = 4;\n      r_t[i]     = 0;\n    );\n    i += 1;\n  );\n  );\n);\n\n// True when nothing is sounding on any live lane.\nfunction env_idle() local(i, r) (\n  i = 0; r = 1;\n  while (i < NSLOTS) ( (s_en[i] && r_stage[i]) ? r = 0; i += 1; );\n  r;\n);\n\nfunction all_notes_off() local(i) (\n  i = 0;\n  while (i < 128) ( notes_base[i] = 0; i += 1; );\n  note_cnt   = 0;\n  pedal_down = 0;\n  release_env(1);\n);\n\nfunction handle_event(off, m1, m2, m3) local(st, ch) (\n  st = m1 & 0xF0;\n  ch = m1 & 0x0F;\n  (in_chan_sel == 0 || ch == in_chan_sel - 1) ? (\n    (st == 0x90 && m3 > 0) ? (\n      last_chan = ch;\n      notes_base[m2] ? 0 : ( notes_base[m2] = 1; note_cnt += 1; );\n      (note_cnt == 1 || retrig_mode || env_idle()) ? (\n        // Legato + Gated only: Retrigger asks for a swell on every note, and\n        // One-Shot and ADR play through regardless of the keys.\n        (note_cnt == 1 && !retrig_mode && env_mode == 0 && !env_idle() &&\n         (blk_pos + off - keyup_at) < RESTART_GAP * srate) ? carry_env() : start_env(m3, off);\n      );\n    ) : (st == 0x80 || (st == 0x90 && m3 == 0)) ? (\n      notes_base[m2] ? ( notes_base[m2] = 0; note_cnt = max(0, note_cnt - 1); );\n      note_cnt == 0 ? ( keyup_at = blk_pos + off; );\n      (note_cnt == 0 && !(pedal_hold && pedal_down)) ? release_env(0);\n    ) : st == 0xB0 ? (\n      m2 == 64 ? (\n        pedal_down = m3 >= 64;\n        // with the pedal holding, the line ends when the pedal lifts\n        (!pedal_down && note_cnt == 0) ? ( keyup_at = blk_pos + off; release_env(0); );\n      );\n      (m2 == 120 || m2 == 123) ? all_notes_off();\n    );\n  );\n);\n\nfunction flush_off() local(i) (\n  i = 0;\n  while (i < NSLOTS) (\n    r_pndoff[i] ? (\n      r_pndoff[i] = 0;\n      (s_cc[i] >= 0 && s_cc[i] <= 127) ? ( r_last[i] = -1; emit(0, i, eff_fl(i)); );\n      r_stage[i] = 0;\n      r_t[i]     = 0;\n      r_val[i]   = eff_fl(i);\n    );\n    i += 1;\n  );\n);\n\nfunction send_idle() local(i) (\n  i = 0;\n  while (i < NSLOTS) (\n    slot_live(i) ? ( r_last[i] = -1; emit(0, i, eff_fl(i)); );\n    i += 1;\n  );\n);\n\n// ---------------------------------------------------------------- first init\ninit_done ? 0 : (\n  load_preset(0);\n  s_en[0] = 1; s_en[1] = 1; s_en[2] = 1; s_en[3] = 1;\n  s_en[4] = 0; s_en[5] = 0; s_en[6] = 0;\n  en_primed = 0;\n  hist_clear();\n  clear_slot(4);\n  clear_slot(5);\n  clear_slot(6);\n  reset_runtime();\n  last_preset = 0;\n  sel_slot    = 0;\n  last_chan   = 0;\n  init_done   = 1;\n);\n\ncur_pos     = 0;\nstep_phase  = 0;\nblk_pos     = 0;               // samples since @init: times the gap between key-up and the next note\nkeyup_at    = -1000000000;\nstep_samples = max(8, floor(srate * 0.005));\nprimed      = 0;\ndraw_ci     = -1;\n\n@slider\n\napply_sliders();\n\n\n@block\n\n!primed ? ( primed = 1; engine_on ? send_idle(); );\nengine_on ? flush_off();\n\nnev = 0;\nwhile (midirecv(mo, m1, m2, m3)) (\n  nev < EV_MAX ? (\n    ev_base[nev * 4]     = mo;\n    ev_base[nev * 4 + 1] = m1;\n    ev_base[nev * 4 + 2] = m2;\n    ev_base[nev * 4 + 3] = m3;\n    nev += 1;\n  ) : (\n    pass_thru ? midisend(mo, m1, m2, m3);\n  );\n);\n\ncur_pos    = 0;\nei = 0;\nwhile (ei < nev) (\n  mo = ev_base[ei * 4];\n  m1 = ev_base[ei * 4 + 1];\n  m2 = ev_base[ei * 4 + 2];\n  m3 = ev_base[ei * 4 + 3];\n  advance(mo);\n  handle_event(mo, m1, m2, m3);   // may emit the starting CC values at this offset\n  pass_thru ? midisend(mo, m1, m2, m3);\n  ei += 1;\n);\nadvance(samplesblock);\nblk_pos += samplesblock;\n\n@serialize\n\nfile_var(0, ser_ver);\nfile_mem(0, 0, PARAM_LEN);\nfile_mem(0, ca_base, NSLOTS * CN);\nfile_mem(0, cr_base, NSLOTS * CN);\n// The interface size (Options), saved with the project. Older projects end\n// before it, so it is only read when there is something left to read, and a\n// preset or REAPER's undo never resizes a window that is already showing.\n(file_avail(0) < 0) ? ( file_var(0, ui_zoom); ) : file_avail(0) > 0 ? (\n  file_var(0, zoom_in);\n  ui_zoom < 1 ? ( ui_zoom = zoom_in );\n);\n(file_avail(0) < 0) ? (\n  0;              // writing\n) : (\n  reset_runtime();\n  hist_clear();                  // never undo into the previous project's state\n  last_preset = slider1;\n);\n\n@gfx 820 730\n\n// ================================================================ helpers\nfunction slot_name(s) (\n  s == 0 ? \"Dynamics\" :\n  s == 1 ? \"Expression\" :\n  s == 2 ? \"Volume\" :\n  s == 3 ? \"Aux / Vibrato\" :\n  s == 4 ? \"User 1\" :\n  s == 5 ? \"User 2\" : \"User 3\";\n);\n\nfunction mark_custom() (\n  slider1 != 4 ? (\n    slider1     = 4;\n    last_preset = 4;\n    sliderchange(slider1);\n  );\n);\n\n// The pointer is over a rectangle - and not over the message bar, which is\n// drawn last and covers anything scrolled underneath it.\nfunction inr(x, y, w, h) (\n  mouse_x >= x && mouse_x < x + w && mouse_y >= y && mouse_y < y + h && mouse_y >= hit_top;\n);\n\n// The system's own typeface where there is one: Segoe UI on Windows, San\n// Francisco on macOS, else Arial. gfx_getfont names the face actually given\n// back, so a missing font is caught rather than guessed (Transient Shuffler's).\nfunction pick_font() (\n  gfx_setfont(1, \"Segoe UI\", 14, 0); gfx_getfont(#got);\n  matchi(\"Segoe UI*\", #got) ? strcpy(#ui_font, \"Segoe UI\") : (\n    gfx_setfont(1, \".AppleSystemUIFont\", 14, 0); gfx_getfont(#got);\n    (matchi(\"*System*\", #got) || matchi(\"*SF*\", #got)) ?\n      strcpy(#ui_font, \".AppleSystemUIFont\") : strcpy(#ui_font, \"Arial\");\n  );\n  font_ready = 1;\n);\n\n// Apple's macOS sizes: 13-point text, nothing smaller. Every size is\n// multiplied by ui_s, the interface size times the screen's Retina factor.\nfunction fonts() (\n  gfx_setfont(1, #ui_font, 14 * ui_s, 0);     // buttons, the message bar\n  gfx_setfont(2, #ui_font, 13 * ui_s, 0);     // labels, secondary text\n  gfx_setfont(3, #ui_font, 14 * ui_s, 'b');   // values\n);\n\n// Draws a string, cut short with an ellipsis if it is wider than w.\nfunction text_fit(str, x, y, w, h) local(tw, th, n, c) (\n  gfx_measurestr(str, tw, th);\n  tw <= w ? (\n    gfx_x = x; gfx_y = y; gfx_drawstr(str, 4, x + w, y + h);\n  ) : (\n    n = strlen(str);\n    while (n > 1 && tw > w) (\n      n -= 1;\n      // never cut a UTF-8 character in half\n      while (n > 1 && (c = str_getchar(str, n)) >= -128 && c < -64) ( n -= 1; );\n      strcpy_substr(#fit, str, 0, n); strcat(#fit, \"\u00e2\u0080\u00a6\");\n      gfx_measurestr(#fit, tw, th);\n    );\n    gfx_x = x; gfx_y = y; gfx_drawstr(#fit, 4, x + w, y + h);\n  );\n);\n\n// Draws a string word-wrapped into lines of width w, lh apart, from (x, y),\n// and returns how many lines it took; with draw = 0 it only counts. A single\n// word wider than w is cut short as a last resort.\nfunction wrap_text(str, x, y, w, lh, draw) local(n, s, i, ok, tw, th, lines) (\n  n = strlen(str); s = 0; lines = 0;\n  while (s < n) (\n    while (s < n && str_getchar(str, s) == 32) ( s += 1; );\n    s < n ? (\n      ok = -1; i = s;\n      while (i <= n) (\n        (i == n || str_getchar(str, i) == 32) ? (\n          strcpy_substr(#wl, str, s, i - s);\n          gfx_measurestr(#wl, tw, th);\n          (tw <= w || ok < 0) ? ( ok = i; tw > w ? ( i = n ); ) : ( i = n );\n        );\n        i += 1;\n      );\n      draw ? ( strcpy_substr(#wl, str, s, ok - s); text_fit(#wl, x, y + lines * lh, w, lh); );\n      lines += 1;\n      s = ok;\n    );\n  );\n  max(1, lines);\n);\n\n// A word on a small plate of the canvas's own ground, so the curve's fill\n// can never sit under it and thin its contrast.\nfunction plate_text(str, x, y, c) local(tw, th) (\n  gfx_measurestr(str, tw, th);\n  setx(C_ROLL);\n  gfx_rect(x - 3 * ui_s, y - 1 * ui_s, tw + 6 * ui_s, th + 2 * ui_s, 1);\n  setx(c);\n  gfx_x = x; gfx_y = y;\n  gfx_drawstr(str);\n);\n\n// ---------------------------------------------------------------- keyboard\n// Every control registers itself as it is drawn, so Tab walks them in\n// reading order. The list lives in memory at focus_base: id, x, y, w, h, kind.\nfunction focus_add(id, x, y, w, h, kind) local(p) (\n  fl_n < FOCUS_MAX ? (\n    p = focus_base + fl_n * FOCUS_W;\n    p[0] = id; p[1] = x; p[2] = y; p[3] = w; p[4] = h; p[5] = kind;\n    fl_n += 1;\n  );\n);\n\n// Near-white, never the accent: yellow means \"on\", the ring means \"here\".\nfunction focus_ring(x, y, w, h) (\n  setx(C_RING);\n  gfx_rect(x - 3 * ui_s, y - 3 * ui_s, w + 6 * ui_s, h + 6 * ui_s, 0);\n  gfx_rect(x - 2 * ui_s, y - 2 * ui_s, w + 4 * ui_s, h + 4 * ui_s, 0);\n);\n\nfunction focus_mark(id, x, y, w, h, kind) (\n  reg_on ? focus_add(id, x, y, w, h, kind);\n  focus_id == id ? (\n    // a lane row's ring sits just inside it, clear of the rows either side\n    kind == 5 ? focus_ring(x + 3 * ui_s, y + 3 * ui_s, w - 6 * ui_s, h - 6 * ui_s)\n              : focus_ring(x, y, w, h);\n  );\n);\n\n// Return or Space presses the focused control.\nfunction key_press(id) (\n  (focus_id == id && (ui_key == 13 || ui_key == 32)) ? ( ui_key = 0; 1; ) : 0;\n);\n\n// The arrows nudge the focused control: up or right is +1, down or left -1.\nfunction key_step(id) local(d) (\n  d = 0;\n  focus_id == id ? (\n    (ui_key == 'up' || ui_key == 'rght') ? ( d = 1;  ui_key = 0; ) :\n    (ui_key == 'down' || ui_key == 'left') ? ( d = -1; ui_key = 0; );\n  );\n  d;\n);\n\n// What the control just drawn does, shown in the message bar while it is\n// pointed at or focused. Each hint starts with the control's own name.\nfunction hint(str) (\n  (w_hot || (w_id > 0 && focus_id == w_id)) ? ( hint_on = 1; ui_hint = str; );\n);\n\n// A message stays at the top until Dismiss is clicked or another replaces it.\nfunction set_status(str) ( strcpy(#status, str); );\n\n// A button is never narrower than its label.\nfunction bwid(label, minw) local(tw, th) (\n  gfx_setfont(1);\n  gfx_measurestr(label, tw, th);\n  max(minw * ui_s, ceil(tw + 24 * ui_s));\n);\n\n// Places the next item of a row that wraps at the window's edge.\nfunction flow(w) local(x) (\n  (flow_x > flow_x0 && flow_x + w > gfx_w - pad) ? ( flow_x = flow_x0; flow_y += ch + gap; );\n  x = flow_x;\n  flow_x += w + gap;\n  x;\n);\n\n// ---------------------------------------------------------------- controls\n// Buttons are light fills on a dark ground, so the ink is C_INK on every one\n// of them - chosen and unchosen alike. Body text on C_CTRL would be ~1.6:1.\n// A chosen button also carries an ink bar under its label, so \"chosen\" is\n// never told by colour alone.\nfunction btn(id, x, y, w, h, label, active) local(hot, held, c) (\n  hot  = inr(x, y, w, h);\n  w_hot = hot; w_id = id;\n  held = hot && (mouse_cap & 1);\n  active ? (\n    c = held ? shade(C_ACCENT, HELD_F) : (hot ? shade(C_ACCENT, HOVER_F) : C_ACCENT);\n  ) : (\n    c = held ? C_CTRL_D : (hot ? C_CTRL_H : C_CTRL);\n  );\n  setx(c);\n  gfx_rect(x, y, w, h, 1);\n  setx(C_INK);\n  gfx_rect(x, y, w, h, 0);\n  gfx_setfont(1);\n  gfx_x = x; gfx_y = y;\n  gfx_drawstr(label, 1 | 4, x + w, y + h);\n  active ? ( setx(C_INK); gfx_rect(x + 10 * ui_s, y + h - 5 * ui_s, w - 20 * ui_s, 2 * ui_s, 1); );\n  focus_mark(id, x, y, w, h, 1);\n  (hot && click) || key_press(id);\n);\n\n// Like btn() but greys out, leaves the Tab order and stops responding when\n// there is nothing to do. Its dimmed label is the one text exempt from 7:1.\nfunction ubtn(id, x, y, w, h, label, avail) local(hot, held) (\n  hot = avail && inr(x, y, w, h);\n  w_hot = inr(x, y, w, h); w_id = avail ? id : 0;\n  held = hot && (mouse_cap & 1);\n  avail ? setx(held ? C_CTRL_D : (hot ? C_CTRL_H : C_CTRL)) : setx(C_ACTIVE);\n  gfx_rect(x, y, w, h, 1);\n  avail ? setx(C_INK) : setx(C_SEP);\n  gfx_rect(x, y, w, h, 0);\n  avail ? setx(C_INK) : setx(C_DIM);\n  gfx_setfont(1);\n  gfx_x = x; gfx_y = y;\n  gfx_drawstr(label, 1 | 4, x + w, y + h);\n  avail ? focus_mark(id, x, y, w, h, 1);\n  avail && ((hot && click) || key_press(id));\n);\n\n// Enum setting: click or Return advances, right-click steps back, the arrows\n// go either way; all wrap. Dragging would be hopeless on a 2-value control\n// and coarse on a 17-value one.\nfunction optctl(id, x, y, w, h, label, val, vmx) local(hot, nv, d) (\n  hot = inr(x, y, w, h);\n  w_hot = hot; w_id = id;\n  nv  = val;\n  (hot && click)  ? ( nv = val >= vmx ? 0 : val + 1 );\n  (hot && rclick) ? ( nv = val <= 0 ? vmx : val - 1 );\n  key_press(id)   ? ( nv = val >= vmx ? 0 : val + 1 );\n  d = key_step(id);\n  d > 0 ? ( nv = val >= vmx ? 0 : val + 1 ) : d < 0 ? ( nv = val <= 0 ? vmx : val - 1 );\n  setx(C_SUNK);\n  gfx_rect(x, y, w, h, 1);\n  hot ? setx(C_CTRL) : setx(C_EDGE);\n  gfx_rect(x, y, w, h, 0);\n  setx(C_LABEL2);\n  gfx_setfont(2);\n  gfx_x = x; gfx_y = y + 6 * ui_s;\n  gfx_drawstr(label, 1, x + w, y + 24 * ui_s);\n  focus_mark(id, x, y, w, h, 3);\n  ctl_x = x; ctl_y = y; ctl_w = w; ctl_h = h;\n  fld_val = nv;\n  nv != val;\n);\n\n// Draws the value line inside the box optctl() just laid out.\nfunction ctl_txt(str, c) (\n  gfx_setfont(3);\n  setx(c);\n  gfx_x = ctl_x; gfx_y = ctl_y + 24 * ui_s;\n  gfx_drawstr(str, 1, ctl_x + ctl_w, ctl_y + ctl_h - 2 * ui_s);\n);\n\nfunction fmtval(kind, v) (\n  kind == 1 ? sprintf(#g, \"%d ms\", v) :\n  kind == 2 ? sprintf(#g, \"%d %%\",  v) :\n  kind == 3 ? sprintf(#g, \"%.2f\",   v) :\n  kind == 4 ? (v < 0 ? sprintf(#g, \"\u00e2\u0080\u0094\") : sprintf(#g, \"CC%d\", v)) :\n  kind == 5 ? (v > 0 ? sprintf(#g, \"+%d\", v) : v < 0 ? sprintf(#g, \"\u00e2\u0088\u0092%d\", -v) : sprintf(#g, \"0\")) :\n              sprintf(#g, \"%d\", v);\n);\n\n// Numeric field: drag up or down (Command for fine steps), or focus it and use\n// the arrows (Shift for fine steps). mode 1 = editable, 2 = read-only (shown,\n// still readable), 0 = disabled (dimmed). Result in fld_val.\nfunction field(id, x, y, w, h, label, val, vmn, vmx, kind, mode, stp, fine)\n              local(hot, nv, d, ed) (\n  ed  = mode == 1;\n  hot = inr(x, y, w, h);\n  w_hot = hot; w_id = ed ? id : 0;\n  (ed && hot && click) ? ( drag_id = id; drag_y = mouse_y; drag_v = val; arm_undo(); );\n  nv = val;\n  (ed && drag_id == id && (mouse_cap & 1)) ? (\n    d = (drag_y - mouse_y) * (vmx - vmn) / (150 * ui_s);\n    (mouse_cap & 4) ? ( d *= 0.2 );\n    nv = drag_v + d;\n    nv = kind == 3 ? floor(nv * 100 + 0.5) / 100 : floor(nv + 0.5);\n    nv = clampv(nv, vmn, vmx);\n  );\n  d = ed ? key_step(id) : 0;\n  d != 0 ? (\n    arm_undo();\n    nv = val + d * ((mouse_cap & 8) ? fine : stp);\n    nv = kind == 3 ? floor(nv * 100 + 0.5) / 100 : floor(nv + 0.5);\n    nv = clampv(nv, vmn, vmx);\n  );\n  ed ? setx(C_SUNK) : setx(C_ROLL);\n  gfx_rect(x, y, w, h, 1);\n  (ed && drag_id == id) ? setx(C_ACCENT) : (ed && hot) ? setx(C_CTRL) : ed ? setx(C_EDGE) : setx(C_SEP);\n  gfx_rect(x, y, w, h, 0);\n  mode ? setx(C_LABEL2) : setx(C_DIM);\n  gfx_setfont(2);\n  gfx_x = x; gfx_y = y + 6 * ui_s;\n  gfx_drawstr(label, 1, x + w, y + 24 * ui_s);\n  gfx_setfont(3);\n  ed ? setx(C_TEXT) : mode ? setx(C_LABEL2) : setx(C_DIM);\n  fmtval(kind, nv);\n  gfx_x = x; gfx_y = y + 24 * ui_s;\n  gfx_drawstr(#g, 1, x + w, y + h - 2 * ui_s);\n  ed ? focus_mark(id, x, y, w, h, 2);\n  fld_changed = nv != val;\n  fld_val = nv;\n  fld_changed;\n);\n\n// A line as thick as the interface is large, so curves and ticks keep their\n// weight at 200% and on a Retina screen.\nfunction tline(x1, y1, x2, y2) local(j) (\n  j = 0;\n  loop(max(1, floor(ui_s + 0.5)), gfx_line(x1, y1 + j, x2, y2 + j); j += 1; );\n);\n\nfunction draw_mini(x, y, w, h, s) local(i, n, v, fl, pk, su, px, py, lx, ly, p) (\n  fl = eff_fl(s); pk = eff_pk(s); su = eff_su(s);\n  n = 28;\n  i = 0;\n  while (i <= n) (\n    p = i / n;\n    v = p < 0.40 ? fl + (pk - fl) * curve_at(ca_base, s, p / 0.40) :\n        p < 0.55 ? pk + (su - pk) * ((p - 0.40) / 0.15) :\n        p < 0.70 ? su :\n                   su + (fl - su) * curve_at(cr_base, s, (p - 0.70) / 0.30);\n    px = x + p * w;\n    py = y + h - (v / 127) * h;\n    i > 0 ? tline(lx, ly, px, py);\n    lx = px; ly = py;\n    i += 1;\n  );\n);\n\nfunction choose_preset(p) (\n  push_undo(); slider1 = p; last_preset = p; load_preset(p); sliderchange(slider1);\n  sprintf(#status, \"Loaded the %s preset into the four fixed lanes. Undo puts them back.\",\n          p == 0 ? \"Default\" : p == 1 ? \"Strings\" : p == 2 ? \"Brass\" : \"Woodwinds\");\n);\n\n// Field cells laid out in a grid that keeps reading order and wraps to fewer\n// columns when the window is narrow or the interface is large.\nfunction cell(n, cols, cw, y0) (\n  cell_x = pad + (n % cols) * (cw + gap);\n  cell_y = y0 + floor(n / cols) * (fh + gap);\n);\n\n// ================================================================ frame setup\n!font_ready ? pick_font();\n(ui_zoom < 1 || ui_zoom > 2) ? ( ui_zoom = 1 );\n// As large as chosen, but no larger than the window's width allows: the\n// layout needs 340 points across, so a narrow window shrinks a large interface\n// (never below 100%) rather than drawing past its right edge.\nui_s = max(1, gfx_ext_retina) * max(1, min(ui_zoom, gfx_w / (max(1, gfx_ext_retina) * 340)));\nfonts();\n\n// One key a frame. Calling gfx_getchar() every frame is also what keeps\n// mouse_cap's modifiers current when the mouse is not captured (Command for\n// fine drags, Shift for fine arrows and Shift+Tab). Ctrl+Z / Ctrl+Y only\n// arrive as 26 / 25 when \"Send all keyboard input to plug-in\" is on; the\n// buttons always work. Tab, Return and the arrows may likewise be taken by\n// REAPER first in some set-ups - unverified (see docs/apple-hig-review.md).\nui_key = gfx_getchar();\nclick  = (mouse_cap & 1) && !(last_cap & 1);\nrclick = (mouse_cap & 2) && !(last_cap & 2);\n!(mouse_cap & 1) ? ( drag_id = 0; draw_ci = -1; stage_armed = 0; );\n(click || rclick) ? ( focus_id = 0 );      // pointing takes over from the keyboard\nui_key == 26 ? ( do_undo(); ui_key = 0; ) : ui_key == 25 ? ( do_redo(); ui_key = 0; );\n\npad = 12 * ui_s;\ngap = 12 * ui_s;              // between controls\nch  = 28 * ui_s;              // a control's height\nfh  = 48 * ui_s;              // a field: its label above its value\n\n// Scrolling: the window may be smaller than what a large interface needs.\nmouse_wheel != 0 ? ( scroll -= mouse_wheel / 120 * 48 * ui_s; mouse_wheel = 0; );\nscroll = clampv(scroll, 0, max(0, content_h - gfx_h));\n\nsetx(C_INK);\ngfx_rect(0, 0, gfx_w, gfx_h, 1);\n\nfl_n = 0; reg_on = 1; hint_on = 0;\n\n// The bar is drawn last, over anything scrolled beneath it, but it comes\n// first in the Tab order, so its buttons are registered now.\nstatus_on = strlen(#status) > 0;\nopt_w = bwid(\"Options\", 84);\nopt_x = gfx_w - pad - opt_w;\ndis_w = bwid(\"Dismiss\", 84);\ndis_x = opt_x - gap - dis_w;\nmsg_r = (status_on ? dis_x : opt_x) - gap;\n// The message bar wraps rather than cutting a message short. Its words sit\n// beside Dismiss and Options, or under them when that leaves too little room,\n// and it is as tall as the longest message needs at this width and size (and\n// as Dismiss would leave), so it does not jump as the pointer moves.\ngfx_setfont(1);\nbar_lh = gfx_texth + 2 * ui_s;\nbar_under = dis_x - gap - pad < 240 * ui_s;\nbar_x = pad;\nbar_w = bar_under ? gfx_w - 2 * pad : msg_r - pad;\nbar_y = bar_under ? pad + ch + 6 * ui_s : pad;\nnw = bar_under ? bar_w : dis_x - gap - pad;\nbar_n = max(wrap_text(\"Copied Aux / Vibrato\u00e2\u0080\u0099s timing and curves to every other lane. Undo puts them back.\", 0, 0, nw, bar_lh, 0),\n            max(wrap_text(#status, 0, 0, nw, bar_lh, 0), wrap_text(#bar_last, 0, 0, nw, bar_lh, 0)));\nbar_h = bar_under ? bar_n * bar_lh : max(ch, bar_n * bar_lh);\ntop_h = bar_y + bar_h + 8 * ui_s;  // the message bar, fixed at the top\nstatus_on ? focus_add(113, dis_x, pad, dis_w, ch, 1);\nfocus_add(110, opt_x, pad, opt_w, ch, 1);\n\nhit_top = top_h;\ny = top_h + 4 * ui_s - scroll;\n\n// ---------------------------------------------------------------- presets\ngfx_setfont(2);\ngfx_measurestr(\"Preset\", tw, th);\nsetx(C_LABEL2);\ngfx_x = pad; gfx_y = y + (ch - th) / 2;\ngfx_drawstr(\"Preset\");\n\nflow_x0 = pad; flow_x = pad + tw + gap; flow_y = y;\nbw = max(max(bwid(\"Default\", 88), bwid(\"Strings\", 88)), max(bwid(\"Brass\", 88), bwid(\"Woodwinds\", 88)));\nbx = flow(bw); btn(101, bx, flow_y, bw, ch, \"Default\", slider1 == 0) ? choose_preset(0);\nhint(\"Default: a neutral arc that suits anything. Presets change the four fixed lanes.\");\nbx = flow(bw); btn(102, bx, flow_y, bw, ch, \"Strings\", slider1 == 1) ? choose_preset(1);\nhint(\"Strings: a slow swell, a settled sustain and a long, gentle fall.\");\nbx = flow(bw); btn(103, bx, flow_y, bw, ch, \"Brass\", slider1 == 2) ? choose_preset(2);\nhint(\"Brass: a fast attack with a bloom, a firm sustain and a moderate fall.\");\nbx = flow(bw); btn(104, bx, flow_y, bw, ch, \"Woodwinds\", slider1 == 3) ? choose_preset(3);\nhint(\"Woodwinds: a quick, speech-like attack, a steady sustain and a quick fall.\");\n\nslider1 == 4 ? (\n  cw4 = bwid(\"Custom\", 72);\n  bx = flow(cw4);\n  setx(C_ACCENT);\n  gfx_rect(bx, flow_y, cw4, ch, 0);\n  gfx_setfont(1);\n  gfx_x = bx; gfx_y = flow_y;\n  gfx_drawstr(\"Custom\", 1 | 4, bx + cw4, flow_y + ch);\n);\n\npw = bwid(\"Panic / Reset\", 120);\nflow_x <= gfx_w - pad - pw ? ( bx = gfx_w - pad - pw; ) : ( bx = flow(pw); );\nbtn(105, bx, flow_y, pw, ch, \"Panic / Reset\", 0) ? (\n  all_notes_off(); reset_runtime();\n  set_status(\"Panic \u00e2\u0080\u0094 every held note is released and every lane is back at its floor.\");\n);\nhint(\"Panic / Reset: release every held note and send each lane back to its floor.\");\ny = flow_y + ch + gap;\n\n// ---------------------------------------------------------------- lane list\n// Side by side when there is room, the editor under the lanes when not.\nlw  = 316 * ui_s;\nph  = 34 * ui_s + 7 * 40 * ui_s;\nlx0 = pad; ly0 = y;\n(gfx_w - 2 * pad - lw - gap >= 340 * ui_s) ? (\n  ex0 = pad + lw + gap; ey0 = y; ew = gfx_w - pad - ex0;\n  y += ph + gap;\n) : (\n  lw = gfx_w - 2 * pad; ex0 = pad; ey0 = y + ph + gap; ew = lw;\n  y = ey0 + ph + gap;\n);\n\nsetx(C_SUNK);\ngfx_rect(lx0, ly0, lw, ph, 1);\nsetx(C_SEP);\ngfx_rect(lx0, ly0, lw, ph, 0);\n\ngfx_setfont(2);\nsetx(C_LABEL2);\ngfx_x = lx0 + 10 * ui_s; gfx_y = ly0 + 9 * ui_s;\ngfx_drawstr(\"CC Lanes\");\ngfx_x = lx0 + 256 * ui_s;\ngfx_drawstr(\"Live\");\n\ni = 0;\nwhile (i < NSLOTS) (\n  ry = ly0 + 34 * ui_s + i * 40 * ui_s;\n  rh = 38 * ui_s;\n  rx = lx0 + 4 * ui_s; rw = lw - 8 * ui_s;\n  hot = inr(rx, ry, rw, rh);\n  bxh = lx0 + 6 * ui_s; byh = ry + (rh - ch) / 2;     // the box's 28-point target\n  ehot = inr(bxh, byh, ch, ch);\n  rfx = bxh + ch + 4 * ui_s; rfw = rx + rw - rfx;     // the row's own part\n\n  ((ehot && click) || key_press(200 + i)) ? ( push_undo(); set_en(i, !s_en[i]); sel_slot = i; );\n  ((hot && click && drag_id == 0) || key_press(210 + i)) ? ( sel_slot = i; );\n\n  // The selected row is lighter, so its secondary words step up to body text\n  // to stay above 7:1.\n  sel_slot == i ? setx(C_ACTIVE) : hot ? setx(C_HOVER) : setx(C_POPUP);\n  gfx_rect(rx, ry, rw, rh, 1);\n  sel_slot == i ? ( setx(C_ACCENT); gfx_rect(rx, ry, 3 * ui_s, rh, 1); );\n  tc2 = sel_slot == i ? C_TEXT : C_LABEL2;\n\n  // on/off box: a tick as well as the yellow\n  eb = 16 * ui_s;\n  ex = bxh + (ch - eb) / 2; ey = byh + (ch - eb) / 2;\n  s_en[i] ? setx(C_ACCENT) : ehot ? setx(C_CTRL_H) : setx(C_CTRL);\n  gfx_rect(ex, ey, eb, eb, 1);\n  setx(C_INK);\n  gfx_rect(ex, ey, eb, eb, 0);\n  s_en[i] ? (\n    tline(ex + 4 * ui_s, ey + 8 * ui_s, ex + 7 * ui_s, ey + 11 * ui_s);\n    tline(ex + 7 * ui_s, ey + 11 * ui_s, ex + 12 * ui_s, ey + 5 * ui_s);\n    tline(ex + 4 * ui_s, ey + 9 * ui_s, ex + 7 * ui_s, ey + 12 * ui_s);\n    tline(ex + 7 * ui_s, ey + 12 * ui_s, ex + 12 * ui_s, ey + 6 * ui_s);\n  );\n\n  // cc number + name\n  gfx_setfont(3);\n  (s_cc[i] >= 0 && s_en[i]) ? setx(C_TEXT) : setx(tc2);\n  fmtval(4, s_cc[i]);\n  gfx_x = lx0 + 44 * ui_s; gfx_y = ry + (rh - gfx_texth) / 2;\n  gfx_drawstr(#g);\n  gfx_setfont(2);\n  setx(tc2);\n  i < 4 ? (\n    gfx_x = lx0 + 96 * ui_s; gfx_y = ry + 3 * ui_s;  gfx_drawstr(slot_name(i));\n    gfx_x = lx0 + 96 * ui_s; gfx_y = ry + 20 * ui_s; gfx_drawstr(\"Fixed\");\n  ) : (\n    gfx_x = lx0 + 96 * ui_s; gfx_y = ry + (rh - gfx_texth) / 2; gfx_drawstr(slot_name(i));\n  );\n\n  // mini curve\n  s_en[i] ? setxa(C_ACCENT, 0.85) : setx(C_DIM);\n  draw_mini(lx0 + 190 * ui_s, ry + 8 * ui_s, 52 * ui_s, 22 * ui_s, i);\n\n  // live value\n  lvl = slot_live(i) ? r_val[i] : 0;\n  setx(C_ROLL);\n  gfx_rect(lx0 + 256 * ui_s, ry + 24 * ui_s, 46 * ui_s, 7 * ui_s, 1);\n  slot_live(i) ? (\n    r_stage[i] ? setx(C_ACCENT) : setx(C_DIM);\n    gfx_rect(lx0 + 256 * ui_s, ry + 24 * ui_s, max(1, 46 * ui_s * lvl / 127), 7 * ui_s, 1);\n  );\n  gfx_setfont(2);\n  setx(tc2);\n  fmtval(0, floor(lvl + 0.5));\n  gfx_x = lx0 + 256 * ui_s; gfx_y = ry + 3 * ui_s;\n  gfx_drawstr(#g, 1, lx0 + 302 * ui_s, ry + 22 * ui_s);\n\n  w_hot = ehot; w_id = 200 + i;\n  focus_mark(200 + i, bxh, byh, ch, ch, 4);\n  hint(\"Lane on or off: a lane that\u00e2\u0080\u0099s off sends its floor once, then stays quiet.\");\n  w_hot = hot && !ehot; w_id = 210 + i;\n  focus_mark(210 + i, rfx, ry, rfw, rh, 5);\n  i < 4 ? hint(\"Fixed lane: choose it to edit its envelope. Its CC number can\u00e2\u0080\u0099t change.\")\n        : hint(\"Your own lane: choose it, set a CC number, then draw its curve.\");\n  i += 1;\n);\n\n// ---------------------------------------------------------------- editor\nsel = sel_slot;\nsetx(C_SUNK);\ngfx_rect(ex0, ey0, ew, ph, 1);\nsetx(C_SEP);\ngfx_rect(ex0, ey0, ew, ph, 0);\n\ngfx_setfont(2);\nsetx(C_LABEL2);\ngfx_x = ex0 + 10 * ui_s; gfx_y = ey0 + 9 * ui_s;\ngfx_drawstr(\"Envelope\");\ngfx_x += 8 * ui_s;\nsetx(C_TEXT);\nfmtval(4, s_cc[sel]);\ngfx_drawstr(#g);\ngfx_x += 8 * ui_s;\nsetx(C_LABEL2);\ngfx_drawstr(slot_name(sel));\nname_end = gfx_x;\ngfx_measurestr(\"Drag in Rise or Fall to draw the curve\", tw, th);\n(ex0 + ew - 10 * ui_s - tw > name_end + 16 * ui_s) ? (\n  gfx_x = ex0 + ew - 10 * ui_s - tw; gfx_y = ey0 + 9 * ui_s;\n  gfx_drawstr(\"Drag in Rise or Fall to draw the curve\");\n);\n\n// canvas\ncx = ex0 + 10 * ui_s; cy = ey0 + 32 * ui_s; cw = ew - 20 * ui_s; chh = ph - 42 * ui_s;\nsetx(C_ROLL);\ngfx_rect(cx, cy, cw, chh, 1);\n\n// grid\nsetx(C_BEAT);\ngi = 1;\nwhile (gi < 4) ( gfx_line(cx, cy + chh * gi / 4, cx + cw, cy + chh * gi / 4); gi += 1; );\n\nfl = eff_fl(sel); pk = eff_pk(sel); su = eff_su(sel);\nta = s_atk[sel]; td = s_dcy[sel]; tr = s_rel[sel];\n// In One-shot and ADR the hold length is known, so the canvas can draw it to\n// scale. Gated has no fixed length, so the band is just a readable placeholder.\nth = env_mode == 2 ? 0 :\n     env_mode == 1 ? hold_ms :\n                     max(150, (ta + td + tr) * 0.30);\ntot = max(1, ta + td + th + tr);\n\nxa1 = cx + cw * ta / tot;\nxd1 = cx + cw * (ta + td) / tot;\nxs1 = cx + cw * (ta + td + th) / tot;\n\n// stage bands\n// Bands are grey steps, not hues: the scheme keeps red for warnings only, so a\n// coloured band could be misread as an alert.\nsetx(C_SUNK); gfx_rect(cx,  cy, xa1 - cx,        chh, 1);\nsetx(C_BEAT); gfx_rect(xa1, cy, xs1 - xa1,       chh, 1);\nsetx(C_SUNK); gfx_rect(xs1, cy, cx + cw - xs1,   chh, 1);\n// The stage boundaries and the floor are 3:1 or more on the canvas.\nsetx(C_EDGE);\ngfx_line(xa1, cy, xa1, cy + chh);\ngfx_line(xd1, cy, xd1, cy + chh);\ngfx_line(xs1, cy, xs1, cy + chh);\n\n// floor line\nsetx(C_EDGE);\nfy = cy + chh - (fl / 127) * chh;\ngfx_line(cx, fy, cx + cw, fy);\n\n// ---- drawing interaction\ninside = inr(cx, cy - 6 * ui_s, cw, chh + 12 * ui_s);\nw_hot = inside; w_id = 0;\nhint(\"Envelope: drag in Rise or Fall to draw the curve. Rise Shape and Fall Shape set it from the keyboard.\");\n(inside && click && drag_id == 0) ? ( drag_id = 20; draw_ci = -1; arm_undo(); );\n\n(drag_id == 20 && (mouse_cap & 1)) ? (\n  mval = clampv((1 - (mouse_y - cy) / chh) * 127, 0, 127);\n  reg = -1; pp = 0;\n  mouse_x < xa1 && xa1 > cx ? (\n    reg = 0; pp = (mouse_x - cx) / (xa1 - cx);\n  ) : mouse_x >= xs1 && (cx + cw) > xs1 ? (\n    reg = 1; pp = (mouse_x - xs1) / (cx + cw - xs1);\n  );\n  reg >= 0 ? (\n    nrm = reg == 0 ?\n      (abs(pk - fl) < 0.5 ? 0 : (mval - fl) / (pk - fl)) :\n      (abs(fl - su) < 0.5 ? 0 : (mval - su) / (fl - su));\n    nrm = clampv(nrm, 0, 1);\n    ci  = clampv(floor(pp * (CN - 1) + 0.5), 0, CN - 1);\n    tb  = reg == 0 ? ca_base : cr_base;\n    (draw_ci >= 0 && draw_reg == reg && draw_ci != ci) ? (\n      st1 = min(draw_ci, ci); st2 = max(draw_ci, ci);\n      v1  = draw_ci < ci ? draw_val : nrm;\n      v2  = draw_ci < ci ? nrm : draw_val;\n      k = st1;\n      while (k <= st2) (\n        tb[sel * CN + k] = v1 + (v2 - v1) * (st2 > st1 ? (k - st1) / (st2 - st1) : 1);\n        k += 1;\n      );\n    ) : (\n      tb[sel * CN + ci] = nrm;\n    );\n    tb[sel * CN] = 0;\n    tb[sel * CN + CN - 1] = 1;\n    draw_ci = ci; draw_reg = reg; draw_val = nrm;\n    commit_undo();\n    mark_custom();\n  );\n);\n\n// ---- envelope trace\nsetx(C_ACCENT);\npx = 0;\nwhile (px <= cw) (\n  tt = px / cw * tot;\n  v = tt < ta ? fl + (pk - fl) * curve_at(ca_base, sel, ta > 0 ? tt / ta : 1) :\n      tt < ta + td ? pk + (su - pk) * (td > 0 ? (tt - ta) / td : 1) :\n      tt < ta + td + th ? su :\n      su + (fl - su) * curve_at(cr_base, sel, tr > 0 ? (tt - ta - td - th) / tr : 1);\n  vy = cy + chh - clampv(v, 0, 127) / 127 * chh;\n  px > 0 ? (\n    tline(lastpx, lastpy, cx + px, vy);\n    setxa(C_ACCENT, 0.10);\n    gfx_line(cx + px, vy, cx + px, cy + chh);\n    setx(C_ACCENT);\n  );\n  lastpx = cx + px; lastpy = vy;\n  px += 1;\n);\n\n// The band names sit on plates so the curve's fill never thins them.\ngfx_setfont(2);\nplate_text(\"Rise\", cx + 6 * ui_s, cy + chh - 20 * ui_s, C_LABEL2);\ngfx_measurestr(env_mode == 1 ? \"Hold\" : \"Sustain\", tw, th);\n(xs1 - xa1) > tw + 12 * ui_s ? plate_text(env_mode == 1 ? \"Hold\" : \"Sustain\", xa1 + 6 * ui_s, cy + chh - 20 * ui_s, C_LABEL2);\nplate_text(\"Fall\", xs1 + 6 * ui_s, cy + chh - 20 * ui_s, C_LABEL2);\n\n// ---- live playhead\n// Vertical line at where the envelope currently is along its own timeline, with\n// a dot at the value being sent. Runtime stage times are already multiplied by\n// tscale, so divide it back out to land on the unscaled ms the canvas is drawn\n// in. During sustain the playhead parks at the right edge of the (display-only)\n// hold band rather than running off, since a held note has no fixed length.\n// It shows real playback, not decoration, so Reduce Motion has nothing to stop.\n(slot_live(sel) && r_stage[sel]) ? (\n  pst = r_stage[sel];\n  pms = r_t[sel] * 1000 / max(0.0001, tscale);\n  pt  = pst == 1 ? min(pms, ta) :\n        pst == 2 ? ta + min(pms, td) :\n        pst == 3 ? ta + td + min(pms, th) :\n        pst == 5 ? ta + td + th :\n                   ta + td + th + min(pms, tr);\n  phx = cx + cw * clampv(pt, 0, tot) / tot;\n  phy = cy + chh - clampv(r_val[sel], 0, 127) / 127 * chh;\n\n  setxa(C_PLAY, 0.5);\n  gfx_line(phx, cy, phx, cy + chh);\n  setxa(C_ACCENT, 0.22);\n  gfx_circle(phx, phy, 8 * ui_s, 0, 1);\n  setx(C_ACCENT);\n  gfx_circle(phx, phy, 4 * ui_s, 1, 1);\n\n  // Value rides beside the dot, flipping left near the right edge.\n  gfx_setfont(3);\n  fmtval(0, floor(r_val[sel] + 0.5));\n  gfx_measurestr(#g, mw, mh);\n  plate_text(#g, (phx + 12 * ui_s + mw) > (cx + cw) ? phx - 12 * ui_s - mw : phx + 12 * ui_s,\n             clampv(phy - mh * 0.5, cy + 2 * ui_s, cy + chh - mh - 2 * ui_s), C_ACCENT);\n);\n\n// ---------------------------------------------------------------- fields\nfcols = clampv(floor((gfx_w - 2 * pad + gap) / (130 * ui_s + gap)), 2, 5);\nfw = floor((gfx_w - 2 * pad - (fcols - 1) * gap) / fcols);\nfy0 = y;\n\ncell(0, fcols, fw, fy0);\nfield(10, cell_x, cell_y, fw, fh, \"CC Number\", s_cc[sel], -1, 127, 4, sel >= 4 ? 1 : 2, 1, 1) ?\n  ( commit_undo(); s_cc[sel] = fld_val; r_last[sel] = -1; mark_custom(); );\nhint(\"CC Number: the controller this lane sends. Fixed lanes keep theirs.\");\ncell(1, fcols, fw, fy0);\nfield(1, cell_x, cell_y, fw, fh, \"Floor\", s_floor[sel], 0, 127, 0, 1, 5, 1) ?\n  ( commit_undo(); s_floor[sel] = fld_val; mark_custom(); );\nhint(\"Floor: where the lane rests between notes.\");\ncell(2, fcols, fw, fy0);\nfield(2, cell_x, cell_y, fw, fh, \"Peak\", s_peak[sel], 0, 127, 0, 1, 5, 1) ?\n  ( commit_undo(); s_peak[sel] = fld_val; mark_custom(); );\nhint(\"Peak: the top of the rise.\");\ncell(3, fcols, fw, fy0);\nfield(3, cell_x, cell_y, fw, fh, \"Sustain\", s_sus[sel], 0, 127, 0, 1, 5, 1) ?\n  ( commit_undo(); s_sus[sel] = fld_val; mark_custom(); );\nhint(\"Sustain: the level held while the key is down.\");\ncell(4, fcols, fw, fy0);\nfield(4, cell_x, cell_y, fw, fh, \"Velocity\", s_vel[sel], 0, 100, 2, 1, 5, 1) ?\n  ( commit_undo(); s_vel[sel] = fld_val; mark_custom(); );\nhint(\"Velocity: how much a note\u00e2\u0080\u0099s velocity scales the arc. 0% ignores it.\");\ncell(5, fcols, fw, fy0);\nfield(5, cell_x, cell_y, fw, fh, \"Rise\", s_atk[sel], 0, 8000, 1, 1, 50, 5) ?\n  ( commit_undo(); s_atk[sel] = fld_val; mark_custom(); );\nhint(\"Rise: how long the arc takes to reach its peak.\");\ncell(6, fcols, fw, fy0);\nfield(6, cell_x, cell_y, fw, fh, \"Settle\", s_dcy[sel], 0, 8000, 1, 1, 50, 5) ?\n  ( commit_undo(); s_dcy[sel] = fld_val; mark_custom(); );\nhint(\"Settle: how long the peak takes to ease down to the sustain level.\");\ncell(7, fcols, fw, fy0);\nfield(7, cell_x, cell_y, fw, fh, \"Fall\", s_rel[sel], 0, 8000, 1, 1, 50, 5) ?\n  ( commit_undo(); s_rel[sel] = fld_val; mark_custom(); );\nhint(\"Fall: how long the lane takes to return to its floor.\");\ncell(8, fcols, fw, fy0);\nfield(8, cell_x, cell_y, fw, fh, \"Rise Shape\", s_aexp[sel], 0.10, 6, 3, 1, 0.1, 0.01) ?\n  ( commit_undo(); s_aexp[sel] = fld_val; mkcurve(ca_base, sel, fld_val); mark_custom(); );\nhint(\"Rise Shape: below 1 leaps off the mark, above 1 swells slowly.\");\ncell(9, fcols, fw, fy0);\nfield(9, cell_x, cell_y, fw, fh, \"Fall Shape\", s_rexp[sel], 0.10, 6, 3, 1, 0.1, 0.01) ?\n  ( commit_undo(); s_rexp[sel] = fld_val; mkcurve(cr_base, sel, fld_val); mark_custom(); );\nhint(\"Fall Shape: below 1 drops away quickly, above 1 lingers.\");\ny = fy0 + ceil(10 / fcols) * (fh + gap);\n\n// ---------------------------------------------------------------- buttons\nflow_x0 = pad; flow_x = pad; flow_y = y;\nbw = bwid(\"Undo\", 64); bx = flow(bw);\nubtn(111, bx, flow_y, bw, ch, \"Undo\", u_n > 0) ? do_undo();\nhint(\"Undo: take back the last change to the lanes. Command-Z works too.\");\nbw = bwid(\"Redo\", 64); bx = flow(bw);\nubtn(112, bx, flow_y, bw, ch, \"Redo\", rd_n > 0) ? do_redo();\nhint(\"Redo: put back what you undid.\");\n\nbw = bwid(\"Reset Curves\", 118); bx = flow(bw);\nbtn(120, bx, flow_y, bw, ch, \"Reset Curves\", 0) ? (\n  push_undo();\n  mkcurve(ca_base, sel, s_aexp[sel]); mkcurve(cr_base, sel, s_rexp[sel]); mark_custom();\n  sprintf(#status, \"Reset %s\u00e2\u0080\u0099s curves from its Rise Shape and Fall Shape. Undo puts them back.\", slot_name(sel));\n);\nhint(\"Reset Curves: redraw this lane\u00e2\u0080\u0099s curves from Rise Shape and Fall Shape.\");\nbw = bwid(\"Copy Shape to All\", 136); bx = flow(bw);\nbtn(121, bx, flow_y, bw, ch, \"Copy Shape to All\", 0) ? (\n  push_undo();\n  i = 0;\n  while (i < NSLOTS) (\n    i != sel ? (\n      k = 0;\n      while (k < CN) (\n        ca_base[i * CN + k] = ca_base[sel * CN + k];\n        cr_base[i * CN + k] = cr_base[sel * CN + k];\n        k += 1;\n      );\n      s_atk[i] = s_atk[sel]; s_dcy[i] = s_dcy[sel]; s_rel[i] = s_rel[sel];\n      s_aexp[i] = s_aexp[sel]; s_rexp[i] = s_rexp[sel];\n    );\n    i += 1;\n  );\n  mark_custom();\n  sprintf(#status, \"Copied %s\u00e2\u0080\u0099s timing and curves to every other lane. Undo puts them back.\", slot_name(sel));\n);\nhint(\"Copy Shape to All: give every other lane this lane\u00e2\u0080\u0099s timing and curves.\");\nsel >= 4 ? (\n  bw = bwid(\"Clear Lane\", 100); bx = flow(bw);\n  btn(122, bx, flow_y, bw, ch, \"Clear Lane\", 0) ? (\n    push_undo(); clear_slot(sel); set_en(sel, 0); mark_custom();\n    sprintf(#status, \"Cleared %s and turned it off. Undo brings it back.\", slot_name(sel));\n  );\n  hint(\"Clear Lane: empty this lane and turn it off.\");\n);\ny = flow_y + ch + gap;\n\n// ------------------------------------------------- global settings\n// Envelope behaviour first, then MIDI routing and output, each group starting\n// a new row; the columns narrow or wrap with the window and interface size.\ngfx_setfont(2);\nsetx(C_LABEL2);\ngfx_x = pad; gfx_y = y;\ngfx_drawstr(\"Global\");\ny += gfx_texth + 6 * ui_s;\ngcols = clampv(floor((gfx_w - 2 * pad + gap) / (110 * ui_s + gap)), 2, 6);\ngw = floor((gfx_w - 2 * pad - (gcols - 1) * gap) / gcols);\n\ngy0 = y;\ncell(0, gcols, gw, gy0);\noptctl(33, cell_x, cell_y, gw, fh, \"Mode\", slider18, 2) ?\n  ( slider18 = fld_val; sliderchange(slider18); apply_sliders(); undo_pt = 1; );\nctl_txt(slider18 == 0 ? \"Gated\" : slider18 == 1 ? \"One-Shot\" : \"ADR\", C_TEXT);\nhint(\"Mode: Gated follows the key, One-Shot plays through, ADR has no sustain.\");\ncell(1, gcols, gw, gy0);\nfield(39, cell_x, cell_y, gw, fh, \"Hold\", slider19, 0, 10000, 1, slider18 == 1, 100, 10) ?\n  ( slider19 = fld_val; sliderchange(slider19); apply_sliders(); undo_pt = 1; );\nhint(\"Hold: how long One-Shot holds its sustain before it falls.\");\ncell(2, gcols, gw, gy0);\noptctl(34, cell_x, cell_y, gw, fh, \"Trigger\", slider4, 1) ?\n  ( slider4 = fld_val; sliderchange(slider4); apply_sliders(); undo_pt = 1; );\nctl_txt(slider4 ? \"Retrigger\" : \"Legato\", C_TEXT);\nhint(\"Trigger: Legato starts an arc after a break of 0.4 seconds, Retrigger on every note.\");\ncell(3, gcols, gw, gy0);\nfield(30, cell_x, cell_y, gw, fh, \"Depth\", slider2, 0, 200, 2, 1, 5, 1) ?\n  ( slider2 = fld_val; sliderchange(slider2); apply_sliders(); undo_pt = 1; );\nhint(\"Depth: scales every lane\u00e2\u0080\u0099s movement around its floor.\");\ncell(4, gcols, gw, gy0);\nfield(31, cell_x, cell_y, gw, fh, \"Time\", slider3, 10, 400, 2, 1, 5, 1) ?\n  ( slider3 = fld_val; sliderchange(slider3); apply_sliders(); undo_pt = 1; );\nhint(\"Time: stretches or squeezes every stage, hold included.\");\ncell(5, gcols, gw, gy0);\nfield(41, cell_x, cell_y, gw, fh, \"Dynamic\", slider20, -64, 64, 5, 1, 4, 1) ?\n  ( slider20 = fld_val; sliderchange(slider20); apply_sliders(); undo_pt = 1; );\nhint(\"Dynamic: moves where CC1 and CC11 start, keeping the swell. Automate it to shape a phrase.\");\ny = gy0 + ceil(6 / gcols) * (fh + gap);\n\ngy0 = y;\ncell(0, gcols, gw, gy0);\noptctl(35, cell_x, cell_y, gw, fh, \"MIDI In\", slider5, 16) ?\n  ( slider5 = fld_val; sliderchange(slider5); apply_sliders(); undo_pt = 1; );\nslider5 > 0 ? ( fmtval(0, slider5); ctl_txt(#g, C_TEXT); ) : ctl_txt(\"Omni\", C_TEXT);\nhint(\"MIDI In: listen to every channel (Omni) or to one. Right-click steps back.\");\ncell(1, gcols, gw, gy0);\noptctl(36, cell_x, cell_y, gw, fh, \"CC Out\", slider6, 16) ?\n  ( slider6 = fld_val; sliderchange(slider6); apply_sliders(); undo_pt = 1; );\nslider6 > 0 ? ( fmtval(0, slider6); ctl_txt(#g, C_TEXT); ) : ctl_txt(\"Follow\", C_TEXT);\nhint(\"CC Out: send on the note\u00e2\u0080\u0099s own channel (Follow) or on a fixed one.\");\ncell(2, gcols, gw, gy0);\noptctl(37, cell_x, cell_y, gw, fh, \"Pedal\", slider7, 1) ?\n  ( slider7 = fld_val; sliderchange(slider7); apply_sliders(); undo_pt = 1; );\nctl_txt(slider7 ? \"Holds\" : \"Ignored\", C_TEXT);\nhint(\"Pedal: whether the sustain pedal keeps a Gated arc going after you let go.\");\ncell(3, gcols, gw, gy0);\noptctl(38, cell_x, cell_y, gw, fh, \"MIDI Thru\", slider9, 1) ?\n  ( slider9 = fld_val; sliderchange(slider9); apply_sliders(); undo_pt = 1; );\nctl_txt(slider9 ? \"On\" : \"Off\", C_TEXT);\nhint(\"MIDI Thru: pass your notes on to the instrument after AutoCC.\");\ncell(4, gcols, gw, gy0);\nfield(32, cell_x, cell_y, gw, fh, \"Rate\", slider8, 1, 30, 1, 1, 1, 1) ?\n  ( slider8 = fld_val; sliderchange(slider8); apply_sliders(); undo_pt = 1; );\nhint(\"Rate: how often a moving lane sends a new value.\");\ncell(5, gcols, gw, gy0);\noptctl(40, cell_x, cell_y, gw, fh, \"Engine\", slider10, 1) ?\n  ( slider10 = fld_val; sliderchange(slider10); apply_sliders(); undo_pt = 1; );\n// The warning is in words, in the warning text colour; the house red only\n// marks the box.\nslider10 ? (\n  setx(C_WARN); gfx_rect(ctl_x, ctl_y, ctl_w, ctl_h, 0);\n  ctl_txt(\"Bypassed\", C_WARN_TEXT);\n) : ctl_txt(\"Active\", C_TEXT);\nhint(\"Engine: Bypassed stops every CC; Active sends them.\");\ny = gy0 + ceil(6 / gcols) * (fh + gap);\n\ncontent_h = y - gap + pad + scroll;\n\n// A thin indicator on the right edge when there is more than fits.\ncontent_h > gfx_h ? (\n  setx(C_SEP);\n  gfx_rect(gfx_w - 5 * ui_s, top_h, 3 * ui_s, gfx_h - top_h, 1);\n  setx(C_DIM);\n  gfx_rect(gfx_w - 5 * ui_s, top_h + (gfx_h - top_h) * scroll / content_h,\n           3 * ui_s, max(12 * ui_s, (gfx_h - top_h) * gfx_h / content_h), 1);\n);\n\n// ---------------------------------------------------------------- message bar\n// At the top, never the bottom: a message, else what the control under the\n// pointer or the focus does, else a warning that the engine is off, else what\n// to do. A message stays until Dismiss, or until another replaces it.\nhit_top = 0; reg_on = 0;\nsetx(C_GROUND);\ngfx_rect(0, 0, gfx_w, top_h, 1);\nsetx(C_SEP);\ngfx_line(0, top_h - 1, gfx_w, top_h - 1);\n\nstatus_on ? (\n  btn(113, dis_x, pad, dis_w, ch, \"Dismiss\", 0) ? strcpy(#status, \"\");\n  hint(\"Dismiss: clear this message.\");\n);\nbtn(110, opt_x, pad, opt_w, ch, \"Options\", 0) ? (\n  gfx_x = opt_x; gfx_y = pad + ch;\n  sprintf(#menu, \"%sInterface Size 100%%|%sInterface Size 125%%|%sInterface Size 150%%|%sInterface Size 200%%\",\n          ui_zoom == 1 ? \"!\" : \"\", ui_zoom == 1.25 ? \"!\" : \"\", ui_zoom == 1.5 ? \"!\" : \"\", ui_zoom == 2 ? \"!\" : \"\");\n  menu_sel = gfx_showmenu(#menu);\n  menu_sel == 1 ? ( ui_zoom = 1 ) : menu_sel == 2 ? ( ui_zoom = 1.25 ) :\n  menu_sel == 3 ? ( ui_zoom = 1.5 ) : menu_sel == 4 ? ( ui_zoom = 2 );\n);\nhint(\"Options: choose the interface size, from 100% to 200% (smaller when the window is too narrow).\");\n\ngfx_setfont(1);\nstrlen(#status) > 0 ? (\n  setx(C_TEXT); strcpy(#bar_last, #status);\n) : hint_on ? (\n  setx(C_LABEL2); strcpy(#bar_last, ui_hint);\n) : slider10 ? (\n  setx(C_WARN_TEXT); strcpy(#bar_last, \"The engine is bypassed \u00e2\u0080\u0094 no CCs are being sent. Set Engine to Active.\");\n) : (\n  setx(C_LABEL2); strcpy(#bar_last, \"Play with both hands \u00e2\u0080\u0094 the CCs write themselves. Press Tab to move by keyboard.\");\n);\n// one line sits in the middle of the bar beside the buttons; more start at its top\nbar_n = wrap_text(#bar_last, 0, 0, bar_w, bar_lh, 0);\nwrap_text(#bar_last, bar_x, bar_y + max(0, bar_h - bar_n * bar_lh) / 2, bar_w, bar_lh, 1);\n\n// ---------------------------------------------------------------- keys\n// Tab and Shift+Tab move the focus through every control in reading order,\n// scrolling it into view; Esc lets go of it.\nui_key == 9 ? (\n  fl_n > 0 ? (\n    cur = -1; i = 0;\n    loop(fl_n, focus_base[i * FOCUS_W] == focus_id ? ( cur = i ); i += 1; );\n    (mouse_cap & 8) ? ( cur = cur <= 0 ? fl_n - 1 : cur - 1 )\n                    : ( cur = cur < 0 ? 0 : (cur + 1) % fl_n );\n    focus_id = focus_base[cur * FOCUS_W];\n    (focus_id != 110 && focus_id != 113) ? (\n      fy_ = focus_base[cur * FOCUS_W + 2]; fh_ = focus_base[cur * FOCUS_W + 4];\n      fy_ < top_h + 6 * ui_s ? ( scroll -= top_h + 6 * ui_s - fy_ ) :\n      fy_ + fh_ > gfx_h - 6 * ui_s ? ( scroll += fy_ + fh_ - gfx_h + 6 * ui_s );\n    );\n  );\n) : ui_key == 27 ? ( focus_id = 0 );\n\n// sliderchange(-1) from @gfx asks REAPER to add a project undo point, which\n// snapshots the serialized curve data too. Deferring to mouse-up means one\n// point per gesture rather than one per frame.\n(undo_pt && !(mouse_cap & 1)) ? ( sliderchange(-1); undo_pt = 0; );\n\nlast_cap = mouse_cap;\n"};

/* ---- kit/runtime/jsfx.js ---- */
/* Middaw's JSFX runtime: the family's REAPER plug-ins, run unchanged.
 *
 * A JSFX file is a header (sliders, pins, imports) and sections of EEL2 code:
 * @init, @slider, @block, @sample, @serialize and @gfx. This file reads the
 * header, compiles the EEL2 in each section to JavaScript, and runs it the way
 * REAPER does: @init once, @slider when a slider moves, then for every block
 * @block once and @sample once per sample frame. MIDI arrives through
 * midirecv() and leaves through midisend() with its sample offset.
 *
 * @gfx is not run by default: Middaw draws each device's controls itself from
 * the sliders, so a device looks like the rest of the app. With
 * `{ gfx: true }` it is compiled too, and `runGfx(host, ...)` runs it: every
 * gfx_* call goes to the host, which draws (the Ableton devices' [v8ui]).
 *
 * Everything in EEL2 is a double. Variables live in one Float64Array, so the
 * generated code reads `v[12]`; memory (`buf[i]`) is EEL2's 8M words, given
 * out in 64k-word blocks only when written to, as EEL2 itself does.
 */
(function (NS) {
  'use strict';

  var EPS = 0.00001;
  var MAXLOOP = 1048576;
  var BLOCK = 65536, NBLOCKS = 128;

  // ------------------------------------------------------------ header ----
  function parseSliderLine(line) {
    var m = /^slider(\d+):(?:([A-Za-z_][\w.]*)=)?\s*([^<]*?)\s*<([^>]*)>(.*)$/.exec(line);
    if (!m) return null;
    var inner = m[4], enumNames = null;
    var em = /\{([^}]*)\}/.exec(inner);
    if (em) { enumNames = em[1].split(','); inner = inner.replace(em[0], ''); }
    var shape = null, sm = /:(log|sqr)(?:=([^,>]*))?/.exec(inner);
    if (sm) { shape = { kind: sm[1], value: sm[2] === undefined ? null : Number(sm[2]) }; inner = inner.replace(sm[0], ''); }
    var parts = inner.split(',').map(function (s) { return s.trim(); });
    var desc = m[5].trim();
    var hidden = desc[0] === '-';
    if (hidden) desc = desc.slice(1);
    return {
      index: Number(m[1]), variable: (m[2] || ('slider' + m[1])).toLowerCase(),
      def: Number(m[3]) || 0, min: Number(parts[0]) || 0, max: parts[1] === undefined ? 1 : Number(parts[1]),
      step: parts[2] === undefined || parts[2] === '' ? 0 : Number(parts[2]),
      names: enumNames, shape: shape, name: desc, hidden: hidden
    };
  }

  // A JSFX file and its imports -> header and sections.
  function parseFile(text, readImport) {
    var out = { desc: '', sliders: [], inPins: [], outPins: [], options: '', sections: {}, gfxSize: null };
    var order = ['init', 'slider', 'block', 'sample', 'serialize', 'gfx'];
    order.forEach(function (s) { out.sections[s] = []; });
    function take(src, isImport) {
      var lines = src.replace(/\r\n?/g, '\n').split('\n');
      var section = null, buf = [], startLine = 0;
      function flush() {
        if (section && out.sections[section]) out.sections[section].push({ code: buf.join('\n'), line: startLine });
        buf = [];
      }
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var sm = /^@(\w+)(.*)$/.exec(line);
        if (sm) {
          flush();
          section = sm[1].toLowerCase();
          startLine = i + 2;
          if (section === 'gfx') {
            var sz = sm[2].trim().split(/\s+/).map(Number);
            if (sz.length >= 2 && !out.gfxSize) out.gfxSize = [sz[0], sz[1]];
          }
          continue;
        }
        if (section) { buf.push(line); continue; }
        var t = line.trim();
        if (/^desc:/.test(t)) { if (!isImport || !out.desc) out.desc = t.slice(5).trim(); }
        else if (/^slider\d+:/.test(t)) { var s = parseSliderLine(t); if (s) out.sliders.push(s); }
        else if (/^in_pin:/.test(t)) out.inPins.push(t.slice(7).trim());
        else if (/^out_pin:/.test(t)) out.outPins.push(t.slice(8).trim());
        else if (/^options:/.test(t)) out.options += ' ' + t.slice(8).trim();
        else if (/^import\s+/.test(t)) {
          var name = t.replace(/^import\s+/, '').trim();
          var inc = readImport ? readImport(name) : null;
          if (inc === null || inc === undefined) throw new Error('JSFX import not found: ' + name);
          take(inc, true);
        }
      }
      flush();
    }
    take(text, false);
    out.sliders.sort(function (a, b) { return a.index - b.index; });
    out.inPins = out.inPins.filter(function (p) { return p !== 'none'; });
    out.outPins = out.outPins.filter(function (p) { return p !== 'none'; });
    return out;
  }

  // ------------------------------------------------------------- lexer ----
  var OPS = ['===', '!==', '<<=', '>>=', '==', '!=', '<=', '>=', '<<', '>>', '&&', '||',
    '+=', '-=', '*=', '/=', '%=', '^=', '|=', '&=', '~=',
    '+', '-', '*', '/', '%', '^', '<', '>', '!', '&', '|', '~', '?', ':',
    '(', ')', '[', ']', ',', ';', '='];
  var CONSTS = { pi: Math.PI, phi: (1 + Math.sqrt(5)) / 2, e: Math.E };

  function EelError(msg, line) { this.message = (line ? 'line ' + line + ': ' : '') + msg; this.line = line; }
  EelError.prototype = Object.create(Error.prototype);
  EelError.prototype.name = 'EelError';

  // REAPER's strings are bytes: one character per UTF-8 byte, as the C runtime
  // keeps them.
  function bytes(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0x800) out += String.fromCharCode(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out += String.fromCharCode(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out += String.fromCharCode(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  }

  function lex(src, firstLine) {
    var toks = [], i = 0, n = src.length, line = firstLine || 1;
    while (i < n) {
      var c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { var j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
      if (c === '/' && src[i + 1] === '*') {
        var k = src.indexOf('*/', i + 2); if (k < 0) k = n;
        for (var q = i; q < k; q++) if (src[q] === '\n') line++;
        i = k + 2; continue;
      }
      if (c === '"') {
        var buf = '', p = i + 1;
        while (p < n && src[p] !== '"') {
          if (src[p] === '\\' && p + 1 < n) {
            var e = src[p + 1];
            buf += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e; p += 2;
          } else { if (src[p] === '\n') line++; buf += src[p++]; }
        }
        toks.push({ k: 'str', v: bytes(buf), line: line }); i = p + 1; continue;
      }
      if (c === "'") {
        var close = src.indexOf("'", i + 1);
        var val = 0;
        var lit = bytes(src.slice(i + 1, close));
        for (var x = 0; x < lit.length; x++) val = val * 256 + lit.charCodeAt(x);
        toks.push({ k: 'num', v: val, line: line }); i = close + 1; continue;
      }
      if (c === '#') {
        var nm = /^#[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i, i + 200));
        if (nm) { toks.push({ k: 'nstr', v: nm[0].toLowerCase(), line: line }); i += nm[0].length; }
        else { toks.push({ k: 'tmpstr', line: line }); i++; }
        continue;
      }
      if (c === '$') {
        var rest = src.slice(i, i + 64), m;
        if ((m = /^\$x([0-9A-Fa-f]+)/.exec(rest))) { toks.push({ k: 'num', v: parseInt(m[1], 16), line: line }); i += m[0].length; continue; }
        if ((m = /^\$'(.)'/.exec(rest))) { toks.push({ k: 'num', v: m[1].charCodeAt(0), line: line }); i += m[0].length; continue; }
        if ((m = /^\$~(\d+)/.exec(rest))) { toks.push({ k: 'num', v: Math.pow(2, Number(m[1])) - 1, line: line }); i += m[0].length; continue; }
        if ((m = /^\$(pi|phi|e)\b/i.exec(rest))) { toks.push({ k: 'num', v: CONSTS[m[1].toLowerCase()], line: line }); i += m[0].length; continue; }
        throw new EelError('bad $ constant', line);
      }
      var hx = /^0[xX][0-9A-Fa-f]+/.exec(src.slice(i, i + 40));
      if (hx) { toks.push({ k: 'num', v: parseInt(hx[0], 16), line: line }); i += hx[0].length; continue; }
      var num = /^(\d+\.\d*|\.\d+|\d+)/.exec(src.slice(i, i + 64));
      if (num) { toks.push({ k: 'num', v: Number(num[0]), line: line }); i += num[0].length; continue; }
      var id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i, i + 200));
      if (id) {
        var w = id[0].toLowerCase();
        toks.push({ k: (w === 'function' || w === 'local' || w === 'instance' || w === 'globals' || w === 'global' || w === 'static') ? 'kw' : 'id', v: w, line: line });
        i += id[0].length; continue;
      }
      var op = null;
      for (var o = 0; o < OPS.length; o++) if (src.substr(i, OPS[o].length) === OPS[o]) { op = OPS[o]; break; }
      if (!op) throw new EelError("unexpected '" + c + "'", line);
      toks.push({ k: 'op', v: op, line: line }); i += op.length;
    }
    toks.push({ k: 'eof', line: line });
    return toks;
  }

  // ------------------------------------------------------------ parser ----
  var ASSIGN = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '^=': 1, '|=': 1, '&=': 1, '~=': 1, '<<=': 1, '>>=': 1 };
  var CMP = { '==': 1, '===': 1, '!=': 1, '!==': 1, '<': 1, '>': 1, '<=': 1, '>=': 1 };

  function parse(toks, funcs) {
    var p = 0;
    function peek() { return toks[p]; }
    function at(k, v) { var t = toks[p]; return t.k === k && (v === undefined || t.v === v); }
    function eat(k, v) { if (at(k, v)) return toks[p++]; return null; }
    function expect(k, v) {
      var t = eat(k, v);
      if (!t) { var q = toks[p]; throw new EelError('expected ' + (v || k) + ', got ' + (q.v !== undefined ? q.v : q.k), q.line); }
      return t;
    }

    function program() {
      var items = [];
      for (;;) {
        while (eat('op', ';')) {}
        if (at('eof')) break;
        if (at('kw', 'function')) { func(); continue; }
        items.push(assign());
        if (!at('op', ';') && !at('eof') && !at('kw', 'function')) {
          var t = peek();
          throw new EelError("missing ';' before " + (t.v !== undefined ? t.v : t.k), t.line);
        }
      }
      return { k: 'seq', items: items };
    }
    function func() {
      var line = expect('kw', 'function').line;
      var name = expect('id').v;
      expect('op', '(');
      var params = [];
      while (!at('op', ')')) { params.push(expect('id').v.replace(/\*$/, '')); eat('op', ','); }
      expect('op', ')');
      var locals = [], instance = [], globals = null;
      while (at('kw')) {
        var kw = toks[p++].v;
        expect('op', '(');
        var list = [];
        while (!at('op', ')')) {
          if (at('op', '*')) { p++; list.push('*'); }
          else list.push(expect('id').v.replace(/\*$/, ''));
          eat('op', ',');
        }
        expect('op', ')');
        if (kw === 'local' || kw === 'static') locals = locals.concat(list);
        else if (kw === 'instance') instance = instance.concat(list);
        else globals = (globals || []).concat(list);
      }
      expect('op', '(');
      var body = block();
      expect('op', ')');
      while (eat('op', ';')) {}
      funcs[name] = { name: name, params: params, locals: locals, instance: instance, globals: globals, body: body, line: line };
    }
    function block() {
      var items = [];
      for (;;) {
        while (eat('op', ';')) {}
        if (at('op', ')') || at('eof')) break;
        if (at('kw', 'function')) { func(); continue; }
        items.push(assign());
        if (!at('op', ';')) break;
      }
      while (eat('op', ';')) {}
      return items.length === 1 ? items[0] : { k: 'seq', items: items };
    }
    function arg() {
      var items = [assign()];
      while (at('op', ';')) {
        p++;
        if (at('op', ')') || at('op', ',')) break;
        items.push(assign());
      }
      return items.length === 1 ? items[0] : { k: 'seq', items: items };
    }
    function assign() {
      var lhs = ternary();
      var t = peek();
      if (t.k === 'op' && ASSIGN[t.v]) {
        p++;
        return { k: 'assign', op: t.v, lhs: lhs, rhs: assign(), line: t.line };
      }
      return lhs;
    }
    function ternary() {
      var c = logic();
      if (eat('op', '?')) {
        var a = at('op', ':') ? { k: 'num', v: 0 } : assign();
        var b = null;
        if (eat('op', ':')) b = assign();
        return { k: 'if', c: c, a: a, b: b };
      }
      return c;
    }
    function logic() {
      var n = cmp();
      while (at('op', '&&') || at('op', '||')) n = { k: 'logic', op: toks[p++].v, a: n, b: cmp() };
      return n;
    }
    function cmp() {
      var n = bit();
      while (peek().k === 'op' && CMP[peek().v]) n = { k: 'bin', op: toks[p++].v, a: n, b: bit() };
      return n;
    }
    function bit() {
      var n = add();
      while (at('op', '|') || at('op', '&') || at('op', '~')) n = { k: 'bin', op: toks[p++].v, a: n, b: add() };
      return n;
    }
    function add() {
      var n = mul();
      while (at('op', '+') || at('op', '-')) n = { k: 'bin', op: toks[p++].v, a: n, b: mul() };
      return n;
    }
    function mul() {
      var n = shift();
      while (at('op', '*') || at('op', '/')) n = { k: 'bin', op: toks[p++].v, a: n, b: shift() };
      return n;
    }
    function shift() {
      var n = mod();
      while (at('op', '<<') || at('op', '>>')) n = { k: 'bin', op: toks[p++].v, a: n, b: mod() };
      return n;
    }
    function mod() {
      var n = pow();
      while (at('op', '%')) { p++; n = { k: 'bin', op: '%', a: n, b: pow() }; }
      return n;
    }
    function pow() {
      var n = unary();
      if (at('op', '^')) { p++; return { k: 'bin', op: '^', a: n, b: pow() }; }
      return n;
    }
    function unary() {
      var t = peek();
      if (t.k === 'op' && (t.v === '!' || t.v === '-' || t.v === '+')) { p++; return { k: 'un', op: t.v, a: unary() }; }
      return postfix();
    }
    function postfix() {
      var n = primary();
      while (at('op', '[')) {
        p++;
        var idx = at('op', ']') ? { k: 'num', v: 0 } : assign();
        expect('op', ']');
        n = { k: 'index', base: n, idx: idx };
      }
      return n;
    }
    function primary() {
      var t = toks[p++];
      switch (t.k) {
        case 'num': return { k: 'num', v: t.v };
        case 'str': return { k: 'strlit', v: t.v };
        case 'nstr': return { k: 'nstr', v: t.v };
        case 'tmpstr': return { k: 'tmpstr', id: p };
        case 'op':
          if (t.v === '(') { var b = block(); expect('op', ')'); return b; }
          break;
        case 'id':
          if (at('op', '(')) {
            p++;
            var args = [];
            while (!at('op', ')')) { args.push(arg()); if (!eat('op', ',')) break; }
            expect('op', ')');
            if ((t.v === 'while' || t.v === 'loop') && at('op', '(')) {
              p++; var body = block(); expect('op', ')');
              args.push(body);
            }
            return { k: 'call', name: t.v, args: args, line: t.line };
          }
          return { k: 'var', name: t.v, line: t.line };
      }
      throw new EelError('unexpected ' + (t.v !== undefined ? t.v : t.k), t.line);
    }
    return program();
  }

  // ---------------------------------------------------------- compiler ----
  // Builtins that are plain maths: name -> JS expression template.
  var MATH = {
    sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', asin: 'Math.asin', acos: 'Math.acos',
    atan: 'Math.atan', atan2: 'Math.atan2', sqrt: 'H.sqrt', exp: 'Math.exp', log: 'Math.log',
    log10: 'Math.log10', abs: 'Math.abs', floor: 'Math.floor', ceil: 'Math.ceil',
    min: 'Math.min', max: 'Math.max', pow: 'Math.pow', sign: 'H.sign', invsqrt: 'H.invsqrt',
    sqr: 'H.sqr', rand: 'H.rand', exp2: 'H.exp2'
  };

  function Compiler(slotsOf) {
    this.slots = slotsOf;          // name -> index into v
    this.funcs = {};
    this.compiledFuncs = {};
    this.funcCode = [];
    this.strConsts = [];
    this.temps = 0;
    this.gfx = false;              // compile gfx_* calls for a host to draw
  }
  Compiler.prototype.slot = function (name) {
    var s = this.slots[name];
    if (s === undefined) { s = this.slots.__count++; this.slots[name] = s; }
    return s;
  };

  Compiler.prototype.compileSection = function (code, firstLine) {
    var ast = parse(lex(code, firstLine), this.funcs);
    var saveTemps = this.temps;
    this.temps = 0;
    var body = this.stmts(ast, null, true, 'r');
    var temps = this.tempDecl();
    this.temps = saveTemps;
    return 'var r = 0;' + temps + body + 'return r;';
  };
  Compiler.prototype.tempDecl = function () {
    if (!this.temps) return '';
    var names = [];
    for (var i = 1; i <= this.temps; i++) names.push('t' + i);
    return 'var ' + names.join(', ') + ';';
  };
  Compiler.prototype.temp = function () { this.temps++; return 't' + this.temps; };

  // Names inside a function: parameters, statics, instance variables, or
  // globals. A function called as ns.f() keeps its instance() variables, and
  // anything it names as this.x, in ns: ns.x (REAPER's pseudo-objects).
  Compiler.prototype.ref = function (name, ctx) {
    if (ctx) {
      var pi = ctx.fn.params.indexOf(name);
      if (pi >= 0) return 'p' + pi;
      if (ctx.fn.locals.indexOf(name) >= 0) return 'v[' + this.slot(ctx.fn.name + '::' + name) + ']';
      if (ctx.fn.instance.indexOf(name) >= 0) return 'v[' + this.slot(ctx.ns ? ctx.ns + '.' + name : name) + ']';
    }
    if (name.indexOf('this.') === 0) return 'v[' + this.slot(resolveThis(name, ctx)) + ']';
    return 'v[' + this.slot(name) + ']';
  };
  // this.x, this.child.x: the namespace the function was called in.
  function resolveThis(name, ctx) {
    var ns = ctx && ctx.ns ? ctx.ns : '';
    if (name === 'this') return ns;
    return ns ? ns + '.' + name.slice(5) : name.slice(5);
  }

  function hasControl(n) {
    if (!n || typeof n !== 'object') return false;
    if (n.k === 'call' && (n.name === 'loop' || n.name === 'while')) return true;
    for (var key in n) {
      var c = n[key];
      if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) if (hasControl(c[i])) return true; }
      else if (c && typeof c === 'object' && c.k && hasControl(c)) return true;
    }
    return false;
  }

  // Statements computing `n`; the value lands in `target` when wanted.
  Compiler.prototype.stmts = function (n, ctx, want, target) {
    if (n.k === 'seq') {
      var out = '';
      if (!n.items.length) return want ? target + ' = 0;' : '';
      for (var i = 0; i < n.items.length; i++) {
        var last = i === n.items.length - 1;
        out += this.stmts(n.items[i], ctx, want && last, target);
      }
      return out;
    }
    if (n.k === 'call' && n.name === 'loop') {
      var cnt = this.temp(), ii = this.temp();
      var s = cnt + ' = Math.min(' + MAXLOOP + ', Math.trunc(' + this.expr(n.args[0], ctx) + ')); ';
      if (want) s += target + ' = 0; ';
      s += 'for (' + ii + ' = 0; ' + ii + ' < ' + cnt + '; ' + ii + '++) {' + (n.args[1] ? this.stmts(n.args[1], ctx, want, target) : '') + '}';
      return s;
    }
    if (n.k === 'call' && n.name === 'while') {
      var guard = this.temp(), r = this.temp();
      if (n.args.length >= 2) {
        return guard + ' = 0; ' + (want ? target + ' = 0; ' : '') + 'while (Math.abs(' + this.expr(n.args[0], ctx) + ') >= ' + EPS + ' && ' + guard + '++ < ' + MAXLOOP + ') {' +
          this.stmts(n.args[1], ctx, want, target) + '}';
      }
      return guard + ' = 0; do {' + this.stmts(n.args[0], ctx, true, r) + (want ? target + ' = ' + r + ';' : '') +
        '} while (Math.abs(' + r + ') >= ' + EPS + ' && ++' + guard + ' < ' + MAXLOOP + ');';
    }
    if (n.k === 'if' && hasControl(n)) {
      var o = 'if (Math.abs(' + this.expr(n.c, ctx) + ') >= ' + EPS + ') {' + this.stmts(n.a, ctx, want, target) + '}';
      if (n.b) o += ' else {' + this.stmts(n.b, ctx, want, target) + '}';
      else if (want) o += ' else { ' + target + ' = 0; }';
      return o;
    }
    var e = this.expr(n, ctx);
    return (want ? target + ' = ' + e : e) + ';';
  };

  function T(e) { return '(Math.abs(' + e + ') >= ' + EPS + ')'; }

  Compiler.prototype.expr = function (n, ctx) {
    var self = this;
    // A loop inside an expression: the statements holding it run in a
    // closure. Only a loop, a sequence or a conditional is one; anything else
    // compiles its parts, each of which takes its own closure if it needs one.
    if (hasControl(n) && (n.k === 'seq' || n.k === 'if' || (n.k === 'call' && (n.name === 'loop' || n.name === 'while')))) {
      return '(() => { var rr = 0; ' + this.stmts(n, ctx, true, 'rr') + ' return rr; })()';
    }
    switch (n.k) {
      case 'raw': return n.code;
      case 'num': return n.v < 0 ? '(' + String(n.v) + ')' : String(n.v);
      case 'strlit': return String(this.strConst(n.v));
      case 'nstr': return 'S.named(' + JSON.stringify(n.v) + ')';
      case 'tmpstr': return 'S.tempStr(' + n.id + ')';
      case 'var': return this.varRead(n.name, ctx);
      case 'seq': {
        if (!n.items.length) return '0';
        return '(' + n.items.map(function (x) { return self.expr(x, ctx); }).join(', ') + ')';
      }
      case 'if':
        return '(' + T(this.expr(n.c, ctx)) + ' ? ' + this.expr(n.a, ctx) + ' : ' + (n.b ? this.expr(n.b, ctx) : '0') + ')';
      case 'logic': {
        var a = T(this.expr(n.a, ctx)), b = T(this.expr(n.b, ctx));
        return '((' + a + (n.op === '&&' ? ' && ' : ' || ') + b + ') ? 1 : 0)';
      }
      case 'un':
        if (n.op === '!') return '(' + T(this.expr(n.a, ctx)) + ' ? 0 : 1)';
        if (n.op === '-') return '(-' + this.expr(n.a, ctx) + ')';
        return this.expr(n.a, ctx);
      case 'bin': return this.binary(n.op, this.expr(n.a, ctx), this.expr(n.b, ctx));
      case 'index': return this.memRead(n, ctx);
      case 'assign': return this.assignment(n, ctx);
      case 'call': return this.call(n, ctx);
    }
    throw new EelError('cannot compile ' + n.k);
  };

  Compiler.prototype.binary = function (op, a, b) {
    switch (op) {
      case '+': return '(' + a + ' + ' + b + ')';
      case '-': return '(' + a + ' - ' + b + ')';
      case '*': return '(' + a + ' * ' + b + ')';
      case '/': return '(' + a + ' / ' + b + ')';
      case '%': return 'H.mod(' + a + ', ' + b + ')';
      case '^': return 'Math.pow(' + a + ', ' + b + ')';
      case '<<': return 'H.shl(' + a + ', ' + b + ')';
      case '>>': return 'H.shr(' + a + ', ' + b + ')';
      case '|': return 'H.bor(' + a + ', ' + b + ')';
      case '&': return 'H.band(' + a + ', ' + b + ')';
      case '~': return 'H.bxor(' + a + ', ' + b + ')';
      case '==': return '(Math.abs(' + a + ' - ' + b + ') < ' + EPS + ' ? 1 : 0)';
      case '!=': return '(Math.abs(' + a + ' - ' + b + ') < ' + EPS + ' ? 0 : 1)';
      case '===': return '(' + a + ' === ' + b + ' ? 1 : 0)';
      case '!==': return '(' + a + ' !== ' + b + ' ? 1 : 0)';
      case '<': case '>': case '<=': case '>=': return '(' + a + ' ' + op + ' ' + b + ' ? 1 : 0)';
    }
    throw new EelError('bad operator ' + op);
  };

  Compiler.prototype.strConst = function (s) {
    var i = this.strConsts.indexOf(s);
    if (i < 0) { i = this.strConsts.length; this.strConsts.push(s); }
    return 10000 + i;
  };

  Compiler.prototype.varRead = function (name, ctx) {
    if (name === 'gmem') return 'S.gmemBase';
    return this.ref(name, ctx);
  };

  Compiler.prototype.address = function (n, ctx) {
    if (n.base.k === 'var' && n.base.name === 'gmem') return { gmem: true, addr: this.expr(n.idx, ctx) };
    var base = this.expr(n.base, ctx);
    var idx = n.idx.k === 'num' && n.idx.v === 0 ? null : this.expr(n.idx, ctx);
    return { gmem: false, addr: idx === null ? base : '(' + base + ' + ' + idx + ')' };
  };
  Compiler.prototype.memRead = function (n, ctx) {
    var a = this.address(n, ctx);
    if (a.gmem) return 'S.grd(' + a.addr + ')';
    // Inline: a typed array read out of range is undefined, which || makes 0.
    return '(M[(' + a.addr + ' + ' + EPS + ') | 0] || 0)';
  };

  var COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^', '|=': '|', '&=': '&', '~=': '~', '<<=': '<<', '>>=': '>>' };

  Compiler.prototype.assignment = function (n, ctx) {
    var self = this;
    var lhs = n.lhs, rhs = this.expr(n.rhs, ctx);
    function value(cur) { return n.op === '=' ? rhs : self.binary(COMPOUND[n.op], cur, rhs); }
    if (lhs.k === 'var') {
      var r = this.ref(lhs.name, ctx);
      return '(' + r + ' = ' + value(r) + ')';
    }
    if (lhs.k === 'index') {
      var a = this.address(lhs, ctx), t = this.temp();
      var rdf = a.gmem ? 'S.grd' : 'rd', wrf = a.gmem ? 'S.gwr' : 'wr';
      return '(' + t + ' = ' + a.addr + ', ' + wrf + '(' + t + ', ' + value(rdf + '(' + t + ')') + '))';
    }
    if (lhs.k === 'if') {
      var tv = this.temp();
      var asg = function (side) { return side ? self.assignment({ k: 'assign', op: '=', lhs: side, rhs: { k: 'raw', code: tv } }, ctx) : '0'; };
      if (n.op !== '=') throw new EelError('compound assignment to a conditional is not supported');
      return '(' + tv + ' = ' + rhs + ', ' + T(this.expr(lhs.c, ctx)) + ' ? ' + asg(lhs.a) + ' : ' + asg(lhs.b) + ')';
    }
    if (lhs.k === 'nstr' || lhs.k === 'strlit') {
      return 'S.strcpy(' + this.expr(lhs, ctx) + ', ' + rhs + ')';
    }
    if (lhs.k === 'call' && lhs.name === 'slider') {
      var si = this.temp();
      return '(' + si + ' = ' + this.expr(lhs.args[0], ctx) + ', S.setSliderByIndex(' + si + ', ' + value('S.sliderByIndex(' + si + ')') + '))';
    }
    if (lhs.k === 'seq' && lhs.items.length) {
      var head = lhs.items.slice(0, -1).map(function (x) { return self.expr(x, ctx); });
      return '(' + head.concat([this.assignment({ k: 'assign', op: n.op, lhs: lhs.items[lhs.items.length - 1], rhs: n.rhs }, ctx)]).join(', ') + ')';
    }
    throw new EelError('cannot assign to ' + lhs.k);
  };

  // A variable passed by reference (midirecv, file_var): its JS lvalue.
  Compiler.prototype.lvalue = function (n, ctx) {
    if (n.k === 'var') return this.ref(n.name, ctx);
    return null;
  };

  Compiler.prototype.call = function (n, ctx) {
    var self = this, name = n.name, args = n.args;
    function A(i) { return args[i] === undefined ? '0' : self.expr(args[i], ctx); }
    function all() { return args.map(function (x) { return self.expr(x, ctx); }).join(', '); }
    if (MATH[name]) return MATH[name] + '(' + all() + ')';
    switch (name) {
      case 'midirecv': {
        var lv = args.map(function (x) { return self.lvalue(x, ctx); });
        var sets = [];
        for (var i = 0; i < lv.length; i++) {
          if (!lv[i]) continue;
          var src = lv.length >= 4 ? 'S.mr[' + i + ']' : (i === 2 ? '(S.mr[2] + S.mr[3] * 256)' : 'S.mr[' + i + ']');
          sets.push(lv[i] + ' = ' + src);
        }
        return '(S.midirecv() ? (' + (sets.length ? sets.join(', ') + ', ' : '') + 'S.mr[1]) : 0)';
      }
      case 'midisend':
        if (args.length >= 4) return 'S.midisend(' + A(0) + ', ' + A(1) + ', ' + A(2) + ', ' + A(3) + ')';
        return 'S.midisend3(' + A(0) + ', ' + A(1) + ', ' + A(2) + ')';
      case 'midisend_buf': return 'S.midisendBuf(' + A(0) + ', ' + A(1) + ', ' + A(2) + ')';
      case 'midisyx': return 'S.midisendBuf(' + A(0) + ', ' + A(1) + ', ' + A(2) + ')';
      case 'file_var': {
        var fv = this.lvalue(args[1], ctx);
        if (!fv) return 'S.fileVar(' + A(0) + ', ' + A(1) + ')';
        return '(' + fv + ' = S.fileVar(' + A(0) + ', ' + fv + '))';
      }
      case 'file_riff': {
        // channels and sample rate come back through the arguments
        var nc = this.lvalue(args[1], ctx), fr = this.lvalue(args[2], ctx);
        var t0 = this.temp();
        return '(' + t0 + ' = S.fileRiff(' + A(0) + ')' + (nc ? ', ' + nc + ' = S.riff[0]' : '') + (fr ? ', ' + fr + ' = S.riff[1]' : '') + ', ' + t0 + ')';
      }
      case 'slider': return 'S.sliderByIndex(' + A(0) + ')';
      case 'loop': case 'while':
        return '(() => { var rr = 0; ' + this.stmts(n, ctx, true, 'rr') + ' return rr; })()';
      case 'match': case 'matchi': {
        var refs = args.slice(2).map(function (x) { return self.lvalue(x, ctx); });
        var call = 'S.match(' + (name === 'matchi' ? 'true' : 'false') + ', ' + A(0) + ', ' + A(1) + ')';
        if (!refs.length) return call;
        var tm = this.temp();
        var assigns = refs.map(function (r, k) { return r ? r + ' = S.matchOut[' + k + ']' : ''; }).filter(Boolean);
        return '(' + tm + ' = ' + call + ', ' + tm + ' ? (' + (assigns.length ? assigns.join(', ') + ', ' : '') + '1) : 0)';
      }
    }
    if (this.funcs[name]) return this.userCall(this.funcs[name], args, ctx, '');
    if (name.indexOf('.') > 0) {
      var base = name.slice(name.lastIndexOf('.') + 1), prefix = name.slice(0, name.lastIndexOf('.'));
      if (this.funcs[base]) return this.userCall(this.funcs[base], args, ctx, prefix === 'this' || prefix.indexOf('this.') === 0 ? resolveThis(prefix, ctx) : prefix);
    }
    if (/^gfx_|^mouse_/.test(name)) {
      if (!this.gfx) return '(' + (args.length ? all() + ', ' : '') + '0)';
      // Width and height come back through the arguments, as file_riff's do.
      if (name === 'gfx_measurestr' || name === 'gfx_measurechar' || name === 'gfx_getimgdim') {
        var mw = this.lvalue(args[1] || { k: 'num', v: 0 }, ctx), mh = this.lvalue(args[2] || { k: 'num', v: 0 }, ctx);
        var tg = this.temp();
        return '(' + tg + ' = S.call(' + JSON.stringify(name) + ', ' + A(0) + ')' + (mw ? ', ' + mw + ' = S.gm[0]' : '') +
               (mh ? ', ' + mh + ' = S.gm[1]' : '') + ', ' + tg + ')';
      }
    }
    return 'S.call(' + JSON.stringify(name) + (args.length ? ', ' + all() : '') + ')';
  };

  // One compiled copy per function and namespace, as EEL2 does: a.f() and
  // b.f() are two functions, each with its own instance variables.
  Compiler.prototype.userCall = function (fn, args, ctx, ns) {
    var self = this;
    ns = ns || '';
    if (args.length !== fn.params.length && !(args.length === 1 && fn.params.length === 0)) {
      // EEL2 refuses the wrong number of arguments at compile time.
      throw new EelError(fn.name + '() takes ' + fn.params.length + ' arguments, given ' + args.length);
    }
    var jsName = 'F_' + fn.name.replace(/\./g, '_') + (ns ? '$' + ns.replace(/\./g, '$') : '');
    var key = fn.name + '@' + ns;
    if (!this.compiledFuncs[key]) {
      this.compiledFuncs[key] = true;
      var saved = this.temps;
      this.temps = 0;
      var body = this.stmts(fn.body, { fn: fn, ns: ns }, true, 'r');
      var temps = this.tempDecl();
      this.temps = saved;
      var params = fn.params.map(function (_, i) { return 'p' + i; });
      this.funcCode.push('function ' + jsName + '(' + params.join(', ') + ') { var r = 0;' + temps + body + ' return r; }');
    }
    return jsName + '(' + args.slice(0, fn.params.length).map(function (x) { return self.expr(x, ctx); }).join(', ') + ')';
  };

  // ----------------------------------------------------------- helpers ----
  function i64(x) { return Math.trunc(x); }
  function bigOp(a, b, f) { return Number(BigInt.asIntN(64, f(BigInt(i64(a)), BigInt(i64(b))))); }
  var H = {
    sqrt: function (x) { return Math.sqrt(Math.abs(x)); },
    sign: function (x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); },
    invsqrt: function (x) { return 1 / Math.sqrt(x); },
    sqr: function (x) { return x * x; },
    exp2: function (x) { return Math.pow(2, x); },
    rand: function (x) { return Math.random() * (x === undefined ? 1 : x); },
    mod: function (a, b) {
      var ib = Math.trunc(Math.abs(b));
      return ib ? Math.trunc(Math.abs(a)) % ib : 0;
    },
    shl: function (a, b) { return bigOp(a, b, function (x, y) { return x << (y & 63n); }); },
    shr: function (a, b) { return bigOp(a, b, function (x, y) { return x >> (y & 63n); }); },
    bor: function (a, b) {
      if (Math.abs(a) < 2147483648 && Math.abs(b) < 2147483648) return (i64(a) | i64(b));
      return bigOp(a, b, function (x, y) { return x | y; });
    },
    band: function (a, b) {
      if (Math.abs(a) < 2147483648 && Math.abs(b) < 2147483648) return (i64(a) & i64(b));
      return bigOp(a, b, function (x, y) { return x & y; });
    },
    bxor: function (a, b) {
      if (Math.abs(a) < 2147483648 && Math.abs(b) < 2147483648) return (i64(a) ^ i64(b));
      return bigOp(a, b, function (x, y) { return x ^ y; });
    }
  };

  // C's %f: the double's exact decimal value, rounded half to even.
  var F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  function toFixedC(x, f) {
    if (!isFinite(x)) return String(x);
    var neg = x < 0; F64[0] = Math.abs(x);
    var hi = U32[1], lo = U32[0], exp = (hi >>> 20) & 0x7ff;
    var mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    if (exp === 0) exp = 1; else mant |= 1n << 52n;
    var e = exp - 1075, D, sc;
    if (e >= 0) { D = mant << BigInt(e); sc = 0; } else { D = mant * (5n ** BigInt(-e)); sc = -e; }
    var q;
    if (f >= sc) q = D * (10n ** BigInt(f - sc));
    else {
      var div = 10n ** BigInt(sc - f); q = D / div; var r2 = (D % div) * 2n;
      if (r2 > div || (r2 === div && (q & 1n) === 1n)) q += 1n;
    }
    var s = q.toString();
    if (f > 0) { while (s.length <= f) s = '0' + s; s = s.slice(0, s.length - f) + '.' + s.slice(s.length - f); }
    return (neg && /[1-9]/.test(s) ? '-' : (neg ? '-' : '')) + s;
  }

  // EEL2's sprintf, on doubles.
  function eelFormat(fmt, values) {
    var vi = 0;
    return fmt.replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?([dixXfgecs%])/g, function (all, flags, width, prec, conv) {
      if (conv === '%') return '%';
      var v = values[vi++], s;
      if (v === undefined) v = 0;
      switch (conv) {
        case 'd': case 'i': s = String(Math.trunc(v.num !== undefined ? v.num : v)); break;
        case 'x': s = (Math.trunc(v) >>> 0).toString(16); break;
        case 'X': s = (Math.trunc(v) >>> 0).toString(16).toUpperCase(); break;
        case 'f': s = toFixedC(Number(v), prec === undefined ? 6 : Number(prec)); break;
        case 'e': s = Number(v).toExponential(prec === undefined ? 6 : Number(prec)); break;
        case 'g': s = String(Number(Number(v).toPrecision(prec === undefined ? 6 : Math.max(1, Number(prec))))); break;
        case 'c': s = String.fromCharCode(Math.trunc(v)); break;
        case 's': s = v.str !== undefined ? v.str : String(v); break;
      }
      if (flags.indexOf('+') >= 0 && conv !== 's' && Number(v) >= 0) s = '+' + s;
      var w = Number(width || 0);
      while (s.length < w) s = flags.indexOf('-') >= 0 ? s + ' ' : (flags.indexOf('0') >= 0 && conv !== 's' ? '0' + s : ' ' + s);
      return s;
    });
  }

  // ---------------------------------------------------------- instance ----
  function JSFX(text, opts) {
    opts = opts || {};
    this.file = parseFile(text, opts.readImport);
    this.srate = opts.sampleRate || 48000;
    this.slots = { __count: 0 };
    var self = this;
    var C = new Compiler(this.slots);
    C.gfx = !!opts.gfx;
    // Predeclare what the host reads and writes.
    ['srate', 'samplesblock', 'tempo', 'play_state', 'play_position', 'beat_position', 'ts_num', 'ts_denom',
     'num_ch', 'trigger', 'pdc_delay', 'pdc_bot_ch', 'pdc_top_ch', 'pdc_midi', 'ext_noinit', 'ext_nodenorm',
     'ext_midi_bus', 'midi_bus', 'gfx_ext_retina'].forEach(function (n) { C.slot(n); });
    for (var c = 0; c < 64; c++) C.slot('spl' + c);
    for (var s = 1; s <= 64; s++) C.slot('slider' + s);
    this.file.sliders.forEach(function (sl) { C.slot(sl.variable); });
    if (C.gfx) ['gfx_r', 'gfx_g', 'gfx_b', 'gfx_a', 'gfx_a2', 'gfx_x', 'gfx_y', 'gfx_w', 'gfx_h', 'gfx_texth', 'gfx_mode', 'gfx_clear',
                'gfx_dest', 'gfx_ext_flags', 'mouse_x', 'mouse_y', 'mouse_cap', 'mouse_wheel', 'mouse_hwheel'].forEach(function (n) { C.slot(n); });

    var sections = {};
    ['init', 'slider', 'block', 'sample', 'serialize'].concat(C.gfx ? ['gfx'] : []).forEach(function (name) {
      var parts = self.file.sections[name];
      if (!parts.length) return;
      sections[name] = parts.map(function (part) { return C.compileSection(part.code, part.line); });
    });
    // @gfx is parsed for its functions only, so @init code that calls a
    // helper defined there still compiles.
    if (!C.gfx) this.file.sections.gfx.forEach(function (part) {
      try { parse(lex(part.code, part.line), C.funcs); } catch (e) { /* the window is not run */ }
    });

    // Room for names a later eval() adds: the generated code holds on to v.
    this.v = new Float64Array(this.slots.__count + 4096);
    this.strConsts = C.strConsts;
    var src = [];
    src.push('"use strict";');
    // Memory is one Float64Array that doubles when written past its end, up
    // to EEL2's 8M words; rd and wr sit beside it so V8 can inline them.
    src.push('var v = S.v, M = new Float64Array(' + BLOCK + ');');
    src.push('function rd(a) { var i = (a + ' + EPS + ') | 0; return (i >= 0 && i < M.length) ? M[i] : 0; }');
    src.push('function wr(a, x) { var i = (a + ' + EPS + ') | 0; if (i >= 0 && i < M.length) { M[i] = x; return x; } return grow(i, x); }');
    src.push('function grow(i, x) { if (i < 0 || i >= ' + (BLOCK * NBLOCKS) + ') return x; var n = M.length; while (n <= i) n *= 2;' +
             ' var N = new Float64Array(Math.min(n, ' + (BLOCK * NBLOCKS) + ')); N.set(M); M = N; M[i] = x; return x; }');
    src.push('S.rd = rd; S.wr = wr; S.clearMem = function () { M = new Float64Array(' + BLOCK + '); };');
    // Code compiled later (eval) runs in this scope, beside M, v and the helpers.
    src.push('S.evalIn = function (code) { return eval(code); };');
    src.push(C.funcCode.join('\n'));
    Object.keys(sections).forEach(function (name) {
      src.push('S.sec_' + name + ' = [' + sections[name].map(function (b) { return 'function () {' + b + '}'; }).join(',\n') + '];');
    });
    this.code = src.join('\n');
    this.reset();
    new Function('S', 'H', this.code)(this, H);
  }

  JSFX.prototype.reset = function () {
    this.v.fill(0);
    this.mem = new Array(NBLOCKS);
    this.gmem = NS.sharedGmem || (NS.sharedGmem = {});
    this.gmemName = (/gmem=(\S+)/.exec(this.file.options) || [])[1] || '';
    this.strings = {};
    this.namedIds = {};
    this.nextNamed = 90000;
    this.midiIn = []; this.midiInPos = 0; this.midiOut = [];
    this.mr = [0, 0, 0, 0];
    this.matchOut = [];
    this.serial = null;
    this.blockCount = 0;
    this.sliderDirty = true;
    this.sampleFrame = 0;
    var self = this;
    if (this.clearMem) this.clearMem();
    this.file.sliders.forEach(function (sl) { self.v[self.slots[sl.variable]] = sl.def; });
  };

  JSFX.prototype.slot = function (name) { return this.slots[name.toLowerCase()]; };
  JSFX.prototype.getVar = function (name) { var s = this.slot(name); return s === undefined ? 0 : this.v[s]; };
  JSFX.prototype.setVar = function (name, val) { var s = this.slot(name); if (s !== undefined) this.v[s] = val; };

  JSFX.prototype.sliderVar = function (n) {
    for (var i = 0; i < this.file.sliders.length; i++) if (this.file.sliders[i].index === n) return this.file.sliders[i].variable;
    return 'slider' + n;
  };
  JSFX.prototype.sliderByIndex = function (n) { return this.v[this.slots[this.sliderVar(Math.trunc(n))]] || 0; };
  JSFX.prototype.setSliderByIndex = function (n, val) { this.v[this.slots[this.sliderVar(Math.trunc(n))]] = val; return val; };
  JSFX.prototype.getSlider = function (n) { return this.sliderByIndex(n); };
  JSFX.prototype.setSlider = function (n, val) {
    this.setSliderByIndex(n, val);
    this.sliderDirty = true;
  };

  JSFX.prototype.runSection = function (name) {
    var list = this['sec_' + name];
    if (!list) return 0;
    var r = 0;
    for (var i = 0; i < list.length; i++) r = list[i]();
    return r;
  };

  JSFX.prototype.setTime = function (t) {
    var v = this.v, s = this.slots;
    if (t.tempo !== undefined) v[s.tempo] = t.tempo;
    if (t.playState !== undefined) v[s.play_state] = t.playState;
    if (t.beat !== undefined) v[s.beat_position] = t.beat;
    if (t.seconds !== undefined) v[s.play_position] = t.seconds;
    if (t.num !== undefined) v[s.ts_num] = t.num;
    if (t.den !== undefined) v[s.ts_denom] = t.den;
  };

  JSFX.prototype.init = function (sampleRate) {
    if (sampleRate) this.srate = sampleRate;
    var keep = this.file.sliders.map(function (sl) { return this.v[this.slots[sl.variable]]; }, this);
    this.reset();
    this.file.sliders.forEach(function (sl, i) { this.v[this.slots[sl.variable]] = keep[i]; }, this);
    var v = this.v, s = this.slots;
    v[s.srate] = this.srate;
    v[s.num_ch] = Math.max(this.file.inPins.length, this.file.outPins.length);
    v[s.tempo] = v[s.tempo] || 120; v[s.ts_num] = v[s.ts_num] || 4; v[s.ts_denom] = v[s.ts_denom] || 4;
    this.runSection('init');
    this.runSection('slider');
    this.sliderDirty = false;
    this.initialised = true;
  };

  /* One block: `inputs`/`outputs` are arrays of Float32Array per channel (or
   * null for a MIDI-only device), `midi` is [{offset, data:[b1,b2,b3]}]
   * sorted by offset. Returns the MIDI sent, with offsets. */
  JSFX.prototype.process = function (n, inputs, outputs, midi) {
    if (!this.initialised) this.init();
    var v = this.v, s = this.slots;
    if (this.sliderDirty) { this.sliderDirty = false; this.runSection('slider'); }
    v[s.samplesblock] = n;
    this.midiIn = midi || [];
    this.midiInPos = 0;
    this.midiOut = [];
    this.runSection('block');
    var sec = this.sec_sample;
    if (sec && sec.length) {
      var nIn = inputs ? inputs.length : 0, nOut = outputs ? outputs.length : 0;
      var nch = Math.max(nIn, nOut, 2);
      var spl = [];
      for (var c = 0; c < nch; c++) spl.push(s['spl' + c]);
      for (var i = 0; i < n; i++) {
        this.sampleFrame = i;
        for (var ci = 0; ci < nch; ci++) v[spl[ci]] = ci < nIn && inputs[ci] ? inputs[ci][i] : 0;
        for (var k = 0; k < sec.length; k++) sec[k]();
        for (var co = 0; co < nOut; co++) if (outputs[co]) outputs[co][i] = v[spl[co]];
      }
    } else if (outputs && inputs) {
      for (var ch = 0; ch < outputs.length; ch++) if (outputs[ch] && inputs[ch]) outputs[ch].set(inputs[ch]);
    }
    // MIDI a plug-in did not read passes through, as in REAPER.
    for (var r = this.midiInPos; r < this.midiIn.length; r++) this.midiOut.push(this.midiIn[r]);
    this.blockCount++;
    var out = this.midiOut;
    out.sort(function (a, b) { return a.offset - b.offset; });
    return out;
  };

  // ------------------------------------------------------- the host API --
  JSFX.prototype.midirecv = function () {
    if (this.midiInPos >= this.midiIn.length) return 0;
    var ev = this.midiIn[this.midiInPos++];
    this.mr[0] = ev.offset; this.mr[1] = ev.data[0]; this.mr[2] = ev.data[1] || 0; this.mr[3] = ev.data[2] || 0;
    return 1;
  };
  JSFX.prototype.midisend = function (offset, b1, b2, b3) {
    this.midiOut.push({ offset: Math.max(0, Math.trunc(offset)), data: [Math.trunc(b1) & 255, Math.trunc(b2) & 127, Math.trunc(b3) & 127] });
    return b1;
  };
  JSFX.prototype.midisend3 = function (offset, b1, b23) {
    b23 = Math.trunc(b23);
    return this.midisend(offset, b1, b23 & 255, (b23 >> 8) & 255);
  };
  JSFX.prototype.midisendBuf = function (offset, buf, len) {
    var data = [];
    for (var i = 0; i < len; i++) data.push(Math.trunc(this.rd(buf + i)) & 255);
    this.midiOut.push({ offset: Math.max(0, Math.trunc(offset)), data: data });
    return len;
  };

  JSFX.prototype.grd = function (a) { var g = this.gmem[this.gmemName]; if (!g) return 0; var i = (a + EPS) | 0; return g[i] || 0; };
  JSFX.prototype.gwr = function (a, val) {
    var g = this.gmem[this.gmemName] || (this.gmem[this.gmemName] = {});
    g[(a + EPS) | 0] = val; return val;
  };

  // Strings: literals are 10000+, named strings 90000+, slots 0-1023 free.
  JSFX.prototype.str = function (id) {
    id = Math.trunc(id);
    if (id >= 10000 && id < 90000) return this.strConsts[id - 10000] || '';
    return this.strings[id] || '';
  };
  JSFX.prototype.setStr = function (id, s) { this.strings[Math.trunc(id)] = s; return id; };
  JSFX.prototype.named = function (name) {
    var id = this.namedIds[name];
    if (id === undefined) { id = this.namedIds[name] = this.nextNamed++; this.strings[id] = ''; }
    return id;
  };
  JSFX.prototype.tempStr = function (site) { var id = 200000 + site; if (this.strings[id] === undefined) this.strings[id] = ''; return id; };
  JSFX.prototype.strcpy = function (d, s) { return this.setStr(d, this.str(s)); };
  JSFX.prototype.match = function (ci, pat, sid) {
    var p = this.str(pat), s = this.str(sid);
    var re = '^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(re, ci ? 'i' : '').test(s) ? 1 : 0;
  };

  JSFX.prototype.riff = [0, 0];
  JSFX.prototype.fileRiff = function (h) {
    var f = this.files && this.files[Math.trunc(h)];
    this.riff = f ? [f.channels, f.rate] : [0, 0];
    return f ? 1 : 0;
  };
  // One frame of @gfx, drawn by `host`: an object with a method per gfx_*
  // function (each called with the JSFX first), as the Ableton devices give.
  // `w`, `h` and `mouse` ({x, y, cap, wheel, hwheel}) are what REAPER sets.
  JSFX.prototype.runGfx = function (host, w, h, mouse) {
    if (!this.sec_gfx) return 0;
    if (!this.initialised) this.init();
    var v = this.v, s = this.slots;
    this.gfxHost = host;
    v[s.gfx_w] = w; v[s.gfx_h] = h;
    if (mouse) {
      v[s.mouse_x] = mouse.x; v[s.mouse_y] = mouse.y; v[s.mouse_cap] = mouse.cap;
      if (mouse.wheel) v[s.mouse_wheel] += mouse.wheel;
      if (mouse.hwheel) v[s.mouse_hwheel] += mouse.hwheel;
    }
    return this.runSection('gfx');
  };
  JSFX.prototype.gm = [0, 0];

  JSFX.prototype.call = function (name) {
    var a = Array.prototype.slice.call(arguments, 1);
    if (this.gfxHost && this.gfxHost[name]) return +this.gfxHost[name].apply(this.gfxHost, [this].concat(a)) || 0;
    var f = BUILTINS[name];
    if (!f) {
      if (!this.warned) this.warned = {};
      if (!this.warned[name] && typeof console !== 'undefined') { this.warned[name] = true; console.warn('JSFX: no ' + name + '()'); }
      return 0;
    }
    return f.apply(this, a);
  };

  // @serialize: values written in order, read back in order.
  JSFX.prototype.fileVar = function (h, cur) {
    h = Math.trunc(h);
    if (h === 0 && this.serial) {
      if (this.serial.mode === 'write') { this.serial.data.push(cur); return cur; }
      var d = this.serial.data[this.serial.pos++];
      return d === undefined ? cur : (typeof d === 'number' ? d : cur);
    }
    var f = this.files && this.files[h];
    if (f && f.pos < f.values.length) return f.values[f.pos++];
    return cur;
  };
  JSFX.prototype.serialize = function () {
    this.serial = { mode: 'write', data: [], pos: 0 };
    this.runSection('serialize');
    var data = this.serial.data;
    this.serial = null;
    return { sliders: this.file.sliders.map(function (sl) { return this.v[this.slots[sl.variable]]; }, this), data: data };
  };
  JSFX.prototype.deserialize = function (state) {
    if (!state) return;
    if (!this.initialised) this.init();
    if (state.sliders) this.file.sliders.forEach(function (sl, i) {
      if (state.sliders[i] !== undefined) this.v[this.slots[sl.variable]] = state.sliders[i];
    }, this);
    this.serial = { mode: 'read', data: state.data || [], pos: 0 };
    this.runSection('serialize');
    this.serial = null;
    this.sliderDirty = true;
  };

  // Run a line of EEL2 against this instance: how a device's own buttons
  // (Panic, Transfer to Pads...) are pressed from Middaw's controls.
  JSFX.prototype.eval = function (code) {
    var C = new Compiler(this.slots);
    C.gfx = !!opts.gfx;
    C.strConsts = this.strConsts;
    // reuse the instance's functions by recompiling them into this snippet
    var funcs = {};
    var self = this;
    ['init', 'slider', 'block', 'sample', 'serialize', 'gfx'].forEach(function (name) {
      self.file.sections[name].forEach(function (part) { try { parse(lex(part.code, part.line), funcs); } catch (e) {} });
    });
    C.funcs = funcs;
    var body = C.compileSection(code, 1);
    var fn = this.evalIn('(function () {' + C.funcCode.join('\n') + ' return function () {' + body + '}; })()');
    if (this.slots.__count > this.v.length) throw new EelError('too many new variables in eval');
    return fn();
  };

  var BUILTINS = {
    memset: function (d, val, n) { for (var i = 0; i < n; i++) this.wr(d + i, val); return d; },
    memcpy: function (d, s, n) {
      var tmp = [];
      for (var i = 0; i < n; i++) tmp.push(this.rd(s + i));
      for (var j = 0; j < n; j++) this.wr(d + j, tmp[j]);
      return d;
    },
    freembuf: function (n) { return n; },
    mem_set_values: function () { return 0; },
    time: function () { return Math.floor(Date.now() / 1000); },
    time_precise: function () { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; },
    sliderchange: function () { if (this.onSliderChange) this.onSliderChange(); return 0; },
    slider_automate: function () { if (this.onSliderChange) this.onSliderChange(); return 0; },
    slider_show: function () { return 0; },
    strlen: function (s) { return this.str(s).length; },
    strcpy: function (d, s) { return this.setStr(d, this.str(s)); },
    strcat: function (d, s) { return this.setStr(d, this.str(d) + this.str(s)); },
    strcmp: function (a, b) { var x = this.str(a), y = this.str(b); return x < y ? -1 : x > y ? 1 : 0; },
    stricmp: function (a, b) { var x = this.str(a).toLowerCase(), y = this.str(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; },
    strncpy: function (d, s, n) { return this.setStr(d, this.str(s).slice(0, n)); },
    strcpy_substr: function (d, s, off, len) {
      var str = this.str(s);
      if (off < 0) off = Math.max(0, str.length + off);
      return this.setStr(d, len === undefined ? str.slice(off) : str.substr(off, Math.max(0, len)));
    },
    str_getchar: function (s, i) { var str = this.str(s); if (i < 0) i += str.length; return i >= 0 && i < str.length ? str.charCodeAt(i) : 0; },
    str_setchar: function (s, i, c) {
      var str = this.str(s); if (i < 0) i += str.length;
      if (i >= 0 && i <= str.length) this.setStr(s, str.slice(0, i) + String.fromCharCode(c) + str.slice(i + 1));
      return c;
    },
    sprintf: function (d, fmt) {
      var self = this, vals = Array.prototype.slice.call(arguments, 2);
      var f = this.str(fmt);
      // %s takes a string handle
      var vi = 0;
      var mapped = [];
      f.replace(/%[-+ 0#]*\d*(?:\.\d+)?([dixXfgecs%])/g, function (all, conv) {
        if (conv === '%') return all;
        var x = vals[vi++];
        mapped.push(conv === 's' ? { str: self.str(x) } : x);
        return all;
      });
      return this.setStr(d, eelFormat(f, mapped));
    },
    file_open: function (s) {
      var name = this.str(s);
      var vals = this.openFile ? this.openFile(name) : null;
      if (!vals) return -1;
      if (!this.files) { this.files = {}; this.nextFile = 1; }
      var h = this.nextFile++;
      this.files[h] = { values: vals.samples || vals, pos: 0, channels: vals.channels || 1, rate: vals.rate || this.srate };
      return h;
    },
    file_close: function (h) { if (this.files) delete this.files[h]; return 0; },
    file_rewind: function (h) { if (this.files && this.files[h]) this.files[h].pos = 0; return 0; },
    file_avail: function (h) {
      h = Math.trunc(h);
      if (h === 0 && this.serial) return this.serial.mode === 'write' ? -1 : this.serial.data.length - this.serial.pos;
      var f = this.files && this.files[h];
      return f ? f.values.length - f.pos : 0;
    },
    file_riff: function () { return 0; },
    file_text: function () { return 0; },
    file_mem: function (h, addr, n) {
      h = Math.trunc(h);
      if (h === 0 && this.serial) {
        if (this.serial.mode === 'write') { for (var i = 0; i < n; i++) this.serial.data.push(this.rd(addr + i)); }
        else { for (var j = 0; j < n; j++) { var d = this.serial.data[this.serial.pos++]; this.wr(addr + j, typeof d === 'number' ? d : 0); } }
        return n;
      }
      var f = this.files && this.files[h];
      if (!f) return 0;
      var k = 0;
      for (; k < n && f.pos < f.values.length; k++) this.wr(addr + k, f.values[f.pos++]);
      return k;
    },
    file_string: function (h, s) {
      h = Math.trunc(h);
      if (h === 0 && this.serial) {
        if (this.serial.mode === 'write') this.serial.data.push({ s: this.str(s) });
        else { var d = this.serial.data[this.serial.pos++]; if (d && d.s !== undefined) this.setStr(s, d.s); }
      }
      return 1;
    },
    export_buffer_to_project: function () { return this.exportBuffer ? this.exportBuffer.apply(this, arguments) : 0; },
    get_host_placement: function () { return 0; },
    get_host_numchan: function () { return 2; },
    set_host_numchan: function () { return 0; },
    get_pin_mapping: function () { return 0; },
    set_pdc: function () { return 0; },
    printf: function () { return 0; },
    gfx_getchar: function () { return 0; }
  };

  NS.JSFX = JSFX;
  NS.parseFile = parseFile;
  NS.parseSliderLine = parseSliderLine;
  NS.lexEel = lex;
  NS.parseEel = parse;
  NS.EelError = EelError;
})(typeof module === 'object' && module.exports
  ? (module.exports = (globalThis.MiddawJSFX = globalThis.MiddawJSFX || {}))
  : (globalThis.MiddawJSFX = globalThis.MiddawJSFX || {}));


/* ---- kit/gfx.js ---- */
/* REAPER's gfx_* drawing, on Max's mgraphics: the host a JSFX's @gfx runs on
 * (MiddawJSFX's runGfx). Each method takes the JSFX first, reads gfx_r, gfx_x
 * and the rest from its variables, and draws as REAPER would: text from its
 * top-left, gfx_x moved on past it, angles from twelve o'clock clockwise.
 *
 * gfx_showmenu cannot wait for a choice inside a frame, so it asks for one:
 * `menu` is set, the frame returns 0, and the device draws the menu. When an
 * item is chosen the device puts the variables back as they were at the start
 * of that frame and runs it again, and this time gfx_showmenu returns the item.
 */
var Gfx = (function () {
  'use strict';
  function Host(g) {
    this.g = g;
    this.fonts = { 0: { name: 'Arial', size: 13, flags: 0 } };
    this.font = 0;
    this.menu = null;        // { text, x, y } asked for this frame
    this.choice = 0;         // the item to give gfx_showmenu on the replayed frame
    this.slots = null;
  }
  Host.prototype.begin = function (g, fx) {
    this.g = g;
    if (!this.slots || this.fx !== fx) {
      this.fx = fx;
      var s = fx.slots;
      this.slots = { r: s.gfx_r, g: s.gfx_g, b: s.gfx_b, a: s.gfx_a, x: s.gfx_x, y: s.gfx_y, texth: s.gfx_texth,
                     mx: s.mouse_x, my: s.mouse_y, clear: s.gfx_clear };
    }
    this.menu = null;
    this.applyFont();
  };
  Host.prototype.v = function (k) { return this.fx.v[this.slots[k]]; };
  Host.prototype.set = function (k, x) { this.fx.v[this.slots[k]] = x; };
  Host.prototype.colour = function () {
    this.g.set_source_rgba(clamp(this.v('r')), clamp(this.v('g')), clamp(this.v('b')), clamp(this.v('a')));
  };
  // EEL2 strings are bytes; REAPER draws them as UTF-8.
  function utf8(s) { try { return decodeURIComponent(escape(s)); } catch (e) { return s; } }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : (x || 0); }
  function num(x, d) { return x === undefined || x !== x ? d : x; }

  // ------------------------------------------------------------ colour ---
  Host.prototype.gfx_set = function (fx, r, g, b, a) {
    r = num(r, 0);
    this.set('r', r); this.set('g', num(g, r)); this.set('b', num(b, r)); this.set('a', num(a, 1));
    return 0;
  };

  // ------------------------------------------------------------ shapes ---
  Host.prototype.gfx_rect = function (fx, x, y, w, h, filled) {
    if (!(w > 0 && h > 0)) return 0;
    this.colour();
    if (num(filled, 1)) { this.g.rectangle(x, y, w, h); this.g.fill(); }
    else { this.g.set_line_width(1); this.g.rectangle(x + 0.5, y + 0.5, w - 1, h - 1); this.g.stroke(); }
    return 0;
  };
  Host.prototype.gfx_line = function (fx, x1, y1, x2, y2) {
    this.colour();
    this.g.set_line_width(1);
    this.g.move_to(x1 + 0.5, y1 + 0.5); this.g.line_to(x2 + 0.5, y2 + 0.5); this.g.stroke();
    return 0;
  };
  Host.prototype.gfx_lineto = function (fx, x, y) {
    this.gfx_line(fx, this.v('x'), this.v('y'), x, y);
    this.set('x', x); this.set('y', y);
    return 0;
  };
  Host.prototype.gfx_circle = function (fx, x, y, r, fill) {
    this.colour();
    this.g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    if (num(fill, 0)) this.g.fill(); else { this.g.set_line_width(1); this.g.stroke(); }
    return 0;
  };
  Host.prototype.gfx_arc = function (fx, x, y, r, a1, a2) {
    this.colour();
    this.g.set_line_width(1);
    this.g.arc(x, y, Math.max(0, r), a1 - Math.PI / 2, a2 - Math.PI / 2);
    this.g.stroke();
    return 0;
  };
  Host.prototype.gfx_roundrect = function (fx, x, y, w, h, radius) {
    this.colour();
    this.g.set_line_width(1);
    this.g.rectangle_rounded(x + 0.5, y + 0.5, w, h, radius * 2, radius * 2);
    this.g.stroke();
    return 0;
  };
  Host.prototype.gfx_triangle = function (fx) {
    var p = Array.prototype.slice.call(arguments, 1);
    if (p.length < 6) return 0;
    this.colour();
    this.g.move_to(p[0], p[1]);
    for (var i = 2; i + 1 < p.length; i += 2) this.g.line_to(p[i], p[i + 1]);
    this.g.close_path();
    this.g.fill();
    return 0;
  };
  Host.prototype.gfx_gradrect = function (fx, x, y, w, h, r, g, b, a) {
    this.g.set_source_rgba(clamp(r), clamp(g), clamp(b), clamp(num(a, 1)));
    this.g.rectangle(x, y, w, h); this.g.fill();
    return 0;
  };

  // -------------------------------------------------------------- text ---
  // gfx_setfont(idx, name, size, flags): flags is a character code, 'b' bold, 'i' italic.
  Host.prototype.gfx_setfont = function (fx, idx, name, size, flags) {
    idx = Math.trunc(num(idx, 0));
    if (name !== undefined && idx > 0) {
      this.fonts[idx] = { name: fx.str(name) || 'Arial', size: num(size, 13), flags: Math.trunc(num(flags, 0)) };
    }
    this.font = this.fonts[idx] ? idx : 0;
    this.applyFont();
    return 1;
  };
  Host.prototype.gfx_getfont = function () { return this.font; };
  Host.prototype.applyFont = function () {
    var f = this.fonts[this.font] || this.fonts[0], fl = f.flags;
    var bold = fl === 98 || ((fl >> 8) & 255) === 98 || ((fl >> 16) & 255) === 98;
    var italic = fl === 105 || ((fl >> 8) & 255) === 105 || ((fl >> 16) & 255) === 105;
    this.g.select_font_face(f.name, italic ? 'italic' : 'normal', bold ? 'bold' : 'normal');
    this.g.set_font_size(f.size);
    this.size = f.size;
    if (this.slots) this.set('texth', Math.round(f.size));
  };
  Host.prototype.measure = function (s) {
    var m = this.g.text_measure(s);
    return [m[0], Math.max(m[1], this.size)];
  };
  Host.prototype.gfx_measurestr = function (fx, s) { this.fx.gm = this.measure(utf8(fx.str(s))); return this.fx.gm[0]; };
  Host.prototype.gfx_measurechar = function (fx, c) { this.fx.gm = this.measure(String.fromCharCode(c)); return this.fx.gm[0]; };
  Host.prototype.text = function (s, flags, right, bottom) {
    var x = this.v('x'), y = this.v('y'), m = this.measure(s);
    flags = Math.trunc(num(flags, 0));
    if (right !== undefined && !(flags & 256)) {
      if (flags & 1) x = x + (right - x - m[0]) / 2; else if (flags & 2) x = right - m[0];
      if (flags & 4) y = y + (bottom - y - m[1]) / 2; else if (flags & 8) y = bottom - m[1];
    }
    this.colour();
    this.g.move_to(x, y + this.size * 0.8);
    this.g.show_text(s);
    this.set('x', x + m[0]);
    return 0;
  };
  Host.prototype.gfx_drawstr = function (fx, s, flags, right, bottom) { return this.text(utf8(fx.str(s)), flags, right, bottom); };
  Host.prototype.gfx_drawchar = function (fx, c) { return this.text(String.fromCharCode(c)); };
  Host.prototype.gfx_drawnumber = function (fx, n, digits) { return this.text(Number(n).toFixed(Math.max(0, Math.trunc(num(digits, 0))))); };
  Host.prototype.gfx_printf = function (fx, fmt) {
    var args = Array.prototype.slice.call(arguments, 2);
    var s = fx.str(fmt).replace(/%(-?\d*)(?:\.(\d+))?([dfsxXc%])/g, function (m, w, p, k) {
      if (k === '%') return '%';
      var a = args.shift();
      if (k === 's') return fx.str(a);
      if (k === 'c') return String.fromCharCode(a);
      if (k === 'x' || k === 'X') { var h = Math.trunc(a).toString(16); return k === 'X' ? h.toUpperCase() : h; }
      return k === 'd' ? String(Math.trunc(a)) : Number(a).toFixed(p === undefined ? 6 : +p);
    });
    return this.text(utf8(s));
  };

  // ------------------------------------------------------------- input ---
  // gfx_getchar(65536) asks about the window: 1 it has focus, 2 it is shown,
  // 4 the mouse is in it. With no argument it is the next key typed, which the
  // window's [key] hands in (Host.key); with a key it asks whether it is held.
  Host.prototype.gfx_getchar = function (fx, c) {
    if (c === 65536) return 1 | 2 | (this.mouseIn ? 4 : 0);
    if (c) return 0;
    return this.keys && this.keys.length ? this.keys.shift() : 0;
  };
  // Max's key codes as REAPER's gfx_getchar gives them: the arrows and the
  // editing keys are four-letter codes there.
  var KEYS = { 28: 0x6C656674, 29: 0x72676874, 30: 0x7570, 31: 0x646F776E, 127: 0x64656C, 8: 8, 9: 9, 13: 13, 27: 27,
               '-9': 0x6C656674, '-10': 0x72676874, '-11': 0x7570, '-12': 0x646F776E };
  Host.prototype.key = function (code) {
    (this.keys = this.keys || []).push(KEYS[code] !== undefined ? KEYS[code] : code);
    if (this.keys.length > 32) this.keys.shift();
  };
  Host.prototype.gfx_showmenu = function (fx, s) {
    if (this.choice) { var k = this.choice; this.choice = 0; return k; }
    this.menu = { text: utf8(fx.str(s)), x: this.v('x'), y: this.v('y') };
    return 0;
  };
  Host.prototype.gfx_setcursor = function () { return 0; };
  Host.prototype.gfx_getdropfile = function () { return 0; };
  Host.prototype.gfx_update = function () { return 0; };

  // A menu as gfx_showmenu writes it: items split by |, '#' greyed, '!'
  // ticked, '>' opens a submenu, '<' closes one. Numbered as REAPER numbers
  // them: every item that is not a submenu's title, in order, from 1.
  function parseMenu(text) {
    var out = [], depth = 0, n = 0;
    String(text).split('|').forEach(function (raw) {
      var t = raw, grey = false, tick = false, opens = false, closes = false;
      for (;;) {
        var c = t.charAt(0);
        if (c === '#') { grey = true; t = t.slice(1); } else if (c === '!') { tick = true; t = t.slice(1); }
        else if (c === '>') { opens = true; t = t.slice(1); } else if (c === '<') { closes = true; t = t.slice(1); } else break;
      }
      if (opens) { out.push({ label: t, title: true, depth: depth }); depth++; return; }
      if (t === '' && !closes) { out.push({ rule: true, depth: depth }); return; }
      n++;
      out.push({ label: t, index: n, grey: grey, tick: tick, depth: depth });
      if (closes) depth = Math.max(0, depth - 1);
    });
    return out;
  }

  return { Host: Host, parseMenu: parseMenu };
})();


/* ---- kit/live.js ---- */
/* The Live set, as the family's devices need it: the song's tempo, meter and
 * scale, the notes of the clip being edited, somewhere to put new notes, and
 * a way to hear notes before they are used.
 *
 * Everything goes through the Live Object Model (LiveAPI). Times are beats,
 * which in Live are quarter notes - the unit every family engine already
 * speaks - so nothing is converted but the field names.
 */
var Live = (function () {
  'use strict';
  function api(path) { return new LiveAPI(null, path); }
  function one(a, prop) { var v = a.get(prop); return Array.isArray(v) ? v[0] : v; }
  function exists(a) { return a && Number(a.id) !== 0; }
  function json(v) {
    if (typeof v === 'string') return JSON.parse(v);
    if (Array.isArray(v) && typeof v[0] === 'string' && v.length === 1) return JSON.parse(v[0]);
    return v;
  }

  // Live 12's scale names, as ScaleView numbers its scales (1-16). A scale
  // ScaleView has no name for is left out: the device keeps its own key.
  var SCALE = {
    'Major': 1, 'Minor': 2, 'Harmonic Minor': 3, 'Dorian': 5, 'Phrygian': 6, 'Lydian': 7,
    'Mixolydian': 8, 'Major Pentatonic': 10, 'Minor Pentatonic': 11, 'Minor Blues': 13,
    'Whole Tone': 14, 'Whole-half Dim.': 15, 'Half-whole Dim.': 16
  };
  // ScaleView's eighteen roots, and the spelling a key on each pitch class
  // takes: flats for the major side, sharps where a minor key has them.
  var ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb'];
  var MAJOR_SIDE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_SIDE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  var MINORISH = { 2: 1, 3: 1, 5: 1, 6: 1, 11: 1, 13: 1 };
  var SCALE_NAMES = ['Major', 'Minor (Natural)', 'Harmonic Minor', 'Ionian', 'Dorian', 'Phrygian', 'Lydian',
                     'Mixolydian', 'Aeolian', 'Major Pentatonic', 'Minor Pentatonic', 'Major Blues', 'Minor Blues',
                     'Whole Tone', 'Diminished Whole-Half', 'Diminished Half-Whole'];

  function song() {
    var s = api('live_set');
    var out = { tempo: +one(s, 'tempo') || 120, num: +one(s, 'signature_numerator') || 4,
                den: +one(s, 'signature_denominator') || 4, playing: !!+one(s, 'is_playing'),
                position: +one(s, 'current_song_time') || 0, key: null };
    var mode = s.get('scale_mode');
    if (mode !== undefined && mode !== null) {
      var name = String(one(s, 'scale_name')), pc = +one(s, 'root_note');
      var sc = SCALE[name];
      out.liveScale = { on: !!+(Array.isArray(mode) ? mode[0] : mode), name: name, root: pc };
      if (sc) out.key = { root: ROOTS.indexOf((MINORISH[sc] ? MINOR_SIDE : MAJOR_SIDE)[((pc % 12) + 12) % 12]) + 1, scale: sc };
    }
    return out;
  }

  function detailClip() {
    var c = api('live_set view detail_clip');
    if (!exists(c) || !+one(c, 'is_midi_clip')) return null;
    return c;
  }

  // The clip being edited: its selected notes if any are selected, else every
  // note in its loop. Starts are from the start of what was taken.
  function clipNotes() {
    var c = detailClip();
    if (!c) return null;
    var from = +one(c, 'loop_start') || 0, to = +one(c, 'loop_end') || 0;
    var raw = null, selected = false;
    try { raw = json(c.call('get_selected_notes_extended')); selected = raw && raw.notes && raw.notes.length > 0; } catch (e) { raw = null; }
    if (!selected) raw = json(c.call('get_notes_extended', 0, 128, from, Math.max(0, to - from)));
    var notes = ((raw && raw.notes) || []).filter(function (n) { return !n.mute; }).map(function (n) {
      return { start: n.start_time, len: n.duration, pitch: n.pitch, vel: Math.round(n.velocity) };
    });
    var first = selected && notes.length ? Math.min.apply(null, notes.map(function (n) { return n.start; })) : from;
    var beats = to - from;
    if (selected) {
      var bar = 4, end = 0;
      notes.forEach(function (n) { end = Math.max(end, n.start + n.len); });
      first = Math.floor(first / bar) * bar;
      beats = Math.ceil((end - first) / bar) * bar;
    }
    notes.forEach(function (n) { n.start -= first; });
    notes.sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
    return { notes: notes, beats: beats, name: String(one(c, 'name') || ''), selected: selected, drums: drumTrack() };
  }

  // A track whose instrument is a Drum Rack plays drums: its note numbers name
  // drums, not pitches, and the engines treat them that way.
  function drumTrack() {
    try {
      var track = api('this_device canonical_parent'), n = track.getcount('devices');
      for (var i = 0; i < n; i++) if (+one(api(track.unquotedpath + ' devices ' + i), 'can_have_drum_pads')) return true;
    } catch (e) { /* not known: not drums */ }
    return false;
  }

  function liveNotes(notes) {
    return { notes: notes.map(function (n) {
      return { pitch: Math.max(0, Math.min(127, Math.round(n.pitch))), start_time: Math.max(0, n.start),
               duration: Math.max(1 / 128, n.len), velocity: Math.max(1, Math.min(127, Math.round(n.vel || 100))), mute: 0 };
    }) };
  }

  function undoable(fn) {
    var s = api('live_set');
    try { s.call('begin_undo_step'); } catch (e) { /* Live before 11.1 */ }
    try { return fn(); } finally { try { s.call('end_undo_step'); } catch (e2) { /* as above */ } }
  }

  function show(clip) {
    try { api('live_set view').set('detail_clip', 'id', Number(clip.id)); } catch (e) { /* the clip is made either way */ }
  }

  function selectedScene() {
    var scene = api('live_set view selected_scene'), n = api('live_set').getcount('scenes');
    for (var i = 0; i < n; i++) if (Number(api('live_set scenes ' + i).id) === Number(scene.id)) return i;
    return 0;
  }
  function thisTrack() {
    var track = api('this_device canonical_parent');
    if (!exists(track) || !+one(track, 'has_midi_input')) return null;
    return track;
  }
  // Where this device's track is in the set, for putting new tracks beside it.
  function trackIndex(track) {
    var n = api('live_set').getcount('tracks');
    for (var i = 0; i < n; i++) if (Number(api('live_set tracks ' + i).id) === Number(track.id)) return i;
    return n - 1;
  }
  function clipInSlot(slot, notes, beats, name) {
    slot.call('create_clip', Math.max(1, beats));
    var clip = api(slot.unquotedpath + ' clip');
    if (name) clip.set('name', name);
    clip.call('add_new_notes', liveNotes(notes));
    return clip;
  }
  function freeSlot(track, from) {
    var n = track.getcount('clip_slots');
    for (var k = 0; k < n; k++) {
      var at = (from + k) % n, slot = api(track.unquotedpath + ' clip_slots ' + at);
      if (!+one(slot, 'has_clip')) return { slot: slot, at: at };
    }
    return null;
  }
  function arrangementClipOn(track, notes, beats, name, at) {
    var before = track.getcount('arrangement_clips');
    try { track.call('create_midi_clip', at, Math.max(1, beats)); } catch (e) { /* checked below */ }
    var count = track.getcount('arrangement_clips');
    if (!(count > before)) return false;
    for (var i = 0; i < count; i++) {
      var clip = api(track.unquotedpath + ' arrangement_clips ' + i);
      if (Math.abs((+one(clip, 'start_time') || 0) - at) < 1e-6) {
        if (name) clip.set('name', name);
        clip.call('add_new_notes', liveNotes(notes));
        return true;
      }
    }
    return false;
  }

  // New notes, as a new clip in the first free slot on this device's track,
  // from the selected scene down. `more` are further parts ({name, notes}),
  // each on a new MIDI track after this one, in the same scene. Returns what
  // happened, for the status line.
  function newClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var free = freeSlot(track, selectedScene());
    if (!free) return { ok: false, message: 'Every clip slot on this track is full. Add a scene, then try again.' };
    return undoable(function () {
      var clip = clipInSlot(free.slot, notes, beats, name);
      var made = newTracks(track, more, function (t) {
        clipInSlot(api(t.unquotedpath + ' clip_slots ' + free.at), this.notes, beats, this.name);
      });
      show(clip);
      return { ok: true, message: 'Added a clip in scene ' + (free.at + 1) + (made ? ', and ' + made + ' on new tracks beside it.' : '.') };
    });
  }

  // New notes on a new MIDI track beside this one, in the selected scene:
  // a suggestion goes with the music it was made for, not over it.
  function newTrackClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var scene = selectedScene();
    return undoable(function () {
      var parts = [{ name: name, notes: notes }].concat(more || []);
      newTracks(track, parts, function (t) { show(clipInSlot(api(t.unquotedpath + ' clip_slots ' + scene), this.notes, beats, this.name)); });
      return { ok: true, message: parts.length === 1 ? 'Added a track beside this one, with the clip in scene ' + (scene + 1) + '.'
                                                     : 'Added ' + parts.length + ' tracks beside this one, with the clips in scene ' + (scene + 1) + '.' };
    });
  }

  // Each further part on a new MIDI track, in order, after this one.
  function newTracks(track, more, put) {
    if (!more || !more.length) return '';
    var at = trackIndex(track), song = api('live_set');
    more.forEach(function (part, k) {
      song.call('create_midi_track', at + 1 + k);
      var t = api('live_set tracks ' + (at + 1 + k));
      t.set('name', part.name);
      put.call(part, t);
    });
    return more.length === 1 ? 'one more part' : more.length + ' more parts';
  }

  // New notes in place of the notes of the clip being edited, from its loop start.
  function replaceInClip(notes, beats) {
    var c = detailClip();
    if (!c) return { ok: false, message: 'No MIDI clip is open. Open one in Detail View, then try again.' };
    var from = +one(c, 'loop_start') || 0;
    return undoable(function () {
      var span = Math.max(beats, (+one(c, 'loop_end') || 0) - from);
      c.call('remove_notes_extended', 0, 128, from, span);
      c.call('add_new_notes', liveNotes(notes.map(function (n) {
        return { start: n.start + from, len: n.len, pitch: n.pitch, vel: n.vel };
      })));
      if ((+one(c, 'loop_end') || 0) < from + beats) c.set('loop_end', from + beats);
      return { ok: true, message: 'Replaced the notes in “' + (String(one(c, 'name') || '') || 'the clip') + '”.' };
    });
  }

  // New notes in the Arrangement at the insert marker, on this device's track
  // (Track.create_midi_clip, Live 12.2 and later); further parts as above.
  function arrangementClip(notes, beats, name, more) {
    var track = thisTrack();
    if (!track) return { ok: false, message: 'This device needs to be on a MIDI track.' };
    var at = +one(api('live_set'), 'current_song_time') || 0;
    return undoable(function () {
      if (!arrangementClipOn(track, notes, beats, name, at)) {
        return { ok: false, message: 'This version of Live can\u2019t add Arrangement clips from a device. Choose New Clip instead.' };
      }
      var made = newTracks(track, more, function (t) { arrangementClipOn(t, this.notes, beats, this.name, at); });
      return { ok: true, message: 'Added a clip to the Arrangement at beat ' + (Math.round(at * 100) / 100 + 1) +
               (made ? ', and ' + made + ' on new tracks beside it.' : '.') };
    });
  }

  // ------------------------------------------------------------ player ---
  // Notes heard through this device's MIDI out: the instrument after it on
  // the track plays them. A Task ticks every few milliseconds and sends what
  // is due; nothing waits on the transport.
  function Player(send) {
    this.send = send; this.events = []; this.pos = 0; this.t0 = 0; this.task = null; this.sounding = {};
    this.onEnd = null;
  }
  Player.prototype.play = function (notes, tempo, onEnd) {
    this.stop();
    var ms = 60000 / (tempo || 120), ev = [];
    notes.forEach(function (n) {
      ev.push({ t: n.start * ms, on: true, pitch: n.pitch, vel: n.vel || 100 });
      ev.push({ t: (n.start + n.len) * ms - 1, on: false, pitch: n.pitch });
    });
    ev.sort(function (a, b) { return a.t - b.t || (a.on === b.on ? 0 : a.on ? 1 : -1); });
    this.events = ev; this.pos = 0; this.t0 = Date.now(); this.onEnd = onEnd || null;
    var self = this;
    this.task = new Task(function () { self.tick(); }, this);
    this.task.interval = 4;
    this.task.repeat();
    this.tick();
  };
  Player.prototype.tick = function () {
    var now = Date.now() - this.t0;
    while (this.pos < this.events.length && this.events[this.pos].t <= now) {
      var e = this.events[this.pos++];
      if (e.on) { this.sounding[e.pitch] = (this.sounding[e.pitch] || 0) + 1; this.send([0x90, e.pitch, Math.max(1, Math.min(127, Math.round(e.vel)))]); }
      else if (this.sounding[e.pitch]) { this.sounding[e.pitch]--; this.send([0x80, e.pitch, 0]); }
    }
    if (this.pos >= this.events.length) {
      var end = this.onEnd;
      this.stop();
      if (end) end();
    }
  };
  Player.prototype.playing = function () { return !!this.task; };
  Player.prototype.stop = function () {
    if (this.task) { this.task.cancel(); this.task.freepeer && this.task.freepeer(); this.task = null; }
    var self = this;
    Object.keys(this.sounding).forEach(function (p) {
      for (var i = 0; i < self.sounding[p]; i++) self.send([0x80, +p, 0]);
    });
    this.sounding = {};
    this.onEnd = null;
  };

  return { song: song, clipNotes: clipNotes, newClip: newClip, newTrackClip: newTrackClip, replaceInClip: replaceInClip,
           arrangementClip: arrangementClip, drumTrack: drumTrack, Player: Player, ROOTS: ROOTS, SCALE_NAMES: SCALE_NAMES };
})();


/* ---- kit/jsfx_device.js ---- */
/* A family JSFX as a Max for Live MIDI effect: the .jsfx itself, unchanged,
 * on Middaw's EEL2 runtime, with its own @gfx window drawn in this [v8ui].
 *
 * The [v8ui] sits in the device's window subpatcher, which the device strip's
 * Show Window button opens. Its code runs whether the window is open or not.
 *
 * A Task ticks every few milliseconds: the MIDI that arrived since the last
 * tick goes in, a block as long as the time that passed is run, and what the
 * plug-in sends comes straight out. Live's tempo, meter, transport and song
 * position are what REAPER would give it.
 *
 * Expects, before it: Gfx, Live, MiddawJSFX, and DEVICE = { main, files,
 * actions? }. A device's own buttons (Load Clip, Insert the Take) are in
 * ACTIONS, defined in the repository's ableton/actions.js.
 * Inlet 0: bang (Live is ready), MIDI bytes, restore, and the strip's
 * commands. Outlets: 0 MIDI bytes, 1 the saved state to [pattr], 2 the
 * strip's status line.
 */
inlets = 1;
outlets = 3;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var SR = 48000;
var ACTIONS = typeof ACTIONS === 'undefined' ? {} : ACTIONS;

// The bundle keeps files as bytes; the runtime reads a .jsfx as text.
function source(name) {
  var t = DEVICE.files[name];
  if (t === undefined) return null;
  try { return decodeURIComponent(escape(t)); } catch (e) { return t; }
}
var fx = new MiddawJSFX.JSFX(source(DEVICE.main), { gfx: true, sampleRate: SR, readImport: source });
fx.init(SR);

var D = {
  ready: false, pending: null, task: null, last: 0, beat: 0, pos: 0,
  midiIn: [], running: [], status: '', host: new Gfx.Host(mgraphics),
  mouse: { x: -1, y: -1, cap: 0, wheel: 0 }, release: false, frameSaw: true,
  menu: null, menuSnap: null, menuMouse: null, frames: 0, song: { tempo: 120, num: 4, den: 4, playing: false }
};

function say(msg) { D.status = msg || ''; outlet(2, 'set', D.status); }
function send(data) { for (var i = 0; i < data.length; i++) outlet(0, data[i]); }

// ---------------------------------------------------------------- MIDI --
// [midiin] gives a byte at a time; a message is whole once its data are in.
function msg_int(b) {
  b = b & 255;
  if (b >= 0xF8) return;                      // real-time: not passed to the plug-in
  if (b & 0x80) { D.running = [b]; return; }
  if (!D.running.length) return;
  D.running.push(b);
  var st = D.running[0] & 0xF0, need = (st === 0xC0 || st === 0xD0) ? 2 : 3;
  if (D.running[0] >= 0xF0) { D.running = []; return; }  // system messages are not passed on
  if (D.running.length === need) {
    D.midiIn.push(need === 2 ? [D.running[0], D.running[1], 0] : D.running.slice());
    D.running = [D.running[0]];
  }
}

// --------------------------------------------------------------- clock --
function readSong() {
  try {
    var s = Live.song();
    D.song = { tempo: s.tempo, num: s.num, den: s.den, playing: s.playing, position: s.position };
  } catch (e) { /* outside Live */ }
}
function tick() {
  var now = Date.now();
  var ms = Math.min(100, Math.max(0, now - D.last));
  D.last = now;
  if ((D.frames++ & 63) === 0 || D.song.playing) readSong();
  var n = Math.max(1, Math.round(ms * SR / 1000));
  var spb = SR * 60 / D.song.tempo;
  fx.setTime({ tempo: D.song.tempo, num: D.song.num, den: D.song.den, playState: D.song.playing ? 1 : 0,
               beat: D.song.playing ? D.song.position : D.beat, seconds: (D.song.playing ? D.song.position : D.beat) * 60 / D.song.tempo });
  if (!D.song.playing) D.beat += n / spb;
  var midi = D.midiIn.map(function (data) { return { offset: 0, data: data }; });
  D.midiIn = [];
  var out = fx.process(n, null, null, midi);
  for (var i = 0; i < out.length; i++) send(out[i].data);
  if (ACTIONS.tick) ACTIONS.tick(fx);
  if ((D.frames & 511) === 0) save();
}
function start() {
  if (D.task) return;
  D.last = Date.now();
  D.task = new Task(tick, this);
  D.task.interval = 4;
  D.task.repeat();
  var draw = new Task(function () { mgraphics.redraw(); }, this);
  draw.interval = 33;
  draw.repeat();
  D.drawTask = draw;
}

// ------------------------------------------------------------ messages --
function bang() {
  D.ready = true;
  readSong();
  if (D.pending) { load(D.pending); D.pending = null; }
  start();
}
function restore(text) {
  var st = null;
  try { st = JSON.parse(String(text)); } catch (e) { return; }
  if (!D.ready) { D.pending = st; return; }
  load(st);
}
function load(st) {
  if (st && st.v === 1 && st.fx) { fx.deserialize(st.fx); lastSaved = JSON.stringify(st); }
}
// The plug-in's @serialize, kept with the Live set: written when it changes,
// so an untouched device does not mark the set as changed.
var lastSaved = '';
function save() {
  var s = JSON.stringify({ v: 1, fx: fx.serialize() });
  if (s === lastSaved) return;
  lastSaved = s;
  outlet(1, 'set', s);
}
// The strip's buttons: "action <name>".
function action(name) {
  var a = ACTIONS[name];
  if (!a) return;
  try { var msg = a(fx, Live); if (msg) say(msg); } catch (e) { say(String(e.message || e)); }
  save();
  mgraphics.redraw();
}
// Keys typed while the window has focus, from its [key].
function key(code) { D.host.key(code); mgraphics.redraw(); }
function anything() {
  var a = ACTIONS[messagename];
  if (a) action(messagename);
}

// --------------------------------------------------------------- paint --
function size() {
  var r = (typeof box !== 'undefined' && box.rect) ? box.rect : [0, 0].concat(fx.file.gfxSize || [800, 600]);
  return [r[2] - r[0], r[3] - r[1]];
}
function paint() {
  var g = mgraphics, sz = size(), h = D.host;
  var clear = fx.getVar('gfx_clear');
  var c = clear >= 0 ? clear : 0;           // REAPER keeps the last frame for -1; a [v8ui] cannot
  g.set_source_rgba((c & 255) / 255, ((c >> 8) & 255) / 255, ((c >> 16) & 255) / 255, 1);
  g.rectangle(0, 0, sz[0], sz[1]);
  g.fill();
  if (D.menu) { frame(g, sz, D.menuMouse); drawMenu(g, sz); return; }
  var snap = new Float64Array(fx.v);
  var mouse = { x: D.mouse.x, y: D.mouse.y, cap: D.mouse.cap, wheel: D.mouse.wheel };
  D.mouse.wheel = 0;
  frame(g, sz, mouse);
  D.frameSaw = true;
  if (D.release) { D.release = false; D.mouse.cap = 0; }
  if (h.menu) { D.menu = { items: Gfx.parseMenu(h.menu.text), x: mouse.x, y: mouse.y, hover: -1 }; D.menuSnap = snap; D.menuMouse = mouse; }
}
function frame(g, sz, mouse) {
  D.host.begin(g, fx);
  D.host.mouseIn = mouse.x >= 0 && mouse.y >= 0 && mouse.x < sz[0] && mouse.y < sz[1];
  try { fx.runGfx(D.host, sz[0], sz[1], mouse); } catch (e) { say('The window stopped: ' + (e.message || e)); }
}

// The menu gfx_showmenu asked for, over the window.
var ITEM_H = 20;
function menuRect(sz) {
  var m = D.menu, w = 40;
  mgraphics.select_font_face('Arial', 'normal', 'normal');
  mgraphics.set_font_size(12);
  m.items.forEach(function (it) { if (it.label) w = Math.max(w, mgraphics.text_measure(it.label)[0] + 40 + it.depth * 12); });
  var h = m.items.length * ITEM_H + 8;
  var x = Math.min(m.x, sz[0] - w - 2), y = Math.min(m.y, sz[1] - h - 2);
  return [Math.max(0, x), Math.max(0, y), w, h];
}
function drawMenu(g, sz) {
  var r = menuRect(sz), m = D.menu;
  g.set_source_rgba(0.165, 0.184, 0.216, 1); g.rectangle(r[0], r[1], r[2], r[3]); g.fill();
  g.set_source_rgba(0.227, 0.251, 0.29, 1); g.set_line_width(1); g.rectangle(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1); g.stroke();
  m.items.forEach(function (it, i) {
    var y = r[1] + 4 + i * ITEM_H;
    if (it.rule) { g.set_source_rgba(0.227, 0.251, 0.29, 1); g.rectangle(r[0] + 6, y + ITEM_H / 2, r[2] - 12, 1); g.fill(); return; }
    if (i === m.hover && it.index && !it.grey) { g.set_source_rgba(1, 0.949, 0, 1); g.rectangle(r[0] + 2, y, r[2] - 4, ITEM_H); g.fill(); }
    var on = i === m.hover && it.index && !it.grey;
    var ink = on ? [0.078, 0.09, 0.11] : it.grey || it.title ? [0.714, 0.737, 0.776] : [0.867, 0.882, 0.906];
    g.set_source_rgba(ink[0], ink[1], ink[2], 1);
    g.move_to(r[0] + 22 + it.depth * 12, y + 14);
    g.show_text(it.label);
    if (it.tick) { g.move_to(r[0] + 7 + it.depth * 12, y + 14); g.show_text('✓'); }
  });
}
function menuAt(x, y) {
  var r = menuRect(size());
  if (x < r[0] || x >= r[0] + r[2] || y < r[1] + 4 || y >= r[1] + r[3] - 4) return -1;
  return Math.floor((y - r[1] - 4) / ITEM_H);
}
function chooseMenu(i) {
  var m = D.menu, it = i >= 0 ? m.items[i] : null;
  if (it && (!it.index || it.grey)) return;          // a title, a rule or a greyed item: the menu stays
  D.menu = null;
  // The frame that asked runs again from where it started, and gets the answer.
  fx.v.set(D.menuSnap);
  D.host.choice = it ? it.index : 0;
  if (!it) { D.host.choice = 0; D.host.cancelled = true; }
  var g = mgraphics, sz = size();
  if (it) frame(g, sz, D.menuMouse);
  D.host.choice = 0;
  D.mouse.cap = 0;
  save();
  mgraphics.redraw();
}

// --------------------------------------------------------------- mouse --
// REAPER's mouse_cap: 1 left, 2 right, 4 Command, 8 Shift, 16 Option, 32 Control.
function caps(but, cmd, shift, opt, ctrl) {
  return (ctrl ? 2 : 1) | (cmd ? 4 : 0) | (shift ? 8 : 0) | (opt ? 16 : 0);
}
function onclick(x, y, but, cmd, shift, capslock, opt, ctrl) {
  if (D.menu) { chooseMenu(menuAt(x, y)); return; }
  D.mouse.x = x; D.mouse.y = y; D.mouse.cap = caps(but, cmd, shift, opt, ctrl);
  D.frameSaw = false;
  mgraphics.redraw();
}
function ondrag(x, y, but) {
  if (D.menu) return;
  D.mouse.x = x; D.mouse.y = y;
  if (!but) {
    // A click shorter than a frame is still seen down for one frame.
    if (D.frameSaw) D.mouse.cap = 0; else D.release = true;
    save();
  }
  mgraphics.redraw();
}
function onidle(x, y) {
  if (D.menu) { var i = menuAt(x, y); if (i !== D.menu.hover) { D.menu.hover = i; mgraphics.redraw(); } return; }
  D.mouse.x = x; D.mouse.y = y;
}
function onidleout() { if (!D.menu) { D.mouse.x = -1; D.mouse.y = -1; } }
function onwheel(x, y, dx, dy) { D.mouse.wheel += Math.round(dy * 120); mgraphics.redraw(); }

