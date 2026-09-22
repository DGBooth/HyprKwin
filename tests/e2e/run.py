#!/usr/bin/env python3
"""End-to-end tests against a headless nested KWin.

    python3 tests/e2e/run.py            # all tests
    python3 tests/e2e/run.py swap group # tests whose name contains a word
"""
import json
import shutil
import sys
import time
import traceback

from pathlib import Path

from fakeinput import BTN_RIGHT
from sandbox import Sandbox

ROOT_DIR = Path(__file__).resolve().parents[2]

TESTS = []


def test(fn=None, **opts):
    def wrap(f):
        f.opts = opts
        TESTS.append(f)
        return f
    return wrap(fn) if fn else wrap


def eq(actual, expected, what=""):
    if actual != expected:
        raise AssertionError("%s: expected %r, got %r" % (what, expected, actual))


# 1920x1080, gaps_out 10, gaps_in 5 (two windows are 10px apart)
A3 = (10, 10, 945, 1060)
B3 = (965, 10, 945, 525)
C3 = (965, 545, 945, 525)
FULL = (10, 10, 1900, 1060)
LEFT = (10, 10, 945, 1060)
RIGHT = (965, 10, 945, 1060)


def three(sb):
    for t in "ABC":
        sb.spawn(t)


@test
def dwindle_layout(sb):
    sb.spawn("A")
    eq(sb.geometry("A"), FULL, "single window")
    sb.spawn("B")
    s = sb.state()
    eq(sb.geometry("A", s), LEFT, "A")
    eq(sb.geometry("B", s), RIGHT, "B")
    sb.spawn("C")
    s = sb.state()
    eq([sb.geometry(t, s) for t in "ABC"], [A3, B3, C3], "three windows")
    eq(sb.window("A", s)["noBorder"], True, "title bars hidden")


@test
def close_retiles(sb):
    three(sb)
    sb.clients[1].kill()  # B
    sb.wait_for(lambda s: len(s["windows"]) == 2, "B gone")
    sb.settle()
    s = sb.state()
    eq(sb.geometry("C", s), RIGHT, "C takes B's space")


@test
def focus_and_swap(sb):
    three(sb)  # C is active
    sb.invoke("focusLeft")
    s = sb.state()
    eq(s["active"], sb.window("A", s)["id"], "focus left from C")
    sb.invoke("focusRight")
    s = sb.state()
    eq(s["active"], sb.window("C", s)["id"], "focus right returns to most recent (C)")
    sb.invoke("focusUp")
    s = sb.state()
    eq(s["active"], sb.window("B", s)["id"], "focus up")
    sb.invoke("swapLeft")
    s = sb.state()
    eq(sb.geometry("B", s), A3, "B swapped into A's slot")
    eq(sb.geometry("A", s), B3, "A swapped into B's slot")


@test
def toggle_split_and_resize(sb):
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("toggleSplit")
    s = sb.state()
    eq(sb.geometry("A", s), (10, 10, 1900, 525), "A on top after togglesplit")
    eq(sb.geometry("B", s), (10, 545, 1900, 525), "B below")
    sb.invoke("toggleSplit")
    # Meta+= moves the divider right, whichever side of it the window is:
    # with B (the right window) focused, B shrinks.
    sb.invoke("resizeRight")
    s = sb.state()
    eq(sb.geometry("A", s), (10, 10, 1045, 1060), "divider moved right: A grew")
    eq(sb.geometry("B", s), (1065, 10, 845, 1060), "B shrank")
    sb.invoke("focusLeft")
    sb.invoke("resizeLeft")   # and Meta+- moves it back left, from A's side too
    sb.invoke("resizeLeft")
    s = sb.state()
    eq(sb.geometry("A", s), (10, 10, 845, 1060), "divider moved left twice")
    eq(sb.geometry("B", s), (865, 10, 1045, 1060), "B grew")
    sb.invoke("resizeDown")   # A has nothing above or below it
    eq(sb.geometry("A"), (10, 10, 845, 1060), "no vertical split: nothing moves")


@test
def floating_toggle(sb):
    three(sb)
    sb.invoke("toggleFloating")  # C floats
    s = sb.state()
    c = sb.window("C", s)
    eq(c["tiled"], False, "C untiled")
    eq(c["noBorder"], False, "C gets its title bar back")
    eq(sb.geometry("B", s), RIGHT, "B fills the right side")
    sb.invoke("toggleFloating")
    s = sb.state()
    eq(sb.window("C", s)["tiled"], True, "C tiled again")
    eq(sb.geometry("C", s), C3, "C back below B")


@test
def fixed_size_and_dialogs_float(sb):
    sb.spawn("A")
    sb.spawn("Fixed", extra=["--fixed"])
    sb.spawn("P", extra=["--dialog"])
    sb.wait_for(lambda s: any(w["caption"] == "P dialog" for w in s["windows"].values()), "dialog")
    sb.settle()
    s = sb.state()
    eq(sb.window("Fixed", s)["tiled"], False, "fixed-size window floats")
    eq(sb.window("P dialog", s)["tiled"], False, "dialog floats")
    eq(sb.geometry("A", s), LEFT, "A")
    eq(sb.geometry("P", s), RIGHT, "P tiles next to A")


@test(config={"WindowRules": "float, title:^Floater$\ntile, class:^hyprkwin\\.forced$\nworkspace 2 silent, title:^Elsewhere$"})
def window_rules(sb):
    sb.spawn("A")
    sb.spawn("Floater")
    s = sb.state()
    eq(sb.window("Floater", s)["tiled"], False, "float rule")
    eq(sb.geometry("A", s), FULL, "A alone in the layout")
    sb.spawn("Forced", app_id="hyprkwin.forced", extra=["--fixed"])
    eq(sb.window("Forced")["tiled"], False, "tile rule cannot force a fixed-size window")
    sb.spawn("Elsewhere")
    s = sb.state()
    w = sb.window("Elsewhere", s)
    eq(len(s["desktops"]), 2, "desktop 2 created")
    eq(w["desktops"], [s["desktops"][1]], "Elsewhere on desktop 2")
    eq(s["currentDesktop"], s["desktops"][0], "silent: stayed on desktop 1")
    eq(s["ruleErrors"], [], "no rule errors")


@test(config={"WindowRules": "\n".join([
    "float, title:^Sized$", "size 800 600, title:^Sized$", "center, title:^Sized$",
    "float, title:^Moved$", "move 100 50, title:^Moved$", "size 25% 50%, title:^Moved$",
    "size 700 500, floating:1, title:^Maybe$",
])})
def window_rules_place_floating_windows(sb):
    """size / move / center, in pixels or percentages of the monitor, as in
    Hyprland. A floating: rule waits until it is known whether the window floats."""
    sb.spawn("A")
    sb.spawn("Sized")
    s = sb.state()
    eq(sb.window("Sized", s)["tiled"], False, "Sized floats")
    eq(sb.geometry("Sized", s), (560, 240, 800, 600), "800x600, centred")
    sb.spawn("Moved")
    eq(sb.geometry("Moved"), (100, 50, 480, 540), "25% x 50% of 1920x1080, at 100,50")
    sb.spawn("Maybe")
    s = sb.state()
    eq(sb.window("Maybe", s)["tiled"], True, "Maybe tiles")
    eq(sb.geometry("Maybe", s)[2:] != (700, 500), True, "so its floating: size rule does not apply")
    sb.invoke("toggleFloating")               # Sized is floating: back to its rule-given place
    eq(sb.state()["ruleErrors"], [], "no rule errors")


@test(config={"WindowRuleList": [
    "float, title:^Floater$", "size 640 480, floating:1, title:^Floater$", "center, title:^Floater$",
], "WindowRules": "workspace 2 silent, title:^Old$"})
def window_rules_from_the_settings_list(sb):
    """Rules saved by the settings page's list editor apply, and rules in the
    older text form still do."""
    sb.spawn("A")
    sb.spawn("Floater")
    s = sb.state()
    eq(sb.window("Floater", s)["tiled"], False, "list rule: floats")
    eq(sb.geometry("Floater", s), (640, 300, 640, 480), "list rules: 640x480, centred")
    sb.spawn("Old")
    s = sb.state()
    eq(sb.window("Old", s)["desktops"], [s["desktops"][1]], "text rule still applies")
    eq(s["ruleErrors"], [], "no rule errors")


@test(outputs=2, config={"BorderSize": 4, "WindowRules": "\n".join([
    "monitor 1, title:^Right$", "opacity 0.9 0.6, title:^Dim$", "noborder, title:^Plain$",
])})
def window_rules_monitor_opacity_noborder(sb):
    sb.spawn("A")
    first = sb.window("A")["output"]
    sb.spawn("Right")
    s = sb.state()
    right = sb.window("Right", s)
    eq(right["output"] != first, True, "Right opened on the second monitor: %r" % right)
    eq(right["tiled"], True, "and is tiled there")
    eq(right["workspace"], s["shown"][right["output"]], "on the workspace that monitor shows")
    sb.invoke("focusLeft")
    sb.spawn("Dim")
    eq(abs(sb.window("Dim")["opacity"] - 0.9) < 0.01, True, "focused: active opacity")
    sb.invoke("focusLeft")
    s = sb.state()
    eq(s["active"] != sb.window("Dim", s)["id"], True, "focus moved away")
    eq(abs(sb.window("Dim", s)["opacity"] - 0.6) < 0.01, True, "unfocused: inactive opacity")
    sb.spawn("Plain")
    sb.settle(0.5)
    s = sb.state()
    eq(s["active"], sb.window("Plain", s)["id"], "Plain is focused")
    eq(sb.overlays(), [], "but gets no border")


