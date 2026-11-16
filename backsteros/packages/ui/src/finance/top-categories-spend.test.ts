import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { FinancialCategory } from "@backsteros/contracts";

import {
  buildTopCategoriesSpend,
  topCategoriesSpendTotalCents,
} from "./top-categories-spend.js";

function category(
  partial: Partial<FinancialCategory> & Pick<FinancialCategory, "id" | "name">,
): FinancialCategory {
  return {
    workspaceId: "ws",
    parentId: null,
    kind: "expense",
    listing: "regular",
    icon: null,
    budgetCents: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("buildTopCategoriesSpend", () => {
  test("excludes income-kind and clamps credit children so parent shows spend only", () => {
    const lemo = category({ id: "lemo", name: "Lemo-Design", sortOrder: 1 });
    const incomeMisKind = category({
      id: "income-child",
      name: "Income",
      parentId: "lemo",
      kind: "expense",
      sortOrder: 1,
    });
    const software = category({
      id: "software",
      name: "Software",
      parentId: "lemo",
      sortOrder: 2,
    });
    const incomePersonal = category({
      id: "income-personal",
      name: "Income Personal",
      kind: "income",
    });

    const rows = buildTopCategoriesSpend(
      [lemo, incomeMisKind, software, incomePersonal],
      {
        lemo: 71_844,
        "income-child": -259_470,
        software: 39_779,
        "income-personal": -50_000,
      },
    );

    assert.equal(
      rows.some((row) => row.id === "income-personal"),
      false,
      "income-kind omitted",
    );
    assert.equal(
      rows.some((row) => row.id === "income-child"),
      false,
      "credit child clamped out",
    );
    const parent = rows.find((row) => row.id === "lemo");
    assert.ok(parent);
    assert.equal(parent.spentCents, 71_844 + 39_779);
    const total = topCategoriesSpendTotalCents(rows);
    assert.equal(total, parent.spentCents);
    assert.equal(total > 0, true);
  });

  test("denominator ignores credit-only roots", () => {
    const rows = buildTopCategoriesSpend(
      [
        category({ id: "a", name: "A" }),
        category({ id: "b", name: "B" }),
      ],
      { a: 100, b: -50 },
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ["a"],
    );
    assert.equal(topCategoriesSpendTotalCents(rows), 100);
  });
});
