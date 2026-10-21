# Rules and scripting

Window rules, workspace rules and submaps (key modes); `hyprkwinctl` for scripts and status bars; and importing a `hyprland.conf` if you are coming from Hyprland.

### Window rules

Window rules live in HyprKwin's settings: System Settings › Window
Management › KWin Scripts › HyprKwin (configure) › **Window rules**. They form
a list you can add to, edit, remove from and reorder, with a reference of
every action and matcher beside it. Press Apply and they take effect for
windows opened from then on.

Each rule is an action, then what to match. This is Hyprland's rule syntax,
so lines can be pasted from a `hyprland.conf` (a leading `windowrule =` is
accepted).

```
float, class:^(org\.kde\.kcalc)$
size 800 600, floating:1, class:^(org\.pulseaudio\.pavucontrol)$
center, floating:1, class:^(org\.pulseaudio\.pavucontrol)$
workspace 3 silent, class:^(discord)$
monitor 1, class:^(spotify)$
opacity 0.95 0.85, class:^(Alacritty)$
tile, class:^(steam)$, title:^Steam$
```

| Action | Does |
|---|---|
| `float` / `tile` | never / always tile the window |
| `pseudo`, `pin`, `group` | open it that way (pin: floating, above everything, on every workspace) |
| `special [name]` | send it to the scratchpad, or to a named one |
| `workspace special:name` | the same, as `hyprland.conf` writes it |
| `workspace N [silent]` | open it on workspace N (and stay where you are with `silent`) |
| `size W H`, `move X Y`, `center` | place a floating window; pixels or a percentage of the monitor |
| `monitor N` or `monitor DP-2` | open it on that monitor (counting from 0) |
| `opacity A [I]` | opacity while focused (and while not) |
| `noborder` | no border and no title bar |
| `focusonactivate [on\|off]` | whether it may pull you to it when it asks for attention |

**What these rules are for.** HyprKwin's rules cover what Plasma's own
window rules cannot: whether a window is tiled, which workspace or
scratchpad it opens on, where a floating window goes on its monitor (in
percentages too, and only once HyprKwin floats it), and exceptions to
HyprKwin's own settings (its border, its opacity, following a window that
asks for attention). For anything else — opening full screen or maximized,
keep above, minimum or maximum size, no focus, and much more — use Plasma's
own: System Settings › Window Management › Window Rules, or *More Actions ›
Configure Special Application Settings* in a window's menu (Alt+F3), which
fills in the app for you.

`fullscreen` and `maximize` were HyprKwin rules until 1.0. They move to
Plasma's window rules by themselves when HyprKwin starts (with plasmashell
running), with a message saying so; one with a `floating:` matcher, which
Plasma's rules cannot express, stays and keeps working.

Match on `class:` (the Wayland app id or X11 class) and `title:`, both
regular expressions, and on `floating:1` or `floating:0`. Rules are checked
inside KWin itself, so keep the patterns simple: a pathological one, with
nested repeats such as `(a+)+`, can stall the whole desktop while it runs. The first rule that
matches wins, for each kind of action. `float` is the one you want for apps
that manage their own windows (virtual machines, games, image editors).
Dialogs, transient windows, fixed-size windows and Plasma's own system
windows (polkit prompts, KRunner, Spectacle, the file-chooser portal, …)
float anyway.

**From the window menu.** The quickest way to make the commonest rules:
press Alt+F3 on a window (or right-click its title bar) and pick
*Extensions › HyprKwin › Always float …*, *Always tile …* or *Always open …
in the scratchpad*. The rule for that app goes into the list above, in place
of an earlier float, tile or scratchpad rule for it, and the window follows
it straight away. The same three are shortcuts too, unbound, in System
Settings › Keyboard › Shortcuts › KWin ("HyprKwin: Always float this app").

**Finding an app's class:** in System Settings › Window Management › Window
Rules, add a rule and use *Detect Window Properties*, then click the window.
From a terminal, the helper lists your open windows and writes the rule for
you. It edits the same list the settings page shows:

```bash
tools/hyprkwin-rules.py list        # number every open window
tools/hyprkwin-rules.py float 3     # never tile that app
tools/hyprkwin-rules.py tile 3      # always tile it
tools/hyprkwin-rules.py show        # what is set
tools/hyprkwin-rules.py remove 2    # drop one
```

### Workspace rules

Rules for the workspaces themselves, one per line, set in the settings
page's **Workspace rules** tab:

```
workspace = 3, monitor:DP-2, default:true
2, layout:master, gapsin:0, gapsout:0
```

