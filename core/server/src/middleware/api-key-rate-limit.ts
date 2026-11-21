import type { Context, Next } from "hono";

import {
  consumeApiKeyRateLimit,
  readApiKeyRateLimitConfig,
} from "../lib/api-key-rate-limit.js";
import type { AuthContext } from "./auth.js";

/**
 * After {@link withAuth}: throttle API-key traffic only.
 * Exempt: local_shell, powersync, missing auth (already 401), health paths.
 */
export async function apiKeyRateLimit(c: Context, next: Next) {
  const path = c.req.path;
  if (
    path === "/api/v1/health" ||
    path === "/api/v1/openapi.json" ||
    path.startsWith("/api/v1/openapi")
  ) {
    return next();
  }

  const auth = c.get("auth") as AuthContext | undefined;
  if (!auth || auth.kind !== "api_key" || !auth.apiKeyId) {
    return next();
  }

  const result = consumeApiKeyRateLimit(
    auth.apiKeyId,
    readApiKeyRateLimitConfig(),
  );
  c.header("X-RateLimit-Limit", String(result.limit));
  c.header("X-RateLimit-Remaining", String(result.remaining));
  c.header(
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAtMs / 1000)),
  );

  if (!result.ok) {
    c.header("Retry-After", String(result.retryAfterSec));
    return c.json(
      { error: "Rate limit exceeded", code: "rate_limited" as const },
      429,
    );
  }

  return next();
}
