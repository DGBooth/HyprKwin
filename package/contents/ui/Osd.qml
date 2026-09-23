// A short message near the bottom of the screen when the layout changes,
// in the manner of Plasma's own on-screen display. Plasma's OSD service only
// takes fixed kinds of message (volume, brightness, keyboard layout), so this
// draws its own, as an overlay window like the borders.
import QtQuick
import QtQuick.Shapes
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: osd

    property string text: ""
    property var area: null                   // the work area to centre on
    property bool overlaysHidden: false
    property int duration: 1200

    // The focus border's colours, so the message is framed the same way the
    // focused window is: one colour, or col.active_border's gradient at its
    // angle, turning if borderangle is set.
    property bool accentFromTheme: true
    property color accentColor: "#33ccff"
    property color accentColor2: "#00ff99"
    property bool gradient: false
    property real gradientAngle: 45
    property real spinSpeed: 0
    property real spin: 0
    property int thickness: 2

    readonly property color ringColor: accentFromTheme ? label.Kirigami.Theme.highlightColor : accentColor
    readonly property color ringColor2: gradient ? accentColor2 : ringColor
    readonly property int ringWidth: Math.max(1, thickness)
    readonly property int ringRadius: Math.round(height / 4)

    NumberAnimation on spin {
        running: osd.visible && osd.gradient && osd.spinSpeed > 0
        from: 0
        to: 360
        duration: osd.spinSpeed > 0 ? Math.max(200, 360 / osd.spinSpeed * 1000) : 1000
        loops: Animation.Infinite
    }

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.WindowTransparentForInput
    color: "transparent"

    readonly property int padding: Math.round(Kirigami.Units.gridUnit)
    width: Math.max(1, Math.round(label.implicitWidth) + padding * 4)
    height: Math.max(1, Math.round(label.implicitHeight) + padding * 2)
    x: ready ? Math.round(area.x + (area.width - width) / 2) : 0
    y: ready ? Math.round(area.y + area.height * 0.8 - height / 2) : 0

    function usable(v) {
        return typeof v === "number" && isFinite(v) && v >= 1;
    }
    readonly property bool ready: text !== "" && !!area && usable(area.width) && usable(area.height)

    // Not called show(): that would shadow the Window's own show(), and
    // assigning to visible is deferred by QQuickWindowQmlImpl, so the window
    // would never actually appear.
    function showMessage(message) {
        text = message;
        if (!ready || overlaysHidden) {
            hide();
            return;
        }
        show();
        // A duration of zero stays up: that is how a submap says it is on.
        if (duration > 0) hideTimer.restart();
        else hideTimer.stop();
    }

    Timer {
        id: hideTimer
        interval: osd.duration
        onTriggered: osd.hide()
    }

    onOverlaysHiddenChanged: if (overlaysHidden) hide()
    Component.onDestruction: hide()

    Rectangle {
        anchors.fill: parent
        radius: osd.ringRadius
        color: label.Kirigami.Theme.backgroundColor
        opacity: 0.92

        Text {
            id: label
            anchors.centerIn: parent
            text: osd.text
            color: Kirigami.Theme.textColor
            font.pointSize: Kirigami.Theme.defaultFont.pointSize + 1
            font.family: Kirigami.Theme.defaultFont.family
        }
    }

    // The frame, drawn the way a border strip draws its ring: a filled shape
    // between two rounded rectangles, so one gradient can run around it.
    Shape {
        id: ring
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer

        readonly property real rad: (osd.gradientAngle + osd.spin) * Math.PI / 180
        readonly property real reach: Math.abs(width / 2 * Math.cos(rad)) + Math.abs(height / 2 * Math.sin(rad))

        ShapePath {
            strokeColor: "transparent"
            strokeWidth: -1
            fillRule: ShapePath.OddEvenFill
            fillGradient: LinearGradient {
                x1: ring.width / 2 - Math.cos(ring.rad) * ring.reach
                y1: ring.height / 2 - Math.sin(ring.rad) * ring.reach
                x2: ring.width / 2 + Math.cos(ring.rad) * ring.reach
                y2: ring.height / 2 + Math.sin(ring.rad) * ring.reach
                GradientStop { position: 0; color: osd.ringColor }
                GradientStop { position: 1; color: osd.ringColor2 }
            }
            PathRectangle {
                x: 0; y: 0
                width: ring.width; height: ring.height
                radius: osd.ringRadius
            }
            PathRectangle {
                x: osd.ringWidth; y: osd.ringWidth
                width: Math.max(0, ring.width - 2 * osd.ringWidth)
                height: Math.max(0, ring.height - 2 * osd.ringWidth)
                radius: Math.max(0, osd.ringRadius - osd.ringWidth)
            }
        }
    }
}
