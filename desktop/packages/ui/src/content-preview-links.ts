import { KEYBOARD_NAV_ITEM_ATTR } from "./keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR } from "./list-keyboard-nav-zone.js";

export const CONTENT_PREVIEW_LINKS_SELECTOR = "[data-content-preview-links]";

export function contentPreviewLinkItemId(index: number): string {
  return `preview-link-${index}`;
}

export function queryContentPreviewLinks(
  container: HTMLElement,
): HTMLAnchorElement[] {
  return Array.from(
    container.querySelectorAll<HTMLAnchorElement>("a[href]"),
  ).filter((link) => link.closest(CONTENT_PREVIEW_LINKS_SELECTOR) === container);
}

export function syncContentPreviewLinkMarkers(
  container: HTMLElement,
): string[] {
  const links = queryContentPreviewLinks(container);
  links.forEach((link, index) => {
    link.setAttribute(KEYBOARD_NAV_ITEM_ATTR, contentPreviewLinkItemId(index));
  });
  return links.map((_, index) => contentPreviewLinkItemId(index));
}

export function syncContentPreviewLinkHighlights(
  container: HTMLElement,
  highlightedId: string | null,
): void {
  const links = queryContentPreviewLinks(container);
  links.forEach((link, index) => {
    const itemId = contentPreviewLinkItemId(index);
    const isHighlighted = highlightedId === itemId;
    link.classList.toggle("keyboard-nav-item-highlight", isHighlighted);
  });
}

export function activateContentPreviewLink(
  container: HTMLElement,
  itemId: string,
): void {
  const link = container.querySelector<HTMLAnchorElement>(
    `[${KEYBOARD_NAV_ITEM_ATTR}="${CSS.escape(itemId)}"]`,
  );
  link?.click();
}

export function isContentKeyboardNavZoneActive(): boolean {
  return (
    document.body.getAttribute(LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR) === "content"
  );
}
