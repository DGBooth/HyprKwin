// Unit tests for the pure tiling engine. Run with: deno test tests/
import { assertEquals, assert } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/engine.js", import.meta.url));
const E = new Function(src + "\nreturn { createEngine, pickInDirection };")();

const AREA = { x: 0, y: 0, width: 1920, height: 1080 };
const S = "d1|out1";

function eng(cfg) {
    const e = E.createEngine(Object.assign({ gapsIn: 0, gapsOut: 0 }, cfg || {}));
    e.setArea(S, AREA);
    return e;
}

Deno.test("single window fills area minus outer gaps", () => {
    const e = E.createEngine({ gapsIn: 5, gapsOut: 10 });
    e.add("a", S);
    const l = e.layout(S, AREA);
    assertEquals(l.windows.a, { x: 10, y: 10, width: 1900, height: 1060 });
});

Deno.test("second window splits side by side on wide screens, new on right", () => {
    const e = eng();
    e.add("a", S); e.focused("a");
    e.add("b", S);
    const l = e.layout(S);
    assertEquals(l.windows.a, { x: 0, y: 0, width: 960, height: 1080 });
    assertEquals(l.windows.b, { x: 960, y: 0, width: 960, height: 1080 });
});

Deno.test("dwindle: third window splits the focused tile vertically", () => {
    const e = eng();
    e.add("a", S); e.focused("a");
    e.add("b", S); e.focused("b");
    e.add("c", S);
    const l = e.layout(S);
    assertEquals(l.windows.b, { x: 960, y: 0, width: 960, height: 540 });
    assertEquals(l.windows.c, { x: 960, y: 540, width: 960, height: 540 });
    assertEquals(e.dump(S), { dir: "h", ratio: 0.5, a: "a", b: { dir: "v", ratio: 0.5, a: "b", b: "c" } });
});

Deno.test("gaps: inner gaps doubled between windows, outer gaps at edges", () => {
    const e = E.createEngine({ gapsIn: 5, gapsOut: 10 });
    e.add("a", S); e.focused("a");
    e.add("b", S);
    const l = e.layout(S, AREA);
    assertEquals(l.windows.a, { x: 10, y: 10, width: 945, height: 1060 });
    assertEquals(l.windows.b, { x: 965, y: 10, width: 945, height: 1060 });
});

Deno.test("hyprland split ratio: first child gets ratio/2", () => {
    const e = eng({ splitRatio: 1.254 });
    e.add("a", S); e.focused("a");
    e.add("b", S);
    const l = e.layout(S);
    assertEquals(l.windows.a.width, Math.round(1920 * 0.627));
});

Deno.test("forceSplit 1 puts new window left/top; forceSplit 0 follows cursor", () => {
    let e = eng({ forceSplit: 1 });
    e.add("a", S); e.focused("a"); e.add("b", S);
    assertEquals(e.layout(S).windows.b.x, 0);
    e = eng({ forceSplit: 0 });
    e.add("a", S); e.focused("a"); e.add("b", S, { cursor: { x: 100, y: 500 } });
    assertEquals(e.layout(S).windows.b.x, 0);
    e.add("c", S, { target: "a", cursor: { x: 1800, y: 900 } });
    assertEquals(e.dump(S).b, { dir: "v", ratio: 0.5, a: "a", b: "c" });
});

Deno.test("removing a window gives its space to the sibling", () => {
    const e = eng();
    e.add("a", S); e.focused("a");
    e.add("b", S); e.focused("b");
    e.add("c", S);
    e.remove("b");
    const l = e.layout(S);
    assertEquals(l.windows.c, { x: 960, y: 0, width: 960, height: 1080 });
    e.remove("a");
    assertEquals(e.layout(S).windows.c, AREA);
    e.remove("c");
    assertEquals(e.spaces(), []);
});

Deno.test("togglesplit flips direction", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S);
    e.toggleSplit("b");
    const l = e.layout(S);
    assertEquals(l.windows.a, { x: 0, y: 0, width: 1920, height: 540 });
    assertEquals(l.windows.b, { x: 0, y: 540, width: 1920, height: 540 });
});

