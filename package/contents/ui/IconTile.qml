// A tile too small to use, shown as its app's icon, after Trellis: clicking
// it zooms in until the window is big enough to work in.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: win

    property var tile: null            // {id, x, y, width, height, caption, icon}
    property bool overlaysHidden: false
    property int revision: 0
    onRevisionChanged: sync()
    signal opened(string id)

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    function usable(v) {
        return typeof v === "number" && isFinite(v) && v >= 1;
    }
    readonly property bool ready: !!tile && usable(tile.width) && usable(tile.height) && isFinite(tile.x) && isFinite(tile.y)

    x: ready ? tile.x : 0
    y: ready ? tile.y : 0
    width: ready ? tile.width : 1
    height: ready ? tile.height : 1

    // Same interface as the other overlays.
    function hideAll() {
        hide();
    }

    function sync() {
        if (ready && !overlaysHidden) show();
        else hide();
    }
    onReadyChanged: sync()
    onTileChanged: sync()
    onOverlaysHiddenChanged: sync()
    Component.onCompleted: sync()
    Component.onDestruction: hide()

    Rectangle {
        anchors.fill: parent
        radius: Math.min(8, Math.round(Math.min(width, height) / 6))
        color: Kirigami.Theme.backgroundColor
        border.width: 1
        border.color: Kirigami.Theme.disabledTextColor

        Column {
            anchors.centerIn: parent
            spacing: 4
            width: parent.width - 8

            Kirigami.Icon {
                anchors.horizontalCenter: parent.horizontalCenter
                source: win.tile ? win.tile.icon : ""
                fallback: "application-x-executable"
                readonly property int side: Math.max(16, Math.min(64, Math.round(Math.min(win.width, win.height) * 0.5)))
                width: side
                height: side
            }
            Text {
                width: parent.width
                visible: win.height >= 72
                horizontalAlignment: Text.AlignHCenter
                elide: Text.ElideRight
                text: win.tile ? win.tile.caption : ""
                color: Kirigami.Theme.textColor
                font.pixelSize: 11
            }
        }

        MouseArea {
            anchors.fill: parent
            onClicked: if (win.tile) win.opened(win.tile.id)
        }
    }
}
