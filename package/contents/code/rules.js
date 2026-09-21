// Window rules in Hyprland's windowrule syntax, one per line:
//
//   float, class:^(org\.kde\.kcalc)$
//   tile, class:^(steam)$, title:^Steam$
//   workspace 3 silent, class:^(discord)$
//   fullscreen, class:^(steam_app_.*)$
//
// Supported actions: float, tile, pseudo, fullscreen, maximize, group,
// special, pin, workspace <n> [silent], focusonactivate [on|off].
// Supported matchers: class, title
// (initialClass / initialTitle are accepted as aliases). Lines starting with
// '#' are comments. The first matching rule for each kind of action wins, so
// user rules placed before the defaults override them.

var RULE_ACTIONS = ["float", "tile", "pseudo", "fullscreen", "maximize", "group", "special", "pin", "workspace",
    "focusonactivate"];

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
        var ok = true;
        parts.forEach(function (p) {
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
//  workspace: {index, silent}|undefined, focusonactivate: bool|undefined}
function matchRules(rules, win) {
    var out = {};
    var cls = String(win["class"] || "");
    var title = String(win.title || "");
    for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.match["class"] && !r.match["class"].test(cls)) continue;
        if (r.match.title && !r.match.title.test(title)) continue;
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
        default:
            if (out[r.action] === undefined) out[r.action] = true;
        }
    }
    return out;
}
