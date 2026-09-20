// HyprKwin driver: binds the pure engine to KWin.
//
// A "space" is a virtual desktop on one output ("<desktopId>|<outputName>"),
// or the special workspace. Plasma stays in charge of desktops, activities,
// minimizing, fullscreen and maximizing; the driver only decides where tiled
// windows go and reacts when Plasma moves them.

var SPECIAL = "special";

function createDriver(env) {
    var ws = env.workspace;
    var E = env.engine;
    var R = env.rules;

    var cfg = {};
    var rules = [];
    var ruleErrors = [];
    var engine = E.createEngine({});
    var tracked = {};         // id -> state
    var syncing = 0;          // >0 while we mutate KWin state ourselves
    var special = { shown: false, screen: null };
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

    function contains(r, p) {
        return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
    }

    function screens() {
        var list = ws.screenOrder && ws.screenOrder.length ? ws.screenOrder : ws.screens;
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i]);
        return out;
    }

    function desktopFor(screen) {
        if (screen && ws.currentDesktopForScreen) {
            var d = ws.currentDesktopForScreen(screen);
            if (d) return d;
        }
        return ws.currentDesktop;
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

    // 0: let Plasma draw title bars (no overlays at all)
    // 1: hide title bars, draw our own border
    // 2: hide title bars, no focus indicator
    var INDICATOR_DECORATIONS = 0, INDICATOR_BORDER = 1;

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
            useAccentColor: bool(rc("UseAccentColor", true), true),
            activeBorderColor: String(rc("ActiveBorderColor", "#33ccff") || "#33ccff"),
            inactiveBorderColor: String(rc("InactiveBorderColor", "#595959") || "#595959"),
            showInactiveBorders: bool(rc("ShowInactiveBorders", false), false),
            focusFollowsMouse: bool(rc("FocusFollowsMouse", false), false),
            autoCreateDesktops: bool(rc("AutoCreateDesktops", true), true),
            specialMargin: num(rc("SpecialMargin", 40), 40),
            resizeStep: num(rc("ResizeStep", 100), 100),
            windowRules: String(rc("WindowRules", "") || ""),
            debug: bool(rc("Debug", false), false),
        };
        engine.setConfig(cfg);
        var parsed = R.parseRules(cfg.windowRules + "\n" + R.DEFAULT_RULES.join("\n"));
        rules = parsed.rules;
        ruleErrors = parsed.errors;
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
        if (st.special) return SPECIAL;
        var w = st.w;
        if (!w.output || w.onAllDesktops || !w.desktops || w.desktops.length !== 1) return null;
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
        if (st.special) return special.shown;
        return onCurrentActivity(w);
    }

    // ---- tiling state transitions ------------------------------------------

    function setTiledDecoration(st, tiled) {
        var w = st.w;
        var hide = tiled ? cfg.focusIndicator !== INDICATOR_DECORATIONS : cfg.hideFloatingTitleBars;
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
            w: w, id: id, floating: false, pinned: false, special: false, ruleTile: false,
            natural: { width: w.width, height: w.height }, placed: null, floatGeom: null,
        };
        tracked[id] = st;
        connectWindow(st);

        var rule = R.matchRules(rules, { "class": w.resourceClass, title: w.caption });
        if (rule.float === true) st.floating = true;
        if (rule.float === false) st.ruleTile = true;
        if (!initial && rule.workspace) {
            var d = ensureDesktop(rule.workspace.index);
            if (d) guarded(function () { w.desktops = [d]; });
            if (d && !rule.workspace.silent) ws.currentDesktop = d;
        }
        if (rule.special) {
            st.special = true;
            guarded(function () { w.onAllDesktops = true; if (!special.shown) w.minimized = true; });
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
        // KWin may activate a window before announcing it.
        if (w.active) engine.focused(id);
        return st;
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
        w.activitiesChanged.connect(schedule);
        w.fullScreenChanged.connect(function () { st.placed = null; schedule(); });
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
        if (!isTiled(st)) { schedule(); return; }
        // Our own placement landing on another output is already reflected in
        // the engine; only react to moves made by someone else.
        if (st.placed && sameRect(w.frameGeometry, st.placed, 2)) return;
        var space = spaceOfWindow(st);
        if (space && space !== engine.spaceOf(st.id)) engine.moveToSpace(st.id, space, {});
        schedule();
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
        if (st.special && !st.w.minimized && !special.shown) {
            toggleSpecial();
            return;
        }
        st.placed = null;
        schedule();
    }

    function onGeometryChanged(st) {
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
        if (!space || space === SPECIAL) return;
        var p = parseSpace(space);
        var w = st.w;
        if (p.desktop && (w.desktops.length !== 1 || w.desktops[0] !== p.desktop)) {
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
        if (special.shown) {
            var s = screenByName(special.screen) || ws.activeScreen;
            var a = workArea(s, desktopFor(s)), m = cfg.specialMargin;
            out.push({
                space: SPECIAL, screen: s, desktop: desktopFor(s),
                area: { x: a.x + m, y: a.y + m, width: Math.max(100, a.width - 2 * m), height: Math.max(100, a.height - 2 * m) },
            });
        }
        return out;
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
        st.placed = r;
        if (!shown) st.placedHidden = true;
        if (!sameRect(w.frameGeometry, r)) w.frameGeometry = env.rect(r.x, r.y, r.width, r.height);
    }

    var groupBars = [];

    // Spaces to lay out: every space that has windows (so a desktop is
    // already arranged when Plasma switches to it) plus the visible ones.
    function layoutSpaces() {
        var vis = visibleSpaces();
        var seen = {};
        vis.forEach(function (v) { seen[v.space] = true; v.visible = true; });
        engine.spaces().forEach(function (space) {
            if (seen[space] || space === SPECIAL) return;
            var p = parseSpace(space);
            if (!p.desktop || !p.screen) return;
            vis.push({ space: space, screen: p.screen, desktop: p.desktop, area: workArea(p.screen, p.desktop), visible: false });
        });
        return vis;
    }

    function relayout() {
        if (stopped) return;
        engine.setVisibility(visible);
        var bars = [];
        layoutSpaces().forEach(function (vs) {
            var L = engine.layout(vs.space, vs.area);
            for (var id in L.windows) {
                var st = tracked[id];
                if (st) apply(st, L.windows[id], vs.visible);
            }
            if (!vs.visible) return;
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

    // A rect KWin can actually render an overlay for.
    function usableRect(r) {
        return !!r && isFinite(r.x) && isFinite(r.y) && isFinite(r.width) && isFinite(r.height) &&
            r.width >= 1 && r.height >= 1;
    }

    function updateDecorations() {
        if (stopped) return;
        var borders = [];
        var active = ws.activeWindow;
        var visible = visibleWindows();
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
                if (!isTiled(st) || w.fullScreen || isMaximized(w)) return;
                // In decoration mode only fill in for windows the decoration
                // cannot cover, so the two styles never stack.
                if (decorationMode && isDecorated(w)) return;
                if (fullscreenScreens[w.output ? w.output.name : ""]) return;
                var g = engine.groupOf(st.id);
                if (g && g.wins[g.active] !== st.id) return;
                var isActive = w === active;
                if (!isActive && !cfg.showInactiveBorders) return;
                var r = w.frameGeometry, b = cfg.borderSize;
                var outer = { id: "focus-border", x: r.x - b, y: r.y - b, width: r.width + 2 * b, height: r.height + 2 * b, active: isActive };
                if (!usableRect(outer) || r.width < MIN_DECORATED_SIZE || r.height < MIN_DECORATED_SIZE) {
                    log("skipping border for", w.caption, JSON.stringify(outer));
                    return;
                }
                borders.push(outer);
            });
        }
        var bars = groupBars.filter(function (bar) {
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
            if (st.special && !special.shown) continue;
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

    function focusDirection(dir) {
        var st = active();
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
        if (!screen) return;
        if (isTiled(st)) {
            engine.moveToSpace(st.id, spaceFor(desktopFor(screen), screen), {});
            syncDesktop(st);
        } else {
            ws.sendClientToScreen(st.w, screen);
        }
    }

    function swapDirection(dir) {
        var st = active();
        if (!st) return;
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

    function resizeActive(dx, dy) {
        var st = active();
        if (!st || st.w.fullScreen) return;
        if (isTiled(st)) {
            engine.resize(st.id, dx, dy);
            relayout();
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

    function gotoDesktop(n) {
        var d = ensureDesktop(n);
        if (d) ws.currentDesktop = d;
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
        if (st.special) leaveSpecial(st, true);
        if (st.pinned) unpin(st);
        guarded(function () { w.desktops = [d]; });
        var screen = screenShowing(d, w.output);
        if (isTiled(st)) {
            engine.moveToSpace(st.id, spaceFor(d, screen), {});
        } else if (shouldTile(st)) {
            tile(st);
        }
        if (screen !== w.output && !isTiled(st)) ws.sendClientToScreen(w, screen);
        if (follow) {
            ws.currentDesktop = d;
            activate(w);
        }
        relayout();
    }

    function toggleSpecial() {
        special.shown = !special.shown;
        if (special.shown) special.screen = ws.activeScreen ? ws.activeScreen.name : null;
        var screen = screenByName(special.screen) || ws.activeScreen;
        var first = null;
        guarded(function () {
            for (var id in tracked) {
                var st = tracked[id];
                if (!st.special) continue;
                var w = st.w;
                if (special.shown) {
                    w.minimized = false;
                    w.keepAbove = true;
                    if (!isTiled(st) && screen && w.output !== screen) ws.sendClientToScreen(w, screen);
                } else {
                    w.minimized = true;
                }
            }
        });
        if (special.shown) {
            var last = engine.lastFocused(SPECIAL);
            first = last ? tracked[last] : null;
            if (!first) for (var id in tracked) if (tracked[id].special) { first = tracked[id]; break; }
            if (first) activate(first.w);
        }
        relayout();
    }

    function enterSpecial(st) {
        var w = st.w;
        if (st.pinned) unpin(st);
        st.special = true;
        guarded(function () {
            st.prevKeepAbove = w.keepAbove;
            w.onAllDesktops = true;
            if (special.shown) w.keepAbove = true;
            else w.minimized = true;
        });
        if (isTiled(st)) engine.moveToSpace(st.id, SPECIAL, {});
        else if (shouldTile(st)) tile(st);
    }

    function leaveSpecial(st, keepDesktop) {
        var w = st.w;
        st.special = false;
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

    function toggleActiveSpecial() {
        var st = active();
        if (!st) return;
        if (st.special) leaveSpecial(st, false);
        else enterSpecial(st);
        relayout();
    }

    function moveWorkspaceToMonitor(dir) {
        var from = ws.activeScreen;
        if (!from) return;
        var to = screenInDirection(from, dir);
        if (!to) return;
        var fromSpace = spaceFor(desktopFor(from), from), toSpace = spaceFor(desktopFor(to), to);
        var moved = engine.windows(fromSpace);
        engine.moveSpace(fromSpace, toSpace);
        moved.forEach(function (id) { if (tracked[id]) syncDesktop(tracked[id]); });
        // Floating windows of that workspace follow along.
        visibleWindows().forEach(function (st) {
            if (!isTiled(st) && !st.pinned && st.w.output === from) ws.sendClientToScreen(st.w, to);
        });
        relayout();
    }

    function focusMonitor(delta) {
        var ss = screens();
        if (ss.length < 2) return;
        var idx = ss.indexOf(ws.activeScreen);
        var target = ss[((idx + delta) % ss.length + ss.length) % ss.length];
        var id = engine.lastFocused(spaceFor(desktopFor(target), target));
        if (id && tracked[id]) activate(tracked[id].w);
        else if (delta > 0) ws.slotSwitchToNextScreen();
        else ws.slotSwitchToPrevScreen();
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
        toggleSplit: function () { var st = active(); if (st && engine.toggleSplit(st.id)) relayout(); },
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
        nextDesktop: function () { ws.slotSwitchDesktopNext(); },
        previousDesktop: function () { ws.slotSwitchDesktopPrevious(); },
        formerDesktop: function () { if (previousDesktop && desktopById(previousDesktop)) ws.currentDesktop = desktopById(previousDesktop); },
        toggleSpecial: toggleSpecial,
        moveToSpecial: toggleActiveSpecial,
        workspaceToMonitorLeft: function () { moveWorkspaceToMonitor("left"); },
        workspaceToMonitorRight: function () { moveWorkspaceToMonitor("right"); },
        workspaceToMonitorUp: function () { moveWorkspaceToMonitor("up"); },
        workspaceToMonitorDown: function () { moveWorkspaceToMonitor("down"); },
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
            var first = ws.desktops[0];
            if (ws.setCurrentDesktopForScreen) {
                screens().forEach(function (screen) { ws.setCurrentDesktopForScreen(first, screen); });
            }
            ws.currentDesktop = first;
        }

        ws.windowAdded.connect(function (w) {
            hideOverlay(w);
            var st = track(w, false);
            if (st) relayout();
        });
        ws.windowRemoved.connect(function (w) {
            if (!stOf(w)) return;
            untrack(w);
            relayout();
        });
        ws.windowActivated.connect(function (w) {
            var st = stOf(w);
            if (st) {
                var before = engine.groupOf(st.id);
                engine.focused(st.id);
                if (before && before.wins[before.active] !== st.id) relayout();
            }
            scheduleDecorations();
        });
        ws.currentDesktopChanged.connect(function (prev) {
            if (prev) previousDesktop = prev.id;
            schedule();
        });
        ws.desktopsChanged.connect(schedule);
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
                setTiledDecoration(st, false);
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
                special: special.shown, spaces: {}, windows: {}, active: act ? act.id : null,
                desktops: ws.desktops.map(function (d) { return d.id; }), currentDesktop: ws.currentDesktop.id,
                groupBars: groupBars.map(function (b) { return { id: b.id, x: b.x, y: b.y, width: b.width, height: b.height, tabs: b.tabs.map(function (t) { return t.id; }) }; }),
                ruleErrors: ruleErrors.slice(),
                config: cfg,
                configReloads: reloads,
                cursor: { x: ws.cursorPos.x, y: ws.cursorPos.y },
            };
            engine.spaces().forEach(function (s) { out.spaces[s] = engine.dump(s); });
            for (var id in tracked) {
                var st = tracked[id], g = st.w.frameGeometry;
                out.windows[id] = {
                    caption: String(st.w.caption), "class": String(st.w.resourceClass), tiled: isTiled(st), floating: st.floating, special: st.special,
                    pinned: st.pinned, space: engine.spaceOf(id), geometry: { x: g.x, y: g.y, width: g.width, height: g.height },
                    minimized: st.w.minimized, noBorder: st.w.noBorder, keepAbove: st.w.keepAbove,
                    onAllDesktops: st.w.onAllDesktops, desktops: st.w.desktops.map(function (d) { return d.id; }),
                    output: st.w.output ? st.w.output.name : null,
                };
            }
            return out;
        },
    };
}
