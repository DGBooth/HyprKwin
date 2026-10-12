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

## 1.0

1.0 is a stability release: no headline feature, but a promise that what is
there stays put and keeps working.

- **Your setup survives upgrades.** Setting names, shortcut names, the rule
  and submap syntax, `hyprkwinctl`'s output and the saved-layout format only
  change with a migration that runs on its own. After 1.0, anything that
  breaks a setup means 2.0.
- **It never takes the desktop down:** no KWin crashes, no stuck windows, a
  clean uninstall.
- **Plasma 6.6 to 6.8, on Wayland**, each tested before every release.
- **Any keyboard layout, any setup**, not only a US keyboard.

The way there:

1. **0.16: ready to freeze.**
   - An audit of every name that 1.0 freezes: settings, shortcuts, rules,
     submaps, `hyprkwinctl` and saved layouts. Anything awkward is renamed
     now, while that is allowed.
   - Settings migrations that run when HyprKwin starts, not only from
     `tools/install.sh`, which nobody installing from the store runs.
   - Shift+digit binds on any keyboard layout (a blocker: on a UK layout,
     moving a window to a workspace has no key).
   - A warning when a submap's key is taken.
2. **0.17: first impressions.**
   - A one-time notice for KDE Store installs, offering to sort out the
     Plasma shortcuts that HyprKwin's keys clash with.
   - A one-time notice when the animations effect is missing ("get HyprKwin
     animations from Desktop Effects › Get New") or installed but off (KWin
     only finds a new effect after logging in again, and then it still has
     to be switched on). The store cannot make one depend on the other, and
     the effect cannot tell anyone anything, so the script says it. Shown
     once, remembered, and with a switch on the settings page.
   - The README split into a short front page and a few docs pages
     (getting started, settings, rules and submaps, troubleshooting).
   - An issue template asking for the Plasma version and a `hyprkwinctl`
     state dump.
3. **1.0-rc1, on GitHub only to begin with.**
   - A soak test: hours of windows opening and closing, monitors coming and
     going, sleep and wake, with KWin's memory and HyprKwin's overlays
     watched throughout.
   - Layout speed with 30 or more windows.
   - Upgrades rehearsed from 0.10, 0.12 and 0.15 with real settings.
   - A couple of weeks of feedback.
4. **1.0.**

Not part of 1.0: separate workspaces for each activity, more layouts,
translations.

## Next

- **Plasma's window rules for what Plasma already does.** Several of
  HyprKwin's window rule actions duplicate Plasma's own window rules: `size`,
  `move`, `center`, `monitor`, `opacity`, `noborder`, `pin` and
  `focusonactivate`. Two rule systems that do the same thing is one too many,
  so they move across (raised on r/kde by a KDE contributor):
  - The `hyprland.conf` importer writes those as Plasma window rules
    (`kwinrulesrc`), so they show up in System Settings › Window Rules with
    everything else.
  - A migration, run when HyprKwin starts, moves existing ones there and
    drops them from HyprKwin's list, once. The 1.0 promise covers this: no
    setup breaks.
  - HyprKwin's rules keep what only a tiler needs: `float`/`tile`,
    `floating:`, `pseudo`, `group`, workspaces and scratchpads. The moved
    actions are still read for a release or two, with a notice saying where
    they went.
  - To work out: how Hyprland's matchers (regular expressions on class and
    title) map onto Plasma's match types, and what happens to a rule that
    sets both a tiler action and a moved one.
- **Rules from the window menu** (1.1). Alt+F3 › Extensions › HyprKwin ›
  "Always float *app*", "Always tile *app*", "Always open *app* in the
  scratchpad": a click writes the rule for that app into the settings page's
  list and applies it at once. Proven by a spike (branch
  `spike/window-menu`) on Plasma 6.6, 6.7 and 6.8. KWin only lets JavaScript
  scripts add to the window menu, so a small one (`code/menu.js`) is started
  by HyprKwin; the click runs a new HyprKwin action (also bindable as a
  shortcut), and HyprKwin writes the rule itself. Still to do:
  - Entries straight under Extensions ("HyprKwin: Always float …") rather
    than a submenu of their own.
  - The app's name rather than its class (`org.kde.dolphin`).
  - More entries: open on workspace 1–10, no border.
  - A proper test, and checking the menu's style matches on a real desktop.
  - Upstream: KWin has a TODO to let QML scripts add window-menu entries
    themselves; with that, the helper script goes. Worth raising with KWin's
    developers, along with a rules-panel hook for tiling scripts.
- **Say what it does, not what Hyprland does.** Hyprland is mentioned about
  130 times: the settings page (tooltips like "like Hyprland", "Hyprland's
  default"), the store description, the README and docs, and code comments.
  Most of those explain a feature by comparison, which means nothing to
  someone who has never used Hyprland and reads as a clone to people who know
  Plasma. Go through them all:
  - Settings page and keys guide: describe the behaviour plainly. These are
    what Plasma users read first.
  - README, docs and store description: lead with what HyprKwin does in
    Plasma. Mention Hyprland where it helps a convert: the importer, the rule
    syntax, the default keys, and a "coming from Hyprland" section in
    getting started that maps Hyprland's settings onto HyprKwin's.
  - Code comments: keep a mention where it records why something behaves the
    way it does (matching Hyprland on purpose); drop the rest.
  - The name stays (1.0 freezes it).
- **Separate workspaces for each activity** ([#2](https://github.com/DGBooth/HyprKwin/issues/2)).
  Windows on another activity drop out of the layout, focus stays on the
  current activity, and each activity remembers what every monitor shows.
  Each workspace's tiling tree is still shared by every activity, though: its
  layout, splits, master settings and zoom. Full support gives every activity
  its own set of workspaces:
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

## Later

- A deeper scrolling layout, closer to Karousel: stacked columns, preset
  widths, touchpad gestures, moving a column to another desktop.
- More layouts: spiral, plain columns.

Shift+digit binds and submap key warnings moved into 0.16 above. X11 and
Plasma before 6.6 are not supported: Plasma 6.8 is Wayland only.

## Not possible with KWin scripts

- Mouse-wheel binds (Meta+scroll).
- Window swallowing: scripts cannot see a window's parent process.
- Blur and shadows belong to Plasma's own effects.
