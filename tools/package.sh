#!/bin/bash
# Build the files System Settings installs from, or the KDE Store serves:
#
#   dist/hyprkwin-<version>.kwinscript            (KWin Scripts › Install from File…)
#   dist/hyprkwinanimations-<version>.kwineffect  (Desktop Effects › Get New…)
#
#   tools/package.sh [OUTDIR]
#
# Each is a zip of the package folder with metadata.json at its root, which
# is what kpackagetool6 and the settings pages expect.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT="${1:-$ROOT/dist}"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)

version() {
    python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' "$1/metadata.json"
}

pack() {
    local dir=$1 name=$2 ext=$3
    local file="$OUT/$name-$(version "$dir").$ext"
    rm -f "$file"
    # Leftover per-build folders from a local install never belong in a package.
    (cd "$dir" && zip -q -r -X "$file" . -x 'contents/build-*' -x '*/__pycache__/*')
    echo "$file"
}

# The script package carries the shortcut helper too, so someone installing
# from the store can hand Plasma's keys over (see the settings page).
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -r "$ROOT/package" "$STAGE/package"
mkdir -p "$STAGE/package/contents/tools"
cp "$ROOT/tools/hyprkwin-shortcuts.py" "$STAGE/package/contents/tools/"

pack "$STAGE/package" hyprkwin kwinscript
pack "$ROOT/package-effect" hyprkwinanimations kwineffect
