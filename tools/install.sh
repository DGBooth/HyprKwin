#!/bin/bash
# Install (or upgrade) HyprKwin for the current user and enable it.
#
#   tools/install.sh            install/upgrade, enable, (re)load
#   tools/install.sh --no-enable
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENABLE=1
[ "${1:-}" = "--no-enable" ] && ENABLE=0

if kpackagetool6 --type=KWin/Script --show hyprkwin >/dev/null 2>&1; then
    kpackagetool6 --type=KWin/Script --upgrade "$ROOT/package"
else
    kpackagetool6 --type=KWin/Script --install "$ROOT/package"
fi

if [ "$ENABLE" = 1 ]; then
    kwriteconfig6 --file kwinrc --group Plugins --key hyprkwinEnabled true
fi

for other in polonium krohnkite bismuth kzones; do
    if [ "$(kreadconfig6 --file kwinrc --group Plugins --key "${other}Enabled")" = "true" ]; then
        echo "warning: the '$other' script is enabled and will fight HyprKwin over window placement."
        echo "         Disable it in System Settings > Window Management > KWin Scripts."
    fi
done

INSTALLED="${XDG_DATA_HOME:-$HOME/.local/share}/kwin/scripts/hyprkwin"
BUILD_ID="$(date +%s%N)"
printf 'var BUILD_ID = "%s";\n' "$BUILD_ID" > "$INSTALLED/contents/code/build.js"

if qdbus6 org.kde.KWin /KWin >/dev/null 2>&1; then
    # Unload first so an upgrade picks up the new code, then let KWin load
    # every enabled script again.
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript hyprkwin >/dev/null || true
    qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
    sleep 2
    if [ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded hyprkwin)" != "true" ]; then
        if [ "$ENABLE" = 1 ]; then
            echo "HyprKwin was installed but did not start; check: journalctl --user -b | grep -i hyprkwin"
            exit 1
        fi
    elif command -v journalctl >/dev/null 2>&1 &&
         ! journalctl --user -b --since "30 seconds ago" 2>/dev/null | grep -q "HYPRKWIN_BUILD $BUILD_ID"; then
        cat <<'STALE'
HyprKwin is running, but KWin is still using a cached copy of a previous
version: KWin keeps a script's QML and JavaScript for the lifetime of its
process, so reloading the script is not enough for an upgrade.

Log out and back in (or restart KWin) to run the version just installed.
STALE
    else
        echo "HyprKwin is running."
    fi
fi

cat <<'EOF'

Next steps:
  * Give HyprKwin its Hyprland-style keys (moves clashing Plasma shortcuts, undoable):
        tools/hyprkwin-shortcuts.py check
        tools/hyprkwin-shortcuts.py apply
  * Settings: System Settings > Window Management > KWin Scripts > HyprKwin (configure icon)
EOF
