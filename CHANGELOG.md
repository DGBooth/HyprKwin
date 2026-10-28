# Changelog

## Unreleased

### Added

- **Dim behind the scratchpad**: the windows behind an open scratchpad are
  darkened, so you can tell it is open even when it is empty, as Hyprland's
  `dim_special` does (and a `hyprland.conf` import brings that setting
  across). Set the amount on the settings page, beside the scratchpad
  margin; it is off by default. The HyprKwin animations effect does the
  darkening, so this needs it, at this release's version. Suggested by
  335015939hi.

### Fixed

- **Panels set to let windows go below them are drawn over borders**, as
  they are over the windows: the border stops where the panel starts,
  rather than being painted across it. Reported by 335015939hi.

## 1.1.0

*HyprKwin animations 1.1.0 (changed in this release).*

### Added

- **Outer gaps can differ per side:** Top, Right, Bottom and Left on the
  settings page, `gapsout:T R B L` in a workspace rule, and a `gaps_out` with
  a value per side when importing a `hyprland.conf`. The outer gap still sets
  every side, and a side left at "same as outer gap" follows it, so existing
  settings carry over. Contributed by Perrelli9338.
- **A stage layout**, after macOS's Stage Manager. The focused window takes
  the stage; the workspace's other windows wait beside it as live previews,
  tilted towards it, most recently used at the top. Click a preview (or cycle
  with the "next window in the layout" keys) to bring that window onto the
  stage: it grows out of its preview while the one it replaces shrinks into
  the strip, at Plasma's animation speed. The previews have a strip of their
  own, so the stage window never covers them (the strip between them is
  still the desktop's, to click); it goes on the left or right, and its
  width is set on the Layout tab. Floating windows stay in front of the
  stage. Right-click a preview to close its window. With more windows than fit, the mouse wheel over the previews
  scrolls the strip. Windows can share the stage too: drag a preview onto it and
  that window joins the one there; they wait in the strip together, as one
  preview with both icons, and come back together. Drag a window off the
  stage onto the strip (Meta+drag), or right-click a set's preview, to part
  them again. Choose it like the other layouts: "Next layout", the new "Use
  the stage layout" shortcut (unbound), the default layout setting,
  `layout:stage` in a workspace rule, or `hyprkwinctl layout stage`.

### Changed

- **Borders and icon tiles step aside for Plasma's own popups** (the app
  launcher, the calendar, the system tray) as they already did for menus,
  rather than being painted over them; so do the stage layout's previews.

- **Animations: HyprKwin's own borders, tab bars and stage previews no
  longer fade or scale in and out with Plasma's popup and window effects**
  (Fading Popups, Scale, Glide, Fade). They come and go with the windows they
  belong to; the animations effect now claims their opening and closing, the
  way Plasma's effects leave a window to whichever effect claimed it. This is
  what lets a stage switch land without anything fading half way.

### Fixed

- **Closing a window you had not focused since it opened left nothing
  focused**, or Plasma's own pick, rather than the window taking its place.
  KWin focuses a new window before HyprKwin hears of it, so it never counted
  as the focused one. In the stage layout, where the other windows wait off
  screen, nothing got the focus at all.

## HyprKwin animations 1.0.1

*The script is unchanged: HyprKwin 1.0.0 is still current.*

### Changed

- **Smoother animations when windows are re-tiled quickly.** A window
  re-tiled while it is still moving now carries on from where it is drawn,
  bending towards its new tile, rather than jumping back and starting over
  (and without the brief cross-fade that came with that). Under fractional
  scaling, the rounding KWin sends a moment after a re-tile no longer
  restarts the animation as the window arrives.
- **Maximizing works with Plasma's Maximize effect.** While that effect is
  on, maximizing and restoring are left to it, and HyprKwin takes over only
  where it gives up or does not follow a move; with it off, HyprKwin animates
  maximizing itself. This replaces a blanket half-second pause in animations
  after every maximize.
- Nothing animates when Plasma's animation speed is set to Instant.