Deno.test("preserveSplit=false re-derives direction from aspect", () => {
    const e = eng({ preserveSplit: false });
    e.add("a", S); e.focused("a"); e.add("b", S);
    e.setArea(S, { x: 0, y: 0, width: 1000, height: 2000 });
    const l = e.layout(S);
    assertEquals(l.windows.b.y, 1000);
});

Deno.test("keyboard resize moves the divider, whichever side the window is on", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S);
    e.layout(S);
    e.moveDivider("b", 100, 0);          // "+" on the right-hand window: divider goes right
    let l = e.layout(S);
    assertEquals(l.windows.a.width, 1060);
    assertEquals(l.windows.b, { x: 1060, y: 0, width: 860, height: 1080 });
    e.moveDivider("a", -160, 0);         // "-" on the left-hand one: divider goes left
    l = e.layout(S);
    assertEquals(l.windows.a.width, 900);
    assertEquals(l.windows.b.x, 900);
});

Deno.test("keyboard resize picks the nearest divider in that axis", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S); e.focused("b"); e.add("c", S);
    const l0 = e.layout(S);                 // a | (b / c)
    e.moveDivider("b", 0, 100);             // shift+"+": b/c divider down
    let l = e.layout(S);
    assertEquals(l.windows.b.height, l0.windows.b.height + 100);
    assertEquals(l.windows.c.y, l0.windows.c.y + 100);
    e.moveDivider("c", 50, 0);              // a | (b / c) divider right
    l = e.layout(S);
    assertEquals(l.windows.a.width, l0.windows.a.width + 50);
    assertEquals(l.windows.b.x, l.windows.c.x);
    assertEquals(e.moveDivider("a", 0, 100), false, "a has no split above or below it");
});

Deno.test("interactive resize moves the shared edge", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S); e.focused("b"); e.add("c", S);
    const l0 = e.layout(S);
    // drag c's top edge up by 140 and its left edge right by 40
    const before = l0.windows.c;
    const after = { x: before.x + 40, y: before.y - 140, width: before.width - 40, height: before.height + 140 };
    e.resizeByRects("c", before, after);
    const l = e.layout(S);
    assertEquals(l.windows.c, { x: 1000, y: 400, width: 920, height: 680 });
    assertEquals(l.windows.b, { x: 1000, y: 0, width: 920, height: 400 });
    assertEquals(l.windows.a.width, 1000);
});

Deno.test("swap exchanges positions, including across spaces", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S);
    e.swap("a", "b");
    assertEquals(e.layout(S).windows.b.x, 0);
    const S2 = "d1|out2";
    e.setArea(S2, AREA);
    e.add("z", S2);
    e.swap("a", "z");
    assertEquals(e.spaceOf("a"), S2);
    assertEquals(e.spaceOf("z"), S);
});

Deno.test("dropOnto uses the closest edge of the target", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S); e.focused("b"); e.add("c", S);
    e.layout(S);
    // drop c onto the top part of a (a spans full height on the left)
    e.dropOnto("c", "a", { x: 480, y: 50 });
    assertEquals(e.dump(S), { dir: "h", ratio: 0.5, a: { dir: "v", ratio: 0.5, a: "c", b: "a" }, b: "b" });
});

Deno.test("groups: toggle, join, cycle, leave, dissolve", () => {
    const e = eng({ groupBarHeight: 20, groupBarGap: 0 });
    e.add("a", S); e.focused("a"); e.add("b", S); e.focused("b"); e.add("c", S);
    assert(e.toggleGroup("a"));
    assert(e.joinGroup("c", "a"));
    let l = e.layout(S);
    assertEquals(l.groups.length, 1);
    assertEquals(l.groups[0].wins, ["a", "c"]);
    assertEquals(l.groups[0].active, 1);
    assertEquals(l.windows.a, { x: 0, y: 20, width: 960, height: 1060 });
    assertEquals(l.hidden, ["a"]);
    assertEquals(l.windows.b, { x: 960, y: 0, width: 960, height: 1080 });
    assertEquals(e.groupCycle("c", 1), "a");
    assertEquals(e.groupSelect("a", 1), "c");
    // removing the active member keeps a valid active index
    e.remove("c");
    l = e.layout(S);
    assertEquals(l.groups[0].wins, ["a"]);
    assertEquals(l.groups[0].active, 0);
    e.add("d", S, { target: "b" });
    e.joinGroup("d", "a");
    assert(e.leaveGroup("d"));
    assertEquals(e.groupOf("a").wins, ["a"]);
    e.joinGroup("b", "a");
    e.toggleGroup("a");
    assertEquals(e.isGrouped("a"), false);
    assertEquals(e.count(S), 3);
    l = e.layout(S);
    assertEquals(l.groups.length, 0);
});

