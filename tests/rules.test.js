import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/rules.js", import.meta.url));
const R = new Function(src + "\nreturn { parseRules, matchRules, DEFAULT_RULES };")();

Deno.test("parses hyprland windowrule lines", () => {
    const { rules, errors } = R.parseRules(`
# comment
tile, class:^(steam)$, title:^Steam$
windowrule = float, class:^(steam)$
workspace 3 silent, class:^(discord)$
fullscreen, class:^(steam_app_.*)$
`);
    assertEquals(errors, []);
    assertEquals(rules.length, 4);
    assertEquals(R.matchRules(rules, { class: "steam", title: "Steam" }), { float: false });
    assertEquals(R.matchRules(rules, { class: "steam", title: "Friends List" }), { float: true });
    assertEquals(R.matchRules(rules, { class: "discord", title: "x" }), { workspace: { index: 3, silent: true } });
    assertEquals(R.matchRules(rules, { class: "steam_app_1234", title: "Game" }), { fullscreen: true });
});

Deno.test("reports bad lines without dropping good ones", () => {
    const { rules, errors } = R.parseRules("explode, class:x\nfloat, colour:red\nfloat, class:([\nfloat\npin, title:^PiP$");
    assertEquals(rules.length, 1);
    assertEquals(errors.length, 4);
});

Deno.test("default rules float plasma system windows", () => {
    const { rules, errors } = R.parseRules(R.DEFAULT_RULES.join("\n"));
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "org.kde.polkit-kde-authentication-agent-1", title: "" }).float, true);
    assertEquals(R.matchRules(rules, { class: "org.kde.krunner", title: "" }).float, true);
    assertEquals(R.matchRules(rules, { class: "org.kde.konsole", title: "" }).float, undefined);
});

Deno.test("focusonactivate takes an optional on/off", () => {
    const { rules, errors } = R.parseRules("focusonactivate off, class:^(discord)$\nfocusonactivate, class:^(spotify)$\nfocusonactivate 0, title:^Bell$");
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "discord", title: "" }), { focusonactivate: false });
    assertEquals(R.matchRules(rules, { class: "spotify", title: "" }), { focusonactivate: true });
    assertEquals(R.matchRules(rules, { class: "x", title: "Bell" }), { focusonactivate: false });
    assertEquals(R.matchRules(rules, { class: "x", title: "y" }), {});
});
