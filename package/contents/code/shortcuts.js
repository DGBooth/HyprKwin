// Global shortcuts. Defaults follow Hyprland/Omarchy bindings (SUPER = Meta).
// Shifted symbols use the character they produce on a US layout, the way
// Plasma stores them (Shift+1 is "Meta+!", Shift+- is "Meta+_").
// Every entry can be rebound in System Settings > Keyboard > Shortcuts > KWin.

var SHIFTED_DIGITS = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

function shortcutList() {
    var list = [
        ["close", "Close window", "Meta+Q"],
        ["toggleSplit", "Toggle window split", "Meta+J"],
        ["swapSplit", "Swap split halves", ""],
        ["pseudo", "Pseudotile window", "Meta+P"],
        ["toggleFloating", "Toggle window floating/tiling", "Meta+T"],
        ["fullscreen", "Full screen", "Meta+F"],
        ["maximize", "Full width (maximize)", "Meta+Alt+F"],
        ["pin", "Pop window out (float & pin)", "Meta+O"],

        ["focusLeft", "Focus window left", "Meta+Left"],
        ["focusRight", "Focus window right", "Meta+Right"],
        ["focusUp", "Focus window above", "Meta+Up"],
        ["focusDown", "Focus window below", "Meta+Down"],
        ["swapLeft", "Swap window left", "Meta+Shift+Left"],
        ["swapRight", "Swap window right", "Meta+Shift+Right"],
        ["swapUp", "Swap window up", "Meta+Shift+Up"],
        ["swapDown", "Swap window down", "Meta+Shift+Down"],
        ["moveLeft", "Move window left", ""],
        ["moveRight", "Move window right", ""],
        ["moveUp", "Move window up", ""],
        ["moveDown", "Move window down", ""],

        ["resizeLeft", "Move split left", "Meta+-"],
        ["resizeRight", "Move split right", "Meta+="],
        ["resizeUp", "Move split up", "Meta+_"],
        ["resizeDown", "Move split down", "Meta++"],
        ["resizeLeftSmall", "Move split left a little", "Meta+Alt+-"],
        ["resizeRightSmall", "Move split right a little", "Meta+Alt+="],
        ["resizeUpSmall", "Move split up a little", "Meta+Alt+_"],
        ["resizeDownSmall", "Move split down a little", "Meta+Alt++"],
        ["resizeLeftLarge", "Move split left a lot", "Meta+Ctrl+-"],
        ["resizeRightLarge", "Move split right a lot", "Meta+Ctrl+="],
        ["resizeUpLarge", "Move split up a lot", "Meta+Ctrl+_"],
        ["resizeDownLarge", "Move split down a lot", "Meta+Ctrl++"],

        ["nextDesktop", "Next workspace", "Meta+Tab"],
        ["previousDesktop", "Previous workspace", "Meta+Shift+Tab"],
        ["formerDesktop", "Former workspace", "Meta+Ctrl+Tab"],
        ["toggleSpecial", "Toggle scratchpad", "Meta+S"],
        ["moveToSpecial", "Move window to/from scratchpad", "Meta+Alt+S"],
        ["workspaceToMonitorLeft", "Move workspace to left monitor", "Meta+Shift+Alt+Left"],
        ["workspaceToMonitorRight", "Move workspace to right monitor", "Meta+Shift+Alt+Right"],
        ["workspaceToMonitorUp", "Move workspace to upper monitor", "Meta+Shift+Alt+Up"],
        ["workspaceToMonitorDown", "Move workspace to lower monitor", "Meta+Shift+Alt+Down"],
        ["windowToMonitorLeft", "Move window to left monitor", "Meta+Ctrl+Shift+Left"],
        ["windowToMonitorRight", "Move window to right monitor", "Meta+Ctrl+Shift+Right"],
        ["windowToMonitorUp", "Move window to upper monitor", "Meta+Ctrl+Shift+Up"],
        ["windowToMonitorDown", "Move window to lower monitor", "Meta+Ctrl+Shift+Down"],
        ["focusNextMonitor", "Focus next monitor", "Ctrl+Alt+Tab"],
        ["focusPreviousMonitor", "Focus previous monitor", "Ctrl+Alt+Shift+Tab"],

        ["cycleLayout", "Next layout (dwindle, master, monocle, scrolling)", "Meta+Shift+J"],
        ["cycleLayoutBack", "Previous layout", ""],
        ["layoutDwindle", "Use the dwindle layout", ""],
        ["layoutMaster", "Use the master layout", ""],
        ["layoutMonocle", "Use the monocle layout", ""],
        ["layoutScrolling", "Use the scrolling layout", ""],
        ["masterSwap", "Swap window with the master", "Meta+M"],
        ["masterFocus", "Focus the master window", "Meta+Shift+M"],
        ["masterCountIncrease", "One more master window", "Meta+>"],
        ["masterCountDecrease", "One fewer master window", "Meta+<"],
        ["masterOrientationNext", "Move the master area round", "Meta+Alt+M"],
        ["masterOrientationPrevious", "Move the master area back", ""],
        ["cycleNext", "Focus next window in the layout", ""],
        ["cyclePrevious", "Focus previous window in the layout", ""],

        ["toggleGroup", "Toggle window grouping", "Meta+G"],
        ["leaveGroup", "Move window out of group", "Meta+Alt+G"],
        ["intoGroupLeft", "Move window into group on the left", "Meta+Alt+Left"],
        ["intoGroupRight", "Move window into group on the right", "Meta+Alt+Right"],
        ["intoGroupUp", "Move window into group above", "Meta+Alt+Up"],
        ["intoGroupDown", "Move window into group below", "Meta+Alt+Down"],
        ["groupNext", "Next window in group", "Meta+Alt+Tab"],
        ["groupPrevious", "Previous window in group", "Meta+Alt+Shift+Tab"],
        ["groupPreviousAlt", "Previous window in group (alt)", "Meta+Ctrl+Left"],
        ["groupNextAlt", "Next window in group (alt)", "Meta+Ctrl+Right"],

        ["retile", "Reload configuration and retile", ""],
        ["dumpState", "Log internal state (debug)", ""],
    ];
    // Extra scratchpads, named in HyprKwin's settings. Unbound by default:
    // Hyprland users pick their own keys for these.
    for (var n = 1; n <= 4; n++) {
        list.push(["toggleScratchpad" + n, "Toggle scratchpad " + n + " (named in HyprKwin settings)", ""]);
        list.push(["moveToScratchpad" + n, "Move window to/from scratchpad " + n, ""]);
    }
    for (var i = 1; i <= 10; i++) {
        var key = String(i % 10);
        list.push(["desktop" + i, "Switch to workspace " + i, "Meta+" + key]);
        list.push(["moveToDesktop" + i, "Move window to workspace " + i, "Meta+" + SHIFTED_DIGITS[i - 1]]);
        list.push(["moveToDesktopSilent" + i, "Move window silently to workspace " + i, "Meta+Alt+" + SHIFTED_DIGITS[i - 1]]);
        if (i <= 5) list.push(["groupWindow" + i, "Switch to group window " + i, "Meta+Alt+" + key]);
    }
    return list.map(function (s) {
        return { action: s[0], name: "HyprKwin " + s[0], text: "HyprKwin: " + s[1], key: s[2] };
    });
}

