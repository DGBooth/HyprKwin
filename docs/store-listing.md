# KDE Store listing

Two products, live at <https://www.opendesktop.org/p/2375015/> (HyprKwin) and
<https://www.opendesktop.org/p/2375020/> (HyprKwin animations):

| Product | Category | File to upload |
|---|---|---|
| HyprKwin | KWin Scripts (Plasma 6) | `hyprkwin-<version>.kwinscript` |
| HyprKwin animations | KWin Effects (Plasma 6) | `hyprkwinanimations-<version>.kwineffect` |

Both files are attached to every GitHub release (built by
`.github/workflows/release.yml`, or locally with `tools/package.sh`). For an
update, upload the new file; Plasma offers "Update" when the version in
`metadata.json` is higher. Licence: GPL-3.0-or-later. Screenshots:
`docs/media/dwindle.png` (first, it is the thumbnail), `docs/media/master.png`,
`docs/media/groups.png`, `docs/media/keys.png` and `docs/zoom.png`.
Logo: `docs/logo.png` (from `docs/logo.svg`), for both products. Tags:
`tiling hyprland kwin kwin-script window-manager wayland plasma6 dwindle
keyboard` (the effect: `kwin-effect animation` instead of `kwin-script`).

Create the animations listing too: the Desktop Effects page has no "Install
from File…", so the store's "Get New…" is the only way to install the effect
without a terminal.

---

## HyprKwin

**Summary:** Automatic, keyboard-driven tiling for Plasma 6

Windows arrange themselves as they open, with no dragging or snapping,
and you move between them from the keyboard. Your panels, widgets,
Overview, KRunner and System Settings all stay as they are.

**Five layouts**, chosen per workspace and kept between sessions: dwindle
(each new window halves the focused one), master (one big window beside a
stack, or in the middle with columns either side), monocle (one window at a
time), scrolling (a strip of columns you move along) and stage (one window,
with live previews of the rest beside it, as in macOS's Stage Manager). Meta+Z zooms into
any part of the dwindle layout.

**Workspaces per monitor**: switching workspace changes only the monitor
you are on, and each monitor keeps its own. On Plasma 6.7 and later this is
Plasma's own per-screen desktops.

**And more:** tabbed groups, scratchpads that slide over any workspace,
window and workspace rules, modes for keys (a resize mode, for example), a
focus border with gradients and rounded corners, and opacity for unfocused
windows. Meta+K shows every shortcut on the key it actually has. Coming from
Hyprland? The default keys are Hyprland's, and your `hyprland.conf` can be
imported.

**Set up in System Settings**: everything is in the script's settings page.

**After installing:** tick HyprKwin in Window Management › KWin Scripts.
Plasma already uses some of the same keys (Meta+Left, Meta+1…); HyprKwin
tells you which, and its settings page (Behaviour tab) has a one-line command
to hand them over — undoably. Install "HyprKwin animations" too for windows
that slide into place.

Requires Plasma 6.6 (LTS) or 6.8 on Wayland. Source, issues and the full manual:
<https://github.com/DGBooth/HyprKwin>

---

## HyprKwin animations

**Summary:** Windows slide into their new tile when HyprKwin rearranges them

A companion effect for the HyprKwin script: windows animate to their new
place instead of jumping, dividers slide when resized from the keyboard, and
borders move with their windows. Enable it in Window Management › Desktop
Effects after installing, then log out and back in once (KWin only finds a
newly installed effect at startup). It does nothing without HyprKwin.
