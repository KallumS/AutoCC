#!/usr/bin/env python3
"""
Proves a check bites: breaks AutoCC.jsfx on purpose in a temporary copy (never
the working tree), runs tools/uicheck.py on the copy and says whether it failed.

    python3 tools/bite.py "what is broken" "old text" "new text" [more old/new pairs]

Prints BIT (a check failed, and which), MISSED (everything passed - the rule
is not really checked) or DID NOT APPLY (the old text is not in the file).
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
what, pairs = sys.argv[1], sys.argv[2:]
src = open(os.path.join(HERE, "..", "AutoCC.jsfx"), encoding="utf-8").read()
for old, new in zip(pairs[0::2], pairs[1::2]):
    if old not in src:
        print("DID NOT APPLY  %s  (%r not found)" % (what, old[:60]))
        sys.exit(2)
    src = src.replace(old, new)
with tempfile.TemporaryDirectory() as tmp:
    p = os.path.join(tmp, "AutoCC.jsfx")
    open(p, "w", encoding="utf-8").write(src)
    r = subprocess.run([sys.executable, os.path.join(HERE, "uicheck.py"), "--jsfx", p],
                       capture_output=True, text=True)
fails = [l[6:].split("  -  ")[0] for l in r.stdout.splitlines() if l.startswith("FAIL")]
if r.returncode and fails:
    print("BIT     %s  (%d failed, first: %s)" % (what, len(fails), fails[0]))
elif r.returncode:
    print("BIT (crashed)  %s  %s" % (what, (r.stdout + r.stderr).strip().splitlines()[-1:]))
else:
    print("MISSED  %s" % what)
