// HyprKwin tiling engine.
//
// Pure layout logic with no KWin dependencies so it can be unit tested outside
// of KWin. Windows are referred to by opaque string ids. Each "space" (a
// virtual desktop on one output, or the special workspace) owns one dwindle
// binary tree. Leaves hold one window, or several when the leaf is a group
// (Hyprland's tabbed window groups).

// Hyprland expresses split ratios in [0.1, 1.9] where 1.0 is an even split and
// the first child receives ratio / 2 of the space.
var DEFAULT_CONFIG = {
    gapsIn: 5,
    gapsOut: 10,
    splitRatio: 1.0,
    splitWidthMultiplier: 1.0,
    preserveSplit: true,
    forceSplit: 2, // 0: follow cursor, 1: new window left/top, 2: right/bottom
    noGapsWhenOnly: false,
    groupBarHeight: 22,
    groupBarGap: 2,
    // Hyprland's master layout: the share of the screen the master area
    // takes, how many windows are masters, where they sit, and whether a new
    // window becomes one (master:new_status).
    defaultLayout: "dwindle",
    masterFactor: 0.55,
    masterCount: 1,
    masterOrientation: "left",
    masterNewIsMaster: false,
    // Scrolling layout: the share of the screen a column takes by default.
    columnWidth: 0.5,
};

var LAYOUTS = ["dwindle", "master", "monocle", "scrolling"];
var ORIENTATIONS = ["left", "right", "top", "bottom", "center"];

var MIN_SHARE = 0.05;

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function rect(x, y, w, h) {
    return { x: x, y: y, width: w, height: h };
}

function rectRight(r) { return r.x + r.width; }
function rectBottom(r) { return r.y + r.height; }
function rectCenter(r) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }

function rectContains(r, p) {
    return p.x >= r.x && p.x < rectRight(r) && p.y >= r.y && p.y < rectBottom(r);
}

// Round edges rather than sizes so adjacent tiles never gain or lose a pixel.
function roundRect(r) {
    var x1 = Math.round(r.x), y1 = Math.round(r.y);
    var x2 = Math.round(r.x + r.width), y2 = Math.round(r.y + r.height);
    return rect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
}

function shrink(r, left, top, right, bottom) {
    return rect(r.x + left, r.y + top,
                Math.max(1, r.width - left - right),
                Math.max(1, r.height - top - bottom));
}

// Pick the best candidate in a direction ("left", "right", "up", "down")
// from `from`. Candidates are {id, rect}. Candidates that overlap on the
// perpendicular axis win; ties go to the nearest one, then to the one whose
// centre is best aligned, then to `preferred` order (most recently focused
// first) if provided.
function pickInDirection(from, candidates, dir, preferred) {
    var fc = rectCenter(from);
    var tol = 2;
    var best = null;
    var rank = function (id) {
        if (!preferred) return 0;
        var i = preferred.indexOf(id);
        return i < 0 ? preferred.length : i;
    };
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i], r = c.rect, cc = rectCenter(r);
        var dist, overlap, perp, beyond;
        if (dir === "left") {
            if (cc.x >= fc.x) continue;
            beyond = rectRight(r) <= from.x + tol;
            dist = from.x - rectRight(r);
            overlap = Math.min(rectBottom(r), rectBottom(from)) - Math.max(r.y, from.y);
            perp = Math.abs(cc.y - fc.y);
        } else if (dir === "right") {
            if (cc.x <= fc.x) continue;
            beyond = r.x >= rectRight(from) - tol;
            dist = r.x - rectRight(from);
            overlap = Math.min(rectBottom(r), rectBottom(from)) - Math.max(r.y, from.y);
            perp = Math.abs(cc.y - fc.y);
        } else if (dir === "up") {
            if (cc.y >= fc.y) continue;
            beyond = rectBottom(r) <= from.y + tol;
            dist = from.y - rectBottom(r);
            overlap = Math.min(rectRight(r), rectRight(from)) - Math.max(r.x, from.x);
            perp = Math.abs(cc.x - fc.x);
        } else if (dir === "down") {
            if (cc.y <= fc.y) continue;
            beyond = r.y >= rectBottom(from) - tol;
            dist = r.y - rectBottom(from);
            overlap = Math.min(rectRight(r), rectRight(from)) - Math.max(r.x, from.x);
            perp = Math.abs(cc.x - fc.x);
        } else {
            continue;
        }
        // Windows that lie past the edge win over ones that merely overlap,
        // so a floating window straddling a tile can still move focus.
        var tier = beyond ? (overlap > 0 ? 0 : 1) : 2;
        var score = [tier, Math.max(0, Math.round(dist)), tier === 0 ? rank(c.id) : Math.round(perp), Math.round(perp)];
        if (!best || lexLess(score, best.score)) best = { id: c.id, score: score };
    }
    return best ? best.id : null;
}

function lexLess(a, b) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return true;
        if (a[i] > b[i]) return false;
    }
    return false;
}

