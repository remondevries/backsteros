import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { CursorPlanUsage } from "@/lib/cursor-plan-usage-shared";

export type { CursorPlanUsage } from "@/lib/cursor-plan-usage-shared";
export {
  formatPlanPercent,
  formatUsdCents,
  planUsageTone,
} from "@/lib/cursor-plan-usage-shared";

const execFileAsync = promisify(execFile);

const USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

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
      return path.join(
        home,
        ".config",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      );
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

async function resolveAccessToken(): Promise<string | null> {
  const fromEnv =
    process.env.CURSOR_ACCESS_TOKEN?.trim() ||
    process.env.CURSOR_API_KEY?.trim() ||
    null;
  if (fromEnv) return fromEnv;
  return readAccessTokenFromCursorDb();
}

function parsePlanUsage(payload: unknown): CursorPlanUsage | null {
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
  if (
    remainingCents == null &&
    limitCents != null &&
    includedSpendCents != null
  ) {
    remainingCents = Math.max(0, limitCents - includedSpendCents);
  }

  return {
    autoPercentUsed: clampPercent(plan.autoPercentUsed),
    apiPercentUsed: clampPercent(plan.apiPercentUsed),
    totalPercentUsed: clampPercent(plan.totalPercentUsed),
    includedSpendCents,
    limitCents,
    remainingCents,
    displayMessage:
      typeof raw.displayMessage === "string" ? raw.displayMessage : null,
    billingCycleEndMs: asMs(raw.billingCycleEnd),
  };
}

/** Fetch current Cursor subscription period usage (Auto / API pools). */
export async function fetchCursorPlanUsage(): Promise<CursorPlanUsage | null> {
  const token = await resolveAccessToken();
  if (!token) return null;

  const response = await fetch(USAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json: unknown = await response.json();
  return parsePlanUsage(json);
}
