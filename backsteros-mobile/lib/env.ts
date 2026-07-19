import Constants from "expo-constants";

/**
 * Expo inlines `EXPO_PUBLIC_*` at bundle time. Prefer that; fall back to
 * `app.json` → `extra` when present.
 */
export function getMobileEnvironment() {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  // Metro replaces these at build time when set in the environment / .env
  const apiFromPublic = (globalThis as { process?: { env?: Record<string, string> } })
    .process?.env?.EXPO_PUBLIC_API_URL;
  const clerkFromPublic = (
    globalThis as { process?: { env?: Record<string, string> } }
  ).process?.env?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const apiUrl = (apiFromPublic || extra.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8787").replace(
    /\/+$/,
    "",
  );

  return {
    apiUrl,
    clerkPublishableKey:
      clerkFromPublic || extra.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || "",
  };
}
