import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FinancialTransaction } from "@backsteros/contracts";

import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
} from "../dist/components/dropdown-options.js";
import {
  buildAmountHistogramBins,
  computeAmountRangeDomain,
  filterFinanceTransactions,
  isFullAmountRange,
} from "../dist/filter-finance-transactions.js";

function tx(
  partial: Partial<FinancialTransaction> & {
    id: string;
    amountCents: number;
  },
): FinancialTransaction {
  return {
    workspaceId: "ws",
    bankAccountId: "ba",
    importBatchId: null,
    bookedOn: "2026-08-01",
    currency: "EUR",
    payee: "Shop",
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
    categoryId: null,
    goalId: null,
    recurringId: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const emptyRange = {
  amountMinCents: null as number | null,
  amountMaxCents: null as number | null,
};

describe("filterFinanceTransactions", () => {
  const rows = [
    tx({
      id: "1",
      amountCents: -100,
      payee: "Albert Heijn",
      categoryId: "cat-food",
      organizationId: "org-1",
      goalId: "goal-1",
      recurringId: null,
    }),
    tx({
      id: "2",
      amountCents: 500,
      payee: "Salary",
      categoryId: "cat-income",
      organizationId: null,
      goalId: null,
      recurringId: "rec-1",
    }),
    tx({
      id: "3",
      amountCents: -50,
      payee: "Unknown",
      categoryId: null,
      organizationId: null,
      goalId: null,
      recurringId: null,
    }),
  ];

  it("filters by search, amount range, category, and organization", () => {
    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "albert",
        ...emptyRange,
        categoryIds: [],
        organizationId: null,
        goalId: null,
        recurringId: null,
      }).map((row) => row.id),
      ["1"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        amountMinCents: 0,
        amountMaxCents: null,
        categoryIds: [],
        organizationId: null,
        goalId: null,
        recurringId: null,
      }).map((row) => row.id),
      ["2"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        amountMinCents: null,
        amountMaxCents: -1,
        categoryIds: [],
        organizationId: null,
        goalId: null,
        recurringId: null,
      }).map((row) => row.id),
      ["1", "3"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        ...emptyRange,
        categoryIds: [DROPDOWN_NONE_VALUE],
        organizationId: null,
        goalId: null,
        recurringId: null,
      }).map((row) => row.id),
      ["3"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        ...emptyRange,
        categoryIds: [],
        organizationId: DROPDOWN_NONE_VALUE,
        goalId: null,
        recurringId: null,
      }).map((row) => row.id),
      ["2", "3"],
    );
  });

  it("filters by goal and recurring", () => {
    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        ...emptyRange,
        categoryIds: [],
        organizationId: null,
        goalId: "goal-1",
        recurringId: null,
      }).map((row) => row.id),
      ["1"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        ...emptyRange,
        categoryIds: [],
        organizationId: null,
        goalId: DROPDOWN_NO_GOAL_VALUE,
        recurringId: null,
      }).map((row) => row.id),
      ["2", "3"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        ...emptyRange,
        categoryIds: [],
        organizationId: null,
        goalId: null,
        recurringId: "rec-1",
      }).map((row) => row.id),
      ["2"],
    );

    assert.deepEqual(
      filterFinanceTransactions(rows, {
        search: "",
        ...emptyRange,
        categoryIds: [],
        organizationId: null,
        goalId: null,
        recurringId: DROPDOWN_NO_RECURRING_VALUE,
      }).map((row) => row.id),
      ["1", "3"],
    );
  });
});

describe("amount range domain + histogram", () => {
  it("builds a symmetric 0-centered domain from samples", () => {
    const domain = computeAmountRangeDomain([-250_00, 80_00, 10_00]);
    assert.equal(domain.minCents, -domain.extentCents);
    assert.equal(domain.maxCents, domain.extentCents);
    assert.ok(domain.extentCents >= 250_00);
  });

  it("treats null bounds as full range", () => {
    const domain = computeAmountRangeDomain([-100, 100]);
    assert.equal(isFullAmountRange(null, null, domain), true);
    assert.equal(isFullAmountRange(domain.minCents, domain.maxCents, domain), true);
    assert.equal(isFullAmountRange(-50, domain.maxCents, domain), false);
  });

  it("bins samples across the domain", () => {
    const domain = computeAmountRangeDomain([-100, 100]);
    const bins = buildAmountHistogramBins([-80, -10, 10, 90], domain, 5);
    assert.equal(bins.length, 5);
    assert.equal(
      bins.reduce((sum, bin) => sum + bin.count, 0),
      4,
    );
  });
});
