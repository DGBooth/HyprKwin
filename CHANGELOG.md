# Changelog

## Unreleased

- **The layout follows a panel at once.** KWin tells scripts nothing when the
  work area changes, so HyprKwin checked it once a second, and hiding or
  shrinking a panel left the windows short of the edge for up to that long.
  Panels are windows, though, and say when they change: HyprKwin now checks
  the work area as soon as one does, and keeps the once-a-second check for
  anything else. The idea came from [#3](https://github.com/DGBooth/HyprKwin/pull/3)
  (thanks, @towgenik), which shortened the check instead.
- **Windows glide together when a panel changes** (with the animations
  effect): briefly, and without the stretch-and-fade of a re-tile. Before,
  a window that only shrank snapped like a divider nudge while its
  neighbour slid. Small divider nudges still snap. After
  [#5](https://github.com/DGBooth/HyprKwin/pull/5) (thanks, @towgenik).

### Fixed

- A window that moves and resizes in a re-tile could first jump to an
  in-between place and animate from there: KWin reports some re-tiles in two
  parts (a move at the old size, then the real one). The animations effect
  now takes them together.

## 0.13.1

### Fixed

- A window could keep its old size when its workspace came back: resized
  just before its workspace was hidden (sending the window beside it to
  another workspace and following it), it could be hidden before taking the
  new size, and nothing sent it again. Rare with a GPU; every time when KWin
  draws without one.

## 0.13.0

- **Plasma 6.6 is supported**, and HyprKwin now says so (the packages asked
  for 6.7 before). It is tested on 6.6 as well as 6.7: the whole end-to-end
  suite runs against KWin 6.6.6 (as Ubuntu 26.04 LTS ships it) in a
  container, locally with `tools/test-plasma-6.6.sh` and in CI on every push. Plasma 6.7's own
  per-screen desktops are the one thing 6.6 lacks; there HyprKwin gives each
  monitor its workspaces itself, as it always has.

### Fixed

These showed up on Plasma 6.6:

- A submap's key could do nothing, though System Settings listed it. Every
  settings reload made the submap shortcuts afresh, and 6.6 can leave a
  shortcut made again straight away deaf to its key; they are now only made
  again when the submaps change.
- Uninstalling left Plasma's shortcuts that HyprKwin had taken keys from with
  no key at all, when there was no backup to reinstate (an install from the
  KDE Store) or with `--keep-shortcuts`: the keys were given back while
  HyprKwin still held them, which 6.6 refuses.
- `hyprkwin-shortcuts.py check` and `apply` found no clashing keys. 6.6 records
  an action whose key was already taken with no key at all, so the tool now
  knows HyprKwin's default keys itself.

## 0.12.2

### Fixed

- **A tiled window the app moved by itself stayed where the app put it**,
  with its tile left empty beside the other windows. Steam does this to its
  Settings and Friends windows just after they open. As in Hyprland, it now
  goes back to its tile; an app that keeps moving it gets its way after a
  few tries rather than a tug of war. To have such windows float instead,
  add a rule, e.g. `float, class:^(steam)$, title:^(?!Steam$)` floats every
  Steam window but the main one.

## 0.12.1

### Fixed

- **Two monitors could end up showing two workspaces on one and nothing on
  the other** ([#1](https://github.com/DGBooth/HyprKwin/issues/1)).
  Switching, from one monitor, to a workspace the other monitor had shown
  earlier put that workspace on this monitor but left its windows behind on
  the other — where, without Plasma's per-screen desktops, they were drawn
  over the workspace that monitor was showing. Now, as in Hyprland, going to
  a workspace that is not on screen goes to the monitor its windows are on;
  and a workspace put on a monitor any other way (the pager, a monitor
  coming or going) brings its windows along.

## 0.12.0

- **A keys guide on `Meta+K`**, like Omarchy's: every HyprKwin shortcut, in
  sections, on the keys it has right now. KDE is asked each time, so a key
  rebound in System Settings shows as rebound; submaps and named scratchpads
  are listed too, and a default key another shortcut still holds is marked
  with who has it. It scrolls with the wheel or the arrow and page keys, and
  Escape or `Meta+K` closes it.

## 0.11.2

### Fixed

- Clicking a window on another monitor played Plasma's desktop-switch
  animation, sliding the windows on the monitor you left. Without Plasma
  6.7's per-screen desktops, Plasma has one current desktop, which follows
  the monitor you are on; the windows on show on each monitor are now kept on
  all desktops, so nothing moves when it changes. A workspace switch on a
  monitor still slides that monitor's windows as before.

## 0.11.1

### Fixed

- The animations effect's settings did not open from Desktop Effects
  ("Could not find plugin kwin/effects/configs/kwin/effects/configs/…"). The
  Desktop Effects page adds that folder to the module name itself, unlike the
  KWin Scripts page, so the effect now gives the bare name.

## 0.11.0

- **Zoom**, after Trellis's fractal workspaces: `Meta+Z` zooms in towards the
  focused window a level of the dwindle layout at a time, so that part fills
  the workspace while the rest waits off screen, and `Meta+Shift+Z` zooms
  back out. Tiles too small to use show their app's icon, and clicking one
  zooms in until the window is big enough; optionally, Escape zooms back out
  while a zoom lasts.
- **The pointer follows keyboard focus**, as in Hyprland: after Meta+arrow, a
  monitor switch, focusing the master, cycling or sending a window to another
  monitor, the pointer moves to the focused window — through KWin's own "Move
  Mouse to Focus" action, which the README wrongly said scripts could not
  reach. On by default; the importer maps `cursor:no_warps`.
- **Layouts survive logging out.** Each workspace's layout and master
  settings are saved to `~/.config/hyprkwinrc` and read back at the next
  login — and across upgrades. A KWin script cannot write files, so this goes
  through Plasma's own desktop scripting rather than a separate service.
- **Plasma 6.7's per-screen virtual desktops are used when they are on**
  (Virtual Desktops › "Switch desktops independently for each screen"):
  KWin shows each monitor's workspace itself instead of HyprKwin putting
  windows on all desktops, so the pager and Overview agree, and a switch made
  in the pager is followed. Off, nothing changes.
- **Installable without cloning**: every release carries a `.kwinscript` for
  System Settings' "Install from File…" and a `.kwineffect` for the
  animations (`tools/package.sh` builds them). Installed that way, nothing
  hands Plasma's keys over, so HyprKwin now checks who owns each of its keys
  a few seconds after starting and says when some are taken; its settings
  page gives the one command that hands them over, and the package carries
  the helper it runs.

### Fixed

- **Upgrading left the previous version running.** A script's handlers for
  KWin's signals belong to KWin's shared script engine, not to the script, so
  every `tools/install.sh` upgrade added another copy of HyprKwin that went
  on reacting to every window. After a day of upgrades, ten copies fought
  over the same windows and, when a second monitor came on, recursed until
  KWin froze. HyprKwin now disconnects everything it connected when it
  stops. **Log out once after installing this version** to clear any copies
  still running from earlier ones.
- A new session puts the current workspace on the primary monitor, as
  Hyprland does, instead of whichever monitor KWin reported as active.
- Logging in within two minutes of an upgrade was taken for the upgrade
  itself, so the session started on whatever workspace Plasma restored
  instead of workspace 1. `tools/install.sh` now removes its marker as soon
  as the new version has started.

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
