// Window rules in Hyprland's windowrule syntax, one per line:
//
//   float, class:^(org\.kde\.kcalc)$
//   tile, class:^(steam)$, title:^Steam$
//   workspace 3 silent, class:^(discord)$
//   fullscreen, class:^(steam_app_.*)$
//
// Supported actions: float, tile, pseudo, fullscreen, maximize, group,
// special, pin, workspace <n> [silent], focusonactivate [on|off],
// size <w> <h>, move <x> <y>, center, monitor <n|name>, opacity <a> [<i>],
// noborder. Sizes and positions are pixels or a percentage of the monitor.
// Supported matchers: class, title (initialClass / initialTitle are accepted
// as aliases), and floating:1 / floating:0. Lines starting with '#' are
// comments. The first matching rule for each kind of action wins, so user
// rules placed before the defaults override them.

var RULE_ACTIONS = ["float", "tile", "pseudo", "fullscreen", "maximize", "group", "special", "pin", "workspace",
    "focusonactivate", "size", "move", "center", "monitor", "opacity", "noborder"];

// "800", "50%" -> {value, percent}; anything else -> null.
function parseLength(text) {
    var m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(String(text || ""));
    return m ? { value: parseFloat(m[1]), percent: m[2] === "%" } : null;
}

function parseOpacity(text) {
    var v = parseFloat(text);
    return isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

// Arguments each action needs; returns an error message or null.
function checkArgs(action, args) {
    switch (action) {
    case "size":
    case "move":
        if (args.length < 2 || !parseLength(args[0]) || !parseLength(args[1])) {
            return action + " needs two numbers (pixels, or a percentage of the monitor)";
        }
        return null;
    case "monitor":
        return args.length ? null : "monitor needs a number or a name, e.g. monitor 1 or monitor DP-2";
    case "opacity": {
        // "override" (Hyprland's absolute-rather-than-multiplied flag) is
        // what HyprKwin does anyway.
        var nums = args.filter(function (a) { return a !== "override"; });
        if (!nums.length || nums.length > 2 || nums.some(function (a) { return parseOpacity(a) === null; })) {
            return "opacity needs one or two values between 0 and 1";
        }
        return null;
    }
    default:
        return null;
    }
}

// Plasma system windows that should never be tiled.
var DEFAULT_RULES = [
    "float, class:^(org\\.kde\\.)?polkit-kde-authentication-agent-1$",
    "float, class:^(org\\.kde\\.)?(plasmashell|krunner|ksmserver-logout-greeter|ksecretd|kwalletd6|kded6?)$",
    "float, class:^(org\\.kde\\.)?(spectacle|yakuake|kdialog|plasma\\.emojier|kdeconnect\\.daemon)$",
    "float, class:^org\\.freedesktop\\.impl\\.portal\\.desktop\\.kde$",
    "float, class:^(xwaylandvideobridge|pinentry.*|zenity|org\\.kde\\.kinfocenter\\.popup)$",
    "float, title:^(Picture[- ]in[- ][Pp]icture)$",
];

function parseRules(text) {
    var rules = [];
    var errors = [];
    String(text || "").split(/\r?\n/).forEach(function (raw, lineNo) {
        var line = raw.trim();
        if (!line || line.charAt(0) === "#") return;
        // Accept full Hyprland lines too: "windowrule = float, class:..."
        line = line.replace(/^windowrule(v2)?\s*=\s*/, "");
        var parts = line.split(",").map(function (p) { return p.trim(); });
        var actionWords = parts.shift().split(/\s+/);
        var action = actionWords[0].toLowerCase();
        if (RULE_ACTIONS.indexOf(action) < 0) {
            errors.push("line " + (lineNo + 1) + ": unknown action '" + action + "'");
            return;
        }
        var rule = { action: action, args: actionWords.slice(1), match: {} };
        var problem = checkArgs(action, rule.args);
        if (problem) {
            errors.push("line " + (lineNo + 1) + ": " + problem);
            return;
        }
        var ok = true;
        parts.forEach(function (p) {
            var f = /^floating\s*:\s*(\S+)$/.exec(p);
            if (f) {
                if (!/^(1|0|true|false|yes|no)$/i.test(f[1])) {
                    errors.push("line " + (lineNo + 1) + ": floating: takes 1 or 0");
                    ok = false;
                    return;
                }
                rule.match.floating = /^(1|true|yes)$/i.test(f[1]);
                return;
            }
            var m = /^(class|title|initialClass|initialTitle|initialclass|initialtitle)\s*:\s*(.*)$/.exec(p);
            if (!m) {
                errors.push("line " + (lineNo + 1) + ": unknown matcher '" + p + "'");
                ok = false;
                return;
            }
            var key = /class/i.test(m[1]) ? "class" : "title";
            try {
                rule.match[key] = new RegExp(m[2]);
            } catch (e) {
                errors.push("line " + (lineNo + 1) + ": bad regex '" + m[2] + "'");
                ok = false;
            }
        });
        if (ok && !rule.match["class"] && !rule.match.title) {
            errors.push("line " + (lineNo + 1) + ": rule needs a class: or title: matcher");
            ok = false;
        }
        if (ok) rules.push(rule);
    });
    return { rules: rules, errors: errors };
}

// Returns the effective rule set for a window:
// {float: bool|undefined, pseudo, fullscreen, maximize, group, special, pin,
//  workspace: {index, silent}|undefined, focusonactivate: bool|undefined,
//  size: {width, height}, move: {x, y} (each a {value, percent} length),
//  center, monitor: string, opacity: {active, inactive}, noborder}
//
// `win.floating` is undefined while HyprKwin is still deciding whether to
// tile the window; rules with a floating: matcher only apply once it is known.
function matchRules(rules, win) {
    var out = {};
    var cls = String(win["class"] || "");
    var title = String(win.title || "");
    for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.match["class"] && !r.match["class"].test(cls)) continue;
        if (r.match.title && !r.match.title.test(title)) continue;
        if (r.match.floating !== undefined && r.match.floating !== win.floating) continue;
        switch (r.action) {
        case "float":
        case "tile":
            if (out.float === undefined) out.float = r.action === "float";
            break;
        case "workspace":
            if (out.workspace === undefined) {
                var n = parseInt(r.args[0], 10);
                if (n > 0) out.workspace = { index: n, silent: r.args[1] === "silent" };
            }
            break;
        case "focusonactivate":
            if (out.focusonactivate === undefined) out.focusonactivate = !/^(off|0|false|no)$/i.test(r.args[0] || "");
            break;
        case "size":
            if (out.size === undefined) out.size = { width: parseLength(r.args[0]), height: parseLength(r.args[1]) };
            break;
        case "move":
            if (out.move === undefined) out.move = { x: parseLength(r.args[0]), y: parseLength(r.args[1]) };
            break;
        case "monitor":
            if (out.monitor === undefined) out.monitor = r.args.join(" ");
            break;
        case "opacity":
            if (out.opacity === undefined) {
                var nums = r.args.filter(function (a) { return a !== "override"; }).map(parseOpacity);
                out.opacity = { active: nums[0], inactive: nums.length > 1 ? nums[1] : nums[0] };
            }
            break;
        default:
            if (out[r.action] === undefined) out[r.action] = true;
        }
    }
    return out;
}
