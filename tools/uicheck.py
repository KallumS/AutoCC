#!/usr/bin/env python3
"""
Checks AutoCC's window against the rules in docs/decisions/0001 (Apple's HIG
Foundations), by running the real @gfx code headlessly in ysfx.

    tools/build_host.sh                 # once: builds tools/build/uihost
    python3 tools/uicheck.py            # static checks, then the window
    python3 tools/uicheck.py --static   # static checks only (no build needed)
    python3 tools/uicheck.py --shots DIR    # also write PNG screenshots
    python3 tools/uicheck.py --jsfx copy.jsfx   # check another copy (to prove a check bites)

How it sees the window: a copy of the plug-in is made in a temporary folder
with every gfx_drawstr and gfx_rect in @gfx routed through a small logger.
The logger writes each string's box, its colour and the pixels under it
(read with gfx_getpixel before the text is drawn), and each rectangle with
its colour, into memory the host reads back. The keyboard focus list is the
plug-in's own (focus_base). Nothing in the shipped file is changed.

Every check prints PASS or FAIL with what it found, and the script exits
non-zero if any failed. Nothing here has been run inside REAPER.
"""

import argparse
import collections
import os
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FAILS = []
PASSES = []


def check(ok, name, detail=""):
    (PASSES if ok else FAILS).append(name)
    print(("PASS  " if ok else "FAIL  ") + name + (("  -  " + detail) if detail and not ok else ""))
    return ok


# ---------------------------------------------------------------- the source
def sections(text):
    out, name, order = {}, "header", ["header"]
    for line in text.split("\n"):
        m = re.match(r"^@(\w+)", line)
        if m:
            name = m.group(1)
            order.append(name)
            out[name] = [line]
            continue
        out.setdefault(name, []).append(line)
    return {k: "\n".join(v) for k, v in out.items()}, order


def colours(text):
    return {m.group(1): int(m.group(2), 16) for m in re.finditer(r"\b(C_\w+)\s*=\s*0x([0-9A-Fa-f]{6})\s*;", text)}