function createEngine(userConfig) {
    var cfg = {};
    var k;
    for (k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
    for (k in (userConfig || {})) cfg[k] = userConfig[k];

    var roots = {};      // space -> node
    var areas = {};      // space -> last known work area
    var leafOf = {};     // window id -> leaf node
    var spaceOf = {};    // window id -> space
    var focusOrder = []; // most recently focused first
    var pseudoSizes = {};// window id -> {width, height} when pseudotiled
    var modes = {};      // space -> layout, one of LAYOUTS
    var scrollFirst = {};// space -> index of the leftmost column on screen
    var masterOpts = {}; // space -> {factor, count, orientation}
    var zooms = {};      // space -> the node zoomed into (dwindle only)
    var isVisible = function () { return true; };
    var nextNodeId = 1;

    function newLeaf(ids) {
        return { id: nextNodeId++, leaf: true, wins: ids.slice(), active: 0, grouped: false, parent: null, rect: null };
    }

    function newSplit(dir, ratio) {
        return { id: nextNodeId++, leaf: false, dir: dir, ratio: ratio, locked: false, a: null, b: null, parent: null, rect: null };
    }

    function defaultShare() {
        return clamp(cfg.splitRatio / 2, MIN_SHARE, 1 - MIN_SHARE);
    }

    function replaceChild(parent, oldChild, newChild, space) {
        newChild.parent = parent;
        if (!parent) {
            roots[space] = newChild;
        } else if (parent.a === oldChild) {
            parent.a = newChild;
        } else {
            parent.b = newChild;
        }
    }

    function leaves(node, out) {
        out = out || [];
        if (!node) return out;
        if (node.leaf) out.push(node);
        else { leaves(node.a, out); leaves(node.b, out); }
        return out;
    }

    // ---- layouts -----------------------------------------------------------

    function modeOf(space) {
        if (LAYOUTS.indexOf(modes[space]) >= 0) return modes[space];
        return LAYOUTS.indexOf(cfg.defaultLayout) >= 0 ? cfg.defaultLayout : "dwindle";
    }

    function masterOf(space) {
        if (!masterOpts[space]) {
            masterOpts[space] = {
                factor: cfg.masterFactor,
                count: cfg.masterCount,
                orientation: ORIENTATIONS.indexOf(cfg.masterOrientation) >= 0 ? cfg.masterOrientation : "left",
            };
        }
        return masterOpts[space];
    }

    // Equal shares of `r` along one axis, in order.
    function spread(list, r, dir) {
        var n = list.length;
        for (var i = 0; i < n; i++) {
            list[i].rect = dir === "v"
                ? rect(r.x, r.y + r.height * i / n, r.width, r.height / n)
                : rect(r.x + r.width * i / n, r.y, r.width / n, r.height);
        }
    }

    // Masters in a row (or column) of their own, everything else sharing the
    // rest; "center" puts the masters in the middle with the others to either
    // side, which is Krohnkite's three-column layout.
    function placeMaster(space, all, inner) {
        var p = masterOf(space);
        var count = clamp(Math.round(p.count), 1, all.length);
        var masters = all.slice(0, count), stack = all.slice(count);
        var f = clamp(p.factor, MIN_SHARE, 1 - MIN_SHARE);
        var sideways = p.orientation !== "top" && p.orientation !== "bottom";
        if (!stack.length) {
            spread(masters, inner, sideways ? "v" : "h");
            return;
        }
        if (p.orientation === "center") {
            var right = [], left = [];
            stack.forEach(function (leaf, i) { (i % 2 === 0 ? right : left).push(leaf); });
            var side = inner.width * (1 - f) / (left.length && right.length ? 2 : 1);
            var leftW = left.length ? side : 0, rightW = right.length ? side : 0;
            var midW = inner.width - leftW - rightW;
            if (left.length) spread(left, rect(inner.x, inner.y, leftW, inner.height), "v");
            spread(masters, rect(inner.x + leftW, inner.y, midW, inner.height), "v");
            if (right.length) spread(right, rect(inner.x + leftW + midW, inner.y, rightW, inner.height), "v");
            return;
        }
        if (sideways) {
            var mw = inner.width * f;
            var mx = p.orientation === "left" ? inner.x : inner.x + inner.width - mw;
            var sx = p.orientation === "left" ? inner.x + mw : inner.x;
            spread(masters, rect(mx, inner.y, mw, inner.height), "v");
            spread(stack, rect(sx, inner.y, inner.width - mw, inner.height), "v");
        } else {
            var mh = inner.height * f;
            var my = p.orientation === "top" ? inner.y : inner.y + inner.height - mh;
            var sy = p.orientation === "top" ? inner.y + mh : inner.y;
            spread(masters, rect(inner.x, my, inner.width, mh), "h");
            spread(stack, rect(inner.x, sy, inner.width, inner.height - mh), "h");
        }
    }

    // A strip of columns, as niri and hyprscrolling do it: the focused column
    // is always on screen, and whole columns are shown, never parts of one.
    // Columns that do not fit are reported to the driver, which parks them
    // beyond the monitors rather than letting them spill onto the next one.
    function placeScrolling(space, all, inner, offscreen) {
        var focused = leafOf[api.lastFocused(space)] || all[0];
        var index = Math.max(0, all.indexOf(focused));
        var widths = all.map(function (leaf) {
            return Math.max(MIN_SHARE, Math.min(1, leaf.share || cfg.columnWidth)) * inner.width;
        });
        // How far the strip reaches when it starts at `start`.
        var reach = function (start) {
            var used = 0, last = start;
            while (last < all.length && used + widths[last] <= inner.width + 0.5) {
                used += widths[last];
                last++;
            }
            return Math.max(last, start + 1);   // a column wider than the view still shows
        };
        var first = Math.max(0, Math.min(scrollFirst[space] || 0, all.length - 1));
        if (index < first) first = index;
        while (reach(first) <= index) first++;                        // keep the focused column in view
        while (first > 0 && reach(first - 1) > index) first--;        // and the view full
        scrollFirst[space] = first;
        var x = inner.x, room = inner.width;
        all.forEach(function (leaf, i) {
            if (i < first || widths[i] > room + 0.5) {
                leaf.rect = null;
                leaf.wins.forEach(function (id) { offscreen.push(id); });
                return;
            }
            leaf.rect = rect(x, inner.y, widths[i], inner.height);
            x += widths[i];
            room -= widths[i];
        });
    }

    // ---- zoom ----------------------------------------------------------------
    //
    // After Trellis's fractal workspaces: any part of the dwindle tree can be
    // zoomed into, so it fills the whole area in the same arrangement while
    // everything else waits off screen, still running. A zoom that no longer
    // points into the tree (its windows went, or the layout changed) lapses.

    function shownLeaves(node) {
        return leaves(node).filter(shown);
    }

    function zoomOf(space) {
        var z = zooms[space];
        if (!z) return null;
        var top = z;
        while (top.parent) top = top.parent;
        if (top !== roots[space] || z === roots[space] || !shown(z) || modeOf(space) !== "dwindle") {
            delete zooms[space];
            return null;
        }
        return z;
    }

    function inside(node, ancestor) {
        for (var n = node; n; n = n.parent) if (n === ancestor) return true;
        return false;
    }

    // Put every visible leaf of a space where its layout wants it.
    function arrange(space, inner, offscreen) {
        var root = roots[space];
        if (!root) return [];
        var all = leaves(root).filter(shown);
        var mode = modeOf(space);
        if (!all.length) return all;
        if (mode === "monocle") all.forEach(function (leaf) { leaf.rect = inner; });
        else if (mode === "master") placeMaster(space, all, inner);
        else if (mode === "scrolling") placeScrolling(space, all, inner, offscreen || []);
        else {
            var z = zoomOf(space);
            if (z) {
                all.forEach(function (leaf) { leaf.rect = null; });
                place(z, inner);
                all.forEach(function (leaf) {
                    if (!leaf.rect && offscreen) leaf.wins.forEach(function (id) { offscreen.push(id); });
                });
            } else {
                place(root, inner);
            }
        }
        return all;
    }

    // The master boundary moves right (or down) on a positive delta, whichever
    // side of it the window is on, as the dwindle divider does.
    function nudgeMaster(space, delta, sideways) {
        var p = masterOf(space);
        var area = areas[space] || rect(0, 0, 1920, 1080);
        var share = delta / Math.max(1, sideways ? area.width : area.height);
        if (p.orientation === "right" || p.orientation === "bottom") share = -share;
        var before = p.factor;
        p.factor = clamp(p.factor + share, MIN_SHARE, 1 - MIN_SHARE);
        return p.factor !== before;
    }

    // Gaps a workspace rule set for one space; anything it leaves out falls
    // back to the global setting.
    var spaceGaps = {};
    function gapsFor(space) {
        var g = spaceGaps[space] || {};
        return {
            inner: g.inner === undefined || g.inner === null ? cfg.gapsIn : g.inner,
            outer: g.outer === undefined || g.outer === null ? cfg.gapsOut : g.outer,
        };
    }

    // Whichever of these was focused most recently.
    function mostRecent(ids) {
        for (var i = 0; i < focusOrder.length; i++) {
            if (ids.indexOf(focusOrder[i]) >= 0) return focusOrder[i];
        }
        return ids.length ? ids[0] : null;
    }

    function autoDir(r) {
        if (!r) return "h";
        return r.width * cfg.splitWidthMultiplier >= r.height ? "h" : "v";
    }

    // Compute node rects for a space without producing window geometry.
    function computeRects(space) {
        var area = areas[space] || rect(0, 0, 1920, 1080);
        if (!roots[space]) return;
        var gOut = gapsFor(space).outer;
        arrange(space, shrink(area, gOut, gOut, gOut, gOut));
    }

    // A subtree is shown if any window in it is visible. Hidden subtrees
    // (minimized windows, windows on another activity) keep their place in
    // the tree but give their space to their sibling.
    function shown(node) {
        if (!node) return false;
        if (node.leaf) return node.wins.some(function (w) { return isVisible(w); });
        return shown(node.a) || shown(node.b);
    }

    function place(node, r) {
        node.rect = r;
        if (node.leaf) return;
        var sa = shown(node.a), sb = shown(node.b);
        if (!sa || !sb) {
            place(node.a, r);
            place(node.b, r);
            if (!sa) node.a.rect = null;
            if (!sb) node.b.rect = null;
            return;
        }
        if (!cfg.preserveSplit && !node.locked) node.dir = autoDir(r);
        var s = clamp(node.ratio, MIN_SHARE, 1 - MIN_SHARE);
        if (node.dir === "h") {
            var aw = r.width * s;
            place(node.a, rect(r.x, r.y, aw, r.height));
            place(node.b, rect(r.x + aw, r.y, r.width - aw, r.height));
        } else {
            var ah = r.height * s;
            place(node.a, rect(r.x, r.y, r.width, ah));
            place(node.b, rect(r.x, r.y + ah, r.width, r.height - ah));
        }
    }

    function pickTargetLeaf(space, exclude) {
        var ls = leaves(roots[space]);
        for (var i = 0; i < focusOrder.length; i++) {
            var id = focusOrder[i];
            if (id !== exclude && spaceOf[id] === space && leafOf[id] && isVisible(id)) return leafOf[id];
        }
        var vis = ls.filter(shown);
        if (vis.length) return vis[vis.length - 1];
        return ls.length ? ls[ls.length - 1] : null;
    }

    // Insert `id` into `space`. opts: {target: window id, cursor: {x,y},
    // side: "left"|"right"|"up"|"down" (forces placement relative to target)}
    function insert(id, space, opts) {
        opts = opts || {};
        spaceOf[id] = space;
        var root = roots[space];
        if (!root) {
            var l = newLeaf([id]);
            roots[space] = l;
            leafOf[id] = l;
            return;
        }
        var target = null;
        if (opts.target && leafOf[opts.target] && spaceOf[opts.target] === space) target = leafOf[opts.target];
        if (!target) target = pickTargetLeaf(space, id);
        computeRects(space);

        var dir, first;
        if (opts.side) {
            dir = (opts.side === "left" || opts.side === "right") ? "h" : "v";
            first = opts.side === "left" || opts.side === "up";
        } else {
            dir = autoDir(target.rect);
            if (cfg.forceSplit === 1) first = true;
            else if (cfg.forceSplit === 2) first = false;
            else if (opts.cursor && target.rect) {
                var c = rectCenter(target.rect);
                first = dir === "h" ? opts.cursor.x < c.x : opts.cursor.y < c.y;
            } else first = false;
        }

        var leaf = newLeaf([id]);
        var split = newSplit(dir, defaultShare());
        var parent = target.parent;
        replaceChild(parent, target, split, space);
        if (zooms[space] === target) zooms[space] = split;
        if (first) { split.a = leaf; split.b = target; }
        else { split.a = target; split.b = leaf; }
        leaf.parent = split;
        target.parent = split;
        leafOf[id] = leaf;
    }

    function detach(id) {
        var leaf = leafOf[id];
        var space = spaceOf[id];
        delete leafOf[id];
        delete spaceOf[id];
        if (!leaf) return;
        var idx = leaf.wins.indexOf(id);
        if (idx >= 0) leaf.wins.splice(idx, 1);
        if (leaf.wins.length > 0) {
            if (idx < leaf.active) leaf.active--;
            leaf.active = Math.min(leaf.active, leaf.wins.length - 1);
            return;
        }
        var parent = leaf.parent;
        if (!parent) {
            delete roots[space];
            return;
        }
        var sibling = parent.a === leaf ? parent.b : parent.a;
        if (zooms[space] === leaf || zooms[space] === parent) zooms[space] = sibling;
        replaceChild(parent.parent, parent, sibling, space);
    }

    function forget(id) {
        detach(id);
        delete pseudoSizes[id];
        var i = focusOrder.indexOf(id);
        if (i >= 0) focusOrder.splice(i, 1);
    }

    function ancestorSplit(leaf, dir, wantFirst) {
        var node = leaf;
        while (node.parent) {
            var p = node.parent;
            if (p.dir === dir && (p.a === node) === wantFirst) return p;
            node = p;
        }
        return null;
    }

    function adjustEdge(leaf, dir, wantFirst, deltaPx) {
        var s = ancestorSplit(leaf, dir, wantFirst);
        if (!s || !s.rect) return false;
        var size = dir === "h" ? s.rect.width : s.rect.height;
        if (size <= 0) return false;
        s.ratio = clamp(s.ratio + deltaPx / size, MIN_SHARE, 1 - MIN_SHARE);
        return true;
    }

    // The closest split in one axis above a window, whichever side it is on.
    function nearestSplit(leaf, dir) {
        for (var node = leaf.parent; node; node = node.parent) {
            if (node.dir === dir) return node;
        }
        return null;
    }

    function shiftSplit(leaf, dir, deltaPx) {
        var s = nearestSplit(leaf, dir);
        if (!s || !s.rect) return false;
        var size = dir === "h" ? s.rect.width : s.rect.height;
        if (size <= 0) return false;
        var before = s.ratio;
        s.ratio = clamp(s.ratio + deltaPx / size, MIN_SHARE, 1 - MIN_SHARE);
        return s.ratio !== before;
    }

    var api = {
        // Gaps for one space, from a workspace rule; null goes back to the
        // global setting.
        setGaps: function (space, gaps) {
            if (gaps) spaceGaps[space] = gaps;
            else delete spaceGaps[space];
        },
        config: cfg,

        setConfig: function (c) {
            for (var key in c) cfg[key] = c[key];
        },

        setArea: function (space, area) {
            areas[space] = area;
        },

        // fn(id) -> bool. Invisible windows keep their tree position but take
        // no space in the layout.
        setVisibility: function (fn) {
            isVisible = fn || function () { return true; };
        },

        has: function (id) { return !!leafOf[id]; },
        spaceOf: function (id) { return leafOf[id] ? spaceOf[id] : null; },
        spaces: function () { return Object.keys(roots); },

        windows: function (space) {
            var out = [];
            leaves(roots[space]).forEach(function (l) { out = out.concat(l.wins); });
            return out;
        },

        count: function (space) { return api.windows(space).length; },

        add: function (id, space, opts) {
            if (leafOf[id]) detach(id);
            var mode = modeOf(space);
            if (mode !== "dwindle" && roots[space]) {
                // Order is all these layouts go by: a new window becomes the
                // master (master:new_status) or joins the end.
                var all = leaves(roots[space]);
                var first = mode === "master" && cfg.masterNewIsMaster;
                var edge = first ? all[0] : all[all.length - 1];
                opts = { target: edge.wins[edge.active], side: first ? "left" : "right" };
            }
            insert(id, space, opts);
        },

        remove: function (id) { forget(id); },

        // Take a window out of the tree but remember focus history.
        detach: function (id) { detach(id); },

        moveToSpace: function (id, space, opts) {
            if (spaceOf[id] === space && leafOf[id]) return;
            detach(id);
            insert(id, space, opts);
        },

        focused: function (id) {
            var i = focusOrder.indexOf(id);
            if (i >= 0) focusOrder.splice(i, 1);
            focusOrder.unshift(id);
            var leaf = leafOf[id];
            if (leaf) {
                var j = leaf.wins.indexOf(id);
                if (j >= 0) leaf.active = j;
            }
        },

        // The window that takes this one's place when it goes away, the way
        // Hyprland moves focus to what grows into the gap: another window in
        // its group, the side of the split it shared (most recently used
        // window in there), or the next one along in the other layouts.
        neighbourOf: function (id) {
            var leaf = leafOf[id];
            if (!leaf) return null;
            if (leaf.wins.length > 1) {
                var j = leaf.wins.indexOf(id);
                return leaf.wins[(j + 1) % leaf.wins.length];
            }
            var space = spaceOf[id];
            if (api.layoutOf(space) === "dwindle") {
                var parent = leaf.parent;
                if (parent) {
                    var sibling = parent.a === leaf ? parent.b : parent.a;
                    var ids = leaves(sibling).reduce(function (acc, l) { return acc.concat(l.wins); }, []);
                    return mostRecent(ids);
                }
            }
            var all = api.windows(space).filter(function (w) { return w !== id; });
            if (!all.length) return null;
            var order = api.windows(space);
            var i = order.indexOf(id);
            return order[i + 1] || order[i - 1] || all[0];
        },

        // Zoom one level further in, towards this window: the smallest part
        // of the tree around it that shows fewer windows than now.
        zoomIn: function (id) {
            var leaf = leafOf[id];
            if (!leaf) return false;
            var space = spaceOf[id];
            if (modeOf(space) !== "dwindle") return false;
            var top = zoomOf(space);
            if (!top || !inside(leaf, top)) top = roots[space];
            var path = [];
            for (var n = leaf; n && n !== top; n = n.parent) path.unshift(n);
            var now = shownLeaves(top).length;
            for (var i = 0; i < path.length; i++) {
                if (shownLeaves(path[i]).length < now) {
                    zooms[space] = path[i];
                    return true;
                }
            }
            return false;
        },

        // One level back out: the next part of the tree up that shows more.
        zoomOut: function (space) {
            var z = zoomOf(space);
            if (!z) return false;
            var now = shownLeaves(z).length;
            var p = z.parent;
            while (p && p !== roots[space] && shownLeaves(p).length === now) p = p.parent;
            if (!p || p === roots[space]) delete zooms[space];
            else zooms[space] = p;
            return true;
        },

        zoomReset: function (space) {
            if (!zooms[space]) return false;
            delete zooms[space];
            return true;
        },

        // {shown, total} windows while zoomed in, or null.
        zoomInfo: function (space) {
            var z = zoomOf(space);
            if (!z) return null;
            var count = function (node) {
                return shownLeaves(node).reduce(function (n, l) { return n + l.wins.length; }, 0);
            };
            return { shown: count(z), total: count(roots[space]) };
        },

        // Whether a window is on screen as far as the zoom goes.
        inZoom: function (id) {
            var leaf = leafOf[id];
            if (!leaf) return true;
            var z = zoomOf(spaceOf[id]);
            return !z || inside(leaf, z);
        },

        // The choices a workspace keeps from one session to the next: its
        // layout and master settings, by space. (Where windows sit in the
        // tree does not carry over: windows are new each session.)
        exportSettings: function () {
            var out = {};
            var note = function (space) { return out[space] || (out[space] = {}); };
            Object.keys(modes).forEach(function (space) { note(space).layout = modes[space]; });
            Object.keys(masterOpts).forEach(function (space) {
                var p = masterOpts[space];
                var o = note(space);
                o.factor = Math.round(p.factor * 1000) / 1000;
                o.count = p.count;
                o.orientation = p.orientation;
            });
            return out;
        },

        importSettings: function (saved) {
            if (!saved || typeof saved !== "object") return 0;
            var n = 0;
            Object.keys(saved).forEach(function (space) {
                var o = saved[space] || {};
                if (LAYOUTS.indexOf(o.layout) >= 0) modes[space] = o.layout;
                if (typeof o.factor === "number" || typeof o.count === "number" || o.orientation) {
                    var p = masterOf(space);
                    if (typeof o.factor === "number" && isFinite(o.factor)) p.factor = clamp(o.factor, MIN_SHARE, 1 - MIN_SHARE);
                    if (typeof o.count === "number" && o.count >= 1) p.count = Math.round(o.count);
                    if (ORIENTATIONS.indexOf(o.orientation) >= 0) p.orientation = o.orientation;
                }
                n++;
            });
            return n;
        },

        focusHistory: function () { return focusOrder.slice(); },

        lastFocused: function (space) {
            for (var i = 0; i < focusOrder.length; i++) {
                if (spaceOf[focusOrder[i]] === space && leafOf[focusOrder[i]]) return focusOrder[i];
            }
            var ws = api.windows(space);
            return ws.length ? ws[0] : null;
        },

        setPseudo: function (id, size) {
            if (size) pseudoSizes[id] = size;
            else delete pseudoSizes[id];
        },

        isPseudo: function (id) { return !!pseudoSizes[id]; },

        // Returns {windows: {id: rect}, groups: [{space, rect, wins, active}],
        // hidden: [ids of inactive group members],
        // offscreen: [ids a scrolling layout has no room for]}.
        layout: function (space, area) {
            if (area) areas[space] = area;
            var result = { windows: {}, groups: [], hidden: [], offscreen: [] };
            var root = roots[space];
            if (!root) return result;
            area = areas[space];
            var all = leaves(root).filter(shown);
            if (!all.length) return result;
            var only = all.length === 1 && cfg.noGapsWhenOnly;
            var g = gapsFor(space);
            var gIn = only ? 0 : g.inner;
            var gOut = only ? 0 : g.outer;
            var inner = shrink(area, gOut, gOut, gOut, gOut);
            arrange(space, inner, result.offscreen);
            var eps = 0.5;
            all.forEach(function (leaf) {
                var r = leaf.rect;
                if (!r) return;    // scrolled out of view; the driver parks it
                var l = Math.abs(r.x - inner.x) < eps ? 0 : gIn;
                var t = Math.abs(r.y - inner.y) < eps ? 0 : gIn;
                var rr = Math.abs(rectRight(r) - rectRight(inner)) < eps ? 0 : gIn;
                var b = Math.abs(rectBottom(r) - rectBottom(inner)) < eps ? 0 : gIn;
                var tile = roundRect(shrink(r, l, t, rr, b));
                var winRect = tile;
                if (!isVisible(leaf.wins[leaf.active])) {
                    for (var vi = 0; vi < leaf.wins.length; vi++) {
                        if (isVisible(leaf.wins[vi])) { leaf.active = vi; break; }
                    }
                }
                if (leaf.grouped) {
                    var barH = cfg.groupBarHeight;
                    result.groups.push({
                        space: space,
                        rect: rect(tile.x, tile.y, tile.width, barH),
                        wins: leaf.wins.slice(),
                        active: leaf.active,
                    });
                    winRect = shrink(tile, 0, barH + cfg.groupBarGap, 0, 0);
                }
                leaf.wins.forEach(function (id, i) {
                    var wr = winRect;
                    var ps = pseudoSizes[id];
                    if (ps) {
                        var pw = Math.min(ps.width, wr.width), ph = Math.min(ps.height, wr.height);
                        wr = roundRect(rect(wr.x + (wr.width - pw) / 2, wr.y + (wr.height - ph) / 2, pw, ph));
                    }
                    result.windows[id] = wr;
                    if (i !== leaf.active) result.hidden.push(id);
                });
            });
            return result;
        },

        // Tile rect of a window from the last layout pass (without pseudo).
        tileRect: function (id) {
            var leaf = leafOf[id];
            return leaf && leaf.rect ? leaf.rect : null;
        },

        toggleSplit: function (id) {
            var leaf = leafOf[id];
            if (!leaf || !leaf.parent || modeOf(spaceOf[id]) !== "dwindle") return false;
            var p = leaf.parent;
            p.dir = p.dir === "h" ? "v" : "h";
            p.locked = true;
            return p.dir;    // the new direction, and truthy as it always was
        },

        // Swap the two children of the window's parent split (Hyprland swapsplit).
        swapSplit: function (id) {
            var leaf = leafOf[id];
            if (!leaf || !leaf.parent) return false;
            var p = leaf.parent;
            var t = p.a; p.a = p.b; p.b = t;
            p.ratio = 1 - p.ratio;
            return true;
        },

        // Keyboard resize, Hyprland resizeactive semantics: positive dx grows
        // the window horizontally, preferring its right edge.
        // Keyboard resize: move the divider next to the window by a number of
        // pixels, positive being right / down, whichever side of it the window
        // is on. A window with no split in that axis stays as it is.
        moveDivider: function (id, dx, dy) {
            var leaf = leafOf[id];
            if (!leaf) return false;
            var mode = modeOf(spaceOf[id]);
            if (mode === "monocle") return false;   // one window, no divider
            if (mode === "scrolling") {
                if (!dx) return false;
                var area = areas[spaceOf[id]] || rect(0, 0, 1920, 1080);
                var before = leaf.share || cfg.columnWidth;
                leaf.share = clamp(before + dx / Math.max(1, area.width), MIN_SHARE, 1);
                return leaf.share !== before;
            }
            if (mode === "master") {
                var sideways = masterOf(spaceOf[id]).orientation !== "top" &&
                    masterOf(spaceOf[id]).orientation !== "bottom";
                return nudgeMaster(spaceOf[id], sideways ? dx : dy, sideways);
            }
            computeRects(spaceOf[id]);
            var changed = false;
            if (dx) changed = shiftSplit(leaf, "h", dx) || changed;
            if (dy) changed = shiftSplit(leaf, "v", dy) || changed;
            return changed;
        },

        // Interactive resize: `before` and `after` are the window's frame
        // geometry before and after the user dragged an edge.
        resizeByRects: function (id, before, after) {
            var leaf = leafOf[id];
            if (!leaf) return false;
            var dL = after.x - before.x, dT = after.y - before.y;
            var dR = rectRight(after) - rectRight(before), dB = rectBottom(after) - rectBottom(before);
            var mode = modeOf(spaceOf[id]);
            if (mode === "monocle") return false;
            if (mode === "scrolling") return api.moveDivider(id, dL + dR, 0);
            if (mode === "master") {
                // Whichever edge was dragged, the master boundary moved with it.
                var sideways = masterOf(spaceOf[id]).orientation !== "top" &&
                    masterOf(spaceOf[id]).orientation !== "bottom";
                return nudgeMaster(spaceOf[id], sideways ? dL + dR : dT + dB, sideways);
            }
            computeRects(spaceOf[id]);
            var changed = false;
            if (Math.abs(dR) >= 1) changed = adjustEdge(leaf, "h", true, dR) || changed;
            if (Math.abs(dL) >= 1) changed = adjustEdge(leaf, "h", false, dL) || changed;
            if (Math.abs(dB) >= 1) changed = adjustEdge(leaf, "v", true, dB) || changed;
            if (Math.abs(dT) >= 1) changed = adjustEdge(leaf, "v", false, dT) || changed;
            return changed;
        },

        // Swap the tree positions (whole leaves, so groups travel together).
        swap: function (a, b) {
            var la = leafOf[a], lb = leafOf[b];
            if (!la || !lb || la === lb) return false;
            var sa = spaceOf[a], sb = spaceOf[b];
            var tmp = { wins: la.wins, active: la.active, grouped: la.grouped };
            la.wins = lb.wins; la.active = lb.active; la.grouped = lb.grouped;
            lb.wins = tmp.wins; lb.active = tmp.active; lb.grouped = tmp.grouped;
            la.wins.forEach(function (w) { leafOf[w] = la; spaceOf[w] = sa; });
            lb.wins.forEach(function (w) { leafOf[w] = lb; spaceOf[w] = sb; });
            return true;
        },

        // Move every window of one space into another (Hyprland
        // moveworkspacetomonitor). Keeps the tree if the target is empty.
        moveSpace: function (from, to) {
            if (from === to || !roots[from]) return false;
            if (!roots[to]) {
                roots[to] = roots[from];
                delete roots[from];
                api.windows(to).forEach(function (w) { spaceOf[w] = to; });
                // The tree keeps its layout, master settings and scroll
                // position: they belong to the windows, not the place.
                // (Not its area: that belongs to the monitor, and the next
                // layout pass sets it.)
                [modes, masterOpts, scrollFirst, zooms].forEach(function (map) {
                    if (from in map) map[to] = map[from];
                    else delete map[to];
                    delete map[from];
                });
                return true;
            }
            var ws = api.windows(from);
            var active = api.lastFocused(from);
            // Keep groups intact by moving whole leaves.
            leaves(roots[from]).forEach(function (leaf) {
                var first = leaf.wins[0];
                var grouped = leaf.grouped, rest = leaf.wins.slice(1), act = leaf.active;
                rest.forEach(function (w) { detach(w); });
                detach(first);
                insert(first, to, {});
                var nl = leafOf[first];
                nl.grouped = grouped;
                rest.forEach(function (w) { nl.wins.push(w); leafOf[w] = nl; spaceOf[w] = to; });
                nl.active = act;
            });
            return ws.length > 0 && !!active;
        },

        // Move `id` next to `target`, on the given side of it.
        moveNextTo: function (id, target, side) {
            if (id === target || !leafOf[target]) return false;
            var space = spaceOf[target];
            detach(id);
            insert(id, space, { target: target, side: side });
            return true;
        },

        // Drop a dragged window onto `target` at `point`: the closest edge of
        // the target tile decides the side. Returns false if nothing changed.
        dropOnto: function (id, target, point) {
            var tr = api.tileRect(target);
            if (!tr) return false;
            var dl = point.x - tr.x, dr = rectRight(tr) - point.x;
            var du = point.y - tr.y, dd = rectBottom(tr) - point.y;
            // Normalise so wide tiles don't always favour vertical splits.
            var nl = dl / tr.width, nr = dr / tr.width, nu = du / tr.height, nd = dd / tr.height;
            var m = Math.min(nl, nr, nu, nd);
            var side = m === nl ? "left" : m === nr ? "right" : m === nu ? "up" : "down";
            return api.moveNextTo(id, target, side);
        },

        // ---- groups -------------------------------------------------------

        isGrouped: function (id) {
            var leaf = leafOf[id];
            return !!(leaf && leaf.grouped);
        },

        groupOf: function (id) {
            var leaf = leafOf[id];
            if (!leaf || !leaf.grouped) return null;
            return { wins: leaf.wins.slice(), active: leaf.active };
        },

        // Make the window's tile a group, or dissolve its group back into
        // regular tiles (Hyprland togglegroup).
        toggleGroup: function (id) {
            var leaf = leafOf[id];
            if (!leaf) return false;
            if (!leaf.grouped) {
                leaf.grouped = true;
                return true;
            }
            var space = spaceOf[id];
            var others = leaf.wins.filter(function (w) { return w !== id; });
            leaf.wins = [id];
            leaf.active = 0;
            leaf.grouped = false;
            var prev = id;
            others.forEach(function (w) {
                delete leafOf[w];
                insert(w, space, { target: prev });
                prev = w;
            });
            return true;
        },

        // Move `id` into the group containing `target` (Hyprland
        // moveintogroup). The target must already be a group.
        joinGroup: function (id, target) {
            var lt = leafOf[target];
            if (!lt || !lt.grouped || leafOf[id] === lt) return false;
            var space = spaceOf[target];
            detach(id);
            lt.wins.splice(lt.active + 1, 0, id);
            lt.active = lt.active + 1;
            leafOf[id] = lt;
            spaceOf[id] = space;
            return true;
        },

        // Take `id` out of its group into a tile of its own next to it.
        leaveGroup: function (id) {
            var leaf = leafOf[id];
            if (!leaf || !leaf.grouped || leaf.wins.length < 2) return false;
            var space = spaceOf[id];
            detach(id);
            insert(id, space, { target: leaf.wins[leaf.active] });
            return true;
        },

        // Cycle the active member of the window's group. Returns the newly
        // active window id or null.
        groupCycle: function (id, delta) {
            var leaf = leafOf[id];
            if (!leaf || !leaf.grouped || leaf.wins.length < 2) return null;
            var n = leaf.wins.length;
            leaf.active = ((leaf.active + delta) % n + n) % n;
            return leaf.wins[leaf.active];
        },

        groupSelect: function (id, index) {
            var leaf = leafOf[id];
            if (!leaf || !leaf.grouped || index < 0 || index >= leaf.wins.length) return null;
            leaf.active = index;
            return leaf.wins[index];
        },

        // Debug / tests: serialise a space's tree.
        // ---- layouts ------------------------------------------------------

        layouts: function () { return LAYOUTS.slice(); },

        layoutOf: function (space) { return modeOf(space); },

        setLayout: function (space, mode) {
            if (LAYOUTS.indexOf(mode) < 0 || modeOf(space) === mode) return false;
            modes[space] = mode;
            return true;
        },

        cycleLayout: function (space, delta) {
            var i = LAYOUTS.indexOf(modeOf(space));
            modes[space] = LAYOUTS[((i + (delta || 1)) % LAYOUTS.length + LAYOUTS.length) % LAYOUTS.length];
            return modes[space];
        },

        masterParams: function (space) {
            var p = masterOf(space);
            return { factor: p.factor, count: p.count, orientation: p.orientation };
        },

        // Hyprland's layoutmsg swapwithmaster: the focused window and the
        // first master change places.
        swapWithMaster: function (id) {
            var leaf = leafOf[id];
            if (!leaf) return false;
            var all = leaves(roots[spaceOf[id]] || null).filter(shown);
            if (all.length < 2 || all[0] === leaf) return false;
            return api.swap(id, all[0].wins[all[0].active]);
        },

        // The window of the first master leaf (layoutmsg focusmaster).
        firstMaster: function (space) {
            var all = leaves(roots[space] || null).filter(shown);
            return all.length ? all[0].wins[all[0].active] : null;
        },

        setMasterCount: function (space, delta) {
            var p = masterOf(space);
            var all = leaves(roots[space] || null).filter(shown);
            var before = p.count;
            p.count = clamp(Math.round(p.count + delta), 1, Math.max(1, all.length));
            return p.count !== before;
        },

        cycleMasterOrientation: function (space, delta) {
            var p = masterOf(space);
            var i = ORIENTATIONS.indexOf(p.orientation);
            p.orientation = ORIENTATIONS[((i + (delta || 1)) % ORIENTATIONS.length + ORIENTATIONS.length) % ORIENTATIONS.length];
            return p.orientation;
        },

        // The next window in layout order (Hyprland's cyclenext), which is
        // how you move through a monocle layout.
        cycleWindow: function (id, delta) {
            var space = spaceOf[id];
            if (!leafOf[id]) return null;
            var all = leaves(roots[space] || null).filter(shown);
            if (all.length < 2) return null;
            var i = all.indexOf(leafOf[id]);
            var next = all[((i + (delta || 1)) % all.length + all.length) % all.length];
            return next.wins[next.active];
        },

        dump: function (space) {
            function d(n) {
                if (!n) return null;
                if (n.leaf) return n.grouped ? { group: n.wins.slice(), active: n.active } : n.wins[0];
                return { dir: n.dir, ratio: Math.round(n.ratio * 1000) / 1000, a: d(n.a), b: d(n.b) };
            }
            return d(roots[space]);
        },
    };
    return api;
}
