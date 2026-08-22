import type {
  BankAccount,
  BankAccountType,
  FinancialCategory,
  FinancialCategoryListing,
  FinancialGoal,
  FinancialGoalListing,
  FinancialRecurring,
} from "@backsteros/contracts";

import {
  bankAccountTypeForFinanceAccountGroupId,
  financeAccountGroupIdForType,
  type FinanceAccountGroupId,
} from "./finance-nav.js";
import type { GroupedListPointerReorderRequest } from "../list-nav/grouped-list-pointer-reorder.js";

export type FinanceListReorderRequest = GroupedListPointerReorderRequest;

type Sortable = { id: string; sortOrder?: number };

function sortBySortOrder<T extends Sortable>(items: T[]): T[] {
  return [...items].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
}

function assignSortOrders<T extends Sortable>(items: T[]): T[] {
  return items.map((item, index) => ({
    ...item,
    sortOrder: index * 10,
  }));
}

/**
 * Generic within/across-group reorder: move item into `toGroupKey`,
 * optionally before `beforeItemId`, then reindex that group's sortOrder.
 */
export function applyOptimisticGroupedSortReorder<T extends Sortable>(
  items: T[],
  request: FinanceListReorderRequest,
  getGroupKey: (item: T) => string,
  applyGroup: (item: T, groupKey: string) => T,
): T[] {
  const moving = items.find((item) => item.id === request.itemId);
  if (!moving) return items;

  const withoutMoving = items.filter((item) => item.id !== request.itemId);
  const updatedMoving = applyGroup(moving, request.toGroupKey);

  const targetSiblings = sortBySortOrder(
    withoutMoving.filter((item) => getGroupKey(item) === request.toGroupKey),
  );

  let nextTargetGroup: T[];
  if (!request.beforeItemId) {
    nextTargetGroup = [...targetSiblings, updatedMoving];
  } else {
    const insertIndex = targetSiblings.findIndex(
      (item) => item.id === request.beforeItemId,
    );
    if (insertIndex === -1) {
      nextTargetGroup = [...targetSiblings, updatedMoving];
    } else {
      nextTargetGroup = [
        ...targetSiblings.slice(0, insertIndex),
        updatedMoving,
        ...targetSiblings.slice(insertIndex),
      ];
    }
  }

  const reindexed = assignSortOrders(nextTargetGroup);
  const byId = new Map(reindexed.map((item) => [item.id, item]));

  return [
    ...withoutMoving.map((item) => byId.get(item.id) ?? item),
    ...reindexed.filter((item) => item.id === request.itemId),
  ];
}

function patchesForTargetGroup<T extends Sortable>(
  items: T[],
  request: FinanceListReorderRequest,
  getGroupKey: (item: T) => string,
  applyGroup: (item: T, groupKey: string) => T,
  toPatch: (item: T) => Record<string, unknown>,
): Array<{ id: string } & Record<string, unknown>> {
  const next = applyOptimisticGroupedSortReorder(
    items,
    request,
    getGroupKey,
    applyGroup,
  );
  return next
    .filter((item) => getGroupKey(item) === request.toGroupKey)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((item, index) => ({
      id: item.id,
      ...toPatch({ ...item, sortOrder: index * 10 }),
    }));
}

// —— Goals ————————————————————————————————————————————————————————————————

export function financeGoalOrderKey(goalId: string): string {
  return `goal:${goalId}`;
}

export function financeGoalGroupAppendOrderKey(listing: string): string {
  return `goal-group:${listing}:append`;
}

export function financeGoalGroupKey(
  goal: Pick<FinancialGoal, "listing">,
): FinancialGoalListing {
  return goal.listing === "ready_to_spend" || goal.listing === "archive"
    ? goal.listing
    : "active";
}

export function applyOptimisticGoalReorder(
  goals: FinancialGoal[],
  request: FinanceListReorderRequest,
): FinancialGoal[] {
  return applyOptimisticGroupedSortReorder(
    goals,
    request,
    financeGoalGroupKey,
    (goal, groupKey) => ({
      ...goal,
      listing: financeGoalGroupKey({ listing: groupKey as FinancialGoalListing }),
    }),
  );
}

