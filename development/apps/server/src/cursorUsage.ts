/**
 * Cursor subscription usage for the sidebar credits bar.
 * Reads the signed-in Cursor access token from the local IDE state DB
 * (or CURSOR_ACCESS_TOKEN / CURSOR_API_KEY) and calls Cursor's dashboard APIs.
 */
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const GROK_BOT_USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetSandUsageStatus";

export type CursorUsage = {
  available: boolean;
  autoPercentUsed: number;
  apiPercentUsed: number;
  totalPercentUsed: number;
  includedSpendCents?: number | null;
  limitCents?: number | null;
  remainingCents?: number | null;
  displayMessage?: string | null;
  billingCycleEndMs?: number | null;
  grokBotPercentUsed?: number | null;
  grokBotResetMs?: number | null;
  error?: string | null;
  sampledAt: number;
};

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
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function unavailable(error: string): CursorUsage {
  return {
    available: false,
    autoPercentUsed: 0,
    apiPercentUsed: 0,
    totalPercentUsed: 0,
    error,
    sampledAt: Date.now(),
  };
}

function cursorStateDbPath(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(
        home,
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      );
    case "win32":
      return path.join(
        process.env.APPDATA || path.join(home, "AppData", "Roaming"),
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      );
    default:
      return path.join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb");
  }
}

async function readAccessTokenFromCursorDb(): Promise<string | null> {
  const dbPath = cursorStateDbPath();
  try {
    const { stdout } = await execFileAsync(
      "sqlite3",
      [dbPath, "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken';"],
      { encoding: "utf8", timeout: 5_000 },
    );
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function resolveCursorAccessToken(): Promise<string | null> {
  const fromEnv =
    process.env.CURSOR_ACCESS_TOKEN?.trim() || process.env.CURSOR_API_KEY?.trim() || null;
  if (fromEnv) return fromEnv;
  return readAccessTokenFromCursorDb();
}

function parsePlanUsage(payload: unknown): CursorUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const plan =
    raw.planUsage && typeof raw.planUsage === "object"
      ? (raw.planUsage as Record<string, unknown>)
      : null;
  if (!plan) return null;

  const limitCents = asCents(plan.limit);
  const includedSpendCents = asCents(plan.includedSpend ?? plan.totalSpend);
  let remainingCents = asCents(plan.remaining);
  if (remainingCents == null && limitCents != null && includedSpendCents != null) {
    remainingCents = Math.max(0, limitCents - includedSpendCents);
  }

  return {
    available: true,
    autoPercentUsed: clampPercent(plan.autoPercentUsed),
    apiPercentUsed: clampPercent(plan.apiPercentUsed),
    totalPercentUsed: clampPercent(plan.totalPercentUsed),
    includedSpendCents,
    limitCents,
    remainingCents,
    displayMessage: typeof raw.displayMessage === "string" ? raw.displayMessage : null,
    billingCycleEndMs: asMs(raw.billingCycleEnd),
    sampledAt: Date.now(),
  };
}

function applyGrokBotUsage(usage: CursorUsage, payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const raw = payload as Record<string, unknown>;
  const hasLimit = raw.hasNonZeroIncludedLimit === true;
  const percent = typeof raw.usagePercent === "number" ? raw.usagePercent : null;
  if (!hasLimit && percent == null) return;
  usage.grokBotPercentUsed = clampPercent(percent);
  usage.grokBotResetMs = asMs(raw.nextResetTimestampUtc);
}

export async function postCursorJson(
  token: string,
  url: string,
  body: unknown = {},
): Promise<unknown | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) return null;
  return response.json();
}

/** Fetch current Cursor subscription period usage (Auto / API / optional Grok Bot). */
export async function fetchCursorUsage(): Promise<CursorUsage> {
  const token = await resolveCursorAccessToken();
  if (!token) {
    return unavailable("Sign in to Cursor on this machine");
  }

  try {
    const planJson = await postCursorJson(token, USAGE_URL);
    const usage = parsePlanUsage(planJson);
    if (!usage) {
      return unavailable("Cursor credits unavailable");
    }

    try {
      const grokJson = await postCursorJson(token, GROK_BOT_USAGE_URL);
      if (grokJson) applyGrokBotUsage(usage, grokJson);
    } catch {
      // Grok Bot is optional — keep Auto / API if this call fails.
    }

    return usage;
  } catch {
    return unavailable("Cursor credits unavailable");
  }
}