Deno.test("joinGroup requires a group target", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S);
    assertEquals(e.joinGroup("b", "a"), false);
});

Deno.test("pseudotile centres the preferred size in the tile", () => {
    const e = eng();
    e.add("a", S);
    e.setPseudo("a", { width: 800, height: 600 });
    assertEquals(e.layout(S).windows.a, { x: 560, y: 240, width: 800, height: 600 });
});

Deno.test("noGapsWhenOnly drops gaps for a lone window", () => {
    const e = E.createEngine({ gapsIn: 5, gapsOut: 10, noGapsWhenOnly: true });
    e.add("a", S);
    assertEquals(e.layout(S, AREA).windows.a, AREA);
});

Deno.test("moveToSpace inserts next to the last focused window there", () => {
    const e = eng();
    const S2 = "d2|out1";
    e.setArea(S2, AREA);
    e.add("x", S2); e.focused("x"); e.add("y", S2); e.focused("y");
    e.add("a", S);
    e.moveToSpace("a", S2);
    assertEquals(e.dump(S2), { dir: "h", ratio: 0.5, a: "x", b: { dir: "v", ratio: 0.5, a: "y", b: "a" } });
    assertEquals(e.spaces(), [S2]);
});

Deno.test("pickInDirection prefers overlapping neighbours", () => {
    const from = { x: 960, y: 540, width: 960, height: 540 };
    const cands = [
        { id: "left", rect: { x: 0, y: 0, width: 960, height: 1080 } },
        { id: "up", rect: { x: 960, y: 0, width: 960, height: 540 } },
        { id: "other-screen", rect: { x: 1920, y: 0, width: 1920, height: 1080 } },
    ];
    assertEquals(E.pickInDirection(from, cands, "left"), "left");
    assertEquals(E.pickInDirection(from, cands, "up"), "up");
    assertEquals(E.pickInDirection(from, cands, "right"), "other-screen");
    assertEquals(E.pickInDirection(from, cands, "down"), null);
});

Deno.test("pickInDirection breaks ties by focus history", () => {
    const from = { x: 0, y: 0, width: 960, height: 1080 };
    const cands = [
        { id: "top", rect: { x: 960, y: 0, width: 960, height: 540 } },
        { id: "bottom", rect: { x: 960, y: 540, width: 960, height: 540 } },
    ];
    assertEquals(E.pickInDirection(from, cands, "right", ["bottom", "top"]), "bottom");
    assertEquals(E.pickInDirection(from, cands, "right", ["top"]), "top");
});

Deno.test("hidden windows keep their slot but give up their space", () => {
    const e = eng();
    const hidden = new Set();
    e.setVisibility((id) => !hidden.has(id));
    e.add("a", S); e.focused("a"); e.add("b", S); e.focused("b"); e.add("c", S);
    hidden.add("b");
    let l = e.layout(S);
    assertEquals(l.windows.b, undefined);
    assertEquals(l.windows.c, { x: 960, y: 0, width: 960, height: 1080 });
    hidden.add("a");
    assertEquals(e.layout(S).windows.c, AREA);
    hidden.clear();
    l = e.layout(S);
    assertEquals(l.windows.b, { x: 960, y: 0, width: 960, height: 540 });
    assertEquals(l.windows.a.width, 960);
});

