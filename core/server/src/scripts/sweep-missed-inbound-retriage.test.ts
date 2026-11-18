import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyMissedInboundRetriageHits,
  findMissedInboundRetriageCandidates,
  latestInbound,
  latestOutboundAt,
  parseSweepMissedInboundArgs,
  wouldSweepRetriageHit,
} from "./sweep-missed-inbound-retriage.js";

describe("sweep-missed-inbound-retriage", () => {
  it("parses dry-run / apply / workspace args", () => {
    assert.deepEqual(parseSweepMissedInboundArgs([]), {
      apply: false,
      workspaceId: null,
    });
    assert.deepEqual(
      parseSweepMissedInboundArgs(["--apply", "--workspace", "ws_1"]),
      { apply: true, workspaceId: "ws_1" },
    );
  });

  it("picks latest inbound and outbound by timestamp", () => {
    const messages = [
      {
        messageId: "msg_in_old",
        timestamp: "2026-11-16T10:00:00.000Z",
        labels: ["unread"],
      },
      {
        messageId: "msg_sent",
        timestamp: "2026-11-17T12:00:00.000Z",
        labels: ["sent"],
      },
      {
        messageId: "msg_in_new",
        timestamp: "2026-11-18T09:46:00.000Z",
        labels: [],
      },
    ];
    assert.equal(
      latestOutboundAt(messages),
      Date.parse("2026-11-17T12:00:00.000Z"),
    );
    assert.deepEqual(latestInbound(messages), {
      messageId: "msg_in_new",
      at: Date.parse("2026-11-18T09:46:00.000Z"),
      preview: null,
      text: null,
    });
  });

  it("lists Waiting threads with inbound newer than last outbound", async () => {
    const hits = await findMissedInboundRetriageCandidates({
      rows: [
        {
          id: "e1",
          number: 599,
          inboxId: "inbox_a",
          threadKey: "thread_hit",
          status: "waiting",
          updatedAt: "2026-11-17T12:00:00.000Z",
          lastProcessedInboundMessageId: null,
          lastProcessedInboundAt: "2026-11-10T00:00:00.000Z",
        },
        {
          id: "e2",
          number: 600,
          inboxId: "inbox_a",
          threadKey: "thread_ok",
          status: "waiting",
          updatedAt: "2026-11-17T12:00:00.000Z",
          lastProcessedInboundMessageId: null,
          lastProcessedInboundAt: "2026-11-10T00:00:00.000Z",
        },
      ],
      getThread: async (_inboxId, threadId) => {
        if (threadId === "thread_hit") {
          return {
            subject: "Need a quote",
            messages: [
              {
                messageId: "msg_sent",
                timestamp: "2026-11-17T12:00:00.000Z",
                labels: ["sent"],
              },
              {
                messageId: "msg_reply",
                timestamp: "2026-11-18T09:46:00.000Z",
                labels: ["unread"],
                preview: "Can you send the quote?",
              },
            ],
          };
        }
        return {
          subject: "All good",
          messages: [
            {
              messageId: "msg_client",
              timestamp: "2026-11-16T10:00:00.000Z",
              labels: [],
            },
            {
              messageId: "msg_sent2",
              timestamp: "2026-11-17T12:00:00.000Z",
              labels: ["sent"],
            },
          ],
        };
      },
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.displayId, "E-599");
    assert.equal(hits[0]?.subject, "Need a quote");
    assert.equal(hits[0]?.status, "waiting");
  });

  it("skips Done + client thank-you unless the real bounce rule would move it", () => {
    const thanksAt = Date.parse("2026-11-18T09:00:00.000Z");
    const sentAt = Date.parse("2026-11-17T12:00:00.000Z");
    const doneAt = "2026-11-18T10:00:00.000Z";

    // Thanks after send, but Done was set after the thanks → not a candidate.
    assert.equal(
      wouldSweepRetriageHit({
        status: "completed",
        inboundMessageId: "msg_thanks",
        inboundAt: thanksAt,
        inboundPreview: "Thanks!",
        lastOutboundAt: sentAt,
        updatedAt: doneAt,
        lastProcessedInboundMessageId: null,
        lastProcessedInboundAt: "2026-11-10T00:00:00.000Z",
      }),
      false,
    );

    // Real reply after Done (not a thank-you) still counts.
    assert.equal(
      wouldSweepRetriageHit({
        status: "completed",
        inboundMessageId: "msg_followup",
        inboundAt: Date.parse("2026-11-18T11:00:00.000Z"),
        inboundPreview: "One more question about the invoice",
        lastOutboundAt: sentAt,
        updatedAt: doneAt,
        lastProcessedInboundMessageId: null,
        lastProcessedInboundAt: "2026-11-10T00:00:00.000Z",
      }),
      true,
    );

    // Already-processed inbound is never a candidate.
    assert.equal(
      wouldSweepRetriageHit({
        status: "waiting",
        inboundMessageId: "msg_known",
        inboundAt: Date.parse("2026-11-18T09:46:00.000Z"),
        lastOutboundAt: sentAt,
        updatedAt: "2026-11-17T12:00:00.000Z",
        lastProcessedInboundMessageId: "msg_known",
        lastProcessedInboundAt: "2026-11-18T09:46:00.000Z",
      }),
      false,
    );
  });

  it("does not list Done thank-you threads as candidates", async () => {
    const hits = await findMissedInboundRetriageCandidates({
      rows: [
        {
          id: "e_thanks",
          number: 701,
          inboxId: "inbox_a",
          threadKey: "thread_thanks",
          status: "completed",
          updatedAt: "2026-11-18T10:00:00.000Z",
          lastProcessedInboundMessageId: null,
          lastProcessedInboundAt: "2026-11-10T00:00:00.000Z",
        },
      ],
      getThread: async () => ({
        subject: "Invoice paid",
        messages: [
          {
            messageId: "msg_sent",
            timestamp: "2026-11-17T12:00:00.000Z",
            labels: ["sent"],
          },
          {
            messageId: "msg_thanks",
            timestamp: "2026-11-18T09:00:00.000Z",
            labels: ["unread"],
            preview: "Thanks!",
            text: "Thanks!",
          },
        ],
      }),
    });
    assert.equal(hits.length, 0);
  });

  it("reports only threads actually moved by --apply", async () => {
    const hits = [
      {
        id: "e1",
        displayId: "E-1",
        inboxId: "inbox_a",
        threadKey: "thread_moved",
        status: "waiting",
        subject: "Moved",
        inboundMessageId: "msg_1",
        inboundAt: "2026-11-18T09:46:00.000Z",
        lastOutboundAt: "2026-11-17T12:00:00.000Z",
      },
      {
        id: "e2",
        displayId: "E-2",
        inboxId: "inbox_a",
        threadKey: "thread_noop",
        status: "waiting",
        subject: "Noop",
        inboundMessageId: "msg_2",
        inboundAt: "2026-11-18T09:46:00.000Z",
        lastOutboundAt: "2026-11-17T12:00:00.000Z",
      },
    ];
    const { changed, unchanged } = await applyMissedInboundRetriageHits({
      workspaceId: "ws_1",
      hits,
      retriage: async (_ws, _inbox, input) => {
        if (input.threadId === "thread_moved") {
          return { status: "triage" } as never;
        }
        return { status: "waiting" } as never;
      },
    });
    assert.equal(changed.length, 1);
    assert.equal(changed[0]?.id, "e1");
    assert.equal(unchanged, 1);
  });
});