def strip_code(src):
    """The source with strings and // comments blanked, so brackets can be counted."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            out.append('"' + " " * (j - i - 1) + '"')
            i = j + 1
        elif src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def call_args(clean, start):
    """For a call whose '(' is at start: (index of the matching ')', number of arguments)."""
    depth, args, i = 0, 1, start
    while i < len(clean):
        c = clean[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i, args
        elif c == "," and depth == 1:
            args += 1
        i += 1
    raise ValueError("unbalanced call at %d" % start)


WRAP = r"""
// ---- uicheck instrumentation (only in the checked copy) ----
T_LOG = 3000000; T_W = 80; t_n = 0;
function t_text(s, f, r, b, na) local(w, h, x0, y0, bx, by, p, j, sx, sy, pr, pg, pb, n, k, rr, gg, bb, aa) (
  gfx_measurestr(s, w, h);
  x0 = gfx_x; y0 = gfx_y; bx = x0; by = y0;
  na >= 4 ? (
    (f & 1) ? ( bx = x0 + (r - x0 - w) / 2 ) : (f & 2) ? ( bx = r - w );
    (f & 4) ? ( by = y0 + (b - y0 - h) / 2 ) : (f & 8) ? ( by = b - h );
  );
  p = T_LOG + t_n * T_W;
  p[0] = 1; p[1] = bx; p[2] = by; p[3] = w; p[4] = h;
  p[5] = gfx_r; p[6] = gfx_g; p[7] = gfx_b; p[8] = gfx_a;
  p[9] = na >= 4 ? r - x0 : -1; p[10] = na >= 4 ? b - y0 : -1; p[11] = gfx_texth;
  rr = gfx_r; gg = gfx_g; bb = gfx_b; aa = gfx_a;
  j = 0;
  loop(5,
    sx = j == 0 ? bx + w / 2 : (j == 1 || j == 3) ? bx + 1 : bx + w - 2;
    sy = j == 0 ? by + h / 2 : j < 3 ? by + 2 : by + h - 3;
    gfx_x = floor(sx); gfx_y = floor(sy);
    gfx_getpixel(pr, pg, pb);
    p[12 + j] = floor(pr * 255 + 0.5) * 65536 + floor(pg * 255 + 0.5) * 256 + floor(pb * 255 + 0.5);
    j += 1;
  );
  gfx_r = rr; gfx_g = gg; gfx_b = bb; gfx_a = aa;
  n = min(strlen(s), 60); p[17] = n; k = 0;
  loop(n, p[18 + k] = str_getchar(s, k); k += 1; );
  t_n += 1;
  gfx_x = x0; gfx_y = y0;
);
function t_drawstr1(s) ( t_text(s, 0, 0, 0, 1); gfx_drawstr(s); );
function t_drawstr2(s, f) ( t_text(s, f, 0, 0, 2); gfx_drawstr(s, f); );
function t_drawstr4(s, f, r, b) ( t_text(s, f, r, b, 4); gfx_drawstr(s, f, r, b); );
function t_rect(x, y, w, h, f) local(p) (
  p = T_LOG + t_n * T_W;
  p[0] = 2; p[1] = x; p[2] = y; p[3] = w; p[4] = h;
  p[5] = gfx_r; p[6] = gfx_g; p[7] = gfx_b; p[8] = gfx_a; p[9] = f;
  t_n += 1;
  gfx_rect(x, y, w, h, f);
);
// Keys reach the window as REAPER documents them ('up' is 30064, Tab 9...),
// with Shift in mouse_cap even when no button is down. ysfx packs the arrow
// codes the other way round and reports Shift only during a click, so the
// checker hands them in here instead.
// A line: its ends, colour and the pixel under its middle before it is drawn.
function t_line(x1, y1, x2, y2) local(p, pr, pg, pb, rr, gg, bb, aa) (
  p = T_LOG + t_n * T_W;
  p[0] = 3; p[1] = x1; p[2] = y1; p[3] = x2; p[4] = y2;
  p[5] = gfx_r; p[6] = gfx_g; p[7] = gfx_b; p[8] = gfx_a;
  rr = gfx_r; gg = gfx_g; bb = gfx_b; aa = gfx_a;
  gfx_x = floor((x1 + x2) / 2); gfx_y = floor((y1 + y2) / 2);
  gfx_getpixel(pr, pg, pb);
  p[9] = floor(pr * 255 + 0.5) * 65536 + floor(pg * 255 + 0.5) * 256 + floor(pb * 255 + 0.5);
  gfx_r = rr; gfx_g = gg; gfx_b = bb; gfx_a = aa;
  t_n += 1;
  gfx_line(x1, y1, x2, y2);
);
function t_getchar() local(k) ( k = t_key; t_key = 0; k ? k : gfx_getchar(); );
function t_rect4(x, y, w, h) ( t_rect(x, y, w, h, 1); );
function t_rect5(x, y, w, h, f) ( t_rect(x, y, w, h, f); );
"""


def instrument(text):
    secs, order = sections(text)
    g = secs["gfx"]
    clean = strip_code(g)
    edits = []
    for name in ("gfx_drawstr", "gfx_rect", "gfx_line"):
        for m in re.finditer(r"(?<![\w.])" + name + r"\(", clean):
            _, n = call_args(clean, m.end() - 1)
            if name == "gfx_drawstr" and n not in (1, 2, 4):
                raise ValueError("gfx_drawstr with %d arguments" % n)
            if name == "gfx_rect" and n not in (4, 5):
                raise ValueError("gfx_rect with %d arguments" % n)
            if name == "gfx_line" and n != 4:
                raise ValueError("gfx_line with %d arguments" % n)
            new = {"gfx_drawstr": "t_drawstr%d(" % n, "gfx_rect": "t_rect%d(" % n, "gfx_line": "t_line("}[name]
            edits.append((m.start(), m.end(), new))
    for a, b, new in sorted(edits, reverse=True):
        g = g[:a] + new + g[b:]
    g = re.sub(r"(?<![\w.])gfx_getchar\(\)", "t_getchar()", g)
    first, rest = g.split("\n", 1)
    secs["gfx"] = first + "\nt_n = 0;\nmouse_cap |= t_mods;\n" + rest
    first, rest = secs["init"].split("\n", 1)
    secs["init"] = first + "\n" + WRAP + "\n" + rest
    return "\n".join(secs[k] for k in order)


# ---------------------------------------------------------------- colour maths
def lum(c):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c >> 16 & 255) + 0.7152 * f(c >> 8 & 255) + 0.0722 * f(c & 255)


def ratio(a, b):
    x, y = sorted((lum(a), lum(b)))
    return (y + 0.05) / (x + 0.05)


def mix(fg, bg, a):
    out = 0
    for s in (16, 8, 0):
        out = out * 256 + int(round((fg >> s & 255) * a + (bg >> s & 255) * (1 - a)))
    return out


# ---------------------------------------------------------------- static checks
def static_checks(text):
    print("\n-- static: the source --")
    secs, _ = sections(text)
    cols = colours(text)
    off_ramp = {"C_ACCENT", "C_WARN", "C_WARN_TEXT"}
    bad = [k for k, v in cols.items() if k not in off_ramp and not ((v >> 16) < (v >> 8 & 255) < (v & 255))]
    check(not bad, "every grey is blue-shifted (R < G < B)", ", ".join(bad))
    for need, val in (("C_LABEL2", 0xB0B6C0), ("C_WARN_TEXT", 0xFF9E96), ("C_RING", 0xF2F4F7)):
        check(cols.get(need) == val, "%s is #%06X" % (need, val), "found %s" % (hex(cols[need]) if need in cols else "nothing"))
    raw = [l for l in text.split("\n") if re.search(r"\bgfx_(r|g|b|a)\s*=", l) or "gfx_set(" in l]
    raw = [l for l in raw if not re.search(r"function setx|gfx_r = \(\(c|gfx_g = |gfx_b = \(c|gfx_a = (1|a);", l)]
    check(not raw, "every colour goes through setx()/setxa()", "; ".join(x.strip() for x in raw[:3]))
    check("want_all_kb" not in text, "options:want_all_kb is not set (Space stays REAPER's)")
    for name, s in secs.items():
        clean = strip_code(s)
        check(clean.count("(") == clean.count(")"), "brackets balance in @%s" % name,
              "%d ( against %d )" % (clean.count("("), clean.count(")")))
    gfx = secs["gfx"]
    sliders = sorted(int(n) for n in re.findall(r"^slider(\d+):", text, re.M))
    # the lane boxes reach sliders 11-17 through set_en(), which @gfx calls
    m = re.search(r"function set_en\(.*?\n\);", secs["init"], re.S)
    reach = gfx + (m.group(0) if m and "set_en(" in gfx else "")
    missing = [n for n in sliders if not re.search(r"\bslider%d\b" % n, reach)]
    check(not missing, "every slider has a control in @gfx", "missing: %s" % missing)
    hidden = [n for n in re.findall(r"^slider\d+:[^>]*>(.)", text, re.M) if n != "-"]
    check(not hidden, "every slider is hidden from REAPER's slider panel")
    for face in ('"Segoe UI"', '".AppleSystemUIFont"', '"Arial"', "gfx_getfont(#got)"):
        check(face in gfx, "the system font is asked for: %s" % face)
    # Memory regions, from the constants in @init.
    init = secs["init"]
    def const(n):
        m = re.search(r"\b%s\s*=\s*(\d+)\s*;" % n, init)
        return int(m.group(1)) if m else None
    nslots, cn = const("NSLOTS"), const("CN")
    regions = [
        ("lane params", 0, const("PARAM_LEN")),
        ("runtime", const("r_stage"), const("r_preven") + 16 - const("r_stage")),
        ("attack curves", const("ca_base"), nslots * cn),
        ("release curves", const("cr_base"), nslots * cn),
        ("note flags", const("notes_base"), 128),
        ("MIDI queue", const("ev_base"), const("EV_MAX") * 4),
        ("focus list", const("focus_base"), (const("FOCUS_MAX") or 0) * (const("FOCUS_W") or 0)),
        ("undo staging", const("stage_base"), const("SNAP_W")),
        ("undo stack", const("u_base"), const("U_MAX") * const("SNAP_W")),
        ("redo stack", const("rd_base"), const("U_MAX") * const("SNAP_W")),
    ]
    ok = all(r[1] is not None and r[2] for r in regions)
    clash = []
    if ok:
        rs = sorted(regions, key=lambda r: r[1])
        for a, b in zip(rs, rs[1:]):
            if a[1] + a[2] > b[1]:
                clash.append("%s overlaps %s" % (a[0], b[0]))
    check(ok and not clash, "memory regions do not overlap", "; ".join(clash) or "a region is missing")
    check(ok and const("rd_base") + const("U_MAX") * const("SNAP_W") <= 65536,
          "both undo stacks sit below 65536 (overlapping memcpy rule)")


# ---------------------------------------------------------------- the host
class Frame:
    def __init__(self, texts, rects, focus, vars_, lines=()):
        self.texts, self.rects, self.focus, self.v, self.lines = texts, rects, focus, vars_, lines


class UI:
    VARS = ("ui_s ui_zoom focus_id fl_n focus_base FOCUS_W top_h scroll content_h sel_slot "
            "slider1 slider12 slider18 slider10 gfx_w gfx_h u_n status_on cx cy cw chh").split()

    def __init__(self, host, jsfx, w=820, h=730, scale=1):
        self.p = subprocess.Popen([host, jsfx], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, bufsize=1)
        self.send("size %d %d %g" % (w, h, scale), "mouse -1 -1 0 0 0", "frame", "frame")

    def send(self, *lines):
        for l in lines:
            self.p.stdin.write(l + "\n")
        self.p.stdin.write("sync\n")
        self.p.stdin.flush()
        out = []
        while True:
            l = self.p.stdout.readline()
            if not l:
                raise RuntimeError("host stopped: " + self.p.stderr.read())
            l = l.rstrip("\n")
            if l == "SYNC":
                return out
            out.append(l)

    def var(self, *names):
        out = self.send("var " + " ".join(names))
        return {k: float(v) for k, v in (kv.split("=") for kv in out[-1].split()[1:])}

    def frame(self, n=1):
        for _ in range(n):
            self.send("frame")

    KEYS = {"tab": 9, "ret": 13, "space": 32, "esc": 27, "up": 30064, "down": 1685026670,
            "left": 1818584692, "right": 1919379572}

    def key(self, k, mods=0):
        """One key, as REAPER's gfx_getchar() returns it; mods 1 is Shift."""
        self.send("setvar t_key %d" % self.KEYS[k], "setvar t_mods %d" % (8 if mods & 1 else 0), "frame",
                  "setvar t_mods 0", "mouse -1 -1 0 0 0", "frame")

    def look(self):
        """Runs one frame and reads back everything it drew."""
        out = self.send("frame", "log", "var " + " ".join(self.VARS))
        v = {k: float(x) for k, x in (kv.split("=") for kv in out[-1].split()[1:])}
        n, W = int(v["fl_n"]), int(v["FOCUS_W"])
        mem = self.send("mem %d %d" % (int(v["focus_base"]), max(1, n * W)))[-1].split()[1:]
        mem = [float(x) for x in mem]
        focus = [dict(id=int(mem[i * W]), x=mem[i * W + 1], y=mem[i * W + 2], w=mem[i * W + 3],
                      h=mem[i * W + 4], kind=int(mem[i * W + 5])) for i in range(n)]
        texts, rects, lines = [], [], []
        for l in out:
            if not l.startswith("LOG "):
                continue
            p = [float(x) for x in l.split()[1:]]
            col = int(round(p[5] * 255)) * 65536 + int(round(p[6] * 255)) * 256 + int(round(p[7] * 255))
            if p[0] == 1:
                n_ = int(p[17])
                s = bytes(int(c) & 255 for c in p[18:18 + n_]).decode("utf-8", "replace")
                bgs = collections.Counter(int(x) for x in p[12:17])
                texts.append(dict(s=s, x=p[1], y=p[2], w=p[3], h=p[4], col=col, a=p[8], boxw=p[9], boxh=p[10],
                                  texth=p[11], bg=bgs.most_common(1)[0][0]))
            elif p[0] == 2:
                rects.append(dict(x=p[1], y=p[2], w=p[3], h=p[4], col=col, a=p[8], fill=p[9]))
            elif p[0] == 3:
                lines.append(dict(x1=p[1], y1=p[2], x2=p[3], y2=p[4], col=col, a=p[8], bg=int(p[9])))
        return Frame(texts, rects, focus, v, lines)

    def tab_to(self, fid, limit=80):
        for _ in range(limit):
            if int(self.var("focus_id")["focus_id"]) == fid:
                return True
            self.key("tab")
        return False

    def shot(self, path, w, h):
        raw = path + ".bgra"
        self.send("frame", "shot " + raw)
        try:
            import numpy as np
            from PIL import Image
            a = np.fromfile(raw, dtype=np.uint8).reshape(h, w, 4)
            Image.fromarray(a[:, :, [2, 1, 0]]).save(path)
            os.unlink(raw)
        except ImportError:
            print("      (numpy/PIL missing: left raw BGRA at %s)" % raw)

    def close(self):
        self.p.stdin.close()
        self.p.wait()


