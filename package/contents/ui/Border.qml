// Focus border drawn in the gap around a tiled window.
import QtQuick
import org.kde.kirigami as Kirigami

Item {
    id: border

    property var frame: null   // outer rect: window geometry grown by borderWidth
    property int borderWidth: 2
    property bool active: false
    property bool activeFromTheme: true
    property bool inactiveFromTheme: true
    property color activeColor: "#33ccff"
    property color inactiveColor: "#595959"
    property bool overlaysHidden: false
    property int revision: 0
    property int radius: 0

    readonly property bool shown: frame !== null && borderWidth > 0
    // Kirigami's theme only resolves inside a window, hence reading it off a
    // strip: the accent colour for the focused window, and the scheme's
    // dimmed text colour for the rest, so both follow the colour scheme.
    readonly property color borderColor: active
        ? (activeFromTheme ? accent.Kirigami.Theme.highlightColor : activeColor)
        : (inactiveFromTheme ? accent.Kirigami.Theme.disabledTextColor : inactiveColor)
    readonly property rect outer: frame ? Qt.rect(frame.x, frame.y, frame.width, frame.height) : Qt.rect(0, 0, 0, 0)
    readonly property int b: borderWidth
    // Corners can never take more than half the window.
    readonly property int r: Math.max(0, Math.min(radius, Math.floor(Math.min(outer.width, outer.height) / 2)))

    function hideAll() {
        accent.hide();
        bottom.hide();
        left.hide();
        right.hide();
        topLeft.hide();
        topRight.hide();
        bottomLeft.hide();
        bottomRight.hide();
    }

    BorderStrip {
        id: accent
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        stripColor: border.borderColor
        thickness: border.b
        area: Qt.rect(border.outer.x + border.r, border.outer.y, border.outer.width - 2 * border.r, border.b)
    }
    BorderStrip {
        id: bottom
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        stripColor: border.borderColor
        thickness: border.b
        area: Qt.rect(border.outer.x + border.r, border.outer.y + border.outer.height - border.b, border.outer.width - 2 * border.r, border.b)
    }
    BorderStrip {
        id: left
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        stripColor: border.borderColor
        thickness: border.b
        area: Qt.rect(border.outer.x, border.outer.y + Math.max(border.b, border.r), border.b, border.outer.height - 2 * Math.max(border.b, border.r))
    }
    BorderStrip {
        id: right
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        stripColor: border.borderColor
        thickness: border.b
        area: Qt.rect(border.outer.x + border.outer.width - border.b, border.outer.y + Math.max(border.b, border.r), border.b, border.outer.height - 2 * Math.max(border.b, border.r))
    }

    // One window per corner, each clipping the quadrant of a rounded rect.
    BorderStrip {
        id: topLeft
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        thickness: border.b
        radius: border.r
        arc: Qt.point(0, 0)
        area: Qt.rect(border.outer.x, border.outer.y, border.r, border.r)
    }
    BorderStrip {
        id: topRight
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        thickness: border.b
        radius: border.r
        arc: Qt.point(-border.r, 0)
        area: Qt.rect(border.outer.x + border.outer.width - border.r, border.outer.y, border.r, border.r)
    }
    BorderStrip {
        id: bottomLeft
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        thickness: border.b
        radius: border.r
        arc: Qt.point(0, -border.r)
        area: Qt.rect(border.outer.x, border.outer.y + border.outer.height - border.r, border.r, border.r)
    }
    BorderStrip {
        id: bottomRight
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        thickness: border.b
        radius: border.r
        arc: Qt.point(-border.r, -border.r)
        area: Qt.rect(border.outer.x + border.outer.width - border.r, border.outer.y + border.outer.height - border.r, border.r, border.r)
    }
}
