import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { isRouteAllowed } from "./allowlist.js";
import type { AgentsBuild } from "./build-info.js";
import {
  consumeAgentsRateLimit,
  hashBearerForRateLimit,
  readAgentsRateLimitConfig,
} from "./lib/rate-limit.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

export type AgentsAppOptions = {
  upstreamUrl: string;
  requestTimeoutMs?: number;
  build?: AgentsBuild | null;
};

function buildProxyHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  incoming.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function cloneMutableResponse(response: Response): Response {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.append(key, value);
    }
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createApp(options: AgentsAppOptions) {
  const upstream = options.upstreamUrl.replace(/\/$/, "");
  const timeoutMs = options.requestTimeoutMs ?? 120_000;
  const app = new Hono();

  app.use("*", logger());
  app.use("*", secureHeaders());

  app.get("/health", (c) =>
    c.json({
      ok: true as const,
      service: "backsteros-agents",
      version: "0.1.0",
      build: options.build ?? null,
    }),
  );

  app.all("/api/v1/*", async (c) => {
    const url = new URL(c.req.url);
    const method = c.req.method;

    if (!isRouteAllowed(method, url.pathname)) {
      return c.json(
        {
          error: "Route not allowed on agents proxy",
          code: "forbidden" as const,
        },
        403,
      );
    }

    const rate = consumeAgentsRateLimit(
      hashBearerForRateLimit(c.req.header("authorization")),
      readAgentsRateLimitConfig(),
    );
    c.header("X-RateLimit-Limit", String(rate.limit));
    c.header("X-RateLimit-Remaining", String(rate.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(rate.resetAtMs / 1000)));
    if (!rate.ok) {
      c.header("Retry-After", String(rate.retryAfterSec));
      return c.json(
        { error: "Rate limit exceeded", code: "rate_limited" as const },
        429,
      );
    }

    const target = `${upstream}${url.pathname}${url.search}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = buildProxyHeaders(c.req.raw.headers);
      const init: RequestInit & { duplex?: "half" } = {
        method,
        headers,
        redirect: "manual",
        signal: controller.signal,
      };

      if (method !== "GET" && method !== "HEAD") {
        init.body = c.req.raw.body;
        init.duplex = "half";
      }

      const upstreamResponse = await fetch(target, init);
      // Fetch Response headers are immutable in Node/undici. Returning them
      // (or `new Response(body, fetchRes)`) makes Hono's secureHeaders crash
      // with TypeError: immutable. Copy into a fresh Headers object first.
      return cloneMutableResponse(upstreamResponse);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upstream request failed";
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return c.json(
        {
          error: isTimeout ? "Upstream request timed out" : message,
          code: isTimeout ? ("gateway_timeout" as const) : ("bad_gateway" as const),
        },
        isTimeout ? 504 : 502,
      );
    } finally {
      clearTimeout(timeout);
    }
  });

  app.all("*", (c) =>
    c.json({ error: "Not found", code: "not_found" as const }, 404),
  );

  return app;
}
