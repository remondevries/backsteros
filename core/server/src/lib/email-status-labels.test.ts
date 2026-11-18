import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_STATUS_LABEL_NAMES,
  canPromoteEmailThreadWorkflowStatus,
  emailStatusLabelName,
  emailStatusLabelPatch,
  isAgentMailOutboundMessage,
  isNewerInboundMessage,
  isNewerInboundMessageId,
  migrateLegacyEmailStatus,
  shouldRetriageEmailThreadOnInbound,
} from "./email-status-labels.js";

describe("emailStatusLabelName", () => {
  it("maps statuses to Task-style folder names", () => {
    assert.equal(emailStatusLabelName("triage"), "Triage");
    assert.equal(emailStatusLabelName("concept"), "Concept");
    assert.equal(emailStatusLabelName("ready_to_start"), "Ready to Start");
    assert.equal(emailStatusLabelName("in_progress"), "In Progress");
    assert.equal(emailStatusLabelName("completed"), "Completed");
  });

  it("migrates legacy status values", () => {
    assert.equal(migrateLegacyEmailStatus("todo"), "ready_to_start");
    assert.equal(migrateLegacyEmailStatus("done"), "completed");
    assert.equal(emailStatusLabelName("todo"), "Ready to Start");
  });
});

describe("emailStatusLabelPatch", () => {
  it("adds the target status label and removes every other status label", () => {
    const patch = emailStatusLabelPatch("in_progress");
    assert.deepEqual(patch.addLabels, ["In Progress"]);
    assert.ok(!patch.removeLabels.includes("In Progress"));
    assert.equal(patch.removeLabels.length, EMAIL_STATUS_LABEL_NAMES.length - 1);
    assert.ok(patch.removeLabels.includes("Triage"));
    assert.ok(patch.removeLabels.includes("Ready to Start"));
    assert.ok(patch.removeLabels.includes("Completed"));
  });

  it("covers all known status folder names", () => {
    assert.deepEqual(
      [...EMAIL_STATUS_LABEL_NAMES].sort(),
      [
        "Backlog",
        "Canceled",
        "Completed",
        "Concept",
        "Duplicated",
        "In Progress",
        "In Review",
        "On Hold",
        "Ready to Start",
        "Triage",
        "Waiting",
      ].sort(),
    );
  });
});

describe("canPromoteEmailThreadWorkflowStatus", () => {
  it("allows in_progress from early triage statuses only", () => {
    assert.equal(canPromoteEmailThreadWorkflowStatus("triage", "in_progress"), true);
    assert.equal(
      canPromoteEmailThreadWorkflowStatus("ready_to_start", "in_progress"),
      true,
    );
    assert.equal(canPromoteEmailThreadWorkflowStatus("backlog", "in_progress"), true);
    assert.equal(
      canPromoteEmailThreadWorkflowStatus("in_review", "in_progress"),
      false,
    );
    assert.equal(
      canPromoteEmailThreadWorkflowStatus("on_hold", "in_progress"),
      false,
    );
  });

  it("allows in_review from in_progress and earlier", () => {
    assert.equal(canPromoteEmailThreadWorkflowStatus("in_progress", "in_review"), true);
    assert.equal(canPromoteEmailThreadWorkflowStatus("triage", "in_review"), true);
    assert.equal(canPromoteEmailThreadWorkflowStatus("completed", "in_review"), false);
    assert.equal(canPromoteEmailThreadWorkflowStatus("in_review", "in_review"), false);
  });
});

describe("shouldRetriageEmailThreadOnInbound", () => {
  it("skips empty and Triage", () => {
    assert.equal(shouldRetriageEmailThreadOnInbound(null), false);
    assert.equal(shouldRetriageEmailThreadOnInbound(""), false);
    assert.equal(shouldRetriageEmailThreadOnInbound("triage"), false);
  });

  it("returns true for any non-Triage status including terminal ones", () => {
    assert.equal(shouldRetriageEmailThreadOnInbound("waiting"), true);
    assert.equal(shouldRetriageEmailThreadOnInbound("in_progress"), true);
    assert.equal(shouldRetriageEmailThreadOnInbound("in_review"), true);
    assert.equal(shouldRetriageEmailThreadOnInbound("completed"), true);
    assert.equal(shouldRetriageEmailThreadOnInbound("canceled"), true);
    assert.equal(shouldRetriageEmailThreadOnInbound("concept"), true);
    assert.equal(shouldRetriageEmailThreadOnInbound("todo"), true);
  });

  it("explicitly retriages ready_to_start (OS-188 / E-599 class)", () => {
    assert.equal(shouldRetriageEmailThreadOnInbound("ready_to_start"), true);
  });
});

describe("isNewerInboundMessage", () => {
  const t1 = "2026-11-18T09:40:00.000Z";
  const t2 = "2026-11-18T09:50:00.000Z";

  it("treats empty candidates as not newer", () => {
    assert.equal(
      isNewerInboundMessage({ storedId: "msg_1", candidateId: null }),
      false,
    );
    assert.equal(
      isNewerInboundMessage({ storedId: "msg_1", candidateId: "  " }),
      false,
    );
  });

  it("never treats equal ids as newer", () => {
    assert.equal(
      isNewerInboundMessage({
        storedId: "msg_1",
        storedAt: t1,
        candidateId: "msg_1",
        candidateAt: t2,
      }),
      false,
    );
  });

  it("compares by timestamp and refuses to move the cursor backwards", () => {
    assert.equal(
      isNewerInboundMessage({
        storedId: "msg_new",
        storedAt: t2,
        candidateId: "msg_old",
        candidateAt: t1,
      }),
      false,
    );
    assert.equal(
      isNewerInboundMessage({
        storedId: "msg_old",
        storedAt: t1,
        candidateId: "msg_new",
        candidateAt: t2,
      }),
      true,
    );
  });

  it("treats an empty cursor as newer (real reply must retriage)", () => {
    assert.equal(
      isNewerInboundMessage({
        storedId: null,
        storedAt: null,
        candidateId: "msg_1",
        candidateAt: t1,
      }),
      true,
    );
  });

  it("uses migration-seeded storedAt when id is empty", () => {
    assert.equal(
      isNewerInboundMessage({
        storedId: null,
        storedAt: t2,
        candidateId: "msg_old",
        candidateAt: t1,
      }),
      false,
    );
    assert.equal(
      isNewerInboundMessage({
        storedId: null,
        storedAt: t1,
        candidateId: "msg_new",
        candidateAt: t2,
      }),
      true,
    );
  });
});

describe("isNewerInboundMessageId", () => {
  it("keeps id-only fallback for empty / equal / different", () => {
    assert.equal(isNewerInboundMessageId(null, null), false);
    assert.equal(isNewerInboundMessageId("msg_1", ""), false);
    assert.equal(isNewerInboundMessageId(null, "msg_1"), true);
    assert.equal(isNewerInboundMessageId("msg_1", "msg_1"), false);
    assert.equal(isNewerInboundMessageId("msg_1", "msg_2"), true);
  });
});

describe("isAgentMailOutboundMessage", () => {
  it("detects the sent label case-insensitively", () => {
    assert.equal(isAgentMailOutboundMessage(["unread", "sent"]), true);
    assert.equal(isAgentMailOutboundMessage(["Sent"]), true);
    assert.equal(isAgentMailOutboundMessage(["unread"]), false);
    assert.equal(isAgentMailOutboundMessage(null), false);
  });
});
