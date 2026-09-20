# HyprKwin

Hyprland-style dwindle tiling for KDE Plasma 6, implemented as a KWin script.
You keep all of Plasma: panels, widgets, the task manager, Overview, virtual
desktops, activities, window rules, KRunner and System Settings.

- **Dwindle layout** with Hyprland's semantics: splits along the longer side,
  `gaps_in` / `gaps_out`, `default_split_ratio` (same units as Hyprland),
  `preserve_split`, `force_split`, `split_width_multiplier`, `togglesplit`,
  pseudotiling.
- **Workspaces = Plasma virtual desktops** (created on demand), including
  per-output desktops. Pager, Overview and the desktop switcher keep working.
- **Groups (tabbed windows)** with a clickable tab bar, like Hyprland's
  `togglegroup` / `moveintogroup` / `changegroupactive`.
- **Special workspace (scratchpad)**: `togglespecialworkspace` and
  `movetoworkspace special`.
- **Focus indicator** you choose: a Hyprland-style coloured border in the gap,
  optionally with rounded corners, following your colour scheme — or Plasma's
  own window decorations, or nothing.
- **Mouse**: Meta+drag a tiled window onto another to re-tile it there,
  Meta+right-drag (or drag an edge) to resize the split live. Optional
  focus-follows-mouse.
- **Window rules** in Hyprland syntax (`float, class:^(org\.kde\.kcalc)$`).
- **Multi-monitor**: directional focus, swap and move across monitors, and
  moving a workspace to another monitor.
- **Animations**: a companion KWin effect slides and stretches windows into
  their new tile, like Hyprland's `animations { windows }`.
- **Settings page** in System Settings › Window Management › KWin Scripts.

## Install

Requires Plasma 6 (developed against 6.7).

```bash
tools/install.sh
```

The script installs the package into `~/.local/share/kwin/scripts/hyprkwin`,
enables it and (re)loads it in the running KWin.

**Upgrades need a KWin restart.** KWin keeps a script's QML and JavaScript
cached for the lifetime of its process, so reloading the script re-runs the
*old* code. `install.sh` detects this and tells you; log out and back in to
activate an update. A first install works straight away. Other tiling scripts
(Polonium, Krohnkite, Bismuth) must be disabled; the installer warns if one
is enabled.

### Animations

`tools/install.sh` also installs a companion effect, **HyprKwin animations**,
which animates windows into their new tile instead of snapping them there.
A KWin script cannot draw or animate anything itself, so this has to be a
separate KWin *effect*; it animates the rendered window (like KWin's own
"Stretch" effect does for maximize), so applications never see the
intermediate sizes.

Enable it under System Settings › Window Management › Desktop Effects ›
"HyprKwin animations". **KWin only discovers a newly installed effect when it
starts**, so log out and back in after the first install. Its settings
(duration, curve, what to animate) are behind the effect's configure button:

| Setting | Hyprland equivalent | Default |
|---|---|---|
| Duration | `animation = windows, 1, 4, …` | 200 ms |
| Curve | `bezier` | ease out (cubic) |
| Animate move / resize | `windowsMove` / `windowsIn`+`windowsOut` | both on |
| Animate borders and tab bars | – | on |
| Skip jumps longer than | – | no limit |
| Window open/close | `windowsIn` / `windowsOut` | leave to Plasma |

"Window open/close" picks one of Plasma's own effects (Scale, Fade, Glide) or
turns them off. KWin treats those as mutually exclusive, so choosing one here
retires the others; "Leave to Plasma" keeps whatever Desktop Effects says.

Plasma's global animation speed (System Settings › General Behavior) is
applied on top of the duration, and setting it to "Instant" disables the
animation entirely. Window open and close animations stay Plasma's own
(Scale, Glide, …, under Desktop Effects).

### Keybindings and Plasma conflicts

KDE's shortcut daemon gives a key to whichever action claimed it first, so
HyprKwin's Hyprland-style keys only work once conflicting Plasma shortcuts
(Meta+Left quick tiling, Meta+1 task manager entries, Meta+Tab, Meta+T tile
editor, zoom on Meta+= / Meta+-, …) let go of them:

```bash
tools/hyprkwin-shortcuts.py check     # list conflicts, changes nothing
tools/hyprkwin-shortcuts.py apply     # hand the keys to HyprKwin (remembered)
tools/hyprkwin-shortcuts.py restore   # give them back
```

Everything can also be rebound by hand under System Settings › Keyboard ›
Shortcuts › KWin (all entries start with "HyprKwin:").

Defaults follow Omarchy's Hyprland bindings (Meta = SUPER). Shifted symbols
use the character they produce on a US layout, which is how Plasma stores
them (Shift+1 is `Meta+!`), so rebind those if you use another layout.

