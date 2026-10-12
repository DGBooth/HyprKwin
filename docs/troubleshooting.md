# Troubleshooting

What to do when something does not work, and what HyprKwin cannot do.

## Common problems

**Some keys do nothing (Meta+Left, Meta+1…).** Plasma uses several of
HyprKwin's keys for its own shortcuts, and KDE gives a key to whichever
shortcut claimed it first. HyprKwin says which a few seconds after it starts
(once), and Meta+K marks them. Hand them over from a terminal (undoably; see
[Getting started](getting-started.md#keybindings-and-plasma-conflicts)):

```bash
python3 ~/.local/share/kwin/scripts/hyprkwin/contents/tools/hyprkwin-shortcuts.py apply
```

or rebind them in System Settings › Keyboard › Shortcuts.

**The keys that move a window to a workspace do nothing.** Plasma stores a
shortcut by the character a key types, so these follow your keyboard
layout (Meta+£ for Meta+Shift+3 on a UK layout). A few seconds after
HyprKwin starts they are set for the layout in use; one you rebound yourself
is left alone. Where a layout types a character another shortcut already
has, the key stays as it was and Meta+K marks it.

**No animations.** They are a separate KWin effect, "HyprKwin animations":
install it from Desktop Effects › Get New…, log out and back in (KWin only
finds new effects when it starts), and tick it. HyprKwin says once if it
finds it missing or off.

**A window will not tile, or tiles when it should not.** Dialogs and windows
with a fixed size float; anything else can be told with a
[window rule](rules-and-scripting.md#window-rules) such as
`float, class:^(org\.kde\.kcalc)$`. Meta+T toggles one window.

**Changed a setting and nothing happened.** Settings apply when you press
Apply. If one still does not, `hyprkwinctl dispatch retile` reloads them.

**After an upgrade, the old version is still running.** `tools/install.sh`
and the store reload HyprKwin by themselves; the animations effect is only
picked up by KWin when it starts, so log out and back in after updating it.

## Reporting a problem

Open an issue at
[github.com/DGBooth/HyprKwin/issues](https://github.com/DGBooth/HyprKwin/issues/new/choose);
the form asks for what this prints:

```bash
python3 ~/.local/share/kwin/scripts/hyprkwin/contents/tools/hyprkwinctl version
```

For a log, turn on "Debug logging" in HyprKwin's settings (Behaviour), make
it happen, then `journalctl --user --since "-10min" | grep HyprKwin`.

## How it fits into Plasma

- Tiled windows get their title bar hidden (optional); floating windows keep
  it. Unloading the script restores everything.
- Minimizing a tiled window gives its space to its neighbours; restoring it
  puts it back where it was. Windows on another activity are treated the same
  way, and each activity remembers which workspace every monitor shows.
- Moving a window with Plasma (task manager, pager, "Window to Desktop",
  "Window to Next Screen", dragging) re-tiles it in its new place, and a
  window that lands on another monitor joins the workspace that monitor is
  showing.
- Switching desktop from Plasma itself (the pager, its own shortcuts) applies
  to the monitor you are on, leaving the others as they were.
- Maximize and fullscreen are Plasma's own states; the window keeps its tile
  and returns to it.
- Plasma's quick tiling (Meta+arrows before the shortcuts are reassigned) and
  the tile editor can't take over a HyprKwin-tiled window: HyprKwin takes it
  back. Floating windows can still use them.
- Borders and tab bars stay out of the task manager, Alt+Tab and Overview,
  and hide while Overview, Window View or Cube is open.
- The scratchpad is ordinary minimize/restore plus "keep above", so its
  windows stay visible in the task manager while hidden.

## Limitations

- The pointer can only be moved to the focused window (through KWin's own
  "Move Mouse to Focus" action), so switching to an empty workspace leaves it
  where it was.
- In the scrolling layout, columns hold a single window; stacking several
  windows in one column is not there yet.
- Windows themselves are not rounded, only the border around them. A
  scripted effect can load a fragment shader, but applying one to a window
  renders it black, so this needs a compiled effect: the third-party
  [Shape Corners](https://github.com/matinlotfali/KDE-Rounded-Corners) does it.
- Animations come from a companion KWin effect, which cannot resize an app
  smoothly; see [Animations](getting-started.md#animations) for how resizes are handled.
- Every monitor having its own workspaces is emulated on top of Plasma's
  single current desktop, so windows shown on the other monitors appear
  "on all desktops" in the task manager and pager.
- Scripts can't bind mouse wheel shortcuts, so there's no Meta+scroll
  workspace switching.
- KWin does not destroy a script's overlay windows when the script is
  unloaded; HyprKwin closes any leftovers when it next starts, and
  `uninstall.sh` sweeps them.

---

[← HyprKwin](../README.md) · [Getting started](getting-started.md) · [Settings](settings.md) · [Rules and scripting](rules-and-scripting.md) · [Troubleshooting](troubleshooting.md) · [Compatibility](compatibility.md)
