import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
} from "@backsteros/contracts";

import {
  accountReorderPatches,
  applyOptimisticAccountReorder,
  applyOptimisticCategoryReorder,
  applyOptimisticGoalReorder,
  categoryReorderPatches,
  financeCategoryGroupKey,
  financeCategoryListingGroupKey,
  financeCategoryParentGroupKey,
  goalReorderPatches,
} from "../../dist/finance/finance-list-reorder.js";

function goal(
  id: string,
  listing: FinancialGoal["listing"],
  sortOrder: number,
): FinancialGoal {
  return {
    id,
    workspaceId: "ws",
    name: id,
    listing,
    icon: null,
    goalAmountCents: null,
    startDate: null,
    endDate: null,
    contributionCents: null,
    savingMode: "monthly",
    savedCents: 0,
    sortOrder,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function account(
  id: string,
  type: BankAccount["type"],
  sortOrder: number,
): BankAccount {
  return {
    id,
    workspaceId: "ws",
    key: id,
    name: id,
    ibanOrMask: null,
    currency: "EUR",
    type,
    color: null,
    avatarStorageKey: null,
    avatarContentType: null,
    sortOrder,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function category(
  id: string,
  listing: FinancialCategory["listing"],
  sortOrder: number,
  parentId: string | null = null,
): FinancialCategory {
  return {
    id,
    workspaceId: "ws",
    name: id,
    parentId,
    kind: "expense",
    listing,
    icon: null,
    budgetCents: null,
    sortOrder,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("finance goal reorder", () => {
  it("reorders within a listing and assigns sortOrder", () => {
    const goals = [
      goal("a", "active", 0),
      goal("b", "active", 10),
      goal("c", "archive", 0),
    ];
    const next = applyOptimisticGoalReorder(goals, {
      itemId: "b",
      fromGroupKey: "active",
      toGroupKey: "active",
      beforeItemId: "a",
    });
    assert.deepEqual(
      next
        .filter((row) => row.listing === "active")
        .sort((l, r) => l.sortOrder - r.sortOrder)
        .map((row) => row.id),
      ["b", "a"],
    );
    const patches = goalReorderPatches(goals, {
      itemId: "b",
      fromGroupKey: "active",
      toGroupKey: "active",
      beforeItemId: "a",
    });
    assert.equal(patches[0]?.id, "b");
    assert.equal(patches[0]?.sortOrder, 0);
    assert.equal(patches[1]?.id, "a");
    assert.equal(patches[1]?.sortOrder, 10);
  });

  it("moves across listings", () => {
    const goals = [goal("a", "active", 0), goal("b", "archive", 0)];
    const next = applyOptimisticGoalReorder(goals, {
      itemId: "a",
      fromGroupKey: "active",
      toGroupKey: "archive",
      beforeItemId: null,
    });
    assert.equal(next.find((row) => row.id === "a")?.listing, "archive");
  });
});

describe("finance account reorder", () => {
  it("changes type when moving across groups", () => {
    const accounts = [
      account("a", "bank_account", 0),
      account("b", "savings", 0),
    ];
    const next = applyOptimisticAccountReorder(accounts, {
      itemId: "a",
      fromGroupKey: "bank_accounts",
      toGroupKey: "savings",
      beforeItemId: "b",
    });
    assert.equal(next.find((row) => row.id === "a")?.type, "savings");
    const patches = accountReorderPatches(accounts, {
      itemId: "a",
      fromGroupKey: "bank_accounts",
      toGroupKey: "savings",
      beforeItemId: "b",
    });
    assert.equal(patches[0]?.type, "savings");
  });
});

describe("finance category reorder", () => {
  it("reorders roots within a listing", () => {
    const categories = [
      category("a", "regular", 0),
      category("b", "regular", 10),
    ];
    const next = applyOptimisticCategoryReorder(categories, {
      itemId: "b",
      fromGroupKey: financeCategoryListingGroupKey("regular"),
      toGroupKey: financeCategoryListingGroupKey("regular"),
      beforeItemId: "a",
    });
    assert.deepEqual(
      next
        .sort((l, r) => l.sortOrder - r.sortOrder)
        .map((row) => row.id),
      ["b", "a"],
    );
  });

  it("reparents a leaf under another category", () => {
    const categories = [
      category("parent", "regular", 0),
      category("leaf", "regular", 10),
    ];
    const next = applyOptimisticCategoryReorder(categories, {
      itemId: "leaf",
      fromGroupKey: financeCategoryListingGroupKey("regular"),
      toGroupKey: financeCategoryParentGroupKey("parent"),
      beforeItemId: null,
    });
    assert.equal(next.find((row) => row.id === "leaf")?.parentId, "parent");
    assert.equal(
      financeCategoryGroupKey(next.find((row) => row.id === "leaf")!),
      financeCategoryParentGroupKey("parent"),
    );
  });

  it("reorders sibling subcategories under the same parent", () => {
    const categories = [
      category("parent", "regular", 0),
      category("child-a", "regular", 0, "parent"),
      category("child-b", "regular", 10, "parent"),
    ];
    const request = {
      itemId: "child-b",
      fromGroupKey: financeCategoryParentGroupKey("parent"),
      toGroupKey: financeCategoryParentGroupKey("parent"),
      beforeItemId: "child-a",
    };
    const next = applyOptimisticCategoryReorder(categories, request);
    assert.deepEqual(
      next
        .filter((row) => row.parentId === "parent")
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((row) => row.id),
      ["child-b", "child-a"],
    );
    assert.deepEqual(categoryReorderPatches(categories, request), [
      { id: "child-b", sortOrder: 0 },
      { id: "child-a", sortOrder: 10 },
    ]);
  });

  it("refuses nesting a parent that already has children", () => {
    const categories = [
      category("parent", "regular", 0),
      category("child", "regular", 0, "parent"),
      category("other", "regular", 10),
    ];
    const next = applyOptimisticCategoryReorder(categories, {
      itemId: "parent",
      fromGroupKey: financeCategoryListingGroupKey("regular"),
      toGroupKey: financeCategoryParentGroupKey("other"),
      beforeItemId: null,
    });
    assert.equal(next, categories);
    assert.deepEqual(
      categoryReorderPatches(categories, {
        itemId: "parent",
        fromGroupKey: financeCategoryListingGroupKey("regular"),
        toGroupKey: financeCategoryParentGroupKey("other"),
        beforeItemId: null,
      }),
      [],
    );
  });
});