Deno.test("new windows split a visible tile, never a hidden one", () => {
    const e = eng();
    const hidden = new Set(["a"]);
    e.setVisibility((id) => !hidden.has(id));
    e.add("a", S); e.focused("a");
    e.add("b", S); e.focused("b");
    e.add("c", S);
    const l = e.layout(S);
    assertEquals(l.windows.b, { x: 0, y: 0, width: 960, height: 1080 });
    assertEquals(l.windows.c, { x: 960, y: 0, width: 960, height: 1080 });
});

Deno.test("group falls back to a visible member when the active one is hidden", () => {
    const e = eng({ groupBarHeight: 20, groupBarGap: 0 });
    const hidden = new Set();
    e.setVisibility((id) => !hidden.has(id));
    e.add("a", S); e.toggleGroup("a");
    e.add("b", S); e.joinGroup("b", "a");
    hidden.add("b");
    const l = e.layout(S);
    assertEquals(l.groups[0].active, 0);
    assertEquals(l.windows.a, { x: 0, y: 20, width: 1920, height: 1060 });
});

Deno.test("moveSpace transplants a tree or merges into an existing one", () => {
    const e = eng();
    const S2 = "d1|out2";
    e.setArea(S2, AREA);
    e.add("a", S); e.focused("a"); e.add("b", S);
    e.moveSpace(S, S2);
    assertEquals(e.spaces(), [S2]);
    assertEquals(e.spaceOf("b"), S2);
    e.add("x", S); e.toggleGroup("x"); e.add("y", S); e.joinGroup("y", "x");
    e.moveSpace(S, S2);
    assertEquals(e.count(S2), 4);
    assertEquals(e.groupOf("y").wins, ["x", "y"]);
});

Deno.test("focus can leave a floating window that overlaps its neighbours", () => {
    // A small floating window sitting over the gap between two tiles.
    const from = { x: 950, y: 530, width: 20, height: 20 };
    const cands = [
        { id: "left", rect: { x: 10, y: 10, width: 945, height: 1060 } },
        { id: "right", rect: { x: 965, y: 10, width: 945, height: 1060 } },
    ];
    assertEquals(E.pickInDirection(from, cands, "left"), "left");
    assertEquals(E.pickInDirection(from, cands, "right"), "right");
});

Deno.test("windows fully past the edge still win over merely overlapping ones", () => {
    const from = { x: 960, y: 0, width: 960, height: 1080 };
    const cands = [
        { id: "clear", rect: { x: 0, y: 0, width: 900, height: 1080 } },
        { id: "overlapping", rect: { x: 700, y: 0, width: 400, height: 1080 } },
    ];
    assertEquals(E.pickInDirection(from, cands, "left"), "clear");
});

// ---- master and monocle layouts ------------------------------------------

function three(e, space = S) {
    e.add("a", space); e.focused("a");
    e.add("b", space); e.focused("b");
    e.add("c", space); e.focused("c");
    return e;
}

Deno.test("master layout: one master beside a stack", () => {
    const e = eng({ defaultLayout: "master", masterFactor: 0.6, gapsIn: 0, gapsOut: 0 });
    three(e);
    const l = e.layout(S, { x: 0, y: 0, width: 1000, height: 900 });
    assertEquals(l.windows.a, { x: 0, y: 0, width: 600, height: 900 }, "master takes 60%");
    assertEquals(l.windows.b, { x: 600, y: 0, width: 400, height: 450 });
    assertEquals(l.windows.c, { x: 600, y: 450, width: 400, height: 450 });
});

