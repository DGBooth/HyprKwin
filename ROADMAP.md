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

Rounded window corners were tried and dropped: every shader applied from a
scripted effect rendered the window black. The README points to Shape
Corners instead.

## Next

From a comparison with Krohnkite, Polonium, Karousel and KWin's own tiling
(September 2026), in order:

1. **On the KDE Store.** Krohnkite has around 100,000 downloads because it
   is one click away in System Settings' "Get New…". Needs a packaged
   `.kwinscript` (and `.kwineffect`) attached to every release, a package
   description that says what HyprKwin is now, and — the hard part — a way
   for someone who never ran `install.sh` to find out that Plasma still owns
   keys such as Meta+Left and Meta+1, and free them.
2. **The pointer follows keyboard focus**, as Hyprland does unless
   `cursor:no_warps` is set. Scripts can do it after all, through KWin's own
   "Move Mouse to Focus" action; Krohnkite and Karousel both do.
3. **Layouts survive logging out.** Each workspace's layout, master
   settings and column widths last only for the session today. Polonium
   keeps them with a companion service; HyprKwin should manage without one.
4. **Native per-screen virtual desktops.** Plasma 6.7 can switch desktops
   per screen by itself (Virtual Desktops settings, `PerOutputVirtualDesktops`
   in kwinrc). HyprKwin emulates that by putting windows on all desktops; it
   works alongside the native mode, but should use it when it is on, so the
   pager and Overview show the right desktop on each screen.

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
