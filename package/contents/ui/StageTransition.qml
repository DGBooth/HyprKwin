// The stage layout's switch, after macOS's Stage Manager: windows coming
// onto the stage grow out of their previews (or from where a preview was
// dropped), and those leaving shrink into their places in the strip. Each is
// a live thumbnail (StageCard) flying across an overlay over the workspace
// for the length of Plasma's animations; the windows themselves stay where
// they were underneath until the cards land.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: win

    // {id (the space), x, y, width, height, side, landing: [preview ids],
    //  cards: [{id, window, icon, from, to, arriving}]}, from and to being
    // {x, y, width, height} on the screen.
    property var transition: null
    property bool overlaysHidden: false
    signal finished(string space)

    readonly property int duration: Kirigami.Units.longDuration
    readonly property bool onLeft: !transition || transition.side !== "right"
    // 0 to 1, eased: where every card is between its from and its to.
    property real progress: 0

    title: "HyprKwin overlay"
    flags: Qt.X11BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
    color: "transparent"

    // Shown once and kept, parked out of sight between switches: showing a
    // window brings KWin's open animation with it, and a card must not fade
    // in. Moved into place for a switch, it is never animated.
    readonly property int parked: -32000
    x: parked
    y: parked
    width: 1
    height: 1

    function hideAll() {
        anim.stop();
        hide();
    }
    function park() {
        x = parked;
        y = parked;
        width = 1;
        height = 1;
    }
    onOverlaysHiddenChanged: {
        if (overlaysHidden) hideAll();
        else { park(); show(); }
    }
    Component.onCompleted: if (!overlaysHidden) show()
    Component.onDestruction: hide()

    function play(t) {
        anim.stop();
        progress = 0;
        transition = t;
        if (!t || overlaysHidden || duration <= 0) {
            done();
            return;
        }
        x = t.x;
        y = t.y;
        width = Math.max(1, t.width);
        height = Math.max(1, t.height);
        if (!visible) show();
        anim.restart();
    }

    function done() {
        park();
        const space = transition ? transition.id : "";
        transition = null;
        finished(space);
    }

    function lerp(a, b) {
        return a + (b - a) * progress;
    }

    Repeater {
        model: win.transition ? win.transition.cards : []

        delegate: StageCard {
            required property var modelData
            // The ones arriving above the ones leaving: they were chosen.
            z: modelData.arriving ? 1 : 0
            animateTilt: false
            x: win.lerp(modelData.from.x, modelData.to.x) - win.x
            y: win.lerp(modelData.from.y, modelData.to.y) - win.y
            width: Math.max(1, win.lerp(modelData.from.width, modelData.to.width))
            height: Math.max(1, win.lerp(modelData.from.height, modelData.to.height))
            tilt: modelData.arriving ? 1 - win.progress : win.progress
            window: modelData.window
            icon: modelData.icon
            onLeft: win.onLeft
        }
    }

    // The same curve the animations effect uses by default.
    NumberAnimation {
        id: anim
        target: win
        property: "progress"
        from: 0
        to: 1
        duration: win.duration
        easing.type: Easing.OutCubic
        onFinished: win.done()
    }
}
