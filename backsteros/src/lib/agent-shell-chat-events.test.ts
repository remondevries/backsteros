import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAgentShellChatMessagePayload,
  parseAgentShellChatStatusPayload,
  subscribeAgentShellChatEvents,
} from "./agent-shell-chat-events.js";

describe("parseAgentShellChatMessagePayload", () => {
  it("accepts a valid payload", () => {
    const parsed = parseAgentShellChatMessagePayload(
      JSON.stringify({
        threadId: "th_1",
        agentId: "ag_1",
        message: {
          id: "m_1",
          body: "Hello",
          createdAt: "2026-10-30T12:00:00.000Z",
        },
      }),
    );
    assert.deepEqual(parsed, {
      threadId: "th_1",
      agentId: "ag_1",
      message: {
        id: "m_1",
        body: "Hello",
        fullBody: null,
        createdAt: "2026-10-30T12:00:00.000Z",
      },
    });
  });

  it("keeps the full markdown body when the server sends it", () => {
    const full = `**Hello**\n\n${"x".repeat(200)}`;
    const parsed = parseAgentShellChatMessagePayload(
      JSON.stringify({
        threadId: "th_1",
        agentId: "ag_1",
        message: {
          id: "m_1",
          body: "Hello x…",
          fullBody: full,
          createdAt: "2026-10-30T12:00:00.000Z",
        },
      }),
    );
    assert.equal(parsed?.message.fullBody, full);
    assert.equal(parsed?.message.body, "Hello x…");
  });

  it("rejects incomplete payloads", () => {
    assert.equal(parseAgentShellChatMessagePayload("{}"), null);
    assert.equal(parseAgentShellChatMessagePayload("not-json"), null);
  });
});

describe("parseAgentShellChatStatusPayload", () => {
  it("accepts working/idle payloads", () => {
    assert.deepEqual(
      parseAgentShellChatStatusPayload(
        JSON.stringify({
          threadId: "th_1",
          agentId: "ag_1",
          state: "working",
          at: "2026-10-30T12:00:00.000Z",
          pendingReplyAt: "2026-10-30T12:00:00.000Z",
          label: "  Searching inbox…  ",
        }),
      ),
      {
        threadId: "th_1",
        agentId: "ag_1",
        state: "working",
        at: "2026-10-30T12:00:00.000Z",
        pendingReplyAt: "2026-10-30T12:00:00.000Z",
        label: "Searching inbox…",
      },
    );
    assert.deepEqual(
      parseAgentShellChatStatusPayload(
        JSON.stringify({
          threadId: "th_1",
          agentId: "ag_1",
          state: "idle",
          at: "2026-10-30T12:00:00.000Z",
          pendingReplyAt: null,
          label: "ignored",
        }),
      ),
      {
        threadId: "th_1",
        agentId: "ag_1",
        state: "idle",
        at: "2026-10-30T12:00:00.000Z",
        pendingReplyAt: null,
        label: null,
      },
    );
    assert.equal(parseAgentShellChatStatusPayload("{}"), null);
  });
});

describe("subscribeAgentShellChatEvents", () => {
  it("delivers agent.chat.message and agent.chat.status events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: ready\ndata: {"ok":true}\n\nevent: agent.chat.message\ndata: {"threadId":"th_1","agentId":"ag_1","message":{"id":"m_1","body":"hi","createdAt":"2026-10-30T12:00:00.000Z"}}\n\nevent: agent.chat.status\ndata: {"threadId":"th_1","agentId":"ag_1","state":"working","at":"2026-10-30T12:00:01.000Z","pendingReplyAt":"2026-10-30T12:00:01.000Z"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const received: string[] = [];
    const statuses: string[] = [];
    const controller = new AbortController();
    await subscribeAgentShellChatEvents({
      signal: controller.signal,
      onMessage: (payload) => {
        received.push(payload.message.id);
      },
      onStatus: (payload) => {
        statuses.push(payload.state);
      },
      requestStream: async () =>
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    });
    assert.deepEqual(received, ["m_1"]);
    assert.deepEqual(statuses, ["working"]);
  });
});
