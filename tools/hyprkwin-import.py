#!/usr/bin/env python3
"""Translate an existing hyprland.conf into HyprKwin's settings.

    hyprkwin-import.py                      read ~/.config/hypr/hyprland.conf
                                            and show what it would change
    hyprkwin-import.py FILE                 read another file
    hyprkwin-import.py --apply              actually change the settings

    --no-settings / --no-rules / --no-binds  leave that part alone

Nothing is written without --apply. Settings go to kwinrc (the same place the
settings page writes), window and workspace rules to their lists, and binds to
KDE's global shortcuts, after snapshotting them the way install.sh does, so
uninstall.sh can put them back.

Whatever cannot be translated is listed at the end rather than guessed at.
"""
import os
import re
import subprocess
import sys

from pathlib import Path

HOME = Path.home()
DEFAULT_CONF = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "hypr/hyprland.conf"
GROUP = "Script-hyprkwin"
TOOLS = Path(__file__).resolve().parent

# Hyprland setting -> (kwinrc key, how to read the value). Anything not here
# is reported instead of being guessed at.
LAYOUTS = ["dwindle", "master", "monocle", "scrolling"]
ORIENTATIONS = ["left", "right", "top", "bottom", "center"]


def as_int(v):
    # Hyprland takes "5" or "5 5 5 5" (per side); HyprKwin has one gap.
    first = v.split()[0]
    return str(int(float(first)))


def as_float(v):
    return "%g" % float(v.split()[0])


def as_bool(v):
    v = v.strip().lower()
    if v in ("true", "yes", "on", "1"):
        return "true"
    if v in ("false", "no", "off", "0"):
        return "false"
    raise ValueError("expected true or false")


def as_layout(v):
    name = v.strip().lower()
    if name not in LAYOUTS:
        raise ValueError("unknown layout '%s'" % v)
    return str(LAYOUTS.index(name))


def as_orientation(v):
    name = v.strip().lower()
    if name not in ORIENTATIONS:
        raise ValueError("unknown orientation '%s'" % v)
    return str(ORIENTATIONS.index(name))


def as_new_status(v):
    # master:new_status = master | slave | inherit
    return "true" if v.strip().lower() == "master" else "false"


def as_follow_mouse(v):
    n = int(float(v.split()[0]))
    if n not in (0, 1):
        raise ValueError("only follow_mouse 0 and 1 have an equivalent")
    return "true" if n == 1 else "false"


SETTINGS = {
    "general:gaps_in": ("GapsIn", as_int),
    "general:gaps_out": ("GapsOut", as_int),
    "general:border_size": ("BorderSize", as_int),
    "general:no_gaps_when_only": ("NoGapsWhenOnly", as_bool),
    "general:layout": ("DefaultLayout", as_layout),
    "decoration:rounding": ("BorderRadius", as_int),
    "decoration:active_opacity": ("ActiveOpacity", as_float),
    "decoration:inactive_opacity": ("InactiveOpacity", as_float),
    "dwindle:preserve_split": ("PreserveSplit", as_bool),
    "dwindle:force_split": ("ForceSplit", as_int),
    "dwindle:split_width_multiplier": ("SplitWidthMultiplier", as_float),
    "dwindle:default_split_ratio": ("SplitRatio", as_float),
    "master:mfact": ("MasterFactor", as_float),
    "master:orientation": ("MasterOrientation", as_orientation),
    "master:new_status": ("MasterNewIsMaster", as_new_status),
    "misc:focus_on_activate": ("FocusOnActivate", as_bool),
    "input:follow_mouse": ("FocusFollowsMouse", as_follow_mouse),
}

# Window rule actions HyprKwin understands; the rest are reported.
RULE_ACTIONS = ["float", "tile", "pseudo", "fullscreen", "maximize", "group", "special", "pin",
                "workspace", "focusonactivate", "size", "move", "center", "monitor", "opacity", "noborder"]
WORKSPACE_PROPERTIES = ["monitor", "default", "layout", "gapsin", "gapsout"]

DIRECTIONS = {"l": "Left", "left": "Left", "r": "Right", "right": "Right",
              "u": "Up", "up": "Up", "t": "Up", "d": "Down", "down": "Down", "b": "Down"}