Ported back from [KDE Animated Tiling](https://github.com/microsoftruinseverything456/KDE-Animated-Tiling),
microsoftruinseverything456's fork of these animations focused on tiling
(GPL-3.0-or-later, like HyprKwin). Thank you!

## 1.0.0

*HyprKwin animations 1.0.0 (unchanged since 1.0.0-rc2).*

**HyprKwin 1.0.** No headline feature: a promise that what is there stays
put and keeps working. From here on, your settings, shortcut names and keys,
window and workspace rules, submaps, saved layouts and `hyprkwinctl`'s
commands and JSON carry over every upgrade (a change that would break one
waits for 2.0); [docs/compatibility.md](docs/compatibility.md) lists exactly
what is kept.

Coming from the KDE Store's 0.17, everything in 1.0.0-rc1 and rc2 below is
new to you. In short:

- **Rules from the window menu** (Alt+F3 › Extensions › HyprKwin › Always
  float / tile / open in the scratchpad).
- **Fullscreen and maximize rules move to Plasma's own window rules** by
  themselves; HyprKwin's rules are for what Plasma's cannot do.
- **Plain descriptions** throughout the settings page and shortcuts.
- **Fixes:** a script error loop with two monitors (found by a new,
  hours-long soak test), and directional focus to a monitor a window had
  just left.

### Changed

- **Supported: Plasma's LTS and current releases**, on Wayland — 6.6 (the
  LTS) and 6.8 — both tested before every release, the LTS now with
  plasmashell too. 6.7 should keep working, but is no longer tested now that
  6.8 has replaced it.

## 1.0.0-rc2

*HyprKwin animations 1.0.0-rc2 (changed in this release).*

### Added

- **Rules from the window menu.** Alt+F3 on a window (or right-click its
  title bar) › Extensions › HyprKwin › *Always float*, *Always tile* or
  *Always open in the scratchpad*: the rule for that app goes into the
  settings page's list, replacing an earlier one of those for it, and the
  window follows it at once. KWin only lets JavaScript scripts add to that
  menu, so HyprKwin starts a small one (`code/menu.js`) alongside itself. The
  three are shortcuts too, unbound.

### Changed

- **Window rules are for what Plasma's own cannot do.** `fullscreen` and
  `maximize` rules did exactly what Plasma's window rules (System Settings ›
  Window Rules) do, so they move there by themselves when HyprKwin starts,
  with a message saying so; a rule with a `floating:` matcher, which Plasma's
  rules cannot express, stays and keeps working. Plasma's own rules are kept
  as they are, in whichever format your Plasma keeps them. The `hyprland.conf`
  importer likewise writes `fullscreen`, `maximize`, `minsize`, `maxsize` and
  `nofocus` rules as Plasma window rules (once, however often it runs). The
  rest of HyprKwin's rules are about tiling, workspaces, scratchpads and
  floating windows, or override HyprKwin's own settings. Raised on r/kde by a
  KDE contributor.

