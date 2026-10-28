// Tells the animations effect to dim the windows behind the scratchpad. A
// script cannot put anything between the scratchpad and the windows under
// it (its overlays are drawn above everything), but the effect can darken
// windows, and it can read this window's properties: while the scratchpad
// is open this invisible window is shown, parked out of sight, carrying
// what to dim in `hyprkwinDim` as JSON ({amount, output, exempt: [rects]}).
import QtQuick
import QtQuick.Window

Window {
    id: win

    property string hyprkwinDim: ""
    property bool overlaysHidden: false

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.WindowTransparentForInput
    color: "transparent"
    x: -32000
    y: -32000
    width: 1
    height: 1

    function set(dim) {
        const next = dim ? JSON.stringify(dim) : "";
        if (next !== hyprkwinDim) hyprkwinDim = next;
        sync();
    }
    function sync() {
        if (hyprkwinDim && !overlaysHidden) show();
        else hide();
    }
    function hideAll() {
        hide();
    }
    onOverlaysHiddenChanged: sync()
    Component.onDestruction: hide()
}
