import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  flattenTransactionGroups,
  groupTransactionsByMonthWeek,
  summarizeMonthAmounts,
} from "./group-transactions-by-month-week.ts";

describe("groupTransactionsByMonthWeek", () => {
  it("groups by month then Monday-start week, newest first", () => {
    const groups = groupTransactionsByMonthWeek([
      { id: "a", bookedOn: "2026-07-01" }, // Wed → week of Jun 29
      { id: "b", bookedOn: "2026-07-22" }, // Wed → week of Jul 20
      { id: "c", bookedOn: "2026-06-30" }, // Tue → week of Jun 29
    ]);
    assert.equal(groups[0]!.monthKey, "2026-07");
    assert.equal(groups[1]!.monthKey, "2026-06");
    assert.equal(groups[0]!.label, "July 2026");
    assert.equal(groups[0]!.weeks[0]!.label, "Week of Jul 20");
    assert.equal(
      groups[0]!.weeks
        .flatMap((w) => w.items)
        .map((i) => i.id)
        .sort()
        .join(","),
      "a,b",
    );
  });
});

describe("flattenTransactionGroups", () => {
  const rows = [
    {
      id: "a",
      bookedOn: "2026-07-01",
      amountCents: -500,
      currency: "EUR",
    },
    {
      id: "b",
      bookedOn: "2026-07-22",
      amountCents: 1200,
      currency: "EUR",
    },
    {
      id: "c",
      bookedOn: "2026-06-30",
      amountCents: -100,
      currency: "EUR",
    },
  ];

  it("phone: month headers only (no week rows)", () => {
    const entries = flattenTransactionGroups(
      groupTransactionsByMonthWeek(rows),
      { includeWeeks: false },
    );
    assert.deepEqual(
      entries.map((e) => e.kind),
      ["month", "transaction", "transaction", "month", "transaction"],
    );
    assert.equal(entries.filter((e) => e.kind === "week").length, 0);
  });

  it("iPad: month + week headers", () => {
    const entries = flattenTransactionGroups(
      groupTransactionsByMonthWeek(rows),
      { includeWeeks: true },
    );
    assert.ok(entries.some((e) => e.kind === "week"));
    assert.equal(entries[0]!.kind, "month");
    assert.equal(entries[1]!.kind, "week");
  });

  it("omits nested rows when a month is collapsed", () => {
    const entries = flattenTransactionGroups(
      groupTransactionsByMonthWeek(rows),
      {
        includeWeeks: false,
        collapsedMonths: new Set(["2026-07"]),
      },
    );
    assert.deepEqual(
      entries.map((e) => (e.kind === "month" ? e.monthKey : e.kind)),
      ["2026-07", "2026-06", "transaction"],
    );
  });

  it("omits week transactions when a week is collapsed", () => {
    const groups = groupTransactionsByMonthWeek(rows);
    const week = groups[0]!.weeks[0]!;
    const weekEntryKey = `week:${groups[0]!.monthKey}:${week.weekKey}`;
    const collapsedIds = new Set(week.items.map((tx) => tx.id));
    const entries = flattenTransactionGroups(groups, {
      includeWeeks: true,
      collapsedWeeks: new Set([weekEntryKey]),
    });
    assert.ok(entries.some((e) => e.kind === "week" && e.key === weekEntryKey));
    for (const entry of entries) {
      if (entry.kind === "transaction") {
        assert.equal(collapsedIds.has(entry.transaction.id), false);
      }
    }
  });

  it("uses unique week keys when a week straddles two months", () => {
    const entries = flattenTransactionGroups(
      groupTransactionsByMonthWeek([
        {
          id: "jun",
          bookedOn: "2026-06-30",
          amountCents: -100,
          currency: "EUR",
        },
        {
          id: "jul",
          bookedOn: "2026-07-01",
          amountCents: -200,
          currency: "EUR",
        },
      ]),
      { includeWeeks: true },
    );
    const weekKeys = entries
      .filter((e) => e.kind === "week")
      .map((e) => e.key);
    assert.equal(new Set(weekKeys).size, weekKeys.length);
    assert.ok(weekKeys.some((key) => key.startsWith("week:2026-06:")));
    assert.ok(weekKeys.some((key) => key.startsWith("week:2026-07:")));
  });
});

describe("summarizeMonthAmounts", () => {
  it("sums income and spend in the dominant currency", () => {
    const totals = summarizeMonthAmounts([
      { amountCents: 1000, currency: "EUR" },
      { amountCents: -400, currency: "EUR" },
      { amountCents: 50, currency: "USD" },
    ]);
    assert.equal(totals.currency, "EUR");
    assert.equal(totals.incomeCents, 1000);
    assert.equal(totals.spendCents, -400);
    assert.equal(totals.balanceCents, 600);
  });
});
