#!/bin/bash
# Install (or upgrade) HyprKwin for the current user and enable it.
#
#   tools/install.sh            install/upgrade, enable, (re)load
#   tools/install.sh --no-enable
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENABLE=1
[ "${1:-}" = "--no-enable" ] && ENABLE=0

# Snapshot every global shortcut before HyprKwin changes any, so uninstall.sh
# can put them all back. An existing snapshot is kept: upgrades never
# overwrite the original.
if qdbus6 org.kde.kglobalaccel /kglobalaccel >/dev/null 2>&1; then
    python3 "$ROOT/tools/hyprkwin-shortcuts.py" backup ||
        echo "warning: could not back up your shortcuts; run 'tools/hyprkwin-shortcuts.py backup' before 'apply'."
else
    echo "note: Plasma is not running, so your shortcuts were not backed up yet."
    echo "      Once logged in, run 'tools/hyprkwin-shortcuts.py backup' before 'apply'."
fi

if kpackagetool6 --type=KWin/Script --show hyprkwin >/dev/null 2>&1; then
    kpackagetool6 --type=KWin/Script --upgrade "$ROOT/package"
else
    kpackagetool6 --type=KWin/Script --install "$ROOT/package"
fi

# Animations live in a companion KWin effect: scripts cannot draw or animate
# anything themselves.
if kpackagetool6 --type=KWin/Effect --show hyprkwinanimations >/dev/null 2>&1; then
    kpackagetool6 --type=KWin/Effect --upgrade "$ROOT/package-effect"
else
    kpackagetool6 --type=KWin/Effect --install "$ROOT/package-effect"
fi

# Window rules kept as text by older versions move into the settings page's
# list, so they can be seen and edited there.
python3 "$ROOT/tools/hyprkwin-rules.py" migrate || true

if [ "$ENABLE" = 1 ]; then
    kwriteconfig6 --file kwinrc --group Plugins --key hyprkwinEnabled true
    kwriteconfig6 --file kwinrc --group Plugins --key hyprkwinanimationsEnabled true
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
# KWin caches a script's code by file path for as long as it runs, so this
# version also goes into a folder of its own, which the entry point
# (ui/loader.qml) loads. That is what lets an upgrade apply without logging out.
mkdir -p "$INSTALLED/contents/build-$BUILD_ID"
cp -r "$INSTALLED/contents/ui" "$INSTALLED/contents/code" "$INSTALLED/contents/build-$BUILD_ID/"
kwriteconfig6 --file kwinrc --group Script-hyprkwin --key BuildId "$BUILD_ID"
EFFECT_INSTALLED="${XDG_DATA_HOME:-$HOME/.local/share}/kwin/effects/hyprkwinanimations"
sed -i "s/^const BUILD = \"source\";/const BUILD = \"$BUILD_ID\";/" "$EFFECT_INSTALLED/contents/code/main.js"

# The script logs its build when it starts; the journal, or HYPRKWIN_LOG when
# KWin logs somewhere else (the test sandbox).
running_this_build() {
    for _ in $(seq 1 20); do
        if [ -n "${HYPRKWIN_LOG:-}" ]; then
            grep -q "HYPRKWIN_BUILD $BUILD_ID" "$HYPRKWIN_LOG" 2>/dev/null && return 0
        elif command -v journalctl >/dev/null 2>&1; then
            journalctl --user -b --since "60 seconds ago" 2>/dev/null | grep -q "HYPRKWIN_BUILD $BUILD_ID" && return 0
        else
            return 0
        fi
        sleep 0.25
    done
    return 1
}

if qdbus6 org.kde.KWin /KWin >/dev/null 2>&1; then
    # Unload first so an upgrade picks up the new code, then let KWin load
    # every enabled script again.
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript hyprkwin >/dev/null || true
    qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
    # Effects are not cached the way scripts are: reloading one runs its new code.
    if [ "$(qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.isEffectLoaded hyprkwinanimations 2>/dev/null)" = "true" ]; then
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect hyprkwinanimations >/dev/null || true
        qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect hyprkwinanimations >/dev/null || true
    fi
    sleep 1
    if [ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded hyprkwin)" != "true" ]; then
        if [ "$ENABLE" = 1 ]; then
            echo "HyprKwin was installed but did not start; check: journalctl --user -b | grep -i hyprkwin"
            exit 1
        fi
    elif ! running_this_build; then
        cat <<'STALE'
HyprKwin is running, but KWin is still using a cached copy of a previous
version. That happens once, when upgrading from a version older than 0.7:
KWin keeps the old entry point cached until it restarts.

Log out and back in (or restart KWin) to run the version just installed.
From then on, upgrades apply straight away without logging out.
STALE
    else
        echo "HyprKwin is running the version just installed (no need to log out)."
    fi
fi

cat <<'EOF'

Next steps:
  * Give HyprKwin its Hyprland-style keys (moves clashing Plasma shortcuts, undoable):
        tools/hyprkwin-shortcuts.py check
        tools/hyprkwin-shortcuts.py apply
  * Settings: System Settings > Window Management > KWin Scripts > HyprKwin (configure icon)
  * Animations: System Settings > Window Management > Desktop Effects > "HyprKwin animations"
    (KWin only discovers a newly installed effect after a restart, so log out and back in)
EOF