- **Descriptions say what things do, for Plasma users.** The settings page,
  the animations' settings, shortcut descriptions, the store description and
  the docs explained features by comparison with Hyprland ("like Hyprland",
  `dwindle:force_split`, "Inner gaps (gaps_in)"). They now describe each
  setting plainly; Hyprland comes up where it helps someone moving over (the
  default keys, the rule syntax, the importer). A few shortcuts read
  differently — "Keep window at its own size in its tile" (was "Pseudotile
  window"), "Send window to workspace N (stay here)" (was "Move window
  silently…"), "Back to the workspace you were on" (was "Former workspace")
  — with the same names and keys.

## 1.0.0-rc1

*HyprKwin animations unchanged: 0.16.1 is still current.*

### Fixed

- **Meta+→ (or any direction) to a monitor a window had just left did
  nothing.** With nothing that way on its own monitor, HyprKwin asked KWin
  for "the screen to the right", which KWin counts from its own idea of the
  active screen, and just after a window went to the other monitor and came
  back that was still the other one. The monitor that way is now found from
  where the focus is.

- **A script error loop with two monitors** (in every release since at least
  0.12, emulated per-monitor workspaces): a window sent back to its monitor
  just after the split beside it was nudged took the focus while still on its
  way; the current desktop followed it, KWin focused a window on that
  desktop, the desktop followed that one back, and so on until HyprKwin ran
  out of stack ("Maximum call stack size exceeded" in the log). A focus
  change HyprKwin's own desktop switch caused no longer moves the desktop
  again. Found by the new soak test (`tests/e2e/soak.py`), which runs hours
  of everyday use on two monitors and watches for errors, leaks and slowdown.

- **Upgrades are rehearsed:** the tests install 0.10, 0.12 and 0.15 from
  their release tags, with lived-in settings (an old-style rule, a submap, a
  workspace rule, colours and gaps, a key of your own, a saved layout),
  upgrade them as the KDE Store does, log in again, and check that all of it
  carried over and that the new version is the one running.

- **Faster layout switches with many windows open.** Switching layout on a
  workspace with 40 windows took up to 75 ms (a visible stutter), most of it
  making the icon tiles that stand in for tiles too small to use; those are
  now kept and used again, and the same switch takes about 25 ms. HyprKwin
  times its layout and drawing, and the tests hold them to a budget.

## 0.17.0

*HyprKwin animations unchanged: 0.16.1 is still current.*

- **The README is now a short front page**, with the details in
  [docs/](docs/): [getting started](docs/getting-started.md),
  [settings](docs/settings.md), [rules and scripting](docs/rules-and-scripting.md),
  [troubleshooting](docs/troubleshooting.md) (new: the common problems, and
  how to report one) and [development](docs/development.md).

- **`hyprkwinctl` comes with the KDE Store package** (in
  `~/.local/share/kwin/scripts/hyprkwin/contents/tools/`), and bug reports on
  GitHub have a form asking for what it says (`hyprkwinctl version`).

- **HyprKwin says when the animations are missing or off.** The animations
  are a separate KWin effect, and the KDE Store cannot make one depend on
  the other, so it is easy to end up with the script alone, or with the
  effect installed but never turned on (KWin only finds a new effect after
  logging in again, and then it still has to be switched on). Shortly after
  starting, HyprKwin says which, and where to fix it. Once: it remembers
  having said so, and "Tell me when the animations effect is missing or
  turned off" on the settings page (Behaviour) turns it off.
- **The message about keys other shortcuts hold comes once**, not at every
  login, and gives the command that hands them over. It comes again only if
  a key comes to clash later (a Plasma update, say). Meta+K still marks every
  one.

- **The animations effect keeps its own version** from now on: it only
  changes when the animations do, so an update to the script no longer
  brings an update to the effect with nothing in it. Every release says
  which version of the animations goes with it, and has both files.
  (`tools/release.sh` does the releasing.)

## 0.16.1

### Fixed

- **The keys guide (Meta+K) opened empty the second time:** only its title
  and search box showed. It now opens at the full list's height every time,
  and keeps that height while a search narrows the list (Qt also stops
  warning about a binding loop on its height).
- **With focus following the mouse, the keys guide closed as soon as the
  pointer moved.** Nothing has the keyboard while the guide is up, so the
  first window the pointer crossed took the focus, and taking the focus
  counted as being done with the guide. Focus that only follows the pointer
  (KWin's focus policy or HyprKwin's own setting) no longer closes it; Escape
  or Meta+K do, and the window under the pointer keeps the focus.

## 0.16.0

- **The workspace keys work on any keyboard layout.** Plasma matches a
  shortcut by the character a key types, so the defaults (`Meta+!` …
  `Meta+)` for moving a window to a workspace) only ever worked on a US
  layout: on a UK one Meta+Shift+3 is `Meta+£`, and on AZERTY even
  `Meta+1` needs Shift. HyprKwin now gives the workspace keys (switch, move,
  move silently, group window) the characters of the layout in use, from a
  table of every layout xkb knows, and follows when you switch layout. A key
  you rebound yourself stays as it is; where a layout's character already
  belongs to another shortcut, the workspace key keeps its old one and the
  key check reports it.
- **Getting ready for 1.0:** [docs/compatibility.md](docs/compatibility.md)
  lists what stays stable across upgrades (settings, shortcut names, rule
  syntax, `hyprkwinctl`'s commands, saved layouts) and what does not. Along
  with it:
  - Window rules kept the old way (one text entry, from before the settings
    page had its list) move into the list, so the page shows them. They
    applied all along; now you can see and edit them.
  - Saved layouts carry a format version. Older ones are still read.
  - `hyprkwinctl version` says what is installed and running, and which
    KWin. `hyprkwinctl state` is marked as internal, for debugging; scripts
    should use `windows --json` and `workspaces --json`.
  - The `dumpState` shortcut is labelled "Used by hyprkwinctl (leave
    unbound)" in System Settings, and left out of the keys guide.
- **A submap whose key another shortcut holds is reported**, as HyprKwin's
  other keys already were: on screen at start, and in the keys guide.
- **Tests:** a crash in the test sandbox no longer shows up as a crash of your
  desktop. Nothing the tests start leaves a core dump (a core limit of 1
  makes the kernel skip systemd-coredump, which KDE's crash reporter reads),
  and the sandbox has its own cache and state folders, where KWin's crash
  handler writes. A test still fails on a crash, from KWin's log.

## 0.15.1

- **The keys guide (Meta+K) can be searched**
  ([#6](https://github.com/DGBooth/HyprKwin/issues/6)): type and it narrows to
  the shortcuts whose name, section or keys hold every word, or whose name
  has the letters in order (`mvws` finds "Move window to workspace"). Escape
  empties the search, then closes the guide. While it is up nothing else has
  the keyboard, so typing reaches no window underneath; the one you were in
  has it back after. KWin gives scripts' windows no keyboard, so the guide
  holds the letter keys itself while it is up, and lets KDE forget them
  after: neither they nor its scrolling keys stay listed in System Settings
  any more.

## 0.15.0

- **Ready for Plasma 6.8.** Nothing HyprKwin uses changed, but KWin 6.8
  checks scripts more strictly and logged a warning for every setting read
  before the line that declares it; those are declared first now. The
  end-to-end tests also run against Plasma 6.8 in a container
  (`tools/test-plasma.sh 6.8`, which replaces `tools/test-plasma-6.6.sh`:
  `tools/test-plasma.sh 6.6` runs the 6.6 one).
- **Tests:** the panel tests run against a real plasmashell again (it needs
  kactivitymanagerd, and software drawing when nested on NVIDIA), and on
  Plasma 6.8 too; tests whose tools are missing say SKIP rather than pass;
  nothing the sandbox starts reaches your own session or outlives it; and
  on a machine with an integrated GPU beside an NVIDIA one, the tests use
  the integrated one.
- **The open/close animation picked in the animations effect's settings
  holds on Plasma 6.8.** 6.8 can load its own (Scale, by default) after
  HyprKwin's effect at login, which left both running; the choice is now
  applied again as windows open.

### Fixed

- **Activities** ([#2](https://github.com/DGBooth/HyprKwin/issues/2)):
  - Going to a workspace could switch activity. A workspace remembers the
    window used last on it, and focusing that window, when it was on another
    activity, took KWin there. Only windows on the current activity (and not
    minimized) are given the focus now, there and when a window closes.
  - Switching activity with several monitors could shuffle what they show,
    putting two workspaces' windows on one monitor. KWin remembers a desktop
    for each activity and switches to it, which HyprKwin took for a
    workspace switch on the monitor in use. Each activity now remembers what
    every monitor showed on it, and gets it back.
  - After switching activity, the window you last used there has the focus.

## 0.14.0

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

- **Keyboard resizes no longer slide the divider by default.** The slide
  holds the window that shrinks at its old size until the edge has passed it
  (220 ms), and when that is the window you are working in, Meta+- and
  Meta+Shift+- visibly lag behind the key while Meta+= and Meta+Shift+= do
  not. Now both windows resize at once. The slide is still there ("Slide the
  split when resizing from the keyboard"), and the hold's length is now set
  beside it on the settings page.

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
