#!/usr/bin/env python3
"""Pick apps that should not be tiled (or should be), from your open windows.

HyprKwin's rules are regular expressions on an app's class or title. Finding
the class of an app is the fiddly part, so this lists the windows you have
open and writes the rule for you.

    hyprkwin-rules.py list              number every open window
    hyprkwin-rules.py float 3           never tile that app again
    hyprkwin-rules.py float 3 --title   ... only that window's title
    hyprkwin-rules.py tile 3            always tile it (overrides the defaults)
    hyprkwin-rules.py float '^steam$'   use a regex instead of a number
    hyprkwin-rules.py show              print the current rules
    hyprkwin-rules.py remove 2          drop rule number 2

Rules take effect at once and apply to windows opened afterwards. They are
the same list the settings page shows under System Settings > Window
Management > KWin Scripts > HyprKwin > Window rules, where they can also be
added, edited and reordered.
"""
import argparse
import os
import re
import subprocess
import sys

GROUP = "Script-hyprkwin"
KEY = "WindowRuleList"      # the settings page's list, one rule per item
LEGACY_KEY = "WindowRules"  # older configs: newline-separated text


def run(*args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def split_list(text):
    """KConfig's list form: items separated by commas, "\\," for a comma."""
    items, cur, i = [], "", 0
    while i < len(text):
        c = text[i]
        if c == "\\" and i + 1 < len(text):
            cur += text[i + 1]
            i += 2
            continue
        if c == ",":
            items.append(cur)
            cur = ""
        else:
            cur += c
        i += 1
    items.append(cur)
    return [x for x in items if x.strip()]


def join_list(items):
    return ",".join(x.replace("\\", "\\\\").replace(",", "\\,") for x in items)


def read_key(key):
    return run("kreadconfig6", "--file", "kwinrc", "--group", GROUP, "--key", key).stdout.rstrip("\n")


def read_rules():
    legacy = read_key(LEGACY_KEY).replace("\\n", "\n")
    return split_list(read_key(KEY)) + [line for line in legacy.split("\n") if line.strip()]


def write_rules(rules):
    # Everything goes into the list the settings page edits; the older text
    # form is folded into it.
    run("kwriteconfig6", "--file", "kwinrc", "--group", GROUP, "--key", KEY, join_list(rules))
    run("kwriteconfig6", "--file", "kwinrc", "--group", GROUP, "--key", LEGACY_KEY, "--delete")
    run("qdbus6", "org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure")


def windows():
    """The windows HyprKwin has open, fresh from the running script."""
    from importlib.machinery import SourceFileLoader
    ctl = SourceFileLoader("hyprkwinctl", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                       "hyprkwinctl")).load_module()
    try:
        accel = ctl.Accel()
    except Exception as e:
        sys.exit("Cannot reach KDE's shortcut daemon: %s" % e)
    state = ctl.read_state(accel)
    return sorted(state["windows"].values(), key=lambda w: (w.get("class", ""), w["caption"]))


def cmd_list(args):
    wins = windows()
    if not wins:
        print("No windows open.")
        return 0
    print("%-3s %-28s %-34s %s" % ("#", "class", "title", "tiled"))
    for i, w in enumerate(wins, 1):
        print("%-3d %-28s %-34s %s" % (i, w.get("class", "?")[:28], w["caption"][:34],
                                       "yes" if w["tiled"] else "no"))
    print("\nhyprkwin-rules.py float <#>   to stop tiling one of these")
    return 0


def target(args):
    """Turn a list number into a matcher, or take a regex as given."""
    if args.pattern.isdigit():
        wins = windows()
        index = int(args.pattern)
        if not 1 <= index <= len(wins):
            sys.exit("No window number %d. Run 'list' first." % index)
        win = wins[index - 1]
        if args.title:
            return "title:^%s$" % re.escape(win["caption"])
        if not win.get("class"):
            sys.exit("That window has no class; use --title for it.")
        return "class:^%s$" % re.escape(win["class"])
    return ("title:" if args.title else "class:") + args.pattern


def cmd_rule(args, action):
    rule = "%s, %s" % (action, target(args))
    rules = read_rules()
    if rule in rules:
        print("Already there: %s" % rule)
        return 0
    rules.append(rule)
    write_rules(rules)
    print("Added: %s" % rule)
    print("Applies to windows opened from now on.")
    return 0


def cmd_show(args):
    rules = read_rules()
    if not rules:
        print("No rules yet. Plasma's own dialogs and panels float regardless.")
        return 0
    for i, rule in enumerate(rules, 1):
        print("%-3d %s" % (i, rule))
    return 0


def cmd_remove(args):
    rules = read_rules()
    index = int(args.pattern)
    if not 1 <= index <= len(rules):
        sys.exit("No rule number %d. Run 'show' first." % index)
    gone = rules.pop(index - 1)
    write_rules(rules)
    print("Removed: %s" % gone)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["list", "float", "tile", "show", "remove", "migrate"])
    ap.add_argument("pattern", nargs="?", default="")
    ap.add_argument("--title", action="store_true", help="match the window title instead of the app class")
    args = ap.parse_args()
    if args.command in ("float", "tile", "remove") and not args.pattern:
        ap.error("%s needs a window number or a regex" % args.command)
    if args.command == "list":
        return cmd_list(args)
    if args.command == "show":
        return cmd_show(args)
    if args.command == "remove":
        return cmd_remove(args)
    if args.command == "migrate":
        # install.sh: move rules kept as text into the settings page's list.
        if read_key(LEGACY_KEY).strip():
            write_rules(read_rules())
            print("Moved your window rules into the settings page's list.")
        return 0
    return cmd_rule(args, args.command)


if __name__ == "__main__":
    sys.exit(main())