export function goalReorderPatches(
  goals: FinancialGoal[],
  request: FinanceListReorderRequest,
): Array<{ id: string; listing: FinancialGoalListing; sortOrder: number }> {
  return patchesForTargetGroup(
    goals,
    request,
    financeGoalGroupKey,
    (goal, groupKey) => ({
      ...goal,
      listing: financeGoalGroupKey({ listing: groupKey as FinancialGoalListing }),
    }),
    (goal) => ({
      listing: financeGoalGroupKey(goal),
      sortOrder: goal.sortOrder ?? 0,
    }),
  ) as Array<{ id: string; listing: FinancialGoalListing; sortOrder: number }>;
}

// —— Accounts —————————————————————————————————————————————————————————————

export function financeAccountOrderKey(accountId: string): string {
  return `account:${accountId}`;
}

export function financeAccountGroupAppendOrderKey(
  groupId: FinanceAccountGroupId,
): string {
  return `account-group:${groupId}:append`;
}

export function financeAccountGroupKey(
  account: Pick<BankAccount, "type">,
): FinanceAccountGroupId {
  return financeAccountGroupIdForType(account.type);
}

export function applyOptimisticAccountReorder(
  accounts: BankAccount[],
  request: FinanceListReorderRequest,
): BankAccount[] {
  return applyOptimisticGroupedSortReorder(
    accounts,
    request,
    financeAccountGroupKey,
    (account, groupKey) => ({
      ...account,
      type: bankAccountTypeForFinanceAccountGroupId(
        groupKey as FinanceAccountGroupId,
      ),
    }),
  );
}

export function accountReorderPatches(
  accounts: BankAccount[],
  request: FinanceListReorderRequest,
): Array<{ id: string; type: BankAccountType; sortOrder: number }> {
  return patchesForTargetGroup(
    accounts,
    request,
    financeAccountGroupKey,
    (account, groupKey) => ({
      ...account,
      type: bankAccountTypeForFinanceAccountGroupId(
        groupKey as FinanceAccountGroupId,
      ),
    }),
    (account) => ({
      type: account.type,
      sortOrder: account.sortOrder ?? 0,
    }),
  ) as Array<{ id: string; type: BankAccountType; sortOrder: number }>;
}

// —— Recurrings ———————————————————————————————————————————————————————————

export type RecurringReorderGroup = "this_month" | "future" | "archived";

export function financeRecurringOrderKey(recurringId: string): string {
  return `recurring:${recurringId}`;
}

export function financeRecurringGroupAppendOrderKey(
  group: RecurringReorderGroup,
): string {
  return `recurring-group:${group}:append`;
}

export type RecurringGroupResolver = (
  recurring: FinancialRecurring,
) => RecurringReorderGroup;

export function applyOptimisticRecurringReorder(
  recurrings: FinancialRecurring[],
  request: FinanceListReorderRequest,
  getGroupKey: RecurringGroupResolver,
  applyGroup: (
    recurring: FinancialRecurring,
    groupKey: RecurringReorderGroup,
  ) => FinancialRecurring,
): FinancialRecurring[] {
  return applyOptimisticGroupedSortReorder(
    recurrings,
    request,
    (row) => getGroupKey(row),
    (row, groupKey) => applyGroup(row, groupKey as RecurringReorderGroup),
  );
}

export function recurringReorderPatches(
  recurrings: FinancialRecurring[],
  request: FinanceListReorderRequest,
  getGroupKey: RecurringGroupResolver,
  applyGroup: (
    recurring: FinancialRecurring,
    groupKey: RecurringReorderGroup,
  ) => FinancialRecurring,
): Array<{
  id: string;
  sortOrder: number;
  archived?: boolean;
  nextDate?: string | null;
}> {
  const next = applyOptimisticRecurringReorder(
    recurrings,
    request,
    getGroupKey,
    applyGroup,
  );
  const target = next
    .filter((row) => getGroupKey(row) === request.toGroupKey)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  return target.map((row, index) => {
    const original = recurrings.find((entry) => entry.id === row.id);
    const patch: {
      id: string;
      sortOrder: number;
      archived?: boolean;
      nextDate?: string | null;
    } = {
      id: row.id,
      sortOrder: index * 10,
    };
    if (original) {
      if (Boolean(original.archived) !== Boolean(row.archived)) {
        patch.archived = row.archived;
      }
      if ((original.nextDate ?? null) !== (row.nextDate ?? null)) {
        patch.nextDate = row.nextDate;
      }
    }
    return patch;
  });
}

