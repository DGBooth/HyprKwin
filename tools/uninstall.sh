#!/bin/bash
# Disable and remove HyprKwin. Restores shortcuts changed by
# hyprkwin-shortcuts.py first, if any.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [ -f "${XDG_DATA_HOME:-$HOME/.local/share}/hyprkwin/shortcut-changes.json" ]; then
    python3 "$ROOT/tools/hyprkwin-shortcuts.py" restore
fi

kwriteconfig6 --file kwinrc --group Plugins --key hyprkwinEnabled false
kwriteconfig6 --file kwinrc --group Plugins --key hyprkwinanimationsEnabled false
if qdbus6 org.kde.KWin /KWin >/dev/null 2>&1; then
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript hyprkwin >/dev/null || true
    qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
    # KWin does not reap a script's overlay windows when the script goes away,
    # so close any that are left over with a throwaway script.
    tmp=$(mktemp -d)
    cat > "$tmp/main.qml" <<'QML'
import QtQuick
import org.kde.kwin
Item { Timer { interval: 100; running: true; onTriggered: {
  for (const w of Workspace.windows)
      if (w.pid <= 0 && !w.resourceClass && String(w.caption) === "HyprKwin overlay") w.closeWindow();
}}}
QML
    name="hyprkwin-cleanup-$$"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadDeclarativeScript "$tmp/main.qml" "$name" >/dev/null || true
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null || true
    sleep 1
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$name" >/dev/null || true
    rm -rf "$tmp"
fi

# Forget HyprKwin's own shortcuts (Plasma's were restored above). With the
# script unloaded nothing re-registers them.
removed=0
if qdbus6 org.kde.kglobalaccel /kglobalaccel >/dev/null 2>&1; then
    while IFS= read -r action; do
        [[ $action == "HyprKwin "* ]] || continue
        qdbus6 org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel.unregister kwin "$action" >/dev/null || true
        removed=$((removed + 1))
    done < <(qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.shortcutNames 2>/dev/null || true)
else
    # No session running: edit the file kglobalaccel reads at startup.
    shortcuts="${XDG_CONFIG_HOME:-$HOME/.config}/kglobalshortcutsrc"
    if [ -f "$shortcuts" ]; then
        while IFS= read -r action; do
            kwriteconfig6 --file kglobalshortcutsrc --group kwin --key "$action" --delete
            removed=$((removed + 1))
        done < <(sed -n '/^\[kwin\]$/,/^\[/{s/^\(HyprKwin [^=]*\)=.*/\1/p}' "$shortcuts")
    fi
fi
echo "Removed $removed HyprKwin shortcuts."
kpackagetool6 --type=KWin/Script --remove hyprkwin
kpackagetool6 --type=KWin/Effect --remove hyprkwinanimations 2>/dev/null || true
echo "HyprKwin removed. Its settings remain in ~/.config/kwinrc under [Script-hyprkwin]"
echo "(and [Effect-hyprkwinanimations], if you changed the animation settings)."
