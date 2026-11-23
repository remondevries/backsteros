import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure helpers for duration merge behavior used by applyEntityTrackedDuration /
 * checkpoint paths. DB integration is covered by migrate + route smoke later.
 */

function sessionShareFromEntityTotal(
  closedSum: number,
  nextEntityTotal: number,
): number {
  return Math.max(0, Math.round(nextEntityTotal) - Math.max(0, closedSum));
}

describe("sessionShareFromEntityTotal", () => {
  it("isolates open-session seconds from closed sum", () => {
    assert.equal(sessionShareFromEntityTotal(100, 150), 50);
  });

  it("clamps when entity total is below closed sum", () => {
    assert.equal(sessionShareFromEntityTotal(100, 80), 0);
  });
});
