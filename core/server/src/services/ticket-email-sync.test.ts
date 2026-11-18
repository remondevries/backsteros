import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ticketEmailTimelineCommentId } from "../lib/crypto.js";
import {
  applyTicketStatusFromEmailDirection,
  formatTimelineBody,
  isAutomatedMailSkipStatus,
  resolveTicketEmailDirection,
  TICKET_INBOUND_STATUS,
  type TicketEmailMessage,
} from "./ticket-email-sync.js";

function message(
  partial: Partial<TicketEmailMessage> &
    Pick<TicketEmailMessage, "messageId" | "from">,
): TicketEmailMessage {
  return {
    threadId: "thread-1",
    subject: partial.subject ?? "",
    preview: partial.preview ?? null,
    text: partial.text ?? null,
    timestamp: partial.timestamp ?? "2026-11-09T09:00:00.000Z",
    direction: partial.direction,
    labels: partial.labels,
    headers: partial.headers,
    messageId: partial.messageId,
    from: partial.from,
  };
}

describe("OS-187 ticket email sync behaviour", () => {
  it("formats bodies and uses (empty email) only when nothing else exists", () => {
    assert.equal(
      formatTimelineBody(
        message({
          messageId: "m1",
          from: "a@b.test",
          subject: "Hi",
          text: "Body",
        }),
      ),
      "**Hi**\n\nBody",
    );
    assert.equal(
      formatTimelineBody(
        message({ messageId: "m2", from: "a@b.test", subject: "", text: null }),
      ),
      "(empty email)",
    );
  });

  it("derives a deterministic entry id from workspace + task + message id", () => {
    const a = ticketEmailTimelineCommentId("ws", "ticket-1", "msg-9");
    const b = ticketEmailTimelineCommentId("ws", "ticket-1", "msg-9");
    const otherTask = ticketEmailTimelineCommentId("ws", "ticket-2", "msg-9");
    const otherMsg = ticketEmailTimelineCommentId("ws", "ticket-1", "msg-10");
    assert.equal(a, b);
    assert.equal(a.length, 21);
    assert.notEqual(a, otherTask);
    assert.notEqual(a, otherMsg);
  });

  it("treats workspace inbox, Remon/own addresses, domains, and sent labels as outbound", () => {
    assert.equal(
      resolveTicketEmailDirection({
        from: "Remon <remon@lemo-design.nl>",
        inboxEmails: ["remon@lemo-design.nl"],
      }),
      "outbound",
    );
    assert.equal(
      resolveTicketEmailDirection({
        from: "email@remondevries.com",
        ownEmails: ["email@remondevries.com"],
      }),
      "outbound",
    );
    assert.equal(
      resolveTicketEmailDirection({
        from: "agent@backsteros.test",
        ownEmails: ["agent@backsteros.test"],
      }),
      "outbound",
    );
    assert.equal(
      resolveTicketEmailDirection({
        from: "hello@lemo-design.com",
        ownDomains: ["lemo-design.com"],
      }),
      "outbound",
    );
    assert.equal(
      resolveTicketEmailDirection({
        from: "someone@elsewhere.test",
        labels: ["sent"],
      }),
      "outbound",
    );
    assert.equal(
      resolveTicketEmailDirection({
        from: "client@pa-mu.test",
        inboxEmails: ["remon@lemo-design.nl"],
        ownDomains: ["lemo-design.nl"],
      }),
      "inbound",
    );
    assert.equal(TICKET_INBOUND_STATUS, "triage");
  });

  it("skips auto-replies and bounces for status moves", () => {
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "MAILER-DAEMON@mail.example",
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "postmaster@example.com",
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "client@pa-mu.test",
        headers: { "Auto-Submitted": "auto-replied" },
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "client@pa-mu.test",
        headers: [{ name: "X-Autoreply", value: "yes" }],
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "client@pa-mu.test",
        headers: { Precedence: "bulk" },
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "client@pa-mu.test",
        headers: { "Auto-Submitted": "no" },
      }),
      false,
    );
  });

  it("does not move status on outbound (own) mail without calling update", async () => {
    const next = await applyTicketStatusFromEmailDirection({
      workspaceId: "ws-missing",
      taskId: "task-missing",
      direction: "outbound",
      currentStatus: "waiting",
    });
    assert.equal(next, undefined);
  });
});
