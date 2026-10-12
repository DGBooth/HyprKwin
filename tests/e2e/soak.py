#!/usr/bin/env python3
"""A long run of everyday use, watched for what only shows over time.

    python3 tests/e2e/soak.py --minutes 120            # two hours
    python3 tests/e2e/soak.py --minutes 5 --seed 7     # a quick look

On two monitors, in the nested KWin of the tests, it does at random what
people do all day:
- opens and closes windows (up to about twenty);
- moves the focus and windows about, across workspaces and monitors;
- switches layouts, groups, scratchpads and zoom, and floats windows;
- opens the keys guide;
- unplugs a monitor and plugs it back in;
- reloads HyprKwin, as an upgrade does.

Once a minute it samples KWin's memory, HyprKwin's own windows (borders, tab
bars, icon tiles), how many windows HyprKwin tracks against how many there
are, how long its layouts take, and the log for errors. At the end it closes
everything and checks that HyprKwin's windows went back to what it started
with, and that KWin's memory levelled off rather than kept climbing.

The samples go to a CSV beside the sandbox; it exits non-zero on a failure.
"""
import argparse
import csv
import os
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sandbox import Sandbox  # noqa: E402

ACTIONS = [
    # (weight, action)
    (6, "focusLeft"), (6, "focusRight"), (4, "focusUp"), (4, "focusDown"),
    (3, "swapLeft"), (3, "swapRight"), (2, "moveUp"), (2, "moveDown"),
    (3, "desktop1"), (3, "desktop2"), (2, "desktop3"), (1, "nextDesktop"), (1, "formerDesktop"),
    (2, "moveToDesktopSilent2"), (1, "moveToDesktop3"), (1, "moveToDesktop1"),
    (2, "windowToMonitorRight"), (2, "windowToMonitorLeft"), (1, "focusNextMonitor"),
    (1, "workspaceToMonitorRight"),
    (2, "toggleFloating"), (2, "toggleSplit"), (1, "pseudo"), (1, "fullscreen"),
    (1, "cycleLayout"), (1, "layoutDwindle"), (1, "layoutMaster"),
    (2, "toggleGroup"), (1, "groupNext"), (1, "leaveGroup"), (1, "intoGroupLeft"),
    (1, "toggleSpecial"), (1, "moveToSpecial"),
    (1, "zoomIn"), (1, "zoomOut"),
    (1, "resizeLeft"), (1, "resizeRight"),
]


