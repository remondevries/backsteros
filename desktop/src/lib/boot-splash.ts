/** Dismiss the pre-React boot splash in `index.html` (idempotent). */
export function dismissBootSplash() {
  document.getElementById("boot-splash")?.remove();
}

export function isBootSplashPresent(): boolean {
  return Boolean(document.getElementById("boot-splash"));
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
