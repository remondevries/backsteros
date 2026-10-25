import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_API_KEY_SCOPES,
  APPLICATION_API_KEY_SCOPE,
  CARDDAV_API_KEY_SCOPE,
  TV_API_KEY_SCOPE,
  classifyApiKeyType,
  formatMaskedApiKey,
} from "./api-keys-settings-section-view.js";

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

test("classifyApiKeyType maps generic scopes to agent", () => {
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
      contactId: null,
    }),
    "agent",
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

test("formatMaskedApiKey keeps the prefix and appends an ellipsis", () => {
  assert.equal(formatMaskedApiKey("sk_live_abcdefgh"), "sk_live_abcdefgh…");
  assert.equal(formatMaskedApiKey("  "), "…");
});
