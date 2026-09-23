#!/usr/bin/env python3
"""Unit tests for the hyprland.conf importer.

    python3 tests/import_test.py
"""
import importlib.machinery
import tempfile
import unittest

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
imp = importlib.machinery.SourceFileLoader(
    "hyprkwin_import", str(ROOT / "tools/hyprkwin-import.py")).load_module()


def read(text, extra=None):
    """Translate a config given as text; extra files go beside it."""
    with tempfile.TemporaryDirectory() as d:
        conf = Path(d) / "hyprland.conf"
        conf.write_text(text)
        for name, body in (extra or {}).items():
            (Path(d) / name).write_text(body)
        items, unread = imp.read_config(conf)
        plan = imp.translate(items)
        plan["unread"] = unread
        return plan


class Settings(unittest.TestCase):
    def test_sections_and_values(self):
        plan = read("""
general {
    gaps_in = 4
    gaps_out = 8 8 8 8
    border_size = 3
    layout = master
}
decoration {
    rounding = 10
    active_opacity = 0.95
    blur {
        enabled = true
    }
}
master {
    mfact = 0.6
    orientation = center
    new_status = master
}
""")
        self.assertEqual(plan["settings"], {
            "GapsIn": "4", "GapsOut": "8", "BorderSize": "3", "DefaultLayout": "1",
            "BorderRadius": "10", "ActiveOpacity": "0.95",
            "MasterFactor": "0.6", "MasterOrientation": "4", "MasterNewIsMaster": "true",
        })

    def test_gradient_border(self):
        plan = read("general { col.active_border = rgba(33ccffee) rgba(00ff99ee) 45deg\n"
                    "col.inactive_border = rgb(595959) }")
        s = plan["settings"]
        self.assertEqual(s["ActiveBorderColor"], "51,204,255")
        self.assertEqual(s["ActiveBorderColor2"], "0,255,153")
        self.assertEqual((s["BorderGradientAngle"], s["ActiveBorderSource"]), ("45", "2"))
        self.assertEqual((s["InactiveBorderColor"], s["InactiveBorderSource"]), ("89,89,89", "1"))

    def test_a_value_it_cannot_read_is_reported(self):
        plan = read("dwindle { preserve_split = maybe }")
        self.assertEqual(plan["settings"], {})
        self.assertEqual(len(plan["notes"]), 1)
        self.assertIn("preserve_split", plan["notes"][0][0])

    def test_variables_and_source(self):
        plan = read("$gap = 7\nsource = other.conf\ngeneral { gaps_in = $gap }",
                    {"other.conf": "decoration { rounding = 2 }"})
        self.assertEqual(plan["settings"], {"GapsIn": "7", "BorderRadius": "2"})


class Rules(unittest.TestCase):
    def test_window_rules(self):
        plan = read("windowrulev2 = float, class:^(kcalc)$\n"
                    "windowrule = float, ^(pavucontrol)$\n"
                    "windowrulev2 = size 800 600, class:^(mpv)$, floating:1")
        self.assertEqual(plan["rules"], [
            "float, class:^(kcalc)$",
            "float, class:^(pavucontrol)$",
            "size 800 600, class:^(mpv)$, floating:1",
        ])

    def test_rules_it_cannot_translate_are_reported(self):
        plan = read("windowrulev2 = noanim, class:^(kitty)$\n"
                    "windowrulev2 = float, xwayland:1, class:^(steam)$")
        self.assertEqual(plan["rules"], ["float, class:^(steam)$"])
        self.assertEqual(len(plan["notes"]), 2)
        self.assertIn("noanim", plan["notes"][0][0])
        self.assertIn("xwayland:1", plan["notes"][1][0])

    def test_workspace_rules(self):
        plan = read("workspace = 3, monitor:DP-2, default:true, persistent:true\n"
                    "workspace = special:magic, gapsout:0\n"
                    "workspace = 2, layout:master")
        self.assertEqual(plan["workspaces"], ["3, monitor:DP-2, default:true", "2, layout:master"])
        self.assertEqual([n[0] for n in plan["notes"]],
                         ["workspace 3: dropped 'persistent:true'",
                          "workspace special:magic: HyprKwin's workspaces are numbered"])


