import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldLiveUpdateAgentMail } from "./agentmail-live.ts";

test("inbox live follows the keep-alive store, not a stale router path", () => {
  assert.equal(shouldLiveUpdateAgentMail("inbox", "/calendar"), true);
  assert.equal(shouldLiveUpdateAgentMail("calendar", "/inbox"), false);
  assert.equal(shouldLiveUpdateAgentMail("tasks-list", "/inbox/in-1"), false);
});

test("email and compose stay live only on Outlet (visible null)", () => {
  assert.equal(shouldLiveUpdateAgentMail(null, "/email/box/msg"), true);
  assert.equal(
    shouldLiveUpdateAgentMail(null, "/desktop-overlay/compose"),
    true,
  );
  assert.equal(shouldLiveUpdateAgentMail(null, "/tasks"), false);
  assert.equal(shouldLiveUpdateAgentMail("inbox", "/email/box/msg"), true);
});
