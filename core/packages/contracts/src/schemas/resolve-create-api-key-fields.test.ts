import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_API_KEY_SCOPES,
  resolveCreateApiKeyFields,
} from "./common.js";

test("access persists requested scopes exactly (OS-182)", () => {
  const result = resolveCreateApiKeyFields({
    kind: "access",
    contactId: "ignored",
    scopes: ["tasks:read"],
  });
  assert.equal(result.contactId, null);
  assert.deepEqual(result.scopes, ["tasks:read"]);
});

test("access full owner set when every non-door scope is requested", () => {
  const result = resolveCreateApiKeyFields({
    kind: "access",
    contactId: null,
    scopes: [...AGENT_API_KEY_SCOPES],
  });
  assert.deepEqual(result.scopes, [...AGENT_API_KEY_SCOPES]);
});

test("access rejects door scopes and empty lists", () => {
  assert.throws(
    () =>
      resolveCreateApiKeyFields({
        kind: "access",
        contactId: null,
        scopes: ["tasks:read", "applications"],
      }),
    /ACCESS_SCOPES_INVALID/,
  );
  assert.throws(
    () =>
      resolveCreateApiKeyFields({
        kind: "access",
        contactId: null,
        scopes: [],
      }),
    /ACCESS_SCOPES_REQUIRED/,
  );
});

test("access dedupes while preserving order", () => {
  const result = resolveCreateApiKeyFields({
    kind: "access",
    contactId: null,
    scopes: ["tasks:write", "tasks:read", "tasks:write"],
  });
  assert.deepEqual(result.scopes, ["tasks:write", "tasks:read"]);
});

test("agent requires contact and strips settings:read/write", () => {
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
    scopes: [
      "tasks:read",
      "settings:read",
      "settings:write",
      "applications",
      "chat:write",
      "email:send",
    ],
  });
  assert.equal(result.contactId, "c1");
  assert.deepEqual(result.scopes, ["tasks:read", "chat:write", "email:send"]);
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
