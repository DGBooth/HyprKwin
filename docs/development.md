# Development

How HyprKwin is built and tested.

## Development

```
package/
  metadata.json                KWin script metadata (declarative script)
  contents/code/engine.js      pure dwindle tree: layout, gaps, splits, groups, resize, directions
  contents/code/rules.js       window-rule parser
  contents/code/driver.js      binds the engine to KWin (spaces, windows, actions)
  contents/code/shortcuts.js   default shortcuts
  contents/ui/main.qml         entry point: loads the installed build (so upgrades apply without logging out)
  contents/ui/HyprKwin.qml     the script: shortcuts, timers, overlays
  contents/ui/Border.qml, BorderStrip.qml, GroupBar.qml
  contents/ui/config.ui        settings page (+ contents/config/main.xml)
tests/
  *.test.js                    Deno unit tests for engine.js / rules.js
  e2e/                         end-to-end tests in a headless nested KWin
tools/                         install, uninstall, shortcut conflicts, docs helper
```

Unit tests:

```bash
deno test --allow-read tests/
```

End-to-end tests start a private `kwin_wayland --virtual` (own D-Bus session
and config dir, nothing touches your desktop), install the package into it
and drive it with real key presses and mouse drags through KWin's
fake-input protocol. The panel tests also run a real `plasmashell` (with
its own `kactivitymanagerd`). They need `python3` with PySide6, dbus-python
and Pillow, plus `kscreen-doctor` (for plugging monitors in and out); tests
whose tools are missing say SKIP. Screenshots come straight from KWin, and
need a GPU: without one, the tests that take them (or use the animations
effect) say SKIP. On a machine with an NVIDIA card and an integrated one,
the tests use the integrated one, leaving the NVIDIA card's memory to
whatever else is running (`HK_ANY_GPU=1` lets KWin choose).

```bash
python3 tests/e2e/run.py            # everything
python3 tests/e2e/run.py groups     # tests whose name contains "groups"
```

The same suite runs in a container against other Plasma releases, whatever
Plasma your machine has: Plasma 6.6 (KWin 6.6.6, as Ubuntu 26.04 LTS ships
it, also in CI on every push) and Plasma 6.8 (from Arch's kde-unstable
repository; `HK_REBUILD=1` picks up a newer release candidate). It needs
Docker or podman; the tests for Plasma 6.7's per-screen desktops are skipped
on 6.6. Locally the container is given the first GPU render node that Mesa
drives (an Intel or AMD GPU, not NVIDIA's), so the screenshot and effect
tests run too; CI has no GPU and skips them.

```bash
tools/test-plasma.sh 6.6            # everything, on Plasma 6.6
tools/test-plasma.sh 6.8 groups     # some of it, on Plasma 6.8
```

The README's screenshots and clips (`docs/media/`) are staged in the same
nested KWin, with real apps, Plasma's wallpaper and a made-up home folder, so
they can be retaken when the UI changes: `python3 tools/showcase.py` for all
of them, or name some (`python3 tools/showcase.py layouts`). Each clip also
comes out as a 1080p MP4 beside the GIF, for posting elsewhere; those are not
committed. See the script's docstring for what it needs.

Debug logging: enable "Debug logging" in the settings, then
`journalctl --user -f | grep HyprKwin`.

---

[← HyprKwin](../README.md) · [Getting started](getting-started.md) · [Settings](settings.md) · [Rules and scripting](rules-and-scripting.md) · [Troubleshooting](troubleshooting.md) · [Compatibility](compatibility.md)
