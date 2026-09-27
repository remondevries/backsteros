import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  coerceProjectBudgetEntries,
  normalizeProjectBudgetEntries,
  projectBudgetForPeriod,
  projectBudgetRowsForEditor,
  projectSpendCentsFromTrackedSeconds,
} from "./project-budgets.js";

describe("project budgets", () => {
  it("coerces PowerSync JSON text", () => {
    assert.deepEqual(
      coerceProjectBudgetEntries(
        '[{"period":"monthly","amountCents":500000},{"period":"weekly","amountCents":0}]',
      ),
      [{ period: "monthly", amountCents: 500_000 }],
    );
  });

  it("keeps an empty draft row for the editor", () => {
    assert.deepEqual(projectBudgetRowsForEditor([]), [
      { period: "monthly", amountCents: null },
    ]);
  });

  it("drops empty drafts when normalizing", () => {
    assert.deepEqual(
      normalizeProjectBudgetEntries([
        { period: "weekly", amountCents: 12_500 },
        { period: "monthly", amountCents: null },
      ]),
      [{ period: "weekly", amountCents: 12_500 }],
    );
  });

  it("keeps only the first filled budget row", () => {
    assert.deepEqual(
      normalizeProjectBudgetEntries([
        { period: "weekly", amountCents: 12_500 },
        { period: "monthly", amountCents: 50_000 },
      ]),
      [{ period: "weekly", amountCents: 12_500 }],
    );
  });

  it("picks the matching budget for a report range", () => {
    const budgets = [
      { period: "monthly" as const, amountCents: 100_000 },
      { period: "weekly" as const, amountCents: 25_000 },
    ];
    assert.equal(projectBudgetForPeriod(budgets, "month")?.amountCents, 100_000);
    assert.equal(projectBudgetForPeriod(budgets, "week")?.amountCents, 25_000);
    assert.equal(projectBudgetForPeriod(budgets, "day"), null);
  });

  it("derives weekly from a monthly budget when week view has no weekly row", () => {
    const budgets = [{ period: "monthly" as const, amountCents: 52_000 }];
    // 52_000 monthly → weekly = 52_000 * 12 / 52 = 12_000
    assert.deepEqual(projectBudgetForPeriod(budgets, "week"), {
      period: "weekly",
      amountCents: 12_000,
    });
  });

  it("derives monthly from a weekly budget when month view has no monthly row", () => {
    const budgets = [{ period: "weekly" as const, amountCents: 12_000 }];
    // 12_000 weekly → monthly = 12_000 * 52 / 12 = 52_000
    assert.deepEqual(projectBudgetForPeriod(budgets, "month"), {
      period: "monthly",
      amountCents: 52_000,
    });
  });

  it("derives weekly from a quarterly budget", () => {
    const budgets = [{ period: "quarterly" as const, amountCents: 156_000 }];
    // quarterly → monthly = 52_000 → weekly = 12_000
    assert.deepEqual(projectBudgetForPeriod(budgets, "week"), {
      period: "weekly",
      amountCents: 12_000,
    });
  });

  it("computes spend from tracked seconds and hourly rate", () => {
    // 1.5 hours at €100/hr → €150
    assert.equal(
      projectSpendCentsFromTrackedSeconds(5400, 10_000),
      15_000,
    );
    assert.equal(projectSpendCentsFromTrackedSeconds(5400, null), null);
    assert.equal(projectSpendCentsFromTrackedSeconds(0, 10_000), 0);
  });
});
