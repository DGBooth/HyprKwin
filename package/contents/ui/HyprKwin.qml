// HyprKwin: Hyprland-style dwindle tiling for KDE Plasma.
import QtQuick
import QtCore
import Qt.labs.folderlistmodel
import org.kde.kwin
import "../code/engine.js" as Engine
import "../code/rules.js" as Rules
import "../code/driver.js" as Driver
import "../code/shortcuts.js" as Shortcuts
import "../code/digitrow.js" as DigitRow
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
            // What the guide's search box has narrowed it to.
            state.keysSearch = keysGuide.visible ? { query: keysGuide.query, shown: keysGuide.shown } : null;
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

    // A panel just changed (see watchPanel in the driver): check the work area
    // every 50ms for the next half second, as KWin and the panel settle on its
    // new space (a panel that grows reserves it a couple of hundred ms later).
    Timer {
        id: areaSoonTimer
        interval: 50
        repeat: true
        property int left: 0
        onTriggered: {
            if (--left <= 0) stop();
            if (root.driver && !root.shuttingDown) root.driver.checkAreas();
        }
    }

    // Panels can change the work area without any signal reaching scripts;
    // the ones that do announce it are caught above, and this catches the rest.
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
        running: root.driver !== null && (root.overlaysOnScreen > 0 || osd.visible || keysGuide.visible || root.effectActive)
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

    // Layout choices kept from one session to the next, in
    // ~/.config/hyprkwinrc. A KWin script cannot write files, so this goes
    // through Plasma's own desktop scripting, which can. At login KWin starts
    // before Plasma, so loading keeps trying for a minute.
    readonly property string storeFile: "hyprkwinrc"
    property var storeLoaded: null        // callback(text | null)
    property int storeAttempts: 0
    property string storePending: ""

    function storeLoad(callback) {
        storeLoaded = callback;
        storeAttempts = 0;
        loadCall.call();
    }

    // Notices shown once (the animations being off, the keys other shortcuts
    // hold) are remembered in ~/.config/hyprkwinrc, [Notices], through
    // plasmashell like the layouts. callback(text), or null where it cannot
    // be asked (no plasmashell): then nothing can be remembered either.
    function noticeGet(key, callback) {
        const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.plasmashell"; '
            + 'path: "/PlasmaShell"; dbusInterface: "org.kde.PlasmaShell"; method: "evaluateScript" }', root);
        call.arguments = ['print(ConfigFile("' + root.storeFile + '", "Notices").readEntry(' + JSON.stringify(key) + '))'];
        call.finished.connect(ret => { call.destroy(); callback(String(ret && ret.length ? ret[0] : "").trim()); });
        call.failed.connect(() => { call.destroy(); callback(null); });
        call.call();
    }
    function noticeSet(key, value) {
        const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.plasmashell"; '
            + 'path: "/PlasmaShell"; dbusInterface: "org.kde.PlasmaShell"; method: "evaluateScript" }', root);
        call.arguments = ['ConfigFile("' + root.storeFile + '", "Notices").writeEntry(' + JSON.stringify(key) + ', '
            + JSON.stringify(String(value)) + ')'];
        call.finished.connect(() => call.destroy());
        call.failed.connect(() => call.destroy());
        call.call();
    }

    // The animations effect as KWin sees it: {installed, on, supported}, or
    // null. Installed means KWin knows it (it only finds a newly installed
    // effect when it starts); supported, that it can run here (an effect
    // needs OpenGL compositing).
    function animationsState(callback) {
        const make = (iface, method) => Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.KWin"; '
            + 'path: "/Effects"; dbusInterface: "' + iface + '"; method: "' + method + '" }', root);
        const ask = (iface, method, args, done) => {
            const call = make(iface, method);
            call.arguments = args;
            call.finished.connect(ret => { call.destroy(); done(ret && ret.length ? ret[0] : null); });
            call.failed.connect(() => { call.destroy(); callback(null); });
            call.call();
        };
        ask("org.kde.kwin.Effects", "isEffectLoaded", ["hyprkwinanimations"], on => {
            if (on) {
                callback({ installed: true, on: true, supported: true });
                return;
            }
            ask("org.freedesktop.DBus.Properties", "Get", ["org.kde.kwin.Effects", "listOfEffects"], list => {
                const installed = !!list && Array.prototype.indexOf.call(list, "hyprkwinanimations") >= 0;
                ask("org.kde.kwin.Effects", "isEffectSupported", ["hyprkwinanimations"], supported => {
                    callback({ installed: installed, on: false, supported: !!supported });
                });
            });
        });
    }

    // Window rules kept the old way (one text entry) move into the list the
    // settings page edits; KWin then reloads the settings, as the page would.
    function moveRules(items) {
        const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.plasmashell"; '
            + 'path: "/PlasmaShell"; dbusInterface: "org.kde.PlasmaShell"; method: "evaluateScript" }', root);
        call.arguments = ['const c = ConfigFile("kwinrc", "Script-hyprkwin"); c.deleteEntry("WindowRules"); '
            + 'c.writeEntry("WindowRuleList", ' + JSON.stringify(items) + ');'];
        call.finished.connect(() => { call.destroy(); rulesMovedTimer.start(); });
        call.failed.connect(() => call.destroy());
        call.call();
    }
    // plasmashell writes its changes 1.5s later.
    Timer {
        id: rulesMovedTimer
        interval: 2500
        onTriggered: if (!root.shuttingDown) reconfigureCall.call()
    }

    function storeSave(text) {
        storePending = text;
        saveTimer.restart();
    }

    DBusCall {
        id: loadCall
        service: "org.kde.plasmashell"
        path: "/PlasmaShell"
        dbusInterface: "org.kde.PlasmaShell"
        method: "evaluateScript"
        arguments: ['print(ConfigFile("' + root.storeFile + '", "Layouts").readEntry("state"))']
        onFinished: (ret) => {
            if (root.shuttingDown || !root.storeLoaded) return;
            const cb = root.storeLoaded;
            root.storeLoaded = null;
            cb(String(ret && ret.length ? ret[0] : "").trim());
        }
        onFailed: {
            if (root.shuttingDown || !root.storeLoaded) return;
            if (++root.storeAttempts < 20) {
                loadRetry.restart();
            } else {
                const cb = root.storeLoaded;
                root.storeLoaded = null;
                cb(null);                   // no Plasma to ask: start afresh
            }
        }
    }

    Timer {
        id: loadRetry
        interval: 3000
        onTriggered: if (!root.shuttingDown) loadCall.call()
    }

    DBusCall {
        id: saveCall
        service: "org.kde.plasmashell"
        path: "/PlasmaShell"
        dbusInterface: "org.kde.PlasmaShell"
        method: "evaluateScript"
    }

    Timer {
        id: saveTimer
        interval: 1500
        onTriggered: {
            // The text is JSON; JSON.stringify makes it a safe string literal
            // in the script Plasma runs.
            saveCall.arguments = ['ConfigFile("' + root.storeFile + '", "Layouts").writeEntry("state", '
                                  + JSON.stringify(root.storePending) + ')'];
            saveCall.call();
        }
    }

    // Who owns a key, by Qt key code: [component, action, component name,
    // action name], or an empty list. A KWin script cannot take a key
    // Plasma already has, so HyprKwin asks, to say which of its are missing.
    function keyOwner(code, callback) {
        const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.kglobalaccel"; '
            + 'path: "/kglobalaccel"; dbusInterface: "org.kde.KGlobalAccel"; method: "action" }', root);
        call.arguments = [code];
        call.finished.connect(ret => { callback(ret && ret.length ? ret[0] : null); call.destroy(); });
        call.failed.connect(() => { callback(null); call.destroy(); });
        call.call();
    }

    // Every KWin shortcut with the keys it has now, for the keys guide:
    // [name, label, component, …, keys (Qt key numbers), default keys].
    function shortcutInfos(callback) {
        const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.kglobalaccel"; '
            + 'path: "/component/kwin"; dbusInterface: "org.kde.kglobalaccel.Component"; method: "allShortcutInfos" }', root);
        call.finished.connect(ret => { callback(ret && ret.length ? ret[0] : []); call.destroy(); });
        call.failed.connect(() => { callback([]); call.destroy(); });
        call.call();
    }

    // Registration settles a moment after start: check the keys after that.
    Timer {
        id: keysTimer
        interval: 6000
        onTriggered: {
            if (!root.driver || root.shuttingDown) return;
            // The layout's workspace keys first; checkKeys follows them.
            root.driver.checkKeyboard(true);
            keyboardTimer.start();
        }
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
        model: Shortcuts.shortcutList().filter(s => !Shortcuts.digitAction(s.action))
        delegate: ShortcutHandler {
            required property var modelData
            name: modelData.name
            text: modelData.text
            sequence: modelData.key
            onActivated: root.run(modelData.action)
        }
    }

    // The workspace keys (Meta with the digit row) apart: their keys depend on
    // the keyboard layout, and a handler's key is fixed once it exists, so
    // giving one the key of another layout means taking it away and making it
    // again. KDE keeps a key it already has for an action, though, so the old
    // one is forgotten first (rebindDigits).
    // One handler per row: only the rows that change are made again (a
    // handler made again without its old key forgotten would hold the key
    // but never fire).
    ListModel {
        id: digitModel
        Component.onCompleted: {
            for (const s of Shortcuts.shortcutList()) {
                if (Shortcuts.digitAction(s.action)) append(root.digitRow(s, s.key));
            }
        }
    }
    function digitRow(s, key) {
        return { rowAction: s.action, rowName: s.name, rowText: s.text, rowKey: key };
    }
    Instantiator {
        model: digitModel
        delegate: ShortcutHandler {
            required property string rowAction
            required property string rowName
            required property string rowText
            required property string rowKey
            name: rowName
            text: rowText
            sequence: rowKey
            onActivated: root.run(rowAction)
        }
    }

    function rebindDigits(changes, done) {
        const actions = Object.keys(changes);
        if (!actions.length) {
            done();
            return;
        }
        // Their handlers go, KDE forgets their keys, and they come back on
        // the new ones.
        for (let i = digitModel.count - 1; i >= 0; i--) {
            if (changes[digitModel.get(i).rowAction] !== undefined) digitModel.remove(i);
        }
        let pending = actions.length;
        const next = () => {
            if (--pending > 0) return;
            for (const s of Shortcuts.shortcutList()) {
                if (changes[s.action] !== undefined) digitModel.append(root.digitRow(s, changes[s.action]));
            }
            done();
        };
        Qt.callLater(() => {
            for (const a of actions) {
                const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.kglobalaccel"; '
                    + 'path: "/kglobalaccel"; dbusInterface: "org.kde.KGlobalAccel"; method: "unregister" }', root);
                call.arguments = ["kwin", "HyprKwin " + a];
                call.finished.connect(() => { call.destroy(); next(); });
                call.failed.connect(() => { call.destroy(); next(); });
                call.call();
            }
        });
    }

    // The keyboard layout in use, from KWin: {layout: "gb", variant: ""}.
    function keyboardLayout(callback) {
        const make = (method) => Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.keyboard"; '
            + 'path: "/Layouts"; dbusInterface: "org.kde.KeyboardLayouts"; method: "' + method + '" }', root);
        const which = make("getLayout");
        which.finished.connect(ret => {
            which.destroy();
            const index = ret && ret.length ? Number(ret[0]) : 0;
            const list = make("getLayoutsList");
            list.finished.connect(r => {
                list.destroy();
                const all = r && r.length ? r[0] : [];
                const l = all && all[index] ? all[index] : null;
                callback(l ? { layout: String(l[0] || ""), variant: String(l[1] || "") } : null);
            });
            list.failed.connect(() => { list.destroy(); callback(null); });
            list.call();
        });
        which.failed.connect(() => { which.destroy(); callback(null); });
        which.call();
    }

    // Switching layouts is not announced to scripts: look every few seconds.
    Timer {
        id: keyboardTimer
        interval: 5000
        repeat: true
        onTriggered: if (root.driver && !root.shuttingDown) root.driver.checkKeyboard()
    }

    // Submaps: the keys that enter one are always live, the keys inside it
    // only while it is active. A shortcut exists exactly as long as its
    // handler, so a plain key like Left belongs to applications again the
    // moment the submap ends.
    property var submapEntries: []
    property var submapBinds: []

    function bindName(b) {
        return "HyprKwin submap " + b.submap + " " + b.key;
    }

    // Keys held only for a while (the keys guide's) are taken out of KDE's
    // list once they are let go, or every one would stay in System Settings.
    function forgetBinds(binds) {
        Qt.callLater(() => {
            for (const b of binds) {
                const call = Qt.createQmlObject('import org.kde.kwin; DBusCall { service: "org.kde.kglobalaccel"; '
                    + 'path: "/kglobalaccel"; dbusInterface: "org.kde.KGlobalAccel"; method: "unregister" }', root);
                call.arguments = ["kwin", root.bindName(b)];
                call.finished.connect(() => call.destroy());
                call.failed.connect(() => call.destroy());
                call.call();
            }
        });
    }

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
            name: root.bindName(modelData)
            text: "HyprKwin: " + modelData.submap + " submap, " + modelData.key
            sequence: modelData.key
            onActivated: modelData.type !== undefined ? root.driver.typeKeys(modelData.type) : root.run(modelData.action)
        }
    }

    // One overlay set per window, keyed by window id. Pooling them by index
    // would make the border slide across the screen when focus moves to
    // another window; keyed this way a border only ever follows its own
    // window, and focus changes simply hide one and show another.
    property var borderObjects: ({})
    property var groupBarObjects: ({})
    property var iconTileObjects: ({})
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
    KeysGuide {
        id: keysGuide
        overlaysHidden: root.effectActive || root.shuttingDown
        accentFromTheme: (root.style.activeBorderSource || 0) === 0
        accentColor: root.style.activeBorderColor || "#33ccff"
        accentColor2: root.style.activeBorderColor2 || "#00ff99"
        gradient: root.style.activeBorderSource === 2
        gradientAngle: root.style.borderGradientAngle || 0
        thickness: root.style.borderSize || 2
        // Overview and the like hid it: the guide is over, keys and all.
        onDismissed: root.run("closeKeys")
    }
    Component { id: groupBarComponent; GroupBar {} }
    Component { id: iconTileComponent; IconTile {} }

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

    // Icon tiles come and go by the dozen (a layout switch with many windows
    // open), and making each a window of its own is what costs: the ones no
    // longer needed wait, hidden, to be used again rather than destroyed.
    property var spareIconTiles: []
    readonly property int maxSpareIconTiles: 64

    function syncIconTiles(list) {
        revision++;
        const seen = {};
        for (const tile of list) seen[tile.id] = true;
        // Let go of the ones not needed first, so they can be used again now.
        for (const key in iconTileObjects) {
            if (seen[key]) continue;
            const icon = iconTileObjects[key];
            delete iconTileObjects[key];
            icon.tile = null;               // hidden: not ready
            if (spareIconTiles.length < maxSpareIconTiles) spareIconTiles.push(icon);
            else icon.destroy();
        }
        for (const tile of list) {
            let icon = iconTileObjects[tile.id];
            if (!icon) {
                icon = spareIconTiles.pop();
                if (!icon) {
                    icon = iconTileComponent.createObject(root, {
                        overlaysHidden: Qt.binding(() => root.effectActive || root.shuttingDown),
                    });
                    icon.opened.connect(id => root.driver.openTile(id));
                }
                iconTileObjects[tile.id] = icon;
            }
            icon.tile = tile;
            icon.revision = revision;
        }
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
            options: Options,
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
            keyOwner: (code, callback) => root.keyOwner(code, callback),
            shortcutInfos: (callback) => root.shortcutInfos(callback),
            digitTable: DigitRow.DIGIT_ROW,
            moveRules: (items) => root.moveRules(items),
            notices: {
                get: (key, callback) => root.noticeGet(key, callback),
                set: (key, value) => root.noticeSet(key, value),
            },
            animationsState: (callback) => root.animationsState(callback),
            after: (ms, fn) => {
                const t = Qt.createQmlObject('import QtQuick; Timer {}', root);
                t.interval = ms;
                t.triggered.connect(() => { t.destroy(); if (!root.shuttingDown) fn(); });
                t.start();
            },
            keyboardLayout: (callback) => root.keyboardLayout(callback),
            store: {
                load: (callback) => root.storeLoad(callback),
                save: (text) => root.storeSave(text),
            },
            areaSoon: () => {
                areaSoonTimer.left = 10;
                areaSoonTimer.restart();
            },
            later: ms => {
                laterTimer.interval = ms;
                laterTimer.restart();
            },
            ui: {
                setBorders: (list, cfg) => root.syncBorders(list, cfg),
                setGroupBars: (list, cfg) => root.syncGroupBars(list, cfg),
                setIconTiles: (list) => root.syncIconTiles(list),
                showOsd: (text, area, duration) => root.showOsd(text, area, duration),
                hideOsd: () => osd.hide(),
                showKeys: (sections, area) => { if (!root.shuttingDown) keysGuide.open(sections, area); },
                hideKeys: () => keysGuide.hide(),
                scrollKeys: (how) => keysGuide.scroll(how),
                clearKeysSearch: () => keysGuide.clearSearch(),
                rebindDigits: (changes, done) => root.rebindDigits(changes, done),
                typeKeys: (k) => keysGuide.type(k),
                forgetBinds: (binds) => { if (!root.shuttingDown) root.forgetBinds(binds); },
                // Only when they change: a shortcut destroyed and made again
                // straight away can end up inactive in Plasma 6.6, listed on
                // its key but deaf to it.
                setSubmaps: (entries) => {
                    if (JSON.stringify(entries) !== JSON.stringify(root.submapEntries)) root.submapEntries = entries;
                },
                setSubmapBinds: (binds) => { root.submapBinds = binds; },
            },
        });
        driver.start();
        keysTimer.start();
    }

    // Bindings no longer run once the engine is being torn down, so hide the
    // overlay windows explicitly instead of relying on the model emptying.
    // KWin still keeps them until something reaps them, which is why the
    // driver closes leftovers at startup and uninstall.sh sweeps them.
    function hideOverlays() {
        osd.hide();
        keysGuide.hide();
        for (const key in borderObjects) borderObjects[key].hideAll();
        for (const key in groupBarObjects) groupBarObjects[key].hide();
        for (const key in iconTileObjects) iconTileObjects[key].hide();
        for (const icon of spareIconTiles) icon.hide();
    }

    Component.onDestruction: {
        shuttingDown = true;
        layoutTimer.stop();
        laterTimer.stop();
        decorationTimer.stop();
        areaTimer.stop();
        areaSoonTimer.stop();
        effectTimer.stop();
        loadRetry.stop();
        keysTimer.stop();
        focusFollowsMouseTimer.stop();
        configWatchTimer.stop();
        hideOverlays();
        if (driver) driver.stop();
    }
}
