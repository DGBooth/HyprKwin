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


def kactivitymanagerd():
    for p in ("/usr/lib/kactivitymanagerd", "/usr/libexec/kactivitymanagerd",
              "/usr/lib/x86_64-linux-gnu/libexec/kactivitymanagerd"):
        if os.path.exists(p):
            return p
    return shutil.which("kactivitymanagerd") or "/nonexistent/kactivitymanagerd"


# Nothing the tests start leaves a core dump behind. With a core size limit
# of exactly 1 the kernel skips the machine's dump handler (systemd-coredump)
# altogether, where 0 still reaches it - and from there KDE's crash reporter,
# which would show a test KWin's crash on the desktop as the desktop's own.
# A crash still fails its test: run.py looks for KCrash in KWin's log.
try:
    import resource
    _, _hard = resource.getrlimit(resource.RLIMIT_CORE)
    resource.setrlimit(resource.RLIMIT_CORE, (1, _hard if _hard == resource.RLIM_INFINITY or _hard >= 1 else 1))
except (ImportError, ValueError, OSError):
    pass

MESA_EGL = "/usr/share/glvnd/egl_vendor.d/50_mesa.json"


def mesa_gpu():
    """Environment that keeps the nested KWin (and its Xwayland and apps) on
    a GPU Mesa drives, such as an integrated one, when this machine has one
    beside an NVIDIA card: off the card the desktop and everything else on it
    use, whose memory can run out under them. HK_ANY_GPU=1 leaves the choice
    to KWin."""
    if os.environ.get("HK_ANY_GPU") == "1" or not os.path.exists(MESA_EGL):
        return {}
    nodes = sorted(Path("/dev/dri").glob("renderD*")) if Path("/dev/dri").exists() else []
    drivers = {}
    for node in nodes:
        try:
            drivers[node] = os.path.basename(os.path.realpath("/sys/class/drm/%s/device/driver" % node.name))
        except OSError:
            pass
    if "nvidia" not in drivers.values():
        return {}
    mesa = [n for n, d in drivers.items() if d != "nvidia"]
    if not mesa:
        return {}
    return {"__EGL_VENDOR_LIBRARY_FILENAMES": MESA_EGL, "__GLX_VENDOR_LIBRARY_NAME": "mesa",
            "KWIN_RENDER_NODES": str(mesa[0])}


class Skip(Exception):
    """This test cannot run here (not a failure): say why, and move on."""