@test
def workspaces(sb):
    three(sb)
    sb.invoke("moveToDesktopSilent2")  # C to desktop 2, stay here
    s = sb.state()
    eq(len(s["desktops"]), 2, "desktop 2 auto-created")
    eq(s["currentDesktop"], s["desktops"][0], "still on desktop 1")
    eq(sb.geometry("B", s), RIGHT, "B fills in")
    eq(sb.window("C", s)["desktops"], [s["desktops"][1]], "C on desktop 2")
    sb.invoke("desktop2")
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][1], "switched")
    eq(sb.geometry("C", s), FULL, "C alone on desktop 2")
    sb.invoke("formerDesktop")
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][0], "back to former desktop")
    sb.invoke("focusLeft")
    sb.invoke("moveToDesktop2")  # A follows to desktop 2
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][1], "followed")
    eq(sb.geometry("C", s), LEFT, "C left")
    eq(sb.geometry("A", s), RIGHT, "A joins on the right")


@test
def plasma_native_desktop_move(sb):
    """Windows moved by Plasma itself (pager, taskbar, KWin actions) retile."""
    three(sb)
    sb._qdbus("org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.createDesktop", "1", "Two")
    sb.settle()
    sb.invoke("Window to Next Desktop")  # KWin moves C and follows it
    s = sb.state()
    eq(sb.window("C", s)["desktops"], [s["desktops"][1]], "C moved by KWin")
    eq(sb.geometry("C", s), FULL, "C alone on desktop 2")
    eq(sb.geometry("B", s), RIGHT, "desktop 1 re-laid out while hidden")
    sb.invoke("desktop1")
    sb.invoke("focusRight")
    s = sb.state()
    eq(s["active"], sb.window("B", s)["id"], "B focused")
    sb.invoke("Window Minimize")
    s = sb.state()
    eq(sb.window("B", s)["minimized"], True, "B minimized by KWin")
    eq(sb.geometry("A", s), FULL, "A fills while B is minimized")


@test
def special_workspace(sb):
    three(sb)
    sb.invoke("moveToSpecial")  # C into scratchpad (hidden)
    s = sb.state()
    c = sb.window("C", s)
    eq((c["special"], c["minimized"], c["onAllDesktops"]), (True, True, True), "C stashed")
    eq(sb.geometry("B", s), RIGHT, "B fills")
    sb.invoke("toggleSpecial")
    s = sb.state()
    c = sb.window("C", s)
    eq((s["special"], c["minimized"], c["keepAbove"]), (True, False, True), "scratchpad shown")
    eq(sb.geometry("C", s), (50, 50, 1820, 980), "C laid out in the scratchpad area")
    eq(s["active"], c["id"], "scratchpad window focused")
    sb.invoke("toggleSpecial")
    s = sb.state()
    eq(sb.window("C", s)["minimized"], True, "hidden again")
    sb.invoke("toggleSpecial")
    sb.invoke("moveToSpecial")  # take C back out
    s = sb.state()
    c = sb.window("C", s)
    eq((c["special"], c["keepAbove"], c["onAllDesktops"], c["minimized"]), (False, False, False, False), "C restored")
    eq(sb.geometry("C", s), C3, "C tiled again")


@test(config={"BorderSize": 4})
def scratchpad_hides_what_is_underneath(sb):
    """Overlays are drawn above ordinary windows, so the tiles below must not
    show their borders and tab bars through the scratchpad."""
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("focusLeft")
    sb.invoke("toggleGroup")
    s = sb.state()
    eq(len(s["groupBars"]), 1, "a group bar on the desktop")
    sb.invoke("focusRight")
    sb.invoke("moveToSpecial")
    sb.invoke("toggleSpecial")
    s = sb.state()
    eq(s["special"], True, "scratchpad open")
    eq(s["groupBars"], [], "the group bar below is hidden")
    eq(len(sb.overlays()), 4, "only the scratchpad window is outlined")
    sb.invoke("toggleSpecial")
    s = sb.state()
    eq(len(s["groupBars"]), 1, "and it comes back afterwards")


@test
def groups(sb):
    three(sb)
    sb.invoke("focusLeft")
    sb.invoke("toggleGroup")  # A becomes a group
    s = sb.state()
    eq(len(s["groupBars"]), 1, "group bar")
    bar = s["groupBars"][0]
    eq((bar["x"], bar["y"], bar["width"], bar["height"]), (10, 10, 945, 22), "bar geometry")
    eq(sb.geometry("A", s), (10, 34, 945, 1036), "A below its tab bar")
    sb.invoke("focusRight")
    sb.invoke("focusDown")  # C
    sb.invoke("intoGroupLeft")
    s = sb.state()
    eq(s["groupBars"][0]["tabs"], [sb.window("A", s)["id"], sb.window("C", s)["id"]], "C joined")
    eq(sb.geometry("C", s), sb.geometry("A", s), "members share the tile")
    eq(sb.geometry("B", s), RIGHT, "B takes the right side")
    eq(s["active"], sb.window("C", s)["id"], "C active")
    sb.invoke("groupNext")
    s = sb.state()
    eq(s["active"], sb.window("A", s)["id"], "cycled to A")
    sb.invoke("groupWindow2")
    s = sb.state()
    eq(s["active"], sb.window("C", s)["id"], "selected tab 2")
    sb.invoke("leaveGroup")
    s = sb.state()
    eq(s["groupBars"][0]["tabs"], [sb.window("A", s)["id"]], "C left the group")
    eq(sb.window("C", s)["tiled"], True, "C tiled on its own")
    eq(sb.geometry("C", s), (10, 545, 945, 525), "C tiled below the group")
    sb.invoke("focusUp")
    sb.invoke("toggleGroup")
    s = sb.state()
    eq(s["groupBars"], [], "group dissolved")


@test
def pseudo_and_pin(sb):
    sb.spawn("A", size="600x400")
    sb.spawn("B")
    sb.invoke("focusLeft")
    sb.invoke("pseudo")
    s = sb.state()
    # Pseudotile keeps the window's own size (including whatever decoration it
    # had) and centres it in the tile.
    x, y, w, h = sb.geometry("A", s)
    eq(w, 600, "pseudotiled width is the window's own")
    cx, cy = LEFT[0] + LEFT[2] / 2, LEFT[1] + LEFT[3] / 2
    if abs(x + w / 2 - cx) > 1 or abs(y + h / 2 - cy) > 1:
        raise AssertionError("not centred in A's tile: %r vs centre %r" % ((x, y, w, h), (cx, cy)))
    if h >= LEFT[3]:
        raise AssertionError("pseudotiled window should be smaller than its tile: %r" % (h,))
    sb.invoke("pseudo")
    sb.invoke("pin")
    s = sb.state()
    a = sb.window("A", s)
    eq((a["pinned"], a["tiled"], a["onAllDesktops"], a["keepAbove"]), (True, False, True, True), "pinned")
    eq(sb.geometry("B", s), FULL, "B alone")
    sb.invoke("pin")
    s = sb.state()
    a = sb.window("A", s)
    eq((a["pinned"], a["tiled"], a["onAllDesktops"], a["keepAbove"]), (False, True, False, False), "unpinned")


@test
def fullscreen_and_maximize(sb):
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("fullscreen")
    s = sb.wait_for(lambda s: sb.geometry("B", s) == (0, 0, 1920, 1080), "B fullscreen")
    eq(sb.geometry("A", s), LEFT, "A keeps its tile")
    sb.invoke("fullscreen")
    sb.wait_for(lambda s: sb.geometry("B", s) == RIGHT, "B back in its tile")
    sb.invoke("maximize")
    sb.wait_for(lambda s: sb.geometry("B", s) == (0, 0, 1920, 1080), "B maximized")
    sb.invoke("maximize")
    sb.wait_for(lambda s: sb.geometry("B", s) == RIGHT, "B restored")


@test(config={"GapsIn": 0, "GapsOut": 0})
def config_and_reload(sb):
    sb.spawn("A")
    sb.spawn("B")
    s = sb.state()
    eq(sb.geometry("A", s), (0, 0, 960, 1080), "no gaps from config")
    sb.configure(GapsIn=20, GapsOut=30, SplitRatio=1.5)
    s = sb.state()
    # inner area 30..1890 x 30..1050; existing split stays 50/50
    eq(sb.geometry("A", s), (30, 30, 910, 1020), "reconfigured A")
    eq(sb.geometry("B", s), (980, 30, 910, 1020), "reconfigured B")
    # new splits use the new ratio: B's tile is taller than wide -> top gets 75%
    eq((s["config"]["gapsIn"], s["config"]["splitRatio"]), (20, 1.5), "config values")
    sb.spawn("C")
    s = sb.state()
    eq(sb.geometry("B", s), (980, 30, 910, 745), "B keeps 75% of its tile")
    eq(sb.geometry("C", s), (980, 815, 910, 235), "C gets the rest")


