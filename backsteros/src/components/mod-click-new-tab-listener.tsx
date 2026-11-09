import { useEffect } from "react";

import {
  isModClickOpenNewTab,
  resolveModClickAnchorHref,
} from "../lib/mod-click-new-tab";
import { OPEN_HREF_IN_NEW_TAB_EVENT } from "../lib/open-href-in-new-tab";

/** Cmd/Ctrl+click on internal anchors opens the href in a new product tab. */
export function ModClickNewTabListener({
  onOpenHrefInNewTab,
}: {
  onOpenHrefInNewTab: (href: string) => void;
}) {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!isModClickOpenNewTab(event)) return;
      const href = resolveModClickAnchorHref(event.target);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onOpenHrefInNewTab(href);
    }

    function handleOpenRequest(event: Event) {
      const href =
        event instanceof CustomEvent && typeof event.detail === "string"
          ? event.detail.trim()
          : "";
      if (!href) return;
      onOpenHrefInNewTab(href);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener(OPEN_HREF_IN_NEW_TAB_EVENT, handleOpenRequest);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener(OPEN_HREF_IN_NEW_TAB_EVENT, handleOpenRequest);
    };
  }, [onOpenHrefInNewTab]);

  return null;
}
