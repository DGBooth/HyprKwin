// One edge of a focus border. KWin does not honour WindowTransparentForInput
// for script windows, so borders are four strips that only cover the gap
// around a window and never its contents.
import QtQuick
import QtQuick.Shapes
import QtQuick.Window

Window {
    id: strip

    property rect area: Qt.rect(0, 0, 0, 0)
    // Every strip draws the whole ring, positioned so that only its own piece
    // of it falls inside the window. That keeps corners exact and lets one
    // gradient run around the entire border.
    property size ring: Qt.size(0, 0)       // the border's outer size
    property point offset: Qt.point(0, 0)   // where this strip sits in it
    property int radius: 0
    property int thickness: 2
    property color stripColor: "#33ccff"
    property color stripColor2: stripColor  // the far end of the gradient
    property real angle: 45                 // 0 = left to right, 90 = top to bottom
    property bool shown: false
    property bool overlaysHidden: false
    property int revision: 0
    onOverlaysHiddenChanged: sync()
    onRevisionChanged: sync()

    title: "HyprKwin overlay"
    color: "transparent"
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

    Shape {
        id: ringShape
        x: -strip.offset.x
        y: -strip.offset.y
        width: strip.ring.width
        height: strip.ring.height
        preferredRendererType: Shape.CurveRenderer

        // The gradient line crosses the whole ring at the given angle, so its
        // two colours land on opposite corners, as Hyprland draws it.
        readonly property real rad: strip.angle * Math.PI / 180
        readonly property real reach: Math.abs(width / 2 * Math.cos(rad)) + Math.abs(height / 2 * Math.sin(rad))

        ShapePath {
            strokeColor: "transparent"
            strokeWidth: -1
            fillRule: ShapePath.OddEvenFill
            fillGradient: LinearGradient {
                x1: strip.ring.width / 2 - Math.cos(ringShape.rad) * ringShape.reach
                y1: strip.ring.height / 2 - Math.sin(ringShape.rad) * ringShape.reach
                x2: strip.ring.width / 2 + Math.cos(ringShape.rad) * ringShape.reach
                y2: strip.ring.height / 2 + Math.sin(ringShape.rad) * ringShape.reach
                GradientStop { position: 0; color: strip.stripColor }
                GradientStop { position: 1; color: strip.stripColor2 }
            }
            PathRectangle {
                x: 0; y: 0
                width: strip.ring.width; height: strip.ring.height
                radius: strip.radius
            }
            PathRectangle {
                x: strip.thickness; y: strip.thickness
                width: Math.max(0, strip.ring.width - 2 * strip.thickness)
                height: Math.max(0, strip.ring.height - 2 * strip.thickness)
                radius: Math.max(0, strip.radius - strip.thickness)
            }
        }
    }
}
