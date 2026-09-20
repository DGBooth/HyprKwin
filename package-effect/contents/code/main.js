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

class HyprKwinAnimations {
    constructor() {
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
        const curves = [QEasingCurve.OutCubic, QEasingCurve.OutQuad, QEasingCurve.OutExpo,
                        QEasingCurve.OutBack, QEasingCurve.Linear];
        const index = effect.readConfig("Curve", 0);
        this.curve = curves[index] !== undefined ? curves[index] : QEasingCurve.OutCubic;
    }

    manage(window) {
        window.windowFrameGeometryChanged.connect(this.onFrameGeometryChanged.bind(this));
        // Maximize and fullscreen are animated by KWin's own effects; ours
        // would run on top of them.
        window.windowMaximizedStateAboutToChange.connect(() => this.suspend(window));
        window.windowFullScreenChanged.connect(() => this.suspend(window));
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

    onFrameGeometryChanged(window, oldGeometry) {
        if (!this.shouldAnimate(window)) return;

        const newGeometry = window.geometry;
        const moved = oldGeometry.x !== newGeometry.x || oldGeometry.y !== newGeometry.y;
        const resized = oldGeometry.width !== newGeometry.width || oldGeometry.height !== newGeometry.height;
        if ((!moved && !resized) || (!this.animateMove && !resized) || (!this.animateResize && !moved)) return;

        if (this.maxDistance > 0) {
            const dx = newGeometry.x - oldGeometry.x, dy = newGeometry.y - oldGeometry.y;
            if (Math.sqrt(dx * dx + dy * dy) > this.maxDistance) return;
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

        window.hkAnimation = animate({
            window: window,
            duration: this.duration,
            animations: animations,
        });
    }
}

new HyprKwinAnimations();
