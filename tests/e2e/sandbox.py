"""Headless nested KWin sandbox for end-to-end tests.

Starts `kwin_wayland --virtual` on a private D-Bus session with an isolated
XDG config/data dir, installs the HyprKwin package into it and drives it via
kglobalaccel (to invoke shortcuts) and the script's debug state dump.
Nothing here touches the running Plasma session.
"""
import json
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "package"
EFFECT_PACKAGE = ROOT / "package-effect"
CLIENT = Path(__file__).resolve().parent / "client.py"


class Sandbox:
    def __init__(self, base=None, width=1920, height=1080, outputs=1, config=None, scale=None,
                 effect=False, effect_config=None):
        base = base or os.environ.get("HK_SANDBOX") or os.path.join(os.environ.get("XDG_RUNTIME_DIR", "/tmp"), "hyprkwin-sandbox")
        self.base = Path(base)
        self.width, self.height, self.outputs = width, height, outputs
        self.scale = scale
        self.config = dict(config or {})
        # KWin builds its effect list at startup, so the effect package has to
        # be installed and enabled before the compositor launches.
        self.effect = effect
        self.effect_config = dict(effect_config or {})
        self.socket = "hyprkwin-test-%d" % os.getpid()
        self.proc = None
        self.clients = []
        self.env = None

    # -- lifecycle -----------------------------------------------------------

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.stop()

    def start(self):
        if self.base.exists():
            shutil.rmtree(self.base)
        (self.base / "config").mkdir(parents=True)
        (self.base / "data").mkdir(parents=True)
        self.log_path = self.base / "kwin.log"
        env = dict(os.environ)
        env.update({
            "XDG_CONFIG_HOME": str(self.base / "config"),
            "XDG_DATA_HOME": str(self.base / "data"),
            "QT_FORCE_STDERR_LOGGING": "1",
            "KWIN_SCREENSHOT_NO_PERMISSION_CHECKS": "1",
            # lets tests use org_kde_kwin_fake_input (see fakeinput.py)
            "KWIN_WAYLAND_NO_PERMISSION_CHECKS": "1",
        })
        env.pop("QT_QPA_PLATFORM", None)
        subprocess.run(["kpackagetool6", "--type=KWin/Script", "-i", str(PACKAGE)], env=env,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["kpackagetool6", "--type=KWin/Effect", "-i", str(EFFECT_PACKAGE)], env=env,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._write_config(env, "Plugins", {"hyprkwinEnabled": "true",
                                            "hyprkwinanimationsEnabled": "true" if self.effect else "false"})
        if self.effect_config:
            self._write_config(env, "Effect-hyprkwinanimations", self.effect_config)
        # A real decoration theme: KWin decorates script windows too, which
        # once broke the border strips and went unnoticed without one.
        self._write_config(env, "org.kde.kdecoration2", {"library": "org.kde.breeze", "theme": "Breeze"})
        self._write_config(env, "Script-hyprkwin", self.config)
        busfile = self.base / "bus"
        cmd = ("echo $DBUS_SESSION_BUS_ADDRESS > %s; exec kwin_wayland --virtual --no-lockscreen "
               "--socket %s --width %d --height %d --output-count %d%s" %
               (busfile, self.socket, self.width, self.height, self.outputs,
                (" --scale %s" % self.scale) if self.scale else ""))
        self.proc = subprocess.Popen(["dbus-run-session", "--", "bash", "-c", cmd], env=env,
                                     stdout=open(self.log_path, "w"), stderr=subprocess.STDOUT,
                                     start_new_session=True)
        for _ in range(100):
            if busfile.exists() and busfile.read_text().strip():
                break
            time.sleep(0.05)
        env["DBUS_SESSION_BUS_ADDRESS"] = busfile.read_text().strip()
        self.env = env
        for _ in range(100):
            if self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.isScriptLoaded", "hyprkwin",
                           check=False).strip() == "true":
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("HyprKwin did not load; see %s" % self.log_path)
        time.sleep(0.3)

    def stop(self):
        for c in self.clients:
            if c.poll() is None:
                c.kill()
        if self.proc and self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
        self.exit_code = self.proc.returncode if self.proc else None

    def crashed(self):
        """True if KWin crashed rather than exiting on our SIGTERM.

        The sandbox's direct child is dbus-run-session, so a KWin segfault
        never reaches us as an exit code: KCrash's own message does.
        """
        return "KCrash: Application" in self.log_path.read_text(errors="replace")

    def _write_config(self, env, group, values, file="kwinrc"):
        for k, v in values.items():
            if isinstance(v, (list, tuple)):
                # KConfig's list form, as a settings page saves a StringList.
                v = ",".join(str(x).replace("\\", "\\\\").replace(",", "\\,") for x in v)
            subprocess.run(["kwriteconfig6", "--file", file, "--group", group, "--key", k, str(v)],
                           env=env, check=True)

    def configure(self, **values):
        """Change script config and ask KWin to reconfigure (like the KCM does)."""
        self._write_config(self.env, "Script-hyprkwin", values)
        self._qdbus("org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure")
        time.sleep(0.5)

    def _qdbus(self, *args, check=True):
        r = subprocess.run(["qdbus6", *args], env=self.env, capture_output=True, text=True)
        if check and r.returncode != 0:
            raise RuntimeError("qdbus6 %s failed: %s" % (" ".join(args), r.stderr))
        return r.stdout

    # -- interaction --------------------------------------------------------------

    def spawn(self, title, app_id="hyprkwin.test", size="400x300", extra=(), wait=True, csd=False, color=None):
        env = dict(self.env)
        env["WAYLAND_DISPLAY"] = self.socket
        env["QT_QPA_PLATFORM"] = "wayland"
        if csd:
            # Draw its own decorations, like Chromium/Electron/GTK do.
            env["QT_WAYLAND_DECORATION"] = "bradient"
        if color:
            extra = (*extra, "--color", color)
        p = subprocess.Popen(["python3", str(CLIENT), "--title", title, "--app-id", app_id, "--size", size, *extra],
                             env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.clients.append(p)
        if wait:
            self.wait_for(lambda s: any(w["caption"] == title for w in s["windows"].values()), "window %s" % title)
            self.settle()
        return p

    def input(self):
        """Real keyboard/pointer input via KWin's fake-input protocol."""
        if not getattr(self, "_input", None):
            from fakeinput import FakeInput
            self._input = FakeInput(self.socket)
        return self._input

    def overlays(self):
        """Geometry of every HyprKwin overlay window KWin currently has.

        KWin's QML loader caches per directory, so each probe needs a fresh one.
        """
        d = self.base / ("probe-%d" % time.time_ns())
        d.mkdir(parents=True)
        (d / "main.qml").write_text("""import QtQuick
import org.kde.kwin
Item { Timer { interval: 100; running: true; onTriggered: {
  let n = 0;
  for (const w of Workspace.windows) if (w.pid <= 0 && !w.resourceClass && String(w.caption) === "HyprKwin overlay") {
    n++; const g = w.frameGeometry;
    console.warn("HKOVERLAY " + Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height));
  }
  console.warn("HKOVERLAYCOUNT " + n);
}}}
""")
        marker = self.log_path.read_text(errors="replace").count("HKOVERLAYCOUNT")
        name = "hk-probe-%d" % time.time_ns()
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadDeclarativeScript", str(d / "main.qml"), name)
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start")
        for _ in range(60):
            text = self.log_path.read_text(errors="replace")
            if text.count("HKOVERLAYCOUNT") > marker:
                lines = text.splitlines()
                start = max(i for i, l in enumerate(lines) if "HKOVERLAYCOUNT" in l)
                geoms = [l.split("HKOVERLAY ", 1)[1].strip() for l in lines[:start] if "HKOVERLAY " in l and "COUNT" not in l]
                count = int(lines[start].split("HKOVERLAYCOUNT ", 1)[1])
                self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", name)
                return geoms[-count:] if count else []
            time.sleep(0.05)
        raise RuntimeError("overlay probe did not report")

    def close_overlays(self):
        """Close overlay windows from outside, the way a later HyprKwin
        instance cleans up after an unloaded one."""
        d = self.base / ("sweep-%d" % time.time_ns())
        d.mkdir(parents=True)
        (d / "main.qml").write_text("""import QtQuick
import org.kde.kwin
Item { Timer { interval: 100; running: true; onTriggered: {
  for (const w of Workspace.windows) if (w.pid <= 0 && String(w.caption) === "HyprKwin overlay") w.closeWindow();
}}}
""")
        name = "hk-sweep-%d" % time.time_ns()
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadDeclarativeScript", str(d / "main.qml"), name)
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start")
        time.sleep(1)
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", name)

    def invoke(self, action, component="kwin", settle=True, raw=False):
        """Trigger a HyprKwin action, or any KWin shortcut by name with raw=True."""
        name = action if raw or component != "kwin" or action.startswith(("Window ", "Switch ")) else "HyprKwin " + action
        self._qdbus("org.kde.kglobalaccel", "/component/" + component,
                    "org.kde.kglobalaccel.Component.invokeShortcut", name)
        if settle:
            self.settle()

    def shortcut_keys(self):
        out = self._qdbus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component.shortcutNames")
        return out.split()

    def state(self):
        before = self.log_path.read_text(errors="replace").count("HYPRKWIN_STATE")
        self.invoke("dumpState", settle=False)
        for _ in range(100):
            text = self.log_path.read_text(errors="replace")
            if text.count("HYPRKWIN_STATE") > before:
                line = [l for l in text.splitlines() if "HYPRKWIN_STATE" in l][-1]
                try:
                    return json.loads(line.split("HYPRKWIN_STATE ", 1)[1])
                except json.JSONDecodeError:
                    pass  # KWin is still writing the line; read it again
            time.sleep(0.05)
        raise RuntimeError("no state dump")

    def settle(self, delay=0.35):
        time.sleep(delay)

    def wait_for(self, pred, what, timeout=8):
        end = time.time() + timeout
        while time.time() < end:
            s = self.state()
            if pred(s):
                return s
            time.sleep(0.15)
        raise AssertionError("timed out waiting for " + what)

    def window(self, title, state=None):
        state = state or self.state()
        for wid, w in state["windows"].items():
            if w["caption"] == title:
                w = dict(w)
                w["id"] = wid
                return w
        raise KeyError(title)

    def geometry(self, title, state=None):
        g = self.window(title, state)["geometry"]
        return (round(g["x"]), round(g["y"]), round(g["width"]), round(g["height"]))

    def output(self, name, action):
        """Turn a virtual output off or on, the way plugging a monitor does."""
        env = dict(self.env)
        env["WAYLAND_DISPLAY"] = self.socket
        subprocess.run(["kscreen-doctor", "output.%s.%s" % (name, action)], env=env, timeout=20,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def screenshot(self, path):
        env = dict(self.env)
        env["WAYLAND_DISPLAY"] = self.socket
        subprocess.run(["spectacle", "-b", "-n", "-f", "-o", str(path)], env=env, timeout=20,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def errors(self):
        text = self.log_path.read_text(errors="replace")
        return [l for l in text.splitlines()
                if re.search(r"(TypeError|ReferenceError|SyntaxError|Error:|hyprkwin.*error|main\.qml:\d+)", l)
                and "portal" not in l]