NAMES = {110: "Options", 113: "Dismiss", 101: "Default", 102: "Strings", 103: "Brass", 104: "Woodwinds",
         105: "Panic / Reset", 10: "CC Number", 1: "Floor", 2: "Peak", 3: "Sustain", 4: "Velocity",
         5: "Rise", 6: "Settle", 7: "Fall", 8: "Rise Shape", 9: "Fall Shape", 111: "Undo", 112: "Redo",
         120: "Reset Curves", 121: "Copy Shape to All", 122: "Clear Lane", 33: "Mode", 39: "Hold",
         34: "Trigger", 30: "Depth", 31: "Time", 35: "MIDI In", 36: "CC Out", 37: "Pedal",
         38: "MIDI Thru", 32: "Rate", 40: "Engine"}
for _i in range(7):
    NAMES[200 + _i] = "lane %d on/off" % (_i + 1)
    NAMES[210 + _i] = "lane %d" % (_i + 1)


def name(fid):
    return NAMES.get(fid, "id %d" % fid)


LANES = []
for _i in range(7):
    LANES += [NAMES[200 + _i], NAMES[210 + _i]]
FIELDS = ["Floor", "Peak", "Sustain", "Velocity", "Rise", "Settle", "Fall", "Rise Shape", "Fall Shape"]
GLOBAL_A = ["Mode", "Trigger", "Depth", "Time"]
GLOBAL_B = ["MIDI In", "CC Out", "Pedal", "MIDI Thru", "Rate", "Engine"]
ORDER_FRESH = (["Options", "Default", "Strings", "Brass", "Woodwinds", "Panic / Reset"] + LANES + FIELDS +
               ["Reset Curves", "Copy Shape to All"] + GLOBAL_A + GLOBAL_B)