Deno.test("master layout: count, orientation and the single-window case", () => {
    const e = eng({ defaultLayout: "master", masterFactor: 0.5, gapsIn: 0, gapsOut: 0 });
    e.add("a", S);
    assertEquals(e.layout(S, { x: 0, y: 0, width: 1000, height: 900 }).windows.a,
                 { x: 0, y: 0, width: 1000, height: 900 }, "alone: the whole area");
    three(e);
    e.setMasterCount(S, 1);                       // two masters now
    let l = e.layout(S);
    assertEquals([l.windows.a.height, l.windows.b.y], [450, 450], "masters share the master area");
    assertEquals(l.windows.c, { x: 500, y: 0, width: 500, height: 900 }, "c is the whole stack");
    assertEquals(e.cycleMasterOrientation(S, 1), "right");
    l = e.layout(S);
    assertEquals([l.windows.a.x, l.windows.c.x], [500, 0], "masters move to the right");
    assertEquals(e.cycleMasterOrientation(S, 1), "top");
    l = e.layout(S);
    assertEquals([l.windows.a.y, l.windows.a.width, l.windows.c.y], [0, 500, 450], "masters on top, side by side");
});

Deno.test("master layout: centre puts the stack on both sides", () => {
    const e = eng({ defaultLayout: "master", masterFactor: 0.5, masterOrientation: "center", gapsIn: 0, gapsOut: 0 });
    three(e);
    e.add("d", S);
    const l = e.layout(S, { x: 0, y: 0, width: 1000, height: 800 });
    assertEquals(l.windows.a, { x: 250, y: 0, width: 500, height: 800 }, "master in the middle");
    assertEquals([l.windows.b.x, l.windows.d.x], [750, 750], "b and d to the right");
    assertEquals(l.windows.c, { x: 0, y: 0, width: 250, height: 800 }, "c to the left");
});

Deno.test("master layout: the divider moves right on a positive delta", () => {
    const e = eng({ defaultLayout: "master", masterFactor: 0.5, gapsIn: 0, gapsOut: 0 });
    three(e);
    e.layout(S, { x: 0, y: 0, width: 1000, height: 900 });
    e.moveDivider("c", 100, 0);                    // from a stack window
    assertEquals(e.layout(S).windows.a.width, 600, "master grew");
    e.moveDivider("a", -200, 0);                   // and from the master
    assertEquals(e.layout(S).windows.a.width, 400, "master shrank");
    e.cycleMasterOrientation(S, 1);                // master on the right, 400 wide
    e.moveDivider("a", 100, 0);
    assertEquals(e.layout(S).windows.a.width, 300, "the divider goes right, so a master on the right shrinks");
});

Deno.test("monocle layout: every window fills the area", () => {
    const e = eng({ defaultLayout: "monocle", gapsOut: 10, gapsIn: 5 });
    three(e);
    const l = e.layout(S, { x: 0, y: 0, width: 1000, height: 900 });
    const full = { x: 10, y: 10, width: 980, height: 880 };
    assertEquals([l.windows.a, l.windows.b, l.windows.c], [full, full, full]);
    assertEquals(e.moveDivider("a", 100, 0), false, "nothing to resize");
    assertEquals(e.cycleWindow("a", 1), "b", "cycling moves through them");
    assertEquals(e.cycleWindow("a", -1), "c");
});

Deno.test("layouts are per space, and dwindle is untouched", () => {
    const e = eng({ gapsIn: 0, gapsOut: 0 });
    const other = "desk2|screen";
    three(e);
    e.add("z", other);
    assertEquals([e.layoutOf(S), e.layoutOf(other)], ["dwindle", "dwindle"]);
    assertEquals(e.setLayout(S, "master"), true);
    assertEquals([e.layoutOf(S), e.layoutOf(other)], ["master", "dwindle"], "only that space changed");
    assertEquals(e.cycleLayout(S, 1), "monocle");
    assertEquals(e.cycleLayout(S, 1), "scrolling");
    assertEquals(e.cycleLayout(S, 1), "dwindle", "and round again");
    const l = e.layout(S, { x: 0, y: 0, width: 1000, height: 900 });
    assertEquals([l.windows.a.width, l.windows.b.width, l.windows.c.height], [500, 500, 450], "dwindle as before");
});

Deno.test("master: swapwithmaster and new windows joining", () => {
    const e = eng({ defaultLayout: "master", gapsIn: 0, gapsOut: 0 });
    three(e);
    assertEquals(e.firstMaster(S), "a");
    assertEquals(e.swapWithMaster("c"), true);
    assertEquals(e.firstMaster(S), "c", "c is the master now");
    e.add("d", S);                                 // joins the end by default
    assertEquals(e.layout(S, { x: 0, y: 0, width: 1000, height: 900 }).windows.d.y, 600);
    e.setConfig({ masterNewIsMaster: true });
    e.add("m", S);
    assertEquals(e.firstMaster(S), "m", "new windows can become the master instead");
});

