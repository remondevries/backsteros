import assert from "node:assert/strict";
import test from "node:test";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import {
  isTvTodayCountsAuth,
  isTvTodayCountsKey,
  TV_TODAY_COUNTS_SCOPE,
} from "./tv-today-counts-auth.js";

test("isTvTodayCountsKey requires exclusive tv.today_counts scope", () => {
  assert.equal(isTvTodayCountsKey([TV_TODAY_COUNTS_SCOPE]), true);
  assert.equal(isTvTodayCountsKey(["tasks:read"]), false);
  assert.equal(isTvTodayCountsKey([...API_KEY_SCOPES]), false);
  assert.equal(
    isTvTodayCountsKey([TV_TODAY_COUNTS_SCOPE, "tasks:read"]),
    false,
  );
  assert.equal(isTvTodayCountsKey([]), false);
  assert.equal(isTvTodayCountsKey(null), false);
});

test("isTvTodayCountsAuth rejects non-api-key and broad keys", () => {
  const base: AuthContext = {
    kind: "api_key",
    userId: "u1",
    clerkUserId: null,
    apiKeyId: "k1",
    apiKeyName: "tv",
    contactId: null,
    workspaceId: "ws1",
    membershipRole: null,
    scopes: [TV_TODAY_COUNTS_SCOPE],
  };
  assert.equal(isTvTodayCountsAuth(base), true);
  assert.equal(
    isTvTodayCountsAuth({ ...base, scopes: ["tasks:read", "projects:read"] }),
    false,
  );
  assert.equal(
    isTvTodayCountsAuth({ ...base, kind: "local_shell", scopes: [] }),
    false,
  );
  assert.equal(isTvTodayCountsAuth(null), false);
});