ORDER_USER = (["Dismiss", "Options", "Default", "Strings", "Brass", "Woodwinds", "Panic / Reset"] + LANES +
              ["CC Number"] + FIELDS + ["Undo", "Reset Curves", "Copy Shape to All", "Clear Lane"] +
              ["Mode", "Hold", "Trigger", "Depth", "Time"] + GLOBAL_B)


# ---------------------------------------------------------------- window rules
def frame_rules(f, label, cols):
    S = f.v["ui_s"]
    gw, gh, top = f.v["gfx_w"], f.v["gfx_h"], f.v["top_h"]
    dim = cols["C_DIM"]
    # Text exempt from 7:1: only the dimmed labels of controls that are off.
    disabled = re.compile(r"^(Undo|Redo|Hold|\d+ ms)$")
    low, exempt = [], 0
    for t in f.texts:
        if t["y"] < top <= t["y"] + t["h"] or t["y"] + t["h"] > gh:
            continue          # scrolled under the bar or off the bottom: not on screen
        fg = mix(t["col"], t["bg"], t["a"])
        r = ratio(fg, t["bg"])
        if r < 7:
            if t["col"] == dim and disabled.match(t["s"]):
                exempt += 1
                continue
            low.append("'%s' %.2f:1 (#%06X on #%06X)" % (t["s"], r, fg, t["bg"]))
    check(not low, "%s: every line of text is at least 7:1 on what it sits on" % label, "; ".join(low[:4]))
    clipped = ["'%s' %.0f > %.0f" % (t["s"], t["w"], t["boxw"]) for t in f.texts
               if t["boxw"] >= 0 and t["w"] > t["boxw"] + 0.5]
    check(not clipped, "%s: no text is wider than its box (buttons never narrower than their labels)" % label,
          "; ".join(clipped[:4]))
    outside = ["'%s'" % t["s"] for t in f.texts if t["x"] < 0 or t["x"] + t["w"] > gw + 0.5]
    check(not outside, "%s: no text runs off the side of the window" % label, ", ".join(outside[:4]))
    small = ["'%s' %.1f" % (t["s"], t["texth"]) for t in f.texts if t["texth"] < 13 * S - 0.5]
    check(not small, "%s: no text is set under 13 points (x interface size)" % label, "; ".join(small[:4]))
    # Controls: 28 tall, 12 apart, in the window. Only those wholly in view.
    view = [c for c in f.focus if c["id"] in (110, 113) or (c["y"] >= top and c["y"] + c["h"] <= gh)]
    short = ["%s %.0f" % (name(c["id"]), c["h"]) for c in view if c["h"] < 28 * S - 0.5]
    check(not short, "%s: every control is at least 28 points tall" % label, ", ".join(short[:4]))
    wide = [name(c["id"]) for c in view if c["x"] < 0 or c["x"] + c["w"] > gw + 0.5]
    check(not wide, "%s: every control is inside the window" % label, ", ".join(wide))
    near = []
    lane = {4, 5}
    for i, a in enumerate(view):
        for b in view[i + 1:]:
            if a["kind"] in lane and b["kind"] in lane:
                continue          # the lane list is a table: its rows touch
            hov = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
            vov = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
            if hov > 0 and vov > 0:
                near.append("%s overlaps %s" % (name(a["id"]), name(b["id"])))
            elif vov > 0 and -hov < 12 * S - 1:
                near.append("%s and %s %.0f apart" % (name(a["id"]), name(b["id"]), -hov))
            elif hov > 0 and -vov < 12 * S - 1:
                near.append("%s and %s %.0f apart" % (name(a["id"]), name(b["id"]), -vov))
    check(not near, "%s: controls are at least 12 points apart" % label, "; ".join(near[:4]))
    # 1.2: nothing is cut short with an ellipsis - the message bar wraps instead.
    cut = ["'%s'" % t["s"] for t in f.texts if t["s"].endswith("…")]
    check(not cut, "%s: no text is cut short with an ellipsis" % label, ", ".join(cut[:3]))
    # 1.2: the edge of every field and setting is 3:1 on its own fill and on the ground.
    weak = []
    for c in view:
        if c["kind"] not in (2, 3):
            continue
        same = [r for r in f.rects if abs(r["x"] - c["x"]) < 0.5 and abs(r["y"] - c["y"]) < 0.5 and
                abs(r["w"] - c["w"]) < 0.5 and abs(r["h"] - c["h"]) < 0.5]
        fills = [r["col"] for r in same if r["fill"]]
        edges = [r["col"] for r in same if not r["fill"]]
        if not fills or not edges:
            weak.append("%s has no edge" % name(c["id"]))
            continue
        for under in (fills[-1], cols["C_INK"]):
            if ratio(edges[-1], under) < 3:
                weak.append("%s #%06X on #%06X %.2f:1" % (name(c["id"]), edges[-1], under, ratio(edges[-1], under)))
    check(not weak, "%s: the edge of every field and setting is 3:1 on its fill and the ground" % label,
          "; ".join(weak[:4]))
    # 1.2: the canvas's marks - the stage boundaries, the floor, the curve and
    # the playhead - are 3:1 on every band of the canvas. Exempt: the grid
    # (C_BEAT) and the faint wash under the curve.
    faint = set()
    cx, cy, cw, chh = (f.v[k] for k in ("cx", "cy", "cw", "chh"))
    for l in f.lines:
        if l["a"] < 0.2 or l["col"] == cols["C_BEAT"]:
            continue
        if not (cx - 0.5 <= min(l["x1"], l["x2"]) and max(l["x1"], l["x2"]) <= cx + cw + 0.5 and
                cy - 0.5 <= min(l["y1"], l["y2"]) and max(l["y1"], l["y2"]) <= cy + chh + 0.5):
            continue
        for band in ("C_ROLL", "C_SUNK", "C_BEAT"):
            fg = mix(l["col"], cols[band], l["a"])
            if ratio(fg, cols[band]) < 3:
                faint.add("#%06X on %s %.2f:1" % (fg, band, ratio(fg, cols[band])))
    check(not faint, "%s: every mark on the canvas is 3:1 on its bands" % label, "; ".join(sorted(faint)[:3]))


