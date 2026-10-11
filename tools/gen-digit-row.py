#!/usr/bin/env python3
"""Write package/contents/code/digitrow.js: what the digit row types on every
keyboard layout that differs there from US English, plain and with Shift.

HyprKwin's workspace keys are Meta with the digit row (Meta+1, Meta+Shift+1
for moving a window there). KDE matches a shortcut by the character a key
types, so on another layout Meta+Shift+3 is Meta+£, not Meta+#, and a US key
never fires. HyprKwin cannot ask the keyboard itself; this table, made from
the xkb data every Linux desktop ships, tells it.

    python3 tools/gen-digit-row.py

Run again when xkeyboard-config adds layouts; the output is checked in.
"""
import ctypes
import ctypes.util
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "package" / "contents" / "code" / "digitrow.js"
RULES = Path("/usr/share/X11/xkb/rules/evdev.xml")

xkb = ctypes.CDLL(ctypes.util.find_library("xkbcommon") or "libxkbcommon.so.0")


class RuleNames(ctypes.Structure):
    _fields_ = [(n, ctypes.c_char_p) for n in ("rules", "model", "layout", "variant", "options")]


xkb.xkb_context_new.restype = ctypes.c_void_p
xkb.xkb_context_new.argtypes = [ctypes.c_int]
xkb.xkb_keymap_new_from_names.restype = ctypes.c_void_p
xkb.xkb_keymap_new_from_names.argtypes = [ctypes.c_void_p, ctypes.POINTER(RuleNames), ctypes.c_int]
xkb.xkb_keymap_unref.argtypes = [ctypes.c_void_p]
xkb.xkb_keymap_key_get_syms_by_level.restype = ctypes.c_int
xkb.xkb_keymap_key_get_syms_by_level.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32,
                                                 ctypes.POINTER(ctypes.POINTER(ctypes.c_uint32))]
xkb.xkb_keysym_to_utf32.restype = ctypes.c_uint32
xkb.xkb_keysym_to_utf32.argtypes = [ctypes.c_uint32]
xkb.xkb_context_set_log_level.argtypes = [ctypes.c_void_p, ctypes.c_int]

# The digit row's keys: evdev KEY_1 … KEY_0 are 2 … 11, xkb adds 8.
KEYCODES = list(range(10, 20))


def row(ctx, layout, variant):
    names = RuleNames(b"evdev", b"pc105", layout.encode(), variant.encode(), None)
    keymap = xkb.xkb_keymap_new_from_names(ctx, ctypes.byref(names), 0)
    if not keymap:
        return None
    levels = []
    for level in (0, 1):
        chars = []
        for code in KEYCODES:
            syms = ctypes.POINTER(ctypes.c_uint32)()
            n = xkb.xkb_keymap_key_get_syms_by_level(keymap, code, 0, level, ctypes.byref(syms))
            cp = xkb.xkb_keysym_to_utf32(syms[0]) if n == 1 else 0
            # A dead key, or nothing: no character a shortcut could name.
            chars.append(chr(cp) if cp >= 0x21 else "")
        levels.append(chars)
    xkb.xkb_keymap_unref(keymap)
    return levels


def layouts():
    tree = ET.parse(RULES)
    for layout in tree.iter("layout"):
        name = layout.findtext("configItem/name")
        yield name, ""
        for variant in layout.iter("variant"):
            yield name, variant.findtext("configItem/name")


def main():
    ctx = xkb.xkb_context_new(0)
    xkb.xkb_context_set_log_level(ctx, 10)   # critical only: one layout ("custom") is a stub
    us = row(ctx, "us", "")
    table = {}
    for layout, variant in layouts():
        r = row(ctx, layout, variant)
        if r is None or r == us:
            continue
        key = layout + ("(" + variant + ")" if variant else "")
        table[key] = r
    # A variant the same as its layout adds nothing.
    for key in [k for k in table if "(" in k]:
        if table.get(key.split("(")[0]) == table[key]:
            del table[key]
    body = json.dumps(table, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    OUT.write_text(
        "// Made by tools/gen-digit-row.py from xkeyboard-config's layouts; do not\n"
        "// edit. What the digit row (1 … 0) types on each keyboard layout where it\n"
        "// differs from US English: [plain, with Shift], \"\" for a dead key.\n"
        "// Keyed \"layout\" or \"layout(variant)\"; a variant missing here types\n"
        "// what its layout does.\n"
        "var DIGIT_ROW = " + body + ";\n")
    print("%d layouts differ from US; %s, %d bytes" % (len(table), OUT.relative_to(ROOT), OUT.stat().st_size))


if __name__ == "__main__":
    sys.exit(main())
