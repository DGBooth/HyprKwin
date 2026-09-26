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

Rounded window corners were tried and dropped: every shader applied from a
scripted effect rendered the window black. The README points to Shape
Corners instead.

## Next

- **Publish the KDE Store listing.** The packages, the key check and the
  listing text (`docs/store-listing.md`) are ready; the listing itself needs
  the maintainer's KDE Store account.

## Later

- A deeper scrolling layout, closer to Karousel: stacked columns, preset
  widths, touchpad gestures, moving a column to another desktop.
- More layouts: spiral, plain columns.
- Layouts per activity.
- Testing on X11 and older Plasma 6 releases.

## Not possible with KWin scripts

- Mouse-wheel binds (Meta+scroll).
- Window swallowing: scripts cannot see a window's parent process.
- Blur and shadows belong to Plasma's own effects.