def ink_bar(f, cols, fid):
    c = next((c for c in f.focus if c["id"] == fid), None)
    if not c:
        return None
    S = f.v["ui_s"]
    return any(r["fill"] and r["col"] == cols["C_INK"] and r["h"] <= 3 * S + 0.5 and r["w"] > 8 * S and
               r["x"] >= c["x"] and r["x"] + r["w"] <= c["x"] + c["w"] and
               r["y"] >= c["y"] + c["h"] / 2 and r["y"] + r["h"] <= c["y"] + c["h"]
               for r in f.rects)


def ring_around(f, cols, c):
    S = f.v["ui_s"]
    rings = [r for r in f.rects if not r["fill"] and r["x"] <= c["x"] - 1 and r["y"] <= c["y"] - 1 and
             r["x"] + r["w"] >= c["x"] + c["w"] + 1 and r["y"] + r["h"] >= c["y"] + c["h"] + 1 and
             r["x"] >= c["x"] - 4 * S - 1 and r["w"] <= c["w"] + 8 * S + 2]
    inset = [r for r in f.rects if not r["fill"] and abs(r["x"] - c["x"]) <= 1 and abs(r["y"] - c["y"]) <= 1 and
             abs(r["w"] - c["w"]) <= 2 and abs(r["h"] - c["h"]) <= 2]
    found = [r["col"] for r in rings + (inset if c["kind"] == 5 else [])]
    return found


