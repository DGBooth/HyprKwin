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
        // A status bar asking hyprkwinctl what is open is not the user doing
        // anything, and must not keep the effect check at its busy rate.
        if (action !== "dumpState") noteActivity();
        if (!driver) return;
        if (action === "dumpState") {
            const state = driver.state();
            state.effectActive = root.effectActive;
            // How often Overview & co. are checked for, in ms (0: not at all).
            state.effectCheck = effectTimer.running ? effectTimer.interval : 0;
            const text = JSON.stringify(state);
            // To hyprkwinctl, which owns org.hyprkwin.Ctl while it waits for
            // an answer. Nobody else is listening, so this goes nowhere
            // otherwise — unlike the journal, where every window title would
            // be kept on disk for weeks.
            stateCall.arguments = [text];
            stateCall.call();
            // The test sandbox (and debug logging) read it from the log.
            const cfg = driver.config();
            if (cfg.stateToLog || cfg.debug) console.warn("HYPRKWIN_STATE " + text);
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

    // One-shot callback for the driver (the end of a divider slide).
    Timer {
        id: laterTimer
        repeat: false
        onTriggered: if (root.driver && !root.shuttingDown) root.driver.later()
    }

    // Panels can change the work area without any signal reaching scripts.
    Timer {
        id: areaTimer
        interval: 1000
        running: root.driver !== null
        repeat: true
        onTriggered: root.driver.checkAreas()
    }

    // Overview and the other fullscreen effects draw their own view of every
    // window, and our overlays must not float over it. KWin tells scripts
    // nothing when one starts (the effects API sees it, but an effect cannot
    // reach a script), so this has to ask. It only asks while there is an
    // overlay to hide, quickly just after any activity — the hot corner and
    // gestures always come with some — and less often once things are idle.
    property int overlaysOnScreen: 0
    property double lastActivity: Date.now()
    function noteActivity() {
        lastActivity = Date.now();
        if (effectTimer.running && effectTimer.interval > effectTimer.busyInterval) {
            effectTimer.interval = effectTimer.busyInterval;
            effectTimer.restart();
        }
    }

    Timer {
        id: effectTimer
        readonly property int busyInterval: 150
        readonly property int idleInterval: 500
        readonly property int busyFor: 10000
        interval: busyInterval
        running: root.driver !== null && (root.overlaysOnScreen > 0 || osd.visible || root.effectActive)
        repeat: true
        onTriggered: {
            root.effectActive = root.fullscreenEffects.some(id => Workspace.isEffectActive(id));
            // While one is up, keep watching closely for it to end.
            interval = root.effectActive || Date.now() - root.lastActivity < busyFor ? busyInterval : idleInterval;
        }
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
        // Focus moving (a click, Alt+Tab) is the user at work as well.
        function onWindowActivated() { root.noteActivity(); }
        function onCursorPosChanged() {
            root.noteActivity();
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

    // KWin's own "Move Mouse to Focus" action: scripts cannot move the
    // pointer themselves, but they can ask KWin to.
    DBusCall {
        id: warpCall
        service: "org.kde.kglobalaccel"
        path: "/component/kwin"
        dbusInterface: "org.kde.kglobalaccel.Component"
        method: "invokeShortcut"
        arguments: ["MoveMouseToFocus"]
    }

    DBusCall {
        id: stateCall
        service: "org.hyprkwin.Ctl"
        path: "/org/hyprkwin/Ctl"
        dbusInterface: "org.hyprkwin.Ctl"
        method: "State"
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

    // Submaps: the keys that enter one are always live, the keys inside it
    // only while it is active. A shortcut exists exactly as long as its
    // handler, so a plain key like Left belongs to applications again the
    // moment the submap ends.
    property var submapEntries: []
    property var submapBinds: []

    Instantiator {
        model: root.submapEntries
        delegate: ShortcutHandler {
            required property var modelData
            name: "HyprKwin submap " + modelData.name
            text: "HyprKwin: submap " + modelData.name
            sequence: modelData.key
            onActivated: root.driver.actions.toggleSubmap(modelData.name)
        }
    }

    Instantiator {
        model: root.submapBinds
        delegate: ShortcutHandler {
            required property var modelData
            name: "HyprKwin submap " + modelData.submap + " " + modelData.key
            text: "HyprKwin: " + modelData.submap + " submap, " + modelData.key
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
    property int bordersShown: 0
    property int barsShown: 0

    Component { id: borderComponent; Border {} }
    // Declared rather than created on demand: KWin only registers an internal
    // window that existed before it was first shown.
    Osd {
        id: osd
        overlaysHidden: root.effectActive || root.shuttingDown
        // Framed in the focus border's colours, so it matches the window it
        // is telling you about.
        accentFromTheme: (root.style.activeBorderSource || 0) === 0
        accentColor: root.style.activeBorderColor || "#33ccff"
        accentColor2: root.style.activeBorderColor2 || "#00ff99"
        gradient: root.style.activeBorderSource === 2
        gradientAngle: root.style.borderGradientAngle || 0
        spinSpeed: root.style.borderGradientSpin || 0
        thickness: root.style.borderSize || 2
    }
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
        bordersShown = list.length;
        overlaysOnScreen = bordersShown + barsShown;
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
            border.activeGradient = cfg.activeBorderSource === 2;
            border.activeColor2 = cfg.activeBorderColor2 || "#00ff99";
            border.gradientAngle = cfg.borderGradientAngle || 0;
            border.spinSpeed = cfg.borderGradientSpin || 0;
            border.inactiveFromTheme = cfg.inactiveBorderSource === 0;
            border.activeColor = cfg.activeBorderColor || "#33ccff";
            border.inactiveColor = cfg.inactiveBorderColor || "#595959";
            border.revision = revision;
        }
        dropMissing(borderObjects, seen);
    }


    // A short message when the layout changes, on the monitor in use.
    function showOsd(text, area, duration) {
        if (shuttingDown) return;
        osd.area = area;
        // 0 means "until hidden" (a submap), so it must not fall back.
        osd.duration = duration === undefined || duration === null ? 1200 : duration;
        osd.showMessage(text);
    }

    function syncGroupBars(list, cfg) {
        style = cfg;
        revision++;
        barsShown = list.length;
        overlaysOnScreen = bordersShown + barsShown;
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
            shortcuts: Shortcuts,
            maximizeArea: KWin.MaximizeArea !== undefined ? KWin.MaximizeArea : 2,
            readConfig: (key, fallback) => KWin.readConfig(key, fallback),
            rect: (x, y, w, h) => Qt.rect(x, y, w, h),
            log: msg => console.warn(msg),
            scheduleLayout: () => layoutTimer.restart(),
            scheduleDecorations: () => decorationTimer.restart(),
            warpPointer: () => warpCall.call(),
            later: ms => {
                laterTimer.interval = ms;
                laterTimer.restart();
            },
            ui: {
                setBorders: (list, cfg) => root.syncBorders(list, cfg),
                setGroupBars: (list, cfg) => root.syncGroupBars(list, cfg),
                showOsd: (text, area, duration) => root.showOsd(text, area, duration),
                hideOsd: () => osd.hide(),
                setSubmaps: (entries) => { root.submapEntries = entries; },
                setSubmapBinds: (binds) => { root.submapBinds = binds; },
            },
        });
        driver.start();
    }

    // Bindings no longer run once the engine is being torn down, so hide the
    // overlay windows explicitly instead of relying on the model emptying.
    // KWin still keeps them until something reaps them, which is why the
    // driver closes leftovers at startup and uninstall.sh sweeps them.
    function hideOverlays() {
        osd.hide();
        for (const key in borderObjects) borderObjects[key].hideAll();
        for (const key in groupBarObjects) groupBarObjects[key].hide();
    }

    Component.onDestruction: {
        shuttingDown = true;
        layoutTimer.stop();
        laterTimer.stop();
        decorationTimer.stop();
        areaTimer.stop();
        effectTimer.stop();
        focusFollowsMouseTimer.stop();
        configWatchTimer.stop();
        hideOverlays();
        if (driver) driver.stop();
    }
}
