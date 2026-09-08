import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import { navigateToHref } from "../router/navigate-href";

export const DESKTOP_OVERLAY_SHOW_EVENT = "backsteros:desktop-overlay-show";

type DesktopOverlayShowDetail = {
  path?: string;
  ctx?: string;
};

/**
 * Keeps the overlay SPA on the right route/ctx when Rust shows the panel,
 * without a full webview reload (which would remount React and flash loading).
 */
export function DesktopOverlayRouteSync() {
  const navigate = useNavigate();

  useEffect(() => {
    const onShow = (event: Event) => {
      const detail = (event as CustomEvent<DesktopOverlayShowDetail>).detail;
      const path = detail?.path?.trim();
      if (!path?.startsWith("/desktop-overlay")) {
        return;
      }
      const ctx = detail.ctx?.trim() || "/";
      const href = `${path}?ctx=${encodeURIComponent(ctx)}`;
      navigateToHref(navigate, href, { replace: true });
    };

    window.addEventListener(DESKTOP_OVERLAY_SHOW_EVENT, onShow);
    return () => window.removeEventListener(DESKTOP_OVERLAY_SHOW_EVENT, onShow);
  }, [navigate]);

  return null;
}
