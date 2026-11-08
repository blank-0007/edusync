#!/usr/bin/env bash
# Render an HTML file to PNG using headless Chrome.
# usage: shot.sh <input.html> <output.png> [width] [height] [scale]
set -euo pipefail
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
IN="$1"; OUT="$2"; W="${3:-1600}"; H="${4:-1000}"; S="${5:-2}"
mkdir -p "$(dirname "$OUT")"
ABS_IN="$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")"
ABS_OUT="$(cd "$(dirname "$OUT")" 2>/dev/null && pwd || (mkdir -p "$(dirname "$OUT")" && cd "$(dirname "$OUT")" && pwd))/$(basename "$OUT")"
"$CHROME" --headless --disable-gpu --hide-scrollbars --no-sandbox \
  --force-device-scale-factor="$S" --default-background-color=ffffff \
  --virtual-time-budget=4000 --window-size="$W,$H" \
  --screenshot="$ABS_OUT" "file://$ABS_IN" 2>&1 | grep -v -E "Fontconfig|DevTools|bytes written" || true
[ -f "$ABS_OUT" ] && echo "OK $ABS_OUT $(sips -g pixelWidth -g pixelHeight "$ABS_OUT" | awk '/pixel/{printf "%s ", $2}')"