# Hyprland key names that Plasma spells differently.
KEY_NAMES = {
    "return": "Return", "kp_enter": "Enter", "escape": "Esc", "space": "Space", "tab": "Tab",
    "backspace": "Backspace", "delete": "Delete", "insert": "Insert", "home": "Home", "end": "End",
    "page_up": "PgUp", "page_down": "PgDown", "print": "Print", "pause": "Pause",
    "left": "Left", "right": "Right", "up": "Up", "down": "Down",
    "minus": "-", "equal": "=", "comma": ",", "period": ".", "slash": "/", "backslash": "\\",
    "semicolon": ";", "apostrophe": "'", "grave": "`", "bracketleft": "[", "bracketright": "]",
}
# What Shift produces on those keys, which is how Plasma stores the shortcut.
SHIFTED = {"1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*",
           "9": "(", "0": ")", "-": "_", "=": "+", "[": "{", "]": "}", ",": "<", ".": ">",
           "/": "?", ";": ":", "'": "\"", "`": "~", "\\": "|"}
MODS = {"super": "Meta", "supper": "Meta", "mod4": "Meta", "win": "Meta", "logo": "Meta",
        "alt": "Alt", "mod1": "Alt", "ctrl": "Ctrl", "control": "Ctrl", "shift": "Shift"}


class Item:
    """One `key = value` from a config file, with where it came from."""

    def __init__(self, section, key, value, origin):
        self.section = section          # e.g. "general" or "decoration:blur"
        self.key = key
        self.value = value
        self.origin = origin

    @property
    def path(self):
        return (self.section + ":" + self.key) if self.section else self.key

    def __repr__(self):
        return "Item(%r, %r)" % (self.path, self.value)


def braces(line):
    """"general { x = 1 }" -> ["general", "{", "x = 1", "}"]"""
    out, buf = [], ""
    for ch in line:
        if ch in "{}":
            if buf.strip():
                out.append(buf.strip())
            out.append(ch)
            buf = ""
        else:
            buf += ch
    if buf.strip():
        out.append(buf.strip())
    return out