// —— Categories ———————————————————————————————————————————————————————————

export function financeCategoryOrderKey(categoryId: string): string {
  return `category:${categoryId}`;
}

export function financeCategoryGroupAppendOrderKey(groupKey: string): string {
  return `category-group:${groupKey}:append`;
}

export function financeCategoryListingGroupKey(
  listing: FinancialCategoryListing | string,
): string {
  const normalized =
    listing === "excluded" ? "excluded" : ("regular" as FinancialCategoryListing);
  return `listing:${normalized}`;
}

export function financeCategoryParentGroupKey(parentId: string): string {
  return `parent:${parentId}`;
}

export function financeCategoryGroupKey(
  category: Pick<FinancialCategory, "parentId" | "listing">,
): string {
  if (category.parentId) return financeCategoryParentGroupKey(category.parentId);
  return financeCategoryListingGroupKey(category.listing);
}

export function parseFinanceCategoryGroupKey(groupKey: string):
  | { kind: "listing"; listing: FinancialCategoryListing }
  | { kind: "parent"; parentId: string }
  | null {
  if (groupKey.startsWith("parent:")) {
    const parentId = groupKey.slice("parent:".length);
    return parentId ? { kind: "parent", parentId } : null;
  }
  if (groupKey.startsWith("listing:")) {
    const listing = groupKey.slice("listing:".length);
    return {
      kind: "listing",
      listing: listing === "excluded" ? "excluded" : "regular",
    };
  }
  return null;
}

export function applyOptimisticCategoryReorder(
  categories: FinancialCategory[],
  request: FinanceListReorderRequest,
): FinancialCategory[] {
  const parsedTo = parseFinanceCategoryGroupKey(request.toGroupKey);
  if (!parsedTo) return categories;

  const moving = categories.find((row) => row.id === request.itemId);
  if (!moving) return categories;

  const hasChildren = categories.some((row) => row.parentId === moving.id);
  if (hasChildren && parsedTo.kind === "parent") {
    // Parents with children cannot become nested under another category.
    return categories;
  }

  const parentListing =
    parsedTo.kind === "parent"
      ? categories.find((row) => row.id === parsedTo.parentId)?.listing
      : null;
  if (parsedTo.kind === "parent" && parentListing == null) {
    return categories;
  }

  return applyOptimisticGroupedSortReorder(
    categories,
    request,
    financeCategoryGroupKey,
    (category, groupKey) => {
      const parsed = parseFinanceCategoryGroupKey(groupKey);
      if (!parsed) return category;
      if (parsed.kind === "listing") {
        return {
          ...category,
          parentId: null,
          listing: parsed.listing,
        };
      }
      const listing =
        categories.find((row) => row.id === parsed.parentId)?.listing ??
        category.listing;
      return {
        ...category,
        parentId: parsed.parentId,
        listing:
          listing === "excluded" ? "excluded" : ("regular" as const),
      };
    },
  );
}

export function categoryReorderPatches(
  categories: FinancialCategory[],
  request: FinanceListReorderRequest,
): Array<{
  id: string;
  sortOrder: number;
  listing?: FinancialCategoryListing;
  parentId?: string | null;
}> {
  const next = applyOptimisticCategoryReorder(categories, request);
  if (next === categories) return [];

  const target = next
    .filter((row) => financeCategoryGroupKey(row) === request.toGroupKey)
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  return target.map((row, index) => {
    const original = categories.find((entry) => entry.id === row.id);
    const patch: {
      id: string;
      sortOrder: number;
      listing?: FinancialCategoryListing;
      parentId?: string | null;
    } = {
      id: row.id,
      sortOrder: index * 10,
    };
    if (original) {
      if (original.listing !== row.listing) patch.listing = row.listing;
      if (original.parentId !== row.parentId) patch.parentId = row.parentId;
    }
    return patch;
  });
}
