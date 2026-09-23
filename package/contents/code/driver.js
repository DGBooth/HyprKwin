// HyprKwin driver: binds the pure engine to KWin.
//
// A "space" is a virtual desktop on one output ("<desktopId>|<outputName>"),
// or the special workspace. Plasma stays in charge of desktops, activities,
// minimizing, fullscreen and maximizing; the driver only decides where tiled
// windows go and reacts when Plasma moves them.

var SPECIAL = "special";

// Scratchpads are Hyprland's special workspaces. The unnamed one is called
// "special"; extra ones are named in the settings page. Only one is ever on
// screen at a time, as in Hyprland.
function specialSpace(name) { return SPECIAL + ":" + name; }
function isSpecialSpace(space) { return String(space).indexOf(SPECIAL + ":") === 0; }

function createDriver(env) {
    var ws = env.workspace;
    var E = env.engine;
    var R = env.rules;

    var cfg = {};
    var rules = [];
    var ruleErrors = [];
    var workspaceRules = {};        // workspace number -> rule
    var ruledSpaces = {};           // spaces whose layout: rule has been applied
    var engine = E.createEngine({});
    var tracked = {};         // id -> state
    var syncing = 0;          // >0 while we mutate KWin state ourselves
    // name: the scratchpad currently on screen, or null when none is.
    var special = { name: null, screen: null };
    function specialShown() { return special.name !== null; }
    var previousDesktop = null;
    var lastAreas = "";
    var drag = null;          // {st, mode, last}
    var stopped = false;
    var reloads = 0;

    // ---- helpers -----------------------------------------------------------

    function log() {
        if (!cfg.debug) return;
        env.log("HyprKwin: " + Array.prototype.join.call(arguments, " "));
    }

    function bool(v, d) {
        if (v === undefined || v === null || v === "") return d;
        return v === true || v === "true" || v === 1 || v === "1";
    }

    function num(v, d) {
        var n = parseFloat(v);
        return isNaN(n) ? d : n;
    }

    function idOf(w) {
        return w ? String(w.internalId) : "";
    }

    function stOf(w) {
        return w ? tracked[idOf(w)] : null;
    }

    function guarded(fn) {
        syncing++;
        try { fn(); } finally { syncing--; }
    }

    function copyRect(r) {
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    function sameRect(a, b, tol) {
        tol = tol || 0;
        return !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol &&
            Math.abs(a.width - b.width) <= tol && Math.abs(a.height - b.height) <= tol;
    }

    function encloses(outer, inner) {
        return inner.x >= outer.x && inner.y >= outer.y &&
            inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
    }

    function contains(r, p) {
        return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
    }

    function screens() {
        var list = ws.screenOrder && ws.screenOrder.length ? ws.screenOrder : ws.screens;
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i]);
        return out;
    }

    // Hyprland gives every monitor its own workspaces. KWin's virtual desktops
    // are global (its currentDesktopForScreen pair is a stub that still
    // switches every screen), so HyprKwin keeps the workspace each output
    // shows here: the focused output drives Plasma's current desktop, and
    // windows visible on the other outputs are put on all desktops so a
    // switch here leaves them where they are.
    var shown = {};                 // output name -> desktop id
    var formerShown = {};           // output name -> the desktop before that

    function perOutput() {
        return !!cfg.perOutputWorkspaces && screens().length > 1;
    }

    // The monitor the user is on: where the focused window is, since KWin's
    // own activeScreen can follow the pointer instead.
    function focusedScreen() {
        var act = stOf(ws.activeWindow);
        if (act && !act.special) {
            var space = engine.spaceOf(act.id);
            var p = (space && !isSpecialSpace(space)) ? parseSpace(space) : null;
            if (p && p.screen) return p.screen;
            if (act.w.output) return act.w.output;
        }
        return ws.activeScreen || screens()[0] || null;
    }

    // ---- workspace rules ---------------------------------------------------

    function workspaceNumber(d) {
        var ds = ws.desktops;
        for (var i = 0; i < ds.length; i++) if (ds[i] === d) return i + 1;
        return 0;
    }

    function workspaceRuleFor(d) {
        return d ? (workspaceRules[workspaceNumber(d)] || null) : null;
    }

    // The monitor a workspace rule pins this workspace to, if any.
    function screenForWorkspace(d) {
        var r = workspaceRuleFor(d);
        return r && r.monitor ? screenForRule(r.monitor) : null;
    }

    // The workspace a monitor starts on, from "default:true".
    function defaultDesktopFor(screen, used) {
        for (var n in workspaceRules) {
            var r = workspaceRules[n];
            if (!r.isDefault) continue;
            if (r.monitor && screenForRule(r.monitor) !== screen) continue;
            var d = ws.desktops[r.index - 1];
            if (d && !used[d.id]) return d;
        }
        return null;
    }

    function desktopFor(screen) {
        if (screen && perOutput()) {
            var d = desktopById(shown[screen.name]);
            if (d) return d;
        }
        return ws.currentDesktop;
    }

    // The first workspace nobody is showing, creating one if we may.
    function freeDesktop(used, screen) {
        var ds = ws.desktops;
        for (var i = 0; i < ds.length; i++) {
            if (used[ds[i].id]) continue;
            var pinned = screen ? screenForWorkspace(ds[i]) : null;
            if (pinned && pinned !== screen) continue;
            return ds[i];
        }
        if (!cfg.autoCreateDesktops) return null;
        ws.createDesktop(ds.length, "");
        ds = ws.desktops;
        var made = ds[ds.length - 1];
        return (made && !used[made.id]) ? made : null;
    }

    // Remember what each output shows, forget outputs that went away, and
    // give a monitor we have not seen before a workspace of its own: a second
    // display comes up on workspace 2, as it would under Hyprland.
    function refreshShown() {
        var cur = ws.currentDesktop;
        var ss = screens(), live = {}, used = {};
        // The monitor being used comes first: it keeps its workspace, and
        // holds whatever workspace Plasma is on.
        var focused = focusedScreen();
        var order = ss.slice();
        if (focused) order = [focused].concat(order.filter(function (s) { return s !== focused; }));
        ss.forEach(function (s) { live[s.name] = true; });
        order.forEach(function (s) {
            var d = desktopById(shown[s.name]);
            if (d && !used[d.id]) used[d.id] = true;
            else shown[s.name] = null;
        });
        for (var name in shown) if (!live[name]) delete shown[name];
        order.forEach(function (s) {
            if (shown[s.name]) return;
            var d = null;
            if (s === focused || !cfg.perOutputWorkspaces || ss.length < 2) d = used[cur.id] ? null : cur;
            if (!d) d = defaultDesktopFor(s, used);
            if (!d) d = freeDesktop(used, s) || cur;
            shown[s.name] = d.id;
            used[d.id] = true;
        });
    }

    // Put every window on the Plasma desktop that makes it visible where
    // HyprKwin wants it. Windows shown on an output other than the focused
    // one go on all desktops, so switching workspace here does not disturb
    // them; the rest sit on their own workspace, which Plasma then hides.
    // Whether KWin itself would draw a window right now. A client on a hidden
    // desktop ignores the geometry we send it, so the layout has to know.
    function kwinVisible(w) {
        if (w.minimized) return false;
        if (w.onAllDesktops) return true;
        for (var i = 0; i < w.desktops.length; i++) if (w.desktops[i] === ws.currentDesktop) return true;
        return false;
    }

    function syncWorkspaces() {
        if (!perOutput()) {
            releaseAutoPins();
            return;
        }
        var cur = ws.currentDesktop;
        var changed = false;
        guarded(function () {
            for (var id in tracked) {
                var st = tracked[id], w = st.w;
                if (st.special || st.pinned || !w.output) continue;
                var mine = desktopById(st.desktop) || cur;
                // Where we have put it, not where KWin has it yet: a window
                // that is on its way to another monitor still reports the old
                // one until the client has caught up.
                var space = engine.spaceOf(id);
                var p = (space && !isSpecialSpace(space)) ? parseSpace(space) : null;
                var here = desktopFor((p && p.screen) || w.output);
                if (mine === here && mine !== cur) {
                    if (!w.onAllDesktops) { w.onAllDesktops = true; changed = true; }
                    st.autoPinned = true;
                    continue;
                }
                // Hidden, but its own workspace is the one on show elsewhere:
                // park it on this output's workspace or Plasma would draw it.
                var target = (mine !== here && mine === cur) ? here : mine;
                // Parking the active window would make KWin switch desktop to
                // follow it; leave it be until it settles.
                if (target !== mine && w === ws.activeWindow) continue;
                st.autoPinned = false;
                if (w.onAllDesktops) { w.onAllDesktops = false; changed = true; }
                if (w.desktops.length !== 1 || w.desktops[0] !== target) {
                    w.desktops = [target];
                    changed = true;
                }
            }
        });
        // A window only takes a new size once KWin is actually showing it, so
        // lay out again on the next tick.
        if (changed) schedule();
    }

    // A monitor went away (or the setting was turned off): windows we had
    // pinned to keep them visible there go back on their own workspace.
    function releaseAutoPins() {
        var any = false;
        guarded(function () {
            for (var id in tracked) {
                var st = tracked[id], w = st.w;
                if (!st.autoPinned) continue;
                st.autoPinned = false;
                if (st.special || st.pinned) continue;
                var d = desktopById(st.desktop);
                if (w.onAllDesktops) { w.onAllDesktops = false; any = true; }
                if (d && (w.desktops.length !== 1 || w.desktops[0] !== d)) { w.desktops = [d]; any = true; }
            }
        });
        if (any) schedule();
    }

    // The workspace a window joins when it appears, or lands on an output.
    function desktopIdFor(w) {
        var here = desktopFor(w.output);
        if (!perOutput() || w.onAllDesktops || !w.desktops || w.desktops.length !== 1) {
            return here ? here.id : ws.currentDesktop.id;
        }
        // Opening "on the current desktop" really means "here", which on a
        // second monitor is whatever that monitor is showing.
        var d = w.desktops[0];
        return (d === ws.currentDesktop && here) ? here.id : d.id;
    }

    function spaceFor(desktop, screen) {
        return desktop.id + "|" + screen.name;
    }

    function screenByName(name) {
        var ss = screens();
        for (var i = 0; i < ss.length; i++) if (ss[i].name === name) return ss[i];
        return null;
    }

    function desktopById(id) {
        var ds = ws.desktops;
        for (var i = 0; i < ds.length; i++) if (ds[i].id === id) return ds[i];
        return null;
    }

    function parseSpace(space) {
        var i = space.lastIndexOf("|");
        return { desktop: desktopById(space.slice(0, i)), screen: screenByName(space.slice(i + 1)) };
    }

    function workArea(screen, desktop) {
        return copyRect(ws.clientArea(env.maximizeArea, screen, desktop));
    }

    function onCurrentActivity(w) {
        var acts = w.activities;
        return !acts || acts.length === 0 || acts.indexOf(ws.currentActivity) >= 0;
    }

    function onVisibleDesktop(w) {
        if (w.onAllDesktops) return true;
        var d = desktopFor(w.output);
        for (var i = 0; i < w.desktops.length; i++) if (w.desktops[i] === d) return true;
        return false;
    }

    function isMaximized(w) {
        return w.maximizeMode !== undefined && w.maximizeMode !== 0;
    }

    // ---- configuration -----------------------------------------------------

    // The settings page stores these as the index of a combo box.
    var LAYOUT_NAMES = ["dwindle", "master", "monocle", "scrolling"];
    var ORIENTATION_NAMES = ["left", "right", "top", "bottom", "center"];

    // 0: let Plasma draw title bars (no overlays at all)
    // 1: hide title bars, draw our own border
    // 2: hide title bars, no focus indicator
    var INDICATOR_DECORATIONS = 0, INDICATOR_BORDER = 1;

    // The settings page's colour buttons save KConfig's "r,g,b[,a]" form;
    // QML wants "#aarrggbb". Hex and colour names pass through.
    function colour(value, fallback) {
        var v = String(value || "").trim();
        var m = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d{1,3}))?$/.exec(v);
        if (m) {
            var hex = function (n) { n = Math.max(0, Math.min(255, parseInt(n, 10))); return (n < 16 ? "0" : "") + n.toString(16); };
            return "#" + hex(m[4] === undefined ? 255 : m[4]) + hex(m[1]) + hex(m[2]) + hex(m[3]);
        }
        return v || fallback;
    }

    // A StringList setting as plain strings, however KWin hands it over.
    function nameList(list) {
        var items = [];
        if (list && typeof list === "object" && list.length !== undefined) {
            for (var i = 0; i < list.length; i++) items.push(String(list[i]));
        } else if (list) {
            items = splitConfigList(String(list));
        }
        return items.map(function (n) { return n.trim(); }).filter(function (n) { return n !== ""; });
    }

    // The settings page keeps rules as a list, one per row; configs from
    // before it did kept them as newline-separated text. Both are read.
    function ruleText(list, legacy) {
        var items = [];
        if (list && typeof list === "object" && list.length !== undefined) {
            for (var i = 0; i < list.length; i++) items.push(String(list[i]));
        } else if (list) {
            items = splitConfigList(String(list));
        }
        var text = items.join("\n");
        legacy = String(legacy || "");
        if (legacy) text = text ? text + "\n" + legacy : legacy;
        return text;
    }

    // KConfig's list form (items separated by commas, "\," for a comma in an
    // item), for when a list comes back as a single string.
    function splitConfigList(text) {
        var out = [], cur = "";
        for (var i = 0; i < text.length; i++) {
            var c = text.charAt(i);
            if (c === "\\" && i + 1 < text.length) { cur += text.charAt(++i); continue; }
            if (c === ",") { out.push(cur); cur = ""; continue; }
            cur += c;
        }
        out.push(cur);
        return out.filter(function (x) { return x.trim() !== ""; });
    }

    function loadConfig() {
        var rc = env.readConfig;
        var indicator = num(rc("FocusIndicator", -1), -1);
        if (indicator < 0) {
            // Older configs only had a "hide title bars" switch.
            indicator = bool(rc("HideTitleBars", true), true) ? INDICATOR_BORDER : INDICATOR_DECORATIONS;
        }
        // 0: follow the colour scheme, 1: custom colour. The old boolean is
        // still honoured so existing configs keep their look.
        var activeSource = num(rc("ActiveBorderSource", -1), -1);
        if (activeSource < 0) activeSource = bool(rc("UseAccentColor", true), true) ? 0 : 1;
        cfg = {
            gapsIn: num(rc("GapsIn", 5), 5),
            gapsOut: num(rc("GapsOut", 10), 10),
            splitRatio: num(rc("SplitRatio", "1.0"), 1.0),
            splitWidthMultiplier: num(rc("SplitWidthMultiplier", "1.0"), 1.0),
            preserveSplit: bool(rc("PreserveSplit", true), true),
            forceSplit: num(rc("ForceSplit", 2), 2),
            noGapsWhenOnly: bool(rc("NoGapsWhenOnly", false), false),
            groupBarHeight: num(rc("GroupBarHeight", 22), 22),
            groupBarGap: 2,
            focusIndicator: indicator,
            borderOnUndecorated: bool(rc("BorderOnUndecorated", true), true),
            activeBorderSource: activeSource,
            inactiveBorderSource: num(rc("InactiveBorderSource", 0), 0),
            startOnFirstDesktop: bool(rc("StartOnFirstDesktop", true), true),
            tileDialogs: bool(rc("TileDialogs", false), false),
            dragToRetile: bool(rc("DragToRetile", true), true),
            borderSize: num(rc("BorderSize", 2), 2),
            borderRadius: num(rc("BorderRadius", 0), 0),
            hideFloatingTitleBars: bool(rc("HideFloatingTitleBars", false), false),
            activeBorderColor: colour(rc("ActiveBorderColor", "#33ccff"), "#33ccff"),
            inactiveBorderColor: colour(rc("InactiveBorderColor", "#595959"), "#595959"),
            activeBorderColor2: colour(rc("ActiveBorderColor2", "#00ff99"), "#00ff99"),
            borderGradientAngle: num(rc("BorderGradientAngle", 45), 45),
            borderGradientSpin: Math.max(0, num(rc("BorderGradientSpin", 0), 0)),
            activeOpacity: Math.max(0.1, Math.min(1, num(rc("ActiveOpacity", "1.0"), 1.0))),
            inactiveOpacity: Math.max(0.1, Math.min(1, num(rc("InactiveOpacity", "1.0"), 1.0))),
            showInactiveBorders: bool(rc("ShowInactiveBorders", false), false),
            focusFollowsMouse: bool(rc("FocusFollowsMouse", false), false),
            autoCreateDesktops: bool(rc("AutoCreateDesktops", true), true),
            defaultLayout: LAYOUT_NAMES[num(rc("DefaultLayout", 0), 0)] || "dwindle",
            columnWidth: Math.max(0.1, Math.min(1, num(rc("ColumnWidth", "0.5"), 0.5))),
            masterFactor: Math.max(0.05, Math.min(0.95, num(rc("MasterFactor", "0.55"), 0.55))),
            masterCount: Math.max(1, num(rc("MasterCount", 1), 1)),
            masterOrientation: ORIENTATION_NAMES[num(rc("MasterOrientation", 0), 0)] || "left",
            masterNewIsMaster: bool(rc("MasterNewIsMaster", false), false),
            perOutputWorkspaces: bool(rc("PerOutputWorkspaces", true), true),
            focusOnActivate: bool(rc("FocusOnActivate", true), true),
            layoutOsd: bool(rc("LayoutOsd", true), true),
            // How long that message stays up; not in the settings page.
            osdDuration: Math.max(200, num(rc("OsdDuration", 1200), 1200)),
            slideDivider: bool(rc("SlideDivider", true), true),
            // How long a shrinking window keeps its old size while the
            // animations effect slides the divider over it (the effect's
            // slide takes 180ms).
            slideHold: Math.max(0, num(rc("SlideHold", 220), 220)),
            specialMargin: num(rc("SpecialMargin", 40), 40),
            // Names for the extra scratchpads, in the order their shortcuts
            // are numbered. Unnamed slots still work, as "scratchpad N".
            scratchpadNames: nameList(rc("ScratchpadNames", "")),
            resizeStep: num(rc("ResizeStep", 100), 100),
            windowRules: ruleText(rc("WindowRuleList", ""), rc("WindowRules", "")),
            workspaceRules: ruleText(rc("WorkspaceRuleList", ""), ""),
            debug: bool(rc("Debug", false), false),
        };
        engine.setConfig(cfg);
        var parsed = R.parseRules(cfg.windowRules + "\n" + R.DEFAULT_RULES.join("\n"));
        rules = parsed.rules;
        ruleErrors = parsed.errors;
        var spaces = R.parseWorkspaceRules(cfg.workspaceRules);
        workspaceRules = spaces.rules;
        // A changed rule applies again, even to a space that has one already.
        ruledSpaces = {};
        spaces.errors.forEach(function (e) { ruleErrors.push("workspace rule, " + e); });
        ruleErrors.forEach(function (e) { env.log("HyprKwin rule error: " + e); });
    }

    // ---- window classification --------------------------------------------

    function trackable(w) {
        if (!w || w.deleted || !w.managed) return false;
        if (w.specialWindow || w.popupWindow || w.desktopWindow || w.dock) return false;
        if (w.inputMethod || w.lockScreen || w.outline) return false;
        // KWin-internal windows (including our own overlays) have no owner.
        if (w.pid <= 0 && !w.resourceClass) return false;
        return !!(w.normalWindow || w.dialog || w.utility);
    }

    var OVERLAY_TITLE = "HyprKwin overlay";

    function isOverlay(w) {
        return !!w && w.pid <= 0 && String(w.caption) === OVERLAY_TITLE;
    }

    // Keep our border/tab-bar windows out of the task manager, pager,
    // Alt+Tab and Overview.
    function hideOverlay(w) {
        if (!w || w.pid > 0 || String(w.caption) !== OVERLAY_TITLE) return;
        if (!w.skipTaskbar) w.skipTaskbar = true;
        if (!w.skipPager) w.skipPager = true;
        if (!w.skipSwitcher) w.skipSwitcher = true;
        // KWin decorates script windows despite FramelessWindowHint, which
        // forces a thin strip up to the decoration's minimum size.
        if (!w.noBorder) w.noBorder = true;
    }

    function fixedSize(w) {
        var mn = w.minSize, mx = w.maxSize;
        return mn && mx && mn.width > 0 && mn.height > 0 && mn.width === mx.width && mn.height === mx.height;
    }

    function shouldTile(st) {
        var w = st.w;
        if (st.floating || st.pinned) return false;
        if (!w.resizeable || !w.moveable || fixedSize(w)) return false;
        if (st.ruleTile) return true;
        // Apps mark these in different ways: a Qt "dialog" often arrives as a
        // transient normal window. Modal ones always float.
        if (cfg.tileDialogs && !w.modal && !w.skipTaskbar) return true;
        if (!w.normalWindow || w.transient || w.modal || w.skipTaskbar) return false;
        return true;
    }

    function spaceOfWindow(st) {
        if (st.special) return specialSpace(st.special);
        var w = st.w;
        if (!w.output) return null;
        if (perOutput() && !st.pinned) {
            var d = desktopById(st.desktop);
            return d ? spaceFor(d, w.output) : null;
        }
        if (w.onAllDesktops || !w.desktops || w.desktops.length !== 1) return null;
        return spaceFor(w.desktops[0], w.output);
    }

    function isTiled(st) {
        return !!st && engine.has(st.id);
    }

    // Whether a window currently takes part in the layout of its space.
    function visible(id) {
        var st = tracked[id];
        if (!st) return false;
        var w = st.w;
        if (w.minimized) return false;
        if (st.special) return st.special === special.name;
        return onCurrentActivity(w);
    }

    // ---- tiling state transitions ------------------------------------------

    function setTiledDecoration(st, tiled) {
        var w = st.w;
        var hide = st.ruleNoBorder || (tiled ? cfg.focusIndicator !== INDICATOR_DECORATIONS : cfg.hideFloatingTitleBars);
        if (hide) {
            if (st.origNoBorder === undefined) st.origNoBorder = w.noBorder;
            if (!w.noBorder) w.noBorder = true;
        } else if (st.origNoBorder !== undefined) {
            if (w.noBorder !== st.origNoBorder) w.noBorder = st.origNoBorder;
            st.origNoBorder = undefined;
        }
    }

    function tile(st, opts) {
        var space = spaceOfWindow(st);
        if (!space) return false;
        var w = st.w;
        opts = opts || {};
        if (!opts.cursor) opts.cursor = ws.cursorPos;
        engine.add(st.id, space, opts);
        if (isMaximized(w)) w.setMaximize(false, false);
        setTiledDecoration(st, true);
        st.placed = null;
        log("tile", w.caption, "->", space);
        return true;
    }

    function untile(st) {
        if (!isTiled(st)) return;
        engine.detach(st.id);
        setTiledDecoration(st, false);
        st.placed = null;
    }

    function centeredRect(st, screen) {
        var w = st.w;
        var area = workArea(screen || w.output, desktopFor(screen || w.output));
        var size = st.natural || { width: w.width, height: w.height };
        var width = Math.min(size.width, area.width * 0.9), height = Math.min(size.height, area.height * 0.9);
        if (width < 200 || height < 150) { width = area.width * 0.6; height = area.height * 0.6; }
        return {
            x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2),
            width: Math.round(width), height: Math.round(height),
        };
    }

    function makeFloating(st) {
        var w = st.w;
        var wasTiled = isTiled(st);
        st.floating = true;
        untile(st);
        if (wasTiled) {
            var r = st.floatGeom && contains(workArea(w.output, desktopFor(w.output)), { x: st.floatGeom.x + 10, y: st.floatGeom.y + 10 })
                ? st.floatGeom : centeredRect(st);
            w.frameGeometry = env.rect(r.x, r.y, r.width, r.height);
            ws.raiseWindow(w);
        }
    }

    // ---- tracking ------------------------------------------------------------

    function track(w, initial) {
        if (!trackable(w)) return null;
        var id = idOf(w);
        if (tracked[id]) return tracked[id];
        var st = {
            w: w, id: id, floating: false, pinned: false, special: null, ruleTile: false,
            natural: { width: w.width, height: w.height }, placed: null, floatGeom: null,
        };
        tracked[id] = st;
        st.desktop = desktopIdFor(w);
        st.output = w.output ? w.output.name : null;
        connectWindow(st);

        var rule = R.matchRules(rules, { "class": w.resourceClass, title: w.caption });
        if (rule.float === true) st.floating = true;
        if (rule.float === false) st.ruleTile = true;
        if (!initial && rule.workspace) {
            var d = ensureDesktop(rule.workspace.index);
            if (d) {
                st.desktop = d.id;
                guarded(function () { w.desktops = [d]; });
                if (!rule.workspace.silent) showDesktop(focusedScreen(), d);
            }
        }
        if (rule.special) {
            st.special = String(rule.special);
            guarded(function () { w.onAllDesktops = true; if (st.special !== special.name) w.minimized = true; });
        }
        if (rule.pin) pin(st, true);
        if (shouldTile(st)) tile(st, initial ? { target: null } : {});
        if (rule.pseudo) engine.setPseudo(id, st.natural);
        if (rule.group) {
            var act = stOf(ws.activeWindow);
            if (act && act !== st && engine.isGrouped(act.id) && isTiled(st)) engine.joinGroup(id, act.id);
        }
        if (rule.fullscreen) w.fullScreen = true;
        if (rule.maximize) w.setMaximize(true, true);
        if (!isTiled(st)) {
            st.floatGeom = copyRect(w.frameGeometry);
            setTiledDecoration(st, false);
        }
        // Now that it is known whether the window floats, the rules about
        // where it goes and how it looks (floating: rules included).
        applyWindowRules(st, R.matchRules(rules, { "class": w.resourceClass, title: w.caption, floating: !isTiled(st) }),
                         !initial && !rule.workspace);
        // KWin may activate a window before announcing it.
        if (w.active) engine.focused(id);
        return st;
    }

    // Hyprland's size / move / center / monitor / opacity / noborder rules.
    // Where a window goes is only decided when it opens; how it looks also
    // applies to windows that were already open when HyprKwin started.
    function applyWindowRules(st, rule, opening) {
        var w = st.w;
        if (rule.noborder) {
            st.ruleNoBorder = true;
            setTiledDecoration(st, isTiled(st));
        }
        if (rule.opacity) st.ruleOpacity = rule.opacity;
        applyOpacity(st);
        if (!opening || st.special) return;
        var screen = rule.monitor ? screenForRule(rule.monitor) : null;
        if (screen && screen !== w.output) moveToScreen(st, screen);
        if (!isTiled(st) && (rule.size || rule.move || rule.center)) placeFloating(st, rule, screen || w.output);
    }

    // "1" is the second monitor, as in Hyprland; anything else is a name.
    function screenForRule(which) {
        var ss = screens();
        if (/^\d+$/.test(which)) return ss[parseInt(which, 10)] || null;
        for (var i = 0; i < ss.length; i++) if (ss[i].name.toLowerCase() === which.toLowerCase()) return ss[i];
        log("no monitor", which, "for a window rule");
        return null;
    }

    function placeFloating(st, rule, screen) {
        var w = st.w;
        var area = workArea(screen, desktopFor(screen));
        var g = w.frameGeometry;
        var len = function (l, total) { return l.percent ? total * l.value / 100 : l.value; };
        var width = rule.size ? len(rule.size.width, area.width) : g.width;
        var height = rule.size ? len(rule.size.height, area.height) : g.height;
        var x, y;
        if (rule.move) {
            x = area.x + len(rule.move.x, area.width);
            y = area.y + len(rule.move.y, area.height);
        } else if (rule.center) {
            x = area.x + (area.width - width) / 2;
            y = area.y + (area.height - height) / 2;
        } else {
            // Keep Plasma's placement, but never let the new size run off
            // the monitor.
            x = Math.max(area.x, Math.min(g.x, area.x + area.width - width));
            y = Math.max(area.y, Math.min(g.y, area.y + area.height - height));
        }
        var r = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
        guarded(function () { w.frameGeometry = env.rect(r.x, r.y, r.width, r.height); });
        st.floatGeom = r;
    }

    // decoration:active_opacity / inactive_opacity, which an opacity rule
    // overrides. Fullscreen windows stay opaque, as Hyprland's
    // fullscreen_opacity does by default. At 1.0 HyprKwin leaves a window's
    // opacity alone entirely, so Plasma's own opacity rules still work.
    function wantedOpacity(st) {
        var w = st.w;
        if (w.fullScreen) return null;
        var focused = w === ws.activeWindow;
        if (st.ruleOpacity) return focused ? st.ruleOpacity.active : st.ruleOpacity.inactive;
        var v = focused ? cfg.activeOpacity : cfg.inactiveOpacity;
        return v < 0.999 ? v : null;
    }

    function applyOpacity(st) {
        var w = st.w;
        var want = wantedOpacity(st);
        if (want === null) {
            if (st.origOpacity !== undefined) {
                var back = st.origOpacity;
                st.origOpacity = undefined;
                if (Math.abs(w.opacity - back) > 0.001) guarded(function () { w.opacity = back; });
            }
            return;
        }
        if (st.origOpacity === undefined) st.origOpacity = w.opacity;
        if (Math.abs(w.opacity - want) > 0.001) guarded(function () { w.opacity = want; });
    }

    function applyAllOpacity() {
        for (var id in tracked) applyOpacity(tracked[id]);
    }

    function untrack(w) {
        var id = idOf(w);
        var st = tracked[id];
        if (!st) return;
        if (drag && drag.st === st) drag = null;
        engine.remove(id);
        delete tracked[id];
    }

    function connectWindow(st) {
        var w = st.w;
        w.desktopsChanged.connect(function () { onDesktopsChanged(st); });
        w.outputChanged.connect(function () { onOutputChanged(st); });
        w.minimizedChanged.connect(function () { onMinimizedChanged(st); });
        if (w.demandsAttentionChanged) w.demandsAttentionChanged.connect(function () { onDemandsAttention(st); });
        w.activitiesChanged.connect(schedule);
        w.fullScreenChanged.connect(function () { st.placed = null; applyOpacity(st); schedule(); });
        w.maximizedChanged.connect(function () { st.placed = null; schedule(); });
        // Plasma's quick tiling / tile editor would fight our layout: take
        // tiled windows back from KWin's tiles and re-apply our geometry.
        if (w.tileChanged) w.tileChanged.connect(function () { onKWinTile(st); });
        if (w.quickTileModeChanged) w.quickTileModeChanged.connect(function () { onKWinTile(st); });
        w.frameGeometryChanged.connect(function () { onGeometryChanged(st); });
        w.captionChanged.connect(scheduleDecorations);
        // Whether the decoration covers a window decides if we draw a border.
        if (w.decorationChanged) w.decorationChanged.connect(scheduleDecorations);
        if (w.clientGeometryChanged) w.clientGeometryChanged.connect(scheduleDecorations);
        w.interactiveMoveResizeStarted.connect(function () { onDragStart(st); });
        w.interactiveMoveResizeStepped.connect(function (g) { onDragStep(st, g); });
        w.interactiveMoveResizeFinished.connect(function () { onDragEnd(st); });
    }

    // ---- reactions to Plasma ---------------------------------------------------

    function onDesktopsChanged(st) {
        if (syncing) return;
        var w = st.w;
        if (st.special) {
            if (!w.onAllDesktops) leaveSpecial(st, false);
            schedule();
            return;
        }
        if (st.pinned && !w.onAllDesktops) st.pinned = false;
        if (!w.onAllDesktops && w.desktops.length === 1) st.desktop = w.desktops[0].id;
        var space = spaceOfWindow(st);
        if (isTiled(st)) {
            if (!space) untile(st);
            else if (space !== engine.spaceOf(st.id)) engine.moveToSpace(st.id, space, {});
        } else if (space && shouldTile(st)) {
            tile(st);
        }
        schedule();
    }

    function onOutputChanged(st) {
        var w = st.w;
        if (syncing || w.move || w.resize || st.special) return;
        // A window dragged (or sent) to another monitor joins that monitor's
        // workspace — but one whose monitor was unplugged keeps its own, so
        // plugging the monitor back in puts everything where it was.
        var wasMoved = !st.output || !!screenByName(st.output);
        if (perOutput() && !st.pinned && w.output && wasMoved) {
            var here = desktopFor(w.output);
            if (here) st.desktop = here.id;
        }
        st.output = w.output ? w.output.name : null;
        if (!isTiled(st)) { schedule(); return; }
        // Our own placement landing on another output is already reflected in
        // the engine; only react to moves made by someone else.
        if (st.placed && sameRect(w.frameGeometry, st.placed, 2)) return;
        var space = spaceOfWindow(st);
        if (space && space !== engine.spaceOf(st.id)) engine.moveToSpace(st.id, space, {});
        schedule();
    }

    // An app asked to be brought forward — typically a single-instance app
    // launched again — and KWin's focus stealing prevention turned it down,
    // leaving only the "demands attention" flag. Like Hyprland's
    // misc:focus_on_activate, go to it instead. Chat apps flag new messages
    // the same way, so a "focusonactivate off" rule opts an app out.
    function onDemandsAttention(st) {
        var w = st.w;
        if (!w.demandsAttention || drag || w === ws.activeWindow) return;
        var rule = R.matchRules(rules, { "class": w.resourceClass, title: w.caption });
        var wanted = rule.focusonactivate !== undefined ? rule.focusonactivate : cfg.focusOnActivate;
        if (!wanted || !onCurrentActivity(w)) return;
        log("activation request from", w.caption);
        focusWindow(st);
    }

    // Bring a window forward wherever it is, the way Hyprland's focuswindow
    // does: its workspace comes up on its monitor, the scratchpad opens, and
    // a minimized window is restored.
    function focusWindow(st) {
        var w = st.w;
        if (st.special) {
            if (st.special !== special.name) toggleSpecial(st.special);
            activate(w);
            return;
        }
        if (w.minimized) guarded(function () { w.minimized = false; });
        if (perOutput() && !st.pinned) {
            var d = desktopById(st.desktop);
            var space = engine.spaceOf(st.id);
            var p = (space && !isSpecialSpace(space)) ? parseSpace(space) : null;
            var screen = (p && p.screen) || w.output;
            // Switch before activating, or KWin would move the desktop itself.
            if (d && screen) showDesktop(screen, d, true);
        } else if (!w.onAllDesktops && w.desktops.length && w.desktops.indexOf(ws.currentDesktop) < 0) {
            ws.currentDesktop = w.desktops[0];
        }
        activate(w);
        relayout();
    }

    function onKWinTile(st) {
        if (syncing || !isTiled(st)) return;
        var w = st.w;
        if (w.tile) guarded(function () { w.tile = null; });
        st.placed = null;
        schedule();
    }

    function onMinimizedChanged(st) {
        if (syncing) return;
        if (st.special && !st.w.minimized && st.special !== special.name) {
            toggleSpecial(st.special);
            return;
        }
        st.placed = null;
        schedule();
    }

    function onGeometryChanged(st) {
        if (slideGrowers && slideGrowers[st.id]) slideGrowers = null;
        if (releasing && releasing[st.id]) {
            delete releasing[st.id];
            if (!Object.keys(releasing).length) playQueued();
        }
        scheduleDecorations();
        if (syncing || drag) return;
        var w = st.w;
        if (!isTiled(st) && !w.fullScreen && !isMaximized(w) && !w.minimized) st.floatGeom = copyRect(w.frameGeometry);
    }

    function onDragStart(st) {
        var w = st.w;
        drag = { st: st, mode: w.resize ? "resize" : "move", last: copyRect(w.frameGeometry) };
        log("drag start", w.caption, drag.mode);
    }

    function onDragStep(st, g) {
        if (!drag || drag.st !== st) return;
        if (drag.mode === "resize" && isTiled(st)) {
            engine.resizeByRects(st.id, drag.last, g);
            drag.last = copyRect(g);
            relayout();
        }
    }

    function onDragEnd(st) {
        var d = drag;
        drag = null;
        if (!d || d.st !== st) { schedule(); return; }
        var w = st.w;
        log("drag end", w.caption, d.mode, JSON.stringify(ws.cursorPos));
        if (d.mode === "move" && isTiled(st) && cfg.dragToRetile) {
            var pos = ws.cursorPos;
            var target = tiledWindowAt(pos, st.id);
            log("drop target", target ? tracked[target].w.caption : "none");
            if (target) {
                engine.dropOnto(st.id, target, pos);
                syncDesktop(st);
            } else {
                var screen = ws.screenAt(pos) || w.output;
                var space = spaceFor(desktopFor(screen), screen);
                if (space !== engine.spaceOf(st.id)) {
                    engine.moveToSpace(st.id, space, { cursor: pos });
                    syncDesktop(st);
                }
            }
        } else if (!isTiled(st)) {
            st.floatGeom = copyRect(w.frameGeometry);
        }
        st.placed = null;
        relayout();
    }

    // Make a tiled window's Plasma desktop match the space the engine put it in.
    function syncDesktop(st) {
        var space = engine.spaceOf(st.id);
        if (!space || isSpecialSpace(space)) return;
        var p = parseSpace(space);
        if (!p.desktop) return;
        st.desktop = p.desktop.id;
        if (perOutput()) return;   // syncWorkspaces() applies it at the next layout
        var w = st.w;
        if (w.desktops.length !== 1 || w.desktops[0] !== p.desktop) {
            guarded(function () { w.desktops = [p.desktop]; });
        }
    }

    function tiledWindowAt(pos, exclude) {
        var vis = visibleSpaces();
        for (var i = 0; i < vis.length; i++) {
            var ids = engine.windows(vis[i].space);
            for (var j = 0; j < ids.length; j++) {
                var id = ids[j];
                if (id === exclude || !visible(id)) continue;
                var r = engine.tileRect(id);
                if (r && contains(r, pos)) return id;
            }
        }
        return null;
    }

    // ---- layout ------------------------------------------------------------------

    function visibleSpaces() {
        var out = [];
        screens().forEach(function (s) {
            var d = desktopFor(s);
            if (!d) return;
            out.push({ space: spaceFor(d, s), screen: s, desktop: d, area: workArea(s, d) });
        });
        if (specialShown()) {
            var s = screenByName(special.screen) || ws.activeScreen;
            var a = workArea(s, desktopFor(s)), m = cfg.specialMargin;
            out.push({
                space: specialSpace(special.name), screen: s, desktop: desktopFor(s),
                area: { x: a.x + m, y: a.y + m, width: Math.max(100, a.width - 2 * m), height: Math.max(100, a.height - 2 * m) },
            });
        }
        return out;
    }

    // Just off the right-hand end of every monitor.
    function parkingSpot() {
        var right = 0, top = 0;
        screens().forEach(function (s) {
            var g = s.geometry;
            right = Math.max(right, g.x + g.width);
            top = Math.min(top, g.y);
        });
        return { x: right + 200, y: top };
    }

    function apply(st, r, shown) {
        var w = st.w;
        if (w.fullScreen || isMaximized(w) || w.move || w.resize) return;
        // Clients on hidden desktops don't commit resizes, so send the
        // geometry again once their space is shown.
        if (shown && st.placedHidden) {
            st.placedHidden = false;
            if (!sameRect(w.frameGeometry, r)) st.placed = null;
        }
        // Only push geometry when our target changes, so windows that refuse
        // a size (minimum size hints) don't cause a resize loop.
        if (st.placed && sameRect(st.placed, r)) return;
        // Mid-slide, a window that loses area keeps its old size until the
        // divider has slid over it; see slideDivider().
        if (shown && (holdShrinks || st.hold) && !encloses(r, w.frameGeometry)) {
            st.hold = copyRect(r);
            return;
        }
        st.hold = null;
        st.placed = r;
        if (!shown) st.placedHidden = true;
        if (!sameRect(w.frameGeometry, r)) {
            if (holdShrinks && slideGrowers) slideGrowers[st.id] = true;
            w.frameGeometry = env.rect(r.x, r.y, r.width, r.height);
        }
    }

    var groupBars = [];

    // Spaces to lay out: every space that has windows (so a desktop is
    // already arranged when Plasma switches to it) plus the visible ones.
    function layoutSpaces() {
        var vis = visibleSpaces();
        var seen = {};
        vis.forEach(function (v) { seen[v.space] = true; v.visible = true; });
        engine.spaces().forEach(function (space) {
            if (seen[space] || isSpecialSpace(space)) return;
            var p = parseSpace(space);
            if (!p.desktop || !p.screen) return;
            vis.push({ space: space, screen: p.screen, desktop: p.desktop, area: workArea(p.screen, p.desktop), visible: false });
        });
        return vis;
    }

    // What a workspace rule says about how this space is laid out. The
    // layout is set once, so Meta+Shift+J still has the last word afterwards.
    function applyWorkspaceRule(vs) {
        var r = workspaceRuleFor(vs.desktop);
        var gaps = r && (r.gapsIn !== null || r.gapsOut !== null) ? { inner: r.gapsIn, outer: r.gapsOut } : null;
        engine.setGaps(vs.space, gaps);
        if (r && r.layout && !ruledSpaces[vs.space]) {
            ruledSpaces[vs.space] = true;
            engine.setLayout(vs.space, r.layout);
        }
    }

    function relayout() {
        if (stopped) return;
        refreshShown();
        syncWorkspaces();
        engine.setVisibility(visible);
        var bars = [];
        layoutSpaces().forEach(function (vs) {
            applyWorkspaceRule(vs);
            var L = engine.layout(vs.space, vs.area);
            for (var id in L.windows) {
                var st = tracked[id];
                if (st) apply(st, L.windows[id], vs.visible && kwinVisible(st.w));
            }
            // A scrolling layout keeps only whole columns on screen. The rest
            // wait past the last monitor, where KWin draws nothing, rather
            // than half on the neighbouring screen.
            if (L.offscreen.length) {
                var park = parkingSpot();
                L.offscreen.forEach(function (id) {
                    var st = tracked[id];
                    if (!st) return;
                    var g = st.w.frameGeometry;
                    apply(st, { x: park.x, y: park.y, width: g.width, height: g.height }, false);
                });
            }
            if (!vs.visible) return;
            if (specialShown() && vs.space !== specialSpace(special.name)) return;
            L.groups.forEach(function (g) {
                if (!usableRect(g.rect)) {
                    log("skipping group bar", JSON.stringify(g.rect));
                    return;
                }
                bars.push({
                    id: g.wins[0],
                    x: g.rect.x, y: g.rect.y, width: g.rect.width, height: g.rect.height,
                    tabs: g.wins.map(function (id, i) {
                        var st = tracked[id];
                        return { id: id, caption: st ? String(st.w.caption) : "", active: i === g.active };
                    }),
                });
            });
        });
        groupBars = bars;
        scheduleDecorations();
    }

    function schedule() {
        if (!stopped) env.scheduleLayout();
    }

    function scheduleDecorations() {
        if (!stopped) env.scheduleDecorations();
    }

    // Chromium, Electron and GTK apps draw their own decorations on Wayland,
    // so KWin has no frame to paint for them (noBorder stays false; the frame
    // simply has the same size as the client area).
    function isDecorated(w) {
        var f = w.frameGeometry, c = w.clientGeometry;
        if (!f || !c) return false;
        return Math.round(f.width) > Math.round(c.width) || Math.round(f.height) > Math.round(c.height);
    }

    // Windows briefly report tiny geometry while they are mapped or restored
    // at login; a border drawn then would be a stray sliver on screen.
    var MIN_DECORATED_SIZE = 32;

    // Menus, combo boxes and tooltips are ordinary windows to KWin, and our
    // overlays are drawn above them, so a menu spilling past a window's edge
    // would have the border painted over it.
    function popupRects() {
        var out = [];
        var all = ws.windows || [];
        for (var i = 0; i < all.length; i++) {
            var w = all[i];
            if (!w || w.minimized || w.deleted) continue;
            if (!(w.popupWindow || w.popupMenu || w.dropdownMenu || w.menu || w.comboBox || w.tooltip)) continue;
            if (String(w.caption) === OVERLAY_TITLE) continue;
            out.push(copyRect(w.frameGeometry));
        }
        return out;
    }

    function overlaps(a, b) {
        return a.x < b.x + b.width && b.x < a.x + a.width &&
            a.y < b.y + b.height && b.y < a.y + a.height;
    }

    // True when the rect crosses the band an overlay occupies: the ring
    // between `outer` and `outer` shrunk by `thickness`. A menu that stays
    // inside the window never hides its border.
    function crossesBand(rect, outer, thickness) {
        if (!overlaps(rect, outer)) return false;
        var inner = {
            x: outer.x + thickness, y: outer.y + thickness,
            width: Math.max(0, outer.width - 2 * thickness),
            height: Math.max(0, outer.height - 2 * thickness),
        };
        var insideInner = rect.x >= inner.x && rect.y >= inner.y &&
            rect.x + rect.width <= inner.x + inner.width &&
            rect.y + rect.height <= inner.y + inner.height;
        return !insideInner;
    }

    // Whether a window stacked above `w` crosses the ring its border occupies.
    function coveredAbove(w, outer, thickness) {
        var order = ws.stackingOrder || [];
        var i = 0;
        while (i < order.length && order[i] !== w) i++;
        for (var j = i + 1; j < order.length; j++) {
            var o = order[j];
            if (!o || o.deleted || o.minimized || String(o.caption) === OVERLAY_TITLE) continue;
            if (o.desktopWindow || o.dock || o.popupWindow) continue;
            if (!(o.normalWindow || o.dialog || o.utility || o.notification || o.criticalNotification)) continue;
            if (!kwinVisible(o) || !onCurrentActivity(o)) continue;
            if (crossesBand(copyRect(o.frameGeometry), outer, thickness)) return true;
        }
        return false;
    }

    // A rect KWin can actually render an overlay for.
    function usableRect(r) {
        return !!r && isFinite(r.x) && isFinite(r.y) && isFinite(r.width) && isFinite(r.height) &&
            r.width >= 1 && r.height >= 1;
    }

    function updateDecorations() {
        if (stopped) return;
        if (slideGrowers) return;   // see slideGrowers
        var borders = [];
        var active = ws.activeWindow;
        var visible = visibleWindows();
        var popups = popupRects();
        var fullscreenScreens = {};
        visible.forEach(function (st) {
            if (st.w.fullScreen) fullscreenScreens[st.w.output ? st.w.output.name : ""] = true;
        });
        var decorationMode = cfg.focusIndicator === INDICATOR_DECORATIONS;
        var drawBorders = cfg.borderSize > 0 &&
            (cfg.focusIndicator === INDICATOR_BORDER || (decorationMode && cfg.borderOnUndecorated));
        if (drawBorders) {
            visible.forEach(function (st) {
                var w = st.w;
                if (st.ruleNoBorder) return;
                if (w.fullScreen || isMaximized(w)) return;
                // A floating window's own title bar already shows focus; one
                // without (hidden, or an app drawing its own) gets a border,
                // as every window does in Hyprland. Launchers and tool
                // palettes (Albert, for one) are left alone: they draw their
                // own look, often inside a larger transparent window, so a
                // border would outline the invisible part.
                if (!isTiled(st)) {
                    if (isDecorated(w)) return;
                    if (w.utility || w.skipTaskbar || !(w.normalWindow || w.dialog)) return;
                }
                // The scratchpad floats over everything: its windows are the
                // only ones worth outlining while it is open.
                if (specialShown() && st.special !== special.name) return;
                // In decoration mode only fill in for windows the decoration
                // cannot cover, so the two styles never stack.
                if (decorationMode && isDecorated(w)) return;
                if (fullscreenScreens[w.output ? w.output.name : ""]) return;
                var g = engine.groupOf(st.id);
                if (g && g.wins[g.active] !== st.id) return;
                var isActive = w === active;
                if (!isActive && !cfg.showInactiveBorders) return;
                // A window held back mid-slide is drawn where it is going;
                // the effect slides its border there with the divider.
                var r = st.hold || w.frameGeometry, b = cfg.borderSize;
                var outer = { id: "focus-border", x: r.x - b, y: r.y - b, width: r.width + 2 * b, height: r.height + 2 * b, active: isActive };
                if (!usableRect(outer) || r.width < MIN_DECORATED_SIZE || r.height < MIN_DECORATED_SIZE) {
                    log("skipping border for", w.caption, JSON.stringify(outer));
                    return;
                }
                var band = b + Math.max(0, cfg.borderRadius);
                for (var p = 0; p < popups.length; p++) {
                    if (crossesBand(popups[p], outer, band)) {
                        log("border hidden behind a popup", w.caption);
                        return;
                    }
                }
                // Overlays are drawn above everything, so a window stacked
                // over this one must not have the border painted across it.
                if (coveredAbove(w, outer, band)) {
                    log("border hidden behind a window above", w.caption);
                    return;
                }
                borders.push(outer);
            });
        }
        var bars = groupBars.filter(function (bar) {
            // A menu must never have a tab bar painted over it.
            for (var p = 0; p < popups.length; p++) {
                if (overlaps(popups[p], bar)) return false;
            }
            return !Object.keys(fullscreenScreens).some(function (name) {
                var s = screenByName(name);
                return s && contains(s.geometry, { x: bar.x + 1, y: bar.y + 1 });
            });
        }).map(function (bar) {
            bar.tabs.forEach(function (t) {
                var st = tracked[t.id];
                if (st) t.caption = String(st.w.caption);
                t.focused = !!st && st.w === active;
            });
            return bar;
        });
        env.ui.setBorders(borders, cfg);
        env.ui.setGroupBars(bars, cfg);
    }

    // Windows the user can currently see, excluding inactive group members.
    function visibleWindows() {
        var out = [];
        for (var id in tracked) {
            var st = tracked[id], w = st.w;
            if (w.minimized || !onCurrentActivity(w) || !onVisibleDesktop(w)) continue;
            if (st.special && st.special !== special.name) continue;
            var g = engine.groupOf(id);
            if (g && g.wins[g.active] !== id) continue;
            out.push(st);
        }
        return out;
    }

    function checkAreas() {
        var sig = visibleSpaces().map(function (v) { return v.space + ":" + JSON.stringify(v.area); }).join(";");
        if (sig !== lastAreas) {
            lastAreas = sig;
            relayout();
        }
    }

    // ---- actions ---------------------------------------------------------------

    function active() {
        return stOf(ws.activeWindow);
    }

    function activate(w) {
        if (w) ws.activeWindow = w;
    }

    var screenSlots = {
        left: "slotSwitchToLeftScreen", right: "slotSwitchToRightScreen",
        up: "slotSwitchToAboveScreen", down: "slotSwitchToBelowScreen",
    };

    // In a strip of columns, left and right mean the next and previous
    // column, not whatever happens to be in that direction on screen: the
    // columns out of view are parked off the end of the monitors.
    function scrollingNeighbour(st, dir) {
        if (!st || dir === "up" || dir === "down") return null;
        var space = engine.spaceOf(st.id);
        if (!space || engine.layoutOf(space) !== "scrolling") return null;
        return engine.cycleWindow(st.id, dir === "right" ? 1 : -1);
    }

    function focusDirection(dir) {
        var st = active();
        var along = scrollingNeighbour(st, dir);
        if (along) {
            focusWindowId(along);
            return;
        }
        var from = st ? copyRect(st.w.frameGeometry) : { x: ws.cursorPos.x, y: ws.cursorPos.y, width: 1, height: 1 };
        var cands = visibleWindows().filter(function (c) { return c !== st; })
            .map(function (c) { return { id: c.id, rect: copyRect(c.w.frameGeometry) }; });
        var id = E.pickInDirection(from, cands, dir, engine.focusHistory());
        if (id) activate(tracked[id].w);
        else if (ws[screenSlots[dir]]) ws[screenSlots[dir]]();
    }

    function tiledNeighbour(st, dir) {
        var cands = visibleWindows().filter(function (c) {
            if (c === st || !isTiled(c)) return false;
            var g = engine.groupOf(st.id);
            return !(g && g.wins.indexOf(c.id) >= 0);
        }).map(function (c) { return { id: c.id, rect: engine.tileRect(c.id) || copyRect(c.w.frameGeometry) }; });
        var from = engine.tileRect(st.id) || copyRect(st.w.frameGeometry);
        return E.pickInDirection(from, cands, dir, engine.focusHistory());
    }

    function screenInDirection(screen, dir) {
        var cands = screens().filter(function (s) { return s !== screen; })
            .map(function (s) { return { id: s.name, rect: copyRect(s.geometry) }; });
        var name = E.pickInDirection(copyRect(screen.geometry), cands, dir);
        return name ? screenByName(name) : null;
    }

    function moveToScreen(st, screen) {
        if (!screen || screen === st.w.output) return;
        var d = desktopFor(screen);
        if (isTiled(st)) {
            engine.moveToSpace(st.id, spaceFor(d, screen), {});
            syncDesktop(st);
        } else {
            if (d) st.desktop = d.id;
            guarded(function () { ws.sendClientToScreen(st.w, screen); });
        }
    }

    // Hyprland's "movewindow mon:<dir>": the window changes monitor and the
    // focus goes with it.
    function windowToMonitor(dir) {
        var st = active();
        if (!st) return;
        var to = screenInDirection(st.w.output || focusedScreen(), dir);
        if (!to) return;
        moveToScreen(st, to);
        // Hand the window to KWin on its new workspace before switching to it,
        // or the desktop change would take the focus off it.
        relayout();
        // It was already the active window, so nothing else would bring
        // Plasma's current desktop over to the monitor it just landed on.
        if (perOutput()) {
            var d = desktopFor(to);
            if (d && d !== ws.currentDesktop) guarded(function () { ws.currentDesktop = d; });
        }
        activate(st.w);
        relayout();
    }

    function swapDirection(dir) {
        var st = active();
        if (!st) return;
        var along = scrollingNeighbour(st, dir);
        if (along) {
            engine.swap(st.id, along);
            syncDesktop(st);
            relayout();
            return;
        }
        if (!isTiled(st)) { moveToScreen(st, screenInDirection(st.w.output, dir)); return; }
        var t = tiledNeighbour(st, dir);
        if (t) {
            engine.swap(st.id, t);
            syncDesktop(st);
            syncDesktop(tracked[t]);
        } else {
            moveToScreen(st, screenInDirection(st.w.output, dir));
        }
        relayout();
    }

    function moveDirection(dir) {
        var st = active();
        if (!st) return;
        if (!isTiled(st)) { moveToScreen(st, screenInDirection(st.w.output, dir)); return; }
        var t = tiledNeighbour(st, dir);
        if (t) {
            engine.moveNextTo(st.id, t, dir);
            syncDesktop(st);
        } else {
            moveToScreen(st, screenInDirection(st.w.output, dir));
        }
        relayout();
    }

    // A keyboard resize slides the divider instead of jumping, without
    // making the apps redraw more than once: a window that grows gets its new
    // size at once, and one that shrinks keeps its old size a moment longer.
    // The animations effect meanwhile uncovers the first and covers the
    // second as the edge travels, so neither is ever scaled. Presses made
    // during a slide are added up and played as the next one.
    // "slide": holding the shrinking windows while the divider slides;
    // "release": they have been let go, and the next slide waits until they
    // have actually taken their new size (so it finds them where they are).
    var slidePhase = "idle";
    var holdShrinks = false;
    var slideQueue = null;
    var releasing = null;
    // Windows that grew in the current slide and have yet to take their new
    // size. Borders wait for them: the effect only knows a slide is under
    // way once one of them has, and a border moved before that would jump.
    var slideGrowers = null;

    function slideDivider(st, dx, dy) {
        if (slidePhase !== "idle") {
            if (slideQueue && slideQueue.id === st.id) {
                slideQueue.dx += dx;
                slideQueue.dy += dy;
            } else {
                slideQueue = { id: st.id, dx: dx, dy: dy };
            }
            return;
        }
        if (!engine.moveDivider(st.id, dx, dy)) return;
        holdShrinks = cfg.slideHold > 0;
        slideGrowers = {};
        relayout();
        holdShrinks = false;
        // A window may take its new size during that very layout pass, which
        // clears this; only an empty set means nothing grew.
        if (slideGrowers && !Object.keys(slideGrowers).length) slideGrowers = null;
        var any = false;
        for (var id in tracked) if (tracked[id].hold) any = true;
        if (!any) return;
        slidePhase = "slide";
        env.later(cfg.slideHold);
    }

    function later() {
        if (stopped) return;
        if (slidePhase === "slide") endSlide();
        else if (slidePhase === "release") playQueued();
    }

    // The divider has slid over the held windows: let them shrink.
    function endSlide() {
        slideGrowers = null;
        var held = {}, any = false;
        for (var id in tracked) {
            if (tracked[id].hold) {
                held[id] = true;
                any = true;
                tracked[id].hold = null;
            }
        }
        relayout();
        if (slideQueue && any) {
            slidePhase = "release";
            releasing = held;
            env.later(150);   // in case one never answers
        } else {
            playQueued();
        }
    }

    function playQueued() {
        slidePhase = "idle";
        releasing = null;
        var q = slideQueue;
        slideQueue = null;
        if (q && tracked[q.id] && (q.dx || q.dy)) slideDivider(tracked[q.id], q.dx, q.dy);
    }

    // The space the layout actions work on: where the focused window is, or
    // what the monitor in use is showing.
    function currentSpace() {
        var st = active();
        if (st && !st.special) {
            var space = engine.spaceOf(st.id);
            if (space) return space;
        }
        var screen = focusedScreen();
        return screen ? spaceFor(desktopFor(screen), screen) : null;
    }

    var LAYOUT_LABELS = { dwindle: "Dwindle", master: "Master", monocle: "Monocle", scrolling: "Scrolling" };

    // A short message on the monitor in use, the way Plasma announces a
    // volume change. Plasma's own OSD service only takes fixed kinds of
    // message, so HyprKwin draws its own.
    function announce(text) {
        if (!cfg.layoutOsd || !env.ui.showOsd) return;
        var screen = focusedScreen();
        if (!screen) return;
        env.ui.showOsd(text, workArea(screen, desktopFor(screen)), cfg.osdDuration);
    }

    function setLayout(mode) {
        var space = currentSpace();
        if (!space || !engine.setLayout(space, mode)) return;
        log("layout", space, "->", mode);
        announce(LAYOUT_LABELS[mode] || mode);
        relayout();
    }

    function cycleLayout(delta) {
        var space = currentSpace();
        if (!space) return;
        var mode = engine.cycleLayout(space, delta);
        log("layout", space, "->", mode);
        announce(LAYOUT_LABELS[mode] || mode);
        relayout();
    }

    function masterAction(fn) {
        var space = currentSpace();
        if (space && fn(space) !== false) relayout();
    }

    function focusWindowId(id) {
        if (id && tracked[id]) activate(tracked[id].w);
    }

    function resizeActive(dx, dy) {
        var st = active();
        if (!st || st.w.fullScreen) return;
        if (isTiled(st)) {
            if (cfg.slideDivider && env.later) slideDivider(st, dx, dy);
            else if (engine.moveDivider(st.id, dx, dy)) relayout();
        } else if (st.w.resizeable) {
            var g = st.w.frameGeometry;
            st.w.frameGeometry = env.rect(g.x - dx / 2, g.y - dy / 2, Math.max(100, g.width + dx), Math.max(100, g.height + dy));
        }
    }

    function toggleFloating() {
        var st = active();
        if (!st) return;
        if (isTiled(st)) {
            makeFloating(st);
        } else {
            if (st.pinned) unpin(st);
            st.floating = false;
            st.ruleTile = true;
            if (!shouldTile(st) || !tile(st)) st.ruleTile = false;
        }
        relayout();
    }

    function togglePseudo() {
        var st = active();
        if (!st || !isTiled(st)) return;
        engine.setPseudo(st.id, engine.isPseudo(st.id) ? null : (st.floatGeom || st.natural));
        relayout();
    }

    function pin(st, on) {
        var w = st.w;
        if (on) {
            st.pinned = true;
            makeFloating(st);
            guarded(function () {
                st.prevKeepAbove = w.keepAbove;
                w.onAllDesktops = true;
                w.keepAbove = true;
            });
        } else {
            unpin(st);
        }
    }

    function unpin(st) {
        var w = st.w;
        st.pinned = false;
        guarded(function () {
            w.onAllDesktops = false;
            w.desktops = [desktopFor(w.output)];
            w.keepAbove = !!st.prevKeepAbove;
        });
    }

    function togglePin() {
        var st = active();
        if (!st) return;
        if (st.pinned) {
            unpin(st);
            st.floating = false;
            if (shouldTile(st)) tile(st);
        } else {
            pin(st, true);
        }
        relayout();
    }

    function ensureDesktop(n) {
        if (n < 1) return null;
        if (ws.desktops.length < n && cfg.autoCreateDesktops) {
            for (var i = ws.desktops.length; i < n; i++) ws.createDesktop(i, "");
        }
        return ws.desktops[n - 1] || null;
    }

    // Show a workspace on one output. The focused output is the one Plasma's
    // own current desktop follows, so everything else stays put.
    function showDesktop(screen, d, focus) {
        if (!d) return;
        if (!perOutput() || !screen) {
            if (d !== ws.currentDesktop) ws.currentDesktop = d;
            return;
        }
        if (shown[screen.name] !== d.id) {
            formerShown[screen.name] = shown[screen.name];
            shown[screen.name] = d.id;
        }
        if ((focus || screen === focusedScreen()) && d !== ws.currentDesktop) {
            guarded(function () { ws.currentDesktop = d; });
        }
        relayout();
    }

    // Move the keyboard focus to another monitor, taking Plasma's current
    // desktop with it.
    function focusScreen(screen) {
        if (!screen) return;
        var d = desktopFor(screen);
        if (perOutput() && d && d !== ws.currentDesktop) guarded(function () { ws.currentDesktop = d; });
        var id = engine.lastFocused(spaceFor(d, screen));
        if (id && tracked[id] && !tracked[id].w.minimized) {
            activate(tracked[id].w);
            return;
        }
        // Nothing to focus there: nudge KWin's own screen focus across and
        // take the keyboard off whatever is on the other monitor.
        if (ws.slotSwitchToNextScreen) {
            var ss = screens(), guardCount = ss.length;
            while (guardCount-- > 0 && focusedScreen() !== screen) ws.slotSwitchToNextScreen();
        }
        var act = stOf(ws.activeWindow);
        if (perOutput() && act && desktopById(act.desktop) !== d) {
            log("nothing to focus on", screen.name);
            ws.activeWindow = null;
        }
    }

    function gotoDesktop(n) {
        var d = ensureDesktop(n);
        if (!d) return;
        if (!perOutput()) {
            ws.currentDesktop = d;
            return;
        }
        var screen = focusedScreen();
        // Hyprland jumps to the monitor a workspace is already up on, or the
        // one its rule pins it to, rather than pulling it across.
        var other = screenForWorkspace(d) || screenShowing(d, screen);
        if (other !== screen) {
            if (desktopFor(other) !== d) showDesktop(other, d, true);
            focusScreen(other);
            return;
        }
        var already = desktopFor(screen) === d;
        showDesktop(screen, d);
        var id = engine.lastFocused(spaceFor(d, screen));
        if (id && tracked[id] && !tracked[id].w.minimized) activate(tracked[id].w);
        else if (!already) focusEmptyWorkspace(screen);
    }

    // Nothing to focus on the workspace we just switched to: make sure focus
    // does not linger on a window the user can no longer see.
    function focusEmptyWorkspace(screen) {
        var w = ws.activeWindow;
        var st = stOf(w);
        if (!st || !w.output) return;
        if (w.output === screen || desktopFor(w.output) !== desktopFor(screen)) {
            if (ws.activeWindow) ws.activeWindow = null;
        }
    }

    function cycleDesktop(delta) {
        if (!perOutput()) {
            if (delta > 0) ws.slotSwitchDesktopNext();
            else ws.slotSwitchDesktopPrevious();
            return;
        }
        var screen = focusedScreen();
        var ds = ws.desktops, cur = desktopFor(screen);
        var i = 0;
        for (var j = 0; j < ds.length; j++) if (ds[j] === cur) i = j;
        gotoDesktop(((i + delta) % ds.length + ds.length) % ds.length + 1);
    }

    function goFormerDesktop() {
        if (!perOutput()) {
            var d = desktopById(previousDesktop);
            if (d) ws.currentDesktop = d;
            return;
        }
        var screen = focusedScreen();
        var prev = desktopById(formerShown[screen.name]) || desktopById(previousDesktop);
        if (!prev) return;
        for (var i = 0; i < ws.desktops.length; i++) if (ws.desktops[i] === prev) gotoDesktop(i + 1);
    }

    // The screen on which `desktop` is currently shown, if desktops are per screen.
    function screenShowing(desktop, fallback) {
        if (desktopFor(fallback) === desktop) return fallback;
        var ss = screens();
        for (var i = 0; i < ss.length; i++) if (desktopFor(ss[i]) === desktop) return ss[i];
        return fallback;
    }

    function moveToDesktop(n, follow) {
        var st = active();
        if (!st) return;
        var d = ensureDesktop(n);
        if (!d) return;
        var w = st.w;
        var origin = focusedScreen();
        if (st.special) leaveSpecial(st, true);
        if (st.pinned) unpin(st);
        st.desktop = d.id;
        guarded(function () { w.desktops = [d]; });
        var screen = screenForWorkspace(d) || screenShowing(d, w.output);
        if (isTiled(st)) {
            engine.moveToSpace(st.id, spaceFor(d, screen), {});
        } else if (shouldTile(st)) {
            tile(st);
        }
        if (screen !== w.output && !isTiled(st)) guarded(function () { ws.sendClientToScreen(w, screen); });
        // Lay out first: KWin would otherwise switch desktop by itself when we
        // activate a window it still thinks is somewhere else.
        relayout();
        if (follow) {
            showDesktop(screen, d, true);
            activate(w);
        } else if (perOutput() && screen !== origin) {
            // The window left for another monitor; stay on this one.
            focusScreen(origin);
        }
        relayout();
    }

    // Show the named scratchpad, or put it away when it is already on screen.
    // Opening one closes whichever was open, the way Hyprland only ever has
    // one special workspace on screen.
    function toggleSpecial(name) {
        name = name || SPECIAL;
        special.name = special.name === name ? null : name;
        if (specialShown()) special.screen = ws.activeScreen ? ws.activeScreen.name : null;
        var screen = screenByName(special.screen) || ws.activeScreen;
        var first = null;
        guarded(function () {
            for (var id in tracked) {
                var st = tracked[id];
                if (!st.special) continue;
                var w = st.w;
                if (st.special === special.name) {
                    w.minimized = false;
                    w.keepAbove = true;
                    if (!isTiled(st) && screen && w.output !== screen) ws.sendClientToScreen(w, screen);
                } else {
                    w.minimized = true;
                }
            }
        });
        if (specialShown()) {
            var last = engine.lastFocused(specialSpace(special.name));
            first = last ? tracked[last] : null;
            if (!first) {
                for (var id in tracked) {
                    if (tracked[id].special === special.name) { first = tracked[id]; break; }
                }
            }
            if (first) activate(first.w);
        }
        relayout();
    }

    function enterSpecial(st, name) {
        var w = st.w;
        if (st.pinned) unpin(st);
        st.special = name || SPECIAL;
        guarded(function () {
            st.prevKeepAbove = w.keepAbove;
            w.onAllDesktops = true;
            if (st.special === special.name) w.keepAbove = true;
            else w.minimized = true;
        });
        if (isTiled(st)) engine.moveToSpace(st.id, specialSpace(st.special), {});
        else if (shouldTile(st)) tile(st);
    }

    function leaveSpecial(st, keepDesktop) {
        var w = st.w;
        st.special = null;
        var screen = ws.activeScreen || w.output;
        guarded(function () {
            if (!keepDesktop || w.onAllDesktops) {
                w.onAllDesktops = false;
                w.desktops = [desktopFor(screen)];
            }
            w.keepAbove = !!st.prevKeepAbove;
            w.minimized = false;
        });
        if (isTiled(st)) engine.moveToSpace(st.id, spaceFor(w.desktops[0] || desktopFor(screen), screen), {});
    }

    // Slot 1 is the first name in the settings page; a slot with no name
    // still has a scratchpad of its own.
    function scratchpadName(slot) {
        return cfg.scratchpadNames[slot - 1] || ("scratchpad " + slot);
    }

    // Stash the focused window in a scratchpad, or take it out again. A
    // window already in another scratchpad moves to this one.
    function toggleActiveSpecial(name) {
        var st = active();
        if (!st) return;
        name = name || SPECIAL;
        if (st.special === name) leaveSpecial(st, false);
        else {
            if (st.special) leaveSpecial(st, false);
            enterSpecial(st, name);
        }
        relayout();
    }

    function moveWorkspaceToMonitor(dir) {
        var from = focusedScreen();
        if (!from) return;
        var to = screenInDirection(from, dir);
        if (!to) return;
        var dFrom = desktopFor(from), dTo = desktopFor(to);
        var fromSpace = spaceFor(dFrom, from), toSpace = spaceFor(dTo, to);
        var floatingOn = function (screen) {
            return visibleWindows().filter(function (st) {
                return !isTiled(st) && !st.pinned && !st.special && st.w.output === screen;
            });
        };
        if (perOutput() && dFrom !== dTo) {
            // Two workspaces trade monitors, windows and all, the way
            // Hyprland's movecurrentworkspacetomonitor does.
            var back = floatingOn(to);
            var TMP = "swap|" + from.name;
            engine.moveSpace(fromSpace, TMP);
            engine.moveSpace(toSpace, fromSpace);
            engine.moveSpace(TMP, toSpace);
            shown[from.name] = dTo.id;
            shown[to.name] = dFrom.id;
            back.forEach(function (st) { guarded(function () { ws.sendClientToScreen(st.w, from); }); });
            floatingOn(from).forEach(function (st) { guarded(function () { ws.sendClientToScreen(st.w, to); }); });
            engine.windows(fromSpace).concat(engine.windows(toSpace)).forEach(function (id) {
                if (tracked[id]) syncDesktop(tracked[id]);
            });
            focusScreen(to);
            relayout();
            return;
        }
        // Both monitors show the same workspace: merge into the other one.
        var moved = engine.windows(fromSpace);
        engine.moveSpace(fromSpace, toSpace);
        moved.forEach(function (id) { if (tracked[id]) syncDesktop(tracked[id]); });
        floatingOn(from).forEach(function (st) { guarded(function () { ws.sendClientToScreen(st.w, to); }); });
        relayout();
    }

    function focusMonitor(delta) {
        var ss = screens();
        if (ss.length < 2) return;
        var idx = ss.indexOf(focusedScreen());
        focusScreen(ss[((idx + delta) % ss.length + ss.length) % ss.length]);
    }

    function groupAction(fn) {
        var st = active();
        if (!st || !isTiled(st)) return;
        var next = fn(st);
        if (typeof next === "string" && tracked[next]) activate(tracked[next].w);
        relayout();
    }

    var actions = {
        close: function () { var st = active(); if (st) st.w.closeWindow(); else if (ws.activeWindow) ws.activeWindow.closeWindow(); },
        toggleSplit: function () {
            var st = active();
            if (!st) return;
            var dir = engine.toggleSplit(st.id);
            if (!dir) return;
            announce(dir === "h" ? "Split: side by side" : "Split: stacked");
            relayout();
        },
        swapSplit: function () { var st = active(); if (st && engine.swapSplit(st.id)) relayout(); },
        toggleFloating: toggleFloating,
        pseudo: togglePseudo,
        fullscreen: function () { var w = ws.activeWindow; if (w) w.fullScreen = !w.fullScreen; },
        maximize: function () { var w = ws.activeWindow; if (w) w.setMaximize(!isMaximized(w), !isMaximized(w)); },
        pin: togglePin,
        focusLeft: function () { focusDirection("left"); },
        focusRight: function () { focusDirection("right"); },
        focusUp: function () { focusDirection("up"); },
        focusDown: function () { focusDirection("down"); },
        swapLeft: function () { swapDirection("left"); },
        swapRight: function () { swapDirection("right"); },
        swapUp: function () { swapDirection("up"); },
        swapDown: function () { swapDirection("down"); },
        moveLeft: function () { moveDirection("left"); },
        moveRight: function () { moveDirection("right"); },
        moveUp: function () { moveDirection("up"); },
        moveDown: function () { moveDirection("down"); },
        resizeLeft: function () { resizeActive(-cfg.resizeStep, 0); },
        resizeRight: function () { resizeActive(cfg.resizeStep, 0); },
        resizeUp: function () { resizeActive(0, -cfg.resizeStep); },
        resizeDown: function () { resizeActive(0, cfg.resizeStep); },
        resizeLeftSmall: function () { resizeActive(-cfg.resizeStep / 4, 0); },
        resizeRightSmall: function () { resizeActive(cfg.resizeStep / 4, 0); },
        resizeUpSmall: function () { resizeActive(0, -cfg.resizeStep / 4); },
        resizeDownSmall: function () { resizeActive(0, cfg.resizeStep / 4); },
        resizeLeftLarge: function () { resizeActive(-cfg.resizeStep * 3, 0); },
        resizeRightLarge: function () { resizeActive(cfg.resizeStep * 3, 0); },
        resizeUpLarge: function () { resizeActive(0, -cfg.resizeStep * 3); },
        resizeDownLarge: function () { resizeActive(0, cfg.resizeStep * 3); },
        nextDesktop: function () { cycleDesktop(1); },
        previousDesktop: function () { cycleDesktop(-1); },
        formerDesktop: goFormerDesktop,
        toggleSpecial: function () { toggleSpecial(SPECIAL); },
        moveToSpecial: function () { toggleActiveSpecial(SPECIAL); },
        workspaceToMonitorLeft: function () { moveWorkspaceToMonitor("left"); },
        workspaceToMonitorRight: function () { moveWorkspaceToMonitor("right"); },
        workspaceToMonitorUp: function () { moveWorkspaceToMonitor("up"); },
        workspaceToMonitorDown: function () { moveWorkspaceToMonitor("down"); },
        windowToMonitorLeft: function () { windowToMonitor("left"); },
        windowToMonitorRight: function () { windowToMonitor("right"); },
        windowToMonitorUp: function () { windowToMonitor("up"); },
        windowToMonitorDown: function () { windowToMonitor("down"); },
        focusNextMonitor: function () { focusMonitor(1); },
        focusPreviousMonitor: function () { focusMonitor(-1); },
        toggleGroup: function () { groupAction(function (st) { engine.toggleGroup(st.id); }); },
        leaveGroup: function () { groupAction(function (st) { engine.leaveGroup(st.id); return st.id; }); },
        groupNext: function () { groupAction(function (st) { return engine.groupCycle(st.id, 1); }); },
        groupPrevious: function () { groupAction(function (st) { return engine.groupCycle(st.id, -1); }); },
        intoGroupLeft: function () { intoGroup("left"); },
        intoGroupRight: function () { intoGroup("right"); },
        intoGroupUp: function () { intoGroup("up"); },
        intoGroupDown: function () { intoGroup("down"); },
        groupNextAlt: function () { actions.groupNext(); },
        groupPreviousAlt: function () { actions.groupPrevious(); },
        cycleLayout: function () { cycleLayout(1); },
        cycleLayoutBack: function () { cycleLayout(-1); },
        layoutDwindle: function () { setLayout("dwindle"); },
        layoutMaster: function () { setLayout("master"); },
        layoutMonocle: function () { setLayout("monocle"); },
        layoutScrolling: function () { setLayout("scrolling"); },
        masterSwap: function () {
            var st = active();
            if (st && engine.swapWithMaster(st.id)) {
                syncDesktop(st);
                relayout();
            }
        },
        masterFocus: function () {
            var space = currentSpace();
            if (space) focusWindowId(engine.firstMaster(space));
        },
        masterCountIncrease: function () { masterAction(function (space) { return engine.setMasterCount(space, 1); }); },
        masterCountDecrease: function () { masterAction(function (space) { return engine.setMasterCount(space, -1); }); },
        masterOrientationNext: function () {
            masterAction(function (space) { log("master area", engine.cycleMasterOrientation(space, 1)); });
        },
        masterOrientationPrevious: function () {
            masterAction(function (space) { log("master area", engine.cycleMasterOrientation(space, -1)); });
        },
        cycleNext: function () { var st = active(); if (st) focusWindowId(engine.cycleWindow(st.id, 1)); },
        cyclePrevious: function () { var st = active(); if (st) focusWindowId(engine.cycleWindow(st.id, -1)); },
        retile: function () { reloadConfig(); },
    };
    for (var n = 1; n <= 10; n++) {
        (function (i) {
            actions["desktop" + i] = function () { gotoDesktop(i); };
            actions["moveToDesktop" + i] = function () { moveToDesktop(i, true); };
            actions["moveToDesktopSilent" + i] = function () { moveToDesktop(i, false); };
            if (i <= 5) actions["groupWindow" + i] = function () { groupAction(function (st) { return engine.groupSelect(st.id, i - 1); }); };
        })(n);
    }
    for (var k = 1; k <= 4; k++) {
        (function (slot) {
            actions["toggleScratchpad" + slot] = function () { toggleSpecial(scratchpadName(slot)); };
            actions["moveToScratchpad" + slot] = function () { toggleActiveSpecial(scratchpadName(slot)); };
        })(k);
    }

    function intoGroup(dir) {
        groupAction(function (st) {
            var t = tiledNeighbour(st, dir);
            if (t && engine.joinGroup(st.id, t)) {
                syncDesktop(st);
                return st.id;
            }
        });
    }

    // ---- focus follows mouse ----------------------------------------------------

    function onCursorMoved() {
        if (!cfg.focusFollowsMouse || drag) return;
        var under = ws.windowAt(ws.cursorPos, 1);
        if (!under || !under.length) return;
        var w = under[0];
        var st = stOf(w);
        if (!st || w === ws.activeWindow || w.minimized || !w.wantsInput) return;
        var act = ws.activeWindow;
        // Don't steal focus from an open popup/menu of the active window.
        if (act && (act.popupWindow || act.transient && !stOf(act))) return;
        activate(w);
    }

    // ---- lifecycle -----------------------------------------------------------------

    function reloadConfig() {
        loadConfig();
        reloads++;
        log("configuration reloaded");
        for (var id in tracked) {
            var st = tracked[id];
            setTiledDecoration(st, isTiled(st));
            st.placed = null;
        }
        applyAllOpacity();
        relayout();
    }

    function start() {
        loadConfig();
        // A previous instance (an upgrade, or a crash) can leave its overlay
        // windows behind; they are ownerless, so close them before we draw ours.
        var stale = ws.windows || [];
        for (var k = 0; k < stale.length; k++) {
            var sw = stale[k];
            if (sw && sw.pid <= 0 && !sw.resourceClass && String(sw.caption) === OVERLAY_TITLE) {
                log("closing stale overlay window");
                sw.closeWindow();
            }
        }
        var initial = [];
        var list = ws.windows || ws.stackingOrder;
        for (var i = 0; i < list.length; i++) initial.push(list[i]);
        // Insert left-to-right, top-to-bottom so the initial tree roughly
        // matches where windows already are.
        initial.sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
        initial.forEach(function (w) {
            hideOverlay(w);
            var st = track(w, true);
            if (st && isTiled(st)) engine.focused(st.id);
        });
        if (ws.activeWindow && stOf(ws.activeWindow)) engine.focused(idOf(ws.activeWindow));

        // Plasma restores the desktop you left; a tiling session normally
        // wants to start from the first workspace.
        if (cfg.startOnFirstDesktop && ws.desktops.length) {
            ws.currentDesktop = ws.desktops[0];
        }
        refreshShown();
        for (var tid in tracked) tracked[tid].desktop = desktopIdFor(tracked[tid].w);

        ws.windowAdded.connect(function (w) {
            hideOverlay(w);
            var st = track(w, false);
            if (st) relayout();
            else if (!isOverlay(w)) scheduleDecorations();  // a menu may cover a border
        });
        ws.windowRemoved.connect(function (w) {
            if (!stOf(w)) {
                if (!isOverlay(w)) scheduleDecorations();   // a menu closing frees a border
                return;
            }
            untrack(w);
            relayout();
        });
        ws.windowActivated.connect(function (w) {
            applyAllOpacity();
            var st = stOf(w);
            if (st) {
                var before = engine.groupOf(st.id);
                engine.focused(st.id);
                // A strip of columns is laid out around the focused one, so
                // moving the focus scrolls it.
                var space = engine.spaceOf(st.id);
                if (space && engine.layoutOf(space) === "scrolling") schedule();
                // The focused monitor is the one Plasma's current desktop
                // follows, so focus crossing monitors brings it along.
                if (perOutput() && w.output && !st.special && !st.pinned) {
                    // Its own workspace, not the output's: a window that has
                    // just been moved may not have landed yet.
                    var d = desktopById(st.desktop) || desktopFor(w.output);
                    if (d && d !== ws.currentDesktop) {
                        guarded(function () { ws.currentDesktop = d; });
                        schedule();
                    }
                }
                if (before && before.wins[before.active] !== st.id) relayout();
            }
            scheduleDecorations();
        });
        ws.currentDesktopChanged.connect(function (prev) {
            if (prev) previousDesktop = prev.id;
            // Plasma switched desktop by itself (pager, its own shortcuts):
            // that applies to the monitor the user is on.
            if (!syncing && perOutput()) {
                var screen = focusedScreen();
                if (screen && shown[screen.name] !== ws.currentDesktop.id) {
                    formerShown[screen.name] = shown[screen.name];
                    shown[screen.name] = ws.currentDesktop.id;
                }
            }
            schedule();
        });
        ws.desktopsChanged.connect(schedule);
        if (ws.stackingOrderChanged) ws.stackingOrderChanged.connect(scheduleDecorations);
        ws.screensChanged.connect(schedule);
        ws.currentActivityChanged.connect(schedule);
        ws.virtualScreenGeometryChanged.connect(schedule);
        relayout();
    }

    // Restore windows to a plain Plasma state when the script is unloaded.
    function stop() {
        stopped = true;
        guarded(function () {
            for (var id in tracked) {
                var st = tracked[id], w = st.w;
                st.ruleNoBorder = false;
                setTiledDecoration(st, false);
                if (st.origOpacity !== undefined) w.opacity = st.origOpacity;
                // Undo the all-desktops trick that kept other monitors visible.
                if (!st.special && !st.pinned && w.onAllDesktops) {
                    var d = desktopById(st.desktop);
                    w.onAllDesktops = false;
                    if (d) w.desktops = [d];
                }
                if (st.special) {
                    w.onAllDesktops = false;
                    w.keepAbove = !!st.prevKeepAbove;
                    w.minimized = false;
                }
            }
        });
        // The QML side has already hidden the overlays; pushing empty lists
        // here would re-run their visibility bindings mid-teardown.
    }

    return {
        start: start,
        stop: stop,
        relayout: relayout,
        later: later,
        updateDecorations: updateDecorations,
        checkAreas: checkAreas,
        reloadConfig: reloadConfig,
        onCursorMoved: onCursorMoved,
        actions: actions,
        config: function () { return cfg; },
        ruleErrors: function () { return ruleErrors.slice(); },
        selectTab: function (id) {
            var st = tracked[id];
            if (!st) return;
            engine.focused(id);
            activate(st.w);
            relayout();
        },
        // Introspection for tests and debugging.
        state: function () {
            var act = stOf(ws.activeWindow);
            var out = {
                special: specialShown(), scratchpad: special.name, spaces: {}, windows: {}, active: act ? act.id : null,
                desktops: ws.desktops.map(function (d) { return d.id; }), currentDesktop: ws.currentDesktop.id,
                groupBars: groupBars.map(function (b) { return { id: b.id, x: b.x, y: b.y, width: b.width, height: b.height, tabs: b.tabs.map(function (t) { return t.id; }) }; }),
                ruleErrors: ruleErrors.slice(),
                config: cfg,
                configReloads: reloads,
                cursor: { x: ws.cursorPos.x, y: ws.cursorPos.y },
                popups: popupRects(),
                layouts: (function () {
                    var out = {};
                    engine.spaces().forEach(function (space) {
                        var p = engine.masterParams(space);
                        out[space] = { layout: engine.layoutOf(space), factor: Math.round(p.factor * 1000) / 1000,
                                       masters: p.count, orientation: p.orientation };
                    });
                    return out;
                })(),
                shown: perOutput() ? shown : null,
            };
            engine.spaces().forEach(function (s) { out.spaces[s] = engine.dump(s); });
            for (var id in tracked) {
                var st = tracked[id], g = st.w.frameGeometry;
                out.windows[id] = {
                    caption: String(st.w.caption), "class": String(st.w.resourceClass), tiled: isTiled(st), floating: st.floating, special: !!st.special, scratchpad: st.special || null,
                    pinned: st.pinned, space: engine.spaceOf(id), geometry: { x: g.x, y: g.y, width: g.width, height: g.height },
                    minimized: st.w.minimized, noBorder: st.w.noBorder, keepAbove: st.w.keepAbove,
                    demandsAttention: !!st.w.demandsAttention, opacity: st.w.opacity,
                    onAllDesktops: st.w.onAllDesktops, desktops: st.w.desktops.map(function (d) { return d.id; }),
                    output: st.w.output ? st.w.output.name : null, workspace: st.desktop,
                };
            }
            return out;
        },
    };
}
