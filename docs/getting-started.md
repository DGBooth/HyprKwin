# Getting started

Installing HyprKwin and its animations, handing Plasma's clashing keys over, and uninstalling.

## Install

Requires Plasma 6.6, 6.7 or 6.8 on Wayland (each tested before every release;
X11 is not supported). Plasma 6.7's own per-screen desktops are used when they are
on; on 6.6, HyprKwin gives each monitor its own workspaces itself. A full Plasma install has everything HyprKwin
needs; a minimal one also needs Qt's `QtCore` and `Qt.labs.folderlistmodel`
QML modules (`qml6-module-qtcore` and `qml6-module-qt-labs-folderlistmodel` on
Debian and Ubuntu, part of `qt6-declarative` on Arch). The helper scripts also need `python3` with dbus-python
(`python-dbus` on Arch, `python3-dbus` on Debian, Ubuntu and Fedora) and
`qdbus6`. `hyprkwinctl`'s queries and `hyprkwin-rules.py list` also need
PyGObject (`python-gobject` on Arch, `python3-gi` on Debian and Ubuntu,
`python3-gobject` on Fedora).

**From the KDE Store:**

1. System Settings › Window Management › KWin Scripts › "Get New…", search
   for **HyprKwin** ([store page](https://www.opendesktop.org/p/2375015/)),
   install it, and tick it in the list.
2. For animations: Desktop Effects › "Get New…", search for **HyprKwin
   animations** ([store page](https://www.opendesktop.org/p/2375020/)),
   install it, log out and back in once (KWin only finds a new effect at
   startup), and tick it.
3. Plasma keeps the keys it already uses (Meta+Left, Meta+1…) until they are
   handed over: HyprKwin says which a few seconds after it starts, and its
   settings page (Behaviour tab) gives the one command that does it.

Updates arrive through the same "Get New…" dialogs.

**From a release file:** download `hyprkwin-<version>.kwinscript` (and
`hyprkwinanimations-<version>.kwineffect`) from the
[latest release](https://github.com/DGBooth/HyprKwin/releases/latest), then
KWin Scripts › "Install from File…" for the script, and
`kpackagetool6 --type=KWin/Effect -i <file>` for the effect (the Desktop
Effects page cannot install from a file). The animations keep their own
version, which only moves when they change, so the two numbers can differ;
every release has a pair that works together.

**From the repository:** the steps below install both, hand the keys over and
back up your shortcuts first.

1. **Install:**

   ```bash
   tools/install.sh
   ```

   Before changing anything, this backs up every global shortcut you have
   (to `~/.local/share/hyprkwin/shortcuts-before-hyprkwin.json`, plus a copy
   of `~/.config/kglobalshortcutsrc` beside it), so that uninstalling can put
   them all back. It then installs the script and the animations effect into
   `~/.local/share/kwin/`, enables both and starts the script.

2. **Give HyprKwin its keys.** Plasma already uses several of the
   Hyprland-style keys (Meta+Left, Meta+1…, Meta+Tab, …), and the first
   action to claim a key keeps it:

   ```bash
   tools/hyprkwin-shortcuts.py check   # see what clashes (changes nothing)
   tools/hyprkwin-shortcuts.py apply   # hand those keys to HyprKwin
   ```

   See [Keybindings and Plasma conflicts](#keybindings-and-plasma-conflicts).

3. **Log out and back in** once, so KWin picks up the animations effect (it
   only discovers new effects when it starts).

4. **Coming from Hyprland?** Bring your old config across:

   ```bash
   tools/hyprkwin-import.py            # reads ~/.config/hypr/hyprland.conf
   tools/hyprkwin-import.py --apply    # and writes the settings it found
   ```

   See [Importing a hyprland.conf](rules-and-scripting.md#importing-a-hyprlandconf).

To remove it again, see [Uninstall](#uninstall).

**Upgrades apply without logging out.** Run `tools/install.sh` again and it
reloads HyprKwin in the running session. (KWin caches a script's code for as
long as it runs, so HyprKwin loads each installed version from a folder of
its own.) The one exception is the upgrade *to* 0.7 from an older version,
which needs one last logout; the installer says so when it does. Other
tiling scripts (Polonium, Krohnkite, Bismuth) must be disabled; the installer
warns if one is enabled.

### Animations

`tools/install.sh` also installs a companion effect, **HyprKwin animations**,
which animates windows into their new tile instead of snapping them there.
A KWin script cannot draw or animate anything itself, so this has to be a
separate KWin *effect*; it animates the rendered window (like KWin's own
"Stretch" effect does for maximize), so applications never see the
intermediate sizes.

Enable it under System Settings › Window Management › Desktop Effects ›
"HyprKwin animations". **KWin only discovers a newly installed effect when it
starts**, so log out and back in after the first install. HyprKwin says so
once if it finds the effect missing or turned off (a switch on its settings
page turns that off). Its settings
(duration, curve, what to animate) are behind the effect's configure button:

| Setting | Hyprland equivalent | Default |
|---|---|---|
| Duration | `animation = windows, 1, 4, …` | 200 ms |
| Curve | `bezier` | ease out (cubic) |
| Animate move / resize | `windowsMove` / `windowsIn`+`windowsOut` | both on |
| Animate borders and tab bars | – | on |
| Skip jumps longer than | – | no limit |
| Window open/close | `windowsIn` / `windowsOut` | leave to Plasma |

Windows animate when they change tile (opening, closing, swapping,
toggling a split).

A keyboard resize can slide the divider, without the usual tricks (off by
default: turn on "Slide the split when resizing from the keyboard"). Stretching
the apps' contents to fake the in-between sizes squashes their text, and
resizing them at every step makes Chromium and Electron apps flicker, so
each app resizes exactly once: the one that grows gets its new size at once
and is uncovered as the edge travels; the one that shrinks keeps its old size
while the edge slides over it, then resizes (after 220 ms, set beside the
setting). That hold is why it is off by default: when the window you are
working in is the one that shrinks, it visibly lags behind the key. The focus
border moves with the edge. While an edge is dragged with the mouse nothing animates; the
neighbours simply follow the pointer.

The slide needs this effect; without the slide, both windows resize at once.

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

`Meta+K` brings up a guide to all of them, as they are bound right now —
rebound keys, submaps and named scratchpads included, and any key another
shortcut still holds marked as such. Typing searches it: every word you
type has to appear in a shortcut's name, section or keys (`close`,
`scratchpad`, `shift`), or its letters in order in the name (`mvws` finds
"Move window to workspace"). It scrolls with the wheel or the arrow and page
keys; Escape empties the search, then closes it, as does `Meta+K` again.
While it is up, the keyboard is the guide's, so nothing you type reaches the
window underneath; that window has it back when the guide closes.

Your own shortcuts are safe either way: before changing anything,
`install.sh` takes a snapshot of every global shortcut
(`~/.local/share/hyprkwin/shortcuts-before-hyprkwin.json`, plus a copy of
`kglobalshortcutsrc` next to it), and uninstalling puts them all back. The
snapshot is never overwritten by a later install or upgrade.

Defaults follow Omarchy's Hyprland bindings (Meta = SUPER). Plasma stores a
shortcut by the character a key types, so the workspace keys (Meta, or
Meta+Shift, with the digit row) are given the characters of the keyboard
layout you use: Meta+Shift+3 is `Meta+#` on a US layout, `Meta+£` on a UK
one, and on AZERTY, where the digits need Shift, Meta with the 1 key is
`Meta+&`. Switching layout moves them along. A key you rebound yourself is
left alone, and where a layout's character already belongs to another
shortcut (`=` is Shift+0 on a German layout, and Meta+= moves a split), the
workspace key keeps its old one and HyprKwin's key check says so. The
table below shows the US keys.

| Keys | Action |
|---|---|
| `Meta+K` | Show every HyprKwin shortcut, on the keys they have now |
| `Meta+Q` | Close window |
| `Meta+J` | Toggle window split (dwindle) |
| `Meta+Shift+J` | Next layout (dwindle, master, monocle, scrolling) |
| `Meta+Z` / `Meta+Shift+Z` | Zoom in towards the focused window / back out (dwindle) |
| `Meta+M` / `Meta+Shift+M` | Swap window with the master / focus the master |
| `Meta+>` / `Meta+<` | One more / one fewer master window |
| `Meta+Alt+M` | Move the master area round |
| `Meta+P` | Pseudotile window |
| `Meta+T` | Toggle window floating/tiling |
| `Meta+F` | Full screen |
| `Meta+Alt+F` | Full width (maximize) |
| `Meta+O` | Pop window out (float & pin) |
| `Meta+Left` / `Right` / `Up` / `Down` | Focus window in direction (crosses monitors) |
| `Meta+Shift+Left` / `Right` / `Up` / `Down` | Swap window in direction (moves to the next monitor at the edge) |
| `Meta+-` / `Meta+=` | Move the split beside the window left / right |
| `Meta+_` / `Meta++` (Shift) | Move the split above or below it up / down |
| `Meta+Alt+…` / `Meta+Ctrl+…` with the above | Move it a little / a lot |
| `Meta+1…0` | Switch to workspace 1–10 |
| `Meta+Shift+1…0` (`Meta+!` … `Meta+)`) | Move window to workspace 1–10 and follow |
| `Meta+Shift+Alt+1…0` | Move window to workspace 1–10 silently |
| `Meta+Tab` / `Meta+Shift+Tab` | Next / previous workspace |
| `Meta+Ctrl+Tab` | Former workspace |
| `Meta+S` | Toggle scratchpad |
| `Meta+Alt+S` | Move window to / from scratchpad |
| unbound | Toggle named scratchpad 1–4, and move a window to / from it |
| `Meta+Ctrl+Shift+Left` / `Right` / `Up` / `Down` | Move window to the monitor in that direction |
| `Meta+Shift+Alt+Left` / `Right` / `Up` / `Down` | Swap this monitor's workspace with that one's |
| `Ctrl+Alt+Tab` / `Ctrl+Alt+Shift+Tab` | Focus next / previous monitor |
| `Meta+G` | Toggle window grouping |
| `Meta+Alt+G` | Move window out of group |
| `Meta+Alt+Left` / `Right` / `Up` / `Down` | Move window into group in direction |
| `Meta+Alt+Tab` / `Meta+Alt+Shift+Tab` | Next / previous window in group |
| `Meta+Ctrl+Left` / `Right` | Previous / next window in group |
| `Meta+Alt+1…5` | Switch to group window 1–5 |
| unbound | Pick a layout directly, previous layout, move the master area back, focus next/previous window in the layout, swap split halves, move window in direction (Hyprland `movewindow`), reload & retile |

Mouse: hold Meta and drag with the left button to move a window (drop it on
another tile to re-tile there, or on another monitor), or with the right
button to resize. This uses Plasma's window-action modifier (System Settings ›
Window Management › Window Behavior › Window Actions).

Alt+Tab, Meta+W (Overview), Meta+D and all other Plasma shortcuts that don't
clash stay as they are.

## Uninstall

```bash
tools/uninstall.sh
```

This:

- removes HyprKwin's own shortcuts,
- puts every global shortcut back exactly as it was before HyprKwin was
  installed, from the snapshot `install.sh` took: the keys HyprKwin moved
  aside, and any you reassigned by hand to settle a clash,
- disables and removes both the script and the animations effect,
- closes the focus-border windows, which KWin would otherwise leave on
  screen.

Your windows stay where they are and get their title bars back. No logout is
needed, and Plasma's own quick tiling and tile editor work again straight
away.

Putting the snapshot back also undoes shortcut changes you made yourself
after installing. To keep those, use `tools/uninstall.sh --keep-shortcuts`,
which only gives back the keys HyprKwin moved.

Run from a TTY with Plasma not running, it still removes HyprKwin and its
shortcuts, and tells you to run `tools/hyprkwin-shortcuts.py reinstate` once
you are logged in to put the rest back.

A few things are left in place, in case you reinstall:

- **Settings**: the `[Script-hyprkwin]` group in `~/.config/kwinrc`, plus
  `[Effect-hyprkwinanimations]` if you changed any animation settings. Delete
  those groups to forget them.
- **Virtual desktops** that HyprKwin created on demand. Remove any you don't
  want under System Settings › Window Management › Virtual Desktops.
- **Other tiling scripts** you disabled for HyprKwin (Polonium, Krohnkite, …)
  stay disabled; turn them back on under System Settings › Window
  Management › KWin Scripts.

---

[← HyprKwin](../README.md) · [Getting started](getting-started.md) · [Settings](settings.md) · [Rules and scripting](rules-and-scripting.md) · [Troubleshooting](troubleshooting.md) · [Compatibility](compatibility.md)
