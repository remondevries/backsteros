/**
 * Hide command-palette overlay/dialog immediately (before React commits).
 * Used when navigating so a warm keep-alive flip cannot paint under the
 * palette for a frame while `setOpen(false)` is still pending.
 *
 * Prefer a document attribute over inline `display:none` on portal nodes:
 * cmdk/Radix may reuse those nodes on the next open, and leftover inline
 * styles made ⌘K look like a no-op (open=true but chrome stayed hidden).
 */
const CONCEALED_ATTR = "data-command-palette-concealed";
export function concealCommandPaletteChrome() {
    if (typeof document === "undefined")
        return;
    document.documentElement.setAttribute(CONCEALED_ATTR, "");
    dismissInstantCommandOverlay();
}
/** Undo {@link concealCommandPaletteChrome} so the next open can paint. */
export function revealCommandPaletteChrome() {
    if (typeof document === "undefined")
        return;
    document.documentElement.removeAttribute(CONCEALED_ATTR);
    // Clear legacy inline styles from earlier conceal implementations.
    for (const node of document.querySelectorAll(".command-overlay, .command-dialog")) {
        if (node instanceof HTMLElement) {
            node.style.removeProperty("display");
        }
    }
}
const INSTANT_OVERLAY_ID = "backsteros-command-overlay-instant";
/**
 * Paint the dimmed backdrop synchronously on open so G feels instant while
 * Radix/cmdk mounts the real dialog on the following frame(s).
 */
export function showInstantCommandOverlay() {
    if (typeof document === "undefined")
        return;
    revealCommandPaletteChrome();
    let el = document.getElementById(INSTANT_OVERLAY_ID);
    if (!el) {
        el = document.createElement("div");
        el.id = INSTANT_OVERLAY_ID;
        el.className = "command-overlay";
        el.setAttribute("data-instant-command-overlay", "true");
        document.body.appendChild(el);
    }
    el.style.removeProperty("display");
}
export function dismissInstantCommandOverlay() {
    if (typeof document === "undefined")
        return;
    const el = document.getElementById(INSTANT_OVERLAY_ID);
    if (el) {
        el.style.setProperty("display", "none");
    }
}
