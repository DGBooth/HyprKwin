import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/rules.js", import.meta.url));
const R = new Function(src + "\nreturn { parseRules, matchRules, parseWorkspaceRules, DEFAULT_RULES };")();

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

Deno.test("geometry, monitor, opacity and noborder rules", () => {
    const { rules, errors } = R.parseRules([
        "float, class:^(pavucontrol)$",
        "size 800 600, class:^(pavucontrol)$",
        "center, class:^(pavucontrol)$",
        "move 10% 40, class:^(mpv)$",
        "size 50% 45%, class:^(mpv)$",
        "monitor DP-2, class:^(discord)$",
        "monitor 1, class:^(spotify)$",
        "opacity 0.9 0.7, class:^(Alacritty)$",
        "opacity 0.8 override, class:^(kitty)$",
        "noborder, class:^(steam)$",
    ].join("\n"));
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "pavucontrol", title: "" }), {
        float: true, size: { width: { value: 800, percent: false }, height: { value: 600, percent: false } }, center: true,
    });
    assertEquals(R.matchRules(rules, { class: "mpv", title: "" }), {
        move: { x: { value: 10, percent: true }, y: { value: 40, percent: false } },
        size: { width: { value: 50, percent: true }, height: { value: 45, percent: true } },
    });
    assertEquals(R.matchRules(rules, { class: "discord", title: "" }).monitor, "DP-2");
    assertEquals(R.matchRules(rules, { class: "spotify", title: "" }).monitor, "1");
    assertEquals(R.matchRules(rules, { class: "Alacritty", title: "" }).opacity, { active: 0.9, inactive: 0.7 });
    assertEquals(R.matchRules(rules, { class: "kitty", title: "" }).opacity, { active: 0.8, inactive: 0.8 });
    assertEquals(R.matchRules(rules, { class: "steam", title: "" }), { noborder: true });
});

Deno.test("floating: rules wait until the window is known to float", () => {
    const { rules, errors } = R.parseRules("size 700 500, floating:1, class:^(foot)$\nopacity 0.5, floating:0, class:^(foot)$");
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "foot", title: "" }), {}, "still deciding: neither applies");
    assertEquals(Object.keys(R.matchRules(rules, { class: "foot", title: "", floating: true })), ["size"]);
    assertEquals(Object.keys(R.matchRules(rules, { class: "foot", title: "", floating: false })), ["opacity"]);
});

Deno.test("bad arguments are reported, not guessed", () => {
    const { rules, errors } = R.parseRules([
        "size 800, class:x", "size big 600, class:x", "move 10, class:x",
        "monitor, class:x", "opacity 1.5, class:x", "opacity, class:x", "float, floating:maybe, class:x",
    ].join("\n"));
    assertEquals(rules.length, 0);
    assertEquals(errors.length, 7);
});

Deno.test("workspace rules pin a workspace to a monitor", () => {
    const { rules, errors } = R.parseWorkspaceRules("workspace = 3, monitor:DP-2, default:true");
    assertEquals(errors, []);
    assertEquals(rules[3].monitor, "DP-2");
    assertEquals(rules[3].isDefault, true);
});

Deno.test("workspace rules carry a layout and gaps", () => {
    const { rules, errors } = R.parseWorkspaceRules("2, layout:master, gapsin:0, gaps_out:4\n# a comment");
    assertEquals(errors, []);
    assertEquals([rules[2].layout, rules[2].gapsIn, rules[2].gapsOut], ["master", 0, 4]);
});

Deno.test("several lines for one workspace merge, first wins", () => {
    const { rules } = R.parseWorkspaceRules("1, layout:master\n1, layout:monocle, gapsin:2");
    assertEquals([rules[1].layout, rules[1].gapsIn], ["master", 2]);
});

Deno.test("a workspace rule says what is wrong with it", () => {
    const bad = R.parseWorkspaceRules("monitor:DP-2\n2, layout:spiral\n3, colour:red");
    assertEquals(bad.errors.length, 3);
    assertEquals(bad.errors[1].includes("layout:"), true);
    assertEquals(Object.keys(bad.rules), []);
});
