import { KEYBOARD_NAV_ITEM_ATTR } from "../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR } from "../list-nav/list-keyboard-nav-zone.js";
export const CONTENT_PREVIEW_LINKS_SELECTOR = "[data-content-preview-links]";
export function contentPreviewLinkItemId(index) {
    return `preview-link-${index}`;
}
export function queryContentPreviewLinks(container) {
    return Array.from(container.querySelectorAll("a[href]")).filter((link) => link.closest(CONTENT_PREVIEW_LINKS_SELECTOR) === container);
}
export function syncContentPreviewLinkMarkers(container) {
    const links = queryContentPreviewLinks(container);
    links.forEach((link, index) => {
        link.setAttribute(KEYBOARD_NAV_ITEM_ATTR, contentPreviewLinkItemId(index));
    });
    return links.map((_, index) => contentPreviewLinkItemId(index));
}
export function syncContentPreviewLinkHighlights(container, highlightedId) {
    const links = queryContentPreviewLinks(container);
    links.forEach((link, index) => {
        const itemId = contentPreviewLinkItemId(index);
        const isHighlighted = highlightedId === itemId;
        link.classList.toggle("keyboard-nav-item-highlight", isHighlighted);
    });
}
export function activateContentPreviewLink(container, itemId) {
    const link = container.querySelector(`[${KEYBOARD_NAV_ITEM_ATTR}="${CSS.escape(itemId)}"]`);
    link?.click();
}
export function isContentKeyboardNavZoneActive() {
    return (document.body.getAttribute(LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR) === "content");
}
