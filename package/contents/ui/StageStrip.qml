// The stage layout's strip, after macOS's Stage Manager: live previews of
// the windows waiting beside the stage, most recently used at the top,
// tilted towards it. Clicking one brings that window onto the stage. The
// strip has an area of its own (the stage never covers it), and this one
// overlay window spans it.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami
import org.kde.kwin as KWin

Window {
    id: win

    // {id, x, y, width, height, side, items: [{id, window, icon, caption,
    // x, y, width, height}]}
    property var strip: null
    property bool overlaysHidden: false
    property color accent: Kirigami.Theme.highlightColor
    signal opened(string id)

    // The previews are only made again when the windows in the strip change;
    // moving them updates the ones there, so the live thumbnails never flicker.
    property var ids: []
    property var items: ({})
    property int revision: 0

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    readonly property bool ready: !!strip && strip.width >= 1 && strip.height >= 1
                                  && isFinite(strip.x) && isFinite(strip.y)
    readonly property bool onLeft: !strip || strip.side !== "right"

    x: ready ? strip.x : 0
    y: ready ? strip.y : 0
    width: ready ? strip.width : 1
    height: ready ? strip.height : 1

    onStripChanged: {
        const list = strip ? strip.items : [];
        const map = {};
        for (const item of list) map[item.id] = item;
        items = map;
        const next = list.map(item => item.id);
        if (next.join("\n") !== ids.join("\n")) ids = next;
        revision++;
        sync();
    }

    // Same interface as the other overlays.
    function hideAll() {
        hide();
    }

    function sync() {
        if (ready && !overlaysHidden) show();
        else hide();
    }
    onReadyChanged: sync()
    onOverlaysHiddenChanged: sync()
    Component.onCompleted: sync()
    Component.onDestruction: hide()

    Repeater {
        model: win.ids

        delegate: Item {
            id: card

            required property string modelData
            readonly property var item: (win.revision, win.items[modelData]) || null
            readonly property bool hovered: mouse.containsMouse

            x: item ? item.x - win.x : 0
            y: item ? item.y - win.y : 0
            width: item ? item.width : 1
            height: item ? item.height : 1
            z: hovered ? 1 : 0

            // Turned about its upright axis so it faces the stage, its outer
            // edge nearest; it straightens as the pointer comes over it. Built
            // as a matrix (a rotation seen in perspective from `distance`
            // away), as Rotation's own perspective needs a newer Qt than
            // Plasma 6.6 has.
            property real tilt: hovered ? 0 : (win.onLeft ? 30 : -30)
            Behavior on tilt { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
            readonly property real distance: 420
            transform: Matrix4x4 {
                matrix: {
                    const a = card.tilt * Math.PI / 180;
                    const c = Math.cos(a), k = Math.sin(a) / card.distance;
                    const ox = win.onLeft ? 0 : card.width, oy = card.height / 2;
                    // Translate the outer edge to the origin, rotate and
                    // project, and translate back.
                    return Qt.matrix4x4(c + ox * k, 0, 0, -c * ox + ox * (1 - k * ox),
                                        oy * k,     1, 0, -oy + oy * (1 - k * ox),
                                        0,          0, 1, 0,     // depth flattened, as Qt's own does
                                        k,          0, 0, 1 - k * ox);
                }
            }
            scale: hovered ? 1.04 : 1
            Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

            // A soft shadow behind it.
            Rectangle {
                anchors.fill: parent
                anchors.margins: -3
                radius: 10
                color: Qt.rgba(0, 0, 0, 0.28)
            }

            Rectangle {
                id: frame
                anchors.fill: parent
                radius: 8
                color: Kirigami.Theme.backgroundColor
                clip: true

                KWin.WindowThumbnail {
                    anchors.fill: parent
                    client: card.item ? card.item.window : null
                }
            }

            Rectangle {
                anchors.fill: parent
                radius: 8
                color: "transparent"
                border.width: card.hovered ? 2 : 1
                border.color: card.hovered ? win.accent : Qt.rgba(1, 1, 1, 0.22)
            }

            // The app's icon on the corner nearest the screen edge.
            Kirigami.Icon {
                source: card.item ? card.item.icon : ""
                fallback: "application-x-executable"
                width: 30
                height: 30
                x: win.onLeft ? -8 : card.width - width + 8
                y: card.height - height + 8
            }

            MouseArea {
                id: mouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: if (card.item) win.opened(card.modelData)
            }
        }
    }
}
