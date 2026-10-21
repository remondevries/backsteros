import assert from "node:assert/strict";
import { test } from "node:test";

import { hasCardDavScope, parseBasicAuthCredentials } from "./auth.js";
import type { AuthContext } from "../../middleware/auth.js";

test("parseBasicAuthCredentials decodes username and password", () => {
  const token = Buffer.from("carddav:sk_live_testhidden", "utf8").toString(
    "base64",
  );
  const parsed = parseBasicAuthCredentials(`Basic ${token}`);
  assert.deepEqual(parsed, {
    username: "carddav",
    password: "sk_live_testhidden",
  });
});

test("parseBasicAuthCredentials rejects non-basic", () => {
  assert.equal(parseBasicAuthCredentials("Bearer sk_live_x"), null);
  assert.equal(parseBasicAuthCredentials(undefined), null);
});

test("hasCardDavScope requires carddav scope for api keys", () => {
  const auth = {
    kind: "api_key",
    userId: null,
    clerkUserId: null,
    apiKeyId: "k1",
    contactId: null,
    workspaceId: "ws1",
    membershipRole: null,
    scopes: ["contacts:read", "contacts:write"],
  } as AuthContext;
  assert.equal(hasCardDavScope(auth), false);
  assert.equal(hasCardDavScope({ ...auth, scopes: ["carddav"] }), true);
});
