// A short message near the bottom of the screen when the layout changes,
// in the manner of Plasma's own on-screen display. Plasma's OSD service only
// takes fixed kinds of message (volume, brightness, keyboard layout), so this
// draws its own, as an overlay window like the borders.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: osd

    property string text: ""
    property var area: null                   // the work area to centre on
    property bool overlaysHidden: false
    property int duration: 1200

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
        hideTimer.restart();
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
        radius: Math.round(height / 4)
        color: label.Kirigami.Theme.backgroundColor
        border.width: 1
        border.color: label.Kirigami.Theme.highlightColor
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
}
