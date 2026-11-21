/**
 * Fixed-window rate limit for the agents door (by Authorization bearer hash).
 * Env: API_KEY_RATE_LIMIT_ENABLED / AGENTS_RATE_LIMIT_ENABLED (default 1),
 * API_KEY_RATE_LIMIT_RPM / AGENTS_RATE_LIMIT_RPM (default 300).
 */

import { createHash } from "node:crypto";

export type AgentsRateLimitConfig = {
  enabled: boolean;
  rpm: number;
  windowMs: number;
};

export type AgentsRateLimitResult =
  | { ok: true; limit: number; remaining: number; resetAtMs: number }
  | {
      ok: false;
      limit: number;
      remaining: 0;
      resetAtMs: number;
      retryAfterSec: number;
    };

type WindowState = { count: number; resetAtMs: number };

const windows = new Map<string, WindowState>();

export function readAgentsRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentsRateLimitConfig {
  const enabledRaw = (
    env.AGENTS_RATE_LIMIT_ENABLED ??
    env.API_KEY_RATE_LIMIT_ENABLED ??
    "1"
  ).trim();
  const enabled = !(
    enabledRaw === "0" ||
    enabledRaw.toLowerCase() === "false" ||
    enabledRaw.toLowerCase() === "off"
  );
  const rpmParsed = Number(
    env.AGENTS_RATE_LIMIT_RPM ?? env.API_KEY_RATE_LIMIT_RPM ?? "300",
  );
  const rpm =
    Number.isFinite(rpmParsed) && rpmParsed > 0
      ? Math.min(Math.trunc(rpmParsed), 100_000)
      : 300;
  return { enabled, rpm, windowMs: 60_000 };
}

export function resetAgentsRateLimitForTests(): void {
  windows.clear();
}

export function hashBearerForRateLimit(
  authorization: string | null | undefined,
): string {
  if (!authorization) return "anon";
  const trimmed = authorization.trim();
  if (!trimmed) return "anon";
  return createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
}

export function consumeAgentsRateLimit(
  bucketKey: string,
  config: AgentsRateLimitConfig = readAgentsRateLimitConfig(),
  now = Date.now(),
): AgentsRateLimitResult {
  if (!config.enabled) {
    return {
      ok: true,
      limit: config.rpm,
      remaining: config.rpm,
      resetAtMs: now + config.windowMs,
    };
  }

  let state = windows.get(bucketKey);
  if (!state || state.resetAtMs <= now) {
    state = { count: 0, resetAtMs: now + config.windowMs };
    windows.set(bucketKey, state);
  }

  if (state.count >= config.rpm) {
    return {
      ok: false,
      limit: config.rpm,
      remaining: 0,
      resetAtMs: state.resetAtMs,
      retryAfterSec: Math.max(1, Math.ceil((state.resetAtMs - now) / 1000)),
    };
  }

  state.count += 1;
  return {
    ok: true,
    limit: config.rpm,
    remaining: Math.max(0, config.rpm - state.count),
    resetAtMs: state.resetAtMs,
  };
}
