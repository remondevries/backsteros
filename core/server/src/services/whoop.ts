import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { WhoopDayResult, WhoopSnapshot, WhoopSettingsStatus } from "@backsteros/contracts";

const require = createRequire(import.meta.url);

const WHOOP_DAY_CACHE_TTL_MS = 120_000;
const whoopDayCache = new Map<
  string,
  { writtenAt: number; result: WhoopDayResult }
>();

type TotemWhoopModules = {
  TokenManager: new (config: {
    email: string;
    accessToken: string;
    refreshToken: string;
    envPath: string;
  }) => { getToken: () => Promise<string> };
  WhoopClient: new (config: {
    getToken: () => Promise<string>;
  }) => {
    get: (path: string, query?: Record<string, string>) => Promise<unknown>;
  };
  projectToday: (input: {
    home: unknown;
    sleep: unknown;
    recovery: unknown;
    state: unknown;
    date: string;
  }) => unknown;
};

let totemModulesPromise: Promise<TotemWhoopModules> | null = null;

function getTotemEnvPath(): string {
  const configured = process.env.TOTEM_ENV_PATH?.trim();
  if (configured) return configured;
  const dataDir =
    process.env.BACKSTER_DATA_DIR?.trim() ||
    join(homedir(), ".backsteros-agent");
  return join(dataDir, "totem.env");
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    result[trimmed.slice(0, separator).trim()] =
      trimmed.slice(separator + 1).trim();
  }
  return result;
}

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at < 0) return trimmed ? "••••" : "";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const visibleLen = Math.min(2, local.length);
  const visible = local.slice(0, visibleLen);
  const dots = local.length > 2 ? "•••" : "";
  return `${visible}${dots}${domain}`;
}

function getWhoopEnv(): Record<string, string> {
  const fileEnv = readEnvFile(getTotemEnvPath());
  const keys = [
    "WHOOP_EMAIL",
    "WHOOP_IOS_BEARER_TOKEN",
    "WHOOP_COGNITO_REFRESH_TOKEN",
  ] as const;
  const env: Record<string, string> = {};
  for (const key of keys) {
    const value = (process.env[key]?.trim() || fileEnv[key]?.trim() || "");
    if (value) env[key] = value;
  }
  return env;
}

