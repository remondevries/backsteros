export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
}

export function isWebRuntime(): boolean {
  return !isTauriRuntime();
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Tauri shell on iOS (no Node sidecar). */
export function isMobileRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (!isTauriRuntime()) return false;
  if (window.circleNative?.getPlatform?.() === "ios") return true;
  return isIosDevice();
}

/** Tauri desktop shell with embedded Node sidecar. */
export function isDesktopTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return isTauriRuntime() && !isMobileRuntime();
}

export function isNativeShellRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.circleNative?.showNotification);
}
