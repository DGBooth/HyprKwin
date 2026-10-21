// The stage layout's switch, after macOS's Stage Manager: the window coming
// onto the stage grows out of its preview, and the one leaving shrinks into
// its place in the strip. Both are live thumbnails (StageCard) flying across
// an overlay over the workspace for the length of Plasma's animations; the
// incoming window itself is held invisible underneath until its card lands.
import QtQuick
import QtQuick.Window
import org.kde.kirigami as Kirigami

Window {
    id: win

    // {id, x, y, width, height, side, incoming: {id, window, icon, from, to},
    //  outgoing: {id, window, icon, from, to}}, from and to being
    // {x, y, width, height} on the screen.
    property var transition: null
    property bool overlaysHidden: false
    signal finished(string incomingId)

    readonly property int duration: Kirigami.Units.longDuration
    readonly property bool onLeft: !transition || transition.side !== "right"

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
        transition = t;
        if (!t || overlaysHidden || duration <= 0) {
            done();
            return;
        }
        x = t.x;
        y = t.y;
        width = Math.max(1, t.width);
        height = Math.max(1, t.height);
        place(incoming, t.incoming.from, 1);
        place(outgoing, t.outgoing.from, 0);
        if (!visible) show();
        anim.restart();
    }

    function place(card, r, tilt) {
        card.x = r.x - win.x;
        card.y = r.y - win.y;
        card.width = Math.max(1, r.width);
        card.height = Math.max(1, r.height);
        card.tilt = tilt;
    }

    function done() {
        park();
        const id = transition && transition.incoming ? transition.incoming.id : "";
        transition = null;
        finished(id);
    }

    StageCard {
        id: outgoing
        animateTilt: false
        window: win.transition ? win.transition.outgoing.window : null
        icon: win.transition ? win.transition.outgoing.icon : ""
        onLeft: win.onLeft
    }
    // Above the one leaving: it is the one being chosen.
    StageCard {
        id: incoming
        animateTilt: false
        window: win.transition ? win.transition.incoming.window : null
        icon: win.transition ? win.transition.incoming.icon : ""
        onLeft: win.onLeft
    }

    // The same curve the animations effect uses by default.
    ParallelAnimation {
        id: anim
        readonly property var inTo: win.transition ? win.transition.incoming.to : ({ x: 0, y: 0, width: 1, height: 1 })
        readonly property var outTo: win.transition ? win.transition.outgoing.to : ({ x: 0, y: 0, width: 1, height: 1 })
        NumberAnimation { target: incoming; property: "x"; to: anim.inTo.x - win.x; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: incoming; property: "y"; to: anim.inTo.y - win.y; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: incoming; property: "width"; to: anim.inTo.width; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: incoming; property: "height"; to: anim.inTo.height; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: incoming; property: "tilt"; to: 0; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: outgoing; property: "x"; to: anim.outTo.x - win.x; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: outgoing; property: "y"; to: anim.outTo.y - win.y; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: outgoing; property: "width"; to: anim.outTo.width; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: outgoing; property: "height"; to: anim.outTo.height; duration: win.duration; easing.type: Easing.OutCubic }
        NumberAnimation { target: outgoing; property: "tilt"; to: 1; duration: win.duration; easing.type: Easing.OutCubic }
        onFinished: win.done()
    }
}
