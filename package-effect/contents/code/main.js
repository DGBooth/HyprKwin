/*
    HyprKwin animations: slide and stretch windows to their new place.

    HyprKwin re-tiles windows by setting their geometry, which happens in one
    step. This effect animates the *rendered* window from where it was to where
    it now is, so clients never see intermediate sizes — the same technique
    KWin's own "Stretch" effect uses for maximize.

    SPDX-License-Identifier: GPL-3.0-or-later
*/

"use strict";

const OVERLAY_TITLE = "HyprKwin overlay";
// Replaced by tools/install.sh in the installed copy, and logged at startup
// so the installer can tell the effect it reloaded is the one just installed.
const BUILD = "source";

// Plasma's own open/close animations. KWin marks them exclusive, so loading
// one retires the others; we unload explicitly too in case that changes.
const OPEN_CLOSE_EFFECTS = ["scale", "fade", "glide"];

// The settings page's curves, as KWin names them and as functions (to work
// out where a window is part way through an animation).
const CURVES = ["OutCubic", "OutQuad", "OutExpo", "OutBack", "Linear"];
const EASES = [
    (t) => 1 - (1 - t) ** 3,
    (t) => 1 - (1 - t) ** 2,
    (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
    (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
    (t) => t,
];

function plainRect(r) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

// With fractional scaling KWin's geometry is in fractions of a pixel, and
// its rounding varies: anything within a pixel counts as the same.
function near(a, b) {
    return Math.abs(a - b) < 1;
}

function sameRect(a, b) {
    return near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);
}

// Exactly, as Plasma's Maximize effect compares them.
function sameSize(a, b) {
    return a.width === b.width && a.height === b.height;
}

class HyprKwinAnimations {
    constructor() {
        print("HYPRKWIN_EFFECT_BUILD " + BUILD);
        // Set whenever a real window animates. HyprKwin applies window
        // geometry first and updates its overlays a moment later, so this
        // tells the two cases apart: a border following its own moving
        // window, and a border reused for another window when focus changes.
        // Only the first should animate; the second would slide the border
        // across the screen.
        this.lastWindowAnimation = 0;
        // While the user drags an edge, HyprKwin re-tiles the neighbours on
        // every pointer step; they have to follow the pointer, not chase it.
        this.userResizing = null;
        this.userResizeEnded = 0;
        // A keyboard divider slide in progress: borders follow it.
        this.slideUntil = 0;
        // A panel appeared, went or changed size a moment ago: the work area
        // changes after it, and every tiled window re-tiles a little. Until
        // then those changes glide together (see glide()), where otherwise a
        // window that only shrinks would snap like a divider nudge while its
        // neighbour slides.
        this.panelUntil = 0;
        // A glide in progress, and how long it takes: borders keep pace.
        this.glideUntil = 0;
        this.glideDuration = 0;
        effects.windowClosed.connect((window) => {
            if (window.dock) this.notePanel();
        });
        effect.animationEnded.connect((window, id) => {
            // The watchdog on a covered window ran out: never leave it clipped.
            if (window.hkCoverWatch === id) this.uncover(window);
        });
        effect.configChanged.connect(this.loadConfig.bind(this));
        // HyprKwin's own overlay windows (borders, tab bars, the stage
        // layout's previews and its switch) come and go with the windows they
        // belong to and must not fade or scale on their own: claiming their
        // opening and closing makes Plasma's effects for those (Fading Popups,
        // Scale, Glide, Fade) leave them alone, as they leave any window
        // another effect has claimed.
        effects.windowAdded.connect((window) => {
            if (window.caption === OVERLAY_TITLE) effect.grab(window, Effect.WindowAddedGrabRole, true);
        });
        effects.windowClosed.connect((window) => {
            if (window.caption === OVERLAY_TITLE) effect.grab(window, Effect.WindowClosedGrabRole, true);
        });
        effects.windowAdded.connect(this.manage.bind(this));
        // Plasma 6.8 can load its own open/close effect after this one at
        // login, and nothing says when: check again as each window opens,
        // ahead of that effect seeing it.
        effects.windowAdded.connect(() => this.applyOpenCloseEffect(this.openClose));
        for (const window of effects.stackingOrder) {
            this.manage(window);
        }
        this.loadConfig();
    }

    loadConfig() {
        this.duration = animationTime(effect.readConfig("Duration", 200) || 200);
        this.animateMove = effect.readConfig("AnimateMove", true);
        this.animateResize = effect.readConfig("AnimateResize", true);
        this.animateOverlays = effect.readConfig("AnimateOverlays", true);
        // Ignore jumps across the screen (another desktop or output): sliding
        // the whole width looks like a glitch rather than a transition.
        this.maxDistance = effect.readConfig("MaxDistance", 0);
        this.overlayGrace = 80;
        // Cross-fading means KWin renders a window into an offscreen buffer
        // and blits it. That is fine for one window, but a layout change
        // moves every window at once, and a burst of big offscreen buffers in
        // a single frame is enough to bring some drivers down. Only the first
        // couple of windows in a batch cross-fade; the rest just resize.
        this.crossFade = effect.readConfig("CrossFade", true);
        this.maxCrossFades = 2;
        this.fadeBatchStarted = 0;
        this.fadesInBatch = 0;
        // Fixed rather than following Duration: HyprKwin holds the shrinking
        // window back for 220ms, and the slide has to finish first.
        const slide = effect.readConfig("SlideDuration", 180) || 180;
        this.slideDuration = animationTime(slide) > 0 ? slide : 0;
        this.openClose = effect.readConfig("OpenCloseEffect", 0);
        this.applyOpenCloseEffect(this.openClose);
        const choice = effect.readConfig("Curve", 0);
        const index = EASES[choice] !== undefined ? choice : 0;
        this.curve = QEasingCurve[CURVES[index]];
        this.ease = EASES[index];
    }

    // 0 leaves Plasma's Desktop Effects settings alone; anything else picks
    // one of its built-in window open/close animations (or none at all).
    applyOpenCloseEffect(choice) {
        if (!choice) return;
        const wanted = OPEN_CLOSE_EFFECTS[choice - 1];
        for (const name of OPEN_CLOSE_EFFECTS) {
            if (name !== wanted && effects.isEffectLoaded(name)) effects.unloadEffect(name);
        }
        if (wanted && !effects.isEffectLoaded(wanted)) effects.loadEffect(wanted);
    }

    manage(window) {
        if (window.dock) this.notePanel();
        window.windowFrameGeometryChanged.connect(this.onFrameGeometryChanged.bind(this));
        // Plasma's Maximize effect animates maximizing (see maximizeRole);
        // fullscreen is left to KWin, ours would run on top of it.
        window.windowMaximizedStateAboutToChange.connect(() => this.maximizeAboutToChange(window));
        window.windowMaximizedStateChanged.connect(() => this.maximizeChanged(window));
        window.windowFullScreenChanged.connect(() => this.suspend(window));
        window.windowStartUserMovedResized.connect(() => {
            if (window.resize) this.userResizing = window;
        });
        window.windowFinishUserMovedResized.connect(() => {
            if (this.userResizing === window) {
                this.userResizing = null;
                this.userResizeEnded = Date.now();
            }
        });
    }

    notePanel() {
        // The work area follows a panel up to a couple of hundred ms later,
        // and HyprKwin re-tiles straight after it.
        this.panelUntil = Date.now() + 1200;
    }

    suspend(window) {
        window.hkSuspendUntil = Date.now() + 500;
    }

    // The whole desktop; a window outside it is parked out of the way by a
    // scrolling layout and has nothing to animate.
    onScreen(geometry) {
        const screen = effects.virtualScreenGeometry;
        if (!screen) return true;
        return geometry.x < screen.x + screen.width && screen.x < geometry.x + geometry.width &&
            geometry.y < screen.y + screen.height && screen.y < geometry.y + geometry.height;
    }

    // ---- maximizing ----------------------------------------------------
    //
    // Plasma's Maximize effect animates maximizing and restoring while it is
    // on, so those are left to it. But it does not follow a move made while
    // it runs, and it gives up if the size changes again (comparing exactly,
    // so the rounding KWin sends under fractional scaling counts). This fills
    // in those cases, and animates everything itself when that effect is off.

    maximizeAboutToChange(window) {
        if (!window.visible || !effects.isEffectLoaded("maximize")) return;
        window.hkMaximize = { from: plainRect(window.geometry), started: false, until: Date.now() + 1000 };
    }

    maximizeChanged(window) {
        const m = window.hkMaximize;
        if (!m) return;
        m.started = true;
        m.until = Date.now() + animationTime(250);       // its duration
    }

    // "skip" if the Maximize effect has this change (or it was taken over),
    // "no fade" for a change animated here that cuts its fade short.
    maximizeRole(window, changedFrom) {
        const m = window.hkMaximize;
        if (!m) return "";
        if (Date.now() > m.until) {
            delete window.hkMaximize;
            return "";
        }
        const g = window.geometry;
        if (sameSize(g, changedFrom)) return m.resized ? "no fade" : "skip";   // a move: not followed
        if (sameSize(m.from, changedFrom)) {
            m.resized = true;                                                // the maximize itself
            return "skip";
        }
        if (!m.started) return "skip";
        delete window.hkMaximize;                                            // it gave up
        if (!sameRect(changedFrom, g)) return "no fade";
        // Only rounding: carry on from where the maximize started.
        this.run(window, this.duration, this.moveAndResize(m.from, g), m.from, g, this.ease);
        return "skip";
    }

    shouldAnimate(window) {
        if (!window.visible || window.minimized || window.deleted) return false;
        // The user is dragging it: it is already following the pointer.
        if (window.move || window.resize) return false;
        if (window.hkSuspendUntil && Date.now() < window.hkSuspendUntil) return false;
        if (window.caption === OVERLAY_TITLE) return this.animateOverlays;
        if (window.popupWindow || window.desktopWindow || window.dock) return false;
        return window.normalWindow || window.dialog || window.utility;
    }

    // Nudging a split only changes a window's size a little while its far
    // edges stay put. Stretching and cross-fading the contents for that
    // reads as the window being redrawn, so these snap, like the client does.
    isSplitNudge(o, n) {
        const edgeKeptX = near(o.x, n.x) || near(o.x + o.width, n.x + n.width);
        const edgeKeptY = near(o.y, n.y) || near(o.y + o.height, n.y + n.height);
        const dw = Math.abs(n.width - o.width) / Math.max(1, o.width);
        const dh = Math.abs(n.height - o.height) / Math.max(1, o.height);
        return edgeKeptX && edgeKeptY && dw < 0.4 && dh < 0.4;
    }

    // Whether this window may cross-fade: at most a couple per batch of
    // windows animating together.
    allowCrossFade() {
        if (!this.crossFade) return false;
        const now = Date.now();
        if (now - this.fadeBatchStarted > 100) {
            this.fadeBatchStarted = now;
            this.fadesInBatch = 0;
        }
        this.fadesInBatch++;
        return this.fadesInBatch <= this.maxCrossFades;
    }

    snap(window) {
        if (window.hkAnimation) {
            cancel(window.hkAnimation);
            delete window.hkAnimation;
        }
    }

    // One animation per window; `from` and `to` are where it is drawn, which
    // is what lets visualRect() carry on from there if it is interrupted.
    run(window, duration, animations, from, to, ease) {
        this.snap(window);
        window.hkAnimation = animate({ window: window, duration: duration, animations: animations });
        window.hkVisual = { from: plainRect(from), to: plainRect(to), start: Date.now(), end: Date.now() + duration, ease: ease };
    }

    // Where the window is drawn part way through its animation, if it is.
    visualRect(window) {
        const v = window.hkVisual;
        if (!window.hkAnimation || !v || Date.now() >= v.end) return null;
        const p = v.ease(Math.min(1, (Date.now() - v.start) / Math.max(1, v.end - v.start)));
        const mix = (k) => v.from[k] + (v.to[k] - v.from[k]) * p;
        return { x: mix("x"), y: mix("y"), width: mix("width"), height: mix("height") };
    }

    // ---- divider slides ------------------------------------------------
    //
    // When HyprKwin slides a divider from the keyboard, the window that grows
    // already has its final size, and the one that shrinks keeps its old size
    // until the divider has passed. Clipping both as the edge travels makes
    // the divider slide without ever scaling anyone's contents.

    // The one edge that moved outwards, if that is all that changed.
    grownEdge(o, n) {
        if (near(o.y, n.y) && near(o.height, n.height)) {
            if (near(o.x, n.x) && n.width > o.width) return { axis: "x", end: true, from: o.x + o.width, to: n.x + n.width };
            if (near(o.x + o.width, n.x + n.width) && n.x < o.x) return { axis: "x", end: false, from: o.x, to: n.x };
        }
        if (near(o.x, n.x) && near(o.width, n.width)) {
            if (near(o.y, n.y) && n.height > o.height) return { axis: "y", end: true, from: o.y + o.height, to: n.y + n.height };
            if (near(o.y + o.height, n.y + n.height) && n.y < o.y) return { axis: "y", end: false, from: o.y, to: n.y };
        }
        return null;
    }

    // Clip `window` so the edge on `side` of it ("end" = right/bottom) runs
    // from one coordinate to another. KWin clips to a share of the window's
    // expanded geometry (shadows included), anchored at the opposite edge.
    clipAnimation(window, axis, movingEnd, fromEdge, toEdge) {
        const ex = window.expandedGeometry;
        const start = axis === "x" ? ex.x : ex.y;
        const size = Math.max(1, axis === "x" ? ex.width : ex.height);
        const share = (edge) => Math.max(0, Math.min(1, movingEnd ? (edge - start) / size : (start + size - edge) / size));
        const anchor = axis === "x" ? (movingEnd ? Effect.Left : Effect.Right) : (movingEnd ? Effect.Top : Effect.Bottom);
        const pair = (v) => axis === "x" ? { value1: v, value2: 1.0 } : { value1: 1.0, value2: v };
        return {
            type: Effect.Clip,
            from: pair(share(fromEdge)),
            to: pair(share(toEdge)),
            sourceAnchor: anchor,
            targetAnchor: anchor,
            curve: QEasingCurve.OutCubic,
        };
    }

    uncover(window) {
        if (window.hkCover) {
            cancel(window.hkCover);
            delete window.hkCover;
        }
        if (window.hkCoverWatch) {
            cancel(window.hkCoverWatch);
            delete window.hkCoverWatch;
        }
    }

    // Windows across the moving edge that are still at their old size: the
    // ones HyprKwin is holding back until the divider has slid over them.
    heldNeighbours(window, n, edge) {
        // A window that has already moved sits beyond the new edge, so the
        // band stops short of it.
        const reach = 60;
        return effects.stackingOrder.filter((w) => {
            if (w === window || w.deleted || w.minimized || !w.visible || !w.normalWindow) return false;
            if (w.caption === OVERLAY_TITLE) return false;
            const g = w.geometry;
            if (edge.axis === "x") {
                if (g.y >= n.y + n.height || n.y >= g.y + g.height) return false;
                return edge.end ? (g.x >= edge.from && g.x <= edge.from + reach && g.x < edge.to)
                                : (g.x + g.width <= edge.from && g.x + g.width >= edge.from - reach && g.x + g.width > edge.to);
            }
            if (g.x >= n.x + n.width || n.x >= g.x + g.width) return false;
            return edge.end ? (g.y >= edge.from && g.y <= edge.from + reach && g.y < edge.to)
                            : (g.y + g.height <= edge.from && g.y + g.height >= edge.from - reach && g.y + g.height > edge.to);
        });
    }

    slide(window, oldGeometry, edge) {
        const n = window.geometry;
        const shift = edge.to - edge.from;
        this.run(window, this.slideDuration, [this.clipAnimation(window, edge.axis, edge.end, edge.from, edge.to)],
                 oldGeometry, n, EASES[0]);
        for (const other of this.heldNeighbours(window, n, edge)) {
            const g = other.geometry;
            // Its facing edge travels with the divider, keeping the gap.
            const facing = edge.axis === "x" ? (edge.end ? g.x : g.x + g.width) : (edge.end ? g.y : g.y + g.height);
            this.uncover(other);
            this.snap(other);
            other.hkCover = set({
                window: other,
                duration: this.slideDuration,
                animations: [this.clipAnimation(other, edge.axis, !edge.end, facing, facing + shift)],
            });
            // Never leave it clipped if it is not resized after all.
            other.hkCoverWatch = animate({
                window: other,
                duration: this.slideDuration + 800,
                animations: [{ type: Effect.Opacity, from: 1.0, to: 1.0 }],
            });
        }
        // Borders move along with the divider.
        this.lastWindowAnimation = Date.now();
        this.slideUntil = Date.now() + this.slideDuration;
    }

    // A short glide for the re-tile that follows a panel change: the windows
    // move and resize together, quickly, with no cross-fade (at a few dozen
    // pixels the stretch is not visible, and each fade costs an offscreen
    // buffer), the time scaled to the distance.
    glide(window, from, to) {
        const dist = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y),
                              Math.abs(to.width - from.width), Math.abs(to.height - from.height));
        const duration = Math.max(60, Math.min(Math.round(3 * dist), this.duration));
        this.lastWindowAnimation = Date.now();
        this.glideUntil = Date.now() + duration;
        this.glideDuration = duration;
        this.run(window, duration, this.moveAndResize(from, to), from, to, this.ease);
    }

    moveAndResize(from, to, curve = this.curve) {
        // Translation is measured between the centres, the way KWin's own
        // maximize effect does it, so it composes with the size animation.
        const animations = [{
            type: Effect.Translation,
            from: {
                value1: from.x - to.x - (to.width / 2 - from.width / 2),
                value2: from.y - to.y - (to.height / 2 - from.height / 2),
            },
            to: { value1: 0, value2: 0 },
            curve: curve,
        }];
        if (!sameSize(from, to)) {
            animations.push({
                type: Effect.Size,
                from: { value1: from.width, value2: from.height },
                to: { value1: to.width, value2: to.height },
                curve: curve,
            });
        }
        return animations;
    }

    onFrameGeometryChanged(window, changedFrom) {
        // A panel moving: the work area is about to change.
        if (window.dock) {
            this.notePanel();
            return;
        }
        // A held window has now been resized: the cover has done its job.
        if (window.hkCover) this.uncover(window);
        if (this.duration <= 0 || !this.shouldAnimate(window)) return;
        const maximize = this.maximizeRole(window, changedFrom);
        const newGeometry = window.geometry;
        // Sub-pixel rounding a moment after a re-tile: leave the animation be.
        if (maximize === "skip" || sameRect(changedFrom, newGeometry)) return;
        // One re-tile can reach us in two parts a moment apart: a move at the
        // old size (KWin keeping the window inside a work area that just
        // shrank, say), then the real move and resize. Taken apart, the
        // window jumps to the in-between place and animates from there; taken
        // together, it goes straight from where it was.
        const now = Date.now();
        const last = window.hkLast;
        let oldGeometry = changedFrom;
        if (last && now - last.t < 150 && sameRect(last.to, changedFrom) &&
            last.from.width === last.to.width && last.from.height === last.to.height) {
            oldGeometry = last.from;
        }
        window.hkLast = { from: plainRect(oldGeometry), to: plainRect(newGeometry), t: now };
        // Re-tiled mid-animation: carry on from where it is drawn, not from
        // where the earlier animation was going. Whatever happens next, that
        // animation is over.
        const visual = this.visualRect(window);
        const from = visual || oldGeometry;
        this.snap(window);
        if (this.userResizing || Date.now() - this.userResizeEnded < 150) return;
        if (!this.onScreen(from) || !this.onScreen(newGeometry)) return;     // parked out of sight by a scrolling layout
        if (window.caption !== OVERLAY_TITLE) {
            if (now < this.panelUntil) {
                this.glide(window, from, newGeometry);
                return;
            }
            const edge = this.slideDuration > 0 ? this.grownEdge(oldGeometry, newGeometry) : null;
            // Interrupting an animation, a divider slide is still the way to
            // go where a window is held back for it to pass over: nothing
            // else keeps that one covered.
            if (edge && (!visual || this.heldNeighbours(window, newGeometry, edge).length > 0)) {
                this.slide(window, oldGeometry, edge);
                return;
            }
            if (!visual && this.isSplitNudge(oldGeometry, newGeometry)) return;
        }

        const moved = !near(from.x, newGeometry.x) || !near(from.y, newGeometry.y);
        const resized = !near(from.width, newGeometry.width) || !near(from.height, newGeometry.height);
        if ((!moved && !resized) || (!this.animateMove && !resized) || (!this.animateResize && !moved)) return;

        if (this.maxDistance > 0) {
            const dx = newGeometry.x - from.x, dy = newGeometry.y - from.y;
            if (Math.sqrt(dx * dx + dy * dy) > this.maxDistance) return;
        }

        if (window.caption === OVERLAY_TITLE) {
            if (Date.now() - this.lastWindowAnimation > this.overlayGrace) return;
        } else {
            this.lastWindowAnimation = Date.now();
        }

        const animations = this.moveAndResize(from, newGeometry);
        // Fade the old contents into the new ones, otherwise the window looks
        // stretched while it grows. Borders and tab bars are flat colour, so
        // they never need it. Not when interrupting an animation either: KWin
        // has no earlier picture to fade from for the first frame, and the
        // window would vanish for it.
        if (resized && window.caption !== OVERLAY_TITLE && !visual && maximize !== "no fade" && this.allowCrossFade()) {
            animations.push({
                type: Effect.CrossFadePrevious,
                from: 0.0,
                to: 1.0,
                curve: this.curve,
            });
        }

        const sliding = window.caption === OVERLAY_TITLE && Date.now() < this.slideUntil;
        if (sliding) {
            for (const a of animations) a.curve = QEasingCurve.OutCubic;
        }
        // A border keeps pace with its window's glide, too.
        const gliding = window.caption === OVERLAY_TITLE && Date.now() < this.glideUntil;
        this.run(window, sliding ? this.slideDuration : gliding ? this.glideDuration : this.duration,
                 animations, from, newGeometry, sliding ? EASES[0] : this.ease);
    }
}

new HyprKwinAnimations();
