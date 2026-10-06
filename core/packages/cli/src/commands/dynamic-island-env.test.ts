import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  DYNAMIC_ISLAND_DEFAULT_API_URL,
  formatDynamicIslandEnv,
  loopbackApiUrl,
  writeDynamicIslandEnvFile,
} from "./dynamic-island-env.js";

describe("loopbackApiUrl", () => {
  it("keeps loopback URLs and rewrites anything else to 127.0.0.1", () => {
    assert.equal(loopbackApiUrl("http://127.0.0.1:8788"), "http://127.0.0.1:8788");
    assert.equal(loopbackApiUrl("http://localhost:8788"), "http://localhost:8788");
    assert.equal(
      loopbackApiUrl("https://api.backsteros.com"),
      DYNAMIC_ISLAND_DEFAULT_API_URL,
    );
    assert.equal(loopbackApiUrl(undefined), DYNAMIC_ISLAND_DEFAULT_API_URL);
  });
});

describe("writeDynamicIslandEnvFile", () => {
  const home = mkdtempSync(join(tmpdir(), "os88-island-env-"));
  after(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("writes 0600 env atomically without exposing the secret in the path", async () => {
    const secret = "sk_live_test_secret_not_for_logs";
    const path = await writeDynamicIslandEnvFile({
      home,
      apiUrl: DYNAMIC_ISLAND_DEFAULT_API_URL,
      apiKey: secret,
    });
    const st = statSync(path);
    assert.equal(st.mode & 0o777, 0o600);
    const raw = readFileSync(path, "utf8");
    assert.equal(
      raw,
      formatDynamicIslandEnv(DYNAMIC_ISLAND_DEFAULT_API_URL, secret),
    );
    assert.equal(statSync(join(home, ".config/dynamic-island")).mode & 0o777, 0o700);
  });
});
