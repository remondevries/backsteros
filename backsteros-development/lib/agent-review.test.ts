import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canMarkTaskInReview,
  evaluateAgentTurnReview,
  formatAgentReviewComment,
} from "./agent-review.ts";

describe("agent-review", () => {
  it("allows in_progress, ready_to_start, on_hold, and in_review (loop)", () => {
    assert.equal(canMarkTaskInReview("in_progress"), true);
    assert.equal(canMarkTaskInReview("ready_to_start"), true);
    assert.equal(canMarkTaskInReview("on_hold"), true);
    assert.equal(canMarkTaskInReview("in_review"), true);
    assert.equal(canMarkTaskInReview("completed"), false);
  });

  it("formats review comments as the agent message only", () => {
    assert.equal(formatAgentReviewComment(null), "");
    assert.equal(formatAgentReviewComment("  "), "");
    assert.equal(
      formatAgentReviewComment("Done with the change."),
      "Done with the change.",
    );
  });

  it("evaluateAgentTurnReview only for reviewable statuses", () => {
    assert.equal(
      evaluateAgentTurnReview({ taskStatus: "completed", assistantText: "x" }),
      null,
    );
    const fromHold = evaluateAgentTurnReview({
      taskStatus: "on_hold",
      assistantText: "Fixed after reply.",
    });
    assert.ok(fromHold);
    assert.equal(fromHold.commentBody, "Fixed after reply.");
    const decision = evaluateAgentTurnReview({
      taskStatus: "in_progress",
      assistantText: "Shipped.",
    });
    assert.ok(decision);
    assert.equal(decision.commentBody, "Shipped.");
  });
});
