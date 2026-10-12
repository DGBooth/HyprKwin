#!/usr/bin/env python3
"""Retake the README's screenshots and clips (docs/media/).

    python3 tools/showcase.py                    # every scene
    python3 tools/showcase.py dwindle layouts    # just these
    python3 tools/showcase.py --out DIR          # somewhere else

Each scene stages a clean desktop in the nested test KWin: real apps
(Alacritty, Dolphin, Gwenview), Breeze Dark, Plasma's own wallpaper and no
panel, with a gradient border. Dolphin shows a made-up home folder.
Nothing on your own desktop is involved, and nothing personal ends up in the
pictures, apart from fastfetch's list of this machine's hardware.

The stills are 2560x1440 PNGs. Each clip comes out twice: an MP4 at 1080p
(for Reddit and the like; not committed) and a small GIF for the README.
Clips are recorded with Plasma's animations at half speed and then played
back at twice the speed, so the animations come out smooth.

Needs what the end-to-end tests need, plus alacritty, dolphin, gwenview,
fastfetch, bat, plasmashell, ffmpeg and ImageMagick.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests" / "e2e"))
from sandbox import Sandbox  # noqa: E402

SCALE = 1.25                        # 2048x1152 logical = 2560x1440 pixels
CLIP_SLOW = 2                       # animations at half speed while recording
BORDER = {"ActiveBorderColor": "255,170,127", "ActiveBorderColor2": "255,170,255", "ActiveBorderSource": "2",
          "BorderRadius": "5", "BorderSize": "2", "FocusIndicator": "1", "HideTitleBars": "true",
          "GapsIn": "6", "GapsOut": "12"}
WALLPAPER = "/usr/share/wallpapers/Next/contents/images_dark/5120x2880.png"
# Tokyo Night.
ALACRITTY = """[colors.primary]
background = "#1a1b26"
foreground = "#a9b1d6"
[colors.normal]
black = "#1a1b26"
red = "#f7768e"
green = "#9ece6a"
yellow = "#e0af68"
blue = "#7aa2f7"
magenta = "#ad8ee6"
cyan = "#449dab"
white = "#a9b1d6"
[colors.bright]
black = "#414868"
red = "#f7768e"
green = "#9ece6a"
yellow = "#e0af68"
blue = "#7aa2f7"
magenta = "#ad8ee6"
cyan = "#0db9d7"
white = "#c0caf5"
[font]
normal = { family = "JetBrainsMono Nerd Font", style = "Regular" }
bold = { family = "JetBrainsMono Nerd Font", style = "Bold" }
size = 10
[window]
padding = { x = 14, y = 14 }
decorations = "None"
"""
FORMATS = {4: "BGRX", 5: "BGRA", 6: "BGRA", 16: "RGBX", 17: "RGBA", 18: "RGBA"}


class Stage:
    """The staged desktop: a home folder, a theme, plasmashell, and apps."""

    def __init__(self, sb, slow):
        self.sb = sb
        self.home = self._home()
        cfg = sb.base / "config"
        with open(cfg / "kdeglobals", "w") as f:
            f.write("[General]\nColorScheme=BreezeDark\n[Icons]\nTheme=breeze-dark\n[KDE]\n"
                    "AnimationDurationFactor=%s\nLookAndFeelPackage=org.kde.breezedark.desktop\n" % slow)
            f.write(Path("/usr/share/color-schemes/BreezeDark.colors").read_text())
        (cfg / "alacritty").mkdir(exist_ok=True)
        (cfg / "alacritty" / "alacritty.toml").write_text(ALACRITTY)
        (cfg / "fastfetch").mkdir(exist_ok=True)
        (cfg / "fastfetch" / "config.jsonc").write_text(
            '{"modules": ["os","kernel","wm","de","shell","terminal","cpu","gpu","memory","break","colors"]}')
        (self.home / ".bashrc").write_text("PS1='\\[\\e[38;2;255;170;170m\\]\\W\\[\\e[0m\\] ❯ '\n")
        self.env = dict(sb.env, WAYLAND_DISPLAY=sb.socket, QT_QPA_PLATFORM="wayland", HOME=str(self.home),
                        PATH=str(ROOT / "tools") + os.pathsep + os.environ["PATH"])
        self._places()

    def _home(self):
        home = self.sb.base / "home"
        for d in ["Desktop", "Documents", "Downloads", "Music", "Pictures/Wallpapers", "Projects/hyprkwin", "Videos"]:
            (home / d).mkdir(parents=True, exist_ok=True)
        for name in ["Air", "Horos", "Next"]:
            dest = home / "Pictures" / "Wallpapers" / ("%s.png" % name.lower())
            if not dest.exists():
                subprocess.run(["magick", "/usr/share/wallpapers/%s/contents/images/5120x2880.png" % name,
                                "-resize", "1920x1080", str(dest)], check=True)
        for f in ["notes.md", "todo.txt", "reading-list.md"]:
            (home / "Documents" / f).write_text("\n")
        project = home / "Projects" / "hyprkwin"
        for f in ["README.md", "CHANGELOG.md", "LICENSE"]:
            shutil.copy(ROOT / f, project / f)
        shutil.copytree(ROOT / "package", project / "package", dirs_exist_ok=True)
        return home

    def _places(self):
        """Dolphin's sidebar: the made-up home folder, and none of this
        machine's disks."""
        marks = "".join(
            '<bookmark href="file://%s"><title>%s</title><info><metadata owner="http://freedesktop.org">'
            '<bookmark:icon name="%s"/></metadata><metadata owner="http://www.kde.org"><ID>%d/0</ID>'
            '<isSystemItem>true</isSystemItem></metadata></info></bookmark>'
            % (self.home / sub, name, icon, i)
            for i, (sub, name, icon) in enumerate([
                ("", "Home", "user-home"), ("Desktop", "Desktop", "user-desktop"),
                ("Documents", "Documents", "folder-documents"), ("Downloads", "Downloads", "folder-download"),
                ("Music", "Music", "folder-music"), ("Pictures", "Pictures", "folder-pictures"),
                ("Projects", "Projects", "folder-development"), ("Videos", "Videos", "folder-videos")]))
        hidden = "".join("<GroupState-%s-IsHidden>true</GroupState-%s-IsHidden>" % (g, g)
                         for g in ["Devices", "RemovableDevices", "Remote", "RecentlySaved", "SearchFor", "Tags"])
        data = self.sb.base / "data"
        data.mkdir(exist_ok=True)
        (data / "user-places.xbel").write_text(
            '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE xbel>'
            '<xbel xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks"'
            ' xmlns:mime="http://www.freedesktop.org/standards/shared-mime-info"'
            ' xmlns:kdepriv="http://www.kde.org/kdepriv">'
            '<info><metadata owner="http://www.kde.org"><kde_places_version>4</kde_places_version>%s'
            '<withRecentlyUsed>true</withRecentlyUsed><withBaloo>true</withBaloo>'
            '</metadata></info>%s</xbel>' % (hidden, marks))

    def shell(self):
        """plasmashell for the wallpaper, without its panel. Drawn in
        software, as in the tests (see shell_env in run.py)."""
        self.sb.activity_manager()
        env = dict(self.env, QT_QUICK_BACKEND="software")
        self.sb.clients.append(subprocess.Popen(["plasmashell", "--no-respawn"], env=env,
                                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))

        def js(code):
            return subprocess.run(["qdbus6", "org.kde.plasmashell", "/PlasmaShell",
                                   "org.kde.PlasmaShell.evaluateScript", code],
                                  env=env, capture_output=True, text=True).stdout.strip()
        for _ in range(60):
            if js("print(panels().length)") == "1":
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("plasmashell's panel never came up")
        js("panels().forEach(p => p.remove())")
        js("desktops().forEach(d => { d.wallpaperPlugin = 'org.kde.image';"
           " d.currentConfigGroup = ['Wallpaper', 'org.kde.image', 'General'];"
           " d.writeConfig('Image', 'file://%s'); })" % WALLPAPER)
        time.sleep(3)

    def run(self, title, cmd):
        """Start an app and wait until HyprKwin has a window with this
        title."""
        self.sb.clients.append(subprocess.Popen(cmd, env=self.env, cwd=str(self.home),
                                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        self.sb.wait_for(lambda s: any(title in (w["caption"] or "") for w in s["windows"].values()),
                         title, timeout=20)
        self.sb.settle(0.8)

    def term(self, title, command):
        self.run(title, ["alacritty", "--title", title, "-e", "bash", "-c", command])

    def windows(self, n=5):
        """The usual set of windows, the first n of them."""
        apps = [
            # Drawn again when the tile changes size, with a small logo in a
            # narrow one, so it never wraps.
            lambda: self.term("fastfetch", "ff() { clear; if [ $(tput cols) -lt 100 ]; then "
                                           "fastfetch --logo arch_small; else fastfetch; fi; }; "
                                           "trap ff WINCH; ff; while :; do sleep 0.2; done"),
            lambda: self.run("Dolphin", ["dolphin", str(self.home / "Pictures" / "Wallpapers")]),
            lambda: self.term("engine.js", "cd ~/Projects/hyprkwin; bat --theme=OneHalfDark "
                                           "--style=numbers,header --paging=always --pager='less -R' "
                                           "package/contents/code/engine.js"),
            lambda: self.term("hyprkwinctl", "watch -t -c -n 1 'hyprkwinctl workspaces; echo; hyprkwinctl windows'"),
            lambda: self.run("Gwenview", ["gwenview", str(self.home / "Pictures" / "Wallpapers" / "horos.png")]),
        ]
        for start in apps[:n]:
            start()


class Recorder:
    """Grabs frames straight from KWin in the background, with the time of
    each, while the with-block runs."""

    def __init__(self, sb, fps=15):
        import dbus
        bus = dbus.bus.BusConnection(sb.env["DBUS_SESSION_BUS_ADDRESS"])
        self.shot = dbus.Interface(bus.get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2"),
                                   "org.kde.KWin.ScreenShot2")
        self.fps, self.frames, self.on = fps, [], False

    def grab(self):
        import dbus
        read, write = os.pipe()
        try:
            info = self.shot.CaptureWorkspace(dbus.Dictionary({}, signature="sv"), dbus.types.UnixFd(write),
                                              timeout=20)
        finally:
            os.close(write)
        with os.fdopen(read, "rb") as f:
            data = f.read()
        return time.time(), info, data

    def __enter__(self):
        self.on = True
        self.thread = threading.Thread(target=self._loop)
        self.thread.start()
        return self

    def _loop(self):
        while self.on:
            t0 = time.time()
            self.frames.append(self.grab())
            time.sleep(max(0, 1 / self.fps - (time.time() - t0)))

    def __exit__(self, *exc):
        self.on = False
        self.thread.join()

    def save(self, out, name, slow):
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            lines = []
            for i, (t, info, data) in enumerate(self.frames):
                w, h, stride, fmt = (int(info[k]) for k in ("width", "height", "stride", "format"))
                img = Image.frombuffer("RGBA", (w, h), data, "raw", FORMATS[fmt], stride, 1)
                img.convert("RGB").resize((1920, 1080), Image.LANCZOS).save(tmp / ("%04d.png" % i))
                after = self.frames[i + 1][0] if i + 1 < len(self.frames) else t + 1 / self.fps
                lines.append("file '%04d.png'\nduration %.4f" % (i, (after - t) / slow))
            lines.append("file '%04d.png'" % (len(self.frames) - 1))
            (tmp / "list.txt").write_text("\n".join(lines) + "\n")
            mp4 = out / (name + ".mp4")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                            "-i", str(tmp / "list.txt"), "-vf", "fps=30,format=yuv420p",
                            "-c:v", "libx264", "-crf", "18", "-preset", "slow", str(mp4)], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-vf",
                        "fps=20,scale=960:-1:flags=lanczos,split[a][b];"
                        "[a]palettegen=max_colors=128:stats_mode=diff[p];"
                        "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
                        str(out / (name + ".gif"))], check=True)


