#!/bin/bash
# Run the end-to-end tests against Plasma 6.6 (KWin 6.6.6, as Ubuntu 26.04
# LTS ships it), in a container, whatever Plasma this machine has:
#
#   tools/test-plasma-6.6.sh                 # the whole suite
#   tools/test-plasma-6.6.sh scratchpad -v   # some tests, as run.py takes them
#
# Needs Docker (or podman with its docker command). Tests that need Plasma
# 6.7's per-screen desktops say SKIP.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE=hyprkwin-test:plasma-6.6
ENGINE=${CONTAINER_ENGINE:-$(command -v docker || command -v podman)}

"$ENGINE" build -q -t "$IMAGE" "$ROOT/tests/e2e/plasma-6.6" >/dev/null
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
    if [ "$driver" != nvidia ]; then GPU=(--device "$node"); break; fi
done

# --init reaps what the tests leave behind; with no core files, a crash in
# the container fails its test without landing in this machine's crash
# records (systemd-coredump sees the container's processes too).
exec "$ENGINE" run --rm --init --ulimit core=0 "${GPU[@]}" -v "$ROOT:/src:ro" "${ARTIFACTS[@]}" "$IMAGE" bash -c '
    python3 tests/e2e/run.py "$@"; status=$?
    [ -d /artifacts ] && cp "$XDG_RUNTIME_DIR"/hyprkwin-fail-* /artifacts/ 2>/dev/null
    exit $status' run "$@"
