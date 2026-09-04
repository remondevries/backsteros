"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
/**
 * Optional list-row avatar — uploaded image only, never a fallback icon.
 * Always renders as a square (equal width/height), clipped to circle or
 * rounded-square so non-square source images cannot spill out.
 */
export function EntityListAvatar({ src, size = 16, align = "center", className, shape = "circle", }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
        return null;
    }
    const radius = shape === "rounded-square" ? Math.max(3, Math.round(size * 0.22)) : 9999;
    const wrapperClass = [
        "entity-list-avatar",
        shape === "rounded-square"
            ? "entity-list-avatar--rounded-square"
            : "entity-list-avatar--circle",
        align === "top" ? "entity-list-avatar--top" : null,
        // Keep legacy class for dropdown/media selectors that target it.
        "app-side-panel-item-icon",
        align === "top" ? "app-side-panel-item-icon--top" : null,
        className,
    ]
        .filter(Boolean)
        .join(" ");
    return (_jsx("span", { className: wrapperClass, "aria-hidden": "true", style: {
            width: size,
            height: size,
            minWidth: size,
            minHeight: size,
            borderRadius: radius,
        }, children: _jsx("img", { src: src, alt: "", width: size, height: size, className: "entity-list-avatar__img", onError: () => setFailed(true) }) }));
}
