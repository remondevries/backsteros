import assert from "node:assert/strict";
import { test } from "node:test";

import {
  preferWorkedStartedAt,
  resolveTurnWorkingStartedAt,
} from "./agent-chat-work-ui.ts";

test("preferWorkedStartedAt keeps the later start", () => {
  assert.equal(preferWorkedStartedAt(1_000, 50_000), 50_000);
  assert.equal(preferWorkedStartedAt(null, 50_000), 50_000);
  assert.equal(preferWorkedStartedAt(1_000, null), 1_000);
  assert.equal(preferWorkedStartedAt(undefined, undefined), null);
});

test("resolveTurnWorkingStartedAt trusts user prompt over ancient workedStartedAt", () => {
  const userCreatedAt = Date.now() - 10 * 60_000;
  const ancient = userCreatedAt - 49 * 3600_000;
  assert.equal(
    resolveTurnWorkingStartedAt({
      workedStartedAt: ancient,
      userCreatedAt,
    }),
    userCreatedAt,
  );
  assert.equal(
    resolveTurnWorkingStartedAt({
      workedStartedAt: userCreatedAt - 5_000,
      userCreatedAt,
    }),
    userCreatedAt - 5_000,
  );
});
