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

// Plasma's own open/close animations. KWin marks them exclusive, so loading
// one retires the others; we unload explicitly too in case that changes.
const OPEN_CLOSE_EFFECTS = ["scale", "fade", "glide"];

class HyprKwinAnimations {
    constructor() {
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
        effect.animationEnded.connect((window, id) => {
            // The watchdog on a covered window ran out: never leave it clipped.
            if (window.hkCoverWatch === id) this.uncover(window);
        });
        effect.configChanged.connect(this.loadConfig.bind(this));
        effects.windowAdded.connect(this.manage.bind(this));
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
        // Fixed rather than following Duration: HyprKwin holds the shrinking
        // window back for 220ms, and the slide has to finish first.
        const slide = effect.readConfig("SlideDuration", 180) || 180;
        this.slideDuration = animationTime(slide) > 0 ? slide : 0;
        this.applyOpenCloseEffect(effect.readConfig("OpenCloseEffect", 0));
        const curves = [QEasingCurve.OutCubic, QEasingCurve.OutQuad, QEasingCurve.OutExpo,
                        QEasingCurve.OutBack, QEasingCurve.Linear];
        const index = effect.readConfig("Curve", 0);
        this.curve = curves[index] !== undefined ? curves[index] : QEasingCurve.OutCubic;
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
        window.windowFrameGeometryChanged.connect(this.onFrameGeometryChanged.bind(this));
        // Maximize and fullscreen are animated by KWin's own effects; ours
        // would run on top of them.
        window.windowMaximizedStateAboutToChange.connect(() => this.suspend(window));
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

    suspend(window) {
        window.hkSuspendUntil = Date.now() + 500;
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
        const edgeKeptX = o.x === n.x || o.x + o.width === n.x + n.width;
        const edgeKeptY = o.y === n.y || o.y + o.height === n.y + n.height;
        const dw = Math.abs(n.width - o.width) / Math.max(1, o.width);
        const dh = Math.abs(n.height - o.height) / Math.max(1, o.height);
        return edgeKeptX && edgeKeptY && dw < 0.4 && dh < 0.4;
    }

    snap(window) {
        if (window.hkAnimation) {
            cancel(window.hkAnimation);
            delete window.hkAnimation;
        }
    }

    // ---- divider slides ------------------------------------------------
    //
    // When HyprKwin slides a divider from the keyboard, the window that grows
    // already has its final size, and the one that shrinks keeps its old size
    // until the divider has passed. Clipping both as the edge travels makes
    // the divider slide without ever scaling anyone's contents.

    // The one edge that moved outwards, if that is all that changed.
    grownEdge(o, n) {
        if (o.y === n.y && o.height === n.height) {
            if (o.x === n.x && n.width > o.width) return { axis: "x", end: true, from: o.x + o.width, to: n.x + n.width };
            if (o.x + o.width === n.x + n.width && n.x < o.x) return { axis: "x", end: false, from: o.x, to: n.x };
        }
        if (o.x === n.x && o.width === n.width) {
            if (o.y === n.y && n.height > o.height) return { axis: "y", end: true, from: o.y + o.height, to: n.y + n.height };
            if (o.y + o.height === n.y + n.height && n.y < o.y) return { axis: "y", end: false, from: o.y, to: n.y };
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
        this.snap(window);
        window.hkAnimation = animate({
            window: window,
            duration: this.slideDuration,
            animations: [this.clipAnimation(window, edge.axis, edge.end, edge.from, edge.to)],
        });
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

    onFrameGeometryChanged(window, oldGeometry) {
        // A held window has now been resized: the cover has done its job.
        if (window.hkCover) this.uncover(window);
        if (!this.shouldAnimate(window)) return;
        const newGeometry = window.geometry;
        if (this.userResizing || Date.now() - this.userResizeEnded < 150) {
            this.snap(window);
            return;
        }
        if (window.caption !== OVERLAY_TITLE) {
            const edge = this.slideDuration > 0 ? this.grownEdge(oldGeometry, newGeometry) : null;
            if (edge) {
                this.slide(window, oldGeometry, edge);
                return;
            }
            if (this.isSplitNudge(oldGeometry, newGeometry)) {
                this.snap(window);
                return;
            }
        }

        const moved = oldGeometry.x !== newGeometry.x || oldGeometry.y !== newGeometry.y;
        const resized = oldGeometry.width !== newGeometry.width || oldGeometry.height !== newGeometry.height;
        if ((!moved && !resized) || (!this.animateMove && !resized) || (!this.animateResize && !moved)) return;

        if (this.maxDistance > 0) {
            const dx = newGeometry.x - oldGeometry.x, dy = newGeometry.y - oldGeometry.y;
            if (Math.sqrt(dx * dx + dy * dy) > this.maxDistance) return;
        }

        if (window.caption === OVERLAY_TITLE) {
            if (Date.now() - this.lastWindowAnimation > this.overlayGrace) return;
        } else {
            this.lastWindowAnimation = Date.now();
        }

        // Restart cleanly if the window is re-tiled mid-animation.
        if (window.hkAnimation) {
            cancel(window.hkAnimation);
            delete window.hkAnimation;
        }

        // Translation is measured between the centres, the way KWin's own
        // maximize effect does it, so it composes with the size animation.
        const animations = [{
            type: Effect.Translation,
            from: {
                value1: oldGeometry.x - newGeometry.x - (newGeometry.width / 2 - oldGeometry.width / 2),
                value2: oldGeometry.y - newGeometry.y - (newGeometry.height / 2 - oldGeometry.height / 2),
            },
            to: { value1: 0, value2: 0 },
            curve: this.curve,
        }];

        if (resized) {
            animations.push({
                type: Effect.Size,
                from: { value1: oldGeometry.width, value2: oldGeometry.height },
                to: { value1: newGeometry.width, value2: newGeometry.height },
                curve: this.curve,
            });
            // Fade the old contents into the new ones, otherwise the window
            // looks stretched while it grows.
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
        window.hkAnimation = animate({
            window: window,
            duration: sliding ? this.slideDuration : this.duration,
            animations: sliding ? animations.filter((a) => a.type !== Effect.CrossFadePrevious) : animations,
        });
    }
}

new HyprKwinAnimations();