SCENES = {}


def scene(name, clip=False, **config):
    """A still (fn(sb, stage)) or a clip (fn(sb, stage, recorder)), with
    HyprKwin settings on top of BORDER."""
    def wrap(fn):
        def run(out):
            slow = CLIP_SLOW if clip else 1
            with Sandbox(width=2048, height=1152, scale=SCALE, effect=True, config=dict(BORDER, **config)) as sb:
                Stage(sb, slow)
                sb.restart()                    # so KWin starts on Breeze Dark
                stage = Stage(sb, slow)
                stage.shell()
                if clip:
                    rec = Recorder(sb)
                    fn(sb, stage, rec)
                    rec.save(out, name, slow)
                else:
                    fn(sb, stage)
                    time.sleep(2.5)
                    sb.screenshot(out / (name + ".png"))
                errors = [e for e in sb.errors() if "bluez" not in e]
                if errors:
                    raise RuntimeError("%s: HyprKwin errors: %s" % (name, errors[:3]))
            print(name, flush=True)
        SCENES[name] = run
        return fn
    return wrap


def play(sb, steps):
    """Actions with pauses (in played-back seconds) between them."""
    for action, pause in steps:
        sb.invoke(action, settle=False)
        time.sleep(pause * CLIP_SLOW)


def focus(sb, caption):
    """Give this window the focus, as a click on it would."""
    got = sb.kwin_js("(function () { for (const w of Workspace.stackingOrder) if (w.caption.includes(%r))"
                     " { Workspace.activeWindow = w; return 'ok'; } return 'none'; })()" % caption)
    if got != "ok":
        raise RuntimeError("no window %s" % caption)
    sb.settle(0.5)