def kwin_rss_kb(sb):
    for pid in sb._session_members(sb.proc.pid):
        try:
            if open("/proc/%d/comm" % pid).read().strip() != "kwin_wayland":
                continue
            for line in open("/proc/%d/status" % pid):
                if line.startswith("VmRSS:"):
                    return int(line.split()[1])
        except OSError:
            pass
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--minutes", type=float, default=60)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--max-windows", type=int, default=20)
    ap.add_argument("--debug", action="store_true", help="HyprKwin's debug log, and stop at the first error")
    ap.add_argument("--package", help="the script package to run instead of this checkout's (another release's)")
    args = ap.parse_args()
    seed = args.seed if args.seed is not None else random.randrange(1 << 30)
    rng = random.Random(seed)
    weights = [w for w, _ in ACTIONS]
    names = [a for _, a in ACTIONS]
    base = os.environ.get("HK_SANDBOX") or os.path.join(os.environ.get("XDG_RUNTIME_DIR", "/tmp"), "hyprkwin-soak")
    report = Path(base + "-samples.csv")
    print("seed %d, %.0f minutes, samples to %s" % (seed, args.minutes, report), flush=True)

    failures = []
    config = {"Debug": "true"} if args.debug else {}
    for kv in os.environ.get("HK_SOAK_CONFIG", "").split(","):
        if "=" in kv:
            k, v = kv.split("=", 1)
            config[k] = v
    with Sandbox(base=base, outputs=2, config=config, package=args.package) as sb, open(report, "w", newline="") as f:
        out = csv.writer(f)
        out.writerow(["minute", "kwin_rss_kb", "overlay_windows", "tracked", "clients",
                      "relayout_max_ms", "decorations_max_ms", "actions", "errors"])
        sb.settle(1)
        baseline = sb.state().get("overlayWindows", 0)
        print("HyprKwin's own windows at the start: %d" % baseline, flush=True)
        clients = []                        # (title, process)
        recent, last_action, states, log_all = [], "?", [], []
        serial, actions, unplugged = 0, 0, False
        end = time.time() + args.minutes * 60
        next_sample, minute = time.time(), 0
        while time.time() < end:
            roll = rng.random()
            last_action = "?"
            if args.debug:
                states.append({"monitor_unplugged": unplugged, "state": sb.state()})
                del states[:-2]
            clients = [(t, p) for t, p in clients if p.poll() is None]
            if roll < 0.10 and len(clients) < args.max_windows:
                serial += 1
                title = "S%04d" % serial
                clients.append((title, sb.spawn(title, wait=False, size=rng.choice(["400x300", "800x600", "300x900"]))))
                last_action = "open " + title
            elif roll < 0.17 and clients:
                t, p = clients.pop(rng.randrange(len(clients)))
                p.terminate()
                last_action = "close " + t
            elif roll < 0.175:
                sb.output("Virtual-1", "enable" if unplugged else "disable")
                unplugged = not unplugged
                last_action = "monitor " + ("unplugged" if unplugged else "plugged in")
            elif roll < 0.178:
                sb.reload_script()
                last_action = "reload"
            elif roll < 0.185:
                sb.invoke("showKeys", settle=False)
                time.sleep(0.4)
                sb.invoke("showKeys", settle=False)
                last_action = "keys guide"
            else:
                last_action = rng.choices(names, weights)[0]
                sb.invoke(last_action, settle=False)
            actions += 1
            time.sleep(rng.uniform(0.05, 0.4))
            if args.debug:
                # Which action brought the first error: stop right there.
                recent.append(last_action)
                log_all.append(last_action)
                del recent[:-6]
                if "Error:" in sb.log_path.read_text(errors="replace").split("HYPRKWIN_STATE")[-1] or \
                        [e for e in sb.errors() if "bluez" not in e]:
                    print("first error after these actions:\n  " + "\n  ".join(recent), flush=True)
                    import json
                    Path(base + "-before-error.json").write_text(json.dumps(states, indent=1))
                    Path(base + "-actions.json").write_text(json.dumps(log_all))
                    print("the state before the last two actions: %s-before-error.json" % base, flush=True)
                    failures.append("stopped at the first error")
                    break

            if time.time() >= next_sample:
                minute += 1
                next_sample += 60
                time.sleep(1.0)             # let things settle for the look
                s = sb.state()
                live = [t for t, p in clients if p.poll() is None]
                errors = [e for e in sb.errors() if "bluez" not in e]
                t = s.get("timing", {})
                row = [minute, kwin_rss_kb(sb), s.get("overlayWindows", 0), len(s["windows"]), len(live),
                       t.get("relayout", {}).get("max", 0), t.get("decorations", {}).get("max", 0),
                       actions, len(errors)]
                out.writerow(row)
                f.flush()
                print("min %3d  KWin %6.1f MB  own windows %3d  tracked %2d/%2d  slowest %3d/%3d ms  %d actions%s"
                      % (minute, row[1] / 1024, row[2], row[3], row[4], row[5], row[6], actions,
                         "  ERRORS %d" % len(errors) if errors else ""), flush=True)
                tracked = {w["caption"] for w in s["windows"].values()}
                missing = [t for t in live if t not in tracked]
                if errors:
                    failures.append("minute %d: script errors: %s" % (minute, errors[:3]))
                if len(missing) > 2:            # a window just opened may not be in yet
                    failures.append("minute %d: windows HyprKwin lost track of: %s" % (minute, missing))
                if sb.proc.poll() is not None or sb.crashed():
                    failures.append("minute %d: KWin is gone" % minute)
                    break

        # Everything closed: HyprKwin's own windows should be back where they began.
        if unplugged:
            sb.output("Virtual-1", "enable")
        for _, p in clients:
            if p.poll() is None:
                p.terminate()
        sb.settle(3)
        s = sb.state()
        print("closed everything: own windows %d (at the start %d), tracked %d"
              % (s.get("overlayWindows", 0), baseline, len(s["windows"])), flush=True)
        if s.get("overlayWindows", 0) > baseline + 2:
            failures.append("HyprKwin's own windows grew from %d to %d" % (baseline, s.get("overlayWindows", 0)))
        if s["windows"]:
            failures.append("still tracking closed windows: %r" % sorted(w["caption"] for w in s["windows"].values()))

    # KWin's memory: the last quarter against the second (the first warms up).
    rows = list(csv.DictReader(open(report)))
    if len(rows) >= 8:
        q = len(rows) // 4
        early = sum(int(r["kwin_rss_kb"]) for r in rows[q:2 * q]) / q
        late = sum(int(r["kwin_rss_kb"]) for r in rows[-q:]) / q
        growth = (late - early) / max(1, early)
        print("KWin's memory: %.1f MB early on, %.1f MB at the end (%+.0f%%)" % (early / 1024, late / 1024, growth * 100))
        if growth > 0.25:
            failures.append("KWin's memory kept climbing: %+.0f%%" % (growth * 100))
    if failures:
        print("\nFAILED (seed %d):\n  %s" % (seed, "\n  ".join(failures)))
        return 1
    print("\npassed (seed %d)" % seed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