Deno.test("scrolling layout: whole columns, and the rest reported off-view", () => {
    const e = eng({ defaultLayout: "scrolling", columnWidth: 0.5, gapsIn: 0, gapsOut: 0 });
    e.add("a", S); e.focused("a");
    e.add("b", S); e.focused("b");
    e.add("c", S); e.focused("c");
    let l = e.layout(S, { x: 0, y: 0, width: 1000, height: 900 });
    // c is focused, so the strip shows the two columns that fit ending at c.
    assertEquals(l.offscreen, ["a"], "a is scrolled out of view");
    assertEquals(l.windows.b, { x: 0, y: 0, width: 500, height: 900 });
    assertEquals(l.windows.c, { x: 500, y: 0, width: 500, height: 900 });
    assertEquals(l.windows.a, undefined, "nothing is placed for it");
    e.focused("a");
    l = e.layout(S);
    assertEquals(l.offscreen, ["c"], "focusing a scrolls back to the start");
    assertEquals(l.windows.a.x, 0);
    assertEquals(l.windows.b.x, 500);
});

Deno.test("scrolling layout: column width, and a wide column taking the view", () => {
    const e = eng({ defaultLayout: "scrolling", columnWidth: 0.5, gapsIn: 0, gapsOut: 0 });
    e.add("a", S); e.focused("a");
    e.add("b", S); e.focused("b");
    e.layout(S, { x: 0, y: 0, width: 1000, height: 900 });
    e.moveDivider("b", 300, 0);                       // widen the focused column
    let l = e.layout(S);
    assertEquals(l.windows.b.width, 800, "b is wider");
    assertEquals(l.offscreen, ["a"], "so a no longer fits beside it");
    e.moveDivider("b", -300, 0);
    l = e.layout(S);
    assertEquals([l.windows.a.width, l.windows.b.width], [500, 500], "back to two columns");
    assertEquals(l.offscreen, []);
    assertEquals(e.moveDivider("b", 0, 100), false, "there is nothing to resize vertically");
});

Deno.test("closing a window hands over to the one taking its place", () => {
    const e = eng();
    e.add("a", S); e.add("b", S); e.add("c", S);
    e.focused("a"); e.focused("b"); e.focused("c");
    // dwindle: a | (b / c). a's neighbour is the side of the split it shared,
    // most recently used first.
    assertEquals(e.neighbourOf("a"), "c");
    assertEquals(e.neighbourOf("c"), "b", "and c's is its own sibling");
});

Deno.test("in a group, the next tab takes over", () => {
    const e = eng();
    e.add("a", S); e.add("b", S);
    e.joinGroup("b", "a");
    assertEquals(e.neighbourOf("a"), "b");
});

Deno.test("the other layouts hand over to the next window along", () => {
    const e = eng();
    e.add("a", S); e.add("b", S); e.add("c", S);
    e.setLayout(S, "monocle");
    assertEquals(e.neighbourOf("b"), "c");
    assertEquals(e.neighbourOf("c"), "b", "the last one falls back to the one before");
});

Deno.test("a space moved to an empty one keeps its layout and master settings", () => {
    const e = eng();
    e.add("a", S); e.add("b", S);
    e.setLayout(S, "master");
    e.setMasterCount(S, 1);
    e.cycleMasterOrientation(S, 1);            // left -> right
    const T = "d2|out2";
    assertEquals(e.moveSpace(S, T), true);
    assertEquals(e.layoutOf(T), "master", "the layout travelled with the windows");
    assertEquals(e.masterParams(T).orientation, "right");
    assertEquals(e.layoutOf(S), "dwindle", "and the old place forgot it");
});

