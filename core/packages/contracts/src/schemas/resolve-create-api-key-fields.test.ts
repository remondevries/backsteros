import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_API_KEY_SCOPES,
  resolveCreateApiKeyFields,
} from "./common.js";

test("access always gets full owner scopes and null contact", () => {
  const result = resolveCreateApiKeyFields({
    kind: "access",
    contactId: "ignored",
    scopes: ["tasks:read"],
  });
  assert.equal(result.contactId, null);
  assert.deepEqual(result.scopes, [...AGENT_API_KEY_SCOPES]);
});

test("agent requires contact and strips settings:write", () => {
  assert.throws(
    () =>
      resolveCreateApiKeyFields({
        kind: "agent",
        contactId: null,
        scopes: ["tasks:read"],
      }),
    /AGENT_CONTACT_REQUIRED/,
  );

  const result = resolveCreateApiKeyFields({
    kind: "agent",
    contactId: "c1",
    scopes: ["tasks:read", "settings:write", "applications"],
  });
  assert.equal(result.contactId, "c1");
  assert.deepEqual(result.scopes, ["tasks:read"]);
});

test("door kinds are exclusive single scopes", () => {
  assert.deepEqual(
    resolveCreateApiKeyFields({
      kind: "tv",
      contactId: null,
      scopes: ["tasks:read"],
    }),
    { contactId: null, scopes: ["tv.today_counts"] },
  );
});
