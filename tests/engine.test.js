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

Deno.test("keyboard resize grows the right window leftwards", () => {
    const e = eng();
    e.add("a", S); e.focused("a"); e.add("b", S);
    e.layout(S);
    e.resize("b", 100, 0);
    const l = e.layout(S);
    assertEquals(l.windows.b, { x: 860, y: 0, width: 1060, height: 1080 });
    e.resize("a", -60, 0);
    assertEquals(e.layout(S).windows.a.width, 800);
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
