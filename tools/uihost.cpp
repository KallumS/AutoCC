// A headless REAPER stand-in for AutoCC's window, built on ysfx (the same
// EEL2 compiler and LICE drawing REAPER uses). It reads commands on stdin,
// one per line, and prints what it is asked for; tools/uicheck.py drives it.
//
//   size W H SCALE        window in pixels; SCALE 2 is a Retina screen
//   slider N V            set slider N (1-based)
//   setvar NAME V         set a plug-in variable
//   note N VEL | noteoff N   queue MIDI for the next audio block
//   block N               run N audio blocks of 256 samples
//   mouse X Y BUTTONS MODS WHEEL   (buttons: 1 left, 2 right; mods: 1 shift, 2 ctrl)
//   key CODE MODS         queue a key; CODE: a number, or tab/ret/space/esc/left/up/right/down
//   menu N                the next popup menu returns item N (0 = none)
//   frame                 run @gfx once, then one audio block
//   wait MS               let real time pass
//   var NAME...           print variables
//   mem ADDR N            print N words of memory
//   log                   print the drawing log of an instrumented copy (T_LOG, t_n)
//   shot PATH             write the window as raw BGRA
//   reload                save the plug-in's state, start a fresh instance and
//                         load it back (as reopening a project does)
//   sync                  print SYNC (for a driver waiting on output)
#include "ysfx.h"
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

