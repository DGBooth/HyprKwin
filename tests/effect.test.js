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
    const effects = { windowAdded: signal(), windowClosed: signal(), stackingOrder: [] };
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

// ---- panels and split re-tiles ----------------------------------------------

const PANEL_OLD = { x: 0, y: 1018, width: 1920, height: 62 };
const PANEL_NEW = { x: 0, y: 984, width: 1920, height: 96 };

function panelChange(fx) {
    const panel = makeWindow("", PANEL_NEW, { dock: true, normalWindow: false });
    fx.onFrameGeometryChanged(panel, PANEL_OLD);
}

const durationOf = (spec) => spec.duration;

Deno.test("a small divider nudge between stacked windows still snaps", () => {
    // The lower window loses 25px at the top, its bottom edge kept.
    const { fx, animations } = load({ Duration: 3000 });
    retile(fx, makeWindow("C", { x: 965, y: 547, width: 945, height: 498 }),
           { x: 965, y: 522, width: 945, height: 523 }, { x: 965, y: 547, width: 945, height: 498 });
    assertEquals(animations.length, 0, "nothing animates");
});

Deno.test("after a panel change, the windows glide together, quickly and without a fade", () => {
    const { fx, animations } = load({ Duration: 3000 });
    panelChange(fx);
    // A only shrinks (top kept): on its own that would snap like a nudge.
    retile(fx, makeWindow("A", LEFT), { x: 10, y: 10, width: 945, height: 1014 }, { x: 10, y: 10, width: 945, height: 980 });
    // C moves up and shrinks.
    retile(fx, makeWindow("C", LEFT), { x: 965, y: 522, width: 945, height: 502 }, { x: 965, y: 505, width: 945, height: 485 });
    assertEquals(animations.length, 2, "both animate");
    assertEquals(faded(animations), 0, "neither cross-fades");
    assertEquals(animations.every((a) => durationOf(a) < 200), true, "and both are short: " + animations.map(durationOf));
    assertEquals(types(animations[0]).sort(), [EFFECT.Translation, EFFECT.Size].sort());
});

Deno.test("a re-tile that arrives in two parts animates from where the window was", () => {
    // KWin first moves the window at its old size, then the re-tile lands.
    const { fx, animations } = load();
    const c = makeWindow("C", LEFT);
    const was = { x: 965, y: 522, width: 945, height: 502 };
    const between = { x: 965, y: 498, width: 945, height: 502 };
    const final = { x: 965, y: 505, width: 945, height: 485 };
    retile(fx, c, was, between);
    retile(fx, c, between, final);
    const last = animations[animations.length - 1];
    const size = last.animations.find((a) => a.type === EFFECT.Size);
    assertEquals([size.from.value1, size.from.value2], [945, 502], "from the old size");
    const move = last.animations.find((a) => a.type === EFFECT.Translation);
    // Centre to centre: old centre y 773, new centre y 747.5.
    assertEquals(move.from.value2, 25.5, "and from the old place, not the in-between one");
});
