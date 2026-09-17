import { useEffect } from "react";

import {
  isModClickOpenNewTab,
  resolveModClickAnchorHref,
} from "../lib/mod-click-new-tab";

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

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [onOpenHrefInNewTab]);

  return null;
}
