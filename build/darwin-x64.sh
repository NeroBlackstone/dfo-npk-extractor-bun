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
  --outfile "$OUTDIR/${NAME}-darwin-x64" \
  --target "bun-darwin-x64"

echo "Build complete!"
ls -lh "$OUTDIR"
