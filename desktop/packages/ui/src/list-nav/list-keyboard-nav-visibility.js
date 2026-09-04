/**
 * Whether a list keyboard-nav container should receive j/k.
 *
 * Keep-alive panes stay absolutely stacked at full size, so client rects alone
 * are not enough — also reject inert / data-keep-alive-hidden ancestors and
 * use checkVisibility when available.
 */
export function isListKeyboardNavContainerVisible(container) {
    if (!container || !container.isConnected) {
        return false;
    }
    if (container.closest("[inert], [data-keep-alive-hidden]")) {
        return false;
    }
    if (typeof container.checkVisibility === "function") {
        try {
            if (!container.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
                contentVisibilityAuto: true,
            })) {
                return false;
            }
        }
        catch {
            // Older engines may throw on unsupported option bags.
        }
    }
    return container.getClientRects().length > 0;
}
