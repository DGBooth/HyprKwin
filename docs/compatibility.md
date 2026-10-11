# Compatibility

What HyprKwin keeps stable, so that an upgrade never undoes your setup.

From 1.0, HyprKwin follows [semantic versioning](https://semver.org): a
1.x release never breaks anything listed under "Kept stable". Anything that
would means 2.0. Until 1.0, renaming is still allowed, but only with a
migration that runs on its own, so your settings carry over either way.

## Supported

- Plasma 6.6 (the LTS release), 6.7 and 6.8, on Wayland. Each is tested
  before every release.
- Any keyboard layout. The workspace keys follow the layout's digit row.
- X11 and Plasma before 6.6 are not supported. Plasma 6.8 is Wayland only.

## Kept stable

**Settings.** These are the entries in `~/.config/kwinrc`, under
`[Script-hyprkwin]` for the script and `[Effect-hyprkwinanimations]` for the
animations:

- Names and meanings don't change.
- New settings come with defaults that behave as before.
- The settings stored as numbers (layout, master orientation, focus
  indicator, border colour source, the animation curve and the open/close
  animation) only gain new choices at the end. Existing numbers keep their
  meaning.
- Older forms are still read:
  - `HideTitleBars` stands in where there is no `FocusIndicator`.
  - Window rules kept in the old `WindowRules` text entry move into the
    settings page's list (`WindowRuleList`) the first time HyprKwin starts
    with plasmashell running.

**Shortcut names.** Every action is registered with KDE as `HyprKwin
<action>`, for example `HyprKwin focusLeft` and `HyprKwin moveToDesktop3`.

- The names are what your own key choices are stored under, and what
  `hyprkwinctl dispatch` takes. They don't change.
- Default keys may change for new actions. A key you set yourself is never
  replaced.
- The workspace keys only ever move between the keys HyprKwin itself gives
  them on different keyboard layouts.

**Rule syntax.** The window rules, workspace rules and submaps written in
the settings page, in the `hyprland.conf` style. Existing rules keep
working; new actions and matchers may be added.

**`hyprkwinctl`.** These commands are stable:

- `dispatch`, `actions`, `layout`, `submap` and `version`;
- the JSON of `windows --json` and `workspaces --json`. Fields may be
  added, never renamed or removed.

**Saved layouts.** The layout, master and zoom choices kept in
`~/.config/hyprkwinrc` for each workspace. The format has a version number,
and every later HyprKwin reads every earlier one.

**Package names.** `hyprkwin` (the KWin script) and `hyprkwinanimations` (the
effect), which the KDE Store and System Settings know them by.

## Not covered

- `hyprkwinctl state` prints HyprKwin's internal state, for debugging. It
  changes whenever HyprKwin does. Build on `windows` and `workspaces`
  instead.
- The `HyprKwin dumpState` shortcut. `hyprkwinctl` uses it; it isn't for a
  key.
- The D-Bus traffic between the script and `hyprkwinctl`
  (`org.hyprkwin.Ctl`). Use `hyprkwinctl` itself.
- Everything under `tests/` and the developer tools in `tools/`, apart from
  `hyprkwinctl` and the install and uninstall scripts.
- How things look: borders, messages and the keys guide may change.
