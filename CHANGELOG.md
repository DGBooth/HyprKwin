# Changelog

## 0.10.0

- **Named scratchpads**, as in Hyprland's special workspaces. The one on
  `Meta+S` is joined by up to four more, named in the settings page and
  reached with their own shortcuts (unbound by default) or a rule such as
  `workspace special:music, class:^(spotify)$`. Only one is on screen at a
  time, so opening one puts the other away.

- **Submaps**, as in Hyprland: a key puts the keyboard into a mode where
  plain keys act until Escape, and the mode's name stays on screen while it
  is on. The keys inside one are registered with KDE only while it is on, so
  they belong to applications the rest of the time. They are written a line
  at a time in the settings page's Submaps tab.

- **`tools/hyprkwinctl`**, a `hyprctl`-style command: run any action, list
  the actions and their keys, and ask what windows, workspaces, layout or
  submap are current, as a table or as JSON for a status bar.

- **An importer for an existing `hyprland.conf`**
  (`tools/hyprkwin-import.py`): settings, window rules, workspace rules and
  binds, following `source =` lines and `$variables`. It shows what it would
  change and does nothing until `--apply`, and lists everything it could not
  translate with the line it came from.

- **Closing a window hands the focus to its neighbour** — the other side of
  the split it shared, or the next tab in its group — as Hyprland gives focus
  to whatever grows into the gap. KWin's own choice is the window you used
  longest ago, wherever it happens to be, which is why focus could jump
  across the screen. There is a setting to go back to that.

- **Workspace rules**, in Hyprland's syntax and managed in the settings page:
  `workspace = 3, monitor:DP-2, default:true, layout:master, gapsin:0,
  gapsout:0`. A pinned workspace stays on its monitor — switching to it goes
  there, and a window sent to it follows — `default:true` chooses what each
  monitor starts on, and the layout and gaps apply to that workspace alone.


### Fixed

- "Draw borders around unfocused tiled windows too" drew a single border —
  often around an unfocused window, leaving the focused one without any.
- After swapping workspaces between monitors, a new window on a moved
  workspace opened on top of the windows already there instead of tiling
  with them, and the workspace's layout stayed behind on the old monitor.
- Columns the scrolling layout had parked past the monitors stayed out of
  reach after HyprKwin was turned off or uninstalled.
- A submap's name disappeared from the screen after a second, and never
  showed at all with layout messages turned off.
- Closing a dialog of a floating window could send the focus to a tiled
  window instead of back to the window it belonged to.
- Upgrading with `tools/install.sh` switched you back to workspace 1.
- `hyprkwinctl` and `hyprkwin-rules.py list` wrote HyprKwin's whole state,
  window titles included, to the journal on every query. They now receive it
  over D-Bus, and `hyprkwin-rules.py` can no longer act on a list from up to
  30 seconds before.
- The importer stopped with an error when a `source =` pattern matched a
  folder, and read `workspace, previous` as the workspace numbered before
  rather than the one you were last on.
- A `default:true` workspace rule for a workspace that did not exist yet did
  nothing; a workspace rule's number now has to be a whole number.
- Checking for Overview and the other fullscreen effects woke KWin up about
  seven times a second, always. KWin gives scripts no signal for them, so
  HyprKwin still has to ask — but now only while something of its own is on
  screen, and twice a second once you have been idle for ten seconds.
- The installed version is only ever loaded from inside the package, whatever
  the `BuildId` setting says.
## 0.9.0

- **The border gradient can turn**, as Hyprland's `borderangle` animation
  does. Off by default: it redraws the border continuously.
- **Scrolling layout**, as in niri and hyprscrolling: a strip of columns, with
  the focus scrolling it and the resize keys setting the focused column's
  width. Left and right follow the strip rather than the screen.
- Only whole columns are shown. The rest wait past the last monitor, where
  KWin draws nothing, so a strip never spills onto the screen next door —
  which a sandbox spike confirmed it otherwise would, since KWin will place a
  window anywhere you ask, including on the neighbouring monitor.
- **A message on screen when the layout changes**, and when `Meta+J` changes
  the split direction: a short caption near the bottom of the monitor you are
  using, like Plasma's own on-screen display. Plasma's OSD service only takes
  fixed kinds of message, so HyprKwin draws its own. There is a setting to
  turn it off. It is framed in the focus border's colours, gradient and
  turning angle included, so it matches the window it is telling you about.
- Fixed: a keyboard resize could throw when a window took its new size during
  the same layout pass.

## 0.8.1

- **Far fewer offscreen buffers while animating.** Cross-fading a window's
  contents makes KWin render it into an offscreen buffer and blit it. A
  layout change moves every window at once, so a single keypress could start
  eight of those in one frame (including one per border strip). Borders and
  tab bars are flat colour and never cross-fade now, and at most two windows
  cross-fade at a time; the rest simply resize. There is a setting to turn
  cross-fading off entirely.
- This was found while investigating two KWin crashes on an NVIDIA card,
  where the GPU halted and reset (`Xid 62`, `Xid 45`) and KWin then died
  inside the driver on exactly that blit. The fault is the driver's, but
  those bursts were what provoked it.
- The effect now has unit tests of its own.

## 0.8.0

- **Master and monocle layouts**, chosen per workspace:
  - **Master**: a master area beside a stack, with `mfact`, several masters,
    and the master area on any side or in the middle (the three-column
    layout). New windows can become the master (`master:new_status`).
  - **Monocle**: one window at a time, each filling the workspace.
  - `Meta+Shift+J` cycles a workspace through the layouts; `Meta+M`,
    `Meta+Shift+M`, `Meta+>`, `Meta+<` and `Meta+Alt+M` drive the master
    layout. The resize keys and edge dragging move the master boundary the
    way they move a dwindle split.
  - The layout a new workspace starts with is in the settings page, along
    with the master settings.
- Dwindle is unchanged and stays the default.

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
