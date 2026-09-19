import assert from "node:assert/strict";
import test from "node:test";

import {
  blobReadsRequireLocalCore,
  isR2Configured,
  readR2Config,
  shouldRefreshLocalFromRemote,
} from "./r2-object-store.js";

const sampleEnv = {
  BACKSTEROS_R2_BUCKET: "backsteros-files",
  BACKSTEROS_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  BACKSTEROS_R2_ACCESS_KEY_ID: "key",
  BACKSTEROS_R2_SECRET_ACCESS_KEY: "secret",
} as NodeJS.ProcessEnv;

test("readR2Config requires the private bucket credentials", () => {
  assert.equal(readR2Config({}), null);
  assert.equal(isR2Configured({}), false);
  assert.equal(readR2Config(sampleEnv)?.bucket, "backsteros-files");
  assert.equal(readR2Config(sampleEnv)?.region, "auto");
});

test("blobReadsRequireLocalCore is only the cloud host without R2", () => {
  assert.equal(blobReadsRequireLocalCore({}), false);
  assert.equal(
    blobReadsRequireLocalCore({ CORE_REPLICATION_ROLE: "cloud" }),
    true,
  );
  assert.equal(
    blobReadsRequireLocalCore({
      ...sampleEnv,
      CORE_REPLICATION_ROLE: "cloud",
    }),
    false,
  );
  assert.equal(
    blobReadsRequireLocalCore({ ...sampleEnv, CORE_REPLICATION_ROLE: "local" }),
    false,
  );
});

test("shouldRefreshLocalFromRemote ignores our own upload skew", () => {
  assert.equal(shouldRefreshLocalFromRemote(null, 5_000), true);
  assert.equal(shouldRefreshLocalFromRemote(1_000, null), false);
  assert.equal(shouldRefreshLocalFromRemote(10_000, 10_500), false);
  assert.equal(shouldRefreshLocalFromRemote(10_000, 13_000), true);
  assert.equal(shouldRefreshLocalFromRemote(20_000, 10_000), false);
});