| Property | Does |
|---|---|
| `monitor:N` or `monitor:DP-2` | keep that workspace on that monitor: switching to it goes there, and a window sent to it follows |
| `default:true` | the workspace that monitor starts the session on |
| `layout:dwindle\|master\|monocle\|scrolling\|stage` | the layout it starts with; `Meta+Shift+J` still changes it afterwards |
| gapsin:N`, `gapsout:N` or `gapsout:T R B L` | gaps for that workspace alone |

The `workspace = ` prefix is optional, so lines can be pasted straight out of
a `hyprland.conf`. The first rule for a workspace wins on each property, and a
rule with something wrong with it is reported rather than guessed at.

### Submaps

A submap is a mode: one key puts the keyboard into it, plain keys then do
something until Escape, and outside it those keys belong to your applications
again. Set them in the settings page's **Submaps** tab,
one per line: the name, the key that enters it, then each key and what it
does.

```
resize = Meta+R, Left: resizeLeft, Right: resizeRight, Up: resizeUp, Down: resizeDown
layout = Meta+Shift+L, D: layoutDwindle, M: layoutMaster, O: layoutMonocle, S: layoutScrolling
```

The name shows on screen while you are in one. Escape leaves, and so does the
key that entered it. The action names are the ones in System Settings >
Keyboard > Shortcuts > KWin without the "HyprKwin: " part; `hyprkwinctl
actions` lists them all.

Keys inside a submap are registered with KDE only while the submap is on, so
they never take a key away from an app the rest of the time.

### Controlling it from a script

`tools/hyprkwinctl` is the equivalent of `hyprctl`, for status bars and
scripts. Installed from the KDE Store or a release file, it is at
`~/.local/share/kwin/scripts/hyprkwin/contents/tools/hyprkwinctl` (run it
with `python3`, or link it into your `PATH`):

```bash
hyprkwinctl dispatch focusLeft     # run any action, as if you pressed its key
hyprkwinctl actions master         # every action, with the key it is on
hyprkwinctl windows --json         # what HyprKwin is tracking
hyprkwinctl workspaces             # what each monitor shows, and its layout
hyprkwinctl layout master          # show or set this workspace's layout
hyprkwinctl submap resize          # enter a submap, or ask which one is on
```

Actions go through KDE's global shortcuts, so anything bindable is runnable.
For the queries, `hyprkwinctl` briefly owns the D-Bus name `org.hyprkwin.Ctl`
and the running script sends its state there. Nothing is written to the
journal, so a status bar polling every second leaves no trail of your window
titles on disk.

`hyprkwinctl version` says what is installed and running, and which KWin;
include it in a bug report. Build scripts on `windows --json` and
`workspaces --json`: those stay stable, while `hyprkwinctl state` is
HyprKwin's internal state for debugging and changes with it. What else stays
stable across upgrades is in [docs/compatibility.md](compatibility.md).

### Importing a hyprland.conf

`tools/hyprkwin-import.py` reads an existing `hyprland.conf`, follows its
`source =` lines and `$variables`, and translates what HyprKwin has an
equivalent for:

- `general`, `decoration`, `dwindle`, `master`, `misc` and `input` settings,
  including `col.active_border` gradients and a `gaps_out` with a value per side
- `windowrule` and `windowrulev2` lines (v1's bare regex becomes `class:`).
  Those Plasma's own window rules do just as well — `fullscreen`,
  `maximize`, `minsize`, `maxsize` and `nofocus` — become Plasma window
  rules, in System Settings › Window Rules, rather than HyprKwin ones;
  running the import twice does not add them twice
- `workspace = ` rules
- `bind` lines, for every dispatcher HyprKwin has an action for, including
  named scratchpads, which take the four numbered slots in the order they
  appear

It prints what it would do and changes nothing until you add `--apply`;
`--no-settings`, `--no-rules` and `--no-binds` leave a part alone. Binds go
through KDE's global shortcuts after snapshotting them, so `tools/uninstall.sh`
still puts your original keys back.

Everything it cannot translate is listed with the line it came from, rather
than being guessed at: `exec` binds (a KWin script cannot launch programs),
mouse binds, submaps, and settings such as blur or shadows that belong to
Plasma's own effects.

---

[← HyprKwin](../README.md) · [Getting started](getting-started.md) · [Settings](settings.md) · [Rules and scripting](rules-and-scripting.md) · [Troubleshooting](troubleshooting.md) · [Compatibility](compatibility.md)
