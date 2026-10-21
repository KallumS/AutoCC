#!/usr/bin/env bash
# Builds tools/build/uihost: AutoCC's window run headlessly through ysfx, the
# same EEL2 compiler and LICE drawing REAPER uses. Needs git, cmake, g++,
# freetype and fontconfig. About two minutes the first time.
#
#   tools/build_host.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
B="${AUTOCC_BUILD:-$HERE/build}"
YSFX_COMMIT=5c3452fee62583aa3d1b7e877d0c758c4024af89
mkdir -p "$B"
if [ ! -d "$B/ysfx" ]; then
  git clone --recurse-submodules https://github.com/JoepVanlier/ysfx "$B/ysfx"
  git -C "$B/ysfx" checkout -q "$YSFX_COMMIT"
  git -C "$B/ysfx" submodule update --init --recursive -q
fi
cmake -S "$B/ysfx" -B "$B/ysfx/build" -DCMAKE_BUILD_TYPE=Release -DYSFX_PLUGIN=OFF -DYSFX_GFX=ON > "$B/cmake.log" 2>&1
cmake --build "$B/ysfx/build" -j"$(nproc 2>/dev/null || echo 2)" > "$B/build.log" 2>&1
LIBS=$(find "$B/ysfx/build" -name "*.a" ! -name libysfx.a)
g++ -O2 -std=c++17 -I"$B/ysfx/include" "$HERE/uihost.cpp" "$B/ysfx/build/libysfx.a" $LIBS \
  $(pkg-config --libs freetype2 fontconfig 2>/dev/null || echo -lfreetype -lfontconfig) -lpthread -ldl -o "$B/uihost"
echo "built: $B/uihost"