| Keys | Action |
|---|---|
| `Meta+Q` | Close window |
| `Meta+J` | Toggle window split |
| `Meta+P` | Pseudotile window |
| `Meta+T` | Toggle window floating/tiling |
| `Meta+F` | Full screen |
| `Meta+Alt+F` | Full width (maximize) |
| `Meta+O` | Pop window out (float & pin) |
| `Meta+Left` / `Right` / `Up` / `Down` | Focus window in direction (crosses monitors) |
| `Meta+Shift+Left` / `Right` / `Up` / `Down` | Swap window in direction (moves to the next monitor at the edge) |
| `Meta+-` / `Meta+=` | Shrink / grow window width |
| `Meta+_` / `Meta++` (Shift) | Shrink / grow window height |
| `Meta+Alt+…` / `Meta+Ctrl+…` with the above | Resize a little / a lot |
| `Meta+1…0` | Switch to workspace 1–10 |
| `Meta+Shift+1…0` (`Meta+!` … `Meta+)`) | Move window to workspace 1–10 and follow |
| `Meta+Shift+Alt+1…0` | Move window to workspace 1–10 silently |
| `Meta+Tab` / `Meta+Shift+Tab` | Next / previous workspace |
| `Meta+Ctrl+Tab` | Former workspace |
| `Meta+S` | Toggle scratchpad |
| `Meta+Alt+S` | Move window to / from scratchpad |
| `Meta+Shift+Alt+Left` / `Right` / `Up` / `Down` | Move workspace to monitor |
| `Ctrl+Alt+Tab` / `Ctrl+Alt+Shift+Tab` | Focus next / previous monitor |
| `Meta+G` | Toggle window grouping |
| `Meta+Alt+G` | Move window out of group |
| `Meta+Alt+Left` / `Right` / `Up` / `Down` | Move window into group in direction |
| `Meta+Alt+Tab` / `Meta+Alt+Shift+Tab` | Next / previous window in group |
| `Meta+Ctrl+Left` / `Right` | Previous / next window in group |
| `Meta+Alt+1…5` | Switch to group window 1–5 |
| unbound | Swap split halves, move window in direction (Hyprland `movewindow`), reload & retile |

Mouse: hold Meta and drag with the left button to move a window (drop it on
another tile to re-tile there, or on another monitor), or with the right
button to resize. This uses Plasma's window-action modifier (System Settings ›
Window Management › Window Behavior › Window Actions).

Alt+Tab, Meta+W (Overview), Meta+D and all other Plasma shortcuts that don't
clash stay as they are.

## Configuration

System Settings › Window Management › KWin Scripts › HyprKwin › configure.

| Setting | Hyprland equivalent | Default |
|---|---|---|
| Inner / outer gaps | `general:gaps_in` / `gaps_out` | 5 / 10 |
| Default split ratio | `dwindle:default_split_ratio` | 1.0 |
| Split width multiplier | `dwindle:split_width_multiplier` | 1.0 |
| New window goes | `dwindle:force_split` | right / bottom |
| Preserve split | `dwindle:preserve_split` | on |
| No gaps when only | `workspace = w[tv1], gapsout:0, gapsin:0` | off |
| Focused window shown by | title bars / `general:border_size` | coloured border |
| Border size | `general:border_size` | 2 px |
| Corner radius | `decoration:rounding` | 0 (square) |
| Focused / unfocused border colour | `col.active_border`, `col.inactive_border` | follow the colour scheme |
| Group tab bar height | `group:groupbar:height` | 22 |
| Focus follows mouse | `input:follow_mouse = 1` | off |
| Start each session on workspace 1 | – | on |
| Create workspaces on demand | – | on |
| Drop a dragged window to re-tile | `dwindle:use_active_for_splits` (roughly) | on |
| Tile dialogs and utility windows | `windowrule = tile, …` per app | off |
| Hide title bars on floating windows too | – | off |
| Scratchpad margin | – | 40 px |
| Window rules | `windowrule = …` | see below |

Border colours follow the colour scheme by default: the accent colour marks
the focused window and the scheme's dimmed colour the rest, so they change
with your Plasma theme. Either can be set to a fixed colour instead.

Settings apply as soon as you press OK or Apply: Plasma doesn't notify
scripts about their settings, so HyprKwin notices the change to `kwinrc` and
asks KWin to reload its configuration.

### Focus indicator

KWin can only switch a window's *whole* decoration on or off (`noBorder`);
there is no way to keep the frame and drop the title bar. So the two useful
styles are exclusive, and you pick one in the settings:

- **Coloured border** (default) — title bars are hidden for every tiled window
  and a border is drawn in the gap, like Hyprland's `col.active_border`. This
  looks the same for every app, which is its main advantage: it does not care
  whether an app uses server- or client-side decorations. It costs four thin
  overlay windows per border, since KWin scripts have no other way to draw on
  screen.
- **The window decoration** — HyprKwin leaves decorations alone and the
  decoration marks the focused window, creating no overlay windows at all.
  With a normal theme that means a title bar on every tile; a *frame-only*
  Aurorae theme gives the Hyprland look instead (see below). The catch is that
  Chromium/Electron/GTK apps decorate themselves, so no theme can mark them —
  HyprKwin fills those in with its own border.
