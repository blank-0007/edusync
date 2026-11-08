#!/usr/bin/env bash
# One-command acceptance: types, unit tests, HTTP e2e, web build, then a real-browser
# UI run against a fresh database. Leaves screenshots in artifacts/ui/.
set -uo pipefail
cd "$(dirname "$0")/.."
FAILED=0
step() { echo; echo "▸ $*"; }
run() { step "$*"; if ! "$@"; then FAILED=1; echo "  \x1b[31mfailed: $*\x1b[0m"; fi; }

free_ports() {
  for port in 5173 8787; do
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  sleep 1
}

run npm run typecheck
run npm test
run npm run e2e
run npm -w @edusync/web run build

step "fresh database + demo stack"
scripts/demo.sh stop >/dev/null 2>&1 || true
free_ports
rm -rf apps/server/data
scripts/demo.sh start
UI_STATUS=0
npm run ui || UI_STATUS=$?
FAILED=$(( FAILED + (UI_STATUS != 0 ? 1 : 0) ))

step "stopping demo stack"
scripts/demo.sh stop >/dev/null 2>&1 || true

echo
if [ "$FAILED" -eq 0 ]; then
  echo -e "\x1b[32mALL CHECKS PASSED\x1b[0m — screenshots in artifacts/ui/"
  exit 0
else
  echo -e "\x1b[31m$FAILED STEP(S) FAILED\x1b[0m"
  exit 1
fi
