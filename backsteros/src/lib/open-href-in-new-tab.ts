export const OPEN_HREF_IN_NEW_TAB_EVENT = "backsteros:open-href-in-new-tab";

/** Open an internal app href in a new product tab (same path as Cmd/Ctrl-click). */
export function requestOpenHrefInNewTab(href: string): void {
  const trimmed = href.trim();
  if (!trimmed || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_HREF_IN_NEW_TAB_EVENT, { detail: trimmed }),
  );
}
