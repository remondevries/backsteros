/**
 * Fixed-window per-API-key rate limit (in-process).
 * Env: API_KEY_RATE_LIMIT_ENABLED (default 1), API_KEY_RATE_LIMIT_RPM (default 300).
 */

export type RateLimitConfig = {
  enabled: boolean;
  /** Requests allowed per window. */
  rpm: number;
  /** Window length in ms (default 60s). */
  windowMs: number;
};

export type RateLimitResult =
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
let configOverrideForTests: RateLimitConfig | null = null;

export function readApiKeyRateLimitConfig(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitConfig {
  if (configOverrideForTests) return configOverrideForTests;
  const enabledRaw = (env.API_KEY_RATE_LIMIT_ENABLED ?? "1").trim();
  const enabled = !(
    enabledRaw === "0" ||
    enabledRaw.toLowerCase() === "false" ||
    enabledRaw.toLowerCase() === "off"
  );
  const rpmParsed = Number(env.API_KEY_RATE_LIMIT_RPM ?? "300");
  const rpm =
    Number.isFinite(rpmParsed) && rpmParsed > 0
      ? Math.min(Math.trunc(rpmParsed), 100_000)
      : 300;
  return { enabled, rpm, windowMs: 60_000 };
}

export function resetApiKeyRateLimitForTests(): void {
  windows.clear();
  configOverrideForTests = null;
}

/** Test-only config override (cleared by {@link resetApiKeyRateLimitForTests}). */
export function setApiKeyRateLimitConfigForTests(
  config: RateLimitConfig | null,
): void {
  configOverrideForTests = config;
}

function pruneStale(now: number): void {
  if (windows.size < 500) return;
  for (const [key, state] of windows) {
    if (state.resetAtMs <= now) windows.delete(key);
  }
}

/**
 * Consume one request for `bucketKey`. Returns whether the request may proceed.
 */
export function consumeApiKeyRateLimit(
  bucketKey: string,
  config: RateLimitConfig = readApiKeyRateLimitConfig(),
  now = Date.now(),
): RateLimitResult {
  if (!config.enabled) {
    return {
      ok: true,
      limit: config.rpm,
      remaining: config.rpm,
      resetAtMs: now + config.windowMs,
    };
  }

  pruneStale(now);
  let state = windows.get(bucketKey);
  if (!state || state.resetAtMs <= now) {
    state = { count: 0, resetAtMs: now + config.windowMs };
    windows.set(bucketKey, state);
  }

  if (state.count >= config.rpm) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((state.resetAtMs - now) / 1000),
    );
    return {
      ok: false,
      limit: config.rpm,
      remaining: 0,
      resetAtMs: state.resetAtMs,
      retryAfterSec,
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
