# KDE Store listing (draft)

Two products, created by the maintainer at <https://store.kde.org>:

| Product | Category | File to upload |
|---|---|---|
| HyprKwin | KWin Scripts (Plasma 6) | `hyprkwin-<version>.kwinscript` |
| HyprKwin animations | KWin Effects (Plasma 6) | `hyprkwinanimations-<version>.kwineffect` |

Both files are attached to every GitHub release (built by
`.github/workflows/release.yml`, or locally with `tools/package.sh`). For an
update, upload the new file; Plasma offers "Update" when the version in
`metadata.json` is higher. Licence: GPL-3.0-or-later. Screenshot:
`docs/screenshot.png`.

---

## HyprKwin

**Summary:** Hyprland-style tiling for KDE Plasma 6

Tiling the way Hyprland does it, inside Plasma: Hyprland's layouts, keys and
rules, with Plasma's panels, settings and apps still there.

**Layouts** — dwindle (with Hyprland's split rules), master (including the
centred three-column layout), monocle and a scrolling strip, chosen per
workspace and kept between sessions. Zoom into any part of the dwindle layout
with Meta+Z.

**Workspaces per monitor**, as in Hyprland — or Plasma 6.7's own per-screen
desktops, if you have them on.

**Hyprland's keys**, window rules and workspace rules in Hyprland's syntax,
named scratchpads, tabbed groups, submaps, focus-on-activate, a focus border
with gradients and rounding, and per-window opacity. `hyprland.conf` can be
imported.

**Set up in System Settings**: everything is in the script's settings page.

**After installing:** tick HyprKwin in Window Management › KWin Scripts.
Plasma already uses some of the same keys (Meta+Left, Meta+1…); HyprKwin
tells you which, and its settings page (Behaviour tab) has a one-line command
to hand them over — undoably. Install "HyprKwin animations" too for windows
that slide into place.

Requires Plasma 6.7 on Wayland. Source, issues and the full manual:
<https://github.com/DGBooth/HyprKwin>

---

## HyprKwin animations

**Summary:** Windows slide into their new tile when HyprKwin rearranges them

A companion effect for the HyprKwin script: windows animate to their new
place instead of jumping, dividers slide when resized from the keyboard, and
borders move with their windows. Enable it in Window Management › Desktop
Effects after installing; it does nothing without HyprKwin.
