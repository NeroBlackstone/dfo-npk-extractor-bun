#!/bin/bash
set -e

SRC="./index.ts"
NAME="npk-extractor"
OUTDIR="./dist"

# 清理并创建输出目录
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

# 定义所有目标平台
TARGETS=(
  # name, target, extension
  "linux-x64-glibc:bun-linux-x64:"
  "linux-arm64-glibc:bun-linux-arm64:"
  "windows-x64:bun-windows-x64:.exe"
  "windows-arm64:bun-windows-arm64:.exe"
  "darwin-x64:bun-darwin-x64:"
  "darwin-arm64:bun-darwin-arm64:"
  "linux-x64-musl:bun-linux-x64-musl:"
  "linux-arm64-musl:bun-linux-arm64-musl:"
)

echo "Building $NAME for all platforms..."
echo ""

for entry in "${TARGETS[@]}"; do
  IFS=':' read -r platform target ext <<< "$entry"
  outfile="${OUTDIR}/${NAME}-${platform}${ext}"

  echo "Building $platform..."

  # bun build 命令
  bun build "$SRC" \
    --compile \
    --outfile "$outfile" \
    --target "$target"

  echo "  -> $outfile"
done

echo ""
echo "Build complete! Output in $OUTDIR/"
ls -lh "$OUTDIR"
