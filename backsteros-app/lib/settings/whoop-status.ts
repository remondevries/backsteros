import { existsSync } from "node:fs";

import {
  getTotemEnvPath,
  getWhoopEnv,
  isWhoopAuthenticated,
  isWhoopConfigured,
} from "@/lib/whoop/config";

export type WhoopSettingsStatus = {
  connected: boolean;
  configured: boolean;
  email: string | null;
  reason: string | null;
};

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) {
    return trimmed ? "••••" : "";
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${local.length > 2 ? "•••" : ""}${domain}`;
}

export function getWhoopSettingsStatus(): WhoopSettingsStatus {
  const envPath = getTotemEnvPath();
  const connected = isWhoopAuthenticated();
  const configured = isWhoopConfigured() || existsSync(envPath);
  const env = getWhoopEnv();
  const email = env.WHOOP_EMAIL?.trim() ? maskEmail(env.WHOOP_EMAIL) : null;

  let reason: string | null = null;
  if (!connected) {
    reason = configured
      ? "totem.env exists but no valid refresh or bearer token was found."
      : "No totem.env file found. Configure Whoop tokens to show recovery, sleep, and strain above journal entries.";
  }

  return {
    connected,
    configured,
    email,
    reason,
  };
}
