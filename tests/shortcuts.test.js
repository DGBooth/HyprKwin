// Unit tests for the shortcut list and submap parsing.
import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/shortcuts.js", import.meta.url));
const S = new Function(src + "\nreturn { shortcutList, parseSubmaps, keyCode, keyText, keysGuide };")();

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

Deno.test("key numbers read back as the text KDE shows", () => {
    for (const k of ["Meta+Q", "Meta+Shift+Left", "Meta+Ctrl+Alt+Shift+Tab", "Meta++", "Meta+-", "Meta+!", "Ctrl+Alt+Tab", "Meta+F5", "Esc", "Meta+Space"]) {
        assertEquals(S.keyText(S.keyCode(k)), k);
    }
    assertEquals(S.keyText(0), "");
});

function infos(overrides) {
    // allShortcutInfos() as KDE answers it: every HyprKwin action on its
    // default key, apart from the overrides.
    return S.shortcutList().map((s) => {
        const keys = s.action in overrides ? overrides[s.action] : (s.key ? [S.keyCode(s.key)] : []);
        return [s.name, s.text, "kwin", "KWin", "default", "Default Context", keys, []];
    }).concat([["Switch to Desktop 1", "Switch to Desktop 1", "kwin", "KWin", "default", "Default Context", [0], []]]);
}

function find(guide, label) {
    for (const s of guide) for (const r of s.rows) if (r.label === label) return { section: s.title, ...r };
    return null;
}

Deno.test("the keys guide shows the keys as they are bound, not the defaults", () => {
    const guide = S.keysGuide(infos({ close: [S.keyCode("Meta+W")], pseudo: [] }), [], [], {});
    assertEquals(guide.map((s) => s.title),
                 ["Windows", "Focus and moving", "Resizing", "Workspaces and monitors", "Scratchpads", "Layouts", "Groups", "Other"]);
    assertEquals(find(guide, "Close window"), { section: "Windows", label: "Close window", keys: ["Meta+W"] });
    assertEquals(find(guide, "Pseudotile window").keys, [], "unbound");
    assertEquals(find(guide, "Show keyboard shortcuts").keys, ["Meta+K"]);
    assertEquals(guide.flatMap((s) => s.rows).some((r) => /Switch to Desktop/.test(r.label)), false, "only HyprKwin's own");
});

Deno.test("numbered runs fold into one row while they follow a pattern", () => {
    let guide = S.keysGuide(infos({}), [], [], {});
    assertEquals(find(guide, "Switch to workspace 1–10"), { section: "Workspaces and monitors", label: "Switch to workspace 1–10", keys: ["Meta+1…0"] });
    assertEquals(find(guide, "Move window to workspace 1–10").keys, ["Meta+!…)"]);
    assertEquals(find(guide, "Switch to group window 1–5").section, "Groups");
    assertEquals(find(guide, "Switch to workspace 3"), null);
    guide = S.keysGuide(infos({ desktop3: [S.keyCode("Meta+F3")] }), [], [], {});
    assertEquals(find(guide, "Switch to workspace 1–10"), null, "rebound: listed one by one");
    assertEquals(find(guide, "Switch to workspace 3").keys, ["Meta+F3"]);
});

Deno.test("the keys guide says which keys other shortcuts hold, names scratchpads, and lists submaps", () => {
    const { submaps } = S.parseSubmaps("resize = Meta+R, Left: resizeLeft", ACTIONS);
    const guide = S.keysGuide(infos({ focusLeft: [] }), submaps,
                              [{ key: "Meta+Left", action: "focusLeft", owner: "Quick Tile Window to the Left" }],
                              { toggleScratchpad1: "Toggle scratchpad “music”" });
    assertEquals(find(guide, "Focus window left").note, "Meta+Left is Quick Tile Window to the Left's");
    assertEquals(find(guide, "Toggle scratchpad “music”").section, "Scratchpads");
    const sub = guide[guide.length - 1];
    assertEquals(sub.title, "Submaps");
    assertEquals(sub.rows.map((r) => [r.label, r.keys[0]]), [
        ["Enter the resize submap", "Meta+R"], ["resize: Move split left", "Left"], ["resize: Leave the submap", "Esc"]]);
});

Deno.test("bound keys come first, and unnamed unbound scratchpad slots are left out", () => {
    const guide = S.keysGuide(infos({}), [], [], { toggleScratchpad1: "Toggle scratchpad “music”" });
    const windows = guide[0].rows;
    const firstUnbound = windows.findIndex((r) => !r.keys.length);
    assertEquals(windows.slice(firstUnbound).every((r) => !r.keys.length), true);
    const pads = guide.find((s) => s.title === "Scratchpads").rows.map((r) => r.label);
    assertEquals(pads, ["Toggle scratchpad", "Move window to/from scratchpad", "Toggle scratchpad “music”"]);
});