@test
def settings_apply_without_reconfigure(sb):
    """System Settings writes kwinrc without notifying KWin; HyprKwin notices."""
    import subprocess
    sb.spawn("A")
    sb.spawn("B")
    time.sleep(5)  # past the startup quiet period
    subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Script-hyprkwin", "--key", "GapsOut", "0"],
                   env=sb.env, check=True)
    s = sb.wait_for(lambda s: s["config"]["gapsOut"] == 0, "new gaps picked up", timeout=6)
    sb.settle()
    eq(sb.geometry("A"), (0, 0, 955, 1080), "relaid out with the new gaps")
    # A change made right after a reconfigure (inside the watcher's quiet
    # period) must still be applied, not swallowed.
    subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Script-hyprkwin", "--key", "GapsOut", "40"],
                   env=sb.env, check=True)
    sb.wait_for(lambda s: s["config"]["gapsOut"] == 40, "change during the quiet period still applied", timeout=12)
    before = sb.state()["configReloads"]
    time.sleep(8)
    after = sb.state()["configReloads"]
    if after - before > 1:
        raise AssertionError("config reload loop: %d reloads while idle" % (after - before))


@test(outputs=2)
def multi_monitor(sb):
    sb.spawn("A")
    sb.spawn("B")
    s = sb.state()
    screens = sorted({w["output"] for w in s["windows"].values()})
    eq(len(screens), 1, "both on one screen initially")
    sb.invoke("swapRight")  # B has no right neighbour on its screen -> next monitor
    s = sb.state()
    a, b = sb.window("A", s), sb.window("B", s)
    if a["output"] == b["output"]:
        raise AssertionError("B should be on the other monitor: %r" % s)
    ga, gb = sb.geometry("A", s), sb.geometry("B", s)
    eq((ga[2], ga[3]), (1900, 1060), "A fills its monitor")
    eq((gb[2], gb[3]), (1900, 1060), "B fills the other monitor")
    sb.invoke("focusLeft")
    s = sb.state()
    eq(s["active"], a["id"], "focus crosses monitors")
    # Plasma's own "Window to Next Screen" must re-home a tiled window.
    sb.invoke("Window to Next Screen")   # A joins B on the second monitor
    s = sb.state()
    a, b = sb.window("A", s), sb.window("B", s)
    eq(a["output"], b["output"], "KWin moved A across: %r" % s["windows"])
    eq(a["tiled"], True, "still tiled after KWin moved it")
    eq(a["workspace"], b["workspace"], "A joined the workspace that monitor shows")
    eq((sb.geometry("A", s)[2], sb.geometry("B", s)[2]), (945, 945), "they share the monitor")


@test
def unload_restores(sb):
    three(sb)
    sb.invoke("moveToSpecial")
    sb._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", "hyprkwin")
    time.sleep(0.5)
    from subprocess import run
    # The script is gone, so inspect via a throwaway probe script.
    probe = sb.base / "probe.qml"
    probe.write_text("""import QtQuick
import org.kde.kwin
Item { Component.onCompleted: { for (const w of Workspace.windows) if (w.caption) console.warn("UNLOADPROBE", w.caption, w.noBorder, w.minimized, w.onAllDesktops, w.keepAbove); } }
""")
    sb._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadDeclarativeScript", str(probe), "probe")
    sb._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start")
    time.sleep(0.5)
    lines = [l.split("UNLOADPROBE ", 1)[1] for l in sb.log_path.read_text().splitlines() if "UNLOADPROBE" in l]
    eq(sorted(lines), ["A false false false false", "B false false false false", "C false false false false"], "restored")


def take_keys(sb):
    import subprocess
    subprocess.run(["python3", str(ROOT_DIR / "tools" / "hyprkwin-shortcuts.py"), "apply"], env=sb.env,
                   capture_output=True, check=True)


@test
def real_keys(sb):
    """Physical key presses (via fake input) after resolving Plasma conflicts."""
    sb.spawn("A")
    sb.spawn("B")
    fi = sb.input()
    fi.combo("meta+left")  # still owned by Plasma's quick tile: HyprKwin must reclaim the window
    sb.settle(0.6)
    s = sb.state()
    eq((sb.geometry("A", s), sb.geometry("B", s)), (LEFT, RIGHT), "layout survives KWin quick tile")
    take_keys(sb)
    fi.combo("meta+left")
    sb.settle()
    s = sb.state()
    eq(s["active"], sb.window("A", s)["id"], "Meta+Left focuses A")
    fi.combo("meta+shift+right")
    sb.settle()
    s = sb.state()
    eq((sb.geometry("A", s), sb.geometry("B", s)), (RIGHT, LEFT), "Meta+Shift+Right swaps")
    fi.combo("meta+equal")
    sb.settle()
    eq(sb.geometry("A"), (1065, 10, 845, 1060), "Meta+= moves the divider right (A is right of it)")
    fi.combo("meta+minus")
    fi.combo("meta+minus")
    sb.settle()
    eq(sb.geometry("A"), (865, 10, 1045, 1060), "Meta+- moves it back left")
    fi.combo("meta+shift+2")
    sb.settle(0.6)
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][1], "Meta+Shift+2 follows to workspace 2")
    eq(sb.geometry("A", s), FULL, "A alone there")
    fi.combo("meta+1")
    sb.settle()
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][0], "Meta+1")
    eq(sb.geometry("B", s), FULL, "B alone on workspace 1")


@test
def mouse_drag_to_retile(sb):
    three(sb)
    fi = sb.input()
    # Meta + left-drag C onto the left edge of A
    fi.drag((1400, 800), (60, 540), modifiers=("meta",))
    sb.settle(0.6)
    s = sb.state()
    eq(sb.geometry("B", s), RIGHT, "B takes the whole right side")
    c, a = sb.geometry("C", s), sb.geometry("A", s)
    eq((c[0], c[1], c[3]), (10, 10, 1060), "C dropped to the left of A")
    eq((a[1], a[3]), (10, 1060), "A shares the left half")
    if not (c[0] + c[2] < a[0]):
        raise AssertionError("C should be left of A: %r %r" % (c, a))


@test
def mouse_resize(sb):
    sb.spawn("A")
    sb.spawn("B")
    fi = sb.input()
    # Meta + right-drag near A's right edge moves the shared edge
    fi.drag((900, 540), (1100, 540), btn=0x111, modifiers=("meta",))
    sb.settle(0.6)
    s = sb.state()
    a, b = sb.geometry("A", s), sb.geometry("B", s)
    if not (1130 <= a[2] <= 1160):
        raise AssertionError("A should be ~1145 wide after dragging its edge by 200px: %r" % (a,))
    eq(b[0], a[0] + a[2] + 10, "B starts one gap after A")
    eq(b[0] + b[2], 1910, "B still reaches the outer gap")


@test(config={"FocusFollowsMouse": "true"})
def focus_follows_mouse(sb):
    sb.spawn("A")
    sb.spawn("B")
    fi = sb.input()
    # Focus must follow the pointer at once, not after it stops moving.
    fi.move_to(400, 500)
    sb.settle(0.1)
    s = sb.state()
    eq(s["active"], sb.window("A", s)["id"], "hovering A focuses it immediately")
    fi.move_to(1500, 500)
    sb.settle(0.1)
    s = sb.state()
    eq(s["active"], sb.window("B", s)["id"], "hovering B focuses it immediately")


@test
def group_tab_click(sb):
    sb.spawn("A")
    sb.invoke("toggleGroup")
    sb.spawn("B")
    sb.invoke("intoGroupLeft")
    s = sb.state()
    eq(len(s["groupBars"]), 1, "one group")
    bar = s["groupBars"][0]
    eq(len(bar["tabs"]), 2, "two tabs")
    eq(s["active"], sb.window("B", s)["id"], "B active")
    fi = sb.input()
    fi.click(bar["x"] + bar["width"] // 4, bar["y"] + bar["height"] // 2)  # first tab = A
    sb.settle()
    s = sb.state()
    eq(s["active"], sb.window("A", s)["id"], "clicking tab 1 activates A")


@test
def overlays_do_not_leak(sb):
    """Border overlays must not pile up across upgrades, and must be gone
    after uninstall. KWin keeps a script's internal windows alive when the
    script is unloaded, so HyprKwin closes leftovers when it starts."""
    import subprocess
    sb.spawn("A")
    sb.spawn("B")
    eq(len(sb.overlays()), 4, "one border = four strips")
    # the upgrade path: install.sh unloads, then KWin reloads enabled scripts
    for _ in range(3):
        sb._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", "hyprkwin")
        sb._qdbus("org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure")
        time.sleep(1.5)
    eq(len(sb.overlays()), 4, "no overlays accumulated over three upgrade cycles")
    # no border while the active window floats
    sb.invoke("toggleFloating")
    sb.settle(0.5)
    eq(sb.overlays(), [], "no overlays while the active window floats")
    sb.invoke("toggleFloating")
    sb.settle(0.5)
    eq(len(sb.overlays()), 4, "border back")
    r = subprocess.run([str(ROOT_DIR / "tools" / "uninstall.sh")], env=sb.env, capture_output=True, text=True)
    eq(r.returncode, 0, "uninstall.sh succeeded: " + r.stderr[-200:])
    time.sleep(1)
    eq(sb.overlays(), [], "uninstall leaves no overlay windows behind")


def hyprkwin_shortcut_lines(sb):
    path = Path(sb.env["XDG_CONFIG_HOME"]) / "kglobalshortcutsrc"
    text = path.read_text(errors="replace") if path.exists() else ""
    return [l for l in text.splitlines() if l.startswith("HyprKwin ")]


def until(pred, timeout=8.0):
    """kglobalaccel writes its file a moment after the fact."""
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.2)
    return pred()


