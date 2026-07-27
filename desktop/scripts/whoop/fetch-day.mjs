#!/usr/bin/env node
/**
 * Day snapshot for journal Whoop rings (sleep / recovery / strain).
 * Reads tokens from ~/.backsteros-agent/totem.env (or TOTEM_ENV_PATH).
 * Uses @briangaoo/totem for Cognito refresh + Whoop private API client.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const require = createRequire(import.meta.url);

function getTotemEnvPath() {
  const configured = process.env.TOTEM_ENV_PATH?.trim();
  if (configured) return configured;
  const dataDir =
    process.env.BACKSTER_DATA_DIR?.trim() || join(homedir(), ".backsteros-agent");
  return join(dataDir, "totem.env");
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return result;
}

function loadTotemEnvIntoProcess() {
  const fileEnv = readEnvFile(getTotemEnvPath());
  for (const [key, value] of Object.entries(fileEnv)) {
    if (!process.env[key]?.trim()) process.env[key] = value;
  }
}

function getWhoopEnv() {
  loadTotemEnvIntoProcess();
  const keys = [
    "WHOOP_EMAIL",
    "WHOOP_IOS_BEARER_TOKEN",
    "WHOOP_COGNITO_REFRESH_TOKEN",
  ];
  const env = {};
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) env[key] = value;
  }
  return env;
}

function formatDateInTimezone(timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function asRecord(value) {
  return value && typeof value === "object" ? value : null;
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInt(value) {
  const num = asNumber(value);
  return num == null ? null : Math.trunc(num);
}

function asRecoveryState(value) {
  return value === "GREEN" || value === "YELLOW" || value === "RED" ? value : null;
}

function formatDuration(ms) {
  if (ms == null) return undefined;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function parseSleepStages(value) {
  const stages = asRecord(value);
  if (!stages) return undefined;
  return {
    remMs: asInt(stages.rem_ms),
    remPct: asNumber(stages.rem_pct),
    lightMs: asInt(stages.light_ms),
    lightPct: asNumber(stages.light_pct),
    swsMs: asInt(stages.sws_ms),
    swsPct: asNumber(stages.sws_pct),
    wakeMs: asInt(stages.wake_ms),
    wakePct: asNumber(stages.wake_pct),
  };
}

function parseTodaySnapshot(record) {
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
    sleepStartedAt: typeof sleep.started_at === "string" ? sleep.started_at : null,
    sleepEndedAt: typeof sleep.ended_at === "string" ? sleep.ended_at : null,
    timeInBed: formatDuration(asInt(sleep.time_in_bed_ms)),
    sleepEfficiencyPct: asNumber(sleep.efficiency_pct),
    sleepStages: parseSleepStages(sleep.stages),
  };
}

async function loadTotemModules() {
  let totemPackageJson;
  try {
    totemPackageJson = require.resolve("@briangaoo/totem/package.json");
  } catch {
    throw new Error(
      "Missing @briangaoo/totem. Run `pnpm install` from the repo root (desktop package).",
    );
  }

  const totemRoot = dirname(totemPackageJson);
  const cognitoDist = join(totemRoot, "dist", "whoop", "cognito.js");
  if (!existsSync(cognitoDist)) {
    throw new Error(
      "Whoop totem dist is not built. Run `node desktop/scripts/whoop/build-totem.mjs`.",
    );
  }

  async function load(...parts) {
    const href = pathToFileURL(join(totemRoot, "dist", ...parts)).href;
    return import(href);
  }

  const [tokenManagerModule, clientModule, todayModule] = await Promise.all([
    load("whoop", "token_manager.js"),
    load("whoop", "client.js"),
    load("projections", "today.js"),
  ]);

  return {
    TokenManager: tokenManagerModule.TokenManager,
    WhoopClient: clientModule.WhoopClient,
    projectToday: todayModule.projectToday,
  };
}

async function fetchWhoopDaySnapshot({ date, timezone, now } = {}) {
  const env = getWhoopEnv();
  const email = env.WHOOP_EMAIL;
  const accessToken = env.WHOOP_IOS_BEARER_TOKEN;
  const refreshToken = env.WHOOP_COGNITO_REFRESH_TOKEN;

  if (!refreshToken && !accessToken) {
    throw new Error("Whoop is not authenticated");
  }
  if (!email || !accessToken || !refreshToken) {
    throw new Error("Whoop tokens are incomplete in totem.env");
  }

  const resolvedTimezone =
    timezone ?? process.env.WHOOP_TIMEZONE?.trim() ?? "Europe/Amsterdam";
  const resolvedDate =
    date ?? formatDateInTimezone(resolvedTimezone, now ?? new Date());

  const { TokenManager, WhoopClient, projectToday } = await loadTotemModules();
  const tokenManager = new TokenManager({
    email,
    accessToken,
    refreshToken,
    envPath: getTotemEnvPath(),
  });
  const client = new WhoopClient({ getToken: () => tokenManager.getToken() });

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
  return parseTodaySnapshot(asRecord(projected) ?? {});
}

function writeResult(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      date: { type: "string" },
      timezone: { type: "string" },
      now: { type: "string" },
    },
  });

  try {
    const snapshot = await fetchWhoopDaySnapshot({
      date: values.date,
      timezone: values.timezone,
      now: values.now ? new Date(values.now) : undefined,
    });
    writeResult({ ok: true, snapshot });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Whoop data";
    writeResult({ ok: false, snapshot: null, error: message });
    process.exitCode = 1;
  }
}

void main();
