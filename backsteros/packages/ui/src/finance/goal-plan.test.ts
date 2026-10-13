import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveContributionCents,
  deriveEndDate,
  planPeriodsBetween,
} from "./goal-plan.js";

test("planPeriodsBetween counts monthly steps inclusively of the span", () => {
  assert.equal(
    planPeriodsBetween("2026-01-01", "2026-04-01", "monthly"),
    3,
  );
  assert.equal(
    planPeriodsBetween("2026-01-01", "2026-01-01", "monthly"),
    1,
  );
});

test("deriveContributionCents splits the goal across the period", () => {
  assert.equal(
    deriveContributionCents({
      goalAmountCents: 1_200_00,
      startDate: "2026-01-01",
      endDate: "2026-04-01",
      savingMode: "monthly",
    }),
    400_00,
  );
});

test("deriveEndDate extends by enough periods to reach the goal", () => {
  assert.equal(
    deriveEndDate({
      goalAmountCents: 1_200_00,
      contributionCents: 100_00,
      startDate: "2026-01-01",
      savingMode: "monthly",
    }),
    "2027-01-01",
  );
});

test("deriveEndDate and deriveContributionCents round-trip", () => {
  const contribution = deriveContributionCents({
    goalAmountCents: 1_000_00,
    startDate: "2026-06-01",
    endDate: "2026-11-01",
    savingMode: "monthly",
  });
  assert.ok(contribution);
  const end = deriveEndDate({
    goalAmountCents: 1_000_00,
    contributionCents: contribution,
    startDate: "2026-06-01",
    savingMode: "monthly",
  });
  assert.equal(end, "2026-11-01");
});
