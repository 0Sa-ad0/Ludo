#!/usr/bin/env bash
# Linux/macOS launcher — the counterpart to start.bat.
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-4000}"

echo
echo "============================================="
echo "   LUDO GAME - Starting Server"
echo "============================================="
echo

if [ ! -d node_modules ]; then
  echo "  [1/3] Installing dependencies..."
  npm install
else
  echo "  [1/3] Dependencies present."
fi

# A production build is required — server.js runs Next in production mode
# whenever NODE_ENV=production, and there is nothing to serve without it.
if [ "${NODE_ENV:-}" = "production" ] && [ ! -d .next ]; then
  echo "  [2/3] Building..."
  npm run build
else
  echo "  [2/3] Skipping build (dev mode compiles on demand)."
fi

if command -v ngrok >/dev/null 2>&1; then
  echo "  [3/3] ngrok found — run 'ngrok http $PORT' in another terminal for internet play."
else
  echo "  [3/3] ngrok not installed — local WiFi only."
fi

echo
exec node server.js