- **Nothing** — title bars hidden, no border. Pair it with KWin's built-in
  *Dim Inactive* effect (System Settings › Desktop Effects) if you still want
  a focus cue without overlays.

#### Hyprland-style borders without overlays

Aurorae decoration themes can have `TitleHeight=0`, i.e. a frame and no title
bar. [Active Accent](https://github.com/nclarius/Plasma-window-decorations) by
Natalie Clarius does exactly that: its **Frame** flavour draws the accent
colour around the active window and the background colour around inactive
ones. Combined with "The window decoration" above, that gives Hyprland's
`col.active_border` look with zero overlay windows:

1. System Settings › Colors & Themes › Window Decorations › *Get New Window
   Decorations…* › search "Active Accent" › install **Active Accent Frame**
   (or copy the theme folder into `~/.local/share/aurorae/themes/`).
2. Select it, and keep Window border size at a normal value — the border *is*
   the indicator.
3. Set "Focused window shown by" to *The window decoration*.

The frame adds a few pixels around each window, so you may want smaller
`gaps_in`. Aurorae cannot draw borders on maximized windows, which does not
affect tiled windows (HyprKwin unmaximizes them).

**Apps that decorate themselves.** Chromium, Electron (Brave, VS Code, Claude
Desktop, Discord…) and most GTK apps draw their own frames on Wayland, so
KWin has no decoration to paint for them and *no* decoration theme can mark
them as focused. With "With decorations, still draw a border on apps that
decorate themselves" (on by default), HyprKwin draws its own border around
exactly those windows, so focus looks the same everywhere. Chromium-based
browsers can often be switched to server-side decorations in their own
settings ("Use system title bar and borders"), which hands them back to the
theme.

### Window rules

To stop an app being tiled, the quickest route is the helper, which lists the
windows you have open and writes the rule for you — no need to hunt down an
app's class:

```bash
tools/hyprkwin-rules.py list        # number every open window
tools/hyprkwin-rules.py float 3     # never tile that app
tools/hyprkwin-rules.py tile 3      # always tile it
tools/hyprkwin-rules.py show        # what is set
tools/hyprkwin-rules.py remove 2    # drop one
```

Rules apply immediately to windows opened afterwards. They are the same rules
the settings page shows under "Window rules", so you can also write them by
hand. One rule per line, in Hyprland's syntax (a leading `windowrule =` is
accepted, so lines can be pasted from `hyprland.conf`):

```
tile, class:^(steam)$, title:^Steam$
float, class:^(org\.kde\.kcalc)$
workspace 3 silent, class:^(discord)$
fullscreen, class:^(steam_app_.*)$
```

`float` is the one you want for apps that should keep their own window
management (virtual machines, games, image editors). Actions: `float`, `tile`,
`pseudo`, `fullscreen`, `maximize`, `group`, `special`, `pin`,
`workspace N [silent]`. Matchers: `class:` (the Wayland
app id / X11 class) and `title:`, both regular expressions. Rules apply to
newly opened windows. Dialogs, transient windows, fixed-size windows and
Plasma system windows (polkit prompts, KRunner, Spectacle, the file-chooser
portal, …) float automatically.

## How it fits into Plasma

- Tiled windows get their title bar hidden (optional); floating windows keep
  it. Unloading the script restores everything.
- Minimizing a tiled window gives its space to its neighbours; restoring it
  puts it back where it was. Windows on another activity are treated the same
  way.
- Moving a window with Plasma (task manager, pager, "Window to Desktop",
  "Window to Next Screen", dragging) re-tiles it in its new place.
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

- KWin scripts cannot move the mouse pointer, so there is no
  "cursor follows focus" / `cursor:warp_on_change_workspace`.
- The layout is dwindle only (no master or scrolling layout).
- Layout changes aren't animated beyond what Plasma's own effects do.
- Scripts can't bind mouse wheel shortcuts, so there's no Meta+scroll
  workspace switching.
- KWin caches script code per process, so upgrading needs a KWin restart
  (see above), and it does not destroy a script's overlay windows when the
  script is unloaded — HyprKwin closes any leftovers when it next starts, and
  `uninstall.sh` sweeps them.

## Development

```
package/
  metadata.json                KWin script metadata (declarative script)
  contents/code/engine.js      pure dwindle tree: layout, gaps, splits, groups, resize, directions
  contents/code/rules.js       Hyprland window-rule parser
  contents/code/driver.js      binds the engine to KWin (spaces, windows, actions)
  contents/code/shortcuts.js   default shortcuts
  contents/ui/main.qml         entry point: shortcuts, timers, overlays
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
fake-input protocol. One test also runs a real `plasmashell`. They need
`python3` with PySide6 and dbus-python.

```bash
python3 tests/e2e/run.py            # everything
python3 tests/e2e/run.py groups     # tests whose name contains "groups"
```

Debug logging: enable "Debug logging" in the settings, then
`journalctl --user -f | grep HyprKwin`.
