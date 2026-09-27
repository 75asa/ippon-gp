#!/usr/bin/env bash
# docs/images/src/*.html を headless Chrome で PNG に書き出す。
#   scripts/render-images.sh            # 全部
#   scripts/render-images.sh hero       # 1 枚だけ
# CHROME 環境変数で Chrome のパスを上書きできる（既定は macOS の Google Chrome）。
set -euo pipefail

cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

# 名前  幅  高さ  倍率（README 用は Retina 向けに 2x、social preview は GitHub の上限 1MB に収めるため 1x）
TARGETS=(
  "hero 1600 640 2"
  "social-preview 1280 640 1"
)

for t in "${TARGETS[@]}"; do
  read -r name w h scale <<<"$t"
  [[ $# -gt 0 && "$1" != "$name" ]] && continue
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="$w,$h" --force-device-scale-factor="$scale" \
    --virtual-time-budget=8000 \
    --screenshot="$PWD/docs/images/$name.png" \
    "file://$PWD/docs/images/src/$name.html" 2>/dev/null
  echo "docs/images/$name.png ($((w * scale))x$((h * scale)))"
done
