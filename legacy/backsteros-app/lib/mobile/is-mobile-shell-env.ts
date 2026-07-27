/**
 * Mobile shell detection for iOS static export and `dev:mobile`.
 *
 * Server / RSC: `CIRCLE_MOBILE_BUILD` and `CIRCLE_MOBILE_DEV` are set at build or dev start.
 * Client hooks: those vars are not reliably inlined — use `isMobileShellBuildActive()` which
 * also reads `NEXT_PUBLIC_CIRCLE_MOBILE_SHELL` and `html[data-circle-platform="mobile"]`.
 */

function isMobileShellFromEnv(): boolean {
  return (
    process.env.CIRCLE_DESKTOP !== "1" &&
    (process.env.CIRCLE_MOBILE_BUILD === "1" ||
      process.env.CIRCLE_MOBILE_DEV === "1" ||
      process.env.NEXT_PUBLIC_CIRCLE_MOBILE_SHELL === "1")
  );
}

/** Build-time flag (server components, route modules, root layout). */
export const isMobileShellBuild = isMobileShellFromEnv();

/** Same as {@link isMobileShellBuild}; use in server page modules. */
export function isMobileShellEnv(): boolean {
  return isMobileShellBuild;
}

/**
 * True when running inside the mobile shell — safe to call from client hooks during render.
 * Falls back to the SSR `data-circle-platform` attribute when env vars are missing in the bundle.
 */
export function isMobileShellBuildActive(): boolean {
  if (isMobileShellFromEnv()) {
    return true;
  }

  if (typeof document !== "undefined") {
    return document.documentElement.dataset.circlePlatform === "mobile";
  }

  return false;
}

/** True for the iOS static export bundle (no middleware trail rewrite at runtime). */
export function isMobileStaticExportActive(): boolean {
  return process.env.NEXT_PUBLIC_CIRCLE_MOBILE_STATIC === "1";
}
