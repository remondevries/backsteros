import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  API_KEY_SCOPES,
  createApiKeySchema,
  hasFullAccessApiKeyScopes,
  isAccessApiKey,
  isExclusiveDoorApiKeyScopes,
  sanitizeAgentKeyScopes,
} from "./common.js";

test("AGENT_API_KEY_SCOPES excludes exclusive door scopes", () => {
  assert.ok(AGENT_API_KEY_SCOPES.includes("settings:write"));
  assert.ok(AGENT_API_KEY_SCOPES.includes("tasks:write"));
  assert.equal(
    AGENT_API_KEY_SCOPES.includes("applications" as never),
    false,
  );
  assert.equal(AGENT_API_KEY_SCOPES.length + 3, API_KEY_SCOPES.length);
});

test("AGENT_KEY_SCOPES never includes settings:read or settings:write", () => {
  assert.equal(AGENT_KEY_SCOPES.includes("settings:write" as never), false);
  assert.equal(AGENT_KEY_SCOPES.includes("settings:read" as never), false);
  assert.ok(AGENT_KEY_SCOPES.includes("tasks:write"));
  assert.ok(AGENT_KEY_SCOPES.includes("chat:read"));
  assert.ok(AGENT_KEY_SCOPES.includes("chat:write"));
  assert.ok(AGENT_KEY_SCOPES.includes("email:read"));
  assert.ok(AGENT_KEY_SCOPES.includes("email:send"));
  assert.deepEqual(
    sanitizeAgentKeyScopes([
      "tasks:read",
      "settings:read",
      "settings:write",
      "applications",
      "chat:write",
    ]),
    ["tasks:read", "chat:write"],
  );
});

test("createApiKeySchema requires kind and agent contact", () => {
  const missingKind = createApiKeySchema.safeParse({
    name: "x",
    scopes: ["tasks:read"],
  });
  assert.equal(missingKind.success, false);

  const agentNoContact = createApiKeySchema.safeParse({
    name: "x",
    kind: "agent",
    scopes: ["tasks:read"],
  });
  assert.equal(agentNoContact.success, false);

  const accessOk = createApiKeySchema.safeParse({
    name: "Macbook",
    kind: "access",
    scopes: ["tasks:read"],
  });
  assert.equal(accessOk.success, true);

  const agentOk = createApiKeySchema.safeParse({
    name: "Ralph",
    kind: "agent",
    contactId: "c1",
    scopes: ["tasks:read", "settings:write"],
  });
  assert.equal(agentOk.success, true);
});

test("isAccessApiKey requires no contact and non-door scopes", () => {
  assert.equal(
    isAccessApiKey({ contactId: null, scopes: ["tasks:read"] }),
    true,
  );
  assert.equal(
    isAccessApiKey({ contactId: "c1", scopes: ["tasks:read"] }),
    false,
  );
  assert.equal(
    isAccessApiKey({ contactId: null, scopes: ["applications"] }),
    false,
  );
  assert.equal(isExclusiveDoorApiKeyScopes(["applications"]), true);
});

test("hasFullAccessApiKeyScopes requires every owner scope", () => {
  assert.equal(hasFullAccessApiKeyScopes([...AGENT_API_KEY_SCOPES]), true);
  assert.equal(hasFullAccessApiKeyScopes(["tasks:read"]), false);
});
