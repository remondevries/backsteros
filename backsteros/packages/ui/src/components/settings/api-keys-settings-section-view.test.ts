import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentDragTargetIndex,
  formatMaskedApiKey,
  reorderAgentKeysForDrag,
} from "./api-keys-settings-section-view.js";
import {
  AGENT_API_KEY_SCOPES,
  AGENT_KEY_SCOPES,
  APPLICATION_API_KEY_SCOPE,
  CARDDAV_API_KEY_SCOPE,
  TV_API_KEY_SCOPE,
  classifyApiKeyType,
  scopesForApiKeyTab,
} from "./api-key-type.js";

test("agent drag: down past a midpoint lands after that neighbor (not one past)", () => {
  // Row mids at 50, 150, 250, 350 — drag A (index 0) just below B's mid.
  const slotMids = [50, 150, 250, 350];
  assert.equal(
    agentDragTargetIndex({ clientY: 160, slotMids, fromIndex: 0 }),
    1,
  );
  assert.deepEqual(
    reorderAgentKeysForDrag({
      orderIds: ["a", "b", "c", "d"],
      draggingId: "a",
      clientY: 160,
      slotMids,
    }),
    ["b", "a", "c", "d"],
  );
});

test("agent drag: up past a midpoint lands before that neighbor", () => {
  const slotMids = [50, 150, 250, 350];
  assert.equal(
    agentDragTargetIndex({ clientY: 140, slotMids, fromIndex: 3 }),
    1,
  );
  assert.deepEqual(
    reorderAgentKeysForDrag({
      orderIds: ["a", "b", "c", "d"],
      draggingId: "d",
      clientY: 140,
      slotMids,
    }),
    ["a", "d", "b", "c"],
  );
});

test("agent drag: staying in own slot below the midpoint does not swap", () => {
  const slotMids = [50, 150, 250, 350];
  assert.equal(
    agentDragTargetIndex({ clientY: 80, slotMids, fromIndex: 0 }),
    0,
  );
  assert.deepEqual(
    reorderAgentKeysForDrag({
      orderIds: ["a", "b", "c", "d"],
      draggingId: "a",
      clientY: 80,
      slotMids,
    }),
    ["a", "b", "c", "d"],
  );
});

test("classifyApiKeyType maps exclusive Applications, TV, and CardDAV scopes", () => {
  assert.equal(
    classifyApiKeyType({
      scopes: [APPLICATION_API_KEY_SCOPE],
      contactId: null,
    }),
    "applications",
  );
  assert.equal(
    classifyApiKeyType({
      scopes: [TV_API_KEY_SCOPE],
      contactId: null,
    }),
    "tv",
  );
  assert.equal(
    classifyApiKeyType({
      scopes: [CARDDAV_API_KEY_SCOPE],
      contactId: "c1",
    }),
    "carddav",
  );
});

test("classifyApiKeyType maps contact-bound generic scopes to agent", () => {
  assert.equal(
    classifyApiKeyType({
      scopes: ["tasks:read", "tasks:write"],
      contactId: "c1",
    }),
    "agent",
  );
  assert.equal(
    classifyApiKeyType({
      scopes: [...AGENT_API_KEY_SCOPES, CARDDAV_API_KEY_SCOPE],
      contactId: "c1",
    }),
    "agent",
  );
});

test("classifyApiKeyType maps no-contact generic scopes to access", () => {
  assert.equal(
    classifyApiKeyType({
      scopes: ["tasks:read", "settings:write"],
      contactId: null,
    }),
    "access",
  );
  assert.equal(
    classifyApiKeyType({
      scopes: [...AGENT_API_KEY_SCOPES],
      contactId: null,
    }),
    "access",
  );
});

test("classifyApiKeyType ignores empty or unknown-only scopes", () => {
  assert.equal(
    classifyApiKeyType({ scopes: [], contactId: null }),
    null,
  );
});

test("AGENT_API_KEY_SCOPES excludes door-only scopes", () => {
  assert.equal(
    AGENT_API_KEY_SCOPES.includes(APPLICATION_API_KEY_SCOPE as never),
    false,
  );
  assert.equal(AGENT_API_KEY_SCOPES.includes(TV_API_KEY_SCOPE as never), false);
  assert.equal(
    AGENT_API_KEY_SCOPES.includes(CARDDAV_API_KEY_SCOPE as never),
    false,
  );
  assert.ok(AGENT_API_KEY_SCOPES.includes("tasks:write"));
});

test("OS-146: agent create/detail scopes show chat/email and never settings", () => {
  const agentScopes = scopesForApiKeyTab("agent");
  assert.deepEqual(agentScopes, AGENT_KEY_SCOPES);
  assert.equal(agentScopes.includes("settings:read" as never), false);
  assert.equal(agentScopes.includes("settings:write" as never), false);
  assert.ok(agentScopes.includes("chat:read"));
  assert.ok(agentScopes.includes("chat:write"));
  assert.ok(agentScopes.includes("email:read"));
  assert.ok(agentScopes.includes("email:send"));
  // Access still includes settings (owner), agent detail must use AGENT_KEY_SCOPES.
  assert.ok(AGENT_API_KEY_SCOPES.includes("settings:read"));
  assert.ok(AGENT_API_KEY_SCOPES.includes("settings:write"));
});

test("formatMaskedApiKey keeps the prefix and appends an ellipsis", () => {
  assert.equal(formatMaskedApiKey("sk_live_abcdefgh"), "sk_live_abcdefgh…");
  assert.equal(formatMaskedApiKey("  "), "…");
});