@test
def uninstall_removes_the_shortcuts(sb):
    """A clean uninstall forgets HyprKwin's shortcuts and leaves Plasma's."""
    import subprocess
    names = sb._qdbus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component.shortcutNames").splitlines()
    eq(sum(n.startswith("HyprKwin ") for n in names) > 80, True, "HyprKwin's shortcuts are registered")
    eq(until(lambda: len(hyprkwin_shortcut_lines(sb)) > 80), True, "and saved")
    r = subprocess.run([str(ROOT_DIR / "tools" / "uninstall.sh")], env=sb.env, capture_output=True, text=True)
    eq(r.returncode, 0, "uninstall.sh succeeded: " + r.stderr[-300:])
    eq("Removed %d HyprKwin shortcuts." % sum(n.startswith("HyprKwin ") for n in names) in r.stdout, True, r.stdout[-300:])
    time.sleep(1.5)
    after = sb._qdbus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component.shortcutNames").splitlines()
    eq([n for n in after if n.startswith("HyprKwin ")], [], "none left registered")
    eq("Window Close" in after, True, "Plasma's own KWin shortcuts are untouched")
    eq(until(lambda: not hyprkwin_shortcut_lines(sb)), True, "none left in kglobalshortcutsrc")


@test
def uninstall_removes_the_shortcuts_without_a_session(sb):
    """Run from a TTY with Plasma not running, it edits the file instead."""
    import subprocess
    eq(until(lambda: len(hyprkwin_shortcut_lines(sb)) > 80), True, "HyprKwin's shortcuts are saved")
    before = len(hyprkwin_shortcut_lines(sb))
    env = dict(sb.env)
    sb.stop()
    env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/nonexistent"
    r = subprocess.run([str(ROOT_DIR / "tools" / "uninstall.sh")], env=env, capture_output=True, text=True)
    eq(r.returncode, 0, "uninstall.sh succeeded: " + r.stderr[-300:])
    eq("Removed %d HyprKwin shortcuts." % before in r.stdout, True, r.stdout[-300:])
    eq(hyprkwin_shortcut_lines(sb), [], "none left in kglobalshortcutsrc")
    path = Path(env["XDG_CONFIG_HOME"]) / "kglobalshortcutsrc"
    eq("Window Close=" in path.read_text(), True, "Plasma's own entries are still there")


SHORTCUTS_TOOL = ROOT_DIR / "tools" / "hyprkwin-shortcuts.py"


