// Global shortcuts. Defaults follow Hyprland/Omarchy bindings (SUPER = Meta).
// Shifted symbols use the character they produce on a US layout, the way
// Plasma stores them (Shift+1 is "Meta+!", Shift+- is "Meta+_").
// Every entry can be rebound in System Settings > Keyboard > Shortcuts > KWin.

var SHIFTED_DIGITS = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

function shortcutList() {
    // A one-element entry starts a section of the keys guide (Meta+K).
    var list = [
        ["Windows"],
        ["close", "Close window", "Meta+Q"],
        ["toggleSplit", "Toggle window split", "Meta+J"],
        ["swapSplit", "Swap split halves", ""],
        ["pseudo", "Pseudotile window", "Meta+P"],
        ["toggleFloating", "Toggle window floating/tiling", "Meta+T"],
        ["fullscreen", "Full screen", "Meta+F"],
        ["maximize", "Full width (maximize)", "Meta+Alt+F"],
        ["pin", "Pop window out (float & pin)", "Meta+O"],

        ["Focus and moving"],
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

        ["Resizing"],
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

        ["Workspaces and monitors"],
        ["nextDesktop", "Next workspace", "Meta+Tab"],
        ["previousDesktop", "Previous workspace", "Meta+Shift+Tab"],
        ["formerDesktop", "Former workspace", "Meta+Ctrl+Tab"],
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

        ["Scratchpads"],
        ["toggleSpecial", "Toggle scratchpad", "Meta+S"],
        ["moveToSpecial", "Move window to/from scratchpad", "Meta+Alt+S"],

        ["Layouts"],
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
        ["zoomIn", "Zoom in towards the focused window", "Meta+Z"],
        ["zoomOut", "Zoom back out", "Meta+Shift+Z"],
        ["cycleNext", "Focus next window in the layout", ""],
        ["cyclePrevious", "Focus previous window in the layout", ""],

        ["Groups"],
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

        ["Other"],
        ["showKeys", "Show keyboard shortcuts", "Meta+K"],
        ["retile", "Reload configuration and retile", ""],
        ["dumpState", "Log internal state (debug)", ""],
    ];
    // Extra scratchpads, named in HyprKwin's settings. Unbound by default:
    // Hyprland users pick their own keys for these.
    // Numbered families go with their section, not at the end.
    var sections = {};
    var section = "";
    list.forEach(function (s) {
        if (s.length === 1) section = s[0];
        else sections[s[0]] = section;
    });
    var numbered = [];
    for (var n = 1; n <= 4; n++) {
        numbered.push(["toggleScratchpad" + n, "Toggle scratchpad " + n + " (named in HyprKwin settings)", ""]);
        numbered.push(["moveToScratchpad" + n, "Move window to/from scratchpad " + n, ""]);
    }
    for (var i = 1; i <= 10; i++) {
        var key = String(i % 10);
        numbered.push(["desktop" + i, "Switch to workspace " + i, "Meta+" + key]);
        numbered.push(["moveToDesktop" + i, "Move window to workspace " + i, "Meta+" + SHIFTED_DIGITS[i - 1]]);
        numbered.push(["moveToDesktopSilent" + i, "Move window silently to workspace " + i, "Meta+Alt+" + SHIFTED_DIGITS[i - 1]]);
        if (i <= 5) numbered.push(["groupWindow" + i, "Switch to group window " + i, "Meta+Alt+" + key]);
    }
    numbered.forEach(function (s) {
        sections[s[0]] = /Scratchpad/.test(s[0]) ? "Scratchpads" : /^group/.test(s[0]) ? "Groups" : "Workspaces and monitors";
    });
    return list.filter(function (s) { return s.length > 1; }).concat(numbered).map(function (s) {
        return { action: s[0], name: "HyprKwin " + s[0], text: "HyprKwin: " + s[1], key: s[2], section: sections[s[0]] };
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

// ---- key codes ---------------------------------------------------------
//
// Qt's number for a key sequence such as "Meta+Shift+Left", which is what
// KDE's shortcut service answers questions about. Only the keys HyprKwin's
// defaults use are known; anything else gives 0, meaning "cannot tell".

var MODIFIER_CODES = { Shift: 0x02000000, Ctrl: 0x04000000, Alt: 0x08000000, Meta: 0x10000000 };
var KEY_CODES = {
    Escape: 0x01000000, Esc: 0x01000000, Tab: 0x01000001, Backtab: 0x01000002, Backspace: 0x01000003,
    Return: 0x01000004, Enter: 0x01000005, Delete: 0x01000007, Home: 0x01000010, End: 0x01000011,
    Left: 0x01000012, Up: 0x01000013, Right: 0x01000014, Down: 0x01000015, PgUp: 0x01000016, PgDown: 0x01000017,
    Space: 0x20,
};

function keyCode(sequence) {
    var text = String(sequence || "");
    if (!text) return 0;
    var code = 0;
    // The last part is the key; "+" itself can be the key ("Meta++").
    var key = text.slice(text.lastIndexOf("+", text.length - 2) + 1);
    var mods = text.slice(0, text.length - key.length).split("+").filter(function (m) { return m; });
    for (var i = 0; i < mods.length; i++) {
        if (!MODIFIER_CODES[mods[i]]) return 0;
        code |= MODIFIER_CODES[mods[i]];
    }
    if (KEY_CODES[key] !== undefined) return code | KEY_CODES[key];
    var f = /^F(\d{1,2})$/.exec(key);
    if (f) return code | (0x01000030 + parseInt(f[1], 10) - 1);
    if (key.length === 1) return code | key.toUpperCase().charCodeAt(0);
    return 0;
}

// The other way round: the text for one of Qt's key numbers, as KDE's
// shortcut service gives them ("Meta+Shift+Left"). 0 is no key.
var KEY_NAMES = {};
Object.keys(KEY_CODES).forEach(function (name) {
    if (KEY_NAMES[KEY_CODES[name]] === undefined) KEY_NAMES[KEY_CODES[name]] = name;
});
Object.assign(KEY_NAMES, {
    0x01000000: "Esc", 0x01000005: "Enter", 0x01000006: "Ins", 0x01000009: "Print",
    0x01000016: "PgUp", 0x01000017: "PgDown",
});

function keyText(code) {
    code = Number(code) || 0;
    if (!code) return "";
    var parts = [];
    if (code & MODIFIER_CODES.Meta) parts.push("Meta");
    if (code & MODIFIER_CODES.Ctrl) parts.push("Ctrl");
    if (code & MODIFIER_CODES.Alt) parts.push("Alt");
    if (code & MODIFIER_CODES.Shift) parts.push("Shift");
    if (code & 0x20000000) parts.push("Num");
    var key = code & 0x01ffffff;
    var name = KEY_NAMES[key];
    if (name === undefined && key >= 0x01000030 && key <= 0x01000052) name = "F" + (key - 0x01000030 + 1);
    if (name === undefined && key > 0x20 && key < 0x01000000) name = String.fromCharCode(key).toUpperCase();
    if (name === undefined) name = "0x" + key.toString(16);
    parts.push(name);
    return parts.join("+");
}

// ---- the keys guide (Meta+K) --------------------------------------------
//
// What the guide shows, from KDE's own record of every shortcut (so keys
// rebound in System Settings show as they are, not as HyprKwin's defaults):
//
//   infos:     allShortcutInfos() rows, [name, label, component, …, keys, defaults]
//   submaps:   parseSubmaps() output
//   conflicts: [{key, action, owner}] for default keys another shortcut holds
//   labels:    {action: label} to use instead of the list's (named scratchpads)
//
// Returns [{title, rows: [{label, keys: ["Meta+Q"], note}]}], each section's
// bound keys before its unbound ones. Numbered runs on one pattern (Meta+1 …
// Meta+0) fold into a single row.

var FAMILIES = [
    ["desktop", "Switch to workspace 1–10"],
    ["moveToDesktop", "Move window to workspace 1–10"],
    ["moveToDesktopSilent", "Move window silently to workspace 1–10"],
    ["groupWindow", "Switch to group window 1–5"],
];

function keysGuide(infos, submaps, conflicts, labels) {
    var bound = {};
    (infos || []).forEach(function (row) {
        if (!row || String(row[0]).indexOf("HyprKwin ") !== 0) return;
        var keys = [];
        (row[6] || []).forEach(function (code) {
            var t = keyText(code);
            if (t) keys.push(t);
        });
        bound[String(row[0])] = keys;
    });
    var taken = {};
    (conflicts || []).forEach(function (c) { taken[c.action] = c; });
    labels = labels || {};

    var sections = [], byTitle = {};
    function sectionFor(title) {
        if (!byTitle[title]) {
            byTitle[title] = { title: title, rows: [] };
            sections.push(byTitle[title]);
        }
        return byTitle[title];
    }
    var list = shortcutList();
    var byAction = {};
    list.forEach(function (s) { byAction[s.action] = s; });

    function rowFor(s) {
        var keys = bound[s.name] !== undefined ? bound[s.name] : (s.key ? [s.key] : []);
        var row = { label: labels[s.action] || s.text.replace(/^HyprKwin: /, ""), keys: keys };
        if (!keys.length && taken[s.action]) {
            row.note = s.key + " is " + taken[s.action].owner + "'s";
        }
        return row;
    }

    // A family folds when every member has exactly one key and they differ
    // only in the last character: "Meta+1" … "Meta+0" becomes "Meta+1…0".
    function folded(prefix, count) {
        var keys = [];
        for (var i = 1; i <= count; i++) {
            var s = byAction[prefix + i];
            if (!s) return null;
            var r = rowFor(s);
            if (r.keys.length !== 1 || r.note) return null;
            keys.push(r.keys[0]);
        }
        var stem = keys[0].slice(0, -1);
        if (!keys.every(function (k) { return k.length === keys[0].length && k.slice(0, -1) === stem; })) return null;
        return stem + keys[0].slice(-1) + "…" + keys[count - 1].slice(-1);
    }
    var fold = {};
    FAMILIES.forEach(function (f) {
        var count = f[0] === "groupWindow" ? 5 : 10;
        var k = folded(f[0], count);
        if (k) fold[f[0]] = { label: f[1], keys: [k], count: count };
    });

    list.forEach(function (s) {
        var m = /^(desktop|moveToDesktop|moveToDesktopSilent|groupWindow)(\d+)$/.exec(s.action);
        if (m && fold[m[1]]) {
            if (m[2] === "1") sectionFor(s.section).rows.push({ label: fold[m[1]].label, keys: fold[m[1]].keys });
            return;
        }
        var row = rowFor(s);
        // A scratchpad slot nobody has named or bound is not worth a line.
        if (/Scratchpad\d$/.test(s.action) && !row.keys.length && !labels[s.action]) return;
        sectionFor(s.section).rows.push(row);
    });
    // Keys first; what has none follows, for finding what could have one.
    sections.forEach(function (sec) {
        var withKeys = sec.rows.filter(function (r) { return r.keys.length || r.note; });
        var without = sec.rows.filter(function (r) { return !(r.keys.length || r.note); });
        sec.rows = withKeys.concat(without);
    });

    var subRows = [];
    (submaps || []).forEach(function (sm) {
        subRows.push({ label: "Enter the " + sm.name + " submap", keys: [sm.key] });
        sm.binds.forEach(function (b) {
            var s = byAction[b.action];
            var label = b.action === "leaveSubmap" ? "Leave the submap"
                : (labels[b.action] || (s ? s.text.replace(/^HyprKwin: /, "") : b.action));
            subRows.push({ label: sm.name + ": " + label, keys: [b.key], indent: true });
        });
        if (!sm.binds.some(function (b) { return String(b.key).toLowerCase() === "escape"; })) {
            subRows.push({ label: sm.name + ": Leave the submap", keys: ["Esc"], indent: true });
        }
    });
    if (subRows.length) sections.push({ title: "Submaps", rows: subRows });
    return sections;
}
