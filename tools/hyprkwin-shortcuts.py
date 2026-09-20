#!/usr/bin/env python3
"""Resolve conflicts between HyprKwin's default shortcuts and other shortcuts.

KDE's global shortcut daemon only gives a key to the first action that claims
it, so HyprKwin's Hyprland-style defaults (Meta+1..0, Meta+Left, Meta+Q, ...)
stay unassigned while Plasma or another script already uses them.

    hyprkwin-shortcuts.py check     list conflicts (changes nothing)
    hyprkwin-shortcuts.py apply     move the keys to HyprKwin, remembering
                                    the previous assignments
    hyprkwin-shortcuts.py restore   give the keys back to their old owners

Everything goes through the running kglobalaccel over D-Bus, the same way
System Settings changes shortcuts, so changes apply immediately.
"""
import json
import os
import sys
import time
from pathlib import Path

import dbus

STATE = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "hyprkwin" / "shortcut-changes.json"
PREFIX = "HyprKwin "


def key_name(k):
    try:
        from PySide6.QtGui import QKeySequence
        return QKeySequence(int(k)).toString() or str(k)
    except Exception:
        return str(k)


def keys_str(keys):
    return ", ".join(key_name(k) for k in keys) or "none"


class Accel:
    def __init__(self):
        self.bus = dbus.SessionBus()
        self.obj = self.bus.get_object("org.kde.kglobalaccel", "/kglobalaccel")
        self.iface = dbus.Interface(self.obj, "org.kde.KGlobalAccel")

    def component(self, name):
        path = self.iface.getComponent(name)
        return dbus.Interface(self.bus.get_object("org.kde.kglobalaccel", path), "org.kde.kglobalaccel.Component")

    @staticmethod
    def _info(i):
        # KGlobalShortcutInfo: uniqueName, friendlyName, componentUniqueName,
        # componentFriendlyName, contextUniqueName, contextFriendlyName, keys, defaultKeys
        return {
            "name": str(i[0]), "friendly": str(i[1]),
            "component": str(i[2]), "componentFriendly": str(i[3]),
            "keys": [int(k) for k in i[6] if int(k)], "defaults": [int(k) for k in i[7] if int(k)],
        }

    def infos(self, component="kwin"):
        return [self._info(i) for i in self.component(component).allShortcutInfos()]

    def owners(self, key):
        return [self._info(i) for i in self.iface.getGlobalShortcutsByKey(dbus.Int32(key))]

    def set_keys(self, info, keys):
        action = dbus.Array([info["component"], info["name"], info["componentFriendly"], info["friendly"]], signature="s")
        self.iface.setForeignShortcut(action, dbus.Array([dbus.Int32(k) for k in keys], signature="i"))


def same(a, b):
    return a["component"] == b["component"] and a["name"] == b["name"]


# HyprKwin registers its keys as active keys; kglobalaccel lets several
# actions list the same key, but only the one registered first receives it.
def conflicts(accel):
    found = []
    for info in accel.infos():
        if not info["name"].startswith(PREFIX) or not info["keys"]:
            continue
        key = info["keys"][0]
        holders = [o for o in accel.owners(key) if not same(o, info)]
        if holders:
            found.append((info, key, holders))
    return found


def cmd_check(accel):
    found = conflicts(accel)
    if not found:
        print("No conflicts: no other shortcut uses a HyprKwin key.")
        return 0
    for info, key, holders in found:
        who = "; ".join("%s / %s" % (h["componentFriendly"], h["friendly"]) for h in holders)
        print("%-20s %-50s also used by %s" % (key_name(key), info["friendly"], who))
    print("\n%d HyprKwin shortcut(s) clash with other shortcuts. Run 'apply' to give the keys to HyprKwin." % len(found))
    return 0


def cmd_apply(accel):
    found = conflicts(accel)
    if not found:
        print("Nothing to do.")
        return 0
    log = json.loads(STATE.read_text()) if STATE.exists() else []
    for info, key, _ in found:
        # Re-read holders: an earlier step may already have changed their keys.
        for h in [o for o in accel.owners(key) if not same(o, info)]:
            remaining = [k for k in h["keys"] if k != key]
            log.append({"action": h, "keys": h["keys"], "time": time.time()})
            accel.set_keys(h, remaining)
            print("freed  %-20s from %s / %s" % (key_name(key), h["componentFriendly"], h["friendly"]))
        # Re-register ours so kglobalaccel grabs the now free key for it.
        accel.set_keys(info, [])
        accel.set_keys(info, [key])
        print("bound  %-20s to   %s" % (key_name(key), info["friendly"]))
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(log, indent=1))
    print("\nPrevious assignments saved to %s ('restore' undoes this)." % STATE)
    return 0


def cmd_restore(accel):
    if not STATE.exists():
        print("No saved changes.")
        return 0
    log = json.loads(STATE.read_text())
    # Undo newest first so every key ends up where it started.
    for entry in reversed(log):
        accel.set_keys(entry["action"], entry["keys"])
        print("restored %-45s -> %s" % (entry["action"]["friendly"], keys_str(entry["keys"])))
    STATE.unlink()
    return 0


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    fn = {"check": cmd_check, "apply": cmd_apply, "restore": cmd_restore}.get(cmd)
    if not fn:
        print(__doc__)
        return 2
    return fn(Accel())


if __name__ == "__main__":
    sys.exit(main())
