import assert from "node:assert/strict";
import test from "node:test";

import { buildGoalChartSeries } from "./goal-chart-series.js";
import type { FinancialTransaction } from "@backsteros/contracts";

function tx(
  partial: Partial<FinancialTransaction> & {
    id: string;
    bookedOn: string;
    amountCents: number;
  },
): FinancialTransaction {
  return {
    workspaceId: "ws",
    bankAccountId: "ba",
    importBatchId: null,
    currency: "EUR",
    payee: "Save",
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
    goalId: "goal-1",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("buildGoalChartSeries projects monthly plan to goal amount", () => {
  const series = buildGoalChartSeries({
    goal: {
      goalAmountCents: 1_200_00,
      startDate: "2026-01-01",
      contributionCents: 100_00,
      savingMode: "monthly",
    },
    transactions: [],
    asOf: new Date(2026, 0, 15),
  });
  assert.ok(series);
  const projected = series.find((line) => line.id === "projected");
  assert.ok(projected);
  assert.equal(projected.data[0]?.y, 0);
  assert.equal(projected.data.at(-1)?.y, 1200);
  const actual = series.find((line) => line.id === "actual");
  assert.ok(actual);
  assert.equal(actual.data[0]?.y, 0);
});

test("buildGoalChartSeries accumulates linked credits on actual line", () => {
  const series = buildGoalChartSeries({
    goal: {
      goalAmountCents: 300_00,
      startDate: "2026-01-01",
      contributionCents: 100_00,
      savingMode: "monthly",
    },
    transactions: [
      tx({ id: "1", bookedOn: "2026-01-10", amountCents: 80_00 }),
      tx({ id: "2", bookedOn: "2026-02-05", amountCents: 50_00 }),
    ],
    asOf: new Date(2026, 1, 20),
  });
  assert.ok(series);
  const actual = series.find((line) => line.id === "actual");
  assert.ok(actual);
  assert.equal(actual.data[0]?.y, 80);
  assert.equal(actual.data[1]?.y, 130);
});

test("buildGoalChartSeries uses endDate as the chart horizon", () => {
  const series = buildGoalChartSeries({
    goal: {
      goalAmountCents: 1_200_00,
      startDate: "2026-01-01",
      endDate: "2026-04-01",
      contributionCents: 100_00,
      savingMode: "monthly",
    },
    transactions: [],
    asOf: new Date(2026, 0, 15),
  });
  assert.ok(series);
  const projected = series.find((line) => line.id === "projected");
  assert.ok(projected);
  assert.equal(projected.data.at(-1)?.x, "2026-04-01");
  assert.equal(projected.data.at(-1)?.y, 300);
});

test("buildGoalChartSeries extends to a later endDate past the contribution plan", () => {
  const series = buildGoalChartSeries({
    goal: {
      goalAmountCents: 300_00,
      startDate: "2026-01-01",
      endDate: "2026-08-01",
      contributionCents: 100_00,
      savingMode: "monthly",
    },
    transactions: [],
    asOf: new Date(2026, 0, 15),
  });
  assert.ok(series);
  const projected = series.find((line) => line.id === "projected");
  assert.ok(projected);
  assert.equal(projected.data.at(-1)?.x, "2026-08-01");
  assert.equal(projected.data.at(-1)?.y, 300);
});
