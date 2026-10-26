/** Dismiss the pre-React boot splash in `index.html` (idempotent). */
export function dismissBootSplash() {
  document.getElementById("boot-splash")?.remove();
}

export function isBootSplashPresent(): boolean {
  return Boolean(document.getElementById("boot-splash"));
}

/**
 * Keep the branded splash mounted and show Access denied under the logo/title.
 * Idempotent. Does not remove the splash.
 */
export function presentBootSplashAccessDenied() {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;

  splash.classList.add("boot-splash--access-denied");
  splash.setAttribute("role", "alert");
  splash.setAttribute("aria-live", "assertive");
  splash.setAttribute("aria-label", "Access denied");

  let status = splash.querySelector<HTMLElement>(".boot-splash__status");
  if (!status) {
    status = document.createElement("p");
    status.className = "boot-splash__status";
    splash.querySelector(".boot-splash__panel")?.appendChild(status);
  }
  status.textContent = "Access denied";
}

/** How long the HTML splash may linger before we force recovery UI. */
export const BOOT_SPLASH_WATCHDOG_MS = 10_000;

/**
 * If the pre-React splash is still mounted after `timeoutMs`, dismiss it and
 * invoke `onStuck` once. Returns a cancel function.
 */
export function startBootSplashWatchdog(
  onStuck: () => void,
  timeoutMs = BOOT_SPLASH_WATCHDOG_MS,
): () => void {
  if (!isBootSplashPresent()) {
    return () => {};
  }
  const timeoutId = window.setTimeout(() => {
    if (!isBootSplashPresent()) return;
    dismissBootSplash();
    onStuck();
  }, timeoutMs);
  return () => window.clearTimeout(timeoutId);
}
