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
  --outfile "$OUTDIR/${NAME}-darwin-arm64" \
  --target "bun-darwin-arm64"

echo "Build complete!"
ls -lh "$OUTDIR"