@scene("dwindle")
def _(sb, st):
    st.windows()
    sb.invoke("focusLeft")


@scene("master", DefaultLayout="1", MasterOrientation="4", MasterFactor="0.5")
def _(sb, st):
    st.windows()
    focus(sb, "engine.js")
    sb.invoke("masterSwap")
    sb.settle(1)


@scene("groups")
def _(sb, st):
    st.windows()
    sb.invoke("focusLeft")
    sb.invoke("toggleGroup")
    sb.invoke("focusRight")
    sb.invoke("intoGroupLeft")
    sb.settle(1)


@scene("keys")
def _(sb, st):
    st.windows(4)
    sb.invoke("showKeys", settle=False)


@scene("tiling", clip=True)
def _(sb, st, rec):
    time.sleep(1)
    with rec:
        time.sleep(0.6)
        st.windows()
        play(sb, [("swapLeft", 0.3), ("toggleSplit", 0.3), ("toggleFloating", 0.4), ("toggleFloating", 0.6)])


@scene("layouts", clip=True)
def _(sb, st, rec):
    st.windows(4)
    time.sleep(1.5)
    with rec:
        time.sleep(1.2)
        play(sb, [("layoutMaster", 1.6),
                  ("masterOrientationNext", 0.1), ("masterOrientationNext", 0.1),
                  ("masterOrientationNext", 0.1), ("masterOrientationNext", 1.6),
                  ("layoutMonocle", 1.0), ("cycleNext", 0.8), ("cycleNext", 1.2),
                  ("layoutScrolling", 1.2), ("focusLeft", 0.8), ("focusLeft", 0.8), ("focusLeft", 1.2),
                  ("layoutDwindle", 1.6)])


