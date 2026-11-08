#!/usr/bin/env bash
# Start (or stop) the EduSync demo stack: Fastify API on :8787 and Vite app on :5173.
# usage: scripts/demo.sh [start|stop|status]
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p artifacts

port_up() { curl -sf "http://127.0.0.1:$1/" >/dev/null 2>&1 || curl -sf "http://127.0.0.1:$1/api/health" >/dev/null 2>&1; }

start() {
  if [ -f artifacts/demo.pid ] && kill -0 "$(cat artifacts/demo.pid)" 2>/dev/null; then
    echo "already running (pid $(cat artifacts/demo.pid))"; return 0
  fi
  : > artifacts/demo.log
  nohup npm run dev >> artifacts/demo.log 2>&1 &
  echo $! > artifacts/demo.pid
  for _ in $(seq 1 120); do port_up 8787 && port_up 5173 && break; sleep 0.5; done
  echo "API  http://127.0.0.1:8787/api/health"
  echo "App  http://127.0.0.1:5173/?as=u_aarav&page=library"
  echo "Logs artifacts/demo.log (pid $(cat artifacts/demo.pid))"
}

stop() {
  # Kill whatever owns the demo ports plus the dev runner, regardless of how it was started.
  for port in 5173 8787; do
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  if [ -f artifacts/demo.pid ]; then
    kill "$(cat artifacts/demo.pid)" 2>/dev/null || true
    rm -f artifacts/demo.pid
  fi
  sleep 0.5
  echo "stopped"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) port_up 8787 && echo "api up" || echo "api down"; port_up 5173 && echo "web up" || echo "web down" ;;
  *) echo "usage: $0 [start|stop|status]"; exit 2 ;;
esac
