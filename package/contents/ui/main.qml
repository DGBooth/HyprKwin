// HyprKwin: Hyprland-style dwindle tiling for KDE Plasma.
import QtQuick
import QtCore
import Qt.labs.folderlistmodel
import org.kde.kwin
import "../code/engine.js" as Engine
import "../code/rules.js" as Rules
import "../code/driver.js" as Driver
import "../code/shortcuts.js" as Shortcuts
import "../code/build.js" as Build

Item {
    id: root

    property var driver: null
    property var borders: []
    property var groupBars: []
    // Bumped on every decoration update: overlays re-check whether they should
    // be on screen, so one that was closed behind our back comes back.
    property int revision: 0
    // Once KWin starts shutting down, showing a window would build a KWin
    // window against a half-destroyed Workspace and crash the compositor.
    property bool shuttingDown: false
    property var style: ({})
    // Fullscreen effects draw their own view of all windows; hide our
    // overlays so they don't float over it.
    property bool effectActive: false
    readonly property var fullscreenEffects: ["overview", "windowview", "cube", "desktopgrid", "tileseditor", "expo"]

    function run(action) {
        if (!driver) return;
        if (action === "dumpState") {
            const state = driver.state();
            state.effectActive = root.effectActive;
            console.warn("HYPRKWIN_STATE " + JSON.stringify(state));
            return;
        }
        const fn = driver.actions[action];
        if (fn) fn();
    }


    Timer {
        id: layoutTimer
        interval: 0
        onTriggered: root.driver.relayout()
    }

    Timer {
        id: decorationTimer
        interval: 0
        onTriggered: root.driver.updateDecorations()
    }

    // Panels can change the work area without any signal reaching scripts.
    Timer {
        id: areaTimer
        interval: 1000
        running: root.driver !== null
        repeat: true
        onTriggered: root.driver.checkAreas()
    }

    Timer {
        id: effectTimer
        interval: 150
        running: root.driver !== null
        repeat: true
        onTriggered: root.effectActive = root.fullscreenEffects.some(id => Workspace.isEffectActive(id))
    }

    Timer {
        id: focusFollowsMouseTimer
        interval: 40
        onTriggered: root.driver.onCursorMoved()
    }

    Connections {
        target: Workspace
        function onCursorPosChanged() {
            if (root.driver && root.driver.config().focusFollowsMouse) focusFollowsMouseTimer.restart();
        }
    }

    Connections {
        target: Options
        function onConfigChanged() {
            if (root.driver) root.driver.reloadConfig();
        }
    }

    // System Settings writes our settings to kwinrc without telling KWin, so
    // watch the file and ask KWin to re-read its configuration; that emits
    // Options.configChanged, which reloads HyprKwin's settings.
    FolderListModel {
        id: configWatch
        folder: StandardPaths.writableLocation(StandardPaths.ConfigLocation)
        nameFilters: ["kwinrc"]
        showDirs: false
        property var lastModified: null
        property double quietUntil: Date.now() + 5000
        property bool pending: false
        function check() {
            if (count < 1) return;
            const modified = String(get(0, "fileModified"));
            if (lastModified === null) {
                lastModified = modified;
                return;
            }
            if (modified !== lastModified) {
                lastModified = modified;
                pending = true;
            }
            // KWin itself rewrites kwinrc while reconfiguring; wait out that
            // echo, but never drop a change that arrived during the wait.
            if (pending && Date.now() > quietUntil) {
                pending = false;
                quietUntil = Date.now() + 5000;
                reconfigureCall.call();
            }
        }
        onCountChanged: check()
        onDataChanged: check()
    }

    Timer {
        id: configWatchTimer
        interval: 1000
        running: true
        repeat: true
        onTriggered: configWatch.check()
    }

    DBusCall {
        id: reconfigureCall
        service: "org.kde.KWin"
        path: "/KWin"
        dbusInterface: "org.kde.KWin"
        method: "reconfigure"
    }

    Connections {
        target: Workspace
        // KWin writes kwinrc when desktops are added or removed.
        function onDesktopsChanged() { configWatch.quietUntil = Date.now() + 5000; }
    }

    Instantiator {
        model: Shortcuts.shortcutList()
        delegate: ShortcutHandler {
            required property var modelData
            name: modelData.name
            text: modelData.text
            sequence: modelData.key
            onActivated: root.run(modelData.action)
        }
    }

    // Focus borders: one overlay window per border, reused between updates.
    Instantiator {
        id: borderPool
        model: root.borders.length
        delegate: Border {
            required property int index
            readonly property var entry: root.borders[index] || null
            frame: entry
            borderWidth: root.style.borderSize || 0
            revision: root.revision
            active: !!entry && entry.active
            useAccentColor: !!root.style.useAccentColor
            activeColor: root.style.activeBorderColor || "#33ccff"
            inactiveColor: root.style.inactiveBorderColor || "#595959"
            overlaysHidden: root.effectActive || root.shuttingDown
        }
    }

    // Tab bars for window groups.
    Instantiator {
        id: groupBarPool
        model: root.groupBars.length
        delegate: GroupBar {
            required property int index
            bar: root.groupBars[index] || null
            revision: root.revision
            overlaysHidden: root.effectActive || root.shuttingDown
            onTabClicked: id => root.driver.selectTab(id)
        }
    }

    Component.onCompleted: {
        console.warn("HYPRKWIN_BUILD " + Build.BUILD_ID);
        driver = Driver.createDriver({
            workspace: Workspace,
            engine: Engine,
            rules: Rules,
            maximizeArea: KWin.MaximizeArea !== undefined ? KWin.MaximizeArea : 2,
            readConfig: (key, fallback) => KWin.readConfig(key, fallback),
            rect: (x, y, w, h) => Qt.rect(x, y, w, h),
            log: msg => console.warn(msg),
            scheduleLayout: () => layoutTimer.restart(),
            scheduleDecorations: () => decorationTimer.restart(),
            ui: {
                setBorders: (list, cfg) => { root.style = cfg; root.borders = list; root.revision++; },
                setGroupBars: (list, cfg) => { root.style = cfg; root.groupBars = list; root.revision++; },
            },
        });
        driver.start();
    }

    // Bindings no longer run once the engine is being torn down, so hide the
    // overlay windows explicitly instead of relying on the model emptying.
    // KWin still keeps them until something reaps them, which is why the
    // driver closes leftovers at startup and uninstall.sh sweeps them.
    function hideOverlays() {
        for (let i = 0; i < borderPool.count; i++) {
            const border = borderPool.objectAt(i);
            if (border) border.hideAll();
        }
        for (let i = 0; i < groupBarPool.count; i++) {
            const bar = groupBarPool.objectAt(i);
            if (bar) bar.hide();
        }
    }

    Component.onDestruction: {
        shuttingDown = true;
        layoutTimer.stop();
        decorationTimer.stop();
        areaTimer.stop();
        focusFollowsMouseTimer.stop();
        configWatchTimer.stop();
        hideOverlays();
        if (driver) driver.stop();
    }
}
