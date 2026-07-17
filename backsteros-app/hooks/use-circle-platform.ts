"use client";

/**
 * Minimal stub of Circle's platform hook for Phase 1 UI port.
 * BacksterOS web shell is not mobile-shell; expand when native shells land.
 */
export function useIsMobileUi(): boolean {
  return false;
}

export function useIsDesktopUi(): boolean {
  return false;
}

export function useCirclePlatform(): "web" | "desktop" | "mobile" {
  return "web";
}