class Sandbox:
    def __init__(self, base=None, width=1920, height=1080, outputs=1, config=None, scale=None,
                 effect=False, effect_config=None, xwayland=False, native_desktops=False,
                 activities=0, keyboard=None, kwinrc=None, install_effect=True, package=None,
                 effect_package=None):
        base = base or os.environ.get("HK_SANDBOX") or os.path.join(os.environ.get("XDG_RUNTIME_DIR", "/tmp"), "hyprkwin-sandbox")
        self.base = Path(base)
        self.width, self.height, self.outputs = width, height, outputs
        self.scale = scale
        # X11 apps (Albert runs as one) need KWin's Xwayland.
        self.xwayland = xwayland
        self.x_display = None
        # The tests read HyprKwin's state from its log; in a real session it
        # only goes to hyprkwinctl, over D-Bus.
        # WarnKeyConflicts: the sandbox has Plasma's clashing keys too, and
        # the message about them would appear in every test.
        # AnimationsNotice too: the effect is off in most tests.
        self.config = dict({"StateToLog": "true", "WarnKeyConflicts": "false", "AnimationsNotice": "false"},
                           **(config or {}))
        # HK_NATIVE=1 runs every test with KWin's native per-screen desktops.
        self.native_desktops = native_desktops or os.environ.get("HK_NATIVE") == "1"
        # KWin builds its effect list at startup, so the effect package has to
        # be installed and enabled before the compositor launches.
        self.effect = effect
        self.effect_config = dict(effect_config or {})
        # Plasma's activities: kactivitymanagerd runs in the sandbox, with
        # this many activities, and KWin starts on the first.
        self.activities = activities
        self.activity_ids = []
        # A keyboard layout other than US, e.g. "gb" or ("fr", "azerty").
        self.keyboard = keyboard
        # Whether the animations effect is installed at all (it is enabled
        # only with effect=True).
        self.install_effect = install_effect
        # The packages to install: this checkout's, or another version's
        # (the upgrade rehearsals).
        self.package = Path(package) if package else PACKAGE
        self.effect_package = Path(effect_package) if effect_package else EFFECT_PACKAGE
        # KWin's own settings, {group: {key: value}}, e.g. its focus policy.
        self.kwinrc = kwinrc or {}
        self.socket = "hyprkwin-test-%d" % os.getpid()
        self.proc = None
        self.clients = []
        self.env = None

    # -- lifecycle -----------------------------------------------------------

    def __enter__(self):
        # A KWin left running by a start that failed half way would take the
        # socket and runtime folder from every test after it.
        try:
            self.start()
        except BaseException:
            self.stop()
            raise
        return self

    def __exit__(self, *exc):
        self.stop()

    def start(self):
        # The previous KWin may still be writing its config as it exits.
        for attempt in range(20):
            try:
                if self.base.exists():
                    shutil.rmtree(self.base)
                break
            except OSError:
                if attempt == 19:
                    raise
                time.sleep(0.25)
        (self.base / "config").mkdir(parents=True)
        (self.base / "data").mkdir(parents=True)
        self.log_path = self.base / "kwin.log"
        env = dict(os.environ)
        env.update({
            "XDG_CONFIG_HOME": str(self.base / "config"),
            "XDG_DATA_HOME": str(self.base / "data"),
            # Caches and state too: KWin's crash handler writes its notes on
            # a crash to the cache, and the desktop's crash reporter would
            # take a test KWin's crash for its own.
            "XDG_CACHE_HOME": str(self.base / "cache"),
            "XDG_STATE_HOME": str(self.base / "state"),
            "QT_FORCE_STDERR_LOGGING": "1",
            "KWIN_SCREENSHOT_NO_PERMISSION_CHECKS": "1",
            # lets tests use org_kde_kwin_fake_input (see fakeinput.py)
            "KWIN_WAYLAND_NO_PERMISSION_CHECKS": "1",
            # Keep everything the tests start (KWin, a nested plasmashell and
            # its volume applet) away from this machine's sound server.
            "PIPEWIRE_RUNTIME_DIR": str(self.base / "no-audio"),
            "PULSE_SERVER": "unix:" + str(self.base / "no-audio" / "native"),
        })
        env.pop("QT_QPA_PLATFORM", None)
        env.update(mesa_gpu())
        # Nothing in the sandbox may reach this machine's own session: D-Bus
        # starts services on demand (kactivitymanagerd, when KWin asks for
        # it) with this environment, and they would open their windows there.
        for var in ("WAYLAND_DISPLAY", "DISPLAY", "WAYLAND_SOCKET"):
            env.pop(var, None)
        subprocess.run(["kpackagetool6", "--type=KWin/Script", "-i", str(self.package)], env=env,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if self.install_effect:
            subprocess.run(["kpackagetool6", "--type=KWin/Effect", "-i", str(self.effect_package)], env=env,
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._write_config(env, "Plugins", {"hyprkwinEnabled": "true",
                                            "hyprkwinanimationsEnabled": "true" if self.effect else "false"})
        if self.effect_config:
            self._write_config(env, "Effect-hyprkwinanimations", self.effect_config)
        # A real decoration theme: KWin decorates script windows too, which
        # once broke the border strips and went unnoticed without one.
        self._write_config(env, "org.kde.kdecoration2", {"library": "org.kde.breeze", "theme": "Breeze"})
        self._write_config(env, "Script-hyprkwin", self.config)
        for group, values in self.kwinrc.items():
            self._write_config(env, group, values)
        if self.keyboard:
            layout, variant = (self.keyboard, "") if isinstance(self.keyboard, str) else self.keyboard
            self._write_config(env, "Layout", {"Use": "true", "LayoutList": layout, "VariantList": variant},
                               file="kxkbrc")
        if self.native_desktops:
            # Plasma 6.7's own per-screen virtual desktops.
            self._write_config(env, "Windows", {"PerOutputVirtualDesktops": "true"})
        if "/.." in str(self.config.get("BuildId", "")):
            # A decoy for the test that BuildId cannot leave the package.
            decoy = self.base / "data" / "evil" / "ui"
            decoy.mkdir(parents=True)
            (decoy / "HyprKwin.qml").write_text(
                'import QtQuick\nItem { Component.onCompleted: console.warn("HKEVIL") }\n')
        self._prepared_env = env
        self._launch(env)

    def _launch(self, env):
        env = dict(env)
        busfile = self.base / "bus"
        if busfile.exists():
            busfile.unlink()
        displayfile = self.base / "x-display"
        if displayfile.exists():
            displayfile.unlink()
        # With Xwayland, KWin runs the trailing command once it is up, with
        # DISPLAY set to the X server it started.
        xwayland = ""
        if self.xwayland:
            helper = self.base / "report-display.sh"
            helper.write_text('#!/bin/sh\necho "$DISPLAY" > "%s"\n' % displayfile)
            helper.chmod(0o755)
            xwayland = " --xwayland %s" % helper
        if self.activities and not os.path.exists(kactivitymanagerd()):
            raise Skip("needs kactivitymanagerd")
        cmd = ("echo $DBUS_SESSION_BUS_ADDRESS > %s; exec kwin_wayland --virtual --no-lockscreen "
               "--socket %s --width %d --height %d --output-count %d%s%s" %
               (busfile, self.socket, self.width, self.height, self.outputs,
                (" --scale %s" % self.scale) if self.scale else "", xwayland))
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
        # The script's entry point loads even when HyprKwin.qml cannot (a QML
        # module missing), and then nothing works; say so rather than fail on
        # every state dump.
        time.sleep(0.3)
        broken = re.search(r"contents/ui/\w+\.qml:\d+:\d+: .*", self.log_path.read_text(errors="replace"))
        if broken:
            raise RuntimeError("HyprKwin's QML did not load: %s" % broken.group(0).split("/contents/")[-1])
        if self.xwayland:
            for _ in range(100):
                if displayfile.exists() and displayfile.read_text().strip():
                    self.x_display = displayfile.read_text().strip()
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError("Xwayland did not start; see %s" % self.log_path)
        time.sleep(0.3)
        if self.activities:
            self._make_activities()
        if self.outputs > 1:
            # A real setup has a primary monitor, and a new session starts on
            # it; the virtual outputs come up in no particular order. Make the
            # left one primary, start the pointer there, and let HyprKwin
            # start again as a login would.
            self.output("Virtual-0", "priority.1")
            self.input().move_to(self.width // 2, self.height // 2)
            time.sleep(0.2)
            self.reload_script()

    def restart(self):
        """KWin stops and starts again on the same settings and data: the
        next login, as far as HyprKwin can tell."""
        self.stop()
        self.clients = []
        if getattr(self, "_input", None):
            self._input = None
        self._launch(self._prepared_env)

    def upgrade(self, package=None, effect_package=None):
        """Replace the installed packages, as the KDE Store's "Get New…"
        does; the running KWin goes on with what it has until restart()."""
        env = dict(self._prepared_env)
        for kind, pkg in (("KWin/Script", package or PACKAGE), ("KWin/Effect", effect_package or EFFECT_PACKAGE)):
            subprocess.run(["kpackagetool6", "--type=" + kind, "-u", str(pkg)], env=env, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _activity_call(self, method, *args, check=True):
        return self._qdbus("org.kde.ActivityManager", "/ActivityManager/Activities",
                           "org.kde.ActivityManager.Activities." + method, *args, check=check).strip()

    def activity_manager(self):
        """Make sure kactivitymanagerd runs on the sandbox's bus, as
        plasmashell needs it to load a shell at all. Left to D-Bus to start,
        it would look for a display: none in a container, or this machine's
        own session."""
        # Asked about the name, not the daemon: a call to it would have D-Bus
        # start it, with no display - and its failure ("ChildSignaled") comes
        # back on standard output like any answer.
        def owned():
            return self._qdbus("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus.NameHasOwner",
                               "org.kde.ActivityManager", check=False).strip() == "true"
        if not owned():
            if not os.path.exists(kactivitymanagerd()):
                raise Skip("needs kactivitymanagerd")
            env = dict(self.env, QT_QPA_PLATFORM="offscreen")
            env.pop("WAYLAND_DISPLAY", None)
            env.pop("DISPLAY", None)
            self.clients.append(subprocess.Popen([kactivitymanagerd()], env=env, stdout=subprocess.DEVNULL,
                                                 stderr=subprocess.DEVNULL))
        for _ in range(100):
            if owned():
                r = subprocess.run(["qdbus6", "org.kde.ActivityManager", "/ActivityManager/Activities",
                                    "org.kde.ActivityManager.Activities.CurrentActivity"],
                                   env=self.env, capture_output=True, text=True)
                if r.returncode == 0 and r.stdout.strip():
                    return
            time.sleep(0.1)
        raise RuntimeError("kactivitymanagerd did not start")

    def _make_activities(self):
        self.activity_manager()
        ids = self._activity_call("ListActivities").split()
        while len(ids) < self.activities:
            self._activity_call("AddActivity", "Activity %d" % (len(ids) + 1))
            ids = self._activity_call("ListActivities").split()
        # In the order they were made, the first being the one we are on.
        cur = self._activity_call("CurrentActivity")
        self.activity_ids = [cur] + [i for i in ids if i != cur]
        for _ in range(50):
            if self.kwin_js("Workspace.activities.length") == str(len(ids)):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("KWin does not see the activities")

    def activity(self, n=None):
        """Switch to activity n (from 1), or say which one is current."""
        if n is None:
            cur = self._activity_call("CurrentActivity")
            return self.activity_ids.index(cur) + 1 if cur in self.activity_ids else 0
        self._activity_call("SetCurrentActivity", self.activity_ids[n - 1])
        self.settle()

    def kwin_js(self, expr):
        """Evaluate a JavaScript expression inside KWin (Workspace in scope)
        and return what it gives, as a string."""
        d = self.base / ("js-%d" % time.time_ns())
        d.mkdir(parents=True)
        (d / "main.qml").write_text("""import QtQuick
import org.kde.kwin
Item { Timer { interval: 50; running: true; onTriggered: {
  let out;
  try { out = String((function () { return %s; })()); } catch (e) { out = "ERROR " + e; }
  console.warn("HKJS " + out.replace(/\\n/g, " "));
  console.warn("HKJSDONE");
}}}
""" % expr)
        marker = self.log_path.read_text(errors="replace").count("HKJSDONE")
        name = "hk-js-%d" % time.time_ns()
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadDeclarativeScript", str(d / "main.qml"), name)
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start")
        for _ in range(60):
            text = self.log_path.read_text(errors="replace")
            if text.count("HKJSDONE") > marker:
                lines = [l for l in text.splitlines() if "HKJS " in l]
                self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", name)
                return lines[-1].split("HKJS ", 1)[1].strip()
            time.sleep(0.05)
        raise RuntimeError("script probe did not report")

    def stop(self):
        for c in self.clients:
            if c.poll() is None:
                c.kill()
        # Gone before the next sandbox clears the folder they write in.
        for c in self.clients:
            try:
                c.wait(5)
            except subprocess.TimeoutExpired:
                pass
        if self.proc and self.proc.poll() is None:
            os.killpg(self.proc.pid, signal.SIGTERM)
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
                self.proc.wait(5)
        self.exit_code = self.proc.returncode if self.proc else None
        if self.proc:
            self._end_session(self.proc.pid)
        self._end_strays()

    @staticmethod
    def _session_members(sid):
        out = []
        for pid in os.listdir("/proc"):
            if not pid.isdigit():
                continue
            try:
                with open("/proc/%s/stat" % pid) as f:
                    fields = f.read().rsplit(")", 1)[1].split()
            except (OSError, IndexError):
                continue
            # state, ppid, pgrp, session; zombies write nothing more.
            if int(fields[3]) == sid and fields[0] != "Z":
                out.append(int(pid))
        return out

    def _end_session(self, sid):
        """Everything started in the sandbox's session gone - KWin above all,
        which can still be writing its config as it exits. Its environment
        cannot be read (its file capability forbids it), so it is found by
        session instead."""
        end = time.time() + 5
        while time.time() < end and self._session_members(sid):
            time.sleep(0.1)
        for pid in self._session_members(sid):
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass

    def _end_strays(self):
        """Services D-Bus started for the sandbox (a portal, the secret
        service) outlive its bus; they would go on writing in its folders as
        the next sandbox clears them. Found by the data folder they were
        given, which is the sandbox's own."""
        mine = "XDG_DATA_HOME=%s" % (self.base / "data")
        strays = []
        for pid in os.listdir("/proc"):
            if not pid.isdigit() or int(pid) == os.getpid():
                continue
            try:
                with open("/proc/%s/environ" % pid, "rb") as f:
                    env = f.read().decode(errors="replace").split("\0")
            except OSError:
                continue
            if mine in env:
                strays.append(int(pid))
        for sig in (signal.SIGTERM, signal.SIGKILL):
            for pid in strays:
                try:
                    os.kill(pid, sig)
                except OSError:
                    pass
            if sig == signal.SIGTERM and strays:
                time.sleep(0.5)

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

    @property
    def opengl(self):
        """Whether KWin composites with OpenGL. On its virtual backend that
        needs a GPU render node; without one (a container, CI) it draws with
        QPainter, which offers neither screenshots nor effects."""
        if getattr(self, "_opengl", None) is None:
            info = self._qdbus("org.kde.KWin", "/KWin", "org.kde.KWin.supportInformation", check=False)
            self._opengl = bool(re.search(r"Compositing Type:\s*OpenGL", info))
        return self._opengl

    def _qdbus(self, *args, check=True):
        r = subprocess.run(["qdbus6", *args], env=self.env, capture_output=True, text=True)
        if check and r.returncode != 0:
            raise RuntimeError("qdbus6 %s failed: %s" % (" ".join(args), r.stderr))
        return r.stdout

    # -- interaction --------------------------------------------------------------

    def spawn(self, title, app_id="hyprkwin.test", size="400x300", extra=(), wait=True, csd=False, color=None,
              x11=False):
        env = dict(self.env)
        env["WAYLAND_DISPLAY"] = self.socket
        env["QT_QPA_PLATFORM"] = "wayland"
        if x11:
            # Through Xwayland, the way Albert and other X11 apps run.
            env["QT_QPA_PLATFORM"] = "xcb"
            env["DISPLAY"] = self.x_display
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

    def reload_script(self):
        """Unload HyprKwin and let KWin load it again, as tools/install.sh does."""
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", "hyprkwin")
        self._qdbus("org.kde.KWin", "/KWin", "org.kde.KWin.reconfigure")
        for _ in range(100):
            if self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.isScriptLoaded", "hyprkwin",
                           check=False).strip() == "true":
                break
            time.sleep(0.1)
        time.sleep(0.5)

    def kwin_geometries(self, app_id="hyprkwin.test"):
        """Where KWin has each test window, read without HyprKwin's help
        (it may not be running). Starting the probe starts every enabled
        script, so disable HyprKwin first to measure it stopped."""
        d = self.base / ("geo-%d" % time.time_ns())
        d.mkdir(parents=True)
        (d / "main.qml").write_text("""import QtQuick
import org.kde.kwin
Item { Timer { interval: 100; running: true; onTriggered: {
  for (const w of Workspace.windows) if (w.resourceClass === "%s") {
    const g = w.frameGeometry;
    console.warn("HKGEO " + w.caption + "|" + Math.round(g.x) + "|" + Math.round(g.y) + "|" + Math.round(g.width) + "|" + Math.round(g.height));
  }
  console.warn("HKGEODONE");
}}}
""" % app_id)
        marker = self.log_path.read_text(errors="replace").count("HKGEODONE")
        name = "hk-geo-%d" % time.time_ns()
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadDeclarativeScript", str(d / "main.qml"), name)
        self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start")
        for _ in range(60):
            text = self.log_path.read_text(errors="replace")
            if text.count("HKGEODONE") > marker:
                lines = text.splitlines()
                done = max(i for i, l in enumerate(lines) if "HKGEODONE" in l)
                start = max([i for i, l in enumerate(lines[:done]) if "HKGEODONE" in l] or [-1])
                out = {}
                for l in lines[start + 1:done]:
                    if "HKGEO " in l:
                        caption, x, y, w, h = l.split("HKGEO ", 1)[1].split("|")
                        out[caption] = (int(x), int(y), int(w), int(h))
                self._qdbus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", name)
                return out
            time.sleep(0.05)
        raise RuntimeError("geometry probe did not report")

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
        """The whole workspace as a PNG, straight from KWin's ScreenShot2
        interface (what Spectacle uses underneath; Spectacle itself stalls in
        a container)."""
        if not self.opengl:
            raise Skip("screenshots need OpenGL compositing (no GPU here)")
        import dbus
        from PIL import Image
        bus = dbus.bus.BusConnection(self.env["DBUS_SESSION_BUS_ADDRESS"])
        shot = dbus.Interface(bus.get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2"),
                              "org.kde.KWin.ScreenShot2")
        read, write = os.pipe()
        try:
            info = shot.CaptureWorkspace(dbus.Dictionary({}, signature="sv"), dbus.types.UnixFd(write),
                                         timeout=20)
        finally:
            os.close(write)                 # KWin has its own copy; this one would stop EOF
        data = b""
        with os.fdopen(read, "rb") as f:
            while chunk := f.read(1 << 20):
                data += chunk
        width, height, stride, fmt = (int(info[k]) for k in ("width", "height", "stride", "format"))
        # QImage formats: 4-6 are 32-bit BGRA in memory, 16-18 RGBA.
        mode = {4: "BGRX", 5: "BGRA", 6: "BGRA", 16: "RGBX", 17: "RGBA", 18: "RGBA"}.get(fmt)
        if not mode:
            raise RuntimeError("unexpected screenshot format %d" % fmt)
        Image.frombuffer("RGBA", (width, height), data, "raw", mode, stride, 1).convert("RGB").save(path)

    def errors(self):
        text = self.log_path.read_text(errors="replace")
        return [l for l in text.splitlines()
                if re.search(r"(TypeError|ReferenceError|SyntaxError|Error:|hyprkwin.*error|main\.qml:\d+)", l)
                and "portal" not in l]
