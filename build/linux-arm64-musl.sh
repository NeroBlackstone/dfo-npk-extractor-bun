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
  --outfile "$OUTDIR/${NAME}-linux-arm64-musl" \
  --target "bun-linux-arm64-musl"

echo "Build complete!"
ls -lh "$OUTDIR"
