/** After G then F, wait this long for Space before navigating to Finance. */
export const GO_FINANCE_CHORD_TIMEOUT_MS = 500;
let armed = false;
let pendingHref = "/finance/dashboard";
let pendingTimer = null;
export function clearGoFinanceChord() {
    armed = false;
    if (pendingTimer != null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
    }
}
export function isGoFinanceChordPending() {
    return armed;
}
/**
 * G then F: keep the Go palette open briefly. Space → Finance context;
 * timeout → navigate to Finance.
 */
export function registerGoFinanceChord(href, onNavigateTimeout) {
    clearGoFinanceChord();
    pendingHref = href;
    armed = true;
    pendingTimer = setTimeout(() => {
        pendingTimer = null;
        if (!armed)
            return;
        armed = false;
        onNavigateTimeout();
    }, GO_FINANCE_CHORD_TIMEOUT_MS);
}
/** Space after G F: enter Finance go instead of navigating. */
export function consumeGoFinanceChordForContext() {
    if (!armed) {
        return false;
    }
    clearGoFinanceChord();
    return true;
}
export function peekGoFinanceChordHref() {
    return pendingHref;
}
