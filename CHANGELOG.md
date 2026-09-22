# Changelog

## 0.7.0

- **Upgrades apply without logging out.** Running `tools/install.sh` again
  reloads HyprKwin and its animations effect in the running session. The
  installer checks which version is actually running and says so.
- **Upgrading from 0.6.x or older needs one last logout**, because KWin still
  has the old version's entry point cached. The installer tells you when that
  happens. From 0.7.0 on, it doesn't.

## 0.6.1

- Fixed: launchers such as Albert, which run as frameless X11 utility windows,
  got a border traced around their invisible transparent edge. Floating
  borders now go only to ordinary app windows and dialogs.

## 0.6.0

- **Gradient borders.** The focused border can run between two colours at any
  angle, like Hyprland's
  `col.active_border = rgba(33ccffee) rgba(00ff99ee) 45deg`. It flows
  smoothly round rounded corners.
- **Window opacity** for focused and unfocused windows
  (`decoration:active_opacity` / `inactive_opacity`). An `opacity` window rule
  overrides it for that app, and fullscreen windows stay opaque. At 1.0,
  HyprKwin leaves opacity alone, so Plasma's own opacity rules keep working.
- **Floating windows without a title bar get the border** too, whether the
  title bar is hidden or the app draws its own.
- **Borders step aside for windows stacked above**, instead of being painted
  across them.
- Fixed: a custom border colour chosen in the settings page came out black.

All of these are set in the settings page's Appearance tab.

## 0.5.0

- **More Hyprland window rules:**
  - `size W H`, `move X Y` and `center` for floating windows, in pixels or
    percent of the monitor
  - `monitor N` or `monitor DP-2`
  - `opacity A [I]`, following focus
  - `noborder`
  - a `floating:1` / `floating:0` matcher
  
  A rule with bad arguments is reported instead of being guessed at.
- **Window rules are managed in the settings page** as a list you can add to,
  edit, remove from and reorder. A reference of every action and matcher sits
  beside it, along with how to find an app's class without a terminal.
  `tools/hyprkwin-rules.py` edits the same list, and rules kept as text by
  older versions are moved into it on install.

## 0.4.0

The first public release: Hyprland-style dwindle tiling, per-monitor
workspaces, groups, a scratchpad, window rules, focus-on-activate, animations,
and an install that backs up your shortcuts and can be undone. See the
[release notes](https://github.com/DGBooth/HyprKwin/releases/tag/v0.4.0).
