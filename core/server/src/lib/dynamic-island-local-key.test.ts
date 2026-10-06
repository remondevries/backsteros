import assert from "node:assert/strict";
import test from "node:test";

import {
  DYNAMIC_ISLAND_API_KEY_NAME,
  DYNAMIC_ISLAND_DEFAULT_API_URL,
  DYNAMIC_ISLAND_SCOPES,
  isPairFlowIslandKey,
} from "./dynamic-island-local-key-format.js";

test("Dynamic Island pair key is named and read-only", () => {
  assert.equal(DYNAMIC_ISLAND_API_KEY_NAME, "dynamic-island");
  assert.deepEqual([...DYNAMIC_ISLAND_SCOPES].sort(), [
    "projects:read",
    "tasks:read",
  ]);
  assert.equal(DYNAMIC_ISLAND_DEFAULT_API_URL, "http://127.0.0.1:8788");
  assert.equal(
    DYNAMIC_ISLAND_SCOPES.some((scope) => scope.endsWith(":write")),
    false,
  );
});

test("isPairFlowIslandKey requires exact scopes and no contactId", () => {
  assert.equal(
    isPairFlowIslandKey({
      contactId: null,
      scopes: ["tasks:read", "projects:read"],
    }),
    true,
  );
  assert.equal(
    isPairFlowIslandKey({
      contactId: null,
      scopes: ["projects:read", "tasks:read"],
    }),
    true,
  );
  assert.equal(
    isPairFlowIslandKey({
      contactId: null,
      scopes: [...DYNAMIC_ISLAND_SCOPES, "settings:read"],
    }),
    false,
  );
  assert.equal(
    isPairFlowIslandKey({
      contactId: "contact-1",
      scopes: [...DYNAMIC_ISLAND_SCOPES],
    }),
    false,
  );
});