// a | (b / c): zooming towards c goes to the right half, then to c alone.
function threeUp() {
    const e = eng({ gapsIn: 0, gapsOut: 0 });
    e.add("a", S); e.add("b", S); e.add("c", S);
    e.focused("c");
    return e;
}

Deno.test("zooming in fills the area with the part of the tree around the window", () => {
    const e = threeUp();
    assertEquals(e.zoomIn("c"), true);
    let l = e.layout(S, AREA);
    assertEquals(l.windows.b, { x: 0, y: 0, width: 1920, height: 540 }, "b takes the top half of the screen");
    assertEquals(l.windows.c, { x: 0, y: 540, width: 1920, height: 540 });
    assertEquals(l.offscreen, ["a"], "a waits off screen");
    assertEquals(e.zoomInfo(S), { shown: 2, total: 3 });
    assertEquals(e.zoomIn("c"), true);
    l = e.layout(S, AREA);
    assertEquals(l.windows.c, AREA, "then c alone");
    assertEquals(l.offscreen.sort(), ["a", "b"]);
    assertEquals(e.zoomIn("c"), false, "nothing further in");
});

Deno.test("zooming out goes back a level at a time", () => {
    const e = threeUp();
    e.zoomIn("c"); e.zoomIn("c");
    assertEquals(e.zoomOut(S), true);
    assertEquals(e.zoomInfo(S), { shown: 2, total: 3 });
    assertEquals(e.zoomOut(S), true);
    assertEquals(e.zoomInfo(S), null, "all the way out");
    assertEquals(e.layout(S, AREA).offscreen, []);
    assertEquals(e.zoomOut(S), false);
});

Deno.test("a window opened while zoomed joins the zoom", () => {
    const e = threeUp();
    e.zoomIn("c"); e.zoomIn("c");         // c alone
    e.add("d", S);                        // splits c, the focused tile
    const l = e.layout(S, AREA);
    assertEquals(l.offscreen.sort(), ["a", "b"], "d is on screen beside c");
    assertEquals(e.zoomInfo(S), { shown: 2, total: 4 });
});

Deno.test("closing the zoomed window hands the zoom to what takes its place", () => {
    const e = threeUp();
    e.zoomIn("c"); e.zoomIn("c");
    e.remove("c");
    assertEquals(e.zoomInfo(S), { shown: 1, total: 2 }, "b takes c's place, and the zoom with it");
    assertEquals(e.layout(S, AREA).windows.b, AREA, "b fills the screen; a still waits off it");
    const e2 = threeUp();
    e2.zoomIn("c");                       // the right half: b / c
    e2.remove("b");
    assertEquals(e2.inZoom("c"), true);
    assertEquals(e2.layout(S, AREA).windows.c, AREA, "c alone fills the zoom");
});

Deno.test("zoom only applies to the dwindle layout", () => {
    const e = threeUp();
    e.setLayout(S, "master");
    assertEquals(e.zoomIn("c"), false);
    const e2 = threeUp();
    e2.zoomIn("c");
    e2.setLayout(S, "monocle");
    assertEquals(e2.zoomInfo(S), null, "switching layout ends the zoom");
});

Deno.test("a workspace's layout choices export and come back in a new engine", () => {
    const e = eng();
    e.add("a", S); e.add("b", S);
    e.setLayout(S, "master");
    e.cycleMasterOrientation(S, 1);            // right
    e.setLayout("d2|out1", "scrolling");       // chosen on an empty workspace too
    const saved = JSON.parse(JSON.stringify(e.exportSettings()));
    const fresh = eng();
    assertEquals(fresh.importSettings(saved), 2);
    assertEquals(fresh.layoutOf(S), "master");
    assertEquals(fresh.masterParams(S).orientation, "right");
    assertEquals(fresh.layoutOf("d2|out1"), "scrolling");
});

Deno.test("nonsense in saved settings is ignored", () => {
    const e = eng();
    assertEquals(e.importSettings("junk"), 0);
    e.importSettings({ [S]: { layout: "spiral", factor: "big", orientation: "sideways" } });
    assertEquals(e.layoutOf(S), "dwindle");
    assertEquals(e.masterParams(S).orientation, "left");
});
