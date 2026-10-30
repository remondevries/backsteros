import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAgentShellChatMessagePayload,
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
        createdAt: "2026-10-30T12:00:00.000Z",
      },
    });
  });

  it("rejects incomplete payloads", () => {
    assert.equal(parseAgentShellChatMessagePayload("{}"), null);
    assert.equal(parseAgentShellChatMessagePayload("not-json"), null);
  });
});

describe("subscribeAgentShellChatEvents", () => {
  it("delivers agent.chat.message events from the stream", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: ready\ndata: {"ok":true}\n\nevent: agent.chat.message\ndata: {"threadId":"th_1","agentId":"ag_1","message":{"id":"m_1","body":"hi","createdAt":"2026-10-30T12:00:00.000Z"}}\n\n',
          ),
        );
        controller.close();
      },
    });
    const received: string[] = [];
    const controller = new AbortController();
    await subscribeAgentShellChatEvents({
      signal: controller.signal,
      onMessage: (payload) => {
        received.push(payload.message.id);
      },
      requestStream: async () =>
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    });
    assert.deepEqual(received, ["m_1"]);
  });
});
