# Roadmap

HyprKwin aims at people coming to Plasma from Hyprland: the things a
Hyprland user notices come first. Each step ships on its own, with tests, a
README update and a changelog entry.

## Done

| Step | Shipped in |
|---|---|
| Richer window rules (`size`, `move`, `center`, `monitor`, `opacity`, `noborder`, `floating:`) | 0.5 |
| Gradient borders, active/inactive opacity, borders on floating windows | 0.6 |
| Upgrades without logging out | 0.7 |
| Master and monocle layouts | 0.8 |
| Scrolling layout, turning border gradient (`borderangle`) | 0.9 |
| Named scratchpads, workspace rules, focus to the neighbour on close | 0.10 |
| `hyprland.conf` importer, submaps, `hyprkwinctl` | 0.10 |
| The pointer follows keyboard focus; zoom (first version); layouts survive logging out; Plasma's own per-screen desktops; zoom icons and Escape; packages and the key check for the store | 0.11 |
| Keys guide (`Meta+K`); KDE Store listings | 0.12 |

Rounded window corners were tried and dropped: every shader applied from a
scripted effect rendered the window black. The README points to Shape
Corners instead.

## Next

- **Activities** ([#2](https://github.com/DGBooth/HyprKwin/issues/2), waiting
  on the reporter's reply). Today windows on another activity drop out of the
  layout, but each workspace's tiling tree is shared by every activity: its
  layout, splits, master settings, zoom, focus history and what each monitor
  shows. Full support gives every activity its own set of workspaces:
  - Spaces keyed by activity as well as desktop and monitor, so switching
    activity brings back the arrangement left there, monitor by monitor.
  - Windows on all activities: tile in whichever activity is current, or
    float — to decide.
  - Scratchpads shared by default, per activity as a setting.
  - `activity:` in window rules and workspace rules.
  - Next/previous activity and "move window to activity" actions, unbound;
    the key helper stops taking Plasma's `Meta+Tab` activity switcher.
  - Saved layouts, `hyprkwinctl` and the keys guide aware of activities.
  - A settings-page switch: "Separate workspaces for each activity".
  - The test sandbox needs kactivitymanagerd and a few activities first.

- **Shift+digit binds on any keyboard layout.** `Meta+!`…`Meta+)` are the
  characters a US layout gives; on others (Shift+3 is £ on a UK one) moving a
  window to a workspace has no key. Pick the characters of the active layout,
  or register both. (Writing them as `Meta+Shift+1` does not work: KWin
  never matches that form; see #4.)
- **Say when a submap's key is taken**, as HyprKwin already does for its
  other shortcuts; `hyprkwin-shortcuts.py` could hand those over too.

## Later

- A deeper scrolling layout, closer to Karousel: stacked columns, preset
  widths, touchpad gestures, moving a column to another desktop.
- More layouts: spiral, plain columns.
- Testing on X11 and older Plasma 6 releases.

## Not possible with KWin scripts

- Mouse-wheel binds (Meta+scroll).
- Window swallowing: scripts cannot see a window's parent process.
- Blur and shadows belong to Plasma's own effects.
