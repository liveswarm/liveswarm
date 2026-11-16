#!/bin/sh
# Liveswarm: forward one hook payload (stdin) to the conductor unix socket. Silent, always exit 0.
[ "$LIVESWARM" = "off" ] && { cat >/dev/null 2>&1; exit 0; }
SOCK="${LIVESWARM_HOME:-$HOME/.liveswarm}/hook.sock"
if [ ! -S "$SOCK" ]; then cat >/dev/null 2>&1; exit 0; fi
/usr/bin/curl -s -m 1 --unix-socket "$SOCK" --data-binary @- \
  -H 'content-type: application/json' http://liveswarm/v1/hook >/dev/null 2>&1
exit 0
