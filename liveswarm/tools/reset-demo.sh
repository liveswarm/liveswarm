#!/bin/sh
# Restores demo-app/src and index.html to the pristine snapshot so a demo prompt can be re-run.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="$ROOT/fixtures/demo-app-pristine"
[ -d "$SNAP/src" ] || { echo "no pristine snapshot at $SNAP" >&2; exit 1; }
rm -rf "$ROOT/demo-app/src"
cp -R "$SNAP/src" "$ROOT/demo-app/src"
cp "$SNAP/index.html" "$ROOT/demo-app/index.html"
echo "demo-app reset to pristine"
