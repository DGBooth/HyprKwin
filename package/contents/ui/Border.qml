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
    // col.active_border as a gradient: activeColor to activeColor2.
    property bool activeGradient: false
    property color activeColor2: "#00ff99"
    property real gradientAngle: 45
    // Hyprland's borderangle: degrees per second the gradient turns.
    property real spinSpeed: 0
    property real spin: 0
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
    readonly property color borderColor2: active && activeGradient ? activeColor2 : borderColor
    readonly property rect outer: frame ? Qt.rect(frame.x, frame.y, frame.width, frame.height) : Qt.rect(0, 0, 0, 0)
    readonly property int b: borderWidth
    // Corners can never take more than half the window.
    readonly property int r: Math.max(0, Math.min(radius, Math.floor(Math.min(outer.width, outer.height) / 2)))

    readonly property bool spinning: shown && active && activeGradient && spinSpeed > 0

    NumberAnimation on spin {
        running: border.spinning
        from: 0
        to: 360
        duration: border.spinSpeed > 0 ? Math.max(200, 360 / border.spinSpeed * 1000) : 1000
        loops: Animation.Infinite
    }

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
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x + border.r, border.outer.y, border.outer.width - 2 * border.r, border.b)
    }
    BorderStrip {
        id: bottom
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x + border.r, border.outer.y + border.outer.height - border.b, border.outer.width - 2 * border.r, border.b)
    }
    BorderStrip {
        id: left
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x, border.outer.y + Math.max(border.b, border.r), border.b, border.outer.height - 2 * Math.max(border.b, border.r))
    }
    BorderStrip {
        id: right
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x + border.outer.width - border.b, border.outer.y + Math.max(border.b, border.r), border.b, border.outer.height - 2 * Math.max(border.b, border.r))
    }

    // One window per corner, for the rounded part of the ring.
    BorderStrip {
        id: topLeft
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x, border.outer.y, border.r, border.r)
    }
    BorderStrip {
        id: topRight
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x + border.outer.width - border.r, border.outer.y, border.r, border.r)
    }
    BorderStrip {
        id: bottomLeft
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x, border.outer.y + border.outer.height - border.r, border.r, border.r)
    }
    BorderStrip {
        id: bottomRight
        shown: border.shown && border.r > 0
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        stripColor: border.borderColor
        stripColor2: border.borderColor2
        angle: border.gradientAngle + border.spin
        ring: Qt.size(border.outer.width, border.outer.height)
        offset: Qt.point(area.x - border.outer.x, area.y - border.outer.y)
        radius: border.r
        thickness: border.b
        area: Qt.rect(border.outer.x + border.outer.width - border.r, border.outer.y + border.outer.height - border.r, border.r, border.r)
    }
}
