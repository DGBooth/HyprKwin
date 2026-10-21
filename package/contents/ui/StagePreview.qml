// One preview in the stage layout's strip, after macOS's Stage Manager: a
// live thumbnail of a window waiting beside the stage, tilted towards it.
// Clicking it brings that window onto the stage. Each preview is a small
// overlay window of its own, so the strip between them is the desktop's.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami
import org.kde.kwin as KWin

Window {
    id: win

    // {id, window, icon, caption, side, x, y, width, height}: the card's
    // place; the window is a little larger, for the hover and the icon.
    property var preview: null
    property bool overlaysHidden: false
    property color accent: Kirigami.Theme.highlightColor
    // Hidden while the transition overlay flies this window's card in.
    property bool held: false
    signal opened(string id)

    readonly property int margin: 14

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    readonly property bool ready: !!preview && preview.width >= 1 && preview.height >= 1
                                  && isFinite(preview.x) && isFinite(preview.y)
    readonly property bool onLeft: !preview || preview.side !== "right"

    x: ready ? preview.x - margin : 0
    y: ready ? preview.y - margin : 0
    // Moving along the strip (another window joining it at the top), it
    // glides there at Plasma's animation speed; its first place it simply
    // takes.
    property bool placed: false
    Behavior on y {
        enabled: win.placed && win.visible
        NumberAnimation { duration: Kirigami.Units.longDuration; easing.type: Easing.OutCubic }
    }
    width: ready ? preview.width + 2 * margin : 1
    height: ready ? preview.height + 2 * margin : 1

    // Same interface as the other overlays.
    function hideAll() {
        hide();
    }

    function sync() {
        if (ready && !overlaysHidden) show();
        else hide();
    }
    onVisibleChanged: if (!visible) placed = false
    onReadyChanged: {
        if (ready) Qt.callLater(() => placed = true);
        sync();
    }
    onPreviewChanged: sync()
    onOverlaysHiddenChanged: sync()
    Component.onCompleted: sync()
    Component.onDestruction: hide()

    function holdFor(ms) {
        held = true;
        release.interval = Math.max(1, ms);
        release.restart();
    }
    Timer {
        id: release
        onTriggered: win.held = false
    }

    StageCard {
        id: card
        x: win.margin
        y: win.margin
        width: win.ready ? win.preview.width : 1
        height: win.ready ? win.preview.height : 1
        visible: !win.held
        window: win.ready ? win.preview.window : null
        icon: win.ready ? win.preview.icon : ""
        onLeft: win.onLeft
        tilt: mouse.containsMouse ? 0 : 1
        highlighted: mouse.containsMouse
        accent: win.accent

        MouseArea {
            id: mouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: if (win.ready) win.opened(win.preview.id)
        }
    }
}
