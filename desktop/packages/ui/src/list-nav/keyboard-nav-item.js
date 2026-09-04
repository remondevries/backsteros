import { resolveKeyboardNavScrollTarget, scrollElementIntoViewPastSticky, } from "./keyboard-nav-sticky-scroll.js";
export const KEYBOARD_NAV_ITEM_ATTR = "data-keyboard-nav-item";
export function keyboardNavItemProps(itemId) {
    return { [KEYBOARD_NAV_ITEM_ATTR]: itemId };
}
export function queryKeyboardNavItem(container, itemId) {
    return container.querySelector(`[${KEYBOARD_NAV_ITEM_ATTR}="${CSS.escape(itemId)}"]`);
}
/**
 * Bring a keyboard-nav row into view, accounting for sticky group headers that
 * cover the top of the scrollport (`scrollIntoView` alone treats those rows as
 * already visible).
 */
export function scrollKeyboardNavItemIntoView(container, itemId) {
    const marker = queryKeyboardNavItem(container, itemId);
    if (!marker) {
        return;
    }
    scrollElementIntoViewPastSticky(resolveKeyboardNavScrollTarget(marker));
}
function isFocusableKeyboardNavElement(element) {
    if (element.matches("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")) {
        return true;
    }
    const tabIndex = element.tabIndex;
    return tabIndex >= 0;
}
export function focusListKeyboardNavItem(container, itemId) {
    const marker = queryKeyboardNavItem(container, itemId);
    if (!marker) {
        return;
    }
    const focusable = isFocusableKeyboardNavElement(marker)
        ? marker
        : marker.querySelector('a[href], button:not([disabled]), [role="button"][tabindex="0"]');
    if (focusable) {
        focusable.focus({ preventScroll: true });
        return;
    }
    if (marker.getAttribute("tabindex") != null) {
        marker.focus({ preventScroll: true });
        return;
    }
    if (container.getAttribute("tabindex") != null) {
        container.focus({ preventScroll: true });
    }
}
export function keyboardNavItemClass(isHighlighted) {
    return isHighlighted ? "keyboard-nav-item-highlight" : "";
}
/** Main-content / entity list rows: hover bg only; j/k focus uses inset ring only. */
export function keyboardNavListItemClass(isHighlighted) {
    return ["keyboard-nav-list-item", keyboardNavItemClass(isHighlighted)]
        .filter(Boolean)
        .join(" ");
}