// ---- submaps -----------------------------------------------------------
//
// Hyprland's submaps: a key puts the keyboard into a mode where plain keys do
// something until Escape. One per line, as the settings page keeps them:
//
//   resize = Meta+R, Left: resizeLeft, Right: resizeRight
//
// The keys inside a submap are only registered while it is active, so they
// are free for applications the rest of the time. Escape always leaves, and
// so does the key that entered.

function parseSubmaps(text, actions) {
    var submaps = [];
    var errors = [];
    var seen = {};
    String(text || "").split(/\r?\n/).forEach(function (raw, lineNo) {
        var line = raw.trim();
        if (!line || line.charAt(0) === "#") return;
        var where = "line " + (lineNo + 1) + ": ";
        var eq = line.indexOf("=");
        if (eq < 0) {
            errors.push(where + "a submap is 'name = key, key: action, ...'");
            return;
        }
        var name = line.slice(0, eq).trim();
        var parts = line.slice(eq + 1).split(",").map(function (p) { return p.trim(); }).filter(function (p) { return p; });
        if (!name || !parts.length) {
            errors.push(where + "a submap needs a name and the key that enters it");
            return;
        }
        if (seen[name]) {
            errors.push(where + "there is already a submap called '" + name + "'");
            return;
        }
        var entry = parts.shift();
        if (entry.indexOf(":") >= 0) {
            errors.push(where + "the key that enters the submap comes first, e.g. " + name + " = Meta+R, Left: resizeLeft");
            return;
        }
        var binds = [];
        var ok = true;
        parts.forEach(function (p) {
            var at = p.indexOf(":");
            if (at < 0) {
                errors.push(where + "'" + p + "' should be a key and an action, e.g. Left: resizeLeft");
                ok = false;
                return;
            }
            var key = p.slice(0, at).trim(), action = p.slice(at + 1).trim();
            if (!key || !action) {
                errors.push(where + "'" + p + "' should be a key and an action, e.g. Left: resizeLeft");
                ok = false;
                return;
            }
            if (actions && actions.indexOf(action) < 0) {
                errors.push(where + "there is no action called '" + action + "'");
                ok = false;
                return;
            }
            binds.push({ key: key, action: action });
        });
        if (!ok) return;
        if (!binds.length) {
            errors.push(where + "submap '" + name + "' has no keys in it");
            return;
        }
        seen[name] = true;
        submaps.push({ name: name, key: entry, binds: binds });
    });
    return { submaps: submaps, errors: errors };
}
