#!/bin/bash
# Release HyprKwin: version, changelog, tag, GitHub release with both
# packages, and install here.
#
#   tools/release.sh 0.17.0
#   HK_DRY_RUN=1 tools/release.sh 0.17.0    # say what it would do, change nothing
#
# The script takes the new version every release. The animations effect
# keeps the version of the release that last changed it: its version only
# moves when something under package-effect/ other than metadata.json has
# changed since the last release. The release notes say which. Both packages
# are attached to every GitHub release either way, so a manual install always
# gets a pair that works together.
#
# Needs a clean tree on main, the changes listed under "## Unreleased" in
# CHANGELOG.md, and gh logged in.
set -euo pipefail

VERSION=${1:?usage: tools/release.sh VERSION}
[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || { echo "not a version: $VERSION" >&2; exit 2; }
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

[ -z "$(git status --porcelain)" ] || { echo "the tree has uncommitted changes" >&2; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "not on main" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && { echo "v$VERSION exists already" >&2; exit 1; }
grep -q '^## Unreleased$' CHANGELOG.md || { echo "CHANGELOG.md has no '## Unreleased' section" >&2; exit 1; }

version_of() {
    python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' "$1/metadata.json"
}
set_version() {
    python3 - "$1/metadata.json" "$2" <<'EOF'
import re, sys
path, version = sys.argv[1], sys.argv[2]
text = open(path).read()
text, n = re.subn(r'("Version":\s*")[^"]*(")', r'\g<1>' + version + r'\2', text, count=1)
assert n == 1, "no Version in " + path
open(path, "w").write(text)
EOF
}

LAST=$(git describe --tags --abbrev=0 --match 'v*')
EFFECT_CHANGES=$(git diff --name-only "$LAST" HEAD -- package-effect/ | grep -v '^package-effect/metadata.json$' || true)

set_version package "$VERSION"
if [ -n "$EFFECT_CHANGES" ]; then
    set_version package-effect "$VERSION"
    EFFECT_NOTE="HyprKwin animations $VERSION (changed in this release)."
else
    EFFECT_NOTE="HyprKwin animations unchanged: $(version_of package-effect) is still current."
fi
EFFECT_VERSION=$(version_of package-effect)

python3 - "$VERSION" "$EFFECT_NOTE" <<'EOF'
import sys
version, note = sys.argv[1], sys.argv[2]
text = open("CHANGELOG.md").read()
text = text.replace("## Unreleased\n", "## %s\n\n*%s*\n" % (version, note), 1)
open("CHANGELOG.md", "w").write(text)
EOF

if [ -n "${HK_DRY_RUN:-}" ]; then
    echo "script $VERSION, animations $EFFECT_VERSION ($LAST..HEAD changed under package-effect/: ${EFFECT_CHANGES:-nothing})"
    awk -v v="## $VERSION" '$0 == v {f=1; print; next} /^## /{if (f) exit} f' CHANGELOG.md | head -6
    git checkout -q -- package/metadata.json package-effect/metadata.json CHANGELOG.md
    exit 0
fi

git commit -q -am "Release $VERSION

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag "v$VERSION"
git push -q origin main "v$VERSION"

DIST=$(mktemp -d)
trap 'rm -rf "$DIST"' EXIT
tools/package.sh "$DIST" >/dev/null
awk -v v="## $VERSION" '$0 == v {f=1; next} /^## /{if (f) exit} f' CHANGELOG.md > "$DIST/notes.md"
gh release create "v$VERSION" --title "HyprKwin $VERSION" --notes-file "$DIST/notes.md" \
    "$DIST/hyprkwin-$VERSION.kwinscript" "$DIST/hyprkwinanimations-$EFFECT_VERSION.kwineffect"

tools/install.sh >/dev/null
echo "Released $VERSION (animations $EFFECT_VERSION): $(gh release view "v$VERSION" --json url --jq .url)"
if [ -n "$EFFECT_CHANGES" ]; then
    echo "KDE Store: upload both files."
else
    echo "KDE Store: upload the script only; the animations are unchanged."
fi
