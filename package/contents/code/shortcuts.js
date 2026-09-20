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

        ["resizeLeft", "Shrink window width", "Meta+-"],
        ["resizeRight", "Grow window width", "Meta+="],
        ["resizeUp", "Shrink window height", "Meta+_"],
        ["resizeDown", "Grow window height", "Meta++"],
        ["resizeLeftSmall", "Shrink window width a little", "Meta+Alt+-"],
        ["resizeRightSmall", "Grow window width a little", "Meta+Alt+="],
        ["resizeUpSmall", "Shrink window height a little", "Meta+Alt+_"],
        ["resizeDownSmall", "Grow window height a little", "Meta+Alt++"],
        ["resizeLeftLarge", "Shrink window width a lot", "Meta+Ctrl+-"],
        ["resizeRightLarge", "Grow window width a lot", "Meta+Ctrl+="],
        ["resizeUpLarge", "Shrink window height a lot", "Meta+Ctrl+_"],
        ["resizeDownLarge", "Grow window height a lot", "Meta+Ctrl++"],

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
