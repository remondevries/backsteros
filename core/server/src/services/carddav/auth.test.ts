import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authenticateCardDavSharedPassword,
  hasCardDavScope,
  parseBasicAuthCredentials,
} from "./auth.js";
import type { AuthContext } from "../../middleware/auth.js";

test("parseBasicAuthCredentials decodes username and password", () => {
  const token = Buffer.from("backsteros:sk_live_testhidden", "utf8").toString(
    "base64",
  );
  const parsed = parseBasicAuthCredentials(`Basic ${token}`);
  assert.deepEqual(parsed, {
    username: "backsteros",
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

test("authenticateCardDavSharedPassword matches CARDDAV_PASSWORD", () => {
  const prev = process.env.CARDDAV_PASSWORD;
  const prevWs = process.env.CARDDAV_WORKSPACE_ID;
  process.env.CARDDAV_PASSWORD = "Ab12Cd34";
  process.env.CARDDAV_WORKSPACE_ID = "ws_test";
  try {
    assert.equal(authenticateCardDavSharedPassword("wrong"), null);
    const ok = authenticateCardDavSharedPassword("Ab12Cd34");
    assert.equal(ok?.apiKeyName, "carddav-shared");
    assert.equal(ok?.workspaceId, "ws_test");
    assert.deepEqual(ok?.scopes, ["carddav"]);
  } finally {
    if (prev === undefined) delete process.env.CARDDAV_PASSWORD;
    else process.env.CARDDAV_PASSWORD = prev;
    if (prevWs === undefined) delete process.env.CARDDAV_WORKSPACE_ID;
    else process.env.CARDDAV_WORKSPACE_ID = prevWs;
  }
});