@scene("scratchpad", clip=True)
def _(sb, st, rec):
    st.windows(3)
    sb.invoke("desktop2")
    st.term("about", "clear; fastfetch --logo none; exec bash")
    st.run("Gwenview", ["gwenview", str(st.home / "Pictures" / "Wallpapers" / "air.png")])
    sb.invoke("desktop1")
    st.term("scratch", "clear; cal -3; exec bash")
    sb.invoke("moveToSpecial")
    sb.settle(1)
    time.sleep(1.5)
    with rec:
        time.sleep(1.0)
        play(sb, [("toggleSpecial", 1.5), ("toggleSpecial", 1.2), ("desktop2", 1.5),
                  ("toggleSpecial", 1.5), ("toggleSpecial", 0.8), ("desktop1", 1.5)])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("scenes", nargs="*", metavar="SCENE", help="any of: " + ", ".join(SCENES))
    ap.add_argument("--out", default=str(ROOT / "docs" / "media"))
    args = ap.parse_args()
    unknown = [s for s in args.scenes if s not in SCENES]
    if unknown:
        ap.error("no scene %s (there are: %s)" % (", ".join(unknown), ", ".join(SCENES)))
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for name in args.scenes or SCENES:
        SCENES[name](out)


if __name__ == "__main__":
    main()
