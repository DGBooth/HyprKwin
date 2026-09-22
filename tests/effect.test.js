// The animations effect, run outside KWin against stubs of the handful of
// globals KWin gives a scripted effect.
import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package-effect/contents/code/main.js", import.meta.url));

const EFFECT = {
    Translation: 1, Size: 2, Opacity: 3, CrossFadePrevious: 4, Clip: 5,
    Left: 1 << 0, Top: 1 << 1, Right: 1 << 2, Bottom: 1 << 3,
};
const CURVES = { OutCubic: 6, OutQuad: 2, OutExpo: 14, OutBack: 21, Linear: 0 };

function signal() {
    return { connect() {} };
}

function makeWindow(caption, geometry, extra = {}) {
    return {
        caption,
        geometry,
        expandedGeometry: geometry,
        visible: true, minimized: false, deleted: false,
        normalWindow: caption !== "HyprKwin overlay", move: false, resize: false,
        windowFrameGeometryChanged: signal(),
        windowMaximizedStateAboutToChange: signal(),
        windowFullScreenChanged: signal(),
        windowStartUserMovedResized: signal(),
        windowFinishUserMovedResized: signal(),
        ...extra,
    };
}

// Loads the effect with the given settings; returns it plus the animations it starts.
function load(config = {}) {
    const animations = [];
    const effect = {
        readConfig: (key, fallback) => (key in config ? config[key] : fallback),
        configChanged: signal(),
        animationEnded: signal(),
    };
    const effects = { windowAdded: signal(), stackingOrder: [] };
    let nextId = 1;
    const record = (spec) => { animations.push(spec); return nextId++; };
    const instance = new Function(
        "effect", "effects", "animate", "set", "cancel", "animationTime", "print", "Effect", "QEasingCurve",
        src.replace('"use strict";', "") + "\nreturn new HyprKwinAnimations();",
    )(effect, effects, record, record, () => {}, (ms) => ms, () => {}, EFFECT, CURVES);
    return { fx: instance, animations };
}

const types = (spec) => spec.animations.map((a) => a.type);
const faded = (list) => list.filter((spec) => types(spec).includes(EFFECT.CrossFadePrevious)).length;

// A re-tile: the window moves and changes size, so it is neither a divider
// nudge nor a single edge growing.
function retile(fx, window, from, to) {
    window.geometry = to;
    window.expandedGeometry = to;
    fx.onFrameGeometryChanged(window, from);
}

const LEFT = { x: 0, y: 0, width: 500, height: 900 };
const RIGHT = { x: 500, y: 0, width: 500, height: 900 };
const TOP = { x: 0, y: 0, width: 1000, height: 450 };

Deno.test("one window changing tile cross-fades its contents", () => {
    const { fx, animations } = load();
    retile(fx, makeWindow("A", LEFT), TOP, LEFT);
    assertEquals(animations.length, 1);
    assertEquals(types(animations[0]).sort(), [EFFECT.Translation, EFFECT.Size, EFFECT.CrossFadePrevious].sort());
});

Deno.test("a whole layout re-tiling only cross-fades the first couple of windows", () => {
    // Cross-fading makes KWin render each window into an offscreen buffer;
    // a burst of those in one frame is what brought a driver down.
    const { fx, animations } = load();
    const windows = ["A", "B", "C", "D"].map((c) => makeWindow(c, LEFT));
    for (const w of windows) retile(fx, w, TOP, RIGHT);
    assertEquals(animations.length, 4, "every window still animates");
    assertEquals(faded(animations), 2, "but only two of them cross-fade");
    assertEquals(animations.every((a) => types(a).includes(EFFECT.Size)), true, "all of them resize");
});

Deno.test("a later batch may cross-fade again", () => {
    const { fx, animations } = load();
    for (const w of [makeWindow("A", LEFT), makeWindow("B", LEFT)]) retile(fx, w, TOP, RIGHT);
    assertEquals(faded(animations), 2);
    fx.fadeBatchStarted = 0;                      // as if a moment had passed
    retile(fx, makeWindow("C", LEFT), TOP, LEFT);
    assertEquals(faded(animations), 3, "the next batch starts its own count");
});

Deno.test("borders and tab bars never cross-fade", () => {
    const { fx, animations } = load();
    fx.lastWindowAnimation = Date.now();          // an overlay follows its window
    retile(fx, makeWindow("HyprKwin overlay", LEFT), TOP, RIGHT);
    assertEquals(animations.length, 1, "it still animates");
    assertEquals(types(animations[0]).includes(EFFECT.CrossFadePrevious), false, "flat colour, nothing to fade");
});

Deno.test("cross-fading can be turned off altogether", () => {
    const { fx, animations } = load({ CrossFade: false });
    retile(fx, makeWindow("A", LEFT), TOP, LEFT);
    assertEquals(animations.length, 1);
    assertEquals(faded(animations), 0);
});

Deno.test("a divider slide clips instead of resizing the picture", () => {
    const { fx, animations } = load();
    const w = makeWindow("A", { x: 0, y: 0, width: 520, height: 900 });
    fx.onFrameGeometryChanged(w, { x: 0, y: 0, width: 500, height: 900 });
    assertEquals(animations.length, 1);
    assertEquals(types(animations[0]), [EFFECT.Clip], "the edge is uncovered, nothing is scaled or faded");
});
