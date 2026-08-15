import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupTransactionsByMonthWeek } from "./group-transactions-by-month-week.js";

describe("groupTransactionsByMonthWeek", () => {
  it("groups by month then Monday-start week, newest first", () => {
    const groups = groupTransactionsByMonthWeek([
      { id: "a", bookedOn: "2026-07-01" }, // Wed
      { id: "b", bookedOn: "2026-07-22" }, // Wed
      { id: "c", bookedOn: "2026-06-30" }, // Tue
    ]);
    assert.equal(groups[0]!.monthKey, "2026-07");
    assert.equal(groups[1]!.monthKey, "2026-06");
    assert.ok(groups[0]!.weeks[0]!.weekKey <= "2026-07-22");
    assert.equal(
      groups[0]!.weeks.flatMap((w) => w.items).map((i) => i.id).sort().join(","),
      "a,b",
    );
  });
});
