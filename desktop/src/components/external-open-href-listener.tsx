import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { startExternalOpenHrefWatcher } from "../lib/external-open-href";
import { isTauriRuntime } from "../lib/whoop";

const OPEN_HREF_EVENT = "external-open-href";
const OPEN_HREF_DOM_EVENT = "backsteros:external-open-href";

function isAppHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

/** Main window: navigate when Dynamic Island (or another tool) requests an href. */
export function ExternalOpenHrefListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const openHref = (href: string) => {
      const next = href.trim();
      if (!isAppHref(next)) return;
      navigate(next);
      void (async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().setFocus();
        } catch {
          // Focus is best-effort.
        }
      })();
    };

    // Native Rust watcher calls this when present (avoids missing React mount races).
    (window as Window & { __BACKSTEROS_NAVIGATE__?: (href: string) => void }).__BACKSTEROS_NAVIGATE__ =
      openHref;

    const onDomEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ href?: string }>).detail;
      const href = detail?.href?.trim();
      if (href) openHref(href);
    };
    window.addEventListener(OPEN_HREF_DOM_EVENT, onDomEvent);

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) return;
        unlisten = await listen<string>(OPEN_HREF_EVENT, (event) => {
          openHref(event.payload ?? "");
        });
      } catch {
        // Ignore when the desktop shell is unavailable.
      }
    })();

    // File poll fallback (covers older builds / missed native emits).
    const stopWatch = startExternalOpenHrefWatcher(openHref);

    return () => {
      cancelled = true;
      window.removeEventListener(OPEN_HREF_DOM_EVENT, onDomEvent);
      const w = window as Window & { __BACKSTEROS_NAVIGATE__?: (href: string) => void };
      if (w.__BACKSTEROS_NAVIGATE__ === openHref) {
        delete w.__BACKSTEROS_NAVIGATE__;
      }
      unlisten?.();
      stopWatch();
    };
  }, [navigate]);

  return null;
}
