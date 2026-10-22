// One preview in the stage layout's strip, after macOS's Stage Manager: a
// live thumbnail of a window waiting beside the stage, tilted towards it (or
// of a set of windows that share the stage, stacked, with all their icons).
// Clicking it brings it onto the stage; dragging it onto the stage adds it to
// the windows there; right-clicking closes it (or parts a set). Each preview is a small overlay window of its own, so
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
    // A set's preview, right-clicked: its windows wait on their own again.
    signal separated(string id)
    // A single window's preview, right-clicked: that window closes.
    signal closeRequested(string id)
    // The wheel over it, when not every preview fits: the strip scrolls by
    // whole previews (delta as Qt gives it, 120 to a notch).
    signal scrolled(string id, real delta)

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

        // More previews above or below, out of view: the wheel brings them.
        // On a small backing, so they show over any wallpaper.
        Repeater {
            model: [{ up: true }, { up: false }]
            delegate: Rectangle {
                required property var modelData
                visible: win.ready && (modelData.up ? !!win.preview.moreAbove : !!win.preview.moreBelow)
                z: 25
                width: 26
                height: 13
                radius: 6
                color: Kirigami.Theme.backgroundColor
                opacity: 0.9
                anchors.horizontalCenter: parent.horizontalCenter
                y: modelData.up ? -win.margin : stack.height + 1
                Kirigami.Icon {
                    anchors.centerIn: parent
                    width: 12
                    height: 12
                    source: modelData.up ? "go-up" : "go-down"
                    isMask: true
                    color: Kirigami.Theme.textColor
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
            onPressed: mouse => {
                if (mouse.button === Qt.RightButton) return;
                pressX = mouse.x;
                pressY = mouse.y;
            }
            onWheel: event => {
                if (win.ready && event.angleDelta.y) win.scrolled(win.preview.id, event.angleDelta.y);
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
                if (!win.ready) return;
                if (mouse.button === Qt.RightButton) {
                    if (!containsMouse) return;
                    if (win.memberIds.length > 1) win.separated(win.preview.id);
                    else win.closeRequested(win.preview.id);
                    return;
                }
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
