import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";

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
  }
});

test("node-server proxy does not crash on immutable fetch headers", async () => {
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
  }
});
