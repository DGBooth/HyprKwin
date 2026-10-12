// HyprKwin's entries in the window menu (Alt+F3, or right-click a title
// bar). KWin only lets JavaScript scripts add to that menu, not QML ones like
// HyprKwin, so HyprKwin starts this one alongside itself. A click focuses the
// window and runs the matching HyprKwin action, which writes the rule.

function run(window, action) {
    workspace.activeWindow = window;
    callDBus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
             "invokeShortcut", "HyprKwin " + action);
}

registerUserActionsMenu(function (window) {
    if (!window.normalWindow || !window.resourceClass) return null;
    var app = String(window.resourceClass);
    return {
        text: "HyprKwin",
        items: [
            { text: "Always float " + app, triggered: function () { run(window, "ruleFloatApp"); } },
            { text: "Always tile " + app, triggered: function () { run(window, "ruleTileApp"); } },
            { text: "Always open " + app + " in the scratchpad", triggered: function () { run(window, "ruleScratchpadApp"); } },
        ],
    };
});
