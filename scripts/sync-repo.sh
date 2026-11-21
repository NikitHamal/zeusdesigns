#!/bin/sh
# Mirror the working tree into the zeusdesigns git checkout (excluding build artefacts).
# Rust sources under src-tauri/src are only copied when absent (backend track owns existing files).
set -e
tar cf - \
  --exclude=./node_modules --exclude=./dist --exclude=./zeusdesigns --exclude=./.git \
  --exclude=./src-tauri/target --exclude=./src-tauri/icons --exclude=./src-tauri/src \
  . | (cd zeusdesigns && tar xf -)
(cd src-tauri/src && find . -type f) | while read f; do
  [ -e "zeusdesigns/src-tauri/src/$f" ] || { mkdir -p "zeusdesigns/src-tauri/src/$(dirname "$f")"; cp "src-tauri/src/$f" "zeusdesigns/src-tauri/src/$f"; }
done