def tool(sb, *args, script=SHORTCUTS_TOOL):
    import subprocess
    r = subprocess.run([sys.executable if str(script).endswith(".py") else "bash", str(script), *args],
                       env=sb.env, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise AssertionError("%s %s failed: %s" % (script.name, " ".join(args), (r.stdout + r.stderr)[-400:]))
    return r.stdout


def live_shortcuts(sb):
    """{(component, action): sorted keys} for every non-HyprKwin shortcut."""
    import subprocess
    code = ("import importlib.util, json; s = importlib.util.spec_from_file_location('t', %r); "
            "m = importlib.util.module_from_spec(s); s.loader.exec_module(m); "
            "print(json.dumps(m.Accel().everything()))" % str(SHORTCUTS_TOOL))
    out = subprocess.run([sys.executable, "-c", code], env=sb.env, capture_output=True, text=True, check=True).stdout
    return {(i["component"], i["name"]): sorted(i["keys"]) for i in json.loads(out)}


def set_shortcut(sb, component, action, keys):
    import subprocess
    code = ("import importlib.util; s = importlib.util.spec_from_file_location('t', %r); "
            "m = importlib.util.module_from_spec(s); s.loader.exec_module(m); a = m.Accel(); "
            "i = [x for x in a.everything() if x['component'] == %r and x['name'] == %r][0]; a.set_keys(i, %r)"
            % (str(SHORTCUTS_TOOL), component, action, list(keys)))
    subprocess.run([sys.executable, "-c", code], env=sb.env, check=True)


def backup_file(sb):
    return Path(sb.env["XDG_DATA_HOME"]) / "hyprkwin" / "shortcuts-before-hyprkwin.json"


def differences(before, after):
    return {k: (before[k], after.get(k)) for k in before if after.get(k, before[k]) != before[k]}


@test
def uninstall_reinstates_every_shortcut(sb):
    """Whatever happened to the shortcuts after installing (keys moved by
    'apply', or changed by hand to settle a clash), uninstalling puts every
    one back as it was."""
    original = live_shortcuts(sb)
    out = tool(sb, "backup")
    eq("Backed up" in out and backup_file(sb).exists(), True, out)
    eq("Keeping the existing" in tool(sb, "backup"), True, "a second backup never overwrites the first")
    moved = tool(sb, "apply")
    eq("freed" in moved, True, "apply moved some of Plasma's keys: " + moved[-300:])
    set_shortcut(sb, "kwin", "Window Maximize", [])          # a change made by hand
    eq(len(differences(original, live_shortcuts(sb))) > 1, True, "shortcuts have changed")
    out = tool(sb, script=ROOT_DIR / "tools" / "uninstall.sh")
    eq("Reinstated" in out, True, out[-400:])
    time.sleep(1.0)
    eq(differences(original, live_shortcuts(sb)), {}, "every shortcut is as it was before")
    eq(backup_file(sb).exists(), False, "the backup has been used up")


@test
def uninstall_can_keep_later_shortcut_changes(sb):
    """--keep-shortcuts only undoes what HyprKwin moved."""
    original = live_shortcuts(sb)
    tool(sb, "backup")
    tool(sb, "apply")
    set_shortcut(sb, "kwin", "Window Maximize", [])
    tool(sb, "--keep-shortcuts", script=ROOT_DIR / "tools" / "uninstall.sh")
    time.sleep(1.0)
    eq(differences(original, live_shortcuts(sb)), {("kwin", "Window Maximize"): (original[("kwin", "Window Maximize")], [])},
       "only the change made by hand remains")


@test
def backup_is_rebuilt_for_an_existing_install(sb):
    """Installs from before backups existed had already run 'apply'; the
    backup undoes the logged moves, so it still holds the original keys."""
    original = live_shortcuts(sb)
    tool(sb, "apply")
    eq(differences(original, live_shortcuts(sb)) != {}, True, "apply changed things")
    out = tool(sb, "backup")
    eq("rebuilt" in out, True, out)
    saved = json.loads(backup_file(sb).read_text())
    eq(saved["reconstructed"], True, "marked as rebuilt")
    snap = {(i["component"], i["name"]): sorted(i["keys"]) for i in saved["shortcuts"]}
    eq(differences(original, snap), {}, "the backup matches the state before apply")


@test
def overlays_recover_and_ignore_tiny_windows(sb):
    """Overlays must re-assert themselves after being closed behind our back
    (KWin leaves a script's windows behind, so a later instance closes them),
    and tiny transient windows must never get a border."""
    sb.spawn("A")
    sb.spawn("B")
    eq(len(sb.overlays()), 4, "border present")
    sb.close_overlays()
    eq(sb.overlays(), [], "closed from outside")
    # No geometry change, just another decoration update.
    sb.invoke("retile")
    sb.settle(1.0)
    eq(len(sb.overlays()), 4, "border came back on the next update")
    # A window too small to decorate must not leave slivers behind.
    sb.spawn("Tiny", size="20x20", extra=["--fixed"])
    s = sb.state()
    eq(sb.window("Tiny", s)["tiled"], False, "tiny fixed-size window floats")
    eq(sb.overlays(), [], "floating window gets no border")
    sb.invoke("focusLeft")
    sb.settle(0.6)
    overlays = sb.overlays()
    eq(len(overlays), 4, "border back on a tiled window")
    # Every strip spans one full edge; a stray sliver would be small in both axes.
    for geom in overlays:
        w, h = (int(v) for v in geom.split(" ")[1].split("x"))
        if max(w, h) < 100:
            raise AssertionError("sliver-sized overlay %s in %r" % (geom, overlays))


@test
def focus_indicator_modes(sb):
    """Plasma title bars, our border, or nothing. KWin can only switch a
    window's whole decoration, so title bars and our border are exclusive."""
    sb.spawn("A")
    sb.spawn("B")
    s = sb.state()
    eq((sb.window("A", s)["noBorder"], len(sb.overlays())), (True, 4), "default: border, no title bars")
    sb.configure(FocusIndicator=0)
    s = sb.state()
    eq(sb.window("A", s)["noBorder"], False, "title bars back")
    eq(sb.overlays(), [], "no overlay windows at all with Plasma decorations")
    eq(sb.geometry("A", s), LEFT, "still tiled")
    sb.configure(FocusIndicator=2)
    s = sb.state()
    eq(sb.window("A", s)["noBorder"], True, "title bars hidden again")
    eq(sb.overlays(), [], "no border drawn")
    sb.configure(FocusIndicator=1)
    s = sb.state()
    eq((sb.window("A", s)["noBorder"], len(sb.overlays())), (True, 4), "border back")


@test
def borders_survive_window_decorations(sb):
    """KWin decorates a script's own windows unless told otherwise, which
    squashes each thin strip to the decoration's minimum size."""
    sb.spawn("A")
    sb.spawn("B")
    overlays = sorted(sb.overlays())
    eq(len(overlays), 4, "four strips")
    expected = sorted(["1910,10 2x1060", "963,10 2x1060", "963,1070 949x2", "963,8 949x2"])
    eq(overlays, expected, "strips frame B exactly, undecorated")


@test(config={"FocusIndicator": 0, "WindowRules": "tile, class:^(zenity)$"})
def border_fills_in_for_self_decorated_apps(sb):
    """Chromium/Electron/GTK draw their own frames, so a decoration theme
    cannot mark them focused; HyprKwin covers just those windows."""
    import shutil
    import subprocess
    if not shutil.which("zenity"):
        print("  (zenity not installed, skipped)")
        return
    sb.spawn("ServerSide")
    env = dict(sb.env)
    env.update(WAYLAND_DISPLAY=sb.socket, GDK_BACKEND="wayland")
    sb.clients.append(subprocess.Popen(["zenity", "--text-info", "--title=GtkWindow", "--width=600", "--height=400"],
                                       env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    sb.wait_for(lambda s: any(w["caption"] == "GtkWindow" for w in s["windows"].values()), "gtk window")
    sb.settle(1.0)
    s = sb.state()
    eq(sb.window("GtkWindow", s)["tiled"], True, "rule tiled the GTK window")
    eq(s["active"], sb.window("GtkWindow", s)["id"], "GTK window focused")
    overlays = sb.overlays()
    eq(len(overlays), 4, "border drawn for the self-decorated window")
    for geom in overlays:
        w, h = (int(v) for v in geom.split(" ")[1].split("x"))
        if max(w, h) < 100:
            raise AssertionError("squashed strip %s in %r" % (geom, overlays))
    sb.invoke("focusLeft")
    sb.settle(0.6)
    s = sb.state()
    eq(s["active"], sb.window("ServerSide", s)["id"], "decorated window focused")
    eq(sb.overlays(), [], "decoration marks it instead, no overlays")


@test
def shutdown_with_overlays_does_not_crash_kwin(sb):
    """Showing a window while KWin tears down builds one against a destroyed
    Workspace and segfaults the compositor, which would crash a real logout."""
    sb.spawn("A")
    sb.invoke("toggleGroup")
    sb.spawn("B")
    sb.invoke("intoGroupLeft")
    s = sb.state()
    eq(len(s["groupBars"]), 1, "a group bar is on screen")
    eq(len(sb.overlays()) > 0, True, "overlay windows exist at shutdown")
    sb.stop()
    time.sleep(1)
    if sb.crashed():
        raise AssertionError("KWin crashed on shutdown (KCrash in the log)")


def red_x_range(sb, path, rgb=(255, 0, 0), tol=40):
    """x-extent of everything matching a colour, measured from a screenshot."""
    from PIL import Image
    sb.screenshot(path)
    im = Image.open(path).convert("RGB")
    px = im.load()
    xs = [x for x in range(0, im.width, 4) for y in range(0, im.height, 8)
          if all(abs(px[x, y][i] - rgb[i]) < tol for i in range(3))]
    return (min(xs), max(xs)) if xs else None


@test(config={"SlideHold": 1500})
def keyboard_resize_holds_the_shrinking_window(sb):
    """Each app resizes once: the one that grows straight away, the one that
    shrinks after the divider has slid over it."""
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("focusLeft")
    sb.invoke("resizeRight", settle=False)
    time.sleep(0.4)
    s = sb.state()
    eq(sb.geometry("A", s), (10, 10, 1045, 1060), "A grew at once")
    eq(sb.geometry("B", s), RIGHT, "B is held at its old size")
    sb.settle(1.6)
    eq(sb.geometry("B"), (1065, 10, 845, 1060), "then B shrinks, once")
    # Presses during a slide add up and play as the next one; a press back
    # the other way cancels out.
    sb.invoke("resizeRight", settle=False)
    sb.invoke("resizeRight", settle=False)
    sb.invoke("resizeLeft", settle=False)
    sb.invoke("resizeRight", settle=False)
    sb.settle(5.0)
    eq(sb.geometry("A"), (10, 10, 1245, 1060), "three more steps right, one back")
    eq(sb.geometry("B"), (1265, 10, 645, 1060), "B gave up the space")


@test(config={"SlideDivider": False})
def keyboard_resize_can_jump(sb):
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("focusLeft")
    sb.invoke("resizeRight", settle=False)
    time.sleep(0.1)
    s = sb.state()
    eq((sb.geometry("A", s), sb.geometry("B", s)), ((10, 10, 1045, 1060), (1065, 10, 845, 1060)), "both at once")


def extents(sb, path, *colours, tol=40, column=None):
    """Range of each colour along the middle row (or down a column) of ONE
    screenshot, so edges that are moving are all measured at the same instant."""
    from PIL import Image
    sb.screenshot(path)
    im = Image.open(path).convert("RGB")
    px = im.load()
    if column is None:
        line = [(x, im.height // 2) for x in range(im.width)]
    else:
        line = [(column, y) for y in range(im.height)]
    out = []
    for rgb in colours:
        hits = [p[0] if column is None else p[1] for p in line
                if all(abs(px[p][i] - rgb[i]) < tol for i in range(3))]
        out.append((min(hits), max(hits)) if hits else None)
    return out


SLOW_SLIDE = dict(effect=True, effect_config={"SlideDuration": 2400}, config={"SlideHold": 3000})


@test(**SLOW_SLIDE)
def divider_slides_over_the_windows(sb):
    """Mid-slide the growing window is being uncovered at its final size, the
    shrinking one covered at its old size, with the gap between them kept."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")
    sb.invoke("focusLeft")
    sb.settle(3.0)
    sb.invoke("resizeRightLarge", settle=False)   # 300px
    time.sleep(0.5)
    red, blue = extents(sb, shots / "right-mid.png", (255, 0, 0), (0, 0, 255))
    eq(955 + 20 < red[1] < 1255 - 20, True, "A's visible edge is part-way: %r" % (red,))
    eq(abs(blue[0] - (red[1] + 11)) <= 6, True, "B's visible edge keeps the gap: %r / %r" % (red, blue))
    eq(blue[1] >= 1900, True, "B still reaches its right edge: %r" % (blue,))
    sb.settle(3.5)
    red, blue = extents(sb, shots / "right-end.png", (255, 0, 0), (0, 0, 255))
    eq((abs(red[1] - 1254) <= 2, abs(blue[0] - 1265) <= 2), (True, True), "landed: %r / %r" % (red, blue))

    # And back the other way from the right-hand window: B grows leftwards.
    sb.invoke("focusRight")
    sb.invoke("resizeLeftLarge", settle=False)
    time.sleep(0.5)
    red, blue = extents(sb, shots / "left-mid.png", (255, 0, 0), (0, 0, 255))
    eq(955 + 20 < red[1] < 1255 - 20, True, "A's visible edge is part-way back: %r" % (red,))
    eq(abs(blue[0] - (red[1] + 11)) <= 6, True, "gap kept: %r / %r" % (red, blue))
    sb.settle(3.5)
    red, blue = extents(sb, shots / "left-end.png", (255, 0, 0), (0, 0, 255))
    eq((abs(red[1] - 954) <= 2, abs(blue[0] - 965) <= 2), (True, True), "back where it started: %r / %r" % (red, blue))


@test(**SLOW_SLIDE)
def divider_slides_vertically_too(sb):
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#00ff00")
    sb.spawn("C", color="#0000ff")               # A | (B / C)
    sb.invoke("focusUp")                          # B
    sb.settle(3.0)
    sb.invoke("resizeDownLarge", settle=False)    # B/C divider down by 300
    time.sleep(0.5)
    green, blue = extents(sb, sb.base / "vertical-mid.png", (0, 255, 0), (0, 0, 255), column=1400)
    eq(535 + 20 < green[1] < 835 - 20, True, "B's visible bottom edge is part-way: %r" % (green,))
    eq(abs(blue[0] - (green[1] + 11)) <= 6, True, "C's visible top keeps the gap: %r / %r" % (green, blue))
    sb.settle(3.5)
    s = sb.state()
    eq((sb.geometry("B", s), sb.geometry("C", s)), ((965, 10, 945, 825), (965, 845, 945, 225)), "landed")


@test(effect=True, effect_config={"SlideDuration": 2400},
      config={"SlideHold": 3000, "BorderSize": 6, "ActiveBorderSource": 1, "ActiveBorderColor": "#00ff00"})
def the_border_slides_with_the_divider(sb):
    """The focused window here is the one being held back: its border must
    follow the edge the user sees, not the size the app still has."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")                  # focused
    sb.settle(3.0)
    sb.invoke("resizeRightLarge", settle=False)     # B shrinks: held and covered
    time.sleep(0.5)
    blue, green = extents(sb, shots / "border-mid.png", (0, 0, 255), (0, 255, 0))
    eq(965 + 20 < blue[0] < 1265 - 20, True, "B's visible edge is part-way: %r" % (blue,))
    eq(abs(green[0] - (blue[0] - 6)) <= 8, True, "the border's left side is at that edge: border %r, B %r" % (green, blue))


@test(effect=True, effect_config={"Duration": 3000, "Curve": 4})
def nudging_a_split_is_quick_and_unstretched(sb):
    """A divider nudge never goes through the stretch-and-cross-fade used for
    re-tiling, however long that is set to: it is over in a fifth of a second."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")
    sb.invoke("focusLeft")
    sb.settle(3.5)                            # let the opening animations finish
    sb.invoke("resizeRight", settle=False)
    time.sleep(0.4)
    red = red_x_range(sb, shots / "nudge.png")
    eq(abs(red[1] - 1055) <= 8, True, "A's edge is already at its new place: %r" % (red,))
    blue = red_x_range(sb, shots / "nudge.png", rgb=(0, 0, 255))
    eq(abs(blue[0] - 1065) <= 8, True, "and so is B's: %r" % (blue,))


@test(effect=True, effect_config={"Duration": 3000, "Curve": 4})
def dragging_a_split_does_not_animate(sb):
    """While an edge is dragged, the neighbour must track the pointer rather
    than chase it through a stream of restarted animations."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")
    sb.settle(3.5)
    fi = sb.input()
    fi.move_to(900, 540)
    fi.key("meta", True)
    fi.button(0x111, True)
    for x in range(900, 1120, 20):
        fi.move_to(x, 540)
        time.sleep(0.03)
    sb.settle(0.5)
    blue = red_x_range(sb, shots / "drag.png", rgb=(0, 0, 255))
    s = sb.state()
    b = sb.geometry("B", s)
    fi.button(0x111, False)
    fi.key("meta", False)
    fi.sync()
    eq(b[0] > 1100, True, "B moved with the drag: %r" % (b,))
    eq(abs(blue[0] - b[0]) <= 8, True, "B is drawn where it is, mid-drag: drawn %r, at %r" % (blue, b))


@test(effect=True, effect_config={"Duration": 3000, "Curve": 4})
def windows_animate_to_their_new_tile(sb):
    """The companion effect slides the rendered window to its new tile.
    A long linear animation makes the intermediate frames measurable."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")
    sb.settle(1.0)
    eq(sb.geometry("A"), LEFT, "A starts on the left")
    start = red_x_range(sb, shots / "start.png")
    eq(start[0] < 100, True, "A is on the left before the swap: %r" % (start,))
    sb.invoke("swapLeft", settle=False)
    frames = [red_x_range(sb, shots / ("f%d.png" % i)) for i in range(3)]
    if not all(frames):
        raise AssertionError("lost track of the window: %r" % (frames,))
    lefts = [f[0] for f in frames]
    if not (lefts[0] > start[0] and lefts == sorted(lefts)):
        raise AssertionError("expected the window to slide right over time, got %r" % (lefts,))
    if lefts[-1] >= 900:
        raise AssertionError("animation finished too early to be visible: %r" % (lefts,))
    sb.settle(4.0)
    eq(sb.geometry("A"), RIGHT, "A ends in B's tile")
    settled = red_x_range(sb, shots / "settled.png")
    eq(settled[0] > 900, True, "and is drawn there once settled: %r" % (settled,))


@test(effect=True, effect_config={"Duration": 3000, "Curve": 4},
      config={"BorderSize": 8, "UseAccentColor": "false", "ActiveBorderColor": "#00ff00"})
def focus_changes_do_not_animate_the_border(sb):
    """A border belongs to its window: moving focus must show it on the new
    window at once, not slide it across the screen."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")
    # Opening B resizes A, and that resize is animated: let it finish first.
    sb.settle(4.0)
    s = sb.state()
    eq(s["active"], sb.window("B", s)["id"], "B focused, so the border is on the right")
    green = red_x_range(sb, shots / "before.png", rgb=(0, 255, 0))
    eq(green[0] > 900, True, "border starts on B: %r" % (green,))
    sb.invoke("focusLeft", settle=False)
    frames = [red_x_range(sb, shots / ("focus%d.png" % i), rgb=(0, 255, 0)) for i in range(4)]
    # Every frame must show the border wholly on one window or the other. A
    # border sliding across would span both halves in some frame.
    for frame in frames:
        if frame is None:
            raise AssertionError("border vanished during the focus change: %r" % (frames,))
        if frame[1] - frame[0] > LEFT[2] + 40:
            raise AssertionError("border was caught mid-slide between windows: %r" % (frames,))
    eq(frames[-1][0] < 100, True, "border ends up on A: %r" % (frames,))
    eq(sb.geometry("A"), LEFT, "no window moved")


@test
def windows_snap_without_the_effect(sb):
    """Without the effect installed nothing animates: the window is drawn in
    its new tile immediately."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.spawn("B", color="#0000ff")
    sb.settle(1.0)
    sb.invoke("swapLeft", settle=False)
    first = red_x_range(sb, shots / "snap.png")
    eq(first[0] > 900, True, "drawn in the new tile straight away: %r" % (first,))


@test
def starts_on_the_first_workspace(sb):
    """Plasma restores the workspace you left; a tiling session starts at 1."""
    sb.spawn("A")
    sb._qdbus("org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.createDesktop", "1", "Two")
    sb.settle()
    sb.invoke("desktop2")
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][1], "on workspace 2")
    # Restarting the script stands in for a fresh session.
    sb._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", "hyprkwin")
    sb._qdbus("org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure")
    time.sleep(2)
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][0], "back on workspace 1 at startup")


@test(config={"StartOnFirstDesktop": "false"})
def start_workspace_can_be_left_alone(sb):
    sb.spawn("A")
    sb._qdbus("org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.createDesktop", "1", "Two")
    sb.settle()
    sb.invoke("desktop2")
    sb._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", "hyprkwin")
    sb._qdbus("org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure")
    time.sleep(2)
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][1], "stayed where Plasma left it")


@test(config={"TileDialogs": "true"})
def dialogs_can_be_tiled(sb):
    sb.spawn("A")
    sb.spawn("P", extra=["--dialog"])
    sb.wait_for(lambda s: any(w["caption"] == "P dialog" for w in s["windows"].values()), "dialog")
    sb.settle(0.6)
    s = sb.state()
    eq(sb.window("P dialog", s)["tiled"], True, "dialog tiled when asked")
    eq(len([w for w in s["windows"].values() if w["tiled"]]), 3, "all three tiled")


@test(effect=True, effect_config={"OpenCloseEffect": 2})
def open_close_animation_can_be_chosen(sb):
    """Picking one of Plasma's open/close effects loads it and retires the rest."""
    loaded = sb._qdbus("org.kde.KWin", "/Effects", "org.kde.kwin.Effects.loadedEffects")
    names = loaded.split()
    eq("fade" in names, True, "fade loaded: %r" % ([n for n in names if n in ("fade", "scale", "glide")],))
    eq("scale" in names, False, "scale retired")


@test(config={"BorderSize": 4, "BorderRadius": 12})
def border_can_have_rounded_corners(sb):
    """Rounded corners add four corner windows and shorten the edges so the
    arcs are not overdrawn."""
    sb.spawn("A")
    sb.spawn("B")
    sb.settle(0.6)
    overlays = sb.overlays()
    eq(len(overlays), 8, "four edges plus four corners: %r" % (overlays,))
    corners = [g for g in overlays if g.split(" ")[1] == "12x12"]
    eq(len(corners), 4, "four 12x12 corner windows: %r" % (overlays,))
    # B is focused: outer rect is its tile grown by the 4px border.
    edges = [g for g in overlays if g not in corners]
    for geom in edges:
        w, h = (int(v) for v in geom.split(" ")[1].split("x"))
        if min(w, h) != 4:
            raise AssertionError("edge should be one border thick: %r" % (geom,))
        if max(w, h) > RIGHT[3]:
            raise AssertionError("edge should stop short of the corners: %r" % (geom,))


@test(config={"HideFloatingTitleBars": "true"})
def floating_title_bars_can_be_hidden(sb):
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("toggleFloating")
    s = sb.state()
    b = sb.window("B", s)
    eq((b["tiled"], b["noBorder"]), (False, True), "floating window keeps no title bar")


@test
def rules_tool_picks_apps_from_open_windows(sb):
    """tools/hyprkwin-rules.py turns an open window into a float rule."""
    import subprocess
    env = dict(sb.env)
    env["HYPRKWIN_LOG"] = str(sb.log_path)
    tool = [sys.executable, str(ROOT_DIR / "tools" / "hyprkwin-rules.py")]
    sb.spawn("A", app_id="hyprkwin.keep")
    sb.spawn("B", app_id="hyprkwin.floaty")
    listing = subprocess.run(tool + ["list"], env=env, capture_output=True, text=True)
    eq("hyprkwin.floaty" in listing.stdout, True, "lists open windows: %r" % (listing.stdout,))
    index = [i for i, line in enumerate(listing.stdout.splitlines()[1:], 1)
             if "hyprkwin.floaty" in line][0]
    added = subprocess.run(tool + ["float", str(index)], env=env, capture_output=True, text=True)
    eq("Added: float, class:^hyprkwin\\.floaty$" in added.stdout, True, "wrote the rule: %r" % (added.stdout,))
    # The rule reaches the running script through the config watcher.
    s = sb.wait_for(lambda s: "floaty" in s["config"]["windowRules"], "rule picked up", timeout=12)
    eq(s["ruleErrors"], [], "rule parses")
    sb.spawn("C", app_id="hyprkwin.floaty")
    s = sb.state()
    eq(sb.window("C", s)["tiled"], False, "new window of that app floats")
    eq(sb.window("A", s)["tiled"], True, "other apps still tile")
    shown = subprocess.run(tool + ["show"], env=env, capture_output=True, text=True)
    eq("float, class:" in shown.stdout, True, "show lists it: %r" % (shown.stdout,))
    subprocess.run(tool + ["remove", "1"], env=env, capture_output=True, text=True)
    eq(read_rules_of(sb), "", "removing leaves no rules")


@test
def rules_added_in_the_settings_page_apply(sb):
    """The settings page is the place to manage rules: a rule typed into its
    list and saved with OK reaches the running script, and the next window
    obeys it. Driven through the real page with real key presses and clicks."""
    import subprocess
    if not shutil.which("kcmshell6"):
        return
    env = dict(sb.env)
    env.update(WAYLAND_DISPLAY=sb.socket, QT_QPA_PLATFORM="wayland")
    page = subprocess.Popen(["kcmshell6", "kwin/effects/configs/kcm_kwin4_genericscripted", "--args", "hyprkwin KWin/Script"],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sb.clients.append(page)
    sb.wait_for(lambda s: any("kcmshell" in w["caption"] for w in s["windows"].values()), "settings page", timeout=20)
    sb.settle(2.0)
    fi = sb.input()
    # The page is the only window, so HyprKwin tiles it to fill the screen.
    fi.click(315, 31)                       # the "Window rules" tab
    sb.settle(1.0)
    fi.click(900, 193)                      # the input line above the list
    fi.type_text("float, title:^Floater$")
    fi.click(1836, 233)                     # Add
    sb.settle(0.5)
    fi.click(1681, 1047)                    # OK
    page.wait(timeout=10)
    eq(read_rules_of(sb), r"float\, title:^Floater$", "saved as the page's list (items split by unescaped commas)")
    sb.wait_for(lambda s: "Floater" in s["config"]["windowRules"], "rule picked up", timeout=12)
    sb.spawn("A")
    sb.spawn("Floater")
    s = sb.state()
    eq(sb.window("Floater", s)["tiled"], False, "the new rule applies")
    eq(sb.window("A", s)["tiled"], True, "other windows still tile")


def read_rules_of(sb, key="WindowRuleList"):
    import subprocess
    return subprocess.run(["kreadconfig6", "--file", "kwinrc", "--group", "Script-hyprkwin",
                           "--key", key], env=sb.env, capture_output=True, text=True).stdout.strip()


@test(config={"BorderSize": 4})
def border_gives_way_to_menus(sb):
    """Overlays are drawn above ordinary windows, so a menu spilling past a
    window's edge must not have the border painted across it."""
    sb.spawn("A")
    sb.spawn("B", extra=["--menu"])
    sb.spawn("C")
    sb.settle(0.5)
    fi = sb.input()
    fi.click(1400, 450, BTN_RIGHT)  # inside B; the menu runs on past its bottom edge
    sb.settle(1.0)
    s = sb.state()
    eq(s["windows"][s["active"]]["caption"], "B", "right-click activated B")
    eq(len(s["popups"]), 1, "menu is open")
    eq(sb.overlays(), [], "border hidden while the menu crosses it")
    fi.combo("escape")
    sb.wait_for(lambda s: not s["popups"], "menu closed")
    sb.settle(0.5)
    eq(len(sb.overlays()), 4, "border returns once the menu closes")


@test(config={"BorderSize": 4})
def menus_inside_a_window_keep_the_border(sb):
    """A menu well inside the window never covers the border."""
    sb.spawn("A")
    sb.spawn("B", extra=["--menu"])
    sb.settle(0.5)
    fi = sb.input()
    fi.click(1400, 400, BTN_RIGHT)
    sb.settle(1.0)
    eq(len(sb.state()["popups"]), 1, "menu is open")
    eq(len(sb.overlays()), 4, "border still drawn for a menu inside the window")


def shown_on(sb, s=None):
    """What each monitor is showing, as workspace numbers."""
    s = s or sb.state()
    order = s["desktops"]
    return {name: order.index(d) + 1 for name, d in (s["shown"] or {}).items()}


def colour_on(sb, path, half, rgb, tol=40):
    """Whether a colour appears on half of the screen, or anywhere ("all")."""
    from PIL import Image
    sb.screenshot(path)
    im = Image.open(path).convert("RGB")
    px = im.load()
    x0, x1 = {"left": (0, im.width // 2), "right": (im.width // 2, im.width)}.get(half, (0, im.width))
    return any(all(abs(px[x, y][i] - rgb[i]) < tol for i in range(3))
               for x in range(x0, x1, 8) for y in range(0, im.height, 16))


@test(outputs=2)
def a_second_monitor_gets_its_own_workspace(sb):
    """Hyprland gives each monitor its own workspaces: the second display
    comes up on workspace 2, and switching workspace here leaves it alone."""
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    s = sb.state()
    first = sb.window("A", s)["output"]
    second = [n for n in s["shown"] if n != first][0]
    eq(shown_on(sb, s), {first: 1, second: 2}, "the second monitor starts on workspace 2")

    sb.invoke("windowToMonitorRight")      # A across, focus follows
    s = sb.state()
    a = sb.window("A", s)
    eq(a["output"], second, "A moved to the second monitor")
    eq(s["active"], a["id"], "focus followed A")
    eq(a["workspace"], s["desktops"][1], "A joined workspace 2")
    eq(s["currentDesktop"], s["desktops"][1], "Plasma followed the focused monitor")

    sb.invoke("desktop1")                  # workspace 1 lives on the other monitor
    sb.spawn("B", color="#0000ff")         # so B opens there
    s = sb.state()
    b = sb.window("B", s)
    eq(b["output"], first, "focus jumped to the monitor showing workspace 1")
    eq(shown_on(sb, s), {first: 1, second: 2}, "nothing moved between monitors")
    eq(sb.geometry("B", s), FULL, "B has the first monitor to itself")
    eq(colour_on(sb, shots / "both.png", "right", (255, 0, 0)), True, "A still up on its own monitor")
    eq(sb.window("A", s)["onAllDesktops"], True, "A is kept visible there")

    sb.invoke("desktop3")                  # this monitor alone moves on
    s = sb.state()
    eq(shown_on(sb, s), {first: 3, second: 2}, "only this monitor switched")
    eq(colour_on(sb, shots / "ws3.png", "left", (0, 0, 255)), False, "B hidden with workspace 1")
    eq(colour_on(sb, shots / "ws3.png", "right", (255, 0, 0)), True, "A untouched on workspace 2")


@test(outputs=2)
def focus_across_monitors_carries_the_workspace(sb):
    """Plasma has one current desktop; it follows the monitor you focus."""
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("windowToMonitorRight")      # B to the second monitor (workspace 2)
    s = sb.state()
    first, second = sb.window("A", s)["output"], sb.window("B", s)["output"]
    eq(s["currentDesktop"], s["desktops"][1], "the focused monitor drives Plasma")
    sb.invoke("focusLeft")                 # back onto A, which is on workspace 1
    s = sb.state()
    eq(s["active"], sb.window("A", s)["id"], "A focused")
    eq(s["currentDesktop"], s["desktops"][0], "current desktop came along")
    eq(shown_on(sb, s), {first: 1, second: 2}, "nothing moved")


@test(outputs=2)
def workspaces_trade_places_between_monitors(sb):
    """movecurrentworkspacetomonitor: the two monitors swap workspaces."""
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("windowToMonitorRight")      # B to the second monitor (workspace 2)
    sb.invoke("focusLeft")                 # A, on workspace 1 of the first
    s = sb.state()
    first, second = sb.window("A", s)["output"], sb.window("B", s)["output"]
    eq(shown_on(sb, s), {first: 1, second: 2}, "set up")
    sb.invoke("workspaceToMonitorRight")
    s = sb.state()
    eq(shown_on(sb, s), {first: 2, second: 1}, "the monitors traded workspaces")
    eq(sb.window("A", s)["output"], second, "A went with workspace 1")
    eq(sb.window("B", s)["output"], first, "B came the other way with workspace 2")
    eq(sb.geometry("A", s), (1930, 10, 1900, 1060), "A fills the second monitor")
    eq(sb.geometry("B", s), FULL, "B fills the first one")


@test(outputs=2)
def a_window_can_be_sent_to_the_other_monitor(sb):
    """Workspace 2 lives on the second monitor, so the workspace bindings
    double as "send this to the other display"."""
    sb.spawn("A")
    sb.spawn("B")
    s = sb.state()
    first = sb.window("A", s)["output"]
    second = [n for n in s["shown"] if n != first][0]
    sb.invoke("moveToDesktop2")            # B follows to workspace 2
    s = sb.state()
    b = sb.window("B", s)
    eq(b["output"], second, "B crossed to the second monitor")
    eq(b["workspace"], s["desktops"][1], "on workspace 2")
    eq(s["active"], b["id"], "focus followed it")
    eq(sb.geometry("A", s), FULL, "A has the first monitor to itself")
    eq(sb.geometry("B", s), (1930, 10, 1900, 1060), "B fills the second")

    sb.invoke("moveToDesktopSilent1")      # and back, without following
    s = sb.state()
    b = sb.window("B", s)
    eq(b["output"], first, "B returned to the monitor showing workspace 1")
    eq(s["active"], None, "focus did not chase it to the other monitor")
    eq(shown_on(sb, s), {first: 1, second: 2}, "monitors kept their workspaces")
    eq(sb.geometry("A", s)[2], 945, "A and B share the first monitor again")


@test(outputs=2)
def a_monitor_can_come_and_go(sb):
    """Turning a display off mid-session must not strand its windows or leave
    another workspace's windows on screen; turning it back on restores it."""
    if not shutil.which("kscreen-doctor"):
        return
    shots = sb.base / "shots"
    shots.mkdir(exist_ok=True)
    sb.spawn("A", color="#ff0000")
    sb.invoke("windowToMonitorRight")      # A on the second monitor, workspace 2
    sb.spawn("B", color="#0000ff")
    sb.invoke("moveToDesktopSilent1")      # B back on the first, workspace 1
    s = sb.state()
    first, second = sb.window("B", s)["output"], sb.window("A", s)["output"]
    eq(shown_on(sb, s), {first: 1, second: 2}, "set up")

    sb.output(second, "disable")           # the monitor is switched off
    sb.wait_for(lambda s: s["shown"] is None, "down to one monitor")
    sb.settle(1.0)
    s = sb.state()
    a = sb.window("A", s)
    eq(a["output"], first, "A came across to the monitor that is left")
    eq(a["workspace"], s["desktops"][1], "and kept workspace 2")
    eq(sb.geometry("A", s), FULL, "A has the screen")
    eq(sb.window("B", s)["onAllDesktops"], False, "B is no longer held on screen")
    eq(colour_on(sb, shots / "off.png", "all", (0, 0, 255)), False, "B hidden with workspace 1")
    eq(colour_on(sb, shots / "off.png", "all", (255, 0, 0)), True, "A on screen")

    sb.output(second, "enable")            # and switched back on
    sb.wait_for(lambda s: s["shown"] is not None and len(s["shown"]) == 2, "both monitors back")
    sb.settle(1.5)
    s = sb.state()
    eq(shown_on(sb, s), {first: 1, second: 2}, "the second monitor got its workspace back")
    eq(sb.window("A", s)["output"], second, "A went home")
    eq(sb.window("B", s)["workspace"], s["desktops"][0], "B still belongs to workspace 1")


@test(outputs=2, config={"PerOutputWorkspaces": False})
def workspaces_can_span_both_monitors(sb):
    """Turned off, a workspace covers every monitor as Plasma's own do."""
    sb.spawn("A")
    sb.spawn("B")
    sb.invoke("windowToMonitorRight")      # B across, still on workspace 1
    s = sb.state()
    eq(s["shown"], None, "per-monitor workspaces off")
    eq(sb.window("B", s)["desktops"], [s["desktops"][0]], "B stayed on workspace 1")
    sb.invoke("desktop2")
    s = sb.state()
    eq(s["currentDesktop"], s["desktops"][1], "switched to workspace 2")
    eq(sb.window("A", s)["onAllDesktops"], False, "nothing is pinned to keep a monitor alive")
    eq(sb.window("B", s)["onAllDesktops"], False, "both monitors went to workspace 2")


def relaunch_setup(sb, app="Spotify", app_id="hyprkwin.test"):
    """An app parked on workspace 3 and the user busy in an editor, so KWin's
    focus stealing prevention will turn the app's activation request down."""
    flag = sb.base / ("relaunch-" + app)
    sb.spawn(app, app_id=app_id, extra=["--activate-on", str(flag)])
    sb.invoke("moveToDesktopSilent3")
    sb.spawn("Editor")
    fi = sb.input()
    fi.click(500, 500)
    fi.combo("a")
    time.sleep(0.3)
    return flag


def relaunch(sb, flag):
    flag.touch()
    sb.wait_for(lambda s: not flag.exists(), "the app noticed the relaunch")
    sb.settle(1.0)
    return sb.state()


@test
def relaunching_an_app_goes_to_its_workspace(sb):
    """Launching an already-open app again takes you to it, instead of KWin
    just flagging it (misc:focus_on_activate)."""
    flag = relaunch_setup(sb)
    s = relaunch(sb, flag)
    app = sb.window("Spotify", s)
    eq(s["currentDesktop"], s["desktops"][2], "switched to workspace 3")
    eq(s["active"], app["id"], "the app has the focus")
    eq(app["demandsAttention"], False, "and is no longer flagged")
    eq(sb.geometry("Spotify", s), FULL, "laid out on its workspace")


@test(outputs=2)
def relaunching_an_app_brings_its_workspace_up_on_its_monitor(sb):
    flag = relaunch_setup(sb)
    s = sb.state()
    first = sb.window("Editor", s)["output"]
    second = [n for n in s["shown"] if n != first][0]
    s = relaunch(sb, flag)
    eq(s["active"], sb.window("Spotify", s)["id"], "the app has the focus")
    eq(sb.window("Spotify", s)["output"], first, "on the monitor it was on")
    eq(shown_on(sb, s), {first: 3, second: 2}, "only that monitor switched")
    eq(s["currentDesktop"], s["desktops"][2], "Plasma followed")


@test
def relaunching_a_minimized_app_restores_it(sb):
    flag = relaunch_setup(sb)
    sb.invoke("desktop3")
    sb.invoke("Window Minimize")
    sb.invoke("desktop1")
    fi = sb.input()
    fi.click(500, 500)
    fi.combo("a")
    time.sleep(0.3)
    s = relaunch(sb, flag)
    app = sb.window("Spotify", s)
    eq(app["minimized"], False, "restored")
    eq(s["active"], app["id"], "focused")
    eq(s["currentDesktop"], s["desktops"][2], "on its workspace")


@test(config={"WindowRules": "focusonactivate off, class:^hyprkwin\\.chat$"})
def apps_can_opt_out_of_focus_on_activate(sb):
    """A chat app asking for attention on a new message must not pull you
    over when a rule says so; it just stays flagged."""
    flag = relaunch_setup(sb, app="Chat", app_id="hyprkwin.chat")
    s = relaunch(sb, flag)
    eq(s["currentDesktop"], s["desktops"][0], "stayed on workspace 1")
    eq(s["active"], sb.window("Editor", s)["id"], "the editor keeps the focus")
    eq(sb.window("Chat", s)["demandsAttention"], True, "Plasma's own flag is left for the taskbar")


@test(config={"FocusOnActivate": False})
def focus_on_activate_can_be_turned_off(sb):
    flag = relaunch_setup(sb)
    s = relaunch(sb, flag)
    eq(s["currentDesktop"], s["desktops"][0], "stayed on workspace 1")
    eq(sb.window("Spotify", s)["demandsAttention"], True, "flagged, as Plasma does")


@test
def plasma_shell(sb):
    """A real plasmashell: panel struts respected, shell surfaces left alone,
    overlays hidden from and during Overview."""
    import shutil
    import subprocess
    if not shutil.which("plasmashell"):
        print("  (plasmashell not installed, skipped)")
        return
    env = dict(sb.env)
    env.update(WAYLAND_DISPLAY=sb.socket, QT_QPA_PLATFORM="wayland")
    sb.clients.append(subprocess.Popen(["plasmashell", "--no-respawn"], env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    time.sleep(10)
    sb.spawn("A")
    sb.invoke("toggleGroup")
    sb.spawn("B")
    s = sb.state()
    eq(sorted(w["caption"] for w in s["windows"].values()), ["A", "B"], "only app windows are managed")
    a = sb.geometry("A", s)
    if not (a[1] + a[3] < 1080 - 30):
        raise AssertionError("A should stop above the panel: %r" % (a,))
    sb.invoke("Overview", raw=True, settle=False)
    sb.wait_for(lambda s: s["effectActive"], "overlays hidden during Overview")
    sb.invoke("Overview", raw=True, settle=False)
    sb.wait_for(lambda s: not s["effectActive"], "overlays back after Overview")


def main():
    words = sys.argv[1:]
    selected = [t for t in TESTS if not words or any(w in t.__name__ for w in words)]
    failed = []
    for t in selected:
        opts = t.opts
        start = time.time()
        try:
            sandbox = Sandbox(outputs=opts.get("outputs", 1), config=opts.get("config"),
                              effect=opts.get("effect", False), effect_config=opts.get("effect_config"))
            with sandbox as sb:
                try:
                    t(sb)
                    errs = [e for e in sb.errors() if "bluez" not in e]
                    if errs:
                        raise AssertionError("script errors:\n  " + "\n  ".join(errs[:10]))
                except Exception:
                    shot = sb.base.parent / ("hyprkwin-fail-%s.png" % t.__name__)
                    try:
                        sb.screenshot(shot)
                    except Exception:
                        pass
                    log = sb.base.parent / ("hyprkwin-fail-%s.log" % t.__name__)
                    log.write_text(sb.log_path.read_text(errors="replace"))
                    raise
            # KWin must survive shutdown: a script that crashes it here would
            # crash a real logout too.
            if sandbox.crashed():
                raise AssertionError("KWin crashed (KCrash in %s)" % sandbox.log_path)
            print("PASS %-32s %.1fs" % (t.__name__, time.time() - start))
        except Exception as e:
            failed.append(t.__name__)
            print("FAIL %-32s %s" % (t.__name__, e))
            if "-v" in sys.argv or len(selected) == 1:
                traceback.print_exc()
    print("\n%d passed, %d failed" % (len(selected) - len(failed), len(failed)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
