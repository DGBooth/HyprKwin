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
    const handlers = [];
    return { connect(fn) { handlers.push(fn); }, emit(...args) { handlers.forEach((fn) => fn(...args)); } };
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
        windowMaximizedStateChanged: signal(),
        windowFullScreenChanged: signal(),
        windowStartUserMovedResized: signal(),
        windowFinishUserMovedResized: signal(),
        ...extra,
    };
}

// Loads the effect with the given settings; returns it plus the animations it
// starts. `speed` stands in for Plasma's global animation speed: KWin's
// animationTime() scales every duration by it (0 is "Instant").
function load(config = {}, loaded = [], speed = 1) {
    const animations = [];
    const cancelled = [];
    const effect = {
        readConfig: (key, fallback) => (key in config ? config[key] : fallback),
        configChanged: signal(),
        animationEnded: signal(),
    };
    const effects = {
        windowAdded: signal(), windowClosed: signal(), stackingOrder: [],
        loaded: new Set(loaded),
        isEffectLoaded(name) { return this.loaded.has(name); },
        loadEffect(name) { this.loaded.add(name); },
        unloadEffect(name) { this.loaded.delete(name); },
    };
    let nextId = 1;
    const record = (spec) => { animations.push(spec); return nextId++; };
    const instance = new Function(
        "effect", "effects", "animate", "set", "cancel", "animationTime", "print", "Effect", "QEasingCurve",
        src.replace('"use strict";', "") + "\nreturn new HyprKwinAnimations();",
    )(effect, effects, record, record, (id) => cancelled.push(id), (ms) => Math.round(ms * speed), () => {}, EFFECT, CURVES);
    return { fx: instance, animations, effects, cancelled };
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

// Runs `fn` with the clock stopped at 1000ms; `fn` is given a way to move it on.
function withClock(fn) {
    const real = Date.now;
    let now = 1000;
    Date.now = () => now;
    try {
        fn((ms) => { now += ms; });
    } finally {
        Date.now = real;
    }
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

Deno.test("a re-tile that arrives in two parts animates from where the window was", () => withClock(() => {
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
}));

Deno.test("a chosen open/close animation retires the others, even ones loaded later", () => {
    // Fade picked: Scale goes. Plasma 6.8 may load Scale after this effect at
    // login, so the choice is applied again as windows open.
    const { effects } = load({ OpenCloseEffect: 2 }, ["scale"]);
    assertEquals([...effects.loaded].sort(), ["fade"]);
    effects.loaded.add("scale");
    effects.windowAdded.emit(makeWindow("A", LEFT));
    assertEquals([...effects.loaded].sort(), ["fade"], "scale, loaded after, is retired as a window opens");
});

Deno.test("left alone, Plasma's own open/close animation stays", () => {
    const { effects } = load({}, ["scale"]);
    effects.windowAdded.emit(makeWindow("A", LEFT));
    assertEquals([...effects.loaded], ["scale"]);
});

// ---- fractional display scaling ---------------------------------------------

const FRACTIONAL_BOTTOM_LEFT = { x: 0, y: 457, width: 768, height: 456.79999999999995 };
const FRACTIONAL_LEFT = { x: 0, y: 0, width: 768, height: 914.4000000000001 };

Deno.test("with fractional scaling, a bottom corner going up still slides its edge", () => {
    // The bottom edge is at 913.8 before and 914.4 after: the same edge.
    const { fx, animations } = load();
    retile(fx, makeWindow("A", FRACTIONAL_BOTTOM_LEFT), FRACTIONAL_BOTTOM_LEFT, FRACTIONAL_LEFT);
    assertEquals(animations.length, 1);
    assertEquals(types(animations[0]), [EFFECT.Clip]);
});

Deno.test("rounding a moment later leaves the animation running", () => {
    // 15-25ms after the re-tile, KWin settles the height from 914.4000000000001
    // to 914.4. That must not cancel the animation or start another.
    const { fx, animations, cancelled } = load();
    const a = makeWindow("A", FRACTIONAL_BOTTOM_LEFT);
    retile(fx, a, FRACTIONAL_BOTTOM_LEFT, FRACTIONAL_LEFT);
    retile(fx, a, FRACTIONAL_LEFT, { x: 0, y: 0, width: 768, height: 914.4 });
    assertEquals(animations.length, 1, "no second animation");
    assertEquals(cancelled.length, 0, "the first one is not cancelled");
});

Deno.test("a split nudged by rounding noise is still a nudge", () => {
    const { fx, animations } = load();
    retile(fx, makeWindow("C", LEFT), { x: 965, y: 522.0000001, width: 945, height: 502 }, { x: 965, y: 547, width: 945, height: 477 });
    assertEquals(animations.length, 0, "the far edge is the same to within a pixel: snap");
});

// ---- interrupted animations -------------------------------------------------

Deno.test("a half moved across and quickly back animates back from where it is", () => {
    // Meta+Right on the left half, then Meta+Left half way through.
    withClock((advance) => {
        const { fx, animations, cancelled } = load();
        const a = makeWindow("A", LEFT);
        retile(fx, a, LEFT, RIGHT);
        advance(100);                               // half of 200ms: 87.5% there (ease out cubic)
        retile(fx, a, RIGHT, LEFT);
        assertEquals(animations.length, 2, "the way back animates too");
        assertEquals(cancelled.length, 1, "in place of the first");
        const back = animations[1].animations.find((x) => x.type === EFFECT.Translation);
        assertEquals(back.from.value1, 437.5, "from where it was drawn, 437.5px across");
    });
});

Deno.test("the curve setting decides where an interrupted window is taken to be", () => {
    withClock((advance) => {
        const { fx, animations } = load({ Curve: 4 });   // linear
        const a = makeWindow("A", LEFT);
        retile(fx, a, LEFT, RIGHT);
        advance(100);
        retile(fx, a, RIGHT, LEFT);
        const back = animations[1].animations.find((x) => x.type === EFFECT.Translation);
        assertEquals(back.from.value1, 250, "half way, as the curve is linear");
    });
});

Deno.test("interrupting an edge slide moves on from where the window is drawn", () => {
    // Top-right corner, Meta+Left (the top half: the left edge slides out),
    // then Meta+Right part way through (back to the corner).
    withClock((advance) => {
        const { fx, animations } = load();
        const corner = { x: 500, y: 0, width: 500, height: 450 };
        const a = makeWindow("A", corner);
        retile(fx, a, corner, TOP);
        assertEquals(types(animations[0]), [EFFECT.Clip]);
        advance(90);                                // half of 180ms
        retile(fx, a, TOP, corner);
        assertEquals(animations.length, 2);
        assertEquals(types(animations[1]).includes(EFFECT.Clip), false, "no slide: a plain move and resize");
        const size = animations[1].animations.find((x) => x.type === EFFECT.Size);
        assertEquals(size.from.value1, 937.5, "from the width it had reached");
    });
});

Deno.test("a divider slide that interrupts an animation still covers the window held back", () => {
    // HyprKwin keeps the shrinking neighbour at its old size until the divider
    // has passed, so the slide (not a plain resize) is what keeps it covered.
    withClock((advance) => {
        const { fx, animations, effects } = load();
        const a = makeWindow("A", { x: 0, y: 0, width: 500, height: 900 });
        const b = makeWindow("B", { x: 500, y: 0, width: 500, height: 900 });
        effects.stackingOrder.push(a, b);
        retile(fx, a, { x: 0, y: 300, width: 500, height: 600 }, { x: 0, y: 0, width: 500, height: 900 });
        advance(50);
        const before = animations.length;
        retile(fx, a, { x: 0, y: 0, width: 500, height: 900 }, { x: 0, y: 0, width: 520, height: 900 });
        const started = animations.slice(before);
        assertEquals(started.some((s) => types(s).includes(EFFECT.Clip)), true, "the growing window still slides");
        assertEquals(typeof b.hkCover, "number", "and the one held back is still covered");
    });
});

Deno.test("a resize that interrupts an animation does not cross-fade", () => {
    // Meta+Down twice, quickly: the top-left quarter grows to the left half,
    // and before that has finished it shrinks to the bottom-left quarter.
    // A cross-fade started then would have no earlier picture to fade from.
    const { fx, animations } = load();
    const a = makeWindow("A", TOP);
    const topLeft = { x: 0, y: 0, width: 960, height: 540 };
    const left = { x: 0, y: 0, width: 960, height: 1080 };
    retile(fx, a, topLeft, left);
    retile(fx, a, left, { x: 0, y: 540, width: 960, height: 540 });
    assertEquals(animations.length, 2, "both still animate");
    assertEquals(faded(animations), 0);
});

Deno.test("once an animation has finished, the next resize cross-fades again", () => {
    const { fx, animations } = load();
    const a = makeWindow("A", TOP);
    retile(fx, a, LEFT, TOP);
    a.hkVisual.end = Date.now() - 1;             // the first one has finished
    fx.fadeBatchStarted = 0;                     // and its batch is long gone
    retile(fx, a, TOP, RIGHT);
    assertEquals(faded(animations), 2);
});

Deno.test("a re-tile that lands where the window is already drawn stops the old animation", () => {
    // Left half to the right and, a moment later, back to where it is drawn
    // (to within a pixel): the first animation must not carry on to the right.
    withClock((advance) => {
        const { fx, animations, cancelled } = load({ Curve: 4 });   // linear: 40% of 200ms = 40% across
        const a = makeWindow("A", LEFT);
        retile(fx, a, LEFT, RIGHT);
        advance(80);
        retile(fx, a, RIGHT, { x: 200.4, y: 0, width: 500, height: 900 });
        assertEquals(animations.length, 1, "nothing new to animate");
        assertEquals(cancelled.length, 1, "but the old one is stopped");
    });
});

Deno.test("a border follows its window from where both are drawn", () => {
    withClock((advance) => {
        const { fx, animations } = load();
        const border = makeWindow("HyprKwin overlay", LEFT);
        fx.lastWindowAnimation = Date.now();
        retile(fx, border, LEFT, RIGHT);
        advance(100);
        fx.lastWindowAnimation = Date.now();
        retile(fx, border, RIGHT, LEFT);
        const back = animations[1].animations.find((x) => x.type === EFFECT.Translation);
        assertEquals(back.from.value1, 437.5, "the border is interrupted like any other window");
        assertEquals(faded(animations), 0, "and still never fades");
    });
});

Deno.test("a border reused for another window does not keep animating where it was", () => {
    // Focus moves: the border jumps to the new window instead of sliding there,
    // and the animation it was in the middle of must not carry on.
    withClock((advance) => {
        const { fx, animations, cancelled } = load();
        const border = makeWindow("HyprKwin overlay", LEFT);
        fx.lastWindowAnimation = Date.now();
        retile(fx, border, LEFT, RIGHT);
        advance(100);                               // no window has animated for longer than the grace
        retile(fx, border, RIGHT, TOP);
        assertEquals(animations.length, 1, "it jumps");
        assertEquals(cancelled.length, 1, "and the old animation is gone");
    });
});

// ---- Plasma's animation speed -----------------------------------------------

Deno.test("Plasma's global animation speed sets the duration", () => {
    const { fx, animations } = load({ Duration: 200 }, [], 2);
    retile(fx, makeWindow("A", LEFT), TOP, RIGHT);
    assertEquals(durationOf(animations[0]), 400);
});

Deno.test("with Plasma's animation speed at Instant, nothing animates", () => {
    const { fx, animations } = load({}, [], 0);
    retile(fx, makeWindow("A", LEFT), TOP, RIGHT);
    assertEquals(animations.length, 0);
});

// ---- maximizing -------------------------------------------------------------

// Plasma's Maximize effect on, as KWin reports a maximized window being
// tiled with Meta+Down under fractional scaling.
const MAXIMIZED = { x: 0, y: 0, width: 1536, height: 914.4 };
const BOTTOM_HALF = { x: 0, y: 457, width: 1536, height: 456.79999999999995 };
const BOTTOM_HALF_ROUNDED = { x: 0, y: 457, width: 1536, height: 456.8 };

function maximizedThenTiled(fx, a) {
    fx.manage(a);
    a.windowMaximizedStateAboutToChange.emit(a);
    a.windowMaximizedStateChanged.emit(a);
    retile(fx, a, MAXIMIZED, BOTTOM_HALF);
}

Deno.test("with Plasma's Maximize effect on, maximizing is left to it", () => {
    const { fx, animations } = load({}, ["maximize"]);
    maximizedThenTiled(fx, makeWindow("A", MAXIMIZED));
    assertEquals(animations.length, 0);
});

Deno.test("when rounding cuts Plasma's Maximize effect short, this takes over from the start", () => {
    // Plasma's effect compares sizes exactly, so 456.79999999999995 becoming
    // 456.8 counts as another resize and it gives up half way.
    const { fx, animations } = load({}, ["maximize"]);
    const a = makeWindow("A", MAXIMIZED);
    maximizedThenTiled(fx, a);
    retile(fx, a, BOTTOM_HALF, BOTTOM_HALF_ROUNDED);
    assertEquals(animations.length, 1);
    const size = animations[0].animations.find((x) => x.type === EFFECT.Size);
    assertEquals([size.from.value1, size.from.value2], [1536, 914.4], "from the maximized size");
    assertEquals(faded(animations), 0, "no fade: the Maximize effect's was cut short");
});

Deno.test("a quick second press while Plasma's Maximize effect runs is animated", () => {
    const { fx, animations } = load({}, ["maximize"]);
    const a = makeWindow("A", MAXIMIZED);
    maximizedThenTiled(fx, a);
    retile(fx, a, BOTTOM_HALF, { x: 0, y: 0, width: 768, height: 914.4 });   // Meta+Left straight after
    assertEquals(animations.length, 1);
    const size = animations[0].animations.find((x) => x.type === EFFECT.Size);
    assertEquals([size.from.value1, size.from.value2], [1536, 456.79999999999995], "from the half it had reached");
    assertEquals(faded(animations), 0);
});

Deno.test("a quick move at the same size while Plasma's Maximize effect runs is animated", () => {
    // Maximized, Meta+Left, then Meta+Right straight away: the Maximize
    // effect is still shrinking the window, and does not follow the move.
    const { fx, animations } = load({}, ["maximize"]);
    const a = makeWindow("A", MAXIMIZED);
    fx.manage(a);
    a.windowMaximizedStateAboutToChange.emit(a);
    a.windowMaximizedStateChanged.emit(a);
    const left = { x: 0, y: 0, width: 768, height: 914.4 };
    retile(fx, a, MAXIMIZED, left);
    assertEquals(animations.length, 0, "the restore is the Maximize effect's");
    retile(fx, a, left, { x: 768, y: 0, width: 768, height: 914.4 });
    assertEquals(animations.length, 1, "the move is ours");
    assertEquals(types(animations[0]), [EFFECT.Translation]);
});

Deno.test("a move before the maximize itself is left to Plasma's Maximize effect", () => {
    const { fx, animations } = load({}, ["maximize"]);
    const a = makeWindow("A", LEFT);
    fx.manage(a);
    a.windowMaximizedStateAboutToChange.emit(a);
    retile(fx, a, LEFT, RIGHT);
    assertEquals(animations.length, 0);
});

Deno.test("once Plasma's Maximize effect has finished, the next re-tile is ours again", () => {
    const { fx, animations } = load({}, ["maximize"]);
    const a = makeWindow("A", MAXIMIZED);
    maximizedThenTiled(fx, a);
    a.hkMaximize.until = Date.now() - 1;            // its animation is over
    retile(fx, a, BOTTOM_HALF, { x: 0, y: 0, width: 768, height: 914.4 });
    assertEquals(animations.length, 1);
});

Deno.test("with Plasma's Maximize effect off, a maximized window tiling animates", () => {
    // Maximized, then Meta+Down: the window leaves the maximized state.
    const { fx, animations } = load();
    const a = makeWindow("A", LEFT);
    fx.manage(a);
    a.windowMaximizedStateAboutToChange.emit(a);
    retile(fx, a, MAXIMIZED, BOTTOM_HALF);
    assertEquals(animations.length, 1);
});

Deno.test("with Plasma's Maximize effect off, a window partly off screen animates to maximized", () => {
    const { fx, animations } = load();
    const a = makeWindow("A", LEFT);
    fx.manage(a);
    a.windowMaximizedStateAboutToChange.emit(a);
    retile(fx, a, { x: -400, y: 300, width: 900, height: 600 }, MAXIMIZED);
    assertEquals(animations.length, 1);
    assertEquals(types(animations[0]).includes(EFFECT.Translation), true);
});

Deno.test("going fullscreen is still left to KWin", () => {
    const { fx, animations } = load();
    const a = makeWindow("A", LEFT);
    fx.manage(a);
    a.windowFullScreenChanged.emit(a);
    retile(fx, a, LEFT, { x: 0, y: 0, width: 1920, height: 1080 });
    assertEquals(animations.length, 0);
});
