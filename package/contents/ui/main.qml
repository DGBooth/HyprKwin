// HyprKwin's entry point; the script itself is HyprKwin.qml.
//
// KWin keeps the file it starts a script with (always ui/main.qml), and
// everything that file imports, cached for as long as it runs, so reloading a
// script used to re-run the old code until the next login. Code loaded
// through this Loader is not pinned that way, and tools/install.sh also gives
// each version a folder of its own, recorded as BuildId, so every upgrade is
// loaded from a path KWin has never seen. This file itself must stay the same
// from version to version. Installed any other way, no build is recorded and
// the packaged copy next to this file is used.
import QtQuick
import org.kde.kwin

Loader {
    readonly property string build: String(KWin.readConfig("BuildId", "") || "")
    source: build ? "../build-" + build + "/ui/HyprKwin.qml" : "HyprKwin.qml"
    onStatusChanged: {
        if (status === Loader.Error && source.toString().indexOf("/build-") >= 0) {
            console.warn("HyprKwin: build " + build + " is missing, using the packaged copy");
            source = "HyprKwin.qml";
        }
    }
}
