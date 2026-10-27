import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveContactXUserIdFill } from "./chat-service.js";

describe("resolveContactXUserIdFill", () => {
  it("fills when the BacksterOS contact has no xUserId", () => {
    assert.deepEqual(
      resolveContactXUserIdFill(null, {
        identifier: null,
        customAttributes: { x_user_id: "50254162" },
      }),
      { action: "set", value: "50254162" },
    );
    assert.deepEqual(
      resolveContactXUserIdFill("", {
        identifier: "50254162",
        customAttributes: null,
      }),
      { action: "set", value: "50254162" },
    );
  });

  it("skips when the existing value already matches", () => {
    assert.deepEqual(
      resolveContactXUserIdFill("50254162", {
        identifier: "50254162",
        customAttributes: { x_user_id: "50254162" },
      }),
      { action: "skip" },
    );
  });

  it("never overwrites a differing existing xUserId", () => {
    assert.deepEqual(
      resolveContactXUserIdFill("11111111", {
        identifier: "50254162",
        customAttributes: { x_user_id: "50254162" },
      }),
      { action: "skip" },
    );
  });

  it("ignores @handles and non-numeric identifiers", () => {
    assert.deepEqual(
      resolveContactXUserIdFill(null, {
        identifier: "@remondevries",
        customAttributes: null,
      }),
      { action: "skip" },
    );
  });
});
