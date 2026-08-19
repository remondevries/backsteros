import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceMonthlyNextDate,
  buildUpcomingRecurrings,
  groupRecurringsByDate,
  recurringDateGroup,
  upcomingMonthlyPaymentDate,
} from "./finance-recurrings.ts";
import type { FinanceRecurringRow } from "./use-finance-recurrings.ts";

function row(
  partial: Partial<FinanceRecurringRow> & Pick<FinanceRecurringRow, "id">,
): FinanceRecurringRow {
  return {
    name: partial.name ?? partial.id,
    icon: null,
    categoryId: null,
    amountCents: 1000,
    nextDate: null,
    archived: false,
    sortOrder: 0,
    ...partial,
  };
}

describe("advanceMonthlyNextDate", () => {
  it("rolls past months forward", () => {
    const asOf = new Date(2026, 1, 15); // Feb 15 2026
    assert.equal(advanceMonthlyNextDate("2026-01-01", asOf), "2026-02-01");
    assert.equal(advanceMonthlyNextDate("2026-02-01", asOf), "2026-02-01");
  });
});

describe("recurringDateGroup", () => {
  it("classifies this month / future / archived", () => {
    const asOf = new Date(2026, 7, 15); // Aug 15 2026
    assert.equal(
      recurringDateGroup("2026-08-01", false, asOf),
      "this_month",
    );
    assert.equal(recurringDateGroup("2026-09-01", false, asOf), "future");
    assert.equal(recurringDateGroup("2026-08-01", true, asOf), "archived");
  });
});

describe("groupRecurringsByDate", () => {
  it("groups and drops empty buckets", () => {
    const asOf = new Date(2026, 7, 15);
    const groups = groupRecurringsByDate(
      [
        row({ id: "a", nextDate: "2026-08-10" }),
        row({ id: "b", nextDate: "2026-09-01" }),
        row({ id: "c", archived: true, nextDate: "2026-08-01" }),
      ],
      asOf,
    );
    assert.deepEqual(
      groups.map((g) => g.id),
      ["this_month", "future", "archived"],
    );
  });
});

describe("upcomingMonthlyPaymentDate", () => {
  it("keeps today-or-later dates and rolls past days forward a month", () => {
    const asOf = new Date(2026, 7, 15); // Aug 15
    assert.equal(upcomingMonthlyPaymentDate("2026-08-16", asOf), "2026-08-16");
    assert.equal(upcomingMonthlyPaymentDate("2026-08-01", asOf), "2026-09-01");
  });
});

describe("buildUpcomingRecurrings", () => {
  it("keeps active recurrings due within the next two weeks", () => {
    const asOf = new Date(2026, 7, 15);
    const items = buildUpcomingRecurrings(
      [
        row({ id: "soon", nextDate: "2026-08-20", amountCents: 2500 }),
        row({ id: "far", nextDate: "2026-09-10" }),
        row({ id: "done", archived: true, nextDate: "2026-08-16" }),
      ],
      asOf,
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["soon"],
    );
    assert.equal(items[0]!.paymentDate, "2026-08-20");
    assert.equal(items[0]!.amountCents, 2500);
  });
});
