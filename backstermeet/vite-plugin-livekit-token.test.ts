import assert from "node:assert/strict";
import test from "node:test";

import { parseDotenv, resolveClientUrl, resolveHostRoom } from "./vite-plugin-livekit-token";

const ENV_KEYS = ["LIVEKIT_CLIENT_URL", "LIVEKIT_URL"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

test.beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});
test.after(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test("parseDotenv reads KEY=value lines, strips quotes and skips comments", () => {
  assert.deepEqual(
    parseDotenv(
      [
        "# LiveKit",
        "LIVEKIT_URL=wss://client.lemo-design.com/livekit",
        "LIVEKIT_API_KEY = 'key'",
        'LIVEKIT_API_SECRET="se=cret"',
        "",
        "=nokey",
        "NOEQUALS",
      ].join("\n"),
    ),
    {
      LIVEKIT_URL: "wss://client.lemo-design.com/livekit",
      LIVEKIT_API_KEY: "key",
      LIVEKIT_API_SECRET: "se=cret",
    },
  );
});

test("resolveClientUrl keeps the shared portal SFU and rewrites local SFUs to loopback", () => {
  const portal = "wss://client.lemo-design.com/livekit";
  assert.equal(resolveClientUrl({ LIVEKIT_URL: portal }), portal);
  assert.equal(
    resolveClientUrl({ LIVEKIT_CLIENT_URL: portal, LIVEKIT_URL: "ws://100.83.125.67:7880" }),
    portal,
    "LIVEKIT_CLIENT_URL wins over LIVEKIT_URL",
  );
  assert.equal(resolveClientUrl({ LIVEKIT_URL: "wss://sfu.lemo-design.com" }), "wss://sfu.lemo-design.com");
  assert.equal(resolveClientUrl({ LIVEKIT_URL: "wss://sfu.example.org" }), "wss://sfu.example.org");

  assert.equal(resolveClientUrl({ LIVEKIT_URL: "ws://100.83.125.67:7880" }), "ws://127.0.0.1:7880");
  assert.equal(resolveClientUrl({ LIVEKIT_URL: "ws://192.168.1.5" }), "ws://127.0.0.1:7880");
  assert.equal(resolveClientUrl({ LIVEKIT_URL: "wss://box.tail1234.ts.net:7443" }), "ws://127.0.0.1:7443");

  assert.equal(resolveClientUrl({}), "");
  assert.equal(resolveClientUrl({ LIVEKIT_URL: "not a url" }), "not a url");

  process.env.LIVEKIT_CLIENT_URL = portal;
  assert.equal(resolveClientUrl({ LIVEKIT_CLIENT_URL: "ws://localhost:7880" }), portal, "process env wins over the file");
});

test("resolveHostRoom uses the meeting id, else the configured room", () => {
  assert.equal(resolveHostRoom("backstermeet-dev", " meeting-1 "), "meeting-1");
  assert.equal(resolveHostRoom("backstermeet-dev", "  "), "backstermeet-dev");
  assert.equal(resolveHostRoom("backstermeet-dev", null), "backstermeet-dev");
});
