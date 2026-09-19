import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertVaultRelativeKeyForTests,
  isUsableAbsoluteVaultPathForTests,
  selectDesktopVaultRoot,
} from "./desktop-vault.ts";

test("isUsableAbsoluteVaultPathForTests accepts unix and windows roots", () => {
  assert.equal(isUsableAbsoluteVaultPathForTests("/Users/me/BacksterOS"), true);
  assert.equal(isUsableAbsoluteVaultPathForTests("C:\\Vault"), true);
  assert.equal(isUsableAbsoluteVaultPathForTests("relative/path"), false);
  assert.equal(isUsableAbsoluteVaultPathForTests(""), false);
});

test("selectDesktopVaultRoot ignores cloud API paths", () => {
  assert.equal(
    selectDesktopVaultRoot({
      persisted: null,
      envPath: null,
      apiPath: "/var/lib/backsteros-vault",
      adoptApiPath: false,
    }),
    null,
  );
  assert.equal(
    selectDesktopVaultRoot({
      persisted: "/Users/me/BacksterOS",
      envPath: null,
      apiPath: "/var/lib/backsteros-vault",
      adoptApiPath: false,
    }),
    "/Users/me/BacksterOS",
  );
  assert.equal(
    selectDesktopVaultRoot({
      persisted: null,
      envPath: null,
      apiPath: "/Users/me/BacksterOS",
      adoptApiPath: true,
    }),
    "/Users/me/BacksterOS",
  );
});
test("assertVaultRelativeKeyForTests rejects traversal and absolute keys", () => {
  assert.equal(
    assertVaultRelativeKeyForTests("Spaces/support/portal/email/overview.md"),
    "Spaces/support/portal/email/overview.md",
  );
  assert.throws(() => assertVaultRelativeKeyForTests("../etc/passwd"));
  assert.throws(() => assertVaultRelativeKeyForTests("/etc/passwd"));
  assert.throws(() => assertVaultRelativeKeyForTests(""));
});
