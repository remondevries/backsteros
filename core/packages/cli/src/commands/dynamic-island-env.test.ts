import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  DYNAMIC_ISLAND_DEFAULT_API_URL,
  formatDynamicIslandEnv,
  requireLoopbackApiUrl,
  writeDynamicIslandEnvFile,
} from "./dynamic-island-env.js";

describe("requireLoopbackApiUrl", () => {
  it("accepts loopback variants and returns the normalised origin unchanged", () => {
    assert.equal(
      requireLoopbackApiUrl("http://127.0.0.1:8788"),
      "http://127.0.0.1:8788",
    );
    assert.equal(
      requireLoopbackApiUrl("http://localhost:8788"),
      "http://localhost:8788",
    );
    assert.equal(
      requireLoopbackApiUrl("https://127.0.0.1:8788"),
      "https://127.0.0.1:8788",
    );
    assert.equal(requireLoopbackApiUrl("http://[::1]:8788"), "http://[::1]:8788");
    assert.equal(requireLoopbackApiUrl(undefined), DYNAMIC_ISLAND_DEFAULT_API_URL);
    assert.equal(requireLoopbackApiUrl(""), DYNAMIC_ISLAND_DEFAULT_API_URL);
  });

  it("rejects non-loopback hosts without rewriting", () => {
    assert.throws(
      () => requireLoopbackApiUrl("https://agent.backsteros.com"),
      /got agent\.backsteros\.com/,
    );
    assert.throws(
      () => requireLoopbackApiUrl("http://192.168.1.10:8788"),
      /got 192\.168\.1\.10/,
    );
    assert.throws(
      () => requireLoopbackApiUrl("http://127.0.0.1.evil.test"),
      /got 127\.0\.0\.1\.evil\.test/,
    );
    assert.throws(
      () => requireLoopbackApiUrl("http://127.0.0.1@evil.test"),
      /got evil\.test/,
    );
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
