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

    // Trailing check so the window under the pointer still wins when the
    // cursor stops between throttled samples.
    Timer {
        id: focusFollowsMouseTimer
        interval: 16
        onTriggered: root.driver.onCursorMoved()
    }

    property double lastPointerCheck: 0

    Connections {
        target: Workspace
        function onCursorPosChanged() {
            if (!root.driver || !root.driver.config().focusFollowsMouse) return;
            // Act on the first motion event over a new window rather than
            // waiting for the pointer to come to rest.
            const now = Date.now();
            if (now - root.lastPointerCheck >= 8) {
                root.lastPointerCheck = now;
                root.driver.onCursorMoved();
            }
            focusFollowsMouseTimer.restart();
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

    // One overlay set per window, keyed by window id. Pooling them by index
    // would make the border slide across the screen when focus moves to
    // another window; keyed this way a border only ever follows its own
    // window, and focus changes simply hide one and show another.
    property var borderObjects: ({})
    property var groupBarObjects: ({})

    Component { id: borderComponent; Border {} }
    Component { id: groupBarComponent; GroupBar {} }

    function dropMissing(map, seen) {
        for (const key in map) {
            if (seen[key]) continue;
            map[key].hideAll();
            map[key].destroy();
            delete map[key];
        }
    }

    function syncBorders(list, cfg) {
        style = cfg;
        revision++;
        const seen = {};
        for (const entry of list) {
            seen[entry.id] = true;
            let border = borderObjects[entry.id];
            if (!border) {
                border = borderComponent.createObject(root, {
                    overlaysHidden: Qt.binding(() => root.effectActive || root.shuttingDown),
                });
                borderObjects[entry.id] = border;
            }
            border.frame = entry;
            border.active = entry.active;
            border.borderWidth = cfg.borderSize || 0;
            border.radius = cfg.borderRadius || 0;
            border.activeFromTheme = cfg.activeBorderSource === 0;
            border.inactiveFromTheme = cfg.inactiveBorderSource === 0;
            border.activeColor = cfg.activeBorderColor || "#33ccff";
            border.inactiveColor = cfg.inactiveBorderColor || "#595959";
            border.revision = revision;
        }
        dropMissing(borderObjects, seen);
    }

    function syncGroupBars(list, cfg) {
        style = cfg;
        revision++;
        const seen = {};
        for (const bar of list) {
            seen[bar.id] = true;
            let groupBar = groupBarObjects[bar.id];
            if (!groupBar) {
                groupBar = groupBarComponent.createObject(root, {
                    overlaysHidden: Qt.binding(() => root.effectActive || root.shuttingDown),
                });
                groupBar.tabClicked.connect(id => root.driver.selectTab(id));
                groupBarObjects[bar.id] = groupBar;
            }
            groupBar.bar = bar;
            groupBar.revision = revision;
        }
        dropMissing(groupBarObjects, seen);
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
                setBorders: (list, cfg) => root.syncBorders(list, cfg),
                setGroupBars: (list, cfg) => root.syncGroupBars(list, cfg),
            },
        });
        driver.start();
    }

    // Bindings no longer run once the engine is being torn down, so hide the
    // overlay windows explicitly instead of relying on the model emptying.
    // KWin still keeps them until something reaps them, which is why the
    // driver closes leftovers at startup and uninstall.sh sweeps them.
    function hideOverlays() {
        for (const key in borderObjects) borderObjects[key].hideAll();
        for (const key in groupBarObjects) groupBarObjects[key].hide();
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
