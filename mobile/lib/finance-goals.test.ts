import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  goalProgressRatio,
  groupGoalsByListing,
} from "./finance-goals.ts";
import type { FinanceGoalRow } from "./use-finance-goals.ts";

function goal(
  partial: Partial<FinanceGoalRow> & Pick<FinanceGoalRow, "id" | "listing">,
): FinanceGoalRow {
  return {
    name: partial.name ?? partial.id,
    icon: null,
    goalAmountCents: 100_00,
    startDate: null,
    endDate: null,
    contributionCents: null,
    savingMode: "monthly",
    savedCents: 0,
    sortOrder: 0,
    ...partial,
  };
}

describe("groupGoalsByListing", () => {
  it("buckets by listing and skips empty groups", () => {
    const groups = groupGoalsByListing([
      goal({ id: "a", listing: "archive", name: "Z" }),
      goal({ id: "b", listing: "active", name: "A" }),
      goal({ id: "c", listing: "active", name: "B" }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.id),
      ["active", "archive"],
    );
    assert.deepEqual(
      groups[0]!.goals.map((g) => g.id),
      ["b", "c"],
    );
  });
});

describe("goalProgressRatio", () => {
  it("clamps saved/target", () => {
    assert.equal(
      goalProgressRatio(goal({ id: "1", listing: "active", savedCents: 50_00 })),
      0.5,
    );
    assert.equal(
      goalProgressRatio(
        goal({
          id: "2",
          listing: "active",
          savedCents: 200_00,
          goalAmountCents: 100_00,
        }),
      ),
      1,
    );
    assert.equal(
      goalProgressRatio(
        goal({
          id: "3",
          listing: "active",
          goalAmountCents: null,
          savedCents: 50,
        }),
      ),
      0,
    );
  });
});
