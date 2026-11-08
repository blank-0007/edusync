#!/usr/bin/env bash
# Screenshot a running EduSync page with headless Chrome.
# usage: scripts/shot-app.sh "<url>" <out.png> [width] [height]
set -euo pipefail
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
URL="$1"; OUT="$2"; W="${3:-1600}"; H="${4:-1000}"
mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --window-size="$W,$H" \
  --virtual-time-budget=8000 --run-all-compositor-stages-before-draw \
  --screenshot="$OUT" "$URL" >/dev/null 2>&1 || true
if [ -f "$OUT" ]; then echo "OK $OUT"; else echo "FAILED: no screenshot for $URL" >&2; exit 1; fi
