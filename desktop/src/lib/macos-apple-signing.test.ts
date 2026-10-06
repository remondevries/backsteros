import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeEnvFromFiles,
  parseDotEnv,
  redactedEnvSummary,
  resolveAppleSigning,
} from "../../scripts/apple-signing.mjs";

const EXAMPLE_IDENTITY = "Developer ID Application: Example Dev (ABCDE12345)";

test("parseDotEnv ignores comments and strips quotes", () => {
  const parsed = parseDotEnv(`
# secret
APPLE_SIGNING_IDENTITY="${EXAMPLE_IDENTITY}"
APPLE_API_KEY=ABC123
EMPTY=
`);
  assert.equal(parsed.APPLE_SIGNING_IDENTITY, EXAMPLE_IDENTITY);
  assert.equal(parsed.APPLE_API_KEY, "ABC123");
  assert.equal(parsed.EMPTY, "");
});

test("mergeEnvFromFiles does not override process env with file values", () => {
  const merged = mergeEnvFromFiles(
    { APPLE_SIGNING_IDENTITY: "from-shell", APPLE_TEAM_ID: "" },
    [
      {
        path: "apple-developer.env",
        text: "APPLE_SIGNING_IDENTITY=from-file\nAPPLE_TEAM_ID=ABCDE12345\n",
      },
    ],
  );
  assert.equal(merged.APPLE_SIGNING_IDENTITY, "from-shell");
  assert.equal(merged.APPLE_TEAM_ID, "ABCDE12345");
});

test("ad-hoc when identity is unset", () => {
  const resolved = resolveAppleSigning({});
  assert.equal(resolved.signingIdentity, null);
  assert.equal(resolved.distributionReady, false);
  assert.equal(resolved.notarization, "none");
  assert.equal(resolved.errors.length, 0);
});

test("Apple Development cannot notarize", () => {
  const resolved = resolveAppleSigning({
    APPLE_SIGNING_IDENTITY: "Apple Development: accounts@example.com (ABCDE12345)",
    APPLE_API_ISSUER: "issuer-uuid",
    APPLE_API_KEY: "KEYID",
  });
  assert.equal(resolved.distributionReady, false);
  assert.match(resolved.errors.join(" "), /Apple Development/);
});

test("Developer ID plus API key is distribution-ready", () => {
  const resolved = resolveAppleSigning({
    APPLE_SIGNING_IDENTITY: EXAMPLE_IDENTITY,
    APPLE_API_ISSUER: "issuer-uuid",
    APPLE_API_KEY: "KEYID",
    APPLE_API_KEY_PATH: "/tmp/AuthKey_KEYID.p8",
  });
  assert.equal(resolved.distributionReady, true);
  assert.equal(resolved.notarization, "api-key");
  assert.equal(resolved.errors.length, 0);
});

test("notarization credentials without identity is an error", () => {
  const resolved = resolveAppleSigning({
    APPLE_ID: "dev@example.com",
    APPLE_PASSWORD: "app-specific",
    APPLE_TEAM_ID: "ABCDE12345",
  });
  assert.equal(resolved.distributionReady, false);
  assert.match(resolved.errors.join(" "), /APPLE_SIGNING_IDENTITY/);
});

test("redactedEnvSummary masks emails, ids, and Team IDs", () => {
  const lines = redactedEnvSummary({
    APPLE_SIGNING_IDENTITY: EXAMPLE_IDENTITY,
    APPLE_PASSWORD: "super-secret",
    APPLE_ID: "alice@example.com",
    APPLE_TEAM_ID: "ABCDE12345",
    APPLE_API_KEY: "KEYID99ZZ",
    APPLE_API_ISSUER: "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001",
  });
  assert.deepEqual(lines, [
    "APPLE_SIGNING_IDENTITY=Developer ID Application: Example Dev (…2345)",
    "APPLE_TEAM_ID=…2345",
    "APPLE_API_ISSUER=…0001",
    "APPLE_API_KEY=…99ZZ",
    "APPLE_ID=a***@example.com",
  ]);
  assert.ok(!lines.some((line) => line.includes("super-secret")));
  assert.ok(!lines.some((line) => line.includes("alice@example.com")));
  assert.ok(!lines.some((line) => line.includes("ABCDE12345")));
});