function formatDateInTimezone(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInt(value: unknown): number | null {
  const num = asNumber(value);
  return num == null ? null : Math.trunc(num);
}

function asRecoveryState(
  value: unknown,
): "GREEN" | "YELLOW" | "RED" | null {
  return value === "GREEN" || value === "YELLOW" || value === "RED"
    ? value
    : null;
}

function formatDuration(ms: number | null | undefined): string | undefined {
  if (ms == null) return undefined;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function parseSleepStages(value: unknown) {
  const stages = asRecord(value);
  if (!stages) return undefined;
  return {
    remMs: asInt(stages.rem_ms),
    lightMs: asInt(stages.light_ms),
    swsMs: asInt(stages.sws_ms),
    wakeMs: asInt(stages.wake_ms),
  };
}

function parseTodaySnapshot(record: Record<string, unknown>): WhoopSnapshot | null {
  const date = typeof record.date === "string" ? record.date : undefined;
  const recovery = asRecord(record.recovery);
  const sleep = asRecord(record.sleep);
  const strain = asRecord(record.strain);
  if (!date || !recovery || !sleep || !strain) return null;

  return {
    id: `whoop-${date}`,
    date,
    recoveryScore: asNumber(recovery.score),
    recoveryState: asRecoveryState(recovery.state),
    hrvMs: asNumber(recovery.hrv_ms),
    rhrBpm: asNumber(recovery.rhr_bpm),
    sleepPerformance: asNumber(sleep.performance_pct),
    sleepDuration: formatDuration(asInt(sleep.total_sleep_ms)),
    strainScore: asNumber(strain.score),
    workoutsCount: asInt(strain.workouts_count) ?? 0,
    sleepStartedAt:
      typeof sleep.started_at === "string" ? sleep.started_at : null,
    sleepEndedAt: typeof sleep.ended_at === "string" ? sleep.ended_at : null,
    timeInBed: formatDuration(asInt(sleep.time_in_bed_ms)),
    sleepEfficiencyPct: asNumber(sleep.efficiency_pct),
    sleepStages: parseSleepStages(sleep.stages),
  };
}

async function loadTotemModules(): Promise<TotemWhoopModules> {
  if (!totemModulesPromise) {
    totemModulesPromise = (async () => {
      let totemPackageJson: string;
      try {
        totemPackageJson = require.resolve("@briangaoo/totem/package.json");
      } catch {
        throw new Error(
          "Missing @briangaoo/totem. Run `pnpm install` from the repo root.",
        );
      }

      const totemRoot = dirname(totemPackageJson);
      const cognitoDist = join(totemRoot, "dist", "whoop", "cognito.js");
      if (!existsSync(cognitoDist)) {
        throw new Error(
          "Whoop totem dist is not built. Run `node scripts/whoop/build-totem.mjs` in core/server.",
        );
      }

      async function load(...parts: string[]) {
        const href = pathToFileURL(join(totemRoot, "dist", ...parts)).href;
        return import(href);
      }

      const [tokenManagerModule, clientModule, todayModule] = await Promise.all([
        load("whoop", "token_manager.js"),
        load("whoop", "client.js"),
        load("projections", "today.js"),
      ]);

      return {
        TokenManager: tokenManagerModule.TokenManager as TotemWhoopModules["TokenManager"],
        WhoopClient: clientModule.WhoopClient as TotemWhoopModules["WhoopClient"],
        projectToday: todayModule.projectToday as TotemWhoopModules["projectToday"],
      };
    })();
  }
  return totemModulesPromise;
}

export function getWhoopSettingsStatus(): WhoopSettingsStatus {
  const envPath = getTotemEnvPath();
  const fileExists = existsSync(envPath);
  const env = getWhoopEnv();
  const connected = Boolean(
    env.WHOOP_COGNITO_REFRESH_TOKEN || env.WHOOP_IOS_BEARER_TOKEN,
  );
  const configured = connected || fileExists;
  const email = env.WHOOP_EMAIL ? maskEmail(env.WHOOP_EMAIL) : null;

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
    envPath,
  };
}

async function fetchWhoopDaySnapshotUncached(
  date: string,
): Promise<WhoopDayResult> {
  const status = getWhoopSettingsStatus();
  if (!status.connected) {
    return {
      authenticated: false,
      snapshot: null,
      error:
        status.reason ??
        "Whoop is not connected. Add refresh or bearer tokens to totem.env.",
    };
  }

  const env = getWhoopEnv();
  const email = env.WHOOP_EMAIL;
  const accessToken = env.WHOOP_IOS_BEARER_TOKEN;
  const refreshToken = env.WHOOP_COGNITO_REFRESH_TOKEN;
  if (!email || !accessToken || !refreshToken) {
    return {
      authenticated: false,
      snapshot: null,
      error: "Whoop tokens are incomplete in totem.env",
    };
  }

  try {
    const { TokenManager, WhoopClient, projectToday } = await loadTotemModules();
    const timezone =
      process.env.WHOOP_TIMEZONE?.trim() || "Europe/Amsterdam";
    const resolvedDate = date || formatDateInTimezone(timezone);

    const tokenManager = new TokenManager({
      email,
      accessToken,
      refreshToken,
      envPath: getTotemEnvPath(),
    });
    const client = new WhoopClient({
      getToken: () => tokenManager.getToken(),
    });

    const [home, sleep, recovery, state] = await Promise.all([
      client.get("/home-service/v1/home", { date: resolvedDate }),
      client.get("/developer/v2/activity/sleep", { limit: "5" }).catch(() => null),
      client.get("/developer/v2/recovery", { limit: "5" }).catch(() => null),
      client.get("/activities-service/v1/user-state").catch(() => null),
    ]);

    const projected = projectToday({
      home,
      sleep,
      recovery,
      state,
      date: resolvedDate,
    });
    const snapshot = parseTodaySnapshot(asRecord(projected) ?? {});

    return {
      authenticated: true,
      snapshot,
      error: snapshot ? null : "No Whoop snapshot for this date.",
    };
  } catch (error) {
    return {
      authenticated: true,
      snapshot: null,
      error:
        error instanceof Error ? error.message : "Failed to load Whoop data",
    };
  }
}

export async function fetchWhoopDaySnapshot(
  date: string,
): Promise<WhoopDayResult> {
  const cached = whoopDayCache.get(date);
  if (
    cached &&
    Date.now() - cached.writtenAt < WHOOP_DAY_CACHE_TTL_MS &&
    cached.result.authenticated &&
    cached.result.snapshot
  ) {
    return cached.result;
  }

  const result = await fetchWhoopDaySnapshotUncached(date);
  if (result.authenticated && result.snapshot) {
    whoopDayCache.set(date, { writtenAt: Date.now(), result });
  } else {
    whoopDayCache.delete(date);
  }
  return result;
}
