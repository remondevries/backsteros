import Constants from "expo-constants";

function readPublicEnv(key: string): string | undefined {
  const fromProcess = (
    globalThis as { process?: { env?: Record<string, string> } }
  ).process?.env?.[key];
  if (fromProcess?.trim()) return fromProcess.trim();
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const fromExtra = extra[key];
  return fromExtra?.trim() || undefined;
}

function normalizeApiUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

/**
 * Expo inlines `EXPO_PUBLIC_*` at bundle time. Prefer that; fall back to
 * `app.json` → `extra` when present.
 */
export function getMobileEnvironment() {
  const localApiUrl =
    normalizeApiUrl(readPublicEnv("EXPO_PUBLIC_API_URL")) ??
    "http://127.0.0.1:8788";
  const cloudApiUrl = normalizeApiUrl(
    readPublicEnv("EXPO_PUBLIC_CLOUD_API_URL"),
  );
  const localShellToken =
    readPublicEnv("EXPO_PUBLIC_LOCAL_SHELL_TOKEN") ?? "local";

  return {
    /** Preferred local-core URL (Tailscale / loopback). */
    localApiUrl,
    /** Always-on cloud-core fallback for REST when local is offline. */
    cloudApiUrl,
    /** @deprecated Use `localApiUrl` or `useMobileCoreApiUrl().activeApiUrl`. */
    apiUrl: localApiUrl,
    /** Must match core `LOCAL_SHELL_TOKEN` when set (default `local`). */
    localShellToken,
  };
}
