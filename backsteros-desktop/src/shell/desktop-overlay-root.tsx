import { useEffect, type ReactNode } from "react";

import { hideDesktopOverlayWindow } from "../lib/desktop-overlay";
import { isTauriRuntime } from "../lib/whoop";

type DesktopOverlayRootProps = {
  children: ReactNode;
  variant?: "compose" | "palette";
};

/**
 * Transparent overlay chrome. Blur (click outside / leave panel) hides the
 * native window — same behaviour as Circle's Spotlight-style panel.
 */
export function DesktopOverlayRoot({
  children,
  variant = "compose",
}: DesktopOverlayRootProps) {
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const handleBlur = () => {
      void hideDesktopOverlayWindow();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void hideDesktopOverlayWindow();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <div className={`desktop-overlay-root desktop-overlay-root--${variant}`}>
      {children}
    </div>
  );
}