static void logr(intptr_t, ysfx_log_level l, const char *m) { fprintf(stderr, "[%s] %s\n", ysfx_log_level_string(l), m); }
static int next_menu = 0;
static std::string last_menu;
static int32_t menu(void *, const char *m, int32_t, int32_t) { last_menu = m; int r = next_menu; next_menu = 0; return r; }

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: uihost fx.jsfx < commands\n"); return 1; }
  ysfx_config_t *c = ysfx_config_new(); ysfx_set_log_reporter(c, &logr);
  ysfx_guess_file_roots(c, argv[1]);
  ysfx_t *fx = ysfx_new(c); ysfx_config_free(c);
  if (!ysfx_load_file(fx, argv[1], 0)) { fprintf(stderr, "load failed\n"); return 2; }
  if (!ysfx_compile(fx, 0)) { fprintf(stderr, "compile failed\n"); return 3; }
  ysfx_set_sample_rate(fx, 48000); ysfx_set_block_size(fx, 256); ysfx_init(fx);
  float z[256] = {0}, o1[256], o2[256];
  std::vector<std::vector<uint8_t>> pending;
  auto block = [&]() {
    for (auto &m : pending) { ysfx_midi_event_t me; me.bus = 0; me.offset = 0; me.size = (uint32_t)m.size(); me.data = m.data(); ysfx_send_midi(fx, &me); }
    pending.clear();
    const float *ins[2] = {z, z}; float *outs[2] = {o1, o2};
    ysfx_process_float(fx, ins, outs, 2, 2, 256);
    ysfx_midi_event_t mo; while (ysfx_receive_midi(fx, &mo)) {}
  };
  int w = 820, h = 730; double scale = 1;
  std::vector<uint8_t> px;
  auto setup = [&]() {
    px.assign((size_t)w * h * 4, 0);
    ysfx_gfx_config_t gc{}; gc.pixel_width = w; gc.pixel_height = h; gc.pixel_stride = 4 * w;
    gc.pixels = px.data(); gc.scale_factor = scale; gc.show_menu = &menu;
    ysfx_gfx_setup(fx, &gc);
    ysfx_gfx_set_window_state(fx, true, true, true);
  };
  setup();
  for (int b = 0; b < 4; b++) block();
  int mx = -1, my = -1, mb = 0, mods = 0; double wheel = 0;
  int frames = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream is(line); std::string cmd; is >> cmd;
    if (cmd.empty() || cmd[0] == '#') continue;
    if (cmd == "size") { is >> w >> h >> scale; setup(); }
    else if (cmd == "slider") { int n; double v; is >> n >> v; ysfx_slider_set_value(fx, n - 1, v, true); }
    else if (cmd == "setvar") { std::string n; double v; is >> n >> v; ysfx_real *p = ysfx_find_var(fx, n.c_str()); if (p) *p = v; else fprintf(stderr, "no var %s\n", n.c_str()); }
    else if (cmd == "note") { int n, v; is >> n >> v; pending.push_back({0x90, (uint8_t)n, (uint8_t)v}); }
    else if (cmd == "noteoff") { int n; is >> n; pending.push_back({0x80, (uint8_t)n, 0}); }
    else if (cmd == "block") { int n; is >> n; for (int i = 0; i < n; i++) block(); }
    else if (cmd == "mouse") { is >> mx >> my >> mb >> mods >> wheel; }
    else if (cmd == "key") {
      std::string k; int m = 0; is >> k >> m; uint32_t code;
      if (k == "tab") code = 9; else if (k == "ret") code = 13; else if (k == "space") code = 32;
      else if (k == "esc") code = ysfx_key_escape; else if (k == "left") code = ysfx_key_left;
      else if (k == "up") code = ysfx_key_up; else if (k == "right") code = ysfx_key_right;
      else if (k == "down") code = ysfx_key_down; else code = (uint32_t)atoi(k.c_str());
      uint32_t ym = ((m & 1) ? ysfx_mod_shift : 0) | ((m & 2) ? ysfx_mod_ctrl : 0);
      mods = m;
      ysfx_gfx_add_key(fx, ym, code, true);
      ysfx_gfx_add_key(fx, ym, code, false);
    }
    else if (cmd == "menu") { is >> next_menu; }
    else if (cmd == "frame") {
      uint32_t ym = ((mods & 1) ? ysfx_mod_shift : 0) | ((mods & 2) ? ysfx_mod_ctrl : 0);
      ysfx_gfx_update_mouse(fx, ym, mx, my, mb, wheel, 0); wheel = 0;
      ysfx_gfx_run(fx); block(); frames++;
      printf("FRAME %d\n", frames);
    }
    else if (cmd == "wait") { int ms; is >> ms; std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }
    else if (cmd == "var") { std::string n; printf("VAR"); while (is >> n) printf(" %s=%.10g", n.c_str(), ysfx_read_var(fx, n.c_str())); printf("\n"); }
    else if (cmd == "mem") { unsigned a, n; is >> a >> n; std::vector<ysfx_real> v(n); ysfx_read_vmem(fx, a, v.data(), n); printf("MEM"); for (auto x : v) printf(" %.10g", x); printf("\n"); }
    else if (cmd == "log") {
      int n = (int)ysfx_read_var(fx, "t_n"); unsigned base = (unsigned)ysfx_read_var(fx, "T_LOG"), W = (unsigned)ysfx_read_var(fx, "T_W");
      std::vector<ysfx_real> v(W);
      for (int i = 0; i < n; i++) { ysfx_read_vmem(fx, base + i * W, v.data(), W); printf("LOG"); for (auto x : v) printf(" %.6g", x); printf("\n"); }
      printf("ENDLOG\n");
    }
    else if (cmd == "menutext") { printf("MENU %s\n", last_menu.c_str()); }
    else if (cmd == "shot") { std::string p; is >> p; FILE *f = fopen(p.c_str(), "wb"); if (f) { fwrite(px.data(), 1, px.size(), f); fclose(f); } printf("SHOT %d %d\n", w, h); }
    else if (cmd == "sync") { printf("SYNC\n"); }
    else if (cmd == "reload") {
      ysfx_state_t *st = ysfx_save_state(fx);
      ysfx_config_t *c2 = ysfx_config_new(); ysfx_set_log_reporter(c2, &logr);
      ysfx_guess_file_roots(c2, argv[1]);
      ysfx_t *fx2 = ysfx_new(c2); ysfx_config_free(c2);
      if (!ysfx_load_file(fx2, argv[1], 0) || !ysfx_compile(fx2, 0)) { fprintf(stderr, "reload failed\n"); return 4; }
      ysfx_set_sample_rate(fx2, 48000); ysfx_set_block_size(fx2, 256); ysfx_init(fx2);
      ysfx_load_state(fx2, st); ysfx_state_free(st);
      ysfx_free(fx); fx = fx2; setup();
      for (int b = 0; b < 4; b++) block();
    }
    else { fprintf(stderr, "unknown command: %s\n", cmd.c_str()); }
    fflush(stdout);
  }
  ysfx_free(fx);
  return 0;
}
