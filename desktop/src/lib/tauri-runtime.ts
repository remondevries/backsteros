/**
 * Detect Tauri webview vs browser / Vite-only preview.
 * Keep this module free of `@tauri-apps/*` imports so it is safe to load anywhere.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (
    window as Window & {
      __TAURI_INTERNALS__?: { invoke?: unknown };
    }
  ).__TAURI_INTERNALS__;
  return internals != null && typeof internals.invoke === "function";
}
