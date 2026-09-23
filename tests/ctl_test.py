#!/usr/bin/env python3
"""Unit tests for hyprkwinctl's reading of HyprKwin's state.

    python3 tests/ctl_test.py
"""
import importlib.machinery
import unittest

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ctl = importlib.machinery.SourceFileLoader("hyprkwinctl", str(ROOT / "tools/hyprkwinctl")).load_module()

D1, D2 = "desk-1", "desk-2"


def window(space, caption, **extra):
    w = {"caption": caption, "class": "app." + caption.lower(), "tiled": True, "floating": False,
         "scratchpad": None, "minimized": False, "output": space.split("|")[1] if space else None,
         "workspace": space.split("|")[0] if space else None, "space": space,
         "geometry": {"x": 0, "y": 0, "width": 100, "height": 100}}
    w.update(extra)
    return w


def state(**extra):
    s = {
        "desktops": [D1, D2], "currentDesktop": D1, "active": "w1",
        "shown": {"DP-1": D1, "DP-2": D2},
        "layouts": {"%s|DP-1" % D1: {"layout": "dwindle"}, "%s|DP-2" % D2: {"layout": "master"}},
        "config": {"defaultLayout": "dwindle"},
        "windows": {
            "w1": window("%s|DP-1" % D1, "A"),
            "w2": window("%s|DP-2" % D2, "B"),
            "w3": window(None, "C", scratchpad="music", minimized=True, output="DP-1", workspace=D1),
        },
    }
    s.update(extra)
    return s


class Workspaces(unittest.TestCase):
    def test_a_row_per_monitor(self):
        rows = ctl.workspace_rows(state())
        self.assertEqual([(r["monitor"], r["workspace"], r["layout"], r["windows"], r["active"]) for r in rows],
                         [("DP-1", 1, "dwindle", 1, True), ("DP-2", 2, "master", 1, False)])

    def test_scratchpad_windows_belong_to_no_workspace(self):
        rows = ctl.workspace_rows(state())
        self.assertEqual(sum(r["windows"] for r in rows), 2, "C is in a scratchpad")

    def test_one_workspace_across_every_monitor(self):
        # Per-monitor workspaces turned off: HyprKwin reports no "shown" map.
        s = state(shown=None)
        s["windows"]["w2"] = window("%s|DP-2" % D1, "B")
        s["layouts"]["%s|DP-2" % D1] = {"layout": "monocle"}
        rows = ctl.workspace_rows(s)
        self.assertEqual([(r["monitor"], r["workspace"], r["layout"]) for r in rows],
                         [("DP-1", 1, "dwindle"), ("DP-2", 1, "monocle")])

    def test_a_layout_it_has_never_laid_out_falls_back_to_the_setting(self):
        s = state(layouts={})
        self.assertEqual({r["layout"] for r in ctl.workspace_rows(s)}, {"dwindle"})


class Windows(unittest.TestCase):
    def test_rows_carry_what_a_status_bar_needs(self):
        rows = ctl.window_rows(state())
        by_title = {r["title"]: r for r in rows}
        self.assertEqual(by_title["A"]["focused"], True)
        self.assertEqual(by_title["C"]["scratchpad"], "music")
        self.assertEqual([r["title"] for r in rows], ["A", "C", "B"], "sorted by monitor, then title")


class Keys(unittest.TestCase):
    def test_no_key_reads_as_empty(self):
        self.assertEqual(ctl.key_name([0]), "")
        self.assertEqual(ctl.key_name([]), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
