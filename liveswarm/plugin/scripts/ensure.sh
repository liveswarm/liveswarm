#!/bin/sh
# Liveswarm: start the conductor if it is not running. Silent, always exit 0.
[ "$LIVESWARM" = "off" ] && exit 0
FH="${LIVESWARM_HOME:-$HOME/.liveswarm}"
SOCK="$FH/hook.sock"
probe() { [ -S "$SOCK" ] && /usr/bin/curl -s -m 1 -o /dev/null --unix-socket "$SOCK" http://liveswarm/health 2>/dev/null; }
probe && exit 0

DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
CONDUCTOR="$DIR/../conductor/conductor.mjs"
[ -f "$CONDUCTOR" ] || exit 0

NODE=""
if command -v node >/dev/null 2>&1; then NODE="$(command -v node)"; fi
if [ -z "$NODE" ]; then
  for c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME/.volta/bin/node"; do
    [ -x "$c" ] && NODE="$c"
  done
fi
[ -n "$NODE" ] || exit 0

mkdir -p "$FH" 2>/dev/null && chmod 700 "$FH" 2>/dev/null
nohup "$NODE" "$CONDUCTOR" >>"$FH/conductor.log" 2>&1 </dev/null &
disown 2>/dev/null

# Wait briefly so a following emit.sh does not miss the socket.
i=0
while [ $i -lt 30 ]; do
  probe && break
  sleep 0.05
  i=$((i+1))
done
exit 0
