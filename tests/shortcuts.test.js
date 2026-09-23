// Unit tests for the shortcut list and submap parsing.
import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/shortcuts.js", import.meta.url));
const S = new Function(src + "\nreturn { shortcutList, parseSubmaps };")();

const ACTIONS = ["resizeLeft", "resizeRight", "toggleFloating"];

Deno.test("every shortcut has a name, a label and a key field", () => {
    const list = S.shortcutList();
    assertEquals(list.length > 100, true);
    assertEquals(list.every((s) => s.name.startsWith("HyprKwin ") && s.text.startsWith("HyprKwin: ")), true);
    const names = new Set(list.map((s) => s.name));
    assertEquals(names.size, list.length, "no duplicates");
    const keys = list.filter((s) => s.key).map((s) => s.key);
    assertEquals(new Set(keys).size, keys.length, "no two defaults on one key");
});

Deno.test("a submap is a key and what the plain keys do inside it", () => {
    const { submaps, errors } = S.parseSubmaps("resize = Meta+R, Left: resizeLeft, Right: resizeRight", ACTIONS);
    assertEquals(errors, []);
    assertEquals(submaps.length, 1);
    assertEquals(submaps[0].name, "resize");
    assertEquals(submaps[0].key, "Meta+R");
    assertEquals(submaps[0].binds, [{ key: "Left", action: "resizeLeft" }, { key: "Right", action: "resizeRight" }]);
});

Deno.test("submaps say what is wrong with them", () => {
    const bad = S.parseSubmaps([
        "resize Meta+R",                          // no =
        "resize = Meta+R, Left: fly",             // no such action
        "resize = Meta+R",                        // no keys in it
        "resize = Left: resizeLeft",              // entry key missing
        "# a comment",
    ].join("\n"), ACTIONS);
    assertEquals(bad.submaps, []);
    assertEquals(bad.errors.length, 4);
    assertEquals(bad.errors[1].includes("no action called 'fly'"), true);
});

Deno.test("two submaps cannot share a name", () => {
    const { submaps, errors } = S.parseSubmaps(
        "resize = Meta+R, Left: resizeLeft\nresize = Meta+T, Right: resizeRight", ACTIONS);
    assertEquals(submaps.length, 1);
    assertEquals(errors.length, 1);
});
