#!/usr/bin/env bash
# Print-optimised PDF brief: downscales figures to ~1700px so the PDF stays shareable,
# then prints src/brief.html through headless Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/img/assets/diagrams" "$WORK/img/assets/mockups"
sips -Z 1700 assets/00-overview.png --out "$WORK/img/assets/00-overview.png" >/dev/null
for f in assets/diagrams/*.png assets/mockups/*.png; do
  sips -Z 1700 "$f" --out "$WORK/img/$f" >/dev/null
done

python3 tools/md2html.py "img/" "$WORK/brief.html" >/dev/null

"$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --print-to-pdf="$PWD/assets/EduSync-brief.pdf" "file://$WORK/brief.html" 2>&1 \
  | grep -viE "fontconfig|devtools" || true
