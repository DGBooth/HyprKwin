// One edge of a focus border. KWin does not honour WindowTransparentForInput
// for script windows, so borders are four strips that only cover the gap
// around a window and never its contents.
import QtQuick
import QtQuick.Window

Window {
    id: strip

    property rect area: Qt.rect(0, 0, 0, 0)
    // With a radius this strip becomes one rounded corner: the window clips a
    // rounded rectangle down to the quadrant that belongs to this corner.
    property int radius: 0
    property point arc: Qt.point(0, 0)
    property int thickness: 2
    property color stripColor: "#33ccff"
    property bool shown: false
    property bool overlaysHidden: false
    property int revision: 0
    onOverlaysHiddenChanged: sync()
    onRevisionChanged: sync()

    title: "HyprKwin overlay"
    color: radius > 0 ? "transparent" : stripColor
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

    Rectangle {
        visible: strip.radius > 0
        x: strip.arc.x
        y: strip.arc.y
        width: strip.radius * 2
        height: strip.radius * 2
        radius: strip.radius
        color: "transparent"
        border.width: strip.thickness
        border.color: strip.stripColor
        antialiasing: true
    }
}
