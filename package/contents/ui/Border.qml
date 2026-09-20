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

    readonly property bool shown: frame !== null && borderWidth > 0
    // Kirigami's theme only resolves inside a window, hence reading it off a
    // strip: the accent colour for the focused window, and the scheme's
    // dimmed text colour for the rest, so both follow the colour scheme.
    readonly property color borderColor: active
        ? (activeFromTheme ? accent.Kirigami.Theme.highlightColor : activeColor)
        : (inactiveFromTheme ? accent.Kirigami.Theme.disabledTextColor : inactiveColor)
    readonly property rect outer: frame ? Qt.rect(frame.x, frame.y, frame.width, frame.height) : Qt.rect(0, 0, 0, 0)
    readonly property int b: borderWidth

    function hideAll() {
        accent.hide();
        bottom.hide();
        left.hide();
        right.hide();
    }

    BorderStrip {
        id: accent
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        area: Qt.rect(border.outer.x, border.outer.y, border.outer.width, border.b)
    }
    BorderStrip {
        id: bottom
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        area: Qt.rect(border.outer.x, border.outer.y + border.outer.height - border.b, border.outer.width, border.b)
    }
    BorderStrip {
        id: left
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        area: Qt.rect(border.outer.x, border.outer.y + border.b, border.b, border.outer.height - 2 * border.b)
    }
    BorderStrip {
        id: right
        shown: border.shown
        revision: border.revision
        overlaysHidden: border.overlaysHidden
        color: border.borderColor
        area: Qt.rect(border.outer.x + border.outer.width - border.b, border.outer.y + border.b, border.b, border.outer.height - 2 * border.b)
    }
}
