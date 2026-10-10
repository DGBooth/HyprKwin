#!/bin/bash
# Run the end-to-end tests against another Plasma, in a container, whatever
# Plasma this machine has:
#
#   tools/test-plasma.sh 6.6                 # the whole suite on Plasma 6.6
#   tools/test-plasma.sh 6.8 scratchpad -v   # some tests, as run.py takes them
#
# 6.6 is KWin 6.6.6 as Ubuntu 26.04 LTS ships it; 6.8 comes from Arch's
# kde-unstable repository (rebuild with HK_REBUILD=1 to pick up a newer
# release candidate). Needs Docker (or podman with its docker
# command). Tests that need Plasma 6.7's per-screen desktops say SKIP on 6.6.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=${1:?which Plasma: $(cd "$ROOT/tests/e2e" && ls -d plasma-* | sed 's/plasma-//' | tr '\n' ' ')}
shift
[ -d "$ROOT/tests/e2e/plasma-$VERSION" ] || { echo "no image for Plasma $VERSION" >&2; exit 2; }
IMAGE=hyprkwin-test:plasma-$VERSION
ENGINE=${CONTAINER_ENGINE:-$(command -v docker || command -v podman)}

BUILD=()
[ -z "${HK_REBUILD:-}" ] || BUILD=(--no-cache --pull)
"$ENGINE" build -q "${BUILD[@]}" -t "$IMAGE" "$ROOT/tests/e2e/plasma-$VERSION" >/dev/null
# The repository is mounted read-only: the sandbox keeps everything it writes
# in the runtime folder. With HK_ARTIFACTS set to a folder, the screenshot and
# KWin log of every failed test are copied there.
ARTIFACTS=()
if [ -n "${HK_ARTIFACTS:-}" ]; then
    mkdir -p "$HK_ARTIFACTS"
    chmod 777 "$HK_ARTIFACTS"       # the container's user is not this one
    ARTIFACTS=(-v "$(cd "$HK_ARTIFACTS" && pwd):/artifacts")
fi
# KWin's virtual backend composites with OpenGL only given a GPU render node;
# without one, the tests that take screenshots or use the effect say SKIP.
# Only a node Mesa drives will do: the image has no NVIDIA libraries.
# HK_NO_GPU=1 leaves it out, as CI has to.
GPU=()
for node in /dev/dri/renderD*; do
    [ -z "${HK_NO_GPU:-}" ] || break
    [ -e "$node" ] || continue
    driver=$(basename "$(readlink -f "/sys/class/drm/$(basename "$node")/device/driver")")
    # KWin 6.8 looks for render nodes itself, and would pick a GPU the
    # container cannot open: name the one it has.
    if [ "$driver" != nvidia ]; then GPU=(--device "$node" -e "KWIN_RENDER_NODES=$node"); break; fi
done
# Plasma 6.8 needs a render device to start at all. With no such GPU it can
# still composite, drawing in software (llvmpipe) into buffers from udmabuf
# (earlier releases fall back to QPainter instead) - though its release
# candidate segfaults that way within a few windows, HyprKwin running or not.
if [ ${#GPU[@]} -eq 0 ] && [ -z "${HK_NO_GPU:-}" ] && [ "$VERSION" != 6.6 ]; then
    if [ -r /dev/udmabuf ]; then
        echo "No Mesa GPU: Plasma $VERSION draws in software, which may crash KWin" >&2
        GPU=(--device /dev/udmabuf --group-add "$(stat -c %g /dev/udmabuf)" -e KWIN_RENDER_NODES=)
    else
        echo "No Mesa GPU and no /dev/udmabuf: Plasma $VERSION cannot start" >&2
    fi
fi

# --init reaps what the tests leave behind; with no core files, a crash in
# the container fails its test without landing in this machine's crash
# records (systemd-coredump sees the container's processes too).
exec "$ENGINE" run --rm --init --ulimit core=0 "${GPU[@]}" -v "$ROOT:/src:ro" "${ARTIFACTS[@]}" "$IMAGE" bash -c '
    python3 tests/e2e/run.py "$@"; status=$?
    [ -d /artifacts ] && cp "$XDG_RUNTIME_DIR"/hyprkwin-fail-* /artifacts/ 2>/dev/null
    exit $status' run "$@"
