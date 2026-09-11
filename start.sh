#!/usr/bin/env bash
# Vapor — serve the app on localhost (getUserMedia needs a secure context,
# and localhost counts as one) and open it in the default browser.
cd "$(dirname "$0")"
PORT="${1:-8777}"
echo "Vapor running at http://localhost:$PORT  —  press Ctrl-C to stop"
( sleep 1; open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
