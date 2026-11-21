import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  API_KEY_SCOPES,
  APPLICATIONS_API_KEY_MARKER_SCOPE,
  APPLICATIONS_API_KEY_SCOPES,
  createApiKeySchema,
  hasFullAccessApiKeyScopes,
  isAccessApiKey,
  isApplicationsApiKey,
  isExclusiveDoorApiKeyScopes,
  resolveCreateApiKeyFields,
  sanitizeAgentKeyScopes,
  sanitizeApplicationsKeyScopes,
} from "./common.js";

test("AGENT_API_KEY_SCOPES excludes exclusive doors and marker scopes", () => {
  assert.ok(AGENT_API_KEY_SCOPES.includes("settings:write"));
  assert.ok(AGENT_API_KEY_SCOPES.includes("tasks:write"));
  assert.equal(
    AGENT_API_KEY_SCOPES.includes("applications" as never),
    false,
  );
  assert.equal(AGENT_API_KEY_SCOPES.includes("portal" as never), false);
  assert.equal(AGENT_API_KEY_SCOPES.includes("carddav" as never), false);
  assert.equal(AGENT_API_KEY_SCOPES.includes("tv.today_counts" as never), false);
  // 2 exclusive doors + portal + applications markers
  assert.equal(AGENT_API_KEY_SCOPES.length + 4, API_KEY_SCOPES.length);
});

test("APPLICATIONS_API_KEY_SCOPES is data-only (no settings)", () => {
  assert.equal(
    APPLICATIONS_API_KEY_SCOPES.includes("settings:write" as never),
    false,
  );
  assert.equal(
    APPLICATIONS_API_KEY_SCOPES.includes("settings:read" as never),
    false,
  );
  assert.ok(APPLICATIONS_API_KEY_SCOPES.includes("tasks:write"));
  assert.ok(APPLICATIONS_API_KEY_SCOPES.includes("projects:read"));
  assert.ok(APPLICATIONS_API_KEY_SCOPES.includes("finance:write"));
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

test("isAccessApiKey excludes Applications marker and exclusive doors", () => {
  assert.equal(
    isAccessApiKey({ contactId: null, scopes: ["tasks:read"] }),
    true,
  );
  assert.equal(
    isAccessApiKey({ contactId: "c1", scopes: ["tasks:read"] }),
    false,
  );
  assert.equal(
    isAccessApiKey({
      contactId: null,
      scopes: ["tasks:read", APPLICATIONS_API_KEY_MARKER_SCOPE],
    }),
    false,
  );
  assert.equal(isExclusiveDoorApiKeyScopes(["applications"]), false);
  assert.equal(isExclusiveDoorApiKeyScopes(["tv.today_counts"]), true);
});

test("isApplicationsApiKey requires marker and no contact", () => {
  assert.equal(
    isApplicationsApiKey({
      contactId: null,
      scopes: ["tasks:read", APPLICATIONS_API_KEY_MARKER_SCOPE],
    }),
    true,
  );
  assert.equal(
    isApplicationsApiKey({
      contactId: null,
      scopes: [APPLICATIONS_API_KEY_MARKER_SCOPE],
    }),
    true,
  );
  assert.equal(
    isApplicationsApiKey({ contactId: null, scopes: ["tasks:read"] }),
    false,
  );
});

test("sanitizeApplicationsKeyScopes widens marker-only and rejects settings", () => {
  assert.deepEqual(sanitizeApplicationsKeyScopes([]), [
    ...APPLICATIONS_API_KEY_SCOPES,
    APPLICATIONS_API_KEY_MARKER_SCOPE,
  ]);
  assert.deepEqual(sanitizeApplicationsKeyScopes(["applications"]), [
    ...APPLICATIONS_API_KEY_SCOPES,
    APPLICATIONS_API_KEY_MARKER_SCOPE,
  ]);
  assert.deepEqual(
    sanitizeApplicationsKeyScopes(["tasks:read", "projects:write"]),
    ["tasks:read", "projects:write", APPLICATIONS_API_KEY_MARKER_SCOPE],
  );
  assert.throws(
    () => sanitizeApplicationsKeyScopes(["tasks:read", "settings:write"]),
    /APPLICATIONS_SCOPES_INVALID/,
  );
});

test("resolveCreateApiKeyFields applications mints data scopes + marker", () => {
  const result = resolveCreateApiKeyFields({
    kind: "applications",
    contactId: null,
    scopes: [],
  });
  assert.equal(result.contactId, null);
  assert.ok(result.scopes.includes("tasks:write"));
  assert.ok(result.scopes.includes(APPLICATIONS_API_KEY_MARKER_SCOPE));
  assert.equal(result.scopes.includes("settings:write" as never), false);
});

test("hasFullAccessApiKeyScopes requires every owner scope", () => {
  assert.equal(hasFullAccessApiKeyScopes([...AGENT_API_KEY_SCOPES]), true);
  assert.equal(hasFullAccessApiKeyScopes(["tasks:read"]), false);
});
