import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { isRouteAllowed } from "./allowlist.js";

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
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: upstreamResponse.headers,
      });
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
