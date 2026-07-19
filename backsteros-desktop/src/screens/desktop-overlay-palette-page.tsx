import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CommandPaletteProvider,
  CommandPaletteView,
  useCommandPalette,
} from "@backsteros/ui";

import { useCommandPaletteSearchFn } from "../lib/command-palette-search";
import {
  completeDesktopOverlayNavigation,
  DESKTOP_OVERLAY_TOGGLE_PALETTE_EVENT,
  hideDesktopOverlayWindow,
} from "../lib/desktop-overlay";
import { useDesktopOverlayAutoResize } from "../lib/use-desktop-overlay-auto-resize";
import { DesktopOverlayRoot } from "../shell/desktop-overlay-root";

function PaletteOverlayController() {
  const { open, openSearch, setOpen } = useCommandPalette();
  const searchFn = useCommandPaletteSearchFn();
  const [searchParams] = useSearchParams();

  useDesktopOverlayAutoResize(open, ".command-dialog");

  const pathname = useMemo(() => {
    const ctx = searchParams.get("ctx")?.trim();
    return ctx && ctx.length > 0 ? ctx : "/";
  }, [searchParams]);

  useEffect(() => {
    openSearch();
  }, [openSearch]);

  // Overlay webview is persistent; re-open search whenever the panel is shown.
  useEffect(() => {
    const reopen = () => {
      openSearch();
    };
    window.addEventListener("focus", reopen);
    return () => window.removeEventListener("focus", reopen);
  }, [openSearch]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (cancelled) {
          return;
        }

        unlisten = await listen(DESKTOP_OVERLAY_TOGGLE_PALETTE_EVENT, () => {
          if (open) {
            setOpen(false);
            return;
          }
          openSearch();
        });
      } catch {
        // Ignore when the desktop shell is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [open, openSearch, setOpen]);

  return (
    <CommandPaletteView
      navigate={(href) => {
        void completeDesktopOverlayNavigation(href);
      }}
      pathname={pathname}
      search={searchFn}
    />
  );
}

export function DesktopOverlayPalettePage() {
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      void hideDesktopOverlayWindow();
    }
  }, []);

  return (
    <DesktopOverlayRoot variant="palette">
      <CommandPaletteProvider onOpenChange={handleOpenChange}>
        <PaletteOverlayController />
      </CommandPaletteProvider>
    </DesktopOverlayRoot>
  );
}
