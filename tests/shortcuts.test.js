// Unit tests for the shortcut list and submap parsing.
import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/shortcuts.js", import.meta.url));
const S = new Function(src + "\nreturn { shortcutList, parseSubmaps, keyCode };")();

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

Deno.test("key sequences become Qt's key codes", () => {
    assertEquals(S.keyCode("Meta+Left"), 0x11000012, "what KDE answered for Meta+Left");
    assertEquals(S.keyCode("Meta+Q"), 0x10000051);
    assertEquals(S.keyCode("Meta+Shift+Z"), 0x1200005A);
    assertEquals(S.keyCode("Meta++"), 0x1000002B, "the + key itself");
    assertEquals(S.keyCode("Meta+!"), 0x10000021);
    assertEquals(S.keyCode("Meta+Ctrl+Shift+Right"), 0x17000014);
    assertEquals(S.keyCode("Meta+F5"), 0x11000034);
    assertEquals(S.keyCode(""), 0);
    assertEquals(S.keyCode("Hyper+Q"), 0, "unknown modifier: cannot tell");
});

Deno.test("every default key has a code to check", () => {
    const missing = S.shortcutList().filter((s) => s.key && !S.keyCode(s.key)).map((s) => s.key);
    assertEquals(missing, []);
});