class Binds(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(imp.key_sequence("SUPER", "Q"), "Meta+Q")
        self.assertEqual(imp.key_sequence("SUPER SHIFT", "1"), "Meta+!")
        self.assertEqual(imp.key_sequence("SUPER SHIFT", "left"), "Meta+Shift+Left")
        self.assertEqual(imp.key_sequence("SUPER ALT", "return"), "Meta+Alt+Return")
        self.assertEqual(imp.key_sequence("SUPER CTRL SHIFT", "minus"), "Meta+Ctrl+_")

    def test_dispatchers(self):
        plan = read("""
$mod = SUPER
bind = $mod, Q, killactive
bind = $mod, J, togglesplit
bind = $mod, left, movefocus, l
bind = $mod SHIFT, left, movewindow, l
binde = $mod, equal, resizeactive, 100 0
bind = $mod, 3, workspace, 3
bind = $mod SHIFT, 3, movetoworkspace, 3
bind = $mod, S, togglespecialworkspace
bind = $mod, M, layoutmsg, swapwithmaster
bind = $mod CTRL SHIFT, right, movewindow, mon:r
""")
        self.assertEqual(plan["binds"], [
            ("close", "Meta+Q", "hyprland.conf:3"),
            ("toggleSplit", "Meta+J", "hyprland.conf:4"),
            ("focusLeft", "Meta+Left", "hyprland.conf:5"),
            ("swapLeft", "Meta+Shift+Left", "hyprland.conf:6"),
            ("resizeRight", "Meta+=", "hyprland.conf:7"),
            ("desktop3", "Meta+3", "hyprland.conf:8"),
            ("moveToDesktop3", "Meta+#", "hyprland.conf:9"),
            ("toggleSpecial", "Meta+S", "hyprland.conf:10"),
            ("masterSwap", "Meta+M", "hyprland.conf:11"),
            ("windowToMonitorRight", "Meta+Ctrl+Shift+Right", "hyprland.conf:12"),
        ])

    def test_named_scratchpads_take_the_numbered_slots(self):
        plan = read("bind = SUPER, N, togglespecialworkspace, notes\n"
                    "bind = SUPER SHIFT, N, movetoworkspace, special:notes\n"
                    "bind = SUPER, M, togglespecialworkspace, music")
        self.assertEqual(plan["scratchpads"], ["notes", "music"])
        self.assertEqual([b[0] for b in plan["binds"]],
                         ["toggleScratchpad1", "moveToScratchpad1", "toggleScratchpad2"])

    def test_what_it_cannot_bind_is_reported(self):
        plan = read("bind = SUPER, RETURN, exec, kitty\n"
                    "bindm = SUPER, mouse:272, movewindow\n"
                    "bind = SUPER, R, submap, resize\n"
                    "bind = SUPER, K, movefocus, u\n"
                    "bind = SUPER ALT, K, movefocus, u")
        self.assertEqual([b[0] for b in plan["binds"]], ["focusUp"])
        reasons = [n[0] for n in plan["notes"]]
        self.assertIn("exec: HyprKwin has no such action", reasons[0])
        self.assertIn("mouse binds", reasons[1])
        self.assertIn("submap", reasons[2])
        self.assertIn("already bound", reasons[3])


class Fixes(unittest.TestCase):
    def test_previous_is_the_former_workspace(self):
        plan = read("bind = SUPER, grave, workspace, previous\nbind = SUPER, comma, workspace, e-1")
        self.assertEqual([b[0] for b in plan["binds"]], ["formerDesktop", "previousDesktop"])

    def test_a_glob_that_matches_a_folder_skips_it(self):
        with tempfile.TemporaryDirectory() as d:
            conf = Path(d) / "hyprland.conf"
            (Path(d) / "conf.d").mkdir()
            (Path(d) / "conf.d" / "gaps.conf").write_text("general { gaps_in = 3 }")
            (Path(d) / "conf.d" / "more").mkdir()
            conf.write_text("source = conf.d/*")
            items, notes = imp.read_config(conf)
            self.assertEqual(imp.translate(items)["settings"], {"GapsIn": "3"})
            self.assertIn("not a file", notes[0][0])


class Files(unittest.TestCase):
    def test_a_missing_file_is_reported_not_fatal(self):
        items, notes = imp.read_config(Path("/nonexistent/hyprland.conf"))
        self.assertEqual(items, [])
        self.assertIn("no such file", notes[0][0])

    def test_a_source_loop_ends(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d) / "a.conf", Path(d) / "b.conf"
            a.write_text("source = b.conf\ngeneral { gaps_in = 1 }")
            b.write_text("source = a.conf\ngeneral { gaps_out = 2 }")
            items, _ = imp.read_config(a)
            self.assertEqual(imp.translate(items)["settings"], {"GapsIn": "1", "GapsOut": "2"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
