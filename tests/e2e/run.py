#!/usr/bin/env python3
"""End-to-end tests against a headless nested KWin.

    python3 tests/e2e/run.py            # all tests
    python3 tests/e2e/run.py swap group # tests whose name contains a word
"""
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
    sb.invoke("resizeRight")  # grow B (right window) by 100px leftwards
    s = sb.state()
    eq(sb.geometry("B", s), (865, 10, 1045, 1060), "B grew")
    eq(sb.geometry("A", s), (10, 10, 845, 1060), "A shrank")


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
    eq(sb.geometry("A"), (865, 10, 1045, 1060), "Meta+= grows")
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


def read_rules_of(sb):
    import subprocess
    return subprocess.run(["kreadconfig6", "--file", "kwinrc", "--group", "Script-hyprkwin",
                           "--key", "WindowRules"], env=sb.env, capture_output=True, text=True).stdout.strip()


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
