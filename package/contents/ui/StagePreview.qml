// One preview in the stage layout's strip, after macOS's Stage Manager: a
// live thumbnail of a window waiting beside the stage, tilted towards it (or
// of a set of windows that share the stage, stacked, with all their icons).
// Clicking it brings it onto the stage; dragging it onto the stage adds it to
// the windows there. Each preview is a small overlay window of its own, so
// the strip between them is the desktop's.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: win

    // {id, icons, side, x, y, width, height, members: [{id, window, icon,
    // dx, dy, width, height}]}: the preview's place and its cards within it;
    // the window is a little larger, for the hover and the icons.
    property var preview: null
    property bool overlaysHidden: false
    property color accent: Kirigami.Theme.highlightColor
    // Hidden while the transition overlay flies this preview's cards in.
    property bool held: false
    signal opened(string id)
    signal dropped(string id, real dx, real dy)
    signal separated(string id)
    // A set's preview, right-clicked: offers to separate its windows.
    property bool offering: false

    readonly property int margin: 14

    // The cards are only made again when the windows in the preview change;
    // a new place updates the ones there, so the live thumbnails never flicker.
    property var memberIds: []
    property var members: ({})
    property int revision: 0
    onPreviewChanged: {
        const list = preview ? preview.members : [];
        const map = {};
        for (const m of list) map[m.id] = m;
        members = map;
        const next = list.map(m => m.id);
        if (next.join("\n") !== memberIds.join("\n")) memberIds = next;
        revision++;
        sync();
    }

    // Dragged by the pointer: where it is from its place in the strip.
    property bool dragging: false
    property real dragX: 0
    property real dragY: 0

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    readonly property bool ready: !!preview && preview.width >= 1 && preview.height >= 1
                                  && isFinite(preview.x) && isFinite(preview.y)
    readonly property bool onLeft: !preview || preview.side !== "right"

    x: ready ? preview.x - margin + dragX : 0
    y: ready ? preview.y - margin + dragY : 0
    // Moving along the strip (another window joining it at the top), or back
    // to its place after a drag that went nowhere, it glides there at
    // Plasma's animation speed; its first place it simply takes, and a drag
    // follows the pointer.
    property bool placed: false
    Behavior on x {
        enabled: win.placed && win.visible && !win.dragging
        NumberAnimation { duration: Kirigami.Units.longDuration; easing.type: Easing.OutCubic }
    }
    Behavior on y {
        enabled: win.placed && win.visible && !win.dragging
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

    readonly property bool flat: mouse.containsMouse || dragging

    Item {
        id: stack
        x: win.margin
        y: win.margin
        width: win.ready ? win.preview.width : 1
        height: win.ready ? win.preview.height : 1
        visible: !win.held
        scale: win.flat ? 1.04 : 1
        Behavior on scale { NumberAnimation { duration: Kirigami.Units.shortDuration; easing.type: Easing.OutCubic } }

        Repeater {
            model: win.memberIds

            delegate: StageCard {
                required property string modelData
                required property int index
                readonly property var member: (win.revision, win.members[modelData]) || null

                x: member ? member.dx : 0
                y: member ? member.dy : 0
                width: member ? member.width : 1
                height: member ? member.height : 1
                z: win.memberIds.length - index          // the most recent in front
                window: member ? member.window : null
                icon: member ? member.icon : ""
                showIcon: win.memberIds.length === 1
                onLeft: win.onLeft
                tilt: win.flat ? 0 : 1
                highlighted: index === 0 && mouse.containsMouse
                accent: win.accent
            }
        }

        // A set's icons, in a row on the corner nearest the screen edge.
        Row {
            visible: win.memberIds.length > 1
            z: 10
            spacing: -6
            layoutDirection: win.onLeft ? Qt.LeftToRight : Qt.RightToLeft
            x: win.onLeft ? -8 : stack.width - width + 8
            y: stack.height - 30 + 8
            Repeater {
                model: win.ready && win.memberIds.length > 1 ? win.preview.icons : []
                delegate: Kirigami.Icon {
                    required property var modelData
                    source: modelData || ""
                    fallback: "application-x-executable"
                    width: 30
                    height: 30
                }
            }
        }

        Rectangle {
            visible: win.offering
            z: 30
            anchors.centerIn: parent
            width: label.implicitWidth + 24
            height: label.implicitHeight + 14
            radius: 6
            color: offer.containsMouse ? Kirigami.Theme.highlightColor : Kirigami.Theme.backgroundColor
            border.color: Kirigami.Theme.highlightColor
            Text {
                id: label
                anchors.centerIn: parent
                text: "Separate"
                color: offer.containsMouse ? Kirigami.Theme.highlightedTextColor : Kirigami.Theme.textColor
                font.pixelSize: 13
            }
            MouseArea {
                id: offer
                anchors.fill: parent
                hoverEnabled: true
                onClicked: {
                    win.offering = false;
                    if (win.ready) win.separated(win.preview.id);
                }
            }
        }

        // A click brings it onto the stage; a drag carries it, and let go
        // on the stage it joins the windows there (or else goes back).
        MouseArea {
            id: mouse
            anchors.fill: parent
            z: 20
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            cursorShape: win.dragging ? Qt.ClosedHandCursor : Qt.PointingHandCursor
            property real pressX: 0
            property real pressY: 0
            onContainsMouseChanged: if (!containsMouse) win.offering = false
            onPressed: mouse => {
                if (mouse.button === Qt.RightButton) {
                    win.offering = win.memberIds.length > 1;
                    return;
                }
                win.offering = false;
                pressX = mouse.x;
                pressY = mouse.y;
            }
            onPositionChanged: mouse => {
                if (!pressed || (pressedButtons & Qt.RightButton)) return;
                const dx = mouse.x - pressX, dy = mouse.y - pressY;
                if (!win.dragging && Math.abs(dx) + Math.abs(dy) < 8) return;
                win.dragging = true;
                // The window moves with the pointer, so the press point
                // stays under it.
                win.dragX += dx;
                win.dragY += dy;
            }
            onReleased: mouse => {
                if (!win.ready || mouse.button === Qt.RightButton) return;
                if (win.dragging) {
                    const dx = win.dragX, dy = win.dragY;
                    win.dragging = false;
                    win.dragX = 0;
                    win.dragY = 0;
                    win.dropped(win.preview.id, dx, dy);
                } else {
                    win.opened(win.preview.id);
                }
            }
        }
    }
}
