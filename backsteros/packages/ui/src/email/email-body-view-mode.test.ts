import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_BODY_VIEW_MODE_ORDER,
  getAdjacentEmailBodyViewMode,
} from "./email-body-view-mode.js";

describe("email body view mode helpers", () => {
  it("orders plain → rendered → source", () => {
    assert.deepEqual(EMAIL_BODY_VIEW_MODE_ORDER, ["plain", "rendered", "source"]);
  });

  it("cycles forward and backward", () => {
    assert.equal(getAdjacentEmailBodyViewMode("plain", "right"), "rendered");
    assert.equal(getAdjacentEmailBodyViewMode("rendered", "right"), "source");
    assert.equal(getAdjacentEmailBodyViewMode("source", "right"), "plain");
    assert.equal(getAdjacentEmailBodyViewMode("plain", "left"), "source");
    assert.equal(getAdjacentEmailBodyViewMode("rendered", "left"), "plain");
  });
});
