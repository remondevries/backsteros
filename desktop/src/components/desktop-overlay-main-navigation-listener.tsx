import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DESKTOP_OVERLAY_NAVIGATE_EVENT,
  type DesktopOverlayNavigatePayload,
} from "../lib/desktop-overlay";
import { isTauriRuntime } from "../lib/whoop";
import { navigateToHref } from "../router/navigate-href";

/** Main window: navigate when the compose overlay creates an entity. */
export function DesktopOverlayMainNavigationListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) {
          return;
        }

        unlisten = await listen<DesktopOverlayNavigatePayload>(
          DESKTOP_OVERLAY_NAVIGATE_EVENT,
          (event) => {
            const href = event.payload?.href?.trim();
            if (!href) {
              return;
            }
            navigateToHref(navigate, href);
          },
        );
      } catch {
        // Ignore when the desktop shell is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);

  return null;
}
