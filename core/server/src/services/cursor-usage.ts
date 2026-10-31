/**
 * Cursor plan usage for the desktop sidebar, using the Settings-stored API key.
 *
 * Dashboard Connect RPCs (`GetCurrentPeriodUsage` / `GetSandUsageStatus`) need a
 * session access token — not a raw user API key. We exchange the Settings key
 * via `POST /auth/exchange_user_api_key` on api2.cursor.sh, then call those
 * endpoints. The API key never leaves this process / response body.
 */

import type { CursorUsage } from "@backsteros/contracts";

const EXCHANGE_URL = "https://api2.cursor.sh/auth/exchange_user_api_key";
const USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const GROK_BOT_USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetSandUsageStatus";

const SOURCE = "settings_api_key";

function unavailable(error: string): CursorUsage {
  return {
    available: false,
    autoPercentUsed: 0,
    apiPercentUsed: 0,
    totalPercentUsed: 0,
    error,
    source: SOURCE,
    sampledAt: Date.now(),
  };
}

function clampPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function asCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function asMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return Math.round(asNumber);
    // Cursor SandUsageStatus returns ISO-8601 (e.g. nextResetTimestampUtc).
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** JWT session tokens start with eyJ; API keys (crsr_/key_/…) do not. */
export function looksLikeCursorSessionToken(value: string): boolean {
  return value.trim().startsWith("eyJ");
}

export function parsePlanUsage(
  json: unknown,
  source: string = SOURCE,
): CursorUsage | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const root = json as Record<string, unknown>;
  const plan = root.planUsage;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const planObj = plan as Record<string, unknown>;

  const limitCents = asCents(planObj.limit);
  const includedSpendCents =
    asCents(planObj.includedSpend) ?? asCents(planObj.totalSpend);
  let remainingCents = asCents(planObj.remaining);
  if (remainingCents == null && limitCents != null && includedSpendCents != null) {
    remainingCents = Math.max(0, limitCents - includedSpendCents);
  }

  return {
    available: true,
    autoPercentUsed: clampPercent(planObj.autoPercentUsed),
    apiPercentUsed: clampPercent(planObj.apiPercentUsed),
    totalPercentUsed: clampPercent(planObj.totalPercentUsed),
    includedSpendCents,
    limitCents,
    remainingCents,
    displayMessage:
      typeof root.displayMessage === "string" ? root.displayMessage : null,
    billingCycleEndMs: asMs(root.billingCycleEnd),
    grokBotPercentUsed: null,
    grokBotResetMs: null,
    error: null,
    source,
    sampledAt: Date.now(),
  };
}

export function applyGrokBotUsage(
  usage: CursorUsage,
  json: unknown,
): CursorUsage {
  if (!json || typeof json !== "object" || Array.isArray(json)) return usage;
  const root = json as Record<string, unknown>;
  const hasLimit = root.hasNonZeroIncludedLimit === true;
  const percent =
    typeof root.usagePercent === "number" ? root.usagePercent : null;
  if (!hasLimit && percent == null) return usage;
  return {
    ...usage,
    grokBotPercentUsed: clampPercent(percent),
    grokBotResetMs: asMs(root.nextResetTimestampUtc),
  };
}

async function postDashboardJson(
  accessToken: string,
  url: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
      "User-Agent": "backsteros-core",
    },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`Cursor usage request failed (${response.status}).`);
  }
  return response.json();
}

/**
 * Exchange a Cursor user API key for a short-lived dashboard access token.
 * Does not log the key or token.
 */
export async function exchangeCursorApiKeyForAccessToken(
  apiKey: string,
): Promise<string> {
  const response = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "backsteros-core",
    },
    body: "{}",
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Settings Cursor API key was rejected by Cursor (exchange_user_api_key).",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Settings Cursor API key exchange failed (${response.status}).`,
    );
  }
  const body = (await response.json()) as { accessToken?: unknown };
  if (typeof body.accessToken !== "string" || !body.accessToken.trim()) {
    throw new Error(
      "Settings Cursor API key exchange returned no access token.",
    );
  }
  return body.accessToken.trim();
}

/**
 * Resolve a bearer usable with DashboardService from a Settings / env secret.
 * Session JWTs are used as-is; API keys are exchanged first.
 */
export async function resolveDashboardAccessToken(
  secret: string,
): Promise<string> {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("Empty Cursor credential.");
  }
  if (looksLikeCursorSessionToken(trimmed)) {
    return trimmed;
  }
  return exchangeCursorApiKeyForAccessToken(trimmed);
}

export async function fetchCursorUsageWithSecret(
  secret: string,
  source: string = SOURCE,
): Promise<CursorUsage> {
  let accessToken: string;
  try {
    accessToken = await resolveDashboardAccessToken(secret);
  } catch (error) {
    return unavailable(
      error instanceof Error
        ? error.message
        : "Could not resolve Cursor dashboard token from Settings API key.",
    );
  }

  let planJson: unknown;
  try {
    planJson = await postDashboardJson(accessToken, USAGE_URL);
  } catch (error) {
    return unavailable(
      error instanceof Error
        ? `${error.message} (source: ${source})`
        : `Cursor usage request failed (source: ${source}).`,
    );
  }

  const usage = parsePlanUsage(planJson, source);
  if (!usage) {
    return unavailable(
      `Cursor usage shape was not recognized (source: ${source}).`,
    );
  }

  try {
    const sand = await postDashboardJson(accessToken, GROK_BOT_USAGE_URL);
    return applyGrokBotUsage(usage, sand);
  } catch {
    return usage;
  }
}

/** Sidebar credits: Settings workspaceIntegrationSecrets.cursorApiKey first. */
export async function getCursorUsageForWorkspace(
  workspaceId: string,
): Promise<CursorUsage> {
  // Lazy import so pure parse helpers stay unit-testable without DATABASE_URL.
  const cursorSettings = await import("./cursor-settings.js");
  const apiKey = await cursorSettings.getCursorApiKey(workspaceId);
  if (!apiKey) {
    return unavailable(
      "No Cursor API key in Settings. Add one under Settings → Cursor, or sign in to Cursor locally.",
    );
  }
  return fetchCursorUsageWithSecret(apiKey, SOURCE);
}
