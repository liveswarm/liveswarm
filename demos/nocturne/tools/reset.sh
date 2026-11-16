#!/bin/bash
# Restore the pristine blank stage from .pristine/ (src/ and index.html only).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .pristine/src ] || { echo "no .pristine snapshot" >&2; exit 1; }
rm -rf src
cp -R .pristine/src src
cp .pristine/index.html index.html
cp .pristine/vite.config.js vite.config.js
rm -rf dist
echo "nocturne stage restored from .pristine"
