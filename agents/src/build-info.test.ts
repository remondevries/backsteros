import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "./app.js";
import { resolveAgentsBuild } from "./build-info.js";

const missingFile = path.join(tmpdir(), "backsteros-agents-no-build-info.json");

test("resolveAgentsBuild prefers BACKSTEROS_BUILD_* env", () => {
  assert.deepEqual(
    resolveAgentsBuild(
      { BACKSTEROS_BUILD_COMMIT: " abc123 ", BACKSTEROS_BUILD_BUILT_AT: "2026-10-25T10:00:00Z", BACKSTEROS_BUILD_DIRTY: "1" },
      missingFile,
    ),
    { commit: "abc123", builtAt: "2026-10-25T10:00:00Z", dirty: true },
  );
});

test("resolveAgentsBuild falls back to build-info.json, then null", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agents-build-"));
  const file = path.join(dir, "build-info.json");
  writeFileSync(file, JSON.stringify({ commit: "def456", builtAt: "2026-10-25T11:00:00Z", dirty: false }));
  assert.deepEqual(resolveAgentsBuild({}, file), {
    commit: "def456",
    builtAt: "2026-10-25T11:00:00Z",
    dirty: false,
  });

  writeFileSync(file, "{not json");
  assert.equal(resolveAgentsBuild({}, file), null);
  assert.equal(resolveAgentsBuild({}, missingFile), null);
});

test("/health reports the build commit for deploy:check", async () => {
  const build = { commit: "abc123", builtAt: "2026-10-25T10:00:00Z", dirty: false };
  const app = createApp({ upstreamUrl: "http://127.0.0.1:9", build });
  const response = await app.request("http://agents.test/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "backsteros-agents",
    version: "0.1.0",
    build,
  });

  const unknown = await createApp({ upstreamUrl: "http://127.0.0.1:9" }).request("http://agents.test/health");
  assert.equal(((await unknown.json()) as { build: unknown }).build, null);
});
