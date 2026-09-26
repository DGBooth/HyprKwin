#!/usr/bin/env python3
"""A stand-in for plasmashell's evaluateScript, for the test sandbox.

HyprKwin keeps layout choices across sessions by asking Plasma's desktop
scripting to read and write ~/.config/hyprkwinrc. The sandbox runs KWin
alone, so this answers the two scripts HyprKwin sends, keeping the saved text
in a file the tests can read.

    fakeplasma.py STORE_FILE
"""
import json
import re
import sys

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

LOAD = re.compile(r'^print\(ConfigFile\("hyprkwinrc", "Layouts"\)\.readEntry\("state"\)\)$')
SAVE = re.compile(r'^ConfigFile\("hyprkwinrc", "Layouts"\)\.writeEntry\("state", (".*")\)$', re.S)


class Shell(dbus.service.Object):
    def __init__(self, bus, store):
        super().__init__(bus, "/PlasmaShell")
        self.store = store

    @dbus.service.method("org.kde.PlasmaShell", in_signature="s", out_signature="s")
    def evaluateScript(self, script):
        script = str(script)
        if LOAD.match(script):
            try:
                with open(self.store) as f:
                    return f.read() + "\n"
            except FileNotFoundError:
                return "\n"
        m = SAVE.match(script)
        if m:
            with open(self.store, "w") as f:
                f.write(json.loads(m.group(1)))
            return ""
        raise dbus.exceptions.DBusException("unexpected script: " + script[:200])


def main():
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    name = dbus.service.BusName("org.kde.plasmashell", bus)   # noqa: F841 (held while running)
    Shell(bus, sys.argv[1])
    print("ready", flush=True)
    GLib.MainLoop().run()


if __name__ == "__main__":
    main()
