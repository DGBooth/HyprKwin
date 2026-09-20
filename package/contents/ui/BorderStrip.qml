// One edge of a focus border. KWin does not honour WindowTransparentForInput
// for script windows, so borders are four strips that only cover the gap
// around a window and never its contents.
import QtQuick
import QtQuick.Window

Window {
    id: strip

    property rect area: Qt.rect(0, 0, 0, 0)
    property bool shown: false
    property bool overlaysHidden: false
    property int revision: 0
    onOverlaysHiddenChanged: sync()
    onRevisionChanged: sync()

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.WindowTransparentForInput
    x: isFinite(area.x) ? area.x : 0
    y: isFinite(area.y) ? area.y : 0
    width: usable(area.width) ? area.width : 1
    height: usable(area.height) ? area.height : 1

    // Never show a window with a zero, negative or NaN size: KWin cannot make
    // a framebuffer for it, and the window is then stuck at a fallback size.
    function usable(v) {
        return typeof v === "number" && isFinite(v) && v >= 1;
    }
    readonly property bool ready: usable(area.width) && usable(area.height) && isFinite(area.x) && isFinite(area.y)

    function sync() {
        if (shown && !overlaysHidden && ready) show();
        else hide();
    }
    onReadyChanged: sync()
    onShownChanged: sync()
    onAreaChanged: sync()
    Component.onCompleted: sync()
    // KWin keeps shown internal windows alive when the script's QML engine
    // goes away, so make sure they disappear with us.
    Component.onDestruction: hide()
}
