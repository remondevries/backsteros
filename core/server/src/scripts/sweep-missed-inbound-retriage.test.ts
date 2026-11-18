import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findMissedInboundRetriageCandidates,
  latestInbound,
  latestOutboundAt,
  parseSweepMissedInboundArgs,
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
        },
        {
          id: "e2",
          number: 600,
          inboxId: "inbox_a",
          threadKey: "thread_ok",
          status: "waiting",
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
});
