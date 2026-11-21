import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import {
  resetAgentsRateLimitForTests,
} from "./lib/rate-limit.js";

function listen(
  server: ReturnType<typeof createServer>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        reject(new Error("server did not bind"));
        return;
      }
      resolve(address.port);
    });
    server.on("error", reject);
  });
}

test("proxies upstream status and JSON through secureHeaders", async () => {
  resetAgentsRateLimitForTests();
  process.env.AGENTS_RATE_LIMIT_ENABLED = "0";
  const server = createServer((req, res) => {
    assert.equal(req.url, "/api/v1/tasks");
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized", code: "unauthorized" }));
  });

  const port = await listen(server);
  const app = createApp({
    upstreamUrl: `http://127.0.0.1:${port}`,
  });

  try {
    const response = await app.request("http://agents.test/api/v1/tasks");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Unauthorized",
      code: "unauthorized",
    });
  } finally {
    server.close();
    delete process.env.AGENTS_RATE_LIMIT_ENABLED;
  }
});

test("agents door returns 429 with Retry-After when rate limited", async () => {
  resetAgentsRateLimitForTests();
  process.env.AGENTS_RATE_LIMIT_ENABLED = "1";
  process.env.AGENTS_RATE_LIMIT_RPM = "2";
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const port = await listen(server);
  const app = createApp({ upstreamUrl: `http://127.0.0.1:${port}` });
  const headers = { authorization: "Bearer sk_live_rate_limit_test" };
  try {
    assert.equal(
      (await app.request("http://agents.test/api/v1/tasks", { headers })).status,
      200,
    );
    assert.equal(
      (await app.request("http://agents.test/api/v1/tasks", { headers })).status,
      200,
    );
    const blocked = await app.request("http://agents.test/api/v1/tasks", {
      headers,
    });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("Retry-After"));
    assert.deepEqual(await blocked.json(), {
      error: "Rate limit exceeded",
      code: "rate_limited",
    });
  } finally {
    server.close();
    delete process.env.AGENTS_RATE_LIMIT_ENABLED;
    delete process.env.AGENTS_RATE_LIMIT_RPM;
    resetAgentsRateLimitForTests();
  }
});

test("node-server proxy does not crash on immutable fetch headers", async () => {
  resetAgentsRateLimitForTests();
  process.env.AGENTS_RATE_LIMIT_ENABLED = "0";
  const upstream = createServer((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized", code: "unauthorized" }));
  });
  const upstreamPort = await listen(upstream);
  const app = createApp({
    upstreamUrl: `http://127.0.0.1:${upstreamPort}`,
  });

  const proxyServer = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  });
  await new Promise<void>((resolve) => proxyServer.once("listening", resolve));
  const proxyPort = (proxyServer.address() as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/v1/tasks`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Unauthorized",
      code: "unauthorized",
    });
  } finally {
    proxyServer.close();
    upstream.close();
    delete process.env.AGENTS_RATE_LIMIT_ENABLED;
  }
});
