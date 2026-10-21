#!/bin/bash
# Release HyprKwin: version, changelog, tag, GitHub release with both
# packages, and install here.
#
#   tools/release.sh 0.17.0
#   tools/release.sh --animations 1.0.1     # the animations effect on its own
#   HK_DRY_RUN=1 tools/release.sh 0.17.0    # say what it would do, change nothing
#
# The script takes the new version every release. The animations effect
# keeps the version of the release that last changed it: its version only
# moves when something under package-effect/ other than metadata.json has
# changed since the last release. The release notes say which. Both packages
# are attached to every GitHub release either way, so a manual install always
# gets a pair that works together.
#
# When only the animations have changed, --animations releases them on their
# own (tag animations-vX, a GitHub release with just the effect, not marked
# the latest), so store users of the script are not sent an update that
# changes nothing.
#
# Needs a clean tree on main, the changes listed under "## Unreleased" in
# CHANGELOG.md, and gh logged in.
set -euo pipefail

ANIMATIONS=
if [ "${1:-}" = --animations ]; then
    ANIMATIONS=1
    shift
fi
VERSION=${1:?usage: tools/release.sh [--animations] VERSION}
[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || { echo "not a version: $VERSION" >&2; exit 2; }
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

[ -z "$(git status --porcelain)" ] || { echo "the tree has uncommitted changes" >&2; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "not on main" >&2; exit 1; }
TAG=${ANIMATIONS:+animations-}v$VERSION
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && { echo "$TAG exists already" >&2; exit 1; }
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

# The last release of anything: the script's (vX) or the animations' own.
LAST=$(git describe --tags --abbrev=0 --match 'v*' --match 'animations-v*')
EFFECT_CHANGES=$(git diff --name-only "$LAST" HEAD -- package-effect/ | grep -v '^package-effect/metadata.json$' || true)

[ -z "$ANIMATIONS" ] || [ -n "$EFFECT_CHANGES" ] || { echo "nothing under package-effect/ has changed since $LAST" >&2; exit 1; }
[ -n "$ANIMATIONS" ] || set_version package "$VERSION"
if [ -n "$ANIMATIONS" ]; then
    set_version package-effect "$VERSION"
    EFFECT_NOTE="The script is unchanged: HyprKwin $(version_of package) is still current."
elif [ -n "$EFFECT_CHANGES" ]; then
    set_version package-effect "$VERSION"
    EFFECT_NOTE="HyprKwin animations $VERSION (changed in this release)."
elif [[ $(version_of package-effect) == *-* && $VERSION != *-* ]]; then
    # Last changed in a pre-release: a final release does not ship a
    # pre-release's version.
    EFFECT_NOTE="HyprKwin animations $VERSION (unchanged since $(version_of package-effect))."
    set_version package-effect "$VERSION"
else
    EFFECT_NOTE="HyprKwin animations unchanged: $(version_of package-effect) is still current."
fi
EFFECT_VERSION=$(version_of package-effect)

HEADING=${ANIMATIONS:+HyprKwin animations }$VERSION
python3 - "$HEADING" "$EFFECT_NOTE" <<'EOF'
import sys
heading, note = sys.argv[1], sys.argv[2]
text = open("CHANGELOG.md").read()
text = text.replace("## Unreleased\n", "## %s\n\n*%s*\n" % (heading, note), 1)
open("CHANGELOG.md", "w").write(text)
EOF

if [ -n "${HK_DRY_RUN:-}" ]; then
    echo "$TAG: script $(version_of package), animations $EFFECT_VERSION ($LAST..HEAD changed under package-effect/: ${EFFECT_CHANGES:-nothing})"
    awk -v v="## $HEADING" '$0 == v {f=1; print; next} /^## /{if (f) exit} f' CHANGELOG.md | head -6
    git checkout -q -- package/metadata.json package-effect/metadata.json CHANGELOG.md
    exit 0
fi

git commit -q -am "Release $HEADING

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag "$TAG"
git push -q origin main "$TAG"

DIST=$(mktemp -d)
trap 'rm -rf "$DIST"' EXIT
tools/package.sh "$DIST" >/dev/null
awk -v v="## $HEADING" '$0 == v {f=1; next} /^## /{if (f) exit} f' CHANGELOG.md > "$DIST/notes.md"
# The changelog's links are relative to the repository; on the release page
# they would lead nowhere, so they point at the tagged files instead.
python3 - "$DIST/notes.md" "$TAG" <<'EOF'
import re, sys
path, tag = sys.argv[1], sys.argv[2]
base = "https://github.com/DGBooth/HyprKwin/blob/%s/" % tag
text = open(path).read()
text = re.sub(r"\]\((?!https?:|#|mailto:)([^)\s]+)\)", lambda m: "](" + base + m.group(1) + ")", text)
open(path, "w").write(text)
EOF
# A version with a suffix (1.0.0-rc1) is a pre-release: on GitHub only, not
# shown as the latest release, and not for the KDE Store.
PRE=()
[[ $VERSION == *-* ]] && PRE=(--prerelease)
if [ -n "$ANIMATIONS" ]; then
    # The script's release stays the latest: that is the one people want.
    gh release create "$TAG" "${PRE[@]}" --latest=false --title "HyprKwin animations $VERSION" \
        --notes-file "$DIST/notes.md" "$DIST/hyprkwinanimations-$EFFECT_VERSION.kwineffect"
else
    gh release create "$TAG" "${PRE[@]}" --title "HyprKwin $VERSION" --notes-file "$DIST/notes.md" \
        "$DIST/hyprkwin-$VERSION.kwinscript" "$DIST/hyprkwinanimations-$EFFECT_VERSION.kwineffect"
fi

tools/install.sh >/dev/null
echo "Released $HEADING (script $(version_of package), animations $EFFECT_VERSION): $(gh release view "$TAG" --json url --jq .url)"
if [ ${#PRE[@]} -gt 0 ]; then
    echo "A pre-release: GitHub only, nothing for the KDE Store."
elif [ -n "$ANIMATIONS" ]; then
    echo "KDE Store: upload the animations only; the script is unchanged."
else
    # The store has the last final release of each; pre-releases never went
    # there (a pre-release tag has a dash after the version's dots).
    STORE_TAG=$(git describe --tags --abbrev=0 --match 'v*' --match 'animations-v*' \
        --exclude 'v*-*' --exclude 'animations-v*.*-*' "$LAST" 2>/dev/null || true)
    STORE_EFFECT=$([ -n "$STORE_TAG" ] && git show "$STORE_TAG:package-effect/metadata.json" \
        | python3 -c 'import json, sys; print(json.load(sys.stdin)["KPlugin"]["Version"])' || true)
    if [ "$STORE_EFFECT" != "$EFFECT_VERSION" ]; then
        echo "KDE Store: upload both files (the store's animations are ${STORE_EFFECT:-unknown})."
    else
        echo "KDE Store: upload the script only; the animations are unchanged."
    fi
fi
