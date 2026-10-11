// Unit tests for the shortcut list and submap parsing.
import { assertEquals, assert } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/shortcuts.js", import.meta.url));
const DIGIT_ROW = new Function(Deno.readTextFileSync(new URL("../package/contents/code/digitrow.js", import.meta.url)) + "\nreturn DIGIT_ROW;")();
const S = new Function(src + "\nreturn { shortcutList, parseSubmaps, keyCode, keyText, keysGuide, filterKeysGuide, layoutKeys, ownDigitCodes };")();

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

Deno.test("the keys guide can be searched by name, section, key or loosely", () => {
    const { submaps } = S.parseSubmaps("resize = Meta+R, Left: resizeLeft", ACTIONS);
    const guide = S.keysGuide(infos({}), submaps, [], {});
    const labels = (q) => S.filterKeysGuide(guide, q).flatMap((s) => s.rows.map((r) => r.label));
    assertEquals(S.filterKeysGuide(guide, "  "), guide, "nothing typed: everything");
    assertEquals(labels("close"), ["Close window"]);
    assertEquals(labels("CLOSE win"), ["Close window"], "any case, every word");
    assertEquals(labels("meta+k"), ["Show keyboard shortcuts"], "by key");
    assert(labels("scratchpad").length >= 2, "by section");
    assert(labels("swtw").includes("Switch to workspace 1–10"), "letters in order");
    assertEquals(labels("zzzz"), [], "nothing matches");
    // A submap's lines bring the line that enters it.
    assertEquals(S.filterKeysGuide(guide, "resize: left").find((s) => s.title === "Submaps").rows.map((r) => r.label),
                 ["Enter the resize submap", "resize: Move split left"]);
    const sub = S.filterKeysGuide(guide, "leave the submap").find((s) => s.title === "Submaps");
    assertEquals(sub.rows[0].label, "Enter the resize submap", "the submap's own entry comes first");
    assertEquals(S.filterKeysGuide(guide, "close")[0].rows.length, 1, "sections keep only what matches");
});

Deno.test("workspace keys follow the keyboard layout's digit row", () => {
    const us = S.layoutKeys(DIGIT_ROW, "us", "");
    assertEquals([us.desktop1, us.moveToDesktop3, us.moveToDesktopSilent2, us.groupWindow5], ["Meta+1", "Meta+#", "Meta+Alt+@", "Meta+Alt+5"]);
    const gb = S.layoutKeys(DIGIT_ROW, "gb", "");
    assertEquals([gb.desktop3, gb.moveToDesktop2, gb.moveToDesktop3, gb.moveToDesktopSilent3], ["Meta+3", 'Meta+"', "Meta+£", "Meta+Alt+£"]);
    const fr = S.layoutKeys(DIGIT_ROW, "fr", "");
    assertEquals([fr.desktop1, fr.desktop2, fr.moveToDesktop1, fr.desktop10], ["Meta+&", "Meta+é", "Meta+1", "Meta+à"], "AZERTY: digits need Shift");
    assertEquals(S.layoutKeys(DIGIT_ROW, "gb", "extd").moveToDesktop3, "Meta+£", "a variant not in the table types what its layout does");
    assertEquals(S.layoutKeys(DIGIT_ROW, "xx", "").moveToDesktop3, "Meta+#", "an unknown layout: US");
    assertEquals("moveToDesktop6" in S.layoutKeys(DIGIT_ROW, "us", "intl"), false, "a dead key: left out");
    assertEquals(S.keyCode("Meta+£"), 0x10000000 | 0xa3);
    assertEquals(S.keyCode("Meta+é"), 0x10000000 | 0xc9, "Qt names it by its capital");
});

Deno.test("a key HyprKwin gave an action on any layout is HyprKwin's to change", () => {
    const own = S.ownDigitCodes(DIGIT_ROW, "moveToDesktop3");
    for (const k of ["Meta+#", "Meta+£", "Meta+3", "Meta+§"]) assert(own.includes(S.keyCode(k)), k);
    assert(!own.includes(S.keyCode("Meta+F3")), "one the user chose is not");
    assert(!own.includes(S.keyCode("Meta+Alt+£")), "nor another family's");
});

Deno.test("a submap whose key another shortcut holds is marked in the keys guide", () => {
    const { submaps } = S.parseSubmaps("resize = Meta+W, Left: resizeLeft", ACTIONS);
    const guide = S.keysGuide(infos({}), submaps, [{ key: "Meta+W", action: "submap resize", owner: "Overview" }], {});
    assertEquals(find(guide, "Enter the resize submap"),
                 { section: "Submaps", label: "Enter the resize submap", keys: [], note: "Meta+W is Overview's" });
});
