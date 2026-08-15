import assert from "node:assert/strict";
import test from "node:test";

import type {
  FinancialCategory,
  FinancialTransaction,
} from "@backsteros/contracts";

import {
  buildAllCategoriesSpendBarSeries,
  buildCategorySpendBarSeries,
  CATEGORY_SPEND_DIRECT_KEY,
  categorySpendChartHasData,
  listTrailingMonthKeys,
} from "./category-spend-chart-series.js";

function category(
  overrides: Partial<FinancialCategory> & Pick<FinancialCategory, "id" | "name">,
): FinancialCategory {
  return {
    workspaceId: "ws",
    kind: "expense",
    listing: "regular",
    parentId: null,
    icon: null,
    budgetCents: null,
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function tx(
  partial: Partial<FinancialTransaction> & {
    id: string;
    bookedOn: string;
    amountCents: number;
    categoryId: string | null;
  },
): FinancialTransaction {
  return {
    workspaceId: "ws",
    bankAccountId: "ba",
    importBatchId: null,
    currency: "EUR",
    payee: "Spend",
    counterparty: null,
    memo: null,
    displayName: null,
    balanceAfterCents: null,
    externalId: null,
    fingerprint: partial.id,
    sourceCode: null,
    sourceType: null,
    raw: {},
    organizationId: null,
    projectId: null,
    goalId: null,
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("buildCategorySpendBarSeries uses a single series for leaf categories", () => {
  const leaf = category({ id: "food", name: "Food", icon: "color:#22c55e" });
  const series = buildCategorySpendBarSeries({
    categoryId: leaf.id,
    categoryName: leaf.name,
    accent: "#22c55e",
    months: [{ month: "2024-01" }, { month: "2024-02" }],
    transactions: [
      tx({
        id: "t1",
        amountCents: -5000,
        bookedOn: "2024-01-10",
        categoryId: "food",
      }),
      tx({
        id: "t2",
        amountCents: -2500,
        bookedOn: "2024-02-03",
        categoryId: "food",
      }),
    ],
    children: [],
    colorForCategory: () => "#999",
  });

  assert.deepEqual(series.keys, ["food"]);
  assert.equal(series.data[0]?.food, 50);
  assert.equal(series.data[1]?.food, 25);
  assert.equal(series.colors.food, "#22c55e");
  assert.equal(categorySpendChartHasData(series), true);
});

test("buildCategorySpendBarSeries stacks by subcategory and direct spend", () => {
  const parent = category({ id: "home", name: "Home", icon: "color:#3b82f6" });
  const rent = category({
    id: "rent",
    name: "Rent",
    parentId: "home",
    icon: "color:#ef4444",
  });
  const utilities = category({
    id: "utilities",
    name: "Utilities",
    parentId: "home",
    icon: "color:#f59e0b",
  });

  const series = buildCategorySpendBarSeries({
    categoryId: parent.id,
    categoryName: parent.name,
    accent: "#3b82f6",
    months: [{ month: "2024-03" }],
    transactions: [
      tx({
        id: "t1",
        amountCents: -10000,
        bookedOn: "2024-03-01",
        categoryId: "rent",
      }),
      tx({
        id: "t2",
        amountCents: -4000,
        bookedOn: "2024-03-05",
        categoryId: "utilities",
      }),
      tx({
        id: "t3",
        amountCents: -1500,
        bookedOn: "2024-03-12",
        categoryId: "home",
      }),
    ],
    children: [utilities, rent],
    colorForCategory: (row) => (row.id === "rent" ? "#ef4444" : "#f59e0b"),
  });

  assert.deepEqual(series.keys, [
    CATEGORY_SPEND_DIRECT_KEY,
    "rent",
    "utilities",
  ]);
  assert.equal(series.data[0]?.[CATEGORY_SPEND_DIRECT_KEY], 15);
  assert.equal(series.data[0]?.rent, 100);
  assert.equal(series.data[0]?.utilities, 40);
  assert.equal(series.labels[CATEGORY_SPEND_DIRECT_KEY], "Home (direct)");
  assert.equal(series.colors.rent, "#ef4444");
  assert.notEqual(series.colors.rent, series.colors.utilities);
  assert.notEqual(
    series.colors[CATEGORY_SPEND_DIRECT_KEY],
    series.colors.rent,
  );
});

test("buildCategorySpendBarSeries assigns distinct colors when children share parent color", () => {
  const parent = category({ id: "home", name: "Home" });
  const rent = category({ id: "rent", name: "Rent", parentId: "home" });
  const utils = category({
    id: "utilities",
    name: "Utilities",
    parentId: "home",
  });

  const series = buildCategorySpendBarSeries({
    categoryId: parent.id,
    categoryName: parent.name,
    accent: "#3b82f6",
    months: [{ month: "2024-05" }],
    transactions: [
      tx({
        id: "t1",
        amountCents: -3000,
        bookedOn: "2024-05-01",
        categoryId: "rent",
      }),
      tx({
        id: "t2",
        amountCents: -2000,
        bookedOn: "2024-05-02",
        categoryId: "utilities",
      }),
      tx({
        id: "t3",
        amountCents: -1000,
        bookedOn: "2024-05-03",
        categoryId: "home",
      }),
    ],
    children: [rent, utils],
    // Simulate subcategories inheriting / matching the parent paint.
    colorForCategory: () => "#3b82f6",
  });

  assert.equal(series.keys.length, 3);
  const stackColors = series.keys.map((key) => series.colors[key]);
  assert.equal(new Set(stackColors).size, 3);
});

test("buildCategorySpendBarSeries nets credits against debits in the same series", () => {
  const parent = category({ id: "food", name: "Food & Drink" });
  const groceries = category({
    id: "groceries",
    name: "Groceries",
    parentId: "food",
  });
  const restaurants = category({
    id: "restaurants",
    name: "Restaurants",
    parentId: "food",
  });

  const series = buildCategorySpendBarSeries({
    categoryId: parent.id,
    categoryName: parent.name,
    accent: "#FB923C",
    months: [{ month: "2026-07" }],
    transactions: [
      tx({
        id: "t1",
        amountCents: -200_00,
        bookedOn: "2026-07-02",
        categoryId: "groceries",
      }),
      tx({
        id: "t2",
        amountCents: -50_00,
        bookedOn: "2026-07-03",
        categoryId: "restaurants",
      }),
      // Reimbursement lowers restaurants net spend (50 − 20 = 30).
      tx({
        id: "t3",
        amountCents: 20_00,
        bookedOn: "2026-07-04",
        categoryId: "restaurants",
      }),
    ],
    children: [groceries, restaurants],
    colorForCategory: (row) =>
      row.id === "groceries" ? "#FB923C" : "#4ADE80",
  });

  assert.deepEqual(series.keys, ["groceries", "restaurants"]);
  assert.equal(series.data[0]?.groceries, 200);
  assert.equal(series.data[0]?.restaurants, 30);
  assert.equal(series.signedByMonth["2026-07"]?.restaurants, -30);
  assert.equal(series.colors.groceries, "#FB923C");
  assert.equal(series.colors.restaurants, "#4ADE80");
});

test("buildCategorySpendBarSeries omits zero series keys", () => {
  const parent = category({ id: "home", name: "Home" });
  const rent = category({ id: "rent", name: "Rent", parentId: "home" });
  const unused = category({
    id: "unused",
    name: "Unused",
    parentId: "home",
  });

  const series = buildCategorySpendBarSeries({
    categoryId: parent.id,
    categoryName: parent.name,
    accent: "#111",
    months: [{ month: "2024-04" }],
    transactions: [
      tx({
        id: "t1",
        amountCents: -2000,
        bookedOn: "2024-04-01",
        categoryId: "rent",
      }),
    ],
    children: [rent, unused],
    colorForCategory: () => "#999",
  });

  assert.deepEqual(series.keys, ["rent"]);
});

test("buildAllCategoriesSpendBarSeries stacks root categories and rolls up children", () => {
  const food = category({ id: "food", name: "Food" });
  const groceries = category({
    id: "groceries",
    name: "Groceries",
    parentId: "food",
  });
  const rent = category({ id: "rent", name: "Rent" });

  const series = buildAllCategoriesSpendBarSeries({
    categories: [food, groceries, rent],
    months: [{ month: "2024-06" }, { month: "2024-07" }],
    monthsSpent: [
      {
        month: "2024-06",
        spentByCategoryId: {
          groceries: 4000,
          rent: 10000,
        },
      },
      {
        month: "2024-07",
        spentByCategoryId: {
          food: 2500,
          rent: 10000,
        },
      },
    ],
    colorForCategory: (row) =>
      row.id === "food" ? "#22c55e" : row.id === "rent" ? "#ef4444" : "#999",
  });

  assert.deepEqual(series.keys, ["rent", "food"]);
  assert.equal(series.data[0]?.food, 40);
  assert.equal(series.data[0]?.rent, 100);
  assert.equal(series.data[1]?.food, 25);
  assert.equal(series.colors.food, "#22c55e");
  assert.notEqual(series.colors.food, series.colors.rent);
});

test("listTrailingMonthKeys returns inclusive trailing months", () => {
  assert.deepEqual(listTrailingMonthKeys("2024-03", 3), [
    "2024-01",
    "2024-02",
    "2024-03",
  ]);
});
