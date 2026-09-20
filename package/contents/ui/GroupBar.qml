// Tab bar shown above a window group. Clicking a tab focuses that window.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: win

    property var bar: null
    property bool overlaysHidden: false
    property int revision: 0
    onRevisionChanged: sync()
    signal tabClicked(string id)

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    function usable(v) {
        return typeof v === "number" && isFinite(v) && v >= 1;
    }
    readonly property bool ready: !!bar && usable(bar.width) && usable(bar.height) && isFinite(bar.x) && isFinite(bar.y)

    x: ready ? bar.x : 0
    y: ready ? bar.y : 0
    width: ready ? bar.width : 1
    height: ready ? bar.height : 1

    function sync() {
        if (ready && !overlaysHidden) show();
        else hide();
    }
    onReadyChanged: sync()
    onBarChanged: sync()
    onOverlaysHiddenChanged: sync()
    Component.onCompleted: sync()
    Component.onDestruction: hide()

    Kirigami.Theme.colorSet: Kirigami.Theme.Header
    Kirigami.Theme.inherit: false

    Row {
        anchors.fill: parent
        spacing: 2

        Repeater {
            model: win.bar ? win.bar.tabs : []

            delegate: Rectangle {
                id: tab
                required property var modelData
                readonly property int count: win.bar ? win.bar.tabs.length : 1

                width: (win.width - (count - 1) * 2) / count
                height: win.height
                radius: 3
                color: modelData.active
                    ? (modelData.focused ? Kirigami.Theme.highlightColor : Qt.darker(Kirigami.Theme.highlightColor, 1.6))
                    : Kirigami.Theme.backgroundColor
                opacity: modelData.active ? 1 : 0.9

                Text {
                    anchors.fill: parent
                    anchors.leftMargin: 8
                    anchors.rightMargin: 8
                    verticalAlignment: Text.AlignVCenter
                    horizontalAlignment: Text.AlignHCenter
                    elide: Text.ElideRight
                    text: tab.modelData.caption
                    color: tab.modelData.active ? Kirigami.Theme.highlightedTextColor : Kirigami.Theme.textColor
                    font.pixelSize: Math.max(9, Math.round(win.height * 0.55))
                }

                MouseArea {
                    anchors.fill: parent
                    onClicked: win.tabClicked(tab.modelData.id)
                }
            }
        }
    }
}
