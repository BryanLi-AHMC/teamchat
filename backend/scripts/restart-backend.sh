#!/bin/bash
set -e

BACKEND_DIR="/Users/alt./Desktop/teamchat/backend"

echo "🔁 Restarting TeamChat backend..."
cd "$BACKEND_DIR"

echo "🛑 Stopping existing backend process on port 3003..."
PID_ON_PORT=$(lsof -ti tcp:3003 || true)
if [ -n "$PID_ON_PORT" ]; then
  echo "Found process on port 3003: $PID_ON_PORT"
  kill $PID_ON_PORT || true
  sleep 1
fi

# Extra safety: stop tsx/node processes launched from this backend directory only.
pkill -f "$BACKEND_DIR.*tsx" || true
pkill -f "$BACKEND_DIR.*node" || true
sleep 1

echo "🚀 Starting backend..."
npm run dev
