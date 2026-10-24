/**
 * BacksterDEV desktop identity — single source of truth for packaging and runtime.
 *
 * Preserve-listed for upstream T3 Code sync (`docs/internals/upstream-sync.md`).
 * After a sync, re-wire `scripts/build-desktop-artifact.ts` to import from here if
 * upstream overwrote the appId / productName / artifactName constants again.
 */

export const BACKSTERDEV_DESKTOP_APP_ID = "com.backsterdev.app";
export const BACKSTERDEV_DESKTOP_APP_ID_DEV = "com.backsterdev.app.dev";

export const BACKSTERDEV_DESKTOP_PRODUCT_NAME = "BacksterDEV";
export const BACKSTERDEV_DESKTOP_NIGHTLY_PRODUCT_NAME = "BacksterDEV (Nightly)";

/** electron-builder artifactName template (literals `${version}` / `${arch}` / `${ext}`). */
export const BACKSTERDEV_DESKTOP_ARTIFACT_NAME = "BacksterDEV-${version}-${arch}.${ext}";

export const BACKSTERDEV_DESKTOP_PROTOCOL_NAME = "BacksterDEV";

export const BACKSTERDEV_LINUX_EXECUTABLE_NAME = "backsterdev";
export const BACKSTERDEV_LINUX_STARTUP_WM_CLASS = "backsterdev";
export const BACKSTERDEV_LINUX_STARTUP_WM_CLASS_DEV = "backsterdev-dev";

/** Electron `userData` directory under Application Support / AppData. */
export const BACKSTERDEV_USER_DATA_DIR = {
  development: { current: "backsterdev-dev", legacy: "BacksterDEV (Dev)" },
  production: { current: "backsterdev", legacy: "BacksterDEV" },
} as const;

export function resolveBacksterdevDesktopProductName(input: {
  readonly isNightly: boolean;
  readonly packageProductName?: string | undefined;
}): string {
  if (input.isNightly) {
    return BACKSTERDEV_DESKTOP_NIGHTLY_PRODUCT_NAME;
  }
  return input.packageProductName ?? BACKSTERDEV_DESKTOP_PRODUCT_NAME;
}

/** macOS Info.plist usage strings and similar permission copy. */
export function backsterdevUsageDescription(action: string): string {
  return `${BACKSTERDEV_DESKTOP_PRODUCT_NAME} ${action}`;
}
