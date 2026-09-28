#!/usr/bin/env python3
"""hyprkwin-shortcuts.py knows HyprKwin's default keys exactly as
shortcuts.js does (Plasma 6.6 does not record a key that was already taken,
so the tool has to). Needs deno, as the JS unit tests do."""
import importlib.util
import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("shortcuts", ROOT / "tools/hyprkwin-shortcuts.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class DefaultKeys(unittest.TestCase):
    @unittest.skipUnless(shutil.which("deno"), "needs deno")
    def test_same_as_shortcuts_js(self):
        js = subprocess.run(["deno", "eval", """
            const src = Deno.readTextFileSync("package/contents/code/shortcuts.js");
            const S = new Function(src + "\\nreturn { shortcutList, keyCode };")();
            const out = {};
            for (const s of S.shortcutList()) if (s.key && S.keyCode(s.key)) out[s.name] = S.keyCode(s.key);
            console.log(JSON.stringify(out));"""], cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertEqual(tool.default_keys(), json.loads(js.stdout))

    def test_key_codes(self):
        self.assertEqual(tool.key_code("Meta+Left"), 0x11000012)
        self.assertEqual(tool.key_code("Meta++"), 0x1000002B)
        self.assertEqual(tool.key_code("Meta+Alt+("), 0x18000028)
        self.assertEqual(tool.key_code("Ctrl+Alt+Shift+Tab"), 0x0F000001)
        self.assertEqual(tool.key_code("Meta+Hyper"), 0)


if __name__ == "__main__":
    sys.exit(unittest.main())
