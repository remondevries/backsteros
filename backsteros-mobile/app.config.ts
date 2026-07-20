import type { ConfigContext, ExpoConfig } from "expo/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load local `.env` for Release / Xcode bundles (Metro `expo start` already does this). */
function loadDotEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "BacksterOS",
  slug: config.slug ?? "backsteros",
  extra: {
    ...(typeof config.extra === "object" && config.extra ? config.extra : {}),
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? "",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  },
});
