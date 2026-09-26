#!/usr/bin/env python3
"""Take docs/zoom.png: the zoom feature, before and after, side by side.

A clean desktop is staged in the nested test KWin (real apps, a real Plasma
panel, Breeze Dark) as for docs/screenshot.png; nothing on your own desktop is
involved. Five windows are tiled, the two smallest show as their app's icon,
then Meta+Z twice zooms to the corner they are in.

    python3 tools/zoom-screenshot.py [output.png]

Needs what the end-to-end tests need, plus alacritty, gwenview, dolphin,
konsole, fastfetch and plasmashell.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "tests" / "e2e"))
from sandbox import Sandbox  # noqa: E402

out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "docs" / "zoom.png"
config = {"BorderSize": 3, "BorderRadius": 10, "IconBelow": 300, "OsdDuration": 20000}

with Sandbox(config=config) as sb:
    env = dict(sb.env)
    env.update(WAYLAND_DISPLAY=sb.socket, QT_QPA_PLATFORM="wayland")
    run = lambda *a: subprocess.run(a, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run("plasma-apply-colorscheme", "BreezeDark")
    run("plasma-apply-desktoptheme", "breeze-dark")
    run("kwriteconfig6", "--file", "kdeglobals", "--group", "Icons", "--key", "Theme", "breeze-dark")
    run("kwriteconfig6", "--file", "kdeglobals", "--group", "KDE", "--key", "LookAndFeelPackage", "org.kde.breezedark.desktop")
    run("kwriteconfig6", "--file", "gwenviewrc", "--group", "ImageView", "--key", "BackgroundColorMode", "Dark")

    def launch(*cmd):
        p = subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        sb.clients.append(p)
        return p

    def opened(n, what, wait=2.0):
        sb.wait_for(lambda s: len(s["windows"]) >= n, what, timeout=30)
        time.sleep(wait)

    cfg = os.path.join(env["XDG_CONFIG_HOME"], "alacritty")
    os.makedirs(cfg, exist_ok=True)
    open(os.path.join(cfg, "alacritty.toml"), "w").write(
        "[window]\npadding = { x = 14, y = 12 }\n[font]\nsize = 11.0\n"
        "[colors.primary]\nbackground = '#1e2127'\nforeground = '#d8dee9'\n")
    rc = os.path.join(str(sb.base), "shot.bashrc")
    open(rc, "w").write("PS1='\\[\\e[1;36m\\]hyprkwin\\[\\e[0m\\] \\[\\e[1;34m\\]❯\\[\\e[0m\\] '\n")
    launch("plasmashell", "--no-respawn")
    time.sleep(10)

    # Something to look at in each window, and nothing personal: the repo.
    fetch = ("fastfetch --structure OS:Kernel:DE:WM:Theme:Icons:Terminal:Break:Colors; "
             "exec bash --noprofile --rcfile " + rc)
    launch("alacritty", "--title", "Alacritty", "--working-directory", str(ROOT), "-e", "bash", "-c", fetch)
    opened(1, "terminal")
    wall = Image.open("/usr/share/wallpapers/Next/contents/images/5120x2880.png")
    art = os.path.join(str(sb.base), "art")
    os.makedirs(art, exist_ok=True)
    pic = os.path.join(art, "Next.png")
    wall.resize((1920, 1080)).save(pic)
    launch("gwenview", pic)
    opened(2, "gwenview")
    launch("dolphin", "--new-window", str(ROOT))
    opened(3, "dolphin", 3)
    launch("systemsettings", "kcm_kwin_scripts")
    opened(4, "system settings", 4)
    launch("konsole", "--workdir", str(ROOT), "-e", "bash", "--noprofile", "--rcfile", rc)
    opened(5, "konsole", 3)

    s = sb.state()
    if not all(w["tiled"] for w in s["windows"].values()) or len(s["windows"]) != 5:
        sys.exit("expected five tiled windows, got: %r" % {w["caption"]: w["tiled"] for w in s["windows"].values()})
    if len(s["iconTiles"]) < 2:
        sys.exit("expected the two smallest tiles as icons, got %r" % (s["iconTiles"],))

    before = sb.base / "before.png"
    sb.screenshot(before)

    # Focus Dolphin, then zoom twice: to the right half, then to Dolphin's
    # corner with the two small windows beside it.
    dolphin = next(wid for wid, w in s["windows"].items() if "Dolphin" in w["caption"] or w["class"].endswith("dolphin"))
    sb.invoke("focusLeft")                  # off Konsole, onto whatever is left of it
    for _ in range(4):
        if sb.state()["active"] == dolphin:
            break
        sb.invoke("focusLeft")
    sb.invoke("zoomIn")
    sb.invoke("zoomIn")
    time.sleep(1.5)
    after = sb.base / "after.png"
    sb.screenshot(after)
    zoom = next(iter(sb.state()["layouts"].values()))["zoom"]
    print("zoom:", zoom)

# Side by side, each labelled.
W, H, pad, label = 1600, 900, 36, 64
canvas = Image.new("RGB", (W * 2 + pad * 3, H + label + pad * 2), (24, 26, 31))
try:
    face = subprocess.run(["fc-match", "sans-serif:bold", "-f", "%{file}"], capture_output=True, text=True).stdout
    font = ImageFont.truetype(face, 34)
except OSError:
    font = ImageFont.load_default(size=34)
draw = ImageDraw.Draw(canvas)
for i, (path, text) in enumerate([(before, "Five windows — the smallest show as their app's icon"),
                                   (after, "Meta+Z twice: that corner fills the screen")]):
    x = pad + i * (W + pad)
    canvas.paste(Image.open(path).convert("RGB").resize((W, H), Image.LANCZOS), (x, pad + label))
    draw.text((x, pad + 8), text, font=font, fill=(216, 222, 233))
out.parent.mkdir(parents=True, exist_ok=True)
canvas.save(out, optimize=True)
print("saved", out)
