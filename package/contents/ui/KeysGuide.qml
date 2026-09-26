// The keys guide (Meta+K): every HyprKwin shortcut on the key it actually
// has, grouped as the settings are, framed like the on-screen messages. Wide
// monitors get two columns; either way it scrolls, by wheel or by the arrow
// and page keys the driver holds while it is up.
import QtQuick
import QtQuick.Controls as QQC
import QtQuick.Shapes
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: guide

    property var sections: []                 // [{title, rows: [{label, keys, note, indent}]}]
    property var area: null
    property bool overlaysHidden: false
    signal dismissed()

    property bool accentFromTheme: true
    property color accentColor: "#33ccff"
    property color accentColor2: "#00ff99"
    property bool gradient: false
    property real gradientAngle: 45
    property int thickness: 2

    readonly property color ringColor: accentFromTheme ? Kirigami.Theme.highlightColor : accentColor
    readonly property color ringColor2: gradient ? accentColor2 : ringColor
    readonly property int ringWidth: Math.max(1, thickness)
    readonly property int ringRadius: Kirigami.Units.gridUnit

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    readonly property int unit: Kirigami.Units.gridUnit
    readonly property int columnWidth: unit * 30
    readonly property int columnCount: area && area.width >= columnWidth * 2 + unit * 8 ? 2 : 1
    width: ready ? Math.min(area.width - unit * 4, columnWidth * columnCount + unit * (columnCount + 2)) : 1
    height: ready ? Math.min(Math.round(area.height * 0.85), header.height + body.contentHeight + unit * 3) : 1
    x: ready ? Math.round(area.x + (area.width - width) / 2) : 0
    y: ready ? Math.round(area.y + (area.height - height) / 2) : 0

    function usable(v) {
        return typeof v === "number" && isFinite(v) && v >= 1;
    }
    readonly property bool ready: !!area && usable(area.width) && usable(area.height)

    // Sections in order, split into columns of about the same length.
    readonly property var columns: {
        const cols = [];
        for (let i = 0; i < columnCount; i++) cols.push([]);
        const total = sections.reduce((n, s) => n + s.rows.length + 2, 0);
        let col = 0, used = 0;
        for (const s of sections) {
            if (col < columnCount - 1 && used > 0 && used + (s.rows.length + 2) / 2 > total / columnCount) {
                col++;
                used = 0;
            }
            cols[col].push(s);
            used += s.rows.length + 2;
        }
        return cols;
    }

    function open(list, where) {
        sections = list || [];
        area = where;
        body.contentY = 0;
        if (!ready || overlaysHidden) {
            hide();
            return;
        }
        show();
    }

    function scroll(how) {
        const line = unit * 2, page = Math.max(line, body.height - line);
        const max = Math.max(0, body.contentHeight - body.height);
        let y = body.contentY;
        if (how === "lineUp") y -= line;
        else if (how === "lineDown") y += line;
        else if (how === "pageUp") y -= page;
        else if (how === "pageDown") y += page;
        else if (how === "top") y = 0;
        else if (how === "bottom") y = max;
        body.contentY = Math.max(0, Math.min(max, y));
    }

    onOverlaysHiddenChanged: if (overlaysHidden && visible) { hide(); dismissed(); }
    Component.onDestruction: hide()

    // "Meta++" is Meta and +; "Meta+1…0" is Meta and a run of keys.
    function parts(key) {
        const k = String(key);
        if (k === "+") return ["+"];
        if (k.endsWith("++")) return k.slice(0, -2).split("+").concat(["+"]);
        return k.split("+");
    }

    Rectangle {
        anchors.fill: parent
        radius: guide.ringRadius
        color: Kirigami.Theme.backgroundColor
        opacity: 0.96
    }

    Column {
        id: header
        x: guide.unit * 1.5
        y: guide.unit
        width: guide.width - guide.unit * 3
        spacing: guide.unit / 4
        Text {
            text: "HyprKwin keyboard shortcuts"
            color: Kirigami.Theme.textColor
            font.family: Kirigami.Theme.defaultFont.family
            font.pointSize: Kirigami.Theme.defaultFont.pointSize + 3
            font.bold: true
        }
        Text {
            width: parent.width
            wrapMode: Text.Wrap
            text: "Esc closes · ↑ ↓ PgUp PgDn scroll · change any of them in System Settings › Keyboard › Shortcuts › KWin"
            color: Kirigami.Theme.disabledTextColor
            font.family: Kirigami.Theme.defaultFont.family
            font.pointSize: Kirigami.Theme.smallFont.pointSize
        }
    }

    Flickable {
        id: body
        x: guide.unit
        y: header.y + header.height + guide.unit * 0.75
        width: guide.width - guide.unit * 2
        height: guide.height - y - guide.unit
        clip: true
        contentWidth: width
        contentHeight: columnsRow.height
        boundsBehavior: Flickable.StopAtBounds
        QQC.ScrollBar.vertical: QQC.ScrollBar { policy: body.contentHeight > body.height ? QQC.ScrollBar.AlwaysOn : QQC.ScrollBar.AlwaysOff }

        Row {
            id: columnsRow
            spacing: guide.unit
            x: guide.unit / 2
            Repeater {
                model: guide.columns
                delegate: Column {
                    required property var modelData
                    width: (body.width - guide.unit * 2 - columnsRow.spacing * (guide.columnCount - 1)) / guide.columnCount
                    spacing: guide.unit / 2
                    Repeater {
                        model: parent.modelData
                        delegate: Column {
                            id: section
                            required property var modelData
                            width: parent.width
                            spacing: 2
                            Text {
                                text: section.modelData.title
                                color: guide.ringColor
                                font.family: Kirigami.Theme.defaultFont.family
                                font.bold: true
                                bottomPadding: 2
                            }
                            Repeater {
                                model: section.modelData.rows
                                delegate: Item {
                                    id: row
                                    required property var modelData
                                    readonly property bool unbound: !modelData.keys || modelData.keys.length === 0
                                    width: section.width
                                    height: Math.max(label.implicitHeight + (note.visible ? note.implicitHeight : 0), chips.height) + 4
                                    Text {
                                        id: label
                                        x: row.modelData.indent ? guide.unit : 0
                                        width: row.width - x - chips.width - guide.unit / 2
                                        elide: Text.ElideRight
                                        text: row.modelData.label
                                        color: row.unbound ? Kirigami.Theme.disabledTextColor : Kirigami.Theme.textColor
                                        font.family: Kirigami.Theme.defaultFont.family
                                        anchors.verticalCenter: note.visible ? undefined : parent.verticalCenter
                                    }
                                    Text {
                                        id: note
                                        visible: !!row.modelData.note
                                        anchors.top: label.bottom
                                        x: label.x
                                        width: label.width
                                        elide: Text.ElideRight
                                        text: row.modelData.note ? "taken: " + row.modelData.note : ""
                                        color: Kirigami.Theme.negativeTextColor
                                        font.family: Kirigami.Theme.defaultFont.family
                                        font.pointSize: Kirigami.Theme.smallFont.pointSize
                                    }
                                    Row {
                                        id: chips
                                        anchors.right: parent.right
                                        anchors.verticalCenter: parent.verticalCenter
                                        spacing: guide.unit / 2
                                        Text {
                                            visible: row.unbound
                                            text: "—"
                                            color: Kirigami.Theme.disabledTextColor
                                        }
                                        Repeater {
                                            model: row.modelData.keys || []
                                            delegate: Row {
                                                id: combo
                                                required property var modelData
                                                spacing: 2
                                                Repeater {
                                                    model: guide.parts(combo.modelData)
                                                    delegate: Rectangle {
                                                        required property var modelData
                                                        width: Math.max(height, cap.implicitWidth + 10)
                                                        height: cap.implicitHeight + 4
                                                        radius: 4
                                                        color: Qt.alpha(Kirigami.Theme.textColor, 0.08)
                                                        border.width: 1
                                                        border.color: Qt.alpha(Kirigami.Theme.textColor, 0.25)
                                                        Text {
                                                            id: cap
                                                            anchors.centerIn: parent
                                                            text: parent.modelData
                                                            color: Kirigami.Theme.textColor
                                                            font.family: Kirigami.Theme.defaultFont.family
                                                            font.pointSize: Kirigami.Theme.smallFont.pointSize
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // The frame, as the on-screen messages draw theirs.
    Shape {
        id: ring
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        readonly property real rad: guide.gradientAngle * Math.PI / 180
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
                GradientStop { position: 0; color: guide.ringColor }
                GradientStop { position: 1; color: guide.ringColor2 }
            }
            PathRectangle { x: 0; y: 0; width: ring.width; height: ring.height; radius: guide.ringRadius }
            PathRectangle {
                x: guide.ringWidth; y: guide.ringWidth
                width: Math.max(0, ring.width - 2 * guide.ringWidth)
                height: Math.max(0, ring.height - 2 * guide.ringWidth)
                radius: Math.max(0, guide.ringRadius - guide.ringWidth)
            }
        }
    }
}
