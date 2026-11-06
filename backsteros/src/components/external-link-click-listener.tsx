import { useEffect } from "react";

import {
  openExternalUrl,
  resolveExternalAnchorHref,
} from "../lib/open-external-url";
import { isTauriRuntime } from "../lib/tauri-runtime";

/**
 * In the Tauri shell, external message / markdown / email links must open in
 * the system browser. Relying on `target=_blank` → `on_new_window` alone is
 * fragile (email HTML often omits `_blank`; WKWebView can no-op).
 */
export function ExternalLinkClickListener() {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.altKey) return;

      const href = resolveExternalAnchorHref(event);
      if (!href) return;

      event.preventDefault();
      event.stopPropagation();
      void openExternalUrl(href);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