def read_config(path, seen=None, variables=None):
    """Read a hyprland.conf, following `source =` lines, into flat Items."""
    path = Path(path).expanduser()
    seen = seen if seen is not None else set()
    variables = variables if variables is not None else {}
    items, notes = [], []
    real = str(path.resolve()) if path.exists() else str(path)
    if real in seen:
        return items, notes
    seen.add(real)
    if not path.exists():
        notes.append(("%s: no such file" % path, ""))
        return items, notes
    if not path.is_file():
        # "source = conf.d/*" matching a folder as well as the files in it.
        notes.append(("%s: not a file, skipped" % path, ""))
        return items, notes
    section = []

    def setting(text, origin):
        if "=" not in text:
            notes.append(("%s is not a setting" % text, origin))
            return
        key, value = text.split("=", 1)
        key, value = key.strip(), value.strip()
        # Longest first, so $mainMod is not eaten by $main.
        for name, replacement in sorted(variables.items(), key=lambda kv: -len(kv[0])):
            value = value.replace(name, replacement)
        if key.startswith("$"):
            variables[key] = value
            return
        if key == "source":
            target = Path(value).expanduser()
            if not target.is_absolute():
                target = path.parent / target
            for match in sorted(target.parent.glob(target.name)) or [target]:
                sub_items, sub_notes = read_config(match, seen, variables)
                items.extend(sub_items)
                notes.extend(sub_notes)
            return
        items.append(Item(":".join(section), key, value, origin))

    for lineno, raw in enumerate(path.read_text(errors="replace").splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        origin = "%s:%d" % (path.name, lineno)
        # Braces are usually on their own line; take "general { x = 1 }" too.
        pending = None
        for token in braces(line):
            if token == "{":
                section.append((pending or "").lower())
                pending = None
                continue
            if token == "}":
                if pending is not None:
                    setting(pending, origin)
                    pending = None
                if section:
                    section.pop()
                continue
            if pending is not None:
                setting(pending, origin)
            pending = token
        if pending is not None:
            setting(pending, origin)
    return items, notes


def colour(text):
    """rgba(33ccffee), rgb(33ccff) or 0xeeb4befe -> "r,g,b" as KConfig has it."""
    text = text.strip()
    m = re.match(r"^rgba?\(\s*([0-9a-fA-F]{6,8})\s*\)$", text)
    if m:
        digits = m.group(1)
        r, g, b = (int(digits[i:i + 2], 16) for i in (0, 2, 4))
        return "%d,%d,%d" % (r, g, b)
    m = re.match(r"^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$", text)
    if m:
        return "%s,%s,%s" % m.groups()
    m = re.match(r"^0x([0-9a-fA-F]{8})$", text)
    if m:                       # AARRGGBB
        digits = m.group(1)
        return "%d,%d,%d" % tuple(int(digits[i:i + 2], 16) for i in (2, 4, 6))
    raise ValueError("cannot read the colour '%s'" % text)


def border_colours(value):
    """col.active_border, which may be a gradient: two colours and an angle."""
    parts = re.findall(r"(rgba?\([^)]*\)|0x[0-9a-fA-F]{8})", value)
    if not parts:
        raise ValueError("cannot read the colour '%s'" % value)
    angle = re.search(r"(\d+)\s*deg", value)
    return [colour(p) for p in parts], int(angle.group(1)) if angle else None


def translate_settings(items):
    out, notes = {}, []
    for item in items:
        path = item.path
        if path in ("general:col.active_border", "general:col.inactive_border"):
            try:
                colours, angle = border_colours(item.value)
            except ValueError as e:
                notes.append((str(e), item.origin))
                continue
            if path.endswith("active_border") and not path.endswith("inactive_border"):
                out["ActiveBorderColor"] = colours[0]
                out["ActiveBorderSource"] = "1"
                if len(colours) > 1:
                    out["ActiveBorderColor2"] = colours[1]
                    out["ActiveBorderSource"] = "2"
                    if angle is not None:
                        out["BorderGradientAngle"] = str(angle)
            else:
                out["InactiveBorderColor"] = colours[0]
                out["InactiveBorderSource"] = "1"
                if len(colours) > 1:
                    notes.append(("an inactive border gradient: only its first colour is used", item.origin))
            if "ee)" in item.value or re.search(r"0x[0-9a-fA-F]{2}", item.value):
                pass            # alpha is silently dropped; borders are opaque
            continue
        if path not in SETTINGS:
            continue
        key, reader = SETTINGS[path]
        try:
            out[key] = reader(item.value)
        except (ValueError, IndexError) as e:
            notes.append(("%s = %s: %s" % (path, item.value, e), item.origin))
    return out, notes


def translate_window_rules(items):
    rules, notes = [], []
    for item in items:
        if item.key not in ("windowrule", "windowrulev2"):
            continue
        parts = [p.strip() for p in item.value.split(",")]
        action = parts[0].split()[0].lower() if parts[0] else ""
        if action not in RULE_ACTIONS:
            notes.append(("windowrule %s: HyprKwin has no such rule" % (action or item.value), item.origin))
            continue
        matchers = parts[1:]
        if not matchers:
            notes.append(("windowrule %s: nothing to match on" % action, item.origin))
            continue
        # v1 rules match a bare regex against the class.
        if item.key == "windowrule" and not re.match(r"^(class|title|initial|floating)", matchers[0], re.I):
            matchers = ["class:" + matchers[0]] + matchers[1:]
        kept = [m for m in matchers if re.match(r"^(class|title|initialclass|initialtitle|floating)\s*:", m, re.I)]
        dropped = [m for m in matchers if m not in kept]
        if not kept:
            notes.append(("windowrule %s: HyprKwin matches on class:, title: and floating: only" % action, item.origin))
            continue
        for d in dropped:
            notes.append(("windowrule %s: dropped the matcher '%s'" % (action, d), item.origin))
        rules.append(", ".join([parts[0]] + kept))
    return rules, notes


def translate_workspace_rules(items):
    rules, notes = [], []
    for item in items:
        if item.key != "workspace":
            continue
        parts = [p.strip() for p in item.value.split(",") if p.strip()]
        if not parts:
            continue
        selector = parts[0]
        if not re.match(r"^\d+$", selector):
            notes.append(("workspace %s: HyprKwin's workspaces are numbered" % selector, item.origin))
            continue
        kept = []
        for p in parts[1:]:
            name = p.split(":", 1)[0].strip().lower().replace("_", "")
            if name in WORKSPACE_PROPERTIES:
                kept.append(p)
            else:
                notes.append(("workspace %s: dropped '%s'" % (selector, p), item.origin))
        if kept:
            rules.append(", ".join([selector] + kept))
    return rules, notes


def key_sequence(mods, key):
    """"SUPER SHIFT", "1" -> "Meta+!", the way Plasma stores it."""
    names = []
    shift = False
    for mod in re.split(r"[\s+]+", mods.strip()):
        if not mod:
            continue
        plasma = MODS.get(mod.strip().lower())
        if plasma is None:
            raise ValueError("unknown modifier '%s'" % mod)
        if plasma == "Shift":
            shift = True
        elif plasma not in names:
            names.append(plasma)
    key = key.strip()
    if key.lower().startswith("mouse") or key.lower() in ("mouse_up", "mouse_down"):
        raise ValueError("mouse binds cannot be global shortcuts")
    if re.match(r"^f\d{1,2}$", key, re.I):
        key = key.upper()
    elif len(key) == 1:
        key = key.upper()
    else:
        key = KEY_NAMES.get(key.lower(), key[0].upper() + key[1:])
    if shift:
        # Plasma stores the character Shift produces, not Shift+key.
        if key in SHIFTED:
            key = SHIFTED[key]
        else:
            names.append("Shift")
    order = {"Meta": 0, "Ctrl": 1, "Alt": 2, "Shift": 3}
    names.sort(key=lambda n: order.get(n, 9))
    return "+".join(names + [key])


def scratchpad_slot(name, names):
    """Named scratchpads get one of the four numbered slots, in order."""
    if name not in names:
        if len(names) >= 4:
            raise ValueError("HyprKwin has four named scratchpads; '%s' is one too many" % name)
        names.append(name)
    return names.index(name) + 1


def dispatcher_action(dispatcher, args, scratchpads):
    """The HyprKwin action a Hyprland dispatcher maps onto."""
    d = dispatcher.strip().lower()
    arg = args.strip()
    low = arg.lower()
    simple = {
        "killactive": "close", "closewindow": "close",
        "togglefloating": "toggleFloating", "setfloating": "toggleFloating",
        "pseudo": "pseudo", "togglesplit": "toggleSplit", "swapsplit": "swapSplit",
        "pin": "pin", "togglegroup": "toggleGroup", "moveoutofgroup": "leaveGroup",
        "cyclenext": "cyclePrevious" if low in ("prev", "previous") else "cycleNext",
    }
    if d in simple:
        return simple[d]
    if d == "fullscreen":
        return "maximize" if low in ("1", "maximize") else "fullscreen"
    if d in ("movefocus", "focuswindow") and low in DIRECTIONS:
        return "focus" + DIRECTIONS[low]
    if d in ("movewindow", "swapwindow", "movewindoworgroup"):
        m = re.match(r"^mon:(\w+)$", low)
        if m and m.group(1) in DIRECTIONS:
            return "windowToMonitor" + DIRECTIONS[m.group(1)]
        if low in DIRECTIONS:
            return "swap" + DIRECTIONS[low]
        raise ValueError("%s %s has no equivalent" % (d, arg))
    if d == "moveintogroup" and low in DIRECTIONS:
        return "intoGroup" + DIRECTIONS[low]
    if d == "changegroupactive":
        return "groupPrevious" if low in ("b", "back", "prev") else "groupNext"
    if d == "movecurrentworkspacetomonitor" and low in DIRECTIONS:
        return "workspaceToMonitor" + DIRECTIONS[low]
    if d == "focusmonitor":
        if low in ("+1", "next"):
            return "focusNextMonitor"
        if low in ("-1", "prev", "previous"):
            return "focusPreviousMonitor"
        raise ValueError("focusmonitor %s: HyprKwin moves to the next or previous monitor" % arg)
    if d == "resizeactive":
        nums = re.findall(r"-?\d+", arg)
        if len(nums) != 2:
            raise ValueError("resizeactive %s has no equivalent" % arg)
        dx, dy = int(nums[0]), int(nums[1])
        if dx:
            return "resizeRight" if dx > 0 else "resizeLeft"
        if dy:
            return "resizeDown" if dy > 0 else "resizeUp"
        raise ValueError("resizeactive 0 0 does nothing")
    if d == "layoutmsg":
        msg = low.split()[0] if low else ""
        table = {"swapwithmaster": "masterSwap", "focusmaster": "masterFocus",
                 "addmaster": "masterCountIncrease", "removemaster": "masterCountDecrease",
                 "orientationnext": "masterOrientationNext", "orientationprev": "masterOrientationPrevious",
                 "togglesplit": "toggleSplit", "swapsplit": "swapSplit",
                 "cyclenext": "cycleNext", "cycleprev": "cyclePrevious"}
        if msg in table:
            return table[msg]
        raise ValueError("layoutmsg %s has no equivalent" % arg)
    if d == "togglespecialworkspace":
        name = arg or "special"
        return "toggleSpecial" if name == "special" else "toggleScratchpad%d" % scratchpad_slot(name, scratchpads)
    if d in ("workspace", "movetoworkspace", "movetoworkspacesilent"):
        special = re.match(r"^special(?::(.+))?$", low)
        if special:
            if d == "workspace":
                raise ValueError("workspace special: use togglespecialworkspace")
            name = special.group(1) or "special"
            return "moveToSpecial" if name == "special" else "moveToScratchpad%d" % scratchpad_slot(name, scratchpads)
        if d == "workspace":
            if low in ("e+1", "+1", "next", "m+1", "r+1"):
                return "nextDesktop"
            # "previous" is the workspace you were last on, not the one
            # numbered before this.
            if low == "previous":
                return "formerDesktop"
            if low in ("e-1", "-1", "prev", "m-1", "r-1"):
                return "previousDesktop"
        if re.match(r"^\d+$", low):
            n = int(low)
            if not 1 <= n <= 10:
                raise ValueError("HyprKwin has shortcuts for workspaces 1 to 10")
            return {"workspace": "desktop", "movetoworkspace": "moveToDesktop",
                    "movetoworkspacesilent": "moveToDesktopSilent"}[d] + str(n)
        raise ValueError("%s %s has no equivalent" % (d, arg))
    raise ValueError("%s: HyprKwin has no such action" % d)


def translate_binds(items):
    binds, notes, scratchpads = [], [], []
    taken = {}
    for item in items:
        if not re.match(r"^bind[lreonmtisd]*$", item.key):
            continue
        if "m" in item.key[4:]:
            notes.append(("%s = %s: mouse binds cannot be global shortcuts" % (item.key, item.value), item.origin))
            continue
        parts = [p.strip() for p in item.value.split(",")]
        if len(parts) < 3:
            notes.append(("%s = %s: not a bind" % (item.key, item.value), item.origin))
            continue
        mods, key, dispatcher = parts[0], parts[1], parts[2]
        args = ",".join(parts[3:]).strip()
        if dispatcher.lower() == "submap":
            notes.append(("submap '%s': HyprKwin has no submaps yet" % args, item.origin))
            continue
        try:
            action = dispatcher_action(dispatcher, args, scratchpads)
            sequence = key_sequence(mods, key)
        except ValueError as e:
            notes.append(("%s: %s" % (item.value, e), item.origin))
            continue
        if action in taken:
            notes.append(("%s is already bound to %s" % (action, taken[action]), item.origin))
            continue
        taken[action] = sequence
        binds.append((action, sequence, item.origin))
    return binds, scratchpads, notes


def translate(items):
    settings, notes = translate_settings(items)
    rules, rule_notes = translate_window_rules(items)
    spaces, space_notes = translate_workspace_rules(items)
    binds, scratchpads, bind_notes = translate_binds(items)
    return {
        "settings": settings, "rules": rules, "workspaces": spaces,
        "binds": binds, "scratchpads": scratchpads,
        "notes": notes + rule_notes + space_notes + bind_notes,
    }


# ---- applying ----------------------------------------------------------

def kwrite(key, value, file="kwinrc", group=GROUP):
    subprocess.run(["kwriteconfig6", "--file", file, "--group", group, "--key", key, value], check=True)


def kwrite_list(key, values):
    joined = ",".join(v.replace("\\", "\\\\").replace(",", "\\,") for v in values)
    kwrite(key, joined)


def apply(plan, parts):
    if "settings" in parts:
        for key, value in sorted(plan["settings"].items()):
            kwrite(key, value)
    if "rules" in parts:
        if plan["rules"]:
            kwrite_list("WindowRuleList", plan["rules"])
        if plan["workspaces"]:
            kwrite_list("WorkspaceRuleList", plan["workspaces"])
    if plan["scratchpads"]:
        kwrite_list("ScratchpadNames", plan["scratchpads"])
    subprocess.run(["qdbus6" if shutil_which("qdbus6") else "qdbus", "org.kde.KWin", "/KWin", "reconfigure"],
                   check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if "binds" in parts and plan["binds"]:
        bind_shortcuts(plan["binds"])


def shutil_which(name):
    from shutil import which
    return which(name)


def bind_shortcuts(binds):
    """Give HyprKwin's actions the keys the config binds them to."""
    subprocess.run([sys.executable, str(TOOLS / "hyprkwin-shortcuts.py"), "backup"], check=False)
    try:
        sys.path.insert(0, str(TOOLS))
        shortcuts = __import__("importlib").machinery.SourceFileLoader(
            "hyprkwin_shortcuts", str(TOOLS / "hyprkwin-shortcuts.py")).load_module()
        from PySide6.QtGui import QKeySequence
    except Exception as e:
        print("\nCould not reach the shortcut daemon (%s)." % e)
        print("Set these keys in System Settings > Keyboard > Shortcuts > KWin:")
        for action, sequence, _ in binds:
            print("    %-28s %s" % ("HyprKwin: " + action, sequence))
        return
    accel = shortcuts.Accel()
    infos = {i["name"]: i for i in accel.infos("kwin")}
    for action, sequence, _ in binds:
        info = infos.get("HyprKwin " + action)
        if not info:
            print("skipped %-28s (HyprKwin is not loaded?)" % action)
            continue
        code = QKeySequence.fromString(sequence)
        key = int(code[0].toCombined()) if len(code) else 0
        if not key:
            print("skipped %-28s (cannot read the key '%s')" % (action, sequence))
            continue
        for other in accel.owners(key):
            if other["name"] != info["name"] or other["component"] != info["component"]:
                accel.set_keys(other, [k for k in other["keys"] if k != key])
        accel.set_keys(info, [])
        accel.set_keys(info, [key])
        print("bound  %-20s to   %s" % (sequence, action))


def report(plan, unread, parts):
    if "settings" in parts:
        print("Settings (%d):" % len(plan["settings"]))
        for key, value in sorted(plan["settings"].items()):
            print("    %-24s %s" % (key, value))
    if "rules" in parts:
        print("\nWindow rules (%d):" % len(plan["rules"]))
        for r in plan["rules"]:
            print("    " + r)
        print("\nWorkspace rules (%d):" % len(plan["workspaces"]))
        for r in plan["workspaces"]:
            print("    " + r)
    if plan["scratchpads"]:
        print("\nNamed scratchpads (%d): %s" % (len(plan["scratchpads"]), ", ".join(plan["scratchpads"])))
    if "binds" in parts:
        print("\nBinds (%d):" % len(plan["binds"]))
        for action, sequence, _ in plan["binds"]:
            print("    %-20s %s" % (sequence, action))
    notes = unread + plan["notes"]
    if notes:
        print("\nNot translated (%d):" % len(notes))
        for text, origin in notes:
            print("    %-12s %s" % (origin, text))


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = [a for a in argv if a.startswith("--")]
    if "--help" in flags or "-h" in argv:
        print(__doc__)
        return 0
    parts = {"settings", "rules", "binds"}
    for flag in flags:
        if flag.startswith("--no-") and flag[5:] in parts:
            parts.discard(flag[5:])
        elif flag != "--apply":
            print("unknown option %s" % flag)
            return 2
    path = Path(args[0]).expanduser() if args else DEFAULT_CONF
    if not path.exists():
        print("No such file: %s" % path)
        return 1
    items, unread = read_config(path)
    plan = translate(items)
    print("Read %s (%d settings, binds and rules).\n" % (path, len(items)))
    report(plan, unread, parts)
    if "--apply" not in flags:
        print("\nNothing has been changed. Run again with --apply to import this.")
        return 0
    print()
    apply(plan, parts)
    print("\nImported. Check it in System Settings > Window Management > KWin Scripts > HyprKwin.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