def run_window(host, jsfx, cols, shots):
    def ui(w=820, h=730, scale=1):
        return UI(host, jsfx, w, h, scale)

    # ---- a fresh window: the rules, Tab order and the ring on every stop
    print("\n-- window: fresh, 100% --")
    u = ui()
    f = u.look()
    frame_rules(f, "fresh 100%", cols)
    if shots:
        u.shot(os.path.join(shots, "window-100.png"), 820, 730)
    order = [name(c["id"]) for c in f.focus]
    check(order == ORDER_FRESH, "Tab order is reading order, every control named (fresh)",
          "got %s" % order)
    S = f.v["ui_s"]
    top = f.v["top_h"]
    bar = [t for t in f.texts if t["y"] < top and t["x"] < f.v["gfx_w"] / 2]
    check(bool(bar) and bar[0]["s"].startswith("Play with both hands"),
          "what to do is said at the top of the window", "bar text: %s" % [t["s"] for t in bar])
    last = max(c["y"] + c["h"] for c in f.focus)
    below = [t["s"] for t in f.texts if t["y"] > last]
    check(not below, "nothing is written below the last row of controls (no footer)", ", ".join(below))
    check(ink_bar(f, cols, 101) is True, "the chosen preset carries an ink bar as well as the yellow")
    check(ink_bar(f, cols, 102) is False, "an unchosen preset carries no ink bar")
    seen, missing, wrong = [], [], []
    for _ in range(len(f.focus)):
        u.key("tab")
        g = u.look()
        fid = int(g.v["focus_id"])
        seen.append(name(fid))
        c = next((c for c in g.focus if c["id"] == fid), None)
        found = ring_around(g, cols, c) if c else []
        if cols["C_RING"] not in found:
            missing.append(name(fid))
        if cols["C_ACCENT"] in found:
            wrong.append(name(fid))
    check(seen == ORDER_FRESH, "Tab visits every control once, in order", "visited %s" % seen)
    check(not missing, "a #F2F4F7 focus ring is drawn round every control Tab reaches", ", ".join(missing))
    check(not wrong, "the focus ring is never the accent yellow", ", ".join(wrong))
    u.key("tab")
    check(name(int(u.var("focus_id")["focus_id"])) == ORDER_FRESH[0], "Tab wraps from the last control to the first")
    u.key("tab", 1)
    check(name(int(u.var("focus_id")["focus_id"])) == ORDER_FRESH[-1], "Shift+Tab goes back")
    u.key("esc")
    check(int(u.var("focus_id")["focus_id"]) == 0, "Esc lets go of the focus")

    # ---- pressing things from the keyboard
    print("\n-- window: the keyboard alone --")
    u.tab_to(102)
    u.key("space")
    check(int(u.var("slider1")["slider1"]) == 1, "Space presses a focused button (Strings chosen)")
    f = u.look()
    msg = [t["s"] for t in f.texts if t["y"] < f.v["top_h"] and t["s"].startswith("Loaded the Strings preset")]
    check(bool(msg) and "Undo" in " ".join(t["s"] for t in f.texts if t["y"] < f.v["top_h"]),
          "choosing a preset says what it replaced and that Undo puts it back")
    u.tab_to(201)
    u.key("ret")
    check(int(u.var("slider12")["slider12"]) == 0, "Return toggles a focused lane box (lane 2 off)")
    u.key("ret")
    u.tab_to(214)
    u.key("ret")
    check(int(u.var("sel_slot")["sel_slot"]) == 4, "Return chooses a focused lane (lane 5)")
    u.tab_to(1)
    base = float(u.send("mem 36 1")[-1].split()[1])
    u.key("up")
    a = float(u.send("mem 36 1")[-1].split()[1])
    u.key("up", 1)
    b = float(u.send("mem 36 1")[-1].split()[1])
    u.key("down")
    c = float(u.send("mem 36 1")[-1].split()[1])
    check((a - base, b - a, c - b) == (5, 1, -5), "arrows nudge a field, Shift in finer steps (Floor +5, +1, -5)",
          "moved %s" % [a - base, b - a, c - b])
    u.tab_to(33)
    u.key("right")
    one = int(u.var("slider18")["slider18"])
    u.key("left")
    zero = int(u.var("slider18")["slider18"])
    check((one, zero) == (1, 0), "arrows step a Global setting (Mode to One-Shot and back)", "got %s" % [one, zero])

    # ---- a message: at the top, stays until dismissed
    print("\n-- window: messages --")
    u.tab_to(121)
    u.key("ret")
    u.send("mouse -1 -1 0 0 0")
    f = u.look()
    msg = [t for t in f.texts if t["y"] < f.v["top_h"] and t["s"].startswith("Copied")]
    check(bool(msg), "a message appears in the bar at the top of the window")
    u.send("wait 1500")
    u.frame(60)
    f = u.look()
    msg = [t for t in f.texts if t["y"] < f.v["top_h"] and t["s"].startswith("Copied")]
    check(bool(msg), "the message is still there 1.5 s and 60 frames later (no timer)")
    check(f.focus[0]["id"] == 113, "Dismiss comes first in the Tab order while a message shows")

    # a second state: user lane, One-Shot, bypassed, a note sounding, a message
    u.send("slider 18 1", "slider 10 1", "note 60 100", "block 40")
    u.key("esc")
    f = u.look()
    frame_rules(f, "user lane, One-Shot, bypassed, message", cols)
    if shots:
        u.shot(os.path.join(shots, "window-busy.png"), 820, 730)
    order = [name(c["id"]) for c in f.focus]
    check(order == ORDER_USER, "Tab order with a user lane, One-Shot and a message", "got %s" % order)
    eng = [t for t in f.texts if t["s"] == "Bypassed"]
    check(bool(eng) and eng[0]["col"] == cols["C_WARN_TEXT"], "a warning in words uses #FF9E96, not the house red")
    u.tab_to(113)
    u.key("ret")
    f = u.look()
    check(not [t for t in f.texts if t["s"].startswith("Copied")], "Dismiss clears the message")
    warn = [t for t in f.texts if t["y"] < f.v["top_h"] and t["s"].startswith("The engine is bypassed")]
    check(bool(warn) and warn[0]["col"] == cols["C_WARN_TEXT"], "the bypassed engine is said at the top, in words")
    u.close()

    # ---- interface size
    print("\n-- window: interface size --")
    u = ui()
    small = u.look()
    u.tab_to(110)
    u.send("menu 3")
    u.key("ret")
    check(abs(u.var("ui_zoom")["ui_zoom"] - 1.5) < 1e-9, "Options → Interface Size 150% sets 150%")
    mt = u.send("menutext")[-1]
    check("Interface Size 100%" in mt and "Interface Size 200%" in mt and "!Interface Size 100%" in mt,
          "the menu offers 100% to 200% and ticks the current size", mt)
    u.send("reload")
    u.frame(2)
    check(abs(u.var("ui_zoom")["ui_zoom"] - 1.5) < 1e-9, "the interface size is remembered when the project reopens")
    for z, nm in ((1.25, "125%"), (1.5, "150%"), (2, "200%")):
        u.send("setvar ui_zoom %g" % z)
        f = u.look()
        frame_rules(f, "%s in 820 x 730" % nm, cols)
        if shots and z == 2:
            u.shot(os.path.join(shots, "window-200-small.png"), 820, 730)
    # at 200% in the small window the last control is reached by Tab and scrolled into view
    u.key("tab", 1)
    f = u.look()
    eng = next(c for c in f.focus if c["id"] == 40)
    check(int(f.v["focus_id"]) == 40 and f.v["scroll"] > 0 and eng["y"] >= f.v["top_h"] and
          eng["y"] + eng["h"] <= f.v["gfx_h"],
          "at 200% in a small window, Shift+Tab reaches Engine and scrolls it into view")
    u.key("tab")
    u.key("tab")
    f = u.look()
    dflt = next(c for c in f.focus if c["id"] == 101)
    check(int(f.v["focus_id"]) == 101 and dflt["y"] >= f.v["top_h"] and dflt["y"] + dflt["h"] <= f.v["gfx_h"],
          "... and Tab on round to Default scrolls back up to it", "Default at y %.0f, scroll %.0f" % (dflt["y"], f.v["scroll"]))
    # 1.2: at 200% in the small window the message wraps, whole, and the bar
    # keeps its height whatever the pointer or the focus points at.
    u.send("setvar ui_zoom 2")
    u.tab_to(121)
    u.key("ret")
    u.key("esc")
    f = u.look()
    last = max(i for i, t in enumerate(f.texts) if t["s"] == "Options")
    words = [t["s"] for t in f.texts[last + 1:]]
    whole = " ".join(words)
    inside = all(t["y"] + t["h"] <= f.v["top_h"] for t in f.texts[last + 1:])
    check(len(words) > 1 and inside and whole.startswith("Copied") and whole.endswith("Undo puts them back."),
          "at 200% a long message wraps onto more lines inside the bar rather than being cut short", " | ".join(words))
    heights = set()
    for fid in (113, 110, 101, 105, 201, 211, 1, 8, 121, 33, 40):
        u.tab_to(fid)
        heights.add(round(u.var("top_h")["top_h"]))
    u.tab_to(113)
    u.key("ret")
    heights.add(round(u.var("top_h")["top_h"]))
    check(len(heights) == 1, "the message bar keeps one height as the focus moves and the message goes",
          "heights %s" % sorted(heights))
    u.close()
    # 1.2: a window narrower than the layout needs at 200% shrinks the
    # interface to fit (never below 100%) instead of drawing past its edge.
    for w, z, nm in ((560, 2, "200% in a 560-wide window"), (340, 1, "100% in a 340-wide window")):
        u = ui(w, 600)
        u.send("setvar ui_zoom %g" % z)
        f = u.look()
        frame_rules(f, nm, cols)
        if shots and z == 2:
            u.shot(os.path.join(shots, "window-200-narrow.png"), w, 600)
        u.close()
    # the canvas says how to draw on it
    u = ui()
    cv = u.var("cx", "cy", "cw", "chh")
    u.send("mouse %d %d 0 0 0" % (cv["cx"] + cv["cw"] / 2, cv["cy"] + cv["chh"] / 2))
    f = u.look()
    hov = [t for t in f.texts if t["y"] < f.v["top_h"] and t["s"].startswith("Envelope: drag")]
    check(bool(hov), "pointing at the canvas says how to draw on it")
    u.close()
    # Every size goes through the scale factor: 200% in a window twice the size
    # draws every control and every word exactly twice as big and as far.
    u = ui(1640, 1460, 1)
    u.send("setvar ui_zoom 2")
    big = u.look()
    frame_rules(big, "200% in 1640 x 1460", cols)
    if shots:
        u.shot(os.path.join(shots, "window-200.png"), 1640, 1460)
    u.close()
    off = []
    sf = {c["id"]: c for c in small.focus}
    for c in big.focus:
        s = sf.get(c["id"])
        if not s or any(abs(c[k] - 2 * s[k]) > 4 + 0.03 * 2 * s[k] for k in "xywh"):
            off.append(name(c["id"]))
    check(not off and len(big.focus) == len(small.focus), "every control doubles exactly at 200%", ", ".join(off[:6]))
    toff = []
    for a, b in zip(small.texts, big.texts):
        # (text is measured, so widths and what hangs off them grow by a hair
        # more or less than double; 3% allows for it)
        if a["s"] != b["s"] or abs(b["x"] - 2 * a["x"]) > 4 + 0.06 * a["x"] or abs(b["y"] - 2 * a["y"]) > 4 or \
           b["texth"] < 2 * a["texth"] - 2:
            toff.append(a["s"])
    check(not toff and len(small.texts) == len(big.texts), "every word doubles in size and place at 200%",
          ", ".join(toff[:6]))
    # ---- a Retina screen
    print("\n-- window: a Retina screen --")
    u = ui(1640, 1460, 2)
    f = u.look()
    check(abs(f.v["ui_s"] - 2) < 1e-9, "on a Retina screen the window draws at twice the pixels",
          "ui_s %s" % f.v["ui_s"])
    frame_rules(f, "Retina 100%", cols)
    u.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsfx", default=os.path.join(ROOT, "AutoCC.jsfx"))
    ap.add_argument("--host", default=os.environ.get("AUTOCC_HOST", os.path.join(HERE, "build", "uihost")))
    ap.add_argument("--static", action="store_true")
    ap.add_argument("--shots")
    a = ap.parse_args()
    text = open(a.jsfx, encoding="utf-8").read()
    cols = colours(text)
    static_checks(text)
    if not a.static:
        if not os.path.exists(a.host):
            print("no host at %s - run tools/build_host.sh (or --static)" % a.host)
            sys.exit(2)
        if a.shots:
            os.makedirs(a.shots, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, "AutoCC-checked.jsfx")
            open(copy, "w", encoding="utf-8").write(instrument(text))
            run_window(a.host, copy, cols, a.shots)
    print("\n%d passed, %d failed" % (len(PASSES), len(FAILS)))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
