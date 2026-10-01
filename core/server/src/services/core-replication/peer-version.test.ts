import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { listOpsLogs } from "../../lib/ops-log-buffer.js";
import {
  resetBuildVersionCacheForTests,
} from "../../lib/build-version.js";
import {
  checkPeerBuildVersion,
  getPeerVersionState,
  resetPeerVersionStateForTests,
} from "./peer-version.js";

const PREV = {
  peer: process.env.CORE_REPLICATION_PEER_URL,
  secret: process.env.CORE_REPLICATION_SECRET,
  role: process.env.CORE_REPLICATION_ROLE,
  commit: process.env.BACKSTEROS_BUILD_COMMIT,
  builtAt: process.env.BACKSTEROS_BUILD_BUILT_AT,
  dirty: process.env.BACKSTEROS_BUILD_DIRTY,
};

function restoreEnv() {
  const apply = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  apply("CORE_REPLICATION_PEER_URL", PREV.peer);
  apply("CORE_REPLICATION_SECRET", PREV.secret);
  apply("CORE_REPLICATION_ROLE", PREV.role);
  apply("BACKSTEROS_BUILD_COMMIT", PREV.commit);
  apply("BACKSTEROS_BUILD_BUILT_AT", PREV.builtAt);
  apply("BACKSTEROS_BUILD_DIRTY", PREV.dirty);
}

describe("checkPeerBuildVersion", () => {
  beforeEach(() => {
    resetPeerVersionStateForTests();
    resetBuildVersionCacheForTests();
    process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:9999";
    process.env.CORE_REPLICATION_SECRET = "test-secret";
    process.env.CORE_REPLICATION_ROLE = "local";
    process.env.BACKSTEROS_BUILD_COMMIT = "localcommit000";
    process.env.BACKSTEROS_BUILD_BUILT_AT = "2026-10-01T12:00:00.000Z";
    process.env.BACKSTEROS_BUILD_DIRTY = "0";
    resetBuildVersionCacheForTests();
  });

  afterEach(() => {
    restoreEnv();
    resetPeerVersionStateForTests();
    resetBuildVersionCacheForTests();
  });

  it("alerts once on mismatch then stays quiet on later ticks", async () => {
    const before = listOpsLogs(50).filter((e) =>
      e.message.includes("version mismatch"),
    ).length;

    const peerBody = {
      ok: true,
      version: {
        commit: "peercommit0000",
        builtAt: "2026-10-01T11:00:00.000Z",
        dirty: false,
      },
    };
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(peerBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const first = await checkPeerBuildVersion({ fetchImpl });
    assert.equal(first.mismatch, true);
    assert.equal(first.peerVersion?.commit, "peercommit0000");

    const afterFirst = listOpsLogs(50).filter((e) =>
      e.message.includes("version mismatch"),
    ).length;
    assert.equal(afterFirst, before + 1);

    await checkPeerBuildVersion({ fetchImpl });
    await checkPeerBuildVersion({ fetchImpl });
    const afterRepeat = listOpsLogs(50).filter((e) =>
      e.message.includes("version mismatch"),
    ).length;
    assert.equal(afterRepeat, before + 1);
  });

  it("clears mismatch when peer matches again", async () => {
    const mismatchBody = {
      ok: true,
      version: {
        commit: "othercommit000",
        builtAt: "2026-10-01T11:00:00.000Z",
        dirty: false,
      },
    };
    const matchBody = {
      ok: true,
      version: {
        commit: "localcommit000",
        builtAt: "2026-10-01T12:00:00.000Z",
        dirty: false,
      },
    };

    await checkPeerBuildVersion({
      fetchImpl: async () =>
        new Response(JSON.stringify(mismatchBody), { status: 200 }),
    });
    assert.equal(getPeerVersionState().mismatch, true);

    const synced = await checkPeerBuildVersion({
      fetchImpl: async () =>
        new Response(JSON.stringify(matchBody), { status: 200 }),
    });
    assert.equal(synced.mismatch, false);
    assert.equal(synced.peerVersion?.commit, "localcommit000");
  });
});
