#!/usr/bin/env bash
# Rebuild every rendered artifact in this pack from its HTML source, then rebuild the PDF brief.
# Usage: tools/render-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell}"
export CHROME

shot() { tools/shot.sh "$@"; }

echo "▸ overview"
shot src/overview.html assets/00-overview.png 1600 1000 2

echo "▸ diagrams"
shot src/diagrams/01-architecture.html       assets/diagrams/01-architecture.png       2400 1400 2
shot src/diagrams/02-sync-sequence.html      assets/diagrams/02-sync-sequence.png      2400 1500 2
shot src/diagrams/03-conflict-ladder.html    assets/diagrams/03-conflict-ladder.png    2400 1350 2
shot src/diagrams/04-sync-state-machine.html assets/diagrams/04-sync-state-machine.png 2200 1300 2
shot src/diagrams/05-exam-integrity.html     assets/diagrams/05-exam-integrity.png     2200 1350 2

echo "▸ mockups"
shot src/mockups/01-library.html        assets/mockups/01-library.png        1600 1000 2
shot src/mockups/02-assignment.html     assets/mockups/02-assignment.png     1600 1000 2
shot src/mockups/03-conflict-inbox.html assets/mockups/03-conflict-inbox.png 1600 1000 2
shot src/mockups/04-sync-center.html    assets/mockups/04-sync-center.png    1600 1000 2
shot src/mockups/05-exam.html           assets/mockups/05-exam.png           1600 1000 2
shot src/mockups/06-instructor.html     assets/mockups/06-instructor.png     1600 1000 2

echo "▸ brief html + pdf"
python3 tools/md2html.py
tools/make-pdf.sh

echo "✓ done"
