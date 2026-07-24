import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_SESSION_ENDED_HOLD_DETAIL,
  detectNeedsInputFromAssistantText,
  evaluateAgentTurnHold,
  evaluateAgentTurnOutcome,
  formatAgentHoldComment,
  isFailedTurnStatus,
} from "./agent-hold.ts";

describe("agent-hold outcomes", () => {
  it("detects failed turn statuses", () => {
    assert.equal(isFailedTurnStatus("ok"), false);
    assert.equal(isFailedTurnStatus("completed"), false);
    assert.equal(isFailedTurnStatus("error"), true);
    assert.equal(isFailedTurnStatus("aborted"), true);
  });

  it("detects needs-input questions conservatively", () => {
    assert.equal(
      detectNeedsInputFromAssistantText("Shipped the fix."),
      false,
    );
    assert.equal(
      detectNeedsInputFromAssistantText(
        "I need more information about the API key before I can continue.",
      ),
      true,
    );
    assert.equal(
      detectNeedsInputFromAssistantText(
        "Which option should I take?\n\nShould I use the new endpoint?",
      ),
      true,
    );
  });

  it("evaluateAgentTurnHold prefers fail then needs-input", () => {
    const failed = evaluateAgentTurnHold({
      status: "failed",
      assistantText: "boom",
    });
    assert.ok(failed);
    assert.equal(failed.kind, "turn_failed");

    const needs = evaluateAgentTurnHold({
      status: "ok",
      assistantText: "Please clarify which branch I should use.",
    });
    assert.ok(needs);
    assert.equal(needs.kind, "needs_input");

    assert.equal(
      evaluateAgentTurnHold({
        status: "ok",
        assistantText: "All done.",
      }),
      null,
    );
  });

  it("successful stop/fallback → review", () => {
    assert.deepEqual(
      evaluateAgentTurnOutcome({
        reason: "stop",
        status: "ok",
        assistantText: "Finished the rename.",
      }),
      { action: "review" },
    );
    assert.deepEqual(
      evaluateAgentTurnOutcome({
        reason: "fallback",
        assistantText: "Quiet finish.",
      }),
      { action: "review" },
    );
  });

  it("abrupt sessionEnd → hold even when text looks successful", () => {
    const outcome = evaluateAgentTurnOutcome({
      reason: "sessionEnd",
      abrupt: true,
      status: "ok",
      assistantText: "Almost done.",
    });
    assert.equal(outcome.action, "hold");
    if (outcome.action !== "hold") return;
    assert.equal(outcome.decision.kind, "turn_failed");
    assert.match(
      outcome.decision.commentBody,
      new RegExp(AGENT_SESSION_ENDED_HOLD_DETAIL),
    );
  });

  it("sessionEnd without abrupt still reviews when no hold heuristics", () => {
    assert.deepEqual(
      evaluateAgentTurnOutcome({
        reason: "sessionEnd",
        abrupt: false,
        assistantText: "Done.",
      }),
      { action: "review" },
    );
  });

  it("needs-input wins over abrupt sessionEnd review path", () => {
    const outcome = evaluateAgentTurnOutcome({
      reason: "stop",
      assistantText: "I need more information to continue.",
    });
    assert.equal(outcome.action, "hold");
    if (outcome.action !== "hold") return;
    assert.equal(outcome.decision.kind, "needs_input");
    assert.equal(
      outcome.decision.commentBody,
      formatAgentHoldComment(
        "needs_input",
        "I need more information to continue.",
      ),
    );
  });
});
