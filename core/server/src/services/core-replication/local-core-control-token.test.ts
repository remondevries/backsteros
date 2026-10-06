import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  ensureLocalCoreControlToken,
  localCoreControlTokenPath,
  resetLocalCoreControlTokenForTests,
  setLocalCoreControlTokenForTests,
  verifyLocalCoreControlAuthorization,
  verifyLocalCoreControlToken,
} from "./local-core-control-token.js";

const previous = {
  peerUrl: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
  role: process.env.CORE_REPLICATION_ROLE,
};

afterEach(() => {
  if (previous.peerUrl === undefined) delete process.env.CORE_REPLICATION_PEER_URL;
  else process.env.CORE_REPLICATION_PEER_URL = previous.peerUrl;
  if (previous.secret === undefined) delete process.env.CORE_REPLICATION_SECRET;
  else process.env.CORE_REPLICATION_SECRET = previous.secret;
  if (previous.role === undefined) delete process.env.CORE_REPLICATION_ROLE;
  else process.env.CORE_REPLICATION_ROLE = previous.role;
  resetLocalCoreControlTokenForTests();
});

describe("local-core control token (OS-82)", () => {
  it("rejects missing token and wrong values", () => {
    setLocalCoreControlTokenForTests("correct-token-value-aaaaaaaa");
    assert.equal(verifyLocalCoreControlToken(null), false);
    assert.equal(verifyLocalCoreControlToken("wrong"), false);
    assert.equal(
      verifyLocalCoreControlAuthorization("Bearer sk_live_agent_key"),
      false,
    );
    assert.equal(
      verifyLocalCoreControlAuthorization("Bearer correct-token-value-aaaaaaaa"),
      true,
    );
  });

  it("writes a 0600 token file only for local role", async () => {
    const home = await mkdtemp(join(tmpdir(), "os82-control-token-"));
    try {
      process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8799";
      process.env.CORE_REPLICATION_SECRET = "replication-secret";
      process.env.CORE_REPLICATION_ROLE = "cloud";
      assert.equal(await ensureLocalCoreControlToken(home), "skipped");

      process.env.CORE_REPLICATION_ROLE = "local";
      assert.equal(await ensureLocalCoreControlToken(home), "written");
      const path = localCoreControlTokenPath(home);
      const body = (await readFile(path, "utf8")).trim();
      assert.ok(body.length >= 32);
      assert.equal(verifyLocalCoreControlToken(body), true);
      assert.equal(verifyLocalCoreControlToken("replication-secret"), false);
      const mode = (await stat(path)).mode & 0o777;
      assert.equal(mode, 0o600);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
