import { existsSync } from "node:fs";

import { getTotemEnvPath, loadTotemEnvIntoProcess } from "@/lib/whoop/env-file";

export { getTotemEnvPath } from "@/lib/whoop/env-file";

const WHOOP_TOKEN_KEYS = [
  "WHOOP_EMAIL",
  "WHOOP_IOS_BEARER_TOKEN",
  "WHOOP_COGNITO_REFRESH_TOKEN",
  "WHOOP_USER_ID",
  "WHOOP_INSTALLATION_ID",
] as const;

let envLoaded = false;

export function ensureWhoopEnvLoaded(): void {
  if (envLoaded) {
    return;
  }
  loadTotemEnvIntoProcess();
  envLoaded = true;
}

export function getWhoopEnv(): Record<string, string> {
  ensureWhoopEnvLoaded();
  const env: Record<string, string> = {};
  for (const key of WHOOP_TOKEN_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      env[key] = value;
    }
  }
  return env;
}

export function isWhoopAuthenticated(): boolean {
  ensureWhoopEnvLoaded();
  const env = getWhoopEnv();
  return Boolean(env.WHOOP_COGNITO_REFRESH_TOKEN || env.WHOOP_IOS_BEARER_TOKEN);
}

export function isWhoopConfigured(): boolean {
  return isWhoopAuthenticated() || existsSync(getTotemEnvPath());
}

export function getWhoopTimezone(): string {
  ensureWhoopEnvLoaded();
  return process.env.WHOOP_TIMEZONE?.trim() || "Europe/Amsterdam";
}
