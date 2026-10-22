# Settings

Everything on HyprKwin's settings page (System Settings › Window Management › KWin Scripts › HyprKwin), and how each part behaves.

## Configuration

System Settings › Window Management › KWin Scripts › HyprKwin › configure.

| Setting | In `hyprland.conf` | Default |
|---|---|---|
| Layout | `dwindle` / `master` / scrolling (hyprscrolling) | dwindle |
| Column width (scrolling) | `hyprscrolling:column_width` | 0.5 |
| Master area size, master count, master area position | `master:mfact`, `master:orientation` | 0.55, 1, left |
| New windows become the master | `master:new_status` | off |
| Inner / outer gaps | `general:gaps_in` / `gaps_out` | 5 / 10 |
| Outer gap per-side (top, right, bottom, left) | `gaps_out = 10 20 10 20` | same as outer gap |
| Default split ratio | `dwindle:default_split_ratio` | 1.0 |
| Split width multiplier | `dwindle:split_width_multiplier` | 1.0 |
| New window goes | `dwindle:force_split` | right / bottom |
| Preserve split | `dwindle:preserve_split` | on |
| No gaps when only | `workspace = w[tv1], gapsout:0, gapsin:0` | off |
| Focused window shown by | title bars / `general:border_size` | coloured border |
| Border size | `general:border_size` | 2 px |
| Corner radius | `decoration:rounding` | 0 (square) |
| Focused / unfocused border colour | `col.active_border`, `col.inactive_border` | follow the colour scheme |
| Focused border as a gradient (two colours and an angle) | `col.active_border = rgba(33ccffee) rgba(00ff99ee) 45deg` | off |
| Turning the gradient | `animation = borderangle, …` | off (0°/s) |
| Focused / unfocused window opacity | `decoration:active_opacity`, `inactive_opacity` | 1.0 (untouched) |
| Group tab bar height | `group:groupbar:height` | 22 |
| Focus follows mouse | `input:follow_mouse = 1` | off |
| Start each session on workspace 1 | – | on |
| Every monitor has its own workspaces | one workspace per monitor | on |
| Go to a window that asks to be activated | `misc:focus_on_activate` | on |
| Closing a window focuses its neighbour | – | on |
| Move the pointer to a window focused from the keyboard | `cursor:no_warps` (inverted) | on |
| Slide the split when resizing from the keyboard | `animation = windows` (for resizes) | on (needs the effect) |
| Create workspaces on demand | – | on |
| Drop a dragged window to re-tile | `dwindle:use_active_for_splits` (roughly) | on |
| Tile dialogs and utility windows | `windowrule = tile, …` per app | off |
| Hide title bars on floating windows too | – | off |
| Scratchpad margin | – | 40 px |
| Extra scratchpads | `special:name` workspaces | none |
| Workspace rules | `workspace = …` | see [Workspace rules](rules-and-scripting.md#workspace-rules) |
| Window rules | `windowrule = …` | see [Window rules](rules-and-scripting.md#window-rules) |

Border colours follow the colour scheme by default: the accent colour marks
the focused window and the scheme's dimmed colour the rest, so they change
with your Plasma theme. Either can be set to a fixed colour instead, and the
focused one to a gradient between two colours at any angle. The gradient can
turn slowly around the border; that is off by default, since it redraws the
border continuously.

Settings apply as soon as you press OK or Apply: Plasma doesn't notify
scripts about their settings, so HyprKwin notices the change to `kwinrc` and
asks KWin to reload its configuration.

### Workspaces and monitors

Plasma's virtual desktops normally span every monitor: switching desktop
changes them all. HyprKwin gives every monitor its own workspaces instead,
built on the same virtual desktops:

- A second display comes up showing workspace 2 (a third shows 3, and so on),
  creating the desktop if it does not exist yet.
- `Meta+1…0` switches only the monitor you are on. If that workspace is
  already up on another monitor, focus jumps there instead — a workspace
  lives on one monitor at a time.
- So `Meta+Shift+2` sends a window to whichever monitor is showing workspace
  2: with two displays that is the everyday "put this over there".
  `Meta+Ctrl+Shift+arrow` moves a window to a monitor directly, and at the
  edge of a screen `Meta+Shift+arrow` carries a window across too.
- `Meta+Shift+Alt+arrow` swaps two monitors' workspaces, windows and all.
- Monitors can come and go mid-session: plug one in (or switch it on) and it
  takes the next free workspace straight away. Unplug it and its windows move
  across but keep their workspace, so plugging it back in puts them where
  they were. No need to log out.

The one seam this leaves: Plasma only has one current desktop, so windows the
other monitors are showing are marked "on all desktops" to keep them up. They
show as pinned in the task manager and the pager puts everything you can see
on the current desktop. Turn the setting off to go back to plain Plasma
behaviour, where a workspace spans every monitor.

**Plasma 6.7's own per-screen desktops.** If you turn on System Settings ›
Virtual Desktops › "Switch desktops independently for each screen", HyprKwin
uses it: KWin itself shows each monitor's workspace, windows stay on their own
desktop (no longer on all of them), and the pager and Overview show the right
workspace on each screen. Switching one from the pager works too. Everything
else behaves the same either way.

### The pointer follows keyboard focus

Focusing a window from the keyboard — Meta+arrow, a monitor
switch, focusing the master, cycling, or sending the window to another monitor
— moves the pointer to it, unless it is already over the window. It is done
through KWin's own "Move Mouse to Focus" action. Turn off "Move the pointer to
a window focused from the keyboard" in the settings to leave the pointer
where it is.

### Focus after closing a window

Close a window and the focus goes to the one that takes its place: the other
side of the split it shared, or the next tab if it was in a group. When two
windows could take over, the one you used more recently wins.

Plasma on its own picks the window you used longest ago, wherever it is, so
closing a window on the left can land you in the bottom-right corner. Turn
"Closing a window focuses the neighbour that takes its place" off in the
settings to go back to that.

### Relaunching an app that is already open

Launch an app that is already open on another workspace and HyprKwin takes you
there — its workspace comes up on the monitor it lives on, and a minimized
window is restored. Plasma on its own only flags the window: its focus
stealing prevention turns down an app's request to come forward whenever you
have been typing or clicking elsewhere.

A script cannot tell "I was launched again" from "I have a new message": chat
apps ask for attention the same way. If one keeps pulling you over, opt it out
with a rule (it then just flags itself in the taskbar, as in plain Plasma):

```
focusonactivate off, class:^(discord|vesktop|org\.telegram\.desktop)$
```

### Layouts

Five layouts, each workspace with its own:

- **Dwindle** (the default): every new window splits the focused one in
  two, along its longer side.
- **Master**: a master area beside a stack. The master area can take any share
  of the screen, hold several windows, and sit on any side or in the
  middle, which gives the three-column layout.
- **Monocle**: one window at a time, each filling the workspace, with
  everything else behind it.
- **Scrolling**: a strip of columns, wider than the screen. Moving the
  focus scrolls the strip, and the resize keys widen or narrow the focused
  column. Only whole columns are shown; the ones out of view wait past the
  last monitor, so nothing ever spills onto the screen next door.
- **Stage**, after macOS's Stage Manager: the focused window takes the
  stage, and the workspace's other windows wait beside it as live previews,
  tilted towards it, most recently used at the top. Click one (or cycle with
  the "next window in the layout" keys) to bring it onto the stage; the one
  that was there goes to the top of the strip. The previews have a strip of
  their own, on the left or right ("Stage previews" on the Layout tab, with
  its width), so the stage window never covers them. The windows waiting
  there are still running, off screen, which is how their previews stay
  live. Switching, the new window grows out of its preview while the old
  one shrinks into the strip, at Plasma's animation speed (none at
  Instant). Floating windows stay in front of the stage. With only one
  window there is no strip.

  Windows can share the stage, as in Stage Manager: drag a preview onto the
  stage and that window joins the one there, the two splitting it as dwindle
  splits. Choosing another preview, they wait in the strip together, as one
  preview with both their icons, and come back together. To part them,
  drag a window off the stage onto the strip (Meta+drag, as for any tiled
  window): it waits there on its own and the rest keep the stage. Or
  right-click a set's preview to separate its windows, or use "Take window out
  of its stage set" (a shortcut, unbound) on the focused window. Closing a
  window, floating it or sending it to another workspace takes it out too.
  Previews step aside for a menu or one of Plasma's popups that reaches
  over them (the app launcher, in a corner), as borders do.

In the scrolling layout, `Meta+Left` / `Meta+Right` move along the strip and
`Meta+Shift+Left` / `Meta+Shift+Right` move the column itself, rather than
going by what is where on screen.

`Meta+Shift+J` moves the current workspace to the next layout; there are also
shortcuts to pick one directly. In the master layout, `Meta+M` swaps the
focused window with the master, `Meta+Shift+M` focuses the master,
`Meta+>` / `Meta+<` change how many windows are masters, and `Meta+Alt+M`
moves the master area round. The resize keys and dragging the edge move the
boundary between the master area and the stack, exactly as they move a
dwindle split.

Each workspace keeps its layout and master settings from one session to the
next: HyprKwin saves them in `~/.config/hyprkwinrc` (through Plasma, since a
KWin script cannot write files itself) and reads them back when you log in.
The setting decides what a workspace you have never changed starts with, and
a layout you choose wins over a workspace rule's. Where each window sat is not
kept — the windows are new each session.

Changing the layout, or the split direction on `Meta+J`, puts a short message
on screen naming what it changed to, in the manner of Plasma's own on-screen
display, framed in the focus border's colours. Turn it off with "Show a
message when the layout or split changes".

### Zoom

In the dwindle layout, `Meta+Z` zooms in towards the focused window: the
part of the layout around it — its split, then its split's split, down to the
window alone — fills the workspace in the same arrangement, a level at a
time. Everything else waits off screen, still running. `Meta+Shift+Z` zooms
back out a level at a time, and a message says how much of the workspace is
on screen. Focusing a window that is out of view (Alt+Tab, a notification)
zooms out to show it; windows you open while zoomed in join the zoom. The idea
comes from [Trellis](https://trellisui.com/)'s fractal workspaces.

As in Trellis, a tile too small to use — under 120 pixels either way, which
you can change on the Layout tab — shows its app's icon instead; click it and
HyprKwin zooms in until the window is big enough. And if you turn on "While
zoomed in, Escape zooms back out", Escape steps back out a level at a time;
it is taken from your apps only while a zoom lasts.

### Scratchpads

`Meta+S` shows and hides the scratchpad, and `Meta+Alt+S` puts the focused
window into it or takes it back out. A scratchpad is a workspace of its own
that slides over whichever one you are on: somewhere to keep a terminal, a
music player or notes that you call up and dismiss.

For more than one, name them in the settings page under **Extra scratchpads**:
the first name is scratchpad 1, the second scratchpad 2, and so on, up to
four. Their keys are unbound by default — set them in System Settings >
Keyboard > Shortcuts > KWin, under "HyprKwin: Toggle scratchpad 1". A window
goes into one with the matching move key, or with a rule:

```
workspace special:music, class:^(spotify)$
```

Only one scratchpad is on screen at a time: opening one puts the other away.

### Focus indicator

KWin can only switch a window's *whole* decoration on or off (`noBorder`);
there is no way to keep the frame and drop the title bar. So the two useful
styles are exclusive, and you pick one in the settings:

- **Coloured border** (default) — title bars are hidden for every tiled window
  and a coloured border is drawn in the gap around the focused one. This
  looks the same for every app, which is its main advantage: it does not care
  whether an app uses server- or client-side decorations. It costs a few thin
  overlay windows per border, since KWin scripts have no other way to draw on
  screen. Floating windows get the border too when they have no title bar
  (hidden with "Hide title bars on floating windows too", or an app that
  draws its own), and a border steps aside wherever a menu or a window stacked
  above would otherwise have it painted across it.
- **The window decoration** — HyprKwin leaves decorations alone and the
  decoration marks the focused window, creating no overlay windows at all.
  With a normal theme that means a title bar on every tile; a *frame-only*
  Aurorae theme gives a plain coloured frame instead (see below). The catch is that
  Chromium/Electron/GTK apps decorate themselves, so no theme can mark them —
  HyprKwin fills those in with its own border.
- **Nothing** — title bars hidden, no border. Pair it with KWin's built-in
  *Dim Inactive* effect (System Settings › Desktop Effects) if you still want
  a focus cue without overlays.

#### A coloured border without overlays

Aurorae decoration themes can have `TitleHeight=0`, i.e. a frame and no title
bar. [Active Accent](https://github.com/nclarius/Plasma-window-decorations) by
Natalie Clarius does exactly that: its **Frame** flavour draws the accent
colour around the active window and the background colour around inactive
ones. Combined with "The window decoration" above, that gives a coloured
border with no overlay windows at all:

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

---

[← HyprKwin](../README.md) · [Getting started](getting-started.md) · [Settings](settings.md) · [Rules and scripting](rules-and-scripting.md) · [Troubleshooting](troubleshooting.md) · [Compatibility](compatibility.md)
