// A window's card in the stage layout: its live thumbnail, framed, with its
// app's icon, turned towards the stage by `tilt` (0 flat, as on the stage,
// to 1, as in the strip). The strip's previews and the transition between
// stage and strip both draw these, so a window looks the same in each.
import QtQuick
import org.kde.kirigami as Kirigami
import org.kde.kwin as KWin

Item {
    id: card

    property var window: null
    property var icon: ""
    property bool onLeft: true
    property real tilt: 1
    property bool highlighted: false
    property color accent: Kirigami.Theme.highlightColor
    // Animate tilt changes here (a hover); a transition drives it itself.
    property bool animateTilt: true

    Behavior on tilt {
        enabled: card.animateTilt
        NumberAnimation { duration: Kirigami.Units.shortDuration; easing.type: Easing.OutCubic }
    }
    scale: highlighted ? 1.04 : 1
    Behavior on scale { NumberAnimation { duration: Kirigami.Units.shortDuration; easing.type: Easing.OutCubic } }

    // Turned about its upright axis so it faces the stage, its outer edge
    // nearest. Built as a matrix (a rotation seen in perspective from
    // `distance` away, depth flattened as Qt's own does), as Rotation's own
    // perspective needs a newer Qt than Plasma 6.6 has.
    readonly property real angle: tilt * (onLeft ? 30 : -30)
    readonly property real distance: 420
    transform: Matrix4x4 {
        matrix: {
            const a = card.angle * Math.PI / 180;
            const c = Math.cos(a), k = Math.sin(a) / card.distance;
            const ox = card.onLeft ? 0 : card.width, oy = card.height / 2;
            // Translate the outer edge to the origin, rotate and project,
            // and translate back.
            return Qt.matrix4x4(c + ox * k, 0, 0, -c * ox + ox * (1 - k * ox),
                                oy * k,     1, 0, -oy + oy * (1 - k * ox),
                                0,          0, 1, 0,
                                k,          0, 0, 1 - k * ox);
        }
    }

    // A soft shadow behind it.
    Rectangle {
        anchors.fill: parent
        anchors.margins: -3
        radius: 10
        color: Qt.rgba(0, 0, 0, 0.28 * card.tilt)
    }

    // The thumbnail keeps the window's own shape, which a card in flight
    // may not quite have: nothing is drawn around it.
    Item {
        anchors.fill: parent
        clip: true

        KWin.WindowThumbnail {
            anchors.fill: parent
            client: card.window
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: "transparent"
        border.width: card.highlighted ? 2 : 1
        border.color: card.highlighted ? card.accent : Qt.rgba(1, 1, 1, 0.22 * card.tilt)
    }

    // The app's icon on the corner nearest the screen edge.
    Kirigami.Icon {
        source: card.icon || ""
        fallback: "application-x-executable"
        width: 30
        height: 30
        opacity: card.tilt
        x: card.onLeft ? -8 : card.width - width + 8
        y: card.height - height + 8
    }
}
