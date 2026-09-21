#!/usr/bin/env python3
"""Retake docs/screenshot.png: stage a clean desktop in the nested test KWin
(real apps, a real Plasma panel, Breeze Dark) and screenshot it. Nothing on
your own desktop is involved, and nothing personal ends up in the picture.

    python3 tools/readme-screenshot.py [output.png]

Needs what the end-to-end tests need, plus alacritty, gwenview, fastfetch
and plasmashell.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "tests" / "e2e"))
from sandbox import Sandbox  # noqa: E402

out = str(Path(sys.argv[1]).resolve()) if len(sys.argv) > 1 else str(ROOT / "docs" / "screenshot.png")
with Sandbox(config={"BorderSize": 3, "BorderRadius": 10}) as sb:
    env = dict(sb.env)
    env.update(WAYLAND_DISPLAY=sb.socket, QT_QPA_PLATFORM="wayland")
    run = lambda *a: subprocess.run(a, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run("plasma-apply-colorscheme", "BreezeDark")
    run("plasma-apply-desktoptheme", "breeze-dark")
    run("kwriteconfig6", "--file", "kdeglobals", "--group", "Icons", "--key", "Theme", "breeze-dark")
    run("kwriteconfig6", "--file", "kdeglobals", "--group", "KDE", "--key", "LookAndFeelPackage", "org.kde.breezedark.desktop")

    def launch(*cmd, extra_env=None):
        e = dict(env, **(extra_env or {}))
        p = subprocess.Popen(cmd, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        sb.clients.append(p)
        return p

    # Konsole without its toolbars, Gwenview on a dark background.
    run("kwriteconfig6", "--file", "gwenviewrc", "--group", "ImageView", "--key", "BackgroundColorMode", "Dark")
    cfg = os.path.join(env["XDG_CONFIG_HOME"], "alacritty")
    os.makedirs(cfg, exist_ok=True)
    open(os.path.join(cfg, "alacritty.toml"), "w").write(
        "[window]\npadding = { x = 14, y = 12 }\n[font]\nsize = 11.0\n"
        "[colors.primary]\nbackground = '#1e2127'\nforeground = '#d8dee9'\n")
    rc = os.path.join(str(sb.base), "shot.bashrc")
    open(rc, "w").write("PS1='\\[\\e[1;36m\\]hyprkwin\\[\\e[0m\\] \\[\\e[1;34m\\]❯\\[\\e[0m\\] '\n")
    launch("plasmashell", "--no-respawn")
    time.sleep(10)

    fetch = ("fastfetch --structure OS:Kernel:DE:WM:WMTheme:Theme:Icons:Font:Terminal:Break:Colors; "
             "exec bash --noprofile --rcfile " + rc)
    launch("alacritty", "--title", "Alacritty", "--working-directory", str(os.getcwd()), "-e", "bash", "-c", fetch)
    sb.wait_for(lambda s: len(s["windows"]) >= 1, "terminal", timeout=20)
    time.sleep(2)
    # Plasma's stock wallpaper, cropped to the shape of the tile it lands in
    # so the viewer has no letterbox bars.
    from PIL import Image
    im = Image.open("/usr/share/wallpapers/Next/contents/images/5120x2880.png")
    h = int(im.width / 2.305)
    top = (im.height - h) // 2
    art = os.path.join(str(sb.base), "art")
    os.makedirs(art, exist_ok=True)
    pic = os.path.join(art, "Next.png")
    im.crop((0, top, im.width, top + h)).resize((2305, 1000)).save(pic)
    launch("gwenview", pic)
    sb.wait_for(lambda s: len(s["windows"]) >= 2, "gwenview", timeout=20)
    time.sleep(2)
    launch("systemsettings", "kcm_kwin_scripts")
    sb.wait_for(lambda s: len(s["windows"]) >= 3, "systemsettings", timeout=30)
    time.sleep(4)
    sb.invoke("focusLeft")
    time.sleep(2)
    s = sb.state()
    if not all(w["tiled"] for w in s["windows"].values()) or len(s["windows"]) != 3:
        sys.exit("expected three tiled windows, got: %r" % {w["caption"]: w["tiled"] for w in s["windows"].values()})
    sb.screenshot(out)
    from PIL import Image
    Image.open(out).convert("RGB").save(out, optimize=True)
    print("saved", out)
