import assert from "node:assert/strict";
import { test } from "node:test";

import {
  API_KEY_SECRET_PREFIX_BY_KIND,
  apiKeyCreateKindFromIdentity,
  isApiKeySecretFormat,
  isOwnerApiKeySecretFormat,
  matchApiKeySecretPrefix,
} from "./common.js";

test("matchApiKeySecretPrefix prefers the longest typed prefix", () => {
  assert.equal(
    matchApiKeySecretPrefix("sk_applications_zzzz"),
    API_KEY_SECRET_PREFIX_BY_KIND.applications,
  );
  assert.equal(matchApiKeySecretPrefix("sk_live_zzzz"), "sk_live_");
  assert.equal(matchApiKeySecretPrefix("sk_contacts_zzzz"), "sk_contacts_");
  assert.equal(matchApiKeySecretPrefix("nope"), null);
});

test("owner format accepts access + legacy only", () => {
  assert.equal(isOwnerApiKeySecretFormat("sk_access_x"), true);
  assert.equal(isOwnerApiKeySecretFormat("sk_live_x"), true);
  assert.equal(isOwnerApiKeySecretFormat("sk_agent_x"), false);
  assert.equal(isApiKeySecretFormat("sk_agent_x"), true);
});

test("apiKeyCreateKindFromIdentity maps door and contact rows", () => {
  assert.equal(
    apiKeyCreateKindFromIdentity({
      contactId: null,
      scopes: ["tv.today_counts"],
    }),
    "tv",
  );
  assert.equal(
    apiKeyCreateKindFromIdentity({
      contactId: "c1",
      scopes: ["tasks:read"],
    }),
    "agent",
  );
  assert.equal(
    apiKeyCreateKindFromIdentity({
      contactId: null,
      scopes: ["tasks:read", "settings:write"],
    }),
    "access",
  );
});
