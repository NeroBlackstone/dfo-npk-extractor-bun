#!/bin/bash
set -e
cd "$(dirname "$0")/.."

SRC="./index.ts"
OUTDIR="./dist"
NAME="npk-extractor"

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

bun build "$SRC" \
  --compile \
  --outfile "$OUTDIR/${NAME}-windows-x64.exe" \
  --target "bun-windows-x64"

echo "Build complete!"
ls -lh "$OUTDIR"
