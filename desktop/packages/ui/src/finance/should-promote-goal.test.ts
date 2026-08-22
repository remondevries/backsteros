import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextGoalListingForSavings,
  shouldPromoteGoalToReadyToSpend,
} from "../../dist/components/finance-goals-view.js";

describe("shouldPromoteGoalToReadyToSpend", () => {
  it("promotes active goals that reached their target", () => {
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "active", goalAmountCents: 1_000_000 },
        1_000_000,
      ),
      true,
    );
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "active", goalAmountCents: 1_000_000 },
        1_200_000,
      ),
      true,
    );
  });

  it("does not promote incomplete, archived, or ready goals", () => {
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "active", goalAmountCents: 1_000_000 },
        999_900,
      ),
      false,
    );
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "ready_to_spend", goalAmountCents: 1_000_000 },
        1_000_000,
      ),
      false,
    );
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "archive", goalAmountCents: 1_000_000 },
        1_000_000,
      ),
      false,
    );
  });

  it("requires a positive goal amount", () => {
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "active", goalAmountCents: null },
        500_000,
      ),
      false,
    );
    assert.equal(
      shouldPromoteGoalToReadyToSpend(
        { listing: "active", goalAmountCents: 0 },
        0,
      ),
      false,
    );
  });
});

describe("nextGoalListingForSavings", () => {
  it("promotes only when actual savings reach the goal", () => {
    assert.equal(
      nextGoalListingForSavings(
        { listing: "active", goalAmountCents: 12_000_000 },
        106_000,
      ),
      null,
    );
    assert.equal(
      nextGoalListingForSavings(
        { listing: "active", goalAmountCents: 12_000_000 },
        12_000_000,
      ),
      "ready_to_spend",
    );
  });

  it("moves underfunded ready goals back to active", () => {
    assert.equal(
      nextGoalListingForSavings(
        { listing: "ready_to_spend", goalAmountCents: 12_000_000 },
        106_000,
      ),
      "active",
    );
  });

  it("leaves archive alone", () => {
    assert.equal(
      nextGoalListingForSavings(
        { listing: "archive", goalAmountCents: 12_000_000 },
        12_000_000,
      ),
      null,
    );
  });
});
